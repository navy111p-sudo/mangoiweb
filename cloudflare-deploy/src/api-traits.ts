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

/** 링크 토큰 = HMAC-SHA256(PAYROLL_INGEST_KEY, "traits:"+uid) 앞 20자. 폼 위변조·열거 방지. */
export async function traitsToken(env: any, uid: string): Promise<string> {
  const keyStr = String(env.PAYROLL_INGEST_KEY || 'mangoi-traits');
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(keyStr) as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('traits:' + uid) as unknown as BufferSource);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
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
    if (!uid || t !== await traitsToken(env, uid)) return json({ ok: false, error: 'invalid_link' }, 403);
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
    if (!uid || t !== await traitsToken(env, uid)) return json({ ok: false, error: 'invalid_link' }, 403);
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
