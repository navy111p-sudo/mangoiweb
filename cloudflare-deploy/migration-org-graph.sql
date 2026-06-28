-- migration-org-graph.sql
-- 조직 인프라 "그래프 트리(본사→대표지사→지사→대리점)" 정산 엔진용 신규 테이블
-- (요청: Neo4j 그래프 모델을 망고아이 현행 Cloudflare D1 위에 융합)
--
-- 배경 / 기존 시스템과의 관계
-- ─────────────────────────────────────────────────────────────────────────
--   현행 accounting-reports.ts 의 franchiseReport() 는 조직 계보가 평면 라벨
--   (students_erp.hq_name/branch1_name/franchise/shop_name)로만 존재해서
--   "매출 ÷ 가맹점 수" 균등 분배라는 부정확한 추정을 한다(정확 정산 불가).
--   또 정산월마다 무거운 JOIN 풀스캔으로 페이지 로딩이 느리다.
--
--   본 마이그레이션은 (:HQ)-[:PARENT_OF]->(지사)-[:PARENT_OF]->(대리점) 그래프
--   트리를 self-referencing 테이블(org_nodes.parent_id)로 정규화하고, 각 노드의
--   본사 수수료율(15~18%)을 노드 속성으로 둔다. 매출 역추적/하위 집계는
--   SQLite WITH RECURSIVE 로 그래프 순회한다(churn-graph.ts 와 동일 철학:
--   Neo4j 없이 D1 원자료로 그래프 구성). 같은 모델의 Cypher 정본은
--   org-settlement.cypher 참고.
--
-- 적용:  wrangler d1 execute mango-db --file=./migration-org-graph.sql
--        (운영 반영은 --remote 추가)
-- 멱등(IF NOT EXISTS / INSERT OR IGNORE)이라 여러 번 실행해도 안전.

-- ────────────────────────────────────────────────────────────────────
-- 1) 조직 노드 (그래프 트리) — (:HQ)-[:PARENT_OF]->(지사)-[:PARENT_OF]->(대리점)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_nodes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id       INTEGER,                 -- 상위 노드(=[:PARENT_OF] 역방향). 루트(HQ)=NULL
  type            TEXT NOT NULL,           -- 'hq' | 'branch' | 'agency'  (지사본사=franchise는 branch로 통합)
  name            TEXT NOT NULL,           -- 표시명 (예: '망고아이본사', '서울강남지사', '강남대리점')
  match_key       TEXT,                    -- students_erp 연결 키:
                                           --   agency → students_erp.shop_name 값
                                           --   branch → students_erp.franchise 값(LIKE 'key%')
                                           --   hq     → NULL(전체)
  commission_rate REAL NOT NULL DEFAULT 0.15, -- 이 노드가 "상위(부모)"에게 내는 본사 수수료율 0.15~0.18. HQ=0
  path            TEXT,                    -- 머티리얼라이즈드 패스 '/1/4/9/' (서브트리 prefix 스캔용)
  depth           INTEGER NOT NULL DEFAULT 0, -- 루트=0
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES org_nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_org_nodes_parent   ON org_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_nodes_type      ON org_nodes(type, active);
CREATE INDEX IF NOT EXISTS idx_org_nodes_matchkey  ON org_nodes(match_key);
CREATE INDEX IF NOT EXISTS idx_org_nodes_path      ON org_nodes(path);

-- ────────────────────────────────────────────────────────────────────
-- 2) 정산 원장(Ledger) — "데이터 신뢰성" 보장 + 무거운 재계산 캐시
--    한 번 마감(close)한 (노드,월) 정산을 스냅샷으로 영속화한다.
--    UNIQUE(node_id, period) 로 재마감 시 멱등 갱신(이중정산 차단).
--    정산 페이지는 실시간 재계산 대신 이 원장을 즉시 읽어 로딩이 빨라진다.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_settlement_ledger (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id          INTEGER NOT NULL,        -- 정산 주체 org_nodes.id
  node_type        TEXT,                    -- 스냅샷 시점 타입(감사용)
  node_name        TEXT,                    -- 스냅샷 시점 표시명(감사용)
  period           TEXT NOT NULL,           -- 'YYYY-MM'
  gross_revenue    INTEGER NOT NULL DEFAULT 0, -- 서브트리 총 매출(KRW)
  commission_rate  REAL NOT NULL DEFAULT 0,    -- 적용 수수료율(스냅샷)
  hq_fee           INTEGER NOT NULL DEFAULT 0, -- 상위로 올린 본사 수수료(KRW)
  net_settlement   INTEGER NOT NULL DEFAULT 0, -- 정산액 = gross - hq_fee (KRW)
  pay_count        INTEGER NOT NULL DEFAULT 0, -- 결제 건수(감사/대사용)
  status           TEXT NOT NULL DEFAULT 'closed', -- 'closed' | 'paid' | 'void'
  checksum         TEXT,                    -- 무결성 해시(원자료 변조 감지용; 선택)
  closed_at        INTEGER NOT NULL,        -- 마감 시각(ms)
  closed_by        TEXT,                    -- 마감 관리자 username
  UNIQUE(node_id, period)
);

CREATE INDEX IF NOT EXISTS idx_settle_ledger_period ON org_settlement_ledger(period, node_type);
CREATE INDEX IF NOT EXISTS idx_settle_ledger_node   ON org_settlement_ledger(node_id, period);

-- ────────────────────────────────────────────────────────────────────
-- 3) 학생→대리점 매핑 보강(선택): students_erp.shop_name 이 비어 있는 행을
--    org_node_id 로 직접 고정하고 싶을 때 사용하는 오버라이드 테이블.
--    기본 정산은 students_erp.shop_name = org_nodes.match_key 조인으로 동작하며,
--    이 테이블은 예외(분점 이관·라벨 불일치) 보정 용도.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_org_override (
  user_id     TEXT PRIMARY KEY,            -- students_erp.user_id
  org_node_id INTEGER NOT NULL,            -- 강제 귀속 대리점 노드
  reason      TEXT,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_student_org_override_node ON student_org_override(org_node_id);
