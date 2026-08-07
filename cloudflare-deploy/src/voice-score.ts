// ═══════════════════════════════════════════════════════════════════════
// 🗣 voice-score.ts — 음성코치(/api/voice/coach) 채점기 (기준 문장 정렬 방식)
//
// 왜 만들었나 (2026-07-24 직원 피드백):
//   기존 /api/voice/coach 채점은 "목표 단어가 몇 개 겹치나"(단어 집합 포함)였다.
//   → 순서를 안 보고, 중복 단어로 100%를 넘고("the the the"), 딴소리도 길이만 맞으면
//     유창성이 높게 나왔다. 그래서 잘하든 못하든 점수가 비슷하게 나와 변별력이 없었다.
//
//   프론트(js/mangoi-speak-score.js)에 이미 검증된 '단어 단위 정렬' 채점기가 있는데
//   서버는 그걸 안 쓰고 자체 약한 채점을 썼다. 이 파일은 그 알고리즘을 서버로 이식해
//   **결정론적(순수 함수)**으로 만든 것이다 — AI 없이도 하니스로 변별력을 검증할 수 있다.
//
// 설계 원칙:
//   - 뜻이 달라지는 실수(dog→cat)는 반드시 감점한다.
//   - 억양·인식기 흔들림(dog→dawg)은 살짝만 감점한다.
//   - 관사·전치사 같은 기능어는 인식기가 자주 흘리므로 가중치를 낮춘다.
//   - 다른 언어로 말하면(영어 목표에 한국어) 정확도 0에 수렴한다.
//   - 중국어 목표는 글자(문자) 단위로 비교한다(공백이 없으므로).
// ═══════════════════════════════════════════════════════════════════════

export interface VoiceScore {
  accuracy: number;        // 0~100 — 내용 정확도(치환·누락 반영, 기능어 가중치 낮음)
  pronunciation: number;   // 0~100 — 또렷함. 음향정보가 있으면 음향 기반, 없으면 철자 일치율
  fluency: number;         // 0~100 — 흐름. 음향정보가 있으면 말속도·머뭇거림, 없으면 길이 적정성
  completeness: number;    // 0~100 — 목표 단어 중 실제로 말한 비율
  overall: number;         // 0~100 — 종합(accuracy 0.6 + pron 0.25 + fluency 0.15)
  langMismatch: boolean;   // 목표 언어와 발화 언어가 다른가(영어 목표에 한국어 등)
  acoustic: boolean;       // 음향 지표를 실제로 반영했는가(false = 텍스트만 본 옛 방식)
  counts: { ok: number; close: number; wrong: number; wrongContent: number; missing: number; extra: number };
}

// ═══════════════════════════════════════════════════════════════════════
// 🎧 음향 지표 (2026-07-30 추가)
//
// 왜 필요했나 (사고):
//   채점 입력이 'Whisper 가 받아 적은 텍스트'뿐이었다. Whisper 는 액센트·뭉갠 발음을
//   문맥으로 복원하도록 훈련된 모델이라, 발음을 엉망으로 해도 정답 문장이 그대로 나온다.
//   그러면 accuracy·pronunciation·fluency 가 전부 100 → S등급. 4개 점수가 사실상
//   같은 값 하나였다. 텍스트만으로는 '또렷함'을 잴 수 없다.
//
//   여기에 07-29 에 넣은 initial_prompt(목표 문장을 Whisper 에 미리 알려줌)가 겹쳐
//   만점이 고착됐다. 그건 07-30 에 제거했고, 이 파일은 그 다음 단계다.
//
// 무엇을 쓰나 — Whisper(large-v3-turbo)가 텍스트와 함께 돌려주는 것들:
//   - segments[].avg_logprob      그 구간을 얼마나 확신하고 받아 적었나. 웅얼거리면 내려간다.
//   - segments[].no_speech_prob   말이 아닐 확률(잡음·침묵)
//   - segments[].words[].start/end 단어별 타이밍 → 말속도·머뭇거림 = 진짜 유창성
//
// ⚠️ 한계 1: words[] 에 '단어별 확률'은 오지 않는다(word/start/end 뿐). 확신도는 구간 단위가 최대.
//            음성코치는 짧은 문장 하나 = 대개 세그먼트 1개라 실용상 문제는 작다.
// ⚠️ 한계 2: 아래 임계값은 **잠정치**다. 실제 녹음(잘한 발음/뭉갠 발음/딴소리)으로
//            보정하기 전까지는 추정이다. 보정은 ACOUSTIC_TUNING 상수만 고치면 된다.
// ⚠️ 한계 3: 음향정보는 프론트가 전달한다 → 위조 가능. 단 spoken(전사 텍스트)도 원래
//            프론트가 보내므로 신뢰모델은 이전과 동일하다. 서버가 오디오를 다시 받지 않는 한
//            더 강하게 만들 수 없다.
// ═══════════════════════════════════════════════════════════════════════

/** 보정용 상수 — 실제 녹음으로 값을 맞출 때 여기만 고친다. */
export const ACOUSTIC_TUNING = {
  LP_GOOD: -0.25,      // avg_logprob 이 이 이상이면 또렷함 100
  LP_BAD: -1.10,       // 이 이하면 0. Whisper 기본 log_prob_threshold 가 -1.0(저신뢰 경계)
  NO_SPEECH_MAX: 0.60, // no_speech_prob 이 이 이상이면 말이 아닌 것으로 보고 크게 감점
  RATE_LO: 1.6,        // 적정 말속도 하한(단어/초) — 이보다 느리면 뚝뚝 끊김
  RATE_HI: 3.6,        // 적정 말속도 상한 — 이보다 빠르면 뭉개서 읽음
  GAP_OK: 0.35,        // 단어 사이 공백이 이 이하면 머뭇거림 없음(초)
  GAP_BAD: 1.20,       // 이 이상이면 크게 머뭇거림
  MIN_WORDS: 2,        // 단어 타이밍이 이 개수 미만이면 흐름 판정 불가(텍스트 방식 유지)
  /* 🔇 소리를 못 들었을 때의 상한 (2026-08-07).
     [실측] 음향정보가 없으면 «I have a dog» 를 정확히 전사하기만 해도 종합 100 = S(«완벽해요!») 가 나왔다.
            S 는 «발음이 완벽하다» 는 주장인데, 텍스트만으로는 뭉개서 말했는지 알 수 없다.
            (Whisper 는 웅얼거려도 맞는 글자를 곧잘 뱉는다 — 그래서 텍스트는 발음의 증거가 못 된다.)
     [처치] 소리 증거가 없으면 S 자리는 비워 둔다. 못 들은 것을 «완벽» 이라 부르지 않는다.
     ⚠️ 점수를 깎는 게 목적이 아니다 — 음향정보가 오면 이 상한은 적용되지 않는다. */
  NO_ACOUSTIC_MAX: 94, // scoreTier 의 S 경계(95) 바로 아래
};

export interface AcousticSegment {
  start?: number; end?: number; text?: string;
  avg_logprob?: number; no_speech_prob?: number;
  words?: Array<{ word?: string; start?: number; end?: number }>;
}
export interface AcousticInfo {
  segments?: AcousticSegment[];
  transcription_info?: { duration?: number; duration_after_vad?: number; language_probability?: number };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** lo~hi 구간을 0~1 로 선형 매핑 */
const ramp = (v: number, lo: number, hi: number) => clamp01((v - lo) / (hi - lo || 1));

/**
 * Whisper 음향정보 → 또렷함/흐름 원점수. 데이터가 부족하면 ok:false (호출부가 옛 방식 유지).
 * 순수 함수 — 하니스로 검증 가능.
 */
export function analyzeAcoustic(a: AcousticInfo | null | undefined):
  { ok: boolean; clarity: number; fluency: number; lp: number | null; noSpeech: number; rate: number | null; maxGap: number | null } {
  const none = { ok: false, clarity: 0, fluency: 0, lp: null, noSpeech: 0, rate: null, maxGap: null } as const;
  const segs = (a && Array.isArray(a.segments)) ? a.segments.filter(s => s && typeof s === 'object') : [];
  if (!segs.length) return { ...none };

  const T = ACOUSTIC_TUNING;

  // ── 또렷함 — 구간 길이로 가중평균한 avg_logprob ──
  let lpSum = 0, lpW = 0, nsMax = 0;
  for (const s of segs) {
    const lp = typeof s.avg_logprob === 'number' ? s.avg_logprob : null;
    const dur = Math.max(0, (Number(s.end) || 0) - (Number(s.start) || 0));
    const w = dur > 0 ? dur : 1;
    if (lp !== null && isFinite(lp)) { lpSum += lp * w; lpW += w; }
    const ns = typeof s.no_speech_prob === 'number' ? s.no_speech_prob : 0;
    if (ns > nsMax) nsMax = ns;
  }
  if (!lpW) return { ...none };
  const lp = lpSum / lpW;
  let clarity = ramp(lp, T.LP_BAD, T.LP_GOOD) * 100;
  // 말이 아닐 확률이 높으면(잡음만 녹음 등) 또렷함을 강하게 눌러 만점 방지
  if (nsMax >= T.NO_SPEECH_MAX) clarity *= 0.35;

  // ── 흐름 — 단어 타이밍(말속도 + 머뭇거림) ──
  const words: Array<{ start: number; end: number }> = [];
  for (const s of segs) {
    for (const w of (Array.isArray(s.words) ? s.words : [])) {
      const st = Number(w?.start), en = Number(w?.end);
      if (isFinite(st) && isFinite(en) && en >= st) words.push({ start: st, end: en });
    }
  }
  let fluency: number, rate: number | null = null, maxGap: number | null = null;
  if (words.length >= T.MIN_WORDS) {
    words.sort((x, y) => x.start - y.start);
    const span = words[words.length - 1].end - words[0].start;
    rate = span > 0 ? words.length / span : null;
    maxGap = 0;
    for (let i = 1; i < words.length; i++) {
      const g = words[i].start - words[i - 1].end;
      if (g > (maxGap as number)) maxGap = g;
    }
    // 말속도 — 적정 구간 안이면 100, 밖으로 나갈수록 감점(양쪽 대칭)
    let rateScore = 100;
    if (rate === null) rateScore = 60;
    else if (rate < T.RATE_LO) rateScore = 40 + 60 * ramp(rate, T.RATE_LO * 0.4, T.RATE_LO);
    else if (rate > T.RATE_HI) rateScore = 40 + 60 * (1 - ramp(rate, T.RATE_HI, T.RATE_HI * 1.8));
    // 머뭇거림 — 단어 사이 최장 공백
    const gapScore = 40 + 60 * (1 - ramp(maxGap as number, T.GAP_OK, T.GAP_BAD));
    fluency = 0.6 * rateScore + 0.4 * gapScore;
  } else {
    // 타이밍이 없으면 흐름은 또렷함을 따라간다(추정치임을 감안해 살짝 후하게)
    fluency = Math.min(100, clarity + 10);
  }

  return {
    ok: true,
    clarity: Math.round(clamp01(clarity / 100) * 100),
    fluency: Math.round(clamp01(fluency / 100) * 100),
    lp, noSpeech: nsMax, rate, maxGap,
  };
}

const FUNC: Record<string, 1> = {
  a: 1, an: 1, the: 1, is: 1, are: 1, am: 1, was: 1, were: 1, be: 1, been: 1, do: 1, does: 1, did: 1,
  to: 1, of: 1, in: 1, on: 1, at: 1, for: 1, with: 1, and: 1, or: 1, but: 1, so: 1, it: 1, its: 1,
  my: 1, your: 1, his: 1, her: 1, our: 1, their: 1, this: 1, that: 1, these: 1, those: 1,
  i: 1, you: 1, he: 1, she: 1, we: 1, they: 1, not: 1, very: 1, some: 1, any: 1,
};
const weightOf = (w: string) => (FUNC[w] ? 0.4 : 1);

const normLatin = (s: string) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
const wordsOf = (s: string) => { const n = normLatin(s); return n ? n.split(' ') : []; };

function phonKey(w: string): string {
  return String(w || '').toLowerCase().replace(/[^a-z]/g, '')
    .replace(/^(kn|gn|pn|wr)/, 'n')
    .replace(/(ough|augh)/g, 'o')
    .replace(/(tion|sion)/g, 'shn')
    .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/gh/g, 'g')
    .replace(/c(?=[iey])/g, 's').replace(/c/g, 'k')
    .replace(/q/g, 'k').replace(/z/g, 's').replace(/x/g, 'ks')
    .replace(/[aeiou]+/g, 'a')
    .replace(/(.)\1+/g, '$1');
}
function lev(a: string, b: string): number {
  a = a || ''; b = b || '';
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev: number[] = [], cur: number[] = [];
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}
// 같은 낱말로 볼 만큼 소리가 비슷한가 — 첫소리가 같아야 하고, 짧은 낱말은 한 글자 차이도 불인정
//   (father ↔ mother 를 같은 소리로 오판하던 사고 방지)
function soundsClose(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ka = phonKey(a), kb = phonKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.charAt(0) !== kb.charAt(0)) return false;
  const d = lev(ka, kb), longer = Math.max(ka.length, kb.length);
  return longer >= 4 && d <= 1;
}

type Op = { op: 'ok' | 'sub' | 'del' | 'ins'; t: string | null; s: string | null };
function align(tw: string[], sw: string[]): Op[] {
  const m = tw.length, n = sw.length;
  const D: number[][] = [], B: (string | null)[][] = [];
  for (let i = 0; i <= m; i++) { D[i] = [i]; B[i] = ['del']; }
  for (let j = 0; j <= n; j++) { D[0][j] = j; B[0][j] = 'ins'; }
  B[0][0] = null;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const same = (tw[i - 1] === sw[j - 1]) || soundsClose(tw[i - 1], sw[j - 1]);
      const cSub = D[i - 1][j - 1] + (same ? 0 : 1);
      const cDel = D[i - 1][j] + 1;
      const cIns = D[i][j - 1] + 1;
      const best = Math.min(cSub, cDel, cIns);
      D[i][j] = best;
      B[i][j] = (best === cSub) ? (same ? 'ok' : 'sub') : (best === cDel ? 'del' : 'ins');
    }
  }
  const ops: Op[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    const op = (i > 0 && j > 0) ? B[i][j] : (i > 0 ? 'del' : 'ins');
    if (op === 'ok' || op === 'sub') { ops.push({ op: op as any, t: tw[i - 1], s: sw[j - 1] }); i--; j--; }
    else if (op === 'del') { ops.push({ op: 'del', t: tw[i - 1], s: null }); i--; }
    else { ops.push({ op: 'ins', t: null, s: sw[j - 1] }); j--; }
  }
  return ops.reverse();
}

const hasCJK = (s: string) => /[一-鿿]/.test(s);
const cjkChars = (s: string) => (String(s || '').match(/[一-鿿]/g) || []);

// 중국어(글자 단위) 채점 — LCS 로 순서를 반영. 발화에 한자가 없으면 언어 불일치.
function scoreCJK(target: string, spoken: string): VoiceScore {
  const t = cjkChars(target), s = cjkChars(spoken);
  const langMismatch = t.length > 0 && s.length === 0;
  // LCS 길이
  const m = t.length, n = s.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = t[i - 1] === s[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  const lcs = dp[m][n];
  const recall = m ? lcs / m : 0;
  const precision = n ? lcs / n : 0;
  const f1 = (precision + recall) ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = Math.round(f1 * 100);
  const completeness = Math.round(recall * 100);
  const pronunciation = accuracy;   // 글자 인식 기반 — 발음 세부는 알 수 없어 정확도와 동일
  const lengthRatio = m ? n / m : 0;
  const lenScore = Math.max(0, 1 - Math.abs(1 - lengthRatio) * 0.6);
  const fluency = Math.round(Math.min(lenScore * 100, accuracy + 15));
  // 종합 — 영어와 동일한 재배분(0.6/0.25/0.15) + accuracy+12 상한 (2026-07-27 변별력 강화)
  const overall = Math.min(
    Math.round(accuracy * 0.6 + pronunciation * 0.25 + fluency * 0.15),
    accuracy + 12
  );
  return {
    accuracy, pronunciation, fluency, completeness, overall, langMismatch, acoustic: false,
    counts: { ok: lcs, close: 0, wrong: Math.max(0, m - lcs), wrongContent: Math.max(0, m - lcs), missing: Math.max(0, m - lcs), extra: Math.max(0, n - lcs) },
  };
}

/**
 * 음성코치 채점 — 결정론적 순수 함수(하니스로 변별력 검증 가능).
 * target: 모범 문장, spoken: 인식된 발화, acoustic: Whisper 음향정보(있으면 또렷함·흐름에 반영).
 */
export function scoreVoiceCoach(target: string, spoken: string, acoustic?: AcousticInfo | null): VoiceScore {
  return applyAcoustic(scoreText(target, spoken), acoustic);
}

/** 텍스트 정렬 채점(기존 방식). 음향정보 없이도 이 값이 나온다. */
function scoreText(target: string, spoken: string): VoiceScore {
  const tgt = String(target || '').trim();
  const spk = String(spoken || '').trim();

  if (hasCJK(tgt)) return scoreCJK(tgt, spk);

  const tw = wordsOf(tgt), sw = wordsOf(spk);
  const empty: VoiceScore = {
    accuracy: 0, pronunciation: 0, fluency: 0, completeness: 0, overall: 0,
    langMismatch: false, acoustic: false, counts: { ok: 0, close: 0, wrong: 0, wrongContent: 0, missing: 0, extra: 0 },
  };
  if (!tw.length) return empty;

  // 영어 목표인데 발화에 알파벳이 하나도 없으면(예: 한국어) 언어 불일치 → 0점
  const langMismatch = sw.length === 0 && spk.length > 0;
  if (!sw.length) return { ...empty, langMismatch };

  const ops = align(tw, sw);
  let got = 0, total = 0, spokenOk = 0, okExact = 0, okClose = 0, wrong = 0, wrongContent = 0, missing = 0, extra = 0;
  for (const o of ops) {
    if (o.op === 'ins') { extra++; continue; }
    const w = weightOf(o.t as string);
    total += w;
    if (o.op === 'ok') {
      const exact = (o.t === o.s);
      got += exact ? w : w * 0.85;
      spokenOk++;
      if (exact) okExact++; else okClose++;
    } else if (o.op === 'sub') {
      wrong++;
      if (!FUNC[o.t as string]) wrongContent++;
    } else {
      missing++;
    }
  }

  let accuracyF = total ? got / total : 0;
  if (extra > tw.length) accuracyF *= 0.85;   // 목표보다 훨씬 길게 딴소리하면 감점
  const accuracy = Math.round(accuracyF * 100);
  const completeness = Math.round((tw.length ? spokenOk / tw.length : 0) * 100);

  // 발음 점수 — '정확히'(철자까지) 발음한 비율. 분모에 치환(sub)도 포함한다.
  //   (2026-07-27 변별력 강화: 이전엔 분모가 "맞힌 단어"뿐이라, 단어를 아예 다른 말로
  //    발음(Mangoi→MongoEye)해도 발음 점수가 100이 나왔다 — 억양 흔들림(close, 83)보다
  //    완전 오발음이 더 높게 나오는 역전이었다. 틀리게 말한 단어도 발음 실패로 센다.)
  const okTotal = okExact + okClose;
  const pronDen = okTotal + wrong;
  const pronunciation = pronDen ? Math.round((okExact / pronDen) * 100) : 0;

  // 유창성 — 길이 적정성. 단, 딴소리(정확도 낮음)는 유창성 상한을 눌러 "틀렸는데 유창"을 막는다.
  const lengthRatio = sw.length / (tw.length || 1);
  const lenScore = Math.max(0, 1 - Math.abs(1 - lengthRatio) * 0.6);
  const fluency = Math.round(Math.min(lenScore * 100, accuracy + 15));

  // 종합 — 내용 정확도 중심으로 재배분(0.6/0.25/0.15) + 정확도보다 12점 이상 높아질 수 없게 상한.
  //   (한 문장 6단어 중 핵심 단어 1개를 틀려도 89점 A등급이 나오던 희석을 막는다 → 82점 B)
  const overall = Math.min(
    Math.round(accuracy * 0.6 + pronunciation * 0.25 + fluency * 0.15),
    accuracy + 12
  );
  return {
    accuracy, pronunciation, fluency, completeness, overall, langMismatch, acoustic: false,
    counts: { ok: spokenOk, close: okClose, wrong, wrongContent, missing, extra },
  };
}

/** 종합 = 정확도 0.6 + 또렷함 0.25 + 흐름 0.15, 단 정확도보다 12점 이상 높아질 수 없다. */
function combine(accuracy: number, pronunciation: number, fluency: number): number {
  return Math.min(Math.round(accuracy * 0.6 + pronunciation * 0.25 + fluency * 0.15), accuracy + 12);
}

/**
 * 텍스트 채점 결과에 Whisper 음향 지표를 덮어씌운다.
 *   또렷함 = 음향 확신도 0.7 + 철자 일치율 0.3
 *     (음향만 쓰지 않는 이유: 다른 단어를 또박또박 말해도 logprob 은 높게 나온다.
 *      "정확히 말했나"는 여전히 텍스트가 알려주므로 둘을 섞는다.)
 *   흐름   = 말속도·머뭇거림. 단 딴소리는 유창성 상한을 눌러 "틀렸는데 유창"을 막는다(기존 규칙 유지).
 * 음향정보가 없거나 부실하면 원본을 그대로 돌려준다 → 옛 동작과 100% 동일(하위호환).
 */
function applyAcoustic(base: VoiceScore, info?: AcousticInfo | null): VoiceScore {
  /* 🔇 소리를 못 들었으면 «완벽» 이라고 말하지 않는다 — 자세한 이유는 NO_ACOUSTIC_MAX 주석.
     딴말(langMismatch·정확도 0)까지 끌어올리지 않도록 «상한» 으로만 쓴다(점수를 올리는 일은 없다). */
  const capNoAcoustic = (s: VoiceScore): VoiceScore =>
    (s.overall > ACOUSTIC_TUNING.NO_ACOUSTIC_MAX)
      ? { ...s, overall: ACOUSTIC_TUNING.NO_ACOUSTIC_MAX }
      : s;
  if (!info) return capNoAcoustic(base);
  const a = analyzeAcoustic(info);
  if (!a.ok) return capNoAcoustic(base);
  // 언어가 아예 다르면(0점 처리) 음향으로 되살리지 않는다.
  if (base.langMismatch) return base;

  const pronunciation = Math.round(a.clarity * 0.7 + base.pronunciation * 0.3);
  const fluency = Math.min(a.fluency, base.accuracy + 15);
  return {
    ...base,
    pronunciation, fluency, acoustic: true,
    overall: combine(base.accuracy, pronunciation, fluency),
  };
}

// 🎖 등급 — 긴장감·동기부여용. 종합 점수를 눈에 띄는 티어로 변환.
export function scoreTier(overall: number): { tier: string; emoji: string; label_ko: string; label_en: string } {
  if (overall >= 95) return { tier: 'S', emoji: '🏆', label_ko: '완벽해요!', label_en: 'Perfect!' };
  if (overall >= 85) return { tier: 'A', emoji: '🌟', label_ko: '훌륭해요!', label_en: 'Excellent!' };
  if (overall >= 70) return { tier: 'B', emoji: '👍', label_ko: '좋아요!', label_en: 'Good!' };
  if (overall >= 50) return { tier: 'C', emoji: '💪', label_ko: '조금만 더!', label_en: 'Almost there!' };
  return { tier: 'D', emoji: '🌱', label_ko: '다시 해볼까요?', label_en: "Let's try again!" };
}
