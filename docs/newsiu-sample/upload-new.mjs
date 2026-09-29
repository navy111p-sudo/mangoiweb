// 새 SIU 쪽 그림을 공용 자료실(R2 + D1 textbook_files)에 올린다 — 사이트 업로더 API 와 같은 모양으로.
//   R2 키  : textbook-files/<시각>-<난수>.jpg   (api-admin.ts POST /api/admin/textbook-files 와 같음)
//   D1 행  : name·kind='image'·mime='image/jpeg'·ext='jpg'·size_bytes·r2_key·uploaded_by
// 사용: ONLY=001 node upload-new.mjs   (ONLY 가 비면 전부) · 이미 같은 이름+크기가 있으면 건너뜀(업로더 규칙과 같음)
// ⚠️ 되돌리기: uploaded_by = 'newsiu-ci-2026-09-29' 인 행을 active=0 으로(사람 승인 뒤).
import fs from 'fs'; import { execFileSync } from 'child_process';
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID, TOK = process.env.CLOUDFLARE_API_TOKEN;
const BUCKET = 'webrtc-class-recordings', BY = 'newsiu-ci-2026-09-29';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const M = JSON.parse(fs.readFileSync('pack/manifest.json','utf8'));
const want = new Set(ONLY.length ? M.books.filter(b=>ONLY.includes(b.no)).map(b=>b.book) : M.books.map(b=>b.book));
const files = M.files.filter(f => want.has(f.name.slice(1, f.name.indexOf(']'))));
const jsonOf = (out) => { const i = out.search(/^\s*[\[{]/m); if (i < 0) throw new Error('wrangler JSON 없음: ' + out.slice(0,300)); return JSON.parse(out.slice(i)); };
const d1 = (args) => jsonOf(execFileSync('npx', ['-y','wrangler@4','d1','execute','mango-db','--remote','--json',...args], {cwd:'../../cloudflare-deploy', encoding:'utf8', maxBuffer:64<<20}));
const q = s => "'" + String(s).replace(/'/g,"''") + "'";
const have = new Set(d1(['--command',"SELECT name||'|'||size_bytes AS k FROM textbook_files WHERE active=1 AND name LIKE '[NEW SIU%'"])[0].results.map(r=>r.k));
const todo = files.filter(f => !have.has(f.name+'|'+fs.statSync(f.file).size));
console.log('files', files.length, 'already', files.length - todo.length, 'to upload', todo.length);
async function put(key, buf) {
  for (let t = 0; t < 5; t++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/r2/buckets/${BUCKET}/objects/${key}`,
      { method:'PUT', headers:{ Authorization:'Bearer '+TOK, 'Content-Type':'image/jpeg' }, body: buf });
    if (r.ok) return;
    const txt = await r.text(); if (t === 4 || r.status === 403 || r.status === 401) throw new Error(`R2 ${r.status} ${txt.slice(0,300)}`);
    await new Promise(z=>setTimeout(z, 1000*(t+1)));
  }
}
const rows = []; let i = 0;
const base = Date.now();
async function worker() {
  while (i < todo.length) {
    const k = i++, f = todo[k], buf = fs.readFileSync(f.file);
    const key = `textbook-files/${base + k}-${Math.random().toString(36).slice(2,8)}.jpg`;
    await put(key, buf);
    rows[k] = `(${q(f.name)},'image','image/jpeg','jpg',${buf.length},${q(key)},NULL,NULL,NULL,NULL,${q(BY)},${base+k},${base+k})`;
    if (k % 100 === 0) console.log('r2', k, f.name);
  }
}
await Promise.all(Array.from({length:6}, worker));
const done = rows.filter(Boolean);
for (let s = 0; s < done.length; s += 50) {
  fs.writeFileSync('/tmp/ins.sql', `INSERT INTO textbook_files (name,kind,mime,ext,size_bytes,r2_key,textbook_id,level,unit_no,description,uploaded_by,created_at,updated_at) VALUES\n${done.slice(s,s+50).join(',\n')};\n`);
  d1(['--file','/tmp/ins.sql']);
}
const after = d1(['--command',"SELECT substr(name,2,instr(name,']')-2) AS book, COUNT(*) AS n FROM textbook_files WHERE active=1 AND name LIKE '[NEW SIU%' GROUP BY book ORDER BY book"])[0].results;
console.log('inserted', done.length); console.log(JSON.stringify(after));
const short = after.filter(r=>r.n !== 40); if (short.length) console.log('⚠️ 40쪽이 아닌 묶음', JSON.stringify(short));
