/**
 * 🏫 B2B 수업료 정산 — D1 읽기/쓰기 · API · 정산 스윕(지금은 본사 수동 실행)
 *
 * 정본 계산은 b2b-tuition.ts(순수) · 회차 상태는 session-ledger.ts(순수) + session-ledger-load.ts.
 * 이 파일은 «읽고 → 정본에 넘기고 → 결과를 적는» 일만 한다.
 *
 * 경로
 *   관리자(로그인·스코프)  /api/admin/ai-billing/tuition/*   — ai-billing.ts 라우터가 넘겨 준다
 *       (그 접두사는 src/index.ts 인증 게이트·라우팅·강사 차단·대리점 허용목록에 이미 전부 등록돼 있다
 *        — 그래서 공동 금지구역을 한 줄도 안 고친다)
 *   학원 결제 링크(로그인 없음) /api/pay/b2b/*                — api-pay.ts handlePayApi 가 넘겨 준다
 *       링크 = b2b_tuition_shops.link_token(무작위 24바이트 = 48자리 16진수). 서명 상수를 쓰지 않는다 — 저장소가 공개라
 *       코드에 박힌 폴백 비밀값으로는 링크를 위조할 수 있기 때문이다. 본사가 «새로 만들기» 로 언제든 끊는다.
 *
 * 안전장치(모두 기본 꺼짐 — 2026-10-01 현재 테스트 단계)
 *   meta.auto        = 'on' 일 때만 스윕이 차감·청구서를 만든다
 *     ⚠️ 2026-10-01 현재 이 스윕은 «cron 에 연결돼 있지 않습니다» — 본사 화면 «지금 실행» 으로만 돕니다.
 *        자동 실행은 src/index.ts(공동 금지구역) scheduled() 에 한 줄을 넣어야 하고 사람이 정할 일입니다.
 *        본사가 «지금 실행»(dry:false) 하면 force 로 돌아 auto 스위치를 건너뜁니다(화면이 그렇게 말합니다).
 *   meta.notify      = 'on' 일 때만 학원에 문자가 나간다(꺼져 있으면 «보냈을 문자» 를 기록만)
 *   meta.autopay_live= 'on' 일 때만 등록 카드로 실제 결제한다
 *   shop.enabled     = 본사가 켠 학원만 대상 · 켠 날(enabled_on) 이전 수업은 절대 차감하지 않는다
 *   shop.include_c24 = 0(기본) 이면 카페24(옛 사이트)에서 결제 중인 미러 수업은 세지 않는다(이중 청구 방지)
 */
import { json, parseJsonBody } from './api-util';
import { getScope, type Scope } from './scope';
import { hiddenExcludeCond } from './student-override';
import { sendPlainSms } from './solapi-client';
import { buildStudentLedger } from './session-ledger-load';
import { LEDGER_STATES, type LedgerState } from './session-ledger';
import { enrollAdminHqOnly, ENROLL_BASE_WEEKLY1 } from './enroll-ops';
import { SITE_ORIGIN } from './site-url';
import { ensureScheduleChangeRequestTable } from './student-schedule-request';
import {
  sessionUnitPrice, chargeFor, computeInvoice, balanceAlert, reminderStepToday, reminderText, overdueLevel,
  dueDateOf, diagnoseCounts, parseTheirCounts, postponeIsFree, monthAdd, isValidMonth, addDays,
  ISSUE_DAY, LOW_BALANCE_LOOKAHEAD_DAYS, type StudentPlan, type PendingPostpone, type ReminderStep,
} from './b2b-tuition';

type Env = any;
const KST = 9 * 3600 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');
export function kstToday(now = Date.now()): string {
  const k = new Date(now + KST);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}
const err = (m: string, s = 400) => json({ ok: false, error: m }, s);
async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch (e: any) { console.warn('[b2b-tuition]', e?.message || e); return fb; } }

// ───────────────────────── 스키마 ─────────────────────────
let _schemaOk: WeakMap<object, Promise<void>> = new WeakMap();
export function ensureTuitionSchema(env: Env): Promise<void> {
  const db = env.DB;
  if (_schemaOk.has(db)) return _schemaOk.get(db)!;
  const p = (async () => {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS b2b_tuition_meta (k TEXT PRIMARY KEY, v TEXT, at INTEGER)`,
      `CREATE TABLE IF NOT EXISTS b2b_tuition_shops (shop_name TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, enabled_on TEXT, include_c24 INTEGER NOT NULL DEFAULT 0, phone TEXT, link_token TEXT, autopay INTEGER NOT NULL DEFAULT 0, updated_by TEXT, updated_at INTEGER)`,
      `CREATE TABLE IF NOT EXISTS b2b_tuition_students (shop_name TEXT NOT NULL, uid TEXT NOT NULL, excluded INTEGER NOT NULL DEFAULT 1, reason TEXT, updated_by TEXT, updated_at INTEGER, PRIMARY KEY (shop_name, uid))`,
      `CREATE TABLE IF NOT EXISTS b2b_tuition_charges (uid TEXT NOT NULL, schedule_id INTEGER NOT NULL, date TEXT NOT NULL, shop_name TEXT NOT NULL, state TEXT, unit_krw INTEGER, charge_krw INTEGER NOT NULL DEFAULT 0, hold TEXT, updated_at INTEGER, PRIMARY KEY (uid, schedule_id, date))`,
      `CREATE TABLE IF NOT EXISTS b2b_wallet_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_name TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, memo TEXT, ref TEXT UNIQUE, created_by TEXT, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS b2b_tuition_invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_name TEXT NOT NULL, kind TEXT NOT NULL, month TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'issued', due_krw INTEGER NOT NULL DEFAULT 0, paid_krw INTEGER NOT NULL DEFAULT 0, first_month INTEGER NOT NULL DEFAULT 0, issued_on TEXT, calc_json TEXT, reminders TEXT DEFAULT '', order_id TEXT, paid_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER, UNIQUE (shop_name, kind, month, seq))`,
      `CREATE TABLE IF NOT EXISTS b2b_tuition_disputes (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_name TEXT NOT NULL, month TEXT, message TEXT, diagnose_json TEXT, status TEXT NOT NULL DEFAULT 'open', assignee TEXT, answer TEXT, answered_by TEXT, created_at INTEGER NOT NULL, answered_at INTEGER)`,
      `CREATE TABLE IF NOT EXISTS b2b_tuition_autopay (shop_name TEXT PRIMARY KEY, customer_key TEXT, billing_key TEXT, card_label TEXT, active INTEGER NOT NULL DEFAULT 0, registered_at INTEGER, last_charge_at INTEGER, fail_count INTEGER NOT NULL DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS b2b_tuition_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, day TEXT, action TEXT NOT NULL, shop_name TEXT, detail TEXT)`,
    ];
    for (const s of stmts) { try { await db.exec(s); } catch (e: any) { console.warn('[b2b-tuition] schema', e?.message); } }
    for (const s of [
      `CREATE INDEX IF NOT EXISTS idx_b2b_charges_shop ON b2b_tuition_charges(shop_name)`,
      `CREATE INDEX IF NOT EXISTS idx_b2b_wallet_shop ON b2b_wallet_entries(shop_name)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_b2b_shops_token ON b2b_tuition_shops(link_token)`,
    ]) { try { await db.exec(s); } catch { /* 있음 */ } }
  })();
  _schemaOk.set(db, p);
  return p;
}

export const SWITCHES = ['auto', 'notify', 'autopay_live'] as const;
export type SwitchKey = typeof SWITCHES[number];
export async function getSwitch(env: Env, k: SwitchKey): Promise<boolean> {
  // ⛔ 못 읽으면 «꺼짐» — 돈·문자가 걸린 스위치라 막는 쪽으로 실패한다
  return safe(async () => {
    const r: any = await env.DB.prepare(`SELECT v FROM b2b_tuition_meta WHERE k = ?`).bind(k).first();
    return String(r?.v || '') === 'on';
  }, false);
}
async function setMeta(env: Env, k: string, v: string): Promise<boolean> {
  return safe(async () => {
    await env.DB.prepare(`INSERT INTO b2b_tuition_meta (k, v, at) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at`).bind(k, v, Date.now()).run();
    return true;
  }, false);
}
async function logAction(env: Env, action: string, shop: string | null, detail: any): Promise<void> {
  await safe(async () => {
    await env.DB.prepare(`INSERT INTO b2b_tuition_log (at, day, action, shop_name, detail) VALUES (?,?,?,?,?)`)
      .bind(Date.now(), kstToday(), action, shop, typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 2000)).run();
    return true;
  }, false);
}

// ───────────────────────── 학원·학생 ─────────────────────────
export async function shopRow(env: Env, shop: string): Promise<any | null> {
  return safe(async () => (await env.DB.prepare(`SELECT * FROM b2b_tuition_shops WHERE shop_name = ?`).bind(shop).first()) || null, null);
}

/** 학원 주1회(=월4회) 단가. 본사가 안 정했으면 수강신청과 같은 기본값 + is_default */
export async function weekly1For(env: Env, shop: string): Promise<{ price: number; is_default: boolean }> {
  const p: any = await safe(async () => await env.DB.prepare(`SELECT weekly1_price FROM agency_pricing WHERE shop_name = ? LIMIT 1`).bind(shop).first(), null);
  const n = Number(p?.weekly1_price);
  if (Number.isFinite(n) && n > 0) return { price: n, is_default: false };
  return { price: ENROLL_BASE_WEEKLY1, is_default: true };
}

/** 학원 소속 + 화상수업 예약이 있는 학생. 못 읽으면 null(빈 목록과 다르다). */
export async function shopStudents(env: Env, shop: string): Promise<Array<{ uid: string; name: string }> | null> {
  const hide = await safe(async () => await hiddenExcludeCond(env, 'e'), '');
  return safe(async () => {
    const rs = await env.DB.prepare(`
      SELECT cs.user_id AS uid, MAX(COALESCE(NULLIF(TRIM(e.korean_name),''), NULLIF(TRIM(cs.student_name),''), '')) AS name
        FROM class_schedules cs JOIN students_erp e ON e.user_id = cs.user_id
       WHERE e.shop_name = ? AND COALESCE(cs.status,'active') != 'cancelled'
         AND LOWER(COALESCE(cs.user_id,'')) NOT IN ('lms','type_seed') ${hide ? ' AND ' + hide : ''}
       GROUP BY cs.user_id ORDER BY name`).bind(shop).all();
    // ⛔ 이름 칸에 아이디가 들어 있는 행이 있다(카페24에 이름이 없는 계정) — 그대로 내보내면 학원 링크로
    //    학생 «아이디» 가 샌다(이 서비스에서 아이디 = 로그인 수단). 아이디와 같으면 이름 모름으로 둔다.
    return ((rs?.results || []) as any[]).map(r => {
      const uid = String(r.uid), nm = String(r.name || '').trim();
      return { uid, name: nm && nm.toLowerCase() !== uid.toLowerCase() ? nm : '(이름 미등록)' };
    });
  }, null as any);
}

async function exclusions(env: Env, shop: string): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const rs: any[] = await safe(async () => ((await env.DB.prepare(`SELECT uid, reason FROM b2b_tuition_students WHERE shop_name = ? AND excluded = 1`).bind(shop).all())?.results || []) as any[], []);
  for (const r of rs) m.set(String(r.uid), String(r.reason || '본사가 제외'));
  return m;
}

/** 이 회차를 «이 학원 청구» 로 셀까 — 카페24 미러 수업은 기본 제외(옛 사이트에서 결제 중) */
export function countsForShop(item: { source?: string | null }, includeC24: boolean): boolean {
  const src = String(item?.source || '');
  if (!includeC24 && src.startsWith('c24-mirror')) return false;
  return true;
}

// ───────────────────────── 원장 → 차감 ─────────────────────────
async function pendingPostpones(env: Env, scheduleIds: number[]): Promise<Map<string, PendingPostpone>> {
  const m = new Map<string, PendingPostpone>();
  if (!scheduleIds.length) return m;
  const rs: any[] = await safe(async () => ((await env.DB.prepare(
    `SELECT schedule_id, orig_date, fee_type, minutes_before, request_type FROM schedule_change_requests
      WHERE status = 'pending' AND instr(?, ',' || CAST(schedule_id AS TEXT) || ',') > 0`
  ).bind(',' + scheduleIds.join(',') + ',').all())?.results || []) as any[], []);
  for (const r of rs) m.set(`${r.schedule_id}|${String(r.orig_date || '').slice(0, 10)}`, r);
  return m;
}

export interface ShopMonthState {
  ok: boolean;
  error?: string;
  students: Array<{ uid: string; name: string; excluded: string | null; items: any[]; warnings: string[] }>;
  unit: { price: number; is_default: boolean };
  ym?: string;
}

/** 한 학원·한 달의 학생별 회차 원장(+ 회당 단가 · 차감 판정). */
export async function shopMonth(env: Env, shop: string, ym: string, now = Date.now()): Promise<ShopMonthState> {
  const unit = await weekly1For(env, shop);
  const roster = await shopStudents(env, shop);
  if (!roster) return { ok: false, error: 'roster_read_failed', students: [], unit };
  const sh = await shopRow(env, shop);
  const includeC24 = !!(sh && Number(sh.include_c24) === 1);
  const ex = await exclusions(env, shop);
  const out: ShopMonthState['students'] = [];
  const allIds: number[] = [];
  for (const s of roster) {
    const L: any = await buildStudentLedger(env, s.uid, ym, now);
    if (!L || !L.ok) { out.push({ uid: s.uid, name: s.name, excluded: ex.get(s.uid) || null, items: [], warnings: ['ledger_failed'] }); continue; }
    const items = (L.items || []).filter((i: any) => countsForShop(i, includeC24)).map((i: any) => ({
      ...i, unit_krw: sessionUnitPrice(unit.price, i.duration_min),
    }));
    for (const i of items) if (allIds.indexOf(i.schedule_id) < 0) allIds.push(i.schedule_id);
    out.push({ uid: s.uid, name: s.name, excluded: ex.get(s.uid) || null, items, warnings: L.warnings || [] });
  }
  const pend = await pendingPostpones(env, allIds);
  for (const s of out) for (const i of s.items) {
    const p = pend.get(`${i.schedule_id}|${i.date}`) || null;
    i.pending_postpone = p ? { minutes_before: p.minutes_before ?? null, fee_type: p.fee_type ?? null } : null;
    const c = chargeFor(i.state as LedgerState, i.unit_krw, p);
    i.charge_krw = c.charge; i.hold = c.hold;
  }
  return { ok: true, students: out, unit, ym };
}

/** 차감 동기화 — 켠 날 이후 «지난» 회차만. 바뀐 행만 고친다(멱등). 상태가 나중에 바뀌면 금액도 따라간다. */
export async function syncCharges(env: Env, shop: string, st: ShopMonthState, enabledOn: string, dry: boolean, now = Date.now()):
  Promise<{ changed: number; charged_krw: number; held: number }> {
  let changed = 0, chargedKrw = 0, held = 0;
  const cur: any[] = await safe(async () => ((await env.DB.prepare(`SELECT uid, schedule_id, date, charge_krw, state FROM b2b_tuition_charges WHERE shop_name = ?`).bind(shop).all())?.results || []) as any[], []);
  const prev = new Map<string, any>();
  for (const r of cur) prev.set(`${r.uid}|${r.schedule_id}|${r.date}`, r);
  const seen = new Set<string>();
  for (const s of st.students) {
    for (const i of s.items) {
      if (i.state === 'upcoming' || !enabledOn || i.date < enabledOn) continue;
      const amount = s.excluded ? 0 : (i.charge_krw || 0);
      if (i.hold) held++;
      chargedKrw += amount;
      const k = `${s.uid}|${i.schedule_id}|${i.date}`;
      seen.add(k);
      const p = prev.get(k);
      if (p && Number(p.charge_krw) === amount && String(p.state) === String(i.state)) continue;
      changed++;
      if (dry) continue;
      await safe(async () => {
        await env.DB.prepare(`INSERT INTO b2b_tuition_charges (uid, schedule_id, date, shop_name, state, unit_krw, charge_krw, hold, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(uid, schedule_id, date) DO UPDATE SET shop_name=excluded.shop_name, state=excluded.state,
          unit_krw=excluded.unit_krw, charge_krw=excluded.charge_krw, hold=excluded.hold, updated_at=excluded.updated_at`)
          .bind(s.uid, i.schedule_id, i.date, shop, i.state, i.unit_krw, amount, i.hold || (s.excluded ? 'excluded' : null), now).run();
        return true;
      }, false);
    }
  }
  // 이미 뺐는데 원장에서 사라진 회차 → 0 으로 되돌리는 경우는 «둘» 뿐이다(정확히 아는 것만):
  //   ① 날짜 지정 수업(scheduled_date)이 취소됨 — 그 하루를 취소한 것이 분명하다
  //   ② 카페24 미러 수업인데 이 학원은 카페24 수업을 안 세기로 바꿈(include_c24 = 0)
  //   ⛔ 반복 수업 행이 취소된 경우는 안 되돌린다 — 학생이 그만둬 «앞으로» 를 끊은 것인데, 원장은 그 행의
  //      지난 회차까지 함께 숨긴다. 그대로 되돌리면 이미 한 수업이 공짜가 된다.
  //   ⛔ 행이 아예 없는(지워진) 경우도 «모름» 이라 그대로 둔다.
  if (st.ym) {
    const orphans = cur.filter(r => !seen.has(`${r.uid}|${r.schedule_id}|${r.date}`) && String(r.date).slice(0, 7) === st.ym
      && !(Number(r.charge_krw) === 0 && String(r.state) === 'gone'));
    const ids = [...new Set(orphans.map(r => Number(r.schedule_id)))];
    const info = new Map<number, any>();
    if (ids.length) {
      const rs: any[] = await safe(async () => ((await env.DB.prepare(`SELECT id, status, scheduled_date, source FROM class_schedules WHERE instr(?, ',' || CAST(id AS TEXT) || ',') > 0`)
        .bind(',' + ids.join(',') + ',').all())?.results || []) as any[], []);
      for (const r of rs) info.set(Number(r.id), r);
    }
    const sh = await shopRow(env, shop);
    const includeC24 = !!(sh && Number(sh.include_c24) === 1);
    for (const r of orphans) {
      const row = info.get(Number(r.schedule_id));
      if (!row) continue;
      const datedCancelled = String(row.status || '').toLowerCase() === 'cancelled' && String(row.scheduled_date || '').trim() !== '';
      const c24Off = !includeC24 && String(row.source || '').startsWith('c24-mirror');
      if (!datedCancelled && !c24Off) continue;
      changed++;
      if (dry) continue;
      await safe(async () => {
        await env.DB.prepare(`UPDATE b2b_tuition_charges SET state='gone', charge_krw=0, hold=?, updated_at=? WHERE uid=? AND schedule_id=? AND date=? AND shop_name=?`)
          .bind(datedCancelled ? 'cancelled' : 'c24_excluded', now, r.uid, r.schedule_id, r.date, shop).run();
        return true;
      }, false);
    }
  }
  return { changed, charged_krw: chargedKrw, held };
}

/** 충전금 잔액 = 들어온 돈(결제·입금·조정) − 차감 합계. 못 읽으면 null. */
export async function walletBalance(env: Env, shop: string): Promise<{ balance: number; in_krw: number; out_krw: number } | null> {
  return safe(async () => {
    const a: any = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM b2b_wallet_entries WHERE shop_name = ?`).bind(shop).first();
    const b: any = await env.DB.prepare(`SELECT COALESCE(SUM(charge_krw),0) AS s FROM b2b_tuition_charges WHERE shop_name = ?`).bind(shop).first();
    const inK = Number(a?.s) || 0, outK = Number(b?.s) || 0;
    return { balance: inK - outK, in_krw: inK, out_krw: outK };
  }, null as any);
}

/** 원장 상태 → 청구 계획(StudentPlan). 휴원·공휴일·연기된 날은 다음 달 수업으로 세지 않는다. */
export function plansFrom(st: ShopMonthState, opts: { fromYmd?: string; onlyUpcoming?: boolean } = {}): StudentPlan[] {
  return st.students.map(s => ({
    uid: s.uid, name: s.name, excluded: s.excluded,
    sessions: s.items
      .filter((i: any) => (!opts.onlyUpcoming || i.state === 'upcoming') && !i.on_leave && !i.holiday
        && String(i.state) !== 'postponed' && (!opts.fromYmd || i.date >= opts.fromYmd))
      .map((i: any) => ({ date: i.date, start: i.start, minutes: Number(i.duration_min) || 20, unit: i.unit_krw, schedule_id: i.schedule_id })),
  }));
}
function sumPlans(plans: StudentPlan[]): number {
  let t = 0;
  for (const p of plans) if (!p.excluded) for (const s of p.sessions) if (s.unit && s.unit > 0) t += s.unit;
  return t;
}

// ───────────────────────── 청구서 ─────────────────────────
async function openInvoices(env: Env, shop: string): Promise<any[]> {
  return safe(async () => ((await env.DB.prepare(`SELECT * FROM b2b_tuition_invoices WHERE shop_name = ? AND status IN ('issued','partial') ORDER BY id`).bind(shop).all())?.results || []) as any[], []);
}

async function upsertInvoice(env: Env, shop: string, kind: 'monthly' | 'topup', month: string, calc: any, firstMonth: boolean, today: string, dry: boolean):
  Promise<{ action: 'created' | 'refreshed' | 'unchanged' | 'skipped' | 'voided'; id?: number; due: number }> {
  const rows: any[] = await safe(async () => ((await env.DB.prepare(`SELECT * FROM b2b_tuition_invoices WHERE shop_name = ? AND kind = ? AND month = ? ORDER BY seq DESC`).bind(shop, kind, month).all())?.results || []) as any[], []);
  const last = rows[0];
  if (last && (last.status === 'issued' || last.status === 'partial')) {
    // 한 푼이라도 들어온 청구서는 금액을 바꾸지 않는다(학원이 본 금액과 갈리면 안 된다)
    // 정기 청구서는 «발행한 금액 그대로» 둔다 — 20일에 문자로 알린 금액이 날마다 출렁이면 학원이 헷갈린다.
    //   그 뒤 생긴 차이(결석·강사 결석·새 학생)는 충전금 잔액에 그대로 남아 «다음 달» 청구서 ②가 정산한다.
    //   본사가 «취소» 하면 다음 실행이 새로 계산해 다시 만든다(아래 void 분기).
    if (kind === 'monthly' || Number(last.paid_krw) > 0 || Number(last.due_krw) === calc.due_krw) return { action: 'unchanged', id: last.id, due: Number(last.due_krw) };
    // 낼 돈이 없어졌으면(학생이 빠짐·입금이 먼저 들어옴) 한 푼도 안 들어온 청구서는 스스로 거둔다
    if (!(calc.due_krw > 0)) {
      if (!dry) await safe(async () => { await env.DB.prepare(`UPDATE b2b_tuition_invoices SET status='void', updated_at=? WHERE id=? AND paid_krw = 0`).bind(Date.now(), last.id).run(); return true; }, false);
      return { action: 'voided', id: last.id, due: 0 };
    }
    if (!dry) await safe(async () => { await env.DB.prepare(`UPDATE b2b_tuition_invoices SET due_krw=?, calc_json=?, updated_at=? WHERE id=? AND paid_krw = 0`).bind(calc.due_krw, JSON.stringify(calc), Date.now(), last.id).run(); return true; }, false);
    return { action: 'refreshed', id: last.id, due: calc.due_krw };
  }
  if (kind === 'monthly' && last && last.status !== 'void') return { action: 'skipped', id: last.id, due: 0 };   // 그 달 정기 청구서는 하나(취소된 것만 다시 만든다)
  if (!(calc.due_krw > 0)) return { action: 'skipped', due: 0 };                          // 낼 돈이 없으면 안 만든다
  const seq = last ? Number(last.seq) + 1 : 1;
  if (dry) return { action: 'created', due: calc.due_krw };
  const r: any = await safe(async () => await env.DB.prepare(`INSERT INTO b2b_tuition_invoices (shop_name, kind, month, seq, status, due_krw, paid_krw, first_month, issued_on, calc_json, reminders, created_at, updated_at)
    VALUES (?,?,?,?, 'issued', ?, 0, ?, ?, ?, '', ?, ?)`).bind(shop, kind, month, seq, calc.due_krw, firstMonth ? 1 : 0, today, JSON.stringify(calc), Date.now(), Date.now()).run(), null);
  return { action: 'created', id: r?.meta?.last_row_id, due: calc.due_krw };
}

/** 학원 하나의 «지금 상태» — 화면·스윕이 같은 계산을 쓴다. */
export async function shopSnapshot(env: Env, shop: string, now = Date.now()) {
  const today = kstToday(now);
  const ym = today.slice(0, 7);
  const sh = await shopRow(env, shop);
  const cur = await shopMonth(env, shop, ym, now);
  const next = await shopMonth(env, shop, monthAdd(ym, 1), now);
  const wallet = await walletBalance(env, shop);
  const enabledOn = String(sh?.enabled_on || '');
  const committedPlans = plansFrom(cur, { onlyUpcoming: true, fromYmd: enabledOn || undefined });
  const committed = sumPlans(committedPlans);
  const lookEnd = addDays(today, LOW_BALANCE_LOOKAHEAD_DAYS);
  let upcoming14 = 0;
  for (const st of [cur, next]) for (const p of plansFrom(st, { onlyUpcoming: true })) if (!p.excluded) for (const s of p.sessions) if (s.date <= lookEnd && s.unit) upcoming14 += s.unit;
  return { today, ym, shop: sh, cur, next, wallet, committed, committedPlans, upcoming14,
    alert: wallet ? balanceAlert(wallet.balance, upcoming14) : 'ok' as const };
}

/**
 * 다음 달 정기 청구서 계산.
 *   ⚠️ 아직 안 낸 «보충 청구서» 금액은 «낸 셈» 으로 잔액에 더한다 — 이번 달 모자란 돈은 보충 청구서가
 *      이미 받고 있으므로, 여기서 또 «모자란 금액» 으로 더하면 같은 돈을 두 번 청구한다.
 */
export function nextMonthlyCalc(snap: any, openTopupOwed = 0): any {
  return computeInvoice({
    kind: 'monthly', month: monthAdd(snap.ym, 1), students: plansFrom(snap.next).filter(p => p.sessions.length > 0),
    balanceKrw: (snap.wallet ? snap.wallet.balance : 0) + Math.max(0, Number(openTopupOwed) || 0), committedKrw: snap.committed,
  });
}
export async function openTopupOwed(env: Env, shop: string, ym: string): Promise<number> {
  const r: any = await safe(async () => await env.DB.prepare(`SELECT COALESCE(SUM(due_krw - paid_krw),0) AS s FROM b2b_tuition_invoices WHERE shop_name = ? AND kind='topup' AND month = ? AND status IN ('issued','partial')`).bind(shop, ym).first(), null);
  return Math.max(0, Number(r?.s) || 0);
}
/** 같은 달 «정기 청구서» 의 아직 안 낸 금액 — 보충 청구서가 같은 돈을 두 번 청구하지 않게 한다 */
export async function openMonthlyOwed(env: Env, shop: string, ym: string): Promise<number> {
  const r: any = await safe(async () => await env.DB.prepare(`SELECT COALESCE(SUM(due_krw - paid_krw),0) AS s FROM b2b_tuition_invoices WHERE shop_name = ? AND kind='monthly' AND month = ? AND status IN ('issued','partial')`).bind(shop, ym).first(), null);
  return Math.max(0, Number(r?.s) || 0);
}
/**
 * 이번 달 보충 청구서 계산.
 *   ⚠️ 같은 달 정기 청구서(20일 발행)가 아직 안 낸 상태면 그 금액을 «낸 셈» 으로 잔액에 더한다 —
 *      1일이 되면 그 달 수업 전체가 «이번 달 남은 수업» 이 되는데, 그 돈은 정기 청구서가 이미 받고 있다.
 *      안 더하면 같은 돈이 두 장의 청구서로 나가고, 자동결제면 같은 날(1일) 카드가 두 번 긁힌다.
 *      (반대 방향 — nextMonthlyCalc 의 openTopupOwed — 와 짝)
 */
export function topupCalc(snap: any, newNames: string[] = [], openMonthly = 0): any {
  return computeInvoice({
    kind: 'topup', month: snap.ym, students: [], balanceKrw: (snap.wallet ? snap.wallet.balance : 0) + Math.max(0, Number(openMonthly) || 0),
    committedKrw: snap.committed, newStudents: newNames,
  });
}

// ───────────────────────── 문자 ─────────────────────────
async function shopPhone(env: Env, shop: string, sh: any): Promise<string> {
  const own = String(sh?.phone || '').replace(/[^0-9]/g, '');
  if (own.length >= 10) return own;
  const c: any = await safe(async () => await env.DB.prepare(`SELECT phone FROM centers WHERE name = ? AND phone IS NOT NULL AND TRIM(phone) <> '' LIMIT 2`).bind(shop).all(), null);
  const list = ((c?.results || []) as any[]).map(r => String(r.phone || '').replace(/[^0-9]/g, '')).filter(p => p.length >= 10);
  // 같은 이름 대리점이 둘 이상이고 번호가 다르면 고르지 않는다(남의 학원에 문자가 가면 안 된다)
  if (list.length === 1 || (list.length > 1 && list.every(p => p === list[0]))) return list[0];
  return '';
}
export function payLink(token: string): string { return `${SITE_ORIGIN}/b2b-pay.html?t=${encodeURIComponent(token)}`; }

async function ensureToken(env: Env, shop: string): Promise<string | null> {
  const sh = await shopRow(env, shop);
  if (sh?.link_token) return String(sh.link_token);
  const b = new Uint8Array(24); crypto.getRandomValues(b);
  const tok = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  const ok = await safe(async () => {
    await env.DB.prepare(`INSERT INTO b2b_tuition_shops (shop_name, link_token, updated_at) VALUES (?,?,?)
      ON CONFLICT(shop_name) DO UPDATE SET link_token = COALESCE(b2b_tuition_shops.link_token, excluded.link_token)`).bind(shop, tok, Date.now()).run();
    return true;
  }, false);
  if (!ok) return null;
  const again = await shopRow(env, shop);
  return again?.link_token ? String(again.link_token) : null;
}

// ───────────────────────── 정산 스윕 (cron 미연결 — 본사 «지금 실행») ─────────────────────────
/**
 * 학원마다(지금은 본사 «지금 실행» 으로만 — cron 연결 전. 연결되면 하루 한 번 KST 10:00 을 가정)
 *   1) 지난 회차 차감 동기화  2) 잔액 부족이면 보충 청구서  3) 20일 이후면 다음 달 청구서
 *   4) 오늘 보낼 문자(20일 발행 · D-7 · D-day · D+14 · D+21)  5) 등록 카드 자동결제(D-day)
 * dry=true 면 아무것도 쓰지 않고 «무엇을 했을지» 만 돌려준다(본사 화면 «미리 돌려 보기»).
 */
export async function runB2bTuitionDaily(env: Env, opts: { dry?: boolean; force?: boolean; now?: number; onlyShop?: string } = {}): Promise<any> {
  await ensureTuitionSchema(env);
  const now = opts.now ?? Date.now();
  const today = kstToday(now);
  const dry = !!opts.dry;
  const auto = await getSwitch(env, 'auto');
  if (!auto && !opts.force && !dry) {
    await setMeta(env, 'last_run', JSON.stringify({ at: now, day: today, status: 'disabled' }));
    return { ok: true, status: 'disabled', day: today };
  }
  const notify = await getSwitch(env, 'notify');
  const autopayLive = await getSwitch(env, 'autopay_live');
  const shops: any[] = await safe(async () => ((await env.DB.prepare(`SELECT * FROM b2b_tuition_shops WHERE enabled = 1 ${opts.onlyShop ? 'AND shop_name = ?' : ''} ORDER BY shop_name LIMIT 60`).bind(...(opts.onlyShop ? [opts.onlyShop] : [])).all())?.results || []) as any[], []);
  const report: any[] = [];
  for (const sh of shops) {
    const shop = String(sh.shop_name);
    const r: any = { shop, actions: [] as string[] };
    try {
      const enabledOn = String(sh.enabled_on || '');
      // 1) 차감 — 이번 달 + (10일까지는) 지난 달
      const snap0 = await shopSnapshot(env, shop, now);
      const c1 = await syncCharges(env, shop, snap0.cur, enabledOn, dry, now);
      let c0 = { changed: 0, charged_krw: 0, held: 0 };
      if (Number(today.slice(8, 10)) <= 10) c0 = await syncCharges(env, shop, await shopMonth(env, shop, monthAdd(snap0.ym, -1), now), enabledOn, dry, now);
      if (c1.changed || c0.changed) r.actions.push(`차감 ${c1.changed + c0.changed}건 갱신`);
      const snap = dry ? snap0 : await shopSnapshot(env, shop, now);
      r.balance = snap.wallet?.balance ?? null; r.alert = snap.alert;
      // 2) 보충 청구서 — 이번 달 남은 수업이 잔액보다 많을 때(첫 달 · 신규생 · 추가 수업)
      const firstMonth = enabledOn.slice(0, 7) === snap.ym;
      if (snap.wallet) {
        const tc = topupCalc(snap, [], await openMonthlyOwed(env, shop, snap.ym));
        const u0 = await upsertInvoice(env, shop, 'topup', snap.ym, tc, firstMonth, today, dry);
        if (u0.action === 'created' || u0.action === 'refreshed') r.actions.push(`보충 청구서 ${u0.action === 'created' ? '발행' : '금액 갱신'} ₩${u0.due.toLocaleString()}`);
        if (u0.action === 'voided') r.actions.push('보충 청구서 거둠(낼 돈 없음)');
        // 3) 다음 달 정기 청구서 — 20일부터(켠 날이 20일 이후면 그날)
        if (Number(today.slice(8, 10)) >= ISSUE_DAY) {
          const mc = nextMonthlyCalc(snap, dry && u0.action === 'created' ? u0.due : await openTopupOwed(env, shop, snap.ym));
          const u = await upsertInvoice(env, shop, 'monthly', mc.month, mc, false, today, dry);
          if (u.action === 'created' || u.action === 'refreshed') r.actions.push(`${mc.month} 청구서 ${u.action === 'created' ? '발행' : '금액 갱신'} ₩${u.due.toLocaleString()}`);
        }
      } else r.actions.push('⚠️ 잔액을 읽지 못해 청구서를 만들지 않았습니다');
      // 4) 문자 / 5) 자동결제
      const token = await ensureToken(env, shop);
      const phone = await shopPhone(env, shop, sh);
      for (const inv of await openInvoices(env, shop)) {
        const sent = String(inv.reminders || '').split(',').filter(Boolean);
        const step = reminderStepToday({ ...inv, first_month: !!inv.first_month }, today, sent);
        if (step) {
          const text = reminderText(step, inv, token ? payLink(token) : SITE_ORIGIN);
          if (!phone) r.actions.push(`📵 ${step} 문자 못 보냄(학원 번호 없음)`);
          else if (!notify || dry) r.actions.push(`✉️(미발송·스위치 꺼짐) ${step}`);
          else {
            const s = await safe(async () => await sendPlainSms(env, phone, text), { ok: false } as any);
            if (s && s.ok) {
              await safe(async () => { await env.DB.prepare(`UPDATE b2b_tuition_invoices SET reminders = ?, updated_at=? WHERE id = ?`).bind([...sent, step].join(','), Date.now(), inv.id).run(); return true; }, false);
              r.actions.push(`✉️ ${step} 문자 보냄`);
            } else r.actions.push(`❌ ${step} 문자 실패`);
          }
        }
        if (Number(sh.autopay) === 1 && (step === 'd_day' || (inv.kind === 'topup' && step === 'issued'))) {
          if (!autopayLive || dry) r.actions.push(`💳(미실행·스위치 꺼짐) 자동결제 ₩${Number(inv.due_krw).toLocaleString()}`);
          else { const a = await chargeAutopay(env, shop, inv); r.actions.push(a.ok ? `💳 자동결제 완료 ₩${a.amount.toLocaleString()}` : `❌ 자동결제 실패: ${a.error}`); }
        }
      }
    } catch (e: any) {
      r.actions.push('❌ 오류: ' + String(e?.message || e).slice(0, 200));
    }
    if (!dry && r.actions.length) await logAction(env, 'daily', shop, r.actions);
    report.push(r);
  }
  const res = { ok: true, status: dry ? 'dry_run' : 'ran', day: today, notify, autopay_live: autopayLive, shops: report.length, report };
  if (!dry) await setMeta(env, 'last_run', JSON.stringify({ at: now, day: today, status: 'ran', shops: report.length }));
  return res;
}

// ───────────────────────── 결제 ─────────────────────────
const MGT = /^MGT-(\d+)-/;
async function ensurePaymentOrders(env: Env): Promise<void> {
  try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS payment_orders (order_id TEXT PRIMARY KEY, uid TEXT, program TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', payment_key TEXT, method TEXT, payer_name TEXT, student_name TEXT, created_at INTEGER NOT NULL, paid_at INTEGER, fail_reason TEXT, raw TEXT)`); } catch { /* 있음 */ }
}
async function createOrder(env: Env, inv: any): Promise<{ ok: boolean; order_id?: string; amount?: number; order_name?: string; error?: string }> {
  const owed = Math.max(0, Number(inv.due_krw) - Number(inv.paid_krw || 0));
  if (!(owed > 0)) return { ok: false, error: 'nothing_due' };
  await ensurePaymentOrders(env);
  const b = new Uint8Array(6); crypto.getRandomValues(b);
  const orderId = `MGT-${inv.id}-${Date.now().toString(36).toUpperCase()}-${[...b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
  const name = `${inv.shop_name} ${Number(String(inv.month).slice(5, 7))}월 ${inv.kind === 'topup' ? '충전금 보충' : '수업료'}`.slice(0, 90);
  const ok = await safe(async () => {
    await env.DB.prepare(`INSERT INTO payment_orders (order_id, uid, program, amount, status, method, payer_name, student_name, created_at) VALUES (?, NULL, 'b2b_tuition', ?, 'pending', 'card', ?, ?, ?)`)
      .bind(orderId, owed, String(inv.shop_name), name, Date.now()).run();
    return true;
  }, false);
  return ok ? { ok: true, order_id: orderId, amount: owed, order_name: name } : { ok: false, error: 'order_failed' };
}

/**
 * 결제 확정(api-pay.ts activateEnrollment 의 MGT- 갈래, confirm·webhook·자동결제 공용).
 *   멱등 — 충전금 기록의 ref(주문번호) UNIQUE. 두 번 와도 한 번만 들어간다.
 *   ⚠️ 금액 검증은 api-pay.ts 가 이미 했다(주문 금액 = 토스 금액). 여기서는 그 금액만 적는다.
 */
export async function activateB2bTuitionPayment(env: Env, orderId: string, amount: number, when: number, by = 'toss'): Promise<boolean> {
  await ensureTuitionSchema(env);
  const m = MGT.exec(String(orderId || ''));
  if (!m) return false;
  const inv: any = await safe(async () => await env.DB.prepare(`SELECT * FROM b2b_tuition_invoices WHERE id = ?`).bind(Number(m[1])).first(), null);
  if (!inv) { console.warn('[b2b-tuition] 결제됐는데 청구서가 없음', orderId); return false; }
  const ins: any = await safe(async () => await env.DB.prepare(`INSERT OR IGNORE INTO b2b_wallet_entries (shop_name, kind, amount, memo, ref, created_by, created_at) VALUES (?, 'invoice_paid', ?, ?, ?, ?, ?)`)
    .bind(inv.shop_name, Math.round(amount), `${inv.month} ${inv.kind === 'topup' ? '보충' : '정기'} 청구서 #${inv.id} 결제`, orderId, by, when).run(), null);
  if (!ins || !(ins.meta?.changes > 0)) return true;   // 이미 반영됨
  const paid = Number(inv.paid_krw || 0) + Math.round(amount);
  const status = paid >= Number(inv.due_krw) ? 'paid' : 'partial';
  await safe(async () => { await env.DB.prepare(`UPDATE b2b_tuition_invoices SET paid_krw = ?, status = ?, paid_at = ?, order_id = ?, updated_at = ? WHERE id = ?`).bind(paid, status, when, orderId, Date.now(), inv.id).run(); return true; }, false);
  await logAction(env, 'paid', inv.shop_name, { invoice: inv.id, amount, status, by });
  return true;
}

// 자동결제 (토스 빌링) — 학원 카드
const TOSS_API = 'https://api.tosspayments.com/v1';
async function chargeAutopay(env: Env, shop: string, inv: any): Promise<{ ok: boolean; amount: number; error?: string }> {
  const ap: any = await safe(async () => await env.DB.prepare(`SELECT * FROM b2b_tuition_autopay WHERE shop_name = ? AND active = 1`).bind(shop).first(), null);
  if (!ap?.billing_key) return { ok: false, amount: 0, error: 'no_card' };
  if (!env.TOSS_SECRET_KEY) return { ok: false, amount: 0, error: 'pg_not_configured' };
  const o = await createOrder(env, inv);
  if (!o.ok) return { ok: false, amount: 0, error: o.error };
  const auth = 'Basic ' + btoa(String(env.TOSS_SECRET_KEY) + ':');
  try {
    const res = await fetch(`${TOSS_API}/billing/${encodeURIComponent(ap.billing_key)}`, {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerKey: ap.customer_key, amount: o.amount, orderId: o.order_id, orderName: o.order_name }),
    });
    const d: any = await res.json().catch(() => ({}));
    if (res.ok && (d.status === 'DONE' || d.status === 'PAID')) {
      await env.DB.prepare(`UPDATE payment_orders SET status='paid', payment_key=?, paid_at=? WHERE order_id=?`).bind(d.paymentKey || null, Date.now(), o.order_id).run();
      await activateB2bTuitionPayment(env, o.order_id!, o.amount!, Date.now(), 'autopay');
      await env.DB.prepare(`UPDATE b2b_tuition_autopay SET last_charge_at=?, fail_count=0 WHERE shop_name=?`).bind(Date.now(), shop).run();
      return { ok: true, amount: o.amount! };
    }
    await env.DB.prepare(`UPDATE payment_orders SET status='failed', fail_reason=? WHERE order_id=?`).bind(String(d.message || d.code || res.status).slice(0, 200), o.order_id).run();
    await env.DB.prepare(`UPDATE b2b_tuition_autopay SET fail_count = fail_count + 1 WHERE shop_name=?`).bind(shop).run();
    return { ok: false, amount: 0, error: String(d.message || d.code || 'declined') };
  } catch (e: any) { return { ok: false, amount: 0, error: String(e?.message || e) }; }
}

// ───────────────────────── 화면용 묶음 ─────────────────────────
function lite(i: any) {
  return { date: i.date, start: i.start, minutes: i.duration_min, schedule_id: i.schedule_id, state: i.state,
    label_ko: (LEDGER_STATES as any)[i.state]?.ko, label_en: (LEDGER_STATES as any)[i.state]?.en,
    deduct: !!i.deduct, unit_krw: i.unit_krw, charge_krw: i.charge_krw, hold: i.hold || null,
    on_leave: !!i.on_leave, holiday: !!i.holiday, pending_postpone: i.pending_postpone || null, start_ms: i.start_ms };
}
/** 학원이 보는 화면 묶음. ⛔ 학생 «아이디» 는 싣지 않는다(이 서비스에서 아이디 = 로그인 수단). */
export async function shopView(env: Env, shop: string, opts: { withUid?: boolean } = {}) {
  const snap = await shopSnapshot(env, shop);
  const invs: any[] = await safe(async () => ((await env.DB.prepare(`SELECT * FROM b2b_tuition_invoices WHERE shop_name = ? ORDER BY id DESC LIMIT 12`).bind(shop).all())?.results || []) as any[], []);
  const autopay: any = await safe(async () => await env.DB.prepare(`SELECT card_label, active, registered_at, last_charge_at, fail_count FROM b2b_tuition_autopay WHERE shop_name = ?`).bind(shop).first(), null);
  const pack = (st: ShopMonthState) => st.students.map((s, idx) => ({
    key: 's' + idx, ...(opts.withUid ? { uid: s.uid } : {}), name: s.name,
    // 공개 링크에는 본사가 적은 «제외 사유» 원문을 싣지 않는다(내부 메모가 샌다) — 표시만
    excluded: s.excluded ? (opts.withUid ? s.excluded : '청구 제외') : null,
    items: s.items.map(lite),
    deducted: s.items.filter((i: any) => i.charge_krw > 0).length,
    charged_krw: s.items.reduce((a: number, i: any) => a + (s.excluded ? 0 : (i.charge_krw || 0)), 0),
  }));
  const preview = snap.wallet ? nextMonthlyCalc(snap, await openTopupOwed(env, shop, snap.ym)) : null;
  if (preview && !opts.withUid) for (const l of preview.lines) { delete (l as any).uid; if ((l as any).excluded) (l as any).excluded = '청구 제외'; }
  return {
    ok: true, shop_name: shop, today: snap.today, month: snap.ym, next_month: monthAdd(snap.ym, 1),
    enabled: !!(snap.shop && Number(snap.shop.enabled) === 1), enabled_on: snap.shop?.enabled_on || null,
    include_c24: !!(snap.shop && Number(snap.shop.include_c24) === 1),
    unit: snap.cur.unit,
    wallet: snap.wallet, committed_krw: snap.committed, upcoming14_krw: snap.upcoming14, alert: snap.alert,
    current: pack(snap.cur), next: pack(snap.next),
    next_preview: preview,
    invoices: invs.map(inv => {
      let calc: any = null; try { calc = JSON.parse(inv.calc_json || 'null'); } catch { /* 깨짐 */ }
      if (calc && !opts.withUid) for (const l of (calc.lines || [])) delete l.uid;
      return { id: inv.id, kind: inv.kind, month: inv.month, seq: inv.seq, status: inv.status, due_krw: inv.due_krw, paid_krw: inv.paid_krw,
        owed_krw: Math.max(0, Number(inv.due_krw) - Number(inv.paid_krw || 0)), issued_on: inv.issued_on,
        due_date: dueDateOf(inv), overdue: overdueLevel({ ...inv, first_month: !!inv.first_month }, snap.today),
        first_month: !!inv.first_month, reminders: String(inv.reminders || '').split(',').filter(Boolean), calc };
    }),
    autopay: autopay ? { card_label: autopay.card_label, active: !!autopay.active, registered_at: autopay.registered_at, last_charge_at: autopay.last_charge_at } : null,
  };
}

async function tokenShop(env: Env, t: string): Promise<string | null> {
  const tok = String(t || '').trim();
  if (!/^[0-9a-f]{48}$/.test(tok)) return null;
  const r: any = await safe(async () => await env.DB.prepare(`SELECT shop_name, enabled FROM b2b_tuition_shops WHERE link_token = ?`).bind(tok).first(), null);
  return r && Number(r.enabled) === 1 ? String(r.shop_name) : null;
}

/** 학원이 연기 신청 — 30분 경계는 «지금» 서버 시각으로 잰다(학원이 보낸 시각은 안 믿는다). */
async function requestPostpone(env: Env, shop: string, scheduleId: number, date: string, reason: string, by: string): Promise<any> {
  const snap = await shopMonth(env, shop, date.slice(0, 7));
  let hit: any = null, who: any = null;
  for (const s of snap.students) for (const i of s.items) if (i.schedule_id === scheduleId && i.date === date) { hit = i; who = s; }
  if (!hit) return { ok: false, error: 'not_found', message: '이 학원 학생의 수업이 아닙니다.' };
  if (hit.state !== 'upcoming') return { ok: false, error: 'not_upcoming', message: '이미 지난 수업은 연기 신청할 수 없습니다.' };
  const pf = postponeIsFree(Number(hit.start_ms), Date.now());
  await safe(async () => { await ensureScheduleChangeRequestTable(env); return true; }, false);
  const dup: any = await safe(async () => await env.DB.prepare(`SELECT id FROM schedule_change_requests WHERE schedule_id = ? AND orig_date = ? AND status = 'pending' LIMIT 1`).bind(scheduleId, date).first(), null);
  if (dup) return { ok: true, already: true, free: pf.free, minutes_before: pf.minutes_before };
  const ok = await safe(async () => {
    await env.DB.prepare(`INSERT INTO schedule_change_requests (schedule_id, request_type, requester_role, requester_name, student_name, orig_date, orig_time, fee_type, minutes_before, reason, status, created_at)
      VALUES (?, 'postpone', 'agency', ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .bind(scheduleId, by, who.name, date, hit.start, pf.free ? 'free' : 'paid', pf.minutes_before, String(reason || '').slice(0, 300), Date.now()).run();
    return true;
  }, false);
  if (!ok) return { ok: false, error: 'save_failed' };
  await logAction(env, 'postpone_request', shop, { schedule_id: scheduleId, date, free: pf.free, minutes_before: pf.minutes_before });
  return { ok: true, free: pf.free, minutes_before: pf.minutes_before };
}

async function diagnose(env: Env, shop: string, month: string, text: string) {
  const st = await shopMonth(env, shop, month);
  if (!st.ok) return { ok: false, error: st.error };
  const parsed = parseTheirCounts(text, st.students.map(s => ({ uid: s.uid, name: s.name })));
  // «우리가 센 것» = 실제로 충전금에서 뺀 회차(켠 날 이후 · 보류 아님). 원장의 deduct 를 그대로 쓰면
  //   켜기 전 수업·연기 신청 보류분까지 «뺐다» 고 말하게 된다.
  const sh = await shopRow(env, shop);
  const from = String(sh?.enabled_on || '9999-12-31');
  const rows = diagnoseCounts(st.students.filter(s => !s.excluded).map(s => ({ uid: s.uid, name: s.name,
    items: s.items.map((i: any) => ({ date: i.date, state: i.hold === 'pending_postpone' ? 'postponed' : i.state,
      deduct: i.state !== 'upcoming' && i.date >= from && Number(i.charge_krw) > 0 })) })), parsed.counts);
  return { ok: true, month, rows: rows.map(r => ({ name: r.name, ours: r.ours, theirs: r.theirs, diff: r.diff, reasons_ko: r.reasons_ko, reasons_en: r.reasons_en })),
    unmatched: parsed.unmatched, mismatches: rows.filter(r => r.theirs != null && r.diff !== 0).length };
}

// ───────────────────────── 공개 라우터 (/api/pay/b2b/*) ─────────────────────────
export async function handleB2bTuitionPublic(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/pay/b2b/')) return null;
  await ensureTuitionSchema(env);
  const p = url.pathname.slice('/api/pay/b2b/'.length);
  const method = request.method.toUpperCase();
  const body: any = method === 'POST' ? (await parseJsonBody(request)) || {} : {};
  const t = String(url.searchParams.get('t') || body.t || '');
  const shop = await tokenShop(env, t);
  if (!shop) return json({ ok: false, error: 'bad_link', message: '링크가 맞지 않거나 만료되었습니다. 본사에 새 링크를 요청해 주세요.' }, 404);
  const by = `학원링크:${shop}`;

  if (p === 'view' && method === 'GET') {
    const v = await shopView(env, shop);
    const res = json(v);
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex');
    return res;
  }
  if (p === 'checkout' && method === 'POST') {
    const inv: any = await safe(async () => await env.DB.prepare(`SELECT * FROM b2b_tuition_invoices WHERE id = ? AND shop_name = ?`).bind(Number(body.invoice_id), shop).first(), null);
    if (!inv) return err('invoice_not_found', 404);
    if (inv.status === 'paid' || inv.status === 'void') return err('already_paid', 409);
    const o = await createOrder(env, inv);
    return o.ok ? json({ ok: true, order_id: o.order_id, amount: o.amount, order_name: o.order_name, customer_name: shop }) : err(o.error || 'order_failed', 500);
  }
  if (p === 'postpone' && method === 'POST') {
    const sid = Number(body.schedule_id), date = String(body.date || '');
    if (!(sid > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('bad_params');
    return json(await requestPostpone(env, shop, sid, date, String(body.reason || ''), by));
  }
  if (p === 'diagnose' && method === 'POST') {
    const month = String(body.month || '');
    if (!isValidMonth(month)) return err('bad_month');
    return json(await diagnose(env, shop, month, String(body.text || '').slice(0, 8000)));
  }
  if (p === 'dispute' && method === 'POST') {
    const msg = String(body.message || '').trim().slice(0, 2000);
    if (!msg) return err('message_required');
    // 링크가 새어 나가도 이의 신청으로 표를 채우지 못하게 — 학원당 하루 10건(사람이 쓰기엔 넉넉하다)
    const n24: any = await safe(async () => await env.DB.prepare(`SELECT COUNT(*) AS n FROM b2b_tuition_disputes WHERE shop_name = ? AND created_at > ?`).bind(shop, Date.now() - 86400000).first(), null);
    if (Number(n24?.n) >= 10) return err('too_many: 오늘은 더 접수할 수 없습니다. 본사로 전화 주세요.', 429);
    const month = isValidMonth(body.month) ? String(body.month) : kstToday().slice(0, 7);
    const dg = body.text ? await diagnose(env, shop, month, String(body.text).slice(0, 8000)) : null;
    const assignee = String((await safe(async () => ((await env.DB.prepare(`SELECT v FROM b2b_tuition_meta WHERE k='dispute_assignee'`).first()) as any)?.v, null)) || '장지웅 부장');
    const ok = await safe(async () => { await env.DB.prepare(`INSERT INTO b2b_tuition_disputes (shop_name, month, message, diagnose_json, status, assignee, created_at) VALUES (?,?,?,?, 'open', ?, ?)`).bind(shop, month, msg, dg ? JSON.stringify(dg) : null, assignee, Date.now()).run(); return true; }, false);
    if (!ok) return err('save_failed', 500);
    await logAction(env, 'dispute', shop, { month });
    return json({ ok: true, assignee });
  }
  if (p === 'autopay/register' && method === 'POST') {
    const ck = 'mgt_' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('b2b:' + shop)))].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
    return json({ ok: true, customerKey: ck });
  }
  if (p === 'autopay/confirm' && method === 'POST') {
    const authKey = String(body.authKey || ''), customerKey = String(body.customerKey || '');
    const want = 'mgt_' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('b2b:' + shop)))].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
    if (!authKey || customerKey !== want) return err('bad_customer_key', 403);
    if (!env.TOSS_SECRET_KEY) return err('pg_not_configured', 503);
    const auth = 'Basic ' + btoa(String(env.TOSS_SECRET_KEY) + ':');
    const res = await fetch(`${TOSS_API}/billing/authorizations/issue`, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ authKey, customerKey }) });
    const d: any = await res.json().catch(() => ({}));
    if (!res.ok || !d.billingKey) return err('billing_issue_failed: ' + String(d.message || res.status), 502);
    const label = [d.cardCompany || d.card?.issuerCode || '', String(d.cardNumber || d.card?.number || '').slice(-4)].filter(Boolean).join(' ');
    await env.DB.prepare(`INSERT INTO b2b_tuition_autopay (shop_name, customer_key, billing_key, card_label, active, registered_at, fail_count) VALUES (?,?,?,?,1,?,0)
      ON CONFLICT(shop_name) DO UPDATE SET customer_key=excluded.customer_key, billing_key=excluded.billing_key, card_label=excluded.card_label, active=1, registered_at=excluded.registered_at, fail_count=0`).bind(shop, customerKey, d.billingKey, label, Date.now()).run();
    await env.DB.prepare(`UPDATE b2b_tuition_shops SET autopay = 1, updated_at = ? WHERE shop_name = ?`).bind(Date.now(), shop).run();
    await logAction(env, 'autopay_on', shop, { card: label });
    return json({ ok: true, card_label: label });
  }
  if (p === 'autopay/cancel' && method === 'POST') {
    await safe(async () => { await env.DB.prepare(`UPDATE b2b_tuition_autopay SET active = 0 WHERE shop_name = ?`).bind(shop).run(); await env.DB.prepare(`UPDATE b2b_tuition_shops SET autopay = 0 WHERE shop_name = ?`).bind(shop).run(); return true; }, false);
    await logAction(env, 'autopay_off', shop, {});
    return json({ ok: true });
  }
  return err('not_found', 404);
}

// ───────────────────────── 관리자 라우터 (/api/admin/ai-billing/tuition/*) ─────────────────────────
function canSeeShop(scope: Scope, shop: string): boolean {
  if (scope.type === 'hq' || scope.type === 'none') return true;
  if (scope.type === 'agency') return scope.value === shop;
  return false;   // 지사·지사본사: 아직 안 연다(대리점 범위 판정을 따로 붙일 때 연다)
}

export async function tuitionAdminRouter(request: Request, env: Env, sub: string): Promise<Response> {
  await ensureTuitionSchema(env);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const scope = await safe(async () => await getScope(env, request), { type: 'none', value: null, label: '권한 없음' } as Scope);
  const hqGate = async () => await enrollAdminHqOnly(request, env);
  const body: any = method === 'POST' ? (await parseJsonBody(request)) || {} : {};
  const who = String(scope.label || 'hq');

  // 대시보드 — 전 학원 한 표 (본사)
  if (sub === 'overview' && method === 'GET') {
    const g = await hqGate(); if (g) return g;
    const shops: any[] = await safe(async () => ((await env.DB.prepare(`SELECT * FROM b2b_tuition_shops ORDER BY enabled DESC, shop_name`).all())?.results || []) as any[], []);
    const today = kstToday();
    const rows: any[] = [];
    for (const sh of shops) {
      if (Number(sh.enabled) !== 1) { rows.push({ shop_name: sh.shop_name, enabled: false }); continue; }
      const w = await walletBalance(env, sh.shop_name);
      const inv = await openInvoices(env, sh.shop_name);
      const owed = inv.reduce((a, i) => a + Math.max(0, Number(i.due_krw) - Number(i.paid_krw || 0)), 0);
      const worst = inv.map(i => overdueLevel({ ...i, first_month: !!i.first_month }, today));
      const rank = ['none', 'due_soon', 'overdue', 'warn', 'lock_candidate'];
      const level = worst.sort((a, b) => rank.indexOf(b) - rank.indexOf(a))[0] || 'none';
      rows.push({ shop_name: sh.shop_name, enabled: true, enabled_on: sh.enabled_on, balance: w ? w.balance : null, owed, open_invoices: inv.length, overdue: level, autopay: Number(sh.autopay) === 1, has_phone: !!(await shopPhone(env, sh.shop_name, sh)) });
    }
    // 켤 수 있는 후보 — 예약이 있는 학원
    const cand: any[] = await safe(async () => ((await env.DB.prepare(`
      SELECT e.shop_name AS shop_name, COUNT(DISTINCT cs.user_id) AS students,
             SUM(CASE WHEN COALESCE(cs.source,'') LIKE 'c24-mirror%' THEN 1 ELSE 0 END) AS c24_rows, COUNT(*) AS rows
        FROM class_schedules cs JOIN students_erp e ON e.user_id = cs.user_id
       WHERE COALESCE(cs.status,'active') != 'cancelled' AND LOWER(COALESCE(cs.user_id,'')) NOT IN ('lms','type_seed')
         AND e.shop_name IS NOT NULL AND TRIM(e.shop_name) <> ''
         AND (cs.scheduled_date IS NULL OR cs.scheduled_date = '' OR cs.scheduled_date >= ?)
       GROUP BY e.shop_name ORDER BY students DESC LIMIT 80`).bind(today.slice(0, 7) + '-01').all())?.results || []) as any[], []);
    const disputes: any[] = await safe(async () => ((await env.DB.prepare(`SELECT id, shop_name, month, message, status, assignee, answer, created_at, answered_at FROM b2b_tuition_disputes ORDER BY status = 'open' DESC, id DESC LIMIT 50`).all())?.results || []) as any[], []);
    const log: any[] = await safe(async () => ((await env.DB.prepare(`SELECT at, day, action, shop_name, detail FROM b2b_tuition_log ORDER BY id DESC LIMIT 60`).all())?.results || []) as any[], []);
    const pend: any = await safe(async () => await env.DB.prepare(`SELECT COUNT(*) AS n FROM schedule_change_requests WHERE status='pending' AND requester_role='agency'`).first(), null);
    const lastRun: any = await safe(async () => ((await env.DB.prepare(`SELECT v FROM b2b_tuition_meta WHERE k='last_run'`).first()) as any)?.v, null);
    return json({ ok: true, today, switches: { auto: await getSwitch(env, 'auto'), notify: await getSwitch(env, 'notify'), autopay_live: await getSwitch(env, 'autopay_live') },
      shops: rows, candidates: cand, disputes, log, pending_agency_postpones: Number(pend?.n) || 0, last_run: lastRun ? JSON.parse(lastRun) : null });
  }

  if (sub === 'switch' && method === 'POST') {
    const g = await hqGate(); if (g) return g;
    const k = String(body.key || '') as SwitchKey;
    if ((SWITCHES as readonly string[]).indexOf(k) < 0) return err('unknown_switch');
    if (!(await setMeta(env, k, body.on === true ? 'on' : 'off'))) return err('save_failed', 500);
    await logAction(env, 'switch', null, { key: k, on: body.on === true, by: who });
    return json({ ok: true, key: k, on: await getSwitch(env, k) });
  }

  if (sub === 'shop' && method === 'POST') {
    const g = await hqGate(); if (g) return g;
    const shop = String(body.shop_name || '').trim();
    if (!shop) return err('shop_name required');
    const cur = await shopRow(env, shop);
    const enabled = body.enabled === undefined ? (cur ? Number(cur.enabled) : 0) : (body.enabled === true ? 1 : 0);
    // 켠 날 = 처음 켜는 순간(그 전 수업은 절대 차감하지 않는다). 껐다 다시 켜도 처음 날을 유지.
    const enabledOn = cur?.enabled_on || (enabled ? kstToday() : null);
    const inc = body.include_c24 === undefined ? (cur ? Number(cur.include_c24) : 0) : (body.include_c24 === true ? 1 : 0);
    const phone = body.phone === undefined ? (cur?.phone ?? null) : (String(body.phone || '').replace(/[^0-9]/g, '') || null);
    const ok = await safe(async () => {
      await env.DB.prepare(`INSERT INTO b2b_tuition_shops (shop_name, enabled, enabled_on, include_c24, phone, updated_by, updated_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(shop_name) DO UPDATE SET enabled=excluded.enabled, enabled_on=excluded.enabled_on, include_c24=excluded.include_c24, phone=excluded.phone, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
        .bind(shop, enabled, enabledOn, inc, phone, who, Date.now()).run();
      return true;
    }, false);
    if (!ok) return err('save_failed', 500);
    await ensureToken(env, shop);
    await logAction(env, 'shop_setting', shop, { enabled, include_c24: inc, by: who });
    return json({ ok: true, shop: await shopRow(env, shop) });
  }

  if (sub === 'shop' && method === 'GET') {
    let shop = String(url.searchParams.get('shop_name') || '').trim();
    if (scope.type === 'agency') shop = String(scope.value || '');
    else { const g = await hqGate(); if (g) return g; }   // 대리점 밖은 본사만(fail-closed — 'none' 오판으로 열리지 않게)
    if (!shop) return err('shop_name required');
    if (!canSeeShop(scope, shop)) return err('forbidden', 403);
    const v: any = await shopView(env, shop, { withUid: scope.type !== 'agency' });
    const sh = await shopRow(env, shop);
    if (scope.type !== 'agency') {
      v.link = sh?.link_token ? payLink(String(sh.link_token)) : null;
      v.phone = await shopPhone(env, shop, sh);
      v.wallet_entries = await safe(async () => ((await env.DB.prepare(`SELECT id, kind, amount, memo, created_by, created_at FROM b2b_wallet_entries WHERE shop_name = ? ORDER BY id DESC LIMIT 50`).bind(shop).all())?.results || []), []);
    }
    return json(v);
  }

  if (sub === 'link' && method === 'POST') {
    const g = await hqGate(); if (g) return g;
    const shop = String(body.shop_name || '').trim();
    if (!shop) return err('shop_name required');
    if (body.rotate === true) await safe(async () => { await env.DB.prepare(`UPDATE b2b_tuition_shops SET link_token = NULL WHERE shop_name = ?`).bind(shop).run(); return true; }, false);
    const tok = await ensureToken(env, shop);
    if (!tok) return err('token_failed', 500);
    return json({ ok: true, link: payLink(tok) });
  }

  if (sub === 'wallet' && method === 'POST') {   // 통장 입금·조정을 사람이 적는다
    const g = await hqGate(); if (g) return g;
    const shop = String(body.shop_name || '').trim();
    const amount = Math.round(Number(body.amount));
    if (!shop || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 50_000_000) return err('bad_params');
    const memo = String(body.memo || '').trim().slice(0, 200);
    if (!memo) return err('memo_required: 무슨 돈인지 적어 주세요');
    const invId = Number(body.invoice_id) || 0;
    const ref = invId ? `MGT-${invId}-MANUAL-${Date.now().toString(36)}` : `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (invId && amount > 0) {
      const iv: any = await safe(async () => await env.DB.prepare(`SELECT shop_name FROM b2b_tuition_invoices WHERE id = ?`).bind(invId).first(), null);
      if (!iv || String(iv.shop_name) !== shop) return err('invoice_not_in_shop', 400);
      await activateB2bTuitionPayment(env, ref, amount, Date.now(), 'manual:' + who);
      const e: any = await safe(async () => await env.DB.prepare(`UPDATE b2b_wallet_entries SET kind='bank_deposit', memo=? WHERE ref = ?`).bind(memo, ref).run(), null);
      void e;
    } else {
      const ok = await safe(async () => { await env.DB.prepare(`INSERT INTO b2b_wallet_entries (shop_name, kind, amount, memo, ref, created_by, created_at) VALUES (?, 'adjust', ?, ?, ?, ?, ?)`).bind(shop, amount, memo, ref, who, Date.now()).run(); return true; }, false);
      if (!ok) return err('save_failed', 500);
      await logAction(env, 'wallet_adjust', shop, { amount, memo, by: who });
    }
    return json({ ok: true, wallet: await walletBalance(env, shop) });
  }

  if (sub === 'student' && method === 'POST') {
    const g = await hqGate(); if (g) return g;
    const shop = String(body.shop_name || '').trim(), uid = String(body.uid || '').trim();
    if (!shop || !uid) return err('bad_params');
    const ex = body.excluded === true ? 1 : 0;
    const ok = await safe(async () => { await env.DB.prepare(`INSERT INTO b2b_tuition_students (shop_name, uid, excluded, reason, updated_by, updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(shop_name, uid) DO UPDATE SET excluded=excluded.excluded, reason=excluded.reason, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
      .bind(shop, uid, ex, String(body.reason || (ex ? '본사가 제외' : '')).slice(0, 120), who, Date.now()).run(); return true; }, false);
    return ok ? json({ ok: true }) : err('save_failed', 500);
  }

  if (sub === 'invoice/void' && method === 'POST') {
    const g = await hqGate(); if (g) return g;
    const id = Number(body.id);
    const ok = await safe(async () => { const r: any = await env.DB.prepare(`UPDATE b2b_tuition_invoices SET status='void', updated_at=? WHERE id = ? AND paid_krw = 0 AND status IN ('issued')`).bind(Date.now(), id).run(); return (r?.meta?.changes || 0) > 0; }, false);
    if (ok) await logAction(env, 'invoice_void', null, { id, by: who });
    return ok ? json({ ok: true }) : err('cannot_void: 결제가 들어온 청구서는 취소할 수 없습니다', 409);
  }

  if (sub === 'run' && method === 'POST') {
    const g = await hqGate(); if (g) return g;
    const dry = body.dry !== false;
    return json(await runB2bTuitionDaily(env, { dry, force: !dry, onlyShop: body.shop_name ? String(body.shop_name) : undefined }));
  }

  if (sub === 'dispute/answer' && method === 'POST') {
    const g = await hqGate(); if (g) return g;
    const id = Number(body.id), ans = String(body.answer || '').trim().slice(0, 2000);
    if (!(id > 0) || !ans) return err('bad_params');
    const ok = await safe(async () => { await env.DB.prepare(`UPDATE b2b_tuition_disputes SET status='answered', answer=?, answered_by=?, answered_at=? WHERE id=?`).bind(ans, who, Date.now(), id).run(); return true; }, false);
    return ok ? json({ ok: true }) : err('save_failed', 500);
  }

  if (sub === 'diagnose' && method === 'POST') {
    let shop = String(body.shop_name || '').trim();
    if (scope.type === 'agency') shop = String(scope.value || '');
    else { const g = await hqGate(); if (g) return g; }
    if (!shop || !canSeeShop(scope, shop)) return err('forbidden', 403);
    if (!isValidMonth(body.month)) return err('bad_month');
    return json(await diagnose(env, shop, String(body.month), String(body.text || '').slice(0, 8000)));
  }

  return err('not_found', 404);
}

export { type ReminderStep };
