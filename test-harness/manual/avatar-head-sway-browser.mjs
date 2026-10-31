// -*- coding: utf-8 -*-
// 실제 Chromium — 아바타 머리가 «조금씩» 움직일 때 픽셀이 맞는가 (js/mango-avatar.js v13)
//
//   ⚠️ 자동으로 안 돕니다(manual/ 규약) — mango-avatar.js 의 머리 움직임·합성 순서·HEAD 표를
//      건드렸으면 사람이 부르세요:
//        NODE_PATH=/opt/node22/lib/node_modules node test-harness/manual/avatar-head-sway-browser.mjs
//        (또는 PW_DIR=/tmp/pw — test-harness/manual/README.md)
//      다른 판(변이시험)으로 재려면 AVATAR_SRC=<파일> 을 주세요.
//
//   무엇을 재나 — HEAD 표의 캐릭터(lily·noah·emma·mei·long·jake)마다
//     ① «움직임 줄이기» 상태(곧게 편 얼굴)를 기준으로 찍고
//     ② 움직임을 켠 뒤 가짜 시계로 6개 시각(0~6초)을 찍어
//     ③ 몸(경계 아래 4px 여유)은 한 픽셀도 안 바뀌었는가 — 몸까지 흔들리면 «통째로 기우는» 것
//     ④ 머리는 실제로 바뀌었는가(눈 칸은 빼고 셉니다 — 깜빡임이 «움직였다» 로 세지 않게) — 안 바뀌면 기능이 죽은 것(짝)
//     ④-2 머리 밝기가 그대로인가 — 합성 순서가 틀리면(source-out 을 빼면) 머리가 두 번 더해져 하얗게 뜹니다
//     ⑤ 목 이음매에 투명한 틈이 없는가(알파 ≥ 250) — 몸·머리를 따로 오리면 245 언저리로 비칩니다
//     ⑥ 얼굴 선명도(라플라시안 분산, 6장의 가운데 값)가 기준의 0.8배 이상인가 — comp 를 1배로 되돌리면 0.3~0.5배로
//        뭉개집니다(2026-10-18 실측). 2배 comp 의 증거.
//
//   ⚠️ 이 검사는 «측정» 이지 «소리·눈» 이 아닙니다 — 움직임이 자연스러운지는 사람이 봐야 합니다.
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const { chromium, exe } = requireBrowser();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cloudflare-deploy', 'public');
const SRC = process.env.AVATAR_SRC || join(ROOT, 'js', 'mango-avatar.js');
const AV = readFileSync(SRC, 'utf8');
// HEAD 표는 «지금 저장소 정본» 에서 읽는다(⛔ 하니스에 숫자를 베끼지 말 것).
const BASE = readFileSync(join(ROOT, 'js', 'mango-avatar.js'), 'utf8');
const hm = BASE.match(/var HEAD\s*=\s*(\{[\s\S]*?\}\});/);
if (!hm) { console.log('❌ FAIL HEAD 표를 소스에서 못 읽었습니다'); process.exit(1); }
const HEAD = new Function('return ' + hm[1])();
const em = BASE.match(/var EYES\s*=\s*(\{[^;]*\});/);
const EYES = em ? new Function('return ' + em[1])() : {};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<div id="tavatar-wrap"><div id="tavatar-ring" style="width:320px"><canvas id="tavatar-canvas" width="320" height="400"></canvas></div></div>
<video id="tavatar-video"></video>
<!-- 난수를 0.999 로 — 첫 깜빡임이 6초 뒤라 이 검사 동안 눈을 안 감는다(감으면 선명도가 낮게 잰다) -->
<script>window.__T=1000;Date.now=function(){return window.__T};Math.random=function(){return 0.999};
window.__mgAvatarWant=${JSON.stringify(u.searchParams.get('c'))};</script>
<script src="/av.js"></script></body>`);
    return;
  }
  if (u.pathname === '/av.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(AV); return; }
  try {
    const f = join(ROOT, u.pathname);
    res.setHeader('Content-Type', extname(f) === '.webp' ? 'image/webp' : extname(f) === '.json' ? 'application/json' : 'application/octet-stream');
    res.end(readFileSync(f));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ FAIL ' + m); } };
const lapvar = (img) => {
  // 얼굴 가운데(320x400 좌표 100..220 × 60..200)의 회색조 라플라시안 분산
  const { w, d } = img; const g = [];
  for (let y = 60; y < 200; y++) for (let x = 100; x < 220; x++) { const i = (y * w + x) * 4; g.push((d[i] + d[i + 1] + d[i + 2]) / 3); }
  const W = 120, H = 140; let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const v = 4 * g[y * W + x] - g[(y - 1) * W + x] - g[(y + 1) * W + x] - g[y * W + x - 1] - g[y * W + x + 1];
    s += v; s2 += v * v; n++;
  }
  const m = s / n; return s2 / n - m * m;
};

try {
  for (const name of Object.keys(HEAD)) {
    console.log(`\n■ ${name}`);
    const ctxB = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 400, height: 500 } });
    const page = await ctxB.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/?c=${name}&_nc=${Date.now()}`);
    await page.waitForTimeout(900);
    const grab = () => page.evaluate(() => {
      const c = document.getElementById('tavatar-canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      return { w: c.width, h: c.height, d: Array.from(d) };
    });
    const ref = await grab();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const frames = [];
    for (const t of [0.0, 1.2, 2.5, 3.7, 5.0, 6.1]) {
      await page.evaluate(t => { window.__T = 1000 + t * 1000; }, t);
      await page.waitForTimeout(160);
      frames.push(await grab());
    }
    const W = ref.w, H = ref.h, h = HEAD[name], kx = W / h.w, ky = H / h.h;
    const g = { px: h.x * kx, y1: h.y1 * ky, y2: h.y2 * ky, nw: h.nw * kx, nw2: h.w * 0.094 * kx };
    // 머리 몫(1=머리, 0=몸) — 소스의 swayMask 와 같은 모양(목 밖에서는 경계가 위로 올라간다)
    const wAt = (x, y) => {
      let s = (Math.abs(x + .5 - g.px) - g.nw) / g.nw2; s = Math.max(0, Math.min(1, s));
      const lift = s * s * (3 - 2 * s) * (g.y2 - g.y1), a = g.y1 - lift, b = g.y2 - lift, yy = y + .5;
      if (yy <= a) return 1; if (yy >= b) return 0;
      const q = (yy - a) / (b - a); return 1 - q * q * (3 - 2 * q);
    };
    const e = EYES[name], inEye = (x, y) => !!e && x >= e.x * kx - 2 && x <= (e.x + e.w) * kx + 2 && y >= e.y * ky - 2 && y <= (e.y + e.h) * ky + 2;
    let bodyMax = 0, headChanged = 0, headPx = 0, seamMin = 255, seamN = 0, refSum = 0, refN = 0, lumDiff = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (wAt(x, y) === 1 && ref.d[i + 3] > 200 && !inEye(x, y)) { refSum += ref.d[i] + ref.d[i + 1] + ref.d[i + 2]; refN++; }
    }
    const refMean = refSum / Math.max(1, refN) / 3;
    for (const f of frames) {
      const d = f.d, r = ref.d; let fs = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, w = wAt(x, y);
        const df = Math.max(Math.abs(d[i] - r[i]), Math.abs(d[i + 1] - r[i + 1]), Math.abs(d[i + 2] - r[i + 2]), Math.abs(d[i + 3] - r[i + 3]));
        if (w === 0 && wAt(x, y - 4) === 0) bodyMax = Math.max(bodyMax, df);
        if (w === 1 && r[i + 3] > 200 && !inEye(x, y)) { headPx++; if (df > 24) headChanged++; fs += d[i] + d[i + 1] + d[i + 2]; }
        if (w > 0 && w < 1 && Math.abs(x + .5 - g.px) < g.nw * 0.8 && r[i + 3] === 255) { seamN++; seamMin = Math.min(seamMin, d[i + 3]); }
      }
      lumDiff = Math.max(lumDiff, Math.abs(fs / Math.max(1, refN) / 3 - refMean));
    }
    const lr = lapvar(ref), lf = frames.map(lapvar).sort((a, b) => a - b), sharp = lf[lf.length >> 1] / lr;   // 가운데 값 — 한 장이 우연히 눈 감은 장이어도 흔들리지 않게
    ok(errs.length === 0, `페이지 오류 없음${errs.length ? ' — ' + errs[0] : ''}`);
    ok(bodyMax === 0, `몸(경계 아래)은 한 픽셀도 안 바뀐다 (최대 차 ${bodyMax})`);
    ok(headChanged > 0, `머리는 실제로 움직인다 (바뀐 픽셀 ${(100 * headChanged / Math.max(1, headPx)).toFixed(2)}%)`);
    ok(refN > 1000 && lumDiff <= 4, `머리 밝기가 그대로다 (평균 차 최대 ${lumDiff.toFixed(2)} · 기준 ${refMean.toFixed(1)})`);
    ok(seamN > 0 && seamMin >= 250, `목 이음매에 투명한 틈이 없다 (최소 알파 ${seamMin}, ${seamN}점)`);
    ok(sharp >= 0.8, `움직이는 동안에도 얼굴이 뭉개지지 않는다 (선명도 ${sharp.toFixed(2)}배 · 기준 ${lr.toFixed(0)})`);
    await ctxB.close();
  }
} finally {
  await browser.close(); server.close();
}
console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
