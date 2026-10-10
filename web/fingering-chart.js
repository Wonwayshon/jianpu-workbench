'use strict';
(() => {
const groups=[["吕 · 低音区", "呂（りょ）", [["筒音", null, [["1111111", ""]]], ["一", 0, [["1111110", ""]]], ["二×", 1, [["11111s0", "微开"]]], ["二", 2, [["1111100", ""]]], ["三×", 3, [["1111s00", "微开"], ["1111h00", "メリ"]]], ["三", 4, [["1111000", ""]]], ["四", 5, [["1110001", ""]]], ["五×", 6, [["11s0001", "微开"], ["1101111", "メリ · 替代"]]], ["五", 7, [["1100001", ""]]], ["六×", 8, [["1s00001", "微开"], ["1011110", "メリ · 替代"]]], ["六", 9, [["1000001", ""]]], ["七×", 10, [["s000001", "微开"], ["h000001", "メリ"]]], ["0", 10, [["1011111", "カリ"], ["0111100", "替代"]]], ["七", 11, [["0000001", ""], ["0111111", "替代"]]]]], ["甲 · 高音区", "甲（かん）", [["1", 0, [["1111110", ""], ["0111110", "替代"]]], ["2×", 1, [["11111s0", "微开"]]], ["2", 2, [["1111100", ""]]], ["3×", 3, [["1111s00", "微开"], ["1111h00", "メリ"]]], ["3", 4, [["1111000", ""]]], ["4", 5, [["1110001", ""]]], ["5×", 6, [["11s0001", "微开"], ["1101111", "大メリ · 替代"]]], ["5", 7, [["1100001", ""]]], ["6×", 8, [["1s00001", "微开"], ["1011110", "大メリ · 替代"]]], ["6", 9, [["1000001", ""]]], ["7×", 10, [["s000001", "微开"], ["h000001", "メリ"]]], ["0̇", 10, [["1011111", "カリ"], ["0100001", "カリ · 替代"]]], ["7", 11, [["0000001", ""], ["0111111", "替代"]]]]], ["大甲 · 更高音区", "大甲（だいかん）", [["8", null, [["0110001", ""], ["0111000", ""]]], ["2̇", null, [["1101100", "メリ"], ["1111100", ""], ["1111110", ""]]], ["3̇", null, [["1101000", ""], ["1001100", ""]]], ["4̇", null, [["1011110", ""], ["1011010", ""]]], ["5̇", null, [["0100100", ""]]]]]];

const ns='http://www.w3.org/2000/svg';
function element(name,attrs={}){const e=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;}
// split=true leaves a gap between the left-hand (3) and right-hand (4) holes, as in the table design.
function diagram(pattern,split=false){
 const svg=element('svg',{viewBox:split?'0 0 268 36':'0 0 252 36',class:'chart-holes','aria-hidden':'true'});
 if(split)svg.append(element('line',{x1:116,y1:6,x2:116,y2:30,stroke:'#D9DCE2','stroke-width':1.5}));
 [...pattern].forEach((state,i)=>{const x=18+i*36+(split&&i>=3?16:0);svg.append(element('circle',{cx:x,cy:18,r:11,fill:state==='1'?'#294459':'white',stroke:'#294459','stroke-width':1.6}));
 if(state==='s')svg.append(element('path',{d:`M ${x+3} 7.4 A 11 11 0 1 0 ${x+3} 28.6 Z`,fill:'#294459'}));
 if(state==='h')svg.append(element('path',{d:`M ${x-11} 18 A 11 11 0 0 1 ${x+11} 18 Z`,fill:'#294459'}));
 });return svg;
}
const TIPS=[[/カリ/,'カリ · 外转升音','把笛子略向外转，使音高升高。声音会更响、更粗犷。'],[/メリ/,'メリ · 内转降音','把笛子略向内转，使音高降低。声音会更轻、更含蓄；大メリ幅度更大。'],[/微开/,'微开 · 只开一点','手指横向稍移，让孔只开一点；也可纵向移开约一半并配合メリ。']];
const host=document.getElementById('fingeringGroups');
const tabs=document.createElement('div');tabs.className='app-segments finger-regs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','音区');
const detail=document.createElement('aside');detail.className='finger-detail';detail.id='fingerDetail';detail.setAttribute('aria-live','polite');
const split=document.createElement('div');split.className='finger-split';host.before(split);split.append(host,detail);
// One table card (design): register tabs and the legend on top, then a header row and compact rows.
const bar=document.createElement('div');bar.className='finger-bar';bar.append(tabs);const legend=document.querySelector('#shinoChartView .chart-legend');if(legend)bar.append(legend);host.append(bar);
const guide=document.querySelector('#shinoChartView .chart-guide');if(guide){const h=guide.querySelector('h2');if(h)h.textContent='关于这张表';split.after(guide)}
const sections=[];let current=null;
function select(button,info){
 if(current)current.classList.remove('selected');current=button;button.classList.add('selected');
 const {pattern,pitch,heading,label,technique}=info;detail.replaceChildren();
 const close=document.createElement('button');close.type='button';close.className='finger-detail-close small-btn';close.textContent='关闭';close.onclick=()=>detail.classList.remove('open');
 const head=document.createElement('div');head.className='finger-detail-head';const big=document.createElement('strong');big.textContent=label;const meta=document.createElement('span');const reg=document.createElement('b');reg.textContent=heading;const tech=document.createElement('small');tech.textContent=technique||'基本指法';meta.append(reg,tech);head.append(big,meta,close);
 const pic=document.createElement('div');pic.className='finger-detail-pic';const ends=document.createElement('div');ends.className='finger-detail-ends';ends.innerHTML='<span>吹口侧</span><span>笛尾</span>';const fingers=document.createElement('div');fingers.className='finger-detail-fingers';fingers.innerHTML='<span>左食</span><span>左中</span><span>左无</span><span>右食</span><span>右中</span><span>右无</span><span>右小</span>';pic.append(ends,diagram(pattern),fingers);
 detail.append(head,pic);
 const tip=TIPS.find(([re])=>re.test(technique||''));if(tip){const t=document.createElement('div');t.className='finger-tip';const b=document.createElement('b');b.textContent=tip[1];const p=document.createElement('span');p.textContent=tip[2];t.append(b,p);detail.append(t)}
 const note=document.createElement('p');note.className='subtle';note.textContent=pitch===null?'大甲音区只带入孔位，需按实际吹出的音校准。':'谱号是日本篠笛记号；0 不是休止符，× 也不是中国简谱的升号。';detail.append(note);
 const go=document.createElement('button');go.type='button';go.className='primary finger-go';go.textContent=pitch===null?'带入换算并校准':`用「${label}」作 1 去换算`;go.onclick=()=>{detail.classList.remove('open');applyChartFingering(pattern,pitch,`${heading} ${label}${technique?' · '+technique:''}`)};detail.append(go);
 detail.classList.add('open');
}
groups.forEach(([heading,japanese,rows],gi)=>{
 const section=document.createElement('section');section.className='card fingering-group';section.hidden=gi!==0;
 const h=document.createElement('h2');h.textContent=heading;const jp=document.createElement('span');jp.className='subtle';jp.textContent=japanese;h.append(jp);section.append(h);
 const direction=document.createElement('div');direction.className='chart-head';direction.setAttribute('aria-hidden','true');direction.innerHTML='<span>谱号</span><span class="chart-head-hands"><span>左手 食 中 无</span><span>右手 食 中 无 小</span></span><span>吹法</span>';section.append(direction);
 for(const [label,pitch,variants] of rows){
 const row=document.createElement('div');row.className='chart-row';
 const name=document.createElement('strong');name.className='chart-note';name.textContent=label;row.append(name);
 const list=document.createElement('div');list.className='chart-variants';
 variants.forEach(([pattern,technique],index)=>{
 const button=document.createElement('button');button.className='chart-fingering';button.type='button';
 const description=[...pattern].map((v,i)=>`${i+1}孔${{'1':'按住','0':'打开',s:'微开',h:'半开'}[v]}`).join('，');
 button.setAttribute('aria-label',`${heading} ${label}，第 ${index+1} 种指法，${description}${technique?'，'+technique:''}。查看详情`);
 button.append(diagram(pattern,true));const text=document.createElement('span');text.className='chart-technique';text.textContent=(technique||'基本指法')+' · '+(pitch===null?'带入校准':'作 1');button.append(text);
 const info={pattern,pitch,heading,label,technique};
 button.onclick=()=>select(button,info);list.append(button);
 if(gi===0&&!current)queueMicrotask(()=>{if(!current){select(button,info);detail.classList.remove('open')}});
 });row.append(list);section.append(row);
 }
 host.append(section);sections.push(section);
 const t=document.createElement('button');t.type='button';t.textContent=heading.replace(' · ','·');t.setAttribute('aria-pressed',String(gi===0));
 t.onclick=()=>{sections.forEach((s,i)=>s.hidden=i!==gi);for(const b of tabs.children)b.setAttribute('aria-pressed',String(b===t))};tabs.append(t);
});
})();
// Modified by AI on 2026-10-11 06:25:46
