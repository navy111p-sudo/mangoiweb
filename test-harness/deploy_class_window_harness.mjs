// deploy_class_window_harness.mjs — 수업 시간대에는 배포가 나가지 않는가 (2026-09-01)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 배포하면 화상수업 Durable Object(VideoCallRoom)가 재시작되어 진행 중인 수업의
// WebSocket 이 전부 끊긴다. 2026-09-01 실측 — 그날 19:33~22:06 에만 운영 워커가 22번
// 재배포됐고, 21:43:57 배포 **8초 뒤** class-1070 강사, **37초 뒤** class-1078 강사
// (김선우 학생 수업)가 동시에 끊겼다. class-996 은 강사가 10분 사이 네 번 끊겨 녹화가
// 4:03 / 3:18 / 0:18 로 토막났다.
//
// ── 이 하니스가 못 박는 것 ──────────────────────────────────────────────────
//   ① 수업 시간대면 hold=true, 아니면 false (경계 시각 포함) — 판정을 **실제로 돌린다**
//   ② 긴급 우회 두 가지(force_now · [deploy-now])가 진짜로 통한다
//   ③ 배포·헬스체크·TURN 점검 step 이 **전부** 그 판정에 걸려 있다
//   ④ 🔴 몰아 배포 크론이 창 «밖» 이다 — 창 안이면 보류를 풀러 오는 그 실행마저
//      스스로 보류해 **배포가 영영 안 나간다**. 이 검사가 그 자기잠금을 막는다.
//   ⑤ 판정이 배포 step «앞» 에서 돈다
//   ⑥ 보류가 배포 게이트(tsc·회귀 하니스·?v=)까지 끄지 않는다
//   ⑦ 판정이 deploy.yml 안에 복제돼 있지 않다 (정본은 class-window.mjs 하나)
//   ⑧ 우회 입력이 워크플로에 실제로 배선돼 있다
//   ⑨ 종료코드 계약 — `--exit-on-hold` 면 보류=2, 없으면 «항상 0»(CI 가 죽으면 안 된다)
//   ⑩ 로컬 `deploy.ps1` 도 같은 판정을 «불러서» 쓴다 (PowerShell 로 복제하지 않는다)
//
// ⚠️ ③을 «그 글자가 파일에 있나» 로 검사하면 안 된다 — 배포 요약 step 도 워커 주소를
//    갖고 있어서 거짓 FAIL 이 난다. step 블록을 `- name:` 경계로 잘라 **그 안에서** 본다
//    (CLAUDE.md 2장 「검사 범위를 «길이» 로 자르지 마세요」).
//
// 실행: node test-harness/deploy_class_window_harness.mjs

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const YML_PATH = join(__dir, '../.github/workflows/deploy.yml');
const YML = readFileSync(YML_PATH, 'utf8');
const CLI_PATH = join(__dir, '../.github/scripts/class-window.mjs');
const PS1 = readFileSync(join(__dir, '../deploy.ps1'), 'utf8');
const CW = readFileSync(CLI_PATH, 'utf8');

// ⚠️ 절대경로 문자열을 그대로 import() 하면 Windows 에서 'C:' 가 URL 프로토콜로 읽혀
//    ERR_UNSUPPORTED_ESM_URL_SCHEME 로 죽는다(리눅스 CI 는 통과해서 로컬만 빨간불).
//    반드시 pathToFileURL(...).href 로 넘긴다 — 이 저장소의 다른 하니스들과 같은 방식.
const W = await import(pathToFileURL(CLI_PATH).href);
const { decideHold, isClassWindow, CLASS_WINDOW_KST, OVERRIDE_TAG } = W;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
};

/** KST 'HH:MM' → 그 시각의 UTC Date (한국은 DST 없음).
 *  기본 날짜는 2026-09-01 = **화요일**(실사고가 난 날). day 로 다른 요일을 고른다. */
const DOW = { 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6, 월: 7 };   // 2026-09-01 이 화요일
const atKst = (hhmm, day = '화') => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(Date.UTC(2026, 8, DOW[day], h - 9, m, 0));
};

console.log('\n── ① 수업 시간대 판정 (판정 모듈을 실제로 실행) ──');
/* 근거 — 2026-09-16 사장님 지시(「스케줄이 바뀌어서 이제는 오후 12시부터 16시까지 막아줘」).
   요일은 그대로 화·목이고 시각만 14:00~23:00 → 12:00~16:00 으로 옮겼다.
   🔴 **지난 실측과는 어긋난다** — 최근 30일 실접속(2026-09-16 기준 770건)의 피크는
      21시(화·목 142건)이고, 새 창이 막는 화·목 실접속은 95건뿐이다(옛 창 14~23시는 358건).
      화·목 17시 이후만 300건이 창 밖이 된다. 그런데도 이 값이 맞는 이유는
      «테스트 수업 시각이 옮겨졌기» 때문이고, 그 실측은 «옮기기 전» 을 잰 것이다.
      ⚠️ 30일 롤링이라 합계는 날마다 바뀐다 — 숫자를 옮겨 적을 때 «잰 날짜» 를 함께 적을 것.
   ⛔ 그러니 이 표를 「21시가 피크니 되돌리자」의 근거로 쓰지 말 것 — 되돌리려면 지금
      테스트 수업이 실제로 몇 시인지 다시 재고 사장님께 확인해야 한다(class-window.mjs 머리말). */
const CASES = [
    ['화', '11:59', false], ['화', '12:00', true],  ['화', '13:59', true],
    ['화', '14:00', true],  ['화', '15:59', true],  ['화', '16:00', false],
    ['화', '02:00', false], ['화', '11:00', false],
    // 🔴 옛 창(14:00~23:00)에서는 막혔던 시각들 — 이제 «배포» 다. 보호가 줄어든 사실을
    //    검사로 박아 둔다. 21시대에 수업이 다시 생기면 이 줄이 먼저 눈에 띄어야 한다.
    ['화', '17:20', false], ['화', '21:20', false], ['화', '22:59', false],
    ['목', '12:00', true],  ['목', '15:30', true],  ['목', '16:00', false], ['목', '19:30', false],
];
for (const [day, hhmm, want] of CASES) {
    ok(`${day} ${hhmm} KST → ${want ? '보류' : '배포'}`, isClassWindow(atKst(hhmm, day)) === want);
}
ok(`창의 시작은 포함, 끝은 제외한다 (${CLASS_WINDOW_KST.start} 보류 · ${CLASS_WINDOW_KST.end} 배포)`,
   isClassWindow(atKst(CLASS_WINDOW_KST.start)) === true &&
   isClassWindow(atKst(CLASS_WINDOW_KST.end)) === false);

/* 🔴 요일이 아니면 하루 종일 창 밖이다. 수·금·월에도 수업이 «있지만» 보호하지 않는 것이
   2026-09-02 의 결정이다 — 이 검사는 그 결정이 코드와 일치하는지만 본다. */
/* ⚠️ 본보기는 «창 안 시각» 이어야 한다 — 창 밖 시각(옛 19:30)을 쓰면 요일 때문인지
      시각 때문인지 구별하지 못해 이 검사가 조용히 뜻을 잃는다(2026-09-16 에 실제로 그렇게
      될 뻔했다). 아래 전제 검사가 그 본보기가 실제로 창 안 시각인지 먼저 못 박는다. */
const MID = '14:00';
ok(`전제: 본보기 ${MID} 가 화요일에는 창 «안» 이다 (아니면 아래 요일 검사가 헛돈다)`,
   isClassWindow(atKst(MID, '화')) === true);
for (const day of ['수', '금', '토', '일', '월']) {
    ok(`${day}요일은 창 안 시각(${MID})에도 배포한다 (보호 대상 아님 — 사장님 결정)`,
       isClassWindow(atKst(MID, day)) === false);
}
ok('막는 요일이 정확히 화·목 두 개다',
   Array.isArray(CLASS_WINDOW_KST.days) && CLASS_WINDOW_KST.days.length === 2 &&
   CLASS_WINDOW_KST.days.includes(2) && CLASS_WINDOW_KST.days.includes(4),
   JSON.stringify(CLASS_WINDOW_KST.days));

/* 🔴 이 기능이 생긴 실사고 시각(2026-09-01 화요일 21:38~21:46, 김선우 학생 수업이 끊긴
   그 배포들)은 **2026-09-16 창 변경으로 더 이상 보류되지 않는다.**
   ⛔ 이것을 「검사가 헛돈다」로 읽고 지우지 말 것 — 보호 범위가 줄어든 «사실» 이고,
      21시대에 수업이 다시 잡히는 날 이 줄이 가장 먼저 눈에 띄어야 한다.
   ✅ 그때 할 일은 창을 되돌리거나(사장님 확인) 실접속 판정을 깨우는 것이다. */
for (const t of ['21:38', '21:40', '21:43', '21:46']) {
    ok(`🔴 2026-09-01(화) 실사고 배포 ${t} — 새 창(12~16시)에서는 «보류되지 않는다»`,
       decideHold({ now: atKst(t) }).hold === false);
}

console.log('\n── ② 긴급 우회 ──');
const inWindow = atKst('14:00');   // 새 창(12~16시) 한가운데. ⚠️ 창을 바꾸면 여기도 함께.
ok('force_now=true 면 수업 시간대여도 나간다',
   decideHold({ now: inWindow, force: 'true' }).hold === false);
ok('force_now 가 없거나 false 면 보류 그대로',
   decideHold({ now: inWindow, force: '' }).hold === true &&
   decideHold({ now: inWindow, force: 'false' }).hold === true);
ok(`커밋 메시지에 ${OVERRIDE_TAG} 가 있으면 나간다`,
   decideHold({ now: inWindow, commitMessage: `긴급: 로그인 장애 수정 ${OVERRIDE_TAG}` }).hold === false);
ok('평범한 커밋 메시지는 우회로 읽히지 않는다',
   decideHold({ now: inWindow, commitMessage: 'docs: 작업기록 추가 (#700)' }).hold === true);
/* ⚠️ 우회는 «창 판정보다 먼저» 와야 한다 — 급한 수정은 언제든 나가야 한다. */
ok('우회 사유가 요약에 남는다 (reason 이 갈린다)',
   decideHold({ now: inWindow, force: 'true' }).reason === 'forced' &&
   decideHold({ now: inWindow, commitMessage: OVERRIDE_TAG }).reason === 'commit-override' &&
   decideHold({ now: inWindow }).reason === 'class-window');

console.log('\n── ②-2 창 밖이어도 «지금 사람이 있으면» 보류한다 ──');
/* 🔴 요일을 화·목으로 좁힌 대가(수·금·월이 창 밖)를 메우는 짝이다.
   ⛔ 이 판정을 빼면 수·금·월은 «창도 없고 실접속 판정도 없는» 상태가 된다.
   (자세한 검사는 test-harness/deploy_class_guard_harness.mjs — SQL 을 진짜 SQLite 에,
    D1 조회를 가짜 fetch 로 돌린다. 여기서는 «창과 어떻게 맞물리는가» 만 못 박는다.) */
/* 🪤 본보기를 «토요일» 로 둔다. 2026-09-02 에 수요일이 창에 들어왔다가(#761) 다시
   빠졌는데(#768), 들어와 있던 동안 이 세 줄이 «수요일 = 창 밖» 을 전제로 하고 있어
   3건이 FAIL 났다. FAIL 이 난 것 자체는 좋았지만 — 반대 방향이 더 위험하다:
   여기서 «보류된다» 가 창 때문인지 실접속 때문인지 구별하지 못한 채 초록이 될 수 있다.
   그래서 요일이 또 바뀌어도 흔들리지 않는 날로 두고, 아래 한 줄을 짝으로 둔다.
   ⛔ 이 시각을 평일로 되돌리지 말 것. */
const wedOut = new Date(Date.UTC(2026, 8, 5, 6, 0));   // 토요일 15:00 KST = 창 밖
ok('그 시각이 실제로 창 밖이다 (이 줄이 없으면 아래 두 줄이 조용히 헛돈다)',
   isClassWindow(wedOut) === false);
ok('창 밖 요일 15:00 · 아무도 없음 → 배포', decideHold({ now: wedOut, live: 0 }).hold === false);
ok('창 밖 요일 15:00 · 2명 접속 중 → 보류', decideHold({ now: wedOut, live: 2 }).hold === true);
ok('그때 사유가 live-class 로 갈린다', decideHold({ now: wedOut, live: 2 }).reason === 'live-class');
ok('창 안이면 실접속과 무관하게 class-window 가 이긴다',
   decideHold({ now: inWindow, live: 5 }).reason === 'class-window');
ok('강행은 실접속보다도 먼저다', decideHold({ now: wedOut, live: 5, force: 'true' }).hold === false);
/* ⚠️ 조회를 못 하면 live=0 으로 온다 = 「수업 없음」이 아니라 「모름」. 그래도 막지 않는다
   (고장 난 감시견이 모든 배포를 영구히 막는 쪽이 더 나쁘다). 대신 조용히 넘기지 않는다. */
ok('조회 실패(live=0)에는 막지 않는다 — fail-open 이 유지된다',
   decideHold({ now: wedOut, live: 0 }).reason === 'outside-window');

console.log('\n── ③ 배포·검증 step 이 전부 그 판정에 걸려 있다 ──');
const HOLD_GATE = "steps.class_window.outputs.hold != 'true'";
/* step 블록을 `- name:` 경계로 자른다 — 길이로 자르면 옆 step 이 딸려 들어온다. */
const blocks = [];
{
    const re = /^ {6}- name: (.+)$/gm;
    const marks = [...YML.matchAll(re)];
    for (let i = 0; i < marks.length; i++) {
        const start = marks[i].index;
        const end = i + 1 < marks.length ? marks[i + 1].index : YML.length;
        blocks.push({ name: marks[i][1].trim(), body: YML.slice(start, end) });
    }
}
ok('deploy.yml 의 step 을 읽어 냈다', blocks.length >= 10, `${blocks.length}개`);

/* «바깥에 영향을 주거나 배포 결과를 묻는» step = wrangler 배포 또는 워커에 curl.
   ⚠️ 배포 요약 step 도 워커 주소를 갖고 있지만 curl 을 하지 않는다 → 여기 안 걸린다. */
const outward = blocks.filter(b =>
    /uses:\s*cloudflare\/wrangler-action/.test(b.body) ||
    (/\bcurl\b/.test(b.body) && /workers\.dev/.test(b.body)));
ok('배포·검증 step 을 찾았다 (wrangler 2 + 헬스체크 2 + TURN 1)', outward.length === 5,
   outward.map(b => b.name).join(' / '));
for (const b of outward) {
    ok(`「${b.name}」 이 보류 판정에 걸려 있다`, b.body.includes(HOLD_GATE));
}

console.log('\n── ④ 🔴 몰아 배포 크론이 창 «밖» 인가 (자기잠금 방지) ──');
const crons = [...YML.matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].map(m => m[1]);
/* 🔴 하나에만 기대면 안 된다 — 2026-09-02 실측: 첫날 회차가 **177분 늦게** 왔고 그동안
   main 커밋 21건이 라이브에 안 나간 채였다. GitHub schedule 은 지연되거나 아예 누락된다. */
ok('몰아 배포 크론이 3개 이상이다 (하나가 누락돼도 다음이 잡는다)',
   crons.length >= 3, `${crons.length}개 — ${JSON.stringify(crons)}`);
for (const c of crons) {
    const [mm, hh] = c.split(/\s+/);
    ok(`크론 '${c}' 은 수업 시간대가 아니다 (판정을 그 시각으로 실제로 돌림)`,
       /^\d+$/.test(mm) && /^\d+$/.test(hh) &&
       decideHold({ now: new Date(Date.UTC(2026, 8, 1, Number(hh), Number(mm))) }).hold === false,
       '창 안이면 보류된 배포가 영영 안 나간다');
}

/* 크론 KST 분(하루 중). 창 밖 구간은 [창끝, 창시작) 하나로 이어져 있다. */
const hm = (t) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
const winStartMin = hm(CLASS_WINDOW_KST.start), winEndMin = hm(CLASS_WINDOW_KST.end);
const pad = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/* ⚠️ «창 끝에서 얼마나 지났나» 로 줄 세운다 — 그냥 분으로 정렬하면 자정을 넘는 구간의
   간격을 놓친다(23:17 과 02:41 은 실제로 204분 차이인데 분으로는 1236분 차이로 보인다). */
const openLen = (winStartMin - winEndMin + 1440) % 1440;
const kstMin = crons.map(c => {
    const [mm, hh] = c.split(/\s+/).map(Number);
    return (hh * 60 + mm + 540) % 1440;
});
const pos = kstMin.map(m => (m - winEndMin + 1440) % 1440).sort((a, b) => a - b);

/* ⛔ 한자리에 몰아 두면 세 개여도 «한 번» 과 같다 — 그 시간대가 통째로 밀리면 다 놓친다. */
let minGap = Infinity;
for (let i = 1; i < pos.length; i++) minGap = Math.min(minGap, pos[i] - pos[i - 1]);
ok('크론이 서로 90분 이상 떨어져 있다 (한 시간대가 통째로 밀려도 다음이 남는다)',
   pos.length < 2 || minGap >= 90,
   `가장 좁은 간격 ${minGap}분 — ${kstMin.slice().sort((a,b)=>a-b).map(pad).join(' · ')}`);

/* ⚠️ 창이 «열리기» 전 마지막 기회가 있어야, 그 직전에 병합한 것이 창 안으로 안 밀린다. */
const lastGap = openLen - pos[pos.length - 1];
ok(`창이 열리기(${CLASS_WINDOW_KST.start}) 전 마지막 크론이 30분 이상 여유를 둔다`,
   lastGap >= 30, `여유 ${lastGap}분`);

/* 🔴 «창 밖» 이라고 «수업이 없다» 는 뜻이 아니다 — 창은 화·목만 막는다(사장님 결정).
   그래서 크론 시각은 «창 밖» 만으로는 안전하지 않고, 창 밖에 실재하는 수업과도
   떨어져 있어야 한다. 2026-09-02 실측에서 13:23 크론이 월 13:00~13:20 수업이 끝난
   **3분 뒤** 였다 — 이 게이트가 막으려던 바로 그 사고를 크론이 스스로 냈을 것이다.
   ⚠️ 이 표는 «그때 잰 것» 이다. D1 을 읽지 않으므로 새 수업이 생기면 여기 손으로 더해야
      한다 — 그래서 «완전하지 않다». 그래도 손으로 옮기다 되돌리는 것은 막는다.
   ⛔ 「창 밖이니 괜찮다」로 이 절을 지우지 마세요. */
const OUT_WINDOW_CLASSES = [
    // [설명, 시작 KST, 끝 KST]
    // ── 예약표(class_schedules active, LMS·시드 제외) — 2026-09-02 실측
    ['월 13:00 장지웅 (adm-enroll:85)', '13:00', '13:20'],
    ['22:40 c24-mirror (화·목 밖에서는 무방비)', '22:40', '23:00'],
    // ── 야간 실접속(attendance, last_seen_at 있는 행) — 이 저장소가 이미 적어 둔 구간.
    //    🔴 처음에 이 두 줄을 빠뜨려 23:17 크론이 통과했다(2026-09-02). deploy.yml 의
    //       「📜 처음에 23:35 로 잡았다가 물렸다」 주석이 그 시간대를 이미 말하고 있었는데,
    //       내가 만든 표가 그것을 안 보고 있었다 — «이미 아는 것» 을 빠뜨린 검사였다.
    //    ⚠️ 자정을 넘으므로 두 줄로 나눈다(아래 assert 가 강제한다).
    ['야간 접속 23:20~ (실측)', '23:20', '23:59'],
    ['야간 접속 ~01:20 (실측)', '00:00', '01:20'],
    /* 🔴 2026-09-16 추가 — 창을 12~16시로 옮기며 «창이 닫힌 직후(16:20)» 에 크론을 두려다
       이 구간 때문에 되돌렸다. 그때 이 줄이 없어서 하니스가 위반을 못 잡았다(초록이었다).
       실측(최근 30일, last_seen_at>0 · c24-* 제외): 16:07·16:08·16:10·16:12·16:13·16:14·
       16:16·16:17 · 16:27·16:28·16:30·16:31·16:33 에 접속이 있다(월 13 · 화 3 · 목 2 · 수 1 · 일 1).
       ⛔ 「창 밖이니 한가하다」로 읽지 말 것 — 이 서비스는 17·19·21시가 피크다. */
    ['16시대 실접속 (2026-09-16 실측)', '16:00', '16:45'],
];
const CLASS_MARGIN_MIN = 15;   // 배포는 2분 30초쯤 걸린다 — 앞뒤로 이만큼은 비운다

/* ⛔ 표를 비우면 검사가 통째로 사라지는데 «초록» 이다 — 이 저장소가 이미 밟은 모양
   (CLAUDE.md 「목록을 비운 뒤에도 초록」). 그래서 «비어 있지 않다» 를 먼저 못 박는다. */
ok('창 밖 수업 표가 비어 있지 않다 (비우면 이 절이 통째로 사라진다)',
   OUT_WINDOW_CLASSES.length >= 4, `${OUT_WINDOW_CLASSES.length}줄`);

for (const [label, st, en] of OUT_WINDOW_CLASSES) {
    const a = hm(st), b = hm(en);
    /* ⛔ 자정을 넘는 구간을 한 줄로 넣으면 아래 분 비교가 조용히 헛돈다
       (실측: ['23:30','00:20'] 을 넣으면 13분 전인 크론도 통과했다). 두 줄로 나눌 것. */
    ok(`«${label}» 이 자정을 넘지 않는다 (넘으면 두 줄로 나눌 것)`, b > a, `${st}~${en}`);
    for (const m of kstMin) {
        const clear = (m <= a - CLASS_MARGIN_MIN) || (m >= b + CLASS_MARGIN_MIN);
        ok(`크론 ${pad(m)} 이 «${label}» 과 ${CLASS_MARGIN_MIN}분 이상 떨어져 있다`,
           clear, `수업 ${st}~${en} · 크론 ${pad(m)}`);
    }
}

/* ⛔ 시각을 안내 문구에 베껴 적으면 크론만 옮겼을 때 «언제 나가는지» 를 거짓으로 말한다
   (2026-09-01 #721 에서 실제로 그랬다). 정본은 deploy.yml 의 schedule 목록 하나뿐이다.
   ⚠️ deploy.yml 전체로 검사하면 크론 옆 주석이 걸려 거짓 FAIL 이 난다 — 사람에게 «보여 주는»
      자리(배포 요약 step · 판정 모듈 · deploy.ps1)로만 좁힌다. */
const cronLabels = kstMin.map(pad);
const summaryBlock = (blocks.find(b => b.name === 'Deploy summary') || { body: '' }).body;
for (const [what, text] of [['배포 요약 step', summaryBlock], ['class-window.mjs', CW], ['deploy.ps1', PS1]]) {
    const hit = cronLabels.filter(t => text.includes(t));
    ok(`${what} 이 몰아 배포 «시각» 을 베껴 적지 않았다`, hit.length === 0, hit.join(' · '));
}

console.log('\n── ⑤ 판정이 배포보다 «먼저» 돈다 ──');
const iJudge = YML.indexOf('id: class_window');
const iDeploy = YML.indexOf('- name: Deploy base Worker');
ok('판정 step 이 존재한다', iJudge >= 0);
ok('판정 step 이 배포 step 앞에 있다', iJudge >= 0 && iDeploy > iJudge);

console.log('\n── ⑥ 보류가 «검사» 까지 끄지는 않는다 ──');
/* main 이 배포 가능한 상태인지는 계속 확인해야 한다. 보류로 게이트까지 꺼지면
   「나갈 때가 됐는데 그제야 깨져 있는 걸 아는」 상태가 된다. */
for (const nm of ['배포 게이트', 'Stamp BUILD_STAMP']) {
    const b = blocks.find(x => x.name.includes(nm));
    ok(`「${b ? b.name : nm}」 은 보류와 무관하게 계속 돈다`, !!b && !b.body.includes(HOLD_GATE));
}

console.log('\n── ⑦ 판정이 복제돼 있지 않다 (정본은 class-window.mjs 하나) ──');
/* ⚠️ 같은 판정이 두 곳에 있으면 한쪽만 고쳐진다 — 이 저장소가 반복해서 밟은 함정. */
ok('deploy.yml 이 스스로 KST 시각을 재서 판정하지 않는다',
   !/TZ=Asia\/Seoul/.test(YML) && !/date\s+-u?\s*\+%H/.test(YML));
ok('deploy.yml 이 판정 정본 스크립트를 부른다',
   /node \.github\/scripts\/class-window\.mjs/.test(YML));

console.log('\n── ⑧ 우회 입력이 실제로 배선돼 있다 ──');
ok('workflow_dispatch 에 force_now 입력이 선언돼 있다', /force_now:/.test(YML));
ok('판정 step 에 FORCE_NOW 가 넘어간다',
   /FORCE_NOW:\s*\$\{\{\s*github\.event\.inputs\.force_now\s*\}\}/.test(YML));
ok('판정 step 에 커밋 메시지가 넘어간다',
   /COMMIT_MESSAGE:\s*\$\{\{\s*github\.event\.head_commit\.message\s*\}\}/.test(YML));
/* ⛔ 커밋 메시지를 run: 안에 ${{ }} 로 펼치면 셸 주입이 된다. env 로만 넘긴다. */
ok('커밋 메시지를 run: 안에서 펼치지 않는다 (셸 주입 방지)',
   !/run:[\s\S]{0,400}\$\{\{\s*github\.event\.head_commit\.message\s*\}\}/.test(YML));

console.log('\n── ⑨ 종료코드 계약 (node 를 실제로 띄워서) ──');
/* 🔴 두 호출자가 «같은 판정, 다른 신호» 를 원한다.
     · deploy.ps1 — 보류면 «멈춰야» 하므로 종료코드 2 가 필요하다
     · deploy.yml — 판정 step 이 죽으면 뒤의 배포 게이트가 통째로 안 돈다. 항상 0 이어야 한다
   이 둘이 어긋나면 한쪽이 조용히 망가진다. */
const runCli = (iso, args = [], env = {}) =>
    spawnSync(process.execPath, [CLI_PATH, ...args],
        { env: { ...process.env, NOW_ISO: iso, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', ...env }, encoding: 'utf8' });

const IN_WINDOW = '2026-09-01T05:00:00Z';   // 14:00 KST(화) — 새 창(12~16시) 안
const OUT_WINDOW = '2026-09-01T16:30:00Z';  // 01:30 KST — 몰아 배포 시각
ok('--exit-on-hold: 수업 시간대면 종료코드 2', runCli(IN_WINDOW, ['--exit-on-hold']).status === 2);
ok('--exit-on-hold: 수업 시간대가 아니면 종료코드 0', runCli(OUT_WINDOW, ['--exit-on-hold']).status === 0);
ok('--exit-on-hold + FORCE_NOW: 우회하면 종료코드 0',
   runCli(IN_WINDOW, ['--exit-on-hold'], { FORCE_NOW: 'true' }).status === 0);
/* ⛔ 플래그가 없으면(=CI) 보류여도 0 이어야 한다. 여기서 죽으면 배포 게이트가 안 돈다. */
ok('🔴 플래그 없이 부르면 보류여도 종료코드 0 (CI 를 죽이지 않는다)',
   runCli(IN_WINDOW).status === 0 && runCli(OUT_WINDOW).status === 0);

console.log('\n── ⑩ 로컬 deploy.ps1 도 같은 판정을 쓴다 ──');
/* ⚠️ CI 만 막으면 반쪽이다 — deploy.ps1 은 로컬 폴더를 통째로 올리는 «진짜» 배포다. */
ok('deploy.ps1 이 판정 정본을 부른다', /class-window\.mjs/.test(PS1));
ok('deploy.ps1 이 --exit-on-hold 로 부른다', /--exit-on-hold/.test(PS1));
ok('deploy.ps1 이 «보류»(2) 에서 멈춘다',
   /\$cwCode\s+-eq\s+2[\s\S]{0,900}?exit 1/.test(PS1));
ok('deploy.ps1 이 «판정 실패»(0·2 아님) 에서도 멈춘다',
   /\$cwCode\s+-ne\s+0[\s\S]{0,700}?exit 1/.test(PS1));
ok('deploy.ps1 에 우회 스위치 -ForceNow 가 선언돼 있다',
   /param\([^)]*\$ForceNow/.test(PS1));
/* ⛔ -SkipSmoke 로 꺼지면 안 된다 — 급할수록 크게 터지는 게이트다(0b 와 같은 판단). */
ok('게이트가 -ForceNow 만 보고, -SkipSmoke 로는 안 꺼진다',
   /if \(-not \$ForceNow\) \{/.test(PS1));
/* ⛔ 판정을 PowerShell 로 복제하면 «한쪽만 고쳐지는» 그 함정이 그대로 재현된다.
   ⚠️ 이 검사를 「'13:00' 이 파일에 없다」로 쓰면 안 된다 — 안내 문구가 시각을 말한다.
      그래서 «시각을 재서 비교하는가» 로 묻는다. */
ok('deploy.ps1 이 스스로 시각을 재서 판정하지 않는다',
   !/\.Hour\b/.test(PS1) && !/Get-Date[^\n]*-Format\s*'HH'/.test(PS1));
/* 게이트는 파일을 건드리거나 push 하기 «전» 에 와야 한다. */
const psGate = PS1.indexOf('--exit-on-hold');
const psPush = PS1.indexOf('git commit');
const psDeploy = PS1.indexOf('wrangler deploy');
ok('게이트가 git commit·배포보다 앞에 있다',
   psGate > 0 && (psPush < 0 || psGate < psPush) && (psDeploy < 0 || psGate < psDeploy));

console.log(`\n  ${fail ? '❌' : '🎉'} ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
