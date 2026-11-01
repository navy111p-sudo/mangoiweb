// Loopback bridge to the same isolated Worker/UI. No public listener or Cloudflare resources.
import http from 'node:http';import {DatabaseSync} from 'node:sqlite';import {readFileSync,existsSync,mkdirSync} from 'node:fs';import {resolve,extname,relative,isAbsolute} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readExistingOAuth,createOwnerAI} from './provider.mjs';
const canonical='https://mangoiweb-eleader-ed-trial.navy111p.workers.dev';
export async function startLocal({build,oauthFile,ledgerPath,port=8799,makeAI=createOwnerAI,readOAuth=readExistingOAuth}){
 const worker=(await import(pathToFileURL(resolve(build,'worker.mjs')))).default;
 let env=null,db=null,ai=null,expiresAt=0;
 const assets=resolve(build,'assets');
 const server=http.createServer(async(req,res)=>{
  const origin='http://127.0.0.1:'+server.address().port;
  const deny=(status=403)=>{res.writeHead(status,{'Cache-Control':'no-store'});res.end('Trial request unavailable');};
  try{
   if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!==new URL(origin).host||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==origin)return deny();
   if(!['GET','POST'].includes(req.method)||req.method==='POST'&&req.headers.origin!==origin)return deny();
   const u=new URL(req.url,origin);let data=Buffer.alloc(0);
   if(req.method==='POST'){const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>480044)return deny(413);chunks.push(part);}data=Buffer.concat(chunks);}
   if(u.pathname==='/local/setup'&&req.method==='POST'){
    if(env||existsSync(ledgerPath))return deny(409);
    const body=JSON.parse(data.toString('utf8'));if(body.ready!==true||typeof body.password!=='string'||body.password.length<1||body.password.length>128)return deny(400);
    const auth=readOAuth(oauthFile);const now=Date.now();if(!auth?.token||!Number.isFinite(auth.expiresAt)||auth.expiresAt<=now+60000)return deny(403);const token=auth.token;expiresAt=Math.min(now+3600000,auth.expiresAt);
    ai=makeAI({token,ledgerPath,expiresAt});db=new DatabaseSync(':memory:');
    for(const file of ['eleader-pilot.sql','eleader-trial.sql','eleader-trial20.sql','students.sql'])db.exec(readFileSync(resolve(build,'schema',file),'utf8'));
    const hash=createHash('sha256').update(body.password.trim()+'|mangoi-salt-2026').digest('hex');body.password='';data.fill(0);
    const code=randomBytes(16).toString('hex'),dbid=randomUUID();
    db.prepare('INSERT INTO students_erp(user_id,student_name,password_hash) VALUES(?,?,?)').run('ED','Synthetic adult owner',hash);
    db.exec("INSERT INTO eleader_academies VALUES('ed-sandbox','엘리더잼 성인 격리 시험',1);INSERT INTO eleader_members VALUES('ed-sandbox','student','ED','student');");
    db.prepare("INSERT INTO eleader_trial_lease VALUES(1,'ED','ed-sandbox',?,?,NULL)").run(now,expiresAt);
    db.prepare("INSERT INTO eleader_trial20_owner(id,code_hash,expires_at,policy) VALUES(1,?,?,'adult-trial20-v1')").run(createHash('sha256').update(code).digest('hex'),expiresAt);
    db.prepare('INSERT INTO eleader_trial_site VALUES(1,?,?,?,1)').run(dbid,'mangoiweb-eleader-ed-trial','7ae16a3c4bcc84743c70828a5156ebb3');
    const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args),success:true};},async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}};return q;},async exec(sql){db.exec(sql);return {};}};
    env={DB,AI:ai,ROOM_JWT_SECRET:randomBytes(48).toString('hex'),ELEADER_TRIAL_ONLY:'local-synthetic',ELEADER_TRIAL_ACTIVATION:'owner-approved-61-040-v1',ELEADER_TRIAL_ACCOUNT:'7ae16a3c4bcc84743c70828a5156ebb3',ELEADER_TRIAL_DATABASE:'mangoi-eleader-ed-trial',ELEADER_TRIAL_DATABASE_ID:dbid};
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({code,expiresAt}));return;
   }
   if(u.pathname==='/local/setup'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",'Permissions-Policy':'microphone=(),camera=()'});res.end(readFileSync(new URL('./setup.html',import.meta.url)));return;}
   if(!env||Date.now()>=expiresAt)return deny();
   if(u.pathname.startsWith('/api/')){
    const headers=new Headers(req.headers);headers.set('Origin',canonical);headers.set('Host',new URL(canonical).host);headers.set('Cookie',(req.headers.cookie||'').replace(/ed_trial_local=/g,'__Host-ed-trial20='));
    const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    const r=await worker.fetch(new Request(canonical+u.pathname+u.search,{method:req.method,headers,body:req.method==='POST'?data:undefined,signal:controller.signal}),env);
    const responseHeaders=Object.fromEntries(r.headers);if(responseHeaders['set-cookie'])responseHeaders['set-cookie']=responseHeaders['set-cookie'].replace('__Host-ed-trial20=','ed_trial_local=').replace('; Secure','');
    res.writeHead(r.status,responseHeaders);res.end(Buffer.from(await r.arrayBuffer()));return;
   }
   const file=resolve(assets,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));const rel=relative(assets,file);if(rel.startsWith('..')||isAbsolute(rel)||!existsSync(file))return deny(404);
   const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.mp4':'video/mp4','.webm':'video/webm'};
   res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store','Permissions-Policy':'microphone=(self),camera=(),display-capture=()','Content-Security-Policy':"connect-src 'self'; media-src blob:; frame-ancestors 'none'; object-src 'none'"});res.end(readFileSync(file));
  }catch{if(!res.headersSent)deny(503);else res.end();}
 });
 await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok);});
 return {url:'http://127.0.0.1:'+server.address().port+'/local/setup',async close(){await new Promise(r=>server.close(r));ai?.close();db?.close();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==3)throw Error('Usage: node server.mjs <build-folder> <existing-wrangler-oauth-file> <authorization-ledger-file>');
 const app=await startLocal({build:args[0],oauthFile:args[1],ledgerPath:args[2]});console.log('Open locally: '+app.url+' (setup begins the approved one-hour window)');process.on('SIGINT',async()=>{await app.close();process.exit(0);});
}
