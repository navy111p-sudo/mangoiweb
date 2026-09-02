/**
 * retention_purge_harness — 녹화 «실제 파기» 계약 검사
 *
 * 왜 있나: 2026-09-02 사장님 승인으로 R2 실물 삭제를 켰다. 되돌릴 수 없는 삭제라
 *   «문자열이 있는가» 로는 못 지킨다 — 정본을 **실제로 돌려서** 무엇을 지우는지 센다.
 *   가짜 D1 은 SQL 을 보고 답을 바꾸고(늘 같은 값을 주면 시나리오가 안 만들어진다),
 *   가짜 R2 는 delete 호출을 순서까지 기록한다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../cloudflare-deploy/node_modules/typescript');

const SRC = 'cloudflare-deploy/src/retention.ts';
let pass = 0, fail = 0;
const ok  = (n, c, d='') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${d?' — '+d:''}`); } };

const src = readFileSync(SRC, 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const purgeExpired = mod.purgeExpired;

const NOW = Date.now();
const EXPIRED = NOW - 86400000;      // 어제 만료
const FUTURE  = NOW + 86400000;      // 내일 만료

/** SQL 을 보고 답을 바꾸는 가짜 D1 + 호출 로그
 *  ⚠️ LIKE 'rec/%' 와 LIMIT 을 «실제로» 흉내낸다. 이걸 안 하면 ⑦(배치 상한)과
 *     키 판정 검사가 헛돌아, 되돌려도 통과한다 — 2026-09-02 함정 대조에서 실제로 그랬다. */
function fakeDB(rows, log, opts = {}) {
  const keyOk = r => typeof r.file_url === 'string' && r.file_url.startsWith('rec/');
  const matching = () => rows.filter(keyOk);
  const run = (sql, binds) => {
    log.push({ t: 'sql', sql: sql.replace(/\s+/g, ' ').trim().slice(0, 60), binds });
    if (/UPDATE recordings SET file_url = NULL/i.test(sql)) return { meta: { changes: 1 } };
    if (/UPDATE recordings SET status = 'deleted'/i.test(sql)) return { meta: { changes: opts.statusChanges ?? rows.length } };
    return { meta: { changes: 0 } };
  };
  const all = (sql, binds = []) => {
    log.push({ t: 'sql', sql: sql.replace(/\s+/g, ' ').trim().slice(0, 60) });
    if (/SELECT id, file_url FROM recordings/i.test(sql)) {
      let out = matching();
      if (/LIKE 'rec\/%'/.test(sql) === false) out = rows;   // 조건이 빠지면 전부 (변이 감지)
      const lim = Number(binds[binds.length - 1]);
      if (Number.isFinite(lim) && lim > 0) out = out.slice(0, lim);
      return { results: out };
    }
    return { results: [] };
  };
  const first = (sql) => {
    log.push({ t: 'sql', sql: sql.replace(/\s+/g, ' ').trim().slice(0, 60) });
    if (/SELECT COUNT\(\*\)/i.test(sql)) {
      const n = /LIKE 'rec\/%'/.test(sql) ? matching().length : rows.length;
      return { n };
    }
    return null;
  };
  const stmt = (sql) => ({
    bind: (...b) => ({ run: async () => run(sql, b), all: async () => all(sql, b), first: async () => first(sql) }),
    run: async () => run(sql, []), all: async () => all(sql, []), first: async () => first(sql),
  });
  return { prepare: stmt, exec: async () => ({}) };
}
const fakeR2 = (log, throwOn = null) => ({
  delete: async (k) => { log.push({ t: 'r2del', key: k }); if (throwOn && throwOn(k)) throw new Error('r2 fail'); }
});

console.log('\n① 만료분을 실제로 지운다');
{
  const log = [];
  const rows = [{ id: 1, file_url: 'rec/a.webm' }, { id: 2, file_url: 'rec/b.webm' }];
  const r = await purgeExpired({ DB: fakeDB(rows, log), RECORDINGS: fakeR2(log) });
  const dels = log.filter(x => x.t === 'r2del').map(x => x.key);
  ok('R2 delete 가 대상 수만큼 불린다', dels.length === 2, `실제 ${dels.length}`);
  ok('지운 키가 정확하다', dels.join() === 'rec/a.webm,rec/b.webm');
  ok('결과에 삭제 수가 담긴다', r.recording_files_deleted === 2, String(r.recording_files_deleted));
}

console.log('\n② 순서 — D1 표시가 R2 삭제보다 먼저 (반대면 「완료인데 영상 없음」)');
{
  const log = [];
  await purgeExpired({ DB: fakeDB([{ id: 1, file_url: 'rec/a.webm' }], log), RECORDINGS: fakeR2(log) });
  const iStatus = log.findIndex(x => x.t === 'sql' && /SET status = 'deleted'/.test(x.sql));
  const iDel    = log.findIndex(x => x.t === 'r2del');
  ok('status=deleted UPDATE 가 먼저 온다', iStatus >= 0 && iDel >= 0 && iStatus < iDel, `status@${iStatus} del@${iDel}`);
}

console.log('\n③ 성공했을 때만 file_url 을 비운다 (실패분은 다음 실행에서 재시도)');
{
  const log = [];
  const rows = [{ id: 1, file_url: 'rec/ok.webm' }, { id: 2, file_url: 'rec/bad.webm' }];
  const r = await purgeExpired({ DB: fakeDB(rows, log), RECORDINGS: fakeR2(log, k => k.includes('bad')) });
  const nulls = log.filter(x => x.t === 'sql' && /SET file_url = NULL/.test(x.sql));
  ok('성공한 1건만 file_url 을 비운다', nulls.length === 1, `실제 ${nulls.length}건`);
  ok('실패 1건이 집계된다', r.recording_files_failed === 1, String(r.recording_files_failed));
  ok('실패해도 예외가 밖으로 나가지 않는다', Array.isArray(r.errors) && r.errors.length === 0);
}

console.log('\n④ dryRun — 아무것도 지우지 않는다');
{
  const log = [];
  const rows = [{ id: 1, file_url: 'rec/a.webm' }, { id: 2, file_url: 'rec/b.webm' }];
  const r = await purgeExpired({ DB: fakeDB(rows, log), RECORDINGS: fakeR2(log) }, { dryRun: true });
  ok('R2 delete 를 한 번도 안 부른다', log.filter(x => x.t === 'r2del').length === 0);
  ok('status UPDATE 도 안 한다', log.filter(x => x.t === 'sql' && /SET status = 'deleted'/.test(x.sql)).length === 0);
  ok('그래도 건수는 센다', r.recordings === 2, String(r.recordings));
  ok('dry_run 표시가 남는다', r.dry_run === true);
}

console.log('\n⑤ R2 바인딩이 없으면 — 지우지 않고 미룬다 (죽지 않는다)');
{
  const log = [];
  const r = await purgeExpired({ DB: fakeDB([{ id: 1, file_url: 'rec/a.webm' }], log) });
  ok('예외 없이 끝난다', r && typeof r.executed_at === 'number');
  ok('삭제 0건 · 미룸 1건', r.recording_files_deleted === 0 && r.recording_files_failed === 1);
}

console.log('\n⑥ 키가 없는 행은 R2 를 부르지 않는다');
{
  const log = [];
  await purgeExpired({ DB: fakeDB([{ id: 1, file_url: '' }, { id: 2, file_url: null }], log), RECORDINGS: fakeR2(log) });
  ok('delete 호출 0건', log.filter(x => x.t === 'r2del').length === 0);
}

console.log('\n⑦ 배치 상한 — 한 번에 다 지우지 않고, 남은 수를 «정확히» 알려 준다');
{
  const log = [];
  const rows = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, file_url: `rec/${i}.webm` }));
  const r = await purgeExpired({ DB: fakeDB(rows, log), RECORDINGS: fakeR2(log) }, { maxRecordingDeletes: 200 });
  ok('상한만큼만 지운다', log.filter(x => x.t === 'r2del').length === 200);
  // ⚠️ LIMIT+1 방식이면 여기가 언제나 1 이 된다(50 이 아니라). 그 회귀를 잡는 검사다.
  ok('남은 건수가 정확하다 (LIMIT+1 방식이면 1 이 나온다)',
     r.recording_files_remaining === 50, String(r.recording_files_remaining));
}

console.log('\n⑦-2 dryRun 의 건수도 상한에 잘리지 않는다');
{
  const log = [];
  const rows = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, file_url: `rec/${i}.webm` }));
  const r = await purgeExpired({ DB: fakeDB(rows, log), RECORDINGS: fakeR2(log) },
                               { dryRun: true, maxRecordingDeletes: 200 });
  ok('dryRun 이 전체 250건을 센다', r.recordings === 250, String(r.recordings));
}

console.log('\n⑦-3 file_url 이 R2 키가 아닌 행은 건드리지 않는다 (진단 원자료 보호)');
{
  const log = [];
  const rows = [
    { id: 1, file_url: 'rec/real.webm' },
    { id: 2, file_url: 'DEBUG:upload failed step3' },
    { id: 3, file_url: 'FATAL: TypeError x' },
    { id: 4, file_url: 'https://example.com/v.mp4' },
  ];
  const r = await purgeExpired({ DB: fakeDB(rows, log), RECORDINGS: fakeR2(log) });
  const dels = log.filter(x => x.t === 'r2del').map(x => x.key);
  ok('rec/ 키 1건만 지운다', dels.length === 1 && dels[0] === 'rec/real.webm', dels.join('|'));
  ok('DEBUG/FATAL/외부주소는 file_url 을 비우지 않는다',
     log.filter(x => x.t === 'sql' && /SET file_url = NULL/.test(x.sql)).length === 1);
  ok('«지웠다» 숫자도 1건뿐', r.recording_files_deleted === 1, String(r.recording_files_deleted));
}

console.log('\n⑧ 계약 — 조회에 status 조건이 없어야 재시도가 된다');
{
  const sel = src.slice(src.indexOf('SELECT id, file_url FROM recordings'));
  const q = sel.slice(0, sel.indexOf('`'));
  ok('조회 조건에 status 가 없다', !/status/i.test(q), '있으면 R2 삭제 실패분이 영영 재시도되지 않는다');
  // ⚠️ 조건은 KEY_COND 상수로 빠져 있다 — SELECT 문 안만 보면 못 찾는다
  ok('조회가 file_url 있는 행만 잡는다',
     /KEY_COND\s*=\s*`file_url IS NOT NULL AND file_url LIKE 'rec\/%'`/.test(src) && /\$\{KEY_COND\}/.test(q),
     'KEY_COND 정의와 SELECT 의 사용을 함께 본다');
  ok('진짜 R2 키(rec/)만 잡는다', /LIKE 'rec\/%'/.test(src),
     'DEBUG:/FATAL:/https:// 가 섞이면 진단 원자료가 사라진다');
  ok('남은 건수를 COUNT(*) 로 따로 센다', /SELECT COUNT\(\*\) AS n FROM recordings/.test(src),
     'LIMIT+1 로 재면 언제나 «1건 남음» 이 된다');
  ok('만료 조건이 있다', /expires_at\s*<\s*\?/.test(q));
}

console.log('\n⑩ /api/retention/run 게이트 — 되돌릴 수 없는 삭제라 강사·조직계정을 막는다');
{
  const IDX = readFileSync('cloudflare-deploy/src/index.ts', 'utf8');
  const i = IDX.indexOf("path === '/api/retention/run'");
  const blk = i >= 0 ? IDX.slice(i, i + 900) : '';
  ok('핸들러를 찾는다', i >= 0);
  ok('강사를 막는다 (isTeacher)', /isTeacher/.test(blk));
  ok('조직 계정을 막는다 (isOrgScopedRole)', /isOrgScopedRole/.test(blk),
     '스코프 차단은 /api/admin/ 접두사에만 걸려 이 경로엔 오지 않는다');
  ok('canEditOrg 로 막지 않는다', !/canEditOrg/.test(blk),
     "그 함수는 'none'(교사)에 true 라 강사를 못 막는다");
  ok('403 을 돌려준다', /403/.test(blk));
  ok('dryRun 을 부를 통로가 있다', /dry_run/.test(blk) && /dryRun:/.test(blk),
     'retention.ts 주석이 요구하는 «dryRun 선행» 을 실제로 부를 수 있어야 한다');
  ok('isOrgScopedRole 이 import 되어 있다', /import \{[^}]*isOrgScopedRole[^}]*\} from '\.\/auth-admin'/.test(IDX));
}

console.log('\n⑪ 일괄 «되살리기» — 판정을 복제하지 않고 서버 단건 복원을 부른다');
{
  const CORE = readFileSync('cloudflare-deploy/public/js/adm-core.js', 'utf8');
  const i = CORE.indexOf('recRestoreExpiredBulk');
  const fn = i >= 0 ? CORE.slice(i, CORE.indexOf('\n};', i) + 3) : '';
  ok('함수가 최상위에 선언되어 있다', /window\.recRestoreExpiredBulk\s*=/.test(CORE),
     '다른 함수 안에 넣으면 onclick 에서 ReferenceError 다');
  ok('서버 단건 복원을 부른다', /\/api\/recordings\/' \+ t\.id \+ '\/status/.test(fn) && /'PATCH'/.test(fn));
  ok('화면에서 R2 실물 판정을 다시 하지 않는다',
     !/\.head\(/.test(fn) && !/RECORDINGS/.test(fn),
     '판정이 두 벌이 되면 서버와 어긋난다');
  ok('«성공이라고 말했는가» 로 판정한다 (ok === true)',
     /ld\.ok !== true/.test(fn) && /pd\.ok === true/.test(fn),
     '404 본문에는 ok 칸이 없어 ok === false 검사는 그냥 통과한다');
  ok('만료가 남은 행만 대상으로 삼는다', /expires_at\) > now/.test(fn));
  ok('file_gone 을 «실패» 로 세지 않는다', /'file_gone'\) gone\+\+/.test(fn.replace(/\s/g, m => m === '\n' ? '\n' : ' ')) || /file_gone/.test(fn) && /gone\+\+/.test(fn));
  ok('버튼이 화면에 있고 그 함수를 가리킨다',
     /id="rec-restore-bulk"/.test(readFileSync('cloudflare-deploy/public/admin.html','utf8')) &&
     /recRestoreExpiredBulk\(\)/.test(readFileSync('cloudflare-deploy/public/admin.html','utf8')));
}

console.log('\n⑨ 정본 밖에서 R2 를 지우지 않는다');
{
  const others = ['cloudflare-deploy/src/recordings-cleanup.ts'];
  const cleanup = readFileSync(others[0], 'utf8');
  ok('고아 청소기는 file_url 을 보호 목록으로 계속 읽는다',
     /SELECT file_url FROM recordings/.test(cleanup),
     '이 칸이 비워지는 것이 곧 «보호 해제» 라 이 조회가 정본이다');
}

console.log('\n⑩ 보관기간을 «여러 곳이 서로 같은 말을 하는가»');
/* 왜 이 절이 있나 — 2026-09-02 에 3개월 → 6개월로 올리면서, 기간을 정하는 코드와
   학부모가 읽는 동의 문구가 «따로» 라는 것이 드러났다. 한쪽만 바뀌면 조용히 어긋나고
   그건 곧 «안내한 것보다 오래 갖고 있는» 상태다 — 검사가 없으면 아무도 모른다.
   ⛔ 「6개월이라는 글자가 있는가」로 쓰지 말 것. 값을 «읽어서» 서로 대조한다. */
{
  const MANGO   = readFileSync('cloudflare-deploy/src/api-mango.ts', 'utf8');
  const CONSENT = readFileSync('cloudflare-deploy/public/js/mango-consent.js', 'utf8');

  const m = MANGO.match(/const RETENTION_MS = (\d+)\s*\*\s*24\s*\*\s*3600\s*\*\s*1000/);
  ok('기간 정본(RETENTION_MS)을 «일수» 로 읽을 수 있다', !!m, '모양이 바뀌면 대조가 헛돈다');
  const days = m ? Number(m[1]) : -1;
  ok('일수가 30일 배수다 (달 단위 안내와 맞물린다)', days > 0 && days % 30 === 0, String(days));
  const months = days / 30;

  const koM = CONSENT.match(/<b>(\d+)개월<\/b>\s*보관/);
  const enM = CONSENT.match(/kept for (\d+) months?/i);
  ok('동의 화면 한국어 문구에서 개월수를 읽을 수 있다', !!koM, '문구 모양이 바뀌었다');
  ok('동의 화면 영어 문구에서 개월수를 읽을 수 있다', !!enM, '문구 모양이 바뀌었다');
  ok(`동의 문구(KO ${koM ? koM[1] : '?'}개월)와 RETENTION_MS(${months}개월)가 같은 말을 한다`,
     !!koM && Number(koM[1]) === months,
     '기간만 올리고 안내를 안 바꾸면 «안내한 것보다 오래 보관» 이 된다');
  ok(`영어 문구(${enM ? enM[1] : '?'}개월)도 같다`, !!enM && Number(enM[1]) === months);

  /* 🔴 «옛 동의자는 다시 묻지 않는다» 는 사실을 코드가 계속 그대로인지 확인한다.
        이 전제가 바뀌면(=버전 비교가 생기면) 위 주석들의 «미결» 문장을 사람이 다시 판단해야 한다. */
  const compares = /CONSENT_VERSION/.test(CONSENT) &&
                   /consent_version[\s\S]{0,80}(!==|===|!=|==)/.test(CONSENT);
  ok('동의 버전 비교가 «아직 없다» 는 전제를 주석이 함께 적어 두었다',
     compares || (/CONSENT_VERSION 을 비교하지 않는다/.test(MANGO) && /사람이 정할 문제/.test(MANGO)),
     '비교를 넣었으면 api-mango.ts·retention.ts·CLAUDE.md 의 «미결» 문장을 갱신할 것');

  /* 화면 문구는 숫자를 말하지 않는다 — 기존 3개월분과 신규 6개월분이 섞여 있다 */
  const CORE2 = readFileSync('cloudflare-deploy/public/js/adm-core.js', 'utf8');
  const recPart = CORE2.slice(0, CORE2.indexOf('avg3m') > 0 ? CORE2.indexOf('avg3m') : CORE2.length);
  ok('녹화 화면 문구가 보관 개월수를 단정하지 않는다',
     !/보관\s*기?간?\s*3개월/.test(recPart) && !/\d+-month retention/.test(recPart) && !/\d+-day retention/.test(recPart),
     '한 숫자로 말하면 3개월분·6개월분 중 어느 쪽이든 거짓이 된다');
  const ADMIN_TS = readFileSync('cloudflare-deploy/src/api-admin.ts', 'utf8');
  ok('복원 거절 사유도 개월수를 단정하지 않는다',
     !/보관기간 3개월 경과/.test(ADMIN_TS) && !/3-month retention passed/.test(ADMIN_TS),
     '잰 것은 «R2 에 키가 없다» 까지다 — 사유는 만료일 수도 업로드 실패일 수도 있다');
}

console.log(`\n${'─'.repeat(46)}\n retention_purge_harness — PASS ${pass} / FAIL ${fail}\n`);
process.exit(fail ? 1 : 0);
