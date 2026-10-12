const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),zlib=require('node:zlib'),{Transform}=require('node:stream');
class Deflate{constructor(){return Transform.toWeb(zlib.createDeflateRaw())}}class Inflate{constructor(){return Transform.toWeb(zlib.createInflateRaw())}}
const c=vm.createContext({window:{},document:{readyState:'loading',addEventListener(){},baseURI:'https://local.test/'},Uint8Array,TextEncoder,TextDecoder,Blob,Response,CompressionStream:Deflate,DecompressionStream:Inflate,performance,DOMException,URL,btoa,atob,setTimeout,clearTimeout});
for(const f of ['security-limits.js','vendor/qrcode-generator.js','share.js']){vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);Object.assign(c,c.window)}
const S=c.ScoreShare;
let pending;const worker=vm.createContext({Uint8Array,WebAssembly,TextDecoder,TextEncoder,atob,btoa,console,setTimeout,clearTimeout});worker.self=worker;worker.location={href:'https://local.test/share-compression-worker.js'};worker.postMessage=data=>pending(data);worker.importScripts=name=>vm.runInContext(fs.readFileSync('web/'+name,'utf8'),worker);vm.runInContext(fs.readFileSync('web/share-compression-worker.js','utf8'),worker);
async function strong(bytes,{iterations}){return new Promise((ok,no)=>{pending=data=>data.error?no(Error(data.error)):ok(data.bytes);worker.onmessage({data:{bytes,iterations}})})}
function exercise(n){let seed=1234;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed};return '@title 自动分享测试\n@key 1=D\n@time 4/4\n'+Array.from({length:n},()=>Array.from({length:8},()=>{const v=random();return (1+v%7)+(v%5===0?"'":'')+(v%4===0?'[外二⊓]':'')+'/'}).join(' ')+' |').join('\n')}
(async()=>{
 const small={title:'小谱',results:[{page:1,text:'1 2 3 5 |'}]};let calls=0;
 const fast=await S.prepare(small,{compressor:()=>{calls++;throw Error('must not load')}});assert.equal(calls,0);assert.equal(fast.stage,'fast');assert.ok(fast.qr.modules<=121);
 const record={title:'大谱',note:'测试备注',results:[{page:1,text:exercise(180)}]},progress=[];
 const initial=await S.encode(record),qr=S.qrSvg(initial);assert.ok(!qr||qr.modules>121);
 const result=await S.prepare(record,{compressor:strong,onProgress:x=>progress.push(x.stage)});assert.ok(result.attempted);assert.ok(result.packedBytes<=result.fastBytes);assert.ok((result.qr?.modules??Infinity)<=(qr?.modules??Infinity));assert.ok(result.savedBytes>0,'real Zopfli improves this generated large score');
 const decoded=await S.decode(result.code);assert.equal(decoded.pages[0].text,record.results[0].text);assert.equal(decoded.note,record.note);assert.equal((await S.decode(result.shortCode)).pages[0].text,record.results[0].text);
 const bytes=S.b45decode(result.code.slice(6));assert.deepEqual(JSON.parse(zlib.inflateRawSync(bytes)),{t:record.title,n:record.note,p:[[1,record.results[0].text]]},'the original old-format decoder can read stronger compression');
 const broken=await S.prepare(record,{compressor:async()=>new Uint8Array([0])});assert.equal(broken.stage,'fast');assert.equal(broken.code,initial);assert.equal(broken.fallback,true);
 const bigger=await S.prepare(record,{compressor:async b=>new Uint8Array(b.length+100)});assert.equal(bigger.code,initial,'never replace with a larger result');
 const failed=await S.prepare(record,{compressor:async()=>{throw Error('worker unavailable')}});assert.equal(failed.code,initial);assert.equal(failed.fallback,true);
 assert.equal(S.qrSvg('A'.repeat(4296)).modules,177);assert.equal(S.qrSvg('A'.repeat(4297)),null);assert.equal(S.qrSvg('A'.repeat(3392),{level:'M'}),null);assert.equal(S.capacity.maxCompressedBytes,2860);
 const raw=new TextEncoder().encode(JSON.stringify({t:'large',p:[[1,exercise(500)]]})),stream=await strong(raw,{iterations:5});assert.equal(zlib.inflateRawSync(stream).toString(),new TextDecoder().decode(raw));
 // Worker timeout and cancellation terminate their thread and keep the UI free.
 let terminations=0;
 c.Worker=class{postMessage(){}terminate(){terminations++}};
 await assert.rejects(S.strongDeflate(raw,{iterations:5,timeout:5}),/超时/);assert.equal(terminations,1);
 const controller=new AbortController(),running=S.strongDeflate(raw,{iterations:5,signal:controller.signal,timeout:1000});controller.abort();await assert.rejects(running,{name:'AbortError'});assert.equal(terminations,2);
 await assert.rejects(S.prepare(record,{signal:controller.signal,compressor:strong}),{name:'AbortError'});
 // Near the M/L boundary, smaller compressed data must not turn into a denser QR by upgrading ECC.
 const near={title:'容量边界',results:[{page:1,text:exercise(260)}]},boundary=await S.prepare(near,{compressor:strong});assert.ok((boundary.qr?.modules??Infinity)<=(boundary.fastModules??Infinity));assert.equal(S.qrSvg(await S.encode(near)).level,'L');assert.ok(boundary.code.length<=3391,'fixture crosses L→M length boundary');
 const overflow={title:'超长档',results:[{page:1,text:exercise(340)}]};assert.equal(S.qrSvg(await S.encode(overflow)),null);const rescued=await S.prepare(overflow,{compressor:strong});assert.ok(rescued.qr,'stronger compression brings an overflowing score into one QR');assert.equal((await S.decode(rescued.code)).pages[0].text,overflow.results[0].text);
 console.log('PASS: adaptive fast/5/15-iteration compression, real WASM, byte-exact source/fingering roundtrip, old-reader compatibility, QR capacity/ECC monotonicity, bad/larger/unavailable fallback and worker timeout/cancel.',{bytes:[result.fastBytes,result.packedBytes],modules:[qr?.modules,result.qr?.modules],stages:progress});
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-12 11:10:36
