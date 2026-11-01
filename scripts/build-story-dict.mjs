/* 📚 동화책 «바꿔 쓰기» 철자 점검용 낱말 사전 만들기 — 2026-10-13
   원천: 교재 낱말(public/data/word-pictures.json 의 words 키) + 기능어(docs/scene-curriculum-media/stopwords.json)
   결과: public/js/story-dict.js  (window.StoryDict = "낱말 낱말 …" 한 줄 문자열)
   ⛔ 결과 파일을 손으로 고치지 마세요 — 이 스크립트를 다시 돌리세요.
   ⚠️ 결과가 바뀌면 그것을 부르는 동화책 4편의 ?v= 를 함께 올리세요. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const wp = JSON.parse(readFileSync(join(ROOT, 'cloudflare-deploy/public/data/word-pictures.json'), 'utf8')).words;
const stop = JSON.parse(readFileSync(join(ROOT, 'docs/scene-curriculum-media/stopwords.json'), 'utf8'));
const set = new Set();
for (const w of Object.keys(wp).concat(stop)) {
  const s = String(w).toLowerCase().replace(/’/g, "'").trim();
  if (/^[a-z][a-z']*$/.test(s)) set.add(s);
}
const words = [...set].sort();
const out = '/* 자동 생성 — scripts/build-story-dict.mjs (손으로 고치지 마세요). 동화책 «바꿔 쓰기» 철자 점검용 낱말 ' + words.length + '개. */\n' +
  'window.StoryDict = ' + JSON.stringify(words.join(' ')) + ';\n';
writeFileSync(join(ROOT, 'cloudflare-deploy/public/js/story-dict.js'), out);
console.log('story-dict.js:', words.length, 'words,', out.length, 'bytes');
