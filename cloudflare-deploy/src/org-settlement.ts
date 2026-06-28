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
 *   commission_rate: 각 노드가 상위(부모)에게 내는 본사 수수료율 0.15~0.18
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
 *   POST /rates  {node_id, rate}       수수료율 설정(0.15~0.18)
 *   POST /close?period=YYYY-MM         정산 마감 → 원장 스냅샷(멱등, 데이터 신뢰성)
 *   POST /rebuild                      students_erp 라벨에서 그래프 트리 자동 구성
 *   format=csv 지원(GET 계열).  scope.ts 로 대리점/지사 데이터 격리 적용.
 */

import { getScope, type Scope } from './scope';

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

const RATE_MIN = 0.15, RATE_MAX = 0.18;
const clampRate = (r: number) => Math.min(RATE_MAX, Math.max(RATE_MIN, Number(r) || RATE_MIN));

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
  const labels = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT
        COALESCE(NULLIF(TRIM(hq_name),''), '망고아이본사') AS hq,
        NULLIF(TRIM(franchise),'')                        AS branch,
        NULLIF(TRIM(shop_name),'')                        AS agency
      FROM students_erp
      GROUP BY hq, branch, agency
    `).all<{ hq: string; branch: string | null; agency: string | null }>();
    return r.results || [];
  }, [] as Array<{ hq: string; branch: string | null; agency: string | null }>);

  // 2) 노드 upsert 헬퍼 (이름+타입+부모로 유일성 판단, rate 는 신규시 0.15)
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
      ).bind(parentId, type, name, matchKey, type === 'hq' ? 0 : RATE_MIN, depth, now, now).run(), null as any);
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
      WITH RECURSIVE anc(id, parent_id, type, name, match_key, commission_rate, path, depth, active) AS (
        SELECT id, parent_id, type, name, match_key, commission_rate, path, depth, active
          FROM org_nodes WHERE id = ?
        UNION ALL
        SELECT o.id, o.parent_id, o.type, o.name, o.match_key, o.commission_rate, o.path, o.depth, o.active
          FROM org_nodes o JOIN anc a ON o.id = a.parent_id
      )
      SELECT * FROM anc ORDER BY depth ASC
    `).bind(nodeId).all<OrgRow>();
    return r.results || [];
  }, [] as OrgRow[]);
}

/**
 * 서브트리 롤업 결과를 트리로 접어 각 노드의 누적 gross(=자기+후손) 를 계산.
 * 각 노드의 본사 수수료 = 누적 gross × commission_rate(상위에 내는 율).
 * 정산액 = 누적 gross - 본사 수수료.
 */
function foldSubtree(rows: Array<{ id: number; parent_id: number | null; type: string; name: string; commission_rate: number; depth: number; own_gross: number; own_pays: number }>) {
  const byId = new Map<number, any>();
  for (const r of rows) byId.set(r.id, { ...r, gross: r.own_gross, pays: r.own_pays, children: [] as number[] });
  // 자식 누적을 부모로 합산 (깊은 노드부터)
  const ordered = [...rows].sort((a, b) => b.depth - a.depth);
  for (const r of ordered) {
    const node = byId.get(r.id);
    if (r.parent_id != null && byId.has(r.parent_id)) {
      const parent = byId.get(r.parent_id);
      parent.gross += node.gross;
      parent.pays += node.pays;
      parent.children.push(r.id);
    }
  }
  for (const node of byId.values()) {
    node.hq_fee = Math.round(node.gross * (node.commission_rate || 0));
    node.net_settlement = node.gross - node.hq_fee;
  }
  return byId;
}

// ── 정산서 빌더 (단일 노드 기준: 하위집계 + 상위 역추적 체인) ────────────────
async function buildStatement(env: Env, nodeId: number, period: string) {
  const { startMs, endMs, label } = monthRange(period);
  const rows = await subtreeNodeRevenue(env, nodeId, startMs, endMs);
  if (!rows.length) return null;
  const folded = foldSubtree(rows);
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
  return fallbackHqId; // franchise(지사본사) 등은 HQ 진입 후 합산(추후 세분화 가능)
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
    const scope = await safe(async () => await getScope(env, request), { type: 'hq', value: null, label: '본사 (전체)' } as Scope);

    // ── POST /rebuild : 라벨에서 그래프 트리 (재)구성 (HQ 전용) ──
    if (p === 'rebuild' && method === 'POST') {
      if (scope.type !== 'hq' && scope.type !== 'none') return err('forbidden: HQ only', 403);
      const res = await rebuildTree(env);
      return json({ ok: true, ...res });
    }

    await ensureTree(env);

    // ── GET /tree : 조직 그래프 트리 ──
    if (p === 'tree' && method === 'GET') {
      const rows = await safe(async () =>
        (await env.DB.prepare(`SELECT id, parent_id, type, name, match_key, commission_rate, depth, active FROM org_nodes ORDER BY depth, name`).all<OrgRow>()).results || [], [] as OrgRow[]);
      return json({ ok: true, scope: scope.label, count: rows.length, nodes: rows });
    }

    // ── GET /rates : 수수료율 목록 ──
    if (p === 'rates' && method === 'GET') {
      const rows = await safe(async () =>
        (await env.DB.prepare(`SELECT id, type, name, commission_rate FROM org_nodes WHERE active=1 ORDER BY depth, name`).all()).results || [], [] as any[]);
      return json({ ok: true, rate_range: [RATE_MIN, RATE_MAX], rows });
    }

    // ── POST /rates {node_id, rate} : 수수료율 설정(0.15~0.18, HQ 전용) ──
    if (p === 'rates' && method === 'POST') {
      if (scope.type !== 'hq' && scope.type !== 'none') return err('forbidden: HQ only', 403);
      const b = await safe(async () => await request.json<any>(), {} as any);
      const nodeId = Number(b?.node_id);
      if (!nodeId) return err('node_id required');
      const rate = clampRate(Number(b?.rate));
      await safe(async () => { await env.DB.prepare(`UPDATE org_nodes SET commission_rate=?, updated_at=? WHERE id=?`).bind(rate, Date.now(), nodeId).run(); return true; }, false);
      return json({ ok: true, node_id: nodeId, commission_rate: rate });
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
      const folded = foldSubtree(all);
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
      if (scope.type !== 'hq' && scope.type !== 'none') return err('forbidden: HQ only', 403);
      const period = url.searchParams.get('period') || currentMonth();
      const { startMs, endMs } = monthRange(period);
      const rootId = await hqRootId(env);
      if (!rootId) return err('org tree empty; run /rebuild first', 409);

      const all = await subtreeNodeRevenue(env, rootId, startMs, endMs);
      const folded = foldSubtree(all);
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
