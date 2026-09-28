// 권별·단원별 학습 범위 추출 → 노래 가사 작성 자료 / Extract unit scope for lyric writing
import fs from 'node:fs';
const OUT = new URL('./scope/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const isTwister = t => /tongue twister/i.test(t || '');
const need = [];
for (let n = 2; n <= 34; n++) {
  const nn = String(n).padStart(2, '0');
  const { COURSE } = await import(`../src/courses/bts-${nn}.mjs`);
  const units = {};
  for (const l of COURSE.lessons) {
    if (/review|test/i.test(l.unit)) continue;
    const u = (units[l.unit] ||= { unit: l.unit, lessons: [], titles: new Set(), goals: [], words: [], sentences: new Set(), songs: [], imgs: [] });
    u.lessons.push(l.code); u.titles.add(l.title);
    for (const s of l.slides) {
      if (s.t === 'goals') u.goals.push(...s.items.map(i => i[0]));
      if (s.t === 'vocab') for (const w of s.words) { if (!u.words.some(x => x[0] === w[0])) u.words.push([w[0], w[1]]); if (w[2]) u.imgs.push(w[2]); }
      if (s.t === 'song' && s.title !== 'Hello Song' && !isTwister(s.title)) u.songs.push(s.title);
      for (const k of ['q', 'a', 's']) if (typeof s[k] === 'string' && !s[k].includes('___') && s[k].length < 70) u.sentences.add(s[k]);
      if (s.t === 'rule' && s.left) for (const g of [s.left, s.right]) g.ex?.forEach(e => !e.includes('___') && u.sentences.add(e));
    }
  }
  const list = Object.values(units).map(u => ({ ...u, titles: [...u.titles], goals: [...new Set(u.goals)], sentences: [...u.sentences].slice(0, 40), songs: [...new Set(u.songs)] }));
  fs.writeFileSync(new URL(`bts-${nn}.json`, OUT), JSON.stringify({ book: n, units: list }, null, 1));
  for (const u of list) need.push({ book: n, unit: u.unit, lessons: u.lessons.join(','), has: u.songs.join(' / ') || '-' });
}
console.table(need);
console.log('units:', need.length, 'without song:', need.filter(x => x.has === '-').length);
