'use strict';
// Staff-reading practice. Snippets come from four sources: random notes, a tonal melody generator (chord tones on
// strong beats, stepwise connections, cadence to the tonic), etude-style figures (scales, broken thirds, arpeggios,
// turns, Alberti) sequenced over I–IV–V–I, and a small library of public-domain tunes (moved to a key from the chosen
// key-signature pool and an octave that fits). Ranges come from an instrument list or generic staff / ledger ranges.
// The player names each note (pitch name, fixed-do digit or movable-do degree, octave included) on a piano keyboard; wrong
// answers explain why (key signature, accidental, accidental carried through the bar, natural sign). Rounds of N
// snippets end with a summary. Stats stay in localStorage.
(() => {
const $=id=>document.getElementById(id);
const LETTERS='CDEFGAB',PC=[0,2,4,5,7,9,11];
const SHARPS='FCGDAEB',FLATS='BEADGCF';
// Major keys by number of sharps (+) / flats (−).
const KEYS={0:'C',1:'G',2:'D',3:'A',4:'E',5:'B',6:'F#',7:'C#','-1':'F','-2':'Bb','-3':'Eb','-4':'Ab','-5':'Db','-6':'Gb','-7':'Cb'};
const KEY_LABEL=k=>k.replace('#','♯').replace(/b$/,'♭');
// Diatonic index d = letter + 7 * octave (C4 = 28).
const D=s=>LETTERS.indexOf(s[0])+7*Number(s.slice(1));
const STAFF={treble:[D('E4'),D('F5')],bass:[D('G2'),D('A3')]};
// Generic ranges (clef from the 谱号 setting) and instruments (written pitch; clef fixed by the instrument).
const RANGES=[
 {group:'通用',id:'staff',label:'只在五线内',r:{treble:[D('E4'),D('F5')],bass:[D('G2'),D('A3')]}},
 {group:'通用',id:'ledger2',label:'加线两条以内',r:{treble:[D('A3'),D('C6')],bass:[D('C2'),D('E4')]}},
 {group:'通用',id:'ledger4',label:'加线四条以内',r:{treble:[D('D3'),D('G6')],bass:[D('F1'),D('B4')]}},
 {group:'吹管',id:'flute',label:'长笛 C4–C7',r:{treble:[D('C4'),D('C7')]}},
 {group:'吹管',id:'piccolo',label:'短笛（记谱）D4–C7',r:{treble:[D('D4'),D('C7')]}},
 {group:'吹管',id:'dizi-c',label:'竹笛 C 调（筒音 G4）G4–A6',r:{treble:[D('G4'),D('A6')]}},
 {group:'吹管',id:'dizi-d',label:'竹笛 D 调（筒音 A4）A4–B6',r:{treble:[D('A4'),D('B6')]}},
 {group:'吹管',id:'dizi-e',label:'竹笛 E 调（筒音 B4）B4–C7',r:{treble:[D('B4'),D('C7')]}},
 {group:'吹管',id:'dizi-f',label:'竹笛 F 调（筒音 C5）C5–D7',r:{treble:[D('C5'),D('D7')]}},
 {group:'吹管',id:'dizi-g',label:'竹笛 G 调（大 G，筒音 D4）D4–E6',r:{treble:[D('D4'),D('E6')]}},
 {group:'吹管',id:'dizi-a',label:'竹笛 A 调（筒音 E4）E4–F6',r:{treble:[D('E4'),D('F6')]}},
 {group:'吹管',id:'dizi-bb',label:'竹笛 ♭B 调（筒音 F4）F4–G6',r:{treble:[D('F4'),D('G6')]}},
 {group:'吹管',id:'xiao',label:'洞箫 G 调（筒音 D4）D4–D6',r:{treble:[D('D4'),D('D6')]}},
 {group:'吹管',id:'hulusi',label:'葫芦丝 C 调 G4–A5',r:{treble:[D('G4'),D('A5')]}},
 {group:'吹管',id:'ocarina',label:'陶笛 12 孔中音 C A4–F6',r:{treble:[D('A4'),D('F6')]}},
 {group:'吹管',id:'whistle',label:'哨笛 D 调（记谱）D4–D6',r:{treble:[D('D4'),D('D6')]}},
 {group:'吹管',id:'recorder',label:'高音竖笛（记谱）C4–D6',r:{treble:[D('C4'),D('D6')]}},
 {group:'吹管',id:'harmonica',label:'口琴 C 调 C4–C7',r:{treble:[D('C4'),D('C7')]}},
 {group:'吹管',id:'clarinet',label:'单簧管（降 B，记谱）E3–G6',r:{treble:[D('E3'),D('G6')]}},
 {group:'吹管',id:'oboe',label:'双簧管 B3–A6',r:{treble:[D('B3'),D('A6')]}},
 {group:'吹管',id:'sax',label:'中音萨克斯（记谱）B3–F6',r:{treble:[D('B3'),D('F6')]}},
 {group:'吹管',id:'trumpet',label:'小号（降 B，记谱）G3–C6',r:{treble:[D('G3'),D('C6')]}},
 {group:'吹管',id:'bassoon',label:'大管 C2–E4',r:{bass:[D('C2'),D('E4')]}},
 {group:'吹管',id:'trombone',label:'长号 E2–F4',r:{bass:[D('E2'),D('F4')]}},
 {group:'吹管',id:'tuba',label:'大号 F1–F4',r:{bass:[D('F1'),D('F4')]}},
 {group:'弦乐 / 弹拨',id:'erhu',label:'二胡（D–A 定弦）D4–A6',r:{treble:[D('D4'),D('A6')]}},
 {group:'弦乐 / 弹拨',id:'violin',label:'小提琴 G3–A6',r:{treble:[D('G3'),D('A6')]}},
 {group:'弦乐 / 弹拨',id:'cello',label:'大提琴 C2–G4',r:{bass:[D('C2'),D('G4')]}},
 {group:'弦乐 / 弹拨',id:'contrabass',label:'低音提琴（记谱）E2–G4',r:{bass:[D('E2'),D('G4')]}},
 {group:'弦乐 / 弹拨',id:'guitar',label:'吉他（记谱）E3–B5',r:{treble:[D('E3'),D('B5')]}},
 {group:'弦乐 / 弹拨',id:'guzheng',label:'古筝 D2–D6（高低音谱号）',r:{treble:[D('C4'),D('D6')],bass:[D('D2'),D('C4')]}},
 {group:'键盘',id:'piano-r',label:'钢琴右手 C4–C7',r:{treble:[D('C4'),D('C7')]}},
 {group:'键盘',id:'piano-l',label:'钢琴左手 C2–C4',r:{bass:[D('C2'),D('C4')]}},
 {group:'键盘',id:'piano',label:'钢琴双手 C2–C7（高低音谱号）',r:{treble:[D('C4'),D('C7')],bass:[D('C2'),D('C4')]}},
 {group:'人声',id:'soprano',label:'女高音 C4–A5',r:{treble:[D('C4'),D('A5')]}},
 {group:'人声',id:'alto',label:'女中音 A3–F5',r:{treble:[D('A3'),D('F5')]}},
 {group:'人声',id:'tenor',label:'男高音 C3–A4',r:{bass:[D('C3'),D('A4')]}},
 {group:'人声',id:'baritone',label:'男中音 A2–F4',r:{bass:[D('A2'),D('F4')]}},
 {group:'人声',id:'bass-voice',label:'男低音 E2–E4',r:{bass:[D('E2'),D('E4')]}},
];
// Public-domain tunes in the score text format (1 = tonic); no rests, so every symbol is a note to name.
const TUNES=[
 {title:'欢乐颂',by:'贝多芬',time:'4/4',text:"3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3. 2/ 2 - | 3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2. 1/ 1 - ||"},
 {title:'小星星',by:'法国民歌',time:'4/4',text:"1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - | 5 5 4 4 | 3 3 2 - | 5 5 4 4 | 3 3 2 - ||"},
 {title:'两只老虎',by:'法国民歌',time:'4/4',text:"1 2 3 1 | 1 2 3 1 | 3 4 5 - | 3 4 5 - | 5/6/5/4/ 3 1 | 5/6/5/4/ 3 1 | 1 5, 1 - | 1 5, 1 - ||"},
 {title:'小步舞曲',by:'佩措尔德（旧传巴赫）',time:'3/4',text:"5 1/2/3/4/ | 5 1 1 | 6 4/5/6/7/ | 1' 1 1 | 4 5/4/3/2/ | 3 4/3/2/1/ | 7, 1/2/3/1/ | 2 - - ||"},
 {title:'念故乡（新世界交响曲）',by:'德沃夏克',time:'4/4',text:"3. 5/ 5 - | 3. 2/ 1 - | 2 3 5 3 | 2 - - - | 3. 5/ 5 - | 3. 2/ 1 - | 2 3 2 1 | 1 - - - ||"},
 {title:'铃儿响叮当',by:'皮尔庞特',time:'4/4',text:"3 3 3 - | 3 3 3 - | 3 5 1. 2/ | 3 - - - | 4 4 4. 4/ | 4 3 3 3/3/ | 3 2 2 3 | 2 - 5 - ||"},
 {title:'茉莉花',by:'江苏民歌',time:'2/4',text:"3 3/5/ | 6/1'/ 1'/6/ | 5 5/6/ | 5 - | 3 3/5/ | 6/1'/ 1'/6/ | 5 5/6/ | 5 - | 5 5 | 5 3/5/ | 6 6 | 5 - | 3 2/3/ | 5 3/2/ | 1 1/2/ | 1 - ||"},
 {title:'送别',by:'奥德威',time:'4/4',text:"5 3/5/ 1' - | 6 1' 5 - | 5 1/2/ 3 2/1/ | 2 - - - | 5 3/5/ 1'. 7/ | 6 1' 5 - | 5 2/3/ 4. 7,/ | 1 - - - ||"},
 {title:'友谊地久天长',by:'苏格兰民歌',time:'4/4',text:"5, | 1. 1/ 1 3 | 2. 1/ 2 3/2/ | 1. 1/ 3 5 | 6 - - 6 | 5. 3/ 3 1 | 2. 1/ 2 3/2/ | 1. 6,/ 6, 5, | 1 - - ||"},
 {title:'摇篮曲',by:'勃拉姆斯',time:'3/4',text:"3/3/ | 5 - 3/3/ | 5 - 3/5/ | 1' 7. 6/ | 6 5 2/3/ | 4 2 2/3/ | 4 - 2/4/ | 7/6/ 5 7 | 1' - ||"},
 {title:'生日快乐',by:'希尔姐妹',time:'3/4',text:"5/.5// | 6 5 1' | 7 - 5/.5// | 6 5 2' | 1' - 5/.5// | 5' 3' 1' | 7 6 4'/.4'// | 3' 1' 2' | 1' - ||"},
 {title:'奇异恩典',by:'英国民谣',time:'3/4',text:"5, | 1 - 3/1/ | 3 - 2 | 1 - 6, | 5, - 5, | 1 - 3/1/ | 3 - 2 | 5 - - | 5 - ||"},
 {title:'晨景（培尔·金特）',by:'格里格',time:'6/8',text:"5/3/2/ 1/2/3/ | 5/3/2/ 1/2/3/ | 2/3/5/ 3/5/6/ | 3/6/5/ 3/2/1/ ||"},
 {title:'伦敦桥',by:'英国童谣',time:'4/4',text:"5. 6/ 5 4 | 3 4 5 - | 2 3 4 - | 3 4 5 - | 5. 6/ 5 4 | 3 4 5 - | 2 - 5 - | 3 1 - - ||"},
 {title:'玛丽有只小羊羔',by:'美国童谣',time:'4/4',text:"3 2 1 2 | 3 3 3 - | 2 2 2 - | 3 5 5 - | 3 2 1 2 | 3 3 3 3 | 2 2 3 2 | 1 - - - ||"},
 {title:'小蜜蜂',by:'德国民歌',time:'4/4',text:"5 3 3 - | 4 2 2 - | 1 2 3 4 | 5 5 5 - | 5 3 3 - | 4 2 2 - | 1 3 5 5 | 3 - - - ||"},
 {title:'扬基歌',by:'美国民歌',time:'4/4',text:"1 1 2 3 | 1 3 2 5, | 1 1 2 3 | 1 - 7, - | 1 1 2 3 | 4 3 2 1 | 7, 5, 6, 7, | 1 - 1 - ||"},
 {title:'哦，苏珊娜',by:'福斯特',time:'4/4',text:"1/2/ | 3 5 5. 6/ | 5 3 1. 2/ | 3 3 2 1 | 2 - - 1/2/ | 3 5 5. 6/ | 5 3 1. 2/ | 3 3 2 2 | 1 - - ||"},
 {title:'卡农',by:'帕赫贝尔',time:'4/4',text:"3' - 2' - | 1' - 7 - | 6 - 5 - | 6 - 7 - ||"},
 {title:'东方红',by:'陕北民歌',time:'2/4',text:"5 5/6/ | 2 - | 1 1/6,/ | 2 - | 5 5 | 6/1'/ 6/5/ | 1 1/6,/ | 2 - ||"},
 {title:'普世欢腾',by:'亨德尔（梅森改编）',time:'2/4',text:"1' 7/.6// | 5. 4/ | 3 2 | 1. 5/ | 6 - | 6. 7/ | 7 - | 7. 1'/ | 1' - ||"},
 {title:'平安夜',by:'格鲁伯',time:'6/8',text:"5/.6//5/ 3. | 5/.6//5/ 3. | 2' 2'/ 7. | 1' 1'/ 5. | 6 6/ 1'/.7//6/ | 5/.6//5/ 3. | 6 6/ 1'/.7//6/ | 5/.6//5/ 3. ||"},
 {title:'雪绒花',by:'罗杰斯',time:'3/4',text:"3 - 5 | 2' - - | 1' - 5 | 4 - - | 3 - 3 | 3 4 5 | 6 - - | 5 - - ||"},
 {title:'天空之城',by:'久石让',time:'4/4',text:"6/7/ | 1'. 7/ 1' 3' | 7 - - 3/3/ | 6. 5/ 6 1' | 5 - - 3 | 4. 3/ 4 1' | 3 - - - ||"},
 {title:'梁祝（化蝶主题）',by:'何占豪、陈钢',time:'4/4',text:"3 - 5. 6/ | 1'. 2'/ 6/1'/ 5 | 5. 1'/ 6/5/3/5/ | 2 - - - ||"},
 {title:'新年好（克莱门汀）',by:'美国民歌',time:'3/4',text:"1/1/ 1 5, | 3/3/ 3 1 | 1/3/ 5 5 | 4/3/ 2 - | 2/3/ 4 4 | 3/2/ 3 1 | 1/3/ 2 5, | 7,/2/ 1 - ||"},
 {title:'小毛驴',by:'儿歌',time:'2/4',text:"1/1/ 1/3/ | 5/5/ 5/5/ | 6/6/ 6/1'/ | 5 - | 4/4/ 4/6/ | 3/3/ 3/3/ | 2/2/ 2/2/ | 5 - | 1/1/ 1/3/ | 5/5/ 5/5/ | 6/6/ 6/1'/ | 5 - | 4/4/ 4/6/ | 3/3/ 3/3/ | 2/2/ 2/3/ | 1 - ||"},
 {title:'粉刷匠',by:'波兰儿歌',time:'2/4',text:"5/3/ 5/3/ | 5/3/ 1 | 2/4/ 3/2/ | 5 - | 5/3/ 5/3/ | 5/3/ 1 | 2/4/ 3/2/ | 1 - ||"},
 {title:'老麦克唐纳有块地',by:'美国童谣',time:'4/4',text:"1 1 1 5, | 6, 6, 5, - | 3 3 2 2 | 1 - - 5, | 1 1 1 5, | 6, 6, 5, - | 3 3 2 2 | 1 - - - ||"},
];
const STORE='flute.practice.v1';
const DEFAULTS={clef:'treble',keys:'2',range:'ledger2',source:'tonal',acc:'some',rhythm:'mixed',answer:'letter',length:'8',rounds:'5',sound:true};
let cfg=load('cfg',DEFAULTS),stats=load('stats',{total:0,correct:0,time:0,notes:{}});
function load(k,def){try{return {...def,...JSON.parse(localStorage.getItem(STORE+'.'+k)||'{}')}}catch{return {...def}}}
function save(k,v){try{localStorage.setItem(STORE+'.'+k,JSON.stringify(v))}catch{}}
if(!RANGES.some(r=>r.id===cfg.range))cfg.range='ledger2';

const rnd=n=>Math.floor(Math.random()*n),pick=a=>a[rnd(a.length)];
// Shuffled deck: every item comes once before any repeats (and a new round never starts with the last one).
function deck(items){let bag=[],last=null;return ()=>{if(!bag.length){bag=[...items].sort(()=>Math.random()-0.5);if(bag.length>1&&bag[bag.length-1]===last)bag.unshift(bag.pop())}last=bag.pop();return last}}
const mod7=x=>((x%7)+7)%7;
function sigOf(fifths){const m={};if(fifths>0)for(const l of SHARPS.slice(0,fifths))m[l]=1;if(fifths<0)for(const l of FLATS.slice(0,-fifths))m[l]=-1;return m}
const rangeDef=()=>RANGES.find(r=>r.id===cfg.range)||RANGES[1];
// Clefs for the current setting: the instrument's own, or the 谱号 choice for generic ranges.
function clefsNow(){const R=rangeDef();if(R.group!=='通用')return Object.keys(R.r);return cfg.clef==='mixed'?['treble','bass']:[cfg.clef]}
function keyInfo(fifths){const key=KEYS[fifths],t=LETTERS.indexOf(key[0]),shift=key[1]==='#'?1:key[1]==='b'?-1:0;return {key,fifths,sig:sigOf(fifths),tonic:t,tonicPc:(PC[t]+shift+12)%12}}
function keyPool(){const m=Number(cfg.keys),out=[];for(let f=-m;f<=m;f++)out.push(f);return out}

// ---------- generation ----------
// Durations are in sixteenths (quarter = 4). Generators return notes with their written accidental decided.
function makeExercise(){
 if(cfg.source==='library')return fromLibrary();
 const clef=pick(clefsNow()),[lo,hi]=rangeDef().r[clef];
 pendingTune=null;
 for(let tries=0;tries<16;tries++){
  const k=keyInfo(pick(keyPool()));
  const g=cfg.source==='tunes'?fromTune(k,lo,hi):cfg.source==='etude'?fromEtude(k,lo,hi):cfg.source==='tonal'?fromTonal(k,lo,hi):fromRandom(k,lo,hi);
  if(g)return {...k,clef,lo,hi,...g};
 }
 return null;
}
// Engraving: written accidentals from the sounding ones, with signs carried to the end of the bar.
function engrave(k,raw){
 let bar=-1,alt={};
 return raw.map(r=>{
  if(r.bar!==bar){bar=r.bar;alt={}}
  if(r.rest)return {rest:true,dur:r.dur,wdur:r.wdur??r.dur,bar:r.bar,tup:r.tup};
  const L=LETTERS[mod7(r.d)],acc=(k.sig[L]||0)+(r.chrom||0),cur=(r.d in alt)?alt[r.d]:(k.sig[L]||0);
  let written=null,why;
  if(acc!==cur){written=acc;alt[r.d]=acc;why=acc===0?'natural':'acc'}
  else why=(r.d in alt)?'carry':acc?'key':'plain';
  return {d:r.d,L,oct:Math.floor(r.d/7),acc,written,why,dur:r.dur,wdur:r.wdur??r.dur,bar:r.bar,tup:r.tup};
 });
}
// Tonic (diatonic index) that puts offsets minOff..maxOff inside the range, as central as possible.
function tonicNear(k,lo,hi,minOff=0,maxOff=7){
 let best=null;for(let o=0;o<9;o++){const d0=k.tonic+7*o;if(d0+minOff>=lo&&d0+maxOff<=hi){const c=Math.abs(d0+(minOff+maxOff)/2-(lo+hi)/2);if(!best||c<best.c)best={d0,c}}}
 return best?.d0??null;
}
const raisable=(k,d)=>Math.abs((k.sig[LETTERS[mod7(d)]]||0)+1)<=1;

function fromRandom(k,lo,hi){
 const len=Number(cfg.length),notes=[];let d=Math.round((lo+hi)/2)+rnd(3)-1,bar=0,pos=0,barAlt={};
 const steps=[-1,1,-1,1,-2,2,-1,1,-2,2,-3,3,-4,4,0,-5,5];
 while(notes.length<len||pos>0){
  const kinds=cfg.rhythm==='quarter'?['q']:['q','q','q','e','e',pos%8===0&&pos<=8?'h':'q'];
  const kind=pick(kinds),durs=kind==='e'?[2,2]:kind==='h'?[8]:[4];
  for(const dur of durs){
   let s=pick(steps);if(d+s<lo||d+s>hi)s=-s;d=Math.max(lo,Math.min(hi,d+s));
   const L=LETTERS[mod7(d)];let written=null;
   if(cfg.acc==='some'&&Math.random()<0.18){
    const cur=(d in barAlt)?barAlt[d]:(k.sig[L]||0);
    if(cur!==0)written=0;
    else if(!'EB'.includes(L)&&Math.random()<0.5)written=1;
    else if(!'FC'.includes(L))written=-1;
   }
   let acc,why;
   if(written!=null){acc=written;why=written===0?'natural':'acc';barAlt[d]=written}
   else if(d in barAlt){acc=barAlt[d];why='carry'}
   else{acc=k.sig[L]||0;why=acc?'key':'plain'}
   notes.push({d,L,oct:Math.floor(d/7),acc,written,why,dur,bar});
  }
  pos+=durs.reduce((a,b)=>a+b,0);if(pos>=16){pos=0;bar++;barAlt={}}
 }
 return {notes,time:'4/4',title:'随机音'};
}

// Tonal melody: chord tones on strong beats, steps / passing tones between, cadence (2 or 7) → 1.
const CHORDS={I:[0,2,4],ii:[1,3,5],IV:[3,5,0],V:[4,6,1],vi:[5,0,2]};
const RHY={
 '4/4':{quarter:[[4,4,4,4]],mixed:[[4,4,4,4],[2,2,4,4,4],[4,2,2,4,4],[8,4,4],[4,4,8],[2,2,2,2,4,4],[6,2,4,4],[4,4,2,2,4],[4,2,2,2,2,4]],end:[[8,8],[4,4,8],[16]]},
 '3/4':{quarter:[[4,4,4]],mixed:[[4,4,4],[8,4],[2,2,4,4],[6,2,4],[4,2,2,4],[4,4,2,2]],end:[[12],[4,8]]},
};
function fromTonal(k,lo,hi){
 const time=Math.random()<0.7?'4/4':'3/4',bars=Math.max(2,Math.round(Number(cfg.length)/(time==='4/4'?4.5:3.5)));
 const prog=[];for(let b=0;b<bars;b++)prog.push(b===bars-1?'I':b===bars-2?'V':b===0?'I':pick(['IV','ii','vi','I','V']));
 const d0=tonicNear(k,lo,hi,-3,9)??tonicNear(k,lo,hi,0,4)??tonicNear(k,lo,hi,0,0);if(d0==null)return null;
 const fit=p=>{while(d0+p>hi)p-=7;while(d0+p<lo)p+=7;return p};
 const nearestIn=(set,p,spread=1)=>{const c=[];for(let o=-21;o<=21;o+=7)for(const t of set){const q=t+o;if(d0+q>=lo&&d0+q<=hi)c.push(q)}
  c.sort((a,b)=>Math.abs(a-p)-Math.abs(b-p));return c.length?c[Math.min(c.length-1,rnd(spread))]:fit(p)};
 const raw=[];let p=nearestIn(CHORDS.I,rnd(5));
 prog.forEach((ch,b)=>{
  const last=b===bars-1,pat=pick(last?RHY[time].end:RHY[time][cfg.rhythm==='quarter'?'quarter':'mixed']);let pos=0;
  pat.forEach((dur,i)=>{
   const strong=pos===0||(time==='4/4'&&pos===8),penult=b===bars-2&&i===pat.length-1;
   if(last&&i===pat.length-1)p=nearestIn([0],p);
   else if(penult)p=nearestIn([1,6],p);
   else if(strong)p=nearestIn(CHORDS[ch],p,2);
   else{const s=Math.random()<0.75?pick([-1,1]):pick([-2,2,-3,3]);p=fit(p+s)}
   raw.push({d:d0+p,dur,bar:b});pos+=dur;
  });
 });
 // Chromatic colour: a note raised a semitone to lead into the next step up (♯4→5, ♯1→2 …).
 if(cfg.acc==='some')for(let i=0;i<raw.length-1;i++){const a=raw[i],b=raw[i+1];if(b.d-a.d!==1||a.bar!==b.bar||Math.random()>0.3)continue;
  const pc=d=>PC[mod7(d)]+(k.sig[LETTERS[mod7(d)]]||0);if(((pc(b.d)-pc(a.d))%12+12)%12===2&&raisable(k,a.d))a.chrom=1}
 return {notes:engrave(k,raw),time,title:'调性旋律'};
}

// Etude figures over a I–IV–V… sequence; one figure per snippet (as in studies), eighths, final whole note.
const FIGURES={
 '音阶上行':[0,1,2,3,4,5,6,7],'音阶下行':[7,6,5,4,3,2,1,0],'分解三度':[0,2,1,3,2,4,3,5],'下行三度':[7,5,6,4,5,3,4,2],
 '琶音':[0,2,4,7,4,2,0,2],'琶音转位':[2,4,7,9,7,4,2,4],'四度模进':[0,3,1,4,2,5,3,6],'三音组':[0,1,2,1,2,3,2,3],'下行三音组':[7,6,5,6,5,4,5,4],'五度跳进':[0,4,1,5,2,6,3,7],'邻音环绕':[2,3,2,1,2,4,3,2],'下行琶音':[7,4,2,0,2,4,7,4],'回音':[2,1,0,1,2,3,4,3],'阿尔贝蒂':[0,4,2,4,0,4,2,4],'六度跳进':[0,5,1,6,2,7,3,8],
};
const nextFigure=deck(Object.keys(FIGURES));
function fromEtude(k,lo,hi){
 const bars=Math.max(1,Math.round(Number(cfg.length)/8)),seq=[0,3,4,0,5,1,4,0].slice(0,bars);if(bars>1)seq[bars-1]=4;
 // Narrow ranges: try other figures, then the figure repeated on the tonic without a sequence.
 let name,fig,roots,d0=null;
 const first=nextFigure();
 for(const r of [seq,seq.map(()=>0)]){for(const nm of [first,...Object.keys(FIGURES).filter(n=>n!==first).sort(()=>Math.random()-0.5)]){const f=FIGURES[nm];
  const t=tonicNear(k,lo,hi,Math.min(...f)+Math.min(...r),Math.max(...f)+Math.max(...r));if(t!=null){name=nm;fig=f;roots=r;d0=t;break}}if(d0!=null)break}
 if(d0==null)return null;
 const raw=[];roots.forEach((r,b)=>fig.forEach(f=>raw.push({d:d0+r+f,dur:2,bar:b})));
 const end=raw[raw.length-1].d,tonics=[];for(let o=-2;o<=2;o++){const t=d0+7*o;if(t>=lo&&t<=hi)tonics.push(t)}
 raw.push({d:tonics.sort((a,b)=>Math.abs(a-end)-Math.abs(b-end))[0]??d0,dur:16,bar:bars});
 // Chromatic colour in scale figures: raised 4th in every other bar (a passing ♯4 towards 5).
 if(cfg.acc==='some'&&name.includes('音阶')&&Math.random()<0.5)for(const r of raw)if(mod7(r.d-d0)===3&&r.bar%2===1&&raisable(k,r.d))r.chrom=1;
 return {notes:engrave(k,raw),time:'4/4',title:`练习曲型 · ${name}`};
}

// Library tunes: parsed from the score text, moved to the drawn key and to an octave inside the range.
const nextTune=deck(TUNES);let pendingTune=null;
function fromTune(k,lo,hi){
 const tune=pendingTune??=nextTune(),parsed=Jianpu.parse(tune.text),raw=[];let bar=0,started=false,last=null;
 for(const line of parsed.lines)if(line.kind==='music')for(const t of line.tokens){
  if(t.t==='bar'){if(started)bar++;continue}
  if(t.t==='dash'&&last){last.dur+=4;continue}
  if(t.t!=='note')continue;
  const beats=Math.pow(0.5,t.under||0)*(t.dot===1?1.5:t.dot===2?1.75:1);
  last={off:t.degree-1+7*t.octave,chrom:t.acc||0,dur:Math.round(beats*4),bar};raw.push(last);started=true;
 }
 // Long tunes are cut at the first bar end after the requested length.
 const want=Number(cfg.length);let cut=raw.length;for(let i=want;i<raw.length;i++)if(raw[i].bar!==raw[i-1].bar){cut=i;break}
 const use=raw.slice(0,cut);
 const mn=Math.min(...use.map(r=>r.off)),mx=Math.max(...use.map(r=>r.off)),d0=tonicNear(k,lo,hi,mn,mx);if(d0==null)return null;
 for(const r of use)if(Math.abs((k.sig[LETTERS[mod7(d0+r.off)]]||0)+r.chrom)>1)return null;
 return {notes:engrave(k,use.map(r=>({d:d0+r.off,dur:r.dur,bar:r.bar,chrom:r.chrom}))),time:tune.time,title:`《${tune.title}》· ${tune.by}`};
}

// ---------- 我的谱库: snippets from the user's own score texts (original key, rhythm, rests and tuplets) ----------
let libPassages=null;const libDeck={items:null,next:null};
async function loadLibrary(){
 const recs=await ScoreLibrary.records().catch(()=>[]),out=[];
 for(const r of recs)for(const page of r.results||[]){
  let parsed;try{parsed=Jianpu.parse(page.text||'')}catch{continue}
  const firstPart=parsed.parts?.[0]?.id;
  // Pitch-answer exercises cannot ask for X. Skip this passage rather than silently remove its rhythm.
  if(parsed.lines.some(l=>l.kind==='music'&&(!firstPart||!l.part||l.part===firstPart)&&l.tokens.some(t=>t.t==='percussion')))continue;
  let cur=null,key=parsed.meta.key?.value||'C',oct=parsed.meta.octave?.value||4,time=parsed.meta.time?.value||'4/4';
  const close=()=>{if(cur&&cur.bars.filter(b=>b.some(t=>t.t==='note')).length>=2)out.push(cur);cur=null};
  for(const l of parsed.lines){
   if(l.kind==='meta'){if(l.name==='key'){close();key=l.value}else if(l.name==='octave'){close();oct=l.value}else if(l.name==='time'){close();time=l.value}continue}
   if(l.kind!=='music'||(firstPart&&l.part&&l.part!==firstPart))continue;
   if(!cur)cur={title:r.title+(r.results.length>1?` · 第 ${page.page} 页`:''),key,oct,time,bars:[[]]};
   for(const t of l.tokens){if(t.t==='bar'){if(cur.bars[cur.bars.length-1].length)cur.bars.push([]);continue}if(['note','rest','dash','tupOpen','tupClose'].includes(t.t))cur.bars[cur.bars.length-1].push(t)}
  }
  close();
 }
 for(const p of out)while(p.bars.length&&!p.bars[p.bars.length-1].length)p.bars.pop();
 libPassages=out;libDeck.next=out.length?deck(out.map((_,i)=>i)):null;return out;
}
const KEY_FROM_LABEL=l=>l.length>1?(l[1]==='♯'||l[1]==='#'?l[0]+'#':l[0]+'b'):l;
function keyForLabel(label){
 const name=label.length>1&&'♯♭#b'.includes(label[0])?label[1]+(label[0]==='♯'||label[0]==='#'?'#':'b'):KEY_FROM_LABEL(label);
 const f=Object.entries(KEYS).find(([,v])=>v===name);if(f)return {k:keyInfo(Number(f[0])),shiftOct:0};
 // Unusual keys (♯G, ♯D …): use the enharmonic key with fewer accidentals.
 const pcOf=n=>(PC[LETTERS.indexOf(n[0])]+(n[1]==='#'?1:n[1]==='b'?-1:0)+12)%12,pc=pcOf(name);
 const alt=Object.entries(KEYS).filter(([,v])=>pcOf(v)===pc).sort((a,b)=>Math.abs(a[0])-Math.abs(b[0]))[0];
 return alt?{k:keyInfo(Number(alt[0])),shiftOct:LETTERS.indexOf(KEYS[alt[0]][0])<LETTERS.indexOf(name[0])?1:0}:null;
}
function fromLibrary(){
 if(!libPassages?.length||!libDeck.next)return null;
 const P=libPassages[libDeck.next()],kk=keyForLabel(P.key);if(!kk)return null;const k=kk.k;
 const want=Number(cfg.length),count=b=>b.filter(t=>t.t==='note'&&!t.grace).length;
 // A window of whole bars holding about the requested number of notes, starting at a random bar.
 let start=rnd(P.bars.length),n=0,end=start;while(end<P.bars.length&&n<want){n+=count(P.bars[end]);end++}
 while(start>0&&n<want){start--;n+=count(P.bars[start])}
 const d0=k.tonic+7*(P.oct+kk.shiftOct),raw=[];let last=null,tup=null;
 P.bars.slice(start,end).forEach((bar,bi)=>{for(const t of bar){
  if(t.t==='tupOpen'){let q=1;while(q*2<t.n)q*=2;tup={n:t.n,q,first:true,count:0};continue}
  if(t.t==='tupClose'){tup=null;continue}
  if(t.t==='dash'){if(last){last.dur+=4;last.wdur+=4}continue}
  if(t.grace)continue;
  const w=Math.round(Math.pow(0.5,t.under||0)*(t.dot===1?1.5:t.dot===2?1.75:1)*4),dur=tup?w*tup.q/tup.n:w;
  last={dur,wdur:w,bar:bi,rest:t.t==='rest'};
  if(t.t==='note'){last.d=d0+t.degree-1+7*t.octave;last.chrom=t.acc||0}
  if(tup){if(tup.first){last.tup=tup;tup.first=false}tup.count++}
  raw.push(last);
 }});
 if(!raw.some(r=>!r.rest))return null;
 for(const r of raw)if(!r.rest&&Math.abs((k.sig[LETTERS[mod7(r.d)]]||0)+r.chrom)>1)r.chrom=0;
 const ds=raw.filter(r=>!r.rest).map(r=>r.d).sort((a,b)=>a-b),clef=ds[ds.length>>1]<D('C4')?'bass':'treble';
 const items=engrave(k,raw);
 return {...k,clef,lo:ds[0],hi:ds[ds.length-1],items,notes:items.filter(x=>!x.rest),time:P.time,title:`谱库 · ${P.title}`,library:true};
}

function abcPitch(n){
 const name=n.oct>=5?n.L.toLowerCase()+"'".repeat(n.oct-5):n.L+','.repeat(Math.max(0,4-n.oct));
 return (n.written==null?'':n.written===1?'^':n.written===-1?'_':'=')+name;
}
// ABC at L:1/16; notes shorter than a quarter are beamed within their beat (dotted quarter in 6/8).
function toAbc(ex){
 const [num,den]=ex.time.split('/').map(Number),beat=den===8&&num%3===0?6:4,items=ex.items||ex.notes;
 let body='',pos=0,curBar=items[0]?.bar??0,prevShort=false;
 const len=w=>w===1?'':Number.isInteger(w)?String(w):`${Math.round(w*2)}/2`;
 for(const n of items){
  if(n.bar!==curBar){body+=' | ';curBar=n.bar;pos=0;prevShort=false}
  const w=n.wdur??n.dur,short=w<4&&!n.rest,glue=short&&prevShort&&pos%beat!==0&&!n.tup;
  if(n.tup)body+=` (${n.tup.n}:${n.tup.q}:${n.tup.count}`;
  body+=(glue||n.tup?'':' ')+(n.rest?'z':abcPitch(n))+len(w);pos+=n.dur;prevShort=short;
 }
 return `X:1\nM:${ex.time}\nL:1/16\nK:${ex.key} clef=${ex.clef}\n${body.trim()} |]`;
}
const midiOf=n=>12*(n.oct+1)+PC[LETTERS.indexOf(n.L)]+n.acc;

// ---------- answers ----------
// Expected answer, octave included. Letter / fixed-do: the absolute octave (C4–B4 is the middle row).
// Movable do: octave counted from the tonic in octave 4 (that row is the middle one).
const accSign=a=>a>0?'♯'.repeat(a):a<0?'♭'.repeat(-a):'';
const octWord=o=>o===0?'（中音）':o===1?'（高音）':o===2?'（倍高音）':o===-1?'（低音）':o===-2?'（倍低音）':o>0?`（高 ${o} 个八度）`:`（低 ${-o} 个八度）`;
function expected(ex,n){
 if(cfg.answer==='letter')return {base:n.L,acc:n.acc,oct:n.oct,label:n.L+accSign(n.acc)+n.oct};
 if(cfg.answer==='fixed'){const deg=LETTERS.indexOf(n.L)+1;return {base:String(deg),acc:n.acc,oct:n.oct,label:accSign(n.acc)+deg+octWord(n.oct-4)}}
 const step=(LETTERS.indexOf(n.L)-ex.tonic+7)%7,deg=step+1,semi=((midiOf(n)-ex.tonicPc)%12+12)%12,acc=((semi-PC[step]+18)%12)-6;
 const oct=4+Math.floor((n.d-(ex.tonic+28))/7);
 return {base:String(deg),acc,oct,label:accSign(acc)+deg+octWord(oct-4)};
}
// Physical piano octaves cover the configured range, including enharmonic boundary notes.
function padOctaves(){
 let lo=99,hi=-99;if(ex?.library){lo=Math.min(ex.lo,STAFF[ex.clef][0]);hi=Math.max(ex.hi,STAFF[ex.clef][1])}else for(const c of clefsNow()){const [a,b]=rangeDef().r[c];lo=Math.min(lo,a);hi=Math.max(hi,b)}
 const out=[];let low=Math.floor(lo/7),high=Math.floor(hi/7);
 for(const n of ex?.notes||[]){const o=Math.floor(midiOf(n)/12)-1;low=Math.min(low,o);high=Math.max(high,o)}
 for(let o=high;o>=low;o--)out.push(o);return out;
}
// Piano keys represent sounding pitches. C♯ / D♭ and B♯ / C are the same key.
function keyboardAnswer(midi){
 if(!ex||locked||idx>=ex.notes.length)return;
 const n=ex.notes[idx],want=midiOf(n),e=expected(ex,n);
 if((midi-want)%12===0){answer(e.base,e.acc,e.oct+(midi-want)/12);return}
 const pc=((midi%12)+12)%12,i=PC.reduce((last,v,j)=>v<=pc?j:last,0),oct=Math.floor(midi/12)-1;
 const pressed=expected(ex,{L:LETTERS[i],acc:pc-PC[i],oct,d:i+7*oct});answer(pressed.base,pressed.acc,pressed.oct);
}
function reason(ex,n){
 const name=n.L+(n.acc>0?'♯':n.acc<0?'♭':'');
 if(n.why==='key')return `调号里有${n.acc>0?'升':'降'}号：${KEY_LABEL(ex.key)} 大调的 ${n.L} 都是 ${name}。`;
 if(n.why==='acc')return `这个音前面有${n.acc>0?'升':'降'}号。`;
 if(n.why==='natural')return `这个音前面有还原记号，是本位 ${n.L}${ex.sig[n.L]?'（取消了调号的'+(ex.sig[n.L]>0?'升':'降')+'号）':''}。`;
 if(n.why==='carry')return `同一小节前面同位置的${n.acc>0?'升号':n.acc<0?'降号':'还原记号'}一直管到小节末，所以是 ${name}。`;
 return `本位 ${n.L}，调号不影响它。`;
}

// ---------- state & rendering ----------
let ex=null,idx=0,mod=0,shownAt=0,results=[],els=[],locked=false;
const session={n:0,ok:0,time:0};
// A round is cfg.rounds snippets (0 = endless); its own tally is shown when it ends.
let round={done:0,n:0,ok:0,time:0,over:false};
const newRound=()=>{round={done:0,n:0,ok:0,time:0,over:false}};
async function newExercise(){
 stopPlay();if(round.over)newRound();
 if(cfg.source==='library'&&!libPassages)await loadLibrary();
 ex=makeExercise();idx=0;mod=0;results=[];locked=false;syncMods();
 if(!ex){$('practiceKey').textContent=cfg.source==='library'?'谱库里还没有可用的乐谱文本：先在「转谱」识别或输入乐谱并存档，再来这里练。':'这个音域放不下所选的片段，请换个乐器或出题方式。';$('practiceStaff').replaceChildren();$('practicePad').replaceChildren();return}
 await Staff.loadAbcjs();
 const host=$('practiceStaff');host.replaceChildren();const inner=document.createElement('div');host.append(inner);
 // Fixed layout width; the SVG scales to the card (responsive), so notes are large on tablets and fit on phones.
 const w=ex.notes.length>24?760:ex.notes.length>12?640:ex.notes.length>9?540:460;
 ABCJS.renderAbc(inner,toAbc(ex),{add_classes:true,responsive:'resize',staffwidth:w,wrap:{minSpacing:1.6,maxSpacing:2.6,preferredMeasuresPerLine:4},paddingtop:2,paddingbottom:2,paddingleft:0,paddingright:6});
 // abcjs marks rests as notes too; keep only the answerable ones, in order.
 const all=[...inner.querySelectorAll('.abcjs-note')],items=ex.items||ex.notes;
 els=all.length===items.length?all.filter((_,i)=>!items[i].rest):all.filter(e=>!e.classList.contains('abcjs-rest'));
 $('practiceKey').textContent=`${ex.title} · ${ex.clef==='treble'?'高音谱号':'低音谱号'} · ${KEY_LABEL(ex.key)}${ex.library?' 调':' 大调'}（${ex.fifths?Math.abs(ex.fifths)+' 个'+(ex.fifths>0?'升':'降')+'号':'无升降号'}）`;
 $('practiceFeedback').textContent='';$('practiceFeedback').className='practice-feedback';
 mark();buildPad();
}
// Cursor: a rounded box drawn behind the note to answer (inserted first in the SVG so it sits under the music).
function cursorBox(el){
 const svg=$('practiceStaff').querySelector('svg');if(!svg)return;svg.querySelector('.pr-cursor')?.remove();if(!el)return;
 let b;try{b=el.getBBox()}catch{return}if(!b.width)return;
 const r=document.createElementNS('http://www.w3.org/2000/svg','rect'),pad=4;
 r.setAttribute('class','pr-cursor');r.setAttribute('x',b.x-pad);r.setAttribute('y',Math.min(b.y,b.y+b.height/2-14)-pad);r.setAttribute('width',b.width+2*pad);r.setAttribute('height',Math.max(b.height,28)+2*pad);r.setAttribute('rx',5);
 svg.insertBefore(r,svg.firstChild);
}
function mark(){
 cursorBox(idx<ex.notes.length?els[idx]:null);
 els.forEach((e,i)=>{e.classList.toggle('pr-current',i===idx&&idx<ex.notes.length);e.classList.toggle('pr-ok',results[i]===true);e.classList.toggle('pr-bad',results[i]===false);e.classList.toggle('pr-octave',results[i]==='octave')});
 const total=Number(cfg.rounds),seg=total?`第 ${Math.min(round.done+(idx<ex.notes.length?1:0),total)} / ${total} 段 · `:'';
 $('practiceProgress').textContent=idx<ex.notes.length?`${seg}第 ${idx+1} / ${ex.notes.length} 个音`:`${seg}本段 ${results.filter(r=>r===true).length} / ${ex.notes.length} 正确${results.some(r=>r==='octave')?`（${results.filter(r=>r==='octave').length} 个八度错）`:''}`;
 shownAt=performance.now();
 if(idx>=ex.notes.length)finishSegment();else{$('practiceNext').classList.remove('primary');$('practiceNext').textContent='下一段 →'}
}
function finishSegment(){
 if(ex._finished)return;ex._finished=true;round.done++;
 const total=Number(cfg.rounds);$('practiceNext').classList.add('primary');
 if(total&&round.done>=total){
  round.over=true;const pct=round.n?Math.round(round.ok/round.n*100):0;
  $('practiceProgress').textContent=`本轮完成`;
  $('practiceFeedback').textContent=`本轮 ${total} 段完成：共 ${round.n} 个音，正确 ${round.ok} 个（${pct}%），平均 ${(round.time/Math.max(1,round.n)/1000).toFixed(1)} 秒一个。`;
  $('practiceFeedback').className='practice-feedback '+(pct>=90?'ok':'');$('practiceNext').textContent='再来一轮 →';
 }else $('practiceNext').textContent='下一段 →';
}
function record(n,ok,ms){
 const k=`${ex.clef}|${n.L}${n.oct}`,s=stats.notes[k]||(stats.notes[k]=[0,0]);s[0]++;if(!ok)s[1]++;
 stats.total++;if(ok)stats.correct++;stats.time+=ms;save('stats',stats);
 session.n++;if(ok)session.ok++;session.time+=ms;round.n++;if(ok)round.ok++;round.time+=ms;showStats();
}
// The pitch of the key that was pressed (not the written note), so a wrong answer sounds wrong.
function pressedMidi(base,acc,oct,X=ex){
 if(cfg.answer==='letter')return 12*(oct+1)+PC[LETTERS.indexOf(base)]+acc;
 if(cfg.answer==='fixed')return 12*(oct+1)+PC[Number(base)-1]+acc;
 const shift=X.key[1]==='#'?1:X.key[1]==='b'?-1:0;
 return 12*(oct+1)+PC[X.tonic]+shift+PC[Number(base)-1]+acc;
}
function answer(base,acc,oct){
 if(!ex||locked||idx>=ex.notes.length)return;
 const n=ex.notes[idx],e=expected(ex,n),ok=e.base===base&&e.acc===acc&&(oct==null||e.oct===oct),ms=performance.now()-shownAt;
 const octOnly=!ok&&e.base===base&&e.acc===acc;
 // Right name in the wrong octave is marked yellow, a wrong name red.
 results[idx]=ok?true:octOnly?'octave':false;record(n,ok,ms);if(cfg.sound)playNote(pressedMidi(base,acc,oct??e.oct),0.5);
 const fb=$('practiceFeedback');
 if(ok){fb.textContent=`✓ ${e.label}`+(n.why==='key'||n.why==='carry'||n.why==='natural'?'　'+reason(ex,n):'');fb.className='practice-feedback ok';idx++;mod=0;syncMods();mark()}
 else{const [s0,s1]=STAFF[ex.clef];
  fb.textContent=`✗ 应为 ${e.label}。${octOnly?(cfg.answer==='letter'?'音名':'数字')+'对了，八度不对'+(n.d<s0?'：这个音在五线下方的加线上':n.d>s1?'：这个音在五线上方的加线上':'')+'。':reason(ex,n)}`;
  fb.className='practice-feedback '+(octOnly?'octave':'bad');locked=true;mod=0;syncMods();mark();
  setTimeout(()=>{locked=false;idx++;mark()},1300)}
}
function buildPad(){
 const pad=$('practicePad');pad.replaceChildren();pad.className='practice-pad piano-pad';
 for(const oct of padOctaves()){
  const section=document.createElement('div');section.className='piano-octave';
  const title=document.createElement('div');title.className='piano-octave-name';title.textContent=`C${oct}–B${oct}`;
  const row=document.createElement('div');row.className='piano-keyboard';row.setAttribute('role','group');row.setAttribute('aria-label',`第 ${oct} 组钢琴键`);
  const add=(i,acc,black)=>{
   const midi=12*(oct+1)+PC[i]+acc,b=document.createElement('button');b.type='button';b.className='piano-key '+(black?'black':'white');b.dataset.midi=String(midi);
   if(black)b.style.left=`${(i+1)/7*100}%`;
   const label=ex?expected(ex,{L:LETTERS[i],acc,oct,d:i+7*oct}):{label:LETTERS[i]+accSign(acc)+oct};
   b.setAttribute('aria-label',label.label);b.title=label.label;
   const main=document.createElement('span');main.className='piano-key-label';
   main.textContent=cfg.answer==='letter'?LETTERS[i]+accSign(acc):accSign(label.acc)+label.base;
   const small=document.createElement('span');small.className='piano-key-octave';small.textContent=cfg.answer==='letter'?String(oct):octWord(label.oct-4).slice(1,-1);
   b.append(main,small);b.onclick=()=>keyboardAnswer(midi);row.append(b);
  };
  for(let i=0;i<7;i++)add(i,0,false);
  for(const i of [0,1,3,4,5])add(i,1,true);
  section.append(title,row);pad.append(section);
 }
}
function syncMods(){const hint=$('practiceKeyboardHint');if(hint)hint.textContent='点击琴键回答，黑键可直接输入升降音。电脑也可用音名 / 数字键，− / + 切换升降号。'+(mod?' 当前电脑输入：'+(mod>0?'升半音':'降半音'):'')}
function showStats(){
 const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';
 $('practiceSession').textContent=`本次 ${session.n} 个音 · 正确率 ${pct(session.ok,session.n)} · 平均 ${session.n?(session.time/session.n/1000).toFixed(1)+' 秒':'—'}`;
 $('practiceTotal').textContent=`累计 ${stats.total} 个音 · 正确率 ${pct(stats.correct,stats.total)}`;
 const weak=Object.entries(stats.notes).filter(([,v])=>v[1]>0&&v[0]>=2).sort((a,b)=>b[1][1]/b[1][0]-a[1][1]/a[1][0]||b[1][1]-a[1][1]).slice(0,6);
 $('practiceWeak').textContent=weak.length?'常错：'+weak.map(([k,v])=>{const [c,n]=k.split('|');return `${c==='treble'?'高':'低'}音谱号 ${n}（错 ${v[1]}/${v[0]}）`}).join('，'):'';
}

// ---------- sound ----------
let actx=null;
function audio(){if(!actx||actx.state==='closed')actx=new (window.AudioContext||window.webkitAudioContext)();actx.resume?.();return actx}
function playNote(midi,dur,at){
 const c=audio(),buf=Synth.note('piano',midi,dur,c.sampleRate),src=c.createBufferSource(),g=c.createGain();
 g.gain.value=0.5;src.buffer=buf;src.connect(g).connect(c.destination);src.start(at??c.currentTime+0.02);return src;
}
// 「听这一段」 toggles: a second tap stops; a new snippet stops what is playing.
let playingSrcs=[],playTimer=0;
function stopPlay(){for(const x of playingSrcs){try{x.stop()}catch{}}playingSrcs=[];clearTimeout(playTimer);$('practicePlay').textContent='▶ 听这一段'}
function playAll(){
 if(playingSrcs.length){stopPlay();return}
 if(!ex)return;const c=audio(),spb=60/Number($('practiceTempo').value||80);let t=c.currentTime+0.1;
 for(const n of ex.items||ex.notes){if(!n.rest)playingSrcs.push(playNote(midiOf(n),n.dur/4*spb*0.95,t));t+=n.dur/4*spb}
 $('practicePlay').textContent='■ 停止';playTimer=setTimeout(()=>{playingSrcs=[];$('practicePlay').textContent='▶ 听这一段'},(t-c.currentTime+0.6)*1000);
}

// ---------- settings ----------
const FIELDS=['clef','keys','range','source','acc','rhythm','answer','length','rounds'];
function syncSettings(){
 const generic=rangeDef().group==='通用';$('pr_clef').disabled=!generic;
 $('pr_clefNote').textContent=generic?'':`谱号由乐器决定：${clefsNow().map(c=>c==='treble'?'高音谱号':'低音谱号').join(' / ')}`;
 $('pr_rhythm').disabled=cfg.source!=='random'&&cfg.source!=='tonal';
 const lib=cfg.source==='library';$('pr_keys').disabled=lib;$('pr_range').disabled=lib;$('pr_clef').disabled=lib||rangeDef().group!=='通用';if(lib)$('pr_clefNote').textContent='谱库片段按原调、原节奏出题，谱号按音高自动选择。';
}
function bind(){
 const sel=$('pr_range');sel.replaceChildren();
 for(const g of [...new Set(RANGES.map(r=>r.group))]){const og=document.createElement('optgroup');og.label=g==='通用'?'通用音域':g;for(const r of RANGES.filter(r=>r.group===g))og.append(new Option(r.label,r.id));sel.append(og)}
 // Changing how answers are given only swaps the key pad: the snippet on the staff (and the progress) stays.
 for(const f of FIELDS){const el=$('pr_'+f);el.value=cfg[f];el.onchange=()=>{cfg[f]=el.value;save('cfg',cfg);syncSettings();
  if(f==='answer'&&ex){mod=0;syncMods();buildPad();const fb=$('practiceFeedback');if(idx<ex.notes.length){fb.textContent=`回答方式已改为「${el.selectedOptions[0].text}」，谱面不变，从高亮的音继续。`;fb.className='practice-feedback'}return}
  if(f==='source'&&cfg.source==='library')libPassages=null;if(f==='rounds')newRound();newExercise()}}
 $('pr_sound').checked=cfg.sound;$('pr_sound').onchange=()=>{cfg.sound=$('pr_sound').checked;save('cfg',cfg)};
 $('practiceNext').onclick=newExercise;$('practicePlay').onclick=playAll;
 $('practiceReset').onclick=()=>{if(!confirm('清空累计成绩和常错记录？'))return;stats={total:0,correct:0,time:0,notes:{}};save('stats',stats);showStats()};
 // Computer keyboard: letters / digits (octave not checked), - for flat, + or = for sharp, Enter for the next snippet.
 document.addEventListener('keydown',e=>{if($('practicePanel').hidden||e.target.closest('input,select,textarea'))return;const k=e.key.toUpperCase();
  if(e.key==='-'){mod=mod===-1?0:-1;syncMods()}else if(e.key==='+'||e.key==='='){mod=mod===1?0:1;syncMods()}
  else if(e.key==='Enter'&&ex&&idx>=ex.notes.length)newExercise();
  else if(cfg.answer==='letter'&&LETTERS.includes(k))answer(k,mod);else if(cfg.answer!=='letter'&&/^[1-7]$/.test(k))answer(k,mod)});
 new MutationObserver(()=>{if(!$('practicePanel').hidden&&!ex)newExercise()}).observe($('practicePanel'),{attributes:true,attributeFilter:['hidden']});if(!$('practicePanel').hidden&&!ex)newExercise();
 syncSettings();syncMods();showStats();
}
bind();
window.Practice={keyboardAnswer,buildPad,padOctaves,pressedMidi,cfg,makeExercise,toAbc,expected,reason,newExercise,answer,midiOf,RANGES,TUNES,engrave,keyInfo,get current(){return ex}};
})();
// Modified by AI on 2026-10-11 00:15:48
