const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({window:{}});
for(const file of ['jianpu.js','erhu-fingering.js'])vm.runInContext(fs.readFileSync('web/'+file,'utf8'),ctx);
const J=ctx.window.Jianpu,E=ctx.window.ErhuFingering,steps=[0,2,4,5,7,9,11];
function run(text){
 const p=J.parse(text);for(const t of p.notes)t.midi=62+steps[t.degree-1]+12*t.octave+t.acc;
 const original=J.serialize(p.lines),auto=E.annotate(p.lines,{keyOf:()=>2}),snapshot=JSON.stringify([...auto.map.values()]);
 const map=E.applyOverrides(p.lines,auto.map);
 assert.equal(J.serialize(p.lines),original,'annotation never rewrites music');
 assert.equal(JSON.stringify([...auto.map.values()]),snapshot,'display reconciliation does not mutate inference cache');
 return {p,auto,map,values:Array.from(p.notes,t=>map.get(t))};
}
let r=run("1'[外二] 2' 3' 2'");
assert.deepEqual(r.values.map(v=>v.finger),[2,3,4,3]);assert.ok(r.values.every(v=>v.anchor===4&&v.string===1));
assert.ok(r.values.every(v=>!v.review),'valid constrained hand has no warning');
const unconstrained=E.annotate(r.p.lines,{keyOf:()=>2,respectManual:false});
assert.notEqual(unconstrained.map.get(r.p.notes[0]).finger,2,'transposed views can opt out of source fingering constraints');
r=run('1[内〇] 2[内一] 3[内二] 5[外〇] 6[外一]');
assert.deepEqual(r.values.map(v=>v.stringChange),[true,false,false,true,false]);
r=run('@part A · 二胡一\n@part B · 二胡二\n[A] 2[内一] 3[内二] |\n[B] 5[外〇] 6[外一] |\n@page 2\n[A] 3[内二] |\n[B] 6[外一] |');
assert.deepEqual(r.values.map(v=>v.stringChange),[true,false,true,false,false,false],'string history belongs to each voice across pages');
r=run('1[外二] 2 3 4');
assert.match(r.values[0].review.join(''),/无法组成可用手型/);assert.ok(r.values[1].review);assert.ok(!r.values[2].review&&!r.values[3].review,'invalid manual choice flags only its immediate connection');
r=run("1'!tr[外四] 2' 3'");assert.match(r.values[0].review.join(''),/颤音辅助指/);assert.ok(!r.values[0].trill);
r=run("1'!tr[外二] 2' 3'");assert.equal(r.values[0].trill.finger,3);assert.equal(r.values[0].trill.anchor,r.values[0].anchor);assert.ok(!r.values[0].review);
r=run('3[内一] 5[内一无换] 6[内二]');assert.match(r.values[1].review.join(''),/仍需要换把/);assert.ok(!r.values[2].review);
r=run('1[内〇] 2[内一↑] 3[内二]');assert.match(r.values[1].review.join(''),/方向/);
r=run('2[内一] 3[-] 4[内三]');assert.equal(r.values[1],null);assert.equal(r.values[2].stringChange,false,'hidden annotation keeps the actual string context');
console.log('PASS: manual fingering constrains subsequent hands, repeated string prefixes disappear, parts remain independent, invalid choices/trills/shifts flag local connections, caches and source stay immutable.');
// Modified by AI on 2026-10-11 14:34:41
