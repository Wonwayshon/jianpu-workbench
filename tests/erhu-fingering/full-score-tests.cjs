const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({window:{}});
for(const f of ['jianpu.js','erhu-fingering.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),ctx,{filename:f});
// Deterministic synthetic stress data, not a transcription of a musical work.
const degrees=[1,2,3,4,5,6,7],lines=[];let state=20261008;
for(let row=0;row<48;row++){
 const tokens=[];
 for(let col=0;col<16;col++){
  state=(Math.imul(state,1664525)+1013904223)>>>0;
  const degree=degrees[state%degrees.length],octave=(state>>>8)%2;
  tokens.push(String(degree)+(octave?"'":'')+'//'+(col%7===4?'!tr':''));
 }
 lines.push(tokens.join(' ')+' |');
}
const p=ctx.window.Jianpu.parse('@key 1=D\n@time 4/4\n'+lines.join('\n'));
for(const t of p.notes)t.midi=62+[0,2,4,5,7,9,11][t.degree-1]+12*t.octave+t.acc;
const r=ctx.window.ErhuFingering.annotate(p.lines,{tuning:[62,69],keyOf:()=>2});
assert.equal(p.notes.length,768);assert.equal(r.unplayable,0);assert.equal(r.trillUnavailable,0);
let trills=0;
for(const t of p.notes){
 const f=r.map.get(t);assert.ok(f&&f.finger>=0&&f.finger<=4);
 if(!t.orns.includes('tr'))continue;trills++;
 assert.ok(f.finger<4&&f.trill.finger>f.finger&&f.trill.finger<=4);
 assert.equal(f.string,f.trill.string);assert.equal(f.anchor,f.trill.anchor);assert.ok(!f.extended);
 const reach=f.trill.midi-[62,69][f.string]-f.anchor;
 assert.ok(reach>=f.trill.finger-1&&reach<=2*(f.trill.finger-1));
}
assert.equal(trills,96);
console.log('PASS: 768 program-generated notes across 48 rows; 96 playable trills in the same hand frame, without extended fourth fingers.');
// Modified by AI on 2026-10-08 14:21:25
