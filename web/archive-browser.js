'use strict';
// Library browsing is a view over existing records; it does not rewrite scores, files or sync timestamps.
(() => {
const defaults={search:'',range:'all',dateField:'updatedAt',from:'',to:'',type:'all',status:'all',order:'newest'};
const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function parseDay(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d);
 return localDay(date)===value?date:null;
}
function dateBounds(filters,now){
 const end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1),start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 if(filters.range==='all')return [-Infinity,Infinity];
 if(filters.range==='custom'){
  const a=filters.from?parseDay(filters.from):null,b=filters.to?parseDay(filters.to):null;
  if((filters.from&&!a)||(filters.to&&!b))throw new Error('请输入有效的起止日期。');
  if(a&&b&&a>b)throw new Error('开始日期不能晚于结束日期。');
  if(b)b.setDate(b.getDate()+1);
  return [a?+a:-Infinity,b?+b:Infinity];
 }
 if(filters.range==='7')start.setDate(start.getDate()-6);
 else if(filters.range==='30')start.setDate(start.getDate()-29);
 else if(filters.range==='month')start.setDate(1);
 return [+start,+end];
}
function fileType(r){
 if(!r.fileId)return 'text';
 if(/pdf/i.test(r.fileType)||/\.pdf$/i.test(r.fileName))return 'pdf';
 if(/word/i.test(r.fileType)||/\.docx?$/i.test(r.fileName))return 'word';
 return 'image';
}
function reviewStatus(r){
 const pages=r.results||[];
 if(!pages.some(p=>p.text?.trim()))return 'unrecognized';
 return pages.every(p=>p.text?.trim()&&p.reviewed)?'reviewed':'pending';
}
function monthKey(r,field){const d=new Date(r[field]);return Number.isFinite(+d)?localDay(d).slice(0,7):'unknown'}
const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase();
function query(records,options={},now=new Date()){
 const f={...defaults,...options},[from,to]=dateBounds(f,now),words=normalize(f.search).trim().split(/\s+/).filter(Boolean);
 return records.filter(r=>{
  if(r.deleted)return false;
  const time=Date.parse(r[f.dateField]);
  if(f.range!=='all'&&(!Number.isFinite(time)||time<from||time>=to))return false;
  if(f.type!=='all'&&fileType(r)!==f.type)return false;
  if(f.status!=='all'&&reviewStatus(r)!==f.status)return false;
  const text=normalize([r.title,r.note,r.fileName,r.sourceName].join(' '));
  return words.every(w=>text.includes(w));
 }).sort((a,b)=>{
  const ta=Date.parse(a[f.dateField])||0,tb=Date.parse(b[f.dateField])||0;
  return (f.order==='oldest'?ta-tb:tb-ta)||String(a.id).localeCompare(String(b.id));
 });
}
function create({byId,makeRow,now=()=>new Date()}){
 const ids={search:'archiveSearch',range:'archiveRange',dateField:'archiveDateField',from:'archiveFrom',to:'archiveTo',type:'archiveType',status:'archiveStatus',order:'archiveOrder'};
 let records=[],page=1,timer,folded=false;const pageSize=20,groups=new Map();
 try{folded=localStorage.getItem('flute.archiveFolded')==='1'}catch{}
 const read=()=>Object.fromEntries(Object.entries(ids).map(([key,id])=>[key,byId(id).value]));
 function render(){
  const filters=read(),list=byId('pdfArchiveList');list.replaceChildren();
  byId('archiveCustomDates').hidden=filters.range!=='custom';
  const error=byId('archiveFilterError');error.hidden=true;error.textContent='';
  let filtered;
  try{filtered=query(records,filters,now())}catch(e){error.textContent=e.message;error.hidden=false;filtered=[]}
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pages);
  const start=(page-1)*pageSize,visible=filtered.slice(start,start+pageSize);
  byId('archiveCount').textContent=`符合 ${filtered.length} / 共 ${records.length} 份${visible.length?` · 显示 ${start+1}–${start+visible.length}`:''}`;
  byId('archivePageLabel').textContent=`${page} / ${pages}`;
  byId('archivePrev').disabled=page<=1;byId('archiveNext').disabled=page>=pages;
  byId('archivePagination').hidden=filtered.length<=pageSize;
  byId('archiveCollapse').disabled=byId('archiveExpand').disabled=!filtered.length;
  if(!visible.length){
   const p=document.createElement('p');p.className='pdf-empty';p.textContent=!error.hidden?'请调整日期范围后查看。':records.length?'没有符合条件的存档，可清除筛选查看全部。':'谱库还是空的。到「导入识别」添加文件，或在转谱页保存乐谱。';list.append(p);return;
  }
  const totals=new Map();for(const r of filtered){const k=monthKey(r,filters.dateField);totals.set(k,(totals.get(k)||0)+1)}
  const onPage=new Map();for(const r of visible){const k=monthKey(r,filters.dateField);if(!onPage.has(k))onPage.set(k,[]);onPage.get(k).push(r)}
  for(const [month,items] of onPage){
   const key=filters.dateField+':'+month,group=document.createElement('details');group.className='archive-month';group.open=groups.has(key)?groups.get(key):!folded;
   const summary=document.createElement('summary');summary.textContent=`${month==='unknown'?'日期未知':month.replace('-', ' 年 ')+' 月'} · ${totals.get(month)} 份${items.length<totals.get(month)?`（本页 ${items.length} 份）`:''}`;
   const grid=document.createElement('div');grid.className='archive-month-grid';for(const r of items)grid.append(makeRow(r));
   group.append(summary,grid);group.addEventListener('toggle',()=>{if(group.isConnected)groups.set(key,group.open)});list.append(group);
  }
 }
 const changed=()=>{clearTimeout(timer);page=1;render()};
 for(const [key,id] of Object.entries(ids))byId(id).addEventListener(key==='search'?'input':'change',()=>{
  if(key==='search'){clearTimeout(timer);timer=setTimeout(changed,160)}else changed();
 });
 byId('archiveReset').onclick=()=>{for(const [key,id] of Object.entries(ids))byId(id).value=defaults[key];changed()};
 for(const [id,closed] of [['archiveCollapse',true],['archiveExpand',false]])byId(id).onclick=()=>{
  folded=closed;groups.clear();try{localStorage.setItem('flute.archiveFolded',closed?'1':'0')}catch{}render();
 };
 byId('archivePrev').onclick=()=>{if(page>1){page--;render()}};
 byId('archiveNext').onclick=()=>{page++;render()};
 return {setRecords(next){records=next;render()},render};
}
window.ArchiveBrowser={query,fileType,reviewStatus,monthKey,dateBounds,create};
})();
// Modified by AI on 2026-10-08 10:06:28
