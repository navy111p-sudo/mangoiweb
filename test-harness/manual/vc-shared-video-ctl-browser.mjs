// -*- coding: utf-8 -*-
// vc-shared-video-ctl-browser.mjs — 공유받은 영상을 학생이 «멈추고 소리를 다시 끌» 수 있는가.
//
//   [왜 필요한가]  2026-08-27 Karl 강사 실수업 테스트, 사장님 제보 3-1:
//     「한번 소리를 켜면 다시 끄는 버튼이 없고, 영상도 멈추는 버튼이 없어서 계속 플레이하게 됩니다.」
//     원인이 둘이었다 —
//       ① `vpAddSoundOverlay()`(`js/idx-main.js`)의 「🔊 소리 켜기」 알약이 소리를 켠 뒤
//          **자기 자신을 지운다**(`btn.remove()`). 「켜기」는 되는데 「끄기」로 가는 길이 사라진다.
//       ② 학생(뷰어)은 2026-08-12 Melca 피드백으로 재생 조작이 잠겨 있다
//          (YouTube `controls=0` + iframe `pointer-events:none` · 파일 영상 `controls=false`)
//          → 일시정지 버튼은 «없어진» 것이 아니라 **처음부터 없었다.**
//     고침(PR #562)은 `js/idx-vc-mobilefix.js` ⑫절이 `vpAddSoundOverlay` 를 감싸
//     잠긴 시청자에게만 무대 오른쪽 아래에 아이콘 버튼 둘을 얹는 것이다.
//   ⚠️ 이런 사고는 문자열 하니스로 절대 안 보인다 — 함수도 값도 다 «있고», 틀린 것은
//      «그 버튼이 화면에 남아 있는가» 뿐이다. 그래서 진짜 브라우저에서 눌러 본다.
//
//   [무엇을 못 박나]
//     · 소리를 켠 뒤에도 **끄는 길이 남아 있는가**(제보의 핵심).
//     · 일시정지·음소거는 **되고**, 구간 이동(seek)·전체화면은 **안 된다** —
//       2026-08-12 결정의 취지는 학생이 «반 전체의 재생 위치» 를 흔드는 것을 막는 데 있었다.
//     · 아이콘 버튼에 `data-ko`/`data-en` 을 달지 않는다 — 두 i18n 엔진이 `textContent` 를
//       통째로 갈아끼워 34px 버튼 안에 문장이 들어앉는다(CLAUDE.md 2장). 설명은 title·aria 로만.
//     · 이모지는 Unicode 13 미만만 쓴다(Win10 두부 표시 금지 — CLAUDE.md 1-4).
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   `js/idx-vc-mobilefix.js` ⑫절이나 `idx-main.js` 의 `vpAddSoundOverlay` 를 건드리면 사람이 부른다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/vc-shared-video-ctl-browser.mjs
//
//   ⚠️ file:// 로 열면 안 된다(`<script src="/js/…">` 가 전부 404 라 `vpAddSoundOverlay` 자체가
//      undefined 다) — 그래서 작은 http 서버를 직접 띄운다.
//   ⚠️ 수업에 실제로 들어가지 않는다. 촬영동의 모달(`js/mango-consent.js`)이 사람 손을 기다려
//      그 앞에서 멈추기 때문이다(CLAUDE.md 2장). 여기서 볼 것은 «그 함수가 무엇을 그리는가» 뿐이라
//      가짜 무대(div)를 만들어 직접 부른다.
//   ⚠️ `isMobile` 은 켜지 않는다 — 그 문맥은 레이아웃 뷰포트가 지정값과 어긋나 playwright 의
//      «클릭 전 자동 스크롤»·«겹침 판정» 이 엉뚱한 좌표를 본다(CLAUDE.md 2장). 여기선 폭만 있으면 된다.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const { chromium, exe } = requireBrowser();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) {              // 로그인·서버 데이터 없이 도는 화면이다
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"ok":false}');
  }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end('nope');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.vpAddSoundOverlay === 'function', null, { timeout: 15000 });

/* ── A. 학생(잠긴 시청자) + YouTube — 제보 상황 그대로 ────────────────────────
   iframe 안은 읽을 수 없으니 postMessage 를 가로채 «무엇을 시켰는가» 로 판정한다.
   about:blank 은 같은 오리진이라 contentWindow 를 바꿔 끼울 수 있다. */
console.log('\n▶ A. 학생 화면 · YouTube 공유');
const A = await page.evaluate(async () => {
  window.vcCanControlTextbook = () => false;          // 학생 = 잠긴 시청자
  const stage = document.createElement('div');
  stage.style.cssText = 'position:relative;width:390px;height:220px';
  const f = document.createElement('iframe'); f.src = 'about:blank';
  stage.appendChild(f); document.body.appendChild(stage);
  await new Promise((r) => { if (f.contentWindow) r(); else f.onload = r; setTimeout(r, 800); });

  let sent = [];
  f.contentWindow.postMessage = (m) => { sent.push(String(m)); };
  window.vpAddSoundOverlay(stage, 'youtube');

  const bar = stage.querySelector('.vp-viewer-ctrl');
  const btns = bar ? [...bar.querySelectorAll('button')] : [];
  const r = { n: btns.length };
  if (btns.length !== 2) { stage.remove(); return r; }
  const [pauseBtn, muteBtn] = btns;

  r.firstIcons = pauseBtn.textContent + muteBtn.textContent;
  sent = []; pauseBtn.click(); r.pauseCmd = sent.join('|'); r.pauseIcon = pauseBtn.textContent; r.pauseTitle = pauseBtn.title;
  sent = []; pauseBtn.click(); r.playCmd = sent.join('|'); r.playIcon = pauseBtn.textContent;
  sent = []; muteBtn.click(); r.onCmd = sent.join('|'); r.onIcon = muteBtn.textContent;
  r.bigGone = !stage.querySelector('.vp-sound-overlay');   // 큰 알약은 볼일이 끝나 사라진다
  r.alive = !!stage.querySelector('.vp-viewer-ctrl') && bar.contains(muteBtn);
  sent = []; muteBtn.click(); r.offCmd = sent.join('|'); r.offIcon = muteBtn.textContent; r.offTitle = muteBtn.title;

  // 아이콘 버튼에 data-ko/data-en 이 붙으면 34px 상자에 문장이 들어앉는다 — title/aria 만 써야 한다
  r.noBodySwap = !pauseBtn.hasAttribute('data-ko') && !pauseBtn.hasAttribute('data-en')
              && !muteBtn.hasAttribute('data-ko') && !muteBtn.hasAttribute('data-en');
  r.hasTip = !!pauseBtn.getAttribute('data-ko-title') && !!pauseBtn.getAttribute('data-en-title')
          && !!muteBtn.getAttribute('aria-label');
  // Win10 두부 방지 — 쓰는 이모지가 전부 Unicode 13 미만인가
  r.maxCp = Math.max(...[...(pauseBtn.textContent + muteBtn.textContent + '⏸▶🔇🔊')].map((c) => c.codePointAt(0)));

  const pr = pauseBtn.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  r.size = Math.round(pr.width) + 'x' + Math.round(pr.height);
  r.minSide = Math.min(pr.width, pr.height);
  const br = bar.getBoundingClientRect();
  r.inside = br.left >= sr.left - 0.5 && br.right <= sr.right + 0.5 && br.bottom <= sr.bottom + 0.5;
  r.hasSeek = /seek|fullscreen|전체화면|progress/i.test(bar.innerHTML);
  stage.remove();
  return r;
});

check('① 조작바에 버튼이 둘이다 (일시정지 + 소리)', A.n === 2, A.n + '개');
check('② 처음엔 ⏸ + 🔇 (음소거 자동재생 상태를 그대로 말한다)', A.firstIcons === '⏸🔇', A.firstIcons);
check('③ ⏸ → pauseVideo 가 나가고 아이콘이 ▶ 로 바뀐다',
  /pauseVideo/.test(A.pauseCmd || '') && A.pauseIcon === '▶', A.pauseCmd + ' / ' + A.pauseIcon);
check('④ 다시 → playVideo 가 나가고 ⏸ 로 돌아온다',
  /playVideo/.test(A.playCmd || '') && A.playIcon === '⏸', A.playCmd + ' / ' + A.playIcon);
check('⑤ 🔇 → unMute + setVolume 이 나가고 아이콘이 🔊 로 바뀐다',
  /unMute/.test(A.onCmd || '') && /setVolume/.test(A.onCmd || '') && A.onIcon === '🔊', A.onCmd + ' / ' + A.onIcon);
check('⑥ 소리를 켜면 가운데 큰 알약은 볼일이 끝나 사라진다', A.bigGone === true);
check('⑦ 🔑 그래도 우리 버튼은 남아 있다 (옛 버그: 켜면 되돌릴 길이 통째로 사라짐)', A.alive === true);
check('⑧ 🔑 다시 끌 수 있다 — mute 가 나가고 아이콘이 🔇 로 돌아온다',
  /"mute"/.test(A.offCmd || '') && A.offIcon === '🔇', A.offCmd + ' / ' + A.offIcon);
check('⑨ 구간 이동·전체화면은 없다 (2026-08-12 「학생 조작 불가」 취지 유지)', A.hasSeek === false);
check('⑩ 아이콘 버튼에 data-ko/data-en 이 없다 (i18n 이 본문을 문장으로 갈아끼우는 함정)',
  A.noBodySwap === true);
check('⑪ 설명은 title·aria 로 단다 (🌐 를 눌러도 따라오게 data-*-title 까지)', A.hasTip === true);
check('⑫ 이모지가 전부 Unicode 13 미만이다 (Win10 두부 방지)', A.maxCp < 0x1F900, 'maxCodePoint=U+' + (A.maxCp || 0).toString(16));
check('⑬ 버튼이 손가락으로 누를 만하다 (40px 이상)', A.minSide >= 40, A.size);
check('⑭ 폰 390px 에서 무대 밖으로 안 나간다', A.inside === true);

/* ── B. 강사·관리자(잠기지 않은 사람)에게도 붙는다 ─────────────────────────
   2026-08-27 사장님 지시. 「원래 유튜브 컨트롤이 있다」는 이유로 빼 뒀지만, 폰에서는 그
   컨트롤바가 하단 독(#vc-dock)에 가려 손이 닿지 않는다(제보 사진의 「0:49 / 4:12」).
   ⚠️ 다만 그 화면에는 네이티브 컨트롤바가 실제로 깔려 있으므로 우리 버튼은 그 위로 비켜서야
      한다 — 같은 자리에 두면 유튜브의 전체화면·설정 버튼을 덮어 새 사고를 만든다. */
console.log('\n▶ B. 강사·관리자 화면');
const B = await page.evaluate(async () => {
  window.vcCanControlTextbook = () => true;
  const stage = document.createElement('div');
  stage.style.cssText = 'position:relative;width:390px;height:220px';
  const f = document.createElement('iframe'); f.src = 'about:blank';
  stage.appendChild(f); document.body.appendChild(stage);
  await new Promise((r) => { if (f.contentWindow) r(); else f.onload = r; setTimeout(r, 500); });
  f.contentWindow.postMessage = () => {};
  window.vpAddSoundOverlay(stage, 'youtube');
  const bar = stage.querySelector('.vp-viewer-ctrl');
  const out = {
    ours: stage.querySelectorAll('.vp-viewer-ctrl').length,
    big: stage.querySelectorAll('.vp-sound-overlay').length,
    btns: bar ? bar.querySelectorAll('button').length : 0,
    bottom: bar ? getComputedStyle(bar).bottom : '',
  };
  if (bar) {   // 네이티브 컨트롤바(바닥 ~40px)를 비켜섰는가 — 무대 바닥에서 얼마나 떠 있나
    const br = bar.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    out.gapFromBottom = Math.round(sr.bottom - br.bottom);
  }
  stage.remove();
  return out;
});
check('⑮ 강사·관리자에게도 조작바가 붙는다 (폰에서 유튜브 컨트롤이 독에 가린다)',
  B.ours === 1 && B.btns === 2, '조작바 ' + B.ours + '개 / 버튼 ' + B.btns + '개');
check('⑯ 그 화면에서는 네이티브 컨트롤바 위로 비켜선다 (전체화면·설정 버튼을 덮지 않게)',
  B.gapFromBottom >= 40, '무대 바닥에서 ' + B.gapFromBottom + 'px (bottom=' + B.bottom + ')');
check('⑰ 가운데 「소리 켜기」 알약은 그대로 둔다 (첫 제스처가 필요해 없앨 수 없다)', B.big === 1, B.big + '개');

/* ── C. 파일 영상(mp4 등) — 진짜 muted 값이 오갔다 돌아오는가 ─────────────── */
console.log('\n▶ C. 학생 화면 · 파일 영상');
const C = await page.evaluate(() => {
  window.vcCanControlTextbook = () => false;
  const stage = document.createElement('div');
  stage.style.cssText = 'position:relative;width:390px;height:220px';
  const v = document.createElement('video'); v.muted = true;
  stage.appendChild(v); document.body.appendChild(stage);
  window.vpAddSoundOverlay(stage, 'file');
  const btns = [...stage.querySelectorAll('.vp-viewer-ctrl button')];
  if (btns.length !== 2) { stage.remove(); return { n: btns.length }; }
  btns[1].click(); const off = v.muted === false;
  btns[1].click(); const on = v.muted === true;
  const alive = stage.querySelectorAll('.vp-viewer-ctrl button').length === 2;
  stage.remove();
  return { n: btns.length, off, on, alive };
});
check('⑱ 파일 영상에도 버튼이 둘이다', C.n === 2, C.n + '개');
check('⑲ 음소거를 껐다 켤 수 있다 (video.muted 가 실제로 오간다)', C.off === true && C.on === true,
  'off→' + C.off + ' / on→' + C.on);
check('⑳ 버튼이 계속 살아 있다', C.alive === true);

await browser.close();
server.close();
console.log('\n' + (fail ? '❌ 실패 ' + fail + '건 / ' : '✅ ') + '통과 ' + pass + '건');
process.exit(fail ? 1 : 0);
