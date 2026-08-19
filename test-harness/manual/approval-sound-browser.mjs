/*
 * 🔊 결재함 «소리로 알려주기» 를 실제 브라우저에서 확인한다.
 *
 * 왜 필요한가 — 소리는 «났는지» 를 코드만 봐서는 알 수 없다. 게다가 브라우저는
 * 사람이 클릭하기 전에는 소리를 막으므로(자동재생 정책), 코드는 도는데 소리만 안 나는
 * 상태가 흔하다. 그래서 AudioContext 를 가로채 «실제로 소리를 내려 했는지» 를 센다.
 *
 * 서버는 띄우지 않는다 — fetch 를 가짜로 바꾼다(운영 DB 를 건드리지 않는다).
 */
import { requireBrowser, fileUrl } from './_pw.mjs';
const { chromium, exe } = requireBrowser();

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const me = { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false };
const home = (inbox) => ({
  ok: true, me, can_approve: true, pending: inbox.length, types: [], hr_periods: null,
  inbox, mine: [], reuse: [], urgent: [], colleagues: [], my_delegate: null, schedule_pending: 0,
});

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  await page.addInitScript(() => {
    // 소리를 «내려 했는지» 센다 — 헤드리스에선 실제 소리가 안 들리므로 호출을 잡는다
    window.__beeps = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    class Spy extends AC {
      createOscillator() { window.__beeps++; return super.createOscillator(); }
    }
    window.AudioContext = Spy; window.webkitAudioContext = Spy;

    window.__inbox = [];
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf('/api/approval/home') === 0) {
        const inbox = window.__inbox;
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, me: { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false },
          can_approve: true, pending: inbox.length, types: [], hr_periods: null,
          inbox, mine: [], reuse: [], urgent: [], colleagues: [], my_delegate: null, schedule_pending: 0,
        }), { status: 200 }));
      }
      if (u.indexOf('/api/') === 0) return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      return rf(u, o);
    };
  });

  await page.goto(fileUrl('cloudflare-deploy/public/work.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  console.log('\n[1] 소리 버튼이 있는가');
  const btn = page.locator('#soundBtn');
  check('버튼이 보인다', await btn.isVisible());
  /* 이 화면의 기본 언어는 영어다 — 한국어 글자로만 보면 멀쩡한데 FAIL 난다(실제로 밟았다). */
  const isOn  = (t) => /Sound: on|소리 켬/.test(t);
  const isOff = (t) => /Sound: off|소리 끔/.test(t);
  check('기본값은 «켬»', isOn(await btn.textContent()), JSON.stringify(await btn.textContent()));

  console.log('\n[2] 첫 화면에서는 울리지 않는다 (들어오자마자 울면 놀란다)');
  check('아직 0번', (await page.evaluate(() => window.__beeps)) === 0);

  console.log('\n[3] 새 결재가 들어오면 울린다');
  await page.evaluate(() => { window.__inbox = [{ id: 1, stage_due_at: Date.now() + 8.64e7 }]; });
  await page.click('#soundBtn');                      // 껐다 (사람 클릭 = 소리 잠금 해제)
  await page.click('#soundBtn');                      // 다시 켬
  const beforeArrival = await page.evaluate(() => window.__beeps);
  await page.evaluate(() => window.reloadAll());
  await page.waitForTimeout(600);
  const afterArrival = await page.evaluate(() => window.__beeps);
  check('건수가 늘자 소리를 냈다', afterArrival > beforeArrival, `${beforeArrival} → ${afterArrival}`);

  console.log('\n[4] 탭 제목에 건수가 보인다 (다른 탭을 보고 있어도 눈에 띈다)');
  check('제목에 (1) 이 붙었다', (await page.title()).indexOf('(1)') === 0, await page.title());

  console.log('\n[5] 줄어들 때는 울리지 않는다 (내가 결재하면 조용해야 한다)');
  await page.evaluate(() => { window.__inbox = []; });
  const b5 = await page.evaluate(() => window.__beeps);
  await page.evaluate(() => window.reloadAll());
  await page.waitForTimeout(600);
  check('소리를 내지 않았다', (await page.evaluate(() => window.__beeps)) === b5);
  check('제목에서 건수가 사라졌다', (await page.title()).indexOf('(') !== 0, await page.title());

  console.log('\n[6] 껐으면 울리지 않는다');
  await page.click('#soundBtn');                      // 끔
  check('버튼이 «끔» 으로 바뀌었다', isOff(await page.locator('#soundBtn').textContent()),
        JSON.stringify(await page.locator('#soundBtn').textContent()));
  await page.evaluate(() => { window.__inbox = [{ id: 2, stage_due_at: Date.now() + 8.64e7 }]; });
  const b6 = await page.evaluate(() => window.__beeps);
  await page.evaluate(() => window.reloadAll());
  await page.waitForTimeout(600);
  check('꺼 두면 소리가 안 난다', (await page.evaluate(() => window.__beeps)) === b6);

  console.log('\n[7] 🌐 언어를 바꿔도 라벨이 되돌아가지 않는다 (CLAUDE.md 함정)');
  await page.click('#lang');
  await page.waitForTimeout(300);
  const l1 = await page.locator('#soundBtn').textContent();
  check('언어를 바꿔도 «끈 상태» 가 유지된다', isOff(l1), JSON.stringify(l1));
  await page.click('#lang');
  await page.waitForTimeout(300);
  const l2 = await page.locator('#soundBtn').textContent();
  check('되돌려도 «끈 상태» 그대로', isOff(l2), JSON.stringify(l2));
  check('두 언어가 실제로 서로 다른 글자였다 (번역이 붙어 있다)', l1.trim() !== l2.trim(),
        JSON.stringify([l1.trim(), l2.trim()]));

  console.log('\n[8] 설정이 저장되는가 (새로고침해도 꺼진 채)');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  check('다시 열어도 «끔»', isOff(await page.locator('#soundBtn').textContent()),
        JSON.stringify(await page.locator('#soundBtn').textContent()));

  console.log('\n[9] 자바스크립트 오류가 없다');
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.evaluate(() => window.reloadAll());
  await page.waitForTimeout(400);
  check('오류 없음', errs.length === 0, errs.join(' | '));

  await browser.close();
  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건') : ('  전부 통과 (' + PASS + '건)'));
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
