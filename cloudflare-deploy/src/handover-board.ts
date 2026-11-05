/* ════════════════════════════════════════════════════════════════════════════
 * 👀 매일보고 «팀 보고판» — 사람별 한 줄 / Daily handover team board (2026-11-04)
 *
 * 왜 — 사장님: 「일일보고에서 모든 매니저들과 본사 임직원들의 일일보고를 한 번에 확인하고 싶어」.
 *   기존 «받은 보고 확인» 은 «내 미확인 목록» 중심이라, 미확인이 0건이면 «해당 보고가 없습니다» 만 보였다.
 *   누가 냈고 · 누가 안 냈고 · 어디에 문제가 있는지를 «한 화면» 에서 못 봤다.
 *
 * 이 파일은 «모양만» 만든다 — 순수 함수, import 0, DB 를 모른다(하니스가 그대로 돌린다).
 *   자료는 daily-handover.ts 의 GET /board 가 모아서 넘긴다(명단 handoverDuty · 그날 보고 · 계정 이름 · 영업일지).
 *
 * 약속 —
 *   ⛔ 초안(draft)은 «미제출» 로만 보인다. 내용은 물론 «초안이 있다» 는 사실도 내보내지 않는다
 *      (daily-handover.ts visible() 와 같은 약속 — 보고는 «보낸 뒤» 에만 남의 것이 된다).
 *   ⛔ 확인·보완 요청의 «판정» 은 여기서 하지 않는다. can_respond 는 버튼을 그릴지 정하는 힌트일 뿐이고,
 *      실제 허락(받는 사람·경영진·10초 읽기)은 POST /ack·/return 이 매번 다시 본다.
 *   ✅ 영업일지는 «읽기만» 한다(sales_activities). 못 읽으면 null(«모름») — 0건으로 지어내지 않는다.
 * ════════════════════════════════════════════════════════════════════════════ */

export type BoardState = 'issue' | 'awaiting' | 'returned' | 'acknowledged' | 'missing' | 'off';

/** 정렬 순서 — 먼저 봐야 할 것이 위. 같은 칸 안에서는 이름순. */
export const BOARD_STATE_RANK: Record<BoardState, number> = {
  issue: 0,         // 문제·긴급이 적힌 미확인 보고
  awaiting: 1,      // 미확인
  returned: 2,      // 보완 요청함(작성자가 고쳐 다시 보내야 함)
  acknowledged: 3,  // 확인 끝
  missing: 4,       // 오늘 써야 하는데 아직 안 냄(초안 포함)
  off: 5,           // 오늘은 안 써도 됨(휴무·근무일 아님)
};

export const SALES_KINDS = ['visit', 'call', 'meeting', 'demo', 'manage', 'other'] as const;
export type SalesKind = typeof SALES_KINDS[number];

export interface DutyLike {
  username: string; name?: string; today_required?: boolean; today_holiday?: boolean;
  mandatory?: boolean; due_time?: string; prev_day?: string | null; prev_missed?: boolean;
}
export interface ReportLike {
  id: number; version: number; username: string; staff_name?: string; recipient: string; status: string;
  report_date?: string; submitted_at?: number | null; acknowledged_at?: number | null; acknowledged_by?: string | null;
  feedback?: string | null; payload: any; followup?: any;
}
export interface SalesItem { kind: string; lead: string; outcome: string }
export interface SalesInput { reps: string[]; items: Array<SalesItem & { username: string }> }

export interface BoardSales { total: number; counts: Record<SalesKind, number>; items: SalesItem[] }
export interface BoardRow {
  username: string; name: string;
  on_roster: boolean; required: boolean; holiday: boolean; mandatory: boolean; due_time: string;
  prev_day: string | null; prev_missed: boolean;
  state: BoardState;
  headline: string;
  issue: boolean; urgent: boolean;
  open: null | { text: string; owner: string; deadline: string; overdue: boolean };
  report: ReportLike | null;
  sales: BoardSales | null;
  can_respond: boolean; can_mark_opened: boolean;
}
export interface BoardSummary { required: number; submitted: number; missing: number; issue: number; awaiting: number; off: number }

const firstLine = (v: unknown, max = 120) => String(v ?? '').split(/\r?\n/).map(s => s.trim()).find(Boolean)?.slice(0, max) || '';
const cleanName = (n: unknown, u: string) => String(n || u).replace(/\s*\(.*?\)\s*$/, '').trim() || u;

/** 남은 일 기한(KST 'YYYY-MM-DDTHH:mm')이 지났는가. 모양이 틀리면 «지나지 않음»(모르면 빨간불을 켜지 않는다). */
export function deadlinePassed(deadline: unknown, now: number): boolean {
  const s = String(deadline || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return false;
  const ms = Date.parse(s + ':00+09:00');
  return Number.isFinite(ms) && ms < now;
}

/** 그날 영업일지를 사람별로 묶는다. reps = 영업 담당자로 연결된 계정(활동 0건이어도 «0» 을 보이려고). */
export function groupSales(input: SalesInput | null): Map<string, BoardSales> | null {
  if (!input) return null;
  const out = new Map<string, BoardSales>();
  const blank = (): BoardSales => ({ total: 0, counts: { visit: 0, call: 0, meeting: 0, demo: 0, manage: 0, other: 0 }, items: [] });
  for (const u of input.reps) if (u && !out.has(u)) out.set(u, blank());
  for (const it of input.items) {
    if (!it.username) continue;
    const s = out.get(it.username) || blank();
    const kind = (SALES_KINDS as readonly string[]).includes(it.kind) ? it.kind as SalesKind : 'other';
    s.counts[kind]++; s.total++;
    if (s.items.length < 12) s.items.push({ kind, lead: firstLine(it.lead, 60), outcome: firstLine(it.outcome, 160) });
    out.set(it.username, s);
  }
  return out;
}

/** 보고 한 건(또는 없음)과 명단 정보로 그 사람의 상태를 정한다. */
export function boardState(report: ReportLike | null, required: boolean): BoardState {
  if (!report || report.status === 'draft') return required ? 'missing' : 'off';
  if (report.status === 'acknowledged') return 'acknowledged';
  if (report.status === 'changes_requested') return 'returned';
  const d = report.payload || {};
  const issue = !d.no_issue && !!String(d.issue || '').trim();
  return issue || d.priority === 'urgent' ? 'issue' : 'awaiting';
}

export function buildHandoverBoard(input: {
  me: string; alsoSees: string[]; now: number;
  duty: DutyLike[]; reports: ReportLike[]; members: Array<{ username: string; name?: string }>;
  sales: SalesInput | null;
}): { rows: BoardRow[]; summary: BoardSummary; not_on_roster: Array<{ username: string; name: string }>; sales_known: boolean } {
  const { me, alsoSees, now } = input;
  const memberName = new Map(input.members.map(m => [m.username, cleanName(m.name, m.username)]));
  // ⛔ 초안은 아예 넘기지 않는다(위 약속). 같은 사람 보고가 둘이면(UNIQUE 라 원래 없음) 나중 것.
  const byUser = new Map<string, ReportLike>();
  for (const r of input.reports) if (r && r.status !== 'draft') byUser.set(r.username, r);
  const sales = groupSales(input.sales);

  const people = new Map<string, DutyLike | null>();
  for (const d of input.duty) if (d && d.username) people.set(d.username, d);
  for (const u of byUser.keys()) if (!people.has(u)) people.set(u, null); // 명단 밖인데 보고를 낸 사람

  const rows: BoardRow[] = [];
  for (const [username, d] of people) {
    const report = byUser.get(username) || null;
    const required = !!d && d.today_required === true;
    const data = report?.payload || {};
    const issue = !!report && !data.no_issue && !!String(data.issue || '').trim();
    const hasOpen = !!report && !data.no_open && !!String(data.open || '').trim();
    rows.push({
      username,
      name: cleanName(d?.name || report?.staff_name || memberName.get(username), username),
      on_roster: !!d, required, holiday: !!d?.today_holiday, mandatory: !!d?.mandatory,
      due_time: String(d?.due_time || ''), prev_day: d?.prev_day || null, prev_missed: !!d?.prev_missed,
      state: boardState(report, required),
      headline: report ? firstLine(data.work) : '',
      issue, urgent: !!report && data.priority === 'urgent',
      open: hasOpen ? { text: firstLine(data.open, 160), owner: String(data.owner || ''), deadline: String(data.deadline || ''),
        overdue: deadlinePassed(data.deadline, now) } : null,
      report,
      sales: sales ? (sales.get(username) || null) : null,
      can_respond: !!report && report.status === 'submitted' && username !== me,
      can_mark_opened: !!report && report.status === 'submitted' && username !== me
        && (report.recipient === me || alsoSees.includes(report.recipient)),
    });
  }
  // 같은 칸 안에서는 «문제가 적힌 것» → «긴급» → 이름순(문제 없이 긴급만 표시한 보고가 진짜 문제를 밀어내지 않게).
  rows.sort((a, b) => BOARD_STATE_RANK[a.state] - BOARD_STATE_RANK[b.state]
    || Number(b.issue) - Number(a.issue) || Number(b.urgent) - Number(a.urgent) || a.name.localeCompare(b.name, 'ko'));

  const summary: BoardSummary = {
    required: rows.filter(r => r.required).length,
    submitted: rows.filter(r => r.required && r.report).length,
    missing: rows.filter(r => r.state === 'missing').length,
    issue: rows.filter(r => r.issue).length,
    awaiting: rows.filter(r => r.report?.status === 'submitted').length,
    off: rows.filter(r => r.state === 'off').length,
  };
  // 명단에도 없고 보고도 없는 본사 계정 — «이 사람은 왜 안 보이지?» 에 답하려고 이름만(보는 사람 본인은 뺀다).
  const not_on_roster = input.members
    .filter(m => m.username !== me && !people.has(m.username))
    .map(m => ({ username: m.username, name: cleanName(m.name, m.username) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { rows, summary, not_on_roster, sales_known: !!sales };
}
