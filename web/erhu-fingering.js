'use strict';
// Experimental erhu fingering, position shifts and bowing for numbered notation.
// Fingering is a Viterbi search over (string, hand position, finger) per note. The hand position `a` is the
// semitone distance from the open string to the index finger; finger k (1–4) reaches (k-1)…2(k-1) semitones above
// the index finger (adjacent fingers a half or whole step apart; the 4th may stretch one step further). Costs favour:
// first position, few shifts (cheaper on open strings or rests, dearer inside slurs and on short notes), index finger on a scale note, fingers matching
// scale steps, no sliding one finger between different pitches, few string crossings. Trills require the upper
// diatonic neighbour on the same string and in the same hand frame, played with a higher finger.
(() => {
const FINGERS=['〇','一','二','三','四'];
const MAJOR=[0,2,4,5,7,9,11];
const inScale=(pc,key)=>MAJOR.includes(((pc-key)%12+12)%12);
function scaleSteps(from,to,key){let n=0;for(let p=from+1;p<=to;p++)if(inScale(p,key))n++;return n}

function candidates(m,tuning,key){
 const out=[];
 const firstOK=tuning.some(open=>{const d=m-open;return d>=0&&d<=8});
 tuning.forEach((open,s)=>{
  const d=m-open;if(d<0||d>28)return;
  if(d===0){for(let a=1;a<=16;a++)out.push({s,a,f:0});return}
  for(let a=1;a<=Math.min(d,16);a++){const o=d-a;for(let f=1;f<=4;f++){
   if(o>=f-1&&o<=2*(f-1))out.push({s,a,f,o});
   // 4th finger stretched one step beyond its place (instead of shifting for a single high note).
   else if(f===4&&o===7)out.push({s,a,f,o,ext:true});
  }}
 });
 // Each string's first-position anchor: the first scale note above the open string (index finger there).
 const nat=tuning.map(open=>{for(let a=1;a<=3;a++)if(inScale(open+a,key))return a;return 2});
 for(const c of out){
  c.nat=nat[c.s];
  // Positions: first position (index finger one or two semitones above the open string) is home. A note that
  // first position can reach costs clearly more when played higher, so the hand stays put with fingers on their
  // scale degrees (1=G on D–A strings: outer 3 = 1st, 4 = 2nd, 5 = 3rd, 6 = 4th finger) and only moves up for notes
  // outside it.
  const rel=c.a-c.nat;c.high=rel>0&&firstOK;
  let cost=rel<=0?0:(firstOK?0.6:0)+0.1*rel;
  if(c.f===4)cost+=0.8;
  if(c.ext)cost+=6;
  if(c.f===0)cost+=c.a>6?0.4:0;
  else{
   const open=tuning[c.s];
   if(!inScale(open+c.a,key))cost+=1.2;
   const steps=scaleSteps(open+c.a,open+c.a+c.o,key);
   if(c.f>1&&steps!==c.f-1&&!(c.ext&&steps===c.f))cost+=1.6;
  }
  c.cost=cost;
 }
 return out;
}
// The upper scale degree (not simply the next chromatic pitch). A flattened 7 still trills to 1,
// not to natural 7. The score currently has no syntax for an altered trill auxiliary.
function trillUpper(t,key){
 const degree=Number(t.degree);
 if(!(degree>=1&&degree<=7))return null;
 const pc=((key+MAJOR[degree-1])%12+12)%12;
 const alteration=((t.midi-pc+6)%12+12)%12-6;
 const step=degree===7?12-MAJOR[6]:MAJOR[degree]-MAJOR[degree-1];
 const upper=t.midi-alteration+step;
 return upper>t.midi?upper:null;
}
function trillCandidates(t,tuning,key){
 const upper=trillUpper(t,key);if(upper==null)return [];
 const auxiliaries=candidates(upper,tuning,key).filter(c=>!c.ext);
 return candidates(t.midi,tuning,key).filter(c=>c.f<4&&!c.ext).flatMap(c=>{
  const choices=auxiliaries.filter(u=>u.s===c.s&&u.a===c.a&&u.f>c.f);
  choices.sort((a,b)=>(a.cost+(a.f-c.f-1)*0.4)-(b.cost+(b.f-c.f-1)*0.4));
  if(!choices.length)return [];
  const u=choices[0];
  // Both pitches must fit; prefer neighbouring fingers and a relaxed auxiliary, not a stretch.
  // When paths are otherwise close, favour an index/middle-led trill over repeated ring/little motion.
  return [{...c,cost:c.cost+(c.f===3?1.5:0)+0.25*u.cost+0.4*(u.f-c.f-1),trill:{midi:upper,finger:u.f,string:u.s,anchor:u.a}}];
 });
}
function transition(p,c,info){
 let cost=0;const da=Math.abs(p.a-c.a);
 // Crossing strings in the same position keeps the hand frame even when the index notes differ by a semitone (index on
 // E of the inner string and on B♭ of the outer string in 1=F): positions are compared per string. Anything else
 // that moves the index finger is a shift.
 if(p.s!==c.s&&p.a-p.nat===c.a-c.nat){}
 else if(da>0){
  let shift=(da===1?1.8:2.5)+0.25*da;
  if(c.f===0||p.f===0)shift=0.9+0.1*da;
  // Guide-finger shift (同指换把: the same finger slides to the new note) is the natural one, best with the index,
  // then the middle finger; changing finger during the shift is harder. Long guide-finger jumps
  // get less discount, so a large index slide cannot outweigh a closer landing that fits the phrase.
  else if(c.f===p.f&&c.s===p.s&&c.f<4&&da>=2)shift=Math.max(1.2,shift*(da>3?0.9:[0,0.4,0.4,0.8][c.f]));
  else shift+=0.6;
  // A half-step slide of the same finger (moving the hand by a semitone) is a glissando, not a clean shift.
  if(c.f===p.f&&c.s===p.s&&da===1)shift+=1;
  // The finger that lands after a shift: index is usual, middle next, ring less, little finger only if unavoidable.
  shift+=[0,0,0.25,0.7,1.8][c.f];
  if(info.afterRest)shift*=0.4;
  if(info.inSlur)shift+=0.6;
  // A clean index/middle guide-finger shift is still possible within a quick run.
  if(info.short)shift+=(c.s===p.s&&c.f===p.f&&c.f<=2&&da>=2)?0.35:0.8;
  cost+=shift;
 }
 if(p.s!==c.s)cost+=info.short?0.5:0.3;
 // Sliding one finger between different pitches without moving the hand.
 if(p.s===c.s&&p.f===c.f&&p.f>0&&da===0&&p.o!==c.o)cost+=3.2;
 // Rearticulating the same pitch should normally reuse the established finger and string.
 // Keep the hand frame through an open-string neighbour that returns immediately to that pitch.
 // These are preferences, not locks: a required trill or an otherwise unreachable phrase can override them.
 const sameFrame=p.s===c.s?p.a===c.a:p.a-p.nat===c.a-c.nat;
 if(info.repeatPitch&&(p.f!==c.f||p.s!==c.s||!sameFrame))cost+=4;
 if(info.keepFrame&&!sameFrame)cost+=4;
 return cost;
}

// lines: parsed score lines whose note tokens carry `midi`. keyOf(token) -> key pitch class.
// Returns Map(token -> {finger, string, shift, anchorMidi, bow}) and a summary.
function annotate(lines,{tuning=[62,69],keyOf=()=>0}={}){
 const seq=[];let slur=0,pauseBeats=0,restActive=false;const tuplets=[];
 for(const l of lines){if(l.kind!=='music')continue;
  for(const t of l.tokens){
   if(t.t==='open')slur++;else if(t.t==='close')slur=Math.max(0,slur-1);
   else if(t.t==='tupOpen'){let q=1;while(q*2<t.n)q*=2;tuplets.push(q/t.n)}
   else if(t.t==='tupClose')tuplets.pop();
   else if(t.t==='rest'){pauseBeats+=Math.pow(0.5,t.under||0)*(t.dot===1?1.5:t.dot===2?1.75:1)*tuplets.reduce((a,b)=>a*b,1);restActive=true}
   else if(t.t==='dash'&&restActive)pauseBeats+=1;
   else if(t.t==='note'&&t.midi!=null){
    // Eighth rests separate attacks, not phrases: keep the hand frame through 3/0/ 5/0/ ... .
    seq.push({t,inSlur:slur>0,afterRest:pauseBeats>=1-1e-9,short:(t.under||0)>=2});pauseBeats=0;restActive=false;
   }
  }
 }
 // Local repetition includes short rests and bar lines, but a phrase-length rest resets it.
 // Use absolute pitch so notes in different octaves (or with different accidentals) are not conflated.
 for(let i=1;i<seq.length;i++){
  const prev=seq[i-1],now=seq[i];
  if(!now.afterRest&&prev.t.midi===now.t.midi)now.repeatPitch=true;
  const next=seq[i+1];
  // A short lower neighbour returning to the same stopped pitch also keeps the frame:
  // e.g. 2′–1′–2′ should not shift down on 1′ only to use finger 4 on the returning 2′.
  const stepDown=prev.t.midi-now.t.midi;
  const returningNeighbour=tuning.includes(now.t.midi)||(now.t.under>0&&stepDown>0&&stepDown<=2);
  if(next&&!now.afterRest&&!next.afterRest&&returningNeighbour&&prev.t.midi===next.t.midi){now.keepFrame=true;next.keepFrame=true}
 }
 // An isolated short peak returning to the same pitch may justify one little-finger extension.
 // Sustained extensions and a run of changing stretched pitches keep the much higher default cost.
 const isolatedPeaks=new Set();
 for(let i=1;i<seq.length-1;i++)if(!seq[i].afterRest&&!seq[i+1].afterRest&&seq[i].t.under>0&&seq[i-1].t.midi===seq[i+1].t.midi&&seq[i].t.midi>seq[i-1].t.midi)isolatedPeaks.add(seq[i].t);
 const result=new Map();let unplayable=0,trillUnavailable=0;
 const cache=new Map(),hasTrill=t=>(t.orns||[]).includes('tr');
 const fingerings=t=>{
  const key=keyOf(t),trill=hasTrill(t),id=`${t.midi}|${key}|${trill?trillUpper(t,key):'plain'}|${isolatedPeaks.has(t)}`;
  if(!cache.has(id))cache.set(id,trill?trillCandidates(t,tuning,key):candidates(t.midi,tuning,key).map(c=>c.ext&&isolatedPeaks.has(t)?{...c,cost:c.cost-5}:c));
  return cache.get(id);
 };
 // Viterbi over runs of playable notes (a note outside the range splits the run).
 let run=[];
 // States are (candidate, arrived-by-shift); a shift right after another shift costs extra (the hand should settle).
 const moved=(p,c)=>c.f>0&&p.f>0&&p.a!==c.a&&!(p.s!==c.s&&p.a-p.nat===c.a-c.nat);
 const flush=()=>{
  if(!run.length)return;
  const cands=run.map(x=>fingerings(x.t));
  // A phrase starts in first position when it can (no reason to begin high and stay there).
  let prev=[];cands[0].forEach(c=>{prev.push({cost:c.cost+(c.high?2:0),back:-1},{cost:Infinity,back:-1})});const backs=[prev];
  for(let i=1;i<run.length;i++){
   const restart=run[i].afterRest?(c=>c.high?2:0):(()=>0),cur=[];
   cands[i].forEach(c=>{
    const best=[{cost:Infinity,back:-1},{cost:Infinity,back:-1}];
    cands[i-1].forEach((p,j)=>{const m=moved(p,c),t=transition(p,c,run[i]);for(const f of [0,1]){const from=prev[2*j+f];if(from.cost===Infinity)continue;
     const v=from.cost+t+(m&&f?1.2:0),slot=best[m?1:0];if(v<slot.cost){slot.cost=v;slot.back=2*j+f}}});
    for(const x of best)if(x.back>=0)x.cost+=c.cost+restart(c);
    cur.push(best[0],best[1]);
   });
   backs.push(cur);prev=cur;
  }
  let k=prev.reduce((b,x,i)=>x.cost<prev[b].cost?i:b,0);
  const chosen=[];for(let i=run.length-1;i>=0;i--){chosen[i]=cands[i][k>>1];k=backs[i][k].back}
  chosen.forEach((c,i)=>result.set(run[i].t,{finger:c.f,string:c.s,anchor:c.a,anchorMidi:tuning[c.s]+c.a,extended:!!c.ext,...(c.trill?{trill:c.trill}:{})}));
  run=[];
 };
 for(const x of seq){if(!fingerings(x.t).length){
  unplayable++;const trill=hasTrill(x.t)&&candidates(x.t.midi,tuning,keyOf(x.t)).length>0;if(trill)trillUnavailable++;
  flush();result.set(x.t,{finger:null,reason:trill?'trill':'range'});continue;
 }run.push(x)}
 flush();
 // Shift and string-change marks relative to the previous note.
 let last=null,shifts=0;
 for(const x of seq){const r=result.get(x.t);if(!r||r.finger==null){last=null;continue}
  r.stringChange=!last||last.string!==r.string;
  const da=last?Math.abs(last.anchor-r.anchor):0;
  if(last&&(da>=2||(da===1&&last.string===r.string))){r.shift=r.anchor>last.anchor?'up':'down';shifts++}
  last=r;
 }
 // Bowing: one bow per slur group, alternate, back to 拉弓 after a rest; mark phrase starts and slur starts.
 let dir='down',lineStart=true,resetNext=true,restBeats=0;
 for(const l of lines){if(l.kind!=='music')continue;lineStart=true;let depth=0,groupOpen=false;
  for(const t of l.tokens){
   if(t.t==='open'){depth++;groupOpen=true;continue}
   if(t.t==='close'){depth=Math.max(0,depth-1);continue}
   // Only a rest of a beat or more resets to a down bow; after short rests (5/ 0/ 5/ 0/) bows keep alternating.
   if(t.t==='rest'){restBeats+=Math.pow(0.5,t.under||0)*(t.dot?1.5:1);if(restBeats>=1)resetNext=true;continue}
   if(t.t==='dash'){continue}
   if(t.t!=='note'||t.grace)continue;
   restBeats=0;
   const r=result.get(t)||{};result.set(t,r);
   const continuing=depth>0&&!groupOpen;
   if(!continuing){
    if(resetNext){dir='down'}else dir=dir==='down'?'up':'down';
    if(resetNext||lineStart||groupOpen)r.bow=dir;
    resetNext=false;
   }
   groupOpen=false;lineStart=false;
  }
 }
 return {map:result,shifts,unplayable,trillUnavailable};
}

const NAMES=['C','C♯','D','E♭','E','F','F♯','G','G♯','A','B♭','B'];
// Annotation element for a note (used by the renderer).
// Two rows above the note: bow / shift on top, string + finger (e.g. 外一) next to the note.
function label(r){
 if(!r)return null;
 const box=document.createElement('span'),row=document.createElement('span'),low=document.createElement('span');
 box.className='jp-anno';row.className='anno-top';low.className='anno-low';
 const add=(parent,cls,text,title)=>{const e=document.createElement('span');e.className=cls;e.textContent=text;if(title)e.title=title;parent.append(e)};
 if(r.bow)add(row,'anno-bow',r.bow==='down'?'⊓':'V',r.bow==='down'?'拉弓':'推弓');
 if(r.finger==null){add(low,'anno-bad','?',r.reason==='trill'?'没有可用的同弦同把位颤音手型，请人工核对辅助音或演奏方式':'超出二胡音域');box.append(row,low);return box}
 // Arrow follows the hand: to a higher position the hand slides down the neck (↓), back up for lower ones (↑).
 if(r.shift)add(row,'anno-shift',r.shift==='up'?'↓':'↑',`${r.shift==='up'?'往下换把（音变高）':'往上换把（音变低）'}：食指移到 ${NAMES[r.anchorMidi%12]}${Math.floor(r.anchorMidi/12)-1}`);
 if(r.stringChange)add(low,'anno-string',r.string===0?'内':'外');
 add(low,'anno-finger',FINGERS[r.finger]+(r.extended?'伸':'')+(r.trill?'↔'+FINGERS[r.trill.finger]:''),r.trill?`颤音：${FINGERS[r.finger]}指与${FINGERS[r.trill.finger]}指交替；上邻音 ${NAMES[r.trill.midi%12]}${Math.floor(r.trill.midi/12)-1}，同弦同把位（按当前调内上邻音推算）`:r.extended?'四指延伸：仅在避免额外换把更合适时采用，需按个人手型核对':undefined);
 box.append(row,low);return box;
}
// Tuning for a key: the six common keys keep the standard D–A strings (named by scale degree); other keys use the
// 1–5 or 5–2 string pair whose inner string lies closest to D4.
const COMMON=[2,7,5,10,0,9];
const DEG=['1','♭2','2','♭3','3','4','♯4','5','♭6','6','♭7','7'];
function degreeName(pc,key){return DEG[((pc-key)%12+12)%12]}
function autoTuning(key){
 if(COMMON.includes(((key%12)+12)%12))return [62,69];
 const near=pc=>{let m=60+pc;while(m<59)m+=12;while(m>65)m-=12;return m};
 const one=near(key),five=near(key+7);
 return Math.abs(one-62)<=Math.abs(five-62)?[one,one+7]:[five,five+7];
}
// "15 弦（D4–A4）": the open strings named by scale degree in the key (inner first), as erhu players say.
function stringsName(t,key){return `${degreeName(t[0]%12,key)}${degreeName(t[1]%12,key)} 弦`}
function tuningLabel(t,key){const n=m=>NAMES[m%12]+(Math.floor(m/12)-1);return `${stringsName(t,key)}（${n(t[0])}–${n(t[1])}）`}
window.ErhuFingering={annotate,label,autoTuning,tuningLabel,stringsName,TUNINGS:[['D–A（标准定弦）',[62,69]],['C–G',[60,67]],['E♭–B♭',[63,70]],['E–B',[64,71]],['F–C',[65,72]],['G–D（二泉调 / 中胡）',[55,62]]]};
})();
// Modified by AI on 2026-10-08 10:06:28
