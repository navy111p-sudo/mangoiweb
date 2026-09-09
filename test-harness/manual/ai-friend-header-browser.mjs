// -*- coding: utf-8 -*-
/* ai-friend-header-browser.mjs — AI 영어친구 헤더 A안 «말끔한 한 줄» 브라우저 검사
 *
 * ⚠️ 자동으로 안 돕니다. 사람이 부릅니다:
 *      cd cloudflare-deploy/public && python3 -m http.server 8952 &
 *      PW_DIR=/tmp/pw AIF_URL=http://127.0.0.1:8952/ai-friend.html \
 *        node test-harness/manual/ai-friend-header-browser.mjs
 *
 * 왜 «브라우저» 여야 하나
 *   문자열 하니스(ai_friend_header_harness.mjs)는 «구조 계약» 까지만 봅니다.
 *   이 화면에서 실제로 밟은 결함 둘은 문자열로 원리상 안 보였습니다:
 *     ① ⚙·🔊 가 공용 상단바(#mangoi-global-bar, fixed·z=99999)에 «가려져» 안 눌림
 *        — 헤더가 얇아지는 순간 세로로 겹칩니다. display 로는 «보인다» 로 나옵니다.
 *     ② 칩 옮기기가 «에러 없이» 건너뛰어짐 — 시트가 document 에 붙기 전이라
 *        getElementById 가 null 이었습니다.
 *
 * ⛔ 「보인다」·「눌린다」·「한 줄이다」는 서로 다른 값입니다. 셋 다 잽니다.
 */
import { loadPlaywright, findChromium } from './_pw.mjs';

const URL = process.env.AIF_URL || 'http://127.0.0.1:8952/ai-friend.html';
const pw = loadPlaywright();
if (!pw) { console.log('⏭ playwright 없음 — 건너뜁니다 (PW_DIR 안내는 _pw.mjs 참고)'); process.exit(0); }
const exe = findChromium();
if (!exe) { console.log('⏭ Chromium 없음 — 건너뜁니다'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  c ? (pass++, console.log('  ✅ ' + m))
    : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : '')));
};

/* 고치기 전 실측값 — 줄었는지 견주는 기준선 */
const BEFORE = { 'PC 1920x1080': 390, 'PC 1280x800': 390,
                 '폰 390x844': 342, '폰 360x640': 342, '작은 폰 320x640': 342 };
const SIZES = [['PC 1920x1080',1920,1080], ['PC 1280x800',1280,800],
               ['폰 390x844',390,844], ['폰 360x640',360,640],
               /* ⚠️ 320px 는 이 저장소가 실제로 밟은 폭이다(「100vw 가 스크롤바를 포함」).
                  헤더에 여덟 자리를 두었으니 제일 좁은 폭에서 넘치는지 반드시 잰다. */
               ['작은 폰 320x640',320,640]];

const b = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

for (const [tag, w, h] of SIZES) {
  console.log(`\n■ ${tag}`);
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.route('**/api/**', r => r.fulfill({
    status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await p.goto(URL + '?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2300);

  const m = await p.evaluate(() => {
    const top = document.querySelector('.top');
    const chat = document.querySelector('.chat');
    const kids = [...top.children].filter(e => e.offsetParent !== null);
    const rs = kids.map(e => e.getBoundingClientRect());
    /* 한 줄인가 = 모든 자식이 세로로 «겹치는가».
       ⚠️ align-items:center 라 top 좌표는 제각각이다 — top 을 비교하면 멀쩡한 한 줄을
          «두 줄» 로 오판한다(실제로 그렇게 짰다가 잡았다). */
    const oneRow = rs.every(a => rs.every(x => a.top < x.bottom && x.top < a.bottom));
    /* 「가려짐」 — 누를 수 있는 것마다 그 자리의 «맨 위» 가 자기인지 */
    const covered = [];
    for (const el of top.querySelectorAll('button, a')) {
      if (!el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (t && !el.contains(t) && el !== t) {
        covered.push((el.id || String(el.className).split(' ')[0]) + ' ← '
          + (t.closest('[id]') ? '#' + t.closest('[id]').id : t.tagName));
      }
    }
    const name = document.querySelector('.top .name');
    return {
      headerTop: Math.round(chat.getBoundingClientRect().top),
      topH: Math.round(top.getBoundingClientRect().height),
      chatH: Math.round(chat.getBoundingClientRect().height),
      vh: innerHeight, oneRow, covered,
      overflow: top.scrollWidth > top.clientWidth + 1,
      nameClipped: !!name && name.scrollWidth > name.clientWidth + 1,
      nameText: name ? name.textContent.trim() : '',
      /* ⚙ 요약 — 폰에서는 «레벨» 만 접고 «자막·소리가 꺼져 있다» 표시(👁·🔇)는 남아야 한다.
         🔴 한때 .ot-sum 을 통째로 숨겨, 끈 학생이 되돌아올 길이 화면에서 사라졌다. */
      flagBox: (() => {
        const f = document.querySelector('#optsToggle .ot-flag');
        if (!f) return { has: false };
        /* ⚠️ 비어 있을 때는 «안 보이는 것이 정상» 이다(.ot-flag:empty). 그래서 그냥 재면
           «꺼진 것이 없는» 화면에서 늘 false 가 나온다 — 표시를 넣어 보고 판정한다. */
        const keep = f.textContent;
        f.textContent = '👁';
        const shown = getComputedStyle(f).display !== 'none'
          && f.getBoundingClientRect().width > 0;
        f.textContent = keep;
        return { has: true, shown: shown };
      })(),
      /* 🌐 옆 글자(«EN»/«한국어») — 누르면 무슨 말이 되는지 알려 주는 유일한 자리 */
      langLabelShown: (() => {
        const l = document.querySelector('.top #mangoi-global-bar .lang-label-sync');
        return l ? getComputedStyle(l).display !== 'none' && l.textContent.trim().length > 0 : false;
      })(),
      streakInTop: !!document.querySelector('.top #streakChip'),
      ptsInTop: !!document.querySelector('.top #ptsChip'),
      optsInSheet: !!document.querySelector('#optsSheet .opts'),
      questsInSheet: !!document.querySelector('#optsSheet .quests'),
      sndInSheet: !!document.querySelector('#optsSheet .snd-toggle'),
      clearInSheet: !!document.querySelector('#optsSheet .clear-btn'),
      barInTop: !!document.querySelector('.top #mangoi-global-bar'),
      barFixed: (() => { const g = document.getElementById('mangoi-global-bar');
        return g ? getComputedStyle(g).position : '없음'; })(),
      /* 옮긴 요소들이 «살아 있는가» — id 로 갱신하는 코드가 여럿이라 이게 핵심이다 */
      alive: ['streakN','ptsN','qTalkN','lvName','xpFill','wodEn']
        .filter(id => !document.getElementById(id)),
    };
  });

  const before = BEFORE[tag];
  ok(m.headerTop < before, `상단이 줄었다 — ${before}px → ${m.headerTop}px `
    + `(화면의 ${(m.headerTop / m.vh * 100).toFixed(1)}%)`);
  ok(m.chatH / m.vh > 0.55, `대화창이 화면의 절반을 넘는다 — ${(m.chatH / m.vh * 100).toFixed(1)}%`);
  ok(m.oneRow, '헤더가 한 줄이다');
  ok(!m.overflow, '헤더가 가로로 넘치지 않는다');
  ok(!m.nameClipped, `친구 이름이 안 잘린다 («${m.nameText}»)`);
  ok(m.covered.length === 0, '헤더 조작이 다른 것에 가려지지 않는다', m.covered.join(' · '));
  ok(m.barInTop && m.barFixed !== 'fixed',
    `공용 바(🏠 홈 · 🌐 EN)가 헤더 안에 합쳐졌다 (position:${m.barFixed})`);
  ok(m.streakInTop && m.ptsInTop, '연속일·오늘 포인트는 헤더에 남아 있다');
  ok(m.optsInSheet && m.questsInSheet && m.sndInSheet && m.clearInSheet,
    '설정·퀘스트·소리·대화초기화는 시트 안에 있다');
  ok(m.alive.length === 0, '옮긴 뒤에도 갱신 대상이 전부 살아 있다', '사라진 id: ' + m.alive.join(', '));
  ok(m.flagBox.has && m.flagBox.shown,
    '⚙ 옆 «꺼짐» 표시 자리(👁·🔇)가 살아 있다',
    m.flagBox.has ? '.ot-flag 가 display:none 이다' : '.ot-flag 가 없다');
  ok(m.langLabelShown, '🌐 옆 언어 글자(«EN»/«한국어»)가 보인다 — 무엇으로 바뀌는지 알 수 있다');

  /* 시트 열고 — 실제로 눌리는지까지.
     ⚠️ 클릭이 막히면(다른 것이 덮고 있으면) playwright 가 던진다. 그대로 두면 검사가
        «크래시» 해서 무엇이 깨졌는지 안 보인다 — 깔끔한 FAIL 로 바꾼다. */
  let clicked = true;
  try { await p.click('#optsToggle', { timeout: 4000 }); }
  catch (e) { clicked = false; ok(false, '⚙ 를 누를 수 있다', String(e).slice(0, 160)); }
  await p.waitForTimeout(480);
  const o = await p.evaluate(() => {
    const sh = document.getElementById('optsSheet');
    const r = sh.getBoundingClientRect();
    /* ⚠️ 시트는 길어서 아래쪽 버튼이 «화면 밖» 일 수 있다 — 그건 «가려짐» 이 아니라
       «스크롤하면 닿음» 이다. 둘을 섞으면 멀쩡한 화면이 실패로 나온다(실제로 그랬다).
       그래서 먼저 그 자리로 굴린 뒤 «맨 위가 나인가» 를 묻는다. */
    const probe = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      if (b.top < 0 || b.bottom > innerHeight) return 'off';   // 굴려도 화면 밖이면 진짜 문제
      const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!(t && sh.contains(t));
    };
    return { shown: r.top < innerHeight - 20,
      level: probe('#optsSheet .opt[data-level="S1"]'),
      sub:   probe('#optsSheet .opt[data-sub="off"]'),
      voice: probe('#optsSheet .opt[data-voice="jake"]'),
      snd:   probe('#optsSheet .snd-toggle'),
      expanded: document.getElementById('optsToggle').getAttribute('aria-expanded') };
  });
  ok(o.shown && o.expanded === 'true', '⚙ 를 누르면 시트가 열린다');
  ok(o.level === true && o.sub === true && o.voice === true && o.snd === true,
    '시트 안 레벨·자막·친구·소리 버튼이 실제로 눌린다',
    `레벨 ${o.level} 자막 ${o.sub} 친구 ${o.voice} 소리 ${o.snd}`);

  await p.keyboard.press('Escape');
  await p.waitForTimeout(420);
  const closed = await p.evaluate(() =>
    document.getElementById('optsSheet').getBoundingClientRect().top >= innerHeight - 4
    && document.getElementById('optsToggle').getAttribute('aria-expanded') === 'false');
  ok(closed, 'Esc 로 닫힌다');

  ok(errs.length === 0, 'JS 오류가 없다', errs.join(' | '));
  await ctx.close();
}

await b.close();
console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
