// 2026-10-01 New SIU 사진 칸 수정본(질문 카드 사진 118→160px·위쪽 25% 남김 + 꼬리말 한글 글꼴) 을 사이트에 갈아 끼운다.
// ⚠️ /api/textbook-files/:id/raw 는 id 기준 immutable·엣지 캐시라, 같은 id 의 r2_key 를 바꾸면 옛 그림이 계속 나온다.
//    그래서 «바뀐 쪽만» 새 행(새 id)으로 넣고, 같은 이름의 옛 행은 active=0 으로 내린다(R2 옛 파일은 지우지 않음 = 되돌리기 가능).
// 되돌리기: UPDATE textbook_files SET active=0 WHERE uploaded_by='newsiu-fix-2026-10-01';
//          UPDATE textbook_files SET active=1 WHERE uploaded_by='newsiu-ci-2026-09-29' AND active=0;
import fs from 'fs'; import { execFileSync } from 'child_process';
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID, TOK = process.env.CLOUDFLARE_API_TOKEN;
const BUCKET = 'webrtc-class-recordings', BY = 'newsiu-fix-2026-10-01';
const M = JSON.parse(fs.readFileSync('pack/manifest.json','utf8'));
const jsonOf = (out) => { const i = out.search(/^\s*[\[{]/m); if (i < 0) throw new Error('wrangler JSON 없음: ' + out.slice(0,300)); return JSON.parse(out.slice(i)); };
// 2026-10-01: --file(가져오기 API)가 「Not currently importing anything.」 으로 죽어 --command + 재시도로 바꿈.
const d1 = (args) => { let e;
  for (let t = 0; t < 4; t++) { try { return jsonOf(execFileSync('npx', ['-y','wrangler@4','d1','execute','mango-db','--remote','--json',...args], {cwd:'../../cloudflare-deploy', encoding:'utf8', maxBuffer:64<<20})); }
    catch (x) { e = x; console.log('d1 재시도', t + 1, String(x.stdout || x.message).slice(-200)); execFileSync('sleep', [String(3 * (t + 1))]); } }
  throw e; };
const q = s => "'" + String(s).replace(/'/g,"''") + "'";
const cur = d1(['--command',"SELECT name, size_bytes, uploaded_by FROM textbook_files WHERE active=1 AND name LIKE '[NEW SIU%'"])[0].results;
console.log('active rows now', cur.length);
// 이어 하기: 지난 실행이 일부만 넣었으면 활성 행은 2000 + (그 이름의 옛 행을 아직 못 내린 수) 이다.
//   옛 행 = 2000 − 이미 갈아 끼운 수, 새 행 = 이미 갈아 끼운 수 → 이름은 언제나 2000 개여야 한다.
if (new Set(cur.map(r => r.name)).size !== 2000) throw new Error('활성 이름이 2000 개가 아님 — 손대지 않음');
if (cur.some(r => r.uploaded_by !== BY && r.uploaded_by !== 'newsiu-ci-2026-09-29')) throw new Error('모르는 uploaded_by 가 섞임 — 손대지 않음');
const have = new Set(cur.map(r => r.name + '|' + r.size_bytes));
const known = new Set(cur.map(r => r.name));
const unknown = M.files.filter(f => !known.has(f.name));
if (unknown.length) throw new Error('사이트에 없는 이름이 섞임(이름이 바뀐 것) — 중단: ' + unknown.slice(0,5).map(f=>f.name).join(' | '));
const todo = M.files.filter(f => !have.has(f.name + '|' + fs.statSync(f.file).size));
console.log('pack', M.files.length, 'unchanged', M.files.length - todo.length, 'to replace', todo.length);
if (process.env.DRY === '1') { console.log('DRY — 여기서 멈춤'); process.exit(0); }
async function put(key, buf) {
  for (let t = 0; t < 5; t++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/r2/buckets/${BUCKET}/objects/${key}`,
      { method:'PUT', headers:{ Authorization:'Bearer '+TOK, 'Content-Type':'image/jpeg' }, body: buf });
    if (r.ok) return;
    const txt = await r.text(); if (t === 4 || r.status === 403 || r.status === 401) throw new Error(`R2 ${r.status} ${txt.slice(0,300)}`);
    await new Promise(z=>setTimeout(z, 1000*(t+1)));
  }
}
const rows = []; let i = 0; const base = Date.now();
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
if (done.length !== todo.length) throw new Error('R2 올리기 개수 불일치 ' + done.length + '/' + todo.length);
for (let s = 0; s < done.length; s += 25) {
  d1(['--command', `INSERT INTO textbook_files (name,kind,mime,ext,size_bytes,r2_key,textbook_id,level,unit_no,description,uploaded_by,created_at,updated_at) VALUES ${done.slice(s,s+25).join(',')}`]);
}
console.log('inserted', done.length);
// 새 행이 생긴 이름의 옛 행만 내린다
const now = Date.now();
// 같은 이름에 활성 행이 둘 이상이면 «가장 최근(id 가 큰) 것» 만 남긴다 — 이어 하기·재시도로 생긴 겹침도 함께 정리.
d1(['--command', `UPDATE textbook_files SET active=0, updated_at=${now} WHERE active=1 AND name LIKE '[NEW SIU%' AND EXISTS (SELECT 1 FROM textbook_files t2 WHERE t2.active=1 AND t2.name=textbook_files.name AND t2.id>textbook_files.id)`]);
const after = d1(['--command',"SELECT substr(name,2,instr(name,']')-2) AS book, COUNT(*) AS n, COUNT(DISTINCT name) AS d, SUM(uploaded_by='"+BY+"') AS fixed FROM textbook_files WHERE active=1 AND name LIKE '[NEW SIU%' GROUP BY book ORDER BY book"])[0].results;
console.log(JSON.stringify(after));
const bad = after.filter(r => r.n !== 40 || r.d !== 40);
if (after.length !== 50 || bad.length) { console.log('⚠️ 40쪽이 아니거나 이름 중복', JSON.stringify(bad)); process.exit(1); }
console.log('✅ 50권 × 40쪽, 이름 중복 없음');
