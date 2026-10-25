import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
// Local-only synthetic fixture. No production binding, account, or credential is used.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '../..');
const require = createRequire(root + '/cloudflare-deploy/package.json');
const { build } = require('esbuild');
export async function fixture(filename = ':memory:') {
  const outfile = (handoffTmp()+'/eleader-test-api-') + process.pid + '.mjs';
  await build({ stdin:{ contents: "export { handleEleaderApi } from './src/api-eleader'; export { signUidToken } from './src/auth-token';",resolveDir:root+'/cloudflare-deploy'},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent' });
  const {handleEleaderApi,signUidToken}=await import(pathToFileURL(outfile));
  const db=new DatabaseSync(filename); db.exec(readFileSync(root+'/cloudflare-deploy/sql/eleader-pilot.sql','utf8'));
  db.exec(`CREATE TABLE IF NOT EXISTS admin_account(id INTEGER PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, name TEXT, email TEXT, phone TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE IF NOT EXISTS admin_sessions(token TEXT PRIMARY KEY, username TEXT, expires_at INTEGER, last_seen_at INTEGER);
  CREATE TABLE IF NOT EXISTS admin_scope(username TEXT PRIMARY KEY, scope_type TEXT, scope_value TEXT, updated_at INTEGER);`);
  // Existing auth bootstrap sees placeholder rows, so it creates no test passwords.
  for(const u of ['admin','cfo','ops_lead','branch_busan','branch_daegu','agency_gn001','agency_sc002','hq_t_001','hq_t_len','capitown','pilot-director','other-director']) {
    db.prepare('INSERT OR IGNORE INTO admin_account(username,password_hash,name) VALUES (?,?,?)').run(u,'not-a-password-hash',u);
    db.prepare('INSERT OR IGNORE INTO admin_scope(username,scope_type,scope_value) VALUES (?,?,?)').run(u,u.startsWith('hq_t_')?'teacher':'agency','fixture');
  }
  for(const [t,u] of [['fixture-director-session','pilot-director'],['fixture-other-session','other-director'],['fixture-teacher-session','hq_t_001']]) db.prepare('INSERT OR REPLACE INTO admin_sessions(token,username,expires_at) VALUES (?,?,?)').run(t,u,Date.now()+3600000);
  db.exec(`INSERT OR IGNORE INTO eleader_academies VALUES ('eleaderjam','엘리더잼 시범 학원',1),('other','접근차단 검증용 학원',1);
  INSERT OR IGNORE INTO eleader_members VALUES ('eleaderjam','student','pilot-child-1','student'),('eleaderjam','student','pilot-child-2','student'),('eleaderjam','admin','pilot-director','director'),('other','student','other-child','student'),('other','admin','other-director','director');
  INSERT OR IGNORE INTO eleader_assignments VALUES ('eleaderjam','pilot-child-1','pets'),('eleaderjam','pilot-child-1','day'),('eleaderjam','pilot-child-1','food');`);
  const DB={prepare(sql){let values=[]; const statement={bind(...v){values=v;return statement;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values),success:true};},async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}};}};return statement;},async exec(sql){db.exec(sql);return {count:1,duration:0};}};
  const env={DB,ELEADER_PILOT:'on',ROOM_JWT_SECRET:'LOCAL-ONLY-test-fixture-not-a-deployment-secret'};
  const tokens={}; for(const u of ['pilot-child-1','pilot-child-2','other-child','guest-fixture']) tokens[u]=await signUidToken(u,env);
  const request=async({action='state',academy='eleaderjam',student,admin,method='GET',data,headers={}}={})=>{
    const url=new URL('http://127.0.0.1:8798/api/ai/eleader/'+action+'?academy='+academy);
    const h={...headers}; if(student) h.Authorization='Bearer '+(tokens[student]||student); if(admin)h.Cookie='mango_admin_session='+admin;
    if(data!==undefined){h.Origin=url.origin;h['Content-Type']='application/json';}
    const req=new Request(url,{method,headers:h,body:data!==undefined?JSON.stringify(data):undefined});
    const r=await handleEleaderApi(req,url,env); return {status:r.status,body:await r.json(),headers:r.headers};
  };
  return {root,db,env,tokens,request,handleEleaderApi,signUidToken};
}
