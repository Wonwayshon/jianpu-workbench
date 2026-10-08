'use strict';
(() => {
const data=window.FLUTE_FINGERINGS;if(!data)return;
const ns='http://www.w3.org/2000/svg';
const SHARP=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'],FLAT=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const JP_SHARP=['1','♯1','2','♯2','3','4','♯4','5','♯5','6','♯6','7'],JP_FLAT=['1','♭2','2','♭3','3','4','♭5','5','♭6','6','♭7','7'];
// Key geometry in the common fingering-chart layout: left hand 1-2-3 with the thumb keys drawn below
// the first finger and G♯ above the third; dotted hand divider; right hand 1-2-3 with the side and
// trill keys drawn small between them; foot joint E♭ key and the C♯ / C / B rollers plus B-foot gizmo.
const KEYS={
 L1:{shape:'c',x:24,y:28,r:13,name:'左手食指',label:'1'},
 Tb:{shape:'r',x:6,y:46,w:32,h:8,name:'左手拇指 B 键',label:'B',ls:5.5},
 Tbb:{shape:'r',x:13,y:56,w:24,h:7,name:'左手拇指 B♭ 键',label:'B♭',ls:5},
 L2:{shape:'c',x:58,y:28,r:13,name:'左手中指',label:'2'},
 L3:{shape:'c',x:92,y:28,r:13,name:'左手无名指',label:'3'},
 Gs:{shape:'r',x:106,y:2,w:12,h:15,name:'左手小指 G♯ 键',label:'G♯',lx:112,ly:-2.5},
 CsT:{shape:'r',x:131,y:4,w:7,h:12,name:'C♯ 颤音键',label:'C♯颤',lx:134.5,ly:-2.5},
 BbL:{shape:'r',x:131,y:44,w:7,h:15,name:'右手食指 B♭ 侧键',label:'B♭侧',lx:134.5,ly:67},
 R1:{shape:'c',x:153,y:28,r:13,name:'右手食指',label:'1'},
 DT:{shape:'r',x:169.5,y:44,w:7,h:15,name:'D 颤音键（右手 1、2 指之间）',label:'D颤',lx:173,ly:67},
 R2:{shape:'c',x:192,y:28,r:13,name:'右手中指',label:'2'},
 DsT:{shape:'r',x:208.5,y:44,w:7,h:15,name:'D♯ 颤音键（右手 2、3 指之间）',label:'D♯颤',lx:212,ly:67},
 R3:{shape:'c',x:231,y:28,r:13,name:'右手无名指',label:'3'},
 Eb:{shape:'p',d:'M266 17 H259 A11 11 0 0 0 259 39 H266 Z',name:'右手小指 E♭ 键',label:'E♭',lx:261,ly:30.5,ls:6},
 Cs:{shape:'r',x:269,y:15,w:26,h:7,name:'右手小指 C♯ 键',label:'C♯',ls:5},
 C:{shape:'r',x:269,y:24.5,w:26,h:7,name:'右手小指 C 键',label:'C',ls:5},
 B:{shape:'r',x:269,y:34,w:26,h:7,name:'右手小指 B 键',label:'B',ls:5},
 Gz:{shape:'r',x:276,y:4,w:16,h:7,name:'B 尾 gizmo 键',label:'gizmo',lx:284,ly:-2.5}
};
function el(name,attrs={}){const e=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e}
function html(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function parse(spec){const pressed=new Set(),trill=new Set();for(const t of spec.split(' ')){if(!t)continue;if(t.endsWith('*'))trill.add(t.slice(0,-1));else pressed.add(t)}return {pressed,trill}}
function keyShape(k,fill){
 const common={fill,stroke:'#294459','stroke-width':1.5};
 if(k.shape==='c')return el('circle',{cx:k.x,cy:k.y,r:k.r,...common});
 if(k.shape==='p')return el('path',{d:k.d,...common,'stroke-linejoin':'round'});
 return el('rect',{x:k.x,y:k.y,width:k.w,height:k.h,rx:Math.min(k.w,k.h)/2,...common});
}
// Label inside the key unless the key gives an outside position.
function keyLabel(k){
 const inside=k.lx===undefined||k.shape==='p';
 const x=k.lx??(k.shape==='c'?k.x:k.x+k.w/2),y=k.ly??(k.shape==='c'?k.y+4:k.y+k.h/2+1.8);
 const t=el('text',{x,y,'text-anchor':'middle','font-size':k.ls||(k.shape==='c'?11:6.5),fill:'#566979'});t.textContent=k.label;return t;
}
function diagram(spec,labels=false){
 const {pressed,trill}=parse(spec);
 const svg=el('svg',{viewBox:labels?'0 -10 300 82':'0 0 300 66',class:labels?'flute-keys flute-keys-legend':'flute-keys','aria-hidden':'true'});
 svg.append(el('line',{x1:124,y1:4,x2:124,y2:60,stroke:'#8fa3b8','stroke-width':1.2,'stroke-dasharray':'2 3'}));
 for(const [id,k] of Object.entries(KEYS)){
  svg.append(keyShape(k,trill.has(id)?'#e07b24':pressed.has(id)?'#294459':'white'));
  if(labels)svg.append(keyLabel(k));
 }
 return svg;
}
function describe(spec){
 const {pressed,trill}=parse(spec);const names=ids=>Object.keys(KEYS).filter(id=>ids.has(id)).map(id=>KEYS[id].name).join('、');
 return `按下：${names(pressed)||'全部放开'}${trill.size?`；颤音时反复按放：${names(trill)}`:''}`;
}
function noteName(m){const pc=m%12,oct=Math.floor(m/12)-1;return SHARP[pc]===FLAT[pc]?`${SHARP[pc]}${oct}`:`${SHARP[pc]}${oct} / ${FLAT[pc]}${oct}`}
function jianpuPart(text,rel){
 const box=html('span','jp');const acc=text.length>1?text[0]:'';if(acc)box.append(html('span','jp-acc',acc));
 const digit=html('span','jp-digit',text.slice(-1));
 if(rel){const dots=html('span','jp-dots '+(rel>0?'up':'down'));for(let i=0;i<Math.abs(rel);i++)dots.append(html('i',null,'•'));digit.append(dots)}
 box.append(digit);return box;
}
function jianpu(m){
 const pc=m%12,rel=Math.floor(m/12)-5,wrap=html('span','jp-group');
 wrap.append(jianpuPart(JP_SHARP[pc],rel));
 if(JP_SHARP[pc]!==JP_FLAT[pc]){wrap.append(html('span','jp-sep','/'));wrap.append(jianpuPart(JP_FLAT[pc],rel))}
 return wrap;
}
function fingeringFigure(spec,caption,fallback){
 const fig=html('div','flute-fingering');fig.setAttribute('role','img');
 fig.setAttribute('aria-label',`${caption||fallback}。${describe(spec)}`);
 fig.append(diagram(spec));fig.append(html('span','chart-technique',caption||fallback));return fig;
}

// Basic chart, one card per register.
const REGISTERS=[['低音区','B3 – C♯5',59,73],['中音区','D5 – C♯6',74,85],['高音区','D6 – C7',86,96]];
const basicHost=document.getElementById('fluteBasic');
for(const [title,range,lo,hi] of REGISTERS){
 const card=html('section','card fingering-group');const h=html('h2',null,title);h.append(html('span','subtle',range));card.append(h);
 for(const [m,list] of data.basic){
  if(m<lo||m>hi)continue;
  const row=html('div','flute-row');const head=html('div','flute-note');head.append(jianpu(m),html('small',null,noteName(m)));row.append(head);
  const variants=html('div','chart-variants');list.forEach(([spec,note],i)=>variants.append(fingeringFigure(spec,note,i?'替代指法':'基本指法')));
  row.append(variants);card.append(row);
 }
 basicHost.append(card);
}

// Trill chart, grouped by the lower note; a select narrows the list.
const trillHost=document.getElementById('fluteTrillList'),select=document.getElementById('fluteTrillFrom');
const byLow=new Map();for(const t of data.trills){if(!byLow.has(t[0]))byLow.set(t[0],[]);byLow.get(t[0]).push(t)}
select.add(new Option('全部起始音',''));
for(const m of byLow.keys())select.add(new Option(`从 ${noteName(m)} 开始`,m));
const trillCards=new Map();
for(const [m,list] of byLow){
 const card=html('section','card fingering-group flute-trill-card');card.dataset.low=m;
 const h=html('h2');const title=html('span','flute-trill-title');title.append(jianpu(m),html('span',null,noteName(m)));h.append(title);card.append(h);
 let current=null,variants=null;
 for(const [lo,hi,spec,note] of list){
  if(hi!==current){
   current=hi;const row=html('div','flute-row');const head=html('div','flute-note');
   head.append(html('span','flute-interval',hi-lo===1?'半音':'全音'),jianpu(hi),html('small',null,noteName(hi)));
   variants=html('div','chart-variants');row.append(head,variants);card.append(row);
  }
  variants.append(fingeringFigure(spec,note,'基本'));
 }
 trillCards.set(String(m),card);trillHost.append(card);
}
select.onchange=()=>{for(const [m,card] of trillCards)card.hidden=select.value!==''&&select.value!==m};

document.getElementById('fluteLegendKeys').append(diagram('',true));

// View switching: shinobue / flute, then basic / trill inside the flute view.
function segments(pairs,onChange){
 const set=active=>{for(const [btn,view] of pairs){const on=btn===active;btn.setAttribute('aria-pressed',String(on));document.getElementById(view).hidden=!on}if(onChange)onChange()};
 for(const [btn] of pairs)btn.onclick=()=>set(btn);
}
const $=id=>document.getElementById(id);
segments([[$('shinoChartTab'),'shinoChartView'],[$('fluteChartTab'),'fluteChartView'],[$('whistleChartTab'),'whistleChartView']],()=>window.scrollTo(0,0));
segments([[$('fluteBasicTab'),'fluteBasic'],[$('fluteTrillTab'),'fluteTrills']]);
})();
// Modified by AI on 2026-10-08 10:06:28
