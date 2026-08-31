/**
 * c24-mirror.ts — 카페24 수업 → 망고아이 시간표(class_schedules) 미러 (2026-08-31)
 *
 * ═══ 왜 만들었나 ═══
 *   카페24 예약은 망고아이로 자동으로 넘어오지 않는다. 그래서 파일럿 기간에는
 *   같은 수업을 **두 번**(카페24 + 망고아이) 잡아야 했고, 언젠가 «한날 한시» 에
 *   전환할 때는 그때까지 한 번도 안 해 본 일을 급하게 해야 한다.
 *   → 지금부터 매일 «옮겨 봤다면 어떻게 됐을지» 를 세어 두면, 전환일에는
 *     스위치만 올리면 된다. 이 파일이 그 엔진이다.
 *
 * ═══ 3단계 ═══
 *   ① off       — 그림자. 계획만 계산해 리포트로 보여 주고 **아무것도 안 쓴다**.
 *   ② whitelist — 켠 강사만 실제로 class_schedules 를 만든다(파일럿).
 *   ③ all       — 전원. 전환일에 여기로 올린다. 문제가 생기면 ②로 되돌린다.
 *   ⚠️ 이 파일은 ①의 «계획 계산» 까지만 담당한다. 실제 쓰기(②③)는 승인 후 별도로 붙인다.
 *
 * ═══ 절대 규칙 (사고 방지) ═══
 *   1. 미러가 만든 행은 `source='c24-mirror'` **하나만** 손댄다.
 *      파일럿 수업(`adm-enroll:*`)·손으로 넣은 수업은 이름이 달라 애초에 대상이 아니다.
 *   2. 사람이 망고아이에서 고치면 그 수정이 **이긴다**(2026-08-31 사장님 결정).
 *      고치는 순간 `source='c24-mirror:manual'` 로 도장이 찍히고, 미러는 그 행을
 *      영영 안 건드린다. 대신 «카페24와 어긋남» 으로 리포트에 남긴다.
 *   3. 강사·학생을 **못 찾으면 만들지 않는다**. 번호로 추측해 이었다가 남의 이름이
 *      붙은 사고가 이 저장소에 세 번 있었다(CLAUDE.md 2장). 모르면 비워 두고 알린다.
 *   4. 창(window)은 **양쪽 끝을 반드시** 지정한다. 상한 없이 지우면 미래 예약이
 *      전멸한다(`cafe24-sync.ts` importCafe24Attendance 주석의 교훈).
 *
 * ═══ 강사 번호 (제일 자주 밟는 함정) ═══
 *   카페24 강사번호(9~196) ≠ 원부 `teachers.id`(1~30). 겹치는 자리에서 «다른 사람» 이다.
 *   그래서 번호로 직접 잇지 않고 **이름을 거쳐** 잇는다:
 *     카페24 번호 → teacher_payroll_auto(번호와 이름을 함께 받은 유일한 표) → 이름
 *                 → 정규화 → teachers 에서 **유일하게** 맞을 때만 원부번호
 *   ⛔ `teachers` 를 번호로 직접 조회하지 말 것.
 *   ℹ️ 같은 판정이 api-admin.ts 의 loadCafe24TeacherMap() 에도 있다. 여기서 import 하지
 *      않는 이유는 순환 참조(api-admin → accounting-reports → 이 파일)를 만들기 때문이고,
 *      그래서 **두 함수가 같은 답을 내는지 하니스가 실제로 돌려서 대조**한다
 *      (`test-harness/c24_mirror_harness.mjs`). enroll-ops.ts 가 쓰는 방식과 같다.
 */

import { selectInChunks } from './d1-chunk';   // 🔢 IN 목록은 공용 헬퍼로 — D1 바인드 100개 한도

/** 미러 동작 단계 */
export type MirrorMode = 'off' | 'whitelist' | 'all';

/** 미러가 만든 행임을 나타내는 표식 — 이 값이 아닌 행은 미러가 절대 안 건드린다 */
export const MIRROR_SOURCE = 'c24-mirror';
/** 사람이 손댄 미러 행 — 「사람 손이 이긴다」의 도장 */
export const MIRROR_SOURCE_MANUAL = 'c24-mirror:manual';

/** 카페24에서 읽어 온 수업 한 건 (Neo4j :Class 그대로) */
export interface C24Class {
  class_id: string;
  user_id: string;          // 학생 계정 (students_erp.user_id 와 같은 체계)
  date: string;             // YYYY-MM-DD
  start_ms: number;
  end_ms: number;
  class_state: number;      // 2 = 완료, 그 외 = 예정
  teacher_id: string | null;   // 카페24 강사번호
}

/** 망고아이에 이미 있는 수업 한 건 (class_schedules) */
export interface ExistingRow {
  id: number;
  user_id: string;
  teacher_id: string | null;
  scheduled_date: string | null;
  start_time: string | null;
  duration_min: number | null;
  source: string | null;
  status: string | null;
}

/** 카페24 강사번호 → 이름·원부번호 */
export interface TeacherLink { name: string | null; teacherId: string | null; }

export type Verdict =
  | 'ok'               // 그대로 만들면 됨
  | 'already'          // 이미 미러로 만들어져 있고 값도 같음
  | 'update'           // 미러 행은 있는데 카페24 쪽이 바뀜 → 고쳐야 함
  | 'manual_locked'    // 사람이 손댐 — 건드리지 않는다
  | 'diverged'         // 사람이 손댄 값과 카페24 값이 다름 → 사람이 판단할 일
  | 'no_teacher'       // 강사를 못 이음
  | 'no_student'       // 학생을 못 찾음
  | 'not_whitelisted'  // 아직 안 켠 강사
  | 'conflict';        // 그 시간에 다른 출처(파일럿·수동) 수업이 이미 있음

export interface PlanRow {
  class_id: string;
  date: string;
  start_time: string;
  duration_min: number;
  c24_teacher_id: string | null;
  teacher_name: string | null;
  teacher_id: string | null;
  student_uid: string;
  student_name: string | null;
  verdict: Verdict;
  detail?: string;
}

/* ═══════════════ 순수 함수 (하니스가 이걸 실제로 돌린다) ═══════════════ */

/** 강사 이름 정규화 — api-admin.ts 의 normTeacherName 과 «같은 규칙» 이어야 한다(하니스가 대조) */
export function mirrorNormTeacherName(v: any): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/^teacher\s+/, '');
}

/** epoch ms → KST 'HH:MM'. 카페24 start_ms 는 UTC 기준이라 +9h 해서 읽는다. */
export function msToKstHm(ms: number): string {
  const d = new Date(Number(ms) + 9 * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 수업 길이(분). 값이 이상하면 기본 20분 — 0분·음수·하루치가 들어오는 것을 막는다. */
export function classMinutes(start: number, end: number): number {
  const raw = Math.round((Number(end) - Number(start)) / 60000);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 240) return 20;
  return raw;
}

/** 같은 수업인가 — 학생·날짜·시작시각이 모두 같으면 같은 수업으로 본다. */
function sameSlot(a: { user_id: string; date: string; time: string }, b: ExistingRow): boolean {
  return String(b.user_id || '') === a.user_id
      && String(b.scheduled_date || '') === a.date
      && String(b.start_time || '').slice(0, 5) === a.time;
}

/**
 * 🧠 미러 계획 — **이 함수가 이 파일의 심장이다.**
 *   순수 함수라 DB·Neo4j 없이 그대로 돌려 볼 수 있다(하니스가 그렇게 검증한다).
 *
 * @param classes  카페24에서 읽은 수업들
 * @param links    카페24 강사번호 → 이름·원부번호
 * @param students 존재하는 학생 계정 → 이름 (없으면 no_student)
 * @param existing 창 안에 이미 있는 class_schedules 행들
 * @param mode     off | whitelist | all
 * @param enabled  whitelist 모드에서 켜 둔 원부번호 집합
 */
export function planMirror(
  classes: C24Class[],
  links: Map<string, TeacherLink>,
  students: Map<string, string | null>,
  existing: ExistingRow[],
  mode: MirrorMode,
  enabled: Set<string>,
): PlanRow[] {
  const out: PlanRow[] = [];

  for (const c of classes) {
    const date = String(c.date || '');
    const time = msToKstHm(c.start_ms);
    const dur = classMinutes(c.start_ms, c.end_ms);
    const uid = String(c.user_id || '');
    const c24tid = c.teacher_id == null || c.teacher_id === '' ? null : String(c.teacher_id);
    const link = c24tid ? links.get(c24tid) : undefined;
    const teacherName = link?.name ?? null;
    const teacherId = link?.teacherId ?? null;

    const base = {
      class_id: String(c.class_id || ''),
      date, start_time: time, duration_min: dur,
      c24_teacher_id: c24tid, teacher_name: teacherName, teacher_id: teacherId,
      student_uid: uid, student_name: students.get(uid) ?? null,
    };
    const push = (verdict: Verdict, detail?: string) => out.push({ ...base, verdict, detail });

    // ── 1) 만들 수 없는 것부터 걸러 낸다. ⛔ 추측해서 잇지 않는다 ──
    if (!uid || !students.has(uid)) { push('no_student', uid ? `학생 계정 ${uid} 없음` : '학생 없음'); continue; }
    if (!c24tid) { push('no_teacher', '카페24에 강사 번호가 없음'); continue; }
    if (!teacherId) {
      push('no_teacher', teacherName
        ? `«${teacherName}»(카페24 ${c24tid}) 이 강사 원부와 안 이어짐`
        : `카페24 ${c24tid} 번 이름을 찾지 못함`);
      continue;
    }

    // ── 2) 이미 있는 행과 맞춰 본다 ──
    const mine = existing.filter(e => String(e.status || '') !== 'cancelled' && sameSlot({ user_id: uid, date, time }, e));
    const manual = existing.find(e =>
      String(e.source || '') === MIRROR_SOURCE_MANUAL
      && String(e.user_id || '') === uid
      && String(e.scheduled_date || '') === date);
    if (manual) {
      // 🔒 사람이 손댄 수업. 미러는 손대지 않는다. 값이 다르면 «어긋남» 으로 알린다.
      const sameTime = String(manual.start_time || '').slice(0, 5) === time;
      if (sameTime) push('manual_locked', '사람이 고친 수업 — 미러가 건드리지 않습니다');
      else push('diverged', `카페24 ${time} ↔ 망고아이 ${String(manual.start_time || '').slice(0, 5)} (사람이 고침)`);
      continue;
    }
    const mirrored = mine.find(e => String(e.source || '') === MIRROR_SOURCE);
    if (mirrored) {
      const sameTeacher = String(mirrored.teacher_id || '') === teacherId;
      const sameDur = Number(mirrored.duration_min || 0) === dur;
      if (sameTeacher && sameDur) push('already');
      else push('update', sameTeacher ? `수업 길이 ${mirrored.duration_min}분 → ${dur}분` : `강사 변경 → ${teacherName}`);
      continue;
    }
    const other = mine.find(e => String(e.source || '') !== MIRROR_SOURCE);
    if (other) { push('conflict', `그 시간에 이미 수업이 있습니다 (${other.source || '출처 미상'})`); continue; }

    // ── 3) 만들 수 있다. 모드에 따라 실제로 만들지가 갈린다 ──
    if (mode === 'all' || (mode === 'whitelist' && enabled.has(teacherId))) push('ok');
    else push('not_whitelisted', mode === 'off' ? '그림자 단계 — 아직 만들지 않습니다' : '아직 켜지 않은 강사');
  }

  return out;
}

/** 판정별 건수 — 화면 성적표의 윗줄 */
export function summarize(rows: PlanRow[]): Record<Verdict, number> {
  const z: Record<Verdict, number> = {
    ok: 0, already: 0, update: 0, manual_locked: 0, diverged: 0,
    no_teacher: 0, no_student: 0, not_whitelisted: 0, conflict: 0,
  };
  for (const r of rows) z[r.verdict]++;
  return z;
}

/* ═══════════════ 여기부터는 DB·Neo4j 를 만진다 (읽기만) ═══════════════ */

export interface MirrorEnv { DB: D1Database; [k: string]: any; }

/** 설정·화이트리스트 표 — 없으면 만든다(모드 기본값 off = 그림자) */
export async function ensureMirrorTables(env: MirrorEnv): Promise<void> {
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS c24_mirror_config (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER)`);
  } catch { /* 표가 이미 있으면 그대로 */ }
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS c24_mirror_teachers (teacher_id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1, note TEXT, updated_by TEXT, updated_at INTEGER)`);
  } catch { /* 같음 */ }
}

/** 지금 모드. 읽기 실패·미설정이면 **가장 안전한 'off'**(그림자)로 떨어진다. */
export async function getMirrorMode(env: MirrorEnv): Promise<MirrorMode> {
  try {
    const r: any = await env.DB.prepare(`SELECT v FROM c24_mirror_config WHERE k='mode' LIMIT 1`).first();
    const v = String(r?.v || '');
    if (v === 'all' || v === 'whitelist') return v;
  } catch { /* 표 없음 = 아직 안 켬 */ }
  return 'off';
}

/** 켜 둔 강사(원부번호) 집합 */
export async function getMirrorTeachers(env: MirrorEnv): Promise<Set<string>> {
  const s = new Set<string>();
  try {
    const rs: any = await env.DB.prepare(`SELECT teacher_id FROM c24_mirror_teachers WHERE enabled = 1`).all();
    for (const r of (rs.results || [])) s.add(String(r.teacher_id));
  } catch { /* 표 없음 = 켠 강사 없음 */ }
  return s;
}

/** 카페24 강사번호 → 이름·원부번호 (파일 머리말의 «강사 번호» 규칙 그대로) */
export async function loadTeacherLinks(env: MirrorEnv, uids: (string | null)[]): Promise<Map<string, TeacherLink>> {
  const out = new Map<string, TeacherLink>();
  const want = new Set(uids.map(u => String(u ?? '').trim()).filter(Boolean));
  if (!want.size) return out;

  // 원부 이름 → id. 같은 이름이 둘 이상이면 «잇지 않음»(null) 으로 못 박는다.
  const byName = new Map<string, string | null>();
  try {
    const rs: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE active = 1`).all();
    for (const t of (rs.results || [])) {
      const k = mirrorNormTeacherName(t.name);
      if (!k) continue;
      byName.set(k, byName.has(k) ? null : String(t.id));
    }
  } catch { /* 원부가 없으면 이름만 준다 */ }

  try {
    // 오름차순 — 같은 번호가 여러 달 있으면 «최근 달 이름» 이 남는다(개명 반영)
    const rs: any = await env.DB.prepare(
      `SELECT CAST(teacher_id AS TEXT) AS c24, teacher_name FROM teacher_payroll_auto
        WHERE teacher_name IS NOT NULL AND teacher_name <> '' ORDER BY year ASC, month ASC`
    ).all();
    for (const r of (rs.results || [])) {
      const c24 = String(r.c24 || '');
      if (!want.has(c24)) continue;
      const nm = String(r.teacher_name || '').trim();
      out.set(c24, { name: nm || null, teacherId: byName.get(mirrorNormTeacherName(nm)) ?? null });
    }
  } catch { /* 급여 표가 없으면 이름 없이 진행 */ }
  return out;
}

/** 학생 계정 존재 확인 (있으면 이름도) — 없는 계정에는 수업을 만들지 않는다
 *  ⚠️ IN 목록은 손으로 자르지 않는다. D1 바인드 100개 한도는 공용 헬퍼가 센다(CLAUDE.md 2장).
 *     swallowErrors — students_erp 가 없는 옛 DB 에서도 «학생 못 찾음» 으로 이어져야 하고,
 *     그 결과는 «만들지 않는» 쪽이라 조용히 비어도 안전하다. */
export async function loadStudents(env: MirrorEnv, uids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const want = Array.from(new Set(uids.filter(Boolean)));
  if (!want.length) return out;
  const rows = await selectInChunks<any>(
    env.DB, want,
    (ph) => `SELECT user_id, korean_name FROM students_erp WHERE user_id IN (${ph})`,
    { swallowErrors: true },
  );
  for (const r of rows) out.set(String(r.user_id), r.korean_name ? String(r.korean_name) : null);
  return out;
}

/** 창 안의 기존 시간표. ⚠️ 양쪽 경계 필수 */
export async function loadExisting(env: MirrorEnv, since: string, until: string): Promise<ExistingRow[]> {
  try {
    const rs: any = await env.DB.prepare(
      `SELECT id, user_id, teacher_id, scheduled_date, start_time, duration_min, source, status
         FROM class_schedules
        WHERE scheduled_date IS NOT NULL AND scheduled_date >= ? AND scheduled_date <= ?`
    ).bind(since, until).all();
    return (rs.results || []) as ExistingRow[];
  } catch { return []; }
}

/** 카페24 :Class 읽기 — importCafe24Attendance 와 «같은 모양» 으로 뽑는다 */
export async function fetchC24Classes(
  env: MirrorEnv,
  runCypher: (env: any, q: string, p: Record<string, unknown>, m: 'READ' | 'WRITE') => Promise<{ fields: string[]; values: any[][] }>,
  since: string, until: string, limit = 3000,
): Promise<C24Class[]> {
  const { fields, values } = await runCypher(env,
    `MATCH (c:Class) WHERE c.date >= $since AND c.date <= $until
      RETURN c.class_id AS class_id, c.user_id AS user_id, c.start_ms AS start_ms, c.end_ms AS end_ms,
             c.date AS date, c.class_state AS class_state,
             coalesce(c.teacher_id, c.teacher_no, c.t_id) AS teacher_id
      ORDER BY c.date, c.start_ms LIMIT $lim`,
    { since, until, lim: limit }, 'READ');
  return values.map(row => {
    const o: any = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
    return {
      class_id: String(o.class_id ?? ''),
      user_id: String(o.user_id ?? ''),
      date: String(o.date ?? ''),
      start_ms: Number(o.start_ms) || 0,
      end_ms: Number(o.end_ms) || 0,
      class_state: Number(o.class_state) || 0,
      teacher_id: o.teacher_id == null ? null : String(o.teacher_id),
    };
  });
}

/**
 * 📋 그림자 리포트 — «옮겼다면 어떻게 됐을지» 를 계산만 한다. **아무것도 쓰지 않는다.**
 *   창 기본값: 오늘 ~ +14일 (KST). 양쪽 경계를 반드시 준다.
 */
export async function c24MirrorReport(
  env: MirrorEnv,
  runCypher: (env: any, q: string, p: Record<string, unknown>, m: 'READ' | 'WRITE') => Promise<{ fields: string[]; values: any[][] }>,
  opt: { since?: string; until?: string } = {},
): Promise<{
  ok: true; mode: MirrorMode; since: string; until: string;
  total: number; summary: Record<Verdict, number>;
  by_date: { date: string; total: number; ok: number; blocked: number }[];
  rows: PlanRow[];
}> {
  await ensureMirrorTables(env);
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const since = opt.since || kstToday;
  const until = opt.until || new Date(Date.now() + 9 * 3600 * 1000 + 14 * 86400000).toISOString().slice(0, 10);

  const [mode, enabled] = await Promise.all([getMirrorMode(env), getMirrorTeachers(env)]);
  const classes = await fetchC24Classes(env, runCypher, since, until);
  const [links, students, existing] = await Promise.all([
    loadTeacherLinks(env, classes.map(c => c.teacher_id)),
    loadStudents(env, classes.map(c => c.user_id)),
    loadExisting(env, since, until),
  ]);

  const rows = planMirror(classes, links, students, existing, mode, enabled);
  const summary = summarize(rows);

  const byDate = new Map<string, { date: string; total: number; ok: number; blocked: number }>();
  for (const r of rows) {
    const d = byDate.get(r.date) || { date: r.date, total: 0, ok: 0, blocked: 0 };
    d.total++;
    if (r.verdict === 'ok' || r.verdict === 'already') d.ok++;
    if (r.verdict === 'no_teacher' || r.verdict === 'no_student' || r.verdict === 'conflict') d.blocked++;
    byDate.set(r.date, d);
  }

  return {
    ok: true, mode, since, until,
    total: rows.length, summary,
    by_date: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
    rows,
  };
}
