/**
 * org-settlement.ts — 조직 그래프 트리 기반 실시간 정산 엔진 (2026-06-29 추가)
 *
 * 목적 / 기존 시스템과의 관계
 * ─────────────────────────────────────────────────────────────────────────
 *   accounting-reports.ts 의 franchiseReport() 는 조직 계보가 students_erp 의
 *   평면 라벨(hq_name/branch1_name/franchise/shop_name)로만 존재해 "총매출 ÷
 *   가맹점 수" 균등 분배라는 부정확한 추정을 했고, 정산월마다 무거운 JOIN 으로
 *   느렸다.
 *
 *   본 모듈은 (:HQ)-[:PARENT_OF]->(지사)-[:PARENT_OF]->(대리점)-[:MANAGES]->(학생)
 *   그래프 트리(org_nodes, parent_id self-ref)를 SQLite WITH RECURSIVE 로 순회해
 *     · 하위 계보 매출 집계(서브트리 롤업)
 *     · 상위 노드 역추적(수수료 체인)
 *   을 정확히 산출한다. Neo4j 가 없으므로(런타임=Cloudflare Workers + D1)
 *   churn-graph.ts 와 동일 철학으로 D1 원자료에서 그래프를 구성한다.
 *   같은 모델의 Cypher 정본은 org-settlement.cypher 참고.
 *
 * 그래프 모델 (org_nodes = 노드, parent_id = [:PARENT_OF] 역방향)
 *   (:HQ)-[:PARENT_OF]->(:Branch 지사)-[:PARENT_OF]->(:Agency 대리점)
 *   (:Agency)-[:MANAGES]->(:Student)            // students_erp.shop_name = agency.match_key
 *   (:Student)-[:PAID {amount, month}]->(:Payment)  // student_payments
 *   commission_rate: 각 노드가 상위(부모)에게 내는 본사 마진율.
 *     기본 60%(지점 수수료 40%) — 2026-08-18 정책. 지사·대리점별 수동 설정은
 *     settlement_rate_override 가 정본이고 그 값이 기본값보다 우선한다.
 *
 * 데이터 소스(모두 기존 테이블 + 신규 org_nodes/org_settlement_ledger)
 *   org_nodes · students_erp · student_payments · student_org_override
 *   → 테이블/행이 비어 있어도 안전하게 0 으로 graceful degradation.
 *
 * 외부 공개(라우터)  — /api/admin/settlement/*
 *   GET  /tree                         조직 그래프 트리 전체
 *   GET  /rollup?period=YYYY-MM        HQ 기준 전사 정산(가맹점별 정확 분배)
 *   GET  /node/:id?period=YYYY-MM      특정 지사/대리점 정산서(하위집계+상위역추적)
 *   GET  /rates                        노드별 수수료율 목록
 *   POST /rates  {node_id, rate}       수수료율 설정
 *   GET  /rate-config?period=&scope=&q=              지사·대리점별 요율 설정 목록
 *   POST /rate-config {scope_type, scope_key, branch_rate|hq_rate}  수동 설정 저장
 *   POST /rate-config {scope_type, scope_key, reset:true}           기본값으로 되돌리기
 *   POST /close?period=YYYY-MM         정산 마감 → 원장 스냅샷(멱등, 데이터 신뢰성)
 *   POST /rebuild                      students_erp 라벨에서 그래프 트리 자동 구성
 *   format=csv 지원(GET 계열).  scope.ts 로 대리점/지사 데이터 격리 적용.
 */

import { getScope, scopeStudentCond, type Scope } from './scope';

interface Env {
  DB: D1Database;
}

// ── 응답/유틸 헬퍼 (accounting-reports.ts 와 동일 시그니처, 모듈 독립) ──────
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const csv = (filename: string, rows: (string | number)[][]): Response => {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = '﻿' + rows.map(r => r.map(esc).join(',')).join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};

const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn(); } catch { return fallback; }
};

/* ── 수수료 정책 (2026-08-18 사장님 지시로 변경) ─────────────────────────────
   예전 정책: 본사 수수료 15~18% 를 RATE_MIN/RATE_MAX 로 «클램프» 했다.
   현재 정책: **지점 수수료 40% / 본사 마진 60%** 가 기본값이고, 수강료·대리점 마진·
             본사 마진이 다른 곳이 실제로 있으므로 지사·대리점별로 관리자 화면에서
             **수동으로 개별 설정**할 수 있다.

   ⚠️ org_nodes.commission_rate 를 «수동 설정값» 으로 쓰면 안 된다 —
      rebuildTree() 가 새 노드를 만들 때 기본값을 그대로 써 넣기 때문에
      「사람이 정한 값」과 「자동으로 채워진 값」을 구분할 수 없다.
      그래서 사람이 정한 값만 담는 별도 표(settlement_rate_override)를 둔다.
      우선순위: 대리점 설정 → (그 대리점이 속한) 지사 설정 → 기본값 60%.
*/
const DEFAULT_HQ_RATE = 0.60;        // 본사 마진 기본 60%
const DEFAULT_BRANCH_RATE = 0.40;    // 지점 수수료 기본 40% (= 1 - DEFAULT_HQ_RATE)
const RATE_MIN = 0, RATE_MAX = 1;    // 수동 설정 허용 범위(0~100%)
const clampRate = (r: number) => {
  const n = Number(r);
  if (!Number.isFinite(n)) return DEFAULT_HQ_RATE;
  return Math.min(RATE_MAX, Math.max(RATE_MIN, n));
};
/** 입력이 비율(0~1)인지 퍼센트(0~100)인지 판별해 비율로 정규화. 「60」도 「0.6」도 60% */
const toRate = (v: unknown): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return clampRate(n > 1 ? n / 100 : n);
};

// 월(YYYY-MM) → KST 기준 [startMs, endMs). student_payments.paid_at 은 ms.
function monthRange(period: string): { startMs: number; endMs: number; label: string } {
  const [y, m] = String(period).split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error('invalid period (YYYY-MM)');
  const start = new Date(Date.UTC(y, m - 1, 1) - 9 * 3600 * 1000);
  const end = new Date(Date.UTC(y, m, 1) - 9 * 3600 * 1000);
  return { startMs: start.getTime(), endMs: end.getTime(), label: `${y}년 ${m}월` };
}

function currentMonth(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // KST
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// 정산 송금예정일 = 익월 15일
function nextSettlementDate(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-15`;
}

// ── 스키마 보장 + 라벨에서 그래프 트리 자동 구성 ────────────────────────────
async function ensureSchema(env: Env): Promise<void> {
  await safe(async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS org_nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER, type TEXT NOT NULL, name TEXT NOT NULL, match_key TEXT, commission_rate REAL NOT NULL DEFAULT 0.15, path TEXT, depth INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    return true;
  }, false);
  await safe(async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS org_settlement_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, node_id INTEGER NOT NULL, node_type TEXT, node_name TEXT, period TEXT NOT NULL, gross_revenue INTEGER NOT NULL DEFAULT 0, commission_rate REAL NOT NULL DEFAULT 0, hq_fee INTEGER NOT NULL DEFAULT 0, net_settlement INTEGER NOT NULL DEFAULT 0, pay_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'closed', checksum TEXT, closed_at INTEGER NOT NULL, closed_by TEXT, UNIQUE(node_id, period))`);
    return true;
  }, false);
  await safe(async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_org_override (user_id TEXT PRIMARY KEY, org_node_id INTEGER NOT NULL, reason TEXT, updated_at INTEGER NOT NULL)`);
    return true;
  }, false);
  /* 🧾 지사·대리점별 수수료 «수동 설정» (2026-08-18 신설)
     행이 있으면 그 값이 기본값(본사 60%)보다 우선한다. 행을 지우면 다시 기본값.
       scope_type = 'branch'(지사) | 'agency'(대리점)
       scope_key  = 그 이름 — students_erp.franchise / shop_name 라벨과 같은 문자열
       hq_rate    = 본사 마진 비율(0~1). 지점 수수료 = 1 - hq_rate */
  await safe(async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS settlement_rate_override (scope_type TEXT NOT NULL, scope_key TEXT NOT NULL, hq_rate REAL NOT NULL, note TEXT, updated_at INTEGER NOT NULL, updated_by TEXT, PRIMARY KEY (scope_type, scope_key))`);
    return true;
  }, false);
}

// ── 수수료 «수동 설정» 조회 (지사/대리점 이름 → 본사 마진율) ────────────────
interface RateOverrides { branch: Map<string, number>; agency: Map<string, number>; }

const emptyOverrides = (): RateOverrides => ({ branch: new Map(), agency: new Map() });

async function loadRateOverrides(env: Env): Promise<RateOverrides> {
  const rows = await safe(async () =>
    (await env.DB.prepare(`SELECT scope_type, scope_key, hq_rate FROM settlement_rate_override`)
      .all<{ scope_type: string; scope_key: string; hq_rate: number }>()).results || [],
    [] as Array<{ scope_type: string; scope_key: string; hq_rate: number }>);
  const ov = emptyOverrides();
  for (const r of rows) {
    const m = r.scope_type === 'agency' ? ov.agency : r.scope_type === 'branch' ? ov.branch : null;
    if (m && r.scope_key) m.set(String(r.scope_key).trim(), clampRate(Number(r.hq_rate)));
  }
  return ov;
}

/**
 * 요율 결정 — 「수동 설정이 있으면 그것, 없으면 기본값」의 정본.
 *   ① 대리점 수동 설정  ② (그 대리점이 속한) 지사 수동 설정  ③ 기본값 60%
 * agencyName 이 없으면 지사 단위로만 판정한다.
 */
function resolveHqRate(ov: RateOverrides, branchName: string | null, agencyName: string | null):
    { rate: number; source: 'agency' | 'branch' | 'default' } {
  const a = agencyName ? ov.agency.get(String(agencyName).trim()) : undefined;
  if (a != null) return { rate: a, source: 'agency' };
  const b = branchName ? ov.branch.get(String(branchName).trim()) : undefined;
  if (b != null) return { rate: b, source: 'branch' };
  return { rate: DEFAULT_HQ_RATE, source: 'default' };
}

interface OrgRow {
  id: number; parent_id: number | null; type: string; name: string;
  match_key: string | null; commission_rate: number; path: string | null;
  depth: number; active: number;
}

/**
 * students_erp 의 평면 라벨에서 그래프 트리를 (재)구성한다.
 * hq_name → (없으면 '망고아이본사') → franchise(지사) → shop_name(대리점) 계보.
 * 멱등: 같은 (type,name,parent) 는 1개만. 기존 commission_rate 는 보존.
 */
async function rebuildTree(env: Env): Promise<{ created: number; total: number }> {
  await ensureSchema(env);
  const now = Date.now();

  // 1) 라벨 distinct 수집 (대리점이 최소 단위)
  //    HQ fallback 은 하드코딩 대신 "이미 가장 많이 쓰인 실제 hq_name" 으로 정해
  //    NULL/공백 hq 학생이 별도 stray HQ 노드를 만들지 않게 한다(공백차이 등 변종 흡수).
  const canonHq = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT TRIM(hq_name) AS hq, COUNT(*) c FROM students_erp
      WHERE hq_name IS NOT NULL AND TRIM(hq_name)<>''
      GROUP BY hq ORDER BY c DESC LIMIT 1
    `).first<{ hq: string }>();
    return r?.hq || '망고아이 본사';
  }, '망고아이 본사');

  const labels = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT
        COALESCE(NULLIF(TRIM(hq_name),''), ?) AS hq,
        NULLIF(TRIM(franchise),'')            AS branch,
        NULLIF(TRIM(shop_name),'')            AS agency
      FROM students_erp
      GROUP BY hq, branch, agency
    `).bind(canonHq).all<{ hq: string; branch: string | null; agency: string | null }>();
    return r.results || [];
  }, [] as Array<{ hq: string; branch: string | null; agency: string | null }>);

  // 2) 노드 upsert 헬퍼 (이름+타입+부모로 유일성 판단, rate 는 신규시 기본 본사마진 60%)
  const cache = new Map<string, number>(); // key: `${type}|${parentId}|${name}` → id
  let created = 0;

  const upsert = async (type: string, name: string, parentId: number | null, matchKey: string | null, depth: number): Promise<number> => {
    const ck = `${type}|${parentId ?? 0}|${name}`;
    if (cache.has(ck)) return cache.get(ck)!;
    const found = await safe(async () =>
      await env.DB.prepare(
        `SELECT id FROM org_nodes WHERE type=? AND name=? AND ${parentId == null ? 'parent_id IS NULL' : 'parent_id=?'} LIMIT 1`
      ).bind(...(parentId == null ? [type, name] : [type, name, parentId])).first<{ id: number }>(), null as any);
    if (found?.id) { cache.set(ck, found.id); return found.id; }
    const ins = await safe(async () =>
      await env.DB.prepare(
        `INSERT INTO org_nodes (parent_id, type, name, match_key, commission_rate, depth, active, created_at, updated_at)
         VALUES (?,?,?,?,?,?,1,?,?)`
      ).bind(parentId, type, name, matchKey, type === 'hq' ? 0 : DEFAULT_HQ_RATE, depth, now, now).run(), null as any);
    const id = Number(ins?.meta?.last_row_id || 0);
    // path 갱신
    await safe(async () => {
      const parentPath = parentId ? (await env.DB.prepare(`SELECT path FROM org_nodes WHERE id=?`).bind(parentId).first<{ path: string }>())?.path || '/' : '/';
      await env.DB.prepare(`UPDATE org_nodes SET path=? WHERE id=?`).bind(`${parentPath}${id}/`, id).run();
      return true;
    }, false);
    cache.set(ck, id);
    created++;
    return id;
  };

  // 3) 계보 생성: HQ → branch → agency
  for (const row of labels) {
    const hqId = await upsert('hq', row.hq, null, null, 0);
    let parentForAgency = hqId;
    if (row.branch) parentForAgency = await upsert('branch', row.branch, hqId, row.branch, 1);
    if (row.agency) await upsert('agency', row.agency, parentForAgency, row.agency, row.branch ? 2 : 1);
  }

  const total = await safe(async () =>
    Number((await env.DB.prepare(`SELECT COUNT(*) AS c FROM org_nodes`).first<{ c: number }>())?.c || 0), 0);
  return { created, total };
}

// org_nodes 가 비어 있으면 자동 1회 구성 (정산 호출 시 lazy)
async function ensureTree(env: Env): Promise<void> {
  await ensureSchema(env);
  const cnt = await safe(async () =>
    Number((await env.DB.prepare(`SELECT COUNT(*) AS c FROM org_nodes`).first<{ c: number }>())?.c || 0), 0);
  if (cnt === 0) await rebuildTree(env);
}

// ── 핵심: 서브트리(하위 계보) 매출 롤업 — WITH RECURSIVE 그래프 순회 ─────────
/**
 * rootId 의 모든 후손 노드를 재귀로 펼치고, 각 노드(=대리점 leaf)에 귀속된
 * 학생 결제(student_payments)를 해당 월로 집계한다. 상위 노드의 gross 는
 * 후손 합으로 별도 누적한다(아래 buildStatement 에서 처리).
 *
 * 부정확했던 "총매출 ÷ 가맹점 수" 균등분배를 → 학생 단위 정확 귀속으로 대체.
 */
async function subtreeNodeRevenue(env: Env, rootId: number, startMs: number, endMs: number) {
  return await safe(async () => {
    const r = await env.DB.prepare(`
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
      -- (:Agency)-[:MANAGES]->(:Student): shop_name 매칭 + override 보정
      LEFT JOIN students_erp st
             ON s.type = 'agency'
            AND ( st.shop_name = s.match_key
                  OR st.user_id IN (SELECT user_id FROM student_org_override WHERE org_node_id = s.id) )
      -- (:Student)-[:PAID]->(:Payment) : 해당 월 확정 결제만
      LEFT JOIN student_payments p
             ON p.user_id = st.user_id
            AND p.status = 'paid'
            AND p.paid_at >= ? AND p.paid_at < ?
      GROUP BY s.id, s.parent_id, s.type, s.name, s.commission_rate, s.depth
      ORDER BY s.depth, s.id
    `).bind(rootId, startMs, endMs).all<{
      id: number; parent_id: number | null; type: string; name: string;
      commission_rate: number; depth: number; own_gross: number; own_pays: number;
    }>();
    return r.results || [];
  }, [] as any[]);
}

// ── 상위 노드 역추적 — WITH RECURSIVE (자식 → 부모 → … → HQ) ────────────────
async function ancestorChain(env: Env, nodeId: number): Promise<OrgRow[]> {
  return await safe(async () => {
    const r = await env.DB.prepare(`
      WITH RECURSIVE anc(id, parent_id, type, name, match_key, commission_rate, path, depth, active, hop) AS (
        SELECT id, parent_id, type, name, match_key, commission_rate, path, depth, active, 0
          FROM org_nodes WHERE id = ?
        UNION ALL
        SELECT o.id, o.parent_id, o.type, o.name, o.match_key, o.commission_rate, o.path, o.depth, o.active, a.hop + 1
          FROM org_nodes o JOIN anc a ON o.id = a.parent_id
      )
      -- 정산주체(hop=0) → … → 본사 순서. 저장된 depth 컬럼이 아닌 재귀 홉으로 정렬해
      -- depth 가 어긋나도 항상 "주체 먼저, 상위 나중"을 보장(traceback 역할 라벨 정확성).
      SELECT id, parent_id, type, name, match_key, commission_rate, path, depth, active FROM anc ORDER BY hop ASC
    `).bind(nodeId).all<OrgRow>();
    return r.results || [];
  }, [] as OrgRow[]);
}

/**
 * 서브트리 롤업 결과를 트리로 접어 각 노드의 누적 gross(=자기+후손) 를 계산.
 * 각 노드의 본사 수수료 = 누적 gross × commission_rate(상위에 내는 율).
 * 정산액 = 누적 gross - 본사 수수료.
 */
function foldSubtree(
  rows: Array<{ id: number; parent_id: number | null; type: string; name: string; commission_rate: number; depth: number; own_gross: number; own_pays: number }>,
  ov: RateOverrides = emptyOverrides(),
) {
  const byId = new Map<number, any>();
  for (const r of rows) byId.set(r.id, { ...r, gross: r.own_gross, pays: r.own_pays, children: [] as number[] });

  // ① 노드마다 적용할 「본사 마진율」 결정 — 자기 설정 → 상위(지사) 설정 → 기본 60%.
  //    org_nodes.commission_rate 는 rebuild 가 자동으로 채워 넣은 값이라 신뢰하지 않는다.
  for (const node of byId.values()) {
    if (node.type === 'hq') { node.rate_applied = 0; node.rate_source = 'hq'; continue; }
    const own = node.type === 'agency' ? ov.agency.get(String(node.name).trim())
                                       : ov.branch.get(String(node.name).trim());
    if (own != null) { node.rate_applied = own; node.rate_source = 'self'; continue; }
    let p = node.parent_id != null ? byId.get(node.parent_id) : null;   // 상위로 올라가며 지사 설정 상속
    let inherited: number | undefined;
    while (p && inherited == null) {
      if (p.type === 'branch') inherited = ov.branch.get(String(p.name).trim());
      else if (p.type === 'agency') inherited = ov.agency.get(String(p.name).trim());
      p = p.parent_id != null ? byId.get(p.parent_id) : null;
    }
    node.rate_applied = inherited != null ? inherited : DEFAULT_HQ_RATE;
    node.rate_source = inherited != null ? 'inherited' : 'default';
  }

  // ② 자기 매출분 수수료를 먼저 구한 뒤 매출·건수·수수료를 «함께» 부모로 올린다.
  //    지사 아래 대리점마다 요율이 다를 수 있으므로 「지사 총매출 × 지사요율」이 아니라
  //    「대리점별 수수료의 합」이 맞다. (예전 코드는 전자였다)
  for (const node of byId.values()) node.hq_fee = Math.round(node.own_gross * (node.rate_applied || 0));

  const ordered = [...rows].sort((a, b) => b.depth - a.depth);
  for (const r of ordered) {
    const node = byId.get(r.id);
    if (r.parent_id != null && byId.has(r.parent_id)) {
      const parent = byId.get(r.parent_id);
      parent.gross += node.gross;
      parent.pays += node.pays;
      parent.hq_fee += node.hq_fee;
      parent.children.push(r.id);
    }
  }
  for (const node of byId.values()) {
    node.net_settlement = node.gross - node.hq_fee;
    // 화면·원장에 찍히는 요율은 「실제로 떼인 비율」이어야 한다(하위 요율이 섞이면 가중평균이 된다)
    node.commission_rate = node.gross > 0 ? Math.round((node.hq_fee / node.gross) * 10000) / 10000 : node.rate_applied;
  }
  return byId;
}

// ── 정산서 빌더 (단일 노드 기준: 하위집계 + 상위 역추적 체인) ────────────────
async function buildStatement(env: Env, nodeId: number, period: string) {
  const { startMs, endMs, label } = monthRange(period);
  const rows = await subtreeNodeRevenue(env, nodeId, startMs, endMs);
  if (!rows.length) return null;
  const folded = foldSubtree(rows, await loadRateOverrides(env));
  const self = folded.get(nodeId);

  // 직속 자식별 분배 내역
  const children = (self?.children || []).map((cid: number) => {
    const c = folded.get(cid);
    return {
      node_id: c.id, name: c.name, type: c.type,
      gross_revenue: c.gross, commission_rate: c.commission_rate,
      hq_fee: c.hq_fee, net_settlement: c.net_settlement, pay_count: c.pays,
    };
  }).sort((a: any, b: any) => b.gross_revenue - a.gross_revenue);

  // 상위 역추적: 이 노드가 올린 수수료가 어느 상위로 흘러가는지
  const chain = await ancestorChain(env, nodeId);
  const traceback = chain.map((n, i) => ({
    depth: n.depth, node_id: n.id, name: n.name, type: n.type,
    commission_rate: n.commission_rate,
    // 이 노드 기준 누적 gross 가 상위로 갈수록 수수료가 적층됨(체인 설명용)
    role: i === 0 ? '정산주체' : (n.type === 'hq' ? '최종 본사' : '상위 수취'),
  }));

  return {
    node: { id: self.id, name: self.name, type: self.type, commission_rate: self.commission_rate },
    period, label,
    summary: {
      gross_revenue: self.gross,
      hq_fee: self.hq_fee,
      net_settlement: self.net_settlement,
      pay_count: self.pays,
      due_date: nextSettlementDate(period),
    },
    children,     // 하위 계보별 매출/수수료 분배
    traceback,    // 상위 노드 역추적(수수료 귀속 경로)
  };
}

// ── scope.ts 격리: 비-HQ 계정은 자기 노드로 진입점 제한 ─────────────────────
async function scopedRootId(env: Env, scope: Scope, fallbackHqId: number): Promise<number | null> {
  if (scope.type === 'hq' || scope.type === 'none') return fallbackHqId;
  // agency: shop_name=value, branch: franchise=value 로 노드 해석
  if (scope.type === 'agency') {
    const r = await safe(async () => await env.DB.prepare(`SELECT id FROM org_nodes WHERE type='agency' AND (match_key=? OR name=?) LIMIT 1`).bind(scope.value, scope.value).first<{ id: number }>(), null as any);
    return r?.id ?? null;
  }
  if (scope.type === 'branch') {
    const r = await safe(async () => await env.DB.prepare(`SELECT id FROM org_nodes WHERE type='branch' AND (match_key LIKE ? OR name LIKE ?) LIMIT 1`).bind(scope.value + '%', scope.value + '%').first<{ id: number }>(), null as any);
    return r?.id ?? null;
  }
  // franchise(지사본사)는 HQ 트리 전체를 보면 '타 지사 매출'까지 노출되므로 rollup 진입 차단(null).
  //  자기 소유 지사 매출은 /branch-summary 에서 소유 지사로 필터링해 조회(아래 참조).
  return null;
}

async function hqRootId(env: Env): Promise<number> {
  const r = await safe(async () => await env.DB.prepare(`SELECT id FROM org_nodes WHERE type='hq' ORDER BY id LIMIT 1`).first<{ id: number }>(), null as any);
  return r?.id ?? 0;
}

// ════════════════════════════════════════════════════════════════════
// 라우터
// ════════════════════════════════════════════════════════════════════
export async function settlementRouter(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/settlement\/?/, '');
  const fmt = url.searchParams.get('format') || 'json';
  const method = request.method.toUpperCase();

  try {
    await ensureSchema(env);
    const scope = await safe(async () => await getScope(env, request), { type: 'none', value: null, label: '권한 없음' } as Scope);

    // ── POST /rebuild : 라벨에서 그래프 트리 (재)구성 (HQ 전용) ──
    if (p === 'rebuild' && method === 'POST') {
      if (scope.type !== 'hq') return err('forbidden: HQ only', 403);   // 정산 변경은 본사(hq)만 — 교사·내부직원(none) 포함 차단
      const res = await rebuildTree(env);
      return json({ ok: true, ...res });
    }

    await ensureTree(env);

    // ── GET /branch-summary?period= : 지사(franchise)별 정산 직접 집계 ──
    //   그래프 트리의 shop_name 문자열 매칭은 실데이터에서 누락이 커서, 대시보드는
    //   students_erp.franchise ⨝ student_payments 로 지사별 매출을 정확히 직접 집계한다.
    //   수수료율은 org_nodes(type='branch') 값이 있으면 사용, 없으면 기본 0.15.
    if (p === 'branch-summary' && method === 'GET') {
      const period = url.searchParams.get('period') || currentMonth();
      const { startMs, endMs, label } = monthRange(period);
      // 데이터 격리: 지사본사(franchise)·지사(branch)·대리점(agency)은 자기 소유 매출만.
      //  hq/none 은 빈 조건(전체). franchise 는 소유 지사 목록으로 필터되어 '타 지사 매출'이 안 보임.
      const sc = scopeStudentCond(scope, 's');
      const scWhere = sc.cond ? ` AND ${sc.cond}` : '';
      /* 🧮 (2026-08-18) 지사가 아니라 «지사 × 대리점» 단위로 먼저 모은다.
         대리점마다 요율을 따로 정할 수 있게 됐으므로, 지사의 본사수수료는
         「지사 총매출 × 지사요율」이 아니라 「그 지사 소속 대리점별 수수료의 합」이다.
         예전 코드는 org_nodes.commission_rate 를 읽었는데, 그 값은 rebuild 가
         자동으로 채워 넣은 것이라 「사람이 정한 값」이 아니다 — 그래서 안 쓴다. */
      const raw = await safe(async () =>
        (await env.DB.prepare(`
          SELECT COALESCE(NULLIF(TRIM(s.franchise),''), '(미지정 지사)')   AS franchise_name,
                 COALESCE(NULLIF(TRIM(s.shop_name),''), '(미지정 대리점)') AS agency_name,
                 COUNT(*) AS pay_count,
                 COALESCE(SUM(p.amount_krw),0) AS gross_revenue
          FROM student_payments p
          JOIN students_erp s ON s.user_id = p.user_id
          WHERE p.status='paid' AND p.paid_at >= ? AND p.paid_at < ?${scWhere}
          GROUP BY franchise_name, agency_name
          HAVING gross_revenue > 0
        `).bind(startMs, endMs, ...sc.binds).all<any>()).results || [], [] as any[]);

      const ov = await loadRateOverrides(env);
      const byBranch = new Map<string, any>();
      for (const r of raw) {
        const { rate, source } = resolveHqRate(ov, r.franchise_name, r.agency_name);
        const fee = Math.round(r.gross_revenue * rate);
        let b = byBranch.get(r.franchise_name);
        if (!b) {
          b = { franchise_name: r.franchise_name, type: 'branch', gross_revenue: 0, hq_fee: 0, pay_count: 0, agencies: [] as any[] };
          byBranch.set(r.franchise_name, b);
        }
        b.gross_revenue += r.gross_revenue;
        b.hq_fee += fee;
        b.pay_count += r.pay_count;
        b.agencies.push({
          agency_name: r.agency_name, gross_revenue: r.gross_revenue, pay_count: r.pay_count,
          commission_rate: rate, branch_rate: Math.round((1 - rate) * 10000) / 10000,
          rate_source: source, hq_fee: fee, net_settlement: r.gross_revenue - fee,
        });
      }
      const enriched = [...byBranch.values()].map((b: any) => {
        // 지사에 찍히는 요율은 「실제로 떼인 비율」 — 대리점마다 다르면 가중평균이 된다.
        const rate = b.gross_revenue > 0 ? Math.round((b.hq_fee / b.gross_revenue) * 10000) / 10000 : DEFAULT_HQ_RATE;
        const sources = new Set(b.agencies.map((a: any) => a.rate_source));
        b.agencies.sort((x: any, y: any) => y.gross_revenue - x.gross_revenue);
        return {
          franchise_name: b.franchise_name, type: 'branch',
          gross_revenue: b.gross_revenue, commission_rate: rate,
          branch_rate: Math.round((1 - rate) * 10000) / 10000,
          // 'default' 하나뿐이면 기본값 그대로, 섞여 있으면 'mixed'
          rate_source: sources.size === 1 ? [...sources][0] : 'mixed',
          hq_fee: b.hq_fee, net_settlement: b.gross_revenue - b.hq_fee,
          pay_count: b.pay_count, agencies: b.agencies,
          due_date: nextSettlementDate(period), status: 'pending',
        };
      }).sort((a: any, b: any) => b.gross_revenue - a.gross_revenue);

      const totals = enriched.reduce((a: any, r: any) => ({
        gross: a.gross + r.gross_revenue, fee: a.fee + r.hq_fee, net: a.net + r.net_settlement,
      }), { gross: 0, fee: 0, net: 0 });
      const defaults = { hq_rate: DEFAULT_HQ_RATE, branch_rate: DEFAULT_BRANCH_RATE };
      if (fmt === 'csv') {
        return csv(`branch-settlement-${period}.csv`, [
          ['망고아이 지사별 정산 (직접집계)', label],
          [`기본값: 지점 수수료 ${(DEFAULT_BRANCH_RATE * 100).toFixed(0)}% / 본사 마진 ${(DEFAULT_HQ_RATE * 100).toFixed(0)}%`], [],
          ['지사', '대리점', '총매출', '본사마진율', '지점수수료율', '요율출처', '본사수수료', '지점정산액', '건수'],
          ...enriched.flatMap((r: any) => [
            [r.franchise_name, '(지사 합계)', r.gross_revenue, r.commission_rate, r.branch_rate, r.rate_source, r.hq_fee, r.net_settlement, r.pay_count],
            ...r.agencies.map((a: any) => ['', a.agency_name, a.gross_revenue, a.commission_rate, a.branch_rate, a.rate_source, a.hq_fee, a.net_settlement, a.pay_count]),
          ]),
          ['합계', '', totals.gross, '', '', '', totals.fee, totals.net, ''],
        ]);
      }
      return json({ ok: true, type: 'branch-summary', period, label, scope: scope.label, defaults, rows: enriched, totals });
    }

    /* ══ 수수료 «수동 설정» — 요구사항 2·3 (2026-08-18) ══════════════════════
       GET  /rate-config?period=&scope=all|branch|agency&q=   설정 화면용 목록
       POST /rate-config {scope_type, scope_key, branch_rate|hq_rate, note}  저장
       POST /rate-config {scope_type, scope_key, reset:true}                 기본값으로 되돌리기
       비율은 「40」(퍼센트)로 보내도 「0.4」(비율)로 보내도 같게 해석한다. */
    if (p === 'rate-config' && method === 'GET') {
      const period = url.searchParams.get('period') || currentMonth();
      const want = (url.searchParams.get('scope') || 'all').toLowerCase();
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const { startMs, endMs, label } = monthRange(period);
      const sc = scopeStudentCond(scope, 's');
      const scWhere = sc.cond ? ` AND ${sc.cond}` : '';

      // 이번 달 매출을 함께 보여 준다 — 「어디를 먼저 정해야 하는지」 판단 근거.
      const rev = await safe(async () =>
        (await env.DB.prepare(`
          SELECT COALESCE(NULLIF(TRIM(s.franchise),''), '(미지정 지사)')   AS franchise_name,
                 COALESCE(NULLIF(TRIM(s.shop_name),''), '(미지정 대리점)') AS agency_name,
                 COALESCE(SUM(p.amount_krw),0) AS gross_revenue
          FROM student_payments p
          JOIN students_erp s ON s.user_id = p.user_id
          WHERE p.status='paid' AND p.paid_at >= ? AND p.paid_at < ?${scWhere}
          GROUP BY franchise_name, agency_name
        `).bind(startMs, endMs, ...sc.binds).all<any>()).results || [], [] as any[]);

      const ov = await loadRateOverrides(env);
      const branches = new Map<string, { gross: number }>();
      /* ⚠️ 대리점 이름은 «유일하지 않다» — 같은 이름이 두 지사 이상에 걸쳐 있는 경우가
         실제로 있다(CLAUDE.md 「가맹점 정산에서 특정 지사 매출이 통째로 안 잡힘」 항목).
         수동 설정의 열쇠(scope_key)가 이름이므로, 그런 이름에 요율을 정하면 **양쪽 지사의
         같은 이름 대리점에 모두 적용된다.** 숨기지 말고 소속 지사를 모두 보여 준다. */
      const agencies = new Map<string, { gross: number; parents: Set<string> }>();
      for (const r of rev) {
        const b = branches.get(r.franchise_name) || { gross: 0 };
        b.gross += Number(r.gross_revenue) || 0; branches.set(r.franchise_name, b);
        const a = agencies.get(r.agency_name) || { gross: 0, parents: new Set<string>() };
        a.gross += Number(r.gross_revenue) || 0; a.parents.add(r.franchise_name);
        agencies.set(r.agency_name, a);
      }
      // 이번 달 매출이 0이어도 «이미 설정해 둔 곳» 은 목록에 남아야 지우거나 고칠 수 있다.
      for (const k of ov.branch.keys()) if (!branches.has(k)) branches.set(k, { gross: 0 });
      for (const k of ov.agency.keys()) if (!agencies.has(k)) agencies.set(k, { gross: 0, parents: new Set<string>() });

      const mk = (scope_type: 'branch' | 'agency', name: string, gross: number, parents: string[]) => {
        const set = scope_type === 'agency' ? ov.agency.get(name) : ov.branch.get(name);
        // 상속은 소속 지사가 «하나뿐이고» 그 지사에 설정이 있을 때만 확정적으로 말할 수 있다.
        const soleParent = parents.length === 1 ? parents[0] : null;
        const inherited = scope_type === 'agency' && soleParent ? ov.branch.get(soleParent) : undefined;
        const eff = set != null ? set : (inherited != null ? inherited : DEFAULT_HQ_RATE);
        return {
          scope_type, scope_key: name,
          parent: parents.length ? parents.join(' · ') : null,
          parent_count: parents.length,
          is_override: set != null,
          hq_rate: Math.round(eff * 10000) / 10000,
          branch_rate: Math.round((1 - eff) * 10000) / 10000,
          rate_source: set != null ? 'self' : (inherited != null ? 'inherited' : 'default'),
          gross_revenue: gross,
        };
      };
      let rows: any[] = [];
      if (want === 'all' || want === 'branch') rows.push(...[...branches].map(([n, v]) => mk('branch', n, v.gross, [])));
      if (want === 'all' || want === 'agency') rows.push(...[...agencies].map(([n, v]) => mk('agency', n, v.gross, [...v.parents])));
      if (q) rows = rows.filter(r => String(r.scope_key).toLowerCase().includes(q) || String(r.parent || '').toLowerCase().includes(q));
      // 설정해 둔 곳을 맨 위로, 그 다음 매출 큰 순. 「내가 뭘 바꿔 놨더라」를 바로 보이게.
      rows.sort((a, b) => (Number(b.is_override) - Number(a.is_override)) || (b.gross_revenue - a.gross_revenue));

      return json({
        ok: true, type: 'rate-config', period, label, scope: scope.label,
        defaults: { hq_rate: DEFAULT_HQ_RATE, branch_rate: DEFAULT_BRANCH_RATE },
        editable: scope.type === 'hq',
        counts: { total: rows.length, overridden: rows.filter(r => r.is_override).length },
        rows: rows.slice(0, 500),
        truncated: rows.length > 500,
      });
    }

    if (p === 'rate-config' && method === 'POST') {
      if (scope.type !== 'hq') return err('forbidden: HQ only', 403);   // 정산 요율 변경은 본사(hq)만
      const b = await safe(async () => await request.json<any>(), {} as any);
      const scopeType = String(b?.scope_type || '').trim();
      const scopeKey = String(b?.scope_key ?? '').trim();
      if (scopeType !== 'branch' && scopeType !== 'agency') return err("scope_type must be 'branch' or 'agency'");
      if (!scopeKey) return err('scope_key required');
      const who = scope.label || 'admin';

      if (b?.reset === true) {   // 설정 삭제 → 기본값(60%)으로 되돌아간다
        const okDel = await safe(async () => {
          await env.DB.prepare(`DELETE FROM settlement_rate_override WHERE scope_type=? AND scope_key=?`).bind(scopeType, scopeKey).run();
          return true;
        }, false);
        if (!okDel) return err('reset failed', 500);
        return json({ ok: true, reset: true, scope_type: scopeType, scope_key: scopeKey,
                      hq_rate: DEFAULT_HQ_RATE, branch_rate: DEFAULT_BRANCH_RATE });
      }

      // 지점 수수료(branch_rate)나 본사 마진(hq_rate) 중 «온 쪽» 을 받아 본사 마진으로 환산.
      let rate: number | null = null;
      if (b?.hq_rate != null) rate = toRate(b.hq_rate);
      else if (b?.branch_rate != null) { const br = toRate(b.branch_rate); rate = br == null ? null : clampRate(1 - br); }
      if (rate == null) return err('hq_rate or branch_rate required (0~1 비율 또는 0~100 퍼센트)');

      const okUp = await safe(async () => {
        await env.DB.prepare(`
          INSERT INTO settlement_rate_override (scope_type, scope_key, hq_rate, note, updated_at, updated_by)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT(scope_type, scope_key) DO UPDATE SET
            hq_rate=excluded.hq_rate, note=excluded.note, updated_at=excluded.updated_at, updated_by=excluded.updated_by
        `).bind(scopeType, scopeKey, rate, String(b?.note || '').slice(0, 200) || null, Date.now(), who).run();
        return true;
      }, false);
      if (!okUp) return err('save failed', 500);
      return json({ ok: true, scope_type: scopeType, scope_key: scopeKey,
                    hq_rate: Math.round(rate * 10000) / 10000,
                    branch_rate: Math.round((1 - rate) * 10000) / 10000, updated_by: who });
    }

    // ── GET /tree : 조직 그래프 트리 ──
    if (p === 'tree' && method === 'GET') {
      const rows = await safe(async () =>
        (await env.DB.prepare(`SELECT id, parent_id, type, name, match_key, commission_rate, depth, active FROM org_nodes ORDER BY depth, name`).all<OrgRow>()).results || [], [] as OrgRow[]);
      return json({ ok: true, scope: scope.label, count: rows.length, nodes: rows });
    }

    // ── GET /rates : 노드별 수수료율 목록(수동 설정 반영) ──
    if (p === 'rates' && method === 'GET') {
      const nodes = await safe(async () =>
        (await env.DB.prepare(`SELECT id, type, name, commission_rate FROM org_nodes WHERE active=1 ORDER BY depth, name`).all<any>()).results || [], [] as any[]);
      const ov = await loadRateOverrides(env);
      const rows = nodes.map((n: any) => {
        const set = n.type === 'agency' ? ov.agency.get(String(n.name).trim()) : ov.branch.get(String(n.name).trim());
        const eff = n.type === 'hq' ? 0 : (set != null ? set : DEFAULT_HQ_RATE);
        return { id: n.id, type: n.type, name: n.name, commission_rate: eff, is_override: set != null };
      });
      return json({ ok: true, rate_range: [RATE_MIN, RATE_MAX],
                    defaults: { hq_rate: DEFAULT_HQ_RATE, branch_rate: DEFAULT_BRANCH_RATE }, rows });
    }

    // ── POST /rates {node_id, rate} : 수수료율 설정(HQ 전용) ──
    //   ⚠️ org_nodes.commission_rate 만 고치면 정산에 «반영되지 않는다» — 계산은
    //      settlement_rate_override 를 본다. 그래서 두 곳을 함께 쓴다(옛 호출자 호환).
    if (p === 'rates' && method === 'POST') {
      if (scope.type !== 'hq') return err('forbidden: HQ only', 403);   // 정산 변경은 본사(hq)만 — 교사·내부직원(none) 포함 차단
      const b = await safe(async () => await request.json<any>(), {} as any);
      const nodeId = Number(b?.node_id);
      if (!nodeId) return err('node_id required');
      const rate = toRate(b?.rate);
      if (rate == null) return err('rate required (0~1 비율 또는 0~100 퍼센트)');
      const node = await safe(async () =>
        await env.DB.prepare(`SELECT type, name FROM org_nodes WHERE id=?`).bind(nodeId).first<{ type: string; name: string }>(), null as any);
      if (!node) return err('node not found', 404);
      const now = Date.now();
      await safe(async () => { await env.DB.prepare(`UPDATE org_nodes SET commission_rate=?, updated_at=? WHERE id=?`).bind(rate, now, nodeId).run(); return true; }, false);
      if (node.type === 'branch' || node.type === 'agency') {
        await safe(async () => {
          await env.DB.prepare(`
            INSERT INTO settlement_rate_override (scope_type, scope_key, hq_rate, note, updated_at, updated_by)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(scope_type, scope_key) DO UPDATE SET
              hq_rate=excluded.hq_rate, updated_at=excluded.updated_at, updated_by=excluded.updated_by
          `).bind(node.type, String(node.name).trim(), rate, '/rates', now, scope.label || 'admin').run();
          return true;
        }, false);
      }
      return json({ ok: true, node_id: nodeId, commission_rate: rate,
                    branch_rate: Math.round((1 - rate) * 10000) / 10000 });
    }

    // ── GET /node/:id?period= : 특정 지사/대리점 정산서 ──
    const nodeMatch = p.match(/^node\/(\d+)$/);
    if (nodeMatch && method === 'GET') {
      const nodeId = Number(nodeMatch[1]);
      // 격리: 비-HQ 는 자기 서브트리 밖 노드 조회 차단
      if (scope.type !== 'hq' && scope.type !== 'none') {
        const allowedRoot = await scopedRootId(env, scope, await hqRootId(env));
        if (!allowedRoot) return err('forbidden', 403);
        const inScope = await safe(async () => {
          const node = await env.DB.prepare(`SELECT path FROM org_nodes WHERE id=?`).bind(nodeId).first<{ path: string }>();
          const root = await env.DB.prepare(`SELECT path FROM org_nodes WHERE id=?`).bind(allowedRoot).first<{ path: string }>();
          return !!(node?.path && root?.path && node.path.startsWith(root.path));
        }, false);
        if (!inScope) return err('forbidden: out of scope', 403);
      }
      const period = url.searchParams.get('period') || currentMonth();
      const stmt = await buildStatement(env, nodeId, period);
      if (!stmt) return err('node not found or no data', 404);
      if (fmt === 'csv') {
        return csv(`settlement-${stmt.node.name}-${period}.csv`, [
          [`망고아이 정산서 — ${stmt.node.name}`, stmt.label],
          [`수수료율: ${(stmt.node.commission_rate * 100).toFixed(1)}%`, `송금예정일: ${stmt.summary.due_date}`],
          [],
          ['총매출', '본사수수료', '정산액', '결제건수'],
          [stmt.summary.gross_revenue, stmt.summary.hq_fee, stmt.summary.net_settlement, stmt.summary.pay_count],
          [],
          ['하위', '유형', '총매출', '수수료율', '본사수수료', '정산액', '건수'],
          ...stmt.children.map((c: any) => [c.name, c.type, c.gross_revenue, c.commission_rate, c.hq_fee, c.net_settlement, c.pay_count]),
        ]);
      }
      return json({ ok: true, scope: scope.label, ...stmt });
    }

    // ── GET /rollup?period= : 전사 정산(가맹점별 정확 분배) — franchiseReport 대체 ──
    if (p === 'rollup' && method === 'GET') {
      const period = url.searchParams.get('period') || currentMonth();
      const rootId = await scopedRootId(env, scope, await hqRootId(env));
      if (!rootId) return json({ ok: true, period, scope: scope.label, rows: [], totals: { gross: 0, fee: 0, net: 0 } });

      const { startMs, endMs, label } = monthRange(period);
      const all = await subtreeNodeRevenue(env, rootId, startMs, endMs);
      const folded = foldSubtree(all, await loadRateOverrides(env));
      const root = folded.get(rootId);

      // 직속 가맹점(자식) 단위 정산 행
      const rows = (root?.children || []).map((cid: number) => {
        const c = folded.get(cid);
        return {
          node_id: c.id, franchise_name: c.name, type: c.type,
          gross_revenue: c.gross, commission_rate: c.commission_rate,
          hq_fee: c.hq_fee, net_settlement: c.net_settlement,
          pay_count: c.pays, due_date: nextSettlementDate(period), status: 'pending',
        };
      }).sort((a: any, b: any) => b.gross_revenue - a.gross_revenue);

      const totals = rows.reduce((a: any, r: any) => ({
        gross: a.gross + r.gross_revenue, fee: a.fee + r.hq_fee, net: a.net + r.net_settlement,
      }), { gross: 0, fee: 0, net: 0 });

      if (fmt === 'csv') {
        return csv(`settlement-rollup-${period}.csv`, [
          ['망고아이 전사 정산서 (그래프 트리)', label],
          [`기준 노드: ${root?.name || ''}`],
          [],
          ['가맹점', '유형', '총매출', '수수료율', '본사수수료', '정산액', '건수', '송금예정일', '상태'],
          ...rows.map((r: any) => [r.franchise_name, r.type, r.gross_revenue, r.commission_rate, r.hq_fee, r.net_settlement, r.pay_count, r.due_date, r.status]),
          ['합계', '', totals.gross, '', totals.fee, totals.net, '', '', ''],
        ]);
      }
      return json({ ok: true, type: 'rollup', period, label, scope: scope.label, root: root ? { id: root.id, name: root.name, gross: root.gross } : null, rows, totals });
    }

    // ── POST /close?period= : 정산 마감 → 원장 스냅샷(멱등, HQ 전용) ──
    if (p === 'close' && method === 'POST') {
      if (scope.type !== 'hq') return err('forbidden: HQ only', 403);   // 정산 변경은 본사(hq)만 — 교사·내부직원(none) 포함 차단
      const period = url.searchParams.get('period') || currentMonth();
      const { startMs, endMs } = monthRange(period);
      const rootId = await hqRootId(env);
      if (!rootId) return err('org tree empty; run /rebuild first', 409);

      const all = await subtreeNodeRevenue(env, rootId, startMs, endMs);
      const folded = foldSubtree(all, await loadRateOverrides(env));
      const now = Date.now();
      const closedBy = await safe(async () => {
        const s = await getScope(env, request); return s.label || 'admin';
      }, 'admin');

      // D1 batch 로 원자적 멱등 upsert (이중정산 차단: UNIQUE(node_id,period))
      const stmts = [...folded.values()].map((n: any) =>
        env.DB.prepare(`
          INSERT INTO org_settlement_ledger
            (node_id, node_type, node_name, period, gross_revenue, commission_rate, hq_fee, net_settlement, pay_count, status, closed_at, closed_by)
          VALUES (?,?,?,?,?,?,?,?,?, 'closed', ?, ?)
          ON CONFLICT(node_id, period) DO UPDATE SET
            gross_revenue=excluded.gross_revenue, commission_rate=excluded.commission_rate,
            hq_fee=excluded.hq_fee, net_settlement=excluded.net_settlement,
            pay_count=excluded.pay_count, node_name=excluded.node_name,
            node_type=excluded.node_type, status='closed', closed_at=excluded.closed_at, closed_by=excluded.closed_by
        `).bind(n.id, n.type, n.name, period, n.gross, n.commission_rate, n.hq_fee, n.net_settlement, n.pays, now, closedBy)
      );
      const okClose = await safe(async () => { await env.DB.batch(stmts); return true; }, false);
      if (!okClose) return err('settlement close failed (batch)', 500);
      return json({ ok: true, period, closed_nodes: stmts.length, closed_at: now, closed_by: closedBy });
    }

    // ── GET /ledger?period= : 마감된 정산 원장 즉시 조회(빠른 로딩) ──
    if (p === 'ledger' && method === 'GET') {
      const period = url.searchParams.get('period') || currentMonth();
      const rows = await safe(async () =>
        (await env.DB.prepare(`SELECT node_id, node_type, node_name, period, gross_revenue, commission_rate, hq_fee, net_settlement, pay_count, status, closed_at, closed_by FROM org_settlement_ledger WHERE period=? ORDER BY gross_revenue DESC`).bind(period).all()).results || [], [] as any[]);
      return json({ ok: true, period, count: rows.length, rows });
    }

    return err('not found: ' + p, 404);
  } catch (e: any) {
    return err(e?.message || 'internal error', 500);
  }
}
