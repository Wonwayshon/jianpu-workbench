const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root='web/',disk=new Map(),vault=new Map(),seen=[];
const c=vm.createContext({window:{},localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)},URL,TextEncoder,setTimeout,clearTimeout,btoa,console});
c.AndroidTools=c.window.AndroidTools={storeCredential(id,kind,url,user,secret){const old=vault.get(id);if(secret==='__FLUTE_STORED_CREDENTIAL__')return !!old&&old.url===url&&old.user===user;vault.set(id,{kind,url,user,secret});return true},hasCredential:id=>vault.has(id),deleteCredential:id=>vault.delete(id),httpRequest(id,method,url,headers,body){seen.push({url,headers,body});queueMicrotask(()=>c.window.__nativeHttpDone(id,200,JSON.stringify({choices:[{message:{content:'OK'}}]})))}};
c.document={addEventListener(){}};c.location={href:'https://app.test/index.html',origin:'https://app.test'};for(const f of ['browser','android','desktop','bridge']){vm.runInContext(fs.readFileSync('platform/'+f+'.js','utf8'),c);Object.assign(c,c.window)}
vm.runInContext(fs.readFileSync(root+'secure-credentials.js','utf8'),c);c.SecureCredentials=c.window.SecureCredentials;
vm.runInContext(fs.readFileSync(root+'score-ocr.js','utf8'),c);const O=c.window.ScoreOCR;
vm.runInContext(fs.readFileSync(root+'library.js','utf8'),c);const L=c.window.ScoreLibrary;
disk.set('flute.scoreOcr.v1',JSON.stringify({active:'p1',baseUrl:'https://model.test/v1',apiKey:'legacy-test-only',profiles:[{id:'p1',name:'model',baseUrl:'https://model.test/v1',apiKey:'legacy-test-only',model:'vision'}]}));
const cfg=O.loadConfig();assert.equal(cfg.apiKey,c.SecureCredentials.TOKEN);assert.ok(!disk.get('flute.scoreOcr.v1').includes('legacy-test-only'));assert.equal(vault.get('ocr-p1').secret,'legacy-test-only');
(async()=>{
 assert.equal(await O.testConnection(cfg),'OK');assert.equal(JSON.parse(seen[0].headers)['X-Flute-Credential'],'ocr-p1');assert.ok(!JSON.stringify(seen).includes('legacy-test-only'));
 assert.equal(O.saveConfig({...cfg,profiles:cfg.profiles.map(p=>({...p,baseUrl:'https://other.test/v1'}))}),false,'changing endpoint requires a new key');
 assert.equal(O.loadConfig().profiles[0].baseUrl,'https://model.test/v1');
 disk.set('flute.webdav.v1',JSON.stringify({url:'https://dav.test/root/',user:'friend',pass:'dav-test-only'}));const d=L.davConfig();assert.equal(d.pass,c.SecureCredentials.TOKEN);assert.ok(!disk.get('flute.webdav.v1').includes('dav-test-only'));
 assert.equal(L.saveDavConfig({...d,user:'other'}),false);assert.equal(vault.get('webdav').user,'friend');
 const before=disk.get('flute.scoreOcr.v1');disk.set('flute.scoreOcr.v1',JSON.stringify({profiles:[{id:'p2',baseUrl:'https://new.test/v1',apiKey:'migration-must-survive',model:'vision'}],active:'p2'}));const original=c.AndroidTools.storeCredential;c.AndroidTools.storeCredential=()=>false;const failed=O.loadConfig();assert.equal(failed.apiKey,'');assert.ok(failed.storageError);assert.ok(disk.get('flute.scoreOcr.v1').includes('migration-must-survive'));c.AndroidTools.storeCredential=original;
 disk.set('flute.scoreOcr.v1',before);assert.equal(O.saveConfig({...cfg,profiles:[],active:null}),true);assert.equal(vault.has('ocr-p1'),false);
 console.log('PASS: API/WebDAV migration, metadata-only storage, native auth references, address/account binding, deletion and failed-migration preservation.');
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-08 10:06:28
