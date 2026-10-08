'use strict';
// Score library storage: records (text results + settings) and original files in IndexedDB, zip backups,
// and WebDAV sync. Deleted records stay as tombstones ({id, deleted:true, updatedAt}) so deletions sync.
(() => {
let dbPromise=null,recoveryClock=0;
const recoveryTime=()=>new Date(recoveryClock=Math.max(Date.now(),recoveryClock+1)).toISOString();
function db(){
 if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open('flute-key-lab-scores',3);
  request.onupgradeneeded=()=>{const d=request.result;if(!d.objectStoreNames.contains('scores'))d.createObjectStore('scores',{keyPath:'id'});if(!d.objectStoreNames.contains('files'))d.createObjectStore('files',{keyPath:'id'});if(!d.objectStoreNames.contains('recovery'))d.createObjectStore('recovery',{keyPath:'id'})};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(new Error('存档库被其他窗口占用，请关闭其他窗口后重试。'));
 }).catch(error=>{dbPromise=null;throw error});
 return dbPromise;
}
async function op(storeName,mode,callback){
 const d=await db();
 return new Promise((resolve,reject)=>{
  const tx=d.transaction(storeName,mode),request=callback(tx.objectStore(storeName));let value;
  if(request)request.onsuccess=()=>{value=request.result};
  tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||new Error('存档操作失败'));tx.onabort=()=>reject(tx.error||new Error('存档操作中断'));
 });
}
const allRaw=()=>op('scores','readonly',s=>s.getAll());
async function records(){return (await allRaw()).filter(r=>!r.deleted).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
// Snapshot and replacement share one transaction: a failed write cannot discard the previous version.
async function putRecord(r,reason='覆盖前版本'){
 const d=await db();return new Promise((resolve,reject)=>{
  const tx=d.transaction(['scores','recovery'],'readwrite'),scores=tx.objectStore('scores'),history=tx.objectStore('recovery'),request=scores.get(r.id);
  request.onsuccess=()=>{const old=request.result;if(old&&!old.deleted&&JSON.stringify(old)!==JSON.stringify(r)){history.put({id:newFileId(),at:recoveryTime(),reason:r.deleted?'删除前版本':reason,record:old});const all=history.getAll();all.onsuccess=()=>{const entries=all.result.sort((a,b)=>b.at.localeCompare(a.at)),counts=new Map();entries.forEach((e,i)=>{const n=(counts.get(e.record.id)||0)+1;counts.set(e.record.id,n);if(i>=100||n>3)history.delete(e.id)})}}scores.put(r)};
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('存档保存失败'));tx.onabort=()=>reject(tx.error||new Error('存档保存中断'));
 });
}
async function keepRecovery(record,reason){if(!record||record.deleted)return;await op('recovery','readwrite',store=>{store.put({id:newFileId(),at:recoveryTime(),reason,record});const all=store.getAll();all.onsuccess=()=>{const counts=new Map();all.result.sort((a,b)=>b.at.localeCompare(a.at)).forEach((e,i)=>{const n=(counts.get(e.record.id)||0)+1;counts.set(e.record.id,n);if(i>=100||n>3)store.delete(e.id)})};return null})}
async function recovery(){return (await op('recovery','readonly',s=>s.getAll())).sort((a,b)=>b.at.localeCompare(a.at))}
async function restoreRecovery(id){const item=await op('recovery','readonly',s=>s.get(id));if(!item)throw new Error('恢复记录已不存在');const now=new Date().toISOString(),r={...item.record,id:'score-restored-'+newFileId().slice(5),title:item.record.title+' · 恢复副本',createdAt:now,updatedAt:now};await putRecord(r);return r}
async function clearRecovery(){
 const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction(['scores','recovery','files'],'readwrite'),hist=tx.objectStore('recovery'),files=tx.objectStore('files'),req=tx.objectStore('scores').getAll();hist.clear();req.onsuccess=()=>{const keep=new Set(req.result.filter(r=>!r.deleted).map(r=>r.fileId)),cursor=files.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(!keep.has(c.key))c.delete();c.continue()}}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
}
const getRecord=id=>op('scores','readonly',s=>s.get(id));
const putFile=f=>op('files','readwrite',s=>s.put(f));
const getFile=id=>op('files','readonly',s=>s.get(id));
const deleteFile=id=>op('files','readwrite',s=>s.delete(id));
async function removeRecord(id){
 const r=await getRecord(id);if(!r)return;
 // Original files remain available to recovery snapshots. Explicit cleanup removes only unreferenced files.
 await putRecord({id,deleted:true,updatedAt:new Date().toISOString()});
}
function newFileId(){return 'file-'+Date.now().toString(36)+'-'+Array.from(crypto.getRandomValues(new Uint8Array(6)),v=>v.toString(16).padStart(2,'0')).join('')}
function extOf(name,type){const m=/\.([A-Za-z0-9]{1,5})$/.exec(name||'');if(m)return m[1].toLowerCase();return {'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[type]||'bin'}

// Platform operations share one interface; records and backup formats stay in the web core.
const request=(...args)=>Platform.request(...args);
const saveBlob=(...args)=>Platform.saveBlob(...args);

// ---------- zip (store on write; store or deflate on read) ----------
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=CRC[(c^bytes[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
async function makeZip(entries){
 const parts=[],central=[];let offset=0;const enc=new TextEncoder();
 for(const e of entries){
  const data=e.blob?new Uint8Array(await e.blob.arrayBuffer()):enc.encode(e.text),name=enc.encode(e.name),crc=crc32(data);
  const local=new DataView(new ArrayBuffer(30));
  local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);local.setUint16(6,0x0800,true);local.setUint32(14,crc,true);local.setUint32(18,data.length,true);local.setUint32(22,data.length,true);local.setUint16(26,name.length,true);
  parts.push(local,name,data);
  const c=new DataView(new ArrayBuffer(46));
  c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
  central.push(c,name);offset+=30+name.length+data.length;
 }
 const size=central.reduce((n,p)=>n+p.byteLength,0),end=new DataView(new ArrayBuffer(22));
 end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);end.setUint32(12,size,true);end.setUint32(16,offset,true);
 return new Blob([...parts,...central,end],{type:'application/zip'});
}
async function readZip(blob){
 if(blob.size>300*1024*1024)throw new Error('ZIP 超过 300 MB，请拆分后导入。');
 const buf=new Uint8Array(await blob.arrayBuffer()),view=new DataView(buf.buffer),dec=new TextDecoder();
 const within=(p,n)=>{if(!Number.isSafeInteger(p)||p<0||p+n>buf.length)throw new Error('ZIP 目录越界或文件不完整。')};
 let eocd=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break}
 if(eocd<0)throw new Error('不是有效的 ZIP 文件。');
 const count=view.getUint16(eocd+10,true);let p=view.getUint32(eocd+16,true);const out=[],names=new Set();let total=0;
 if(count>2000||view.getUint16(eocd+4,true)||view.getUint16(eocd+6,true))throw new Error('ZIP 条目过多或为分卷文件。');
 const directoryEnd=p+view.getUint32(eocd+12,true);if(directoryEnd>eocd)throw new Error('ZIP 目录损坏。');
 for(let n=0;n<count;n++){
  within(p,46);if(view.getUint32(p,true)!==0x02014b50)throw new Error('ZIP 目录损坏。');
  const flags=view.getUint16(p+8,true),method=view.getUint16(p+10,true),crc=view.getUint32(p+16,true),csize=view.getUint32(p+20,true),usize=view.getUint32(p+24,true),nlen=view.getUint16(p+28,true),xlen=view.getUint16(p+30,true),clen=view.getUint16(p+32,true),lofs=view.getUint32(p+42,true);
  within(p,46+nlen+xlen+clen);const name=dec.decode(buf.subarray(p+46,p+46+nlen));p+=46+nlen+xlen+clen;if(p>directoryEnd)throw new Error('ZIP 目录损坏。');
  if(!name||name.length>300||name.startsWith('/')||name.includes('\\')||name.includes(':')||name.split('/').includes('..')||/[\x00-\x1f]/.test(name)||names.has(name))throw new Error('ZIP 包含不安全或重复的路径。');names.add(name);
  if(flags&1)throw new Error('不支持加密 ZIP。');
  if(usize>80*1024*1024||(total+=usize)>300*1024*1024)throw new Error('ZIP 解压后过大（单项 80 MB、总计 300 MB）。');
  if(name.endsWith('/'))continue;
  within(lofs,30);if(view.getUint32(lofs,true)!==0x04034b50)throw new Error('ZIP 文件头损坏。');
  const ln=view.getUint16(lofs+26,true),lx=view.getUint16(lofs+28,true),start=lofs+30+ln+lx;within(lofs,30+ln+lx);within(start,csize);
  if(start+csize>view.getUint32(eocd+16,true)||dec.decode(buf.subarray(lofs+30,lofs+30+ln))!==name||view.getUint16(lofs+8,true)!==method)throw new Error('ZIP 条目不一致。');
  const raw=buf.subarray(start,start+csize);let data;
  if(method===0)data=new Blob([raw]);else if(method===8){if(!('DecompressionStream' in window))throw new Error('请更新系统 WebView 后重试。');data=await SecurityLimits.readStream(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')),Math.min(usize,80*1024*1024))}else throw new Error('不支持的 ZIP 压缩方式。');
  if(data.size!==usize||crc32(new Uint8Array(await data.arrayBuffer()))!==crc)throw new Error('ZIP 内容校验失败。');
  out.push({name,blob:data});
 }
 return out;
}

// Zip backup: library.json (records) + files/<fileId>.<ext> originals.
async function exportZip(){
 const list=await records(),entries=[],seen=new Set();
 for(const r of list)if(r.fileId&&!seen.has(r.fileId)){seen.add(r.fileId);const f=await getFile(r.fileId);if(f)entries.push({name:`files/${r.fileId}.${extOf(f.name,f.type)}`,blob:f.blob})}
 entries.unshift({name:'library.json',text:JSON.stringify({format:'flute-key-lab-library',version:2,exportedAt:new Date().toISOString(),records:list},null,1)});
 const zip=await makeZip(entries);if(zip.size>300*1024*1024)throw new Error('备份超过 300 MB，请先导出部分原文件并整理谱库。');return zip;
}
// Returns {records:[...], files:Map(fileId -> blob)} from a zip backup.
async function readBackupZip(blob){
 const items=await readZip(blob),index=items.find(i=>i.name==='library.json');
 if(!index)throw new Error('zip 里没有 library.json，不是本工具导出的备份。');
 if(index.blob.size>25*1024*1024)throw new Error('备份清单超过 25 MB。');const data=JSON.parse(await index.blob.text());
 if(data.format!=='flute-key-lab-library'||!Array.isArray(data.records)||data.records.length>500)throw new Error('备份格式不正确。');
 const files=new Map();for(const i of items){const m=/^files\/(file-[\w-]+)\.\w+$/.exec(i.name);if(m)files.set(m[1],i.blob)}
 return {records:data.records,files};
}

// ---------- WebDAV sync ----------
const DAV_STORE='flute.webdav.v1';
function davConfig(){const empty={url:'',user:'',pass:'',folder:'笛调之间',lastSync:''};try{const c={...empty,...JSON.parse(localStorage.getItem(DAV_STORE)||'{}')};if(window.SecureCredentials&&c.pass&&c.pass!==SecureCredentials.TOKEN){if(!saveDavConfig(c))return {...c,pass:'',storageError:'旧密码安全迁移未完成，请重新填写并保存。'};c.pass=SecureCredentials.TOKEN}return c}catch{return empty}}
function saveDavConfig(c){try{const next={...c};if(window.SecureCredentials)next.pass=SecureCredentials.protect('webdav','basic',c.url,c.user,c.pass);localStorage.setItem(DAV_STORE,JSON.stringify(next));return true}catch{return false}}
async function saveDavConfigAsync(c){try{const next={...c};if(window.SecureCredentials&&next.pass)next.pass=await SecureCredentials.prepare('webdav','basic',c.url,c.user,c.pass);return saveDavConfig(next)}catch{return false}}
function davBase(c){
 if(!/^https:\/\//i.test(c.url.trim()))throw new Error('服务器地址需要以 https:// 开头。');
 const root=c.url.trim().replace(/\/+$/,'')+'/',folder=c.folder.trim().replace(/^\/+|\/+$/g,'');
 return root+(folder?folder.split('/').map(encodeURIComponent).join('/')+'/':'');
}
async function davHeaders(c,extra={},url=c.url){if(window.SecureCredentials)return {...await SecureCredentials.requestHeaders('webdav',c.pass,'basic',c.user,url),...extra};const token=btoa(String.fromCharCode(...new TextEncoder().encode(`${c.user}:${c.pass}`)));return {Authorization:'Basic '+token,...extra}}
async function dav(c,method,path,body,extra){
 const res=await request(method,davBase(c)+path,await davHeaders(c,extra,davBase(c)+path),body);
 if(res.status===401||res.status===403)throw new Error('WebDAV 用户名或密码不对（坚果云等需要使用「应用密码」）。');
 return res;
}
async function ensureDir(c,path){const res=await dav(c,'MKCOL',path);if(![200,201,301,405].includes(res.status)&&!(res.status===409&&!path))throw new Error(`无法创建文件夹 ${path||'（根）'}：HTTP ${res.status}`)}
async function ensureFolders(c){
 // Create each level of the configured folder, then the two data folders.
 const parts=c.folder.trim().replace(/^\/+|\/+$/g,'').split('/').filter(Boolean),root={...c,folder:''};let acc='';
 for(const p of parts){acc+=encodeURIComponent(p)+'/';await ensureDir(root,acc)}
 await ensureDir(c,'records/');await ensureDir(c,'files/');
}
async function testDav(c){const res=await dav({...c,folder:''},'PROPFIND','',{text:'<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>'},{Depth:'0','Content-Type':'application/xml'});if(res.status!==207&&res.status!==200)throw new Error(`服务器返回 HTTP ${res.status}，请检查地址。`);await ensureFolders(c);return true}

async function preserveRemote(c,id,r){if(!r||r.deleted)return;const prior=await dav(c,'GET',`records/${encodeURIComponent(id)}.json`);if(prior.status!==200)throw new Error('无法备份远端存档，请稍后重试同步');{const raw=JSON.parse(await prior.text());if(raw.id!==id)throw new Error('远端存档标识不一致');const previous=window.PdfWorkbenchCore.checkedRecord(raw);if(previous.fileId&&r.file&&!(await getFile(previous.fileId))){const oldFile=await dav(c,'GET','files/'+encodeURIComponent(r.file));if(oldFile.status!==200)throw new Error('无法备份远端原文件，请稍后重试同步');const blob=await oldFile.blob();if(blob.size>80*1024*1024)throw new Error('远端原文件超过 80 MB');await putFile({id:previous.fileId,blob,name:previous.fileName,type:previous.fileType,size:blob.size})}await keepRecovery(previous,'同步覆盖的远端副本')}}
// Two-way sync by updatedAt. Remote layout: manifest.json, records/<id>.json, files/<fileId>.<ext>.
async function sync(progress=()=>{}){
 const c=davConfig();if(!c.url||!c.user)throw new Error('请先填写并保存 WebDAV 设置。');
 progress('连接服务器');await ensureFolders(c);
 const mres=await dav(c,'GET','manifest.json');let manifest={format:'flute-key-lab-sync',version:1,records:{}};
 if(mres.status===200){try{manifest=JSON.parse(await mres.text());if(manifest.format!=='flute-key-lab-sync'||!manifest.records||Array.isArray(manifest.records)||typeof manifest.records!=='object'||Object.keys(manifest.records).length>1000)throw new Error('清单格式无效');for(const [id,r] of Object.entries(manifest.records))if(!/^[\w-]{1,100}$/.test(id)||!r||!Number.isFinite(Date.parse(r.updatedAt))||(r.file&&!/^file-[\w-]+\.[A-Za-z0-9]{1,5}$/.test(r.file)))throw new Error('远端存档标识无效')}catch{throw new Error('远端 manifest.json 已损坏，请在服务器上检查。')}}
 else if(mres.status!==404)throw new Error(`读取远端清单失败：HTTP ${mres.status}`);
 const local=new Map((await allRaw()).map(r=>[r.id,r])),ids=new Set([...local.keys(),...Object.keys(manifest.records)]);
 let up=0,down=0,removed=0,n=0;
 for(const id of ids){
  n++;progress(`同步 ${n}/${ids.size}`);
  const l=local.get(id),r=manifest.records[id];
  if(l&&(!r||l.updatedAt>r.updatedAt)){
   await preserveRemote(c,id,r);
   if(l.deleted){if(r&&!r.deleted){await dav(c,'DELETE',`records/${encodeURIComponent(id)}.json`)}manifest.records[id]={updatedAt:l.updatedAt,deleted:true};removed++;continue}
   let file=null;
   if(l.fileId){const f=await getFile(l.fileId);if(f){file=`${l.fileId}.${extOf(f.name,f.type)}`;if(r?.file!==file){const res=await dav(c,'PUT','files/'+encodeURIComponent(file),{blob:f.blob},{'Content-Type':f.type||'application/octet-stream'});if(res.status>=300)throw new Error(`上传文件失败：HTTP ${res.status}`)}}}

   const res=await dav(c,'PUT',`records/${encodeURIComponent(id)}.json`,{text:JSON.stringify(l)},{'Content-Type':'application/json; charset=utf-8'});
   if(res.status>=300)throw new Error(`上传存档失败：HTTP ${res.status}`);
   manifest.records[id]={updatedAt:l.updatedAt,title:l.title,file};up++;
  }else if(r&&(!l||r.updatedAt>l.updatedAt)){
   if(r.deleted){if(l&&!l.deleted){await putRecord({id,deleted:true,updatedAt:r.updatedAt});removed++}continue}
   const res=await dav(c,'GET',`records/${encodeURIComponent(id)}.json`);if(res.status!==200)throw new Error(`下载存档失败：HTTP ${res.status}`);
   const raw=JSON.parse(await res.text());if(raw.id!==id||raw.deleted)throw new Error('远端存档标识不一致');const record=window.PdfWorkbenchCore.checkedRecord(raw);if(record.fileSize>80*1024*1024)throw new Error('远端原文件超过 80 MB');
   if(r.file&&record.fileId&&!(await getFile(record.fileId))){
    const fres=await dav(c,'GET','files/'+encodeURIComponent(r.file));
    if(fres.status===200){const blob=await fres.blob();if(blob.size>80*1024*1024)throw new Error('远端原文件超过 80 MB');await putFile({id:record.fileId,blob,name:record.fileName||r.file,type:record.fileType||blob.type,size:blob.size})}
   }
   // Retain old originals until recovery is explicitly cleared.
   await putRecord(record);down++;
  }
 }
 progress('更新远端清单');
 manifest.updatedAt=new Date().toISOString();
 const res=await dav(c,'PUT','manifest.json',{text:JSON.stringify(manifest)},{'Content-Type':'application/json; charset=utf-8',...(mres.headers?.etag?{'If-Match':mres.headers.etag}:mres.status===404?{'If-None-Match':'*'}:{})});
 if(res.status>=300)throw new Error(`更新远端清单失败：HTTP ${res.status}`);
 c.lastSync=new Date().toISOString();saveDavConfig(c);
 return {up,down,removed};
}

window.ScoreLibrary={recovery,restoreRecovery,clearRecovery,readZip,records,getRecord,putRecord,removeRecord,putFile,getFile,deleteFile,newFileId,extOf,saveBlob,exportZip,readBackupZip,davConfig,saveDavConfig,saveDavConfigAsync,testDav,sync};
})();
// Modified by AI on 2026-10-08 10:06:28
