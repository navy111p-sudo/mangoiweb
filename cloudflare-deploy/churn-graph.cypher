// ============================================================================
//  churn-graph.cypher — 이탈 위험 행동 사슬(Path) 그래프 모델 · 정본 스펙
//  런타임은 Cloudflare Workers + D1(SQLite)라 실제 엔진은 src/churn-graph.ts 가
//  이 모델을 인메모리로 재현한다. 이 파일은 (1) 모델의 정본 문서이자
//  (2) Neo4j/Memgraph 도입 시 그대로 쓰는 이식형 쿼리다.
//  D1 → 그래프 적재는 ETL(주기적 export)로 수행하는 것을 전제로 한다.
// ============================================================================

// ── 1) 스키마 / 제약 ────────────────────────────────────────────────────────
CREATE CONSTRAINT student_uid  IF NOT EXISTS FOR (s:Student)  REQUIRE s.uid  IS UNIQUE;
CREATE CONSTRAINT teacher_id   IF NOT EXISTS FOR (t:Teacher)  REQUIRE t.id   IS UNIQUE;
CREATE CONSTRAINT class_id     IF NOT EXISTS FOR (c:Class)    REQUIRE c.id   IS UNIQUE;
CREATE CONSTRAINT alimtalk_id  IF NOT EXISTS FOR (a:Alimtalk) REQUIRE a.id   IS UNIQUE;
CREATE INDEX class_date        IF NOT EXISTS FOR (c:Class)    ON (c.date);

//  노드:   (:Student {uid,name})  (:Teacher {id,name})
//          (:Class {id,date,teacher_id,attended:bool})  (:Alimtalk {id,sent_at,read:bool,reason})
//          (:Parent {phone})
//  관계:   (Student)-[:ASSIGNED_TO]->(Teacher)
//          (Student)-[:MISSED|ATTENDED {date}]->(Class)
//          (Teacher)-[:TEACHES]->(Class)
//          (Class)-[:TRIGGERED]->(Alimtalk)
//          (Parent)-[:IGNORED|READ {sent_at}]->(Alimtalk)
//          (:Event)-[:THEN {gap_days}]->(:Event)   // 부정 징후 시간순 사슬
//   * Event 는 라벨이 아니라 MISSED Class / IGNORED Alimtalk 등 부정 노드의 통칭.

// ── 2) 적재 예시 (D1 export → CSV/param) ────────────────────────────────────
// 결석 이벤트 적재
UNWIND $missed AS m
MERGE (s:Student {uid: m.uid})
MERGE (t:Teacher {id: m.teacher_id})
MERGE (s)-[:ASSIGNED_TO]->(t)
MERGE (c:Class {id: m.uid + ':' + m.date})
  ON CREATE SET c.date = m.date, c.teacher_id = m.teacher_id, c.attended = false
MERGE (t)-[:TEACHES]->(c)
MERGE (s)-[:MISSED {date: m.date}]->(c);

// 알림톡 미열람 적재
UNWIND $alimtalk AS a
MERGE (s:Student {uid: a.uid})
MERGE (p:Parent {phone: a.parent_phone})
MERGE (msg:Alimtalk {id: a.id})
  ON CREATE SET msg.sent_at = a.sent_at, msg.reason = a.reason, msg.read = (a.read_at IS NOT NULL)
FOREACH (_ IN CASE WHEN a.read_at IS NULL THEN [1] ELSE [] END |
  MERGE (p)-[:IGNORED {sent_at: a.sent_at}]->(msg))
FOREACH (_ IN CASE WHEN a.read_at IS NOT NULL THEN [1] ELSE [] END |
  MERGE (p)-[:READ {sent_at: a.sent_at}]->(msg));

// 부정 이벤트 시간순 사슬(THEN) 생성: 한 학생의 부정 이벤트를 시간순 연결,
// linkWindow(=21일) 이내 간격만 사슬로 인정.
MATCH (s:Student)-[r:MISSED]->(c:Class)
WITH s, c.date AS date, c AS ev ORDER BY date
WITH s, collect({ev: ev, t: date}) AS evs
UNWIND range(0, size(evs)-2) AS i
WITH s, evs[i] AS a, evs[i+1] AS b,
     duration.inDays(date(evs[i].t), date(evs[i+1].t)).days AS gap
WHERE gap <= 21
MERGE (a.ev)-[:THEN {gap_days: gap}]->(b.ev);

// ── 3) 핵심: 최장/최단 경로(Path) 탐색 → Risk Score ────────────────────────

// (3-1) 학생별 "부정 행동 최장 사슬"과 가중 Risk Score
//   - 가중치: MISSED 3.0 / IGNORED 2.5 / DORMANT 4.0 (src/churn-graph.ts CHURN_CONFIG 와 일치)
//   - 시간감쇠: 0.5^(ageDays/30),  에스컬레이션: (1 + 위치·0.15)
MATCH path = (s:Student)-[:MISSED|ATTENDED]->(:Class)-[:THEN*0..]->(:Class)
WITH s, path, nodes(path) AS ns, length(path) AS hops
WHERE hops >= 1
WITH s, path, hops,
     reduce(score = 0.0, idx IN range(0, size(ns)-1) |
       score +
       3.0                                                   // MISSED 기본 가중
       * 0.5 ^ (duration.inDays(date(ns[idx].date), date()).days / 30.0)  // 시간감쇠
       * (1 + idx * 0.15)                                    // 사슬 후반 가중
     ) AS chain_score
ORDER BY s.uid, chain_score DESC
WITH s, collect({len: hops + 1, score: chain_score})[0] AS best  // 최고점=최장 사슬
RETURN s.uid AS uid, best.len AS longest_chain, round(best.score * 10) / 10 AS risk_score
ORDER BY risk_score DESC;

// (3-2) 인과 캐스케이드: "결석 → 알림톡 미열람 → 또 결석" 연쇄가 실재하는 학생
//   가정 방치(IGNORED)가 학생 이탈을 가속하는 고위험 패턴.
MATCH (s:Student)-[:MISSED]->(c1:Class)-[:TRIGGERED]->(msg:Alimtalk)<-[:IGNORED]-(:Parent),
      (s)-[:MISSED]->(c2:Class)
WHERE date(c2.date) > date(c1.date)
  AND duration.inDays(date(c1.date), date(c2.date)).days <= 21
RETURN s.uid AS uid, count(DISTINCT c1) AS cascades, collect(DISTINCT c1.date) AS dates
ORDER BY cascades DESC;

// (3-3) 강사 집중도: 결석이 특정 강사에게 80% 이상 몰리는 미스매치 학생
MATCH (s:Student)-[:MISSED]->(c:Class)<-[:TEACHES]-(t:Teacher)
WITH s, t, count(c) AS miss
WITH s, sum(miss) AS total, collect({t: t.id, miss: miss}) AS perTeacher
UNWIND perTeacher AS pt
WITH s, total, pt WHERE pt.miss * 1.0 / total >= 0.8 AND total >= 3
RETURN s.uid AS uid, pt.t AS teacher, pt.miss AS missed_with_teacher, total AS total_missed,
       round(pt.miss * 100.0 / total) AS concentration_pct
ORDER BY concentration_pct DESC, total_missed DESC;

// (3-4) 단일 학생의 전체 부정 사슬 경로(설명·시각화용) — /churn-path 와 대응
MATCH p = (s:Student {uid: $uid})-[:MISSED|ATTENDED]->(:Class)-[:THEN*0..]->(:Class)
RETURN [n IN nodes(p) | {date: n.date, attended: n.attended}] AS chain,
       length(p) + 1 AS chain_len
ORDER BY chain_len DESC LIMIT 1;

// (3-5) 최단 경로(shortest): 신규 배정 강사 → 최초 결석까지 가장 빠른 이탈 시작점
MATCH (t:Teacher)<-[:ASSIGNED_TO]-(s:Student)-[:MISSED]->(c:Class)<-[:TEACHES]-(t)
WITH s, t, min(date(c.date)) AS first_miss
MATCH (s)-[:ASSIGNED_TO]->(t)
RETURN s.uid AS uid, t.id AS teacher, first_miss AS first_missed_date
ORDER BY first_miss ASC;
