/**
 * teacher-match.ts — 학생⇄강사 실시간 매칭 추천 (Neo4j Aura HTTP Query API)
 *
 * 배경 / 기존 시스템과의 관계
 * ─────────────────────────────────────────────────────────────────────────
 *   '강사관리 > MBTI' 메뉴는 강사 등록 시 MBTI·취미/관심사·수업 스타일을 받는다.
 *   현재는 RDB 조건문(LIKE/AND) 매칭이라 공통 관심사 "개수" 합산·정렬이 비싸다.
 *   본 모듈은 동일 데이터를 Neo4j 속성 그래프로 보고, 학생의 관심사+MBTI 궁합을
 *   점수화해 고득점 강사를 실시간 추천한다. 모델 정본은 ../teacher-match.cypher.
 *
 *   런타임이 Cloudflare Workers라 Bolt 드라이버(neo4j-driver, TCP)는 못 쓴다.
 *   대신 Neo4j Aura의 HTTP "Query API"(/db/{db}/query/v2)로 같은 Cypher를 전송한다.
 *
 * 환경변수(wrangler secret put 으로 설정 — 미설정 시 503 으로 graceful degrade)
 *   NEO4J_QUERY_URL : 예) https://<dbid>.databases.neo4j.io/db/neo4j/query/v2
 *   NEO4J_USER      : 예) neo4j
 *   NEO4J_PASSWORD  : Aura 인스턴스 비밀번호
 *
 * 외부 공개(서비스 레이어)
 *   recommendTeachers(env, studentId, limit) : 점수 내림차순 강사 배열
 *   teacherMatchRouter(request, env)         : 독립 라우터 — /api/admin/teacher-match/*
 *     GET /api/admin/teacher-match/recommend?student_id=STU001&limit=5
 */

export interface TeacherMatchEnv {
  DB?: D1Database;            // ETL 소스(teacher_mbti · students_erp). 추천 자체엔 불필요
  NEO4J_QUERY_URL?: string;
  NEO4J_USER?: string;
  NEO4J_PASSWORD?: string;
  [k: string]: any;
}

export interface TeacherRecommendation {
  teacherId: string;
  teacherName: string;
  teachingStyle: string | null;
  sharedInterests: number;
  interestScore: number;
  mbtiScore: number;
  totalScore: number;
}

// 추천 Cypher 정본 — ../teacher-match.cypher 의 4) 추천 쿼리와 1:1 동일하게 유지.
const RECOMMEND_QUERY = `
MATCH (s:Student {student_id: $studentId})
MATCH (t:Teacher)
WHERE coalesce(t.active, true) = true
OPTIONAL MATCH (s)-[:INTERESTED_IN]->(i:Interest)<-[:INTERESTED_IN]-(t)
WITH s, t, count(DISTINCT i) AS sharedInterests
OPTIONAL MATCH (s)-[:HAS_MBTI]->(sm:Mbti)
OPTIONAL MATCH (t)-[:HAS_MBTI]->(tm:Mbti)
WITH t, sharedInterests,
     CASE
       WHEN sm IS NULL OR tm IS NULL                THEN false
       WHEN sm = tm                                 THEN true
       WHEN EXISTS { (sm)-[:COMPATIBLE_WITH]-(tm) } THEN true
       ELSE false
     END AS mbtiCompatible
WITH t, sharedInterests,
     sharedInterests * 10 AS interestScore,
     CASE WHEN mbtiCompatible THEN 20 ELSE 0 END AS mbtiScore
WITH t, sharedInterests, interestScore, mbtiScore,
     interestScore + mbtiScore AS totalScore
WHERE totalScore > 0
RETURN t.teacher_id AS teacherId,
       t.name       AS teacherName,
       t.style      AS teachingStyle,
       sharedInterests, interestScore, mbtiScore, totalScore
ORDER BY totalScore DESC, sharedInterests DESC
LIMIT $limit
`;

// ── ETL 적재 Cypher (../teacher-match.cypher 의 2)·3) 과 동일) ─────────────────
const SEED_COMPAT_QUERY = `
UNWIND $compatPairs AS pair
  MERGE (a:Mbti {type: pair.a})
  MERGE (b:Mbti {type: pair.b})
  MERGE (a)-[:COMPATIBLE_WITH]->(b)
`;

const LOAD_TEACHERS_QUERY = `
UNWIND $teachers AS t
  MERGE (tn:Teacher {teacher_id: t.teacher_id})
    SET tn.name = t.name, tn.style = t.style, tn.active = coalesce(t.active, true)
  MERGE (tm:Mbti {type: t.mbti})
  MERGE (tn)-[:HAS_MBTI]->(tm)
  WITH tn, t
  UNWIND t.interests AS topic
    MERGE (i:Interest {name: topic})
    MERGE (tn)-[:INTERESTED_IN]->(i)
`;

// 현재 소스에 없는 강사는 active=false 로 내려 추천 후보에서 제외(노드는 보존).
const DEACTIVATE_STALE_TEACHERS_QUERY = `
MATCH (t:Teacher)
WHERE NOT t.teacher_id IN $activeIds
SET t.active = false
RETURN count(t) AS deactivated
`;

const LOAD_STUDENTS_QUERY = `
UNWIND $students AS s
  MERGE (sn:Student {student_id: s.student_id})
    SET sn.name = s.name
  WITH sn, s WHERE s.mbti IS NOT NULL AND s.mbti <> ''
  MERGE (sm:Mbti {type: s.mbti})
  MERGE (sn)-[:HAS_MBTI]->(sm)
  WITH sn, s
  UNWIND s.interests AS topic
    MERGE (i:Interest {name: topic})
    MERGE (sn)-[:INTERESTED_IN]->(i)
`;

// MBTI 궁합 정책(기본값) — 무방향 의미. 서비스 정책에 맞게 조정 가능.
const COMPAT_PAIRS: Array<{ a: string; b: string }> = [
  { a: 'INTJ', b: 'ENFP' }, { a: 'INTJ', b: 'ENTP' },
  { a: 'INTP', b: 'ENTJ' }, { a: 'INTP', b: 'ESTJ' },
  { a: 'ENTJ', b: 'INFP' }, { a: 'ENTP', b: 'INFJ' },
  { a: 'INFJ', b: 'ENFP' }, { a: 'INFP', b: 'ENFJ' },
  { a: 'ENFJ', b: 'ISFP' }, { a: 'ISTJ', b: 'ESFP' },
  { a: 'ISTJ', b: 'ESTP' }, { a: 'ISFJ', b: 'ESFP' },
  { a: 'ISFJ', b: 'ESTP' }, { a: 'ESTJ', b: 'ISTP' },
  { a: 'ESFJ', b: 'ISFP' }, { a: 'ESFJ', b: 'ISTP' },
  { a: 'ISFP', b: 'ESFJ' }, { a: 'ESFP', b: 'ISFJ' },
];

/** '드라마/요리/여행' · '독서, 체스' 등 자유텍스트 → 관심사 배열(중복·공백 제거) */
function splitInterests(raw: unknown): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const parts = raw.split(/[\/,，、;·|]+/).map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(parts));
}

const isValidMbti = (s: string) => /^[IE][NS][TF][JP]$/.test(s);

/**
 * D1(teacher_mbti · students_erp) → Neo4j 그래프 적재(ETL).
 * 멱등(MERGE) — 반복 실행해도 중복 노드/관계가 생기지 않는다.
 * @returns 적재 카운트 요약
 * @throws Neo4jNotConfiguredError(미설정) / Error(D1·연결·쿼리 오류)
 */
export async function runTeacherGraphSync(
  env: TeacherMatchEnv,
): Promise<{ teachers: number; students: number; compatPairs: number; studentInterests: boolean; deactivated: number }> {
  if (!env.DB) throw new Error('D1 바인딩(DB)이 없어 ETL을 실행할 수 없습니다.');

  // 1) 강사: teacher_mbti (hobby → 관심사, teaching_style → style)
  const trs = await env.DB
    .prepare(`SELECT teacher_uid, teacher_name, mbti, hobby, teaching_style FROM teacher_mbti WHERE mbti IS NOT NULL AND mbti != ''`)
    .all<{ teacher_uid: string; teacher_name: string; mbti: string; hobby: string; teaching_style: string }>();
  const teachers = (trs.results || [])
    .map((r) => ({
      teacher_id: String(r.teacher_uid),
      name: r.teacher_name || String(r.teacher_uid),
      style: r.teaching_style || null,
      active: true,
      mbti: String(r.mbti || '').toUpperCase().slice(0, 4),
      interests: splitInterests(r.hobby),
    }))
    .filter((t) => isValidMbti(t.mbti));

  // 2) 학생: students_erp — 컬럼이 가변적이라 PRAGMA 로 동적 탐지(없으면 graceful)
  let students: Array<{ student_id: string; name: string; mbti: string; interests: string[] }> = [];
  let studentInterests = false;
  try {
    const cols = await env.DB.prepare(`PRAGMA table_info(students_erp)`).all<{ name: string }>();
    const names = (cols.results || []).map((c) => c.name);
    const nameCol = ['student_name', 'korean_name', 'name'].find((c) => names.includes(c)) || 'user_id';
    const mbtiCol = names.includes('mbti') ? 'mbti' : `'' AS mbti`;
    const interestSrc = ['interests', 'hobby', 'interest', '관심사'].find((c) => names.includes(c));
    studentInterests = !!interestSrc;
    const interestCol = interestSrc ? `"${interestSrc}" AS interests` : `'' AS interests`;

    const srs = await env.DB
      .prepare(`SELECT user_id, ${nameCol} AS student_name, ${mbtiCol}, ${interestCol} FROM students_erp WHERE status = '정상' OR status IS NULL OR status = '' LIMIT 2000`)
      .all<{ user_id: string; student_name: string; mbti: string; interests: string }>();
    students = (srs.results || []).map((r) => ({
      student_id: String(r.user_id),
      name: r.student_name || String(r.user_id),
      mbti: isValidMbti(String(r.mbti || '').toUpperCase()) ? String(r.mbti).toUpperCase() : '',
      interests: splitInterests(r.interests),
    }));
  } catch {
    // students_erp 미존재/스키마 상이 → 학생 0건으로 degrade (강사 그래프만 적재)
  }

  // 3) Neo4j 적재 (순차 — Query API 는 호출당 단일 statement)
  await runCypher(env, SEED_COMPAT_QUERY, { compatPairs: COMPAT_PAIRS }, 'WRITE');
  if (teachers.length) await runCypher(env, LOAD_TEACHERS_QUERY, { teachers }, 'WRITE');
  if (students.length) await runCypher(env, LOAD_STUDENTS_QUERY, { students }, 'WRITE');

  // 4) 소스에서 사라진 강사 비활성화(노드 보존). 강사 0건이면 전체 비활성화 사고 방지로 skip.
  let deactivated = 0;
  if (teachers.length) {
    const res = await runCypher(
      env,
      DEACTIVATE_STALE_TEACHERS_QUERY,
      { activeIds: teachers.map((t) => t.teacher_id) },
      'WRITE',
    );
    deactivated = toNumber(res.values?.[0]?.[0]);
  }

  return { teachers: teachers.length, students: students.length, compatPairs: COMPAT_PAIRS.length, studentInterests, deactivated };
}

/**
 * 학생 프로필(MBTI·관심사) upsert — students_erp 에 mbti/interests 컬럼을 보장하고 저장.
 * 저장 후 해당 학생 1명을 Neo4j 그래프에 즉시 반영(전체 sync 없이 추천에 바로 사용 가능).
 * @returns 저장된 정규화 값(neo4j 반영 여부 포함)
 */
export async function upsertStudentProfile(
  env: TeacherMatchEnv,
  input: { student_id: string; mbti?: string; interests?: string | string[]; name?: string },
): Promise<{ student_id: string; mbti: string; interests: string[]; graphSynced: boolean }> {
  if (!env.DB) throw new Error('D1 바인딩(DB)이 없어 학생 프로필을 저장할 수 없습니다.');
  const studentId = String(input.student_id || '').trim();
  if (!studentId) throw new TypeError('student_id 는 필수입니다.');

  const mbti = isValidMbti(String(input.mbti || '').toUpperCase()) ? String(input.mbti).toUpperCase() : '';
  const interests = Array.isArray(input.interests)
    ? Array.from(new Set(input.interests.map((s) => String(s).trim()).filter(Boolean)))
    : splitInterests(input.interests);

  // students_erp 존재 + 컬럼 보장(멱등). 신규 학생이면 행 생성.
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, status TEXT, created_at INTEGER)`,
  );
  try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN mbti TEXT`); } catch {}
  try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN interests TEXT`); } catch {}

  await env.DB
    .prepare(
      `INSERT INTO students_erp (user_id, mbti, interests) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET mbti = excluded.mbti, interests = excluded.interests`,
    )
    .bind(studentId, mbti, interests.join('/'))
    .run();

  // Neo4j 즉시 반영(설정 시). 미설정이면 graphSynced=false 로 degrade.
  let graphSynced = false;
  if (env.NEO4J_QUERY_URL) {
    await runCypher(
      env,
      LOAD_STUDENTS_QUERY,
      { students: [{ student_id: studentId, name: input.name || studentId, mbti, interests }] },
      'WRITE',
    );
    graphSynced = true;
  }

  return { student_id: studentId, mbti, interests, graphSynced };
}

// ── 공통 JSON 응답 헬퍼 (프로젝트 라우터 컨벤션과 동일) ───────────────────────
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

/** Neo4j 미설정 등 "설정 부재" 상태를 명시적으로 구분하기 위한 에러 타입 */
class Neo4jNotConfiguredError extends Error {}

/**
 * Neo4j Aura HTTP Query API 호출 (단발 트랜잭션).
 * @param accessMode 'READ'(추천 조회) | 'WRITE'(ETL 적재)
 * 반환: { fields: string[], values: any[][] } — Query API v2 의 data 블록.
 */
async function runCypher(
  env: TeacherMatchEnv,
  statement: string,
  parameters: Record<string, unknown>,
  accessMode: 'READ' | 'WRITE' = 'READ',
): Promise<{ fields: string[]; values: any[][] }> {
  const { NEO4J_QUERY_URL, NEO4J_USER, NEO4J_PASSWORD } = env;
  if (!NEO4J_QUERY_URL || !NEO4J_USER || !NEO4J_PASSWORD) {
    throw new Neo4jNotConfiguredError(
      'Neo4j 미설정: NEO4J_QUERY_URL / NEO4J_USER / NEO4J_PASSWORD 시크릿을 설정하세요.',
    );
  }

  const auth = btoa(`${NEO4J_USER}:${NEO4J_PASSWORD}`);

  let resp: Response;
  try {
    resp = await fetch(NEO4J_QUERY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ statement, parameters, accessMode }),
    });
  } catch (e: any) {
    // 네트워크/DNS/타임아웃 — 상위에서 503 으로 매핑
    throw new Error(`Neo4j 연결 실패: ${e?.message || e}`);
  }

  // 본문을 먼저 안전하게 파싱(에러 응답도 JSON 본문에 errors 배열을 담아 옴)
  const text = await resp.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Neo4j 응답 파싱 실패(status ${resp.status}): ${text.slice(0, 300)}`);
  }

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Neo4j 인증 실패: 자격 증명(NEO4J_USER/PASSWORD)을 확인하세요.');
    }
    const cypherErr = payload?.errors?.[0]?.message || `HTTP ${resp.status}`;
    throw new Error(`Neo4j 쿼리 오류: ${cypherErr}`);
  }

  const data = payload?.data ?? { fields: [], values: [] };
  return { fields: data.fields ?? [], values: data.values ?? [] };
}

/** Query API 결과의 정수 표현을 JS number 로 정규화(드물게 {low,high} 형태 대비) */
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'low' in (v as any)) return (v as any).low;
  return Number(v) || 0;
}

/**
 * 학생 관심사 + MBTI 궁합 기반 강사 추천.
 * @param env       Worker 환경(Neo4j 시크릿 포함)
 * @param studentId 학생 ID (필수)
 * @param limit     추천 강사 수 (기본 5, 1~50 클램프)
 * @returns 점수 내림차순 강사 목록
 * @throws TypeError(입력 오류) / Neo4jNotConfiguredError(미설정) / Error(연결·쿼리 오류)
 */
export async function recommendTeachers(
  env: TeacherMatchEnv,
  studentId: string,
  limit = 5,
): Promise<TeacherRecommendation[]> {
  if (!studentId || typeof studentId !== 'string') {
    throw new TypeError('studentId는 비어 있지 않은 문자열이어야 합니다.');
  }
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 50) : 5;

  const { fields, values } = await runCypher(env, RECOMMEND_QUERY, {
    studentId,
    limit: safeLimit,
  });

  const idx = (name: string) => fields.indexOf(name);
  const fId = idx('teacherId');
  const fName = idx('teacherName');
  const fStyle = idx('teachingStyle');
  const fShared = idx('sharedInterests');
  const fInterest = idx('interestScore');
  const fMbti = idx('mbtiScore');
  const fTotal = idx('totalScore');

  return values.map((row) => ({
    teacherId: row[fId],
    teacherName: row[fName],
    teachingStyle: row[fStyle] ?? null,
    sharedInterests: toNumber(row[fShared]),
    interestScore: toNumber(row[fInterest]),
    mbtiScore: toNumber(row[fMbti]),
    totalScore: toNumber(row[fTotal]),
  }));
}

/**
 * 독립 라우터 — /api/admin/teacher-match/*
 *   GET /api/admin/teacher-match/recommend?student_id=STU001&limit=5
 * 자체 try/catch 로 격리(다른 기능에 영향 없음). 에러 유형별 HTTP 코드 매핑.
 */
export async function teacherMatchRouter(request: Request, env: TeacherMatchEnv): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/teacher-match\/?/, '');
  const method = request.method.toUpperCase();

  try {
    if (p === 'recommend' && method === 'GET') {
      const studentId = url.searchParams.get('student_id') || url.searchParams.get('studentId') || '';
      const limit = Number(url.searchParams.get('limit')) || 5;
      if (!studentId) return err('student_id 쿼리 파라미터가 필요합니다.', 400);

      const teachers = await recommendTeachers(env, studentId, limit);
      return json({
        ok: true,
        student_id: studentId,
        count: teachers.length,
        teachers,
        ...(teachers.length === 0 ? { message: '추천 가능한 강사가 없습니다(접점 없음).' } : {}),
      });
    }

    // POST /api/admin/teacher-match/student-profile — 학생 MBTI·관심사 저장 + 그래프 즉시 반영
    //   body: { student_id, mbti?, interests?(문자열 '여행/음악' 또는 배열), name? }
    if (p === 'student-profile' && method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const saved = await upsertStudentProfile(env, body);
      return json({
        ok: true,
        saved,
        ...(saved.graphSynced ? {} : { note: 'Neo4j 미설정 — D1 에만 저장됨. 동기화 후 추천에 반영됩니다.' }),
      });
    }

    // POST /api/admin/teacher-match/sync — D1 → Neo4j 그래프 수동 재적재(ETL)
    if (p === 'sync' && method === 'POST') {
      const summary = await runTeacherGraphSync(env);
      return json({
        ok: true,
        synced: summary,
        ...(summary.studentInterests
          ? {}
          : { note: 'students_erp 에 관심사 컬럼이 없어 학생 관심사는 적재되지 않았습니다(MBTI 궁합만 반영). 관심사 컬럼(interests/hobby) 추가 시 자동 반영됩니다.' }),
      });
    }

    return err('not found: ' + p, 404);
  } catch (e: any) {
    if (e instanceof TypeError) return err(e.message, 400);
    if (e instanceof Neo4jNotConfiguredError) return err(e.message, 503);
    // 인증/연결 실패는 503(일시적·환경 문제), 그 외는 500
    const status = /인증 실패|연결 실패/.test(e?.message || '') ? 503 : 500;
    return err(e?.message || 'teacher-match internal error', status);
  }
}
