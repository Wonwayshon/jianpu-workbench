// Portable release build using the hosted runner's Android SDK; no private build helpers.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {root,project,buildWeb} from './build.mjs';
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
const tools=path.join(sdk||'', 'build-tools/36.0.0'),androidJar=path.join(sdk||'','platforms/android-35/android.jar');
for(const name of ['ANDROID_KEYSTORE_BASE64','ANDROID_STORE_PASSWORD','ANDROID_CERT_SHA256'])if(!process.env[name])throw Error(`Missing release secret: ${name}`);
if(!sdk||!fs.existsSync(androidJar))throw Error('Install Android platform 35 and build-tools 36.0.0');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jianpu-sign-'));
const command=(cmd,args,cwd=root)=>{const r=spawnSync(cmd,args,{cwd,encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0)throw Error(`${path.basename(cmd)} failed: ${r.stderr}`);return r.stdout};
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
try{
 const assets=buildWeb('android');fs.mkdirSync(path.join(dir,'classes'));fs.mkdirSync(path.join(dir,'dex'));fs.mkdirSync(path.join(root,'outputs'),{recursive:true});
 const keystore=path.join(dir,'release.p12');fs.writeFileSync(keystore,Buffer.from(process.env.ANDROID_KEYSTORE_BASE64,'base64'),{mode:0o600});
 let manifest=fs.readFileSync(path.join(root,'android/app/src/main/AndroidManifest.xml'),'utf8');
 manifest=manifest.replace(/ android:versionCode="\d+" android:versionName="[^"]+"/,'').replace('<manifest ',`<manifest package="${project.identifier}" android:versionCode="${project.androidVersionCode}" android:versionName="${project.version}" `);
 fs.writeFileSync(path.join(dir,'AndroidManifest.xml'),manifest);
 command(path.join(tools,'aapt2'),['compile','--dir',path.join(root,'android/app/src/main/res'),'-o',path.join(dir,'compiled.zip')]);
 command(path.join(tools,'aapt2'),['link','-o',path.join(dir,'unsigned.apk'),'-I',androidJar,'--manifest',path.join(dir,'AndroidManifest.xml'),'-A',assets,path.join(dir,'compiled.zip'),'--min-sdk-version',String(project.minAndroidSdk),'--target-sdk-version',String(project.targetAndroidSdk)]);
 command('javac',['--release','8','-nowarn','-classpath',androidJar,'-d',path.join(dir,'classes'),...walk(path.join(root,'android/app/src/main/java')).filter(p=>p.endsWith('.java'))]);
 command(path.join(tools,'d8'),['--min-api',String(project.minAndroidSdk),'--release','--lib',androidJar,'--output',path.join(dir,'dex'),...walk(path.join(dir,'classes')).filter(p=>p.endsWith('.class'))]);
 command('zip',['-q','-j',path.join(dir,'unsigned.apk'),...walk(path.join(dir,'dex'))]);
 command(path.join(tools,'zipalign'),['-f','-p','4',path.join(dir,'unsigned.apk'),path.join(dir,'aligned.apk')]);
 const out=path.join(root,'outputs',`flute-key-lab-${project.version}.apk`);
 command(path.join(tools,'apksigner'),['sign','--ks',keystore,'--ks-type','PKCS12','--ks-pass','env:ANDROID_STORE_PASSWORD','--key-pass','env:ANDROID_STORE_PASSWORD','--out',out,path.join(dir,'aligned.apk')]);
 const verify=command(path.join(tools,'apksigner'),['verify','--verbose','--print-certs',out]);
 const cert=verify.match(/certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1];
 if(!cert||cert.toLowerCase()!==process.env.ANDROID_CERT_SHA256.replace(/:/g,'').trim().toLowerCase())throw Error('APK certificate differs from the original release; refuse to publish');
 const badging=command(path.join(tools,'aapt2'),['dump','badging',out]);
 for(const value of [`name='${project.identifier}'`,`versionCode='${project.androidVersionCode}'`,`versionName='${project.version}'`])if(!badging.includes(value))throw Error('APK metadata mismatch');
 console.log(`Verified signed Android ${project.version}, original certificate, SHA256 ${crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')}`);
}finally{fs.rmSync(dir,{recursive:true,force:true})}
// Modified by AI on 2026-10-10 16:01:39
