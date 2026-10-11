const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({window:{}});for(const f of ['jianpu.js','erhu-fingering.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),ctx);
const J=ctx.window.Jianpu,E=ctx.window.ErhuFingering,steps=[0,2,4,5,7,9,11];
// Program-generated exercise: three repeated attacks, a prepared tonic, tied crest, new ascent.
const tonic=Array(4).fill("1'/").join(''),crest=["2'/","(3'/ | 3'/)","(5'.5')","5'/6'/"].join(' '),exit="1''. 2''/1''/2''/1''/6'/ |";
const exercise=tonic+' '+crest+' | '+exit;
function run(text,key=2){const p=J.parse(text);for(const t of p.notes)t.midi=60+key+steps[t.degree-1]+12*t.octave+t.acc;const source=J.serialize(p.lines),r=E.annotate(p.lines,{keyOf:()=>key,tuning:[60+key,67+key]});assert.equal(J.serialize(p.lines),source);return {p,r,v:Array.from(p.notes,t=>r.map.get(t))}}
for(let key=0;key<12;key++){
 const {v}=run(exercise,key);
 assert.deepEqual(v.slice(0,11).map(x=>x.finger),[3,3,3,1,2,3,3,4,4,1,2]);
 assert.ok(v.slice(0,3).every(x=>!x.shift));assert.equal(v[3].shift,'up');assert.equal(v[3].guideFinger,undefined);
 assert.ok(v.slice(3,9).every(x=>x.anchor===5&&x.string===1));assert.equal(v[9].shift,'up');assert.equal(v[9].anchor,12);assert.equal(v[10].anchor,12);assert.ok(!v[10].shift);
 assert.ok(v[7].extended&&v[8].extended,'one held crest may use fourth-finger reach');
 assert.equal(v[5].finger,v[6].finger);assert.equal(v[7].finger,v[8].finger);
 assert.deepEqual(run('0 - - | '+exercise,key).v.slice(0,11).map(x=>x.finger),v.slice(0,11).map(x=>x.finger),'a rest before the phrase does not cancel its prepared ascent');
 const held=run('('+tonic+') '+crest+' | '+exit,key);assert.ok(held.v.slice(0,4).every(x=>x.finger===held.v[0].finger&&x.anchor===held.v[0].anchor),'do not shift inside a sustained same-pitch tie');
 const landing=run("(3'/) (5.5) 5/6/ | 1'. 2'/1'/2'/1'/6/ |",key);
 const six=landing.v[4];assert.equal(six.finger,1);assert.equal(six.string,1);assert.equal(six.anchor,2,'natural first frame after open-string notes');
}
const manual=run(exercise.replace("1'/","1'/[外二]"));assert.equal(manual.v[0].finger,2,'explicit user choice wins over approach preferences');
console.log('PASS: 12-key repeated tonic/held crest exercises shift on last new tonic and rearticulated crest; sustained copies stay together; open-string landing uses natural first finger; manual choices remain respected.');
// Modified by AI on 2026-10-11 21:19:12
