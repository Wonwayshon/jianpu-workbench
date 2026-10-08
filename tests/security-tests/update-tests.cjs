const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({window:{},URL});vm.runInContext(fs.readFileSync('web/app-updates.js','utf8'),c);const U=c.window.AppUpdates,root='https://github.com/'+U.REPO;
assert.ok(U.newer('v1.20.10','1.20.2'));assert.ok(!U.newer('v1.20.2','1.20.2'));assert.ok(!U.newer('v1.19.9','1.20.2'));assert.ok(!U.newer('v1.21.0-beta','1.20.2'));
const release={tag_name:'v1.20.3',html_url:root+'/releases/tag/v1.20.3',body:'Update',assets:[{state:'uploaded',name:'flute-key-lab-1.20.3.apk',size:100,browser_download_url:root+'/releases/download/v1.20.3/flute-key-lab-1.20.3.apk'}]};
assert.ok(U.release(release,'1.20.2','android','arm64').hasInstaller);assert.equal(U.release(release,'1.20.2','darwin','arm64').download,release.html_url);
for(const url of ['https://evil.test/file.apk','https://github.com/other/repo/releases/download/v1.20.3/file.apk',root+'/releases/download/v1.20.3/../other/file.apk',root+'/releases/download/v1.20.2/file.apk']){const modified={...release,assets:[{...release.assets[0],browser_download_url:url}]};assert.equal(U.release(modified,'1.20.2','android','arm64').hasInstaller,false)}
for(const changes of [{prerelease:true},{draft:true},{tag_name:'bad'},{html_url:'https://evil.test/'}])assert.throws(()=>U.release({...release,...changes},'1.20.2','android','arm64'));
(async()=>{
 let request;c.Platform={request:async(...args)=>(request=args,{status:200,text:async()=>JSON.stringify(release)})};
 assert.ok((await U.check('1.20.2','android','arm64')).newer);assert.equal(request[0],'GET');assert.ok(!request[2].Authorization);
 c.Platform.request=async()=>({status:404});await assert.rejects(U.check('1.20.2','android','arm64'),/私有/);
 c.Platform.request=async()=>({status:429});await assert.rejects(U.check('1.20.2','android','arm64'),/受限/);
 console.log('PASS: version comparisons, correct platform assets, trusted release URLs, private/rate-limited repositories and credential-free update requests.');
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-08 14:35:52
