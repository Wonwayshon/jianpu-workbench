'use strict';
(() => {
const adapters=window.FlutePlatformAdapters;
if(!adapters)throw new Error('平台适配器未加载');
window.Platform=Object.freeze([adapters.android,adapters.desktop,adapters.browser].find(a=>a?.available()));
document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(Platform.kind==='browser'||!a||!/^https?:/i.test(a.href)||a.origin===location.origin)return;event.preventDefault();Platform.openExternal(a.href).catch(()=>{})},true);
})();
// Modified by AI on 2026-10-08 10:06:28
