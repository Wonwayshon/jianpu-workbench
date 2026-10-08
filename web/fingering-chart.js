'use strict';
(() => {
const groups=[["吕 · 低音区", "呂（りょ）", [["筒音", null, [["1111111", ""]]], ["一", 0, [["1111110", ""]]], ["二×", 1, [["11111s0", "微开"]]], ["二", 2, [["1111100", ""]]], ["三×", 3, [["1111s00", "微开"], ["1111h00", "メリ"]]], ["三", 4, [["1111000", ""]]], ["四", 5, [["1110001", ""]]], ["五×", 6, [["11s0001", "微开"], ["1101111", "メリ · 替代"]]], ["五", 7, [["1100001", ""]]], ["六×", 8, [["1s00001", "微开"], ["1011110", "メリ · 替代"]]], ["六", 9, [["1000001", ""]]], ["七×", 10, [["s000001", "微开"], ["h000001", "メリ"]]], ["0", 10, [["1011111", "カリ"], ["0111100", "替代"]]], ["七", 11, [["0000001", ""], ["0111111", "替代"]]]]], ["甲 · 高音区", "甲（かん）", [["1", 0, [["1111110", ""], ["0111110", "替代"]]], ["2×", 1, [["11111s0", "微开"]]], ["2", 2, [["1111100", ""]]], ["3×", 3, [["1111s00", "微开"], ["1111h00", "メリ"]]], ["3", 4, [["1111000", ""]]], ["4", 5, [["1110001", ""]]], ["5×", 6, [["11s0001", "微开"], ["1101111", "大メリ · 替代"]]], ["5", 7, [["1100001", ""]]], ["6×", 8, [["1s00001", "微开"], ["1011110", "大メリ · 替代"]]], ["6", 9, [["1000001", ""]]], ["7×", 10, [["s000001", "微开"], ["h000001", "メリ"]]], ["0̇", 10, [["1011111", "カリ"], ["0100001", "カリ · 替代"]]], ["7", 11, [["0000001", ""], ["0111111", "替代"]]]]], ["大甲 · 更高音区", "大甲（だいかん）", [["8", null, [["0110001", ""], ["0111000", ""]]], ["2̇", null, [["1101100", "メリ"], ["1111100", ""], ["1111110", ""]]], ["3̇", null, [["1101000", ""], ["1001100", ""]]], ["4̇", null, [["1011110", ""], ["1011010", ""]]], ["5̇", null, [["0100100", ""]]]]]];

const ns='http://www.w3.org/2000/svg';
function element(name,attrs={}){const e=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;}
function diagram(pattern){
 const svg=element('svg',{viewBox:'0 0 252 36',class:'chart-holes','aria-hidden':'true'});
 [...pattern].forEach((state,i)=>{const x=18+i*36;svg.append(element('circle',{cx:x,cy:18,r:11,fill:state==='1'?'#294459':'white',stroke:'#294459','stroke-width':1.6}));
 if(state==='s')svg.append(element('path',{d:`M ${x+3} 7.4 A 11 11 0 1 0 ${x+3} 28.6 Z`,fill:'#294459'}));
 if(state==='h')svg.append(element('path',{d:`M ${x-11} 18 A 11 11 0 0 1 ${x+11} 18 Z`,fill:'#294459'}));
 });return svg;
}
for(const [heading,japanese,rows] of groups){
 const section=document.createElement('section');section.className='card fingering-group';
 const h=document.createElement('h2');h.textContent=heading;const jp=document.createElement('span');jp.className='subtle';jp.textContent=japanese;h.append(jp);section.append(h);
 const direction=document.createElement('p');direction.className='chart-direction';direction.textContent='吹口侧　左手：食指 / 中指 / 无名指　→　右手：食指 / 中指 / 无名指 / 小指';section.append(direction);
 for(const [label,pitch,variants] of rows){
 const row=document.createElement('div');row.className='chart-row';
 const name=document.createElement('strong');name.className='chart-note';name.textContent=label;row.append(name);
 const list=document.createElement('div');list.className='chart-variants';
 variants.forEach(([pattern,technique],index)=>{
 const button=document.createElement('button');button.className='chart-fingering';button.type='button';
 const description=[...pattern].map((v,i)=>`${i+1}孔${{'1':'按住','0':'打开',s:'微开',h:'半开'}[v]}`).join('，');
 button.setAttribute('aria-label',`${heading} ${label}，第 ${index+1} 种指法，${description}${technique?'，'+technique:''}。${pitch===null?'带入孔位并校准':'以此音作 1'}`);
 button.append(diagram(pattern));const text=document.createElement('span');text.className='chart-technique';text.textContent=(technique||'基本指法')+' · '+(pitch===null?'带入校准':'作 1');button.append(text);
 button.onclick=()=>{applyChartFingering(pattern,pitch,`${heading} ${label}${technique?' · '+technique:''}`);};list.append(button);
 });row.append(list);section.append(row);
 }
 document.getElementById('fingeringGroups').append(section);
}
})();
// Modified by AI on 2026-10-08 10:06:28
