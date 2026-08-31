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
import { handleEnrollApi, enrollCreateSchedules, currentEnrollment, createEnrollOrder, priceForUid, teacherRateFor, enrollQuoteCalc, ENROLL_WEEKLY, addDays, authUidOrAdminSession, renewStartDate } from './enroll-ops';
import { authUidFromRequest } from './auth-token';
import { siteUrl } from './site-url';           // 🔗 사람에게 나가는 링크는 한 곳에서 (사전고지 문자)
import { handleRefundApi } from './api-pay-refund';   // 💸 환불 실행·기록 (2026-08-25 신설)

const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';
/* 토스 클라이언트 키(공개)의 최후 폴백 = 토스 공식 테스트키(실제 청구 없음).
   ✅ (2026-08-07) 프론트가 이제 GET /api/pay/config 로 이 값을 받아간다 —
      idx-payment-modal.js 에 같은 값을 한 벌 더 두던 구조를 없앴다.
      실결제 전환은 아래 두 시크릿 교체로 **끝난다**(코드 수정·재배포 없이 즉시 반영):
        wrangler secret put TOSS_CLIENT_KEY   ← live_ck_...
        wrangler secret put TOSS_SECRET_KEY   ← live_sk_...
      한쪽만 바꾸면 /api/pay/config 가 key_mismatch:true 를 돌려주고 결제창에 경고가 뜬다. */
const TOSS_CLIENT_KEY_DEFAULT = 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';

/* 🛡️ (2026-08-07) 시크릿에 «키가 아닌 것»이 들어와도 결제창이 죽지 않게.
   실제로 겪었다 — 키를 넣는 과정에서 엉뚱한 문자열이 TOSS_CLIENT_KEY 로 올라갔고,
   그 값으로 window.TossPayments(...) 를 호출하면 결제창이 그대로 실패한다.
   시크릿은 사람이 손으로 붙여넣는 값이라 «빈 값·명령어·따옴표 섞임»이 언제든 다시 생긴다.
   → 모양이 토스 키가 아니면 무시하고 테스트키로 폴백한다. 잘못된 키로 여는 것보다
     테스트 모드가 낫다(적어도 화면이 정직하게 「테스트 결제 모드」라고 말한다).
   ⚠️ 검증은 «모양»만 본다. 키가 유효한지는 토스만 안다 — 그건 confirm 단계에서 걸러진다. */
/* ⚠️ (2026-08-07 재수정) 처음엔 `^(test|live)_(ck|sk)_[A-Za-z0-9]{10,}$` 로 좁게 막았는데,
   그러면 토스가 실제로 발급하는 다른 형태(결제위젯 키 `live_gck_...`, 중간 세그먼트가 더 있는
   `test_gck_docs_xxxx` 등)까지 «가짜»로 판정해 버린다. 그건 훨씬 나쁜 사고다 —
   tossMode()='disabled' 는 /api/pay/confirm 과 웹훅을 503 으로 막아 **진짜 결제를 죽인다**.
   그래서 판정을 뒤집는다: «토스 키의 목록»을 맞히려 하지 말고, **명백한 쓰레기만** 걸러낸다.
     · 공백이 있으면 키가 아니다 (붙여넣기 사고의 전형 — 명령어·문장이 통째로 들어온 경우)
     · test_ / live_ 로 시작하지 않으면 키가 아니다
     · 너무 짧으면 키가 아니다
   역할(ck/sk) 구분은 두 번째 세그먼트에 'ck'/'sk' 가 들어있는지로 본다(gck·gsk 도 걸린다). */
function tossKeyRole(v: unknown): 'ck' | 'sk' | null {
  const s = String(v ?? '').trim();
  /* ⚠️ (2026-08-07 3차) 길이 하한(20자)을 뺐다. 임의로 정한 숫자였는데, 접두사가 멀쩡한
     실제 키 두 개를 «모양이 아니다»로 판정했다. 내가 모르는 길이의 키가 언제든 또 나온다.
     남기는 건 «명백한 쓰레기»를 거르는 조건뿐: 공백 / test_·live_ 로 시작 안 함 / 접두사 비정상.
     짧은 키는 토스가 거부한다 — 그 판정은 토스에게 맡긴다. */
  if (!s || /\s/.test(s)) return null;
  if (!/^(?:test|live)_/.test(s)) return null;
  /* 🔴 (2026-08-07 4차) 실제로 «live_ck_...» 라는 **안내문의 자리표시자 글자**가 그대로 등록됐다.
     접두사가 맞아서 전부 통과했고, mode 는 live·key_mismatch 는 false 로 «정상»이라 보고했다.
     = 화면은 실결제라고 말하는데 토스에서만 조용히 전부 실패하는, 가장 나쁜 상태.
     토스 키의 접두사 뒤는 영숫자(위젯키는 `_` 포함)뿐이다 — 점(...)이 들어갈 자리가 없다.
     길이로 막지 않는 대신 «쓸 수 없는 문자»로 자리표시자를 잡는다. */
  if (!/^(?:test|live)_[A-Za-z0-9_-]+$/.test(s)) return null;
  const seg = s.split('_')[1] || '';
  if (!/^[A-Za-z0-9]+$/.test(seg)) return null;
  if (seg.includes('sk')) return 'sk';
  if (seg.includes('ck')) return 'ck';
  return null;
}
function isTossKeyShaped(v: unknown, kind: 'ck' | 'sk'): boolean {
  return tossKeyRole(v) === kind;
}

/** 실제로 쓸 클라이언트 키 — 모양이 어긋나면 테스트키로 폴백 */
function tossClientKey(env: any): { key: string; invalid: boolean } {
  const raw = String(env.TOSS_CLIENT_KEY ?? '').trim();
  if (!raw) return { key: TOSS_CLIENT_KEY_DEFAULT, invalid: false };      // 미설정 = 정상 폴백
  if (!isTossKeyShaped(raw, 'ck')) {
    console.warn('[pay] TOSS_CLIENT_KEY 모양이 토스 키가 아님 — 테스트키로 폴백');
    return { key: TOSS_CLIENT_KEY_DEFAULT, invalid: true };               // 잘못 들어옴 = 폴백 + 신고
  }
  return { key: raw, invalid: false };
}

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

function tossMode(env: any): 'test' | 'live' | 'disabled' {
  const k = String(env.TOSS_SECRET_KEY || '').trim();
  if (!k) return 'disabled';
  /* 🔴 (2026-08-07 재수정) 여기서 «모양»으로 disabled 를 만들지 않는다.
     tossMode()==='disabled' 는 /api/pay/confirm 과 웹훅을 503 으로 막는다 = 진짜 결제가 죽는다.
     내 추측이 틀렸을 때(토스가 내가 모르는 형태의 키를 발급했을 때) 그 대가가 너무 크다.
     키가 진짜 틀렸는지는 **토스가 판단한다** — confirm 이 토스 에러로 실패하면 그때 드러난다.
     여기서는 «값이 있는가»만 보고, 모양이 수상한 건 /api/pay/config 의 secret_key_invalid 로
     «신고»만 한다(막지 않는다). 값이 아예 없을 때만 disabled. */
  return k.startsWith('live_') ? 'live' : 'test';
}

/* 💳♾️ (2026-07-31) 자동연장(정기결제) — 제보 #4 후속(2-2/3-2). "자동연장은 기존에 없던 기능"이라는
   확인 답변에 따라 새로 개발. 토스 "빌링키"(카드 등록 → 매월 재청구) 방식.
   ⚠️ 기존 /api/admin/subscription/* (api-admin.ts) 는 billing_key 없이 그냥 '결제 성공'을 DB에
   써넣기만 하던 가짜 구현이었다(실제로 카드가 청구된 적이 없음) — 이번에 real 청구로 교체한다. */
async function ensureSubscriptionsSchema(env: any): Promise<void> {
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, plan TEXT, amount INTEGER, status TEXT DEFAULT 'active', next_billing_at INTEGER, last_billed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
  } catch {}
  /* charge_lock_at — «지금 이 구독을 청구하는 중» 표식(2026-08-31). chargeSubscriptionOnce 참고. */
  for (const col of ['billing_key TEXT', 'customer_key TEXT', 'fail_count INTEGER DEFAULT 0', 'teacher_id TEXT', 'weekly INTEGER', 'minutes INTEGER', 'charge_lock_at INTEGER']) {
    try { await env.DB.exec(`ALTER TABLE subscriptions ADD COLUMN ${col}`); } catch {}
  }
}

/** 자동연장 대상 학생의 견적(기본 1개월) — renew-order 와 완전히 같은 계산식(가격 산정 이원화 방지).
 *  🔁 (2026-08-23) months 를 받게 확장 — charge-now(등록 카드로 창 없이 결제)가 3·6·12개월도 쓴다.
 *     기간할인(6개월 95% / 12개월 90%)은 enrollQuoteCalc 가 그대로 적용한다. */
async function autoRenewQuote(env: any, uid: string, months = 1) {
  const cur = await currentEnrollment(env, uid);
  // 🔁 (2026-08-24) active(미래 수업 있음) 대신 renewable — 60일 안에 끝난 수강도 자동결제로 이어받는다.
  if (!cur.renewable || !cur.days_resolved || !cur.times_resolved) return { error: 'no_active_enrollment' };
  const weekly = cur.days.length;
  if (!ENROLL_WEEKLY.includes(weekly)) return { error: 'weekly_unresolved' };
  const { shopName, weekly1Price } = await priceForUid(env, uid);
  const tRate = await teacherRateFor(env, cur.teacher_id);
  const q = enrollQuoteCalc(weekly1Price, weekly, months, cur.minutes, tRate);
  return { ok: true, cur, weekly, months, amount: q.amount, sessions: q.sessions, shopName, weekly1Price, tRate };
}

/** ♾️ 다음 자동청구 시각 = «수강 마지막 수업일 3일 전» KST 10:00 (01:00 UTC — cron 스윕 시각과 동일).
 *  등록시각 +30일 고정은 수강 종료일과 어긋나 «수업 공백»(종료가 먼저) 또는 «한 달 이른 청구»(청구가 먼저)를
 *  만들었다(2026-08-23 수리). 이미 지난 시각이면 지금 — 다음 스윕에서 바로 청구 대상이 된다. */
function nextBillingFromLastDate(lastDate: string): number {
  const t = Date.parse(String(lastDate || '') + 'T01:00:00Z') - 3 * 86400 * 1000;
  if (isNaN(t)) return Date.now() + 30 * 86400 * 1000;
  /* ⚠️ (2026-08-24) 계산된 시각이 이미 지났으면(수업이 곧 끝나거나 이미 끝난 학생) «지금» 으로 두면 안 된다 —
     다음 스윕이 그 자리에서 청구해 버려 **D-3 사전고지 문자가 나갈 틈이 없다**. 3일 뒤로 밀어
     오늘 안내가 먼저 나가게 한다(sendPrebillNotices 가 now~now+3일 창을 본다). */
  return t > Date.now() ? t : Date.now() + 3 * 86400 * 1000;
}

/** 토스 빌링키로 실제 청구 1회 — 관리자 "지금 청구" 버튼과 cron 자동청구가 공용으로 쓴다.
 *  성공: payment_orders 에 실제 결제로 기록 + enrollCreateSchedules 로 다음 달 수업 실제 생성.
 *  실패: fail_count 누적, 3회째면 자동 해지(카드가 계속 막히는데 계속 시도하지 않음). */
/** ⏱ 한 구독을 «동시에 두 번 청구하지 않기» 위한 선점 시간(밀리초).
 *  이보다 오래된 표식은 죽은 것으로 보고 다음 실행이 가져간다 — 워커가 청구 도중 죽어도
 *  스스로 풀린다. 토스 호출 + 수업 생성까지 넉넉히 덮으면서, 막혀도 다음 스윕에서 곧 재시도된다. */
const CHARGE_LEASE_MS = 10 * 60 * 1000;

/**
 * 💳 빌링키로 실제 청구 — **네 경로가 모두 이 함수를 지난다**
 *   ① cron 스윕(runAutoRenewChargeSweep) ② 관리자 「지금 청구」 ③ 학부모 「즉시 결제」(charge-now)
 *   ④ 관리자 화면의 스윕 수동 실행
 *
 * [왜 선점이 필요한가] 이 함수는 «주문을 새로 만들고 → 토스에 청구» 한다. 주문번호가 매번
 * 새로 만들어지므로 **토스는 두 요청을 서로 다른 주문으로 보고 카드를 두 번 긁는다.**
 * 예전에는 아무 선점도 없어서 같은 구독이 두 경로에서 동시에 불리면(예: cron 과 관리자 수동)
 * 그대로 이중청구였다. charge-now 에 60초 가드가 있었지만 «읽고 나서 쓰는» 방식이라
 * 동시에 들어온 두 요청은 둘 다 통과한다.
 *
 * [무엇을 하나] 청구를 시작하기 전에 선점 칸을 조건부 UPDATE 로 «차지» 한다. D1(SQLite)은
 * 쓰기를 직렬화하므로 두 요청이 동시에 와도 **정확히 하나만** changes=1 이 된다.
 * 진 쪽은 청구하지 않고 already_charging 으로 돌아간다.
 *
 * ⚠️ 실패 쪽으로 닫는다 — 선점 자체가 실패하면(칸이 없거나 DB 오류) 청구하지 **않는다**.
 *    돈이 걸린 자리에서는 «안 긁는 것» 이 «두 번 긁는 것» 보다 낫다. 대신 조용히 넘어가지 않고
 *    로그를 남긴다(다음 스윕에서 다시 시도된다).
 * ⛔ 선점을 «성공했을 때만» 푸는 식으로 바꾸지 말 것 — 카드 거절·네트워크 오류로 빠져나가는
 *    길이 여럿이라 한 곳만 빠뜨려도 그 구독이 10분간 청구되지 않는다. finally 로 항상 푼다.
 */
export async function chargeSubscriptionOnce(env: any, sub: any, months = 1): Promise<{ ok: boolean; error?: string; amount?: number }> {
  if (!sub.billing_key || !sub.customer_key) return { ok: false, error: 'no_billing_key' };
  /* 선점 칸이 없는 DB 에서도 돌게 한다 — 관리자 「지금 청구」(api-admin.ts)는 이 함수를
     부르기 전에 스키마를 보장하지 않는다. 매번 불러도 싸다: src/index.ts 의 fetch·scheduled
     양쪽 진입부가 env.DB 를 wrapDbDdlOnce 로 감싸 **같은 DDL 문자열은 격리당 한 번만** 나간다
     (src/db-ddl-once.ts). ⚠️ 그 래핑이 사라지면 이 호출이 구독 1건마다 8건씩 나간다. */
  await ensureSubscriptionsSchema(env);
  const _lockNow = Date.now();
  let _claim: any = null;
  try {
    _claim = await env.DB.prepare(
      `UPDATE subscriptions SET charge_lock_at = ? WHERE id = ? AND (charge_lock_at IS NULL OR charge_lock_at < ?)`
    ).bind(_lockNow, sub.id, _lockNow - CHARGE_LEASE_MS).run();
  } catch (e: any) {
    console.error('[billing] 선점 실패 — 청구하지 않는다(이중청구 방지):', sub.id, e?.message);
    return { ok: false, error: 'claim_failed' };
  }
  if (!_claim?.meta?.changes) {
    console.warn('[billing] 이미 청구 중인 구독이라 건너뜀:', sub.id);
    return { ok: false, error: 'already_charging' };
  }
  try {
    return await chargeSubscriptionOnceInner(env, sub, months);
  } finally {
    /* ⚠️ «내가 잡은 표식» 일 때만 푼다. Inner 가 리스(10분)를 넘기면 다른 실행이 만료로
       정당하게 선점하는데, 그때 이 finally 가 남의 표식을 지우면 세 번째가 들어와
       결국 이중청구가 된다. charge_lock_at 이 내 값 그대로일 때만 NULL 로 되돌린다.
       ⚠️ 해제 실패는 삼키되(진짜 청구 결과를 가리면 안 된다) 조용히 넘기지는 않는다 —
          실패하면 그 구독은 최대 10분간 already_charging 이라 원인을 알아야 한다. */
    await env.DB.prepare(`UPDATE subscriptions SET charge_lock_at = NULL WHERE id = ? AND charge_lock_at = ?`)
      .bind(sub.id, _lockNow).run()
      .catch((e: any) => { console.warn('[billing] 선점 해제 실패(최대 10분 뒤 자동 해제):', sub.id, e?.message); });
  }
}

async function chargeSubscriptionOnceInner(env: any, sub: any, months = 1): Promise<{ ok: boolean; error?: string; amount?: number }> {
  const q = await autoRenewQuote(env, sub.user_id, months);
  if (!('ok' in q) || !q.ok) {
    // 현재 요일·시간 패턴을 더 이상 확신할 수 없음(수동으로 스케줄이 바뀐 경우 등) — 잘못된 금액 청구 방지, 해지 처리
    await env.DB.prepare(`UPDATE subscriptions SET status='cancelled', updated_at=? WHERE id=?`).bind(Date.now(), sub.id).run();
    try {
      const toPhone = (env as any).OWNER_ALERT_PHONE;
      if (toPhone) await sendPlainSms(env, toPhone, `[망고아이] ♻️ 자동연장 자동해지\n${sub.student_name || sub.user_id}\n사유: ${(q as any).error} (현재 수업 패턴 확인 불가)\n학부모에게 재신청 안내 필요`);
    } catch (e) {
      // 🔇→🔊 (2026-08-09) 문자 실패로 «해지 처리» 를 되돌리지는 않는다 — 삼키는 건 옳다.
      //   잘못된 건 «아무 기록도 안 남기는 것» 이었다. 그러면 사장님은 해지 사실을 영영 모른다.
      console.warn('[api-pay] 자동해지 알림 문자 실패:', (e as any)?.message, 'sub=', sub.id);
    }
    return { ok: false, error: (q as any).error || 'quote_failed' };
  }

  // 1) 정상 주문 생성(연장과 동일 로직 — enroll_json·회차·충돌회피 전부 재사용)
  const orderResp = await createEnrollOrder(env, sub.user_id, {
    weekly: q.weekly, months: q.months, minutes: q.cur.minutes, times: q.cur.times,
    startDate: renewStartDate(q.cur.last_date), teacherId: q.cur.teacher_id, days: q.cur.days,
  }, 'auto_renew');
  const orderBody: any = await orderResp.json().catch(() => ({}));
  if (!orderBody || !orderBody.ok) {
    await bumpSubscriptionFailure(env, sub, 'order_failed:' + (orderBody?.error || 'unknown'));
    return { ok: false, error: orderBody?.error || 'order_failed' };
  }
  const { orderId, amount, orderName } = orderBody;

  // 2) 토스 빌링키 실청구
  const auth = 'Basic ' + btoa(String(env.TOSS_SECRET_KEY) + ':');
  let tossRes: Response, tossJson: any;
  try {
    tossRes = await fetch(`https://api.tosspayments.com/v1/billing/${encodeURIComponent(sub.billing_key)}`, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerKey: sub.customer_key, amount, orderId, orderName }),
    });
    tossJson = await tossRes.json();
  } catch (e: any) {
    await env.DB.prepare(`UPDATE payment_orders SET status='failed', fail_reason=? WHERE order_id=?`).bind('network:' + String(e?.message || e), orderId).run();
    await bumpSubscriptionFailure(env, sub, 'network_error');
    return { ok: false, error: 'network_error' };
  }

  if (!tossRes.ok || tossJson.status !== 'DONE') {
    await env.DB.prepare(`UPDATE payment_orders SET status='failed', fail_reason=?, raw=? WHERE order_id=?`)
      .bind(String(tossJson?.message || tossJson?.code || 'toss_declined'), JSON.stringify(tossJson).slice(0, 4000), orderId).run();
    await bumpSubscriptionFailure(env, sub, String(tossJson?.message || 'card_declined'));
    return { ok: false, error: String(tossJson?.message || 'card_declined') };
  }

  // 3) 성공 — 결제 확정 + 수업 실제 생성(기존 confirm/webhook과 동일 경로)
  const now = Date.now();
  await env.DB.prepare(`UPDATE payment_orders SET status='paid', payment_key=?, paid_at=?, method=?, raw=? WHERE order_id=?`)
    .bind(String(tossJson.paymentKey || ''), now, '자동연장(빌링키)', JSON.stringify(tossJson).slice(0, 4000), orderId).run();
  const order: any = await env.DB.prepare(`SELECT * FROM payment_orders WHERE order_id = ?`).bind(orderId).first();
  if (order) {
    await activateEnrollment(env, order, amount, now, orderId);
    await sendBuyerPaidSms(env, order, amount, orderId).catch(() => {});
  }
  /* 다음 청구는 «30일 뒤» 가 아니라 «이번에 산 수업이 끝나기 3일 전». 3·6·12개월을 샀으면 그만큼 뒤로 밀린다.
     구독의 amount 는 화면이 «매월 ○원» 으로 보여주는 값이라 개월 수와 무관하게 월 견적으로 적는다. */
  const newLastDate = String(orderBody?.summary?.last_date || '');
  const nextBillingAt = newLastDate ? nextBillingFromLastDate(newLastDate) : now + 30 * 86400 * 1000;
  const monthlyAmount = q.months === 1 ? amount
    : enrollQuoteCalc(q.weekly1Price, q.weekly, 1, q.cur.minutes, q.tRate).amount;
  await env.DB.prepare(`UPDATE subscriptions SET amount=?, last_billed_at=?, next_billing_at=?, fail_count=0, updated_at=? WHERE id=?`)
    .bind(monthlyAmount, now, nextBillingAt, now, sub.id).run();
  return { ok: true, amount };
}

async function bumpSubscriptionFailure(env: any, sub: any, reason: string): Promise<void> {
  const now = Date.now();
  const failCount = Number(sub.fail_count || 0) + 1;
  if (failCount >= 3) {
    await env.DB.prepare(`UPDATE subscriptions SET status='cancelled', fail_count=?, updated_at=? WHERE id=?`).bind(failCount, now, sub.id).run();
  } else {
    // 내일 다시 시도 (카드 한도·잔액 문제는 하루 지나면 풀리는 경우가 많음)
    await env.DB.prepare(`UPDATE subscriptions SET fail_count=?, next_billing_at=?, updated_at=? WHERE id=?`).bind(failCount, now + 86400 * 1000, now, sub.id).run();
  }
  try {
    const toPhone = (env as any).OWNER_ALERT_PHONE;
    if (toPhone) {
      await sendPlainSms(env, toPhone, `[망고아이] ⚠️ 자동연장 청구 실패 (${failCount}/3)\n${sub.student_name || sub.user_id}\n사유: ${reason}${failCount >= 3 ? '\n→ 자동 해지됨. 학부모에게 재결제 안내 필요' : '\n→ 내일 재시도'}`);
    }
  } catch (_) {}
}

/** cron 전용 — KV 'billing:auto_renew_live' 가 '1' 일 때만 실제 청구(기본 dry-run, 오청구 방지) */
export async function runAutoRenewChargeSweep(env: any): Promise<any> {
  await ensureSubscriptionsSchema(env);
  const now = Date.now();
  const due = await env.DB.prepare(`SELECT * FROM subscriptions WHERE status='active' AND billing_key IS NOT NULL AND next_billing_at IS NOT NULL AND next_billing_at <= ?`).bind(now).all();
  const rows = (due as any).results || [];
  let live = false;
  try { live = (await env.SESSION_STATE.get('billing:auto_renew_live')) === '1'; } catch {}
  if (!live) {
    // 미리보기에 «누가·얼마» 를 담아 준다 — 사장님이 스위치를 켜기 전에 볼 목록 (2026-08-23)
    return {
      ok: true, dry_run: true, due_count: rows.length,
      due: rows.map((r: any) => ({ id: r.id, user_id: r.user_id, student_name: r.student_name, amount: r.amount, next_billing_at: r.next_billing_at })),
      note: 'KV billing:auto_renew_live=1 로 켜야 실제 청구됩니다(현재 미리보기만)',
    };
  }
  /* 📨 D-3 사전고지 — 결제 3일 안쪽으로 들어온 구독에 «○일에 ○원 자동결제» 문자(결제일별 1회 멱등).
     국내 정기결제 관행(사전고지 없는 자동청구 = 민원 1순위). 라이브일 때만 — dry-run 중에 보내면
     «결제 예정» 이라는 문자 자체가 거짓말이 된다. 실패해도 청구 루프는 막지 않는다. */
  let notified = 0;
  try { notified = await sendPrebillNotices(env); } catch (e) { console.warn('[auto-renew] prebill notice:', (e as any)?.message); }
  let charged = 0, failed = 0, skipped = 0;
  const results: any[] = [];
  for (const sub of rows) {
    const r = await chargeSubscriptionOnce(env, sub);
    /* ⏭ «건너뜀» 은 실패가 아니다 — 다른 경로가 같은 구독을 청구 중이거나(already_charging)
       선점 자체를 못 한 것(claim_failed)이다. 이것을 failed 에 섞으면 관리자 화면이
       «카드 거절» 로 읽어, 있지도 않은 결제 문제를 쫓게 된다. */
    if (r.ok) charged++;
    else if (r.error === 'already_charging' || r.error === 'claim_failed') skipped++;
    else failed++;
    results.push({ id: sub.id, user_id: sub.user_id, ...r });
  }
  return { ok: true, dry_run: false, due_count: rows.length, charged, failed, skipped, notified, results };
}

/** 📨 자동청구 사전고지 — next_billing_at 이 3일 안인 활성 구독의 학부모 폰에 금액·날짜·해지 안내.
 *  멱등: enroll_notify_log (uid, kind='prebill', day=결제예정일) — 같은 결제일에 두 번 보내지 않는다.
 *  전화번호 조회는 만료문자(runEnrollExpirySweep)와 같은 곳(students_erp 의 parent_phone→phone). */
async function sendPrebillNotices(env: any): Promise<number> {
  const now = Date.now();
  const rs: any = await env.DB.prepare(
    `SELECT user_id, student_name, amount, next_billing_at FROM subscriptions
     WHERE status='active' AND billing_key IS NOT NULL AND next_billing_at > ? AND next_billing_at <= ?`
  ).bind(now, now + 3 * 86400 * 1000).all();
  const rows = ((rs as any)?.results as any[]) || [];
  if (!rows.length) return 0;
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS enroll_notify_log (uid TEXT NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, sent_at INTEGER, PRIMARY KEY (uid, kind, day))`);
  } catch (_) { /* 이미 있음 — 정상 */ }
  let sent = 0;
  for (const sub of rows) {
    const uid = String(sub.user_id || '');
    if (!uid) continue;
    const billDay = new Date(Number(sub.next_billing_at) + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST 날짜
    const dup: any = await env.DB.prepare(`SELECT uid FROM enroll_notify_log WHERE uid=? AND kind='prebill' AND day=? LIMIT 1`).bind(uid, billDay).first();
    if (dup) continue;
    let phone = '', name = '';
    try {
      const s: any = await env.DB.prepare(
        `SELECT COALESCE(parent_phone, phone) AS ph, COALESCE(korean_name, english_name, username) AS nm FROM students_erp WHERE user_id = ? LIMIT 1`
      ).bind(uid).first();
      phone = String(s?.ph || '').replace(/[^0-9]/g, '');
      name = String(s?.nm || '');
    } catch (_) {}
    await env.DB.prepare(`INSERT OR REPLACE INTO enroll_notify_log (uid, kind, day, sent_at) VALUES (?, 'prebill', ?, ?)`).bind(uid, billDay, now).run();
    if (phone.length < 10) continue;
    const txt = `[망고아이] ♾️ 자동결제 안내\n${name ? name + ' 학생 · ' : ''}${billDay.slice(5).replace('-', '/')}에 ${Number(sub.amount || 0).toLocaleString('ko-KR')}원이 등록된 카드로 자동 결제될 예정입니다.\n변경·해지: ${siteUrl('/enroll.html')}`;
    const sr = await sendPlainSms(env, phone, txt);
    if (sr?.ok) sent++;
  }
  return sent;
}

/**
 * 결제 API 라우터. index.ts 에서 /api/pay/* 를 여기로 보낸다.
 */
export async function handlePayApi(request: Request, url: URL, env: any): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (!path.startsWith('/api/pay/')) return null;

  await ensurePayTable(env);

  /* ═══ 💸 환불 «실행·기록» — 전용 모듈(api-pay-refund.ts)로 위임 (2026-08-25) ═══
     ⚠️ enroll 위임보다 **먼저** 와야 한다 — 경로가 /api/pay/admin/refund* 라 겹치지는 않지만,
        환불은 돈을 되돌리는 유일한 길이라 라우팅에서 눈에 띄는 자리에 둔다.
     ℹ️ 기존 «계산기»(/api/pay/enroll/admin/refund-quote)는 그대로 둔다 —
        수강신청 화면이 쓰고 있고, 새 미리보기와 답이 같은지 대조하는 근거가 된다. */
  if (path.startsWith('/api/pay/admin/refund')) {
    const r = await handleRefundApi(request, url, env);
    if (r) return r;
  }

  // ═══ 📚 수강신청(enroll) — 전용 모듈(enroll-ops.ts)로 위임 ═══
  if (path.startsWith('/api/pay/enroll/')) {
    return await handleEnrollApi(request, url, env);
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

    /* 🔒 (2026-07-30) 비로그인 결제 차단 — 제보 #1, 서버 쪽 최종 방어선.
       클라이언트 가드(idx-payment-modal.js)는 우회 가능하므로, 실제 보안 경계는 여기다.
       uid 는 클라이언트가 보낸 값을 그대로 믿지 않고 세션 토큰으로 재검증한다(enroll-ops.ts
       renew-order 와 동일 패턴) — 그래야 "아무 uid나 적어서 보내는" 위조를 막는다. */
    const authUid = await authUidOrAdminSession(request, url, env, body);
    if (!authUid) {
      return json({ ok: false, error: 'auth_required', message: '로그인 후 결제할 수 있습니다.' }, 401);
    }
    if (uid && authUid !== uid) {
      return json({ ok: false, error: 'uid_mismatch', message: '로그인 정보가 일치하지 않습니다. 다시 로그인해 주세요.' }, 403);
    }
    const verifiedUid = authUid;

    // 서버 생성 주문번호(추측 어렵게). 시각은 요청 헤더 기반이 아닌 Date.now() 사용.
    const rnd = bytesHex(crypto.getRandomValues(new Uint8Array(6)));
    const orderId = `MGI-${Date.now().toString(36).toUpperCase()}-${rnd}`;
    try {
      await env.DB.prepare(
        `INSERT INTO payment_orders (order_id, uid, program, amount, status, method, payer_name, student_name, phone, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
      ).bind(orderId, verifiedUid, program, amount, method_, payer, student, phone, Date.now()).run();
    } catch (e) {
      return json({ ok: false, error: 'order_create_failed', message: String((e as any)?.message || e) }, 500);
    }
    return json({ ok: true, orderId, amount, orderName: priced.name });
  }

  /* ── 1-b) 수기 입금 접수 (2026-07-29 신설) ───────────────────────────────
     홈 결제창의 「결제 완료 확인」 버튼은 그동안 존재하지 않는 `/api/student/payment` 를 불러
     항상 404 를 받았다. 그래서 카드를 뺀 결제수단은 **접수 자체가 안 됐다**
     (실제로 payment_orders 에 card 외 method 행이 한 건도 없었다).

     여기는 "돈을 받는" 곳이 아니라 "학부모가 보냈다고 알려온 것을 장부에 남기는" 곳이다.
       · 금액은 서버 가격표로 확정한다(클라이언트 금액 무시). 맞춤코스만 입력값을 받는다.
       · status='await_deposit' 로 남겨 관리자 결제센터에서 '입금 확인 대기'로 보이게 한다.
       · 확정(paid)은 사람이 통장을 확인한 뒤 관리자가 처리한다. 여기서 자동 활성화하지 않는다.
     ⚠️ /api/pay/* 는 index.ts 에서 이미 공개 라우팅이라 별도 게이트 등록이 필요 없다. */
  if (path === '/api/pay/manual-request' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const program = String(body.program || '').trim();
    const payer   = String(body.payer_name || '').trim().slice(0, 40);
    const student = String(body.student_name || '').trim().slice(0, 40);
    const contact = String(body.contact || '').trim().slice(0, 60);
    const method_ = String(body.method || '').trim().slice(0, 20);
    const uid     = String(body.uid || '').trim() || null;
    const phone   = String(body.contact || '').replace(/[^0-9]/g, '').slice(0, 20) || null;
    const memo    = String(body.memo || '').trim().slice(0, 500);

    if (!payer || !student || !contact) {
      return json({ ok: false, error: 'missing_fields', message: '결제자·학생·연락처를 입력해 주세요.' }, 400);
    }
    if (!method_) {
      return json({ ok: false, error: 'missing_method', message: '결제수단을 선택해 주세요.' }, 400);
    }

    /* 🔒 (2026-07-30) 비로그인 결제 차단 — 제보 #1. create-order 와 동일한 이유·동일한 방식.
       'other'(맞춤 상담)도 실제 금액이 찍힌 payment_orders 행이 만들어지므로 예외 없이 로그인 요구. */
    const authUid = await authUidOrAdminSession(request, url, env, body);
    if (!authUid) {
      return json({ ok: false, error: 'auth_required', message: '로그인 후 접수할 수 있습니다.' }, 401);
    }
    if (uid && authUid !== uid) {
      return json({ ok: false, error: 'uid_mismatch', message: '로그인 정보가 일치하지 않습니다. 다시 로그인해 주세요.' }, 403);
    }
    const verifiedUid2 = authUid;

    // 금액: 서버 가격표가 정본. 가격표에 없는 상담형(other) 만 입력 금액을 받는다.
    const priced = PRICES[program];
    let amount: number;
    let label: string;
    if (priced) {
      amount = priced.amount;
      label = priced.name;
    } else if (program === 'other') {
      amount = Math.floor(Number(body.amount) || 0);
      label = '맞춤 코스 (상담 후 확정)';
      if (!(amount > 0 && amount <= 10_000_000)) {
        return json({ ok: false, error: 'invalid_amount', message: '금액을 다시 확인해 주세요.' }, 400);
      }
    } else {
      // trial(무료체험)·b2b 등 결제 대상이 아닌 항목은 여기로 오면 안 된다 → 상담으로 유도.
      return json({ ok: false, error: 'not_payable', message: '이 상품은 상담으로 진행됩니다. 카카오 상담을 이용해 주세요.' }, 400);
    }

    const rnd = bytesHex(crypto.getRandomValues(new Uint8Array(6)));
    const orderId = `MGD-${Date.now().toString(36).toUpperCase()}-${rnd}`;
    try {
      await env.DB.prepare(
        `INSERT INTO payment_orders (order_id, uid, program, amount, status, method, payer_name, student_name, phone, created_at, raw)
         VALUES (?, ?, ?, ?, 'await_deposit', ?, ?, ?, ?, ?, ?)`
      ).bind(orderId, verifiedUid2, program, amount, method_, payer, student, phone, Date.now(),
             JSON.stringify({ contact, memo, source: 'home_payment_modal' }).slice(0, 2000)).run();
    } catch (e) {
      return json({ ok: false, error: 'request_create_failed', message: String((e as any)?.message || e) }, 500);
    }

    // 🔔 사장님 폰으로 '입금 확인 요청' 알림 (실패해도 접수는 성공 — best-effort)
    try {
      const alertTo = (env as any).OWNER_ALERT_PHONE;
      if (alertTo) {
        await sendPlainSms(env, alertTo,
          `[망고아이] 💰 입금 확인 요청\n${student} (결제자 ${payer})\n${label} · ${amount.toLocaleString('ko-KR')}원\n수단: ${method_}\n연락처: ${contact}\n관리자 결제센터에서 통장 대조 후 확정해 주세요.\n접수: ${orderId}`);
      }
    } catch (e: any) { console.warn('[pay] manual-request alert skipped:', e?.message || e); }

    return json({ ok: true, request_id: orderId, program_label: label, amount, status: 'await_deposit' });
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

    /* 🏦 (2026-07-30) 가상계좌 발급 성공 — 아직 입금 전.
       장지웅 부장님 Q2: 실제 계좌는 노출하지 않고, 고객마다 발급되는 정식 가상계좌로 받는다.
       가상계좌는 confirm() 이 성공해도 토스 상태가 'DONE'이 아니라 'WAITING_FOR_DEPOSIT'이다.
       이걸 위 DONE 분기가 못 잡으면 바로 아래 "실패" 분기로 떨어져 발급 성공을 결제 실패로
       오판하고 사장님께 "⚠️ 결제 실패" 문자까지 나갈 뻔했다 — 별도 분기로 반드시 갈라야 한다.
       실제 입금 확인은 여기서 하지 않는다: 입금되면 토스가 /api/pay/webhook 으로 알려주고,
       거기서 상태를 'DONE'으로 재조회해 확정 + 수강 자동활성화까지 처리한다(기존 로직 그대로). */
    if (tossRes.ok && tossJson?.status === 'WAITING_FOR_DEPOSIT') {
      await env.DB.prepare(
        `UPDATE payment_orders SET status='await_deposit', payment_key=?, raw=? WHERE order_id=?`
      ).bind(paymentKey, JSON.stringify(tossJson).slice(0, 4000), orderId).run();
      const va = tossJson?.virtualAccount || null;
      return json({
        ok: true, orderId, amount, waitingDeposit: true,
        virtualAccount: va ? {
          bankCode: va.bankCode || null,
          bank: va.bank || null,
          accountNumber: va.accountNumber || null,
          accountHolder: va.customerName || order.student_name || order.payer_name || null,
          dueDate: va.dueDate || null,
        } : null,
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
    return json({ ok: true, program, name: p.name, amount: p.amount, clientKey: tossClientKey(env).key });
  }

  /* ── 5) 결제 환경 설정 (공개) ─────────────────────────────────────────────
     GET /api/pay/config → { ok, mode, clientKey, key_mismatch }

     🔴 (2026-08-07, QA 2차 #1) 왜 신설했나.
        프론트(idx-payment-modal.js)에 클라이언트키가 **박혀 있었다**. 실결제 전환은
        「프론트 상수 1곳 + 서버 시크릿 1곳」을 사람이 각각 바꿔야 했고, 둘의 환경이 어긋나면
        (테스트 clientKey + 라이브 secret) 결제창은 열리는데 서버 confirm 이 전부 실패한다.
        돈은 안 빠지지만 학부모에게는 「결제가 안 된다」로만 보인다 — 조용하고 오래 가는 사고다.
        이제 프론트가 이 API 로 키를 받아가므로, 전환은 **시크릿 두 개 교체로 끝난다**.

     ⚠️ clientKey 는 원래 공개값이다(브라우저 결제창이 그대로 쓴다). 시크릿은 절대 내보내지
        않는다 — 여기서는 시크릿의 **접두사만** 보고 mode 를 판정해 돌려준다. */
  if (path === '/api/pay/config' && method === 'GET') {
    const mode = tossMode(env);                                  // 'live' | 'test' | 'disabled'
    const { key: clientKey, invalid: client_key_invalid } = tossClientKey(env);
    const ckLive = clientKey.startsWith('live_');
    // 클라이언트키와 시크릿키의 환경이 서로 다르면 승인이 통째로 깨진다 — 화면에서 바로 알 수 있게.
    const key_mismatch = mode !== 'disabled' && (ckLive !== (mode === 'live'));
    /* client_key_invalid = 시크릿에 «키가 아닌 값»이 들어와 테스트키로 폴백 중.
       secret_key_invalid = 같은 일이 시크릿키에서 일어남(mode 는 disabled 로 보인다).
       둘 다 사람이 붙여넣다 생기는 사고라, 화면에 «점검 필요»로 띄워 조용히 묻히지 않게 한다. */
    const rawSk = String(env.TOSS_SECRET_KEY ?? '').trim();
    const rawCk = String(env.TOSS_CLIENT_KEY ?? '').trim();
    const secret_key_invalid = !!rawSk && !isTossKeyShaped(rawSk, 'sk');
    /* 🔎 (2026-08-07) 진단값 — 「무엇이 잘못 들어갔는지」를 화면에서 바로 알 수 있게.
       키를 넣는 일이 사람 손이라 «두 칸을 서로 바꿔 넣는» 사고가 실제로 났다.
       ⚠️ 키 값 자체는 절대 내보내지 않는다. 내보내는 건 **역할(ck/sk)** 과 **접두사**뿐이고,
          접두사(`live_ck_`)는 키의 «종류»라 그 자체로는 아무것도 열 수 없다.
          그래도 시크릿키는 종류만 알려주고 접두사는 «형태»만 남긴다(값 유추 여지 0). */
    const roleOf = (v: string) => tossKeyRole(v) || (v ? 'unknown' : 'empty');
    const shapeOf = (v: string) => {
      if (!v) return 'empty';
      if (/\s/.test(v)) return 'contains_space';           // 명령어·문장이 통째로 들어온 경우
      const seg = v.split('_').slice(0, 2).join('_');
      return /^(?:test|live)_[A-Za-z0-9]+$/.test(seg) ? seg + '_…' : 'unrecognized';
    };
    return json({
      ok: true, mode, clientKey, key_mismatch, client_key_invalid, secret_key_invalid,
      diag: {
        // len = 글자 수만. 값은 안 나간다 — 길이만으로는 어떤 키도 유추할 수 없고,
        //       「잘려서 들어갔나」를 판별하는 유일한 단서라 진단에 꼭 필요하다.
        client_key: { role: roleOf(rawCk), shape: shapeOf(rawCk), len: rawCk.length },
        secret_key: { role: roleOf(rawSk), shape: shapeOf(rawSk), len: rawSk.length },
        expect: 'client_key.role=ck / secret_key.role=sk',
      },
    });
  }

  /* ── 5-2) 결제 정보 자동채움 (로그인 필요) ────────────────────────────────
     POST /api/pay/prefill { uid, token } → { ok, payer_name, student_name, contact, ... }

     🔴 (2026-08-07, QA 2차 #5) 결제 정보 입력 화면의 세 칸에 전부 로그인 아이디가 들어가 있었다.
        프론트가 세션 객체만 보고 채웠는데, 세션에는 학부모 이름도 전화번호도 없다.
        실제 값은 서버(students_erp)만 안다 → 여기서 준다.
          결제자 이름 = 학부모 이름 > 학생 이름
          연락처      = 학부모 전화 > 학생 전화
        없는 값은 **빈 문자열**로 돌려준다. 아이디로 때우지 않는다.

     🔒 IDOR 방지: 반드시 세션 토큰으로 검증된 uid(authUidFromRequest)의 것만 돌려준다.
        body 의 uid 는 참고용일 뿐 — 다른 사람 uid 를 보내도 자기 것만 나온다.
     ⚠️ 전화번호는 개인정보다. 「본인이 로그인해서 본인 결제창을 여는」 이 경로 외에는 주지 않는다. */
  if (path === '/api/pay/prefill' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const authUid = await authUidOrAdminSession(request, url, env, body);
    if (!authUid) return json({ ok: false, error: 'auth_required' }, 401);

    let stu: any = null;
    try {
      stu = await env.DB.prepare(`SELECT * FROM students_erp WHERE user_id = ? LIMIT 1`).bind(authUid).first();
    } catch (_) {}

    const s = (v: any) => String(v ?? '').trim();
    // 컬럼 구성이 배포마다 조금씩 다르다(parent_name 은 있는 곳도 없는 곳도 있다) — 있는 것만 쓴다.
    const studentName = s(stu?.student_name) || s(stu?.korean_name) || s(stu?.name) || s(stu?.username);
    const parentName  = s(stu?.parent_name) || s(stu?.guardian_name);
    const parentPhone = s(stu?.parent_phone);
    const studentPhone = s(stu?.student_phone) || s(stu?.phone);

    return json({
      ok: true,
      payer_name:   parentName || studentName,     // 학부모가 있으면 학부모, 없으면 학생
      student_name: studentName,
      contact:      parentPhone || studentPhone,   // 등록된 실제 연락처
      has_parent:   !!parentName,
      found:        !!stu,
      source:       'students_erp',
    });
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
      } catch (e) {
        // 🔇→🔊 (2026-08-09) 문자 실패로 결제 확정을 되돌리지 않는다 — 삼키는 건 옳다.
        //   다만 기록이 없으면 「보완확정이 일어난 줄 모르는」 상태가 된다. 유령결제 확인용 통지다.
        console.warn('[api-pay] 웹훅 보완확정 알림 문자 실패:', (e as any)?.message, 'order=', orderId);
      }
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
      } catch (e) {
        // 🔇→🔊 (2026-08-09) 결제 취소는 이미 DB 에 반영됐다(위 UPDATE). 문자 실패로 되돌리지 않는다.
        //   그러나 조용히 넘기면 «환불이 나갔는데 아무도 모르는» 상태가 된다.
        console.warn('[api-pay] 결제 취소 통지 문자 실패:', (e as any)?.message, 'order=', orderId);
      }
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

  // ── 9) 자동연장(정기결제) — 제보 #2-2/#3-2. 현재 수강 중인 학생만 카드를 등록해 매월 자동 청구받는다 ──
  if (path === '/api/pay/billing/register' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const authUid = await authUidOrAdminSession(request, url, env, body);
    if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
    await ensureSubscriptionsSchema(env);
    const q = await autoRenewQuote(env, authUid);
    if (!('ok' in q) || !q.ok) {
      return json({ ok: false, error: (q as any).error, message: '자동연장은 현재 요일·시간이 확실한 수강 중 학생만 신청할 수 있어요.' }, 400);
    }
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => b.toString(16).padStart(2, '0')).join('');
    const customerKey = `mgi_${authUid}_${Date.now().toString(36)}${rnd}`;
    return json({
      ok: true, customerKey, clientKey: tossClientKey(env).key,
      preview_amount: q.amount, preview_sessions: q.sessions,
      teacher_name: q.cur.teacher_name, weekly: q.weekly, minutes: q.cur.minutes,
    });
  }

  if (path === '/api/pay/billing/confirm' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const authUid = await authUidOrAdminSession(request, url, env, body);
    if (!authUid) return json({ ok: false, error: 'auth_required' }, 401);
    const authKey = String(body.authKey || '').trim();
    const customerKey = String(body.customerKey || '').trim();
    if (!authKey || !customerKey) return json({ ok: false, error: 'missing_fields' }, 400);
    // customerKey 는 register 단계에서 authUid 로 서명해 만들었다 — 다른 사람 걸 훔쳐 쓸 수 없게 접두사로 재검증.
    if (!customerKey.startsWith(`mgi_${authUid}_`)) return json({ ok: false, error: 'customer_key_mismatch' }, 403);
    await ensureSubscriptionsSchema(env);

    const q = await autoRenewQuote(env, authUid);
    if (!('ok' in q) || !q.ok) return json({ ok: false, error: (q as any).error }, 400);

    const auth = 'Basic ' + btoa(String(env.TOSS_SECRET_KEY) + ':');
    let tossRes: Response, tossJson: any;
    try {
      tossRes = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ authKey, customerKey }),
      });
      tossJson = await tossRes.json();
    } catch (e: any) {
      return json({ ok: false, error: 'toss_network_error', message: String(e?.message || e) }, 502);
    }
    if (!tossRes.ok || !tossJson.billingKey) {
      return json({ ok: false, error: 'billing_auth_failed', message: String(tossJson?.message || '카드 등록에 실패했습니다.') }, 400);
    }

    const now = Date.now();
    // 기존에 활성 구독이 있으면 정리하고(중복청구 방지) 새로 등록
    await env.DB.prepare(`UPDATE subscriptions SET status='replaced', updated_at=? WHERE user_id=? AND status='active'`).bind(now, authUid).run();
    // 🔁 (2026-08-23) 첫 청구일 = «등록 +30일» 이 아니라 «현재 수강 종료 3일 전». 남은 수업이 10일치면
    //    10-3일 뒤에 청구돼 수업이 끊기지 않고, 25일치 남았으면 그때까지 청구하지 않는다.
    const nextBillingAt = nextBillingFromLastDate(String(q.cur.last_date || ''));
    const ins = await env.DB.prepare(
      `INSERT INTO subscriptions (user_id, student_name, plan, amount, status, next_billing_at, created_at, updated_at, billing_key, customer_key, fail_count, teacher_id, weekly, minutes)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    ).bind(authUid, q.cur.teacher_name ? String(q.cur.teacher_name) : authUid, 'auto_renew', q.amount,
           nextBillingAt, now, now, String(tossJson.billingKey), customerKey,
           String(q.cur.teacher_id), q.weekly, q.cur.minutes).run();

    return json({ ok: true, id: ins.meta.last_row_id, next_billing_at: nextBillingAt, amount: q.amount });
  }

  if (path === '/api/pay/billing/cancel' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const authUid = await authUidOrAdminSession(request, url, env, body);
    if (!authUid) return json({ ok: false, error: 'auth_required' }, 401);
    await ensureSubscriptionsSchema(env);
    await env.DB.prepare(`UPDATE subscriptions SET status='cancelled', updated_at=? WHERE user_id=? AND status='active'`).bind(Date.now(), authUid).run();
    return json({ ok: true });
  }

  /* ♾️→💳 (2026-08-23) 등록된 카드로 «결제창 없이» 즉시 결제 — 사장님 지시 「자동결제이면 그냥 자동으로
     결제되는 방식으로」. 자동결제 학생의 연장 버튼과 카드등록 직후 «지금 바로 결제» 가 이걸 쓴다.
     1·3·6·12개월 전부 지원(기간할인은 enrollQuoteCalc 가 동일 적용). 사람이 버튼을 눌러 시작하는
     결제라 cron 킬스위치(billing:auto_renew_live)와는 무관하다 — 수동 「연장 결제」와 같은 급의 동의. */
  if (path === '/api/pay/billing/charge-now' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const authUid = await authUidOrAdminSession(request, url, env, body);
    if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
    const months = Number(body.months || 1);
    if (![1, 3, 6, 12].includes(months)) return json({ ok: false, error: 'bad_months' }, 400);
    await ensureSubscriptionsSchema(env);
    const sub: any = await env.DB.prepare(
      `SELECT * FROM subscriptions WHERE user_id=? AND status='active' AND billing_key IS NOT NULL ORDER BY id DESC LIMIT 1`
    ).bind(authUid).first();
    if (!sub) return json({ ok: false, error: 'no_subscription', message: '먼저 자동결제 카드를 등록해 주세요.' }, 400);
    // 🛡️ 더블클릭·새로고침 연타 방어 — 직전 청구 60초 안에는 다시 청구하지 않는다(이중결제 예방)
    if (Number(sub.last_billed_at || 0) > Date.now() - 60 * 1000) {
      return json({ ok: false, error: 'too_soon', message: '방금 결제가 진행됐어요. 잠시 후 결제 내역을 확인해 주세요.' }, 429);
    }
    const r = await chargeSubscriptionOnce(env, sub, months);
    /* 🛡️ «이미 청구 중» 은 실패가 아니다. 더블클릭이면 두 요청이 60초 가드를 나란히 통과한 뒤
       하나만 선점하는데, 진 쪽에 「결제에 실패했어요」라고 말하면 학부모가 **다시 누른다** —
       60초가 지난 뒤라면 그때는 진짜 두 번째 청구가 된다. 이중청구를 막으려 넣은 장치가
       사람을 통해 이중청구로 되돌아오는 모양이라, 문구와 상태코드를 갈라 둔다. */
    if (!r.ok && (r.error === 'already_charging' || r.error === 'claim_failed')) {
      return json({ ok: false, error: r.error,
        message: '결제를 이미 처리하고 있어요. 잠시 후 결제 내역을 확인해 주세요.' }, 409);
    }
    if (!r.ok) return json({ ok: false, error: r.error, message: '결제에 실패했어요: ' + String(r.error || '') }, 400);
    return json({ ok: true, amount: r.amount, months });
  }

  if (path === '/api/pay/billing/status' && method === 'GET') {
    const authUid = await authUidOrAdminSession(request, url, env, {});
    if (!authUid) return json({ ok: false, error: 'auth_required' }, 401);
    await ensureSubscriptionsSchema(env);
    const sub: any = await env.DB.prepare(
      `SELECT id, plan, amount, status, next_billing_at, teacher_id, weekly, minutes FROM subscriptions WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1`
    ).bind(authUid).first();
    return json({ ok: true, subscription: sub || null });
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
  // ♾️ (2026-08-23) 수동 연장(결제창)이 자동결제와 겹치지 않게 — 결제로 수업이 늘었으면
  //    다음 자동청구일도 «새 종료일 3일 전» 으로 다시 잡는다. 미리 3개월을 결제한 학생에게
  //    옛 청구일 그대로 한 달치를 또 청구하는 사고를 막는 줄이다. 구독 없는 학생은 그냥 지나간다.
  await syncSubscriptionNextBilling(env, order.uid).catch(() => {});
}

/** ♾️ uid 의 활성 구독이 있으면 next_billing_at 을 현재 수강 종료일 기준으로 재계산해 맞춘다 */
async function syncSubscriptionNextBilling(env: any, uid: any): Promise<void> {
  if (!uid) return;
  const sub: any = await env.DB.prepare(
    `SELECT id FROM subscriptions WHERE user_id=? AND status='active' AND billing_key IS NOT NULL ORDER BY id DESC LIMIT 1`
  ).bind(String(uid)).first();
  if (!sub) return;
  const cur = await currentEnrollment(env, String(uid));
  if (!cur?.renewable || !cur.last_date) return;
  await env.DB.prepare(`UPDATE subscriptions SET next_billing_at=?, updated_at=? WHERE id=?`)
    .bind(nextBillingFromLastDate(String(cur.last_date)), Date.now(), sub.id).run();
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
