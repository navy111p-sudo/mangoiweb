/* 🖼 AI 단어 퀴즈 실사 사진 (2026-09-23) — micro-quiz.html 이 힉스필드 낱말 사진을 쓴다.
   ① 색인이 «장면 탐험대 payload 의 근거 통과 줄» 과 지금도 같은가(빌드를 다시 돌리고 색인을 안 돌리면 FAIL)
   ② 색인이 가리키는 파일이 저장소에 실재하는가(표에만 있고 실물이 없는 조용한 폴백 방지)
   ③ 화면의 wordPic 을 오려 내 실제로 돌려 «있는 낱말은 주소 · 없는 낱말은 빈 값» 을 짝으로 본다
   ④ 듣기 문제는 답 전에 사진을 안 보여 준다(그림으로 맞히기 방지) · 뜻 문제는 보여 준다(짝) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'cloudflare-deploy/public');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log('❌ FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const { collect, PREFIX, quizPlanOk, QUIZ_PLAN } = await import(path.join(root, 'scripts/build-word-pictures.mjs'));
const file = path.join(pub, 'data/word-pictures.json');
const committed = JSON.parse(fs.readFileSync(file, 'utf8'));
const fresh = collect(path.join(pub, 'data/scene-curriculum/v1'));
ok('① 색인이 payload 와 같다 (node scripts/build-word-pictures.mjs 로 다시 만드세요)', JSON.stringify(committed) === JSON.stringify(fresh));
const n = Object.keys(committed.words).length;
ok('① 낱말이 충분히 있다(전제)', n >= 3000, 'n=' + n);
let missing = [];
for (const [w, c] of Object.entries(committed.words)) {
  const base = PREFIX[c[0]];
  if (!base || !/^\d+$/.test(c.slice(1))) { missing.push(w + ':bad'); continue; }
  if (!fs.existsSync(path.join(pub, base, c.slice(1) + '.webp'))) missing.push(w);
}
ok('② 색인이 가리키는 사진이 전부 실재한다', missing.length === 0, missing.slice(0, 5).join(','));
ok('② 우리 저장소 주소만 쓴다', Object.values(committed.prefix).every(p => p.startsWith('/img/')));
// ⑤ 교재에 없는 퀴즈 낱말(nourishing 등) 전용 사진 표 — 2026-09-23
const plan = JSON.parse(fs.readFileSync(QUIZ_PLAN, 'utf8'));
ok('⑤ 퀴즈 전용 사진 표가 있다(전제)', plan.length >= 40, 'n=' + plan.length);
ok('⑤ 표의 설명이 전부 그 낱말을 담는다(근거)', plan.every(quizPlanOk), plan.filter(it => !quizPlanOk(it)).map(it => it.word).join(','));
ok('⑤ nourishing 이 퀴즈 사진을 가진다(제보 그 낱말)', committed.words.nourishing === 'w' + plan.find(it => it.word === 'nourishing').index);
ok('⑤ 표의 낱말은 전부 색인에 실렸다(파일 실재)', plan.every(it => committed.words[it.word]), plan.filter(it => !committed.words[it.word]).map(it => it.word).join(','));
ok('⑤ 설명에 그 낱말이 없으면 안 붙인다(짝)', !quizPlanOk({ index: 1, word: 'nice', prompt: 'A backpack on a chair.' }) && quizPlanOk({ index: 1, word: 'nice', prompt: 'A nice day.' }));
ok('⑤ 낱말 경계로 본다(부분일치 금지)', !quizPlanOk({ index: 1, word: 'paint', prompt: 'A painting on a wall.' }));
ok('⑤ 번호가 겹치지 않고 기존 낱말 사진 번호와도 안 겹친다', new Set(plan.map(it => it.index)).size === plan.length && plan.every(it => it.index >= 17001));
const html = fs.readFileSync(path.join(pub, 'micro-quiz.html'), 'utf8');
const body = (name) => { const i = html.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = html.indexOf('{', i); for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (d === 0) return html.slice(i, k + 1); } } return ''; };
const src = body('wordPic');
ok('③ wordPic 을 오려 냈다(전제)', src.length > 50);
try {
  const fn = new Function('WORD_PICS', src + '; return wordPic;');
  const data = { prefix: PREFIX, words: { dog: 'w12', school: 'c7206' } };
  const wp = fn(data);
  ok('③ 있는 낱말 → 낱말 사진 주소', wp('Dog.') === '/img/scene-words/12.webp');
  ok('③ 장면 그림 주소', wp('school') === '/img/scene-clips/7206.webp');
  ok('③ 없는 낱말 → 빈 값(지어내지 않음)', wp('nice') === '' && wp('constructor') === '');
  ok('③ 색인을 못 받았으면 빈 값(이모지 폴백)', fn(null)('dog') === '');
} catch (e) { ok('③ wordPic 실행', false, e.message); }
const rq = body('renderQuiz');
const listenLine = (rq.match(/if \(Q\.type==='listen'\) \{\s*prompt = `[^`]*`/) || [''])[0];
ok('④ 듣기 프롬프트를 찾았다(전제)', listenLine.length > 20);
ok('④ 듣기 문제는 답 전에 사진이 없다', !/picHtml|wordPic/.test(listenLine));
ok('④ 뜻 문제는 사진을 보여 준다(짝)', /kid-word">\$\{picHtml\(Q\.word, wordEmoji/.test(rq));
ok('④ 듣기는 답한 뒤 사진을 보여 준다', /Q\.type === 'listen' && wordPic\(Q\.word\)/.test(body('revealAnswer')));
console.log(`word_quiz_pictures_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
