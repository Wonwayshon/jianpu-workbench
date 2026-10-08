'use strict';
// Microphone tuner: YIN pitch detection on the live input, nearest equal-tempered note, cents needle.
(() => {
const $=id=>document.getElementById(id);
const NAMES=['C','C♯','D','E♭','E','F','F♯','G','G♯','A','B♭','B'];
const DEG=['1','♯1','2','♭3','3','4','♯4','5','♯5','6','♭7','7'];
let ctx=null,stream=null,analyser=null,buf=null,raf=0,history=[],lastSeen=0;
const store=(k,v)=>{try{v===undefined?null:localStorage.setItem(k,v);return localStorage.getItem(k)}catch{return null}};

// YIN (de Cheveigné & Kawahara): cumulative mean normalized difference, first dip under the threshold.
function yin(data,rate){
 const n=data.length,half=n>>1,diff=new Float32Array(half);
 let rms=0;for(let i=0;i<n;i++)rms+=data[i]*data[i];rms=Math.sqrt(rms/n);if(rms<0.008)return null;
 const minTau=Math.floor(rate/4200),maxTau=Math.min(half-1,Math.ceil(rate/120));
 for(let tau=1;tau<=maxTau;tau++){let s=0;for(let i=0;i<half;i++){const d=data[i]-data[i+tau];s+=d*d}diff[tau]=s}
 let running=0,tau=-1;diff[0]=1;
 for(let t=1;t<=maxTau;t++){running+=diff[t];diff[t]=diff[t]*t/(running||1)}
 // First dip under the threshold, then walk down to its local minimum.
 for(let t=Math.max(2,minTau);t<maxTau;t++)if(diff[t]<0.12){while(t+1<maxTau&&diff[t+1]<diff[t])t++;tau=t;break}
 if(tau<0){let best=Math.max(2,minTau);for(let t=best;t<maxTau;t++)if(diff[t]<diff[best])best=t;if(diff[best]<0.3)tau=best;else return null}
 const a=diff[tau-1]??diff[tau],b=diff[tau],c=diff[tau+1]??diff[tau],shift=(a-c)/(2*(a-2*b+c)||1);
 return {freq:rate/(tau+(Number.isFinite(shift)?shift:0)),clarity:1-b,rms};
}
function jianpu(rel,octave){
 const deg=DEG[((rel%12)+12)%12],box=document.createElement('span');box.className='jp';
 if(deg.length>1){const a=document.createElement('span');a.className='jp-acc';a.textContent=deg[0];box.append(a)}
 const d=document.createElement('span');d.className='jp-digit';d.textContent=deg.slice(-1);
 if(octave){const dots=document.createElement('span');dots.className='jp-dots '+(octave>0?'up':'down');for(let i=0;i<Math.abs(octave);i++){const e=document.createElement('i');e.textContent='•';dots.append(e)}d.append(dots)}
 box.append(d);return box;
}
function show(freq){
 const a4=Number($('tunerA4').value)||440,midiFloat=69+12*Math.log2(freq/a4),midi=Math.round(midiFloat),cents=Math.round((midiFloat-midi)*100);
 const tonic=Number($('tunerKey').value)||0,oct=Math.floor(midi/12)-1;
 $('tunerNote').textContent=NAMES[midi%12];$('tunerOct').textContent=oct;$('tunerFreq').textContent=`${freq.toFixed(1)} Hz`;
 $('tunerCents').textContent=`${cents>0?'+':''}${cents} 音分`;
 $('tunerFixed').replaceChildren(jianpu(midi-60,Math.floor((midi-60)/12)));
 const rel=midi-(60+tonic);$('tunerMovable').replaceChildren(jianpu(rel,Math.floor(rel/12)));
 const angle=Math.max(-50,Math.min(50,cents))*0.9;$('tunerNeedle').setAttribute('transform',`rotate(${angle} 150 150)`);
 const ok=Math.abs(cents)<=5;$('tunerPanelCard').classList.toggle('in-tune',ok);$('tunerHint').textContent=ok?'音准 ✓':cents<0?'偏低，往上调 / 吹得更集中':'偏高，往下调 / 气息放缓';
}
function loop(){
 analyser.getFloatTimeDomainData(buf);const r=yin(buf,ctx.sampleRate),now=performance.now();
 if(r&&r.clarity>0.8&&r.freq>120&&r.freq<4200){history.push(r.freq);if(history.length>5)history.shift();const sorted=[...history].sort((a,b)=>a-b);show(sorted[sorted.length>>1]);lastSeen=now;$('tunerPanelCard').classList.remove('idle')}
 else if(now-lastSeen>900){history=[];$('tunerPanelCard').classList.add('idle');$('tunerHint').textContent='请对着麦克风吹一个长音'}
 raf=requestAnimationFrame(loop);
}
async function start(){
 if(stream)return;
 $('tunerStatus').textContent='正在打开麦克风…';
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  ctx=new (window.AudioContext||window.webkitAudioContext)();await ctx.resume();
  analyser=ctx.createAnalyser();analyser.fftSize=4096;buf=new Float32Array(analyser.fftSize);
  ctx.createMediaStreamSource(stream).connect(analyser);
  $('tunerToggle').textContent='■ 停止';$('tunerStatus').textContent='正在聆听（声音只在本机处理，不录音、不上传）';loop();
 }catch(error){stop();$('tunerStatus').textContent=error.name==='NotAllowedError'?'没有麦克风权限。请允许录音，或到系统设置里为本应用开启麦克风。':`无法打开麦克风：${error.message}`}
}
function stop(){
 cancelAnimationFrame(raf);raf=0;stream?.getTracks().forEach(t=>t.stop());stream=null;if(ctx){ctx.close();ctx=null}history=[];
 $('tunerToggle').textContent='🎤 开始调音';$('tunerPanelCard').classList.add('idle');if(!$('tunerStatus').textContent.startsWith('没有')&&!$('tunerStatus').textContent.startsWith('无法'))$('tunerStatus').textContent='';
}
for(let hz=430;hz<=446;hz++)$('tunerA4').add(new Option(`A4 = ${hz} Hz`,hz));
for(let i=0;i<12;i++)$('tunerKey').add(new Option(`1 = ${NAMES[i]}`,i));
$('tunerA4').value=store('flute.tunerA4')||'440';$('tunerKey').value=store('flute.tunerKey')||'0';
$('tunerA4').onchange=()=>store('flute.tunerA4',$('tunerA4').value);$('tunerKey').onchange=()=>store('flute.tunerKey',$('tunerKey').value);
$('tunerToggle').onclick=()=>stream?stop():start();
// Release the microphone whenever the tuner tab is left or the app goes to the background.
new MutationObserver(()=>{if($('tunerPanel').hidden)stop()}).observe($('tunerPanel'),{attributes:true,attributeFilter:['hidden']});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
window.Tuner={yin,start,stop};
})();
// Modified by AI on 2026-10-08 10:06:28
