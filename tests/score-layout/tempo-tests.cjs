const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root='web/';
class El{constructor(){this.children=[];this.style={};this.classList={add(){},toggle(){}};this.clientWidth=0}replaceChildren(){this.children=[]}append(x){this.children.push(x)}querySelectorAll(){return []}querySelector(){return null}}
const c=vm.createContext({window:{},document:{createElement:()=>new El()}});
for(const file of ['jianpu.js','staff.js'])vm.runInContext(fs.readFileSync(root+file,'utf8'),c);
const J=c.window.Jianpu,S=c.window.Staff,ABC=require('../../web/vendor/abcjs/abcjs-basic-min.js');
const words=['稍慢','稍快','自由地(随意伸缩)','逐渐加快','不认识的词','突慢','原速','渐慢','中板','欢快地','小快板','快板'];
for(const word of words){
 const input='@tempo '+word+'\n1 2 3 4 |\n@tempo '+word+'\n5 6 7 1 |';
 const p=J.parse(input),mark=p.meta.tempo;assert.equal(mark.text,word);
 assert.equal(J.serialize(p.lines),input);assert.equal(J.parse(J.serialize(p.lines)).meta.tempo.text,word);
 if(['稍慢','稍快','自由地(随意伸缩)','逐渐加快','不认识的词','突慢','原速','渐慢','欢快地'].includes(word))assert.equal(mark.value,null);
 else assert.ok(mark.value>=20&&mark.value<=300);
 const host=new El();J.render(host,[mark],{fit:false});const label=host.children[0].children[0].textContent;assert.ok(label.includes(word));assert.ok(!/null|undefined|NaN/.test(label));if(mark.value==null)assert.equal(label,word);
 for(const t of p.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1];
 const abc=S.toABC(p.lines,{keyLabel:'C'}).abc;assert.ok(!/null|undefined|NaN/.test(abc));assert.ok(abc.includes('Q:"'+word+'"'));assert.ok(abc.includes('[Q:"'+word+'"'));
 const parsed=ABC.parseOnly(abc)[0];assert.ok(!parsed.warnings?.length,JSON.stringify(parsed.warnings));
 const numbered=J.parse('@tempo '+word+' 72\n1');assert.equal(numbered.meta.tempo.value,72);assert.equal(numbered.meta.tempo.exact,true);assert.equal(J.serialize(numbered.lines),'@tempo '+word+' 72\n1');
}
for(const word of ['Andante','Allegro 132','行板','72'])assert.ok(J.parse('@tempo '+word).meta.tempo.value);
for(const raw of ['渐慢 10','9999','0','稍快 301','自由地 12.5','']){
 const p=J.parse('@tempo '+raw+'\n1 2 3 4 |');assert.equal(p.meta.tempo.value,null);assert.equal(p.meta.tempo.text,raw);assert.equal(p.warnings[0].code,'TEMPO_MANUAL');assert.equal(p.warnings[0].line,1);
 assert.equal(J.serialize(p.lines),'@tempo'+(raw?' '+raw:'')+'\n1 2 3 4 |');
}
assert.equal(J.parse('@tempo 稍快\n1').warnings.length,1);
assert.equal(J.parse('@tempo 稍快 96\n1').warnings.length,0);
assert.equal(J.parse('@tempo Andante\n1').warnings.length,0);
vm.runInContext(fs.readFileSync('web/player.js','utf8'),c);
const custom=J.parse('@tempo 任意速度文字\n1 2 3 4 |'),plain=J.parse('1 2 3 4 |');
assert.equal(c.window.ScorePlayer.duration(custom.lines,{tempo:96}),c.window.ScorePlayer.duration(plain.lines,{tempo:96}));
console.log('PASS: arbitrary tempo expressions parse/roundtrip/render/export to valid ABC, explicit BPM wins, text-only marks invent no BPM; manual-speed warnings do not block parsing or change playback duration.');
// Modified by AI on 2026-10-21 10:27:49
