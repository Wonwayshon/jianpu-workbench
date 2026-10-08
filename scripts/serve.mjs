import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {buildWeb} from './build.mjs';
const option=(name,value)=>{const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:value};
const dir=buildWeb(option('target','web')),port=Number(option('port','4173'));
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{const raw=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(dir,'.'+raw+(raw.endsWith('/')?'index.html':''));if(!file.startsWith(dir+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found')};res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('X-Content-Type-Options','nosniff');fs.createReadStream(file).pipe(res)}catch{res.writeHead(400);res.end('Invalid path')}});
server.listen(port,'127.0.0.1',()=>console.log(`Preview: http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit()));
// Modified by AI on 2026-10-08 10:06:28
