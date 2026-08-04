/**
 * recordings_stuck_sweep_harness.mjs
 * ⏳ 「준비중」에 영영 갇힌 녹화 정리 — 로직 가드
 *
 * 왜 필요한가:
 *   이 스윕은 운영 D1 의 recordings.status 를 «바꾼다». 잘못 돌면
 *     · 정상 진행 중인 녹화를 실패로 덮어쓰거나
 *     · R2 에 실물이 있는데도 실패로 버려
 *   강사·학부모가 볼 수 있었던 수업 영상을 잃는다. 그래서 규칙을 코드로 못박는다.
 *
 * 검사 항목
 *   ① 소스에 안전 가드가 있는가 (UPDATE ... AND status='recording')
 *   ② 6시간이 안 지난 건은 건드리지 않는가
 *   ③ R2 에 실물(size>0)이 있으면 completed 로 «살려내는가»
 *   ④ 실물이 없으면 upload_failed 로 정리하는가
 *   ⑤ 이미 완료된 행은 절대 건드리지 않는가
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'cloudflare-deploy', 'src', 'recordings-cleanup.ts'), 'utf8');

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? (pass++, console.log('  ✅ ' + name)) : (fail++, console.log('  ❌ ' + name)); };
const eq = (name, got, want) => check(name + ` (기대 ${want} / 실제 ${got})`, got === want);

console.log('\n════════ ⏳ 준비중 녹화 스윕 가드 ════════');

console.log('\n① 소스 안전장치');
check('sweepStuckRecordings 가 존재한다', /export async function sweepStuckRecordings/.test(SRC));
check("완료 처리 UPDATE 에 status='recording' 잠금이 있다",
  /UPDATE recordings SET status='completed'[\s\S]{0,200}?AND status='recording'/.test(SRC));
check("실패 처리 UPDATE 에도 status='recording' 잠금이 있다",
  /UPDATE recordings SET status='upload_failed'[\s\S]{0,200}?AND status='recording'/.test(SRC));
check('R2 실물을 head() 로 먼저 확인한다 (화면만 실패인 건을 살리기 위해)',
  /RECORDINGS\.head\(/.test(SRC));
check('기본 유예가 6시간이다 (수업 최대 2시간보다 넉넉)',
  /olderThanMs\s*\?\?\s*6\s*\*\s*3600\s*\*\s*1000/.test(SRC));
check('한 번에 처리하는 건수에 상한이 있다(폭주 방지)', /limit\s*\?\?\s*200/.test(SRC));

console.log('\n② 실제 SQL 동작 재현');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, file_url TEXT,
  started_at INTEGER, ended_at INTEGER, size_bytes INTEGER, status TEXT
)`);

const NOW = Date.UTC(2026, 7, 5, 0, 0, 0);
const H = 3600 * 1000;
const ins = db.prepare(`INSERT INTO recordings (room_id, file_url, started_at, size_bytes, status) VALUES (?,?,?,?,?)`);
ins.run('class-1', 'rec/class-1/a.webm', NOW - 8 * H, 0, 'recording');  // 1: 오래됨 + 실물 있음 → 살아남
ins.run('class-2', 'rec/class-2/b.webm', NOW - 8 * H, 0, 'recording');  // 2: 오래됨 + 실물 없음 → 실패
ins.run('class-3', 'rec/class-3/c.webm', NOW - 1 * H, 0, 'recording');  // 3: 아직 1시간 → 건드리면 안 됨
ins.run('class-4', 'rec/class-4/d.webm', NOW - 9 * H, 123, 'completed');// 4: 이미 완료 → 건드리면 안 됨

// 스윕이 고르는 대상 (소스와 같은 조건)
const targets = db.prepare(
  `SELECT id, file_url FROM recordings
    WHERE status = 'recording' AND started_at IS NOT NULL AND started_at < ?
    ORDER BY started_at ASC LIMIT 200`
).all(NOW - 6 * H);
eq('6시간 지난 recording 만 대상이 된다', targets.length, 2);
check('아직 1시간짜리(id 3)는 대상이 아니다', !targets.some(t => t.id === 3));
check('이미 완료된 행(id 4)은 대상이 아니다', !targets.some(t => t.id === 4));

// R2 흉내 — class-1 만 실물이 있다
const r2 = { 'rec/class-1/a.webm': { size: 15728640 } };
const upOk = db.prepare(`UPDATE recordings SET status='completed', size_bytes=?, ended_at=COALESCE(ended_at, ?) WHERE id=? AND status='recording'`);
const upNo = db.prepare(`UPDATE recordings SET status='upload_failed', ended_at=COALESCE(ended_at, ?) WHERE id=? AND status='recording'`);
for (const t of targets) {
  const obj = r2[t.file_url];
  if (obj && obj.size > 0) upOk.run(obj.size, NOW, t.id);
  else upNo.run(NOW, t.id);
}

const row = (id) => db.prepare(`SELECT * FROM recordings WHERE id=?`).get(id);
console.log('\n③ 결과');
eq('실물 있는 건은 completed 로 살아난다', row(1).status, 'completed');
eq('  그 크기도 R2 실물 크기로 채워진다', row(1).size_bytes, 15728640);
eq('실물 없는 건은 upload_failed 로 정리된다', row(2).status, 'upload_failed');
eq('진행 중(1시간)인 건은 그대로 recording', row(3).status, 'recording');
eq('이미 완료된 건은 그대로 completed', row(4).status, 'completed');
eq('  완료된 건의 크기가 덮어써지지 않았다', row(4).size_bytes, 123);

console.log('\n④ 동시성 — 스윕 도중 정상 마무리가 들어오면');
// 실제 상황: 스윕이 대상을 고른 뒤, 브라우저가 뒤늦게 complete 를 성공시킨 경우
ins.run('class-5', 'rec/class-5/e.webm', NOW - 7 * H, 0, 'recording');
const late = db.prepare(`SELECT id FROM recordings WHERE room_id='class-5'`).get();
db.prepare(`UPDATE recordings SET status='completed', size_bytes=999 WHERE id=?`).run(late.id); // 정상 마무리 먼저 도착
upNo.run(NOW, late.id);                                                                        // 스윕이 뒤늦게 실패 처리 시도
eq('정상 완료를 스윕이 덮어쓰지 못한다', row(late.id).status, 'completed');
eq('  크기도 보존된다', row(late.id).size_bytes, 999);

console.log('\n====================================================');
console.log(`🎯 총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
console.log(fail === 0 ? '🎉 준비중 녹화 스윕 — 안전장치 전부 통과' : '⚠ 실패 있음');
console.log('====================================================');
process.exit(fail === 0 ? 0 : 1);
