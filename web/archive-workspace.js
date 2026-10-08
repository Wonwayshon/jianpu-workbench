'use strict';
// Map a score-workbench edit back to the exact archive pages that supplied it.
(() => {
function textFor(rows){return rows.length===1?rows[0].text:rows.map(r=>/^\s*@page\b/m.test(r.text)?r.text:'@page '+r.page+'\n'+r.text).join('\n\n')}
function bind(record,pages){const rows=record.results.filter(r=>pages?pages.includes(r.page):r.text.trim());return {id:record.id,title:record.title,rows:rows.map(r=>({...r})),text:textFor(rows)}}
function editedPages(binding,text){
 if(binding.rows.length===1)return new Map([[binding.rows[0].page,text]]);
 const marks=[...text.matchAll(/^\s*@page[ \t]+(\d+)[ \t]*(?:%[^\n]*)?$/gm)];
 if(marks.length!==binding.rows.length||marks.some((m,i)=>Number(m[1])!==binding.rows[i].page))throw new Error('跨页标记与原存档不一致。请保留原来的 @page 页码，或选择“另存为新存档”。');
 return new Map(marks.map((m,i)=>{const original=binding.rows[i],body=text.slice(m.index+m[0].length,i+1<marks.length?marks[i+1].index:text.length).trim();const prefix=i===0?text.slice(0,m.index).trim():'';return [original.page,[prefix,/^\s*@page\b/m.test(original.text)?'@page '+original.page:'',body].filter(Boolean).join('\n')]}));
}
function merge(fresh,binding,text,settings,convertedText,now){
 if(!fresh||fresh.deleted)throw new Error('原存档已被删除，请另存为新存档。');
 if(fresh.id!==binding.id)throw new Error('存档来源不匹配。');
 const edits=editedPages(binding,text);
 for(const old of binding.rows){const current=fresh.results.find(r=>r.page===old.page);if(!current||current.text!==old.text)throw new Error('原存档内容已在其他位置更新，请重新加载后编辑，或另存为新存档。')}
 return {...fresh,updatedAt:now,settings,results:fresh.results.map(row=>{if(!edits.has(row.page))return row;const value=edits.get(row.page);return {...row,text:value,reviewed:value===row.text&&row.reviewed,convertedText:binding.rows.length===1?convertedText:''}})};
}
window.ArchiveWorkspace={textFor,bind,editedPages,merge};
})();
// Modified by AI on 2026-10-08 10:06:28
