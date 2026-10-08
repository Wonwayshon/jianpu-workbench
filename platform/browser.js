'use strict';
(() => {
const registry=window.FlutePlatformAdapters||(window.FlutePlatformAdapters={});
async function request(method,url,headers={},body=null,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),options.timeout||200000);
 try{
  const res=await fetch(url,{method,headers,body:body?.blob??body?.text,signal:controller.signal});
  const blob=res.body?await SecurityLimits.readStream(res.body,options.maxBytes||300*1024*1024,options.timeout||180000):new Blob([]),all={};res.headers.forEach((v,k)=>all[k]=v);
  return {status:res.status,headers:all,blob:async()=>blob,text:async()=>{if(blob.size>(options.textLimit||25*1024*1024))throw new Error('文字响应过大');return blob.text()}};
 }finally{clearTimeout(timer)}
}
async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch{}
 const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();let ok=false;try{ok=document.execCommand('copy')}finally{area.remove()}return ok;
}
async function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);return true}
registry.browser={kind:'browser',available:()=>true,ready:Promise.resolve(),request,copyText,readClipboard:()=>navigator.clipboard.readText(),saveBlob,printScore:async()=>window.print(),setImmersive:async()=>{},openExternal:async url=>window.open(url,'_blank','noopener')};
})();
// Modified by AI on 2026-10-08 10:06:28
