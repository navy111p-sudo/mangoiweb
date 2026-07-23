/**
 * api-pay.ts — 토스페이먼츠 안전 결제 (서버 확정 방식)
 *
 *  ⚠️ 돈이 오가는 코드. 핵심 안전장치 4가지:
 *    1) 서버 확정(confirm): 카드 결제는 프론트에서 "요청"만 하고, 실제 승인은 반드시
 *       서버가 토스 confirm API(시크릿키)를 호출해 완료한다. (프론트만으로는 미완료 → 자동취소)
 *    2) 금액 위변조 방지: 주문 금액을 서버 가격표(PRICES)로 결정·저장하고, 확정 시
 *       토스가 청구한 금액 == 저장된 주문 금액 인지 대조한다.
 *    3) 중복 방지(멱등): 같은 주문을 두 번 확정 요청해도 한 번만 처리(이미 paid면 그대로 성공).
 *    4) 기록: 모든 주문/결제를 payment_orders 에 남겨 나중에 대사(reconcile) 가능.
 *
 *  테스트 모드: TOSS_SECRET_KEY 가 test_sk_* 이면 토스 테스트 환경(실제 청구 없음).
 *  실전 전환: 시크릿을 live_sk_* 로 바꾸고 프론트 클라이언트키도 live_ck_* 로 교체.
 */
import { json, parseJsonBody } from './api-util';
import { checkAdminSession } from './auth-admin';
import { sendPlainSms } from './solapi-client';
import { authUidFromRequest as authUidGlobal } from './auth-token';

const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';
// 토스 클라이언트 키(공개). 실전 전환 시 env.TOSS_CLIENT_KEY 를 live_ck_* 로 설정하면 코드수정 없이 교체됨.
//   ⚠️ idx-payment-modal.js 의 PAY_INFO.tosspayments_client_key 와 값이 일치해야 함(둘 다 교체).
const TOSS_CLIENT_KEY_DEFAULT = 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';

// ── 서버 가격표(정본). 프론트 PROG_INFO 와 동기화. 여기 없는 상품은 결제 불가(상담 유도) ──
const PRICES: Record<string, { name: string; amount: number }> = {
  '1on1-4':  { name: '1:1 4회권',   amount: 60000 },
  '1on1-8':  { name: '1:1 8회권',   amount: 120000 },
  '1on1-12': { name: '1:1 12회권',  amount: 180000 },
  '1on1-24': { name: '1:1 24회권',  amount: 360000 },
  'group-12':{ name: '그룹 12회권', amount: 120000 },
  'business':{ name: '비즈니스 영어', amount: 70000 },
  'kids':    { name: '키즈 영어',   amount: 50000 },
  'exam':    { name: '시험 영어',   amount: 80000 },
  // 부가 옵션
  'fixed_teacher':  { name: '강사 고정',        amount: 30000 },
  'prime_time':     { name: '시간대 우선권',    amount: 20000 },
  'writing_review': { name: '1:1 영작 첨삭',    amount: 40000 },
  'manager':        { name: '학습 매니저',      amount: 50000 },
  'group_class':    { name: '원어민 그룹 클래스', amount: 60000 },
  'pron_ai':        { name: 'AI 발음 코치',     amount: 15000 },
};

async function ensurePayTable(env: any): Promise<void> {
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS payment_orders (
         order_id TEXT PRIMARY KEY,
         uid TEXT,
         program TEXT,
         amount INTEGER NOT NULL,
         status TEXT NOT NULL DEFAULT 'pending',
         payment_key TEXT,
         method TEXT,
         payer_name TEXT,
         student_name TEXT,
         created_at INTEGER NOT NULL,
         paid_at INTEGER,
         fail_reason TEXT,
         raw TEXT
       )`
    ).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payment_orders_uid ON payment_orders(uid, created_at)`).run();
    // 학부모 확인문자용 전화번호 칸 (기존 배포 테이블에 없으면 추가 — 이미 있으면 조용히 무시)
    try { await env.DB.prepare(`ALTER TABLE payment_orders ADD COLUMN phone TEXT`).run(); } catch (_) {}
  } catch (e) { console.warn('[pay] ensure table:', (e as any)?.message); }
}

/* ═══════════════════════════════════════════════════════════════════
 * 📚 수강신청(enroll) 엔진 — "결제하면 수업이 자동으로 잡힌다" (2026-07-23, 1단계)
 *   규칙 원천 = 결제규칙_정리본_2026-07-22 (장지웅 부장 28문항 + 확인질문 5답):
 *   · 상품: 주1/2/3/5회 × 1/3/6/12개월, 월 기준가 = 대리점 주1회 단가 × 주횟수
 *   · 대리점 단가: 본사가 입력(agency_pricing), 미설정 시 기본 60,000원
 *   · 할인: 6개월 5% / 12개월 10% (일괄결제만) · 40분 수업 = 2배
 *   · 학생이 요일(자유 조합)·시작시각(10분 단위)·강사 직접 선택 → 결제 확정 시 회차 전량 생성
 *   · 이중 예약은 서버가 원천 차단(주문 시 + 활성화 시 이중 검사)
 *   · 강사 등급 가산: 정책 미정 → 자리만(teacherRate, 기본 1.0)
 * ═══════════════════════════════════════════════════════════════════ */

const ENROLL_WEEKLY = [1, 2, 3, 5];
const ENROLL_MONTHS = [1, 3, 6, 12];
const ENROLL_BASE_WEEKLY1 = 60000;   // 대리점 단가 미설정 시 기본(월 4회 기준)
const ENROLL_TIME_MIN = 6 * 60;      // 예약 가능 시작시각 06:00 ~
const ENROLL_TIME_MAX = 23 * 60 + 40; // ~ 23:40

/** 가격 계산 — 대리점 주1회 단가 × 주횟수 × 개월 × 기간할인 × 수업길이 배수 (10원 단위 절사) */
export function enrollQuoteCalc(weekly1Price: number, weekly: number, months: number, minutes: number, teacherRate = 1.0) {
  const sessions = weekly * 4 * months;                       // 주1회=월4회 기준 총 회차
  const discountRate = months >= 12 ? 0.90 : months >= 6 ? 0.95 : 1;
  const lenMul = minutes === 40 ? 2 : 1;
  const base = weekly1Price * weekly * months * lenMul;
  const amount = Math.floor((base * discountRate * teacherRate) / 10) * 10;
  const perSession = Math.round(amount / sessions);
  return { sessions, base, discountRate, amount, perSession };
}

/** 'HH:MM' → 분. 형식 오류면 -1 */
export function enrollTimeToMin(t: string): number {
  const m = /^([0-2]\d):([0-5]\d)$/.exec(String(t || '').trim());
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 두 수업 시간대가 겹치는가 (시작분·길이분) */
export function enrollOverlap(aStart: number, aMin: number, bStart: number, bMin: number): boolean {
  return aStart < bStart + bMin && bStart < aStart + aMin;
}

/** 시작일부터 선택 요일(0=일~6=토)로 sessions 회차의 날짜 생성. blocked(YYYY-MM-DD)는 건너뛰고 뒤로 밀림(공휴일 규칙 ①). */
export function enrollDates(startDate: string, days: number[], sessions: number, blocked?: Set<string>): string[] {
  const out: string[] = [];
  const d = new Date(startDate + 'T00:00:00Z');
  if (isNaN(d.getTime())) return out;
  const want = new Set(days);
  for (let i = 0; i < 800 && out.length < sessions; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (want.has(d.getUTCDay()) && !(blocked && blocked.has(iso))) out.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** enroll 관련 테이블 보증 */
async function ensureEnrollTables(env: any): Promise<void> {
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS agency_pricing (shop_name TEXT PRIMARY KEY, weekly1_price INTEGER NOT NULL, updated_by TEXT, updated_at INTEGER)`);
    try { await env.DB.prepare(`ALTER TABLE payment_orders ADD COLUMN enroll_json TEXT`).run(); } catch (_) {}
    // 이중 예약 원천 차단(같은 강사·같은 날짜·같은 시작시각 active 중복 금지). 기존 데이터가 걸리면 조용히 포기(조회 검사로 보완).
    try { await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sched_teacher_slot ON class_schedules(teacher_id, scheduled_date, start_time) WHERE status='active' AND scheduled_date IS NOT NULL AND teacher_id IS NOT NULL`).run(); } catch (_) {}
  } catch (e) { console.warn('[enroll] ensure tables:', (e as any)?.message); }
}

/** 학생 uid → 대리점(shop_name)과 주1회 단가 */
async function enrollPriceForUid(env: any, uid: string): Promise<{ shopName: string; weekly1Price: number }> {
  let shopName = '';
  try {
    const st: any = await env.DB.prepare(`SELECT shop_name FROM students_erp WHERE user_id = ? LIMIT 1`).bind(uid).first();
    shopName = String(st?.shop_name || '').trim();
  } catch (_) {}
  let weekly1Price = ENROLL_BASE_WEEKLY1;
  if (shopName) {
    try {
      const p: any = await env.DB.prepare(`SELECT weekly1_price FROM agency_pricing WHERE shop_name = ? LIMIT 1`).bind(shopName).first();
      if (p && Number(p.weekly1_price) > 0) weekly1Price = Number(p.weekly1_price);
    } catch (_) {}
  }
  return { shopName, weekly1Price };
}

/** 강사의 기존 수업과 충돌하는 날짜 목록 (dated 행 + recurring 행 모두 검사) */
async function enrollConflicts(env: any, teacherId: string, dates: string[], startMin: number, minutes: number, days: number[]): Promise<Set<string>> {
  const conflicts = new Set<string>();
  try {
    // 1) 날짜 지정 수업: 해당 날짜들에서 시간 겹침 (D1 파라미터 100개 한도 → 90개 청크)
    for (let i = 0; i < dates.length; i += 90) {
      const chunk = dates.slice(i, i + 90);
      const ph = chunk.map(() => '?').join(',');
      const rs: any = await env.DB.prepare(
        `SELECT scheduled_date, start_time, COALESCE(duration_min, 30) AS dm FROM class_schedules
         WHERE teacher_id = ? AND status = 'active' AND scheduled_date IN (${ph})`
      ).bind(teacherId, ...chunk).all();
      for (const r of ((rs?.results as any[]) || [])) {
        const s = enrollTimeToMin(String(r.start_time || ''));
        if (s >= 0 && enrollOverlap(startMin, minutes, s, Number(r.dm) || 30)) conflicts.add(String(r.scheduled_date));
      }
    }
    // 2) 요일 반복 수업: 선택 요일과 같은 요일 + 시간 겹침이면 해당 요일 전체 충돌
    const rs2: any = await env.DB.prepare(
      `SELECT day_of_week, start_time, COALESCE(duration_min, 30) AS dm FROM class_schedules
       WHERE teacher_id = ? AND status = 'active' AND schedule_kind = 'recurring' AND day_of_week IS NOT NULL`
    ).bind(teacherId).all();
    const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };
    const badDows = new Set<number>();
    for (const r of ((rs2?.results as any[]) || [])) {
      const dw = DOW[String(r.day_of_week || '').toLowerCase().slice(0, 3)];
      if (dw === undefined || !days.includes(dw)) continue;
      const s = enrollTimeToMin(String(r.start_time || ''));
      if (s >= 0 && enrollOverlap(startMin, minutes, s, Number(r.dm) || 30)) badDows.add(dw);
    }
    if (badDows.size) {
      for (const iso of dates) {
        const dw = new Date(iso + 'T00:00:00Z').getUTCDay();
        if (badDows.has(dw)) conflicts.add(iso);
      }
    }
  } catch (e) { console.warn('[enroll] conflicts:', (e as any)?.message); }
  return conflicts;
}

/** enroll 요청 본문 공통 검증 → 정규화. 오류면 {error} */
function enrollParse(body: any): any {
  const weekly = Number(body?.weekly || 0);
  const months = Number(body?.months || 0);
  const minutes = Number(body?.minutes || 20);
  const time = String(body?.time || '').trim();
  const startDate = String(body?.start_date || '').trim();
  const teacherId = String(body?.teacher_id || '').trim().slice(0, 40);
  const days: number[] = Array.isArray(body?.days) ? [...new Set(body.days.map((x: any) => Number(x)))].filter((n: number) => n >= 0 && n <= 6).sort() as number[] : [];
  if (!ENROLL_WEEKLY.includes(weekly)) return { error: 'bad_weekly' };
  if (!ENROLL_MONTHS.includes(months)) return { error: 'bad_months' };
  if (minutes !== 20 && minutes !== 40) return { error: 'bad_minutes' };
  const startMin = enrollTimeToMin(time);
  if (startMin < ENROLL_TIME_MIN || startMin > ENROLL_TIME_MAX || startMin % 10 !== 0) return { error: 'bad_time' };
  if (days.length !== weekly) return { error: 'days_count_mismatch' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: 'bad_start_date' };
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (startDate < todayKst) return { error: 'start_date_past' };
  if (!teacherId) return { error: 'teacher_required' };
  return { weekly, months, minutes, time, startMin, startDate, teacherId, days };
}

function tossMode(env: any): 'test' | 'live' | 'disabled' {
  const k = String(env.TOSS_SECRET_KEY || '');
  if (!k) return 'disabled';
  return k.startsWith('live_') ? 'live' : 'test';
}

/**
 * 결제 API 라우터. index.ts 에서 /api/pay/* 를 여기로 보낸다.
 */
export async function handlePayApi(request: Request, url: URL, env: any): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (!path.startsWith('/api/pay/')) return null;

  await ensurePayTable(env);

  // ═══ 📚 수강신청(enroll) — 강사·요일·시간 선택 → 가격 → 주문 → (확정 시) 수업 전량 자동 생성 ═══
  if (path.startsWith('/api/pay/enroll/')) {
    await ensureEnrollTables(env);

    // (a) 강사 목록 (공개 — 이름·사진만)
    if (path === '/api/pay/enroll/teachers' && method === 'GET') {
      let rows: any[] = [];
      try {
        const rs: any = await env.DB.prepare(`SELECT id, name, photo_url FROM teachers WHERE active = 1 ORDER BY name ASC LIMIT 200`).all();
        rows = (rs?.results as any[]) || [];
      } catch (_) {
        try {
          const rs: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE active = 1 ORDER BY name ASC LIMIT 200`).all();
          rows = (rs?.results as any[]) || [];
        } catch (_) {}
      }
      return json({ ok: true, teachers: rows.map((t) => ({ id: String(t.id), name: String(t.name || ''), photo: String(t.photo_url || '') })) });
    }

    // (b) 가격 견적 (공개 — uid 의 대리점 단가 기준. 금액 확정은 어차피 서버 주문에서 재계산)
    if (path === '/api/pay/enroll/quote' && method === 'POST') {
      const body = await parseJsonBody(request) || {};
      const uid = String(body.uid || '').trim();
      const weekly = Number(body.weekly || 0), months = Number(body.months || 0), minutes = Number(body.minutes || 20);
      if (!ENROLL_WEEKLY.includes(weekly) || !ENROLL_MONTHS.includes(months) || (minutes !== 20 && minutes !== 40)) {
        return json({ ok: false, error: 'bad_options' }, 400);
      }
      const { shopName, weekly1Price } = await enrollPriceForUid(env, uid);
      const q = enrollQuoteCalc(weekly1Price, weekly, months, minutes);
      return json({ ok: true, shop_name: shopName || null, weekly1_price: weekly1Price, ...q,
        name: `주${weekly}회 × ${months}개월 (${q.sessions}회${minutes === 40 ? '·40분' : ''})` });
    }

    // (c) 슬롯 가능 여부 — 충돌 날짜 수만 알려줌 (강사 시간표 노출 없음)
    if (path === '/api/pay/enroll/check' && method === 'POST') {
      const body = await parseJsonBody(request) || {};
      const p = enrollParse(body);
      if (p.error) return json({ ok: false, error: p.error }, 400);
      const sessions = p.weekly * 4 * p.months;
      const dates = enrollDates(p.startDate, p.days, sessions);
      if (dates.length < sessions) return json({ ok: false, error: 'date_gen_failed' }, 400);
      const conflicts = await enrollConflicts(env, p.teacherId, dates, p.startMin, p.minutes, p.days);
      return json({ ok: true, sessions, conflict_count: conflicts.size, ok_to_book: conflicts.size === 0,
        first_date: dates[0], last_date: dates[dates.length - 1] });
    }

    // (d) 주문 생성 — 본인 인증 필수(서명 토큰), 서버가 가격·충돌 재검증
    if (path === '/api/pay/enroll/create-order' && method === 'POST') {
      const body = await parseJsonBody(request) || {};
      const uid = String(body.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const authUid = await authUidGlobal(request, url, env, body);
      if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);
      const p = enrollParse(body);
      if (p.error) return json({ ok: false, error: p.error }, 400);

      const sessions = p.weekly * 4 * p.months;
      const dates = enrollDates(p.startDate, p.days, sessions);
      if (dates.length < sessions) return json({ ok: false, error: 'date_gen_failed' }, 400);
      const conflicts = await enrollConflicts(env, p.teacherId, dates, p.startMin, p.minutes, p.days);
      if (conflicts.size > 0) {
        return json({ ok: false, error: 'slot_conflict', conflict_count: conflicts.size,
          message: '선택한 시간에 이미 다른 수업이 있습니다. 다른 시간을 골라주세요.' }, 409);
      }

      const { shopName, weekly1Price } = await enrollPriceForUid(env, uid);
      const q = enrollQuoteCalc(weekly1Price, p.weekly, p.months, p.minutes);
      let tName = '';
      try { const t: any = await env.DB.prepare(`SELECT name FROM teachers WHERE id = ? LIMIT 1`).bind(p.teacherId).first(); tName = String(t?.name || ''); } catch (_) {}
      let sName = '';
      try { const s: any = await env.DB.prepare(`SELECT COALESCE(korean_name, english_name, username) AS n FROM students_erp WHERE user_id = ? LIMIT 1`).bind(uid).first(); sName = String(s?.n || ''); } catch (_) {}

      const orderName = `주${p.weekly}회 × ${p.months}개월 수강권 (${q.sessions}회${p.minutes === 40 ? '·40분' : ''})`;
      const enrollJson = JSON.stringify({
        v: 1, uid, teacher_id: p.teacherId, teacher_name: tName, days: p.days, time: p.time,
        minutes: p.minutes, weekly: p.weekly, months: p.months, start_date: p.startDate,
        sessions: q.sessions, per_session: q.perSession, weekly1_price: weekly1Price, shop_name: shopName || null,
      });
      const rnd = bytesHex(crypto.getRandomValues(new Uint8Array(6)));
      const orderId = `MGE-${Date.now().toString(36).toUpperCase()}-${rnd}`;
      try {
        await env.DB.prepare(
          `INSERT INTO payment_orders (order_id, uid, program, amount, status, method, payer_name, student_name, phone, enroll_json, created_at)
           VALUES (?, ?, 'enroll', ?, 'pending', 'card', ?, ?, NULL, ?, ?)`
        ).bind(orderId, uid, q.amount, sName || null, sName || null, enrollJson, Date.now()).run();
      } catch (e) {
        return json({ ok: false, error: 'order_create_failed', message: String((e as any)?.message || e) }, 500);
      }
      return json({ ok: true, orderId, amount: q.amount, orderName,
        clientKey: env.TOSS_CLIENT_KEY || TOSS_CLIENT_KEY_DEFAULT,
        summary: { teacher: tName, days: p.days, time: p.time, minutes: p.minutes, sessions: q.sessions,
          first_date: dates[0], last_date: dates[dates.length - 1], discount: q.discountRate } });
    }

    // (e) 대리점 단가 관리 (본사 관리자 전용 — 확인답변 ①: 본사에서 입력)
    if (path === '/api/pay/enroll/admin/prices' && method === 'GET') {
      const sess = await checkAdminSession(request, env);
      if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
      let shops: any[] = [];
      try {
        const rs: any = await env.DB.prepare(
          `SELECT s.shop_name, COUNT(*) AS students, MAX(p.weekly1_price) AS weekly1_price, MAX(p.updated_at) AS updated_at
           FROM students_erp s LEFT JOIN agency_pricing p ON p.shop_name = s.shop_name
           WHERE s.shop_name IS NOT NULL AND s.shop_name != ''
           GROUP BY s.shop_name ORDER BY students DESC LIMIT 300`
        ).all();
        shops = (rs?.results as any[]) || [];
      } catch (e) { return json({ ok: false, error: String((e as any)?.message || e) }, 500); }
      return json({ ok: true, default_price: ENROLL_BASE_WEEKLY1, shops });
    }
    if (path === '/api/pay/enroll/admin/prices' && method === 'POST') {
      const sess = await checkAdminSession(request, env);
      if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
      const body = await parseJsonBody(request) || {};
      const shopName = String(body.shop_name || '').trim().slice(0, 100);
      const price = Number(body.weekly1_price || 0);
      if (!shopName || !(price >= 1000 && price <= 1000000)) return json({ ok: false, error: 'bad_params' }, 400);
      await env.DB.prepare(
        `INSERT INTO agency_pricing (shop_name, weekly1_price, updated_by, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(shop_name) DO UPDATE SET weekly1_price = excluded.weekly1_price, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
      ).bind(shopName, Math.round(price), String((sess as any).username || 'admin'), Date.now()).run();
      return json({ ok: true, shop_name: shopName, weekly1_price: Math.round(price) });
    }

    return json({ ok: false, error: 'not_found' }, 404);
  }

  // ── 1) 주문 생성: 서버가 금액을 결정(위변조 방지)하고 pending 주문을 만든다 ──
  if (path === '/api/pay/create-order' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const program = String(body.program || '').trim();
    const uid = String(body.uid || '').trim() || null;
    const payer = String(body.payer || '').slice(0, 40) || null;
    const student = String(body.student || '').slice(0, 40) || null;
    const method_ = String(body.method || 'card').slice(0, 20);
    const phone = String(body.phone || '').replace(/[^0-9]/g, '').slice(0, 20) || null; // 결제완료 확인문자용(선택)

    const priced = PRICES[program];
    // 서버 가격표에 있으면 그 금액을 강제(클라이언트가 보낸 금액 무시). 없으면 결제 불가.
    if (!priced) {
      return json({ ok: false, error: 'unknown_program', message: '결제 가능한 상품이 아닙니다. 상담을 이용해 주세요.' }, 400);
    }
    const amount = priced.amount;
    if (amount <= 0) {
      return json({ ok: false, error: 'not_payable', message: '이 상품은 온라인 결제 대상이 아닙니다.' }, 400);
    }

    // 서버 생성 주문번호(추측 어렵게). 시각은 요청 헤더 기반이 아닌 Date.now() 사용.
    const rnd = bytesHex(crypto.getRandomValues(new Uint8Array(6)));
    const orderId = `MGI-${Date.now().toString(36).toUpperCase()}-${rnd}`;
    try {
      await env.DB.prepare(
        `INSERT INTO payment_orders (order_id, uid, program, amount, status, method, payer_name, student_name, phone, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
      ).bind(orderId, uid, program, amount, method_, payer, student, phone, Date.now()).run();
    } catch (e) {
      return json({ ok: false, error: 'order_create_failed', message: String((e as any)?.message || e) }, 500);
    }
    return json({ ok: true, orderId, amount, orderName: priced.name });
  }

  // ── 2) 결제 확정: 프론트 성공콜백이 호출. 서버가 토스에 최종 승인 요청 ──
  if (path === '/api/pay/confirm' && method === 'POST') {
    const mode = tossMode(env);
    if (mode === 'disabled') {
      return json({ ok: false, error: 'pg_not_configured', message: '결제가 아직 설정되지 않았습니다(관리자 문의).' }, 503);
    }
    const body = await parseJsonBody(request) || {};
    const paymentKey = String(body.paymentKey || '').trim();
    const orderId = String(body.orderId || '').trim();
    const amount = Number(body.amount || 0);
    if (!paymentKey || !orderId || !amount) {
      return json({ ok: false, error: 'missing_params', message: '결제 정보가 올바르지 않습니다.' }, 400);
    }

    const order: any = await env.DB.prepare(
      `SELECT order_id, amount, status, program, uid, student_name, payer_name, phone, enroll_json FROM payment_orders WHERE order_id = ? LIMIT 1`
    ).bind(orderId).first();
    if (!order) {
      return json({ ok: false, error: 'order_not_found', message: '주문을 찾을 수 없습니다.' }, 404);
    }
    // 멱등: 이미 확정된 주문이면 다시 청구하지 않고 성공으로 응답.
    if (order.status === 'paid') {
      return json({ ok: true, already: true, orderId, amount: order.amount, message: '이미 결제 완료된 주문입니다.' });
    }
    // 🔒 금액 위변조 방지: 요청 금액 == 저장된 주문 금액 이어야 확정 진행.
    if (Number(order.amount) !== amount) {
      await env.DB.prepare(`UPDATE payment_orders SET status='failed', fail_reason='amount_mismatch' WHERE order_id=?`).bind(orderId).run();
      return json({ ok: false, error: 'amount_mismatch', message: '결제 금액이 주문과 일치하지 않습니다.' }, 400);
    }

    // 토스 confirm 호출 (시크릿키 Basic 인증). 여기서 실제 승인이 완료된다.
    const auth = 'Basic ' + btoa(String(env.TOSS_SECRET_KEY) + ':');
    let tossRes: Response, tossJson: any;
    try {
      tossRes = await fetch(TOSS_CONFIRM_URL, {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      });
      tossJson = await tossRes.json().catch(() => ({}));
    } catch (e) {
      return json({ ok: false, error: 'pg_network', message: '결제사 연결 오류. 잠시 후 다시 시도해 주세요.' }, 502);
    }

    if (tossRes.ok && (tossJson?.status === 'DONE' || tossJson?.status === 'PAID')) {
      const now2 = Date.now();
      await env.DB.prepare(
        `UPDATE payment_orders SET status='paid', payment_key=?, paid_at=?, raw=? WHERE order_id=?`
      ).bind(paymentKey, now2, JSON.stringify(tossJson).slice(0, 4000), orderId).run();

      // 💳→📚 수강 자동 활성화 + 📱 학부모 결제완료 확인문자 (둘 다 실패해도 결제 성공 응답 유지)
      await activateEnrollment(env, order, amount, now2, orderId);
      await sendBuyerPaidSms(env, order, amount, orderId);

      return json({
        ok: true, orderId, amount,
        method: tossJson?.method || null,
        receipt: tossJson?.receipt?.url || null,
        approvedAt: tossJson?.approvedAt || null,
        orderName: tossJson?.orderName || null,
      });
    }

    // 실패 — 토스 에러코드/메시지를 그대로 담아 프론트가 친절히 안내
    const code = tossJson?.code || ('http_' + tossRes.status);
    const msg = tossJson?.message || '결제 승인에 실패했습니다.';
    await env.DB.prepare(`UPDATE payment_orders SET status='failed', fail_reason=? WHERE order_id=?`).bind(String(code).slice(0, 100), orderId).run();

    // 🔔 결제 실패 시 사장님 폰 문자 알림 (실패해도 응답엔 영향 없음). 학부모 후속 연락용.
    try {
      const toPhone = (env as any).OWNER_ALERT_PHONE;
      if (toPhone) {
        const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
        const who = String(order.student_name || order.payer_name || '');
        const txt = `[망고아이] ⚠️ 결제 실패 알림\n${who ? who + ' · ' : ''}${amount.toLocaleString('ko-KR')}원\n사유: ${msg}\n주문: ${orderId}\n시각: ${kst} (KST)`;
        await sendPlainSms(env, toPhone, txt);
      }
    } catch (e) { console.warn('[pay] fail alert:', (e as any)?.message); }

    return json({ ok: false, error: code, message: msg }, 400);
  }

  // ── 3) 주문 상태 조회 (성공 페이지 표시용) ──
  if (path.startsWith('/api/pay/order/') && method === 'GET') {
    const orderId = decodeURIComponent(path.split('/api/pay/order/')[1] || '');
    if (!orderId) return json({ ok: false, error: 'no_order' }, 400);
    const order = await env.DB.prepare(
      `SELECT order_id, program, amount, status, method, paid_at, fail_reason FROM payment_orders WHERE order_id = ? LIMIT 1`
    ).bind(orderId).first();
    if (!order) return json({ ok: false, error: 'order_not_found' }, 404);
    return json({ ok: true, order });
  }

  // ── 4) 상품 시세 조회 (간편 결제링크 페이지에서 금액 표시용, 공개) ──
  if (path === '/api/pay/quote' && method === 'GET') {
    const program = url.searchParams.get('program') || '';
    const p = PRICES[program];
    if (!p) return json({ ok: false, error: 'unknown_program' }, 404);
    return json({ ok: true, program, name: p.name, amount: p.amount, clientKey: env.TOSS_CLIENT_KEY || TOSS_CLIENT_KEY_DEFAULT });
  }

  // ── 6) 결제 내역 조회 (관리자 전용) — 결제 센터에서 들어온 결제를 한눈에 ──
  if (path === '/api/pay/admin/orders' && method === 'GET') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
    const rows = await env.DB.prepare(
      `SELECT order_id, program, amount, status, method, payer_name, student_name, created_at, paid_at, fail_reason
       FROM payment_orders ORDER BY created_at DESC LIMIT ?`
    ).bind(limit).all();
    // 오늘 결제완료 합계·건수 요약
    const since = Date.now() - 24 * 3600 * 1000;
    const sum: any = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt, IFNULL(SUM(amount),0) AS total FROM payment_orders WHERE status='paid' AND paid_at > ?`
    ).bind(since).first();
    return json({ ok: true, orders: rows.results || [], today: { count: sum?.cnt || 0, total: sum?.total || 0 } });
  }

  // ── 5) 결제 링크 문자 발송 (관리자 전용) — 학부모 폰으로 간편결제 링크 SMS ──
  if (path === '/api/pay/send-link' && method === 'POST') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const body = await parseJsonBody(request) || {};
    const program = String(body.program || '').trim();
    const phone = String(body.phone || '').replace(/[^0-9]/g, '');
    const name = String(body.name || '').slice(0, 30).trim();
    const p = PRICES[program];
    if (!p) return json({ ok: false, error: 'unknown_program', message: '상품을 선택해 주세요.' }, 400);
    if (phone.length < 10) return json({ ok: false, error: 'invalid_phone', message: '전화번호를 확인해 주세요.' }, 400);

    const origin = new URL(request.url).origin;
    // phone 을 링크에 실어 → pay-link 가 주문에 저장 → 결제완료 확인문자 자동 발송
    const link = `${origin}/pay-link.html?program=${encodeURIComponent(program)}` + (name ? `&name=${encodeURIComponent(name)}` : '') + `&phone=${encodeURIComponent(phone)}`;
    const won = p.amount.toLocaleString('ko-KR');
    const text = `[망고아이] ${name ? name + '님, ' : ''}${p.name} ${won}원 결제 안내입니다.\n아래 링크에서 카드·카카오페이로 간편하게 결제해 주세요 👇\n${link}`;
    const r = await sendPlainSms(env, phone, text);
    if (r.ok) return json({ ok: true, sent: true, link, detail: r.message });
    return json({ ok: false, error: r.error || 'sms_failed', message: r.message || '문자 발송에 실패했습니다.' }, 502);
  }

  // ── 7) 토스 웹훅 — 토스가 서버에 직접 결제상태를 통지 (학부모 브라우저와 무관하게 100% 확정) ──
  //   ⚠️ 웹훅 본문은 신뢰하지 않는다: orderId만 뽑고, 진짜 상태는 토스 API를 시크릿키로 재조회해 검증.
  //   멱등: 이미 paid 인 주문은 재처리하지 않음. 항상 200 응답(토스 재전송 폭주 방지).
  if (path === '/api/pay/webhook' && method === 'POST') {
    const mode = tossMode(env);
    if (mode === 'disabled') return json({ ok: true, skipped: 'pg_not_configured' });
    const body = await parseJsonBody(request) || {};
    // v1 웹훅 두 형태 지원: {eventType, data:{orderId,...}} / 가상계좌 입금콜백 {orderId, status, ...}
    const orderId = String(body?.data?.orderId || body?.orderId || '').trim();
    if (!orderId) return json({ ok: true, skipped: 'no_order_id' });

    const order: any = await env.DB.prepare(
      `SELECT order_id, amount, status, program, uid, student_name, payer_name, phone, enroll_json FROM payment_orders WHERE order_id = ? LIMIT 1`
    ).bind(orderId).first();
    if (!order) return json({ ok: true, skipped: 'order_not_found' });

    // 토스에 진짜 상태 재조회 (웹훅 위조 방지 — 이 결과만 믿는다)
    const auth = 'Basic ' + btoa(String(env.TOSS_SECRET_KEY) + ':');
    let pay: any = null;
    try {
      const r = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`,
        { headers: { 'Authorization': auth } });
      if (r.ok) pay = await r.json();
    } catch (_) {}
    if (!pay || !pay.status) return json({ ok: true, skipped: 'verify_failed' });

    if (pay.status === 'DONE' && order.status !== 'paid') {
      // 금액 대조 후 확정 (프론트가 미완료한 결제를 웹훅이 보완 확정하는 순간)
      if (Number(pay.totalAmount) !== Number(order.amount)) {
        await env.DB.prepare(`UPDATE payment_orders SET status='failed', fail_reason='webhook_amount_mismatch' WHERE order_id=?`).bind(orderId).run();
        return json({ ok: true, flagged: 'amount_mismatch' });
      }
      const now3 = Date.now();
      await env.DB.prepare(
        `UPDATE payment_orders SET status='paid', payment_key=?, paid_at=?, method=?, raw=? WHERE order_id=?`
      ).bind(String(pay.paymentKey || ''), now3, String(pay.method || order.method || ''), JSON.stringify(pay).slice(0, 4000), orderId).run();
      await activateEnrollment(env, order, Number(order.amount), now3, orderId);
      await sendBuyerPaidSms(env, order, Number(order.amount), orderId);
      // 프론트 확정이 누락됐던 건을 웹훅이 잡은 것 → 사장님께 정보 문자(유령결제 방지 확인용)
      try {
        const toPhone = (env as any).OWNER_ALERT_PHONE;
        if (toPhone) {
          const who = String(order.student_name || order.payer_name || '');
          await sendPlainSms(env, toPhone, `[망고아이] ✅ 웹훅 보완확정\n${who ? who + ' · ' : ''}${Number(order.amount).toLocaleString('ko-KR')}원\n(브라우저 미완료 결제를 서버가 자동 확정)\n주문: ${orderId}`);
        }
      } catch (_) {}
      return json({ ok: true, confirmed: true });
    }

    if ((pay.status === 'CANCELED' || pay.status === 'PARTIAL_CANCELED') && order.status !== 'cancelled') {
      await env.DB.prepare(`UPDATE payment_orders SET status='cancelled', fail_reason=? , raw=? WHERE order_id=?`)
        .bind(String(pay.status), JSON.stringify(pay).slice(0, 4000), orderId).run();
      try {
        const toPhone = (env as any).OWNER_ALERT_PHONE;
        if (toPhone) {
          const who = String(order.student_name || order.payer_name || '');
          await sendPlainSms(env, toPhone, `[망고아이] ↩️ 결제 취소 통지\n${who ? who + ' · ' : ''}${Number(order.amount).toLocaleString('ko-KR')}원\n주문: ${orderId}`);
        }
      } catch (_) {}
      return json({ ok: true, cancelled: true });
    }

    return json({ ok: true, noop: true, status: pay.status });
  }

  // ── 8) 결제 대사(장부 맞추기) 즉시 실행 (관리자 전용) — 결제센터 "지금 점검" 버튼용 ──
  if (path === '/api/pay/admin/audit' && method === 'GET') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const withSms = url.searchParams.get('sms') === '1';
    const out = await runPaymentAudit(env, { sms: withSms });
    return json({ ok: true, audit: out });
  }

  return null;
}

/** 💳→📚 수강 자동 활성화 (confirm·webhook 공용, 실패해도 결제 흐름에 영향 없음) */
async function activateEnrollment(env: any, order: any, amount: number, when: number, orderId: string): Promise<void> {
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
    // 멱등: 같은 주문으로 이미 활성화됐으면 두 번 만들지 않음 (confirm과 webhook이 경합해도 안전)
    const dup: any = await env.DB.prepare(`SELECT id FROM enrollments WHERE notes LIKE ? LIMIT 1`).bind(`%${orderId}%`).first();
    if (dup) return;
    const sName = String(order.student_name || order.payer_name || '결제고객');
    const pkg = (PRICES[String(order.program)] && PRICES[String(order.program)].name) || String(order.program || '');
    await env.DB.prepare(
      `INSERT INTO enrollments (student_user_id, student_name, package, started_at, ended_at, monthly_fee_krw, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, 'active', ?, ?, ?)`
    ).bind(order.uid || null, sName, pkg, when, amount, `토스 결제 자동활성화 · ${orderId}`, when, when).run();
  } catch (e) { console.warn('[pay] enrollment activate:', (e as any)?.message); }
  // 📚 수강신청 주문이면 회차 전량을 실제 수업으로 생성 (멱등·충돌 회피)
  await enrollCreateSchedules(env, order, orderId).catch((e: any) => console.warn('[enroll] schedules:', e?.message));
}

/** 📚 결제 확정 → class_schedules 회차 전량 생성.
 *   멱등: source='enroll:주문번호' 가 이미 있으면 재실행 안 함 (confirm·webhook 경합 안전).
 *   충돌: 주문~결제 사이에 슬롯이 찼으면 그 날짜만 건너뛰고 뒤로 밀어 회차 수 보존(공휴일 규칙 ①과 동일).
 */
async function enrollCreateSchedules(env: any, order: any, orderId: string): Promise<void> {
  if (!order || !order.enroll_json) return;
  let ej: any = null;
  try { ej = JSON.parse(String(order.enroll_json)); } catch (_) { return; }
  if (!ej || !ej.uid || !ej.teacher_id || !Array.isArray(ej.days)) return;
  await ensureEnrollTables(env);
  try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`); } catch (_) {}

  const src = `enroll:${orderId}`;
  const dup: any = await env.DB.prepare(`SELECT id FROM class_schedules WHERE source = ? LIMIT 1`).bind(src).first();
  if (dup) return; // 이미 생성됨(멱등)

  const sessions = Number(ej.sessions || 0);
  const startMin = enrollTimeToMin(String(ej.time || ''));
  if (!sessions || startMin < 0) return;

  // 결제 시점 기준으로 충돌 재검사 → 충돌 날짜는 blocked 로 넘겨 뒤로 밀어 생성
  const probe = enrollDates(String(ej.start_date), ej.days, sessions * 2); // 여유분 포함 후보
  const conflicts = await enrollConflicts(env, String(ej.teacher_id), probe, startMin, Number(ej.minutes) || 20, ej.days);
  const dates = enrollDates(String(ej.start_date), ej.days, sessions, conflicts);
  if (dates.length < sessions) { console.warn('[enroll] not enough dates', orderId); }

  const now = Date.now();
  const sName = String(order.student_name || order.payer_name || '');
  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO class_schedules (user_id, student_name, schedule_kind, class_type, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at, notes)
     VALUES (?, ?, 'dated', 'regular', ?, ?, ?, ?, 'active', ?, 'enroll-auto', ?, ?)`
  );
  const note = `수강신청 자동생성 · ${ej.teacher_name || ''} · 주${ej.weekly}회×${ej.months}개월`;
  const batch: any[] = [];
  for (const d of dates) {
    batch.push(stmt.bind(String(ej.uid), sName || null, d, String(ej.time), Number(ej.minutes) || 20, String(ej.teacher_id), src, now, note));
  }
  // D1 batch 는 개수 제한이 없지만 안전하게 80개씩 나눠 실행
  for (let i = 0; i < batch.length; i += 80) {
    await env.DB.batch(batch.slice(i, i + 80));
  }
}

/** 📱 학부모 결제완료 확인문자 — "됐나 안 됐나" 불안 재시도(이중결제 1위 원인)를 원천 차단 */
async function sendBuyerPaidSms(env: any, order: any, amount: number, orderId: string): Promise<void> {
  try {
    const phone = String(order.phone || '').replace(/[^0-9]/g, '');
    if (phone.length < 10) return; // 전화번호 없는 주문(사이트 내 결제 등)은 조용히 생략
    const pkg = (PRICES[String(order.program)] && PRICES[String(order.program)].name) || String(order.program || '');
    const who = String(order.student_name || order.payer_name || '');
    const txt = `[망고아이] ✅ 결제가 완료되었습니다\n${who ? who + ' · ' : ''}${pkg}\n${amount.toLocaleString('ko-KR')}원\n수업이 자동 활성화되었어요. 감사합니다 🥭\n(중복 결제되지 않으니 다시 결제하지 않으셔도 됩니다)`;
    await sendPlainSms(env, phone, txt);
  } catch (e) { console.warn('[pay] buyer sms:', (e as any)?.message); }
}

/**
 * 🔍 결제 대사(장부 맞추기) — 매일 밤 cron 이 호출. 어긋난 것만 골라 사장님 SMS.
 *   A) 레거시(student_payments, 카페24 동기화본): 최근 3일 내 같은 회원·같은 금액이 10분 내 2회 이상 = 이중결제 의심
 *   B) 새 시스템(payment_orders): 같은 uid·상품이 48시간 내 2회 이상 paid = 이중결제 의심
 *   C) 새 시스템: paid 인데 수강(enrollments) 연결 누락 = 돈만 받고 수업 안 열린 건
 *   D) 오래된 pending(24h+) 건수 — 정보용(문자 안 보냄)
 */
export async function runPaymentAudit(env: any, opts?: { sms?: boolean }): Promise<any> {
  const out: any = { legacyDup: [], newDup: [], missingEnroll: [], stalePending: 0, checkedAt: Date.now() };
  await ensurePayTable(env);

  // A) 레거시 이중결제 의심 (최근 3일, 10분 내 동일 회원·동일 금액 반복)
  try {
    const since = Date.now() - 3 * 86400 * 1000; // student_payments.paid_at 은 ms
    const r = await env.DB.prepare(
      `SELECT user_id, amount_krw, date(paid_at/1000,'unixepoch','+9 hours') AS d, COUNT(*) AS cnt
       FROM student_payments
       WHERE status='paid' AND amount_krw>0 AND paid_at >= ?
       GROUP BY user_id, d, amount_krw
       HAVING COUNT(*) >= 2 AND (MAX(paid_at)-MIN(paid_at)) BETWEEN 1000 AND 600000`
    ).bind(since).all();
    out.legacyDup = r?.results || [];
  } catch (e) { out.legacyDupError = String((e as any)?.message || e); }

  // B) 새 시스템 이중결제 의심 (48시간)
  try {
    const since = Date.now() - 48 * 3600 * 1000;
    const r = await env.DB.prepare(
      `SELECT uid, program, COUNT(*) AS cnt, SUM(amount) AS total
       FROM payment_orders WHERE status='paid' AND paid_at >= ? AND uid IS NOT NULL
       GROUP BY uid, program HAVING COUNT(*) >= 2`
    ).bind(since).all();
    out.newDup = r?.results || [];
  } catch (e) { out.newDupError = String((e as any)?.message || e); }

  // C) paid 인데 수강 연결 누락 (48시간)
  try {
    const since = Date.now() - 48 * 3600 * 1000;
    const r = await env.DB.prepare(
      `SELECT o.order_id, o.student_name, o.payer_name, o.amount
       FROM payment_orders o
       WHERE o.status='paid' AND o.paid_at >= ?
         AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.notes LIKE '%'||o.order_id||'%')`
    ).bind(since).all();
    out.missingEnroll = r?.results || [];
  } catch (e) { out.missingEnrollError = String((e as any)?.message || e); }

  // D) 오래된 pending (1~7일) — 정보용
  try {
    const r: any = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM payment_orders WHERE status='pending' AND created_at BETWEEN ? AND ?`
    ).bind(Date.now() - 7 * 86400 * 1000, Date.now() - 86400 * 1000).first();
    out.stalePending = r?.n || 0;
  } catch (_) {}

  const anomalies = (out.legacyDup.length || 0) + (out.newDup.length || 0) + (out.missingEnroll.length || 0);
  out.summary = { anomalies, legacyDup: out.legacyDup.length, newDup: out.newDup.length, missingEnroll: out.missingEnroll.length, stalePending: out.stalePending };

  // 이상 있을 때만 사장님 문자 (매일 "정상" 문자는 소음이라 안 보냄)
  if (opts?.sms && anomalies > 0) {
    try {
      const toPhone = (env as any).OWNER_ALERT_PHONE;
      if (toPhone) {
        const lines = [`[망고아이] 🔍 결제 점검 이상 ${anomalies}건`];
        if (out.legacyDup.length) lines.push(`·이중결제 의심 ${out.legacyDup.length}건(기존 결제창)`);
        if (out.newDup.length) lines.push(`·이중결제 의심 ${out.newDup.length}건(새 결제)`);
        if (out.missingEnroll.length) lines.push(`·수업연결 누락 ${out.missingEnroll.length}건`);
        lines.push(`관리자 결제센터에서 확인하세요`);
        await sendPlainSms(env, toPhone, lines.join('\n'));
        out.smsSent = true;
      }
    } catch (e) { out.smsError = String((e as any)?.message || e); }
  }
  return out;
}

function bytesHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}
