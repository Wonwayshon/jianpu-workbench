'use strict';
// Tap-friendly chip groups that drive an existing <select data-chips="…">. The select stays the single source of truth
// (all app logic keeps reading select.value); chips mirror its options and dispatch 'change' like a user pick.
(() => {
const groups = new Set();
function label(select) {
const l = select.id && document.querySelector('label[for="' + select.id + '"]');
return l ? l.textContent.trim() : select.getAttribute('aria-label') || '';
}
function parts(opt) {
const t = opt.dataset.chipLabel || opt.textContent.trim();
const sub = opt.dataset.chipSub;
if (sub !== undefined) return [t, sub];
const k = t.match(/^1\s*=\s*(\S+)$/);
if (k) return [k[1], ''];
const m = t.match(/^(.+?)[（(](.+)[）)]$/);
return m ? [m[1].trim(), m[2].trim()] : [t, ''];
}
function build(select) {
const box = document.createElement('div');
box.className = 'chips chips-' + (select.dataset.chips || 'grid');
box.setAttribute('role', 'radiogroup');
const name = label(select);
if (name) box.setAttribute('aria-label', name);
select.classList.add('chip-source');
select.tabIndex = -1;
select.setAttribute('aria-hidden', 'true');
select.after(box);
const g = { select, box, render };
function render() {
const opts = [...select.options].filter((o) => !o.hidden && !o.disabled);
const key = opts.map((o) => o.value + '\u0000' + o.textContent).join('\u0001');
if (key !== box.dataset.key) {
box.dataset.key = key;
box.replaceChildren(...opts.map((o) => {
const b = document.createElement('button');
b.type = 'button'; b.className = 'chip' + (o.dataset.chipMinor !== undefined ? ' chip-minor' : '');
b.setAttribute('role', 'radio'); b.dataset.value = o.value;
const [main, sub] = parts(o);
const m = document.createElement('span'); m.className = 'chip-main'; m.textContent = main; b.append(m);
if (sub) { const s = document.createElement('span'); s.className = 'chip-sub'; s.textContent = sub; b.append(s); }
b.onclick = () => { if (select.value === o.value) return; select.value = o.value; select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); sync(); };
return b;
}));
}
for (const b of box.children) { const on = b.dataset.value === select.value; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
}
box.addEventListener('keydown', (e) => {
const list = [...box.children]; const i = list.indexOf(document.activeElement);
if (i < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
e.preventDefault(); const n = list[(i + (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1) + list.length) % list.length]; n.click(); n.focus();
});
select.addEventListener('change', render);
new MutationObserver(render).observe(select, { childList: true, subtree: true, attributes: true });
groups.add(g); render();
}
// Programmatic `select.value = …` fires no event; re-sync after any interaction settles.
function sync() { for (const g of groups) g.render(); }
document.addEventListener('click', () => setTimeout(sync), true);
document.addEventListener('change', () => setTimeout(sync), true);
function init(root = document) { for (const s of root.querySelectorAll('select[data-chips]:not(.chip-source)')) build(s); }
document.addEventListener('DOMContentLoaded', () => { init(); setTimeout(sync, 0); });
window.ChipSelect = { init, sync };
})();
// Modified by AI on 2026-10-11 00:15:48
