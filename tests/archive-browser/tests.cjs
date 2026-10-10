const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class El{
 constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.value='';this.hidden=false;this.disabled=false;this.isConnected=true;this.classList={toggle(){}}}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){for(const n of this.children)if(typeof n==='object')n.isConnected=false;this.children=nodes}
 addEventListener(e,fn){this.listeners[e]=fn}
}
const elements=new Map(),byId=id=>{if(!elements.has(id))elements.set(id,new El());return elements.get(id)};
let timeout,stored=new Map();
const c=vm.createContext({window:{},document:{createElement:tag=>new El(tag)},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},setTimeout:f=>(timeout=f,1),clearTimeout(){}});
vm.runInContext(fs.readFileSync('web/archive-browser.js','utf8'),c);
const A=c.window.ArchiveBrowser,now=new Date(2026,9,6,14,30);
const local=(d,h=0,m=0)=>new Date(2026,9,d,h,m).toISOString();
const record=(id,date,extra={})=>({id,title:id,createdAt:local(1),updatedAt:date,results:[{page:1,text:'1 2',reviewed:false}],...extra});
const records=[record('older',local(-1)),record('start7',local(0)),record('today',local(6),{title:'江南风韵',note:'二胡 原谱'}),record('endToday',local(6,23,59)),record('tomorrow',local(7)),record('gone',local(6),{deleted:true})];
const ids=(opts)=>Array.from(A.query(records,opts,now),r=>r.id);
assert.deepEqual(ids({range:'today'}),['endToday','today']);
assert.deepEqual(ids({range:'7'}),['endToday','today','start7']);
assert.deepEqual(ids({range:'month'}),['endToday','today']);
assert.deepEqual(ids({range:'custom',from:'2026-10-06',to:'2026-10-06'}),['endToday','today']);
assert.deepEqual(ids({range:'custom',from:'2026-10-07'}),['tomorrow']);
assert.deepEqual(ids({range:'today',dateField:'createdAt'}),[]);
assert.deepEqual(ids({search:'风韵 二胡'}),['today']);assert.deepEqual(ids({search:'风韵 不存在'}),[]);
assert.throws(()=>A.query(records,{range:'custom',from:'2026-10-07',to:'2026-10-06'},now),/晚于/);
assert.throws(()=>A.query(records,{range:'custom',to:'2026-02-30'},now),/有效/);
assert.equal(A.monthKey(record('boundary',new Date(2026,9,1,0,1).toISOString()),'updatedAt'),'2026-10');
const leap=A.dateBounds({range:'custom',from:'2024-02-29',to:'2024-02-29'},now);assert.equal(new Date(leap[1]).getDate(),1);
const formats=[record('pdf',local(6),{fileId:'f1',fileName:'ＡＢＣ.PDF',results:[]}),record('word',local(5),{fileId:'f2',fileName:'原谱.docx',results:[{text:'1',reviewed:true}]}),record('image',local(4),{fileId:'f3',fileType:'image/jpeg'}),record('text',local(3))];
assert.deepEqual(Array.from(A.query(formats,{type:'pdf',search:'abc'},now),r=>r.id),['pdf']);
assert.deepEqual(Array.from(A.query(formats,{status:'unrecognized'},now),r=>r.id),['pdf']);
assert.deepEqual(Array.from(A.query(formats,{status:'reviewed'},now),r=>r.id),['word']);
assert.equal(A.reviewStatus({results:[{text:'1',reviewed:true},{text:'',reviewed:true}]}),'pending');
assert.deepEqual(Array.from(A.query(formats,{order:'oldest'},now),r=>r.id),['text','image','word','pdf']);
const unchanged=JSON.stringify(records);A.query(records,{range:'30'},now);assert.equal(JSON.stringify(records),unchanged);
const defaults={archiveSearch:'',archiveRange:'all',archiveDateField:'updatedAt',archiveFrom:'',archiveTo:'',archiveType:'all',archiveStatus:'all',archiveOrder:'newest'};
for(const [id,value] of Object.entries(defaults))byId(id).value=value;
let made=[];const browser=A.create({byId,now:()=>now,makeRow:r=>(made.push(r.id),new El('details'))});
const many=Array.from({length:45},(_,i)=>record('score-'+i,local(6,0,i)));
browser.setRecords(many);assert.equal(made.length,20);assert.equal(byId('archivePageLabel').textContent,'1 / 3');assert.equal(byId('archivePrev').disabled,true);
made=[];byId('archiveNext').onclick();assert.equal(made.length,20);assert.equal(byId('archivePageLabel').textContent,'2 / 3');
byId('archiveNext').onclick();assert.equal(byId('archiveNext').disabled,true);assert.match(byId('archiveCount').textContent,/41–45/);
byId('archiveCollapse').onclick();assert.ok(byId('pdfArchiveList').children.every(x=>!x.open));assert.equal(stored.get('flute.archiveFolded'),'1');
byId('archiveExpand').onclick();assert.ok(byId('pdfArchiveList').children.every(x=>x.open));
byId('archiveSearch').value='score-44';byId('archiveSearch').listeners.input();timeout();assert.match(byId('archiveCount').textContent,/符合 1 \/ 共 45/);assert.equal(byId('archivePagination').hidden,true);
byId('archiveSearch').value='不存在';byId('archiveSearch').listeners.input();timeout();assert.match(byId('pdfArchiveList').children[0].textContent,/没有符合/);
byId('archiveReset').onclick();assert.equal(byId('archivePageLabel').textContent,'1 / 3');
byId('archiveRange').value='custom';byId('archiveFrom').value='2026-10-07';byId('archiveTo').value='2026-10-06';byId('archiveRange').listeners.change();assert.equal(byId('archiveFilterError').hidden,false);assert.equal(byId('archiveCustomDates').hidden,false);
byId('archiveReset').onclick();byId('archiveNext').onclick();byId('archiveNext').onclick();browser.setRecords(many.slice(0,2));assert.equal(byId('archivePageLabel').textContent,'1 / 1');
browser.setRecords([]);assert.match(byId('pdfArchiveList').children[0].textContent,/谱库还是空/);

// Use the shipped validator and refresh/row code, not a copied implementation.
const pdf=fs.readFileSync('web/pdf-workbench.js','utf8');
c.byId=byId;c.ArchiveBrowser=A;c.crypto=require('node:crypto').webcrypto;c.sizeText=n=>n+' B';c.report=()=>{};c.state={};
vm.runInContext(pdf.slice(pdf.indexOf('  function checkedRecord('),pdf.indexOf('  function report(')),c);
const valid=c.checkedRecord(record('kept',local(6),{fileId:'file-test',fileName:'原.pdf',note:'原备注'}));assert.equal(valid.note,'原备注');assert.equal(valid.fileId,'file-test');
let loads=[];c.allArchives=()=>new Promise(resolve=>loads.push(resolve));
vm.runInContext(pdf.slice(pdf.indexOf('  let archiveBrowser='),pdf.indexOf('  async function importBackup(')),c);
(async()=>{
 const first=c.refreshArchives(),second=c.refreshArchives();loads[1]([record('new',local(6))]);await second;loads[0]([record('old',local(1)),record('old2',local(1))]);await first;
 assert.match(byId('archiveCount').textContent,/共 1 份/);assert.equal(byId('pdfRefresh').disabled,false);
 const row=c.archiveRow(valid);assert.equal(row.tag,'details');assert.equal(row.open,false);assert.equal(row.children[0].tag,'summary');
 const actions=row.children[1].children.filter(e=>e.tag==='button').map(e=>e.textContent);
 let fullOpen=null;c.loadToScore=async(r,opts)=>{fullOpen={id:r.id,fullscreen:!!opts?.fullscreen}};
 await row.children[1].children.find(e=>e.textContent==='打开').onclick();assert.deepEqual(fullOpen,{id:valid.id,fullscreen:true});
 await row.children[1].children.find(e=>e.textContent==='加载到转谱').onclick();assert.equal(fullOpen.fullscreen,false);
 assert.deepEqual(actions,['打开','校对识别','加载到转谱','分享','编辑','原文件','更换原文件','导出文字','删除']);
 console.log('PASS: local inclusive date boundaries, calendar ranges/leap day, search/type/status/sort, immutable records, bounded pagination, empty/reset/invalid filters, collapse/expand, stale refresh guard, existing management actions.');
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-11 05:55:14
