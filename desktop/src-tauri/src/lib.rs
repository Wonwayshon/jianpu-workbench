use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::Mutex, time::Duration};
use tauri::{Manager, WebviewWindow};
use url::Url;

const TOKEN: &str = "__FLUTE_STORED_CREDENTIAL__";
const SERVICE: &str = "wang.weixuan.flutekeylab.credentials.v1";
struct State { credentials: Mutex<()>, slots: tokio::sync::Semaphore, client: reqwest::Client }
#[derive(Clone, Serialize, Deserialize)]
struct Credential { id: String, kind: String, url: String, user: String, secret: String }
#[derive(Serialize)]
struct CredentialInfo { id: String, kind: String, url: String, user: String }
impl Credential { fn info(&self) -> CredentialInfo { CredentialInfo {id:self.id.clone(),kind:self.kind.clone(),url:self.url.clone(),user:self.user.clone()} } }
fn endpoint(text: &str) -> Result<Url, String> {
    if text.len()>2048 || text.contains(['\r','\n']) { return Err("地址无效".into()); }
    let url=Url::parse(text).map_err(|_|"地址无效")?;
    if url.scheme()!="https" || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {return Err("需要不含账号或片段的 HTTPS 地址".into());}
    Ok(url)
}
fn allowed(base: &Url, actual: &Url, kind: &str) -> bool {
    let raw=actual.path().to_ascii_lowercase();
    if ["%2e","%2f","%5c"].iter().any(|s|raw.contains(s)) {return false;}
    if base.origin()!=actual.origin() {return false;}
    if kind=="bearer" {return base==actual;}
    actual.path()==base.path() || actual.path().starts_with(&format!("{}/",base.path().trim_end_matches('/')))
}
fn entry(id: &str) -> Result<keyring::Entry,String> {
    if !(id=="webdav" || id.starts_with("ocr-")) || id.len()>85 || !id.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'||c=='_') {return Err("凭据标识无效".into());}
    keyring::Entry::new(SERVICE,id).map_err(|_|"无法访问系统凭据存储".into())
}
fn read_credential(id: &str) -> Result<Credential,String> {
    let secret=entry(id)?.get_password().map_err(|_|"凭据不可用，请重新填写并保存")?;
    serde_json::from_str(&secret).map_err(|_|"凭据内容损坏".into())
}
fn index_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf,String> {let dir=app.path().app_data_dir().map_err(|_|"无法访问应用目录")?;std::fs::create_dir_all(&dir).map_err(|_|"无法创建应用目录")?;Ok(dir.join("credential-ids.json"))}
fn ids(app: &tauri::AppHandle) -> Result<Vec<String>,String> {
    let path=index_path(app)?;if !path.exists(){return Ok(vec![]);}
    let bytes=std::fs::read(path).map_err(|_|"读取凭据索引失败")?;if bytes.len()>32000{return Err("凭据索引过大".into());}
    serde_json::from_slice(&bytes).map_err(|_|"凭据索引损坏".into())
}
fn save_ids(app:&tauri::AppHandle,values:&[String])->Result<(),String>{
    let path=index_path(app)?;let temp=path.with_extension("tmp");
    std::fs::write(&temp,serde_json::to_vec(values).map_err(|_|"索引保存失败")?).map_err(|_|"索引保存失败")?;
    // Windows cannot rename over an existing file. The index contains IDs only, never secrets.
    if cfg!(windows) && path.exists(){std::fs::remove_file(&path).map_err(|_|"索引更新失败")?;}
    std::fs::rename(temp,path).map_err(|_|"索引更新失败".into())
}
#[tauri::command]
fn credential_list(app:tauri::AppHandle,state:tauri::State<State>)->Result<Vec<CredentialInfo>,String>{
    let _guard=state.credentials.lock().map_err(|_|"凭据存储忙")?;
    Ok(ids(&app)?.into_iter().filter_map(|id|read_credential(&id).ok().map(|c|c.info())).collect())
}
#[tauri::command]
fn credential_store(app:tauri::AppHandle,state:tauri::State<State>,id:String,kind:String,url:String,user:String,secret:String)->Result<CredentialInfo,String>{
    let _guard=state.credentials.lock().map_err(|_|"凭据存储忙")?;
    let url=endpoint(&url)?.to_string();let target=entry(&id)?;
    if !["bearer","basic"].contains(&kind.as_str()) || user.len()>512 || secret.is_empty(){return Err("凭据参数无效".into());}
    if secret==TOKEN {let old=read_credential(&id)?;if old.url!=url||old.user!=user||old.kind!=kind{return Err("地址或账号已变更，请重新填写密码".into());}return Ok(old.info());}
    let value=Credential{id:id.clone(),kind,url,user,secret};let packed=serde_json::to_string(&value).map_err(|_|"凭据保存失败")?;
    if packed.len()>2400{return Err("凭据过长，无法放入系统安全存储".into());}
    let mut all=ids(&app)?;if !all.contains(&id){if all.len()>=100{return Err("凭据配置过多".into());}all.push(id);}
    target.set_password(&packed).map_err(|_|"系统凭据保存失败，请检查钥匙串或凭据管理器权限")?;save_ids(&app,&all)?;Ok(value.info())
}
#[tauri::command]
fn credential_remove(app:tauri::AppHandle,state:tauri::State<State>,id:String)->Result<(),String>{
    let _guard=state.credentials.lock().map_err(|_|"凭据存储忙")?;
    match entry(&id)?.delete_credential(){Ok(())|Err(keyring::Error::NoEntry)=>{},Err(_)=>return Err("系统凭据删除失败".into())}
    let mut all=ids(&app)?;all.retain(|v|v!=&id);save_ids(&app,&all)
}
fn authorize(state:&State,target:&Url,headers:&mut BTreeMap<String,String>)->Result<(),String>{
    let key=headers.keys().find(|k|k.eq_ignore_ascii_case("X-Flute-Credential")).cloned();
    if let Some(key)=key {let id=headers.remove(&key).unwrap();let _guard=state.credentials.lock().map_err(|_|"凭据存储忙")?;let value=read_credential(&id)?;
        if !allowed(&endpoint(&value.url)?,target,&value.kind){return Err("请求地址与保存凭据的服务不匹配".into());}
        headers.retain(|k,_|!k.eq_ignore_ascii_case("Authorization"));headers.insert("Authorization".into(),if value.kind=="bearer"{format!("Bearer {}",value.secret)}else{format!("Basic {}",STANDARD.encode(format!("{}:{}",value.user,value.secret)))});
    }Ok(())
}
#[derive(Serialize)]
struct HttpResponse {status:u16,headers:BTreeMap<String,String>,body:String}
#[tauri::command]
async fn http_request(state:tauri::State<'_,State>,method:String,url:String,mut headers:BTreeMap<String,String>,body_text:Option<String>,body_base64:Option<String>,max_bytes:usize)->Result<HttpResponse,String>{
    let _slot=state.slots.try_acquire().map_err(|_|"同时请求过多，请稍后重试")?;
    if !["GET","HEAD","PUT","POST","DELETE","MKCOL","PROPFIND"].contains(&method.as_str()) || max_bytes==0 || max_bytes>300*1024*1024{return Err("请求参数无效".into());}
    let url=endpoint(&url)?;authorize(&state,&url,&mut headers)?;
    if headers.len()>50{return Err("请求头过多".into());}
    let mut req=state.client.request(reqwest::Method::from_bytes(method.as_bytes()).map_err(|_|"请求方法无效")?,url);
    for (k,v) in headers {if ["host","connection","content-length","transfer-encoding","cookie"].contains(&k.to_ascii_lowercase().as_str())||k.len()>80||v.len()>12000||v.contains(['\r','\n']){return Err("请求头无效".into());}req=req.header(k,v);}
    if let Some(data)=body_base64 {if data.len()>400*1024*1024{return Err("上传内容过大".into());}req=req.body(STANDARD.decode(data).map_err(|_|"上传内容无效")?);}else if let Some(text)=body_text{if text.len()>40*1024*1024{return Err("请求文字过大".into());}req=req.body(text);}
    let mut res=req.send().await.map_err(|_|"HTTPS 请求失败，请检查地址、网络和证书")?;let status=res.status().as_u16();
    if res.content_length().is_some_and(|n|n>max_bytes as u64){return Err("响应超过大小限制".into());}
    let headers=res.headers().iter().filter_map(|(k,v)|v.to_str().ok().map(|v|(k.to_string(),v.to_string()))).collect();let mut bytes=Vec::new();
    while let Some(chunk)=res.chunk().await.map_err(|_|"下载中断")?{if bytes.len()+chunk.len()>max_bytes{return Err("响应超过大小限制".into());}bytes.extend_from_slice(&chunk);}
    Ok(HttpResponse{status,headers,body:STANDARD.encode(bytes)})
}
#[tauri::command]
async fn save_file(name:String,data:String)->Result<bool,String>{
    if data.len()>400*1024*1024{return Err("导出内容超过大小限制".into());}
    let bytes=STANDARD.decode(data).map_err(|_|"导出内容无效")?;
    let name=name.rsplit(['/', '\\']).next().unwrap_or("乐谱.txt");
    if let Some(file)=rfd::AsyncFileDialog::new().set_file_name(name).save_file().await {file.write(&bytes).await.map_err(|_|"文件保存失败，请检查位置和空间")?;return Ok(true)}Ok(false)
}
#[tauri::command]
fn copy_text(text:String)->Result<(),String>{if text.len()>8*1024*1024{return Err("复制内容过大".into());}arboard::Clipboard::new().and_then(|mut c|c.set_text(text)).map_err(|_|"无法写入剪贴板".into())}
#[tauri::command]
fn read_clipboard()->Result<String,String>{let text=arboard::Clipboard::new().and_then(|mut c|c.get_text()).map_err(|_|"无法读取剪贴板")?;if text.len()>8*1024*1024{return Err("剪贴板内容过大".into());}Ok(text)}
#[tauri::command]
fn print_score(window:WebviewWindow)->Result<(),String>{window.print().map_err(|_|"无法打开系统打印".into())}
#[tauri::command]
fn set_immersive(window:WebviewWindow,on:bool)->Result<(),String>{window.set_fullscreen(on).map_err(|_|"无法切换全屏".into())}
#[tauri::command]
fn open_external(url:String)->Result<(),String>{endpoint(&url)?;webbrowser::open(&url).map_err(|_|"无法打开系统浏览器".into())}

pub fn run(){
    tauri::Builder::default().manage(State {credentials:Mutex::new(()),slots:tokio::sync::Semaphore::new(4),client:reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(250)).connect_timeout(Duration::from_secs(20)).build().expect("HTTPS client")})
    .setup(|app|{tauri::WebviewWindowBuilder::new(app,"main",tauri::WebviewUrl::App("index.html".into())).title("笛调之间").inner_size(1280.0,840.0).min_inner_size(760.0,540.0)
        .on_navigation(|url|url.scheme()=="tauri"||url.host_str()==Some("tauri.localhost")||(cfg!(debug_assertions)&&[Some("localhost"),Some("127.0.0.1")].contains(&url.host_str())&&url.port()==Some(1420)))
        .build()?;Ok(())})
    .invoke_handler(tauri::generate_handler![credential_list,credential_store,credential_remove,http_request,save_file,copy_text,read_clipboard,print_score,set_immersive,open_external])
    .run(tauri::generate_context!()).expect("desktop application");
}

#[cfg(test)]
mod tests {use super::*;
 #[test]fn endpoint_policy(){assert!(endpoint("http://service.test/a").is_err());assert!(endpoint("https://user:pass@service.test/a").is_err());assert!(endpoint("https://service.test/a#b").is_err());}
 #[test]fn credential_boundaries(){let root=endpoint("https://service.test/dav/").unwrap();for t in ["https://other.test/dav/file","https://service.test/dav2/file","https://service.test:444/dav/file","https://service.test/dav/../outside","https://service.test/dav/a%2fb"]{assert!(!allowed(&root,&endpoint(t).unwrap(),"basic"));}assert!(allowed(&root,&endpoint("https://service.test/dav/file").unwrap(),"basic"));let api=endpoint("https://service.test/chat").unwrap();assert!(allowed(&api,&api,"bearer"));assert!(!allowed(&api,&endpoint("https://service.test/chat/other").unwrap(),"bearer"));}
}
