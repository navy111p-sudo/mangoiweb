import { chunkBinds, placeholders } from './d1-chunk';

/** Admin-only compatibility projection. Never backfill identities, dates or scores.
 * Keep this separate from score normalization: roster duplicates must not multiply statistics.
 */
async function evaluationColumns(db: D1Database, table: string): Promise<Set<string>> {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if ((result as any).success === false || !Array.isArray(result.results)) throw new Error('evaluation_schema_unavailable');
  return new Set(result.results.map(row => row.name));
}

/** Student-detail writes must work whether the table began as legacy or canonical.
 * Only nullable columns are added; existing rows/constraints are never rewritten.
 */
export async function ensureStudentEvaluationDetailSchema(db: D1Database): Promise<void> {
  const have = await evaluationColumns(db, 'student_evaluations');
  const required = [
    ['user_id', 'TEXT'], ['student_uid', 'TEXT'], ['eval_at', 'INTEGER'],
    ['eval_type', 'TEXT'], ['level', 'TEXT'], ['score_speaking', 'REAL'],
    ['score_listening', 'REAL'], ['score_reading', 'REAL'], ['score_writing', 'REAL'],
    ['score_total', 'REAL'], ['evaluator', 'TEXT'], ['comment', 'TEXT'], ['next_goal', 'TEXT'],
    ['updated_at', 'INTEGER'],
  ];
  for (const [name, type] of required) {
    if (have.has(name)) continue;
    try { await db.exec(`ALTER TABLE student_evaluations ADD COLUMN ${name} ${type}`); }
    catch (error) {
      if (!(await evaluationColumns(db, 'student_evaluations')).has(name)) throw error;
    }
  }
}

const textValue = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
// Keep identifiers byte-for-byte for matching; trimming/case folding can pick another account.
const uidValue = (value: unknown): string => typeof value === 'string' && value.trim() ? value : '';

/** Date-only lesson values already describe a calendar date. Timestamps are milliseconds
 * (the writers' Date.now contract), or explicit-offset ISO strings. Never guess a timezone.
 */
export function evaluationKstDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const date = new Date(str + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === str ? str : null;
  }
  let ms: number;
  if (typeof value === 'number') ms = value;
  else if (/^-?\d+$/.test(str)) ms = Number(str);
  else if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(str)) ms = Date.parse(str);
  else return null;
  const date = new Date(ms + 9 * 3600 * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

export async function projectAdminEvaluationRecords(db: D1Database, rows: any[]): Promise<any[]> {
  const result = rows.map(row => {
    const canonicalUid = uidValue(row.student_uid);
    const legacyUid = uidValue(row.user_id);
    const conflict = !!canonicalUid && !!legacyUid && canonicalUid !== legacyUid;
    const uid = canonicalUid || legacyUid;
    const name = textValue(row.student_name);
    const teacher = textValue(row.teacher_name);
    const evaluator = textValue(row.evaluator);
    const lesson = evaluationKstDate(row.lesson_date);
    const evaluated = evaluationKstDate(row.eval_at);
    const recorded = evaluationKstDate(row.created_at);
    const dateSource = lesson ? 'lesson_date' : evaluated ? 'eval_at' : recorded ? 'created_at' : null;
    return {
      ...row,
      display_student_uid: uid || null,
      display_student_name: name || null,
      student_identity_status: conflict ? 'uid_conflict' : 'ok',
      student_name_status: name ? 'recorded' : conflict ? 'uid_conflict' : uid ? 'pending_lookup' : 'missing_uid',
      display_author_name: teacher || evaluator || null,
      display_author_role: teacher ? 'teacher' : evaluator ? 'evaluator' : null,
      display_date: lesson || evaluated || recorded,
      display_date_source: dateSource,
      // An invalid provided lesson/evaluation date must remain visible as a warning, even if a lower-priority date exists.
      date_status: (textValue(row.lesson_date) && !lesson) || (row.eval_at != null && row.eval_at !== '' && !evaluated)
        ? 'invalid_date' : dateSource ? 'ok' : 'missing',
    };
  });
  const ids = [...new Set(result.filter(row => row.student_name_status === 'pending_lookup').map(row => row.display_student_uid))];
  if (!ids.length) return result;
  const matches = new Map<string, any[]>();
  try {
    const have = await evaluationColumns(db, 'students_erp');
    if (!have.has('user_id')) throw new Error('roster_uid_unavailable');
    // A username/login_id is an account, not evidence of a real display name.
    const names = ['student_name', 'korean_name', 'english_name'].filter(name => have.has(name));
    // Use the shared bind bound, but inspect success explicitly (lookup failure is not no match).
    for (const chunk of chunkBinds(ids)) {
      const rs = await db.prepare(`SELECT user_id${names.map(name => ', ' + name).join('')} FROM students_erp WHERE user_id COLLATE BINARY IN (${placeholders(chunk.length)})`)
        .bind(...chunk).all<any>();
      if ((rs as any).success === false || !Array.isArray(rs.results)) throw new Error('roster_lookup_failed');
      for (const row of rs.results) {
        const list = matches.get(row.user_id) || [];
        list.push(row); matches.set(row.user_id, list);
      }
    }
    for (const row of result) {
      if (row.student_name_status !== 'pending_lookup') continue;
      const candidates = matches.get(row.display_student_uid) || [];
      if (candidates.length !== 1) {
        row.student_name_status = candidates.length ? 'ambiguous' : 'not_found';
        continue;
      }
      const name = names.map(key => textValue(candidates[0][key])).find(Boolean);
      row.display_student_name = name || null;
      row.student_name_status = name ? 'roster' : 'missing_name';
    }
  } catch {
    for (const row of result) if (row.student_name_status === 'pending_lookup') row.student_name_status = 'lookup_failed';
  }
  return result;
}

/** Preserve student-detail's legacy result contract. Its report UI still assumes the
 * student-detail rubric; canonical-only history needs a separate report adaptation.
 * Missing columns in an older canonical schema mean no legacy records, not a failed page.
 */
export async function readStudentAdminEvaluations(db: D1Database, uid: string, limit: number) {
  const have = await evaluationColumns(db, 'student_evaluations');
  if (!have.has('user_id')) return { success: true, results: [] };
  const order = have.has('eval_at') ? 'eval_at' : 'created_at';
  // These canonical writers gained legacy aliases only to satisfy NOT NULL schemas.
  // Their rows were not previously in this /100-only legacy report; keep them in
  // the normalized admin evaluation list until this separate report adopts rubrics.
  const legacyFeed = have.has('evaluation_source') ? " AND COALESCE(evaluation_source,'') NOT IN ('teacher_bulk','ai_lesson_report')" : '';
  const rs = await db.prepare(`SELECT * FROM student_evaluations WHERE user_id = ?${legacyFeed} ORDER BY ${order} DESC LIMIT ?`)
    .bind(uid, limit).all<any>();
  if ((rs as any).success === false || !Array.isArray(rs.results)) throw new Error('student_evaluations_unavailable');
  return rs;
}
