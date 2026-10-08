'use strict';
(() => {
const registry=window.FlutePlatformAdapters||(window.FlutePlatformAdapters={}),native=()=>window.AndroidTools;
const pending=new Map(),id=prefix=>prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
window.__nativeFetchDone=(key,status,headers,error)=>{const p=pending.get(key);if(!p)return;pending.delete(key);error?p.reject(new Error(error)):p.resolve({status,headers:JSON.parse(headers||'{}')})};
window.__nativeHttpDone=(key,status,body)=>{const p=pending.get(key);if(!p)return;pending.delete(key);status?p.resolve({status,body}):p.reject(new Error(body||'网络请求失败'))};
function wait(key,ms){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(key);native().releaseTransfer?.(key);reject(new Error('网络请求超时'))},ms);pending.set(key,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);native().releaseTransfer?.(key);reject(error)}})})}
async function upload(key,blob){for(let at=0;at<blob.size;at+=768*1024){const bytes=new Uint8Array(await blob.slice(at,at+768*1024).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));if(!native().uploadChunk(key,btoa(text)))throw new Error('文件缓存失败，请检查文件大小与存储空间')}if(!blob.size)native().uploadChunk(key,'')}
async function request(method,url,headers={},body=null,options={}){
 const key=id('t');
 if(options.model){const done=wait(key,250000);native().httpRequest(key,method,url,JSON.stringify(headers),body?.text||'');const res=await done;return {status:res.status,headers:{},text:async()=>res.body,blob:async()=>new Blob([res.body])}}
 try{if(body?.blob)await upload(key,body.blob);const done=wait(key,200000);native().httpFetch(key,method,url,JSON.stringify(headers),body?.blob?'upload':body?.text!=null?'text':'none',body?.text||'');const res=await done;let cached;
 const load=async()=>{if(!cached){try{cached=await (await fetch(new URL(`/transfer/${key}.down`,location.href))).blob()}finally{native().releaseTransfer(key)}}return cached};
 if(res.status>=300||['PUT','MKCOL','DELETE'].includes(method))await load();
 return {status:res.status,headers:res.headers,blob:load,text:async()=>{const b=await load();if(b.size>(options.textLimit||25*1024*1024))throw new Error('文字响应超过大小限制');return b.text()}};
 }catch(e){native().releaseTransfer(key);throw e}
}
async function saveBlob(blob,name,mime){const key=id('save');try{await upload(key,blob);native().saveTransfer(key,name,mime||blob.type||'application/octet-stream');return true}catch(e){native().releaseTransfer(key);throw e}}
registry.android={kind:'android',available:()=>!!native(),ready:Promise.resolve(),request,saveBlob,copyText:async text=>{native().copyText(text);return true},readClipboard:async()=>native().readClipboard()||'',printScore:async()=>native().printScore(),setImmersive:async on=>native().setImmersive(on),openExternal:registry.browser.openExternal,
 credentials:{store:(...args)=>native().storeCredential(...args),has:key=>native().hasCredential(key),remove:key=>native().deleteCredential(key)}};
})();
// Modified by AI on 2026-10-08 10:06:28
