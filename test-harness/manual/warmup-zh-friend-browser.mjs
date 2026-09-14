// -*- coding: utf-8 -*-
/* 🀄 웜업 «중국어 교사 메이» — 진짜 브라우저로 그려서 확인 (2026-09-14)
 *
 * 왜 이 검사가 따로 필요한가
 *   warmup_zh_lang_harness ⑯ 은 함수를 오려 내 «무슨 답이 나오는가» 를 봅니다.
 *   그것으로는 «화면에 실제로 보이는가 · 그림이 정말 받아지는가 · 캔버스에 그려지는가» 를
 *   원리상 볼 수 없습니다 — 2026-08-31 에 표만 고치고 그림 파일을 커밋에 안 담아
 *   며칠간 조용히 폴백(옛 얼굴)이 돌았던 사고가 바로 그 자리입니다.
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 은 게이트가 물어 가지 않습니다. 사람이 부릅니다:
 *      mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *      PW_DIR=/tmp/pw node test-harness/manual/warmup-zh-friend-browser.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
/* 🀄 «중국어 선생님이 누구누구인가» 는 화면 표에서 읽는다(2026-09-14 룽 추가).
   ⛔ 여기에 이름을 손으로 적지 마세요 — 선생님이 늘면 그 사람만 조용히 검사에서 빠집니다. */
const ZH_TEACHERS = (() => {
  try {
    const w = readFileSync(join(__dir, '..', '..', 'cloudflare-deploy', 'public', 'warmup.html'), 'utf8');
    const m = w.match(/var VOICE_MODES = \{[\s\S]*?\n\};/);
    const M = new Function(m[0] + '\nreturn VOICE_MODES;')();
    return Object.keys(M).filter((k) => M[k] && M[k].zh).map((k) => ({ k, char: M[k].char || k }));
  } catch (e) { return []; }
})();
const PUB = join(__dir, '../../cloudflare-deploy/public');
const { chromium, exe } = requireBrowser();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp',            // ⚠️ 빠뜨리면 그림이 octet-stream 으로 가 브라우저가 안 그립니다
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
let hits = [];
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"ok":false}');
  }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    hits.push([p, 200]);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { hits.push([p, 404]); res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  → ' + x : '')); } };

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  hits = [];
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  return { ctx, page };
}
/** 「보인다」는 hidden 값이 아니라 «자리를 차지하는가» 로 잰다.
 *  📜 2026-09-14 지시가 하루에 세 번 바뀐 자리다 — «메이 버튼 하나만»(오전) →
 *     「선택없이 무조건 메이 한 교사만」(낮, 칸 삭제) → 「**남자 교사도 한명더 추가해줘**」
 *     (오후, 룽 추가 + 칸 복원). 그래서 지금 경계는 «그 언어의 상자만 보인다» 이다.
 *  ⛔ 「중국어에는 칸이 없다」로 되돌리지 마세요 — 검사를 조이는 것이 아니라 룽을 지우는 것입니다. */
const btnState = () => ({
  box: (() => { const b = document.getElementById('voiceBtns');
    return b ? b.getBoundingClientRect().height > 0 : null; })(),
  zbox: (() => { const b = document.getElementById('voiceBtnsZh');
    return b ? b.getBoundingClientRect().height > 0 : null; })(),
  shown: [...document.querySelectorAll('#voiceBtns button')]
    .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.getAttribute('data-v')),
  zshown: [...document.querySelectorAll('#voiceBtnsZh button')]
    .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.getAttribute('data-v')),
  on: [...document.querySelectorAll('#voiceBtns button.on, #voiceBtnsZh button.on')]
    .map((b) => b.getAttribute('data-v')),
  note: (() => { const n = document.getElementById('voiceZhNote'); return n ? getComputedStyle(n).display !== 'none' : null; })(),
  label: (document.getElementById('voiceVal') || {}).textContent || '',
  char: window.__avChar || null,
});

console.log('\n[ 1. 영어(기본) — 고르는 칸이 그대로 보인다 ]');
{
  const { ctx, page } = await open('/warmup.html');
  const s = await page.evaluate(btnState);
  check('영어에서는 고르는 칸이 보인다', s.box === true, String(s.box));
  check('영어에서는 네 친구와 번갈아가 보인다', s.shown.join(',') === 'emma,jake,lily,noah,mix', s.shown.join(','));
  /* 🔴 짝 — 없으면 «두 상자를 늘 함께 보이기» 도 통과한다(중국어에서 Emma 를 고르게 됩니다) */
  check('영어에서는 중국어 선생님 칸이 «안» 보인다 (짝)', s.zbox === false, String(s.zbox));
  check('영어에서는 중국어 선생님 버튼이 한 개도 안 보인다 (짝)', s.zshown.length === 0, s.zshown.join(',') || '없음');
  check('영어에서는 중국어 안내가 안 뜬다 (짝)', s.note === false, String(s.note));
  await ctx.close();
}

console.log('\n[ 2. 중국어 — «그 언어의 선생님» 칸으로 갈아 끼워지고 고를 수 있다 ]');
{
  const { ctx, page } = await open('/warmup.html?lang=zh');
  const s = await page.evaluate(btnState);
  check('중국어에서는 «영어 친구» 칸이 감춰진다', s.box === false, String(s.box));
  check('중국어에서는 영어 친구 버튼이 한 개도 안 보인다', s.shown.length === 0, s.shown.join(',') || '없음');
  check('중국어에서는 «중국어 선생님» 칸이 보인다', s.zbox === true, String(s.zbox));
  check('표의 중국어 선생님이 전부 버튼으로 보인다',
    ZH_TEACHERS.length >= 1 && ZH_TEACHERS.every((t) => s.zshown.includes(t.k)),
    '보임: ' + (s.zshown.join(',') || '없음') + ' / 표: ' + ZH_TEACHERS.map((t) => t.k).join(','));
  check('중국어에서는 목소리 한계 안내가 뜬다', s.note === true, String(s.note));
  check('기본은 메이다 (먼저 있던 선생님)', /메이/.test(s.label), s.label);
  check('고른 사람에 «고름» 표시가 하나 있다', s.on.length === 1, s.on.join(',') || '없음');
  const noteText = await page.evaluate(() => (document.getElementById('voiceZhNote') || {}).textContent || '');
  check('그 안내가 한국어·중국어 둘 다로 적혀 있다',
    /[가-힣]/.test(noteText) && /[\u4e00-\u9fff]/.test(noteText), noteText.slice(0, 90));

  /* 🔴 «눌러 보면 그 선생님이 되는가» — 이것이 2026-09-14 오후 지시의 핵심이다.
     자동 하니스는 가짜 DOM 이라 «보이는가·눌리는가» 를 원리상 못 본다. */
  const other = ZH_TEACHERS.find((t) => t.k !== 'mei') || ZH_TEACHERS[0];
  if (other) {
    const covered = await page.evaluate((k) => {
      const b = document.querySelector('#voiceBtnsZh button[data-v="' + k + '"]');
      if (!b) return { err: 'no button' };
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { mine: !!(top && b.contains(top)), tag: top ? top.tagName + '.' + top.className : null };
    }, other.k);
    check(`«${other.k}» 버튼이 «맨 위» 라 손이 닿는다`, covered.mine === true, JSON.stringify(covered));
    await page.click('#voiceBtnsZh button[data-v="' + other.k + '"]');
    await page.waitForTimeout(700);
    const s2 = await page.evaluate(btnState);
    check(`«${other.k}» 를 누르면 «고름» 표시가 그 사람으로 옮겨간다`,
      s2.on.length === 1 && s2.on[0] === other.k, s2.on.join(',') || '없음');
    check(`«${other.k}» 를 누르면 얼굴도 그 사람이 된다`, s2.char === other.char,
      'char=' + s2.char + ' / 기대=' + other.char);
    /* 🔴 짝 — 새로고침해도 그대로여야 «고른 것» 이 지켜진다 */
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const s3 = await page.evaluate(btnState);
    check(`다시 열어도 «${other.k}» 가 그대로다 (언어별로 기억한다)`,
      s3.on.length === 1 && s3.on[0] === other.k, s3.on.join(',') || '없음');
  }
  await ctx.close();
}

console.log('\n[ 3. 얼굴 — 그림 세 장이 «정말 받아지고» 캔버스에 그려지는가 ]');
check('전제: 화면 표에서 중국어 선생님을 읽었다', ZH_TEACHERS.length >= 1,
  '못 읽으면 아래 그림 검사가 통째로 건너뛰어집니다: ' + JSON.stringify(ZH_TEACHERS));
for (const T of ZH_TEACHERS) {
  const WHO = T.char;
  console.log(`  — ${T.k} (${WHO})`);
  const { ctx, page } = await open('/warmup.html?lang=zh');
  /* 고른 선생님으로 갈아 끼우고 그 얼굴이 실제로 그려질 때까지 기다린다 */
  await page.evaluate((w) => { try { window.__mgAvatarWant = w;
    window.MangoAvatar && MangoAvatar.setCharacter && MangoAvatar.setCharacter(w); } catch (e) {} }, WHO);
  await page.waitForTimeout(900);
  /* ⚠️ «요청이 몇 건인가» 로 재지 마세요 — 부팅(⑤절)이 이미 받아 뒀고 브라우저가 캐시에서
     주므로 다시 받지 않습니다. 물어야 할 것은 «그 파일이 닿고 그려지는가» 입니다. */
  const loaded = await page.evaluate((w) => Promise.all(['closed', 'mid', 'wide'].map((k) => new Promise((r) => {
    const im = new Image();
    im.onload = () => r({ k, w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => r({ k, w: 0, h: 0 });
    im.src = '/img/' + w + '-' + k + '.webp';
  }))), WHO);
  for (const g of loaded) {
    check(`${WHO}-${g.k}.webp 가 640×800 으로 열린다`, g.w === 640 && g.h === 800, JSON.stringify(g));
  }
  /* 🔴 「세 장이 서로 다른가 · 다른 곳이 입뿐인가」 — 이 저장소가 Emma 사고(v8)로 배운 성질이다.
     세 장을 각각 따로 뽑아 넣으면 얼굴째 움직이고, 그때 화면은 «입이 빠르다» 가 아니라
     «덜덜거린다» 로 보인다. 그림을 갈아 끼울 때 이 숫자가 무너지면 여기서 걸린다. */
  const band = await page.evaluate((w) => {
    const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    return Promise.all(['closed', 'mid', 'wide'].map((k) => load('/img/' + w + '-' + k + '.webp'))).then((ims) => {
      const px = ims.map((im) => {
        const c = document.createElement('canvas'); c.width = 640; c.height = 800;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        return g.getImageData(0, 0, 640, 800).data;
      });
      const diff = (a, b) => {
        const rows = new Array(10).fill(0); let n = 0;
        for (let y = 0; y < 800; y++) for (let x = 0; x < 640; x++) {
          const i = (y * 640 + x) * 4;
          if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 72) { rows[(y / 80) | 0]++; n++; }
        }
        return { pct: +(n / (640 * 800) * 100).toFixed(2), rows: rows.map((v) => +(v / (640 * 80) * 100).toFixed(1)) };
      };
      return { cm: diff(px[0], px[1]), cw: diff(px[0], px[2]) };
    });
  }, WHO);
  check('세 장이 서로 «다른» 그림이다 (같은 파일을 세 번 넣지 않았다)',
    band.cm.pct > 0.05 && band.cw.pct > 0.2, JSON.stringify(band));
  check('달라진 곳이 «입 부근» 뿐이다 (얼굴째 움직이지 않는다)',
    band.cw.rows.slice(0, 4).every((v) => v < 0.3) && band.cw.rows.slice(7).every((v) => v < 0.3)
    && band.cw.rows.slice(4, 7).some((v) => v > 1),
    'closed↔wide 세로 10칸: ' + band.cw.rows.join(' / '));
  check('그 변화가 지나치게 크지 않다 (Emma 사고는 11~18%)',
    band.cw.pct < 6, JSON.stringify(band.cw));

  /* ⛔ 「폴백으로 조용히 되돌아가지 않았는가」 — 그림이 없으면 옛 얼굴(emma 영상)로 떨어진다.
     그때도 화면은 멀쩡해 보이므로 «옛 얼굴 파일을 안 받았다» 를 짝으로 본다. */
  check(`${WHO} 로 바꾼 뒤 옛 얼굴(teacher-avatar)을 다시 받지 않았다 = 폴백이 안 돌았다`,
    !hits.some((x) => /teacher-avatar/.test(x[0])), hits.filter((x) => /teacher-avatar/.test(x[0])).map((x) => x[0]).join(','));
  const px = await page.evaluate(() => {
    const c = document.getElementById('tavatar-canvas');
    if (!c) return { err: 'no canvas' };
    const g = c.getContext('2d');
    let n = 0; const d = g.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 16) n++;
    return { w: c.width, h: c.height, filled: n / (c.width * c.height), ratio: c.width / c.height };
  });
  check('캔버스에 얼굴이 실제로 그려졌다 (빈 카드가 아니다)', px.filled > 0.25, JSON.stringify(px));
  check('카드 비율이 4:5 다', Math.abs(px.ratio - 0.8) < 0.02, JSON.stringify(px));
  await ctx.close();
}

console.log('\n[ 4. 오갈 때 — 영어에서 고른 사람이 안 지워진다 ]');
{
  const { ctx, page } = await open('/warmup.html');
  await page.evaluate(() => setVoiceMode('lily', false));
  await page.evaluate(() => setWarmLang('zh', false));
  const zh = await page.evaluate(btnState);
  check('중국어로 바꾸면 메이가 되고 고르는 칸이 사라진다',
    /메이/.test(zh.label) && zh.box === false, zh.label + ' / box=' + zh.box);
  await page.evaluate(() => setWarmLang('en', false));
  const en = await page.evaluate(btnState);
  check('영어로 돌아오면 «내가 골랐던 Lily» 가 그대로다 (짝)', /Lily/.test(en.label), en.label);
  check('그때 네 친구 버튼이 다시 보인다 (짝)', en.shown.join(',') === 'emma,jake,lily,noah,mix', en.shown.join(','));
  const saved = await page.evaluate(() => [localStorage.getItem('mangoi_warmup_voice'), localStorage.getItem('mangoi_warmup_voice_zh')]);
  /* 🔒 중국어는 «고른 것» 이 없으므로 적을 것도 없다 — 적으면 나중에 중국어 친구를 늘릴 때
        옛 값이 「학생이 고른 것」으로 굳어 기본값을 되돌릴 수 없다(2026-09-14). */
  check('영어에서 고른 사람만 기억한다', saved[0] === 'lily', JSON.stringify(saved));
  check('중국어용 저장 칸은 아예 안 생긴다 (짝)', saved[1] == null, JSON.stringify(saved));
  await ctx.close();
}

console.log('\n[ 5. 부팅 — 고른 얼굴이 «처음부터» 나오는가 (그리고 942KB 를 안 받는가) ]');
{
  /* 🔴 이 파일은 defer 라 화면의 인라인 스크립트가 먼저 돕니다 — 그때 MangoAvatar 가
     아직 없어서 «고른 얼굴» 요청이 버려졌습니다(2026-09-14 실측: origin/main 에서
     lily 를 골라 둬도 lily 그림 0건 · teacher-avatar 942KB 2건). */
  const boot = async (url, init) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    if (init) await page.addInitScript(init);
    hits = [];
    await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const got = hits.map((h) => h[0]);
    await ctx.close();
    return got;
  };
  const zh = await boot('/warmup.html?lang=zh');
  check('중국어로 열면 처음부터 메이 그림을 받는다', zh.some((h) => /mei-closed\.webp/.test(h)), zh.filter((h) => /img\//.test(h)).join(','));
  check('그때 옛 얼굴 영상(942KB)을 받지 않는다', !zh.some((h) => /teacher-avatar/.test(h)),
    zh.filter((h) => /teacher-avatar/.test(h)).join(','));
  const en = await boot('/warmup.html', () => { try { localStorage.setItem('mangoi_warmup_voice', 'lily'); } catch (e) {} });
  check('영어에서 Lily 를 골라 뒀으면 처음부터 Lily 다 (짝)', en.some((h) => /lily-closed\.webp/.test(h)),
    en.filter((h) => /img\//.test(h)).join(','));
  check('그때도 옛 얼굴 영상을 받지 않는다 (짝)', !en.some((h) => /teacher-avatar/.test(h)),
    en.filter((h) => /teacher-avatar/.test(h)).join(','));
  /* 🔴 짝 — 이 전역을 세우지 않는 화면(ai-friend)은 «예전 그대로» 여야 합니다.
     여기서 Emma 가 안 나오면 제가 남의 화면 동작까지 바꾼 것입니다. */
  const af = await boot('/ai-friend.html');
  check('그 전역을 안 세우는 화면은 예전처럼 Emma 로 시작한다 (짝)',
    af.some((h) => /teacher-avatar/.test(h)), af.filter((h) => /img\//.test(h)).join(',') || '요청 없음');
}

/* ══ 💪 중국어 «남자» 목소리 — 음높이가 실제로 내려가는가 (2026-09-14) ══
   [잰 것] 서버 zh TTS 는 구글 만다린 «한 목소리»(여성)뿐이라, 받은 소리를 브라우저에서
           «음높이만» 내려 남자로 만든다. 이 절은 그것을 «실제로 돌려» 잰다.
   ⚠️ 문자열 하니스로는 원리상 못 봅니다 — 함수도 값도 다 «있고» 틀린 것은 «무슨 소리가
      나는가» 뿐입니다. 그래서 220Hz 사인파를 통과시켜 영교차로 기본주파수를 셉니다.
   ⚠️ 소리의 «자연스러움» 은 여전히 사람이 들어야 합니다(이 환경에는 오디오 디코더가 없습니다). */
{
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/warmup.html?lang=zh', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const R = await page.evaluate(async () => {
    const out = { hasFn: typeof _zhDeepen === 'function', P: (typeof ZH_MALE_PITCH === 'number') ? ZH_MALE_PITCH : null };
    if (!out.hasFn) return out;
    const sr = 24000, dur = 2, n = sr * dur, F0 = 220;
    const dv = new DataView(new ArrayBuffer(44 + n * 2)); let o = 0;
    const str = (t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o++, t.charCodeAt(i)); };
    const u32 = (v) => { dv.setUint32(o, v, true); o += 4; };
    const u16 = (v) => { dv.setUint16(o, v, true); o += 2; };
    str('RIFF'); u32(36 + n * 2); str('WAVE'); str('fmt '); u32(16); u16(1); u16(1);
    u32(sr); u32(sr * 2); u16(2); u16(16); str('data'); u32(n * 2);
    for (let i = 0; i < n; i++) { const v = Math.sin(2 * Math.PI * F0 * i / sr) * 0.5;
      dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7FFF, true); o += 2; }
    const srcUrl = URL.createObjectURL(new Blob([dv.buffer], { type: 'audio/wav' }));
    try {
      const deep = await _zhDeepen(srcUrl);
      const ab = await (await fetch(deep)).arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      const c = new AC();
      const buf = await new Promise((res, rej) => c.decodeAudioData(ab, res, rej));
      c.close();
      const ch = buf.getChannelData(0); let zc = 0;
      for (let i = 1; i < ch.length; i++) if (ch[i - 1] < 0 && ch[i] >= 0) zc++;
      out.f0 = zc / buf.duration;
      out.ratio = out.f0 / F0;
      out.deepSec = buf.duration;
      /* 재생 배속은 play0 이 쓰는 식 그대로 — 들리는 «길이» 가 원본과 같아야 한다 */
      const S = (typeof AUDIO_RATE !== 'undefined' ? (AUDIO_RATE[2] || 1) : 1);
      out.playSec = buf.duration / (S / out.P);
      out.wantSec = dur / S;
      out.cached = (_zhDeepCache[srcUrl] === deep);
    } catch (e) { out.err = String(e && e.message || e); }
    return out;
  });
  await ctx.close();
  check('굵게 만드는 함수가 실제로 돈다', R.hasFn && !R.err, R.err || ('P=' + R.P));
  check('음높이가 실제로 내려간다 (여성 220Hz → 남성역)',
    R.ratio > 0.7 && R.ratio < 0.95,
    '실제 ' + (R.f0 || 0).toFixed(1) + 'Hz (비율 ' + (R.ratio || 0).toFixed(3) + ')');
  check('지정한 음높이와 «같은 비율» 로 내려간다',
    Math.abs((R.ratio || 0) - (R.P || 0)) < 0.02,
    '실제 ' + (R.ratio || 0).toFixed(3) + ' / 지정 ' + R.P);
  /* 🔴 짝 — 이것이 없으면 «느리고 낮은 소리» 도 통과한다(고치려던 것의 절반) */
  check('들리는 길이는 원본을 그 배속으로 들은 것과 같다 (짝)',
    Math.abs((R.playSec || 0) - (R.wantSec || 0)) < 0.05,
    '실제 ' + (R.playSec || 0).toFixed(3) + 's / 기대 ' + (R.wantSec || 0).toFixed(3) + 's');
  check('같은 소리를 다시 굽지 않는다 (캐시)', R.cached === true, String(R.cached));
}

await browser.close();
server.close();
console.log(`\n  🀄 중국어 교사 브라우저 검사: ✅ ${pass} / ❌ ${fail}`);
process.exit(fail ? 1 : 0);
