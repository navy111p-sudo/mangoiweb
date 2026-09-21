/* ═══════════════════════════════════════════════════════════════════════════
   🎮 게임 허브 «오늘 몫» 줄 — 진짜 브라우저로 재는 검사 (2026-09-21 신설 · C안)

   ⚠️ **자동으로 안 돕니다 — 사람이 부릅니다.** `manual/` 은 게이트가 물어 가지 않습니다.
       PW_DIR=/tmp/pw node test-harness/manual/game-today-goal-browser.mjs

   [왜 여기가 따로 필요한가]
     문자열 하니스는 «무슨 글자가 나오는가» 까지는 봅니다. 그런데 이 줄이 실제로
     **얼마나 넓게 · 어디에 · 가려지지 않고 · 읽히게** 그려지는지는 브라우저만 압니다.
     이 저장소가 이미 밟은 함정 — 그리드 자식에 좌우 `auto` 마진을 주면 stretch 가 꺼져
     **글자 폭만큼 쪼그라듭니다**(1280px 실측 654 → 129px). 코드에는 `width:min(720px,…)` 이
     멀쩡히 있어서 파일만 봐서는 보이지 않습니다.

   [무엇을 재나]
     ① 폰·PC 세 폭에서 줄이 «첫 화면 안» 에 있고 칸을 제대로 채우는가
     ② 채움이 실제로 그 비율만큼 그려지는가(인라인 span 함정 — 폭 0 이면 색도 안 보인다)
     ③ 그 자리의 «맨 위» 가 이 줄 자신인가(남이 덮고 있지 않은가)
     ④ 짝 — 모르면(비로그인·조회 실패·서버가 null) 아예 안 그리는가
     ⑤ 🌐 영어로도 말이 되는가
     ⑥ 글자가 «읽히는가» — 이 화면은 밝은 바탕이라 어두운 글자여야 한다(대비를 픽셀로)

   변이시험 — 2026-09-21 실측(아래 「되돌리기」 절 참고)
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 9413, HTTP = 8953;
const ROOT = new URL('../../', import.meta.url).pathname;
const PUB = join(ROOT, 'cloudflare-deploy', 'public');

let PASS = 0, FAIL = 0;
const ok = (n) => { console.log('  ✅ ' + n); PASS++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w !== undefined ? '\n       ' + JSON.stringify(w) : '')); FAIL++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

/* ⛔ 단위·목표를 여기 손으로 적지 않는다 — 서버가 내려주는 모양 그대로 흉내만 낸다.
      (기대 «글자» 는 아래에서 이 값으로 만들어 대조한다 — 하니스에 문장을 베끼지 않는다.) */
const MISSION = (o) => Object.assign({ goal: 5, count: 2, left: 3, reached: false,
  unitKo: '문제', unitEn: 'question', unitEnPl: 'questions' }, o);

const srv = spawn('python3', ['-m', 'http.server', String(HTTP)], { cwd: PUB, stdio: 'ignore' });
const prof = mkdtempSync(join(tmpdir(), 'gmtoday-'));
const br = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const bye = () => { try { br.kill(); } catch {} try { srv.kill(); } catch {} };
process.on('exit', bye);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(5000);

/* ── 픽셀 — 대비는 «계산» 이 아니라 «찍어서» 잰다 ──────────────────────────
   ⛔ `clip` 은 «문서» 좌표, `getBoundingClientRect` 는 «뷰포트» 좌표다 — scrollX/Y 를 더한다. */
function pngPixels(b64) {
  const buf = Buffer.from(b64, 'base64');
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG 아님');
  let off = 8, w = 0, hgt = 0, ct = 6, depth = 8; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); hgt = data.readUInt32BE(4); depth = data[8]; ct = data[9];
                           if (data[12]) throw new Error('인터레이스는 안 푼다'); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error('8bit 만 푼다');
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!ch) throw new Error('RGB/RGBA 만 푼다');
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * hgt * ch), stride = w * ch;
  for (let y = 0; y < hgt; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const A = x >= ch ? out[y * stride + x - ch] : 0;
      const B = y > 0 ? out[(y - 1) * stride + x] : 0;
      const C = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0;
      let v = line[x];
      if (f === 1) v += A; else if (f === 2) v += B; else if (f === 3) v += (A + B) >> 1;
      else if (f === 4) { const pp = A + B - C, pa = Math.abs(pp - A), pb = Math.abs(pp - B), pc = Math.abs(pp - C);
                          v += (pa <= pb && pa <= pc) ? A : (pb <= pc ? B : C); }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h: hgt, ch, px: out };
}
const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

/* 회차마다 «새» 컨텍스트로 연다 — init 스크립트는 쌓이고, 쌓이면 1회차 스텁이 나중 회차를 덮는다.
   ⛔ 캐시는 HTTP 와 서비스워커 **둘 다** 꺼야 한다(sw.js 가 옛 사본을 준다). */
async function open(mission, w, h, lang, uid, opts) {
  const o = opts || {};
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const w8 = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; w8.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && w8.has(m.id)) { const x = w8.get(m.id); w8.delete(m.id); m.error ? x.rej(new Error(JSON.stringify(m.error))) : x.res(m.result); } });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  try { await send('Network.setBypassServiceWorker', { bypass: true }); } catch {}
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  const body = o.noField ? { ok: true } : { ok: true, games_today: mission };
  /* 🪤 같은 브라우저를 계속 쓰므로 **앞 회차의 localStorage 가 그대로 넘어온다** —
        「안 넣는다」로는 «비로그인» 을 흉내낼 수 없다(실제로 밟았다: noLogin 회차가
        앞 회차의 로그인 정보로 요청을 보냈다). 회차마다 **지우고** 넣는다. */
  const initId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try { localStorage.removeItem('mangoi_logged_user'); localStorage.removeItem('mango_user');
          localStorage.removeItem('mango_token'); } catch(e){}
    try { ${o.noLogin ? '' : `localStorage.setItem('mangoi_logged_user', JSON.stringify({uid:${JSON.stringify(uid)},name:'T'}));`}
          ${o.noToken ? '' : "localStorage.setItem('mango_token','T');"}
          localStorage.setItem('mangoi_lang', ${JSON.stringify(lang)}); } catch(e){}
    (function(){ var real = window.fetch;
      window.fetch = function(u){ var s = String(u);
        if (s.indexOf('/api/student/today') >= 0) { window.__todayCalls = (window.__todayCalls||0) + 1;
          return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(body)}),
                 { status:200, headers:{'content-type':'application/json'} })); }
        return real.apply(this, arguments); }; })();` })).identifier;
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP}/student-games.html?_nc=` + Date.now() });
  await sleep(2400);
  const ev = (x) => send('Runtime.evaluate', { returnByValue: true, expression: x });
  const r = await ev(`(function(){
    var b=document.getElementById('gm-today'), t=document.getElementById('gm-today-t'), f=document.getElementById('gm-today-fill');
    if(!b) return JSON.stringify({err:'no box'});
    var rb=b.getBoundingClientRect(), rf=f.getBoundingClientRect(), rt=t.getBoundingClientRect();
    var cs=getComputedStyle(b), cf=getComputedStyle(f), ct=getComputedStyle(t);
    /* «맨 위가 나인가» — display 만 보면 «보인다» 와 «가려지지 않았다» 를 못 가른다 */
    var topEl = rt.width>0 ? document.elementFromPoint(rt.left+rt.width/2, rt.top+Math.min(rt.height/2,6)) : null;
    var m = /rgba?\\(([^)]+)\\)/.exec(ct.color) || [0,'0,0,0'];
    var p = m[1].split(',').map(parseFloat);
    var o=1,x=t,g=0; while(x&&x.nodeType===1&&g++<40){ var v=parseFloat(getComputedStyle(x).opacity); if(!isNaN(v)) o*=v; x=x.parentElement; }
    var lh = parseFloat(ct.lineHeight) || parseFloat(ct.fontSize)*1.4;
    return JSON.stringify({ text:t.textContent, cls:t.className, disp:cs.display, hidden:b.hidden,
      top:Math.round(rb.top), boxW:Math.round(rb.width), parentW:Math.round((b.parentElement||document.body).getBoundingClientRect().width),
      fillW:Math.round(rf.width), trackW:Math.round(f.parentElement.getBoundingClientRect().width),
      fillDisp:cf.display, topAtSelf: !!(topEl && b.contains(topEl)),
      inFirst: rb.top >= 0 && rb.top < innerHeight, lines: Math.round(rt.height/lh),
      fontPx: parseFloat(ct.fontSize), fg:{r:p[0],g:p[1],b:p[2],a:(p.length>3?p[3]:1)*o},
      rect:{x:Math.round(rt.left+scrollX), y:Math.round(rt.top+scrollY), w:Math.round(rt.width), h:Math.round(rt.height)},
      calls: window.__todayCalls||0 });
  })()`);
  const meta = JSON.parse(r.result.value);
  /* 대비 — 글자를 잠깐 투명으로 만들고 그 자리를 찍는다(= 진짜 배경) */
  if (!meta.err && meta.rect.w > 8 && o.wantContrast) {
    await ev(`(function(){ document.getElementById('gm-today-t').style.setProperty('color','transparent','important'); })()`);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false,
      clip: { x: meta.rect.x + 2, y: meta.rect.y + 2, width: Math.max(8, meta.rect.w - 4), height: Math.max(8, meta.rect.h - 4), scale: 1 } });
    await ev(`(function(){ document.getElementById('gm-today-t').style.removeProperty('color'); })()`);
    const img = pngPixels(shot.data);
    let worst = 99, wl = null;
    for (let k = 0; k < img.w * img.h; k++) {
      const q = k * img.ch, R = img.px[q], G = img.px[q + 1], B = img.px[q + 2];
      const bl = lum(R, G, B);
      const cr = meta.fg.r * meta.fg.a + R * (1 - meta.fg.a), cg = meta.fg.g * meta.fg.a + G * (1 - meta.fg.a), cb = meta.fg.b * meta.fg.a + B * (1 - meta.fg.a);
      const tl = lum(cr, cg, cb);
      const ratio = (Math.max(tl, bl) + 0.05) / (Math.min(tl, bl) + 0.05);
      if (ratio < worst) { worst = ratio; wl = [R, G, B]; }
    }
    meta.ratio = Math.round(worst * 100) / 100; meta.bg = wl;
    meta.need = meta.fontPx >= 24 ? 3 : 4.5;
  }
  /* 🌐 토글을 **진짜로 눌러** 본다 — 「배선했다」와 「닿는다」는 다르다.
     🔴 이 화면은 `mangoi:lang-changed` 를 발행하지 않아, 그 행사만 듣는 배선은
        한 번도 안 불립니다(2026-09-21 실측 — 바로 이 검사가 없어서 못 봤습니다). */
  if (!meta.err && o.toggle) {
    const b = JSON.parse((await ev(`(function(){ var b=document.getElementById('site-lang-btn');
      if(!b) return JSON.stringify({no:1}); var r=b.getBoundingClientRect();
      return JSON.stringify({x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), w:Math.round(r.width)}); })()`)).result.value);
    meta.hasLangBtn = !b.no && b.w > 0;
    if (meta.hasLangBtn) {
      for (const type of ['mousePressed', 'mouseReleased'])
        await send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
      await sleep(400);
      const r2 = JSON.parse((await ev(`(function(){ var t=document.getElementById('gm-today-t');
        return JSON.stringify({ text:t.textContent, lang:document.documentElement.lang,
          saved:(function(){try{return localStorage.getItem('mangoi_lang')||'';}catch(e){return '?';}})() }); })()`)).result.value);
      meta.text2 = r2.text; meta.lang2 = r2.lang; meta.saved2 = r2.saved;
    }
  }
  try { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initId }); } catch {}
  ws.close();
  return meta;
}

console.log('🎮 게임 허브 «오늘 몫» — 브라우저 실측\n');

console.log('① 세 폭에서 제대로 그려지는가');
for (const [w, h, tag] of [[360, 640, '작은 폰'], [390, 844, '폰'], [1280, 800, 'PC']]) {
  const r = await open(MISSION({}), w, h, 'ko', 'u' + w);
  if (r.err) { check(`${tag} — 줄을 찾았다`, false, r.err); continue; }
  console.log(`    · ${tag} ${w}x${h} — 「${r.text}」 · 칸 ${r.boxW}/${r.parentW}px · 채움 ${r.fillW}/${r.trackW}px · top ${r.top}`);
  check(`${tag} — 줄이 보인다`, r.hidden === false && r.disp !== 'none', r.disp);
  check(`${tag} — 첫 화면 안에 있다`, r.inFirst, r.top);
  /* 🪤 «글자 폭» 으로 쪼그라드는 그리드 함정 — 부모의 절반은 넘어야 한다 */
  check(`${tag} — 칸이 쪼그라들지 않았다(부모의 절반 이상)`, r.boxW >= r.parentW * 0.5, [r.boxW, r.parentW]);
  check(`${tag} — 채움이 «인라인» 이 아니다(폭이 실제로 그려진다)`, r.fillDisp === 'block' && r.fillW > 0, [r.fillDisp, r.fillW]);
  /* 2 / 5 = 40% — 실제 픽셀로 확인(±4px) */
  check(`${tag} — 채움이 그 비율(40%)만큼 그려진다`, Math.abs(r.fillW - r.trackW * 0.4) <= 4, [r.fillW, r.trackW]);
  check(`${tag} — 그 자리의 맨 위가 이 줄 자신이다(가려지지 않았다)`, r.topAtSelf, r.topAtSelf);
  check(`${tag} — 낱글자로 쪼개지지 않는다(≤2줄)`, r.lines <= 2, r.lines);
}

console.log('\n② 서버가 준 숫자를 그대로 말하는가 (화면이 지어내지 않는다)');
{
  const r = await open(MISSION({}), 390, 844, 'ko', 'u2');
  const m = MISSION({});
  check('「2 / 5문제 · 3문제 더!」', r.text.indexOf(m.count + ' / ' + m.goal + m.unitKo) === 0 && r.text.indexOf(m.left + m.unitKo) > 0, r.text);
  const hit = await open(MISSION({ count: 5, left: 0, reached: true }), 390, 844, 'ko', 'u2h');
  check('다 채우면 «끝» 이라고 말한다', /끝/.test(hit.text), hit.text);
  check('다 채워도 «더 해도 좋아요» 를 함께 말한다(잠그지 않는다)', /더 해도/.test(hit.text), hit.text);
  check('다 채우면 막대 색이 바뀐다(hit)', /hit/.test(hit.cls), hit.cls);
  check('채움이 100% 다', Math.abs(hit.fillW - hit.trackW) <= 2, [hit.fillW, hit.trackW]);
}

console.log('\n③ 짝 — 모르면 아무 말도 하지 않는다');
{
  const nul = await open(null, 390, 844, 'ko', 'u3');
  check('서버가 «모름»(null) 을 주면 줄을 안 그린다 — 0 이라 말하지 않는다', nul.hidden === true && nul.text === '', nul.text);
  const none = await open(MISSION({}), 390, 844, 'ko', 'u3b', { noField: true });
  check('응답에 그 칸이 아예 없어도 안 그린다', none.hidden === true, none.text);
  const noTok = await open(MISSION({}), 390, 844, 'ko', 'u3c', { noToken: true });
  check('토큰이 없으면 물어보지도 않는다', noTok.calls === 0 && noTok.hidden === true, noTok.calls);
  const noLog = await open(MISSION({}), 390, 844, 'ko', 'u3d', { noLogin: true });
  check('비로그인이면 물어보지도 않는다', noLog.calls === 0 && noLog.hidden === true, noLog.calls);
  /* 짝 — 로그인·토큰이 있으면 «실제로» 한 번 물어본다(없으면 «전부 안 묻기» 도 통과한다) */
  const yes = await open(MISSION({}), 390, 844, 'ko', 'u3e');
  check('짝: 로그인했으면 한 번 물어본다', yes.calls === 1, yes.calls);
}

console.log('\n④ 🌐 영어');
{
  const en = await open(MISSION({}), 390, 844, 'en', 'u4');
  const m = MISSION({});
  check('「2 / 5 questions · 3 to go」', en.text.indexOf(m.count + ' / ' + m.goal + ' ' + m.unitEnPl) === 0 && /to go/.test(en.text), en.text);
  const enHit = await open(MISSION({ count: 5, left: 0, reached: true }), 390, 844, 'en', 'u4h');
  check('영어 — 채우면 「goal done」', /goal done/i.test(enHit.text), enHit.text);

  /* 🔴 토글을 진짜로 눌러 본다 — 이 검사가 없어 «죽은 배선» 을 못 봤다 */
  const tgK = await open(MISSION({}), 390, 844, 'ko', 'u4t', { toggle: true });
  check('전제: 🌐 버튼이 화면에 있다', tgK.hasLangBtn === true, tgK.hasLangBtn);
  check('전제: 누르기 전엔 한국어다', /문제/.test(tgK.text) && !/to go/.test(tgK.text), tgK.text);
  check('🌐 한국어에서 눌렀더니 이 줄도 영어가 된다',
        /to go/.test(tgK.text2 || '') && !/문제/.test(tgK.text2 || ''), [tgK.text, tgK.text2]);
  check('짝: 원래 토글도 그대로 돌았다(저장값·<html lang> 이 en)',
        tgK.saved2 === 'en' && tgK.lang2 === 'en', [tgK.saved2, tgK.lang2]);
  const tgE = await open(MISSION({}), 390, 844, 'en', 'u4t2', { toggle: true });
  check('짝: 영어에서 눌러도 따라온다(한국어로)',
        /문제/.test(tgE.text2 || '') && !/to go/.test(tgE.text2 || ''), [tgE.text, tgE.text2]);
}

console.log('\n⑤ 글자가 «읽히는가» — 이 화면은 밝은 바탕이다(픽셀로 잰다)');
for (const [name, mission] of [['진행 중', MISSION({})], ['다 채움', MISSION({ count: 5, left: 0, reached: true })]]) {
  const c = await open(mission, 390, 844, 'ko', 'u5' + name.length, { wantContrast: true });
  if (c.err || c.ratio == null) { check(`${name} — 대비를 쟀다`, false, c.err || 'no ratio'); continue; }
  console.log(`    · ${name} 「${c.text.slice(0, 22)}」 ${c.fontPx}px · 글자 rgb(${c.fg.r},${c.fg.g},${c.fg.b}) · 최악 배경 rgb(${c.bg}) · 대비 ${c.ratio} (필요 ${c.need})`);
  check(`${name} — 대비 ≥ ${c.need}`, c.ratio >= c.need, c.ratio);
}

console.log('\n─────────────────────────────────────────────');
console.log(`결과: PASS ${PASS} / FAIL ${FAIL}`);
bye();
process.exit(FAIL > 0 ? 1 : 0);
