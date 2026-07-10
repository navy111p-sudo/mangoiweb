// 🥭 망고아이 라이브 UI 전수감사 — PC + 모바일 (puppeteer-core)
//   검사: ① 가로 오버플로(스크롤 조상 없는 우측 삐짐) ② 공용 i18n 바 ∩ 페이지 버튼 겹침
//         ③ 콘솔 에러 ④ pageerror ⑤ 실패한 네트워크 요청(4xx/5xx)
//   실행: node ui-audit.js [baseUrl]
const puppeteer = require('C:/Users/Admin/Desktop/mangoi_develop2-main/node_modules/puppeteer-core');

const BASE = process.argv[2] || 'https://webrtc-unified-platform-prod.navy111p.workers.dev';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const PAGES = [
  'index.html','vocab.html','warmup.html','review-quiz.html','student-games.html',
  'battle-3d.html','student-game-shooter.html','student-game-wordfighter.html',
  'suspect-mystery.html','english-mastery-suite.html','ai-friend.html','ai-write.html',
  'micro-quiz.html','speech-coach.html','speech-coach-cn.html','mbti-test.html',
  'speaking-quiz.html','level-test.html','streak.html','curriculum.html','faq.html',
  'contact.html','report.html','parent.html','eval.html','lessons.html','monthly-report.html',
  'teacher-training.html','textbook-viewer.html','game-report.html','poster-maker.html',
  'pay-link.html','payment-success.html','payment-fail.html','refund.html','precheck.html',
  'teacher-praise.html','teacher-report.html','mbti.html','lesson-booking-demo.html',
  'lesson-postpone-demo.html','textbook-uploader.html',
];

const VIEWPORTS = [
  { name: 'mobile-375', w: 375, h: 812, mobile: true },
  { name: 'mobile-412', w: 412, h: 915, mobile: true },
  { name: 'desktop-1280', w: 1280, h: 800, mobile: false },
];

// 오탐 제외(이전 감사에서 확정): 장식/애니메이션/오프캔버스 요소
const IGNORE_SEL = [
  '#mg-drawer', '.shooting-star', '.bgfx', '.rays', '.star', '.mango-ufo',
  '.mango-intro-video', '#mango-intro-video', '.fish', '.word', '.crosshair', '.hook',
  '.monster', '.enemy', '.bullet',
].join(',');

// 콘솔 에러 무시 패턴 (외부/권한/의도된 폴백)
const CONSOLE_IGNORE = [
  /favicon/i, /the AudioContext was not allowed/i, /autoplay/i, /Permission/i,
  /ERR_BLOCKED_BY_CLIENT/i, /google|gstatic|kakao|typecast|clarity/i,
  /Failed to load resource.*40[134]/i, // 인증필요 API는 로그인 전 401이 정상
  /WebSocket/i, // 로그인 전 시그널링 미연결 정상
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
  });
  const problems = [];
  let checked = 0;

  for (const vp of VIEWPORTS) {
    for (const pg of PAGES) {
      const page = await browser.newPage();
      const consoleErrs = [], pageErrs = [], netFails = [];
      page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });
      page.on('pageerror', e => pageErrs.push(String(e).slice(0, 200)));
      page.on('response', r => {
        const s = r.status(), u = r.url();
        if (s >= 400 && u.startsWith(BASE) && !/\/api\/(admin|dashboard|auth)/.test(u) && s !== 401 && s !== 403) {
          netFails.push(`${s} ${u.replace(BASE, '')}`.slice(0, 160));
        }
      });
      try {
        await page.setViewport({ width: vp.w, height: vp.h, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1 });
        await page.goto(`${BASE}/${pg}`, { waitUntil: 'networkidle2', timeout: 45000 });
        // 측정 전 애니메이션 정지(프리뷰/스로틀 오탐 방지)
        await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
        await new Promise(r => setTimeout(r, 1200));

        const audit = await page.evaluate((ignoreSel) => {
          const out = { overflow: [], overlap: [], squish: [] };
          const vw = window.innerWidth;
          const ignored = new Set(document.querySelectorAll(ignoreSel));
          const hasScrollAncestor = (el) => {
            for (let a = el.parentElement; a; a = a.parentElement) {
              const cs = getComputedStyle(a);
              if (/(auto|scroll|hidden)/.test(cs.overflowX)) return true;
            }
            return false;
          };
          for (const el of document.querySelectorAll('body *')) {
            if (ignored.has(el)) continue;
            let skip = false;
            for (let a = el; a; a = a.parentElement) if (ignored.has(a)) { skip = true; break; }
            if (skip) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) continue;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
            if (r.right > vw + 8 && r.left < vw && !hasScrollAncestor(el)) {
              out.overflow.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} right=${Math.round(r.right)} (vw=${vw})`);
              if (out.overflow.length >= 5) break;
            }
          }
          // 공용 바 겹침 (mango-i18n 주입 고정바 ∩ 페이지 자체 버튼 >35%)
          const bar = document.querySelector('#mangoi-global-bar');
          if (bar) {
            const br = bar.getBoundingClientRect();
            if (br.width > 0) {
              for (const btn of document.querySelectorAll('button, a.btn, .home-btn, [role="button"]')) {
                if (bar.contains(btn)) continue;
                const b = btn.getBoundingClientRect();
                if (b.width < 8 || b.height < 8) continue;
                const cs2 = getComputedStyle(btn);
                if (cs2.display === 'none' || cs2.visibility === 'hidden') continue;
                const ix = Math.max(0, Math.min(br.right, b.right) - Math.max(br.left, b.left));
                const iy = Math.max(0, Math.min(br.bottom, b.bottom) - Math.max(br.top, b.top));
                const ratio = (ix * iy) / (b.width * b.height);
                if (ratio > 0.35) out.overlap.push(`${btn.tagName.toLowerCase()}${btn.id ? '#' + btn.id : ''} "${(btn.textContent || '').trim().slice(0, 12)}" ${Math.round(ratio * 100)}%`);
              }
            }
          }
          // 한글 세로찌그러짐(squish): 헤더쪽 버튼 h>44 && w<60
          for (const btn of document.querySelectorAll('header button, .top button, .header button')) {
            const b = btn.getBoundingClientRect();
            const t = (btn.textContent || '').trim();
            if (b.height > 44 && b.width < 60 && b.width > 0 && t.length >= 2 && /[가-힣]/.test(t)) {
              out.squish.push(`${btn.tagName.toLowerCase()} "${t.slice(0, 8)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
            }
          }
          return out;
        }, IGNORE_SEL);

        const cErrs = consoleErrs.filter(t => !CONSOLE_IGNORE.some(re => re.test(t)));
        const pErrs = pageErrs.filter(t => !CONSOLE_IGNORE.some(re => re.test(t)));
        checked++;
        const bad = audit.overflow.length + audit.overlap.length + audit.squish.length + cErrs.length + pErrs.length + netFails.length;
        if (bad) {
          problems.push({ vp: vp.name, page: pg, ...audit, consoleErrs: cErrs.slice(0, 3), pageErrs: pErrs.slice(0, 3), netFails: netFails.slice(0, 3) });
          console.log(`❌ [${vp.name}] ${pg}`);
          for (const o of audit.overflow) console.log(`    overflow: ${o}`);
          for (const o of audit.overlap) console.log(`    overlap : ${o}`);
          for (const o of audit.squish) console.log(`    squish  : ${o}`);
          for (const o of cErrs.slice(0, 3)) console.log(`    console : ${o}`);
          for (const o of pErrs.slice(0, 3)) console.log(`    jserror : ${o}`);
          for (const o of netFails.slice(0, 3)) console.log(`    net     : ${o}`);
        } else {
          console.log(`✅ [${vp.name}] ${pg}`);
        }
      } catch (e) {
        problems.push({ vp: vp.name, page: pg, loadError: String(e).slice(0, 150) });
        console.log(`💥 [${vp.name}] ${pg} — ${String(e).slice(0, 120)}`);
      }
      await page.close();
    }
  }
  await browser.close();
  console.log(`\n════ 총 ${checked}건 검사, 문제 ${problems.length}건 ════`);
  require('fs').writeFileSync(__dirname + '/ui-audit-result.json', JSON.stringify(problems, null, 2));
})();
