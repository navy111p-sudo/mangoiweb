/* 🔒 지사·대리점(조직) 계정 차단 판정 — 정본 (2026-09-22)
 *
 * [왜 필요한가] 두 구멍이 열려 있었다.
 *   ① GET /api/admin/stats/student-rankings — `/api/admin/stats/` 접두사 전체가
 *      isAgencyAllowedApi 에 허용돼 있는데 이 핸들러만 스코프를 안 걸어,
 *      지사·대리점 계정이 주소를 직접 치면 **전국 학생 랭킹(아이디 포함)** 이 나왔다.
 *   ② /api/recordings/* (목록·다운로드 링크·blob·삭제)와 /api/recording/play —
 *      `/api/admin/` 밖이라 index.ts 의 스코프 차단(forbidden_scope)을 통째로 비켜 가고,
 *      핸들러도 «관리자 세션이 있는가» 만 봐서 **다른 지사 학생의 수업 영상**(미성년자)을
 *      받을 수 있었다. 재생은 녹화 id 가 연속 정수라 열거까지 된다.
 *
 * [판정] 조직 계정이면 막는다. 조직인지 «모르면» 도 막는다(fail-closed).
 *   🔴 getScope()/getAdminActor() 는 조회 실패를 삼키고 'none'(=본사 동급)으로 떨어진다
 *      (CLAUDE.md 2장 「조직 계정을 getAdminActor().role 로 막았는데 D1 이 흔들리면 그대로 통과」).
 *      그래서 근거(admin_scope.scope_type)를 **삼키지 않고 한 번 더 읽는다** — enrollAdminHqOnly 와 같은 모양.
 *   ⚠️ 부르는 쪽은 그 전에 getAdminActor() 를 불러 둘 것 — 그것이 admin_scope 행을 심는다.
 *      그러고도 행이 없으면 심기까지 실패한 것이라 «모름» 이다.
 *   ℹ️ 강사('teacher')·본사('hq'·'none')는 여기서 막지 않는다 — 이번 수리의 범위가 아니다.
 */
import { isOrgScopedRole } from './auth-admin';

export type OrgScopeVerdict = 'hq' | 'org' | 'unknown';

/** 순수 판정 — actorRole 이 조직이면 무조건 org, 아니면 DB 근거(scopeType)로 가른다. */
export function orgScopeVerdict(scopeType: string | null | undefined, actorRole?: string | null): OrgScopeVerdict {
  if (actorRole && isOrgScopedRole(actorRole)) return 'org';
  const st = String(scopeType ?? '').trim();
  if (!st) return 'unknown';
  if (isOrgScopedRole(st)) return 'org';
  return 'hq';
}

/** admin_scope.scope_type 을 «삼키지 않고» 읽는다. 행이 없거나 조회가 실패하면 null(=모름). */
export async function readScopeType(env: any, username: string): Promise<string | null> {
  if (!username) return null;
  try {
    const r: any = await env.DB.prepare(
      `SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`
    ).bind(username).first();
    const st = r ? String(r.scope_type ?? '').trim() : '';
    return st || null;
  } catch (e: any) {
    console.warn('[org-scope-guard] scope read:', e?.message);
    return null;
  }
}

/** 막아야 하면 403 Response, 통과면 null. */
export function orgScopeDenyResponse(verdict: OrgScopeVerdict): Response | null {
  if (verdict === 'hq') return null;
  const body = verdict === 'org'
    ? { ok: false, error: 'forbidden_scope', message: '본사만 볼 수 있는 정보입니다.' }
    : { ok: false, error: 'scope_unknown', message: '권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  return new Response(JSON.stringify(body), {
    status: 403,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
