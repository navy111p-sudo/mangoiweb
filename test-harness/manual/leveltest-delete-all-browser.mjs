/* 🗑️ 레벨테스트 「보이는 항목 전체 삭제」 버튼 — 실제 Chromium 에 그려서 확인.
   ① 본사가 아니면 안 보인다 ② 본사면 보인다 ③ 필터를 걸면 «보이는 것만» 대상이 된다 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/mangoiweb/cloudflare-deploy/public';
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8' };

const APPS = [
  { id: 101, student_name:'김수',  student_uid:'kim4545', status:'confirmed', created_at: 3, assigned_teacher:'Teacher Jane' },
  { id: 102, student_name:'김장',  student_uid:'kim3434', status:'proposed',  created_at: 2, assigned_teacher:'Teacher Jenny' },
  { id: 103, student_name:'paul7038', student_uid:'jeong', status:'cancelled', created_at: 1, assigned_teacher:'Teacher Kaye' },
];

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/admin/leveltest/applications') {
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end(JSON.stringify({ ok:true, items: APPS, pending: 1 }));
  }
  if (u.pathname.startsWith('/api/')) { res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{"ok":true}'); }
  let f = path.join(ROOT, u.pathname === '/' ? '/index.html' : u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(8901, r));

const browser = await chromium.launch({ executablePath: process.env.CHROME, args:['--no-sandbox'] });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); c ? pass++ : fail++; };

async function open(role) {
  const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await ctx.newPage();
  await page.addInitScript(([r]) => {
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid:'tester', name:'테스터', role:r }));
    localStorage.setItem('mangoi_admin_welcome_v1_done','1');   // 환영 오버레이가 스크롤·클릭을 막는다
  }, [role]);
  await page.goto('http://127.0.0.1:8901/admin.html', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(3500);                       // defer 스크립트가 다 붙을 때까지
  await page.evaluate(async () => { await window.loadLeveltestApps(); });
  /* 관리자 화면은 카드를 한 번에 하나만 보여준다(.ia6-hide) + <details> 로 접혀 있다.
     실제 사용자는 메뉴를 눌러 여는 자리이므로, 검사에서도 그 «열린 상태» 를 만들어 준다.
     ⚠️ 버튼 자체의 display 는 우리 코드가 정하지만, «보인다» 는 조상까지 걸린다. */
  await page.evaluate(() => {
    const btn = document.getElementById('lt-delete-all-btn');
    for (let el = btn; el; el = el.parentElement) {
      if (el.tagName === 'DETAILS') el.open = true;
      if (el.classList) el.classList.remove('ia6-hide', 'rbac-hide', 'ph85-shide');
      if (el.style && el.style.display === 'none') el.style.display = '';
    }
  });
  await page.waitForTimeout(600);
  return { ctx, page };
}
const shown = (page) => page.evaluate(() => {
  const b = document.getElementById('lt-delete-all-btn');
  return b ? getComputedStyle(b).display !== 'none' : null;
});

console.log('\n① 강사 계정(role=teacher) — 버튼이 없어야 한다');
{
  const { ctx, page } = await open('teacher');
  ok((await shown(page)) === false, '강사에게는 「전체 삭제」 버튼이 안 보인다');
  ok((await page.locator('#leveltest-apps-table tr').count()) === 3, '표는 3줄 그려졌다(버튼만 감춘 것)');
  await ctx.close();
}

console.log('\n② 본사 계정(role=hq_exec) — 버튼이 보이고, 누르면 3건이 대상');
{
  const { ctx, page } = await open('hq_exec');
  ok((await shown(page)) === true, '본사에게는 「전체 삭제」 버튼이 보인다');
  const box = await page.locator('#lt-delete-all-btn').boundingBox();
  const top = await page.evaluate(() => {
    const b = document.getElementById('lt-delete-all-btn').getBoundingClientRect();
    return document.elementsFromPoint(b.x + b.width/2, b.y + b.height/2)[0]?.id || '';
  });
  ok(!!box && box.width > 0, `버튼이 실제 크기를 갖는다 (${box && Math.round(box.width)}×${box && Math.round(box.height)})`);
  ok(top === 'lt-delete-all-btn', `버튼이 맨 위에 있어 눌린다 (실제 맨 위: ${top || '없음'})`);

  let sentIds = null;
  await page.route('**/api/admin/leveltest/applications', async (route) => {
    if (route.request().method() === 'DELETE') {
      sentIds = JSON.parse(route.request().postData() || '{}').ids;
      return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, deleted:sentIds }) });
    }
    return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, items:[], pending:0 }) });
  });
  page.on('dialog', d => d.accept());
  await page.click('#lt-delete-all-btn');
  await page.waitForFunction(() => true);
  await page.waitForTimeout(600);
  ok(JSON.stringify(sentIds) === JSON.stringify([101,102,103]), `필터 없음 → 3건 전부 보냄 (보낸 값: ${JSON.stringify(sentIds)})`);
  await ctx.close();
}

console.log('\n③ 필터를 걸면 «보이는 것만» 지워야 한다 (상태=취소 → 1건)');
{
  const { ctx, page } = await open('hq_exec');
  await page.selectOption('#lt-apps-status', 'cancelled');
  await page.waitForTimeout(300);
  ok((await page.locator('#leveltest-apps-table tr').count()) === 1, '표가 1줄로 좁혀졌다');
  let sentIds = null;
  await page.route('**/api/admin/leveltest/applications', async (route) => {
    if (route.request().method() === 'DELETE') {
      sentIds = JSON.parse(route.request().postData() || '{}').ids;
      return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, deleted:sentIds }) });
    }
    return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, items:[], pending:0 }) });
  });
  page.on('dialog', d => d.accept());
  await page.click('#lt-delete-all-btn');
  await page.waitForTimeout(600);
  ok(JSON.stringify(sentIds) === JSON.stringify([103]), `보이는 1건만 보냄 (보낸 값: ${JSON.stringify(sentIds)})`);
  await ctx.close();
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
await browser.close(); srv.close();
process.exit(fail ? 1 : 0);
