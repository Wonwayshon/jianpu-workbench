 'use strict';
(() => {
const REPO='Wonwayshon/jianpu-workbench',ROOT='https://github.com/'+REPO,API='https://api.github.com/repos/'+REPO+'/releases/latest';
function version(value){const m=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value||'');if(!m)return null;const parts=m.slice(1).map(Number);return parts.every(Number.isSafeInteger)?parts:null}
function newer(next,current){const a=version(next),b=version(current);if(!a||!b)return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i]}return false}
function trusted(value,base){try{const u=new URL(value);return u.origin==='https://github.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname.startsWith('/'+REPO+'/'+base)}catch{return false}}
function release(raw,current,platform,arch){
 if(!raw||raw.draft||raw.prerelease||!version(raw.tag_name))throw Error('发布版本信息无效。');
 const tag=raw.tag_name,page=ROOT+'/releases/tag/'+tag;
 if(raw.html_url!==page)throw Error('更新地址不属于项目的官方发布页。');
 const available=(Array.isArray(raw.assets)?raw.assets:[]).filter(a=>a.state==='uploaded'&&typeof a.name==='string'&&a.size>0&&a.size<=300*1024*1024&&trusted(a.browser_download_url,'releases/download/'+tag+'/')&&new URL(a.browser_download_url).pathname===`/${REPO}/releases/download/${tag}/${encodeURIComponent(a.name)}`);
 const select=platform==='android'?a=>a.name.endsWith('.apk'):platform==='darwin'?a=>a.name.includes('macos-'+arch+'-')&&a.name.endsWith('.dmg'):platform==='win32'?a=>a.name.includes('windows-'+arch+'-')&&a.name.endsWith('.exe'):()=>false;
 const asset=available.find(select);
 return {version:tag.replace(/^v/,''),newer:newer(tag,current),notes:String(raw.body||'暂无更新说明。').slice(0,20000),page,download:asset?.browser_download_url||page,hasInstaller:!!asset};
}
async function check(current,platform,arch){
 const response=await Platform.request('GET',API,{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'},null,{timeout:20000,maxBytes:1024*1024,textLimit:1024*1024});
 if(response.status===404)throw Error('暂时无法读取更新：仓库可能仍为私有，或尚未发布正式版本。');
 if(response.status===429)throw Error('GitHub 请求暂时受限，请稍后重试，或直接打开发布页。');
 if(response.status===403)throw Error('GitHub 暂时拒绝了更新请求，可能是访问限制或请求次数过多。可稍后重试，或直接打开发布页。');
 if(response.status!==200)throw Error('检查更新失败，请检查网络后重试。');
 const text=await response.text();if(text.length>1024*1024)throw Error('更新信息过大。');
 return release(JSON.parse(text),current,platform,arch);
}
window.AppUpdates={version,newer,release,check,REPO};
if(typeof document==='undefined')return;
function mount(){
 const button=document.getElementById('appUpdate'),dialog=document.getElementById('updateDialog');if(!button||!dialog)return;
 const meta=name=>document.querySelector(`meta[name="${name}"]`)?.content||'',current=meta('app-version'),platform=meta('app-platform'),arch=meta('app-arch'),status=document.getElementById('updateStatus'),notes=document.getElementById('updateNotes'),download=document.getElementById('updateDownload'),retry=document.getElementById('updateRetry');let busy=false,target=null;
 document.getElementById('appVersion').textContent='v'+(version(current)?current:'开发版');document.getElementById('updateCurrent').textContent='当前版本：'+(version(current)?current:'开发版');
 document.getElementById('appReleases').onclick=()=>Platform.openExternal(ROOT+'/releases').catch(()=>{status.textContent='无法打开浏览器，请手动访问项目发布页。'});
 async function run(){if(busy)return;busy=true;retry.disabled=true;download.hidden=true;target=null;notes.textContent='';status.textContent='正在检查 GitHub 最新版本…';
  try{const result=await check(current,platform,arch);notes.textContent=result.notes;status.textContent=result.newer?'有新版本：v'+result.version:'当前已是最新版本（v'+result.version+'）。';
   if(result.newer){target=result.download;download.textContent=result.hasInstaller?'下载新版安装包':'查看新版发布';download.hidden=false}
  }catch(error){status.textContent=error.message||'检查更新失败，请稍后重试。'}finally{busy=false;retry.disabled=false}
 }
 button.onclick=()=>{if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');run()};retry.onclick=run;
 download.onclick=()=>{if(target)Platform.openExternal(target).catch(()=>{status.textContent='无法打开浏览器，请从 GitHub 发布页下载安装。'})};
 document.getElementById('updateClose').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 const previous=window.handleAppBack;window.handleAppBack=()=>{if(dialog.open){dialog.close();return true}return previous?.()||false};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
// Modified by AI on 2026-10-08 20:21:31
