const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{indexedDB,IDBObjectStore:FDBObjectStore}=require('fake-indexeddb'),zlib=require('node:zlib'),{Transform}=require('node:stream');
class Inflate {constructor(){return Transform.toWeb(zlib.createInflateRaw())}}
class Deflate {constructor(){return Transform.toWeb(zlib.createDeflateRaw())}}
const c=vm.createContext({window:{DecompressionStream:Inflate},document:{readyState:'loading',addEventListener(){}},indexedDB,Blob,TextEncoder,TextDecoder,URL,crypto:require('node:crypto').webcrypto,DecompressionStream:Inflate,CompressionStream:Deflate,Response,setTimeout,clearTimeout,console});
for(const name of ['security-limits','library','share']){vm.runInContext(fs.readFileSync('web/'+name+'.js','utf8'),c);Object.assign(c,c.window)}
const L=c.ScoreLibrary,S=c.ScoreShare,Limits=c.SecurityLimits;
const record=(id='score-a',title='旧版')=>({id,title,fileId:'file-original',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',results:[{page:1,text:'1 2 3 4'}]});
async function seedV2(){await new Promise((ok,no)=>{const req=indexedDB.open('flute-key-lab-scores',2);req.onupgradeneeded=()=>{req.result.createObjectStore('scores',{keyPath:'id'}).put(record());req.result.createObjectStore('files',{keyPath:'id'}).put({id:'file-original',blob:new Blob(['original']),name:'original.pdf',type:'application/pdf'})};req.onsuccess=()=>{req.result.close();ok()};req.onerror=no})}
(async()=>{
 await seedV2();assert.equal((await L.records())[0].title,'旧版');assert.equal(await (await L.getFile('file-original')).blob.text(),'original');
 for(let i=1;i<=5;i++){await L.putRecord({...record(),title:'版本'+i})}
 assert.equal((await L.recovery()).length,3);assert.equal((await L.recovery())[0].record.title,'版本4');
 const put=FDBObjectStore.prototype.put;FDBObjectStore.prototype.put=function(value,...args){const request=put.call(this,value,...args);if(this.name==='scores'&&value.title==='rollback')this.transaction.abort();return request};
 await assert.rejects(L.putRecord({...record(),title:'rollback'}));FDBObjectStore.prototype.put=put;assert.equal((await L.getRecord('score-a')).title,'版本5');assert.equal((await L.recovery())[0].record.title,'版本4');
 await L.removeRecord('score-a');assert.equal((await L.records()).length,0);assert.ok(await L.getFile('file-original'));const restored=await L.restoreRecovery((await L.recovery())[0].id);assert.notEqual(restored.id,'score-a');assert.ok(restored.title.includes('恢复副本'));assert.equal((await L.getRecord('score-a')).deleted,true);
 await L.restoreRecovery((await L.recovery())[0].id);const backup=await L.exportZip(),items=await L.readZip(backup);assert.equal(items.filter(i=>i.name.startsWith('files/')).length,1);
 await L.putFile({id:'file-orphan',blob:new Blob(['orphan'])});await L.clearRecovery();assert.equal((await L.recovery()).length,0);assert.ok(await L.getFile('file-original'));assert.equal(await L.getFile('file-orphan'),undefined);
 for(const r of await L.records())await L.removeRecord(r.id);await L.clearRecovery();assert.equal(await L.getFile('file-original'),undefined);
 const original=new Uint8Array(await backup.arrayBuffer()),find=bytes=>{for(let i=0;i<original.length-3;i++)if(bytes.every((v,j)=>original[i+j]===v))return i;throw Error('signature missing')},central=find([80,75,1,2]);
 const badSize=original.slice();new DataView(badSize.buffer).setUint32(central+24,90*1024*1024,true);await assert.rejects(L.readZip(new Blob([badSize])),/过大/);
 const badCRC=original.slice();badCRC[central+16]^=255;await assert.rejects(L.readZip(new Blob([badCRC])),/校验/);
 const badPath=original.slice();badPath.set(new TextEncoder().encode('../'),central+46);await assert.rejects(L.readZip(new Blob([badPath])),/路径/);
 await assert.rejects(L.readZip(new Blob([original.subarray(0,40)])),/有效/);
 const qr=data=>'DTZJ1:'+S.b45encode(zlib.deflateRawSync(Buffer.from(JSON.stringify(data))));assert.equal((await S.decode(qr({t:'谱',p:[[1,'1 2 3 4']]}))).pages[0].text,'1 2 3 4');await assert.rejects(S.decode(qr({t:'谱',p:[[1,'1'],[1,'2']]})),/页码/);await assert.rejects(S.decode(qr({t:'谱',p:[[1,'1'.repeat(3*1024*1024)]]})),/限制/);
 // Hand-edited erhu markings ride in an optional field; the page text stays plain Jianpu for older versions.
 const marked="1=D\n[笛] 3[外二⊓] 5. 6[↓一]/ |\n[胡] 1 2 3[V] 5 |";const sp=S.splitMarks(marked);
 assert.equal(sp.clean,"1=D\n[笛] 3 5. 6/ |\n[胡] 1 2 3 5 |",'part labels stay, markings leave the text');assert.equal(S.joinMarks(sp.clean,sp.marks),marked,'markings return to the same notes');
 const shared=await S.encode({title:'谱',results:[{page:1,text:marked},{page:2,text:'1 2[外] 3'}]}),raw=JSON.parse(zlib.inflateRawSync(Buffer.from(S.b45decode(shared.slice(6)))).toString());
 assert.equal(raw.p[0][1],sp.clean,'old versions read only the clean page text');assert.equal(raw.e.length,4);
 assert.equal(JSON.stringify((await S.decode(shared)).pages.map(p=>p.text)),JSON.stringify([marked,'1 2[外] 3']),'new versions restore every marking');
 assert.equal((await S.decode(qr({t:'谱',p:[[1,'1 2 3']],e:[[1,3,'外'],[9,0,'外'],[1,99,'外'],[1,1,'1'],[1,1,'a]b'],'x']}))).pages[0].text,'1 2[外] 3','bad markings are dropped, the score still imports');
 assert.equal(JSON.parse(zlib.inflateRawSync(Buffer.from(S.b45decode((await S.encode({title:'谱',results:[{page:1,text:'1 2 3'}]})).slice(6)))).toString()).e,undefined,'no field without markings');
 await assert.rejects(Limits.readStream(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(11));controller.close()}}),10),/限制/);
 await assert.rejects(Limits.readStream(new ReadableStream({}),10,5),/超时/);
 console.log('PASS: IndexedDB v2 migration, 3-version retention, atomic rollback, delete/restore copies, shared-file backup, safe cleanup, ZIP corruption/path/size rejection, QR decompression/page checks and stream timeout.');
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-11 15:33:49
