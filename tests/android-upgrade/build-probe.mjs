// This separate test-only APK enables inspection; it is never included in release assets.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,project,systemStamp} from '../../scripts/build.mjs';
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT,keystore=process.env.ANDROID_TEST_KEYSTORE;
if(!sdk||!keystore)throw Error('Set ANDROID_HOME and ANDROID_TEST_KEYSTORE to the target release signing key.');
const tools=path.join(sdk,'build-tools/36.0.0'),jar=path.join(sdk,'platforms/android-36/android.jar'),out=path.join(root,'work/android-upgrade-probe');
fs.mkdirSync(out,{recursive:true});for(const name of ['classes','dex','unsigned.apk','aligned.apk','probe.apk','AndroidManifest.xml'])fs.rmSync(path.join(out,name),{recursive:true,force:true});fs.mkdirSync(path.join(out,'classes'));fs.mkdirSync(path.join(out,'dex'));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:root,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw Error(path.basename(cmd)+' failed')};
const java=name=>process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',name):name;
fs.writeFileSync(path.join(out,'AndroidManifest.xml'),`<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${project.identifier}.upgradeprobe"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/><application android:label="Upgrade verification" android:testOnly="true"/><instrumentation android:name=".UpgradeProbe" android:targetPackage="${project.identifier}"/></manifest>\n<!-- Modified by AI on ${systemStamp()} -->\n`);
run(path.join(tools,'aapt2'),['link','-o',path.join(out,'unsigned.apk'),'-I',jar,'--manifest',path.join(out,'AndroidManifest.xml')]);
run(java('javac'),['--release','8','-classpath',jar,'-d',path.join(out,'classes'),path.join(root,'tests/android-upgrade/UpgradeProbe.java')]);
run(path.join(tools,'d8'),['--min-api','26','--lib',jar,'--output',path.join(out,'dex'),path.join(out,'classes/wang/weixuan/flutekeylab/upgradeprobe/UpgradeProbe.class')]);
run('zip',['-q','-j',path.join(out,'unsigned.apk'),path.join(out,'dex/classes.dex')]);
run(path.join(tools,'zipalign'),['-f','4',path.join(out,'unsigned.apk'),path.join(out,'aligned.apk')]);
const password=process.env.ANDROID_TEST_PASSWORD_FILE?'file:'+process.env.ANDROID_TEST_PASSWORD_FILE:'env:ANDROID_STORE_PASSWORD';
run(path.join(tools,'apksigner'),['sign','--ks',keystore,'--ks-type','PKCS12','--ks-pass',password,'--out',path.join(out,'probe.apk'),path.join(out,'aligned.apk')]);
run(path.join(tools,'apksigner'),['verify',path.join(out,'probe.apk')]);
console.log('Built separately signed test-only probe:',path.relative(root,path.join(out,'probe.apk')));
// Modified by AI on 2026-10-12 15:54:20
