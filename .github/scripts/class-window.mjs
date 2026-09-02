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
// ── 창을 왜 «화·목 14:00–23:00» 으로 잡았나 ──────────────────────────────
// 2026-09-02 사장님 지시: 「배포가 안 나가는 건 화요일과 목요일만 오후 2시부터 11시까지.
// 이때만 우리가 테스트 수업을 해.」
//
// ✅ 시간대(14:00~23:00)는 실측과 맞는다 — 앞으로 잡힌 수업(class_schedules, 2026-09-02~)의
//    시작 시각이 화 14:00~21:50 · 목 14:00~21:50 이고, 가장 늦게 끝나는 것이 22:50 이다.
//
// 🔴 **요일은 실측과 다르다. 그래도 화·목으로 둔다 — 사장님이 확인하고 정하셨다.**
//    같은 실측에서 앞으로 잡힌 수업은 목 45 · **수 40** · 화 30 · 금 7 · 월 5 건이고,
//    토·일만 0건이다. 수요일 40건은 전부 `source='c24-mirror'` — 카페24 미러를 켜면서
//    카페24 수업이 망고아이 화상방으로 들어온 것이고, 미러 수업에 실제 접속이 남은 것도
//    확인했다(2026-09-01 `class-1046`).
//    ⟹ **수·금·월 수업은 이 «창» 이 보호하지 않는다.** 「다른 날은 수업이 없다」가 아니라
//       「그날은 창으로 막지 않는다」가 지금의 결정이다.
//    ⛔ 이 사실을 «수업이 없다» 로 바꿔 적지 말 것. 나중에 이 줄을 읽고 «그럼 안전하겠네» 로
//       넘어가면, 수요일에 수업이 끊긴 이유를 아무도 못 찾는다.
//    🔴 **아래 «실접속 판정»(reason: live-class)은 지금 «잠들어 있다» — 이 창이 전부다.**
//       그 판정은 요일·시각과 무관하게 «지금 화상방에 사람이 있으면» 보류하도록 짜여 있지만,
//       **CI 토큰에 D1 읽기 권한이 없어 매번 `http-403` 으로 통과한다**(2026-09-02 실측 —
//       배포 run 33597528051 로그: 「⚠️ 실접속 확인 실패(http-403)」).
//       ⟹ 그래서 **오늘 실제로 막히는 것은 화·목 14:00~23:00 하나뿐**이다.
//       ⛔ 이것을 «수·금·월도 보호된다» 로 바꿔 적지 말 것. 지금은 사실이 아니다.
//
//    ⚠️ **그리고 그것을 깨우는 것은 «사장님이 정할 일» 이다.** 2026-09-02 지시는
//       「배포 멈추는 것은 화·목 14~23시만 — 그때가 테스트 수업이라 수업의 질을 위해」였다.
//       실접속 판정이 깨어나면 **수·금·월에도 배포가 막히기 시작해 그 지시를 벗어난다.**
//       ⛔ 그러니 «고장났으니 고쳐야지» 하고 D1 권한을 추가하지 말 것 — 그 순간 정책이 바뀐다.
//       ✅ 깨우는 법(정책을 바꾸기로 결정했을 때만): Cloudflare API 토큰에
//          `Account · D1 · Read` 권한을 더한다. 그러면 다음 배포부터 위 403 줄이 사라진다.
//       📜 코드를 지우지 않고 남겨 둔 이유: 「테스트 수업을 다른 요일에도 한다」가 되면
//          그때 권한 한 줄로 되살릴 수 있고, 판정·검사가 이미 다 갖춰져 있다
//          (test-harness/deploy_class_guard_harness.mjs 42종).
//
// 📜 처음(2026-09-01)에는 «매일 13:00~01:20» 이었다. 그때는 카페24 예약(`c24-*`)까지 함께
//    세어 창을 잡았는데, 그 방들은 우리 워커의 DO 를 안 쓴다(CLAUDE.md 0장).
//    🔢 그 차이를 숫자로 재 두면(2026-09-02, 최근 30일 attendance): 전체 4,666행 중
//       **3,747행이 씨앗**(`last_seen_at` 이 빈 예약 껍데기 = 화상방에 접속한 적 없음)이다.
//       실접속만 세면 13시 **10**건(씨앗 포함 46) · 23시 **4**건(51) · 0시 **13**건(34) 뿐이라,
//       옛 창의 «끝을 01:20 까지» 는 실제보다 넓었다.
//    ⛔ 창을 다시 넓히려고 접속을 셀 때는 **반드시 `WHERE last_seen_at > 0`** 을 걸 것.
//       그것이 이 저장소가 못 박아 둔 «씨앗과 실접속을 가르는 유일하게 확실한 표시» 다. 요일·시간을
//    좁히면서 배포 가능한 시간이 하루 11시간 40분 → 주 5일 전면 + 화·목도 15시간으로 늘었다.
//
// ⚠️ 요일은 **KST 기준**이다(UTC 로 재면 하루가 밀린다).
//
// ⚠️ 창을 바꾸면 **deploy.yml 의 schedule 도 함께** 봐야 한다 — 아래 ⛔ 참고.
//
// ⛔ **몰아 배포 크론은 반드시 이 창 «밖» 이어야 한다.** 창 안이면 보류된 배포를 내보내려던
//    그 실행마저 스스로 보류해 **배포가 영영 안 나간다.** 그 계약은
//    test-harness/deploy_class_window_harness.mjs ④ 가 실제로 돌려서 못 박는다.
//    ⚠️ 크론은 매일 도니 «요일» 은 상관없다 — 시각만 창 밖이면 된다.
//
// ⛔ 이 판정을 deploy.yml 안에 다시 적지 말 것. 이 저장소는 «같은 판정이 두 곳에 있으면
//    한쪽만 고쳐진다» 를 반복해서 밟았다(CLAUDE.md 2장). 정본은 이 파일 하나다.
//
// ⛔ 같은 이유로 **몰아 배포 «시각» 과 창 «시각» 을 안내 문구에 베껴 적지 말 것.**
//    그 목록의 정본은 deploy.yml 의 schedule 하나, 창의 정본은 이 파일의 상수 하나다.
//    2026-09-01 에 크론만 옮기고 안내 문구가 옛 시각으로 남아 «언제 나가는지» 를 거짓으로
//    말한 적이 있다(#721). 사람에게 보여 주는 글은 「창이 닫힌 뒤」까지만 말한다.

// ⛔ 예약표(class_schedules)만 보고 창을 정하지 말 것 — 2026-09-01 에 그렇게 잡았다가
//    실제 접속을 분 단위로 세어 보니 예약표에 없는 늦은 수업이 실재했다(CLAUDE.md 2장).
//
// 실행(CLI): node .github/scripts/class-window.mjs [--exit-on-hold]
//   읽는 환경변수 — FORCE_NOW('true' 면 우회) · COMMIT_MESSAGE · NOW_ISO(시험용)
//   쓰는 곳 — $GITHUB_OUTPUT(hold/reason/kst) · $GITHUB_STEP_SUMMARY
//   `--exit-on-hold` — 보류면 종료코드 **2**. 로컬 deploy.ps1 이 이걸로 읽는다.
//     ⛔ 기본은 항상 0 이다 — GitHub Actions 의 판정 step 은 «실패» 가 아니라
//        «보류» 를 알리는 자리이고, 거기서 죽으면 뒤의 배포 게이트가 통째로 안 돈다.
//     ⚠️ 「판정 실패」와 「보류」가 같은 코드가 되면 안 된다 — 2 는 오직 보류다.
//        예외로 죽으면 1 이 되고, 부르는 쪽(deploy.ps1)이 그 둘을 갈라 읽는다.

/** 수업 시간대(KST). «끝» 은 포함하지 않는다 — 23:00 은 창 밖이다.
 *  `days` 는 KST 요일(0=일 … 6=토). 그 요일이 아니면 하루 종일 창 밖이다. */
export const CLASS_WINDOW_KST = Object.freeze({
    start: '14:00',
    end: '23:00',
    days: Object.freeze([2, 4]),   // 화 · 목
    daysLabel: '화·목',
});

/** 긴급 배포 우회 표시. 커밋 메시지(=PR 제목)에 이 글자가 있으면 창 안이어도 나간다. */
export const OVERRIDE_TAG = '[deploy-now]';

const toMin = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
};

/** UTC Date → KST 로 옮긴 Date. ⚠️ 러너의 TZ 설정에 기대지 않는다(한국은 DST 없음). */
const toKst = (date) => new Date(date.getTime() + 9 * 3600 * 1000);

/** UTC Date → 그 순간의 KST «하루 중 분». */
export function kstMinutes(date) {
    const d = toKst(date);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** UTC Date → 그 순간의 KST 요일(0=일 … 6=토). */
export function kstDay(date) {
    return toKst(date).getUTCDay();
}

/** 사람이 읽을 KST 시각 문자열. */
export function kstLabel(date) {
    const d = toKst(date);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} KST`;
}

/** 지금이 수업 시간대인가.
 *  ⚠️ 요일부터 본다 — 화·목이 아니면 하루 종일 창 밖이다.
 *  ⚠️ 되감김(끝 < 시작)도 그대로 남겨 둔다. 지금 창은 자정을 안 넘지만, 나중에 시간대를
 *     넓혔을 때 `start <= m < end` 만 두면 자정 뒤가 통째로 빠진다(2026-09-01 에 실제로
 *     그 실수를 했다 — 00:00~00:20 수업이 22건 있었다). ⚠️ 다만 자정을 넘기게 바꾸면
 *     «어느 요일로 세느냐» 가 새로 생긴다 — 지금은 «시작 시각의 요일» 기준이다. */
export function isClassWindow(date) {
    if (!CLASS_WINDOW_KST.days.includes(kstDay(date))) return false;
    const m = kstMinutes(date);
    const a = toMin(CLASS_WINDOW_KST.start), b = toMin(CLASS_WINDOW_KST.end);
    return (a <= b) ? (m >= a && m < b) : (m >= a || m < b);
}

/* ── 지금 화상방에 «사람이 있나» (실접속 판정) ──────────────────────────────
 *  🔴 창(화·목 14:00~23:00)만으로는 월·수·금 수업 449건이 배포에 노출된다.
 *     그 구멍을 메우는 것이 이 판정이다 — 요일·시각과 무관하게 «지금 방에 사람이
 *     들어와 있으면» 보류한다. 사장님이 말씀하신 「mangoi.ai 에서 테스트 수업할 때」가
 *     정확히 이 자리다(테스트 수업은 오전에도 한다).
 *
 *  [무엇을 근거로 «지금 수업 중» 이라 하나]
 *    `attendance.last_seen_at` = **서버 시각 하트비트**. 화상방에 들어와 있는 브라우저가
 *    30초마다 /api/speaking-time 을 보내고(js/mango-attendance.js), 서버가 그 요청이
 *    «도착한 시각» 을 찍는다(src/api-mango.ts). 클라이언트가 보내는 값이 아니라
 *    서버 시각이라 위조도 과다계상도 안 된다.
 *  ⛔ 카페24 예약(class_schedules)이나 카페24가 밀어넣은 attendance 씨앗으로 판정하지
 *     말 것 — 그건 «오늘 수업이 잡혀 있다» 이지 «지금 사람이 들어와 있다» 가 아니다.
 *     씨앗 행은 last_seen_at 이 비어 있고(30일 4,666행 중 3,747행), 이 저장소는 이미
 *     「last_seen_at > 0 이 씨앗과 실접속을 가르는 유일하게 확실한 표시」라고 못 박아
 *     두었다(src/api-admin.ts). 카페24 수업은 우리 DO 를 안 거치니 배포해도 안 끊긴다.
 *  ⚠️ 3분 창을 쓰는 이유: 하트비트가 30초 주기라 한두 번 놓쳐도 잡히게. 좁히면
 *     «수업 중인데 통과» 가 나고, 넓히면 «끝난 수업이 계속 막는다».
 *  ⚠️ left_at 이 찍힌 행은 «정상 퇴장» 이라 뺀다. 반대로 left_at 이 비었는데 하트비트가
 *     싱싱하면 «아직 앉아 있다» 로 본다 — 휴대폰은 끊길 때 leave 를 못 보내므로
 *     모르는 쪽은 «있다» 로 세는 것이 안전한 방향이다.
 */

/** 하트비트를 «싱싱하다» 고 볼 시간(ms). 하트비트 주기(30초)의 여섯 배. */
export const LIVE_WINDOW_MS = 3 * 60 * 1000;

/** 지금 화상방에 붙어 있는 사람 수. `?1` 은 «이 시각 이후» 커트라인(ms). */
export const LIVE_CLASS_SQL =
    'SELECT COUNT(*) AS live, COUNT(DISTINCT room_id) AS rooms FROM attendance ' +
    'WHERE left_at IS NULL AND last_seen_at >= CAST(?1 AS INTEGER)';
/* ⚠️ CAST 를 빼지 말 것 — 파라미터가 문자열로 실려도 «문자열 대 정수» 비교가 되지
   않게 못 박는다. 이 한 줄이 없으면 어떤 경로에서는 조용히 0명이 나온다. */

/** wrangler.toml 에서 account_id · mango-db 의 database_id 를 읽는다.
 *  ⛔ 여기에 숫자를 복사해 두지 말 것 — 정본은 wrangler.toml 하나다. */
export function readCfIds(tomlText) {
    const account = (tomlText.match(/^\s*account_id\s*=\s*"([^"]+)"/m) || [])[1] || '';
    const block = tomlText.match(/database_name\s*=\s*"mango-db"[\s\S]{0,200}?database_id\s*=\s*"([^"]+)"/)
        || tomlText.match(/database_id\s*=\s*"([^"]+)"[\s\S]{0,200}?database_name\s*=\s*"mango-db"/);
    return { accountId: account, databaseId: (block || [])[1] || '' };
}

/**
 * D1 에 «지금 몇 명이 붙어 있나» 를 물어본다.
 * ⚠️ **막지 않는 쪽으로 실패한다.** 토큰이 없거나·권한이 없거나·D1 이 흔들리면
 *    `{ ok:false, live:0 }` 을 돌려준다. 「수업 없음」이 아니라 「모름」이고,
 *    고장 난 감시견이 모든 배포를 영구히 막는 쪽이 더 나쁘다(급한 수정도 못 나간다).
 *    ⛔ 그 «통과» 를 조용히 하지 말 것 — 부르는 쪽이 반드시 크게 남긴다.
 * ⚠️ 그리고 **배포를 «멎게» 하면 안 된다** — 타임아웃을 반드시 건다.
 */
export async function probeLiveClass({
    now = new Date(), token = '', accountId = '', databaseId = '',
    fetchImpl = globalThis.fetch, timeoutMs = 8000,
} = {}) {
    if (!token || !accountId || !databaseId) {
        return { ok: false, live: 0, rooms: 0, error: 'no-credentials' };
    }
    const cutoff = now.getTime() - LIVE_WINDOW_MS;
    try {
        const res = await fetchImpl(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ sql: LIVE_CLASS_SQL, params: [String(cutoff)] }),
                signal: AbortSignal.timeout(timeoutMs),
            });
        if (!res.ok) return { ok: false, live: 0, rooms: 0, error: `http-${res.status}` };
        const body = await res.json();
        const row = body?.result?.[0]?.results?.[0];
        if (!row || typeof row.live !== 'number') {
            return { ok: false, live: 0, rooms: 0, error: 'unexpected-shape' };
        }
        return { ok: true, live: row.live, rooms: row.rooms || 0, error: '' };
    } catch (e) {
        return { ok: false, live: 0, rooms: 0, error: String(e && e.name || e) };
    }
}

/**
 * 배포를 보류할지 판정한다.
 * ⚠️ 우회를 «먼저» 본다 — 급한 수정은 언제든 나가야 한다.
 * @returns {{hold:boolean, reason:string, why:string, kst:string}}
 */
export function decideHold({ now = new Date(), force = false, commitMessage = '', live = 0 } = {}) {
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
            why: `수업 시간대(${CLASS_WINDOW_KST.daysLabel} ${CLASS_WINDOW_KST.start}~${CLASS_WINDOW_KST.end} KST)입니다`,
            kst,
        };
    }
    /* 🔴 창 밖이어도 «지금 방에 사람이 있으면» 막는다.
       요일을 화·목으로 좁힌 대가를 메우는 자리다(위 «실접속 판정» 블록). */
    if (Number(live) > 0) {
        return {
            hold: true,
            reason: 'live-class',
            why: `수업 시간대는 아니지만 지금 화상방에 ${live}명이 들어와 있습니다`,
            kst,
        };
    }
    return { hold: false, reason: 'outside-window', why: '수업 시간대가 아닙니다', kst };
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    const { appendFileSync, readFileSync } = await import('node:fs');
    const now = process.env.NOW_ISO ? new Date(process.env.NOW_ISO) : new Date();

    /* 실접속은 «창이 이미 막고 있지 않을 때» 만 물어본다.
       ⚠️ 순서를 뒤집지 말 것 — 창 안이면 어차피 보류라 D1 을 부를 이유가 없고,
          부르면 배포마다 쓸데없는 왕복이 생긴다. 그리고 우회(force/커밋표시)는
          decideHold 가 «맨 먼저» 보므로, 급한 배포가 이 조회를 기다리지 않는다. */
    let probe = { ok: false, live: 0, rooms: 0, error: 'skipped' };
    const forced = String(process.env.FORCE_NOW || '').toLowerCase() === 'true'
        || String(process.env.COMMIT_MESSAGE || '').includes(OVERRIDE_TAG);
    if (!forced && !isClassWindow(now) && process.env.SKIP_LIVE_PROBE !== '1') {
        let ids = { accountId: '', databaseId: '' };
        try {
            ids = readCfIds(readFileSync(new URL('../../cloudflare-deploy/wrangler.toml', import.meta.url), 'utf8'));
        } catch (e) { ids = { accountId: '', databaseId: '' }; }
        probe = await probeLiveClass({
            now,
            token: process.env.CLOUDFLARE_API_TOKEN || '',
            accountId: process.env.CLOUDFLARE_ACCOUNT_ID || ids.accountId,
            databaseId: ids.databaseId,
        });
    }

    const d = decideHold({
        now,
        force: process.env.FORCE_NOW,
        commitMessage: process.env.COMMIT_MESSAGE || '',
        live: probe.live,
    });

    console.log(`${d.kst} → hold=${d.hold} (${d.reason}) — ${d.why}`);
    if (probe.error && probe.error !== 'skipped') {
        /* ⛔ 조용히 넘기지 않는다 — 「수업 없음」이 아니라 「모름」이다. */
        console.log(`⚠️ 실접속 확인 실패(${probe.error}) — 막지 않고 진행합니다. 지금 수업이 있었다면 그 수업은 끊깁니다.`);
        if (process.env.GITHUB_STEP_SUMMARY) {
            appendFileSync(process.env.GITHUB_STEP_SUMMARY,
                `> ⚠️ 화상방 실접속을 확인하지 못했습니다(\`${probe.error}\`). 시간대 판정만으로 진행합니다.\n\n`);
        }
    }


    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `hold=${d.hold}\nreason=${d.reason}\nkst=${d.kst}\n`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        const lines = (d.hold && d.reason === 'live-class')
            ? [
                '### ⏸ 지금 화상방에 사람이 있어 배포를 보류했습니다',
                '',
                `- 지금: **${d.kst}** — 수업 시간대(${CLASS_WINDOW_KST.daysLabel} ${CLASS_WINDOW_KST.start}~${CLASS_WINDOW_KST.end} KST)는 아니지만 **${probe.live}명**이 ${probe.rooms}개 방에 들어와 있습니다.`,
                '- 게이트(tsc·회귀 하니스·?v=)는 **그대로 돌았습니다.** 건너뛴 것은 Cloudflare 배포뿐입니다.',
                '- 이 커밋은 **다음 몰아 배포**에 자동으로 실려 나갑니다.',
                '',
                '**왜 막나** — 배포하면 화상수업 Durable Object 가 재시작되어 그 방들의 연결이 끊깁니다.',
                '판정 근거는 `attendance.last_seen_at`(화상방 브라우저가 30초마다 보내는 서버 시각 하트비트)이고,',
                '카페24 예약 씨앗은 세지 않습니다 — 그 수업은 우리 화상방을 안 거칩니다.',
                '',
                '**지금 당장 내보내야 하면** — `force_now` 수동 실행 또는 커밋 메시지에 `' + OVERRIDE_TAG + '`',
            ]
            : d.hold
            ? [
                '### ⏸ 수업 시간대라 배포를 보류했습니다',
                '',
                `- 지금: **${d.kst}** · 수업 시간대 **${CLASS_WINDOW_KST.daysLabel} ${CLASS_WINDOW_KST.start}~${CLASS_WINDOW_KST.end} KST**`,
                '- 게이트(tsc·회귀 하니스·?v=)는 **그대로 돌았습니다.** 건너뛴 것은 Cloudflare 배포뿐입니다.',
                '- 이 커밋은 **창이 끝난 뒤 몰아 배포**(새벽~오전에 네 번 시도)에 자동으로 실려 나갑니다. 따로 하실 일은 없습니다.',
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
                `- 지금: **${d.kst}** — ${d.why} (수업 시간대는 ${CLASS_WINDOW_KST.daysLabel} ${CLASS_WINDOW_KST.start}~${CLASS_WINDOW_KST.end} KST)`,
                `- 화상방 실접속: ${probe.ok ? `**${probe.live}명**` : '확인 안 함/못 함'}`,
            ];
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n\n');
    }

    /* 종료코드로 알려 달라는 호출자(=deploy.ps1)에게만 2 를 준다.
       ⚠️ 「판정 실패」와 「보류」가 같은 코드가 되면 안 된다 — 2 는 오직 보류다.
          그래서 예외(파일 깨짐 등)로 죽으면 1 이 되고, 부르는 쪽이 갈라 읽는다. */
    if (process.argv.includes('--exit-on-hold')) process.exit(d.hold ? 2 : 0);
}
