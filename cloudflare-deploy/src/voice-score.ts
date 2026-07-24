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
  pronunciation: number;   // 0~100 — 맞힌 단어 중 '정확히' 발음한 비율(억양 흔들림 감지)
  fluency: number;         // 0~100 — 길이 적정성 × 정확도(딴소리는 유창성도 낮게)
  completeness: number;    // 0~100 — 목표 단어 중 실제로 말한 비율
  overall: number;         // 0~100 — 종합(accuracy 0.5 + pron 0.3 + fluency 0.2)
  langMismatch: boolean;   // 목표 언어와 발화 언어가 다른가(영어 목표에 한국어 등)
  counts: { ok: number; close: number; wrong: number; wrongContent: number; missing: number; extra: number };
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
  const fluency = Math.round(Math.min(lenScore * 100, accuracy + 20));
  const overall = Math.round(accuracy * 0.5 + pronunciation * 0.3 + fluency * 0.2);
  return {
    accuracy, pronunciation, fluency, completeness, overall, langMismatch,
    counts: { ok: lcs, close: 0, wrong: Math.max(0, m - lcs), wrongContent: Math.max(0, m - lcs), missing: Math.max(0, m - lcs), extra: Math.max(0, n - lcs) },
  };
}

/**
 * 음성코치 채점 — 결정론적 순수 함수(하니스로 변별력 검증 가능).
 * target: 모범 문장, spoken: 인식된 발화.
 */
export function scoreVoiceCoach(target: string, spoken: string): VoiceScore {
  const tgt = String(target || '').trim();
  const spk = String(spoken || '').trim();

  if (hasCJK(tgt)) return scoreCJK(tgt, spk);

  const tw = wordsOf(tgt), sw = wordsOf(spk);
  const empty: VoiceScore = {
    accuracy: 0, pronunciation: 0, fluency: 0, completeness: 0, overall: 0,
    langMismatch: false, counts: { ok: 0, close: 0, wrong: 0, wrongContent: 0, missing: 0, extra: 0 },
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

  // 발음 점수 — 맞힌 단어 중 '정확히'(철자까지) 발음한 비율. 억양 흔들림(close)이 많으면 낮아진다.
  const okTotal = okExact + okClose;
  const pronunciation = okTotal ? Math.round((okExact / okTotal) * 100) : 0;

  // 유창성 — 길이 적정성. 단, 딴소리(정확도 낮음)는 유창성 상한을 눌러 "틀렸는데 유창"을 막는다.
  const lengthRatio = sw.length / (tw.length || 1);
  const lenScore = Math.max(0, 1 - Math.abs(1 - lengthRatio) * 0.6);
  const fluency = Math.round(Math.min(lenScore * 100, accuracy + 20));

  const overall = Math.round(accuracy * 0.5 + pronunciation * 0.3 + fluency * 0.2);
  return {
    accuracy, pronunciation, fluency, completeness, overall, langMismatch,
    counts: { ok: spokenOk, close: okClose, wrong, wrongContent, missing, extra },
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
