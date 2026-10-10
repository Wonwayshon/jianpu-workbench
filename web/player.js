'use strict';
// Plays converted score lines (tokens carrying `midi`) with Web Audio, in rhythm, highlighting each note, with an
// optional metronome. Durations in beats (quarter = 1): each underline halves, dots add 1/2 and 1/4, "-" adds a beat
// to the previous sound, n{...} scales by the nearest lower power of two over n, a two-note slur on one pitch is a tie,
// |: ... :| repeats once, grace notes take a short slice before their main note.
(() => {
let ctx=null,playing=null,preparing=null,audioEpoch=0,previewTimer=null,previewEnd=null;
let partBuses=new Map();

// Metronome subdivisions of one beat. `span` beats per pattern; `notes` drive the icon; `clicks` are offsets in beats.
const PATTERNS=[
 {id:'half',label:'二分',span:2,notes:[{d:2}],clicks:[0]},
 {id:'quarter',label:'四分',span:1,notes:[{d:1}],clicks:[0]},
 {id:'eighths',label:'八分',span:1,notes:[{d:.5},{d:.5}],clicks:[0,.5]},
 {id:'offbeat',label:'后半拍',span:1,notes:[{d:.5,rest:true},{d:.5}],clicks:[.5]},
 {id:'triplet',label:'三连音',span:1,tuplet:true,notes:[{d:1/3},{d:1/3},{d:1/3}],clicks:[0,1/3,2/3]},
 {id:'triplet-skip-mid',label:'三连音（中空）',span:1,tuplet:true,notes:[{d:1/3},{d:1/3,rest:true},{d:1/3}],clicks:[0,2/3]},
 {id:'triplet-skip-first',label:'三连音（首空）',span:1,tuplet:true,notes:[{d:1/3,rest:true},{d:1/3},{d:1/3}],clicks:[1/3,2/3]},
 {id:'triplet-skip-last',label:'三连音（尾空）',span:1,tuplet:true,notes:[{d:1/3},{d:1/3},{d:1/3,rest:true}],clicks:[0,1/3]},
 {id:'sixteenths',label:'十六分',span:1,notes:[{d:.25},{d:.25},{d:.25},{d:.25}],clicks:[0,.25,.5,.75]},
 {id:'eighth-two-sixteenths',label:'前八后十六',span:1,notes:[{d:.5},{d:.25},{d:.25}],clicks:[0,.5,.75]},
 {id:'two-sixteenths-eighth',label:'前十六后八',span:1,notes:[{d:.25},{d:.25},{d:.5}],clicks:[0,.25,.5]},
 {id:'syncopation',label:'小切分',span:1,notes:[{d:.25},{d:.5},{d:.25}],clicks:[0,.25,.75]},
 {id:'dotted-eighth-sixteenth',label:'附点八分 + 十六分',span:1,notes:[{d:.75,dot:true},{d:.25}],clicks:[0,.75]},
 {id:'sixteenth-dotted-eighth',label:'十六分 + 附点八分',span:1,notes:[{d:.25},{d:.75,dot:true}],clicks:[0,.25]},
];
const DEFAULTS={tempo:80,metronome:false,accent:true,pattern:'quarter',time:'auto',countIn:false,balance:0.5,muteMelody:false,timbre:'flute'};
// One balance control: 0 = melody only, 1 = metronome only, 0.5 = both at full volume.
const mix=b=>({melodyVol:Math.min(1,2*(1-b))*0.85,clickVol:Math.min(1,2*b)*0.8});
const STORE='flute.player.v1';
function loadSettings(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{return {...DEFAULTS}}}
function saveSettings(s){try{localStorage.setItem(STORE,JSON.stringify(s))}catch{}}

// Build written rhythm first; all parts then share the same fermata holds.
// A hold belongs to a musical boundary, never to a private clock for one part.
function schedule(lines,{tempo=80}={}){
 const ids=[];for(const l of lines)if(l.kind==='music'&&!ids.includes(l.part??''))ids.push(l.part??'');
 const events=[];let writtenTotal=0,writtenBars=[],timeChanges=[];
 for(const id of ids){const stream=lines.flatMap(l=>l.kind==='meta'&&l.name==='time'?[{t:'time',value:l.value}]:l.kind==='music'&&(l.part??'')===id?l.tokens:[]),r=scheduleStream(stream);for(const e of r.events)e.part=id;events.push(...r.events);writtenTotal=Math.max(writtenTotal,r.total);if(id===ids[0]){writtenBars=r.bars;timeChanges=r.timeChanges}}
 const boundaries=new Map();
 for(const e of events)if(e.fermata){const end=Math.round((e.start+e.beats)*1e8)/1e8;boundaries.set(end,Math.max(boundaries.get(end)||0,e.beats*.6))}
 const holds=[...boundaries].sort((a,b)=>a[0]-b[0]);
 const warpBeat=beat=>beat+holds.reduce((extra,[at,length])=>extra+(at<=beat+1e-8?length:0),0);
 const sourceBeats=new Map(events.map(e=>[e,e.beats]));
 for(const e of events){e.scoreStart=e.start;const end=warpBeat(e.start+e.beats);e.start=warpBeat(e.start);e.beats=end-e.start}
 // Grace notes borrow a brief opening slice from the main beat, never add written time.
 // At a shared attack, all pitched voices land together after that slice; rests and percussion
 // keep their own attack. Source duration is retained for fermata calculation above.
 const atKey=beat=>Math.round(beat*1e8),mains=new Map(),groups=new Map(),delays=new Map();
 for(const e of events)if(!e.grace){const k=atKey(e.scoreStart);if(!mains.has(k))mains.set(k,new Map());mains.get(k).set(e.token,e)}
 for(const e of events)if(e.grace){const main=mains.get(atKey(e.scoreStart))?.get(e.mainToken);if(main){if(!groups.has(main))groups.set(main,[]);groups.get(main).push(e)}}
 for(const [main] of groups){
  const k=atKey(main.scoreStart),attacks=[...mains.get(k).values()].filter(e=>e.midi!=null||e===main);
  const duration=Math.min(Math.min(...attacks.map(e=>sourceBeats.get(e)))/4,0.06*(Number(tempo)||80)/60);
  delays.set(k,Math.max(delays.get(k)||0,duration));
 }
 for(const [main,graces] of groups){const duration=delays.get(atKey(main.scoreStart)),start=main.start;graces.forEach((e,i)=>{e.start=start+duration*i/graces.length;e.beats=duration/graces.length})}
 for(const e of events)if(!e.grace&&(e.midi!=null||groups.has(e))){const delay=delays.get(atKey(e.scoreStart))||0;e.start+=delay;e.beats-=delay}
 events.sort((a,b)=>a.start-b.start||Number(b.grace||false)-Number(a.grace||false));
 return {events,total:warpBeat(writtenTotal),parts:ids,bars:writtenBars.map(warpBeat),writtenBars,writtenTotal,warpBeat,holds,timeChanges};
}
// Diagnose transcription differences without inserting invented notes or rests.
function timingWarnings(lines){
 const warnings=[];
 for(const block of window.Jianpu.groupSystems(lines)){
  if(block.kind!=='system'||block.lines.length<2)continue;
  const rows=block.lines.map(line=>{const r=scheduleStream(line.tokens.map(t=>t.t==='bar'?{...t,text:'|'}:t));return {part:line.part,line:line.tokens.find(t=>t.line||t.src?.line)?.line||line.tokens.find(t=>t.src?.line)?.src.line,beats:r.total,bars:r.bars}});
  const first=rows[0];if(rows.some(r=>Math.abs(r.beats-first.beats)>1e-6||r.bars.length!==first.bars.length||r.bars.some((b,i)=>Math.abs(b-first.bars[i])>1e-6))){
   warnings.push('声部时值或小节线不齐：'+rows.map(r=>`${r.part}（第 ${r.line||'?'} 行，${Number(r.beats.toFixed(3))} 拍）`).join('；')+'。请对照原谱核对，播放不会自动补音。');
  }
 }
 return warnings;
}
function scheduleStream(stream){
 const events=[],bars=[];let last=null,repeatStart=0,pos=0;const repeated=new Set();
 const slurStack=[],tup=[],timeChanges=[{at:0,time:'4/4'}];let pendingGrace=[],time='4/4',repeatTime=time;
 const changeTime=value=>{time=value;const last=timeChanges.at(-1);if(last.at===pos)last.time=time;else if(last.time!==time)timeChanges.push({at:pos,time})};
 for(let i=0;i<stream.length;i++){
  const t=stream[i];
  if(t.t==='time'){changeTime(t.value);continue}
  if(t.t==='bar'){bars.push(pos);if(t.text.endsWith(':')){repeatStart=i+1;repeatTime=time;}
   if(t.text.startsWith(':')&&!repeated.has(i)){repeated.add(i);changeTime(repeatTime);i=repeatStart-1;last=null;continue}
   continue}
  if(t.t==='tupOpen'){let p=1;while(p*2<t.n)p*=2;tup.push(p/t.n);continue}
  if(t.t==='tupClose'){tup.pop();continue}
  if(t.t==='open'){slurStack.push(events.length);continue}
  if(t.t==='close'){const from=slurStack.pop();
   const group=events.slice(from).filter(e=>e.midi!=null&&!e.grace);
   // Two notes of the same pitch under one arc: a tie, so the second only lengthens the first.
   if(group.length===2&&!events.slice(from).some(e=>e.percussion)&&!events.slice(events.indexOf(group[0])+1,events.indexOf(group[1])).some(e=>e.grace)&&group[0].midi===group[1].midi){group[0].beats+=group[1].beats;group[0].fermata=group[0].fermata||group[1].fermata;group[1].tied=true;if(last===group[1])last=group[0]}
   for(const e of group.slice(0,-1))e.legato=true;continue}
  if(t.t==='dash'){if(last)last.beats+=1;else events.push(last={midi:null,beats:1,token:t});pos+=1;continue}
  if(t.t!=='note'&&t.t!=='rest'&&t.t!=='chord'&&t.t!=='percussion')continue;
  if(t.grace){pendingGrace.push(t);continue}
  let beats=Math.pow(0.5,t.under||0)*(t.dot===1?1.5:t.dot===2?1.75:1);for(const f of tup)beats*=f;
  const graces=pendingGrace.map(g=>({midi:g.midi,beats:0,token:g,grace:true,mainToken:t}));pendingGrace=[];pos+=beats;
  last={percussion:t.t==='percussion',midi:t.t==='note'?t.midi:t.t==='chord'?t.notes[0]?.midi??null:null,midis:t.t==='chord'?t.notes.map(n=>n.midi).filter(m=>m!=null):null,beats,token:t,fermata:(t.orns||[]).includes('fermata'),stacc:(t.orns||[]).includes('stacc')};events.push(...graces,last);
 }
 let at=0;for(const e of events){if(e.tied)continue;e.start=at;if(!e.grace)at+=e.beats}
 return {events:events.filter(e=>!e.tied),total:at,bars,timeChanges};
}
// "3/4" -> {beats:3, unit:1 quarter}; "6/8" -> {beats:6, unit:0.5}
function meter(value){const m=/^(\d+)\/(\d+)$/.exec(value||'');if(!m)return {beats:4,unit:1};return {beats:Math.max(1,Number(m[1])),unit:4/Number(m[2])}}
function timeAt(all,beat){let time='4/4';for(const change of all.timeChanges||[]){if(change.at>beat+1e-8)break;time=change.time}return time}
// Written-beat grid shared by clicks and beat lights. Automatic mode uses each section's meter;
// an explicit meter runs continuously instead of resetting a three-beat cycle at four-beat bar lines.
function metronomeGrid(all,s,from=0,until=all.writtenTotal){
 const automatic=s.time==='auto'||!s.time,pattern=PATTERNS.find(p=>p.id===s.pattern)||PATTERNS[1];
 const points=automatic?[...all.writtenBars,...(all.timeChanges||[]).map(c=>c.at)]:[];
 const pts=[...new Set(points.filter(b=>b>1e-6&&b<all.writtenTotal-1e-6).map(b=>Math.round(b*1e8)/1e8))].sort((a,b)=>a-b);
 const segments=[];let previous=0;for(const b of pts){segments.push([previous,b]);previous=b}segments.push([previous,Infinity]);
 const grid=[];
 segments.forEach(([a,b],i)=>{
  const signature=automatic?timeAt(all,a):s.time,m=meter(signature),barBeats=m.beats*m.unit,unit=m.unit*pattern.span;
  const anchor=automatic&&i===0&&pts.length&&b-a<barBeats-1e-6?b-barBeats:a,lo=i===0?-Infinity:a;
  for(let at=anchor+Math.floor((Math.max(lo,from)-anchor)/unit-1e-9)*unit;at<Math.min(b,until)-1e-6;at+=unit)for(const off of pattern.clicks){
   const pos=at+off*m.unit;if(pos<from-1e-6||pos>=until-1e-6||pos<lo-1e-6||pos>=b-1e-6)continue;
   const inBar=(((pos-anchor)%barBeats)+barBeats)%barBeats,onBeat=Math.abs(inBar/m.unit-Math.round(inBar/m.unit))<1e-6;
   // A malformed overlong written bar must not create an additional downbeat accent inside it.
   const cycleStart=inBar<1e-6||barBeats-inBar<1e-6,downbeat=automatic?Math.abs(pos-anchor)<1e-6||(pos<0&&cycleStart):cycleStart;
   grid.push({beat:pos,kind:onBeat&&downbeat&&s.accent?'accent':onBeat?'beat':'sub',index:onBeat?Math.round(inBar/m.unit)%m.beats:null,count:m.beats,signature});
  }
 });
 return grid.sort((a,b)=>a.beat-b.beat);
}

// Timbre names shown in the settings; the sound models live in synth.js.
const TIMBRES={flute:{label:'长笛'},dizi:{label:'竹笛'},erhu:{label:'二胡'},clarinet:{label:'单簧管'},piano:{label:'钢琴'},guzheng:{label:'古筝'},yangqin:{label:'扬琴 · 现有'},ocarina:{label:'陶笛'},organ:{label:'风琴'}};
for(const [id,p] of Object.entries(window.FaustEngine?.presets||{}))if(window.FaustEngine.available)TIMBRES[id]={label:p.label};
let timbreName='flute';
// Notes are rendered by synth.js into buffers and played through a dry path plus a shared room reverb.
// Melody and metronome have their own buses so the balance slider can change them while playing.
let dry=null,wet=null,melodyBus=null,clickBus=null,master=null,clickBufs=null,percussionBuf=null;
// Everything goes through a master gain with headroom and a fast limiter, so melody + reverb + clicks never clip.
function setupMix(){
 partBuses=new Map();
 master=ctx.createGain();master.gain.value=0.8;const lim=ctx.createDynamicsCompressor();
 lim.threshold.value=-6;lim.knee.value=3;lim.ratio.value=20;lim.attack.value=0.002;lim.release.value=0.12;master.connect(lim);lim.connect(ctx.destination);
 dry=ctx.createGain();dry.connect(master);const conv=ctx.createConvolver();conv.buffer=Synth.impulse(ctx);wet=ctx.createGain();wet.connect(conv);conv.connect(master);
 melodyBus=ctx.createGain();melodyBus.connect(dry);clickBus=ctx.createGain();clickBus.connect(master);clickBufs=null;percussionBuf=null;
 // The room reverb is fed from the melody bus, so the balance scales it too.
 const send=ctx.createGain();send.gain.value=(Synth.MODELS[timbreName]||Synth.MODELS.flute).reverb;melodyBus.connect(send);send.connect(wet);
}
function tone(time,midi,dur,legato,stacc,vol,prevMidi,timbre=timbreName,bus=null,resumeOffset=0,grace=false){
 if(!dry)setupMix();
 const model=Synth.MODELS[timbre]||Synth.MODELS.flute,len=grace?Math.max(.002,dur):Math.max(0.06,stacc?dur*0.45:legato?dur:dur*0.93);
 if(resumeOffset>=len)return;
 const src=ctx.createBufferSource();src.buffer=Synth.note(timbre,midi,len,ctx.sampleRate,prevMidi,{grace});
 const g=ctx.createGain();g.gain.value=model.gain*vol;src.connect(g);g.connect(bus||melodyBus);
 src.start(Math.max(time,ctx.currentTime),resumeOffset);
}
// Generic unpitched hit: a short decaying noise burst, independent of the selected pitched instrument.
// X identifies a hit, not a particular drum; never invent a MIDI pitch or send it through flute synthesis.
function percussion(time,accent=false,stacc=false,bus=null){
 if(!percussionBuf){const sr=ctx.sampleRate,n=Math.ceil(sr*0.12);percussionBuf=ctx.createBuffer(1,n,sr);const d=percussionBuf.getChannelData(0);let prev=0;
  for(let i=0;i<n;i++){const t=i/sr,noise=Math.random()*2-1;d[i]=(noise-prev*0.65)*Math.min(1,t/0.001)*Math.exp(-t/0.023)*0.5;prev=noise}}
 const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=percussionBuf;g.gain.value=accent?1.25:0.9;src.connect(g);g.connect(bus||melodyBus);
 const at=Math.max(time,ctx.currentTime);src.start(at);if(stacc)src.stop(at+0.055);
}
// kind: 'accent' (bar downbeat), 'beat', 'sub' (subdivision). Each click is a short pre-rendered buffer: no
// oscillator or gain automation per click, which kept many audio nodes alive and crackled on tablets.
function clickBuffer(kind){
 const sr=ctx.sampleRate,n=Math.floor(sr*0.07),b=ctx.createBuffer(1,n,sr),d=b.getChannelData(0);
 const f=kind==='accent'?1760:kind==='beat'?1175:880,peak=kind==='accent'?0.55:kind==='beat'?0.4:0.22;
 for(let i=0;i<n;i++){const t=i/sr,env=Math.min(1,t/0.002)*Math.exp(-t/0.014);let x=Math.sin(2*Math.PI*f*t);if(kind!=='sub')x=x+0.25*Math.sin(2*Math.PI*3*f*t)/3;d[i]=peak*env*x}
 return b;
}
function click(time,kind,vol){
 if(!dry)setupMix();
 if(!clickBufs)clickBufs={accent:clickBuffer('accent'),beat:clickBuffer('beat'),sub:clickBuffer('sub')};
 const src=ctx.createBufferSource();src.buffer=clickBufs[kind];
 if(vol!==1){const g=ctx.createGain();g.gain.value=vol;src.connect(g);g.connect(clickBus)}else src.connect(clickBus);
 src.start(Math.max(time,ctx.currentTime));
}

// The same note may be drawn as a flute-score cell, an original-score cell and staff elements; use the visible one.
const shown=el=>el&&el.isConnected&&el.getClientRects().length>0;
function visibleTargets(token){
 if(shown(token._cell))return [token._cell];
 if(shown(token.src?._cell))return [token.src._cell];
 const staff=(token._staffEls||[]).filter(shown);if(staff.length)return staff;
 return [];
}
function stop(){
 const pendingEnd=preparing?.onEnd;audioEpoch++;preparing=null;if(previewTimer!=null)clearTimeout(previewTimer);previewTimer=null;
 const previewDone=previewEnd;previewEnd=null;if(previewDone)previewDone();
 const done=playing?.onEnd||pendingEnd;
 if(playing){cancelAnimationFrame(playing.raf);clearInterval(playing.timer);for(const c of playing.cells)c.classList.remove('jp-playing')}
 playing=null;partBuses.clear();if(ctx){ctx.close();ctx=null;dry=wet=melodyBus=clickBus=null}if(done)done();
}
function renderPlans(events,s,sr){
 const prev=new Map(),plans=[];
 for(const e of events){const before=prev.get(e.part);prev.set(e.part,e);
  const timbre=s.partTimbres?.[e.part] in TIMBRES?s.partTimbres[e.part]:s.timbre;
  if(!Synth.MODELS[timbre]?.faust)continue;
  const dur=e.grace?Math.max(.002,e.beats*60/s.tempo):Math.max(.06,e.beats*60/s.tempo*(e.stacc?.45:e.legato?1:.93));
  for(const midi of e.midis||[e.midi])if(midi!=null)plans.push({at:e.start,timbre,midi,dur,sr,fromMidi:!e.midis&&before?.legato?before.midi:null,grace:!!e.grace});
 }
 return plans;
}
// Prepare the first sounding window in a worker, then retain the established Web Audio clock.
async function playReady(lines,opts,onEnd){
 const s={...DEFAULTS,...opts};
 if(!window.FaustEngine?.available||![s.timbre,...Object.values(s.partTimbres||{})].some(id=>Synth.MODELS[id]?.faust))return play(lines,opts,onEnd);
 stop();const mine=audioEpoch;ctx=new (window.AudioContext||window.webkitAudioContext)();const prepared=ctx;
 if(ctx.state==='suspended')ctx.resume().catch(()=>{});preparing={mine,onEnd};opts.onPreparing?.();
 try{
  const plan=schedule(lines,{tempo:s.tempo});let at=0;
  if(s.startToken){const e=plan.events.find(e=>e.token===s.startToken||e.token.src===s.startToken);if(e)at=(plan.events.find(g=>g.grace&&Math.abs(g.scoreStart-e.scoreStart)<1e-8)||e).start}
  await Synth.prewarm(renderPlans(plan.events,s,ctx.sampleRate).filter(p=>p.at>=at-.1&&p.at<at+3.6*s.tempo/60));
  if(mine!==audioEpoch||ctx!==prepared)return false;
  preparing=null;return play(lines,{...opts,_preparedContext:prepared},onEnd);
 }catch(e){if(mine===audioEpoch)stop();throw e}
}

// Returns false when there is nothing to play. opts: settings (see DEFAULTS) + onBeat(index, beatsPerBar).
function play(lines,opts,onEnd){
 const reuse=opts._preparedContext&&ctx===opts._preparedContext;
 if(!reuse)stop();
 const s={...DEFAULTS,...opts,...mix(opts.balance??DEFAULTS.balance)},all=schedule(lines,{tempo:s.tempo}),total=all.total;
 // Optional start point: a token of the converted score or of the original (source) score.
 let offset=0,writtenOffset=0;if(s.startToken){const hit=all.events.find(e=>e.token===s.startToken||e.token.src===s.startToken);if(hit){const first=all.events.find(e=>e.grace&&(e.mainToken===hit.token||Math.abs(e.scoreStart-hit.scoreStart)<1e-8))||hit;offset=first.start;writtenOffset=first.scoreStart}}
 const events=all.events.filter(e=>e.start>=offset-1e-9);
 if(!events.length)return false; // silent cursor-only playback is allowed (melody and metronome both off)
 if(!reuse){if(ctx){ctx.close();}ctx=new (window.AudioContext||window.webkitAudioContext)()}dry=wet=melodyBus=clickBus=null;
 if(ctx.state==='suspended')ctx.resume().catch(()=>{});
 const audioContext=ctx;
 const spb=60/s.tempo,m=meter(s.time==='auto'?timeAt(all,writtenOffset):s.time),barBeats=m.beats*m.unit;
 // Playback starts right at the chosen note; clicks keep the piece's bar phase, so the accented click still falls
 // on each bar's first beat (count-in, when on, adds one bar before the start).
 const lead=s.countIn&&s.metronome?barBeats:0,t0=ctx.currentTime+0.12,start=t0+(lead-offset)*spb,cells=new Set();
 timbreName=s.timbre in TIMBRES?s.timbre:'flute';setupMix();melodyBus.gain.value=s.melodyVol;clickBus.gain.value=s.clickVol;
 // Notes are rendered just ahead of time (about 1.2 s) so long scores start at once. Each part may have its own
 // timbre (s.partTimbres) or be muted (s.partMute); chords sound all their notes.
 for(const id of all.parts){const bus=ctx.createGain();bus.gain.value=s.partMute?.[id]?0:1;bus.connect(melodyBus);partBuses.set(id,bus)}
 const prevByPart=new Map(),timbreOf=p=>{const t=s.partTimbres?.[p];return t&&t in TIMBRES?t:timbreName};
 const plans=renderPlans(events,s,ctx.sampleRate);let wi=0;
 let si=0;const ahead=()=>{if(s.muteMelody)return;
  const warm=[];while(wi<plans.length&&start+plans[wi].at*spb<ctx.currentTime+3.6)warm.push(plans[wi++]);
  if(warm.length)Synth.prewarm(warm).catch(()=>{});while(si<events.length&&start+events[si].start*spb<ctx.currentTime+1.2){const e=events[si++];
  const when=start+e.start*spb,now=ctx.currentTime,late=when<now-0.04,prev=prevByPart.get(e.part),bus=partBuses.get(e.part);
  // Never replay a backlog at the current instant. Resume only the tail of a still-sounding note.
  const resumeOffset=late?Math.max(0,now-when):0;
  if(late&&(e.percussion||when+e.beats*spb<=now)){prevByPart.set(e.part,e.midi!=null?e:null);continue}
  if(e.percussion){percussion(when,(e.token.orns||[]).includes('accent'),e.stacc,bus);prevByPart.set(e.part,null)}
  else if(e.midis){for(const mm of e.midis)tone(when,mm,e.beats*spb,e.legato,e.stacc,0.75,null,timbreOf(e.part),bus,resumeOffset);prevByPart.set(e.part,null)}
  else if(e.midi!=null){tone(when,e.midi,e.beats*spb,e.legato,e.stacc,1,prev&&prev.legato?prev.midi:null,timbreOf(e.part),bus,resumeOffset,!!e.grace);prevByPart.set(e.part,e)}
  else prevByPart.set(e.part,null)}};
 ahead();
 const beats=[],clicks=[];let ci=0;
 if(s.metronome){
  const until=Math.max(all.writtenTotal,writtenOffset+barBeats),grid=metronomeGrid(all,s,writtenOffset,until);
  if(lead){
   const signature=s.time==='auto'?timeAt(all,writtenOffset):s.time;
   const boundaries=[0,...all.writtenBars,...all.timeChanges.map(c=>c.at)].filter(b=>b<=writtenOffset+1e-8);
   let anchor=s.time==='auto'?Math.max(...boundaries):0;
   const firstBar=all.writtenBars.find(b=>b>1e-6);if(s.time==='auto'&&anchor===0&&firstBar<barBeats-1e-6)anchor=firstBar-barBeats;
   const phase=writtenOffset-anchor;
   for(const item of metronomeGrid(all,{...s,time:signature},phase-lead,phase))grid.push({...item,beat:item.beat+anchor});
  }
  for(const item of grid){
   const when=start+(item.beat<writtenOffset?offset+item.beat-writtenOffset:all.warpBeat(item.beat))*spb;
   clicks.push({when,kind:item.kind});if(item.index!=null)beats.push({time:when,index:item.index,count:item.count,signature:item.signature});
  }
  beats.sort((a,b)=>a.time-b.time);clicks.sort((a,b)=>a.when-b.when);
 }
 // Clicks are created just ahead of time too (about 1.2 s), never all at once.
 const aheadClicks=()=>{while(ci<clicks.length&&clicks[ci].when<ctx.currentTime+1.2){const item=clicks[ci++];if(item.when>=ctx.currentTime-0.04)click(item.when,item.kind,1)}};aheadClicks();
 const end=Math.max(start+total*spb,s.metronome?start+all.warpBeat(Math.max(all.writtenTotal,writtenOffset+barBeats))*spb:0);
 playing={raf:0,timer:0,cells,onEnd};const session=playing;
 // The audio clock runs independently of visual animation, which WebViews pause when hidden/occluded.
 const audioPulse=()=>{if(playing!==session||ctx!==audioContext)return;if(ctx.currentTime>=end+0.05){stop();return}ahead();aheadClicks()};
 session.timer=setInterval(audioPulse,50);
 let idx=0,bi=0;const current=new Map(),leadPart=all.parts.includes(s.followPart)?s.followPart:(all.parts[0]??'');
 const tick=()=>{
  if(playing!==session||ctx!==audioContext)return;const now=ctx.currentTime,latest=new Map();
  // When returning to the foreground, render only each part's current note, not every missed frame.
  while(idx<events.length&&start+events[idx].start*spb<=now){const ev=events[idx++];latest.set(ev.part,ev)}
  for(const [part,ev] of latest){const els=visibleTargets(ev.token);
   for(const c of current.get(part)||[])c.classList.remove('jp-playing');current.set(part,els);
   for(const c of els){c.classList.add('jp-playing');cells.add(c)}
   if(!ev.grace&&(ev.part??'')===leadPart)document.dispatchEvent(new CustomEvent('scoreplay',{detail:{token:ev.token,el:els[0]||null}}));
  }
  let beat=null;while(bi<beats.length&&beats[bi].time<=now)beat=beats[bi++];if(beat)s.onBeat?.(beat.index,beat.count,beat.signature);
  if(now>=end+0.05){stop();return}
  session.raf=requestAnimationFrame(tick);
 };
 session.raf=requestAnimationFrame(tick);
 return true;
}

function tempoName(bpm){return bpm<40?'Grave':bpm<60?'Largo':bpm<66?'Larghetto':bpm<76?'Adagio':bpm<108?'Andante':bpm<120?'Moderato':bpm<156?'Allegro':bpm<176?'Vivace':bpm<200?'Presto':'Prestissimo'}

// Small SVG rhythm icon for a pattern (note heads, stems, beams, flags, rests, dots, triplet bracket).
function patternIcon(p){
 const W=64,H=44,n=p.notes.length,xs=p.notes.map((_,i)=>n===1?W/2:12+i*(W-24)/(n-1)),headY=34,stemTop=10;
 let out='';
 const beamable=i=>!p.notes[i].rest&&p.notes[i].d<1;
 const level=i=>p.notes[i].d<=0.25||(p.notes[i].dot&&p.notes[i].d<0.5)?2:p.notes[i].d<1?1:0;
 p.notes.forEach((note,i)=>{
  const x=xs[i];
  if(note.rest){out+=`<path d="M${x-3} ${headY-12} q4 3 6 -1 l-5 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="${x-3}" cy="${headY-12}" r="2" fill="currentColor"/>`;return}
  const hollow=note.d>=2;
  out+=`<ellipse cx="${x}" cy="${headY}" rx="4.6" ry="3.4" transform="rotate(-20 ${x} ${headY})" fill="${hollow?'none':'currentColor'}" stroke="currentColor" stroke-width="1.4"/>`;
  out+=`<line x1="${x+4}" y1="${headY-1}" x2="${x+4}" y2="${stemTop}" stroke="currentColor" stroke-width="1.4"/>`;
  if(note.dot)out+=`<circle cx="${x+9}" cy="${headY}" r="1.6" fill="currentColor"/>`;
 });
 // Beams across neighbouring beamable notes; a lone beamable note gets flags.
 for(let i=0;i<n;i++){
  if(!beamable(i))continue;
  const prev=i>0&&beamable(i-1),next=i<n-1&&beamable(i+1);
  if(!prev&&!next){out+=`<path d="M${xs[i]+4} ${stemTop} q8 6 4 14" fill="none" stroke="currentColor" stroke-width="1.6"/>`;continue}
  if(next)out+=`<line x1="${xs[i]+4}" y1="${stemTop}" x2="${xs[i+1]+4}" y2="${stemTop}" stroke="currentColor" stroke-width="3"/>`;
  if(level(i)===2){
   if(next&&level(i+1)===2)out+=`<line x1="${xs[i]+4}" y1="${stemTop+5}" x2="${xs[i+1]+4}" y2="${stemTop+5}" stroke="currentColor" stroke-width="3"/>`;
   else if(!(prev&&level(i-1)===2)){const dir=next?1:-1;out+=`<line x1="${xs[i]+4}" y1="${stemTop+5}" x2="${xs[i]+4+dir*6}" y2="${stemTop+5}" stroke="currentColor" stroke-width="3"/>`}
  }
 }
 if(p.tuplet)out+=`<path d="M${xs[0]} 5 v-3 h${xs[n-1]-xs[0]+4} v3" fill="none" stroke="currentColor" stroke-width="1"/><text x="${(xs[0]+xs[n-1]+4)/2}" y="5" font-size="8" text-anchor="middle" fill="currentColor" font-style="italic">3</text>`;
 return `<svg viewBox="0 -4 ${W} ${H+4}" width="${W}" height="${H}" aria-hidden="true">${out}</svg>`;
}

// Sustained reference tone (fractional MIDI allowed, e.g. for A4 = 442 Hz); returns a stop function.
function referenceTone(midi,seconds=4){
 stop();if(ctx){ctx.close()}ctx=new (window.AudioContext||window.webkitAudioContext)();dry=wet=melodyBus=clickBus=null;timbreName='reference';
 const mine=ctx;tone(ctx.currentTime+0.03,midi,seconds,false,false,0.9,null);
 const timer=setTimeout(()=>{if(ctx===mine&&!playing){ctx.close();ctx=null;dry=wet=melodyBus=clickBus=null}},(seconds+0.5)*1000);
 return()=>{clearTimeout(timer);if(ctx===mine&&!playing){ctx.close();ctx=null;dry=wet=melodyBus=clickBus=null}};
}
// The comparison phrases are original exercises and use identical pitch, articulation and timing.
const PREVIEW_PHRASES={
 melody:[[60,.3],[62,.3],[64,.3],[67,.3],[69,.6],[67,.3],[64,.3],[62,.3],[60,.9]],
 range:[[55,.55],[60,.55],[67,.55],[72,.55],[79,.55],[84,.9]],
 grace:[[62,.4],[69,.035,true],[64,.365],[64,.035,true],[67,.365],[62,.8],[60,.8]],
};
async function previewTimbre(name,vol=.8,{phrase='melody',dry:dryOnly=false,onEnd=null}={}){
 stop();const mine=audioEpoch;
 ctx=new (window.AudioContext||window.webkitAudioContext)();const audio=ctx;dry=wet=melodyBus=clickBus=null;
 if(ctx.state==='suspended')ctx.resume().catch(()=>{});
 timbreName=name in TIMBRES?name:'flute';previewEnd=onEnd;
 try{
  let at=0;const notes=(PREVIEW_PHRASES[phrase]||PREVIEW_PHRASES.melody).map(([midi,dur,grace])=>{const n={at,timbre:timbreName,midi,dur,sr:audio.sampleRate,grace:!!grace};at+=dur;return n});
  await Synth.prewarm?.(notes);if(mine!==audioEpoch||ctx!==audio)return false;
  // Render the whole phrase before starting: matched RMS and no buffer-render latency between notes.
  const data=new Float32Array(Math.ceil((at+.35)*audio.sampleRate));
  for(const n of notes){const b=Synth.note(n.timbre,n.midi,n.dur,n.sr,null,{grace:n.grace}),d=b.getChannelData(0),begin=Math.round(n.at*n.sr);for(let i=0;i<d.length&&begin+i<data.length;i++)data[begin+i]+=d[i]}
  let sum=0,peak=0;for(const x of data){sum+=x*x;peak=Math.max(peak,Math.abs(x))}
  const gain=Math.min(.16/(Math.sqrt(sum/data.length)||1),.85/(peak||1))*vol;
  const buffer=audio.createBuffer(1,data.length,audio.sampleRate);buffer.copyToChannel(data,0);
  setupMix();melodyBus.gain.value=gain;if(dryOnly)wet.gain.value=0;
  const src=audio.createBufferSource();src.buffer=buffer;src.connect(melodyBus);src.start(audio.currentTime+.05);
  previewTimer=setTimeout(()=>{if(mine===audioEpoch&&ctx===audio)stop()},(at+.6)*1000);
  return true;
 }catch(e){if(mine===audioEpoch)stop();console.warn('音色试听失败',e.message);return false}
}

const TIMBRE_LIST=Object.entries(TIMBRES).map(([id,t])=>[id,t.label]);
// Changes the melody / metronome balance of the running playback without restarting it.
function setBalance(b){
 if(!ctx||!melodyBus)return;const m=mix(b),t=ctx.currentTime;
 melodyBus.gain.setTargetAtTime(m.melodyVol,t,0.04);clickBus.gain.setTargetAtTime(m.clickVol,t,0.04);
}
// Muting routes both sounding and already scheduled notes through a silent part bus.
// Keep scheduling muted parts so unmuting resumes at the current time, including held notes.
function setPartMute(id,muted){
 const bus=partBuses.get(id);if(!playing||!ctx||!bus)return;
 bus.gain.setTargetAtTime(muted?0:1,ctx.currentTime,0.008);
}
window.ScorePlayer={metronomeGrid,timingWarnings,setPartMute,setBalance,referenceTone,previewTimbre,PREVIEW_PHRASES,TIMBRE_LIST,play,playReady,stop,schedule,isPlaying:()=>!!playing||preparing!=null,PATTERNS,loadSettings,saveSettings,tempoName,patternIcon,meter};
})();
// Modified by AI on 2026-10-10 13:56:00
