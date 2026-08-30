// ═══════════════════════════════════════════════════════════════════════
// 😊 api-passkey.ts — 패스키(WebAuthn) 얼굴/지문 로그인 (2026-07-21)
//   기기 자체 생체인증(Face ID·지문·Windows Hello)을 빌려 쓰는 웹 표준.
//   생체정보는 기기 밖으로 절대 나오지 않음 — 서버(D1)엔 공개키만 저장.
//   라우트 (index.ts 게이트 + api-mango.ts 라우팅 이중 등록):
//     POST /api/passkey/register/options — 등록 옵션 (mango_token 필수)
//     POST /api/passkey/register/verify  — 등록 검증·저장 (mango_token 필수)
//     POST /api/passkey/login/options    — 로그인 챌린지 발급 (공개)
//     POST /api/passkey/login/verify     — 서명 검증 → mango_token 발급
//     POST /api/passkey/list             — 내 패스키 목록 (mango_token 필수)
//     POST /api/passkey/remove           — 내 패스키 삭제 (mango_token 필수, 본인 것만)
//   구현 메모:
//   · attestation='none' 정책 — attStmt 는 검증하지 않음(대부분 서비스 표준).
//   · 챌린지는 KV(SESSION_STATE) 5분 TTL, verify 시 소비(delete) → 재사용 공격 차단.
//   · rpId = 요청 호스트명 동적 사용 → test.mangoi.co.kr / workers.dev 모두 동작.
//     단 `*.mangoi.ai` 는 apex(`mangoi.ai`)로 묶는다 — resolveRpId() 주석 참조.
//   · ES256(-7) 서명은 ASN.1 DER → WebCrypto 는 raw r||s 요구 → 변환 필수.
// ═══════════════════════════════════════════════════════════════════════
import { json } from './api-util';
import { authUidFromRequest as authUidGlobal, signUidToken, startSession } from './auth-token';
import type { MangoEnv } from './api-mango';
import { oncePerIsolate } from './once-per-isolate';   // ⚡ 준비 DDL 을 요청마다 반복하지 않게
import { checkAdminSession, issueAdminSession } from './auth-admin';   // 🔐 v4 제안서 06 — 관리자 생체인증

const CH_TTL_SEC = 300;           // 챌린지 유효 5분
const MAX_CREDS_PER_USER = 8;     // 계정당 패스키 상한(온가족 기기 고려)

// 안드로이드 "앱"에서 패스키 세리머니를 하면 clientData.origin 이 https 주소가 아니라
// android:apk-key-hash:<서명인증서 SHA-256 의 base64url> 로 온다 (FIDO2 표준 동작).
// 우리 앱(kr.co.mangoi.app, mango.jks 서명)의 지문만 허용 — 다른 앱은 거절.
const ANDROID_APP_ORIGINS = [
  'android:apk-key-hash:1QIpo1vhGmV0PAazPhrJDBi_wHCWLkb9H2uaofE-7DA',
];

// ── rpId: 같은 사이트인데 «다른 사이트» 로 갈리지 않게 ───────────────────
// WebAuthn 은 rpId 가 한 글자만 달라도 **다른 사이트**로 보고 자격증명을 안 내준다.
// 2026-08-17 에 `www.mangoi.ai` 를 추가로 붙였는데(기존 `mangoi.ai` 도 그대로 산다),
// rpId 로 요청 호스트명을 그대로 쓰면 한쪽에서 등록한 지문이 다른 쪽에서
// `rp_mismatch` 로 거절된다 — 사용자에겐 「어제까진 지문으로 됐는데 오늘 안 돼요」로 보인다.
//
// 표준상 rpId 는 «오리진 호스트의 등록가능 상위 도메인» 이면 되므로 apex 로 통일한다.
//   mangoi.ai → mangoi.ai · www.mangoi.ai → mangoi.ai
// ⛔ test.mangoi.co.kr·workers.dev·localhost 는 상위 도메인이 **다르므로** 묶으면 안 된다.
//    (실측 2026-08-17: 등록된 패스키 7개 = test.mangoi.co.kr 6 · mangoi.ai 1 · www 0
//     → apex 로 묶어도 기존 등록분은 rpId 가 그대로라 재등록이 필요 없다)
const PASSKEY_RP_APEX = 'mangoi.ai';
function resolveRpId(hostname: string): string {
  const h = String(hostname || '').toLowerCase();
  return (h === PASSKEY_RP_APEX || h.endsWith('.' + PASSKEY_RP_APEX)) ? PASSKEY_RP_APEX : h;
}

// ── base64url ──
function b64uFromBytes(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), c => c.charCodeAt(0));
}
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as any));
}

// ── 최소 CBOR 디코더 — attestationObject·COSE 키 파싱 전용 ──
//   지원: uint/negint(≤4바이트 길이)·bytes·text·array·map·tag(투과)·simple.
//   attestation 객체엔 8바이트 길이 항목이 나오지 않으므로 충분.
function cborItem(b: Uint8Array, p: number): [any, number] {
  if (p >= b.length) throw new Error('cbor_eof');
  const ib = b[p]; const mt = ib >> 5; const ai = ib & 0x1f;
  let len = 0; let q = p + 1;
  if (ai < 24) len = ai;
  else if (ai === 24) { len = b[q]; q += 1; }
  else if (ai === 25) { len = (b[q] << 8) | b[q + 1]; q += 2; }
  else if (ai === 26) { len = b[q] * 0x1000000 + (b[q + 1] << 16) + (b[q + 2] << 8) + b[q + 3]; q += 4; }
  else throw new Error('cbor_len_unsupported');
  switch (mt) {
    case 0: return [len, q];
    case 1: return [-1 - len, q];
    case 2: return [b.slice(q, q + len), q + len];
    case 3: return [new TextDecoder().decode(b.slice(q, q + len)), q + len];
    case 4: { const arr: any[] = []; for (let i = 0; i < len; i++) { const [v, np] = cborItem(b, q); arr.push(v); q = np; } return [arr, q]; }
    case 5: { const m: Record<string, any> = {}; for (let i = 0; i < len; i++) { const [k, np] = cborItem(b, q); const [v, np2] = cborItem(b, np); m[String(k)] = v; q = np2; } return [m, q]; }
    case 6: return cborItem(b, q);  // tag 는 내용만 투과
    case 7: return [null, q];
  }
  throw new Error('cbor_mt');
}

// ── authData 파싱: rpIdHash·flags·counter·(AT 시) credId+COSE 공개키 ──
function parseAuthData(ad: Uint8Array) {
  if (ad.length < 37) throw new Error('authdata_short');
  const rpIdHash = ad.slice(0, 32);
  const flags = ad[32];
  const counter = (ad[33] * 0x1000000) + (ad[34] << 16) + (ad[35] << 8) + ad[36];
  let credentialId: Uint8Array | null = null;
  let cosePublicKey: any = null;
  if (flags & 0x40) {  // AT — attested credential data 포함
    if (ad.length < 55) throw new Error('authdata_at_short');
    const cidLen = (ad[53] << 8) | ad[54];
    credentialId = ad.slice(55, 55 + cidLen);
    const [cose] = cborItem(ad, 55 + cidLen);
    cosePublicKey = cose;
  }
  return { rpIdHash, flags, counter, credentialId, cosePublicKey };
}

// ── COSE 공개키 → WebCrypto JWK (ES256 EC P-256 / RS256 RSA) ──
function coseToJwk(cose: any): { jwk: JsonWebKey; alg: number } {
  const kty = Number(cose['1']);
  const alg = Number(cose['3']);
  if (kty === 2 && alg === -7) {   // EC2 · ES256
    if (Number(cose['-1']) !== 1) throw new Error('unsupported_curve');
    return { jwk: { kty: 'EC', crv: 'P-256', x: b64uFromBytes(cose['-2']), y: b64uFromBytes(cose['-3']) }, alg };
  }
  if (kty === 3 && alg === -257) { // RSA · RS256 (Windows Hello 구형)
    return { jwk: { kty: 'RSA', n: b64uFromBytes(cose['-1']), e: b64uFromBytes(cose['-2']) }, alg };
  }
  throw new Error('unsupported_key_alg_' + kty + '_' + alg);
}

// ── ECDSA 서명 ASN.1 DER → raw r||s(64바이트) — WebCrypto verify 형식 ──
function derSigToRaw(der: Uint8Array): Uint8Array {
  let o = 0;
  if (der[o++] !== 0x30) throw new Error('sig_der');
  let seqLen = der[o++];
  if (seqLen & 0x80) o += seqLen & 0x7f;
  const readInt = (): Uint8Array => {
    if (der[o++] !== 0x02) throw new Error('sig_der_int');
    let l = der[o++];
    if (l & 0x80) { const n = l & 0x7f; l = 0; for (let i = 0; i < n; i++) l = (l << 8) | der[o++]; }
    let v = der.slice(o, o + l); o += l;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) throw new Error('sig_der_len');
    const out = new Uint8Array(32); out.set(v, 32 - v.length); return out;
  };
  const r = readInt(); const s = readInt();
  const raw = new Uint8Array(64); raw.set(r, 0); raw.set(s, 32);
  return raw;
}

// ── 저장된 JWK 로 서명 검증 (signedData = authenticatorData || SHA256(clientDataJSON)) ──
async function verifySignature(jwk: JsonWebKey, alg: number, signature: Uint8Array, signedData: Uint8Array): Promise<boolean> {
  try {
    if (alg === -7) {
      const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derSigToRaw(signature) as any, signedData as any);
    }
    if (alg === -257) {
      const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature as any, signedData as any);
    }
  } catch { return false; }
  return false;
}

const ensureTable = oncePerIsolate(async (env: MangoEnv): Promise<void> => {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS webauthn_credentials (credential_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, alg INTEGER NOT NULL, counter INTEGER DEFAULT 0, transports TEXT, device_label TEXT, rp_id TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER);`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_webauthn_uid ON webauthn_credentials(user_id)`); } catch {}
});

// clientDataJSON 공통 검증: type·challenge(KV 소비)·origin
async function consumeClientData(
  env: MangoEnv, url: URL, clientDataB64u: string, expectType: string, chPrefix: string
): Promise<{ ok: boolean; error?: string; clientDataBytes?: Uint8Array; chMeta?: any }> {
  let cd: any;
  const clientDataBytes = b64uToBytes(clientDataB64u);
  try { cd = JSON.parse(new TextDecoder().decode(clientDataBytes)); } catch { return { ok: false, error: 'bad_client_data' }; }
  if (cd.type !== expectType) return { ok: false, error: 'bad_type' };
  const chKey = chPrefix + String(cd.challenge || '');
  const raw = await env.SESSION_STATE.get(chKey);
  if (!raw) return { ok: false, error: 'challenge_expired' };
  await env.SESSION_STATE.delete(chKey);  // 1회용 — 재사용 공격 차단
  // origin: API 와 페이지가 동일 오리진 전제. 로컬 개발(localhost)과
  // 우리 안드로이드 앱(apk-key-hash — 위 상수)도 허용.
  const org = String(cd.origin || '');
  if (org !== url.origin
      && !ANDROID_APP_ORIGINS.includes(org)
      && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(org)) {
    return { ok: false, error: 'bad_origin' };
  }
  let chMeta: any = {};
  try { chMeta = JSON.parse(raw); } catch {}
  return { ok: true, clientDataBytes, chMeta };
}

export async function handlePasskeyApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (!path.startsWith('/api/passkey/')) return null;
  if (method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const body: any = await request.json().catch(() => ({}));
  const rpId = resolveRpId(url.hostname);

  /* 🔐 (2026-08-30 v4 제안서 06) 관리자 지문·Face ID 로그인.
     ─────────────────────────────────────────────────────────────────────────
     [왜 새 주소를 안 만들었나] `/api/passkey/*` 는 src/index.ts 라우팅 목록에
       **정규식으로 여섯 경로만** 올라와 있다(register/options … remove). 새 경로를 만들면
       그 정규식을 고쳐야 하는데 그 파일은 공동 금지구역이다. 그래서 **같은 경로**를 쓰고
       요청 본문의 `scope:'admin'` 으로 갈랐다 — 금지구역을 한 줄도 안 건드린다.
     [저장 자리] 같은 표(webauthn_credentials)를 쓰되 user_id 를 `admin:<아이디>` 로 둔다.
       ⛔ 접두사를 빼지 말 것 — 학생 아이디와 관리자 아이디는 서로 겹칠 수 있고(둘 다 자유 문자열),
          겹치면 학생 패스키로 관리자에 들어가게 된다.
     ⚠️ 대소문자 — admin_account.username 은 COLLATE NOCASE 가 아니라 `Mangoi_167` 과
        `mangoi_167` 이 다른 행으로 실재한다(CLAUDE.md 2장). 그래서 **DB 에 적힌 표기**로
        찾아 그 표기로 저장·조회한다. 입력 표기를 그대로 쓰면 같은 사람에게 패스키가 두 벌 생긴다.
     ⛔ 학생 경로의 판정을 재사용하지 않는다(students_erp 조회·mango_token 발급이 섞이면
        관리자에게 학생 전용 기능이 열린다 — CLAUDE.md 2장 「로그인했는데 또 로그인하래요」). */
  const isAdminScope = String(body.scope || '') === 'admin';
  const ADMIN_PREFIX = 'admin:';

  /** 입력 아이디 → DB 에 적힌 표기. 정확일치 먼저, 없으면 대소문자만 다른 후보가 «하나일 때만». */
  async function resolveAdminUsername(input: string): Promise<string | null> {
    const raw = String(input || '').trim();
    if (!raw) return null;
    try {
      const exact: any = await env.DB.prepare(`SELECT username FROM admin_account WHERE username = ?`).bind(raw).first();
      if (exact?.username) return String(exact.username);
      const rs: any = await env.DB.prepare(`SELECT username FROM admin_account WHERE LOWER(username) = LOWER(?)`).bind(raw).all();
      const rows = rs.results || [];
      if (rows.length === 1) return String(rows[0].username);
    } catch { /* 표가 없는 옛 DB */ }
    return null;   // ⛔ 후보가 둘 이상이면 «못 찾음» — 아무거나 고르지 않는다
  }

  /** 지금 요청이 «로그인된 관리자» 인가. 등록 경로에서만 쓴다. */
  async function currentAdminUsername(): Promise<string | null> {
    const sess: any = await checkAdminSession(request, env as any);
    if (!sess || !sess.ok) return null;
    return String(sess.username || '').trim() || null;
  }

  // ═══ POST /api/passkey/register/options — 등록 옵션 (로그인 상태 필수) ═══
  if (path === '/api/passkey/register/options') {
    if (isAdminScope) {
      const au = await currentAdminUsername();
      if (!au) return json({ ok: false, error: 'admin_session_required', message: '먼저 아이디·비밀번호로 로그인해 주세요.' }, 401);
      await ensureTable(env);
      const key = ADMIN_PREFIX + au;
      const ex: any = await env.DB.prepare(`SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ?`).bind(key).all();
      const cs = ex.results || [];
      if (cs.length >= MAX_CREDS_PER_USER) return json({ ok: false, error: 'too_many_passkeys', message: '기기는 계정당 최대 ' + MAX_CREDS_PER_USER + '개까지 등록할 수 있어요.' }, 400);
      const ch = b64uFromBytes(crypto.getRandomValues(new Uint8Array(32)));
      await env.SESSION_STATE.put('pk:reg:' + ch, JSON.stringify({ uid: key }), { expirationTtl: CH_TTL_SEC });
      return json({
        ok: true,
        options: {
          challenge: ch,
          rp: { id: rpId, name: '망고아이 관리자' },
          user: { id: b64uFromBytes(new TextEncoder().encode(key)), name: au, displayName: au },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          timeout: 60000,
          attestation: 'none',
          excludeCredentials: cs.map((c: any) => ({ type: 'public-key', id: c.credential_id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
          /* 관리자 계정은 급여·회계를 여는 열쇠라 «사용자 확인» 을 요구한다(지문·얼굴·PIN 중 하나).
             학생 쪽(preferred)보다 한 단계 높다 — 여기서 낮추지 말 것. */
          authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        },
      });
    }
    const uid = await authUidGlobal(request, url, env, body);
    if (!uid) return json({ ok: false, error: 'auth_required', message: '먼저 로그인해주세요.' }, 401);
    await ensureTable(env);
    const stu: any = await env.DB.prepare(`SELECT user_id, student_name FROM students_erp WHERE user_id = ?`).bind(uid).first();
    if (!stu) return json({ ok: false, error: 'user_not_found' }, 404);
    const existing: any = await env.DB.prepare(`SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ?`).bind(uid).all();
    const creds = existing.results || [];
    if (creds.length >= MAX_CREDS_PER_USER) return json({ ok: false, error: 'too_many_passkeys', message: '패스키는 계정당 최대 ' + MAX_CREDS_PER_USER + '개까지 등록할 수 있어요.' }, 400);

    const challenge = b64uFromBytes(crypto.getRandomValues(new Uint8Array(32)));
    await env.SESSION_STATE.put('pk:reg:' + challenge, JSON.stringify({ uid }), { expirationTtl: CH_TTL_SEC });

    return json({
      ok: true,
      options: {
        challenge,
        rp: { id: rpId, name: '망고아이 MangoAI' },
        user: { id: b64uFromBytes(new TextEncoder().encode(uid)), name: uid, displayName: stu.student_name || uid },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        timeout: 60000,
        attestation: 'none',
        excludeCredentials: creds.map((c: any) => ({ type: 'public-key', id: c.credential_id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      },
    });
  }

  // ═══ POST /api/passkey/register/verify — 브라우저 attestation 검증·공개키 저장 ═══
  if (path === '/api/passkey/register/verify') {
    /* ⚠️ 검증(서명·rpId·challenge)은 학생과 «완전히 같은 코드» 를 탄다 — 갈라 쓰면 한쪽만
       약해진다. 다른 것은 «누구의 것으로 저장하느냐»(uid) 하나뿐이다. */
    const uid = isAdminScope
      ? (await currentAdminUsername().then(u => (u ? ADMIN_PREFIX + u : null)))
      : await authUidGlobal(request, url, env, body);
    if (!uid) return json({ ok: false, error: 'auth_required' }, 401);
    await ensureTable(env);
    const cred = body.credential || {};
    const resp = cred.response || {};
    if (!cred.id || !resp.clientDataJSON || !resp.attestationObject) return json({ ok: false, error: 'bad_request' }, 400);

    const cdr = await consumeClientData(env, url, String(resp.clientDataJSON), 'webauthn.create', 'pk:reg:');
    if (!cdr.ok) return json({ ok: false, error: cdr.error || 'client_data_invalid', message: '등록 확인에 실패했어요. 다시 시도해주세요.' }, 400);
    if ((cdr.chMeta || {}).uid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 400);

    try {
      const [att] = cborItem(b64uToBytes(String(resp.attestationObject)), 0);
      const ad = parseAuthData(att.authData);
      if (!(ad.flags & 0x01)) return json({ ok: false, error: 'user_not_present' }, 400);
      const rpHash = await sha256(new TextEncoder().encode(rpId));
      if (b64uFromBytes(ad.rpIdHash) !== b64uFromBytes(rpHash)) return json({ ok: false, error: 'rp_mismatch' }, 400);
      if (!ad.credentialId || !ad.cosePublicKey) return json({ ok: false, error: 'no_credential_data' }, 400);
      const { jwk, alg } = coseToJwk(ad.cosePublicKey);

      const credIdB64u = b64uFromBytes(ad.credentialId);
      // 브라우저가 준 id 와 authData 내 credId 일치 확인(위조 방지)
      if (String(cred.id) !== credIdB64u && String(cred.rawId || '') !== credIdB64u) return json({ ok: false, error: 'cred_id_mismatch' }, 400);

      const now = Date.now();
      const transports = Array.isArray(cred.transports) ? JSON.stringify(cred.transports.slice(0, 6)) : null;
      const label = String(body.device_label || '').slice(0, 60) || null;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO webauthn_credentials (credential_id, user_id, public_key, alg, counter, transports, device_label, rp_id, created_at, last_used_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(credIdB64u, uid, JSON.stringify(jwk), alg, ad.counter || 0, transports, label, rpId, now, null).run();

      return json({ ok: true, message: '패스키가 등록됐어요! 다음부터 얼굴/지문으로 로그인할 수 있어요.' });
    } catch (e: any) {
      return json({ ok: false, error: 'attestation_parse_failed', detail: String(e && e.message || e).slice(0, 120) }, 400);
    }
  }

  // ═══ POST /api/passkey/login/options — 로그인 챌린지 발급 (공개) ═══
  //   body: { user_id? } — 있으면 그 계정의 패스키 목록, 없으면 discoverable(기기 저장) 방식
  if (path === '/api/passkey/login/options') {
    if (isAdminScope) {
      await ensureTable(env);
      const au = await resolveAdminUsername(String(body.username || body.user_id || ''));
      /* ⛔ «그런 아이디가 없다» 를 알려 주지 않는다 — 아이디 존재 여부가 새는 통로가 된다.
         후보가 없으면 빈 목록으로 챌린지만 준다(기기에 저장된 패스키가 있으면 그것으로 시도된다). */
      let allow: any[] = [];
      if (au) {
        try {
          const rs: any = await env.DB.prepare(
            `SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ? AND (rp_id = ? OR rp_id IS NULL)`
          ).bind(ADMIN_PREFIX + au, rpId).all();
          allow = (rs.results || []).map((c: any) => ({ type: 'public-key', id: c.credential_id, transports: c.transports ? JSON.parse(c.transports) : undefined }));
        } catch {}
      }
      const ch = b64uFromBytes(crypto.getRandomValues(new Uint8Array(32)));
      await env.SESSION_STATE.put('pk:auth:' + ch, JSON.stringify({ uid: au ? ADMIN_PREFIX + au : null, admin: true }), { expirationTtl: CH_TTL_SEC });
      return json({ ok: true, options: { challenge: ch, rpId, timeout: 60000, userVerification: 'required', allowCredentials: allow } });
    }
    await ensureTable(env);
    const uid = String(body.user_id || '').trim();
    let allowCredentials: any[] = [];
    if (uid) {
      /* 🈶 rp_id 로 걸러 낸다 (2026-08-18).
       *   예전에는 user_id 만 보고 **다른 도메인에 등록된 패스키까지** 후보로 내줬다.
       *   그러면 브라우저는 «이 사이트(rpId)에 맞는 자격증명» 을 못 찾아 세리머니가 그냥 실패하고,
       *   화면에는 「인증이 취소됐거나 시간이 초과됐어요」 만 뜬다 — 진짜 이유(주소가 바뀌어
       *   재등록이 필요하다)를 사용자가 알 방법이 없다. 앱 주소를 mangoi.ai 로 옮기면서
       *   test.mangoi.co.kr 에 등록해 둔 사람들이 정확히 이 상태가 된다.
       *   ⚠️ rp_id 가 NULL 인 행은 컬럼이 생기기 전에 만들어진 것이라 어느 도메인인지 알 수 없다.
       *      지금은 0건이지만, 있으면 막지 말고 후보에 넣는다(막으면 멀쩡한 사람이 못 들어온다). */
      const rs: any = await env.DB.prepare(
        `SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ? AND (rp_id = ? OR rp_id IS NULL)`
      ).bind(uid, rpId).all();
      const creds = rs.results || [];
      if (!creds.length) {
        // 이 도메인엔 없지만 **다른 도메인에는 있는** 경우 — 「없음」이 아니라 「옮겨졌음」이라고 알려야 한다.
        const other: any = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM webauthn_credentials WHERE user_id = ?`
        ).bind(uid).first();
        if (Number(other?.n || 0) > 0) {
          return json({
            ok: false, error: 'passkey_other_domain',
            message: '주소가 바뀌면서 이 기기의 얼굴/지문 로그인이 해제됐어요. 비밀번호로 로그인하면 다시 등록할 수 있어요.',
            message_en: 'Your passkey was registered on our old address. Sign in with your password to set it up again.',
          }, 404);
        }
        return json({ ok: false, error: 'no_passkey', message: '이 계정에 등록된 패스키가 없어요. 비밀번호로 로그인한 뒤 등록해주세요.' }, 404);
      }
      allowCredentials = creds.map((c: any) => ({ type: 'public-key', id: c.credential_id, transports: c.transports ? JSON.parse(c.transports) : undefined }));
    }
    const challenge = b64uFromBytes(crypto.getRandomValues(new Uint8Array(32)));
    await env.SESSION_STATE.put('pk:auth:' + challenge, JSON.stringify({ uid: uid || null }), { expirationTtl: CH_TTL_SEC });
    return json({
      ok: true,
      options: { challenge, rpId, timeout: 60000, userVerification: 'preferred', allowCredentials },
    });
  }

  // ═══ POST /api/passkey/login/verify — assertion 서명 검증 → mango_token 발급 ═══
  if (path === '/api/passkey/login/verify') {
    await ensureTable(env);
    const cred = body.credential || {};
    const resp = cred.response || {};
    if (!cred.id || !resp.clientDataJSON || !resp.authenticatorData || !resp.signature) return json({ ok: false, error: 'bad_request' }, 400);

    const row: any = await env.DB.prepare(`SELECT credential_id, user_id, public_key, alg, counter FROM webauthn_credentials WHERE credential_id = ?`).bind(String(cred.id)).first();
    if (!row) return json({ ok: false, error: 'unknown_credential', message: '등록되지 않은 패스키예요. 비밀번호로 로그인한 뒤 다시 등록해주세요.' }, 404);

    const cdr = await consumeClientData(env, url, String(resp.clientDataJSON), 'webauthn.get', 'pk:auth:');
    if (!cdr.ok) return json({ ok: false, error: cdr.error || 'client_data_invalid', message: '로그인 확인에 실패했어요. 다시 시도해주세요.' }, 400);
    // options 를 특정 계정으로 발급받았다면 그 계정의 패스키여야 함
    const chUid = (cdr.chMeta || {}).uid;
    if (chUid && chUid !== row.user_id) return json({ ok: false, error: 'uid_mismatch' }, 400);

    try {
      const authData = b64uToBytes(String(resp.authenticatorData));
      const ad = parseAuthData(authData);
      if (!(ad.flags & 0x01)) return json({ ok: false, error: 'user_not_present' }, 400);
      const rpHash = await sha256(new TextEncoder().encode(rpId));
      if (b64uFromBytes(ad.rpIdHash) !== b64uFromBytes(rpHash)) return json({ ok: false, error: 'rp_mismatch' }, 400);

      const cdHash = await sha256(cdr.clientDataBytes as Uint8Array);
      const signedData = new Uint8Array(authData.length + 32);
      signedData.set(authData, 0); signedData.set(cdHash, authData.length);
      const okSig = await verifySignature(JSON.parse(row.public_key), Number(row.alg), b64uToBytes(String(resp.signature)), signedData);
      if (!okSig) return json({ ok: false, error: 'bad_signature', message: '인증에 실패했어요.' }, 401);

      // 서명 카운터 — 복제 인증기 감지(양쪽 다 0 이 아닐 때만 비교)
      const oldC = Number(row.counter || 0);
      if (oldC > 0 && ad.counter > 0 && ad.counter <= oldC) {
        return json({ ok: false, error: 'counter_rollback', message: '보안 문제가 감지됐어요. 비밀번호로 로그인해주세요.' }, 401);
      }

      const now = Date.now();
      try { await env.DB.prepare(`UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?`).bind(ad.counter || oldC, now, row.credential_id).run(); } catch {}

      /* 🔐 (2026-08-30 v4 제안서 06) 관리자 패스키 — 여기까지 오면 서명 검증이 끝났다.
         세션 발급·역할 판정·첫 화면 경로·언어는 **비밀번호 로그인과 같은 함수**를 쓴다
         (auth-admin.ts issueAdminSession). ⛔ 여기서 역할을 다시 판정하지 말 것 —
         로그인 경로마다 역할이 달라지는 사고가 이 저장소에 이미 있었다(CLAUDE.md 2장).
         ⚠️ 저장된 자격증명이 관리자 것인지는 **저장할 때 붙인 접두사**로만 가른다.
            body 의 scope 를 믿으면 학생 패스키로 관리자 세션을 받을 수 있다. */
      if (String(row.user_id || '').startsWith(ADMIN_PREFIX)) {
        const adminUser = String(row.user_id).slice(ADMIN_PREFIX.length);
        const exists: any = await env.DB.prepare(`SELECT username FROM admin_account WHERE username = ?`).bind(adminUser).first();
        if (!exists?.username) return json({ ok: false, error: 'user_not_found' }, 404);
        const ip = request.headers.get('CF-Connecting-IP') || '';
        const ua = request.headers.get('User-Agent') || '';
        return await issueAdminSession(env as any, String(exists.username), { remember: !!body.remember, ip, ua, method: 'passkey' });
      }
      /* ⛔ 반대 방향도 막는다 — 관리자 화면에서 온 요청(scope:'admin')인데 걸린 자격증명이
         학생 것이면 학생 토큰을 내주면 안 된다. «맞는 자리로 가라» 고 말한다. */
      if (isAdminScope) return json({ ok: false, error: 'not_admin_credential', message: '이 기기에 등록된 것은 학생 패스키입니다. 관리자 로그인은 아이디·비밀번호로 먼저 등록해 주세요.' }, 403);

      const stu: any = await env.DB.prepare(`SELECT user_id, student_name, parent_name, parent_user_id, password_hash FROM students_erp WHERE user_id = ?`).bind(row.user_id).first();
      if (!stu) return json({ ok: false, error: 'user_not_found' }, 404);
      try { await env.DB.prepare(`UPDATE students_erp SET last_login_at = ? WHERE user_id = ?`).bind(now, row.user_id).run(); } catch {}

      // /api/student/login 과 동일한 응답 형태 → 프론트 처리 로직 재사용
      return json({
        ok: true,
        token: await signUidToken(row.user_id, env, undefined, await startSession(row.user_id, env)),
        user: {
          user_id: stu.user_id,
          user_name: stu.student_name || stu.user_id,
          role: 'student',
          parent_name: stu.parent_name,
          parent_user_id: stu.parent_user_id,
          has_password: !!stu.password_hash,
        },
      });
    } catch (e: any) {
      return json({ ok: false, error: 'assertion_failed', detail: String(e && e.message || e).slice(0, 120) }, 400);
    }
  }

  // ═══ POST /api/passkey/list — 내 패스키 목록 (본인만) ═══
  if (path === '/api/passkey/list') {
    // 🔐 관리자 범위(v4 제안서 06) — 자기 계정의 기기만 보고 지운다(IDOR 방지는 학생과 동일)
    const uid = isAdminScope
      ? (await currentAdminUsername().then(u => (u ? ADMIN_PREFIX + u : null)))
      : await authUidGlobal(request, url, env, body);
    if (!uid) return json({ ok: false, error: 'auth_required' }, 401);
    await ensureTable(env);
    const rs: any = await env.DB.prepare(`SELECT credential_id, device_label, transports, created_at, last_used_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC`).bind(uid).all();
    return json({ ok: true, items: rs.results || [] });
  }

  // ═══ POST /api/passkey/remove — 내 패스키 삭제 (본인 것만 — IDOR 방지) ═══
  if (path === '/api/passkey/remove') {
    // 🔐 관리자 범위(v4 제안서 06) — 자기 계정의 기기만 보고 지운다(IDOR 방지는 학생과 동일)
    const uid = isAdminScope
      ? (await currentAdminUsername().then(u => (u ? ADMIN_PREFIX + u : null)))
      : await authUidGlobal(request, url, env, body);
    if (!uid) return json({ ok: false, error: 'auth_required' }, 401);
    await ensureTable(env);
    const cid = String(body.credential_id || '').trim();
    if (!cid) return json({ ok: false, error: 'credential_id_required' }, 400);
    const r: any = await env.DB.prepare(`DELETE FROM webauthn_credentials WHERE credential_id = ? AND user_id = ?`).bind(cid, uid).run();
    return json({ ok: true, removed: (r && r.meta && r.meta.changes) || 0 });
  }

  return json({ ok: false, error: 'not_found' }, 404);
}
