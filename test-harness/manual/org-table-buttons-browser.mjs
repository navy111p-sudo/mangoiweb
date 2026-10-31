// -*- coding: utf-8 -*-
/* ═════════════════════════════════════════════════
   🏢 조직 3표(대리점·지사·대표지사)의 «표 안 작은 버튼» — 진짜 브라우저에 그려서 재는 검사
   (2026-09-11 신설 — 사장님 지시 「표 안 버튼이 커 보이는 것 고쳐줘」)

   [왜 필요한가] 이 사고는 **문자열 하니스로는 원리상 못 봅니다** — 인라인 style 도,
   CSS 규칙도 «둘 다 있고» 틀린 것은 «누가 이기는가» 뿐입니다(CLAUDE.md 2장
   「표 안의 작은 아이콘 버튼이 큰 파란 알약이 되어 옆 칸을 덮음」).
   그래서 getComputedStyle 로 실제 계산값을 잽니다.

   ⚠️ manual/ 규약상 파일 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않습니다.**
      admin-inline-c.css 의 버튼 블록이나 adm-core.js 의 세 표를 건드리면 사람이 부를 것:
        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
        PW_DIR=/tmp/pw node test-harness/manual/org-table-buttons-browser.mjs
   ═════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.ORGBTN_PORT || 8913);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

const CENTERS = {
  ok: true, can_edit: true, total: 1, limit: 50, offset: 0,
  counts: { all: 1, B2B: 0, B2C: 0, NONE: 1 },
  scope: { type: 'hq', label: '본사' },
  items: [{ id: 11, name: '테스트학원', franchise_id: 2, franchise_name: '서울지사',
            country: 'KR', manager: '홍길동', phone: '010-0000-0000', address: '서울시',
            payment_type: null, tuition_krw: 40000 }],
};
const FRANCHISES = { ok: true, can_edit: true, items: [
  { id: 2, name: '서울지사', owner_name: '김대표', phone: '021234567', address: '서울', opened_at: '2026-01-01', master_branch_id: null },
] };
const MASTERS = { ok: true, can_edit: true, items: [
  { id: 5, name: '수도권대표지사', region: '수도권', tier: '골드', owner_name: '이대표', phone: '021110000', branch_count: 3, active: 1 },
] };

(async () => {
  const { chromium, exe } = requireBrowser();
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    /* 🪤 스텁은 «포괄 먼저, 구체적인 것 나중» — route 는 나중에 등록한 것이 이긴다
          (CLAUDE.md 2장 「playwright 로 API 를 스텁했는데 화면이 안 채워짐」). */
    await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/admin/me*', r => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, username: 'admin', role: 'hq_exec', name: '관리자' }) }));
    await ctx.route('**/api/admin/centers*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CENTERS) }));
    await ctx.route('**/api/admin/franchises*', r => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(r.request().url().includes('master') ? MASTERS : FRANCHISES) }));

    const page = await ctx.newPage();
    // 🪤 «첫 방문자» 환영 오버레이가 클릭·스크롤을 막는다 — 본 것으로 표시하고 연다.
    await page.addInitScript(() => { try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch {} });
    await page.goto(BASE + '/admin.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // 🪤 IA6 는 카드를 «한 번에 한 장» 만 보여 준다 — 그 카드를 먼저 열지 않으면
    //    글자는 읽히는데 «보인다·눌린다» 검사만 헛돈다.
    await page.evaluate(() => {
      // 🪤 세 표는 «조직 관리» 카드 #card-franchises 안에 있고, 대리점은 그 안의 접이칸 #card-centers 다.
      if (window.jumpToMenu) window.jumpToMenu('card-franchises');
      if (window.loadCenters) window.loadCenters();
      if (window.loadFranchises) window.loadFranchises();
      if (window.loadMasterBranches) window.loadMasterBranches();
    });
    await page.waitForTimeout(1200);
    /* 🪤 세 표는 카드 «안의 접이칸»(details.sub-item) 에 들어 있다 — 카드만 열면 칸이 닫혀
          있어 버튼의 getBoundingClientRect() 가 **0×0** 이 된다. 그러면 「높이가 26px 이하」
          같은 검사가 **언제나 참**이 되어 통째로 헛돈다(2026-09-11 실제로 밟음).
          → 조상 <details> 를 전부 열고, 아래에서 «보이는가»(offsetParent)를 전제로 못 박는다. */
    await page.evaluate(() => {
      ['centers-table', 'franchises-table', 'mbranches-table'].forEach(id => {
        let n = document.getElementById(id);
        while (n && n !== document.documentElement) {
          if (n.tagName === 'DETAILS') n.open = true;
          // IA6 는 «고른 카드 한 장» 만 보여 준다 — 나머지는 .ia6-hide(display:none) 다.
          if (n.classList) n.classList.remove('ia6-hide');
          n = n.parentElement;
        }
      });
    });
    await page.waitForTimeout(900);

    const m = await page.evaluate(() => {
      const out = {};
      const meas = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { w: el.offsetWidth, h: el.offsetHeight, rectH: Math.round(r.height), pad: cs.padding,
                 bgImg: cs.backgroundImage, bgColor: cs.backgroundColor, color: cs.color,
                 fs: cs.fontSize, display: cs.display, vis: !!el.offsetParent };
      };
      out.ct   = meas('#centers-table td button.org-rowact');
      out.fr   = meas('#franchises-table td button.org-rowact');
      out.mbr  = meas('#mbranches-table td button.org-rowact[onclick^="mbrEdit"]');
      out.mtog = meas('#mbranches-table td button.org-rowact[onclick^="setMasterBranchActive"]');
      out.cancel = meas('#ct-cancel-btn');
      out.tuition = !!document.getElementById('ct-tuition');
      // 수정 폼이 수강료를 채우는가
      if (window.ctEdit) { try { window.ctEdit(11); } catch (e) { out.editErr = String(e); } }
      const t = document.getElementById('ct-tuition');
      out.tuitionVal = t ? t.value : null;
      const c = document.getElementById('ct-cancel-btn');
      out.cancelAfterEdit = c ? getComputedStyle(c).display : null;
      return out;
    });

    if (process.env.ORGBTN_DUMP) console.log('DUMP ' + JSON.stringify({ct:m.ct,fr:m.fr,mbr:m.mbr,mtog:m.mtog}));
    console.log('\n── 1. 표 안 「✏️ 수정」 버튼이 작게 그려지는가 ──');
    for (const [k, label] of [['ct','대리점'], ['fr','지사'], ['mbr','대표지사']]) {
      const b = m[k];
      check(`[${label}] 버튼이 그려졌다`, !!b, b ? '' : '요소 없음 — 스텁/카드 열기 확인');
      if (!b) continue;
      /* [전제] 화면에 «실제로 보이는가». 숨어 있으면 크기가 0×0 이라 아래 검사가 전부
         거짓으로 통과한다(CLAUDE.md 「IA6 는 카드를 한 번에 한 장만 보여 준다」). */
      check(`[${label}] [전제] 화면에 보인다 (0×0 이 아니다)`, b.vis === true && b.h > 0 && b.w > 0,
        `vis=${b.vis} ${b.w}x${b.h}`);
      /* 실측 기준(2026-09-11, offsetHeight = CSS 픽셀. ⚠️ 관리자 화면은 body{zoom:1.3} 이라
         getBoundingClientRect().height 는 1.3 이 곱해진 값이 나온다 — 그걸로 재면 안 된다).
           고치기 전 : padding 9px 18px · 인디고 그라데이션 · h=34
           고친 뒤   : padding 2px 8px  · bgImage none      · h=23
         ⚠️ font-size 는 **판별에 못 쓴다** — 전역 룰이 그 속성은 안 건드려서 앞뒤가 똑같다. */
      check(`[${label}] 인디고 그라데이션이 아니다 (bgImage=none)`, b.bgImg === 'none', b.bgImg);
      check(`[${label}] 전역 알약 padding(9px 18px)이 아니다`, b.pad !== '9px 18px', `pad=${b.pad}`);
      check(`[${label}] 높이가 28px 이하 (고치기 전 34px)`, b.h <= 28, `h=${b.h}`);
    }

    console.log('\n── 2. 대표지사 「🟢 사용중」 토글 ──');
    /* 이 버튼은 좁은 칸에서 「🟢 사용중」이 두 줄로 접혀 키가 더 크다 — 고치기 전 50 / 뒤 41. */
    check('토글도 되살아났다 (인디고 아님 · padding 작음 · h≤45)',
      !!m.mtog && m.mtog.bgImg === 'none' && m.mtog.pad !== '9px 18px' && m.mtog.h <= 45,
      m.mtog ? `h=${m.mtog.h} pad=${m.mtog.pad} bg=${m.mtog.bgImg}` : '요소 없음');

    console.log('\n── 3. 「취소」는 여전히 숨어 있다 (display 를 건드리지 않았는가) ──');
    /* ⛔ 새 CSS 블록이 display 를 정하면 «수정 모드에서만 보이는» 취소 버튼이 항상 보인다. */
    check('처음에는 안 보인다', !!m.cancel && m.cancel.display === 'none', m.cancel ? m.cancel.display : '요소 없음');
    check('✏️ 수정을 누르면 보인다', m.cancelAfterEdit && m.cancelAfterEdit !== 'none', String(m.cancelAfterEdit));

    console.log('\n── 4. 수정 폼의 「수강료」 칸 ──');
    check('수강료 입력칸이 폼에 있다', m.tuition === true);
    check('✏️ 수정을 누르면 지금 값이 채워진다 (40000)', m.tuitionVal === '40000', String(m.tuitionVal));
  } finally {
    await browser.close();
    srv.kill();
  }
  console.log('\n──────────────────────────────────────────');
  console.log(`  ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
  process.exit(FAIL ? 1 : 0);
})();
