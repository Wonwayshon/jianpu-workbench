const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
class Buffer{
 constructor({length,sampleRate,numberOfChannels=1}){this.length=length;this.sampleRate=sampleRate;this.duration=length/sampleRate;this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length))}
 copyToChannel(data,c=0){this.channels[c].set(data)}getChannelData(c=0){return this.channels[c]}
}
const c=vm.createContext({console,atob,WebAssembly,AudioBuffer:Buffer,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},performance,localStorage:{getItem:()=>null,setItem(){}},document:{dispatchEvent(){}},CustomEvent:class{}});
vm.runInContext('window=globalThis',c);
for(const file of ['vendor/faust/models','faust-engine','synth','jianpu','player'])vm.runInContext(fs.readFileSync('web/'+file+'.js','utf8'),c);
const E=c.FaustEngine,S=c.Synth,P=c.ScorePlayer,J=c.Jianpu;
for(const [file,hash] of Object.entries(c.FaustBank.libraries))assert.equal(hash,crypto.createHash('sha256').update(fs.readFileSync('web/vendor/faust/source/'+file)).digest('hex'),'parameter curves match the generated bank');
assert.ok(E.available,E.error);
assert.equal(JSON.stringify(P.TIMBRE_LIST),JSON.stringify([['flute','笛子'],['erhu','二胡'],['yangqin','扬琴'],['guzheng','古筝'],['piano','钢琴'],['oboe','双簧管'],['clarinet','单簧管']]),'only the seven selected instruments appear in playback');
assert.equal(Object.keys(E.presets).length,7);assert.ok(E.bankBytes<80*1024);
assert.equal(JSON.stringify(Object.keys(S.MODELS).sort()),JSON.stringify(['clarinet','erhu','flute','guzheng','oboe','piano','reference','yangqin'].sort()),'old synthesis models are removed; tuner reference is internal');
const writes=[];c.localStorage={getItem:()=>JSON.stringify({timbre:'removed',partTimbres:{A:'removed',B:'piano'},partMute:{A:true},balance:.35,tempo:108}),setItem:(k,v)=>writes.push([k,v])};
const saved=P.loadSettings();assert.equal(saved.timbre,'flute');assert.equal(JSON.stringify(saved.partTimbres),JSON.stringify({B:'piano'}));assert.equal(saved.balance,.35);assert.equal(saved.tempo,108);assert.equal(saved.partMute.A,true);assert.equal(writes.length,0,'loading an unsupported ID does not run or persist a migration');
assert.equal(P.normalizeSettings({timbre:'constructor'}).timbre,'flute');assert.equal(P.normalizeSettings({timbre:{}}).timbre,'flute');assert.equal(JSON.stringify(P.normalizeSettings({partTimbres:{A:'',B:{},C:'erhu'}}).partTimbres),JSON.stringify({C:'erhu'}));
assert.ok(fs.statSync('web/vendor/faust/models.js').size<128*1024);
for(const [id,m] of Object.entries(c.FaustBank.models))assert.equal(m.sourceSha256,crypto.createHash('sha256').update(fs.readFileSync('web/vendor/faust/source/'+id+'.dsp')).digest('hex'),'precompiled model matches editable source');
function pitch(data,f,sr){
 const begin=Math.floor(sr*.25),N=Math.min(8192,data.length-begin-800),lo=Math.floor(sr/f*.8),hi=Math.ceil(sr/f*1.2),values=[];let best=-1,lag=0;
 for(let k=lo;k<=hi;k++){let xy=0,xx=0,yy=0;for(let i=0;i<N;i++){const a=data[begin+i],b=data[begin+i+k];xy+=a*b;xx+=a*a;yy+=b*b}const v=xy/Math.sqrt(xx*yy);values[k]=v;if(v>best){best=v;lag=k}}
 const off=(values[lag-1]-values[lag+1])/(2*(values[lag-1]-2*values[lag]+values[lag+1]));return sr/(lag+(Number.isFinite(off)?off:0));
}
(async()=>{
 const started=performance.now();
 for(const id of Object.keys(E.presets)){
  assert.ok(P.TIMBRE_LIST.some(([name])=>name===id));
  for(const midi of [60,69,72,84]){
   const sr=midi===69?44100:48000,data=E.render(id,midi,.65,sr,null,{vibrato:false});assert.ok(data.every(Number.isFinite));assert.ok(data.some(x=>Math.abs(x)>.01));
   const f=440*2**((midi-69)/12),cents=1200*Math.log2(pitch(data,f,sr)/f);
   assert.ok(Math.abs(cents)<20,`${id} MIDI ${midi}: ${cents.toFixed(2)} cents`);
  }
  for(const duration of [.02,.06]){const b=S.note(id,72,duration,48000,null,{grace:true});assert.ok(b.duration<=duration+.0081);assert.ok(b.getChannelData().some(x=>Math.abs(x)>.1));assert.ok(b.getChannelData().every(x=>Math.abs(x)<=.901))}
  const high=S.note(id,96,.08,96000);assert.ok(high.getChannelData().every(Number.isFinite));
 }
 // Timbre regressions: a felt-piano impact should not dwarf the ringing
 // tone, and the two reed instruments should keep their intended spectra.
 const rms=(data,a,b)=>{let sum=0;for(let i=a;i<b;i++)sum+=data[i]*data[i];return Math.sqrt(sum/(b-a))};
 const harmonic=(data,n)=>{let re=0,im=0;for(let i=12000;i<36000;i++){const phase=2*Math.PI*440*n*i/48000;re+=data[i]*Math.cos(phase);im+=data[i]*Math.sin(phase)}return Math.hypot(re,im)};
 for(const id of ['piano']){
  const data=E.render(id,69,1.2,48000,null,{vibrato:false});
  assert.ok(rms(data,0,1440)/rms(data,4800,14400)<1.3,id+' has a restrained impact instead of a loud key click');
 }
 for(const id of ['oboe']){
  const data=E.render(id,69,1.2,48000,null,{vibrato:false}),fund=harmonic(data,1);
  assert.ok(harmonic(data,2)/fund>.65&&harmonic(data,3)/fund>.4,id+' retains the broad nasal reed formant');
 }
 for(const id of ['clarinet']){
  const data=E.render(id,69,1.2,48000,null,{vibrato:false});
  assert.ok(harmonic(data,9)/harmonic(data,1)<.06,id+' avoids the bright square-wave tail');
 }
 const jobs=[{timbre:'flute',midi:67,dur:.345,sr:48000,grace:false},{timbre:'erhu',midi:74,dur:.035,sr:48000,grace:true}];
 let renders=0;const render=E.render;E.render=(...a)=>{renders++;return render(...a)};
 await Promise.all([S.prewarm(jobs),S.prewarm(jobs)]);assert.equal(renders,2,'duplicate prewarm requests share one render');
 for(const n of jobs)S.note(n.timbre,n.midi,n.dur,n.sr,null,{grace:n.grace});assert.equal(renders,2,'ready audio buffers require no main-thread DSP');
 assert.ok(S.cacheInfo().bytes<24*1024*1024);
 const audio=[];
 class Audio{
  constructor(){this.sampleRate=48000;this.currentTime=0;this.state='running';this.destination={};this.nodes=[];audio.push(this)}
  close(){this.closed=true}resume(){return Promise.resolve()}
  createGain(){return {gain:{value:0,setTargetAtTime(){}},connect(){}}}createConvolver(){return {connect(){}}}
  createDynamicsCompressor(){return Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,{value:0}]).concat([['connect',()=>{}]]))}
  createBuffer(n,len,sr){return new Buffer({length:len,sampleRate:sr,numberOfChannels:n})}
  createBufferSource(){const n={connect(){},start(time){this.time=time},stop(){}};this.nodes.push(n);return n}
 }
 c.AudioContext=Audio;
 const score=J.parse('@part A · 笛\n@part B · 胡\n[A] 2/^6//3/ ^3//5/2/ |\n[B] 2/2/ 5/5/ |');for(const t of score.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1]+t.octave*12;
 const settings={tempo:120,timbre:'flute',partTimbres:{B:'erhu'}};
 const warm=S.prewarm;let release,ended=0;S.prewarm=()=>new Promise(r=>release=r);
 const cancelled=P.playReady(score.lines,settings,()=>ended++);assert.ok(P.isPlaying());P.stop();release();assert.equal(await cancelled,false);assert.equal(ended,1);assert.equal(audio.at(-1).nodes.length,0);assert.ok(audio.at(-1).closed,'cancel during rendering never starts stale playback');
 S.prewarm=warm;renders=0;
 assert.equal(await P.playReady(score.lines,settings,()=>{}),true);assert.equal(audio.at(-1).closed,undefined,'prepared AudioContext is reused');
 const starts=audio.at(-1).nodes.filter(n=>n.buffer).map(n=>n.time);assert.ok(starts.some(t=>Math.abs(t-.12)<1e-8));assert.equal(starts.filter(t=>Math.abs(t-.43)<1e-8).length,2,'both main voices land after the same 60 ms grace slice');P.stop();
 E.render=render;
 assert.equal(await P.previewTimbre('yangqin',.85,{dry:true}),true);const preview=audio.at(-1).nodes.find(n=>n.buffer);
 assert.ok(preview.buffer.duration>3);assert.ok(preview.buffer.getChannelData().every(Number.isFinite));P.stop();
 assert.ok(!/audioLabDialog|settingsAudioLab|playAudioLab|audio-lab\.js/.test(fs.readFileSync('web/index.html','utf8')),'app contains no audition page, dialog or entry');
 // Exercise the standalone developer audition tool without a device-specific browser.
 class El{
  constructor(){this.children=[];this.dataset={};this.attributes={};this.textContent='';this.listeners={}}
  append(...children){this.children.push(...children)}replaceChildren(...children){this.children=children}
  setAttribute(key,value){this.attributes[key]=value}addEventListener(name,fn){this.listeners[name]=fn}
  querySelectorAll(){return this.children.flatMap(el=>[...(el.dataset.listen?[el]:[]),...el.querySelectorAll()])}
  showModal(){this.open=true}close(){this.open=false;this.listeners.close?.()}
 }
 const ids=['audioLabDialog','audioLabStatus','audioLabChoices','audioLabPhrase','audioLabDry','audioLabClose','audioLabStop','settingsAudioLab','playAudioLab'],elements=Object.fromEntries(ids.map(id=>[id,new El()]));
 elements.audioLabPhrase.value='melody';elements.audioLabDry.checked=true;
 let stored=JSON.stringify({timbre:'flute'});c.localStorage={getItem:()=>stored,setItem:(key,value)=>stored=value};c.CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail}};
 c.document={getElementById:id=>elements[id],createElement:()=>new El(),dispatchEvent:e=>P.saveSettings({...P.loadSettings(),timbre:e.detail.id})};
 vm.runInContext(fs.readFileSync('scripts/audition-ui.js','utf8'),c);c.AudioLab.open();
 const menu=()=>elements.audioLabChoices.children;
 assert.equal(menu().length,7);assert.equal(JSON.stringify(menu().map(el=>el.children[0].textContent)),JSON.stringify(['笛子','二胡','扬琴','古筝','钢琴','双簧管','单簧管']));
 const text=el=>el.textContent+el.children.map(text).join('');assert.ok(!/Faust|A\/B|推荐|现有|候选/.test(text(elements.audioLabChoices)),'chooser exposes ordinary instrument names only');
 menu().find(el=>el.dataset.timbre==='piano').children[2].children[1].onclick();assert.equal(P.loadSettings().timbre,'piano');assert.equal(menu().find(el=>el.dataset.timbre==='piano').children[2].children[1].textContent,'当前默认');
 elements.audioLabDialog.close();assert.equal(elements.audioLabDialog.open,false);assert.equal(P.isPlaying(),false);
 console.log(`PASS: 7 compiled DSPs / 7 selected instruments; source hashes and <128 KiB bank; pitch within 20 cents at 44.1/48 kHz, high register at 96 kHz; brief audible grace envelopes; deduplicated prewarm/cache; cancel and Context reuse; ensemble grace clock; seven-option chooser and saved-selection fallback; portable audition (${Math.round(performance.now()-started)} ms).`);
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-10 15:20:21
