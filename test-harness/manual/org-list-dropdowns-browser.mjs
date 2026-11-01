// -*- coding: utf-8 -*-
/* ═════════════════════════════════════════════════
   🔽 조직 3표(대리점·지사·대표지사) 검색칸 «왼쪽» 드롭다운 — 진짜 브라우저로 재는 검사
   (2026-10-10 신설 — 사장님 「여기도 드롭다운 칸을 모두 만들어줘」)

   · 대리점 목록 #ct-fid = 지사 선택 → 서버에 franchise_id 로 보낸다(이름이 아니라 id)
   · 지사 목록 = 대표지사 선택(행 안 배정 드롭다운 값으로 거름, «미지정» 따로)
   · 대표지사 목록 = 담당권역 · 상태
   「거른다」 옆에 «전체로 되돌리면 다 보인다» 를 짝으로 둔다(짝이 없으면 «전부 숨기기» 도 통과).

   ⚠️ manual/ — 게이트가 물어 가지 않습니다. 사람이 부를 것:
        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
        PW_DIR=/tmp/pw node test-harness/manual/org-list-dropdowns-browser.mjs
   ═════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.ORGDROP_PORT || 8917);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

const C = (id, name, fid, fname) => ({ id, name, franchise_id: fid, franchise_name: fname, country: 'KR',
  manager: '원장', phone: '010', address: '주소', payment_type: null, tuition_krw: null });
const ALL_CENTERS = [C(11, '가학원', 2, '서울지사'), C(12, '나학원', 3, '부산지사'), C(13, '다학원', 2, '서울지사')];
const FRANCHISES = { ok: true, can_edit: true, items: [
  { id: 2, name: '서울지사', owner_name: '김', phone: '02', address: '서울', opened_at: '', master_branch_id: 5 },
  { id: 3, name: '부산지사', owner_name: '박', phone: '051', address: '부산', opened_at: '', master_branch_id: null },
  { id: 4, name: '인천지사', owner_name: '최', phone: '032', address: '인천', opened_at: '', master_branch_id: 5 },
] };
const MASTERS = { ok: true, can_edit: true, items: [
  { id: 5, name: '수도권대표지사', region: '수도권', owner_name: '이', phone: '02', branch_count: 2, active: 1 },
  { id: 6, name: '영남대표지사', region: '영남', owner_name: '정', phone: '051', branch_count: 0, active: 1 },
] };

(async () => {
  const { chromium, exe } = requireBrowser();
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const seenFid = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/admin/me*', r => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, username: 'admin', role: 'hq_exec', name: '관리자' }) }));
    await ctx.route('**/api/admin/centers*', r => {
      const u = new URL(r.request().url());
      const fid = u.searchParams.get('franchise_id') || '';
      seenFid.push(fid);
      const items = fid ? ALL_CENTERS.filter(c => String(c.franchise_id) === fid) : ALL_CENTERS;
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, can_edit: true,
        total: items.length, limit: 50, offset: 0, counts: { all: items.length, B2B: 0, B2C: 0, NONE: items.length }, items }) });
    });
    await ctx.route('**/api/admin/franchises*', r => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(r.request().url().includes('master') ? MASTERS : FRANCHISES) }));

    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch {} });
    await page.goto(BASE + '/admin.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      if (window.jumpToMenu) window.jumpToMenu('card-franchises');
      document.querySelectorAll('#card-franchises details').forEach(d => { d.open = true; });
      if (window.loadFranchises) window.loadFranchises();
      if (window.loadMasterBranches) window.loadMasterBranches();
      if (window.loadCenters) window.loadCenters();
    });
    await page.waitForTimeout(2200);

    // ── ① 대리점 목록 — 지사 드롭다운
    const ct = await page.evaluate(() => {
      const s = document.getElementById('ct-fid'); const q = document.getElementById('ct-q');
      if (!s) return null;
      const r = s.getBoundingClientRect(), rq = q.getBoundingClientRect();
      return { n: s.options.length, first: s.options[0].textContent, left: r.right <= rq.left + 1, vis: !!s.offsetParent };
    });
    check('① 대리점 검색칸 옆에 «지사 선택» 드롭다운이 있다', !!ct, 'ct-fid 없음');
    if (ct) {
      check('①-1 첫 칸은 «전체», 그 뒤에 지사 3곳', ct.n === 4 && /전체/.test(ct.first), JSON.stringify(ct));
      check('①-2 검색칸 «왼쪽» 에 보인다', ct.vis && ct.left, JSON.stringify(ct));
    }
    seenFid.length = 0;
    await page.selectOption('#ct-fid', '2'); await page.waitForTimeout(700);
    const ctRows = () => page.evaluate(() => Array.from(document.querySelectorAll('#centers-table tr')).filter(r => !r.querySelector('td.empty')).length);
    check('①-3 지사를 고르면 서버에 franchise_id=2 로 묻는다', seenFid.includes('2'), JSON.stringify(seenFid));
    check('①-4 그 지사 대리점만 보인다(2곳)', (await ctRows()) === 2);
    await page.selectOption('#ct-fid', ''); await page.waitForTimeout(700);
    check('①-5 «전체» 로 되돌리면 3곳 전부(짝)', (await ctRows()) === 3);

    // ── ② 지사 목록 — 대표지사 드롭다운
    const vis = id => page.evaluate(id => Array.from(document.querySelectorAll('#' + id + ' tr'))
      .filter(r => !r.querySelector('td.empty') && r.style.display !== 'none').length, id);
    const frSel = '#franchises-table-drop-m';
    check('② 지사 목록에 «대표지사 선택» 드롭다운이 있다', !!(await page.$(frSel)));
    const frOpts = await page.evaluate(s => { const e = document.querySelector(s); return e ? Array.from(e.options).map(o => o.textContent) : []; }, frSel);
    check('②-1 «전체·미지정·수도권·영남» 이 다 있다', frOpts.length === 4 && /전체/.test(frOpts[0]) && frOpts.some(t => /미지정/.test(t)), JSON.stringify(frOpts));
    await page.selectOption(frSel, '5'); await page.waitForTimeout(300);
    check('②-2 수도권대표지사 → 서울·인천 2곳', (await vis('franchises-table')) === 2);
    await page.selectOption(frSel, '__none__'); await page.waitForTimeout(300);
    check('②-3 미지정 → 부산 1곳', (await vis('franchises-table')) === 1);
    await page.selectOption(frSel, ''); await page.waitForTimeout(300);
    check('②-4 «전체» 로 되돌리면 3곳(짝)', (await vis('franchises-table')) === 3);

    // ── ③ 대표지사 목록 — 담당권역·상태
    const rgSel = '#mbranches-table-drop-2', stSel = '#mbranches-table-drop-7';
    check('③ 대표지사 목록에 «담당권역» 드롭다운', !!(await page.$(rgSel)));
    check('③-1 대표지사 목록에 «상태» 드롭다운', !!(await page.$(stSel)));
    await page.selectOption(rgSel, '영남'); await page.waitForTimeout(300);
    check('③-2 영남 → 1곳', (await vis('mbranches-table')) === 1);
    await page.selectOption(rgSel, ''); await page.waitForTimeout(300);
    check('③-3 «전체» → 2곳(짝)', (await vis('mbranches-table')) === 2);
  } catch (e) {
    FAIL++; console.log('  FAIL 크래시 — ' + (e && e.message || e));
  } finally {
    await browser.close(); srv.kill();
  }
  console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
  process.exit(FAIL ? 1 : 0);
})();
