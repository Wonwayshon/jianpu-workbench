'use strict';
// Offline note synthesis for playback. Each note is rendered to a sample buffer by a small model of the instrument:
//  - winds / bowed (flute, dizi, ocarina, clarinet, erhu, organ): register-aware wavetable, onset pitch scoop or
//    glide, delayed vibrato with coupled tremolo, slow pitch drift, band-passed breath / bow noise, attack chiff,
//    optional membrane buzz and body resonances;
//  - struck / plucked (piano, guzheng): additive partials with string inharmonicity, per-partial decay, hammer or
//    pluck-position spectrum, two slightly detuned strings (piano), damper on release.
// Buffers are cached by (timbre, pitch, length); the player renders just ahead of time.
(() => {
const TAU=Math.PI*2;
let seed=22222;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2147483648-1};

// RBJ biquad (bandpass / highpass / lowpass / peaking).
function biquad(type,f,q,sr,gainDb=0){
 const w=TAU*Math.min(f,sr*0.45)/sr,cw=Math.cos(w),sw=Math.sin(w),al=sw/(2*q),A=Math.pow(10,gainDb/40);
 let b0,b1,b2,a0,a1,a2;
 if(type==='bandpass'){b0=al;b1=0;b2=-al;a0=1+al;a1=-2*cw;a2=1-al}
 else if(type==='highpass'){b0=(1+cw)/2;b1=-(1+cw);b2=(1+cw)/2;a0=1+al;a1=-2*cw;a2=1-al}
 else if(type==='lowpass'){b0=(1-cw)/2;b1=1-cw;b2=(1-cw)/2;a0=1+al;a1=-2*cw;a2=1-al}
 else{b0=1+al*A;b1=-2*cw;b2=1-al*A;a0=1+al/A;a1=-2*cw;a2=1-al/A}
 const f0=b0/a0,f1=b1/a0,f2=b2/a0,g1=a1/a0,g2=a2/a0;let x1=0,x2=0,y1=0,y2=0;
 return x=>{const y=f0*x+f1*x1+f2*x2-g1*y1-g2*y2;x2=x1;x1=x;y2=y1;y1=y;return y};
}
function wavetable(harm,size=2048){
 const t=new Float32Array(size+1);let peak=0;
 for(let i=0;i<=size;i++){let v=0;const x=TAU*i/size;for(let n=0;n<harm.length;n++)if(harm[n])v+=harm[n]*Math.sin((n+1)*x);t[i]=v;peak=Math.max(peak,Math.abs(v))}
 for(let i=0;i<=size;i++)t[i]/=peak||1;return t;
}
const smooth=x=>x<=0?0:x>=1?1:x*x*(3-2*x);

const MODELS={
 flute:{kind:'wind',harm:[1,.42,.16,.07,.035,.015],bright:2600,attack:.06,release:.09,scoop:28,vibRate:5.1,vibDepth:.0045,vibDelay:.22,tremolo:.09,jitter:1,breath:.075,breathMul:2.2,breathQ:1.1,chiff:.28,chiffLen:.035,gain:.34,reverb:.22},
 dizi:{kind:'wind',harm:[1,.7,.5,.34,.24,.16,.11,.07,.05],bright:4200,attack:.04,release:.08,scoop:35,vibRate:5.6,vibDepth:.008,vibDelay:.16,tremolo:.12,jitter:1.4,breath:.1,breathMul:2.6,breathQ:.9,chiff:.32,chiffLen:.03,buzz:.22,gain:.26,reverb:.2},
 ocarina:{kind:'wind',harm:[1,.06,.02],bright:2000,attack:.07,release:.1,scoop:15,vibRate:4.8,vibDepth:.003,vibDelay:.3,tremolo:.05,jitter:.7,breath:.045,breathMul:1.6,breathQ:1.4,chiff:.12,chiffLen:.03,gain:.4,reverb:.25},
 clarinet:{kind:'wind',harm:[1,.03,.62,.04,.4,.03,.24,.02,.14,.01,.08],bright:3000,attack:.045,release:.08,scoop:8,vibRate:5,vibDepth:.0012,vibDelay:.4,tremolo:.02,jitter:.6,breath:.03,breathMul:3,breathQ:1.2,chiff:.1,chiffLen:.02,body:[['peaking',1500,1.2,5],['peaking',3200,1.5,3]],gain:.3,reverb:.2},
 erhu:{kind:'wind',harm:[1,.78,.62,.5,.42,.34,.28,.22,.18,.14,.11,.09,.07,.05],bright:3600,attack:.1,release:.12,scoop:40,glide:.09,vibRate:6.1,vibDepth:.014,vibDelay:.16,tremolo:.14,jitter:1.8,harmJitter:.18,breath:.035,breathMul:4,breathQ:.7,chiff:.1,chiffLen:.05,body:[['peaking',480,1.6,7],['peaking',1150,2,4],['peaking',2800,1.4,-3]],gain:.23,reverb:.24},
 // Steady reference tone for tuning: no vibrato, drift, breath or chiff.
 reference:{kind:'wind',harm:[1,.4,.18,.08,.04],bright:3000,attack:.03,release:.18,scoop:0,vibRate:5,vibDepth:0,vibDelay:1,tremolo:0,jitter:0,breath:0,breathMul:2,breathQ:1,chiff:0,chiffLen:.01,gain:.4,reverb:.08},
 organ:{kind:'wind',harm:[1,.75,.2,.5,0,.18,0,.3],bright:6000,attack:.012,release:.05,scoop:0,vibRate:6.8,vibDepth:.0009,vibDelay:0,tremolo:.02,jitter:.2,breath:.01,breathMul:3,breathQ:1,chiff:.35,chiffLen:.012,gain:.24,reverb:.3},
 piano:{kind:'strike',B:.00032,count:18,tauLow:3.2,tauHigh:.55,tauK:.22,pos:.13,hammer:.35,strings:2,detune:.00045,release:.14,gain:.36,reverb:.22},
 yangqin:{kind:'strike',B:.00008,count:18,tauLow:2.2,tauHigh:.7,tauK:.3,pos:.18,hammer:.4,strings:2,detune:.0006,release:.16,ring:.12,gain:.3,reverb:.2},
 guzheng:{kind:'strike',B:.00008,count:16,tauLow:1.9,tauHigh:.45,tauK:.35,pos:.22,hammer:.18,strings:1,detune:0,release:.25,ring:.35,gain:.4,reverb:.26},
};

for(const [id,p] of Object.entries(window.FaustEngine?.presets||{}))MODELS[id]={...MODELS[p.base],gain:MODELS[p.base].gain,reverb:.18,faust:true};

function renderWind(m,f,dur,sr,from){
 const n=Math.ceil((dur+m.release)*sr),out=new Float32Array(n);
 // Upper harmonics fade with pitch so high notes are not shrill.
 const harm=m.harm.map((a,i)=>a/(1+Math.pow((i+1)*f/m.bright,2)));
 const tab=wavetable(harm),size=tab.length-1;
 const breathF=biquad('bandpass',f*m.breathMul,m.breathQ,sr),chiffF=biquad('highpass',2200,.7,sr),body=(m.body||[]).map(([t,fr,q,g])=>biquad(t,fr,q,sr,g));
 let ph=Math.random(),lfo=Math.random()*TAU,drift=0,hj=0;
 const rate=m.vibRate*(1+.06*rnd()),glide=from&&m.glide?from:null;
 for(let i=0;i<n;i++){
  const t=i/sr;
  let env=Math.sin(Math.PI/2*Math.min(1,t/m.attack));if(t>dur)env*=Math.max(0,1-(t-dur)/m.release);
  let fr=f;
  if(glide){const g=smooth(t/m.glide);fr=glide+(f-glide)*g}
  else if(m.scoop)fr*=Math.pow(2,-m.scoop*Math.max(0,1-t/.07)/1200);
  const vd=m.vibDepth*smooth((t-m.vibDelay)/.35),v=Math.sin(lfo);lfo+=TAU*rate/sr;
  drift+=(rnd()*.0015-drift)*.0008;fr*=1+vd*v+drift*m.jitter*.001;
  ph+=fr/sr;ph-=Math.floor(ph);
  const x=ph*size,k=x|0;let s=tab[k]+(tab[k+1]-tab[k])*(x-k);
  if(m.harmJitter){hj+=(rnd()-hj)*.02;s*=1+m.harmJitter*hj}
  if(m.buzz)s+=m.buzz*(Math.tanh(5*s)-s);
  const trem=m.vibDepth?1+m.tremolo*(vd/m.vibDepth)*v:1;
  let noise=breathF(rnd())*m.breath*(0.7+0.3*env);
  if(t<m.chiffLen)noise+=chiffF(rnd())*m.chiff*(1-t/m.chiffLen);
  let y=(s*trem+noise)*env;for(const b of body)y=b(y);
  out[i]=y;
 }
 return out;
}
function renderStrike(m,f,dur,sr){
 const lowness=Math.max(0,Math.min(1,(1000-f)/900)),tau0=m.tauHigh+(m.tauLow-m.tauHigh)*lowness;
 const ring=m.ring||0,n=Math.ceil(Math.min(dur+ring+m.release,tau0*4+.2)*sr),out=new Float32Array(n);
 const parts=[];
 for(let s=0;s<m.strings;s++){const det=1+(s?m.detune:0);
  for(let k=1;k<=m.count;k++){const fk=f*det*k*Math.sqrt(1+m.B*k*k);if(fk>sr*.45)break;
   const amp=Math.abs(Math.sin(Math.PI*k*m.pos))/Math.pow(k,1.05)*(1/(1+Math.pow(fk/(4500+2500*m.hammer),2)))/m.strings;
   const tau=tau0/(1+m.tauK*(k-1)),w=TAU*fk/sr,phi=Math.random()*TAU;
   parts.push({c:2*Math.cos(w),y1:Math.sin(phi-w),y2:Math.sin(phi-2*w),a:amp,d:Math.exp(-1/(tau*sr))})}}
 const hammer=biquad('lowpass',1800+3000*m.hammer,.8,sr),release=dur+ring;
 for(let i=0;i<n;i++){
  const t=i/sr;let y=0;
  for(const p of parts){const v=p.c*p.y1-p.y2;p.y2=p.y1;p.y1=v;y+=v*p.a;p.a*=p.d}
  if(t<.005)y*=t/.005;
  if(t<.012)y+=hammer(rnd())*m.hammer*(1-t/.012);
  if(t>release)y*=Math.exp(-(t-release)/(m.release*.35));
  out[i]=y;
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
 const m=grace?{...base,attack:Math.min(base.attack||.006,.006,q/4),release:Math.min(base.release,.008,q/4),ring:0,glide:0,scoop:0}:base,glide=m.glide&&fromMidi!=null&&fromMidi!==midi?fromMidi:null;
 return {key:`${timbre}|${midi}|${q}|${sr}|${glide??''}|${grace?'grace':'normal'}`,base,m,q,glide};
}
function renderJob(r){
 if(workerFailed||typeof Worker==='undefined')return new Promise((resolve,reject)=>setTimeout(()=>{try{resolve(window.FaustEngine.render(r.timbre,r.midi,r.dur,r.sr,r.fromMidi,{grace:r.grace}))}catch(e){reject(e)}},0));
 if(!worker){try{
  worker=new Worker(window.FaustWorkerURL||new URL('faust-worker.js?v='+window.FaustBank.models.flute.sourceSha256.slice(0,12),document.baseURI));
  worker.onmessage=({data:r})=>{const job=jobs.get(r.id);if(!job)return;jobs.delete(r.id);r.error?job.reject(Error(r.error)):job.resolve(r.data)};
  worker.onerror=()=>{workerFailed=true;worker.terminate();worker=null;for(const job of jobs.values())job.reject(Error('Faust background rendering failed'));jobs.clear()};
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

 const f=440*Math.pow(2,(midi-69)/12),from=glide!=null?440*Math.pow(2,(glide-69)/12):null;
 const data=m.kind==='strike'?renderStrike(m,f,q,sr):renderWind(m,f,q,sr,from);
 return store(key,data,sr);
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
// Modified by AI on 2026-10-10 13:56:00
