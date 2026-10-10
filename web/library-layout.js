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
pane.replaceChildren(head, bodyOf(r));
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
// Modified by AI on 2026-10-11 01:58:20
