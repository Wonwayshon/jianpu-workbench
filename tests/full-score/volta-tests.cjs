const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({window:{},localStorage:{getItem:()=>null,setItem(){}}});
for(const f of ['jianpu.js','player.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
const {Jianpu:J,ScorePlayer:P}=c.window;
function score(text){const p=J.parse(text);for(const n of p.notes)n.midi=60+[0,2,4,5,7,9,11][n.degree-1]+12*n.octave+n.acc;return p}
function sequence(text,expected){const p=score(text),before=J.serialize(p.lines),plan=P.schedule(p.lines);assert.deepEqual(Array.from(plan.events,e=>e.token.degree),expected,text);assert.equal(J.serialize(p.lines),before,'playback never changes written endings');return plan}
sequence('|: 1 | [1. 2 :| [2. 3 | 4 |',[1,2,1,3,4]);
sequence('1 | [1 2 :| [2 3 |',[1,2,1,3]);
sequence('|: 1 | [1 2 | 3 :| [2 4 | 5 |',[1,2,3,1,4,5]);
sequence('|: 1 | [1 2 :| [2 3 | |: 4 | [1 5 :| [2 6 | 7 |',[1,2,1,3,4,5,4,6,7]);
sequence('|: 1 :||: 2 :| 3 |',[1,1,2,2,3]);
sequence('|: 1 | |: 2 :| 3 :| 4 |',[1,2,2,3,1,2,2,3,4]);
sequence('|: 1 | [1 2 | [2 3 :| 4 |',[1,2,1,3,4]);
const nested=sequence('|: 1 | |: 2 | [1 3 :| [2 4 | 5 :| 6 |',[1,2,3,2,4,5,1,2,3,2,4,5,6]);assert.equal(nested.total,13);
// A short opening repeat precedes a different repeat crossing systems and a page.
// All pitches/rhythms below are synthetic; there is no archived user score in the fixture.
const body=['1 2 3 4','2 3 4 5','3 4 5 6'];
const text='@time 4/4\n@part A · 笛\n@part B · 琴\n'+
 '[A] |: 1 2 3 4 :| |: '+body.slice(0,2).join(' | ')+' |\n'+
 '[B] |: 4 3 2 1 :| |: '+body.slice(0,2).join(' | ')+' |\n@page 2\n'+
 '[A] '+body[2]+' | [1 4 3 2 1 :| [2 7 6 5 4 |\n'+
 '[B] '+body[2]+' | [1 1 2 3 4 :| [2 4 5 6 7 |\n'+
 '@time 2/4\n[A] 1 - |\n[B] 5 - |';
const full=score(text),plan=P.schedule(full.lines);assert.equal(plan.total,42);assert.equal(P.timingWarnings(full.lines).length,0);
for(const part of ['A','B']){
 const events=plan.events.filter(e=>e.part===part),tokens=full.lines.filter(l=>l.kind==='music'&&l.part===part).flatMap(l=>l.tokens),endings=tokens.filter(t=>t.t==='volta');
 const first=tokens[tokens.indexOf(endings[0])+2],second=tokens[tokens.indexOf(endings[1])+2];
 assert.equal(events.filter(e=>e.token===first).length,1,'first ending plays once per part');
 assert.equal(events.filter(e=>e.token===second).length,1,'second ending plays once per part');
 assert.equal(events.find(e=>e.token===second).scoreStart,36,'both voices enter ending two together');
 assert.equal(events.at(-1).scoreStart,40,'both voices resume the next section together');
}
const accents=P.metronomeGrid(plan,{time:'auto',pattern:'quarter',accent:true}).filter(e=>e.kind==='accent');assert.deepEqual(Array.from(accents,e=>e.beat),[0,4,8,12,16,20,24,28,32,36,40]);
const metered=score('@time 3/4\n|: 1 2 3 | [1\n@time 2/4\n4 5 :| [2 6 7 1 |\n@time 4/4\n2 3 4 5 |');
assert.deepEqual(Array.from(P.schedule(metered.lines).timeChanges,e=>[e.at,e.time]),[[0,'3/4'],[3,'2/4'],[5,'3/4'],[11,'4/4']]);
const ornaments=score('|: 1 | [1 ^2//3!fermata :| [2 4 |');const o=P.schedule(ornaments.lines);assert.equal(o.events.filter(e=>e.grace).length,1);assert.equal(o.holds.length,1);assert.equal(o.writtenTotal,4);
console.log('PASS: first/second endings, implicit/adjacent/nested/combined repeats, cross-page two-part attacks, metronome/meter restoration, grace/fermata and immutable written score.');
// Modified by AI on 2026-10-27 14:04:36
