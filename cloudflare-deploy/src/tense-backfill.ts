/* ✏️ 과거형 자동 보완 (2026-10-31, 제안서 D안) — 정본
 *
 * 왜 있나:
 *   학생이 "I play soccer yesterday" 라고 말했는데 모델이 교정 칸(fix)을 비워 보내면
 *   화면에 교정 카드가 전혀 안 뜬다. 첫 턴에 조용히 지나가고, 같은 실수를 여러 번 해야 고쳐진다.
 *   이 파일은 「과거 시간 표현(yesterday 등) + 동사 원형」이라는 좁고 확실한 모양에 한해,
 *   모델이 fix 를 안 준 경우에만 규칙으로 교정을 만든다.
 *
 * ⛔ 범위를 넓히지 마세요:
 *   - 모델이 fix 를 «준» 경우에는 손대지 않는다 (모델의 교정이 먼저다).
 *   - 주어 여섯 개(I·We·You·They·He·She·It)와 알려진 동사 표에 든 것만 본다.
 *   - 조동사·부정·과거형이 이미 있으면 건드리지 않는다("I didn't play" 등).
 *   - 중국어에는 쓰지 않는다(호출부가 ctxLang 으로 거른다).
 *   이 밖의 실수(관사·낱말 고르기 등)는 기존대로 모델에게 맡긴다.
 *
 * 반환값은 verifyWarmupFix 가 받는 «날것» 모양이다. 검증은 그 함수가 다시 한다.
 */

/* 원형 → 과거형. 학생이 자주 쓰는 일상 동사로 한정한다(표에 없으면 건드리지 않는다). */
const REGULAR_VERBS: readonly string[] = [
  'play', 'watch', 'visit', 'study', 'like', 'want', 'walk', 'cook', 'clean', 'listen',
  'call', 'help', 'jump', 'look', 'love', 'live', 'work', 'stay', 'start', 'open',
  'close', 'enjoy', 'use', 'practice', 'ask', 'dance', 'paint', 'wash', 'talk', 'travel',
  'order', 'rest', 'finish', 'decide', 'move', 'change', 'arrive', 'cry', 'carry', 'try',
];
const IRREGULAR_PAST: Readonly<Record<string, string>> = {
  go: 'went', eat: 'ate', see: 'saw', do: 'did', have: 'had', make: 'made', take: 'took',
  come: 'came', get: 'got', buy: 'bought', write: 'wrote', drink: 'drank', meet: 'met',
  run: 'ran', swim: 'swam', sing: 'sang', teach: 'taught', think: 'thought', find: 'found',
  give: 'gave', tell: 'told', feel: 'felt', leave: 'left', sleep: 'slept', ride: 'rode',
  drive: 'drove', speak: 'spoke', win: 'won', lose: 'lost', begin: 'began', bring: 'brought',
  catch: 'caught', draw: 'drew', fly: 'flew', hear: 'heard', hold: 'held', keep: 'kept',
  send: 'sent', sit: 'sat', spend: 'spent', stand: 'stood', wear: 'wore', understand: 'understood',
};
const SUBJECTS: readonly string[] = ['i', 'we', 'you', 'they', 'he', 'she', 'it'];

/* 과거 시간 표현 — 이 중 하나가 문장 안에 있어야 한다. */
const PAST_MARKER = /\b(yesterday|last\s+(?:night|week|month|year|weekend|summer|winter|spring|fall|autumn|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;

/* 이미 과거·조동사·부정이 있으면 건드리지 않는다. */
const BLOCKERS = /\b(did|didn't|do|does|don't|doesn't|will|won't|have|has|had|was|were|is|are|am|can|could|would|should|not|never|no)\b/i;

function pastOf(verb: string): string | null {
  const v = verb.toLowerCase();
  if (IRREGULAR_PAST[v]) return IRREGULAR_PAST[v];
  if (!REGULAR_VERBS.includes(v)) return null;
  if (v.endsWith('e')) return v + 'd';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ied';
  return v + 'ed';
}

/** 학생 문장에서 과거형 교정을 만든다. 맞지 않으면 null. */
export function backfillPastTenseFix(studentInput: unknown): { was: string; now: string; why_ko: string; tag: string } | null {
  const said = String(studentInput == null ? '' : studentInput).trim();
  if (!said || said.length > 120) return null;

  // 끝 문장부호는 떼어 보고 다시 붙인다.
  const m = said.match(/^(.*?)([.!?]*)$/);
  const body = (m ? m[1] : said).trim();
  const end = m ? m[2] : '';

  const sm = body.match(/^([A-Za-z]+)\s+([A-Za-z]+)\b\s*(.*)$/);
  if (!sm) return null;
  const subj = sm[1].toLowerCase();
  const verb = sm[2];
  const rest = sm[3] || '';
  if (!SUBJECTS.includes(subj)) return null;

  if (!PAST_MARKER.test(body)) return null;
  if (BLOCKERS.test(body)) return null;
  // 숫자·기호가 섞이면 확실하지 않으니 버린다
  if (/[^A-Za-z\s',]/.test(body)) return null;

  const past = pastOf(verb);
  if (!past || past.toLowerCase() === verb.toLowerCase()) return null;

  const subjOriginal = sm[1];
  const restPart = rest ? ' ' + rest : '';
  const was = body + end;
  const now = subjOriginal + ' ' + past + restPart + end;
  if (was === now) return null;

  const marker = (body.match(PAST_MARKER) || ['yesterday'])[0].toLowerCase();
  const whyKo = `${marker}처럼 지난 일을 말할 때는 동사를 과거형으로 써요. ${verb} → ${past}`;
  return { was, now, why_ko: whyKo, tag: 'past_tense' };
}
