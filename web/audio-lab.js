'use strict';
(() => {
const $=id=>document.getElementById(id),dialog=$('audioLabDialog');if(!dialog)return;
const families=[
 {id:'flute',label:'笛子',choices:[['flute','现有长笛','原来的轻量合成音色。'],['faust_flute_clear','Faust A · 清晰','气流与管体反馈，起音较清楚。'],['faust_flute_airy','Faust B · 气息','同一管笛模型，增加气息和柔和起音。']]},
 {id:'erhu',label:'二胡',choices:[['erhu','现有二胡','原来的谐波、弓噪与琴体滤波。'],['faust_erhu_warm','Faust A · 柔和','弓与弦相互作用，较柔和的共鸣。'],['faust_erhu_bright','Faust B · 明亮','改变弓压、弓位，起音更鲜明。']]},
 {id:'yangqin',label:'扬琴',choices:[['yangqin','现有敲弦','轻量谐波敲弦，与新模型作对照。'],['faust_yangqin_soft','Faust A · 圆润','多阶弦振动共鸣，较长的自然衰减。'],['faust_yangqin_crisp','Faust B · 清脆','不同敲击位置，较短、清脆的衰减。']]},
 {id:'piano',label:'钢琴',choices:[['piano','现有钢琴','原来的非谐性分音与琴槌合成。'],['faust_piano_soft','Faust A · 柔软','柔软琴槌、双弦与音板共鸣。'],['faust_piano_bright','Faust B · 明亮','较硬琴槌，更清晰的高频分音。']]},
 {id:'guzheng',label:'古筝',choices:[['guzheng','现有古筝','原来的拨弦位置与谐波合成。'],['faust_guzheng_round','Faust A · 圆润','弦内传播与琴码损耗，较圆润的拨弦。'],['faust_guzheng_bright','Faust B · 明亮','调整拨弦位置，带更明亮的泛音。']]},
 {id:'clarinet',label:'单簧管',choices:[['clarinet','现有单簧管','原来的奇数谐波、气息与管体滤波。'],['faust_clarinet_wood','Faust A · 木质','簧片与管体反馈，偏柔和木质音。'],['faust_clarinet_bright','Faust B · 明亮','调整簧片硬度与气压，音色更明亮。']]},
];
let family=families[0],playing='',epoch=0;
const status=text=>{$('audioLabStatus').textContent=text};
function stop(){epoch++;playing='';ScorePlayer.stop();for(const b of $('audioLabChoices').querySelectorAll('[data-listen]')){b.textContent='试听';b.setAttribute('aria-pressed','false')}}
function render(){
 const selected=ScorePlayer.loadSettings().timbre;
 for(const b of $('audioLabFamilies').children)b.setAttribute('aria-pressed',String(b.dataset.family===family.id));
 $('audioLabChoices').replaceChildren();
 for(const [id,label,description] of family.choices){
  const card=document.createElement('article');card.className='audio-choice';card.dataset.timbre=id;
  const heading=document.createElement('h3');heading.textContent=label;if(window.FaustEngine?.recommended?.[family.id]===id){const badge=document.createElement('span');badge.className='audio-recommended';badge.textContent='推荐';heading.append(badge)};
  const info=document.createElement('p');info.className='subtle';info.textContent=description;
  const actions=document.createElement('div');actions.className='audio-choice-actions';
  const listen=document.createElement('button');listen.type='button';listen.textContent='试听';listen.dataset.listen=id;listen.className='primary';listen.setAttribute('aria-pressed','false');listen.setAttribute('aria-label','试听 '+label);
  const supported=!id.startsWith('faust_')||window.FaustEngine?.available;listen.disabled=!supported;
  listen.onclick=async()=>{
   if(playing===id){stop();status('已停止。');return}
   stop();const mine=epoch;playing=id;listen.textContent='准备中…';listen.setAttribute('aria-pressed','true');status('正在准备 '+label+'…');
   const ok=await ScorePlayer.previewTimbre(id,.85,{phrase:$('audioLabPhrase').value,dry:$('audioLabDry').checked,onEnd:()=>{if(mine===epoch){playing='';listen.textContent='试听';listen.setAttribute('aria-pressed','false');status('试听结束，可以对比其他音色。')}}});
   if(mine!==epoch)return;listen.textContent=ok?'停止':'试听';status(ok?'正在试听：'+label+( $('audioLabDry').checked?' · 干声':' · 带混响'):'试听失败，请重试。');
  };
  const use=document.createElement('button');use.type='button';use.dataset.use=id;use.textContent=selected===id?'当前默认':'用作默认';use.disabled=!supported;use.setAttribute('aria-label','使用 '+label+' 作为默认音色');
  use.onclick=()=>{stop();document.dispatchEvent(new CustomEvent('score-timbre-choice',{detail:{id}}));render();status('默认音色已设为 '+label+'。总谱里已单独指定的声部保留自己的音色。')};
  actions.append(listen,use);card.append(heading,info,actions);$('audioLabChoices').append(card);
 }
 if(!window.FaustEngine?.available)status('设备暂不支持 Faust 音色，现有音色仍可试听。');
}
for(const f of families){const b=document.createElement('button');b.type='button';b.dataset.family=f.id;b.textContent=f.label;b.onclick=()=>{stop();family=f;render();status('选择一种音色开始试听。')};$('audioLabFamilies').append(b)}
function open(){stop();const saved=ScorePlayer.loadSettings().timbre;family=families.find(f=>f.choices.some(([id])=>id===saved))||families[0];render();status('选择一种音色开始试听。');dialog.showModal()}
for(const id of ['settingsAudioLab','playAudioLab'])if($(id))$(id).onclick=open;
$('audioLabClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{stop();status('选择一种音色开始试听。')});
$('audioLabStop').onclick=()=>{stop();status('已停止。')};
for(const id of ['audioLabPhrase','audioLabDry'])$(id).onchange=()=>{stop();status('已切换试听设置，点音色重新试听。')};
window.AudioLab={open,families};
})();
// Modified by AI on 2026-10-10 14:11:09
