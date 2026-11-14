import { json } from './api-util';
import { enrollAdminHqOnly } from './enroll-ops';

function validDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || '') && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
}

export function summarizeDropout(periods: any[], undated: any[], students: any[], from: string, to: string, today: string) {
  const byUid = new Map<string, any[]>();
  for (const row of periods) {
    if (!row.uid || !validDate(row.start) || !validDate(row.end) || row.end < row.start) continue;
    const list = byUid.get(row.uid) || [];
    list.push(row); byUid.set(row.uid, list);
  }
  const studentOf = new Map(students.map(s => [s.user_id, s]));
  const missing = new Set(undated.map(r => r.uid));
  const groups = new Map<string, any>();
  for (const [uid, list] of byUid) {
    const ended = list.filter(r => r.end >= from && r.end <= to && r.end < today).sort((a,b) => b.end.localeCompare(a.end))[0];
    if (!ended) continue;
    const renewed = list.some(r => r.start > ended.start && r.end > ended.end);
    const student: any = studentOf.get(uid) || {};
    const org = [student.hq_name || '', student.branch1_name || student.franchise || '', student.shop_name || '미지정'];
    const key = JSON.stringify(org);
    const group = groups.get(key) || { org, ended: 0, renewed: 0, dropped: 0, unknown: 0 };
    group.ended++;
    if (renewed) group.renewed++;
    else if (missing.has(uid)) group.unknown++;
    else group.dropped++;
    groups.set(key, group);
  }
  const items = [...groups.values()].sort((a,b) => a.org.join('/').localeCompare(b.org.join('/')));
  const total = { ended: 0, renewed: 0, dropped: 0, unknown: 0 };
  for (const item of items) for (const key of ['ended','renewed','dropped','unknown'] as const) total[key] += item[key];
  const rate = (r: any) => r.ended && !r.unknown ? Math.round(r.dropped / r.ended * 1000) / 10 : null;
  return { items: items.map(r => ({ ...r, rate: rate(r) })), total: { ...total, rate: rate(total) }, undated_records: undated.length };
}

export async function handleDropout(request: Request, url: URL, env: any) {
  const denied = await enrollAdminHqOnly(request, env);
  if (denied) return denied;
  const today = new Date(Date.now() + 9*3600000).toISOString().slice(0,10);
  const from = url.searchParams.get('from') || today.slice(0,7) + '-01';
  const to = url.searchParams.get('to') || today;
  if (!validDate(from) || !validDate(to) || from > to) return json({ ok:false, error:'invalid_period' },400);
  try {
    const [payments, enrollments, students] = await Promise.all([
      env.DB.prepare("SELECT user_id AS uid, period_start AS start, period_end AS end FROM student_payments WHERE status='paid'").all(),
      env.DB.prepare("SELECT student_user_id AS uid, date(started_at/1000,'unixepoch','+9 hours') AS start, COALESCE(NULLIF(end_date,''), date(ended_at/1000,'unixepoch','+9 hours')) AS end FROM enrollments WHERE status IN ('confirmed','active','completed','ended')").all(),
      env.DB.prepare('SELECT user_id,hq_name,branch1_name,franchise,shop_name FROM students_erp').all(),
    ]);
    for (const result of [payments,enrollments,students]) if (result.success === false || !Array.isArray(result.results)) throw new Error('read_failed');
    const rows = [...payments.results, ...enrollments.results];
    const dated: any[] = [], undated: any[] = [];
    for (const row of rows) {
      if (validDate(row.start) && validDate(row.end) && row.start <= row.end) dated.push(row);
      else undated.push(row);
    }
    return json({ ok:true, from, to, as_of:today, ...summarizeDropout(dated,undated,students.results,from,to,today) });
  } catch (e: any) {
    console.warn('[dropout] read failed:',e?.message);
    return json({ok:false,error:'dropout_read_failed'},503);
  }
}
