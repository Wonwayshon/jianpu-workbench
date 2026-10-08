'use strict';
// HTML dialogs also work in desktop WebViews where window.prompt is unavailable.
(() => {
let active=false;
function askName(value){
 if(active)return Promise.resolve(null);
 active=true;
 return new Promise((resolve,reject)=>{
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='sheet name-sheet';dialog.setAttribute('aria-labelledby','nameDialogHeading');
  const form=document.createElement('form');form.method='dialog';
  const heading=document.createElement('h2');heading.id='nameDialogHeading';heading.textContent='保存到谱库';
  const label=document.createElement('label');label.htmlFor='nameDialogInput';label.textContent='存档名称';
  const input=document.createElement('input');input.id='nameDialogInput';input.type='text';input.maxLength=120;input.required=true;input.value=String(value||'').slice(0,120);
  const actions=document.createElement('div');actions.className='dialog-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
  const submit=document.createElement('button');submit.type='submit';submit.className='primary';submit.textContent='保存';
  let result=null;cancel.onclick=()=>dialog.close();
  form.onsubmit=e=>{e.preventDefault();if(!input.value.trim()){input.setCustomValidity('请输入存档名称');input.reportValidity();return}result=input.value.trim();dialog.close()};
  input.oninput=()=>input.setCustomValidity('');
  dialog.addEventListener('close',()=>{dialog.remove();active=false;previous?.focus?.();resolve(result)},{once:true});
  actions.append(cancel,submit);form.append(heading,label,input,actions);dialog.append(form);document.body.append(dialog);
  try{dialog.showModal();input.focus();input.select()}catch(error){dialog.remove();active=false;reject(new Error("无法打开存档窗口："+error.message))}
 });
}
function confirm({title='确认操作',message,accept='确定'}={}){
 if(active)return Promise.resolve(false);
 active=true;
 return new Promise((resolve,reject)=>{
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='sheet confirm-sheet';dialog.setAttribute('aria-labelledby','confirmDialogHeading');
  const form=document.createElement('form');form.method='dialog';
  const heading=document.createElement('h2');heading.id='confirmDialogHeading';heading.textContent=title;
  const body=document.createElement('p');body.className='confirm-message';body.textContent=String(message||'');
  const actions=document.createElement('div');actions.className='dialog-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
  const submit=document.createElement('button');submit.type='submit';submit.className='primary';submit.textContent=accept;
  let result=false;cancel.onclick=()=>dialog.close();form.onsubmit=e=>{e.preventDefault();result=true;dialog.close()};
  dialog.addEventListener('close',()=>{dialog.remove();active=false;previous?.focus?.();resolve(result)},{once:true});
  actions.append(cancel,submit);form.append(heading,body,actions);dialog.append(form);document.body.append(dialog);
  try{dialog.showModal();cancel.focus()}catch(error){dialog.remove();active=false;reject(new Error('无法打开确认窗口：'+error.message))}
 });
}
window.AppDialogs={askName,confirm};
})();
// Modified by AI on 2026-10-08 23:41:38
