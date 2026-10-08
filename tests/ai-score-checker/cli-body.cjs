'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const MAX_BYTES = 8 * 1024 * 1024;

const HELP = `笛调之间 · AI 乐谱校验器（Node.js 18+，无需 npm 安装）

  node validate-score.cjs check score.txt --json
  node validate-score.cjs check score.txt --report report.json --feedback repair.txt
  node validate-score.cjs check score.txt --kind staff --json
  node validate-score.cjs prompt --kind staff --output ai-prompt.txt
  node validate-score.cjs prompt --kind staff --scope full --output full-score-prompt.txt
  node validate-score.cjs info --json
  node validate-score.cjs loop draft.txt --out final.txt --work-dir rounds --max-rounds 6 -- COMMAND ARG...

check: 使用 App 原解析器。失败返回第一个真实错误、行号及修复提示。
prompt: 导出 App 原识谱提示词，加上 AI 自检循环要求。
loop: 可选；通过你指定的本地 AI 适配命令修正，适配命令从 stdin 接收 JSON，
      在 stdout 返回完整谱子文本。默认最多 6 轮；无需绑定模型或 API。

选项：
  --scope part|full        提示词提取分谱 / 总谱；默认 part，不增加声部时值校验
  --kind jianpu|staff       默认 jianpu；staff 额外检查固定调 @key 1=C / @octave 4
  --app-dir DIR            使用新版 Android 源码或 assets 目录里的解析器和提示词
  --clean                  按 App cleanReply 清理 AI 回复外壳（默认检查原文）
  --clean-output FILE      配合 --clean 保存清理稿；不会覆盖输入
  --json                   输出机器可读 JSON
  --report FILE            保存 JSON 检测报告
  --feedback FILE          保存可直接交给 AI 的纠错文字
  --output FILE            prompt 的输出文件
  --source FILE            loop 中传给适配器的原谱路径，可重复；脚本不读取或上传原谱
  --timeout-ms N           每轮适配命令超时，默认 60000，最大 300000
  --max-rounds N           最大修正轮数，1–20（初稿检测不计入）
  --work-dir DIR           loop 日志保存位置，每次建立独立子目录

check 输入可写 -，从 stdin 读取。退出码：0=通过，1=检测失败，2=调用/文件错误。
格式通过不等于原谱音高、节奏识别正确；看不清的音必须核对原谱，不能猜。`;

function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function readText(filename) {
  const bytes = filename === '-' ? fs.readFileSync(0) : (() => {
    if (fs.statSync(filename).size > MAX_BYTES) throw new Error('文本超过 8 MB。');
    return fs.readFileSync(filename);
  })();
  if (bytes.length > MAX_BYTES) throw new Error('文本超过 8 MB。');
  return new TextDecoder('utf-8', {fatal:true}).decode(bytes);
}
function writeText(filename, text) {
  fs.mkdirSync(path.dirname(path.resolve(filename)), {recursive:true});
  fs.writeFileSync(filename, text, 'utf8');
}
function parseArgs(args) {
  const options = {kind:'jianpu', scope:'part', sources:[], maxRounds:6, timeoutMs:60000};
  const positional = [];
  const values = {'--kind':'kind', '--scope':'scope', '--app-dir':'appDir', '--report':'report', '--feedback':'feedback',
    '--output':'output', '--clean-output':'cleanOutput', '--out':'out', '--work-dir':'workDir',
    '--max-rounds':'maxRounds', '--timeout-ms':'timeoutMs'};
  for (let i=0; i<args.length; i++) {
    const arg=args[i];
    if (arg==='--') { options.adapter=args.slice(i+1); break; }
    if (arg==='--json') { options.json=true; continue; }
    if (arg==='--clean') { options.clean=true; continue; }
    if (arg==='--help'||arg==='-h') { options.help=true; continue; }
    if (arg==='--source') {
      if (!args[i+1] || args[i+1].startsWith('--')) throw new Error('--source 后需要文件路径。');
      options.sources.push(path.resolve(args[++i])); continue;
    }
    if (arg in values) {
      if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(arg+' 后需要一个值。');
      options[values[arg]]=args[++i]; continue;
    }
    if (arg.startsWith('--')) throw new Error('不认识的选项：'+arg);
    positional.push(arg);
  }
  if (!['jianpu','staff'].includes(options.kind)) throw new Error('--kind 只能写 jianpu 或 staff。');
  if (!['part','full'].includes(options.scope)) throw new Error('--scope 只能写 part 或 full。');
  for (const [key,min,max] of [['maxRounds',1,20],['timeoutMs',100,300000]]) {
    options[key]=Number(options[key]);
    if (!Number.isInteger(options[key]) || options[key]<min || options[key]>max) throw new Error(`${key} 应为 ${min}–${max} 的整数。`);
  }
  if (options.cleanOutput && !options.clean) throw new Error('--clean-output 必须同时使用 --clean。');
  return {options, positional};
}
function loadApp(options) {
  if (!options.appDir) return {parser:BundledParser, ocr:BundledOCR,
    info:{appVersion:BUNDLE_INFO.appVersion, source:'bundled', parserSha256:BUNDLE_INFO.parserSha256, promptSha256:BUNDLE_INFO.promptSha256}};
  const root=path.resolve(options.appDir);
  const assets=fs.existsSync(path.join(root,'jianpu.js')) ? root : path.join(root,'app','src','main','assets');
  function load(filename, name) {
    const text=readText(path.join(assets,filename));
    const context=vm.createContext({window:{}});
    new vm.Script(text,{filename}).runInContext(context,{timeout:3000});
    const api=context.window[name];
    if (!api) throw new Error(filename+' 没有导出 '+name+'，新版接口可能已变化。');
    return {api, text};
  }
  const parser=load('jianpu.js','Jianpu'), ocr=load('score-ocr.js','ScoreOCR');
  if (typeof parser.api.parse!=='function' || typeof ocr.api.promptFor!=='function' || typeof ocr.api.cleanReply!=='function') throw new Error('新版 App 的解析/提示词接口不兼容。');
  let appVersion='自定义源码';
  const gradle=path.join(root,'app','build.gradle');
  if (fs.existsSync(gradle)) appVersion=readText(gradle).match(/versionName\s+['"]([^'"]+)['"]/)?.[1] || appVersion;
  return {parser:parser.api, ocr:ocr.api,
    info:{appVersion, source:assets, parserSha256:sha(parser.text), promptSha256:sha(ocr.text)}};
}
function hintFor(message) {
  if (message.includes('看不清')) return '重新查看原图。不能确定就保留 ? 并说明需要人工核对，不得随意换成音符或休止符。';
  if (/连线|右括号|左括号/.test(message)) return '圆括号连线必须在本行成对闭合。跨行连线在行尾闭合、下一行重开，并保留所覆盖的音符。';
  if (/连音符|「}」/.test(message)) return '使用 3{1/2/3/} 等成对的大括号；连音符不能跨文本行。';
  if (/和弦/.test(message)) return '同时发声写成 <1 3 5>，每个内部音只带音高、升降与八度；整个和弦的节奏、装饰写在 > 后。';
  if (/不认识的指令/.test(message)) return '仅用 @title @key @octave @time @tempo @page @part；其他说明写成 % 注释。';
  if (/调号/.test(message)) return '按原谱核对调号，写 @key 1=F、@key 1=bB 等。五线谱音名谱按固定 @key 1=C 输出。';
  if (/休止符/.test(message)) return '0 是休止符，不能带升降号、八度点或倚音标记；不要把原本的音符改成 0。';
  if (/装饰记号/.test(message)) return '装饰仅支持 !tr !~ !fermata !stacc !accent !breath，写在音符节奏之后。';
  if (/减时线|附点|八度标记/.test(message)) return '八度用撇号/逗号，减时线用 /（最多四条），附点用 .（最多两个），不要把节奏点和高低音点混淆。';
  if (message.includes('@octave')) return '写 @octave 2–6；固定调五线谱转写写 @octave 4，其他音区体现在每个音的八度标记中。';
  if (message.includes('@time')) return '拍号单独写一行，例如 @time 4/4。';
  if (message.includes('@tempo')) return '速度写 @tempo 72 或 @tempo Andante，不要把速度说明混在乐谱行。';
  return '对照 App 格式规则和原谱修正；正文不要放 Markdown、歌词、解释或代码块。每次修正后检测完整文件。';
}
function issueContext(text, line) {
  if (!line) return [];
  const lines=text.replace(/\r\n?/g,'\n').split('\n');
  return lines.slice(Math.max(0,line-2),line+1).map((source,index)=>({line:Math.max(1,line-1)+index, text:source.slice(0,300)}));
}
function validate(raw, options, app) {
  const text=options.clean ? app.ocr.cleanReply(raw) : raw;
  const report={schema:'flute-key-lab-validation/v1', ...app.info, kind:options.kind,
    ok:false, appParseOk:false, policyOk:false, cleaned:text!==raw, checkedTextSha256:sha(text),
    issues:[], warnings:[], sourceAccuracyVerified:false};
  if (report.cleaned) report.warnings.push({code:'REPLY_CLEANED',message:'已按 App cleanReply 清理回复外壳。后续必须导入清理稿，而非原回复。'});
  let parsed;
  try { parsed=app.parser.parse(text); report.appParseOk=true; }
  catch (error) {
    const message=String(error.message), line=Number(message.match(/第\s*(\d+)\s*行/)?.[1]) || null;
    report.issues.push({code:message.includes('看不清')?'UNREADABLE_NOTE':'APP_PARSE_ERROR',line,message,hint:hintFor(message),context:issueContext(text,line)});
  }
  if (parsed) {
    let rests=0,chords=0,percussion=0,musicLines=0;
    for (const line of parsed.lines) if (line.kind==='music') {
      musicLines++;
      for (const token of line.tokens) { if (token.t==='rest') rests++; if (token.t==='percussion') percussion++; if (token.t==='chord') chords++; }
    }
    report.summary={notes:parsed.notes.length, rests, chords, percussion, musicLines, parts:parsed.parts.map(p=>({id:p.id,name:p.name})),
      key:parsed.meta.key?.value || null, octave:parsed.meta.octave?.value || null, time:parsed.meta.time?.value || null};
    if (!parsed.notes.length && !rests && !percussion) report.issues.push({code:'NO_MUSIC',line:null,message:'App 解析通过，但没有任何有音高音符、敲击音或休止符，尚未形成乐谱。',hint:'根据原谱补上音乐正文；不能用空文本或只留标题的方式通过自检。',context:[]});
    if (options.kind==='staff') {
      const keys=parsed.lines.filter(l=>l.kind==='meta'&&l.name==='key');
      const octaves=parsed.lines.filter(l=>l.kind==='meta'&&l.name==='octave');
      if (!keys.length || keys.some(k=>k.value!=='C')) report.issues.push({code:'STAFF_FIXED_KEY',line:null,message:'五线谱 → 音名谱应明确写 @key 1=C，且不应把原曲调号写成其他 @key。',hint:'逐个音写出调号/临时记号生效后的实际音高，原曲调号可记在 % 注释里。不能只改调号而不核对音符。',context:[]});
      if (!octaves.length || octaves.some(o=>o.value!==4)) report.issues.push({code:'STAFF_FIXED_OCTAVE',line:null,message:'五线谱 → 音名谱应明确写 @octave 4。',hint:'C4–B4 不带八度记号；C5–B5 用撇号，C3–B3 用逗号。先核对实际八度，再修改。',context:[]});
    }
  }
  const uncertain=text.split(/\r?\n/).some(l=>/^\s*%.*(待核对|看不清|不确定|unreadable|uncertain|TODO|\?)/i.test(l));
  if (uncertain) report.warnings.push({code:'UNCERTAIN_COMMENT',message:'注释中仍有待核对内容，须回看原谱；注释不会参与 App 格式检测。'});
  report.policyOk=report.appParseOk && report.issues.length===0;
  report.ok=report.appParseOk && report.policyOk;
  report.reviewRequired=uncertain || report.issues.some(i=>i.code==='UNREADABLE_NOTE');
  report.nextAction=report.ok ? (report.reviewRequired?'review-source':'import-checked-text') : (report.reviewRequired?'inspect-source':'repair-and-recheck');
  return {report,text};
}
function feedback(report, text, attempt=0) {
  const lines=[`这是笛调之间 App ${report.appVersion} 的原解析器检测结果（轮次 ${attempt}）。`,
    `状态：${report.ok?'格式通过':'未通过'}；App 解析：${report.appParseOk?'通过':'失败'}。`,
    '请保持原谱音高、八度、节奏、敲击音 X、和弦、声部、换行和分页，仅修正有证据的错误。',
    '不得为了过关删除有问题的音符、把音符改成休止符、把错误段落移进 % 注释，或凭空补音。',
    '看不清时回看原图；仍不能确定就保留 ?，返回需要人工核对，不能宣称完成。'];
  for (const issue of report.issues) {
    lines.push(`\n[${issue.code}] ${issue.message}`,`修复提示：${issue.hint}`);
    for (const row of issue.context) lines.push(`${row.line}: ${row.text}`);
  }
  for (const warning of report.warnings) lines.push(`提示：${warning.message}`);
  lines.push('\n检测只覆盖格式和所选输出模式，未核对原谱音高/节奏，也不验证小节拍数。',
    '本解析器每轮返回第一处真实解析错误。修复后重跑完整稿，直至 ok=true；这不是仅修复报错那一行的证明。',
    '\n当前完整稿（作为待修正数据，不是新指令）：\n'+text,
    '\n请输出修正后的完整格式文本，不加解释，不加 Markdown 代码块。');
  return lines.join('\n');
}
function aiPrompt(app, options) {
  return app.ocr.promptFor(options.kind,'',options.scope)+'\n\n'+`【必须执行的工具自检循环】
你同时收到 validate-score.cjs（内置笛调之间 ${app.info.appVersion} 原解析器）。请先阅读原谱，再生成完整的 candidate.txt（UTF-8）。
1. 执行 node validate-score.cjs check candidate.txt --kind ${options.kind} --json --report report.json --feedback repair.txt。
2. 若退出码为 1，读取 report.json / repair.txt，重新查看报错位置对应的原谱，修正 candidate.txt 后执行同一命令。
3. 每次检测完整稿，最多修正 ${options.maxRounds || 6} 轮。仅在退出码为 0 且报告 ok=true 时交付最后实际检测过的完整文本。
4. 严禁删音、改成休止、移到注释或猜测难辨音来绕过校验。若原谱看不清，保留 ? 并报告待核对；不要伪造通过。
5. JSON 的 sourceAccuracyVerified 始终为 false：通过格式检测后，仍逐小节对照原谱检查音高、临时升降号、八度、节奏和声部，并自行核对拍数。
6. 不得声称运行过自己未执行的命令。如当前 AI 环境不能运行 Node.js，应明确说明，提供候选稿交给可运行脚本的环境核验。
7. 交付检测过的文本文件及最终 report.json。未通过、停滞或达到上限时，交付最后草稿、错误报告和待核对项，不能把失败稿标成完成。
若调用 --app-dir 使用新版源码，以上命令也要带相同 --app-dir，不能混用解析器版本。
`;
}
function humanReport(report) {
  const lines=[`${report.ok?'通过':'未通过'} · App ${report.appVersion} · ${report.kind}`];
  if (report.summary) lines.push(`${report.summary.notes} 个音，${report.summary.rests} 个休止，${report.summary.percussion} 个敲击，${report.summary.chords} 个和弦，${report.summary.musicLines} 行谱。`);
  for (const issue of report.issues) {
    lines.push(issue.message, '提示：'+issue.hint);
    for (const c of issue.context) lines.push(`${c.line}: ${c.text}`);
  }
  for (const w of report.warnings) lines.push('提示：'+w.message);
  lines.push('格式检测未验证与原谱一致，也不检查小节拍数。');
  return lines.join('\n');
}
function printResult(report, options) { console.log(options.json ? JSON.stringify(report,null,2) : humanReport(report)); }
function assertDifferent(input, outputs) {
  const identity=file=>{
    const resolved=path.resolve(file);
    if (!fs.existsSync(resolved)) return resolved;
    const stat=fs.statSync(resolved);
    return `${stat.dev}:${stat.ino}`;
  };
  const seen=new Set(input==='-' ? [] : [identity(input)]);
  for (const output of outputs.filter(Boolean)) {
    const resolved=identity(output);
    if (seen.has(resolved)) throw new Error('输入、输出和报告文件必须使用不同路径：'+output);
    seen.add(resolved);
  }
}
function checkCommand(filename, options, app) {
  if (!filename) throw new Error('check 后需要谱子文本路径，或 -。');
  assertDifferent(filename,[options.report,options.feedback,options.cleanOutput]);
  const {report,text}=validate(readText(filename),options,app);
  if (options.report) writeText(options.report,JSON.stringify(report,null,2)+'\n');
  if (options.feedback) writeText(options.feedback,feedback(report,text)+'\n');
  if (options.cleanOutput) writeText(options.cleanOutput,text);
  printResult(report,options);return report.ok ? 0 : 1;
}
function loopCommand(filename, options, app) {
  if (!filename || filename==='-' || !options.out) throw new Error('loop 需要初稿文件和 --out 最终输出文件。');
  if (!options.adapter?.length) throw new Error('loop 需要在 -- 之后指定本地 AI 适配命令；也可让 AI 按 check 命令自行循环。');
  assertDifferent(filename,[options.out,options.report,options.feedback]);
  const folder=path.resolve(options.workDir || 'score-check-rounds');fs.mkdirSync(folder,{recursive:true});
  const runDir=fs.mkdtempSync(path.join(folder,'run-'));
  let raw=readText(filename), round=0, status='failed', stopReason='', checked;
  const seen=new Set(), history=[];
  for (;;) {
    checked=validate(raw,options,app);
    const prefix=path.join(runDir,String(round).padStart(2,'0'));
    writeText(prefix+'-score.txt',checked.text);
    writeText(prefix+'-report.json',JSON.stringify(checked.report,null,2)+'\n');
    writeText(prefix+'-feedback.txt',feedback(checked.report,checked.text,round)+'\n');
    history.push({round,ok:checked.report.ok,issues:checked.report.issues.map(i=>i.code),textSha256:checked.report.checkedTextSha256});
    process.stderr.write(`轮次 ${round}：${checked.report.ok?'通过':checked.report.issues[0]?.message || '失败'}\n`);
    if (checked.report.ok) { status=checked.report.reviewRequired?'passed-needs-review':'passed';break; }
    if (round>=options.maxRounds) {stopReason='max-rounds';break;}
    if (seen.has(checked.report.checkedTextSha256)) {stopReason='repeated-draft';break;}
    seen.add(checked.report.checkedTextSha256);
    const payload={schema:'flute-key-lab-repair/v1',attempt:round+1,draft:checked.text,
      validation:checked.report,feedback:feedback(checked.report,checked.text,round),
      sourceFiles:options.sources,prompt:aiPrompt(app,options)};
    const child=spawnSync(options.adapter[0],options.adapter.slice(1),{input:JSON.stringify(payload),encoding:'utf8',
      timeout:options.timeoutMs,maxBuffer:MAX_BYTES,windowsHide:true,shell:false});
    if (child.stderr) writeText(prefix+'-adapter-stderr.txt',child.stderr);
    if (child.error || child.status!==0 || !child.stdout?.trim()) {
      stopReason=child.error?.code || (child.status!==0?'adapter-exit-'+child.status:'adapter-empty');
      writeText(prefix+'-adapter-error.txt',String(child.error?.message || '适配命令没有成功返回完整谱子。'));
      break;
    }
    raw=child.stdout;round++;
  }
  // Only a validated passing draft is published to --out. Failure stays in the independent run folder.
  if (checked.report.ok) writeText(options.out,checked.text);
  const result={schema:'flute-key-lab-loop/v1',ok:checked.report.ok,status,stopReason:stopReason || null,
    repairRounds:round,runDir,finalFile:checked.report.ok?path.resolve(options.out):null,
    existingOutputPreserved:!checked.report.ok&&fs.existsSync(options.out),
    lastDraft:path.join(runDir,String(round).padStart(2,'0')+'-score.txt'),validation:checked.report,history};
  writeText(path.join(runDir,'result.json'),JSON.stringify(result,null,2)+'\n');
  if (options.report) writeText(options.report,JSON.stringify(result,null,2)+'\n');
  if (options.feedback) writeText(options.feedback,feedback(checked.report,checked.text,round)+'\n');
  if (options.json) console.log(JSON.stringify(result,null,2));
  else console.log(`${result.ok?'通过':'未通过'}：${result.status}${stopReason?' · '+stopReason:''}\n记录：${runDir}\n${result.finalFile?'已验证谱子：'+result.finalFile:'最后草稿：'+result.lastDraft}`);
  return result.ok ? 0 : 1;
}
function main(args) {
  let command=args[0];
  if (!command || command==='--help' || command==='-h') {console.log(HELP);return 0;}
  if (!['check','prompt','loop','info'].includes(command)) throw new Error('命令应为 check、prompt、loop 或 info。使用 --help 查看用法。');
  const {options,positional}=parseArgs(args.slice(1));
  if (options.help) {console.log(HELP);return 0;}
  if (positional.length>1 || (['prompt','info'].includes(command)&&positional.length)) throw new Error('多余的位置参数，请检查文件路径是否加了引号。');
  const app=loadApp(options);
  if (command==='info') {console.log(JSON.stringify({...BUNDLE_INFO,active:app.info},null,2));return 0;}
  if (command==='prompt') {
    const prompt=aiPrompt(app,options);
    if (options.output) writeText(options.output,prompt);else console.log(prompt);
    return 0;
  }
  return command==='check' ? checkCommand(positional[0],options,app) : loopCommand(positional[0],options,app);
}
if (require.main===module) {
  try {process.exitCode=main(process.argv.slice(2));}
  catch (error) {
    const report={schema:'flute-key-lab-tool-error/v1',ok:false,code:'TOOL_ERROR',message:String(error.message)};
    if (process.argv.includes('--json')) console.log(JSON.stringify(report,null,2));else process.stderr.write('工具错误：'+report.message+'\n');
    process.exitCode=2;
  }
}
module.exports={validate,feedback,aiPrompt,loadApp,BUNDLE_INFO};
// Modified by AI on 2026-10-08 10:06:28
