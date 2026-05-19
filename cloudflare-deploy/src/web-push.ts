/**
 * 🔔 Web Push 클라이언트 (Cloudflare Workers 호환)
 *   - VAPID JWT (ES256) 인증
 *   - 페이로드 없이 wakeup push 전송 (SW 가 /api/push/pending 에서 메시지 fetch)
 *   - Mock/disabled/real 3-mode 패턴
 *
 *   필요한 시크릿:
 *     - VAPID_PUBLIC_KEY  (base64url, 65바이트 raw)
 *     - VAPID_PRIVATE_KEY (base64url, 32바이트 raw 또는 PKCS#8)
 *     - VAPID_SUBJECT     (mailto:admin@example.com 또는 https://example.com)
 */

export interface WebPushEnv {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  WEB_PUSH_MODE?: string; // 'mock' | 'real' | undefined(=disabled)
}

export type WebPushMode = 'disabled' | 'mock' | 'real';

export function getWebPushMode(env: WebPushEnv): WebPushMode {
  const explicit = (env.WEB_PUSH_MODE || '').toLowerCase();
  if (explicit === 'mock') return 'mock';
  if (explicit === 'disabled') return 'disabled';
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return 'real';
  return 'disabled';
}

// ━━━━ base64url helpers ━━━━
function b64uEnc(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDec(s: string): Uint8Array {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ━━━━ VAPID raw private key → CryptoKey (P-256 ECDSA) ━━━━
async function importVapidPrivateKey(privateKeyB64u: string, publicKeyB64u: string): Promise<CryptoKey> {
  const dRaw = b64uDec(privateKeyB64u);     // 32 bytes
  const pubRaw = b64uDec(publicKeyB64u);    // 65 bytes (0x04 || x32 || y32)
  if (pubRaw.length !== 65 || pubRaw[0] !== 0x04) {
    throw new Error('VAPID public key must be 65-byte uncompressed (starts with 0x04)');
  }
  const x = pubRaw.slice(1, 33);
  const y = pubRaw.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: b64uEnc(dRaw),
    x: b64uEnc(x),
    y: b64uEnc(y),
    ext: true,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// ━━━━ DER(ASN.1) → JOSE(raw r||s) 변환 (WebCrypto ECDSA sign 결과 변환) ━━━━
// WebCrypto는 P1363 형식(raw r||s 64바이트) 으로 반환 — 따로 변환 필요 없음
// (Chrome/Firefox/Workers 모두 P1363)

// ━━━━ VAPID JWT 생성 ━━━━
async function buildVapidJwt(audience: string, subject: string, vapidPub: string, vapidPriv: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600; // 12시간 유효
  const payload = { aud: audience, exp, sub: subject };
  const h = b64uEnc(new TextEncoder().encode(JSON.stringify(header)));
  const p = b64uEnc(new TextEncoder().encode(JSON.stringify(payload)));
  const data = new TextEncoder().encode(`${h}.${p}`);
  const key = await importVapidPrivateKey(vapidPriv, vapidPub);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, data);
  return `${h}.${p}.${b64uEnc(sig)}`;
}

// ━━━━ 단일 endpoint 에 wakeup push 전송 ━━━━
export async function sendWebPushWakeup(endpoint: string, env: WebPushEnv): Promise<{ ok: boolean; status?: number; statusText?: string; mode: WebPushMode; error?: string }> {
  const mode = getWebPushMode(env);

  if (mode === 'disabled') {
    return { ok: false, mode, error: 'web_push_disabled' };
  }
  if (mode === 'mock') {
    console.log('[web-push:mock] would send to:', endpoint.slice(0, 80) + '…');
    return { ok: true, status: 201, mode };
  }

  // real mode
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await buildVapidJwt(audience, env.VAPID_SUBJECT || 'mailto:admin@mangoi.io', env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'TTL': '3600',
        'Urgency': 'normal',
        'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
        'Content-Length': '0',
      },
    });
    if (resp.ok || resp.status === 201) {
      return { ok: true, status: resp.status, statusText: resp.statusText, mode };
    }
    return { ok: false, status: resp.status, statusText: resp.statusText, mode, error: `push_endpoint_error_${resp.status}` };
  } catch (e: any) {
    return { ok: false, mode, error: e?.message || 'fetch_failed' };
  }
}

// ━━━━ 다수 endpoint 에 broadcast ━━━━
export async function broadcastWebPush(endpoints: string[], env: WebPushEnv): Promise<{ sent: number; failed: number; mode: WebPushMode; expired: string[] }> {
  const mode = getWebPushMode(env);
  let sent = 0, failed = 0;
  const expired: string[] = [];
  await Promise.all(endpoints.map(async (ep) => {
    const r = await sendWebPushWakeup(ep, env);
    if (r.ok) sent++;
    else {
      failed++;
      if (r.status === 410 || r.status === 404) expired.push(ep); // 만료된 구독
    }
  }));
  return { sent, failed, mode, expired };
}

// ━━━━ VAPID 키 페어 생성 도우미 (dev/setup 용) ━━━━
//   wrangler 콘솔에서 호출 가능: GET /api/admin/push/generate-vapid
export async function generateVapidKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  // ECDSA P-256 키 페어 생성 — Cloudflare Workers 표준 WebCrypto API
  const kp = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  if (!kp || !kp.publicKey || !kp.privateKey) {
    throw new Error('generateKey returned invalid keypair');
  }
  const jwkPub: JsonWebKey = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const jwkPriv: JsonWebKey = await crypto.subtle.exportKey('jwk', kp.privateKey);
  if (!jwkPub.x || !jwkPub.y || !jwkPriv.d) {
    throw new Error('exportKey JWK missing fields (x/y/d)');
  }
  const x = b64uDec(jwkPub.x);
  const y = b64uDec(jwkPub.y);
  // P-256 uncompressed public key = 0x04 || X(32) || Y(32) = 65 bytes
  const pubRaw = new Uint8Array(65);
  pubRaw[0] = 0x04;
  pubRaw.set(x, 1);
  pubRaw.set(y, 33);
  return {
    publicKey: b64uEnc(pubRaw),
    privateKey: jwkPriv.d,
  };
}
