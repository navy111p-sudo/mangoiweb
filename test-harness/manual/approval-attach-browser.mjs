/*
 * 📎 결재 첨부 — 분류마다 «파일을 붙일 수 있는가» 를 실제 브라우저에서 확인한다 (2026-09-04)
 *
 *   [왜 만들었나]
 *     사장님 제보 — 「Document 를 눌렀는데 파일을 올릴 버튼이 없다」.
 *     `doc` 분류는 만들어질 때(2026-09-02)부터 wantsFile:false 라 **원래부터 없었다.**
 *
 *   [무엇이 걸려 있나]
 *     wantsFile 한 칸이 두 가지를 겸하고 있었다 —
 *       ① 화면에 첨부 버튼을 그릴까    ② 없으면 「영수증 첨부 없음」 경고를 낼까
 *     그래서 doc 에 버튼을 켜면 «일반 문서인데 영수증이 없다» 는 엉뚱한 경고가 따라온다.
 *     축을 갈랐다: wantsFile(붙일 수 있는가) · requiresFile(반드시 있어야 하는가).
 *
 *   [짝으로 본다]
 *     「doc 에 버튼이 뜬다」만 검사하면 **모든 분류에 뜨는 코드**도 통과한다.
 *     그래서 「긴급·고객불만에는 안 뜬다」와 「지출은 예전 그대로」를 함께 센다.
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-attach-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 결재 첨부를 건드리면 사람이 부르세요.
 */

import { requireBrowser, fileUrl } from './_pw.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const { chromium, exe } = requireBrowser();
const FILE = fileUrl('cloudflare-deploy/public/work.html');

/* 🔴 분류표를 **손으로 적지 않는다.**
   2026-09-04 에 실제로 밟았다 — 여기 TYPES 를 서버 값을 «본떠» 적어 두었더니,
   소스에서 doc 을 wantsFile:false 로 되돌리는 변이가 **13건 전부 통과**했다.
   검사가 소스를 한 번도 안 보고 내가 적은 값만 보고 있었던 것이다.
   ✅ 정본(approval-policy.ts)의 TYPES 를 읽어서, 서버가 화면에 내려주는 것과
      **같은 모양**(api-approval.ts 의 types 매핑)으로 바꿔 쓴다. */
const P = await import(
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', '..',
                     'cloudflare-deploy', 'src', 'approval-policy.ts')).href);

const TYPES = P.TYPES.map((t) => ({
  key: t.key, ko: t.ko, en: t.en,
  needs_amount: t.needsAmount,
  wants_file: t.wantsFile,
  requires_file: !!t.requiresFile,
  wants_dates: !!t.wantsDates,
  picks_period: t.key === 'hr',
}));

/* 전제 — 아래 검사들은 «붙일 수 있는 분류» 와 «없는 분류» 가 둘 다 있어야 뜻이 선다. */
const withFile = TYPES.filter((t) => t.wants_file).map((t) => t.ko);
const noFile   = TYPES.filter((t) => !t.wants_file).map((t) => t.ko);

const HOME = {
  ok: true,
  me: { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false },
  colleagues: [], my_delegate: null, can_approve: true, pending: 0,
  types: TYPES, inbox: [], mine: [], reuse: [], urgent: [],
};

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

/** 1×1 PNG (투명) — 진짜 이미지여야 shrink()·OCR 경로가 실제로 갈린다. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());

  await page.addInitScript((home) => {
    try { localStorage.setItem('mangoi_lang', 'ko'); } catch (e) {}
    window.__OCR_CALLS = 0;
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf('/api/approval/home') === 0) {
        return Promise.resolve(new Response(JSON.stringify(home), { status: 200 }));
      }
      if (u.indexOf('/api/approval/ocr') === 0) {
        window.__OCR_CALLS++;                       // 돈이 나가는 호출 — 세어 둔다
        return Promise.resolve(new Response(JSON.stringify({ ok: true, amount: 1234 }), { status: 200 }));
      }
      if (u.indexOf('/api/push/vapid-public-key') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, key: '' }), { status: 200 }));
      }
      return rf(u, o);
    };
  }, HOME);

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  /** 분류 버튼을 눌러 폼을 연다. */
  async function pick(ko) {
    await page.locator('#kinds button', { hasText: ko }).first().click();
    await page.waitForTimeout(250);
  }
  const shotText = () => page.evaluate(() => {
    const b = document.getElementById('b_shot');
    return b ? b.textContent : null;
  });

  /* ── ⓪ 검사가 헛돌지 않는가 ─────────────────────────────────────────── */
  console.log('\n[0] 전제 — 정본을 실제로 읽었는가');
  check('정본에서 분류표를 읽었다', TYPES.length >= 5, '읽은 분류 ' + TYPES.length + '개');
  check('«일반 문서» 가 첨부 가능으로 선언돼 있다',
        withFile.indexOf('일반 문서') >= 0, '붙일 수 있는 분류: ' + withFile.join(', '));
  check('첨부가 없는 분류도 남아 있다 (전부 켜 버린 것이 아니다)',
        noFile.length > 0, '없는 분류: ' + (noFile.join(', ') || '(없음)'));

  /* ── ① 사장님이 제보한 그 자리 ──────────────────────────────────────── */
  console.log('\n[1] 일반 문서 — 파일을 올릴 버튼이 있는가');

  await pick('일반 문서');
  const docBtn = await shotText();
  check('«일반 문서» 에 첨부 버튼이 있다', docBtn !== null, '실제: ' + JSON.stringify(docBtn));
  check('문구가 「영수증」이 아니다', !!docBtn && docBtn.indexOf('영수증') < 0, JSON.stringify(docBtn));
  check('무엇을 붙이는지 말한다 (사진·PDF)',
        !!docBtn && /사진|PDF/.test(docBtn), JSON.stringify(docBtn));

  const opensPicker = await page.evaluate(() => {
    const f = document.getElementById('f_file');
    if (!f) return 'no-input';
    let clicked = false;
    const orig = f.click; f.click = function () { clicked = true; };
    try { window.shoot(); } finally { f.click = orig; }
    return clicked ? 'ok' : 'not-clicked';
  });
  check('누르면 파일 선택창이 열린다', opensPicker === 'ok', opensPicker);

  /* ── ② 되던 것을 안 깨뜨렸는가 (짝 검사) ───────────────────────────── */
  console.log('\n[2] 다른 분류 — 예전 그대로인가');

  await pick('지출 정산');
  const expBtn = await shotText();
  check('«지출 정산» 은 여전히 「영수증 사진 찍기」',
        !!expBtn && expBtn.indexOf('영수증') >= 0, JSON.stringify(expBtn));

  await pick('물품 구입');
  const purBtn = await shotText();
  check('«물품 구입» 도 영수증 문구 그대로',
        !!purBtn && purBtn.indexOf('영수증') >= 0, JSON.stringify(purBtn));

  await pick('긴급 소통');
  check('«긴급 소통» 에는 첨부 버튼이 없다 (짝 검사 — 범위를 안 넓혔다)',
        (await shotText()) === null);

  await pick('고객 불만');
  check('«고객 불만» 에도 없다 (짝 검사)', (await shotText()) === null);

  /* ── ③ 사진을 붙였을 때 — 돈이 나가는 호출을 가르는가 ──────────────── */
  console.log('\n[3] 사진 첨부 — OCR 을 언제 부르는가');

  await pick('일반 문서');
  await page.setInputFiles('#f_file', {
    name: 'memo.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64'),
  });
  await page.waitForTimeout(900);
  const ocrAfterDoc = await page.evaluate(() => window.__OCR_CALLS);
  check('일반 문서는 OCR 을 부르지 않는다 (비용·엉뚱한 문구)', ocrAfterDoc === 0, '호출 ' + ocrAfterDoc + '회');

  const docNote = await page.evaluate(() => {
    const e = document.getElementById('autoNote'); return e ? e.textContent : '';
  });
  check('붙었다고 말한다', /첨부/.test(docNote), JSON.stringify(docNote));
  check('「영수증을 읽는 중」 같은 말을 하지 않는다', docNote.indexOf('영수증') < 0, JSON.stringify(docNote));

  await pick('지출 정산');
  await page.setInputFiles('#f_file', {
    name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64'),
  });
  await page.waitForTimeout(1200);
  const ocrAfterExp = await page.evaluate(() => window.__OCR_CALLS);
  check('지출 정산은 OCR 을 부른다 (짝 검사 — 자동채움이 죽지 않았다)',
        ocrAfterExp === 1, '호출 ' + ocrAfterExp + '회');

  /* ── ④ 조용한 실패가 없는가 ────────────────────────────────────────── */
  console.log('\n[4] 실행 중 오류');
  check('자바스크립트 오류가 없다', errors.length === 0, errors.join(' / '));

  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ⚠ ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건')
                   : ('  전부 통과 (' + PASS + '건)'));
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})();
