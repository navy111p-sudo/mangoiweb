/* 🔎 8/28 보고서 3건을 «진짜 Chromium 으로» 확인한다 (2026-08-30)
 *
 * [왜 이 검사가 따로 필요한가]
 *   8/28 보고서가 세 건 모두 「실제 화면 확인 전」으로 남겨 두었다. 문자열 하니스·타입체크는
 *   232건이 전부 초록인데, 이 세 건이 실제로 사람을 막는 지점은 전부 «화면» 이다 —
 *     · 표 안의 아이콘 버튼은 admin-inline-c.css 의 전역 규칙에 먹혀 «큰 파란 알약» 이 되기 쉽다
 *       (CLAUDE.md 2장 「표 안의 작은 아이콘 버튼이…」).
 *     · 우상단에 새로 띄우는 안내 카드는 «보이는데 안 눌리는» 사고가 잦다(같은 장, z-index·겹침).
 *     · 평가 모달에 버튼을 하나 더 넣으면 «별점 보내기» 를 가리거나 모달 밖으로 밀 수 있다.
 *   그래서 좌표·계산값(getComputedStyle·elementsFromPoint·대비비)으로 잰다.
 *
 * [무엇을 확인하나]
 *   ① 오늘 수업 표 — 🔄 대체강사 버튼: 크기(알약 아님)·맨 위에서 눌림·대체 표시·모달 동작
 *   ② test.mangoi.co.kr 안내 배너 — 그 호스트에서만 뜸·상단 요소와 안 겹침·닫으면 영구히 안 뜸
 *   ③ 수업 종료 평가 모달 — 📝 파일럿 피드백 버튼: 별점 버튼을 안 가림·클릭 시 폼으로 감
 *
 * [돌리는 법]  README 규약 그대로 — 게이트는 이 파일을 물어 가지 않는다(사람이 부른다).
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *   cd <repo> && PW_DIR=/tmp/pw node test-harness/manual/substitute-notice-pilot-browser.mjs
 *
 * ⚠️ 서버(D1)에 아무것도 쓰지 않는다 — fetch 를 가로채 가짜 응답을 물린다.
 * ⚠️ test.mangoi.co.kr 은 --host-resolver-rules 로 로컬 서버에 맵핑한다(진짜 접속 아님).
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.SUB_PORT || 8931);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why !== undefined ? ' — ' + JSON.stringify(why) : '')); }
};

async function serve() {
  try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error('정적 서버를 못 띄웠습니다: ' + PUBLIC);
}

const KST = 9 * 3600 * 1000;
const k = new Date(Date.now() + KST);
const TODAY = k.toISOString().slice(0, 10);
const at = (hh, mm) => Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), hh, mm) - KST;

/* 오늘 수업 3줄 — ① 평범한 수업 ② 대체가 걸린 수업 ③ 카페24(버튼 없어야 함) */
const SESSIONS = [
  { schedule_id: 501, source: 'mangoi', room_id: 'class-501-' + TODAY.replace(/-/g, ''), student_name: '김하나',
    teacher_id: '11', teacher_name: 'HANNAH', start_ts: at(20, 0), end_ts: at(20, 20), duration_min: 20,
    status: 'open', join_open: true, observable: true, textbook_assigned: true, textbook: 'BTS 2', level: 'Lv 3' },
  { schedule_id: 502, source: 'mangoi', room_id: 'class-502-' + TODAY.replace(/-/g, ''), student_name: '이두리',
    teacher_id: '26', teacher_name: 'MELCA', substituted: true, substituted_from: 'HANNAH',
    start_ts: at(21, 0), end_ts: at(21, 20), duration_min: 20,
    status: 'early', join_open: false, observable: true, textbook_assigned: false, level: 'Lv 2' },
  { schedule_id: null, source: 'cafe24', room_id: 'c24-777', student_name: '박세리', teacher_name: 'Teacher Rica',
    start_ts: at(22, 0), end_ts: at(22, 20), duration_min: 20, status: 'early', join_open: false,
    observable: false, textbook_assigned: true, textbook: '다락원' },
];

const CANDIDATES = {
  ok: true,
  schedule: { id: 502, student_name: '이두리', start_time: '21:00', duration_min: 20,
    teacher_id: '11', teacher_name: 'HANNAH', schedule_kind: 'recurring', is_recurring: true },
  candidates: [
    { id: '26', name: 'MELCA', free: true },
    { id: '24', name: 'Teacher Mariane', free: false },
  ],
  existing_substitution: { substitute_teacher_id: '26', substitute_teacher_name: 'MELCA',
    original_teacher_id: '11', reason: '병가' },
};

/* 배경을 «층으로 쌓아» 재는 대비비 — CLAUDE.md 2장 규칙 그대로.
   ⚠️ 반투명 층에서 멈추면 멀쩡한 글자가 실패로 나오고, backgroundColor 가 투명인데
      그라데이션이면 그 층이 통째로 건너뛰어져 «흰 바탕» 으로 계산된다. 둘 다 여기서 막는다. */
const CONTRAST_FN = `(el) => {
  const parse = (s) => {
    const m = String(s || '').match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const layers = [];
  let n = el;
  while (n && n.nodeType === 1) {
    const cs = getComputedStyle(n);
    let c = parse(cs.backgroundColor);
    if ((!c || c.a === 0) && cs.backgroundImage && cs.backgroundImage !== 'none') c = parse(cs.backgroundImage);
    if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    n = n.parentNode;
  }
  let bg = { r: 255, g: 255, b: 255 };
  for (let i = layers.length - 1; i >= 0; i--) {
    const c = layers[i];
    bg = { r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a) };
  }
  const fg0 = parse(getComputedStyle(el).color) || { r: 0, g: 0, b: 0, a: 1 };
  const fg = { r: fg0.r * fg0.a + bg.r * (1 - fg0.a), g: fg0.g * fg0.a + bg.g * (1 - fg0.a), b: fg0.b * fg0.a + bg.b * (1 - fg0.a) };
  const L = (c) => {
    const f = [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const l1 = L(fg), l2 = L(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const cs = getComputedStyle(el);
  return { ratio: Math.round(ratio * 100) / 100, fontSize: parseFloat(cs.fontSize), weight: cs.fontWeight };
}`;

async function sectionAdmin(browser) {
  console.log('\n① 오늘 수업 표 — 🔄 대체강사 버튼 (1500x950)');
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  const posts = [];
  let failNext = false;

  await page.route('**/api/**', async (route) => {
    const u = route.request().url();
    const j = (o, s) => route.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('/api/admin/classes/today')) return j({ ok: true, sessions: SESSIONS, date: TODAY });
    if (u.includes('/api/pay/enroll/admin/substitute-candidates')) return j(CANDIDATES);
    if (u.includes('/api/pay/enroll/admin/substitute')) {
      posts.push(JSON.parse(route.request().postData() || '{}'));
      if (failNext) return j({ ok: false, error: 'substitute_busy', message: '대체 강사도 그 시간에 다른 수업이 있습니다.' }, 409);
      return j({ ok: true, schedule_id: 502, date: TODAY, via_overlay: true, substitute_teacher_id: '26' });
    }
    if (u.includes('/api/admin/me')) return j({ ok: true, username: 'admin', role: 'hq', scope: { type: 'hq' } });
    return j({ ok: true });
  });
  /* 첫 방문자 «환영 안내» 오버레이가 스크롤·클릭을 막는다 — 본 것으로 표시(CLAUDE.md 2장) */
  await page.addInitScript(() => { try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {} });
  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    const d = document.getElementById('sm-today-classes');
    if (d && d.tagName === 'DETAILS') d.open = true;
    if (typeof window.tcLoadToday === 'function') window.tcLoadToday();
  });
  await page.waitForTimeout(900);

  const rows = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#tc-body .tc-sub-act')];
    const b = btns[0];
    let box = null, topMost = null;
    if (b) {
      /* ⚠️ 재기 «전에» 화면 안으로 가져온다 — 카드가 화면 밖이면 좌표가 0 이라
         멀쩡한 버튼이 「가려졌다」 로 나온다(2026-08-30 실제로 그렇게 한 번 오진). */
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      box = { w: Math.round(r.width), h: Math.round(r.height) };
      const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      topMost = stack[0] === b || (stack[0] && b.contains(stack[0]));
    }
    /* 🎨 옆 칩(참관)과 «같은 계열» 인지 — 이 표의 칩 스타일(button.tc-act)이 이겨야 한다.
       클래스 이름이 «-btn» 으로 끝나면 admin-inline-c.css 의 ivory 규칙(0,11,1)이 이겨
       이 버튼만 흰 버튼이 된다(2026-08-30 실측으로 밟음). */
    const obs = document.querySelector('#tc-body .tc-act-observe');
    return {
      count: btns.length,
      box, topMost,
      bodyText: (document.getElementById('tc-body') || {}).innerText || '',
      bg: b ? getComputedStyle(b).backgroundImage : null,
      bgColor: b ? getComputedStyle(b).backgroundColor : null,
      fontSize: b ? getComputedStyle(b).fontSize : null,
      obsFontSize: obs ? getComputedStyle(obs).fontSize : null,
      classAttr: b ? b.getAttribute('class') : null,
    };
  });

  check('🔄 버튼이 망고아이 수업 줄에만 있다(카페24 줄 제외 = 2개)', rows.count === 2, rows.count);
  check('🔄 버튼이 «큰 파란 알약» 이 아니다 (폭 ≤ 60 · 높이 ≤ 34)',
    !!rows.box && rows.box.w <= 60 && rows.box.h <= 34, rows.box);
  check('🔄 버튼에 전역 인디고 그라데이션이 안 먹었다', rows.bg === 'none', rows.bg);
  check('🔄 버튼이 맨 위에 있어 실제로 눌린다', rows.topMost === true, rows.topMost);
  check('🔄 버튼 클래스가 «-btn» 으로 끝나지 않는다([class$="-btn"] 규칙에 걸린다)',
    !/-btn$/.test(String(rows.classAttr || '')), rows.classAttr);
  check('🔄 버튼이 «혼자 흰 버튼» 이 아니다(ivory 규칙에 안 먹혔다)',
    rows.bgColor !== 'rgb(255, 255, 255)', rows.bgColor);
  check('🔄 버튼 글자 크기가 옆 칩과 같다(표 칩 스타일이 이겼다)',
    !!rows.obsFontSize && rows.fontSize === rows.obsFontSize, { sub: rows.fontSize, observe: rows.obsFontSize });
  check('대체가 걸린 줄에 「대체 · 원래 HANNAH」 가 보인다',
    /대체/.test(rows.bodyText) && rows.bodyText.includes('HANNAH') && rows.bodyText.includes('MELCA'),
    rows.bodyText.slice(0, 160));

  await page.evaluate(() => document.querySelectorAll('#tc-body .tc-sub-act')[1].click());
  await page.waitForTimeout(700);
  const modal = await page.evaluate(() => {
    const m = document.getElementById('tc-sub-modal');
    if (!m) return { open: false };
    const opts = [...m.querySelectorAll('#tc-sub-teacher option')].map((o) => o.textContent);
    const goBtn = m.querySelector('#tc-sub-go');
    const r = goBtn ? goBtn.getBoundingClientRect() : null;
    const st = r ? document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2) : [];
    return {
      open: true, opts,
      revert: !!m.querySelector('#tc-sub-revert'),
      recurNote: /반복/.test(m.innerText),
      goClickable: !!goBtn && (st[0] === goBtn || (st[0] && goBtn.contains(st[0]))),
      inViewport: !!r && r.top >= 0 && r.bottom <= innerHeight,
    };
  });
  check('🔄 를 누르면 대체강사 모달이 뜬다', modal.open === true);
  check('후보가 🟢(가능)·🔴(다른 수업) 로 갈라 보인다',
    !!modal.opts && /🟢/.test(modal.opts[0] || '') && /🔴/.test(modal.opts[1] || ''), modal.opts);
  check('매주 반복 수업이면 「이번 회차만」 안내가 뜬다', modal.recurNote === true);
  check('이미 대체가 걸려 있으면 「되돌리기」 버튼이 있다', modal.revert === true);
  check('[배정] 버튼이 화면 안에 있고 맨 위에서 눌린다',
    modal.goClickable === true && modal.inViewport === true, modal);

  failNext = true;
  await page.evaluate(() => { document.getElementById('tc-sub-reason').value = '병가'; document.getElementById('tc-sub-go').click(); });
  await page.waitForTimeout(600);
  const afterFail = await page.evaluate(() => ({
    open: !!document.getElementById('tc-sub-modal'),
    msg: (document.getElementById('tc-sub-msg') || {}).innerText || '',
  }));
  check('배정이 거절되면 모달이 그대로 열려 있다', afterFail.open === true);
  check('거절 사유를 화면이 말한다(조용히 실패하지 않는다)', /다른 수업/.test(afterFail.msg), afterFail.msg);

  failNext = false;
  await page.evaluate(() => { document.getElementById('tc-sub-go').click(); });
  await page.waitForTimeout(800);
  const last = posts[posts.length - 1] || {};
  check('POST 본문에 schedule_id·date·대체강사·사유가 실린다',
    last.schedule_id === 502 && /^\d{4}-\d{2}-\d{2}$/.test(String(last.date || '')) &&
    last.substitute_teacher_id === '26' && last.reason === '병가', last);
  check('배정에 성공하면 모달이 닫힌다',
    await page.evaluate(() => !document.getElementById('tc-sub-modal')));

  /* 🔒 역할별 버튼 노출 (2026-08-30 사장님 지시 2차 — «차단» 이 아니라 «자기 소속 수업만»).
     · 지사·대리점·지사본사 → **보인다.** 이 표 자체가 `scopeStudentCond()` 로 이미 잘려 있고
       (`/api/admin/classes/today`), 서버도 회차마다 같은 조건으로 다시 확인한다.
     · 강사 → 안 보인다(서버도 403). 
     ⚠️ 「보이는가」만 보지 말 것 — 실제로 맨 위에서 눌리는지도 함께 잰다. */
  for (const [roleLabel, role, wantBtn] of [['지사(branch)', 'branch', true], ['대리점(agency)', 'agency', true],
    ['지사본사(franchise)', 'franchise', true], ['강사(teacher)', 'teacher', false], ['본사(hq)', 'hq', true]]) {
    const pr = await ctx.newPage();
    await pr.route('**/api/**', async (route) => {
      const u = route.request().url();
      const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
      if (u.includes('/api/admin/classes/today')) return j({ ok: true, sessions: SESSIONS, date: TODAY });
      if (u.includes('/api/admin/me')) {
        return j({ ok: true, user: { username: 'demo_' + role, name: '데모' }, role,
          roleLabel, scope: { type: role, value: null, label: roleLabel } });
      }
      if (u.includes('/api/pay/enroll/admin/substitute')) {
        return route.fulfill({ status: 403, contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'forbidden_scope', message: '지사·대리점 권한으로는 사용할 수 없는 기능입니다.' }) });
      }
      return j({ ok: true });
    });
    await pr.addInitScript(() => { try { localStorage.removeItem('admin_session'); localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {} });
    await pr.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
    await pr.waitForTimeout(2500);
    await pr.evaluate(() => {
      const d = document.getElementById('sm-today-classes');
      if (d && d.tagName === 'DETAILS') d.open = true;
      if (typeof window.tcLoadToday === 'function') window.tcLoadToday();
    });
    await pr.waitForTimeout(900);
    const r = await pr.evaluate(() => {
      const help = document.getElementById('tc-sub-help');
      const b = document.querySelector('#tc-body .tc-sub-act');
      let clickable = null;
      if (b) {
        b.scrollIntoView({ block: 'center' });
        const rect = b.getBoundingClientRect();
        const st = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        clickable = st[0] === b || (st[0] && b.contains(st[0]));
      }
      return {
        btns: document.querySelectorAll('#tc-body .tc-sub-act').length,
        rows: document.querySelectorAll('#tc-body tbody tr').length,
        helpShown: !!help && getComputedStyle(help).display !== 'none',
        role: (window.__ADM_ME || {}).role || null,
        clickable,
      };
    });
    check(`[${roleLabel}] 신원을 서버에서 받아 왔다`, r.role === role, r);
    check(`[${roleLabel}] 표는 그대로 그려진다(수업 3줄)`, r.rows === 3, r.rows);
    check(`[${roleLabel}] 🔄 버튼이 ${wantBtn ? '보인다' : '안 보인다'}`, (r.btns > 0) === wantBtn, r.btns);
    check(`[${roleLabel}] 안내 문구도 ${wantBtn ? '보인다' : '함께 감춰진다'}`, r.helpShown === wantBtn, r.helpShown);
    if (wantBtn) check(`[${roleLabel}] 그 버튼이 맨 위에서 실제로 눌린다`, r.clickable === true, r.clickable);
    await pr.close();
  }

  /* 📱 세로가 짧은 폰 — 모달이 잘려 맨 아래 [배정] 을 못 누르는 사고(CLAUDE.md 2장) */
  const p2 = await ctx.newPage();
  await p2.route('**/api/**', async (route) => {
    const u = route.request().url();
    const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('/api/admin/classes/today')) return j({ ok: true, sessions: SESSIONS, date: TODAY });
    if (u.includes('/api/pay/enroll/admin/substitute-candidates')) return j(CANDIDATES);
    return j({ ok: true });
  });
  await p2.addInitScript(() => { try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {} });
  await p2.setViewportSize({ width: 390, height: 640 });
  await p2.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(2500);
  await p2.evaluate(() => {
    const d = document.getElementById('sm-today-classes');
    if (d && d.tagName === 'DETAILS') d.open = true;
    if (typeof window.tcLoadToday === 'function') window.tcLoadToday();
  });
  await p2.waitForTimeout(900);
  await p2.evaluate(() => document.querySelectorAll('#tc-body .tc-sub-act')[1].click());
  await p2.waitForTimeout(700);
  const phone = await p2.evaluate(() => {
    const m = document.getElementById('tc-sub-modal');
    if (!m) return { open: false };
    const scrollable = getComputedStyle(m).overflowY === 'auto' || getComputedStyle(m).overflowY === 'scroll';
    const go = m.querySelector('#tc-sub-go');
    go.scrollIntoView({ block: 'center' });
    const r = go.getBoundingClientRect();
    const st = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { open: true, scrollable, reachable: st[0] === go, inViewport: r.top >= 0 && r.bottom <= innerHeight };
  });
  check('[폰 390x640] 모달이 열린다', phone.open === true);
  check('[폰 390x640] 모달이 스크롤된다(넘친 부분이 잘리지 않는다)', phone.scrollable === true, phone);
  check('[폰 390x640] 맨 아래 [배정] 버튼에 손이 닿는다', phone.reachable === true && phone.inViewport === true, phone);
  await ctx.close();
}

async function sectionNotice(browser) {
  console.log('\n② test.mangoi.co.kr 안내 배너 (index.html)');
  for (const vp of [{ width: 1280, height: 800, label: 'PC 1280' }, { width: 390, height: 844, label: '폰 390' }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));

    await page.goto('http://test.mangoi.co.kr/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(`(() => {
      const b = document.getElementById('mg-legacy-domain-notice');
      if (!b) return { shown: false };
      const bb = b.getBoundingClientRect();
      const x = document.getElementById('mg-legacy-domain-notice-x');
      const xr = x.getBoundingClientRect();
      const topAt = document.elementsFromPoint(bb.left + bb.width / 2, bb.top + 8);
      const xAt = document.elementsFromPoint(xr.left + xr.width / 2, xr.top + xr.height / 2);
      const covered = [];
      for (let px = bb.left + 6; px < bb.right; px += 40) {
        for (let py = bb.top + 6; py < bb.bottom; py += 20) {
          for (const el of document.elementsFromPoint(px, py)) {
            if (el === b || b.contains(el)) continue;
            const t = el.tagName;
            if (t === 'BUTTON' || t === 'A' || t === 'INPUT' || t === 'SELECT') {
              const cs = getComputedStyle(el);
              if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none') {
                covered.push((el.id || el.className || t).toString().slice(0, 40));
              }
            }
            break;
          }
        }
      }
      const title = b.querySelector('div > div > div');
      return {
        shown: true,
        inViewport: bb.left >= 0 && bb.top >= 0 && bb.right <= innerWidth && bb.bottom <= innerHeight,
        onTop: topAt[0] === b || b.contains(topAt[0]),
        closeOnTop: xAt[0] === x,
        covered: [...new Set(covered)],
        contrast: (${CONTRAST_FN})(title),
        noLink: b.querySelectorAll('a[href],[onclick]').length === 0,
      };
    })()`);

    check(`[${vp.label}] 옛 도메인에서 안내 배너가 뜬다`, r.shown === true);
    if (r.shown) {
      check(`[${vp.label}] 배너가 화면 안에 들어온다`, r.inViewport === true, r);
      check(`[${vp.label}] 배너가 맨 위에 있어 가려지지 않는다`, r.onTop === true);
      check(`[${vp.label}] 닫기 ✕ 가 맨 위에서 실제로 눌린다`, r.closeOnTop === true);
      check(`[${vp.label}] 배너가 다른 «누를 수 있는» 요소를 덮지 않는다`, (r.covered || []).length === 0, r.covered);
      check(`[${vp.label}] 제목 글자 대비비 ≥ 4.5`, r.contrast && r.contrast.ratio >= 4.5, r.contrast);
      check(`[${vp.label}] 「바로가기」 링크가 없다(사장님 결정)`, r.noLink === true);
    }

    if (vp.width === 1280 && r.shown) {
      await page.evaluate(() => document.getElementById('mg-legacy-domain-notice-x').click());
      await page.waitForTimeout(250);
      const gone = await page.evaluate(() => !document.getElementById('mg-legacy-domain-notice'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2200);
      const again = await page.evaluate(() => !!document.getElementById('mg-legacy-domain-notice'));
      check('[PC] 닫으면 바로 사라진다', gone === true);
      check('[PC] 닫은 뒤 새로고침해도 다시 안 뜬다', again === false);

      const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const p2 = await ctx2.newPage();
      await p2.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
      await p2.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
      await p2.waitForTimeout(2200);
      check('정상 주소(mangoi.ai 자리)에서는 배너가 안 뜬다',
        await p2.evaluate(() => !document.getElementById('mg-legacy-domain-notice')));
      await ctx2.close();
    }
    await ctx.close();
  }
}

async function sectionPilot(browser) {
  console.log('\n③ 수업 종료 평가 모달 — 📝 파일럿 피드백 버튼');
  for (const vp of [{ width: 1280, height: 800, label: 'PC 1280' }, { width: 390, height: 844, label: '폰 390' }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const r = await page.evaluate(`(() => {
      window.__opened = null;
      window.open = function (u) { window.__opened = u; return null; };   // 인앱 브라우저 흉내(null 반환)
      if (typeof window.mangoShowRating !== 'function') return { ready: false };
      window.mangoShowRating();
      const b = document.getElementById('vc-pilot-fb-btn');
      if (!b) return { ready: true, shown: false };
      const br = b.getBoundingClientRect();
      const sub = document.getElementById('vc-rate-submit');
      const sr = sub.getBoundingClientRect();
      const overlaps = !(br.right <= sr.left || sr.right <= br.left || br.bottom <= sr.top || sr.bottom <= br.top);
      const stack = document.elementsFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      const card = b.parentNode.getBoundingClientRect();
      return {
        ready: true, shown: br.width > 0 && br.height > 0,
        overlaps, onTop: stack[0] === b,
        insideCard: br.bottom <= card.bottom + 1 && br.top >= card.top - 1,
        /* 줄 수는 «상자 높이 ÷ line-height» 로 세면 안 된다 — padding·border 가 섞여
           한 줄짜리가 2줄로 잡힌다(CLAUDE.md 2장). 글자 상자(Range)의 줄 상자를 직접 센다.
           ⚠️ line-height 가 'normal' 이면 parseFloat 이 NaN 이라 그 계산은 null 까지 간다. */
        lines: (function () { const rg = document.createRange(); rg.selectNodeContents(b); return rg.getClientRects().length; })(),
        contrast: (${CONTRAST_FN})(b),
        label: b.textContent,
      };
    })()`);

    check(`[${vp.label}] 평가 모달에 📝 피드백 버튼이 보인다`, r.ready && r.shown === true, r);
    if (r.shown) {
      check(`[${vp.label}] 「평가 보내기」 버튼을 가리지 않는다`, r.overlaps === false);
      check(`[${vp.label}] 맨 위에 있어 실제로 눌린다`, r.onTop === true);
      check(`[${vp.label}] 모달 카드 안에 들어간다(밖으로 안 넘침)`, r.insideCard === true, r);
      check(`[${vp.label}] 글자가 낱글자로 쪼개지지 않는다(한 줄)`, r.lines <= 1, r.lines);
      check(`[${vp.label}] 버튼 글자 대비비 ≥ 4.5`, r.contrast && r.contrast.ratio >= 4.5, r.contrast);

      const nav = await page.evaluate(() => {
        const b = document.getElementById('vc-pilot-fb-btn');
        b.click();
        return { opened: window.__opened };
      });
      const url = nav.opened || '';
      check(`[${vp.label}] 누르면 구글 폼으로 간다`, /docs\.google\.com\/forms/.test(String(url)), String(url).slice(0, 60));
    }
    await ctx.close();
  }
}

(async () => {
  const { chromium, exe } = requireBrowser();
  const srv = await serve();
  const browser = await chromium.launch({
    executablePath: exe,
    args: [`--host-resolver-rules=MAP test.mangoi.co.kr 127.0.0.1:${PORT}`],
  });
  try {
    await sectionAdmin(browser);
    await sectionNotice(browser);
    await sectionPilot(browser);
  } finally {
    await browser.close();
    if (srv) srv.kill();
  }
  console.log(`\n${FAIL === 0 ? '✅' : '❌'} PASS ${PASS} · FAIL ${FAIL}`);
  process.exit(FAIL === 0 ? 0 : 1);
})();
