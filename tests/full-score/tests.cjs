const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir='web/',read=f=>fs.readFileSync(dir+f,'utf8');
const c=vm.createContext({window:{},localStorage:{getItem:()=>null,setItem(){}}});
for(const f of ['jianpu.js','score-ocr.js','player.js'])vm.runInContext(read(f),c);
const {Jianpu:J,ScoreOCR:O,ScorePlayer:P}=c.window;
const prompts=[];
for(const kind of ['jianpu','staff'])for(const scope of ['part','full']){
 const text=O.promptFor(kind,'保留第 2 页',scope);prompts.push(text);
 assert.match(text,scope==='full'?/提取范围：总谱 · 所有声部/:/提取范围：分谱 · 指定乐器/);
 assert.ok(text.endsWith('补充说明：保留第 2 页'));
 if(scope==='full'){assert.match(text,/各声部累计时值一致/);assert.match(text,/@part/);assert.match(text,/全局指令/)}
}
assert.equal(new Set(prompts).size,4);
assert.match(O.promptFor('staff','','full'),/实际发声音高/);
assert.match(O.promptFor('staff','','part'),/按谱面记谱音高转写/);
const p=J.parse('@key 1=C\n@time 2/4\n@part 笛 · 竹笛\n@part 琴 · 钢琴\n@part 打 · 打击\n[笛] 1 - |\n[琴] <1, 3, 5,> - |\n[打] 0/X/ X/X/ |\n\n[笛] 2 3 |\n[琴] 0 <2, 4, 6,> |\n[打] X 0 |');
for(const t of p.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1]+12*t.octave+t.acc;
const schedule=P.schedule(p.lines);assert.equal(schedule.total,4);assert.equal(schedule.parts.length,3);
assert.equal(schedule.events.find(e=>e.part==='琴').start,0);assert.equal(schedule.events.find(e=>e.midi===62&&e.part==='笛').start,2);
let contexts=[],hits=[],raf,audioPump,timerActive=false;
class Audio{
 constructor(){contexts.push(this);this.currentTime=0;this.sampleRate=8000;this.destination={};this.closed=false}
 createGain(){return {gain:{value:0,setTargetAtTime(v){this.value=v}},connect(t){this.target=t}}}
 createDynamicsCompressor(){return Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,{value:0}]).concat([['connect',()=>{}]]))}
 createConvolver(){return {connect(){}}}
 createBuffer(n,len){return {getChannelData:()=>new Float32Array(len)}}
 createBufferSource(){return {connect(t){this.target=t},start(time,offset=0){hits.push({node:this,time,offset})},stop(){}}}
 close(){this.closed=true}
}
c.window.AudioContext=Audio;c.Synth={MODELS:{flute:{gain:1,reverb:0},piano:{gain:1,reverb:0}},impulse:()=>null,note:(t,m,dur,sr,prev,options)=>({t,m,dur,grace:!!options?.grace})};
c.setInterval=f=>(audioPump=f,timerActive=true,2);c.clearInterval=()=>{timerActive=false};
c.requestAnimationFrame=f=>(raf=f,1);c.cancelAnimationFrame=()=>{};c.document={dispatchEvent(){}};c.CustomEvent=class{};
assert.equal(P.play(p.lines,{tempo:120,partTimbres:{琴:'piano'},partMute:{琴:true}},()=>{}),true);
const flute=hits.find(h=>h.node.buffer?.m===60),chord=hits.filter(h=>h.node.buffer?.t==='piano');
assert.ok(flute);assert.equal(chord.length,3);assert.equal(chord[0].time,flute.time);
const bus=h=>h.node.target.target;assert.equal(bus(flute).gain.value,1);assert.ok(chord.every(h=>bus(h).gain.value===0));
contexts[0].currentTime=.3;P.setPartMute('笛',true);P.setPartMute('琴',false);
assert.equal(bus(flute).gain.value,0);assert.ok(chord.every(h=>bus(h).gain.value===1));assert.equal(contexts.length,1);assert.ok(!contexts[0].closed&&P.isPlaying());
const drum=hits.find(h=>!h.node.buffer?.t);assert.ok(drum);P.setPartMute('打',true);assert.equal(bus(drum).gain.value,0);
contexts[0].currentTime=1;audioPump();raf();assert.equal(contexts.length,1);assert.ok(hits.some(h=>h.node.buffer?.m===62&&h.time===1.12));
P.setPartMute('不存在',true);P.stop();assert.ok(contexts[0].closed);P.setPartMute('琴',false);

// Starting from the main note must include its preceding grace notes.
const gracePiece=J.parse("2'/^6'//3'/ |");for(const t of gracePiece.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1]+12*t.octave;
hits=[];P.play(gracePiece.lines,{tempo:120,startToken:gracePiece.notes[2]},()=>{});
assert.deepEqual(hits.filter(h=>h.node.buffer?.m).map(h=>h.node.buffer.m),[81,76]);
assert.equal(hits[0].time,.12);assert.ok(Math.abs(hits[1].time-.18)<1e-8);assert.equal(hits[0].node.buffer.grace,true);assert.ok(hits[0].node.buffer.dur<=.060001);P.stop();

// Automatic meter changes affect both audible clicks and light counts, including repeats and mid-piece starts.
const changing=J.parse('@time 3/4\n1 2 3 |\n@time 4/4\n4 5 6 7 | 1 - - - |');
for(const t of changing.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1];
const changingSchedule=P.schedule(changing.lines),autoGrid=P.metronomeGrid(changingSchedule,{time:'auto',pattern:'quarter',accent:true});
assert.deepEqual(Array.from(autoGrid.slice(0,3),e=>[e.index,e.count]),[[0,3],[1,3],[2,3]]);
assert.deepEqual(Array.from(autoGrid.slice(3,7),e=>[e.index,e.count]),[[0,4],[1,4],[2,4],[3,4]]);
assert.deepEqual(Array.from(autoGrid.filter(e=>e.kind==='accent'),e=>e.beat),[0,3,7],'exactly one accent per written bar');
const manualGrid=P.metronomeGrid(changingSchedule,{time:'3/4',pattern:'quarter',accent:true});
assert.deepEqual(Array.from(manualGrid.slice(0,7),e=>e.index),[0,1,2,0,1,2,0],'manual meter runs continuously, without a boundary double-hit');
const repeatedMeters=J.parse('@time 3/4\n|: 1 2 3 |\n@time 4/4\n4 5 6 7 :|');
const rpt=P.schedule(repeatedMeters.lines);assert.deepEqual(Array.from(rpt.timeChanges,c=>[c.at,c.time]),[[0,'3/4'],[3,'4/4'],[7,'3/4'],[10,'4/4']]);
assert.deepEqual(Array.from(P.metronomeGrid(rpt,{time:'auto',pattern:'quarter',accent:true}).filter(e=>e.index===0),e=>e.beat),[0,3,7,10]);
const subdivided=P.metronomeGrid(changingSchedule,{time:'auto',pattern:'eighths',accent:true});assert.equal(new Set(subdivided.map(e=>e.beat)).size,subdivided.length);
let beatReports=[];hits=[];P.play(changing.lines,{tempo:60,metronome:true,onBeat:(i,n,time)=>beatReports.push([i,n,time])},()=>{});
for(let t=.12;t<7.2;t+=1){contexts.at(-1).currentTime=t+.001;audioPump();raf()}
assert.deepEqual(beatReports.slice(3,7),[[0,4,'4/4'],[1,4,'4/4'],[2,4,'4/4'],[3,4,'4/4']]);P.stop();
// Count-in from a later section uses that section's meter for the entire count-in.
beatReports=[];hits=[];P.play(changing.lines,{tempo:60,metronome:true,countIn:true,startToken:changing.notes[3],onBeat:(i,n,time)=>beatReports.push([i,n,time])},()=>{});
for(let t=.12;t<4.2;t+=1){contexts.at(-1).currentTime=t+.001;audioPump();raf()}
assert.ok(beatReports.every(r=>r[1]===4&&r[2]==='4/4'));assert.deepEqual(beatReports.map(r=>r[0]),[0,1,2,3,0]);P.stop();
console.log('PASS: 3/4 → 4/4 changes audible grid and light counts; no duplicate accent/click at boundaries; repeat meter restoration; continuous explicit meter; section-aware count-in.');

// Execute the actual UI functions and handlers with simple controls; no browser layout claims.
class El{
 constructor(){this.children=[];this.hidden=false;this.value='';this.attrs={};this.classList={toggle(){},remove(){},add(){}}}
 append(...x){this.children.push(...x)} replaceChildren(...x){this.children=x} add(x){this.append(x)} setAttribute(k,v){this.attrs[k]=v}
}
const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,new El());return elements.get(id)};
let stops=0,live=[],saved=0,played;
const u=vm.createContext({console,$,document:{createElement:()=>new El()},Option:function(text,value){return {text,value}},settings:{},scoreParts:()=>p.parts,ScorePlayer:{TIMBRE_LIST:[['flute','长笛']],setPartMute:(id,m)=>live.push([id,m]),isPlaying:()=>true,play:src=>(played=src,true)},save:()=>saved++,restartIfPlaying:()=>stops++,syncTimingWarning(){},syncTempoLabel(){},partSel:'all',perform:false,floatAvailable:false,floatDismissed:false,window:{},Platform:{setImmersive:()=>Promise.resolve()},setTimeout(){},rebuild(){},vIndex:0,clearStaffCursor(){},clearViewerHighlight(){},showBeat(){}});
const view=read('score-view.js');
vm.runInContext(view.slice(view.indexOf('function applyPartMutes('),view.indexOf("for(const [id,label] of ScorePlayer.TIMBRE_LIST)$('timbreSelect')")),u);
u.fillPartMixer();let box=$('partMixerInline');assert.equal(box.hidden,false);
box.children[3].children[0].children[0].checked=false;box.children[3].children[0].children[0].onchange();
assert.equal(u.settings.partMute['笛'],true);assert.ok(live.some(([id,m])=>id==='笛'&&m));assert.equal(stops,0);
box.children[4].children[2].onclick();assert.equal(u.settings.partMute['琴'],false);assert.equal(u.settings.partMute['笛'],true);assert.equal(stops,0);
box.children[2].children[0].onclick();assert.deepEqual(Object.keys(u.settings.partMute),[]);assert.ok(saved>=3);
vm.runInContext(view.slice(view.indexOf('function syncFloatPlayer()'),view.indexOf("$('floatClose').onclick")),u);
vm.runInContext(view.slice(view.indexOf('function setPlaying('),view.indexOf('function startPlayback(')),u);
u.ScorePlayer.tempoName=()=>'';
vm.runInContext(view.slice(view.indexOf('function setPerform('),view.indexOf("$('viewerPerform').onclick")),u);
u.setPlaying(true);assert.equal($('floatPlayer').hidden,false);u.setPerform(true);assert.equal($('floatPlayer').hidden,true);
u.setPlaying(true);assert.equal($('floatPlayer').hidden,true);u.setPlaying(false);assert.equal($('floatPlayer').hidden,true);
u.setPerform(false);assert.equal($('floatPlayer').hidden,false);u.floatDismissed=true;u.setPerform(true);u.setPerform(false);assert.equal($('floatPlayer').hidden,true);
$('scoreViewer').classList.contains=x=>x==='editing';u.floatDismissed=false;u.setPlaying(true);assert.equal($('floatPlayer').hidden,true,'editor toolbar replaces floating controls');$('scoreViewer').classList.contains=()=>false;u.setPlaying(true);assert.equal($('floatPlayer').hidden,false);
const all=[{part:'笛'},{part:'琴'}];u.lastConverted={notes:[60],lines:all};u.transAllLines=[{part:'笛',trans:true},{part:'琴',trans:true}];u.viewerOpen=false;u.view='source';u.F=lines=>lines.filter(l=>l.part==='笛');
vm.runInContext(view.slice(view.indexOf('function startPlayback('),view.indexOf('const toggle=')),u);
u.startPlayback();assert.equal(played,all);u.settings.partScope='visible';u.startPlayback();assert.equal(played.length,1);
u.settings.partScope='all';u.viewerOpen=true;u.vView='trans';u.startPlayback();assert.equal(played,u.transAllLines);
console.log('PASS: four scoped prompts; three-part simultaneous scheduling across systems; chords/percussion/live mute without restart; mixer controls; full/visible playback; performance floating-player lifecycle.');

// Actual audio scheduling and metronome both resume on the shared fermata clock.
const fermata=J.parse('@part A · 笛\n@part B · 琴\n[A] 1!fermata | 2 |\n[B] 5 | 2 |');for(const t of fermata.notes)t.midi=60+t.degree;
hits=[];P.play(fermata.lines,{tempo:60,metronome:true},()=>{});contexts.at(-1).currentTime=1;audioPump();raf();
const afterHold=hits.filter(h=>h.node.buffer?.m===62);assert.equal(afterHold.length,2);assert.ok(afterHold.every(h=>Math.abs(h.time-1.72)<1e-8));assert.ok(hits.some(h=>!h.node.buffer?.m&&Math.abs(h.time-1.72)<1e-8));P.stop();
// Starting after a hold preserves count-in spacing and does not repeat the hold.
hits=[];P.play(fermata.lines,{tempo:60,metronome:true,countIn:true,startToken:fermata.notes[1]},()=>{});contexts.at(-1).currentTime=3.1;audioPump();raf();const resumed=hits.filter(h=>h.node.buffer?.m===62);assert.ok(resumed.every(h=>Math.abs(h.time-4.12)<1e-8));assert.equal(resumed.length,2);P.stop();
vm.runInContext(view.slice(view.indexOf('function syncTimingWarning('),view.indexOf('window.onScoreConverted=')),u);u.ScorePlayer.timingWarnings=()=>['笛一第 52 行 10 拍；笛二第 53 行 14 拍'];u.syncTimingWarning([]);assert.equal($('playbackWarning').hidden,false);assert.match($('playbackWarning').textContent,/14 拍/);assert.equal($('viewerPlaybackWarning').hidden,false);u.ScorePlayer.timingWarnings=()=>[];u.syncTimingWarning([]);assert.equal($('playbackWarning').hidden,true);
console.log('PASS: real scheduling synchronizes post-fermata notes/metronome, count-in from a selected note, and timing-warning UI clear/update.');

// No animation callbacks run while another application covers the WebView. Audio must continue anyway.
const backgroundPiece=J.parse('1 2 3 4 | 5 6 7 1 |');for(const n of backgroundPiece.notes)n.midi=60+n.degree;
hits=[];let ended=0;P.play(backgroundPiece.lines,{tempo:60,metronome:true},()=>ended++);const backgroundContext=contexts.at(-1);
for(let time=0.5;time<=7.5;time+=0.5){backgroundContext.currentTime=time;audioPump()}
assert.equal(hits.filter(h=>h.node.buffer?.m).length,8,'audio continues without animation frames');
assert.equal(hits.filter(h=>!h.node.buffer?.m).length,8,'metronome continues on the same clock');
backgroundContext.currentTime=8.3;audioPump();assert.equal(ended,1);assert.equal(timerActive,false);
// A severely delayed scheduler must discard elapsed melody/percussion/clicks, not collapse them into a chord.
const delayed=J.parse('1 2 X 3 | 4 - - - |');for(const n of delayed.notes)n.midi=60+n.degree;
hits=[];P.play(delayed.lines,{tempo:60,metronome:true},()=>{});const delayedContext=contexts.at(-1);hits=[];
delayedContext.currentTime=3.6;audioPump();
assert.equal(hits.filter(h=>h.node.buffer?.m).length,2);assert.ok(hits.every(h=>h.time>=3.6));
assert.ok(Math.abs(hits.find(h=>h.node.buffer?.m===63).offset-.48)<1e-8,'resume the sounding tail without replaying its attack');
assert.equal(hits.filter(h=>!h.node.buffer?.m).length,1,'no old percussion or click backlog');
const count=hits.length;raf();raf();assert.equal(hits.length,count,'visual frames never schedule sound');
P.stop();assert.equal(timerActive,false);audioPump();assert.equal(hits.length,count,'stopped timer callback cannot revive audio');
console.log('PASS: audio and metronome run with animation suspended; missed notes/clicks are not replayed in a burst; stop releases the audio timer.');
// Modified by AI on 2026-10-09 00:37:16
