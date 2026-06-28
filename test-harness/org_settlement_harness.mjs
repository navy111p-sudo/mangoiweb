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
const RATE_MIN = 0.15, RATE_MAX = 0.18;
const clampRate = r => Math.min(RATE_MAX, Math.max(RATE_MIN, Number(r) || RATE_MIN));
function nextSettlementDate(period) {
  const [y, m] = period.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-15`;
}
function foldSubtree(rows) {
  const byId = new Map();
  for (const r of rows) byId.set(r.id, { ...r, gross: r.own_gross, pays: r.own_pays, children: [] });
  const ordered = [...rows].sort((a, b) => b.depth - a.depth);
  for (const r of ordered) {
    const node = byId.get(r.id);
    if (r.parent_id != null && byId.has(r.parent_id)) {
      const parent = byId.get(r.parent_id);
      parent.gross += node.gross; parent.pays += node.pays; parent.children.push(r.id);
    }
  }
  for (const node of byId.values()) {
    node.hq_fee = Math.round(node.gross * (node.commission_rate || 0));
    node.net_settlement = node.gross - node.hq_fee;
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
  WITH RECURSIVE anc(id, parent_id, type, name, match_key, commission_rate, path, depth, active) AS (
    SELECT id, parent_id, type, name, match_key, commission_rate, path, depth, active
      FROM org_nodes WHERE id = ?
    UNION ALL
    SELECT o.id, o.parent_id, o.type, o.name, o.match_key, o.commission_rate, o.path, o.depth, o.active
      FROM org_nodes o JOIN anc a ON o.id = a.parent_id
  )
  SELECT * FROM anc ORDER BY depth ASC
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
check('org-settlement.ts: 수수료율 클램프 0.15~0.18', /RATE_MIN = 0\.15.*RATE_MAX = 0\.18|RATE_MIN = 0\.15/.test(srcTs) && /0\.18/.test(srcTs));
check('index.ts: settlementRouter import 배선', /import \{ settlementRouter \} from '\.\/org-settlement'/.test(idxTs));
check('index.ts: /api/admin/settlement/ 라우트 배선', /\/api\/admin\/settlement\//.test(idxTs) && /settlementRouter\(request, env\)/.test(idxTs));
check('migration: org_nodes 테이블', /CREATE TABLE IF NOT EXISTS org_nodes/.test(migSql));
check('migration: 정산원장 UNIQUE(node_id,period)', /UNIQUE\(node_id, period\)/.test(migSql));

// ════════════════════════════════════════════════════════════════════
// [1] 순수 로직 단위 테스트
// ════════════════════════════════════════════════════════════════════
console.log('\n[1] 순수 로직 (수수료율 클램프 / 송금일 / 월범위)');
eq('수수료율 하한 클램프', clampRate(0.10), 0.15);
eq('수수료율 상한 클램프', clampRate(0.25), 0.18);
eq('수수료율 정상값 보존', clampRate(0.16), 0.16);
eq('빈값 → 하한', clampRate(undefined), 0.15);
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
eq('강남대리점 수수료 18% = 144만', gn.hq_fee, 1440000);
eq('강남대리점 정산액 = 656만', gn.net_settlement, 6560000);
eq('서초대리점 gross=100만, 15% 수수료', [sc.gross, sc.hq_fee], [1000000, 150000]);
eq('해운대대리점 gross=50만, 16% 수수료', [hd.gross, hd.hq_fee], [500000, 80000]);
// ① 핵심 회귀: 균등분배가 아님을 증명 (옛 버그라면 950만/3≈316만으로 동일해야 함)
check('🔑 균등분배 아님: 강남(656만)≠서초(85만)', gn.net_settlement !== sc.net_settlement);
eq('서울강남지사 누적 gross = 900만(강남800+서초100)', brGN.gross, 9000000);
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
eq('원장 강남대리점 정산액=656만', ledGN.net_settlement, 6560000);

db.close();

// ════════════════════════════════════════════════════════════════════
console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { console.log('실패 항목:\n - ' + FAILS.join('\n - ')); process.exit(1); }
console.log('✅ 전부 통과\n');
