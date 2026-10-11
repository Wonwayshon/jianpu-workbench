const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root='web/';
const ctx=vm.createContext({window:{}});for(const f of ['jianpu.js','erhu-fingering.js'])new vm.Script(fs.readFileSync(root+f,'utf8'),{filename:f}).runInContext(ctx);
const J=ctx.window.Jianpu,E=ctx.window.ErhuFingering,steps=[0,2,4,5,7,9,11];
function run(text,key=7,tuning=[62,69]){const p=J.parse(text);for(const t of p.notes)t.midi=60+key+steps[t.degree-1]+12*t.octave+t.acc;return {p,r:E.annotate(p.lines,{tuning,keyOf:()=>key})}}
const opening='3/0/ 5/0/ 6/0/ 7/0/ | 6//6//5/ 3/7/ 6//6//5/ 3 - |';
let {p,r}=run(opening);
const chosen=p.notes.map(t=>r.map.get(t));assert.deepEqual(Array.from(chosen.slice(0,4),x=>x.finger),[1,1,2,3]);
assert.equal(r.shifts,1);assert.ok(chosen.slice(1).every(x=>x.anchor===5));
assert.deepEqual(Array.from(chosen.slice(4),x=>x.finger),[2,2,1,3,3,2,2,1,3]);
// With standard D-A tuning, D5/E5/F#5 fit 1/2/3 on the same outer-string frame.
assert.equal(chosen[1].anchorMidi,74);assert.equal(chosen[8].finger,3);assert.equal(p.notes[8].midi,78);
function checkTrill(t,c,tuning){
 if(c.finger==null)return;
 assert.ok(c.finger<4,'no trill starts on finger 4');assert.ok(c.trill.finger>c.finger&&c.trill.finger<=4);
 assert.equal(c.trill.string,c.string);assert.equal(c.trill.anchor,c.anchor);
 assert.ok(c.trill.midi>t.midi);
 const off=c.trill.midi-tuning[c.string]-c.anchor;
 assert.ok(off>=c.trill.finger-1&&off<=2*(c.trill.finger-1),'auxiliary fits without extension');
}
let count=0;
for(let key=0;key<12;key++)for(const tuning of [[62,69],[60,67],[55,62]]){
 const z=run("1 2 3 4 5 6 7 1' | 1!tr 2!tr 3!tr 4!tr 5!tr 6!tr 7!tr 1'!tr",key,tuning);
 for(const t of z.p.notes)if(t.orns.includes('tr')){checkTrill(t,z.r.map.get(t),tuning);count++}
}
({p,r}=run('6!tr - - - |'));const six=r.map.get(p.notes[0]);assert.equal(six.trill.midi,78);assert.equal(six.finger,2);assert.equal(six.trill.finger,3);
({p,r}=run('b7!tr',0));assert.equal(r.map.get(p.notes[0]).trill.midi,72,'flattened 7 trills to 1, not natural 7');
({p,r}=run('#4!tr',0));assert.equal(r.map.get(p.notes[0]).trill.midi,67);
({p,r}=run('#7!tr',0));assert.equal(r.map.get(p.notes[0]).reason,'trill');assert.equal(r.trillUnavailable,1,'do not fabricate an octave-high auxiliary for enharmonic unison');
({p,r}=run("7''!tr",7));assert.equal(r.map.get(p.notes[0]).finger,null,'out of range stays unknown');
({p,r}=run('6 6!tr 6'));assert.ok(p.notes.every(t=>r.map.get(t).anchor===r.map.get(p.notes[1]).anchor),'look ahead and prepare for the trill');
({p,r}=run('6 0 - 3'));assert.equal(r.map.get(p.notes[1]).finger,1,'long rest permits return to first position');
// No new rule forbids ordinary fourth fingers.
({p,r}=run('3 4 5 6'));assert.deepEqual(Array.from(p.notes,t=>r.map.get(t).finger),[1,2,3,4]);
// Repeated 5s keep finger 3, including a returning open-string 2: shift on the new 6, with 2↔3.
const repeated='5/0/ 5/0/ 5/0/ 5/0/ | 2 5//(5// 5/)2/ 5 | 6!tr - - - |';
const continuation='6,/1/ 2/3/ 1/2/ 3/5/ | 6 - - 5 | 3 - - - | 2 - - 3 |';
for(const phrase of [repeated,repeated+continuation,repeated+continuation+'2 - - - | 6 - - - | 5 - - - |','5 5 5 | 6!tr - - - |','5 2 5 | 6!tr - - - |']){
 const z=run(phrase),tr=z.p.notes.find(t=>t.orns.includes('tr')),fives=z.p.notes.slice(0,z.p.notes.indexOf(tr)).filter(t=>t.degree===5);
 for(const t of fives){const f=z.r.map.get(t);assert.equal(f.finger,3);assert.equal(f.anchor,2);assert.equal(f.shift,undefined)}
 const f=z.r.map.get(tr);assert.equal(f.finger,2);assert.equal(f.trill.finger,3);assert.equal(f.anchor,5);assert.equal(f.shift,'up');assert.equal(z.p.notes.slice(0,z.p.notes.indexOf(tr)+1).filter(t=>z.r.map.get(t).shift).length,1);
}
// Third/fourth-finger trills remain available when they preserve an already useful hand frame.
({p,r}=run('3 4 5!tr 4 3'));assert.equal(r.map.get(p.notes[2]).finger,3);assert.equal(r.map.get(p.notes[2]).trill.finger,4);
// D-major shift regression cases: prefer prepared shifts over repeated little-finger stretches.
({p,r}=run("6//1'//2'//3'// 2'//1'//6//5// |",2));
assert.deepEqual(Array.from(p.notes,t=>r.map.get(t).finger),[1,1,2,3,2,1,1,0]);
assert.equal(r.map.get(p.notes[1]).shift,'up');assert.ok(p.notes.every(t=>!r.map.get(t).extended));
({p,r}=run("5/3/5/6/ 1'//3'//2'//7// |",2));
assert.deepEqual(Array.from(p.notes.slice(4),t=>r.map.get(t).finger),[1,3,2,2]);
assert.equal(r.map.get(p.notes[4]).shift,'up');assert.equal(r.map.get(p.notes[7]).shift,'down');assert.ok(p.notes.every(t=>!r.map.get(t).extended));
// Incoming context used to favour a large index shift and a second shift at the final 1'.
({p,r}=run("6!tr - - - | 0/2'/ | 3'/3'/ | 5'/3'/3'/2'/1'/ |",2));
const phrase=p.notes.slice(1);assert.deepEqual(Array.from(phrase,t=>r.map.get(t).finger),[2,3,3,4,3,3,2,1]);
assert.equal(r.map.get(phrase[0]).shift,'up');assert.equal(r.map.get(phrase.at(-1)).shift,undefined);
assert.equal(phrase.filter(t=>r.map.get(t).extended).length,1,'one isolated peak may stretch; do not ban all extensions');
assert.equal(r.map.get(phrase[3]).extended,true);
// Rapid grace-to-main motion stays on one string/frame, including incoming and outgoing context.
({p,r}=run("6//1'// 5/^4//5/ 3//5//6//1'//",2));
const grace=p.notes.findIndex(t=>t.grace),g=r.map.get(p.notes[grace]),main=r.map.get(p.notes[grace+1]);
assert.equal(g.finger,3);assert.equal(main.finger,4);assert.equal(main.string,g.string);assert.equal(main.anchor,g.anchor);assert.equal(main.shift,undefined);
// One brief peak uses 4 once; approach and repeated return stay settled, then 7 shifts with 2.
({p,r}=run("1'/.2'// 3'/5'/ 2'/2'//7// 6//5//6//1'// |",2));
assert.deepEqual(Array.from(p.notes,t=>r.map.get(t).finger),[1,2,3,4,2,2,2,1,0,1,3]);
assert.ok(p.notes.slice(0,6).every(t=>r.map.get(t).anchor===5));assert.equal(r.map.get(p.notes[6]).shift,'down');
assert.equal(p.notes.filter(t=>r.map.get(t).extended).length,1);assert.equal(r.map.get(p.notes[3]).extended,true);
// A same-pitch pair contrasts open/stopped timbres only for the outer-open sol in 1–5 tuning.
for(const [key,tuning,octave] of [[2,[62,69],0],[0,[60,67],0],[7,[55,62],-1]]){
 ({p,r}=run(`3/ 5${octave<0?',':''}/5${octave<0?',':''}/ 3/`,key,tuning));
 const pair=p.notes.slice(1,3).map(t=>r.map.get(t));assert.deepEqual(Array.from(pair,x=>x.finger),[0,4]);assert.deepEqual(Array.from(pair,x=>x.string),[1,0]);
 assert.equal(pair[1].technique,'unisonCrossing');assert.equal(pair[1].shift,undefined);assert.equal(p.notes[1].midi,p.notes[2].midi);
}
// Only a beamed pair of its own inside one bar: not across a bar line, not inside a faster group such as 3355.
({p,r}=run("1 2 | 5/5/ 6",2));assert.equal(r.map.get(p.notes[3]).technique,"unisonCrossing");
for(const text of ["5/5/5/","5/0/5/","(5/5/)","5/!tr5/","5/5'/","5/^5//5/","5 - 5","5/ <1 3>/ 5/","3/3/5/5/","3//3//5//5//","5/ | 5/","1 5 | 5 1"]){
 ({p,r}=run(text,2));assert.ok(p.notes.every(t=>r.map.get(t)?.technique!=='unisonCrossing'),`do not impose timbral crossing: ${text}`);
}
// Hand-edited markings: parsed after a note, kept by serialize, and only the written fields replace the automatic ones.
{const q=J.parse("3'/[外二⊓] 5 6[-] 1[内〇无弓]");const [a,b,c,d]=q.notes;assert.equal(a.erhu,'外二⊓');assert.equal(b.erhu,undefined);assert.equal(c.erhu,'-');assert.equal(d.erhu,'内〇无弓');
 assert.equal(a.col,0);assert.equal(a.len,3);assert.equal(a.erhuLen,5);assert.match(J.serialize(q.lines),/3'\/\[外二⊓\] 5 6\[-\] 1\[内〇无弓\]/);
 const auto={finger:3,string:0,bow:'up',shift:'up',stringChange:false};const x=E.applyOverride(auto,'外二⊓');assert.deepEqual([x.finger,x.string,x.bow,x.shift,x.manual,x.stringChange],[2,1,'down','up',true,true]);
 assert.equal(E.applyOverride(auto,'-'),null);const y=E.applyOverride(auto,'无弓无换');assert.equal(y.bow,null);assert.equal(y.shift,null);assert.equal(y.finger,3);
}
({p,r}=run("1'/b3'/4'/",2));
assert.deepEqual(Array.from(p.notes.slice(0,2),t=>r.map.get(t).finger),[1,3]);
assert.equal(r.map.get(p.notes[0]).string,r.map.get(p.notes[1]).string);assert.equal(r.map.get(p.notes[1]).guideFinger,undefined);assert.equal(r.map.get(p.notes[1]).shift,undefined);
assert.deepEqual(Array.from(p.notes,t=>t.midi),[74,77,79],'guide fingering must preserve octave and flat third');
// Altered notes use the available finger in the established frame; shift on the tonic only.
({p,r}=run("5/b7/ 1'/b3'/4'/",2));
assert.deepEqual(Array.from(p.notes,t=>r.map.get(t).finger),[0,2,1,3,4]);
assert.equal(r.map.get(p.notes[1]).shift,undefined);assert.equal(r.map.get(p.notes[2]).shift,'up');
assert.ok(p.notes.slice(2).every(t=>r.map.get(t).anchor===5));
// Approach a short high peak without moving early onto the inner string.
({p,r}=run("5/6/ | 1'/(5'//3'//) 2'/!~(1'//6//) |",2));
assert.equal(r.map.get(p.notes[1]).string,1);assert.equal(r.map.get(p.notes[1]).finger,2);
assert.deepEqual(Array.from(p.notes.slice(2,5),t=>r.map.get(t).finger),[1,4,3]);
assert.equal(r.map.get(p.notes[2]).shift,'up');assert.equal(r.map.get(p.notes[4]).shift,undefined);
// The final tonic of a neighbour figure prepares 2/5/3; return only when reaching 6.
({p,r}=run("1'. (6//1'//) | (2'/5'//3'//) (2'//1'//)6//(5//) |",2));
assert.equal(r.map.get(p.notes[2]).finger,1);assert.equal(r.map.get(p.notes[2]).shift,'up');
assert.deepEqual(Array.from(p.notes.slice(3,6),t=>r.map.get(t).finger),[2,4,3]);
assert.ok(p.notes.slice(3,8).every(t=>r.map.get(t).shift===undefined));assert.equal(r.map.get(p.notes[8]).shift,'down');
// A high index-led trill keeps its hand frame through repeated held notes and the inner-string exit.
({p,r}=run("3//3///5///6///1'///2'///3'/// (5'!tr | 5' - | 5'/)6'/ 3'/2'/ |",2));
assert.deepEqual(Array.from(p.notes.slice(4,7),t=>r.map.get(t).finger),[1,2,3]);
const high=p.notes.slice(7);assert.deepEqual(Array.from(high,t=>r.map.get(t).finger),[1,1,1,2,3,2]);
assert.ok(high.every(t=>r.map.get(t).anchor===12));assert.equal(r.map.get(high[0]).shift,'up');assert.ok(high.slice(1).every(t=>r.map.get(t).shift===undefined));
assert.equal(r.map.get(high[4]).string,0);assert.equal(r.map.get(high[5]).string,0);checkTrill(high[0],r.map.get(high[0]),[62,69]);
// Changing the key in mid-piece must change the trill upper neighbour.
p=J.parse('3!tr 3!tr');p.notes.forEach(t=>t.midi=64);
r=E.annotate(p.lines,{keyOf:t=>t===p.notes[0]?0:2});assert.equal(r.map.get(p.notes[0]).trill.midi,65);assert.equal(r.map.get(p.notes[1]).trill.midi,67);
// Inspect rendered annotation text and the actionable unavailable-trill tooltip without a browser.
ctx.document={createElement:()=>({children:[],textContent:'',append(...xs){this.children.push(...xs)}})};
const label=E.label(six);const all=n=>(n.textContent||'')+n.children.map(all).join('');assert.match(all(label),/二↔三/);
const slide=E.label({finger:1,string:1,anchorMidi:77,shift:'up',guideFinger:1});assert.match(all(slide),/一滑/);
const cross=E.label({finger:4,string:0,technique:'unisonCrossing'});assert.match(cross.children[1].children.at(-1).title,/同音换弦/);
const bad=E.label({finger:null,reason:'trill'});assert.match(bad.children[1].children[0].title,/颤音手型/);
console.log(`PASS: opening 1123, one prepared shift, stable following frame; repeated 5 stays on 3 / shift at 6 with 2↔3; ${count} trills across 12 keys and 3 tunings; upper-degree accidentals; impossible trills; ordinary fourth fingers; phrase restart; grace fingering, isolated peak, exact-pair timbral crossing and index-guide shift; label and tooltip.`);
// Modified by AI on 2026-10-11 12:52:40
