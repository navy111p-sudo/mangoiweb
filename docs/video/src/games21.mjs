import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'shots21');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8899';
const SENT = encodeURIComponent('I like pizza');

/* 허브 HUB_GAMES 정의 순서 그대로 21종 */
const GAMES = [
  ['g01_spacemonster', '우주 괴물 사냥', 'iframe', '/student-game-space-monster.html'],
  ['g02_avatar',       '아바타 키우기',   'iframe', '/student-game-avatar.html?v=1'],
  ['g03_pizza',        '문법 피자 마스터', 'iframe', '/student-game-grammar-pizza.html?v=16'],
  ['g04_escapevoice',  '탈출: 말해야 열린다', 'iframe', '/student-game-escape-voice.html?v=1'],
  ['g05_escapezombie', '좀비 실험실 탈출', 'iframe', '/student-game-escape-zombie.html?v=1'],
  ['g06_escapeschool', '학교에서 탈출하기', 'iframe', '/student-game-escape-school.html?v=1'],
  ['g07_tank',         '셔먼 탱크대전',   'iframe', '/student-game-tank-battle.html?v=3'],
  ['g08_langace',      'P-38 라이트닝',   'iframe', '/student-game-language-ace.html?v=5'],
  ['g09_p383d',        'P-38 3D 조종석',  'iframe', '/student-game-p38-3d.html?v=1'],
  ['g10_battle3d',     '우주 배틀',       'iframe', '/battle-3d.html'],
  ['g11_fish',         '낚시+말하기',     'iframe', `/english-mastery-suite.html?game=fish&sentence=${SENT}&lang=ko`],
  ['g12_shooter',      '슈팅+말하기',     'iframe', `/student-game-shooter.html?sentence=${SENT}&lang=ko`],
  ['g13_brick',        '문장 벽돌',       'inline', 'brick'],
  ['g14_match',        '단어 매칭',       'inline', 'match'],
  ['g15_fill',         '빈칸 채우기',     'inline', 'fill'],
  ['g16_balloon',      '풍선 터뜨리기',   'inline', 'balloon'],
  ['g17_suspect',      '용의자 추리',     'iframe', '/suspect-mystery.html'],
  ['g18_speaking',     '말하기 퀴즈',     'iframe', '/speaking-quiz.html'],
  ['g19_wordfighter',  '워드 파이터',     'iframe', '/student-game-wordfighter.html'],
  ['g20_tetris',       '단어 테트리스',   'iframe', '/student-game-tetris.html?v=2'],
  ['g21_rescue',       '망고 구조선의 대항해', 'iframe', '/student-game-rescue-voyage.html?v=1'],
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl',
         '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'ko-KR',
});
ctx.setDefaultTimeout(25000);
// 캡처용 브라우저에만 적용되는 플래그 — 온보딩·연령 확인 오버레이를 건너뛴다
await ctx.addInitScript(() => {
  try {
    ['wf_parent_ok', 'vocab_onboard_done', 'games_onboard_done', 'hub_guide_seen',
     'onboard_done', 'guide_seen', 'tour_done'].forEach(k => localStorage.setItem(k, '1'));
    localStorage.setItem('mangoi_game_lang', 'en');
  } catch (e) {}
});

async function dismiss(page) {
  for (let r = 0; r < 3; r++) {
    await page.keyboard.press('Escape').catch(() => {});
    const n = await page.evaluate(() => {
      const vis = el => { const b = el.getBoundingClientRect(); return b.width > 8 && b.height > 8; };
      const cands = [...document.querySelectorAll('button,a,[role=button],.btn')]
        .filter(vis)
        .filter(el => {
          const t = (el.textContent || '').trim();
          const al = (el.getAttribute('aria-label') || '') + (el.getAttribute('title') || '');
          if (el.children.length > 1) return false;
          return /^(✕|×|✖|X)$/.test(t) || /닫기|close/i.test(al) ||
                 /^(확인했어요|확인|시작하기|게임 시작|시작|다음|건너뛰기|나중에|입장)$/.test(t);
        });
      cands.slice(0, 2).forEach(el => { try { el.click(); } catch (e) {} });
      return cands.length;
    }).catch(() => 0);
    await page.waitForTimeout(900);
    if (!n) break;
  }
}

for (const [key, title, kind, target] of GAMES) {
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));
  try {
    if (kind === 'iframe') {
      await page.goto(BASE + target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4200);
      await dismiss(page);
      await page.waitForTimeout(2200);
    } else {
      await page.goto(BASE + '/student-games.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3800);
      await dismiss(page);
      await page.evaluate((mode) => {
        try { window._isUnlocked = () => true; } catch (e) {}
        try { window.hubOpenGame && window.hubOpenGame(mode); } catch (e) {}
      }, target);
      await page.waitForTimeout(3200);
      await dismiss(page);
      await page.waitForTimeout(1600);
    }
    await page.screenshot({ path: path.join(OUT, key + '.png') });
    console.log('OK  ', key, title);
  } catch (e) {
    console.log('FAIL', key, String(e).split('\n')[0]);
    try { await page.screenshot({ path: path.join(OUT, key + '.png') }); } catch {}
  }
  await page.close();
}
await browser.close();
