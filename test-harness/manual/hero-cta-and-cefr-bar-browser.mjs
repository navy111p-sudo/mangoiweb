/* hero-cta-and-cefr-bar-browser.mjs — 「그려지는가」를 실제 브라우저에서 잰다 (2026-09-09)
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
 *      cd cloudflare-deploy/public && python3 -m http.server 8877 &
 *      /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
 *        --remote-debugging-port=9222 --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader about:blank &
 *      node test-harness/manual/hero-cta-and-cefr-bar-browser.mjs
 *
 * ── 왜 브라우저여야 하나 ────────────────────────────────────────────────────
 * 이번 사고 두 건은 **문자열로는 원리상 못 봅니다**. 둘 다 규칙도 값도 전부 «있었고»
 * 틀린 것은 «화면에 무엇이 나오는가» 뿐이었습니다.
 *   ① 레벨테스트 CEFR 막대 — 채움이 <span>(display:inline)이라 폭·높이가 «0».
 *      4/4 와 0/4 가 똑같이 빈 막대였습니다.
 *   ③ 홈 큰 버튼 — 맨 뒤 덮어쓰기가 골드 «채움» 을 10% 투명 유리로 덮고 있었습니다.
 *
 * ── 여기서 재는 것 ──────────────────────────────────────────────────────────
 *   A. CEFR 막대: 채움 폭 ÷ 막대 폭 이 점수 비율과 같은가 · 4/4 와 0/4 가 «다르게» 보이는가
 *   B. 홈 CTA: 배경이 그라데이션(채움)인가 · 글자와 대비가 충분한가(WCAG)
 *   C. 홈 CTA: 오늘 상태 줄이 잘리지 않는가(폰 390px) · 라벨이 살아 있는가
 *
 * ⚠️ 첫 방문자 오버레이(#aw-overlay·코치마크)가 클릭·스크롤을 막습니다 — «본 것» 으로 표시하고 엽니다.
 * ⚠️ 서비스워커가 cache-first 라 HTTP 캐시만 꺼서는 «고치기 전» 파일이 나옵니다. 둘 다 끕니다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:8877';

let PASS = 0, FAIL = 0;
const check = (n, c, d = '') => { if (c) PASS++; else FAIL++; console.log(`  ${c ? '✅' : '❌'} ${n}${c || !d ? '' : '  — ' + d}`); };

async function connect() {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('열린 탭이 없습니다 — 크로미움을 about:blank 로 띄우세요');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const w = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; w.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result?.result?.value;
  };
  await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Network.setBypassServiceWorker', { bypass: true });   // ⚠️ 이거 없으면 옛 사본이 나온다
  const goto = async (url) => {
    await send('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + '_nc=' + Date.now() });
    await new Promise((r) => setTimeout(r, 2200));
  };
  return { send, evalJs, goto, close: () => ws.close() };
}

/** WCAG 대비비 — «최악의 경우» 를 잰다.
 *  🪤 처음 판은 세 겹으로 헛돌았습니다(함정 대조가 잡음):
 *    ① 새로 만든 `.mgcs-sub` 를 «한 번도 재지 않았습니다»(라벨만 쟀습니다)
 *    ② `opacity` 를 안 봤습니다 — 그 요소를 통째로 흐리게 만드는데 색만 읽으면 실제보다 세게 나옵니다
 *    ③ 그라데이션에서 «첫 stop»(가장 밝은 쪽)만 배경으로 썼습니다 — 글자가 앉은 어두운 구간이 아닙니다
 *  ⟹ 그 상태에서 실측하니 4.12:1(미달)인 줄이 «통과» 로 나왔습니다. 셋 다 고친 지금은 5.46:1 입니다.
 *  ⚠️ 반투명 층은 «멈추지 말고» 아래에서 위로 합성합니다(CLAUDE.md 실측 전례). */
const CONTRAST_FN = `
  function _lum(c){ const f=v=>{v/=255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};
    return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]); }
  function _rgb(s){ const m=String(s).match(/rgba?\\(([^)]+)\\)/); if(!m) return null;
    const p=m[1].split(',').map(x=>parseFloat(x)); return [p[0],p[1],p[2], p.length>3?p[3]:1]; }
  /** 그 요소 뒤에 실제로 깔린 «색 후보» 를 전부 — 그라데이션이면 stop 을 «모두» 돌려준다 */
  function _bgsOf(el){
    const stack=[]; let stops=null;
    for(let n=el; n; n=n.parentElement){ const cs=getComputedStyle(n);
      let c=_rgb(cs.backgroundColor);
      if((!c||c[3]===0) && cs.backgroundImage && cs.backgroundImage!=='none'){
        const g=cs.backgroundImage.match(/rgba?\\([^)]+\\)/g);   // ⚠️ 전역 — 첫 stop 만 보면 «가장 밝은 곳» 만 잰다
        if(g && g.length){ stops = g.map(_rgb); break; }
      }
      if(!c||c[3]===0) continue;
      stack.push(c); if(c[3]===1) break;
    }
    const flatten = (base) => { let out=base.slice(0,3);
      for(let i=stack.length-1;i>=0;i--){ const c=stack[i],a=c[3];
        out=[0,1,2].map(k=>c[k]*a+out[k]*(1-a)); } return out; };
    if(stops && stops.length) return stops.map(flatten);
    if(!stack.length) return [[255,255,255]];
    return [flatten(stack[stack.length-1])];
  }
  /** ⚠️ opacity 는 그 요소를 통째로 흐리게 한다 — 글자색을 배경과 «합성» 해야 진짜 값이 나온다.
   *     조상에 걸린 opacity 도 곱해진다. */
  function _fgOf(el){ const fg=_rgb(getComputedStyle(el).color)||[0,0,0]; let op=1;
    for(let n=el; n && n.nodeType===1; n=n.parentElement){ const o=parseFloat(getComputedStyle(n).opacity);
      if(!isNaN(o)) op*=o; }
    return [fg[0],fg[1],fg[2], fg[3]*op]; }
  function contrastOf(el){ const fg=_fgOf(el);
    let worst=99;
    for(const bg of _bgsOf(el)){
      const blended=[0,1,2].map(k=>fg[k]*fg[3]+bg[k]*(1-fg[3]));
      const a=_lum(blended)+.05,b=_lum(bg)+.05;
      worst=Math.min(worst, Math.max(a,b)/Math.min(a,b));
    }
    return +worst.toFixed(2); }
`;

const c = await connect();

/* ══ A. 레벨테스트 CEFR 막대 ═══════════════════════════════════════════════
   ⚠️ 마크업을 베껴 쓰지 않는다 — 정본에서 «그리는 코드» 를 오려 내 그대로 돌린다.
      베껴 쓰면 이 검사가 소스를 한 번도 안 본 채 통과한다. */
console.log('\nA. 레벨테스트 CEFR 막대 — 실제로 그려지는가');
{
  const src = readFileSync(join(ROOT, 'cloudflare-deploy/public/level-test-ai.html'), 'utf8');
  const a = src.indexOf('    var bk = d.breakdown || [];');
  const b = src.indexOf("}).join('');", a);
  if (a < 0 || b < 0) { check('A-0 렌더 코드를 소스에서 잘라 냈다', false); }
  else {
    check('A-0 렌더 코드를 소스에서 잘라 냈다', true);
    await c.goto(BASE + '/level-test-ai.html');
    const rows = await c.evalJs(`(() => {
      const d = { breakdown: [{cefr:'A1',correct:4,total:4},{cefr:'A2',correct:3,total:4},
                              {cefr:'B1',correct:1,total:4},{cefr:'C2',correct:0,total:4}] };
      const esc = s => String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
      const $ = id => document.getElementById(id);
      $('result-card').classList.remove('hidden');
      ${src.slice(a, b + "}).join('');".length)}
      return [...document.querySelectorAll('#ai-breakdown .bkrow')].map(row => {
        const bar = row.querySelector('.bkbar'), fill = row.querySelector('.bkfill');
        const fb = fill.getBoundingClientRect(), bb = bar.getBoundingClientRect(), cs = getComputedStyle(fill);
        return { cefr: row.querySelector('.bl').textContent, n: row.querySelector('.bkn').textContent,
          ratio: bb.width ? +(fb.width/bb.width).toFixed(3) : 0, h: +fb.height.toFixed(1),
          paint: (cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.backgroundColor).slice(0,40) };
      });
    })()`);
    const by = Object.fromEntries(rows.map((r) => [r.cefr, r]));
    check('A-1 4/4 가 막대를 «가득» 채운다 (전에는 0px 이었다)', by.A1 && by.A1.ratio > 0.98, JSON.stringify(by.A1));
    check('A-2 채움에 높이가 있다', by.A1 && by.A1.h >= 6, by.A1 && String(by.A1.h));
    check('A-3 3/4 는 4분의 3', by.A2 && Math.abs(by.A2.ratio - 0.75) < 0.02, JSON.stringify(by.A2));
    check('A-4 1/4 는 4분의 1', by.B1 && Math.abs(by.B1.ratio - 0.25) < 0.02, JSON.stringify(by.B1));
    check('A-5 0/4 도 «측정됐다» 를 남긴다 (빈 막대가 아니다)', by.C2 && by.C2.ratio > 0, JSON.stringify(by.C2));
    check('A-6 🔴 4/4 와 0/4 가 «다르게» 보인다 ← 이번 사고의 핵심',
      by.A1 && by.C2 && (by.A1.ratio !== by.C2.ratio) && (by.A1.paint !== by.C2.paint));
    check('A-7 네 등급의 색이 서로 다르다', new Set(rows.map((r) => r.paint)).size === rows.length,
      JSON.stringify(rows.map((r) => r.paint)));
  }
}

/* ══ B·C. 홈 큰 버튼 ═══════════════════════════════════════════════════════ */
for (const [label, width] of [['PC 1280px', 1280], ['폰 390px', 390]]) {
  console.log(`\nB. 홈 CTA — ${label}`);
  await c.send('Emulation.setDeviceMetricsOverride', { width, height: 860, deviceScaleFactor: 1, mobile: false });
  /* 로그인 회원 + 오늘 계획·다음 수업 스텁. 토큰 앞부분은 base64url JSON 이어야 히어로가 회원용으로 바뀐다.
     ⚠️ 첫 방문자 코치마크(mangoi_onboard_v1)를 «본 것» 으로 표시하지 않으면 버튼을 덮는다. */
  const tok = Buffer.from(JSON.stringify({ uid: 'stub01', exp: 9999999999999 })).toString('base64url');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try { localStorage.setItem('mangoi_onboard_v1','seen:1');
          localStorage.setItem('mango_token','${tok}.sig');
          localStorage.setItem('mangoi_logged_user', JSON.stringify({uid:'stub01',name:'테스트',role:'student'})); } catch(e){}
    const of = window.fetch;
    window.fetch = function(u){ const s=String(u);
      if (s.indexOf('/api/student/today')>=0)
        return Promise.resolve(new Response(JSON.stringify({ok:true,plan:{doneCount:2,steps:[1,2,3]}}),{headers:{'content-type':'application/json'}}));
      if (s.indexOf('/api/class/sessions/today')>=0)
        return Promise.resolve(new Response(JSON.stringify({ok:true,now:Date.now(),current:{schedule_id:1,room_id:'r',status:'scheduled',teacher_name:'강선생님',start_ts:Date.now()+40*60*1000},sessions:[]}),{headers:{'content-type':'application/json'}}));
      return of.apply(this, arguments); };
  ` });
  await c.goto(BASE + '/index.html');
  await new Promise((r) => setTimeout(r, 4500));
  const out = await c.evalJs(`(() => { ${CONTRAST_FN}
    const r = document.getElementById('hero-member');
    if (!r || !r.offsetParent) return { shown:false };
    return { shown:true, docOverflow: document.documentElement.scrollWidth > innerWidth,
      btns: [...r.children].map(b => { const cs=getComputedStyle(b), sub=b.querySelector('.mgcs-sub'),
        lbl=b.querySelector('span[data-ko]'), rc=b.getBoundingClientRect();
        const mid=[rc.left+rc.width/2, rc.top+rc.height/2];
        const top=document.elementFromPoint(mid[0],mid[1]);
        return { filled: cs.backgroundImage !== 'none', color: cs.color,
          contrast: contrastOf(lbl || b),
          subContrast: sub ? contrastOf(sub) : null,   /* ← 새로 만든 줄도 «반드시» 잰다 */
          h: Math.round(rc.height),
          label: lbl ? lbl.textContent.trim() : null,
          sub: sub ? sub.textContent : null,
          subClipped: sub ? (sub.scrollWidth > sub.clientWidth + 1) : false,
          /* 🪤 스타일 «주입» 이 깨져도 줄은 그대로 보입니다 — 대비 검사만으로는 못 잡습니다.
             (실제로 「따옴표 + 블록주석 + 따옴표」 로 규칙이 NaN 이 되어 통째로 죽은 적이 있습니다.)
             그래서 «작은 글씨인가»·«아래 줄로 내려갔는가» 를 함께 봅니다. */
          subFont: sub ? parseFloat(getComputedStyle(sub).fontSize) : null,
          subBelow: (sub && lbl) ? (sub.getBoundingClientRect().top >= lbl.getBoundingClientRect().bottom - 2) : null,
          clickable: !!(top && (top === b || b.contains(top))) }; }) };
  })()`);
  check('B-0 회원 히어로가 보인다 (스텁이 먹었나 — 전제)', out.shown === true);
  if (out.shown) {
    for (const [i, b] of out.btns.entries()) {
      const who = i === 0 ? '수업 입장' : '오늘의 A.i 학습';
      check(`B-1 ${who}: 배경이 «채움»(그라데이션)이다 ← 10% 투명 유리로 되돌아가지 않았다`, b.filled, JSON.stringify(b.color));
      check(`B-2 ${who}: 라벨 대비 4.5 이상`, b.contrast >= 4.5, String(b.contrast));
      /* ⚠️ 11px 작은 글자라 «큰 글자 3:1» 예외가 안 됩니다. 그리고 그라데이션의 가장 어두운
         끝에서 재야 합니다 — 밝은 끝만 보면 4.12 짜리가 통과합니다(실제로 그랬습니다). */
      check(`B-3 ${who}: 오늘 상태 줄 대비 4.5 이상 (11px 작은 글자)`,
        b.subContrast != null && b.subContrast >= 4.5, String(b.subContrast));
      check(`C-1 ${who}: 라벨이 살아 있다 (i18n 이 지우지 않았다)`, !!b.label, String(b.label));
      check(`C-2 ${who}: 오늘 상태 줄이 있다`, !!b.sub, String(b.sub));
      check(`C-3 ${who}: 상태 줄이 잘리지 않는다`, !b.subClipped, String(b.sub));
      check(`C-6 ${who}: 상태 줄 스타일이 살아 있다 (작은 글씨)`,
        b.subFont != null && b.subFont <= 12, String(b.subFont));
      check(`C-7 ${who}: 상태 줄이 라벨 «아래» 줄에 있다 (옆에 붙지 않았다)`,
        b.subBelow === true, JSON.stringify(b.subBelow));
      check(`C-4 ${who}: 가운데가 «맨 위» 라 눌린다`, b.clickable);
    }
    check('C-5 문서가 가로로 넘치지 않는다', !out.docOverflow);
  }
}

console.log(`\n────────────────────────────────\n  통과 ${PASS} · 실패 ${FAIL}\n────────────────────────────────`);
c.close();
process.exit(FAIL ? 1 : 0);
