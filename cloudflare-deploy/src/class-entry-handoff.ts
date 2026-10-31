// ═══════════════════════════════════════════════════════════════════════
// 🚪 수업 입장 «주소 옮기기» 용 로그인 넘겨주기 (2026-10-16)
//
// [왜] 옛 주소(test.mangoi.co.kr)로 들어온 학생이 mangoi.ai 의 선생님과 같은 방 번호로
//      들어갔는데 서로 못 만났습니다(class-4616-20261016 — 학생 test.mangoi.co.kr ·
//      선생님·참관 mangoi.ai, 양쪽 다 「참여자 1명」). 그래서 수업 «입장» 만은 mangoi.ai 에서
//      하도록 옮깁니다(사장님 지시 — 화면 쪽은 public/js/class-entry-domain.js).
//
// [문제] 학생 로그인(mango_token)은 localStorage 라 «주소(오리진)마다 따로» 입니다.
//      그냥 주소만 옮기면 mangoi.ai 에서는 로그인이 없는 학생이 됩니다(포인트·기록이 계정에 안 붙음).
//
// [방법] 옛 주소에서 «지금 로그인된 토큰» 으로 1회용 코드를 받고(create),
//      mangoi.ai 에서 그 코드를 «학생 로그인» 에 넘겨(redeem) 새 토큰을 받습니다.
//      - 코드는 32바이트 난수 · 2분 만료 · 한 번 쓰면 지움.
//      - 만들 때 토큰을 검증하므로(위조·만료·다른 기기로 밀려난 토큰은 거절) 코드는
//        «그 토큰을 가진 사람» 만 만들 수 있습니다 = 토큰보다 넓은 권한이 생기지 않습니다.
//      - KV(SESSION_STATE)는 두 워커가 같은 id 를 공유하므로 어느 워커에서 만들어도 읽힙니다.
//
// ⛔ 이 파일의 함수는 던지지 않습니다 — 실패하면 null 을 돌려주고, 화면은 «예전처럼» 옛 주소에서
//    그대로 입장합니다(fail-open). 수업에 못 들어가는 쪽이 방이 갈리는 쪽보다 나쁩니다.
// ═══════════════════════════════════════════════════════════════════════

export const HANDOFF_TTL_SEC = 120;
const KEY_PREFIX = 'handoff:';

/** 코드 모양 — 64자리 소문자 hex 만 받습니다(그 밖의 값으로 KV 를 훑지 못하게). */
export function isHandoffCode(code: unknown): boolean {
  return typeof code === 'string' && /^[0-9a-f]{64}$/.test(code);
}

function newCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

/** 검증된 uid 로 1회용 코드를 만듭니다. 실패하면 null. */
export async function createHandoff(env: any, uid: string): Promise<string | null> {
  const u = String(uid || '').trim();
  const kv = env && env.SESSION_STATE;
  if (!u || !kv || typeof kv.put !== 'function') return null;
  const code = newCode();
  try {
    await kv.put(KEY_PREFIX + code, JSON.stringify({ uid: u, at: Date.now() }), { expirationTtl: HANDOFF_TTL_SEC });
    return code;
  } catch { return null; }
}

/** 코드를 쓰고(지우고) uid 를 돌려줍니다. 모양이 틀리거나·없거나·만료면 null. */
export async function redeemHandoff(env: any, code: unknown): Promise<string | null> {
  if (!isHandoffCode(code)) return null;
  const kv = env && env.SESSION_STATE;
  if (!kv || typeof kv.get !== 'function') return null;
  const key = KEY_PREFIX + String(code);
  let raw: any = null;
  try { raw = await kv.get(key); } catch { return null; }
  if (!raw) return null;
  // 한 번 쓰면 지웁니다. ⚠️ 지우기가 실패해도 만료(2분)가 있으니 막지는 않습니다.
  try { if (typeof kv.delete === 'function') await kv.delete(key); } catch { /* 만료가 지운다 */ }
  try {
    const d = JSON.parse(String(raw));
    const uid = String((d && d.uid) || '').trim();
    if (!uid) return null;
    // 만료를 KV 에만 맡기지 않습니다(KV 만료는 최대 수십 초 늦을 수 있음).
    const at = Number(d && d.at);
    if (Number.isFinite(at) && Date.now() - at > HANDOFF_TTL_SEC * 1000) return null;
    return uid;
  } catch { return null; }
}
