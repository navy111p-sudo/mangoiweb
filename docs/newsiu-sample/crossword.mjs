// 원본 001 의 «Complete the crossword puzzle» 를 진짜 퍼즐 판으로 — 결정론(시드 고정)으로 배치.
export function makeCrossword(words, seed = 7, tries = 4000) {
  let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let best = null;
  for (let t = 0; t < tries; t++) {
    const order = words.slice().sort((a, b) => b.length - a.length + (rnd() - .5) * 3);
    const cells = new Map(); const placed = [];
    const key = (r, c) => r + ',' + c;
    const fits = (w, r, c, d) => {
      let cross = 0;
      for (let i = 0; i < w.length; i++) {
        const rr = r + (d ? i : 0), cc = c + (d ? 0 : i), ch = cells.get(key(rr, cc));
        if (ch) { if (ch !== w[i]) return -1; cross++; continue; }
        const n1 = d ? key(rr, cc - 1) : key(rr - 1, cc), n2 = d ? key(rr, cc + 1) : key(rr + 1, cc);
        if (cells.has(n1) || cells.has(n2)) return -1;
      }
      const b = d ? key(r - 1, c) : key(r, c - 1), a = d ? key(r + w.length, c) : key(r, c + w.length);
      if (cells.has(b) || cells.has(a)) return -1;
      return cross;
    };
    const put = (w, r, c, d) => { for (let i = 0; i < w.length; i++) cells.set(key(r + (d ? i : 0), c + (d ? 0 : i)), w[i]); placed.push({ w, r, c, d }); };
    put(order[0], 0, 0, 0);
    let ok = true;
    for (const w of order.slice(1)) {
      const opts = [];
      for (const [k, ch] of cells) { const [r0, c0] = k.split(',').map(Number);
        for (let i = 0; i < w.length; i++) if (w[i] === ch) for (const d of [0, 1]) {
          const r = d ? r0 - i : r0, c = d ? c0 : c0 - i, x = fits(w, r, c, d); if (x > 0) opts.push({ r, c, d, x }); } }
      if (!opts.length) { ok = false; break; }
      const o = opts[Math.floor(rnd() * opts.length)]; put(w, o.r, o.c, o.d);
    }
    if (!ok) continue;
    const rs = placed.flatMap(p => [p.r, p.r + (p.d ? p.w.length - 1 : 0)]), cs = placed.flatMap(p => [p.c, p.c + (p.d ? 0 : p.w.length - 1)]);
    const H = Math.max(...rs) - Math.min(...rs) + 1, W = Math.max(...cs) - Math.min(...cs) + 1;
    const score = Math.max(W / 1.6, H) * 10 + W * H / 20;
    if (!best || score < best.score) best = { score, W, H, placed: placed.map(p => ({ ...p, r: p.r - Math.min(...rs), c: p.c - Math.min(...cs) })) };
  }
  if (!best) throw new Error('crossword: cannot place all words');
  // 번호: 위→아래, 왼→오른 순서
  const starts = [...new Set(best.placed.map(p => p.r * 100 + p.c))].sort((a, b) => a - b);
  best.placed.forEach(p => p.n = starts.indexOf(p.r * 100 + p.c) + 1);
  return best;
}
