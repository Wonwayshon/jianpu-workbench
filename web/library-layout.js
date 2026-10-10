'use strict';
// Wide screens: archive list on the left, the selected archive's details and actions in a side pane.
// Narrow screens keep the inline <details> rows. The action buttons are moved, never copied, so their handlers stay intact.
(() => {
const list = document.getElementById('pdfArchiveList'), pane = document.getElementById('archiveDetail');
if (!list || !pane) return;
const wide = matchMedia('(min-width:1100px)');
const empty = pane.firstElementChild;
let row = null, id = null;
const bodyOf = (r) => r._body || (r._body = r.querySelector('.archive-entry-body'));
function release() {
if (row && row.isConnected && bodyOf(row) && bodyOf(row).parentNode !== row) row.append(bodyOf(row));
if (row) row.classList.remove('selected');
row = null;
}
function select(r) {
if (r === row) return;
release(); row = r; id = r.archiveId;
r.classList.add('selected'); r.open = false;
const head = document.createElement('div'); head.className = 'archive-detail-head';
const icon = r.querySelector('.archive-icon'), title = r.querySelector('.archive-head'), status = r.querySelector('.archive-status');
for (const n of [icon, title, status]) if (n) head.append(n.cloneNode(true));
// Multi-page archives: how many recognised pages have been checked against the original (design: 校对进度).
const m = ((title && title.textContent) || '').match(/(\d+) 页 · (\d+) 页已校对/);
const parts = [head];
if (m && Number(m[1]) > 1) {
const prog = document.createElement('div'); prog.className = 'archive-progress';
const label = document.createElement('div'); label.innerHTML = '<span>校对进度</span><b></b>'; label.querySelector('b').textContent = m[2] + ' / ' + m[1] + ' 页';
const bar = document.createElement('div'); bar.className = 'archive-progress-bar'; const fill = document.createElement('i'); fill.style.width = Math.round(Number(m[2]) / Number(m[1]) * 100) + '%'; bar.append(fill);
prog.append(label, bar); parts.push(prog);
}
pane.replaceChildren(...parts, bodyOf(r));
}
function wire() {
for (const r of list.querySelectorAll('details.archive-entry')) {
if (r._wired) continue; r._wired = true; bodyOf(r);
r.querySelector('summary').addEventListener('click', (e) => { if (!wide.matches) return; e.preventDefault(); select(r); });
}
if (!wide.matches) return;
if (row && row.isConnected) return;
row = null;
const again = id && [...list.querySelectorAll('details.archive-entry')].find((r) => r.archiveId === id);
if (again) select(again);
else { const first = list.querySelector('details.archive-entry'); if (first) select(first); else pane.replaceChildren(empty); }
}
new MutationObserver(wire).observe(list, { childList: true, subtree: true });
wide.addEventListener('change', () => { if (wide.matches) wire(); else { release(); pane.replaceChildren(empty); } });
wire();
})();
// Header actions (design): recycle bin, backup and WebDAV open as sheets (also from 设置); their original <details> move inside intact.
(() => {
const $ = (id) => document.getElementById(id);
function sheet(id, title) {
const panel = $(id);
if (!panel) return null;
const dlg = document.createElement('dialog');
dlg.className = 'sheet lib-sheet'; dlg.setAttribute('aria-label', title);
const body = document.createElement('div'); body.className = 'sheet-body';
const head = document.createElement('div'); head.className = 'sheet-head';
const h = document.createElement('h2'); h.textContent = title;
const close = document.createElement('button'); close.type = 'button'; close.className = 'small-btn'; close.textContent = '关闭';
close.onclick = () => dlg.close();
head.append(h, close); body.append(head);
document.body.append(dlg); body.append(panel); dlg.append(body);
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
return () => { if (!panel.open) panel.open = true; if (!dlg.open) dlg.showModal(); };
}
const openRecovery = sheet('recoveryPanel', '回收站与历史版本');
const openBackup = sheet('backupPanel', '备份 / 恢复');
const openDav = sheet('davPanel', 'WebDAV 同步');
if ($('libRecovery') && openRecovery) $('libRecovery').onclick = openRecovery;
if ($('libBackup') && openBackup) $('libBackup').onclick = openBackup;
for (const [id, open] of [['settingsDav', openDav], ['settingsBackup', openBackup], ['settingsRecovery', openRecovery]]) if ($(id) && open) $(id).onclick = open;
if ($('libImport')) $('libImport').onclick = () => $('pdfImportTab').click();
function davState() {
let on = false;
try { const c = window.ScoreLibrary && window.ScoreLibrary.davConfig(); on = !!(c && c.url && c.user); } catch {}
$('libDavLabel').textContent = on ? 'WebDAV 已设置' : 'WebDAV 未设置';
$('libDav').classList.toggle('on', on);
}
if ($('libDav') && openDav) {
$('libDav').onclick = openDav;
$('davPanel').closest('dialog').addEventListener('close', davState);
davState();
}
})();
// Modified by AI on 2026-10-11 06:31:32
