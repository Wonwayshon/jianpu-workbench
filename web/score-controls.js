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
})();
// Modified by AI on 2026-10-11 00:17:25
