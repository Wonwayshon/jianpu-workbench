'use strict';
(() => {
async function readStream(stream,maxBytes,timeout=30000){
 const reader=stream.getReader(),chunks=[];let size=0,timer;
 const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new Error('处理超时，请拆分文件后重试。'));reader.cancel().catch(()=>{})},timeout)});
 try{for(;;){const item=await Promise.race([reader.read(),expired]);if(item.done)break;size+=item.value.byteLength;if(size>maxBytes)throw new Error('解压或下载内容超过安全大小限制。');chunks.push(item.value)}return new Blob(chunks)}
 finally{clearTimeout(timer);reader.cancel().catch(()=>{})}
}
async function bitmap(blob){if(blob.size>80*1024*1024)throw new Error('图片超过 80 MB');const img=await createImageBitmap(blob,{resizeWidth:1800,resizeQuality:'medium'});if(img.width*img.height>16000000||img.height>16000){img.close();throw new Error('图片尺寸过大，请缩小或裁切后导入。')}return img}
async function timed(promise,onTimeout,ms=30000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{try{onTimeout?.()}finally{reject(new Error('处理超时，请拆分文件后重试。'))}},ms)})])}finally{clearTimeout(timer)}}
window.SecurityLimits={readStream,bitmap,timed};
})();
// Modified by AI on 2026-10-08 10:06:28
