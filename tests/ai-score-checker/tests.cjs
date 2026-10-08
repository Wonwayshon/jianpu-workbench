const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const base=process.cwd(),file=path.join(base,'outputs/ai-score-checker/validate-score.cjs'),tool=require(file);
const app=tool.loadApp({}),opts={kind:'jianpu'},root=path.join(base,'tests/ai-score-checker/test-runs');fs.mkdirSync(root,{recursive:true});
const source=fs.readFileSync(path.join(base,'web/jianpu.js'),'utf8');const context=vm.createContext({window:{}});new vm.Script(source).runInContext(context);
assert.equal(tool.BUNDLE_INFO.parserSha256,crypto.createHash('sha256').update(source).digest('hex'));
const cases=[
 '1 2 3 | 4 5 6 7 ||',
 '@title 单声部\n@key 1=F\n@time 2/4\n@tempo Andante\n(1/2/ 3/5/) | 6 5 | 3//2//1//2// 3/.5// | 6 - |',
 "3{5'/6'/5'/} 3'/2'/ | ^2'1'!tr 6/5/ | 5. 3/ | (5 - | 5) 0 ||",
 '@key 1=G\n@octave 4\nG4 A4 B4 C5 F#4 | <G3 D4 B4>/',
 '@part 笛 · 竹笛\n@part 胡 · 二胡\n[笛] 1/2/ 3 4 |\n[胡] <1, 5,> - 0 |',
 "１ 2",'1 ?',"(1 2\n3 4)",'3{1/2/3/','1!unknown','<1>','<1 3/ 5>','@key 1=H\n1','@octave 9\n1','@tempo fast\n1','@foo 2\n1','0̇','1/////','1...','```text\n1 2\n```',
 "@key 1=bB\nBb3 C4 D4 |",'1 b7 ♮7 #4', '0 - - - ||', 'C4 E4 G4', '1 (2 3) 4', '@key 1=C\n<1 3 5>!fermata'
];
for(const text of cases){let pass=true,msg='';try{context.window.Jianpu.parse(text)}catch(e){pass=false;msg=e.message}const report=tool.validate(text,opts,app).report;assert.equal(report.appParseOk,pass,text);if(!pass)assert.equal(report.issues[0].message,msg,text);}
assert.equal(tool.validate('1 ?',{kind:'jianpu'},app).report.reviewRequired,true);
assert.equal(tool.validate('',opts,app).report.appParseOk,true);assert.equal(tool.validate('',opts,app).report.ok,false);
assert.equal(tool.validate('@title 无谱子',opts,app).report.ok,false);
assert.equal(tool.validate('1 2',{kind:'staff'},app).report.ok,false);
assert.equal(tool.validate('@key 1=C\n@octave 4\n#4 4 1̇',{kind:'staff'},app).report.ok,true);
assert.equal(tool.validate('@key 1=G\n@octave 4\n1 2',{kind:'staff'},app).report.appParseOk,true);
assert.equal(tool.validate('@key 1=G\n@octave 4\n1 2',{kind:'staff'},app).report.ok,false);
const cleaned=tool.validate('```text\n1 2\n```',{kind:'jianpu',clean:true},app);assert.equal(cleaned.report.ok,true);assert.equal(cleaned.text,'1 2');
assert.equal(tool.validate('% 待核对原图\n1 2',opts,app).report.sourceAccuracyVerified,false);
assert.equal(tool.validate('% 待核对原图\n1 2',opts,app).report.reviewRequired,true);
const dynamic=tool.loadApp({appDir:base});assert.equal(dynamic.info.parserSha256,app.info.parserSha256);assert.equal(dynamic.info.promptSha256,app.info.promptSha256);
assert.match(tool.aiPrompt(app,{kind:'staff'}),/高音谱号/);assert.match(tool.aiPrompt(app,{kind:'jianpu'}),/必须执行的工具自检循环/);
assert.match(tool.aiPrompt(app,{kind:'staff',scope:'full'}),/提取范围：总谱/);
assert.match(tool.aiPrompt(app,{kind:'jianpu',scope:'part'}),/提取范围：分谱/);
function run(args){const r=spawnSync(process.execPath,[file,...args],{encoding:'utf8'});return {...r,json:JSON.parse(r.stdout)}}
const input=path.join(root,'bad.txt');fs.writeFileSync(input,'(1 2 | 3 4\n5!unknown 0 |');
const report=path.join(root,'report.json'),feedback=path.join(root,'feedback.txt');
let r=run(['check',input,'--json','--report',report,'--feedback',feedback]);assert.equal(r.status,1);assert.equal(r.json.issues[0].line,1);assert.match(fs.readFileSync(feedback,'utf8'),/不能/);
assert.equal(run(['check',path.join(root,'missing.txt'),'--json']).status,2);
assert.equal(run(['check',input,'--json','--report',input]).status,2);
const link=path.join(root,'input-alias.txt');if(!fs.existsSync(link))fs.symlinkSync(input,link);assert.equal(run(['check',input,'--json','--report',link]).status,2);
const adapter=path.join(base,'tests/ai-score-checker/test-adapter.cjs');
function loop(mode,max=6){const out=path.join(root,mode+'-final.txt');return run(['loop',input,'--json','--out',out,'--work-dir',root,'--max-rounds',String(max),'--timeout-ms',mode==='timeout'?'100':'2000','--',process.execPath,adapter,mode]);}
r=loop('repair');assert.equal(r.status,0);assert.equal(r.json.repairRounds,2);assert.equal(r.json.validation.ok,true);assert.equal(fs.readFileSync(input,'utf8'),'(1 2 | 3 4\n5!unknown 0 |');assert.equal(run(['check',r.json.finalFile,'--json']).status,0);
r=loop('repeat');assert.equal(r.status,1);assert.equal(r.json.stopReason,'repeated-draft');assert.equal(r.json.finalFile,null);
r=loop('cycle');assert.equal(r.status,1);assert.equal(r.json.stopReason,'repeated-draft');
r=loop('max',2);assert.equal(r.status,1);assert.equal(r.json.stopReason,'max-rounds');assert.equal(r.json.repairRounds,2);assert.equal(r.json.finalFile,null);
r=loop('exit');assert.equal(r.status,1);assert.equal(r.json.stopReason,'adapter-exit-7');
r=loop('empty');assert.equal(r.status,1);assert.equal(r.json.stopReason,'adapter-empty');
r=loop('timeout');assert.equal(r.status,1);assert.equal(r.json.stopReason,'ETIMEDOUT');
const old=path.join(root,'repeat-final.txt');fs.writeFileSync(old,'1 2 3');r=loop('repeat');assert.equal(r.json.existingOutputPreserved,true);assert.equal(fs.readFileSync(old,'utf8'),'1 2 3');
console.log('PASS: '+cases.length+' cases match App parsing; staff mode; cleaning; uncertain source; exit codes; same-file guard; two-round repair; stagnation/cycle/limit/failure/timeout; failure preserves existing output.');
// Modified by AI on 2026-10-08 10:06:28
