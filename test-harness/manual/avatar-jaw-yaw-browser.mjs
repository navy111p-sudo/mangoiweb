// -*- coding: utf-8 -*-
// 실제 Chromium — 아바타 턱 내리기 · 고개 좌우 돌리기 (js/mango-avatar.js v21)
//
//   ⚠️ 자동으로 안 돕니다(manual/ 규약) — JAW 표·턱 띠·고개 돌림(yawFace)을 건드렸으면 사람이 부르세요:
//        NODE_PATH=/opt/node22/lib/node_modules node test-harness/manual/avatar-jaw-yaw-browser.mjs
//        (또는 PW_DIR=/tmp/pw — test-harness/manual/README.md)
//
//   짝: OLD_SRC=<v20 파일> 을 주면 옛 판도 같은 방법으로 재서 «옛 판은 안 움직인다» 를 확인합니다.
//
//   🦴 턱 (lily·noah·emma·jake — 입모양 «아»(D) 를 낼 때와 다문 입(A) 을 비교, 움직임 줄이기 켬)
//     ① 턱끝이 실제로 내려간다 — 입 칸 «아래» 가운데 세로줄 밝기를 맞춰 본 이동량이 D×배율의 0.5~1.5배 (옛 판: ≈0)
//     ② 띠 밖(목 아래·좌우 바깥)은 한 픽셀도 안 바뀐다 — 몸·머리카락은 그대로
//     ③ 얼굴 «속» 에 투명한 틈이 없다(위로 D 만큼 불투명했던 곳 알파 ≥ 250) — 섞기 순서가 틀리면 비칩니다
//        (윤곽 가장자리는 턱이 내려간 만큼 배경이 따라 내려오는 게 맞아서 빼고 봅니다)
//   🔄 고개 (눈 칸이 있는 머리 캐릭터 — 같은 시각·같은 기울기에서 «돌림만 끈 판(SWAY_YAW=0)» 과 1:1 비교)
//     ④ 눈 줄이 옆으로 간다 — 최대 이동이 계획(SWAY_YAW × 반폭)의 0.35배 이상 (옛 판 vs 돌림 끈 판: ≈0)
//     ⑤ 너무 크지 않다 — ≤ 1.5 × 계획
//     ⑥ 얼굴 윤곽(눈 높이 양끝)은 그대로 — 이목구비만 옆으로 가야 «돌아보는» 것
//     ⑦ 띠 양끝에 반투명한 세로줄이 없다 — 끝 열을 덜 덮으면 섞기에서 비칩니다(2026-11-09 실제로 났던 것)
//   🪡 입 칸 둘레 (v22 — 사장님 「코 양옆 볼에 선」, 같은 장면을 «아틀라스에서 바로 늘인 판(BLEED)» 과 1:1 비교)
//     ⑨ 아틀라스의 «다른 칸» 을 자홍색으로 칠해 넣고(PROBE) 재생 — 옆 칸이 번지면 칸 둘레에 자홍색이 나온다.
//        지금 판: 자홍 픽셀 0 · (짝) BLEED 판: 자홍 픽셀이 실제로 나온다(이 검사가 번짐을 볼 수 있다는 증거)
//
//   ⚠️ 이 검사는 «측정» 입니다 — 자연스러운지는 사람이 봐야 합니다(데모 영상: 이 파일과 같은 방법).
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const { chromium, exe } = requireBrowser();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cloudflare-deploy', 'public');
const NEW = readFileSync(process.env.AVATAR_SRC || join(ROOT, 'js', 'mango-avatar.js'), 'utf8');
const OLD = process.env.OLD_SRC ? readFileSync(process.env.OLD_SRC, 'utf8') : null;
const lit = (src, re) => { const m = src.match(re); return m ? new Function('return ' + m[1])() : null; };
const JAW = lit(NEW, /var JAW\s*=\s*(\{[^;]*\});/), HEAD = lit(NEW, /var HEAD\s*=\s*(\{[\s\S]*?\}\});/);
const EYES = lit(NEW, /var EYES\s*=\s*(\{[^;]*\});/), PREC = lit(NEW, /var PRECISION\s*=\s*(\{[\s\S]*?\}\});/);
const YAW = +(NEW.match(/var SWAY_YAW\s*=\s*([\d.]+)/) || [])[1];
const chm = NEW.match(/var CHARACTERS = \{[\s\S]*?\n  \};/);
const CH = new Function(chm[0].replace(/^var /, 'const ') + ' return CHARACTERS;')();
const CUES = [{ start: 0, end: .5, value: 'A' }, { start: .5, end: 1.6, value: 'D' }, { start: 1.6, end: 2.2, value: 'A' }];

let SRC = NEW, PROBE = false;
// 🪡 ⑨ PROBE — 그 캐릭터 입 아틀라스에서 A(1)·D(4) 칸만 남기고 나머지 칸을 자홍색으로 칠한 그림을 쓰게 한다(전환 시트는 404 → 앵커만)
const probeJs = name => { const p = PREC[name] || {}, url = p.atlas || '/img/visemes/' + name + '-mouths.webp';
  return `(async()=>{const r=await fetch(${JSON.stringify(url)});const im=await createImageBitmap(await r.blob());
const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.fillStyle='#f0f';x.fillRect(0,0,c.width,c.height);
for(const i of [1,4]){const sx=(i%3)*${p.w},sy=Math.floor(i/3)*${p.h};x.drawImage(im,sx,sy,${p.w},${p.h},sx,sy,${p.w},${p.h});}
const u=URL.createObjectURL(await new Promise(ok=>c.toBlob(ok,'image/png')));
const d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
Object.defineProperty(HTMLImageElement.prototype,'src',{get(){return d.get.call(this)},set(v){d.set.call(this,String(v).indexOf(${JSON.stringify(url)})>=0?u:v)}});
const s=document.createElement('script');s.src='/av.js';document.body.appendChild(s);})();`; };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<div id="tavatar-wrap"><div id="tavatar-ring" style="width:320px"><canvas id="tavatar-canvas" width="320" height="400"></canvas></div></div>
<video id="tavatar-video"></video>
<script>window.__T=1000;Date.now=function(){return window.__T};Math.random=function(){return 0.999};
window.__mgAvatarWant=${JSON.stringify(u.searchParams.get('c'))};</script>
<script src="/js/avatar-visemes.js"></script>
<script>window.AvatarVisemes.prepare=()=>Promise.resolve(${JSON.stringify(CUES)});</script>
${PROBE ? '<script>' + probeJs(u.searchParams.get('c')) + '</script>' : '<script src="/av.js"></script>'}</body>`);
    return;
  }
  if (u.pathname === '/av.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(SRC); return; }
  if (PROBE && /-transitions\.webp$/.test(u.pathname)) { res.statusCode = 404; res.end(); return; }
  try {
    const f = join(ROOT, u.pathname), x = extname(f);
    res.setHeader('Content-Type', x === '.webp' ? 'image/webp' : x === '.js' ? 'text/javascript' : x === '.json' ? 'application/json' : 'application/octet-stream');
    res.end(readFileSync(f));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: exe, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ FAIL ' + m); } };
// 원본 px → 캔버스 px (그 캐릭터의 crop rect 를 거친다 — composeFrame·swayGeom 과 같은 식)
const mapper = (name, W, H) => {
  const h = HEAD[name], r = CH[name].rect, kx = W / (h.w * (r.r - r.l)), ky = H / (h.h * (r.b - r.t));
  return { kx, ky, X: v => (v - h.w * r.l) * kx, Y: v => (v - h.h * r.t) * ky };
};
const lum = (img, x, y) => { const i = (y * img.w + x) * 4; return (img.d[i] + img.d[i + 1] + img.d[i + 2]) / 3; };
// 1차원 밝기 줄 a 를 s 만큼 옮기면 b 와 가장 닮는 s (선형 보간, 0.1px 단위)
const bestShift = (a, b, lo, hi) => {
  let best = 0, bestE = Infinity;
  for (let s = lo; s <= hi + 1e-9; s += 0.1) {
    let e = 0, n = 0;
    for (let i = 0; i < a.length; i++) {
      const j = i - s, j0 = Math.floor(j), t = j - j0; if (j0 < 0 || j0 + 1 >= b.length) continue;
      const v = b[j0] * (1 - t) + b[j0 + 1] * t; e += (a[i] - v) ** 2; n++;
    }
    if (n > a.length * 0.6 && e / n < bestE) { bestE = e / n; best = s; }
  }
  return best;
};

async function openPage(name, motion) {
  const ctx = await browser.newContext({ reducedMotion: motion ? 'no-preference' : 'reduce', viewport: { width: 400, height: 560 } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/?c=${name}&_nc=${Date.now()}`);
  await page.waitForTimeout(900);
  return { ctx, page, errs };
}
const grab = page => page.evaluate(() => {
  const c = document.getElementById('tavatar-canvas');
  return { w: c.width, h: c.height, d: Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data) };
});

// 🦴 입모양 A(다문 입)·D(«아») 를 실제 재생 중에 한 장씩 뜬다
async function jawShots(name) {
  const { ctx, page, errs } = await openPage(name, false);
  const shots = await page.evaluate(async () => {
    const n = Math.round(44100 * 2.2), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i * 2 * Math.PI * 220 / 44100) * 3000, true);
    const a = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
    MangoAvatar.attach(a); await MangoAvatar.prepare(a);
    const c = document.getElementById('tavatar-canvas'), cx = c.getContext('2d'), out = {};
    const take = () => ({ w: c.width, h: c.height, d: Array.from(cx.getImageData(0, 0, c.width, c.height).data) });
    await a.play();
    await new Promise(done => {
      const tick = () => {
        const t = a.currentTime;
        if (!out.A && t > 0.2 && t < 0.45) out.A = take();
        if (!out.D && t > 1.0 && t < 1.45) out.D = take();
        if ((out.A && out.D) || a.ended || t > 2) { a.pause(); done(); } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return out;
  });
  await ctx.close();
  return { ...shots, errs };
}
function jawMeasure(name, s) {
  const j = JAW[name], { A, D } = s, W = A.w, H = A.h, m = mapper(name, W, H), r = PREC[name], e = EYES[name];
  const x0 = Math.floor(m.X(j.x0)), x1 = Math.ceil(m.X(j.x1)), yTop = Math.floor(m.Y(j.top)), yBot = Math.ceil(m.Y(j.bot));
  const inBox = (x, y, bx, by, bw, bh) => x >= m.X(bx) - 3 && x <= m.X(bx + bw) + 3 && y >= m.Y(by) - 3 && y <= m.Y(by + bh) + 3;
  const reach = Math.ceil(j.D * m.ky) + 2;   // 턱이 내려가며 위에서 끌어오는 거리
  const deep = (x, y) => { for (let k = 0; k <= reach; k++) if (A.d[((y - k) * W + x) * 4 + 3] !== 255) return false; return true; };
  let outMax = 0, alphaMin = 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, df = Math.max(...[0, 1, 2, 3].map(k => Math.abs(A.d[i + k] - D.d[i + k])));
    const inBand = x >= x0 - 2 && x <= x1 + 2 && y >= yTop - 2 && y <= yBot + 2;
    if (!inBand && !inBox(x, y, r.x, r.y, r.w, r.h) && !(e && inBox(x, y, e.x, e.y, e.w, e.h))) outMax = Math.max(outMax, df);
    if (inBand && y > yTop && deep(x, y)) alphaMin = Math.min(alphaMin, D.d[i + 3]);
  }
  // 턱끝 이동 — 입 칸 «아래»(입 그림이 바뀌는 곳은 빼고) 가운데 세로줄(±3열 평균) 밝기를 맞춰 본다
  const cx = Math.round(m.X((j.x0 + j.x1) / 2)), ya = Math.ceil(m.Y(r.y + r.h)) + 3, yb = Math.ceil(m.Y(j.bot));
  const col = img => { const o = []; for (let y = ya; y <= yb; y++) { let s = 0; for (let dx = -3; dx <= 3; dx++) s += lum(img, cx + dx, y); o.push(s / 7); } return o; };
  const want = j.D * m.ky;
  const shift = bestShift(col(D), col(A), -1, want * 2 + 2);
  return { outMax, alphaMin, shift, want };
}

// 🔄 같은 시각·같은 기울기에서 «돌림 있는 판» 과 «돌림 끈 판» 을 1:1 로 — 차이는 돌림(yaw) 뿐
async function swayFrames(name, src) {
  SRC = src; const { ctx, page, errs } = await openPage(name, true);
  // 눈 줄 ±3 줄만 떠 온다(전체 장을 16번 옮기면 느립니다) — 나머지 줄은 0 으로 채워 같은 좌표를 쓴다
  const size = await page.evaluate(() => { const c = document.getElementById('tavatar-canvas'); return [c.width, c.height]; });
  const e = EYES[name], yr = Math.round(mapper(name, size[0], size[1]).Y(e.y + 0.55 * e.h));
  const frames = [];
  for (let k = 0; k < 16; k++) {
    await page.evaluate(t => { window.__T = 1000 + t; }, k * 470); await page.waitForTimeout(120);
    const f = await page.evaluate(([y0, n]) => {
      const c = document.getElementById('tavatar-canvas');
      return { w: c.width, h: c.height, rows: Array.from(c.getContext('2d').getImageData(0, y0, c.width, n).data) };
    }, [yr - 3, 7]);
    const d = new Uint8Array(f.w * f.h * 4); d.set(f.rows, (yr - 3) * f.w * 4);
    frames.push({ w: f.w, h: f.h, d });
  }
  await ctx.close();
  return { frames, errs };
}
function yawCompare(name, a, b) {
  const W = a[0].w, m = mapper(name, W, a[0].h), e = EYES[name], hw = e.w / 2, c = e.x + hw;
  const y = Math.round(m.Y(e.y + 0.55 * e.h)), xa = Math.round(m.X(c - 0.5 * hw)), xb = Math.round(m.X(c + 0.5 * hw));
  const row = img => { const o = []; for (let x = xa; x <= xb; x++) { let s = 0; for (let dy = -2; dy <= 2; dy++) s += lum(img, x, y + dy); o.push(s / 5); } return o; };
  const edges = img => {
    const al = x => img.d[(y * W + x) * 4 + 3]; let L = null, R = null;
    for (let x = 1; x < W && L === null; x++) if (al(x) >= 128 && al(x - 1) < 128) L = x - 1 + (128 - al(x - 1)) / (al(x) - al(x - 1));
    for (let x = W - 2; x >= 0 && R === null; x--) if (al(x) >= 128 && al(x + 1) < 128) R = x + (al(x) - 128) / (al(x) - al(x + 1));
    return [L, R];
  };
  let eye = 0, edge = 0, found = true, hole = 0;
  for (let k = 0; k < a.length; k++) {
    for (let yy = y - 3; yy <= y + 3; yy++) for (let x = 0; x < W; x++) {
      const i = (yy * W + x) * 4; if (b[k].d[i + 3] === 255) hole = Math.max(hole, 255 - a[k].d[i + 3]);
    }
    eye = Math.max(eye, Math.abs(bestShift(row(a[k]), row(b[k]), -8, 8)));
    const [L, R] = edges(a[k]), [L0, R0] = edges(b[k]);
    if ([L, R, L0, R0].includes(null)) { found = false; continue; }
    edge = Math.max(edge, Math.abs(L - L0), Math.abs(R - R0));
  }
  return { eye, edge, found, hole, plan: YAW * hw * m.kx };
}
// 🪡 ⑨ 자홍 픽셀 수 — 얼굴·입술·머리카락·투명 배경에는 «초록보다 파랑·빨강이 훨씬 큰» 픽셀이 없다
const BLEED = NEW.replace('mc=mouthTile(sprite,tx,ty,r.w,r.h)', 'mc=null');
const magenta = img => { let n = 0; for (let i = 0; i < img.d.length; i += 4) { const [r, g, b, a] = [img.d[i], img.d[i + 1], img.d[i + 2], img.d[i + 3]];
  if (a > 0 && b - g > 15 && r - g > 30) n++; } return n; };
const NOYAW = NEW.replace(/var SWAY_YAW\s*=\s*[\d.]+/, 'var SWAY_YAW = 0');

let bleedSum = 0, lilyBleed = Infinity;
try {
  for (const name of Object.keys(JAW)) {
    console.log(`\n■ 턱 · ${name}`);
    SRC = NEW; const s = await jawShots(name);
    ok(s.A && s.D && s.errs.length === 0, `재생 중 A·D 를 떴다 · 페이지 오류 없음${s.errs[0] ? ' — ' + s.errs[0] : ''}`);
    if (!s.A || !s.D) continue;
    const r = jawMeasure(name, s);
    ok(r.shift >= r.want * 0.5 && r.shift <= r.want * 1.5, `① 턱끝이 내려간다 ${r.shift.toFixed(1)}px (계획 ${r.want.toFixed(1)}px)`);
    ok(r.outMax === 0, `② 띠·입 칸·눈 칸 밖은 그대로 (최대 차 ${r.outMax})`);
    ok(r.alphaMin >= 250, `③ 얼굴 속에 투명한 틈이 없다 (최소 알파 ${r.alphaMin})`);
    if (NEW !== BLEED) {
      PROBE = true;
      const pn = await jawShots(name); SRC = BLEED; const pb = await jawShots(name); SRC = NEW; PROBE = false;
      for (const k of ['A', 'D']) {   // 기준선 = 같은 판의 보통 렌더(s) — Jake 셔츠처럼 원래 자홍빛인 픽셀은 빼고 센다
        const base = magenta(s[k]), now = pn[k] ? magenta(pn[k]) - base : NaN, bl = pb[k] ? magenta(pb[k]) - base : NaN;
        ok(now === 0, `⑨ (${k}) 옆 칸이 번지지 않는다 — 늘어난 자홍 픽셀 ${now}${pn.errs[0] ? ' · ' + pn.errs[0] : ''}`);
        console.log(`     (짝 참고) 아틀라스에서 바로 늘인 판: 늘어난 자홍 픽셀 ${bl}`);
        bleedSum += bl > 0 ? bl : 0; if (name === 'lily') lilyBleed = Math.min(lilyBleed, bl);
      }
    } else ok(false, '⑨ (전제) BLEED 판을 만들 자리(mc=mouthTile(...))를 소스에서 못 찾았다');
    if (OLD) {
      SRC = OLD; const so = await jawShots(name); const ro = so.A && so.D ? jawMeasure(name, so) : null;
      ok(ro && Math.abs(ro.shift) <= 0.5, `① (짝) 옛 판은 턱이 안 내려간다 (${ro ? ro.shift.toFixed(1) : '?'}px)`);
    }
  }
  ok(lilyBleed >= 20 && lilyBleed !== Infinity, `⑨ (짝) 제보된 Lily 에서 «바로 늘인 판» 은 실제로 번진다 — 늘어난 자홍 픽셀 최소 ${lilyBleed} (이 검사가 번짐을 볼 수 있다는 증거)`);
  for (const name of Object.keys(HEAD).filter(n => EYES[n])) {
    console.log(`\n■ 고개 · ${name}`);
    const on = await swayFrames(name, NEW), off = await swayFrames(name, NOYAW), y = yawCompare(name, on.frames, off.frames);
    ok(on.errs.length === 0 && off.errs.length === 0 && y.found, '페이지 오류 없음 · 눈 높이에서 윤곽 양끝을 찾았다');
    ok(y.eye >= y.plan * 0.35, `④ 눈 줄이 옆으로 간다 — 최대 ${y.eye.toFixed(2)}px (계획 ±${y.plan.toFixed(2)}px)`);
    ok(y.eye <= y.plan * 1.5, `⑤ 너무 크지 않다 (≤ ${(y.plan * 1.5).toFixed(2)}px)`);
    ok(y.edge <= 0.5, `⑥ 얼굴 윤곽(눈 높이 양끝)은 그대로 — 최대 ${y.edge.toFixed(2)}px`);
    ok(y.hole <= 4, `⑦ 띠 끝에 반투명한 줄이 없다 — 불투명하던 곳 알파 감소 최대 ${y.hole}`);
    if (OLD) { const old = await swayFrames(name, OLD), yo = yawCompare(name, old.frames, off.frames);
      ok(yo.eye <= 0.3, `④ (짝) 옛 판 vs 돌림 끈 판 — 눈 줄 차이 ${yo.eye.toFixed(2)}px ≤ 0.3 (재는 법이 기울기를 돌림으로 안 센다)`); }
  }
} finally {
  await browser.close(); server.close();
}
console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
