const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class El{constructor(){this.children=[];this.style={};this.dataset={};this.className='';this.textContent='';this.attrs={};this.classList={toggle(){},add(){},remove(){}}}append(...els){this.children.push(...els)}replaceChildren(){this.children=[]}setAttribute(k,v){this.attrs[k]=v}querySelector(){return null}}
const nodes=new Map(),document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new El());return nodes.get(id)},createElement:()=>new El()};
const window={},timers=[];const c=vm.createContext({window,document,localStorage:{getItem:()=>null,setItem(){}},performance:{now:()=>100},setTimeout:fn=>timers.push(fn),clearTimeout(){},console});
let code=fs.readFileSync('web/practice.js','utf8').replace(/\nbind\(\);/, '\nwindow.setExercise=(x)=>{ex=x;idx=0;locked=false;results=[]};window.testState=()=>({idx,results});');
vm.runInContext(code,c);const p=window.Practice;p.cfg.sound=false;
const make=(L,acc,oct,fifths=0)=>({...p.keyInfo(fifths),clef:'treble',lo:28,hi:34,notes:[{L,acc,oct,d:'CDEFGAB'.indexOf(L)+7*oct,dur:4}],title:'test'});
function check(L,acc,oct,midi,fifths=0,mode='letter'){p.cfg.answer=mode;window.setExercise(make(L,acc,oct,fifths));p.keyboardAnswer(midi);assert.equal(window.testState().results[0],true,`${L}${acc}/${mode}`)}
check('D',-1,4,61);check('B',1,4,72);check('C',-1,4,59,-7);check('F',1,4,66,1,'movable');check('E',-1,4,63,-3,'fixed');
p.cfg.answer='letter';window.setExercise(make('D',-1,4));p.keyboardAnswer(73);assert.equal(window.testState().results[0],'octave');
window.setExercise(make('D',-1,4));p.keyboardAnswer(60);assert.equal(window.testState().results[0],false);assert.equal(window.testState().idx,0);
window.setExercise(make('C',-1,4));p.buildPad();let octaves=document.getElementById('practicePad').children;assert.ok(octaves.some(o=>o.children[0].textContent==='C3–B3'),'Cb4 must have B3 key');
for(const o of octaves){const keys=o.children[1].children;assert.equal(keys.length,12);assert.equal(keys.filter(k=>k.className.endsWith('white')).length,7);assert.equal(keys.filter(k=>k.className.endsWith('black')).length,5);assert.equal(new Set(keys.map(k=>k.dataset.midi)).size,12);assert.ok(keys.every(k=>k.attrs['aria-label']))}
window.setExercise(make('D',-1,4));p.buildPad();const black=document.getElementById('practicePad').children.flatMap(o=>o.children[1].children).find(k=>k.dataset.midi==='61');black.onclick();assert.equal(window.testState().results[0],true,'Black-key click answers Db directly');
console.log('PASS: piano keys, enharmonic notes, octave checking, movable/fixed labels and direct black-key answers');
// Modified by AI on 2026-10-10 16:02:39
