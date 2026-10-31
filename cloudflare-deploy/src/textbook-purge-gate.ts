/* 🗑️ 교재 «묶음 통째» 영구 삭제 — 허용 판정 정본 (2026-09-07)
   ═══════════════════════════════════════════════════════════════════════
   [왜 별도 파일인가] 이 판정을 라우트 «안» 에만 두면 하니스가 문자열로만 검사하게 되고,
      그러면 조건을 `!==` → `===` 로 **뒤집어도 그 글자가 그대로 남아 통과한다**.
      하필 그 자리가 «되돌릴 수 없는 삭제» 를 지키는 자리다(CLAUDE.md 2장 — 교재 OCR 게이트·
      판단력 맛보기 상한에서 이미 두 번 밟은 함정). 라우트는 이 함수를 **부르기만** 하고
      하니스는 이 함수를 **실제로 돌린다**.
   [원칙] 모르면 막는 쪽으로 실패한다 — 삭제는 되돌릴 수 없다. */

/** 조직 스코프(지사·대리점·지사본사) 역할인가.
 *  ⚠️ `auth-admin.ts` 의 `isOrgScopedRole` 과 **같은 말** 이어야 한다. 이 파일은 다른 도메인을
 *     import 하지 않는 원칙이라 복제해 두고, 하니스가 두 함수를 나란히 돌려 대조한다
 *     (`NOT_PLACEHOLDER` 를 네 파일에 복제하고 하니스로 대조하는 것과 같은 방식). */
export function purgeOrgScopedRole(role: string | null | undefined): boolean {
  const r = String(role || '');
  return r === 'branch' || r === 'agency' || r === 'franchise';
}

export type PurgeGateInput = {
  /** 본문의 action. 'purge_book' 이 아니면 거절한다 —
   *  이 경로(DELETE /api/admin/textbook-files)에 나중에 다른 뜻을 넣을 때
   *  «모르는 요청» 이 조용히 흘러 들어오는 것을 막는다. */
  action?: string | null;
  /** 로그인했는가 (getAdminActor().ok) */
  actorOk: boolean;
  /** 강사인가 — ⛔ canEditOrg() 로 막으면 안 된다(그 함수는 scope 'none'=교사에도 true) */
  isTeacher: boolean;
  role?: string | null;
  book?: string | null;
  /** 기본 true. false 를 «명시적으로» 줘야 실제 삭제로 간다. */
  dryRun: boolean;
  confirmName?: string | null;
  /** 그 묶음의 파일 수. **null/undefined = 모름**(조회 실패) — 세지 못했으면 지우지 않는다. */
  totalFiles?: number | null;
};

/* ⚠️ 판별 유니온(`{ok:true}|{ok:false}`)으로 두지 말 것 — 이 저장소의 tsconfig 는
   `strict:false`·`strictNullChecks:false` 라 좁히기가 동작하지 않아 `if(!g.ok)` 뒤에서
   `g.error` 가 TS2339 로 컴파일에 실패한다(CLAUDE.md 2장 · 2026-09-07 실제로 밟음).
   **한 가지 모양**으로 둔다. */
export type PurgeGateResult = {
  ok: boolean;
  mode: 'count' | 'purge' | 'none';
  error: string | null;
  status: number;
};

export function textbookPurgeGate(i: PurgeGateInput): PurgeGateResult {
  if (String(i?.action || '') !== 'purge_book') {
    return { ok: false, mode: 'none', error: 'unknown_action', status: 400 };
  }
  if (!i.actorOk) return { ok: false, mode: 'none', error: 'unauthorized', status: 401 };
  if (i.isTeacher) return { ok: false, mode: 'none', error: 'forbidden_teacher', status: 403 };
  if (purgeOrgScopedRole(i.role)) return { ok: false, mode: 'none', error: 'forbidden_scope', status: 403 };

  const book = String(i?.book || '').trim();
  if (!book) return { ok: false, mode: 'none', error: 'book_required', status: 400 };

  // 1단계 — 세기만 한다. dryRun 이 «명시적 false» 가 아니면 언제나 여기서 끝난다.
  if (i.dryRun !== false) return { ok: true, mode: 'count', error: null, status: 200 };

  /* 2단계 — 이름을 정확히 다시 입력했을 때만.
     ⛔ 대소문자·공백을 눙쳐 주지 말 것: 「BTS 2」와 「BTS 22」처럼 비슷한 이름이 실재한다. */
  if (String(i?.confirmName ?? '') !== book) {
    return { ok: false, mode: 'none', error: 'confirm_mismatch', status: 400 };
  }
  /* ⚠️ «모른다»(조회 실패)를 0 으로 떨어뜨리면 안 된다 — 별도 사유로 거절한다.
     0 으로 떨어뜨리면 `book_not_found` 가 되어 «없는 책» 과 «못 센 책» 이 같은 말이 된다. */
  if (i.totalFiles === null || i.totalFiles === undefined || !Number.isFinite(Number(i.totalFiles))) {
    return { ok: false, mode: 'none', error: 'lookup_failed', status: 503 };
  }
  if (Number(i.totalFiles) <= 0) return { ok: false, mode: 'none', error: 'book_not_found', status: 404 };

  return { ok: true, mode: 'purge', error: null, status: 200 };
}
