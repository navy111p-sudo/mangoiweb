/**
 * auth-admin.ts — Phase 11 관리자 세션·로그인 시스템
 *
 *  목적
 *    - 기존 Basic Auth 팝업을 정식 로그인 폼 + HttpOnly 세션 쿠키로 교체
 *    - 비밀번호 SHA-256 + 16바이트 salt 해싱
 *    - 로그인 이력 / 세션 목록 / 비번 변경 / 프로필 편집을 마이페이지에 노출
 *
 *  D1 테이블 (자동 생성, IF NOT EXISTS)
 *    1) admin_account         — 관리자 계정 (현재는 단일 admin)
 *    2) admin_sessions        — 활성 세션 토큰
 *    3) admin_login_history   — 로그인 시도 이력 (성공·실패 둘 다)
 *
 *  최초 부트스트랩
 *    - admin_account 가 비어 있으면 env.ADMIN_PASSWORD 시크릿으로 admin 계정을 자동 생성.
 *    - 즉, 기존 운영자는 변경 없이 그대로 로그인 가능 (이후 마이페이지에서 비번 변경 권장).
 */

import { getScope } from './scope';

export interface AuthEnv {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
}

// 로그인 계정의 scope(쿠키세션 기준)를 마이페이지용 역할/표시라벨로 환산.
//   scope.type: hq | franchise | branch | agency | none
//   none 은 교사(hq_t_* · 이름에 교사/강사/선생)와 일반 직원으로 세분.
function resolveRole(scopeType: string, username: string, name: string): { role: string; roleLabel: string } {
  const u = String(username || '');
  const nm = String(name || '');
  // ⚠️ 강사 계정 아이디 컨벤션(hq_t_*)은 조직 스코프(hq/branch/agency/franchise)와 무관하게
  //   항상 강사로 인식해야 한다. 기존엔 스코프를 먼저 체크해서, scope_type='hq'로 세팅된
  //   강사 계정이 있으면 강사 판정이 아예 실행되지 않아 마이페이지 "내 평가" 탭이 영원히
  //   숨겨지는 버그가 있었다 (2026-07-04 발견). 아이디 컨벤션은 스코프보다 먼저 확인.
  if (/^hq_t/i.test(u)) return { role: 'teacher', roleLabel: '교사' };
  // ⚠️ 이름 기반 강사 판정을 스코프 체크보다 먼저 한다(2026-07-05 추가).
  //   버그: 강사 계정 'jeong'(이름 '정우영(교사)')이 admin_scope.scope_type='hq'로 세팅돼 있어,
  //   아래 scopeType==='hq' 분기에서 '본사·경영진'으로 잘못 판정 → 마이페이지가 교사가 아닌
  //   관리자로 표시되고 '내 평가' 탭이 숨겨졌다. hq_t_* 접두사가 없는 강사 계정도 이름으로 구제.
  //   조직 계정(지사/대리점/프랜차이즈)은 이름에 '교사'가 들어가도 강사로 오인하지 않도록,
  //   내부 계정(scope hq · none)에 한해서만 이름 기반 강사 판정을 적용한다.
  if ((scopeType === 'hq' || scopeType === 'none') && /교사|강사|선생|teacher/i.test(nm)) {
    return { role: 'teacher', roleLabel: '교사' };
  }
  if (scopeType === 'franchise') return { role: 'franchise', roleLabel: '프랜차이즈 본사' };
  if (scopeType === 'branch')    return { role: 'branch',    roleLabel: '지사' };
  if (scopeType === 'agency')    return { role: 'agency',    roleLabel: '대리점' };
  if (scopeType === 'hq')        return { role: 'hq',        roleLabel: '본사 · 경영진' };
  // 스코프가 조직형이 아닐 때(scope_type='none' 등)만 이름으로 강사 여부 보조 판정.
  if (/교사|강사|선생|teacher/i.test(nm)) return { role: 'teacher', roleLabel: '교사' };
  return { role: 'staff', roleLabel: nm || '직원' };
}

const json = (data: any, status = 200, extraHeaders: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });

const SESSION_COOKIE = 'mango_admin_session';
const SESSION_DEFAULT_MS = 7 * 24 * 3600 * 1000;       // 7일
const SESSION_REMEMBER_MS = 30 * 24 * 3600 * 1000;     // 30일

// ────────────────────────────────────────────────────────────
// 🔐 비밀번호 해싱 (SHA-256 + 16 byte salt)
// ────────────────────────────────────────────────────────────
function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex || bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const data = new TextEncoder().encode(salt + ':' + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return `${salt}$${bytesToHex(digest)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split('$');
  if (!salt || !expected) return false;
  const computed = await hashPassword(password, salt);
  return computed === stored;
}

function randomToken(bytes = 32): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ────────────────────────────────────────────────────────────
// 🍪 쿠키 헬퍼
// ────────────────────────────────────────────────────────────
export function parseCookies(request: Request): Map<string, string> {
  const out = new Map<string, string>();
  const raw = request.headers.get('Cookie') || '';
  raw.split(';').forEach(p => {
    const [k, ...rest] = p.trim().split('=');
    if (k) out.set(k, decodeURIComponent(rest.join('=') || ''));
  });
  return out;
}

function setSessionCookieHeader(token: string, maxAgeSec: number): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
}
function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=deleted; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// ────────────────────────────────────────────────────────────
// 🗄️ 스키마 보장 + 부트스트랩
// ────────────────────────────────────────────────────────────
let _schemaReady = false;
export async function ensureAuthSchema(env: AuthEnv): Promise<void> {
  if (_schemaReady) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS admin_account (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       username TEXT NOT NULL UNIQUE,
       password_hash TEXT NOT NULL,
       name TEXT,
       email TEXT,
       phone TEXT,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (
       token TEXT PRIMARY KEY,
       username TEXT NOT NULL,
       ip TEXT,
       user_agent TEXT,
       created_at INTEGER NOT NULL,
       expires_at INTEGER NOT NULL,
       last_seen_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_admin_sessions_username ON admin_sessions(username)`,
    `CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at)`,
    `CREATE TABLE IF NOT EXISTS admin_login_history (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       username TEXT NOT NULL,
       ip TEXT,
       user_agent TEXT,
       success INTEGER NOT NULL DEFAULT 0,
       reason TEXT,
       login_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_admin_login_history_user ON admin_login_history(username, login_at)`,
  ];
  for (const sql of stmts) {
    try { await env.DB.prepare(sql).run(); }
    catch (e) { console.warn('[auth-admin] ensureAuthSchema:', (e as any)?.message); }
  }

  // 최초 부트스트랩 — admin 계정 없으면 env.ADMIN_PASSWORD 로 생성
  try {
    const row = await env.DB.prepare(
      `SELECT id FROM admin_account WHERE username = 'admin' LIMIT 1`
    ).first();
    if (!row) {
      const seedPw = (env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 4)
        ? env.ADMIN_PASSWORD : 'mango1234';   // 최후 fallback (배포 직후 변경 권장)
      const hash = await hashPassword(seedPw);
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO admin_account (username, password_hash, name, email, phone, created_at, updated_at)
         VALUES ('admin', ?, '관리자', NULL, NULL, ?, ?)`
      ).bind(hash, now, now).run();
      console.warn('[auth-admin] bootstrap: admin account created (password from env.ADMIN_PASSWORD)');
    }
  } catch (e) {
    console.warn('[auth-admin] bootstrap failed:', (e as any)?.message);
  }

  // fix (2026-06-01) — 로그인 화면에 안내된 '시연용 데모 계정' 들을 실제로 생성(없을 때만).
  //   이게 없어서 hq_t_001/teacher 등 데모 로그인이 invalid_credentials 로 막혔음.
  try {
    const demoAccounts: Array<[string, string, string]> = [
      ['admin', 'admin', '본사·경영진'],
      ['cfo', 'cfo', '본사·재무(CFO)'],
      ['ops_lead', 'ops', '본사·관리자'],
      ['branch_busan', 'busan', '부산 지사'],
      ['branch_daegu', 'daegu', '대구 지사'],
      ['agency_gn001', 'gn001', '강남 대리점'],
      ['agency_sc002', 'sc002', '서초 대리점'],
      ['hq_t_001', 'teacher', '교사'],
      ['capitown', 'capi2026!', '캐피타운 본사'],   // 프랜차이즈 본사 정산 전용 계정
    ];
    const nowD = Date.now();
    for (const acc of demoAccounts) {
      const u = acc[0], pw = acc[1], nm = acc[2];
      const ex = await env.DB.prepare(`SELECT id FROM admin_account WHERE username = ? LIMIT 1`).bind(u).first();
      const h = await hashPassword(pw);
      if (!ex) {
        await env.DB.prepare(
          `INSERT INTO admin_account (username, password_hash, name, email, phone, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)`
        ).bind(u, h, nm, nowD, nowD).run();
        console.warn('[auth-admin] demo account seeded:', u);
      } else if (u !== 'capitown') {
        // 데모 계정 비번을 항상 안내값과 일치시킨다(재발 방지). 비데모 계정(jeong 등)은 건드리지 않음.
        // 단, 'capitown'(본사 실계정)은 최초 1회만 생성하고 이후 사용자가 바꾼 비번을 유지한다.
        await env.DB.prepare(`UPDATE admin_account SET password_hash = ? WHERE username = ?`).bind(h, u).run();
      }
    }
  } catch (e) {
    console.warn('[auth-admin] demo seed failed:', (e as any)?.message);
  }

  _schemaReady = true;
}

// ────────────────────────────────────────────────────────────
// 🪪 세션 조회 (index.ts 미들웨어가 호출)
// ────────────────────────────────────────────────────────────
export interface SessionInfo {
  ok: boolean;
  username?: string;
  token?: string;
  expiresAt?: number;
}

export async function checkAdminSession(request: Request, env: AuthEnv): Promise<SessionInfo> {
  const cookies = parseCookies(request);
  const token = cookies.get(SESSION_COOKIE);
  if (!token) return { ok: false };
  try {
    await ensureAuthSchema(env);
    const row = await env.DB.prepare(
      `SELECT username, expires_at FROM admin_sessions WHERE token = ? LIMIT 1`
    ).bind(token).first<{ username: string; expires_at: number }>();
    if (!row) return { ok: false };
    if (row.expires_at < Date.now()) return { ok: false };
    // 마지막 활동 시각 갱신 (실패해도 무시)
    env.DB.prepare(
      `UPDATE admin_sessions SET last_seen_at = ? WHERE token = ?`
    ).bind(Date.now(), token).run().catch(() => {});
    return { ok: true, username: row.username, token, expiresAt: row.expires_at };
  } catch (e) {
    console.warn('[auth-admin] checkAdminSession err:', (e as any)?.message);
    return { ok: false };
  }
}

// ────────────────────────────────────────────────────────────
// 🚪 8개 엔드포인트 디스패처
// ────────────────────────────────────────────────────────────
export async function handleAdminAuthApi(
  request: Request,
  url: URL,
  env: AuthEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  try {
    await ensureAuthSchema(env);

    // ── 로그인 ──
    if (path === '/api/admin/login' && method === 'POST') {
      let body: any;
      try { body = await request.json(); } catch { body = null; }
      const username = String(body?.username || '').trim();
      const password = String(body?.password || '');
      const remember = !!body?.remember;
      const ip = request.headers.get('cf-connecting-ip') || '';
      const ua = request.headers.get('user-agent') || '';

      if (!username || !password) {
        return json({ ok: false, error: 'missing_credentials' }, 400);
      }
      const row = await env.DB.prepare(
        `SELECT username, password_hash FROM admin_account WHERE username = ? LIMIT 1`
      ).bind(username).first<{ username: string; password_hash: string }>();

      if (!row) {
        await recordLogin(env, username, ip, ua, false, 'unknown_user');
        return json({ ok: false, error: 'invalid_credentials' }, 401);
      }
      const passOk = await verifyPassword(password, row.password_hash);
      if (!passOk) {
        await recordLogin(env, username, ip, ua, false, 'wrong_password');
        return json({ ok: false, error: 'invalid_credentials' }, 401);
      }

      const now = Date.now();
      const ttl = remember ? SESSION_REMEMBER_MS : SESSION_DEFAULT_MS;
      const token = randomToken(32);
      await env.DB.prepare(
        `INSERT INTO admin_sessions (token, username, ip, user_agent, created_at, expires_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(token, username, ip, ua, now, now + ttl, now).run();
      await recordLogin(env, username, ip, ua, true, null);

      // 🪪 로그인 성공 시 서버가 권위 있는 역할을 판정해 응답에 실어 보낸다(2026-07-05).
      //   기존엔 login.html 이 아이디 접두사(hq_t_*)만으로 역할을 '추측'해서, 접두사가 없는
      //   강사 계정(예: 'jeong')이 관리자로 잘못 표시됐다. 여기서 이름+스코프 기반으로 정확히
      //   판정하고, 클라이언트가 쓰기 쉬운 role(hq_teacher 등)로 변환해 내려준다.
      let acctName = '';
      let scopeType = 'none';
      try {
        const acc = await env.DB.prepare(`SELECT name FROM admin_account WHERE username = ? LIMIT 1`).bind(username).first<{ name: string }>();
        acctName = acc?.name || '';
        const sc = await env.DB.prepare(`SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`).bind(username).first<{ scope_type: string }>();
        if (sc?.scope_type) scopeType = sc.scope_type;
      } catch (e) { console.warn('[auth-admin] login role resolve:', (e as any)?.message); }
      const rr = resolveRole(scopeType, username, acctName);
      const isTeacher = rr.role === 'teacher';

      return json(
        {
          ok: true, username, expires_at: now + ttl, redirect: '/admin.html',
          name: acctName || username,
          server_role: rr.role, role_label: rr.roleLabel, is_teacher: isTeacher,
        },
        200,
        { 'Set-Cookie': setSessionCookieHeader(token, Math.floor(ttl / 1000)) }
      );
    }

    // ── 로그아웃 (인증 없이도 항상 200 — 쿠키만 지움) ──
    if (path === '/api/admin/logout' && method === 'POST') {
      const cookies = parseCookies(request);
      const token = cookies.get(SESSION_COOKIE);
      if (token) {
        await env.DB.prepare(`DELETE FROM admin_sessions WHERE token = ?`).bind(token).run().catch(() => {});
      }
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookieHeader() });
    }

    // ── 아래는 모두 인증된 세션이 있어야 함 (index.ts 미들웨어가 이미 검증) ──
    const sess = await checkAdminSession(request, env);
    if (!sess.ok || !sess.username) {
      return json({ ok: false, error: 'auth_required' }, 401);
    }
    const me = sess.username;

    // ── 현재 사용자 ──
    if (path === '/api/admin/me' && method === 'GET') {
      const row = await env.DB.prepare(
        `SELECT username, name, email, phone, created_at, updated_at FROM admin_account WHERE username = ? LIMIT 1`
      ).bind(me).first();
      // 🪪 쿠키세션 기준 권위 역할/스코프 — 휴대폰·모바일·PC 모두 동일하게 본인 역할로 일치.
      let scope: { type: string; value: string | null; label: string } | null = null;
      let role = 'staff', roleLabel = '직원';
      try {
        const sc = await getScope(env as any, request);
        scope = { type: sc.type, value: sc.value, label: sc.label };
        const rr = resolveRole(sc.type, me, (row as any)?.name || '');
        role = rr.role; roleLabel = rr.roleLabel;
      } catch (e) {
        console.warn('[auth-admin] /me scope err:', (e as any)?.message);
      }
      return json({ ok: true, user: row || null, role, roleLabel, scope });
    }

    // ── 프로필 업데이트 ──
    if (path === '/api/admin/profile' && method === 'POST') {
      let body: any;
      try { body = await request.json(); } catch { body = null; }
      if (!body) return json({ ok: false, error: 'invalid_body' }, 400);
      const name  = body.name  != null ? String(body.name).slice(0, 50) : null;
      const email = body.email != null ? String(body.email).slice(0, 100) : null;
      const phone = body.phone != null ? String(body.phone).slice(0, 30) : null;
      await env.DB.prepare(
        `UPDATE admin_account SET name = ?, email = ?, phone = ?, updated_at = ? WHERE username = ?`
      ).bind(name, email, phone, Date.now(), me).run();
      return json({ ok: true });
    }

    // ── 비밀번호 변경 ──
    if (path === '/api/admin/change-password' && method === 'POST') {
      let body: any;
      try { body = await request.json(); } catch { body = null; }
      const cur = String(body?.current_password || '');
      const next = String(body?.new_password || '');
      if (!cur || !next) return json({ ok: false, error: 'missing_fields' }, 400);
      if (next.length < 6) return json({ ok: false, error: 'too_short' }, 400);

      const row = await env.DB.prepare(
        `SELECT password_hash FROM admin_account WHERE username = ? LIMIT 1`
      ).bind(me).first<{ password_hash: string }>();
      if (!row) return json({ ok: false, error: 'user_missing' }, 500);
      const passOk = await verifyPassword(cur, row.password_hash);
      if (!passOk) return json({ ok: false, error: 'wrong_current_password' }, 401);

      const newHash = await hashPassword(next);
      await env.DB.prepare(
        `UPDATE admin_account SET password_hash = ?, updated_at = ? WHERE username = ?`
      ).bind(newHash, Date.now(), me).run();

      // 보안: 본인 다른 세션은 모두 종료, 현재 세션만 유지
      await env.DB.prepare(
        `DELETE FROM admin_sessions WHERE username = ? AND token != ?`
      ).bind(me, sess.token!).run().catch(() => {});

      return json({ ok: true });
    }

    // ── 로그인 이력 (최근 10건) ──
    if (path === '/api/admin/login-history' && method === 'GET') {
      const rs = await env.DB.prepare(
        `SELECT login_at, ip, user_agent, success, reason
         FROM admin_login_history WHERE username = ?
         ORDER BY login_at DESC LIMIT 10`
      ).bind(me).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ── 활성 세션 목록 ──
    if (path === '/api/admin/sessions' && method === 'GET') {
      const rs = await env.DB.prepare(
        `SELECT token, ip, user_agent, created_at, expires_at, last_seen_at
         FROM admin_sessions WHERE username = ? AND expires_at > ?
         ORDER BY last_seen_at DESC`
      ).bind(me, Date.now()).all();
      const items = (rs.results || []).map((r: any) => ({
        token_short: String(r.token).slice(0, 8),
        token_full: r.token,
        ip: r.ip,
        user_agent: r.user_agent,
        created_at: r.created_at,
        expires_at: r.expires_at,
        last_seen_at: r.last_seen_at,
        is_current: r.token === sess.token
      }));
      return json({ ok: true, items });
    }

    // ── 특정 세션 강제 종료 ──
    if (path === '/api/admin/sessions/revoke' && method === 'POST') {
      let body: any;
      try { body = await request.json(); } catch { body = null; }
      const token = String(body?.token || '');
      if (!token) return json({ ok: false, error: 'missing_token' }, 400);
      // 본인 세션만 종료 가능
      const r = await env.DB.prepare(
        `DELETE FROM admin_sessions WHERE token = ? AND username = ?`
      ).bind(token, me).run();
      return json({ ok: true, deleted: r.meta.changes || 0 });
    }

    return null;
  } catch (e: any) {
    console.error('[auth-admin] handler error:', e);
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}

async function recordLogin(
  env: AuthEnv, username: string, ip: string, ua: string, success: boolean, reason: string | null
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO admin_login_history (username, ip, user_agent, success, reason, login_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(username, ip, ua, success ? 1 : 0, reason, Date.now()).run();
  } catch (e) { console.warn('[auth-admin] recordLogin err:', (e as any)?.message); }
}
