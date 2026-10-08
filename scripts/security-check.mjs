import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function sensitiveName(name){
 const base=path.basename(name).toLowerCase();
 return (/^\.env(?:\.|$)/.test(base)&&!base.endsWith('.example'))||/\.(?:p12|pfx|jks|keystore|pem|key)$/.test(base)||/^(?:passwords?|credentials?|secrets?|tokens?)(?:\.txt|\.json|\.ya?ml|\.properties)$/.test(base);
}
export function issues(data,name,{artifact=false}={}){
 const out=[];if(!artifact&&sensitiveName(name))out.push('sensitive filename');
 const text=data.toString('utf8');
 const patterns=[['private key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],['GitHub token',/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],['cloud access key',/AKIA[0-9A-Z]{16}/],['model API key',/sk-(?:proj-)?[A-Za-z0-9_-]{30,}/],['personal build path',/(?:\/Users\/[^/\s\x00]+\/|\/home\/[^/\s\x00]+\/|[A-Za-z]:[\\/]Users[\\/][^\\/\s\x00]+[\\/])/]];
 for(const [kind,pattern] of patterns)if(pattern.test(text))out.push(kind);return out;
}
function git(args){const r=spawnSync('git',args,{cwd:root,maxBuffer:64*1024*1024});if(r.status!==0)throw Error('Git security scan failed: '+args[0]);return r.stdout}
export function scan(mode='tracked',files=[]){
 let count=0;const bad=[],seen=new Set();
 const inspect=(data,name,artifact=false)=>{count++;const kinds=issues(data,name,{artifact});if(kinds.length)bad.push({file:name,kinds})};
 if(mode==='artifact'){for(const file of files)inspect(fs.readFileSync(file),path.basename(file),true)}
 else if(mode==='history'){
  for(const commit of git(['rev-list','--all']).toString().trim().split('\n').filter(Boolean))for(const row of git(['ls-tree','-rz',commit]).toString().split('\0').filter(Boolean)){
   const [meta,name]=row.split('\t'),oid=meta.split(' ')[2];if(seen.has(oid))continue;seen.add(oid);inspect(git(['cat-file','blob',oid]),name);
  }
 }else{
  const names=git(mode==='staged'?['diff','--cached','--name-only','--diff-filter=ACMR','-z']:['ls-files','-z']).toString().split('\0').filter(Boolean);
  for(const name of names)inspect(mode==='staged'?git(['show',':'+name]):fs.readFileSync(path.join(root,name)),name);
 }
 return {count,bad};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2),mode=args[0]==='--staged'?'staged':args[0]==='--history'?'history':args[0]==='--file'?'artifact':'tracked';
  if(mode==='artifact'&&args.length<2)throw Error('Provide artifact files after --file');
  const r=scan(mode,mode==='artifact'?args.slice(1):[]);
  for(const item of r.bad)console.error(`${item.file}: ${item.kinds.join(', ')} (value redacted)`);
  console.log(`Security scan: ${r.count} files/blobs; ${r.bad.length} findings.`);process.exitCode=r.bad.length?1:0;
 }catch(e){console.error(e.message);process.exitCode=2}
}
// Modified by AI on 2026-10-08 10:47:12
