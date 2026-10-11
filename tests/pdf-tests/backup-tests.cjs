const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('web/pdf-workbench.js','utf8'),record={id:'exercise-a',title:'练习',results:[{page:1,text:'1 2 3 5 |'}]};
const nodes=new Map(),byId=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',value:'selected',hidden:true,classList:{toggle(){}}});return nodes.get(id)};
let allowed=false,writes=0,refreshes=0,confirmations=0,zipRecords=[record];
const ctx=vm.createContext({byId,confirm:()=>{confirmations++;return allowed},checkedRecord:r=>r,refreshArchives:async()=>refreshes++,ScoreLibrary:{readBackupZip:async()=>({records:zipRecords,files:new Map()}),getRecord:async()=>null,putRecord:async()=>writes++,putFile:async()=>{throw Error('no original files in this exercise')}}});
vm.runInContext(source.slice(source.indexOf('  function report('),source.indexOf('  function syncControls(')),ctx);
vm.runInContext(source.slice(source.indexOf('  async function importBackup('),source.indexOf('  // ---------- WebDAV')),ctx);
const json={name:'backup.json',type:'application/json',size:100,text:async()=>JSON.stringify({format:'flute-key-lab-archives',version:1,records:[record]})},zip={name:'backup.zip',type:'application/zip'};
(async()=>{
 for(const file of [json,zip]){
  allowed=false;const before=writes;await ctx.importBackup(file);assert.equal(writes,before,'cancelled restore must not write');assert.equal(byId('pdfBackupStatus').textContent,'已取消恢复。');assert.equal(byId('pdfBackupStatus').hidden,false);assert.equal(byId('pdfImport').value,'');
  allowed=true;await ctx.importBackup(file);assert.equal(writes,before+1);assert.match(byId('pdfBackupStatus').textContent,/已导入|已恢复/);assert.equal(byId('pdfBackupStatus').textContent,byId('pdfArchiveStatus').textContent);
 }
 zipRecords=[];const count=confirmations;await ctx.importBackup(zip);assert.match(byId('pdfBackupStatus').textContent,/导入失败/);assert.equal(confirmations,count,'invalid backup never asks to restore');assert.equal(refreshes,2);
 console.log('PASS: JSON/ZIP cancellation clears progress without writes; success/error report inside modal and library, picker clears, invalid backup cannot restore.');
})().catch(error=>{console.error(error);process.exitCode=1});
// Modified by AI on 2026-10-11 21:28:56
