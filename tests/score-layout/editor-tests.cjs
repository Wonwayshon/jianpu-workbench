const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('web/score-view.js','utf8');
const cls=()=>{const s=new Set();return {contains:c=>s.has(c),add:c=>s.add(c),remove:c=>s.delete(c)}};
let next=1,timers=new Map(),flushes=0;
const c=vm.createContext({editTimer:0,editFocus:null,flushEdit:()=>flushes++,clearTimeout:id=>timers.delete(id),setTimeout:f=>{timers.set(next,f);return next++}});
vm.runInContext(code.slice(code.indexOf('function bindEditInput('),code.indexOf('// Each text line sits')),c);
const input={addEventListener(name,callback){this[name]=callback}};c.bindEditInput(input);input.oninput({});assert.equal(timers.size,1);input.compositionstart();assert.equal(timers.size,0);
input.oninput({isComposing:true});assert.equal(timers.size,0);input.compositionend();assert.equal(timers.size,1);
[...timers.values()][0]();assert.equal(flushes,1);
// One text parse/update per manual Save, and its exact note remains selected after annotation text changes.
let dispatches=0,rebuilds=0;const ta={value:'1/2/',dispatchEvent:()=>dispatches++};
const body={querySelector:()=>({scrollLeft:18})},status={};c.$=id=>({scoreInput:ta,viewerBody:body,copyStatus:status}[id]);c.Jianpu={normalize:s=>s};c.noteSlice=(line,t)=>line.slice(t.col,t.col+t.len);c.vEdit=true;c.viewerOpen=true;c.vIndex=3;c.rebuild=k=>{assert.equal(k,3);rebuilds++};c.Event=class{};
vm.runInContext(code.slice(code.indexOf('function writeErhu('),code.indexOf('// Removes every')),c);
c.writeErhu({line:1,col:0,len:2},'外二');assert.equal(ta.value,'1/[外二]2/');assert.equal(dispatches,1);assert.equal(rebuilds,1);assert.equal(c.editFocus.start,0);assert.equal(c.editFocus.end,6);assert.equal(c.editFocus.scrollLeft,18);
// Selection follows ranges and clears the previously selected row and note without timed removal.
const cells=Array.from({length:3},()=>({classList:cls(),isConnected:true}));const a={classList:cls(),dataset:{i:'0'},selectionStart:0,selectionEnd:4},b={classList:cls(),dataset:{i:'1'},selectionStart:0,selectionEnd:0};
const tokens=[{t:'note',col:0,len:2,_cell:cells[0]},{t:'note',col:2,len:2,_cell:cells[1]},{t:'rest',col:4,len:1,_cell:cells[2]}];
c.lineTokens=()=>tokens;body.contains=cell=>cells.includes(cell);body.querySelectorAll=selector=>selector==='.edit-selected'?[a,b].filter(e=>e.classList.contains('edit-selected')):cells.filter(e=>e.classList.contains('edit-selected-note'));
vm.runInContext(code.slice(code.indexOf('function markEditSelection('),code.indexOf('function caretFlash(')),c);
c.markEditSelection(a);assert.ok(a.classList.contains('edit-selected'));assert.deepEqual(cells.map(e=>e.classList.contains('edit-selected-note')),[true,true,false]);
c.markEditSelection(b);assert.ok(!a.classList.contains('edit-selected')&&b.classList.contains('edit-selected'));assert.deepEqual(cells.map(e=>e.classList.contains('edit-selected-note')),[true,false,false]);
a.selectionStart=a.selectionEnd=4;c.markEditSelection(a);assert.deepEqual(cells.map(e=>e.classList.contains('edit-selected-note')),[false,false,true]);
console.log('PASS: IME preserves pending input, fingering Save parses once and keeps exact selection, persistent preview/text selection clears previous highlights.');
// Modified by AI on 2026-10-11 14:36:43
