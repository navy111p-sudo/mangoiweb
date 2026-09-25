/**
 * ai-billing.ts — B2B(대리점) AI 콘텐츠 사용료 월 청구 (2026-09-10 신설)
 * ════════════════════════════════════════════════════════════════════════
 *
 * [왜 있는가] 개인 회원은 `src/api-pay.ts` 의 `ai_content`(월 10,000원) 상품을
 *   각자 결제할 수 있지만, 실제 수요는 대부분 **대리점(학원) 단위 일괄 결제**다.
 *   대리점 담당자가 매달 「우리 학원 재원생 N명 × 단가 = 총액」을 보고 한 번에 낸다.
 *   기존 조사(`docs/B2B결제_현황조사_260807.md`)가 확인한 대로, 이런 «기관이 우리에게
 *   내는» 결제 흐름은 이전까지 **코드 어디에도 없었다**(org-settlement.ts 는 반대 방향
 *   — 본사가 대리점에 정산해 주는 흐름).
 *
 * [단가 — 2026-09-24 개정] 기본은 «A.i반 인원 구간 공급가»(사장님 공급가 제안서 5안) —
 *   정본 `ai-billing-price.ts`(71명↑ 4,500 · 51~70 5,500 · 21~50 6,500 · 20명↓ 7,500원/명,
 *   최소 20명분 청구, 구간 경계 보정, 지사 커미션 40%). `agency_ai_rate` 에 적힌 학원만
 *   «예외 단가» 로 그 단가 × 청구 인원. 본사(hq)만 바꿀 수 있다.
 *   (2026-09-10 ~ 09-23 의 «기본 10,000원 × 인원» 은 `DEFAULT_AI_RATE_KRW` 로 옛 청구서
 *   읽기에만 남는다 — 그 기간 생성된 청구서는 운영 0건.)
 *
 * [인원 — 2026-09-25 개정] A.i반(청구) = 재원 ∩ «A.i 단독 신청» 명단(ai_billing_optin) − 화상반.
 *   화상영어를 하면 A.i 는 포함이라 화상반은 청구하지 않는다(2026-09-24 사장님 결정).
 *   ⚠️ 09-24 판은 «재원 − 화상반» 이라 신청 0명인데 약 7,300명이 청구 대상으로 보였다(아래 loadAiOptIns).
 * [스위치 — 2026-09-25] 자동 청구는 기본 «꺼짐»(테스트 기간). 본사가 POST /switch 로 켠다(billingEnabled).
 *
 * [재원] 「다음 달 수업을 진행할 인원」이 아니라 **«재원 중인 학생 수»** 다(사장님 정정 —
 *   "AI 컨텐츠 사용료는 수업의 개념이 아니야"). 판정은 exec-summary.ts 의 `enrolledCond()`
 *   를 그대로 쓴다 — ⛔ `status='정상'` 으로 직접 짜지 말 것. 그 값은 운영 D1 에 **0건**이고
 *   (실제 값은 `active`/`inactive`), 그 사고를 이미 한 번 겪고 exec-summary.ts 에 판정을
 *   모아 둔 것이다(같은 실수를 여기서 또 하지 않으려고 그 함수를 export 해서 그대로 쓴다).
 *
 * [청구서가 «스냅샷 + 수정 가능한 명세»인 이유] 사장님 지시: "자동으로 생성하되,
 *   생성 내역을 사람이 볼 수 있게 해주고 추가된 인원이 있으면 눌러서 추가해서도 생성할 수
 *   있게 해줘. 자동 생성 후 학원을 퇴원한 인원이 있다면 뺄 수도 있게 해야해."
 *   그래서 청구서(`ai_billing_invoices`)는 «인원 수 하나» 가 아니라 학생별 명세
 *   (`ai_billing_invoice_items`)를 갖고, `included` 로 개별 제외/포함한다.
 *   `invoice/generate` 는 **덮어쓰지 않고 더하기만** 한다 — 이미 올라간 학생을 건드리지
 *   않아야 사람이 뺀 것이 다시 살아나지 않는다. 가격 규칙(`price_rule` JSON)과 예외 단가
 *   (`rate_krw`, 0 = 구간 단가)는 청구서 **생성 시점에 스냅샷** — 나중에 표·단가를 바꿔도
 *   이미 만든(특히 이미 낸) 청구서 금액은 안 바뀐다. 금액 계산은 `invoiceAmount()` 하나.
 *
 * [결제] 기존 토스 결제 핵심 안전장치(api-pay.ts 머리말 4가지)를 그대로 재사용한다 —
 *   새 결제 파이프라인을 따로 만들지 않는다. `payment_orders` 에 주문을 만들고(금액은
 *   서버가 그 순간 재계산해 확정 — 클라이언트 값을 믿지 않음), 결제창은 **기존**
 *   `/api/pay/confirm` 을 그대로 부른다. 그 라우트가 이미 금액 대조·멱등·기록을 다 한다.
 *   구분은 `order_id` 접두사(`MGB-<invoice_id>-...`)로만 한다 — confirm 라우트의
 *   SELECT 컬럼 목록(3곳)을 하나도 안 건드리기 위해서다(스키마를 늘리면 그 세 곳을
 *   전부 찾아 고쳐야 하는데, 접두사만으로 충분하다). `activateEnrollment()`(api-pay.ts)
 *   가 이 접두사를 보면 개인 1건 활성화 대신 `activateB2bAiInvoicePayment()`(여기)를 부른다.
 *
 * [라우팅] `/api/admin/ai-billing/*` — `/api/admin/` 이라 인증은 자동(default-deny),
 *   `src/index.ts` 의 라우팅 허용목록(isAdminPath)·teacher 차단·isAgencyAllowedApi
 *   세 곳에 **반드시 함께** 등록한다(한 곳만 하면 CLAUDE.md 「새 API 추가」 함정 그대로).
 *   대리점(agency)·지사(branch) 스코프 계정도 자기 몫만 보게 **핸들러 안에서** 자른다
 *   (scope.ts 의 관례 그대로 — «열어 주는 것» 과 «자르는 것» 은 짝이다).
 */
import { json, parseJsonBody } from './api-util';
import { getScope, scopeStudentCond, type Scope } from './scope';
import { enrolledCond } from './exec-summary';
import { hiddenExcludeCond } from './student-override';   // 🙈 명부에서 숨긴 계정은 «청구 인원» 에서도 뺀다
import { sendPlainSms } from './solapi-client';
import { aiPrice, aiPriceNote, currentAiPriceRule, parseAiPriceRule, type AiPrice, type AiPriceRule } from './ai-billing-price';   // 💰 학원 공급가 정본(인원 구간·최소 20명분·지사 40%) — 2026-09-24

interface Env { DB: D1Database; [k: string]: any }

const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);
const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn(); } catch { return fallback; } };

/** @deprecated 2026-09-24 부터 기본값은 «인원 구간 단가»(ai-billing-price.ts) 다. 이 숫자는
 *  price_rule 스냅샷이 없는 옛 청구서(그 이전 생성분 — 운영 0건)를 읽을 때만 쓰인다. */
export const DEFAULT_AI_RATE_KRW = 10000;

let _ensured = false;
async function ensureSchema(env: Env): Promise<void> {
  if (_ensured) return;
  await safe(async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS agency_ai_rate (
      shop_name TEXT PRIMARY KEY,
      rate_krw INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT
    )`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_billing_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_name TEXT NOT NULL,
      franchise TEXT,
      billing_month TEXT NOT NULL,
      rate_krw INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      generated_at INTEGER NOT NULL,
      generated_by TEXT,
      paid_at INTEGER,
      order_id TEXT,
      UNIQUE(shop_name, billing_month)
    )`);
    await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_ai_billing_invoices_shop ON ai_billing_invoices(shop_name, billing_month)`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_billing_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      student_user_id TEXT NOT NULL,
      student_name TEXT,
      included INTEGER NOT NULL DEFAULT 1,
      added_manually INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(invoice_id, student_user_id)
    )`);
    await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_ai_billing_items_invoice ON ai_billing_invoice_items(invoice_id)`);
    // 🛎 월 자동 청구의 «마지막 실행 결과» — 로그는 5% 샘플링이라 실패가 안 남는다. 관리자 카드가 이것을 읽어 말한다.
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_billing_meta (k TEXT PRIMARY KEY, v TEXT, at INTEGER NOT NULL)`);
    // ✋ (2026-09-25) «A.i 단독 신청» 명단 — 청구 대상은 «추정» 이 아니라 여기 적힌 학생뿐이다(아래 loadAiOptIns).
    //    학원이 청구서 명세에서 체크하면 들어오고, 체크를 풀면 빠진다. 다음 달 청구서가 이 명단을 이어받는다.
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_billing_optin (
      uid_lc TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      shop_name TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT
    )`);
    return true;
  }, false);
  // 💰 (2026-09-24) 청구서마다 «생성 시점의 공급가 규칙» 을 JSON 으로 박아 둔다 — 나중에 표를
  //    바꿔도 이미 만든 청구서 금액은 안 바뀐다. 없는(NULL) 옛 청구서는 rate_krw × 인원 그대로.
  //    이미 있으면 "duplicate column" 으로 조용히 끝난다(멱등).
  try { await env.DB.prepare(`ALTER TABLE ai_billing_invoices ADD COLUMN price_rule TEXT`).run(); } catch (_) {}
  // 🎯 (2026-09-24 추천안 ① «자동 분류 + 학원 확인») 명세 줄마다
  //   track    = 마지막 자동 판정('live' 화상반 · 'ai' A.i반)
  //   user_set = 학원이 체크를 직접 바꿨는가(1 이면 «인원 다시 확인» 이 그 줄을 다시는 안 건드린다).
  try { await env.DB.prepare(`ALTER TABLE ai_billing_invoice_items ADD COLUMN track TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE ai_billing_invoice_items ADD COLUMN user_set INTEGER NOT NULL DEFAULT 0`).run(); } catch (_) {}
  _ensured = true;
}

// ── KST 월 계산 (org-settlement.ts currentMonth() 와 같은 방식) ──────────────
function currentMonthKST(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthAdd(period: string, n: number): string {
  const [y, m] = String(period).split('-').map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}
function isValidMonth(s: string): boolean { return /^\d{4}-\d{2}$/.test(s); }

/** 🔒 (2026-09-11 사장님 결정) 이 shop_name 에 «쓰기»(청구서 생성/보강·개별 포함·제외 토글·
 *  결제 주문 생성)를 할 수 있는가 — 본사와 그 대리점 본인 계정뿐이다. 지사는 못 한다
 *  (지사는 «보기» 만 — 그건 아래 shopAllowed() 가 맡는다. GET /invoice·/history 는
 *  이 함수를 쓰지 않는다).
 *  ⚠️ `getScope(env, request)` 가 돌려주는 (드릴다운 승격된) scope 로 판정하면 안 된다 —
 *  지사 계정이 `?as=agency:<산하 대리점>` 을 붙이면 agency 로 승격돼 이 판정을 통과해
 *  버린다(실제로 그랬다, 2026-09-11 발견). 그래서 반드시 `noDrillDown` 으로 «드릴다운
 *  전 원래 로그인 계정 스코프» 를 다시 물어 그걸로만 판정한다.
 *  ⚠️ 세 호출부(checkout·invoice/generate·invoice/item) 가 전부 이 함수 하나를 거치게
 *  한다 — 판정을 복제하면 한 곳만 고쳐지고 나머지가 조용히 예전 구멍으로 남는다.
 *  ⚠️ 조회 실패 시 폴백은 «막는 쪽»('none') 이다 — 결제 주문 생성처럼 되돌릴 수 없는
 *  조작의 가드는 모르면 막아야 한다(CLAUDE.md 「가드에 필요한 값을 safe(…, null) 로
 *  조회할 때」). getScope() 내부가 지금은 전부 s_safe() 로 감싸여 있어 이 폴백이 실제로는
 *  안 밟히는 죽은 경로지만, 나중에 던지게 되는 순간을 대비해 미리 잠가 둔다. */
async function writeAllowed(env: Env, request: Request, shopName: string): Promise<boolean> {
  const raw = await safe(async () => await getScope(env, request, { noDrillDown: true }),
    { type: 'none', value: null, label: '권한 없음' } as Scope);
  return raw.type === 'hq' || (raw.type === 'agency' && raw.value === shopName);
}

// ── 이 shop_name 을 이 스코프 계정이 «볼» 수 있는가 (agency=자기 자신, branch=자기 지사 소속, hq/franchise=허용) ──
//    ⚠️ 조회 전용이다 — 쓰기(생성·수정·결제)는 위 writeAllowed() 를 쓴다. 얘로 쓰기를 판정하면
//    지사가 산하 대리점 것을 고칠 수 있게 된다(2026-09-11 사장님이 막기로 한 바로 그것).
async function shopAllowed(env: Env, scope: Scope, shopName: string): Promise<boolean> {
  if (scope.type === 'hq' || scope.type === 'none') return true;
  if (scope.type === 'agency') return scope.value === shopName;
  if (scope.type === 'branch' || scope.type === 'franchise') {
    // franchise 문자열이 일치하는지 D1 에 직접 물어본다 — scopeStudentCond 는 학생 행 기준이라
    // «이 shop_name 이 내 산하인지» 단건 확인에는 그대로 재사용한다(별칭 없이 students_erp 1건 조회).
    const c = scopeStudentCond(scope, '');
    const row = await safe(async () => env.DB.prepare(
      `SELECT 1 AS ok FROM students_erp WHERE shop_name = ?${c.cond ? ' AND ' + c.cond : ''} LIMIT 1`
    ).bind(shopName, ...c.binds).first<{ ok: number }>(), null);
    return !!row;
  }
  return false;
}

/* ─────────────────────────────────────────────────────────────────────────
 * 🎥 화상반 학생은 청구에서 뺀다 (2026-09-24 사장님 결정 — «화상영어를 하면 A.i 는 포함»)
 *   A.i 사용료는 «A.i만 하는 학생» 에게만 받는다. 화상반 학생까지 넣으면 학원은 화상 수강료와
 *   A.i 사용료를 «같은 학생에 대해 두 번» 내게 된다(이중 청구).
 *   «화상반» 근거는 셋 중 하나라도 있으면이다(넓게 — 모르면 «청구 안 함» 쪽이 안전하다):
 *     ① 활성 예약(class_schedules, 자리표시 제외 — 정본 student-track.ts 와 같은 규칙.
 *        날짜로 좁히지 않는다: 좁히면 옛 active 행이 남은 화상반 학생이 A.i반으로 넘어가 청구된다)
 *     ② 카페24 예약 씨앗(attendance.room_id 'c24-%') 최근 30일 이후(미래 예약 포함)
 *        — 카페24 수업은 class_schedules 에 없어서 ①만 보면 화상반 대부분(실측 496명 중 약 350명)을 놓친다
 *     ③ 망고아이 수업방(attendance.room_id 'class-%') 계정(account_uid) 최근 30일
 *   📊 [잰 것 — 2026-09-24] 재원 7,413명 중 이 규칙의 화상반 496명 · 조회 295ms(인덱스 joined_at).
 *   ⚠️ 조회가 실패하면 null — 부르는 쪽은 «아무도 청구하지 않는다»(이중 청구보다 안 받는 편이 낫다).
 * ───────────────────────────────────────────────────────────────────────── */
export const LIVE_UIDS_SQL = `
  SELECT user_id AS uid FROM class_schedules
   WHERE status = 'active' AND user_id IS NOT NULL AND TRIM(user_id) <> ''
     AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')
  UNION
  SELECT user_id FROM attendance
   WHERE joined_at > ? AND room_id LIKE 'c24-%' AND user_id IS NOT NULL AND TRIM(user_id) <> ''
  UNION
  SELECT account_uid FROM attendance
   WHERE joined_at > ? AND room_id LIKE 'class-%' AND account_uid IS NOT NULL AND TRIM(account_uid) <> ''`;
export const LIVE_LOOKBACK_DAYS = 30;

export async function loadLiveUids(env: Env): Promise<Set<string> | null> {
  try {
    const since = Date.now() - LIVE_LOOKBACK_DAYS * 86400 * 1000;
    const r = await env.DB.prepare(LIVE_UIDS_SQL).bind(since, since).all<{ uid: string }>();
    const set = new Set<string>();
    // 대소문자는 무시한다 — 카페24 씨앗과 명부의 표기가 대소문자만 다르면 화상반을 놓쳐 이중 청구가 된다.
    // (대소문자만 다른 «다른» 계정까지 빠질 수 있지만 그쪽은 «덜 받는» 방향이라 안전하다.)
    for (const row of (r.results || [])) if (row && row.uid) set.add(String(row.uid).toLowerCase());
    return set;
  } catch (e: any) {
    console.warn('[ai-billing] live lookup failed — 아무도 청구하지 않음:', e && e.message);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * ✋ (2026-09-25 사장님 «추천한대로 진행해») 청구 대상은 «신청» 이다 — «추정» 이 아니다.
 *   2026-09-24 판은 «재원 − 화상반 = A.i반» 이라, 화상수업 기록이 30일 없는 학생(휴면·퇴원·카페24에만
 *   남은 학생)이 전부 청구 대상이 됐다(실측 재원 7,413명 중 약 7,300명 — 실제 A.i 단독 신청은 0명).
 *   돈을 받는 판정이 «아니라고 증명되지 않으면 청구» 였던 것을 뒤집는다:
 *     A.i반(청구) = 재원 ∩ A.i 단독 신청 명단(ai_billing_optin) − 화상반
 *     신청 안 함  = 재원 − 화상반 − 신청 명단            → 청구하지 않는다(track 'none')
 *   ⛔ «신청 안 함» 을 A.i반으로 되돌리지 마세요 — 그 순간 수백 개 학원에 가짜 청구서가 나갑니다.
 *   ⚠️ 명단을 못 읽으면 null — 부르는 쪽은 «아무도 청구하지 않는다»(화상반 조회 실패와 같은 방향).
 * ───────────────────────────────────────────────────────────────────────── */
export async function loadAiOptIns(env: Env): Promise<Set<string> | null> {
  try {
    await ensureSchema(env);
    const r = await env.DB.prepare(`SELECT uid_lc FROM ai_billing_optin`).all<{ uid_lc: string }>();
    const set = new Set<string>();
    for (const row of (r.results || [])) if (row && row.uid_lc) set.add(String(row.uid_lc).toLowerCase());
    return set;
  } catch (e: any) {
    console.warn('[ai-billing] opt-in lookup failed — 아무도 청구하지 않음:', e && e.message);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * 🔌 (2026-09-25) 자동 청구 스위치 — 기본 «꺼짐»(테스트 기간). ai_billing_meta 의 'auto_billing' 이
 *   정확히 'on' 일 때만 켜진다. 꺼져 있으면: 월 cron 이 청구서를 안 만들고, 청구서 만들기·결제가
 *   거절되고, 학원 화면은 «테스트 기간 — 청구하지 않습니다» 만 그린다. 켜고 끄는 것은 본사만.
 *   ⚠️ 못 읽으면 «꺼짐» — 모르면 청구하지 않는 쪽으로 실패한다.
 * ───────────────────────────────────────────────────────────────────────── */
export async function billingEnabled(env: Env): Promise<boolean> {
  try {
    await ensureSchema(env);
    const row = await env.DB.prepare(`SELECT v FROM ai_billing_meta WHERE k = 'auto_billing'`).first<{ v: string }>();
    return !!row && String(row.v) === 'on';
  } catch (_) { return false; }
}

/** 대리점(shop_name) 의 «지금» 명단을 셋으로 가른다(재원 = enrolledCond 정본):
 *    rows       A.i반(청구) = 신청 명단에 있고 화상반이 아님
 *    live_rows  화상반(A.i 포함 · 청구 안 함)
 *    idle_rows  신청 안 함(청구 안 함)
 *  ok=false 면 명단을 믿을 수 없다(조회 실패) — rows 는 비어 있고 부르는 쪽은 아무것도 더하지 않는다. */
async function currentRoster(env: Env, shopName: string, liveIn?: Set<string> | null, optInIn?: Set<string> | null):
    Promise<{ ok: boolean; rows: Array<{ user_id: string; name: string }>; live_excluded: number; live_rows?: Array<{ user_id: string; name: string }>; idle_rows?: Array<{ user_id: string; name: string }> }> {
  /* 🙈 명부에서 숨긴 계정은 «청구 인원» 에서도 뺀다 — 카페24가 정본이라 지워도 밤에 되살아나므로
     «읽을 때» 거르는 것이 이 저장소의 관례다(정본 student-override.ts). 안 거르면 중복 계정이
     그대로 COUNT 에 들어가 대리점이 실제보다 많은 인원으로 청구받는다(실측 전례: 한 사람의
     계정이 카페24에 15개). 표가 없으면 빈 문자열이 와서 아무것도 안 거른다(fail-open). */
  const live = liveIn === undefined ? await loadLiveUids(env) : liveIn;
  if (!live) return { ok: false, rows: [], live_excluded: 0 };
  const optIn = optInIn === undefined ? await loadAiOptIns(env) : optInIn;
  if (!optIn) return { ok: false, rows: [], live_excluded: 0 };
  const hideEx = await hiddenExcludeCond(env as any);
  let all: Array<{ user_id: string; name: string }>;
  try {
    all = (await env.DB.prepare(
      `SELECT user_id, COALESCE(NULLIF(TRIM(korean_name),''), NULLIF(TRIM(username),''), user_id) AS name
       FROM students_erp WHERE shop_name = ? AND ${enrolledCond('')}${hideEx ? ` AND ${hideEx}` : ''}`
    ).bind(shopName).all<{ user_id: string; name: string }>()).results || [];
  } catch { return { ok: false, rows: [], live_excluded: 0 }; }
  const lc = (r: { user_id: string }) => String(r.user_id).toLowerCase();
  const liveRows = all.filter(r => live.has(lc(r)));
  const rows = all.filter(r => !live.has(lc(r)) && optIn.has(lc(r)));
  const idleRows = all.filter(r => !live.has(lc(r)) && !optIn.has(lc(r)));
  return { ok: true, rows, live_excluded: liveRows.length, live_rows: liveRows, idle_rows: idleRows };
}

/**
 * 🎯 명세 줄의 «자동 분류» 다시 맞추기 — 순수 함수(D1 없음, 하니스가 실제로 돌린다).
 *   · 학원이 직접 바꾼 줄(user_set=1)은 절대 안 건드린다 — «학원 확인» 이 이긴다.
 *   · 나머지는 «상태를 지정» 한다(뒤집기가 아니다):
 *       화상반 → 'live' 제외(0) · A.i 단독 신청 → 'ai' 포함(1) · 그 밖 → 'none' 제외(0)
 *     (2026-09-25) «화상반이 아니면 포함» 이던 것을 «신청했을 때만 포함» 으로 바꿨다.
 *   · 명부에 없는 학생(퇴원 등)은 판정할 근거가 없으니 그대로 둔다.
 *   ⛔ live·optIn 을 모르면(null) 부르지 말 것 — 호출부가 막는다(모르면 아무도 안 옮긴다).
 */
export function planItemTrackSync(
  items: Array<{ id: number; student_user_id: string; included: number; user_set?: number; track?: string | null }>,
  live: Set<string>, roster: Set<string>, optIn: Set<string>,
): Array<{ id: number; included: number; track: string }> {
  const out: Array<{ id: number; included: number; track: string }> = [];
  for (const it of items) {
    const uid = String(it.student_user_id || '').toLowerCase();
    if (!roster.has(uid)) continue;
    const track = live.has(uid) ? 'live' : optIn.has(uid) ? 'ai' : 'none';
    if (Number(it.user_set) === 1) {
      if (it.track !== track) out.push({ id: it.id, included: Number(it.included) ? 1 : 0, track });
      continue;
    }
    const want = track === 'ai' ? 1 : 0;
    if (Number(it.included) !== want || it.track !== track) out.push({ id: it.id, included: want, track });
  }
  return out;
}

/** 학원별 예외 단가 — 없으면 null(= 인원 구간 단가). */
async function customRateFor(env: Env, shopName: string): Promise<number | null> {
  const r = await safe(async () => env.DB.prepare(
    `SELECT rate_krw FROM agency_ai_rate WHERE shop_name = ?`
  ).bind(shopName).first<{ rate_krw: number }>(), null);
  const n = Number(r?.rate_krw);
  return (r && Number.isFinite(n) && n > 0) ? Math.round(n) : null;
}

/** 청구서 한 장의 금액 — 정본 하나(화면·이력·결제가 전부 이것을 쓴다. 한 곳만 다르면 청구서와 결제가 갈린다).
 *  price_rule 이 있으면 그 규칙(인원 구간·최소 청구) + rate_krw>0 이면 예외 단가.
 *  없으면(옛 청구서) rate_krw × 인원 그대로 — 최소 청구도 없던 시절이라 소급하지 않는다. */
export function invoiceAmount(inv: { rate_krw: any; price_rule?: any }, includedCount: number): AiPrice {
  const rule: AiPriceRule | null = parseAiPriceRule(inv?.price_rule);
  const stored = Number(inv?.rate_krw);
  if (rule) return aiPrice(includedCount, stored > 0 ? stored : null, rule);
  const legacyRate = stored > 0 ? stored : DEFAULT_AI_RATE_KRW;
  return aiPrice(includedCount, legacyRate, { tiers: [{ min: 1, rate: legacyRate }], min: 0, pct: currentAiPriceRule().pct });
}

/** 응답에 싣는 금액 칸 — 화면은 이 글자·숫자를 그대로 그린다(규칙을 화면에 복제하지 않는다). */
function priceFields(pr: AiPrice) {
  const note = aiPriceNote(pr);
  return {
    applied_rate_krw: pr.rate, billable_count: pr.billable, price_basis: pr.basis, tier_label: pr.tier_label,
    min_applied: pr.min_applied, floor_applied: pr.floor_applied,
    branch_commission_krw: pr.branch_commission, hq_share_krw: pr.hq_share, commission_pct: pr.commission_pct,
    price_note_ko: note.ko, price_note_en: note.en,
  };
}

/**
 * 청구서 생성/보강 — **멱등, 덮어쓰지 않고 더하기만** 한다.
 *   이미 있는 (shop_name, billing_month) 청구서면 «지금 재원인데 아직 명세에 없는 학생» 만
 *   added_manually=1 로 추가한다(사람이 뺀 학생은 손대지 않는다 — 그게 핵심이다).
 *   없으면 새로 만들고 그 순간의 단가를 스냅샷한다.
 */
async function generateOrRefreshInvoice(env: Env, shopName: string, billingMonth: string, actor: string, liveIn?: Set<string> | null, optInIn?: Set<string> | null, skipIfNoOptIn = false):
    Promise<{ invoice_id: number; added: number; created: boolean; live_check_failed?: boolean; skipped?: boolean; live_listed?: number; idle_listed?: number; auto_excluded?: number; auto_included?: number }> {
  await ensureSchema(env);
  // 화상반 목록·신청 명단을 «청구서를 만들기 전에» 읽는다 — 실패하면 빈 청구서 머리도 안 남긴다.
  const live = liveIn === undefined ? await loadLiveUids(env) : liveIn;
  if (!live) return { invoice_id: 0, added: 0, created: false, live_check_failed: true };
  const optIn = optInIn === undefined ? await loadAiOptIns(env) : optInIn;
  if (!optIn) return { invoice_id: 0, added: 0, created: false, live_check_failed: true };
  const existing = await env.DB.prepare(
    `SELECT id, status FROM ai_billing_invoices WHERE shop_name = ? AND billing_month = ?`
  ).bind(shopName, billingMonth).first<{ id: number; status: string }>();

  // 월 cron(skipIfNoOptIn)은 A.i 단독 신청이 한 명도 없는 학원에 «빈 청구서» 를 만들지 않는다.
  //   (학원이 직접 「청구서 만들기」를 누르면 만든다 — 명세에서 A.i 단독 학생을 체크해 신청하는 자리다.)
  if (!existing && skipIfNoOptIn) {
    const pre = await currentRoster(env, shopName, live, optIn);
    if (!pre.ok) return { invoice_id: 0, added: 0, created: false, live_check_failed: true };
    if (!pre.rows.length) return { invoice_id: 0, added: 0, created: false, skipped: true };
  }
  let invoiceId: number;
  let created = false;
  if (existing) {
    invoiceId = existing.id;
  } else {
    const rate = (await customRateFor(env, shopName)) || 0;   // 0 = 인원 구간 단가(price_rule)
    const franchise = await safe(async () => env.DB.prepare(
      `SELECT franchise FROM students_erp WHERE shop_name = ? AND franchise IS NOT NULL AND TRIM(franchise)<>'' LIMIT 1`
    ).bind(shopName).first<{ franchise: string }>(), null);
    const now = Date.now();
    const ins = await env.DB.prepare(
      `INSERT INTO ai_billing_invoices (shop_name, franchise, billing_month, rate_krw, status, generated_at, generated_by, price_rule)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`
    ).bind(shopName, franchise?.franchise || null, billingMonth, rate, now, actor, JSON.stringify(currentAiPriceRule())).run();
    invoiceId = Number(ins.meta.last_row_id);
    created = true;
  }

  // 이미 draft 인 청구서에만 자동으로 더한다 — paid 된 청구서는 명세가 고정이어야 한다(회계 기록).
  const inv = await env.DB.prepare(`SELECT status FROM ai_billing_invoices WHERE id = ?`).bind(invoiceId).first<{ status: string }>();
  if (inv?.status !== 'draft') return { invoice_id: invoiceId, added: 0, created };

  const rosterR = await currentRoster(env, shopName, live, optIn);
  if (!rosterR.ok) return { invoice_id: invoiceId, added: 0, created, live_check_failed: true };
  const roster = rosterR.rows;
  const now = Date.now();
  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO ai_billing_invoice_items (invoice_id, student_user_id, student_name, included, added_manually, created_at)
     VALUES (?, ?, ?, 1, ?, ?)`
  );
  const manualFlag = created ? 0 : 1;   // 처음 생성 때 딸려 들어온 인원은 «자동 생성분», 그 뒤 새로 붙은 인원만 «수동 추가분» 표시
  const batch = roster.map((s) => stmt.bind(invoiceId, s.user_id, s.name, manualFlag, now));
  let added = 0;
  for (let i = 0; i < batch.length; i += 80) {
    const results = await env.DB.batch(batch.slice(i, i + 80));
    for (const r of results as any[]) added += Number(r?.meta?.changes || 0);
  }
  const sync = await syncItemTracks(env, invoiceId, rosterR.live_rows || [], roster, live, manualFlag, now, rosterR.idle_rows || []);
  return { invoice_id: invoiceId, added, created, ...sync };
}

/**
 * 🎯 추천안 ① «자동 분류 + 학원 확인» — 화상반 학원생도 명세에 «체크 해제된 줄(track='live')» 로 보이게 하고,
 *   학원이 손대지 않은 줄은 지금 판정대로 다시 맞춘다(planItemTrackSync). 판정이 틀렸으면 학원이 체크해서
 *   포함시키고(user_set=1), 그 뒤로는 자동이 그 줄을 안 건드린다.
 *   실패는 삼키고 «옛 동작»(A.i반만 명세에 있음)으로 남는다 — 청구 인원을 늘리는 쪽으로는 절대 실패하지 않는다.
 */
async function syncItemTracks(env: Env, invoiceId: number, liveRows: Array<{ user_id: string; name: string }>,
    aiRows: Array<{ user_id: string; name: string }>, live: Set<string>, manualFlag: number, now: number,
    idleRows: Array<{ user_id: string; name: string }> = []):
    Promise<{ live_listed: number; idle_listed: number; auto_excluded: number; auto_included: number }> {
  const res = { live_listed: 0, idle_listed: 0, auto_excluded: 0, auto_included: 0 };
  try {
    // 화상반('live')과 신청 안 함('none') 학원생도 «체크 해제된 줄» 로 명세에 보인다 —
    // 학원이 A.i 단독 학생을 체크하면 그 순간 신청 명단에 들어간다(invoice/item).
    for (const [rowsX, trackX] of [[liveRows, 'live'], [idleRows, 'none']] as Array<[Array<{ user_id: string; name: string }>, string]>) {
      if (!rowsX.length) continue;
      const st = env.DB.prepare(
        `INSERT OR IGNORE INTO ai_billing_invoice_items (invoice_id, student_user_id, student_name, included, added_manually, created_at, track)
         VALUES (?, ?, ?, 0, ?, ?, ?)`);
      const b = rowsX.map((s) => st.bind(invoiceId, s.user_id, s.name, manualFlag, now, trackX));
      for (let i = 0; i < b.length; i += 80) {
        const rr = await env.DB.batch(b.slice(i, i + 80));
        for (const r of rr as any[]) {
          const n = Number(r?.meta?.changes || 0);
          if (trackX === 'live') res.live_listed += n; else res.idle_listed += n;
        }
      }
    }
    const items = (await env.DB.prepare(
      `SELECT id, student_user_id, included, user_set, track FROM ai_billing_invoice_items WHERE invoice_id = ?`
    ).bind(invoiceId).all<any>()).results || [];
    const rosterSet = new Set<string>([...aiRows, ...liveRows, ...idleRows].map(r => String(r.user_id).toLowerCase()));
    const optSet = new Set<string>(aiRows.map(r => String(r.user_id).toLowerCase()));   // aiRows = 신청 명단 ∩ 재원 − 화상반
    const plan = planItemTrackSync(items, live, rosterSet, optSet);
    const before = new Map<number, number>(items.map((it: any) => [Number(it.id), Number(it.included) ? 1 : 0]));
    const up = env.DB.prepare(`UPDATE ai_billing_invoice_items SET included = ?, track = ? WHERE id = ? AND invoice_id = ? AND COALESCE(user_set,0) = 0`);
    const upTrack = env.DB.prepare(`UPDATE ai_billing_invoice_items SET track = ? WHERE id = ? AND invoice_id = ?`);
    const stmts = plan.map((x) => {
      const was = before.get(x.id);
      if (was === 1 && x.included === 0) res.auto_excluded++;
      if (was === 0 && x.included === 1) res.auto_included++;
      const it: any = items.find((i: any) => Number(i.id) === x.id);
      return Number(it?.user_set) === 1 ? upTrack.bind(x.track, x.id, invoiceId) : up.bind(x.included, x.track, x.id, invoiceId);
    });
    for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  } catch (e) {
    console.warn('[ai-billing] track sync skipped:', String((e as any)?.message || e));
  }
  return res;
}

/** 매달 1일 KST cron 훅 — 모든 대리점의 «다음 달» 청구서를 생성/보강한다. */
export async function generateMonthlyAiInvoices(env: Env): Promise<{ agencies: number; invoices: number; added: number; status?: string }> {
  await ensureSchema(env);
  const target = monthAdd(currentMonthKST(), 1);
  // 🔌 (2026-09-25) 자동 청구가 꺼져 있으면(기본 — 테스트 기간) 아무 청구서도 만들지 않는다.
  //    ⛔ 이 검사를 대리점 목록 «뒤» 로 옮기지 마세요 — 꺼져 있을 때는 명부조차 읽을 이유가 없습니다.
  if (!(await billingEnabled(env))) {
    const out = { agencies: 0, invoices: 0, added: 0, status: 'disabled' };
    await recordCronRun(env, target, out);
    return out;
  }
  // 대리점 목록을 «못 읽음» 과 «0곳» 으로 가른다 — 둘 다 [] 로 뭉치면 실패가 «할 일 없음» 으로 위장한다.
  const shops = await safe(async () => (await env.DB.prepare(
    `SELECT DISTINCT shop_name FROM students_erp WHERE shop_name IS NOT NULL AND TRIM(shop_name) <> '' AND ${enrolledCond('')}`
  ).all<{ shop_name: string }>()).results || [], null as any[] | null);
  if (!shops) {
    const out = { agencies: 0, invoices: 0, added: 0, status: 'shops_failed' };
    await recordCronRun(env, target, out);
    return out;
  }
  let invoices = 0, added = 0, failed = 0, skipped = 0;
  // 화상반 목록은 «한 번만» 읽는다 — 대리점마다 읽으면 376곳 × 약 0.3초.
  // 못 읽으면 이번 달은 아무 청구서도 만들지 않는다(이중 청구 방지 — 다음 실행/수동 생성이 채운다).
  const live = await loadLiveUids(env);
  const optIn = live ? await loadAiOptIns(env) : null;   // 신청 명단도 «한 번만» — 못 읽으면 화상반 실패와 똑같이 0장
  if (!live || !optIn) {
    const out = { agencies: shops.length, invoices: 0, added: 0, status: 'live_check_failed' };
    await recordCronRun(env, target, out);
    return out;
  }
  for (const s of shops) {
    const r = await safe(() => generateOrRefreshInvoice(env, s.shop_name, target, 'auto', live, optIn, true), null);
    if (r && r.skipped) skipped++;
    else if (r && !r.live_check_failed) { invoices++; added += r.added; } else failed++;
  }
  const out = { agencies: shops.length, invoices, added, failed, skipped, status: failed ? 'partial' : 'ok' };
  await recordCronRun(env, target, out);
  return out;
}

/** 월 자동 청구의 마지막 결과를 남긴다 — ⛔ 던지지 않는다(감시가 감시 대상을 멈추면 안 된다). */
async function recordCronRun(env: Env, month: string, r: Record<string, any>): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO ai_billing_meta (k, v, at) VALUES ('last_monthly_run', ?, ?)
       ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at`
    ).bind(JSON.stringify({ month, ...r }), Date.now()).run();
  } catch (e) { console.warn('[ai-billing] recordCronRun failed:', String((e as any)?.message || e)); }
}

/** 관리자 카드용 — 없거나 못 읽으면 null(«아직 한 번도 안 돌았다» 와 «모른다» 는 화면이 같은 «—» 로 말한다). */
async function readCronRun(env: Env): Promise<Record<string, any> | null> {
  return safe(async () => {
    const row = await env.DB.prepare(`SELECT v, at FROM ai_billing_meta WHERE k = 'last_monthly_run'`).first<{ v: string; at: number }>();
    if (!row) return null;
    const v = JSON.parse(String(row.v || '{}'));
    return (v && typeof v === 'object') ? { ...v, at: Number(row.at) || 0 } : null;
  }, null);
}

/** api-pay.ts 의 activateEnrollment() 가 MGB- 주문을 보면 이걸 부른다 — 결제 확정 뒤 1회. */
export async function activateB2bAiInvoicePayment(env: Env, orderId: string, amount: number, when: number): Promise<void> {
  await ensureSchema(env);
  const m = /^MGB-(\d+)-/.exec(orderId);
  if (!m) return;
  const invoiceId = Number(m[1]);
  const inv = await safe(async () => env.DB.prepare(
    `SELECT id, shop_name, billing_month, status FROM ai_billing_invoices WHERE id = ?`
  ).bind(invoiceId).first<{ id: number; shop_name: string; billing_month: string; status: string }>(), null);
  if (!inv || inv.status === 'paid') return;   // 멱등 — confirm·webhook 경합해도 두 번 활성화하지 않는다

  await env.DB.prepare(
    `UPDATE ai_billing_invoices SET status='paid', paid_at=?, order_id=? WHERE id = ? AND status <> 'paid'`
  ).bind(when, orderId, invoiceId).run();

  const items = await safe(async () => (await env.DB.prepare(
    `SELECT student_user_id, student_name FROM ai_billing_invoice_items WHERE invoice_id = ? AND included = 1`
  ).bind(invoiceId).all<{ student_user_id: string; student_name: string }>()).results || [], [] as any[]);

  await safe(async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
    return true;
  }, false);
  const note = `토스 결제 자동활성화(B2B) · ${orderId} · ${inv.shop_name} ${inv.billing_month}`;
  const perStudent = items.length ? Math.round(amount / items.length) : 0;
  const stmt = env.DB.prepare(
    `INSERT INTO enrollments (student_user_id, student_name, package, started_at, ended_at, monthly_fee_krw, status, notes, created_at, updated_at)
     VALUES (?, ?, 'AI 콘텐츠 전용 (대리점 일괄)', ?, NULL, ?, 'active', ?, ?, ?)`
  );
  const batch = items.map((it) => stmt.bind(it.student_user_id, it.student_name || it.student_user_id, when, perStudent, note, when, when));
  for (let i = 0; i < batch.length; i += 80) await env.DB.batch(batch.slice(i, i + 80));

  // 🔔 본사 문자 — 기본 음소거 정책 그대로(kind 를 안 밝히므로 owner_alert_mute='off' 가 아니면 조용히 막힌다).
  //   CLAUDE.md 1-3 「운영자 문자 전부」— 예외 목록에 넣지 않는다. 켜져 있으면만 나간다.
  await safe(async () => {
    const to = (env as any).OWNER_ALERT_PHONE;
    if (to) await sendPlainSms(env as any, to,
      `[망고아이] 💰 B2B AI 사용료 결제완료\n${inv.shop_name} · ${inv.billing_month}\n${items.length}명 · ${amount.toLocaleString('ko-KR')}원`);
    return true;
  }, false);
}

export async function aiBillingRouter(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/ai-billing\/?/, '');
  const method = request.method.toUpperCase();
  await ensureSchema(env);
  const scope = await safe(async () => await getScope(env, request), { type: 'none', value: null, label: '권한 없음' } as Scope);

  // ── GET /rate?q= : 대리점별 A.i반 인원·적용 단가·예상 청구액 (스코프별로 scopeStudentCond 가 걸러 준다) ──
  if (p === 'rate' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const sc = scopeStudentCond(scope, 's');
    const where = ["s.shop_name IS NOT NULL", "TRIM(s.shop_name) <> ''"];
    const binds: any[] = [];
    if (sc.cond) { where.push(sc.cond); binds.push(...sc.binds); }
    // 🙈 숨긴 계정 제외 — currentRoster() 와 «같은 인원» 을 세야 화면 미리보기와 청구서가 안 갈린다
    const hideExRate = await hiddenExcludeCond(env as any, 's');
    if (hideExRate) where.push(hideExRate);
    const live = await loadLiveUids(env);
    if (!live) return err('live_check_failed: 화상반 학생을 확인하지 못해 청구 인원을 셀 수 없습니다', 503);
    const optIn = await loadAiOptIns(env);
    if (!optIn) return err('optin_check_failed: A.i 단독 신청 명단을 읽지 못해 청구 인원을 셀 수 없습니다', 503);
    const stu = await safe(async () => (await env.DB.prepare(`
      SELECT s.shop_name AS shop_name, s.franchise AS franchise, s.user_id AS user_id
      FROM students_erp s
      WHERE ${where.join(' AND ')} AND ${enrolledCond('s')}
    `).bind(...binds).all<any>()).results || [], null as any);
    if (!stu) return err('lookup failed', 500);
    const rates = await safe(async () => (await env.DB.prepare(`SELECT shop_name, rate_krw FROM agency_ai_rate`).all<any>()).results || [], [] as any[]);
    const rateMap = new Map<string, number>();
    for (const r of rates) { const n = Number(r.rate_krw); if (Number.isFinite(n) && n > 0) rateMap.set(String(r.shop_name), Math.round(n)); }
    // 세 무리로 가른다 — 화상반(무료) · A.i 단독 신청(청구) · 신청 안 함(청구 안 함). currentRoster() 와 같은 판정.
    const agg = new Map<string, { franchise: string | null; enrolled: number; live: number; ai: number }>();
    for (const r of stu) {
      const k = String(r.shop_name);
      const g = agg.get(k) || { franchise: null, enrolled: 0, live: 0, ai: 0 };
      if (!g.franchise && r.franchise) g.franchise = r.franchise;
      const u = String(r.user_id).toLowerCase();
      g.enrolled++;
      if (live.has(u)) g.live++; else if (optIn.has(u)) g.ai++;
      agg.set(k, g);
    }
    const rule = currentAiPriceRule();
    let list = [...agg.entries()].map(([shop, g]) => {
      const aiCount = g.ai;   // ⛔ «재원 − 화상반» 으로 되돌리지 말 것 — 신청하지 않은 학생까지 청구된다
      const custom = rateMap.get(shop) ?? null;
      const pr = aiPrice(aiCount, custom, rule);
      return {
        shop_name: shop, franchise: g.franchise,
        enrolled_count: g.enrolled, live_count: g.live, ai_count: aiCount, idle_count: g.enrolled - g.live - aiCount,
        rate_krw: pr.rate, is_custom_rate: custom != null, custom_rate_krw: custom,
        estimated_total_krw: pr.total, ...priceFields(pr),
      };
    }).sort((x, y) => y.ai_count - x.ai_count || y.enrolled_count - x.enrolled_count);
    if (q) list = list.filter(r => r.shop_name.toLowerCase().includes(q) || String(r.franchise || '').toLowerCase().includes(q));
    const totals = list.reduce((a, r) => { a.enrolled += r.enrolled_count; a.live += r.live_count; a.ai += r.ai_count; a.idle += r.idle_count; a.est += r.estimated_total_krw; return a; },
      { enrolled: 0, live: 0, ai: 0, idle: 0, est: 0 });
    return json({
      ok: true, scope: scope.label, editable: scope.type === 'hq',
      billing_enabled: await billingEnabled(env), totals,
      price_rule: rule, last_cron: await readCronRun(env),
      count: list.length, rows: list.slice(0, 500), truncated: list.length > 500,
    });
  }

  // ── POST /switch {on: boolean} : 자동 청구 켜기/끄기 (본사만 · 2026-09-25) ──
  //    켜면: 월 cron 이 «A.i 단독 신청 학생이 있는 학원» 에만 청구서를 만들고, 학원 화면에 청구서가 보인다.
  //    끄면: 청구서 생성·결제가 멈춘다(이미 만든 청구서는 지우지 않는다).
  if (p === 'switch' && method === 'POST') {
    const raw = await safe(async () => await getScope(env, request, { noDrillDown: true }), { type: 'none', value: null, label: '권한 없음' } as Scope);
    if (raw.type !== 'hq') return err('forbidden: HQ only', 403);
    const b = await parseJsonBody(request) || {};
    const on = b?.on === true;
    const okSw = await safe(async () => {
      await env.DB.prepare(
        `INSERT INTO ai_billing_meta (k, v, at) VALUES ('auto_billing', ?, ?)
         ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at`
      ).bind(on ? 'on' : 'off', Date.now()).run();
      return true;
    }, false);
    if (!okSw) return err('save failed', 500);
    return json({ ok: true, billing_enabled: await billingEnabled(env) });
  }

  // ── POST /rate {shop_name, rate_krw} : 대리점 단가 설정 (본사만) ──
  if (p === 'rate' && method === 'POST') {
    if (scope.type !== 'hq') return err('forbidden: HQ only', 403);
    const b = await parseJsonBody(request);
    const shopName = String(b?.shop_name || '').trim();
    // 빈 값·0 = «예외 단가 없음»(인원 구간 단가로 돌아감) — 행을 지운다.
    const rawRate = b?.rate_krw;
    const clear = rawRate == null || rawRate === '' || Number(rawRate) === 0;
    const rate = clear ? 0 : Math.round(Number(rawRate));
    if (!shopName) return err('shop_name required');
    if (!clear && (!Number.isFinite(rate) || rate < 0 || rate > 1_000_000)) return err('rate_krw 는 0~1,000,000 사이여야 합니다');
    const who = scope.label || 'hq';
    if (clear) {
      const okDel = await safe(async () => { await env.DB.prepare(`DELETE FROM agency_ai_rate WHERE shop_name = ?`).bind(shopName).run(); return true; }, false);
      if (!okDel) return err('save failed', 500);
      return json({ ok: true, shop_name: shopName, rate_krw: null, cleared: true });
    }
    const okUp = await safe(async () => {
      await env.DB.prepare(`
        INSERT INTO agency_ai_rate (shop_name, rate_krw, updated_at, updated_by) VALUES (?,?,?,?)
        ON CONFLICT(shop_name) DO UPDATE SET rate_krw=excluded.rate_krw, updated_at=excluded.updated_at, updated_by=excluded.updated_by
      `).bind(shopName, rate, Date.now(), who).run();
      return true;
    }, false);
    if (!okUp) return err('save failed', 500);
    return json({ ok: true, shop_name: shopName, rate_krw: rate });
  }

  // ── GET /invoice?shop_name=&month=YYYY-MM : 청구서 + 명세 ──
  if (p === 'invoice' && method === 'GET') {
    let shopName = String(url.searchParams.get('shop_name') || '').trim();
    if (scope.type === 'agency') shopName = scope.value || '';   // 대리점 계정은 자기 것만 — 파라미터 무시
    if (!shopName) return err('shop_name required');
    if (!(await shopAllowed(env, scope, shopName))) return err('forbidden', 403);
    const month = String(url.searchParams.get('month') || monthAdd(currentMonthKST(), 1));
    if (!isValidMonth(month)) return err('month 는 YYYY-MM 형식이어야 합니다');
    // 🔌 자동 청구가 꺼져 있으면(테스트 기간) 청구서도 미리보기도 보여 주지 않는다 — 학원 화면은 안내만 그린다.
    const enabled = await billingEnabled(env);
    if (!enabled) return json({ ok: true, billing_enabled: false, exists: false, shop_name: shopName, billing_month: month });

    const inv = await env.DB.prepare(
      `SELECT id, shop_name, franchise, billing_month, rate_krw, price_rule, status, generated_at, paid_at, order_id
       FROM ai_billing_invoices WHERE shop_name = ? AND billing_month = ?`
    ).bind(shopName, month).first<any>();
    if (!inv) {
      // 아직 생성 전 — 지금 재원 기준으로 «미리보기» 만 보여준다(저장하지 않음).
      const roster = await currentRoster(env, shopName);
      if (!roster.ok) return err('live_check_failed: 화상반 학생을 확인하지 못해 미리보기를 만들 수 없습니다', 503);
      const pr = aiPrice(roster.rows.length, await customRateFor(env, shopName));
      return json({
        ok: true, billing_enabled: true, exists: false, shop_name: shopName, billing_month: month,
        rate_krw: pr.rate, preview_count: roster.rows.length, preview_total: pr.total,
        live_excluded: roster.live_excluded, idle_count: (roster.idle_rows || []).length, ...priceFields(pr),
      });
    }
    // track·user_set 칸이 없는 DB(ALTER 실패)면 옛 SELECT 로 떨어진다 — 명세가 통째로 비면 안 된다.
    const items = await safe(async () => (await env.DB.prepare(
      `SELECT id, student_user_id, student_name, included, added_manually, track, COALESCE(user_set,0) AS user_set FROM ai_billing_invoice_items WHERE invoice_id = ? ORDER BY student_name`
    ).bind(inv.id).all<any>()).results || [], null as any) ?? await safe(async () => (await env.DB.prepare(
      `SELECT id, student_user_id, student_name, included, added_manually FROM ai_billing_invoice_items WHERE invoice_id = ? ORDER BY student_name`
    ).bind(inv.id).all<any>()).results || [], [] as any[]);
    const includedCount = items.filter((i: any) => i.included).length;
    const pr = invoiceAmount(inv, includedCount);
    const { price_rule: _pr, ...invOut } = inv;
    return json({
      ok: true, billing_enabled: true, exists: true, invoice: {
        ...invOut, item_count: items.length, included_count: includedCount,
        rate_krw: pr.rate, total_krw: pr.total, ...priceFields(pr),
      },
      items,
    });
  }

  // ── POST /invoice/generate {shop_name, month?} : 생성/보강(추가만, 덮어쓰지 않음) ──
  if (p === 'invoice/generate' && method === 'POST') {
    const b = await parseJsonBody(request) || {};
    let shopName = String(b?.shop_name || '').trim();
    if (scope.type === 'agency') shopName = scope.value || '';
    if (!shopName) return err('shop_name required');
    if (!(await writeAllowed(env, request, shopName))) return err('forbidden', 403);
    if (!(await billingEnabled(env))) return err('billing_disabled: 테스트 기간이라 A.i 사용료를 청구하지 않습니다', 409);
    const month = String(b?.month || monthAdd(currentMonthKST(), 1));
    if (!isValidMonth(month)) return err('month 는 YYYY-MM 형식이어야 합니다');
    const r = await generateOrRefreshInvoice(env, shopName, month, scope.label || 'admin');
    if (r.live_check_failed) return json({ ok: false, error: 'live_check_failed', ...r }, 503);
    return json({ ok: true, ...r });
  }

  // ── POST /invoice/item {invoice_id, student_user_id, included: 0|1} : 개별 포함/제외 ──
  if (p === 'invoice/item' && method === 'POST') {
    const b = await parseJsonBody(request) || {};
    const invoiceId = Number(b?.invoice_id);
    const studentUid = String(b?.student_user_id || '').trim();
    const included = b?.included ? 1 : 0;
    if (!invoiceId || !studentUid) return err('invoice_id, student_user_id required');
    const inv = await env.DB.prepare(`SELECT id, shop_name, status FROM ai_billing_invoices WHERE id = ?`).bind(invoiceId).first<any>();
    if (!inv) return err('invoice not found', 404);
    if (!(await writeAllowed(env, request, inv.shop_name))) return err('forbidden', 403);
    if (inv.status !== 'draft') return err('결제 완료된 청구서는 명세를 바꿀 수 없습니다', 409);
    // user_set=1 — «학원 확인» 표시. 이 줄은 이제 «인원 다시 확인» 의 자동 분류가 다시 안 건드린다.
    try {
      // 화상반 줄('live')은 표시를 그대로 두고, 나머지는 체크가 곧 신청이므로 'ai'/'none' 으로 맞춘다.
      await env.DB.prepare(`UPDATE ai_billing_invoice_items SET included = ?, user_set = 1,
          track = CASE WHEN track = 'live' THEN track WHEN ? = 1 THEN 'ai' ELSE 'none' END
        WHERE invoice_id = ? AND student_user_id = ?`)
        .bind(included, included, invoiceId, studentUid).run();
    } catch (_) {
      await env.DB.prepare(`UPDATE ai_billing_invoice_items SET included = ? WHERE invoice_id = ? AND student_user_id = ?`)
        .bind(included, invoiceId, studentUid).run();
    }
    // ✋ 학원의 체크가 곧 «A.i 단독 신청» 이다 — 다음 달 청구서가 이 명단을 이어받는다.
    //    명단 쓰기가 실패하면 이번 청구서 체크는 그대로 두되 화면이 알 수 있게 알린다(조용히 넘기지 않는다).
    const optinSaved = await safe(async () => {
      if (included) {
        await env.DB.prepare(
          `INSERT INTO ai_billing_optin (uid_lc, user_id, shop_name, created_at, created_by) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(uid_lc) DO UPDATE SET user_id = excluded.user_id, shop_name = excluded.shop_name`
        ).bind(studentUid.toLowerCase(), studentUid, inv.shop_name, Date.now(), scope.label || 'admin').run();
      } else {
        await env.DB.prepare(`DELETE FROM ai_billing_optin WHERE uid_lc = ?`).bind(studentUid.toLowerCase()).run();
      }
      return true;
    }, false);
    return json({ ok: true, invoice_id: invoiceId, student_user_id: studentUid, included: !!included, optin_saved: optinSaved });
  }

  // ── GET /history?shop_name=&limit= : 지난 청구서 목록 ──
  if (p === 'history' && method === 'GET') {
    let shopName = String(url.searchParams.get('shop_name') || '').trim();
    if (scope.type === 'agency') shopName = scope.value || '';
    if (!shopName) return err('shop_name required');
    if (!(await shopAllowed(env, scope, shopName))) return err('forbidden', 403);
    const limit = Math.max(1, Math.min(60, Number(url.searchParams.get('limit')) || 24));
    const rows = await safe(async () => (await env.DB.prepare(`
      SELECT i.id, i.billing_month, i.rate_krw, i.price_rule, i.status, i.generated_at, i.paid_at,
             (SELECT COUNT(*) FROM ai_billing_invoice_items x WHERE x.invoice_id = i.id AND x.included = 1) AS included_count
      FROM ai_billing_invoices i WHERE i.shop_name = ? ORDER BY i.billing_month DESC LIMIT ?
    `).bind(shopName, limit).all<any>()).results || [], [] as any[]);
    return json({ ok: true, shop_name: shopName, rows: rows.map((r: any) => {
      const pr = invoiceAmount(r, Number(r.included_count) || 0);
      const { price_rule: _x, ...rest } = r;
      return { ...rest, rate_krw: pr.rate, total_krw: pr.total, billable_count: pr.billable, branch_commission_krw: pr.branch_commission };
    }) });
  }

  // ── POST /invoice/checkout {invoice_id} : 토스 결제 주문 생성 ──
  if (p === 'invoice/checkout' && method === 'POST') {
    const b = await parseJsonBody(request) || {};
    const invoiceId = Number(b?.invoice_id);
    if (!invoiceId) return err('invoice_id required');
    const inv = await env.DB.prepare(
      `SELECT id, shop_name, billing_month, rate_krw, price_rule, status FROM ai_billing_invoices WHERE id = ?`
    ).bind(invoiceId).first<any>();
    if (!inv) return err('invoice not found', 404);
    // 🔒 (2026-09-11 사장님 결정) 결제 주문 생성 — writeAllowed() 하나로 판정한다(위 정의부 참고).
    if (!(await writeAllowed(env, request, inv.shop_name))) return err('forbidden', 403);
    if (!(await billingEnabled(env))) return err('billing_disabled: 테스트 기간이라 A.i 사용료를 청구하지 않습니다', 409);
    if (inv.status === 'paid') return err('이미 결제된 청구서입니다', 409);
    const includedCount = await safe(async () => {
      const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ai_billing_invoice_items WHERE invoice_id = ? AND included = 1`).bind(invoiceId).first<{ n: number }>();
      return Number(r?.n || 0);
    }, 0);
    if (includedCount <= 0) return err('청구할 인원이 없습니다 — 먼저 명세를 확인해 주세요');
    const amount = invoiceAmount(inv, includedCount).total;   // 정본 — 화면에 보인 청구서 금액과 같은 식
    if (!(amount > 0)) return err('결제 금액이 0원입니다');

    /* payment_orders 는 api-pay.ts 가 정본이다(공유 결제 코어). 여기서는 새로 만들지 않고
       «컬럼이 없으면 추가」만 한다 — api-pay.ts 의 ensurePayTable()·enroll-ops.ts 의
       ensureEnrollTables() 가 같은 표에 독립적으로 컬럼을 보태는 것과 같은 방식이다.
       ⚠️ api-pay.ts 를 import 하지 않는다 — activateB2bAiInvoicePayment() 를 그쪽이 다시
       import 해야 해서 순환 참조가 생긴다(이 파일 → api-pay.ts → 이 파일). */
    await safe(async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS payment_orders (
         order_id TEXT PRIMARY KEY, uid TEXT, program TEXT, amount INTEGER NOT NULL,
         status TEXT NOT NULL DEFAULT 'pending', payment_key TEXT, method TEXT,
         payer_name TEXT, student_name TEXT, created_at INTEGER NOT NULL, paid_at INTEGER,
         fail_reason TEXT, raw TEXT)`);
      return true;
    }, false);
    // 이미 있는 표라면 이 ALTER 들은 전부 "이미 있음" 오류로 조용히 끝난다(멱등).
    for (const ddl of [
      `ALTER TABLE payment_orders ADD COLUMN phone TEXT`,
      `ALTER TABLE payment_orders ADD COLUMN enroll_json TEXT`,
    ]) { try { await env.DB.prepare(ddl).run(); } catch (_) {} }
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b2 => b2.toString(16).padStart(2, '0')).join('');
    const orderId = `MGB-${invoiceId}-${Date.now().toString(36).toUpperCase()}-${rnd}`;
    const orderName = `AI 사용료 · ${inv.shop_name} · ${inv.billing_month} (${includedCount}명)`;
    try {
      await env.DB.prepare(
        `INSERT INTO payment_orders (order_id, uid, program, amount, status, method, payer_name, student_name, created_at)
         VALUES (?, NULL, 'b2b_ai_monthly', ?, 'pending', 'card', ?, ?, ?)`
      ).bind(orderId, amount, scope.label || inv.shop_name, orderName, Date.now()).run();
    } catch (e) {
      return err('order_create_failed: ' + String((e as any)?.message || e), 500);
    }
    return json({ ok: true, order_id: orderId, amount, order_name: orderName, invoice_id: invoiceId });
  }

  return err('not_found', 404);
}
