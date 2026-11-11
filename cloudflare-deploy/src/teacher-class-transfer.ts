/* ═══════════════════════════════════════════════════════════════════════════
   📦 teacher-class-transfer.ts — 퇴사·비활동 강사의 «남은 수업» 보기 + 다른 강사에게 한꺼번에 넘기기 (2026-11-05)

   [왜]  매니저 제보: 「Krystel 을 강사 명부에서 퇴사로 바꿨는데 수업이 그대로 남아 있다.
         오늘 시간표에 KRYSTEL 과 Teacher Krystel 두 이름이 있다.」
         실측(2026-11-05 D1 SELECT): 퇴사 처리 자체는 정상이었다 — teachers.active=0, 카페24 미러 차단.
         그런데 «퇴사» 는 이미 잡힌 수업을 옮기지 않는다. 남은 것:
           · 망고아이 수업(이름 KRYSTEL — teachers.name)  39건 = 수강등록 22 + 카페24 복사본 17
           · 카페24 예약(이름 Teacher Krystel — teacher_payroll_auto) 68건 · 학생 12명 · 2027-04-30 까지
         두 이름은 같은 사람이 두 시스템에 따로 적힌 것이다. 망고아이 쪽만 여기서 옮길 수 있다.

   [무엇을 하나]
     ① 미리보기 — 그 강사의 «앞으로 남은» 망고아이 수업 목록 + 카페24 예약 건수(바꿀 곳 = 카페24).
        넘겨받을 강사를 고르면 줄마다 «넘길 수 있음 / 못 넘김(사유)» 을 미리 판정한다.
     ② 넘기기 — 고른 줄만, 기존 «담당 강사 변경» 엔진 moveSchedulesAtomically 로 50건씩 옮긴다.

   ⛔ 새 UPDATE 경로를 만들지 않는다 — 강사 변경은 이미 정본이 있다(class-schedule-move.ts):
        본사 전용 게이트(teacherMoveDenyReason) · 겹침/휴가 검사(findScheduleMoveConflicts) ·
        미러 줄 «사람 손» 도장(c24-mirror → c24-mirror:manual) · 감사 기록 · 원자적 batch · 낡은 화면 거절(expected).
        여기서 따로 UPDATE 하면 그 보호가 전부 빠진다.
   ⛔ 지난 수업은 손대지 않는다 — 급여·출결·노쇼 판정이 «그때의 강사» 에 기대고 있다(no-show-truth.ts).
   ⛔ 카페24 예약은 여기서 못 바꾼다 — 카페24가 정본이다. 건수와 학생만 알려 주고 «카페24에서» 라고 말한다.
   ⛔ 카페24 강사번호를 원부 번호로 직접 잇지 않는다 — 번호 체계가 다르다(CLAUDE.md 2장 「강사 번호가 세 벌」).
      이름을 거치는 정본 loadTeacherLinks(c24-mirror.ts — 퇴사자까지 가른다)를 그대로 쓴다.
   ⚠️ 판정은 순수 함수로 뺐다 — 하니스가 실제로 돌린다(test-harness/teacher_class_transfer_harness.mjs).
   ═══════════════════════════════════════════════════════════════════════════ */
import { moveSchedulesAtomically, scheduleMoveVersion } from './class-schedule-move';
import { findScheduleMoveConflicts, loadScheduleMoveFacts, scheduleRowsOverlap } from './schedule-conflict';
import { teacherMoveDenyReason } from './class-teacher-move';
import { loadTeacherLinks } from './c24-mirror';
import { selectInChunks } from './d1-chunk';

/** moveSchedulesAtomically 한 번에 옮길 수 있는 상한(그 함수가 50 을 넘으면 거절한다). */
export const TRANSFER_CHUNK = 50;
/** 한 요청에서 넘길 수 있는 줄 수 상한 — 50건 묶음 10번. */
export const TRANSFER_MAX_IDS = 500;
const SKIP_STATUS = ['cancelled', 'ended', 'completed'];
const PLACEHOLDER_USERS = ['lms', 'type_seed'];
const KST = 9 * 3600 * 1000;

export type TransferKind = 'enroll' | 'mirror' | 'other';

/** KST 날짜+시각 → ms. 못 읽으면 NaN. */
export function kstStartMs(date: unknown, time: unknown): number {
  const d = String(date ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? '').trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !m) return NaN;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh > 23 || mm > 59) return NaN;
  return Date.parse(`${d}T${String(hh).padStart(2, '0')}:${m[2]}:00+09:00`);
}

/** 어디서 온 수업인가 — 화면이 «수강등록 · 카페24 복사본 · 기타» 로 나눠 말한다. */
export function transferKindOf(source: unknown): TransferKind {
  const s = String(source ?? '');
  if (s.startsWith('c24-mirror')) return 'mirror';
  if (s.startsWith('adm-enroll')) return 'enroll';
  return 'other';
}

/** 넘길 대상인가 — 취소·종료·자리표시 행과 «이미 시작한» 날짜 수업은 뺀다.
 *  날짜 없는 매주 반복 행은 «앞으로의 모든 주» 라 넣는다. 시각을 못 읽는 날짜 행은 넣고 엔진이 거절하게 둔다
 *  (조용히 빠지면 «남은 수업 0건» 이라는 거짓말이 된다). */
export function isTransferCandidate(row: any, nowMs: number): boolean {
  if (!row) return false;
  const st = String(row.status ?? '').trim().toLowerCase();
  if (SKIP_STATUS.includes(st)) return false;
  if (PLACEHOLDER_USERS.includes(String(row.user_id ?? '').trim().toLowerCase())) return false;
  const d = String(row.scheduled_date ?? '').trim();
  if (!d) return true;
  const t = kstStartMs(d, row.start_time);
  return !Number.isFinite(t) || t > nowMs;
}

/** 날짜 수업은 날짜·시각 순, 매주 반복은 맨 뒤. */
export function transferOrder(a: any, b: any): number {
  const da = String(a?.scheduled_date ?? '').trim(), db = String(b?.scheduled_date ?? '').trim();
  if (!!da !== !!db) return da ? -1 : 1;
  const ka = da + ' ' + String(a?.start_time ?? '').padStart(5, '0');
  const kb = db + ' ' + String(b?.start_time ?? '').padStart(5, '0');
  if (ka !== kb) return ka < kb ? -1 : 1;
  return Number(a?.id || 0) - Number(b?.id || 0);
}

export interface TransferSummary {
  total: number; dated: number; weekly: number;
  by_kind: Record<TransferKind, number>;
  students: number; first_date: string | null; last_date: string | null;
}
export function summarizeTransfer(rows: any[]): TransferSummary {
  const by_kind: Record<TransferKind, number> = { enroll: 0, mirror: 0, other: 0 };
  const users = new Set<string>();
  let dated = 0, weekly = 0, first: string | null = null, last: string | null = null;
  for (const r of rows || []) {
    by_kind[transferKindOf(r?.source)]++;
    if (r?.user_id) users.add(String(r.user_id));
    const d = String(r?.scheduled_date ?? '').trim();
    if (d) {
      dated++;
      if (!first || d < first) first = d;
      if (!last || d > last) last = d;
    } else weekly++;
  }
  return { total: (rows || []).length, dated, weekly, by_kind, students: users.size, first_date: first, last_date: last };
}

/** 넘기기 요청 본문 검사 — 모르는 값은 거절한다(조용히 고치지 않는다). */
export function parseTransferApply(body: any):
  { ok: true; to: string; ids: string[]; expected: Record<string, string>; allowGroup: Set<string> } | { ok: false; error: string; message: string } {
  const to = String(body?.to_teacher_id ?? '').trim();
  if (!/^\d+$/.test(to) || Number(to) <= 0) return { ok: false, error: 'target_required', message: '넘겨받을 강사를 골라 주세요.' };
  const raw = body?.ids;
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: 'invalid_ids', message: '넘길 수업을 골라 주세요.' };
  if (raw.length > TRANSFER_MAX_IDS) return { ok: false, error: 'too_many', message: `한 번에 ${TRANSFER_MAX_IDS}건까지 넘길 수 있습니다.` };
  if (raw.some((x: any) => !/^\d+$/.test(String(x)) || Number(x) <= 0)) return { ok: false, error: 'invalid_ids', message: '수업 번호가 올바르지 않습니다.' };
  const ids = Array.from(new Set(raw.map((x: any) => String(x))));
  const ex = body?.expected;
  if (!ex || typeof ex !== 'object' || ids.some(id => typeof ex[id] !== 'string'))
    return { ok: false, error: 'invalid_expected', message: '목록을 새로고침한 뒤 다시 시도해 주세요.' };
  const expected: Record<string, string> = {};
  for (const id of ids) expected[id] = ex[id];
  // 👥 «묶음(그룹)이 되어도 넘긴다» 고 사람이 고른 줄 — 없으면 빈 목록(= 묶음이 되는 줄은 하나도 안 넘긴다)
  const ag = body?.allow_group_ids;
  if (ag != null && (!Array.isArray(ag) || ag.some((x: any) => !/^\d+$/.test(String(x)))))
    return { ok: false, error: 'invalid_ids', message: '묶음 허용 목록이 올바르지 않습니다.' };
  return { ok: true, to, ids, expected, allowGroup: new Set((ag || []).map((x: any) => String(x))) };
}

/** 👥 넘겨받을 강사의 «기존» 수업과 같은 자리에 들어가 묶음(그룹)이 되는 줄 → 그 기존 수업의 학생들.
 *  엔진(findScheduleMoveConflicts)이 «같은 강사·같은 시각·같은 길이» 를 묶음으로 허용하므로, 겹침 검사를
 *  통과한 줄에만 부른다. 넘길 후보끼리(candidateIds)는 원래 같은 강사의 묶음이라 세지 않는다.
 *  미리보기와 넘기기가 «같은 함수» 로 판정한다 — 화면만 막으면 화면을 거치지 않은 요청이 그대로 묶음이 된다. */
export function groupMembersFor(dest: any, factRows: any[], toId: string, candidateIds: Set<string>, today: string): string[] {
  return (factRows || []).filter((o: any) => String(o.teacher_id) === String(toId) && !candidateIds.has(String(o.id))
    && String(o.user_id) !== String(dest.user_id) && scheduleRowsOverlap(dest, o, today))
    .map((o: any) => String(o.user_id || ''));
}

/** 넘길 묶음으로 자른다(엔진 상한 50). */
export function chunkIds(ids: string[], size = TRANSFER_CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

const kstYmd = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10);

/** 그 강사의 «앞으로 남은» 망고아이 수업. 실패하면 던진다(«0건» 으로 말하면 거짓말이 된다). */
export async function loadTransferRows(env: any, teacherId: string, nowMs: number): Promise<any[]> {
  const rs: any = await env.DB.prepare(
    `SELECT * FROM class_schedules
      WHERE CAST(teacher_id AS TEXT) = ?
        AND (scheduled_date IS NULL OR TRIM(scheduled_date) = '' OR scheduled_date >= ?)`
  ).bind(String(teacherId), kstYmd(nowMs)).all();
  if (!rs || rs.success === false || !Array.isArray(rs.results)) throw new Error('transfer_rows_failed');
  const rows = (rs.results as any[]).filter(r => isTransferCandidate(r, nowMs)).sort(transferOrder);
  // 학생 이름 — 없으면 아이디만(못 읽어도 목록은 그대로)
  const names = new Map<string, string>();
  const uids = Array.from(new Set(rows.map(r => String(r.user_id || '')).filter(Boolean)));
  if (uids.length) {
    const nr = await selectInChunks<any>(env.DB, uids,
      (ph) => `SELECT user_id, korean_name FROM students_erp WHERE user_id IN (${ph})`, { swallowErrors: true });
    for (const n of nr) if (n.korean_name) names.set(String(n.user_id), String(n.korean_name));
  }
  for (const r of rows) r.__name = r.student_name || names.get(String(r.user_id || '')) || null;
  return rows;
}

export interface Cafe24Remaining {
  known: boolean; failed: boolean; c24_ids: string[]; names: string[];
  count: number; students: number; first_date: string | null; last_date: string | null;
  items: { user_id: string; name: string | null; count: number; next_date: string; next_time: string; last_date: string }[];
}

/** 카페24 예약 중 이 강사(원부 번호) 것 — 여기서는 «세기» 만 한다(바꾸는 곳은 카페24). */
export async function loadCafe24Remaining(env: any, teacherId: string, nowMs: number): Promise<Cafe24Remaining> {
  const empty: Cafe24Remaining = { known: false, failed: false, c24_ids: [], names: [], count: 0, students: 0, first_date: null, last_date: null, items: [] };
  let ids: string[] = [];
  try {
    const rs: any = await env.DB.prepare(
      `SELECT DISTINCT CAST(teacher_id AS TEXT) AS c24 FROM teacher_payroll_auto WHERE teacher_id IS NOT NULL`).all();
    ids = ((rs?.results || []) as any[]).map(r => String(r.c24 || '')).filter(Boolean);
  } catch { return { ...empty, failed: true }; }
  const links = await loadTeacherLinks(env, ids);
  const mine: string[] = [], names: string[] = [];
  for (const [c24, l] of links) {
    if (String(l.teacherId ?? '') === String(teacherId) || String(l.leftTeacherId ?? '') === String(teacherId)) {
      mine.push(c24);
      if (l.name && !names.includes(l.name)) names.push(l.name);
    }
  }
  if (!mine.length) return empty;
  let failed = false;
  const rows = await selectInChunks<any>(env.DB, mine,
    (ph) => `SELECT user_id, date, joined_at FROM attendance
              WHERE room_id LIKE 'c24-%' AND CAST(teacher_uid AS TEXT) IN (${ph}) AND date >= ? AND joined_at > ?
              ORDER BY joined_at LIMIT 5000`,
    { tail: [kstYmd(nowMs), nowMs], swallowErrors: true, onChunkError: () => { failed = true; } });
  // ⚠️ 한도(5000)에 닿았으면 «더 있을 수 있다» — 조용히 잘린 숫자를 사실처럼 말하지 않는다(화면이 «⚠ 실제보다 적을 수 있음»)
  if (rows.length >= 5000) failed = true;
  const byUser = new Map<string, { count: number; next: number; last: string }>();
  let first: string | null = null, last: string | null = null;
  for (const r of rows) {
    const u = String(r.user_id || ''); if (!u) continue;
    const at = Number(r.joined_at) || 0; const d = String(r.date || '');
    const g = byUser.get(u) || { count: 0, next: Infinity, last: '' };
    g.count++; if (at < g.next) g.next = at; if (d > g.last) g.last = d;
    byUser.set(u, g);
    if (d && (!first || d < first)) first = d;
    if (d && (!last || d > last)) last = d;
  }
  const nm = new Map<string, string>();
  const users = Array.from(byUser.keys());
  if (users.length) {
    const nr = await selectInChunks<any>(env.DB, users,
      (ph) => `SELECT user_id, korean_name FROM students_erp WHERE user_id IN (${ph})`, { swallowErrors: true });
    for (const n of nr) if (n.korean_name) nm.set(String(n.user_id), String(n.korean_name));
  }
  const items = users.map(u => {
    const g = byUser.get(u)!;
    const k = new Date(g.next + KST).toISOString();
    return { user_id: u, name: nm.get(u) || null, count: g.count, next_date: k.slice(0, 10), next_time: k.slice(11, 16), last_date: g.last };
  }).sort((a, b) => (a.next_date + a.next_time < b.next_date + b.next_time ? -1 : 1));
  return { known: true, failed, c24_ids: mine, names, count: rows.length, students: users.length, first_date: first, last_date: last, items: items.slice(0, 100) };
}

/** 화면에 내려줄 한 줄 — 원본 행 전체를 내보내지 않는다(필요한 칸만). */
function outRow(r: any) {
  return {
    id: String(r.id), user_id: r.user_id || null, student_name: r.__name || null,
    date: String(r.scheduled_date ?? '').trim() || null, day_of_week: r.day_of_week ?? null,
    start_time: r.start_time || null, duration_min: r.duration_min ?? null, status: r.status || null,
    kind: transferKindOf(r.source), weekly: !String(r.scheduled_date ?? '').trim(),
    move_version: scheduleMoveVersion(r),
  };
}

type Result = { status: number; body: any };
const bad = (status: number, error: string, message: string): Result => ({ status, body: { ok: false, error, message } });

/** POST /api/admin/teacher-profiles/:id { action:'transfer_preview' | 'transfer_apply' } — 라우트는 부르기만 한다. */
export async function handleTeacherClassTransfer(env: any, actor: any, profileId: number, body: any, nowMs: number): Promise<Result> {
  const act = String(body?.action || '');
  if (act !== 'transfer_preview' && act !== 'transfer_apply') return bad(400, 'unknown_action', '알 수 없는 요청입니다.');

  // 🔒 본사 전용 — 담당 강사 변경과 같은 게이트(강사·지사·대리점·«모름» 은 막는다)
  let scopeType: string | null = null;
  try {
    const s: any = await env.DB.prepare(`SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`).bind(actor?.username || '').first();
    scopeType = s?.scope_type || null;
  } catch { scopeType = null; }
  const deny = teacherMoveDenyReason({ ok: !!actor?.ok, isTeacher: !!actor?.isTeacher, scopeType });
  if (deny) return bad(deny.status, deny.error, deny.message);

  let prof: any = null;
  try {
    prof = await env.DB.prepare(`SELECT id, korean_name, english_name, status, linked_teacher_id FROM teacher_profiles WHERE id = ?`).bind(profileId).first();
  } catch { return bad(503, 'lookup_failed', '강사 정보를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
  if (!prof) return bad(404, 'not_found', '강사 프로필을 찾을 수 없습니다.');
  const fromTid = prof.linked_teacher_id != null ? String(prof.linked_teacher_id) : '';
  if (!fromTid) return bad(409, 'not_linked', '이 프로필이 강사 원부(급여·스케줄)와 연결돼 있지 않아 수업을 찾을 수 없습니다. 「강사 사진 연결」에서 먼저 연결해 주세요.');

  let teachers: any[] = [];
  try {
    const t: any = await env.DB.prepare(`SELECT id, name, active FROM teachers`).all();
    if (!t || t.success === false || !Array.isArray(t.results)) throw new Error('teachers');
    teachers = t.results;
  } catch { return bad(503, 'lookup_failed', '강사 원부를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
  const from = teachers.find(t => String(t.id) === fromTid);
  const targets = teachers.filter(t => Number(t.active) === 1 && String(t.id) !== fromTid)
    .map(t => ({ id: String(t.id), name: String(t.name || '') }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const toTid = body?.to_teacher_id != null && String(body.to_teacher_id).trim() !== '' ? String(body.to_teacher_id).trim() : '';
  const to = toTid ? targets.find(t => t.id === toTid) : null;
  if (toTid && !to) return bad(400, 'target_invalid', '넘겨받을 강사는 «활동중» 인 다른 강사여야 합니다.');

  let rows: any[];
  try { rows = await loadTransferRows(env, fromTid, nowMs); }
  catch { return bad(503, 'lookup_failed', '남은 수업을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.'); }

  if (act === 'transfer_apply') {
    const p = parseTransferApply(body);
    if (p.ok === false) return bad(400, p.error, p.message);
    if (!to) return bad(400, 'target_invalid', '넘겨받을 강사는 «활동중» 인 다른 강사여야 합니다.');
    // 🔒 이 경로로는 «이 강사의 남은 수업» 만 옮긴다 — 아무 번호나 받아 옮기는 통로가 되지 않게.
    const cand = new Set(rows.map(r => String(r.id)));
    const stray = p.ids.filter(id => !cand.has(id));
    if (stray.length) return { status: 409, body: { ok: false, error: 'not_candidate', message: '목록이 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.', ids: stray } };
    /* 👥 묶음 보호를 서버가 «넘기는 순간» 다시 판정한다(TOCTOU) — 미리보기 뒤에 넘겨받을 강사에게 같은 시각 수업이
       새로 생겼거나, 화면을 거치지 않은 요청이어도 1:1 이 조용히 그룹이 되지 않게. 사람이 고른 줄(allow_group_ids)만 통과. */
    let facts: any;
    try { facts = await loadScheduleMoveFacts(env); }
    catch { return bad(503, 'availability_check_failed', '넘겨받을 강사의 시간을 확인하지 못했습니다. 다시 시도해 주세요.'); }
    const today = kstYmd(nowMs);
    const byId = new Map(rows.map(r => [String(r.id), r]));
    const unapproved = p.ids.filter(id => !p.allowGroup.has(id)
      && groupMembersFor({ ...byId.get(id), teacher_id: to.id }, facts.rows, to.id, cand, today).length > 0);
    if (unapproved.length) return { status: 409, body: { ok: false, error: 'group_not_allowed',
      message: '넘겨받을 강사의 다른 수업과 같은 시각이라 묶음(그룹) 수업이 되는 줄이 있습니다. 목록을 새로고침해 확인한 뒤 골라 주세요.', ids: unapproved } };
    const reason = `강사 인계(퇴사·비활동): ${from?.name || '#' + fromTid} → ${to.name}`;
    const moved: string[] = [];
    const chunks = chunkIds(p.ids);
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      const expected: Record<string, string> = {};
      for (const id of ch) expected[id] = p.expected[id];
      // 👥 묶음 허용은 엔진 «안» 에서도 판정한다(스냅샷과 같은 사실 위 — 바깥 검사와 엔진 사이에 생긴 수업까지)
      const res: any = await moveSchedulesAtomically(env, actor, { ids: ch, expected, patch: { teacher_id: to.id }, reason },
        undefined, { groupJoin: { allow: p.allowGroup, ignore: cand } });
      if (!res || !res.ok) {
        return { status: moved.length ? 207 : (Number(res?.status) || 409), body: {
          ok: false, error: res?.error || 'move_failed', message: res?.message || '수업을 옮기지 못했습니다.',
          moved: moved.length, moved_ids: moved, failed_ids: ch, not_tried: chunks.slice(i + 1).flat(),
        } };
      }
      moved.push(...ch);
    }
    return { status: 200, body: { ok: true, moved: moved.length, moved_ids: moved, to } };
  }

  // ── 미리보기 ──
  const out = rows.map(outRow);
  let movable = 0;
  if (to) {
    let facts: any;
    try { facts = await loadScheduleMoveFacts(env); }
    catch { return bad(503, 'availability_check_failed', '넘겨받을 강사의 시간을 확인하지 못했습니다. 다시 시도해 주세요.'); }
    /* 넘길 줄을 모두 «새 강사 것» 으로 바꿔 둔 사실 위에서 판정한다 — 넘길 줄끼리의 겹침도 엔진처럼 잡힌다
       (moveSchedulesAtomically 의 «옮길 줄끼리» 두 번째 검사와 같은 뜻). 같은 시각·같은 길이 묶음은 엔진이 허용한다. */
    const ids = new Set(rows.map(r => String(r.id)));
    const mod = { ...facts, rows: facts.rows.map((r: any) => ids.has(String(r.id)) ? { ...r, teacher_id: to.id } : r) };
    const today = kstYmd(nowMs);
    for (let i = 0; i < rows.length; i++) {
      const dest = { ...rows[i], teacher_id: to.id };
      let c: any = null;
      try { c = await findScheduleMoveConflicts(env, dest, to.name, [rows[i].id], mod); }
      catch { c = { error: 'availability_unknown', message: '확인하지 못했습니다.' }; }
      if (c) {
        (out[i] as any).verdict = 'blocked';
        (out[i] as any).reason = c.error || 'conflict';
        (out[i] as any).message = c.message || null;
        continue;
      }
      /* 👥 엔진은 «같은 강사·같은 시각·같은 길이» 를 묶음(그룹) 수업으로 보고 허용한다(schedule-conflict.ts 의 exact-slot 계약).
         한 건씩 옮길 때는 사람이 눈으로 보지만, 수십 건을 한꺼번에 넘길 때 1:1 수업이 «조용히» 그룹이 되면 안 된다.
         그래서 넘겨받을 강사의 «기존» 수업과 같은 자리에 들어가는 줄은 'group' 으로 따로 알려 준다 —
         화면은 기본으로 빼 두고, 사람이 골라야만 넘긴다. (넘길 줄끼리의 기존 묶음은 그대로 묶음이라 알리지 않는다) */
      const groupWith = groupMembersFor(dest, facts.rows, to.id, ids, today);
      if (groupWith.length) {
        (out[i] as any).verdict = 'group';
        (out[i] as any).group_with = groupWith.slice(0, 3);
        continue;
      }
      (out[i] as any).verdict = 'ok';
      movable++;
    }
  }
  const cafe24 = await loadCafe24Remaining(env, fromTid, nowMs).catch(() => ({ known: false, failed: true } as any));
  return { status: 200, body: {
    ok: true,
    profile: { id: String(prof.id), name: prof.korean_name || prof.english_name || null, status: prof.status || null },
    teacher: { id: fromTid, name: from?.name || null, active: from ? Number(from.active) === 1 : null },
    summary: summarizeTransfer(rows), rows: out, cafe24, targets, to: to || null, movable: to ? movable : null,
    group_count: to ? out.filter((x: any) => x.verdict === 'group').length : null,
  } };
}
