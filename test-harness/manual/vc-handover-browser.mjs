/* 🤝 수업 중 인수인계 — 브라우저 검사 (2026-10-18, 개선안 3순위 ⑧)
   ⛔ 자동으로 안 돕니다. 사람이 부릅니다:  PW_DIR=/tmp/pw node test-harness/manual/vc-handover-browser.mjs

   왜 브라우저인가 — 틀리는 방식이 «무엇이 그려지는가·보이는가·패널 밖으로 넘치는가» 라
   문자열 검사로는 원리상 못 봅니다. 진짜 index.html 을 띄우고 강사 포털 API 만 가짜로 줍니다.

   짝으로 묻습니다: «강사·내 방이면 뜬다» 옆에 «학생이면 포털을 아예 안 부른다» ·
   «다른 방이면 안 뜬다» · «못 불러오면 지어내지 않고 사실대로 말한다». */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const { chromium, exe } = requireBrowser();
const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cloudflare-deploy', 'public');
const PORT = 8971;
const ROOM = 'class-4242-20261018';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

let MODE = 'ok';           // ok | other | fail | empty
let portalHits = 0;
const HANDOVER = {
  goal: { text: 'Use past tense when talking about yesterday', date: '2026-10-16', from: 'teacher_note', lang: 'en' },
  fix: { total: 4, practiced: 1, unfixed: [{ from: 'I go to school yesterday', to: 'I went to school yesterday' }, { from: 'She have a dog', to: 'She has a dog' }], unfixed_n: 3 },
  story: null,
};
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/teacher/portal') {
    portalHits++;
    if (MODE === 'fail') { r.writeHead(500, { 'Content-Type': 'application/json' }); return r.end('{"ok":false}'); }
    const classes = MODE === 'empty' ? [] : [
      { kind: 'class', room_id: MODE === 'other' ? 'class-9999-20261018' : ROOM, student_uid: 'stu1', handover: HANDOVER },
      { kind: 'class', room_id: 'class-1111-20261018', student_uid: 'stu2', handover: { goal: { text: 'NOT THIS STUDENT', date: null, from: 'teacher_note', lang: 'en' }, fix: null } },
    ];
    r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(JSON.stringify({ ok: true, classes }));
  }
  if (u.pathname.startsWith('/api/')) { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":true,"items":[]}'); }
  const fp = path.join(PUB, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ FAIL ' + m + (x ? '\n       · ' + x : ''))); };

const browser = await chromium.launch({ executablePath: exe, args: ['--headless=new', '--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });

async function open(w, h, role, lang) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript((lg) => { try {
    localStorage.setItem('mangoi_lang', lg); localStorage.setItem('mangoi_onboard_v1', 'skip:0');
    localStorage.setItem('mangoi_vcguide_off_v1', '1');   // 첫 방문 «수업 화면 안내» 가 덮지 않게(검사 환경)
  } catch (e) {} }, lang);
  await p.goto(`http://127.0.0.1:${PORT}/index.html?_nc=${Date.now()}`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(({ role, room }) => {
    window.vcMyRole = role;
    try { vcRoomId = room; } catch (e) {}
    // 수업 안내 그림(첫 방문 오버레이)이 덮으면 클릭이 안 닿습니다 — 닫아 둡니다.
    try { document.querySelectorAll('#vc-guide-overlay,.vcg-overlay').forEach((e) => e.remove()); } catch (e) {}
    try { window.showView('view-videocall-call'); } catch (e) {}
    document.body.classList.add('vc-in-call');
  }, { role, room: ROOM });
  await p.waitForTimeout(4200);   // 입장 뒤 1.5초부터 확인 + 응답
  // 📱 세로 폰은 «가로로 돌려주세요» 안내가 화면 전체를 덮습니다 — 사람이 «이대로 보기» 를 누르는 그 함수를 부릅니다.
  await p.evaluate(() => { try { window.vcNukeRotationOverlays && window.vcNukeRotationOverlays(); } catch (e) {} });
  await p.waitForTimeout(200);
  return { ctx, p };
}
async function clickFab(p) {
  const has = await p.evaluate(() => { const f = document.getElementById('vcq-fab'); return !!(f && getComputedStyle(f).display !== 'none'); });
  if (!has) return false;
  await p.evaluate(() => document.getElementById('vcq-fab').click());
  await p.waitForTimeout(700);
  return true;
}
const boxInfo = (p) => p.evaluate(() => {
  const b = document.getElementById('vch-box'); const pn = document.getElementById('vcq-panel');
  if (!b) return null;
  const r = b.getBoundingClientRect(), pr = pn.getBoundingClientRect();
  return { text: b.innerText, inPanel: r.left >= pr.left - 1 && r.right <= pr.right + 1, inView: r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1,
    first: pn.children[0] && pn.children[0].tagName, idx: [...pn.children].indexOf(b), h: Math.round(r.height), panelH: Math.round(pr.height) };
});

for (const [w, h] of [[1280, 900], [390, 844]]) {
  console.log(`\n① 강사 · 내 방 · KO (${w}×${h})`);
  MODE = 'ok'; portalHits = 0;
  let { ctx, p } = await open(w, h, 'teacher', 'ko');
  ok(portalHits === 1, '입장하면 포털을 «한 번» 묻는다', 'hits=' + portalHits);
  const dot = await p.evaluate(() => !!document.querySelector('#vcq-fab .vch-dot'));
  ok(dot, '💡 AI 질문 버튼에 🤝 표시가 붙는다');
  ok(await clickFab(p), '전제: AI 질문 버튼이 보이고 눌린다');
  const bi = await boxInfo(p);
  ok(!!bi, '패널 안에 인수인계 칸이 그려진다');
  if (bi) {
    ok(/지난 목표/.test(bi.text) && /past tense/.test(bi.text), '지난 목표 줄', bi.text);
    ok(/I go to school yesterday/.test(bi.text) && /I went to school yesterday/.test(bi.text) && /She has a dog/.test(bi.text), '아직 연습 안 한 문장 둘 다(고치기 전 → 고친 뒤)', bi.text);
    ok(/외 1개/.test(bi.text), '서버가 안 보낸 나머지는 «외 N개» 로', bi.text);
    ok(/4장 중 1장/.test(bi.text), '복습 카드 줄', bi.text);
    ok(!/NOT THIS STUDENT/.test(bi.text), '다른 학생(다른 방)의 인수인계는 안 섞인다', bi.text);
    ok(bi.inPanel, '패널 폭 안에 들어간다');
    ok(bi.inView, '화면 안에 들어간다', JSON.stringify(bi));
    ok(bi.idx > 0 && bi.idx <= 2, '패널 제목 바로 아래에 놓인다', 'idx=' + bi.idx);
  }
  // 가운데 줄 «맨 위» 가 그 칸인가 — 안 가려짐
  const top = await p.evaluate(() => { const b = document.getElementById('vch-box'); if (!b) return false; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(20, r.height / 2)); return !!(e && b.contains(e)); });
  const whoTop = await p.evaluate(() => { const b = document.getElementById('vch-box'); if (!b) return ''; const r = b.getBoundingClientRect(); return document.elementsFromPoint(r.left + r.width / 2, r.top + Math.min(20, r.height / 2)).slice(0, 4).map((e) => e.tagName + '#' + e.id + '.' + String(e.className).slice(0, 30) + ' z=' + getComputedStyle(e).zIndex).join(' | '); });
  ok(top, '그 칸 위에 다른 것이 덮여 있지 않다', whoTop);
  if (w === 1280) {
    console.log('\n② 🌐 EN 으로 바꾸면 영어로 다시 그린다');
    await p.evaluate(() => { try { localStorage.setItem('mangoi_lang', 'en'); window.setLang && window.setLang('en'); } catch (e) {} window.dispatchEvent(new CustomEvent('mangoi:lang-changed')); });
    await p.waitForTimeout(400);
    const t2 = (await boxInfo(p))?.text || '';
    ok(/Last goal/.test(t2) && /Not practiced yet/.test(t2) && /practiced 1 of 4/.test(t2), '영어 문구', t2);
  }
  await ctx.close();
}

console.log('\n③ 학생이면 포털을 아예 묻지 않는다(짝)');
MODE = 'ok'; portalHits = 0;
{ const { ctx, p } = await open(1280, 900, 'student', 'ko');
  ok(portalHits === 0, '학생 화면은 강사 포털을 부르지 않는다', 'hits=' + portalHits);
  ok(!(await p.evaluate(() => !!document.getElementById('vch-box'))), '학생 화면에는 인수인계 칸이 없다');
  await ctx.close(); }

console.log('\n④ 오늘 내 수업이 아닌 방이면 안 그린다');
MODE = 'other'; portalHits = 0;
{ const { ctx, p } = await open(1280, 900, 'teacher', 'ko');
  ok(!(await p.evaluate(() => !!document.querySelector('#vcq-fab .vch-dot'))), '🤝 표시가 없다');
  await clickFab(p);
  ok(!(await p.evaluate(() => !!document.getElementById('vch-box'))), '패널에도 인수인계 칸이 없다');
  await ctx.close(); }

console.log('\n⑤ 못 불러오면 지어내지 않고 사실대로 말한다');
MODE = 'fail'; portalHits = 0;
{ const { ctx, p } = await open(1280, 900, 'teacher', 'ko');
  ok(!(await p.evaluate(() => !!document.querySelector('#vcq-fab .vch-dot'))), '실패하면 🤝 표시를 안 붙인다');
  await clickFab(p);
  const t = (await boxInfo(p))?.text || '';
  ok(/불러오지 못했어요/.test(t), '«불러오지 못했어요» 라고 말한다', t);
  ok(portalHits >= 2, '버튼을 누르면 한 번 더 묻는다(재시도)', 'hits=' + portalHits);
  MODE = 'ok';
  await p.evaluate(() => { document.getElementById('vcq-fab').click(); });   // 닫기
  await p.waitForTimeout(300);
  await clickFab(p);
  await p.waitForTimeout(500);
  const t2 = (await boxInfo(p))?.text || '';
  ok(/past tense/.test(t2), '회선이 돌아오면 다시 열 때 채워진다', t2);
  await ctx.close(); }

await browser.close(); srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
