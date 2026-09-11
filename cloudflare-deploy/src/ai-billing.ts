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
 * [단가] 대리점마다 다르다(사장님 지시, 2026-09-10). `agency_ai_rate` 에 대리점별로
 *   두고, 없으면 `DEFAULT_AI_RATE_KRW`(개인 결제 `ai_content` 상품과 같은 10,000원)로
 *   떨어진다. 본사(hq)만 바꿀 수 있다 — org-settlement.ts 의 「정산 요율은 본사만」과
 *   같은 원칙.
 *
 * [인원] 「다음 달 수업을 진행할 인원」이 아니라 **«재원 중인 학생 수»** 다(사장님 정정 —
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
 *   않아야 사람이 뺀 것이 다시 살아나지 않는다. 단가(`rate_krw`)는 청구서 **생성 시점에
 *   스냅샷** — 나중에 본사가 단가를 바꿔도 이미 만든(특히 이미 낸) 청구서 금액은 안 바뀐다.
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

interface Env { DB: D1Database; [k: string]: any }

const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);
const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn(); } catch { return fallback; } };

/** 대리점별 단가가 없을 때의 기본값 — 개인 결제 `ai_content` 상품(api-pay.ts PRICES)과 같은 금액. */
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
    return true;
  }, false);
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

// ── 이 shop_name 을 이 스코프 계정이 다뤄도 되는가 (agency=자기 자신, branch=자기 지사 소속, hq/franchise=허용) ──
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

/** 대리점(shop_name) 의 「지금」 재원 학생 목록 — enrolledCond() 정본을 그대로 쓴다. */
async function currentRoster(env: Env, shopName: string): Promise<Array<{ user_id: string; name: string }>> {
  /* 🙈 명부에서 숨긴 계정은 «청구 인원» 에서도 뺀다 — 카페24가 정본이라 지워도 밤에 되살아나므로
     «읽을 때» 거르는 것이 이 저장소의 관례다(정본 student-override.ts). 안 거르면 중복 계정이
     그대로 COUNT 에 들어가 대리점이 실제보다 많은 인원으로 청구받는다(실측 전례: 한 사람의
     계정이 카페24에 15개). 표가 없으면 빈 문자열이 와서 아무것도 안 거른다(fail-open). */
  const hideEx = await hiddenExcludeCond(env as any);
  const rows = await safe(async () => (await env.DB.prepare(
    `SELECT user_id, COALESCE(NULLIF(TRIM(korean_name),''), NULLIF(TRIM(username),''), user_id) AS name
     FROM students_erp WHERE shop_name = ? AND ${enrolledCond('')}${hideEx ? ` AND ${hideEx}` : ''}`
  ).bind(shopName).all<{ user_id: string; name: string }>()).results || [], [] as any[]);
  return rows;
}

async function currentRateFor(env: Env, shopName: string): Promise<number> {
  const r = await safe(async () => env.DB.prepare(
    `SELECT rate_krw FROM agency_ai_rate WHERE shop_name = ?`
  ).bind(shopName).first<{ rate_krw: number }>(), null);
  return (r && Number.isFinite(Number(r.rate_krw)) && Number(r.rate_krw) > 0) ? Number(r.rate_krw) : DEFAULT_AI_RATE_KRW;
}

/**
 * 청구서 생성/보강 — **멱등, 덮어쓰지 않고 더하기만** 한다.
 *   이미 있는 (shop_name, billing_month) 청구서면 «지금 재원인데 아직 명세에 없는 학생» 만
 *   added_manually=1 로 추가한다(사람이 뺀 학생은 손대지 않는다 — 그게 핵심이다).
 *   없으면 새로 만들고 그 순간의 단가를 스냅샷한다.
 */
async function generateOrRefreshInvoice(env: Env, shopName: string, billingMonth: string, actor: string):
    Promise<{ invoice_id: number; added: number; created: boolean }> {
  await ensureSchema(env);
  const existing = await env.DB.prepare(
    `SELECT id, status FROM ai_billing_invoices WHERE shop_name = ? AND billing_month = ?`
  ).bind(shopName, billingMonth).first<{ id: number; status: string }>();

  let invoiceId: number;
  let created = false;
  if (existing) {
    invoiceId = existing.id;
  } else {
    const rate = await currentRateFor(env, shopName);
    const franchise = await safe(async () => env.DB.prepare(
      `SELECT franchise FROM students_erp WHERE shop_name = ? AND franchise IS NOT NULL AND TRIM(franchise)<>'' LIMIT 1`
    ).bind(shopName).first<{ franchise: string }>(), null);
    const now = Date.now();
    const ins = await env.DB.prepare(
      `INSERT INTO ai_billing_invoices (shop_name, franchise, billing_month, rate_krw, status, generated_at, generated_by)
       VALUES (?, ?, ?, ?, 'draft', ?, ?)`
    ).bind(shopName, franchise?.franchise || null, billingMonth, rate, now, actor).run();
    invoiceId = Number(ins.meta.last_row_id);
    created = true;
  }

  // 이미 draft 인 청구서에만 자동으로 더한다 — paid 된 청구서는 명세가 고정이어야 한다(회계 기록).
  const inv = await env.DB.prepare(`SELECT status FROM ai_billing_invoices WHERE id = ?`).bind(invoiceId).first<{ status: string }>();
  if (inv?.status !== 'draft') return { invoice_id: invoiceId, added: 0, created };

  const roster = await currentRoster(env, shopName);
  if (!roster.length) return { invoice_id: invoiceId, added: 0, created };
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
  return { invoice_id: invoiceId, added, created };
}

/** 매달 1일 KST cron 훅 — 모든 대리점의 «다음 달» 청구서를 생성/보강한다. */
export async function generateMonthlyAiInvoices(env: Env): Promise<{ agencies: number; invoices: number; added: number }> {
  await ensureSchema(env);
  const target = monthAdd(currentMonthKST(), 1);
  const shops = await safe(async () => (await env.DB.prepare(
    `SELECT DISTINCT shop_name FROM students_erp WHERE shop_name IS NOT NULL AND TRIM(shop_name) <> '' AND ${enrolledCond('')}`
  ).all<{ shop_name: string }>()).results || [], [] as any[]);
  let invoices = 0, added = 0;
  for (const s of shops) {
    const r = await safe(() => generateOrRefreshInvoice(env, s.shop_name, target, 'auto'), null);
    if (r) { invoices++; added += r.added; }
  }
  return { agencies: shops.length, invoices, added };
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

  // ── GET /rate?q= : 대리점별 단가·재원 인원 목록 (스코프별로 scopeStudentCond 가 걸러 준다) ──
  if (p === 'rate' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const sc = scopeStudentCond(scope, 's');
    const where = ["s.shop_name IS NOT NULL", "TRIM(s.shop_name) <> ''"];
    const binds: any[] = [];
    if (sc.cond) { where.push(sc.cond); binds.push(...sc.binds); }
    // 🙈 숨긴 계정 제외 — currentRoster() 와 «같은 인원» 을 세야 화면 미리보기와 청구서가 안 갈린다
    const hideExRate = await hiddenExcludeCond(env as any, 's');
    if (hideExRate) where.push(hideExRate);
    const rows = await safe(async () => (await env.DB.prepare(`
      SELECT s.shop_name AS shop_name,
             MAX(s.franchise) AS franchise,
             COUNT(*) AS enrolled_count,
             r.rate_krw AS rate_krw
      FROM students_erp s
      LEFT JOIN agency_ai_rate r ON r.shop_name = s.shop_name
      WHERE ${where.join(' AND ')} AND ${enrolledCond('s')}
      GROUP BY s.shop_name
      ORDER BY enrolled_count DESC
    `).bind(...binds).all<any>()).results || [], [] as any[]);
    let list = rows.map(r => ({
      shop_name: r.shop_name, franchise: r.franchise || null,
      enrolled_count: Number(r.enrolled_count) || 0,
      rate_krw: (r.rate_krw != null) ? Number(r.rate_krw) : DEFAULT_AI_RATE_KRW,
      is_custom_rate: r.rate_krw != null,
    }));
    if (q) list = list.filter(r => r.shop_name.toLowerCase().includes(q) || String(r.franchise || '').toLowerCase().includes(q));
    return json({
      ok: true, scope: scope.label, editable: scope.type === 'hq',
      default_rate_krw: DEFAULT_AI_RATE_KRW,
      count: list.length, rows: list.slice(0, 500), truncated: list.length > 500,
    });
  }

  // ── POST /rate {shop_name, rate_krw} : 대리점 단가 설정 (본사만) ──
  if (p === 'rate' && method === 'POST') {
    if (scope.type !== 'hq') return err('forbidden: HQ only', 403);
    const b = await parseJsonBody(request);
    const shopName = String(b?.shop_name || '').trim();
    const rate = Math.round(Number(b?.rate_krw));
    if (!shopName) return err('shop_name required');
    if (!Number.isFinite(rate) || rate < 0 || rate > 1_000_000) return err('rate_krw 는 0~1,000,000 사이여야 합니다');
    const who = scope.label || 'hq';
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

    const inv = await env.DB.prepare(
      `SELECT id, shop_name, franchise, billing_month, rate_krw, status, generated_at, paid_at, order_id
       FROM ai_billing_invoices WHERE shop_name = ? AND billing_month = ?`
    ).bind(shopName, month).first<any>();
    if (!inv) {
      // 아직 생성 전 — 지금 재원 기준으로 «미리보기» 만 보여준다(저장하지 않음).
      const rate = await currentRateFor(env, shopName);
      const roster = await currentRoster(env, shopName);
      return json({
        ok: true, exists: false, shop_name: shopName, billing_month: month,
        rate_krw: rate, preview_count: roster.length, preview_total: rate * roster.length,
      });
    }
    const items = await safe(async () => (await env.DB.prepare(
      `SELECT id, student_user_id, student_name, included, added_manually FROM ai_billing_invoice_items WHERE invoice_id = ? ORDER BY student_name`
    ).bind(inv.id).all<any>()).results || [], [] as any[]);
    const includedCount = items.filter((i: any) => i.included).length;
    return json({
      ok: true, exists: true, invoice: {
        ...inv, item_count: items.length, included_count: includedCount,
        total_krw: includedCount * Number(inv.rate_krw),
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
    if (!(await shopAllowed(env, scope, shopName))) return err('forbidden', 403);
    const month = String(b?.month || monthAdd(currentMonthKST(), 1));
    if (!isValidMonth(month)) return err('month 는 YYYY-MM 형식이어야 합니다');
    const r = await generateOrRefreshInvoice(env, shopName, month, scope.label || 'admin');
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
    if (!(await shopAllowed(env, scope, inv.shop_name))) return err('forbidden', 403);
    if (inv.status !== 'draft') return err('결제 완료된 청구서는 명세를 바꿀 수 없습니다', 409);
    await env.DB.prepare(`UPDATE ai_billing_invoice_items SET included = ? WHERE invoice_id = ? AND student_user_id = ?`)
      .bind(included, invoiceId, studentUid).run();
    return json({ ok: true, invoice_id: invoiceId, student_user_id: studentUid, included: !!included });
  }

  // ── GET /history?shop_name=&limit= : 지난 청구서 목록 ──
  if (p === 'history' && method === 'GET') {
    let shopName = String(url.searchParams.get('shop_name') || '').trim();
    if (scope.type === 'agency') shopName = scope.value || '';
    if (!shopName) return err('shop_name required');
    if (!(await shopAllowed(env, scope, shopName))) return err('forbidden', 403);
    const limit = Math.max(1, Math.min(60, Number(url.searchParams.get('limit')) || 24));
    const rows = await safe(async () => (await env.DB.prepare(`
      SELECT i.id, i.billing_month, i.rate_krw, i.status, i.generated_at, i.paid_at,
             (SELECT COUNT(*) FROM ai_billing_invoice_items x WHERE x.invoice_id = i.id AND x.included = 1) AS included_count
      FROM ai_billing_invoices i WHERE i.shop_name = ? ORDER BY i.billing_month DESC LIMIT ?
    `).bind(shopName, limit).all<any>()).results || [], [] as any[]);
    return json({ ok: true, shop_name: shopName, rows: rows.map((r: any) => ({ ...r, total_krw: Number(r.included_count) * Number(r.rate_krw) })) });
  }

  // ── POST /invoice/checkout {invoice_id} : 토스 결제 주문 생성 ──
  if (p === 'invoice/checkout' && method === 'POST') {
    const b = await parseJsonBody(request) || {};
    const invoiceId = Number(b?.invoice_id);
    if (!invoiceId) return err('invoice_id required');
    const inv = await env.DB.prepare(
      `SELECT id, shop_name, billing_month, rate_krw, status FROM ai_billing_invoices WHERE id = ?`
    ).bind(invoiceId).first<any>();
    if (!inv) return err('invoice not found', 404);
    /* 🔒 (2026-09-11 사장님 결정) 결제 주문을 만들 수 있는 것은 그 대리점 담당자 본인과
       본사뿐이다 — 지사는 대신 결제 요청을 만들 수 없다(볼 수는 있다: GET /invoice·/history
       는 그대로 열려 있다). 위 `scope` 는 지사 계정의 `?as=agency:<산하 대리점>` 드릴다운을
       agency 로 «승격» 시킨 값이라(scope.ts getScope) 그걸로 이 쓰기 게이트를 판정하면
       지사가 산하 대리점인 척 결제 주문을 만들 수 있었다(실제로 그랬다 — 2026-09-11 발견).
       그래서 여기만 `noDrillDown` 으로 «원래 로그인 계정이 무엇인가» 를 한 번 더 물어
       그걸로 판정한다 — 조회에 쓰는 `scope` 는 그대로 두고(드릴다운 조회는 계속 되어야
       한다), 이 한 곳의 판정에만 raw 값을 쓴다.
       ⚠️ (trap-check 지적) 이 조회가 실패했을 때 폴백을 드릴다운 `scope` 로 두면 안 된다 —
       되돌릴 수 없는 조작(결제 주문 생성)의 가드는 «모르면 막는» 쪽으로 실패해야 한다
       (CLAUDE.md 「가드에 필요한 값을 safe(…, null) 로 조회할 때」). 265행의 최초 scope
       조회도 이미 이 원칙대로 'none' 으로 떨어진다 — 여기도 그와 같은 값으로 맞춘다.
       ⚠️ 지금은 getScope() 내부가 전부 s_safe() 로 감싸여 있어 실제로 던지는 경로가
       없으므로 이 폴백은 오늘 당장은 안 밟힌다 — 그래도 나중에 그 내부가 바뀌어 던지게
       되는 순간 조용히 «열리는» 쪽으로 실패하지 않도록 미리 잠가 둔다. */
    const rawScope = await safe(async () => await getScope(env, request, { noDrillDown: true }),
      { type: 'none', value: null, label: '권한 없음' } as Scope);
    if (!(rawScope.type === 'hq' || (rawScope.type === 'agency' && rawScope.value === inv.shop_name))) return err('forbidden', 403);
    if (inv.status === 'paid') return err('이미 결제된 청구서입니다', 409);
    const includedCount = await safe(async () => {
      const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ai_billing_invoice_items WHERE invoice_id = ? AND included = 1`).bind(invoiceId).first<{ n: number }>();
      return Number(r?.n || 0);
    }, 0);
    if (includedCount <= 0) return err('청구할 인원이 없습니다 — 먼저 명세를 확인해 주세요');
    const amount = includedCount * Number(inv.rate_krw);
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
