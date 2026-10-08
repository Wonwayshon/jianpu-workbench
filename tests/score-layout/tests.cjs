const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root='web/';
class El{
 constructor(tag){this.tag=tag;this.children=[];this.className='';this.style={setProperty(k,v){this[k]=v}};this.clientWidth=0;this.attrs={};this.classList={contains:c=>this.className.split(' ').includes(c),add:(...cs)=>{for(const c of cs)if(!this.classList.contains(c))this.className+=' '+c},remove:c=>{this.className=this.className.split(' ').filter(x=>x!==c).join(' ')},toggle:(c,on)=>on?this.classList.add(c):this.classList.remove(c)}}
 get childNodes(){return this.children}get scrollWidth(){return 100}
 append(...xs){for(const x of xs){if(x.parentNode)x.parentNode.children=x.parentNode.children.filter(y=>x!==y);this.children.push(x);if(typeof x==='object')x.parentNode=this}}
 prepend(...xs){this.children.unshift(...xs)}replaceChildren(...xs){this.children=[];this.append(...xs)}
 setAttribute(k,v){this.attrs[k]=v}getBoundingClientRect(){return {width:40,height:30,left:0,right:40}}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(e=>e!==this)}
 querySelectorAll(selector){const direct=selector.startsWith(':scope>');selector=selector.replace(':scope>','');const cls=selector.split('.').slice(1);const out=[];const visit=e=>{for(const x of e.children){if(typeof x!=='object')continue;if(cls.length&&cls.every(c=>x.classList.contains(c)))out.push(x);if(!direct)visit(x)}};visit(this);return out}
 querySelector(s){return this.querySelectorAll(s)[0]||null}
}
const c=vm.createContext({window:{},document:{createElement:t=>new El(t)},getComputedStyle:()=>({fontSize:'22',paddingLeft:'0',paddingRight:'0'})});
for(const file of ['jianpu.js','staff.js'])vm.runInContext(fs.readFileSync(root+file,'utf8'),c);
const J=c.window.Jianpu,S=c.window.Staff;
const text='@title 总谱\n@key 1=C\n@time 2/4\n@part 笛 · 竹笛\n@part 胡 · 二胡\n@part 琴 · 钢琴\n[笛] 1 2 | 3 4 |\n[胡] 3 4 | 5 6 |\n[琴] <1 3> - | 0 0 |\n[笛] 5 6 |\n[胡] 1 2 |\n[琴] 0 - |\n\n[笛] 3 2 |\n[胡] 5 4 |\n[琴] 1 - |';
const p=J.parse(text);for(const t of p.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1]+12*t.octave+t.acc;
const systems=J.groupSystems(p.lines).filter(b=>b.kind==='system');assert.equal(systems.length,3);assert.ok(systems.every(s=>s.lines.length===3));
assert.deepEqual(Array.from(J.groupSystems(p.lines).flatMap(b=>b.lines)),Array.from(p.lines));
const host=new El('div');J.render(host,p.lines,{fit:false});const drawn=host.querySelectorAll('.jp-system');assert.equal(drawn.length,3);assert.ok(drawn.every(s=>s._src.length===3));assert.ok(host.classList.contains('jp-full-score'));
assert.deepEqual(drawn[0].querySelectorAll('.jp-part-label').map(e=>e.textContent),['竹笛','二胡','钢琴']);
for(const sys of drawn){const rows=sys.querySelectorAll(':scope>.jp-line');for(let i=0;i<rows[0].querySelectorAll('.jp-measure').length;i++){const flex=rows.map(r=>r.querySelectorAll('.jp-measure')[i].style.flex);assert.equal(new Set(flex).size,1)}}
const subset=J.filterParts(p.lines,['笛','胡']);assert.equal(J.groupSystems(subset).filter(b=>b.kind==='system').length,3);assert.ok(subset.filter(l=>l.kind==='music').every(l=>l.part!=='琴'));
J.render(host,subset,{fit:false});assert.equal(host.querySelectorAll('.jp-line').length,6);
// Without explicit blanks, hiding instruments must still preserve the original system break.
const sparse=J.parse('[笛] 1 |\n[胡] 2 |\n[笛] 3 |\n[琴] 4 |').lines;
assert.equal(J.groupSystems(J.filterParts(sparse,['胡','琴'])).filter(b=>b.kind==='system').length,2);
const view=fs.readFileSync(root+'score-view.js','utf8');c.Jianpu=J;
vm.runInContext(view.slice(view.indexOf('function reflowLines('),view.indexOf('// Packs rendered rows')),c);
const reflow=c.reflowLines(p.lines);assert.equal(J.groupSystems(reflow).filter(b=>b.kind==='system').length,3);
const pages=c.paginateStaffLines(reflow,4);assert.equal(pages.length,3);assert.ok(pages.every(page=>page.filter(l=>l.kind==='music').length===3));
J.render(host,systems[1].lines,{fit:false,partNames:p.parts});assert.equal(host.querySelectorAll('.jp-part-label')[0].textContent,'竹笛');
const abc=S.toABC(subset,{keyLabel:'C',partNames:p.parts}).abc;assert.ok(!abc.includes('name="钢琴"'));assert.match(abc,/%%systemsep 50/);assert.match(abc,/snm="竹笛"/);
const ABC=require('../../web/vendor/abcjs/abcjs-basic-min.js');assert.ok(!ABC.parseOnly(abc)[0].warnings?.length);
assert.match(S.toABC(systems[1].lines,{partNames:p.parts}).abc,/name="竹笛"/);
// Single-part, non-total notation remains ordinary rows without system chrome.
J.render(host,J.parse('1 2 |\n3 4 |').lines,{fit:false});assert.equal(host.querySelectorAll('.jp-system').length,0);assert.ok(!host.classList.contains('jp-full-score'));
console.log('PASS: automatic/explicit system boundaries, aligned measures, full names on later pages, multi-part filtering without merging groups, continuous layout, staff system-atomic pagination and valid ABC, single-part reset.');

// Synthetic keyboard texture: two staves, each with independent rhythmic voices.
const keyboard=J.parse("@part A · 笛\n@part U · 扬琴上谱表声部一\n@part V · 扬琴上谱表声部二\n@part L · 扬琴下谱表声部一\n@part W · 扬琴下谱表声部二\n[A] 1 2 3 4 | 5 6 7 1' |\n[U] <1 3> 2/3/ 4 5 | 1. 2/ 3 4 |\n[V] 0 - - - | 5/6/ 7 1 2 |\n[L] 1, - 5, - | 2, - 6, - |\n[W] 0 - - - | 0 - - - |");
const original=J.serialize(keyboard.lines);J.render(host,keyboard.lines,{fit:false});
const ks=host.querySelector('.jp-system');assert.equal(ks.querySelectorAll(':scope>.jp-line').length,3);
assert.equal(ks._src.length,5,'pagination retains all source voices, including suppressed rests');
assert.deepEqual(ks.querySelectorAll('.jp-part-label').map(e=>e.textContent),['笛','扬琴上谱表','扬琴下谱表']);
assert.equal(ks.querySelectorAll('.jp-polyphonic').length,1,'secondary voice only expands the measure where it sounds');
const upper=ks.querySelectorAll('.jp-staff-row')[0].querySelectorAll(':scope>.jp-measure');
assert.equal(upper[0]._lanes.length,1);assert.equal(upper[1]._lanes.length,2);
const lines=keyboard.lines.filter(l=>l.kind==='music'),u=lines[1],v=lines[2];
assert.equal(u.tokens.find(t=>t.t==='note'&&t.degree===2)._cell.parentNode.style.gridColumn,'2 / 4');
assert.equal(v.tokens.find(t=>t.t==='note'&&t.degree===5)._cell.style.gridColumn,'1 / 2');
for(const n of keyboard.notes){let cell=n._cell;while(cell&&cell!==host)cell=cell.parentNode;assert.equal(cell,host,'every pitched token remains attached for editor/playback');}
assert.equal(J.serialize(keyboard.lines),original,'visual compaction never rewrites music');
J.render(host,J.filterParts(keyboard.lines,['V']),{fit:false,partNames:keyboard.parts});
assert.equal(host.querySelectorAll('.jp-line').length,1);assert.equal(host.querySelector('.jp-part-label').textContent,'扬琴上谱表声部二');
const mismatch=J.parse('@part U · 扬琴上谱表声部一\n@part V · 扬琴上谱表声部二\n[U] 1 2 |\n[V] 0 - - - |');
J.render(host,mismatch.lines,{fit:false});assert.equal(host.querySelectorAll('.jp-line').length,2,'unequal bar durations must stay visible');
assert.equal(J.staffIdentity('扬琴一'),null);assert.equal(J.staffIdentity('第一声部'),null);
const timed=J.measureTimeline(J.parse('3{1/2/3/} ^5//6. 0/ |').lines[0].tokens)[0];
assert.ok(Math.abs(timed.duration-3)<1e-8,'tuplets, dots and non-counted grace notes share playback beat units');
console.log('PASS: named staff grouping, per-measure silent voice compaction, beat columns, original token/cursor identities, untouched serialization, part filtering and conservative mismatch fallback.');

// Run actual numbered pagination against deterministic measured system heights.
const controls=new Map(),$=id=>{if(!controls.has(id))controls.set(id,new El('div'));return controls.get(id)};
c.$=$;c.document.body=new El('body');$('viewerBody').clientWidth=1000;$('viewerBody').clientHeight=420;
c.getComputedStyle=e=>e===$('viewerBody')?{paddingLeft:'8px',paddingRight:'8px',paddingTop:'6px',paddingBottom:'6px',columnGap:'12px'}:{fontSize:'22px',paddingLeft:'0',paddingRight:'0',marginTop:e.classList.contains('jp-system')?String(fontOf(e)*.3):'0',marginBottom:e.classList.contains('jp-system')?String(fontOf(e)*.55):'0'};
const fontOf=e=>parseFloat(e.style.fontSize)||(e.parentNode?fontOf(e.parentNode):22);
El.prototype.getBoundingClientRect=function(){return {width:this.classList.contains('jp-probe')?1000:40,height:(this.classList.contains('jp-system')?220:30)*fontOf(this)/22,left:0,right:40}};
const long=J.parse('@part 笛 · 竹笛\n@part 胡 · 二胡\n@part 琴 · 钢琴\n'+Array.from({length:12},()=> '[笛] 1 2 |\n[胡] 3 4 |\n[琴] 5 - |').join('\n'));
c.vLayout='two';c.vView='source';c.vReflow=true;c.vLines=()=>long.lines;c.scoreParts=()=>long.parts;c.erhuOpts=(l,v,o)=>o;c.isStaff=()=>false;
vm.runInContext(view.slice(view.indexOf('function box(){'),view.indexOf('async function drawPage(')),c);
assert.equal(c.box().w,486);assert.equal(c.box().h,408);
const paged=c.paginate();assert.equal(paged.length,4,'width-fitted font packs three systems per page, instead of two at fixed 18px');assert.ok(vm.runInContext('vFont',c)<12);assert.ok(paged.every(page=>page.filter(l=>l.kind==='music').length===9));assert.equal(paged.flat().filter(l=>l.kind==='music').length,36);assert.ok(paged.every(page=>page.filter(l=>l.kind==='music').length%3===0));
const solo=J.parse(Array.from({length:60},()=> '1 2 3 4 |').join('\n'));c.vLines=()=>solo.lines;
const soloPages=c.paginate();assert.ok(soloPages[0].filter(l=>l.kind==='music').length>24,'single-part pages also pack at the final font');assert.equal(soloPages.flat().filter(l=>l.kind==='music').length,60);
c.vLines=()=>long.lines;
// Selected voices alone receive fingering, and full-part history survives page boundaries.
vm.runInContext(fs.readFileSync(root+'erhu-fingering.js','utf8'),c);const E=c.window.ErhuFingering;let calls=0;
c.ErhuFingering={...E,annotate:(lines,options)=>{calls++;assert.ok(new Set(lines.filter(l=>l.kind==='music').map(l=>l.part)).size<=1);return E.annotate(lines,options)}};
const store=new Map();c.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
c.lastConverted={source:p};c.transAllLines=p.lines;c.scoreParts=()=>p.parts;
$('erhuFinger').checked=true;$('songKey').value='0';$('transKey').value='0';$('erhuTuning').value='62,69';
vm.runInContext(view.slice(view.indexOf('function erhuPartIds('),view.indexOf('function erhuOpts(')),c);
assert.equal(c.erhuFor(p.lines,'source'),null,'total score requires an explicit selection');
const select=ids=>store.set('flute.erhuParts',JSON.stringify({signature:JSON.stringify(p.parts),ids}));
select(['胡']);const selected=c.erhuFor(p.lines,'source');assert.ok(selected.map.size>0);
for(const line of p.lines.filter(l=>l.kind==='music'))for(const t of line.tokens.filter(t=>t.t==='note'))assert.equal(selected.map.has(t),line.part==='胡');
const before=calls;const later=c.erhuFor(systems[1].lines,'source');assert.equal(calls,before,'cached full-part inference reused on later pages');
for(const [t,value] of later.map)assert.equal(value,selected.map.get(t));
assert.equal(c.erhuFor(J.filterParts(p.lines,['笛']),'source'),null,'display filtering does not switch erhu to another voice');
J.render(host,p.lines,{fit:false,annotations:selected.map});assert.equal(host.querySelectorAll('.jp-erhu-line').length,3);assert.equal(host.querySelectorAll('.jp-line').length,9);
select(p.parts.map(x=>x.id));const all=c.erhuFor(p.lines,'source');
for(const part of p.parts){const standalone=E.annotate(p.lines.filter(l=>l.kind!=='music'||l.part===part.id),{tuning:[62,69],keyOf:()=>0});for(const [t,fingering] of standalone.map)assert.deepEqual(all.map.get(t),fingering)}
const single=J.parse('3 4 5 6 |');for(const t of single.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1];c.lastConverted={source:single};c.scoreParts=()=>[];
assert.equal(c.erhuFor(single.lines,'source').map.size,4,'unlabelled single part needs no selector');
$('erhuFinger').checked=false;assert.equal(c.erhuFor(single.lines,'source'),null);
const css=fs.readFileSync(root+'app-shell.css','utf8');assert.ok(!/\.jp-annotated\s/.test(css),'no global erhu spacing applied to other instruments');
console.log('PASS: explicit one/all erhu voices, independent inference, cached whole-part history, filtered voices, single-part fallback and per-row annotation spacing.');
// A second navigation cancels an older async render before it can append its right-hand page.
let pending=[];c.vPages=paged;c.vIndex=0;c.viewerRenderId=0;c.drawPage=(el,lines)=>new Promise(resolve=>pending.push({el,lines,resolve}));
vm.runInContext(view.slice(view.indexOf('async function showPage('),view.indexOf('async function rebuild(')),c);
(async()=>{
 const old=c.showPage(0),current=c.showPage(2);assert.equal(pending.length,2);
 pending[0].resolve();await old;assert.equal($('viewerBody').children.length,1);
 pending[1].resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,3);pending[2].resolve();await current;
 assert.deepEqual($('viewerBody').children.map(e=>e.attrs['aria-label']),['第 3 页','第 4 页']);assert.match($('viewerPage').textContent,/3–4/);
 console.log('PASS: measured two-page available area, full-score pagination retains all 36 rows in intact systems; rapid page turns do not append stale pages.');
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-08 20:21:31
