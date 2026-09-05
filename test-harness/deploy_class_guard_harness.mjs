// -*- coding: utf-8 -*-
// 🎓 «지금 화상방에 사람이 있으면 배포를 보류한다» — 실접속 판정 회귀 감시
//   실행:  node test-harness/deploy_class_guard_harness.mjs
//
//   [왜 있나]
//     2026-09-01 저녁 사장님 지시로 배포 금지 창이 «매일 13:00~01:20» → «화·목 14:00~23:00»
//     으로 좁혀졌다. 시각은 실측으로 맞지만(옛 창 숫자에 카페24 씨앗이 섞여 있었다),
//     요일을 좁힌 대가로 **월·수·금 수업 449건(30일 실측)이 창 밖으로 빠진다.**
//     그 구멍을 메우는 것이 이 판정이다 — 요일·시각과 무관하게 «지금 방에 사람이
//     들어와 있으면» 보류한다. 사장님이 말씀하신 「mangoi.ai 에서 테스트 수업할 때」가
//     정확히 이 자리다(테스트 수업은 오전에도 한다).
//   ⛔ 그래서 이 판정은 «있으면 좋은 것» 이 아니라 **요일 축소의 짝** 이다. 끄면 안 된다.
//
//   [이 하니스가 실제로 하는 일 — 문자열 검사만 하지 않는다]
//     ① 판정 SQL 을 정본에서 가져와 **진짜 SQLite 에 돌린다**. 표는 src/api-mango.ts 의
//        «진짜 CREATE» 로 만든다 → 소스 스키마가 바뀌면 이 검사도 따라간다
//     ② probeLiveClass 를 **가짜 fetch 로 실제로 실행**해 «막지 않는 쪽으로 실패하는가» 를 본다
//     ③ readCfIds 를 **진짜 wrangler.toml** 에 돌린다 (숫자를 복사해 두지 않았는지)
//     ④ 판정이 정본 한 곳에만 있는가 (deploy.yml·deploy.ps1 에 복제 금지)

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// ⚠️ 절대경로 문자열을 그대로 import() 하면 Windows 에서 'C:' 가 URL 프로토콜로 읽혀
//    ERR_UNSUPPORTED_ESM_URL_SCHEME 로 죽는다(리눅스 CI 는 통과해서 로컬만 빨간불).
//    반드시 pathToFileURL(...).href 로 넘긴다 — 이 저장소의 다른 하니스들과 같은 방식.
const W = await import(pathToFileURL(join(ROOT, '.github/scripts/class-window.mjs')).href);
const { LIVE_CLASS_SQL, LIVE_WINDOW_MS, probeLiveClass, readCfIds, decideHold, isClassWindow } = W;
const MANGO = readFileSync(join(ROOT, 'cloudflare-deploy/src/api-mango.ts'), 'utf8');
const YML   = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
const PS1   = readFileSync(join(ROOT, 'deploy.ps1'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const ok = (name, cond) => { if (cond) PASS++; else { FAIL++; FAILS.push(name); }
    console.log(`  ${cond ? '✅' : '❌'} ${name}`); };

console.log('\n── ① 판정 SQL 을 진짜 SQLite 에 돌린다 ──');
const CREATE = (MANGO.match(/`(CREATE TABLE IF NOT EXISTS attendance \([^`]*?\);)`/) || [])[1];
ok('src/api-mango.ts 에서 진짜 attendance CREATE 를 찾았다', !!CREATE);
ok('정본이 SQL 을 내보낸다', typeof LIVE_CLASS_SQL === 'string' && /attendance/.test(LIVE_CLASS_SQL));
ok('하트비트 창이 3분이다 (주기 30초의 여섯 배)', LIVE_WINDOW_MS === 180000);
/* ⛔ 카페24 예약표로 판정하면 안 된다 — «오늘 수업이 잡혀 있다» ≠ «지금 사람이 있다» */
ok('class_schedules(카페24 예약)로 판정하지 않는다', !/class_schedules/.test(LIVE_CLASS_SQL));
ok('문자열↔정수 비교를 막는 CAST 가 있다 (없으면 조용히 0명이 나온다)',
   /CAST\(\s*\?1\s+AS\s+INTEGER\s*\)/i.test(LIVE_CLASS_SQL));

let run = null;
if (CREATE) {
    const db = new DatabaseSync(':memory:');
    db.exec(CREATE);
    const now = Date.now(), cutoff = now - LIVE_WINDOW_MS;
    const ins = db.prepare(`INSERT INTO attendance (room_id, user_id, username, role, joined_at, left_at, last_seen_at, date)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    // 정본 SQL 을 그대로 돌린다 (?1 → node:sqlite 는 이름 없는 ? 로 받는다)
    const stmt = db.prepare(LIVE_CLASS_SQL.replace('?1', '?'));
    run = () => stmt.get(String(cutoff));

    ok('아무 행도 없으면 0명', run().live === 0);

    /* 🔴 사장님 요구의 핵심 — 「카페24 말고 mangoi.ai 에 들어있는 수업」 */
    ins.run('c24-511743', 'seed-1', 'Zee', 'student', now, null, null, '2026-09-02');
    ins.run('class-848-20260902', 'seed-2', '허윤아', 'student', now, null, null, '2026-09-02');
    ok('카페24 씨앗(last_seen_at 없음)은 «수업 중» 으로 세지 않는다', run().live === 0);

    ins.run('class-848-20260902', 'u1', 'HANNAH', 'teacher', now - 600000, null, now - 30000, '2026-09-02');
    ok('지금 들어와 있는 사람은 잡는다', run().live === 1);

    ins.run('class-848-20260902', 'u2', 'jeong', 'student', now - 500000, null, now - 12000, '2026-09-02');
    ok('같은 방 2명 → 2명 / 1개 방', run().live === 2 && run().rooms === 1);

    ins.run('demo-1', 'u3', 'kang', 'teacher', now - 60000, null, now - 5000, '2026-09-02');
    ok('테스트 방(demo-1)도 센다 — 「테스트 수업할 때」가 이 기능의 목적이다',
       run().live === 3 && run().rooms === 2);

    ins.run('class-900-20260902', 'u4', '나간사람', 'student', now - 900000, now - 1000, now - 1000, '2026-09-02');
    ok('정상 퇴장(left_at 있음)은 세지 않는다', run().live === 3);

    ins.run('class-901-20260902', 'u5', '끊긴사람', 'student', now - 3600000, null, now - 600000, '2026-09-02');
    ok('10분 전 하트비트(이미 끊긴 세션)는 세지 않는다', run().live === 3);

    ins.run('class-902-20260902', 'u6', '2분전', 'student', now - 200000, null, now - 120000, '2026-09-02');
    ok('2분 전 하트비트는 «아직 수업 중» 으로 본다 (30초 주기 여유)', run().live === 4);
    ins.run('class-903-20260902', 'u7', '4분전', 'student', now - 400000, null, now - 240000, '2026-09-02');
    ok('4분 전 하트비트는 세지 않는다 (3분 창 밖)', run().live === 4);

    /* 🧬 변이시험 — 검사가 헛돌지 않는지 «되돌려» 확인한다. */
    const mut = LIVE_CLASS_SQL.replace('?1', '?').replace(/\s*left_at IS NULL\s*AND\s*/, ' ');
    ok('🧬 left_at 조건을 빼면 «나간 사람» 이 다시 잡힌다 (검사가 헛돌지 않는다)',
       db.prepare(mut).get(String(cutoff)).live > 4);
    db.close();
}

console.log('\n── ② probeLiveClass 를 «막지 않는 쪽으로 실패» 시켜 본다 ──');
/* ⚠️ 조회를 못 하면 「수업 없음」이 아니라 「모름」이다. 그래도 막지는 않는다 —
   고장 난 감시견이 모든 배포를 영구히 막는 쪽이 더 나쁘다(급한 수정도 못 나간다).
   ⛔ 대신 조용히 넘기지 않는다(부르는 쪽이 크게 남긴다 — ④절). */
const CREDS = { token: 't', accountId: 'a', databaseId: 'd' };
const jsonRes = (body, okFlag = true, status = 200) => ({
    ok: okFlag, status, json: async () => body,
});
let seen = null;
const fakeOk = async (url, init) => { seen = { url, init };
    return jsonRes({ result: [{ results: [{ live: 3, rooms: 2 }] }] }); };

const good = await probeLiveClass({ ...CREDS, fetchImpl: fakeOk });
ok('정상 응답 → ok:true 와 인원', good.ok === true && good.live === 3 && good.rooms === 2);
ok('D1 REST 주소를 계정·DB id 로 만든다', /\/accounts\/a\/d1\/database\/d\/query$/.test(seen.url));
ok('정본 SQL 을 그대로 싣는다', JSON.parse(seen.init.body).sql === LIVE_CLASS_SQL);
ok('커트라인을 «지금 - 3분» 으로 싣는다', (() => {
    const p = Number(JSON.parse(seen.init.body).params[0]);
    return Math.abs((Date.now() - LIVE_WINDOW_MS) - p) < 5000;
})());
ok('토큰을 Authorization 헤더로 보낸다', seen.init.headers.Authorization === 'Bearer t');
ok('타임아웃을 건다 (배포를 «멎게» 하면 안 된다)', !!seen.init.signal);

let called = false;
const noCred = await probeLiveClass({ token: '', accountId: 'a', databaseId: 'd',
    fetchImpl: async () => { called = true; return jsonRes({}); } });
ok('자격증명이 없으면 아예 부르지 않는다', called === false && noCred.error === 'no-credentials');
ok('그때도 live 는 0 이라 막지 않는다', noCred.live === 0 && noCred.ok === false);

const denied = await probeLiveClass({ ...CREDS, fetchImpl: async () => jsonRes({}, false, 403) });
ok('403(권한 없음) → 막지 않는다', denied.ok === false && denied.live === 0 && denied.error === 'http-403');

const threw = await probeLiveClass({ ...CREDS, fetchImpl: async () => { throw new Error('boom'); } });
ok('예외(네트워크·타임아웃) → 막지 않는다', threw.ok === false && threw.live === 0);

const weird = await probeLiveClass({ ...CREDS, fetchImpl: async () => jsonRes({ result: [] }) });
ok('응답 모양이 다르면 → 막지 않는다', weird.ok === false && weird.error === 'unexpected-shape');

/* 🧬 «못 찾는다» 검사만 있으면 헛돌아도 전부 초록이 된다 — «제대로 찾는다» 를 짝으로 둔다.
   (CLAUDE.md 2장 「가짜 DB 로 하니스를 돌렸는데 검사가 헛돌며 통과」) */
ok('🧬 그래서 «제대로 찾는다» 검사가 위에 짝으로 있다', good.ok === true && good.live === 3);

console.log('\n── ②-2 창 안에서는 D1 을 «부르지 않는다» (CLI 를 실제로 실행) ──');
/* ⚠️ 창 안이면 어차피 보류라 물어볼 이유가 없다. 부르면 배포마다 쓸데없는 왕복이 생기고,
   D1 이 흔들릴 때 «보류인데도» 8초를 더 기다린다. 순서를 뒤집지 말라는 계약이다.
   ⛔ 소스에 그 조건이 «있는가» 로 검사하지 말 것 — 조건을 옮겨도 통과한다. 돌려서 본다. */
const { spawnSync } = await import('node:child_process');
const runCli = (nowIso) => spawnSync(process.execPath,
    [join(ROOT, '.github/scripts/class-window.mjs')],
    { encoding: 'utf8', env: { ...process.env, NOW_ISO: nowIso,
        CLOUDFLARE_API_TOKEN: 'dummy-token-for-probe-test',
        CLOUDFLARE_ACCOUNT_ID: '', FORCE_NOW: '', COMMIT_MESSAGE: '',
        GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' } });
/* 2026-09-01 은 화요일 — 06:00 UTC = 15:00 KST = 창 «안» */
const inWin = runCli('2026-09-01T06:00:00Z');
ok('창 안이면 보류로 끝난다', /hold=true/.test(inWin.stdout));
ok('창 안에서는 실접속을 물어보지 않는다 (조회 실패 문구가 없다)',
   !/실접속 확인 실패/.test(inWin.stdout));
/* 2026-09-05 는 토요일 — 창 «밖» 이라 물어보고, 자격증명이 반쪽이라 실패해야 한다.
   ⛔ 여기를 평일로 되돌리지 말 것 — 그 요일이 창에 들어오는 순간 «물어보지도 않고
      보류로 끝나» 이 절이 통째로 헛돈다. 2026-09-02 에 수요일로 두었다가 실제로 밟았다
      (그날 수요일이 창에 들어왔다 다시 빠졌다 — #761 · #768). */
const outWin = runCli('2026-09-05T06:00:00Z');
ok('🧬 창 밖에서는 실제로 물어본다 (그래서 실패 문구가 나온다 — 검사가 헛돌지 않는다)',
   /실접속 확인 실패/.test(outWin.stdout));
ok('그래도 막지 않는다 (fail-open)', /hold=false/.test(outWin.stdout));

console.log('\n── ③ 계정·DB id 를 wrangler.toml 에서 읽는다 (복사해 두지 않는다) ──');
const TOML = readFileSync(join(ROOT, 'cloudflare-deploy/wrangler.toml'), 'utf8');
const ids = readCfIds(TOML);
ok('account_id 를 읽었다', /^[0-9a-f]{32}$/.test(ids.accountId));
ok('mango-db 의 database_id 를 읽었다', /^[0-9a-f-]{36}$/.test(ids.databaseId));
ok('그 값이 wrangler.toml 에 실제로 있다',
   TOML.includes(ids.accountId) && TOML.includes(ids.databaseId));
const SRC = readFileSync(join(ROOT, '.github/scripts/class-window.mjs'), 'utf8');
ok('⛔ 정본 소스에 id 를 복사해 두지 않았다',
   !SRC.includes(ids.accountId) && !SRC.includes(ids.databaseId));

console.log('\n── ④ 판정은 정본 한 곳에만 있다 ──');
/* 이 저장소는 «같은 판정이 두 곳에 있으면 한쪽만 고쳐진다» 를 반복해서 밟았다. */
/* ⚠️ 「그 낱말이 파일에 없다」로 쓰지 말 것 — deploy.ps1 에는 무관한 파일 이름
   `migration-attendance-checkin.sql` 이 있어 **멀쩡한 코드가 FAIL** 했다(실제로 밟음).
   물어야 할 것은 «그 낱말이 있는가» 가 아니라 «판정 SQL 을 다시 적었는가» 다. */
const COPIED = (t) => /FROM\s+attendance/i.test(t) || /last_seen_at\s*>=/.test(t);
ok('deploy.yml 이 판정 SQL 을 다시 적지 않는다', !COPIED(YML));
ok('deploy.ps1 이 판정 SQL 을 다시 적지 않는다', !COPIED(PS1));
ok('🧬 그 검사가 헛돌지 않는다 (정본에는 실제로 걸린다)', COPIED(SRC));
ok('deploy.yml 이 정본 스크립트를 부른다', /class-window\.mjs/.test(YML));
/* ⛔ 조회 실패를 조용히 넘기지 않는다 — 「모름」을 「수업 없음」으로 읽으면 안 된다. */
ok('조회 실패를 사람에게 알린다', /실접속 확인 실패/.test(SRC));
/* 🔴 요일을 좁힌 대가를 메우는 짝이므로, 이 판정이 decideHold 에 실제로 걸려 있어야 한다. */
const wed = new Date(Date.UTC(2026, 8, 5, 6, 0));   // 토요일 15:00 KST = 창 밖
/* ⛔ 그 시각이 «정말» 창 밖인지부터 확인한다 — 창이 넓어지면 아래 두 줄이 조용히 헛돌아
      «보류된다» 가 창 때문인지 실접속 때문인지 구별하지 못한 채 초록이 된다. */
ok('그 시각이 실제로 창 밖이다 (헛돌지 않는다)', isClassWindow(wed) === false);
ok('🔴 창 밖 + 사람 있음 → 보류된다 (이게 빠지면 월·수·금이 무방비)',
   decideHold({ now: wed, live: 1 }).hold === true);
ok('창 밖 + 아무도 없음 → 배포한다', decideHold({ now: wed, live: 0 }).hold === false);

console.log('\n────────────────────────────────');
console.log(`총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패:'); FAILS.forEach(f => console.log('  - ' + f)); process.exit(1); }
console.log('🎉 deploy_class_guard_harness — 전부 통과');
