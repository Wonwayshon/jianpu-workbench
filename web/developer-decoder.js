'use strict';
// One decoder source supports Node and browser-generated ZIPs, including file:// offline use.
(() => {
function run(){
// Offline, standard-library-only decoder for exported developer feedback. No network or App installation required.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
function decode(code){
 if(code.length>100000||!/^DTZJD1:[A-Za-z0-9_-]+$/.test(code))throw Error('Invalid developer code');
 const d=JSON.parse(zlib.inflateRawSync(Buffer.from(code.slice(7),'base64url'),{maxOutputLength:2*1024*1024}).toString('utf8'));
 if(d.v!==1||typeof d.t!=='string'||!Array.isArray(d.p)||d.p.length>300||!Array.isArray(d.c)||d.c.length>10000)throw Error('Invalid feedback payload');
 const seen=new Set();for(const p of d.p){if(!Array.isArray(p)||!Number.isSafeInteger(p[0])||p[0]<1||seen.has(p[0])||typeof p[1]!=='string'||p[1].length>100000)throw Error('Invalid pages');seen.add(p[0])}
 return d;
}
if(require.main===module){try{
 const [file,out]=process.argv.slice(2);if(!file||!out)throw Error('Usage: node decode-feedback.cjs 改善提示词.md NEW_OUTPUT_DIRECTORY');
 const stat=fs.statSync(file);if(stat.size>20*1024*1024)throw Error('Input is too large');
 const codes=[...new Set(fs.readFileSync(file,'utf8').match(/DTZJD1:[A-Za-z0-9_-]+/g)||[])];if(!codes.length||codes.length>300)throw Error('No valid developer codes');
 const payloads=codes.map(decode);fs.mkdirSync(out,{recursive:false});
 payloads.forEach((d,i)=>{const name=String(i+1).padStart(3,'0');const text=d.p.length===1?d.p[0][1]:d.p.map(([page,text])=>/^\s*@page\b/m.test(text)?text:'@page '+page+'\n'+text).join('\n\n');fs.writeFileSync(path.join(out,name+'-score.txt'),text,'utf8');fs.writeFileSync(path.join(out,name+'-changes.json'),JSON.stringify({title:d.t,settings:d.g,version:d.a,columns:['page','noteIndex','pitch','part','before','after','origin','editedAt','beforeManual','afterManual','tuning','version'],changes:d.c},null,2)+'\n','utf8')});
 console.log(`Decoded ${payloads.length} scores into ${out}`);
}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={decode};
}
if(typeof window==='undefined')run();else window.DeveloperDecoder={source:'#!/usr/bin/env node\n('+run.toString()+')();\n// Modified by AI on 2026-10-12 09:37:20\n'};
})();
// Modified by AI on 2026-10-12 09:37:20
