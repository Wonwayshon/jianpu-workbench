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

vm.runInContext(fs.readFileSync(root+'player.js','utf8'),c);const P=c.window.ScorePlayer;
const phrase="2'/^6'//3'/ ^3'//5'/2'/ |";
const p=J.parse(phrase);for(const t of p.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1]+12*t.octave;
const host=new El('div');J.render(host,p.lines,{fit:false});
const order=host.querySelectorAll('.jp-n').filter(e=>e._token?.t==='note').map(e=>e._token);
assert.deepEqual(order,Array.from(p.notes),'DOM reading order matches source: 2, grace 6, 3, grace 3, 5, 2');
for(const t of p.notes.filter(t=>t.grace)){assert.ok(t._cell.parentNode.classList.contains('jp-graces'));const main=p.notes[p.notes.indexOf(t)+1];assert.equal(t._cell.parentNode.parentNode,main._cell.parentNode,'grace and main note stay together while justifying')}
const plan=P.schedule(p.lines);assert.deepEqual(Array.from(plan.events,e=>e.token),Array.from(p.notes));assert.equal(plan.total,2);assert.deepEqual(Array.from(plan.events,e=>e.start),[0,.5,.58,1,1.08,1.5]);assert.deepEqual(Array.from(plan.bars),[2]);
assert.deepEqual(Array.from(plan.events,e=>e.midi),[74,81,76,76,79,74]);
const full=J.parse('[笛一] '+phrase+'\n[笛二] 1 2 |');for(const t of full.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1]+12*t.octave;
J.render(host,full.lines,{fit:false});assert.deepEqual(host.querySelectorAll('.jp-n').filter(e=>e._token?.t==='note').map(e=>e._token),Array.from(full.notes));assert.equal(P.schedule(full.lines).total,2);
for(const text of ['2/ ^6// 3/ |','2/^5//^6//3/ |']){const q=J.parse(text);J.render(host,q.lines,{fit:false});assert.deepEqual(host.querySelectorAll('.jp-n').filter(e=>e._token?.t==='note').map(e=>e._token),Array.from(q.notes))}
const repeated=J.parse('(2/^6//2/)');for(const t of repeated.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1];const r=P.schedule(repeated.lines);assert.equal(r.events.length,3,'intervening grace means the second 2 must be rearticulated');assert.equal(r.total,1);assert.deepEqual(Array.from(r.events,e=>e.start),[0,.5,.58]);
console.log('PASS: screenshot grace-note sequence, grouped layout in single/full scores, spaces/multiple graces, pitch and beat order, same-pitch slurs do not move grace notes.');
// Modified by AI on 2026-10-09 00:29:15
