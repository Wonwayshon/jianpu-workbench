'use strict';
// Score output card: flute / original / staff tabs, playback with metronome settings, floating play bar,
// double-tap "play from here", PDF export of the visible tab, and the full-screen page viewer.
(() => {
const $=id=>document.getElementById(id);
const VIEWS={flute:'scoreOutput',source:'scorePreview',staff:'staffOutput',trans:'transBox'};
const TAB_BUTTONS={flute:'viewFlute',source:'viewSource',staff:'viewStaff',trans:'viewTrans'},VIEWER_BUTTONS={flute:'viewerFlute',source:'viewerSource',staff:'viewerStaff',trans:'viewerTrans'};
const HINTS={trans:'选一个调重新记谱：「保持音高」按新调改写数字（原音高演奏）；「移到新调」数字不变、整曲升降到新调，试听也跟着变。',flute:'音名谱：固定 1=C（C=1、D=2…），中音 1 = C4，长笛等 C 调乐器直接照读；每个升降号只管当前一个音。',source:'按原谱写法排版，便于对照原图核对。',staff:'按实际音高记的五线谱（总谱低声部自动用低音谱号），调号沿用原谱；试听时同步高亮。'};
let view='source';
let settings=ScorePlayer.loadSettings(),tempoFromScore=null,staffDirty=true;
const save=()=>ScorePlayer.saveSettings(settings);

// ---------- full score: which part to show / play, per-part sound ----------
let partSel=(()=>{try{return localStorage.getItem('flute.partSel')||'all'}catch{return 'all'}})();
let selectedParts=(()=>{try{const ids=JSON.parse(localStorage.getItem('flute.visibleParts')||'[]');return Array.isArray(ids)?ids.filter(x=>typeof x==='string'):[]}catch{return []}})();
const scoreParts=()=>lastConverted?.source?.parts||[];
let measureOn=false,measureEvery=4;
try{measureOn=localStorage.getItem('flute.measureNumbers')==='1';measureEvery=Math.max(1,Math.min(100,Math.floor(Number(localStorage.getItem('flute.measureEvery'))||4)))}catch{}
const measureCache=new WeakMap();
function scoreDisplayOptions(lines,v=view){
 if(!measureOn)return {measureEvery:0};
 const whole=v==='source'?lastConverted?.source?.lines:v==='trans'?(transAllLines||lines):lastConverted?.lines;
 const source=whole||lines;let numbers=measureCache.get(source);if(!numbers){numbers=Jianpu.numberMeasures(source);measureCache.set(source,numbers)}
 return {measureEvery,measureNumbers:numbers};
}
window.scoreDisplayOptions=scoreDisplayOptions;
function syncMeasureControls(){for(const prefix of ['score','viewer']){$(prefix+'MeasureNumbers').checked=measureOn;$(prefix+'MeasureEvery').value=measureEvery;$(prefix+'MeasureEvery').disabled=!measureOn}}
function changeMeasureControls(prefix){measureOn=$(prefix+'MeasureNumbers').checked;measureEvery=Math.max(1,Math.min(100,Math.floor(Number($(prefix+'MeasureEvery').value)||4)));
 try{localStorage.setItem('flute.measureNumbers',measureOn?'1':'0');localStorage.setItem('flute.measureEvery',String(measureEvery))}catch{}
 syncMeasureControls();renderMain();if(viewerOpen)rebuild(vIndex);
}
for(const prefix of ['score','viewer'])for(const suffix of ['MeasureNumbers','MeasureEvery'])$(prefix+suffix).onchange=()=>changeMeasureControls(prefix);
syncMeasureControls();
const visiblePartIds=()=>partSel==='all'?scoreParts().map(p=>p.id):partSel==='__custom'?selectedParts:[partSel];
const F=lines=>!lines||partSel==='all'?lines:Jianpu.filterParts(lines,visiblePartIds());
function syncPartBar(){
 const parts=scoreParts();$('partBar').hidden=$('viewerParts').hidden=parts.length<2;
 if(partSel==='__custom'){selectedParts=selectedParts.filter(id=>parts.some(p=>p.id===id));if(!selectedParts.length)partSel='all'}
 else if(!parts.some(p=>p.id===partSel))partSel='all';
 $('partSelect').replaceChildren(new Option('全部声部（总谱）','all'),...parts.map(p=>new Option(p.name===p.id?p.id:`${p.id} · ${p.name}`,p.id)),new Option(partSel==='__custom'?`已选 ${selectedParts.length} 个声部`:'自选多个声部…','__custom'));$('partSelect').value=partSel;
 $('scorePartPlayback').hidden=parts.length<2;fillPartMixer();
}
function applyVisibleParts(ids){
 const parts=scoreParts();selectedParts=parts.filter(p=>ids.includes(p.id)).map(p=>p.id);
 if(!selectedParts.length)return false;
 partSel=selectedParts.length===parts.length?'all':selectedParts.length===1?selectedParts[0]:'__custom';
 try{localStorage.setItem('flute.partSel',partSel);localStorage.setItem('flute.visibleParts',JSON.stringify(selectedParts))}catch{}
 if(ScorePlayer.isPlaying())ScorePlayer.stop();renderMain();if(viewerOpen)rebuild(0);return true;
}
function chooseParts(){
 const box=$('partDisplayChoices'),visible=new Set(visiblePartIds());box.replaceChildren();$('partDisplayError').hidden=true;
 for(const part of scoreParts()){
  const label=document.createElement('label');label.className='switch-row';
  const cb=document.createElement('input');cb.type='checkbox';cb.value=part.id;cb.checked=visible.has(part.id);
  label.append(cb,part.name===part.id?part.id:`${part.id} · ${part.name}`);box.append(label);
 }
 const d=$('partDisplayDialog');d.showModal?d.showModal():d.setAttribute('open','');
}
$('partSelect').onchange=()=>{const id=$('partSelect').value;if(id==='__custom'){chooseParts();$('partSelect').value=partSel}else applyVisibleParts(id==='all'?scoreParts().map(p=>p.id):[id])};
$('chooseParts').onclick=$('viewerParts').onclick=chooseParts;
for(const [id,checked] of [['displayAllParts',true],['displayNoParts',false]])$(id).onclick=()=>{for(const cb of $('partDisplayChoices').querySelectorAll('input'))cb.checked=checked};
$('applyDisplayParts').onclick=()=>{
 const ids=[...$('partDisplayChoices').querySelectorAll('input:checked')].map(cb=>cb.value);
 if(!ids.length){$('partDisplayError').textContent='至少选择一个乐器。';$('partDisplayError').hidden=false;return}
 if(applyVisibleParts(ids))$('partDisplayDialog').close();
};

// ---------- custom transposition ----------
const KEY_NAMES=['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
for(let i=0;i<12;i++)$('transKey').add(new Option(`1 = ${KEY_NAMES[i]}`,i));
try{$('transKey').value=localStorage.getItem('flute.transKey')||'7';$('transMode').value=localStorage.getItem('flute.transMode')||'keep'}catch{}
let transLines=null,transAllLines=null;
// keep: same pitches written in 1=X (middle 1 = X4). move: same digits, every pitch shifted to key X.
function buildTransposed(){
 const X=Number($('transKey').value),mode=$('transMode').value,flat=[1,3,5,8,10].includes(X);
 const digits=flat?DIGITS_FLAT:DIGITS_SHARP,orig=Number($('songKey').value);
 let shift=((X-orig)%12+12)%12;if(shift>6)shift-=12;
 let firstKey=true,curKey=lastConverted.keyLabel;
 return lastConverted.lines.map(line=>{
  if(line.kind==='meta'&&line.name==='origKey'){curKey=line.value;const v=firstKey?`原谱 1=${line.value} → 1=${KEY_NAMES[X]}`:`原谱转为 1=${line.value}`;firstKey=false;return {kind:'meta',name:'note',value:mode==='move'?v+'（整曲移调）':v}}
  if(line.kind!=='music')return line;
  const mapNote=t=>{
   if(mode==='move'){const src=t.src||t;return {...t,label:undefined,degree:src.degree,acc:src.acc,natural:src.natural,octave:src.octave,midi:t.midi+shift}}
   const sp=spellIn(t,X,curKey,digits);return {...t,...sp,degree:Number(sp.label.slice(-1))||t.degree,natural:false};
  };
  return {kind:'music',part:line.part,tokens:line.tokens.map(t=>{
   if(t.t==='chord'){const c={...t,notes:t.notes.map(mapNote)};for(const n of c.notes)n.chord=c;return c}
   if(t.t!=='note')return t.t==='percussion'?{...t}:t;
   if(mode==='move'){const src=t.src||t;return {...t,label:undefined,degree:src.degree,acc:src.acc,natural:src.natural,octave:src.octave,midi:t.midi+shift}}
   const sp=spellIn(t,X,curKey,digits);return {...t,...sp,degree:Number(sp.label.slice(-1))||t.degree,natural:false};
  })};
 }).map((line,i,all)=>line);
}
// Writes the pitch in 1=X by scale degree: the source degree moves by the letter distance between the keys,
// then an accidental covers the rest (F in 1=G is ♭7, not ♯6). Falls back to chromatic digits for double accidentals.
const LETTER=l=>'CDEFGAB'.indexOf(String(l).replace(/[♭♯b#]/g,'')[0]);
function spellIn(t,X,fromKey,digits){
 const src=t.src||t,fromLetter=LETTER(fromKey),toLetter=LETTER(KEY_NAMES[X]);
 if(src.degree&&fromLetter>=0&&toLetter>=0){
  const deg=((src.degree-1+fromLetter-toLetter)%7+7)%7;
  for(let o=-3;o<=4;o++){const acc=t.midi-(60+X+12*o+STEPS[deg]);if(Math.abs(acc)<=1)return {label:(acc>0?'♯':acc<0?'♭':'')+(deg+1),octave:o}}
 }
 const rel=t.midi-(60+X);return {label:digits[((rel%12)+12)%12],octave:Math.floor(rel/12)};
}
function renderTrans(){
 if(!(lastConverted?.notes.length||lastConverted?.percussionCount)){$('transOutput').replaceChildren();transLines=transAllLines=null;return}
 transAllLines=buildTransposed();transLines=F(transAllLines);
 if(!transLines.some(l=>l.kind==='meta'&&l.name==='note'))transLines.unshift({kind:'meta',name:'note',value:`原谱 1=${lastConverted.keyLabel} → 1=${KEY_NAMES[Number($('transKey').value)]}${$('transMode').value==='move'?'（整曲移调）':''}`});
 $('transOutput').hidden=transStaff();$('transStaff').hidden=!transStaff();
 if(transStaff())Staff.render($('transStaff'),transLines,{keyLabel:staffKey('trans'),partNames:scoreParts(),...scoreDisplayOptions(transLines,'trans')}).catch(e=>{$('transStaff').textContent='五线谱无法显示：'+e.message});
 else Jianpu.render($('transOutput'),transLines,erhuOpts(transLines,'trans'));
}
$('transKey').onchange=$('transMode').onchange=$('transShow').onchange=()=>{fillTunings();syncErhuBar();try{localStorage.setItem('flute.transKey',$('transKey').value);localStorage.setItem('flute.transMode',$('transMode').value);localStorage.setItem('flute.transShow',$('transShow').value)}catch{}if(ScorePlayer.isPlaying())ScorePlayer.stop();renderTrans()};
// The transposition tab can be drawn as staff notation too.
const transStaff=()=>$('transShow').value==='staff';
const isStaff=v=>v==='staff'||(v==='trans'&&transStaff());
const staffKey=v=>v==='trans'?KEY_NAMES[Number($('transKey').value)]:lastConverted.keyLabel;
try{$('transShow').value=localStorage.getItem('flute.transShow')||'jianpu'}catch{}
// Lines that playback and export use for a tab: the transposition tab has its own pitches.
const linesFor=v=>v==='trans'?transLines:v==='source'?lastConverted.source.lines:lastConverted.lines;

// ---------- experimental erhu fingering (original and transposed numbered views only) ----------
// Tuning list: "auto" follows the score's key; the fixed tunings stay available.
function currentKeyPc(){return view==='trans'?Number($('transKey').value):Number($('songKey').value)}
function fillTunings(){
 const sel=$('erhuTuning'),keep=sel.value||(()=>{try{return localStorage.getItem('flute.erhuTuning')||'auto'}catch{return 'auto'}})(),key=currentKeyPc();
 sel.replaceChildren(new Option(`自动 · ${ErhuFingering.tuningLabel(ErhuFingering.autoTuning(key),key)}`,'auto'));
 for(const [label,value] of ErhuFingering.TUNINGS)sel.add(new Option(`${ErhuFingering.stringsName(value,key)} · ${label}`,value.join(',')));
 labelKeys();
 sel.value=[...sel.options].some(o=>o.value===keep)?keep:'auto';
}
try{$('erhuFinger').checked=localStorage.getItem('flute.erhuFinger')==='1'}catch{}
fillTunings();
function erhuPartIds(){
 const parts=scoreParts();if(parts.length<2)return parts.length?[parts[0].id]:[''];
 try{const stored=JSON.parse(localStorage.getItem('flute.erhuParts')||'null');if(stored?.signature===JSON.stringify(parts))return parts.filter(p=>stored.ids?.includes(p.id)).map(p=>p.id)}catch{}
 return [];
}
const erhuCache=new WeakMap();
function erhuFor(lines,v){
 if(!$('erhuFinger').checked||!(v==='source'||v==='trans')||!lines)return null;
 const X=Number($('transKey').value),song=Number($('songKey').value);
 const tuning=$('erhuTuning').value==='auto'?ErhuFingering.autoTuning(v==='trans'?X:song):$('erhuTuning').value.split(',').map(Number);
 const ids=erhuPartIds(),res={map:new Map(),shifts:0,unplayable:0,trillUnavailable:0};
 // Each instrument has its own hand/bow history. Use the whole part so page breaks do not reset fingering.
 const whole=v==='trans'?(transAllLines||lines):(lastConverted?.source?.lines||lines);
 for(const id of ids){
  if(!lines.some(l=>l.kind==='music'&&(l.part||'')===id))continue;
  const only=whole.filter(l=>l.kind!=='music'||(l.part||'')===id);
  let cache=erhuCache.get(whole);if(!cache){cache=new Map();erhuCache.set(whole,cache)}
  const key=JSON.stringify([id,v,X,song,tuning]);let r=cache.get(key);
  if(!r){r=ErhuFingering.annotate(only,{tuning,keyOf:t=>v==='trans'?X:(t.keyPc??song)});cache.set(key,r)}
  for(const [t,value] of r.map)res.map.set(t,value);
  for(const k of ['shifts','unplayable','trillUnavailable'])res[k]+=r[k]||0;
 }
 return res.map.size?res:null;
}
function erhuOpts(lines,v,base={}){base={...base,partNames:scoreParts(),...scoreDisplayOptions(lines,v)};const res=erhuFor(lines,v);if(!res)return base;return {...base,annotations:res.map,label:ErhuFingering.label,summary:res}}
function fillErhuParts(){
 const parts=scoreParts(),button=$('erhuPart'),ids=erhuPartIds();button.hidden=parts.length<2||!$('erhuFinger').checked;
 button.textContent=ids.length?`二胡声部 · 已选 ${ids.length} 个`:'选择二胡声部（未选择）';
 $('viewerErhuParts').hidden=parts.length<2||!$('erhuFinger').checked||!(vView==='source'||vView==='trans');
 $('viewerErhuParts').textContent=ids.length?`二胡声部 (${ids.length})`:'选择二胡声部';
}
function chooseErhuParts(){
 const box=$('erhuPartChoices'),ids=erhuPartIds();box.replaceChildren();$('erhuPartError').hidden=true;
 for(const p of scoreParts()){
  const label=document.createElement('label');label.className='switch-row';const cb=document.createElement('input');cb.type='checkbox';cb.value=p.id;cb.checked=ids.includes(p.id);
  label.append(cb,p.name===p.id?p.id:`${p.id} · ${p.name}`);box.append(label);
 }
 const d=$('erhuPartDialog');d.showModal?d.showModal():d.setAttribute('open','');
}
$('erhuPart').onclick=$('viewerErhuParts').onclick=chooseErhuParts;
for(const [id,checked] of [['erhuSelectAll',true],['erhuSelectNone',false]])$(id).onclick=()=>{for(const cb of $('erhuPartChoices').querySelectorAll('input'))cb.checked=checked};
$('erhuApplyParts').onclick=()=>{
 const ids=[...$('erhuPartChoices').querySelectorAll('input:checked')].map(cb=>cb.value);
 if(!ids.length){$('erhuPartError').textContent='请至少选择一个声部；不需要指法时关闭二胡指法即可。';$('erhuPartError').hidden=false;return}
 try{localStorage.setItem('flute.erhuParts',JSON.stringify({signature:JSON.stringify(scoreParts()),ids}))}catch{}
 $('erhuPartDialog').close();fillErhuParts();renderMain();if(viewerOpen)rebuild(vIndex);
};
// With erhu fingering on, the key lists also name the usual strings for each key (1=G → 52 弦).
function labelKeys(){
 const on=$('erhuFinger').checked;
 for(const id of ['songKey','transKey'])for(const o of $(id).options){o.dataset.base??=o.text;const pc=Number(o.value);
  o.text=on&&Number.isFinite(pc)?`${o.dataset.base}（${ErhuFingering.stringsName(ErhuFingering.autoTuning(pc),pc)}）`:o.dataset.base}
}
function syncErhuBar(){fillErhuParts();$('transControls').hidden=view!=='trans';$('fluteBar').hidden=!(view==='flute'||view==='staff');$('erhuBar').hidden=!(view==='source'||(view==='trans'&&!transStaff()));$('erhuTuning').hidden=!$('erhuFinger').checked;fillTunings()}
$('erhuFinger').onchange=$('erhuTuning').onchange=()=>{try{localStorage.setItem('flute.erhuFinger',$('erhuFinger').checked?'1':'0');localStorage.setItem('flute.erhuTuning',$('erhuTuning').value)}catch{}syncErhuBar();renderMain();if($('erhuFinger').checked&&scoreParts().length>1&&!erhuPartIds().length)chooseErhuParts()};

// ---------- rendering ----------
async function renderStaff(host,lines){
 try{await Staff.render(host,lines,{keyLabel:lastConverted.keyLabel,partNames:scoreParts(),...scoreDisplayOptions(lines,'staff')})}catch(error){host.textContent='五线谱无法显示：'+error.message}
}
function renderMain(){
 if(!lastConverted&&$('scoreOutput').closest('.output-card')?.classList.contains('stale'))return; // keep the last good score visible while the text has a parse error
 if(!lastConverted||!(lastConverted.notes.length||lastConverted.percussionCount)){$('scoreOutput').replaceChildren('输入音符后在这里显示');$('scorePreview').replaceChildren();$('staffOutput').replaceChildren();return}
 syncPartBar();fillErhuParts();
 const flute=F(lastConverted.lines);Jianpu.render($('scoreOutput'),flute,scoreDisplayOptions(flute,'flute'));const so=erhuOpts(F(lastConverted.source.lines),'source');Jianpu.render($('scorePreview'),F(lastConverted.source.lines),so);renderTrans();
 const summary=(view==='trans'?erhuFor(transLines,'trans'):so.summary);$('erhuSummary').textContent=summary?`推算：换把 ${summary.shifts} 次${summary.unplayable?`，${summary.unplayable} 个音无法推算（音域或颤音手型，标 ?）`:''}；仅供参考`:'';
 staffDirty=true;if(view==='staff')showStaff();
}
function showStaff(){if(!staffDirty||!lastConverted)return;staffDirty=false;renderStaff($('staffOutput'),F(lastConverted.lines))}
function syncTimingWarning(lines){
 const warnings=ScorePlayer.timingWarnings?.(lines||[])||[],text=warnings.slice(0,3).join(' ')+(warnings.length>3?` 另有 ${warnings.length-3} 处。`:'');
 $('playbackWarning').textContent=text;$('playbackWarning').hidden=!text;
 $('viewerPlaybackWarning').hidden=!text;$('viewerPlaybackWarning').textContent=text?'声部时值不齐':' ';$('viewerPlaybackWarning').title=text;
}
window.onScoreConverted=()=>{
 if(ScorePlayer.isPlaying())ScorePlayer.stop();
 fillTunings();renderMain();syncTimingWarning(lastConverted?.lines);
 const t=lastConverted?.source.meta.tempo?.value??null;if(t&&t!==tempoFromScore){settings.tempo=t;save()}tempoFromScore=t;syncTempoLabel();
};
function setView(v){
 view=v;try{localStorage.setItem('flute.scoreView',v)}catch{}
 for(const [k,id] of Object.entries(VIEWS)){$(id).hidden=k!==v;$(TAB_BUTTONS[k]).setAttribute('aria-pressed',String(k===v))}
 $('viewHint').textContent=HINTS[v];$('printScore').textContent='存为 PDF…';if(ScorePlayer.isPlaying())ScorePlayer.stop();
 if(v==='staff')showStaff();
 syncErhuBar();if(v==='trans'||v==='source')renderMain();
}
$('viewTrans').onclick=()=>setView('trans');$('viewFlute').onclick=()=>setView('flute');$('viewSource').onclick=()=>setView('source');$('viewStaff').onclick=()=>setView('staff');

// ---------- playback ----------
function syncTempoLabel(){const t=ScorePlayer.TIMBRE_LIST.find(x=>x[0]===settings.timbre);$('playTempoLabel').textContent=`♩=${settings.tempo}${settings.muteMelody?' · 无旋律':t?' · '+t[1]:''}${settings.metronome?' · 节拍器':''}`}
function showBeat(index,count,signature){
 for(const id of ['beatDots','floatBeats']){const box=$(id);if(signature)box.title=`节拍器 ${signature}${settings.time==='auto'?' · 跟随谱面':' · 手动拍号'}`;if(box.childElementCount!==count){box.replaceChildren(...Array.from({length:count},()=>document.createElement('i')))}
  [...box.children].forEach((d,i)=>{d.classList.toggle('on',i===index);d.classList.toggle('first',i===0)})}
}
function setPlaying(on){
 $('playScore').textContent=on?'■ 停止':'▶ 试听';$('playScore').classList.toggle('playing',on);
 $('viewerPlay').textContent=on?'■':'▶';$('floatStop').textContent=on?'■':'▶';$('floatStop').classList.toggle('playing',on);if(on)floatAvailable=true;syncFloatPlayer();
 $('floatInfo').innerHTML=`<b>♩=${settings.tempo}</b> <small>${ScorePlayer.tempoName(settings.tempo)}</small>`;
 if(!on){for(const id of ['beatDots','floatBeats'])$(id).replaceChildren();clearStaffCursor()}
}
async function startPlayback(startToken){
 if(!(lastConverted?.notes.length||lastConverted?.percussionCount))return;
 const all=(viewerOpen?vView:view)==='trans'?transAllLines:lastConverted.lines;
 const src=settings.partScope==='visible'?F(all):all;
 syncTimingWarning(src);
 followHold=false;
 try{const ok=await ScorePlayer.playReady(src,{...settings,startToken,followPart:partSel==='all'?undefined:visiblePartIds()[0],onBeat:showBeat,onPreparing:()=>{setPlaying(true);$('playScore').textContent='正在准备音色…'}},()=>{setPlaying(false);clearViewerHighlight()});
 if(ok)setPlaying(true);else if(!ScorePlayer.isPlaying())setPlaying(false);
 }catch{setPlaying(false);$('viewHint').textContent='音色准备失败，请切换到现有音色后重试。'}
}
const toggle=()=>ScorePlayer.isPlaying()?ScorePlayer.stop():startPlayback();
$('playScore').onclick=()=>{floatDismissed=false;toggle()};$('floatStop').onclick=toggle;$('viewerPlay').onclick=toggle;
// Play bar clock: elapsed / total while playing; 0:00 / total (whole piece at the current tempo) when idle.
const mmss=t=>{t=Math.max(0,Math.round(t||0));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
let idleTotal={key:null,value:0};
function pieceLength(){
 if(!lastConverted)return 0;const all=view==='trans'&&transAllLines?transAllLines:lastConverted.lines;
 if(idleTotal.key!==all||idleTotal.tempo!==settings.tempo){let v=0;try{v=ScorePlayer.duration?ScorePlayer.duration(all,settings):0}catch{}idleTotal={key:all,tempo:settings.tempo,value:v}}
 return idleTotal.value;
}
function showClock(){
 const pos=ScorePlayer.position?.(),total=pos?pos.total:pieceLength(),now=pos?pos.elapsed:0,text=mmss(now)+' / '+mmss(total);
 if($('playTime')&&$('playTime').textContent!==text)$('playTime').textContent=text;
 if($('playProg'))$('playProg').style.width=(total?Math.min(100,now/total*100):0)+'%';
 if(pos&&$('floatInfo'))$('floatInfo').innerHTML=`<b>${mmss(now)} / ${mmss(total)}</b> <small>♩=${settings.tempo}</small>`;
}
setInterval(()=>{if(!document.hidden)showClock()},300);
// Floating bar: appears when playback starts and stays (▶ / ■) until closed with ✕; drag it anywhere, it snaps to
// the nearest side and remembers where it was.
let floatDismissed=false,floatAvailable=false;
function syncFloatPlayer(){$('floatPlayer').hidden=perform||!!$('scoreViewer').classList.contains?.('editing')||floatDismissed||!floatAvailable}
$('floatClose').onclick=()=>{floatDismissed=true;syncFloatPlayer();ScorePlayer.stop()};
(()=>{
 const bar=$('floatPlayer'),EDGE=56,PAD=8;let drag=null,position=null;
 const save=()=>{try{localStorage.setItem('flute.floatPos',JSON.stringify(position))}catch{}};
 try{const p=JSON.parse(localStorage.getItem('flute.floatPos')||'null');if(p&&['free','dock'].includes(p.mode)&&Number.isFinite(p.y))position=p}catch{}
 const place=(x,y)=>{
  const maxX=Math.max(PAD,innerWidth-bar.offsetWidth-PAD),maxY=Math.max(PAD,innerHeight-bar.offsetHeight-PAD);
  x=Math.min(maxX,Math.max(PAD,Number.isFinite(x)?x:maxX));y=Math.min(maxY,Math.max(PAD,Number.isFinite(y)?y:maxY));
  bar.style.left=x+'px';bar.style.top=y+'px';bar.style.right='auto';bar.style.bottom='auto';return {x,y,maxX,maxY};
 };
 const remember=(mode,side,placed)=>{position={version:2,mode,...(side?{side}:{}),x:(placed.x-PAD)/Math.max(1,placed.maxX-PAD),y:(placed.y-PAD)/Math.max(1,placed.maxY-PAD)};save()};
 const restore=()=>{
  if(bar.hidden||drag)return;
  if(!position){const r=bar.getBoundingClientRect();const p=place(r.left,r.top);remember('free',null,p);return}
  bar.classList.toggle('docked',position.mode==='dock');
  const maxX=Math.max(PAD,innerWidth-bar.offsetWidth-PAD),maxY=Math.max(PAD,innerHeight-bar.offsetHeight-PAD),modern=position.version===2;
  const x=position.mode==='dock'?(position.side==='left'?PAD:maxX):modern?PAD+position.x*(maxX-PAD):position.x*innerWidth;
  const y=modern?PAD+position.y*(maxY-PAD):position.y*innerHeight;place(x,y);
 };
 const snap=point=>{
  const r=bar.getBoundingClientRect(),left=point.x<=EDGE||r.left<=EDGE,right=point.x>=innerWidth-EDGE||innerWidth-r.right<=EDGE;
  const side=left||right?(point.x<=EDGE?'left':point.x>=innerWidth-EDGE?'right':r.left+r.width/2<innerWidth/2?'left':'right'):null;
  bar.classList.toggle('docked',!!side);
  const p=place(side==='left'?PAD:side==='right'?innerWidth-bar.offsetWidth-PAD:r.left,r.top);remember(side?'dock':'free',side,p);
 };
 new MutationObserver(()=>{if(!bar.hidden)requestAnimationFrame(restore)}).observe(bar,{attributes:true,attributeFilter:['hidden']});
 bar.addEventListener('pointerdown',e=>{
  if(e.target.closest('button'))return;const r=bar.getBoundingClientRect();drag={pointer:e.pointerId,x:e.clientX,y:e.clientY,dx:e.clientX-r.left,dy:e.clientY-r.top,moved:false};bar.setPointerCapture(e.pointerId);bar.classList.add('dragging');
 });
 bar.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;drag.moved=true;place(e.clientX-drag.dx,e.clientY-drag.dy)});
 const end=(e,cancelled=false)=>{if(!drag||e.pointerId!==drag.pointer)return;const moved=drag.moved;drag=null;bar.classList.remove('dragging');if(bar.hasPointerCapture(e.pointerId))bar.releasePointerCapture(e.pointerId);if(cancelled)restore();else if(moved)snap({x:e.clientX,y:e.clientY})};
 bar.addEventListener('pointerup',e=>end(e));bar.addEventListener('pointercancel',e=>end(e,true));
 addEventListener('resize',restore);
 if('ResizeObserver' in window)new ResizeObserver(restore).observe(bar);
})();
function restartIfPlaying(){if(ScorePlayer.isPlaying()){ScorePlayer.stop();startPlayback()}}

// Staff cursor: a translucent rounded block behind the playing note (drawn in the note's own SVG coordinates).
const SVGNS='http://www.w3.org/2000/svg';
function clearStaffCursor(){for(const r of document.querySelectorAll('.staff-cursor'))r.remove()}
function staffCursor(token){
 clearStaffCursor();
 const els=(token?._staffEls||[]).filter(e=>e.isConnected&&e.getClientRects().length);if(!els.length)return;
 const parent=els[0].parentNode;let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
 for(const e of els){if(e.parentNode!==parent||!e.getBBox)continue;const b=e.getBBox();x1=Math.min(x1,b.x);y1=Math.min(y1,b.y);x2=Math.max(x2,b.x+b.width);y2=Math.max(y2,b.y+b.height)}
 if(!Number.isFinite(x1))return;
 const cy=(y1+y2)/2,h=Math.max(y2-y1+16,48),w=Math.max(x2-x1+10,18);
 const rect=document.createElementNS(SVGNS,'rect');
 rect.setAttribute('class','staff-cursor');rect.setAttribute('x',(x1+x2)/2-w/2);rect.setAttribute('y',cy-h/2);rect.setAttribute('width',w);rect.setAttribute('height',h);rect.setAttribute('rx',5);
 parent.insertBefore(rect,parent.firstChild);
}
// Keep the playing note on screen (the viewer turns pages itself).
let lastScroll=0;
document.addEventListener('scoreplay',e=>{
 if(viewerOpen){followInViewer(e.detail.token).then(()=>{if(isStaff(vView))staffCursor(e.detail.token)});return}
 if(isStaff(view))staffCursor(e.detail.token);
 const el=e.detail.el;if(!el)return;const r=el.getBoundingClientRect(),now=performance.now();
 if((r.top<70||r.bottom>innerHeight-110)&&now-lastScroll>400){lastScroll=now;el.scrollIntoView({block:'center',behavior:'smooth'})}
});

// ---------- settings dialog ----------
const dialog=$('playDialog');
function fillSettings(){
 $('tempoRange').value=settings.tempo;$('playTempo').value=settings.tempo;$('tempoValue').textContent=settings.tempo;$('tempoName').textContent=ScorePlayer.tempoName(settings.tempo);
 $('metroOn').checked=settings.metronome;$('metroAccent').checked=settings.accent;$('metroCountIn').checked=settings.countIn;$('metroTime').value=settings.time;
 fillPartMixer();$('timbreSelect').value=settings.timbre||'flute';$('mixBalance').value=settings.balance??0.5;const b=Number($('mixBalance').value);$('mixHint').textContent=b<0.45?`原曲更响（节拍器 ${Math.round(b*200)}%）`:b>0.55?`节拍器更响（原曲 ${Math.round((1-b)*200)}%）`:'原曲与节拍器一样响';$('playMelody').checked=!settings.muteMelody;
 $('metroOpts').classList.toggle('off',!settings.metronome);
 for(const b of $('patternGrid').children)b.setAttribute('aria-checked',String(b.dataset.id===settings.pattern));
}
function setTempo(v,restart=true){settings.tempo=Math.round(Math.min(240,Math.max(30,Number(v)||80)));save();fillSettings();syncTempoLabel();if(restart)restartIfPlaying()}
$('patternGrid').append(...ScorePlayer.PATTERNS.map(p=>{const b=document.createElement('button');b.type='button';b.className='pattern-btn';b.dataset.id=p.id;b.setAttribute('role','radio');b.title=p.label;b.setAttribute('aria-label',p.label);b.innerHTML=ScorePlayer.patternIcon(p);b.onclick=()=>{settings.pattern=p.id;save();fillSettings();restartIfPlaying()};return b}));
const openSettings=()=>{fillSettings();if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','')};
$('playSettings').onclick=openSettings;
// Full score: one row per part with its own timbre ("跟随默认" uses the main timbre) and a mute switch.
function applyPartMutes(mutes){
 settings.partMute=mutes;
 for(const p of scoreParts())ScorePlayer.setPartMute(p.id,!!mutes[p.id]);
 save();fillPartMixer();syncTempoLabel();
}
function fillPartMixer(){
 const parts=scoreParts();
 settings.partTimbres=settings.partTimbres||{};settings.partMute=settings.partMute||{};
 $('playPartScope').value=settings.partScope==='visible'?'visible':'all';
 for(const id of ['partMixer','partMixerInline']){
  const box=$(id);box.hidden=parts.length<2;box.replaceChildren();if(parts.length<2)continue;
  const header=Object.assign(document.createElement('div'),{className:'sub-title',textContent:'声部发声'});
  const tools=document.createElement('div');tools.className='toolbar';
  for(const [label,muted] of [['全部发声',false],['全部静音',true]]){
   const b=document.createElement('button');b.type='button';b.textContent=label;
   b.onclick=()=>applyPartMutes(Object.fromEntries(parts.filter(()=>muted).map(p=>[p.id,true])));tools.append(b);
  }
  const hint=Object.assign(document.createElement('p'),{className:'subtle compact',textContent:settings.muteMelody?'原曲声音已在播放设置中关闭，需开启后才能听到声部。':settings.partScope==='visible'&&partSel!=='all'?'当前只播放显示的声部；切换「总谱 · 全部声部」可听伴奏。':'勾选发声，取消即静音；播放中切换不中断进度。'});
  box.append(header,hint,tools);
  for(const p of parts){
   const row=document.createElement('div');row.className='part-row';
   const name=p.name===p.id?p.id:`${p.id} · ${p.name}`;
   const label=Object.assign(document.createElement('span'),{className:'part-name',textContent:name,title:name});
   const mute=document.createElement('label');mute.className='part-switch';mute.title='发声';
   const cb=Object.assign(document.createElement('input'),{type:'checkbox',checked:!settings.partMute[p.id]});cb.setAttribute('role','switch');cb.setAttribute('aria-label',`${name}发声`);
   cb.onchange=()=>applyPartMutes({...settings.partMute,[p.id]:!cb.checked});mute.append(cb);
   const sel=document.createElement('select');sel.setAttribute('aria-label',`${name}音色`);sel.add(new Option('默认音色',''));for(const [tid,label] of ScorePlayer.TIMBRE_LIST)sel.add(new Option(label,tid));sel.value=settings.partTimbres[p.id]||'';
   sel.onchange=()=>{if(sel.value)settings.partTimbres[p.id]=sel.value;else delete settings.partTimbres[p.id];save();fillPartMixer();restartIfPlaying()};
   const solo=document.createElement('button');solo.type='button';solo.textContent='只听';solo.setAttribute('aria-label',`只听${name}`);
   solo.onclick=()=>applyPartMutes(Object.fromEntries(parts.map(x=>[x.id,x.id!==p.id])));
   row.append(label,sel,solo,mute);box.append(row);
  }
 }
}
$('playPartScope').onchange=()=>{settings.partScope=$('playPartScope').value;save();fillPartMixer();restartIfPlaying()};
for(const [id,label] of ScorePlayer.TIMBRE_LIST)$('timbreSelect').add(new Option(label,id));
$('timbreSelect').onchange=()=>{settings.timbre=$('timbreSelect').value;save();syncTempoLabel();if(ScorePlayer.isPlaying())restartIfPlaying();else ScorePlayer.previewTimbre(settings.timbre)};
document.addEventListener('score-timbre-choice',({detail})=>{if(!ScorePlayer.TIMBRE_LIST.some(([id])=>id===detail.id))return;ScorePlayer.stop();settings.timbre=detail.id;save();fillSettings();syncTempoLabel();});
$('timbrePreview').onclick=()=>{if(ScorePlayer.isPlaying())ScorePlayer.stop();ScorePlayer.previewTimbre($('timbreSelect').value)};$('floatSettings').onclick=openSettings;
$('tempoRange').oninput=()=>{$('tempoValue').textContent=$('tempoRange').value;$('tempoName').textContent=ScorePlayer.tempoName(Number($('tempoRange').value));$('playTempo').value=$('tempoRange').value};
$('tempoRange').onchange=()=>setTempo($('tempoRange').value);
$('playTempo').onchange=()=>setTempo($('playTempo').value);
for(const b of dialog.querySelectorAll('[data-step]'))b.onclick=()=>setTempo(settings.tempo+Number(b.dataset.step));
let taps=[];$('tapTempo').onclick=()=>{const now=performance.now();taps=taps.filter(t=>now-t<2500);taps.push(now);if(taps.length>=2){const gaps=taps.slice(1).map((t,i)=>t-taps[i]).slice(-4);setTempo(60000/(gaps.reduce((a,b)=>a+b)/gaps.length),false)}};
const bindCheck=(id,key)=>{$(id).onchange=()=>{settings[key]=$(id).checked;save();fillSettings();syncTempoLabel();restartIfPlaying()}};
bindCheck('metroOn','metronome');bindCheck('metroAccent','accent');bindCheck('metroCountIn','countIn');$('playMelody').onchange=()=>{settings.muteMelody=!$('playMelody').checked;save();fillSettings();syncTempoLabel();restartIfPlaying()};
$('metroTime').onchange=()=>{settings.time=$('metroTime').value;save();restartIfPlaying()};
// Balance changes apply live (no restart).
$('mixBalance').oninput=()=>{settings.balance=Number($('mixBalance').value);fillSettings();ScorePlayer.setBalance(settings.balance)};$('mixBalance').onchange=()=>{settings.balance=Number($('mixBalance').value);save();ScorePlayer.setBalance(settings.balance)};
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});

// ---------- double tap: play from here ----------
function tokenAt(target){for(let el=target;el&&el!==document.body;el=el.parentNode)if(el._token)return el._token;return null}
let lastTap={t:0,x:0,y:0},startToken=null,hideTimer=0;
function showStartHere(x,y,token){
 startToken=token;const b=$('startHere');b.hidden=false;
 const w=b.offsetWidth||170;b.style.left=Math.min(innerWidth-w-8,Math.max(8,x-w/2))+'px';b.style.top=Math.max(8,y-64)+'px';
 clearTimeout(hideTimer);hideTimer=setTimeout(()=>{b.hidden=true},4000);
}
function onTap(e){
 if(perform)return; // taps turn pages in performance mode
 const token=tokenAt(e.target);if(!token||(token.t!=='note'&&token.t!=='rest'&&token.t!=='percussion')){lastTap.t=0;return}
 const now=performance.now();
 if(now-lastTap.t<380&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<30){lastTap.t=0;e.preventDefault();showStartHere(e.clientX,e.clientY,token);return}
 lastTap={t:now,x:e.clientX,y:e.clientY};
}
for(const id of ['scoreOutput','scorePreview','staffOutput','transOutput','viewerBody'])$(id).addEventListener('pointerup',onTap);
$('startHere').onclick=()=>{$('startHere').hidden=true;ScorePlayer.stop();startPlayback(startToken)};
document.addEventListener('pointerdown',e=>{if(e.target!==$('startHere')&&!tokenAt(e.target))$('startHere').hidden=true});

// ---------- PDF export: choose notation, key, bar numbers and erhu markings ----------
let pdfDlg=null;
function pdfDialog(){
 if(pdfDlg)return pdfDlg;
 const d=document.createElement('dialog');d.className='sheet pdf-sheet';d.setAttribute('aria-label','存为 PDF');
 d.innerHTML='<div class="sheet-body"><div class="sheet-head"><h2>存为 PDF</h2><button type="button" class="small-btn" data-close>关闭</button></div>'
  +'<div class="pdf-field"><span>记谱法</span><div class="app-segments" role="group" aria-label="记谱法"><button type="button" data-n="jp">简谱</button><button type="button" data-n="staff">五线谱</button></div></div>'
  +'<div class="pdf-field"><label for="pdfKey">调</label><select id="pdfKey"><option value="orig">原调</option><option value="fixed">音名谱（固定 1=C）</option><option value="trans">转调</option></select></div>'
  +'<p class="subtle pdf-trans-note"></p>'
  +'<label class="pdf-switch"><input type="checkbox" role="switch" id="pdfMeasures">小节号</label>'
  +'<label class="pdf-switch"><input type="checkbox" role="switch" id="pdfErhu">二胡指法与弓法</label>'
  +'<p class="subtle pdf-erhu-note">二胡标记只用于简谱的原调或转调。</p>'
  +'<div class="dialog-actions"><button type="button" class="primary" data-go>存 PDF</button></div></div>';
 document.body.append(d);
 d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d)d.close()});
 for(const b of d.querySelectorAll('[data-n]'))b.onclick=()=>{d.dataset.n=b.dataset.n;syncPdf()};
 d.querySelector('#pdfKey').onchange=syncPdf;
 d.querySelector('[data-go]').onclick=()=>{d.close();exportPdf()};
 return pdfDlg=d;
}
function syncPdf(){
 const d=pdfDlg,staff=d.dataset.n==='staff',key=d.querySelector('#pdfKey').value;
 for(const b of d.querySelectorAll('[data-n]'))b.setAttribute('aria-pressed',String(b.dataset.n===d.dataset.n));
 d.querySelector('.pdf-trans-note').textContent=key==='trans'?`转到 1=${KEY_NAMES[Number($('transKey').value)]}（${$('transMode').value==='move'?'整曲移调':'保持原音高'}），在「调」菜单里可改。`:'';
 const erhuOk=!staff&&key!=='fixed',e=d.querySelector('#pdfErhu');e.disabled=!erhuOk;if(!erhuOk)e.checked=false;
 d.querySelector('.pdf-erhu-note').hidden=erhuOk;
}
function openPdfDialog(){
 if(!lastConverted)return;const d=pdfDialog();
 d.dataset.n=view==='staff'||(view==='trans'&&transStaff())?'staff':'jp';
 d.querySelector('#pdfKey').value=view==='trans'?'trans':view==='flute'?'fixed':'orig';
 d.querySelector('#pdfMeasures').checked=measureOn;d.querySelector('#pdfErhu').checked=$('erhuFinger').checked;
 syncPdf();d.showModal();
}
function exportPdf(){
 const d=pdfDlg,staff=d.dataset.n==='staff',key=d.querySelector('#pdfKey').value,name=sheetTitle(lastConverted.source,'');
 const keepMeasure=measureOn,keepErhu=$('erhuFinger').checked;measureOn=d.querySelector('#pdfMeasures').checked;$('erhuFinger').checked=d.querySelector('#pdfErhu').checked;
 try{
  if(key==='trans'){
   const all=buildTransposed(),lines=F(all),k=KEY_NAMES[Number($('transKey').value)];
   if(!lines.some(l=>l.kind==='meta'&&l.name==='note'))lines.unshift({kind:'meta',name:'note',value:`原谱 1=${lastConverted.keyLabel} → 1=${k}${$('transMode').value==='move'?'（整曲移调）':''}`});
   const keepAll=transAllLines;transAllLines=all;
   const extra=staff?{partNames:scoreParts(),...scoreDisplayOptions(lines,'trans')}:erhuOpts(lines,'trans');transAllLines=keepAll;
   printScoreSheet(lines,`${name||'转调谱'} · 1=${k}${staff?' · 五线谱':''}`,$('transMode').value==='move'?`整曲移到 1=${k}`:`保持原音高，按 1=${k} 记谱`,staff?'staff':'jianpu',k,extra);
  }else if(staff){
   const lines=F(lastConverted.lines);
   printScoreSheet(lines,`${name||'乐谱'} · 五线谱`,$('conversionCaption').textContent,'staff',key==='fixed'?'C':lastConverted.keyLabel,{partNames:scoreParts(),...scoreDisplayOptions(lines,'staff')});
  }else if(key==='fixed'){
   const lines=F(lastConverted.lines);printScoreSheet(lines,`${name||'音名谱'} · 音名谱（固定 1=C）`,$('conversionCaption').textContent,'jianpu',undefined,{partNames:scoreParts(),...scoreDisplayOptions(lines,'flute')});
  }else{
   const lines=F(lastConverted.source.lines);printScoreSheet(lines,`${name||'简谱'} · 简谱`,'按乐谱文本排版的简谱','jianpu',undefined,erhuOpts(lines,'source'));
  }
 }finally{measureOn=keepMeasure;$('erhuFinger').checked=keepErhu}
}
$('printScore').onclick=openPdfDialog;

// ---------- edit mode (full-screen, side by side) ----------
// Text on the left, each line beside the row it draws (@page separators line up too); the preview on the right
// follows the viewer's notation × key (a staff preview is not row-aligned). Tapping a note selects its text and
// flashes it; moving the caret flashes the note. Edits re-render the preview live; playback works as in the viewer.
let vEdit=false,editTimer=0,editFocus=null;
async function openEditor(){
 if(!lastConverted)return;vEdit=true;$('scoreViewer').classList.add('editing');syncFloatPlayer();
 await openViewer();
}
const editLines=()=>$('scoreInput').value.replace(/\r\n?/g,'\n').split('\n');
function buildEditor(){
 if(!lastConverted)return; // text currently has an error: keep the last good preview and lines
 const body=$('viewerBody');body.className='viewer-body edit-body';body.replaceChildren();
 const scroll=document.createElement('div');scroll.className='edit-scroll';const grid=document.createElement('div');grid.className='edit-grid';
 const left=document.createElement('div');left.className='jp-score viewer-sheet edit-left';const right=document.createElement('div');right.className='edit-right';
 grid.append(left,right);scroll.append(grid);body.append(scroll);
 // The preview follows the viewer's notation × key. Converted lines drop @octave rows, so map them back to text lines.
 const src=lastConverted.source.lines,v=vView,trans=v==='trans'&&transAllLines,lines=trans?transAllLines:v==='source'?src:lastConverted.lines;
 const srcIndex=src.map((l,i)=>i).filter(i=>!(src[i].kind==='meta'&&src[i].name==='octave')),indexOf=l=>{const k=lines.indexOf(l);return k<0?-1:lines===src?k:srcIndex[k]??-1};
 const text=editLines();
 if(isStaff(v)){
  left.classList.remove('jp-score');left.classList.add('edit-staff');
  Staff.render(left,lines,{keyLabel:staffKey(v),partNames:scoreParts(),...scoreDisplayOptions(lines,v==='trans'?'trans':'staff')}).catch(error=>{left.textContent='五线谱无法显示：'+error.message});
  buildEditorFromText(text,true);$('viewerEditStatus').textContent='五线谱预览不与文字逐行对齐；改完自动重排';$('viewerEditStatus').classList.remove('error');return;
 }
 Jianpu.render(left,lines,erhuOpts(lines,v,{minFont:12}));
 if(lines!==src)for(const l of lines)if(l.kind==='music')for(const t of l.tokens){for(const n of t.t==='chord'?t.notes:[t])if(n.src)n.src._editCell=n._cell}
 // Blocks: each rendered row with the text lines it came from; lines that draw nothing join the block before them.
 const blocks=[...left.children].filter(el=>el._src&&!el.classList.contains('jp-overlay')).map(el=>({el,idx:el._src.map(indexOf).filter(i=>i>=0)})).filter(b=>b.idx.length).sort((a,b)=>Math.min(...a.idx)-Math.min(...b.idx));
 if(!blocks.length)return;
 const owner=new Array(text.length);
 for(let i=0;i<text.length;i++){let k=0;for(let j=0;j<blocks.length;j++)if(Math.min(...blocks[j].idx)<=i)k=j;owner[i]=k}
 blocks.forEach(b=>b.lines=[]);owner.forEach((k,i)=>blocks[k].lines.push(i));
 const inputs=[];
 for(const b of blocks){
  b.box=document.createElement('div');b.box.className='edit-block';right.append(b.box);
  for(const i of b.lines){const inp=document.createElement('input');inp.className='edit-line';inp.value=text[i];inp.dataset.i=i;inp.spellcheck=false;inp.autocomplete='off';inp.setAttribute('autocapitalize','off');
   if(/^\s*$/.test(text[i]))inp.classList.add('blank');else if(/^\s*@/.test(text[i]))inp.classList.add('meta');
   b.box.append(numbered(inp,i));inputs[i]=inp}
 }
 // Align: a row is as tall as the taller side; then place each text block at its row's top.
 const lineH=30;
 for(const b of blocks){const need=b.lines.length*lineH;if(b.el.offsetHeight<need)b.el.style.minHeight=need+'px'}
 Jianpu.redraw(left);
 blocks.forEach(b=>{b.box.style.top=b.el.offsetTop+'px';b.box.style.height=Math.max(b.lines.length*lineH,b.el.offsetHeight)+'px'});
 right.style.minHeight=left.scrollHeight+'px';
 for(const inp of inputs.filter(Boolean)){
  inp.oninput=()=>{clearTimeout(editTimer);editTimer=setTimeout(flushEdit,450)};
  inp.onkeydown=e=>editKey(e,inp);
  inp.onkeyup=inp.onclick=()=>caretFlash(inp);
 }
 if(editFocus){const inp=inputs[editFocus.i];if(inp){inp.focus({preventScroll:true});inp.setSelectionRange(editFocus.pos,editFocus.pos)}editFocus=null}
 $('viewerEditStatus').textContent='点右边谱面上的音，左边对应的文字会选中；改完自动重排';$('viewerEditStatus').classList.remove('error','jump');
 // A rebuild (resize, view switch) while the text has an error keeps the error visible.
 if(!$('scoreError').hidden&&$('scoreError').textContent){$('viewerEditStatus').textContent=$('scoreError').textContent;$('viewerEditStatus').classList.add('error');markEditError()}
}
// Each text line sits in a row that shows its line number (as in the workbench text pane).
function numbered(inp,i){const row=document.createElement('div');row.className='edit-row';row.dataset.n=i+1;row.append(inp);return row}
function editText(){return [...$('viewerBody').querySelectorAll('.edit-line')].sort((a,b)=>a.dataset.i-b.dataset.i).map(i=>i.value).join('\n')}
// Writes the edited text back to the score input; on a format error the left side keeps the last good version.
function flushEdit(){
 if(!vEdit)return;const inputs=$('viewerBody').querySelectorAll('.edit-line');if(!inputs.length)return;
 const text=editText();if(text===$('scoreInput').value)return;
 const a=document.activeElement;if(a?.classList?.contains('edit-line'))editFocus={i:Number(a.dataset.i),pos:a.selectionStart};
 $('scoreInput').value=text;updateScore();
 if(!$('scoreError').hidden&&$('scoreError').textContent){$('viewerEditStatus').textContent=$('scoreError').textContent;$('viewerEditStatus').classList.add('error');editFocus=null;markEditError();return}
 if(ScorePlayer.isPlaying())ScorePlayer.stop();buildEditor();
}
// Enter splits a line, Backspace at the start joins it to the previous one, ↑ / ↓ move between lines.
function editKey(e,inp){
 const i=Number(inp.dataset.i),lines=editText().split('\n'),pos=inp.selectionStart;
 const move=d=>{const t=$('viewerBody').querySelector(`.edit-line[data-i="${i+d}"]`);if(t){e.preventDefault();t.focus();const p=Math.min(pos,t.value.length);t.setSelectionRange(p,p);caretFlash(t)}};
 if(e.key==='ArrowUp')return move(-1);if(e.key==='ArrowDown')return move(1);
 if(e.key==='Enter'){e.preventDefault();lines.splice(i,1,inp.value.slice(0,pos),inp.value.slice(inp.selectionEnd));editFocus={i:i+1,pos:0};commitLines(lines);return}
 if(e.key==='Backspace'&&pos===0&&inp.selectionEnd===0&&i>0){e.preventDefault();const prev=lines[i-1].length;lines.splice(i-1,2,lines[i-1]+lines[i]);editFocus={i:i-1,pos:prev};commitLines(lines)}
}
function commitLines(lines){
 clearTimeout(editTimer);const keep=editFocus;$('scoreInput').value=lines.join('\n');updateScore();
 if(!$('scoreError').hidden&&$('scoreError').textContent){$('viewerEditStatus').textContent=$('scoreError').textContent;$('viewerEditStatus').classList.add('error')}
 editFocus=keep;buildEditorFromText(lines);markEditError();
}
// Format error: mark its text line red (as in the design); tapping the status jumps to it.
function markEditError(){
 const body=$('viewerBody');for(const e of body.querySelectorAll('.edit-line.has-error'))e.classList.remove('has-error');
 const msg=$('scoreError').hidden?'':$('scoreError').textContent,m=msg.match(/第\s*(\d+)\s*行/),inp=m&&body.querySelector(`.edit-line[data-i="${Number(m[1])-1}"]`);
 if(inp)inp.classList.add('has-error');$('viewerEditStatus').classList.toggle('jump',!!inp);
}
$('viewerEditStatus').addEventListener('click',()=>{const inp=$('viewerBody').querySelector('.edit-line.has-error');if(inp){inp.focus();inp.scrollIntoView({block:'center'})}});
// When the text does not parse, still rebuild the right side so lines match what was typed.
function buildEditorFromText(lines,force=false){
 if(!force&&($('scoreError').hidden||!$('scoreError').textContent)){buildEditor();return}
 const right=$('viewerBody').querySelector('.edit-right');if(!right)return;
 const box=document.createElement('div');box.className='edit-block plain';
 lines.forEach((t,i)=>{const inp=document.createElement('input');inp.className='edit-line';inp.value=t;inp.dataset.i=i;inp.spellcheck=false;inp.oninput=()=>{clearTimeout(editTimer);editTimer=setTimeout(flushEdit,450)};inp.onkeydown=e=>editKey(e,inp);box.append(numbered(inp,i))});
 box.querySelectorAll('.edit-line').forEach(inp=>{inp.onkeyup=inp.onclick=()=>caretFlash(inp)});
 right.replaceChildren(box);right.style.height='auto';
 if(editFocus){const inp=box.querySelector(`.edit-line[data-i="${editFocus.i}"]`);inp?.focus();inp?.setSelectionRange(editFocus.pos,editFocus.pos);editFocus=null}
}
// Source tokens of a text line, in column order (spaces dropped).
function lineTokens(i){
 const l=lastConverted?.source.lines[i];if(!l||l.kind!=='music')return [];
 return l.tokens.filter(t=>t.t!=='space'&&t.col!=null).sort((a,b)=>a.col-b.col);
}
function flash(el,cls='edit-flash',ms=2500){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);clearTimeout(el._flashT);el._flashT=setTimeout(()=>el.classList.remove(cls),ms)}
// Tap on a note (left): select its text on the right for a few seconds.
function editSelect(token){
 const src=token.src||token,i=(src.line??0)-1,inp=$('viewerBody').querySelector(`.edit-line[data-i="${i}"]`);if(!inp)return;
 const toks=lineTokens(i),k=toks.indexOf(src),end=k>=0&&k+1<toks.length?toks[k+1].col:inp.value.length;
 let stop=end;while(stop>src.col&&/\s/.test(inp.value[stop-1]))stop--;
 inp.focus({preventScroll:true});inp.setSelectionRange(src.col,stop);inp.scrollIntoView({block:'nearest'});
 flash(inp);flash(token._cell||src._cell,'edit-flash-note');
}
// Caret moved on the right: flash the note under it on the left.
function caretFlash(inp){
 const i=Number(inp.dataset.i),toks=lineTokens(i),pos=inp.selectionStart;let hit=null;
 for(const t of toks)if(t.col<=pos)hit=t;else break;
 const cell=[hit?._editCell,hit?._cell].find(c=>c?.isConnected&&$('viewerBody').contains(c));
 if(cell){flash(cell,'edit-flash-note',1500);cell.scrollIntoView({block:'nearest'})}
}
$('viewerBody').addEventListener('click',e=>{if(!vEdit)return;const t=tokenAt(e.target);if(t&&t.t!=='bar')editSelect(t)});

// ---------- full-screen viewer ----------
let viewerOpen=false,vView='flute',vPages=[],vIndex=0,vHighlight=[],savedScroll=0,viewerRenderId=0;
// Layout preference; "auto" shows two pages in landscape and one page in portrait. vLayout is the layout in use.
let vLayoutPref=(()=>{try{return localStorage.getItem('flute.viewerLayout.v2')||'auto'}catch{return 'auto'}})(),vLayout='page';
function applyLayout(){vLayout=vLayoutPref==='auto'?(innerWidth>innerHeight?'two':'page'):vLayoutPref}
// Continuous layout ignores fixed pages; full-score separators still delimit systems. followHold pauses auto page turning after a
// manual page turn until playback reaches the pages on screen.
let vReflow=(()=>{try{return localStorage.getItem('flute.viewerReflow')!=='0'}catch{return true}})(),followHold=false;
const vLines=()=>vView==='trans'?transLines:vView==='source'?F(lastConverted.source.lines):F(lastConverted.lines);
function splitExplicit(lines){
 const pages=[[]];for(const l of lines){if(l.kind==='page'){const current=pages[pages.length-1];if(current.some(x=>x.kind==='music')){let last=current.length-1;while(last>=0&&current[last].kind!=='music')last--;pages.push(current.splice(last+1))}continue}pages[pages.length-1].push(l)}
 return pages.filter(p=>p.some(l=>l.kind==='music'));
}
function box(){
 const b=$('viewerBody'),css=getComputedStyle(b),n=v=>parseFloat(v)||0;
 const w=Math.max(1,b.clientWidth-n(css.paddingLeft)-n(css.paddingRight)),h=Math.max(1,b.clientHeight-n(css.paddingTop)-n(css.paddingBottom));
 return vLayout==='two'?{w:Math.max(1,(w-n(css.columnGap||css.gap))/2),h}:{w,h};
}
function reflowLines(lines){
 const full=new Set(lines.filter(l=>l.kind==='music'&&l.part).map(l=>l.part)).size>1;
 return full?lines.map(l=>l.kind==='page'?{kind:'blank'}:l):lines.filter(l=>l.kind!=='page'&&l.kind!=='blank');
}
function paginateStaffLines(lines,per){
 const pages=[];let cur=[],count=0,pending=[];
 for(const block of Jianpu.groupSystems(lines)){
  const music=block.lines.filter(l=>l.kind==='music').length;
  if(!music){pending.push(...block.lines);continue}
  if(count&&count+music>per){pages.push(cur);cur=[];count=0}
  cur.push(...pending,...block.lines);pending=[];count+=music;
 }
 cur.push(...pending);
 if(count||!pages.length)pages.push(cur);else if(cur.length)pages[pages.length-1].push(...cur);
 return pages;
}
// Packs rendered rows at their final width-constrained font, keeping each full-score system intact.
let vFont=null;
function numberedProbe(lines,w,font){
 const probe=document.createElement('div');probe.className='jp-score viewer-sheet jp-probe';probe.style.fontSize=font+'px';probe.style.width=w+'px';document.body.append(probe);
 Jianpu.render(probe,lines,erhuOpts(lines,vView,{fit:false}));return probe;
}
function widthFont(lines,w){
 const probe=numberedProbe(lines,w,22);probe.style.width='max-content';
 for(const r of probe.querySelectorAll(':scope>.jp-line')){r.style.minWidth='0';r.classList.remove('jp-justify')}
 const natural=Math.max(1,probe.getBoundingClientRect().width-12);probe.remove();
 return Math.max(10,Math.min(48,22*(w-12)/natural*.98));
}
function paginate(){
 const {w,h}=box(),out=[];
 const source=vReflow?[reflowLines(vLines())]:splitExplicit(vLines());
 vFont=null;if(vLayout==='width')return source;
 if(!isStaff(vView))vFont=Math.min(...source.map(lines=>widthFont(lines,w)));
 for(const part of source){
  if(isStaff(vView)){const per=Math.max(2,Math.floor(h/Math.max(70,w*0.13)));out.push(...paginateStaffLines(part,per));continue}
  // Re-render at the final size: measure alignment, borders and minimum-width underlines are not purely scalable.
  const probe=numberedProbe(part,w,vFont);
  let cur=[],used=0,pending=[],pendingHeight=0;
  for(const row of [...probe.children].filter(c=>c._src)){
   const css=getComputedStyle(row),rh=row.getBoundingClientRect().height+(parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0);
   if(!row._src.some(l=>l.kind==='music')){pending.push(...row._src);pendingHeight+=rh;continue}
   if(cur.some(l=>l.kind==='music')&&used+pendingHeight+rh>h-4){out.push(cur);cur=[];used=0}
   cur.push(...pending,...row._src);used+=pendingHeight+rh;pending=[];pendingHeight=0;
  }
  cur.push(...pending);if(cur.length)out.push(cur);probe.remove();
 }
 return out.length?out:[vLines()];
}
// Font is fixed before packing, so fitting a dense row never leaves already-paginated pages half empty.
function computeFont(){if(isStaff(vView)||vLayout==='width')vFont=null}
async function drawPage(host,lines,endsPiece=true){
 const {w,h}=box();host.replaceChildren();host.style.width=w+'px';host.style.height=h+'px';
 if(isStaff(vView)){const inner=document.createElement('div');host.append(inner);await Staff.render(inner,lines,{keyLabel:staffKey(vView),partNames:scoreParts(),...scoreDisplayOptions(lines,vView),width:w,responsive:false});const sw=Math.max(inner.scrollWidth,inner.getBoundingClientRect().width,1),sh=Math.max(inner.scrollHeight,inner.getBoundingClientRect().height,1),k=Math.min((w-4)/sw,(h-4)/sh,1.6);const frame=document.createElement('div');frame.style.cssText=`position:relative;width:${sw*k}px;height:${sh*k}px`;host.append(frame);frame.append(inner);inner.style.cssText=`position:absolute;left:0;top:0;width:${sw}px;transform-origin:top left;transform:scale(${k})`;return}
 const sheet=document.createElement('div');sheet.className='jp-score viewer-sheet';host.append(sheet);sheet.style.fontSize='22px';
 Jianpu.render(sheet,lines,erhuOpts(lines,vView,{fit:false}));
 sheet.style.width='max-content';for(const r of sheet.querySelectorAll(':scope>.jp-line'))r.style.minWidth='0';
 const cw=sheet.getBoundingClientRect().width||1,ch=sheet.scrollHeight||1,k=Math.min((w-12)/cw,h/ch)*0.98;
 sheet.style.width='';for(const r of sheet.querySelectorAll(':scope>.jp-line'))r.style.minWidth='';
 sheet.style.fontSize=(vFont??Math.max(10,Math.min(48,22*k)))+'px';sheet._endsPiece=endsPiece;Jianpu.justify(sheet,endsPiece);Jianpu.redraw(sheet);
}
async function showPage(i){
 const renderId=++viewerRenderId;
 const step=vLayout==='two'?2:1;vIndex=Math.max(0,Math.min(i,Math.max(0,vPages.length-1)));if(vLayout==='two')vIndex-=vIndex%2;
 const startIndex=vIndex,pages=vPages;
 const body=$('viewerBody');body.replaceChildren();body.className='viewer-body layout-'+vLayout;
 if(vLayout==='width'){
  const sheet=document.createElement('div');body.append(sheet);
  if(isStaff(vView))await Staff.render(sheet,vLines(),{keyLabel:staffKey(vView),partNames:scoreParts(),...scoreDisplayOptions(vLines(),vView),width:body.clientWidth-24});
  else{sheet.className='jp-score viewer-sheet';sheet.style.fontSize='30px';Jianpu.render(sheet,vLines(),erhuOpts(vLines(),vView))}
  if(renderId!==viewerRenderId)return;
  $('viewerPage').textContent='';$('viewerPrev').disabled=$('viewerNext').disabled=true;return;
 }
 for(let k=0;k<step&&startIndex+k<pages.length;k++){if(renderId!==viewerRenderId)return;const page=document.createElement('div');page.className='viewer-page';page.setAttribute('aria-label',`第 ${startIndex+k+1} 页`);body.append(page);await drawPage(page,pages[startIndex+k],startIndex+k===pages.length-1);if(renderId!==viewerRenderId)return}
 const last=Math.min(vPages.length,vIndex+step);$('viewerPage').textContent=`${vIndex+1}${last>vIndex+1?'–'+last:''} / ${vPages.length}`;$('performPage').textContent=$('viewerPage').textContent;
 $('viewerPrev').disabled=vIndex===0;$('viewerNext').disabled=last>=vPages.length;
}
async function rebuild(keep=0){if(!viewerOpen)return;if(vEdit){buildEditor();return}vPages=paginate();computeFont();await showPage(keep)}
// The erhu toggle in the viewer mirrors the card's switch and only shows for the numbered original / transposed views.
function syncViewerErhu(){fillErhuParts();$('viewerErhuParts').hidden||=!(vView==='source'||vView==='trans');$('viewerErhuWrap').hidden=!(vView==='source'||vView==='trans');$('viewerErhu').checked=$('erhuFinger').checked}
$('viewerErhu').onchange=()=>{$('erhuFinger').checked=$('viewerErhu').checked;$('erhuFinger').onchange();rebuild(vIndex)};
function setViewerView(v){if(ScorePlayer.isPlaying())ScorePlayer.stop();vView=v;for(const [k,id] of Object.entries(VIEWER_BUTTONS))$(id).setAttribute('aria-pressed',String(k===v));syncViewerErhu();rebuild(0)}
async function openViewer(){
 if(!(lastConverted?.notes.length||lastConverted?.percussionCount))return;savedScroll=scrollY;viewerOpen=true;$('scoreViewer').hidden=false;document.body.classList.add('viewer-open');
 $('viewerLayout').value=vLayoutPref;applyLayout();vView=view;syncViewerErhu();for(const [k,id] of Object.entries(VIEWER_BUTTONS))$(id).setAttribute('aria-pressed',String(k===vView));
 await new Promise(r=>requestAnimationFrame(r));await rebuild(0);
}
function closeViewer(){
 viewerRenderId++;
 if(perform)setPerform(false);
 if(vEdit){vEdit=false;$('scoreViewer').classList.remove('editing');clearTimeout(editTimer);flushEdit()}
 viewerOpen=false;$('scoreViewer').hidden=true;document.body.classList.remove('viewer-open');$('viewerBody').replaceChildren();clearViewerHighlight();
 syncFloatPlayer();
 // The viewer re-rendered tokens into its own cells; draw the card again so highlights land there.
 renderMain();scrollTo(0,savedScroll);
}
function clearViewerHighlight(){for(const el of vHighlight)el.classList.remove('jp-playing');vHighlight=[]}
function pageOf(token){
 const want=vView==='source'?token.src||token:token;
 return vPages.findIndex(p=>p.some(l=>l.kind==='music'&&l.tokens.includes(want)));
}
let turning=false;
async function followInViewer(token){
 if(vEdit){const el=[token._cell,token.src?._editCell,token.src?._cell].find(c=>c?.isConnected&&$('viewerBody').contains(c));clearViewerHighlight();if(el?.isConnected){el.classList.add('jp-playing');vHighlight.push(el);if(!followHold)el.scrollIntoView({block:'nearest'})}return}
 if(vLayout==='width'){const el=(vView==='source'?token.src?._cell:isStaff(vView)?token._staffEls?.[0]:token._cell);el?.scrollIntoView?.({block:'center',behavior:'smooth'});return}
 const p=pageOf(token);if(p<0||turning)return;
 const step=vLayout==='two'?2:1,onScreen=p>=vIndex&&p<vIndex+step;
 if(followHold){if(onScreen)followHold=false;else{clearViewerHighlight();return}}
 if(!onScreen){turning=true;await showPage(p);turning=false}
 clearViewerHighlight();
 const els=isStaff(vView)?token._staffEls||[]:[vView==='source'?token.src?._cell:token._cell].filter(Boolean);
 for(const el of els)if(el.isConnected){el.classList.add('jp-playing');vHighlight.push(el)}
}
// Performance mode: toolbar hidden, system bars hidden and screen kept on (Android); tap the left or right half
// of the page to turn back or forward.
let perform=false;
function setPerform(on){
 perform=on;syncFloatPlayer();$('startHere').hidden=true;$('scoreViewer').classList.toggle('perform',on);$('performExit').hidden=!on;
 Platform.setImmersive(on).catch(()=>{})
 setTimeout(()=>rebuild(vIndex),on?320:320);
}
$('viewerPerform').onclick=()=>setPerform(true);$('performExit').onclick=e=>{e.stopPropagation();setPerform(false)};
$('viewerBody').addEventListener('click',e=>{
 if(!perform||vLayout==='width')return;
 (e.clientX<innerWidth/2?$('viewerPrev'):$('viewerNext')).click();
});
window.openScoreViewer=async()=>{setView('source');await openViewer()};
$('fullView').onclick=openViewer;$('editView').onclick=openEditor;$('viewerClose').onclick=closeViewer;
$('viewerTrans').onclick=()=>setViewerView('trans');$('viewerFlute').onclick=()=>setViewerView('flute');$('viewerSource').onclick=()=>setViewerView('source');$('viewerStaff').onclick=()=>setViewerView('staff');
$('viewerLayout').onchange=()=>{vLayoutPref=$('viewerLayout').value;try{localStorage.setItem('flute.viewerLayout.v2',vLayoutPref)}catch{}applyLayout();rebuild(vIndex)};
$('viewerPrev').onclick=()=>{followHold=ScorePlayer.isPlaying();showPage(vIndex-(vLayout==='two'?2:1))};$('viewerNext').onclick=()=>{followHold=ScorePlayer.isPlaying();showPage(vIndex+(vLayout==='two'?2:1))};
$('viewerReflow').checked=vReflow;$('viewerReflow').onchange=()=>{vReflow=$('viewerReflow').checked;try{localStorage.setItem('flute.viewerReflow',vReflow?'1':'0')}catch{}rebuild(0)};
document.addEventListener('keydown',e=>{if(!viewerOpen)return;if(e.key==='Escape')closeViewer();if(vEdit&&e.target.closest?.('input,textarea,select'))return;if(vEdit&&e.key!==' ')return;if(e.key==='ArrowRight'||e.key==='PageDown')$('viewerNext').click();if(e.key==='ArrowLeft'||e.key==='PageUp')$('viewerPrev').click();if(e.key===' '){e.preventDefault();toggle()}});
let swipe=null;$('viewerBody').addEventListener('touchstart',e=>{swipe=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null},{passive:true});
$('viewerBody').addEventListener('touchend',e=>{if(!swipe||vLayout==='width'||vEdit)return;const t=e.changedTouches[0],dx=t.clientX-swipe.x,dy=t.clientY-swipe.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)(dx<0?$('viewerNext'):$('viewerPrev')).click();swipe=null});
// In edit mode only a width change re-lays out (the on-screen keyboard changes the height while typing).
let resizeTimer=0,lastW=innerWidth;addEventListener('resize',()=>{if(!viewerOpen)return;if(vEdit&&innerWidth===lastW)return;lastW=innerWidth;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{applyLayout();rebuild(vIndex)},250)});
// Android back button closes the viewer first.
window.handleAppBack=()=>{const modal=[...document.querySelectorAll('dialog[open]')].at(-1);if(modal){modal.close();return true}if($('erhuPartDialog').open){$('erhuPartDialog').close();return true}if($('partDisplayDialog').open){$('partDisplayDialog').close();return true}if(dialog.open){dialog.close();return true}if(viewerOpen&&perform){setPerform(false);return true}if(viewerOpen){closeViewer();return true}if(!$('startHere').hidden){$('startHere').hidden=true;return true}return false};

setView(view);syncTempoLabel();if(lastConverted)window.onScoreConverted();
})();
// Modified by AI on 2026-10-11 10:46:46
