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
import { generateSecret, otpauthURI, verifyTOTP } from './totp';
import { sendPlainSms } from './solapi-client';
import { sendEmail, getEmailMode, emailLayout } from './email';
import { authUidFromRequest } from './auth-token';   // 🔐 소유자 검증(단방향 의존: auth-admin → auth-token)
import { legacyLoginEnabled, verifyLegacyLmsLogin, lookupTeacherByLoginId, provisionTeacherAccount } from './legacy-teacher-auth';

export interface AuthEnv {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
  // 🔐 (2026-08-19) 시연용 지사·대리점·교사 계정 비번. 미설정이면 코드의 강한 폴백을 쓴다.
  //   `wrangler secret put DEMO_PASSWORD` 로 바꿀 수 있다(바꾸면 그 값이 정본).
  DEMO_PASSWORD?: string;
  // 🧑‍🏫 강사 옛 LMS 통과 인증 (legacy-teacher-auth.ts) — 'off' 로 즉시 차단 가능
  LEGACY_TEACHER_LOGIN?: string;
  LEGACY_LMS_BASE?: string;
}

/**
 * 🇵🇭 필리핀 본사 매니저 명단 (2026-08-05 운영 DB 확인).
 *   화면 언어(영어)와 결재 승인 권한 판정에 함께 쓴다.
 *
 *   ⚠️ `mgr_` 접두사로 «필리핀»을 판정하면 안 된다 — mgr_jjw(장지웅)·mgr_lby(이병엽) 처럼
 *      **한국 본사 매니저도 같은 접두사**를 쓴다. 접두사로 갈랐다가 한국 매니저 두 분이
 *      영어 화면을 받는 사고를 냈다(같은 날 되돌림).
 *   ⚠️ 이름의 한글 유무로도 판정 불가 — 전원 "… (본사 매니저)" 꼬리표가 붙어 있다.
 *   필리핀 직원이 늘면 여기에 아이디를 추가할 것. 이 파일 한 곳만 고치면 된다.
 */
export const PH_MANAGERS = ['mgr_melca', 'mgr_maimai', 'mgr_karl'];

/**
 * 👥 «한 사람이 두 계정을 쓴다» 표 (2026-08-09)
 *
 *   왜 —
 *     Maimai(필리핀 매니저)는 계정이 두 개다. 실수로 만들어진 중복이 아니라 **출처가 다르다**:
 *       · `mgr_maimai`  = 2026-07-14 본사 매니저 일괄 시드. admin_scope.scope_type='hq' → /manager
 *       · `mangoi_033`  = 2026-07-28 본인이 **옛 카페24 LMS 아이디**로 로그인해 자동 이관된 계정.
 *                         legacy-teacher-auth.ts 가 만드는 계정은 scope_type='teacher' 고정 → /teacher
 *     둘 다 실제로 쓰고 있다(강사원부 teachers#27 MAIMAI 로 배정된 수업이 있다).
 *     그런데 화면 어디에도 «당신에겐 다른 계정이 하나 더 있다»는 말이 없어서, 로그인 이력에
 *     **두 아이디의 비밀번호를 서로 바꿔 넣는 실패가 반복**된다(실측: 실패 직후 다른 아이디로 성공).
 *
 *   ⛔ 계정을 합치지 않는다 — 합치면 강사 권한 고정(자동이관 계정의 안전장치)과 hq 권한이
 *      한 계정에서 부딪힌다. 대신 **양쪽 화면이 서로를 가리키게** 한다.
 *   ⚠️ 이 표는 «본인에게 본인 계정을 알려주는» 용도다. 로그인 전에는 절대 노출하지 않는다
 *      (아이디 존재 여부가 새면 무차별 대입의 표적이 된다). 두 API 모두 인증 뒤에서만 실어 보낸다.
 */
export const SAME_PERSON_ACCOUNTS: Record<string, { username: string; role_ko: string; role_en: string; href: string }> = {
  /* 🔑 방향이 한쪽뿐인 이유 —
     `mgr_maimai`(hq) 하나면 **매니저 화면과 강사 화면을 재로그인 없이 둘 다** 쓸 수 있다.
     서버가 이미 그렇게 돼 있다: /api/teacher/portal 은 hq 계정도 받고(isManager),
     강사원부 매칭이 계정 이름 'Maimai (본사 매니저)' 안의 낱말 'MAIMAI' 로 teachers#27 에
     붙기 때문에 **커버수업·레벨테스트가 그 계정에서 그대로 보인다.**
     반대로 `mangoi_033`(scope='teacher')은 매니저 화면에 못 들어간다(서버가 되돌려보낸다).
     → 그러니 «갈아타라» 가 아니라 «한 계정으로 모으라» 고 안내한다. 안내는 강사 계정 쪽에만. */
  mangoi_033: {
    username: 'mgr_maimai',
    role_ko: '매니저 화면과 내 수업을 한 계정에서 (로그아웃 없이 오갈 수 있습니다)',
    role_en: 'Manager view and your classes in one account (switch without logging out)',
    href: '/manager',
  },
};

/** 로그인한 본인의 «다른 계정». 없으면 null. */
export function otherAccountOf(username: string) {
  return SAME_PERSON_ACCOUNTS[String(username || '').trim().toLowerCase()] || null;
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
  // 🧑‍🏫 (2026-07-27) 옛 LMS 통과 인증으로 자동 생성된 강사 계정은 아이디가 제각각이라
  //   접두사·이름으로는 판정할 수 없다. 그래서 계정 생성 시 scope_type='teacher' 를 못박고
  //   여기서 그 값을 최우선으로 읽는다. (legacy-teacher-auth.ts provisionTeacherAccount)
  //   ⚠️ 이 값이 강사 권한 제한(index.ts TEACHER_BLOCKED_PREFIXES)의 근거다. 지우지 말 것.
  if (scopeType === 'teacher') return { role: 'teacher', roleLabel: '교사' };
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

/** 🪪 화면 어휘의 «완전한» 신원 — 역할 판정의 단일 정본 (2026-08-09 신설)
 *
 *  왜 만들었나
 *    같은 규칙이 세 곳에 복사돼 있었고 **이미 갈라져 있었다**:
 *      · public/index.html  (tryAdminLoginFallback) — 학생/학부모 분기 없음
 *      · public/admin/login.html (ph239)            — 학생/학부모 분기 있음
 *      · 여기 resolveRole()                          — 어휘가 아예 다름
 *
 *    이전 세션이 통일을 시도했다가 포기한 이유가 login.html:216 에 적혀 있다:
 *      「hq 는 hq_exec 인지 hq_mgr 인지 구분이 안 되고, branch/agency 로 바꿔봐야
 *        로그인 응답에 branch_id/agency_id 가 없어 스코프가 비어버린다」
 *    즉 막힌 건 클라이언트가 아니라 **서버가 덜 주고 있던 것**이었다. 그래서 여기서 다 준다.
 *
 *  ⚠️ 접두사 규칙을 고칠 일이 생기면 **이 함수만** 고친다. 화면 두 곳은 이 값을 그대로 쓴다.
 */
export function resolveUiIdentity(
  username: string, acctName: string, isTeacher: boolean
): { ui_role: string; branch_id: string | null; agency_id: string | null; display_name: string } {
  const uid = String(username || '');
  let ui_role = 'hq_mgr';
  let branch_id: string | null = null;
  let agency_id: string | null = null;
  let name = uid;

  // 🏢 capi_* 지사 계정은 서버 DB 이름('캐피 강남 지사' 등)이 우선 — 전부 '캐피타운 본사'로
  //    찍히던 것 수정(2026-07-22). 아래 「DB 이름 우선」 규칙이 그 역할을 대신한다.
  if (uid === 'capitown' || uid.indexOf('capi') === 0) { ui_role = 'capitown'; name = acctName || '캐피타운 본사'; }
  else if (uid === 'admin' || uid === 'hq_exec' || uid === 'exec') { ui_role = 'hq_exec'; name = '본사 경영진'; }
  else if (uid.indexOf('hq_t') === 0) { ui_role = 'hq_teacher'; name = '본사 교사'; }
  else if (uid.indexOf('hq_') === 0)  { ui_role = 'hq_mgr';     name = '본사 관리자'; }
  else if (uid.indexOf('branch_') === 0) { ui_role = 'branch'; branch_id = uid.replace(/^branch_/, ''); name = '지사 (' + branch_id + ')'; }
  else if (uid.indexOf('agency_') === 0) { ui_role = 'agency'; agency_id = uid.replace(/^agency_/, ''); name = '대리점 (' + agency_id + ')'; }
  else if (uid === 'parent'  || uid.indexOf('parent_')  === 0) { ui_role = 'parent';  name = '학부모'; }
  else if (uid === 'student' || uid.indexOf('student_') === 0) { ui_role = 'student'; name = '학생'; }

  // 🪪 접두사 없는 강사 계정 구제 (예: 'jeong' = 정우영(교사), scope=hq).
  //    접두사 추측만 쓰던 탓에 관리자로 잘못 표시되던 문제(2026-07-05).
  if (isTeacher) { ui_role = 'hq_teacher'; if (acctName) name = acctName; }

  // 🪪 DB 이름을 표시 이름으로 우선 (2026-07-22). 아이디로 추측하던 탓에 mgr_* 이름이 아이디로 찍혔다.
  if (acctName && acctName !== uid) name = acctName;

  return { ui_role, branch_id, agency_id, display_name: name };
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

/** 전체권한 계정 — 비번찾기 성공 시 사장님에게 알리고, 부트스트랩이 강한 비번을 심는 대상. */
export const FULL_ACCESS_ACCOUNTS = new Set(['admin', 'cfo', 'ops_lead']);

/**
 * 🌏 국적(ISO2) → 국제문자 국가번호. SOLAPI 는 국내(82)가 아니면 country 를 붙여야 나간다.
 *   강사는 사실상 전원 필리핀(63)이라 이 표가 없으면 «비번찾기가 강사에게만 안 되는» 기능이 된다.
 */
const DIAL_CODE: Record<string, string> = {
  KR: '82', PH: '63', US: '1', VN: '84', TH: '66', ID: '62', JP: '81', CN: '86', MY: '60', SG: '65',
};

/**
 * 🔑 비번찾기에 쓸 연락처를 고른다.
 *   ⚠️ **값이 있다고 다 연락처가 아니다.** 운영 DB 에는 email 칸에 아이디가 그대로 들어간 행이
 *      실제로 있다(`agency_gn001`, `mangoi_172` — 2026-08-17 확인). 그런 값으로 메일을 보내면
 *      «보냈다» 고 기록만 남고 아무 데도 안 간다. 그래서 형식 검사를 통과한 것만 연락처로 인정한다.
 */
export function pickResetContact(acct: { phone?: string | null; email?: string | null; nationality?: string | null }):
  { phone?: string; email?: string; country?: string } {
  const out: { phone?: string; email?: string; country?: string } = {};
  const digits = String(acct.phone || '').replace(/[^0-9]/g, '');
  if (digits.length >= 8) {
    out.phone = digits;
    const nat = String(acct.nationality || '').toUpperCase();
    // 국적이 있으면 그것을, 없으면 번호 모양으로 추정(010… = 국내).
    out.country = DIAL_CODE[nat] || (digits.startsWith('010') ? '82' : undefined);
  }
  const email = String(acct.email || '').trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) out.email = email;
  return out;
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
    `CREATE INDEX IF NOT EXISTS idx_admin_login_history_ip ON admin_login_history(ip, login_at)`,
    // 🔐 2단계 인증(2FA/TOTP) — 계정별 비밀키. enabled=1 이어야 로그인 시 코드 요구.
    //   secret 은 '설정 중(대기)' 상태(enabled=0)로 먼저 저장되고, 사용자가 코드 1회 확인하면 enabled=1.
    `CREATE TABLE IF NOT EXISTS admin_2fa (
       username TEXT PRIMARY KEY,
       secret TEXT NOT NULL,
       enabled INTEGER NOT NULL DEFAULT 0,
       created_at INTEGER NOT NULL,
       enabled_at INTEGER
     )`,
    // 🌐 (2026-07-23) 계정별 화면 언어. 'en' | 'ko' | NULL(=미지정 → 국적·아이디로 자동판정).
    //   운영에서 개인별로 못박고 싶을 때만 쓰는 최우선 override.
    //   ⚠️ 이미 있는 컬럼이면 SQLite 가 에러를 내는데, 아래 for 문이 삼키므로 정상 동작.
    `ALTER TABLE admin_account ADD COLUMN pref_lang TEXT`,
    // 🌏 (2026-07-23 사장님 지시) **국적으로 언어를 정한다.** 한국인 → 한국어, 그 외 → 영어.
    //   ISO 3166-1 alpha-2 대문자 2글자를 넣는다: 'KR' | 'PH' | 'US' | ...
    //   그동안은 이름 글자·아이디 접두사로 추측했는데, 이름 칸이 비거나 직함이 섞이면
    //   계속 틀렸다(`Maimai (본사 매니저)` 사고). 국적은 사람이 바뀌지 않는 사실이라 안 흔들린다.
    `ALTER TABLE admin_account ADD COLUMN nationality TEXT`,
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
  // 🔐 (2026-07-12 보안 하드닝):
  //   ① 전체권한 계정(admin·cfo·ops_lead)은 추측 불가한 강한 비번 강제(공개 로그인 화면 노출 제거와 세트).
  //   ② 매 부팅마다 비번을 강제로 되돌리던 UPDATE 제거 → 사장님이 바꾼 비번/ env.ADMIN_PASSWORD 가 유지됨.
  //   ③ 과거에 심어진 취약 비번(=아이디와 동일: admin/cfo/ops)만 1회성으로 강한값으로 자동 교체.
  // 🔐 (2026-08-19 사장님 지시 — 필리핀 매니저 Karl 이 `branch_busan/busan` 으로 몇 주째 일하고 있던 건):
  //   ④ **저권한 시연 계정도 아이디에서 유추되는 비번을 쓰면 안 된다.** 이 계정들은 «데모» 라는 이름과 달리
  //      admin_scope 로 **실제 자료**에 연결돼 있다(branch_busan → 지사 '부산' = 실제 학생·매출).
  //      비번이 busan/daegu/gn001/sc002/teacher 라 아이디만 알면 남의 지사 자료가 열렸다.
  //      → ①③ 과 같은 방식(강한 비번으로 심기 + 취약 비번일 때만 1회 교체)을 이 계정들에도 적용한다.
  //   ⚠️ 계정을 지우거나 잠그지는 않는다 — 사장님·본사가 화면 점검에 실제로 쓰고 있고(로그인 기록 확인),
  //      지우면 그 점검 경로가 통째로 사라진다. «비번만» 추측 불가로 바꾼다.
  //   ⚠️ capitown(캐피타운 본사)은 아이디에서 유추되는 비번이 아니고 정산 실사용 계정이라 건드리지 않는다.
  try {
    // env.ADMIN_PASSWORD 미설정 시에도 절대 'admin' 같은 자명한 값이 되지 않도록 강한 폴백 사용.
    const strongAdminPw = (env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 8)
      ? env.ADMIN_PASSWORD : 'FbshDMf9ei5Tog';
    // 저권한 시연 계정(지사·대리점·교사)용 강한 비번. env.DEMO_PASSWORD 를 넣으면 그 값이 이긴다.
    const strongDemoPw = (env.DEMO_PASSWORD && env.DEMO_PASSWORD.length >= 8)
      ? env.DEMO_PASSWORD : 'Kv8pQn3TjWz5Ra';
    const FULL_ACCESS = new Set(['admin', 'cfo', 'ops_lead']);
    // 실제 스코프가 붙어 있는 시연 계정 — 아이디 유래 비번을 쓰면 안 되는 대상
    const SCOPED_DEMO = new Set(['branch_busan', 'branch_daegu', 'agency_gn001', 'agency_sc002', 'hq_t_001', 'hq_t_len']);
    // [username, 취약했던 기존 비번(교체 감지용), 표시이름]
    const demoAccounts: Array<[string, string, string]> = [
      ['admin', 'admin', '본사·경영진'],
      ['cfo', 'cfo', '본사·재무(CFO)'],
      ['ops_lead', 'ops', '본사·관리자'],
      ['branch_busan', 'busan', '부산 지사'],
      ['branch_daegu', 'daegu', '대구 지사'],
      ['agency_gn001', 'gn001', '강남 대리점'],
      ['agency_sc002', 'sc002', '서초 대리점'],
      ['hq_t_001', 'teacher', '교사'],
      // 📅 (2026-07-10) 실강사 시연 계정 — 이름이 teacher_profiles.korean_name("Teacher Len")과
      //   정확히 일치해야 마이페이지 수업목록·수업료정산·내평가가 실데이터로 매칭된다.
      ['hq_t_len', 'mango1234', 'Teacher Len'],
      ['capitown', 'capi2026!', '캐피타운 본사'],   // 프랜차이즈 본사 정산 전용 계정
    ];
    const nowD = Date.now();
    for (const acc of demoAccounts) {
      const u = acc[0], oldPw = acc[1], nm = acc[2];
      // 강한 비번을 심는 대상: 전체권한 계정 + 실제 스코프가 붙은 시연 계정
      const strongPw = FULL_ACCESS.has(u) ? strongAdminPw : (SCOPED_DEMO.has(u) ? strongDemoPw : null);
      const seedPw = strongPw || oldPw;
      const ex: any = await env.DB.prepare(`SELECT id, password_hash FROM admin_account WHERE username = ? LIMIT 1`).bind(u).first();
      if (!ex) {
        await env.DB.prepare(
          `INSERT INTO admin_account (username, password_hash, name, email, phone, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)`
        ).bind(u, await hashPassword(seedPw), nm, nowD, nowD).run();
        console.warn('[auth-admin] demo account seeded:', u);
      } else if (strongPw) {
        // 이미 존재하는 계정: '아이디에서 유추되는 취약 비번'일 때만 강한 비번으로 1회 교체.
        //   (이미 강한 비번이거나 사장님이 바꾼 비번은 건드리지 않음)
        const isWeak = await verifyPassword(oldPw, String(ex.password_hash || ''));
        if (isWeak) {
          await env.DB.prepare(`UPDATE admin_account SET password_hash = ?, updated_at = ? WHERE username = ?`)
            .bind(await hashPassword(strongPw), nowD, u).run();
          console.warn('[auth-admin] 🔐 weak password rotated:', u);
        }
      }
      // 그 외(스코프 없는 실계정)는 seed-if-missing 만. 매부팅 강제리셋 제거로 바뀐 비번이 유지됨.
    }
  } catch (e) {
    console.warn('[auth-admin] demo seed failed:', (e as any)?.message);
  }

  // 🌏 (2026-07-23 사장님 지시) 기존 계정 국적 1회 채우기 — "이번에는 다 넣어주고".
  //   앞으로는 강사 등록 폼의 '국적' 칸이 채우지만, 이미 만들어진 계정은 값이 없다.
  //   ⚠️ **nationality 가 비어 있는 행만** 건드린다. 한 번 값이 들어가면(사람이 고쳤든
  //      등록 폼이 넣었든) 다시는 덮어쓰지 않는다 → 몇 번 실행돼도 안전(멱등).
  //   기준: 사장님 확인(2026-07-23) — 강사·해외 스태프 계정 컨벤션은 `mangoi_NNN`,
  //         한국인 스태프는 admin / mgr_* / cfo / ops_lead. "한국인 교사들은 없다."
  //   ⚠️ 지사·대리점·프랜차이즈(branch_* / agency_* / capi*)는 국내 조직이지만 여기서
  //      건드리지 않는다 — 판정을 바꾸는 건 사장님이 명시한 범위(교직원)까지만.
  try {
    const nowN = Date.now();
    const KR_ACCOUNTS = ['admin', 'cfo', 'ops_lead'];
    for (const u of KR_ACCOUNTS) {
      await env.DB.prepare(
        `UPDATE admin_account SET nationality = 'KR', updated_at = ? WHERE username = ? AND (nationality IS NULL OR nationality = '')`
      ).bind(nowN, u).run();
    }
    // 한국인 매니저 컨벤션 mgr_*  (장지웅·이병엽 등)
    //   🇵🇭 ⚠️ **PH_MANAGERS 는 빼야 한다.** 이 줄이 정확히 그 사고를 냈다 —
    //      Maimai·Melca·Karl 도 `mgr_` 접두사라 여기에 걸려 nationality='KR' 이 박혔고,
    //      위(로그인 응답)의 «② nationality 가 정식 기준» 규칙에 따라 **필리핀 매니저 3명이
    //      한국어 화면을 받게** 됐다(2026-08-09 운영 DB 실측: 3명 전원 KR · pref_lang 은 NULL).
    //      이 파일 맨 위 주석이 「접두사로 필리핀을 가르지 말라」고 경고하는 바로 그 함정을
    //      백필 SQL 이 다시 밟은 것이다. 명단으로 못박은 사람은 명단이 이긴다.
    const _phIn = PH_MANAGERS.map(() => '?').join(',');
    await env.DB.prepare(
      `UPDATE admin_account SET nationality = 'KR', updated_at = ?
        WHERE username LIKE 'mgr\\_%' ESCAPE '\\'
          AND username NOT IN (${_phIn})
          AND (nationality IS NULL OR nationality = '')`
    ).bind(nowN, ...PH_MANAGERS).run();
    // 🩹 이미 잘못 박힌 3행을 되돌린다(1회성·멱등).
    //   ⚠️ 위 원칙(«값이 들어가면 다시 안 덮는다»)의 **좁은 예외**다. 조건을 두 겹으로 막았다:
    //      ① 대상은 PH_MANAGERS 세 명뿐  ② 지금 값이 정확히 'KR' 일 때만.
    //      사람이 손으로 다른 값(예: 'US')을 넣어 뒀다면 건드리지 않고, 한 번 'PH' 가 되면
    //      다음 부팅부터는 0행이라 사실상 no-op 이다.
    await env.DB.prepare(
      `UPDATE admin_account SET nationality = 'PH', updated_at = ?
        WHERE username IN (${_phIn}) AND nationality = 'KR'`
    ).bind(nowN, ...PH_MANAGERS).run();
    // 해외 강사·스태프 컨벤션 mangoi_NNN + 시연용 hq_t_*  → 필리핀
    await env.DB.prepare(
      `UPDATE admin_account SET nationality = 'PH', updated_at = ? WHERE (username LIKE 'mangoi\\_%' ESCAPE '\\' OR username LIKE 'hq\\_t%' ESCAPE '\\') AND (nationality IS NULL OR nationality = '')`
    ).bind(nowN).run();
  } catch (e) {
    console.warn('[auth-admin] nationality backfill:', (e as any)?.message);
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
// 🔐 uid 소유 데이터 접근 판정 — "게스트 지원" 개인 엔드포인트 공용 (2026-07-19 통합)
// ────────────────────────────────────────────────────────────
//   review-quiz·streak·voice/coach·vocab 등에서 5벌 이상 복붙되던 가드
//   (게스트 예외 + 관리자세션 OR 토큰 소유자)를 한 곳으로 통합.
//   ⚠️ 게스트 판정은 반드시 /^guest/i (bare 'guest' 및 guest_* 모두 포함) —
//      voice/coach 는 미로그인 시 uid 기본값이 bare 'guest' 라, startsWith('guest_')로
//      좁히면 게스트 발음코칭이 401 로 깨진다(통합 전 불일치 버그를 여기서 흡수).
//   반환: 'guest'(익명·통과) | 'admin'(관리자/교사 세션) | 'self'(토큰 uid 일치) | 'deny'(위조)
export type OwnerScope = 'guest' | 'admin' | 'self' | 'deny';
export async function resolveOwnerScope(
  request: Request, url: URL, env: AuthEnv, uid: string, body?: any,
): Promise<OwnerScope> {
  const u = String(uid || '').trim();
  if (/^guest/i.test(u)) return 'guest';                 // 게스트(추측 불가 랜덤/기본값) → 검증 생략
  const adm = await checkAdminSession(request, env);
  if (adm.ok) return 'admin';                            // 관리자·교사 세션 쿠키
  const authed = await authUidFromRequest(request, url, env, body);
  if (authed && authed === u) return 'self';             // 서명 토큰 uid == 요청 uid
  return 'deny';
}

// ────────────────────────────────────────────────────────────
// 🪪 서버 권위 역할 판정 (민감 API 본인-스코프 강제용)
// ────────────────────────────────────────────────────────────
//   급여·평가 같은 민감 데이터는 "본인만"을 반드시 서버에서 강제해야 한다.
//   (클라이언트 admin.html 의 화면 필터는 개발자도구·직접 API 호출로 우회 가능)
//   이 헬퍼는 현재 세션의 계정명 + 스코프로 권위 있는 role 을 판정해 돌려준다.
export interface AdminActor {
  ok: boolean;
  username: string;
  name: string;     // admin_account.name — 강사면 급여/평가 데이터의 강사명과 매칭에 사용
  role: string;     // teacher | hq | franchise | branch | agency | staff | none
  isTeacher: boolean;
}

export async function getAdminActor(request: Request, env: AuthEnv): Promise<AdminActor> {
  const sess = await checkAdminSession(request, env);
  if (!sess.ok || !sess.username) {
    return { ok: false, username: '', name: '', role: 'none', isTeacher: false };
  }
  let name = '';
  try {
    const acc = await env.DB.prepare(
      `SELECT name FROM admin_account WHERE username = ? LIMIT 1`
    ).bind(sess.username).first<{ name: string }>();
    name = acc?.name || '';
  } catch (e) { console.warn('[auth-admin] getAdminActor name:', (e as any)?.message); }
  let scopeType = 'none';
  try {
    const sc = await getScope(env as any, request);
    scopeType = sc.type;
  } catch (e) { console.warn('[auth-admin] getAdminActor scope:', (e as any)?.message); }
  const rr = resolveRole(scopeType, sess.username, name);
  return { ok: true, username: sess.username, name, role: rr.role, isTeacher: rr.role === 'teacher' };
}

// 강사 계정 name 과 데이터 행의 강사명이 동일인인지(공백·대소문자 무시) 비교.
//   급여/평가 테이블의 teacher_name·korean_name·english_name 등과 매칭할 때 사용.
export function sameTeacherName(a?: string | null, b?: string | null): boolean {
  const na = String(a ?? '').trim().toLowerCase();
  const nb = String(b ?? '').trim().toLowerCase();
  return !!na && na === nb;
}

// ────────────────────────────────────────────────────────────
// 🚪 8개 엔드포인트 디스패처
// ────────────────────────────────────────────────────────────
/* 🔐 로그인 성공 «뒤» — 세션 발급 + 응답 만들기 (2026-08-30 추출)
   ─────────────────────────────────────────────────────────────────────────
   [왜 함수로 뺐나] 비밀번호 로그인 안에 인라인으로 있던 블록이다. 그런데 v4 제안서 06
     (관리자 지문·Face ID 로그인)이 **같은 일**을 해야 한다 — 세션 쿠키·역할 판정·
     첫 화면 경로·언어까지 전부. 그 판정을 한 벌 더 쓰면 「로그인 경로마다 역할이 다른」
     사고가 난다(CLAUDE.md 2장 「로그인 역할 판정 로직이 세 곳에 복제」와 같은 뿌리).
   ⚠️ 본문은 옮기기만 했다 — 한 줄도 고치지 않았다. 비밀번호 경로의 동작은 그대로다.
   ⚠️ `method` 는 «어떻게 로그인했나» 를 로그·응답에 남기기 위한 것이고 판정에는 안 쓴다. */
export async function issueAdminSession(
  env: AuthEnv,
  acctUser: string,
  opts: { remember?: boolean; ip?: string; ua?: string; method?: 'password' | 'passkey' } = {}
): Promise<Response> {
  const remember = !!opts.remember;
  const ip = opts.ip || '';
  const ua = opts.ua || '';
  const now = Date.now();
  const ttl = remember ? SESSION_REMEMBER_MS : SESSION_DEFAULT_MS;
  const token = randomToken(32);
  await env.DB.prepare(
    `INSERT INTO admin_sessions (token, username, ip, user_agent, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(token, acctUser, ip, ua, now, now + ttl, now).run();

  // 🔔 로그인 알림(2026-07-10): 이 계정+IP 조합의 '이전 성공 로그인'이 하나도 없으면
  //   = 낯선 기기/장소에서의 첫 로그인 → 사장님 폰(OWNER_ALERT_PHONE)으로 문자.
  //   recordLogin(성공) 전에 검사해야 현재 로그인이 카운트에 안 섞인다. 실패해도 로그인은 계속.
  try {
    const prior = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM admin_login_history WHERE username = ? AND ip = ? AND success = 1`
    ).bind(acctUser, ip).first<{ n: number }>();
    if ((prior?.n || 0) === 0) {
      const anyEnv = env as any;
      const toPhone = anyEnv.OWNER_ALERT_PHONE;
      if (toPhone) {
        const kst = new Date(now + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
        const text = `[망고아이] 관리자 로그인 알림\n계정: ${acctUser}\n시간: ${kst} (KST)\nIP: ${ip || '알수없음'}\n본인이 아니면 즉시 비밀번호를 변경하세요.`;
        await sendPlainSms(anyEnv, toPhone, text);
      }
    }
  } catch (e) { console.warn('[auth-admin] login alert:', (e as any)?.message); }

  await recordLogin(env, acctUser, ip, ua, true, null);

  // 🪪 로그인 성공 시 서버가 권위 있는 역할을 판정해 응답에 실어 보낸다(2026-07-05).
  //   기존엔 login.html 이 아이디 접두사(hq_t_*)만으로 역할을 '추측'해서, 접두사가 없는
  //   강사 계정(예: 'jeong')이 관리자로 잘못 표시됐다. 여기서 이름+스코프 기반으로 정확히
  //   판정하고, 클라이언트가 쓰기 쉬운 role(hq_teacher 등)로 변환해 내려준다.
  let acctName = '';
  let acctPrefLang = '';
  let acctNationality = '';
  let scopeType = 'none';
  try {
    const acc = await env.DB.prepare(`SELECT name, pref_lang, nationality FROM admin_account WHERE username = ? LIMIT 1`).bind(acctUser).first<{ name: string; pref_lang: string; nationality: string }>();
    acctName = acc?.name || '';
    acctPrefLang = String(acc?.pref_lang || '').toLowerCase();
    acctNationality = String(acc?.nationality || '').trim().toUpperCase();
    const sc = await env.DB.prepare(`SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`).bind(acctUser).first<{ scope_type: string }>();
    if (sc?.scope_type) scopeType = sc.scope_type;
  } catch (e) { console.warn('[auth-admin] login role resolve:', (e as any)?.message); }

  // 🌏 계정에 국적이 없으면 **강사 등록부(teacher_profiles)에서 이름으로 찾아** 한 번 채운다.
  //   등록 폼에서 국적을 받으므로, 그 값이 로그인 계정으로 자동으로 흘러오게 하는 다리다.
  //   한 번 채워지면 다음 로그인부터는 위 SELECT 에서 바로 읽어 이 조회를 건너뛴다.
  if (!acctNationality && acctName) {
    try {
      const tp = await env.DB.prepare(
        `SELECT nationality FROM teacher_profiles
          WHERE nationality IS NOT NULL AND nationality <> ''
            AND (LOWER(TRIM(korean_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(english_name)) = LOWER(TRIM(?)))
          LIMIT 1`
      ).bind(acctName, acctName).first<{ nationality: string }>();
      const nat = String(tp?.nationality || '').trim().toUpperCase();
      if (nat) {
        acctNationality = nat;
        await env.DB.prepare(`UPDATE admin_account SET nationality = ?, updated_at = ? WHERE username = ?`)
          .bind(nat, now, acctUser).run();
      }
    } catch (e) { console.warn('[auth-admin] nationality from teacher_profiles:', (e as any)?.message); }
  }
  const rr = resolveRole(scopeType, acctUser, acctName);
  const isTeacher = rr.role === 'teacher';

  // 🌏 (2026-07-23 사장님 지시) **국적으로 언어를 정한다** — 한국인은 한국어, 외국인은 모두 영어.
  //   판정 순서 (위에서 걸리면 아래는 안 본다):
  //     ① pref_lang — 개인별로 못박은 값. 국적과 무관하게 이게 이긴다(예: 한국인 강사 예외).
  //     ② nationality — 'KR' 이면 ko, 다른 나라면 en. 이게 정식 기준이다.
  //     ③ 아이디 컨벤션 — 국적이 아직 안 들어간 계정용 안전망.
  //        `mangoi_NNN`(실제 강사·해외 스태프) / `hq_t_*`(시연) → en
  //     ④ 이름에 한글이 없으면 en
  //     ⑤ 그 외 → ko
  //   ③④는 국적이 다 채워지면 사실상 안 쓰이지만, 새 계정이 국적 없이 만들어져도
  //   한국어 화면에 갇히지 않도록 남겨 둔다(읽지 못하는 언어로 갇히면 스스로 못 되돌린다).
  //   ⚠️ 화면(adm-lang-boot.js)에도 같은 순서의 폴백이 있다. 한쪽만 고치지 말 것.
  //   ※ 이름 칸에 **직함이 섞여 있다**(`Maimai (본사 매니저)`). 괄호 이후를 잘라 사람 이름만 본다.
  const isForeignStaffId = /^(hq_t|mangoi_)/i.test(acctUser);
  const baseName = acctName.replace(/\s*[(（[【].*$/, '').trim();
  const namedOk = !!baseName && baseName !== acctUser;
  const prefLang: 'en' | 'ko' =
    (acctPrefLang === 'en' || acctPrefLang === 'ko') ? (acctPrefLang as 'en' | 'ko')
    : acctNationality ? (acctNationality === 'KR' ? 'ko' : 'en')
    : (isTeacher || isForeignStaffId) ? 'en'
    : (namedOk && !/[가-힣]/.test(baseName)) ? 'en'
    : 'ko';

  /* 🏠 로그인 뒤 첫 화면 — **서버가 정한다.**
     [왜] 이 판정이 화면 세 곳에 복제돼 있었다(admin/login.html · idx-user-session.js 두 군데).
          필리핀 매니저를 가벼운 화면으로 보내려면 세 곳을 다 고쳐야 하고, 하나만 빠뜨리면
          «어디서 로그인했느냐에 따라 다른 화면» 이 된다. 그래서 정본을 여기 하나로 모은다.
     [왜 필리핀 매니저는 /manager 인가] admin.html 은 gzip 934KB·요청 145개인데, 거기서 부르는
          관리자 API 231개 중 매니저에게 서버가 허용하는 것은 25개(10%)뿐이다. 나머지 90%는
          열어도 403 이다. 못 쓰는 화면을 필리핀 회선으로 받게 할 이유가 없다.
          /manager 는 72KB 이고 결재함 버튼도 이미 거기 있다. **권한은 달라지지 않는다.**
     ⚠️ 화면은 `next` 딥링크가 있으면 그쪽을 우선한다(여기 값은 next 가 없을 때만 쓴다). */
  const homePath =
    isTeacher ? '/teacher'
    : (rr.role === 'branch' || rr.role === 'agency') ? '/manager'
    : PH_MANAGERS.indexOf(acctUser) >= 0 ? '/manager'
    : '/admin.html';

  return json(
    {
      /* 🔤 (2026-08-24) 화면에는 **DB 에 적힌 그대로의 아이디**를 돌려준다 —
         입력한 대소문자를 그대로 주면 화면·저장값이 계정과 어긋난 채로 남는다. */
      ok: true, username: acctUser, expires_at: now + ttl, redirect: '/admin.html',
      home_path: homePath,   // 🏠 화면은 next 가 없을 때 이 값으로 간다
      name: acctName || acctUser,
      server_role: rr.role, role_label: rr.roleLabel, is_teacher: isTeacher,
      // 🪪 (2026-08-09) 화면 어휘의 완전한 신원 — 이제 화면은 «추측하지 않는다».
      //   login.html:216 이 지적한 두 가지 결핍(hq_exec/hq_mgr 구분 · branch_id/agency_id 부재)을
      //   여기서 채운다. 접두사 규칙의 정본은 resolveUiIdentity() 하나뿐이다.
      ...(() => { const ui = resolveUiIdentity(acctUser, acctName, isTeacher);
        return { ui_role: ui.ui_role, branch_id: ui.branch_id, agency_id: ui.agency_id, display_name: ui.display_name }; })(),
      pref_lang: prefLang, nationality: acctNationality || null,
    },
    200,
    { 'Set-Cookie': setSessionCookieHeader(token, Math.floor(ttl / 1000)) }
  );
}

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

      // 🛡️ 브루트포스 차단 (2026-07-10): 같은 IP에서 최근 15분간 로그인 실패가
      //   임계치 이상이면 잠시 차단한다. IP 기준이라 정상 관리자(다른 IP)는 잠기지 않고
      //   비밀번호를 마구 찍어보는 공격자 IP만 막힌다. fail2ban(SSH)과 별개로 '웹 로그인'을 보호.
      //   카운트 조회가 실패하면(가용성 우선) 차단하지 않고 로그인 흐름을 계속 진행한다.
      const LOCK_WINDOW_MS = 15 * 60 * 1000;   // 15분 관찰창
      const LOCK_THRESHOLD = 8;                 // 15분 내 실패 8회 → 차단
      if (ip) {
        try {
          const since = Date.now() - LOCK_WINDOW_MS;
          const cnt = await env.DB.prepare(
            // ⚠️ (2026-08-17) `reason NOT LIKE 'pwreset%'` 를 빼면 안 된다.
            //   비밀번호 찾기도 감사용으로 success=0 행을 남기는데, 그것까지 세면
            //   **코드를 몇 번 받아 본 사람이 로그인 자체를 15분 잠기는** 자충수가 된다
            //   (비번을 잊어서 온 사람에게 정확히 최악). 비번찾기는 자기 카운터로 따로 조인다.
            `SELECT COUNT(*) AS n FROM admin_login_history
              WHERE ip = ? AND success = 0 AND login_at > ?
                AND (reason IS NULL OR reason NOT LIKE 'pwreset%')`
          ).bind(ip, since).first<{ n: number }>();
          if ((cnt?.n || 0) >= LOCK_THRESHOLD) {
            await recordLogin(env, username, ip, ua, false, 'locked_bruteforce');
            return json(
              { ok: false, error: 'too_many_attempts', message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.' },
              429
            );
          }
        } catch (e) { console.warn('[auth-admin] bruteforce check:', (e as any)?.message); }
      }

      /* 🔤 (2026-08-24 사장님 지시) 아이디의 **대소문자를 무시한다.**
       *
       *  [무엇이 문제였나] `admin_account.username` 은 `TEXT NOT NULL UNIQUE` — COLLATE NOCASE 가
       *    없어 SQLite 가 대소문자를 «다른 값» 으로 본다. 그런데 이 조회가 못 찾으면 아래
       *    «옛 LMS 통과 인증» 이 그 자리에서 **새 계정을 만든다**(입력한 글자 그대로).
       *    → 휴대폰 키보드의 자동 대문자 한 번에 계정이 두 벌이 된다.
       *    실측(2026-08-24): `mangoi_167`(7/30, HANNAH 연결됨) 과 `Mangoi_167`(8/24, 연결 안 됨)
       *    이 나란히 존재했고, 정작 쓰는 쪽이 연결이 없어 강사 화면이 «수업 없음» 이었다.
       *    출근·급여가 계정 단위라 기록도 두 갈래로 쪼개진다.
       *
       *  [규칙] ① 정확일치를 **먼저** 본다  ② 없으면 대소문자만 다른 후보를 본다
       *    ⚠️ ①이 핵심이다. NOCASE 하나로만 찾으면 이미 존재하는 두 계정 중 아무거나 골라
       *       «어제까지 되던 사람» 의 비밀번호가 갑자기 안 맞게 된다.
       *    ⚠️ 후보마다 비밀번호를 대 본다 — 대소문자가 갈린 두 계정에 서로 다른 비번이
       *       걸려 있을 수 있어서다(그 경우 한쪽이 잠기면 안 된다). 비번 해시는 SHA-256
       *       한 번이라(hashPassword) 몇 개를 대 봐도 부담이 없다.
       *    ⚠️ «계정이 없다»(→ 옛 LMS 폴백) 와 «있는데 비번이 틀리다»(→ 401) 의 구분은
       *       그대로 지킨다. 후보가 하나라도 있으면 폴백하지 않는다 —
       *       그래야 새 계정이 더 생기지 않는다(이 고침의 목적).
       *  ⛔ 스키마를 COLLATE NOCASE 로 바꾸는 방식은 쓰지 않았다. 이미 대소문자만 다른 행이
       *     실재해서 UNIQUE 제약에 걸리고, 표를 다시 만들어야 한다(운영 DB 라 반경이 크다). */
      const cands = await env.DB.prepare(
        `SELECT username, password_hash FROM admin_account
          WHERE username = ? COLLATE NOCASE
          ORDER BY (username = ?) DESC, id ASC LIMIT 5`
      ).bind(username, username).all<{ username: string; password_hash: string }>();
      const candRows = (cands?.results || []) as { username: string; password_hash: string }[];
      let row: { username: string; password_hash: string } | null = null;
      for (const c of candRows) {
        if (await verifyPassword(password, c.password_hash)) { row = c; break; }
      }
      /* 🪪 이후 모든 조회·기록은 **DB 에 적힌 그대로의 아이디**를 쓴다(입력값이 아니라).
         세션·2FA·스코프·연결표가 전부 username 을 열쇠로 쓰므로, 여기서 통일하지 않으면
         대소문자가 갈린 채로 아래로 흘러 같은 문제가 다시 생긴다. */
      const acctUser = row ? String(row.username) : (candRows[0] ? String(candRows[0].username) : username);

      // 🧑‍🏫 (2026-07-27 사장님 지시) 강사 "기존 아이디·비밀번호" 통과 인증 + 최초 로그인 자동 이관.
      //   새 시스템에 계정이 **없을 때만** 옛 카페24 LMS 로 대신 로그인해 보고, 통과하면
      //   그 자리에서 강사 계정을 만든다. 강사는 아무것도 바꾸지 않고 쓰던 아이디/비번 그대로.
      //   두 번째 로그인부터는 이 블록을 타지 않는다(계정이 생겼으므로) = 옛 서버 의존 1회뿐.
      //   ⚠️ 이미 계정이 있는데 비번이 틀린 경우는 폴백하지 않는다 — 새 시스템에서 비번을
      //      바꾼 사람이 옛 비번으로 다시 들어가지는 못해야 하기 때문(비번 변경이 무의미해짐).
      if (!row && candRows.length) {
        // 계정은 있다(대소문자 무시). 비번만 틀렸으므로 옛 LMS 로 폴백하지 않는다.
        await recordLogin(env, acctUser, ip, ua, false, 'wrong_password');
        return json({ ok: false, error: 'invalid_credentials' }, 401);
      }
      if (!row) {
        if (!legacyLoginEnabled(env as any)) {
          await recordLogin(env, username, ip, ua, false, 'unknown_user');
          return json({ ok: false, error: 'invalid_credentials' }, 401);
        }
        const legacy = await verifyLegacyLmsLogin(env as any, username, password);
        if (!legacy.ok) {
          await recordLogin(env, username, ip, ua, false, 'unknown_user:' + legacy.reason);
          return json({ ok: false, error: 'invalid_credentials' }, 401);
        }
        // 카페24 강사 명부에서 실제 이름을 찾아 계정에 심는다(마이페이지 급여·평가가 이름 매칭).
        const info = await lookupTeacherByLoginId(env as any, username);
        const newHash = await hashPassword(password);
        try {
          await provisionTeacherAccount(env as any, username, newHash, info);
        } catch (e: any) {
          console.warn('[auth-admin] 강사 계정 자동 생성 실패:', e?.message || e);
          await recordLogin(env, username, ip, ua, false, 'legacy_provision_failed');
          return json({ ok: false, error: 'provision_failed', message: '계정 생성 중 오류가 발생했습니다. 관리자에게 문의해 주세요.', message_en: 'Could not create your account. Please contact the office.' }, 500);
        }
        console.log(`[auth-admin] 옛 LMS 통과 인증 → 강사 계정 자동 생성: ${username} (명부매칭=${info.matched})`);
      }
      // (비밀번호 검증은 위 후보 루프에서 이미 끝났다 — 여기서 다시 하지 않는다)

      // 🔐 2단계 인증(2FA): 이 계정이 2FA 를 켰다면 비번 통과만으로는 로그인 불가.
      //   비번은 맞았지만 코드가 없으면 need_2fa 로 '코드 입력 단계'를 요청(실패로 기록 안 함).
      //   코드가 틀리면 실패로 기록(브루트포스 카운트에 포함) 후 401.
      // 🔧 (2026-07-14 사장님 지시) 관리자 테스트 기간 동안 2FA 임시 중단.
      //   wrangler.toml [vars] ADMIN_2FA_DISABLED="true" 이면 코드 검증을 건너뛴다(아이디+비번만).
      //   ⚠️ 테스트 종료 후 반드시 "false" 로 되돌릴 것 — 켜두면 인증 앱 없이 로그인 가능.
      //   per-user admin_2fa 데이터는 그대로 보존되므로 플래그만 끄면 즉시 원복.
      const twoFaDisabled = String((env as any).ADMIN_2FA_DISABLED || '').toLowerCase() === 'true';
      const twofa = twoFaDisabled ? null : await env.DB.prepare(
        `SELECT secret, enabled FROM admin_2fa WHERE username = ? LIMIT 1`
      ).bind(acctUser).first<{ secret: string; enabled: number }>();
      if (twofa && twofa.enabled) {
        const code = String(body?.code || body?.otp || '').trim();
        if (!code) {
          return json({ ok: false, need_2fa: true, message: '인증 앱의 6자리 코드를 입력해 주세요.' }, 200);
        }
        const codeOk = await verifyTOTP(twofa.secret, code, Date.now());
        if (!codeOk) {
          await recordLogin(env, acctUser, ip, ua, false, 'wrong_2fa');
          return json({ ok: false, error: 'invalid_2fa', message: '인증 코드가 올바르지 않습니다.' }, 401);
        }
      }

      return await issueAdminSession(env, acctUser, { remember, ip, ua, method: 'password' });
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

    // ── 🔑 비밀번호 찾기(셀프 재설정) — 2026-08-17 ──
    //   왜 만들었나: 비번을 잊으면 «운영자에게 메일» 뿐이었다. 로그인 화면의 «비밀번호 찾기» 는
    //   보내지도 않은 임시비번을 보냈다고 말하던 시연 껍데기였고 같은 날 걷어냈다(adm-q12).
    //   모양은 학생용 `/api/student/password-reset/*` 과 맞춘다 — 코드 10분·검증 5회·발송 1시간 3회.
    //
    //   ⚠️ 관리자 계정은 학생 계정보다 권한이 크다. 그래서 세 가지를 더 조인다:
    //     ① **등록된 연락처가 있는 계정만.** 없으면 임시비번을 만들어 주지 않고 운영자 문의로 보낸다
    //        (여기서 «없으면 대충 만들어 준다» 를 하면 비번찾기가 곧 계정탈취 경로가 된다)
    //     ② 2FA 를 켠 계정은 코드 확인 때 **TOTP 도 함께** 요구 — 문자 한 통으로 2FA 를 우회하지 못하게
    //     ③ 전체권한 계정(admin·cfo·ops_lead)이 이 경로로 비번을 바꾸면 **사장님 폰으로 알림**
    //
    //   ⚠️ 응답은 **아이디 존재 여부를 흘리지 않는다.** 모르는 아이디든, 연락처가 없든, 정상 발송이든
    //      전부 같은 문구·같은 200 을 준다(계정 열거 방지). 대신 문구에 「안 오면 운영자 문의」를 적어
    //      사용자가 막히지 않게 한다. 마스킹된 번호도 주지 않는다 — 그것 자체가 존재 신호다.
    const ensureAdminPwReset = async () => {
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS admin_pw_reset (
           username TEXT PRIMARY KEY,
           code_hash TEXT,
           expires_at INTEGER,
           attempts INTEGER DEFAULT 0,
           sent_count INTEGER DEFAULT 0,
           first_sent_at INTEGER,
           created_at INTEGER
         )`
      ).run().catch(() => {});
    };

    if (path === '/api/admin/password-reset/request' && method === 'POST') {
      await ensureAdminPwReset();
      let body: any;
      try { body = await request.json(); } catch { body = null; }
      const username = String(body?.username || '').trim();
      const ip = request.headers.get('cf-connecting-ip') || '';
      const now = Date.now();
      // 어떤 갈래로 끝나든 사용자에게는 이 문구 하나만 나간다(존재 여부 비노출).
      const GENERIC = {
        ok: true,
        message: '등록된 연락처로 인증번호를 보냈습니다. (10분 유효)\n문자·메일이 오지 않으면 등록된 연락처가 없는 경우입니다 — 운영자(navy111p@gmail.com)에게 문의해 주세요.',
        message_en: 'If that account has a registered contact, a code has been sent (valid 10 minutes).\nIf nothing arrives, no contact is on file — please contact the office (navy111p@gmail.com).',
      };
      if (!username) return json({ ok: false, error: 'username_required' }, 400);

      // 같은 IP 에서 무차별로 긁는 것 차단 — 아이디를 바꿔 가며 두드리는 경우까지 잡는다.
      try {
        const ipCnt = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM admin_login_history WHERE ip = ? AND reason LIKE 'pwreset_req%' AND login_at > ?`
        ).bind(ip, now - 3600 * 1000).first<{ n: number }>();
        if (ip && (ipCnt?.n || 0) >= 10) {
          return json({ ok: false, error: 'too_many_requests',
            message: '요청이 너무 잦습니다. 1시간 후 다시 시도해 주세요.',
            message_en: 'Too many requests. Please try again in an hour.' }, 429);
        }
      } catch { /* 집계 실패 시 가용성 우선 — 계속 진행 */ }
      await recordLogin(env, username, ip, request.headers.get('user-agent') || '', false, 'pwreset_req').catch(() => {});

      // 로그인(:1155 부근)과 같은 규칙 — 정확일치 우선 + NOCASE 보조. 폰 키보드 첫 글자
      // 대문자(Mangoi_167 사고)로 로그인은 되는데 비번찾기만 «조용히» 실패하던 것.
      // 이후 로직은 전부 acct.username(DB 표기)을 쓴다.
      const acct = await env.DB.prepare(
        `SELECT username, name, phone, email, nationality FROM admin_account
          WHERE username = ? COLLATE NOCASE ORDER BY (username = ?) DESC LIMIT 1`
      ).bind(username, username).first<{ username: string; name: string | null; phone: string | null; email: string | null; nationality: string | null }>();
      if (!acct) return json(GENERIC);

      const contact = pickResetContact(acct);
      if (!contact.phone && !contact.email) return json(GENERIC);

      // 계정당 1시간 3회
      const prev: any = await env.DB.prepare(`SELECT * FROM admin_pw_reset WHERE username = ?`).bind(acct.username).first().catch(() => null);
      let sentCount = 0, firstSentAt = now;
      if (prev && prev.first_sent_at && now - Number(prev.first_sent_at) < 3600 * 1000) {
        sentCount = Number(prev.sent_count) || 0; firstSentAt = Number(prev.first_sent_at);
        if (sentCount >= 3) {
          return json({ ok: false, error: 'too_many_requests',
            message: '인증번호 요청이 너무 잦습니다. 1시간 후 다시 시도해 주세요.',
            message_en: 'Too many code requests. Please try again in an hour.' }, 429);
        }
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await hashPassword('adminpwreset|' + acct.username + '|' + code, 'adminpwreset');
      await env.DB.prepare(
        `INSERT INTO admin_pw_reset (username, code_hash, expires_at, attempts, sent_count, first_sent_at, created_at)
         VALUES (?,?,?,0,?,?,?)
         ON CONFLICT(username) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at,
           attempts=0, sent_count=excluded.sent_count, first_sent_at=excluded.first_sent_at, created_at=excluded.created_at`
      ).bind(acct.username, codeHash, now + 10 * 60000, sentCount + 1, firstSentAt, now).run();

      // 문자를 먼저, 안 되면 메일. 둘 다 실패해도 응답 문구는 같다(존재 비노출).
      let delivered = false;
      if (contact.phone) {
        const sms = await sendPlainSms(
          env as any, contact.phone,
          `[망고아이] 관리자 비밀번호 재설정 인증번호는 [${code}] 입니다. 10분 안에 입력해 주세요.`,
          contact.country ? { country: contact.country } : undefined
        ).catch(() => null);
        if (sms && sms.ok) delivered = true;
      }
      if (!delivered && contact.email && getEmailMode(env as any) === 'real') {
        const r = await sendEmail(env as any, {
          to: contact.email,
          subject: '[망고아이] 관리자 비밀번호 재설정 인증번호',
          html: emailLayout({
            title: '비밀번호 재설정 인증번호',
            bodyHtml:
              `<p>아래 6자리 인증번호를 재설정 화면에 입력해 주세요. <b>10분간</b> 유효합니다.</p>` +
              `<p style="font-size:28px;font-weight:800;letter-spacing:6px;margin:18px 0">${code}</p>` +
              `<p style="color:#64748b;font-size:13px">본인이 요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 그대로 유지됩니다.</p>`,
          }),
        }).catch(() => null);
        if (r && r.ok) delivered = true;
      }
      if (!delivered) console.warn('[auth-admin] pwreset 발송 실패:', acct.username);
      return json(GENERIC);
    }

    if (path === '/api/admin/password-reset/confirm' && method === 'POST') {
      await ensureAdminPwReset();
      let body: any;
      try { body = await request.json(); } catch { body = null; }
      const username = String(body?.username || '').trim();
      const code = String(body?.code || '').trim();
      const next = String(body?.new_password || '');
      const otp = String(body?.code_2fa || body?.otp || '').trim();
      const ip = request.headers.get('cf-connecting-ip') || '';
      const ua = request.headers.get('user-agent') || '';
      const now = Date.now();

      if (!username || !code) return json({ ok: false, error: 'missing_fields',
        message: '아이디와 인증번호를 입력해 주세요.', message_en: 'Enter your ID and the code.' }, 400);
      if (!next || next.length < 6) return json({ ok: false, error: 'too_short',
        message: '새 비밀번호는 6자 이상이어야 합니다.', message_en: 'New password must be at least 6 characters.' }, 400);

      // 코드 오류 문구도 한 가지로 통일 — 「아이디는 맞는데 코드가 틀림」을 구분해 주지 않는다.
      const BAD = { ok: false, error: 'invalid_code',
        message: '인증번호가 올바르지 않거나 만료됐습니다. 다시 요청해 주세요.',
        message_en: 'The code is wrong or expired. Please request a new one.' };

      // 요청 단계와 같은 규칙(정확일치 우선 + NOCASE) — 갈리면 코드가 영영 안 맞는다.
      const acct = await env.DB.prepare(
        `SELECT username FROM admin_account
          WHERE username = ? COLLATE NOCASE ORDER BY (username = ?) DESC LIMIT 1`
      ).bind(username, username).first<{ username: string }>();
      if (!acct) return json(BAD, 401);

      const row: any = await env.DB.prepare(`SELECT * FROM admin_pw_reset WHERE username = ?`).bind(acct.username).first().catch(() => null);
      if (!row || !row.code_hash || now > Number(row.expires_at || 0)) return json(BAD, 401);
      if (Number(row.attempts || 0) >= 5) {
        return json({ ok: false, error: 'too_many_attempts',
          message: '시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.',
          message_en: 'Too many attempts. Please request a new code.' }, 429);
      }
      const codeHash = await hashPassword('adminpwreset|' + acct.username + '|' + code, 'adminpwreset');
      if (codeHash !== row.code_hash) {
        await env.DB.prepare(`UPDATE admin_pw_reset SET attempts = attempts + 1 WHERE username = ?`).bind(acct.username).run().catch(() => {});
        await recordLogin(env, acct.username, ip, ua, false, 'pwreset_bad_code').catch(() => {});
        return json(BAD, 401);
      }

      // 2FA 를 켠 계정은 문자 코드만으로 통과시키지 않는다.
      const twoFaDisabled = String((env as any).ADMIN_2FA_DISABLED || '').toLowerCase() === 'true';
      const twofa = twoFaDisabled ? null : await env.DB.prepare(
        `SELECT secret, enabled FROM admin_2fa WHERE username = ? LIMIT 1`
      ).bind(acct.username).first<{ secret: string; enabled: number }>();
      if (twofa && twofa.enabled) {
        if (!otp) {
          return json({ ok: false, need_2fa: true,
            message: '인증 앱의 6자리 코드도 입력해 주세요.',
            message_en: 'Also enter the 6-digit code from your authenticator app.' }, 200);
        }
        if (!(await verifyTOTP(twofa.secret, otp, now))) {
          await recordLogin(env, acct.username, ip, ua, false, 'pwreset_bad_2fa').catch(() => {});
          return json({ ok: false, error: 'invalid_2fa',
            message: '인증 코드가 올바르지 않습니다.', message_en: 'That authenticator code is not valid.' }, 401);
        }
      }

      await env.DB.prepare(
        `UPDATE admin_account SET password_hash = ?, updated_at = ? WHERE username = ?`
      ).bind(await hashPassword(next), now, acct.username).run();
      // 분실·유출 대응의 핵심 — 이 계정의 기존 세션을 전부 끊는다.
      await env.DB.prepare(`DELETE FROM admin_sessions WHERE username = ?`).bind(acct.username).run().catch(() => {});
      await env.DB.prepare(`DELETE FROM admin_pw_reset WHERE username = ?`).bind(acct.username).run().catch(() => {});
      await recordLogin(env, acct.username, ip, ua, true, 'pwreset_done').catch(() => {});

      // 전체권한 계정이 이 경로로 바뀌면 사장님이 즉시 알아야 한다.
      if (FULL_ACCESS_ACCOUNTS.has(acct.username)) {
        const toPhone = (env as any).OWNER_ALERT_PHONE;
        if (toPhone) {
          await sendPlainSms(env as any, String(toPhone),
            `[망고아이] 전체권한 계정 '${acct.username}' 의 비밀번호가 «비밀번호 찾기» 로 재설정됐습니다. 본인이 아니면 즉시 확인해 주세요.`
          ).catch(() => {});
        }
      }

      return json({ ok: true,
        message: '비밀번호가 변경됐습니다. 새 비밀번호로 로그인해 주세요.',
        message_en: 'Password changed. Please sign in with the new password.' });
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
      // 👥 본인에게 «다른 계정» 이 있으면 알려 준다(SAME_PERSON_ACCOUNTS 주석 참고).
      //    인증을 통과한 뒤라 본인에게만 보인다. 없으면 null 이라 화면은 아무것도 안 그린다.
      return json({ ok: true, user: row || null, role, roleLabel, scope, also_account: otherAccountOf(me) });
    }

    // ── 프로필 업데이트 ──
    if (path === '/api/admin/profile' && method === 'POST') {
      let body: any;
      try { body = await request.json(); } catch { body = null; }
      if (!body) return json({ ok: false, error: 'invalid_body' }, 400);
      // ⚠️ (2026-08-17) 예전에는 name·email·phone 셋을 **항상 함께** 덮어썼다. 그래서 이름만
      //   보내는 화면이 있으면 그 계정의 연락처가 조용히 NULL 로 지워졌다. 비번찾기가 연락처를
      //   근거로 도는 지금은 그게 곧 «계정이 복구 불능이 되는» 사고다 → 보낸 칸만 고친다.
      const sets: string[] = [];
      const vals: any[] = [];
      if (body.name  != null) { sets.push('name = ?');  vals.push(String(body.name).slice(0, 50)); }
      if (body.email != null) { sets.push('email = ?'); vals.push(String(body.email).trim().slice(0, 100)); }
      if (body.phone != null) { sets.push('phone = ?'); vals.push(String(body.phone).trim().slice(0, 30)); }
      if (!sets.length) return json({ ok: false, error: 'nothing_to_update' }, 400);
      sets.push('updated_at = ?'); vals.push(Date.now());
      vals.push(me);
      await env.DB.prepare(`UPDATE admin_account SET ${sets.join(', ')} WHERE username = ?`).bind(...vals).run();
      return json({ ok: true });
    }

    // ── 🔑 강사·직원 비밀번호 재설정 (관리자가 남의 계정을 바꿔 준다) ──
    //   왜 필요한가: 지금까지는 `change-password`(본인이 현재 비번을 알아야 함) 뿐이라,
    //   강사가 비번을 잊으면 아무도 풀어줄 수 없었다. 실제로 hq_t_001 이 그렇게 막혔다.
    //   ⚠️ 보안 설계 — 남의 비번을 바꾸는 API 라 게이트를 좁게 잡는다:
    //     · 경영진(hq)·본사 관리자(staff) 만. **강사·지사·대리점·프랜차이즈는 금지.**
    //       (강사가 다른 강사 비번을 바꾸면 그 사람 급여·평가 화면을 열 수 있다)
    //     · 대상도 강사/해외 스태프 계정(`mangoi_*` · `hq_t*`)으로 한정 —
    //       admin·cfo·ops_lead 같은 전체권한 계정은 이 경로로 못 바꾼다(권한 상승 차단).
    //     · 누가 언제 누구 것을 바꿨는지 admin_login_history 에 남긴다.
    // ── ➕ 직원 계정 «진짜» 만들기 (2026-08-18) ──────────────────────────────
    //
    //   왜 만들었나 — 관리자 화면의 「➕ 본사 직원 등록」은 **시연용 껍데기였다.**
    //     adm-core.js 의 registerHqEmployee() 가 입력값을 localStorage 에만 넣고
    //     「✅ 등록 완료」 알림을 띄웠다. 서버로는 아무것도 보내지 않았다.
    //     그래서 «등록했는데 로그인이 안 되는» 계정이 만들어졌다(2026-08-18 실제로 밟음).
    //     CLAUDE.md 에 기록된 「비밀번호 변경 시연 껍데기 4벌」과 같은 종류다.
    //   더 근본적으로는, **직원 계정을 사람이 만드는 통로가 서버에 아예 없었다.**
    //     admin_account 에 INSERT 하는 곳은 부트스트랩·데모시드·강사 자동생성 셋뿐이었다.
    //     지금까지는 계정이 필요하면 코드에 심어서 배포해 왔다는 뜻이다.
    //
    //   설계 판단
    //     ① **비밀번호를 사람이 정하지 않는다.** 서버가 임시 비번을 만들어 한 번만 돌려준다.
    //        사람이 정하게 하면 «1234» 가 들어오고, 그 계정이 회사 데이터 전체를 연다.
    //     ② 응답에 담긴 임시 비번은 **그 화면에서 한 번만 보인다.** 저장하지 않는다
    //        (해시만 DB 에 남는다). 잃어버리면 비번 재설정으로 다시 만든다.
    //     ③ 권한 상승 차단 — 전체권한 계정(admin·cfo·ops_lead) 이름으로는 만들 수 없다.
    //     ④ 아이디 접두사와 직급이 어긋나면 **막는다.** `hq_t*` 는 resolveRole() 이
    //        무조건 강사로 판정한다 — 관리자로 만들었는데 강사 화면으로 튕기는 사고가 난다.
    if (path === '/api/admin/staff-create' && method === 'POST') {
      const actor = await getAdminActor(request, env);
      if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
      if (actor.isTeacher || !(actor.role === 'hq' || actor.role === 'staff')) {
        return json({ ok: false, error: 'forbidden',
          message: '경영진·본사 관리자만 계정을 만들 수 있습니다.',
          message_en: 'Only executives and head-office admins can create accounts.' }, 403);
      }

      let body: any;
      try { body = await request.json(); } catch { body = null; }
      const username = String(body?.username || '').trim();
      const name     = String(body?.name || '').trim();
      const rank     = String(body?.rank || 'hq_mgr').trim();
      const email    = String(body?.email || '').trim() || null;
      const phone    = String(body?.phone || '').trim() || null;

      const RANKS = ['hq_exec', 'hq_mgr', 'hq_teacher'];
      if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
        return json({ ok: false, error: 'bad_username',
          message: '아이디는 영문·숫자·밑줄(_)로 3~32자여야 합니다.' }, 400);
      }
      if (!name) return json({ ok: false, error: 'name_required', message: '이름을 입력하세요.' }, 400);
      if (RANKS.indexOf(rank) < 0) return json({ ok: false, error: 'bad_rank', allowed: RANKS }, 400);

      // 권한 상승 차단 — 전체권한 계정 이름을 새로 만들 수 없다.
      if (FULL_ACCESS_ACCOUNTS.has(username)) {
        return json({ ok: false, error: 'reserved_username',
          message: '이 아이디는 시스템 전체권한 계정이라 새로 만들 수 없습니다.' }, 403);
      }

      // 접두사 ↔ 직급 불일치 차단. `hq_t*` 는 역할 판정이 무조건 «강사» 다.
      const looksTeacherId = /^hq_t/i.test(username);
      if (looksTeacherId && rank !== 'hq_teacher') {
        return json({ ok: false, error: 'prefix_rank_mismatch',
          message: '아이디가 hq_t 로 시작하면 시스템이 항상 «교사»로 판정합니다. ' +
                   '관리자·경영진으로 만들려면 다른 아이디를 쓰세요.' }, 400);
      }
      if (!looksTeacherId && rank === 'hq_teacher') {
        return json({ ok: false, error: 'prefix_rank_mismatch',
          message: '교사 계정은 아이디를 hq_t 로 시작해야 합니다(예: hq_t_kim).' }, 400);
      }

      // ⚠️ 이름에 «교사·강사·선생» 이 들어가면 resolveRole() 이 교사로 판정한다.
      //    막지는 않되(진짜 그런 성함일 수 있다) 만든 사람에게 반드시 알린다.
      const nameLooksTeacher = /교사|강사|선생|teacher/i.test(name);
      if (nameLooksTeacher && rank !== 'hq_teacher') {
        return json({ ok: false, error: 'name_looks_teacher',
          message: '이름에 «교사·강사·선생» 이 들어가면 시스템이 그 계정을 교사로 판정해 ' +
                   '강사 화면으로 보냅니다. 이름을 바꾸거나 직급을 교사로 선택하세요.' }, 400);
      }

      /* 🔤 (2026-08-24) 중복 검사도 **대소문자를 무시**한다 — 로그인이 무시하므로
         `mangoi_167` 이 있는데 `Mangoi_167` 을 새로 만들면 «둘 중 아무나 열리는» 계정이 된다.
         무엇과 부딪혔는지 그대로 알려 준다(대소문자만 다르면 사람이 눈으로 못 찾는다). */
      const dup = await env.DB.prepare(
        `SELECT username FROM admin_account WHERE username = ? COLLATE NOCASE LIMIT 1`
      ).bind(username).first<{ username: string }>();
      if (dup) {
        const sameWord = String(dup.username) !== username;
        return json({ ok: false, error: 'already_exists',
          message: sameWord
            ? `이미 «${dup.username}» 가 있습니다(대소문자만 다릅니다). 로그인은 대소문자를 구분하지 않으니 다른 아이디를 쓰세요.`
            : '이미 있는 아이디입니다. 다른 아이디를 쓰세요.',
          existing: dup.username }, 409);
      }

      // 임시 비번 — 사람이 옮겨 적을 수 있게 헷갈리는 글자(0/O, 1/l/I)를 뺀다.
      const ALPHA = 'abcdefghijkmnpqrstuvwxyz23456789';
      const rnd = crypto.getRandomValues(new Uint8Array(12));
      let tempPw = '';
      for (let i = 0; i < rnd.length; i++) tempPw += ALPHA[rnd[i] % ALPHA.length];
      tempPw = tempPw.slice(0, 4) + '-' + tempPw.slice(4, 8) + '-' + tempPw.slice(8, 12);

      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO admin_account (username, password_hash, name, email, phone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(username, await hashPassword(tempPw), name, email, phone, now, now).run();

      // 역할 스코프 — 이게 없으면 autoSeedOne() 의 추측에 맡겨진다.
      await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS admin_scope (username TEXT PRIMARY KEY, scope_type TEXT NOT NULL, scope_value TEXT, updated_at INTEGER);`
      ).catch(() => { /* 이미 있으면 정상 */ });
      const scopeType = (rank === 'hq_teacher') ? 'teacher' : 'hq';
      await env.DB.prepare(
        `INSERT INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES (?, ?, NULL, ?)
         ON CONFLICT(username) DO UPDATE SET scope_type=excluded.scope_type, updated_at=excluded.updated_at`
      ).bind(username, scopeType, now).run().catch(() => null);

      // 감사 기록 — «누가 이 계정을 만들었는가» 가 남아야 한다.
      const cIp = request.headers.get('cf-connecting-ip') || '';
      const cUa = request.headers.get('user-agent') || '';
      await recordLogin(env, username, cIp, cUa, true, 'created_by:' + actor.username).catch(() => {});

      return json({
        ok: true, username, name, rank, scope_type: scopeType,
        temp_password: tempPw,
        message: '계정을 만들었습니다. 아래 임시 비밀번호는 지금 이 화면에서만 보입니다 — ' +
                 '본인에게 전달하고, 로그인 후 마이페이지에서 바꾸게 하세요.',
      });
    }

    if (path === '/api/admin/staff-password-reset' && method === 'POST') {
      const actor = await getAdminActor(request, env);
      if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
      if (actor.isTeacher || !(actor.role === 'hq' || actor.role === 'staff')) {
        return json({ ok: false, error: 'forbidden',
          message: '경영진·본사 관리자만 사용할 수 있습니다.',
          message_en: 'Only executives and head-office admins can do this.' }, 403);
      }
      let body: any;
      try { body = await request.json(); } catch { body = null; }
      const target = String(body?.username || '').trim();
      const next   = String(body?.new_password || '');
      if (!target || !next) return json({ ok: false, error: 'missing_fields' }, 400);
      if (next.length < 6) {
        return json({ ok: false, error: 'too_short',
          message: '비밀번호는 6자 이상이어야 합니다.',
          message_en: 'Password must be at least 6 characters.' }, 400);
      }
      if (!/^(mangoi_|hq_t)/i.test(target)) {
        return json({ ok: false, error: 'target_not_allowed',
          message: '강사·해외 스태프 계정(mangoi_*, hq_t*)만 재설정할 수 있습니다.',
          message_en: 'Only teacher / overseas staff accounts (mangoi_*, hq_t*) can be reset here.' }, 403);
      }
      // 정확일치 우선 + NOCASE — 찾은 뒤에는 반드시 DB 표기(trow.username)로 쓴다.
      // 입력 표기로 UPDATE 하면 «0건 갱신인데 에러도 없는» 반쪽이 된다(set-password 전례).
      const trow = await env.DB.prepare(
        `SELECT username FROM admin_account
          WHERE username = ? COLLATE NOCASE ORDER BY (username = ?) DESC LIMIT 1`
      ).bind(target, target).first<{ username: string }>();
      if (!trow) {
        return json({ ok: false, error: 'unknown_user',
          message: '그런 계정이 없습니다.', message_en: 'No such account.' }, 404);
      }
      await env.DB.prepare(
        `UPDATE admin_account SET password_hash = ?, updated_at = ? WHERE username = ?`
      ).bind(await hashPassword(next), Date.now(), trow.username).run();
      // 재설정 후에는 그 계정의 기존 로그인 세션을 모두 끊는다(분실·유출 대응의 핵심).
      await env.DB.prepare(`DELETE FROM admin_sessions WHERE username = ?`).bind(trow.username).run().catch(() => {});
      // 감사 기록 — 대상 계정 이력에 "누가 재설정했는지" 를 남긴다.
      const rIp = request.headers.get('cf-connecting-ip') || '';
      const rUa = request.headers.get('user-agent') || '';
      await recordLogin(env, trow.username, rIp, rUa, true, 'password_reset_by:' + actor.username).catch(() => {});
      return json({ ok: true, username: trow.username,
        message: '비밀번호를 재설정했습니다. 기존 로그인은 모두 해제됐습니다.',
        message_en: 'Password reset. All existing sessions for this account were signed out.' });
    }

    // ── 📇 복구 연락처 채우기 (본사가 직원·강사 대신 입력) — 2026-08-17 ──
    //   왜 필요한가: 비번찾기를 만들어 놔도 **연락처가 없으면 아무도 못 쓴다.**
    //   실제로 2026-08-17 기준 관리자 계정 47개 중 45개에 쓸 수 있는 연락처가 없었다
    //   (email 칸에 아이디가 그대로 들어간 행 포함). 그래서 「채우는 절차」를 함께 넣는다.
    //   ⚠️ 게이트는 staff-password-reset 과 같은 이유로 좁게 잡는다 — 남의 연락처를 바꾸는 것은
    //      곧 «그 계정의 비번찾기를 내 폰으로 돌리는 것» 이라 비번 재설정과 같은 급의 권한이다.
    //      · 경영진(hq)·본사 관리자(staff) 만
    //      · 전체권한 계정(admin·cfo·ops_lead)은 **대상이 될 수 없다**(권한 상승 차단).
    //        그 계정들의 연락처는 본인이 마이페이지에서 직접 넣어야 한다.
    if (path === '/api/admin/contacts-missing' && method === 'GET') {
      const actor = await getAdminActor(request, env);
      if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
      if (actor.isTeacher || !(actor.role === 'hq' || actor.role === 'staff')) {
        return json({ ok: false, error: 'forbidden' }, 403);
      }
      const rows = await env.DB.prepare(
        `SELECT username, name, phone, email, nationality FROM admin_account ORDER BY username`
      ).all<{ username: string; name: string | null; phone: string | null; email: string | null; nationality: string | null }>();
      const list = (rows.results || []).map(r => {
        const c = pickResetContact(r);
        return {
          username: r.username, name: r.name, nationality: r.nationality,
          phone: r.phone || '', email: r.email || '',
          has_phone: !!c.phone, has_email: !!c.email,
          recoverable: !!(c.phone || c.email),
          // 전체권한 계정은 이 화면에서 못 고친다는 것을 목록에서부터 알려 준다.
          self_only: FULL_ACCESS_ACCOUNTS.has(r.username),
        };
      });
      return json({ ok: true, total: list.length,
        missing: list.filter(x => !x.recoverable).length, accounts: list });
    }

    if (path === '/api/admin/staff-contact' && method === 'POST') {
      const actor = await getAdminActor(request, env);
      if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
      if (actor.isTeacher || !(actor.role === 'hq' || actor.role === 'staff')) {
        return json({ ok: false, error: 'forbidden',
          message: '경영진·본사 관리자만 사용할 수 있습니다.',
          message_en: 'Only executives and head-office admins can do this.' }, 403);
      }
      let body: any;
      try { body = await request.json(); } catch { body = null; }
      const target = String(body?.username || '').trim();
      if (!target) return json({ ok: false, error: 'missing_fields' }, 400);
      if (FULL_ACCESS_ACCOUNTS.has(target)) {
        return json({ ok: false, error: 'target_not_allowed',
          message: '전체권한 계정의 연락처는 본인이 마이페이지에서 직접 등록해야 합니다.',
          message_en: 'Full-access accounts must set their own contact from My Page.' }, 403);
      }
      // 정확일치 우선 + NOCASE — 아래 UPDATE/조회는 전부 DB 표기(trow.username)로.
      const trow = await env.DB.prepare(
        `SELECT username FROM admin_account
          WHERE username = ? COLLATE NOCASE ORDER BY (username = ?) DESC LIMIT 1`)
        .bind(target, target).first<{ username: string }>();
      if (!trow) return json({ ok: false, error: 'unknown_user',
        message: '그런 계정이 없습니다.', message_en: 'No such account.' }, 404);
      // 대소문자 변형으로 위 전체권한 차단을 우회하지 못하게, 찾은 DB 표기로 한 번 더.
      if (FULL_ACCESS_ACCOUNTS.has(trow.username)) {
        return json({ ok: false, error: 'target_not_allowed',
          message: '전체권한 계정의 연락처는 본인이 마이페이지에서 직접 등록해야 합니다.',
          message_en: 'Full-access accounts must set their own contact from My Page.' }, 403);
      }

      const sets: string[] = [];
      const vals: any[] = [];
      if (body.phone != null) {
        const p = String(body.phone).trim().slice(0, 30);
        // 저장 전에 형식을 본다 — 못 쓰는 값이 «등록됨» 으로 보이면 비번찾기가 조용히 실패한다.
        if (p && String(p).replace(/[^0-9]/g, '').length < 8) {
          return json({ ok: false, error: 'bad_phone',
            message: '전화번호 형식이 올바르지 않습니다.', message_en: 'That phone number is not valid.' }, 400);
        }
        sets.push('phone = ?'); vals.push(p);
      }
      if (body.email != null) {
        const e = String(body.email).trim().slice(0, 100);
        if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e)) {
          return json({ ok: false, error: 'bad_email',
            message: '이메일 형식이 올바르지 않습니다.', message_en: 'That email address is not valid.' }, 400);
        }
        sets.push('email = ?'); vals.push(e);
      }
      if (body.nationality != null) {
        sets.push('nationality = ?'); vals.push(String(body.nationality).trim().toUpperCase().slice(0, 2) || null);
      }
      if (!sets.length) return json({ ok: false, error: 'nothing_to_update' }, 400);
      sets.push('updated_at = ?'); vals.push(Date.now());
      vals.push(trow.username);
      await env.DB.prepare(`UPDATE admin_account SET ${sets.join(', ')} WHERE username = ?`).bind(...vals).run();

      const after = await env.DB.prepare(`SELECT phone, email, nationality FROM admin_account WHERE username = ? LIMIT 1`)
        .bind(trow.username).first<{ phone: string | null; email: string | null; nationality: string | null }>();
      const c = pickResetContact(after || {});
      const rIp = request.headers.get('cf-connecting-ip') || '';
      const rUa = request.headers.get('user-agent') || '';
      await recordLogin(env, trow.username, rIp, rUa, true, 'contact_set_by:' + actor.username).catch(() => {});
      return json({ ok: true, username: trow.username,
        recoverable: !!(c.phone || c.email), has_phone: !!c.phone, has_email: !!c.email,
        message: (c.phone || c.email)
          ? '연락처를 저장했습니다. 이제 이 계정은 «비밀번호 찾기» 를 쓸 수 있습니다.'
          : '저장했지만 쓸 수 있는 연락처가 없습니다 — 비밀번호 찾기는 아직 안 됩니다.',
        message_en: (c.phone || c.email)
          ? 'Contact saved. This account can now use "Forgot password".'
          : 'Saved, but there is still no usable contact — password recovery will not work yet.' });
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

    // ── 2단계 인증(2FA) 상태 조회 ──
    if (path === '/api/admin/2fa/status' && method === 'GET') {
      const row = await env.DB.prepare(
        `SELECT enabled FROM admin_2fa WHERE username = ? LIMIT 1`
      ).bind(me).first<{ enabled: number }>();
      return json({ ok: true, enabled: !!(row && row.enabled) });
    }

    // ── 2FA 설정 시작: 새 비밀키 생성(대기 상태) + 인증앱 등록용 URI 반환 ──
    if (path === '/api/admin/2fa/setup' && method === 'POST') {
      const secret = generateSecret();
      const now = Date.now();
      // 기존 대기/사용 중 항목을 새 비밀키로 교체(아직 enabled=0 — 코드 확인 전엔 로그인에 영향 없음)
      await env.DB.prepare(
        `INSERT INTO admin_2fa (username, secret, enabled, created_at, enabled_at)
         VALUES (?, ?, 0, ?, NULL)
         ON CONFLICT(username) DO UPDATE SET secret = excluded.secret, enabled = 0, created_at = excluded.created_at, enabled_at = NULL`
      ).bind(me, secret, now).run();
      return json({ ok: true, secret, otpauth_uri: otpauthURI(secret, me) });
    }

    // ── 2FA 활성화 확정: 사용자가 입력한 코드가 맞으면 enabled=1 ──
    if (path === '/api/admin/2fa/enable' && method === 'POST') {
      let body: any; try { body = await request.json(); } catch { body = null; }
      const code = String(body?.code || '').trim();
      const row = await env.DB.prepare(
        `SELECT secret FROM admin_2fa WHERE username = ? LIMIT 1`
      ).bind(me).first<{ secret: string }>();
      if (!row) return json({ ok: false, error: 'no_setup' }, 400);
      const ok = await verifyTOTP(row.secret, code, Date.now());
      if (!ok) return json({ ok: false, error: 'invalid_code', message: '코드가 올바르지 않습니다. 앱의 6자리를 다시 확인해 주세요.' }, 400);
      await env.DB.prepare(
        `UPDATE admin_2fa SET enabled = 1, enabled_at = ? WHERE username = ?`
      ).bind(Date.now(), me).run();
      return json({ ok: true, enabled: true });
    }

    // ── 2FA 해제: 본인 비밀번호 확인 후 제거 ──
    if (path === '/api/admin/2fa/disable' && method === 'POST') {
      let body: any; try { body = await request.json(); } catch { body = null; }
      const pw = String(body?.password || '');
      const acc = await env.DB.prepare(
        `SELECT password_hash FROM admin_account WHERE username = ? LIMIT 1`
      ).bind(me).first<{ password_hash: string }>();
      if (!acc) return json({ ok: false, error: 'user_missing' }, 500);
      if (!(await verifyPassword(pw, acc.password_hash))) {
        return json({ ok: false, error: 'wrong_password', message: '비밀번호가 올바르지 않습니다.' }, 401);
      }
      await env.DB.prepare(`DELETE FROM admin_2fa WHERE username = ?`).bind(me).run();
      return json({ ok: true, enabled: false });
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
