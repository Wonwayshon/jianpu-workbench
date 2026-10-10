'use strict';
// Workbench chrome: notation × key controls over the four legacy view buttons, pop-over menus, import dialog, symbol bar.
(() => {
const $ = (id) => document.getElementById(id);
const pressed = (id) => $(id) && $(id).getAttribute('aria-pressed') === 'true';
let keySel = 'orig';

// ---------- pop-over menus ----------
const menus = [['exportBtn', 'exportMenu'], ['keyBtn', 'keyMenu'], ['dispBtn', 'dispMenu']];
function closeMenus(except) {
for (const [b, m] of menus) if (m !== except && $(m) && !$(m).hidden) { $(m).hidden = true; $(b).setAttribute('aria-expanded', 'false'); }
}
for (const [b, m] of menus) {
if (!$(b)) continue;
$(b).addEventListener('click', (e) => { e.stopPropagation(); const open = $(m).hidden; closeMenus(m); $(m).hidden = !open; $(b).setAttribute('aria-expanded', String(open)); });
$(m).addEventListener('click', (e) => e.stopPropagation());
}
document.addEventListener('click', () => closeMenus());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
for (const id of ['copyScore', 'downloadScore', 'printScore']) if ($(id)) $(id).addEventListener('click', () => closeMenus());

// ---------- notation × key ----------
function current() {
const trans = pressed('viewTrans');
const staff = pressed('viewStaff') || (trans && $('transShow').value === 'staff');
const key = trans ? 'trans' : pressed('viewFlute') ? 'fixed' : pressed('viewStaff') ? keySel === 'trans' ? 'orig' : keySel : 'orig';
return { staff, key };
}
function optText(sel) { const o = sel && sel.selectedOptions[0]; return o ? o.textContent.trim() : ''; }
function render() {
const { staff, key } = current();
keySel = key;
$('notationJp').setAttribute('aria-pressed', String(!staff));
$('notationStaff').setAttribute('aria-pressed', String(staff));
for (const b of $('keyMenu').querySelectorAll('[data-key]')) b.setAttribute('aria-checked', String(b.dataset.key === key));
$('keyTrans').hidden = key !== 'trans';
const label = key === 'trans' ? '转 1=' + optText($('transKey')).replace(/^1\s*=\s*/, '') : key === 'fixed' ? '音名谱 1=C' : '原调 1=' + optText($('songKey')).replace(/^1\s*=\s*/, '');
$('keyBtnLabel').textContent = label;
$('keyBtn').classList.toggle('on', key !== 'orig');
}
function apply(staff, key) {
keySel = key;
if (key === 'trans') {
const want = staff ? 'staff' : 'jianpu';
if ($('transShow').value !== want) { $('transShow').value = want; if ($('transShow').onchange) $('transShow').onchange(); }
if (!pressed('viewTrans')) $('viewTrans').click();
} else if (staff) { if (!pressed('viewStaff')) $('viewStaff').click(); }
else $(key === 'fixed' ? 'viewFlute' : 'viewSource').click();
render();
}
$('notationJp').onclick = () => apply(false, current().key);
$('notationStaff').onclick = () => apply(true, current().key);
for (const b of $('keyMenu').querySelectorAll('[data-key]')) b.onclick = () => { apply(current().staff, b.dataset.key); if (b.dataset.key !== 'trans') closeMenus(); };
for (const id of ['viewFlute', 'viewSource', 'viewStaff', 'viewTrans']) new MutationObserver(render).observe($(id), { attributes: true, attributeFilter: ['aria-pressed'] });
for (const id of ['songKey', 'transKey', 'transMode', 'transShow']) $(id).addEventListener('change', () => setTimeout(render));
render();

// ---------- import dialog ----------
const dlg = $('importDialog');
const openImport = () => { closeMenus(); if (!dlg.open) dlg.showModal(); };
$('openImport').onclick = openImport;
$('importClose').onclick = () => dlg.close();
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
$('importPaste').onclick = () => { dlg.close(); $('pasteDraft').click(); $('scoreInput').focus(); };
$('importLibrary').onclick = () => { dlg.close(); if (typeof window.showTab === 'function') window.showTab('pdf'); else $('pdfTab').click(); };
$('copyPromptAuto').onclick = () => {
const staff = $('ocrKind').value === 'staff', full = $('ocrScope').value === 'full';
$(full ? (staff ? 'copyPromptFullStaff' : 'copyPromptFullJianpu') : (staff ? 'copyPromptStaff' : 'copyPromptJianpu')).click();
};
window.openScoreImport = openImport;

// ---------- phone: score / text switch ----------
const panel = $('scorePanel');
const sw = document.createElement('div');
sw.className = 'app-segments pane-switch no-print'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', '视图');
sw.innerHTML = '<button type="button" data-pane="score">谱面</button><button type="button" data-pane="text">文本</button>';
panel.querySelector('.score-work').before(sw);
function setPane(p) { panel.dataset.pane = p; for (const b of sw.children) b.setAttribute('aria-pressed', String(b.dataset.pane === p)); }
for (const b of sw.children) b.onclick = () => setPane(b.dataset.pane);
setPane($('scoreInput').value.trim() ? 'score' : 'text');
window.setScorePane = setPane;

// ---------- symbol bar ----------
const input = $('scoreInput');
let caret = null;
input.addEventListener('blur', () => { caret = [input.selectionStart, input.selectionEnd]; });
for (const b of document.querySelectorAll('.sym-bar [data-ins]')) {
b.addEventListener('mousedown', (e) => e.preventDefault());
b.onclick = () => {
const ins = b.dataset.ins;
const [s, e] = document.activeElement === input ? [input.selectionStart, input.selectionEnd] : caret || [input.value.length, input.value.length];
const chord = ins === '<>';
const text = chord ? '<' + input.value.slice(s, e) + '>' : ins;
input.setRangeText(text, s, e, 'end');
if (chord && s === e) input.setSelectionRange(s + 1, s + 1);
input.focus();
input.dispatchEvent(new Event('input', { bubbles: true }));
};
}

// ---------- full-screen viewer: same notation × key model ----------
(() => {
const tabs = document.querySelector('.viewer-tabs');
if (!tabs) return;
const vp = (id) => $(id).getAttribute('aria-pressed') === 'true';
const box = document.createElement('div');
box.className = 'viewer-model';
box.innerHTML = '<div class="app-segments viewer-notation" role="group" aria-label="记谱法"><button type="button" data-n="jp">简谱</button><button type="button" data-n="staff">五线谱</button></div>'
+ '<select id="viewerKey" aria-label="调"><option value="orig">原调</option><option value="fixed">音名谱 1=C</option><option value="trans">转调</option></select>';
tabs.after(box); tabs.hidden = true;
const sel = box.querySelector('select'), seg = box.querySelectorAll('[data-n]');
let vKey = 'fixed';
function state() {
const trans = vp('viewerTrans');
const staff = vp('viewerStaff') || (trans && $('transShow').value === 'staff');
const key = trans ? 'trans' : vp('viewerFlute') ? 'fixed' : vp('viewerStaff') ? (vKey === 'trans' ? 'orig' : vKey) : 'orig';
return { staff, key };
}
function sync() {
const { staff, key } = state(); vKey = key;
for (const b of seg) b.setAttribute('aria-pressed', String((b.dataset.n === 'staff') === staff));
sel.value = key;
const t = optText($('transKey')).replace(/^1\s*=\s*/, '');
sel.options[2].textContent = t ? '转 1=' + t : '转调';
}
function go(staff, key) {
vKey = key;
if (key === 'trans') {
const want = staff ? 'staff' : 'jianpu';
if ($('transShow').value !== want) { $('transShow').value = want; if ($('transShow').onchange) $('transShow').onchange(); }
$('viewerTrans').click();
} else if (staff) $('viewerStaff').click();
else $(key === 'fixed' ? 'viewerFlute' : 'viewerSource').click();
sync();
}
for (const b of seg) b.onclick = () => go(b.dataset.n === 'staff', state().key);
sel.onchange = () => go(state().staff, sel.value);
for (const id of ['viewerFlute', 'viewerSource', 'viewerStaff', 'viewerTrans']) new MutationObserver(sync).observe($(id), { attributes: true, attributeFilter: ['aria-pressed'] });
sync();
})();

// ---------- parse errors: mirror into the text pane with a jump-to-line action ----------
(() => {
const err = $('scoreError'), inline = $('scoreErrorInline'), ta = $('scoreInput');
function jump(n) {
const lines = ta.value.split('\n'); let start = 0;
for (let i = 0; i < n - 1 && i < lines.length; i++) start += lines[i].length + 1;
const end = start + (lines[n - 1] || '').length;
if (window.setScorePane) window.setScorePane('text');
ta.focus(); ta.setSelectionRange(start, end);
const lh = parseFloat(getComputedStyle(ta).lineHeight) || 28; ta.scrollTop = Math.max(0, (n - 3) * lh);
}
function sync() {
const msg = err.hidden ? '' : err.textContent.trim();
ta.classList.toggle('has-error', !!msg);
inline.hidden = !msg; inline.replaceChildren();
if (!msg) return;
const text = document.createElement('span'); text.textContent = msg; inline.append(text);
const m = msg.match(/第\s*(\d+)\s*行/);
if (m) { const b = document.createElement('button'); b.type = 'button'; b.className = 'small-btn'; b.textContent = '跳到第 ' + m[1] + ' 行'; b.onclick = () => jump(Number(m[1])); inline.append(b); }
}
new MutationObserver(sync).observe(err, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
sync();
})();

// ---------- multi-part scores: one 声部 pop-over ----------
(() => {
const bar = $('partBar'), play = $('scorePartPlayback'), disp = $('dispBtn');
if (!bar || !disp) return;
const wrap = document.createElement('div'); wrap.className = 'menu-wrap parts-wrap';
wrap.innerHTML = '<button type="button" id="partsBtn" class="out-pill" aria-haspopup="true" aria-expanded="false"><span class="out-pill-k">声部</span><span id="partsBtnLabel"></span></button><div id="partsMenu" class="pop-menu parts-menu" hidden></div>';
disp.parentElement.before(wrap);
const btn = $('partsBtn'), menu = $('partsMenu');
menu.append(bar, play);
menus.push(['partsBtn', 'partsMenu']);
btn.addEventListener('click', (e) => { e.stopPropagation(); const open = menu.hidden; closeMenus('partsMenu'); menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
menu.addEventListener('click', (e) => e.stopPropagation());
function sync() {
wrap.hidden = bar.hidden;
const o = $('partSelect').selectedOptions[0];
$('partsBtnLabel').textContent = o ? o.textContent.trim() : '';
}
new MutationObserver(sync).observe(bar, { attributes: true, attributeFilter: ['hidden'] });
new MutationObserver(sync).observe($('partSelect'), { childList: true, subtree: true });
$('partSelect').addEventListener('change', sync);
document.addEventListener('click', () => setTimeout(sync), true);
sync();
})();

// ---------- text pane: help pop-over, text / original image, line numbers ----------
(() => {
const hb = $('helpBtn'), hm = $('helpMenu');
if (hb && hm) {
menus.push(['helpBtn', 'helpMenu']);
hb.addEventListener('click', (e) => { e.stopPropagation(); const open = hm.hidden; closeMenus('helpMenu'); hm.hidden = !open; hb.setAttribute('aria-expanded', String(open)); });
hm.addEventListener('click', (e) => e.stopPropagation());
}
const pane = document.querySelector('.score-controls'), img = $('srcImage'), prev = $('imagePreview');
function syncImage() { const src = prev && !prev.hidden && prev.getAttribute('src'); img.hidden = !src; if (src) img.src = src; $('srcImageHint').hidden = !!src; }
function setSrc(v) { pane.dataset.src = v; for (const b of pane.querySelectorAll('.src-tabs [data-src]')) b.setAttribute('aria-pressed', String(b.dataset.src === v)); pane.querySelector('.src-image').hidden = v !== 'img'; if (v === 'img') syncImage(); }
for (const b of pane.querySelectorAll('.src-tabs [data-src]')) b.onclick = () => setSrc(b.dataset.src);
if (prev) new MutationObserver(syncImage).observe(prev, { attributes: true, attributeFilter: ['src', 'hidden'] });
setSrc('text');
const ta = $('scoreInput'), gutter = $('lineGutter');
let count = 0;
function numbers() { const n = ta.value.split('\n').length; if (n !== count) { count = n; gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); } gutter.scrollTop = ta.scrollTop; }
ta.addEventListener('input', numbers); ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });
new MutationObserver(numbers).observe(ta, { attributes: true });
setInterval(() => { if (!document.hidden && ta.offsetParent) numbers(); }, 800);
numbers();
})();

// ---------- workspace title and compact archive status ----------
(() => {
const h1 = document.querySelector('.ws-title h1'), src = $('scoreArchiveSource'), ta = $('scoreInput');
const chip = document.createElement('span'); chip.id = 'wsStatus'; chip.className = 'ws-status'; src.after(chip);
function title() { const m = ta.value.match(/^@title[ \t]+(.+)$/m); h1.textContent = m ? m[1].trim() : '转谱'; }
function status() {
const t = src.textContent.trim(); chip.title = t;
const linked = /关联|已保存/.test(t) && !/尚未/.test(t);
chip.textContent = linked ? '已存档' : '未存档'; chip.classList.toggle('saved', linked);
}
let timer; ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(title, 200); });
new MutationObserver(status).observe(src, { childList: true, characterData: true, subtree: true });
setInterval(() => { if (!document.hidden) title(); }, 1500);
title(); status();
})();
})();
// Modified by AI on 2026-10-11 02:29:06
