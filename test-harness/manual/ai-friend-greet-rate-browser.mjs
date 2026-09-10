// -*- coding: utf-8 -*-
/* ai-friend-greet-rate-browser.mjs — 친구 인사 중복 · 말 속도 시작 칸 (2026-09-10)
 *
 * ⚠️ 자동으로 안 돕니다. 사람이 부릅니다:
 *      cd cloudflare-deploy/public && python3 -m http.server 8957 &
 *      PW_DIR=/tmp/pw AIF_URL=http://127.0.0.1:8957/ai-friend.html \
 *        node test-harness/manual/ai-friend-greet-rate-browser.mjs
 *
 * 왜 «브라우저» 여야 하나 — 둘 다 문자열로는 원리상 안 보입니다.
 *   ① 인사 중복: 함수도 값도 다 «있고» 틀린 것은 «누를 때마다 쌓이는가» 뿐입니다.
 *      (2026-09-10 사장님 화면에 Emma 인사가 두 줄. D1 `ai_friend_chats` 에는 인사가
 *       한 줄도 없어 «서버에 두 벌» 이 아니라 «화면에만 쌓인» 것이었습니다.)
 *   ② 말 속도: 시작 칸이 실제로 몇 배인지는 `currentRate` 를 «읽어야» 압니다.
 *      웜업은 2026-07-23 부터 0.8(2단계)로 시작하는데 AI 영어친구만 1 이었습니다 —
 *      같은 Emma 인데 화면마다 말 속도가 달랐습니다.
 *
 * ⛔ 「인사가 하나다」만 세지 마세요 — 그러면 «인사를 아예 안 하는» 회귀도 통과합니다.
 *    «한 번 누르면 하나 나온다» 와 «두 번 눌러도 하나다» 를 짝으로 둡니다.
 * ⛔ 「대화 도중 친구를 바꾸면 앞의 진짜 대화가 지워지지 않는다」도 짝입니다 —
 *    지우는 범위를 넓히면 학생이 쓴 말이 사라지는데 에러가 안 납니다.
 */
import { loadPlaywright, findChromium } from './_pw.mjs';

const URL = process.env.AIF_URL || 'http://127.0.0.1:8957/ai-friend.html';
const pw = loadPlaywright();
if (!pw) { console.log('⏭ playwright 없음 — 건너뜁니다'); process.exit(0); }
const exe = findChromium();
if (!exe) { console.log('⏭ Chromium 없음 — 건너뜁니다'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  c ? (pass++, console.log('  ✅ ' + m))
    : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : '')));
};

/* ⚠️ evaluate 가 «던지면» 하니스가 통째로 크래시해서 무엇이 깨졌는지 안 보인다 —
      실제로 「인사를 아예 안 함」 변이에서 그랬다. 던지면 깔끔한 FAIL 로 바꾼다. */
const safeEval = async (page, fn, label) => {
  try { return await page.evaluate(fn); }
  catch (e) { fail++; console.log('  ❌ ' + label + ' — 화면에서 재다가 죽었습니다\n       · ' + String(e).slice(0, 200)); return null; }
};
const b = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 456, height: 832 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 160)));

/* ⚠️ 포괄 스텁을 «먼저», 구체적인 것을 뒤에 — route 는 나중에 등록한 것이 이깁니다. */
const J = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
await p.route('**/api/**', r => r.fulfill(J({ ok: true, items: [] })));
await p.route('**/api/ai/chat-guest-token', r => r.fulfill(J({ ok: true, uid: 'guest_probe', token: 'probe.token' })));
await p.route('**/api/ai/chat-friend', r => r.fulfill(J({ ok: true, reply: 'Nice! Tell me more.', gam: null })));
await p.route('**/api/voice/tts', r => r.fulfill({ status: 204, body: '' }));   // 소리는 안 낸다

await p.goto(URL + '?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1800);

console.log('\n■ 전제 — 화면이 떴는가');
const booted = await p.evaluate(() => ({
  empty: !!document.querySelector('.empty-state'),
  cards: document.querySelectorAll('.friend-card[data-v]').length,
  hasRate: typeof currentRate === 'number',
}));
ok(booted.empty, '빈 화면(친구·주제 고르기)이 그려졌다');
ok(booted.cards >= 2, `친구 카드가 있다 (${booted.cards}개)`,
  '카드가 없으면 아래 «두 번 누르기» 가 통째로 헛돕니다');
ok(booted.hasRate, 'currentRate 를 읽을 수 있다',
  'let 은 window 속성이 안 되지만 최상위 classic script 라 전역 스코프에서 이름으로 읽힙니다');
ok(errs.length === 0, `JS 에러가 없다 (${errs.length}건)`, errs.join(' / '));

console.log('\n■ 🐢 말 속도 — 시작 칸이 웜업과 같은가');
const rate = await p.evaluate(() => ({
  cur: typeof currentRate === 'number' ? currentRate : null,
  activeBtn: (document.querySelector('.opt[data-rate].active') || {}).dataset?.rate || null,
  steps: [...document.querySelectorAll('.opt[data-rate]')].map(x => x.dataset.rate),
}));
ok(rate.cur === 0.8, `처음 오는 학생은 0.8 배로 듣는다 (지금 ${rate.cur})`,
  '웜업은 2026-07-23 부터 0.8(WARMUP_START_RATE=2)로 시작합니다 — 같은 Emma 가 화면마다 다른 속도로 말하면 안 됩니다');
/* ⚠️ 이 검사는 «값과 화면이 어긋나는가» 를 봅니다 — 정적 HTML 의 active 위치는 «못» 잽니다.
      화면 로드 직후 JS 가 currentRate 에 맞는 칸으로 active 를 옮기기 때문입니다(자가교정).
      그래서 HTML 쪽 active 를 「보통」으로 되돌려도 여기는 초록입니다(변이시험 실측) —
      그 한 줄이 막는 것은 «JS 가 돌기 전 한 순간 보통으로 보이는 것» 뿐이고, 검사는 없습니다. */
ok(rate.activeBtn === '0.8', `설정의 «켜진 칸» 도 0.8 이다 (지금 ${rate.activeBtn})`,
  '값과 화면이 어긋나면 「보통인 줄 알았는데 느리게 읽는다」가 됩니다');
ok(rate.steps.join(',') === '0.6,0.8,1,1.25,1.5',
  `다섯 칸이 웜업과 같다 (${rate.steps.join(', ')})`,
  '칸 값이 갈리면 「어떤 화면은 더 느리다」가 되고 에러는 안 납니다');

console.log('\n■ 🧹 인사 — 눌러도 쌓이지 않는가');
const greet = await safeEval(p, async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chat = document.getElementById('chat');
  const card = document.querySelector('.friend-card[data-v]');
  if (!card) throw new Error('친구 카드가 없습니다 — 빈 화면이 안 그려졌거나 지워졌습니다');
  const n = () => chat.querySelectorAll('[data-friend-greet="1"]').length;
  const rows = () => chat.querySelectorAll('.ai-row, .msg.user').length;
  card.click(); await sleep(250);
  const after1 = { greet: n(), rows: rows() };
  card.click(); await sleep(250);
  const after2 = { greet: n(), rows: rows() };
  card.click(); await sleep(250);
  const after3 = { greet: n(), rows: rows() };
  return { after1, after2, after3 };
}, '인사 중복');
if (!greet) { console.log(`\n${pass} PASS / ${fail} 실패`); await b.close(); process.exit(1); }
ok(greet.after1.greet === 1, `한 번 누르면 인사가 «하나» 나온다 (${greet.after1.greet}개)`,
  '0 이면 인사를 아예 안 하는 회귀입니다 — 누구를 골랐는지 귀로 확인시켜 주는 것이 이 인사의 목적입니다');
ok(greet.after2.greet === 1, `두 번 눌러도 인사는 «하나» 다 (${greet.after2.greet}개)`,
  '고치기 전에는 누를 때마다 덧붙어 같은 인사가 쌓였습니다(사장님 화면 실측 2줄)');
ok(greet.after3.greet === 1, `세 번 눌러도 «하나» 다 (${greet.after3.greet}개)`);

console.log('\n■ ⛔ 대화 도중에 바꿔도 «앞의 진짜 대화» 는 안 지워지는가');
/* ⚠️ 여기서 「인사가 총 하나」를 기대하면 «검사가 틀린» 것입니다 — 실제로 그렇게 적었다가
      빨간불이 났고, 코드가 아니라 기대값을 고쳤습니다.
      대화 도중에 친구를 바꾸면 앞 인사는 «그 시점의 기록» 으로 남는 것이 맞습니다.
      지우는 것은 «맨 끝에 붙어 있는» 인사뿐이고, 그래야 학생이 쓴 말이 안 사라집니다. */
const keep = await safeEval(p, async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chat = document.getElementById('chat');
  const before = chat.querySelectorAll('[data-friend-greet="1"]').length;
  appendMsg('user', 'I like dinosaurs.');            // 학생이 쓴 말
  appendMsg('ai', 'Dinosaurs are cool!');            // AI 의 진짜 답
  const cards = document.querySelectorAll('.friend-card[data-v]');
  if (!cards.length) throw new Error('친구 카드가 사라졌습니다 — 인사 지우기가 빈 화면까지 지웠을 수 있습니다');
  (cards[1] || cards[0]).click(); await sleep(250);
  const afterSwitch = chat.querySelectorAll('[data-friend-greet="1"]').length;
  const tailIsGreet = !!(chat.lastElementChild && chat.lastElementChild.dataset
                         && chat.lastElementChild.dataset.friendGreet === '1');
  (cards[1] || cards[0]).click(); await sleep(250);   // 같은 친구를 한 번 더
  return {
    userKept: [...chat.querySelectorAll('.msg.user')].some(x => /dinosaurs/i.test(x.textContent)),
    aiKept:   [...chat.querySelectorAll('.ai-row')].some(x => /Dinosaurs are cool/i.test(x.textContent)),
    grewByOne: afterSwitch === before + 1,
    tailIsGreet,
    afterTwice: chat.querySelectorAll('[data-friend-greet="1"]').length,
    expectTwice: afterSwitch,
  };
}, '대화 보존');
if (!keep) { console.log(`\n${pass} PASS / ${fail} 실패`); await b.close(); process.exit(1); }
ok(keep.userKept, '학생이 쓴 말이 그대로 남아 있다',
  '지우는 범위를 넓히면 학생 말이 사라지는데 에러가 안 납니다');
ok(keep.aiKept, 'AI 의 진짜 답도 그대로 남아 있다');
ok(keep.grewByOne, '친구를 바꾸면 인사가 «하나만» 늘어난다',
  '앞 인사는 그 시점의 기록으로 남고, 새 인사는 맨 끝에 붙습니다');
ok(keep.tailIsGreet, '새 인사가 «맨 끝» 에 있다');
ok(keep.afterTwice === keep.expectTwice,
  `그 상태에서 한 번 더 눌러도 안 늘어난다 (${keep.expectTwice} → ${keep.afterTwice})`,
  '맨 끝 인사만 갈아끼우므로 쌓이지 않습니다');

await b.close();
console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
