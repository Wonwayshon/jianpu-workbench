'use strict';
// Accent colour: one user-chosen hex drives every --accent-* token. Loaded before first paint so there is no flash.
(() => {
const KEY = 'flute.accent';
const DEFAULT = '#4F46E5';
const PRESETS = [['#4F46E5', '靛紫'], ['#2563EB', '湖蓝'], ['#0D9488', '青绿'], ['#16A34A', '竹绿'], ['#E11D48', '朱红'], ['#EA580C', '橙'], ['#27272A', '墨黑']];
const valid = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Darken toward ink until the colour reads on the given background at 4.5:1.
const readable = (c, bg) => { let out = c; for (let t = 0; t <= 1 && contrast(out, bg) < 4.5; t += 0.05) out = mix(c, '#0F1115', t); return out; };
function tokens(accent) {
const onAccent = contrast('#FFFFFF', accent) >= 4.5 ? '#FFFFFF' : '#0F1115';
const soft = mix(accent, '#FFFFFF', 0.9);
return {
'--accent': accent,
'--accent-hover': mix(accent, '#000000', 0.12),
'--accent-soft': soft,
'--accent-soft-2': mix(accent, '#FFFFFF', 0.78),
'--accent-line': mix(accent, '#FFFFFF', 0.6),
'--accent-text': readable(accent, '#FFFFFF'),
'--accent-ink': readable(mix(accent, '#0F1115', 0.35), soft),
'--on-accent': onAccent,
'--accent-on-dark': mix(accent, '#FFFFFF', 0.45),
'--accent-deep': mix(accent, '#111318', 0.55)
};
}
function read() { try { const v = localStorage.getItem(KEY); return valid(v) ? v.toUpperCase() : DEFAULT; } catch { return DEFAULT; } }
function apply(accent) {
const root = document.documentElement;
for (const [k, v] of Object.entries(tokens(accent))) root.style.setProperty(k, v);
const meta = document.querySelector('meta[name="theme-color"]');
if (meta) meta.setAttribute('content', '#F6F7F9');
}
function set(accent) {
if (!valid(accent)) return;
accent = accent.toUpperCase();
try { localStorage.setItem(KEY, accent); } catch {}
apply(accent); render();
}
function reset() { try { localStorage.removeItem(KEY); } catch {} apply(DEFAULT); render(); }
function render() {
const box = document.getElementById('themeSwatches');
if (!box) return;
const current = read();
box.replaceChildren(...PRESETS.map(([value, name]) => {
const b = document.createElement('button');
b.type = 'button'; b.className = 'theme-swatch'; b.setAttribute('role', 'radio');
b.setAttribute('aria-checked', String(value === current)); b.setAttribute('aria-label', name);
b.style.setProperty('--swatch', value); b.title = name;
b.onclick = () => set(value);
return b;
}));
const picker = document.getElementById('themeCustom');
if (picker) picker.value = current.toLowerCase();
const label = document.getElementById('themeCurrent');
if (label) { const p = PRESETS.find(([v]) => v === current); label.textContent = p ? p[1] + ' · ' + current : '自定义 · ' + current; }
}
apply(read());
document.addEventListener('DOMContentLoaded', () => {
render();
const picker = document.getElementById('themeCustom');
if (picker) picker.addEventListener('input', () => set(picker.value));
const back = document.getElementById('themeReset');
if (back) back.onclick = reset;
});
window.AppTheme = { DEFAULT, PRESETS, get: read, set, reset, tokens };
})();
// Modified by AI on 2026-10-10 19:44:57
