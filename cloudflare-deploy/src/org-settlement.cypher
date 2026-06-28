// ════════════════════════════════════════════════════════════════════════
// org-settlement.cypher — 조직 인프라 그래프 정산 모델 (Neo4j 정본)
//
// 망고아이 운영 런타임은 Cloudflare Workers + D1(SQLite)이라 실제 정산 엔진은
// org-settlement.ts 의 WITH RECURSIVE 로 동작한다. 본 파일은 "동일한 그래프
// 모델"의 Neo4j 정본으로, 향후 데이터 규모가 커져 그래프 DB(Neo4j Aura/
// Memgraph)로 이전할 때 1:1로 옮길 수 있도록 설계/문서화한 것이다.
//
// D1 ↔ Neo4j 대응
//   org_nodes(type='hq')      ⇔ (:HQ)
//   org_nodes(type='branch')  ⇔ (:Branch)
//   org_nodes(type='agency')  ⇔ (:Agency)
//   org_nodes.parent_id       ⇔ (parent)-[:PARENT_OF]->(child)
//   students_erp              ⇔ (:Student)   (:Agency)-[:MANAGES]->(:Student)
//   student_payments          ⇔ (:Payment)   (:Student)-[:PAID {amount,month}]->(:Payment)
//   commission_rate(0.15~0.18)⇔ 노드 속성 (상위에 내는 본사 수수료율)
// ════════════════════════════════════════════════════════════════════════


// ────────────────────────────────────────────────────────────────────────
// 0) 제약/인덱스 (무결성 + 조회 성능)
// ────────────────────────────────────────────────────────────────────────
CREATE CONSTRAINT hq_id      IF NOT EXISTS FOR (n:HQ)      REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT branch_id  IF NOT EXISTS FOR (n:Branch)  REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT agency_id  IF NOT EXISTS FOR (n:Agency)  REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT student_id IF NOT EXISTS FOR (s:Student) REQUIRE s.user_id IS UNIQUE;
CREATE INDEX payment_month   IF NOT EXISTS FOR ()-[r:PAID]-() ON (r.month);


// ────────────────────────────────────────────────────────────────────────
// 1) 그래프 모델링 — 조직 트리 + 결제 관계선
//    (:HQ)-[:PARENT_OF]->(:Branch)-[:PARENT_OF]->(:Agency)-[:MANAGES]->(:Student)
//    (:Student)-[:PAID {amount, month}]->(:Payment)
// ────────────────────────────────────────────────────────────────────────

// 본사
MERGE (hq:HQ {id: 'HQ-1'})
  ON CREATE SET hq.name = '망고아이본사', hq.commission_rate = 0.0;

// 지사 (본사 수수료 15~18%)
MERGE (br:Branch {id: 'BR-seoul-gangnam'})
  ON CREATE SET br.name = '서울강남지사', br.commission_rate = 0.15;
MERGE (hq)-[:PARENT_OF]->(br);

// 대리점 (본사 수수료 15~18%)
MERGE (ag:Agency {id: 'AG-gangnam-1'})
  ON CREATE SET ag.name = '강남대리점', ag.commission_rate = 0.18;
MERGE (br)-[:PARENT_OF]->(ag);

// 학생 (대리점이 관리)
MERGE (s:Student {user_id: 'stu-1001'})
  ON CREATE SET s.korean_name = '홍길동';
MERGE (ag)-[:MANAGES]->(s);

// 결제 관계선 — amount/month 를 엣지 속성으로 (정산월 필터의 핵심)
CREATE (p:Payment {id: 'pay-90001', method: '카드'});
MATCH (s:Student {user_id: 'stu-1001'}), (p:Payment {id: 'pay-90001'})
MERGE (s)-[:PAID {amount: 250000, month: '2026-05'}]->(p);


// ────────────────────────────────────────────────────────────────────────
// 2-A) 하위 계보 매출 집계 — 특정 노드($nodeId) 기준 서브트리 전체 롤업
//      대리점/지사 어느 레벨이든 동일 패턴. 정산월($month)로 필터.
//      *0..  = 자기 자신 포함 임의 깊이 후손까지 (그래프 가변길이 매칭)
// ────────────────────────────────────────────────────────────────────────
MATCH (root {id: $nodeId})
MATCH (root)-[:PARENT_OF*0..]->(desc)-[:MANAGES]->(:Student)-[paid:PAID {month: $month}]->(:Payment)
WITH root, desc, sum(paid.amount) AS gross, count(paid) AS pay_count
RETURN
  desc.id                                   AS node_id,
  labels(desc)[0]                           AS type,
  desc.name                                 AS name,
  desc.commission_rate                      AS commission_rate,
  gross                                      AS gross_revenue,
  toInteger(round(gross * desc.commission_rate)) AS hq_fee,
  toInteger(gross - round(gross * desc.commission_rate)) AS net_settlement,
  pay_count
ORDER BY gross_revenue DESC;


// ────────────────────────────────────────────────────────────────────────
// 2-B) 노드 단위 정산서 — 자기 서브트리 누적매출 + 직속 자식별 분배
// ────────────────────────────────────────────────────────────────────────
// (1) 정산 주체 자신의 누적(자기+후손) 매출/수수료
MATCH (root {id: $nodeId})
OPTIONAL MATCH (root)-[:PARENT_OF*0..]->()-[:MANAGES]->(:Student)-[paid:PAID {month: $month}]->(:Payment)
WITH root, coalesce(sum(paid.amount), 0) AS gross, count(paid) AS pay_count
RETURN
  root.id AS node_id, root.name AS name, labels(root)[0] AS type,
  root.commission_rate AS commission_rate,
  gross AS gross_revenue,
  toInteger(round(gross * root.commission_rate))         AS hq_fee,
  toInteger(gross - round(gross * root.commission_rate)) AS net_settlement,
  pay_count;

// (2) 직속 자식(가맹점)별 분배 — rollup 화면 행
MATCH (root {id: $nodeId})-[:PARENT_OF]->(child)
OPTIONAL MATCH (child)-[:PARENT_OF*0..]->()-[:MANAGES]->(:Student)-[paid:PAID {month: $month}]->(:Payment)
WITH child, coalesce(sum(paid.amount), 0) AS gross, count(paid) AS pay_count
RETURN
  child.id AS node_id, child.name AS franchise_name, labels(child)[0] AS type,
  gross AS gross_revenue, child.commission_rate AS commission_rate,
  toInteger(round(gross * child.commission_rate))         AS hq_fee,
  toInteger(gross - round(gross * child.commission_rate)) AS net_settlement,
  pay_count
ORDER BY gross_revenue DESC;


// ────────────────────────────────────────────────────────────────────────
// 2-C) 상위 노드 역추적 — 대리점에서 본사(HQ)까지 수수료 귀속 경로
//      가변길이 역방향 매칭으로 조상 체인을 한 번에. 각 홉의 누적 수수료 적층.
// ────────────────────────────────────────────────────────────────────────
MATCH path = (start {id: $nodeId})<-[:PARENT_OF*0..]-(ancestor)
WITH ancestor, length(path) AS hops
// 이 정산주체 서브트리 누적매출(상위로 흐르는 수수료 산정 기준)
CALL {
  WITH ancestor
  OPTIONAL MATCH (ancestor)-[:PARENT_OF*0..]->()-[:MANAGES]->(:Student)-[paid:PAID {month: $month}]->(:Payment)
  RETURN coalesce(sum(paid.amount), 0) AS gross
}
RETURN
  hops                                   AS depth_from_start,
  ancestor.id                            AS node_id,
  labels(ancestor)[0]                    AS type,
  ancestor.name                          AS name,
  ancestor.commission_rate               AS commission_rate,
  gross                                  AS subtree_gross,
  toInteger(round(gross * ancestor.commission_rate)) AS hq_fee
ORDER BY depth_from_start ASC;


// ────────────────────────────────────────────────────────────────────────
// 2-D) 전사 정산(HQ 루트) — 가맹점별 정확 분배 + 전체 합계
// ────────────────────────────────────────────────────────────────────────
MATCH (hq:HQ {id: $hqId})-[:PARENT_OF]->(branch)
OPTIONAL MATCH (branch)-[:PARENT_OF*0..]->()-[:MANAGES]->(:Student)-[paid:PAID {month: $month}]->(:Payment)
WITH branch, coalesce(sum(paid.amount), 0) AS gross, count(paid) AS pay_count
WITH collect({
  node_id: branch.id, name: branch.name, type: labels(branch)[0],
  gross_revenue: gross, commission_rate: branch.commission_rate,
  hq_fee: toInteger(round(gross * branch.commission_rate)),
  net_settlement: toInteger(gross - round(gross * branch.commission_rate)),
  pay_count: pay_count
}) AS rows
RETURN
  rows,
  reduce(t = 0, r IN rows | t + r.gross_revenue)  AS total_gross,
  reduce(t = 0, r IN rows | t + r.hq_fee)          AS total_fee,
  reduce(t = 0, r IN rows | t + r.net_settlement)  AS total_net;
