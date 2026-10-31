/**
 * renew-link.ts — 🔗 수강 연장 1회용 링크 (2026-08-18)
 *
 * [왜 만들었나]
 *   미연장 안내 문자는 **학부모 휴대폰**(parent_phone)으로 나가는데, 그동안 링크가
 *   `/enroll.html` 이었다. 그 화면은 localStorage 의 학생 로그인이 없으면
 *   「🔒 로그인 후 이용할 수 있어요」로 갈아치운다 — 학부모 폰에는 학생 로그인이 없는 게
 *   보통이라, 결제하라는 문자를 받고 눌렀는데 결제창이 아니라 로그인 안내가 떴다.
 *   (같은 한계가 「수업 7일·3일 전 종료 안내」 문자에도 있었다.)
 *
 * [왜 «학부모에게 학생 로그인을 만들어 주는» 방식이 아닌가]
 *   ⛔ 그렇게 풀면 학생 전용 기능이 통째로 열린다(CLAUDE.md 2장 「로그인했는데 또 로그인하래요」
 *      항목의 교사판과 같은 실수다). 그래서 여기 토큰은 **로그인이 아니다.**
 *      `authUidFromRequest`(모든 개인정보 API 가 쓰는 공용 검증)는 이 토큰을 **모른다.**
 *      일기·시험·게임·평가서 어디에도 통하지 않는다.
 *
 * [무엇을 할 수 있는 토큰인가 — 딱 세 가지]
 *   ① 이 학생의 «현재 수강 현황» 을 읽는다      (GET  /api/pay/enroll/my-current)
 *   ② 이 학생의 «연장 주문» 을 만든다            (POST /api/pay/enroll/renew-order)
 *   ③ 화면 머리말에 쓸 이름을 받는다             (GET  /api/pay/enroll/renew-link)
 *   그 밖에는 아무것도 못 한다. 새 수강신청(create-order)조차 못 한다 — 이 링크는
 *   «이미 듣던 수업을 잇는» 용도지, 아무 상품이나 사는 용도가 아니다.
 *
 * [안전장치]
 *   · 토큰은 32바이트 난수(base64url 43자). 추측 불가.
 *   · DB 에는 **SHA-256 해시만** 저장한다 — 장부가 통째로 새도 살아 있는 링크가 나오지 않는다.
 *   · 기본 14일 만료.
 *   · 한 학생에게 **가장 최근 링크 1개만** 유효하다(새로 보내면 옛 링크는 죽는다).
 *   · 주문이 만들어지면 used 로 표시되고 더 이상 주문에 쓸 수 없다.
 *   · 토큰 원문은 어디에도 로그로 남기지 않는다.
 *
 * ⚠️ 이 모듈은 다른 도메인을 import 하지 않는다(enroll-ops.ts 와 같은 규칙). site-url 만 쓴다.
 */
import { siteUrl } from './site-url';

/** 링크 유효기간(일). 문자를 받고 며칠 뒤에 누르는 학부모가 많아 넉넉히 둔다. */
export const RENEW_LINK_TTL_DAYS = 14;

/** 토큰을 실어 보내는 이름 — 주소(?rt=), 본문(renew_token), 헤더(X-Renew-Token) 셋 다 받는다. */
const QS_KEY = 'rt';
const BODY_KEY = 'renew_token';
const HEADER_KEY = 'X-Renew-Token';

export async function ensureRenewLinkTable(env: any): Promise<void> {
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS renew_links (` +
    `token_hash TEXT PRIMARY KEY, uid TEXT NOT NULL, created_at INTEGER NOT NULL, ` +
    `expires_at INTEGER NOT NULL, used_at INTEGER, order_id TEXT, revoked INTEGER NOT NULL DEFAULT 0);`
  );
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_renew_links_uid ON renew_links(uid, created_at DESC);`); } catch {}
}

function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 저장·대조는 언제나 해시로. 원문은 문자에만 실린다. */
async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 주소·본문·헤더 어디에 실려 왔든 토큰을 꺼낸다. 형식이 아니면 버린다(DB 조회조차 안 한다). */
export function readRenewToken(url: URL, body?: any, request?: Request): string | null {
  const raw =
    url.searchParams.get(QS_KEY) ||
    (body && typeof body === 'object' ? body[BODY_KEY] : '') ||
    request?.headers.get(HEADER_KEY) || '';
  const t = String(raw || '').trim();
  return /^[A-Za-z0-9_-]{40,64}$/.test(t) ? t : null;
}

/**
 * 링크를 새로 발급한다. **그 학생의 예전 링크는 이 순간 전부 죽는다** —
 * 문자를 여러 번 보냈을 때 옛 문자의 링크가 계속 살아 있으면 회수할 방법이 없다.
 */
export async function issueRenewLink(
  env: any, uid: string, ttlDays: number = RENEW_LINK_TTL_DAYS,
): Promise<{ token: string; url: string; expires_at: number } | null> {
  const u = String(uid || '').trim();
  if (!u) return null;
  try {
    await ensureRenewLinkTable(env);
    const token = b64u(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await hashToken(token);
    const now = Date.now();
    const expiresAt = now + Math.max(1, ttlDays) * 86400 * 1000;
    await env.DB.prepare(`UPDATE renew_links SET revoked = 1 WHERE uid = ? AND revoked = 0`).bind(u).run();
    await env.DB.prepare(
      `INSERT INTO renew_links (token_hash, uid, created_at, expires_at) VALUES (?,?,?,?)`
    ).bind(hash, u, now, expiresAt).run();
    return { token, url: siteUrl('/enroll.html?' + QS_KEY + '=' + token), expires_at: expiresAt };
  } catch {
    // 링크를 못 만들었다고 문자를 통째로 막지는 않는다 — 부르는 쪽이 기본 링크로 되돌린다.
    return null;
  }
}

export type RenewTokenScope = { uid: string; token: string; expires_at: number; used: boolean };

/**
 * 토큰을 검증해 **그 학생 하나**의 권한으로 바꾼다. 위조·만료·회수·미존재면 null.
 * ⚠️ 이것은 로그인이 아니다. 부르는 쪽은 반드시 «이 uid 의 연장» 에만 써야 한다.
 */
export async function resolveRenewToken(
  env: any, url: URL, body?: any, request?: Request,
): Promise<RenewTokenScope | null> {
  const token = readRenewToken(url, body, request);
  if (!token) return null;
  try {
    await ensureRenewLinkTable(env);
    const hash = await hashToken(token);
    const row: any = await env.DB.prepare(
      `SELECT uid, expires_at, used_at, revoked FROM renew_links WHERE token_hash = ? LIMIT 1`
    ).bind(hash).first();
    if (!row) return null;
    if (Number(row.revoked) === 1) return null;
    if (Number(row.expires_at) < Date.now()) return null;
    return { uid: String(row.uid), token, expires_at: Number(row.expires_at), used: !!row.used_at };
  } catch {
    return null;
  }
}

/** 주문이 만들어졌으면 표시한다 — 같은 링크로 또 주문할 수 없게 된다(읽기는 계속 된다). */
export async function markRenewLinkUsed(env: any, token: string, orderId?: string): Promise<void> {
  try {
    const hash = await hashToken(token);
    await env.DB.prepare(
      `UPDATE renew_links SET used_at = ?, order_id = COALESCE(?, order_id) WHERE token_hash = ? AND used_at IS NULL`
    ).bind(Date.now(), orderId || null, hash).run();
  } catch { /* 표시에 실패해도 주문 자체는 이미 성공했다 — 여기서 되돌리지 않는다 */ }
}
