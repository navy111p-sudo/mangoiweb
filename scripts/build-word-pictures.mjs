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
// ➕ 교재에 없는 퀴즈 낱말(학생 단어장·레벨 단어은행 — nourishing 등) 전용 사진 — 2026-09-23 사장님
//    「nourishing 인데 왜 실사 사진이 안 나오고 그림 카드가 나와?」. 장면 탐험대 교재에는 없으니
//    그 게이트를 탈 수 없어 따로 표를 둡니다. 근거는 같은 원칙 — «그 사진을 만든 설명에 그 낱말이 있다».
//    ⛔ 교재 사진이 이미 있는 낱말은 덮지 않습니다(교재 쪽이 정본).
export const QUIZ_PLAN = path.join(root, 'docs/scene-curriculum-media/quiz-word-image-plan.json');
export function quizPlanOk(it) {
  const w = String(it && it.word || '').toLowerCase();
  return /^[a-z][a-z'-]*$/.test(w) && Number.isInteger(it.index) && new RegExp('\\b' + w + '\\b').test(String(it.prompt || '').toLowerCase());
}
export function collect(dir, planPath = QUIZ_PLAN) {
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
  const plan = fs.existsSync(planPath) ? JSON.parse(fs.readFileSync(planPath, 'utf8')) : [];
  const pubRoot = path.resolve(dir, '../../..');
  for (const it of plan) {
    if (!quizPlanOk(it) || best.has(it.word)) continue;
    const img = PREFIX.w + it.index + '.webp';
    if (!fs.existsSync(path.join(pubRoot, img))) continue;
    best.set(it.word, img);
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
