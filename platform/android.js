'use strict';
(() => {
const registry=window.FlutePlatformAdapters||(window.FlutePlatformAdapters={});
const capacitor=window.Capacitor?.getPlatform?.()==='android',plugin=capacitor?window.Capacitor.Plugins.FluteNative:null;
const metadata=new Map(),TOKEN='__FLUTE_STORED_CREDENTIAL__',call=(action,...args)=>plugin.invoke({action,args}).then(r=>r.value);
const capNative=plugin?Object.fromEntries(['httpRequest','httpFetch','uploadChunk','releaseTransfer','saveTransfer','copyText','readClipboard','printScore','printScoreTitled','setImmersive','openExternal'].map(action=>[action,(...args)=>call(action,...args)])):null;
const native=()=>capNative||window.AndroidTools;
const ready=plugin?call('credentialList').then(entries=>{for(const e of entries)metadata.set(e.id,e)}):Promise.resolve();ready.catch(()=>{});
const credentials=plugin?{
 store(id,kind,url,user,secret){const old=metadata.get(id);return secret===TOKEN&&!!old&&old.kind===kind&&new URL(old.url).href===new URL(url).href&&old.user===user},
 async prepare(id,kind,url,user,secret){await ready;if(!await call('storeCredential',id,kind,url,user,secret))throw Error('凭据安全保存失败');metadata.set(id,{id,kind,url:new URL(url).href,user});return TOKEN},
 has:id=>metadata.has(id),remove:id=>!metadata.has(id),
 async removeAsync(id){await ready;if(!await call('deleteCredential',id))throw Error('凭据删除失败');metadata.delete(id)}
}:{store:(...args)=>native().storeCredential(...args),has:key=>native().hasCredential(key),remove:key=>native().deleteCredential(key)};
const pending=new Map(),id=prefix=>prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
window.__nativeFetchDone=(key,status,headers,error)=>{const p=pending.get(key);if(!p)return;pending.delete(key);error?p.reject(new Error(error)):p.resolve({status,headers:JSON.parse(headers||'{}')})};
window.__nativeHttpDone=(key,status,body)=>{const p=pending.get(key);if(!p)return;pending.delete(key);status?p.resolve({status,body}):p.reject(new Error(body||'网络请求失败'))};
function wait(key,ms){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(key);Promise.resolve(native().releaseTransfer?.(key)).catch(()=>{});reject(new Error('网络请求超时'))},ms);pending.set(key,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);Promise.resolve(native().releaseTransfer?.(key)).catch(()=>{});reject(error)}})})}
function dispatch(key,ms,operation){const done=wait(key,ms);Promise.resolve().then(operation).catch(error=>{const p=pending.get(key);if(p){pending.delete(key);p.reject(error)}});return done}
async function upload(key,blob){for(let at=0;at<blob.size;at+=768*1024){const bytes=new Uint8Array(await blob.slice(at,at+768*1024).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));if(!await native().uploadChunk(key,btoa(text)))throw new Error('文件缓存失败，请检查文件大小与存储空间')}if(!blob.size)await native().uploadChunk(key,'')}
async function request(method,url,headers={},body=null,options={}){
 await ready;const key=id('t');
 if(options.model){const res=await dispatch(key,250000,()=>native().httpRequest(key,method,url,JSON.stringify(headers),body?.text||''));return {status:res.status,headers:{},text:async()=>res.body,blob:async()=>new Blob([res.body])}}
 try{if(body?.blob)await upload(key,body.blob);const res=await dispatch(key,200000,()=>native().httpFetch(key,method,url,JSON.stringify(headers),body?.blob?'upload':body?.text!=null?'text':'none',body?.text||''));let cached;
 const load=async()=>{if(!cached){try{cached=await (await fetch(new URL(`/transfer/${key}.down`,location.href))).blob()}finally{await native().releaseTransfer(key)}}return cached};
 if(res.status>=300||['PUT','MKCOL','DELETE'].includes(method))await load();
 return {status:res.status,headers:res.headers,blob:load,text:async()=>{const b=await load();if(b.size>(options.textLimit||25*1024*1024))throw new Error('文字响应超过大小限制');return b.text()}};
 }catch(e){await native().releaseTransfer(key);throw e}
}
async function saveBlob(blob,name,mime){const key=id('save');try{await upload(key,blob);await native().saveTransfer(key,name,mime||blob.type||'application/octet-stream');return true}catch(e){await native().releaseTransfer(key);throw e}}
registry.android={kind:'android',available:()=>!!native(),ready,request,saveBlob,copyText:async text=>{await native().copyText(text);return true},readClipboard:async()=>(await native().readClipboard())||'',printScore:async title=>title&&native().printScoreTitled?native().printScoreTitled(String(title)):native().printScore(),setImmersive:async on=>native().setImmersive(on),openExternal:async url=>{if(native().openExternal)native().openExternal(url);else location.href=url},
 credentials};
})();
// Modified by AI on 2026-10-12 15:29:00
