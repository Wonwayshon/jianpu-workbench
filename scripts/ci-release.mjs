import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const project=JSON.parse(fs.readFileSync(path.join(root,'project.json'),'utf8'));
export function expectedFiles(version=project.version){return [`flute-key-lab-${version}.apk`,`flute-key-lab-macos-arm64-${version}.dmg`,`flute-key-lab-macos-arm64-${version}.zip`,`flute-key-lab-windows-x64-${version}.exe`,`flute-key-lab-project-${version}.zip`,'instrument-audition.html','LICENSE',`SHA256SUMS-${version}.txt`]}
export function verifyTag(tag){if(tag!==`v${project.version}`)throw Error('Tag must match project.json exactly');return tag}
export function verifyAssets(assets,files){
 if(assets.length!==files.length)throw Error('Unexpected Release asset count');
 for(const f of files){const a=assets.find(x=>x.name===f.name);if(!a||a.state!=='uploaded'||a.size!==f.size||a.digest!==`sha256:${f.hash}`)throw Error(`Release asset verification failed: ${f.name}`)}
}
export function compareVersions(a,b){
 const number=t=>{if(!/^v\d+\.\d+\.\d+$/.test(t))throw Error('Invalid stable version');return t.slice(1).split('.').map(Number)};
 const x=number(a),y=number(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0;
}
export function obsoleteReleases(releases,current){
 return releases.filter(r=>!r.draft&&!r.prerelease&&/^v\d+\.\d+\.\d+$/.test(r.tag_name)&&compareVersions(r.tag_name,current)<0);
}
function command(cmd,args,input){const r=spawnSync(cmd,args,{cwd:root,input,encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==0)throw Error(`${cmd} failed: ${r.stderr}`);return r.stdout.trim()}
const gh=(...args)=>command('gh',args);
const api=(p,method='GET',body)=>JSON.parse(command('gh',['api',p,'--method',method,...(body?['--input','-']:[])],body?JSON.stringify(body):undefined));
export function validateRelease(tag){
 verifyTag(tag);const head=command('git',['rev-parse','HEAD']),tagHead=command('git',['rev-parse',`${tag}^{commit}`]);
 if(head!==tagHead)throw Error('Release must build the exact tagged commit');return head;
}
async function main(){
 const task=process.argv[2],tag=process.env.GITHUB_REF_NAME,version=project.version,out=path.join(root,'outputs');
 if(task==='validate'){validateRelease(tag);if(!fs.existsSync(path.join(root,'docs/releases',`${tag}.md`)))throw Error('Missing version release notes');console.log('Validated tag and release notes');return}
 if(task==='windows'){
  const dir=path.join(root,'desktop/src-tauri/target/release/bundle/nsis'),files=fs.readdirSync(dir).filter(n=>n.endsWith('.exe'));
  if(files.length!==1||!files[0].includes(version))throw Error('Expected exactly one current-version Windows installer');
  const data=fs.readFileSync(path.join(dir,files[0]));if(data.subarray(0,2).toString()!=='MZ')throw Error('Invalid Windows executable');
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,expectedFiles()[3]),data);return;
 }
 if(task!=='publish')throw Error('Use validate, windows or publish');
 const head=validateRelease(tag),repo=process.env.GITHUB_REPOSITORY;if(repo!=='Wonwayshon/jianpu-workbench')throw Error('Publishing is restricted to the upstream repository');
 fs.copyFileSync(path.join(root,'LICENSE'),path.join(out,'LICENSE'));
 const payload=expectedFiles().slice(0,-1).map(name=>{const data=fs.readFileSync(path.join(out,name));if(!data.length)throw Error('Empty release asset');return {name,size:data.length,hash:crypto.createHash('sha256').update(data).digest('hex')}});
 const sum=expectedFiles().at(-1);fs.writeFileSync(path.join(out,sum),payload.map(f=>`${f.hash}  ${f.name}`).join('\n')+'\n');
 const sums=fs.readFileSync(path.join(out,sum)),files=[...payload,{name:sum,size:sums.length,hash:crypto.createHash('sha256').update(sums).digest('hex')}];
 const endpoint=`repos/${repo}`,ref=api(`${endpoint}/git/ref/tags/${tag}`),resolved=ref.object.type==='tag'?api(`${endpoint}/git/tags/${ref.object.sha}`).object.sha:ref.object.sha;
 if(resolved!==head)throw Error('Remote tag changed since the build');
 const releases=JSON.parse(gh('api',`${endpoint}/releases?per_page=100`)),existing=releases.find(r=>r.tag_name===tag);
 if(existing&&!existing.draft){verifyAssets(existing.assets,files);console.log('Release already published and verified');return}
 const previous=releases.filter(r=>!r.draft&&!r.prerelease&&/^v\d+\.\d+\.\d+$/.test(r.tag_name)).sort((a,b)=>compareVersions(b.tag_name,a.tag_name))[0];
 if(previous){
  if(compareVersions(tag,previous.tag_name)<=0)throw Error('Refuse to replace a newer stable release with an older version');
  const metadata=api(`${endpoint}/contents/project.json?ref=${previous.tag_name}`),old=JSON.parse(Buffer.from(metadata.content,'base64').toString('utf8'));
  if(project.androidVersionCode<=old.androidVersionCode)throw Error('Android versionCode must increase to allow updates');
 }
 let release=existing||api(`${endpoint}/releases`,'POST',{tag_name:tag,target_commitish:head,draft:true,name:`笛调之间 ${version}`,body:fs.readFileSync(path.join(root,'docs/releases',`${tag}.md`),'utf8')});
 gh('release','upload',tag,...files.map(f=>path.join(out,f.name)),'--repo',repo,'--clobber');
 release=api(`${endpoint}/releases/${release.id}`);verifyAssets(release.assets,files);
 release=api(`${endpoint}/releases/${release.id}`,'PATCH',{draft:false,make_latest:'true'});
 verifyAssets(release.assets,files);
 let latest;for(let attempt=0;attempt<5;attempt++){latest=api(`${endpoint}/releases/latest`);if(latest.id===release.id&&!latest.draft)break;if(attempt<4)await new Promise(resolve=>setTimeout(resolve,1000))}
 if(latest.id!==release.id||latest.draft)throw Error('Latest release verification failed; preserve previous releases');
 verifyAssets(latest.assets,files);
 // Only prune strictly older stable versions after the new one is published and verified.
 for(const old of obsoleteReleases(api(`${endpoint}/releases?per_page=100`),tag))gh('release','delete',old.tag_name,'--repo',repo,'--yes','--cleanup-tag');
 console.log(`Published and verified ${release.html_url} (${files.length} assets)`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
// Modified by AI on 2026-10-10 16:22:16
