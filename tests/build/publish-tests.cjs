const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'jianpu-publish-test-')));
try{
 fs.mkdirSync(path.join(tmp,'scripts'));fs.mkdirSync(path.join(tmp,'bin'));fs.mkdirSync(path.join(tmp,'outputs'));fs.mkdirSync(path.join(tmp,'docs/releases'),{recursive:true});
 const project=require('../../project.json'),tag=`v${project.version}`;
 fs.writeFileSync(path.join(tmp,'project.json'),JSON.stringify(project));fs.writeFileSync(path.join(tmp,'LICENSE'),'test license');fs.writeFileSync(path.join(tmp,'docs/releases',`${tag}.md`),'Test release');
 const stamp=spawnSync('date',['+%Y-%m-%d %H:%M:%S'],{encoding:'utf8'}).stdout.trim();
 fs.writeFileSync(path.join(tmp,'scripts/ci-release.mjs'),fs.readFileSync('scripts/ci-release.mjs','utf8').replace(/^\/\/ Modified by AI on .*$/m,'// '+'Modified by AI on '+stamp));
 for(const name of [`flute-key-lab-${project.version}.apk`,`flute-key-lab-macos-arm64-${project.version}.dmg`,`flute-key-lab-macos-arm64-${project.version}.zip`,`flute-key-lab-windows-x64-${project.version}.exe`,`flute-key-lab-project-${project.version}.zip`,'instrument-audition.html'])fs.writeFileSync(path.join(tmp,'outputs',name),'test build '+name);
 const sha='1'.repeat(40);fs.writeFileSync(path.join(tmp,'bin/git'),`#!/usr/bin/env node\nconsole.log('${sha}');\n`,{mode:0o755});
 fs.writeFileSync(path.join(tmp,'bin/gh'),`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const file=process.env.PUBLISH_TEST_STATE,s=JSON.parse(fs.readFileSync(file)),args=process.argv.slice(2),old={id:1,tag_name:'v1.0.0',draft:false,prerelease:false,assets:[]};
const save=()=>fs.writeFileSync(file,JSON.stringify(s)),out=x=>{save();console.log(JSON.stringify(x))};
if(args[0]==='api'){
 const url=args[1],method=args.includes('--method')?args[args.indexOf('--method')+1]:'GET';
 if(url.includes('/git/ref/'))out({object:{type:'commit',sha:'${sha}'}});
 else if(url.includes('/contents/'))out({content:Buffer.from(JSON.stringify({androidVersionCode:1})).toString('base64')});
 else if(url.endsWith('/releases?per_page=100'))out([...(s.removed?[]:[old]),...(s.release?[s.release]:[])]);
 else if(url.includes('/releases/tags/')){console.error('Draft tag lookup is intentionally unavailable');process.exit(1)}
 else if(url.endsWith('/releases')&&method==='POST'){const body=JSON.parse(fs.readFileSync(0,'utf8'));s.events.push('create-draft');s.release={...body,id:2,assets:[],html_url:'https://example.invalid/release'};out(s.release)}
 else if(url.endsWith('/releases/2')&&method==='GET')out(s.release);
 else if(url.endsWith('/releases/2')&&method==='PATCH'){if(s.release.assets.length!==8)throw Error('Published before all uploads');Object.assign(s.release,JSON.parse(fs.readFileSync(0,'utf8')));s.events.push('publish');out(s.release)}
 else if(url.endsWith('/releases/latest')){s.latestCalls++;out(s.latestCalls===1?old:s.release)}
 else throw Error('Unexpected API '+method+' '+url);
}else if(args[0]==='release'&&args[1]==='upload'){
 const files=args.slice(3,args.indexOf('--repo'));s.release.assets=files.map(f=>{const b=fs.readFileSync(f);return {name:path.basename(f),size:b.length,state:'uploaded',digest:'sha256:'+crypto.createHash('sha256').update(b).digest('hex')}});
 if(s.corrupt)s.release.assets[0].digest='sha256:bad';s.events.push('upload');save();
}else if(args[0]==='release'&&args[1]==='delete'){
 if(s.release.draft||s.latestCalls<2)throw Error('Deleted old release too soon');s.removed=true;s.events.push('delete-old');save();
}else throw Error('Unexpected gh command');
`,{mode:0o755});
 for(const corrupt of [false,true]){
  const state=path.join(tmp,'state.json');fs.writeFileSync(state,JSON.stringify({events:[],latestCalls:0,corrupt}));
  const r=spawnSync(process.execPath,[path.join(tmp,'scripts/ci-release.mjs'),'publish'],{env:{...process.env,PATH:path.join(tmp,'bin')+path.delimiter+process.env.PATH,GITHUB_REF_NAME:tag,GITHUB_REPOSITORY:'Wonwayshon/jianpu-workbench',PUBLISH_TEST_STATE:state},encoding:'utf8'});
  const result=JSON.parse(fs.readFileSync(state));
  if(corrupt){assert.notEqual(r.status,0);assert.equal(result.release.draft,true);assert.equal(result.removed,undefined);assert.deepEqual(result.events,['create-draft','upload'])}
  else{assert.equal(r.status,0,r.stderr);assert.deepEqual(result.events,['create-draft','upload','publish','delete-old']);assert.equal(result.latestCalls,2);assert.equal(result.release.assets.length,8)}
 }
 console.log('PASS: full publisher handles draft-ID lookup and delayed latest endpoint; corrupt upload stays a draft and preserves old release');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
// Modified by AI on 2026-10-10 16:23:50
