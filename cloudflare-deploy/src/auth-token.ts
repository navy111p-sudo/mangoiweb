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

/** uid 서명 토큰 발급 (로그인·게스트 발급용). api-mango.ts 클로저에서 이동(2026-07-14 5차). */
export async function signUidToken(uid: string, env: any, ttlMs = 30 * 86400 * 1000): Promise<string> {
  const enc = new TextEncoder();
  const payload = b64uFromBytes(enc.encode(JSON.stringify({ uid, exp: Date.now() + ttlMs })));
  const key = await crypto.subtle.importKey('raw', enc.encode(uidTokenSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return payload + '.' + b64uFromBytes(new Uint8Array(sig));
}

/** 서명 토큰을 검증해 uid 반환(위조·만료 시 null). */
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
