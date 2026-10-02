// ═══════════════════════════════════════════════════════════════════════
// 💬 수업 전 AI 웜업 — «어떻게 대답하면 되는지» 보기 칩 (2026-08-26)
//
//   발단: 사장님 제보 「낮은 단계 학생은 처음 인사말도 잘 이해 못 한다」를 고치면서
//         드러난 두 번째 벽. 첫 인사를 짧게 만들어도 학생은 «답을 스스로 만들어야» 합니다.
//         지금 화면의 「💡 질문 만들기」는 «AI 가 물어볼 질문» 을 고르는 기능이라,
//         「학생이 어떻게 답하는지」를 보여 주는 장치는 이 저장소에 하나도 없었습니다.
//         (Speak 의 「힌트 보기」·Duolingo Falstaff 의 「표현 제안」에 해당하는 자리)
//
//   🔴 왜 LLM 으로 만들지 않는가 — 이 저장소가 이미 두 번 밟은 자리입니다.
//      낮은 단계에서 «짧게» 를 지시로 밀면 모델이 to·is·a 를 떨어뜨립니다
//      (판단력 훈련 «Want play with me» — CLAUDE.md). 보기 칩은 학생이 «그대로 따라 말하는»
//      문장이라, 틀린 문장이 하나라도 섞이면 그걸 그대로 배웁니다.
//      → 그래서 여기서는 «AI 의 질문에서 결정론적으로 유도» 합니다. 못 만들면 안 만듭니다.
//
//   ⛔ 「그래도 뭐라도 보여 주자」고 넓히지 마세요. 모르는 것보다 틀린 게 나쁩니다
//      (같은 규칙: 강사 이름 붙이기 — 후보가 둘이면 안 붙인다).
//      질문이 Yes/No 도 양자택일도 아니면 **칩을 안 냅니다**(낮은 단계의 «막혔을 때» 칩만 남깁니다).
//
//   ⚠️ 단어 수 상한은 서버 WARMUP_LEVELS(src/index.ts)와 «짝» 입니다. 한쪽만 고치면
//      「레벨 1인데 8단어 보기」가 조용히 나갑니다 — 하니스가 둘을 대조합니다.
//
//   이 파일은 import 가 하나도 없습니다 — 하니스가 그대로 불러 «실제로 돌려서» 검증합니다
//   (extensionless TS import 는 node 에서 해석되지 않아, import 를 하나라도 넣으면
//    하니스가 이 파일을 못 부릅니다. 실제로 확인했습니다).
// ═══════════════════════════════════════════════════════════════════════

/** 이 단계 이하에서만 보기 칩을 낸다. 그 위는 스스로 답을 만드는 것이 훈련이다. */
export const WARMUP_CHIP_MAX_LEVEL = 3;

/**
 * 단계별 «보기 한 개» 의 단어 수 상한.
 * ⚠️ 서버 WARMUP_LEVELS 의 「N~M단어」 중 M 과 같아야 합니다(하니스가 대조).
 */
export const WARMUP_CHIP_WORD_CAP: Record<number, number> = { 1: 5, 2: 7, 3: 9 };

/** 낮은 단계에서 «막혔을 때» 쓰는 만능 칩 — 어떤 질문에도 문법이 맞고, 대화를 살립니다. */
export const WARMUP_STUCK_CHIPS: string[] = ['One more time, please.', "I don't know."];

/** 보기는 최대 3개 — 폰에서 한 줄씩 4개가 넘어가면 입력칸이 화면 밖으로 밀립니다. */
const MAX_CHIPS = 3;

/** 양자택일에서 «무엇으로 문장을 시작할지» — 이 목록에 없으면 만들지 않습니다. */
const CARRIERS: Array<{ re: RegExp; lead: string }> = [
  { re: /\bdo you like\b/, lead: 'I like' },
  { re: /\bdo you want\b/, lead: 'I want' },
  { re: /\bdo you prefer\b/, lead: 'I prefer' },
  { re: /\bdo you have\b/, lead: 'I have' },
  { re: /\bare you\b/, lead: 'I am' },
];

/** Yes/No 질문의 짧은 대답 — 조동사가 맞아야 한다(교과서 표준형). */
const YESNO: Array<{ re: RegExp; yes: string; no: string }> = [
  { re: /^would you\b/, yes: 'Yes, please.', no: 'No, thank you.' },
  { re: /^are you\b/, yes: 'Yes, I am.', no: "No, I'm not." },
  { re: /^is (?:it|this|that)\b/, yes: 'Yes, it is.', no: "No, it isn't." },
  { re: /^does (?:it|he|she)\b/, yes: 'Yes, it does.', no: "No, it doesn't." },
  { re: /^do you\b/, yes: 'Yes, I do.', no: "No, I don't." },
  { re: /^did you\b/, yes: 'Yes, I did.', no: "No, I didn't." },
  { re: /^can you\b/, yes: 'Yes, I can.', no: "No, I can't." },
  { re: /^have you\b/, yes: 'Yes, I have.', no: "No, I haven't." },
  { re: /^will you\b/, yes: 'Yes, I will.', no: "No, I won't." },
];

/**
 * 왼쪽 보기 앞에 붙는 «주어·동사» — 「do you like **pizza**」에서 do·you·like 를 떼어내기 위한 것.
 * ⚠️ 관사(a·an·the)는 «떼지 않습니다» — 떼면 「I am student.」 같은 비문이 나옵니다(실제로 밟음).
 */
const LEAD_STRIP = new Set([
  'do', 'does', 'did', 'you', 'your', 'i', 'my', 'we', 'is', 'are', 'am', 'was', 'were',
  'can', 'will', 'would', 'like', 'likes', 'want', 'wants', 'prefer', 'prefers', 'have', 'has', 'had',
]);

/**
 * 보기 안에 이 낱말이 하나라도 있으면 «만들지 않습니다».
 * 「do you like **to swim** or **to run**」처럼 부정사·절이 들어오면 앞말과 안 맞는 문장이 나옵니다
 * (「I like swim.」). 애매하면 만들지 않는 쪽이 규칙입니다.
 */
const OPTION_BLOCK = new Set([
  'to', 'do', 'does', 'did', 'is', 'are', 'am', 'was', 'were', 'be', 'have', 'has', 'had',
  'you', 'i', 'we', 'they', 'he', 'she', 'it', 'not', 'and', 'but', 'or',
  'when', 'where', 'why', 'how', 'what', 'who', 'can', 'will', 'would', 'your', 'my',
]);

const ARTICLES = new Set(['a', 'an', 'the']);

/**
 * 🎨 «바꿔 말하기» 낱말 묶음 (2026-10-02 사장님 제보 — 예시가 늘 「Yes, I do / No, I don't」).
 * 「Do you like the red ball?」 처럼 질문에 이 묶음의 낱말이 들어 있으면, 같은 묶음의 «다른» 낱말로
 * 바꾼 두 번째 대답을 만든다 → 「I like the red ball. / I like the blue ball.」
 * 같은 품사·같은 자리끼리만 바꾸므로 문법이 깨지지 않는다(손으로 만든 목록 = 지어내지 않음).
 * ⚠️ 화면(js/warmup-guide.js)은 두 대답에서 «서로 다른 낱말» 을 찾아 노랗게 칠하고 그 둘을 오간다.
 *    그래서 이 목록을 화면에 복제하지 않는다.
 */
const SWAP_SETS: string[][] = [
  ['red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'black', 'white', 'brown'],
  ['dogs', 'cats', 'rabbits', 'birds', 'fish'],
  ['dog', 'cat', 'rabbit', 'bird', 'hamster'],
  ['pizza', 'chicken', 'apples', 'bananas', 'ice cream', 'cake', 'noodles', 'rice'],
  ['soccer', 'baseball', 'basketball', 'tennis', 'swimming'],
  ['summer', 'winter', 'spring', 'fall'],
];

/** 낱말 하나를 같은 묶음의 다음 낱말로. 묶음에 없으면 ''. */
function swapWord(w: string): string {
  for (const set of SWAP_SETS) {
    const i = set.indexOf(w);
    if (i >= 0) return set[(i + 1) % set.length];
  }
  return '';
}

/**
 * 「Do you like the red ball?」 → ['I like the red ball.', 'I like the blue ball.']
 * 질문의 목적어 안에 바꿀 낱말이 «정확히 하나» 있을 때만 만든다. 확신이 없으면 [].
 */
function swapAnswers(low: string): string[] {
  const carrier = CARRIERS.find((c) => c.re.test(low) && c.lead !== 'I am');
  if (!carrier || /\bor\b/.test(low)) return [];
  const m = low.match(/\bdo you (?:like|want|prefer|have)\s+([^?.!,]+)\?/);
  if (!m) return [];
  const w = m[1].replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!w.length || w.length > 4) return [];
  for (let i = 0; i < w.length; i++) {
    if (OPTION_BLOCK.has(w[i])) return [];
    if (ARTICLES.has(w[i]) && i !== 0) return [];
  }
  const idx: number[] = [];
  w.forEach((x, i) => { if (swapWord(x)) idx.push(i); });
  if (idx.length !== 1) return [];
  const alt = w.slice(); alt[idx[0]] = swapWord(w[idx[0]]);
  return [`${carrier.lead} ${w.join(' ')}.`, `${carrier.lead} ${alt.join(' ')}.`];
}

/**
 * 🗣️ Yes/No 질문을 «그 질문의 낱말» 로 길게 대답 (2026-10-02 사장님 지시 —
 *    「I do / I don't 으로 하지 말고 I am happy / I am not happy · I like coffee / I don't like coffee」).
 *   「Do you like coffee?」 → ['I like coffee.', "I don't like coffee."]
 *   「Are you happy today?」 → ['I am happy today.', 'I am not happy today.']
 *   「Can you swim?」 → ['I can swim.', "I can't swim."]
 * ⛔ 대명사·부정사·절이 섞이면(「Do you like your school?」 → 「I like your school.」 같은 비문) 만들지 않는다 —
 *    그때는 아래 짧은 대답(Yes, I do.)으로 떨어진다. 동사는 형태가 안 바뀌는 것만(현재형) 받는다.
 */
const FULL_DO_VERBS = new Set(['like', 'love', 'want', 'have', 'need', 'play', 'eat', 'drink', 'watch', 'enjoy', 'know', 'read', 'live']);
const FULL_BLOCK = new Set(['me', 'him', 'her', 'us', 'them', 'yourself', 'yours', 'mine', 'this', 'that', 'these', 'those']);
function fullAnswers(low: string): string[] {
  if (/\bor\b/.test(low)) return [];
  const head = low.split(',')[0];                       // 「Are you hungry, Minsu?」 → 이름 앞까지
  const objOk = (t: string): string => {
    const w = t.replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
    if (!w.length || w.length > 4) return '';
    for (const x of w) if (OPTION_BLOCK.has(x) || FULL_BLOCK.has(x)) return '';
    return w.join(' ');
  };
  let m = head.match(/^do you ([a-z]+)\s+([^?.!]+)\??\s*$/);
  if (m && FULL_DO_VERBS.has(m[1])) {
    const o = objOk(m[2]);
    if (o) return [`I ${m[1]} ${o}.`, `I don't ${m[1]} ${o}.`];
    return [];
  }
  m = head.match(/^are you\s+([^?.!]+)\??\s*$/);
  if (m) {
    const o = objOk(m[1]);
    if (o && !/ing$/.test(o.split(' ')[0])) return [`I am ${o}.`, `I am not ${o}.`];
    return [];
  }
  m = head.match(/^can you ([a-z]+)((?:\s+[^?.!]+)?)\??\s*$/);
  if (m && !OPTION_BLOCK.has(m[1]) && !FULL_BLOCK.has(m[1])) {
    const rest = m[2].trim();
    const o = rest ? objOk(rest) : '';
    if (rest && !o) return [];
    const tail = o ? ` ${o}` : '';
    return [`I can ${m[1]}${tail}.`, `I can't ${m[1]}${tail}.`];
  }
  return [];
}

/** 보기 한 개가 문장으로 쓸 만한 «이름» 인가 — 아니면 빈 문자열(= 만들지 않음). */
function cleanOption(words: string[], lead: string): string {
  const w = words.slice();
  while (w.length && LEAD_STRIP.has(w[0])) w.shift();
  if (!w.length || w.length > 3) return '';
  for (const x of w) if (OPTION_BLOCK.has(x)) return '';
  // 「I like a dog.」 는 문법은 맞아도 아무도 그렇게 말하지 않는다 — 관사는 「I am a student.」 에서만 받는다
  if (ARTICLES.has(w[0]) && lead !== 'I am') return '';
  return w.join(' ');
}

/**
 * 칩으로 내보내도 되는 문장인가.
 * ⚠️ 이것은 `src/english-only.ts` 의 «영어 전용 게이트» 를 옮겨 적은 것이 «아닙니다» —
 *    거기는 «퀴즈 문항이 영어인가» 를 가리는 정본이고, 여기는 «이 짧은 칩을 화면에 내도 되나» 입니다.
 *    다만 둘이 어긋나면 안 되므로(병음·한자가 칩으로 새면 안 됩니다) 하니스가 두 모듈을
 *    같은 예시로 «함께 돌려» 판정이 일치하는지 대조합니다.
 */
function chipOk(s: string, cap: number): boolean {
  const t = String(s || '').trim();
  if (!t || t.length > 60) return false;
  // 화면에 그대로 그려지고 영어 TTS 가 읽는 자리다 — ASCII 인쇄가능 문자만 허용한다.
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return false;
  }
  if (t.indexOf('?') >= 0) return false;      // 칩은 «대답» 이다. 질문을 되돌려 주지 않는다.
  if (!/[a-z]/i.test(t)) return false;
  return countWords(t) <= cap;
}

function countWords(s: string): number {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

/** 여러 문장 중 «학생이 답해야 하는» 마지막 물음만 꺼낸다. */
export function lastQuestion(text: string): string {
  const t = String(text || '').replace(/[^\x20-\x7E]/g, ' ');
  const qs = t.match(/[^.?!]*\?/g);
  return qs && qs.length ? qs[qs.length - 1].trim() : '';
}

/** 「happy or tired?」 의 양쪽 낱말을 꺼낸다. 확신이 없으면 빈 배열 — 지어내지 않는다. */
function eitherOrOptions(q: string, lead: string): string[] {
  const parts = q.replace(/\?+\s*$/, '').split(/\s+or\s+/i);
  if (parts.length !== 2) return [];         // or 가 둘 이상이면 손대지 않는다
  const toWords = (t: string) => t.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  // 왼쪽은 «마지막 쉼표 뒤» 만 본다 — 「how are you today, happy」 에서 앞머리를 버리기 위해
  const left = cleanOption(toWords(parts[0].split(',').pop() || ''), lead);
  const right = cleanOption(toWords(parts[1]), lead);
  if (!left || !right || left === right) return [];
  return [left, right];
}

/**
 * AI 의 발화에서 «학생이 눌러서 말할 수 있는 대답» 을 만든다.
 * 만들 수 없으면 빈 배열(낮은 단계면 «막혔을 때» 칩만) — 지어내지 않는다.
 */
export function warmupAnswerChips(aiText: unknown, level: unknown): string[] {
  const lv = Math.floor(Number(level));
  if (!(lv >= 1 && lv <= WARMUP_CHIP_MAX_LEVEL)) return [];
  const cap = WARMUP_CHIP_WORD_CAP[lv] || 5;

  const q = lastQuestion(String(aiText == null ? '' : aiText));
  const low = q.toLowerCase().replace(/^[^a-z]+/, '');   // 앞의 이모지·기호를 걷어낸다
  const out: string[] = [];

  if (q) {
    // ① 양자택일 — 고를 말이 질문 안에 들어 있는 형태가 초보에게 가장 쉽다
    if (/\bor\b/i.test(low)) {
      const carrier = CARRIERS.find((c) => c.re.test(low));
      const opts = carrier ? eitherOrOptions(low, carrier.lead) : [];
      if (opts.length === 2 && carrier) {
        for (const o of opts) out.push(`${carrier.lead} ${o}.`);
      }
    }
    // ①-b 바꿔 말하기 — 「Do you like the red ball?」 → 「I like the red ball. / I like the blue ball.」
    //      늘 같은 「Yes, I do. / No, I don't.」 대신 «그 질문의 낱말» 로 대답하게 한다(2026-10-02).
    if (!out.length) for (const a of swapAnswers(low)) out.push(a);
    // ①-c 긴 대답 — 「Do you like coffee?」 → 「I like coffee. / I don't like coffee.」(2026-10-02)
    //      단계 상한을 넘으면 아래 chipOk 가 버리므로, 그때만 짧은 대답으로 떨어진다.
    if (!out.length) {
      const full = fullAnswers(low);
      if (full.length === 2 && full.every((x) => chipOk(x, cap))) for (const a of full) out.push(a);
    }
    // ② Yes/No — 조동사가 맞는 교과서 짧은 대답(긴 대답을 만들 수 없을 때만)
    if (!out.length) {
      const m = YESNO.find((y) => y.re.test(low));
      if (m) { out.push(m.yes); out.push(m.no); }
    }
  }

  // ③ 낮은 단계에는 «막혔을 때» 탈출구를 함께 준다. 위에서 만든 것이 있으면 한 개만.
  if (lv <= 2) {
    const stuck = out.length ? WARMUP_STUCK_CHIPS.slice(0, 1) : WARMUP_STUCK_CHIPS;
    for (const s of stuck) out.push(s);
  }

  const seen: Record<string, boolean> = {};
  const clean: string[] = [];
  for (const c of out) {
    if (!chipOk(c, cap) || seen[c]) continue;
    seen[c] = true;
    clean.push(c);
    if (clean.length >= MAX_CHIPS) break;
  }
  return clean;
}
