const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.resolve('web');
const read=n=>fs.readFileSync(path.join(base,n),'utf8');
const ctx=vm.createContext({window:{},localStorage:{getItem:()=>null},console});
for(const n of ['jianpu.js','score-ocr.js','player.js','staff.js'])new vm.Script(read(n),{filename:n}).runInContext(ctx);
const {Jianpu:J,ScoreOCR:O,ScorePlayer:P,Staff:S}=ctx.window;
const text='0/X/ X/X/ | 0/X/ 0/X/ | 0/X/ X/X/ | 0/X/ 0/X/ | 0/X/ X/X/ | 0/X/ 0/X/ | 0/X/ X/X/ |';
const parsed=J.parse(text),ts=parsed.lines[0].tokens,schedule=P.schedule(parsed.lines);
assert.equal(parsed.notes.length,0);assert.equal(ts.filter(t=>t.t==='percussion').length,18);assert.equal(ts.filter(t=>t.t==='rest').length,10);
assert.equal(schedule.total,14);assert.equal(schedule.events.length,28);assert.equal(schedule.events.filter(e=>e.percussion).length,18);
assert.ok(schedule.events.every((e,i)=>e.beats===.5&&e.start===i*.5&&e.midi===null));assert.equal(J.serialize(parsed.lines),text);
assert.equal(J.serialize(J.parse('x/ X// X/. X - 3{X/X/X/} X!accent').lines),'X/ X// X/. X - 3{X/X/X/} X!accent');
assert.equal(P.schedule(J.parse('X -').lines).events.length,1);assert.equal(P.schedule(J.parse('X -').lines).total,2);
assert.equal(P.schedule(J.parse('3{X/X/X/}').lines).total,1);assert.equal(P.schedule(J.parse('|: X 0 :|').lines).total,4);
for(const bad of ["X'",'bX','#x','^X','X/////','X...','X!unknown','<1 X>'])assert.throws(()=>J.parse(bad),undefined,bad);
assert.equal(O.cleanReply('说明\nX/X/ |\n1 2 |'),'X/X/ |\n1 2 |');
// Exercise the real conversion function with fixed pitch labels and UI preferences only stubbed.
ctx.Jianpu=J;ctx.$=()=>({value:'sharp'});ctx.keyName=()=> 'F';ctx.mod=n=>(n%12+12)%12;
ctx.STEPS=[0,2,4,5,7,9,11];ctx.DIGITS_FLAT=['1','b2','2','b3','3','4','b5','5','b6','6','b7','7'];ctx.DIGITS_SHARP=['1','#1','2','#2','3','4','#4','5','#5','6','#6','7'];
ctx.fixedNote=m=>({letter:String(m)});
const html=read('index.html');new vm.Script(html.slice(html.indexOf('function parseScore('),html.indexOf('function updateScore('))).runInContext(ctx);
const converted=ctx.convertScore('@key 1=F\n1 X/0/ 2 |',5,4,12,false);
assert.deepEqual(Array.from(converted.notes),[77,79]);assert.equal(converted.percussionCount,1);assert.match(converted.plain,/4' X\/0\/ 5'/);
const cx=converted.lines.find(l=>l.kind==='music').tokens.find(t=>t.t==='percussion');
assert.notEqual(cx,cx.src,'source and converted views must own separate cells');assert.equal(cx.src.t,'percussion');
const view=read('score-view.js');new vm.Script(view.slice(view.indexOf('function buildTransposed()'),view.indexOf('// Writes the pitch'))).runInContext(ctx);
ctx.lastConverted=ctx.convertScore('X/X/ |',5,4,12,false);ctx.KEY_NAMES=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
ctx.$=id=>({value:id==='transKey'?'7':id==='transMode'?'move':'5'});
const trans=ctx.buildTransposed(),before=ctx.lastConverted.lines[0].tokens[0],after=trans[0].tokens[0];
assert.notEqual(after,before,'transposition view must own its own X cells');assert.equal(after.src,before.src);assert.equal(after.midi,undefined);assert.equal(J.serialize(trans),'X/X/ |');
ctx.$=()=>({value:'sharp'});
const mixed=ctx.convertScore('@key 1=F\n@part 笛 · 竹笛\n@part 打 · 打击乐\n[笛] 1 2 |\n[打] 0/X/ X/X/ |',5,4,0,false);
assert.equal(P.schedule(mixed.lines).total,2);assert.equal(P.schedule(mixed.lines).events.filter(e=>e.percussion).length,3);
const tied=ctx.convertScore('(1 X 1)',0,4,0,false);assert.equal(P.schedule(tied.lines).events.length,3);
const abc=S.toABC(parsed.lines).abc;assert.equal((abc.match(/!style=x!/g)||[]).length,18);assert.match(abc,/clef=perc/);
const ABC=require(path.join(base,'vendor/abcjs/abcjs-basic-min.js'));
for(const lines of [parsed.lines,mixed.lines,converted.lines,J.parse('X - | - | X/.X// 0 |').lines]){
 const a=S.toABC(lines).abc,tune=ABC.parseOnly(a)[0];assert.ok(tune);assert.ok(!tune.warnings?.length,JSON.stringify(tune.warnings));
 const es=tune.lines.flatMap(l=>(l.staff||[]).flatMap(s=>s.voices.flat())).filter(e=>e.el_type==='note');
 assert.ok(es.some(e=>e.style==='x'||e.pitches?.some(p=>p.style==='x')),'ABC cross heads survive parsing');
}
// Minimal Web Audio spy: X must use the melody bus and never call pitched synthesis; mute must suppress it.
let hits=[],melodic=0;
class Audio {
 constructor(){this.currentTime=0;this.sampleRate=8000;this.destination={}}
 createGain(){return {gain:{value:0,setTargetAtTime(v){this.value=v}},connect(target){this.target=target}}}
 createDynamicsCompressor(){return Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,{value:0}]).concat([['connect',()=>{}]]))}
 createConvolver(){return {connect(){}}}
 createBuffer(c,n){const d=new Float32Array(n);return {getChannelData:()=>d}}
 createBufferSource(){const h={connect(target){this.target=target},start(t){hits.push({time:t,node:this})},stop(){}};return h}
 close(){}
}
ctx.window.AudioContext=Audio;ctx.Synth={MODELS:{flute:{gain:1,reverb:0}},impulse:()=>null,note:()=>{melodic++;return null}};
ctx.requestAnimationFrame=()=>1;ctx.cancelAnimationFrame=()=>{};ctx.document={dispatchEvent(){}};ctx.CustomEvent=class {};
P.play(J.parse('X/ 0/ X/').lines,{tempo:120},()=>{});assert.equal(hits.length,2);assert.equal(melodic,0);P.stop();
hits=[];P.play(J.parse('[打] X/ X/').lines,{tempo:120,partMute:{打:true}},()=>{});assert.equal(hits.length,2);assert.ok(hits.every(h=>h.node.target.target.gain.value===0),'muted hits stay scheduled behind a silent part bus');P.stop();
hits=[];P.play(J.parse('X X').lines,{tempo:120,muteMelody:true},()=>{});assert.equal(hits.length,0);P.stop();
const tool=require(path.resolve('outputs/ai-score-checker/validate-score.cjs')),app=tool.loadApp({});
for(const x of ['X X |','x/x/ |',text]){const r=tool.validate(x,{kind:'jianpu'},app).report;assert.equal(r.ok,true);assert.ok(r.summary.percussion>0)}
assert.equal(tool.validate('\n'.repeat(29)+text,{kind:'jianpu'},app).report.ok,true);
console.log('PASS: exact 7-bar user example (18 hits/10 rests/14 beats); rhythm/roundtrip/errors; cleanup; real transposition; parts; ABC cross heads; audio/mute dispatch; X-only checker; line 30.');
// Modified by AI on 2026-10-08 10:06:28
