/* 🔒 주간 전체 스케줄 «편집 잠금 + 되돌리기» — 진짜 Chromium 으로 눌러 본다 (2026-09-11)
 *
 * [왜 이 검사가 따로 필요한가]
 *   schedule_drag_persist_harness 는 판정을 오려 내 «실제로» 돌리지만, 그것으로는
 *   «버튼이 화면에 있는가»·«손이 닿는가»·«정말 안 끌리는가» 를 볼 수 없다.
 *   이 저장소가 여러 번 밟은 함정이 바로 그 자리다 — 「있다」·「보인다」·「눌린다」는
 *   다 다른 값이고, 판정은 elementFromPoint 로만 갈린다.
 *
 * [무엇을 확인하나]
 *   ① 잠금 버튼이 상단바에 «보이고» 그 자리의 맨 위가 그 버튼이다(가려지지 않았다)
 *   ② 눌러서 켜고 끌 수 있다 + 라벨이 바뀐다 + 🌐 EN 으로 바꿔도 따라온다
 *   ③ 잠긴 채로 «진짜 마우스로» 끌면 확인 모달이 안 뜬다 ↔ 편집을 켜면 뜬다 (짝)
 *   ④ 되돌리기 토스트의 버튼이 맨 위라 «정말 눌린다»(.dnd-toast 는 pointer-events:none)
 *   ⑤ 새 버튼 때문에 상단바가 가로로 넘치지 않는다 (1280·1024)
 *
 * [돌리는 법]  README 규약 그대로 — 게이트는 이 파일을 물어 가지 않는다(사람이 부른다).
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *   cd <repo> && PW_DIR=/tmp/pw node test-harness/manual/weekly-schedule-lock-browser.mjs
 *
 * ⚠️ 서버(D1)에 아무것도 쓰지 않는다 — fetch 를 가로채 가짜 응답을 물린다.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.WSL_PORT || 8913);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why !== undefined ? ' — ' + JSON.stringify(why) : '')); }
};

async function serve() {
  try { const r = await fetch(BASE + '/admin/weekly-schedule.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin/weekly-schedule.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error('정적 서버를 못 띄웠습니다: ' + PUBLIC);
}

const KST = 9 * 3600 * 1000;
const k = new Date(Date.now() + KST);
const monday = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - ((k.getUTCDay() + 6) % 7) * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const DAY_TUE = iso(new Date(monday.getTime() + 86400000));

const SCHED = [
  { id: 2332, teacher_id: '24', date: DAY_TUE, start_time: '14:00', type: '1on1', duration_min: 20,
    origin: 'class', move_field: 'scheduled_date', students: [{ name: '정우영', uid: 'jeong' }] },
];

async function open(browser, w) {
  const ctx = await browser.newContext({ viewport: { width: w || 1600, height: 950 } });
  const page = await ctx.newPage();
  const patched = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    const u = req.url();
    if (req.method() === 'PATCH') { patched.push({ url: u, body: req.postData() }); return j({ ok: true }); }
    if (u.includes('/api/admin/teachers')) return j([{ id: '24', name: 'HANNAH', name_en: 'HANNAH', category: 'office' }]);
    if (u.includes('/api/admin/schedules')) return j(SCHED);
    return j({ ok: true, items: [], events: [], teachers: [], schedules: [] });
  });
  /* 🪤 캐시 우회 — 같은 포트를 다시 쓰면 크로미움이 «직전 회차의 HTML» 을 꺼내 쓴다. */
  await page.goto(BASE + '/admin/weekly-schedule.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof SLOTS !== 'undefined' && Object.keys(SLOTS).length > 0, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => { viewMode = 'day'; curDow = 1; render(); });
  await page.waitForTimeout(600);
  return { ctx, page, patched };
}

/** 그 자리의 «맨 위» 가 내 요소(또는 그 자식)인가 — 「보인다」와 「눌린다」는 다르다. */
const topmostIs = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return { found: true, w: r.width, h: r.height, visible: false };
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    found: true, visible: true, w: Math.round(r.width), h: Math.round(r.height),
    right: Math.round(r.right), vw: window.innerWidth,
    mine: !!top && (top === el || el.contains(top)),
    topTag: top ? (top.tagName + '.' + String(top.className || '').split(' ')[0]) : null,
  };
}, sel);


/* 🎨 «무슨 색인가» 와 «읽히는가» 는 다른 검사다 (CLAUDE.md).
   ⚠️ 이 화면은 `adm-light-theme.css` 를 싣는 «밝은» 화면이라, 다크 전제로 고른 색
      (연노랑 #fde68a 같은)을 그대로 쓰면 흰 바탕에서 안 읽힌다.
   ⚠️ 반투명·그라데이션은 «불투명한 층을 만날 때까지» 모아 아래에서 위로 합성해야 한다 —
      첫 조상에서 멈추면 멀쩡한 대비를 1점대로 «틀리게» 읽는다. */
const contrastOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return { found: false };
  const parse = (c) => {
    if (!c) return null;
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const firstFromImage = (img) => {
    if (!img || img === 'none') return null;
    const m = String(img).match(/rgba?\([^)]+\)/g);
    if (!m) return null;
    // 여러 stop 중 «가장 나쁜» 것을 쓰려면 전부 봐야 하지만, 여기선 첫 stop 으로 충분하다
    return parse(m[0]);
  };
  // 글자색 — 조상의 opacity 까지 곱한다
  const cs = getComputedStyle(el);
  const fg = parse(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
  let op = 1;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity || '1');
  fg.a = (fg.a == null ? 1 : fg.a) * op;
  // 배경 — 불투명한 층을 만날 때까지 쌓는다
  const layers = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s2 = getComputedStyle(n);
    const bi = firstFromImage(s2.backgroundImage);
    const bc = parse(s2.backgroundColor);
    for (const L of [bi, bc]) {          // 같은 요소에서 «색 위에 이미지» 순서
      if (!L || !L.a) continue;
      layers.push(L);
      if (L.a >= 1) break;
    }
    if (layers.length && layers[layers.length - 1].a >= 1) break;
  }
  layers.push({ r: 255, g: 255, b: 255, a: 1 });   // 최후의 바탕
  let bg = layers[layers.length - 1];
  for (let i = layers.length - 2; i >= 0; i--) {
    const L = layers[i];
    bg = { r: L.r * L.a + bg.r * (1 - L.a), g: L.g * L.a + bg.g * (1 - L.a), b: L.b * L.a + bg.b * (1 - L.a), a: 1 };
  }
  const over = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const l1 = lum(over), l2 = lum(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return { found: true, ratio: Math.round(ratio * 100) / 100, color: cs.color, size: cs.fontSize, weight: cs.fontWeight,
           bg: 'rgb(' + [bg.r, bg.g, bg.b].map((x) => Math.round(x)).join(',') + ')' };
}, sel);

(async () => {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const { ctx, page, patched } = await open(browser);

    console.log('\n[1] 잠금 버튼이 보이고 «손이 닿는가»');
    const btn = await topmostIs(page, '#ws-lock-btn');
    check('잠금 버튼이 화면에 있다', !!btn.found && btn.visible, btn);
    check('🔴 그 자리의 맨 위가 잠금 버튼이다 (다른 것이 덮지 않는다)', btn.mine === true, btn);
    check('버튼이 화면 오른쪽으로 넘치지 않았다', btn.right <= btn.vw, btn);
    const st0 = await page.evaluate(() => ({
      pressed: document.getElementById('ws-lock-btn').getAttribute('aria-pressed'),
      label: document.getElementById('ws-lock-label').textContent,
      ico: document.getElementById('ws-lock-ico').textContent,
      editing: wsEditing(),
    }));
    check('🔒 기본이 «잠김» 이다 (실수로 끌리는 것을 막는 것이 목적)', st0.editing === false && st0.pressed === 'false', st0);
    check('라벨이 「잠김」 이다', st0.label === '잠김' && st0.ico === '🔒', st0);

    console.log('\n[2] 눌러서 켜고 끄는가 / 🌐 로 바꿔도 따라오는가');
    await page.click('#ws-lock-btn');
    await page.waitForTimeout(150);
    const st1 = await page.evaluate(() => ({
      pressed: document.getElementById('ws-lock-btn').getAttribute('aria-pressed'),
      label: document.getElementById('ws-lock-label').textContent,
      cd: document.getElementById('ws-lock-cd').textContent,
      editing: wsEditing(),
    }));
    check('✏️ 눌렀더니 편집이 켜졌다', st1.editing === true && st1.pressed === 'true', st1);
    check('라벨이 「편집 중」 으로 바뀌었다', st1.label === '편집 중', st1);
    check('남은 시간이 보인다 (언제 다시 잠기는지 알 수 있다)', /^\d+:\d\d$/.test(st1.cd), st1);

    await page.evaluate(() => applyLang('en'));
    await page.waitForTimeout(150);
    const en = await page.evaluate(() => document.getElementById('ws-lock-label').textContent);
    check('🌐 EN 으로 바꿔도 라벨이 따라온다', en === 'Editing', en);
    await page.evaluate(() => applyLang('ko'));
    await page.waitForTimeout(150);

    await page.click('#ws-lock-btn');
    await page.waitForTimeout(150);
    const st2 = await page.evaluate(() => ({ editing: wsEditing(), label: document.getElementById('ws-lock-label').textContent }));
    check('🔒 다시 눌러 잠글 수 있다', st2.editing === false && st2.label === '잠김', st2);

    console.log('\n[3] 진짜 마우스로 끌어 본다 — 잠기면 안 끌리고 ↔ 켜면 끌린다 (짝)');
    const boxes = await page.evaluate(([d]) => {
      const src = document.querySelector(`td.slot[data-date="${d}"][data-hour="14"]`);
      const dst = document.querySelector(`td.slot[data-date="${d}"][data-hour="17"]`);
      const b = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      return { src: b(src), dst: b(dst), hasSlot: !!(src && src.dataset.slot) };
    }, [DAY_TUE]);
    check('전제 — 끌 수 있는 수업 칸과 빈 칸을 찾았다', !!boxes.src && !!boxes.dst && boxes.hasSlot, boxes);

    async function dragOnce() {
      await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show,.modal-overlay').forEach((m) => m.classList.remove('show')); });
      await page.mouse.move(boxes.src.x, boxes.src.y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(boxes.src.x + (boxes.dst.x - boxes.src.x) * i / 10,
                              boxes.src.y + (boxes.dst.y - boxes.src.y) * i / 10);
      }
      await page.mouse.up();
      await page.waitForTimeout(400);
      return page.evaluate(() => ({
        modal: /이동 확인|Confirm Move|예, 변경|Yes, Move/.test(document.body.innerText || ''),
        toast: Array.from(document.querySelectorAll('.dnd-toast')).map((t) => t.textContent).join(' | '),
        active: typeof dnd !== 'undefined' ? dnd.active : null,
      }));
    }

    if (boxes.src && boxes.dst) {
      const lockedDrag = await dragOnce();
      check('🔴 잠긴 채로 끌면 확인 모달이 안 뜬다 (실수로 옮겨지지 않는다)', lockedDrag.modal === false, lockedDrag);
      check('왜 안 끌렸는지 화면이 말한다', /잠겨/.test(lockedDrag.toast), lockedDrag.toast);
      check('그 사이 서버로 나간 저장이 없다', patched.length === 0, patched.length);

      await page.click('#ws-lock-btn');
      await page.waitForTimeout(150);
      const openDrag = await dragOnce();
      check('✏️ 편집을 켜면 예전처럼 끌린다 (잠금이 «전부 막기» 가 아니다)', openDrag.modal === true, openDrag);
      await page.evaluate(() => { if (typeof cancelMove === 'function') cancelMove(); });
      await page.waitForTimeout(200);
    }

    console.log('\n[4] 되돌리기 토스트 — 보이기만 하는 게 아니라 «눌린다»');
    await page.evaluate(() => {
      wsOfferUndo({ slot: { id: 2332, ids: [2332], moveField: 'scheduled_date' },
                    prev: { dateISO: '2026-09-11', startMin: 860, teacherId: '29' }, what: '테스트' });
    });
    await page.waitForTimeout(250);
    /* 🔴 2026-09-11 함정 대조 지적: 둘 다 `position:fixed; bottom:24px; left:50%` 라
       되돌리기 토스트가 저장 성공 토스트를 63% 덮고 있었다 — 하필 그 토스트가
       «무엇을 바꿨는지»(「✅ 담당 강사 변경: MAIMAI」)를 말하는 유일한 자리다. */
    await page.evaluate(() => { showDndToast('✅ 👨‍🏫 담당 강사 변경: MAIMAI', 'ok'); });
    await page.waitForTimeout(250);
    const ov = await page.evaluate(() => {
      const a = document.querySelector('.undo-toast'), b = document.querySelector('.dnd-toast.show');
      if (!a || !b) return { found: false };
      const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left));
      const h = Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top));
      return { found: true, pct: q.width * q.height ? Math.round(w * h / (q.width * q.height) * 100) : 0,
               undo: [Math.round(r.top), Math.round(r.bottom)], toast: [Math.round(q.top), Math.round(q.bottom)] };
    });
    check('저장 성공 토스트를 안 덮는다 (겹침 0%)', ov.found && ov.pct === 0, ov);
    const u = await topmostIs(page, '.undo-toast button');
    check('되돌리기 버튼이 화면에 있다', !!u.found && u.visible, u);
    check('🔴 그 자리의 맨 위가 되돌리기 버튼이다 (.dnd-toast 는 pointer-events:none 이라 못 눌린다)', u.mine === true, u);
    const n0 = patched.length;
    await page.click('.undo-toast button');
    await page.waitForTimeout(700);
    check('눌렀더니 서버로 되돌리기가 나갔다', patched.length === n0 + 1, { before: n0, after: patched.length });
    const body = patched.length ? JSON.parse(patched[patched.length - 1].body || '{}') : {};
    check('되돌리기가 «원래 값» 을 보낸다', body.start_time === '14:20' && body.scheduled_date === '2026-09-11' && body.teacher_id === '29', body);
    const gone = await page.evaluate(() => document.querySelectorAll('.undo-toast.show').length);
    check('되돌린 뒤 그 토스트가 사라진다 (또 누를 수 없다)', gone === 0, gone);
    await ctx.close();

    console.log('\n[5] 새 버튼 때문에 상단바가 가로로 넘치지 않는가');
    for (const w of [1280, 1024]) {
      const o = await open(browser, w);
      const over = await o.page.evaluate(() => ({
        doc: document.documentElement.scrollWidth, vw: window.innerWidth,
        btn: (() => { const e = document.getElementById('ws-lock-btn'); if (!e) return null; const r = e.getBoundingClientRect(); return { right: Math.round(r.right), w: Math.round(r.width) }; })(),
      }));
      check(w + 'px — 문서가 가로로 넘치지 않는다', over.doc <= over.vw + 1, over);
      check(w + 'px — 잠금 버튼이 화면 안에 있다', !!over.btn && over.btn.right <= over.vw + 1, over);
      await o.ctx.close();
    }

    console.log('\n[6] 읽히는가 — 이 화면은 «밝은» 테마다 (다크 전제 색을 쓰면 안 보인다)');
    {
      const o = await open(browser);
      /* ⏱ 밝기 보정 페인터(adm-light-surfaces.js, defer)가 돌 시간을 준다 — 그 «뒤» 의 색이 사람이 보는 색이다. */
      await o.page.waitForTimeout(1200);
      const lockOff = await contrastOf(o.page, '#ws-lock-label');
      check('🔒 잠김 라벨이 읽힌다 (4.5:1 이상)', lockOff.found && lockOff.ratio >= 4.5, lockOff);
      await o.page.click('#ws-lock-btn');
      await o.page.waitForTimeout(200);
      const lockOn = await contrastOf(o.page, '#ws-lock-label');
      check('✏️ 편집 중 라벨이 읽힌다 (4.5:1 이상)', lockOn.found && lockOn.ratio >= 4.5, lockOn);
      const cd = await contrastOf(o.page, '#ws-lock-cd');
      check('남은 시간 초읽기가 읽힌다 (4.5:1 이상)', cd.found && cd.ratio >= 4.5, cd);
      await o.page.evaluate(() => {
        wsOfferUndo({ slot: { id: 1, ids: [1], moveField: 'scheduled_date' },
                      prev: { dateISO: '2026-09-11', startMin: 860, teacherId: '29' }, what: '테스트' });
      });
      await o.page.waitForTimeout(1200);
      const ut = await contrastOf(o.page, '.undo-toast');
      const ub = await contrastOf(o.page, '.undo-toast button');
      check('되돌리기 토스트 글자가 읽힌다 (4.5:1 이상)', ut.found && ut.ratio >= 4.5, ut);
      check('되돌리기 버튼 글자가 읽힌다 (4.5:1 이상)', ub.found && ub.ratio >= 4.5, ub);
      await o.ctx.close();
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
  process.exit(FAIL ? 1 : 0);
})();
