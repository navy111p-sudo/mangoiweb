// 임시 — GitHub 러너에서만 돕니다. 사이트(공개 API)에서 실제 교재 슬라이드를 받아 webp 로 줄여 저장합니다.
// 대상: BTS 1 한 권 전체(New) + NEW SIU BASIC 001(Easy·Hard) + NEW SIU ADVANCE 002(Easy) + BTS 7 001(New)
import fs from 'fs'; import { execFileSync } from 'child_process';
const SITE = 'https://mangoi.ai', OUT = 'docs/ai-class-sample/slides';
fs.mkdirSync(OUT, { recursive: true });
const tb = (f) => JSON.parse(fs.readFileSync('cloudflare-deploy/public/data/tb-say/' + f, 'utf8'));
const want = new Set();
for (const k of Object.keys(tb('bts-01.json'))) if (/ New \/ Slide\d+\.JPG$/.test(k)) want.add(k);
for (const k of Object.keys(tb('bts-07.json'))) if (k.startsWith('[BTS 7 001')) want.add(k);
for (const k of Object.keys(tb('siu-basic-001.json'))) want.add(k);
for (const k of Object.keys(tb('siu-adv-002.json'))) if (/\] Easy \//.test(k)) want.add(k);
const books = [...new Set([...want].map(k => k.slice(1, k.indexOf(']'))))];
const map = {}; let got = 0, miss = [];
for (const b of books) {
  const r = await fetch(`${SITE}/api/textbook-files?book=${encodeURIComponent(b)}&limit=2000`);
  const d = await r.json();
  if (!d.ok) { console.log('list fail', b, r.status); continue; }
  for (const it of d.items) {
    if (!want.has(it.name) || map[it.name]) continue;
    const res = await fetch(SITE + it.url);
    if (!res.ok) { miss.push(it.name + ' ' + res.status); continue; }
    const file = 's' + it.id + '.webp', tmp = '/tmp/s' + it.id + '.' + (it.ext || 'jpg');
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    execFileSync('cwebp', ['-quiet', '-q', '78', '-resize', '1280', '0', tmp, '-o', OUT + '/' + file]);
    map[it.name] = file; got++;
  }
}
for (const k of want) if (!map[k]) miss.push(k);
fs.writeFileSync('docs/ai-class-sample/slides-map.json', JSON.stringify(map, null, 0));
console.log(`wanted ${want.size} · got ${got} · missing ${miss.length}`); miss.slice(0, 20).forEach(m => console.log(' - ' + m));
