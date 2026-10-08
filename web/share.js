'use strict';
// Share codes: an archive's text (title, note, pages) as a pure-content QR code, no server involved.
// JSON → UTF-8 → deflate-raw → Base45, prefixed "DTZJ1:". Base45 fits the QR alphanumeric mode (5.5 bits per
// character), about 20% denser than base64 in byte mode. Scanning: camera (BarcodeDetector or jsQR), a photo,
// or a pasted code.
(() => {
const PREFIX='DTZJ1:',B45='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
// Capacity of QR version 40 in alphanumeric mode at error correction L / M.
const MAX_L=4296,MAX_M=3391;

function b45encode(bytes){
 let out='';
 for(let i=0;i<bytes.length;i+=2){
  if(i+1<bytes.length){let x=bytes[i]*256+bytes[i+1];const e=x%45;x=(x-e)/45;const d=x%45;out+=B45[e]+B45[d]+B45[(x-d)/45]}
  else{const x=bytes[i];out+=B45[x%45]+B45[Math.floor(x/45)]}
 }
 return out;
}
function b45decode(str){
 const v=[...str].map(c=>{const i=B45.indexOf(c);if(i<0)throw new Error('分享码里有无效字符。');return i}),out=[];
 for(let i=0;i<v.length;i+=3){
  if(i+2<v.length){const x=v[i]+v[i+1]*45+v[i+2]*2025;if(x>65535)throw new Error('分享码已损坏。');out.push(x>>8,x&255)}
  else if(i+1<v.length){const x=v[i]+v[i+1]*45;if(x>255)throw new Error('分享码已损坏。');out.push(x)}
  else throw new Error('分享码不完整。');
 }
 return new Uint8Array(out);
}
async function pipe(bytes,stream){return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())}

// Only the text travels: title, note and each page's transcription (original files are too large for a QR code).
async function encode(record){
 const pages=(record.results||[]).filter(r=>r.text.trim()).map(r=>[r.page,r.text]);
 if(!pages.length)throw new Error('这份存档还没有识别出的文字，二维码只能分享文字内容；原文件请用「导出备份」发送。');
 const json=JSON.stringify({t:record.title,n:record.note||undefined,p:pages});
 const packed=await pipe(new TextEncoder().encode(json),new CompressionStream('deflate-raw'));
 return PREFIX+b45encode(packed);
}
async function decode(code){
 if(String(code||'').length>100000)throw new Error('分享码过长。');
 const text=String(code||'').trim().replace(/\s+/g,m=>m.includes('\n')?'':m);
 const at=text.indexOf(PREFIX);if(at<0)throw new Error('这不是笛调之间的分享码。');
 const packed=b45decode(text.slice(at+PREFIX.length));const bytes=new Uint8Array(await (await SecurityLimits.readStream(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')),2*1024*1024)).arrayBuffer());
 let data;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Error('分享码内容无法读取。')}
 if(typeof data.t!=='string'||!Array.isArray(data.p)||!data.p.length||data.p.length>300||data.t.length>120)throw new Error('分享码内容无法读取。');
 const pages=new Set();for(const p of data.p){if(!Array.isArray(p)||!Number.isSafeInteger(p[0])||p[0]<1||pages.has(p[0])||typeof p[1]!=='string'||p[1].length>100000)throw new Error('分享码页码或文字无效。');pages.add(p[0])}
 return {title:data.t,note:typeof data.n==='string'?data.n:'',pages:data.p.filter(p=>Array.isArray(p)&&Number.isSafeInteger(p[0])&&typeof p[1]==='string').map(([page,text])=>({page,text}))};
}

function qrSvg(code){
 let qr=null,level='M';
 if(code.length>MAX_L)return null;
 if(code.length>MAX_M)level='L';
 qr=qrcode(0,level);qr.addData(code,'Alphanumeric');qr.make();
 const n=qr.getModuleCount(),q=4;let d='';
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))d+=`M${c+q} ${r+q}h1v1h-1z`;
 return {svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n+2*q} ${n+2*q}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`,modules:n,level};
}

const $=id=>document.getElementById(id);
async function show(record){
 const dlg=$('shareDialog');$('shareTitle').textContent=`分享「${record.title}」`;$('shareStatus').textContent='';$('shareQr').replaceChildren();
 let code;try{code=await encode(record)}catch(e){$('shareInfo').textContent=e.message;$('shareCopy').hidden=true;$('shareSave').hidden=true;dlg.showModal();return}
 const q=qrSvg(code);$('shareCopy').hidden=false;$('shareSave').hidden=!q;
 const raw=new TextEncoder().encode(JSON.stringify(record.results.map(r=>r.text))).length;
 if(q){$('shareQr').innerHTML=q.svg;$('shareInfo').textContent=`${record.results.length} 页文字 · 压缩后 ${code.length} 字符（原文约 ${(raw/1024).toFixed(1)} KB）· ${q.modules}×${q.modules} 码点。用本 App「谱库 → 扫码导入」扫描。`+(q.modules>121?' 码点较密，扫描时让屏幕亮一些、镜头离近一点。':'')}
 else $('shareInfo').textContent=`内容太长（压缩后 ${code.length} 字符，二维码最多约 ${MAX_L}），放不进一个二维码。可以复制分享码用聊天软件发送，或用「导出备份」。`;
 $('shareCopy').onclick=()=>{copy(code);$('shareStatus').textContent='分享码已复制。对方在「谱库 → 扫码导入 → 粘贴分享码」导入。'};
 $('shareSave').onclick=()=>saveQrPng(q.svg,record.title);
 dlg.showModal?dlg.showModal():dlg.setAttribute('open','');
}
function copy(text){Platform.copyText(text).catch(()=>{})}
async function saveQrPng(svg,title){
 const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();
 const size=1200,c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(img,0,0,size,size);
 const blob=await new Promise(r=>c.toBlob(r,'image/png'));await ScoreLibrary.saveBlob(blob,`${title}-分享码.png`,'image/png');
 $('shareStatus').textContent='二维码图片已生成，请选择保存位置。';
}

// ---------- scanning ----------
let stream=null,raf=0,jsqrLoad=null,detector=null;
function loadJsQR(){return jsqrLoad||(jsqrLoad=new Promise((ok,no)=>{if(window.jsQR)return ok();const s=document.createElement('script');s.src='vendor/jsQR.js';s.onload=ok;s.onerror=()=>no(new Error('扫码组件加载失败。'));document.head.append(s)}))}
async function detectIn(source,w,h){
 if(detector===null){try{detector='BarcodeDetector' in window&&(await BarcodeDetector.getSupportedFormats()).includes('qr_code')?new BarcodeDetector({formats:['qr_code']}):false}catch{detector=false}}
 if(detector){try{const r=await detector.detect(source);if(r[0]?.rawValue)return r[0].rawValue}catch{}}
 await loadJsQR();
 const c=detectIn.canvas||(detectIn.canvas=document.createElement('canvas')),scale=Math.min(1,1600/Math.max(w,h));
 c.width=Math.round(w*scale);c.height=Math.round(h*scale);const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(source,0,0,c.width,c.height);
 const r=jsQR(g.getImageData(0,0,c.width,c.height).data,c.width,c.height,{inversionAttempts:'dontInvert'});return r?.data||null;
}
let onCode=null;
async function handle(text){
 try{const data=await decode(text);stopCamera();$('scanDialog').close();await onCode(data)}
 catch(e){$('scanStatus').textContent=e.message;$('scanStatus').classList.add('error')}
}
function stopCamera(){cancelAnimationFrame(raf);raf=0;if(stream){for(const t of stream.getTracks())t.stop();stream=null}$('scanVideo').srcObject=null}
async function startCamera(){
 $('scanStatus').classList.remove('error');$('scanStatus').textContent='正在打开相机…';
 try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}},audio:false})}
 catch{$('scanStatus').textContent='无法打开相机：可以改用「从图片识别」或「粘贴分享码」。';$('scanStatus').classList.add('error');return}
 const v=$('scanVideo');v.srcObject=stream;await v.play().catch(()=>{});$('scanStatus').textContent='把二维码放进取景框内。';
 let busy=false,last=0;
 const loop=async t=>{if(!stream)return;raf=requestAnimationFrame(loop);if(busy||t-last<180||!v.videoWidth)return;busy=true;last=t;
  try{const code=await detectIn(v,v.videoWidth,v.videoHeight);if(code){if(code.includes(PREFIX))await handle(code);else $('scanStatus').textContent='扫到的不是笛调之间的分享码。'}}finally{busy=false}};
 raf=requestAnimationFrame(loop);
}
function scan(callback){
 onCode=callback;const dlg=$('scanDialog');$('scanStatus').textContent='';
 dlg.showModal?dlg.showModal():dlg.setAttribute('open','');dlg.onclose=stopCamera;startCamera();
}
function bind(){
 $('scanPhoto').onchange=async()=>{const f=$('scanPhoto').files[0];$('scanPhoto').value='';if(!f)return;$('scanStatus').classList.remove('error');$('scanStatus').textContent='正在识别图片…';
  try{const bmp=await createImageBitmap(f),code=await detectIn(bmp,bmp.width,bmp.height);bmp.close?.();if(!code)throw new Error('图片里没有找到二维码。请拍清楚一些、让二维码占画面大部分。');await handle(code)}
  catch(e){$('scanStatus').textContent=e.message;$('scanStatus').classList.add('error')}};
 $('scanPaste').onclick=async()=>{let t='';try{t=await Platform.readClipboard()}catch{}if(!t.includes(PREFIX))t=prompt('粘贴分享码（以 DTZJ1: 开头）：',t)||'';if(t)await handle(t)};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
window.ScoreShare={encode,decode,show,scan,qrSvg,b45encode,b45decode};
})();
// Modified by AI on 2026-10-08 10:06:28
