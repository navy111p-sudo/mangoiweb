// ═══════════════════════════════════════════════════════════════════════
// 🔐 UID 서명 토큰 검증 — 모듈 레벨 공용 (IDOR 방지 표준 도구)
//   로그인(/api/student/login 등) 시 signUidToken 으로 발급한 mango_token 의
//   uid 가 요청 uid 와 일치하는지 확인. 개인정보 엔드포인트는 이걸로 소유자 검증.
//   시크릿은 방 JWT 와 동일한 ROOM_JWT_SECRET 재사용(없으면 개발용 폴백).
//   ⚠️ api-mango.ts 내부에도 동일 로직의 클로저(authUidFromRequest)가 있으나,
//      그건 함수 중간(7600줄대)에 정의돼 그 앞 핸들러에선 못 씀 → 이 모듈로 어디서나 사용.
// ═══════════════════════════════════════════════════════════════════════

// ⚠️ 반드시 wrangler secret 로 ROOM_JWT_SECRET 설정. 폴백은 공개값(BUILD_STAMP)이 아닌 강한 상수로
//   두어(2026-07-12 보안), 시크릿 미설정 시에도 토큰을 추측·위조할 수 없게 한다.
//   ⚠️ 이 상수는 api-mango.ts(2곳)·signaling-room.ts 의 폴백과 반드시 동일해야 토큰이 상호검증된다.
const UID_SECRET_FALLBACK = 'mgi-fb-d0895a3a232c5ef0f0950c6128a04a5311ec69ba142cb4a86a8d334e33c56f30';
function uidTokenSecret(env: any): string {
  return (env && env.ROOM_JWT_SECRET) || UID_SECRET_FALLBACK;
}

function b64uToBytes(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

function b64uFromBytes(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ═══════════════════════════════════════════════════════════════════════
// 🔒 동시접속 1세션 (2026-08-08)
//   왜 필요한가 — AI 단독 상품은 학원이 «아이디 20개로 100명»을 돌릴 수 있으면 팔리지 않는다.
//   그런데 학원은 «같은 시간에 한 교실에» 모여 있으므로, 동시접속만 막으면
//   «동시에 쓸 수 있는 인원 = 산 아이디 수» 로 물리적으로 묶인다(100명을 20개로 = 5교대 = 불가능).
//
//   구조 — 토큰이 무상태(서명만)라 «어디서든 영원히» 통했다. 여기에 세션 id(sid)를 넣는다.
//     로그인 → 새 sid 발급 + KV 에 «최신 sid» 1개만 저장 → 이전 기기의 토큰은 다음 호출에서 죽는다.
//
//   ⚠️ 실서비스 학생 29,000명이 쓰는 경로다. 세 겹으로 안전장치를 둔다:
//     ① 킬 스위치 SINGLE_SESSION — 기본 'off'. 배포해도 아무 일도 일어나지 않는다.
//     ② 하위호환 — sid 없는 «기존 발급 토큰»은 그대로 통과(로그인한 사람이 튕기지 않는다).
//     ③ fail-open — KV 가 없거나 기록이 없으면 통과. 인프라 사고가 로그아웃 사태가 되지 않게.
// ═══════════════════════════════════════════════════════════════════════

/** 킬 스위치 — 'on' 일 때만 세션 대조를 한다. 기본 off. */
export function singleSessionOn(env: any): boolean {
  return String((env && env.SINGLE_SESSION) || '').toLowerCase() === 'on';
}

/** KV 키 — uid 는 대소문자 무시로 로그인되므로(students_erp COLLATE NOCASE) 키도 소문자로 통일. */
function sessKey(uid: string): string {
  return 'sess:' + String(uid || '').toLowerCase();
}

/**
 * 로그인 시 호출 — 새 세션을 열고 sid 를 돌려준다. 이 순간 **이전 기기의 세션은 무효**가 된다.
 * KV 쓰기가 실패해도 로그인 자체는 막지 않는다(sid 를 그대로 반환 → 대조 시 fail-open).
 */
export async function startSession(uid: string, env: any, ttlMs = 30 * 86400 * 1000): Promise<string> {
  const sid = b64uFromBytes(crypto.getRandomValues(new Uint8Array(16)));
  try {
    // expirationTtl 은 초 단위, 최소 60초
    const ttlSec = Math.max(60, Math.floor(ttlMs / 1000));
    await env?.SESSION_STATE?.put(sessKey(uid), sid, { expirationTtl: ttlSec });
  } catch { /* KV 실패해도 로그인은 진행 — 대조 단계에서 fail-open */ }
  return sid;
}

/** uid 서명 토큰 발급 (로그인·게스트 발급용). api-mango.ts 클로저에서 이동(2026-07-14 5차). */
export async function signUidToken(uid: string, env: any, ttlMs = 30 * 86400 * 1000, sid?: string): Promise<string> {
  const enc = new TextEncoder();
  // sid 는 있을 때만 넣는다 — 없으면 예전과 완전히 동일한 payload(하위호환)
  const claims: any = { uid, exp: Date.now() + ttlMs };
  if (sid) claims.sid = sid;
  const payload = b64uFromBytes(enc.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey('raw', enc.encode(uidTokenSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return payload + '.' + b64uFromBytes(new Uint8Array(sig));
}

/**
 * 서명 토큰을 검증해 uid 반환(위조·만료 시 null).
 * 🔒 SINGLE_SESSION='on' 이고 토큰에 sid 가 있으면 **KV 의 최신 sid 와 대조**해,
 *    다른 기기에서 로그인해 밀려난 토큰은 null 로 떨군다(= 호출자가 401).
 */
export async function verifyUidToken(token: string, env: any): Promise<string | null> {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(uidTokenSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, b64uToBytes(sig) as any, enc.encode(payload));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64uToBytes(payload)));
    if (!p.uid || (p.exp && p.exp < Date.now())) return null;

    // ── 동시접속 1세션 대조 ──
    //   p.sid 가 없으면 = 이 기능 이전에 발급된 토큰 → 건드리지 않는다(하위호환).
    //   KV 에 기록이 없으면(만료·미기록) 통과 — 인프라 사고로 전원이 튕기는 쪽이 훨씬 나쁘다.
    if (p.sid && singleSessionOn(env) && env?.SESSION_STATE) {
      let cur: string | null = null;
      try { cur = await env.SESSION_STATE.get(sessKey(p.uid)); } catch { cur = null; }
      if (cur && cur !== p.sid) return null;   // 다른 기기에서 로그인됨 → 이 토큰은 죽었다
    }
    return String(p.uid);
  } catch { return null; }
}

/**
 * 요청에서 인증된 uid 추출: Authorization: Bearer > body.token > ?token=
 * 반환값이 없거나 요청 uid 와 다르면 호출자가 401 처리.
 */
export async function authUidFromRequest(request: Request, url: URL, env: any, body?: any): Promise<string | null> {
  const h = request.headers.get('Authorization') || '';
  const bearer = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const tok = bearer || String((body && body.token) || url.searchParams.get('token') || '').trim();
  if (!tok) return null;
  return verifyUidToken(tok, env);
}
