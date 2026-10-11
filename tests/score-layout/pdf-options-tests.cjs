const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const view=fs.readFileSync('web/score-view.js','utf8'),c=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync('web/jianpu.js','utf8'),c);const J=c.window.Jianpu;
vm.runInContext(view.slice(view.indexOf('function reflowLines('),view.indexOf('function paginateStaffLines(')),c);
const original=J.parse("@title 连续导出\n@key 1=D\n@time 4/4\n@page 1\n(1 2) 3 4 |\n@page 2\n5 6 7 1' |\n@tempo 稍慢\n@page 3\n1 - - - |");
const controls={pdfKey:{value:'orig'},pdfReflow:{checked:false},pdfMeasures:{checked:true},pdfErhu:{checked:true},erhuFinger:{checked:false},transKey:{value:'2'},transMode:{value:'keep'},conversionCaption:{textContent:'caption'}};
let printed,optionsState;const annotations=new Map(original.notes.map(t=>[t,{finger:1}]));
c.$=id=>controls[id];c.pdfDlg={dataset:{n:'jp'},querySelector:s=>controls[s.slice(1)]};c.measureOn=false;c.lastConverted={source:original,lines:original.lines,keyLabel:'D'};c.F=l=>l.slice();c.KEY_NAMES={2:'D'};c.sheetTitle=()=> '连续导出';c.scoreParts=()=>original.parts;c.buildTransposed=()=>original.lines.slice();c.transAllLines=[];c.scoreDisplayOptions=()=>({measureEvery:4});c.erhuOpts=()=>({annotations,measureEvery:4});
c.printScoreSheet=(...args)=>{printed=args;optionsState=[c.measureOn,controls.erhuFinger.checked]};
vm.runInContext(view.slice(view.indexOf('function exportPdf(){'),view.indexOf("$('printScore').onclick",view.indexOf('function exportPdf(){'))),c);
const saved=J.serialize(original.lines),notes=Array.from(original.notes);
for(const n of ['jp','staff'])for(const key of ['orig','fixed','trans'])for(const reflow of [false,true]){
 c.pdfDlg.dataset.n=n;controls.pdfKey.value=key;controls.pdfReflow.checked=reflow;c.exportPdf();
 assert.equal(printed[3],n==='staff'?'staff':'jianpu');assert.equal(printed[0].some(l=>l.kind==='page'),!reflow,`${n}/${key}: checkbox controls fixed pages`);
 assert.deepEqual(Array.from(printed[0].filter(l=>l.kind==='music').flatMap(l=>l.tokens.filter(t=>t.t==='note'))),notes,'notes retain identity for fingering and measure maps');
 assert.ok(printed[0].some(l=>l.kind==='meta'&&l.name==='tempo'),'section headings retained');assert.deepEqual(optionsState,[true,true]);assert.equal(c.measureOn,false);assert.equal(controls.erhuFinger.checked,false);
 if(n==='jp'&&key==='orig')assert.equal(printed[5].annotations,annotations);
 assert.equal(J.serialize(original.lines),saved,'reflow only changes exported layout, never archive/source text');
}
// A page can also delimit two partial total-score systems with different visible parts.
const full=J.parse('@part A · 笛\n@part B · 胡\n@part C · 琴\n[A] 1 - |\n[B] 3 - |\n@page 2\n[C] 5 - |');
const flowing=c.reflowLines(full.lines);assert.ok(!flowing.some(l=>l.kind==='page'));
assert.equal(J.groupSystems(flowing).filter(b=>b.kind==='system').length,2,'page removal must not merge adjacent full-score systems');
console.log('PASS: PDF reflow toggle reaches all notation/key export routes; keeps notes, headings, fingering and source intact; full-score boundaries retained');
// Modified by AI on 2026-10-11 14:06:18
