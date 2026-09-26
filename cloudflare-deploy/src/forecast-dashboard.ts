/** Revenue estimates and actionable retention snapshots. No LLM call on dashboard load.
 * Payment ledger amounts are counted once; bundled free AI has no invented revenue.
 * Snapshot risk is a care signal, never a calibrated probability of leaving.
 */
export const DAY = 86400000;
const KST = 9 * 3600000;
export const ymd = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10);
const dayMs = (date: string) => Date.parse(date + 'T00:00:00+09:00');
const sum = (rows: any[]) => rows.reduce((n, r) => n + Number(r.amount || 0), 0);

export function revenueEstimate(rows: any[], now: number) {
  const today = ymd(now), start = dayMs(today);
  const amounts = new Map(rows.map(r => [r.date, Number(r.amount)]));
  const history = Array.from({ length: 90 }, (_, i) => {
    const date = ymd(start - (90 - i) * DAY);
    return { date, amount: amounts.get(date) || 0 };
  });
  const paidDays = history.filter(r => r.amount > 0);
  const recent = sum(history.slice(-30)) / 30;
  const earlier = sum(history.slice(0, 60)) / 60;
  const span = paidDays.length ? (start - dayMs(paidDays[0].date)) / DAY : 0;
  const lastPaidAge = paidDays.length ? (start - dayMs(paidDays.at(-1)!.date)) / DAY : Infinity;
  const sufficient = span >= 60 && paidDays.length >= 6 && lastPaidAge <= 14;
  const daily = recent * .6 + earlier * .4;
  const month = today.slice(0, 7);
  const year = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const monthDays = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const remaining = monthDays - Number(today.slice(8));
  const actual = sum(rows.filter(r => r.date.startsWith(month) && r.date <= today));
  const todayPaid = amounts.get(today) || 0;
  const totalAtRate = (rate: number) => Math.round(actual + rate * remaining + Math.max(0, rate - todayPaid));
  const prevMonthStart = new Date(Date.UTC(year, m - 2, 1)).toISOString().slice(0, 7);
  const previous = sum(rows.filter(r => r.date.startsWith(prevMonthStart)));
  const estimated = sufficient ? totalAtRate(daily) : null;
  const forecast = sufficient ? Array.from({ length: 30 }, (_, i) => ({ date: ymd(start + (i + 1) * DAY), amount: Math.round(daily) })) : [];
  return {
    ok: true, generated_at: now, source: 'student_payments', method: 'weighted_daily_average_30_60',
    quality: sufficient ? 'estimate' : 'insufficient', observed_payment_days: paidDays.length,
    history, forecast, daily_avg: sufficient ? Math.round(daily) : null,
    trend: recent > earlier * 1.05 ? 'up' : recent < earlier * .95 ? 'down' : 'flat',
    month, actual_month: actual, previous_month: previous, estimated_month: estimated,
    scenario_range: sufficient ? [totalAtRate(Math.min(recent, earlier)), totalAtRate(Math.max(recent, earlier))] : null,
    change_pct: estimated !== null && previous > 0 ? Math.round((estimated / previous - 1) * 1000) / 10 : null,
    commentary: sufficient ? '최근 30일·이전 60일 결제 평균을 반영한 참고 추정입니다. 재등록 대상의 만료일과 결제 상태를 확인해 주세요.' : '결제 이력의 기간·빈도 또는 최근 기록이 부족해 예측을 보류했습니다. 결제 동기화 상태를 확인해 주세요.'
  };
}

export async function loadRevenue(db: any, notSeed: string, now = Date.now()) {
  const start = dayMs(ymd(now)) - 90 * DAY;
  const r = await db.prepare(`SELECT date(paid_at/1000,'unixepoch','+9 hours') AS date,
      SUM(amount_krw) AS amount FROM student_payments
      WHERE paid_at>=? AND paid_at<=? AND status='paid' AND ${notSeed}
      GROUP BY date ORDER BY date`).bind(start, now).all();
  return revenueEstimate(r.results || [], now);
}

const prepared = new WeakSet<object>();
async function ensureCare(db: any) {
  if (prepared.has(db)) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS forecast_care (
    user_id TEXT NOT NULL, case_key TEXT NOT NULL, status TEXT NOT NULL,
    owner TEXT NOT NULL, updated_at INTEGER NOT NULL, contacted_at INTEGER,
    PRIMARY KEY(user_id, case_key))`).run();
  prepared.add(db);
}
export function caseKey(r: any) { return [r.category || '', r.end_date || '', r.category === 'inactive' ? (r.last_class || '') : ''].join('|'); }
export function careCandidate(r: any, now: number) {
  const end = /^\d{4}-\d{2}-\d{2}$/.test(r.end_date || '') ? dayMs(r.end_date) : NaN;
  const left = Number.isFinite(end) ? Math.round((end - dayMs(ymd(now))) / DAY) : null;
  const fresh = Number(r.updated_at) > 0 && now - Number(r.updated_at) <= 3 * DAY;
  const renewed = !!(r.payment_end && r.end_date && r.payment_end > r.end_date);
  const renewal = !renewed && left !== null && left >= 0 && left <= 14;
  const inactive = r.category === 'inactive' && Number(r.days_inactive) >= 21;
  const expired = !renewed && left !== null && left < 0 && left >= -60;
  const risk = inactive || expired || (!renewed && left !== null && left >= 0 && left <= 7);
  const due30 = !renewed && left !== null && left >= 0 && left <= 30;
  const reference = due30 && risk && Number(r.last_amount) > 0 ? Number(r.last_amount) : null;
  const reason = inactive ? 'long_inactive' : expired ? 'expired' : 'expiring';
  const key = caseKey(r);
  const careMatches = r.care_key === key;
  return { user_id: r.user_id, name: r.name || r.user_id, case_key: key, category: r.category,
    end_date: r.end_date, days_to_expiry: left, days_inactive: r.days_inactive,
    reason, risk, renewal, due30, fresh, renewed, reference,
    status: careMatches ? r.care_status : 'unreviewed', owner: careMatches ? r.owner : null,
    contacted_at: careMatches ? r.care_contacted_at : r.contacted_at,
    updated_at: Number(r.updated_at), care_updated_at: careMatches ? r.care_updated_at : null };
}

export async function loadCare(db: any, notSeed: string, now = Date.now()) {
  await ensureCare(db);
  // Never LIMIT before counting: totals describe the entire retention snapshot.
  const result = await db.prepare(`WITH latest AS (
    SELECT user_id, amount_krw, period_end, ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY paid_at DESC,id DESC) AS rn
    FROM student_payments WHERE status='paid' AND paid_at<=? AND ${notSeed}
      AND user_id IN (SELECT user_id FROM student_retention)
  ) SELECT r.user_id,r.category,r.end_date,r.last_class,r.days_inactive,r.updated_at,r.contacted_at,
      s.korean_name AS name,p.amount_krw AS last_amount,p.period_end AS payment_end,
      c.case_key AS care_key,c.status AS care_status,c.owner,c.updated_at AS care_updated_at,c.contacted_at AS care_contacted_at
    FROM student_retention r LEFT JOIN students_erp s ON s.user_id=r.user_id
    LEFT JOIN latest p ON p.user_id=r.user_id AND p.rn=1
    LEFT JOIN forecast_care c ON c.user_id=r.user_id AND c.case_key=(COALESCE(r.category,'')||'|'||COALESCE(r.end_date,'')||'|'||CASE WHEN r.category='inactive' THEN COALESCE(r.last_class,'') ELSE '' END)`)
    .bind(now).all();
  const all = (result.results || []).map((r: any) => careCandidate(r, now));
  const fresh = all.filter((r: any) => r.fresh);
  const targets = fresh.filter((r: any) => r.risk || r.renewal);
  const risks = fresh.filter((r: any) => r.risk);
  const monetary = risks.filter((r: any) => r.due30);
  const known = monetary.filter((r: any) => r.reference !== null);
  targets.sort((a: any, b: any) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0)
    || Number(b.risk) - Number(a.risk) || (a.days_to_expiry ?? 999) - (b.days_to_expiry ?? 999)
    || String(a.user_id).localeCompare(String(b.user_id)));
  const usable = all.length > 0 && fresh.length === all.length;
  return { ok: true, generated_at: now, quality: usable ? 'snapshot' : 'insufficient',
    updated_at: all.length ? Math.min(...all.map((r: any) => r.updated_at)) : null,
    renewals_14d: usable ? fresh.filter((r: any) => r.renewal).length : null,
    risk_count: usable ? risks.length : null,
    renewal_reference: usable && known.length ? known.reduce((s: number, r: any) => s + r.reference, 0) : null,
    reference_known: known.length, reference_total: monetary.length,
    pending_count: targets.filter((r: any) => r.status !== 'done').length,
    rows: targets.slice(0, 100), total: targets.length,
    projected_next_month_churn: null, enrollments_90d: null, leavers_90d: null, monthly: [],
    commentary: '기간별 실제 이탈 이력이 확인되지 않아 예상 이탈 인원은 산출하지 않습니다. 만료·장기 미수강 신호는 상담 우선순위이며 확정 이탈이 아닙니다.' };
}

export async function saveCare(db: any, input: any, owner: string, now = Date.now()) {
  if (!input || typeof input.user_id !== 'string' || !input.user_id || input.user_id.length > 200
      || typeof input.case_key !== 'string' || input.case_key.length > 300 || !['unreviewed', 'in_progress', 'done'].includes(input.status)
      || typeof input.contacted !== 'boolean') return { status: 400, body: { ok: false, error: 'invalid_care' } };
  await ensureCare(db);
  const row = await db.prepare(`SELECT category,end_date,last_class,updated_at FROM student_retention WHERE user_id=?`).bind(input.user_id).first();
  if (!row || caseKey(row) !== input.case_key || now - Number(row.updated_at) > 3 * DAY)
    return { status: 409, body: { ok: false, error: 'snapshot_changed' } };
  await db.prepare(`INSERT INTO forecast_care(user_id,case_key,status,owner,updated_at,contacted_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(user_id,case_key) DO UPDATE SET status=excluded.status,owner=excluded.owner,
    updated_at=excluded.updated_at,contacted_at=COALESCE(excluded.contacted_at,forecast_care.contacted_at)`)
    .bind(input.user_id, input.case_key, input.status, owner, now, input.contacted ? now : null).run();
  return { status: 200, body: { ok: true, owner, updated_at: now } };
}
