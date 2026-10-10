'use strict';
// The seven selected instrument models render in a worker and share a bounded cache.
// The steady reference signal is separate and is used only by the tuner.
(() => {
const TAU=Math.PI*2;
let seed=22222;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2147483648-1};
const MODELS={
 flute:{gain:.34,reverb:.18,faust:true},erhu:{gain:.23,reverb:.18,glide:.09,faust:true},
 yangqin:{gain:.3,reverb:.18,faust:true},guzheng:{gain:.4,reverb:.18,faust:true},
 piano:{gain:.36,reverb:.18,faust:true},oboe:{gain:.26,reverb:.18,faust:true},
 clarinet:{gain:.3,reverb:.18,faust:true},
 reference:{gain:.4,reverb:.08,attack:.03,release:.18},
};
function renderReference(m,midi,dur,sr){
 const f=440*2**((midi-69)/12),out=new Float32Array(Math.ceil((dur+m.release)*sr));
 const harmonics=[1,.4,.18,.08,.04];
 for(let i=0;i<out.length;i++){
  const t=i/sr,env=Math.sin(Math.PI/2*Math.min(1,t/m.attack))*Math.max(0,t>dur?1-(t-dur)/m.release:1);let value=0;
  for(let k=1;k<=harmonics.length;k++)if(f*k<sr*.45)value+=harmonics[k-1]*Math.sin(TAU*f*k*t)/(1+(f*k/3000)**2);
  out[i]=value*env;
 }
 return out;
}
function peakNormalize(buf,target=.9){let p=0;for(let i=0;i<buf.length;i++)p=Math.max(p,Math.abs(buf[i]));if(p>0){const k=target/p;for(let i=0;i<buf.length;i++)buf[i]*=k}return buf}

const cache=new Map(),pending=new Map();let cacheBytes=0,worker=null,workerFailed=false,jobId=0;const jobs=new Map(),CACHE_LIMIT=24*1024*1024;
function store(key,data,sr){
 const buf=new AudioBuffer({length:data.length,sampleRate:sr,numberOfChannels:1});buf.copyToChannel(peakNormalize(data),0);
 if(cache.has(key))cacheBytes-=cache.get(key).length*4;cache.set(key,buf);cacheBytes+=buf.length*4;
 while(cache.size>1&&(cache.size>500||cacheBytes>CACHE_LIMIT)){const first=cache.keys().next().value;cacheBytes-=cache.get(first).length*4;cache.delete(first)}
 return buf;
}
function request(timbre,midi,dur,sr,fromMidi,grace=false){
 const base=MODELS[timbre]||MODELS.flute,q=grace||base.faust?Math.max(.002,Math.round(dur*1000)/1000):Math.max(.05,Math.round(dur*16)/16);
 const m=grace?{...base,attack:Math.min(base.attack||.006,.006,q/4),release:Math.min(base.release||.008,.008,q/4)}:base;
 const glide=!grace&&base.glide&&fromMidi!=null&&fromMidi!==midi?fromMidi:null;
 return {key:`${timbre}|${midi}|${q}|${sr}|${glide??''}|${grace?'grace':'normal'}`,base,m,q,glide};
}
function renderJob(r){
 if(workerFailed||typeof Worker==='undefined')return new Promise((resolve,reject)=>setTimeout(()=>{try{resolve(window.FaustEngine.render(r.timbre,r.midi,r.dur,r.sr,r.fromMidi,{grace:r.grace}))}catch(e){reject(e)}},0));
 if(!worker){try{
  worker=new Worker(window.FaustWorkerURL||new URL('faust-worker.js?v='+window.FaustBank.digest.slice(0,12)+'-'+(document.querySelector('meta[name="app-version"]')?.content||'preview'),document.baseURI));
  worker.onmessage=({data:r})=>{const job=jobs.get(r.id);if(!job)return;jobs.delete(r.id);r.error?job.reject(Error(r.error)):job.resolve(r.data)};
  worker.onerror=()=>{workerFailed=true;worker.terminate();worker=null;for(const job of jobs.values())job.reject(Error('音色生成失败'));jobs.clear()};
 }catch{workerFailed=true;return renderJob(r)}}
 return new Promise((resolve,reject)=>{const id=++jobId;jobs.set(id,{resolve,reject});worker.postMessage({...r,id})});
}
function prewarm(notes){
 const promises=[];
 for(const n of notes){if(!MODELS[n.timbre]?.faust||!window.FaustEngine?.available)continue;
  const r=request(n.timbre,n.midi,n.dur,n.sr,n.fromMidi,n.grace);if(cache.has(r.key))continue;
  if(!pending.has(r.key)){
   const promise=renderJob({...n,dur:r.q,fromMidi:r.glide}).catch(()=>window.FaustEngine.render(n.timbre,n.midi,r.q,n.sr,r.glide,{grace:n.grace})).then(data=>store(r.key,data,n.sr)).finally(()=>pending.delete(r.key));
   pending.set(r.key,promise);
  }
  promises.push(pending.get(r.key));
 }
 return Promise.all(promises);
}
// Returns an AudioBuffer for the note (cached unless it glides from a previous pitch).
function note(timbre,midi,dur,sr,fromMidi,{grace=false}={}){
 const {key,base,m,q,glide}=request(timbre,midi,dur,sr,fromMidi,grace);
 let buf=cache.get(key);if(buf){cache.delete(key);cache.set(key,buf);return buf}
 if(base.faust&&window.FaustEngine?.available)return store(key,window.FaustEngine.render(timbre,midi,q,sr,glide,{grace}),sr);

 if(base.faust)throw Error(window.FaustEngine?.error||'音色未能加载，请重新打开应用。');
 return store(key,renderReference(m,midi,q,sr),sr);
}
// A small generated room: decaying stereo noise with a few early reflections.
function impulse(ctx,seconds=1.8){
 const sr=ctx.sampleRate,n=Math.floor(sr*seconds),b=ctx.createBuffer(2,n,sr);
 for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<n;i++){const t=i/sr;d[i]=rnd()*Math.pow(1-t/seconds,2.2)*Math.exp(-t*2.2)}
  for(const [at,g] of [[.011,.5],[.019,.38],[.027,.3],[.041,.22]]){const i=Math.floor((at+c*.003)*sr);if(i<n)d[i]+=g}}
 return b;
}
window.Synth={note,impulse,MODELS,prewarm,cacheInfo:()=>({bytes:cacheBytes,entries:cache.size,pending:pending.size,background:!!worker})};
})();
// Modified by AI on 2026-10-10 15:12:04
