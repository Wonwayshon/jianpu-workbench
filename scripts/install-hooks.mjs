import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const r=spawnSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'});
if(r.status===0){
 const root=r.stdout.trim(),old=spawnSync('git',['config','--get','core.hooksPath'],{encoding:'utf8'}).stdout.trim();
 let hooks='.githooks';
 if(old==='work/git-hooks')hooks=old;
 else if(old&&old!=='.githooks'){
  if(!process.argv.includes('--chain-existing')){console.log('Existing Git hooks preserved; run npm run security:install -- --chain-existing to add this check alongside them.');process.exit(0);}
  const previous=path.resolve(root,old),dest=path.join(root,'work/git-hooks');
  if(fs.existsSync(dest))throw Error('Private hooks directory already exists; inspect it before installing');
  fs.mkdirSync(dest,{recursive:true});if(fs.existsSync(previous))fs.cpSync(previous,dest,{recursive:true});
  const pre=path.join(dest,'pre-commit');if(fs.existsSync(pre))fs.renameSync(pre,pre+'.original');
  fs.writeFileSync(pre,`#!/bin/sh
node scripts/security-check.mjs --staged || exit $?
original="$(git rev-parse --show-toplevel)/work/git-hooks/pre-commit.original"
if [ -x "$original" ]; then exec "$original" "$@"; fi
`,{mode:0o755});hooks='work/git-hooks';
 }
 const set=spawnSync('git',['config','--local','core.hooksPath',hooks],{stdio:'inherit'});process.exitCode=set.status??1;
}
// Modified by AI on 2026-10-08 14:23:59
