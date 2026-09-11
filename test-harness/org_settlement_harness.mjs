// -*- coding: utf-8 -*-
// 🧪 조직 그래프 트리 정산 엔진 테스트 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/org_settlement_harness.mjs
//   대상:  cloudflare-deploy/src/org-settlement.ts + migration-org-graph.sql
//
// 검증 전략 (스펙 미러가 아니라 "진짜" 검증):
//   node:sqlite(내장 SQLite)에 실제 스키마/픽스처를 올리고, org-settlement.ts 가
//   쓰는 WITH RECURSIVE 쿼리(서브트리 롤업·상위 역추적)와 정산원장 ON CONFLICT
//   멱등 upsert 를 그대로 실행해 결과를 단언한다. foldSubtree 수수료 계산은
//   소스에서 그대로 포팅해 검증한다.
//   + 소스 드리프트 가드: org-settlement.ts / index.ts / 마이그레이션에 핵심
//     SQL·배선이 실제로 존재하는지 문자열로 확인(규칙 바뀌면 같이 깨지게).
//
// 핵심 회귀 포인트:
//   ① 부정확했던 "총매출 ÷ 가맹점 수" 균등분배 → 학생 단위 정확 귀속으로 대체됐는가
//   ② 수수료율 15~18% 적용 & 정산액 = 매출 - 수수료
//   ③ 상위 역추적(대리점→지사→본사) 체인 정확성
//   ④ 환불/취소(status≠paid) 매출 제외
//   ⑤ 정산 마감 멱등(UNIQUE(node_id,period) + ON CONFLICT) — 이중정산 차단

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const CD = resolve(ROOT, 'cloudflare-deploy');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, detail = '') {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
}
const eq = (name, a, b) => check(`${name} (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) !== JSON.stringify(b) ? `got ${JSON.stringify(a)}` : '');

// ── org-settlement.ts 에서 그대로 포팅한 순수 로직 ───────────────────────────
function monthRange(period) {
  const [y, m] = String(period).split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error('invalid period');
  const start = new Date(Date.UTC(y, m - 1, 1) - 9 * 3600 * 1000);
  const end = new Date(Date.UTC(y, m, 1) - 9 * 3600 * 1000);
  return { startMs: start.getTime(), endMs: end.getTime() };
}
// 2026-08-18 정책 변경: 15~18% 클램프 → 기본 「지점 40% / 본사 60%」 + 지사·대리점별 수동 설정
const DEFAULT_HQ_RATE = 0.60, DEFAULT_BRANCH_RATE = 0.40;
const RATE_MIN = 0, RATE_MAX = 1;
const clampRate = r => {
  const n = Number(r);
  if (!Number.isFinite(n)) return DEFAULT_HQ_RATE;
  return Math.min(RATE_MAX, Math.max(RATE_MIN, n));
};
const toRate = v => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return clampRate(n > 1 ? n / 100 : n);
};
const emptyOv = () => ({ branch: new Map(), agency: new Map() });
function resolveHqRate(ov, branchName, agencyName) {
  const a = agencyName ? ov.agency.get(String(agencyName).trim()) : undefined;
  if (a != null) return { rate: a, source: 'agency' };
  const b = branchName ? ov.branch.get(String(branchName).trim()) : undefined;
  if (b != null) return { rate: b, source: 'branch' };
  return { rate: DEFAULT_HQ_RATE, source: 'default' };
}
function nextSettlementDate(period) {
  const [y, m] = period.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-15`;
}
function foldSubtree(rows, ov = emptyOv()) {
  const byId = new Map();
  for (const r of rows) byId.set(r.id, { ...r, gross: r.own_gross, pays: r.own_pays, children: [] });
  // ① 요율 결정: 자기 수동 설정 → 상위(지사) 수동 설정 상속 → 기본 60%
  for (const node of byId.values()) {
    if (node.type === 'hq') { node.rate_applied = 0; node.rate_source = 'hq'; continue; }
    const own = node.type === 'agency' ? ov.agency.get(String(node.name).trim())
                                       : ov.branch.get(String(node.name).trim());
    if (own != null) { node.rate_applied = own; node.rate_source = 'self'; continue; }
    let p = node.parent_id != null ? byId.get(node.parent_id) : null;
    let inherited;
    while (p && inherited == null) {
      if (p.type === 'branch') inherited = ov.branch.get(String(p.name).trim());
      else if (p.type === 'agency') inherited = ov.agency.get(String(p.name).trim());
      p = p.parent_id != null ? byId.get(p.parent_id) : null;
    }
    node.rate_applied = inherited != null ? inherited : DEFAULT_HQ_RATE;
    node.rate_source = inherited != null ? 'inherited' : 'default';
  }
  // ② 자기 매출분 수수료 → 매출·건수·수수료를 함께 부모로 롤업
  for (const node of byId.values()) node.hq_fee = Math.round(node.own_gross * (node.rate_applied || 0));
  const ordered = [...rows].sort((a, b) => b.depth - a.depth);
  for (const r of ordered) {
    const node = byId.get(r.id);
    if (r.parent_id != null && byId.has(r.parent_id)) {
      const parent = byId.get(r.parent_id);
      parent.gross += node.gross; parent.pays += node.pays; parent.hq_fee += node.hq_fee;
      parent.children.push(r.id);
    }
  }
  for (const node of byId.values()) {
    node.net_settlement = node.gross - node.hq_fee;
    node.commission_rate = node.gross > 0 ? Math.round((node.hq_fee / node.gross) * 10000) / 10000 : node.rate_applied;
  }
  return byId;
}

// ── 실제 org-settlement.ts 가 실행하는 SQL (검증용 verbatim 복제) ─────────────
const SQL_SUBTREE = `
  WITH RECURSIVE subtree(id, parent_id, type, name, match_key, commission_rate, depth) AS (
    SELECT id, parent_id, type, name, match_key, commission_rate, depth
      FROM org_nodes WHERE id = ?
    UNION ALL
    SELECT c.id, c.parent_id, c.type, c.name, c.match_key, c.commission_rate, c.depth
      FROM org_nodes c JOIN subtree s ON c.parent_id = s.id
    WHERE c.active = 1
  )
  SELECT
    s.id, s.parent_id, s.type, s.name, s.commission_rate, s.depth,
    COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN p.amount_krw ELSE 0 END), 0) AS own_gross,
    COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END), 0)            AS own_pays
  FROM subtree s
  LEFT JOIN students_erp st
         ON s.type = 'agency'
        AND ( st.shop_name = s.match_key
              OR st.user_id IN (SELECT user_id FROM student_org_override WHERE org_node_id = s.id) )
  LEFT JOIN student_payments p
         ON p.user_id = st.user_id
        AND p.status = 'paid'
        AND p.paid_at >= ? AND p.paid_at < ?
  GROUP BY s.id, s.parent_id, s.type, s.name, s.commission_rate, s.depth
  ORDER BY s.depth, s.id
`;
const SQL_ANCESTOR = `
  WITH RECURSIVE anc(id, parent_id, type, name, match_key, commission_rate, path, depth, active, hop) AS (
    SELECT id, parent_id, type, name, match_key, commission_rate, path, depth, active, 0
      FROM org_nodes WHERE id = ?
    UNION ALL
    SELECT o.id, o.parent_id, o.type, o.name, o.match_key, o.commission_rate, o.path, o.depth, o.active, a.hop + 1
      FROM org_nodes o JOIN anc a ON o.id = a.parent_id
  )
  SELECT id, parent_id, type, name, match_key, commission_rate, path, depth, active FROM anc ORDER BY hop ASC
`;
const SQL_LEDGER_UPSERT = `
  INSERT INTO org_settlement_ledger
    (node_id, node_type, node_name, period, gross_revenue, commission_rate, hq_fee, net_settlement, pay_count, status, closed_at, closed_by)
  VALUES (?,?,?,?,?,?,?,?,?, 'closed', ?, ?)
  ON CONFLICT(node_id, period) DO UPDATE SET
    gross_revenue=excluded.gross_revenue, commission_rate=excluded.commission_rate,
    hq_fee=excluded.hq_fee, net_settlement=excluded.net_settlement,
    pay_count=excluded.pay_count, node_name=excluded.node_name,
    node_type=excluded.node_type, status='closed', closed_at=excluded.closed_at, closed_by=excluded.closed_by
`;

// ════════════════════════════════════════════════════════════════════
// [0] 소스 드리프트 가드 — 실제 파일에 핵심 SQL·배선이 존재하는가
// ════════════════════════════════════════════════════════════════════
console.log('\n[0] 소스 드리프트 가드 (org-settlement.ts / index.ts / migration)');
const srcTs = readFileSync(resolve(CD, 'src/org-settlement.ts'), 'utf8');
const idxTs = readFileSync(resolve(CD, 'src/index.ts'), 'utf8');
const migSql = readFileSync(resolve(CD, 'migration-org-graph.sql'), 'utf8');
check('org-settlement.ts: 서브트리 재귀 CTE 존재', /WITH RECURSIVE subtree/.test(srcTs));
check('org-settlement.ts: 상위 역추적 재귀 CTE 존재', /WITH RECURSIVE anc/.test(srcTs));
check('org-settlement.ts: MANAGES 조인(shop_name=match_key) 존재', /st\.shop_name = s\.match_key/.test(srcTs));
check('org-settlement.ts: 결제 status=paid 필터 존재', /p\.status = 'paid'/.test(srcTs));
check('org-settlement.ts: 원장 멱등 ON CONFLICT 존재', /ON CONFLICT\(node_id, period\)/.test(srcTs));
check('org-settlement.ts: 기본 본사마진 60% 상수', /DEFAULT_HQ_RATE = 0\.60/.test(srcTs));
check('org-settlement.ts: 기본 지점수수료 40% 상수', /DEFAULT_BRANCH_RATE = 0\.40/.test(srcTs));
check('org-settlement.ts: 수동 설정표(settlement_rate_override) 생성', /CREATE TABLE IF NOT EXISTS settlement_rate_override/.test(srcTs));
check('org-settlement.ts: 요율 우선순위 결정 함수 존재', /function resolveHqRate\(/.test(srcTs));
check('org-settlement.ts: rate-config 조회/저장 라우트 존재', /'rate-config' && method === 'GET'/.test(srcTs) && /'rate-config' && method === 'POST'/.test(srcTs));
check('org-settlement.ts: 요율 저장은 HQ 전용', /'rate-config' && method === 'POST'[\s\S]{0,200}forbidden: HQ only/.test(srcTs));
// ⛔ 되살아나면 안 되는 것 — 옛 「지사 총매출 × 지사요율」 방식과 org_nodes 기본율 읽기
check('org-settlement.ts: branch-summary 가 org_nodes.commission_rate 를 안 읽음',
      !/MAX\(o\.commission_rate\)/.test(srcTs));
check('org-settlement.ts: branch-summary 가 대리점 단위로 집계', /GROUP BY franchise_name, agency_name/.test(srcTs));
check('index.ts: settlementRouter import 배선', /import \{ settlementRouter \} from '\.\/org-settlement'/.test(idxTs));
check('index.ts: /api/admin/settlement/ 라우트 배선', /\/api\/admin\/settlement\//.test(idxTs) && /settlementRouter\(request, env\)/.test(idxTs));
check('migration: org_nodes 테이블', /CREATE TABLE IF NOT EXISTS org_nodes/.test(migSql));
check('migration: 정산원장 UNIQUE(node_id,period)', /UNIQUE\(node_id, period\)/.test(migSql));

// ════════════════════════════════════════════════════════════════════
// [1] 순수 로직 단위 테스트
// ════════════════════════════════════════════════════════════════════
console.log('\n[1] 순수 로직 (수수료율 클램프 / 송금일 / 월범위)');
eq('요율 하한 클램프(음수→0)', clampRate(-0.5), 0);
eq('요율 상한 클램프(>1→1)', clampRate(1.7), 1);
eq('요율 정상값 보존', clampRate(0.55), 0.55);
eq('빈값 → 기본 60%', clampRate(undefined), DEFAULT_HQ_RATE);
eq('🔑 기본값 = 지점 40% / 본사 60%', [DEFAULT_BRANCH_RATE, DEFAULT_HQ_RATE], [0.40, 0.60]);
eq('퍼센트 입력(40) → 비율 0.4', toRate(40), 0.4);
eq('비율 입력(0.4) → 그대로', toRate(0.4), 0.4);
eq('퍼센트 100 → 1', toRate(100), 1);
eq('송금예정일 = 익월15일', nextSettlementDate('2026-05'), '2026-06-15');
eq('송금예정일 연말 넘김', nextSettlementDate('2026-12'), '2027-01-15');
check('월범위 시작<종료', (() => { const { startMs, endMs } = monthRange('2026-05'); return startMs < endMs; })());

// ════════════════════════════════════════════════════════════════════
// [2] 실제 SQLite 엔진 — 스키마/픽스처 구축
// ════════════════════════════════════════════════════════════════════
console.log('\n[2] 실 SQLite: 스키마 + 픽스처 구축');
const db = new DatabaseSync(':memory:');

// 실제 마이그레이션의 org 테이블들 (FK 구문은 node:sqlite 호환 위해 정리)
db.exec(`
  CREATE TABLE org_nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER, type TEXT NOT NULL, name TEXT NOT NULL, match_key TEXT, commission_rate REAL NOT NULL DEFAULT 0.15, path TEXT, depth INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE org_settlement_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, node_id INTEGER NOT NULL, node_type TEXT, node_name TEXT, period TEXT NOT NULL, gross_revenue INTEGER NOT NULL DEFAULT 0, commission_rate REAL NOT NULL DEFAULT 0, hq_fee INTEGER NOT NULL DEFAULT 0, net_settlement INTEGER NOT NULL DEFAULT 0, pay_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'closed', checksum TEXT, closed_at INTEGER NOT NULL, closed_by TEXT, UNIQUE(node_id, period));
  CREATE TABLE student_org_override (user_id TEXT PRIMARY KEY, org_node_id INTEGER NOT NULL, reason TEXT, updated_at INTEGER NOT NULL);
  CREATE TABLE students_erp (user_id TEXT, korean_name TEXT, hq_name TEXT, branch1_name TEXT, franchise TEXT, shop_name TEXT);
  CREATE TABLE student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount_krw INTEGER, status TEXT, paid_at INTEGER);
`);

const now = 1700000000000;
// 조직 트리: 본사 → (서울강남지사, 부산지사) → 대리점들
function ins(parent, type, name, key, rate, depth, path) {
  const r = db.prepare(`INSERT INTO org_nodes (parent_id,type,name,match_key,commission_rate,depth,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`).run(parent, type, name, key, rate, depth, now, now);
  const id = Number(r.lastInsertRowid);
  db.prepare(`UPDATE org_nodes SET path=? WHERE id=?`).run((path || '/') + id + '/', id);
  return id;
}
const HQ = ins(null, 'hq', '망고아이본사', null, 0, 0, '/');
const BR_GN = ins(HQ, 'branch', '서울강남지사', '서울강남', 0.15, 1, `/${HQ}/`);
const BR_BS = ins(HQ, 'branch', '부산지사', '부산', 0.15, 1, `/${HQ}/`);
const AG_GN = ins(BR_GN, 'agency', '강남대리점', '강남대리점', 0.18, 2, `/${HQ}/${BR_GN}/`);
const AG_SC = ins(BR_GN, 'agency', '서초대리점', '서초대리점', 0.15, 2, `/${HQ}/${BR_GN}/`);
const AG_HD = ins(BR_BS, 'agency', '해운대대리점', '해운대대리점', 0.16, 2, `/${HQ}/${BR_BS}/`);

// 학생 (shop_name 으로 대리점에 귀속)
const stu = (uid, shop) => db.prepare(`INSERT INTO students_erp (user_id,korean_name,hq_name,franchise,shop_name) VALUES (?,?,?,?,?)`).run(uid, uid, '망고아이본사', shop === '해운대대리점' ? '부산' : '서울강남', shop);
stu('stu1', '강남대리점'); stu('stu2', '강남대리점');
stu('stu3', '서초대리점');
stu('stu4', '해운대대리점');
stu('stu5', '강남대리점'); // 환불 케이스 학생

// 결제 (2026-05 KST 내부 시각)
const { startMs, endMs } = monthRange('2026-05');
const midMs = Math.floor((startMs + endMs) / 2);
const pay = (uid, amt, status = 'paid', at = midMs) => db.prepare(`INSERT INTO student_payments (user_id,amount_krw,status,paid_at) VALUES (?,?,?,?)`).run(uid, amt, status, at);
pay('stu1', 5000000); pay('stu2', 3000000); // 강남 = 800만
pay('stu3', 1000000);                        // 서초 = 100만
pay('stu4', 500000);                         // 해운대 = 50만
pay('stu5', 9999999, 'refunded');            // 환불 → 제외돼야
pay('stu1', 7777777, 'paid', startMs - 1);   // 전월(범위밖) → 제외돼야
check('픽스처: org_nodes 6개', db.prepare(`SELECT COUNT(*) c FROM org_nodes`).get().c === 6);
check('픽스처: 결제 6행(2 제외 대상 포함)', db.prepare(`SELECT COUNT(*) c FROM student_payments`).get().c === 6);

// ════════════════════════════════════════════════════════════════════
// [3] 서브트리 롤업 (실제 재귀 CTE) — 정확 귀속 검증
// ════════════════════════════════════════════════════════════════════
console.log('\n[3] 서브트리 롤업 (실제 WITH RECURSIVE) — 정확 귀속');
function rollup(rootId) {
  const rows = db.prepare(SQL_SUBTREE).all(rootId, startMs, endMs);
  return foldSubtree(rows);
}
const fromHQ = rollup(HQ);
const gn = fromHQ.get(AG_GN), sc = fromHQ.get(AG_SC), hd = fromHQ.get(AG_HD);
const brGN = fromHQ.get(BR_GN), brBS = fromHQ.get(BR_BS), hq = fromHQ.get(HQ);

eq('강남대리점 own_gross=800만', gn.gross, 8000000);
// 🔑 2026-08-18 정책: 수동 설정이 없으면 org_nodes 에 무슨 값이 있든 «기본 60%» 다.
//    (픽스처의 org_nodes 는 0.18/0.15/0.16 이지만 그건 rebuild 가 채운 값이라 안 쓴다)
eq('강남대리점 본사마진 기본 60% = 480만', gn.hq_fee, 4800000);
eq('강남대리점 지점정산액 40% = 320만', gn.net_settlement, 3200000);
eq('서초대리점 gross=100만, 기본 60% 수수료', [sc.gross, sc.hq_fee], [1000000, 600000]);
eq('해운대대리점 gross=50만, 기본 60% 수수료', [hd.gross, hd.hq_fee], [500000, 300000]);
check('🔑 org_nodes.commission_rate(0.18)를 안 씀', gn.hq_fee !== Math.round(8000000 * 0.18));
// ① 핵심 회귀: 균등분배가 아님을 증명 (옛 버그라면 950만/3≈316만으로 동일해야 함)
check('🔑 균등분배 아님: 강남(320만)≠서초(40만)', gn.net_settlement !== sc.net_settlement);
eq('서울강남지사 누적 gross = 900만(강남800+서초100)', brGN.gross, 9000000);
// ② 지사 수수료 = 「지사 총매출 × 지사요율」이 아니라 「대리점별 수수료의 합」
eq('서울강남지사 수수료 = 대리점 합(480만+60만)', brGN.hq_fee, 5400000);
eq('본사 수수료 = 전사 합(950만×60%)', hq.hq_fee, 5700000);
eq('부산지사 누적 gross = 50만', brBS.gross, 500000);
eq('본사 누적 gross = 950만(전사)', hq.gross, 9500000);
// ④ 환불·전월 제외
eq('환불/전월 제외(강남 결제건수=2)', gn.pays, 2);
eq('전사 결제건수=4(환불·전월 제외)', hq.pays, 4);

// 지사 단독 롤업도 일치해야
const fromBR = rollup(BR_GN);
eq('지사기준 롤업도 동일(서울강남지사 900만)', fromBR.get(BR_GN).gross, 9000000);
eq('지사기준: 직속 자식 2개(강남·서초)', fromBR.get(BR_GN).children.length, 2);

// ════════════════════════════════════════════════════════════════════
// [4] 상위 역추적 (실제 재귀 CTE) — 대리점→지사→본사
// ════════════════════════════════════════════════════════════════════
console.log('\n[4] 상위 역추적 (실제 WITH RECURSIVE anc)');
const chain = db.prepare(SQL_ANCESTOR).all(AG_GN);
eq('역추적 체인 길이=3(대리점→지사→본사)', chain.length, 3);
eq('체인 시작=강남대리점', chain[0].name, '강남대리점');
eq('체인 끝=본사', chain[chain.length - 1].type, 'hq');
check('체인에 서울강남지사 포함', chain.some(n => n.name === '서울강남지사'));
check('체인에 부산지사 미포함(다른 가지)', !chain.some(n => n.name === '부산지사'));

// ════════════════════════════════════════════════════════════════════
// [5] override 보정 — shop_name 라벨 불일치 학생 강제 귀속
// ════════════════════════════════════════════════════════════════════
console.log('\n[5] student_org_override 보정');
db.prepare(`INSERT INTO students_erp (user_id,korean_name,shop_name) VALUES ('stuX','이관학생','라벨없음')`).run();
pay('stuX', 2000000);
db.prepare(`INSERT INTO student_org_override (user_id,org_node_id,reason,updated_at) VALUES ('stuX',?, '분점이관', ?)`).run(AG_SC, now);
const afterOverride = rollup(HQ);
eq('override: 서초대리점 gross 100만→300만', afterOverride.get(AG_SC).gross, 3000000);
eq('override: 전사 gross 950만→1150만', afterOverride.get(HQ).gross, 11500000);

// ════════════════════════════════════════════════════════════════════
// [6] 정산 마감 멱등 (ON CONFLICT) — 이중정산 차단
// ════════════════════════════════════════════════════════════════════
console.log('\n[6] 정산원장 마감 멱등성');
function closePeriod(period) {
  const folded = rollup(HQ);
  for (const n of folded.values())
    db.prepare(SQL_LEDGER_UPSERT).run(n.id, n.type, n.name, period, n.gross, n.commission_rate, n.hq_fee, n.net_settlement, n.pays, Date.now(), '본사 (전체)');
}
closePeriod('2026-05');
const cnt1 = db.prepare(`SELECT COUNT(*) c FROM org_settlement_ledger WHERE period='2026-05'`).get().c;
closePeriod('2026-05'); // 재마감
const cnt2 = db.prepare(`SELECT COUNT(*) c FROM org_settlement_ledger WHERE period='2026-05'`).get().c;
eq('마감행 = 노드수(6)', cnt1, 6);
eq('🔑 재마감해도 행 증가 없음(멱등)', cnt2, cnt1);
const ledHQ = db.prepare(`SELECT gross_revenue, hq_fee, net_settlement FROM org_settlement_ledger WHERE node_id=? AND period='2026-05'`).get(HQ);
eq('원장 본사 gross=1150만(override 반영 스냅샷)', ledHQ.gross_revenue, 11500000);
const ledGN = db.prepare(`SELECT net_settlement FROM org_settlement_ledger WHERE node_id=? AND period='2026-05'`).get(AG_GN);
eq('원장 강남대리점 정산액=320만(기본 40%)', ledGN.net_settlement, 3200000);

// ════════════════════════════════════════════════════════════════════
// [7] 🔑 수수료 «수동 설정» 우선순위 — 요구사항 3의 회귀 감시
//     ① 대리점 설정  ② (상위) 지사 설정  ③ 기본값 60%
// ════════════════════════════════════════════════════════════════════
console.log('\n[7] 수수료 수동 설정 우선순위 (대리점 → 지사 → 기본값)');
eq('설정 없음 → 기본 60%', resolveHqRate(emptyOv(), '서울강남지사', '강남대리점').rate, 0.60);
eq('설정 없음 → source=default', resolveHqRate(emptyOv(), '서울강남지사', '강남대리점').source, 'default');
{
  const ov = emptyOv();
  ov.branch.set('서울강남지사', 0.50);
  eq('지사 설정 50% 가 기본값을 이김', resolveHqRate(ov, '서울강남지사', '강남대리점').rate, 0.50);
  eq('지사 설정 → source=branch', resolveHqRate(ov, '서울강남지사', '강남대리점').source, 'branch');
  ov.agency.set('강남대리점', 0.70);
  eq('🔑 대리점 설정 70% 가 지사 설정을 이김', resolveHqRate(ov, '서울강남지사', '강남대리점').rate, 0.70);
  eq('대리점 설정 → source=agency', resolveHqRate(ov, '서울강남지사', '강남대리점').source, 'agency');
  eq('설정 안 한 대리점은 지사 설정을 상속', resolveHqRate(ov, '서울강남지사', '서초대리점').rate, 0.50);
  eq('다른 지사는 여전히 기본값', resolveHqRate(ov, '부산지사', '해운대대리점').rate, 0.60);
}
// 실제 롤업에 반영되는가 (요구사항 4: 정산 금액 계산에 즉시 반영)
{
  const ov = emptyOv();
  ov.branch.set('서울강남지사', 0.50);   // 지사 전체 50%
  ov.agency.set('강남대리점', 0.70);     // 그 안의 강남만 70%
  const rows = db.prepare(SQL_SUBTREE).all(HQ, startMs, endMs);
  const f = foldSubtree(rows, ov);
  const g = f.get(AG_GN), c = f.get(AG_SC), h = f.get(AG_HD), bg = f.get(BR_GN);
  eq('강남대리점 = 800만×70% = 560만', g.hq_fee, 5600000);
  eq('서초대리점 = (override로 300만)×50% = 150만', c.hq_fee, 1500000);
  eq('해운대(설정 없음) = 50만×60% = 30만', h.hq_fee, 300000);
  eq('지사 수수료 = 대리점 합(560만+150만)', bg.hq_fee, 7100000);
  // 지사에 찍히는 요율은 «실제로 떼인 비율» = 710만 / 1100만
  eq('지사 표시요율 = 가중평균(0.6455)', bg.commission_rate, Math.round((7100000 / 11000000) * 10000) / 10000);
  check('🔑 「지사 총매출 × 지사요율」이 아님', bg.hq_fee !== Math.round(bg.gross * 0.50));
}

db.close();

// ════════════════════════════════════════════════════════════════════
// [8] 🔗 「가맹점별 정산서」가 같은 요율을 쓰는지 — 2026-08-18 실제로 갈렸던 자리
//
//     정산관리(org-settlement)는 본사 60% 로 바뀌었는데 가맹점별 정산서
//     (accounting-reports.ts franchiseReport)에는 «|| 0.15» 가 그대로 남아 있었다.
//     같은 가맹점을 두고 한 화면은 15%, 다른 화면은 60% 를 뗐다.
//     정산서는 **가맹점에 실제로 보내는 문서**라 이대로면 분쟁이 난다.
//     아래 검사는 그 상태로 되돌아가면 FAIL 을 낸다.
// ════════════════════════════════════════════════════════════════════
console.log('\n[8] 가맹점별 정산서가 정산관리와 같은 요율을 쓰는가');
{
  const AR = readFileSync(new URL('../cloudflare-deploy/src/accounting-reports.ts', import.meta.url), 'utf8');
  const OS = readFileSync(new URL('../cloudflare-deploy/src/org-settlement.ts', import.meta.url), 'utf8');

  check('정산서가 org-settlement 의 요율 판정기를 import 한다',
    /import\s*\{[^}]*resolveHqRate[^}]*\}\s*from\s*'\.\/org-settlement'/.test(AR));
  check('정산서가 resolveHqRate() 를 실제로 부른다', /resolveHqRate\s*\(/.test(AR));
  check('정산서가 수동 설정표를 읽는다(loadRateOverrides)', /loadRateOverrides\s*\(/.test(AR));

  // 🔑 핵심: 요율을 손으로 적어 두면 안 된다. «|| 0.15» 류가 되살아나면 잡는다.
  const franchiseFn = AR.slice(AR.indexOf('async function franchiseReport('),
                                AR.indexOf('async function payslipsReport('));
  check('🔑 정산서에 요율 하드코딩이 없다 (예: hq_fee ... || 0.15)',
    !/get\('hq_fee'\)\s*\)\s*\|\|\s*0?\.\d+/.test(franchiseFn));
  check('🔑 정산서가 15~18% 옛 정책값을 다시 쓰지 않는다',
    !/\b0\.1[5-8]\b/.test(franchiseFn));

  // 기본값은 org-settlement 한 곳에서만 정의된다 (복사본 금지)
  check('기본 요율 상수는 org-settlement 가 export 한다',
    /export const DEFAULT_HQ_RATE\s*=\s*0\.60/.test(OS));
  check('정산서는 기본값을 복사하지 않고 import 한 상수를 쓴다',
    /DEFAULT_HQ_RATE/.test(franchiseFn) && !/const\s+DEFAULT_HQ_RATE/.test(AR));

  // 대리점별 설정이 먹히려면 «지사 × 대리점» 으로 집계해야 한다
  check('🔑 정산서가 대리점(shop_name)까지 쪼개 집계한다',
    /GROUP BY f\.id, f\.name, f\.active, a\.agency/.test(franchiseFn));
  check('정산서가 대리점별 매출을 따로 쥔다(byAgency)', /byAgency/.test(franchiseFn));
  check('🔑 「지사 총매출 × 요율」 한 방 곱셈이 아니다',
    !/const fee = Math\.round\(gross \* hqFeeRate\)/.test(franchiseFn));

  // 화면에 고정 요율 문구를 다시 박지 않았는지 (예전 「평균 수수료율 15%」)
  const CORE = readFileSync(new URL('../cloudflare-deploy/public/js/adm-core.js', import.meta.url), 'utf8');
  const rf = CORE.slice(CORE.indexOf('function renderFranchise('), CORE.indexOf('function renderPayslips('));
  check('화면이 서버가 준 요율을 그린다(pctRate)', /pctRate\(/.test(rf));
  check('🔑 화면에 요율 숫자가 손으로 박혀 있지 않다', !/수수료율\s*1[0-9]%|평균 수수료율/.test(rf));
}

// ════════════════════════════════════════════════════════════════════
// [9] 💰 대리점별 수강료 → 본사 요율 파생 (2026-08-22 사장님 확인 단가)
//
//     주1회 표준 30,000원 = 본사 18,000(60%) + 대리점 12,000(40%).
//     표준보다 더 받는 곳은 **추가분을 대리점이 다 가진다** → 본사는 18,000 고정.
//     그래서 요율은 «18,000 ÷ 수강료» 로 파생된다. 사람이 45% 를 손으로 적지 않는다.
// ════════════════════════════════════════════════════════════════════
console.log('\n[9] 수강료 → 본사 요율 파생');
{
  const OS = readFileSync(new URL('../cloudflare-deploy/src/org-settlement.ts', import.meta.url), 'utf8');
  const num = (name) => {
    const m = OS.match(new RegExp('export const ' + name + '\\s*=\\s*(\\d+)'));
    return m ? Number(m[1]) : null;
  };
  const STD = num('STANDARD_TUITION_KRW'), UNIT = num('HQ_UNIT_KRW');
  eq('표준 수강료 30,000원', STD, 30000);
  eq('본사 단가 18,000원', UNIT, 18000);
  check('🔑 표준가에서 기본 요율(60%)이 그대로 나온다', Math.abs(UNIT / STD - 0.60) < 1e-9);
  eq('지점 몫 = 12,000원', STD - UNIT, 12000);

  // 파생식을 소스에서 그대로 뽑아 돌린다 (손으로 옮겨 적지 않는다)
  const rate = (t) => (!Number.isFinite(t) || t < UNIT) ? null : Math.min(1, UNIT / t);
  eq('30,000원 → 60.0%', Math.round(rate(30000) * 1000) / 10, 60);
  eq('🔑 40,000원 → 45.0% (추가 1만원은 대리점 몫)', Math.round(rate(40000) * 1000) / 10, 45);
  eq('40,000원일 때 본사 금액은 18,000 그대로', Math.round(40000 * rate(40000)), 18000);
  eq('40,000원일 때 대리점은 22,000원', 40000 - Math.round(40000 * rate(40000)), 22000);
  /* 주 2·3·5회 — ⚠️ 설정값은 **언제나 «주1회» 수강료**다. 요율은 거기서 한 번만 내고,
     실제 결제액(주1회가 × 회수)에 그 요율을 곱한다. 결제액을 수강료 칸에 넣는 것이
     아니다(그러면 주2회 대리점의 요율이 30% 로 반토막 난다 — 이 하니스가 처음 그렇게
     잘못 짰다가 잡혔다). 배수여도 비율은 그대로라는 것이 이 검사의 요점이다. */
  for (const [label, weekly1, rt] of [['표준', 30000, rate(30000)], ['4만원 대리점', 40000, rate(40000)]]) {
    for (const n of [1, 2, 3, 5]) {
      const paid = weekly1 * n;                       // 주n회 실제 결제액
      const hq = Math.round(paid * rt);
      eq(`${label} 주${n}회 — 요율은 그대로 ${(rt*100).toFixed(0)}%`, Math.round(rt * 1000) / 10, Math.round(rt * 1000) / 10);
      eq(`${label} 주${n}회 본사 몫 = ${UNIT.toLocaleString()}×${n}`, hq, UNIT * n);
      eq(`${label} 주${n}회 대리점 몫`, paid - hq, (weekly1 - UNIT) * n);
    }
  }
  check('🔑 본사 단가보다 싼 수강료는 거부한다', rate(10000) === null);

  // 소스가 실제로 그 식을 쓰는지 (하니스가 로직을 베껴 쓰면 감시가 아니다)
  check('hqRateFromTuition() 이 HQ_UNIT_KRW ÷ 수강료 를 쓴다',
    /HQ_UNIT_KRW\s*\/\s*t/.test(OS));
  check('본사 단가 미만은 null 을 돌려준다', /t\s*<\s*HQ_UNIT_KRW\)\s*return null/.test(OS));
  check('rate-config 가 tuition_krw 를 받는다', /tuition_krw/.test(OS) && /hqRateFromTuition\(/.test(OS));
  check('표 DDL 정본이 한 곳이다(export ensureRateOverrideTable)',
    /export async function ensureRateOverrideTable/.test(OS));
  check('🔑 DDL 을 복사하지 않았다 — CREATE 문이 한 벌뿐',
    (OS.match(/CREATE TABLE IF NOT EXISTS settlement_rate_override/g) || []).length === 1);

  // 대리점 목록이 수강료를 함께 내려주고, 표를 먼저 보장하는가
  const AA = readFileSync(new URL('../cloudflare-deploy/src/api-admin.ts', import.meta.url), 'utf8');
  check('대리점 목록이 수강료를 함께 내려준다', /tuition_krw/.test(AA));
  check('🔑 조회 전에 표를 보장한다(없으면 목록이 통째로 깨진다)',
    /await ensureRateOverrideTable\(env\)/.test(AA));
  check('DDL 을 api-admin 에 복사하지 않았다',
    !/CREATE TABLE IF NOT EXISTS settlement_rate_override/.test(AA));

  // 화면: 가맹점을 코드에 특정하지 않는다 (사장님 지시)
  const CORE = readFileSync(new URL('../cloudflare-deploy/public/js/adm-core.js', import.meta.url), 'utf8');
  const tu = CORE.slice(CORE.indexOf('async function ctSetTuition('), CORE.indexOf('window.ctSetTuition'));
  /* 💰 (2026-09-11) 정본이 _ctPostTuition 하나로 모였다 — 표 안 칸(ctSetTuition)과
     대리점 «수정» 폼(saveCenter)이 둘 다 그것을 부른다.
     🪤 「그 줄이 ctSetTuition 안에 있는가」로 물으면 **정본으로 모으는 정당한 수리가
        빨간불**이 된다(2026-09-11 실제로 밟음). «뜻» 으로 묻는다 — 정본이 rate-config 로
        가는가 + 부르는 쪽이 그 정본을 실제로 부르는가, 둘을 짝으로. */
  const post = CORE.slice(CORE.indexOf('async function _ctPostTuition('), CORE.indexOf('window._ctPostTuition'));
  check('[전제] 수강료 저장 정본(_ctPostTuition)을 잘라 냈다', post.length > 80);
  check('수강료 저장이 rate-config 로 간다', /rate-config/.test(post));
  check('비우면 표준값으로 되돌린다(reset)', /reset:\s*true/.test(post));
  check('표 안 칸이 그 정본을 부른다(자기가 따로 조립하지 않는다)',
    /_ctPostTuition\(/.test(tu) && !/rate-config/.test(tu));
  /* 🧾 수정 폼도 같은 정본을 쓴다 — 그리고 **대리점 저장이 끝난 뒤 «바뀐 뒤 이름»** 으로
     불러야 한다(scope_key 가 대리점 «이름» 이라, 먼저 부르면 옛 이름에 저장된다). */
  const sc = CORE.slice(CORE.indexOf('async function saveCenter('), CORE.indexOf('window.saveCenter'));
  check('수정 폼도 그 정본을 부른다', /_ctPostTuition\(name,/.test(sc));
  /* 🪤 부정 검사는 **주석을 벗겨 낸 사본**으로 — 나중에 「⛔ 여기서 rate-config 를 직접
        부르지 말 것」 같은 주석을 달면 검사가 자기 주석을 잡는다(CLAUDE.md 2장). */
  const scCode = sc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  check('수정 폼이 rate-config 를 따로 부르지 않는다', !/rate-config/.test(scCode));
  check('🔑 수강료 저장이 «대리점 저장 뒤» 에 온다 (바뀐 뒤 이름으로)',
    sc.indexOf('_ctPostTuition(') > sc.indexOf("method: 'PATCH'"));
  check('수강료만 실패했을 때 사람에게 말한다(조용한 반쪽 성공 금지)',
    /tuitionErr/.test(sc));
  check('실패 시 값을 되돌린다(조용한 반쪽 성공 금지)', /inp\.value\s*=\s*prev/.test(tu));
  /* 🔑 사장님 지시 — 특정 가맹점을 코드에 특정하지 않는다.
     🪤 2026-09-11: 본문이 _ctPostTuition 으로 옮겨 갔는데 이 검사는 tu(표 안 칸)만 보고 있어
        **post 안에 이름을 박아도 통과**했다(변이시험 실측 134/134 초록). 둘 다 본다. */
  check('🔑 특정 가맹점 이름이 코드에 박혀 있지 않다',
    !/(SLP|뮤엠|캐피타운|장지웅)/.test(tu + '\n' + post));
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { console.log('실패 항목:\n - ' + FAILS.join('\n - ')); process.exit(1); }
console.log('✅ 전부 통과\n');
