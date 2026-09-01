// class-window.mjs — «지금 수업 시간대인가» 판정 정본 (2026-09-01)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 2026-09-01 김선우 학생(21:20 KRYSTEL, class-1078-20260901) 수업이 «대화가 이어지지
// 않을» 만큼 끊겼다. 원인을 재 보니 학생 업링크가 주였지만, 그 위에 **우리가 얹은 몫**
// 이 있었다 — 그날 19:33~22:06 사이 운영 워커를 **22번** 재배포했고, 김선우 수업
// (21:15~21:50) 안에만 4번(21:38:03 · 21:40:25 · 21:43:57 · 21:46:35)이었다.
//
// 배포하면 화상수업 Durable Object(VideoCallRoom)가 재시작되어 그 방의 WebSocket 이
// 전부 끊긴다. 실측으로 21:43:57 배포 **8초 뒤** class-1070 강사, **37초 뒤**
// class-1078 강사(Krystel)가 동시에 끊겼고, class-996 Teacher Kaye 는 21:31~21:41 에
// 네 번 끊겨 녹화가 4:03 / 3:18 / 0:18 로 토막났다.
//
// 게다가 DO 가 죽으면 `user-left` 를 방송할 상대가 이미 없어서, 상대 화면에는 옛 타일이
// **유령 참가자**로 남는다(video-call-room.ts 의 유령 청소는 «살아 있는 옛 소켓» 을
// 찾아 닫는 방식이라 DO 자체가 재시작되면 찾을 소켓이 없다). 그날 녹화 참가자 목록에
// 1:1 수업인데 class-1078 **3명**, class-1086 **5명**, class-988·996 3명이 잡혔다.
// 유령 타일은 고착 워치독이 진짜 사람으로 오판해 강제 재연결을 걸고, mesh 라 그때마다
// 전원의 업로드가 흔들린다(CLAUDE.md 2장 「왜 3명이 나와?」).
//
// ⚠️ 위 «배포 → DO 재시작 → 유령» 사슬은 코드를 읽고 세운 추론이다. 배포 시각과 끊긴
//    시각이 30초 안팎으로 겹친 것은 실측이지만, 그 배포가 그 유령을 만들었다는 것을
//    로그로 직접 잇지는 못했다. 완료형으로 적지 말 것(CLAUDE.md 2장).
//
// ── 창을 왜 13:00–01:20 으로 잡았나 (2026-09-01 D1 실측, 최근 30일 attendance) ──
//   접속 건수(KST 시): 13시 45 · 14시 197 · 15시 426 · 16시 487 · 17시 502 · 18시 366
//                     19시 546 · 20시 704 · 21시 774 · 22시 281 · 23시 48 · 0시 35
//   ⚠️ **끝을 예약표(class_schedules 최대 22:40)로 잡으면 틀린다.** 실제 접속을 분(分)
//      단위로 세니 수업이 훨씬 늦게까지 있었다 —
//        23:00–23:20(28) · 23:10–23:30(4) · 23:20–23:40(10) · 23:30–23:50(4)
//        **00:00–00:20(22)** · 00:40–01:10(3)
//      처음에 23:30 을 끝으로 잡았다가, 그러면 몰아 배포(23:35)가 23:20–23:40 수업
//      **한복판**에 떨어진다는 것을 이 실측으로 알았다. 고치려던 사고를 그대로 재현할
//      뻔했다. ⛔ 예약표만 보고 창을 정하지 말 것 — 접속을 분 단위로 셀 것.
//   ⟹ 진짜 수업(카페24 예약)은 1시 이후 **0건**이다(1~5시 접속은 전부 연습방·데모).
//      마지막 수업이 01:10 에 끝나므로 여유 10분을 두어 01:20 을 끝으로 잡았다.
//   ⟹ 배포 가능 시간이 하루 11시간 40분(01:20~13:00) 남는다.
//
// ⚠️ 이 숫자는 **오늘 기준**이다. 수업 시간대가 바뀌면 아래 상수 한 줄만 고치면 되고,
//    그때 몰아 배포 크론(deploy.yml 의 schedule)도 함께 봐야 한다 — 아래 ⛔ 참고.
//
// ⛔ **몰아 배포 크론은 반드시 이 창 «밖» 이어야 한다.** 창 안이면 보류된 배포를 내보내려던
//    그 실행마저 스스로 보류해 **배포가 영영 안 나간다.** 그 계약은
//    test-harness/deploy_class_window_harness.mjs ④ 가 실제로 돌려서 못 박는다.
//
// ⛔ 이 판정을 deploy.yml 안에 다시 적지 말 것. 이 저장소는 «같은 판정이 두 곳에 있으면
//    한쪽만 고쳐진다» 를 반복해서 밟았다(CLAUDE.md 2장). 정본은 이 파일 하나다.
//
// 실행(CLI): node .github/scripts/class-window.mjs
//   읽는 환경변수 — FORCE_NOW('true' 면 우회) · COMMIT_MESSAGE · NOW_ISO(시험용)
//   쓰는 곳 — $GITHUB_OUTPUT(hold/reason/kst) · $GITHUB_STEP_SUMMARY

/** 수업 시간대(KST). «끝» 은 포함하지 않는다 — 01:20 은 창 밖이다.
 *  ⚠️ 자정을 넘는다(13:00 → 다음날 01:20). isClassWindow 가 그 되감김을 처리한다. */
export const CLASS_WINDOW_KST = Object.freeze({ start: '13:00', end: '01:20' });

/** 긴급 배포 우회 표시. 커밋 메시지(=PR 제목)에 이 글자가 있으면 창 안이어도 나간다. */
export const OVERRIDE_TAG = '[deploy-now]';

const toMin = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
};

/** UTC Date → 그 순간의 KST «하루 중 분». ⚠️ 러너의 TZ 설정에 기대지 않는다(한국은 DST 없음). */
export function kstMinutes(date) {
    const d = new Date(date.getTime() + 9 * 3600 * 1000);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** 사람이 읽을 KST 시각 문자열. */
export function kstLabel(date) {
    const d = new Date(date.getTime() + 9 * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} KST`;
}

/** 지금이 수업 시간대인가. 요일은 가르지 않는다 — 카페24 예약은 주말에도 있다.
 *  ⚠️ 창이 자정을 넘으므로(끝 < 시작) 되감아 판정한다. 단순 `start <= m < end` 로
 *     두면 13:00~24:00 만 걸리고 **00:00~01:20 수업이 통째로 빠진다**(실측 22건+). */
export function isClassWindow(date) {
    const m = kstMinutes(date);
    const a = toMin(CLASS_WINDOW_KST.start), b = toMin(CLASS_WINDOW_KST.end);
    return (a <= b) ? (m >= a && m < b) : (m >= a || m < b);
}

/**
 * 배포를 보류할지 판정한다.
 * ⚠️ 우회를 «먼저» 본다 — 급한 수정은 언제든 나가야 한다.
 * @returns {{hold:boolean, reason:string, why:string, kst:string}}
 */
export function decideHold({ now = new Date(), force = false, commitMessage = '' } = {}) {
    const kst = kstLabel(now);
    if (force === true || String(force).toLowerCase() === 'true') {
        return { hold: false, reason: 'forced', why: '수동 실행에서 force_now 를 켰습니다', kst };
    }
    if (String(commitMessage).includes(OVERRIDE_TAG)) {
        return { hold: false, reason: 'commit-override', why: `커밋 메시지에 ${OVERRIDE_TAG} 가 있습니다`, kst };
    }
    if (isClassWindow(now)) {
        return {
            hold: true,
            reason: 'class-window',
            why: `수업 시간대(${CLASS_WINDOW_KST.start}~${CLASS_WINDOW_KST.end} KST)입니다`,
            kst,
        };
    }
    return { hold: false, reason: 'outside-window', why: '수업 시간대가 아닙니다', kst };
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    const { appendFileSync } = await import('node:fs');
    const now = process.env.NOW_ISO ? new Date(process.env.NOW_ISO) : new Date();
    const d = decideHold({
        now,
        force: process.env.FORCE_NOW,
        commitMessage: process.env.COMMIT_MESSAGE || '',
    });

    console.log(`${d.kst} → hold=${d.hold} (${d.reason}) — ${d.why}`);

    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `hold=${d.hold}\nreason=${d.reason}\nkst=${d.kst}\n`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        const lines = d.hold
            ? [
                '### ⏸ 수업 시간대라 배포를 보류했습니다',
                '',
                `- 지금: **${d.kst}** · 수업 시간대 **${CLASS_WINDOW_KST.start}~${CLASS_WINDOW_KST.end} KST**`,
                '- 게이트(tsc·회귀 하니스·?v=)는 **그대로 돌았습니다.** 건너뛴 것은 Cloudflare 배포뿐입니다.',
                `- 이 커밋은 **다음 01:30 KST 몰아 배포**에 자동으로 실려 나갑니다. 따로 하실 일은 없습니다.`,
                '',
                '**왜 막나** — 배포하면 화상수업 Durable Object 가 재시작되어 진행 중인 수업의 연결이 끊깁니다.',
                '2026-09-01 실측: 21:43:57 배포 **8초 뒤** `class-1070` 강사, **37초 뒤** `class-1078` 강사(Krystel)가 동시에 끊겼습니다.',
                '',
                '**지금 당장 내보내야 하면** (장애 수정 등) 둘 중 하나:',
                '',
                '1. Actions → 이 워크플로 → **Run workflow** → `force_now` 를 `true` 로',
                `2. 커밋 메시지(=PR 제목)에 \`${OVERRIDE_TAG}\` 를 넣어 다시 push`,
            ]
            : [
                '### ✅ 배포 시간대 확인',
                '',
                `- 지금: **${d.kst}** — ${d.why} (수업 시간대는 ${CLASS_WINDOW_KST.start}~${CLASS_WINDOW_KST.end} KST)`,
            ];
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n\n');
    }
}
