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
//       🟡 suggest — 모델이 «문법은 맞지만 원어민이 안 쓴다» 고 한 것 → suggestions(원어민 표현으로 «고쳐 줌», 오류 개수엔 안 셈)
//       🟢 그 밖  — «다르게도 쓸 수 있다» 수준 → 버립니다(학생 표현을 인정)
//     ⛔ 확신이 없으면 «틀렸다» 고 말하지 않습니다 — 틀린 지적은 지적 없음보다 나쁩니다.
//     ⛔ 학생이 쓰지 않은 말을 «고쳤다» 고 띄우지 않습니다(어휘 업그레이드의 from 규칙과 같음).
//
//   [2026-11-02 사장님 결정 — 🟡 는 «참고» 가 아니라 «고쳐 주기»]
//     「My condition is not good today.」 는 문법은 맞지만 원어민이 안 씁니다(→ I'm not feeling well today.).
//     «참고» 로만 보여 주면 아이는 «내 표현도 써도 된다» 고 받아들여 그대로 다시 씁니다.
//     그래서 🟡 는 대표 표현 1개로 «고쳐 주고»(corrected 에도 반영), 다른 자연스러운 표현은
//     말투·상황이 다를 때만 최대 2개(alternatives — «언제 쓰는지» 한 줄과 함께) 덧붙입니다.
//     ⚠️ 오류 개수·단어장·판단력 오답 기록에는 여전히 넣지 않습니다(문법은 맞게 썼기 때문).
//     ⛔ 과잉 교정은 그대로 막습니다 — «다르게도 쓸 수 있다» 수준은 🟢(버림)입니다.
// ═══════════════════════════════════════════════════════════════════════
import { explainCorrection, STYLE_SWAP_LEAD, DROP_WORDS_LEAD } from './correction-reason';
import { isReadableKo, isEnglishReply, looksGarbledKo } from './ko-readable';

export type IssueKind = 'error' | 'suggest';
/** 🟡 의 «이렇게도 말해요» — 대표 표현과 말투·상황이 다른 자연스러운 표현 + 언제 쓰는지(한국어 한 줄). */
export interface IssueAlternative { text: string; when: string }
export interface TriagedIssue { original: string; suggested: string; reason: string; kind: IssueKind; alternatives?: IssueAlternative[] }
export interface TriageResult { issues: TriagedIssue[]; suggestions: TriagedIssue[]; dropped: Array<{ why: string; original: string; suggested: string }> }

export const MAX_ERRORS = 5;
export const MAX_SUGGESTIONS = 3;
/** 🟡 하나에 덧붙이는 «이렇게도 말해요» 최대 개수 — 많으면 무엇을 외울지 헷갈립니다. */
export const MAX_ALTERNATIVES = 2;
/** 모델 이유가 없을 때 🟡 에 붙이는 문구 — «문법은 맞다» 와 «원어민 표현으로 익히자» 를 함께 말합니다.
 *  ⛔ 「지금 표현도 써도 된다」로 읽히는 말은 쓰지 않습니다(2026-11-02 사장님 결정). */
export const SUGGEST_FALLBACK_KO = '문법은 맞지만 원어민은 보통 이렇게 말해요. 고친 표현으로 익혀 두세요.';
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

/* 🔤 «읽을 수 있는 한국어» 판정은 공용 정본 ko-readable.ts 로 옮겼습니다(2026-11-01 — 다른 AI 기능도 같은 검사를 씁니다).
   이 파일은 그대로 다시 내보내 api-ai.ts 의 import 가 바뀌지 않게 합니다. */
export { isReadableKo, isEnglishReply };

/**
 * 🟡 의 «이렇게도 말해요» 를 거릅니다(순수 함수 — 던지지 않습니다).
 *   · 영어만(한글·한자가 섞이면 버림 — 학생이 «따라 쓸 영어» 입니다)
 *   · 대표 표현·학생 원문·서로와 같으면 버림(같은 말을 두 번 보여 주지 않음)
 *   · «언제 쓰는지» 가 없거나 깨진 한국어면 버림 — 설명 없는 대안은 «무엇이 다른가» 를 못 가르칩니다
 *   · 최대 MAX_ALTERNATIVES 개
 */
export function cleanAlternatives(raw: any, original: string, suggested: string): IssueAlternative[] {
  const out: IssueAlternative[] = [];
  if (!Array.isArray(raw)) return out;
  const seen = new Set<string>([normForCompare(original).toLowerCase(), normForCompare(suggested).toLowerCase()]);
  for (const a of raw.slice(0, 6)) {
    if (out.length >= MAX_ALTERNATIVES) break;
    const text = String((a && typeof a === 'object' ? a.text : a) || '').trim().slice(0, 120);
    const when = String((a && typeof a === 'object' ? (a.when ?? a.note ?? a.usage) : '') || '').trim().slice(0, 80);
    if (!text || !/^[A-Za-z][A-Za-z0-9' ,.!?;:-]*$/.test(text)) continue;
    const k = normForCompare(text).toLowerCase();
    if (!k || seen.has(k)) continue;
    if (!/[가-힣]/.test(when) || when.length < 2 || looksGarbledKo(when)) continue;
    seen.add(k);
    out.push({ text, when });
  }
  return out;
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
      const alternatives = cleanAlternatives(it && it.alternatives, original, suggested);
      out.suggestions.push({ original, suggested, reason, kind: 'suggest', alternatives });
    } else {
      // 🟢 문법 규칙으로도, 모델 판단으로도 «틀렸다» 는 근거가 없다 → 학생 표현을 인정합니다.
      drop('acceptable');
    }
  }
  return out;
}
