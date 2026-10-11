'use strict';
(() => {
const registry=window.FlutePlatformAdapters||(window.FlutePlatformAdapters={}),invoke=(cmd,args)=>window.__TAURI_INTERNALS__.invoke(cmd,args),metadata=new Map(),TOKEN='__FLUTE_STORED_CREDENTIAL__';
// The page title becomes the suggested PDF file name; restore it once printing is over.
const withTitle=async(title,fn)=>{const old=document.title;if(title)document.title=String(title).slice(0,80);const restore=()=>{document.title=old};addEventListener('afterprint',restore,{once:true});setTimeout(restore,120000);return fn()};
const available=()=>!!window.__TAURI_INTERNALS__;
const ready=available()?invoke('credential_list').then(entries=>{for(const e of entries)metadata.set(e.id,e)}):Promise.resolve();ready.catch(()=>{});
const urlOf=url=>new URL(url).href;
const credentials={
 store(id,kind,url,user,secret){const old=metadata.get(id);return secret===TOKEN&&!!old&&old.kind===kind&&old.url===urlOf(url)&&old.user===user},
 async prepare(id,kind,url,user,secret){await ready;const item=await invoke('credential_store',{id,kind,url,user,secret});metadata.set(id,item);return TOKEN},
 has:id=>metadata.has(id),
 remove:id=>!metadata.has(id),
 async removeAsync(id){await ready;await invoke('credential_remove',{id});metadata.delete(id);return true}
};
async function toBase64(blob){const bytes=new Uint8Array(await blob.arrayBuffer());let bin='';for(let at=0;at<bytes.length;at+=32768)bin+=String.fromCharCode(...bytes.subarray(at,at+32768));return btoa(bin)}
async function request(method,url,headers={},body=null,options={}){
 await ready;
 const res=await invoke('http_request',{method,url,headers,bodyText:body?.text??null,bodyBase64:body?.blob?await toBase64(body.blob):null,maxBytes:options.maxBytes||300*1024*1024});
 const bytes=Uint8Array.from(atob(res.body),c=>c.charCodeAt(0)),blob=new Blob([bytes]);
 return {status:res.status,headers:res.headers,blob:async()=>blob,text:async()=>{if(blob.size>(options.textLimit||25*1024*1024))throw new Error('文字响应过大');return blob.text()}};
}
registry.desktop={kind:'desktop',available,ready,credentials,request,
 saveBlob:async(blob,name)=>invoke('save_file',{name,data:await toBase64(blob)}),copyText:async text=>{await invoke('copy_text',{text});return true},readClipboard:()=>invoke('read_clipboard'),printScore:title=>withTitle(title,()=>invoke('print_score')),setImmersive:on=>invoke('set_immersive',{on}),openExternal:url=>invoke('open_external',{url})};
})();
// Modified by AI on 2026-10-11 12:29:53
