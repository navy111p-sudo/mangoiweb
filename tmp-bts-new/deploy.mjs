// 새 BTS 배포 (러너 전용). node deploy.mjs NN MODE   MODE = dry | real
// 1) html/bts-NN.html 을 슬라이드 JPG 로 렌더  2) 레슨마다: R2 업로드 → D1 INSERT(새 파일)
// 3) 옛 파일 이름을 «[책 (구본)]» 으로 바꾸고 그 묶음을 숨김. 옛 파일은 지우지 않는다.
import fs from 'node:fs'; import { spawn } from 'node:child_process';
const [NN, MODE] = process.argv.slice(2);
const ACC = process.env.CF_ACC, TOK = process.env.CF_TOK;
const DB = '80a12a77-4d79-4abd-aa9e-f5e39a7b5cf5', BUCKET = 'webrtc-class-recordings';
const MARK = 'NEW BTS 2026-09';
const plan = JSON.parse(fs.readFileSync('tmp-bts-new/plan.json', 'utf8'))[String(+NN)];
const H = { Authorization: 'Bearer ' + TOK };
const HD = { Authorization: 'Bearer ' + (process.env.CF_D1_TOK || TOK) };
if (!process.env.CF_D1_TOK) { console.log('⛔ CF_D1_TOKEN 시크릿이 없습니다 — D1 편집 전용 토큰을 먼저 등록해야 합니다.'); process.exit(1); }
async function q(sql, params = []) {
  for (let t = 0; t < 5; t++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${DB}/query`, { method: 'POST', headers: { ...HD, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }) });
    const j = await r.json().catch(() => ({}));
    if (j.success) return j.result[0].results;
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
// ── 0) R2 쓰기 권한 확인 (dry 에서 02 만 — 10바이트 확인용 파일 하나)
if (MODE !== 'real' && NN === '02') { await put('textbook-files/_new-bts-probe.txt', Buffer.from('probe-ok')); console.log('R2 PROBE OK'); }
// ── 1) 렌더
const OUT = '/tmp/exp/bts-' + NN;
await new Promise((res, rej) => { const p = spawn('node', ['tmp-bts-new/export.mjs', NN, '/tmp/exp'], { stdio: 'inherit', env: { ...process.env } }); p.on('exit', c => c ? rej(new Error('export ' + c)) : res()); });
const lessons = fs.readdirSync(OUT).map(Number).sort((a, b) => a - b);
if (lessons.length !== plan.books.length) throw new Error(`lessons ${lessons.length} != books ${plan.books.length}`);
const report = [];
for (const L of lessons) {
  const book = plan.books[L].book;
  const files = fs.readdirSync(`${OUT}/${L}`).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  const pre = `[${book}]`;
  const rows = await q(`SELECT id, name, uploaded_by FROM textbook_files WHERE active = 1 AND substr(name, 1, ?) = ?`, [pre.length, pre]);
  const oldIds = rows.filter(r => r.uploaded_by !== MARK).map(r => r.id);
  const haveNames = new Set(rows.filter(r => r.uploaded_by === MARK).map(r => r.name));
  report.push({ book, newSlides: files.length, oldFiles: oldIds.length, alreadyNew: haveNames.size });
  if (MODE !== 'real') continue;
  // 이어 올리기 가능: 이미 올라간 이름은 건너뜀(중간에 죽었다 다시 돌아도 두 벌이 안 생김)
  for (let i = 0; i < files.length; i++) {
    const nm = `${pre} New / Slide${i + 1}.JPG`;
    if (haveNames.has(nm)) continue;
    const buf = fs.readFileSync(`${OUT}/${L}/${files[i]}`);
    const key = `textbook-files/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    await put(key, buf);
    const now = Date.now();
    await q(`INSERT INTO textbook_files (name, kind, mime, ext, size_bytes, r2_key, textbook_id, level, unit_no, description, uploaded_by, active, created_at, updated_at) VALUES (?, 'image', 'image/jpeg', 'jpg', ?, ?, NULL, NULL, NULL, ?, ?, 1, ?, ?)`,
      [nm, buf.length, key, 'BTS 새 교재 (2026-09 재디자인)', MARK, now, now]);
  }
  const cnt = await q(`SELECT COUNT(*) n FROM textbook_files WHERE active = 1 AND uploaded_by = ? AND substr(name, 1, ?) = ?`, [MARK, pre.length, pre]);
  if (cnt[0].n !== files.length) throw new Error(`${book}: 새 파일 ${cnt[0].n}개 != ${files.length} — 사람 확인 필요 (옛 교재는 안 건드림)`);
  // 옛 파일 → (구본) 으로 이름 바꾸기 (id 지정, 90개씩)
  const old = `[${book} (구본)]`;
  for (let i = 0; i < oldIds.length; i += 90) {
    const ids = oldIds.slice(i, i + 90);
    await q(`UPDATE textbook_files SET name = ? || substr(name, ?), updated_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [old, pre.length + 1, Date.now(), ...ids]);
  }
  await q(`INSERT OR REPLACE INTO textbook_hidden_books (book, hidden_by, created_at) VALUES (?, ?, ?)`, [`${book} (구본)`, 'NEW BTS 교체 2026-09 (옛 교재 숨김)', Date.now()]);
}
const kind = await q(`SELECT kind, mime, COUNT(*) n FROM textbook_files WHERE substr(name,1,5)='[BTS ' GROUP BY kind, mime`);
console.log('KINDS', JSON.stringify(kind));
fs.mkdirSync('/tmp/rep', { recursive: true });
fs.writeFileSync(`/tmp/rep/bts-${NN}.json`, JSON.stringify(report, null, 1));
console.log('REPORT', JSON.stringify(report));
