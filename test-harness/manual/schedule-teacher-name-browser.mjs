// -*- coding: utf-8 -*-
// 👩‍🏫 학생 상세 › 스케줄 › 「AI 등록 수업 스케줄」 카드의 담당 교사 이름 — 브라우저 검사 (2026-09-11)
//
//   왜 브라우저인가 —
//     이 자리는 «있는가» 가 아니라 «보이는가» 가 문제다. 관리자 카드 안 글자는
//     `admin-inline-c.css` 의 `[id^="card-"] :is(p,span,div,…){color:#101828!important}` 와
//     글자색 페인터 셋(adm-s12·adm-s13·adm-light-surfaces)이 인라인 style 을 덮는다.
//     문자열 하니스는 그 싸움을 원리상 못 본다 — 수리 전에도 `--fast` 가 전부 초록이었다.
//
//   무엇을 잡는가 —
//     ① 칩이 실제로 그려지고 폭·높이가 0 이 아닌가
//     ② 서버가 준 «이름» 이 나오는가 (그리고 번호가 이름 자리에 안 나오는가 — 짝)
//     ③ 이름을 못 풀면 «모른다» 고 말하는가 (빈칸은 «고장» 으로 읽힌다)
//     ④ 그 글자가 읽히는가 (WCAG 대비 — 11px 이라 4.5 필요)
//     ⑤ 남이 덮고 있지 않은가 (elementsFromPoint 맨 위가 그 칩인가)
//     ⑥ 변이시험 — 되돌리면 실제로 FAIL 나는가
//
//   ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/schedule-teacher-name-browser.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PAGE = join(PUBLIC, 'admin', 'student.html');
const PORT = 8951;
const BASE = `http://127.0.0.1:${PORT}`;
// 변이시험은 화면 파일을 «잠깐 고쳤다 되돌린다». 강제 종료에는 finally 가 안 도니
// 자르기 «전» 에 사본을 두고, 다음 실행이 그 사본을 «무엇보다 먼저» 되돌린다.
// ⛔ 이 블록을 아래 «건너뜀» 검사 뒤로 옮기지 말 것 — playwright 가 없는 기계에서
//    종료코드 0 으로 나가 버려 고친 파일이 안 돌아온다.
const BAK = PAGE + '.harness-bak';

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

if (existsSync(BAK)) {
  writeFileSync(PAGE, readFileSync(BAK, 'utf8'), 'utf8');
  unlinkSync(BAK);
  console.log('⚠️  지난 실행이 중간에 죽어 화면 파일이 고쳐진 채였습니다 — 사본에서 되돌렸습니다.');
}

const pw = loadPlaywright(), exe = findChromium();
if (!pw || !exe) {
  console.log('⏭  건너뜀 — playwright-core 또는 Chromium 이 없습니다.');
  console.log('   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core');
  process.exit(0);
}

// 스텁 — 서버가 teachers 원부를 LEFT JOIN 해 내려주는 모양 그대로
const ITEMS = [
  { id: 2332, user_id: 'jeong', schedule_kind: 'dated', class_type: 'trial',
    scheduled_date: '2026-09-11', start_time: '15:00', duration_min: 20,
    teacher_id: '27', teacher_name: 'MAIMAI', status: 'active' },
  { id: 848, user_id: 'jeong', schedule_kind: 'recurring', class_type: 'regular',
    day_of_week: 'tue', start_time: '19:20', duration_min: 20,
    teacher_id: '29', teacher_name: '중국어 강선생님', status: 'active' },
  // 원부로 못 푼 행 — «강사 미확인» 이라고 말해야 한다
  { id: 9001, user_id: 'jeong', schedule_kind: 'recurring', class_type: 'regular',
    day_of_week: 'wed', start_time: '20:00', duration_min: 20,
    teacher_id: '99999', teacher_name: null, status: 'active' },
  // 강사가 아예 안 붙은 행 — «미배정»
  { id: 9002, user_id: 'jeong', schedule_kind: 'recurring', class_type: 'regular',
    day_of_week: 'thu', start_time: '20:20', duration_min: 20,
    teacher_id: null, teacher_name: null, status: 'active' }
];

function srgb(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum([r, g, b]) { return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b); }
function contrast(a, b) { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
  { cwd: PUBLIC, stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch {} };
process.on('exit', stop);

async function openPage(browser) {
  // ⚠️ 회차마다 새 컨텍스트 — 스텁이 쌓이면 1회차 것이 계속 살아 모든 회차가 같은 답을 낸다.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  // ⚠️ 포괄을 «먼저» 깔고 구체적인 것을 «뒤에» — route 는 나중에 등록한 것이 이깁니다.
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await page.route('**/api/admin/class-schedules**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, count: ITEMS.length, items: ITEMS })
  }));
  // ⚠️ 로컬 서버 + 편집 뒤 재측정은 캐시를 두 겹 다 꺼야 «고치기 전» 사본을 안 본다.
  await ctx.route('**/*', r => r.continue());
  await page.goto(BASE + '/admin/student.html?uid=jeong&_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.click('.tab[data-tab="schedule"]').catch(() => {});
  await page.waitForSelector('#aiSchedulesList .mgt-chip', { timeout: 8000 }).catch(() => {});
  // 글자색 페인터(defer)가 한 번 돌 틈을 준다 — 이 검사가 재려는 것이 그 «뒤» 의 색이다.
  await page.waitForTimeout(1200);
  return { ctx, page };
}

async function measure(page) {
  return await page.evaluate(() => {
    function bg(el) {
      // 반투명은 불투명한 층을 만날 때까지 모아 두었다가 아래에서 위로 합성한다.
      const stack = [];
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        let c = cs.backgroundColor;
        if ((!c || c === 'transparent' || /rgba\(0, 0, 0, 0\)/.test(c)) && cs.backgroundImage && cs.backgroundImage !== 'none') {
          const m = cs.backgroundImage.match(/rgba?\([^)]+\)/g);
          if (m) c = m[0];
        }
        if (!c) continue;
        const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
        if (!m) continue;
        const a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (a === 0) continue;
        stack.push([+m[1], +m[2], +m[3], a]);
        if (a >= 1) break;
      }
      stack.push([255, 255, 255, 1]);
      let out = stack[stack.length - 1].slice(0, 3);
      for (let i = stack.length - 2; i >= 0; i--) {
        const [r, g, b, a] = stack[i];
        out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)];
      }
      return out;
    }
    function rgb(s) { const m = String(s).match(/(\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null; }
    const chips = [...document.querySelectorAll('#aiSchedulesList .mgt-chip')];
    return {
      cards: document.querySelectorAll('#aiSchedulesList > div').length,
      chips: chips.map(el => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
        const top = document.elementFromPoint(cx, cy);
        return {
          text: (el.textContent || '').trim(),
          display: cs.display, w: r.width, h: r.height,
          fontSize: parseFloat(cs.fontSize),
          color: rgb(cs.color), bg: bg(el),
          inlinePriority: el.style.getPropertyPriority('color'),
          topIsSelf: !!top && (top === el || el.contains(top) || el.contains(top) === false && top.closest('.mgt-chip') === el)
        };
      })
    };
  });
}

(async () => {
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const { ctx, page } = await openPage(browser);
    const m = await measure(page);

    console.log('\n① 전제 — 카드와 칩이 실제로 그려졌는가');
    check('스케줄 카드가 4장 그려졌다', m.cards === 4, '실제 ' + m.cards);
    check('담당 교사 칩이 카드마다 하나씩 있다', m.chips.length === 4, '실제 ' + m.chips.length);
    if (m.chips.length !== 4) { console.log('  ⚠️  전제가 깨졌습니다 — 아래 검사는 헛돕니다.'); }

    console.log('\n② 보이는가 (「있다」와 「보인다」는 다르다)');
    m.chips.forEach((c, i) => {
      check('칩 ' + (i + 1) + ' 이 화면에 그려진다 (display·폭·높이)',
        c.display !== 'none' && c.w > 0 && c.h > 0,
        c.display + ' ' + Math.round(c.w) + 'x' + Math.round(c.h));
    });

    console.log('\n③ 무슨 글자가 나오는가 — 이름이 나오고, 번호는 안 나온다 (짝)');
    check('첫 칸에 원부 이름 MAIMAI 가 나온다', /MAIMAI/.test(m.chips[0]?.text || ''), m.chips[0]?.text);
    check('둘째 칸에 «중국어 강선생님» 이 나온다', /중국어 강선생님/.test(m.chips[1]?.text || ''), m.chips[1]?.text);
    check('번호(27·29·99999)가 이름 자리에 안 나온다',
      !m.chips.some(c => /\b(27|29|99999)\b/.test(c.text)),
      m.chips.map(c => c.text).join(' | '));

    console.log('\n④ 모르면 모른다고 말하는가 (빈칸은 «고장» 으로 읽힌다)');
    check('원부로 못 푼 행은 «강사 미확인»', /강사 미확인/.test(m.chips[2]?.text || ''), m.chips[2]?.text);
    check('강사가 안 붙은 행은 «미배정»', /미배정/.test(m.chips[3]?.text || ''), m.chips[3]?.text);
    check('어느 칩도 이름 자리가 비어 있지 않다',
      m.chips.every(c => c.text.replace(/[^\p{L}\p{N}]/gu, '').length > 0));

    console.log('\n⑤ 읽히는가 (관리자 카드는 페인터 셋이 글자색을 덮는다)');
    m.chips.forEach((c, i) => {
      const ratio = c.color && c.bg ? contrast(c.color, c.bg) : 0;
      const need = c.fontSize >= 24 ? 3 : 4.5;
      check('칩 ' + (i + 1) + ' 대비 ' + ratio.toFixed(2) + ' ≥ ' + need,
        ratio >= need,
        'color=' + JSON.stringify(c.color) + ' bg=' + c.bg.map(Math.round).join(','));
    });

    console.log('\n⑥ 남이 덮고 있지 않은가');
    m.chips.forEach((c, i) => check('칩 ' + (i + 1) + ' 이 맨 위에 있다', c.topIsSelf));

    await ctx.close();

    console.log('\n⑦ 변이시험 — 되돌리면 실제로 FAIL 나는가');
    const orig = readFileSync(PAGE, 'utf8');
    const MUTS = [
      ['칩을 통째로 빼기 (고치기 전 상태)',
        s => s.replace(/\n\s*\+ '<span class="mgt-chip"[^\n]*teacherLabel\(it\)[^\n]*\n/, '\n')],
      ['이름 대신 번호를 그리기',
        s => s.replace('return tid ? \'강사 미확인\' : \'미배정\';', 'return tid || \'미배정\';')
              .replace('if (nm) return esc(nm);', 'if (nm) return esc(it.teacher_id || nm);')],
      ['못 풀면 빈칸으로 두기',
        s => s.replace('return tid ? \'강사 미확인\' : \'미배정\';', "return '';")]
    ];
    for (const [name, fn] of MUTS) {
      const mutated = fn(orig);
      if (mutated === orig) { check('변이 「' + name + '」 가 소스를 실제로 바꿨다', false, '패턴 불일치'); continue; }
      writeFileSync(BAK, orig, 'utf8');
      writeFileSync(PAGE, mutated, 'utf8');
      let broke = false;
      try {
        const r = await openPage(browser);
        const mm = await measure(r.page);
        const texts = mm.chips.map(c => c.text);
        broke = mm.chips.length !== 4
          || texts.some(t => /\b(27|29|99999)\b/.test(t))
          || texts.some(t => t.replace(/[^\p{L}\p{N}]/gu, '').length === 0);
        await r.ctx.close();
      } catch { broke = true; }
      writeFileSync(PAGE, orig, 'utf8');
      try { unlinkSync(BAK); } catch {}
      check('변이 「' + name + '」 → 실제로 FAIL 난다', broke);
    }
  } finally {
    await browser.close().catch(() => {});
    stop();
  }
  console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
