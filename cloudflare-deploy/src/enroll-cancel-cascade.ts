/* ✕ 수강신청 «취소» → 그 신청이 만든 수업도 함께 종료 (2026-10-08 사장님 지시)
 * ═══════════════════════════════════════════════════════════════════════
 * [왜] 신청 목록의 「✕ 취소」는 신청서 status 한 칸만 바꾸고, 그 신청이 만든 수업
 *   (class_schedules.source = 'adm-enroll:<id>')은 그대로 살아 있었다. 그래서
 *   «취소했는데 수업은 계속 잡혀 있는» 상태가 됐다(필리핀 매니저 문의 2026-10-08).
 *
 * [규칙 — 이 파일이 정본. 라우트는 «부르기만» 한다]
 *   · 내리는 것: 아직 «안 지난» 수업만.
 *       - 날짜가 있는 수업: 오늘(KST) 이후, 또는 오늘인데 시작 시각이 아직 안 된 것
 *       - 날짜가 없는 매주 반복 줄: 내린다(신청 취소 = 앞으로의 매주 수업도 끝)
 *   · ⛔ 지난 수업은 안 건드린다 — 이미 한 수업을 cancelled 로 바꾸면 출석·급여 근거가 흔들린다.
 *   · ⛔ 날짜·시각을 못 읽는 행은 «지난 것» 으로 보고 안 내린다(모르면 안 바꾼다).
 *   · 되살리기(취소를 되돌림): 이번 취소가 내린 수업 중 «날짜가 있고 아직 안 지난» 것만.
 *       매주 반복 줄은 되살리지 않는다(날짜가 없어 겹침 확인을 할 수 없다 — 시간표에서 다시 등록).
 * ═══════════════════════════════════════════════════════════════════════ */

export interface CascadeRow {
  id: number;
  scheduled_date?: string | null;
  start_time?: string | null;
  status?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** 지금(KST)의 날짜·시각 */
export function kstNow(nowMs: number): { date: string; time: string } {
  const iso = new Date(nowMs + 9 * 3600000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** 이 수업이 «아직 안 지났는가». 날짜가 없으면(매주 반복) null — 따로 다룬다. */
export function isUpcoming(row: CascadeRow, nowMs: number): boolean | null {
  const sd = String(row.scheduled_date || '').slice(0, 10);
  if (!sd) return null;
  if (!DATE_RE.test(sd)) return false;                // 못 읽으면 «지난 것» — 안 건드린다
  const now = kstNow(nowMs);
  if (sd > now.date) return true;
  if (sd < now.date) return false;
  const st = String(row.start_time || '').slice(0, 5);
  if (!TIME_RE.test(st)) return false;                 // 오늘인데 시각을 모르면 안 건드린다
  return st > now.time;
}

/** 신청 취소 때 내릴 수업 id */
export function pickClassesToEnd(rows: CascadeRow[], nowMs: number): { end: number[]; past: number; weekly: number } {
  const end: number[] = [];
  let past = 0, weekly = 0;
  for (const r of rows || []) {
    if (!r || String(r.status || '') === 'cancelled') continue;
    const id = Number(r.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const up = isUpcoming(r, nowMs);
    if (up === null) { weekly++; end.push(id); }
    else if (up) end.push(id);
    else past++;
  }
  return { end, past, weekly };
}

/** 취소를 되돌릴 때 되살릴 수업 id (이번 취소가 내린 것 중에서만) */
export function pickClassesToRestore(rows: CascadeRow[], savedIds: number[], nowMs: number): { restore: number[]; skipped: number } {
  const saved = new Set((savedIds || []).map(Number));
  const restore: number[] = [];
  let skipped = 0;
  for (const r of rows || []) {
    if (!r || !saved.has(Number(r.id))) continue;
    if (String(r.status || '') !== 'cancelled') continue;   // 이미 살아 있음 — 셀 것도 없다
    if (isUpcoming(r, nowMs) === true) restore.push(Number(r.id));
    else skipped++;                                          // 지났거나 매주 반복 줄
  }
  return { restore, skipped };
}

/** 저장해 둔 id 목록(JSON 문자열)을 읽는다 — 깨져 있으면 빈 목록 */
export function parseSavedIds(raw: unknown): number[] {
  try {
    const a = JSON.parse(String(raw || '[]'));
    return Array.isArray(a) ? a.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  } catch { return []; }
}
