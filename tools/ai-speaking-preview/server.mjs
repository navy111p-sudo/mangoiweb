// Isolated localhost preview. Never invokes a Worker, database, microphone, or AI API.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const publicRoot=resolve(here,'../../cloudflare-deploy/public');
const localRoot=resolve(here,'public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm'};
export function previewServer(){return createServer(async(req,res)=>{
  try{
    if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405).end();return;}
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path.startsWith('/api/')){res.writeHead(403).end('No APIs in this preview');return;}
    let body;
    if(path==='/js/mango-avatar-lily-preview.js'){
      const original=await readFile(resolve(publicRoot,'js/mango-avatar.js'),'utf8');
      const before="still:'/img/lily-closed.webp?v=4', rect:{ l:0.05, t:0.02, r:0.95, b:0.92 },";
      if(original.split(before).length!==2)throw Error('Lily source crop changed; review preview adapter');
      body=original.replace(before,"still:'/img/lily-closed.webp?v=4', rect:{ l:0, t:0, r:1, b:1 },");
    } else {
      const name=path==='/'?'index.html':path.slice(1);
      const root=/^(index|lily|jake)\.html$/.test(name)?localRoot:publicRoot;
      // Only the three fixture pages and original image/JS assets are exposed.
      if(root===publicRoot && !/^(img|js)\//.test(name)){res.writeHead(404).end();return;}
      const file=resolve(root,name);
      if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
      body=await readFile(file);
    }
    res.writeHead(200,{'content-type':mime[extname(path)]||'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404).end('Preview asset unavailable');}
});}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PREVIEW_PORT||8769);
  const server=previewServer();server.listen(port,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:'+server.address().port));
}
