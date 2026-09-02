// ═══════════════════════════════════════════════════════════════════════
// 🎯 student-placement.ts — 레벨테스트 결과(CEFR) → 학생 교재 레벨 배정 «정본»
//
// [왜 이 파일이 생겼나 — 2026-09-02]
//   화상수업 없이 AI 학습도구만 쓰는 학생을 받으려면 «이 학생이 몇 레벨인가» 가
//   `students_erp.level` 에 적혀 있어야 한다. 그 칸을 읽는 코드는 이미 여럿 있다:
//     · warmupLessonContext()      — 그 레벨의 review_quizzes 문장을 웜업에 먹인다
//     · /api/review-quiz/auto      — 없으면 AI 가 즉석 출제까지 한다
//     · bandFromTextbookLevel()    — 판단력 훈련 밴드
//   그런데 **채우는 곳이 한 곳도 없었다.**
//   2026-09-02 D1 실측: 학생 29,462명 중 level 이 채워진 사람 **0명** · textbook **0명**.
//   레벨테스트는 이미 CEFR 을 채점하는데(`/api/leveltest/diagnose`) 그 결과가
//   `leveltest_applications.final_level` 에만 남고 학생 명부로 흘러가지 않았다.
//   이 파일이 그 한 칸을 잇는다.
//
// [⛔ 새 눈금을 만들지 않는다]
//   CEFR ↔ 단계 ↔ 교재 Lv 는 이미 두 곳에 정본이 있고 하니스가 서로 대조하고 있다.
//     · AI_FRIEND_CEFR (ai-friend-level.ts) — 단계 S1~S8 ↔ CEFR 이름
//     · BAND_SPECS     (judgment-level.ts)  — 밴드 1~8 ↔ 교재 Lv 구간
//   두 표는 같은 8칸 눈금이다(CLAUDE.md: 「A1 = 웜업 레벨 1 = 3~5단어」).
//   그래서 여기서는 **그 둘을 이어 읽기만** 한다. 세 번째 표를 만들면 그 순간
//   「화면마다 답이 다른」 사고가 시작된다.
//
// [⚠️ 왜 textbook 은 안 채우나]
//   CEFR 에서 «어느 교재를 쓸지» 는 근거가 없다. BTS 3권과 SIU Basic 중 무엇이
//   B1 인지는 사람이 정하는 일이지 시험 점수가 정하는 일이 아니다.
//   지어내면 학생이 엉뚱한 교재로 공부한다 — 교재는 관리자가
//   「📚 일괄 교재 배정」(POST /api/admin/students/bulk-assign-textbook)으로 정한다.
// ═══════════════════════════════════════════════════════════════════════
import { AI_FRIEND_CEFR } from './ai-friend-level';
import { BAND_SPECS, BAND_COUNT } from './judgment-level';
import { resolveZhTextbook } from './zh-textbook';   // 🈶 중국어 교재 판정 정본(아래 loadTextbookChoices)

/** 'S3' → 3. 그 밖은 null. */
function stepNumber(key: string): number | null {
  const m = String(key || '').match(/^S(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return (n >= 1 && n <= BAND_COUNT) ? n : null;
}

/**
 * CEFR 이름 → 단계(=밴드) 번호. 'A1'→1 … 'C1'→8.
 *
 * ⚠️ 표를 새로 적지 않고 AI_FRIEND_CEFR 을 «거꾸로» 읽는다 —
 *    그쪽이 바뀌면 여기도 저절로 따라온다(두 벌이 되면 반드시 어긋난다).
 * ⚠️ 'C2' 는 그 표에 없다(우리 커리큘럼의 위쪽 끝이 C1). 최상단으로 본다 —
 *    「모른다」로 두면 최상급 학생만 배정이 안 되는데, 그건 안 맞는 쪽이 아니라
 *    «한 칸 아래에서 시작» 하는 정도라 안전하다.
 */
export function bandFromCefr(raw: any): number | null {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  /* ⚠️ 'Starter' 는 CEFR 이름이 아니라 레벨테스트(`/api/leveltest/diagnose`)가
     «A1 문항조차 절반을 못 넘겼다» 는 뜻으로 내는 값이다(그 핸들러의 초기값).
     A1 미만이니 가장 낮은 밴드가 맞다 — 지어낸 매핑이 아니라 정의상 그렇다.
     ⛔ 이 값을 «모름» 으로 두면 정작 배정이 가장 필요한 완전 초보만 빈칸이 된다. */
  if (s === 'STARTER') return 1;
  if (s === 'C2') return BAND_COUNT;
  for (const key of Object.keys(AI_FRIEND_CEFR)) {
    if (String(AI_FRIEND_CEFR[key]).toUpperCase() === s) return stepNumber(key);
  }
  return null;
}

/**
 * CEFR 이름 → 교재 레벨 표기('Lv 1' …).
 *
 * ⚠️ 표기를 «Lv N» 으로 맞추는 것이 핵심이다 — review_quizzes.level 실측값이
 *    'Lv 1'·'Lv 3' 형식이고, warmupLessonContext 는 LOWER(level)=LOWER(?) 로
 *    **완전일치** 비교한다. 여기에 'A1' 을 그대로 넣으면 영영 아무것도 안 맞는데
 *    **에러는 안 난다**(그냥 조용히 문장이 0개가 된다).
 * ⚠️ 밴드는 구간(Lv 1~4)이라 대표값이 필요하다. 구간의 **시작**을 쓴다 —
 *    새로 배정받는 학생은 그 구간 처음부터 시작하는 것이 맞다.
 */
export function textbookLevelFromCefr(raw: any): string | null {
  const band = bandFromCefr(raw);
  if (!band) return null;
  const spec = BAND_SPECS[band - 1];
  return spec ? `Lv ${spec.lvFrom}` : null;
}

export type PlacementResult = {
  ok: boolean;
  /** 이번에 실제로 학생 명부에 적었는가 */
  applied: boolean;
  /** 왜 안 적었는지 — 'no_uid' | 'no_level' | 'already_set' | 'not_found' | 'error' */
  reason: string;
  /** 계산된 교재 레벨 표기('Lv 13') — 적었든 안 적었든 알려준다 */
  level: string | null;
  band: number | null;
};

/**
 * 레벨테스트 CEFR 결과를 학생 명부(`students_erp.level`)에 적는다.
 *
 * [원칙] **사람 손이 이긴다.** 이미 레벨이 적혀 있으면 덮어쓰지 않는다.
 *   관리자가 정한 값이나 앞선 배정을 시험 한 번이 뒤집으면 안 된다.
 *   다시 배정하려면 관리자 「📚 일괄 교재 배정」에서 «미배정만» 체크를 풀고 실행한다.
 *
 * ⚠️ user_id 는 **정확일치**로만 찾는다. 이 값은 로그인 토큰이 실어 준 DB 원표기라
 *    정확일치가 맞고, NOCASE 로 넓히면 대소문자만 다른 두 계정 중 «아무나» 집는다
 *    (실재한다 — Kim/kim, Lee/lee. CLAUDE.md 「같은 사람인데 계정이 두 개」 참고).
 * ⚠️ 절대 던지지 않는다. 부르는 쪽이 «레벨테스트 채점» 이라, 여기서 예외가 나면
 *    학생이 시험을 다 보고도 결과를 못 받는다. 실패는 reason 으로만 알린다.
 */
export async function applyPlacementLevel(
  env: { DB: any },
  uid: any,
  cefr: any,
): Promise<PlacementResult> {
  const band = bandFromCefr(cefr);
  const level = textbookLevelFromCefr(cefr);
  const out: PlacementResult = { ok: true, applied: false, reason: '', level, band };

  const user = String(uid || '').trim();
  if (!user) { out.reason = 'no_uid'; return out; }
  if (!level) { out.reason = 'no_level'; return out; }

  try {
    /* 🧱 멱등 ALTER — level 칸이 없는 DB(새 환경·테스트)에서도 죽지 않게.
       운영 D1 에는 이미 있다. bulk-assign-textbook 이 쓰는 것과 같은 방식. */
    try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN level TEXT`); } catch {}
    /* ⚠️ updated_at 도 아래 UPDATE 가 «읽는» 칸이다. 자가가입(/api/student/register)이 만드는
       최소 CREATE TABLE 에는 그 칸이 없어서, 그 스키마에서는 no such column 으로 죽고
       레벨이 조용히 안 적힌다(2026-09-02 함정 대조에서 실측). 운영 D1 에는 있지만
       «있는 DB 에서만 되는 코드» 를 남기지 않는다. */
    try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN updated_at INTEGER`); } catch {}

    const r: any = await env.DB.prepare(
      `UPDATE students_erp SET level = ?, updated_at = ?
        WHERE user_id = ? AND (level IS NULL OR TRIM(level) = '')`
    ).bind(level, Date.now(), user).run();

    if (Number(r && r.meta && r.meta.changes) > 0) {
      out.applied = true;
      out.reason = 'applied';
      return out;
    }

    /* 0행이면 «이미 적혀 있다» 와 «그런 학생이 없다» 둘 중 하나다.
       둘은 관리자에게 전혀 다른 뜻이라 뭉뚱그리지 않는다. */
    const cur: any = await env.DB.prepare(
      `SELECT level FROM students_erp WHERE user_id = ? LIMIT 1`
    ).bind(user).first();
    out.reason = cur ? 'already_set' : 'not_found';
    return out;
  } catch (e: any) {
    console.warn('[placement] level 기록 실패:', e && e.message);
    out.ok = false;
    out.reason = 'error';
    return out;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 📚 배정할 수 있는 «실재하는» 교재 목록
//
// [왜 필요했나 — 2026-09-02]
//   교재 일괄배정 화면(js/adm-bulkbook.js)은 고를 교재를 `/api/admin/textbooks`,
//   즉 `textbooks` 표에서 가져오는데 그 표에는 **「BTS」·「다락원」 딱 2행**뿐이었다.
//   그런데 AI 학습도구가 매칭에 쓰는 이름은 그게 아니다:
//     · review_quizzes.textbook  = 「BTS 1 001 (Welcome to school)」 (과 단위)
//     · 라이브러리(textbook_files.name 의 [대괄호]) = 「BTS 3 Korea (My family)」 (권 단위)
//   그래서 「BTS」를 배정하면 warmupLessonContext 의 LOWER(textbook)=LOWER(?) 가
//   **아무것도 안 맞는데 에러는 안 난다.** 배정은 «성공» 하고 학습만 조용히 일반 문장이 된다.
//   2026-09-02 D1 실측: textbook 이 채워진 학생 0명 — 기능은 있는데 아무도 못 쓴 상태였다.
//
// [설계]
//   ⛔ 교재 이름의 «정본» 을 새로 만들지 않는다. 그러면 세 번째 이름 체계가 생긴다.
//      대신 실제로 콘텐츠가 있는 두 곳에서 **읽어 온다.**
//   ✅ 「문항이 있는가(quizzes)」·「라이브러리 페이지가 있는가(files)」를 함께 실어
//      관리자가 «이 교재를 배정하면 AI 도구가 바로 먹는가» 를 보고 고르게 한다.
//      숫자를 감추면 「배정했는데 왜 안 나오지」가 그대로 재현된다.
//   ⚠️ 중국어 교재는 lang:'zh' 로 표시한다 — 영어 학생에게 다락원을 배정하면
//      웜업·복습퀴즈에 병음이 섞여 나온다(CLAUDE.md 「영어 화면에 중국어·병음」).
//      ⛔ 이름을 보고 짐작하지 않는다. 판정 정본은 resolveZhTextbook() 이고
//         근거는 zh_passage·zh_vocab 에 그 교재가 실제로 있는가이다.
// ═══════════════════════════════════════════════════════════════════════

export type TextbookChoice = {
  /** 배정에 쓰는 이름 — 이 값이 그대로 students_erp.textbook 에 들어간다 */
  name: string;
  /** 라이브러리에 있는 페이지 수 (0 = 교재 파일 없음) */
  files: number;
  /** 그 이름으로 바로 매칭되는 활성 복습퀴즈 수 (0 = AI 가 즉석 출제해야 함) */
  quizzes: number;
  /** review_quizzes 에 적힌 레벨 표기('Lv 1') — 있으면 배정 시 함께 채운다 */
  level: string | null;
  /** 'zh' 면 중국어 교재 */
  lang: string;
};

/**
 * 실제로 콘텐츠가 있는 교재 이름을 모아 돌려준다(문항 있는 것 → 페이지 많은 것 순).
 *
 * ⚠️ 어느 조회가 실패해도 나머지는 그대로 돌려준다 — 한쪽이 비면 목록이 짧아질 뿐이지만
 *    통째로 던지면 배정 화면이 「교재 목록 로드 실패」가 되어 아무것도 못 한다.
 */
export async function loadTextbookChoices(env: { DB: any }): Promise<TextbookChoice[]> {
  const byName = new Map<string, TextbookChoice>();
  const pick = (name: string): TextbookChoice => {
    let v = byName.get(name);
    if (!v) { v = { name, files: 0, quizzes: 0, level: null, lang: 'en' }; byName.set(name, v); }
    return v;
  };

  // ① 문항이 실제로 있는 교재 — AI 도구가 «바로» 먹는 이름이라 가장 중요하다
  try {
    const rs: any = await env.DB.prepare(
      `SELECT textbook, COUNT(*) AS n, MAX(level) AS lv
         FROM review_quizzes
        WHERE active = 1 AND textbook IS NOT NULL AND TRIM(textbook) <> ''
        GROUP BY textbook`
    ).all();
    for (const r of (((rs && rs.results) as any[]) || [])) {
      const name = String(r.textbook || '').trim();
      if (!name) continue;
      const v = pick(name);
      v.quizzes = Number(r.n) || 0;
      const lv = String(r.lv || '').trim();
      if (lv) v.level = lv;
    }
  } catch (e: any) { console.warn('[textbook-choices] quizzes skip:', e && e.message); }

  /* ② 라이브러리 묶음 — 파일 이름 앞 [대괄호] 가 묶음 이름이다.
     ⛔ 새 규칙이 아니라 화면(js/idx-x3.js `_serverFilesToBooks`)이 이미 쓰는 방식 그대로다. */
  try {
    const rs: any = await env.DB.prepare(
      `SELECT SUBSTR(name, 2, INSTR(name, ']') - 2) AS book, COUNT(*) AS n
         FROM textbook_files
        WHERE active = 1 AND name LIKE '[%' AND INSTR(name, ']') > 2
        GROUP BY book`
    ).all();
    for (const r of (((rs && rs.results) as any[]) || [])) {
      const name = String(r.book || '').trim();
      if (!name) continue;
      pick(name).files = Number(r.n) || 0;
    }
  } catch (e: any) { console.warn('[textbook-choices] library skip:', e && e.message); }

  // ③ 중국어 표시 — 판정은 정본 함수, 근거는 그 두 표에 실재하는가
  try {
    const known = new Set<string>();
    for (const t of ['zh_passage', 'zh_vocab']) {
      try {
        const rs: any = await env.DB.prepare(
          `SELECT DISTINCT textbook FROM ${t} WHERE textbook IS NOT NULL AND textbook <> ''`
        ).all();
        for (const r of (((rs && rs.results) as any[]) || [])) {
          const v = String(r.textbook || '').trim();
          if (v) known.add(v);
        }
      } catch {}
    }
    if (known.size) {
      const list = Array.from(known);
      for (const v of byName.values()) if (resolveZhTextbook(v.name, list)) v.lang = 'zh';
    }
  } catch (e: any) { console.warn('[textbook-choices] zh skip:', e && e.message); }

  /* 정렬 — 「문항이 있는 것」이 먼저다. 관리자가 위에서부터 고르면 자연히
     AI 도구가 바로 먹는 교재를 고르게 된다. 그다음은 페이지가 많은 것, 그다음 이름순. */
  return Array.from(byName.values()).sort((a, b) =>
    (b.quizzes - a.quizzes) || (b.files - a.files) || a.name.localeCompare(b.name));
}
