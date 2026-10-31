/* screen_share_fps_harness.mjs — 화면 공유 «초당 장수» 상한 (2026-09-06)
   ────────────────────────────────────────────────────────────────
   지키는 것 두 가지.

   ① 래퍼가 «헛돌지» 않는가 — 상한은 js/idx-vc-mobilefix.js ⑭절이 defer 에서
      navigator.mediaDevices.getDisplayMedia 를 감싸 겁니다. 호출부(idx-main.js
      vcShareMyScreen)가 다른 방법으로 화면을 잡기 시작하면 그 래퍼는 **에러도
      없이 조용히 아무것도 안 합니다.** 그래서 «호출처가 여전히 그 이름인가» 를
      여기서 못 박습니다(CLAUDE.md 「blocking 파일을 못 고칠 때」의 약점).

   ② 카메라는 그대로인가 — 2026-09-06 사장님 결정은 «화면 공유 fps 만» 입니다.
      PC 카메라 24fps 는 유지합니다(회선이 나쁘면 적응 루프가 이미 내리므로
      기준값을 내리면 «좋은 회선만» 손해). 그 결정이 조용히 되돌아가지 않게 잽니다.

   ⚠️ 문자열로 «그 줄이 있는가» 만 보면 안 됩니다 — 값도 함수도 다 «있고»
      틀릴 수 있는 것은 «무슨 제약이 실제로 나가는가» 입니다. 그래서 ⑭절을
      소스에서 오려 내 **가짜 navigator 로 실제로 돌립니다.**                      */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const MOBILEFIX = join(PUB, 'js', 'idx-vc-mobilefix.js');
const IDXMAIN = join(PUB, 'js', 'idx-main.js');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

/* ── 주석 벗기기 — 부정 검사가 «자기 설명 주석» 을 잡는 것을 막는다.
   ⛔ 정규식 한 줄로 블록주석을 지우면 문자열 안의 짝 없는 별표에 뒷부분이
      통째로 날아간다(CLAUDE.md 실측 8만자 증발). 줄 단위로 상태를 추적한다. */
function stripComments(t) {
  const out = [];
  let inBlock = false;
  for (const line of t.split('\n')) {
    let s = '', i = 0;
    while (i < line.length) {
      if (inBlock) {
        const e = line.indexOf('*/', i);
        if (e < 0) { i = line.length; } else { inBlock = false; i = e + 2; }
      } else {
        const b = line.indexOf('/*', i), l = line.indexOf('//', i);
        if (b >= 0 && (l < 0 || b < l)) { s += line.slice(i, b); inBlock = true; i = b + 2; }
        else if (l >= 0) { s += line.slice(i, l); i = line.length; }
        else { s += line.slice(i); i = line.length; }
      }
    }
    out.push(s);
  }
  return out.join('\n');
}

/* 중괄호 짝으로 블록을 자른다 — «앞 N자» 로 자르면 옆 함수가 딸려 온다. */
function sliceBalanced(src, startIdx) {
  let depth = 0, started = false;
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(startIdx, i + 1); }
  }
  return null;
}

const mobilefixRaw = readFileSync(MOBILEFIX, 'utf8');
const idxMainRaw = readFileSync(IDXMAIN, 'utf8');

console.log('\n① 래퍼가 감싸는 이름 = 호출부가 쓰는 이름인가');
{
  const code = stripComments(idxMainRaw);
  ok('idx-main 이 navigator.mediaDevices.getDisplayMedia 로 화면을 잡는다',
     /navigator\.mediaDevices\.getDisplayMedia\s*\(/.test(code),
     '이름이 바뀌면 ⑭절 래퍼가 에러 없이 헛돕니다');

  // 저장소 안 «실제 호출» 이 그 한 곳뿐인지 — 전역을 감싸도 안전하다는 근거.
  const callSites = [...code.matchAll(/getDisplayMedia\s*\(/g)].length;
  ok('실제 호출처는 idx-main 한 곳뿐이다', callSites === 1,
     `idx-main 안 호출 ${callSites}곳 — 늘었으면 전역 래핑의 영향 범위를 다시 보세요`);

  ok('⑭절이 mobilefix(defer)에 있다 — blocking 예산을 안 먹는다',
     /screenShareFpsCap/.test(mobilefixRaw) && !/screenShareFpsCap/.test(idxMainRaw));
}

console.log('\n② ⑭절을 실제로 돌려서 — 무슨 제약이 나가는가');
// 앵커는 «앞 괄호를 뺀» 함수 선언 — sliceBalanced 가 함수 본문까지만 돌려주므로
// 여기서 다시 (…)(); 로 감싼다.
const anchor = mobilefixRaw.indexOf('function screenShareFpsCap()');
if (anchor < 0) {
  fail++; console.log('  ❌ ⑭절(screenShareFpsCap)을 찾지 못했습니다');
} else {
  const body = sliceBalanced(mobilefixRaw, anchor);
  const sectionSrc = '(' + body + ')();';

  // 가짜 navigator — 코드 안의 `navigator` 를 인자로 주입한다(node 전역과 충돌 회피).
  const runSection = (nav) => new Function('navigator', 'console', sectionSrc)(nav, { log(){}, warn(){} });

  function makeTrack(applied, applyFails) {
    return {
      applyConstraints(c) {
        applied.push(c);
        return applyFails ? Promise.reject(new Error('nope')) : Promise.resolve();
      },
    };
  }
  function makeNav({ impl, noApi = false, applyFails = false } = {}) {
    const calls = [], applied = [];
    const md = {};
    if (!noApi) {
      md.getDisplayMedia = (c) => {
        calls.push(c);
        return (impl || (() => Promise.resolve({ getVideoTracks: () => [makeTrack(applied, applyFails)] })))(c, calls.length);
      };
    }
    return { nav: { mediaDevices: md }, calls, applied, md };
  }

  // — B-1·2·3 : 기본 호출
  {
    const t = makeNav();
    runSection(t.nav);
    await t.md.getDisplayMedia({ video: true, audio: true });
    const v = t.calls[0] && t.calls[0].video;
    ok('video:true → frameRate 상한 15 가 붙는다',
       !!v && typeof v === 'object' && v.frameRate && v.frameRate.max === 15,
       JSON.stringify(t.calls[0]));
    ok('audio 는 그대로 통과한다', t.calls[0] && t.calls[0].audio === true);
    // ⛔ 사장님 결정 — 해상도는 건드리지 않는다(화면 공유는 «글자 선명함» 이 먼저).
    ok('해상도(width·height)는 건드리지 않는다',
       !!v && v.width === undefined && v.height === undefined,
       JSON.stringify(v));
  }

  // — B-4 : 이미 정한 fps 는 존중
  {
    const t = makeNav();
    runSection(t.nav);
    await t.md.getDisplayMedia({ video: { frameRate: { max: 5 } }, audio: true });
    ok('부르는 쪽이 이미 정한 fps 는 덮어쓰지 않는다',
       t.calls[0].video.frameRate.max === 5, JSON.stringify(t.calls[0].video));
  }

  // — B-5 : 영상 없는 공유
  {
    const t = makeNav();
    runSection(t.nav);
    await t.md.getDisplayMedia({ video: false, audio: true });
    ok('video:false 는 그대로 통과한다', t.calls[0].video === false);
  }

  // — B-6 : 제약을 거부하는 브라우저 → «고치기 전» 으로 되돌린다
  {
    const t = makeNav({
      impl: (c, n) => n === 1
        ? Promise.reject(Object.assign(new Error('bad'), { name: 'OverconstrainedError' }))
        : Promise.resolve({ getVideoTracks: () => [] }),
    });
    runSection(t.nav);
    let threw = false;
    try { await t.md.getDisplayMedia({ video: true, audio: true }); } catch { threw = true; }
    ok('제약이 거부되면 원래 인자로 다시 부른다', t.calls.length === 2 && !threw,
       `호출 ${t.calls.length}회 · threw=${threw}`);
    ok('그 재시도는 «상한 없는» 원래 인자다', t.calls[1] && t.calls[1].video === true,
       JSON.stringify(t.calls[1]));
  }

  // — B-7·8 : 사용자가 «취소» 를 누른 것은 재시도하면 안 된다(공유 선택 창이 두 번 뜬다)
  for (const name of ['NotAllowedError', 'AbortError', 'NotFoundError']) {
    const t = makeNav({ impl: () => Promise.reject(Object.assign(new Error('x'), { name })) });
    runSection(t.nav);
    let threw = false;
    try { await t.md.getDisplayMedia({ video: true, audio: true }); } catch { threw = true; }
    ok(`${name}(사용자 취소)는 재시도하지 않는다 — 창이 두 번 뜨면 안 된다`,
       t.calls.length === 1 && threw, `호출 ${t.calls.length}회 · threw=${threw}`);
  }

  // — B-9·10 : 트랙에 한 번 더 걸되, 실패해도 공유는 산다
  {
    const t = makeNav();
    runSection(t.nav);
    await t.md.getDisplayMedia({ video: true, audio: true });
    await new Promise(r => setImmediate(r));
    ok('트랙에도 fps 상한을 한 번 더 건다',
       t.applied.length === 1 && t.applied[0].frameRate.max === 15, JSON.stringify(t.applied));

    const t2 = makeNav({ applyFails: true });
    runSection(t2.nav);
    let s = null, threw = false;
    try { s = await t2.md.getDisplayMedia({ video: true, audio: true }); } catch { threw = true; }
    await new Promise(r => setImmediate(r));
    ok('applyConstraints 가 실패해도 스트림은 그대로 돌려준다', !threw && !!s);
  }

  // — B-11·12 : 두 번 실행·API 없는 브라우저
  {
    const t = makeNav();
    runSection(t.nav);
    const first = t.md.getDisplayMedia;
    runSection(t.nav);
    ok('두 번 실행해도 이중으로 감싸지 않는다', t.md.getDisplayMedia === first);

    const t2 = makeNav({ noApi: true });
    let threw = false;
    try { runSection(t2.nav); } catch { threw = true; }
    ok('getDisplayMedia 가 없는 브라우저에서 던지지 않는다', !threw);
  }
}

console.log('\n③ 카메라는 그대로인가 (2026-09-06 사장님 결정)');
{
  const code = stripComments(idxMainRaw);
  const pcFps = [...code.matchAll(/frameRate:\s*\{\s*ideal:\s*24\s*,\s*max:\s*30\s*\}/g)].length;
  const mobFps = [...code.matchAll(/frameRate:\s*\{\s*ideal:\s*15\s*,\s*max:\s*20\s*\}/g)].length;
  ok('PC 카메라는 24fps 그대로다', pcFps >= 1,
     '내리려면 사람이 정할 일입니다 — 적응 루프가 이미 나쁜 회선을 내립니다');
  ok('모바일 카메라는 15fps 그대로다', mobFps >= 1);
  ok('카메라는 «부드러움 우선»(maintain-framerate) 그대로다',
     /degradationPreference\s*=\s*'maintain-framerate'/.test(code));
}

console.log(`\n${fail === 0 ? '✅' : '🚨'} 화면 공유 fps 상한 — PASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
