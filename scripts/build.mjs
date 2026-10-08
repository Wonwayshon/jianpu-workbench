import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const project=JSON.parse(fs.readFileSync(path.join(root,'project.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(project.version)||!Number.isInteger(project.androidVersionCode)||project.androidVersionCode<1||project.androidVersionCode>2100000000)throw Error('project.json version/versionCode is invalid');
export const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>{const dest=path.join(root,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,s)};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const stripMarker=s=>s.replace(/^(?:\/\/|<!--|\/\*) Modified by AI on .*\n?/gm,'').trimEnd();
export function systemStamp(){const r=process.platform==='win32'?spawnSync('powershell',['-NoProfile','-NonInteractive','-Command','Get-Date -Format "yyyy-MM-dd HH:mm:ss"'],{encoding:'utf8'}):spawnSync('date',['+%Y-%m-%d %H:%M:%S'],{encoding:'utf8'});if(r.status!==0)throw Error('Cannot retrieve system timestamp');return r.stdout.trim()}
export function mark(s,ext,stamp=systemStamp()){const format=['.html','.xml'].includes(ext)?`<!-- Modified by AI on ${stamp} -->`:['.css','.scss','.less'].includes(ext)?`/* Modified by AI on ${stamp} */`:ext==='.py'?`# Modified by AI on ${stamp}`:`// Modified by AI on ${stamp}`;return stripMarker(s)+'\n'+format+'\n'}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)])}
function csp(html,desktop=false){const inline=[...html.matchAll(/<script\s*>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-"+crypto.createHash('sha256').update(m[1]).digest('base64')+"'");return `default-src 'self'; script-src 'self' ${inline.join(' ')} 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https: blob:${desktop?' ipc: http://ipc.localhost':''}; worker-src 'self' blob:; media-src 'self' blob: data:; font-src 'self' data:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`}
export function buildWeb(target='web'){
 if(!['web','android','desktop'].includes(target))throw Error('Unknown target');
 const dest=target==='web'?path.join(root,'dist/web'):path.join(root,'dist',target,target==='android'?'assets':'web');fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});fs.cpSync(path.join(root,'web'),dest,{recursive:true});fs.cpSync(path.join(root,'platform'),path.join(dest,'platform'),{recursive:true});
 let html=read('web/index.html').replace(/([?&]v=)[0-9.]+/g,'$1'+project.version);const policy=csp(html,target==='desktop');
 for(const [name,value] of [['app-version',project.version],['app-platform',target==='desktop'?process.platform:target==='android'?'android':'browser'],['app-arch',process.arch]])html=html.replace(new RegExp('<meta name="'+name+'" content="[^"]*">'),'<meta name="'+name+'" content="'+value+'">');
 html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/,target==='desktop'?'':`<meta http-equiv="Content-Security-Policy" content="${policy}">\n`);fs.writeFileSync(path.join(dest,'index.html'),mark(html,'.html'));
 const manifest={version:project.version,target,assets:{}};for(const p of files(dest))manifest.assets[path.relative(dest,p).replaceAll('\\','/')]=hash(fs.readFileSync(p));fs.writeFileSync(path.join(dest,'build-info.json'),JSON.stringify(manifest,null,2)+'\n');
 if(target==='desktop'){
  const cfg={...JSON.parse(read('desktop/tauri.template.json')),version:project.version,productName:project.displayName,identifier:project.identifier};cfg.app.security.csp=policy;write('desktop/src-tauri/tauri.conf.json',JSON.stringify(cfg,null,2)+'\n');
  const cargo=read('desktop/src-tauri/Cargo.toml').replace(/^version = "[^"]+"/m,`version = "${project.version}"`);write('desktop/src-tauri/Cargo.toml',cargo);
 }
 console.log(`Built ${target} ${project.version}: ${path.relative(root,dest)} (${Object.keys(manifest.assets).length} assets)`);return dest;
}
function manifestForAndroid(){return mark(read('android/app/src/main/AndroidManifest.xml').replace(/ android:versionCode="\d+" android:versionName="[^"]+"/,'').replace('<manifest ',`<manifest android:versionCode="${project.androidVersionCode}" android:versionName="${project.version}" `),'.xml')}
export function exportAndroid(){
 const assets=buildWeb('android'),dest=path.join(root,'outputs/android-source');fs.mkdirSync(dest,{recursive:true});for(const e of fs.readdirSync(dest)){if(e!=='.git')fs.rmSync(path.join(dest,e),{recursive:true,force:true})}fs.cpSync(path.join(root,'android'),dest,{recursive:true,filter:p=>!p.includes(`${path.sep}.git`)&&!p.includes(`${path.sep}.gradle`)&&!p.includes(`${path.sep}build${path.sep}`)});fs.cpSync(assets,path.join(dest,'app/src/main/assets'),{recursive:true});fs.writeFileSync(path.join(dest,'app/src/main/AndroidManifest.xml'),manifestForAndroid());
 fs.writeFileSync(path.join(dest,'app/build.gradle'),`// Generated standalone Android export. Edit android/app/build.gradle in the workspace.\nplugins { id 'com.android.application' }\nandroid {\n namespace '${project.identifier}'\n compileSdk 35\n defaultConfig { applicationId '${project.identifier}'; minSdk ${project.minAndroidSdk}; targetSdk ${project.targetAndroidSdk}; versionCode ${project.androidVersionCode}; versionName '${project.version}' }\n compileOptions { sourceCompatibility JavaVersion.VERSION_1_8; targetCompatibility JavaVersion.VERSION_1_8 }\n}\n`);fs.writeFileSync(path.join(dest,'README.md'),`# 笛调之间 Android ${project.version} 独立源码\n\n本目录由统一项目自动导出，包含完整 assets，可作为独立 Android Studio 工程打开。需要 JDK 17、Android SDK 35、Gradle 8.9。也可执行 gradle :app:assembleDebug；调试签名不能覆盖原发布版。源码包不含签名私钥。\n\n日常开发应修改完整项目的 web/platform/android，并重新导出；不要维护第二份导出源码。\n`);console.log('Exported standalone Android source.');
}
export function buildChecker(){
 const parser=read('web/jianpu.js'),ocr=read('web/score-ocr.js'),info={toolVersion:'1.3.0',appVersion:project.version,format:'乐谱文本格式 v1',parserSha256:hash(parser),promptSha256:hash(ocr),builtAt:systemStamp()};
 let body=read('scripts/checker-cli.cjs');

 const code="#!/usr/bin/env node\n'use strict';\nconst BUNDLE_INFO = "+JSON.stringify(info,null,2)+";\nconst BundledParser=(()=>{const window={};\n"+stripMarker(parser)+"\nreturn window.Jianpu;})();\nconst BundledOCR=(()=>{const window={};\n"+stripMarker(ocr)+"\nreturn window.ScoreOCR;})();\n"+stripMarker(body);
 write('outputs/ai-score-checker/validate-score.cjs',mark(code,'.cjs'));console.log('Bundled checker from canonical web core.');
}
export function check(){
 const html=read('web/index.html');for(const m of html.matchAll(/<script\s*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(ids.length!==new Set(ids).size)throw Error('Duplicate HTML IDs');
 for(const p of files(path.join(root,'web')).filter(p=>!p.includes(`${path.sep}vendor${path.sep}`))){if(/AndroidTools/.test(fs.readFileSync(p,'utf8')))throw Error('Native platform dependency leaked into web core: '+p);if(p.endsWith('.js')){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);}}
 for(const p of files(path.join(root,'platform'))){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);}
 for(const target of ['web','android','desktop'])buildWeb(target);
 console.log('PASS: canonical web core, adapter separation, unique IDs and JavaScript syntax.');
}
export function run(command,args=[],cwd=root){const r=spawnSync(command,args,{cwd,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw Error(`${command} failed (${r.status})`)}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const task=process.argv[2]||'web',target=process.argv[process.argv.indexOf('--target')+1]||'web';
 switch(task){case 'web':buildWeb(process.argv.includes('--target')?target:'web');break;case 'check':check();break;case 'export-android':exportAndroid();break;case 'checker':buildChecker();break;case 'android':exportAndroid();run('zsh',['scripts/build-android.sh']);break;case 'source':run('python3',['scripts/export-source.py']);break;default:throw Error('Unknown build command: '+task)}
 }catch(e){console.error(e.message);process.exitCode=1}
}
// Modified by AI on 2026-10-08 14:35:52
