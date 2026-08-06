// ────────────────────────────────────────────────────────────────────────────
// 🧾 결재 (기안 · 지출 · 문서) — /api/approval/*
//
// 왜 만들었나 (2026-08-05):
//   구 사이트 그룹웨어 5개 메뉴 중 신규 사이트에 **정말로 없던 것은 이것 하나**다.
//     · 휴가·병가   → 이미 있음(캘린더 + 강사 휴무). 신규 쪽이 오히려 더 낫다
//                     (기록만 하는 게 아니라 그 시간 예약을 실제로 막는다)
//     · 관리 메시지 → 이미 5가지(알림톡·웹푸시·공지·귓속말·알림센터)
//     · 즐겨찾기    → Quick access
//     · 기안·지출 / 결재 파일 → **없음** ← 이 파일
//   그래서 그룹웨어를 «모듈째» 옮기지 않았다. 옮기면 이중이 되고 화면만 무거워진다.
//
// 왜 별도 파일인가:
//   api-admin.ts 는 8,400줄이라 공동작업 충돌 반경이 크다(CLAUDE.md 4-2). 건드리지 않는다.
//
// 설계 판단:
//   · 표 모양은 이미 운영 중인 schedule_change_requests(연기·변경 요청)를 그대로 따랐다.
//     «올린다 → 대기 → 승인/반려 + 누가 언제 무슨 메모로» 는 검증된 형태다.
//     다만 컬럼(schedule_id·orig_date…)이 수업 전용이라 표는 새로 판다. 재사용은 «모양»만.
//   · 첨부는 textbook-files 와 같은 방식(R2 put + D1 행 + /raw 로 서빙). 새 버킷 안 만든다.
//   · 화면은 admin.html(1MB)이 아니라 **/teacher(27KB)** 에 붙는다. 무거워지지 않게.
//
// 권한:
//   · 올리기  = 본사 계정(hq/staff) 누구나.
//   · 승인    = 본사 계정 중 **필리핀 매니저가 아닌 사람**, 그리고 **본인 요청이 아닐 것**.
//     (필리핀 매니저가 올리고 한국 본사가 결재하는 실제 흐름 그대로.
//      더 좁히려면 canApprove() 한 곳만 고치면 된다.)
//   · 강사는 접근 불가 — 회사 지출 내역이 담긴다.
// ────────────────────────────────────────────────────────────────────────────

import { getAdminActor, PH_MANAGERS } from './auth-admin';

interface ApprovalEnv {
  DB: D1Database;
  RECORDINGS?: R2Bucket;
  [k: string]: any;
}

const json = (data: any, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const REQ_TYPES = ['expense', 'doc', 'leave'];
const MAX_FILE = 10 * 1024 * 1024;                                  // 10MB — 결재 첨부는 영수증·문서 한 장
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

let tableReady = false;
async function ensureTable(env: ApprovalEnv) {
  if (tableReady) return;
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS approval_requests (` +
    `id INTEGER PRIMARY KEY AUTOINCREMENT, ` +
    `req_type TEXT NOT NULL DEFAULT 'expense', ` +
    `requester_username TEXT NOT NULL, requester_name TEXT, ` +
    `title TEXT NOT NULL, body TEXT, category TEXT, ` +
    `amount REAL, currency TEXT DEFAULT 'PHP', spent_at TEXT, ` +
    `file_key TEXT, file_name TEXT, file_ext TEXT, file_size INTEGER, ` +
    `status TEXT NOT NULL DEFAULT 'pending', ` +
    `decided_by TEXT, decided_at INTEGER, decide_memo TEXT, ` +
    `created_at INTEGER NOT NULL)`
  );
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_appr_status ON approval_requests(status, created_at)`); } catch { /* 있으면 그만 */ }
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_appr_user ON approval_requests(requester_username, created_at)`); } catch { /* 있으면 그만 */ }
  tableReady = true;
}

/** 본사 계정인가 — 올리기의 최소 조건. 강사·외부 조직은 여기서 걸러진다. */
function isHqStaff(actor: any): boolean {
  return !!actor?.ok && !actor.isTeacher && (actor.role === 'hq' || actor.role === 'staff');
}

/**
 * 승인할 수 있는가.
 *   ① 본사 계정이고 ② 필리핀 매니저가 아니고 ③ 본인이 올린 건이 아닐 것.
 *   ③ 이 핵심이다 — 자기 지출을 자기가 승인하면 결재가 아니다.
 */
function canApprove(actor: any, requesterUsername?: string | null): boolean {
  if (!isHqStaff(actor)) return false;
  if (PH_MANAGERS.indexOf(String(actor.username || '').toLowerCase()) >= 0) return false;
  if (requesterUsername && String(requesterUsername) === String(actor.username)) return false;
  return true;
}

/** 목록 한 줄 — 첨부의 R2 키는 절대 내보내지 않는다(내려받기는 전용 엔드포인트로만). */
function row(r: any) {
  return {
    id: r.id, req_type: r.req_type, title: r.title, body: r.body, category: r.category,
    amount: r.amount, currency: r.currency, spent_at: r.spent_at,
    requester_username: r.requester_username, requester_name: r.requester_name,
    has_file: !!r.file_key, file_name: r.file_name, file_size: r.file_size,
    status: r.status, decided_by: r.decided_by, decided_at: r.decided_at,
    decide_memo: r.decide_memo, created_at: r.created_at,
  };
}

export async function handleApprovalApi(
  request: Request, url: URL, env: ApprovalEnv
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith('/api/approval/')) return null;
  const method = request.method;

  const actor: any = await getAdminActor(request, env as any);
  if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
  if (!isHqStaff(actor)) {
    return json({
      ok: false, error: 'forbidden',
      message: '본사 계정만 사용할 수 있습니다.',
      message_en: 'Head-office accounts only.',
    }, 403);
  }
  await ensureTable(env);

  // ── 올리기 (기안) ─────────────────────────────────────────────────────────
  //   multipart/form-data. 첨부는 없어도 된다(영수증 없는 기안이 실제로 더 많다).
  if (method === 'POST' && path === '/api/approval/requests') {
    try {
      const form = await request.formData();
      const reqType = String(form.get('req_type') || 'expense');
      if (REQ_TYPES.indexOf(reqType) < 0) return json({ ok: false, error: 'bad_req_type', allowed: REQ_TYPES }, 400);

      const title = String(form.get('title') || '').trim().slice(0, 200);
      if (!title) return json({ ok: false, error: 'title_required' }, 400);

      const body = String(form.get('body') || '').trim().slice(0, 4000);
      const category = String(form.get('category') || '').trim().slice(0, 60) || null;
      const spentAt = String(form.get('spent_at') || '').trim().slice(0, 10) || null;
      const currency = (String(form.get('currency') || 'PHP').toUpperCase() === 'KRW') ? 'KRW' : 'PHP';

      // 금액: 지출 기안일 때만 의미가 있다. 숫자가 아니면 **0 으로 때우지 않고 거절**한다 —
      //   금액이 0 으로 들어간 지출 결재는 승인자가 눈치채기 어렵다.
      let amount: number | null = null;
      const rawAmount = String(form.get('amount') || '').replace(/[,\s]/g, '');
      if (rawAmount) {
        const n = Number(rawAmount);
        if (!isFinite(n) || n < 0) return json({ ok: false, error: 'bad_amount' }, 400);
        amount = n;
      }
      if (reqType === 'expense' && amount == null) return json({ ok: false, error: 'amount_required' }, 400);

      let fileKey: string | null = null, fileName: string | null = null;
      let fileExt: string | null = null, fileSize: number | null = null;
      const file = form.get('file') as File | null;
      if (file && file.size > 0) {
        if (file.size > MAX_FILE) return json({ ok: false, error: 'file_too_large', max: MAX_FILE }, 413);
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (ALLOWED_EXT.indexOf(ext) < 0) return json({ ok: false, error: 'invalid_type', allowed: ALLOWED_EXT }, 400);
        const r2 = env.RECORDINGS;
        if (!r2) return json({ ok: false, error: 'r2_not_configured' }, 500);
        const key = `approval/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await r2.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg') },
        });
        fileKey = key; fileName = String(file.name || '').slice(0, 200); fileExt = ext; fileSize = file.size;
      }

      const ins = await env.DB.prepare(
        `INSERT INTO approval_requests
           (req_type, requester_username, requester_name, title, body, category,
            amount, currency, spent_at, file_key, file_name, file_ext, file_size,
            status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).bind(reqType, actor.username, actor.name || null, title, body || null, category,
             amount, currency, spentAt, fileKey, fileName, fileExt, fileSize, Date.now()).run();

      return json({ ok: true, id: ins.meta.last_row_id });
    } catch (e: any) {
      return json({ ok: false, error: 'submit_failed', detail: String(e?.message || e) }, 500);
    }
  }

  // ── 목록 ──────────────────────────────────────────────────────────────────
  //   scope=mine   내가 올린 것 (누구나)
  //   scope=pending 결재 대기 (승인 권한자만)
  //   scope=all    전체 (승인 권한자만)
  if (method === 'GET' && path === '/api/approval/requests') {
    const scope = url.searchParams.get('scope') || 'mine';
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const approver = canApprove(actor, null);

    if ((scope === 'pending' || scope === 'all') && !approver) {
      return json({ ok: false, error: 'forbidden_scope' }, 403);
    }
    let sql: string, binds: any[];
    if (scope === 'mine') {
      sql = `SELECT * FROM approval_requests WHERE requester_username = ? ORDER BY created_at DESC LIMIT ?`;
      binds = [actor.username, limit];
    } else if (scope === 'pending') {
      // 본인 요청은 결재함에서 뺀다 — 눌러도 거절될 버튼을 보여줄 이유가 없다.
      sql = `SELECT * FROM approval_requests WHERE status = 'pending' AND requester_username != ?
              ORDER BY created_at ASC LIMIT ?`;
      binds = [actor.username, limit];
    } else {
      sql = `SELECT * FROM approval_requests ORDER BY (status='pending') DESC, created_at DESC LIMIT ?`;
      binds = [limit];
    }
    const rs = await env.DB.prepare(sql).bind(...binds).all<any>().catch(() => ({ results: [] as any[] }));

    // 결재함 배지용 대기 건수 — 승인 권한자에게만.
    let pending = 0;
    if (approver) {
      const c: any = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM approval_requests WHERE status='pending' AND requester_username != ?`
      ).bind(actor.username).first().catch(() => null);
      pending = Number(c?.c || 0);
    }
    return json({ ok: true, can_approve: approver, pending, items: (rs.results || []).map(row) });
  }

  // ── 승인 / 반려 ───────────────────────────────────────────────────────────
  const mDecide = path.match(/^\/api\/approval\/requests\/(\d+)\/decide$/);
  if (method === 'POST' && mDecide) {
    const id = Number(mDecide[1]);
    const cur: any = await env.DB.prepare(`SELECT * FROM approval_requests WHERE id = ? LIMIT 1`)
      .bind(id).first().catch(() => null);
    if (!cur) return json({ ok: false, error: 'not_found' }, 404);
    if (!canApprove(actor, cur.requester_username)) {
      return json({
        ok: false, error: 'forbidden',
        message: '본인이 올린 결재는 본인이 승인할 수 없습니다.',
        message_en: 'You cannot approve your own request.',
      }, 403);
    }
    // 이미 결재된 건을 덮어쓰지 않는다 — 두 사람이 동시에 눌렀을 때 나중 것이 먼저 것을 지운다.
    if (cur.status !== 'pending') {
      return json({ ok: false, error: 'already_decided', status: cur.status, decided_by: cur.decided_by }, 409);
    }
    let payload: any = {};
    try { payload = await request.json(); } catch { /* 빈 본문 허용 */ }
    const decision = String(payload?.decision || '');
    if (decision !== 'approved' && decision !== 'rejected') return json({ ok: false, error: 'bad_decision' }, 400);
    const memo = String(payload?.memo || '').slice(0, 1000) || null;

    // 조건부 UPDATE — status='pending' 일 때만 바뀐다(동시 클릭 방어를 DB 에서 한 번 더).
    const up = await env.DB.prepare(
      `UPDATE approval_requests SET status = ?, decided_by = ?, decided_at = ?, decide_memo = ?
        WHERE id = ? AND status = 'pending'`
    ).bind(decision, actor.username, Date.now(), memo, id).run();
    if (!up.meta.changes) return json({ ok: false, error: 'already_decided' }, 409);
    return json({ ok: true, id, status: decision });
  }

  // ── 첨부 내려받기 ─────────────────────────────────────────────────────────
  //   본인 요청이거나 승인 권한자만. 영수증에는 계좌·금액이 찍혀 있다.
  const mFile = path.match(/^\/api\/approval\/requests\/(\d+)\/file$/);
  if (method === 'GET' && mFile) {
    const id = Number(mFile[1]);
    const r: any = await env.DB.prepare(`SELECT * FROM approval_requests WHERE id = ? LIMIT 1`)
      .bind(id).first().catch(() => null);
    if (!r || !r.file_key) return json({ ok: false, error: 'not_found' }, 404);
    const mine = String(r.requester_username) === String(actor.username);
    if (!mine && !canApprove(actor, r.requester_username)) return json({ ok: false, error: 'forbidden' }, 403);
    const r2 = env.RECORDINGS;
    if (!r2) return json({ ok: false, error: 'r2_not_configured' }, 500);
    const obj = await r2.get(r.file_key);
    if (!obj) return json({ ok: false, error: 'file_gone' }, 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        // 파일명에 한글·공백이 들어가므로 filename* 로 준다. 인라인이 아니라 내려받기.
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(r.file_name || 'file')}`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  return json({ ok: false, error: 'not_found' }, 404);
}
