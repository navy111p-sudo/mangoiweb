/** Evaluation scores have different rubrics. Never infer a rubric from its numeric value.
 * Raw historical score columns are deliberately untouched; this is a read projection.
 */
export const EVALUATION_SCALES = {
  teacher_manual: 5,
  teacher_bulk: 10,
  teacher_ai_draft: 10,
  ai_lesson_report: 100,
  student_detail: 100,
} as const;

export function validEvaluationScores(values: unknown[], scale: number, min = 0): boolean {
  return values.every(value => value == null || (
    (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
    Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= scale
  ));
}

async function columns(db: D1Database, table: string): Promise<Set<string>> {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if ((result as any).success === false || !Array.isArray(result.results)) throw new Error('evaluation_schema_unavailable');
  return new Set(result.results.map(row => row.name));
}

/** Additive metadata only. No historical score or inferred provenance is persisted. */
export async function ensureEvaluationScoreSchema(db: D1Database): Promise<void> {
  const have = await columns(db, 'student_evaluations');
  for (const [name, type] of [['evaluation_source', 'TEXT'], ['score_scale', 'INTEGER']]) {
    if (have.has(name)) continue;
    try { await db.exec(`ALTER TABLE student_evaluations ADD COLUMN ${name} ${type}`); }
    catch (error) {
      // Another request may have added it. Other migration failures must not produce untyped writes.
      if (!(await columns(db, 'student_evaluations')).has(name)) throw error;
    }
  }
}

/** One SQL projection for the list and its full-dataset aggregate (independent of list LIMIT).
 * Legacy evidence:
 * - ai_lesson_reports.evaluation_id is the authoritative AI link, even for a score of 0 or 4.
 * - score_total-only records use the student-detail 100-point rubric.
 * - teacher-only chips + teacher/room/student identifiers identify the teacher UI's /5.
 *   Notes alone are insufficient: PATCH can add them to any record later.
 * Legacy bulk and unlinked bare overall scores cannot be reliably distinguished: exclude them.
 */
export async function evaluationScoreProjection(db: D1Database): Promise<string> {
  const have = await columns(db, 'student_evaluations');
  const col = (name: string) => have.has(name) ? `e.${name}` : 'NULL';
  const reports = await columns(db, 'ai_lesson_reports');
  const ai = reports.has('evaluation_id')
    ? 'e.id IN (SELECT evaluation_id FROM ai_lesson_reports WHERE evaluation_id IS NOT NULL)' : '0';
  const teacherFingerprint = `${col('note_chips')} IS NOT NULL AND ` +
    ['student_uid', 'teacher_uid', 'room_id'].map(name => `NULLIF(TRIM(${col(name)}), '') IS NOT NULL`).join(' AND ');
  const source = `CASE
    WHEN ${col('evaluation_source')} = 'legacy_unclassified' AND ${col('score_scale')} IS NULL THEN 'unknown'
    WHEN ${col('evaluation_source')} IS NOT NULL OR ${col('score_scale')} IS NOT NULL THEN
      CASE ${Object.entries(EVALUATION_SCALES).map(([name, scale]) =>
        `WHEN ${col('evaluation_source')} = '${name}' AND ${col('score_scale')} = ${scale} THEN '${name}'`).join('\n')}
      ELSE 'invalid_metadata' END
    WHEN ${ai} THEN 'ai_lesson_report'
    WHEN ${col('score_total')} IS NOT NULL AND ${col('score_overall')} IS NULL THEN 'student_detail'
    WHEN ${col('score_total')} IS NULL AND (${teacherFingerprint}) THEN 'teacher_manual'
    ELSE 'unknown' END`;
  return `WITH score_sources AS (
    SELECT e.*, ${col('score_total')} AS __score_total, ${col('score_overall')} AS __score_overall,
      ${source} AS score_source FROM student_evaluations e
  ), score_values AS (
    SELECT *, CASE WHEN score_source = 'student_detail' THEN __score_total ELSE __score_overall END AS score_value,
      CASE score_source ${Object.entries(EVALUATION_SCALES).map(([name, scale]) =>
        `WHEN '${name}' THEN ${scale}`).join(' ')} ELSE NULL END AS score_max
    FROM score_sources
  ), score_statuses AS (
    SELECT *, CASE
      WHEN score_source = 'invalid_metadata' THEN 'invalid_metadata'
      WHEN score_value IS NULL THEN 'missing'
      WHEN score_max IS NULL THEN 'unknown_scale'
      WHEN typeof(score_value) NOT IN ('integer', 'real') OR score_value < CASE WHEN score_source = 'teacher_manual' THEN 1 ELSE 0 END OR score_value > score_max THEN 'invalid_score'
      ELSE 'ok' END AS score_status
    FROM score_values
  ), normalized_evaluations AS (
    SELECT *, CASE WHEN score_status = 'ok' THEN score_value * 100.0 / score_max ELSE NULL END AS score_normalized_100
    FROM score_statuses
  )`;
}

export async function readAdminEvaluationScores(db: D1Database, limit: number, monthStart: number) {
  const projection = await evaluationScoreProjection(db);
  const rs = await db.prepare(`${projection} SELECT * FROM normalized_evaluations ORDER BY created_at DESC LIMIT ?`).bind(limit).all<any>();
  const stats: any = await db.prepare(`${projection}
    SELECT COUNT(*) AS total, AVG(score_normalized_100) AS avg_score, 100 AS avg_score_scale,
      COUNT(score_normalized_100) AS scored_count,
      COALESCE(SUM(CASE WHEN score_status NOT IN ('ok', 'missing') THEN 1 ELSE 0 END), 0) AS excluded_score_count,
      COALESCE(SUM(CASE WHEN score_status = 'unknown_scale' THEN 1 ELSE 0 END), 0) AS unknown_scale_count,
      COALESCE(SUM(CASE WHEN score_status IN ('invalid_score', 'invalid_metadata') THEN 1 ELSE 0 END), 0) AS invalid_score_count,
      COALESCE(SUM(CASE WHEN score_status = 'missing' THEN 1 ELSE 0 END), 0) AS missing_score_count,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS this_month,
      SUM(parent_notified) AS notified, SUM(viewed_by_parent) AS viewed
    FROM normalized_evaluations`).bind(monthStart).first();
  if ((rs as any).success === false || !Array.isArray(rs.results) || !stats) throw new Error('evaluation_scores_unavailable');
  const rows = rs.results.map(({ __score_total, __score_overall, ...row }) => row);
  return { rows, stats };
}
