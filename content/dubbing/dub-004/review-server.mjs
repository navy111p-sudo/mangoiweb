// Local-only script/cast review using the production UI and engine unchanged.
// API calls are explicitly disabled: this server cannot spend TTS/evaluation credits.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const HERE=dirname(fileURLToPath(import.meta.url));
const PUB=resolve(HERE,'../../../cloudflare-deploy/public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
 try {
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path.startsWith('/api/')) {res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'local_script_review_only_no_services'}));return;}
  const file=path==='/data/dubbing/dub-004.json'?resolve(HERE,'episode.draft.json'):resolve(PUB,'.'+path);
  if(file!==resolve(HERE,'episode.draft.json')&&!file.startsWith(PUB+sep)) {res.writeHead(403);res.end();return;}
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 } catch {res.writeHead(404);res.end('Not produced / not found');}
}).listen(8044,'127.0.0.1',()=>console.log('Script/cast review ONLY: http://127.0.0.1:8044/ai-dubbing.html?ep=dub-004 (no video/audio/services)'));
