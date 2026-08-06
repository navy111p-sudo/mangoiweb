/**
 * api-traits.ts — 아이 성향 수집 (MBTI·성별·관심사·성격)
 *
 *  성별은 카페24 데이터가 신뢰불가(기본값 다수)라, 여기서 학부모가 직접 알려준 값은 신뢰함.
 *  수집 경로: ①학부모 링크 폼(traits.html?uid=&t=토큰) ②관리자 직접 입력(상담/레벨테스트 때)
 *  용도: 재등록 문자 개인화(buildRetentionMessage)에서 gender/mbti/interests 활용. 향후 교사매칭·학습추천에도 재사용.
 */
import { json, parseJsonBody } from './api-util';
import { checkAdminSession } from './auth-admin';

async function ensureTable(env: any): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS student_traits (
       user_id TEXT PRIMARY KEY,
       gender TEXT, mbti TEXT, interests TEXT, personality TEXT,
       source TEXT, updated_at INTEGER NOT NULL
     )`
  ).run();
}

/* 🔐 2026-08-07 — 링크 서명키를 PAYROLL_INGEST_KEY 에서 떼어냈다.
   원래 토큰은 HMAC-SHA256(PAYROLL_INGEST_KEY, "traits:"+uid) 였다. 문제가 둘이었다.

   ① 이 저장소는 공개(public)인데 PAYROLL_INGEST_KEY 가 wrangler.toml [vars] 에 그대로 있었다.
      서명키가 공개라는 건 **누구나 아무 학생 uid 로 토큰을 위조**할 수 있다는 뜻이다.
      그 토큰이면 그 학생의 성별·MBTI·성격·관심사를 읽고 덮어쓸 수 있다. 살아 있는 개인정보 구멍이었다.
   ② 급여 인제스트 키와 한 값을 공유하니, 급여 키를 회전하는 순간 학부모에게 나간 링크가 전부 죽는다.
      서로 상관없는 두 가지가 한 값에 묶여 있으면 한쪽을 못 고친다.

   그래서 전용 secret(TRAITS_LINK_SECRET)으로 분리한다.
   ⚠️ 여기만은 «옛 키도 인정» 하지 않는다 — 옛 키가 공개된 이상 계속 받아주면 위조가 그대로 통한다.
      즉 이미 발송된 링크가 있다면 무효가 된다. student_traits 0행(아직 아무도 제출한 적 없음)을
      확인하고 택했다. 링크는 관리자 화면에서 다시 만들면 된다.
   ⚠️ 예전 폴백 `|| 'mangoi-traits'` 를 없앴다. secret 이 없으면 «추측 가능한 상수»로 서명하게 되어
      사실상 무방비였다. 이제 secret 이 없으면 토큰을 만들지 않는다(fail closed). */
export async function traitsToken(env: any, uid: string): Promise<string> {
  const keyStr = String(env.TRAITS_LINK_SECRET || '').trim();
  if (!keyStr) {
    console.error('[traits] TRAITS_LINK_SECRET 미설정 — 토큰을 만들지 않는다(fail closed)');
    return '';
  }
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(keyStr) as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('traits:' + uid) as unknown as BufferSource);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

/** 🔐 토큰 검증 — 반드시 이걸 쓸 것. 직접 `t !== await traitsToken(...)` 로 비교하지 말 것.
    traitsToken() 은 secret 미설정 시 '' 를 돌려주는데, 그 상태에서 t 도 '' 로 오면
    `'' !== ''` 가 false 라 **빈 토큰이 통과**한다. 즉 fail-closed 로 바꾼 것이 오히려
    무인증 구멍이 된다. 양쪽 다 비어 있지 않은지 명시적으로 본다. */
async function traitsTokenValid(env: any, uid: string, given: unknown): Promise<boolean> {
  const got = String(given ?? '').trim();
  if (!got) return false;
  const want = await traitsToken(env, uid);
  if (!want) return false;          // secret 미설정 → 아무도 통과 못 한다
  return got === want;
}

async function saveTraits(env: any, uid: string, b: any, source: string): Promise<void> {
  await ensureTable(env);
  const gender = ['M', 'F'].includes(String(b.gender)) ? String(b.gender) : '';
  const mbti = String(b.mbti || '').toUpperCase().replace(/[^EISNTFPJ]/g, '').slice(0, 4);
  const interests = String(b.interests || '').slice(0, 200);
  const personality = String(b.personality || '').slice(0, 300);
  await env.DB.prepare(
    `INSERT INTO student_traits (user_id, gender, mbti, interests, personality, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET gender=excluded.gender, mbti=excluded.mbti,
       interests=excluded.interests, personality=excluded.personality, source=excluded.source, updated_at=excluded.updated_at`
  ).bind(uid, gender, mbti, interests, personality, source, Date.now()).run();
}

/** 재등록 문구 개인화용 — 한 학생의 성향 (없으면 빈 객체) */
export async function getTraits(env: any, uid: string): Promise<any> {
  await ensureTable(env);
  const row: any = await env.DB.prepare(`SELECT gender, mbti, interests, personality FROM student_traits WHERE user_id=?`).bind(uid).first();
  return row || {};
}

export async function handleTraitsApi(request: Request, url: URL, env: any): Promise<Response | null> {
  const path = url.pathname;

  // ── 학부모: 링크 토큰으로 조회 ──
  if (path === '/api/traits/get') {
    const uid = (url.searchParams.get('uid') || '').trim();
    const t = (url.searchParams.get('t') || '').trim();
    if (!uid || !(await traitsTokenValid(env, uid, t))) return json({ ok: false, error: 'invalid_link' }, 403);
    await ensureTable(env);
    const row: any = await env.DB.prepare(`SELECT gender, mbti, interests, personality FROM student_traits WHERE user_id=?`).bind(uid).first();
    const nm: any = await env.DB.prepare(`SELECT korean_name FROM students_erp WHERE user_id=?`).bind(uid).first().catch(() => null);
    return json({ ok: true, traits: row || {}, name: (nm && nm.korean_name) || '' });
  }
  // ── 학부모: 링크 토큰으로 저장 ──
  if (path === '/api/traits/save' && request.method === 'POST') {
    const b: any = await parseJsonBody(request) || {};
    const uid = String(b.uid || '').trim();
    const t = String(b.t || '').trim();
    if (!uid || !(await traitsTokenValid(env, uid, t))) return json({ ok: false, error: 'invalid_link' }, 403);
    await saveTraits(env, uid, b, 'parent');
    return json({ ok: true });
  }
  // ── 관리자: 조회(+발송용 링크토큰) / 저장 ──
  if (path === '/api/admin/student-traits') {
    const adm = await checkAdminSession(request, env as any);
    if (!adm.ok) return json({ ok: false, error: 'auth_required' }, 401);
    if (request.method === 'POST') {
      const b: any = await parseJsonBody(request) || {};
      await saveTraits(env, String(b.uid || '').trim(), b, 'admin');
      return json({ ok: true });
    }
    const uid = (url.searchParams.get('uid') || '').trim();
    await ensureTable(env);
    const row: any = await env.DB.prepare(`SELECT gender, mbti, interests, personality, source, updated_at FROM student_traits WHERE user_id=?`).bind(uid).first();
    return json({ ok: true, traits: row || {}, link_token: await traitsToken(env, uid) });
  }
  return null;
}
