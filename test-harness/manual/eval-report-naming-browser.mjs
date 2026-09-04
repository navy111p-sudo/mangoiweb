// -*- coding: utf-8 -*-
// eval-report-naming-browser.mjs — 「오늘 수업일지」·「월간 성적표」를 **진짜 브라우저에 그려서** 잰다.
//
//   [왜 필요한가]  이 작업에는 문자열 하니스로 볼 수 없는 것이 둘 있다.
//     ① «화면에 무슨 글자가 나오는가» — 타일 이름은 i18n 엔진이 나중에 갈아끼울 수 있고,
//        전체메뉴는 열 때 «그려서» 만드는 오버레이라 파일만 봐서는 결과를 모른다.
//     ② `score_overall` 은 «한 칸에 두 척도» 라(강사 1분 일지 1~5 · AI 수업 리포트 0~100),
//        0~100 행이 하나만 섞여도 옛 코드는 '☆'.repeat(5-88) 에서 **RangeError 를 던져
//        목록이 통째로 안 그려졌다.** 그건 «그려 봐야» 보인다.
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   이름·점수 만점·별점을 건드리면 **사람이 불러야** 한다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/eval-report-naming-browser.mjs
//
//   ⚠️ file:// 로 열면 안 된다 — <script src="/js/…"> 가 전부 404 가 되고 에러가 화면에 안 떠
//      «기능이 죽었다» 로 오진한다(CLAUDE.md 2장). 그래서 이 파일이 직접 http 서버를 띄운다.
//   ⚠️ API 는 «스텁» 이 필요하다 — 두 화면 다 학생 세션이 없으면 로그인 창부터 뜬다.
//      그리고 스텁은 문서가 만들어지기 «전» 에 심어야 한다(addInitScript). 화면 코드가
//      fetch 를 쓰기 시작한 뒤에 덮으면 늦는다 — 실제로 그래서 한 번 헛돌았다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const { chromium, exe } = requireBrowser();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

// 0~100 척도 행(홍길동 88·84)을 **일부러 섞는다** — 그 행이 옛 코드를 죽였다.
const STUB = {
  '/api/eval/list': { ok: true, rows: [
    { id: 123, student_name: '김사랑', teacher_name: 'Teacher Kaye', lesson_title: '수업', lesson_date: '2026-09-01', score_overall: 5 },
    { id: 117, student_name: '홍길동', teacher_name: 'Emma', lesson_title: '수업', lesson_date: '2026-06-14', score_overall: 88 }] },
  '/api/eval/123': { ok: true, eval: { id: 123, student_name: '김사랑', teacher_name: 'Kaye', lesson_date: '2026-09-01',
    score_overall: 5, score_participation: 5, score_comprehension: 4, score_speaking: 5, strengths: '좋음', created_at: Date.now() } },
  '/api/eval/117': { ok: true, eval: { id: 117, student_name: '홍길동', teacher_name: 'Emma', lesson_date: '2026-06-14',
    score_overall: 88, score_speaking: 90, strengths: '좋음', created_at: Date.now() } },
  MONTHLY: { ok: true, year_month: '2026-09', generated_at: Date.now(),
    student: { user_id: 'heyst', student_name: '김사랑', parent_name: '김부모' },
    attendance: { days: 4 },
    evaluations: { count: 2, avg_score: 46.5, items: [{ score_overall: 5, lesson_date: '2026-09-01', strengths: '적극적' },
                                                     { score_overall: 88, lesson_date: '2026-06-14', strengths: 'AI 리포트 행' }] },
    voice: { sessions: 3, best: 90, avg_accuracy: 80, avg_pronunciation: 82, avg_fluency: 78 },
    payments: { total_krw: 120000 } },
};

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// ⚠️ 문서가 만들어지기 «전» 에 심는다 — 화면 코드가 fetch 를 쓰기 전에 덮여 있어야 한다.
await ctx.addInitScript(`(function(){var S=${JSON.stringify(STUB)};
  try{ localStorage.setItem('mangoi_logged_user', JSON.stringify({user_id:'heyst',uid:'heyst',name:'김사랑',user_name:'김사랑',role:'student'}));
       localStorage.setItem('mangoi_uid','heyst'); localStorage.setItem('mango_token','t'); localStorage.setItem('mangoi_lang','ko');
       localStorage.setItem('mangoi_admin_welcome_v1_done','1'); }catch(e){}
  var o=window.fetch; window.fetch=function(u){ var s=(typeof u==='string'?u:(u&&u.url)||'');
    if(s.indexOf('/api/')>=0){ var p=s.split('?')[0].replace(/^https?:\\/\\/[^/]+/,'');
      var b=S[p]||(p.indexOf('/api/report/monthly/')===0?S.MONTHLY:{ok:true});
      return Promise.resolve(new Response(JSON.stringify(b),{status:200,headers:{'Content-Type':'application/json'}})); }
    return o.apply(this,arguments); };})();`);
const page = await ctx.newPage();
const flat = async (sel) => ((await page.locator(sel).innerText().catch(() => '')) || '').replace(/\s+/g, ' ');

console.log('\n① 전체메뉴 타일 이름 — 열어서 그려진 글자를 읽는다');
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => { if (window.openAllMenuOverlay) window.openAllMenuOverlay(); });
await page.waitForTimeout(700);
const labels = await page.evaluate(() =>
  Array.from(document.querySelectorAll('#mangoi-allmenu .mgam-card span')).map((s) => s.textContent.trim()));
check('전체메뉴가 열렸다', labels.length > 5, JSON.stringify(labels).slice(0, 90));
check('타일에 「오늘 수업일지」가 있다', labels.includes('오늘 수업일지'));
check('타일에 「월간 성적표」가 있다', labels.includes('월간 성적표'));
check('옛 이름 「평가서」·「리포트」가 안 보인다', !labels.includes('평가서') && !labels.includes('리포트'));
// 🌐 를 눌러도 따라오려면 data-ko/data-en 이 «글자만 담은 span» 에 있어야 한다
const attrs = await page.evaluate(() => {
  const a = document.querySelector('#mangoi-allmenu [data-en="Today\'s Lesson Note"]');
  const b = document.querySelector('#mangoi-allmenu [data-en="Monthly Report Card"]');
  const card = document.querySelector('#mangoi-allmenu .mgam-card');
  return { a: a && a.tagName, ako: a && a.getAttribute('data-ko'), b: b && b.tagName,
           bko: b && b.getAttribute('data-ko'), cardHasKo: !!(card && card.hasAttribute('data-ko')) };
});
check('두 라벨에 data-ko/data-en 이 달려 있다', attrs.ako === '오늘 수업일지' && attrs.bko === '월간 성적표', JSON.stringify(attrs));
check('그 속성이 <span> 에만 있고 카드(<a>)에는 없다 — 아이콘이 사라지는 함정',
  attrs.a === 'SPAN' && attrs.b === 'SPAN' && attrs.cardHasKo === false, JSON.stringify(attrs));

console.log('\n② 오늘 수업일지 — 목록(0~100 행이 섞여도 안 죽는가)');
await page.goto(BASE + '/eval.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const list = await flat('#eval-root');
check('머리글이 「…님의 수업일지」다', /님의 수업일지/.test(list), list.slice(0, 80));
check('88점 행이 그려진다(옛 코드는 RangeError 로 목록 전체가 안 나왔다)', /Emma/.test(list), list.slice(0, 170));
check('88점 행에 만점 100 이 함께 보인다', /88\s*\/\s*100/.test(list));
check('5점 행에는 만점 5 가 보인다', /5\s*\/\s*5/.test(list));

console.log('\n③ 오늘 수업일지 — 낱장(만점·별점·세부 막대)');
await page.goto(BASE + '/eval.html?id=123', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
let one = await flat('#eval-root');
check('1~5 행은 「종합 / 5점」', /종합 \/ 5점/.test(one), one.slice(0, 110));
check('제목이 「학생 수업일지」다', /학생 수업일지/.test(one));
check('꼬리말이 「수업일지 #」다', /수업일지 #123/.test(one));
check('1~5 행 세부 점수가 「/ 5」', /\/ 5/.test(one) && !/\/ 100/.test(one));
await page.goto(BASE + '/eval.html?id=117', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
one = await flat('#eval-root');
check('0~100 행은 「종합 / 100점」(옛 코드는 「88 / 5점」이었다)', /종합 \/ 100점/.test(one), one.slice(0, 110));
check('0~100 행 세부 점수가 「/ 100」(옛 코드는 「90 / 5」였다)', /90 \/ 100/.test(one));
const stars = await page.evaluate(() => (document.querySelector('.overall-stars') || {}).textContent || '');
check('별점이 5칸을 안 넘는다', stars.length === 5, JSON.stringify(stars));
const widths = await page.evaluate(() => Array.from(document.querySelectorAll('.score-bar')).map((b) => b.style.width));
check('세부 막대가 90% 로 그려진다(옛 코드는 100% 로 꽉 찼다)', widths.join(' ').includes('90%'), JSON.stringify(widths));

console.log('\n④ 월간 성적표');
await page.goto(BASE + '/report.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const title = await page.evaluate(() => document.title + ' | ' + (document.getElementById('report-title') || {}).textContent);
const rp = await flat('#content');
check('탭 제목·머리글이 「성적표」다', /성적표/.test(title), title);
check('「/10」 표기가 사라졌다', !/\/10\b/.test(rp), rp.slice(0, 170));
check('1~5 행은 5/5 로 보인다', /5\/5/.test(rp));
check('0~100 행은 88/100 으로 보인다', /88\/100/.test(rp));
check('통계 타일이 「수업일지」로 바뀌었다', /수업일지/.test(rp));
// 두 척도가 섞인 달이면 평균은 뜻이 없다 — 화면이 «모른다» 고 말해야 한다
check('두 척도가 섞인 달의 평균 점수는 «—» 로 가려진다', /— 평균 점수|평균 점수/.test(rp) && !/46\.5/.test(rp), rp.slice(0, 200));

await browser.close();
server.close();
console.log(`\n📝📊 eval-report-naming-browser — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
