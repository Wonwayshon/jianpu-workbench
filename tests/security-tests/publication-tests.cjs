const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const {issues,sensitiveName}=await import('../../scripts/security-check.mjs');
 const {privacyEnvironment}=await import('../../scripts/desktop-privacy.mjs');
 const token='gh'+'p_'+'a'.repeat(36),privateKey='-----BEGIN '+'PRIVATE KEY-----';
 for(const secret of [token,privateKey,'sk-'+'a'.repeat(40),'AK'+'IA'+'0'.repeat(16)])assert.ok(issues(Buffer.from(secret),'example.txt').length);
 for(const name of ['.env','.env.production','release.p12','server.key','password.txt','credentials.json'])assert.ok(sensitiveName(name));
 assert.equal(sensitiveName('.env.example'),false);
 assert.deepEqual(issues(Buffer.from('Bearer test-key; https://service.test/'),'test.js'),[]);
 const home='/Us'+'ers/example',root=home+'/music project',cargo=home+'/cache/cargo';
 assert.ok(issues(Buffer.from(home+'/project/src/lib.rs'),'binary',{artifact:true}).includes('personal build path'));
 assert.deepEqual(issues(Buffer.from('cargo/registry/src/lib.rs'),'binary',{artifact:true}),[]);
 const original={RUSTFLAGS:'-C opt-level=2',CARGO_HOME:cargo},env=privacyEnvironment(original,root,home),flags=env.CARGO_ENCODED_RUSTFLAGS.split('\x1f');
 assert.ok(flags.includes('--remap-path-prefix='+root+'=project'));assert.ok(flags.includes('--remap-path-prefix='+cargo+'=cargo'));assert.deepEqual(flags.slice(0,2),['-C','opt-level=2']);assert.ok(!env.RUSTFLAGS);assert.ok(original.RUSTFLAGS);
 const encoded=privacyEnvironment({CARGO_ENCODED_RUSTFLAGS:'--cfg\x1fmy_value="two words"'},root,home);assert.ok(encoded.CARGO_ENCODED_RUSTFLAGS.startsWith('--cfg\x1fmy_value="two words"\x1f'));
 const winHome='C:'+String.fromCharCode(92)+'Us'+'ers'+String.fromCharCode(92)+'example';
 assert.ok(issues(Buffer.from(winHome+String.fromCharCode(92)+'file'),'binary',{artifact:true}).length);
 for(const n of fs.readdirSync('tests/erhu-fingering'))assert.ok(!n.includes('原文'));
 assert.ok(!fs.readdirSync('tests/full-score').some(n=>n.startsWith('xier-')));
 console.log('PASS: secret patterns and private filenames, harmless test credentials, Unix/Windows paths, remapping with spaces and preserved compiler flags; complete third-party score fixtures removed.');
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-08 14:21:25
