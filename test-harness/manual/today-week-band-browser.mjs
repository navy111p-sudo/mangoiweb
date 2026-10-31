// 📅 «이번 주 리듬 띠» 브라우저 실측 (2026-09-04)
//   왜: 사장님이 4안 중 «C(리듬 띠) + 오늘 칸만 B처럼 펼치기» 를 고르셨다. 바뀐 것은
//       «무슨 글자가·무슨 색으로 그려지는가» 뿐이라 문자열 하니스로는 못 본다.
//   무엇을: 서버 응답을 스텁으로 물려 실제로 그린 뒤 재는 것 —
//       ① 칸 7개 · 오늘 테두리 1칸  ② 수업일은 «🏫 + 시각», 집은 «N분»(옛 이모지 묶음이 아님)
//       ③ 수업일/집 배경색이 실제로 다르다(색이 곧 범례)  ④ 오늘 펼침이 도구 이름을 글자로
//       ⑤ 요약이 «센 값»(수업 2회 · AI 합계)  ⑥ 글자가 낱글자로 쪼개지지 않는다(줄 수)
//       ⑦ 가로 넘침 0  ⑧ 대비(WCAG) — 반투명 층은 «합성» 해서 잰다
//   자동으로 안 돈다(manual/) — 사람이 부른다:
//       PW_DIR=/tmp/pw node test-harness/manual/today-week-band-browser.mjs
//   전제: cd cloudflare-deploy/public && python3 -m http.server 8931
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const PW = process.env.PW_DIR || '/tmp/pw';
const require = createRequire(PW + '/node_modules/');
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8931';
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n, x !== undefined ? JSON.stringify(x) : ''); } };

/* 화·목 수업 · 오늘은 금요일(dow 5) 학생 — 아티팩트에서 사장님이 보신 그 값 */
const PLAN = {
  ok: true, uid: 'demo1', name: '민서', today: '2026-09-04', points_today: 10, ai_streak: 4,
  plan: {
    mode: 'home', phase: null, cls: null, band: 3, bandKo: '기초', bandEn: 'Basic', cefr: 'A2',
    textbook: 'BTS 3 Korea (My family)', totalMinutes: 22, doneCount: 0,
    levelKeys: { warmup: '3', aifriend: 'S3' },
    steps: [
      { key: 'speech', slot: 'home', icon: '🎤', ko: 'AI 음성코치', en: 'AI speech coach', url: '/speech-coach.html', minutes: 7, done: false, whyKo: '입을 풀어요', whyEn: 'Warm up your mouth' },
      { key: 'write', slot: 'home', icon: '✍️', ko: 'AI 글쓰기', en: 'AI writing', url: '/ai-write.html', minutes: 15, done: false, whyKo: '한 주에 한 번', whyEn: 'Once a week' },
    ],
    week: [
      { dow: 0, ko: '일', en: 'Sun', isClass: false, isToday: false, tools: ['friend', 'games'], start: null, minutes: 17 },
      { dow: 1, ko: '월', en: 'Mon', isClass: false, isToday: false, tools: ['friend', 'micro', 'judgment'], start: null, minutes: 17 },
      { dow: 2, ko: '화', en: 'Tue', isClass: true, isToday: false, tools: ['warmup', 'review', 'micro'], start: '19:00', minutes: 25 },
      { dow: 3, ko: '수', en: 'Wed', isClass: false, isToday: false, tools: ['friend', 'micro', 'judgment'], start: null, minutes: 17 },
      { dow: 4, ko: '목', en: 'Thu', isClass: true, isToday: false, tools: ['warmup', 'review', 'micro'], start: '19:00', minutes: 25 },
      { dow: 5, ko: '금', en: 'Fri', isClass: false, isToday: true, tools: ['speech', 'write'], start: null, minutes: 22 },
      { dow: 6, ko: '토', en: 'Sat', isClass: false, isToday: false, tools: ['speech', 'games'], start: null, minutes: 17 },
    ],
  },
};

/* 🔴 레벨 미배정 — 2026-09-04 운영 D1 실측 students_erp 29,475명 중 level 채워진 사람 «1명».
   즉 이것이 예외가 아니라 거의 모든 학생이 보는 화면이다. 띠의 오늘 칸(14분)과
   그 아래 펼침 상자(레벨테스트 10 + 친구 7 = 17분)가 어긋나던 자리라 반드시 함께 잰다. */
const PLAN_NOLV = JSON.parse(JSON.stringify(PLAN));
{
  const p = PLAN_NOLV.plan;
  p.mode = 'unassigned'; p.band = null; p.bandKo = null; p.bandEn = null; p.cefr = null;
  p.textbook = null; p.levelKeys = { warmup: null, aifriend: null };
  p.steps = [
    { key: 'leveltest', slot: 'first', icon: '🎯', ko: '레벨테스트', en: 'Level test', url: '/level-test-ai.html', minutes: 10, done: false, whyKo: '한 번만 보면 됩니다.', whyEn: 'Once is enough.' },
    { key: 'friend', slot: 'home', icon: '🤖', ko: 'AI 친구 대화', en: 'AI friend', url: '/ai-friend.html', minutes: 7, done: false, whyKo: '레벨 없이도 됩니다.', whyEn: 'Works without a level.' },
  ];
  p.totalMinutes = 17;
  p.week[5].tools = ['friend']; p.week[5].minutes = 17;   // 정본 todayFromSteps 가 맞춰 내려주는 값
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  /* ⛔ serviceWorkers 를 막지 않으면 «고쳐 놓고 다시 재도 옛 사본» 이 나온다(CLAUDE.md 2장).
     페이지 주소의 ?_nc= 는 /js/today-page.js?v=2 를 안 비켜 간다. */
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.route('**/api/student/today**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAN) }));
  await page.addInitScript(() => { try { localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'demo1', name: '민서' })); localStorage.setItem('mango_token', 'tok'); } catch (e) {} });
  await page.goto(BASE + '/today.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('#td-week .day', { timeout: 10000 });
  const w = vp.width;

  const s = await page.evaluate(() => {
    const days = [...document.querySelectorAll('#td-week .day')];
    const bg = el => getComputedStyle(el).backgroundColor;
    /* 반투명 층은 조상과 «합성» 해서 실제 색을 낸다 — 안 하면 멀쩡한 대비를 실패로 읽는다 */
    const solid = el => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n);
        let m = (c.backgroundColor || '').match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (!m && c.backgroundImage && c.backgroundImage !== 'none') m = c.backgroundImage.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (!m) continue;
        const a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (a === 0) continue;
        layers.push([+m[1], +m[2], +m[3], a]);
        if (a >= 1) break;
      }
      let out = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i--) { const [r, g, b, a] = layers[i]; out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)]; }
      return out;
    };
    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
    const ratio = (fg, bgc) => { const a = lum(fg) + .05, b = lum(bgc) + .05; return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100; };
    const fgOf = el => { const m = getComputedStyle(el).color.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]]; };
    /* 글자 상자의 줄 수 — 「낱글자로 쪼개짐」 함정 */
    const lines = el => {
      const r = document.createRange(); r.selectNodeContents(el);
      const n = new Set([...r.getClientRects()].map(x => Math.round(x.top))).size;
      return n || 1;
    };
    const box = document.getElementById('td-week-today');
    const sum = document.getElementById('td-week-sum');
    const cls = days.filter(d => d.classList.contains('cls'));
    const home = days.filter(d => !d.classList.contains('cls'));
    return {
      n: days.length,
      todayCount: days.filter(d => d.classList.contains('today')).length,
      todayIdx: days.findIndex(d => d.classList.contains('today')),
      clsText: cls.map(d => d.innerText.replace(/\s+/g, ' ').trim()),
      homeText: home.map(d => d.innerText.replace(/\s+/g, ' ').trim()),
      clsBg: bg(cls[0]), homeBg: bg(home[0]),
      /* 값 줄이 한 줄인가 — 좁은 칸에서 「19:」/「00」 으로 쪼개지면 안 된다 */
      /* ⚠️ 수업일 칸은 «🏫(block) / 19:00» 두 줄이 «정상» 이다 — .v 를 통째로 재면 늘 2가 나온다.
         쪼개짐(「19:」/「00」)을 보려면 «값 글자» 그 자체(마지막 텍스트 노드)를 재야 한다. */
      vLines: days.map(d => {
        const v = d.querySelector('.v');
        const tn = [...v.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
        if (!tn.length) return 1;
        const r = document.createRange(); r.selectNodeContents(tn[tn.length - 1]);
        return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size || 1;
      }),
      dLines: days.map(d => lines(d.querySelector('.d'))),
      boxShown: !!box && !box.hidden,
      boxTitle: box ? (box.querySelector('.t') || {}).textContent : '',
      boxItems: box ? [...box.querySelectorAll('li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()) : [],
      boxItemLines: box ? [...box.querySelectorAll('li')].map(li => lines(li)) : [],
      sumText: sum ? sum.innerText.replace(/\s+/g, ' ').trim() : '',
      legend: (document.getElementById('td-legend') || {}).textContent || '',
      overflow: document.documentElement.scrollWidth > innerWidth,
      /* 대비 — 수업일 칸 시각 글자 · 집 칸 분 수 · 펼침 상자 항목 */
      cr: {
        clsV: ratio(fgOf(cls[0].querySelector('.v')), solid(cls[0])),
        homeV: ratio(fgOf(home[0].querySelector('.v')), solid(home[0])),
        clsD: ratio(fgOf(cls[0].querySelector('.d')), solid(cls[0])),
        homeD: ratio(fgOf(home[0].querySelector('.d')), solid(home[0])),
        li: box && box.querySelector('li') ? ratio(fgOf(box.querySelector('li')), solid(box.querySelector('li'))) : null,
      },
    };
  });

  console.log(`\n[ ${w}px ]`);
  ok(`${w} 칸 7개 · 오늘 테두리는 금요일(5) 한 칸`, s.n === 7 && s.todayCount === 1 && s.todayIdx === 5, [s.n, s.todayCount, s.todayIdx]);
  ok(`${w} 수업일 칸은 «🏫 + 시각»`, s.clsText.length === 2 && s.clsText.every(t => t.includes('🏫') && t.includes('19:00')), s.clsText);
  ok(`${w} 집 칸은 «N분»`, s.homeText.length === 5 && s.homeText.every(t => /\d+분/.test(t)), s.homeText);
  ok(`${w} 옛 이모지 묶음(🗣️🧠⚡)이 칸에 없다`, ![...s.clsText, ...s.homeText].some(t => /🗣|🧠|⚡|🎮|🧭/.test(t)), [...s.clsText, ...s.homeText]);
  ok(`${w} 수업일과 집의 배경색이 실제로 다르다(색이 곧 범례)`, s.clsBg !== s.homeBg, [s.clsBg, s.homeBg]);
  ok(`${w} 칸 안 글자가 쪼개지지 않는다(요일·값 글자 모두 한 줄 — 🏫 는 블록이라 별개)`, s.vLines.every(n => n === 1) && s.dLines.every(n => n === 1), [s.dLines, s.vLines]);
  ok(`${w} 오늘 펼침이 보이고 «금요일 · 오늘»`, s.boxShown && /금/.test(s.boxTitle) && /오늘/.test(s.boxTitle), [s.boxShown, s.boxTitle]);
  ok(`${w} 펼침 항목이 도구 «이름» 을 글자로 적는다`, s.boxItems.length === 2 && /음성코치/.test(s.boxItems[0]) && /글쓰기/.test(s.boxItems[1]) && s.boxItems.every(t => /분/.test(t)), s.boxItems);
  ok(`${w} 펼침 항목이 3줄 이상으로 쪼개지지 않는다`, s.boxItemLines.every(n => n <= 2), s.boxItemLines);
  ok(`${w} 요약이 «센 값» — 수업 2회 · AI 140분(주간 합)`, /수업 2회/.test(s.sumText) && /140분/.test(s.sumText), s.sumText);
  ok(`${w} 안내가 «색» 을 설명한다(범례를 읽게 하지 않는다)`, /파란/.test(s.legend) && /초록/.test(s.legend), s.legend.slice(0, 40));
  ok(`${w} 가로 넘침 없음`, !s.overflow);
  ok(`${w} 대비 — 칸 글자 3.0 이상 · 펼침 항목 4.5 이상`,
    s.cr.clsV >= 3 && s.cr.homeV >= 3 && s.cr.clsD >= 3 && s.cr.homeD >= 3 && (s.cr.li == null || s.cr.li >= 4.5), s.cr);
  if (errs.length) console.log('     (JS 오류) ' + errs[0].slice(0, 120));
  await ctx.close();
}
/* ── 레벨 미배정(거의 전원) — 띠의 오늘 칸과 그 아래 상자가 «같은 말» 을 하는가 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.route('**/api/student/today**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAN_NOLV) }));
  await page.addInitScript(() => { try { localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'demo1', name: '민서' })); localStorage.setItem('mango_token', 'tok'); } catch (e) {} });
  await page.goto(BASE + '/today.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('#td-week .day', { timeout: 10000 });
  const s2 = await page.evaluate(() => {
    const days = [...document.querySelectorAll('#td-week .day')];
    const t = days.find(d => d.classList.contains('today'));
    const box = document.getElementById('td-week-today');
    return {
      todayText: t.innerText.replace(/\s+/g, ' ').trim(),
      items: [...box.querySelectorAll('li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()),
      sum: document.getElementById('td-week-sum').innerText.replace(/\s+/g, ' ').trim(),
    };
  });
  const mins = s2.items.map(t => Number((t.match(/(\d+)\s*분/) || [])[1] || 0));
  const sumMin = mins.reduce((a, b) => a + b, 0);
  const cellMin = Number((s2.todayText.match(/(\d+)\s*분/) || [])[1] || 0);
  console.log('\n[ 레벨 미배정 (거의 전원) ]');
  ok('미배정 — 오늘 칸 분 수 == 펼침 상자 항목 분 수의 합', cellMin === sumMin && cellMin === 17, [s2.todayText, mins]);
  ok('미배정 — 펼침 상자에 레벨테스트가 1번으로 나온다', /레벨테스트/.test(s2.items[0] || ''), s2.items);
  ok('미배정 — 요약이 그려진다(수업 2회 · AI N분)', /수업 2회/.test(s2.sum) && /분/.test(s2.sum), s2.sum);
  await ctx.close();
}

await browser.close();
console.log(`\n📅 today week band — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
