/**
 * api-retention.ts — 수강권 만료·재활성 관리 (기간제 정기수업 모델)
 *
 *  이 시스템은 "N회권"이 아니라 "시작일~만료일 매주 정기수업"(기간제)이다.
 *  그래서 '잔여 횟수'가 아니라, 매출·리텐션에 직결되는 다음 대상을 관리한다:
 *    - expiring : 만료 임박(30일 내) 활성 학생 → 갱신 유도
 *    - expired  : 최근 만료된(60일 내) 활성 학생 → 재등록 권유
 *    - inactive : 활성인데 최근(21~90일) 수업이 끊긴 학생 → 이탈 위험, 재활성 연락
 *
 *  데이터 흐름(급여 자동화와 동일): 카페24 서버가 mangoi MySQL 에서 위 대상을 집계해
 *    /api/retention-ingest(공유키 PAYROLL_INGEST_KEY)로 push → D1 student_retention →
 *    /admin/retention 화면이 이름(students_erp 조인)·만료·휴면일수와 함께 표시.
 */
import { json, parseJsonBody } from './api-util';
import { sendPlainSms } from './solapi-client';
import { getTraits } from './api-traits';

const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

async function ensureTable(env: any): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS student_retention (
       user_id TEXT PRIMARY KEY,
       member_id INTEGER,
       start_date TEXT,
       end_date TEXT,
       last_class TEXT,
       days_inactive INTEGER,
       days_to_expiry INTEGER,
       category TEXT,
       contacted INTEGER DEFAULT 0,
       contacted_at INTEGER,
       updated_at INTEGER NOT NULL
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_student_retention_cat ON student_retention(category, days_to_expiry)`).run();
  // 전화번호(만료·휴면 대상만, 카페24에서 복호화되어 들어옴) 칸 추가
  try { await env.DB.prepare(`ALTER TABLE student_retention ADD COLUMN phone TEXT`).run(); } catch (_) {}
  // 나이(카페24 MemberBirthday로 계산, 개인화 문구용) — 성별은 데이터 신뢰불가라 미사용
  try { await env.DB.prepare(`ALTER TABLE student_retention ADD COLUMN age INTEGER`).run(); } catch (_) {}
  // 발송 로그 (재발송 방지·감사)
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS retention_messages (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL, phone TEXT, category TEXT, channel TEXT,
       message TEXT, status TEXT, detail TEXT, sent_at INTEGER NOT NULL
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_retention_msg_user ON retention_messages(user_id, sent_at)`).run();
  // 설정 (단일 행)
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS retention_settings (
       id INTEGER PRIMARY KEY CHECK(id=1),
       auto_enabled INTEGER DEFAULT 0, daily_cap INTEGER DEFAULT 20,
       resend_gap_days INTEGER DEFAULT 30, link_url TEXT, updated_at INTEGER
     )`
  ).run();
}

const DEFAULT_LINK = 'https://test.mangoi.co.kr';

export async function getRetentionSettings(env: any): Promise<any> {
  await ensureTable(env);
  const r: any = await env.DB.prepare(`SELECT * FROM retention_settings WHERE id=1`).first().catch(() => null);
  return {
    auto_enabled: r?.auto_enabled ? 1 : 0,
    daily_cap: r?.daily_cap || 20,
    resend_gap_days: r?.resend_gap_days || 30,
    link_url: r?.link_url || DEFAULT_LINK,
  };
}

export async function setRetentionSettings(env: any, s: any): Promise<any> {
  await ensureTable(env);
  const cur = await getRetentionSettings(env);
  const auto = s.auto_enabled == null ? cur.auto_enabled : (s.auto_enabled ? 1 : 0);
  const cap = Math.max(1, Math.min(500, Number(s.daily_cap) || cur.daily_cap));
  const gap = Math.max(1, Math.min(180, Number(s.resend_gap_days) || cur.resend_gap_days));
  const link = String(s.link_url || cur.link_url).slice(0, 300);
  await env.DB.prepare(
    `INSERT INTO retention_settings (id, auto_enabled, daily_cap, resend_gap_days, link_url, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET auto_enabled=excluded.auto_enabled, daily_cap=excluded.daily_cap,
       resend_gap_days=excluded.resend_gap_days, link_url=excluded.link_url, updated_at=excluded.updated_at`
  ).bind(auto, cap, gap, link, Date.now()).run();
  return { auto_enabled: auto, daily_cap: cap, resend_gap_days: gap, link_url: link };
}

/** 🤖 AI 맞춤 설득 문구 — 카테고리별 톤 + 학생 이름 + 결제/재등록 링크. lang='ko'|'en' */
export async function buildRetentionMessage(env: any, row: any, opts: { link?: string; lang?: string } = {}): Promise<string> {
  const name = row.name || '학생';
  const link = opts.link || DEFAULT_LINK;
  const cat = row.category;
  // 카테고리별 감정 앵글 (판매 톤이 아니라, 아이를 진심으로 아끼는 담임 선생님의 마음이 재등록률을 높인다)
  const guide: any = {
    expiring: '이 아이의 수강 기간이 곧 끝나요. 그동안 이 아이가 보여준 작은 성장과 노력을 구체적으로 떠올리며 진심으로 칭찬하고, 지금의 좋은 흐름과 영어에 대한 자신감이 끊기면 아쉬운 마음을 담아 자연스럽게 계속 함께하자고 권유하세요. 압박이 아니라 아이를 위하는 진심으로.',
    expired: '이 아이의 수강이 최근 끝났어요. 아이의 빈자리가 느껴져 보고 싶다는 마음을 전하고, 다시 오면 예전처럼 반갑게 이어서 시작할 수 있다고 따뜻하게 문을 열어두세요. 부담 없이, 언제든 환영한다는 진심으로.',
    inactive: '이 아이가 요즘 수업에 뜸해요. 절대 판매가 아니라 순수한 걱정과 안부예요. 아이가 잘 지내는지 궁금하고 보고 싶은 선생님의 마음을 전하고, 혹시 힘든 일이나 도와줄 것이 있는지 다정하게 물어보세요.',
  };
  let ai = '';
  try {
    if (env.AI) {
      const sys = [
        '너는 어린이 화상영어 학원 "망고아이"의, 아이를 진심으로 사랑하고 아끼는 다정한 담임 선생님이야.',
        '학부모님께 보내는 문자 메시지를 한국어 존댓말로 써. 3~4문장, 너무 길지 않게.',
        '핵심 태도: ①아이를 진심으로 아끼는 따뜻한 마음이 느껴지게 ②학부모의 상황에 공감하며 ③아이의 이름을 자연스럽게 부르고 ④구체적이고 진심 어린 칭찬/걱정으로 마음을 움직이게(설득력).',
        '절대 하지 말 것: 과장, 강매, "할인/이벤트/마감" 같은 판매 압박, 사무적이고 딱딱한 문투.',
        '이모지는 0~1개만, 진정성 있게. 문장 끝에 "아래 링크", "링크를 눌러" 같은 말은 넣지 마(링크는 시스템이 따로 붙임).',
        '따옴표로 감싸지 말고 문자 본문만 출력해.',
      ].join(' ');
      // 나이대별 말투 힌트 (있을 때만)
      let ageHint = '';
      const ag = Number(row.age);
      if (ag >= 3 && ag <= 100) {
        let band = '';
        if (ag <= 7) band = `${ag}살 어린 유아라, 아주 다정하고 사랑스럽게, 아이의 귀여운 성장을 흐뭇해하는 마음으로`;
        else if (ag <= 10) band = `${ag}살 초등 저학년이라, 따뜻하고 격려하는 말투로, 아이가 재밌게 배우는 모습을 칭찬하며`;
        else if (ag <= 13) band = `${ag}살 초등 고학년이라, 아이의 노력을 인정하고 자신감을 북돋우는 말투로`;
        else band = `${ag}살 청소년이라, 아이를 한 사람으로 존중하면서도 따뜻하게, 학습 부담에 공감하며`;
        ageHint = `\n아이 나이: ${band} 써줘.`;
      }
      // 🧬 성향(학부모가 알려준 값) — 있으면 더 정교하게 개인화
      let traitHint = '';
      try {
        const tr: any = await getTraits(env, row.user_id);
        const parts: string[] = [];
        if (tr.gender === 'M') parts.push('남자아이'); else if (tr.gender === 'F') parts.push('여자아이');
        if (tr.mbti && tr.mbti.length === 4) parts.push(`MBTI ${tr.mbti}(성향에 맞춰 결이 통하는 표현으로)`);
        if (tr.interests) parts.push(`좋아하는 것: ${tr.interests}(자연스럽게 살짝 언급하면 좋아요)`);
        if (tr.personality) parts.push(`성격: ${tr.personality}`);
        if (parts.length) traitHint = `\n아이 성향: ${parts.join(' / ')}. 이 아이만을 위한 말처럼 느껴지게 반영해줘.`;
      } catch (_) {}
      const usr = `학생(아이) 이름: ${name}\n담임 선생님으로서의 상황과 마음: ${guide[cat] || guide.inactive}${ageHint}${traitHint}\n학원 이름: 망고아이`;
      const res: any = await env.AI.run(AI_MODEL, { messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], max_tokens: 320, temperature: 0.8 });
      ai = String(res?.response || '').trim().replace(/^["'\s]+|["'\s]+$/g, '');
    }
  } catch (_) { ai = ''; }
  if (!ai) {
    // AI 실패 시 안전한 기본 문구 (따뜻·공감·설득)
    const fb: any = {
      expiring: `${name} 학부모님, 안녕하세요. 망고아이 담임입니다. ${name}이가 그동안 한 걸음씩 정말 예쁘게 성장하는 모습을 곁에서 지켜보며 참 뿌듯했어요. 이제 막 영어에 자신감이 붙기 시작한 지금, 좋은 흐름이 끊기지 않고 ${name}이와 계속 함께할 수 있으면 참 좋겠습니다. 😊`,
      expired: `${name} 학부모님, 안녕하세요. 망고아이 담임입니다. 요즘 수업에서 ${name}이의 밝은 얼굴이 보이지 않아 마음 한켠이 허전했어요. ${name}이가 다시 돌아오면 예전처럼 반갑게, 바로 이어서 시작할 수 있도록 자리를 소중히 남겨두었습니다. 언제든 편하게 와 주세요.`,
      inactive: `${name} 학부모님, 안녕하세요. 망고아이 담임입니다. 요즘 ${name}이가 수업에 뜸해서, 잘 지내고 있는지 문득 궁금하고 보고 싶은 마음에 연락드려요. 혹시 ${name}이에게 힘든 일이 있거나 저희가 도와드릴 부분이 있다면 언제든 편히 말씀해 주세요.`,
    };
    ai = fb[cat] || fb.inactive;
  }
  return `[망고아이] ${ai}\n▶ ${link}`;
}

/** 서버(카페24) → 워커 인제스트. /api/retention-ingest?key=...  전량 교체(snapshot). */
export async function handleRetentionIngest(request: Request, url: URL, env: any): Promise<Response | null> {
  if (url.pathname !== '/api/retention-ingest') return null;
  const expected = String(env.PAYROLL_INGEST_KEY || '').trim();
  const given = String(url.searchParams.get('key') || '').trim();
  if (!expected || given !== expected) return json({ ok: false, error: 'forbidden' }, 403);
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const body = await parseJsonBody(request) || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  await ensureTable(env);
  const now = Date.now();

  // 스냅샷 방식: '연락함' 표시는 보존하고, 나머지는 새로 덮어씀.
  //   먼저 이번에 안 들어온(=이제 대상 아닌) 학생은 목록에서 제거하되, contacted 표시는 남기지 않음(대상 해제).
  const incoming = new Set(rows.map((r: any) => String(r.user_id || '')).filter(Boolean));
  // 기존 목록 중 이번 스냅샷에 없는 것 삭제
  try {
    const existing = await env.DB.prepare(`SELECT user_id FROM student_retention`).all();
    for (const e of (existing.results || [])) {
      if (!incoming.has(String((e as any).user_id))) {
        await env.DB.prepare(`DELETE FROM student_retention WHERE user_id=?`).bind((e as any).user_id).run();
      }
    }
  } catch (_) {}

  let upserted = 0;
  for (const r of rows) {
    const uid = String(r.user_id || '').trim();
    if (!uid) continue;
    try {
      // 전화번호 정규화 (숫자만, 010… 형태). 없으면 null.
      const phoneRaw = String(r.phone || '').replace(/[^0-9]/g, '');
      const phone = (phoneRaw.length >= 9 && phoneRaw.length <= 12) ? phoneRaw : null;
      const ageN = Number(r.age);
      const age = (ageN >= 3 && ageN <= 100) ? Math.round(ageN) : null;
      await env.DB.prepare(
        `INSERT INTO student_retention (user_id, member_id, start_date, end_date, last_class, days_inactive, days_to_expiry, category, phone, age, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           member_id=excluded.member_id, start_date=excluded.start_date, end_date=excluded.end_date,
           last_class=excluded.last_class, days_inactive=excluded.days_inactive, days_to_expiry=excluded.days_to_expiry,
           category=excluded.category, phone=excluded.phone, age=excluded.age, updated_at=excluded.updated_at`
      ).bind(uid, Number(r.member_id) || null, r.start_date || null, r.end_date || null, r.last_class || null,
        r.days_inactive == null ? null : Number(r.days_inactive), r.days_to_expiry == null ? null : Number(r.days_to_expiry),
        String(r.category || 'inactive'), phone, age, now).run();
      upserted++;
    } catch (_) {}
  }
  return json({ ok: true, upserted, received: rows.length });
}

/** '연락함' 토글 (관리자) */
export async function markRetentionContacted(env: any, userId: string, contacted: boolean): Promise<void> {
  await ensureTable(env);
  await env.DB.prepare(`UPDATE student_retention SET contacted=?, contacted_at=? WHERE user_id=?`)
    .bind(contacted ? 1 : 0, contacted ? Date.now() : null, userId).run();
}

/** 관리자 조회 — 카테고리별 목록 + 이름(students_erp 조인) + 요약 */
export async function getRetention(env: any, type: string): Promise<any> {
  await ensureTable(env);
  const cat = ['expiring', 'expired', 'inactive'].includes(type) ? type : null;
  // 이름은 students_erp 에서 조인 (없으면 user_id 표시). 정렬: 만료 임박/휴면 오래된 순.
  const where = cat ? `WHERE r.category=?` : ``;
  const orderBy = cat === 'inactive'
    ? `ORDER BY r.days_inactive DESC`
    : `ORDER BY r.days_to_expiry ASC`;
  const stmt = env.DB.prepare(
    `SELECT r.user_id, r.member_id, r.start_date, r.end_date, r.last_class, r.days_inactive, r.days_to_expiry,
            r.category, r.contacted, r.phone, s.korean_name AS name,
            (SELECT MAX(m.sent_at) FROM retention_messages m WHERE m.user_id=r.user_id AND m.status='sent') AS last_msg_at
     FROM student_retention r
     LEFT JOIN students_erp s ON s.user_id = r.user_id
     ${where} ${orderBy} LIMIT 500`
  );
  const q = cat ? await stmt.bind(cat).all() : await stmt.all();
  const rows = (q.results || []).map((r: any) => ({ ...r, has_phone: r.phone ? 1 : 0, phone: undefined }));
  // 카테고리별 카운트
  const counts: any = { expiring: 0, expired: 0, inactive: 0, total: 0 };
  const cq = await env.DB.prepare(`SELECT category, COUNT(*) AS n FROM student_retention GROUP BY category`).all().catch(() => ({ results: [] }));
  for (const c of ((cq.results as any[]) || [])) { if (counts[c.category] != null) counts[c.category] = c.n; counts.total += c.n; }
  const updated = await env.DB.prepare(`SELECT MAX(updated_at) AS u FROM student_retention`).first().catch(() => null);
  return { rows, counts, updated_at: (updated as any)?.u || 0, settings: await getRetentionSettings(env) };
}

/** 미리보기 — 한 학생의 문자 문구 생성(발송 안 함) */
export async function previewRetentionMessage(env: any, userId: string): Promise<any> {
  await ensureTable(env);
  const row: any = await env.DB.prepare(
    `SELECT r.user_id, r.category, r.phone, s.korean_name AS name
     FROM student_retention r LEFT JOIN students_erp s ON s.user_id=r.user_id WHERE r.user_id=?`
  ).bind(userId).first();
  if (!row) return { ok: false, error: 'not_found' };
  const s = await getRetentionSettings(env);
  const msg = await buildRetentionMessage(env, row, { link: s.link_url });
  return { ok: true, message: msg, has_phone: row.phone ? 1 : 0, name: row.name || userId };
}

/**
 * 발송 — userIds 각각에 대해: 안전장치(전화有·재발송갭·하루상한) 통과 시 AI문구 생성→SOLAPI 발송→로그.
 *   auto=true 면 자동발송 모드(설정 auto_enabled 확인). preview 문구가 아닌 실제 발송.
 */
export async function sendRetentionMessages(env: any, userIds: string[], opts: { by?: string } = {}): Promise<any> {
  await ensureTable(env);
  const s = await getRetentionSettings(env);
  const now = Date.now();
  const dayStart = now - (now % 86400000);
  // 오늘 이미 보낸 수 (하루 상한)
  const sentToday: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM retention_messages WHERE status='sent' AND sent_at>=?`).bind(dayStart).first().catch(() => ({ n: 0 }));
  let budget = Math.max(0, (s.daily_cap || 20) - (sentToday?.n || 0));
  const gapMs = (s.resend_gap_days || 30) * 86400000;
  const results: any[] = [];
  for (const uid of userIds) {
    if (budget <= 0) { results.push({ user_id: uid, status: 'skipped', reason: 'daily_cap' }); continue; }
    const row: any = await env.DB.prepare(
      `SELECT r.user_id, r.category, r.phone, r.age, s.korean_name AS name
       FROM student_retention r LEFT JOIN students_erp s ON s.user_id=r.user_id WHERE r.user_id=?`
    ).bind(uid).first();
    if (!row) { results.push({ user_id: uid, status: 'skipped', reason: 'not_found' }); continue; }
    if (!row.phone) { results.push({ user_id: uid, status: 'skipped', reason: 'no_phone' }); continue; }
    // 재발송 방지: gap 내 이미 발송했으면 skip
    const recent: any = await env.DB.prepare(`SELECT MAX(sent_at) AS t FROM retention_messages WHERE user_id=? AND status='sent'`).bind(uid).first().catch(() => null);
    if (recent?.t && (now - recent.t) < gapMs) { results.push({ user_id: uid, status: 'skipped', reason: 'recently_sent' }); continue; }

    const msg = await buildRetentionMessage(env, row, { link: s.link_url });
    let status = 'sent', detail = '';
    try {
      const r: any = await sendPlainSms(env, row.phone, msg);
      if (!(r && (r.ok || r.smsSent || r.success))) { status = 'failed'; detail = JSON.stringify(r).slice(0, 200); }
    } catch (e: any) { status = 'failed'; detail = String(e?.message || e).slice(0, 200); }
    await env.DB.prepare(
      `INSERT INTO retention_messages (user_id, phone, category, channel, message, status, detail, sent_at) VALUES (?,?,?,?,?,?,?,?)`
    ).bind(uid, row.phone, row.category, 'sms', msg, status, detail, now).run();
    if (status === 'sent') {
      budget--;
      // 발송 성공 = 연락함 표시
      await env.DB.prepare(`UPDATE student_retention SET contacted=1, contacted_at=? WHERE user_id=?`).bind(now, uid).run();
    }
    results.push({ user_id: uid, status, reason: detail || undefined });
  }
  const sent = results.filter(r => r.status === 'sent').length;
  return { ok: true, sent, total: userIds.length, remaining_today: budget, results };
}

/** 자동 발송(cron) — auto_enabled 이면 오늘 대상 중 미발송분을 하루상한까지 발송 */
export async function runRetentionAutoSend(env: any): Promise<any> {
  const s = await getRetentionSettings(env);
  if (!s.auto_enabled) return { skipped: 'auto_disabled' };
  // 전화 있고 아직 연락 안 한 대상 (만료임박 우선) 하루상한까지
  const q = await env.DB.prepare(
    `SELECT user_id FROM student_retention
     WHERE phone IS NOT NULL AND phone<>'' AND COALESCE(contacted,0)=0
     ORDER BY (category='expiring') DESC, (category='expired') DESC, days_to_expiry ASC LIMIT ?`
  ).bind(s.daily_cap || 20).all().catch(() => ({ results: [] }));
  const ids = ((q.results as any[]) || []).map(r => r.user_id);
  if (!ids.length) return { sent: 0, note: 'no_targets' };
  return await sendRetentionMessages(env, ids, { by: 'auto-cron' });
}
