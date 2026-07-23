/**
 * 🎛 수업 화면 기본값 하니스 — 2026-07-23 (사장님 지시)
 *   ① 수업에 들어가면 **전체화면**이 기본
 *   ② **영상 화질 기본 = 저**
 *
 * ⚠️ 배경: 설정의 화질 버튼(자동/고/저)은 그동안 **아무 동작도 하지 않았다.**
 *    vc-dock 이 window.vcSetQuality() 를 부르는데 그 함수가 index.html 에 없어서 버튼 색만 바뀌었다.
 *
 * 실행: node test-harness/vc_defaults_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

const html = readFileSync(join(PUB, 'index.html'), 'utf8');
const dock = readFileSync(join(PUB, 'js', 'vc-dock.js'), 'utf8');

/* ── index.html 의 설정 블록을 원문 그대로 잘라내 실행 ── */
function load(saved, fsBehavior) {
  const s = html.indexOf("const VC_Q_KEY = 'mangoi_vc_quality'");
  const e = html.indexOf('(function vcAdaptiveQuality()', s);
  if (s < 0 || e < 0) return null;      // 설정 블록 자체가 없음 → 아래 검사들이 깔끔하게 실패한다
  const store = Object.assign({}, saved || {});
  const log = { fsRequests: 0, pointerHandlers: [], applied: [] };
  const sandbox = {
    console: { log(){}, warn(){}, error(){} },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: {
      fullscreenElement: null, webkitFullscreenElement: null,
      documentElement: {
        requestFullscreen: () => {
          log.fsRequests++;
          return (fsBehavior === 'reject') ? Promise.reject(new Error('gesture'))
               : (fsBehavior === 'none' ? undefined : Promise.resolve());
        }
      },
      addEventListener: (t, h) => { if (t === 'pointerdown') log.pointerHandlers.push(h); },
      removeEventListener: () => {},
    },
    setTimeout: (cb) => { cb(); return 1; },
    vcPeerConnections: {},
    // 화질 상한이 기기별로 갈리므로(모바일/PC) 시험은 PC 기준으로 고정한다
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' },
    matchMedia: () => ({ matches: false }),
    store, log,
  };
  sandbox.window = sandbox;
  if (fsBehavior === 'unsupported') delete sandbox.document.documentElement.requestFullscreen;
  vm.createContext(sandbox);
  vm.runInContext(html.slice(s, e), sandbox);
  sandbox.__vcApplyStep = (pc, step) => log.applied.push({ pc: pc.id, step });
  return sandbox;
}

/* 설정 블록이 아예 없는 버전(수정 전)이면, 아래 동작 검사들을 깔끔하게 실패로 보고하고 끝낸다 */
if (!load({})) {
  check('index.html 에 수업 화면 기본값 코드가 있다 (vcSetQuality · vcGoFullscreen)', false, '설정 블록을 못 찾음');
  check('영상 화질 기본값 = 저', false, '코드 없음');
  check('전체화면 기본 켜짐', false, '코드 없음');
  console.log('\n' + '═'.repeat(64));
  console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
  failures.forEach(f => console.log('   - ' + f));
  console.log('═'.repeat(64));
  process.exit(1);
}

/* ══ 1. 영상 화질 기본값 = 저 ══ */
console.log('\n▶ 영상 화질 기본값');
{
  const sb = load({});
  check('아무것도 안 골랐으면 저화질', sb.vcGetQuality() === 'low', sb.vcGetQuality());
  const low = sb.vcQualityCaps();
  check('저화질 = 해상도 절반(360p급)', low.scale === 2, 'scale=' + low.scale);
  check('저화질 = 15fps (10fps 는 뚝뚝 끊겨 보임)', low.fps === 15, 'fps=' + low.fps);
  check('저화질 = 400kbps 이하', low.br <= 400000, Math.round(low.br/1000) + 'kbps');

  const sbAuto = load({ mangoi_vc_quality: 'auto' });
  check('자동을 고르면 자동', sbAuto.vcGetQuality() === 'auto');
  const auto = sbAuto.vcQualityCaps();
  check('자동은 해상도 그대로', auto.scale === 1, 'scale=' + auto.scale);
  check('저화질이 자동보다 실제로 가볍다', low.br < auto.br,
        Math.round(low.br/1000) + 'kbps < ' + Math.round(auto.br/1000) + 'kbps');

  const sbHigh = load({ mangoi_vc_quality: 'high' });
  check('고화질도 해상도 그대로', sbHigh.vcQualityCaps().scale === 1);

  const sbBad = load({ mangoi_vc_quality: 'garbage' });
  check('이상한 값이 저장돼 있어도 저화질로', sbBad.vcGetQuality() === 'low');
}

/* ══ 2. 화질 버튼이 실제로 동작하는가 (예전엔 함수 자체가 없었다) ══ */
console.log('\n▶ 화질 버튼 동작');
{
  const sb = load({});
  check('vcSetQuality 가 존재한다', typeof sb.vcSetQuality === 'function');
  sb.vcPeerConnections['a'] = { id: 'a', __qStep: 0 };
  sb.vcPeerConnections['b'] = { id: 'b', __qStep: 0 };
  sb.vcSetQuality('low');
  check('저화질 선택이 저장됨', sb.store.mangoi_vc_quality === 'low', sb.store.mangoi_vc_quality);
  check('연결된 상대 모두에게 즉시 적용', sb.log.applied.length === 2, JSON.stringify(sb.log.applied));
  check('상한만 바꾸고 적응 단계는 건드리지 않음', sb.vcPeerConnections['a'].__qStep === 0,
        '단계=' + sb.vcPeerConnections['a'].__qStep);

  sb.log.applied.length = 0;
  sb.vcSetQuality('high');
  check('고화질로 바꾸면 저장됨', sb.store.mangoi_vc_quality === 'high');
  check('바꾸는 즉시 다시 적용됨', sb.log.applied.length === 2, JSON.stringify(sb.log.applied));
}

/* ══ 3. 전체화면 기본 켜짐 ══ */
console.log('\n▶ 전체화면 기본값');
{
  const sb = load({});
  check('설정한 적 없으면 전체화면 켜짐', sb.vcWantFullscreen() === true);
  sb.vcGoFullscreen();
  check('수업 들어가면 전체화면 요청', sb.log.fsRequests === 1, '요청=' + sb.log.fsRequests);

  const off = load({ mangoi_vc_fullscreen: '0' });
  check('사용자가 껐으면 끈 상태로 기억', off.vcWantFullscreen() === false);
  off.vcGoFullscreen();
  check('껐으면 전체화면을 요청하지 않음', off.log.fsRequests === 0, '요청=' + off.log.fsRequests);

  const on = load({});
  on.vcSetFullscreenPref(false);
  check('끄기 선택이 저장됨', on.store.mangoi_vc_fullscreen === '0', on.store.mangoi_vc_fullscreen);
  on.vcSetFullscreenPref(true);
  check('다시 켜기도 저장됨', on.store.mangoi_vc_fullscreen === '1');
}

/* ══ 4. 브라우저가 막았을 때 — 다음 터치에서 한 번 더 ══ */
console.log('\n▶ 브라우저가 전체화면을 막은 경우');
{
  const sb = load({}, 'reject');
  sb.vcGoFullscreen();


  await new Promise(r => setImmediate(r));
  check('막히면 다음 터치를 기다린다', sb.log.pointerHandlers.length === 1,
        '핸들러=' + sb.log.pointerHandlers.length);
  const before = sb.log.fsRequests;
  if (sb.log.pointerHandlers[0]) sb.log.pointerHandlers[0]();
  check('터치하면 다시 시도한다', sb.log.fsRequests === before + 1,
        `${before} → ${sb.log.fsRequests}`);

  const ios = load({}, 'unsupported');
  ios.vcGoFullscreen();
  check('iOS 처럼 미지원이면 조용히 넘어감(오류 없음)', ios.log.fsRequests === 0 && ios.log.pointerHandlers.length === 0);
}

/* ══ 5. 화면 배선 ══ */
console.log('\n▶ 화면 배선');
{
  check('수업 입장에서 전체화면을 부른다',
        /document\.body\.classList\.add\('vc-in-call'\);[\s\S]{0,400}window\.vcGoFullscreen && window\.vcGoFullscreen\(\)/.test(html));
  check('적응 로직이 설정 상한을 기준값으로 쓴다',
        /if \(window\.vcQualityCaps\) return window\.vcQualityCaps\(\)/.test(html));
  check('해상도 축소 = 설정 기준 × 적응 단계',
        /scaleResolutionDownBy = \(caps\.scale \|\| 1\) \* \(SCALE\[step\] \|\| 1\)/.test(html));
  check('새로 연결된 상대에게도 상한 적용', /if \(!pc\.__qInit\)/.test(html));

  /* 🍕 학생게임 첫 화면 = 문법 피자 (사장님 지시 2026-07-23) */
  check('학생게임 기본 모드 = 문법 피자', /_gameState = \{ mode: 'pizza'/.test(html));
  check('⋮ 메뉴 라벨도 문법 피자', /id="game-menu-cur">🍕/.test(html));
  check('문법 피자가 선택 표시(초록)', /game-mode-pizza"[\s\S]{0,140}background:#10b981/.test(html));
  check('문장 벽돌은 선택 해제', /game-mode-brick"[\s\S]{0,140}background:transparent/.test(html));

  /* 🔄 영상 재연결 버튼 (사장님 지시 2026-07-23) — 새로고침이 아니라 '연결만' 다시 맺어야 한다 */
  check('상단에 영상 재연결 버튼이 있다', /id="vc-btn-resync"[\s\S]{0,200}vcManualReconnect\(\)/.test(html));
  check('재연결 함수 존재', /async function vcManualReconnect/.test(html));
  check('내 카메라·마이크를 먼저 되살린다',
        /vcManualReconnect[\s\S]{0,600}vcHealLocalVideo\(\)[\s\S]{0,200}vcHealLocalMic\(\)/.test(html));
  check('붙어 있는 상대 전원에게 재연결', /ids\.forEach\(function \(id\) \{ try \{ vcReconnectPeer\(id\)/.test(html));
  check('수동 요청은 8초 쿨다운을 면제', /delete __vcReconnectAt\[id\]/.test(html));
  check('새로고침(location.reload)이 아니다',
        !/vcManualReconnect[\s\S]{0,700}location\.reload/.test(html), '새로고침이면 수업에서 나가진다');
  check('버튼 설명이 한/영 둘 다', /data-ko-title="영상 재연결[\s\S]{0,200}data-en-title="Reconnect video/.test(html));

  /* 🕶 얼굴 꾸미기 — 뿔테 안경·보안경 삭제 */
  const deco = readFileSync(join(PUB, 'js', 'idx-x6.js'), 'utf8');
  check('뿔테 안경 삭제됨', !/rgblack|뿔테 안경/.test(deco));
  check('보안경 삭제됨', !/rgoggle|보안경/.test(deco));
  check('항공 선글라스는 남아 있음', /raviator/.test(deco));
  check('독이 vcSetQuality 를 부른다', /call\('vcSetQuality'/.test(dock));
  check('독이 전체화면 선택을 기억한다', /setFullPref\(false\)/.test(dock) && /setFullPref\(true\)/.test(dock));
  check('설정 팝업이 저장된 화질을 보여준다', /setSeg\('#sg-quality', 'data-q', savedQuality\(\)\)/.test(dock));
  check("'자동'이 하드코딩으로 켜져 있지 않다",
        !/data-q="auto" class="on"/.test(dock), '자동이 항상 선택된 것처럼 보임');
  check('독 캐시버스터 인상(vc-dock ?v=10)', /vc-dock\.js\?v=10/.test(html));
}

console.log('\n' + '═'.repeat(64));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
