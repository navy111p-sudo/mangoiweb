// Real production token verification + endpoint SQL, backed by in-memory SQLite.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';
export function createSpeechSandbox() {
  const files=['room-jwt-secret','auth-token','speech-preferences'];
  const js=files.map(name=>stripTypeScriptTypes(fs.readFileSync('cloudflare-deploy/src/'+name+'.ts','utf8')
    .replace(/^import .*;.*$/gm,'')).replace(/^export /gm,'')).join('\n');
  const api=new Function(js+'\nreturn { signUidToken, handleSpeechPreferences };')();
  const sqlite=new DatabaseSync(':memory:');
  const env={ROOM_JWT_SECRET:'isolated-test-key-never-used-in-production',DB:{
    exec:async sql=>sqlite.exec(sql),
    prepare:sql=>({bind:(...args)=>({run:async()=>sqlite.prepare(sql).run(...args),first:async()=>sqlite.prepare(sql).get(...args)??null})})
  }};
  env.DB.withSession=()=>env.DB;
  return { env, sqlite, sign:(uid,ttl)=>api.signUidToken(uid,env,ttl),
    handle:request=>api.handleSpeechPreferences(request,env),close:()=>sqlite.close() };
}
