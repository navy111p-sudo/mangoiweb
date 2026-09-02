// ═══════════════════════════════════════════════════════════════════════
// 🧪 quiz-quality.ts — AI 가 만든 복습퀴즈 «문항» 검사 (정본)
//
// [왜 이 파일이 생겼나 — 2026-09-02]
//   `rqAiGenerate`(api-games.ts)의 영어 갈래는 프롬프트로 규칙을 **지시만** 하고
//   결과를 **한 번도 확인하지 않았다.** 그런데 이 저장소의 반복 실측은
//   「지시만으로는 안 지켜진다」이다 — 단어 수·문법·구두점 전례가 모두 그랬다:
//     · 판단력 훈련: 「Want play with me」(to 누락)가 보기로 그대로 나감
//     · AI 영어친구: 길이를 조이자 「You have dog?」 같은 전보문이 나옴
//   복습퀴즈는 학생이 **정답으로 외우는** 문장이라 그 사고가 더 나쁘다.
//
// [무엇을 새로 만들지 않았나]
//   ⛔ 판정 규칙을 새로 쓰지 않는다. 이미 정본이 넷 있고 하니스가 지키고 있다:
//     · isEnglishQuestion    (english-only.ts)   — 중국어·병음 섞임
//     · aiFriendBrokenQuestions (ai-friend-level.ts) — 전보문 의문문
//     · BAND_SPECS           (judgment-level.ts)  — 레벨별 단어 수
//     · endSentence          (sentence-punct.ts)  — 종결부호(참고용)
//   여기서는 그것들을 **문항 모양에 맞게 불러 쓰기만** 한다.
//
// [이 파일만 아는 것 — 프롬프트가 «요구만» 하고 아무도 안 보던 것들]
//   · listen 문항의 보기(opts)에 정답 음성문장(audio_text)이 실제로 들어 있는가
//     → 없으면 «정답이 없는 문항» 이다. 학생은 무엇을 골라도 틀린다.
//   · choice 의 answer 인덱스가 opts 범위 안인가 (범위 밖이면 영원히 오답)
//   · 보기에 같은 값이 두 개 있는가 (정답이 둘이 된다)
//   · 한 세트 안에 같은 문장이 반복되는가
// ═══════════════════════════════════════════════════════════════════════
import { isEnglishQuestion, isEnglishText } from './english-only';
import { aiFriendBrokenQuestions, aiFriendCountWords, aiFriendLevelSpec } from './ai-friend-level';
import { BAND_SPECS, BAND_COUNT, bandFromTextbookLevel } from './judgment-level';

/** 문항 하나가 왜 떨어졌는지 — 사람이 읽는 이유(관리자 화면·로그에 그대로 나간다) */
export type QuizReject = { index: number; type: string; reasons: string[] };

export type QuizFilterResult = {
  kept: any[];
  dropped: QuizReject[];
};

/* 교재 레벨('Lv 13') → AI친구 단계('S4').
   ⚠️ 두 눈금은 같은 8칸이다(CLAUDE.md: 「A1 = 웜업 레벨 1 = 3~5단어」).
      새 표를 만들지 않고 밴드 번호를 그대로 단계 번호로 쓴다. */
function stepFromTextbookLevel(level: any): string {
  const band = bandFromTextbookLevel(level);
  if (!band || band < 1 || band > BAND_COUNT) return '';
  return 'S' + band;
}

/** 그 레벨에서 한 문장이 몇 단어까지 괜찮은가. 레벨을 모르면 0(= 길이 검사 안 함). */
function maxWordsFor(level: any): number {
  const band = bandFromTextbookLevel(level);
  if (!band) return 0;
  const spec = BAND_SPECS[band - 1];
  if (!spec) return 0;
  /* ⚠️ 상한을 «딱» 걸면 문법을 지키다 한두 낱말 넘는 문장이 떨어진다 —
     그러면 모델이 관사·조동사를 버려서 전보문이 이긴다(AI 영어친구에서 실측한 그 사고).
     문법이 먼저다. 그래서 여유를 둔다(ai-friend-level.ts 의 hardMax 와 같은 취지). */
  return spec.maxWords + 3;
}

const str = (v: any) => String(v == null ? '' : v).trim();

/* 🔤 문장 비교용 정규화 — 구두점·대소문자·공백을 무시한다.
   [왜] listen 문항의 「들려준 문장」과 「보기」를 완전일치로 견주면, 둘이 서로 다른
        종결부호를 달고 온 것만으로(「I like apples!」대 「I like apples.」) 멀쩡한 문항이
        «정답이 보기에 없습니다» 로 떨어진다.
   ⚠️ 이것은 채점 정본 `rqNorm`(api-games.ts)과 **같은 말을 해야 한다** — 그쪽은 핸들러 안의
      지역 함수라 import 할 수 없어 같은 방식을 여기에 둔다. 두 곳이 어긋나면
      「검사는 통과했는데 채점에서 틀리는」 문항이 생긴다. 하니스가 둘을 대조한다. */
const normSentence = (v: any) =>
  String(v == null ? '' : v).toLowerCase()
    .replace(/[^a-z0-9가-힣\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** 그 문항이 학생에게 보여 줄 «영어 문장» 들 — 길이·문법 검사의 대상 */
function englishPartsOf(q: any): string[] {
  const out: string[] = [];
  const push = (v: any) => { const s = str(v); if (s) out.push(s); };
  push(q && q.audio_text);
  push(q && q.answer_text);
  push(q && q.target);
  if (q && Array.isArray(q.opts)) for (const o of q.opts) push(o);
  return out;
}

/**
 * 문항 하나를 검사한다. 통과하면 빈 배열, 아니면 «왜 떨어졌는지» 목록.
 *
 * @param level 교재 레벨 표기('Lv 13'). 없으면 길이·문법 검사는 건너뛴다
 *              (모르는 채로 막는 것보다 통과시키는 쪽이 낫다 — 문제를 못 주는 것이 더 나쁘다).
 */
export function checkQuizQuestion(q: any, level?: any): string[] {
  const bad: string[] = [];
  if (!q || typeof q !== 'object') return ['문항이 객체가 아닙니다'];

  const type = str(q.type).toLowerCase();
  if (['choice', 'listen', 'write', 'speak'].indexOf(type) < 0) {
    bad.push(`모르는 문항 종류: ${type || '(없음)'}`);
    return bad;   // 종류를 모르면 나머지 검사가 뜻이 없다
  }
  if (!str(q.q)) bad.push('문제 지문이 비었습니다');

  /* 🈶 중국어·병음이 섞이면 영어 학생에게 나가면 안 된다.
     정본 isEnglishQuestion 이 지문·해설·보기·accept 를 한꺼번에 본다. */
  if (!isEnglishQuestion(q)) bad.push('중국어·일본어 글자가 섞여 있습니다');

  if (type === 'choice' || type === 'listen') {
    const opts = Array.isArray(q.opts) ? q.opts.map(str) : [];
    if (opts.length < 2) bad.push('보기가 2개 미만입니다');
    if (opts.some((o) => !o)) bad.push('빈 보기가 있습니다');
    const uniq = new Set(opts.map((o) => o.toLowerCase()));
    if (uniq.size !== opts.length) bad.push('같은 보기가 두 번 나옵니다 (정답이 둘이 됩니다)');
    const ans = Number(q.answer);
    if (!Number.isInteger(ans) || ans < 0 || ans >= opts.length) {
      bad.push(`정답 번호가 보기 범위 밖입니다 (answer=${q.answer}, 보기 ${opts.length}개)`);
    }
    if (type === 'listen') {
      /* 🎧 프롬프트가 「들려준 문장이 보기에 정답으로 들어가야 한다」고 요구하지만
         아무도 확인하지 않았다. 없으면 **정답이 없는 문항**이라 무엇을 골라도 틀린다. */
      const audio = str(q.audio_text);
      if (!audio) bad.push('들려줄 문장(audio_text)이 없습니다');
      else {
        const at = normSentence(audio);
        const hit = opts.findIndex((o) => normSentence(o) === at);
        if (hit < 0) bad.push('들려준 문장이 보기에 없습니다 (정답이 없는 문항)');
        else if (Number(q.answer) !== hit) bad.push('정답 번호가 들려준 문장을 가리키지 않습니다');
      }
    }
  }

  if (type === 'write' || type === 'speak') {
    const a = str(q.answer_text);
    if (!a) bad.push('정답 문장(answer_text)이 없습니다');
    else if (!isEnglishText(a, 200)) bad.push('정답 문장이 영어가 아닙니다');
  }

  // ── 레벨 규격 — 레벨을 알 때만 ──────────────────────────────────
  const cap = maxWordsFor(level);
  if (cap > 0) {
    for (const s of englishPartsOf(q)) {
      const n = aiFriendCountWords(s);
      if (n > cap) { bad.push(`문장이 이 레벨에 너무 깁니다 (${n}단어 > ${cap}): "${s.slice(0, 48)}"`); break; }
    }
    /* 🔴 전보문 의문문 — 「Do you have a dog?」가 「You have dog?」로 나오는 사고.
       ⛔ 정본 계약대로 **기초 레벨(plain)에서만** 본다. 상급으로 넓히면
          「So you like dogs?」 같은 구어체를 잡는다(CLAUDE.md 명시). */
    const step = stepFromTextbookLevel(level);
    if (step && aiFriendLevelSpec(step).plain) {
      for (const s of englishPartsOf(q)) {
        const broken = aiFriendBrokenQuestions(s, step);
        if (broken.length) { bad.push(`문법이 깨진 의문문입니다: "${broken[0].slice(0, 48)}"`); break; }
      }
    }
  }
  return bad;
}

/**
 * 문항 묶음을 걸러 «쓸 수 있는 것» 과 «왜 떨어졌는지» 로 나눈다.
 *
 * ⚠️ 세트 안 중복도 여기서 본다 — 같은 문장이 두 번 나오면 학생이 같은 문제를 두 번 푼다.
 * ⚠️ 이 함수는 절대 던지지 않는다. 부르는 쪽이 «학생이 기다리는 출제» 이기도 하다.
 */
export function filterQuizQuestions(questions: any, level?: any): QuizFilterResult {
  const list = Array.isArray(questions) ? questions : [];
  const kept: any[] = [];
  const dropped: QuizReject[] = [];
  const seen = new Set<string>();

  list.forEach((q, i) => {
    let reasons: string[] = [];
    try { reasons = checkQuizQuestion(q, level); }
    catch (e: any) { reasons = ['검사 중 오류: ' + (e && e.message)]; }

    if (!reasons.length) {
      /* 같은 문장이 두 번 — 지문이 아니라 «영어 정답» 으로 센다
         (지문은 「다음 뜻의 영어 문장을 쓰세요」처럼 겹치는 것이 정상이다). */
      const key = [str(q.type).toLowerCase(), str(q.audio_text) || str(q.answer_text) || str(q.q)]
        .join('|').toLowerCase();
      if (key && seen.has(key)) reasons = ['같은 문항이 이미 있습니다'];
      else if (key) seen.add(key);
    }
    if (reasons.length) dropped.push({ index: i, type: str(q && q.type), reasons });
    else kept.push(q);
  });

  return { kept, dropped };
}

/** 관리자 화면·로그에 한 줄로 보여 줄 요약 */
/* ⚠️ 이 검사기를 지나지 않는 길이 하나 있다 — 관리자 «수동 저장»
   (`POST /api/admin/review-quiz/save`)은 `rqParseQuestions` 만 거친다.
   사람이 쓴 문항을 기계가 막지 않는 것은 타당하지만, 그래서
   **「은행에 있는 문항은 전부 이 검사를 통과했다」는 전제는 성립하지 않는다.**
   나중에 그 전제로 무언가를 판단하지 말 것. */
export function summarizeRejects(dropped: QuizReject[]): string {
  if (!dropped.length) return '';
  const tally = new Map<string, number>();
  for (const d of dropped) for (const r of d.reasons) {
    const head = r.split(' (')[0].split(':')[0];
    tally.set(head, (tally.get(head) || 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}건`).join(' · ');
}
