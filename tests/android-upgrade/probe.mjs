// Node 22+, no browser automation dependency. Use a dedicated Android emulator.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {root,project} from '../../scripts/build.mjs';
const stage=process.argv[2],serial=process.env.ANDROID_TEST_SERIAL||'emulator-5554';
if(!['seed','snapshot','verify'].includes(stage)||!serial.startsWith('emulator-'))throw Error('Use seed, snapshot or verify on a dedicated emulator.');
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;if(!sdk)throw Error('Set ANDROID_HOME.');
const adb=path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb'),dir=path.join(root,'work/android-upgrade-probe');fs.mkdirSync(dir,{recursive:true});
const cmd=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8'}).trim(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
cmd('shell','am','force-stop',project.identifier);
const probe=spawn(adb,['-s',serial,'shell','am','instrument','-w',project.identifier+'.upgradeprobe/.UpgradeProbe'],{stdio:'ignore'});
let ws;const pending=new Map();let sequence=0;
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},40000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))});
const evaluate=async fn=>{const r=await cdp('Runtime.evaluate',{expression:'('+fn.toString()+')()',awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
try{
 let target;const deadline=Date.now()+45000;
 while(Date.now()<deadline){try{const pid=cmd('shell','pidof',project.identifier).split(/\s+/)[0];cmd('forward','tcp:9223','localabstract:webview_devtools_remote_'+pid);const pages=await(await fetch('http://127.0.0.1:9223/json')).json();target=pages.find(p=>p.url.startsWith('https://appassets.androidplatform.net/'));if(target)break}catch{}await sleep(300)}
 if(!target)throw Error('No inspectable app WebView; install the same-signed test-only probe first.');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 ws.onmessage=e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result)}};
 while(!await evaluate(()=>!!window.ScoreLibrary&&!!window.ErhuDeveloper&&!!window.SecureCredentials&&document.readyState==='complete')){if(Date.now()>deadline)throw Error('App did not initialise');await sleep(200)}
 if(stage==='seed')await evaluate(async()=>{
  const now=new Date().toISOString(),text='@title 升级验证\n@key 1=D\n@time 4/4\n1[外一] 2[外二] 3[外三] 5[外四] |';
  const row={id:'score-capacitor-upgrade',title:'升级验证',note:'原地保留',createdAt:now,updatedAt:now,fileId:'file-upgrade-probe',fileName:'probe.txt',fileType:'text/plain',fileSize:25,results:[{page:1,text,checked:true,erhuEdits:{s:ErhuDeveloper.signature(text),c:[[0,'1','','外二','外一','','外一',now,'D-A','fixture']]}}]};
  const blob=new Blob(['upgrade attachment fixture']);row.fileSize=blob.size;
  await ScoreLibrary.putFile({id:row.fileId,blob,name:row.fileName,type:row.fileType,size:blob.size});
  await ScoreLibrary.putRecord(row);await ScoreLibrary.putRecord({...row,note:'原地保留：已编辑'});
  localStorage.setItem('flute.practice.upgrade-probe',JSON.stringify({correct:17,total:20}));localStorage.setItem('flute.viewerLayout.v2','spread');
  const cfg=ScoreOCR.loadConfig();cfg.profiles=cfg.profiles.filter(p=>p.id!=='upgrade');cfg.profiles.push({id:'upgrade',name:'验证模型',baseUrl:'https://upgrade.invalid',model:'fixture',apiKey:'test-only-upgrade-key'});cfg.active='upgrade';
  if(!await ScoreOCR.saveConfigAsync(cfg))throw Error('Fixture credential save failed');
 });
 const snapshot=await evaluate(async()=>{
  await Platform.ready;const file=await ScoreLibrary.getFile('file-upgrade-probe');if(!file)throw Error('Fixture attachment missing');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
  return {origin:location.origin,row:await ScoreLibrary.getRecord('score-capacitor-upgrade'),file:{id:file.id,name:file.name,type:file.type,size:file.size,sha256:digest},history:await ScoreLibrary.recovery(),settings:{practice:localStorage.getItem('flute.practice.upgrade-probe'),layout:localStorage.getItem('flute.viewerLayout.v2'),ocr:localStorage.getItem('flute.scoreOcr.v1')},hasKey:SecureCredentials.has('ocr-upgrade')};
 });
 assert.equal(snapshot.origin,'https://appassets.androidplatform.net');assert.equal(snapshot.hasKey,true);
 const file=path.join(dir,'before.json');
 if(stage!=='verify'){fs.writeFileSync(file,JSON.stringify(snapshot,null,2));console.log('Saved emulator-only baseline:',path.relative(root,file))}
 else{
  assert.deepEqual(snapshot,JSON.parse(fs.readFileSync(file,'utf8')));
  const native=await evaluate(async()=>{await SecureCredentials.prepare('ocr-upgrade','bearer','https://upgrade.invalid/chat/completions','',SecureCredentials.TOKEN);await Platform.copyText('upgrade clipboard check');return {kind:Platform.kind,plugin:Capacitor.isPluginAvailable('FluteNative'),legacy:typeof window.AndroidTools,clipboard:await Platform.readClipboard(),headers:await SecureCredentials.requestHeaders('ocr-upgrade',SecureCredentials.TOKEN,'bearer','','https://upgrade.invalid/chat/completions'),changes:ErhuDeveloper.count(await ScoreLibrary.getRecord('score-capacitor-upgrade'))}});
  assert.equal(native.kind,'android');assert.equal(native.plugin,true);assert.equal(native.legacy,'undefined');assert.equal(native.clipboard,'upgrade clipboard check');assert.equal(native.headers['X-Flute-Credential'],'ocr-upgrade');assert.ok(native.changes>0);
  fs.writeFileSync(path.join(dir,'after.json'),JSON.stringify(snapshot,null,2));console.log('PASS: exact score/attachment hash/finger edits/history/settings/key preservation and native Capacitor operations');
 }
}finally{ws?.close();for(const p of pending.values())p.reject(Error('Probe closing'));pending.clear();cmd('shell','am','force-stop',project.identifier);probe.kill();}
// Modified by AI on 2026-10-12 15:50:58
