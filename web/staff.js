'use strict';
// Staff notation for 乐谱文本: converted score lines (tokens with `midi`, source `degree`, `keyLabel`) -> ABC text
// -> abcjs SVG. One text line becomes one staff line. Spelling follows the key: the letter comes from the scale
// degree, accidentals are written wherever the pitch differs from the key signature or an earlier accidental
// in the same bar (standard staff rules, unlike the per-note rule of numbered notation).
(() => {
const LETTERS='CDEFGAB',NATURAL=[0,2,4,5,7,9,11];
const SIGS={C:0,G:1,D:2,A:3,E:4,B:5,'F#':6,'C#':7,F:-1,Bb:-2,Eb:-3,Ab:-4,Db:-5,Gb:-6,Cb:-7};
const ENHARMONIC={'D#':'Eb','A#':'Bb','G#':'Ab','E#':'F','B#':'C',Fb:'E'};
const SHARP_ORDER='FCGDAEB',FLAT_ORDER='BEADGCF';

// "♭B", "B♭", "bB", "Bb", "#F", "F#" -> ABC key name with a real signature ("Bb", "F#", ...)
function abcKey(label){
 const m=/^([#b♯♭]?)([A-Ga-g])([#b♯♭]?)$/.exec(String(label||'C').trim());if(!m)return 'C';
 const acc=m[1]||m[3],name=m[2].toUpperCase()+(['#','♯'].includes(acc)?'#':['b','♭'].includes(acc)?'b':'');
 return ENHARMONIC[name]||(name in SIGS?name:'C');
}
function signature(key){
 const n=SIGS[key]||0,alt={};for(const l of LETTERS)alt[l]=0;
 if(n>0)for(const l of SHARP_ORDER.slice(0,n))alt[l]=1;if(n<0)for(const l of FLAT_ORDER.slice(0,-n))alt[l]=-1;return alt;
}
// Letter from the scale degree in `key`, octave and alteration from the actual pitch.
function spell(midi,degree,key){
 let li=LETTERS.indexOf(key[0]);if(degree)li=(li+degree-1)%7;else li=[0,0,1,1,2,3,3,4,4,5,5,6][midi%12];
 const letter=LETTERS[li];let best=null;
 for(let oct=-1;oct<=9;oct++){const alt=midi-(12*(oct+1)+NATURAL[li]);if(Math.abs(alt)<=2&&(!best||Math.abs(alt)<Math.abs(best.alt)))best={letter,oct,alt}}
 if(!best||Math.abs(best.alt)>1&&!degree)return spell(midi,0,'C');
 return best;
}
function pitchText(p){
 let s=p.letter;if(p.oct>=5)s=s.toLowerCase()+"'".repeat(p.oct-5);else s=s+','.repeat(Math.max(0,4-p.oct));return s;
}
const STANDARD=[48,32,28,24,16,14,12,8,7,6,4,3,2,1];
function durText(n){if(n===1)return '';if(Number.isInteger(n))return String(n);let q=1;while(!Number.isInteger(n*q)&&q<64)q*=2;return `${Math.round(n*q)}/${q}`}
function splitDur(n){if(STANDARD.includes(n)||!Number.isInteger(n))return [n];const parts=[];let rest=n;for(const s of STANDARD)while(rest>=s){parts.push(s);rest-=s}return parts}
const DECOR={tr:'!trill!','~':'!mordent!',fermata:'!fermata!',stacc:'.',accent:'!>!',breath:'!breath!'};

// ABC tempo fields accept quoted expression text with or without a metronome value.
function abcTempo(mark){const text=mark.text?JSON.stringify(String(mark.text).replace(/[\r\n]/g,' ')):'';return text+(mark.value!=null?(text?' ':'')+'1/4='+mark.value:'')}
// Returns {abc, ranges:[{start,end,token}]} ; ranges map ABC character spans back to score tokens.
function toABC(lines,opts={}){
 const title=lines.find(l=>l.kind==='meta'&&l.name==='title')?.value;
 let key=abcKey(opts.keyLabel),time=null,tempo=null;
 const firstMusic=lines.findIndex(l=>l.kind==='music');
 for(const l of lines.slice(0,firstMusic<0?lines.length:firstMusic)){if(l.kind==='meta'&&l.name==='time')time=l.value;if(l.kind==='meta'&&l.name==='tempo')tempo=l;if(l.kind==='meta'&&(l.name==='key'||l.name==='origKey'))key=abcKey(l.value)}
 // Full score: one ABC voice per part, a bracket over all staves, bass clef for low parts.
 const partIds=[];for(const l of lines)if(l.kind==='music'&&l.part&&!partIds.includes(l.part))partIds.push(l.part);
 const partName=id=>opts.partNames?.find(p=>p.id===id)?.name||(lines.find(l=>l.kind==='meta'&&l.name==='part'&&l.value.id===id)?.value.name)||id;
 const voiceOf=id=>partIds.indexOf(id)+1;
 const percussionPart=id=>{const ts=lines.filter(l=>l.kind==='music'&&(l.part??'')===id).flatMap(l=>l.tokens);return ts.some(t=>t.t==='percussion')&&!ts.some(t=>t.t==='note'||t.t==='chord')};
 const percussionOnly=!partIds.length&&percussionPart('');
 let voices='';
 if(partIds.length){
  voices=`%%score [${partIds.map(voiceOf).join(' ')}]\n%%systemsep 50\n%%sysstaffsep 22\n`;
  for(const id of partIds){
   const ms=lines.filter(l=>l.kind==='music'&&l.part===id).flatMap(l=>l.tokens).flatMap(t=>t.t==='note'?[t.midi]:t.t==='chord'?t.notes.map(n=>n.midi):[]).filter(m=>m!=null).sort((a,b)=>a-b);
   const median=ms.length?ms[ms.length>>1]:67;
   voices+=`V:${voiceOf(id)} name="${partName(id).replace(/"/g,'')}" snm="${partName(id).replace(/"/g,'')}"${percussionPart(id)?' clef=perc':median<57?' clef=bass':''}\n`;
  }
 }
 let head=`X:1\n${title?`T:${title.replace(/\n/g,' ')}\n`:''}M:${time||'none'}\nL:1/32\n${tempo?`Q:${abcTempo(tempo)}\n`:''}${voices}K:${percussionOnly?'C clef=perc':key}\n`;
 let body='';const ranges=[];let pending='',pendingVoice={};let barAlt={},sig=signature(key);
 const emit=s=>{body+=s};
 lines.forEach((line,li)=>{
  if(li<firstMusic)return;
  if(line.kind==='meta'){
   if(line.name==='key'||line.name==='origKey'){key=abcKey(line.value);sig=signature(key);if(partIds.length){for(const id of partIds)pendingVoice[id]=(pendingVoice[id]||'')+`[K:${key}]`}else pending+=`[K:${key}]`}
   if(line.name==='time')pending+=`[M:${line.value}]`;if(line.name==='tempo')pending+=`[Q:${abcTempo(line)}]`;return;
  }
  if(line.kind!=='music')return;
  if(body)emit('\n');if(line.part){emit(`[V:${voiceOf(line.part)}] `);emit(pendingVoice[line.part]||'');pendingVoice[line.part]='';}emit(pending);pending='';if(percussionOnly||(line.part&&percussionPart(line.part)))emit('[K:C]');barAlt={};
  const toks=line.tokens;let lastNote=null,lastWasBar=false,slurDepth=0;
  const noteOut=(t,dur,tieFrom,orig)=>{
   const start=body.length;
   if(!tieFrom&&t.graces?.length)emit('{'+t.graces.map(g=>accidentalFor(g.p)+pitchText(g.p)).join('')+'}');
   if(!tieFrom)for(const o of t.orns||[])emit(DECOR[o]||'');
   if(t.t==='rest'){emit('z'+durText(dur))}
   // B is only a vertical placement for the cross head, never a playback pitch.
   else if(t.t==='percussion')emit('!style=x!B'+durText(dur));
   else if(t.t==='chord')emit('['+t.ps.map(p=>accidentalFor(p)+pitchText(p)).join('')+']'+durText(dur));
   else emit(accidentalFor(t.p)+pitchText(t.p)+durText(dur));
   ranges.push({start,end:body.length,token:orig});
  };
  const accidentalFor=p=>{
   const k=p.letter+p.oct,current=k in barAlt?barAlt[k]:sig[p.letter];
   if(current===p.alt)return '';barAlt[k]=p.alt;return p.alt===0?'=':p.alt>0?'^'.repeat(p.alt):'_'.repeat(-p.alt);
  };
  // Durations first: dashes extend the previous sound; after a bar line they become a tied continuation.
  const items=[];let graces=[];
  for(let i=0;i<toks.length;i++){
   const t=toks[i];
   if(t.t==='note'&&t.grace){graces.push(t);continue}
   if(t.t==='note'||t.t==='rest'||t.t==='chord'||t.t==='percussion'){
    const dur=8*Math.pow(0.5,t.under||0)*(t.dot===1?1.5:t.dot===2?1.75:1);
    const p=t.t==='note'?spell(t.midi,t.degree,key):null,ps=t.t==='chord'?t.notes.filter(n=>n.midi!=null).map(n=>spell(n.midi,n.degree,key)):null;
    const it={kind:'n',t,dur,p,ps,graces:graces.map(g=>({p:spell(g.midi,g.degree,key)}))};graces=[];items.push(it);lastNote=it;lastWasBar=false;continue;
   }
   if(t.t==='dash'){
    if(lastNote&&!lastWasBar){lastNote.dur+=8;continue}
    if(lastNote){const cont={kind:'n',t:lastNote.t,dur:8,p:lastNote.p,ps:lastNote.ps,cont:true,graces:[]};if(lastNote.t.t!=='rest')lastNote.tie=true;items.push(cont);lastNote=cont;lastWasBar=false}
    continue;
   }
   if(t.t==='bar')lastWasBar=true;
   items.push({kind:'x',t});
  }
  for(let i=0;i<items.length;i++){
   const it=items[i];
   if(it.kind==='x'){
    const t=it.t;
    if(t.t==='space')emit(' ');
    else if(t.t==='bar'){emit(t.text===':||:'?'::':t.text);barAlt={}}
    else if(t.t==='volta')emit(`[${t.text.replace('.','')} `);
    else if(t.t==='open'){emit('(');slurDepth++}
    else if(t.t==='close'){emit(')');slurDepth--}
    else if(t.t==='tupOpen'){let n=0,depth=0;for(let j=i+1;j<items.length;j++){const x=items[j];if(x.kind==='x'&&x.t.t==='tupOpen')depth++;if(x.kind==='x'&&x.t.t==='tupClose'){if(!depth)break;depth--}if(x.kind==='n'&&!x.cont)n++}
     let q=1;while(q*2<t.n)q*=2;emit(t.n===3&&n===3?'(3':`(${t.n}:${q}:${n}`)}
    continue;
   }
   const t={...it.t,p:it.p,ps:it.ps,graces:it.cont?[]:it.graces},parts=splitDur(it.dur);
   parts.forEach((d,k)=>{noteOut(t,d,it.cont||k>0,it.t);if(t.t!=='rest'&&(k<parts.length-1||it.tie))emit('-')});
  }
 });
 // Ranges were measured in the body; abcjs reports positions in the whole text.
 for(const r of ranges){r.start+=head.length;r.end+=head.length}
 return {abc:head+body.replace(/\n+$/,''),ranges};
}

let loadPromise=null;
function loadAbcjs(){if(window.ABCJS)return Promise.resolve();if(!loadPromise)loadPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/abcjs/abcjs-basic-min.js';s.onload=resolve;s.onerror=()=>{loadPromise=null;reject(new Error('五线谱组件加载失败'))};document.head.append(s)});return loadPromise}

// Renders into host; tokens get `_staffEls` (their SVG elements) for playback highlighting.
async function render(host,lines,opts={}){
 await loadAbcjs();
 const {abc,ranges}=toABC(lines,opts);host.classList.add('staff-score');
 // abcjs rewrites the size styles of the element it draws into; keep the host (a scroll box) untouched.
 host.replaceChildren();const target=document.createElement('div');target.className='staff-inner';host.append(target);
 const width=Math.max(320,(opts.width||host.clientWidth||700)-10);
 const [tune]=ABCJS.renderAbc(target,abc,{add_classes:true,responsive:opts.responsive===false?undefined:'resize',staffwidth:width,paddingtop:opts.measureEvery?24:8,paddingbottom:8,paddingleft:4,paddingright:4,scale:opts.scale||1,format:{titlefont:'"PingFang SC",sans-serif 16',gchordfont:'sans-serif 12',vocalfont:'sans-serif 12'}});
 for(const r of ranges)r.token._staffEls=[];
 for(const line of tune?.lines||[])for(const staff of line.staff||[])for(const voice of staff.voices||[])for(const el of voice){
  if(el.el_type!=='note'||el.startChar==null)continue;
  // abcjs may start a note at a preceding '(' or space; match by overlap with the note's own text instead.
  const end=el.endChar??el.startChar+1,r=ranges.find(r=>r.start<end&&r.end>el.startChar&&!r.used);if(r)r.used=true;
  if(r&&el.abselem?.elemset){r.token._staffEls.push(...el.abselem.elemset);for(const e of el.abselem.elemset)e._token=r.token}
 }
 // Use the same written-measure map as numbered notation, including on filtered/paginated pages.
 if(opts.measureEvery){
  const every=Math.max(1,Math.floor(opts.measureEvery)),numbers=opts.measureNumbers||Jianpu.numberMeasures(lines),firstPart=lines.find(l=>l.kind==='music')?.part;
  for(const line of lines.filter(l=>l.kind==='music'&&l.part===firstPart))for(const m of Jianpu.measureTimeline(line.tokens)){
   const first=m.events[0]?.token,n=numbers.get(first);if(!n||(n-1)%every)continue;
   const cells=first?._staffEls||[],anchor=cells.find(e=>e.ownerSVGElement);if(!anchor)continue;
   const svg=anchor.ownerSVGElement,rects=cells.map(e=>e.getBoundingClientRect()),matrix=svg.getScreenCTM();if(!matrix)continue;
   const point=svg.createSVGPoint();point.x=Math.min(...rects.map(r=>r.left));point.y=Math.min(...rects.map(r=>r.top))-8;
   const at=point.matrixTransform(matrix.inverse()),label=document.createElementNS('http://www.w3.org/2000/svg','text');
   label.setAttribute('x',at.x);label.setAttribute('y',at.y);label.setAttribute('class','staff-measure-number');label.textContent=n;svg.append(label);
  }
 }
 host._abc=abc;return abc;
}

window.Staff={toABC,render,loadAbcjs,abcKey,spell};
})();
// Modified by AI on 2026-10-08 20:41:46
