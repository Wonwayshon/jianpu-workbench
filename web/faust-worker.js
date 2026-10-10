'use strict';
// Only trusted, bundled DSPs are rendered. PCM is transferred to the Web Audio host.
self.window=self;
const version=new URL(self.location.href).search;
importScripts('vendor/faust/models.js'+version,'faust-engine.js'+version);
self.onmessage=({data:r})=>{
 try{const data=FaustEngine.render(r.timbre,r.midi,r.dur,r.sr,r.fromMidi,{grace:r.grace});self.postMessage({id:r.id,data},[data.buffer])}
 catch(e){self.postMessage({id:r.id,error:e.message||'音色生成失败'})}
};
// Modified by AI on 2026-10-10 15:13:29
