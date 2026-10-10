const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Buffer{constructor({length,sampleRate}){this.length=length;this.sampleRate=sampleRate;this.duration=length/sampleRate}copyToChannel(data){this.data=data}}
const c=vm.createContext({window:{},atob,WebAssembly,AudioBuffer:Buffer});for(const f of ['vendor/faust/models','faust-engine','jianpu','synth','player'])vm.runInContext(fs.readFileSync('web/'+f+'.js','utf8'),c);
const J=c.window.Jianpu,P=c.window.ScorePlayer,S=c.window.Synth,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const parse=text=>{const p=J.parse(text);for(const t of p.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1]+12*t.octave+t.acc;return p};
const text='@time 4/4\n@part A · 第一笛\n@part B · 第二笛\n[A] |: 2/ ^6//3/ ^3//5/2/ 1/2/ 6/5/ :| 1 - - - |\n[B] |: 2/2/ 5/5/ 6/3/ 1/3/ :| 1 - - - |';
for(const tempo of [40,62,80,120,240]){
 const p=parse(text),plan=P.schedule(p.lines,{tempo});near(plan.total,12);near(plan.writtenTotal,12);assert.deepEqual(Array.from(plan.writtenBars),[0,4,8,12]);
 const graces=plan.events.filter(e=>e.grace);assert.equal(graces.length,4);
 for(const g of graces){const hosts=plan.events.filter(e=>!e.grace&&Math.abs(e.scoreStart-g.scoreStart)<1e-7&&e.midi!=null);assert.equal(hosts.length,2);near(hosts[0].start,hosts[1].start);near(hosts[0].start,g.start+g.beats);assert.ok(g.beats*60/tempo<=.060001);for(const h of hosts)assert.ok(h.beats>0)}
 for(const part of ['A','B'])near(plan.events.filter(e=>e.part===part).at(-1).start,8);
 assert.equal(P.timingWarnings(p.lines).length,0,'graces never inflate written bar lengths');
}
// Multiple graces share the same short slice; a simultaneous fast voice limits the borrowed slice.
const multi=parse('@part A · 胡\n@part B · 笛\n[A] ^3//^4//5 6 |\n[B] 1///2///3/4// 5 |');
const plan=P.schedule(multi.lines,{tempo:40}),graces=plan.events.filter(e=>e.grace);assert.equal(graces.length,2);assert.ok(graces.reduce((n,e)=>n+e.beats,0)*60/40<.06);
near(plan.events.find(e=>e.part==='A'&&!e.grace).start,plan.events.find(e=>e.part==='B').start);
// Fermata hold belongs to the complete written note even when that note has a grace.
const held=P.schedule(parse('@part A · 胡\n@part B · 笛\n[A] ^6//1!fermata - | 2 |\n[B] 3 - | 4 |').lines,{tempo:62});near(held.total,4.2);near(held.holds[0][1],1.2);
near(held.events.find(e=>e.part==='A'&&e.token.degree===2).start,3.2);near(held.events.find(e=>e.part==='B'&&e.token.degree===4).start,3.2);
// Grace articulation has a rapid release rather than a 90–350 ms normal instrument tail.
for(const name of Object.keys(S.MODELS)){
 const normal=S.note(name,72,.06,8000,null),short=S.note(name,72,.06,8000,null,{grace:true});assert.notEqual(short,normal);assert.ok(short.duration<=.069,`${name}: ${short.duration}`);assert.ok(short.data.some(x=>Math.abs(x)>.1),`${name} grace remains audible`);
 const tiny=S.note(name,72,.02,8000,null,{grace:true});assert.ok(tiny.duration<=.026);
}
console.log('PASS: two adjacent grace figures align both main attacks at 5 tempos; repeated occurrences and following bars retain duration; multiple graces/fast accompaniment/fermata holds; rapid audible grace envelopes across all timbres.');
// Modified by AI on 2026-10-10 15:14:48
