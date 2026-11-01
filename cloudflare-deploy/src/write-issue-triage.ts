// ═══════════════════════════════════════════════════════════════════════
// 🚦 write-issue-triage.ts — AI 영작 첨삭의 «고칠 곳» 을 3단계로 가른다 (2026-11-01)
//
//   [왜 필요한가 — 엘리더잼 원장님 피드백]
//     맞게 쓴 표현까지 «이렇게 고치면 더 좋아요» 로 고쳐 보였습니다.
//       · When the water boils → Once the water has boiled   (원래도 자연스러움)
//       · I'll teach you … → I'll show you …                  (teach 도 정확함)
//       · We make it at home with my family. → 똑같은 문장       (바뀐 것이 없음)
//     아이들은 «고쳐졌다 = 내가 틀렸다» 로 받아들여, 알고 있는 표현을 다음 글에서 안 씁니다.
//     뿌리는 둘이었습니다 — ① 프롬프트가 «2-5개» 를 강제(완벽한 글에도 지어냄)
//     ② 서버가 «원문과 같은 수정안» 을 거르지 않음(그 항목엔 폴백 이유가 붙어 «고친 것» 처럼 보임).
//
//   [원칙 — 이 저장소의 반복 실측: 「지시만으로는 안 지켜진다」]
//     프롬프트는 보조로 두고, **보장은 이 파일의 결정론 판정**이 합니다.
//       🔴 error   — 문법 규칙으로 설명되거나(explainCorrection) 모델이 오류라고 한 것 → issues(빨간 줄)
//       🟡 suggest — 모델이 «틀리진 않지만 어색하다» 고 한 것 → suggestions(참고, 오류로 안 셈)
//       🟢 그 밖  — «다르게도 쓸 수 있다» 수준 → 버립니다(학생 표현을 인정)
//     ⛔ 확신이 없으면 «틀렸다» 고 말하지 않습니다 — 틀린 지적은 지적 없음보다 나쁩니다.
//     ⛔ 학생이 쓰지 않은 말을 «고쳤다» 고 띄우지 않습니다(어휘 업그레이드의 from 규칙과 같음).
// ═══════════════════════════════════════════════════════════════════════
import { explainCorrection, STYLE_SWAP_LEAD, DROP_WORDS_LEAD } from './correction-reason';

export type IssueKind = 'error' | 'suggest';
export interface TriagedIssue { original: string; suggested: string; reason: string; kind: IssueKind }
export interface TriageResult { issues: TriagedIssue[]; suggestions: TriagedIssue[]; dropped: Array<{ why: string; original: string; suggested: string }> }

export const MAX_ERRORS = 5;
export const MAX_SUGGESTIONS = 3;
/** 모델 이유가 없을 때 «참고» 에 붙이는 문구 — «틀렸다» 가 아니라 «지금도 맞다» 를 먼저 말합니다. */
export const SUGGEST_FALLBACK_KO = '지금 표현도 틀린 것은 아니에요. 원어민은 이렇게도 자주 써요.';
export const ERROR_FALLBACK_KO = '이렇게 고치면 문법에 맞아요.';

/** 비교용 정규화 — 눈에 안 보이는 차이(곡선 따옴표·특수 공백·끝 문장부호)는 같은 것으로 봅니다. */
export function normForCompare(s: any): string {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[  -‍⁠﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.!?,;:]+$/, '')
    .trim();
}

/** 낱말 열(소문자·영숫자·아포스트로피만) — «학생 글에 그 말이 있는가» 판정용. */
export function wordSeq(s: any): string[] {
  return normForCompare(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(' ').filter(Boolean);
}

/** needle 낱말 열이 hay 낱말 열 안에 «붙어서» 나오는가. */
function containsSeq(hay: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** 모델이 붙인 category → 'error' | 'unnatural' | '' (모르면 빈 값 — 추측하지 않음). */
export function modelCategory(it: any): 'error' | 'unnatural' | '' {
  const c = String((it && (it.category ?? it.type ?? it.kind)) || '').toLowerCase().trim();
  if (/^(error|grammar|spelling|mistake|wrong)/.test(c)) return 'error';
  if (/^(unnatural|awkward|suggest)/.test(c)) return 'unnatural';
  return '';   // 'style'·'ok'·빈 값 — «다르게도 쓸 수 있다» 는 고칠 근거가 아닙니다
}

/**
 * AI 가 쓴 한국어가 «사람이 읽을 수 있는 문장» 인가(2026-11-01 실사고).
 *   운영 화면 실측: 「신호 입력를 지도신.」·「어 신린 있다 없다」·「지도 알는 어 지도 었다 알 지도 었다.」 —
 *   한국어에 약한 보조 모델이 낱말 조각을 늘어놓았는데, «한글 6자 이상» 검사만 있어 그대로 학생 화면에 나갔습니다.
 *   ⛔ 확신이 없으면 버립니다(부르는 쪽이 결정론 설명·기본 문구로 바꿉니다). 틀린 설명은 설명 없음보다 나쁩니다.
 *   ① 길이 6~200 · 한글 포함  ② 존댓말로 끝남(…요 / …니다)  ③ 같은 낱말이 세 번 이상 반복되지 않음
 *   ④ 받침 있는 글자 뒤 «를», 받침 없는 글자 뒤 «을» 같은 틀린 조사가 없음(「입력를」)
 */
export function isReadableKo(raw: any): boolean {
  const s = String(raw == null ? '' : raw).trim();
  if (s.length < 6 || s.length > 200 || !/[가-힣]/.test(s)) return false;
  if (!/(요|니다)[.!?~\s]*$/.test(s)) return false;
  const toks = s.replace(/[^가-힣a-zA-Z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
  const cnt: Record<string, number> = {};
  for (const t of toks) { cnt[t] = (cnt[t] || 0) + 1; if (cnt[t] >= 3) return false; }
  const hasJong = (ch: string) => { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 && c % 28 !== 0; };
  for (const t of toks) {
    const m = t.match(/([가-힣])(를|을)$/);
    if (!m || t.length < 3) continue;
    if (m[2] === '를' && hasJong(m[1])) return false;
    if (m[2] === '을' && !hasJong(m[1])) return false;
  }
  return true;
}

/** 영어로 써야 하는 칸(펜팔 답장)인가 — 한글이 섞이거나 영문자가 너무 적으면 false. */
export function isEnglishReply(raw: any): boolean {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(s)) return false;
  const nonSpace = s.replace(/\s+/g, '');
  const letters = (nonSpace.match(/[A-Za-z]/g) || []).length;
  return letters >= 3 && letters / nonSpace.length >= 0.6;
}

/**
 * 모델이 준 issues 배열을 3단계로 가릅니다(순수 함수 — 던지지 않습니다).
 *   studentText: 학생 원문 전체  ·  rawIssues: 모델 JSON 의 issues(모양이 틀려도 됨)
 */
export function triageIssues(studentText: any, rawIssues: any): TriageResult {
  const out: TriageResult = { issues: [], suggestions: [], dropped: [] };
  const text = String(studentText == null ? '' : studentText);
  const textNorm = normForCompare(text);
  const textWords = wordSeq(text);
  const list = Array.isArray(rawIssues) ? rawIssues.slice(0, 8) : [];
  const seen = new Set<string>();
  for (const it of list) {
    const original = String((it && it.original) || '').trim().slice(0, 300);
    const suggested = String((it && it.suggested) || '').trim().slice(0, 300);
    const modelReason = String((it && it.reason) || '').trim().slice(0, 200);
    const drop = (why: string) => { out.dropped.push({ why, original, suggested }); };
    if (!original || !suggested) { drop('empty'); continue; }

    const oN = normForCompare(original), sN = normForCompare(suggested);
    // ① 바뀐 것이 없다 — 화면에 «고쳤다» 고 띄우면 안 됩니다(원장님 사례 3).
    if (oN === sN) { drop('identical'); continue; }
    // ② 대소문자만 다르다 — 학생이 «실제로 그렇게 썼을 때» 만 고칩니다(모델이 인용을 잘못한 경우 제외).
    if (oN.toLowerCase() === sN.toLowerCase() && !textNorm.includes(oN)) { drop('case_misquote'); continue; }
    // ③ 학생이 쓰지 않은 말을 고쳤다 — 버립니다.
    if (!containsSeq(textWords, wordSeq(original))) { drop('not_in_text'); continue; }
    const key = oN.toLowerCase() + '\u0000' + sN.toLowerCase();
    if (seen.has(key)) { drop('duplicate'); continue; }
    seen.add(key);

    const det = explainCorrection(original, suggested);
    const styleOnly = !!det && (det.startsWith(STYLE_SWAP_LEAD) || det.startsWith(DROP_WORDS_LEAD));
    const ruleBacked = !!det && !styleOnly;
    const cat = modelCategory(it);

    if (ruleBacked || cat === 'error') {
      if (out.issues.length >= MAX_ERRORS) { drop('over_cap'); continue; }
      // 🔤 규칙으로 설명되는 교정은 «서버 설명» 이 정본입니다 — AI 한국어는 깨질 수 있습니다(위 isReadableKo 실사고).
      const reason = ruleBacked ? (det as string) : (isReadableKo(modelReason) ? modelReason : (det || ERROR_FALLBACK_KO));
      out.issues.push({ original, suggested, reason, kind: 'error' });
    } else if (cat === 'unnatural') {
      if (out.suggestions.length >= MAX_SUGGESTIONS) { drop('over_cap'); continue; }
      const reason = isReadableKo(modelReason) ? modelReason : SUGGEST_FALLBACK_KO;
      out.suggestions.push({ original, suggested, reason, kind: 'suggest' });
    } else {
      // 🟢 문법 규칙으로도, 모델 판단으로도 «틀렸다» 는 근거가 없다 → 학생 표현을 인정합니다.
      drop('acceptable');
    }
  }
  return out;
}
