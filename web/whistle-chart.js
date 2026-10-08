'use strict';
// Six-hole tin whistle chart. Data: The Woodwind Fingering Guide, tin whistle in D (D4–C7), tin-whistle entries only.
// Patterns list holes from the mouthpiece down: 1 closed, 0 open, h half-covered.
(() => {
const D_CHART=[
 [62,[['111111','']]],
 [63,[['11111h','半孔']]],
 [64,[['111110','']]],
 [65,[['1111h0','半孔']]],
 [66,[['111100','']]],
 [67,[['111000','']]],
 [68,[['11h000','半孔']]],
 [69,[['110000','']]],
 [70,[['1h0000','半孔']]],
 [71,[['100000','']]],
 [72,[['h00000','半孔'],['011000','叉指；锥形管哨笛更准']]],
 [73,[['000000',''],['000001','按住第 6 孔，持笛更稳']]],
 [74,[['011111','稍加气息吹高八度']]],
 [75,[['11111h','半孔，加气息']]],
 [76,[['111110','']]],
 [77,[['1111h0','半孔']]],
 [78,[['111100','']]],
 [79,[['111000','']]],
 [80,[['11h000','半孔']]],
 [81,[['110000','']]],
 [82,[['1h0000','半孔']]],
 [83,[['100000','']]],
 [84,[['h00000','半孔']]],
 [85,[['000000',''],['000001','按住第 6 孔，持笛更稳']]],
 [86,[['011111','第三八度']]],
 [88,[['111110','较难，不要用力过猛']]],
 [89,[['1111h1','较难']]],
 [90,[['111101','比 F 容易发音']]],
 [91,[['111001','多数哨笛可用']]],
 [92,[['11h001','偶尔作经过音']]],
 [93,[['110001','部分哨笛音准、响应较好'],['110011','部分哨笛音准、响应较好']]],
 [94,[['010100','通常偏低，声音可能发闷']]],
 [95,[['101010','通常偏高，可能超过四分之一音']]],
 [96,[['101011','需要很大气息']]],
];
const KEYS=[['D','D 调（最常见）',0],['C','C 调',-2],['Bb','B♭ 调',-4],['Eb','E♭ 调',1],['F','F 调',3],['G','G 调',5],['A','A 调',-5],['lowD','低音 D 调',-12]];
const NAMES=['C','C♯','D','E♭','E','F','F♯','G','G♯','A','B♭','B'];
const DEGREES=['1','♭2','2','♭3','3','4','♯4','5','♭6','6','♭7','7'];
const $=id=>document.getElementById(id);
const ns='http://www.w3.org/2000/svg';
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function svg(name,attrs){const e=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e}
// Vertical diagram: mouthpiece at the top, left-hand holes 1–3, a divider, right-hand holes 4–6.
function diagram(pattern){
 const s=svg('svg',{viewBox:'0 0 36 222',class:'whistle-holes','aria-hidden':'true'});
 s.append(svg('rect',{x:10,y:0,width:16,height:8,rx:3,fill:'#c9d6e3'}));
 s.append(svg('line',{x1:4,y1:117,x2:32,y2:117,stroke:'#8fa3b8','stroke-width':1.2,'stroke-dasharray':'2 3'}));
 [...pattern].forEach((v,i)=>{const y=28+i*33+(i>2?12:0);
  s.append(svg('circle',{cx:18,cy:y,r:12,fill:v==='1'?'#294459':'white',stroke:'#294459','stroke-width':1.6}));
  if(v==='h')s.append(svg('path',{d:`M 6 ${y} A 12 12 0 0 0 30 ${y} Z`,fill:'#294459'}));
 });
 return s;
}
function describe(p){return [...p].map((v,i)=>`${i+1}孔${v==='1'?'按住':v==='h'?'半按':'打开'}`).join('，')}
// Numbered notation relative to the whistle's key, with octave dots from its lowest octave.
function jianpu(rel){
 const box=el('span','jp-group'),deg=DEGREES[((rel%12)+12)%12],oct=Math.floor(rel/12);
 const part=el('span','jp');if(deg.length>1)part.append(el('span','jp-acc',deg[0]));
 const d=el('span','jp-digit',deg.slice(-1));if(oct>0){const dots=el('span','jp-dots up');for(let i=0;i<oct;i++)dots.append(el('i',null,'•'));d.append(dots)}
 part.append(d);box.append(part);return box;
}
function render(){
 const key=KEYS.find(k=>k[0]===$('whistleKey').value)||KEYS[0],shift=key[2],host=$('whistleGroups');host.replaceChildren();
 const tonicName=NAMES[((62+shift)%12+12)%12];
 $('whistleNote').textContent=`${key[1]}哨笛：筒音（全按）是 ${tonicName}${Math.floor((62+shift)/12)-1}，简谱按 1=${tonicName} 标注。指法与 D 调哨笛相同，只是整体移调。`;
 for(const [title,lo,hi] of [['第一八度',62,73],['第二八度 · 加气息',74,85],['第三八度 · 高音',86,96]]){
  const card=el('section','card whistle-card');card.append(el('h2',null,title));
  const grid=el('div','whistle-grid');
  for(const [midi,list] of D_CHART){
   if(midi<lo||midi>hi)continue;
   const real=midi+shift,col=el('div','whistle-col'+(list.length>1?' has-alt':'')),head=el('div','whistle-head');
   head.append(jianpu(midi-62),el('small',null,`${NAMES[real%12]}${Math.floor(real/12)-1}`));col.append(head);
   const figs=el('div','whistle-figs');
   list.forEach(([p,note],i)=>{const fig=el('div','whistle-fig'+(i?' alt':''));fig.setAttribute('role','img');fig.setAttribute('aria-label',`${NAMES[real%12]}：${describe(p)}${note?'，'+note:''}`);fig.title=note||(i?'替代指法':'基本指法');fig.append(diagram(p));figs.append(fig)});
   col.append(figs);
   const notes=list.map(([,n],i)=>n||(i?'替代':'')).filter(Boolean);if(notes.length)col.append(el('span','whistle-note',notes.join(' / ')));
   grid.append(col);
  }
  card.append(grid);host.append(card);
 }
}
for(const [value,label] of KEYS)$('whistleKey').add(new Option(label,value));
try{$('whistleKey').value=localStorage.getItem('flute.whistleKey')||'D'}catch{}
$('whistleKey').onchange=()=>{try{localStorage.setItem('flute.whistleKey',$('whistleKey').value)}catch{}render()};
render();
})();
// Modified by AI on 2026-10-08 10:06:28
