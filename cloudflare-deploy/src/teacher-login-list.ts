/* ═══════════════════════════════════════════════════════════════════════════
   🔐 강사 로그인 시각 — 본사용 목록 경로 처리 (2026-10-30)

   auth-admin.ts 가 GET /api/admin/login-history?scope=teachers&date=YYYY-MM-DD 에서 부른다.
   판정·조회 정본은 teacher-login-times.ts 이고, 이 파일은 «누가 볼 수 있나» 게이트와 응답만 맡는다.

   [왜 따로 두나] 게이트가 org-scope-guard(→ auth-admin) 를 쓰는데, 정본 파일은 강사 포털(api-teacher.ts)도 부른다.
     한 파일에 두면 강사 포털이 관리자 게이트 고리까지 짊어진다(auth-admin 을 스텁하는 하니스 번들이 실제로 깨졌다).
   ═══════════════════════════════════════════════════════════════════════════ */
import { orgScopeVerdict, readScopeType, orgScopeDenyResponse } from './org-scope-guard';
import { forbiddenTeacherBody } from './forbidden-teacher';
import { loadTeacherLoginDay, kstYmd, type RoleOf } from './teacher-login-times';

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
  // 근거(admin_scope)를 «삼키지 않고» 다시 읽는다 — actor 는 스코프 조회가 흔들리면 'staff' 로 떨어진다.
  const scope = await readScopeType(env, actor.username);
  // ⚠️ 정본 판정은 강사 스코프('teacher')를 «hq» 로 통과시킨다 → 다시 읽은 근거로 강사를 한 번 더 막는다
  //    (위 isTeacher 와 index.ts 차단이 둘 다 actor 에 기대므로, actor 가 흔들린 날에도 막히게).
  if (scope === 'teacher') return noStore(forbiddenTeacherBody({ username: actor.username, name: actor.name },
    '강사 계정으로는 다른 강사의 로그인 기록을 볼 수 없습니다.', 'Teacher accounts cannot see other teachers\' login times.'), 403);
  // 지사·대리점(조직) — 못 읽으면 막는다(org-scope-guard).
  const denied = orgScopeDenyResponse(orgScopeVerdict(scope, actor.role));
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
