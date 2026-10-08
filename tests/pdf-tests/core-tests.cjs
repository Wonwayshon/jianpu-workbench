const assert=require('node:assert/strict');const crypto=require('node:crypto').webcrypto;const MAX_PAGES=20;
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
    if (!raw || typeof raw.title !== 'string' || !Array.isArray(raw.results) || !raw.results.length || raw.results.length > 300) throw new Error('存档格式不正确，或单份存档超过 300 页。');
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
    return {schema:1,id:freshId ? newId() : (typeof raw.id === 'string' && /^[\w-]{1,100}$/.test(raw.id) ? raw.id : newId()),title:raw.title.slice(0,120),sourceName:String(raw.sourceName || '存档').slice(0,240),pageCount:Math.max(results[results.length-1].page,Number.isSafeInteger(raw.pageCount)?raw.pageCount:0),createdAt:validDate(raw.createdAt,now),updatedAt:validDate(raw.updatedAt,now),results,settings:{key:['0','1','2','3','4','5','6','7','8','9','10','11'].includes(String(settings.key))?String(settings.key):'0',octave:['3','4','5','6'].includes(String(settings.octave))?String(settings.octave):'4',shift:['-12','0','12','24'].includes(String(settings.shift))?String(settings.shift):'0',spelling:['auto','flat','sharp'].includes(settings.spelling)?settings.spelling:'auto'}};
  }
  function validDate(value,fallback) { return typeof value==='string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback; }
  function newId() { return 'score-'+Date.now().toString(36)+'-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),v=>v.toString(16).padStart(2,'0')).join(''); }

assert.deepEqual(parsePages('3,1-2,2，7',12),[1,2,3,7]);
for(const input of ['0','4-2','21','1-21','','1,a','1.5','999999999999999999']) assert.throws(()=>parsePages(input,20));
assert.equal(joinText([{str:'1 2 3',transform:[0,0,0,0,0,200],height:10},{str:'4 5 6',transform:[0,0,0,0,0,180],height:10,hasEOL:true}]),'1 2 3\n4 5 6');
assert.equal(usableText('1 2 3 4 5 6 7 1'),true);assert.equal(usableText('Title 2026'),false);
const record={title:'Test',results:[{page:3,text:'1 2 3',reviewed:true}],settings:{key:'5',octave:'4',shift:'0',spelling:'flat'}};
assert.equal(checkedRecord(record).settings.key,'5');
assert.throws(()=>checkedRecord({...record,results:[record.results[0],record.results[0]]}));
assert.throws(()=>checkedRecord({...record,results:[{page:1,text:'1',preview:'data:text/html;base64,AAAA'}]}));
assert.throws(()=>checkedRecord({...record,results:[{page:1,text:'1'.repeat(100001)}]}));
const a=checkedRecord({...record,id:'test'},true),b=checkedRecord({...record,id:'test'},true);assert.notEqual(a.id,b.id);
assert.equal(checkedRecord({...record,settings:{key:'99',octave:'-9'}}).settings.key,'0');
console.log('PASS: page selection bounds/dedup, text lines, OCR fallback, archive validation and import IDs');
// Modified by AI on 2026-10-08 10:06:28
