import fs from 'node:fs';
import path from 'node:path';
import {root,check,buildChecker} from './build.mjs';
import {spawnSync} from 'node:child_process';
check();buildChecker();
const suites=[];
function find(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())find(p);else if(e.name==='tests.cjs'||e.name.endsWith('-tests.cjs')||['credentials.cjs','storage-imports.cjs','platform.cjs','build.cjs'].includes(e.name))suites.push(p)}}
find(path.join(root,'tests'));let failed=0;
for(const suite of suites.sort()){console.log('\n'+path.relative(root,suite));const r=spawnSync(process.execPath,[suite],{cwd:root,stdio:'inherit'});if(r.status!==0)failed++}
console.log(`\n${suites.length-failed}/${suites.length} suites passed`);process.exitCode=failed?1:0;
// Modified by AI on 2026-10-08 10:06:28
