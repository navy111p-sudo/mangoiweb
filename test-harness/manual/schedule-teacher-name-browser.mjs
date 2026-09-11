// -*- coding: utf-8 -*-
// 👩‍🏫 학생 상세 › 스케줄 › 「AI 등록 수업 스케줄」 카드의 담당 교사 이름 — 브라우저 검사 (2026-09-11)
//
//   왜 브라우저인가 —
//     이 자리는 «있는가» 가 아니라 «보이는가» 가 문제다. 문자열 하니스는 그 싸움을 원리상
//     못 본다 — 수리 전에도 `--fast` 가 전부 초록이었다.
//     ⚠️ 근거를 과장하지 말 것 — 실측(2026-09-11)으로 이 화면(`admin/student.html`)에는
//        `admin-inline-c.css`·`adm-s12`·`adm-s13` 이 **한 줄도 안 실린다**. 실제로 도는 것은
//        `adm-light-surfaces.js`(2988행) 하나이고, 그것이 배경과 글자색을 **인라인 `!important`**
//        로 덮는다. 그래서 이 검사는 «페인터가 구제해 준 값» 과 «소스가 준 색만으로의 값» 을
//        **짝으로** 잰다(CLAUDE.md 2026-09-09 「페인터가 구제해 준 값을 재고 안심하는 검사」).
//
//   무엇을 잡는가 —
//     ① 칩이 실제로 그려지고 폭·높이가 0 이 아닌가
//     ② 서버가 준 «이름» 이 나오는가 (그리고 번호가 이름 자리에 안 나오는가 — 짝)
//     ③ 이름을 못 풀면 «모른다» 고 말하는가 (빈칸은 «고장» 으로 읽힌다)
//     ④ 그 글자가 읽히는가 — «화면 대비» 와 «소스가 준 색만으로의 대비» 를 짝으로
//     ⑤ 믿을 수 없는 출처(source='ai_auto')의 이름을 그대로 그리지 않는가
//     ⑥ 이름에 HTML 이 섞여도 안 실행되는가 (teachers.name 은 사람이 넣는 값이다)
//     ⑦ 남이 덮고 있지 않은가 (elementFromPoint 맨 위가 그 칩인가)
//     ⑧ 변이시험 — 되돌리면 실제로 FAIL 나는가
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
const PORT = 8953;   // ⚠️ 8951 은 admin-search-browser.mjs 가 쓴다 — 겹치면 바인드 실패가 조용히 묻힌다
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
    teacher_id: null, teacher_name: null, status: 'active' },
  // 🔴 source='ai_auto' — teacher_id 가 «프로필 번호» 라 JOIN 이 남의 이름을 붙인다.
  //    실측(2026-09-11 운영 D1): 프로필 27 = Teacher Far · 원부 27 = MAIMAI(다른 사람).
  //    그래서 이 행에는 MAIMAI 가 나오면 «안 된다».
  { id: 9003, user_id: 'jeong', schedule_kind: 'recurring', class_type: 'regular',
    day_of_week: 'fri', start_time: '21:00', duration_min: 20, source: 'ai_auto',
    teacher_id: '27', teacher_name: 'MAIMAI', status: 'proposed' },
  // 이름은 사람이 넣는 값(teachers.name)이라 HTML 이 섞일 수 있다 — esc() 가 일해야 한다.
  { id: 9004, user_id: 'jeong', schedule_kind: 'recurring', class_type: 'regular',
    day_of_week: 'sat', start_time: '21:20', duration_min: 20,
    teacher_id: '30', teacher_name: '<img src=x onerror="window.__xss=1">', status: 'active' }
];
const N = ITEMS.length;

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
      xss: !!window.__xss,
      cards: document.querySelectorAll('#aiSchedulesList > div').length,
      chips: chips.map(el => {
        /* ⚠️ elementFromPoint 는 «뷰포트» 좌표를 받는다 — 화면 밖에 있는 칩은 null 이 돌아와
           «남이 덮었다» 로 잘못 읽힌다(화면 버그가 아니라 검사 문제). 재기 «전» 에 올린다. */
        el.scrollIntoView({ block: 'center' });
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
          inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
          topIsSelf: !!top && (top === el || el.contains(top))
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
    check('스케줄 카드가 ' + N + '장 그려졌다', m.cards === N, '실제 ' + m.cards);
    check('담당 교사 칩이 카드마다 하나씩 있다', m.chips.length === N, '실제 ' + m.chips.length);
    // ⚠️ 칩이 0개면 아래 forEach 검사들이 «FAIL 이 아니라 조용히 사라진다» — 그 자리를 FAIL 로 못 박는다.
    check('전제가 성립한다 (아래 칩별 검사가 헛돌지 않는다)', m.chips.length === N);

    console.log('\n② 보이는가 (「있다」와 「보인다」는 다르다)');
    for (let i = 0; i < N; i++) {
      const c = m.chips[i];
      check('칩 ' + (i + 1) + ' 이 화면에 그려진다 (display·폭·높이)',
        !!c && c.display !== 'none' && c.w > 0 && c.h > 0,
        c ? c.display + ' ' + Math.round(c.w) + 'x' + Math.round(c.h) : '칩 없음');
    }

    console.log('\n③ 무슨 글자가 나오는가 — 이름이 나오고, 번호는 안 나온다 (짝)');
    check('첫 칸에 원부 이름 MAIMAI 가 나온다', /MAIMAI/.test(m.chips[0]?.text || ''), m.chips[0]?.text);
    check('둘째 칸에 «중국어 강선생님» 이 나온다', /중국어 강선생님/.test(m.chips[1]?.text || ''), m.chips[1]?.text);
    check('번호(27·29·30·99999)가 이름 자리에 안 나온다',
      !m.chips.some(c => /\b(27|29|30|99999)\b/.test(c.text)),
      m.chips.map(c => c.text).join(' | '));

    console.log('\n④ 모르면 모른다고 말하는가 (빈칸은 «고장» 으로 읽힌다)');
    check('원부로 못 푼 행은 «강사 미확인»', /강사 미확인/.test(m.chips[2]?.text || ''), m.chips[2]?.text);
    check('강사가 안 붙은 행은 «미배정»', /미배정/.test(m.chips[3]?.text || ''), m.chips[3]?.text);
    check('어느 칩도 이름 자리가 비어 있지 않다',
      m.chips.length === N && m.chips.every(c => c.text.replace(/[^\p{L}\p{N}]/gu, '').length > 0));

    console.log('\n⑤ 믿을 수 없는 출처의 이름을 그대로 그리지 않는가 (짝 — ③이 반대쪽)');
    check('source=ai_auto 행은 JOIN 이 준 이름(MAIMAI)을 안 쓴다',
      !/MAIMAI/.test(m.chips[4]?.text || ''), m.chips[4]?.text);
    check('source=ai_auto 행은 «확인 필요» 라고 말한다',
      /확인 필요/.test(m.chips[4]?.text || ''), m.chips[4]?.text);

    console.log('\n⑥ 이름은 사람이 넣는 값이다 — HTML 이 섞여도 안 실행된다');
    check('teacher_name 의 <img onerror> 가 실행되지 않았다', m.xss === false, 'window.__xss=' + m.xss);
    check('그 이름이 글자 그대로 보인다', /<img src=x/.test(m.chips[5]?.text || ''), m.chips[5]?.text);

    console.log('\n⑦ 읽히는가 — «화면 대비» 와 «소스가 준 색만으로의 대비» 를 짝으로');
    // ⚠️ 화면 대비만 재면 «페인터가 인라인 !important 로 구제해 준 값» 을 재고 안심하게 된다.
    //    소스가 선언한 색은 화면에서 못 읽는다(페인터가 그 자리를 덮으므로) — 파일에서 읽어 온다.
    const decl = (readFileSync(PAGE, 'utf8').match(/class="mgt-chip" style="color:(#[0-9a-fA-F]{6})/) || [])[1];
    check('소스에서 칩의 선언 색을 읽어 냈다 (전제)', !!decl, String(decl));
    const declRgb = decl ? [1, 3, 5].map(i => parseInt(decl.slice(i, i + 2), 16)) : null;
    for (let i = 0; i < N; i++) {
      const c = m.chips[i];
      if (!c) { check('칩 ' + (i + 1) + ' 대비 — 칩이 없다', false); continue; }
      const need = c.fontSize >= 24 ? 3 : 4.5;
      const shown = contrast(c.color, c.bg);
      check('칩 ' + (i + 1) + ' 화면 대비 ' + shown.toFixed(2) + ' ≥ ' + need, shown >= need,
        'color=' + JSON.stringify(c.color) + ' bg=' + c.bg.map(Math.round).join(','));
      if (declRgb) {
        const raw = contrast(declRgb, c.bg);
        check('칩 ' + (i + 1) + ' 선언 색만으로도 ' + raw.toFixed(2) + ' ≥ ' + need +
              ' (페인터에 기대지 않는다)', raw >= need, decl + ' on ' + c.bg.map(Math.round).join(','));
      }
    }

    console.log('\n⑧ 남이 덮고 있지 않은가');
    // ⚠️ elementFromPoint 는 pointer-events:none 오버레이를 건너뛴다 — 이 절은 «칠해진 색» 까지는
    //    못 본다. 그런 오버레이가 이 카드에 생기면 색을 찍어 재는 절을 따로 두어야 한다.
    for (let i = 0; i < N; i++) {
      // 전제 — 화면 밖을 재면 언제나 «덮였다» 가 나온다(검사 문제이지 화면 버그가 아니다)
      check('칩 ' + (i + 1) + ' 을 뷰포트 «안» 에서 쟀다 (전제)', !!m.chips[i] && m.chips[i].inView);
      check('칩 ' + (i + 1) + ' 이 맨 위에 있다', !!m.chips[i] && m.chips[i].topIsSelf);
    }

    await ctx.close();

    console.log('\n⑨ 변이시험 — 되돌리면 실제로 FAIL 나는가');
    const orig = readFileSync(PAGE, 'utf8');
    const MUTS = [
      ['칩을 통째로 빼기 (고치기 전 상태)',
        s => s.replace(/\n\s*\+ '<span class="mgt-chip"[^\n]*teacherLabel\(it\)[^\n]*\n/, '\n')],
      ['이름 대신 번호를 그리기',
        s => s.replace("return tid ? '강사 미확인' : '미배정';", 'return tid || \'미배정\';')
              .replace('if (nm) return esc(nm);', 'if (nm) return esc(it.teacher_id || nm);')],
      ['못 풀면 빈칸으로 두기',
        s => s.replace("return tid ? '강사 미확인' : '미배정';", "return '';")],
      // ⛔ 「N종 전부 FAIL」을 적을 때 그 N 에 «조건 뒤집기» 가 들어 있는지 세어 볼 것 (CLAUDE.md 2026-09-05)
      ['ai_auto 가드를 «조건 뒤집기» 로 무력화',
        s => s.replace("if (src === 'ai_auto')", "if (src !== 'ai_auto' && false)")],
      ['ai_auto 가드를 통째로 빼기 (남의 이름이 그대로 붙는다)',
        s => s.replace(/\n\s*if \(src === 'ai_auto'\)[^\n]*\n/, '\n')],
      ['esc() 를 빼기 (이름은 사람이 넣는 값이다)',
        s => s.replace('if (nm) return esc(nm);', 'if (nm) return nm;')],
      ['선언 색을 페인터에 기대는 옛 값으로 되돌리기',
        s => s.replace('class="mgt-chip" style="color:#475467;', 'class="mgt-chip" style="color:#94a3b8;')]
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
        const declM = (readFileSync(PAGE, 'utf8').match(/class="mgt-chip" style="color:(#[0-9a-fA-F]{6})/) || [])[1];
        const declRgbM = declM ? [1, 3, 5].map(i => parseInt(declM.slice(i, i + 2), 16)) : null;
        broke = mm.chips.length !== N
          || mm.xss === true                                        // esc() 가 죽었다
          || texts.some(t => /\b(27|29|30|99999)\b/.test(t))        // 번호가 이름 자리에
          || texts.some(t => t.replace(/[^\p{L}\p{N}]/gu, '').length === 0)  // 빈칸
          || /MAIMAI/.test(texts[4] || '')                          // ai_auto 가 남의 이름을 붙였다
          || !/확인 필요/.test(texts[4] || '')
          || (declRgbM ? mm.chips.some(c => contrast(declRgbM, c.bg) < 4.5) : true);
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
