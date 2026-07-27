/**
 * legacy-teacher-auth.ts — 강사 "기존 아이디·비밀번호" 통과 인증 + 최초 로그인 자동 이관
 *
 *  왜 필요한가 (2026-07-27 사장님 지시)
 *    강사 227명의 계정은 옛 카페24 LMS(www.mangoi.co.kr/lms)에 있고, 새 시스템
 *    (test.mangoi.co.kr)의 admin_account 에는 시연용 4개뿐이라 실제 강사는 아무도
 *    로그인할 수 없었다. "기존 아이디·비번 그대로 새 사이트에서 로그인" 이 요구사항.
 *
 *  방식 (사장님 선택 = A안)
 *    ① 강사가 새 사이트 로그인칸에 기존 아이디/비번 입력
 *    ② 새 시스템에 계정이 **없을 때만** 워커가 옛 LMS 로 대신 로그인해 본다
 *    ③ 통과하면 그 자리에서 새 시스템 계정을 만든다(비번은 새 방식 SHA-256+salt 로 해시)
 *    ④ 다음 로그인부터는 옛 서버를 아예 거치지 않는다 — 강사 1인당 딱 한 번만 경유
 *    이 방식은 카페24 DB 접근이 필요 없고, 서버 이전 후에도 계정이 남는다.
 *
 *  🔐 안전장치
 *    - 옛 LMS 는 **학생 계정을 모른다**(실측: students_erp 아이디 3개 전부 "아이디를 잘못
 *      입력하셨습니다"). 즉 이 통로로 학생이 관리자 계정을 만들 수 없다.
 *    - 자동 생성 계정은 **무조건 강사 권한**(admin_scope.scope_type='teacher')으로만 만든다.
 *      index.ts 의 TEACHER_BLOCKED_PREFIXES(회계·정산·권한·발송 등)가 그대로 적용된다.
 *    - 성공 판정은 "옛 서버가 뭐라고 답했나"가 아니라 **받은 세션 쿠키로 강사 전용 페이지가
 *      실제로 열리는가**로 한다(문구가 바뀌어도 안 깨지고, 오탐으로 계정이 생기지 않는다).
 *    - 실패는 admin_login_history 에 기록 → 기존 IP 브루트포스 차단(15분 8회)이 그대로 작동.
 *    - `LEGACY_TEACHER_LOGIN="off"` 로 즉시 끌 수 있다(wrangler.toml [vars] 양쪽).
 */

import { runCypher } from './teacher-match';

export interface LegacyAuthEnv {
  DB: D1Database;
  LEGACY_TEACHER_LOGIN?: string;   // 'off' 면 통과 인증 비활성
  LEGACY_LMS_BASE?: string;        // 기본 https://www.mangoi.co.kr/lms
}

const DEFAULT_LMS_BASE = 'https://www.mangoi.co.kr/lms';
const FETCH_TIMEOUT_MS = 8000;

// 옛 LMS 로 보낼 수 있는 아이디 형태(이메일형 포함). 이 밖의 값은 옛 서버를 아예 안 부른다.
const SAFE_ID = /^[A-Za-z0-9._@+-]{3,64}$/;

export function legacyLoginEnabled(env: LegacyAuthEnv): boolean {
  return String(env.LEGACY_TEACHER_LOGIN || '').toLowerCase() !== 'off';
}

function lmsBase(env: LegacyAuthEnv): string {
  return String(env.LEGACY_LMS_BASE || DEFAULT_LMS_BASE).replace(/\/+$/, '');
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Set-Cookie 여러 줄을 'name=value; name=value' 로 합친다.
//   ⚠️ headers.get('set-cookie') 는 여러 쿠키를 콤마로 이어붙여 주는데 Expires 날짜에도
//      콤마가 있어 안전하게 못 쪼갠다. workerd 의 getSetCookie() 가 있으면 그걸 쓴다.
function collectCookies(res: Response): string {
  const anyH = res.headers as any;
  const raw: string[] = typeof anyH.getSetCookie === 'function'
    ? anyH.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []);
  const jar: string[] = [];
  for (const line of raw) {
    const pair = String(line).split(';')[0].trim();
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const val = pair.slice(eq + 1);
    if (!val || val === 'deleted') continue;   // 로그아웃/삭제 지시 쿠키는 버림
    jar.push(pair);
  }
  return jar.join('; ');
}

export interface LegacyVerifyResult {
  ok: boolean;
  reason: string;        // 실패 사유(로그용). 사용자에게 그대로 보여주지 않는다.
  alert?: string;        // 옛 LMS 가 띄운 alert 문구(있으면)
}

/**
 * 옛 LMS 에 아이디/비번을 대신 넣어 보고, **세션이 실제로 만들어졌는지**로 판정한다.
 *   1) POST /lms/login_action.php  (성공/실패 모두 200 + <script>alert()</script> 를 줄 수 있어
 *      본문 문구만으로 판정하지 않는다)
 *   2) 받은 쿠키로 GET /lms/ — 비로그인 상태면 302 → login_form.php 로 튕긴다.
 *      튕기지 않으면 = 로그인 성공.
 */
export async function verifyLegacyLmsLogin(
  env: LegacyAuthEnv, loginId: string, password: string
): Promise<LegacyVerifyResult> {
  if (!legacyLoginEnabled(env)) return { ok: false, reason: 'disabled' };
  if (!SAFE_ID.test(loginId) || !password || password.length < 4) {
    return { ok: false, reason: 'id_format' };
  }
  const base = lmsBase(env);

  let post: Response;
  try {
    post = await fetchWithTimeout(base + '/login_action.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'MangoiWorker/1.0 (+teacher-login-bridge)',
      },
      body: new URLSearchParams({
        ApplyMemberLoginID: loginId,
        ApplyMemberLoginPW: password,
        RedirectUrl: '',
      }).toString(),
      redirect: 'manual',
    });
  } catch (e: any) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'legacy_timeout' : 'legacy_unreachable' };
  }

  const body = await post.text().catch(() => '');
  const alertM = /alert\(\s*["']([^"']*)["']\s*\)/.exec(body);
  const cookie = collectCookies(post);
  if (!cookie) {
    return { ok: false, reason: 'no_session_cookie', alert: alertM?.[1] };
  }

  // 세션 확인 — 이게 진짜 판정이다.
  let probe: Response;
  try {
    probe = await fetchWithTimeout(base + '/', {
      method: 'GET',
      headers: { Cookie: cookie, 'User-Agent': 'MangoiWorker/1.0 (+teacher-login-bridge)' },
      redirect: 'manual',
    });
  } catch (e: any) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'legacy_timeout' : 'legacy_unreachable' };
  }

  const loc = probe.headers.get('location') || '';
  if (probe.status >= 300 && probe.status < 400) {
    // 로그인 화면으로 튕기면 미인증. 그 밖의 곳으로 가면 인증된 것.
    if (/login/i.test(loc)) return { ok: false, reason: 'not_authenticated', alert: alertM?.[1] };
    return { ok: true, reason: 'ok_redirect' };
  }
  if (probe.status === 200) {
    const probeBody = await probe.text().catch(() => '');
    // 200 인데 로그인 폼이 들어 있으면 미인증(리다이렉트 대신 폼을 그리는 경우 대비)
    if (/ApplyMemberLoginPW|name=["']LoginForm["']/i.test(probeBody)) {
      return { ok: false, reason: 'not_authenticated', alert: alertM?.[1] };
    }
    return { ok: true, reason: 'ok' };
  }
  return { ok: false, reason: 'probe_status_' + probe.status, alert: alertM?.[1] };
}

export interface LegacyTeacherInfo {
  name: string;
  teacher_id?: string | null;
  group_name?: string | null;
  email?: string | null;
  matched: boolean;      // 카페24 강사 명부에서 실제로 찾았는지
}

/**
 * 카페24 강사 명부(Neo4j :Teacher)에서 로그인 아이디로 강사를 찾아 **실제 이름**을 얻는다.
 *   마이페이지의 급여·평가는 강사 '이름'으로 매칭되므로(sameTeacherName) 이름이 정확해야
 *   본인 데이터가 보인다. Neo4j 가 죽어 있어도 로그인은 막지 않는다(이름만 아이디로 폴백).
 */
export async function lookupTeacherByLoginId(env: LegacyAuthEnv, loginId: string): Promise<LegacyTeacherInfo> {
  const id = loginId.trim().toLowerCase();
  const local = id.includes('@') ? id.split('@')[0] : id;
  try {
    const { fields, values } = await runCypher(env as any, `
      MATCH (t:Teacher) WHERE t.name IS NOT NULL
        AND ( toLower(trim(coalesce(t.email,''))) = $id
           OR toLower(trim(coalesce(t.email,''))) = $local
           OR toLower(trim(coalesce(t.login_id,''))) = $id
           OR toLower(trim(coalesce(t.nickname,''))) = $local )
      RETURN t.name AS name, t.teacher_id AS teacher_id,
             t.group_name AS group_name, t.email AS email
      LIMIT 1`, { id, local }, 'READ');
    if (values.length) {
      const row = Object.fromEntries(fields.map((f, i) => [f, values[0][i]])) as any;
      const nm = String(row.name || '').trim();
      if (nm) {
        return {
          name: nm,
          teacher_id: row.teacher_id != null ? String(row.teacher_id) : null,
          group_name: row.group_name ? String(row.group_name) : null,
          email: row.email ? String(row.email) : null,
          matched: true,
        };
      }
    }
  } catch (e: any) {
    console.warn('[legacy-teacher-auth] 강사 명부 조회 실패(로그인은 계속):', e?.message || e);
  }
  return { name: loginId, matched: false };
}

/**
 * 통과 인증에 성공한 강사를 새 시스템 계정으로 만든다(멱등).
 *   - admin_account : 비번은 **새 시스템 방식으로 해시**해 저장(평문·옛 해시 저장 안 함)
 *   - admin_scope   : scope_type='teacher' 고정 — 자동 생성 계정은 강사 권한 이상을 받지 못한다
 *   - teacher_legacy_accounts : 누가 언제 넘어왔는지 이관 현황(관리자 확인용)
 */
export async function provisionTeacherAccount(
  env: LegacyAuthEnv,
  loginId: string,
  passwordHash: string,
  info: LegacyTeacherInfo
): Promise<void> {
  const now = Date.now();
  const email = loginId.includes('@') ? loginId : null;
  await env.DB.prepare(
    `INSERT INTO admin_account (username, password_hash, name, email, phone, created_at, updated_at, pref_lang, nationality)
     VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL)
     ON CONFLICT(username) DO NOTHING`
  ).bind(loginId, passwordHash, info.name || loginId, info.email || email, now, now).run();

  await env.DB.exec(`CREATE TABLE IF NOT EXISTS admin_scope (username TEXT PRIMARY KEY, scope_type TEXT NOT NULL, scope_value TEXT, updated_at INTEGER);`);
  await env.DB.prepare(
    `INSERT INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES (?, 'teacher', NULL, ?)
     ON CONFLICT(username) DO UPDATE SET scope_type='teacher', updated_at=excluded.updated_at`
  ).bind(loginId, now).run();

  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_legacy_accounts (username TEXT PRIMARY KEY, teacher_name TEXT, teacher_id TEXT, roster_matched INTEGER DEFAULT 0, source TEXT, created_at INTEGER, last_login_at INTEGER);`);
  await env.DB.prepare(
    `INSERT INTO teacher_legacy_accounts (username, teacher_name, teacher_id, roster_matched, source, created_at, last_login_at)
     VALUES (?, ?, ?, ?, 'cafe24_lms', ?, ?)
     ON CONFLICT(username) DO UPDATE SET last_login_at=excluded.last_login_at`
  ).bind(loginId, info.name || loginId, info.teacher_id || null, info.matched ? 1 : 0, now, now).run();
}
