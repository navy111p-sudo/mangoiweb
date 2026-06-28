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
 * Neo4j Aura HTTP Query API 호출 (단발 트랜잭션, READ).
 * 반환: { fields: string[], values: any[][] } — Query API v2 의 data 블록.
 */
async function runCypher(
  env: TeacherMatchEnv,
  statement: string,
  parameters: Record<string, unknown>,
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
      body: JSON.stringify({ statement, parameters, accessMode: 'READ' }),
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

    return err('not found: ' + p, 404);
  } catch (e: any) {
    if (e instanceof TypeError) return err(e.message, 400);
    if (e instanceof Neo4jNotConfiguredError) return err(e.message, 503);
    // 인증/연결 실패는 503(일시적·환경 문제), 그 외는 500
    const status = /인증 실패|연결 실패/.test(e?.message || '') ? 503 : 500;
    return err(e?.message || 'teacher-match internal error', status);
  }
}
