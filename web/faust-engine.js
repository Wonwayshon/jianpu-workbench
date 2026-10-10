'use strict';
// Minimal host for our precompiled mono Faust DSPs. The Web Audio clock stays in player.js.
// No compiler, fetch, dynamic JS or third-party runtime is required, including file:// use.
(() => {
const RATE=48000,BLOCK=128,instances=new Map();let error='';
const presets={
 flute:{model:'flute',color:1,attack:.04,release:.085,pre:.07,vibrato:.0025,base:'flute',label:'笛子'},
 erhu:{model:'bowed',color:0,attack:.045,release:.08,pre:.08,vibrato:.0045,base:'erhu',label:'二胡'},
 yangqin:{model:'hammer',color:0,attack:.001,release:.12,pre:0,vibrato:0,base:'yangqin',label:'扬琴'},
 guzheng:{model:'guzheng',color:0,attack:.001,release:.2,pre:0,vibrato:0,base:'guzheng',label:'古筝'},
 piano:{model:'piano',color:1,attack:.006,release:.15,pre:0,vibrato:0,base:'piano',label:'钢琴'},
 oboe:{model:'oboe',color:1,attack:.025,release:.065,pre:.035,vibrato:.0038,vibRate:5.3,vibDelay:.18,base:'oboe',label:'双簧管'},
 clarinet:{model:'clarinet',color:0,attack:.038,release:.07,pre:.22,vibrato:.0008,vibRate:4.9,vibDelay:.14,base:'clarinet',label:'单簧管'},
};
// Faust's standalone WASM ABI exposes init/compute/setParamValue and linear memory.
const env={_atan2f:Math.atan2,_log10f:Math.log10,_acosf:Math.acos,_asinf:Math.asin,_atanf:Math.atan,_sinf:Math.sin,_cosf:Math.cos,_expf:Math.exp,_logf:Math.log,_powf:Math.pow,_sqrtf:Math.sqrt,_tanf:Math.tan,_floorf:Math.floor,_ceilf:Math.ceil,_roundf:Math.round,_max_f:Math.max,_min_f:Math.min,_fmodf:(a,b)=>a%b};
try{
 if(!window.FaustBank||typeof WebAssembly!=='object')throw Error('设备暂不支持当前音色');
 for(const [id,meta] of Object.entries(window.FaustBank.models)){
  const bytes=Uint8Array.from(atob(meta.code),c=>c.charCodeAt(0));
  const module=new WebAssembly.Module(bytes),api=new WebAssembly.Instance(module,{env}).exports;
  const pointer=(meta.size+15)&~15,output=pointer+16,end=output+BLOCK*4;
  if(api.memory.buffer.byteLength<end)api.memory.grow(Math.ceil((end-api.memory.buffer.byteLength)/65536));
  new Int32Array(api.memory.buffer)[pointer>>2]=output;
  instances.set(id,{api,pointer,output,controls:Object.fromEntries(meta.controls.map(c=>[c.label,c.index]))});
 }
 for(const p of Object.values(presets))if(!instances.has(p.model))throw Error('音色文件版本不一致');
}catch(e){instances.clear();error=e.message||'音色初始化失败'}
function render(id,midi,dur,sr,fromMidi,{grace=false,vibrato=true}={}){
 const p=presets[id],d=instances.get(p?.model);if(!d)throw Error(error||'Unknown Faust model');
 if(!Number.isFinite(midi)||!Number.isFinite(dur)||dur<=0||dur>120||sr<8000||sr>192000)throw Error('Invalid synthesis request');
 // High flute registers transpose a stable waveguide register, avoiding unstable overblowing.
 const sourceMidi=Math.min(p.model==='flute'?84:96,Math.max(40,midi));
 const ratio=2**((midi-sourceMidi)/12),frequency=440*2**((sourceMidi-69)/12);
 const release=grace?Math.min(.008,dur/4):p.release;
 const glide=!grace&&p.model==='bowed'&&fromMidi!=null&&Math.abs(fromMidi-midi)<=7?fromMidi:null;
 const peakRatio=ratio*Math.max(1,glide==null?1:2**((glide-midi)/12))*(1+p.vibrato);
 const rawLength=Math.ceil((p.pre+(dur+release)*peakRatio+.01)*RATE),raw=new Float32Array(rawLength);
 d.api.init(0,RATE);d.api.setParamValue(0,d.controls.freq,frequency);d.api.setParamValue(0,d.controls.color,p.color);d.api.setParamValue(0,d.controls.gate,1);
 const channel=new Float32Array(d.api.memory.buffer,d.output,BLOCK);
 // Host envelopes are applied after the model, so even 20 ms grace notes speak immediately.
 for(let at=0;at<rawLength;at+=BLOCK){const n=Math.min(BLOCK,rawLength-at);d.api.compute(0,n,0,d.pointer);raw.set(channel.subarray(0,n),at)}
 const n=Math.ceil((dur+release)*sr),out=new Float32Array(n);let position=p.pre*RATE;
 const attack=grace?Math.min(.004,dur/4):Math.min(p.attack,dur/4);
 for(let i=0;i<n;i++){
  const t=i/sr,k=Math.floor(position),frac=position-k;
  const sample=(raw[k]||0)*(1-frac)+(raw[k+1]||0)*frac;
  const env=Math.sin(Math.PI/2*Math.min(1,t/attack))*Math.max(0,t>dur?1-(t-dur)/release:1);
  const breath=(!grace&&vibrato&&['flute','clarinet','oboe'].includes(p.model))?1+.017*Math.min(1,t/.2)*Math.sin(2*Math.PI*.8*t+midi*.41):1;
  out[i]=Number.isFinite(sample)?sample*env*breath:0;
  const bend=glide==null?1:2**(((glide-midi)*Math.max(0,1-t/.075))/12);
  const depth=!grace&&vibrato?p.vibrato*Math.min(1,Math.max(0,(t-(p.vibDelay??.25))/.3)):0;
  position+=RATE/sr*ratio*bend*(1+depth*Math.sin(2*Math.PI*(p.vibRate||5.6)*t+(midi*.618+p.color)*Math.PI*2));
 }
 return out;
}
window.FaustEngine={render,presets,available:instances.size===Object.keys(window.FaustBank?.models||{}).length&&instances.size>0,error,bankBytes:Object.values(window.FaustBank?.models||{}).reduce((n,m)=>n+m.wasmBytes,0),sampleRate:RATE};
})();
// Modified by AI on 2026-10-10 15:12:04
