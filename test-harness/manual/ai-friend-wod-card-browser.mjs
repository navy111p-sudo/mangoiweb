// -*- coding: utf-8 -*-
/* ai-friend-wod-card-browser.mjs — «오늘의 단어» 첫 화면 카드 (2026-09-09)
 *
 * ⚠️ 자동으로 안 돕니다. 사람이 부릅니다:
 *      cd cloudflare-deploy/public && python3 -m http.server 8953 &
 *      PW_DIR=/tmp/pw AIF_URL=http://127.0.0.1:8953/ai-friend.html \
 *        node test-harness/manual/ai-friend-wod-card-browser.mjs
 *
 * 왜 «브라우저» 여야 하나
 *   문자열로는 원리상 안 보이는 것 셋을 잽니다.
 *     ① 칩을 «옮겼는가»(새로 만들면 updateHUD 의 getElementById 가 null → 그 함수는
 *        null 검사가 없어 «던지고», 그 뒤 퀘스트 갱신 4줄이 통째로 죽습니다)
 *     ② 첫 화면에만 «보이는가» — 대화가 시작되면 자리를 비워야 합니다
 *     ③ 「보인다」와 「눌린다」는 다릅니다(발음 듣기가 이 카드의 존재 이유)
 */
import { loadPlaywright, findChromium } from './_pw.mjs';

const URL = process.env.AIF_URL || 'http://127.0.0.1:8953/ai-friend.html';
const pw = loadPlaywright();
if (!pw) { console.log('⏭ playwright 없음 — 건너뜁니다'); process.exit(0); }
const exe = findChromium();
if (!exe) { console.log('⏭ Chromium 없음 — 건너뜁니다'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  c ? (pass++, console.log('  ✅ ' + m))
    : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : '')));
};

const SIZES = [['PC 1280x800',1280,800], ['폰 390x844',390,844], ['작은 폰 320x640',320,640]];
const b = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

for (const [tag, w, h] of SIZES) {
  console.log(`\n■ ${tag}`);
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  /* ⚠️ 포괄 스텁을 «먼저» 깔고 구체적인 것을 뒤에 — route 는 나중에 등록한 것이 이긴다
     (CLAUDE.md 「playwright 로 API 를 스텁했는데 화면이 안 채워짐」).
     ⚠️ 그리고 «인증» 을 제대로 돌려줘야 한다 — 안 그러면 sendMsg 가 인증 실패로 일찍
        돌아가 대화창을 지우지 않고, 그게 «카드가 안 비켜난다» 는 거짓 실패가 된다. */
  const J = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  await p.route('**/api/**', r => r.fulfill(J({ ok: true, items: [] })));
  await p.route('**/api/ai/chat-guest-token', r => r.fulfill(J({
    ok: true, uid: 'guest_probe', token: 'probe.token' })));
  await p.route('**/api/ai/chat-friend', r => r.fulfill(J({
    ok: true, reply: 'Hi there!', gam: null })));
  await p.goto(URL + '?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);

  const m = await p.evaluate(() => {
    const card = document.getElementById('wodCard');
    const chip = document.getElementById('wodChip');
    const r = chip ? chip.getBoundingClientRect() : null;
    /* 「보인다」와 「눌린다」는 다르다 — 그 자리의 «맨 위» 가 자기인지 본다 */
    let top = null;
    if (r && r.width > 0) {
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      top = el && (chip.contains(el) || chip === el);
    }
    return {
      cardExists: !!card,
      inCard: !!document.querySelector('#wodSlot #wodChip'),   // 빈 화면 «안» 이어야 한다
      inSheet: !!document.querySelector('#optsSheet #wodChip'),
      hidden: !document.querySelector('#wodSlot #wodChip'),
      /* 카드가 «대화창 높이를 먹지 않는가» — 주차장은 늘 숨어 있어야 한다 */
      parkTakesSpace: card ? card.getBoundingClientRect().height > 0 : null,
      onFirstScreen: !!r && r.top >= 0 && r.top < innerHeight,
      wide: !!r && r.width > 0 && r.height > 0,
      clickable: top,
      /* 발음 듣기가 이 카드의 존재 이유다 — 그 길이 살아 있는가 */
      hasTap: !!chip && !!chip.getAttribute('onclick'),
      tapLabel: !!chip && !!(chip.getAttribute('data-tap') || '').trim(),
      /* i18n 엔진이 카드 «안» 글자를 갈아끼우지 않는가 — data-ko/data-en 은 금지다 */
      chipHasKoAttr: !!chip && chip.hasAttribute('data-ko'),
      /* updateHUD 가 쓰는 id 가 전부 살아 있는가 (옮겼으면 살아 있어야 한다) */
      dead: ['wodEn','wodKo','wodEmoji','wodChip','streakN','ptsN','qTalkN','lvName','xpFill']
        .filter(id => !document.getElementById(id)),
      empty: !!document.querySelector('.empty-state'),
    };
  });

  ok(m.cardExists, '카드 자리(#wodCard)가 있다');
  ok(m.inCard && !m.inSheet, '오늘의 단어가 «시트» 가 아니라 «첫 화면 카드» 에 있다',
    m.inSheet ? '아직 시트 안이다' : '카드 안에서 못 찾음');
  ok(m.hidden === false && m.wide, '첫 화면에서 보인다');
  ok(m.parkTakesSpace === false, '주차장(#wodCard)이 높이를 먹지 않는다',
    '밖에 두면 대화창이 그만큼 줄어든다 — PC 1280 에서 52.6% 까지 내려갔었다');
  ok(m.onFirstScreen, '스크롤 없이 화면 안에 있다');
  ok(m.clickable === true, '실제로 눌린다(가려지지 않았다)');
  ok(m.hasTap, '눌러서 발음 듣는 길이 살아 있다(onclick)');
  ok(m.tapLabel, '«눌러서 들어요» 안내 글자가 있다 — 폰엔 hover 가 없어 title 은 안 뜬다');
  ok(!m.chipHasKoAttr,
    '카드 칩에 data-ko 를 달지 않았다(달면 i18n 엔진이 안 글자를 통째로 갈아끼운다)');
  ok(m.dead.length === 0, '옮긴 뒤에도 갱신 대상 id 가 전부 살아 있다',
    '사라진 id: ' + m.dead.join(', '));

  /* ── 🗑 대화 초기화 — «진짜 경로»(clearChat)로.
     🔴 이 절은 반드시 «빈 화면일 때»(칩이 슬롯 안) 돌아야 한다. 대화 중에는 칩이 이미
        주차장에 있어 innerHTML 이 건드릴 것이 없고, 그러면 피신 호출을 지워도 통과한다
        (변이시험 실측 — 그래서 sendMsg 절 «앞» 으로 옮겼다).
     ⛔ renderEmpty() 를 직접 부르면 clearChat 의 피신 호출을 지워도 통과한다
        (변이시험 실측). clearChat 도 대화창을 innerHTML 로 통째로 지운다. */
  await p.evaluate(() => { window.confirm = () => true; });
  await p.evaluate(() => clearChat());
  await p.waitForTimeout(700);
  const back = await p.evaluate(() => ({
    hidden: !document.querySelector('#wodSlot #wodChip'),
    inCard: !!document.querySelector('#wodSlot #wodChip'),
    chipAlive: !!document.getElementById('wodChip'),
  }));
  ok(back.chipAlive, '대화 초기화로도 칩이 파괴되지 않는다',
    '피신이 빠지면 innerHTML 이 통째로 지운다');
  ok(back.hidden === false && back.inCard, '대화를 지우면 카드가 다시 보인다');


  /* ── 대화가 시작되면 자리를 비우는가 ────────────────────────────
     ⛔ «숨겨라» 를 직접 부르지 말 것 — 화면이 실제로 쓰는 길(말풍선 붙이기)로 확인한다. */
  const after = await (async () => {
    await p.evaluate(() => {
    /* 🔴 «진짜 경로» 로 보낸다 — wodPark() 를 직접 부르면 «함수» 만 재고 «배선» 은
       안 재게 된다(피신 호출을 지우는 변이가 그대로 통과했다. 변이시험 실측). */
    document.getElementById('msgInput').value = 'hello';
    sendMsg();
    });
    await p.waitForTimeout(700);          // sendMsg 는 async — 지우기가 await 뒤에 있다
    return p.evaluate(() => {
      let threw = '';
      try { updateHUD(); } catch (e) { threw = String(e).slice(0, 120); }
      return { hidden: !document.querySelector('#wodSlot #wodChip'),
               chipAlive: !!document.getElementById('wodChip'),
               parkH: document.getElementById('wodCard').getBoundingClientRect().height,
               threw: threw };
    });
  })();
  ok(after.hidden === true, '대화가 시작되면 카드가 자리를 비운다');
  ok(after.chipAlive, '자리를 비워도 칩이 «파괴되지 않는다»(숨김이지 삭제가 아니다)');
  ok(!after.threw, 'updateHUD() 가 던지지 않는다 — 던지면 퀘스트 갱신 4줄이 함께 죽는다',
    after.threw);
  ok(after.parkH === 0, '대화 중에도 주차장이 높이를 먹지 않는다', '높이 ' + after.parkH + 'px');

  ok(errs.length === 0, 'JS 오류가 없다', errs.join(' | '));
  await ctx.close();
}

await b.close();
console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
