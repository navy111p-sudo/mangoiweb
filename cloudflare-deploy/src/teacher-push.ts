// ═══════════════════════════════════════════════════════════════════════
// 🔔 teacher-push.ts — 강사에게 «웹푸시» 로 알리기 (정본 · 복제 금지)
//   (2026-09-14) 사장님 「카카오톡으로도 교사들에게 가게 할 수 없어?」 → 추천안(웹푸시)으로 결정.
//
//   왜 카카오가 아니라 웹푸시인가 (teacher-kakao.ts 머리말과 같은 사실):
//     · 카카오톡에는 «카카오ID 로 보내는» 공개 API 가 없다.
//     · 알림톡·친구톡은 «전화번호» 로 보내고 **한국 통신사 번호로 가입한 카카오계정**에만 닿는다.
//       강사 전화는 실측 22건 중 21건이 필리핀 09xx → 보내도 도달하지 않는다.
//     → 자동으로 «카톡 알림처럼 폰에 뜨는» 수단은 웹푸시뿐이다(무료 · 국가 제한 없음).
//
//   어떻게 잇는가 — «원부 강사 → 계정 → 구독» 두 다리:
//     teachers.id  ─ teacher_account_links.teacher_id ─▶ username
//     username     ─ push_subscriptions.user_id        ─▶ endpoint
//   ⚠️ 두 번째 다리의 user_id 는 강사 화면(teacher.html)이 구독할 때 **`me.username`**(서버가
//      확인해 준 계정명)으로 적는다. 결재함(work.html)이 같은 값을 쓰므로 «강사 = 결재함
//      사용자» 인 매니저는 한 구독으로 둘 다 받는다.
//   ⚠️ 계정이 둘 이상 이어진 강사(mangoi_168 / Mangoi_168 처럼 대소문자만 다른 중복)는
//      **전부** 에게 보낸다 — 어느 쪽으로 로그인했는지 서버는 모른다. 같은 기기면 endpoint 가
//      같아 push_subscriptions 에는 한 줄이라 두 번 울리지는 않는다.
//
//   ⛔ api-notify.ts 의 sendPushToUser 를 «import» 하지 않는다 — absent-sweep → api-notify →
//      notify-contacts → absent-sweep 순환이 생긴다(모듈 평가 순서에 따라 TDZ 로 죽을 수 있다).
//      그래서 큐 INSERT + wakeup 만 여기서 직접 한다(web-push.ts 만 의존).
//
//   실패 방향: 조회가 죽으면 «못 보냈다»(sent 0 + why) 로 돌려주고 **던지지 않는다** — 부르는
//   쪽이 결석 감시 cron·노쇼 알림이라 여기서 던지면 그 흐름이 통째로 멈춘다.
// ═══════════════════════════════════════════════════════════════════════
import { broadcastWebPush, getWebPushMode } from './web-push';
import { selectInChunks } from './d1-chunk';   // IN 목록은 공용 청크 헬퍼로(바인드 100개 한도 규칙 — 손으로 ? 를 만들지 않는다)

export interface TeacherPushResult {
  ok: boolean;
  sent: number;        // wakeup 이 실제로 나간 endpoint 수
  accounts: number;    // 원부 강사에 이어진 계정 수
  subs: number;        // 그 계정들의 켜진 구독 수
  mode: string;        // web-push 모드(disabled/mock/real)
  why: string;         // sent 가 0 일 때 이유 — no_teacher_id / no_linked_account / no_subscription / lookup_failed …
}

/** 원부 강사(teachers.id) 에 이어진 로그인 계정명 전부. 못 읽으면 빈 배열(+ 이유는 호출부가 남긴다). */
export async function teacherAccountsOf(env: any, teacherId: any): Promise<string[]> {
  const tid = String(teacherId || '').trim();
  if (!tid || !env?.DB) return [];
  try {
    const rs = await env.DB.prepare(
      `SELECT username FROM teacher_account_links WHERE CAST(teacher_id AS TEXT) = ? LIMIT 20`
    ).bind(tid).all();
    const out: string[] = [];
    for (const r of (rs?.results || [])) {
      const u = String((r as any).username || '').trim();
      if (u && out.indexOf(u) < 0) out.push(u);
    }
    return out;
  } catch (e: any) {
    console.warn('[teacher-push] 계정 조회 실패:', e?.message || e);
    return [];
  }
}

/**
 * 원부 강사에게 웹푸시. 구독이 없으면 조용히 0 — 단 why 로 «왜 0인지» 를 말한다.
 * @param extraUsernames 원부와 무관하게 «이 계정에도» 보낼 때(노쇼 알림의 teacher_uid 등). 중복은 한 번만.
 */
export async function pushToTeacher(
  env: any, teacherId: any,
  title: string, body: string, targetUrl: string = '/teacher', tag?: string,
  extraUsernames: string[] = [],
): Promise<TeacherPushResult> {
  const out: TeacherPushResult = { ok: true, sent: 0, accounts: 0, subs: 0, mode: 'disabled', why: '' };
  try { out.mode = getWebPushMode(env as any); } catch { /* env 모양이 달라도 진행 */ }
  const tid = String(teacherId || '').trim();
  const names: string[] = [];
  if (tid) for (const u of await teacherAccountsOf(env, tid)) if (names.indexOf(u) < 0) names.push(u);
  for (const u of (extraUsernames || [])) { const s = String(u || '').trim(); if (s && names.indexOf(s) < 0) names.push(s); }
  out.accounts = names.length;
  if (!names.length) { out.why = tid ? 'no_linked_account' : 'no_teacher_id'; return out; }
  if (!env?.DB) { out.why = 'no_db'; return out; }
  try {
    // 계정 수는 많아야 서너 개지만 IN 목록은 공용 헬퍼로(규칙서 2장 「새 IN 목록」). 조회가 죽으면 그대로 던져 아래 catch 로.
    const rows = await selectInChunks<{ endpoint: string }>(env.DB, names,
      (ph) => `SELECT DISTINCT endpoint FROM push_subscriptions WHERE enabled = 1 AND user_id IN (${ph})`);
    const eps: string[] = [];
    for (const r of rows) { const e = String((r as any).endpoint || ''); if (e && eps.indexOf(e) < 0) eps.push(e); }
    out.subs = eps.length;
    if (!eps.length) { out.why = 'no_subscription'; return out; }
    const now = Date.now();
    const T = String(title || '망고아이 알림').slice(0, 100);
    const B = String(body || '').slice(0, 300);
    const U = targetUrl || '/teacher';
    const TAG = tag || ('teacher-' + now);
    for (const ep of eps) {
      await env.DB.prepare(
        `INSERT INTO push_queue (endpoint, title, body, url, icon, badge, tag, queued_at) VALUES (?,?,?,?,?,?,?,?)`
      ).bind(ep, T, B, U, '/img/icon-192.png', '/img/icon-192.png', TAG, now).run();
    }
    const r = await broadcastWebPush(eps, env as any);
    out.sent = r.sent;
    out.mode = r.mode;
    for (const ep of r.expired) {
      try { await env.DB.prepare(`UPDATE push_subscriptions SET enabled = 0, updated_at = ? WHERE endpoint = ?`).bind(Date.now(), ep).run(); }
      catch (e: any) { console.warn('[teacher-push] 만료 구독 끄기 실패(다음 발송에 또 시도됨):', e?.message || e); }
    }
    if (!out.sent) out.why = r.mode === 'disabled' ? 'push_disabled' : 'send_failed';
    return out;
  } catch (e: any) {
    out.ok = false; out.why = 'lookup_failed';
    console.warn('[teacher-push] 발송 실패:', e?.message || e);
    return out;
  }
}

/**
 * 「📇 강사 연락처 연결」 화면용 — 켜진 푸시 구독이 «하나라도» 있는 원부 강사 id 집합.
 * 못 읽으면 빈 집합(화면은 «푸시 없음» 으로 그린다 — 있는데 없다고 말하는 쪽이 «없는데 있다» 보다 낫다:
 * 없다고 보이면 사람이 한 번 더 켜 보게 되고, 있다고 보이면 아무도 안 켠다).
 */
export async function teacherIdsWithPush(env: any): Promise<Set<string>> {
  const out = new Set<string>();
  if (!env?.DB) return out;
  try {
    const rs = await env.DB.prepare(
      `SELECT DISTINCT CAST(l.teacher_id AS TEXT) AS tid
         FROM teacher_account_links l
         JOIN push_subscriptions p ON p.user_id = l.username AND p.enabled = 1`
    ).all();
    for (const r of (rs?.results || [])) { const t = String((r as any).tid || '').trim(); if (t) out.add(t); }
  } catch (e: any) {
    console.warn('[teacher-push] 구독 강사 조회 실패:', e?.message || e);
  }
  return out;
}
