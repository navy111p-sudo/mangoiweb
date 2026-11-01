// -*- coding: utf-8 -*-
// AI 영작 — «지금 주제는 하나» (2026-10-16).
//   그림 · 문장 연습 · STEP 2 브레인스토밍이 같은 주제를 말하는지 실제 화면에서 봅니다.
//   📅 규칙(2026-10-19 사장님 지시 «글감은 «🎬 장면·글감 선택» 한 곳에서») — 주제는 «늘 하나» 다:
//      처음엔 지금 보이는 그림이 주제이고, 목록에서 다른 글감을 고르면 그것이 주제가 된다.
//      (2026-10-16 판은 «고른 주제가 없을 수 있다» · «글감을 고른 뒤 그림을 바꿔도 글감 유지» 였다 —
//       고르는 곳이 하나가 되며 그림 칸이 «지금 글감» 을 보여 주는 자리가 되어, «🔀 다른 그림» 을 누르는 것은 «그림을 고르는 것» 이다.)
//     ① 처음엔 지금 그림이 주제이고 문장 연습도 그 그림을 따른다
//     ② 글감을 고르면 문장 연습이 그 글감 문장 틀로 바뀐다(옛 사고: 그림 문장만 나옴)
//     ③ 글감을 고른 뒤 «🔀 다른 그림» 을 누르면 주제가 그 새 그림으로 돌아온다(바뀜 알림과 함께) — 고르는 길이 하나라서
//     ④ 그림 주제로 쓰는 중에 그림을 바꾸면 주제도 새 그림을 따라가고, 적은 답은 남는다
//     ⑤ 새로고침 뒤에도 그림 주제면 그 그림을 다시 띄운다 / 저장된 주제가 없으면(처음 온 학생) 처음 그림이 주제 — 짝
//     ⑥ «지금 주제를 그림으로» 되돌리면 문장 연습이 그림으로 돌아온다
//   자동으로 안 돕니다 — 사람이 부릅니다:
//       PW_DIR=/tmp/pw node test-harness/manual/ai-write-topic-sync-browser.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';
const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const PAGE = process.env.AW_PAGE || 'ai-write.html';
const { chromium, exe } = requireBrowser();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (extra ? '  (' + extra + ')' : '')); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  try {
    if (!sessionStorage.getItem('__awts_init')) {        // 처음 한 번만 비운다(새로고침 검사가 저장값을 봐야 한다)
      localStorage.clear(); sessionStorage.setItem('__awts_init', '1');
      localStorage.setItem('mangoi_lang', 'ko');
      localStorage.setItem('mangoi_aiwrite_guide_seen', '1');
    }
  } catch (e) {}
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));
const load = async () => { await page.goto(BASE + '/' + PAGE + '?_nc=' + Date.now(), { waitUntil: 'load' }); await page.waitForTimeout(500); };
await load();

const state = () => page.evaluate(() => ({
  pic: _picIdx, picKo: (PIC_SCENES[_picIdx] || {}).ko,
  theme: _goTheme ? _goTheme.id : '', themeSet: _goTheme ? _goTheme.set : '',
  level: document.getElementById('coachLevel').textContent,
  frame: document.getElementById('coachFrame').textContent,
  q: document.getElementById('coachQuestion').textContent,
  cur: (document.querySelector('#goThemes') || {}).innerText || '',
  ans: Object.assign({}, _goAnswers),
}));
const sceneStart = (s) => page.evaluate((i) => { const m = String(PIC_SCENES[i].example || '').match(/^(.+?\s(?:is|are))\s/); return m ? m[1] : 'Someone is'; }, s.pic);

console.log('── ① 처음엔 지금 그림이 주제');
let s = await state();
check('처음엔 지금 그림이 주제다(전제)', s.themeSet === 'scene' && s.theme === await page.evaluate(() => 'pic:' + PIC_SCENES[_picIdx].img), s.theme);
check('문장 연습이 «지금 주제: 지금 그림» 을 말한다', s.level.includes(s.picKo), s.level.slice(0, 60));
check('문장 틀이 그림 예문에서 나온다', s.frame.startsWith(await sceneStart(s)), s.frame);

console.log('── ② 글감을 고르면 문장 연습도 그 글감');
const topic = await page.evaluate(() => { goSelectTopic(0); return TOPICS[0]; });
s = await state();
check('지금 주제가 그 글감이다(전제)', s.theme === 'topic:0', s.theme);
check('문장 틀이 글감 시작 문장이다', s.frame.startsWith(topic.starter.trim()), s.frame);
check('문장 연습이 «지금 주제: 글감» 을 말한다', s.level.includes(topic.ko), s.level.slice(0, 60));
check('확장 질문이 그림용(표정을 보고)이 아니다', !/표정/.test(s.q) && /1\/6/.test(s.q), s.q);

console.log('── ③ 글감을 고른 뒤 «🔀 다른 그림» 을 누르면 그 그림이 주제(2026-10-19)');
const picBefore = s.pic;
await page.evaluate(() => shufflePic());
s = await state();
check('그림은 실제로 바뀌었다(전제)', s.pic !== picBefore, picBefore + '→' + s.pic);
check('주제가 그 새 그림이다', s.themeSet === 'scene' && s.theme === await page.evaluate(() => 'pic:' + PIC_SCENES[_picIdx].img), s.theme);
check('문장 틀도 새 그림 예문에서 나온다', s.frame.startsWith(await sceneStart(s)), s.frame);
check('«글감 대신 바꿨어요» 한 줄이 뜬다(말없이 바뀌지 않는다)', /대신 이 주제로 바꿨어요/.test(s.cur) && s.cur.includes(topic.ko.replace(/^\S+\s/, '')), s.cur.slice(0, 120));
await page.evaluate(() => goSelectTopic(0));   // ⑥ 을 위해 다시 글감으로

console.log('── ⑥ «지금 주제를 그림으로» 되돌리면 그림으로 돌아온다');
await page.evaluate(() => goClearTheme());
s = await state();
check('주제가 지금 그림이 됐다(전제)', s.themeSet === 'scene', s.theme);
check('문장 연습이 지금 그림으로 돌아왔다', s.level.includes(s.picKo) && s.frame.startsWith(await sceneStart(s)), s.frame);

console.log('── ④ 그림 주제로 쓰는 중 그림을 바꾸면 주제가 따라간다');
await page.evaluate(() => { choosePic(2); usePicPrompt(); goInput('what', 'A boy is cooking'); });
s = await state();
check('그림 주제가 됐다(전제)', s.themeSet === 'scene' && s.theme === await page.evaluate(() => 'pic:' + PIC_SCENES[2].img), s.theme);
await page.evaluate(() => choosePic(5));
s = await state();
const id5 = await page.evaluate(() => 'pic:' + PIC_SCENES[5].img);
check('주제가 새 그림을 따라갔다', s.theme === id5, s.theme + ' / 기대 ' + id5);
check('브레인스토밍 «지금 주제» 칸이 새 그림을 말한다', s.cur.includes(s.picKo), s.cur.slice(0, 80));
check('«바꿨어요» 한 줄이 뜬다', /대신 이 주제로 바꿨어요/.test(s.cur));
check('적어 둔 답은 지워지지 않았다', s.ans.what === 'A boy is cooking', JSON.stringify(s.ans));
check('문장 연습도 새 그림', s.level.includes(s.picKo), s.level.slice(0, 60));

console.log('── ⑤ 새로고침 뒤에도 그 그림');
await load();
s = await state();
check('주제가 되살아났다(전제)', s.theme === id5, s.theme);
check('화면 그림이 그 주제 그림이다', s.pic === 5, 'pic=' + s.pic);
check('문장 연습도 그 그림', s.level.includes(s.picKo), s.level.slice(0, 60));
await page.evaluate(() => { try { localStorage.removeItem('mangoi_aiwrite_go_v1'); } catch (e) {} });
await load();
s = await state();
const id0 = await page.evaluate(() => 'pic:' + PIC_SCENES[0].img);
check('저장된 주제가 없으면 처음 그림이 주제(짝)', s.theme === id0 && s.pic === 0, 'theme=' + s.theme + ' pic=' + s.pic);

console.log('── 내 경험 주제');
await page.evaluate(() => goSelectTheme('lost'));
s = await state();
check('문장 틀이 «I lost» 로 시작', s.frame.startsWith('I lost'), s.frame);

check('페이지 오류 0건', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close(); server.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
