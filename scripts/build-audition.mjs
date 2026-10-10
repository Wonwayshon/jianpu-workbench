// A portable, offline audition page containing exactly the App's synthesis and audition UI.
import fs from 'node:fs';
import {read,mark,root} from './build.mjs';
import path from 'node:path';
const html=read('web/index.html'),dialog=html.match(/<dialog id="audioLabDialog"[\s\S]*?<\/dialog>/)[0];
const js=p=>read(p).replace(/\/\/ Modified by AI on .*\n?/g,'');
const bank=js('web/vendor/faust/models.js'),engine=js('web/faust-engine.js');
const worker="'use strict';self.window=self;\n"+bank+engine+"\nself.onmessage=({data:r})=>{try{const data=FaustEngine.render(r.timbre,r.midi,r.dur,r.sr,r.fromMidi,{grace:r.grace});self.postMessage({id:r.id,data},[data.buffer])}catch(e){self.postMessage({id:r.id,error:e.message})}};";
const boot='window.FaustWorkerURL=URL.createObjectURL(new Blob(['+JSON.stringify(worker)+'],{type:"application/javascript"}));';
const scripts=[bank,engine,boot,js('web/synth.js'),js('web/player.js'),js('web/audio-lab.js'),`document.addEventListener('score-timbre-choice',({detail})=>{ScorePlayer.saveSettings({...ScorePlayer.loadSettings(),timbre:detail.id})});AudioLab.open();`];
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const credits=['NOTICE.md','LICENSE-STK.txt','LIBRARY-NOTICES.txt'].map(p=>read('web/vendor/faust/'+p)).join('\n\n');
const script=s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>';
const page=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>笛调之间 · 乐器音色试听</title><style>:root{--ink:#182d3d;--muted:#566979;--blue:#145baf;--line:#d8e2ed;--soft:#eaf2ff}*{box-sizing:border-box}body{margin:0;background:#f1f5fa;color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select{font:inherit}button{cursor:pointer;padding:10px 16px;border:1px solid var(--line);border-radius:10px;background:white;color:var(--ink);font-weight:600}button.primary{background:var(--blue);color:white}button:disabled{opacity:.5}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #4e91ed;outline-offset:3px}.subtle{color:var(--muted)}.compact{margin:0}[hidden]{display:none!important}.switch-row{display:flex;gap:8px;align-items:center}.sheet{border:0;border-radius:20px;padding:0;max-height:90vh;overflow:auto;box-shadow:0 20px 80px #182d3d30}.sheet::backdrop{background:#182d3d55}.sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.sheet-head h2{font-size:22px}.sheet-body{padding:26px}${read('web/app-shell.css').slice(read('web/app-shell.css').indexOf('/* Compact, matched-level sound auditions. */')).replace(/\/\* Modified by AI on .*? \*\//g,'')}.preview-home{max-width:900px;margin:auto;padding:48px 24px}.preview-home h1{font-size:28px}</style></head><body><main class="preview-home"><h1>笛调之间 · 乐器音色试听</h1><p>笛子、二胡、扬琴、古筝、钢琴、双簧管、单簧管，七种乐器音色可离线试听。</p><p class="subtle">这里记录的选择只用于这个试听页，不会更改已安装 App 的设置；App 里也有「设置 → 音色试听」。</p><button id="settingsAudioLab" type="button" class="primary">打开试听与选择</button><details style="margin-top:28px"><summary>第三方版权与许可</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 monospace;max-height:35vh;overflow:auto">${escape(credits)}</pre></details></main>${dialog}${scripts.map(script).join('\n')}</body></html>`;
const dest=path.join(root,'outputs/instrument-audition.html'),content=mark(page,'.html');fs.writeFileSync(dest,content);
// Refresh the earlier local audition link with the same simplified page.
fs.writeFileSync(path.join(root,'outputs/faust-audition.html'),content);
console.log(`Offline audition: ${dest} (${Buffer.byteLength(page)} bytes)`);
// Modified by AI on 2026-10-10 15:17:21
