// -*- coding: utf-8 -*-
/* ═════════════════════════════════════════════════
   ↕🔑 대리점 목록 머리글 정렬 + ✏️ 수정 창 로그인 계정 — 진짜 브라우저로 재는 검사
   (2026-10-28 사장님 「대리점 아이디와 정보를 넣어주고 필터 올림·내림 넣어줘」)

   · 머리글을 누르면 서버에 sort/dir 로 묻고(921건 전체 기준) ▲ → ▼ → 원래 순서, 화살표가 따라온다
   · 🌐 영어로 바꿔도 화살표가 산다(i18n 이 [data-ko] 의 글자를 갈아끼운다)
   · ✏️ 수정 창: 로그인 칸이 보이고, 계정이 하나면 아이디가 미리 채워지고, 비밀번호를 넣어 저장하면
     PATCH 에 실리고 결과(바꿈)를 알린다. 비밀번호를 비우면 아무것도 안 실린다(짝).
   · 🔒 (2026-10-28 「본사 계정만」) 서버가 can_login:false 를 주면 로그인 칸·안내가 «화면에서» 사라지고, true 면 돌아온다(짝)

   ⚠️ manual/ — 게이트가 물어 가지 않습니다. 사람이 부를 것:
        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
        PW_DIR=/tmp/pw node test-harness/manual/center-sort-login-browser.mjs [스크린샷.png]
   ═════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.CTSORT_PORT || 8918);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT = process.argv[2] || '';

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

const C = (id, name, manager, login_ids) => ({ id, name, franchise_id: 2, franchise_name: '서울지사', country: 'KR',
  manager, phone: '010', address: '주소', payment_type: 'B2B', tuition_krw: null, login_ids });
const ALL = [C(11, '나학원', '박', []), C(12, '가학원', '', ['zeta']), C(13, '다학원', '김', ['a1', 'b2'])];

(async () => {
  const { chromium, exe } = requireBrowser();
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const seen = [], patches = [], dialogs = [];
  let canLogin;   // undefined = 옛 서버(칸 없음) → 화면은 보여 둔다
  try {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/admin/me*', r => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, username: 'admin', role: 'hq_exec', name: '관리자' }) }));
    await ctx.route('**/api/admin/centers*', r => {
      const req = r.request();
      if (req.method() === 'PATCH') {
        const b = JSON.parse(req.postData() || '{}'); patches.push(b);
        return r.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: true, id: b.id, login_result: b.login_password ? 'reset' : undefined }) });
      }
      const u = new URL(req.url());
      const sort = u.searchParams.get('sort') || '', dir = u.searchParams.get('dir') || '';
      seen.push(sort + ':' + dir);
      let items = ALL.slice();
      if (sort === 'name' || sort === 'manager') {
        items.sort((a, b) => {
          const av = a[sort] || null, bv = b[sort] || null;
          if (!av && !bv) return a.id - b.id; if (!av) return 1; if (!bv) return -1;
          return (dir === 'desc' ? -1 : 1) * av.localeCompare(bv, 'ko');
        });
      }
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, can_edit: true,
        total: items.length, limit: 50, offset: 0, counts: { all: 3, B2B: 3, B2C: 0, NONE: 0 }, items,
        sort: sort ? { key: sort, dir: dir === 'desc' ? 'desc' : 'asc' } : null,
        ...(canLogin === undefined ? {} : { can_login: canLogin }) }) });
    });

    const page = await ctx.newPage();
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.addInitScript(() => { try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch {} });
    await page.goto(BASE + '/admin.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      if (window.jumpToMenu) window.jumpToMenu('card-franchises');
      document.querySelectorAll('#card-franchises details').forEach(d => { if (d.id !== 'ct-form-wrap') d.open = true; });
      if (window.loadCenters) window.loadCenters();
    });
    await page.waitForTimeout(1500);

    const names = () => page.evaluate(() => Array.from(document.querySelectorAll('#centers-table tr'))
      .map(tr => tr.children[2] ? tr.children[2].textContent.trim() : '').filter(Boolean).join(','));
    const arrow = sk => page.evaluate(sk => {
      const th = document.querySelector('#ct-list-table th[data-sk="' + sk + '"]');
      return th ? getComputedStyle(th, '::after').content.replace(/["\s]/g, '').replace(/\/$/, '') : 'NO_TH';
    }, sk);
    const th = sk => page.locator('#ct-list-table th[data-sk="' + sk + '"]');
    // 화면 오른쪽 아래에 떠 있는 «빠른 메뉴» 단추가 머리글을 가릴 수 있다 — 가운데로 끌어온 뒤 누른다(사람도 그렇게 한다).
    const clickTh = async sk => { await th(sk).evaluate(e => e.scrollIntoView({ block: 'center', inline: 'center' })); await th(sk).click(); };

    check('① 머리글이 «누를 수 있는» 모양(cursor:pointer)', (await th('name').evaluate(e => getComputedStyle(e).cursor)) === 'pointer');
    check('①-1 처음엔 화살표 ⇅', (await arrow('name')).startsWith('⇅'), await arrow('name'));
    seen.length = 0;
    await clickTh('name'); await page.waitForTimeout(500);
    check('② 대리점명 1번 → 서버에 sort=name:asc', seen.includes('name:asc'), JSON.stringify(seen));
    check('②-1 가 → 나 → 다 순서', (await names()) === '가학원,나학원,다학원', await names());
    check('②-2 화살표 ▲ · 다른 칸은 ⇅', (await arrow('name')).startsWith('▲') && (await arrow('manager')).startsWith('⇅'));
    if (SHOT) await page.locator('#ct-list-table').screenshot({ path: SHOT });
    await clickTh('name'); await page.waitForTimeout(500);
    check('③ 2번 → 내림(다 → 나 → 가) ▼', (await names()) === '다학원,나학원,가학원' && (await arrow('name')).startsWith('▼'), await names());
    await clickTh('name'); await page.waitForTimeout(500);
    check('④ 3번 → 원래 순서 · 화살표 ⇅(짝)', seen[seen.length - 1] === ':' && (await arrow('name')).startsWith('⇅'), JSON.stringify(seen));
    await clickTh('manager'); await page.waitForTimeout(500);
    check('⑤ 담당자 ▲ — 빈 담당자는 맨 아래', (await names()).endsWith('가학원'), await names());

    await page.evaluate(() => { if (window.toggleAdminLang) window.toggleAdminLang(); });
    await page.waitForTimeout(500);
    const en = await page.evaluate(() => (document.querySelector('#ct-list-table th[data-sk="name"]') || {}).textContent);
    check('⑥ 🌐 영어로 바꿔도 머리글 글자는 바뀌고 화살표는 남는다', /Agency/.test(en || '') && (await arrow('manager')).startsWith('▲'), en + ' / ' + (await arrow('manager')));
    await page.evaluate(() => { if (window.toggleAdminLang) window.toggleAdminLang(); });
    await page.waitForTimeout(400);

    // ── ✏️ 수정 창
    await page.evaluate(() => window.ctEdit(12)); await page.waitForTimeout(300);
    const f = await page.evaluate(() => ({
      vis: !!document.getElementById('ct-login-id').offsetParent,
      id: document.getElementById('ct-login-id').value, pw: document.getElementById('ct-login-pw').value,
      hint: document.getElementById('ct-login-hint').textContent,
    }));
    check('⑦ 수정 창에 로그인 칸이 보인다', f.vis, JSON.stringify(f));
    check('⑦-1 계정이 하나면 아이디(zeta)를 미리 채우고 비밀번호는 비운다', f.id === 'zeta' && f.pw === '', JSON.stringify(f));
    check('⑦-2 안내 문구가 «수정» 판', /비밀번호를 넣고 저장하면/.test(f.hint), f.hint);
    await page.evaluate(() => document.getElementById('ct-add-btn').scrollIntoView({ block: 'center' })); await page.click('#ct-add-btn'); await page.waitForTimeout(600);
    check('⑧ 비밀번호를 비우고 저장 → 계정은 안 건드린다(비밀번호 안 실림)', patches.length === 1 && !patches[0].login_password, JSON.stringify(patches));
    await page.evaluate(() => window.ctEdit(12)); await page.waitForTimeout(200);
    await page.fill('#ct-login-pw', 'newpass9');
    dialogs.length = 0;
    await page.evaluate(() => document.getElementById('ct-add-btn').scrollIntoView({ block: 'center' })); await page.click('#ct-add-btn'); await page.waitForTimeout(800);
    const last = patches[patches.length - 1] || {};
    check('⑨ 비밀번호를 넣고 저장 → PATCH 에 아이디·비밀번호', last.login_username === 'zeta' && last.login_password === 'newpass9', JSON.stringify(last));
    check('⑨-1 «비밀번호를 바꿨습니다» 를 알린다', dialogs.some(m => /비밀번호를 바꿨습니다/.test(m)), JSON.stringify(dialogs));
    const after = await page.evaluate(() => ({ pw: document.getElementById('ct-login-pw').value, hint: document.getElementById('ct-login-hint').textContent }));
    check('⑩ 저장 뒤 비밀번호 칸을 비우고 안내를 «등록» 판으로', after.pw === '' && /둘 다 입력하면/.test(after.hint), JSON.stringify(after));
    await page.evaluate(() => window.ctEdit(13)); await page.waitForTimeout(200);
    check('⑪ 계정이 여럿이면 아이디를 비워 둔다(추측 금지)', (await page.inputValue('#ct-login-id')) === '');

    // ── 🔒 본사 전용 — 서버가 «이 계정은 못 만든다» 고 하면 칸이 정말로 안 보이는가
    const vis = () => page.evaluate(() => {
      const w = document.getElementById('ct-login-wrap'), h = document.getElementById('ct-login-hint');
      return { wrap: getComputedStyle(w).display, wrapShown: !!w.offsetParent, hint: !!h.offsetParent,
               gap: getComputedStyle(w).columnGap };
    });
    check('⑫-0 옛 서버(can_login 없음) → 칸은 보여 둔다(모르면 막지 않는다)', (await vis()).wrapShown, JSON.stringify(await vis()));
    canLogin = false;
    await page.evaluate(() => window.loadCenters()); await page.waitForTimeout(600);
    const off = await vis();
    check('⑫ can_login=false → 로그인 칸·안내가 화면에서 사라진다', off.wrap === 'none' && !off.wrapShown && !off.hint, JSON.stringify(off));
    canLogin = true;
    await page.evaluate(() => window.loadCenters()); await page.waitForTimeout(600);
    const on = await vis();
    // ⚠️ 부모가 flex 라 inline-flex 는 계산값이 'flex' 로 «승격» 된다(표준) — 물을 것은 «간격(gap)이 살아 있는가».
    check('⑫-1 can_login=true → 다시 보이고 칸 사이 간격(6px)도 그대로', on.wrapShown && on.hint && on.gap === '6px' && on.wrap !== 'none', JSON.stringify(on));
  } catch (e) {
    FAIL++; console.log('  FAIL 예외 — ' + e.message);
  } finally {
    await browser.close();
    srv.kill();
  }
  console.log(`\n결과: OK ${PASS} / FAIL ${FAIL}`);
  process.exit(FAIL ? 1 : 0);
})();
