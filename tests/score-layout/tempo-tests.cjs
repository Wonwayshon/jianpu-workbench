const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root='web/';
class El{constructor(){this.children=[];this.style={};this.classList={add(){},toggle(){}};this.clientWidth=0}replaceChildren(){this.children=[]}append(x){this.children.push(x)}querySelectorAll(){return []}querySelector(){return null}}
const c=vm.createContext({window:{},document:{createElement:()=>new El()}});
for(const file of ['jianpu.js','staff.js'])vm.runInContext(fs.readFileSync(root+file,'utf8'),c);
const J=c.window.Jianpu,S=c.window.Staff,ABC=require('../../web/vendor/abcjs/abcjs-basic-min.js');
const words=['稍慢','突慢','原速','渐慢','中板','欢快地','小快板','快板'];
for(const word of words){
 const input='@tempo '+word+'\n1 2 3 4 |\n@tempo '+word+'\n5 6 7 1 |';
 const p=J.parse(input),mark=p.meta.tempo;assert.equal(mark.text,word);
 assert.equal(J.serialize(p.lines),input);assert.equal(J.parse(J.serialize(p.lines)).meta.tempo.text,word);
 if(['稍慢','突慢','原速','渐慢','欢快地'].includes(word))assert.equal(mark.value,null);
 else assert.ok(mark.value>=20&&mark.value<=300);
 const host=new El();J.render(host,[mark],{fit:false});const label=host.children[0].children[0].textContent;assert.ok(label.includes(word));assert.ok(!/null|undefined|NaN/.test(label));if(mark.value==null)assert.equal(label,word);
 for(const t of p.notes)t.midi=60+[0,2,4,5,7,9,11][t.degree-1];
 const abc=S.toABC(p.lines,{keyLabel:'C'}).abc;assert.ok(!/null|undefined|NaN/.test(abc));assert.ok(abc.includes('Q:"'+word+'"'));assert.ok(abc.includes('[Q:"'+word+'"'));
 const parsed=ABC.parseOnly(abc)[0];assert.ok(!parsed.warnings?.length,JSON.stringify(parsed.warnings));
 const numbered=J.parse('@tempo '+word+' 72\n1');assert.equal(numbered.meta.tempo.value,72);assert.equal(numbered.meta.tempo.exact,true);assert.equal(J.serialize(numbered.lines),'@tempo '+word+' 72\n1');
}
for(const word of ['Andante','Allegro 132','行板','72'])assert.ok(J.parse('@tempo '+word).meta.tempo.value);
assert.throws(()=>J.parse('@tempo 不认识的词'));assert.throws(()=>J.parse('@tempo 渐慢 10'));
console.log('PASS: all 8 Chinese tempo marks parse/roundtrip/render/export to valid ABC, explicit BPM wins, text-only marks invent no BPM; existing tempos and validation preserved.');
// Modified by AI on 2026-10-08 10:06:28
