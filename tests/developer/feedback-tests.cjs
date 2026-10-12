const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),zlib=require('node:zlib'),{Transform}=require('node:stream');
class Deflate{constructor(){return Transform.toWeb(zlib.createDeflateRaw())}}class Inflate{constructor(){return Transform.toWeb(zlib.createInflateRaw())}}
const c=vm.createContext({window:{DecompressionStream:Inflate},document:{readyState:'loading',addEventListener(){},querySelector(){return {content:'test-version'}}},CompressionStream:Deflate,DecompressionStream:Inflate,Blob,TextEncoder,TextDecoder,Response,btoa,atob,setTimeout,clearTimeout,console});
for(const name of ['security-limits','library','share','jianpu','erhu-fingering','archive-workspace','developer-decoder','erhu-developer']){vm.runInContext(fs.readFileSync('web/'+name+'.js','utf8'),c);Object.assign(c,c.window)}
const D=c.ErhuDeveloper,S=c.ScoreShare,L=c.ScoreLibrary,J=c.Jianpu,A=c.ArchiveWorkspace;
const record=(text,page=1)=>({id:'exercise',title:'练习',updatedAt:'2026-01-02T00:00:00Z',settings:{key:'2',octave:'4',shift:'0'},results:[{page,text}],note:'PRIVATE-NOTE',fileId:'PRIVATE-FILE',fileName:'PRIVATE-FILE.pdf',apiKey:'PRIVATE-CREDENTIAL'});
(async()=>{
 const clean=record("@key 1=D\n@part 胡 · 二胡\n[胡] 1/2/ 3/5/ |\n@page 2\n[胡] 1'/2'/ 3'/5'/ |");
 assert.equal(D.count(clean),0,'part labels and source page markers are not corrections');
 const text=clean.results[0].text,token=J.parse(text).notes[4],after=text.slice(0,text.indexOf("1'/2'/"))+text.slice(text.indexOf("1'/2'/")).replace("1'/","1'/[外一↓]");
 D.begin(clean);D.recordEdit(text,after,token,{string:1,finger:3},{string:1,finger:1,shift:'up'},'62,69');
 const attached=D.attach(record(after),after),h=attached.results[0].erhuEdits;
 assert.equal(h.c[0][0],4,'embedded @page does not reset the archive row note index');assert.equal(h.c[0][3],'外三');assert.equal(h.c[0][4],'外一 ↓');
 assert.ok(D.checkedHistory(h,after));assert.equal(D.checkedHistory(h,after+' 6'),undefined,'changed musical text invalidates historical positions');
 assert.equal(D.count(attached),1);assert.equal(D.changesFor(attached)[0][6],'编辑时实录');
 const old=record("@key 1=D\n[胡] 1[内一] 2 3 5[外〇] |"),info=D.changesFor(old);assert.equal(info.length,2);assert.ok(info.every(x=>x[6]==='当前算法重算'));
 const items=await D.collect([clean,attached,old]);assert.equal(items.length,2,'unmodified archives automatically excluded');
 const prompt=D.promptFor(items);for(const secret of ['PRIVATE-NOTE','PRIVATE-FILE','PRIVATE-CREDENTIAL'])assert.ok(!prompt.includes(secret),'whitelist prevents archive metadata leaking');
 for(const item of items){const decoded=await D.decode(item.code);assert.equal(decoded.record.title,item.title);assert.equal(JSON.stringify(decoded.record.results.map(x=>x.text)),JSON.stringify(item.payload.p.map(x=>x[1])));assert.equal(decoded.changes.length,item.count);assert.equal(require('../../web/developer-decoder.js').decode(item.code).t,item.title)}
 const d=await D.decode(items[0].code);assert.equal(D.changesFor(d.record)[0][4],items[0].payload.c[0][4],'developer import preserves the actual original before for re-export');const bad={...items[0].payload,c:items[0].payload.c.map(x=>[x[0],999999,...x.slice(2)])};await assert.rejects(D.decode(await S.pack(bad,'DTZJD1:')),/位置/);
 const oversized='DTZJD1:'+zlib.deflateRawSync(Buffer.from('x'.repeat(3*1024*1024))).toString('base64url');await assert.rejects(D.decode(oversized),/限制/);
 const marked=record("@key 1=D\n1[内一] 2/3/ 5[外〇] |\n".repeat(20));const regular=await S.encode(marked),short=await S.encode(marked,{text:true});assert.ok(short.length<regular.length);assert.ok(!/\s/.test(short));assert.equal((await S.decode(short)).pages[0].text,marked.results[0].text);assert.equal((await S.decode(regular)).pages[0].text,marked.results[0].text);
 const raw=JSON.parse(zlib.inflateRawSync(Buffer.from(S.b45decode(regular.slice(6)))));assert.equal(raw.p[0][1],marked.results[0].text,'legacy official decoder can preserve all manual corrections');
 const entries=[{name:'改善提示词.md',text:prompt},{name:'decode-feedback.cjs',text:c.DeveloperDecoder.source}],stored=await L.makeZip(entries),compressed=await L.makeZip(entries,{compress:true});assert.ok(compressed.size<stored.size*.8,'ZIP actually compresses prose and decoder, not just suffix change');
 const bytes=new Uint8Array(await compressed.arrayBuffer());assert.equal(new DataView(bytes.buffer).getUint16(8,true),8);const unzipped=await L.readZip(compressed);assert.equal(unzipped.length,2);assert.equal(await unzipped[0].blob.text(),prompt);assert.ok(unzipped.every(x=>!x.name.endsWith('.pdf')&&!x.name.endsWith('-score.txt')));
 // Reopening, another edit, restoring an original manual value, and isolated archive pages.
 D.begin(attached);const t2=J.parse(after).notes[4],after2=after.replace('[外一↓]','[外二]');D.recordEdit(after,after2,t2,{string:1,finger:1},{string:1,finger:2},'auto');const h2=D.attach(record(after2),after2).results[0].erhuEdits;assert.equal(h2.c[0][3],'外三','first before survives subsequent saves');
 const reset=after2.replace('[外二]','');D.recordEdit(after2,reset,J.parse(after2).notes[4],{string:1,finger:2},{string:1,finger:3},'auto');assert.equal(D.attach(record(reset),reset).results[0].erhuEdits,undefined,'returning to original automatic state removes the net change');
 const multi={...clean,results:[{page:4,text:'1[内一] 2 3 |'},{page:7,text:'1 2 3 |'}]},subset=record('1 2 3 |',7);D.begin(multi,[7]);D.recordEdit(subset.results[0].text,'1 2[内二] 3 |',J.parse(subset.results[0].text).notes[1],{finger:1,string:0},{finger:2,string:0},'auto');const saved=D.attach({...multi,results:[multi.results[0],{page:7,text:'1 2[内二] 3 |'}]},'1 2[内二] 3 |');assert.equal(saved.results[1].erhuEdits.c[0][0],1);assert.equal(D.changesFor(saved).length,2);const copy=D.attach(record('1 2[内二] 3 |'),'1 2[内二] 3 |');assert.equal(copy.results[0].erhuEdits.c[0][0],1,'save-as rebases a selected source page to archive page 1');
 console.log(`PASS: actual before/after archive records, old-score recomputation, multi-page note locations, net-change reset, compressed ZIP, offline decoder, privacy whitelist and compatible/short sharing (${regular.length} → ${short.length} chars; ZIP ${stored.size} → ${compressed.size} bytes).`);
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-12 09:44:14
