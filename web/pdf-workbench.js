'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const state = {doc:null,file:null,loading:false,rendering:false,busy:false,cancelled:false,page:1,results:[],activePage:null,archiveId:null,createdAt:null,sourceName:'',pageCount:0,dirty:false,worker:null,renderTask:null,image:null,fileId:null,fileMeta:null};
  let libraryPromise, databasePromise;
  const MAX_PAGES = 20;
  const MAX_FILE_BYTES = 80 * 1024 * 1024;

  function parsePages(value, count) {
    const picked = new Set();
    for (const part of value.trim().replace(/，/g, ',').split(',')) {
      const match = part.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
      if (!match) throw new Error('页码请写成 1、1-3 或 1-3,8,12。');
      const first = Number(match[1]), last = Number(match[2] || first);
      if (!Number.isSafeInteger(first) || first < 1 || last < first || last > count) throw new Error(`页码必须在 1–${count} 之间，范围从小到大填写。`);
      if (last - first + 1 > MAX_PAGES) throw new Error(`一次最多识别 ${MAX_PAGES} 页，可分批追加。`);
      for (let page = first; page <= last; page++) {
        picked.add(page);
        if (picked.size > MAX_PAGES) throw new Error(`一次最多识别 ${MAX_PAGES} 页，可分批追加。`);
      }
    }
    return [...picked].sort((a,b) => a-b);
  }
  function joinText(items) {
    let output = '', previousY = null;
    for (const item of items) {
      if (typeof item.str !== 'string') continue;
      const y = item.transform && item.transform[5];
      const changedLine = previousY !== null && Number.isFinite(y) && Math.abs(y-previousY) > Math.max(3, (item.height || 10) * .6);
      if (changedLine && output && !output.endsWith('\n')) output += '\n';
      output += item.str;
      output += item.hasEOL ? '\n' : ' ';
      previousY = item.hasEOL ? null : y;
    }
    return output.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function usableText(text) {
    return (text.match(/[0-7]/g) || []).length >= 8 && !text.includes('\ufffd');
  }
  function checkedRecord(raw, freshId = false) {
    if (!raw || typeof raw.title !== 'string' || !Array.isArray(raw.results) || raw.results.length > 300) throw new Error('存档格式不正确，或单份存档超过 300 页。');
    const unique = new Set();
    const results = raw.results.map(item => {
      if (!item || !Number.isSafeInteger(item.page) || item.page < 1 || unique.has(item.page) || typeof item.text !== 'string' || item.text.length > 100000) throw new Error('存档中的页码或文字无效。');
      unique.add(item.page);
      const preview = typeof item.preview === 'string' ? item.preview : '';
      if (preview && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(preview) || preview.length > 700000)) throw new Error('存档中的页面预览无效或过大。');
      return {page:item.page,text:item.text,preview,method:String(item.method || '导入').slice(0,80),reviewed:item.reviewed === true,convertedText:typeof item.convertedText === 'string' ? item.convertedText.slice(0,200000) : ''};
    }).sort((a,b)=>a.page-b.page);
    const settings = raw.settings || {};
    const now = new Date().toISOString();
    const file=typeof raw.fileId==='string'&&/^file-[\w-]{1,80}$/.test(raw.fileId)?{fileId:raw.fileId,fileName:String(raw.fileName||'').slice(0,240),fileType:String(raw.fileType||'').slice(0,80),fileSize:Number(raw.fileSize)||0}:{};
    const note=typeof raw.note==='string'?raw.note.slice(0,1000):'';
    return {schema:2,...file,note,id:freshId ? newId() : (typeof raw.id === 'string' && /^[\w-]{1,100}$/.test(raw.id) ? raw.id : newId()),title:raw.title.slice(0,120),sourceName:String(raw.sourceName || '存档').slice(0,240),pageCount:Math.max(results.length?results[results.length-1].page:0,Number.isSafeInteger(raw.pageCount)?raw.pageCount:0),createdAt:validDate(raw.createdAt,now),updatedAt:validDate(raw.updatedAt,now),results,settings:{key:['0','1','2','3','4','5','6','7','8','9','10','11'].includes(String(settings.key))?String(settings.key):'0',octave:['3','4','5','6'].includes(String(settings.octave))?String(settings.octave):'4',shift:['-12','0','12','24'].includes(String(settings.shift))?String(settings.shift):'0',spelling:['auto','flat','sharp'].includes(settings.spelling)?settings.spelling:'auto'}};
  }
  function validDate(value,fallback) { return typeof value==='string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback; }
  function newId() { return 'score-'+Date.now().toString(36)+'-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),v=>v.toString(16).padStart(2,'0')).join(''); }
  function report(id, message, error = false) { const el=byId(id);el.textContent=message;el.classList.toggle('error',error); }
  function syncControls() {
    const locked=state.loading||state.rendering||state.busy;
    for(const id of ['pdfFile','pdfReload','pdfPage','pdfPrev','pdfNext','pdfGo','pdfPages','pdfMode','pdfRun']) byId(id).disabled=locked || (id!=='pdfFile' && id!=='pdfReload' && !state.doc && !state.image && !state.word);
    byId('pdfReload').disabled=locked||!state.file;
    byId('pdfPrev').disabled=locked||!(state.doc||state.word)||state.page<=1;
    byId('pdfNext').disabled=locked||!(state.doc||state.word)||state.page>=state.pageCount;
    byId('pdfCancel').disabled=!state.busy;
    byId('imageFile').disabled=state.busy||ocrBusy;byId('runOCR').disabled=state.busy||ocrBusy||!selectedImage;
    for(const id of ['pdfResultPage','pdfDraft','pdfReviewed','pdfToScore','pdfSave','pdfExportText','pdfCopyPrompt','pdfSavePage','pdfPrintPage']) byId(id).disabled=locked || !state.results.length;
    byId('pdfToScore').disabled=locked||!currentResult()||!currentResult().reviewed||!currentResult().text.trim();
    byId('pdfImport').disabled=state.busy||state.loading;
    byId('pdfSave').textContent=state.archiveId?'更新这份存档':'保存为新存档';
    byId('pdfDirty').textContent=state.dirty?'有未保存的修改':'';
  }
  function getSettings() { return {key:byId('songKey').value,octave:byId('tonicOctave').value,shift:byId('shift').value,spelling:byId('spelling').value}; }
  function putSettings(s) { byId('songKey').value=s.key;byId('tonicOctave').value=s.octave;byId('shift').value=s.shift;byId('spelling').value=s.spelling;updateScore(); }
  function currentResult() { return state.results.find(row=>row.page===state.activePage); }
  function markDirty() { state.dirty=true;syncControls(); }
  function canReplace() { return !state.busy && !state.loading && !state.rendering && (!state.dirty || confirm('有未保存的结果。是否放弃这些修改，打开另一份内容？')); }
  async function pdfLibrary() {
    if(!libraryPromise) libraryPromise=import('./vendor/pdfjs/pdf.mjs').then(lib=>{
      lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',location.href).href;
      return lib;
    }).catch(error=>{libraryPromise=null;throw new Error('PDF 组件无法启动，请更新 Android System WebView / Chrome。'+error.message);});
    return libraryPromise;
  }
  async function closeDocument() { if(state.doc){await state.doc.destroy();state.doc=null;} }
  const isImage=file=>['image/png','image/jpeg','image/webp'].includes(file.type)||/\.(png|jpe?g|webp)$/i.test(file.name);
  const isDocx=file=>/\.docx$/i.test(file.name)||file.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isDoc=file=>/\.doc$/i.test(file.name)||file.type==='application/msword';
  // Word (.docx): body text becomes a "document text" page, embedded pictures become image pages (document order).
  async function readDocx(file){
    const items=await ScoreLibrary.readZip(file),byName=new Map(items.map(i=>[i.name,i.blob]));
    const xml=byName.get('word/document.xml');if(!xml)throw new Error('不是有效的 Word 文档。');
    const parse=async name=>{const b=byName.get(name);if(b.size>8*1024*1024)throw new Error('Word XML 超过 8 MB');const text=await b.text();if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Word 包含不支持的实体声明');const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw new Error('Word XML 损坏');return d};
    const doc=await parse('word/document.xml'),W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const lines=[...doc.getElementsByTagNameNS(W,'p')].map(p=>{let t='';for(const n of p.getElementsByTagNameNS(W,'*')){if(n.localName==='t')t+=n.textContent;else if(n.localName==='tab')t+=' ';else if(n.localName==='br')t+='\n'}return t});
    const text=lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
    const rels=new Map();if(byName.has('word/_rels/document.xml.rels'))for(const r of (await parse('word/_rels/document.xml.rels')).getElementsByTagName('Relationship'))rels.set(r.getAttribute('Id'),'word/'+r.getAttribute('Target').replace(/^\/?word\//,''));
    const order=[];for(const el of doc.getElementsByTagName('*'))if(el.localName==='blip'){const id=el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed');const target=rels.get(id);if(target&&!order.includes(target))order.push(target)}
    for(const name of byName.keys())if(/^word\/media\//.test(name)&&!order.includes(name))order.push(name);
    if(text.length>100000||order.length>60)throw new Error('Word 文字或图片数量过多，请分批导入。');const pages=[];let pixels=0;if(text)pages.push({kind:'text',text});
    for(const name of order){if(!/\.(png|jpe?g|gif|bmp|webp)$/i.test(name))continue;try{const bitmap=await SecurityLimits.bitmap(byName.get(name));pixels+=bitmap.width*bitmap.height;if(pixels>32000000){bitmap.close();throw new Error('Word 图片总尺寸过大，请拆分导入。')}pages.push({kind:'image',bitmap})}catch(error){for(const p of pages)p.bitmap?.close();throw error}}
    if(!pages.length)throw new Error('Word 文档里没有文字或可识别的图片。');
    return {pages};
  }
  function drawBitmap(canvas,img,longest){const scale=Math.min(1,longest/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height)}
  function drawTextPage(canvas,text){canvas.width=900;canvas.height=1100;const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,900,1100);c.fillStyle='#182d3d';c.font='22px ui-monospace,monospace';text.split('\n').slice(0,44).forEach((l,i)=>c.fillText(l.slice(0,64),24,40+i*24))}
  // Stores a file in the library without recognition (score manager mode).
  async function addFileOnly(file) {
    try{
      const fileId=ScoreLibrary.newFileId(),now=new Date().toISOString();
      await ScoreLibrary.putFile({id:fileId,blob:file,name:file.name,type:file.type,size:file.size});
      await ScoreLibrary.putRecord(checkedRecord({id:newId(),title:file.name.replace(/\.[^.]+$/,''),sourceName:file.name,pageCount:0,createdAt:now,updatedAt:now,results:[],settings:getSettings(),fileId,fileName:file.name,fileType:file.type,fileSize:file.size}));
      report('pdfStatus',`已把「${file.name}」存入谱库（未识别）。需要时在「我的存档」里打开再识别。`);resetPicker();await refreshArchives();
    }catch(error){report('pdfStatus',`存入谱库失败：${error.message}`,true);}
  }
  // Opens a PDF or an image. `keep` reopens an archive's stored file together with its saved results.
  async function openFile(file, retry=false, keep=null) {
    if(!file || (!retry && !keep && !canReplace())) return;
    const image=isImage(file),word=isDocx(file);
    if(!image&&!word&&!isDoc(file)&&!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){report('pdfStatus','请选择 PDF、图片（PNG / JPG / WebP）或 Word 文档。',true);return;}
    if(isDoc(file)&&!word){if(keep){report('pdfStatus','老式 .doc 文件无法在应用内打开，可用「原文件」导出后用其他应用查看。',true);return;}await addFileOnly(file);if(byId('pdfParse').checked)report('pdfStatus',`「${file.name}」是老式 .doc，无法解析，已作为文件存入谱库。另存为 .docx 后可识别。`);return;}
    if(file.size>MAX_FILE_BYTES){report('pdfStatus','文件超过 80 MB，请先拆成较小文件再导入。',true);return;}
    if(!keep&&!byId('pdfParse').checked){await addFileOnly(file);return;}
    state.loading=true;state.file=file;syncControls();report('pdfStatus',image?'正在打开图片…':word?'正在读取 Word 文档…':'正在打开 PDF，仅预览选中的页面…');
    let task;
    try {
      let doc=null,bitmap=null,wordDoc=null;
      if(image)bitmap=await SecurityLimits.bitmap(file);
      else if(word)wordDoc=await readDocx(file);
      else{
        const lib=await pdfLibrary();
        const data=new Uint8Array(await file.arrayBuffer());
        task=lib.getDocument({data,password:byId('pdfPassword').value||undefined,isEvalSupported:false,enableXfa:false,cMapUrl:new URL('./vendor/pdfjs/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',location.href).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',location.href).href});
        doc=await SecurityLimits.timed(task.promise,()=>task.destroy());if(doc.numPages>2000){await doc.destroy();throw new Error('PDF 超过 2000 页，请拆分文件。')}
      }
      await closeDocument();state.image?.close?.();state.doc=doc;state.image=bitmap;state.word=wordDoc;state.pageCount=doc?doc.numPages:wordDoc?wordDoc.pages.length:1;state.page=1;state.sourceName=file.name;state.dirty=false;
      if(keep){state.results=keep.results;state.activePage=keep.results[0]?.page||null;state.archiveId=keep.id;state.createdAt=keep.createdAt;state.fileMeta=keep.fileMeta;}
      else{state.results=[];state.activePage=null;state.archiveId=null;state.createdAt=null;state.fileMeta=null;}
      byId('pdfPassword').value='';byId('pdfTitle').value=keep?keep.title:file.name.replace(/\.[^.]+$/,'');byId('pdfPages').value='1';byId('pdfPage').value='1';byId('pdfPage').max=state.pageCount;byId('pdfTotal').textContent=`共 ${state.pageCount} 页`;
      byId('pdfControls').hidden=false;byId('pdfControls').classList.toggle('pdf-image-mode',image);renderResults();report('pdfResultStatus','');
      state.loading=false;await previewPage(1);
      report('pdfStatus',word?`${file.name} · Word：${wordDoc.pages[0].kind==='text'?'第 1 页为文档文字，':''}${wordDoc.pages.filter(p=>p.kind==='image').length} 张图片各为一页。`:image?`${file.name} · 图片。点「识别所选页」按转谱页选定的识别方式识别。`:`${file.name} · ${state.pageCount} 页。输入页码或范围后识别；页码按文件顺序计算。`);
    } catch(error) {
      if(task) await task.destroy().catch(()=>{});
      report('pdfStatus',error.name==='PasswordException'?'PDF 需要密码，或密码不正确。填写密码后点“重新打开”。':`打开失败：${error.message||'文件可能损坏或不受支持'}`,true);
    } finally {state.loading=false;syncControls();}
  }
  function drawImage(canvas,longest) {
    const img=state.image,scale=Math.min(1,longest/Math.max(img.width,img.height));
    canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);
  }
  async function renderPage(page, canvas, longest) {
    const natural=page.getViewport({scale:1});
    const scale=Math.min(longest/Math.max(natural.width,natural.height),Math.sqrt(3500000/(natural.width*natural.height)),4);
    const viewport=page.getViewport({scale});
    canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
    const task=page.render({canvasContext:canvas.getContext('2d'),canvas,viewport,background:'rgb(255,255,255)'});
    state.renderTask=task;
    try {await SecurityLimits.timed(task.promise,()=>task.cancel());} finally {if(state.renderTask===task)state.renderTask=null;}
  }
  async function previewPage(number) {
    if((!state.doc&&!state.image&&!state.word)||state.busy||state.rendering)return;
    if(state.word){const wp=state.word.pages[number-1];if(!wp)return;state.page=number;byId('pdfPage').value=number;if(wp.kind==='text'){drawTextPage(byId('pdfCanvas'),wp.text);byId('pdfTextHint').textContent=`第 ${number} 页 · 文档文字（${wp.text.length} 字），识别时直接作为草稿`}else{drawBitmap(byId('pdfCanvas'),wp.bitmap,1200);byId('pdfTextHint').textContent=`第 ${number} 页 · 文档中的图片，识别时按转谱页选定的识别方式处理`}syncControls();return;}
    if(state.image){drawImage(byId('pdfCanvas'),1200);state.page=1;byId('pdfTextHint').textContent='图片 · 识别时按转谱页选定的识别方式处理';return;}
    if(!Number.isInteger(number)||number<1||number>state.pageCount){report('pdfStatus',`请输入 1–${state.pageCount} 的页码。`,true);return;}
    state.rendering=true;syncControls();let page;
    try {
      page=await state.doc.getPage(number);await renderPage(page,byId('pdfCanvas'),1200);
      const text=joinText((await page.getTextContent()).items);
      state.page=number;byId('pdfPage').value=number;byId('pdfTextHint').textContent=`第 ${number} 页 · ${text.trim().length ? `发现文字层（${text.length} 个字符）；仍需检查音符是否完整`:'未发现文字层，将使用图片 OCR'}`;
    }catch(error){report('pdfStatus',`预览失败：${error.message}`,true);}finally{if(page)page.cleanup();state.rendering=false;syncControls();}
  }
  function smallPreview(canvas) {
    const image=document.createElement('canvas'),scale=Math.min(1,900/Math.max(canvas.width,canvas.height));
    image.width=Math.max(1,Math.round(canvas.width*scale));image.height=Math.max(1,Math.round(canvas.height*scale));image.getContext('2d').drawImage(canvas,0,0,image.width,image.height);
    return image.toDataURL('image/jpeg',.72);
  }
  async function runRecognition() {
    if((!state.doc&&!state.image&&!state.word)||state.busy)return;
    if(ocrBusy){report('pdfBatchStatus','图片 OCR 仍在运行，请等待完成后再处理 PDF。',true);return;}
    let pages;
    try{pages=parsePages(byId('pdfPages').value,state.pageCount);}catch(error){report('pdfBatchStatus',error.message,true);return;}
    if(state.results.some(row=>pages.includes(row.page))&&!confirm('所选页中有已有结果。重新识别会覆盖这些页的文字与校对状态，继续吗？'))return;
    if(new Set([...state.results.map(r=>r.page),...pages]).size>300){report('pdfBatchStatus','一份存档最多保存 300 页，请先存档，再重新打开 PDF 建立另一份存档。',true);return;}
    state.busy=true;state.cancelled=false;byId('pdfProgress').hidden=false;byId('pdfProgress').max=pages.length;byId('pdfProgress').value=0;syncControls();
    const mode=byId('pdfMode').value;let completed=0;
    try {
      for(const number of pages){
        if(state.cancelled)break;
        report('pdfBatchStatus',`正在处理第 ${number} 页 · ${completed+1}/${pages.length}`);
        let page,canvas;
        try {
          canvas=document.createElement('canvas');let text='';
          const wp=state.word?.pages[number-1];
          if(state.doc){page=await state.doc.getPage(number);text=joinText((await page.getTextContent()).items);}
          if(wp?.kind==='text')text=wp.text;
          const useText=wp?wp.kind==='text':!!state.doc&&(mode==='text'||(mode==='auto'&&usableText(text)));
          if(state.doc)await renderPage(page,canvas,useText?1200:2300);else if(wp?.kind==='image')drawBitmap(canvas,wp.bitmap,2300);else if(!wp)drawImage(canvas,2300);
          let recognized=text,method=wp?'文档文字':'文字层提取';
          if(!useText){
            method='图片识别';state.ocrPage=number;
            if(!state.worker){
              state.worker=await createScoreRecognizer(step=>{if(!state.cancelled)report('pdfBatchStatus',`第 ${state.ocrPage} 页 · ${step} · 已完成 ${completed}/${pages.length} 页`);});
            }
            if(state.cancelled)break;
            state.ocrPage=number;
            recognized=(await state.worker.recognize(canvas)).data.text.trim();method=state.worker.label;
          }
          if(state.cancelled)break;
          const row={page:number,text:recognized,method,preview:wp?.kind==='text'?'':smallPreview(canvas),reviewed:false,convertedText:''};
          state.results=state.results.filter(item=>item.page!==number).concat(row).sort((a,b)=>a.page-b.page);state.activePage=number;state.dirty=true;completed++;
          byId('pdfProgress').value=completed;renderResults();
          await new Promise(resolve=>setTimeout(resolve,0));
        }finally{if(page)page.cleanup();if(canvas){canvas.width=0;canvas.height=0;}}
      }
      report('pdfBatchStatus',`${state.cancelled?'已停止':'处理完成'}：本次完成 ${completed} 页。结果尚未存档，请逐页校对后保存。${mode==='text'?'若音符未提取出来，请选择“强制图片 OCR”重试。':''}`);
    }catch(error){report('pdfBatchStatus',state.cancelled?`已停止，保留本次已完成的 ${completed} 页。`:`识别中断：${error.message}。已完成的 ${completed} 页仍可保存。`,!state.cancelled);
    }finally{if(state.worker){await state.worker.terminate().catch(()=>{});state.worker=null;}state.busy=false;syncControls();}
  }
  function renderResults() {
    byId('pdfResults').hidden=!state.results.length;
    const select=byId('pdfResultPage');select.replaceChildren();
    for(const row of state.results) select.add(new Option(`第 ${row.page} 页 · ${row.method} · ${row.reviewed?'已校对':'待校对'}`,row.page));
    if(!currentResult())state.activePage=state.results[0]?.page||null;
    select.value=state.activePage;showResult();
  }
  function renderDraftPreview() {const text=byId('pdfDraft').value;const wrap=byId('pdfDraftPreviewWrap');if(!text.trim()){wrap.hidden=true;return}wrap.hidden=false;try{Jianpu.render(byId('pdfDraftPreview'),Jianpu.parse(text).lines);byId('pdfDraftError').hidden=true;}catch(error){byId('pdfDraftPreview').replaceChildren();byId('pdfDraftError').hidden=false;byId('pdfDraftError').textContent=error.message;}}
  function showResult() {
    const row=currentResult();if(!row)return;
    byId('pdfDraft').value=row.text;renderDraftPreview();byId('pdfReviewed').checked=row.reviewed;
    byId('pdfResultImage').hidden=!row.preview;byId('pdfResultImage').src=row.preview||'';
    byId('pdfResultImage').alt=`${state.sourceName} 第 ${row.page} 页存档预览`;
    byId('pdfNoPreview').hidden=!!row.preview;byId('pdfSourceLabel').textContent=`来源：${state.sourceName} · 第 ${row.page} 页`;
    syncControls();
  }
  async function allArchives(){return ScoreLibrary.records();}
  function makeRecord() {
    const now=new Date().toISOString();
    return checkedRecord({id:state.archiveId||newId(),title:byId('pdfTitle').value.trim()||state.sourceName||'未命名简谱',sourceName:state.sourceName,pageCount:state.pageCount,createdAt:state.createdAt||now,updatedAt:now,results:state.results,settings:getSettings(),...(state.fileMeta||{})});
  }
  // Keeps the original file with the archive (stored once per opened file).
  async function storeCurrentFile() {
    if(state.fileMeta||!state.file)return;
    const id=ScoreLibrary.newFileId();
    await ScoreLibrary.putFile({id,blob:state.file,name:state.file.name,type:state.file.type,size:state.file.size});
    state.fileMeta={fileId:id,fileName:state.file.name,fileType:state.file.type,fileSize:state.file.size};
  }
  async function saveArchive() {
    if((!state.results.length&&!state.file)||state.busy)return;
    try{await storeCurrentFile();const draft=makeRecord(),fresh=state.archiveId?await ScoreLibrary.getRecord(state.archiveId):null;const record=checkedRecord({...fresh,...draft,note:fresh?.note||''});await ScoreLibrary.putRecord(record);state.archiveId=record.id;state.createdAt=record.createdAt;state.dirty=false;syncControls();report('pdfResultStatus',`已存档「${record.title}」，共 ${record.results.length} 页。`);await refreshArchives();}
    catch(error){report('pdfResultStatus',`保存失败：${error.message}。请先导出文本备份，检查设备剩余空间。`,true);}
  }
  function archiveText(record) {
    return `${record.title}\n来源：${record.sourceName}\n保存时间：${record.updatedAt}\n\n`+record.results.map(row=>`【第 ${row.page} 页 · ${row.method} · ${row.reviewed?'已校对':'待校对'}】\n${row.text}${row.convertedText?'\n\n【音名谱】\n'+row.convertedText:''}`).join('\n\n');
  }
  function exportFile(filename,mime,text) {
    return Platform.saveBlob(new Blob([text],{type:mime+';charset=utf-8'}),filename,mime);
  }
  async function openArchive(record) {
    if(!canReplace())return;
    const clean=checkedRecord(record),fileMeta=clean.fileId?{fileId:clean.fileId,fileName:clean.fileName,fileType:clean.fileType,fileSize:clean.fileSize}:null;
    const stored=fileMeta?await ScoreLibrary.getFile(clean.fileId):null;
    setLibraryView(false);showTab('pdf');putSettings(clean.settings);
    if(stored){
      await openFile(new File([stored.blob],stored.name||clean.fileName||'score',{type:stored.type||clean.fileType}),true,{...clean,fileMeta});
      report('pdfStatus',clean.results.length?`已打开存档和原文件：可继续识别其他页，或校对已有 ${clean.results.length} 页。`:'已打开原文件（尚未识别）。选择页码后点「识别所选页」。');
    }else{
      if(!clean.results.length){report('pdfStatus','这份存档没有原文件，也没有识别结果。',true);return;}
      await closeDocument();state.image=null;state.word=null;state.file=null;state.results=clean.results;state.activePage=clean.results[0].page;state.archiveId=clean.id;state.createdAt=clean.createdAt;state.sourceName=clean.sourceName;state.pageCount=clean.pageCount;state.fileMeta=null;state.dirty=false;
      byId('pdfFile').value='';byId('pdfTitle').value=clean.title;byId('pdfControls').hidden=true;renderResults();
      report('pdfStatus','已打开存档（没有保存原文件，只能查看和校对已有结果）。');
    }
    report('pdfResultStatus','');(clean.results.length?byId('pdfResults'):byId('pdfControls')).scrollIntoView({behavior:'smooth',block:'start'});
  }
  const sizeText=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
  async function downloadOriginal(record) {
    const f=await ScoreLibrary.getFile(record.fileId);if(!f)throw new Error('原文件不在本机（可能尚未从 WebDAV 同步下来）。');
    await ScoreLibrary.saveBlob(f.blob,f.name||record.fileName||'score',f.type);
  }
  // Workbench association is independent of the PDF reader's currently open archive.
  let scoreSource=null,scoreSaving=false;
  function syncScoreSource(){
    byId('archiveScore').textContent=scoreSource?'保存到原存档':'存入谱库';
    byId('archiveScoreAs').hidden=!scoreSource;byId('archiveDetach').hidden=!scoreSource;
    byId('scoreArchiveSource').textContent=scoreSource?'当前关联：'+scoreSource.title+' · '+(scoreSource.rows.length===1?'第 '+scoreSource.rows[0].page+' 页':scoreSource.rows.length+' 页')+'；保存将更新这份存档。':'尚未关联存档，首次保存会新建。';
    byId('archiveScore').disabled=byId('archiveScoreAs').disabled=scoreSaving;
  }
  function bindScore(record,pages){scoreSource=ArchiveWorkspace.bind(record,pages);syncScoreSource()}
  window.detachScoreArchive=()=>{scoreSource=null;syncScoreSource()};
  byId('archiveDetach').onclick=()=>{window.detachScoreArchive();byId('copyStatus').textContent='已取消关联，当前文字保留；下次保存会新建存档。'};
  async function loadToScore(record,{fullscreen=false}={}){
    const fresh=await ScoreLibrary.getRecord(record.id);if(!fresh||fresh.deleted)throw new Error('这份存档已被删除。');
    const source=ArchiveWorkspace.bind(fresh),text=source.text;
    const input=byId('scoreInput');if(input.value.trim()&&input.value.trim()!==text.trim()&&!await AppDialogs.confirm({title:fullscreen?'打开简谱':'加载到转谱',message:'将「'+fresh.title+'」加载到转谱？当前文字会被替换；尚未保存的修改请先存档。',accept:fullscreen?'打开':'加载'}))return;
    scoreSource=source;input.value=text;putSettings(fresh.settings);syncScoreSource();setLibraryView(false);showTab('score');window.scrollTo({top:0,behavior:'smooth'});
    if(fullscreen)await window.openScoreViewer();
  }
  async function saveScoreArchive(asNew=false){
    if(scoreSaving)return;
    const text=byId('scoreInput').value;if(!text.trim()){byId('copyStatus').textContent='请先输入简谱。';return}
    const source=scoreSource;
    scoreSaving=true;syncScoreSource();
    try{
      const settings=getSettings(),converted=lastConverted?exportText():'';let title=null;
      if(asNew||!source){let named='';try{named=Jianpu.parse(text).meta.title?.value||''}catch{}
        title=await AppDialogs.askName(asNew&&source?source.title+' · 副本':named||'简谱 '+new Date().toLocaleString());
        if(title===null){byId('copyStatus').textContent='已取消存档。';return}
      }
      byId('copyStatus').textContent='正在保存到谱库…';
      const now=new Date().toISOString();let record;
      if(source&&!asNew){
        const fresh=await ScoreLibrary.getRecord(source.id);
        if(state.archiveId===source.id&&state.dirty&&source.rows.some(old=>{const local=state.results.find(r=>r.page===old.page);return local&&local.text!==old.text&&local.text!==text}))throw new Error('逐页校对里也有未保存的修改，请先保存那些修改再重新加载，或将当前内容另存为新存档。');
        record=checkedRecord(ArchiveWorkspace.merge(fresh,source,text,settings,converted,now));
      }else record=checkedRecord({id:newId(),title:title.trim()||'未命名简谱',sourceName:'简谱转换器',pageCount:1,createdAt:now,updatedAt:now,settings,results:[{page:1,text,preview:'',method:'手动 / 图片校对稿',reviewed:false,convertedText:converted}]});
      await ScoreLibrary.putRecord(record);
      // Update only the affected PDF pages; leave other unsaved page drafts in place.
      if(source&&!asNew&&state.archiveId===source.id){const ids=new Set(source.rows.map(r=>r.page));state.results=state.results.map(row=>ids.has(row.page)?{...record.results.find(r=>r.page===row.page)}:row);state.dirty=JSON.stringify(state.results)!==JSON.stringify(record.results)||byId('pdfTitle').value.trim()!==record.title;renderResults()}
      if(scoreSource===source)bindScore(record,source&&!asNew?source.rows.map(r=>r.page):[1]);
      byId('copyStatus').textContent=(source&&!asNew?'已更新原存档「':'已保存「')+record.title+'」。';await refreshArchives();
    }catch(error){byId('copyStatus').textContent='保存失败：'+error.message}
    finally{scoreSaving=false;syncScoreSource()}
  }
  // Share-code import: a new archive holding the shared pages.
  async function importShared(data){
    const now=new Date().toISOString(),record=checkedRecord({id:newId(),title:data.title||'分享的乐谱',note:data.note,sourceName:'二维码分享',createdAt:now,updatedAt:now,settings:getSettings(),
      results:data.pages.map(p=>({page:p.page,text:p.text,preview:'',method:'二维码分享',reviewed:true}))});
    await ScoreLibrary.putRecord(record);await refreshArchives();report('pdfArchiveStatus',`已导入「${record.title}」（${record.results.length} 页）。`);
  }
  byId('pdfScan').onclick=()=>ScoreShare.scan(importShared);
  // Edit an archive's name and note (the change time is updated so WebDAV sync carries it).
  function editArchive(record){
    const dlg=byId('archiveDialog');byId('archiveName').value=record.title;byId('archiveNote').value=record.note||'';
    byId('archiveEditInfo').textContent=`${record.fileName||record.sourceName||''} · 创建于 ${new Date(record.createdAt).toLocaleString()}`;
    byId('archiveSave').onclick=async e=>{e.preventDefault();const title=byId('archiveName').value.trim();if(!title){byId('archiveName').focus();return}
      try{const fresh=await ScoreLibrary.getRecord(record.id);if(!fresh||fresh.deleted)throw new Error('这份存档已被删除。');
        const updated=checkedRecord({...fresh,title,note:byId('archiveNote').value.trim(),updatedAt:new Date().toISOString()});await ScoreLibrary.putRecord(updated);
        if(state.archiveId===record.id)byId('pdfTitle').value=title;dlg.close();await refreshArchives();report('pdfArchiveStatus',`已更新「${title}」。`);}
      catch(error){report('pdfArchiveStatus',`保存失败：${error.message}`,true);dlg.close();}};
    dlg.showModal?dlg.showModal():dlg.setAttribute('open','');setTimeout(()=>byId('archiveName').select(),50);
  }
  async function refreshRecovery(){
    const list=byId('recoveryList');list.replaceChildren();
    try{const items=await ScoreLibrary.recovery();byId('recoveryStatus').textContent=items.length?'共 '+items.length+' 个可恢复版本':'暂无历史版本。';
      for(const item of items){const row=document.createElement('div');row.className='toolbar';const label=document.createElement('span');label.textContent=item.record.title+' · '+item.reason+' · '+new Date(item.at).toLocaleString();const restore=document.createElement('button');restore.textContent='恢复为副本';restore.onclick=async()=>{restore.disabled=true;try{const record=await ScoreLibrary.restoreRecovery(item.id);await refreshArchives();byId('recoveryStatus').textContent='已恢复「'+record.title+'」，可在我的存档中打开。'}catch(error){byId('recoveryStatus').textContent=error.message}finally{restore.disabled=false}};row.append(label,restore);list.append(row)}
    }catch(error){byId('recoveryStatus').textContent=error.message}
  }
  byId('recoveryRefresh').onclick=refreshRecovery;
  byId('recoveryPanel').ontoggle=()=>{if(byId('recoveryPanel').open)refreshRecovery()};
  byId('recoveryClear').onclick=async()=>{if(!confirm('永久清空所有历史与回收站？当前存档会保留。'))return;try{await ScoreLibrary.clearRecovery();await refreshRecovery()}catch(error){byId('recoveryStatus').textContent=error.message}};
  let archiveBrowser=null,archivesRequest=0;
  const archiveOpen=new Set();
  function archiveRow(record){
        const row=document.createElement('details');row.className='pdf-archive-row archive-entry';row.open=archiveOpen.has(record.id);
        row.addEventListener('toggle',()=>{if(!row.isConnected)return;if(row.open)archiveOpen.add(record.id);else archiveOpen.delete(record.id)});
        const text=document.createElement('div');text.className='grow';const title=document.createElement('strong');title.textContent=record.title;
        const kind=record.fileId?(/pdf/i.test(record.fileType)||/\.pdf$/i.test(record.fileName)?'pdf':/\.docx?$/i.test(record.fileName)||/word/i.test(record.fileType)?'word':'image'):'text';const badge=document.createElement('span');badge.className='archive-icon type-'+kind;badge.textContent={pdf:'PDF',word:'W',image:'图',text:'文'}[kind];badge.ariaHidden='true';
        const meta=document.createElement('p');meta.className='subtle';
        meta.textContent=[record.fileId?`${record.fileName} · ${sizeText(record.fileSize)}`:record.sourceName||'无原文件',record.results.length?`已识别 ${record.results.length} 页 · ${record.results.filter(r=>r.reviewed).length} 页已校对`:'未识别',`保存于 ${new Date(record.updatedAt).toLocaleString()}`].join(' · ');
        const summary=document.createElement('summary'),date=document.createElement('span');date.className='archive-entry-date';date.textContent=new Date(record.updatedAt).toLocaleDateString();const head=document.createElement('span');head.className='archive-head';const sub=document.createElement('small');const done=record.results.filter(r=>r.reviewed).length,hasText=record.results.some(r=>r.text.trim());sub.textContent=record.results.length?`${record.results.length} 页 · ${done} 页已校对`:(record.fileId?record.fileName:'文字谱');head.append(title,sub);const status=document.createElement('span');const st=!hasText?'none':record.results.every(r=>r.text.trim()&&r.reviewed)?'ok':'part';status.className='archive-status st-'+st;if(!record.fileId)status.hidden=true;status.textContent={none:'未识别',ok:'已校对',part:'待校对'}[st];summary.append(badge,head,status,date);row.append(summary);row.archiveId=record.id;
        const body=document.createElement('div');body.className='archive-entry-body';text.append(meta);
        const created=document.createElement('p');created.className='subtle';created.textContent='创建于 '+new Date(record.createdAt).toLocaleString();text.append(created);if(record.note){const n=document.createElement('p');n.className='archive-note';n.textContent=record.note;text.append(n)}body.append(text);
        const hasScore=record.results.some(r=>r.text.trim());
        const actions=[[hasScore?'打开':record.results.length?'预览':'识别',()=>hasScore?loadToScore(record,{fullscreen:true}):openArchive(record)]];
        if(hasScore&&record.fileId)actions.push(['校对识别',()=>openArchive(record)]);
        if(record.results.some(r=>r.text.trim()))actions.push(['加载到转谱',()=>loadToScore(record)],['分享',()=>ScoreShare.show(record)]);
        actions.push(['编辑',()=>editArchive(record)]);
        if(record.fileId)actions.push(['原文件',()=>downloadOriginal(record)]);
        if(record.results.length)actions.push(['导出文字',()=>exportFile(record.title+'.txt','text/plain',archiveText(record))]);
        actions.push(['删除',async()=>{if(!confirm(`将「${record.title}」移至本机回收站？删除状态也会通过 WebDAV 同步，原文件暂保留供恢复。`))return;await ScoreLibrary.removeRecord(record.id);if(state.archiveId===record.id){state.archiveId=null;state.createdAt=null;state.fileMeta=null;markDirty();}await refreshArchives();}]);
        for(const [label,action] of actions){
          const button=document.createElement('button');button.textContent=label;button.onclick=()=>Promise.resolve().then(action).catch(error=>report('pdfArchiveStatus',error.message,true));body.append(button);
        }
    row.append(body);return row;
  }
  async function refreshArchives() {
    const request=++archivesRequest;byId('pdfRefresh').disabled=true;
    try {
      const raw=await allArchives();if(request!==archivesRequest)return;
      const records=[];let invalid=0;
      for(const r of raw){try{records.push(checkedRecord(r))}catch{invalid++}}
      const existing=new Set(records.map(r=>r.id));for(const id of archiveOpen)if(!existing.has(id))archiveOpen.delete(id);
      if(!archiveBrowser)archiveBrowser=ArchiveBrowser.create({byId,makeRow:archiveRow});
      archiveBrowser.setRecords(records);byId('pdfBackup').disabled=!records.length;
      if(invalid)report('pdfArchiveStatus',`${invalid} 份存档格式异常，未显示；原数据未改动，请先备份。`,true);
    }catch(error){if(request===archivesRequest)report('pdfArchiveStatus',`谱库无法读取：${error.message}。`,true)}
    finally{if(request===archivesRequest)byId('pdfRefresh').disabled=false}
  }
  async function importBackup(file) {
    if(!file)return;
    try{
      if(/\.zip$/i.test(file.name)||/zip/.test(file.type)){
        const {records,files}=await ScoreLibrary.readBackupZip(file);
        const incoming=records.filter(r=>!r.deleted).map(r=>checkedRecord(r));
        if(!incoming.length)throw new Error('备份里没有存档。');
        if(!confirm(`从备份恢复 ${incoming.length} 份存档（含 ${files.size} 个原文件）？同一份存档以较新的为准。`))return;
        let added=0;
        for(const record of incoming){
          const existing=await ScoreLibrary.getRecord(record.id);
          if(existing&&!existing.deleted&&existing.updatedAt>=record.updatedAt)continue;
          if(record.fileId&&files.has(record.fileId))await ScoreLibrary.putFile({id:record.fileId,blob:files.get(record.fileId),name:record.fileName,type:record.fileType,size:record.fileSize});
          await ScoreLibrary.putRecord(record);added++;
        }
        await refreshArchives();report('pdfArchiveStatus',`已恢复 ${added} 份存档${incoming.length>added?`，${incoming.length-added} 份本机已有较新版本，已跳过`:''}。`);
        return;
      }
      if(file.size>25*1024*1024)throw new Error('JSON 备份超过 25 MB。');
      const data=JSON.parse(await file.text());
      if(data.format!=='flute-key-lab-archives'||data.version!==1||!Array.isArray(data.records)||!data.records.length||data.records.length>200)throw new Error('请选择本工具导出的 zip 备份或旧版 JSON 备份。');
      const records=data.records.map(record=>checkedRecord(record,true));
      if(!confirm(`导入 ${records.length} 份旧版存档？会添加为副本，保留已有存档。`))return;
      for(const record of records)await ScoreLibrary.putRecord(record);
      await refreshArchives();report('pdfArchiveStatus',`已导入 ${records.length} 份存档副本。`);
    }catch(error){report('pdfArchiveStatus',`导入失败：${error.message}`,true);}finally{byId('pdfImport').value='';}
  }
  // ---------- WebDAV ----------
  function davForm(){return {...ScoreLibrary.davConfig(),url:byId('davUrl').value.trim(),user:byId('davUser').value.trim(),pass:byId('davPass').value||(byId('davPass').dataset.stored==='1'?SecureCredentials.TOKEN:''),folder:byId('davFolder').value.trim()||'笛调之间'};}
  function showDavConfig(){const c=ScoreLibrary.davConfig();byId('davUrl').value=c.url;byId('davUser').value=c.user;byId('davPass').dataset.stored=c.pass===SecureCredentials.TOKEN?'1':'0';byId('davPass').value=c.pass===SecureCredentials.TOKEN?'':c.pass;byId('davPass').placeholder=c.pass===SecureCredentials.TOKEN?'已安全保存；留空保持':'密码 / 应用密码';byId('davFolder').value=c.folder;byId('davLast').textContent=c.lastSync?`上次同步：${new Date(c.lastSync).toLocaleString()}`:'尚未同步';}
  byId('davPreset').onchange=()=>{if(byId('davPreset').value)byId('davUrl').value=byId('davPreset').value;report('davStatus','已填入地址，请填写账号和密码后保存。');};
  byId('davForget').onclick=async()=>{try{await SecureCredentials.removeAsync('webdav');if(!await ScoreLibrary.saveDavConfigAsync({...ScoreLibrary.davConfig(),pass:''}))throw new Error('清除设置失败');showDavConfig();report('davStatus','已清除保存的密码，需要重新填写后才能同步。')}catch(error){report('davStatus',error.message,true)}};
  byId('davSave').onclick=async()=>{const ok=await ScoreLibrary.saveDavConfigAsync(davForm());if(ok)showDavConfig();report('davStatus',ok?'已安全保存':'保存失败：修改服务地址或账号后请重新填写密码。',!ok)};
  byId('davTest').onclick=async()=>{byId('davTest').disabled=true;report('davStatus','正在连接…');try{await ScoreLibrary.testDav(davForm());report('davStatus','连接成功，远端文件夹已就绪。记得点「保存设置」。');}catch(error){report('davStatus',`连接失败：${error.message}`,true);}finally{byId('davTest').disabled=false;}};
  byId('davSync').onclick=async()=>{
    if(state.dirty&&!confirm('当前识别结果还没保存，同步不会包含它们。继续同步吗？'))return;
    byId('davSync').disabled=true;
    try{if(!await ScoreLibrary.saveDavConfigAsync(davForm()))throw new Error('凭据保存失败，修改地址或账号后请重新填写密码');const r=await ScoreLibrary.sync(step=>report('davStatus',`${step}…`));report('davStatus',`同步完成：上传 ${r.up} 份、下载 ${r.down} 份、删除 ${r.removed} 份。`);showDavConfig();await refreshArchives();}
    catch(error){report('davStatus',`同步失败：${error.message}`,true);}finally{byId('davSync').disabled=false;}
  };
  showDavConfig();
  function setLibraryView(library) {
    byId('pdfImportView').hidden=library;byId('pdfLibraryView').hidden=!library;
    byId('pdfImportTab').setAttribute('aria-pressed',String(!library));byId('pdfLibraryTab').setAttribute('aria-pressed',String(library));
    if(library)refreshArchives();
  }
  byId('pdfImportTab').onclick=()=>setLibraryView(false);
  byId('pdfLibraryTab').onclick=()=>setLibraryView(true);
  byId('pdfOpenLibrary').onclick=()=>{setLibraryView(true);window.scrollTo(0,0);};
  let fullHeight=window.innerHeight;
  function keyboardLayout(){const focused=document.activeElement;const typing=focused&&(focused.tagName==='TEXTAREA'||(focused.tagName==='INPUT'&&['text','number','password'].includes(focused.type)));if(!typing)fullHeight=Math.max(fullHeight,window.innerHeight);document.body.classList.toggle('keyboard-open',!!typing&&window.innerHeight<fullHeight-150);}
  window.addEventListener('resize',keyboardLayout);document.addEventListener('focusout',()=>setTimeout(keyboardLayout,0));
  // Clears the picked file (and what was opened from it) after the usual unsaved-changes check.
  function resetPicker(){byId('pdfFile').value='';byId('pdfPickTitle').textContent='选择 PDF、图片或 Word';byId('pdfPickHint').textContent='PDF / 图片 / Word · 最多 80 MB';byId('pdfClear').hidden=true;}
  byId('pdfClear').onclick=async()=>{if(state.busy||!canReplace())return;await closeDocument();state.image?.close?.();state.image=null;state.word=null;state.file=null;state.results=[];state.activePage=null;state.archiveId=null;state.createdAt=null;state.fileMeta=null;state.dirty=false;resetPicker();byId('pdfControls').hidden=true;renderResults();report('pdfStatus','已取消选择。');syncControls();};
  byId('pdfFile').onchange=()=>{const f=byId('pdfFile').files[0];byId('pdfClear').hidden=!f;byId('pdfPickTitle').textContent=f?f.name:'选择 PDF、图片或 Word';byId('pdfPickHint').textContent=f?`${f.size>=1048576?(f.size/1048576).toFixed(1)+' MB':Math.max(1,Math.round(f.size/1024))+' KB'} · 点此更换文件`:'PDF / 图片 / Word · 最多 80 MB';openFile(f);};
  byId('pdfReload').onclick=()=>{if(canReplace())openFile(state.file,true);};
  byId('pdfPrev').onclick=()=>previewPage(state.page-1);byId('pdfNext').onclick=()=>previewPage(state.page+1);byId('pdfGo').onclick=()=>previewPage(Number(byId('pdfPage').value));
  byId('pdfPage').onkeydown=event=>{if(event.key==='Enter')previewPage(Number(event.target.value));};
  byId('pdfUseCurrent').onclick=()=>{byId('pdfPages').value=state.page;};
  byId('pdfRun').onclick=runRecognition;
  byId('pdfCancel').onclick=()=>{state.cancelled=true;if(state.renderTask)state.renderTask.cancel();if(state.worker){state.worker.terminate().catch(()=>{});state.worker=null;}report('pdfBatchStatus','正在停止，保留已完成的页面…');};
  byId('pdfResultPage').onchange=()=>{state.activePage=Number(byId('pdfResultPage').value);showResult();};
  byId('pdfDraft').oninput=()=>{renderDraftPreview();const row=currentResult();if(!row)return;row.text=byId('pdfDraft').value;row.reviewed=false;row.convertedText='';byId('pdfReviewed').checked=false;const option=byId('pdfResultPage').selectedOptions[0];if(option)option.textContent=`第 ${row.page} 页 · ${row.method} · 待校对`;markDirty();};
  byId('pdfReviewed').onchange=()=>{const row=currentResult();if(!row)return;row.reviewed=byId('pdfReviewed').checked;markDirty();const option=byId('pdfResultPage').selectedOptions[0];if(option)option.textContent=`第 ${row.page} 页 · ${row.method} · ${row.reviewed?'已校对':'待校对'}`;};
  byId('pdfTitle').oninput=()=>{if(state.results.length)markDirty();};
  byId('pdfSave').onclick=saveArchive;
  byId('pdfPrintPage').onclick=()=>{const row=currentResult();if(!row)return;try{printScoreSheet(Jianpu.parse(row.text).lines,`${byId('pdfTitle').value||'谱面'} · 第 ${row.page} 页`,`来源：${state.sourceName}`)}catch(error){report('pdfResultStatus','本页草稿有格式错误，修正后再导出：'+error.message,true)}};
  byId('pdfCopyPrompt').onclick=async()=>{report('pdfResultStatus',await copyPlain(ScoreOCR.promptFor(ScoreOCR.loadConfig().kind,ScoreOCR.loadConfig().extraPrompt,ScoreOCR.loadConfig().scope))?'提示词已复制。把它和「保存本页图片」得到的图片一起发给 AI，再把结果粘贴到本页草稿。':'无法复制，请到转谱页的识别区域查看提示词全文。');};
  byId('pdfSavePage').onclick=async()=>{
    const row=currentResult();if(!row)return;let blob;
    try{
      const wp=state.word?.pages[row.page-1];
      if(wp?.kind==='text')throw new Error('这一页是文档文字，没有图片。');
      if(state.doc||state.image||wp){const canvas=document.createElement('canvas');if(state.doc){const page=await state.doc.getPage(row.page);await renderPage(page,canvas,2000);page.cleanup();}else if(wp)drawBitmap(canvas,wp.bitmap,2000);else drawImage(canvas,2000);blob=await new Promise(r=>canvas.toBlob(r,'image/png'));}
      else if(row.preview)blob=await (await fetch(row.preview)).blob();
      if(!blob)throw new Error('这一页没有可保存的图片。');
      await ScoreLibrary.saveBlob(blob,`${byId('pdfTitle').value||'谱面'}-第${row.page}页.${blob.type==='image/png'?'png':'jpg'}`,blob.type);
    }catch(error){report('pdfResultStatus',error.message,true);}
  };
  byId('pdfExportText').onclick=()=>{try{const record=makeRecord();exportFile(record.title+'.txt','text/plain',archiveText(record));}catch(error){report('pdfResultStatus',error.message,true);}};
  byId('pdfToScore').onclick=async()=>{const row=currentResult();if(!row?.reviewed)return;
    try{const record=state.archiveId?await ScoreLibrary.getRecord(state.archiveId):null;if(record&&!record.deleted&&record.results.some(r=>r.page===row.page))bindScore(record,[row.page]);else window.detachScoreArchive();byId('scoreInput').value=row.text;updateScore();showTab('score');byId('scoreInput').focus()}catch(error){report('pdfResultStatus',error.message,true)}
  };
  byId('pdfRefresh').onclick=refreshArchives;
  byId('pdfBackup').onclick=async()=>{byId('pdfBackup').disabled=true;report('pdfArchiveStatus','正在打包…');try{const zip=await ScoreLibrary.exportZip();await ScoreLibrary.saveBlob(zip,`笛调之间-谱库备份-${new Date().toISOString().slice(0,10)}.zip`,'application/zip');report('pdfArchiveStatus',`备份已打包（${sizeText(zip.size)}），请选择保存位置。`);}catch(error){report('pdfArchiveStatus',error.message,true);}finally{byId('pdfBackup').disabled=false;}};
  byId('pdfImport').onchange=()=>importBackup(byId('pdfImport').files[0]);
  byId('archiveScore').onclick=()=>saveScoreArchive();
  byId('archiveScoreAs').onclick=()=>saveScoreArchive(true);
  syncScoreSource();
  window.pdfWorkbenchCanLeave=()=>{if(state.busy){alert('正在识别，请先停止或等待完成，再退出。');return false;}return !state.dirty||confirm('还有未存档的识别结果，仍要退出吗？');};
  // Pure functions exposed for deterministic regression tests, without document contents.
  window.PdfWorkbenchCore={parsePages,joinText,usableText,checkedRecord};
  syncControls();refreshArchives();
})();
// Modified by AI on 2026-10-11 01:58:52
