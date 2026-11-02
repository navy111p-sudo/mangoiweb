// ASR 단어오류율(WER) 계산 — 순수 함수만 둔다(네트워크 없음, 테스트 가능).
// English: pure WER helpers. No network, no route wiring.

/** 문장을 비교용 토큰으로 바꾼다: 소문자, 구두점 제거, 공백 정리. */
export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[.,!?;:"'()\[\]{}…\-–—]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** 편집거리(단어 단위 Levenshtein): 치환·삽입·삭제 최소 횟수. */
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** WER = 편집거리 / 정답 단어 수. 정답이 비어 있으면 null(계산 불가). */
export function wer(reference, hypothesis) {
  const ref = tokenize(reference);
  if (ref.length === 0) return null;
  return editDistance(ref, tokenize(hypothesis)) / ref.length;
}

/** 평균 WER — 계산 가능한 항목만 센다. */
export function meanWer(pairs) {
  const scores = pairs.map(([r, h]) => wer(r, h)).filter((x) => x !== null);
  if (scores.length === 0) return null;
  return scores.reduce((s, x) => s + x, 0) / scores.length;
}
