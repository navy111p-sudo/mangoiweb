/**
 * totp.ts — 관리자 2단계 인증(2FA) TOTP 구현 (RFC 6238, SHA-1, 30초, 6자리)
 *
 *  구글/MS/1Password 등 표준 인증 앱과 호환. 외부 라이브러리 없이 Web Crypto만 사용.
 *  - generateSecret()  : 새 계정용 비밀키(base32) 생성
 *  - otpauthURI()      : 인증 앱에 등록할 otpauth:// URI (QR용)
 *  - verifyTOTP()      : 사용자가 입력한 6자리 코드 검증(±1스텝 관용 = 시계 오차 대비)
 */

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** base32(RFC 4648, 패딩 없음) 인코딩 */
function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** base32 → 바이트 (공백·소문자·패딩 허용) */
function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** 랜덤 20바이트 → base32 비밀키 (인증 앱 표준 길이) */
export function generateSecret(): string {
  const buf = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(buf);
}

/** 인증 앱 등록용 otpauth URI (QR 코드로 만들거나 수동 입력) */
export function otpauthURI(secret: string, account: string, issuer = 'Mangoi'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** 주어진 시각(스텝)의 TOTP 6자리 계산 */
async function totpAt(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret);
  // 8바이트 빅엔디안 카운터
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, msg as unknown as BufferSource));
  const offset = sig[sig.length - 1] & 0x0f;
  const bin = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3];
  return (bin % 1_000_000).toString().padStart(6, '0');
}

/**
 * 사용자가 입력한 6자리 코드를 검증한다.
 * @param window 앞뒤로 몇 스텝(30초)까지 허용할지 (기본 1 = 시계 오차 ±30초 관용)
 */
export async function verifyTOTP(secret: string, code: string, atMs: number, window = 1): Promise<boolean> {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6 || !secret) return false;
  const step = Math.floor(atMs / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if (await totpAt(secret, step + w) === clean) return true;
  }
  return false;
}
