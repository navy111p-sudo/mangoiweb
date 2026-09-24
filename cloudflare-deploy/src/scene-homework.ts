/**
 * ✍️ 교재 낱말 쓰기 숙제(장면 탐험대) — 관리자 «숙제 현황» 과 «학부모 안내 문자» 정본 (2026-09-24)
 *
 * 쓰는 곳
 *   · GET  /api/admin/reports/scene-homework?days=30[&uid=]   — 학생별 횟수·정답률·다시 볼 낱말
 *   · POST /api/admin/reports/scene-homework-notify           — 학부모 안내 문자(기본 dry_run)
 *   두 경로 다 accounting-reports.ts 의 reportsRouter 가 «부르기만» 한다.
 *   /api/admin/reports/ 접두사는 ①인증 ②라우팅 ③강사·지사 차단을 이미 들고 있어
 *   src/index.ts(공동 금지구역)를 한 줄도 안 건드린다.
 *
 * 규칙
 *   · 기록은 장면 탐험대가 남긴 것만 센다: game_sessions.game='scene-words', game_progress.game='scene-words'.
 *   · «다시 볼 낱말» 기준은 월간 성적표(api-reports.ts)와 같다 — 틀린 수 ≥ 맞힌 수.
 *     ⚠️ game_progress 횟수는 «누적» 이라 그 기간만의 횟수가 아니다 — 낱말만 싣고 숫자는 안 싣는다.
 *   · ⛔ 없는 기록을 지어내지 않는다 — 한 번도 안 한 학생은 목록에 없다(0 행을 만들지 않는다).
 *   · 문자는 «되돌릴 수 없는 바깥 조작» 이라 dry_run 이 기본이다. confirm:true 일 때만 보낸다.
 *     같은 학생에게 두 번 보내지 않는다(scene_homework_notice_log).
 */

import { phonesForStudent } from './notify-contacts';
import { sendPlainSms } from './solapi-client';
import { getAdminActor, isOrgScopedRole } from './auth-admin';

export const SCENE_GAME = 'scene-words';
export const WEAK_PER_STUDENT = 5;
export const NOTICE_MAX = 200;           // 한 번에 보낼 수 있는 최대 건수(실수로 전원 발송 방지)

/** 기간(일) — 1~90 로 자른다. 모르는 값이면 30. */
export function clampDays(v: any): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(90, n);
}

export interface SceneHomeworkRow {
  uid: string; name: string; sessions: number; items: number; correct: number;
  rate: number | null; last_at: number; weak: string[];
}

/** 세션 행·낱말 행을 학생별로 묶는다(순수 함수 — 하니스가 직접 돌린다). */
export function groupSceneHomework(sess: any[], weakRows: any[], names: Record<string, string>): SceneHomeworkRow[] {
  const weak: Record<string, string[]> = {};
  for (const w of weakRows || []) {
    const u = String(w.user_id || ''); const it = String(w.item || '').trim();
    if (!u || !it) continue;
    const arr = weak[u] || (weak[u] = []);
    if (arr.length < WEAK_PER_STUDENT && arr.indexOf(it) < 0) arr.push(it);
  }
  const out: SceneHomeworkRow[] = [];
  for (const s of sess || []) {
    const u = String(s.uid || ''); if (!u) continue;
    const items = Number(s.it) || 0, correct = Number(s.c) || 0;
    out.push({
      uid: u, name: names[u] || '', sessions: Number(s.n) || 0, items, correct,
      rate: items > 0 ? Math.round((correct / items) * 100) : null,   // 문제가 0이면 «모름»(0% 가 아니다)
      last_at: Number(s.last_at) || 0, weak: weak[u] || [],
    });
  }
  out.sort((a, b) => b.last_at - a.last_at);
  return out;
}

export async function buildSceneHomework(env: any, days: number, uid?: string): Promise<{ since: number; rows: SceneHomeworkRow[] }> {
  const since = Date.now() - clampDays(days) * 86400000;
  const oneUid = String(uid || '').trim();
  const sessSql =
    `SELECT uid, COUNT(*) AS n, COALESCE(SUM(items),0) AS it, COALESCE(SUM(correct),0) AS c, MAX(created_at) AS last_at
       FROM game_sessions WHERE game = ? AND created_at >= ?` + (oneUid ? ` AND uid = ?` : ``) +
    ` GROUP BY uid ORDER BY last_at DESC LIMIT 500`;
  const sb: any[] = [SCENE_GAME, since]; if (oneUid) sb.push(oneUid);
  const sess: any = await env.DB.prepare(sessSql).bind(...sb).all();
  const sessRows: any[] = sess?.results || [];
  if (!sessRows.length) return { since, rows: [] };

  let weakRows: any[] = [];
  try {
    const wSql =
      `SELECT user_id, item FROM game_progress
        WHERE lang = 'en' AND game = ? AND last_seen >= ? AND wrong_count > 0 AND wrong_count >= correct_count` +
      (oneUid ? ` AND user_id = ?` : ``) +
      ` ORDER BY user_id, wrong_count DESC, (wrong_count - correct_count) DESC LIMIT 3000`;
    const wb: any[] = [SCENE_GAME, since]; if (oneUid) wb.push(oneUid);
    const w: any = await env.DB.prepare(wSql).bind(...wb).all();
    weakRows = w?.results || [];
  } catch { weakRows = []; }

  const names: Record<string, string> = {};
  try {
    /* 콤마 문자열 하나로 정확일치(IN (?,?,…) 금지 — D1 바인드 100개 한도). */
    const list = ',' + sessRows.map(r => String(r.uid || '')).filter(u => u && u.indexOf(',') < 0).join(',') + ',';
    const n: any = await env.DB.prepare(
      `SELECT user_id, COALESCE(NULLIF(TRIM(korean_name),''), NULLIF(TRIM(student_name),''), '') AS nm
         FROM students_erp WHERE instr(?, ',' || user_id || ',') > 0`
    ).bind(list).all();
    for (const r of (n?.results || [])) names[String(r.user_id)] = String(r.nm || '');
  } catch { /* 이름 없이도 목록은 그린다 */ }

  return { since, rows: groupSceneHomework(sessRows, weakRows, names) };
}

/** 학부모 안내 문자 본문 — 90바이트를 넘으므로 LMS 로 나간다. 링크는 정본 도메인. */
export function sceneHomeworkNoticeText(name: string): string {
  const who = String(name || '').trim();
  return `[망고아이] ${who ? who + ' 학생' : '자녀'}의 새 숙제 안내\n` +
    `수업한 교재 낱말을 사진을 보고 영어로 직접 써 보는 «교재 낱말 쓰기 숙제»(10분)가 생겼습니다.\n` +
    `오늘의 학습에서 바로 할 수 있고, 틀린 낱말은 월간 성적표에 «다시 볼 낱말»로 모입니다.\n` +
    `https://mangoi.ai/today.html`;
}

/** 번호 정규화 — 숫자만 남기고 10자리 미만은 못 보낸다(발송 게이트와 같은 기준). */
export function dialable(p: any): string {
  const d = String(p || '').replace(/[^0-9]/g, '');
  return d.length >= 10 ? d : '';
}

/**
 * 받는 사람을 모은다 — 같은 번호는 한 번만. 이미 보낸 학생·이미 보낸 «번호» 는 뺀다.
 * candidates: [{uid, name, parent}] (parent 는 phonesForStudent 결과)
 * ⚠️ sentPhones 가 없으면 형제(같은 학부모 번호)가 «다음 실행» 에서 새 대상이 되어 같은 번호로 또 나간다.
 */
export function pickNoticeTargets(candidates: { uid: string; name: string; parent: string }[], sentUids: Set<string>, sentPhones?: Set<string>) {
  const seen = new Set<string>(); const targets: { uid: string; name: string; phone: string }[] = [];
  let already = 0, noPhone = 0;
  for (const c of candidates || []) {
    const u = String(c.uid || ''); if (!u) continue;
    if (sentUids.has(u)) { already++; continue; }
    const ph = dialable(c.parent);
    if (!ph) { noPhone++; continue; }
    if (sentPhones && sentPhones.has(ph)) { already++; continue; }
    if (seen.has(ph)) continue;
    seen.add(ph); targets.push({ uid: u, name: c.name, phone: ph });
  }
  return { targets, already, noPhone };
}

/** 후보가 이보다 많으면 한 요청에서 다 풀지 않는다(Workers 하위요청 한도·반쪽 발송 방지). */
export const NOTICE_CANDIDATE_MAX = 400;

/* ═══ 라우터 — reportsRouter 가 p 가 맞을 때만 부른다 ═══ */

function jres(obj: any, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

export async function sceneHomeworkRouter(env: any, request: Request, url: URL, p: string): Promise<Response | null> {
  if (p === 'scene-homework') {
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
    try {
      const days = clampDays(url.searchParams.get('days'));
      const r = await buildSceneHomework(env, days, url.searchParams.get('uid') || '');
      return jres({ ok: true, days, since: r.since, rows: r.rows });
    } catch (e: any) {
      /* 표가 아직 없으면(아무도 안 함) «0명» 이 사실이다 — 그 외 실패는 «모름» 으로 말한다. */
      const msg = String(e?.message || e);
      if (/no such table/i.test(msg)) return jres({ ok: true, days: clampDays(url.searchParams.get('days')), rows: [] });
      return jres({ ok: false, error: 'query_failed', message: msg }, 500);
    }
  }
  if (p === 'scene-homework-notify') {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    /* 🔐 바깥으로 나가는 조작 — 강사·조직계정을 각각 막는다(접두사 차단에 더해 한 겹 더). */
    const actor: any = await getAdminActor(request, env);
    if (!actor?.ok) return jres({ ok: false, error: 'auth_required' }, 401);
    if (actor.isTeacher || isOrgScopedRole(actor.role)) return jres({ ok: false, error: 'forbidden_scope' }, 403);
    let b: any = {};
    try { b = await request.json(); } catch { b = {}; }
    const send = b && b.confirm === true && b.dry_run === false;   // 둘 다 명시해야 보낸다

    await env.DB.exec(`CREATE TABLE IF NOT EXISTS scene_homework_notice_log (user_id TEXT PRIMARY KEY, phone TEXT, ok INTEGER, sent_at INTEGER, sent_by TEXT)`);
    /* 번호 선점 표 — 같은 번호로 두 번 나가지 않게 «보내기 전에» 한 줄을 차지한다.
       두 요청이 겹쳐도 PRIMARY KEY 가 한쪽만 통과시킨다(멱등 claim). 실패하면 풀어 다시 보낼 수 있게 한다.
       ⚠️ 워커가 도중에 죽으면 그 번호는 선점된 채 남는다 — 두 번 보내는 것보다 안 보내는 쪽으로 실패한다. */
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS scene_homework_notice_claim (phone TEXT PRIMARY KEY, user_id TEXT, at INTEGER)`);
    const sentRs: any = await env.DB.prepare(`SELECT user_id FROM scene_homework_notice_log WHERE ok = 1`).all();
    const sent = new Set<string>(((sentRs?.results || []) as any[]).map(r => String(r.user_id)));
    const clRs: any = await env.DB.prepare(`SELECT phone FROM scene_homework_notice_claim`).all();
    const sentPhones = new Set<string>(((clRs?.results || []) as any[]).map(r => String(r.phone)));

    /* 후보 = 학부모 번호를 «어딘가에» 가진 학생(우리가 받은 번호 표 ∪ 명부), 명부에서 숨긴 학생은 뺀다.
       실제 번호는 정본 phonesForStudent 로 다시 푼다 — 판정을 여기 복제하지 않는다. */
    const LIM = NOTICE_CANDIDATE_MAX + 1;
    let uids: string[] = [];
    try {
      const rs: any = await env.DB.prepare(
        `SELECT user_id FROM student_erp_override WHERE parent_phone IS NOT NULL AND TRIM(parent_phone) <> '' AND COALESCE(hidden,0) = 0
         UNION SELECT user_id FROM students_erp WHERE parent_phone IS NOT NULL AND TRIM(parent_phone) <> ''
           AND user_id NOT IN (SELECT user_id FROM student_erp_override WHERE COALESCE(hidden,0) = 1) LIMIT ${LIM}`
      ).all();
      uids = ((rs?.results || []) as any[]).map(r => String(r.user_id || '')).filter(Boolean);
    } catch {
      const rs: any = await env.DB.prepare(
        `SELECT user_id FROM students_erp WHERE parent_phone IS NOT NULL AND TRIM(parent_phone) <> '' LIMIT ${LIM}`
      ).all();
      uids = ((rs?.results || []) as any[]).map(r => String(r.user_id || '')).filter(Boolean);
    }
    if (uids.length > NOTICE_CANDIDATE_MAX) {
      return jres({ ok: false, error: 'too_many_candidates', max: NOTICE_CANDIDATE_MAX }, 400);
    }
    /* 이름은 한 번에(콤마 문자열 — D1 바인드 100개 한도를 피한다). */
    const names = new Map<string, string>();
    if (uids.length) {
      try {
        const nr: any = await env.DB.prepare(
          `SELECT user_id, COALESCE(NULLIF(TRIM(korean_name),''), NULLIF(TRIM(student_name),''), '') AS nm FROM students_erp WHERE instr(?, ',' || user_id || ',') > 0`
        ).bind(',' + uids.join(',') + ',').all();
        for (const r of ((nr?.results || []) as any[])) names.set(String(r.user_id), String(r.nm || ''));
      } catch { /* 이름이 없어도 보낸다(«자녀» 로 부름) */ }
    }
    const cands: { uid: string; name: string; parent: string }[] = [];
    for (let i = 0; i < uids.length; i += 10) {
      const chunk = uids.slice(i, i + 10);
      const got = await Promise.all(chunk.map(async u => {
        try { return { uid: u, name: names.get(u) || '', parent: (await phonesForStudent(env, u)).parent }; }
        catch { return { uid: u, name: names.get(u) || '', parent: '' }; }
      }));
      cands.push(...got);
    }
    const pick = pickNoticeTargets(cands, sent, sentPhones);
    const sample = sceneHomeworkNoticeText(pick.targets[0]?.name || '');
    if (!send) {
      return jres({ ok: true, dry_run: true, targets: pick.targets.length, already_sent: pick.already, no_phone: pick.noPhone,
        sample, names: pick.targets.map(t => t.name || '(이름 없음)') });
    }
    if (pick.targets.length > NOTICE_MAX) return jres({ ok: false, error: 'too_many', targets: pick.targets.length, max: NOTICE_MAX }, 400);
    let okN = 0, failN = 0, skipN = 0; const fails: string[] = []; let mode = '';
    for (const t of pick.targets) {
      /* 선점 — 못 차지하면(동시 요청이 먼저 가져감) 건너뛴다. */
      let claimed = false;
      try {
        const cr: any = await env.DB.prepare(`INSERT OR IGNORE INTO scene_homework_notice_claim (phone, user_id, at) VALUES (?,?,?)`)
          .bind(t.phone, t.uid, Date.now()).run();
        claimed = Number(cr?.meta?.changes || 0) === 1;
      } catch { claimed = false; }
      if (!claimed) { skipN++; continue; }
      let ok = false;
      try {
        const r = await sendPlainSms(env, t.phone, sceneHomeworkNoticeText(t.name), { subject: '망고아이 숙제 안내' });
        mode = String(r.mode || mode); ok = !!r.ok;
        if (!ok) fails.push((t.name || '(이름 없음)') + ': ' + (r.error || r.message || 'failed'));
      } catch (e: any) { fails.push((t.name || '(이름 없음)') + ': ' + String(e?.message || e)); }
      if (ok) okN++; else failN++;
      if (!ok) {
        try { await env.DB.prepare(`DELETE FROM scene_homework_notice_claim WHERE phone = ? AND user_id = ?`).bind(t.phone, t.uid).run(); } catch { /* 풀지 못하면 다시 안 보낸다 — 안전한 방향 */ }
      }
      try {
        await env.DB.prepare(`INSERT OR REPLACE INTO scene_homework_notice_log (user_id, phone, ok, sent_at, sent_by) VALUES (?,?,?,?,?)`)
          .bind(t.uid, t.phone, ok ? 1 : 0, Date.now(), String(actor.username || '')).run();
      } catch { /* 기록 실패는 발송 결과를 바꾸지 않는다 — 선점 표가 중복을 막는다 */ }
    }
    return jres({ ok: true, dry_run: false, mode, sent: okN, failed: failN, skipped: skipN, fails });
  }
  return null;
}
