/*!
 * ✏️ warmup-correction.ts — «교정 카드» 판정 정본 (2026-09-08)
 *    쓰는 화면 둘: A.i 웜업(/api/warmup/chat) · AI 영어친구(/api/ai/chat-friend, 2026-09-09 추가)
 *    ⛔ 파일 이름이 warmup 이라고 웜업 전용으로 읽지 말 것. 판정을 화면마다 복제하면
 *       한쪽만 고쳐지는 것이 이 저장소가 반복해 밟은 함정이다(no-show-truth.ts 선례).
 *       화면별로 다른 것은 «프롬프트 문구» 뿐이고, fix 스키마와 파싱·검증·게이트는 한 벌이다.
 *
 * 왜 만들었나:
 *   웜업 시스템 프롬프트에는 [칭찬]·[막혔을 때]·[재미] 는 있는데 «교정» 이 한 줄도 없었다.
 *   그래서 학생이 "I go to school yesterday" 라고 해도 아바타는 칭찬하고 다음 질문으로 갔다.
 *   지금 웜업의 정체는 «말할 기회» 이지 «배우는 시간» 이 아니었다.
 *
 * ⛔ 교정을 «두 번째 LLM 호출» 로 만들지 말 것.
 *   지금 /api/warmup/chat 이 이미 부르는 그 한 번의 호출에서 답장과 교정을 함께 JSON 으로
 *   받는다. 따로 부르면 왕복이 하나 더 붙어 한 턴이 두 배가 되고, 아이는 기다리지 않는다.
 *
 * ⛔ 지시만으로는 안 지켜진다 — 이 저장소가 단어 수·문법·구두점에서 반복 확인한 것이다.
 *   그래서 모델이 준 fix 를 그대로 쓰지 않고 verifyWarmupFix() 가 «만든 뒤 확인해서 버린다».
 *   특히 was 가 학생 원문에 «글자 그대로» 있어야 한다 — 없으면 모델이 지어낸 것이고,
 *   지어낸 교정은 «안 고쳐 주는 것» 보다 나쁘다. 아이가 그대로 따라 말하기 때문이다.
 *
 * ✅ 실패 방향: 이 파일의 모든 판정은 «교정 없음» 쪽으로 실패한다.
 *   파싱이 깨지든 검증에 걸리든 결과는 «고치기 전과 똑같은 웜업» 이다. 그것이 안전한 쪽이다.
 *
 * 감시: test-harness/warmup_correction_harness.mjs (정본을 타입 제거로 실제로 돌린다)
 */

import { isEnglishText } from './english-only';

/** 교정 종류 — 화면이 색·아이콘을 고르는 데 쓰고, 같은 실수가 되풀이되는지 세는 열쇠이기도 하다. */
export const WARMUP_FIX_TAGS = [
  'past_tense', 'verb_form', 'article', 'plural', 'preposition',
  'word_order', 'subject_verb', 'word_choice', 'question_form', 'other',
] as const;

/** 뜻이 달라지는 교정 — 그대로 두면 학생이 틀린 채로 굳는다. 모델이 minor 라 해도 major 로 본다.
 *  ⛔ 여기에 article·plural·word_choice 를 넣지 마세요 — 그 순간 매 턴 교정이 떠서
 *     「사소한 것까지 매번 잡히면 학생이 말문이 막힌다」가 그대로 재현됩니다. */
export const MEANING_CHANGING_TAGS = ['past_tense', 'verb_form', 'subject_verb', 'question_form'] as const;

export type WarmupFix = {
  was: string;
  now: string;
  why_ko: string;
  tag: string;
  severity: 'major' | 'minor';
};

/** 세션 동안 «무엇을 몇 번 틀렸나 · 마지막으로 언제 고쳐 줬나» — KV 에 6시간 보관한다. */
export type WarmupFixMemo = {
  tags?: Record<string, number>;
  lastShownTurn?: number;
  lastRepeatTurn?: number;
  shown?: number;
};

/* ─────────────────────────────────────────────────────────────
   프롬프트 — [교정] 절 + JSON 출력 계약
   ⚠️ reply 안의 글은 기존 [형식]·[길이]·[언어] 규칙을 그대로 따른다.
      JSON 은 «담는 그릇» 일 뿐이고 학생이 보는 문장의 규칙을 바꾸지 않는다.
   ───────────────────────────────────────────────────────────── */
/** JSON 계약 — "reply" 설명만 화면마다 다르고 **"fix" 는 완전히 같다**.
    ⛔ 화면마다 스키마를 따로 적지 말 것 — 그 순간 한쪽만 조용히 어긋나고,
       parseWarmupOutput·verifyWarmupFix 한 벌이 두 화면을 다 받는다는 전제가 깨진다. */
function fixJsonLine(replyDesc: string): string {
  return '{"reply":"' + replyDesc + '","fix":{"was":"<학생이 실제로 쓴 틀린 부분 그대로>",'
    + '"now":"<고친 영어>","why_ko":"<왜 고쳤는지 한국어 한 문장, 다정한 반말>",'
    + '"tag":"past_tense|verb_form|article|plural|preposition|word_order|subject_verb|word_choice|question_form|other",'
    + '"severity":"major|minor"}}';
}

/** 두 화면이 함께 지켜야 하는 것 — 지어낸 교정은 «안 고쳐 주는 것» 보다 나쁘다. */
const FIX_COMMON_RULES = [
  '고칠 것이 없으면 "fix": null 로 둬.',
  '"was" 는 학생이 «실제로 쓴 글자 그대로» 여야 해 — 학생이 말하지 않은 문장을 지어내면 절대 안 돼.',
  '"severity" 는 뜻이 달라지거나 못 알아들을 정도면 "major", 알아들을 수는 있는 작은 실수면 "minor".',
];

export const WARMUP_CORRECTION_RULE = [
  '[교정] 학생 문장에 영어 오류가 있으면 야단치지 말고 «먼저 반갑게 반응한 뒤 자연스럽게 되말해» 줘(recast).',
  '예: 학생 "I go to school yesterday" → "Oh, you went to school yesterday! What did you do there?"',
  '한 번에 한 가지만 고쳐. 다만 «시제·동사꼴·주어동사 수일치·의문문 어순» 은 뜻이 통해도 «반드시» 고쳐 줘 — 그 넷은 그대로 두면 학생이 틀린 채로 굳는다(예: "I eat pizza yesterday" → "I ate pizza yesterday").',
  '⛔ 그 넷이 아닌 사소한 것(관사 하나, 낱말 고르기)까지 매번 잡지는 마. 매번 잡히면 학생이 말문이 막힌다.',
  '[출력형식] ⚠️ 이 규칙이 위 [형식] 보다 «우선» 한다 — 웜업 프롬프트의 [형식] 은 「평문으로만 써」 라고 말하지만, 그것은 아래 JSON 안의 "reply" 글에만 적용되는 규칙이야. 너는 반드시 아래 JSON 하나만 출력해. 설명·인사·코드펜스 없이 { 로 시작해 } 로 끝나야 해.',
  fixJsonLine('<학생에게 할 영어 말 — 위 [길이]·[언어]·[형식] 규칙 그대로>'),
  ...FIX_COMMON_RULES,
].join('\n');

/* ─────────────────────────────────────────────────────────────
   🤖 AI 영어친구(/api/ai/chat-friend) 용 같은 계약 — 2026-09-09
   사장님 「A.i 친구도 똑같이 만들어줘」.

   왜 여기에 두나: 판정(parse·verify·gate)을 두 곳에 복제하면 한쪽만 고쳐지는 것이
   이 저장소가 반복해 밟은 함정이다(no-show-truth.ts 선례). 프롬프트만 화면별로 다르고
   «fix 스키마와 판정» 은 한 벌이어야 한다.

   ⚠️ 이 화면의 시스템 프롬프트는 영어라 «지시문» 은 영어로 쓴다 — 모델이 프롬프트 언어를
      따라 답을 쓰는 경향이 있어, 한국어를 섞으면 reply 에 한국어가 샌다(src/reply-korean.ts).
      🔴 그렇다고 이 규칙이 «전부» 영어인 것은 아니다 — 실측 11줄 중 5줄이 한국어다.
         ⚠️ 줄을 더하거나 빼면 이 숫자와 CLAUDE.md 의 같은 숫자를 «함께» 고칠 것.
         fix 스키마와 공통 규칙(fixJsonLine·FIX_COMMON_RULES)을 두 화면이 «글자까지 같게»
         쓰기로 한 대가이고, 그것이 파서·검증 한 벌이 두 화면을 받는 근거다.
         ⛔ 「이 규칙은 영어다」라고 적지 말 것 — 2026-09-09 에 그렇게 적었다가 함정 대조가
            세어 보고 잡았다. 새어 나온 한국어는 하류 stripAddedKorean 이 받는다(막지는 못한다).
   ⚠️ 옛 방식은 답장 «본문 끝» 에 (💡 …) 한국어 팁을 붙이는 것이었다. 그 팁은
      «고친 문장» 을 보여 주지 않아 학생이 무엇을 어떻게 고쳐야 하는지 알 수 없었다
      (2026-09-09 실측: "I go to school yesterday" → 「어제에 가는 것이 더 자연스러워요」).
   ⛔ 그래서 팁을 reply 안에 다시 넣지 말 것 — 같은 말이 카드와 본문에 두 번 나온다.
   ───────────────────────────────────────────────────────────── */
export const AI_FRIEND_CORRECTION_RULE = [
  'OUTPUT FORMAT — this rule OVERRIDES every rule above about how to lay out your message.',
  'Reply with ONE JSON object and nothing else: no greeting, no explanation, no code fence. Start with { and end with }.',
  fixJsonLine('<your English message to the student — obey EVERY rule above: level, sentence limit, cheer, emojis, one question>'),
  'Everything the student reads is inside "reply". All the rules above apply to that text and to nothing else.',
  '⛔ NEVER put a Korean grammar tip inside "reply". The correction goes in "fix" only — the student sees it as its own card next to your message.',
  '"why_ko" must be Hangul only (no 한자, no Japanese): one short warm sentence a 10-year-old understands.',
  'Fix at most ONE thing per turn. ALWAYS fix these four even when the meaning is perfectly clear — wrong tense, wrong verb form, subject-verb agreement, question word order. Example: "I eat pizza yesterday" MUST be fixed to "I ate pizza yesterday". Leaving them uncorrected is how a child learns the mistake by heart.',
  'For anything smaller than those four (one missing article, a word choice you would phrase differently), set "fix": null and just keep chatting happily — being nagged every turn makes a child stop talking.',
  ...FIX_COMMON_RULES,
].join('\n');

/* ─────────────────────────────────────────────────────────────
   response_format 거절 판정 — 웜업·AI친구가 «같은 답» 을 내야 한다
   ⛔ `if (!켰나) throw` 로만 가르면 «이미 껐나» 를 물을 뿐이라 429·타임아웃·5xx 가
      전부 이 분기로 들어온다. 그러면 무관한 일시 장애 한 번에 JSON 모드가 꺼져
      그 요청의 남은 경로가 통째로 옛 동작으로 되돌아간다(2026-09-08 함정 대조).
   📌 index.ts 의 웜업 핸들러에는 같은 판정이 «로컬 복사본» 으로 남아 있다
      (그 파일은 공동 금지구역 — CLAUDE.md 4-2). 하니스가 둘을 실제로 돌려 대조한다.
   ───────────────────────────────────────────────────────────── */
export function isRfRejection(e: any): boolean {
  const m = String((e && (e.message || e.name)) || e || '');
  if (/\b(429|5\d\d)\b|rate.?limit|quota|capacity|exceed|timeout|timed out|abort|network|fetch failed/i.test(m)) return false;
  return /response_format|json_object|json schema|unsupported|not supported|unrecognized|invalid|\b400\b/i.test(m);
}

/* ─────────────────────────────────────────────────────────────
   ① 모델 출력 → { reply, fix }
   ⚠️ 파싱이 깨져도 학생 화면에 중괄호가 보이면 안 된다. 세 단계로 떨어진다:
      JSON.parse → "reply" 만 정규식으로 건져내기 → 원문 그대로(옛 동작).
   ───────────────────────────────────────────────────────────── */
export function parseWarmupOutput(raw: unknown): { reply: string; fix: any; json: boolean } {
  /* 🔴 Workers AI 는 response_format(json_object) 을 켜면 response 를 «이미 파싱된 객체» 로
        주기도 한다. 그때 String(raw) 는 "[object Object]" 가 되고, 그 글자에는 중괄호가
        없어서 아래 JSON 경로·안전망을 전부 비켜 가 학생 말풍선과 TTS 로 그대로 나간다.
        2026-09-08 사장님 「이렇게 잘 못나와object 이 뭐야??」 — JSON 모드를 켠 그날의 실사고다.
        ✅ 저장소에 선례가 이미 둘 있었다(내가 안 본 것이다) —
           api-diary.ts 의 「JSON 모드면 response 가 이미 객체이거나 JSON 문자열. 둘 다 대응」과
           api-approval.ts parseLooseJson 의 첫 줄 `typeof raw === 'object'`.
        ⛔ 여기를 문자열 전제로 되돌리지 말 것. */
  /* 🛟 마지막 안전망은 «돌려줄 reply» 에 건다.
        ⛔ «입력 글자» 에 걸면 안 된다 — 위 객체 분기가 그보다 «앞» 이라 객체 경로가 통째로
           비켜 가고, 그러면 { reply: "[object Object]" } 가 그대로 학생에게 나간다.
           2026-09-08 에 실제로 그렇게 짰다가 함정 대조가 잡았습니다(정본을 돌려 재현).
        ℹ️ 덤으로 «reply 는 멀쩡한데 fix.why_ko 에 그 글자가 있어» 답장까지 버리는 일도 없어진다. */
  const OBJ_JUNK = /\[object [A-Z]\w*\]/;
  const out = (reply: string, fix: any, json: boolean) =>
    OBJ_JUNK.test(reply) ? { reply: '', fix: null, json: true } : { reply, fix, json };

  let src: unknown = raw;
  if (src && typeof src === 'object') {
    const o: any = src;
    if (typeof o.reply === 'string' && o.reply.trim()) {
      return out(o.reply.trim(), o.fix || null, true);
    }
    /* 객체인데 reply 가 없다(모양이 다르거나 잘렸다) — 아래 문자열 경로가 한 번 더 건져 보게
       «글자» 로 되돌린다. ⛔ String(o) 로 넘기면 그 자리에서 "[object Object]" 가 된다. */
    try { src = JSON.stringify(o); } catch { return { reply: '', fix: null, json: true }; }
  }
  const text = String(src == null ? '' : src).trim();
  if (!text) return { reply: '', fix: null, json: false };

  // ```json … ``` 코드펜스를 벗긴다(모델이 지시를 어기고 감싸는 일이 실제로 있다)
  let body = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  /* 🔴 잘린 출력이 «가장 흔한 실패 모양» 이다 — max_tokens 안에 이제 교정까지 들어가므로
     reply 예산이 줄었고, 잘리면 «정의상» 닫는 중괄호가 없다.
     옛 코드는 `e > s` 로 블록을 통째로 건너뛰어 생 JSON 을 학생 화면·TTS 에 그대로 보냈다.
     그래서 닫는 중괄호가 없어도 «열린 조각» 에서 reply 를 건져 본다.
     ⚠️ reply 를 JSON 첫 키로 둔 것이 여기서 값을 한다 — 잘려도 reply 는 이미 끝나 있다. */
  const looksLikeJson = /\{\s*"|"reply"\s*:|"fix"\s*:/.test(body);
  const s = body.indexOf('{');
  const e = body.lastIndexOf('}');
  if (s >= 0) {
    const slice = e > s ? body.slice(s, e + 1) : body.slice(s);
    try {
      const o = JSON.parse(slice);
      if (o && typeof o.reply === 'string' && o.reply.trim()) {
        return out(o.reply.trim(), o.fix || null, true);
      }
    } catch { /* 아래 폴백으로 */ }
    // JSON 이 깨졌거나 «잘렸어도» reply 문자열만은 건져 본다
    const m = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(slice);
    if (m) {
      let r = m[1];
      try { r = JSON.parse('"' + m[1] + '"'); } catch { r = m[1].replace(/\\"/g, '"').replace(/\\n/g, ' '); }
      r = String(r).trim();
      if (r) return out(r, null, true);
    }
  }
  /* 🛟 마지막 안전망 — 여기까지 왔는데 JSON 흔적이 남아 있으면 «학생에게 보내지 않는다».
     빈 문자열로 두면 부르는 쪽의 기존 «잠깐의 딸꾹질» 안전 문구가 받아 준다(옛 동작).
     ⛔ 이 줄을 «s === 0 일 때만» 으로 좁히지 말 것 — 모델이 JSON 앞에 말을 한마디 붙이면
        (`Here you go: {…`) 그 조건을 비켜 가고, 그러면 중괄호가 그대로 새어 나간다. */
  if (looksLikeJson) return { reply: '', fix: null, json: true };
  return out(body, null, false);
}

/* ─────────────────────────────────────────────────────────────
   ② 모델이 준 fix 를 «믿지 않고» 검증한다
   ───────────────────────────────────────────────────────────── */

/** 비교용 정규화 — 대소문자·구두점을 지우고 공백을 접는다. */
function normEn(s: unknown): string {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BC]/g, "'")   // 곱슬 아포스트로피 — 모델은 ’, 학생은 ' 를 쓴다
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* 글자 두 개씩 얼마나 겹치나(Dice) — 낱말 겹침만 보면 «형태가 바뀌는» 교정이 묻힌다.
   [잰 것 — 2026-09-08]
     통과해야 할 진짜 교정: 0.48 ~ 0.96  (가장 낮은 것이 "I don't went" → "I didn't go" 0.48)
     막아야 할 창작:        0.00 ~ 0.09  ("I go" → "Pizza tastes wonderful" 0.00)
   간격이 다섯 배라 0.35 로 가른다. 낱말 겹침(0.5)과 «둘 중 하나» 면 통과시킨다. */
function charDice(a: string, b: string): number {
  const bg = (x: string) => { const o: string[] = []; for (let i = 0; i < x.length - 1; i++) o.push(x.slice(i, i + 2)); return o; };
  const A = bg(normEn(a)), B = bg(normEn(b));
  if (!A.length || !B.length) return 0;
  const m = new Map<string, number>();
  for (const x of B) m.set(x, (m.get(x) || 0) + 1);
  let hit = 0;
  for (const x of A) { const c = m.get(x) || 0; if (c > 0) { hit++; m.set(x, c - 1); } }
  return (2 * hit) / (A.length + B.length);
}

/** 낱말이 얼마나 겹치나 — 통째로 다시 쓴 문장(교정이 아니라 창작)을 걸러 낸다. */
function wordOverlap(a: string, b: string): number {
  const A = normEn(a).split(' ').filter(Boolean);
  const B = normEn(b).split(' ').filter(Boolean);
  if (!A.length || !B.length) return 0;
  const setB = new Set(B);
  let hit = 0;
  for (const w of new Set(A)) if (setB.has(w)) hit++;
  return hit / Math.min(new Set(A).size, setB.size);
}

/**
 * 모델이 준 fix 를 결정론으로 검증한다. 하나라도 어긋나면 **null**(= 교정 없음).
 * ⛔ 여기서 문장을 «고쳐 쓰지» 않는다 — 통과시키거나 버리기만 한다.
 */
export function verifyWarmupFix(fixRaw: any, studentInput: unknown): WarmupFix | null {
  if (!fixRaw || typeof fixRaw !== 'object') return null;

  const was = String(fixRaw.was == null ? '' : fixRaw.was).trim();
  const now = String(fixRaw.now == null ? '' : fixRaw.now).trim();
  const whyKo = String(fixRaw.why_ko == null ? '' : fixRaw.why_ko).trim();
  const said = String(studentInput == null ? '' : studentInput).trim();

  if (!was || !now || !whyKo || !said) return null;
  if (was.length > 200 || now.length > 200 || whyKo.length > 200) return null;

  /* 영어 문장이어야 한다. 한글·한자·가나가 섞이면 버린다 — 판정 정본은 english-only.ts.
     상한을 웜업 기본 80 이 아니라 120 으로 두는 이유: 교정문은 원문보다 길어질 수 있고
     (관사·조동사가 붙는다), 멀쩡한 교정을 길이 때문에 버리면 학생이 손해다. */
  if (!isEnglishText(was, 120) || !isEnglishText(now, 120)) return null;

  // why_ko 는 한국어여야 한다(한글이 한 글자도 없으면 모델이 영어로 쓴 것 → 버린다)
  if (!/[가-힣]/.test(whyKo)) return null;

  const nWas = normEn(was);
  const nNow = normEn(now);
  const nSaid = normEn(said);
  if (!nWas || !nNow) return null;

  // 🔴 핵심 — was 가 학생 원문에 «있어야» 한다. 없으면 모델이 지어낸 것이다.
  /* ⚠️ 낱말 경계로 본다 — 그냥 includes 면 'o to sch' 같은 «낱말 조각» 이 통과해
     화면에 뜻 없는 교정이 그려진다(CLAUDE.md 2장 「«부분문자열» 로 보면」). */
  if (!(' ' + nSaid + ' ').includes(' ' + nWas + ' ')) return null;
  // 고친 것이 없으면 교정이 아니다
  if (nWas === nNow) return null;
  // 통째로 새 문장을 지어낸 경우(교정이 아니라 창작) 차단
  if (now.length > Math.max(60, said.length * 2.5)) return null;
  /* ⛔ 낱말 겹침만으로 자르지 않는다 — "I don't went" → "I didn't go" 처럼 «형태가 바뀌는»
     흔한 교정이 0.33 으로 묻힌다(함정 대조가 실측으로 잡았다). 둘 중 하나면 통과. */
  if (wordOverlap(nWas, nNow) < 0.5 && charDice(nWas, nNow) < 0.35) return null;

  const tag = (WARMUP_FIX_TAGS as readonly string[]).includes(String(fixRaw.tag)) ? String(fixRaw.tag) : 'other';
  /* 🔴 severity 를 모델에게 맡기지 않는다 (2026-09-09 사장님 「I ate pizza yesterday 인데
     I eat pizza yesterday 라고 말했는데 아바타가 수정해주지 않았어」).
     ⚠️ [추론 — 잰 것이 아님] 모델이 준 severity 는 D1·KV·로그 어디에도 안 남아 이 저장소에서
        확인할 수 없습니다. 옛 프롬프트 문구(「뜻이 통하면 그냥 넘어가」 + 「알아들을 수는 있는
        작은 실수면 minor」)로 미루어 그렇게 준다고 봤습니다. 사장님 화면은 아래 ③(turn 1 게이트)
        만으로도 설명되므로, 셋 중 무엇이 주범이었는지는 가릴 근거가 없습니다.
        그렇게 주면 아래 게이트가
     「같은 실수 두 번째부터」로 미뤄서, 학생의 첫 실수가 그대로 지나갑니다.
     ⛔ 이 넷은 그대로 두면 학생이 틀린 채로 굳는 것들이라 «작은 실수» 가 아닙니다.
        모델이 minor 라고 해도 우리가 major 로 확정합니다 — 「지시만으로는 안 지켜진다」. */
  const severity: 'major' | 'minor' =
    (MEANING_CHANGING_TAGS as readonly string[]).includes(tag) ? 'major'
      : (String(fixRaw.severity) === 'major' ? 'major' : 'minor');

  return { was, now, why_ko: whyKo, tag, severity };
}

/* ─────────────────────────────────────────────────────────────
   ③ «언제 보여 줄 것인가» — 여기가 성패다
   2026-09-03 AI 영어친구에서 「주제를 벗어나지 마」를 세 겹으로 넣었다가
   「정해진 문장 안에서만 한다」는 현장 제보를 받고 되돌린 전례가 있다.
   교정도 같다. 매 턴 고치면 말문이 막힌다.
   ───────────────────────────────────────────────────────────── */

/** 교정을 연달아 하지 않는다 — 최소 이만큼 턴을 띄운다.
 *  ⚠️ 2026-09-09 부터 이 간격은 «작은 실수(minor)» 에만 걸린다. 뜻이 달라지는 오류는
 *     간격을 안 본다(decideWarmupFixShow 주석). 이 줄만 읽고 major 도 띄운다고 보지 말 것. */
export const WARMUP_FIX_GAP_TURNS = 2;
/** 「따라 말해 볼까?」 는 이만큼 턴을 띄운다(제안서의 «3턴에 한 번»). */
export const WARMUP_REPEAT_GAP_TURNS = 3;

export function decideWarmupFixShow(
  fix: WarmupFix | null,
  memoIn: WarmupFixMemo | null | undefined,
  turnCount: number,
): { show: WarmupFix | null; memo: WarmupFixMemo } {
  const memo: WarmupFixMemo = {
    tags: { ...((memoIn && memoIn.tags) || {}) },
    lastShownTurn: (memoIn && memoIn.lastShownTurn) || 0,
    lastRepeatTurn: (memoIn && memoIn.lastRepeatTurn) || 0,
    shown: (memoIn && memoIn.shown) || 0,
  };
  if (!fix) return { show: null, memo };

  /* 보여 주든 말든 «틀린 것» 자체는 센다 — 두 번째부터 보여 주는 판정의 근거가 된다.
     ⚠️ 세는 것과 보여 주는 것은 다른 축이다. 이 줄을 아래 게이트 뒤로 옮기면
        minor 는 영영 두 번째가 되지 않아 «한 번도 안 뜨는 기능» 이 된다. */
  const seen = (memo.tags![fix.tag] || 0) + 1;
  memo.tags![fix.tag] = seen;

  // 뜻이 달라지는 오류는 바로, 작은 실수는 «같은 실수가 두 번째» 일 때만
  const worth = fix.severity === 'major' || seen >= 2;
  if (!worth) return { show: null, memo };

  /* 🔴 간격 규칙은 «작은 실수» 에만 건다 (2026-09-09 사장님 「더 정밀하게 문법을 잘 체크해 줄 수 있어?」).
     옛 코드는 major 도 2턴을 띄웠다. 그래서 과거형 실수를 세 번 연달아 해도 한 번만 고쳐 줬고,
     학생 화면에서는 「어떤 건 고쳐 주고 어떤 건 안 고쳐 준다」로 보였다(실측으로 재현).
     뜻이 달라지는 오류는 그 자리에서 바로잡아야 틀린 채로 굳지 않는다.
     ⛔ 이 예외를 minor 까지 넓히지 마세요 — 관사 하나까지 매 턴 잡히면 학생이 말문이 막힙니다.
     ⚖️ [맞바꿈 — 사람이 정할 일] 지금 major 에는 상한이 «아예 없습니다»(정본을 돌려 잰 것:
        past_tense 를 10턴 연속 넣으면 10/10 표시). 사장님 「더욱 더 정밀하게」에 맞춘 값입니다.
        너무 잦다는 제보가 오면 **이 조건 한 줄만** 바꾸면 됩니다 —
        `fix.severity !== 'major'` → `turnCount - (memo.lastShownTurn || 0) < 1` 같은 «major 전용
        1턴 간격». ⛔ 옛 코드(간격 2턴)로 통째로 되돌리지는 마세요 — 그게 이 사고였습니다.
        ℹ️ 카드는 쌓이지 않습니다(화면이 그릴 때 `fixCardClear()` 로 이전 카드를 지웁니다).
     ⚠️ 그리고 `tag` 는 여전히 «모델이 정하는 값» 입니다 — 모델이 관사 교정을 past_tense 로
        태깅하면 major 가 됩니다(방향은 «더 고쳐 줌» 이라 안전).

     🔴 그리고 «아직 한 번도 안 보여줬으면» 간격이 성립하지 않는다.
        옛 코드는 lastShownTurn 이 0 이라 turnCount 1 에서 1-0=1 < 2 로 «첫 교정» 이 원리상
        막혔다(정본을 돌려 실측). 학생의 맨 첫 마디는 절대 못 고쳐 주고 있었다. */
  const shownBefore = (memo.lastShownTurn || 0) > 0;
  if (fix.severity !== 'major' && shownBefore
      && turnCount - (memo.lastShownTurn || 0) < WARMUP_FIX_GAP_TURNS) {
    return { show: null, memo };
  }

  memo.lastShownTurn = turnCount;
  memo.shown = (memo.shown || 0) + 1;
  return { show: fix, memo };
}

/**
 * 「한 번 따라 해 볼까?」 를 붙일지. 되말해 주기만 하면 아이는 흘려 듣는다 —
 * 이 한 바퀴가 «웜업» 을 «수업» 으로 바꾼다.
 * ⚠️ memo 를 그 자리에서 고친다(부르는 쪽이 그대로 저장한다).
 */
export function warmupShouldOfferRepeat(
  show: WarmupFix | null,
  memo: WarmupFixMemo,
  turnCount: number,
): boolean {
  if (!show) return false;
  /* 위와 같은 이유 — 한 번도 안 권했으면 «연달아» 가 성립하지 않는다.
     [잰 것] WARMUP_REPEAT_GAP_TURNS=3 · 옛 조건 `turnCount - 0 < 3` → turn 1·2 막힘 · turn 3 부터 뜸.
     즉 막혔던 것은 «첫 두 턴» 이다(세 턴이 아니다 — 함정 대조가 실측으로 정정). */
  if ((memo.lastRepeatTurn || 0) > 0
      && turnCount - (memo.lastRepeatTurn || 0) < WARMUP_REPEAT_GAP_TURNS) return false;
  memo.lastRepeatTurn = turnCount;
  return true;
}
