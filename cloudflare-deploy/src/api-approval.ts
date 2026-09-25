// ────────────────────────────────────────────────────────────────────────────
// 🧾 결재 (기안 · 지출 · 문서) — /api/approval/*
//
// 왜 만들었나 (2026-08-05):
//   구 사이트 그룹웨어 5개 메뉴 중 신규 사이트에 **정말로 없던 것은 이것 하나**다.
//     · 휴가·병가   → 이미 있음(캘린더 + 강사 휴무). 신규 쪽이 오히려 더 낫다
//                     (기록만 하는 게 아니라 그 시간 예약을 실제로 막는다)
//     · 관리 메시지 → 이미 5가지(알림톡·웹푸시·공지·귓속말·알림센터)
//     · 즐겨찾기    → Quick access
//     · 기안·지출 / 결재 파일 → **없음** ← 이 파일
//   그래서 그룹웨어를 «모듈째» 옮기지 않았다. 옮기면 이중이 되고 화면만 무거워진다.
//
// 🆕 2026-08-16 — 다단계 결재 · 자동화 · 열람등급
//   경위: 결재함이 강사 화면(teacher.html 192KB) 안에 있었고, 정작 결재를 가장 많이 올리는
//        필리핀 매니저 전용 화면(manager.html)에는 **결재가 한 줄도 없었다**. 매니저는 결재
//        한 건 올리려고 자기 화면을 나가 10배 무거운 페이지를 받아야 했다.
//        → 초경량 전용 화면 /work 를 신설하고, 이 API 가 그 화면 하나를 채운다.
//   더한 것:
//     ① 다단계 — approval_steps 표. 기존 1단계 건은 «단계가 1개인 결재»로 그대로 산다.
//     ② 자동 점검 — 중복·예산·첨부누락·금액불일치. **계산만 한다. AI 안 쓴다.**
//     ③ 자동 채움 — 영수증 판독(무료 비전 모델만) · 영어 음성 기안 · 한 줄 요약.
//        전부 «초안»이다. 실패해도 직접 입력 경로가 그대로 남아 결재가 멈추지 않는다.
//     ④ 열람등급 — 인사·급여는 경영진만. 예전엔 본사 계정이면 전원이 급여까지 봤다.
//     ⑤ 마감·승격 — 시한을 넘기면 재알림 → 상급자 승격. cron 한도(5/5)가 꽉 차서
//        기존 15분 트리거에 얹는다(index.ts scheduled).
//
// 왜 별도 파일인가:
//   api-admin.ts 는 8,400줄이라 공동작업 충돌 반경이 크다(CLAUDE.md 4-2). 건드리지 않는다.
//   기준값(금액·시한·경영진)은 한 번 더 떼어 approval-policy.ts 에 뒀다 — 운영하다 보면
//   반드시 바뀌는 값이라, 바꿀 때 로직을 읽지 않아도 되게.
//
// 설계 판단:
//   · 표 모양은 이미 운영 중인 schedule_change_requests(연기·변경 요청)를 그대로 따랐다.
//     «올린다 → 대기 → 승인/반려 + 누가 언제 무슨 메모로» 는 검증된 형태다.
//   · 첨부는 textbook-files 와 같은 방식(R2 put + D1 행 + /raw 로 서빙). 새 버킷 안 만든다.
//   · AI 초안 구조는 강사 수업일지(feedback_drafts)의 «초안 → 승인/수정» 을 그대로 따랐다.
//   · ⚠️ D1 은 개발·운영이 **같은 DB** 다(CLAUDE.md 1-1). 그래서 여기서 하는 스키마 작업은
//     CREATE TABLE IF NOT EXISTS 와 ALTER TABLE ADD COLUMN 뿐이다. 지우거나 바꾸지 않는다.
// ────────────────────────────────────────────────────────────────────────────

import { getAdminActor, PH_MANAGERS } from './auth-admin';
import { teacherWhoLabel } from './forbidden-teacher';  // 🪪 거절할 때 «지금 누구로 들어와 있는가»
import { oncePerIsolate } from './once-per-isolate';   // ⚡ 준비 DDL 을 요청마다 반복하지 않게
import { selectInChunks } from './d1-chunk';           // 🔢 IN 목록은 손으로 자르지 않는다(D1 바인드 100 한도)
import { siteUrl } from './site-url';                  // 🔗 사람에게 나가는 링크는 한 곳에서
import {                                               // 💼 인사·급여 «월 확정» — 급여 표는 읽기만 한다
  HR_KINDS, isHrKind, isPeriod, ensureHrTable, getLock, lockPeriod, unlockPeriod, buildHrSnapshot, listHrPeriods,
} from './approval-hr';
import {
  REQ_TYPES, TYPES, typeSpec, stagesFor, deadlineMs, stageDeadlineMs,
  isExec, isHqStaff, canDecideStage, canSubmit, canView, runChecks, normCurrency,
  isPrimaryApprover, isMoneyApprover, allowsStraightThrough, needsExecAck,   // 💳 결재권자 · 전결 · 확인
  blocksSameDecider, sameDeciderBlocked,                     // 🖐 같은 사람 연속 결재 금지
  sniffKind, normExt, contentTypeFor, buildFindQuery,
  CATEGORIES, normCategory, categorySpec, summarizeApprovals, foldHomeMoney, kstMonth,
  STATUSES, statusSpec, countsAsSpend, canWithdraw, canReverse, reverseTitle,
  canDelete, isApprovalFileKey,
  buildArchiveFacets, archivePeriods,                  // 🗂 결재 보관함 — 함 옆 건수·기간 함 경계
  type Stage, type Flag, type ActorLike, type ReceiptItem,
  signalOf, autoRejectMode, autoRejectable,                  // 🚦 신호등 · 자동 반려(2026-09-24)
  pushApproveDenyReason, quickApprovable,                    // 📲 알림에서 바로 승인
  rejectTipsFrom, shadowTally, monthlyRepeats,               // 📋 반려 줄이기 · 🤖 켜기 판단 · 🔁 매달 반복
  autoRejectReadiness, autoRejectModeInput, nudgeSmsKind,   // 🤖 켜기 판단 패널 · 📱 문자로만(9단계)
  digestUrl, weeklySpend, fmt,                         // 📬 요약→묶음 승인 · 📊 주간 지출 합계(10단계)
  isNewVendor, EXEC_WATCH_CODES,
  fileKind, fileDisposition,                           // 📷 카드 안 영수증 사진(12단계)
  ledgerFrom,                                          // 📒 간단 회계장부(12단계)                       // 🏪 처음 보는 가게 · 👀 대표님 즉시 알림 신호(11단계)
  isSha256Hex, historyCard, firstPassRates,                 // 🤖 4단계 — 영수증 재사용 · 결재 전 이력 · 첫 통과율
  nudgePlan, stageStartOf, nudgeLevel, isQuietKst, digestSlotKst,   // ⏰ 알림 단계 · 하루 두 번 요약
  monthlySlotKst, kstMonthRange, monthlyReportLines,   // 📅 월초 요약(5단계)
  askCard, spendTypesCsv,                              // ❓ 결재 전 질문(6단계)
  normPhotoQuality,                                    // 📷 사진 흐림·어두움(7단계)
  normReceiptItems, receiptBody, guessCategory,        // 🧾 영수증 품목 → 내용·항목(8단계)
  EXEC_USERNAMES, MONEY_APPROVERS,
} from './approval-policy';
import { broadcastWebPush } from './web-push';                // 🔔 대기열에 넣은 뒤 «기기를 깨운다»

interface ApprovalEnv {
  DB: D1Database;
  RECORDINGS?: R2Bucket;
  AI?: any;
  [k: string]: any;
}

/* 📊 지출 정리가 한 번에 세는 최대 행 수.
   canView 로 걸러야 해서 SQL 집계를 못 쓰므로 «읽어서 센다» — 그 상한이다.
   ⚠️ 올릴 때는 D1 응답 크기와 Worker CPU 를 함께 보세요(지금 결재는 3건이라
      한참 여유가 있고, 넘치면 화면이 «잘렸다» 고 말합니다). */
const REPORT_MAX = 2000;

const json = (data: any, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const MAX_FILE = 10 * 1024 * 1024;                                  // 10MB — 결재 첨부는 영수증·문서 한 장
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
const MAX_OCR_BYTES = 3_000_000;                                    // 비전 모델 입력 상한 (wb-ocr 과 동일)
const MAX_AUDIO_BYTES = 8_000_000;                                  // 음성 기안 — 30초 남짓

/** 필리핀 매니저인가. 결재선 판정에 쓴다(정본은 auth-admin.PH_MANAGERS). */
function isPhManager(actor: ActorLike): boolean {
  return PH_MANAGERS.indexOf(String(actor?.username || '').toLowerCase()) >= 0;
}

/* 첨부 형식 판정(sniffKind·normExt)은 approval-policy.ts 에 있다 —
   순수 함수라 회귀 하니스가 가짜 바이트로 직접 돌려볼 수 있게 하려고 그쪽에 뒀다. */

/* ═══════════════════════════════════════════════════════════════════════════
 * 스키마 — 새 표는 만들고, 기존 표에는 «칸만 더한다». 지우거나 바꾸지 않는다.
 * ═════════════════════════════════════════════════════════════════════════ */

let tableReady = false;
const ensureTable = oncePerIsolate(async (env: ApprovalEnv): Promise<void> => {
  if (tableReady) return;
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS approval_requests (` +
    `id INTEGER PRIMARY KEY AUTOINCREMENT, ` +
    `req_type TEXT NOT NULL DEFAULT 'expense', ` +
    `requester_username TEXT NOT NULL, requester_name TEXT, ` +
    `title TEXT NOT NULL, body TEXT, category TEXT, ` +
    `amount REAL, currency TEXT DEFAULT 'PHP', spent_at TEXT, ` +
    `file_key TEXT, file_name TEXT, file_ext TEXT, file_size INTEGER, ` +
    `status TEXT NOT NULL DEFAULT 'pending', ` +
    `decided_by TEXT, decided_at INTEGER, decide_memo TEXT, ` +
    `created_at INTEGER NOT NULL)`
  );
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_appr_status ON approval_requests(status, created_at)`); } catch { /* 있으면 그만 */ }
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_appr_user ON approval_requests(requester_username, created_at)`); } catch { /* 있으면 그만 */ }
  // 🔁 「이어받아 다시 올린 건」 조회(has_child · 삭제 게이트)가 origin_id 로 건다.
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_appr_origin ON approval_requests(origin_id)`); } catch { /* 있으면 그만 */ }

  // 🆕 다단계·자동화용 칸. 이미 있으면 ALTER 가 에러를 내므로 하나씩 삼킨다.
  //    (기존 행은 전부 NULL 로 들어오고, 아래 rowOf() 가 «1단계짜리»로 해석한다.)
  const addCols = [
    `ALTER TABLE approval_requests ADD COLUMN stage_seq INTEGER DEFAULT 1`,
    `ALTER TABLE approval_requests ADD COLUMN stage_total INTEGER DEFAULT 1`,
    `ALTER TABLE approval_requests ADD COLUMN deadline_at INTEGER`,
    `ALTER TABLE approval_requests ADD COLUMN stage_due_at INTEGER`,
    `ALTER TABLE approval_requests ADD COLUMN summary_ko TEXT`,
    `ALTER TABLE approval_requests ADD COLUMN summary_en TEXT`,
    `ALTER TABLE approval_requests ADD COLUMN ocr_amount REAL`,
    `ALTER TABLE approval_requests ADD COLUMN flags TEXT`,
    `ALTER TABLE approval_requests ADD COLUMN warned_at INTEGER`,
    `ALTER TABLE approval_requests ADD COLUMN escalated_at INTEGER`,
    // 🔁 재전송이 «같은 기안을 두 번» 만들지 않게 하는 열쇠. 화면이 만들어 보낸다.
    //    회선이 끊기면 «저장은 됐는데 응답만 못 받은» 경우가 실제로 생긴다 —
    //    그때 다시 보내면 예전에는 지출 결재가 두 건이 됐다. 이제는 같은 건으로 합쳐진다.
    `ALTER TABLE approval_requests ADD COLUMN client_key TEXT`,
    // 🏖️ 휴가 기간. 승인되는 순간 이 값으로 «강사 근무불가» 를 만들어 예약을 막는다.
    `ALTER TABLE approval_requests ADD COLUMN date_from TEXT`,
    `ALTER TABLE approval_requests ADD COLUMN date_to TEXT`,
    // 같은 휴가로 근무불가를 두 번 만들지 않게 하는 표식(연결된 teacher_unavailability.id)
    `ALTER TABLE approval_requests ADD COLUMN linked_id INTEGER`,
    // 💼 인사·급여 «월 확정» — 어느 달의 무엇을 확정하는 결재인가
    `ALTER TABLE approval_requests ADD COLUMN hr_kind TEXT`,
    `ALTER TABLE approval_requests ADD COLUMN period TEXT`,
    /* ↩️ 회수하고 «다시 올린» 건이 가리키는 원본.
       ⚠️ 이게 없으면 「6일째 기다리는 중」이 다시 올리는 순간 «1일째» 로 초기화되어
          지연이 조용히 감춰진다. 화면은 이 값으로 원래 올린 날부터 센다. */
    `ALTER TABLE approval_requests ADD COLUMN origin_id INTEGER`,
    /* 🔁 «취소 결재» 가 가리키는, 무효로 하려는 승인 건 */
    `ALTER TABLE approval_requests ADD COLUMN reverses_id INTEGER`,
    /* 🔁 그 반대 방향 — 취소된 원본이 가리키는, 자기를 취소시킨 결재 */
    `ALTER TABLE approval_requests ADD COLUMN cancelled_by_id INTEGER`,
    /* ✅ 「확인」 — 결재가 아니라 «경영진이 봤다»는 표시(2026-09-09).
       ⚠️ 이 칸이 비어 있다고 «안 봤다»가 아니다 — 큰돈 건은 경영진이 직접 최종 결재하므로
          애초에 확인 대상이 아니다(needsExecAck 가 decided_by 로 가른다). */
    `ALTER TABLE approval_requests ADD COLUMN exec_ack_by TEXT`,
    `ALTER TABLE approval_requests ADD COLUMN exec_ack_at INTEGER`,
    /* ⏰ 알림 단계(2026-09-24) — 이 단계(nudge_seq)에서 어디까지 알렸나(1 푸시 · 2 문자 · 3 사이렌).
       단계가 넘어가면 nudge_seq 가 달라져 저절로 0 부터 다시 센다(결재 코드를 안 건드린다). */
    `ALTER TABLE approval_requests ADD COLUMN nudge_level INTEGER`,
    `ALTER TABLE approval_requests ADD COLUMN nudge_seq INTEGER`,
    /* 🧾 첨부 «내용» 해시(SHA-256) — 같은 영수증을 다른 결재에 또 붙였는지 본다(2026-09-24 4단계).
       ⚠️ INSERT 에 넣지 않고 저장 «뒤» UPDATE 로 채운다 — 이 ALTER 가 실패해도 올리기가 안 죽게. */
    `ALTER TABLE approval_requests ADD COLUMN file_hash TEXT`,
    // ❓ 영수증에서 읽은 가게 이름(6단계 «이 가게 전에도?»). 판독값이라 틀릴 수 있다.
    `ALTER TABLE approval_requests ADD COLUMN vendor TEXT`,
  ];
  for (const sql of addCols) {
    try { await env.DB.exec(sql); } catch { /* 이미 있는 칸 — 정상 */ }
  }
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_appr_fhash ON approval_requests(file_hash)`); } catch { /* 칸이 없으면 그만 */ }
  // ⚠️ UNIQUE 인덱스로 «같은 사람 + 같은 열쇠» 를 DB 차원에서 막는다.
  //    화면 쪽 검사만 믿으면, 두 기기에서 동시에 재전송할 때 뚫린다.
  //    부분 인덱스(WHERE client_key IS NOT NULL)라 옛 행(전부 NULL)은 걸리지 않는다.
  try {
    await env.DB.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_appr_ckey ON approval_requests(requester_username, client_key) WHERE client_key IS NOT NULL`
    );
  } catch { /* 있으면 그만 */ }

  // 결재 단계 — «누가 몇 번째로 무엇을 했는가». 전 이력이 여기 남는다.
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS approval_steps (` +
    `id INTEGER PRIMARY KEY AUTOINCREMENT, ` +
    `request_id INTEGER NOT NULL, seq INTEGER NOT NULL, role TEXT NOT NULL, ` +
    `status TEXT NOT NULL DEFAULT 'waiting', ` +
    `decided_by TEXT, decided_at INTEGER, memo TEXT, started_at INTEGER)`
  );
  try { await env.DB.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appr_step_uni ON approval_steps(request_id, seq)`); } catch { /* 있으면 그만 */ }

  // 대결(위임) — 결재자가 부재일 때 그 기간 동안 대신 결재할 사람.
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS approval_delegates (` +
    `username TEXT PRIMARY KEY, delegate_to TEXT NOT NULL, ` +
    `until_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`
  );

  // 💼 인사·급여 달 잠금. ⚠️ 여기서 CREATE 를 또 쓰지 않고 주인 모듈의 함수를 부른다 —
  //   같은 표를 두 곳에서 만들면 «먼저 실행된 것이 이겨» 컬럼이 어긋난다(schema_drift_harness).
  await ensureHrTable(env);

  tableReady = true;
});

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> {
  try { return await fn(); } catch { return fb; }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 결재자 찾기 — «이 단계를 처리할 수 있는 사람이 누구인가»
 *
 *   ⚠️ IN (...) 목록을 손으로 만들지 않는다(CLAUDE.md D1 바인드 한도 함정).
 *      본사 계정은 많아야 수십 명이라, 한 번에 받아서 JS 로 거른다.
 * ═════════════════════════════════════════════════════════════════════════ */

interface AccountRow { username: string; name: string | null }

async function hqAccounts(env: ApprovalEnv): Promise<AccountRow[]> {
  const rs = await safe(async () => await env.DB.prepare(
    `SELECT a.username AS username, a.name AS name
       FROM admin_scope s JOIN admin_account a ON a.username = s.username
      WHERE s.scope_type = 'hq' LIMIT 200`
  ).all<AccountRow>(), { results: [] as AccountRow[] } as any);
  return (rs.results || []) as AccountRow[];
}

/**
 * 이 역할 단계를 결재할 수 있는 사람들의 계정명.
 *   exceptUser = 기안자. 자기 건은 자기가 결재할 수 없으므로 알림도 보내지 않는다.
 */
async function approversFor(env: ApprovalEnv, role: string, exceptUser?: string | null): Promise<string[]> {
  const rows = await hqAccounts(env);
  const out: string[] = [];
  for (const r of rows) {
    const u = String(r.username || '');
    if (!u) continue;
    if (exceptUser && u === String(exceptUser)) continue;
    const actor: ActorLike = { ok: true, username: u, name: r.name, role: 'hq', isTeacher: false };
    /* 💳 알림은 «주 결재자» 에게만 간다(isPrimaryApprover).
       canDecideStage 로 두면 'mgr' 단계에서 «대신 결재할 수 있는» 경영진에게까지 알림이
       가서, 「결재는 장 부장이 한다」가 화면에서만 참이 된다. 누를 수 있는 사람과
       알려야 할 사람은 다른 질문이다. */
    if (isPrimaryApprover(actor, role as any, isPhManager(actor))) out.push(u);
  }
  if (out.length) return out;

  /* 🔴 주 결재자가 한 명도 없다 — **결재권자 본인이 올린 건**이 정확히 그렇다
       (자기가 올린 결재는 자기가 결재할 수 없으므로 exceptUser 로 빠진다).
       여기서 빈 배열을 돌려주면 그 결재는 **아무에게도 알림이 안 가고**, 화면의
       「이대로는 처리되지 않습니다」는 approverCounts(canDecideStage) 기준이라 뜨지도
       않는다 ⟹ 아무도 모르는 채로 마감 이틀이 지나 승격 크론이 건드릴 때까지 조용하다.
       그래서 «누를 수 있는 사람» 전원으로 넓혀 알린다(이 경우 경영진이 받는다).
       ⚠️ 이 폴백은 2026-09-09 함정 대조가 잡은 회귀다. 지우지 말 것. */
  for (const r of rows) {
    const u = String(r.username || '');
    if (!u) continue;
    if (exceptUser && u === String(exceptUser)) continue;
    const actor: ActorLike = { ok: true, username: u, name: r.name, role: 'hq', isTeacher: false };
    if (canDecideStage(actor, role as any, isPhManager(actor))) out.push(u);
  }
  return out;
}

/**
 * 「왜 안 움직이나」 — 이 건들을 **지금 결재할 수 있는 사람이 몇 명인가**.
 *
 *   왜 서버가 세나 — 화면은 계정 목록도 결재 규칙도 모른다. 화면이 추측하면
 *   「승인할 사람이 없습니다」라는 **틀린 말**을 사람에게 하게 된다.
 *
 *   ⚠️ 계정 조회는 **한 번만** 한다. 건마다 approversFor() 를 부르면 목록 15건에
 *      D1 조회가 15번 나간다 — 필리핀 회선에서 그대로 대기 시간이 된다.
 *
 *   ⚠️ 세는 기준은 «지금 저장된 단계 역할» 이다. 결재 정책(stagesFor)이 나중에 바뀌어도
 *      이미 만들어진 건의 역할은 approval_steps 에 박혀 있어 따라 바뀌지 않는다.
 *      2026-09-04 실측: 8/30 에 올라온 긴급 건 하나가 `exec` 로 박혀 있는데
 *      (그때는 긴급도 exec 였다 — 9/2 에 'any' 로 바뀜) exec 를 결재할 수 있는 사람은
 *      기안자 본인뿐이라 **영영 처리될 수 없는 상태**로 5일을 서 있었다.
 *      화면은 그동안 「대기 중」이라고만 했다. 그래서 이 함수가 생겼다.
 */
async function approverCounts(
  env: ApprovalEnv,
  jobs: Array<{ id: number; role: string; requester: string;
                reqType?: string | null; priorDeciders?: (string | null)[] }>
): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  if (!jobs.length) return out;
  const rows = await hqAccounts(env);
  for (const j of jobs) {
    let n = 0;
    for (const r of rows) {
      const u = String(r.username || '');
      if (!u) continue;
      if (u === String(j.requester)) continue;   // 본인이 올린 건은 본인이 결재할 수 없다
      const actor: ActorLike = { ok: true, username: u, name: r.name, role: 'hq', isTeacher: false };
      if (!canDecideStage(actor, j.role as any, isPhManager(actor))) continue;
      /* 🖐 앞 단계를 이미 결재한 사람은 이 단계를 누를 수 없다(sameDeciderBlocked).
         ⛔ 이 줄을 빼면 이 함수가 «누를 수 있는 사람» 을 실제보다 많게 세고,
            그러면 아무도 못 누르는 건에 「이대로는 처리되지 않습니다」가 뜨지 않는다 —
            이 함수가 생긴 이유(8/30 긴급 건 5일 방치)가 그대로 재현된다.
         📌 2026-09-09 실측: 경영진(대표·결재권자)이 «올린» 큰돈 건은 1단계를 나머지 한 명이
            누르는 순간 2단계 결재자가 0명이 된다. 그 사실을 화면이 말해야 한다. */
      if (sameDeciderBlocked({
        reqType: j.reqType, priorDeciders: j.priorDeciders || [], me: u, decision: 'approved',
      }).blocked) continue;
      n++;
    }
    out[j.id] = n;
  }
  return out;
}

/** 지금 이 사람 대신 결재하도록 위임받은 사람이 있는가(대결). 없으면 빈 배열. */
async function delegatesOf(env: ApprovalEnv, usernames: string[]): Promise<string[]> {
  if (!usernames.length) return [];
  const now = Date.now();
  const rs = await safe(async () => await env.DB.prepare(
    `SELECT username, delegate_to FROM approval_delegates WHERE until_at > ? LIMIT 100`
  ).bind(now).all<{ username: string; delegate_to: string }>(), { results: [] as any[] } as any);
  const out: string[] = [];
  for (const r of (rs.results || [])) {
    if (usernames.indexOf(String(r.username)) >= 0) out.push(String(r.delegate_to));
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 알림 — 기존 push_queue 를 그대로 쓴다. 새 채널을 만들지 않는다.
 *   (sw.js 는 push 이벤트에서 /api/push/pending 으로 내용을 가져간다 — 이미 그렇게 동작 중)
 * ═════════════════════════════════════════════════════════════════════════ */

async function notify(
  env: ApprovalEnv, usernames: string[], title: string, body: string, reqId: number, tag: string,
  quickSeq = 0, urlOverride = '',
): Promise<{ push: number; missed: string[] }> {
  const missed: string[] = [];
  if (!usernames.length) return { push: 0, missed };
  let sent = 0;
  /* 📲 quickSeq 가 있으면 링크에 &qa=<단계> 를 붙인다 — sw.js 가 그것을 보고 알림에
     [승인] 버튼을 단다. 새 칸(push_queue.actions)을 만들지 않은 이유: /api/push/pending 이
     칸 이름을 적어 SELECT 하므로, 칸이 없는 DB 에서는 모든 푸시가 함께 죽는다.
     ⚠️ 버튼은 편의일 뿐 — 누르면 서버가 🟢·같은 단계인지 **다시** 잰다(pushApproveDenyReason). */
  // 📬 요약 알림처럼 «건 하나» 가 아닌 알림은 부르는 쪽이 갈 곳을 정한다(urlOverride, '/work…' 만).
  const url = (urlOverride && urlOverride.indexOf('/work') === 0) ? urlOverride
            : '/work?id=' + reqId + (quickSeq > 0 ? '&qa=' + quickSeq : '');
  for (const u of usernames) {
    const rs = await safe(async () => await env.DB.prepare(
      `SELECT endpoint FROM push_subscriptions WHERE user_id = ? AND enabled = 1 LIMIT 10`
    ).bind(u).all<{ endpoint: string }>(), { results: [] as any[] } as any);
    const eps = rs.results || [];
    if (!eps.length) { missed.push(u); continue; }   // 이 사람은 푸시로 닿지 않는다
    const queued: string[] = [];
    for (const s of eps) {
      const ok = await safe(async () => {
        await env.DB.prepare(
          `INSERT INTO push_queue (endpoint, title, body, url, icon, badge, tag, queued_at)
           VALUES (?,?,?,?,?,?,?,?)`
        ).bind(s.endpoint, title, body, url, null, null, tag + ':' + reqId, Date.now()).run();
        return true;
      }, false);
      if (ok) queued.push(s.endpoint);
    }
    /* 🔴 (2026-09-24) 대기열에 넣기만 하고 **기기를 깨우지 않고 있었다.**
       sw.js 는 push 이벤트가 와야 /api/push/pending 을 읽는데, 그 신호를 아무도 안 보내서
       결재 알림 24건이 전부 fetched_at NULL — **한 번도 폰에 뜬 적이 없었다**(운영 DB 실측).
       다른 알림(sendPushToUser·teacher-push)처럼 broadcastWebPush 로 깨운다.
       ⚠️ 깨우기가 한 곳도 성공하지 않으면 «못 닿은 사람» 으로 센다 — 그래야 문자 폴백이 돈다. */
    if (!queued.length) { missed.push(u); continue; }
    const wake: any = await safe(async () => await broadcastWebPush(queued, env as any), null);
    if (wake && Array.isArray(wake.expired)) {
      for (const ep of wake.expired) {
        await safe(async () => {
          await env.DB.prepare(`UPDATE push_subscriptions SET enabled = 0, updated_at = ? WHERE endpoint = ?`)
            .bind(Date.now(), ep).run();
          return true;
        }, false);
      }
    }
    if (wake && Number(wake.sent) > 0) sent += Number(wake.sent);
    else missed.push(u);
  }
  return { push: sent, missed };
}

/** 📲 이 행이 지금 «알림에서 바로 승인» 대상이면 그 단계 번호, 아니면 0. */
function quickSeqOf(r: any, seq: number): number {
  try {
    let flags: Flag[] = [];
    try { if (r?.flags) flags = JSON.parse(r.flags); } catch { flags = []; }
    const sg = signalOf({ reqType: r?.req_type, amount: r?.amount, ocrAmount: r?.ocr_amount,
                          hasFile: !!r?.file_key, flags });
    return quickApprovable({ signal: sg.signal, reqType: r?.req_type, reversesId: r?.reverses_id })
      ? seq : 0;
  } catch { return 0; }   // 모르면 버튼을 안 단다 — 화면에서 결재하면 된다
}

/**
 * 📱 푸시로 닿지 않는 사람에게 문자로 보낸다.
 *
 *   왜 필요한가 — 「안 열어봐도 바로 알게」가 요구사항인데, 웹푸시는 **켠 사람에게만** 간다.
 *   아이폰은 «홈 화면에 추가» 를 해야 하고, 안드로이드도 알림 권한을 눌러 줘야 한다.
 *   처음에는 아무도 안 켜 놓은 상태라, 푸시만 믿으면 **긴급 건이 아무에게도 안 간다.**
 *
 *   ⚠️ 문자는 돈이 든다. 그래서 아무 결재에나 보내지 않는다 —
 *      긴급 접수 · 마감 초과 · 경영진 승격, 이 셋만이다(호출하는 쪽에서 정한다).
 *   ⚠️ 끄는 스위치: KV SESSION_STATE 의 'approval_sms' 를 'off' 로 두면 안 보낸다.
 *      (다른 발송 기능들과 같은 방식 — lesson_reminder_send 참고)
 */
async function smsFallback(env: ApprovalEnv, usernames: string[], text: string): Promise<number> {
  if (!usernames.length) return 0;
  try {
    const kill = await safe(async () => await (env as any).SESSION_STATE?.get('approval_sms'), null);
    if (String(kill || '') === 'off') return 0;
  } catch { /* KV 를 못 읽으면 그냥 보낸다 — 알림이 안 가는 쪽이 더 나쁘다 */ }

  const { sendPlainSms } = await import('./solapi-client');
  let sent = 0;
  const noPhone: string[] = [];
  for (const u of usernames) {
    const acc: any = await safe(async () => await env.DB.prepare(
      `SELECT phone FROM admin_account WHERE username = ? LIMIT 1`
    ).bind(u).first(), null);
    const phone = String(acc?.phone || '').trim();
    if (!phone) { noPhone.push(u); continue; }
    // 필리핀 매니저는 현지 번호다 — 국가번호를 붙여야 도착한다(63). 그 외는 국내(82).
    const country = PH_MANAGERS.indexOf(String(u).toLowerCase()) >= 0 ? '63' : '82';
    const r = await safe(async () => await sendPlainSms(env as any, phone, text, {
      country, subject: '망고아이 결재',
    }), { ok: false } as any);
    if (r?.ok) sent++;
  }
  /* ⚠️ 조용히 아무것도 안 하는 상태를 만들지 않는다.
     푸시도 못 받고 전화번호도 없으면 그 사람에게는 **긴급 알림이 아예 닿지 않는다.**
     코드는 정상 동작(건너뛰기)이라 오류가 안 나서, 로그가 없으면 아무도 모른다.
     (2026-08-16 실측 — 관리자 계정 6개 전부 phone 이 비어 있었다.
      admin_account.phone 을 채우기 전까지 문자 폴백은 «있지만 안 나가는» 상태다.) */
  if (noPhone.length) {
    console.warn('[approval-sms] 전화번호가 없어 문자를 못 보낸 사람: ' + noPhone.join(', ') +
                 ' — admin_account.phone 을 채워야 긴급·지연 알림이 닿습니다');
  }
  return sent;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 자동화 — 무료 모델만 쓴다(2026-08-16 사장님 결정: 유료 판독 엔진 미사용).
 *
 *   ⚠️ 전부 «있으면 좋은 것»이다. 실패해도 결재는 정상 진행되어야 한다.
 *      그래서 모든 호출이 try/catch 로 감싸여 있고, 실패는 null 을 돌려준다.
 * ═════════════════════════════════════════════════════════════════════════ */

/** 영수증 사진 → 금액·날짜·상점. 무료 비전 모델 2단(llama vision → llava). */
async function readReceipt(env: ApprovalEnv, bytes: Uint8Array): Promise<{ amount: number | null; spent_at: string | null; vendor: string | null; items: ReceiptItem[]; text: string } | null> {
  const AI = env.AI;
  if (!AI) return null;
  const prompt =
    'This is a receipt photo. Reply with ONLY a JSON object, no prose: ' +
    '{"amount": <total amount as a number, no currency symbol or commas>, ' +
    '"date": "<YYYY-MM-DD or empty string>", "vendor": "<shop name or empty string>", ' +
    '"items": [{"name": "<item as printed>", "qty": <number>, "price": <line price as a number or null>}]}. ' +
    'List only items actually printed on the receipt (at most 15); use [] if you cannot read them. ' +
    'If you cannot read a field, use null for amount and "" for the others.';
  const models = ['@cf/meta/llama-3.2-11b-vision-instruct', '@cf/llava-hf/llava-1.5-7b-hf'];
  for (const m of models) {
    const raw = await safe(async () => {
      const r: any = await AI.run(m, { image: Array.from(bytes), prompt, max_tokens: 480 });
      return String(r?.description || r?.response || '').trim();
    }, '');
    if (!raw) continue;
    const obj = parseLooseJson(raw);
    if (!obj) continue;
    const amt = Number(String(obj.amount ?? '').toString().replace(/[^\d.]/g, ''));
    const d = String(obj.date || '').trim();
    return {
      amount: isFinite(amt) && amt > 0 ? amt : null,
      spent_at: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null,
      vendor: String(obj.vendor || '').trim().slice(0, 60) || null,
      items: normReceiptItems(obj.items),           // 🧾 8단계 — 모르면 []
      text: raw.slice(0, 500),
    };
  }
  return null;
}

/** 음성(영어) → 글자. 사장님 결정에 따라 영어 기준으로 안내한다. */
async function transcribe(env: ApprovalEnv, bytes: Uint8Array): Promise<string | null> {
  const AI = env.AI;
  if (!AI) return null;
  // 정확도가 높은 turbo 를 먼저, 실패하면 기본 whisper.
  for (const m of ['@cf/openai/whisper-large-v3-turbo', '@cf/openai/whisper']) {
    const t = await safe(async () => {
      const r: any = await AI.run(m, { audio: Array.from(bytes) });
      return String(r?.text || r?.transcript || '').trim();
    }, '');
    if (t) return t;
  }
  return null;
}

/** 받아쓴 문장 → 결재 초안(제목·분류·금액). 사람이 고칠 수 있는 «초안»일 뿐이다. */
async function draftFromText(env: ApprovalEnv, text: string): Promise<any | null> {
  const AI = env.AI;
  if (!AI || !text) return null;
  const kinds = TYPES.map(t => t.key).join('|');
  const prompt =
    'You turn a spoken note from an academy manager into an approval request draft.\n' +
    'Note: "' + text.slice(0, 800) + '"\n' +
    'Reply with ONLY JSON: {"req_type":"<' + kinds + '>","title":"<short title, max 60 chars>",' +
    '"body":"<1-2 sentences of detail>","amount":<number or null>}\n' +
    'Use "purchase" for buying things, "expense" for reimbursing money already spent, ' +
    '"complaint" for parent/student complaints, "urgent" for emergencies, "doc" otherwise.';
  return await safe(async () => {
    const r: any = await AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: 'You reply with valid JSON only. No markdown, no code fences.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300, temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    return parseLooseJson(r?.response ?? r?.result?.response ?? '');
  }, null);
}

/**
 * 결재자가 읽을 한 줄 요약. 결재당 **1회만** 부르고 저장한다(볼 때마다 다시 만들지 않는다).
 *   ⚠️ 금액은 AI 가 만들지 않는다 — 화면이 쓰는 숫자는 전부 DB 값이다. 여기선 문장만.
 */
async function summarize(env: ApprovalEnv, r: any): Promise<{ ko: string; en: string } | null> {
  const AI = env.AI;
  if (!AI) return null;
  const spec = typeSpec(r.req_type);
  const facts =
    'Category: ' + spec.en + '\n' +
    'Requester: ' + (r.requester_name || r.requester_username) + '\n' +
    (r.amount != null ? ('Amount: ' + normCurrency(r.currency) + ' ' + r.amount + '\n') : '') +
    'Title: ' + String(r.title || '') + '\n' +
    'Detail: ' + String(r.body || '(none)').slice(0, 600);
  const prompt =
    'Summarize this approval request in ONE short sentence, twice — once in English, once in Korean. ' +
    'State what it is for and why, factually. Do not recommend approving or rejecting. ' +
    'Do not invent numbers.\n\n' + facts + '\n\n' +
    'Reply with ONLY JSON: {"en":"...","ko":"..."}';
  return await safe(async () => {
    const res: any = await AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: 'You reply with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 220, temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    const o = parseLooseJson(res?.response ?? res?.result?.response ?? '');
    if (!o) return null;
    const ko = String(o.ko || '').trim().slice(0, 300);
    const en = String(o.en || '').trim().slice(0, 300);
    return (ko || en) ? { ko, en } : null;
  }, null);
}

/**
 * 🔎 AI 내용 검토 — 필리핀에서 올라온 «돈 나가는» 건을 AI 가 한 번 더 읽는다(2026-09-24 사장님
 *    「필리핀에서 작성한 것들 중에서 A.i 가 반드시 잘 꼼꼼하게 필터」).
 *   ⛔ 여기서 나온 것은 **«확인해 보세요»(🟡) 표시** 일 뿐이다 — 반려·승인을 정하지 않는다.
 *      AI 는 같은 건도 매번 다르게 볼 수 있어, 이걸로 되돌리면 멀쩡한 건이 막힌다.
 *   ⛔ 금액·숫자를 지어내지 않게 한다. 실패하면 [] — 결재는 그대로 진행된다.
 */
async function aiReview(env: ApprovalEnv, r: {
  req_type: string; category?: string | null; title: string; body?: string | null;
  amount?: number | null; currency?: string | null; vendor?: string | null;
}): Promise<Flag[]> {
  const AI = env.AI;
  if (!AI) return [];
  const spec = typeSpec(r.req_type);
  const cat = categorySpec(r.category);
  const facts =
    'Type: ' + spec.en + '\n' +
    (cat ? ('Expense category: ' + cat.en + '\n') : '') +
    (r.amount != null ? ('Amount: ' + normCurrency(r.currency) + ' ' + r.amount + '\n') : '') +
    (r.vendor ? ('Receipt shop: ' + String(r.vendor).slice(0, 60) + '\n') : '') +
    'Title: ' + String(r.title || '').slice(0, 200) + '\n' +
    'Detail: ' + String(r.body || '(none)').slice(0, 800);
  const prompt =
    'You pre-check an expense request from a branch office in the Philippines before head office approves it.\n' +
    'List ONLY concrete problems the approver should check. Examples: the purpose is unclear or vague; ' +
    'the amount looks unusually high for the item; the expense category does not match the item; ' +
    'it looks like a personal expense; important details are missing (quantity, who it is for, why now); ' +
    'the receipt shop does not match the item.\n' +
    'If there is no real problem, return an empty list. Do not invent facts or numbers. ' +
    'Do not say approve or reject. At most 3 items.\n\n' + facts + '\n\n' +
    'Reply with ONLY JSON: {"concerns":[{"en":"<short, max 90 chars>","ko":"<short Korean, max 60 chars>"}]}';
  const o = await safe(async () => {
    const res: any = await AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: 'You reply with valid JSON only. You are careful and never invent facts.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300, temperature: 0.1,
      response_format: { type: 'json_object' },
    });
    return parseLooseJson(res?.response ?? res?.result?.response ?? '');
  }, null);
  const list = (o && Array.isArray(o.concerns)) ? o.concerns : [];
  const out: Flag[] = [];
  for (const c of list.slice(0, 3)) {
    const en = String(c?.en || '').trim().slice(0, 140);
    const ko = String(c?.ko || '').trim().slice(0, 100);
    if (!en && !ko) continue;
    out.push({ code: 'ai_review', level: 'info', ko: 'AI 검토: ' + (ko || en), en: 'AI check: ' + (en || ko) });
  }
  return out;
}

/** 한국어로만 적은 반려 사유를 필리핀 매니저가 읽게 영어를 덧붙인다. 실패하면 null(원문 그대로). */
async function toEnglish(env: ApprovalEnv, text: string): Promise<string | null> {
  const AI = env.AI;
  if (!AI || !text) return null;
  return await safe(async () => {
    const res: any = await AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: 'Translate the Korean text into short, plain English. Reply with the translation only.' },
        { role: 'user', content: text.slice(0, 500) },
      ],
      max_tokens: 200, temperature: 0.1,
    });
    const t = String(res?.response ?? res?.result?.response ?? '').trim();
    return t ? t.slice(0, 500) : null;
  }, null);
}

/** 자동 반려 스위치(KV 'approval_autoreject'). 못 읽으면 'shadow' — 표시만 하고 되돌리지 않는다. */
async function readAutoRejectMode(env: ApprovalEnv) {
  const v = await safe(async () => await (env as any).SESSION_STATE?.get('approval_autoreject'), null);
  return autoRejectMode(v);
}

/**
 * 🤖 자동 반려 «연습 성적» — 지난 14일, AI 가 🔴 로 본 건을 사람이 실제로 어떻게 처리했나.
 *   주간 요약 문자와 경영진 판단 패널이 **같은 함수**를 쓴다(두 곳이 다른 숫자를 말하지 않게).
 *   AI 가 스스로 되돌린 건(decided_by='ai-auto')·취소 결재는 세지 않는다.
 */
async function loadShadowRows(env: ApprovalEnv, now: number) {
  const rows = await safe(async () => (await env.DB.prepare(
    `SELECT id, title, requester_name, requester_username, amount, currency, req_type, ocr_amount,
            file_key, flags, status, decided_by, created_at FROM approval_requests
      WHERE created_at >= ? AND status IN ('approved','rejected') AND reverses_id IS NULL
        AND IFNULL(decided_by,'') <> 'ai-auto' ORDER BY created_at DESC LIMIT 500`
  ).bind(now - 14 * 86400_000).all<any>()).results || [], [] as any[]);
  return (rows as any[]).map((r: any) => {
    let fl: Flag[] = [];
    try { if (r.flags) fl = JSON.parse(r.flags); } catch { fl = []; }
    const sg = signalOf({ reqType: r.req_type, amount: r.amount, ocrAmount: r.ocr_amount,
      hasFile: !!r.file_key, flags: fl });
    return { row: r, status: String(r.status || ''), signal: sg.signal, reasons: sg.reasons };
  });
}

/** Workers AI 응답은 객체일 때도, JSON 문자열일 때도, 앞뒤에 말이 붙을 때도 있다. 셋 다 받는다. */
function parseLooseJson(raw: any): any | null {
  if (raw && typeof raw === 'object') return raw;
  const text = String(raw || '');
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* 아래에서 한 번 더 */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* 포기 */ } }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 자동 점검용 조회 — 전부 계산이다. AI 를 부르지 않는다.
 * ═════════════════════════════════════════════════════════════════════════ */

/** 🧾 첨부 «내용» 의 SHA-256(소문자 16진수). 실패하면 null — 모르면 점검하지 않는다. */
async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  try {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer));
    let h = '';
    for (let i = 0; i < d.length; i++) h += d[i].toString(16).padStart(2, '0');
    return h;
  } catch { return null; }
}

/** 🧾 같은 영수증 파일이 붙은 «살아 있는» 결재 수. 반려·회수·취소된 건은 세지 않는다
    (반려 뒤 같은 영수증으로 고쳐서 다시 올리는 것은 정상이다). 조회 실패는 0 — 막지 않는 쪽. */
async function receiptReuseCount(env: ApprovalEnv, hash: string | null): Promise<number> {
  if (!isSha256Hex(hash)) return 0;
  const r: any = await safe(async () => await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM approval_requests
      WHERE file_hash = ? AND status NOT IN ('rejected','withdrawn','cancelled') AND reverses_id IS NULL`
  ).bind(hash).first(), null);
  return Number(r?.c || 0);
}

async function gatherCheckFacts(
  env: ApprovalEnv, requester: string, reqType: string, amount: number | null, currency: string,
  vendor: string | null = null,
): Promise<{ duplicateCount: number; duplicateRecentCount: number; monthTotal: number | null; medianAmount: number | null;
             weekCount: number; newVendor: boolean }> {
  const now = Date.now();
  const since30 = now - 30 * 86400_000;
  const since7 = now - 7 * 86400_000;

  // ① 같은 사람이 최근 30일 안에 올린 «같은 분류 · 같은 금액»
  let duplicateCount = 0, duplicateRecentCount = 0;
  if (amount != null) {
    const d: any = await safe(async () => await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM approval_requests
        WHERE requester_username = ? AND req_type = ? AND currency = ?
          AND amount = ? AND created_at >= ?
          AND status NOT IN ('rejected','withdrawn','cancelled')
          AND reverses_id IS NULL`
    ).bind(requester, reqType, currency, amount, since30).first(), null);
    duplicateCount = Number(d?.c || 0);
    if (duplicateCount > 0) {
      const d7: any = await safe(async () => await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM approval_requests
          WHERE requester_username = ? AND req_type = ? AND currency = ?
            AND amount = ? AND created_at >= ?
            AND status NOT IN ('rejected','withdrawn','cancelled')
            AND reverses_id IS NULL`
      ).bind(requester, reqType, currency, amount, since7).first(), null);
      duplicateRecentCount = Number(d7?.c || 0);
    }
  }

  // ② 이번 달 같은 분류 승인 합계
  const mStart = (() => { const t = new Date(now); return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1); })();
  const s: any = await safe(async () => await env.DB.prepare(
    `SELECT IFNULL(SUM(amount), 0) AS s FROM approval_requests
      WHERE req_type = ? AND currency = ? AND status = 'approved' AND created_at >= ?
        AND reverses_id IS NULL`
  ).bind(reqType, currency, mStart).first(), null);
  const monthTotal = s ? Number(s.s || 0) : null;

  // ③ 평소 금액대 — 최근 같은 분류 20건의 중앙값
  const rs = await safe(async () => await env.DB.prepare(
    `SELECT amount FROM approval_requests
      WHERE req_type = ? AND currency = ? AND amount IS NOT NULL AND status = 'approved'
      ORDER BY created_at DESC LIMIT 20`
  ).bind(reqType, currency).all<{ amount: number }>(), { results: [] as any[] } as any);
  const nums = (rs.results || []).map((x: any) => Number(x.amount)).filter((n: number) => isFinite(n) && n > 0).sort((a: number, b: number) => a - b);
  const medianAmount = nums.length ? nums[Math.floor(nums.length / 2)] : null;

  // ④ 🔁 같은 사람이 최근 7일 안에 올린 같은 분류 건수(11단계). 못 읽으면 0 — 아무것도 안 붙인다.
  const wk: any = await safe(async () => await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM approval_requests
      WHERE requester_username = ? AND req_type = ? AND created_at >= ?
        AND status NOT IN ('rejected','withdrawn','cancelled')
        AND reverses_id IS NULL`
  ).bind(requester, reqType, since7).first(), null);
  const weekCount = Number(wk?.c || 0);

  // ⑤ 🏪 처음 보는 가게(11단계) — 승인된 결재의 가게 이름과 대조. 칸이 없거나 못 읽으면 기록 부족으로
  //    보고 «처음» 이라 말하지 않는다(isNewVendor 가 VENDOR_HISTORY_MIN 을 본다).
  let newVendor = false;
  if (vendor) {
    const vr = await safe(async () => await env.DB.prepare(
      `SELECT DISTINCT vendor FROM approval_requests
        WHERE vendor IS NOT NULL AND status = 'approved' AND reverses_id IS NULL
        ORDER BY created_at DESC LIMIT 500`
    ).all<{ vendor: string }>(), { results: [] as any[] } as any);
    newVendor = isNewVendor(vendor, (vr.results || []).map((x: any) => x.vendor));
  }

  return { duplicateCount, duplicateRecentCount, monthTotal, medianAmount, weekCount, newVendor };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 한 줄 만들기 — 첨부의 R2 키는 절대 내보내지 않는다(내려받기는 전용 엔드포인트로만).
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * brief = 목록용. 본문을 잘라 보낸다.
 *   왜 — 화면은 «요약 한 줄, 없으면 본문 앞부분»만 그린다. 그런데 본문은 최대 4,000자다.
 *   목록 45건이면 그것만으로 180KB — 정작 화면은 그중 거의 다 버린다.
 *   느린 회선에서는 «안 쓰는 바이트»가 곧 대기 시간이다.
 *
 * ⚠️ 시간에 따라 변하는 값(예: 지금 지연인가)은 여기 넣지 않는다.
 *    그 값이 섞이면 내용이 안 바뀌어도 응답이 매번 달라져 «바뀐 것 없음(304)» 을 줄 수 없다.
 *    지연 판정은 stage_due_at 을 받아 화면이 한다.
 */
function rowOf(r: any, steps?: any[], brief = false) {
  const spec = typeSpec(r.req_type);
  const total = Number(r.stage_total || 1);
  const seq = Number(r.stage_seq || 1);
  let flags: Flag[] = [];
  try { if (r.flags) flags = JSON.parse(r.flags); } catch { flags = []; }
  /* 목록은 본문을 300자로 줄여 보낸다(응답 크기).
     🔴 그런데 그 잘린 값을 «다시 올리기» 폼에 그대로 채우면 **내용이 말없이 바뀌어**
        다시 올라간다 — ②는 「수정」을 대신하는 자리라 그게 제일 나쁘다.
        그래서 «잘렸다» 는 사실을 함께 실어, 화면이 원문을 받아 오게 한다. */
  const bodyFull = r.body ? String(r.body) : '';
  const bodyCut = !!(brief && bodyFull.length > 300);
  const body = bodyCut ? bodyFull.slice(0, 300) : r.body;
  const catSpec = categorySpec(r.category);
  const sig = signalOf({
    reqType: r.req_type, amount: r.amount, ocrAmount: r.ocr_amount, hasFile: !!r.file_key, flags,
  });
  const st0 = (r.status === 'pending') ? stageStartOf(r.req_type, r.stage_due_at) : null;
  const plan = (st0 != null) ? nudgePlan(r.req_type, st0) : null;
  return {
    id: r.id, req_type: r.req_type,
    type_ko: spec.ko, type_en: spec.en,
    title: r.title, body, body_truncated: bodyCut,
    /* 🏷️ 항목은 key 로 저장하고 «읽을 때» 이름을 붙인다 — 라벨을 다듬어도
       이미 쌓인 결재의 뜻이 안 바뀐다. 모르는 값이면 이름을 지어내지 않고 null. */
    category: r.category || null,
    category_ko: catSpec ? catSpec.ko : null,
    category_en: catSpec ? catSpec.en : null,
    category_account: catSpec ? catSpec.account : null,
    amount: r.amount, currency: r.currency, spent_at: r.spent_at,
    date_from: r.date_from || null, date_to: r.date_to || null,
    hr_kind: r.hr_kind || null, period: r.period || null,
    requester_username: r.requester_username, requester_name: r.requester_name,
    has_file: !!r.file_key, file_name: r.file_name, file_size: r.file_size,
    file_kind: r.file_key ? fileKind(r.file_ext) : null,
    status: r.status,
    status_ko: (statusSpec(r.status)?.ko || null),
    status_en: (statusSpec(r.status)?.en || null),
    /* ↩️🔁 이어진 건들 — 화면이 「원래 8/30에 올림」·「취소 결재 #12」를 말할 수 있게 */
    origin_id: r.origin_id || null,
    origin_created_at: r.origin_created_at || null,
    /* 🗑️ 회수된 건 중 «이어받아 다시 올린 결재가 있는» 것 — 화면이 삭제 버튼을 안 그린다.
       (서버 403 을 누른 «뒤» 에 받는 대신. SELECT 가 이 칸을 안 뽑으면 늘 false 라
        버튼이 뜨고 눌러야 거절된다 — 하니스가 세 SELECT 를 대조한다) */
    has_child: !!Number(r.has_child || 0),
    reverses_id: r.reverses_id || null,
    cancelled_by_id: r.cancelled_by_id || null,
    decided_by: r.decided_by, decided_at: r.decided_at,
    /* ✅ 경영진 «확인» 도장 — 결재가 아니라 «봤다»는 표시(막지 않는다). */
    exec_ack_by: r.exec_ack_by || null,
    exec_ack_at: r.exec_ack_at || null,
    decide_memo: r.decide_memo, created_at: r.created_at,
    stage_seq: seq, stage_total: total,
    deadline_at: r.deadline_at || null, stage_due_at: r.stage_due_at || null,
    escalated: !!r.escalated_at,
    summary_ko: r.summary_ko || null, summary_en: r.summary_en || null,
    flags,
    /* 🚦 신호등 — 행에 저장된 값으로만 계산한다(시간에 따라 안 변한다 → 304 유지). */
    signal: sig.signal, signal_reasons: sig.reasons,
    /* 🤖 AI 가 «되돌렸을» 건 — 스위치가 shadow 일 때 결재자가 참고하도록 표시만 한다. */
    ai_would_reject: r.status === 'pending' && autoRejectable({
      signal: sig.signal, reqType: r.req_type,
      requesterIsExec: isExec({ ok: true, username: r.requester_username } as ActorLike),
      reversesId: r.reverses_id || null,
    }),
    ai_returned: r.decided_by === 'ai-auto',
    /* ⏰ 사이렌·승격 시각 — «언제» 만 보낸다. 지금 울릴지는 화면이 시계를 보고 정한다. */
    siren_at: plan ? plan.sirenAt : null,
    escalate_at: plan ? plan.escalateAt : null,
    steps: (steps || []).map((s: any) => ({
      seq: s.seq, role: s.role, status: s.status,
      decided_by: s.decided_by, decided_at: s.decided_at, memo: s.memo,
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 📤 엑셀 내보내기 (CSV)
 *
 *   ⚠️ 두 가지를 꼭 지킨다.
 *     ① **BOM** — 없으면 한국어 엑셀이 UTF-8 을 못 알아보고 한글이 깨진다.
 *     ② **수식 차단** — 셀이 = + - @ 로 시작하면 엑셀이 «수식» 으로 실행한다.
 *        결재 제목·내용은 사람이 적는 값이라 그대로 넣으면 남의 컴퓨터에서 수식이 돈다.
 *        앞에 작은따옴표를 붙여 «글자» 로 못 박는다.
 * ═════════════════════════════════════════════════════════════════════════ */

function csvCell(v: any): string {
  let t = (v === null || v === undefined) ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;      // 엑셀 수식 실행 차단
  return '"' + t.replace(/"/g, '""') + '"';
}

/** ms → KST 'YYYY-MM-DD HH:MM'. 엑셀이 날짜로 알아보는 모양. */
function csvWhen(ms: any): string {
  const n = Number(ms || 0);
  if (!n) return '';
  const d = new Date(n + 9 * 3600_000);
  const p = (x: number) => String(x).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
         ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}

function csvResponse(items: any[]): Response {
  const head = ['번호', '분류', '지출 항목', '회계 계정', '제목', '올린 사람', '올린 날짜', '금액', '통화',
                '상태', '결재자', '결재 날짜', '첨부', '내용'];
  /* 상태 라벨을 손으로 적지 않는다 — 상태가 늘면 엑셀에만 영문 코드가 날것으로 찍힌다. */
  const STAT: Record<string, string> = {};
  for (const st of STATUSES) STAT[st.key] = st.ko;
  const lines = [head.map(csvCell).join(',')];
  for (const r of items) {
    lines.push([
      r.id, r.type_ko, (r.category_ko || ''), (r.category_account || ''),
      r.title, (r.requester_name || r.requester_username),
      csvWhen(r.created_at),
      (r.amount == null ? '' : r.amount), (r.amount == null ? '' : (r.currency || 'PHP')),
      (STAT[String(r.status)] || r.status), (r.decided_by || ''), csvWhen(r.decided_at),
      (r.has_file ? 'O' : ''), (r.body || ''),
    ].map(csvCell).join(','));
  }
  const stamp = csvWhen(Date.now()).slice(0, 10);
  return new Response('\uFEFF' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="approvals-' + stamp + '.csv"',
      // 결재 내용에는 급여·거래처가 들어간다. 중간 캐시에 절대 남기지 않는다.
      'Cache-Control': 'private, no-store',
    },
  });
}

/** 이 건의 결재선에 이름이 오른 사람들 — 열람 판정에 쓴다. */
async function chainOf(env: ApprovalEnv, reqId: number): Promise<{ steps: any[]; usernames: string[] }> {
  const rs = await safe(async () => await env.DB.prepare(
    `SELECT * FROM approval_steps WHERE request_id = ? ORDER BY seq LIMIT 20`
  ).bind(reqId).all<any>(), { results: [] as any[] } as any);
  const steps = rs.results || [];
  const usernames: string[] = [];
  for (const s of steps) if (s.decided_by) usernames.push(String(s.decided_by));
  return { steps, usernames };
}

/**
 * 여러 건의 단계를 **한 번에** 받아 온다.
 *
 *   왜 — 예전엔 목록의 행마다 단계를 따로 조회했다(chainOf). 결재함 한 번 여는 데
 *   D1 쿼리가 40건 넘게 나갔다. 필리핀 회선에서 이건 그대로 대기 시간이 된다.
 *   ⚠️ IN 목록을 손으로 만들지 않는다 — D1 은 바인드 100개가 한도이고, 손으로 자른 코드는
 *      회귀 하니스가 잡는다(CLAUDE.md). 공용 selectInChunks 를 쓴다.
 */
async function stepsByRequest(env: ApprovalEnv, ids: number[]): Promise<Record<number, any[]>> {
  const out: Record<number, any[]> = {};
  if (!ids.length) return out;
  const rows = await selectInChunks<any>(
    env.DB, ids,
    (ph) => `SELECT * FROM approval_steps WHERE request_id IN (${ph}) ORDER BY request_id, seq`,
    { swallowErrors: true }      // 단계를 못 읽었다고 결재함이 안 뜨면 안 된다
  );
  for (const r of rows) {
    const k = Number(r.request_id);
    if (!out[k]) out[k] = [];
    out[k].push(r);
  }
  return out;
}

/** 위에서 받은 단계 묶음에서 «결재선에 이름이 오른 사람» 을 뽑는다. */
function chainUsers(steps: any[] | undefined): string[] {
  const out: string[] = [];
  for (const s of (steps || [])) if (s.decided_by) out.push(String(s.decided_by));
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🔁 취소 결재가 «승인되었을 때» — 원본을 무효로 하고, 되돌릴 수 있는 것만 되돌린다
 *
 *   ⛔ 되돌릴 수 없는 것을 조용히 넘기지 않는다. 무엇을 되돌렸고 무엇을 못 되돌렸는지
 *      결과로 돌려주고 로그에도 남긴다 — 「취소했다」는 말만 남고 강사가 계속 막혀 있는
 *      상태가 제일 나쁘다.
 *   ⚠️ 우리가 만든 것만 지운다 —
 *      · 근무불가: linked_id 로 이어진 그 행이면서 created_by 가 «결재 자동반영» 일 때만
 *      · 달 잠금: 그 결재가 건 잠금일 때만(request_id 일치)
 *      사람이 손댄 자리는 건드리지 않고 «못 되돌렸다» 고 말한다.
 *   ⚠️ 여기서 예외를 던지지 않는다 — 취소 결재는 이미 승인된 뒤다.
 * ═════════════════════════════════════════════════════════════════════════ */
async function applyReversal(
  env: ApprovalEnv, originalId: number, reversalId: number, by: string
): Promise<{ cancelled: boolean; undone: string[]; left: string[] }> {
  const undone: string[] = [];
  const left: string[] = [];
  let cancelled = false;
  try {
    const orig: any = await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_requests WHERE id = ? LIMIT 1`
    ).bind(originalId).first(), null);
    if (!orig) { left.push('원본을 찾지 못했습니다(#' + originalId + ')'); return { cancelled, undone, left }; }

    /* 조건부 UPDATE — 그사이 원본이 이미 취소됐으면 0행. 두 번 되돌리지 않는다. */
    const up = await env.DB.prepare(
      `UPDATE approval_requests SET status = 'cancelled', cancelled_by_id = ?
        WHERE id = ? AND status = 'approved'`
    ).bind(reversalId, originalId).run();
    cancelled = !!up.meta.changes;
    if (!cancelled) {
      left.push('원본이 이미 «승인» 상태가 아니라 무효 처리하지 않았습니다');
      return { cancelled, undone, left };
    }

    // 🏖️ 휴가 — 근무불가를 풀어야 그 기간 예약이 다시 열린다.
    if (typeSpec(orig.req_type).wantsDates) {
      if (orig.linked_id) {
        /* 🔴 「지울 것이 없었다」와 「못 읽었다」는 다른 사실이다.
           safe() 가 예외를 삼키면 null 이 오는데, 그걸 «사람이 손댔다» 로 적으면
           **DB 오류를 원인으로 단정**하게 된다(2026-09-05 함정 대조 지적). 셋을 가른다. */
        let failed = false;
        const d = await (async () => {
          try {
            return await env.DB.prepare(
              `DELETE FROM teacher_unavailability WHERE id = ? AND created_by = '결재 자동반영'`
            ).bind(Number(orig.linked_id)).run();
          } catch (e) {
            failed = true;
            console.error('[approval-reverse] 근무불가 조회 실패', (e as any)?.message || e);
            return null as any;
          }
        })();
        if (failed) {
          left.push('근무불가 기록을 읽지 못했습니다 — 해제됐는지 캘린더에서 직접 확인해 주세요');
        } else if (d && d.meta && d.meta.changes) {
          undone.push('강사 근무불가를 해제했습니다(예약이 다시 열립니다)');
          await safe(async () => {
            await env.DB.prepare(`UPDATE approval_requests SET linked_id = NULL WHERE id = ?`)
              .bind(originalId).run();
            return true;
          }, false);
        } else {
          left.push('이 결재가 만든 근무불가를 찾지 못했습니다(사람이 손댔거나 이미 지워짐) — 캘린더에서 직접 확인해 주세요');
        }
      } else {
        left.push('이 휴가로 만들어진 근무불가가 없습니다(본사 직원 휴가일 수 있습니다)');
      }
      left.push('그 기간에 이미 옮기거나 취소한 수업은 되돌아오지 않습니다 — 사람이 확인해야 합니다');
    }

    // 💼 인사·급여 — 그 달의 확정을 푼다.
    if (orig.req_type === 'hr' && orig.hr_kind && orig.period) {
      await safe(async () => { await ensureHrTable(env); return true; }, false);
      const ok = await unlockPeriod(env, String(orig.hr_kind), String(orig.period), originalId);
      if (ok) undone.push(String(orig.period) + ' 확정을 풀었습니다');
      // ⛔ 여기서도 「남의 잠금이었다」로 단정하지 않는다 — 못 읽었을 수도 있다.
      else left.push(String(orig.period) + ' 확정은 풀지 못했습니다(이 결재가 건 잠금이 아니거나 읽지 못함) — 직접 확인해 주세요');
      left.push('이미 지급·정산이 나갔다면 그것은 되돌아오지 않습니다 — 사람이 확인해야 합니다');
    }

    console.log('[approval-reverse] 취소 반영', JSON.stringify({
      originalId, reversalId, by, cancelled, undone, left,
    }));
  } catch (e) {
    // 삼키되 반드시 남긴다 — 취소 결재는 이미 승인된 뒤다.
    left.push('되돌리는 중 오류가 났습니다 — 사람이 확인해야 합니다');
    console.error('[approval-reverse] 실패 — 손으로 확인 필요. original=' + originalId, (e as any)?.message || e);
  }
  return { cancelled, undone, left };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🏖️ 휴가 승인 → 기존 «강사 근무불가» 에 반영
 *
 *   왜 이렇게 하나 — 휴가는 이미 캘린더(teacher_unavailability)에 있던 기능이다.
 *   결재함에 또 만들면 **두 곳에 같은 정보**가 생기고 반드시 어긋난다.
 *   그래서 신청 창구만 결재함으로 모으고, 저장은 원래 자리에 그대로 둔다.
 *   결재함은 «올린다 → 승인된다» 까지만 하고, 그 결과를 원래 표에 적어 준다.
 *
 *   ⚠️ 실패해도 결재 자체는 이미 승인된 상태다(여기서 예외를 던지지 않는다).
 *      대신 못 붙였다는 사실을 로그로 남긴다 — 조용히 사라지면 «승인은 됐는데
 *      예약은 안 막힌» 상태를 아무도 모른다.
 *   ⚠️ 같은 결재로 두 번 만들지 않는다(linked_id). 재시도·중복 클릭 방어.
 * ═════════════════════════════════════════════════════════════════════════ */
async function applyLeaveToCalendar(env: ApprovalEnv, req: any, reqId: number): Promise<void> {
  try {
    if (req.linked_id) return;                       // 이미 반영됨

    // 강사 명단에서 이 사람을 찾는다. 이름이 정본이다(teacher_unavailability 가 그렇게 쓴다).
    const nm = String(req.requester_name || '').replace(/(선생님?|쌤)$/, '').trim();
    if (!nm) { console.warn('[approval-leave] 이름이 없어 근무불가를 못 만듦', reqId); return; }
    const t: any = await safe(async () => await env.DB.prepare(
      `SELECT id, name FROM teachers WHERE name = ? OR name LIKE ? LIMIT 1`
    ).bind(String(req.requester_name), '%' + nm + '%').first(), null);

    if (!t?.id) {
      // 강사가 아닌 본사 직원의 휴가 — 막을 수업이 없으므로 근무불가를 만들지 않는다. 정상이다.
      console.log('[approval-leave] 강사 명단에 없음(본사 직원 휴가로 봄)', reqId, nm);
      return;
    }

    /* ⚠️ teacher_unavailability 를 여기서 **만들지 않는다.**
       이 표의 주인은 api-admin.ts 다. CREATE TABLE IF NOT EXISTS 는 «먼저 실행된 것이 이기므로»,
       여기서 한 벌 더 만들면 컬럼이 모자란 표가 먼저 생겨 주인 쪽 코드가 깨질 수 있다
       (test-harness/schema_drift_harness 가 정확히 이걸 잡는다 — 2026-08-16 실제로 걸렸다).
       표가 없으면 아래 INSERT 가 실패하고, catch 가 «손으로 넣어야 한다» 고 남긴다. */
    const ins = await env.DB.prepare(
      `INSERT INTO teacher_unavailability
         (teacher_id, teacher_name, kind, start_date, end_date, day_of_week, start_time, end_time,
          reason, created_by, created_at)
       VALUES (?, ?, 'date_range', ?, ?, NULL, NULL, NULL, ?, ?, ?)`
    ).bind(
      String(t.id), String(t.name),
      String(req.date_from), String(req.date_to || req.date_from),
      ('휴가 결재 #' + reqId + (req.title ? (' · ' + String(req.title).slice(0, 60)) : '')).slice(0, 300),
      '결재 자동반영', Date.now()
    ).run();

    const newId = Number(ins?.meta?.last_row_id || 0);
    if (newId) {
      await safe(async () => {
        await env.DB.prepare(`UPDATE approval_requests SET linked_id = ? WHERE id = ?`).bind(newId, reqId).run();
        return true;
      }, false);
    }
    console.log('[approval-leave] 근무불가 등록', JSON.stringify({ reqId, unavailId: newId, teacher: t.name }));
  } catch (e) {
    // ⚠️ 삼키되 반드시 남긴다 — 결재는 승인됐는데 예약이 안 막힌 상태를 사람이 알아야 한다.
    console.error('[approval-leave] 근무불가 등록 실패 — 손으로 넣어야 합니다. reqId=' + reqId, (e as any)?.message || e);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 라우터
 * ═════════════════════════════════════════════════════════════════════════ */

export async function handleApprovalApi(
  request: Request, url: URL, env: ApprovalEnv
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith('/api/approval/')) return null;
  const method = request.method;

  const actor: any = await getAdminActor(request, env as any);
  if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);

  // 강사도 긴급·고객불만은 올릴 수 있어야 하므로, 여기서 통째로 막지 않는다.
  //   대신 아래 각 엔드포인트가 분류별로 판정한다(canSubmit · canView).
  //   ⚠️ index.ts 의 TEACHER_BLOCKED_PREFIXES 는 여전히 /api/approval 을 막고 있다.
  //      강사에게 열어 준 경로만 거기서 예외로 빼 두었다.
  /* 🪪 (2026-09-24) «지금 누구로 들어와 있는가» 를 함께 싣는다 — 부르는 사람 «자신» 의 계정이라
     새로 새는 것이 없다(/api/admin/me 가 이미 준다). 결재 화면(work.html)이 이 403 을
     «로그인 필요» 로 읽고 로그인 창으로 돌려보내, 지사 계정이 «자꾸 다시 로그인하라» 에 갇혔었다.
     ⛔ 이 403 을 401 로 바꾸지 말 것 — 화면이 둘을 갈라야 «권한 없음» 과 «로그인 필요» 를 말한다. */
  const who = teacherWhoLabel({ username: actor.username, name: actor.name });
  if (!isHqStaff(actor) && !actor.isTeacher) {
    return json({
      ok: false, error: 'forbidden',
      message: '본사 계정만 사용할 수 있습니다.',
      message_en: 'Head-office accounts only.',
      who,
    }, 403);
  }
  await ensureTable(env);

  const ph = isPhManager(actor);
  const iAmExec = isExec(actor);
  /* 💳 돈 나가는 건의 «결재권자» 인가 — 확인(ack) 대상에서 빠진다.
     결재권자는 결재로 이미 그 건을 봤다(2026-09-09 사장님 「확인은 대표만 보이게」). */
  const iAmMoneyApprover = isMoneyApprover(actor);
  const iAmAckViewer = iAmExec && !iAmMoneyApprover;

  // ── 화면 한 번에 채우기 ───────────────────────────────────────────────────
  //   /work 는 이 응답 하나로 첫 화면을 그린다. 회선이 느린 곳에서 왕복 횟수가 곧 체감 속도다.
  if (method === 'GET' && path === '/api/approval/home') {
    const me = String(actor.username);

    /* ── 바뀐 게 없으면 본문을 아예 안 보낸다 ────────────────────────────────
     *   필리핀에서 가장 크게 아끼는 지점이다. 결재함을 하루에 열 번 열어도
     *   내용이 그대로면 열 번 다 «변경 없음(304)» 으로 끝난다 — 본문 0바이트.
     *   서명은 «내가 누구인가 + 결재 표가 어디까지 움직였는가» 로 만든다.
     *   ⚠️ 시각(now)을 넣지 않는다. 넣으면 매번 달라져서 304 가 영영 안 나온다.
     *      그래서 rowOf 도 «지금 지연인가» 를 담지 않는다(화면이 계산한다).
     *   ⚠️ 계정명을 서명에 넣는 이유 — 같은 브라우저를 다른 사람이 쓰면 서명이 어긋나
     *      304 가 아니라 자기 데이터를 새로 받는다. */
    const sig: any = await safe(async () => await env.DB.prepare(
      /* ✅ exec_ack_at 을 빠뜨리면 «확인» 을 눌러도 서명이 그대로라 304 가 나가고,
            다른 기기의 화면이 이미 확인한 건을 최대 한 시간 계속 보여 준다
            (위 「달을 확정하면」·「대결이 바뀌어도」와 같은 이유). */
      `SELECT COUNT(*) AS c, IFNULL(MAX(created_at),0) AS mc, IFNULL(MAX(decided_at),0) AS md,
              IFNULL(MAX(IFNULL(escalated_at,0)),0) AS me2,
              IFNULL(MAX(IFNULL(exec_ack_at,0)),0) AS mk
         FROM approval_requests`
    ).first(), null);
    // 대결(위임)이 바뀌어도 화면이 달라진다 — 서명에 함께 넣는다.
    const dsig: any = await safe(async () => await env.DB.prepare(
      `SELECT COUNT(*) AS c, IFNULL(MAX(updated_at),0) AS mu FROM approval_delegates`
    ).first(), null);
    // 💼 달을 확정하면 «고를 수 있는 달» 이 달라진다 — 서명에 함께 넣는다.
    //    (안 넣으면 304 로 옛 목록이 남아 이미 확정한 달이 계속 보인다)
    const lsig: any = await safe(async () => await env.DB.prepare(
      `SELECT COUNT(*) AS c, IFNULL(MAX(approved_at),0) AS ma FROM approval_period_locks`
    ).first(), null);
    // 긴급 목록은 «최근 7일» 이라 시간이 지나면 저절로 빠진다. 표가 안 바뀌어도 목록은 바뀌므로
    // 한 시간 단위의 눈금을 하나 섞는다(1시간마다 한 번은 전체를 다시 받는다).
    // 🧭 「이 건을 결재할 사람이 몇 명인가」가 바뀌면 «막힘» 표시도 바뀐다 — 서명에 함께 넣는다.
    //    ⚠️ 계정 «수» 만 본다. 이름을 「…이사」로 고쳐 경영진이 되는 경우(isExec 의 이름 안전장치)는
    //       이 숫자가 그대로라 못 잡지만, 아래 hourBucket 이 한 시간에 한 번은 전체를 다시 받게 한다.

    const hsig: any = await safe(async () => await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM admin_scope WHERE scope_type = 'hq'`
    ).first(), null);
    const hourBucket = Math.floor(Date.now() / 3600_000);
    const etag = `W/"a10-${me}-${sig?.c || 0}-${sig?.mc || 0}-${sig?.md || 0}-${sig?.me2 || 0}` +
                 `-${dsig?.c || 0}-${dsig?.mu || 0}-${lsig?.c || 0}-${lsig?.ma || 0}` +
                 `-${hsig?.c || 0}-${sig?.mk || 0}-${hourBucket}"`;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      // no-store 가 아니라 no-cache — «저장은 하되 쓰기 전에 반드시 확인» 이라는 뜻이다.
      // private 라 중간 캐시(CDN·회사 프록시)에는 절대 안 남는다.
      'Cache-Control': 'private, no-cache, must-revalidate',
      'Vary': 'Cookie',
      'ETag': etag,
    };
    if (request.headers.get('If-None-Match') === etag) {
      return new Response(null, { status: 304, headers });
    }

    /* ⚠️ 아래 요약 조회는 **304 «뒤»** 에 둔다 — 이 응답의 설계가 「내용이 그대로면
       열 번 다 304, 본문 0바이트」다. 위에 두면 캐시로 끝나는 요청마다 GROUP BY 가 돈다
       (2026-09-04 함정 대조 지적). ETag 서명에는 approval_requests 의 건수·최종 시각이
       이미 들어 있어, 결재가 새로 올라오거나 결재되면 이 숫자도 함께 바뀐다. */
    /* ═══ 🧭 맨 위 요약(D안) — 「아침에 한 번 열어 보는 화면」 ═══════════════
       [왜 SQL 집계를 그대로 써도 되는가]
         C안(지출 정리)은 canView 를 못 걸어 «행을 읽어 코드로» 세지만, 여기는 범위를
         **canView 가 무조건 통과시키는 두 가지**로만 잡는다 —
           ① 경영진 → 세 열람등급을 전부 통과(approval-policy 의 canView)
           ② 그 밖 → 본인이 올린 것만(「내가 올린 건은 언제나 본다」)
         그래서 SQL 이 준 행이 곧 «볼 수 있는 행» 이고 거를 것이 없다.
       ⛔ 이 조건을 «본사 직원은 전체» 로 넓히지 말 것 — 그 순간 인사·급여가 요약으로 샌다
          (2026-09-04 에 C안에서 실제로 그랬다).
       ⚠️ 달 눈금은 지출 정리와 **같은 규칙**이다(지출일이 있으면 그것, 없으면 올린 날).
          두 화면이 다른 달로 자르면 사람이 숫자가 안 맞는다고 느낀다. */
    const nowMonth = kstMonth(Date.now());
    const sumAll = iAmExec;                      // 경영진만 전체
    /* 🔴 「금액 없음」은 **돈이 나가는 분류에서만** 센다 — 긴급·휴가·문서는
       needsAmount:false 라 «원래» 금액이 없다. 그것까지 세면 화면이 멀쩡한 결재를
       «덜 채워진 것» 처럼 말하고, 같은 화면의 지출 정리(C안)와 **다른 숫자**를 말한다.
       2026-09-04 함정 대조 실측: 같은 데이터에서 타일 6건 대 지출 정리 0건.
       ⚠️ 목록은 정본(TYPES.wantsCategory)에서 만든다 — 여기에 손으로 적으면
          분류를 늘릴 때 조용히 어긋난다. */
    /* ⚠️ `IN (?,?,…)` 를 만들지 않는다 — 이 저장소는 그 자리표시자 생성을 금지한다
       (D1 바인드 100 한도. 조직 스코프도 같은 이유로 «콤마 문자열 한 개» 를 쓴다).
       바인드 하나로 끝내고, 분류가 늘어도 자리표시자 수가 안 변한다. */
    const spendCsv = ',' + TYPES.filter(t => t.wantsCategory).map(t => t.key).join(',') + ',';
    /* ⚠️ spent_at 은 저장할 때 형식을 안 본다 — 날짜가 아니면 substr 이 엉뚱한 글자를 내고
       그 건이 «올해가 아님» 으로 통째로 사라진다(에러 없이). C안 monthOf 가 정규식으로
       거르는 것과 같은 판정을 SQL 로 한다. */
    const YMD = "spent_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'";
    const moneyRows = await safe(async () => {
      const st = env.DB.prepare(
        `SELECT COALESCE(NULLIF(currency,''),'PHP') AS cur,
                substr(CASE WHEN ${YMD} THEN spent_at
                            ELSE date(created_at/1000,'unixepoch','+9 hours') END, 1, 7) AS ym,
                COUNT(*) AS n, SUM(amount) AS total,
                SUM(CASE WHEN amount IS NULL
                          AND instr(?, ',' || req_type || ',') > 0 THEN 1 ELSE 0 END) AS no_amt
           FROM approval_requests
          WHERE status = 'approved'
            /* 🔁 «취소 결재» 자신은 지출이 아니다 — 금액을 들고 있는 것은 결재자가
               얼마짜리를 없애는지 보라고이지 합계에 넣으려는 것이 아니다.
               안 빼면 원본이 빠진 자리를 그대로 채워 **총액이 한 푼도 안 줄어든다.** */
            AND reverses_id IS NULL` + (sumAll ? '' : ' AND requester_username = ?') + `
          GROUP BY cur, ym`
      );
      const binds = sumAll ? [spendCsv] : [spendCsv, me];
      const r = await st.bind(...binds).all<any>();
      return (r.results || []) as any[];
    }, null);
    /* 🔴 조회가 실패하면 «0건» 이 아니라 «모른다» 다 — safe() 가 예외를 삼키므로
       화면이 그것을 «전체 0건 승인» 이라고 말하면 거짓이 된다(C안의 steps_missing 과 같은 자리). */
    const moneyFailed = moneyRows === null;
    const homeMoney = foldHomeMoney(moneyRows || [], nowMonth);

    /* 「진행 중」은 **정확한 수** 로 센다 — 아래 mine 은 최근 15건뿐이라 그것으로 세면
       16번째부터 조용히 빠진다. ⚠️ 이 숫자는 언제나 «내가 올린 것» 이다(경영진도 마찬가지) —
       「내가 올린 것이 어떻게 됐나」를 보는 칸이라 전체로 넓히면 뜻이 달라진다. */
    const openRow: any = await safe(async () => await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM approval_requests
        WHERE requester_username = ? AND status = 'pending'`
    ).bind(me).first(), null);
    const openFailed = !openRow;
    const myOpen = Number(openRow?.c || 0);

    /* 🗂 결재 보관함 카드(시안 A, 2026-09-08) — 「올해 몇 건 · 마지막 결재가 언제·누구」.
       범위는 금액 타일과 같다(경영진=전체 · 그 밖=내가 올린 것) — 한 줄에 놓인 카드가
       서로 다른 범위를 말하면 사람이 숫자가 안 맞는다고 느낀다.
       ⚠️ 마지막 결재는 approval_requests.decided_by 가 아니라 **approval_steps 의 도장**으로 본다 —
          앞 칸은 회수하면 기안자 이름이 들어간다(«결재» 가 아닌 것이 섞인다). */
    const yearFrom = nowMonth.slice(0, 4) + '-01-01';
    const archRow: any = await safe(async () => await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM approval_requests
        WHERE date(created_at/1000,'unixepoch','+9 hours') >= ?` + (sumAll ? '' : ' AND requester_username = ?')
    ).bind(...(sumAll ? [yearFrom] : [yearFrom, me])).first(), null);
    const lastStamp: any = await safe(async () => await env.DB.prepare(
      `SELECT s.decided_by AS u, s.decided_at AS at
         FROM approval_steps s JOIN approval_requests r ON r.id = s.request_id
        WHERE s.decided_at IS NOT NULL AND s.status IN ('approved','rejected')` +
        (sumAll ? '' : ' AND r.requester_username = ?') +
      ` ORDER BY s.decided_at DESC LIMIT 1`
    ).bind(...(sumAll ? [] : [me])).first(), null);
    let lastName: string | null = null;
    if (lastStamp?.u) {
      const acc = (await hqAccounts(env)).find(a => String(a.username) === String(lastStamp.u));
      lastName = acc?.name ? String(acc.name) : null;
    }
    const homeArchive = {
      year_from: yearFrom,
      /* 못 읽었으면 «0» 이 아니라 «모른다» — 화면이 «—» 로 그린다. */
      year_count: archRow ? Number(archRow.n || 0) : null,
      last_decided_at: lastStamp?.at ? Number(lastStamp.at) : null,
      last_decided_by: lastStamp?.u ? String(lastStamp.u) : null,
      last_decided_by_name: lastName,
      unknown: !archRow,
    };

    // ① 내가 결재할 것 — 내 단계이고, 내가 올린 건이 아닌 것
    //    정렬은 «마감이 급한 순 → 오래된 순». 시각에 기대지 않으므로 내용이 같으면 순서도 같다.
    const pendRs = await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_requests
        WHERE status = 'pending' AND requester_username != ?
        ORDER BY (stage_due_at IS NULL) ASC, stage_due_at ASC, created_at ASC LIMIT 40`
    ).bind(me).all<any>(), { results: [] as any[] } as any);

    const mineRs = await safe(async () => await env.DB.prepare(
      /* ↩️ origin_created_at 을 «함께 뽑는다» — rowOf 가 읽는 칸이라 안 뽑으면
         에러 없이 늘 빈 값이 되고, 회수·재작성한 건의 「N일째」가 조용히 1일로 돌아간다.
         (id 로 거는 PK 조회라 행이 늘어도 비용이 붙지 않는다.) */
      `SELECT *, (SELECT o.created_at FROM approval_requests o WHERE o.id = approval_requests.origin_id) AS origin_created_at, CASE WHEN approval_requests.status = 'withdrawn' THEN EXISTS(SELECT 1 FROM approval_requests c WHERE c.origin_id = approval_requests.id) ELSE 0 END AS has_child FROM approval_requests WHERE requester_username = ? ORDER BY created_at DESC LIMIT 15`
    ).bind(me).all<any>(), { results: [] as any[] } as any);

    // ③ 🚨 긴급 소통 — 조직 전원이 본다(강사 포함). 결재 권한과 무관하게 «보이는» 것이 목적이다.
    //    이게 없으면 강사·필리핀 매니저는 긴급 공지를 올릴 수는 있어도 남이 올린 것은 못 본다.
    const urgRs = await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_requests WHERE req_type = 'urgent' AND created_at >= ?
        ORDER BY created_at DESC LIMIT 10`
    ).bind((hourBucket * 3600_000) - 7 * 86400_000).all<any>(), { results: [] as any[] } as any);

    /* ④ ✅ 확인 대기 — 경영진에게만.
         결재는 이미 끝났고(필리핀에도 통보 완료) «봤다»는 도장만 남은 건이다.
         ⚠️ **막지 않는다.** 안 눌러도 업무는 그대로 흘러간다 — 그것이 설계 의도다.
         ⚠️ 결재권자(장 부장)에게는 뜨지 않는다 — iAmAckViewer. 결재를 하는 사람이지
            확인하는 사람이 아니다.
         ⚠️ 큰돈 건은 «같은 사람 연속 결재 금지»(sameDeciderBlocked) 덕에 대표님이 2단계를
            찍게 되어 decided_by 가 본인이 되고, 그래서 저절로 빠진다. 그 규칙을 끄면
            이 줄이 거짓이 된다.
         ⚠️ 최종 판정은 needsExecAck 한 곳이 한다. 여기 WHERE 는 그 판정과 «같은 말» 을
            미리 걸어 LIMIT 20 이 엉뚱한 행으로 채워지지 않게 하는 것뿐이다
            (한쪽만 고치면 목록에는 안 뜨는데 주소로 부르면 통과하는 상태가 된다).
            (다만 decided_by 비교는 SQL 에서도 해 둔다. 안 하면 대표님이 직접 찍은 건들이
             LIMIT 20 을 채워, 정작 확인해야 할 건이 창 밖으로 밀린다.) */
    const ackRs = iAmAckViewer ? await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_requests
        WHERE status = 'approved' AND exec_ack_at IS NULL AND cancelled_by_id IS NULL
          AND req_type IN ('purchase','expense')
          AND LOWER(IFNULL(decided_by,'')) <> LOWER(?)
        ORDER BY decided_at DESC LIMIT 20`
    ).bind(me).all<any>(), { results: [] as any[] } as any) : ({ results: [] as any[] } as any);

    // 단계는 **한 번에** 받는다 — 예전엔 행마다 따로 조회해서 쿼리가 40건 넘게 나갔다.
    const pend = (pendRs.results || []), mineRows = (mineRs.results || []), urgRows = (urgRs.results || []);
    const ackRows = (ackRs.results || []);
    const allIds: number[] = [];
    for (const r of pend) allIds.push(Number(r.id));
    for (const r of mineRows) if (allIds.indexOf(Number(r.id)) < 0) allIds.push(Number(r.id));
    for (const r of urgRows) if (allIds.indexOf(Number(r.id)) < 0) allIds.push(Number(r.id));
    for (const r of ackRows) if (allIds.indexOf(Number(r.id)) < 0) allIds.push(Number(r.id));
    const stepMap = await stepsByRequest(env, allIds);

    const inbox: any[] = [];
    for (const r of pend) {
      const steps = stepMap[Number(r.id)] || [];
      const seq = Number(r.stage_seq || 1);
      // 단계 기록이 없는 옛 건은 «staff 1단계»로 본다.
      const cur = steps.find((s: any) => Number(s.seq) === seq);
      const role = (cur?.role || 'staff') as any;
      if (!canDecideStage(actor, role, ph)) continue;
      if (!canView(actor, r.req_type, r.requester_username, chainUsers(steps), ph)) continue;
      const row: any = rowOf(r, steps, true);
      /* 💳 「대신 결재」 — 누를 수는 있지만 내가 «주» 결재자는 아닌 단계.
         화면이 그 사실을 말해야 한다. 안 그러면 경영진 화면에서 결재권자의 건이
         자기 일처럼 보여, 「결재는 장 부장이 한다」가 조용히 무너진다. */
      row.by_proxy = !isPrimaryApprover(actor, role, ph);
      /* 🖐 앞 단계를 내가 결재한 건 — 이 단계는 다른 결재자가 눌러야 한다(sameDeciderBlocked).
         화면이 그 사실을 말하지 않으면 「승인」을 눌렀다가 403 을 보게 되고,
         묶음 승인에서는 «조용히 빠진» 채 건수만 줄어든다.
         ⚠️ 판정은 정본 하나로 — 여기서 조건을 다시 적으면 서버와 화면이 어긋난다.
         ℹ️ steps 는 이미 받아 둔 것이라 추가 조회가 없다. */
      row.same_decider = sameDeciderBlocked({
        reqType: r.req_type,
        priorDeciders: steps
          .filter((s2: any) => Number(s2.seq) < seq && String(s2.status || '') === 'approved')
          .map((s2: any) => s2.decided_by),
        me, decision: 'approved',
      }).blocked;
      inbox.push(row);
      if (inbox.length >= 20) break;
    }

    // ② 내가 올린 것
    const mine: any[] = mineRows.map((r: any) => rowOf(r, stepMap[Number(r.id)] || [], true));

    /* ④ 확인 대기 — 최종 판정은 정본 needsExecAck 하나로 한다(위 SQL 은 «넓게 거르기»일 뿐). */
    const ackPending: any[] = [];
    for (const r of ackRows) {
      if (!needsExecAck({
        reqType: r.req_type, status: r.status, decidedBy: r.decided_by,
        ackAt: r.exec_ack_at, cancelledById: r.cancelled_by_id, me, isExec: iAmExec,
        isApprover: iAmMoneyApprover,
      })) continue;
      ackPending.push(rowOf(r, stepMap[Number(r.id)] || [], true));
    }

    /* 「올렸는데 어떻게 됐지」 — 아직 대기 중인 내 건에 «지금 결재할 수 있는 사람 수»를 붙인다.
       0명이면 기다려도 처리되지 않는다. 화면이 그 사실을 말할 수 있어야 한다.
       ⚠️ 대기 중인 건에만 붙인다 — 이미 끝난 건은 셀 이유가 없고, 그만큼 계정 조회도 아낀다. */
    const countJobs: Array<{ id: number; role: string; requester: string;
                            reqType?: string | null; priorDeciders?: (string | null)[] }> = [];
    for (const m of mine) {
      if (m.status !== 'pending') continue;
      const st = (m.steps || []).find((s: any) => Number(s.seq) === Number(m.stage_seq));
      countJobs.push({
        id: Number(m.id),
        role: String(st?.role || 'staff'),   // 단계 기록이 없는 옛 건은 «staff 1단계»로 본다(rowOf 와 같은 해석)
        requester: String(m.requester_username),
        /* 🖐 「앞 단계를 누가 찍었나」 — 같은 사람은 이 단계를 못 누르므로 세는 데서 빠져야 한다.
           ⚠️ 단계 조회가 실패하면 빈 배열이 되어 «고치기 전» 과 같은 수를 센다(막지 않는 쪽).
              서버 decide 가 최종 판정을 하므로 안전한 방향이고, 위 결재함 행도 같은 방향이다. */
        reqType: m.req_type,
        priorDeciders: (m.steps || [])
          .filter((s2: any) => Number(s2.seq) < Number(m.stage_seq) && String(s2.status || '') === 'approved')
          .map((s2: any) => s2.decided_by),
      });
    }
    const counts = await approverCounts(env, countJobs);
    for (const m of mine) {
      const n = counts[Number(m.id)];
      if (n === undefined) continue;         // 대기 중이 아닌 건 — 손대지 않는다
      m.approver_count = n;
      m.blocked = (n === 0);
    }

    const urgent: any[] = [];
    for (const r of urgRows) {
      if (String(r.requester_username) === me) continue;         // 내가 올린 건은 ② 에 이미 있다
      const steps = stepMap[Number(r.id)] || [];
      if (!canView(actor, r.req_type, r.requester_username, chainUsers(steps), ph)) continue;
      urgent.push(rowOf(r, steps, true));
    }

    // ④ 「지난번과 같이」 — 내가 최근에 올린 서로 다른 제목 3건
    const seen: string[] = [];
    const reuse: any[] = [];
    for (const r of mine) {
      const k = r.req_type + '|' + r.title;
      if (seen.indexOf(k) >= 0) continue;
      seen.push(k);
      /* 🏷️ 지출 항목도 함께 물려준다 — 「지난번과 같이」는 매달 같은 돈(인터넷 요금 등)에
         쓰는 기능이라, 항목이 안 따라오면 매번 다시 고르게 되어 결국 비어 있게 된다. */
      reuse.push({ req_type: r.req_type, title: r.title, body: r.body, amount: r.amount,
                   currency: r.currency, category: r.category || null });
      if (reuse.length >= 3) break;
    }

    /* 🔁 매달 반복 지출 — 서로 다른 달에 두 번 이상 «승인된» 같은 제목(인터넷비·정수기 …).
       맨 위에 «매달» 로 따로 보여 준다. 판정 정본 monthlyRepeats. 실패하면 조용히 예전 목록 그대로. */
    const monthlyRs = await safe(async () => (await env.DB.prepare(
      `SELECT req_type, title, body, amount, currency, category, created_at FROM approval_requests
        WHERE requester_username = ? AND status = 'approved' AND reverses_id IS NULL
          AND created_at >= ? ORDER BY created_at DESC LIMIT 60`
    ).bind(me, Date.now() - 120 * 86400_000).all<any>()).results || [], [] as any[]);
    const monthly = monthlyRepeats(monthlyRs as any[]).slice(0, 3);
    if (monthly.length) {
      const mk = monthly.map(m => m.req_type + '|' + String(m.title).trim().toLowerCase());
      const rest = reuse.filter(x => mk.indexOf(x.req_type + '|' + String(x.title || '').trim().toLowerCase()) < 0);
      reuse.length = 0;
      for (const m of monthly) reuse.push(Object.assign({ monthly: true }, m));
      for (const x of rest) { if (reuse.length >= 5) break; reuse.push(x); }
    }

    /* 📋 «자주 반려된 이유» — 최근 90일 반려 메모에서 반려 버튼 사유를 센다(정본 rejectTipsFrom).
       올리기 전 폼 위에 체크리스트로 보여 준다. 반려가 없으면 빈 배열이고 화면도 안 그린다. */
    const rejMemos = await safe(async () => ((await env.DB.prepare(
      `SELECT decide_memo FROM approval_requests
        WHERE status = 'rejected' AND decided_at >= ? ORDER BY decided_at DESC LIMIT 300`
    ).bind(Date.now() - 90 * 86400_000).all<any>()).results || []).map((r: any) => r.decide_memo), [] as any[]);
    const rejectTips = rejectTipsFrom(rejMemos as any[]);

    /* 💼 인사·급여로 확정할 수 있는 달 — 올릴 수 있는 사람에게만 내려보낸다.
       데이터가 있는 달만 담기므로, 화면은 그걸 버튼으로 그리기만 하면 된다(타이핑 없음). */
    let hrPeriods: any = null;
    if (canSubmit(actor, 'hr', ph)) {
      hrPeriods = await safe(async () => await listHrPeriods(env), null);
    }

    /* 🔗 수업 연기·변경 요청 대기 건수 — 결재할 수 있는 사람에게만.
       표를 옮기지 않는다. «저기에 N건 밀려 있다» 만 알려 주고 누르면 원래 화면으로 간다. */
    let scheduleWaiting = 0;
    if (!actor.isTeacher && isHqStaff(actor)) {
      const sc: any = await safe(async () => await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM schedule_change_requests WHERE status = 'pending'`
      ).first(), null);
      scheduleWaiting = Number(sc?.c || 0);
    }

    /* 🏖️ 대결(위임) — 결재자가 휴가·출장이면 결재가 그대로 멈춘다. 그걸 넘길 사람 목록.
       ⚠️ 결재할 수 있는 사람에게만 내려보낸다. 다른 사람에게는 직원 명부가 될 뿐이다. */
    let colleagues: any[] = [];
    let myDelegate: any = null;
    if (!actor.isTeacher && isHqStaff(actor) && !ph) {
      const accs = await hqAccounts(env);
      colleagues = accs
        .filter(a => String(a.username) !== me)
        .filter(a => PH_MANAGERS.indexOf(String(a.username).toLowerCase()) < 0)   // 필리핀 매니저는 결재 대상이 아니다
        .slice(0, 30)
        .map(a => ({ username: a.username, name: a.name || a.username }));
      const d: any = await safe(async () => await env.DB.prepare(
        `SELECT delegate_to, until_at FROM approval_delegates WHERE username = ? AND until_at > ? LIMIT 1`
      ).bind(me, Date.now()).first(), null);
      if (d) myDelegate = { delegate_to: d.delegate_to, until_at: d.until_at };
    }

    return new Response(JSON.stringify({
      ok: true,
      me: {
        username: actor.username, name: actor.name || null,
        is_exec: iAmExec, is_ph_manager: ph, is_teacher: !!actor.isTeacher,
      },
      colleagues, my_delegate: myDelegate,
      /* 🧭 맨 위 요약. scope 는 화면이 «어느 범위인지» 를 사람에게 말하는 데 쓴다 —
         경영진과 직원이 같은 타일에서 다른 숫자를 보므로 감추면 안 된다. */
      summary: {
        money: homeMoney,
        money_scope: sumAll ? 'all' : 'mine',
        my_open: myOpen,
        /* 🔴 「멈춤」을 몇 건에서 찾았는지 — **진행 중인 것 중 화면에 있는 수** 다.
           ⚠️ mine.length(15)를 쓰면 안 된다: mine 은 상태를 안 가리고 최근 15건이라
              my_open(대기만 센 수)과 «모집단이 다르다». 그러면
                · my_open 12 · mine 15(전부 승인·반려) → 12건을 하나도 못 봤는데 **침묵**
                · my_open 20 · mine 15(그중 대기 6) → 「15건 봤다」인데 실제로는 6건
              둘 다 거짓이 된다(2026-09-04 함정 대조 지적).
           ⚠️ mine 은 created_at DESC 라 **오래 멈춘 건일수록 창 밖으로 밀려난다** —
              이 기능이 존재하는 이유(5일 방치 건)가 정확히 그 모양이다. */
        my_open_shown: mine.filter((m: any) => m.status === 'pending').length,
        mine_shown: mine.length,
        /* 조회가 실패했으면 «0» 이 아니라 «모른다» 다 — 화면이 그 사실을 말한다. */
        money_unknown: moneyFailed,
        open_unknown: openFailed,
        /* 🗂 결재 보관함 카드 */
        archive: homeArchive,
        /* 결재함은 20건에서 자른다(inbox 루프) — 「내가 결재할 것」 타일이
           정확한 수처럼 보이지 않게 «그 이상» 임을 알려 준다. */
        inbox_capped: inbox.length >= 20,
        /* ✅ 「확인할 것 N건」 — 결재가 아니라 «봤다»는 도장이 남은 수.
           ⚠️ 지금 화면은 이 숫자를 «타일» 로 그리지 않는다(구역 자체가 0건이면 숨는다).
              결재함 배지(paintBadge)와 섞지 않으려고 일부러 따로 둔 값이다. */
        ack_pending: ackPending.length,
        ack_capped: ackPending.length >= 20,
        month: nowMonth,
      },
      can_approve: inbox.length > 0 || (!ph && isHqStaff(actor)),
      pending: inbox.length,
      types: TYPES.filter(t => canSubmit(actor, t.key, ph))
                  .map(t => ({ key: t.key, ko: t.ko, en: t.en, needs_amount: t.needsAmount,
                               wants_file: t.wantsFile, requires_file: !!t.requiresFile, wants_dates: !!t.wantsDates,
                               wants_category: !!t.wantsCategory,
                               // 💼 인사·급여는 «달을 고르는» 분류다. 화면이 폼 대신 월 버튼을 그린다.
                               picks_period: t.key === 'hr' })),
      /* 🏷️ 지출 항목 목록은 **서버가 내려준다** — 화면에 같은 목록을 또 적으면
         둘이 갈려 「화면에서는 골랐는데 저장이 안 되는」 사고가 난다(CLAUDE.md 2장). */
      /* 🔖 상태 목록 — 화면이 손으로 적으면 상태가 늘 때 «그 상태로 못 찾는» 칸이 생긴다. */
      statuses: STATUSES.map(st => ({ key: st.key, ko: st.ko, en: st.en })),
      categories: CATEGORIES.map(c => ({ key: c.key, ko: c.ko, en: c.en, account: c.account })),
      hr_periods: hrPeriods,
      inbox, mine, reuse, urgent, reject_tips: rejectTips,
      /* ✅ 확인 대기 — 경영진이 아니면 언제나 빈 배열이다(화면은 그러면 카드를 안 그린다). */
      ack_pending: ackPending,
      /* 🔗 수업 연기·변경 요청 — 결재함이 «가져오지» 않는다. 건수만 비춰 주고 원래 화면으로 보낸다.
         (같은 «요청 → 승인» 구조를 두 벌 만들면 반드시 어긋난다 — 데이터는 원래 자리에 둔다) */
      schedule_pending: scheduleWaiting,
    }), { status: 200, headers });
  }

  // ── 올리기 (기안) ─────────────────────────────────────────────────────────
  //   multipart/form-data. 첨부는 없어도 된다(영수증 없는 기안이 실제로 더 많다).
  if (method === 'POST' && path === '/api/approval/requests') {
    // ⚠️ try 밖에 둔다 — 아래 catch 에서 «이미 저장된 건» 을 찾을 때 이 값이 필요하다.
    let clientKey: string | null = null;
    try {
      const form = await request.formData();
      const reqType = String(form.get('req_type') || 'expense');
      if (REQ_TYPES.indexOf(reqType) < 0) return json({ ok: false, error: 'bad_req_type', allowed: REQ_TYPES }, 400);
      // ⚠️ ph 를 함께 넘긴다 — 화면에서 안 보여도 주소로 직접 부르면 뚫리므로 서버에서 막는다.
      if (!canSubmit(actor, reqType, ph)) {
        return json({
          ok: false, error: 'forbidden_type',
          message: '이 분류는 올릴 수 없습니다.',
          message_en: 'You cannot submit this category.',
        }, 403);
      }

      /* 🔁 멱등성 — «저장은 됐는데 응답을 못 받은» 경우를 구제한다.
       *   필리핀 회선에서 이건 드문 일이 아니다. 화면은 실패로 보고 다시 보내는데,
       *   그때 예전에는 **지출 결재가 두 건**이 됐다. 이제는 같은 열쇠면 원래 건을 돌려준다.
       *   ⚠️ 새로 저장하기 «전»에 확인한다. 뒤에서 하면 첨부가 R2 에 두 번 올라간다. */
      clientKey = String(form.get('client_key') || '').trim().slice(0, 64) || null;
      if (clientKey) {
        const dup: any = await safe(async () => await env.DB.prepare(
          `SELECT id, status FROM approval_requests WHERE requester_username = ? AND client_key = ? LIMIT 1`
        ).bind(actor.username, clientKey).first(), null);
        if (dup) return json({ ok: true, id: dup.id, duplicate: true, status: dup.status });
      }

      /* 🛡️ 도배 제한 — 한 사람이 1분에 10건 넘게 올릴 일은 없다.
       *   실수로 반복 전송되는 경우(버튼 연타·큐 폭주)를 막는 안전장치이지, 사람을 막는 규칙이 아니다. */
      const burst: any = await safe(async () => await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM approval_requests WHERE requester_username = ? AND created_at > ?`
      ).bind(actor.username, Date.now() - 60_000).first(), null);
      if (Number(burst?.c || 0) >= 10) {
        return json({
          ok: false, error: 'too_many',
          message: '잠시 후 다시 시도해 주세요. 짧은 시간에 너무 많이 올렸습니다.',
          message_en: 'Please wait a moment — too many requests were submitted in a short time.',
        }, 429);
      }

      /* 💼 인사·급여 «월 확정» — 올리는 사람은 **달과 종류만** 고른다.
         금액·인원은 서버가 급여/평가 표를 읽어서 채운다.
         ⚠️ 이게 이 기능의 핵심 성질이다 — 숫자를 손으로 적지 않으므로
            «올릴 때 잘못 적는» 사고가 구조적으로 불가능하다. */
      let hrKind: string | null = null, period: string | null = null, hrSnap: any = null;
      if (reqType === 'hr') {
        const k = String(form.get('hr_kind') || '').trim();
        const p = String(form.get('period') || '').trim();
        if (k || p) {
          if (!isHrKind(k)) return json({ ok: false, error: 'bad_hr_kind', allowed: HR_KINDS }, 400);
          if (!isPeriod(p)) return json({ ok: false, error: 'bad_period', hint: 'YYYY-MM' }, 400);
          await ensureHrTable(env);
          // 같은 달을 두 번 확정하지 않는다 — 먼저 승인된 기록이 정본이다.
          const locked = await getLock(env, k, p);
          if (locked) {
            return json({
              ok: false, error: 'period_locked',
              message: p + ' 은(는) 이미 확정된 달입니다.',
              message_en: p + ' has already been confirmed.',
            }, 409);
          }
          hrKind = k; period = p;
          hrSnap = await buildHrSnapshot(env, k, p);
        }
      }

      const title = hrSnap ? String(hrSnap.title_ko) : String(form.get('title') || '').trim().slice(0, 200);
      if (!title) return json({ ok: false, error: 'title_required' }, 400);

      const body = hrSnap ? String(hrSnap.body_ko) : String(form.get('body') || '').trim().slice(0, 4000);
      /* 🏷️ 지출 항목 — 예전에는 60자 «자유 문자열» 이었다(화면이 한 번도 안 보냈다).
         자유 입력이면 같은 항목이 「인터넷요금」·「인터넷 요금」·「통신비」로 쌓여
         나중에 합계가 조용히 갈라진다. 정본 목록(approval-policy.CATEGORIES)으로 맞춘다.
         ⛔ 모르는 값에 400 을 주지 않는다 — 결재를 못 올리게 막는 쪽이 더 나쁘다.
         ⛔ 돈이 안 나가는 분류(휴가·불만·인사)에는 아예 안 넣는다 — 지출 합계가 흐려진다. */
      const category = typeSpec(reqType).wantsCategory
        ? normCategory(String(form.get('category') || ''))
        : null;
      const spentAt = String(form.get('spent_at') || '').trim().slice(0, 10) || null;
      const currency = normCurrency(String(form.get('currency') || 'PHP'));

      // 🏖️ 휴가 기간 — 승인되면 이 값으로 예약을 막는다. 형식이 어긋나면 여기서 거절한다
      //    (승인 시점에 조용히 실패하면 «승인은 됐는데 예약은 안 막힌» 상태가 된다).
      const dRe = /^\d{4}-\d{2}-\d{2}$/;
      let dateFrom: string | null = null, dateTo: string | null = null;
      if (typeSpec(reqType).wantsDates) {
        dateFrom = String(form.get('date_from') || '').trim();
        dateTo = String(form.get('date_to') || '').trim() || dateFrom;
        if (!dRe.test(dateFrom)) {
          return json({
            ok: false, error: 'date_required',
            message: '휴가 시작 날짜를 골라 주세요.',
            message_en: 'Please pick a start date.',
          }, 400);
        }
        if (!dRe.test(dateTo) || dateTo < dateFrom) {
          return json({
            ok: false, error: 'date_range_invalid',
            message: '종료 날짜가 시작 날짜보다 빠릅니다.',
            message_en: 'The end date is before the start date.',
          }, 400);
        }
      }

      // 금액: 지출·물품일 때만 의미가 있다. 숫자가 아니면 **0 으로 때우지 않고 거절**한다 —
      //   금액이 0 으로 들어간 지출 결재는 승인자가 눈치채기 어렵다.
      let amount: number | null = null;
      const rawAmount = String(form.get('amount') || '').replace(/[,\s]/g, '');
      if (rawAmount) {
        const n = Number(rawAmount);
        if (!isFinite(n) || n < 0) return json({ ok: false, error: 'bad_amount' }, 400);
        amount = n;
      }
      const spec = typeSpec(reqType);
      if (spec.needsAmount && amount == null) return json({ ok: false, error: 'amount_required' }, 400);

      // 화면이 영수증을 미리 읽어 뒀다면 그 값을 함께 받는다(금액 대조용).
      let ocrAmount: number | null = null;
      const rawOcr = String(form.get('ocr_amount') || '').replace(/[,\s]/g, '');
      if (rawOcr) { const n = Number(rawOcr); if (isFinite(n) && n > 0) ocrAmount = n; }
      // 🔎 영수증에서 읽은 날짜·상점 — 날짜 대조와 AI 검토 재료. 형식이 아니면 버린다.
      const ocrSpentRaw = String(form.get('ocr_spent_at') || '').trim().slice(0, 10);
      const ocrSpentAt = /^\d{4}-\d{2}-\d{2}$/.test(ocrSpentRaw) ? ocrSpentRaw : null;
      const ocrVendor = String(form.get('ocr_vendor') || '').trim().slice(0, 60) || null;

      let fileKey: string | null = null, fileName: string | null = null;
      let fileExt: string | null = null, fileSize: number | null = null;
      let fileHash: string | null = null;
      const file = form.get('file') as File | null;
      if (file && file.size > 0) {
        if (file.size > MAX_FILE) return json({ ok: false, error: 'file_too_large', max: MAX_FILE }, 413);
        const ext = normExt((file.name.split('.').pop() || '').toLowerCase());
        if (ALLOWED_EXT.indexOf(ext) < 0) return json({ ok: false, error: 'invalid_type', allowed: ALLOWED_EXT }, 400);

        // 🛡️ 이름이 아니라 **내용**으로 확인한다. 이름표는 누구나 바꿀 수 있다.
        const bytes = new Uint8Array(await file.arrayBuffer());
        fileHash = await sha256Hex(bytes);
        const kind = sniffKind(bytes);
        if (!kind) {
          return json({
            ok: false, error: 'unreadable_file',
            message: '사진이나 PDF 로 보이지 않는 파일입니다. 다시 골라 주세요.',
            message_en: 'That file does not look like a photo or PDF. Please pick another.',
          }, 400);
        }
        // 이름은 .jpg 인데 내용은 PDF 인 경우 — 막지 않고 **실제 형식으로 고쳐서** 저장한다.
        // (휴대폰이 확장자를 엉뚱하게 붙이는 일이 실제로 있다. 사람을 막을 이유는 없다.)
        const realExt = kind;
        const ctype = contentTypeFor(realExt);

        const r2 = env.RECORDINGS;
        if (!r2) return json({ ok: false, error: 'r2_not_configured' }, 500);
        const key = `approval/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${realExt}`;
        await r2.put(key, bytes, { httpMetadata: { contentType: ctype } });
        fileKey = key; fileName = String(file.name || '').slice(0, 200); fileExt = realExt; fileSize = file.size;
      }

      /* ↩️ ② 회수한 건을 다시 올리는 경우 — 원본을 가리켜 둔다.
         ⚠️ 이게 없으면 「6일째 기다리는 중」이 다시 올리는 순간 «1일째» 로 초기화되어
            **지연이 조용히 감춰진다.** 화면은 이 값으로 원래 올린 날부터 센다.
         ⛔ 남의 건이나 «회수되지 않은» 건은 가리킬 수 없다 — 그러면 아무 건에나
            남의 날짜를 붙여 지연을 조작할 수 있다. 확인해서 아니면 그냥 비운다
            (400 을 주지 않는다 — 결재를 못 올리게 막는 쪽이 더 나쁘다). */
      let originId: number | null = null;
      let originCreatedAt: number | null = null;
      const rawOrigin = Number(String(form.get('origin_id') || '').trim());
      if (Number.isFinite(rawOrigin) && rawOrigin > 0) {
        const og: any = await safe(async () => await env.DB.prepare(
          `SELECT id, created_at, origin_id FROM approval_requests
            WHERE id = ? AND requester_username = ? AND status = 'withdrawn' LIMIT 1`
        ).bind(rawOrigin, actor.username).first(), null);
        if (og) {
          /* 여러 번 회수·재작성해도 «맨 처음» 을 가리킨다 — 사슬을 타고 올라가지 않아도
             되고, 「원래 언제 올렸나」가 중간 건으로 잘리지 않는다. */
          originId = Number(og.origin_id || og.id);
          const root: any = (originId === Number(og.id)) ? og : await safe(async () => await env.DB.prepare(
            `SELECT created_at FROM approval_requests WHERE id = ? LIMIT 1`
          ).bind(originId).first(), null);
          originCreatedAt = root ? Number(root.created_at) : Number(og.created_at);
        }
      }

      // 결재선·마감 — 사람이 고르지 않는다(approval-policy.stagesFor).
      const stages: Stage[] = stagesFor(reqType, amount, currency);
      const now = Date.now();
      const deadline = deadlineMs(reqType, now, stages.length);
      const stageDue = stageDeadlineMs(reqType, now);

      // 자동 점검 — 계산만. 여기서 나온 표시가 결재자의 판단 재료가 된다.
      const facts = await gatherCheckFacts(env, actor.username, reqType, amount, currency, ocrVendor);
      const receiptReusedCount = fileKey ? await receiptReuseCount(env, fileHash) : 0;
      const flags = runChecks({
        reqType, amount, currency, hasFile: !!fileKey, ocrAmount,
        duplicateCount: facts.duplicateCount, duplicateRecentCount: facts.duplicateRecentCount,
        monthTotal: facts.monthTotal, medianAmount: facts.medianAmount,
        body, spentAt, ocrSpentAt, now, receiptReusedCount,
        photoQuality: normPhotoQuality(form.get('photo_quality')),
        weekCount: facts.weekCount, vendor: ocrVendor, newVendor: facts.newVendor,
      });
      /* 🔎 필리핀에서 올라온 돈 나가는 건은 AI 가 내용을 한 번 더 읽는다 — 🟡 표시만 붙인다. */
      if (ph && spec.needsAmount && !hrSnap) {
        const concerns = await aiReview(env, { req_type: reqType, category, title, body, amount, currency, vendor: ocrVendor });
        for (const c of concerns) flags.push(c);
      }
      /* 💼 급여·평가는 «그 달이 아직 안 됐다» 는 신호가 판단 재료다 —
         강사 0명, 완료 수업 0회, 이미 지급 표시된 사람이 있음 등.
         이것도 AI 가 아니라 조회 결과다(approval-hr.ts). */
      if (hrSnap && Array.isArray(hrSnap.warnings)) {
        for (const w of hrSnap.warnings) {
          flags.push({ code: 'hr_notice', level: 'warn', ko: w.ko, en: w.en });
        }
      }

      const ins = await env.DB.prepare(
        `INSERT INTO approval_requests
           (req_type, requester_username, requester_name, title, body, category,
            amount, currency, spent_at, file_key, file_name, file_ext, file_size,
            status, created_at, stage_seq, stage_total, deadline_at, stage_due_at, ocr_amount, flags,
            client_key, date_from, date_to, hr_kind, period, origin_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(reqType, actor.username, actor.name || null, title, body || null, category,
             amount, currency, spentAt, fileKey, fileName, fileExt, fileSize, now,
             stages.length, deadline, stageDue, ocrAmount, JSON.stringify(flags), clientKey,
             dateFrom, dateTo, hrKind, period, originId).run();

      const reqId = Number(ins.meta.last_row_id);

      // 🧾 영수증 해시 — 따로 적는다(칸이 없는 DB 에서도 올리기는 성공해야 한다).
      if (fileKey && isSha256Hex(fileHash)) {
        await safe(async () => {
          await env.DB.prepare(`UPDATE approval_requests SET file_hash = ? WHERE id = ?`).bind(fileHash, reqId).run();
          return true;
        }, false);
      }
      // ❓ 영수증 가게 이름 — 역시 따로(칸이 없어도 올리기는 성공해야 한다).
      if (ocrVendor) {
        await safe(async () => {
          await env.DB.prepare(`UPDATE approval_requests SET vendor = ? WHERE id = ?`).bind(ocrVendor, reqId).run();
          return true;
        }, false);
      }

      // 단계 기록 — 1단계는 바로 열리고, 나머지는 대기.
      for (const st of stages) {
        await safe(async () => {
          await env.DB.prepare(
            `INSERT INTO approval_steps (request_id, seq, role, status, started_at)
             VALUES (?, ?, ?, ?, ?)`
          ).bind(reqId, st.seq, st.role, st.seq === 1 ? 'active' : 'waiting', st.seq === 1 ? now : null).run();
          return true;
        }, false);
      }

      /* 한 줄 요약 — 결재당 1회. 실패해도 기안은 이미 저장된 뒤다.
         ⚠️ 인사·급여는 부르지 않는다. 서버가 이미 정확한 문장을 만들어 뒀고,
            **AI 가 금액을 바꿔 쓸 여지를 아예 남기지 않는 편이 낫다.** */
      const sum = hrSnap ? null : await summarize(env, {
        req_type: reqType, requester_name: actor.name, requester_username: actor.username,
        amount, currency, title, body,
      });
      if (sum) {
        await safe(async () => {
          await env.DB.prepare(`UPDATE approval_requests SET summary_ko = ?, summary_en = ? WHERE id = ?`)
            .bind(sum.ko || null, sum.en || null, reqId).run();
          return true;
        }, false);
      }

      /* 🚦 신호등 + 🤖 자동 반려(2026-09-24).
           스위치(KV approval_autoreject) — 'shadow'(기본) = 표시만 · 'on' = 🔴 를 되돌림 · 'off'.
           ⛔ 되돌리는 것은 «서류 보완 요청» 이다 — 돈이 나가는 쪽이 아니다. 승인은 절대 안 한다.
           ⛔ 경영진이 올린 건 · 긴급 · 인사급여 · 취소 결재는 되돌리지 않는다(autoRejectable). */
      const sig = signalOf({ reqType, amount, ocrAmount, hasFile: !!fileKey, flags });
      const arMode = await readAutoRejectMode(env);
      if (arMode === 'on' && autoRejectable({ signal: sig.signal, reqType, requesterIsExec: iAmExec, reversesId: null })) {
        const memoKo = sig.reasons.map(x => x.ko).join(' / ');
        const memoEn = sig.reasons.map(x => x.en).join(' / ');
        const memo = ('[AI 자동 점검] ' + memoKo + '\n[AI check] ' + memoEn).slice(0, 1000);
        const up = await safe(async () => await env.DB.prepare(
          `UPDATE approval_requests SET status = 'rejected', decided_by = 'ai-auto', decided_at = ?, decide_memo = ?
            WHERE id = ? AND status = 'pending' AND IFNULL(stage_seq, 1) = 1`
        ).bind(now, memo, reqId).run(), null as any);
        if (up && up.meta && up.meta.changes) {
          await safe(async () => {
            await env.DB.prepare(
              `UPDATE approval_steps SET status = 'rejected', decided_by = 'ai-auto', decided_at = ?, memo = ?
                WHERE request_id = ? AND seq = 1`
            ).bind(now, memo, reqId).run();
            return true;
          }, false);
          await notify(env, [String(actor.username)], 'Returned — please fix and resubmit',
                       sig.reasons.map(x => x.en).join(' / ').slice(0, 120), reqId, 'approval-result');
          return json({
            ok: true, id: reqId, stages: stages.length, flags, summary: sum || null,
            auto_rejected: true, signal: sig.signal, reasons: sig.reasons,
            origin_id: originId, origin_created_at: originCreatedAt,
          });
        }
      }

      // 1단계 결재자에게 알림(대결 포함).
      const targets = await approversFor(env, stages[0].role, actor.username);
      const deleg = await delegatesOf(env, targets);
      for (const d of deleg) if (targets.indexOf(d) < 0) targets.push(d);
      const spec2 = typeSpec(reqType);
      const n1 = await notify(
        env, targets,
        (spec2.en) + ' · ' + (actor.name || actor.username),
        title.slice(0, 80),
        reqId, 'approval',
        quickApprovable({ signal: sig.signal, reqType }) ? 1 : 0,
      );
      // 🚨 긴급만 문자로도 보낸다. 사고·정전·학부모 항의는 «나중에 열어 보면» 늦다.
      //    나머지 분류는 푸시와 배지로 충분하다(문자는 돈이 든다).
      if (reqType === 'urgent' && n1.missed.length) {
        await smsFallback(env, n1.missed,
          '[망고아이 긴급] ' + title.slice(0, 60) + '\n' + (actor.name || actor.username) + '\n' + siteUrl('/work?id=' + reqId));
      }
      /* 👀 대표님께 «이상한 것만» 즉시 — 결재권자 혼자 확정하는 소액 건(1단계 mgr)에서
         평소와 다른 신호가 있을 때만. 푸시만(문자 안 씀). 결재권자 본인·기안자는 빼고.
         ⚠️ «AI 가 영수증을 못 읽음»(ocr_unread) 은 알리지 않는다 — PDF 마다 울려 소음이 된다. */
      if (stages.length === 1 && stages[0].role === 'mgr' &&
          sig.reasons.some(x => EXEC_WATCH_CODES.indexOf(x.code) >= 0)) {
        const watchers = EXEC_USERNAMES.filter(u =>
          MONEY_APPROVERS.indexOf(u) < 0 && u !== String(actor.username));
        if (watchers.length) {
          await notify(env, watchers, 'Check · ' + (actor.name || actor.username),
                       (sig.signal === 'red' ? '🔴 ' : '🟡 ') + title.slice(0, 70), reqId, 'approval-watch');
        }
      }

      return json({
        ok: true, id: reqId, stages: stages.length, flags, summary: sum || null,
        signal: sig.signal, reasons: sig.reasons,
        origin_id: originId, origin_created_at: originCreatedAt,
      });
    } catch (e: any) {
      /* 두 기기가 «동시에» 재전송하면 위쪽 중복 확인을 둘 다 통과한 뒤 UNIQUE 인덱스에서 갈린다.
         그건 실패가 아니라 «이미 저장됨» 이다 — 원래 건을 찾아서 성공으로 돌려준다.
         (여기서 500 을 주면 화면이 또 재전송하고, 영영 반복된다.) */
      const msg = String(e?.message || e);
      if (clientKey && /UNIQUE|constraint/i.test(msg)) {
        const dup: any = await safe(async () => await env.DB.prepare(
          `SELECT id, status FROM approval_requests WHERE requester_username = ? AND client_key = ? LIMIT 1`
        ).bind(actor.username, clientKey).first(), null);
        if (dup) return json({ ok: true, id: dup.id, duplicate: true, status: dup.status });
      }
      return json({ ok: false, error: 'submit_failed', detail: msg }, 500);
    }
  }

  // ── 목록 (구 화면 호환) ───────────────────────────────────────────────────
  //   teacher.html 이 scope=mine · scope=pending 을 쓴다. 응답 모양을 바꾸지 않는다.
  if (method === 'GET' && path === '/api/approval/requests') {
    if (!isHqStaff(actor)) return json({ ok: false, error: 'forbidden' }, 403);
    const me = String(actor.username);
    const approver = !ph && isHqStaff(actor);

    /* 📂 결재 문서함 (2026-09-04) — 「지난 결재를 찾을 수 있게」
     *
     *   왜 — 화면이 「내가 올린 것」 최근 15건만 보여 줘서, 16번째부터는 볼 방법이 없었다.
     *   검색·기간·분류·상태 필터도 없었다(사장님 제보 「구분해서 정리해 저장한 곳이 있어?」).
     *
     *   ⚠️ 새 경로를 만들지 않는다 — 이미 등록된 이 경로에 **쿼리 파라미터만** 얹는다.
     *      새 API 는 관문이 셋이고(src/index.ts 인증·라우팅 + api-mango 위임) 그중 둘이
     *      공동 금지구역이다(CLAUDE.md 4-2).
     */
    const scope  = url.searchParams.get('scope') || 'mine';
    const q      = String(url.searchParams.get('q') || '').trim().slice(0, 60);
    const fType  = String(url.searchParams.get('type') || '').trim();
    const fStat  = String(url.searchParams.get('status') || '').trim();
    // 형제인 q 와 같이 길이를 자른다 — 정본 목록 대조라 주입은 안 되지만, 아주 긴 값이
    // 조건 조립까지 흘러가지 않게 입구에서 막는다(항목 key 는 길어야 열 몇 자다).
    const fCat   = String(url.searchParams.get('category') || '').trim().slice(0, 60);
    const from   = String(url.searchParams.get('from') || '').trim();   // YYYY-MM-DD (KST)
    const to     = String(url.searchParams.get('to') || '').trim();
    const csv    = url.searchParams.get('format') === 'csv';
    /* 📊 지출 정리 — 목록 대신 «합계» 를 돌려준다.
       ⚠️ 새 경로를 만들지 않는다(A안과 같은 이유 — 관문 셋 중 둘이 공동 금지구역). */
    /* 📒 간단 회계장부(12단계) — report 와 «같은» 읽기·거르기(canView)를 지나고 줄 목록만 다르게 낸다. */
    const ledger = url.searchParams.get('view') === 'ledger';
    const report = url.searchParams.get('view') === 'report' || ledger;
    /* 🗂 결재 보관함(시안 A) — 함 옆 건수. 새 경로를 만들지 않는다(같은 이유). */
    const facets = url.searchParams.get('view') === 'facets';
    /* 🗂 결재자별 함 — «그 사람이 결재한 건». all 과 같은 등급(결재 권한자만). */
    const fBy    = String(url.searchParams.get('decided_by') || '').trim().slice(0, 60);
    const limit  = report ? REPORT_MAX
                          : (csv ? 500 : Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20)));
    /* ⚠️ report 는 offset 을 무시한다 — 주소로 넣으면 «앞부분» 이 아니라 «중간만» 센
       합계가 나오는데 truncated 는 그 사실을 말하지 못한다. */
    const offset = report ? 0 : Math.max(0, Number(url.searchParams.get('offset')) || 0);

    if ((scope === 'pending' || scope === 'all' || fBy) && !approver) {
      return json({ ok: false, error: 'forbidden_scope' }, 403);
    }

    /* 🗂 함 옆 건수 — 정본 buildArchiveFacets 가 SQL 을 만들고 여기서는 돌리기만 한다.
       [왜 SQL 집계를 그대로 써도 되나] 범위가 canView 를 무조건 통과하는 것뿐이라서 —
         경영진=전체 · 그 밖=«내가 올린 것 ∪ 내가 도장 찍은 것»(정본 주석 참고).
       ⚠️ 하나라도 못 읽으면 그 칸은 null 로 두고 unknown 을 켠다 — «0건» 과 «못 읽음» 은 다르다. */
    if (facets) {
      const exec = iAmExec;                 // 경영진=전체(맨 위 타일과 같은 판정)
      const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      const F = buildArchiveFacets({ me, exec, ph, today });
      let unknown = false;
      const one = async (piece: { sql: string; binds: any[] }) =>
        safe(async () => await env.DB.prepare(piece.sql).bind(...piece.binds).first<any>(), null);
      const all = async (piece: { sql: string; binds: any[] }) =>
        safe(async () => (await env.DB.prepare(piece.sql).bind(...piece.binds).all<any>()).results || [], null);
      const tot = await one(F.totals);
      if (!tot) unknown = true;
      /* 기간 함은 «경계» 도 함께 내려준다 — 화면이 달 계산을 따로 하면 두 벌이 되어 어긋난다
         (서버는 KST 로 세고 화면은 브라우저 시계로 세는 식). */
      const bounds = archivePeriods(today);
      const periods: Record<string, { from: string; to: string; n: number | null }> = {};
      for (const k of Object.keys(F.periods)) {
        const r = await one(F.periods[k]);
        if (!r) unknown = true;
        periods[k] = { from: bounds[k].from, to: bounds[k].to, n: r ? Number(r.n || 0) : null };
      }
      const tyRows = await all(F.types);
      if (!tyRows) unknown = true;
      const types = TYPES.map(t => {
        const hit = (tyRows || []).find((r: any) => String(r.k) === t.key);
        return { key: t.key, ko: t.ko, en: t.en, n: tyRows ? Number(hit?.n || 0) : null };
      });
      /* 결재자별은 결재 권한자에게만 — 직원에게는 «누가 결재하는 사람인가» 명부가 될 뿐이다. */
      let approvers: any[] = [];
      if (approver) {
        const apRows = await all(F.approvers);
        if (!apRows) unknown = true;
        const names = await hqAccounts(env);
        approvers = (apRows || []).map((r: any) => {
          const acc = names.find(a => String(a.username) === String(r.u));
          return { username: String(r.u), name: acc?.name ? String(acc.name) : String(r.u), n: Number(r.n || 0) };
        });
      }
      return json({
        ok: true,
        facets: {
          /* «전체» 는 결재 권한자에게만 뜻이 있다 — 직원의 all_n 은 «내가 볼 수 있는 것» 이라 이름이 거짓이 된다 */
          all:     (approver && tot) ? Number(tot.all_n || 0) : null,
          mine:    tot ? Number(tot.mine_n || 0) : null,
          decided: tot ? Number(tot.decided_n || 0) : null,
          periods, types, approvers,
          approver_view: approver,
          today,
          unknown,
        },
      });
    }

    // 조건 조립은 정본 buildFindQuery 하나가 한다 — 여기서 다시 적지 않는다.
    const { cond, binds, order } = buildFindQuery({
      scope, me, q, type: fType, status: fStat, category: fCat, from, to, decidedBy: fBy,
    });

    /* 한 건 더 읽어 «다음이 있는가» 를 판정한다.
     *   ⛔ 그 +1 로 «몇 건 남았는지» 를 말하지 않는다 — 언제나 «1건» 이 되어 거짓이 된다.
     *   ⛔ 총 건수도 내려주지 않는다 — 아래 canView 로 거르므로 SQL COUNT 와 어긋난다.
     *      「1-20 / 총 50건」이 거짓말하느니 「더 보기」가 낫다. */
    const rs = await env.DB.prepare(
      'SELECT *, (SELECT o.created_at FROM approval_requests o WHERE o.id = approval_requests.origin_id) AS origin_created_at, ' +
      "CASE WHEN approval_requests.status = 'withdrawn' THEN EXISTS(SELECT 1 FROM approval_requests c WHERE c.origin_id = approval_requests.id) ELSE 0 END AS has_child FROM approval_requests" + cond + order + ' LIMIT ? OFFSET ?'
    ).bind(...binds, limit + 1, offset).all<any>().catch(() => ({ results: [] as any[] }));

    const rows = (rs.results || []);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // 단계는 한 번에 받는다 — 행마다 조회하면 목록 20건에 D1 조회가 20번 나간다.
    const stepMap = await stepsByRequest(env, page.map((r: any) => Number(r.id)));

    // 열람등급으로 한 번 더 거른다 — 인사·급여가 목록·CSV 에 섞여 나가지 않게.
    const items: any[] = [];
    for (const r of page) {
      const steps = stepMap[Number(r.id)] || [];
      if (!canView(actor, r.req_type, r.requester_username, chainUsers(steps), ph)) continue;
      items.push(rowOf(r, steps, !csv));
    }

    /* 📊 합계는 **행을 읽어서 코드로** 낸다.
       ⛔ SQL GROUP BY 로 하면 canView 를 못 걸어 인사·급여가 합계에 섞인다.
       🔴 그래서 **반드시 `items`**(canView 를 지난 것) 를 넘긴다 — 바로 위 CSV 와 같은 값이다.
          2026-09-04 에 여기에 `page`(거르기 «전»)를 넘겼다가 함정 대조 검사가 잡았다.
          그때 실측: 경영진이 아닌 본사 계정이 scope=all 로 열면 인사·급여 750,000 이
          승인 합계에, 900,000 이 대기 합계에 그대로 섞였다. **에러는 안 났다.**
       ⚠️ 상한이 있다 — 넘으면 «잘렸다» 고 말한다. 잘린 줄 모르고 보는 합계가 「모른다」보다 나쁘다. */
    if (report) {
      /* ⚠️ 단계 조회(stepsByRequest)는 swallowErrors 다 — 목록에서는 맞는 판단이지만
         (「단계를 못 읽었다고 결재함이 안 뜨면 안 된다」), **합계에서는** 청크 하나가
         실패하면 결재선이 빈 것으로 보여 chain 열람 행이 canView 에서 떨어지고
         **총액이 말없이 줄어든다.** 그래서 «단계를 하나도 못 읽었는가» 를 함께 내려보내
         화면이 그 사실을 말하게 한다. */
      const stepsMissing = page.length > 0 && Object.keys(stepMap).length === 0;
      if (ledger) {
        const L = ledgerFrom(items);
        return json({
          ok: true, ledger: L.rows, totals: L.totals, pending: L.pending, no_amount: L.no_amount,
          truncated: hasMore, max: REPORT_MAX, steps_missing: stepsMissing, scope, from, to,
        });
      }
      return json({
        ok: true,
        summary: summarizeApprovals(items),
        // page 는 상한까지 읽은 것 — 그보다 더 있으면 이 합계는 그 앞부분만 센 것이다
        truncated: hasMore,
        max: REPORT_MAX,
        // 엑셀은 500건까지라 그보다 많으면 화면 합계와 파일이 어긋난다 — 화면이 말해야 한다
        csv_max: 500,
        steps_missing: stepsMissing,
        scope, from, to,
      });
    }

    if (csv) return csvResponse(items);

    let pending = 0;
    if (approver) {
      const c: any = await safe(async () => await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM approval_requests WHERE status='pending' AND requester_username != ?`
      ).bind(me).first(), null);
      pending = Number(c?.c || 0);
    }
    return json({ ok: true, can_approve: approver, pending, items, has_more: hasMore, offset });
  }

  /* ── ✅ 확인 — 경영진이 «봤다»는 도장 ──────────────────────────────────────
       결재(decide)와 다른 점: 이미 확정된 건에 표시만 남긴다. 아무것도 막지 않고,
       상태도 바꾸지 않으며, 필리핀에도 알림이 가지 않는다(이미 통보가 끝난 건이다).
       ℹ️ 라우팅은 `/api/approval/` **접두사**로 이미 열려 있어 src/index.ts(공동 금지구역)를
          한 줄도 고치지 않는다. 인증 게이트도 같은 접두사로 걸린다. */
  const mAck = path.match(/^\/api\/approval\/requests\/(\d+)\/ack$/);
  if (method === 'POST' && mAck) {
    const id = Number(mAck[1]);
    if (!iAmExec) {
      return json({
        ok: false, error: 'forbidden',
        message: '확인은 경영진만 할 수 있습니다.',
        message_en: 'Only executives can confirm.',
      }, 403);
    }
    /* ⚠️ cancelled_by_id 를 함께 뽑는다 — 안 뽑으면 정본이 늘 undefined 를 받아
          «취소된 지출에도 도장이 찍히는» 상태가 되고, 목록 SQL 과 답이 갈린다. */
    const cur: any = await env.DB.prepare(
      `SELECT id, req_type, status, decided_by, exec_ack_at, exec_ack_by, cancelled_by_id
         FROM approval_requests WHERE id = ? LIMIT 1`
    ).bind(id).first().catch(() => null);
    if (!cur) return json({ ok: false, error: 'not_found' }, 404);

    /* 판정은 정본 하나로 — 화면·목록·여기가 같은 함수를 지나야 어긋나지 않는다. */
    if (!needsExecAck({
      reqType: cur.req_type, status: cur.status, decidedBy: cur.decided_by,
      ackAt: cur.exec_ack_at, cancelledById: cur.cancelled_by_id,
      me: String(actor.username), isExec: iAmExec, isApprover: iAmMoneyApprover,
    })) {
      return json({
        ok: false, error: 'not_ackable',
        already_acked: !!cur.exec_ack_at,
        message: cur.exec_ack_at ? '이미 확인한 결재입니다.' : '확인할 수 있는 결재가 아닙니다.',
        message_en: cur.exec_ack_at ? 'Already confirmed.' : 'This request is not awaiting your confirmation.',
      }, 409);
    }

    const now = Date.now();
    /* 조건부 UPDATE — 두 사람이 동시에 눌러도 먼저 찍힌 도장이 남는다(decide 와 같은 방식). */
    const up = await env.DB.prepare(
      `UPDATE approval_requests SET exec_ack_by = ?, exec_ack_at = ?
        WHERE id = ? AND status = 'approved' AND exec_ack_at IS NULL`
    ).bind(String(actor.username), now, id).run();
    if (!up.meta.changes) return json({ ok: false, error: 'already_acked' }, 409);

    return json({ ok: true, id, exec_ack_by: String(actor.username), exec_ack_at: now });
  }

  // ── 승인 / 반려 ───────────────────────────────────────────────────────────
  const mDecide = path.match(/^\/api\/approval\/requests\/(\d+)\/decide$/);
  if (method === 'POST' && mDecide) {
    const id = Number(mDecide[1]);
    const cur: any = await env.DB.prepare(`SELECT * FROM approval_requests WHERE id = ? LIMIT 1`)
      .bind(id).first().catch(() => null);
    if (!cur) return json({ ok: false, error: 'not_found' }, 404);

    // 이미 결재된 건을 덮어쓰지 않는다 — 두 사람이 동시에 눌렀을 때 나중 것이 먼저 것을 지운다.
    if (cur.status !== 'pending') {
      return json({ ok: false, error: 'already_decided', status: cur.status, decided_by: cur.decided_by }, 409);
    }
    if (String(cur.requester_username) === String(actor.username)) {
      return json({
        ok: false, error: 'forbidden',
        message: '본인이 올린 결재는 본인이 승인할 수 없습니다.',
        message_en: 'You cannot approve your own request.',
      }, 403);
    }

    const seq = Number(cur.stage_seq || 1);
    const total = Number(cur.stage_total || 1);
    const stepRow: any = await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_steps WHERE request_id = ? AND seq = ? LIMIT 1`
    ).bind(id, seq).first(), null);
    const role = (stepRow?.role || 'staff') as any;

    /* 전결 — 경영진은 중간 단계를 건너뛰고 바로 최종 결재할 수 있다.
       🔴 단, 돈이 나가는 분류(물품·지출)에서는 끈다(allowsStraightThrough).
          지정 결재권자가 경영진 명단에도 있어서, 켜 두면 그가 1단계를 누르는 순간
          2단계가 «건너뜀»으로 닫혀 **대표 확인 단계가 아예 열리지 않는다.** */
    const straightThrough = iAmExec && role !== 'exec' && allowsStraightThrough(cur.req_type);
    if (!canDecideStage(actor, role, ph) && !straightThrough) {
      return json({
        ok: false, error: 'forbidden',
        message: '이 단계를 결재할 권한이 없습니다.',
        message_en: 'You cannot decide this stage.',
      }, 403);
    }

    let payload: any = {};
    try { payload = await request.json(); } catch { /* 빈 본문 허용 */ }
    const decision = String(payload?.decision || '');
    if (decision !== 'approved' && decision !== 'rejected') return json({ ok: false, error: 'bad_decision' }, 400);

    /* 📲 알림의 [승인] 버튼으로 온 요청 — 화면을 안 보고 누른 것이라 «볼 것이 없는» 건만 받는다.
       신호는 알림을 보낸 뒤 바뀌었을 수 있어 **지금 다시 잰다.** 막히면 화면으로 보낸다. */
    if (String(payload?.via || '') === 'push') {
      let pflags: Flag[] = [];
      try { if (cur.flags) pflags = JSON.parse(cur.flags); } catch { pflags = []; }
      const psig = signalOf({ reqType: cur.req_type, amount: cur.amount, ocrAmount: cur.ocr_amount,
                              hasFile: !!cur.file_key, flags: pflags });
      const deny = pushApproveDenyReason({
        decision, expectSeq: payload?.expect_seq, seq, signal: psig.signal,
        reqType: cur.req_type, byProxy: !isPrimaryApprover(actor, role, ph),
        reversesId: (cur as any).reverses_id,
      });
      if (deny) {
        return json({
          ok: false, error: 'push_denied', reason: deny,
          message: '알림에서는 승인할 수 없는 건입니다 — 결재함에서 확인해 주세요.',
          message_en: 'This one needs a look in the approval box.',
        }, 409);
      }
    }
    let memo = String(payload?.memo || '').slice(0, 1000) || null;
    /* 🌐 한국어로만 쓴 반려 사유는 필리핀 매니저가 못 읽는다 — 영어를 덧붙인다.
       이미 영어 낱말이 있으면(버튼 사유는 영/한 둘 다 들어 있다) 건드리지 않는다. 실패하면 원문 그대로. */
    if (decision === 'rejected' && memo && /[가-힣]/.test(memo) && !/[A-Za-z]{3,}/.test(memo)) {
      const en = await toEnglish(env, memo);
      if (en) memo = (memo + '\n[EN] ' + en).slice(0, 1000);
    }

    /* 🖐 같은 사람이 «두 단계 연달아» 승인하지 못하게 (2026-09-09 사장님 「1번 막아주고」).
         돈이 나가는 분류에서만, «승인» 에만 건다(반려는 돈이 안 나가는 방향이라 막지 않는다).
       🔴 앞 단계 조회가 실패하면 `null` 을 넘겨 **막는 쪽으로** 실패한다 — 빈 배열로 넘기면
          「앞 단계에 아무도 없다」가 되어 이 게이트가 조용히 통째로 풀린다.
       ℹ️ 1단계(seq 1)에는 앞 단계가 없으니 조회 자체를 하지 않는다(빈 배열 = 통과). */
    const needSameCheck = blocksSameDecider(cur.req_type) && seq > 1;
    const priorSteps: (string | null)[] | null = needSameCheck
      ? await safe(async () => ((await env.DB.prepare(
          `SELECT decided_by FROM approval_steps
            WHERE request_id = ? AND seq < ? AND status = 'approved'`
        ).bind(id, seq).all<any>()).results || []).map((r: any) => r.decided_by as string | null), null)
      : [];
    /* 🔴 단계 도장(approval_steps)은 아래에서 **best-effort**(safe(..., false))로 쓰인다.
         그 쓰기가 한 번 실패하면 건은 다음 단계로 넘어가 있는데 앞 단계 도장이 비어,
         이 게이트가 «조회는 성공했는데 근거만 없는» 상태로 조용히 풀린다.
         요청 행의 decided_by 는 **하드** UPDATE 라 그때도 남아 있다(= 직전 단계 결재자).
         두 근거를 함께 넘겨 서로를 받치게 한다. ⛔ 이 concat 을 빼지 말 것. */
    const priorDeciders: (string | null)[] | null = (priorSteps === null) ? null
      : (needSameCheck ? priorSteps.concat([ ((cur as any).decided_by ?? null) as string | null ]) : priorSteps);
    const sd = sameDeciderBlocked({
      reqType: cur.req_type, priorDeciders, me: String(actor.username), decision,
    });
    if (sd.blocked) {
      const SD_MSG: Record<string, [string, string]> = {
        same_decider:  ['앞 단계를 결재하신 분은 다음 단계를 결재할 수 없습니다. 다른 결재자가 눌러야 합니다.',
                        'You approved an earlier stage — a different approver must decide this stage.'],
        lookup_failed: ['앞 단계 결재 기록을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
                        'Could not verify the earlier stage. Please try again shortly.'],
        unknown_actor: ['계정을 확인하지 못했습니다. 다시 로그인해 주세요.',
                        'Could not identify your account. Please sign in again.'],
      };
      const m = SD_MSG[sd.reason] || SD_MSG.same_decider;
      return json({ ok: false, error: 'same_decider', reason: sd.reason, message: m[0], message_en: m[1] }, 403);
    }

    const now = Date.now();
    const lastStage = (seq >= total) || straightThrough;
    const finalStatus = (decision === 'rejected') ? 'rejected' : (lastStage ? 'approved' : 'pending');

    /* 🔁 취소 결재라면 «무엇을 되돌렸는가» 를 응답에 실어 화면이 사람에게 말하게 한다. */
    let reversal: { cancelled: boolean; undone: string[]; left: string[] } | null = null;

    // 조건부 UPDATE — status='pending' 이고 단계가 그대로일 때만 바뀐다(동시 클릭 방어를 DB 에서 한 번 더).
    const nextSeq = (finalStatus === 'pending') ? seq + 1 : seq;
    const nextDue = (finalStatus === 'pending') ? stageDeadlineMs(cur.req_type, now) : cur.stage_due_at;
    const up = await env.DB.prepare(
      `UPDATE approval_requests
          SET status = ?, decided_by = ?, decided_at = ?, decide_memo = ?,
              stage_seq = ?, stage_due_at = ?
        WHERE id = ? AND status = 'pending' AND IFNULL(stage_seq, 1) = ?`
    ).bind(finalStatus, actor.username, now, memo, nextSeq, nextDue, id, seq).run();
    if (!up.meta.changes) return json({ ok: false, error: 'already_decided' }, 409);

    // 단계 기록
    await safe(async () => {
      await env.DB.prepare(
        `UPDATE approval_steps SET status = ?, decided_by = ?, decided_at = ?, memo = ?
          WHERE request_id = ? AND seq = ?`
      ).bind(decision, actor.username, now, memo, id, seq).run();
      return true;
    }, false);

    if (straightThrough && seq < total) {
      // 전결이면 남은 단계를 «건너뜀»으로 닫는다 — 이력에 사실대로 남긴다.
      await safe(async () => {
        await env.DB.prepare(
          `UPDATE approval_steps SET status = 'skipped', decided_by = ?, decided_at = ?, memo = ?
            WHERE request_id = ? AND seq > ? AND status IN ('waiting','active')`
        ).bind(actor.username, now, '전결', id, seq).run();
        return true;
      }, false);
    }

    if (finalStatus === 'pending') {
      // 다음 단계 열기 + 그 단계 결재자에게 즉시 알림. 사람이 «전달»을 누르지 않는다.
      await safe(async () => {
        await env.DB.prepare(
          `UPDATE approval_steps SET status = 'active', started_at = ? WHERE request_id = ? AND seq = ?`
        ).bind(now, id, nextSeq).run();
        return true;
      }, false);
      const nextStep: any = await safe(async () => await env.DB.prepare(
        `SELECT role FROM approval_steps WHERE request_id = ? AND seq = ? LIMIT 1`
      ).bind(id, nextSeq).first(), null);
      const targets = await approversFor(env, String(nextStep?.role || 'exec'), cur.requester_username);
      const deleg = await delegatesOf(env, targets);
      for (const d of deleg) if (targets.indexOf(d) < 0) targets.push(d);
      await notify(env, targets, typeSpec(cur.req_type).en + ' · stage ' + nextSeq,
                   String(cur.title || '').slice(0, 80), id, 'approval', quickSeqOf(cur, nextSeq));
    } else {
      // 🏖️ 휴가가 최종 승인되면 «강사 근무불가» 에 그대로 반영한다 —
      //   그래야 그 기간 예약이 실제로 막힌다. 결재함과 캘린더에 따로 적지 않는다(이중 입력 방지).
      if (finalStatus === 'approved' && typeSpec(cur.req_type).wantsDates && cur.date_from) {
        await applyLeaveToCalendar(env, cur, id);
      }
      /* 💼 급여·평가가 최종 승인되면 그 달을 잠근다 — 「누가 언제 확정했는가」 를 남긴다.
         ⚠️ 급여 표(teacher_payroll_auto·payslips)에는 쓰지 않는다. 그 표의 주인은 api-admin 이고,
            여기서 손대면 이중 기록이 된다. 결재함은 «승인 사실» 만 자기 표에 적는다.
         ⚠️ 승인 시점의 숫자를 통째로 얼려 둔다 — 나중에 원본이 바뀌어도
            «그때 무엇을 승인했는지» 가 남아야 한다(감사 기록). */
      if (finalStatus === 'approved' && cur.req_type === 'hr' && cur.hr_kind && cur.period) {
        try {
          await ensureHrTable(env);
          const snap = await buildHrSnapshot(env, cur.hr_kind, cur.period);
          const done = await lockPeriod(env, cur.hr_kind, cur.period, id, String(actor.username), snap);
          console.log('[approval-hr] 달 확정', JSON.stringify({ id, kind: cur.hr_kind, period: cur.period, done }));
        } catch (e) {
          // 삼키되 반드시 남긴다 — 승인은 됐는데 확정 기록이 없는 상태를 사람이 알아야 한다.
          console.error('[approval-hr] 달 확정 기록 실패 — 손으로 확인 필요. id=' + id, (e as any)?.message || e);
        }
      }
      /* 🔁 «취소 결재» 가 최종 승인되면 원본을 무효로 하고 되돌릴 수 있는 것만 되돌린다.
         ⛔ 되돌리지 못한 것은 응답과 로그로 «말한다» — 「취소했다」는 말만 남고
            강사가 계속 막혀 있는 상태가 제일 나쁘다. */
      if (finalStatus === 'approved' && cur.reverses_id) {
        reversal = await applyReversal(env, Number(cur.reverses_id), id, String(actor.username));
      }
      // 끝났으면 올린 사람에게 결과를 알린다.
      await notify(env, [String(cur.requester_username)],
                   decision === 'approved' ? 'Approved' : 'Rejected',
                   String(cur.title || '').slice(0, 80), id, 'approval-result');
    }

    return json({
      ok: true, id, status: finalStatus, stage_seq: nextSeq, stage_total: total,
      straight_through: straightThrough,
      reverses_id: cur.reverses_id || null,
      reversal,                       // 취소 결재일 때만 값이 있다
    });
  }

  /* ═════════════════════════════════════════════════════════════════════════
   * 🗑️ 삭제 — 「없었던 것으로」
   *
   *   회수된 «내» 건만. 그 상태는 아무도 결재 도장을 안 찍은 것이라 지워도
   *   잃을 기록이 없다. ⛔ 승인·반려·대기 건은 서버가 거절한다(주소로 직접 불러도).
   *
   *   [지우는 순서가 중요하다]
   *     ① 행을 **조건부로** 먼저 지운다 — 그사이 상태가 바뀌었으면 0행이 되고
   *        **아무것도 잃지 않는다.**
   *     ② 그 뒤에 단계 이력과 R2 첨부를 치운다. 여기서 실패하면 «고아 파일» 이
   *        남지만 사장님이 원한 «목록에서 사라짐» 은 이미 이뤄졌다 —
   *        조용히 넘기지 말고 **크게 로그를 남긴다.**
   *   ⛔ 순서를 뒤집지 말 것 — R2 를 먼저 지우고 ①이 0행이면 결재는 남았는데
   *      영수증만 사라진다(「첨부 보기」가 깨진다).
   * ═══════════════════════════════════════════════════════════════════════ */
  const mDel = path.match(/^\/api\/approval\/requests\/(\d+)$/);
  if (method === 'DELETE' && mDel) {
    if (!isHqStaff(actor)) return json({ ok: false, error: 'forbidden' }, 403);
    const id = Number(mDel[1]);
    /* 화면이 그 실패를 뭐라고 말하는지 — 성공한 조작을 «실패» 로 읽히게 하지 않는다.
       (지운 뒤 한 번 더 누르면 404 가 오는데 문구가 없으면 「지우지 못했습니다」가 뜬다) */
    const DEL_MSG: Record<string, [string, string]> = {
      not_found:     ['이미 지워졌거나 없는 결재입니다.', 'Already deleted or not found.'],
      not_mine:      ['내가 올린 결재만 지울 수 있습니다.', 'You can only delete your own request.'],
      not_withdrawn: ['회수한 결재만 지울 수 있습니다. 먼저 회수해 주세요 — 승인된 건은 «취소 결재»를 올려야 합니다.',
                      'Only a withdrawn request can be deleted. Withdraw it first; an approved one needs a cancellation request.'],
      has_child:     ['이 건을 이어받아 다시 올린 결재가 있어 지울 수 없습니다 — 그 결재의 «며칠째»가 이 날짜를 쓰고 있습니다.',
                      'A re-submitted request follows this one and uses its date, so it cannot be deleted.'],
      lookup_failed: ['확인이 끝나지 않아 지우지 않았습니다. 잠시 뒤 다시 시도해 주세요.',
                      'Could not verify — nothing was deleted. Please try again shortly.'],
      changed:       ['그사이 상태가 바뀌어 지우지 않았습니다 — 화면을 새로고침해 주세요.',
                      'The request changed in the meantime — nothing was deleted. Please refresh.'],
    };
    const fail = (reason: string, code: number, extra?: Record<string, unknown>) => {
      const m = DEL_MSG[reason] || ['지울 수 없습니다.', 'Cannot delete.'];
      return json({ ok: false, error: reason, message: m[0], message_en: m[1], ...(extra || {}) }, code);
    };

    const cur: any = await env.DB.prepare(`SELECT * FROM approval_requests WHERE id = ? LIMIT 1`)
      .bind(id).first().catch(() => null);
    if (!cur) return fail('not_found', 404);

    /* 🔴 이 건을 이어받아 다시 올린 결재가 있는가 — 있으면 지우지 않는다.
       지우면 그 자식의 「N일째」가 원본 날짜를 잃고 **오늘로 초기화**되어,
       «회수 → 다시 올리기 → 원본 삭제» 가 **지연을 지우는 우회로**가 된다.
       ⛔ 조회가 실패하면 «모른다»(null) 로 넘긴다 — safe(…, null) 로 «없다» 에 떨어뜨리면
          이 가드가 fail-open 이 된다(함정 대조 2026-09-06). 되돌릴 수 없는 조작은 막는 쪽으로 실패. */
    let hasChild: boolean | null = null;
    let childId: number | null = null;
    try {
      const child: any = await env.DB.prepare(
        `SELECT id FROM approval_requests WHERE origin_id = ? LIMIT 1`
      ).bind(id).first();
      hasChild = !!child?.id;
      childId = child?.id ? Number(child.id) : null;
    } catch (e) {
      console.error('[approval-delete] 자식 조회 실패 — 지우지 않습니다. id=' + id, (e as any)?.message || e);
    }

    const g = canDelete({
      me: String(actor.username),
      requesterUsername: String(cur.requester_username),
      status: String(cur.status),
      hasResubmitChild: hasChild,
    });
    if (!g.ok) {
      return fail(g.reason, g.reason === 'lookup_failed' ? 503 : 403,
                  { status: cur.status, child_id: childId });
    }

    /* ① 행 — 조건부. 그사이 상태가 바뀌었거나 «다시 올리기» 가 들어왔으면 0행이고
          아무것도 안 잃는다. 자식 검사를 SELECT 시점에만 두면 그 사이(TOCTOU)에
          부모가 지워질 수 있어 WHERE 에도 넣는다 — DB 가 한 번 더 본다. */
    const up = await env.DB.prepare(
      `DELETE FROM approval_requests
        WHERE id = ? AND status = 'withdrawn' AND requester_username = ?
          AND NOT EXISTS (SELECT 1 FROM approval_requests c WHERE c.origin_id = approval_requests.id)`
    ).bind(id, String(actor.username)).run();
    if (!up.meta.changes) {
      // 왜 0행이었나 — «자식이 생겼다» 와 «상태가 바뀌었다» 는 다른 말이다.
      const again: any = await safe(async () => await env.DB.prepare(
        `SELECT status,
                (SELECT COUNT(*) FROM approval_requests c WHERE c.origin_id = approval_requests.id) AS kids
           FROM approval_requests WHERE id = ? LIMIT 1`
      ).bind(id).first(), null);
      if (again && Number(again.kids || 0) > 0) return fail('has_child', 403, { status: again.status });
      return fail('changed', 409, { status: again?.status || null });
    }

    // ② 단계 이력 — 남기면 고아 행이 된다.
    await safe(async () => {
      await env.DB.prepare(`DELETE FROM approval_steps WHERE request_id = ?`).bind(id).run();
      return true;
    }, false);

    /* ② R2 첨부 — 안 지우면 영수증 사진이 저장소에 고아로 남는다.
       ⛔ 접두사를 확인한다(isApprovalFileKey) — 그 칸에 다른 것이 들어 있으면
          엉뚱한 파일을 지우게 되고 되돌릴 수 없다. */
    let fileGone: boolean | null = null;
    if (cur.file_key && isApprovalFileKey(cur.file_key)) {
      if (!env.RECORDINGS) {
        fileGone = false;
        console.error('[approval-delete] R2 가 없어 첨부를 못 지웠습니다 — 고아 파일. key=' + cur.file_key);
      } else {
        try {
          await env.RECORDINGS.delete(String(cur.file_key));
          fileGone = true;
        } catch (e) {
          fileGone = false;
          // 삼키되 크게 남긴다 — 결재는 이미 사라졌고 파일만 남은 상태를 사람이 알아야 한다.
          console.error('[approval-delete] 첨부 삭제 실패 — 고아 파일이 남았습니다. key=' + cur.file_key,
                        (e as any)?.message || e);
        }
      }
    }

    /* 화면에는 안 보이지만 서버에는 남긴다 — 나중에 「그 건 어디 갔지?」를 물을 수 있어야 한다.
       ⚠️ 제목·본문은 남기지 않는다(지운 사람의 뜻이 «없었던 것으로» 이다). */
    console.log('[approval-delete] 삭제', JSON.stringify({
      id, by: String(actor.username), req_type: cur.req_type,
      created_at: cur.created_at, had_file: !!cur.file_key, file_gone: fileGone,
    }));

    /* ⚠️ 첨부를 못 지웠으면 «어느 파일인지» 를 함께 준다 — 이 저장소의 R2 청소기는
       rec/·recordings/ 접두사만 치우므로 approval/ 고아는 사람이 대시보드에서 지워야 한다. */
    return json({
      ok: true, id, deleted: true, file_deleted: fileGone,
      file_key: fileGone === false ? String(cur.file_key) : undefined,
    });
  }

  /* ── 한 건 자세히 ─────────────────────────────────────────────────────────
     🔴 목록은 본문을 300자로 줄여 준다. 「이 내용으로 다시 올리기」가 그 잘린 값을
        채우면 **내용이 말없이 바뀌어** 올라간다 — 그래서 원문을 받아 갈 자리가 필요하다.
     ⚠️ 열람 권한은 목록·첨부와 «같은 판정»(canView)을 쓴다 — 여기만 느슨하면
        인사·급여 본문이 새는 새 구멍이 된다. */
  /* 📊 결재 전 이력 (2026-09-24 4단계 — 제안서 「결재 전 AI 질문」의 계산판)
   *   「이 사람이 이 제목으로 전에도 올렸나 · 그때 얼마였나 · 이 사람은 얼마나 반려됐나」를
   *   AI 대화가 아니라 **조회로** 답한다 — 같은 질문에 늘 같은 답이어야 결재 근거가 된다.
   *   ⛔ 볼 권한은 그 결재와 같다(canView). 같은 분류·같은 사람의 행만 읽으므로 새로 보이는 것이 없다. */
  const mHist = path.match(/^\/api\/approval\/requests\/(\d+)\/history$/);
  if (method === 'GET' && mHist) {
    if (!isHqStaff(actor)) return json({ ok: false, error: 'forbidden' }, 403);
    const id = Number(mHist[1]);
    const r: any = await env.DB.prepare(
      `SELECT id, req_type, title, amount, currency, requester_username FROM approval_requests WHERE id = ? LIMIT 1`
    ).bind(id).first().catch(() => null);
    if (!r) return json({ ok: false, error: 'not_found' }, 404);
    const ch = await chainOf(env, id);
    if (!canView(actor, r.req_type, r.requester_username, ch.usernames, ph)) {
      return json({ ok: false, error: 'forbidden' }, 403);
    }
    const rows = await safe(async () => (await env.DB.prepare(
      `SELECT id, title, amount, currency, status, created_at, requester_username, reverses_id
         FROM approval_requests
        WHERE requester_username = ? AND req_type = ? AND created_at >= ?
        ORDER BY created_at DESC LIMIT 200`
    ).bind(r.requester_username, r.req_type, Date.now() - 180 * 86400_000).all<any>()).results || [], null as any);
    if (!rows) return json({ ok: false, error: 'lookup_failed' }, 500);
    /* ❓ 결재 전 질문 — «이 가게 전에도?» · «이번 달 이 항목 합계» (정본 askCard).
         다른 사람이 올린 것도 세므로 한 행씩 canView 로 거른다(결재선 없이 = 좁게 실패).
         ⚠️ 실패해도 이력 카드는 그대로 준다 — ask 만 null. */
    const cur2: any = await safe(async () => await env.DB.prepare(
      `SELECT vendor, category FROM approval_requests WHERE id = ? LIMIT 1`
    ).bind(id).first(), null);
    let ask: any = null;
    if (cur2) {
      const aRows = await safe(async () => (await env.DB.prepare(
        `SELECT id, req_type, status, reverses_id, amount, currency, created_at, requester_username, vendor, category
           FROM approval_requests
          WHERE instr(?, ',' || req_type || ',') > 0 AND status = 'approved' AND created_at >= ?
          ORDER BY created_at DESC LIMIT 1000`
      ).bind(spendTypesCsv(), Date.now() - 90 * 86400_000).all<any>()).results || [], null as any);
      if (aRows) {
        const vis = (aRows as any[]).filter(x => canView(actor, x.req_type, x.requester_username, [], ph));
        ask = askCard({ id, vendor: cur2.vendor, category: cur2.category, requester_username: r.requester_username }, vis, Date.now());
      }
    }
    return json({ ok: true, history: historyCard(r, rows as any[]), ask });
  }

  const mOne = path.match(/^\/api\/approval\/requests\/(\d+)$/);
  if (method === 'GET' && mOne) {
    if (!isHqStaff(actor)) return json({ ok: false, error: 'forbidden' }, 403);
    const id = Number(mOne[1]);
    const r: any = await env.DB.prepare(
      `SELECT *, (SELECT o.created_at FROM approval_requests o WHERE o.id = approval_requests.origin_id)
         AS origin_created_at, CASE WHEN approval_requests.status = 'withdrawn' THEN EXISTS(SELECT 1 FROM approval_requests c WHERE c.origin_id = approval_requests.id) ELSE 0 END AS has_child
       FROM approval_requests WHERE id = ? LIMIT 1`
    ).bind(id).first().catch(() => null);
    if (!r) return json({ ok: false, error: 'not_found' }, 404);
    const ch = await chainOf(env, id);
    if (!canView(actor, r.req_type, r.requester_username, ch.usernames, ph)) {
      return json({ ok: false, error: 'forbidden' }, 403);
    }
    const steps = await safe(async () => {
      const rs = await env.DB.prepare(
        `SELECT * FROM approval_steps WHERE request_id = ? ORDER BY seq`
      ).bind(id).all<any>();
      return (rs.results || []) as any[];
    }, [] as any[]);
    return json({ ok: true, item: rowOf(r, steps, false) });   // brief=false → 본문 그대로
  }

  // ── 첨부 내려받기 ─────────────────────────────────────────────────────────
  //   본인 요청이거나 열람 권한자만. 영수증에는 계좌·금액이 찍혀 있다.
  /* ═════════════════════════════════════════════════════════════════════════
   * ↩️ ① 회수 — 「내가 올린 것을 내가 내린다」
   *
   *   ⛔ 아무도 결재하기 «전» 에만. 1단계가 승인된 뒤에 내리면 그 사람의 결재가
   *      뜻을 잃는다 — 그건 회수가 아니라 «남의 결재를 지우는 것» 이다.
   *   ⛔ 상태를 rejected 로 쓰지 않는다 — 「반려당함」과 「내가 내림」은 다른 사실이고,
   *      중복 감지·지출 합계가 그 값을 본다.
   *   ⚠️ 기다리던 결재자에게 «회수되었다» 를 알린다. 안 보내면 결재함에서 사라진
   *      이유를 아무도 모른다.
   * ═══════════════════════════════════════════════════════════════════════ */
  const mWithdraw = path.match(/^\/api\/approval\/requests\/(\d+)\/withdraw$/);
  if (method === 'POST' && mWithdraw) {
    const id = Number(mWithdraw[1]);
    const cur: any = await env.DB.prepare(`SELECT * FROM approval_requests WHERE id = ? LIMIT 1`)
      .bind(id).first().catch(() => null);
    if (!cur) return json({ ok: false, error: 'not_found' }, 404);

    /* 이미 누가 결재를 눌렀는가 — 단계 표를 직접 본다(상태만 보면 다단계에서 놓친다).
       ⛔ 이 조회가 실패했을 때 «아무도 안 눌렀다» 로 떨어뜨리지 않는다 — 그러면 결재 도장이
          찍힌 건도 회수되고, 이제는 그 뒤 삭제까지 이어져 결재자의 판단 기록이 통째로
          사라질 수 있다(함정 대조 2026-09-06). 모르면 회수하지 않는다. */
    let anyDecided: boolean | null = null;
    try {
      const decided: any = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM approval_steps
          WHERE request_id = ? AND status IN ('approved','rejected')`
      ).bind(id).first();
      anyDecided = Number(decided?.c || 0) > 0;
    } catch (e) {
      console.error('[approval-withdraw] 단계 조회 실패 — 회수하지 않습니다. id=' + id, (e as any)?.message || e);
    }
    if (anyDecided === null) {
      return json({
        ok: false, error: 'lookup_failed',
        message: '결재 진행 상태를 확인하지 못해 회수하지 않았습니다. 잠시 뒤 다시 시도해 주세요.',
        message_en: 'Could not verify the approval progress — nothing was withdrawn. Please try again shortly.',
      }, 503);
    }

    const g = canWithdraw({
      me: String(actor.username), requesterUsername: String(cur.requester_username),
      status: String(cur.status), anyDecided, stageSeq: Number(cur.stage_seq || 1),
    });
    if (!g.ok) {
      const MSG: Record<string, [string, string]> = {
        not_mine:        ['내가 올린 결재만 회수할 수 있습니다.', 'You can only withdraw your own request.'],
        not_pending:     ['이미 처리가 끝난 결재는 회수할 수 없습니다.', 'This request is already closed.'],
        already_decided: ['이미 결재가 시작되어 회수할 수 없습니다. 승인된 뒤에는 «취소 결재»를 올려 주세요.',
                          'A decision was already made. Submit a cancellation request instead.'],
      };
      const m = MSG[g.reason] || ['회수할 수 없습니다.', 'Cannot withdraw.'];
      return json({ ok: false, error: g.reason, message: m[0], message_en: m[1] }, 403);
    }

    let memo = '';
    try { const b: any = await request.json(); memo = String(b?.memo || '').trim().slice(0, 300); } catch { /* 빈 본문 허용 */ }

    const now = Date.now();
    /* 조건부 UPDATE — 그사이 누가 결재를 눌렀으면 0행이 되어 실패한다(경합 방어를 DB 에서 한 번 더). */
    const up = await env.DB.prepare(
      `UPDATE approval_requests
          SET status = 'withdrawn', decided_by = ?, decided_at = ?, decide_memo = ?
        WHERE id = ? AND status = 'pending' AND requester_username = ?`
    ).bind(String(actor.username), now, memo || null, id, String(actor.username)).run();
    if (!up.meta.changes) return json({ ok: false, error: 'already_decided' }, 409);

    // 이력 — 남은 단계를 «회수됨» 으로 닫는다. 그 표의 뜻이 「전 이력이 여기 남는다」이다.
    await safe(async () => {
      await env.DB.prepare(
        `UPDATE approval_steps SET status = 'withdrawn', decided_by = ?, decided_at = ?, memo = ?
          WHERE request_id = ? AND status IN ('waiting','active')`
      ).bind(String(actor.username), now, memo || '기안자 회수', id).run();
      return true;
    }, false);

    // 기다리던 결재자에게 알린다 — 결재함에서 사라진 이유를 말해 준다.
    await safe(async () => {
      const stepRow: any = await env.DB.prepare(
        `SELECT role FROM approval_steps WHERE request_id = ? AND seq = ? LIMIT 1`
      ).bind(id, Number(cur.stage_seq || 1)).first();
      const targets = await approversFor(env, String(stepRow?.role || 'staff'), String(cur.requester_username));
      if (targets.length) {
        await notify(env, targets, 'Withdrawn · ' + (actor.name || actor.username),
                     String(cur.title || '').slice(0, 80), id, 'approval-result');
      }
      return true;
    }, false);

    return json({ ok: true, id, status: 'withdrawn' });
  }

  /* ═════════════════════════════════════════════════════════════════════════
   * 🔁 ③ 취소 결재 — 「승인된 것을 무효로 하려면 새 결재를 올려 승인받는다」
   *
   *   ⛔ 승인 건을 그 자리에서 지우지 않는다. 승인은 바깥으로 나간다 —
   *      휴가는 강사 근무불가를 만들어 예약을 막고, 인사·급여는 그 달을 잠근다.
   *      되돌리려면 그사이 잡힌 수업·정산을 어떻게 할지 사람이 정해야 한다.
   *   ⚠️ 결재선은 **원본과 같은 규칙**(stagesFor)으로 만든다 — 취소를 원본보다
   *      쉽게 통과시키면 「올릴 땐 경영진, 없앨 땐 아무나」가 된다.
   *   ⚠️ 금액의 부호를 뒤집지 않는다 — 승인되면 원본이 합계에서 빠지므로,
   *      음수까지 넣으면 이중으로 차감된다.
   * ═══════════════════════════════════════════════════════════════════════ */
  const mReverse = path.match(/^\/api\/approval\/requests\/(\d+)\/reverse$/);
  if (method === 'POST' && mReverse) {
    const id = Number(mReverse[1]);
    const cur: any = await env.DB.prepare(`SELECT * FROM approval_requests WHERE id = ? LIMIT 1`)
      .bind(id).first().catch(() => null);
    if (!cur) return json({ ok: false, error: 'not_found' }, 404);

    // 이미 올라와 있는 «대기 중» 취소 결재가 있는가 — 두 벌을 만들지 않는다.
    const openRev: any = await safe(async () => await env.DB.prepare(
      `SELECT id FROM approval_requests WHERE reverses_id = ? AND status = 'pending' LIMIT 1`
    ).bind(id).first(), null);

    const g = canReverse({
      me: String(actor.username), isExec: iAmExec,
      requesterUsername: String(cur.requester_username), status: String(cur.status),
      cancelledById: cur.cancelled_by_id ? Number(cur.cancelled_by_id) : null,
      openReverseId: openRev?.id ? Number(openRev.id) : null,
    });
    if (!g.ok) {
      const MSG: Record<string, [string, string]> = {
        not_approved:      ['승인된 결재만 취소 요청을 올릴 수 있습니다.', 'Only approved requests can be cancelled.'],
        not_allowed:       ['이 결재의 취소는 올린 사람 또는 경영진만 요청할 수 있습니다.',
                            'Only the requester or an executive can request cancellation.'],
        already_cancelled: ['이미 취소된 결재입니다.', 'This request was already cancelled.'],
        already_requested: ['이미 취소 결재가 올라와 결재를 기다리는 중입니다.',
                            'A cancellation request is already pending.'],
      };
      const m = MSG[g.reason] || ['취소 요청을 올릴 수 없습니다.', 'Cannot request cancellation.'];
      return json({
        ok: false, error: g.reason, message: m[0], message_en: m[1],
        open_reverse_id: openRev?.id || null, cancelled_by_id: cur.cancelled_by_id || null,
      }, 403);
    }

    let reason = '';
    try { const b: any = await request.json(); reason = String(b?.reason || '').trim().slice(0, 2000); } catch { /* 빈 본문 허용 */ }
    if (!reason) {
      return json({
        ok: false, error: 'reason_required',
        message: '취소하려는 이유를 적어 주세요 — 결재자가 그것으로 판단합니다.',
        message_en: 'Please write why this should be cancelled.',
      }, 400);
    }

    const now = Date.now();
    const reqType = String(cur.req_type);
    const amount = (cur.amount == null) ? null : Number(cur.amount);
    const currency = normCurrency(cur.currency);
    // 결재선은 원본과 같은 규칙으로.
    const stages: Stage[] = stagesFor(reqType, amount, currency);
    const deadline = deadlineMs(reqType, now, stages.length);
    const stageDue = stageDeadlineMs(reqType, now);
    const title = reverseTitle(cur.title);
    const body = ('원래 결재 #' + id + ' 을(를) 취소하려는 요청입니다.\n\n[취소 사유]\n' + reason).slice(0, 4000);

    const ins = await env.DB.prepare(
      `INSERT INTO approval_requests
         (req_type, requester_username, requester_name, title, body, category,
          amount, currency, spent_at, status, created_at, stage_seq, stage_total,
          deadline_at, stage_due_at, flags, reverses_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 1, ?, ?, ?, ?, ?)`
    ).bind(reqType, String(actor.username), actor.name || null, title, body, cur.category || null,
           amount, currency, cur.spent_at || null, now, stages.length, deadline, stageDue,
           JSON.stringify([{ code: 'reversal', level: 'warn',
                             ko: '이 결재는 승인된 #' + id + ' 을(를) 무효로 만듭니다.',
                             en: 'Approving this cancels approved request #' + id + '.' }]),
           id).run();
    const newId = Number(ins.meta.last_row_id);

    for (const st of stages) {
      await safe(async () => {
        await env.DB.prepare(
          `INSERT INTO approval_steps (request_id, seq, role, status, started_at)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(newId, st.seq, st.role, st.seq === 1 ? 'active' : 'waiting', st.seq === 1 ? now : null).run();
        return true;
      }, false);
    }

    const targets = await approversFor(env, stages[0].role, String(actor.username));
    const deleg = await delegatesOf(env, targets);
    for (const d of deleg) if (targets.indexOf(d) < 0) targets.push(d);
    await notify(env, targets, 'Cancellation · ' + (actor.name || actor.username),
                 title.slice(0, 80), newId, 'approval');

    return json({ ok: true, id: newId, reverses_id: id, stages: stages.length });
  }

  const mFile = path.match(/^\/api\/approval\/requests\/(\d+)\/file$/);
  if (method === 'GET' && mFile) {
    const id = Number(mFile[1]);
    const r: any = await env.DB.prepare(`SELECT * FROM approval_requests WHERE id = ? LIMIT 1`)
      .bind(id).first().catch(() => null);
    if (!r || !r.file_key) return json({ ok: false, error: 'not_found' }, 404);
    const ch = await chainOf(env, id);
    if (!canView(actor, r.req_type, r.requester_username, ch.usernames, ph)) {
      return json({ ok: false, error: 'forbidden' }, 403);
    }
    const r2 = env.RECORDINGS;
    if (!r2) return json({ ok: false, error: 'r2_not_configured' }, 500);
    const obj = await r2.get(r.file_key);
    if (!obj) return json({ ok: false, error: 'file_gone' }, 404);
    // 📷 카드 미리보기(?inline=1) — 사진만 화면 안에 띄운다. 그 밖은 예전처럼 내려받기(fileDisposition).
    const disp = fileDisposition(r.file_ext, new URL(request.url).searchParams.get('inline') === '1');
    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        // 파일명에 한글·공백이 들어가므로 filename* 로 준다.
        'Content-Disposition': `${disp}; filename*=UTF-8''${encodeURIComponent(r.file_name || 'file')}`,
        'Cache-Control': 'private, no-store',
        // 🛡️ 브라우저가 내용을 보고 형식을 «추측» 하지 못하게 한다.
        //    올릴 때 실제 바이트를 확인하지만, 내려받는 쪽에도 한 겹 더 둔다.
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  // ── 영수증 판독 ───────────────────────────────────────────────────────────
  //   무료 비전 모델만 쓴다(2026-08-16 결정). 실패해도 200 을 주고 ok:false 로 알린다 —
  //   화면은 «직접 입력»으로 조용히 넘어가면 되고, 여기서 500 을 내면 오류로 보인다.
  /* ── 🔎 올리기 전 점검 (2026-09-24) ────────────────────────────────────────
       사장님 「최대한 A.i 가 잘 필터해서 반려 없이 결재」 — 반려를 줄이는 가장 좋은 길은
       **올리기 «전» 에** 고치게 하는 것이다. 올리는 사람 화면이 이걸 불러 🔴 이면
       「이것부터 고쳐 주세요」를 보여 준다. 저장하지 않는다(읽기만).
       ⚠️ 같은 판정(runChecks·signalOf)을 올리기 때도 다시 한다 — 화면이 건너뛰어도 서버가 본다. */
  if (method === 'POST' && path === '/api/approval/precheck') {
    let b: any = {};
    try { b = await request.json(); } catch { b = {}; }
    const reqType = String(b?.req_type || '');
    if (REQ_TYPES.indexOf(reqType) < 0) return json({ ok: false, error: 'bad_req_type' }, 400);
    if (!canSubmit(actor, reqType, ph)) return json({ ok: false, error: 'forbidden_type' }, 403);
    const spec = typeSpec(reqType);
    const currency = normCurrency(String(b?.currency || 'PHP'));
    const num = (v: any) => { const n = Number(String(v ?? '').replace(/[,\s]/g, '')); return (String(v ?? '').trim() && isFinite(n) && n >= 0) ? n : null; };
    const amount = num(b?.amount);
    const ocrAmount = (() => { const n = num(b?.ocr_amount); return n != null && n > 0 ? n : null; })();
    const ymd = (v: any) => { const t = String(v || '').trim().slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };
    const body = String(b?.body || '').slice(0, 4000);
    const title = String(b?.title || '').slice(0, 200);
    const category = spec.wantsCategory ? normCategory(String(b?.category || '')) : null;
    const preVendor = String(b?.ocr_vendor || '').trim().slice(0, 60) || null;
    const facts = await gatherCheckFacts(env, actor.username, reqType, amount, currency, preVendor);
    // 🧾 화면이 영수증 해시를 보냈으면 올리기 «전» 에 재사용을 알려 준다(모양이 아니면 버린다).
    const receiptReusedCount = (b?.has_file && isSha256Hex(b?.file_hash)) ? await receiptReuseCount(env, b.file_hash) : 0;
    const flags = runChecks({
      reqType, amount, currency, hasFile: !!b?.has_file, ocrAmount,
      duplicateCount: facts.duplicateCount, duplicateRecentCount: facts.duplicateRecentCount,
      monthTotal: facts.monthTotal, medianAmount: facts.medianAmount,
      body, spentAt: ymd(b?.spent_at), ocrSpentAt: ymd(b?.ocr_spent_at), now: Date.now(),
      receiptReusedCount,
      photoQuality: normPhotoQuality(b?.photo_quality),
      weekCount: facts.weekCount, vendor: preVendor, newVendor: facts.newVendor,
    });
    if (ph && spec.needsAmount) {
      const concerns = await aiReview(env, {
        req_type: reqType, category, title, body, amount, currency,
        vendor: String(b?.ocr_vendor || '').slice(0, 60) || null,
      });
      for (const c of concerns) flags.push(c);
    }
    const sig = signalOf({ reqType, amount, ocrAmount, hasFile: !!b?.has_file, flags });
    return json({ ok: true, signal: sig.signal, reasons: sig.reasons, flags });
  }

  /* 🤖 자동 반려 «켤지 말지» 판단 패널 (2026-09-25, 9단계) — 경영진만.
       연습(shadow) 기간 동안 AI 가 🔴 로 본 건을 두 분이 실제로 어떻게 처리했는지 보여 주고,
       켜기·끄기는 **사람이 누른다.** 판정 정본 shadowTally · autoRejectReadiness. */
  if (method === 'GET' && path === '/api/approval/autoreject/report') {
    if (!iAmExec) return json({ ok: false, error: 'forbidden_exec_only' }, 403);
    const now = Date.now();
    const mode = await readAutoRejectMode(env);
    const rows = await loadShadowRows(env, now);
    const tally = shadowTally(rows);
    // 몇 일치 자료가 있나 — 결재 기록이 14일보다 짧으면 그만큼만(지어내지 않는다).
    const first: any = await safe(async () => await env.DB.prepare(
      `SELECT MIN(created_at) AS t FROM approval_requests`).first(), null);
    const firstAt = Number(first?.t || 0);
    const days = firstAt > 0 ? Math.min(14, Math.floor((now - firstAt) / 86400_000)) : 0;
    const pick = (st: string) => rows.filter(x => x.signal === 'red' && x.status === st).slice(0, 20)
      .map(x => ({ id: x.row.id, title: String(x.row.title || '').slice(0, 80),
        who: x.row.requester_name || x.row.requester_username || '',
        amount: x.row.amount == null ? null : Number(x.row.amount), currency: x.row.currency || null,
        reasons: x.reasons.map(rr => ({ ko: rr.ko, en: rr.en })) }));
    const byRaw = await safe(async () => await (env as any).SESSION_STATE?.get('approval_autoreject_by'), null);
    let changed: any = null;
    try { if (byRaw) { const o = JSON.parse(String(byRaw)); changed = { by: String(o.by || ''), at: Number(o.at) || null, mode: String(o.mode || '') }; } } catch { changed = null; }
    return json({ ok: true, mode, days, tally, readiness: autoRejectReadiness(tally, days),
      disagreed: pick('approved'), agreed: pick('rejected'), changed });
  }
  if (method === 'POST' && path === '/api/approval/autoreject/mode') {
    if (!iAmExec) return json({ ok: false, error: 'forbidden_exec_only' }, 403);
    const b: any = await request.json().catch(() => ({}));
    const mode = autoRejectModeInput(b?.mode);
    if (!mode) return json({ ok: false, error: 'bad_mode' }, 400);
    const kv: any = (env as any).SESSION_STATE;
    if (!kv) return json({ ok: false, error: 'kv_unavailable' }, 503);
    // ⛔ 못 썼으면 «바꿨다» 고 답하지 않는다 — 스위치가 그대로인데 화면만 바뀌면 사고다.
    const okPut = await safe(async () => { await kv.put('approval_autoreject', mode); return true; }, false);
    if (!okPut) return json({ ok: false, error: 'kv_write_failed' }, 503);
    await safe(async () => { await kv.put('approval_autoreject_by',
      JSON.stringify({ by: String(actor.username || ''), at: Date.now(), mode })); return true; }, false);
    const now2 = await readAutoRejectMode(env);
    return json({ ok: true, mode: now2, requested: mode });
  }

  if (method === 'POST' && path === '/api/approval/ocr') {
    const buf = await request.arrayBuffer().catch(() => null);
    if (!buf || buf.byteLength === 0) return json({ ok: false, error: 'empty' }, 400);
    if (buf.byteLength > MAX_OCR_BYTES) return json({ ok: false, error: 'too_large', max: MAX_OCR_BYTES }, 413);
    const got = await readReceipt(env, new Uint8Array(buf));
    if (!got) return json({ ok: false, error: 'unreadable' });
    // 🧾 8단계 — 품목으로 «내용» 초안과 «항목» 짐작을 만든다(글은 정본 순수 함수가 정한다).
    //    통화는 화면이 고른 것(?cur=) — 영수증만 보고 ₱/₩ 를 짐작하지 않는다.
    const cur = normCurrency(new URL(request.url).searchParams.get('cur'));
    return json({ ok: true, ...got,
      body_draft: receiptBody(got.items, got.amount, cur),
      category_guess: guessCategory(got.vendor, got.items) });
  }

  // ── 음성 기안 (영어) ──────────────────────────────────────────────────────
  if (method === 'POST' && path === '/api/approval/voice') {
    const buf = await request.arrayBuffer().catch(() => null);
    if (!buf || buf.byteLength === 0) return json({ ok: false, error: 'empty' }, 400);
    if (buf.byteLength > MAX_AUDIO_BYTES) return json({ ok: false, error: 'too_large', max: MAX_AUDIO_BYTES }, 413);
    const text = await transcribe(env, new Uint8Array(buf));
    if (!text) return json({ ok: false, error: 'unrecognized' });
    const draft = await draftFromText(env, text);
    return json({
      ok: true, transcript: text,
      draft: draft ? {
        req_type: REQ_TYPES.indexOf(String(draft.req_type)) >= 0 ? String(draft.req_type) : 'doc',
        title: String(draft.title || '').slice(0, 200),
        body: String(draft.body || '').slice(0, 4000),
        amount: (draft.amount != null && isFinite(Number(draft.amount))) ? Number(draft.amount) : null,
      } : null,
    });
  }

  // ── 대결(위임) 설정 ───────────────────────────────────────────────────────
  if (method === 'POST' && path === '/api/approval/delegate') {
    if (!isHqStaff(actor)) return json({ ok: false, error: 'forbidden' }, 403);
    let b: any = {};
    try { b = await request.json(); } catch { /* 빈 본문 = 해제 */ }
    const to = String(b?.delegate_to || '').trim();
    if (!to) {
      await safe(async () => { await env.DB.prepare(`DELETE FROM approval_delegates WHERE username = ?`).bind(actor.username).run(); return true; }, false);
      return json({ ok: true, cleared: true });
    }
    const days = Math.min(60, Math.max(1, Number(b?.days) || 7));
    // 위임 대상이 실재하는 본사 계정인지 확인 — 오타로 결재가 사라지지 않게.
    const rows = await hqAccounts(env);
    if (!rows.some(r => String(r.username) === to)) return json({ ok: false, error: 'unknown_user' }, 400);
    const until = Date.now() + days * 86400_000;
    await env.DB.prepare(
      `INSERT INTO approval_delegates (username, delegate_to, until_at, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(username) DO UPDATE SET delegate_to = excluded.delegate_to,
         until_at = excluded.until_at, updated_at = excluded.updated_at`
    ).bind(actor.username, to, until, Date.now()).run();
    return json({ ok: true, delegate_to: to, until_at: until });
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ⏰ 마감 관리 — 시한을 넘긴 건을 재알림하고, 더 넘기면 경영진으로 승격한다.
 *
 *   cron 은 계정 한도 5/5 로 꽉 차서 새로 못 만든다(wrangler.toml 주석).
 *   그래서 index.ts 의 기존 15분 트리거에 얹는다. 다른 작업과 격리되어 실패해도 번지지 않는다.
 *
 *   페널티는 «벌점»이 아니라 «가시성»이다 — 지연 건은 목록 맨 위에 표시되고,
 *   승격되면 경영진 결재함에 올라간다. 숨겨진 지연이 없어지는 것이 목적이다.
 * ═════════════════════════════════════════════════════════════════════════ */

export async function runApprovalSlaSweep(env: ApprovalEnv): Promise<{ ok: boolean; warned: number; escalated: number }> {
  let warned = 0, escalated = 0;
  try {
    await ensureTable(env);
    const now = Date.now();

    /* ⓪ ⏰ 알림 단계 (2026-09-24 사장님 「잊으면 수업 입장처럼 알람·사이렌」)
         단계가 열린 뒤 4시간 푸시 → 8시간 문자 → 12시간 사이렌(화면이 울림) → 24시간 승격(②).
         ⚠️ 밤(22~8시 KST)에는 문자·사이렌 단계로 «올리지 않는다» — 아침 첫 회차에 이어서 한다.
            긴급은 밤에도 간다.
         ⚠️ 한 번에 여러 단계를 건너뛰면(배포 직후의 옛 건) 가장 높은 단계 하나만 보낸다.
         ⚠️ 판정 정본은 approval-policy 의 nudgePlan·nudgeLevel — 화면(사이렌)도 같은 시각을 받는다. */
    try {
      const pend = await safe(async () => await env.DB.prepare(
        `SELECT r.*, s.role AS step_role FROM approval_requests r
           LEFT JOIN approval_steps s ON s.request_id = r.id AND s.seq = IFNULL(r.stage_seq, 1)
          WHERE r.status = 'pending' AND r.stage_due_at IS NOT NULL AND r.escalated_at IS NULL
          ORDER BY r.stage_due_at ASC LIMIT 200`
      ).all<any>(), { results: [] as any[] } as any);
      for (const r of (pend.results || [])) {
        const seq = Number(r.stage_seq || 1);
        const st = stageStartOf(r.req_type, r.stage_due_at);
        if (st == null) continue;
        const plan = nudgePlan(r.req_type, st);
        const cur = (Number(r.nudge_seq || 0) === seq) ? Number(r.nudge_level || 0) : 0;
        let target: number = nudgeLevel(plan, now);
        if (r.req_type !== 'urgent' && isQuietKst(now)) target = Math.min(target, Math.max(cur, 1));
        if (target <= cur) continue;
        const targets = await approversFor(env, String(r.step_role || 'staff'), r.requester_username);
        const deleg = await delegatesOf(env, targets);
        for (const d of deleg) if (targets.indexOf(d) < 0) targets.push(d);
        const hours = Math.max(1, Math.round((now - st) / 3600_000));
        const t60 = String(r.title || '').slice(0, 60);
        if (targets.length) {
          await notify(env, targets,
            (target >= 3 ? '🚨 ' : '') + '결재 대기 ' + hours + '시간 · Pending ' + hours + 'h',
            t60, r.id, target >= 3 ? 'approval-siren' : 'approval-nudge', quickSeqOf(r, seq));
          // 8시간·12시간(사이렌)이 되면 푸시와 상관없이 문자 — 푸시는 «켠 기기» 에만 가고 잠긴 폰은 놓친다.
          // 📱 (2026-09-25 사장님 「ARS 음성 메시지는 하지 말고 문자로만」) 전화(ARS)는 쓰지 않는다.
          //    판정 정본 nudgeSmsKind — 단계마다 한 번, 건너뛰면 가장 높은 단계의 문자 하나만.
          const smsKind = nudgeSmsKind(target, cur);
          if (smsKind) {
            await smsFallback(env, targets,
              (smsKind === 'siren'
                ? '[망고아이] 🚨 결재 ' + hours + '시간째 멈춤 — 지금 확인해 주세요\n'
                : '[망고아이] 결재 대기 ' + hours + '시간째\n') +
              t60 + '\n' + siteUrl('/work?id=' + r.id));
          }
        }
        await safe(async () => {
          await env.DB.prepare(`UPDATE approval_requests SET nudge_level = ?, nudge_seq = ? WHERE id = ?`)
            .bind(target, seq, r.id).run();
          return true;
        }, false);
      }
    } catch (e) {
      console.warn('[approval-nudge] failed:', (e as any)?.message || e);
    }

    /* 📬 하루 두 번 요약(9시·17시 KST) — 「바빠서 자주 못 본다」.
         받는 사람은 경영진·결재권자뿐, 자기가 «주 결재자» 인 건만 센다. 0건이면 안 보낸다.
         ⚠️ 15분 트리거가 그 시(時)에 네 번 돌므로 KV 에 «이 회차는 보냈다» 를 먼저 적는다.
            KV 를 못 쓰면 **보내지 않는다** — 한 시간에 네 번 울리는 쪽이 더 나쁘다. */
    try {
      const slot = digestSlotKst(now);
      const kv: any = (env as any).SESSION_STATE;
      if (slot && kv) {
        const key = 'approval_digest:' + slot;
        const seen = await kv.get(key);
        if (!seen) {
          await kv.put(key, '1', { expirationTtl: 3 * 86400 });
          const pend = await env.DB.prepare(
            `SELECT r.*, s.role AS step_role FROM approval_requests r
               LEFT JOIN approval_steps s ON s.request_id = r.id AND s.seq = IFNULL(r.stage_seq, 1)
              WHERE r.status = 'pending' LIMIT 300`
          ).all<any>();
          const people: string[] = [];
          for (const u of EXEC_USERNAMES.concat(MONEY_APPROVERS)) if (people.indexOf(u) < 0) people.push(u);
          for (const u of people) {
            const actorU: ActorLike = { ok: true, username: u, role: 'hq', isTeacher: false };
            let n = 0, green = 0, oldestH = 0;
            for (const r of (pend.results || [])) {
              if (String(r.requester_username) === u) continue;
              if (!isPrimaryApprover(actorU, String(r.step_role || 'staff') as any, false)) continue;
              n++;
              const sg = signalOf({ reqType: r.req_type, amount: r.amount, ocrAmount: r.ocr_amount,
                hasFile: !!r.file_key, flags: (() => { try { return JSON.parse(r.flags || '[]'); } catch { return []; } })() });
              if (sg.signal === 'green') green++;
              const st = stageStartOf(r.req_type, r.stage_due_at) || Number(r.created_at || now);
              oldestH = Math.max(oldestH, Math.round((now - st) / 3600_000));
            }
            if (!n) continue;
            await notify(env, [u], '결재 대기 ' + n + '건',
              '가장 오래된 것 ' + oldestH + '시간 · 🟢 바로 승인 가능 ' + green + '건', 0, 'approval-digest',
              0, digestUrl(green));   // 🟢 가 있으면 누르자마자 «한 번에 승인» 자리로(10단계)
          }
        }
      }
    } catch (e) {
      console.warn('[approval-digest] failed:', (e as any)?.message || e);
    }

    /* 📅 월초 요약 — 1일 KST 9시에 «지난달» 결재를 경영진에게 한 번(정본 monthlyReportLines).
         ⚠️ 새 크론을 못 만들어(계정 한도 5/5) 이 15분 점검에 얹는다. 그 시(時)에 네 번 돌므로
            KV 에 «보냈다» 를 먼저 적고, KV 를 못 쓰면 **보내지 않는다**(하루 요약과 같은 규칙). */
    try {
      const month = monthlySlotKst(now);
      const range = kstMonthRange(month);
      const kv: any = (env as any).SESSION_STATE;
      if (month && range && kv) {
        const key = 'approval_monthly:' + month;
        const seen = await kv.get(key);
        if (!seen) {
          await kv.put(key, '1', { expirationTtl: 40 * 86400 });
          const rows = (await env.DB.prepare(
            `SELECT req_type, status, category, amount, currency, spent_at, created_at, file_key, reverses_id,
                    requester_username, requester_name, origin_id
               FROM approval_requests WHERE created_at >= ? AND created_at < ? LIMIT 2000`
          ).bind(range[0], range[1]).all<any>()).results || [];
          const lines = monthlyReportLines(month, summarizeApprovals(rows as any[]), firstPassRates(rows as any[]));
          if (lines.length) {
            lines.push(siteUrl('/work'));
            const execs = await approversFor(env, 'exec', null);
            const n = await notify(env, execs, month + ' 결재 월간 요약', lines[1], 0, 'approval-monthly');
            if (n.missed.length) await smsFallback(env, n.missed, lines.join('\n'));
          }
        }
      }
    } catch (e) {
      console.warn('[approval-monthly] failed:', (e as any)?.message || e);
    }

    // ① 단계 마감을 넘긴 건 — 하루에 한 번만 다시 알린다(warned_at 로 도배 방지).
    const dueRs = await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_requests
        WHERE status = 'pending' AND stage_due_at IS NOT NULL AND stage_due_at < ?
          AND (warned_at IS NULL OR warned_at < ?)
        ORDER BY stage_due_at ASC LIMIT 30`
    ).bind(now - 86400_000, now - 86400_000).all<any>(), { results: [] as any[] } as any);
    /* ↑ (2026-09-24) 마감 «하루 뒤» 부터 하루 1번. 처음 24시간은 아래 ⓪ 알림 단계가 맡는다
       (4시간 푸시 → 8시간 문자 → 12시간 사이렌 → 24시간 승격) — 겹쳐 두 번 울리지 않게. */

    for (const r of (dueRs.results || [])) {
      const seq = Number(r.stage_seq || 1);
      const st: any = await safe(async () => await env.DB.prepare(
        `SELECT role FROM approval_steps WHERE request_id = ? AND seq = ? LIMIT 1`
      ).bind(r.id, seq).first(), null);
      const targets = await approversFor(env, String(st?.role || 'staff'), r.requester_username);
      const deleg = await delegatesOf(env, targets);
      for (const d of deleg) if (targets.indexOf(d) < 0) targets.push(d);
      const nl = await notify(env, targets, 'Overdue approval',
                              String(r.title || '').slice(0, 80), r.id, 'approval-late');
      // 마감을 넘긴 건은 «못 봤다» 가 이유인 경우가 대부분이다. 푸시가 안 닿으면 문자로.
      //   ⚠️ 밤(22~8시 KST)에는 문자를 쉰다 — 긴급만 예외.
      if (nl.missed.length && (r.req_type === 'urgent' || !isQuietKst(now))) {
        await smsFallback(env, nl.missed,
          '[망고아이] 결재 마감이 지났습니다\n' + String(r.title || '').slice(0, 60) +
          '\n' + siteUrl('/work?id=' + r.id));
      }
      await safe(async () => {
        await env.DB.prepare(`UPDATE approval_requests SET warned_at = ? WHERE id = ?`).bind(now, r.id).run();
        return true;
      }, false);
      warned++;
    }

    // ② 단계가 열리고 24시간(긴급은 2시간)이 지난 건 — 경영진 결재함으로 승격.
    //    (2026-09-24 전에는 «마감 + 이틀» = 물품·지출 72시간이었다. 너무 늦었다.)
    const escAll = await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_requests
        WHERE status = 'pending' AND stage_due_at IS NOT NULL AND escalated_at IS NULL
        ORDER BY stage_due_at ASC LIMIT 200`
    ).all<any>(), { results: [] as any[] } as any);
    const escRs = { results: (escAll.results || []).filter((r: any) => {
      const st = stageStartOf(r.req_type, r.stage_due_at);
      return st != null && now >= nudgePlan(r.req_type, st).escalateAt;
    }).slice(0, 20) };

    // ⚠️ 승격 대상(경영진)이 한 명도 없으면 승격하지 않는다.
    //    바꿔 버리면 «아무도 결재할 수 없는 단계»가 되어 결재가 영영 멈춘다.
    //    (EXEC_USERNAMES 설정이 비어 있거나 계정명이 바뀐 경우 — approval-policy.ts 참고)
    const execPool = await approversFor(env, 'exec', null);
    if (!execPool.length && (escRs.results || []).length) {
      console.warn('[approval-sla] 경영진 계정이 없어 승격을 건너뜀 — approval-policy.EXEC_USERNAMES 확인 필요');
    }

    for (const r of (execPool.length ? (escRs.results || []) : [])) {
      const seq = Number(r.stage_seq || 1);
      // 지금 단계를 경영진 단계로 바꾼다 — 새 단계를 만들지 않는다(이력이 헝클어지지 않게).
      await safe(async () => {
        await env.DB.prepare(`UPDATE approval_steps SET role = 'exec' WHERE request_id = ? AND seq = ? AND status = 'active'`)
          .bind(r.id, seq).run();
        return true;
      }, false);
      await safe(async () => {
        await env.DB.prepare(`UPDATE approval_requests SET escalated_at = ? WHERE id = ?`).bind(now, r.id).run();
        return true;
      }, false);
      const execs = await approversFor(env, 'exec', r.requester_username);
      const ne = await notify(env, execs, 'Escalated — overdue',
                              String(r.title || '').slice(0, 80), r.id, 'approval-esc');
      if (ne.missed.length && (r.req_type === 'urgent' || !isQuietKst(now))) {
        await smsFallback(env, ne.missed,
          '[망고아이] 지연 결재가 경영진으로 넘어왔습니다\n' + String(r.title || '').slice(0, 60) +
          '\n' + siteUrl('/work?id=' + r.id));
      }
      escalated++;
    }

    return { ok: true, warned, escalated };
  } catch (e) {
    console.warn('[approval-sla] sweep failed:', (e as any)?.message || e);
    return { ok: false, warned, escalated };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 📊 주간 결재 리포트 — 페널티는 «벌점» 이 아니라 «가시성» 이다
 *
 *   숨겨진 지연은 아무도 고치지 않지만, 드러난 지연은 대부분 스스로 해결된다.
 *   그래서 점수를 매기는 대신 **사실을 주간으로 보여 준다** —
 *   몇 건이 오갔고, 평균 몇 시간 걸렸고, 누가 몇 건을 늦게 처리했는가.
 *
 *   ⚠️ 이 숫자는 전부 코드가 계산한다. AI 는 관여하지 않는다(급여 기능과 같은 선).
 *   ⚠️ 경영진에게만 보낸다 — 사람별 지연 건수는 인사 정보에 가깝다.
 * ═════════════════════════════════════════════════════════════════════════ */

export async function runApprovalWeeklyReport(env: ApprovalEnv): Promise<{ ok: boolean; sent: number; total: number }> {
  try {
    await ensureTable(env);
    const now = Date.now();
    const from = now - 7 * 86400_000;

    const tot: any = await safe(async () => await env.DB.prepare(
      `SELECT COUNT(*) AS c,
              SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS ok_n,
              SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS no_n,
              SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) AS wait_n,
              SUM(CASE WHEN status='withdrawn' THEN 1 ELSE 0 END) AS wd_n,
              SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cx_n
         FROM approval_requests WHERE created_at >= ?`
    ).bind(from).first(), null);
    const total = Number(tot?.c || 0);

    /* 평균 «결재» 처리 시간 — 끝난 건만.
       🔴 회수는 빼야 한다. 회수도 decided_at/decided_by 를 쓰는데(그 건이 언제 끝났나),
          기안자가 5분 만에 내린 회수가 «아주 빠른 결재» 로 섞여 **평균을 끌어내린다**
          (2026-09-05 함정 대조 지적). 결재자가 판단한 것만 센다. */
    const avg: any = await safe(async () => await env.DB.prepare(
      `SELECT AVG(decided_at - created_at) AS ms FROM approval_requests
        WHERE created_at >= ? AND decided_at IS NOT NULL
          AND status IN ('approved','rejected')`
    ).bind(from).first(), null);
    const avgH = avg?.ms ? Math.round(Number(avg.ms) / 3600_000 * 10) / 10 : null;

    // 지금 마감을 넘긴 채 남아 있는 건
    const late: any = await safe(async () => await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM approval_requests
        WHERE status='pending' AND stage_due_at IS NOT NULL AND stage_due_at < ?`
    ).bind(now).first(), null);
    const lateN = Number(late?.c || 0);

    // 이번 주에 마감을 넘겨 알림이 나간 건 (사람별) — «누가» 가 아니라 «어디서» 막히는지 본다.
    const slow = await safe(async () => (await env.DB.prepare(
      `SELECT requester_username AS u, COUNT(*) AS c FROM approval_requests
        WHERE created_at >= ? AND warned_at IS NOT NULL
        GROUP BY requester_username ORDER BY c DESC LIMIT 5`
    ).bind(from).all<any>()).results || [], [] as any[]);

    if (!total) return { ok: true, sent: 0, total: 0 };

    const lines = [
      '[망고아이] 주간 결재 요약',
      /* ⚠️ 숫자를 손으로 나열하면 상태가 늘 때 **합이 안 맞는다**(a+b+c ≠ total).
         회수·취소도 함께 적고, 0이면 굳이 안 적는다. */
      '올라온 결재 ' + total + '건 (승인 ' + Number(tot?.ok_n || 0) +
        ' · 반려 ' + Number(tot?.no_n || 0) + ' · 대기 ' + Number(tot?.wait_n || 0) +
        (Number(tot?.wd_n || 0) ? (' · 회수 ' + Number(tot.wd_n)) : '') +
        (Number(tot?.cx_n || 0) ? (' · 취소 ' + Number(tot.cx_n)) : '') + ')',
      avgH != null ? ('평균 결재 ' + avgH + '시간') : '평균 결재 — (끝난 건 없음)',
      lateN ? ('지금 마감을 넘긴 건 ' + lateN + '건') : '마감을 넘긴 건 없음',
    ];
    if (slow.length) {
      lines.push('알림이 나간 건: ' + slow.map((s: any) => s.u + ' ' + s.c).join(', '));
    }

    /* 📊 이번 주 승인된 지출 합계(통화별) · 그중 🟡/🔴 였던 건 — 판정 정본 weeklySpend(10단계).
         «이상한 것만» 보시려는 대표님이 숫자 한 줄로 이번 주 돈의 크기와 걸린 건을 보게. */
    const spRows = await safe(async () => (await env.DB.prepare(
      `SELECT status, reverses_id, amount, currency, req_type, ocr_amount, file_key, flags FROM approval_requests
        WHERE created_at >= ? AND status = 'approved' LIMIT 500`
    ).bind(from).all<any>()).results || [], [] as any[]);
    const sp = weeklySpend((spRows as any[]).map((r: any) => {
      let fl: Flag[] = [];
      try { if (r.flags) fl = JSON.parse(r.flags); } catch { fl = []; }
      return { ...r, signal: signalOf({ reqType: r.req_type, amount: r.amount, ocrAmount: r.ocr_amount,
        hasFile: !!r.file_key, flags: fl }).signal };
    }));
    if (sp.count) {
      lines.push('승인된 지출: ' + sp.byCur.map(c => fmt(c.sum, c.cur) + ' (' + c.n + '건)').join(' · ') +
                 (sp.flagged ? ' — 그중 🟡/🔴 였던 건 ' + sp.flagged + '건' : ' — 전부 🟢'));
    }

    /* 🤖 자동 반려 «켤지 말지» 판단 자료 — 지난 14일, AI 가 🔴(되돌렸을 것)로 본 건을
       두 분이 실제로 어떻게 처리했나. 판정 정본 shadowTally. 스위치가 이미 'on' 이어도 같이 센다. */
    const sh = shadowTally(await loadShadowRows(env, now));
    if (sh.red) {
      lines.push('AI 자동 반려(연습) 14일: 🔴 ' + sh.red + '건 중 두 분도 반려 ' + sh.agreed +
                 '건 · 승인하신 건 ' + sh.disagreed + '건' +
                 (sh.disagreed === 0 ? ' — 켜도 되는지 검토해 주세요' : ' — 아직 켜지 않는 것이 좋습니다'));
    }
    /* ✅ 올린 사람별 «첫 번에 통과» — 지난 14일 결정 난 건만(판정 정본 firstPassRates).
       필리핀 쪽 품질이 오르면 두 분 앞에 오는 건 자체가 줄어든다. 결정이 2건 이상인 사람만 싣는다. */
    const fpRows = await safe(async () => (await env.DB.prepare(
      `SELECT requester_username, requester_name, status, origin_id, reverses_id FROM approval_requests
        WHERE created_at >= ? AND status IN ('approved','rejected') LIMIT 500`
    ).bind(now - 14 * 86400_000).all<any>()).results || [], [] as any[]);
    const fp = firstPassRates(fpRows as any[]).filter(e => e.decided >= 2).slice(0, 5);
    if (fp.length) {
      lines.push('첫 번에 통과(14일): ' + fp.map(e => e.name + ' ' + e.pct + '% (' + e.firstPass + '/' + e.decided + ')').join(', '));
    }
    lines.push(siteUrl('/work'));
    const text = lines.join('\n');

    // 경영진에게만. 푸시로 닿지 않으면 문자로.
    const execs = await approversFor(env, 'exec', null);
    const n = await notify(env, execs, '주간 결재 요약', lines[1], 0, 'approval-weekly');
    if (n.missed.length) await smsFallback(env, n.missed, text);

    console.log('[approval-weekly]', JSON.stringify({ total, avgH, lateN, execs: execs.length }));
    return { ok: true, sent: execs.length, total };
  } catch (e) {
    console.warn('[approval-weekly] failed:', (e as any)?.message || e);
    return { ok: false, sent: 0, total: 0 };
  }
}
