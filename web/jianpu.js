'use strict';
// 乐谱文本格式 v1 — parser, serializer and renderer. The format itself is documented for people and for
// vision models in score-ocr.js (NOTATION_RULES); keep both in step when changing the syntax.
(() => {
const ACC={'#':1,'♯':1,'b':-1,'♭':-1,'♮':0};
const ORNAMENTS={tr:'tr','~':'∽',fermata:'𝄐',stacc:'▾',accent:'>',breath:'V'};
const KEY_PC={C:0,D:2,E:4,F:5,G:7,A:9,B:11},LETTERS='CDEFGAB',MAJOR=[0,2,4,5,7,9,11];
// Tempo words (Italian and Chinese) -> a typical quarter-note speed, used when no number is given.
const TEMPO_WORDS=[['prestissimo',208],['presto',184],['vivacissimo',176],['vivace',160],['allegro assai',152],['allegro moderato',120],['allegretto',116],['allegro',132],['moderato',108],['andantino',96],['andante',84],['adagietto',72],['adagio',66],['larghetto',60],['lento',54],['largo',50],['grave',40],
 ['小快板',116],['中快板',120],['急板',184],['快板',132],['中板',104],['中速',96],['小行板',96],['行板',84],['慢板',60],['柔板',66],['广板',50],['庄板',40]];
// Relative changes and expression marks have no fixed BPM; preserve them without inventing a speed.
const TEMPO_TEXT=['稍慢','突慢','原速','渐慢','欢快地'];
// Pitch names instead of digits (models often write C D E for staff notation): an absolute letter name becomes the
// scale degree of the current key. Unmarked letters lie in the @octave group (C4–B4 by default); a digit right after
// the letter gives the octave directly (C5 = C in octave 5); ' and , work as for digits.
function letterNote(letter,acc,sciOctave,marks,key){
 const L=LETTERS.indexOf(letter.toUpperCase()),o=(sciOctave?Number(sciOctave)-key.octave:0)+marks;
 const d=L+7*o-key.letter,degree=((d%7)+7)%7+1,octave=Math.floor(d/7);
 const noteSemi=KEY_PC[LETTERS[L]]+acc+12*o,degSemi=key.pc0+MAJOR[degree-1]+12*octave;
 return {degree,acc:noteSemi-degSemi,octave};
}

function normalize(text){
 return text.replace(/\r\n?/g,'\n').replace(/[’′‘`]/g,"'").replace(/，/g,',').replace(/｜/g,'|').replace(/＃/g,'#').replace(/（/g,'(').replace(/）/g,')').replace(/。/g,'.').replace(/[—–－]/g,'-').replace(/／/g,'/').replace(/：/g,':').replace(/｛/g,'{').replace(/｝/g,'}').replace(/［/g,'[').replace(/！/g,'!').replace(/％/g,'%').replace(/＝/g,'=');
}

// "F", "bB", "♭B", "B♭", "#F" -> {pc, label}
function parseKey(value){
 const m=value.replace(/^\s*1\s*=\s*/,'').trim().match(/^([#b♯♭]?)([A-Ga-g])([#b♯♭]?)$/);
 if(!m)return null;
 const acc=m[1]||m[3],shift=['#','♯'].includes(acc)?1:['b','♭'].includes(acc)?-1:0;
 const letter=m[2].toUpperCase();
 return {pc:(KEY_PC[letter]+shift+12)%12,label:(shift>0?'♯':shift<0?'♭':'')+letter};
}

function parseDirective(name,value,fail){
 name=name.toLowerCase();
 if(name==='title')return {kind:'meta',name,value:value.trim()};
 if(name==='key'){const k=parseKey(value);if(!k)fail(`调号「${value}」写法不对，应为 1=F、1=bB 这样的形式。`);return {kind:'meta',name,value:k.label,pc:k.pc}}
 if(name==='octave'){const n=Number(value);if(!Number.isInteger(n)||n<2||n>6)fail('@octave 后应为 2–6 的整数（中央 C 所在为第 4 组）。');return {kind:'meta',name,value:n}}
 if(name==='time'){if(!/^\d{1,2}\/\d{1,2}$/.test(value.trim()))fail('@time 后应为 2/4、3/4、6/8 这样的拍号。');return {kind:'meta',name,value:value.trim()}}
 if(name==='tempo'){
  // 72 / ♩=72 / Andante / Andante 76 / 行板 ♩=72 / Allegro (♩≈132)
  const v=value.trim(),num=/(\d{2,3})/.exec(v),low=v.toLowerCase(),word=TEMPO_WORDS.find(([w])=>low.includes(w));
  const text=v.replace(/[(（]?\s*[♩=≈约\s]*\d{2,3}\s*[)）]?/g,'').replace(/[♩=≈]/g,'').trim();
  if(!num&&!word&&TEMPO_TEXT.includes(v))return {kind:'meta',name,value:null,text:v,exact:false};
  const n=num?Number(num[1]):word?word[1]:NaN;
  if(!(n>=20&&n<=300))fail('@tempo 后应为 20–300 的数字，或速度文字，如 稍慢、突慢、原速、渐慢、中板、欢快地、小快板、快板、Andante。');
  return {kind:'meta',name,value:n,text:text||null,exact:!!num};
 }
 if(name==='page'){const n=Number(value||0);return {kind:'page',value:Number.isFinite(n)&&n>0?n:null}}
 // @part 简称 · 全名 (or "简称 全名" / "简称"): declares a part of a full score.
 if(name==='part'){const m=/^\s*([^\s·=:：]+)\s*[·=:：]?\s*(.*)$/.exec(value);if(!m)fail('@part 后写声部简称，如 @part 笛 · 竹笛。');return {kind:'meta',name:'part',value:{id:m[1],name:(m[2]||m[1]).trim()}}}
 fail(`不认识的指令 @${name}。可用：@title @key @octave @time @tempo @page @part。`);
}

function parseMusic(src,lineNo,notes,fail,key={letter:0,pc0:0,octave:4},offset=0){
 // Every token remembers its text line and starting column (for the side-by-side editor).
 const tokens=[];let i=0,slur=0;const tup=[];
 {const push=tokens.push.bind(tokens);tokens.push=t=>{t.line??=lineNo;t.col??=i+offset;return push(t)}}
 while(i<src.length){
  const rest=src.slice(i);let m;
  if((m=rest.match(/^[ \t　]+/))){tokens.push({t:'space'});i+=m[0].length;continue}
  if((m=rest.match(/^(:\|\|:|\|\||\|:|:\||\|)/))){tokens.push({t:'bar',text:m[0]});i+=m[0].length;continue}
  if(rest[0]==='-'){tokens.push({t:'dash'});i++;continue}
  if(rest[0]==='('){tokens.push({t:'open'});slur++;i++;continue}
  if(rest[0]===')'){if(!slur)fail('连线的右括号「)」没有对应的左括号。');tokens.push({t:'close'});slur--;i++;continue}
  if((m=rest.match(/^(\d{1,2})\{/))){const n=Number(m[1]);if(n<2)fail('连音符的数字至少为 2，如 3{1/2/3/}。');tokens.push({t:'tupOpen',n});tup.push(n);i+=m[0].length;continue}
  if(rest[0]==='}'){if(!tup.length)fail('「}」没有对应的连音符开头，如 3{。');tokens.push({t:'tupClose'});tup.pop();i++;continue}
  if((m=rest.match(/^\[(\d)\.?/))){tokens.push({t:'volta',text:m[1]+'.'});i+=m[0].length;continue}
  // Chord: several notes sounding together, <1 3 5>; rhythm and ornaments after '>' apply to the whole chord.
  if(rest[0]==='<'){
   const end=rest.indexOf('>');if(end<0)fail('和弦「<」没有对应的「>」，写法如 <1 3 5>。');
   const inner=rest.slice(1,end).trim().split(/\s+/).filter(Boolean),chordNotes=[];
   for(const part of inner){const nm=/^([#b♯♭♮]?)([1-7]|[A-Ga-g][#♯♭b]?[1-8]?)([',̣̇̈]*)$/.exec(part);if(!nm)fail(`和弦里的「${part}」写法不对，只写音、升降号和八度，如 <1 3 5'>。`);
    let octave=0;for(const ch of nm[3])octave+=ch==="'"||ch==='̇'?1:ch==='̈'?2:-1;
    let degree=Number(nm[2]),acc=ACC[nm[1]]||0;
    if(/^[A-Ga-g]/.test(nm[2])){const lm=/^([A-Ga-g])([#♯♭b]?)(\d?)$/.exec(nm[2]);const r=letterNote(lm[1],acc+(ACC[lm[2]]||0),lm[3],octave,key);degree=r.degree;acc=r.acc;octave=r.octave}
    chordNotes.push({t:'note',degree,acc,natural:nm[1]==='♮',octave,under:0,dot:0,orns:[],line:lineNo,inChord:true})}
   if(chordNotes.length<2)fail('和弦至少要有两个音，如 <1 3>。');
   const suf=/^([\/_]*)(\.*)([\/_]*)((?:![a-z~]+)*)/.exec(rest.slice(end+1));
   const under=suf[1].length+suf[3].length,dot=suf[2].length,orns=suf[4]?suf[4].split('!').filter(Boolean):[];
   for(const o of orns)if(!(o in ORNAMENTS))fail(`不认识的装饰记号 !${o}。`);
   const chord={t:'chord',notes:chordNotes,under,dot,orns,line:lineNo};for(const n of chordNotes){n.chord=chord;notes.push(n)}
   tokens.push(chord);i+=end+1+suf[0].length;continue;
  }
  if((m=rest.match(/^(\^?)([#b♯♭♮]?)([0-7Xx]|[A-Ga-g][#♯♭b]?[1-8]?)([',̣̇̈]*)([\/_]*)(\.*)([\/_]*)((?:![a-z~]+)*)/))){
   let [raw,grace,acc,n,marks,u1,dots,u2,orn]=m;
   const percussion=/^[Xx]$/.test(n);
   if(percussion&&(acc||marks||grace))fail('敲击音 X 没有固定音高，不应带升降号、高低音点或倚音标记。');
   if(n==='0'&&(acc||marks||grace))fail('休止符 0 不应带升降号、高低音点或倚音标记。');
   let octave=0;for(const ch of marks)octave+=ch==="'"||ch==='̇'?1:ch==='̈'?2:-1;
   if(Math.abs(octave)>4)fail('单个音的八度标记超过 4 个，请检查是否把节奏符号当成了高低音点。');
   const under=u1.length+u2.length,dot=dots.length;
   if(under>4)fail('减时线最多 4 条。');if(dot>2)fail('附点最多 2 个。');
   const orns=orn?orn.split('!').filter(Boolean):[];
   for(const o of orns)if(!(o in ORNAMENTS))fail(`不认识的装饰记号 !${o}。可用：!tr !~ !fermata !stacc !accent !breath。`);
   let degree=Number(n),accN=ACC[acc]||0,natural=acc==='♮';
   if(/^[A-Ga-g]/.test(n)){const lm=/^([A-Ga-g])([#♯♭b]?)(\d?)$/.exec(n);if(acc&&lm[2])fail(`「${raw}」的升降号写了两次。`);
    const r=letterNote(lm[1],(ACC[acc]||0)+(ACC[lm[2]]||0),lm[3],octave,key);degree=r.degree;accN=r.acc;octave=r.octave;natural=false;
    if(Math.abs(accN)>2)fail(`「${raw}」换算成 ${r.degree} 级时升降超过两个半音，请检查调号。`)}
   const token=n==='0'?{t:'rest',under,dot,orns}:percussion?{t:'percussion',under,dot,orns}:{t:'note',degree,acc:accN,natural,octave,under,dot,orns,grace:!!grace,line:lineNo};
   tokens.push(token);if(token.t==='note')notes.push(token);i+=raw.length;continue;
  }
  if((m=rest.match(/^[.\]:_\/]+/))){tokens.push({t:'text',text:m[0]});i+=m[0].length;continue}
  if(rest[0]==='?')fail('有看不清的音「?」，请对照原图补上。');
  fail(`有不能识别的字符「${rest[0]}」。请只写 0–7、音名、敲击音 X 和格式中的记号；歌词、和弦请删除，标题写成 @title。`);
 }
 if(slur)fail('有连线的左括号「(」没有在本行闭合。');
 if(tup.length)fail('有连音符「{」没有在本行闭合。');
 return tokens;
}

// Returns {lines:[{kind:'music',tokens}|{kind:'meta',name,value}|{kind:'page',value}|{kind:'blank'}], notes, meta}
function parse(text){
 const lines=[],notes=[],meta={},parts=[];
 const key={letter:0,pc0:0,octave:4};
 const setKey=d=>{if(d.kind!=='meta')return;if(d.name==='key'){const L=LETTERS.indexOf(d.value.slice(-1));key.letter=L;key.pc0=KEY_PC[LETTERS[L]]+(d.value[0]==='♯'?1:d.value[0]==='♭'?-1:0)}if(d.name==='octave')key.octave=d.value};
 const addPart=(id,name)=>{let p=parts.find(p=>p.id===id);if(!p){p={id,name:name||id};parts.push(p)}else if(name)p.name=name;return p};
 normalize(text).split('\n').forEach((raw,index)=>{
  const lineNo=index+1,fail=msg=>{throw new Error(`第 ${lineNo} 行：${msg}`)};
  const src=raw.replace(/%.*$/,'');
  if(!src.trim()){lines.push({kind:'blank'});return}
  let m;
  if((m=src.match(/^\s*@([A-Za-z]+)\s*(.*)$/))){const d=parseDirective(m[1],m[2],fail);lines.push(d);setKey(d);if(d.kind==='meta'&&d.name==='part')addPart(d.value.id,d.value.name);else if(d.kind==='meta'&&!(d.name in meta))meta[d.name]=d;return}
  // [声部] at the start of a line assigns it to a part of a full score.
  if((m=src.match(/^\s*\[([^\]\s\d.][^\]\s]{0,11}|\d{1,2})\]\s*(.*)$/))){addPart(m[1]);lines.push({kind:'music',part:m[1],tokens:parseMusic(m[2],lineNo,notes,fail,key,src.length-m[2].length)});return}
  if((m=src.match(/^\s*1\s*=\s*([#b♯♭]?[A-Ga-g][#b♯♭]?)\s*$/))){const d=parseDirective('key',m[1],fail);lines.push(d);setKey(d);if(!meta.key)meta.key=d;return}
  lines.push({kind:'music',tokens:parseMusic(src,lineNo,notes,fail,key)});
 });
 return {lines,notes,meta,parts};
}

function noteText(t){
 const tail='/'.repeat(t.under)+'.'.repeat(t.dot)+(t.orns||[]).map(o=>'!'+o).join('');
 if(t.t==='rest')return '0'+tail;
 if(t.t==='percussion')return 'X'+tail;
 const label=t.label??((t.natural?'♮':t.acc>0?'#':t.acc<0?'b':'')+t.degree);
 return (t.grace?'^':'')+label.replace('♯','#').replace('♭','b')+(t.octave>0?"'".repeat(t.octave):','.repeat(-t.octave))+tail;
}
function serialize(lines){
 return lines.map(line=>{
  if(line.kind==='blank')return '';
  if(line.kind==='page')return '@page'+(line.value?' '+line.value:'');
  if(line.kind==='meta'&&line.name==='part')return `@part ${line.value.id}${line.value.name&&line.value.name!==line.value.id?' · '+line.value.name:''}`;
  if(line.kind==='meta'&&line.name==='origKey')return `% 原谱 1=${String(line.value).replace('♯','#').replace('♭','b')}`;
  if(line.kind==='meta'&&line.name==='tempo')return `@tempo ${line.text?line.text+(line.exact?' '+line.value:''):line.value}`;
  if(line.kind==='meta')return line.name==='key'?`@key 1=${String(line.value).replace('♯','#').replace('♭','b')}`:`@${line.name} ${line.value}`;
  return (line.part?`[${line.part}] `:'')+line.tokens.map(t=>{
   if(t.t==='space')return ' ';if(t.t==='bar')return t.text;if(t.t==='dash')return '-';if(t.t==='open')return '(';if(t.t==='close')return ')';
   if(t.t==='tupOpen')return t.n+'{';if(t.t==='tupClose')return '}';if(t.t==='volta')return '['+t.text;if(t.t==='text')return t.text;
   if(t.t==='chord')return '<'+t.notes.map(n=>noteText({...n,under:0,dot:0,orns:[]})).join(' ')+'>'+'/'.repeat(t.under)+'.'.repeat(t.dot)+(t.orns||[]).map(o=>'!'+o).join('');
   return noteText(t);
  }).join('');
 }).join('\n').replace(/\n{3,}/g,'\n\n');
}

// A system contains at most one line per part. Repeated part IDs begin the next system even
// when copied text has no blank separator. Explicit blank/meta/page lines also end a system.
function groupSystems(lines){
 const blocks=[];let current=null,seen=new Set();
 for(const line of lines){
  if(line.kind==='music'&&line.part){
   if(!current||seen.has(line.part)){current={kind:'system',lines:[]};blocks.push(current);seen=new Set()}
   current.lines.push(line);seen.add(line.part);
  }else{current=null;seen=new Set();blocks.push({kind:'line',lines:[line]})}
 }
 return blocks;
}
// Retain system boundaries even when filtering removes the first or last instrument in a group.
function filterParts(lines,ids){
 const selected=new Set(ids),out=[];
 for(const block of groupSystems(lines)){
  const kept=block.lines.filter(l=>l.kind!=='music'||!l.part||selected.has(l.part));
  if(block.kind==='system'&&kept.length&&out.at(-1)?.kind==='music'&&out.at(-1).part)out.push({kind:'blank'});
  out.push(...kept);
 }
 return out;
}
// Only explicit staff/voice names imply a shared staff. Similar instrument names alone do not.
function staffIdentity(name){
 const m=/^(.+?)(上|下)谱表\s*声部\s*([一二三四1234])$/.exec(name||'');
 return m?{instrument:m[1],staff:m[2],voice:'一二三四'.includes(m[3])?'一二三四'.indexOf(m[3])+1:Number(m[3]),name:m[1]+m[2]+'谱表'}:null;
}
function measureTimeline(tokens){
 const measures=[];let current={events:[],duration:0,bar:null},ratios=[];
 for(const t of tokens){
  if(t.t==='tupOpen'){ratios.push(2**Math.floor(Math.log2(t.n-1))/t.n);continue}
  if(t.t==='tupClose'){ratios.pop();continue}
  if(t.t==='bar'){if(current.events.length){current.bar=t;measures.push(current);current={events:[],duration:0,bar:null}}continue}
  if(!['note','chord','rest','percussion','dash'].includes(t.t))continue;
  if(t.grace)continue;
  const duration=(t.t==='dash'?1:2**-(t.under||0)*(2-2**-(t.dot||0)))*ratios.reduce((a,b)=>a*b,1);
  current.events.push({token:t,start:current.duration,duration});current.duration+=duration;
 }
 if(current.events.length)measures.push(current);return measures;
}
// Written measures count once, independently in each voice. Pages, tempo changes and repeats do not reset them.
function numberMeasures(lines){
 const numbers=new Map(),next=new Map();
 for(const line of lines){if(line.kind!=='music')continue;const part=line.part||'';let n=next.get(part)||1;
  for(const measure of measureTimeline(line.tokens)){for(const e of measure.events)numbers.set(e.token,n);n++}
  next.set(part,n);
 }
 return numbers;
}
function prepareMeasureLabels(host,lines,opts){
 host._measureLabels=[];
 const every=Math.floor(Number(opts.measureEvery)||0);if(every<1)return;
 const numbers=opts.measureNumbers||numberMeasures(lines),rows=[...host.querySelectorAll(':scope>.jp-line'),...[...host.querySelectorAll('.jp-system')].map(s=>s.querySelector('.jp-line')).filter(Boolean)];
 for(const row of rows){const measures=measureTimeline(row._musicLine.tokens),containers=[...row.querySelectorAll(':scope>.jp-measure')];
  measures.forEach((m,i)=>{const n=numbers.get(m.events[0]?.token);if(!n||(n-1)%every)return;
   host._measureLabels.push({number:n,row,anchor:containers[i]||m.events[0].token._cell});row.classList.add('jp-numbered-line');
  });
 }
}
function drawMeasureLabels(host){
 for(const e of host.querySelectorAll('.jp-measure-numbers'))e.remove();if(!host._measureLabels?.length)return;
 const overlays=new Map();
 for(const {number,row,anchor} of host._measureLabels){const a=anchor.getBoundingClientRect(),r=row.getBoundingClientRect(),label=el('span','jp-measure-number',String(number));
  let overlay=overlays.get(row);if(!overlay){overlay=el('div','jp-measure-numbers');overlay.setAttribute('aria-label','小节号');overlays.set(row,overlay);row.append(overlay)}
  label.style.left=(a.left-r.left)+'px';label.style.top='0px';label.title='第 '+number+' 小节';overlay.append(label);
 }
}
function silentMeasure(m){return m.events.length>0&&m.events.every(e=>['rest','dash'].includes(e.token.t)&&!e.token.orns?.length)}
function mainHeight(tokens){return Math.max(1.1,...tokens.filter(t=>t.t==='chord').map(t=>t.notes.reduce((h,n)=>h+1.1+(n.octave?Math.abs(n.octave)*.18+.04:0),0)))}
// Reuse the original cells/tokens, so editor navigation, playback cursors and per-voice sound stay intact.
function compactStaves(host,partNames){
 for(const sys of host.querySelectorAll('.jp-system')){
  const rows=[...sys.querySelectorAll(':scope>.jp-line')],groups=new Map();
  for(const row of rows){const id=staffIdentity(partNames.get(row._musicLine.part));if(!id)continue;row._staff=id;
   const key=id.name;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
  let compact=false;
  for(const members of groups.values()){
   if(members.length<2||members.some(r=>r.classList.contains('jp-erhu-line')))continue;
   // Nonmatching bars are intentionally left separate; never conceal a transcription timing error.
   const timelines=members.map(r=>measureTimeline(r._musicLine.tokens)),base=timelines[0];
   if(timelines.some(ms=>ms.length!==base.length||ms.some((m,i)=>Math.abs(m.duration-base[i].duration)>1e-7||m.bar?.text!==base[i].bar?.text)))continue;
   if(members.some(r=>r.querySelectorAll(':scope>.jp-measure').length!==base.length))continue;
   const ordered=members.slice().sort((a,b)=>a._staff.voice-b._staff.voice),first=members[0];
   const measures=ordered.map(r=>[...r.querySelectorAll(':scope>.jp-measure')]);
   const times=ordered.map(r=>measureTimeline(r._musicLine.tokens));
   const label=first.querySelector('.jp-part-label');label.textContent=first._staff.name;label.title=ordered.map(r=>partNames.get(r._musicLine.part)).join(' / ');
   first.classList.add('jp-staff-row');first._staffVoices=ordered.map(r=>r._musicLine.part);
   const containers=[];
   for(let k=0;k<base.length;k++){
    const active=times.map((ms,v)=>!silentMeasure(ms[k])?v:-1).filter(v=>v>=0),visible=active.length?active:[0];
    const measure=el('span','jp-measure jp-staff-measure');measure._lanes=[];
    for(const v of visible){
     const lane=measures[v][k];lane.classList.remove('jp-measure');lane.classList.add('jp-voice-lane');lane.style.cssText=ordered[v].style.cssText;
     lane._timeline=times[v][k];lane.style.setProperty('--jp-main',mainHeight(times[v][k].events.map(e=>e.token))+'em');lane.setAttribute('aria-label',partNames.get(ordered[v]._musicLine.part));
     for(const b of lane.querySelectorAll(':scope>.jp-bar-cell'))b.remove();
     measure.append(lane);measure._lanes.push(lane);
    }
    if(visible.length>1)measure.classList.add('jp-polyphonic');
    // One shared bar line spans the two voices; repeats keep their original symbol.
    if(base[k].bar){const bar=noteCell(base[k].bar);bar.classList.add('jp-staff-bar');measure.append(bar)}
    containers.push(measure);
   }
   const leading=[...first.children].filter(e=>e.classList.contains('jp-bar-cell'));
   first.replaceChildren(label,...leading,...containers);for(const row of members)if(row!==first)row.remove();compact=true;
  }
  if(!compact)continue;
  sys.classList.add('jp-compact-staves');
  // A shared beat grid applies to all visible instruments in this system, not just to the keyboard voices.
  const visibleRows=[...sys.querySelectorAll(':scope>.jp-line')];
  const allMeasures=visibleRows.map(row=>{const ms=[...row.querySelectorAll(':scope>.jp-measure')],time=measureTimeline(row._musicLine.tokens);
   ms.forEach((m,k)=>{if(!m._lanes){
    const lane=el('span','jp-voice-lane'),bars=[...m.querySelectorAll(':scope>.jp-bar-cell')];
    for(const child of [...m.children])if(!bars.includes(child))lane.append(child);
    lane._timeline=time[k];m.classList.add('jp-staff-measure');m.replaceChildren(lane,...bars);for(const b of bars)b.classList.add('jp-staff-bar');m._lanes=[lane];
   }});return ms});
  const count=Math.max(...allMeasures.map(ms=>ms.length));
  for(let k=0;k<count;k++){
   const ms=allMeasures.map(ms=>ms[k]).filter(Boolean),lanes=ms.flatMap(m=>m._lanes),starts=[0];
   for(const lane of lanes)for(const e of lane._timeline?.events||[])starts.push(e.start,e.start+e.duration);
   const ticks=[...new Set(starts.map(t=>Math.round(t*1e7)/1e7))].sort((a,b)=>a-b);if(ticks.length<2)continue;
   for(const lane of lanes)layoutBeatGrid(lane,ticks);
   for(const m of ms)m.style.minWidth=(ticks.length-1)*.92+.8+'em';
  }
 }
}
function layoutBeatGrid(lane,ticks){
 const timeline=lane._timeline;if(!timeline)return;
 const events=new Map(timeline.events.map(e=>[e.token,e])),col=t=>ticks.findIndex(x=>Math.abs(x-t)<1e-6)+1;
 lane.classList.add('jp-beat-grid');lane.style.gridTemplateColumns=`repeat(${ticks.length-1}, minmax(0, 1fr))`;
 function place(item,parentStart=1){
  const cells=item._token?[item]:[...item.querySelectorAll('.jp-n')],list=cells.map(c=>events.get(c._token)).filter(Boolean);
  if(!list.length)return;
  const start=Math.min(...list.map(e=>col(e.start))),end=Math.max(...list.map(e=>col(e.start+e.duration)));
  item.style.gridColumn=`${start-parentStart+1} / ${end-parentStart+1}`;item.style.gridRow='1';
  if(item.classList.contains('jp-beam')){item.classList.add('jp-beat-beam');item.style.gridTemplateColumns=`repeat(${end-start}, minmax(0, 1fr))`;for(const child of item.children)place(child,start)}
 }
 for(const item of lane.children){if(item.classList.contains('jp-bar-cell')){item.style.gridColumn=String(ticks.length);item.style.gridRow='1'}else place(item)}
}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function noteCell(t){
 const cell=el('span','jp-n');
 const up=el('span','jp-up'),main=el('span','jp-main'),lines=el('span','jp-lines'),down=el('span','jp-down');
 if(t.t==='note'){
  const label=t.label??((t.natural?'♮':t.acc>0?'♯':t.acc<0?'♭':'')+t.degree);
  const acc=label.length>1?label.slice(0,-1):'';if(acc)main.append(el('span','jp-acc',acc));
  main.append(el('span','jp-digit',label.slice(-1)));
  for(let k=0;k<t.octave;k++)up.append(el('i'));for(let k=0;k<-t.octave;k++)down.append(el('i'));
  if(t.grace)cell.classList.add('jp-grace');
 }else if(t.t==='chord'){
  cell.style.setProperty('--jp-own-main',mainHeight([t])+'em');
  // Stacked digits, highest pitch on top; each carries its own accidental and octave dots.
  const stack=el('span','jp-chord');
  const ordered=[...t.notes].sort((a,b)=>((b.midi??(b.octave*12+b.degree))-(a.midi??(a.octave*12+a.degree))));
  for(const n of ordered){const lab=n.label??((n.natural?'♮':n.acc>0?'♯':n.acc<0?'♭':'')+n.degree),one=el('span','jp-cnote');
   if(lab.length>1)one.append(el('span','jp-acc',lab.slice(0,-1)));const d=el('span','jp-digit',lab.slice(-1));
   if(n.octave){one.style[n.octave>0?'paddingTop':'paddingBottom']=(Math.abs(n.octave)*.18+.04)+'em';const dots=el('span','jp-cdots '+(n.octave>0?'up':'down'));for(let k=0;k<Math.abs(n.octave);k++)dots.append(el('i'));d.append(dots)}
   one.append(d);stack.append(one);n._cell=cell}
  main.append(stack);
 }else if(t.t==='percussion'){main.append(el('span','jp-digit','X'));cell.classList.add('jp-percussion');cell.title='敲击音（无固定音高）'}
 else if(t.t==='rest')main.append(el('span','jp-digit','0'));
 else if(t.t==='dash')main.append(el('span','jp-digit jp-dash','−'));
 else if(t.t==='bar'){cell.classList.add('jp-bar-cell');const bar=el('span','jp-bar'+(t.text.includes('||')?' jp-bar-double':''));main.append(bar);
  if(t.text.startsWith(':'))main.prepend(el('span','jp-repeat',':'));if(t.text.endsWith(':'))main.append(el('span','jp-repeat',':'))}
 else if(t.t==='volta')main.append(el('span','jp-volta',t.text));
 else main.append(el('span','jp-digit jp-text',t.text));
 if(t.dot)main.append(el('span','jp-aug','·'.repeat(t.dot)));
 for(const o of t.orns||[]){if(o==='breath')main.append(el('span','jp-breath','V'));else cell.append(el('span','jp-orn',ORNAMENTS[o]))}
 for(let k=0;k<(t.under||0);k++)lines.append(el('i'));
 cell.prepend(up,main,lines,down);t._cell=cell;cell._token=t;return cell;
}

// Draws parsed lines as numbered notation: octave dots, beamed underlines, augmentation dots, slurs,
// tuplet numbers, grace notes, ornaments, meta rows (title / key / time / tempo) and page separators.
function render(host,lines,opts={}){
 host.replaceChildren();host.classList.add('jp-score');host.classList.toggle('jp-annotated',!!opts.annotations);host._fit=opts.fit!==false;host._minFont=opts.minFont||11;
 const arcs=[],tuplets=[];
 let first=0,last=lines.length-1;while(first<=last&&lines[first].kind==='blank')first++;while(last>=first&&lines[last].kind==='blank')last--;
 let metaRow=null,system=null;const partNames=new Map();for(const l of lines)if(l.kind==='meta'&&l.name==='part')partNames.set(l.value.id,l.value.name||l.value.id);
 for(const p of opts.partNames||[])partNames.set(p.id,p.name||p.id);
 const systemStarts=new Set(groupSystems(lines).filter(b=>b.kind==='system').map(b=>b.lines[0]));
 host.classList.toggle('jp-full-score',new Set(lines.filter(l=>l.kind==='music'&&l.part).map(l=>l.part)).size>1);
 for(const line of lines.slice(first,last+1)){
  if(line.kind!=='meta')metaRow=null;
  if(!(line.kind==='music'&&line.part))system=null;
  const add=row=>{row._src=[line];host.append(row);return row};
  if(line.kind==='blank'){add(el('div','jp-gap'));continue}
  if(line.kind==='page'){add(el('div','jp-page',line.value?`第 ${line.value} 页`:'换页'));continue}
  if(line.kind==='meta'){
   if(line.name==='part')continue;
   if(line.name==='title'){add(el('div','jp-title',line.value));continue}
   if(!metaRow){metaRow=add(el('div','jp-meta'))}else metaRow._src.push(line)
   const text=line.name==='key'?`1=${line.value}`:line.name==='origKey'?`原谱 1=${line.value}`:line.name==='note'?String(line.value):line.name==='time'?line.value:line.name==='tempo'?(line.value==null?line.text:`${line.text?line.text+' ':''}♩${line.exact||!line.text?'=':'≈'}${line.value}`):line.name==='octave'?`中音 1 在第 ${line.value} 组`:String(line.value);
   metaRow.append(el('span','jp-meta-item',text));continue;
  }
  const row=el('div','jp-line');
  row._musicLine=line;
  const pitched=line.tokens.flatMap(t=>t.t==='chord'?t.notes:[t]);
  const upper=Math.max(0,...pitched.map(t=>t.octave||0)),lower=Math.max(0,...pitched.map(t=>-(t.octave||0))),under=Math.max(0,...line.tokens.map(t=>t.under||0));
  row.style.setProperty('--jp-up',Math.max(.44,upper*.22+.06)+'em');row.style.setProperty('--jp-down',Math.max(.28,lower*.22+.04)+'em');row.style.setProperty('--jp-under',under?`max(.26em, calc(${under} * max(.07em, 1.5px) + ${Math.max(0,under-1)*.1+.06}em))`:'.26em');
  const chordHeight=mainHeight(line.tokens);
  row.style.setProperty('--jp-main',chordHeight+'em');
  row.classList.toggle('jp-decorated',line.tokens.some(t=>t.t==='open'||t.t==='tupOpen'||t.orns?.some(o=>o!=='breath')));
  row.classList.toggle('jp-erhu-line',line.tokens.some(t=>t.t==='note'&&opts.annotations?.has(t)));
  const hasSlur=line.tokens.some(t=>t.t==='open'||t.t==='close'),hasTuplet=line.tokens.some(t=>t.t==='tupOpen'||t.t==='tupClose');
  row.style.setProperty('--jp-curve',(hasSlur&&hasTuplet?1.35:hasTuplet?.9:hasSlur?.75:0)+'em');
  row.style.setProperty('--jp-anno',line.tokens.some(t=>opts.annotations?.has(t)&&t.orns?.some(o=>o!=='breath'))?'1.55em':'1.15em');
  let beam=null,prevUnder=false,glued=false,open=0,tupOpen=[],lastNote=null,graces=[];const starts=[],tupStarts=[];
  for(const t of line.tokens){
   if(t.t==='space'){glued=false;prevUnder=false;beam=null;continue}
   if(t.t==='open'){open++;continue}
   if(t.t==='close'){const s=starts.pop();if(s&&lastNote&&s!==lastNote)arcs.push([s,lastNote]);continue}
   if(t.t==='tupOpen'){tupOpen.push(t.n);continue}
   if(t.t==='tupClose'){const s=tupStarts.pop();if(s&&lastNote)tuplets.push([s.cell,lastNote,s.n]);continue}
   const cell=noteCell(t),isNote=t.t==='note'||t.t==='rest'||t.t==='chord'||t.t==='percussion',under=isNote&&!t.grace&&t.under>0;
   if(opts.annotations&&t.t==='note'){const lab=opts.label?.(opts.annotations.get(t));if(lab){const orns=[...cell.querySelectorAll(':scope>.jp-orn')];if(orns.length){const row=document.createElement('span');row.className='anno-orn';for(const o of orns){o.remove();row.append(o.textContent)}lab.prepend(row)}cell.append(lab)}}
   if(t.grace){graces.push(cell);continue}
   // Keep the small notes beside their following main note, including inside a shared beam.
   // Appending grace cells directly to the row used to put them AFTER an already-open beam's next note.
   let item=cell;
   if(graces.length){item=el('span','jp-grace-group');const small=el('span','jp-graces');small.append(...graces);item.append(small,cell);graces=[]}
   if(under&&prevUnder&&glued&&beam)beam.append(item);
   else if(under){beam=el('span','jp-beam');beam.append(item);row.append(beam)}
   else{beam=null;row.append(item)}
   prevUnder=under;glued=true;
   if(isNote){while(open>0){starts.push(cell);open--}while(tupOpen.length){tupStarts.push({cell,n:tupOpen.shift()})}lastNote=cell}
  }
  if(graces.length){const small=el('span','jp-graces');small.append(...graces);row.append(small)}
  if(!row.childNodes.length)row.append(el('span','jp-empty'));
  if(line.part){
   // Full score: wrap each bar's content (ending with its bar line) so bars can be aligned across parts.
   const kids=[...row.childNodes],label=el('span','jp-part-label',partNames.get(line.part)||line.part);label.title=line.part;row.replaceChildren(label);row.classList.add('jp-part-line');
   let measure=null;kids.forEach((k,idx)=>{const isBar=k.classList?.contains('jp-bar-cell');
    if(isBar&&idx===0){row.append(k);return}
    if(!measure){measure=el('span','jp-measure');row.append(measure)}measure.append(k);if(isBar)measure=null});
   if(!system||systemStarts.has(line)){system=el('div','jp-system');system._src=[];system.setAttribute('role','group');system.setAttribute('aria-label','总谱谱组');host.append(system)}
   system.append(row);system._src.push(line);continue;
  }
  add(row);
 }
 compactStaves(host,partNames);
 prepareMeasureLabels(host,lines,opts);
 host._arcs=arcs;host._tuplets=tuplets;fitWidth(host);justify(host);drawOverlay(host);
 if(!host._observer&&'ResizeObserver' in window){let lastWidth=0;host._observer=new ResizeObserver(()=>{if(host.clientWidth!==lastWidth){lastWidth=host.clientWidth;fitWidth(host);justify(host)}drawOverlay(host)});host._observer.observe(host)}
}

// Engraved look: every music line is stretched edge to edge except a very short final line (under 25% of the width),
// so lines full of rests line up with the others.
// endsPiece=false when the host shows only part of the score (a viewer page that is not the last).
function justify(host,endsPiece=host._endsPiece!==false){
 alignSystems(host);
 const rows=[...host.querySelectorAll(':scope>.jp-line')];if(!rows.length)return;
 for(const r of rows)r.classList.remove('jp-justify');
 const cs=getComputedStyle(host),avail=host.clientWidth-parseFloat(cs.paddingLeft||0)-parseFloat(cs.paddingRight||0);
 if(avail<=0)return;
 rows.forEach((r,i)=>{const kids=[...r.children].filter(c=>!c.classList.contains('jp-measure-numbers'));if(kids.length<3)return;
  const natural=kids[kids.length-1].getBoundingClientRect().right-kids[0].getBoundingClientRect().left;
  if(natural>avail+1)return;
  if(endsPiece&&i===rows.length-1&&natural<avail*0.25)return; // only a very short ending (about one bar) stays left
  r.classList.add('jp-justify')});
}
// Natural width of a full-score line (label + measures at their content width).
function naturalWidth(row){let w=0;for(const c of row.children){if(c.classList.contains('jp-measure-numbers'))continue;const prev=c.style.flex;c.style.flex='0 0 auto';w+=c.getBoundingClientRect().width;c.style.flex=prev}return w+8}
// Full score: bar k gets the same width in every part of a system (the widest content decides), so bar lines align.
function alignSystems(host){
 for(const sys of host.querySelectorAll('.jp-system')){
  const rows=[...sys.querySelectorAll(':scope>.jp-line')],measures=rows.map(r=>[...r.querySelectorAll(':scope>.jp-measure')]);
  for(const ms of measures)for(const m of ms)m.style.flex='0 0 auto';
  const count=Math.max(0,...measures.map(ms=>ms.length));
  for(let k=0;k<count;k++){const w=Math.max(...measures.map(ms=>ms[k]?ms[k].getBoundingClientRect().width:0));for(const ms of measures)if(ms[k])ms[k].style.flex=`1 1 ${w}px`}
 }
}
// One text line = one displayed line: shrink the font until the widest line fits (down to minFont; then it scrolls).
function fitWidth(host){
 if(!host._fit)return;
 host.style.fontSize='';const base=parseFloat(getComputedStyle(host).fontSize)||24;
 const style=getComputedStyle(host),avail=host.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
 let widest=0;for(const row of host.querySelectorAll('.jp-line'))widest=Math.max(widest,row.classList.contains('jp-part-line')?naturalWidth(row):row.scrollWidth);
 if(widest>avail&&avail>0)host.style.fontSize=Math.max(host._minFont,Math.floor(base*avail/widest*10)/10)+'px';
}

function drawOverlay(host){
 drawMeasureLabels(host);
 host.querySelector(':scope>svg.jp-slurs')?.remove();
 const arcs=host._arcs||[],tuplets=host._tuplets||[];if(!arcs.length&&!tuplets.length)return;
 const ns='http://www.w3.org/2000/svg',box=host.getBoundingClientRect();
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('class','jp-slurs');svg.setAttribute('aria-hidden','true');
 svg.setAttribute('width',host.scrollWidth);svg.setAttribute('height',host.scrollHeight);
 const em=parseFloat(getComputedStyle(host).fontSize)||20;
 const X=r=>r.left+r.width/2-box.left+host.scrollLeft,Y=v=>v-box.top+host.scrollTop;
 const top=cell=>{const heads=[...cell.querySelectorAll('.jp-orn'),...cell.querySelectorAll('.jp-up i'),...cell.querySelectorAll('.jp-digit')];return Y(Math.min(...(heads.length?heads:[cell]).map(e=>e.getBoundingClientRect().top)))-0.12*em};
 // Account for the highest note in the entire span, not only its endpoints. Erhu rows reserve
 // a separate lane below their annotations for these curves, so finger labels stay above them.
 const spanTop=(a,b)=>{
  if(!sameRow(a,b))return Math.min(top(a),top(b));
  const lane=a.closest?.('.jp-voice-lane')||a.closest?.('.jp-line')||host,left=Math.min(X(a.getBoundingClientRect()),X(b.getBoundingClientRect())),right=Math.max(X(a.getBoundingClientRect()),X(b.getBoundingClientRect()));
  const cells=[...lane.querySelectorAll('.jp-n')].filter(c=>sameRow(a,c)&&X(c.getBoundingClientRect())>=left&&X(c.getBoundingClientRect())<=right);
  return Math.min(top(a),top(b),...cells.map(top));
 };
 const sameRow=(a,b)=>Math.abs(a.getBoundingClientRect().top-b.getBoundingClientRect().top)<4;
 const arc=(x1,x2,y)=>{const p=document.createElementNS(ns,'path'),h=Math.min(0.45*em,0.12*Math.abs(x2-x1)+0.2*em);p.setAttribute('d',`M${x1} ${y} Q${(x1+x2)/2} ${y-h*2} ${x2} ${y}`);svg.append(p)};
 for(const [a,b] of arcs){
  const xa=X(a.querySelector('.jp-main').getBoundingClientRect()),xb=X(b.querySelector('.jp-main').getBoundingClientRect());
  let ta=top(a),tb=top(b);
  if(sameRow(a,b)){const y=spanTop(a,b);arc(xa,xb,y)}else{arc(xa,host.clientWidth-4,ta);arc(4,xb,tb)}
 }
 for(const [a,b,n] of tuplets){
  const xa=X(a.getBoundingClientRect()),xb=X(b.getBoundingClientRect()),y=spanTop(a,b)-(arcs.some(p=>p[0]===a||p[1]===b)?0.55*em:0.05*em);
  const t=document.createElementNS(ns,'text');t.setAttribute('x',sameRow(a,b)?(xa+xb)/2:xa);t.setAttribute('y',y);t.setAttribute('text-anchor','middle');t.setAttribute('class','jp-tuplet');t.textContent=n;svg.append(t);
 }
 host.prepend(svg);
}

window.Jianpu={parse,serialize,render,normalize,parseKey,ORNAMENTS,redraw:drawOverlay,fitWidth,justify,alignSystems,groupSystems,filterParts,staffIdentity,measureTimeline,numberMeasures};
})();
// Modified by AI on 2026-10-08 23:44:57
