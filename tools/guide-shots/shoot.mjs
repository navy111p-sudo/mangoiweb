// 관리자 화면 캡처 — 「쉬운 사용법」 슬라이드에 넣을 큰 그림을 만든다.
//   실행:  PW_DIR=<playwright-core 받아 둔 곳> node tools/guide-shots/shoot.mjs <출력폴더> [ko|en]
//
// ⚠️ 실서비스(mangoi.ai)는 이 컨테이너의 프록시가 막는다. 그래서 배포될 파일 그대로를
//    로컬 정적서버(cloudflare-deploy/public)로 띄워 렌더한다. /api/** 는 전부 스텁이라
//    D1(개발·운영 공용 DB)에는 아무것도 닿지 않는다.
// ⚠️ 표에 «가짜 학생·가짜 금액» 을 넣지 않는다. 자료를 불러오기 전 화면 그대로 찍는다.
//    (안내서에 실제가 아닌 숫자가 들어가면 그게 사실로 읽힌다)
import { openAdmin, BASE } from './_shot.mjs';
import { mkdirSync } from 'node:fs';

const OUT  = process.argv[2] || '/tmp/shots';
const LANG = (process.argv[3] === 'en') ? 'en' : 'ko';
const EN   = LANG === 'en';
const T = (ko, en) => (EN ? en : ko);
mkdirSync(OUT, { recursive: true });

const W = 1600, H = 1000;
const SIDEBAR = { x: 0,   y: 0, width: 408,  height: H };
const MAIN    = { x: 408, y: 0, width: W-408, height: H };

const { browser, ctx, page } = await openAdmin({ width: W, height: H, dsr: 2, lang: LANG, settle: 5200 });

const shot = async (name, clip, wait=700) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
  console.log('  ✓', name);
};

/** 사이드바 항목(자식)을 눌러 카드를 연 뒤, 카드 머리를 화면 맨 위로 올린다. */
async function openCard(id){
  await page.evaluate((id) => {
    if (typeof window.jumpToMenu === 'function') window.jumpToMenu(id);
  }, id);
  await page.waitForTimeout(1500);
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('ia6-hide','rbac-hide');
    if (el.tagName === 'DETAILS') el.open = true;
    const first = el.querySelector('details.sub-item');   // 첫 칸을 펴야 «무엇을 하는 곳인지» 보인다
    if (first) first.open = true;
    el.scrollIntoView({ block:'start' });
    window.scrollBy(0, -14);
  }, id);
  await page.waitForTimeout(1300);
}

console.log('▶ 캡처 —', LANG, '→', OUT);

// ① 홈 — 사이드바 + 본문 위쪽 (한 장)
await page.evaluate(() => window.scrollTo(0,0));
await shot('home', null, 1200);

// ② 사이드바 세 단계 — 「강사 ▸ 급여 ▸ 손자 2개」
await page.evaluate(() => {
  const h = [...document.querySelectorAll('#ph85-sidebar .ph85-group[data-ia6] .ph85-head')]
    .find(e => /강사|Teacher/.test(e.textContent));
  if (h) h.click();
});
await page.waitForTimeout(900);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('#ph85-sidebar .ph85-group[data-ia6] .ph85-sub')]
    .find(e => /급여|Payroll|Salar/.test(e.textContent));
  if (s) s.click();
});
await page.waitForTimeout(1400);
// 「강사」 묶음이 맨 위에 오도록 사이드바만 스크롤 — 손자 두 줄까지 한 화면에 담는다
await page.evaluate(() => {
  const sb = document.getElementById('ph85-sidebar');
  const h = [...document.querySelectorAll('#ph85-sidebar .ph85-group[data-ia6] .ph85-head')]
    .find(e => /강사|Teacher/.test(e.textContent));
  if (sb && h) sb.scrollTop += h.getBoundingClientRect().top - sb.getBoundingClientRect().top - 86;
});
await shot('sidebar3', { x:0, y:0, width:408, height:760 }, 900);

// ③ 메뉴 검색
await page.evaluate(() => {
  const s = [...document.querySelectorAll('#ph85-sidebar .ph85-group[data-ia6] .ph85-head')]
    .find(e => /강사|Teacher/.test(e.textContent));
  if (s) s.click();                                    // 열었던 묶음 접기
});
await page.waitForTimeout(700);
try {
  await page.click('#ph85-sidebar input');
  await page.type('#ph85-sidebar input', T('급여','pay'), { delay: 110 });
} catch {}
await page.evaluate(() => { const sb=document.getElementById('ph85-sidebar'); if(sb) sb.scrollTop=0; });
await shot('search', SIDEBAR, 1500);
await page.evaluate(() => {
  const i = document.querySelector('#ph85-sidebar input');
  if (i) { i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); }
});
await page.waitForTimeout(700);

// ④ 본문 위쪽 — 자주 쓰는 기능 + 통합 검색
await page.evaluate(() => window.scrollTo(0,0));
await shot('quick', MAIN, 900);

// ⑤ 카드들 — 본문만 크게
for (const [id, name] of [
  ['card-active-rooms',   'today'],
  ['card-students-mgmt',  'students'],
  ['card-teacher-mgmt',   'teachers'],
  ['card-payroll-auto',   'payroll'],
  ['card-eval-mgmt',      'eval'],
  ['card-poster-maker',   'poster'],
  ['card-accounting-mgmt','accounting'],
  ['card-lib-admin',      'library'],
  ['card-permissions',    'permissions'],
  ['card-level-tests',    'leveltest'],
]) {
  await openCard(id);
  await shot(name, MAIN, 500);
}

// ⑦ 내 정보 · 로그아웃 — 오른쪽 위 사용자 버튼을 누르면 나오는 창
await page.evaluate(() => { if (typeof window.ph115OpenModal === 'function') window.ph115OpenModal(); });
await shot('usermenu', null, 1500);

await browser.close();

// ⑦ 다른 문서들 — 로그인 · 메뉴 지도 · 마이페이지
for (const [path, name, size] of [
  ['/admin/login.html',                'login',   [1400, 900]],
  ['/admin/site-structure-map.html',   'map',     [1600, 1000]],
  ['/admin/mypage.html',               'mypage',  [1400, 900]],
]) {
  const { browser: b, page: p } = await openAdmin({ width:size[0], height:size[1], dsr:2, lang:LANG, settle:600 });
  await p.goto(BASE + path, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(3200);
  await p.evaluate(() => { ['#aw-overlay','.aw-overlay'].forEach(s=>document.querySelectorAll(s).forEach(e=>e.remove())); window.scrollTo(0,0); });
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  ✓', name);
  await b.close();
}
console.log('✅ 끝');
