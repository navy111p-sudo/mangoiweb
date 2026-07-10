// ═══════════════════════════════════════════════════════════════════════
// 🔐 UID 서명 토큰 검증 — 모듈 레벨 공용 (IDOR 방지 표준 도구)
//   로그인(/api/student/login 등) 시 signUidToken 으로 발급한 mango_token 의
//   uid 가 요청 uid 와 일치하는지 확인. 개인정보 엔드포인트는 이걸로 소유자 검증.
//   시크릿은 방 JWT 와 동일한 ROOM_JWT_SECRET 재사용(없으면 개발용 폴백).
//   ⚠️ api-mango.ts 내부에도 동일 로직의 클로저(authUidFromRequest)가 있으나,
//      그건 함수 중간(7600줄대)에 정의돼 그 앞 핸들러에선 못 씀 → 이 모듈로 어디서나 사용.
// ═══════════════════════════════════════════════════════════════════════

function uidTokenSecret(env: any): string {
  return (env && env.ROOM_JWT_SECRET) || ('mangoi-fallback-' + ((env && env.BUILD_STAMP) || 'dev'));
}

function b64uToBytes(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
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
