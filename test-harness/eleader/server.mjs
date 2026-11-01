import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,relative,isAbsolute} from 'node:path';
import {fixture} from './fixture.mjs';
export async function start(options = {}) {
 const f=await fixture();
 const publicRoot=resolve(f.root,'cloudflare-deploy/public');
 const server=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,'http://127.0.0.1:8798');
   if(url.pathname.startsWith('/api/ai/eleader/')){
    let bytes=0;const chunks=[];for await(const c of req){bytes+=c.length;if(bytes>4096){res.writeHead(413).end();return;}chunks.push(c);}
    const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
    const result=await f.handleEleaderApi(request,url,f.env,options.engines);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
   }
   const path=resolve(publicRoot,'.'+decodeURIComponent(url.pathname));if(relative(publicRoot,path).startsWith('..')||isAbsolute(relative(publicRoot,path))){res.writeHead(403).end();return;}
   const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.mp4':'video/mp4','.webm':'video/webm'};
   res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(await readFile(path));
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(8798,'127.0.0.1',r));return {...f,server};
}
if(process.argv.includes('--serve')){await start();console.log('Local synthetic preview: http://127.0.0.1:8798/eleader-pilot.html?academy=eleaderjam (fixture browser test supplies existing-login format)');}
