// 📅 «오늘의 A.i 학습» 입구 — 브라우저 실측 (2026-09-04)
//   왜: 이 저장소는 「코드에는 입구가 셋인데 화면에서는 전부 죽어 있던」 사고를 낸 적이 있다
//       (CLAUDE.md 2장 「기능이 있는데 아무도 못 씀」). 그래서 «있는가» 가 아니라
//       «보이는가 · 눌리는가 · 정말 그리로 가는가» 를 그려서 잰다.
//   무엇을: ① 로그인한 학생의 홈 큰 버튼(#hero-member)이 「오늘의 A.i 학습」이고 실제로 이동하는가
//          ② 드로어 「AI 학습 도구」 «맨 위» 인가 · 그 아래 도구 8종이 그대로인가
//          ③ 「학습 공간」에는 «안» 넣었는가(성격이 다르다 — 거기는 한 번씩 하는 학원 업무)
//          ④ 비회원 화면은 종전 그대로인가(무료 체험 신청 / 강사 둘러보기)
//          ⑤ 되돌아가는 길 — /today.html 꼬리말 → ?menu=aitools → 도구 목록이 «실제로» 열리는가
//   ⚠️ 검사마다 «새 컨텍스트» 를 쓴다 — 한 검사의 실패가 다음 검사를 연쇄로 무너뜨리면
//      「화면이 깨졌다」로 오독한다(실제로 한 번 밟았다: 클릭 대기가 짧아 실패 → goBack 이
//      엉뚱한 곳으로 → 드로어를 «못 찾음» 으로 보고).
//   ⚠️ 로그인 판정은 mango_token 의 payload 를 base64url 로 «파싱» 한다(index.html loggedIn()).
//      'tok' 같은 가짜 값을 넣으면 비회원으로 떨어져 엉뚱한 화면을 재게 된다.
//   자동으로 안 돈다(manual/) — 사람이 부른다:
//       PW_DIR=/tmp/pw node test-harness/manual/today-entry-browser.mjs
//   전제: cd cloudflare-deploy/public && python3 -m http.server 8931
import { createRequire } from 'node:module';
const require = createRequire((process.env.PW_DIR || '/tmp/pw') + '/node_modules/');
const { chromium } = require('playwright-core');
const B = process.env.BASE || 'http://127.0.0.1:8931';
/* 30일 뒤 만료 + uid 가 든 진짜 «모양» 의 토큰 (서명은 서버가 검증하므로 화면 판정에는 무관) */
const TOK = Buffer.from(JSON.stringify({ uid: 'demo1', exp: Date.now() + 30 * 86400000 }))
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.sig';
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n, x !== undefined ? JSON.stringify(x) : ''); } };
/* /today.html 은 서버가 준 plan 이 있어야 본문(#td-main)을 그린다 — 스텁이 없으면 꼬리말이
   0x0 이 되어 「무언가 덮고 있다」로 오독한다(2026-09-04 실제로 밟았다). */
const PLAN = { ok: true, uid: 'demo1', name: '민서', today: '2026-09-04', points_today: 0, ai_streak: 1, plan: {
  mode: 'home', phase: null, cls: null, band: 3, bandKo: '기초', bandEn: 'Basic', cefr: 'A2',
  textbook: null, totalMinutes: 12, doneCount: 0, levelKeys: { warmup: '3', aifriend: 'S3' },
  steps: [{ key: 'friend', slot: 'home', icon: '🤖', ko: 'AI 친구 대화', en: 'AI friend', url: '/ai-friend.html', minutes: 7, done: false, whyKo: 'x', whyEn: 'x' },
          { key: 'micro', slot: 'home', icon: '⚡', ko: 'AI 단어 퀴즈', en: 'AI vocab quiz', url: '/micro-quiz.html', minutes: 5, done: false, whyKo: 'x', whyEn: 'x' }],
  week: [0,1,2,3,4,5,6].map(d => ({ dow: d, ko: '일월화수목금토'[d], en: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d],
    isClass: false, isToday: d === 5, tools: ['friend','micro'], start: null, minutes: 12 })) } };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function home(vp, logged) {
  const ctx = await b.newContext({ viewport: vp, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[],"results":[]}' }));
  await p.addInitScript(([t, l]) => {
    try {
      if (l) { localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'demo1', name: '민서' })); localStorage.setItem('mango_token', t); }
      /* 🔴 첫 방문자 안내(#mangoi-onboard, z-index 99990)를 «본 것으로» 표시한다.
         빈 브라우저는 언제나 «첫 방문자» 라 그 오버레이가 화면 전체를 덮는다. 「건너뛰기」를
         눌러 치우는 방식은 «가끔 안 닫힌 회차» 가 생겨(5회 중 1회 실측) 멀쩡한 버튼이
         「가려졌다」로 나온다 — 실제 학생은 한 번 닫으면 다시 안 본다.
         키는 js/idx-onboard.js 의 KEY. 관리자 #aw-overlay 와 같은 사정(CLAUDE.md 2장). */
      localStorage.setItem('mangoi_onboard_v1', 'seen:' + Date.now());
    } catch (e) {}
  }, [TOK, logged]);
  await p.goto(B + '/index.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  /* 첫 방문자 안내가 화면을 덮는다 — 실제 좌표로 「건너뛰기」를 눌러 치운다(관리자 #aw-overlay 와 같은 사정) */
  for (let i = 0; i < 6; i++) {
    const box = await p.evaluate(() => {
      const e = [...document.querySelectorAll('button,a,[role="button"]')].find(x => /^건너뛰기$/.test((x.textContent || '').trim()) && x.offsetParent);
      if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!box) break;
    await p.mouse.click(box.x, box.y); await p.waitForTimeout(400);
  }
  /* ⚠️ 안내가 «사라지는 중» 에 재면 멀쩡한 버튼이 「가려졌다」로 나온다(2026-09-04 실측:
     따로 6번 돌리면 6/6 정상인데 이 검사에서만 간헐 실패했다). 실제로 맨 위가 될 때까지 기다린다.
     ⛔ 그냥 waitForTimeout 을 늘려서 덮지 말 것 — 진짜로 가려진 경우와 구별이 안 된다. */
  if (logged) {
    for (let i = 0; i < 20; i++) {
      const ready = await p.evaluate(() => {
        const x = [...document.querySelectorAll('#hero-member button')].find(e => /오늘의 A\.i 학습/.test(e.textContent || ''));
        if (!x) return false;
        const r = x.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return t === x || x.contains(t);
      });
      if (ready) break;
      await p.waitForTimeout(250);
    }
  }
  return { ctx, p };
}

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  const w = vp.width;
  console.log(`\n[ ${w}px · 로그인한 학생 ]`);

  { // ① 홈 큰 버튼
    const { ctx, p } = await home(vp, true);
    const h = await p.evaluate(() => {
      const m = document.getElementById('hero-member'), g = document.getElementById('hero-guest');
      const vis = e => !!e && getComputedStyle(e).display !== 'none' && !!e.offsetParent;
      const btns = m ? [...m.querySelectorAll('button')].map(x => {
        const r = x.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        /* 실패했을 때 «무엇이 덮었나» 를 반드시 남긴다 — 안 남기면 다음 사람이 또 헤맨다 */
        let by = null;
        if (!(t === x || x.contains(t)) && t) {
          const path = []; for (let n = t; n && path.length < 4; n = n.parentElement)
            path.push(n.tagName + (n.id ? '#' + n.id : '') + (n.className ? '.' + String(n.className).split(' ')[0] : ''));
          by = path.join(' < ') + ' | z=' + getComputedStyle(t).zIndex + ' pos=' + getComputedStyle(t).position;
        }
        return { t: (x.textContent || '').replace(/\s+/g, ' ').trim(), y: Math.round(r.top),
                 onTop: t === x || x.contains(t), inView: r.top >= 0 && r.bottom <= innerHeight, coveredBy: by };
      }) : [];
      return { member: vis(m), guest: vis(g), btns };
    });
    ok(`${w} 로그인 학생에게 회원 버튼 줄이 보인다(비회원 줄은 숨음)`, h.member && !h.guest, h);
    const plan = h.btns.find(x => /오늘의 A\.i 학습/.test(x.t));
    ok(`${w} 홈 큰 버튼에 「오늘의 A.i 학습」이 있다`, !!plan, h.btns.map(x => x.t));
    ok(`${w} 그 버튼이 «화면 안» + «맨 위»(가려지지 않음)`, !!plan && plan.onTop && plan.inView, plan);
    ok(`${w} 「수업 입장」은 그대로 남아 있다`, h.btns.some(x => /수업 입장/.test(x.t)), h.btns.map(x => x.t));
    /* «있다» 와 «정말 그리로 간다» 는 다르다 — 실제 좌표로 눌러 이동을 기다린다 */
    if (plan) {
      /* ⚠️ 좌표 클릭은 «화면이 아직 움직이는 중» 이면 헛나간다(첫 방문자 안내가 사라지는 중 등).
         클릭 «직전» 에 그 자리의 맨 위가 그 버튼인지 확인하고, 아니면 한 번 더 기다린다.
         ⛔ el.click() 으로 바꾸지 말 것 — 그러면 «가려져 있어도» 통과해서 검사의 뜻이 사라진다. */
      let went = false;
      for (let try_ = 0; try_ < 3 && !went; try_++) {
        const c = await p.evaluate(() => {
          const x = [...document.querySelectorAll('#hero-member button')].find(e => /오늘의 A\.i 학습/.test(e.textContent || ''));
          if (!x) return null;
          const r = x.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const t = document.elementFromPoint(cx, cy);
          return { x: cx, y: cy, ready: t === x || x.contains(t) };
        });
        if (!c || !c.ready) { await p.waitForTimeout(700); continue; }
        await p.mouse.click(c.x, c.y);
        try { await p.waitForURL(/\/today\.html/, { timeout: 6000 }); went = true; } catch (e) { await p.waitForTimeout(500); }
      }
      ok(`${w} 눌렀더니 /today.html 로 간다`, went, p.url());
    }
    await ctx.close();
  }

  { // ②③ 드로어 — 새 컨텍스트(앞 검사와 엮이지 않게)
    const { ctx, p } = await home(vp, true);
    const d = await p.evaluate(() => {
      const accs = [...document.querySelectorAll('details.mg-acc')];
      const pick = re => accs.find(x => re.test((x.querySelector('summary') || {}).textContent || ''));
      const tools = pick(/AI 학습 도구/), space = pick(/학습 공간/);
      if (tools) tools.open = true;
      const list = el => el ? [...el.querySelectorAll('.mg-acc-body button')].map(x => (x.textContent || '').replace(/\s+/g, ' ').trim()) : null;
      return { groups: accs.length, tools: list(tools), space: list(space) };
    });
    ok(`${w} 드로어 묶음 셋이 그대로(학습 공간 · AI 학습 도구 · 계정 및 결제)`, d.groups === 3, d.groups);
    ok(`${w} 「AI 학습 도구」 «맨 위» 가 「📅 오늘의 A.i 학습」`, !!d.tools && /오늘의 A\.i 학습/.test(d.tools[0] || ''), d.tools);
    ok(`${w} 그 아래 도구가 그대로 남아 있다(8종 이상)`, !!d.tools && d.tools.length >= 9, d.tools ? d.tools.length : null);
    ok(`${w} 「학습 공간」에는 «안» 넣었다 — 거기는 한 번씩 하는 학원 업무다`,
      !!d.space && !d.space.some(t => /오늘의 A\.i 학습/.test(t)), d.space);
    await ctx.close();
  }
}

console.log('\n[ 390px · 비회원 — 아무것도 안 바뀌어야 한다 ]');
{
  const { ctx, p } = await home({ width: 390, height: 844 }, false);
  const g = await p.evaluate(() => {
    const gg = document.getElementById('hero-guest'), m = document.getElementById('hero-member');
    const vis = e => !!e && getComputedStyle(e).display !== 'none' && !!e.offsetParent;
    return { guest: vis(gg), member: vis(m), txt: gg ? [...gg.querySelectorAll('button')].map(x => (x.textContent || '').replace(/\s+/g, ' ').trim()) : [] };
  });
  ok('비회원은 종전대로 「무료 체험 신청 / 강사 둘러보기」', g.guest && !g.member && g.txt.some(t => /무료 체험/.test(t)), g);
  await ctx.close();
}

console.log('\n[ 되돌아가는 길 — 도구 목록을 없앤 것이 아니다 ]');
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  /* ⚠️ route 는 «나중에 등록한 것» 이 이긴다 — 포괄을 먼저 깔고 구체적인 것을 뒤에(CLAUDE.md 2장).
     반대로 두면 포괄이 전부 삼켜 「화면이 못 채운다」는 거짓 실패가 난다. */
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[],"results":[]}' }));
  await p.route('**/api/student/today**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAN) }));
  await p.addInitScript(t => { try { localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'demo1', name: '민서' })); localStorage.setItem('mango_token', t); } catch (e) {} }, TOK);
  await p.goto(B + '/today.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.foot a[href*="aitools"]', { timeout: 10000 });
  await p.evaluate(() => document.querySelector('.foot a[href*="aitools"]').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(500);
  const f = await p.evaluate(() => {
    const a = document.querySelector('.foot a[href*="aitools"]');
    if (!a) return null; const r = a.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    /* ⚠️ 크기 0 을 «덮였다» 로 읽지 말 것 — 본문이 안 그려진 것과 가려진 것은 다른 사실이다 */
    return { t: (a.textContent || '').trim(), href: a.getAttribute('href'), onTop: t === a || a.contains(t),
             w: Math.round(r.width), h: Math.round(r.height) };
  });
  ok('today.html 꼬리말이 실제로 그려진다(크기 0 이 아니다)', !!f && f.w > 40 && f.h > 8, f);
  ok('today.html 꼬리말이 «안내 글» 이 아니라 누를 수 있는 링크다', !!f && /전부 보기/.test(f.t) && f.onTop, f);
  await p.goto(B + '/index.html?menu=aitools&_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3200);   // 그 블록은 준비될 때까지 최대 6초 기다렸다 한 번 부른다
  const ov = await p.evaluate(() => {
    const o = document.getElementById('ai-friends-ov');
    return { exists: !!o, shown: !!o && getComputedStyle(o).display !== 'none', items: o ? o.querySelectorAll('a,button').length : 0,
             urlCleaned: !/menu=aitools/.test(location.search) };
  });
  ok('?menu=aitools 로 AI 도구 목록이 «실제로» 열린다', ov.exists && ov.shown && ov.items >= 6, ov);
  ok('열고 나서 주소를 정리한다(새로고침·뒤로가기에 다시 안 열림)', ov.urlCleaned, ov);
  await ctx.close();
}
await b.close();
console.log(`\n📅 오늘의 A.i 학습 입구 — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
