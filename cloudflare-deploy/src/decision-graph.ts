/**
 * decision-graph.ts — 판단력 엔진 3단계: 학생 판단 경로 그래프 (Neo4j HTTP Query API)
 *
 * 배경 / 기존 시스템과의 관계
 * ─────────────────────────────────────────────────────────────────────────
 *   2단계에서 D1(judgment_events + judgment_analysis)에 쌓인 판단 이벤트를
 *   라이브 :Student {student_id} 노드에 접합해 '판단 경로 그래프'를 만든다.
 *   Cloudflare Workers 라 Bolt 불가 → teacher-match / warmup-graph 와 동일하게
 *   Aura HTTP Query API(runCypher)로 Cypher 전송. 멱등 MERGE 라 매일 재적재 안전
 *   (야간 02:00 서버 MySQL→Neo4j 전체 재생성 이후 03:00 에 본 ETL 재실행).
 *
 * 그래프 모델 (설계서 §4 — 기존 예약어 비충돌)
 *   (st:Student {student_id})-[:MADE]->(ev:JudgmentEvent {event_uid})
 *   (ev)-[:IN_SITUATION]->(sit:Situation {situation_id})-[:REQUIRES]->(sk:DecisionSkill {name})
 *   (ev)-[:CHOSE]->(cx:Expression {expr_id})       // 학생이 고른 표현
 *   (ev)-[:REJECTED]->(bx:Expression {expr_id})    // 더 나았던(지나친) 표현
 *   (ev)-[:REVEALS]->(m:Misconception {code})      // 오답 유형
 *   (st)-[w:WEAK_IN {count, last_at}]->(sk)         // 스킬별 취약도(절대값 SET)
 *   (ev)-[:NEXT_DECISION {gap_days}]->(ev2)         // 시간순 판단 경로
 *
 * 환경변수 — teacher-match 와 동일 시크릿 (미설정 시 graceful degrade)
 *   NEO4J_QUERY_URL / NEO4J_USER / NEO4J_PASSWORD
 *
 * 외부 공개
 *   runDecisionGraphSync(env)                  : D1 → Neo4j ETL (멱등 MERGE)
 *   getWeakDecisionSkills(env, studentId, n)   : 취약 스킬 + 대표 오답유형 (시나리오 입력)
 *   decisionGraphRouter(request, env)          : /api/admin/decision-graph/*
 */

import { runCypher, Neo4jNotConfiguredError, type TeacherMatchEnv } from './teacher-match';

export type DecisionGraphEnv = TeacherMatchEnv;

export interface WeakDecisionSkill {
  skill: string;
  weakCount: number;
  misconceptions: string[];
}

// ── slug 헬퍼 (동기) — 표현/상황 노드 키를 결정적으로 생성 ──
function slug(s: unknown, max = 60): string {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
}
function exprId(text: string): string | null { const g = slug(text, 60); return g ? 'x:' + g : null; }
function sitId(skill: string | null, text: string | null): string | null {
  if (skill) { const g = slug(skill, 50); if (g) return 'sk:' + g; }
  if (text) { const g = slug(text, 50); if (g) return 't:' + g; }
  return null;
}

// ── ETL 적재 Cypher ────────────────────────────────────────────────────────
const LOAD_EVENTS_QUERY = `
UNWIND $events AS e
  MERGE (st:Student {student_id: e.student_id})
  MERGE (ev:JudgmentEvent {event_uid: e.event_uid})
    SET ev.created_at=e.created_at, ev.source=e.source,
        ev.choice_score=e.choice_score, ev.reasoning_score=e.reasoning_score, ev.is_optimal=e.is_optimal
  MERGE (st)-[:MADE]->(ev)
  FOREACH (_ IN CASE WHEN e.situation_id IS NULL THEN [] ELSE [1] END |
    MERGE (sit:Situation {situation_id: e.situation_id})
      SET sit.text=e.situation_text, sit.skill=e.skill_tag
    MERGE (ev)-[:IN_SITUATION]->(sit)
    FOREACH (__ IN CASE WHEN e.skill_tag IS NULL THEN [] ELSE [1] END |
      MERGE (sk:DecisionSkill {name: e.skill_tag})
      MERGE (sit)-[:REQUIRES]->(sk)))
  FOREACH (_ IN CASE WHEN e.chosen_expr_id IS NULL THEN [] ELSE [1] END |
    MERGE (cx:Expression {expr_id: e.chosen_expr_id}) SET cx.text=e.chosen_text
    MERGE (ev)-[:CHOSE]->(cx))
  FOREACH (_ IN CASE WHEN e.better_expr_id IS NULL THEN [] ELSE [1] END |
    MERGE (bx:Expression {expr_id: e.better_expr_id}) SET bx.text=e.better_text
    MERGE (ev)-[:REJECTED]->(bx))
  FOREACH (_ IN CASE WHEN e.misconception IS NULL THEN [] ELSE [1] END |
    MERGE (m:Misconception {code: e.misconception})
    MERGE (ev)-[:REVEALS]->(m))
`;

// 스킬별 취약도 — count 는 ETL 에서 절대값 집계 후 SET (재실행 중복 누적 없음, warmup 방식)
const LOAD_WEAK_QUERY = `
UNWIND $weak AS w
  MERGE (st:Student {student_id: w.student_id})
  MERGE (sk:DecisionSkill {name: w.skill})
  MERGE (st)-[r:WEAK_IN]->(sk)
  SET r.count = w.count, r.last_at = w.last_at
`;

// 시간순 판단 경로 — 연속 이벤트 연결
const LOAD_SEQUENCE_QUERY = `
UNWIND $pairs AS p
  MATCH (a:JudgmentEvent {event_uid: p.prev_uid})
  MATCH (b:JudgmentEvent {event_uid: p.next_uid})
  MERGE (a)-[r:NEXT_DECISION]->(b)
  SET r.gap_days = p.gap_days
`;

// ── 조회 Cypher — 취약 스킬 상위 N + 대표 오답유형 ──
const WEAK_SKILLS_QUERY = `
MATCH (st:Student {student_id: $studentId})-[w:WEAK_IN]->(sk:DecisionSkill)
OPTIONAL MATCH (st)-[:MADE]->(:JudgmentEvent)-[:REVEALS]->(m:Misconception)
RETURN sk.name AS skill, w.count AS weakCount, collect(DISTINCT m.code)[..3] AS misconceptions
ORDER BY w.count DESC
LIMIT $limit
`;

/** Query API 결과의 정수 표현을 JS number 로 정규화 (teacher-match toNumber 와 동일) */
function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'low' in (v as any)) return (v as any).low;
  return Number(v) || 0;
}

/**
 * D1 → Neo4j 판단 경로 그래프 적재(ETL). 멱등 — 반복 실행해도 중복/누적 없음.
 * @throws Neo4jNotConfiguredError(미설정) / Error(D1·연결·쿼리 오류)
 */
export async function runDecisionGraphSync(
  env: DecisionGraphEnv,
): Promise<{ events: number; weak: number; sequence: number; studentsSeen: number }> {
  if (!env.DB) throw new Error('D1 바인딩(DB)이 없어 ETL을 실행할 수 없습니다.');

  // 1) 최근 판단 이벤트(+분석) 조인 조회
  const rs = await env.DB.prepare(
    `SELECT e.event_uid AS event_uid, e.student_uid AS student_uid, e.created_at AS created_at, e.source AS source,
            e.situation_text AS situation_text, e.skill_tag AS skill_tag, e.chosen_option AS chosen_option,
            a.choice_score AS choice_score, a.reasoning_score AS reasoning_score, a.is_optimal AS is_optimal,
            a.best_option AS best_option, a.misconception_tag AS misconception_tag
     FROM judgment_events e JOIN judgment_analysis a ON a.event_id = e.id
     ORDER BY e.created_at DESC LIMIT 3000`,
  ).all<any>();
  const rows = rs.results || [];

  // 2) events / weak / pairs 빌드
  const events: any[] = [];
  const weakAgg = new Map<string, { student_id: string; skill: string; count: number; last_at: number }>();
  const byStudent = new Map<string, Array<{ uid: string; at: number }>>();

  for (const r of rows) {
    const studentId = String(r.student_uid || '');
    const eventUid = String(r.event_uid || '');
    if (!studentId || !eventUid) continue;
    const skillTag = r.skill_tag ? String(r.skill_tag) : null;
    const situationText = r.situation_text ? String(r.situation_text) : null;
    const chosen = r.chosen_option ? String(r.chosen_option) : null;
    const better = r.best_option ? String(r.best_option) : null;
    const misc = r.misconception_tag ? String(r.misconception_tag) : null;
    const isOptimal = Number(r.is_optimal) ? 1 : 0;
    const at = Number(r.created_at) || 0;

    events.push({
      event_uid: eventUid, student_id: studentId, created_at: at, source: String(r.source || 'in_class'),
      choice_score: r.choice_score == null ? null : Number(r.choice_score),
      reasoning_score: r.reasoning_score == null ? null : Number(r.reasoning_score),
      is_optimal: isOptimal,
      situation_id: sitId(skillTag, situationText), situation_text: situationText, skill_tag: skillTag,
      chosen_expr_id: chosen ? exprId(chosen) : null, chosen_text: chosen,
      better_expr_id: better ? exprId(better) : null, better_text: better,
      misconception: misc,
    });

    // 취약도: 최선이 아니었거나(오답) 오답유형이 있는 이벤트를 스킬별로 집계
    if (skillTag && (!isOptimal || misc)) {
      const key = studentId + '' + skillTag;
      const cur = weakAgg.get(key);
      if (cur) { cur.count++; if (at > cur.last_at) cur.last_at = at; }
      else weakAgg.set(key, { student_id: studentId, skill: skillTag, count: 1, last_at: at });
    }

    const arr = byStudent.get(studentId) || [];
    arr.push({ uid: eventUid, at });
    byStudent.set(studentId, arr);
  }

  // 시간순 경로 pairs (학생별 오름차순 연속 연결)
  const pairs: any[] = [];
  for (const arr of byStudent.values()) {
    arr.sort((a, b) => a.at - b.at);
    for (let i = 1; i < arr.length; i++) {
      const gapDays = Math.max(0, Math.round((arr[i].at - arr[i - 1].at) / 86400000));
      pairs.push({ prev_uid: arr[i - 1].uid, next_uid: arr[i].uid, gap_days: gapDays });
    }
  }
  const weak = Array.from(weakAgg.values());

  // 3) Neo4j 적재 (Query API 는 호출당 단일 statement — 순차)
  if (events.length) await runCypher(env, LOAD_EVENTS_QUERY, { events }, 'WRITE');
  if (weak.length) await runCypher(env, LOAD_WEAK_QUERY, { weak }, 'WRITE');
  if (pairs.length) await runCypher(env, LOAD_SEQUENCE_QUERY, { pairs }, 'WRITE');

  return { events: events.length, weak: weak.length, sequence: pairs.length, studentsSeen: byStudent.size };
}

/**
 * 학생의 취약 판단 스킬 조회 — 맞춤 시나리오 출제의 입력.
 * @throws Neo4jNotConfiguredError / Error — 호출부는 catch 후 D1 폴백/빈 배열로 degrade 할 것.
 */
export async function getWeakDecisionSkills(
  env: DecisionGraphEnv,
  studentId: string,
  limit = 3,
): Promise<WeakDecisionSkill[]> {
  if (!studentId) return [];
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 10) : 3;
  const { fields, values } = await runCypher(env, WEAK_SKILLS_QUERY, { studentId, limit: safeLimit });
  const fSkill = fields.indexOf('skill');
  const fCnt = fields.indexOf('weakCount');
  const fMisc = fields.indexOf('misconceptions');
  return values.map((row) => ({
    skill: String(row[fSkill] || ''),
    weakCount: toNum(row[fCnt]),
    misconceptions: Array.isArray(row[fMisc]) ? row[fMisc].map((x: any) => String(x)).filter(Boolean) : [],
  })).filter((w) => w.skill);
}

// ── 공통 JSON 응답 헬퍼 (프로젝트 라우터 컨벤션과 동일) ───────────────────────
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

/**
 * 독립 라우터 — /api/admin/decision-graph/* (관리자 세션 게이트는 index.ts isRestrictedPath 로 적용)
 *   POST /api/admin/decision-graph/sync                : D1 → Neo4j 수동 재적재
 *   GET  /api/admin/decision-graph/weak?student_id=&n= : 취약 스킬 디버그 조회
 */
export async function decisionGraphRouter(request: Request, env: DecisionGraphEnv): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/decision-graph\/?/, '');
  const method = request.method.toUpperCase();
  try {
    if (p === 'sync' && method === 'POST') {
      const summary = await runDecisionGraphSync(env);
      return json({ ok: true, synced: summary });
    }
    if (p === 'weak' && method === 'GET') {
      const studentId = url.searchParams.get('student_id') || '';
      const limit = Number(url.searchParams.get('n') || url.searchParams.get('limit')) || 3;
      if (!studentId) return err('student_id 쿼리 파라미터가 필요합니다.', 400);
      const weak = await getWeakDecisionSkills(env, studentId, limit);
      return json({ ok: true, student_id: studentId, count: weak.length, weak_skills: weak });
    }
    return err('not found: ' + p, 404);
  } catch (e: any) {
    if (e instanceof Neo4jNotConfiguredError) return err(e.message, 503);
    const status = /인증 실패|연결 실패/.test(e?.message || '') ? 503 : 500;
    return err(e?.message || 'decision-graph internal error', status);
  }
}
