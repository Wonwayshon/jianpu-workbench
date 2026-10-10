const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root='web/',c=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(root+'archive-workspace.js','utf8'),c);const A=c.window.ArchiveWorkspace;
const record={id:'score-a',title:'原谱',note:'保留备注',fileId:'file-a',fileName:'原谱.pdf',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',pageCount:8,settings:{key:'5',octave:'4',shift:'0',spelling:'auto'},results:[{page:2,text:'1 2 |',preview:'preview-2',reviewed:true,method:'OCR'},{page:5,text:'3 4 |',preview:'preview-5',reviewed:true,method:'OCR'},{page:8,text:'',preview:'preview-8',reviewed:false}]};
const binding=A.bind(record);assert.equal(binding.text,'@page 2\n1 2 |\n\n@page 5\n3 4 |');
const saved=A.merge(record,binding,binding.text.replace('3 4','3 5'),record.settings,'','now');
assert.equal(saved.id,record.id);assert.equal(saved.createdAt,record.createdAt);assert.equal(saved.fileId,'file-a');assert.equal(saved.note,'保留备注');assert.equal(saved.results.length,3);assert.equal(saved.results[1].text,'3 5 |');assert.equal(saved.results[1].preview,'preview-5');assert.equal(saved.results[1].reviewed,false);assert.equal(saved.results[0].reviewed,true);assert.equal(record.results[1].text,'3 4 |');
const single=A.bind(record,[5]),page=A.merge(record,single,'@page 1\n5 6 |',record.settings,'converted','now');assert.equal(page.results[1].text,'@page 1\n5 6 |');assert.equal(page.results[0].text,record.results[0].text);assert.equal(page.results[1].convertedText,'converted');
assert.throws(()=>A.merge(null,binding,binding.text,{},'','now'),/删除/);assert.throws(()=>A.merge({...record,deleted:true},binding,binding.text,{},'','now'),/删除/);
assert.throws(()=>A.merge({...record,results:record.results.map(r=>r.page===5?{...r,text:'新版'}:r)},binding,binding.text,{},'','now'),/其他位置更新/);
assert.throws(()=>A.merge(record,binding,'1 2 |',{},'','now'),/跨页标记/);
const renamed=A.merge({...record,title:'新名称',note:'新备注'},binding,binding.text,{},'','now');assert.equal(renamed.title,'新名称');assert.equal(renamed.note,'新备注');
// Execute the real workbench load/save handlers with an in-memory archive store.
const source=fs.readFileSync(root+'pdf-workbench.js','utf8'),els=new Map();c.byId=id=>{if(!els.has(id))els.set(id,{value:'',textContent:'',hidden:false,disabled:false});return els.get(id)};
c.ArchiveWorkspace=A;c.state={archiveId:null,results:[],dirty:false};let next=0,prompts=0,puts=0;const db=new Map([[record.id,structuredClone(record)]]);
c.ScoreLibrary={getRecord:async id=>structuredClone(db.get(id)),putRecord:async r=>{puts++;db.set(r.id,structuredClone(r))}};
c.checkedRecord=r=>structuredClone(r);c.newId=()=> 'score-new-'+(++next);c.getSettings=()=>({...record.settings});c.putSettings=s=>{c.loadedSettings=s};c.lastConverted=null;c.exportText=()=>'';c.Jianpu={parse:()=>({meta:{}})};
c.prompt=()=>{throw new Error('prompt is unsupported in desktop WebView')};c.AppDialogs={confirm:async()=>true,askName:async()=>{prompts++;return '副本'}};c.confirm=()=>true;c.refreshArchives=async()=>{};c.renderResults=()=>{};c.setLibraryView=()=>{};c.showTab=()=>{};c.window.scrollTo=()=>{};
vm.runInContext(source.slice(source.indexOf('  // Workbench association'),source.indexOf('  // Share-code import')),c);
(async()=>{
 await c.loadToScore(record);assert.equal(c.loadedSettings.key,'5');assert.match(c.byId('archiveScore').textContent,/保存到原存档/);
 c.byId('scoreInput').value=c.byId('scoreInput').value.replace('3 4','3 6');await c.saveScoreArchive();assert.equal(db.size,1);assert.equal(db.get(record.id).results[1].text,'3 6 |');assert.equal(prompts,0);
 c.byId('scoreInput').value=c.byId('scoreInput').value.replace('3 6','3 7');await c.saveScoreArchive();assert.equal(db.size,1);assert.equal(db.get(record.id).results[1].text,'3 7 |');
 await c.saveScoreArchive(true);assert.equal(db.size,2);assert.equal(prompts,1);assert.equal(db.get('score-new-1').results[0].text,c.byId('scoreInput').value);assert.equal(db.get(record.id).results[1].text,'3 7 |');
 c.byId('scoreInput').value='7 1 |';await c.saveScoreArchive();assert.equal(db.size,2);assert.equal(db.get('score-new-1').results[0].text,'7 1 |','saving a copy subsequently updates that copy');
 c.window.detachScoreArchive();await c.saveScoreArchive();assert.equal(db.size,3,'detached text saves as a new archive');
 db.delete('score-new-2');const count=puts;await c.saveScoreArchive();assert.equal(puts,count);assert.match(c.byId('copyStatus').textContent,/已被删除/);
 // A failed write retains the existing association and allows retry.
 await c.loadToScore(record);const originalPut=c.ScoreLibrary.putRecord;c.ScoreLibrary.putRecord=async()=>{throw new Error('磁盘已满')};await c.saveScoreArchive();assert.match(c.byId('copyStatus').textContent,/磁盘已满/);assert.match(c.byId('archiveScore').textContent,/原存档/);assert.equal(c.byId('archiveScore').disabled,false);c.ScoreLibrary.putRecord=originalPut;
 const current=db.get(record.id);c.state.archiveId=record.id;c.state.results=structuredClone(current.results);c.state.results[1].text='6 7 |';c.state.dirty=true;c.byId('pdfTitle').value=current.title;c.bindScore(current,[5]);c.byId('scoreInput').value='6 7 |';await c.saveScoreArchive();assert.equal(c.state.dirty,false);assert.equal(db.get(record.id).results[1].text,'6 7 |');
 c.window.detachScoreArchive();const beforeCancel=puts;c.AppDialogs.askName=async()=>null;await c.saveScoreArchive();assert.equal(puts,beforeCancel);assert.equal(c.byId('archiveScore').disabled,false);assert.match(c.byId('copyStatus').textContent,/取消/);
 let finishName;c.AppDialogs.askName=()=>new Promise(resolve=>{finishName=resolve});const pendingSave=c.saveScoreArchive();await c.saveScoreArchive();assert.equal(puts,beforeCancel);finishName('单次保存');await pendingSave;assert.equal(puts,beforeCancel+1,'repeated clicks during naming create only one record');
 let opened=0;c.window.openScoreViewer=async()=>{opened++};await c.loadToScore(record,{fullscreen:true});assert.equal(opened,1);
 const oldText=c.byId('scoreInput').value;c.byId('scoreInput').value='未保存文字';c.AppDialogs.confirm=async()=>false;
 await c.loadToScore(record,{fullscreen:true});assert.equal(opened,1);assert.equal(c.byId('scoreInput').value,'未保存文字','cancel preserves the current draft and does not open the viewer');
 c.AppDialogs.confirm=async()=>true;c.byId('scoreInput').value=oldText;
 console.log('PASS: linked repeated save without duplicates/prompts, copy/detach, settings restoration, page mapping, attachment/note/date preservation, deletion/conflict/write-failure protection.');
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-08 23:47:33
