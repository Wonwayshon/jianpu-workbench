const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function setup({dark=false,stored={},blocked=false}={}){
 const disk=new Map(Object.entries(stored)),listeners={},root={dataset:{},style:{setProperty(k,v){this[k]=v}}},meta={setAttribute(k,v){this[k]=v}},native=[];
 const media={matches:dark,addEventListener(k,f){this.change=f}},controls={themeMode:{addEventListener(k,f){this.change=f}},themeModeStatus:{}};
 const c=vm.createContext({window:{matchMedia:()=>media,addEventListener:(k,f)=>listeners[k]=f,Platform:{ready:Promise.resolve(),setTheme:async v=>native.push(v)}},document:{documentElement:root,querySelector:()=>meta,getElementById:id=>controls[id]||null,addEventListener:(k,f)=>listeners[k]=f},localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return disk.get(k)||null},setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)}});
 vm.runInContext(fs.readFileSync('web/theme.js','utf8'),c);listeners.DOMContentLoaded();
 return {T:c.window.AppTheme,root,media,disk,listeners,controls,native,meta};
}
(async()=>{
 const a=setup({dark:true});assert.equal(a.T.getMode(),'system');assert.equal(a.root.dataset.theme,'dark');assert.equal(a.root.style.colorScheme,'dark');assert.equal(a.controls.themeMode.value,'system');
 a.media.matches=false;a.media.change();assert.equal(a.root.dataset.theme,'light');
 a.T.setMode('dark');assert.equal(a.disk.get('flute.appearance'),'dark');a.media.change();assert.equal(a.root.dataset.theme,'dark');
 a.T.set('#27272A');assert.equal(a.T.get(),'#27272A');assert.notEqual(a.root.style['--accent'],'#27272A');
 a.T.reset();assert.equal(a.T.getMode(),'dark');assert.equal(a.root.dataset.theme,'dark');
 a.T.setMode('bogus');assert.equal(a.T.getMode(),'dark');
 const restored=setup({stored:Object.fromEntries(a.disk)});assert.equal(restored.root.dataset.theme,'dark');
 a.disk.set('flute.appearance','light');a.listeners.storage({key:'flute.appearance'});assert.equal(a.root.dataset.theme,'light');
 a.T.setMode('system');a.media.matches=true;a.media.change();assert.equal(a.root.dataset.theme,'dark');
 a.T.systemChanged('light');assert.equal(a.root.dataset.theme,'light');a.media.change();assert.equal(a.root.dataset.theme,'light');a.T.systemChanged('dark');assert.equal(a.root.dataset.theme,'dark');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(a.native.at(-1),'dark');
 assert.equal(setup({blocked:true}).root.dataset.theme,'light');assert.equal(setup({stored:{'flute.appearance':'garbage'}}).T.getMode(),'system');
 // Every selectable accent has readable text and a readable primary button in either mode.
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255),lum=h=>rgb(h).map(x=>x<=.03928?x/12.92:((x+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),contrast=(x,y)=>(Math.max(lum(x),lum(y))+.05)/(Math.min(lum(x),lum(y))+.05);
 for(const [accent] of a.T.PRESETS)for(const mode of ['light','dark']){const t=a.T.tokens(accent,mode);assert.ok(contrast(t['--accent-text'],mode==='dark'?'#1C1F26':'#FFFFFF')>=4.5,accent+mode);assert.ok(contrast(t['--on-accent'],t['--accent'])>=4.5,accent+mode);assert.ok(contrast(t['--accent-ink'],t['--accent-soft'])>=4.5,accent+mode)}
 const html=fs.readFileSync('web/index.html','utf8'),css=fs.readFileSync('web/appearance.css','utf8');assert.ok(html.indexOf('theme.js')<html.indexOf('<body'));assert.match(html,/id="themeMode"/);assert.match(css,/@media screen/);assert.match(css,/@media print/);assert.match(css,/#printArea\{[^}]*color-scheme:light/);
 console.log('PASS: three appearance modes, first paint/system changes, saved/manual overrides, shared-window sync, native updates, blocked storage fallback, all accent contrasts and light print palette.');
})().catch(e=>{console.error(e);process.exitCode=1});
// Modified by AI on 2026-10-21 11:03:41
