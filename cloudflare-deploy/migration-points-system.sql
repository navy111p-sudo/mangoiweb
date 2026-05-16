-- ═══════════════════════════════════════════════════════════════
-- Phase P1: 망고아이 포인트 + 기프티콘 교환 시스템
-- 2026-05-17 - 학생 포인트 → KT alpha 기프티쇼 비즈 API 발송
-- ═══════════════════════════════════════════════════════════════

-- (1) 학생별 포인트 잔액 (요약 테이블 - 빠른 조회용)
CREATE TABLE IF NOT EXISTS student_points (
  user_id      TEXT PRIMARY KEY,           -- 학생 ID (students_erp.user_id)
  student_name TEXT,                       -- 표시용 이름 (중복 동기화)
  balance      INTEGER NOT NULL DEFAULT 0, -- 현재 사용 가능 포인트
  lifetime_earned INTEGER NOT NULL DEFAULT 0, -- 누적 적립 (통계용)
  lifetime_spent  INTEGER NOT NULL DEFAULT 0, -- 누적 사용
  last_earned_at  INTEGER,                 -- 마지막 적립 시각 (epoch ms)
  last_spent_at   INTEGER,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sp_balance ON student_points(balance DESC);
CREATE INDEX IF NOT EXISTS idx_sp_name ON student_points(student_name);

-- (2) 포인트 거래 원장 (적립/사용/환불/관리자조정 모든 이벤트)
CREATE TABLE IF NOT EXISTS point_transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  student_name TEXT,
  type         TEXT NOT NULL,        -- 'earn' | 'spend' | 'refund' | 'admin_grant' | 'admin_deduct' | 'expire'
  amount       INTEGER NOT NULL,     -- 양수 (적립/환불) | 음수 (사용/차감)
  balance_after INTEGER NOT NULL,    -- 거래 직후 잔액 (감사 추적)
  reason       TEXT,                 -- '출석', '숙제완료', '기프티콘 교환', '관리자 보너스' 등
  rule_code    TEXT,                 -- point_rules.code (자동 적립일 때)
  redemption_id INTEGER,             -- gift_redemptions.id (교환 거래일 때)
  actor_id     TEXT,                 -- 거래를 일으킨 주체 (관리자 ID 또는 'system')
  actor_name   TEXT,
  created_at   INTEGER NOT NULL,     -- epoch ms
  meta         TEXT                  -- JSON (추가 정보)
);
CREATE INDEX IF NOT EXISTS idx_pt_user ON point_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pt_type ON point_transactions(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pt_redemption ON point_transactions(redemption_id);

-- (3) 자동 적립 규칙
CREATE TABLE IF NOT EXISTS point_rules (
  code         TEXT PRIMARY KEY,       -- 'attendance', 'homework', 'monthly_top', 'level_up'
  label        TEXT NOT NULL,          -- '출석', '숙제 완료', '월간 우수' 등 (표시용)
  amount       INTEGER NOT NULL,       -- 자동 적립 포인트
  cooldown_sec INTEGER DEFAULT 0,      -- 중복 방지 쿨다운 (초) - 같은 학생 동일 사유
  daily_cap    INTEGER,                -- 하루 최대 적립 횟수 (NULL = 무제한)
  enabled      INTEGER DEFAULT 1,
  description  TEXT,
  updated_at   INTEGER NOT NULL
);

-- 기본 규칙 시드 (예시)
INSERT OR IGNORE INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at)
VALUES
  ('attendance',   '출석',          10,  21600, 1, 1, '수업 1회 출석 시 자동 적립 (하루 1회)', strftime('%s','now')*1000),
  ('homework',     '숙제 완료',     20,  3600,  3, 1, '숙제 검수 완료 시 적립',                strftime('%s','now')*1000),
  ('on_time',      '제시간 입장',   5,   3600,  1, 1, '수업 시작 시간 5분 이내 입장',          strftime('%s','now')*1000),
  ('level_up',     '레벨업',        100, 0,     NULL, 1, '레벨 시험 합격 시 자동 적립',        strftime('%s','now')*1000),
  ('monthly_top',  '월간 우수학생', 500, 0,     NULL, 1, '월간 1위 학생 자동 지급',            strftime('%s','now')*1000),
  ('birthday',     '생일 축하',     200, 0,     1, 1, '학생 생일 자동 지급',                  strftime('%s','now')*1000);

-- (4) 기프티콘 카탈로그 (관리자가 활성화한 상품만 학생에게 노출)
CREATE TABLE IF NOT EXISTS gift_catalog (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id   TEXT,                -- 기프티쇼 비즈 상품 코드 (API 발송 시 사용)
  brand         TEXT,                -- '스타벅스', '배스킨라빈스', 'CGV' 등
  name          TEXT NOT NULL,       -- '아이스 아메리카노 Tall'
  category      TEXT,                -- 'cafe' | 'food' | 'movie' | 'book' | 'voucher' | 'etc'
  face_value    INTEGER NOT NULL,    -- 실제 상품 정가 (원)
  point_price   INTEGER NOT NULL,    -- 학생이 지불해야 할 포인트 (보통 1P=1원)
  thumbnail_url TEXT,
  stock         INTEGER,             -- NULL = 무제한, 정수 = 남은 재고
  enabled       INTEGER DEFAULT 1,
  sort_order    INTEGER DEFAULT 0,
  description   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gc_enabled ON gift_catalog(enabled, sort_order);
CREATE INDEX IF NOT EXISTS idx_gc_brand ON gift_catalog(brand);

-- 데모 카탈로그 시드 (실제 발송 전까지 표시만 됨 - external_id NULL)
INSERT OR IGNORE INTO gift_catalog (external_id, brand, name, category, face_value, point_price, thumbnail_url, enabled, sort_order, description, created_at, updated_at)
VALUES
  (NULL, '스타벅스',     '아이스 아메리카노 Tall',     'cafe',  4500,  4500,  NULL, 1, 10, '시원한 한 잔의 여유', strftime('%s','now')*1000, strftime('%s','now')*1000),
  (NULL, '배스킨라빈스', '파인트 (1개)',                'cafe',  9800,  9800,  NULL, 1, 20, '취향대로 골라먹는 31', strftime('%s','now')*1000, strftime('%s','now')*1000),
  (NULL, '교촌치킨',     '교촌오리지날 + 콜라1.25L',   'food',  21000, 21000, NULL, 1, 30, '바삭 짭짤 든든',       strftime('%s','now')*1000, strftime('%s','now')*1000),
  (NULL, 'CGV',         '영화 1매 (전 지점)',          'movie', 14000, 14000, NULL, 1, 40, '평일 일반관 1회 사용', strftime('%s','now')*1000, strftime('%s','now')*1000),
  (NULL, '교보문고',     '도서상품권 5,000원',          'book',  5000,  5000,  NULL, 1, 50, '온/오프라인 사용 가능', strftime('%s','now')*1000, strftime('%s','now')*1000),
  (NULL, 'GS25',        '편의점 금액권 5,000원',       'voucher', 5000, 5000, NULL, 1, 60, '전국 GS25에서 사용',   strftime('%s','now')*1000, strftime('%s','now')*1000);

-- (5) 교환 거래 (학생이 신청 → 발송 진행 → 완료/실패)
CREATE TABLE IF NOT EXISTS gift_redemptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  student_name    TEXT,
  catalog_id      INTEGER NOT NULL,
  gift_name       TEXT,                      -- 신청 당시 상품명 (히스토리 보존)
  gift_brand      TEXT,
  face_value      INTEGER NOT NULL,
  point_price     INTEGER NOT NULL,          -- 차감된 포인트
  recipient_phone TEXT,                      -- 받는 카톡 번호 (학생 휴대폰)
  recipient_name  TEXT,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | sent | delivered | failed | refunded
  external_order_id TEXT,                    -- 기프티쇼 비즈 주문번호
  external_coupon_code TEXT,                 -- 발송된 쿠폰 번호 (있을 시)
  error_message   TEXT,                      -- 실패 사유
  requested_at    INTEGER NOT NULL,
  sent_at         INTEGER,
  delivered_at    INTEGER,
  failed_at       INTEGER,
  refunded_at     INTEGER,
  txn_spend_id    INTEGER,                   -- point_transactions.id (차감 거래)
  txn_refund_id   INTEGER,                   -- point_transactions.id (환불 거래)
  meta            TEXT                       -- JSON (API 응답 원본 등)
);
CREATE INDEX IF NOT EXISTS idx_gr_user ON gift_redemptions(user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_gr_status ON gift_redemptions(status, requested_at DESC);

-- (6) 적립 규칙 실행 추적 (쿨다운 + 일일 한도 검사용)
CREATE TABLE IF NOT EXISTS point_rule_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  rule_code  TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  triggered_at INTEGER NOT NULL,
  txn_id     INTEGER,           -- point_transactions.id
  meta       TEXT
);
CREATE INDEX IF NOT EXISTS idx_prl_user_rule ON point_rule_log(user_id, rule_code, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_prl_date ON point_rule_log(user_id, rule_code);
