'use strict';
(() => {
const $=id=>document.getElementById(id),dialog=$('audioLabDialog');if(!dialog)return;
const descriptions={flute:'柔和的气息与管体共鸣。',erhu:'温暖的弓弦音色。',yangqin:'圆润的敲弦音色。',guzheng:'清楚的拨弦起音与自然余韵。',piano:'柔和的起音与清晰的琴弦共鸣。',oboe:'明亮的簧片音色。',clarinet:'柔和的管体共鸣与气息。'};
let playing='',epoch=0;
const status=text=>{$('audioLabStatus').textContent=text};
function stop(){epoch++;playing='';ScorePlayer.stop();for(const b of $('audioLabChoices').querySelectorAll('[data-listen]')){b.textContent='试听';b.setAttribute('aria-pressed','false')}}
function render(){
 const selected=ScorePlayer.loadSettings().timbre;
 $('audioLabChoices').replaceChildren();
 for(const [id,label] of ScorePlayer.TIMBRE_LIST){
  const card=document.createElement('article');card.className='audio-choice';card.dataset.timbre=id;
  const heading=document.createElement('h3');heading.textContent=label;
  const info=document.createElement('p');info.className='subtle';info.textContent=descriptions[id];
  const actions=document.createElement('div');actions.className='audio-choice-actions';
  const listen=document.createElement('button');listen.type='button';listen.textContent='试听';listen.dataset.listen=id;listen.className='primary';listen.setAttribute('aria-pressed','false');listen.setAttribute('aria-label','试听 '+label);
  const supported=!!window.FaustEngine?.available;listen.disabled=!supported;
  listen.onclick=async()=>{
   if(playing===id){stop();status('已停止。');return}
   stop();const mine=epoch;playing=id;listen.textContent='准备中…';listen.setAttribute('aria-pressed','true');status('正在准备 '+label+'…');
   const ok=await ScorePlayer.previewTimbre(id,.85,{phrase:$('audioLabPhrase').value,dry:$('audioLabDry').checked,onEnd:()=>{if(mine===epoch){playing='';listen.textContent='试听';listen.setAttribute('aria-pressed','false');status('试听结束，可以选择其他乐器。')}}});
   if(mine!==epoch)return;listen.textContent=ok?'停止':'试听';status(ok?'正在试听：'+label+($('audioLabDry').checked?' · 干声':' · 带混响'):'试听失败，请重试。');
  };
  const use=document.createElement('button');use.type='button';use.dataset.use=id;use.textContent=selected===id?'当前默认':'用作默认';use.disabled=!supported;use.setAttribute('aria-label','使用 '+label+' 作为默认音色');
  use.onclick=()=>{stop();document.dispatchEvent(new CustomEvent('score-timbre-choice',{detail:{id}}));render();status('默认音色已设为 '+label+'。总谱中已指定乐器的声部保留各自设置。')};
  actions.append(listen,use);card.append(heading,info,actions);$('audioLabChoices').append(card);
 }
 if(!window.FaustEngine?.available)status('音色未能加载，请重新打开应用。');
}
function open(){stop();render();status(window.FaustEngine?.available?'选择一种乐器开始试听。':'音色未能加载，请重新打开应用。');dialog.showModal()}
for(const id of ['settingsAudioLab','playAudioLab'])if($(id))$(id).onclick=open;
$('audioLabClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{stop();status('选择一种乐器开始试听。')});
$('audioLabStop').onclick=()=>{stop();status('已停止。')};
for(const id of ['audioLabPhrase','audioLabDry'])$(id).onchange=()=>{stop();status('已切换试听设置，点乐器重新试听。')};
window.AudioLab={open};
})();
// Modified by AI on 2026-10-10 15:13:29
