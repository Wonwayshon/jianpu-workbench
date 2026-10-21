const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const calls=[],disk=new Map(),vault=new Map([['ocr-old',{id:'ocr-old',kind:'bearer',url:'https://model.test/chat/completions',user:''}]]),uploads=new Map();let fail=false,ctx;
 const plugin={async invoke({action,args}){
  calls.push({action,args});await new Promise(r=>setTimeout(r,1));
  if(fail&&action==='httpRequest')throw Error('dispatch failed');
  let value=true;
  if(action==='credentialList')value=[...vault.values()];
  if(action==='storeCredential'){const [id,kind,url,user,secret]=args;const old=vault.get(id);if(secret==='__FLUTE_STORED_CREDENTIAL__')value=!!old&&new URL(old.url).href===new URL(url).href&&old.user===user;else vault.set(id,{id,kind,url,user})}
  if(action==='deleteCredential')vault.delete(args[0]);
  if(action==='uploadChunk'){const [id,data]=args;uploads.set(id,(uploads.get(id)||'')+atob(data))}
  if(action==='saveTransfer')assert.equal(uploads.get(args[0]).length,1600000,'all awaited chunks arrive before saving');
  if(action==='httpRequest')queueMicrotask(()=>ctx.window.__nativeHttpDone(args[0],200,JSON.stringify({choices:[{message:{content:'OK'}}]})));
  if(action==='httpFetch')queueMicrotask(()=>ctx.window.__nativeFetchDone(args[0],200,'{}',''));
  if(action==='systemTheme')value='dark';
  if(action==='readClipboard')value='native clipboard';
  return {value};
 }};
 ctx=vm.createContext({window:{Capacitor:{getPlatform:()=> 'android',Plugins:{FluteNative:plugin}}},URL,Blob,TextEncoder,TextDecoder,Uint8Array,btoa,atob,setTimeout,clearTimeout,AbortController,fetch:async()=>({blob:async()=>new Blob(['download'])}),location:{origin:'https://appassets.androidplatform.net',href:'https://appassets.androidplatform.net/index.html'},document:{addEventListener(){}},localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)},console});
 for(const f of ['browser','android','desktop','bridge']){vm.runInContext(fs.readFileSync('platform/'+f+'.js','utf8'),ctx);Object.assign(ctx,ctx.window)}
 for(const f of ['secure-credentials','score-ocr','library']){vm.runInContext(fs.readFileSync('web/'+f+'.js','utf8'),ctx);Object.assign(ctx,ctx.window)}
 const {Platform:P,SecureCredentials:S,ScoreOCR:O}=ctx;await P.ready;assert.equal(P.kind,'android');assert.equal(S.has('ocr-old'),true);
 assert.equal(await O.saveConfigAsync({active:'old',mode:'llm',profiles:[{id:'old',name:'old',baseUrl:'https://model.test',model:'test',apiKey:S.TOKEN}]}),true);
 assert.equal(await O.testConnection(O.loadConfig()),'OK');
 const request=calls.find(c=>c.action==='httpRequest');assert.equal(JSON.parse(request.args[3])['X-Flute-Credential'],'ocr-old');
 assert.equal(await O.saveConfigAsync({active:'old',profiles:[{id:'old',baseUrl:'https://other.test',apiKey:S.TOKEN}]}),false);
 await S.prepare('webdav','basic','https://dav.test','user','test-only-key');assert.equal(S.protect('webdav','basic','https://dav.test','user',S.TOKEN),S.TOKEN);
 assert.ok(!JSON.stringify([...disk.values()]).includes('test-only-key'));
 await P.saveBlob(new Blob(['x'.repeat(1600000)]),'backup.zip','application/zip');
 assert.equal(await P.systemTheme(),'dark');await P.setTheme('dark');await P.setTheme('light');assert.deepEqual(calls.filter(c=>c.action==='setTheme').map(c=>c.args[0]),[true,false]);
 assert.equal(await P.readClipboard(),'native clipboard');await P.copyText('copy');
 const file=await P.request('GET','https://dav.test/');assert.equal(await file.text(),'download');assert.ok(calls.some(c=>c.action==='releaseTransfer'));
 fail=true;await assert.rejects(P.request('POST','https://model.test',{},null,{model:true}),/dispatch failed/);fail=false;
 await S.removeAsync('webdav');assert.equal(S.has('webdav'),false);
 console.log('PASS: Capacitor async bridge, old credential metadata/binding, secret-free settings, ordered binary chunks, callback dispatch failure cleanup, clipboard and vault deletion.');
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-21 11:03:41
