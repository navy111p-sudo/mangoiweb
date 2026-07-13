/**
 * 💬🎮 AI 영어 친구(ai-friend.html) 게임화 업그레이드 검증 (2026-07-13)
 *  1) 페이지 로드 & pageerror 0건
 *  2) HUD: 레벨/XP·스트릭·오늘의 단어가 히스토리 gam 으로 렌더
 *  3) 빈 상태: 마스코트 + 주제 모험 카드 8장 + 퀵버튼
 *  4) 주제 카드 클릭 → 유저 말풍선 + AI 답변 + (💡…) 문법팁 칩 분리 렌더
 *  5) 메시지 적립 → ⭐오늘 포인트 증가, 퀘스트 카운트 갱신
 *  6) 오늘의 단어 사용 → 축하 배너 + 단어 하이라이트 + 퀘스트 done
 *  7) 레벨업(lifetime 9→10) → 레벨업 배너
 *  8) 375px 가로 오버플로 없음
 * 실행: (public 을 :8791 서빙 후) node test-harness/ai_friend_gamified_harness.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:8791';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + name + (extra ? ' — ' + extra : ''));
  ok ? pass++ : fail++;
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(String(e)); console.log('  [pageerror]', String(e).slice(0, 160)); });
await page.setViewport({ width: 375, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

// ── 로그인/AI API 전부 모킹 ──
await page.evaluateOnNewDocument(() => {
  const tok = btoa(JSON.stringify({ uid: 'testkid' })).replace(/\+/g, '-').replace(/\//g, '_') + '.sig';
  localStorage.setItem('mango_user', JSON.stringify({ user_id: 'testkid' }));
  localStorage.setItem('mango_token', tok);
  localStorage.setItem('mangoi_aifriend_sound', '0');  // 헤드리스에선 TTS 자동재생 끔
  const state = { today: 0, lifetime: 9, streak: 2, wordUsed: false };
  const WORD = { w: 'amazing', ko: '놀라운', e: '🤩' };
  const J = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const origFetch = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/api/ai/chat-history')) {
      return J({ ok: true, items: [], gam: { today: state.today, lifetime: state.lifetime, streak: state.streak, word: WORD } });
    }
    if (u.includes('/api/ai/chat-friend')) {
      const body = JSON.parse((opts && opts.body) || '{}');
      state.today++; state.lifetime++;
      let word_bonus = 0;
      if (/\bamazing\b/i.test(body.msg || '') && !state.wordUsed) { state.wordUsed = true; word_bonus = 5; }
      return J({ ok: true, reply: "Nice sentence! I love pizza too. What toppings do you like? (💡 'I like pizza' 가 더 자연스러워요)",
        gam: { awarded: 2, word_bonus, voice_bonus: 0, today: state.today, lifetime: state.lifetime, streak: state.streak, word: WORD } });
    }
    if (u.includes('/api/voice/') || u.includes('/api/ops-tts')) return new Response('', { status: 404 });
    if (u.startsWith('/api/')) return J({ ok: false, error: 'mock_unhandled' });
    return origFetch(url, opts);
  };
});

await page.goto(BASE + '/ai-friend.html', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1200));

// 1~3) 초기 렌더
const init = await page.evaluate(() => ({
  lvName: document.getElementById('lvName')?.textContent || '',
  xpW: document.getElementById('xpFill')?.style.width || '',
  streak: document.getElementById('streakN')?.textContent || '',
  wodEn: document.getElementById('wodEn')?.textContent || '',
  wodKo: document.getElementById('wodKo')?.textContent || '',
  topicCards: document.querySelectorAll('.topic-card').length,
  quickBtns: document.querySelectorAll('.quick button').length,
  hero: !!document.querySelector('.hero-mango img'),
  qTalkN: document.getElementById('qTalkN')?.textContent || '',
}));
check('HUD 레벨 렌더(lifetime 9 → Lv.1 새싹, XP 90%)', init.lvName.includes('Lv.1') && init.xpW === '90%', init.lvName + ' / ' + init.xpW);
check('HUD 스트릭 🔥2', init.streak === '2', init.streak);
check('HUD 오늘의 단어 amazing(놀라운)', init.wodEn === 'amazing' && init.wodKo.includes('놀라운'), init.wodEn + init.wodKo);
check('빈 상태: 주제 모험 카드 8장', init.topicCards === 8, String(init.topicCards));
check('빈 상태: 마스코트 + 퀵버튼 3개', init.hero && init.quickBtns === 3, 'hero=' + init.hero + ' quick=' + init.quickBtns);
check('퀘스트 초기 0/5', init.qTalkN === '0/5', init.qTalkN);

// 4~5) 주제 카드 클릭 → 메시지 왕복 + 적립 (lifetime 9→10 = 레벨업도 동시 발생)
await page.evaluate(() => document.querySelectorAll('.topic-card')[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
await new Promise(r => setTimeout(r, 900));
const afterMsg = await page.evaluate(() => ({
  userBubbles: document.querySelectorAll('.msg.user').length,
  aiBubbles: document.querySelectorAll('.msg.ai:not(.typing)').length,
  tipChip: document.querySelector('.tip-chip')?.textContent || '',
  tipInBody: (document.querySelector('.msg.ai')?.textContent || '').indexOf('가 더 자연스러워요') >= 0,
  pts: document.getElementById('ptsN')?.textContent || '',
  qTalkN: document.getElementById('qTalkN')?.textContent || '',
  lvName: document.getElementById('lvName')?.textContent || '',
  banner: document.querySelector('.cele-banner')?.textContent || '',
  confetti: document.querySelectorAll('.confetti-p').length,
}));
check('주제 카드 → 유저+AI 말풍선 생성', afterMsg.userBubbles === 1 && afterMsg.aiBubbles === 1, 'u=' + afterMsg.userBubbles + ' ai=' + afterMsg.aiBubbles);
check('(💡…) 문법팁이 별도 칩으로 분리', afterMsg.tipChip.includes('자연스러워요'), afterMsg.tipChip.slice(0, 40));
check('⭐ 오늘 포인트 +2 반영', afterMsg.pts === '2', afterMsg.pts);
check('퀘스트 1/5 갱신', afterMsg.qTalkN === '1/5', afterMsg.qTalkN);
check('레벨업(Lv.2 풋풋 망고) 배너 + 콘페티', afterMsg.lvName.includes('Lv.2') && afterMsg.banner.includes('레벨 업') && afterMsg.confetti > 0,
  afterMsg.lvName + ' / banner=' + afterMsg.banner.slice(0, 30) + ' / cf=' + afterMsg.confetti);

// 6) 오늘의 단어 사용 → +5P 축하 + 하이라이트 + 퀘스트 done
await new Promise(r => setTimeout(r, 2800)); // 이전 배너 사라질 때까지
await page.evaluate(() => {
  document.getElementById('msgInput').value = 'This pizza is amazing!';
  window.sendMsg();
});
await new Promise(r => setTimeout(r, 900));
const afterWord = await page.evaluate(() => ({
  banner: document.querySelector('.cele-banner')?.textContent || '',
  wodDone: document.getElementById('wodChip')?.classList.contains('done'),
  qWordDone: document.getElementById('qWord')?.classList.contains('done'),
  wodHit: !!document.querySelector('.msg.user .wod-hit'),
  pts: document.getElementById('ptsN')?.textContent || '',
}));
check('오늘의 단어 배너(+5P)', afterWord.banner.includes('오늘의 단어'), afterWord.banner.slice(0, 40));
check('단어 칩·퀘스트 done + 말풍선 하이라이트', afterWord.wodDone && afterWord.qWordDone && afterWord.wodHit,
  'chip=' + afterWord.wodDone + ' quest=' + afterWord.qWordDone + ' hit=' + afterWord.wodHit);
check('⭐ 누적 2+2+5=9P', afterWord.pts === '9', afterWord.pts);

// 8) 가로 오버플로
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('375px 가로 오버플로 없음', overflow <= 0, 'diff=' + overflow);
check('pageerror 0건', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 120));

await browser.close();
console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
