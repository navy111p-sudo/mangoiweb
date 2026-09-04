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
import { oncePerIsolate } from './once-per-isolate';   // ⚡ 준비 DDL 을 요청마다 반복하지 않게
import { selectInChunks } from './d1-chunk';           // 🔢 IN 목록은 손으로 자르지 않는다(D1 바인드 100 한도)
import { siteUrl } from './site-url';                  // 🔗 사람에게 나가는 링크는 한 곳에서
import {                                               // 💼 인사·급여 «월 확정» — 급여 표는 읽기만 한다
  HR_KINDS, isHrKind, isPeriod, ensureHrTable, getLock, lockPeriod, buildHrSnapshot, listHrPeriods,
} from './approval-hr';
import {
  REQ_TYPES, TYPES, typeSpec, stagesFor, deadlineMs, stageDeadlineMs,
  isExec, isHqStaff, canDecideStage, canSubmit, canView, runChecks, normCurrency,
  sniffKind, normExt, contentTypeFor,
  type Stage, type Flag, type ActorLike,
} from './approval-policy';

interface ApprovalEnv {
  DB: D1Database;
  RECORDINGS?: R2Bucket;
  AI?: any;
  [k: string]: any;
}

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
  ];
  for (const sql of addCols) {
    try { await env.DB.exec(sql); } catch { /* 이미 있는 칸 — 정상 */ }
  }
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
  jobs: Array<{ id: number; role: string; requester: string }>
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
      if (canDecideStage(actor, j.role as any, isPhManager(actor))) n++;
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
  env: ApprovalEnv, usernames: string[], title: string, body: string, reqId: number, tag: string
): Promise<{ push: number; missed: string[] }> {
  const missed: string[] = [];
  if (!usernames.length) return { push: 0, missed };
  let sent = 0;
  const url = '/work?id=' + reqId;
  for (const u of usernames) {
    const rs = await safe(async () => await env.DB.prepare(
      `SELECT endpoint FROM push_subscriptions WHERE user_id = ? AND enabled = 1 LIMIT 10`
    ).bind(u).all<{ endpoint: string }>(), { results: [] as any[] } as any);
    const eps = rs.results || [];
    if (!eps.length) { missed.push(u); continue; }   // 이 사람은 푸시로 닿지 않는다
    for (const s of eps) {
      const ok = await safe(async () => {
        await env.DB.prepare(
          `INSERT INTO push_queue (endpoint, title, body, url, icon, badge, tag, queued_at)
           VALUES (?,?,?,?,?,?,?,?)`
        ).bind(s.endpoint, title, body, url, null, null, tag + ':' + reqId, Date.now()).run();
        return true;
      }, false);
      if (ok) sent++;
    }
  }
  return { push: sent, missed };
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
async function readReceipt(env: ApprovalEnv, bytes: Uint8Array): Promise<{ amount: number | null; spent_at: string | null; vendor: string | null; text: string } | null> {
  const AI = env.AI;
  if (!AI) return null;
  const prompt =
    'This is a receipt photo. Reply with ONLY a JSON object, no prose: ' +
    '{"amount": <total amount as a number, no currency symbol or commas>, ' +
    '"date": "<YYYY-MM-DD or empty string>", "vendor": "<shop name or empty string>"}. ' +
    'If you cannot read a field, use null for amount and "" for the others.';
  const models = ['@cf/meta/llama-3.2-11b-vision-instruct', '@cf/llava-hf/llava-1.5-7b-hf'];
  for (const m of models) {
    const raw = await safe(async () => {
      const r: any = await AI.run(m, { image: Array.from(bytes), prompt, max_tokens: 160 });
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

async function gatherCheckFacts(
  env: ApprovalEnv, requester: string, reqType: string, amount: number | null, currency: string
): Promise<{ duplicateCount: number; monthTotal: number | null; medianAmount: number | null }> {
  const now = Date.now();
  const since30 = now - 30 * 86400_000;

  // ① 같은 사람이 최근 30일 안에 올린 «같은 분류 · 같은 금액»
  let duplicateCount = 0;
  if (amount != null) {
    const d: any = await safe(async () => await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM approval_requests
        WHERE requester_username = ? AND req_type = ? AND currency = ?
          AND amount = ? AND created_at >= ? AND status != 'rejected'`
    ).bind(requester, reqType, currency, amount, since30).first(), null);
    duplicateCount = Number(d?.c || 0);
  }

  // ② 이번 달 같은 분류 승인 합계
  const mStart = (() => { const t = new Date(now); return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1); })();
  const s: any = await safe(async () => await env.DB.prepare(
    `SELECT IFNULL(SUM(amount), 0) AS s FROM approval_requests
      WHERE req_type = ? AND currency = ? AND status = 'approved' AND created_at >= ?`
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

  return { duplicateCount, monthTotal, medianAmount };
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
  const body = (brief && r.body) ? String(r.body).slice(0, 300) : r.body;
  return {
    id: r.id, req_type: r.req_type,
    type_ko: spec.ko, type_en: spec.en,
    title: r.title, body, category: r.category,
    amount: r.amount, currency: r.currency, spent_at: r.spent_at,
    date_from: r.date_from || null, date_to: r.date_to || null,
    hr_kind: r.hr_kind || null, period: r.period || null,
    requester_username: r.requester_username, requester_name: r.requester_name,
    has_file: !!r.file_key, file_name: r.file_name, file_size: r.file_size,
    status: r.status, decided_by: r.decided_by, decided_at: r.decided_at,
    decide_memo: r.decide_memo, created_at: r.created_at,
    stage_seq: seq, stage_total: total,
    deadline_at: r.deadline_at || null, stage_due_at: r.stage_due_at || null,
    escalated: !!r.escalated_at,
    summary_ko: r.summary_ko || null, summary_en: r.summary_en || null,
    flags,
    steps: (steps || []).map((s: any) => ({
      seq: s.seq, role: s.role, status: s.status,
      decided_by: s.decided_by, decided_at: s.decided_at, memo: s.memo,
    })),
  };
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
  if (!isHqStaff(actor) && !actor.isTeacher) {
    return json({
      ok: false, error: 'forbidden',
      message: '본사 계정만 사용할 수 있습니다.',
      message_en: 'Head-office accounts only.',
    }, 403);
  }
  await ensureTable(env);

  const ph = isPhManager(actor);
  const iAmExec = isExec(actor);

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
      `SELECT COUNT(*) AS c, IFNULL(MAX(created_at),0) AS mc, IFNULL(MAX(decided_at),0) AS md,
              IFNULL(MAX(IFNULL(escalated_at,0)),0) AS me2
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
    const etag = `W/"a4-${me}-${sig?.c || 0}-${sig?.mc || 0}-${sig?.md || 0}-${sig?.me2 || 0}` +
                 `-${dsig?.c || 0}-${dsig?.mu || 0}-${lsig?.c || 0}-${lsig?.ma || 0}` +
                 `-${hsig?.c || 0}-${hourBucket}"`;
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

    // ① 내가 결재할 것 — 내 단계이고, 내가 올린 건이 아닌 것
    //    정렬은 «마감이 급한 순 → 오래된 순». 시각에 기대지 않으므로 내용이 같으면 순서도 같다.
    const pendRs = await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_requests
        WHERE status = 'pending' AND requester_username != ?
        ORDER BY (stage_due_at IS NULL) ASC, stage_due_at ASC, created_at ASC LIMIT 40`
    ).bind(me).all<any>(), { results: [] as any[] } as any);

    const mineRs = await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_requests WHERE requester_username = ? ORDER BY created_at DESC LIMIT 15`
    ).bind(me).all<any>(), { results: [] as any[] } as any);

    // ③ 🚨 긴급 소통 — 조직 전원이 본다(강사 포함). 결재 권한과 무관하게 «보이는» 것이 목적이다.
    //    이게 없으면 강사·필리핀 매니저는 긴급 공지를 올릴 수는 있어도 남이 올린 것은 못 본다.
    const urgRs = await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_requests WHERE req_type = 'urgent' AND created_at >= ?
        ORDER BY created_at DESC LIMIT 10`
    ).bind((hourBucket * 3600_000) - 7 * 86400_000).all<any>(), { results: [] as any[] } as any);

    // 단계는 **한 번에** 받는다 — 예전엔 행마다 따로 조회해서 쿼리가 40건 넘게 나갔다.
    const pend = (pendRs.results || []), mineRows = (mineRs.results || []), urgRows = (urgRs.results || []);
    const allIds: number[] = [];
    for (const r of pend) allIds.push(Number(r.id));
    for (const r of mineRows) if (allIds.indexOf(Number(r.id)) < 0) allIds.push(Number(r.id));
    for (const r of urgRows) if (allIds.indexOf(Number(r.id)) < 0) allIds.push(Number(r.id));
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
      inbox.push(rowOf(r, steps, true));
      if (inbox.length >= 20) break;
    }

    // ② 내가 올린 것
    const mine: any[] = mineRows.map((r: any) => rowOf(r, stepMap[Number(r.id)] || [], true));

    /* 「올렸는데 어떻게 됐지」 — 아직 대기 중인 내 건에 «지금 결재할 수 있는 사람 수»를 붙인다.
       0명이면 기다려도 처리되지 않는다. 화면이 그 사실을 말할 수 있어야 한다.
       ⚠️ 대기 중인 건에만 붙인다 — 이미 끝난 건은 셀 이유가 없고, 그만큼 계정 조회도 아낀다. */
    const countJobs: Array<{ id: number; role: string; requester: string }> = [];
    for (const m of mine) {
      if (m.status !== 'pending') continue;
      const st = (m.steps || []).find((s: any) => Number(s.seq) === Number(m.stage_seq));
      countJobs.push({
        id: Number(m.id),
        role: String(st?.role || 'staff'),   // 단계 기록이 없는 옛 건은 «staff 1단계»로 본다(rowOf 와 같은 해석)
        requester: String(m.requester_username),
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
      reuse.push({ req_type: r.req_type, title: r.title, body: r.body, amount: r.amount, currency: r.currency });
      if (reuse.length >= 3) break;
    }

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
      can_approve: inbox.length > 0 || (!ph && isHqStaff(actor)),
      pending: inbox.length,
      types: TYPES.filter(t => canSubmit(actor, t.key, ph))
                  .map(t => ({ key: t.key, ko: t.ko, en: t.en, needs_amount: t.needsAmount,
                               wants_file: t.wantsFile, requires_file: !!t.requiresFile, wants_dates: !!t.wantsDates,
                               // 💼 인사·급여는 «달을 고르는» 분류다. 화면이 폼 대신 월 버튼을 그린다.
                               picks_period: t.key === 'hr' })),
      hr_periods: hrPeriods,
      inbox, mine, reuse, urgent,
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
      const category = String(form.get('category') || '').trim().slice(0, 60) || null;
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

      let fileKey: string | null = null, fileName: string | null = null;
      let fileExt: string | null = null, fileSize: number | null = null;
      const file = form.get('file') as File | null;
      if (file && file.size > 0) {
        if (file.size > MAX_FILE) return json({ ok: false, error: 'file_too_large', max: MAX_FILE }, 413);
        const ext = normExt((file.name.split('.').pop() || '').toLowerCase());
        if (ALLOWED_EXT.indexOf(ext) < 0) return json({ ok: false, error: 'invalid_type', allowed: ALLOWED_EXT }, 400);

        // 🛡️ 이름이 아니라 **내용**으로 확인한다. 이름표는 누구나 바꿀 수 있다.
        const bytes = new Uint8Array(await file.arrayBuffer());
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

      // 결재선·마감 — 사람이 고르지 않는다(approval-policy.stagesFor).
      const stages: Stage[] = stagesFor(reqType, amount, currency);
      const now = Date.now();
      const deadline = deadlineMs(reqType, now, stages.length);
      const stageDue = stageDeadlineMs(reqType, now);

      // 자동 점검 — 계산만. 여기서 나온 표시가 결재자의 판단 재료가 된다.
      const facts = await gatherCheckFacts(env, actor.username, reqType, amount, currency);
      const flags = runChecks({
        reqType, amount, currency, hasFile: !!fileKey, ocrAmount,
        duplicateCount: facts.duplicateCount, monthTotal: facts.monthTotal, medianAmount: facts.medianAmount,
      });
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
            client_key, date_from, date_to, hr_kind, period)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(reqType, actor.username, actor.name || null, title, body || null, category,
             amount, currency, spentAt, fileKey, fileName, fileExt, fileSize, now,
             stages.length, deadline, stageDue, ocrAmount, JSON.stringify(flags), clientKey,
             dateFrom, dateTo, hrKind, period).run();

      const reqId = Number(ins.meta.last_row_id);

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

      // 1단계 결재자에게 알림(대결 포함).
      const targets = await approversFor(env, stages[0].role, actor.username);
      const deleg = await delegatesOf(env, targets);
      for (const d of deleg) if (targets.indexOf(d) < 0) targets.push(d);
      const spec2 = typeSpec(reqType);
      const n1 = await notify(
        env, targets,
        (spec2.en) + ' · ' + (actor.name || actor.username),
        title.slice(0, 80),
        reqId, 'approval'
      );
      // 🚨 긴급만 문자로도 보낸다. 사고·정전·학부모 항의는 «나중에 열어 보면» 늦다.
      //    나머지 분류는 푸시와 배지로 충분하다(문자는 돈이 든다).
      if (reqType === 'urgent' && n1.missed.length) {
        await smsFallback(env, n1.missed,
          '[망고아이 긴급] ' + title.slice(0, 60) + '\n' + (actor.name || actor.username) + '\n' + siteUrl('/work?id=' + reqId));
      }

      return json({ ok: true, id: reqId, stages: stages.length, flags, summary: sum || null });
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
    const scope = url.searchParams.get('scope') || 'mine';
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const me = String(actor.username);
    const approver = !ph && isHqStaff(actor);

    if ((scope === 'pending' || scope === 'all') && !approver) {
      return json({ ok: false, error: 'forbidden_scope' }, 403);
    }
    let sql: string, binds: any[];
    if (scope === 'mine') {
      sql = `SELECT * FROM approval_requests WHERE requester_username = ? ORDER BY created_at DESC LIMIT ?`;
      binds = [me, limit];
    } else if (scope === 'pending') {
      // 본인 요청은 결재함에서 뺀다 — 눌러도 거절될 버튼을 보여 줄 이유가 없다.
      sql = `SELECT * FROM approval_requests WHERE status = 'pending' AND requester_username != ?
              ORDER BY created_at ASC LIMIT ?`;
      binds = [me, limit];
    } else {
      sql = `SELECT * FROM approval_requests ORDER BY (status='pending') DESC, created_at DESC LIMIT ?`;
      binds = [limit];
    }
    const rs = await env.DB.prepare(sql).bind(...binds).all<any>().catch(() => ({ results: [] as any[] }));

    // 열람등급으로 한 번 더 거른다 — 인사·급여가 목록에 섞여 나가지 않게.
    const items: any[] = [];
    for (const r of (rs.results || [])) {
      const ch = await chainOf(env, r.id);
      if (!canView(actor, r.req_type, r.requester_username, ch.usernames, ph)) continue;
      items.push(rowOf(r, ch.steps));
    }

    let pending = 0;
    if (approver) {
      const c: any = await safe(async () => await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM approval_requests WHERE status='pending' AND requester_username != ?`
      ).bind(me).first(), null);
      pending = Number(c?.c || 0);
    }
    return json({ ok: true, can_approve: approver, pending, items });
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

    // 전결 — 경영진은 중간 단계를 건너뛰고 바로 최종 결재할 수 있다.
    const straightThrough = iAmExec && role !== 'exec';
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
    const memo = String(payload?.memo || '').slice(0, 1000) || null;

    const now = Date.now();
    const lastStage = (seq >= total) || straightThrough;
    const finalStatus = (decision === 'rejected') ? 'rejected' : (lastStage ? 'approved' : 'pending');

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
                   String(cur.title || '').slice(0, 80), id, 'approval');
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
      // 끝났으면 올린 사람에게 결과를 알린다.
      await notify(env, [String(cur.requester_username)],
                   decision === 'approved' ? 'Approved' : 'Rejected',
                   String(cur.title || '').slice(0, 80), id, 'approval-result');
    }

    return json({ ok: true, id, status: finalStatus, stage_seq: nextSeq, stage_total: total, straight_through: straightThrough });
  }

  // ── 첨부 내려받기 ─────────────────────────────────────────────────────────
  //   본인 요청이거나 열람 권한자만. 영수증에는 계좌·금액이 찍혀 있다.
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
    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        // 파일명에 한글·공백이 들어가므로 filename* 로 준다. 인라인이 아니라 내려받기.
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(r.file_name || 'file')}`,
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
  if (method === 'POST' && path === '/api/approval/ocr') {
    const buf = await request.arrayBuffer().catch(() => null);
    if (!buf || buf.byteLength === 0) return json({ ok: false, error: 'empty' }, 400);
    if (buf.byteLength > MAX_OCR_BYTES) return json({ ok: false, error: 'too_large', max: MAX_OCR_BYTES }, 413);
    const got = await readReceipt(env, new Uint8Array(buf));
    if (!got) return json({ ok: false, error: 'unreadable' });
    return json({ ok: true, ...got });
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

    // ① 단계 마감을 넘긴 건 — 하루에 한 번만 다시 알린다(warned_at 로 도배 방지).
    const dueRs = await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_requests
        WHERE status = 'pending' AND stage_due_at IS NOT NULL AND stage_due_at < ?
          AND (warned_at IS NULL OR warned_at < ?)
        ORDER BY stage_due_at ASC LIMIT 30`
    ).bind(now, now - 86400_000).all<any>(), { results: [] as any[] } as any);

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
      if (nl.missed.length) {
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

    // ② 마감 이틀을 넘긴 건 — 경영진 결재함으로 승격. 원 결재자에게도 알린다.
    const escRs = await safe(async () => await env.DB.prepare(
      `SELECT * FROM approval_requests
        WHERE status = 'pending' AND stage_due_at IS NOT NULL AND stage_due_at < ?
          AND escalated_at IS NULL
        ORDER BY stage_due_at ASC LIMIT 20`
    ).bind(now - 2 * 86400_000).all<any>(), { results: [] as any[] } as any);

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
      if (ne.missed.length) {
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
              SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) AS wait_n
         FROM approval_requests WHERE created_at >= ?`
    ).bind(from).first(), null);
    const total = Number(tot?.c || 0);

    // 평균 처리 시간(시간 단위) — 끝난 건만 센다.
    const avg: any = await safe(async () => await env.DB.prepare(
      `SELECT AVG(decided_at - created_at) AS ms FROM approval_requests
        WHERE created_at >= ? AND decided_at IS NOT NULL`
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
      '올라온 결재 ' + total + '건 (승인 ' + Number(tot?.ok_n || 0) +
        ' · 반려 ' + Number(tot?.no_n || 0) + ' · 대기 ' + Number(tot?.wait_n || 0) + ')',
      avgH != null ? ('평균 처리 ' + avgH + '시간') : '평균 처리 — (끝난 건 없음)',
      lateN ? ('지금 마감을 넘긴 건 ' + lateN + '건') : '마감을 넘긴 건 없음',
    ];
    if (slow.length) {
      lines.push('알림이 나간 건: ' + slow.map((s: any) => s.u + ' ' + s.c).join(', '));
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
