import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {root,project,run} from './build.mjs';
import {issues} from './security-check.mjs';
if(process.platform!=='darwin')throw Error('DMG packaging requires macOS');
const source=path.join(root,'desktop/src-tauri/target/release/bundle/macos',project.displayName+'.app');
if(!fs.existsSync(source))throw Error('Run npm run build:desktop -- --bundles app first');
for(const [key,value] of [['CFBundleIdentifier',project.identifier],['CFBundleShortVersionString',project.version]]){const r=spawnSync('/usr/libexec/PlistBuddy',['-c','Print :'+key,path.join(source,'Contents/Info.plist')],{encoding:'utf8'});if(r.status!==0||r.stdout.trim()!==value)throw Error('App metadata does not match project.json; rebuild before packaging')}
const binary=path.join(source,'Contents/MacOS/flute-key-lab-desktop');
if(issues(fs.readFileSync(binary),path.basename(binary),{artifact:true}).length)throw Error('Mac binary contains secrets or personal build paths; rebuild before packaging');
run('codesign',['--verify','--deep','--strict','--verbose=2',source]);
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'flute-mac-')),output=path.join(root,'outputs',`flute-key-lab-macos-${process.arch}-${project.version}.dmg`);
fs.mkdirSync(path.dirname(output),{recursive:true});
try{
 const app=path.join(stage,project.displayName+'.app');fs.cpSync(source,app,{recursive:true});fs.symlinkSync('/Applications',path.join(stage,'Applications'));
 run('codesign',['--verify','--deep','--strict',app]);
 run('hdiutil',['create','-ov','-volname',project.displayName,'-srcfolder',stage,'-format','UDZO',output]);
 run('hdiutil',['verify',output]);
 fs.writeFileSync(output+'.sha256',crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex')+'  '+path.basename(output)+'\n');
 console.log('Verified DMG: '+output);
}finally{fs.rmSync(stage,{recursive:true,force:true})}
// Modified by AI on 2026-10-08 10:47:12
