/**
 * 👥 학생 수동 등록 — «같은 사람이 이미 있는가» 판정 정본 (순수 함수).
 *
 * 2026-09-14 실사고: 정예희 학생이 yahee·yahee1·yahee2 로 1분 안에 세 번 등록됐다
 * (전부 admin_manual, 각각 비밀번호가 있어 셋 다 로그인됨). 아이디 중복 검사는 «아이디» 만
 * 보므로 번호를 붙여 다시 누르면 그대로 통과했다.
 *
 * 규칙:
 *   - 이름 «완전일치»(student_name·korean_name·username 중 하나) + 연락처 «숫자만 남겨» 같음.
 *   - 연락처는 부모/학생 번호 중 하나라도 같으면 후보. 새 등록에 번호가 하나도 없으면 후보 0개
 *     (이름만으로는 묻지 않는다 — 동명이인 실재, 「김사랑」 계정 6개).
 *   - 부르는 쪽(api-admin.ts)이 SQL 로 «같은 이름» 만 미리 걸러 넘긴다. 이 함수는 이름을 한 번 더
 *     확인한다(SQL 이 느슨해져도 여기서 잡히게).
 *   - 막는 함수가 아니다 — «묻는» 근거만 돌려준다. 그래도 등록할지는 사람이 정한다(force).
 *
 * ⛔ 부분일치·LIKE 로 넓히지 말 것. ⛔ 여기서 D1 을 읽지 말 것(하니스가 그대로 실행한다).
 * 감시: test-harness/student_duplicate_register_harness.mjs
 */

export interface StudentRowLike {
  user_id?: string | null;
  student_name?: string | null;
  korean_name?: string | null;
  username?: string | null;
  parent_phone?: string | null;
  student_phone?: string | null;
  phone?: string | null;
  source?: string | null;
}

export interface DuplicateCandidate {
  user_id: string;
  name: string;
  matched_on: 'parent_phone' | 'student_phone';
  source: string | null;
}

/** 전화번호를 «숫자만» 으로 — `010-9045-1044` 와 `01090451044` 를 같은 번호로 본다. */
export function phoneDigits(v: unknown): string {
  return String(v ?? '').replace(/\D+/g, '');
}

export function studentDuplicateCandidates(
  name: string,
  parentPhone: string | null | undefined,
  studentPhone: string | null | undefined,
  rows: StudentRowLike[],
): DuplicateCandidate[] {
  const nm = String(name ?? '').trim();
  if (!nm) return [];
  const pp = phoneDigits(parentPhone);
  const sp = phoneDigits(studentPhone);
  // 번호가 «너무 짧으면»(7자리 미만) 우연히 같을 수 있는 값이라 근거로 안 쓴다.
  const ppOk = pp.length >= 7;
  const spOk = sp.length >= 7;
  if (!ppOk && !spOk) return [];

  const out: DuplicateCandidate[] = [];
  for (const r of rows || []) {
    const uid = String(r?.user_id ?? '').trim();
    if (!uid) continue;
    const names = [r?.student_name, r?.korean_name, r?.username].map(x => String(x ?? '').trim());
    if (!names.includes(nm)) continue;
    const rp = phoneDigits(r?.parent_phone);
    const rs = phoneDigits(r?.student_phone) || phoneDigits(r?.phone);
    let matched: DuplicateCandidate['matched_on'] | null = null;
    if (ppOk && rp && rp === pp) matched = 'parent_phone';
    else if (spOk && rs && rs === sp) matched = 'student_phone';
    if (!matched) continue;
    out.push({ user_id: uid, name: nm, matched_on: matched, source: r?.source == null ? null : String(r.source) });
  }
  return out;
}
