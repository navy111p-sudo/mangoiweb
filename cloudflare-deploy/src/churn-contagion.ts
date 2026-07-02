/**
 * churn-contagion.ts — 이탈 "전염(Contagion)" 위험 분석 (Neo4j Aura HTTP Query API)
 *
 * 목적 / 기존 시스템과의 관계
 * ─────────────────────────────────────────────────────────────────────────
 *   churn-graph.ts(행동 사슬)와 learning-insights.ts(신호 합산)는 모두
 *   **학생 본인의 행동**만 본다. 그러나 이탈은 관계망을 타고 번진다:
 *   형제가 퇴원하면 남은 아이도 나가고, 친구 따라 들어온 학생은 친구 따라
 *   나가며, 같은 반 단짝이 그만두면 수업 재미가 떨어진다.
 *
 *   본 모듈은 학생 사이의 실제 관계(가족·동반수업·추천)를 Neo4j 그래프로
 *   적재하고, 최근 이탈자와 1~2홉으로 연결된 재원생을 경로 가중 점수로
 *   랭킹한다. SQL 로는 만들기 어려운 "관계 때문에 위험한 학생" 뷰.
 *
 * 그래프 모델 (teacher-match 그래프와 :Student{student_id} 노드 공유)
 *   (:Student {student_id, name, status:'active'|'churned', status_raw})
 *   (a)-[:FAMILY_OF]-(b)                  가족(형제·자매) — 무방향 의미
 *   (a)-[:TOOK_CLASS_WITH {classes}]-(b)  같은 강의실·같은 날 수업 동반 횟수
 *   (a)-[:REFERRED]->(b)                  a 가 b 를 추천(친구 데려옴)
 *
 * 데이터 소스(모두 기존 D1 테이블 — 없거나 비어 있으면 0 기여로 degrade)
 *   students_erp(status: 정상/활동=재원, 이탈/탈퇴/퇴원=이탈)
 *   families + family_members(같은 family_id = 가족)
 *   attendance(room_id+date 동일 = 동반 수업)
 *   referrals(있으면 — 현재 미구축이라 자동 skip)
 *
 * 외부 공개(서비스 레이어)
 *   runContagionGraphSync(env)        : D1 → Neo4j ETL(멱등 MERGE)
 *   churnContagionRouter(request,env) : /api/admin/churn-contagion/*
 *     POST /sync                      그래프 재적재
 *     GET  /risk?limit=30             전염 위험 재원생 랭킹
 *     GET  /student?uid=STU001        단일 학생 전염 경로 상세(설명용)
 *     GET  /stats                     그래프 노드/관계 현황
 */

import { runCypher, Neo4jNotConfiguredError, type TeacherMatchEnv } from './teacher-match';

export type ContagionEnv = TeacherMatchEnv;

// ── 튜닝 가능한 가중치 (한곳에 모아 클린하게) ────────────────────────────────
export const CONTAGION_CONFIG = {
  /** 동반 수업 관계로 인정할 최근 기간(일) — 오래된 동반 이력은 관계로 안 봄 */
  coClassWindowDays: 180,
  /** 동반 수업 최소 횟수 — 1회 스치듯 같이 들은 건 관계가 아님 */
  coClassMinCount: 2,
  /** ETL 적재 상한(폭주 방지) */
  maxStudents: 5000,
  maxPairs: 8000,
  /** Query API UNWIND 청크 크기 */
  chunkSize: 800,
  /** 경로 가중치 — 1홉 기준. 2홉은 hopDecay 를 곱해 감쇠 */
  relWeight: { FAMILY_OF: 1.0, REFERRED: 0.85, TOOK_CLASS_WITH: 0.5, TOOK_CLASS_WITH_STRONG: 0.7 },
  /** 동반 수업이 이 횟수 이상이면 강한 관계(STRONG 가중) */
  strongClassCount: 5,
  hopDecay: 0.45,
  /** 위험 밴드 컷(프론트 표시용) */
  band: { high: 1.0, medium: 0.45 },
};

// ── D1 상태값 → 그래프 status 매핑 ──────────────────────────────────────────
const ACTIVE_STATUSES = ['정상', '활동'];
const CHURNED_STATUSES = ['이탈', '탈퇴', '퇴원'];

function mapStatus(raw: unknown): 'active' | 'churned' | null {
  const s = String(raw ?? '').trim();
  if (!s || ACTIVE_STATUSES.includes(s)) return 'active';
  if (CHURNED_STATUSES.includes(s)) return 'churned';
  return null; // 휴면·상담중 등 애매한 상태는 전염 분석에서 제외
}

// ── ETL Cypher (멱등 MERGE — 반복 실행 안전) ────────────────────────────────
const LOAD_STUDENTS_STATUS_QUERY = `
UNWIND $students AS s
  MERGE (n:Student {student_id: s.student_id})
  SET n.name = coalesce(s.name, n.name),
      n.status = s.status,
      n.status_raw = s.status_raw
`;

const LOAD_FAMILY_QUERY = `
UNWIND $pairs AS p
  MATCH (a:Student {student_id: p.a})
  MATCH (b:Student {student_id: p.b})
  MERGE (a)-[:FAMILY_OF]-(b)
`;

const LOAD_COCLASS_QUERY = `
UNWIND $pairs AS p
  MATCH (a:Student {student_id: p.a})
  MATCH (b:Student {student_id: p.b})
  MERGE (a)-[r:TOOK_CLASS_WITH]-(b)
  SET r.classes = p.cnt
`;

const LOAD_REFERRAL_QUERY = `
UNWIND $pairs AS p
  MATCH (a:Student {student_id: p.a})
  MATCH (b:Student {student_id: p.b})
  MERGE (a)-[:REFERRED]->(b)
`;

// ── 분석 Cypher ─────────────────────────────────────────────────────────────
// 전염 위험 랭킹: 이탈자와 1~2홉 연결된 재원생.
//   경로 가중 = Π(관계 가중) × (2홉이면 hopDecay), 이탈자별 최강 경로만 취하고
//   서로 다른 이탈자 기여는 합산(이탈 이웃이 많을수록 위험 가중).
const RISK_QUERY = `
MATCH path = (c:Student)-[:FAMILY_OF|REFERRED|TOOK_CLASS_WITH*1..2]-(s:Student)
WHERE c.status = 'churned' AND s.status = 'active' AND c <> s
WITH s, c, path,
     reduce(w = 1.0, rel IN relationships(path) |
       w * (CASE type(rel)
              WHEN 'FAMILY_OF' THEN $wFamily
              WHEN 'REFERRED'  THEN $wReferred
              ELSE CASE WHEN coalesce(rel.classes, 1) >= $strongClassCount
                        THEN $wClassStrong ELSE $wClass END
            END)) AS pathWeight
WITH s, c,
     max(pathWeight * (CASE length(path) WHEN 1 THEN 1.0 ELSE $hopDecay END)) AS linkWeight,
     min(length(path)) AS nearestHops
WITH s,
     sum(linkWeight) AS rawScore,
     count(c) AS churnedContacts,
     collect({uid: c.student_id, name: c.name, hops: nearestHops})[0..8] AS contacts
RETURN s.student_id AS uid, s.name AS name,
       round(rawScore * 100) / 100.0 AS score,
       churnedContacts, contacts
ORDER BY score DESC, churnedContacts DESC
LIMIT $limit
`;

// 단일 학생 전염 경로 상세(관리자 설명·시각화용): 어떤 이탈자와 어떤 관계로 닿는지
const STUDENT_PATHS_QUERY = `
MATCH path = (c:Student)-[:FAMILY_OF|REFERRED|TOOK_CLASS_WITH*1..2]-(s:Student {student_id: $uid})
WHERE c.status = 'churned' AND c <> s
WITH path, c, length(path) AS hops,
     [rel IN relationships(path) | type(rel)] AS relTypes,
     [n IN nodes(path) | {uid: n.student_id, name: n.name, status: n.status}] AS chain
RETURN c.student_id AS churnedUid, c.name AS churnedName, hops, relTypes, chain
ORDER BY hops ASC
LIMIT 50
`;

const STATS_NODES_QUERY = `
MATCH (s:Student)
RETURN sum(CASE WHEN s.status = 'active'  THEN 1 ELSE 0 END) AS active,
       sum(CASE WHEN s.status = 'churned' THEN 1 ELSE 0 END) AS churned,
       count(s) AS total
`;

const STATS_RELS_QUERY = `
MATCH ()-[r:FAMILY_OF|REFERRED|TOOK_CLASS_WITH]->()
RETURN type(r) AS relType, count(r) AS n
`;

// ── 유틸 ────────────────────────────────────────────────────────────────────
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'low' in (v as any)) return (v as any).low;
  return Number(v) || 0;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn(); } catch { return fallback; }
};

/** KST 기준 오늘로부터 n일 전 'YYYY-MM-DD' */
function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

// ── ETL: D1 → Neo4j ────────────────────────────────────────────────────────
export interface ContagionSyncSummary {
  students: number;
  churned: number;
  familyPairs: number;
  classPairs: number;
  referralPairs: number;
  notes: string[];
}

/**
 * D1 → Neo4j 전염 그래프 적재. 멱등(MERGE) — 반복 실행 안전.
 * teacher-match 가 만든 :Student 노드와 student_id 키를 공유한다(그래프 융합).
 */
export async function runContagionGraphSync(env: ContagionEnv): Promise<ContagionSyncSummary> {
  if (!env.DB) throw new Error('D1 바인딩(DB)이 없어 ETL을 실행할 수 없습니다.');
  const cfg = CONTAGION_CONFIG;
  const notes: string[] = [];

  // 1) 학생 + 상태 (재원/이탈만 — 애매한 상태는 제외)
  //    이름 컬럼은 배포마다 달라 PRAGMA 로 동적 탐지(teacher-match 와 동일 규약)
  const cols = await safe(() => env.DB!.prepare(`PRAGMA table_info(students_erp)`).all<{ name: string }>(),
    { results: [] as any[] } as any);
  const colNames = ((cols as any).results || []).map((c: any) => c.name);
  const nameCol = ['student_name', 'korean_name', 'name'].find((c) => colNames.includes(c)) || 'user_id';
  const srs = await safe(() => env.DB!
    .prepare(`SELECT user_id, ${nameCol} AS sname, status FROM students_erp LIMIT ${cfg.maxStudents}`)
    .all<{ user_id: string; sname: string; status: string }>(),
    { results: [] as any[] } as any);
  const rows: any[] = (srs as any).results || [];
  const students = rows
    .map((r) => ({ uid: String(r.user_id), name: r.sname || String(r.user_id), st: mapStatus(r.status), raw: String(r.status ?? '') }))
    .filter((r) => r.uid && r.st !== null)
    .map((r) => ({ student_id: r.uid, name: r.name, status: r.st as string, status_raw: r.raw }));
  const churned = students.filter((s) => s.status === 'churned').length;
  const known = new Set(students.map((s) => s.student_id));
  if (!students.length) notes.push('students_erp 가 비어 있어 학생 노드를 적재하지 못했습니다.');
  if (!churned) notes.push('이탈 상태(이탈/탈퇴/퇴원) 학생이 0명 — 전염 위험은 이탈자가 생겨야 계산됩니다.');

  // 2) 가족 쌍: 같은 family_id 의 학생끼리 (a < b 로 중복 제거)
  const fam = await safe(() => env.DB!
    .prepare(`SELECT a.student_uid AS a_uid, b.student_uid AS b_uid
              FROM family_members a
              JOIN family_members b ON a.family_id = b.family_id AND a.student_uid < b.student_uid
              LIMIT ${cfg.maxPairs}`)
    .all<{ a_uid: string; b_uid: string }>(),
    { results: [] as any[] } as any);
  const familyPairs = ((fam as any).results || [])
    .map((r: any) => ({ a: String(r.a_uid), b: String(r.b_uid) }))
    .filter((p: any) => known.has(p.a) && known.has(p.b));

  // 3) 동반 수업 쌍: 같은 room_id + 같은 date (최근 N일, 최소 횟수 이상)
  const since = kstDaysAgo(cfg.coClassWindowDays);
  const co = await safe(() => env.DB!
    .prepare(`SELECT a.user_id AS a_uid, b.user_id AS b_uid, COUNT(DISTINCT a.date) AS cnt
              FROM attendance a
              JOIN attendance b ON a.room_id = b.room_id AND a.date = b.date AND a.user_id < b.user_id
              WHERE (a.role = 'student' OR a.role IS NULL)
                AND (b.role = 'student' OR b.role IS NULL)
                AND a.date >= ?
              GROUP BY a.user_id, b.user_id
              HAVING cnt >= ?
              ORDER BY cnt DESC
              LIMIT ${cfg.maxPairs}`)
    .bind(since, cfg.coClassMinCount)
    .all<{ a_uid: string; b_uid: string; cnt: number }>(),
    { results: [] as any[] } as any);
  const classPairs = ((co as any).results || [])
    .map((r: any) => ({ a: String(r.a_uid), b: String(r.b_uid), cnt: Number(r.cnt) || 1 }))
    .filter((p: any) => known.has(p.a) && known.has(p.b));

  // 4) 추천 쌍: referrals 테이블(현재 미구축 — 생기면 자동 반영). 두 가지 컬럼 관례 시도.
  let referralPairs: Array<{ a: string; b: string }> = [];
  for (const sql of [
    `SELECT referrer_uid AS a_uid, referred_uid AS b_uid FROM referrals LIMIT ${cfg.maxPairs}`,
    `SELECT referrer_id AS a_uid, referred_id AS b_uid FROM referrals LIMIT ${cfg.maxPairs}`,
  ]) {
    const rr = await safe(() => env.DB!.prepare(sql).all<{ a_uid: string; b_uid: string }>(), null as any);
    if (rr && (rr as any).results) {
      referralPairs = ((rr as any).results || [])
        .map((r: any) => ({ a: String(r.a_uid), b: String(r.b_uid) }))
        .filter((p: any) => known.has(p.a) && known.has(p.b));
      break;
    }
  }
  if (!referralPairs.length) notes.push('referrals 테이블 없음/비어 있음 — 추천(REFERRED) 관계는 생기면 자동 적재됩니다.');

  // 5) Neo4j 적재 (Query API 는 호출당 단일 statement → 청크 순차)
  for (const c of chunk(students, cfg.chunkSize)) {
    await runCypher(env, LOAD_STUDENTS_STATUS_QUERY, { students: c }, 'WRITE');
  }
  for (const c of chunk(familyPairs, cfg.chunkSize)) {
    await runCypher(env, LOAD_FAMILY_QUERY, { pairs: c }, 'WRITE');
  }
  for (const c of chunk(classPairs, cfg.chunkSize)) {
    await runCypher(env, LOAD_COCLASS_QUERY, { pairs: c }, 'WRITE');
  }
  for (const c of chunk(referralPairs, cfg.chunkSize)) {
    await runCypher(env, LOAD_REFERRAL_QUERY, { pairs: c }, 'WRITE');
  }

  return {
    students: students.length,
    churned,
    familyPairs: familyPairs.length,
    classPairs: classPairs.length,
    referralPairs: referralPairs.length,
    notes,
  };
}

// ── 분석 조회 ────────────────────────────────────────────────────────────────
export interface ContagionRiskRow {
  uid: string;
  name: string;
  score: number;
  band: 'high' | 'medium' | 'low';
  churnedContacts: number;
  contacts: Array<{ uid: string; name: string; hops: number }>;
}

/** 전염 위험 재원생 랭킹 (점수 내림차순) */
export async function listContagionRisk(env: ContagionEnv, limit = 30): Promise<ContagionRiskRow[]> {
  const cfg = CONTAGION_CONFIG;
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 30;
  const { fields, values } = await runCypher(env, RISK_QUERY, {
    limit: safeLimit,
    wFamily: cfg.relWeight.FAMILY_OF,
    wReferred: cfg.relWeight.REFERRED,
    wClass: cfg.relWeight.TOOK_CLASS_WITH,
    wClassStrong: cfg.relWeight.TOOK_CLASS_WITH_STRONG,
    strongClassCount: cfg.strongClassCount,
    hopDecay: cfg.hopDecay,
  });
  const idx = (n: string) => fields.indexOf(n);
  const fUid = idx('uid'), fName = idx('name'), fScore = idx('score'),
        fCnt = idx('churnedContacts'), fContacts = idx('contacts');
  return values.map((row) => {
    const score = Number(row[fScore]) || 0;
    return {
      uid: row[fUid],
      name: row[fName],
      score,
      band: score >= cfg.band.high ? 'high' : score >= cfg.band.medium ? 'medium' : 'low',
      churnedContacts: toNumber(row[fCnt]),
      contacts: (row[fContacts] || []).map((c: any) => ({
        uid: c?.uid, name: c?.name, hops: toNumber(c?.hops),
      })),
    } as ContagionRiskRow;
  });
}

/** 단일 학생의 전염 경로 상세(어떤 이탈자와 어떤 관계로 연결되는지) */
export async function getStudentContagionPaths(env: ContagionEnv, uid: string) {
  if (!uid || typeof uid !== 'string') throw new TypeError('uid 는 비어 있지 않은 문자열이어야 합니다.');
  const { fields, values } = await runCypher(env, STUDENT_PATHS_QUERY, { uid });
  const idx = (n: string) => fields.indexOf(n);
  const fCU = idx('churnedUid'), fCN = idx('churnedName'), fH = idx('hops'),
        fRT = idx('relTypes'), fCh = idx('chain');
  return values.map((row) => ({
    churnedUid: row[fCU],
    churnedName: row[fCN],
    hops: toNumber(row[fH]),
    relTypes: row[fRT] || [],
    chain: row[fCh] || [],
  }));
}

/** 그래프 현황(노드/관계 카운트) — 관리자 카드 헤더 표시용 */
export async function getContagionStats(env: ContagionEnv) {
  const nodes = await runCypher(env, STATS_NODES_QUERY, {});
  const rels = await runCypher(env, STATS_RELS_QUERY, {});
  const nIdx = (n: string) => nodes.fields.indexOf(n);
  const row = nodes.values[0] || [];
  const relCounts: Record<string, number> = {};
  const rT = rels.fields.indexOf('relType'), rN = rels.fields.indexOf('n');
  rels.values.forEach((r) => { relCounts[String(r[rT])] = toNumber(r[rN]); });
  return {
    students: { active: toNumber(row[nIdx('active')]), churned: toNumber(row[nIdx('churned')]), total: toNumber(row[nIdx('total')]) },
    relationships: {
      family: relCounts['FAMILY_OF'] || 0,
      coClass: relCounts['TOOK_CLASS_WITH'] || 0,
      referral: relCounts['REFERRED'] || 0,
    },
  };
}

// ── 라우터 ──────────────────────────────────────────────────────────────────
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

/**
 * 독립 라우터 — /api/admin/churn-contagion/*
 * 자체 try/catch 로 격리(다른 기능에 영향 없음). 에러 유형별 HTTP 코드 매핑.
 */
export async function churnContagionRouter(request: Request, env: ContagionEnv): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/churn-contagion\/?/, '');
  const method = request.method.toUpperCase();

  try {
    // POST /sync — D1 → Neo4j 전염 그래프 재적재(ETL)
    if (p === 'sync' && method === 'POST') {
      const summary = await runContagionGraphSync(env);
      return json({ ok: true, synced: summary });
    }

    // GET /risk?limit=30 — 전염 위험 재원생 랭킹
    if (p === 'risk' && method === 'GET') {
      const limit = Number(url.searchParams.get('limit')) || 30;
      const rows = await listContagionRisk(env, limit);
      return json({
        ok: true, count: rows.length, rows,
        ...(rows.length === 0 ? { message: '전염 위험 학생이 없습니다. (그래프 동기화 여부·이탈자 존재 여부를 확인하세요)' } : {}),
      });
    }

    // GET /student?uid=... — 단일 학생 전염 경로 상세
    if (p === 'student' && method === 'GET') {
      const uid = url.searchParams.get('uid') || url.searchParams.get('student_id') || '';
      if (!uid) return err('uid 쿼리 파라미터가 필요합니다.', 400);
      const paths = await getStudentContagionPaths(env, uid);
      return json({ ok: true, uid, count: paths.length, paths });
    }

    // GET /stats — 그래프 현황
    if (p === 'stats' && method === 'GET') {
      const stats = await getContagionStats(env);
      return json({ ok: true, ...stats });
    }

    return err('not found: ' + p, 404);
  } catch (e: any) {
    if (e instanceof TypeError) return err(e.message, 400);
    if (e instanceof Neo4jNotConfiguredError) return err(e.message, 503);
    const status = /인증 실패|연결 실패/.test(e?.message || '') ? 503 : 500;
    return err(e?.message || 'churn-contagion internal error', status);
  }
}
