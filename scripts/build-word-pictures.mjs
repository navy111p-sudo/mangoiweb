// 🖼 AI 단어 퀴즈(micro-quiz.html)용 «낱말 → 실사 사진» 색인 — 2026-09-23 사장님 지시
//    「단어 퀴즈도 힉스필드에 저장된 실사·그림 이미지로」.
// ✅ 새로 판정하지 않습니다 — 장면 탐험대 빌드(build-scene-curriculum.mjs)가 이미 근거 게이트
//    (scene-picture-evidence.mjs 의 depicts)를 통과시킨 «pic=1» 줄만 모읍니다.
//    ⛔ 여기에 «그 낱말이 문장에 있으면 붙인다» 같은 판정을 다시 적지 마세요(「nice ← 가방」 사고).
// ✅ 같은 낱말에 교재마다 다른 사진이 붙어 있으면: 낱말 전용 사진(scene-words) › 장면 그림, 그다음 번호가 작은 쪽(결정론).
// 실행: node scripts/build-word-pictures.mjs  (장면 탐험대 payload 를 다시 빌드했으면 함께 돌리세요 —
//        test-harness/word_quiz_pictures_harness.mjs 가 어긋나면 FAIL 냅니다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'cloudflare-deploy/public/data/scene-curriculum/v1');
const out = path.join(root, 'cloudflare-deploy/public/data/word-pictures.json');
export const PREFIX = { w: '/img/scene-words/', c: '/img/scene-clips/' };
export function collect(dir) {
  const best = new Map();
  const rank = img => (img.startsWith(PREFIX.w) ? 0 : 1);
  const num = img => Number((img.match(/(\d+)\.webp$/) || [])[1] || 1e9);
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'manifest.json').sort()) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const w of b.words || []) {
      if (!w.pic) continue;
      const s = (b.scenes || {})[w.scene];
      if (!s || !s.image) continue;
      const code = Object.entries(PREFIX).find(([, p]) => s.image.startsWith(p) && /^\d+\.webp$/.test(s.image.slice(p.length)));
      if (!code) continue;
      const cur = best.get(w.word);
      if (cur && (rank(cur) < rank(s.image) || (rank(cur) === rank(s.image) && num(cur) <= num(s.image)))) continue;
      best.set(w.word, s.image);
    }
  }
  const words = {};
  for (const k of [...best.keys()].sort()) {
    const img = best.get(k);
    const [c, p] = Object.entries(PREFIX).find(([, p]) => img.startsWith(p));
    words[k] = c + img.slice(p.length, -5);
  }
  return { v: 1, prefix: PREFIX, words };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = collect(src);
  fs.writeFileSync(out, JSON.stringify(data) + '\n');
  console.log(JSON.stringify({ words: Object.keys(data.words).length, bytes: fs.statSync(out).size }));
}
