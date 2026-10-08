'use strict';
// Score recognition. Vision models (OpenAI-compatible API, or any AI app via a copied prompt) return
// 乐谱文本格式 v1 (parsed by jianpu.js).
(() => {
const STORE='flute.scoreOcr.v1';
const DEFAULTS={mode:'manual',kind:'jianpu',scope:'part',baseUrl:'',apiKey:'',model:'',extraPrompt:''};
// Several saved model profiles {id, name, baseUrl, apiKey, model}; `active` picks the one used. The top-level
// baseUrl / apiKey / model mirror the active profile (older single-profile settings migrate into the list).
function loadConfig(){
 let c;try{c={...DEFAULTS,...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{c={...DEFAULTS}}
 if(c.mode==='offline')c.mode='manual';
 c.profiles=Array.isArray(c.profiles)?c.profiles.filter(p=>p&&p.id):[];
 if(!c.profiles.length&&c.baseUrl){const id=newProfileId();c.profiles=[{id,name:profileName(c),baseUrl:c.baseUrl,apiKey:c.apiKey,model:c.model}];c.active=id;saveConfig(c)}
 const a=c.profiles.find(p=>p.id===c.active)||c.profiles[0];
 if(a){c.active=a.id;c.baseUrl=a.baseUrl||'';c.apiKey=a.apiKey||'';c.model=a.model||''}else{c.active=null;c.baseUrl=c.apiKey=c.model=''}
 if(window.SecureCredentials){
  try{if(c.profiles.some(p=>p.apiKey&&p.apiKey!==SecureCredentials.TOKEN)||c.apiKey&&c.apiKey!==SecureCredentials.TOKEN){if(!saveConfig(c))throw new Error('安全迁移失败');c={...c,...JSON.parse(localStorage.getItem(STORE)||'{}')}}}
  catch{c.storageError='旧凭据安全迁移未完成，请重新填写并保存；旧配置仍保留。';c.apiKey='';c.profiles=c.profiles.map(p=>({...p,apiKey:''}))}
  const active=c.profiles.find(p=>p.id===c.active);c.apiKey=active?.apiKey||'';
 }
 return c;
}
function newProfileId(){return 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function profileName(p){let host='';try{host=new URL(p.baseUrl).hostname.replace(/^api\./,'')}catch{}return [p.model,host].filter(Boolean).join(' · ')||'未命名配置'}
function saveConfig(cfg,skipRemoval=false){try{
 const next={...cfg,profiles:(cfg.profiles||[]).map(p=>({...p}))};
 if(window.SecureCredentials){for(const p of next.profiles)if(p.apiKey)p.apiKey=SecureCredentials.protect('ocr-'+p.id,'bearer',endpoint(p),'',p.apiKey);const active=next.profiles.find(p=>p.id===next.active);next.apiKey=active?.apiKey||''}
 const old=JSON.parse(localStorage.getItem(STORE)||'{}');localStorage.setItem(STORE,JSON.stringify(next));
 if(!skipRemoval&&window.SecureCredentials)for(const p of old.profiles||[])if(!next.profiles.some(n=>n.id===p.id))SecureCredentials.remove('ocr-'+p.id);
 return true}catch{return false}}

async function saveConfigAsync(cfg){try{
 const next={...cfg,profiles:(cfg.profiles||[]).map(p=>({...p}))},old=loadConfig();
 if(window.SecureCredentials)for(const p of next.profiles)if(p.apiKey)p.apiKey=await SecureCredentials.prepare('ocr-'+p.id,'bearer',endpoint(p),'',p.apiKey);
 if(!saveConfig(next,true))return false;
 if(window.SecureCredentials)for(const p of old.profiles||[])if(!next.profiles.some(n=>n.id===p.id))await SecureCredentials.removeAsync('ocr-'+p.id);
 return true}catch{return false}}

const NOTATION_RULES=`【乐谱文本格式 v1】
一、整体
1. 每一行文本对应谱面上的一行乐谱。空行表示乐段之间的间隔。
2. 以 @ 开头的行是指令，必须单独占一行：
   @title 曲名
   @key 1=F      调号；升降写 # 或 b，如 1=bB、1=#F。乐曲中途转调时在该处再写一行 @key
   @octave 4     中音 1 所在的八度组（中央 C 在第 4 组），可省略
   @time 2/4     拍号，中途变拍时再写一行
   @tempo 72     速度（每分钟四分音符数）；也可写速度术语：@tempo Andante、@tempo Allegro 132、@tempo 行板、@tempo 稍慢、@tempo 突慢、@tempo 原速、@tempo 渐慢、@tempo 中板、@tempo 欢快地、@tempo 小快板、@tempo 快板
   速度或表情文字照抄原谱，写在对应乐段前。稍慢、突慢、原速、渐慢、欢快地没有固定 BPM，不要猜造数字；原图明确给数字时可写 @tempo 稍慢 72。
   @page 2       换页：之后的内容属于第 2 页
3. % 之后直到行尾是注释，不参与解析。

二、音符（依次写：倚音标记 升降号 数字 八度 减时线 附点 装饰）
4. 1–7 是音，0 是休止符。X 是无固定音高的敲击音（也接受小写 x，导出统一为 X），不是休止符，不随转调改变。X/ 八分、X// 十六分、X/. 附点八分，X - 占两拍但只敲一次；也可写 3{X/X/X/}。X 不加升降号、八度或倚音标记；不放进音高和弦 <…>，同时敲击与旋律用独立声部。
5. 升降号写在数字前：#4 升、b7 降、♮4 还原；只作用于紧跟的这一个音，不向后延续。
6. 八度：数字后每个 ' 高一个八度，每个 , 低一个八度，例如 1'  1''  5,  5,,。
7. 减时线：数字后每个 / 代表数字下方一条横线。1/ 八分音符，1// 十六分音符，1/// 三十二分音符。
8. 被同一条减时线连在一起的音紧挨着写、不加空格：1/2/   3//4//5//6//   5/.6//；不相连的音之间用空格分开。
9. 附点写在最后：5. 附点四分，5/. 附点八分，5.. 复附点。
10. 也可以用音名代替数字：C D E F G A B（大小写均可），按实际音高自动换算成当前调的数字。升降号写在前后都行：#F、F#、bB、Bb；八度用 ' 和 ,（不加记号为中央 C 起的一组），或直接写八度数字：C4 中央 C、A5、Bb3。
11. 增时线写 -，与前后用空格分开：5 -（二分音符）、5 - - -（全音符）、0 - 同理。

三、其他记号
12. 小节线 |，终止线 ||，反复开始 |:，反复结束 :|。
13. 连线（圆滑线、连音线）用圆括号括住它覆盖的音：(1 2 3)；两个同音相连的延音线也这样写：(5 5)。括号必须在同一行内闭合，跨行的连线在行末和下一行开头分别闭合、重开。
14. 连音符：3{1/2/3/} 表示三连音，数字是几连音。
15. 倚音：在音前加 ^，紧挨着写在被装饰的主音前：^6/5。两个主音之间有倚音 6 时写 2/^6//3/（顺序为 2 → 小音符 6 → 3）；^ 只标记紧随其后的一个音，倚音借用后面主音的一小段时值，不另占拍。
16. 反复跳跃记号（房子）：[1. 和 [2. 写在该段的开头。
17. 装饰记号写在音的最后，以 ! 开头，可以连写：!tr 颤音、!~ 波音、!fermata 延长记号、!stacc 顿音、!accent 重音、!breath 该音之后换气。例：5!tr - |、3!fermata。

四、总谱（多声部，可选）
18. 有多个声部时，先用 @part 声明每个声部：@part 笛 · 竹笛（简称 · 全名）。
19. 每行开头用 [简称] 标明声部，如 [笛]、[胡]；同一时刻的各声部连续写成几行，组成一行总谱；各行总谱之间空一行。每个声部每行的小节数要相同。
20. 同时发声的几个音（和弦、双音）用尖括号：<1 3 5>，节奏和装饰写在 > 后面，如 <1, 5,>/ 、<1 3 5> -。

五、示例
@title 示例
@key 1=F
@time 2/4
@tempo 72
(1/2/ 3/5/) | 6 5 | 3//2//1//2// 3/.5// | 6 - |
3{5'/6'/5'/} 3'/2'/ | ^2'1'!tr 6/5/ | 5. 3/ | (5 - | 5) 0 ||`;

const PROMPTS={
 jianpu:`你是简谱（数字谱）转写员。请把我发送的简谱图片，严格按照下面的《乐谱文本格式 v1》逐行转写成纯文本。
要求：
- 只输出格式文本本身：不要解释，不要加 Markdown 代码块，不要输出其他文字。
- 开头写出能看到的 @title、@time、@tempo（看不到的省略）；@key 和 @octave 按本次提取范围的音高约定输出。
- 谱面上的一行对应输出的一行；图片有多页时，每页开头写 @page 页码。
- 简谱的临时升降号（♯ ♭ ♮）按谱面惯例一直管到本小节结束：本小节后面同一个音即使没再印记号，输出时也要在每个音上写出来；还原号 ♮ 原样写 ♮。
- 数字上方的点用 '，下方的点用 ,；减时线、附点、增时线、连线、三连音、倚音、装饰记号都按格式写出，不要遗漏。
- 忽略歌词、和弦名、指法、演奏说明、页码和版权文字。
- 按本次的「提取范围」处理声部，不把同时演奏的声部串成前后旋律。
- 原谱明确表示无固定音高敲击的 X / 叉形符头保留为 X，完整保留节奏，可用 [打] 单列声部；不能改成 0、数字音高或注释。不要把重升号 x 误认成敲击；无法确认时写 ?。X 仅表示通用敲击，不区分具体鼓种。
- 看不清的音写 ?，不要猜。

${NOTATION_RULES}`,
 staff:`你是五线谱翻译员。请把我发送的五线谱图片翻译成「音名谱」（固定调数字谱），严格按照文末的《乐谱文本格式 v1》输出纯文本。

【输出总则】
- 只输出格式文本本身：不要解释，不要加 Markdown 代码块，不要输出其他文字。
- 开头固定写两行：@key 1=C 和 @octave 4。之后依次写看得到的 @title、@time、@tempo（速度可写数字，也可照抄术语，如 @tempo Andante）。
- 原曲的调号不要写成 @key，可以写一行注释记录，例如：% 原调号：1 个升号（G 大调 / e 小调）。
- 谱面的一行对应输出的一行；图片有多页时，每页开头写 @page 页码。

【第一步：认谱号，定音高】
- 固定调：C=1，D=2，E=3，F=4，G=5，A=6，B=7，与原曲调号无关。
- 八度：C4（中央 C）到 B4 不加记号；C5–B5 加 '；C6 以上加 ''；C3–B3 加 ,；C2–B2 加 ,,。
- 高音谱号（G 谱号）：从下往上，一线 E4=3，一间 F4=4，二线 G4=5，二间 A4=6，三线 B4=7，三间 C5=1'，四线 D5=2'，四间 E5=3'，五线 F5=4'。下加一线 C4=1，下加一间 B3=7,，下加二线 A3=6,；上一间 G5=5'，上加一线 A5=6'，上加二线 C6=1''。
- 低音谱号（F 谱号）：一线 G2=5,,，一间 A2=6,,，二线 B2=7,,，二间 C3=1,，三线 D3=2,，三间 E3=3,，四线 F3=4,，四间 G3=5,，五线 A3=6,；上加一线 C4=1，下加一线 E2=3,,。
- 中音谱号（C 谱号在三线）：三线是 C4=1。谱号下方或上方带小 8 时，实际音高低（或高）一个八度，按实际音高写。8va 记号范围内的音高八度，8vb 范围内低八度，15ma 高两个八度。
- 每行开头都要重新确认谱号；谱号中途改变时从那里按新谱号读。

【第二步：调号、临时记号与还原记号（最容易出错，逐个音检查）】
- 调号里的升号按 F C G D A E B 的顺序出现，降号按 B E A D G C F 的顺序出现。先数出调号有几个升 / 降号，确定哪些音名受影响。例：2 个升号 → 所有 F 和 C 都升；3 个降号 → 所有 B、E、A 都降。
- 调号对所有八度的同名音都有效，直到出现新的调号。
- 因为输出是固定调，每个音都要写出它最终的实际音高：受调号影响的音必须在数字前写升降号，每一次都写，例如 G 大调里每个 F 都写 #4；F 大调里每个 B 都写 b7；降 E 大调里每个 B、E、A 分别写 b7、b3、b6。
- 一个音最终的升降，按以下顺序判断：
  1) 这个音自己前面有临时记号（♯ ♭ ♮ 𝄪 𝄫）→ 以它为准；
  2) 否则，看本小节内、它之前、同一线 / 同一间（同一八度的同名音）上最近的临时记号 → 继续有效；
  3) 否则，按调号；
  4) 都没有 → 本位音，不加记号。
- 临时记号只管到本小节结束；小节线之后恢复调号。临时记号只作用于同一线 / 同一间，不影响其他八度的同名音。
- 延音线（同音连线）跨过小节线时，后一个音沿用前一个音的升降，即使下一小节没再写记号。
- 还原记号 ♮：取消调号或之前的临时记号，结果就是本位音。音名谱里本位音直接写数字，不加任何记号，也不要写 ♮。例：G 大调里写了 ♮ 的 F 写 4，不写 #4；本小节后面同一位置的 F 若没再写记号，仍写 4。
- 括号里的提示性临时记号（如 (♮)、(♯)）只是提醒，照常按实际音高写。
- 重升 𝄪（x）和重降 𝄫：格式只允许一个升降号，写成等音：F𝄪=5，C𝄪=2，G𝄪=6，D𝄪=3，A𝄪=7，B𝄫=6，E𝄫=2，A𝄫=5，D𝄫=1，G𝄫=4。
- 跨音名的等音也照实际音高写：E♯=4，B♯=高一个八度的 1（如 B♯4 写 1'），F♭=3，C♭=低一个八度的 7（如 C♭5 写 7）。
- 倚音、装饰音同样遵守以上规则。

【第三步：节奏】
- 以四分音符为一拍：四分音符不加记号；八分音符 /；十六分音符 //；三十二分音符 ///。二分音符写成 音 -；附点二分 音 - -；全音符 音 - - -；附点四分 音.；附点八分 音/.。休止符用 0，时值写法相同；全小节休止按拍号写满（3/4 拍写 0 - -）。多小节休止写出对应数量的空小节。
- 符杠（横梁）连在一起的音按规则紧挨着写；三连音写 3{…}，其他连音同理。
- 延音线（同音相连）与圆滑线都用圆括号；同一行内必须闭合。
- 写完每小节，核对拍数是否等于拍号。

【第四步：其他】
- 颤音、波音、延长记号、顿音、重音、换气按格式用 ! 记号；力度、表情术语、歌词、和弦名称、指法、踏板忽略。
- 反复记号、房子按格式写；D.C.、D.S.、Fine、Coda 等写成注释，如 % D.S. al Coda。
- 同时起止且节奏相同的双音、和弦写成 <…>；不同节奏的独立声部不能合成一个和弦。按本次的「提取范围」处理声部。
- 移调乐器按本次「提取范围」中的音高约定处理，并以 % 注释说明依据。
- 原谱明确表示无固定音高敲击的 X / 叉形符头保留为 X，完整保留节奏，可用 [打] 单列声部；不能改成 0、数字音高或注释。不要把重升号 x 误认成敲击；无法确认时写 ?。X 仅表示通用敲击，不区分具体鼓种。
- 看不清的音写 ?，不要猜。

【自检】输出前逐行检查：① 调号里的每个音名是否都带了升降号；② 有还原记号的音是否没带记号；③ 同小节内临时记号的延续是否正确；④ 每小节拍数是否正确。

${NOTATION_RULES}`
};
const FULL_SCORE_RULES=`【提取范围：总谱 · 所有声部】
- 提取图片中全部乐器和独立声部，包括伴奏、低音、打击乐和钢琴左右手；不能只取顶端旋律，也不能把不同声部依次拼接成一条旋律。
- 开头用 @part 简称 · 全名 声明声部，每个声部的每行都加 [简称]；简称唯一，跨系统、跨页保持一致，不要每页重新编号。
- 按谱面系统顺序输出：同一系统各声部连续写成多行，系统之间空一行；@page 写在该页第一个系统之前，不能拆开同一个系统的声部。
- 各声部从同一个时间起点开始，逐小节核对起止和拍数；弱起各声部按实际弱起长度对齐。完整保留休止、多小节休止、反复与结尾。未演奏的声部要写对应休止，不能直接省略时间。
- 某系统省略休止声部且可以从原谱明确确定小节数量时，补足等长休止；裁切缺失、不可辨认的内容不得推测，用 % 注明缺失范围并写 ? 交人工确认。
- 一个谱表内若有不同节奏或不同延音长度的独立声部，拆成不同 [简称]；只有同时起止且节奏相同的音才写 <…>。
- @key、@octave、@time、@tempo 是全局指令，不支持声部专用调号或速度。不能轮流写各乐器的 @key，避免影响其他声部；不同音区用音符后的 ' 与 , 明确表示。
- X 打击声部也要保留并对齐。X 只代表通用无固定音高敲击，不区分鼓种。
- 输出前检查：所有声明声部都有对应行、同一系统小节数一致、各声部累计时值一致；没有把同时发声排成顺序播放。`;
function promptFor(kind,extra='',scope='part'){
 const staff=kind==='staff',full=scope==='full';
 const range=full?FULL_SCORE_RULES:`【提取范围：分谱 · 指定乐器】
- 只提取这份分谱或用户指定的乐器，不额外加入其他乐器的伴奏；若图片含多种乐器且未指定，先请用户指定，不擅自选择。
- 单旋律不必声明 @part。所选乐器自身的多个独立声部（如钢琴左右手）仍用 @part 和 [简称] 分开，并保留休止以同步播放。`;
 const pitch=staff?(full?`总谱音高：统一输出实际发声音高（协奏音高），固定 @key 1=C、@octave 4。逐声部确认是否为移调记谱；例如降 B 单簧管记谱 C4 实际为 Bb3（b7,），F 调圆号记谱 C4 实际为 F3（4,）。已经是实际音高的总谱不再重复移调；八度移调乐器也须核对。乐器移调关系不明确时写 ? 并以 % 说明，不猜测。`:`分谱音高：移调乐器按谱面记谱音高转写，固定 @key 1=C、@octave 4，并以 % 注释说明如「降 B 单簧管分谱，按记谱音高」。`):(full?`总谱调性：若所有声部使用同一调号，保留共同 @key 与中音 1 八度；若声部使用不同调号或不同中音 1 约定，先换算为实际音高，再统一写 @key 1=C、@octave 4，每个音写明升降及八度。不要把篠笛本数、竹笛器调当作首调简谱的二次移调依据。`:`分谱调性：保留所选分谱的调号与八度，不擅自移调。`);
 return `${range}\n${pitch}\n\n${PROMPTS[staff?'staff':'jianpu']}`+(extra.trim()?`\n\n补充说明：${extra.trim()}`:'');
}

// ---------- image helper ----------
async function toCanvas(source,maxSide=2000){
 let img=source;if(source instanceof Blob)img=await SecurityLimits.bitmap(source);
 const scale=Math.min(1,maxSide/Math.max(img.width,img.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
 const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);
 if(img.close)img.close();return canvas;
}

// ---------- OpenAI-compatible vision model ----------
async function nativeHttp(method,url,headers,body){const r=await Platform.request(method,url,headers,{text:body},{model:true,maxBytes:8000000,textLimit:8000000,timeout:250000});return {status:r.status,body:await r.text()}}
function endpoint(cfg){
 const base=cfg.baseUrl.trim().replace(/\/+$/,'');
 if(!/^https:\/\//i.test(base))throw new Error('接口地址需要以 https:// 开头。');
 return /\/chat\/completions$/.test(base)?base:base+'/chat/completions';
}
function apiError(status,body){let msg=body;try{const j=JSON.parse(body);msg=j.error?.message||j.message||j.msg||body}catch{}return new Error(`接口返回 ${status}：${String(msg).slice(0,300)}`)}
async function chat(cfg,messages){
 if(!cfg.apiKey.trim())throw new Error('请先填写 API Key。');if(!cfg.model.trim())throw new Error('请先填写模型名称。');
 const res=await nativeHttp('POST',endpoint(cfg),{'Content-Type':'application/json',...(window.SecureCredentials?SecureCredentials.headers('ocr-'+cfg.active,cfg.apiKey.trim(),'bearer','',endpoint(cfg)):{Authorization:'Bearer '+cfg.apiKey.trim()})},JSON.stringify({model:cfg.model.trim(),messages,stream:false}));
 if(res.status<200||res.status>=300)throw apiError(res.status,res.body);
 let data;try{data=JSON.parse(res.body)}catch{throw new Error('接口返回的不是 JSON，请检查接口地址。')}
 const content=data.choices?.[0]?.message?.content,text=Array.isArray(content)?content.map(p=>p.text||'').join(''):content;
 if(typeof text!=='string')throw new Error('接口没有返回文字内容。请确认所选模型支持图片输入。');
 return text;
}
// Strips wrappers models add despite instructions: code fences, reasoning blocks, leading chatter.
function cleanReply(raw){
 let text=raw.replace(/<think>[\s\S]*?<\/think>/g,'').replace(/```[a-zA-Z]*\n?/g,'').replace(/```/g,'').trim();
 const lines=text.split('\n');const start=lines.findIndex(l=>/^\s*(@|%|[#b♯♭^(\[]?[0-7Xx]|\|)/.test(l));
 return (start>0?lines.slice(start):lines).join('\n').trim();
}
function check(text){try{Jianpu.parse(text);return []}catch(e){return ['返回内容有不符合格式的地方：'+e.message]}}
async function llmTranscribe(cfg,source,progress){
 const host=new URL(endpoint(cfg)).host,consent='flute.ocrConsent.'+host;if(localStorage.getItem(consent)!=='1'){if(!confirm('本次图片和识谱提示词将发送到 '+host+'，使用你填写的 API Key 并可能产生费用。是否继续？'))throw new Error('已取消发送');localStorage.setItem(consent,'1')}
 progress('压缩图片');
 const dataUrl=(await toCanvas(source)).toDataURL('image/jpeg',0.9);
 progress(`发送到 ${cfg.model}，等待返回（通常需要 10–60 秒）`);
 const raw=await chat(cfg,[{role:'user',content:[{type:'text',text:promptFor(cfg.kind,cfg.extraPrompt,cfg.scope)},{type:'image_url',image_url:{url:dataUrl}}]}]);
 const text=cleanReply(raw);return {data:{text},warnings:check(text)};
}
async function testConnection(cfg){return (await chat(cfg,[{role:'user',content:'只回复 OK'}])).trim().slice(0,60)||'（空回复）'}

// Shared entry point for the image and PDF flows. progress(text) receives step descriptions.
async function createScoreRecognizer(progress=()=>{}){
 const cfg=loadConfig();
 if(cfg.mode==='llm'){
  if(!cfg.baseUrl||!cfg.apiKey||!cfg.model)throw new Error('视觉大模型尚未配置：请在「识别方式」里填写接口地址、API Key 和模型并保存。');
  return {mode:'llm',label:`视觉大模型 · ${cfg.model}`,recognize:src=>llmTranscribe(cfg,src,progress),terminate:async()=>{}};
 }
 // Without an API the image is left for the copy-prompt workflow: an empty draft to paste the AI reply into.
 return {mode:'manual',label:'待识别（复制提示词给 AI）',recognize:async()=>({data:{text:''},warnings:['未配置视觉大模型 API：请用「复制识别提示词」与「保存本页图片」交给 AI 应用，再把结果粘贴进草稿']}),terminate:async()=>{}};
}

window.ScoreOCR={loadConfig,saveConfig,saveConfigAsync,profileName,newProfileId,testConnection,createScoreRecognizer,promptFor,cleanReply,check,NOTATION_RULES};
window.createScoreRecognizer=createScoreRecognizer;
})();
// Modified by AI on 2026-10-08 10:06:28
