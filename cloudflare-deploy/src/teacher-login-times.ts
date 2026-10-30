/* ═══════════════════════════════════════════════════════════════════════════
   🔐 강사 로그인·접속 시각 — 정본 (2026-10-30 매니저 제안 «add teacher's log in time»)

   [왜] 매니저가 «강사가 오늘 언제 들어왔는지» 를 볼 곳이 없었다. 로그인 기록(admin_login_history)은
     마이페이지에서 «자기 것» 만 보였다.

   [무엇을 보여 주나 — 하루(KST) 단위]
     · 로그인     — 그날 «진짜 로그인» 의 처음·마지막 시각과 횟수.
     · 첫 접속    — 그날 처음 화면을 쓴 시각(로그인 «또는» 이미 로그인된 상태에서 처음 연 시각).
     · 마지막 활동 — 그날 마지막으로 화면을 쓴 시각(오늘만 — 지난날은 덮여 써져 알 수 없다).
     · 로그인 실패 — 그날 비밀번호·2단계 인증 실패 횟수.

   [왜 «로그인» 만으로는 안 되나]
     관리자 세션은 30일짜리이고 새벽 4시(KST)에 맞춰 늘어난다(auth-admin.ts sessionRenewalPlan).
     그래서 강사는 매일 다시 로그인하지 않는다 — 로그인 시각만 보여 주면 대부분 «오늘 로그인 없음» 이
     되어 «안 들어왔다» 로 오독된다. 그래서 «그날 처음 쓴 시각» 을 따로 적는다(admin_daily_seen).

   [admin_daily_seen 을 어떻게 적나]
     checkAdminSession 이 세션의 last_seen_at 을 갱신할 때, 그 값이 «오늘 0시(KST) 이전» 이면
     — 즉 그 세션이 오늘 처음 쓰이는 순간 — 한 줄을 적는다(세션마다 하루 한 번만 쓴다).
     ⚠️ 탭을 연 채 자정을 넘기면(직전 활동과 15분 이내) 그것은 «출근» 이 아니라 «이어서 접속» 이다 —
        first_seen_at 이 아니라 carried_at 칸에 따로 적는다. 화면은 그것을 시작 시각이라 부르지 않는다.
     ⚠️ 이 기록은 배포한 «뒤» 부터 쌓인다. 그 전 날짜는 로그인 기록만 있다(화면이 그렇게 말한다).

   [무엇을 «로그인» 으로 세나]
     admin_login_history 의 success=1 에는 로그인이 아닌 이벤트도 섞여 있다 —
     reason='pwreset_done' · 'created_by:…' · 'password_reset_by:…' · 'contact_set_by:…'.
     진짜 로그인은 issueAdminSession 이 남기는 reason NULL 행뿐이다(비밀번호·지문·옛 LMS 통과 모두).
     ⛔ success=1 만 보고 세지 말 것 — 비밀번호를 바꿔 준 날이 «로그인한 날» 이 된다.

   [누가 볼 수 있나]
     · 강사 목록 — 본사만(GET /api/admin/login-history?scope=teachers). 강사는 index.ts 가 그 경로를 막고,
       지사·대리점은 여기서 admin_scope 를 «다시 읽어» 막는다(못 읽으면 막는다 — org-scope-guard).
     · 자기 기록 — 강사 포털 GET /api/teacher/portal?part=my_login (자기 계정만, 클라이언트 값 안 믿음).
     ⛔ IP·기기 정보는 싣지 않는다 — 출근 시각을 보려는 화면이지 보안 감사 화면이 아니다.

   ⚠️ 이 파일은 auth-admin.ts 를 import 하지 않는다(auth-admin 이 이 파일을 부르므로 순환을 피한다).
      역할 판정·세션 확인은 부르는 쪽이 함수로 넘겨준다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { selectInChunks } from './d1-chunk';
import { orgScopeVerdict, readScopeType, orgScopeDenyResponse } from './org-scope-guard';
import { forbiddenTeacherBody } from './forbidden-teacher';

const KST = 9 * 3600 * 1000;
const DAY = 86400000;
/** 직전 활동과 이만큼 안이면 자정을 «넘겨 이어진» 접속으로 본다. */
export const CARRY_GAP_MS = 15 * 60 * 1000;
/** 마지막 활동이 이만큼 안이면 «지금 접속 중». (강사 화면은 열려 있으면 45초마다 서버를 부른다) */
export const ONLINE_MS = 3 * 60 * 1000;
/** 강사 «내 기록» 카드가 보여 주는 날 수. */
export const MY_LOGIN_DAYS = 14;
/** 로그인 «실패» 로 세는 사유 — 비밀번호·2단계 인증·잠김. 비번 재설정 요청 등은 로그인 시도가 아니다. */
export const FAILED_LOGIN_REASONS = ['wrong_password', 'wrong_2fa', 'locked_bruteforce'];

/* ── 날짜 ──────────────────────────────────────────────────────────────── */
export function kstDayStart(ms: number): number {
  return Math.floor((ms + KST) / DAY) * DAY - KST;
}
export function kstYmd(ms: number): string {
  return new Date(ms + KST).toISOString().slice(0, 10);
}
/** YYYY-MM-DD 이고 실제로 있는 날짜면 그 날 0시(KST) 의 ms, 아니면 null. */
export function ymdStart(ymd: string): number | null {
  const s = String(ymd || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) return null;
  const t = Date.parse(s + 'T00:00:00+09:00');
  if (!Number.isFinite(t) || kstYmd(t) !== s) return null;   // 2026-02-31 같은 날짜를 거른다
  return t;
}

/* ── 쓰기: 그날 처음 쓴 시각 ───────────────────────────────────────────── */

export type DailySeenPlan = { ymd: string; first_seen_at: number | null; carried_at: number | null };

/** 순수 판정 — 직전 활동(prevSeen)이 오늘(KST) 이전일 때만 «오늘 처음» 이다. 모르면 null(안 적음). */
export function dailySeenPlan(prevSeen: number, now: number): DailySeenPlan | null {
  if (!Number.isFinite(prevSeen) || !Number.isFinite(now) || prevSeen <= 0 || now <= 0) return null;
  if (prevSeen > now) return null;                       // 시계가 뒤로 간 행 — 판단하지 않는다
  if (prevSeen >= kstDayStart(now)) return null;         // 오늘 이미 쓴 세션
  const carried = now - prevSeen <= CARRY_GAP_MS;        // 자정 직전까지 쓰던 탭 — «출근» 이 아니다
  return { ymd: kstYmd(now), first_seen_at: carried ? null : now, carried_at: carried ? now : null };
}

const ready = new WeakMap<object, Promise<void>>();
/** ⚠️ D1 exec() 는 줄마다 따로 실행한다 — 여러 줄 CREATE 는 prepare().run() 으로(CLAUDE.md 2장). */
export async function ensureDailySeen(db: any): Promise<void> {
  let task = ready.get(db);
  if (!task) {
    task = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS admin_daily_seen (
        username TEXT NOT NULL, ymd TEXT NOT NULL,
        first_seen_at INTEGER, carried_at INTEGER,
        PRIMARY KEY (username, ymd))`).run();
    })();
    ready.set(db, task);
    task.catch(() => { ready.delete(db); });
  }
  await task;
}

/** 세션이 그날 처음 쓰일 때 한 줄. 같은 날 두 번째 세션은 «더 이른 시각» 만 남긴다.
 *  ⚠️ 절대 던지지 않는다 — 로그인 판정(checkAdminSession) 안에서 불린다. */
export async function noteDailySeen(db: any, username: string, plan: DailySeenPlan | null): Promise<void> {
  const u = String(username || '').trim();
  if (!plan || !u) return;
  try {
    await ensureDailySeen(db);
    await db.prepare(
      `INSERT INTO admin_daily_seen (username, ymd, first_seen_at, carried_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(username, ymd) DO UPDATE SET
         first_seen_at = COALESCE(MIN(admin_daily_seen.first_seen_at, excluded.first_seen_at), admin_daily_seen.first_seen_at, excluded.first_seen_at),
         carried_at    = COALESCE(MIN(admin_daily_seen.carried_at, excluded.carried_at), admin_daily_seen.carried_at, excluded.carried_at)`
    ).bind(u, plan.ymd, plan.first_seen_at, plan.carried_at).run();
  } catch (e: any) { console.warn('[teacher-login] daily seen:', e?.message); }
}

/* ── 읽기: 하루 요약 (순수 — 하니스가 그대로 돌린다) ─────────────────────── */

export type LoginRow = { username: string; login_at: number; success: number; reason: string | null };
export type SeenRow = { username?: string; ymd?: string; first_seen_at: number | null; carried_at: number | null };

export function isRealLogin(r: any): boolean {
  return Number(r?.success) === 1 && (r?.reason == null || String(r.reason).trim() === '');
}
export function isFailedLogin(r: any): boolean {
  return Number(r?.success) === 0 && FAILED_LOGIN_REASONS.indexOf(String(r?.reason ?? '')) >= 0;
}

export type LoginDay = {
  date: string;
  /** login(그날 로그인) · active(로그인 유지 상태로 처음 접속) · carried(자정을 넘겨 계속 접속) · seen(활동은 있는데 시작 기록 없음) · none */
  state: 'login' | 'active' | 'carried' | 'seen' | 'none';
  first_login_at: number | null;
  last_login_at: number | null;
  login_count: number;
  failed_count: number;
  first_active_at: number | null;
  carried_at: number | null;
  last_active_at: number | null;
  online: boolean;
};

/**
 * 한 계정·한 날짜의 요약.
 * @param logins   그 계정의 로그인 기록(날짜 상관없이 넘겨도 된다 — 그날 것만 쓴다)
 * @param seen     그날의 admin_daily_seen 행(없으면 null)
 * @param lastSeen 그 계정 세션들의 last_seen_at 최댓값(모르면 null) — 그날 안일 때만 «마지막 활동»
 */
export function summarizeLoginDay(dayStart: number, now: number, logins: any[], seen: SeenRow | null,
  lastSeen: number | null): LoginDay {
  const dayEnd = dayStart + DAY;
  let first: number | null = null, last: number | null = null, count = 0, failed = 0;
  for (const r of (logins || [])) {
    const t = Number(r?.login_at);
    if (!Number.isFinite(t) || t < dayStart || t >= dayEnd) continue;
    if (isRealLogin(r)) {
      count++;
      if (first == null || t < first) first = t;
      if (last == null || t > last) last = t;
    } else if (isFailedLogin(r)) failed++;
  }
  const inDay = (v: any): number | null => {
    const t = Number(v);
    return v != null && Number.isFinite(t) && t >= dayStart && t < dayEnd ? t : null;
  };
  const seenFirst = inDay(seen?.first_seen_at);
  const carried = inDay(seen?.carried_at);
  const cands = [first, seenFirst].filter((v): v is number => v != null);
  const firstActive = cands.length ? Math.min(...cands) : null;
  // 마지막 활동 — 세션 last_seen 이 그날 안일 때만(지난날은 그 뒤 활동으로 덮였을 수 있다). 로그인도 활동이다.
  const lastCands = [inDay(lastSeen), last, firstActive, carried].filter((v): v is number => v != null);
  const lastActive = lastCands.length ? Math.max(...lastCands) : null;
  const online = lastActive != null && now >= dayStart && now < dayEnd && now - lastActive >= 0 && now - lastActive <= ONLINE_MS;
  const state: LoginDay['state'] = count > 0 ? 'login'
    : seenFirst != null ? 'active'
    : carried != null ? 'carried'
    : lastActive != null ? 'seen'
    : 'none';
  return {
    date: kstYmd(dayStart), state,
    first_login_at: first, last_login_at: last, login_count: count, failed_count: failed,
    first_active_at: firstActive, carried_at: carried, last_active_at: lastActive, online,
  };
}

/** 목록 순서 — 그날 먼저 시작한 사람부터. 기록이 없는 사람은 맨 뒤(이름순). */
export function loginDayOrder(a: any, b: any): number {
  const ka = a.first_active_at ?? a.carried_at ?? a.last_active_at;
  const kb = b.first_active_at ?? b.carried_at ?? b.last_active_at;
  if (ka != null && kb != null && ka !== kb) return ka - kb;
  if (ka != null && kb == null) return -1;
  if (ka == null && kb != null) return 1;
  return String(a.display_name || a.username).localeCompare(String(b.display_name || b.username));
}

/* ── 로더 ──────────────────────────────────────────────────────────────── */

type RoleOf = (scopeType: string, username: string, name: string) => string;

/** 강사 계정 목록 — 역할 판정은 부르는 쪽이 넘긴 정본(resolveRole)으로만 한다. */
async function teacherAccounts(db: any, roleOf: RoleOf): Promise<{ username: string; name: string }[]> {
  const rs: any = await db.prepare(
    `SELECT a.username AS username, a.name AS name, s.scope_type AS scope_type
       FROM admin_account a LEFT JOIN admin_scope s ON s.username = a.username`
  ).all();
  const out: { username: string; name: string }[] = [];
  for (const r of (rs?.results || [])) {
    const u = String(r?.username || '').trim();
    if (!u) continue;
    if (roleOf(String(r?.scope_type || 'none'), u, String(r?.name || '')) !== 'teacher') continue;
    out.push({ username: u, name: String(r?.name || '').trim() });
  }
  return out;
}

/** 계정 → 강사 원부 이름(연결이 있을 때만). 못 읽으면 빈 지도 — 이름 칸만 빈다. */
async function rosterNames(db: any, usernames: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!usernames.length) return m;
  try {
    const rows = await selectInChunks<any>(db, usernames, (ph) =>
      `SELECT l.username AS username, t.name AS name FROM teacher_account_links l
         LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(l.teacher_id AS TEXT)
        WHERE l.username IN (${ph})`);
    for (const r of rows) {
      const u = String(r?.username || ''); const n = String(r?.name || '').trim();
      if (u && n && !m.has(u)) m.set(u, n);
    }
  } catch (e: any) { console.warn('[teacher-login] roster names:', e?.message); }
  return m;
}

type Gathered = {
  logins: Map<string, any[]>; seen: Map<string, Map<string, SeenRow>>;
  lastSeen: Map<string, number>; lastLoginBefore: Map<string, number>; partial: string[];
};

/** [from, to) 사이 기록을 계정별로 모은다. 한 갈래가 실패해도 나머지는 그대로 — 실패한 갈래 이름을 partial 에. */
async function gather(db: any, usernames: string[], from: number, to: number, ymds: string[],
  opts: { lastLoginBefore?: boolean } = {}): Promise<Gathered> {
  const g: Gathered = { logins: new Map(), seen: new Map(), lastSeen: new Map(), lastLoginBefore: new Map(), partial: [] };
  if (!usernames.length) return g;
  const F = Math.floor(from), T = Math.floor(to);
  try {
    const rows = await selectInChunks<any>(db, usernames, (ph) =>
      `SELECT username, login_at, success, reason FROM admin_login_history
        WHERE username IN (${ph}) AND login_at >= ? AND login_at < ?`, { tail: [F, T] });
    for (const r of rows) {
      const u = String(r?.username || ''); const l = g.logins.get(u) || []; l.push(r); g.logins.set(u, l);
    }
  } catch (e: any) { g.partial.push('logins'); console.warn('[teacher-login] logins:', e?.message); }
  try {
    await ensureDailySeen(db);
    const rows = await selectInChunks<any>(db, usernames, (ph) =>
      `SELECT username, ymd, first_seen_at, carried_at FROM admin_daily_seen
        WHERE username IN (${ph}) AND ymd >= ? AND ymd <= ?`, { tail: [ymds[0], ymds[ymds.length - 1]] });
    for (const r of rows) {
      const u = String(r?.username || ''); const m = g.seen.get(u) || new Map<string, SeenRow>();
      m.set(String(r?.ymd || ''), r); g.seen.set(u, m);
    }
  } catch (e: any) { g.partial.push('first_seen'); console.warn('[teacher-login] daily seen read:', e?.message); }
  try {
    const rows = await selectInChunks<any>(db, usernames, (ph) =>
      `SELECT username, MAX(last_seen_at) AS m FROM admin_sessions WHERE username IN (${ph}) GROUP BY username`);
    for (const r of rows) { const t = Number(r?.m); if (Number.isFinite(t) && t > 0) g.lastSeen.set(String(r.username), t); }
  } catch (e: any) { g.partial.push('last_active'); console.warn('[teacher-login] sessions:', e?.message); }
  if (opts.lastLoginBefore) {
    try {
      const rows = await selectInChunks<any>(db, usernames, (ph) =>
        `SELECT username, MAX(login_at) AS m FROM admin_login_history
          WHERE username IN (${ph}) AND success = 1 AND (reason IS NULL OR reason = '') AND login_at < ?
          GROUP BY username`, { tail: [T] });
      for (const r of rows) { const t = Number(r?.m); if (Number.isFinite(t) && t > 0) g.lastLoginBefore.set(String(r.username), t); }
    } catch (e: any) { g.partial.push('last_login'); console.warn('[teacher-login] last login:', e?.message); }
  }
  return g;
}

/** 본사용 — 그날 강사 전원. ymd 가 틀리면 null(부르는 쪽이 400). */
export async function loadTeacherLoginDay(env: any, ymd: string, now: number, roleOf: RoleOf): Promise<any | null> {
  const dayStart = ymdStart(ymd);
  if (dayStart == null) return null;
  const db = env.DB;
  const accounts = await teacherAccounts(db, roleOf);
  const users = accounts.map(a => a.username);
  const names = await rosterNames(db, users);
  const g = await gather(db, users, dayStart, dayStart + DAY, [ymd], { lastLoginBefore: true });
  const isToday = kstYmd(now) === ymd;
  const items = accounts.map(a => {
    // 세션 last_seen 은 «가장 최근» 하나뿐 — summarizeLoginDay 가 그날 안일 때만 «마지막 활동» 으로 쓴다.
    const d = summarizeLoginDay(dayStart, now, g.logins.get(a.username) || [],
      (g.seen.get(a.username) || new Map()).get(ymd) || null, g.lastSeen.get(a.username) ?? null);
    const before = g.lastLoginBefore.get(a.username) ?? null;
    return {
      username: a.username, name: a.name, teacher_name: names.get(a.username) || null,
      display_name: names.get(a.username) || a.name || a.username,
      ...d,
      // 그날 로그인이 없을 때만 «마지막 로그인» 을 함께 — 오늘 로그인이 있으면 같은 값이라 겹친다.
      last_login_before: d.login_count > 0 ? null : before,
    };
  }).sort(loginDayOrder);
  const firstSeenSince = await firstSeenRecordedSince(db);
  return {
    ok: true, date: ymd, is_today: isToday, now, items,
    counts: {
      total: items.length,
      active: items.filter(i => i.state !== 'none').length,
      online: items.filter(i => i.online).length,
    },
    partial: g.partial,
    // 이 날짜 전에는 «첫 접속» 기록이 없었다(배포 뒤부터 쌓임) — 화면이 그렇게 말한다.
    first_seen_since: firstSeenSince,
  };
}

/** admin_daily_seen 에 기록이 처음 생긴 날(없으면 null). */
async function firstSeenRecordedSince(db: any): Promise<string | null> {
  try {
    await ensureDailySeen(db);
    const r: any = await db.prepare(`SELECT MIN(ymd) AS d FROM admin_daily_seen`).first();
    return r && r.d ? String(r.d) : null;
  } catch { return null; }
}

/** 강사 본인용 — 최근 N일(오늘 포함, 최신순). */
export async function loadMyLoginDays(env: any, username: string, now: number, days: number = MY_LOGIN_DAYS): Promise<any> {
  const u = String(username || '').trim();
  const n = Math.max(1, Math.min(31, Math.floor(Number(days) || MY_LOGIN_DAYS)));
  const todayStart = kstDayStart(now);
  const from = todayStart - (n - 1) * DAY;
  const ymds: string[] = [];
  for (let i = 0; i < n; i++) ymds.push(kstYmd(from + i * DAY));
  if (!u) return { ok: true, username: '', days: [], partial: [] };
  const db = env.DB;
  const g = await gather(db, [u], from, todayStart + DAY, ymds);
  const seen = g.seen.get(u) || new Map<string, SeenRow>();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ds = from + i * DAY;
    out.push(summarizeLoginDay(ds, now, g.logins.get(u) || [], seen.get(kstYmd(ds)) || null, g.lastSeen.get(u) ?? null));
  }
  return { ok: true, username: u, now, days: out, partial: g.partial, first_seen_since: await firstSeenRecordedSince(db) };
}

/* ── 본사용 목록 API (auth-admin.ts 가 GET /api/admin/login-history?scope=teachers 에서 부른다) ── */

type ActorOf = (request: Request, env: any) => Promise<{ ok: boolean; username: string; name: string; role: string; isTeacher: boolean }>;

const noStore = (body: any, status = 200): Response => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function handleTeacherLoginList(request: Request, url: URL, env: any,
  deps: { actorOf: ActorOf; roleOf: RoleOf; now?: number }): Promise<Response> {
  const actor = await deps.actorOf(request, env);
  if (!actor.ok) return noStore({ ok: false, error: 'auth_required' }, 401);
  // index.ts 가 강사에게 이 경로를 이미 막지만(TEACHER_BLOCKED_PREFIXES) 한 겹 더.
  if (actor.isTeacher) return noStore(forbiddenTeacherBody({ username: actor.username, name: actor.name },
    '강사 계정으로는 다른 강사의 로그인 기록을 볼 수 없습니다.', 'Teacher accounts cannot see other teachers\' login times.'), 403);
  // 지사·대리점(조직) — 근거를 «삼키지 않고» 다시 읽는다. 못 읽으면 막는다.
  const denied = orgScopeDenyResponse(orgScopeVerdict(await readScopeType(env, actor.username), actor.role));
  if (denied) return denied;
  const now = deps.now ?? Date.now();
  const ymd = String(url.searchParams.get('date') || '').trim() || kstYmd(now);
  try {
    const r = await loadTeacherLoginDay(env, ymd, now, deps.roleOf);
    if (!r) return noStore({ ok: false, error: 'bad_date' }, 400);
    return noStore(r);
  } catch (e: any) {
    console.warn('[teacher-login] list:', e?.message);
    return noStore({ ok: false, error: 'load_failed' }, 500);
  }
}
