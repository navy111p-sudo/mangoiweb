/**
 * forbidden-teacher.ts — 「강사 권한으로는 …」 거절 문구의 **정본** (2026-09-11 신설)
 *
 * 왜 만들었나 — 2026-09-10 사장님이 반나절을 잃으셨습니다.
 *   관리자 주소를 여셨는데 화면이 「강사 권한으로는 볼 수 없는 정보입니다」 한 줄만 냈습니다.
 *   틀린 말은 아니지만 **«지금 누구로 들어와 있는지» 를 말해 주지 않아서**, 사장님은
 *   「나는 관리자인데 왜?」로 읽고 서버 설정을 의심하셨습니다. 실제로는 그 브라우저가
 *   강선생님(`hq_t_kang`) 세션을 들고 있었고, 세션 쿠키는 브라우저당 한 개라 앞서 한
 *   «강선생님 로그인» 이 관리자 세션을 덮은 것이었습니다. 계정 이름 한 줄이면 5초에
 *   끝났을 일입니다. → 사장님 지시 「강사 계정 문구에 계정 이름도 같이 넣어줘」.
 *
 * ⛔ 이 판정을 다른 파일에 복제하지 마세요. 이 저장소는 같은 문구가 **서버 41곳 + 화면
 *    4곳** 에 흩어져 있었고, 그래서 한쪽만 고치면 나머지에서 그대로 재발합니다
 *    (CLAUDE.md 2장 「같은 판정이 두 곳에 있으면 한쪽만 고쳐진다」).
 *
 * ⚠️ 이 값은 **부르는 사람 «자신» 의 계정**입니다 — 남의 정보가 아닙니다.
 *    같은 값을 `/api/admin/me` 가 이미 그대로 내려주므로 새로 새는 것이 없습니다.
 *    ⛔ 그렇다고 «막힌 대상» 이나 «누가 볼 수 있는지» 를 여기에 싣지 마세요 —
 *       그건 로그인한 사람이 원래 못 보는 정보입니다.
 */

/** 거절 문구에 실을 «지금 로그인한 사람». `getAdminActor()` 반환값을 그대로 넘기면 됩니다. */
export type ForbiddenTeacherWho = {
  username?: string | null;
  /** admin_account.name — 없을 수 있습니다(그때는 아이디만 보여 줍니다). */
  name?: string | null;
};

/** 「강선생님(hq_t_kang)」 — 이름이 없거나 아이디와 같으면 「hq_t_kang」. 둘 다 없으면 빈 문자열. */
export function teacherWhoLabel(who?: ForbiddenTeacherWho | null): string {
  const username = String(who?.username ?? '').trim();
  const rawName = String(who?.name ?? '').trim();
  // ⚠️ 이름이 아이디와 «같은» 계정이 실재합니다(자동 생성 강사 계정 — 예: mangoi_170).
  //    그대로 두면 「mangoi_170(mangoi_170)」 이 되어 읽는 사람이 두 번 봅니다.
  const name = rawName && rawName !== username ? rawName : '';
  if (!username) return name;       // 아이디를 못 읽었으면 이름만
  return name ? `${name}(${username})` : username;
}

export type ForbiddenTeacherBody = {
  ok: false;
  error: 'forbidden_teacher';
  /** 화면이 «자기 문구» 를 쓸 때 이 둘로 계정을 덧붙입니다(공용 문구를 안 쓰는 화면이 넷 있습니다). */
  username: string;
  account_name: string;
  who: string;
  /** 「지금 로그인한 계정: … — 다른 계정이어야 하면 …」 **완성된 한 문장**. 모르면 빈 문자열.
   *  ⚠️ 화면이 «자기 문구» 를 쓰는 곳이 넷 있습니다(환불·매니저·교재업로더·교재일괄배정).
   *     그 넷은 이 줄을 **붙이기만** 합니다 — ⛔ 문장을 베껴 적지 마세요. 베끼는 순간
   *     정본이 다섯 벌이 되고, 문구를 고칠 때 한쪽만 고쳐집니다. */
  who_line: string;
  who_line_en: string;
  message: string;
  message_en: string;
};

/**
 * 403 본문을 만듭니다. `detail`·`detail_en` 은 «무엇이 막혔나» 를 그 자리에 맞게 적는 칸입니다.
 *
 * ⛔ 기본 문구를 «실제 사유 중 하나» 로 두지 마세요 — 나중에 새 자리에서 detail 을 빠뜨리면
 *    **틀린 문구가 조용히** 나갑니다(2026-09-10 pushWhy 에서 같은 실수를 했습니다).
 *    여기 기본값은 어느 자리에서나 참인 «가장 일반적인» 문장이라 그 위험이 없습니다.
 */
export function forbiddenTeacherBody(
  who?: ForbiddenTeacherWho | null,
  detail?: string | null,
  detailEn?: string | null,
): ForbiddenTeacherBody {
  const username = String(who?.username ?? '').trim();
  const rawName = String(who?.name ?? '').trim();
  const label = teacherWhoLabel(who);
  const base = String(detail ?? '').trim() || '강사 권한으로는 볼 수 없는 정보입니다.';
  const baseEn = String(detailEn ?? '').trim() || 'This information is not available with a teacher account.';
  // ⚠️ 계정을 못 읽었으면 «지어내지» 않고 옛 문구 그대로 둡니다(CLAUDE.md 2장
  //    「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」). 빈 괄호가 더 헷갈립니다.
  const whoLine = label
    ? `지금 로그인한 계정: ${label} — 다른 계정이어야 하면 로그아웃 후 다시 로그인하세요.`
    : '';
  const whoLineEn = label
    ? `You are signed in as: ${label}. Sign out and sign back in if this is not the right account.`
    : '';
  return {
    ok: false,
    error: 'forbidden_teacher',
    username,
    account_name: rawName,
    who: label,
    who_line: whoLine,
    who_line_en: whoLineEn,
    message: whoLine ? `${base} ${whoLine}` : base,
    message_en: whoLineEn ? `${baseEn} ${whoLineEn}` : baseEn,
  };
}
