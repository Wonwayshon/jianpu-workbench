const assert=require('node:assert/strict');
(async()=>{
 const {expectedFiles,verifyTag,verifyAssets,obsoleteReleases,compareVersions,project}=await import('../../scripts/ci-release.mjs');
 assert.equal(compareVersions('v1.21.4','v1.21.3'),1);assert.equal(compareVersions('v1.21.4','v1.22.0'),-1);assert.equal(compareVersions('v1.21.4','v1.21.4'),0);assert.throws(()=>compareVersions('nightly','v1.0.0'));
 assert.equal(expectedFiles().length,7);assert.equal(new Set(expectedFiles()).size,7);
 assert.ok(!expectedFiles().includes('instrument-audition.html'));
 const workflow=require('node:fs').readFileSync(require('node:path').join(__dirname,'../../.github/workflows/release.yml'),'utf8');
 assert.match(workflow,/node scripts\/ci-release.mjs published/);assert.equal((workflow.match(/if: needs\.verify\.outputs\.published != 'true'/g)||[]).length,3);
 assert.ok(!workflow.includes('build:audition'));assert.ok(!workflow.includes('instrument-audition.html'));
 assert.equal(verifyTag(`v${project.version}`),`v${project.version}`);assert.throws(()=>verifyTag('v0.0.1'));
 const files=expectedFiles().map(name=>({name,size:10,hash:'a'.repeat(64)})),assets=files.map(f=>({...f,state:'uploaded',digest:`sha256:${f.hash}`}));
 verifyAssets(assets,files);assert.throws(()=>verifyAssets(assets.slice(1),files));assert.throws(()=>verifyAssets(assets.map((a,i)=>i? a:{...a,digest:'bad'}),files));assert.throws(()=>verifyAssets(assets.map((a,i)=>i? a:{...a,size:9}),files));
 const releases=[{tag_name:'v1.21.3'},{tag_name:'v1.21.4'},{tag_name:'v1.22.0'},{tag_name:'v2.0.0'},{tag_name:'v1.20.0',draft:true},{tag_name:'v1.20.1',prerelease:true},{tag_name:'nightly'}];
 assert.deepEqual(obsoleteReleases(releases,'v1.21.4').map(x=>x.tag_name),['v1.21.3']);
 console.log('PASS: tag/version mismatch fails; all asset counts/sizes/digests required; only strictly older stable releases removed');
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-21 13:51:18
