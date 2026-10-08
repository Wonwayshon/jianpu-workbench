import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,project,buildWeb} from './build.mjs';
import {privacyEnvironment} from './desktop-privacy.mjs';
const task=process.argv[2]||'dev';buildWeb('desktop');
let env={...process.env};const local=path.join(root,'work/rust');
if(fs.existsSync(path.join(local,'cargo/bin/cargo'))){env.CARGO_HOME=path.join(local,'cargo');env.RUSTUP_HOME=path.join(local,'rustup');env.PATH=path.join(local,'cargo/bin')+path.delimiter+env.PATH}
env=privacyEnvironment(env,root);
const args=task==='check'?['cargo',['test','--manifest-path',path.join(root,'desktop/src-tauri/Cargo.toml'),'--lib']]:[process.execPath,[path.join(root,'node_modules/@tauri-apps/cli/tauri.js'),task,...process.argv.slice(3)]];
const result=spawnSync(args[0],args[1],{cwd:path.join(root,'desktop'),env,stdio:'inherit'});
if(result.error)console.error(result.error.message);process.exitCode=result.status??1;
if(result.status===0&&task==='build'&&process.platform==='darwin'&&!process.argv.includes('--no-bundle')){
 const flags=process.argv.slice(3),at=flags.indexOf('--target'),targetRoot=env.CARGO_TARGET_DIR||path.join(root,'desktop/src-tauri/target'),app=path.join(targetRoot,...(at>=0?[flags[at+1]]:[]),flags.includes('--debug')?'debug':'release','bundle/macos',project.displayName+'.app');
 const checked=spawnSync('codesign',['--verify','--deep','--strict','--verbose=2',app],{stdio:'inherit'});
 if(checked.status!==0){console.error('Mac application signature validation failed; do not distribute this build.');process.exitCode=1}
}
// Modified by AI on 2026-10-08 10:47:12
