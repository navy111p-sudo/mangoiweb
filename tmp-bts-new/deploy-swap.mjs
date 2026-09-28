// 이미 올라간 새 BTS 에서 «바뀐 과» 만 새 행으로 갈아 끼우기 (러너 전용).
//   node deploy-swap.mjs NN MODE    MODE = swapdry (조회만) | swap (실제 반영)
// 왜 새 행인가: /api/textbook-files/:id/raw 는 «id 가 같으면 내용도 같다» 전제로 브라우저·엣지에 immutable 캐시합니다.
//   같은 id 의 r2_key 만 바꾸면 학생 화면에 옛 쪽이 계속 뜹니다 → 새 id 로 올리고 옛 행은 active=0.
// 순서: ① 새 JPG 를 R2 에 ② 새 행을 active=0 으로 INSERT ③ 개수 확인 ④ 한 문장으로 옛 행 0·새 행 1 (원자적)
// 옛 행·옛 R2 파일은 지우지 않습니다 → 되돌리기는 보고서의 id 로 같은 문장을 반대로.
import fs from 'node:fs'; import { spawn } from 'node:child_process';
const [NN, MODE] = process.argv.slice(2);
const ACC = process.env.CF_ACC, TOK = process.env.CF_TOK;
const DB = '80a12a77-4d79-4abd-aa9e-f5e39a7b5cf5', BUCKET = 'webrtc-class-recordings';
const MARK = 'NEW BTS 2026-09';
const DESC = 'BTS 새 교재 (2026-09 단원 노래 추가)';
const H = { Authorization: 'Bearer ' + TOK };
const HD = { Authorization: 'Bearer ' + process.env.CF_D1_TOK };
if (!process.env.CF_D1_TOK) { console.log('⛔ CF_D1_TOKEN 없음'); process.exit(1); }
// 노래를 넣지 않은 책은 바뀐 것이 없으니 렌더도 안 합니다
if (!fs.existsSync(`tmp-bts-new/songs/lyrics/bts-${NN}.json`)) { console.log(`BTS ${+NN}: 노래 추가 없음 — 건너뜀`); process.exit(0); }
const plan = JSON.parse(fs.readFileSync('tmp-bts-new/plan.json', 'utf8'))[String(+NN)];

async function q(sql, params = []) {
  for (let t = 0; t < 5; t++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${DB}/query`, { method: 'POST', headers: { ...HD, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }) });
    const j = await r.json().catch(() => ({}));
    if (j.success) return j.result[0];
    console.log('D1 retry', t, r.status, JSON.stringify(j.errors || j).slice(0, 300));
    await new Promise(z => setTimeout(z, 2000 * (t + 1)));
  }
  throw new Error('D1 failed: ' + sql.slice(0, 80));
}
async function put(key, buf) {
  for (let t = 0; t < 5; t++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`, { method: 'PUT', headers: { ...H, 'Content-Type': 'image/jpeg' }, body: buf });
    if (r.ok) return;
    console.log('R2 retry', t, r.status, (await r.text()).slice(0, 200));
    await new Promise(z => setTimeout(z, 2000 * (t + 1)));
  }
  throw new Error('R2 failed ' + key);
}
const slideNo = nm => parseInt(nm.split('/ Slide')[1]);

// ── 1) 렌더
const OUT = '/tmp/exp/bts-' + NN;
await new Promise((res, rej) => { const p = spawn('node', ['tmp-bts-new/export.mjs', NN, '/tmp/exp'], { stdio: 'inherit', env: { ...process.env } }); p.on('exit', c => c ? rej(new Error('export ' + c)) : res()); });
const lessons = fs.readdirSync(OUT).map(Number).sort((a, b) => a - b);
if (lessons.length !== plan.books.length) throw new Error(`lessons ${lessons.length} != books ${plan.books.length}`);

const report = [];
for (const L of lessons) {
  const book = plan.books[L].book, pre = `[${book}]`;
  const files = fs.readdirSync(`${OUT}/${L}`).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  const live = (await q(`SELECT id, name FROM textbook_files WHERE active = 1 AND uploaded_by = ? AND substr(name, 1, ?) = ?`, [MARK, pre.length, pre])).results;
  const rep = { book, rendered: files.length, live: live.length, action: 'same' };
  report.push(rep);
  if (live.length === files.length) continue;               // 이 과는 안 바뀜 — 손대지 않음
  if (!live.length) { rep.action = 'NOT-LIVE (deploy.mjs 로 처음 올릴 과 — 여기선 안 건드림)'; continue; }
  if (files.length !== live.length + 1) { rep.action = `SKIP 개수 차이 ${files.length - live.length} (노래 1장 추가가 아님 — 사람 확인)`; continue; }
  rep.action = MODE === 'swap' ? 'swap' : 'would-swap';
  if (MODE !== 'swap') continue;

  // 이전 시도가 남긴 «숨긴 새 행» — 다 있으면 다시 씀, 모자라면 표시만 바꿔 버림(지우지 않음)
  let staged = (await q(`SELECT id, name FROM textbook_files WHERE active = 0 AND uploaded_by = ? AND description = ? AND substr(name, 1, ?) = ?`, [MARK, DESC, pre.length, pre])).results;
  if (staged.length && staged.length !== files.length) {
    await q(`UPDATE textbook_files SET description = ? WHERE id IN (${staged.map(() => '?').join(',')})`, [DESC + ' — 중단된 시도(미사용)', ...staged.map(r => r.id)]);
    staged = [];
  }
  if (!staged.length) {
    for (let i = 0; i < files.length; i++) {
      const buf = fs.readFileSync(`${OUT}/${L}/${files[i]}`);
      const key = `textbook-files/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      await put(key, buf);
      const now = Date.now();
      await q(`INSERT INTO textbook_files (name, kind, mime, ext, size_bytes, r2_key, textbook_id, level, unit_no, description, uploaded_by, active, created_at, updated_at) VALUES (?, 'image', 'image/jpeg', 'jpg', ?, ?, NULL, NULL, NULL, ?, ?, 0, ?, ?)`,
        [`${pre} New / Slide${i + 1}.JPG`, buf.length, key, DESC, MARK, now, now]);
    }
    staged = (await q(`SELECT id, name FROM textbook_files WHERE active = 0 AND uploaded_by = ? AND description = ? AND substr(name, 1, ?) = ?`, [MARK, DESC, pre.length, pre])).results;
  }
  // 새 행이 1..N 을 빠짐없이 한 번씩 갖는지
  const nums = staged.map(r => slideNo(r.name)).sort((a, b) => a - b);
  if (nums.length !== files.length || nums.some((n, i) => n !== i + 1)) throw new Error(`${book}: 새 행 번호가 1..${files.length} 이 아님 — 옛 쪽은 그대로(반영 안 함)`);

  // 원자적 교체: 한 문장(바인드 5개 — 과가 길어도 D1 100개 한도에 안 걸림)
  //   옛 행(active=1, 옛 설명) → 0 · 이번 새 행(active=0, DESC) → 1 · 중단된 시도 행은 조건에서 빠짐
  const oldIds = live.map(r => r.id), newIds = staged.map(r => r.id);
  const res = await q(`UPDATE textbook_files SET active = CASE WHEN description = ? THEN 1 ELSE 0 END, updated_at = ? WHERE uploaded_by = ? AND substr(name, 1, ?) = ? AND (active = 1 OR description = ?)`,
    [DESC, Date.now(), MARK, pre.length, pre, DESC]);
  if (res.meta?.changes !== oldIds.length + newIds.length) console.log(`⚠️ ${book}: 바뀐 행 ${res.meta?.changes} (예상 ${oldIds.length + newIds.length})`);
  const after = (await q(`SELECT COUNT(*) n FROM textbook_files WHERE active = 1 AND uploaded_by = ? AND substr(name, 1, ?) = ?`, [MARK, pre.length, pre])).results[0].n;
  if (after !== files.length) throw new Error(`${book}: 교체 뒤 ${after} != ${files.length}`);
  Object.assign(rep, { changed: res.meta?.changes, oldIds, newIds });
}
fs.mkdirSync('/tmp/rep', { recursive: true });
fs.writeFileSync(`/tmp/rep/bts-${NN}.json`, JSON.stringify(report, null, 1));
console.log('REPORT', JSON.stringify(report.map(r => ({ b: r.book.split(' (')[0], r: r.rendered, l: r.live, a: r.action }))));
