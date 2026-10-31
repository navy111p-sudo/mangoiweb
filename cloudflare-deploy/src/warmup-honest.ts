/**
 * 🎯 A.i 말하기 연습(웜업) — «칭찬은 정직하게, 교정은 선택해서» (2026-10-29)
 *
 * [왜] 강남캐피 원장님 현장 피드백(제안서 «AI말하기연습 교정모드 제안», 2026-10-29):
 *   ① 틀리게 말하거나 단어 몇 개만 말해도 AI 가 「It's great!」 + 팡파레
 *   ② 교정 카드는 오류를 짚는데 AI 음성은 칭찬 — 메시지가 모순
 *   ③ 바른 문장을 들려주고 따라 말하게 하는 과정이 약함
 *   원인(코드로 확인): 웜업 프롬프트 [칭찬] 규칙이 «잘 대답하면 크게 칭찬(That's great!·Perfect!)» 이라
 *   틀린 문장에도 칭찬 말머리가 붙었고, 화면의 팡파레(bumpCombo)는 «보낸 횟수» 만 셌다.
 *
 * [무엇을] 한 번의 AI 호출에서 받는 JSON({reply, fix})에 "grade" 하나를 더 받고(호출을 둘로 나누지 않는다 —
 *   학생이 매 턴 더 기다리지 않게), 서버가 그 등급을 «믿지 않고» 한 번 더 확인한 뒤
 *     · 완벽이 아니면 답장 앞머리의 칭찬 상투구를 뗀다(정본 stripCheerLead 재사용)
 *     · 화면은 grade==='perfect' 일 때만 콤보·팡파레를 올린다(warmup.html)
 *     · 교정 모드(자유대화·균형·집중교정)에 따라 교정 카드·따라 말하기를 정한다
 *
 * [기본 모드] 2026-10-31 사장님 «모든 학생 모든 학원» — 고르지 않은 학생은 집중교정이다(resolveWarmupHonest).
 *   중국어 대화·엘리더잼 통로는 예전 동작 그대로(null)다.
 *
 * ⛔ 이 모듈의 함수는 어떤 입력에도 던지지 않는다 — 웜업 대화 한가운데서 불린다.
 * ⛔ «모르면 perfect» 로 떨어뜨리지 않는다 — 등급을 못 읽으면 partial(팡파레 없음, 칭찬 말머리 뗌).
 * ⛔ 중국어 대화·엘리더잼 통로에는 쓰지 않는다(규칙·판정이 영어 문장 기준).
 *
 * 감시: test-harness/warmup_honest_mode_harness.mjs (정본을 실제로 돌린다)
 */

import { stripCheerLead } from './warmup-empathy';
import type { WarmupFix } from './warmup-correction';

export type WarmupMode = 'free_talk' | 'balanced' | 'focused';
export type WarmupGrade = 'perfect' | 'partial' | 'incomplete';

export const WARMUP_MODES: readonly WarmupMode[] = ['free_talk', 'balanced', 'focused'];
export const WARMUP_GRADES: readonly WarmupGrade[] = ['perfect', 'partial', 'incomplete'];

/**
 * 이 학생에게 «정직한 칭찬 + 교정 모드» 를 켤지. 켜면 { mode }, 아니면 null.
 * ⚠️ user_id 는 화면이 보내는 값이지만, 남의 아이디를 보내 봐야 «그 학원 모드로 자기 대화가 돈다» 뿐이라
 *    본인 확인은 걸지 않는다(남의 데이터를 읽거나 쓰지 않는다).
 * ⚠️ 학원 조회는 세션당 한 번(KV 30분 캐시). 실패하면 null — 예전 동작으로 떨어진다(fail-open).
 */
export async function resolveWarmupHonest(
  env: any, sessionId: string, userId: string, opts: { lang?: string; eleader?: boolean; chosen?: unknown } = {},
): Promise<{ mode: WarmupMode } | null> {
  try {
    if (opts.lang === 'zh' || opts.eleader) return null;
    /* 🎚️ 학생이 첫 화면에서 «직접 고른» 모드가 이긴다(2026-10-29 사장님 «3가지 옵션을 처음페이지에»).
       화면은 사람이 고른 경우에만 correction_mode 를 보낸다 — 안 고르면 아래 기본 모드(집중교정).
       ⛔ 모르는 값은 무시한다(지어내지 않음). 로그인하지 않아도 고를 수 있다(D1 을 안 읽음). */
    const c = typeof opts.chosen === 'string' ? opts.chosen.trim() : '';
    if (c && (WARMUP_MODES as readonly string[]).includes(c)) return { mode: c as WarmupMode };
    /* 🎯 2026-10-31 사장님 「모든 학생 모든 학원에 적용」 — 고르지 않으면 «집중교정» 이 기본이다.
       (학원·아이디와 무관. 중국어·엘리더잼은 위에서 이미 제외된다.) */
    return { mode: 'focused' };
  } catch { return null; }
}

/* ─────────────────────────────────────────────────────────────
   프롬프트 — 교정 규칙(WARMUP_CORRECTION_RULE) «뒤» 에 붙는다.
   ⚠️ 웜업 프롬프트는 한국어로 쓴다(그 자리의 다른 규칙과 같은 말투).
   ⚠️ 위쪽 [칭찬] 규칙은 공동 금지구역(src/index.ts)이라 지우지 않고, 여기서 «우선한다» 고 덮는다.
      지시만으로는 안 지켜지므로 서버가 등급을 다시 확인하고 칭찬 말머리를 떼어 낸다(applyHonestPraise).
   ───────────────────────────────────────────────────────────── */
const MODE_LINES: Record<WarmupMode, string> = {
  free_talk:
    '[교정 모드: 자유대화] 오류가 있어도 지적하지 말고, 바른 문장으로 자연스럽게 되받아 말한 뒤(recast) 대화를 이어가. 따라 말하라고 시키지 마.',
  balanced:
    '[교정 모드: 균형] 기본은 바른 문장으로 자연스럽게 되받아 말하기(recast). 같은 실수가 되풀이되면 고친 문장을 또박또박 말해 주고 한 번 따라 말해 보자고 해.',
  focused:
    '[교정 모드: 집중교정] 이 모드에서는 「한 번에 한 가지만 고쳐」 규칙을 적용하지 마 — 학생 문장의 오류를 하나도 빠뜨리지 말고 전부 고쳐. 아래 문법 항목을 한 문장씩 빠짐없이 점검해(어느 것도 생략 금지): ① 대소문자 — 문장 첫 글자, 문장 가운데 불필요한 대문자(not Secret→not secret), 고유명사 ② 구두점 — 마침표·물음표·쉼표·따옴표 ③ 관사 a/an/the(없어야 할 곳 포함) ④ 명사 — 가산·불가산, 단수·복수형, 소유격 어포스트로피-s ⑤ 대명사 — 주격·목적격·소유격, 재귀대명사, 관계대명사 who/which/that/whom/whose ⑥ 동사 — 시제(현재·과거·현재완료·과거진행 등), 동사꼴, 주어와 동사의 수 일치, 조동사(can·will·should 등)와 뒤 동사원형, 수동태, 명령문 ⑦ 준동사 — 동명사(-ing 명사)와 to부정사, 그 쓰임 구별 ⑧ 형용사·부사 — 형용사 자리, 부사 자리, 비교급·최상급 ⑨ 전치사 — 시간·장소 전치사 선택(in/on/at), 전치사 뒤 동명사 ⑩ 접속사·관계부사 — and/but/because/so/when/if 등의 선택과 어순, 관계부사 where/when/why ⑪ 의문문·부정문 어순(do/does/did, be동사 도치) ⑫ 낱말 고르기(의미는 통하지만 어색한 낱말). 하나라도 틀렸으면 fix 는 null 이 아니어야 하고, fix 의 now 에는 학생 문장 전체를 위 항목을 모두 고친 완성 문장으로 적어(was 는 학생이 실제로 말한 문장 전체). 한 카드에 모두 담을 수 있게 — 「사소하니 넘어가」는 이 모드에서 금지다. grade 가 perfect 가 아니면 ① 무엇을 고칠지 아주 짧게 말하고 ② 고친 문장을 또박또박 들려준 뒤 ③ "Can you say it with me?" 처럼 따라 말해 보자고 해. 이때 다음 질문은 하지 마 — 학생이 따라 말한 뒤에 이어가.',
};

export function warmupHonestRule(mode: WarmupMode): string {
  const m: WarmupMode = WARMUP_MODES.includes(mode) ? mode : 'balanced';
  return [
    '[평가 — 답장을 쓰기 «전에» 먼저 해] 학생의 마지막 말을 질문에 비추어 냉정하게 평가해서 JSON 에 "grade" 키를 하나 더 넣어.',
    '"grade": "perfect" = 뜻이 통하고 문법 오류가 하나도 없는 문장 · "partial" = 문장이지만 오류가 하나 이상 · "incomplete" = 낱말 나열, 끝나지 않은 문장, 질문과 상관없는 답.',
    '음성인식 잡음(um, 대소문자, 문장부호)은 무시해. 너그럽게 봐주지 마 — 오류가 하나라도 있으면 perfect 가 아니야.',
    '[칭찬 — 위 [칭찬] 규칙보다 «우선» 한다] grade 가 perfect 일 때만 칭찬해. 칭찬은 "Great!" 같은 빈말 대신 «무엇을 잘했는지» 구체적으로(예: "Nice! You used the past tense correctly."). 직전 칭찬과 같은 말은 쓰지 마.',
    'grade 가 perfect 가 아니면 Great, Excellent, Perfect, Amazing, Awesome, Wow 같은 최상급 칭찬을 절대 쓰지 마. partial 이면 바로 바른 문장으로 되받아 말해(예: 학생 "I go park yesterday." → "Oh, you went to the park yesterday? What did you do there?"). incomplete 이면 문장으로 말해 보자고 다정하게 부탁하고 짧은 문장 시작(예: "I went to ...")을 줘.',
    MODE_LINES[m],
  ].join('\n');
}

/* ─────────────────────────────────────────────────────────────
   등급 읽기 · 확인
   ───────────────────────────────────────────────────────────── */

/** 모델 출력(객체 또는 JSON 문자열)에서 grade 를 꺼낸다. 못 읽으면 null. */
export function parseWarmupGrade(raw: unknown): WarmupGrade | null {
  try {
    let g: unknown = null;
    if (raw && typeof raw === 'object') g = (raw as any).grade;
    else {
      const m = String(raw == null ? '' : raw).match(/"grade"\s*:\s*"([a-z_]+)"/i);
      g = m ? m[1] : null;
    }
    const s = String(g == null ? '' : g).toLowerCase().trim() as WarmupGrade;
    return WARMUP_GRADES.includes(s) ? s : null;
  } catch { return null; }
}

/** 영어 낱말 수 */
function enWordCount(s: string): number {
  return (String(s || '').match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || []).length;
}

/**
 * 모델이 준 등급을 «믿지 않고» 확인한다 — 최종 등급만 칭찬·팡파레를 정한다.
 *   · 못 읽었으면 partial (⛔ perfect 로 떨어뜨리지 않는다)
 *   · 서버가 검증한 교정(verifiedFix)이 있으면 perfect 일 수 없다 → partial
 *     (교정 카드와 음성이 같은 판정에서 나오게 — 카드가 오류를 짚는데 «완벽» 이면 모순)
 *   · 영어 낱말이 3개 미만이거나 한글이 섞였으면 perfect 가 아니다 → partial
 *     (「단어 몇 개만 말해도 팡파레」 — 원장님 제보 ①)
 */
export function finalizeWarmupGrade(modelGrade: WarmupGrade | null, verifiedFix: unknown, studentInput: unknown): WarmupGrade {
  try {
    let g: WarmupGrade = modelGrade && WARMUP_GRADES.includes(modelGrade) ? modelGrade : 'partial';
    if (g === 'perfect') {
      const s = String(studentInput == null ? '' : studentInput);
      if (verifiedFix) g = 'partial';
      else if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(s)) g = 'partial';
      else if (enWordCount(s) < 3) g = 'partial';
    }
    return g;
  } catch { return 'partial'; }
}

/** 완벽이 아니면 답장 앞머리의 칭찬 상투구를 뗀다. 완벽이면 그대로. 떼고 남는 것이 없으면 원문. */
export function applyHonestPraise(reply: unknown, grade: WarmupGrade): string {
  try {
    const orig = String(reply == null ? '' : reply);
    if (grade === 'perfect') return orig;
    return stripCheerLead(orig) || orig;
  } catch { return typeof reply === 'string' ? reply : ''; }
}

/**
 * 교정 모드에 따라 교정 카드·따라 말하기를 정한다.
 *   free_talk : 카드는 기존 게이트 그대로(흐름을 끊지 않는 카드), 따라 말하기는 «안 함»
 *   balanced  : 기존 동작 그대로(뜻이 달라지는 오류는 바로, 작은 실수는 두 번째부터 · 따라 말하기 3턴 간격)
 *   focused   : 검증된 교정이 있으면 «매번» 카드 + 따라 말하기
 * ⚠️ verifiedFix 는 서버 검증(verifyWarmupFix)을 통과한 것만 넘긴다 — 지어낸 교정은 어떤 모드도 안 보여 준다.
 */
export function gateFixForMode(
  mode: WarmupMode, verifiedFix: any, decidedShow: any, decidedRepeat: boolean,
): { show: any; repeat: boolean } {
  try {
    if (mode === 'free_talk') return { show: decidedShow || null, repeat: false };
    if (mode === 'focused') return verifiedFix ? { show: verifiedFix, repeat: true } : { show: null, repeat: false };
    return { show: decidedShow || null, repeat: !!decidedRepeat };
  } catch { return { show: decidedShow || null, repeat: !!decidedRepeat }; }
}

/**
 * 집중교정 — 검증된 교정이 있으면 아바타가 «고친 문장을 먼저» 말하게 한다.
 *   순서: 고친 문장 → "Let's say it this way" → 고친 문장 3번 반복 → 따라 말하자 → 답장.
 *   · 답장에 고친 문장이 이미 들어 있어도 이 순서는 항상 지킨다(답장이 먼저 나오면 교정이 뒤로 밀린다).
 *   · 문장을 새로 지어내지 않는다 — 서버가 검증을 통과시킨 fix.now 만 쓴다.
 *   · 완벽(perfect)이면 고칠 것이 없으니 건드리지 않는다.
 * [왜] 화면은 교정 카드와 「따라 말해 보기」 버튼만 그리고, 아바타 음성은 답장 텍스트만 읽는다.
 *   답장을 먼저 읽으면 학생은 교정을 듣기 전에 대화가 넘어간 것으로 듣는다(원장님 제보).
 */
export const FOCUSED_FIX_REPEATS = 3;

export function ensureFocusedFixSpoken(
  reply: string, mode: WarmupMode, grade: WarmupGrade | null, fix: WarmupFix | null,
): string {
  try {
    if (mode !== 'focused' || !fix || grade === 'perfect') return reply;
    const now = String(fix.now == null ? '' : fix.now).trim();
    if (!now) return reply;
    const repeated = Array.from({ length: FOCUSED_FIX_REPEATS }, () => `"${now}"`).join(' ');
    return `"${now}" Let's say it this way: ${repeated} Can you say it with me? ${reply}`;
  } catch { return reply; }
}
