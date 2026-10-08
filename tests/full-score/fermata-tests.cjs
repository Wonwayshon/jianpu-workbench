const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({window:{}});for(const f of ['jianpu','player'])vm.runInContext(fs.readFileSync('web/'+f+'.js','utf8'),c);
const J=c.window.Jianpu,P=c.window.ScorePlayer,close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const make=(a,b)=>{const parsed=J.parse('@part A · 第一笛\n@part B · 第二笛\n[A] '+a+'\n[B] '+b);for(const n of parsed.notes)n.midi=60+n.degree;return P.schedule(parsed.lines)};
// Same bar-end hold on a sixteenth and an eighth, with a repeat: no accumulating drift.
const r=make('|: 2//3//2//3// 5//2//5//2// 1//1//2//3// 6//1//6//5//!fermata :| 1 - - - |','|: 2/3/ 5/2/ 1/7/ 6/5/!fermata :| 1 - - - |');
close(r.total,12.6);assert.equal(r.holds.length,2);close(r.holds[0][0],4);close(r.holds[0][1],.3);
for(const part of ['A','B']){const seq=r.events.filter(e=>e.part===part);close(seq[seq.length-1].start,8.6)}
close(r.warpBeat(4),4.3);close(r.warpBeat(8),8.6);
// A fermata written in only one part still controls the shared clock; simultaneous duplicates do not add.
let s=make('1!fermata - | 2 |','<1 3 5> - | 2 |');close(s.events.find(e=>e.part==='A'&&e.token.degree===2).start,3.2);close(s.events.find(e=>e.part==='B'&&e.token.degree===2).start,3.2);
s=make('1!fermata | 2 |','0!fermata | 2 |');close(s.total,2.6);assert.equal(s.holds.length,1);
// A held note crossing another part's fermata also lengthens, without a reattack.
s=make('1!fermata 2 | 3 |','5 - | 3 |');const held=s.events.find(e=>e.part==='B');close(held.beats,2.6);assert.equal(s.events.filter(e=>e.part==='B').length,2);
// Tied fermata + grace notes preserve written length and the next attack.
s=make('(1 1!fermata) | ^6//2 3 |','5 - | 2 3 |');close(s.events.find(e=>e.part==='A'&&e.grace).start,3.2);close(s.events.find(e=>e.part==='B'&&e.token.degree===2).start,3.28);close(s.events.find(e=>e.part==='A'&&!e.grace&&e.token.degree===2).start,3.28);close(s.total,5.2);
const solo=J.parse('1!fermata 2 |');for(const n of solo.notes)n.midi=60+n.degree;close(P.schedule(solo.lines).total,2.6);
console.log('PASS: unequal fermata subdivisions, shared holds, repeats, rests/chords, held notes, ties/graces, written beat mapping and solo compatibility.');

// Synthetic mismatched repeats report the true written 10/14-beat lengths.
const mismatch=J.parse('@part A · Upper\n@part B · Lower\n[A] |: 1 - | 2 - - - | 3 - - - :|\n[B] |: 5 - | 6 - - - | 7 - - - | 1 - - - :|');
const warnings=P.timingWarnings(mismatch.lines);assert.equal(warnings.length,1);assert.match(warnings[0],/10 拍/);assert.match(warnings[0],/14 拍/);
// A repeat starts in one system and ends three bars into the next one.
const header='@part A · Upper\n@part B · Lower\n@key 1=C\n@time 4/4\n';
const a='1/0/ 3/0/ 2/0/ 4/0/',b='7, - <1 3> -';
const crossText=header+`@tempo 原速\n[A] |: ${a} |\n[B] |: ${b} |\n[A] ${a} | ${a} | 0 2 0 4 :|\n[B] ${b} | ${b} | 5 - 0 - :|`;
function pitch(parsed){for(const n of parsed.notes)n.midi=60+[0,2,4,5,7,9,11][n.degree-1]+12*n.octave+n.acc;return parsed}
const crossSystem=pitch(J.parse(crossText)),cross=P.schedule(crossSystem.lines);close(cross.total,32);assert.equal(P.timingWarnings(crossSystem.lines).length,0);
const secondSystem=crossSystem.lines.filter(l=>l.kind==='music'&&l.part==='A')[1].tokens[0];const appearances=cross.events.filter(e=>e.token===secondSystem);assert.equal(appearances.length,2);close(appearances[0].start,4);close(appearances[1].start,20);
// Stress multiple pages/tempos/systems followed by an unequal-subdivision shared fermata.
const systems=[];
for(let i=0;i<12;i++){
 if(i%4===0)systems.push('@page '+(i/4+1),'@tempo '+(i===0?'中板':i===4?'稍慢':'原速'));
 systems.push('[A] '+Array.from({length:4},(_,j)=>`${(i+j)%7+1}/0/ 2//4//3//6// 5 - |`).join(' '));
 systems.push('[B] '+Array.from({length:4},()=>'<1 3 5> - 0 - |').join(' '),'');
}
const hold='[A] |: 1//3//2//4// 5//3//2//6// 1//4//2//5// 3//6//4//2//!fermata :|\n[B] |: 7,/5,/ 3/1/ 6/4/ 2/1/!fermata :|\n@tempo 突慢\n[A] 1 - - - |\n[B] <1 3> - - - |';
const complete=pitch(J.parse(crossText+'\n'+systems.join('\n')+'\n'+hold)),scheduled=P.schedule(complete.lines);
assert.equal(P.timingWarnings(complete.lines).length,0);close(scheduled.total,236.6);
for(const id of scheduled.parts){const seq=scheduled.events.filter(e=>e.part===id);close(seq.at(-1).start+seq.at(-1).beats,236.6)}
console.log('PASS: synthetic 10/14-beat mismatch, cross-system four-bar repeat, 12 systems over three pages and post-fermata part synchronization.');
// Modified by AI on 2026-10-09 00:32:21
