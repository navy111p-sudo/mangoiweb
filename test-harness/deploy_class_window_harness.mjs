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
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const YML_PATH = join(__dir, '../.github/workflows/deploy.yml');
const YML = readFileSync(YML_PATH, 'utf8');
const CLI_PATH = join(__dir, '../.github/scripts/class-window.mjs');
const PS1 = readFileSync(join(__dir, '../deploy.ps1'), 'utf8');

const W = await import(join(__dir, '../.github/scripts/class-window.mjs'));
const { decideHold, isClassWindow, CLASS_WINDOW_KST, OVERRIDE_TAG } = W;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
};

/** KST 'HH:MM' → 그 시각의 UTC Date (한국은 DST 없음). */
const atKst = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(Date.UTC(2026, 8, 1, h - 9, m, 0));
};

console.log('\n── ① 수업 시간대 판정 (판정 모듈을 실제로 실행) ──');
/* 실측 근거(2026-09-01, 최근 30일 attendance 를 분 단위로): 13:00 부터 늘어 21시가
   정점, 그리고 **23:30–23:50 · 00:00–00:20 · 00:40–01:10 수업이 실재**한다.
   ⛔ 예약표(class_schedules 최대 22:40)만 보고 끝을 잡으면 그 수업들이 통째로 빠진다. */
const CASES = [
    ['01:20', false], ['02:00', false], ['06:00', false], ['11:00', false], ['12:59', false],
    ['13:00', true],  ['14:00', true],  ['17:20', true],  ['21:20', true],
    ['21:43', true],  ['22:40', true],  ['23:20', true],  ['23:35', true],
    ['23:50', true],  ['00:00', true],  ['00:20', true],  ['01:10', true], ['01:19', true],
];
for (const [hhmm, want] of CASES) {
    ok(`${hhmm} KST → ${want ? '보류' : '배포'}`, isClassWindow(atKst(hhmm)) === want);
}
ok(`창의 시작은 포함, 끝은 제외한다 (${CLASS_WINDOW_KST.start} 보류 · ${CLASS_WINDOW_KST.end} 배포)`,
   isClassWindow(atKst(CLASS_WINDOW_KST.start)) === true &&
   isClassWindow(atKst(CLASS_WINDOW_KST.end)) === false);
/* 🔴 창이 자정을 넘는다. `start <= m < end` 로 두면 00:00~01:20 수업이 통째로 빠진다
   (실측 00:00–00:20 만 22건). 되감기가 살아 있는지 여기서 못 박는다. */
ok('🔴 자정을 넘는 창을 되감아 판정한다 (00:00~01:10 도 보류)',
   ['00:00', '00:10', '00:20', '00:50', '01:10'].every(t => isClassWindow(atKst(t)) === true));

/* 🔴 실사고 시각 그대로 — 이 네 번이 김선우 학생 수업(21:15~21:50) 안에서 나갔다. */
for (const t of ['21:38', '21:40', '21:43', '21:46']) {
    ok(`🔴 2026-09-01 실사고 배포 ${t} 이 이제 보류된다`,
       decideHold({ now: atKst(t) }).hold === true);
}

console.log('\n── ② 긴급 우회 ──');
const inWindow = atKst('21:43');
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
ok('몰아 배포 크론이 있다', crons.length >= 1, JSON.stringify(crons));
for (const c of crons) {
    const [mm, hh] = c.split(/\s+/);
    ok(`크론 '${c}' 은 수업 시간대가 아니다 (판정을 그 시각으로 실제로 돌림)`,
       /^\d+$/.test(mm) && /^\d+$/.test(hh) &&
       decideHold({ now: new Date(Date.UTC(2026, 8, 1, Number(hh), Number(mm))) }).hold === false,
       '창 안이면 보류된 배포가 영영 안 나간다');
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

const IN_WINDOW = '2026-09-01T12:43:57Z';   // 21:43 KST — 실사고 배포 시각
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
