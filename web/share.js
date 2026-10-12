'use strict';
// Share codes: an archive's text (title, note, pages) as a pure-content QR code, no server involved.
// JSON → UTF-8 → deflate-raw → Base45, prefixed "DTZJ1:". Base45 fits the QR alphanumeric mode (5.5 bits per
// character), about 20% denser than base64 in byte mode. Scanning: camera (BarcodeDetector or jsQR), a photo,
// or a pasted code.
(() => {
const PREFIX='DTZJ1:',TEXT_PREFIX='DTZJ1B:',B45='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
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

// Legacy sidecar codes carried overrides as [page, offset, marking] in an optional e field.
// Keep their decoder; newly generated codes preserve overrides inline in the exact original text.
const MARK=/(^|[^\s\[])\[([^\]\d\s][^\]\s]{0,15})\]/gm,MARK_TEXT=/^[^\]\d\s\[][^\]\s\[]{0,15}$/;
function splitMarks(text){
 const marks=[];let removed=0;
 const clean=text.replace(MARK,(m,a,b,o,str)=>{const lineStart=str.lastIndexOf('\n',o)+1;if(/^\s*$/.test(str.slice(lineStart,o+a.length)))return m;marks.push([o+a.length-removed,b]);removed+=b.length+2;return a});
 return {clean,marks};
}
function joinMarks(text,marks){
 let out=text;for(const [at,mark] of [...marks].sort((x,y)=>y[0]-x[0]))out=out.slice(0,at)+'['+mark+']'+out.slice(at);return out;
}
// Inline overrides keep the compatible QR readable by existing apps. Text codes use space-free Base64url.
function b64encode(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function b64decode(s){if(!s||!/^[A-Za-z0-9_-]+$/.test(s)||s.length%4===1)throw new Error('分享码已损坏。');const text=atob(s.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(text,c=>c.charCodeAt(0))}
async function pack(data,prefix=TEXT_PREFIX){const bytes=new TextEncoder().encode(JSON.stringify(data));if(bytes.length>2*1024*1024)throw new Error('分享内容超过 2 MB。');const packed=await pipe(bytes,new CompressionStream('deflate-raw'));const code=prefix+(prefix===PREFIX?b45encode(packed):b64encode(packed));if(code.length>100000)throw new Error('分享码超过长度限制，请拆分谱子。');return code}
async function unpack(code,prefix){if(String(code||'').length>100000)throw new Error('分享码过长。');const text=String(code||'').trim(),at=text.indexOf(prefix);if(at<0)throw new Error('分享码类型不正确。');const body=text.slice(at+prefix.length),packed=prefix===PREFIX?b45decode(body.replace(/\s+/g,m=>m.includes('\n')?'':m)):b64decode(body.replace(/\s/g,''));const bytes=await SecurityLimits.readStream(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')),2*1024*1024);try{return JSON.parse(await bytes.text())}catch{throw new Error('分享码内容无法读取。')}}
function content(record){const pages=(record.results||[]).filter(r=>r.text.trim()).map(r=>[r.page,r.text]);if(!pages.length)throw new Error('这份存档还没有识别出的文字。');return {t:record.title,n:record.note||undefined,p:pages}}
async function encode(record,{text=false}={}){return pack(content(record),text?TEXT_PREFIX:PREFIX)}
async function decode(code){
 const data=await unpack(code,String(code).includes(TEXT_PREFIX)?TEXT_PREFIX:PREFIX);
 if(typeof data.t!=='string'||!Array.isArray(data.p)||!data.p.length||data.p.length>300||data.t.length>120)throw new Error('分享码内容无法读取。');
 const pages=new Set();for(const p of data.p){if(!Array.isArray(p)||!Number.isSafeInteger(p[0])||p[0]<1||pages.has(p[0])||typeof p[1]!=='string'||p[1].length>100000)throw new Error('分享码页码或文字无效。');pages.add(p[0])}
 // Markings that do not fit their page are dropped; the score itself still imports.
 const marks=new Map(),seen=new Set();
 if(Array.isArray(data.e)&&data.e.length<=20000)for(const e of data.e){
  if(!Array.isArray(e)||!pages.has(e[0])||!Number.isSafeInteger(e[1])||e[1]<0||typeof e[2]!=='string'||!MARK_TEXT.test(e[2])||seen.has(e[0]+':'+e[1]))continue;
  seen.add(e[0]+':'+e[1]);if(!marks.has(e[0]))marks.set(e[0],[]);marks.get(e[0]).push([e[1],e[2]]);
 }
 return {title:data.t,note:typeof data.n==='string'?data.n:'',pages:data.p.map(([page,text])=>({page,text:joinMarks(text,(marks.get(page)||[]).filter(([at])=>at<=text.length))}))};
}

function qrSvg(code,{level=code.length>MAX_M?'L':'M'}={}){
 let qr=null;
 if(!['M','L'].includes(level))throw new Error('无效的二维码纠错等级。');
 if(code.length>(level==='M'?MAX_M:MAX_L))return null;
 qr=qrcode(0,level);qr.addData(code,'Alphanumeric');qr.make();
 const n=qr.getModuleCount(),q=4;let d='';
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))d+=`M${c+q} ${r+q}h1v1h-1z`;
 return {svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n+2*q} ${n+2*q}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`,modules:n,level};
}

// Workers are local and bounded. Closing the sheet aborts every pending compression attempt.
function strongDeflate(bytes,{iterations,signal,timeout=2000}){
 return new Promise((resolve,reject)=>{
  let worker=null,timer=0,settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();signal?.removeEventListener('abort',abort);error?reject(error):resolve(value)};
  const abort=()=>finish(new DOMException('分享已取消','AbortError'));
  if(signal?.aborted){abort();return}
  try{worker=new Worker(new URL('share-compression-worker.js',document.baseURI));
   worker.onmessage=({data})=>{if(data.error)finish(new Error(data.error));else if(data.bytes instanceof Uint8Array)finish(null,data.bytes);else finish(new Error('压缩结果无效'))};
   worker.onerror=e=>{e.preventDefault?.();finish(new Error('压缩组件无法运行'))};
   signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(new Error('压缩计算超时')),timeout);
   const input=bytes.slice();worker.postMessage({bytes:input,iterations},[input.buffer]);
  }catch(e){finish(e)}
 });
}
function encoded(packed,prefix){const code=prefix+(prefix===PREFIX?b45encode(packed):b64encode(packed));if(code.length>100000)throw new Error('分享码超过长度限制，请拆分谱子。');return code}
function resultFor(packed,stage,initialLevel){
 const code=encoded(packed,PREFIX);let qr=qrSvg(code);
 // Do not accidentally increase density when stronger compression crosses the automatic L→M boundary.
 if(initialLevel==='L'&&qr?.level==='M'){const low=qrSvg(code,{level:'L'});if(low.modules<qr.modules)qr=low}
 return {code,shortCode:encoded(packed,TEXT_PREFIX),qr,packedBytes:packed.length,stage};
}
async function verified(packed,original){
 const blob=await SecurityLimits.readStream(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')),original.length);
 const bytes=new Uint8Array(await blob.arrayBuffer());return bytes.length===original.length&&bytes.every((v,i)=>v===original[i]);
}
async function prepare(record,{onProgress,signal,compressor=strongDeflate,budget=4000}={}){
 const bytes=new TextEncoder().encode(JSON.stringify(content(record)));if(bytes.length>2*1024*1024)throw new Error('分享内容超过 2 MB。');
 const check=()=>{if(signal?.aborted)throw new DOMException('分享已取消','AbortError')};check();
 const packed=await pipe(bytes,new CompressionStream('deflate-raw'));check();let best=resultFor(packed,'fast');
 const fastBytes=best.packedBytes,fastModules=best.qr?.modules||null,initialLevel=best.qr?.level;
 onProgress?.({stage:'fast',result:best});
 let attempted=false,fallback=false;
 if(!best.qr||best.qr.modules>121){const end=performance.now()+Math.max(0,Math.min(4000,budget));
  for(const [iterations,stage] of [[5,'strong'],[15,'maximum']]){
   check();const remaining=end-performance.now();if(remaining<100)break;attempted=true;onProgress?.({stage,result:best});
   try{const trial=await compressor(bytes,{iterations,signal,timeout:Math.min(remaining,iterations===5?2000:2500)});check();
    if(!(trial instanceof Uint8Array)||trial.length>=best.packedBytes)continue;
    if(!await verified(trial,bytes)){fallback=true;continue}check();const candidate=resultFor(trial,stage,initialLevel||best.qr?.level);
    if((candidate.qr?.modules??Infinity)<=(best.qr?.modules??Infinity))best=candidate;
   }catch(e){check();fallback=true;break}
   if(best.qr&&best.qr.modules<=121)break;
  }
 }
 return {...best,fastBytes,fastModules,attempted,fallback,savedBytes:fastBytes-best.packedBytes};
}
const $=id=>document.getElementById(id);let shareTicket=0,shareAbort=null;const shareCloseBound=new WeakSet();
async function show(record){
 shareAbort?.abort();const controller=shareAbort=new AbortController(),ticket=++shareTicket,dlg=$('shareDialog');
 let short=$('shareCopyShort');if(!short){short=document.createElement('button');short.id='shareCopyShort';short.type='button';short.textContent='复制短分享码';$('shareCopy').after(short)}
 $('shareTitle').textContent=`分享「${record.title}」`;$('shareStatus').textContent='正在生成二维码…';$('shareStatus').setAttribute('aria-live','polite');$('shareQr').replaceChildren();$('shareInfo').textContent='';
 for(const b of [$('shareCopy'),$('shareSave'),short]){b.hidden=false;b.disabled=true} $('shareSave').hidden=true;
 if(!shareCloseBound.has(dlg)){shareCloseBound.add(dlg);dlg.addEventListener('close',()=>{if(!dlg.open)shareAbort?.abort()})}if(!dlg.open)dlg.showModal?dlg.showModal():dlg.setAttribute('open','');
 const current=()=>ticket===shareTicket&&dlg.open&&!controller.signal.aborted;
 let result;
 try{result=await prepare(record,{signal:controller.signal,onProgress:({stage,result:r})=>{if(!current())return;if(r.qr)$('shareQr').innerHTML=r.qr.svg;$('shareStatus').textContent=stage==='fast'?'正在检查二维码容量…':stage==='strong'?'数据较大，正在尝试加强压缩…':'正在尝试更充分的压缩…'}})}
 catch(e){if(current()){$('shareInfo').textContent=e.message;$('shareStatus').textContent='';for(const b of [$('shareCopy'),$('shareSave'),short])b.hidden=true}return}
 if(!current())return;const {code,shortCode,qr:q}=result;
 const raw=new TextEncoder().encode(JSON.stringify(record.results.map(r=>r.text))).length;
 const marked=record.results.reduce((n,r)=>n+splitMarks(r.text).marks.length,0),erhu=marked?` 含 ${marked} 处手改的二胡标记。`:'';
 if(q){$('shareQr').innerHTML=q.svg;$('shareInfo').textContent=`${record.results.length} 页文字 · 压缩后 ${code.length} 字符（原文约 ${(raw/1024).toFixed(1)} KB）· ${q.modules}×${q.modules} 码点。用本 App「谱库 → 扫码导入」扫描。`+erhu+(q.modules>121?' 码点较密，扫描时让屏幕亮一些、镜头离近一点。':'')}
 else{$('shareQr').replaceChildren();$('shareInfo').textContent=`压缩后仍超过单张二维码容量（${code.length} 字符，最多 ${MAX_L}）。请复制分享码发送，或用「导出备份」。`+erhu}
 $('shareStatus').textContent=result.savedBytes?`已自动加强压缩，减少 ${result.savedBytes} 字节${result.fastModules&&q&&q.modules<result.fastModules?`，二维码从 ${result.fastModules}×${result.fastModules} 减至 ${q.modules}×${q.modules}`:''}。`:result.attempted?'已保留最小的有效压缩结果。':'';
 for(const b of [$('shareCopy'),$('shareSave'),short])b.disabled=false;$('shareSave').hidden=!q;
 $('shareCopy').onclick=()=>{copy(code);$('shareStatus').textContent='分享码已复制。对方在「谱库 → 扫码导入 → 粘贴分享码」导入。'};
 short.onclick=async()=>{try{await Platform.copyText(shortCode);$('shareStatus').textContent=`短分享码已复制（${shortCode.length} 字符），接收方需要支持短码的新版 App。`}catch(e){$('shareStatus').textContent=e.message}};
 $('shareSave').onclick=()=>saveQrPng(q.svg,record.title);
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
  try{const code=await detectIn(v,v.videoWidth,v.videoHeight);if(code){if(code.includes(PREFIX)||code.includes(TEXT_PREFIX))await handle(code);else $('scanStatus').textContent='扫到的不是笛调之间的分享码。'}}finally{busy=false}};
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
 $('scanPaste').onclick=async()=>{let t='';try{t=await Platform.readClipboard()}catch{}if(!t.includes(PREFIX)&&!t.includes(TEXT_PREFIX))t=prompt('粘贴分享码（以 DTZJ1: 或 DTZJ1B: 开头）：',t)||'';if(t)await handle(t)};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
window.ScoreShare={encode,decode,show,scan,qrSvg,b45encode,b45decode,splitMarks,joinMarks,pack,unpack,prepare,strongDeflate,capacity:{maxCharacters:MAX_L,maxCompressedBytes:2860,maxModules:177}};
})();
// Modified by AI on 2026-10-12 11:11:51
