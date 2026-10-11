const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class El{
 constructor(tag,cls='',rect={left:0,top:0,width:700,height:80}){this.tag=tag;this.className=cls;this.rect=rect;this.children=[];this.style={};this.attrs={};this.scrollLeft=0;this.scrollTop=0;this.clientWidth=rect.width;this.clientHeight=rect.height;this.classList={contains:c=>this.className.split(' ').includes(c)}}
 append(...xs){for(const x of xs){x.parentNode=this;this.children.push(x)}}
 remove(){this.parentNode.children=this.parentNode.children.filter(e=>e!==this)}
 setAttribute(k,v){this.attrs[k]=v;if(k==='class')this.className=v}getBoundingClientRect(){return {...this.rect,right:this.rect.left+this.rect.width,bottom:this.rect.top+this.rect.height}}
 matches(s){const [tag,...cs]=s.split('.');return (!tag||tag===this.tag)&&cs.every(c=>this.classList.contains(c))}
 closest(s){for(let e=this;e;e=e.parentNode)if(e.matches(s))return e;return null}
 querySelectorAll(s){const direct=s.startsWith(':scope>');s=s.replace(':scope>','');const out=[];const visit=e=>{for(const k of e.children){if(k.matches(s))out.push(k);if(!direct)visit(k)}};visit(this);return out}
 querySelector(s){return this.querySelectorAll(s)[0]||null}
}
const c=vm.createContext({window:{},document:{createElementNS:(_,tag)=>new El(tag)},getComputedStyle:()=>({fontSize:'20px'})});
vm.runInContext(fs.readFileSync('web/jianpu.js','utf8'),c);const J=c.window.Jianpu;
const host=new El('div','jp-score',{left:0,top:100,width:700,height:3000});
const rows=[300,1300].map(top=>new El('div','jp-line',{left:40,top,width:700,height:80}));host.append(...rows);
function note(row,x){const cell=new El('span','jp-n',{left:40+x,top:row.rect.top+15,width:20,height:50});const main=new El('span','jp-main',{left:40+x,top:row.rect.top+40,width:20,height:22});main.append(new El('span','jp-digit',main.rect));cell.append(main);row.append(cell);return cell}
const a=note(rows[0],20),b=note(rows[0],120),d=note(rows[1],30),e=note(rows[1],140);
host._arcs=[[a,b],[d,e]];host._tuplets=[[a,b,3],[d,e,5]];
J.redraw(host);
assert.equal(host.querySelectorAll(':scope>svg.jp-slurs').length,0,'no score-wide layer that can drift across print pages');
assert.ok(rows.every(r=>r.querySelectorAll(':scope>svg.jp-slurs').length===1));
assert.equal(host.querySelectorAll('svg.jp-slurs').length,2);assert.equal(host.querySelectorAll('path').length,2);assert.equal(host.querySelectorAll('text').length,2);
const curves=host.querySelectorAll('path').map(p=>p.attrs.d);
assert.equal(curves[0],'M30 37.6 Q80 19.6 130 37.6');assert.equal(curves[1],'M40 37.6 Q95 19.6 150 37.6','second-page curve has row-local coordinates');
// Print moves entire rows onto other pages; curve coordinates must not change.
for(const row of rows){const move=x=>{x.rect={...x.rect,top:x.rect.top+900};for(const k of x.children)move(k)};move(row)}
J.redraw(host);assert.deepEqual(host.querySelectorAll('path').map(p=>p.attrs.d),curves);
assert.equal(host.querySelectorAll('svg.jp-slurs').length,2,'redraw replaces old curves without duplicates');
// Cross-row continuation ends at the edge of one row and starts in the next.
host._arcs=[[a,e]];host._tuplets=[];J.redraw(host);
assert.equal(rows[0].querySelectorAll('path').length,1);assert.equal(rows[1].querySelectorAll('path').length,1);
assert.match(rows[0].querySelector('path').attrs.d,/696 37.6$/);assert.match(rows[1].querySelector('path').attrs.d,/^M4 37.6/);
host._arcs=[];J.redraw(host);assert.equal(host.querySelectorAll('svg.jp-slurs').length,0);
assert.match(fs.readFileSync('web/app-shell.css','utf8'),/\.jp-score \.jp-line\{position:relative;/,'rows anchor their overlays in screen and print layout');
console.log('PASS: printed curves and tuplets stay in each row across page movement; cross-row continuation, redraw and cleanup');
// Modified by AI on 2026-10-11 13:33:31
