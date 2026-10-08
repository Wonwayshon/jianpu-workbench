'use strict';
(() => {
const TOKEN='__FLUTE_STORED_CREDENTIAL__',memory=new Map(),native=()=>!!window.Platform?.credentials;
function protect(id,kind,url,user,secret){
 if(!secret)return '';
 if(native()){
  if(!Platform.credentials.store(id,kind,url,user,secret))throw new Error('凭据安全保存失败；修改地址或账号后请重新填写密码。');
 }else{
  const old=memory.get(id);if(secret===TOKEN){if(!old||old.url!==url||old.user!==user||old.kind!==kind)throw new Error('请重新填写本次会话的凭据。')}
  else memory.set(id,{kind,url,user,secret});
 }
 return TOKEN;
}
async function prepare(id,kind,url,user,secret){if(!secret)return '';if(Platform.kind==='desktop')return Platform.credentials.prepare(id,kind,url,user,secret);return protect(id,kind,url,user,secret)}
function has(id){return native()?Platform.credentials.has(id):memory.has(id)}
function remove(id){if(native()&&!Platform.credentials.remove(id))throw new Error('凭据删除失败，请重试。');memory.delete(id)}
async function removeAsync(id){if(Platform.credentials?.removeAsync){await Platform.credentials.removeAsync(id);memory.delete(id)}else remove(id)}
function headers(id,secret,kind,user,url){
 if(secret===TOKEN){if(!has(id))throw new Error('凭据不可用，请重新填写并保存。');if(native())return {'X-Flute-Credential':id};const v=memory.get(id),a=new URL(v.url),b=new URL(url);if(a.origin!==b.origin||(kind==='bearer'?a.href!==b.href:!(b.pathname===a.pathname||b.pathname.startsWith(a.pathname.replace(/\/$/,'')+'/'))))throw new Error('服务地址已变更，请重新填写凭据。');secret=v.secret}
 return {Authorization:kind==='bearer'?'Bearer '+secret:'Basic '+btoa(String.fromCharCode(...new TextEncoder().encode(user+':'+secret)))};
}
async function requestHeaders(...args){await Platform.ready;return headers(...args)}
window.SecureCredentials={TOKEN,protect,prepare,has,remove,removeAsync,headers,requestHeaders,native};
})();
// Modified by AI on 2026-10-08 10:06:28
