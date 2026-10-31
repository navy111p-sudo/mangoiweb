// 📸 «오늘의 A.i 학습» 사용 설명서 그림 만들기 (2026-10-10)
//   실제 화면(today.html)을 스텁 데이터로 그려, 화살표·번호를 SVG 로 얹고 잘라 저장한다.
//   ⚠️ 화면이 바뀌면 이것을 다시 돌려 그림을 갈아 끼우고 js/today-guide.js 의 IMG_V 를 올린다.
//   자동으로 안 돈다(manual/) — 사람이 부른다:
//       cd cloudflare-deploy/public && python3 -m http.server 8941
//       node test-harness/manual/today-guide-capture.mjs cloudflare-deploy/public/img/today-guide
//   (playwright-core 는 /tmp/pw/node_modules 에 있어야 한다)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/tmp/pw/node_modules/');
const { chromium } = require('playwright-core');
const B = 'http://127.0.0.1:8941';
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const TOK = Buffer.from(JSON.stringify({ uid: 'minseo', exp: Date.now() + 30 * 86400000 })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.sig';
const st = (key, slot, icon, ko, en, min, done, whyKo, whyEn) => ({ key, slot, icon, ko, en, url: '/x.html', minutes: min, done, whyKo, whyEn });
const PLAN = { ok: true, uid: 'minseo', name: '민서', today: '2026-10-13', points_today: 15, ai_streak: 3, plan: {
  mode: 'class', phase: 'before', cls: { start: '17:00' }, band: 3, bandKo: '기초', bandEn: 'Basic', cefr: 'A2',
  textbook: 'BTS 3', totalMinutes: 35, doneCount: 1, levelKeys: {},
  steps: [
    st('warmup', 'before', '🗣️', 'A.i 말하기 연습', 'A.i Speaking Practice', 10, true, '17:00 수업 전에 10분. 오늘 배울 문장으로 입을 풀어요.', "10 minutes before your 17:00 class — warm up with today's sentences."),
    st('review', 'after', '🧠', 'BTS/SIU 퀴즈', 'BTS/SIU quiz', 10, false, '수업이 끝난 직후가 제일 잘 남아요. 오늘 배운 것을 바로 물어봅니다.', 'Right after class is when it sticks — quiz on what you just learned.'),
    st('scene', 'home', '✍️', '교재 낱말 쓰기 숙제', 'Textbook word writing', 10, false, '쓰기 숙제 10분. 내 교재 낱말을 그림 보고 영어로 써요.', 'Writing homework, 10 minutes — see the picture, write your textbook words.'),
    st('micro', 'home', '⚡', 'AI 단어 퀴즈', 'AI word quiz', 5, false, '집에서 5분. 오늘 틀린 단어를 한 번 더 만나요.', "5 minutes at home — meet today's missed words once more.")],
  week: [0, 1, 2, 3, 4, 5, 6].map(d => ({ dow: d, ko: '일월화수목금토'[d], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d],
    isClass: d === 2 || d === 4, isToday: d === 2, start: (d === 2 || d === 4) ? '17:00' : null, minutes: d === 0 ? 0 : (d === 2 || d === 4 ? 35 : 15) })) } };

/* 표시: [{sel, nth, pad, n, from:[dx,dy]}] — 상자 + 번호 + 화살표 */
const SLIDES = [
  { name: '1-top', clip: { sel: '#td-hello', up: 1, pad: 10, extraB: 76 }, marks: [{ sel: ['#td-prog', '#td-prog-t'], n: 1, from: [0, 44], pad: 6 }] },
  { name: '2-order', clip: { sel: '#td-steps', pad: 10, maxH: 300, top: '#td-h-steps' }, marks: [
      { sel: '#td-steps .step:nth-child(1) .no', pad: 4, box: true },
      { sel: '#td-steps .step:nth-child(2) .no', pad: 4, box: true },
      { sel: '#td-steps .step:nth-child(1) .slot', n: 1, from: [80, 0], pad: 3 },
      { sel: '#td-steps .step:nth-child(2) .slot', n: 2, from: [80, 0], pad: 3 }] },
  { name: '3-start', clip: { sel: '#td-steps .step:nth-child(2)', pad: 12 }, marks: [{ sel: '#td-steps .step:nth-child(2) .go', n: 1, from: [130, 10], pad: 5 }] },
  { name: '4-done', clip: { sel: '#td-steps .step:nth-child(1)', pad: 12 }, marks: [
      { sel: '#td-steps .step:nth-child(1) .ok', n: 1, from: [-70, 0], pad: 5 },
      { sel: '#td-steps .step:nth-child(1) .no', pad: 4, box: true }] },
  { name: '5-week', clip: { sel: '#td-week', pad: 12, extraT: 70 }, marks: [
      { sel: '#td-week .day:nth-child(3)', n: 1, from: [0, -55], pad: 3 },
      { sel: '#td-week .day:nth-child(6)', n: 2, from: [0, -55], pad: 3 }] },
  { name: '6-tools', clip: { sel: '.foot', pad: 12, extraB: 82 }, marks: [{ sel: '.foot a', n: 1, from: [0, 52], shift: 152, pad: 5 }] },
  { name: '7-help', clip: { sel: '.top', pad: 0, extraB: 90 }, marks: [{ sel: '#td-guide-btn', n: 1, from: [-90, 0], pad: 5 }] },
];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
for (const lang of ['ko', 'en']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('**/api/**', r => {
    const u = r.request().url();
    if (/\/api\/student\/today/.test(u) && !/goal=|fixcards=/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAN) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[],"cards":[]}' });
  });
  await p.addInitScript(([t, l]) => {
    localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'minseo', name: '민서' }));
    localStorage.setItem('mango_token', t); localStorage.setItem('mangoi_lang', l);
    localStorage.setItem('mangoi_today_guide_v1', 'seen'); localStorage.setItem('mangoi_today_intro_v1', 'closed');
  }, [TOK, lang]);
  await p.goto(B + '/today.html?_nc=' + Date.now(), { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  for (const s of SLIDES) {
    const clip = await p.evaluate(({ s }) => {
      document.querySelectorAll('.__ann').forEach(e => e.remove());
      const R1 = (sel) => { const e = document.querySelector(sel); if (!e) throw new Error('no ' + sel); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
      const R = (sel) => { if (!Array.isArray(sel)) return R1(sel); const rs = sel.map(R1); const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y)); return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y }; };
      let c = R(s.clip.sel);
      if (s.clip.up) { const e = document.querySelector(s.clip.sel).closest('.card'); const r = e.getBoundingClientRect(); c = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; }
      if (s.clip.top) { const t = R(s.clip.top); c.h += c.y - t.y; c.y = t.y; }
      const pad = s.clip.pad || 0;
      let x = c.x - pad, y = c.y - pad - (s.clip.extraT || 0), w = c.w + pad * 2, h = c.h + pad * 2 + (s.clip.extraT || 0) + (s.clip.extraB || 0);
      if (s.clip.maxH) h = Math.min(h, s.clip.maxH + (s.clip.top ? 40 : 0));
      x = Math.max(0, x); w = Math.min(document.documentElement.clientWidth - x, w);
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', '__ann');
      const H = document.documentElement.scrollHeight;
      svg.setAttribute('style', `position:absolute;left:0;top:0;width:${document.documentElement.clientWidth}px;height:${H}px;z-index:99999;pointer-events:none;overflow:visible`);
      document.body.appendChild(svg);
      const add = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); svg.appendChild(e); return e; };
      for (const m of s.marks) {
        const r = R(m.sel), pd = m.pad || 4;
        add('rect', { x: r.x - pd, y: r.y - pd, width: r.w + pd * 2, height: r.h + pd * 2, rx: 10, fill: 'none', stroke: '#fff', 'stroke-width': 7, opacity: .9 });
        add('rect', { x: r.x - pd, y: r.y - pd, width: r.w + pd * 2, height: r.h + pd * 2, rx: 10, fill: 'none', stroke: '#ff2d6f', 'stroke-width': 4 });
        if (m.box || !m.from) continue;
        const cx = r.x + r.w / 2 + (m.shift || 0), cy = r.y + r.h / 2;
        // 끝점: 상자 테두리 바깥쪽(화살표 방향)
        const [dx, dy] = m.from; const sx = cx + (dx > 0 ? r.w / 2 + pd : dx < 0 ? -(r.w / 2 + pd) : 0) + dx, sy = cy + (dy > 0 ? r.h / 2 + pd : dy < 0 ? -(r.h / 2 + pd) : 0) + dy;
        const q = pd + 5, cl = (v, a, z) => Math.max(a, Math.min(z, v));
        const ex = cl(sx, r.x - q, r.x + r.w + q), ey = cl(sy, r.y - q, r.y + r.h + q);
        const ang = Math.atan2(ey - sy, ex - sx), L = 16;
        const hx = ex - Math.cos(ang) * L * .6, hy = ey - Math.sin(ang) * L * .6;
        for (const [col, wd] of [['#fff', 11], ['#ff2d6f', 6]]) {
          add('line', { x1: sx, y1: sy, x2: hx, y2: hy, stroke: col, 'stroke-width': wd, 'stroke-linecap': 'round' });
          const p1 = [ex - Math.cos(ang - .5) * L * 1.4, ey - Math.sin(ang - .5) * L * 1.4], p2 = [ex - Math.cos(ang + .5) * L * 1.4, ey - Math.sin(ang + .5) * L * 1.4];
          add('polygon', { points: `${ex},${ey} ${p1} ${p2}`, fill: col, stroke: col, 'stroke-width': col === '#fff' ? 5 : 0, 'stroke-linejoin': 'round' });
        }
        if (m.n) {
          add('circle', { cx: sx, cy: sy, r: 17, fill: '#ff2d6f', stroke: '#fff', 'stroke-width': 3 });
          const t = add('text', { x: sx, y: sy + 6.5, 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 900, fill: '#fff', 'font-family': 'sans-serif' });
          t.textContent = String(m.n);
        }
      }
      return { x, y, width: w, height: h };
    }, { s });
    await p.screenshot({ path: `${OUT}/${s.name}-${lang}.jpg`, type: 'jpeg', quality: 78, clip, fullPage: true });
    console.log(lang, s.name, JSON.stringify(clip));
  }
  await ctx.close();
}
await b.close();
