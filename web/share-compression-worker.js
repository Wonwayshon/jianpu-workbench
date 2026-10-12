'use strict';
// Same raw DEFLATE format as CompressionStream; the reader never needs to know the search effort.
importScripts('vendor/zopfli/runtime.js');
const ready=new Promise(resolve=>{const z=self.ZopfliModule;if(z.calledRun)resolve(z);else z.onRuntimeInitialized=()=>resolve(z)});
self.onmessage=async({data})=>{
 try{
  if(!(data.bytes instanceof Uint8Array)||data.bytes.length>2*1024*1024||![5,15].includes(data.iterations))throw new Error('Invalid compression request');
  const z=await ready;let input=0,output=0,buffer=0;
  try{
   input=z.allocate(data.bytes,'i8',z.ALLOC_NORMAL);output=z._createZopfliJsOutput();
   z._compress(input,data.bytes.length,output,2,false,false,data.iterations,true,15);
   buffer=z._getBuffer(output);const length=z._getBufferSize(output);
   const bytes=z.HEAPU8.slice(buffer,buffer+length);self.postMessage({bytes},[bytes.buffer]);
  }finally{if(buffer)z._deallocate(buffer);if(output)z._deallocate(output);if(input)z._deallocate(input)}
 }catch(error){self.postMessage({error:String(error?.message||error)})}
};
// Modified by AI on 2026-10-12 11:02:54
