/* vc_face_fit_contain_harness.mjs — PC 얼굴 칸: 꽉 채우기(확대) 대 전체 보이기 (2026-09-07)
   ────────────────────────────────────────────────────────────────
   [지시] 사장님 2026-09-07 「학생이 보는 교사 얼굴이 너무 크다 · 절반 크기로」
          + 「셋 중 가장 선명하게, 최대한 가볍게」.

   [무엇을 지키나] js/idx-vc-mobilefix.js ⑧ 은 «가로 웹캠이면 상대 타일을 꽉 채운다»(cover)
     인데, PC 학생 화면의 얼굴 칸은 세로로 길어서 그 cover 가 **확대**가 된다 —
     실측(1905x1051 · 교사 1280x720) 「얼굴 크게」 칸 850x938 에 그림 1669x938(원본의 1.30배),
     폭 51% 만 보였다. 그래서 얼굴이 가득 차고 좌우가 잘리며 흐려졌다.
     ⑧-2 가 «넉넉히 큰 세로 칸» 에서만 그 강제를 걸지 않는다.

   ⚠️ 이 셋은 서로 뒤집기 쉬운 짝이라 **셋을 함께** 잰다 —
      ① 큰 세로 칸은 확대하지 않는다(새 지시)
      ② 좁은 칸(사이드컬럼·PIP)·폰은 여전히 꽉 채운다(2026-07-14·08-26 결정)
      ③ 화면 공유는 언제나 전체 보이기(잘리면 공유 화면의 좌우가 사라진다)
      ①만 재면 «전부 전체 보이기» 로 되돌려도 통과한다.

   ⚠️ 문자열로 «그 줄이 있는가» 만 보면 못 잡는다 — 함수도 값도 다 «있고» 틀릴 수 있는 것은
      «어떤 칸에서 무슨 답이 나오는가» 뿐이다. 그래서 판정과 래퍼를 소스에서 오려 내
      **가짜 화면으로 실제로 돌린다.**                                                    */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const MOBILEFIX = join(PUB, 'js', 'idx-vc-mobilefix.js');
const INDEX = join(PUB, 'index.html');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

/* 중괄호 짝으로 자른다 — «앞 N자» 로 자르면 옆 함수가 딸려 온다(CLAUDE.md). */
function sliceBalanced(src, startIdx) {
  let depth = 0, started = false;
  for (let i = startIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(startIdx, i + 1); }
  }
  return '';
}
/* «function 이름(...) { ... }» 을 통째로 오려 낸다. */
function cutFunction(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const brace = src.indexOf('{', i);
  const body = sliceBalanced(src, brace);
  return body ? src.slice(i, brace) + body : '';
}

const src = readFileSync(MOBILEFIX, 'utf8');
const html = readFileSync(INDEX, 'utf8');

console.log('\n① 판정 «큰 세로 칸인가» — 소스에서 오려 내 실제로 돌린다');

const modesM = src.match(/var\s+MG_WIDE_FACE_MODES\s*=\s*(\[[^\]]*\]);/);
const bigSrc = (modesM ? 'var MG_WIDE_FACE_MODES = ' + modesM[1] + ';\n' : '')
             + cutFunction(src, 'mgBigPortraitBox');
ok('mgBigPortraitBox 를 소스에서 찾았다', bigSrc.includes('function mgBigPortraitBox'),
   '함수 이름이 바뀌면 이 검사가 통째로 헛돈다');
ok('«넓게 보는 모드» 목록도 소스에서 읽었다', !!modesM,
   '손으로 적어 두면 소스가 바뀌어도 내가 적은 값만 보게 된다');

/* 가짜 화면 — matchMedia 와 #vc-main-row 의 모드만 있으면 된다. */
function makeBig(wide, mode, count) {
  const mm = (q) => ({ matches: /min-width:\s*1024px/.test(q) ? !!wide : false });
  const cls = String(mode === undefined ? 'video-threequarter' : mode).split(/\s+/).filter(Boolean);
  const n = count === undefined ? '2' : count;   // 1:1 이 기본
  const doc = { getElementById: (id) => {
    if (id === 'vc-main-row') return mode === null ? null : { classList: { contains: (c) => cls.includes(c) } };
    if (id === 'vc-video-grid') return n === null ? null : { getAttribute: () => n };
    return null;
  } };
  return new Function('matchMedia', 'document', bigSrc + '\nreturn mgBigPortraitBox;')(mm, doc);
}
const box = (w, h, id) => ({ id: id || 'vc-video-teacher', clientWidth: w, clientHeight: h });

if (bigSrc.includes('function mgBigPortraitBox')) {
  const pc = makeBig(true), phone = makeBig(false);

  /* ① 새 지시 — 사장님 화면(1905x1051 · 「얼굴 크게」)이 이 모양이었다.
     실측: 칸 850x938 · 전체 보이기 850x478 = 고치기 전(1669x938)의 0.51배 */
  ok('「얼굴 크게」 큰 세로 칸(850x938) → 확대하지 않는다', pc(box(850, 938)) === true);
  ok('「모두 보기」 세로 칸 → 확대하지 않는다', makeBig(true, 'video-full')(box(900, 985)) === true);

  /* ② 되돌아가면 안 되는 것 — 2026-08-26 「얼굴이 칸의 28% 로 쪼그라든다」 신고 자리.
     ⚠️ 「기본」(video-half)은 index.html 의 **학생 기본값**이고, 거기서 전체 보이기를 하면
        실측 459x258 = 칸의 27.5% 로 바로 그 신고 수치가 된다. 그래서 손대지 않는다.
     ⚠️ 폭으로는 못 가른다: 「교재 크게」는 최대 300px, 「기본」은 최소 260px 로 겹친다. */
  ok('「기본」(학생 기본값)은 그대로 꽉 채운다 — 전체 보이기면 27.5% 가 된다',
     makeBig(true, 'video-half')(box(459, 938)) === false);
  const quarter = makeBig(true, 'video-quarter');
  ok('「교재 크게」 사이드컬럼(132x180) → 그대로 꽉 채운다', quarter(box(132, 180)) === false,
     '좁은 칸에서 전체 보이기를 하면 얼굴이 18% 가 된다');
  ok('「교재 크게」 가 넓어져 300px 이 돼도 그대로 꽉 채운다', quarter(box(300, 985)) === false,
     '폭으로 갈랐다면 여기서 「기본」과 구별되지 않는다');
  ok('떠 있는 작은 창(video-pip) → 그대로 꽉 채운다',
     makeBig(true, 'video-pip')(box(280, 400)) === false);
  ok('모르는 모드는 옛 동작 그대로 (긍정 목록이라 저절로 그렇다)',
     makeBig(true, 'video-free')(box(680, 985)) === false);
  ok('PC 오른아래 PIP(210x157 · 가로로 넓다) → 그대로 꽉 채운다', pc(box(210, 157)) === false);
  ok('가로로 넓은 칸(295x139) → 그대로 꽉 채운다', pc(box(295, 139)) === false);
  ok('내 타일(#vc-local-box)은 건드리지 않는다', pc(box(680, 985, 'vc-local-box')) === false);
  ok('폰은 이 규칙에 닿지 않는다 (2026-07-14 「꽉 차게」 유지)', phone(box(345, 687)) === false);
  ok('크기를 아직 모르면(0) 옛 동작 그대로', pc(box(0, 0)) === false);
  ok('모드를 모르면(#vc-main-row 없음) 옛 동작 그대로',
     makeBig(true, null)(box(680, 985)) === false, '모르면 바꾸지 않는 쪽으로 실패한다');

  /* ③ 그룹 수업은 손대지 않는다 — 함정 대조가 잡은 «반대 방향» 부작용.
     [잰 것 — 1905x1051] 4인 「얼굴 크게」는 스포트라이트로 교사 타일이 가로(834x553)라
     그대로인데 **학생 타일만**(273x361) 세로여서 42.7% 로 줄었다. 3인 「모두 보기」는 전원 37.9%.
     지시는 「학생이 보는 교사 얼굴」이라 그 조합은 고치려던 것과 방향이 반대다. */
  ok('3인 수업은 손대지 않는다', makeBig(true, 'video-threequarter', '3')(box(273, 361)) === false);
  ok('4인 수업은 손대지 않는다', makeBig(true, 'video-threequarter', '4')(box(273, 361)) === false);
  ok('3인 「모두 보기」도 손대지 않는다 (전원 37.9% 가 되던 조합)',
     makeBig(true, 'video-full', '3')(box(620, 922)) === false);
  ok('인원을 모르면(#vc-video-grid 없음) 옛 동작 그대로',
     makeBig(true, 'video-threequarter', null)(box(850, 938)) === false);
  ok('1:1 은 그대로 바뀐다 — 짝이 없으면 «전부 안 바꾸기» 도 통과한다',
     makeBig(true, 'video-threequarter', '2')(box(850, 938)) === true);
}

console.log('\n② 그 판정이 실제로 «꽉 채우기» 를 막는가 — 래퍼를 오려 내 돌린다');

const wrapIdx = src.indexOf('window.vcSmartFitVideo = function (v) {');
const wrapSrc = wrapIdx >= 0 ? sliceBalanced(src, src.indexOf('{', wrapIdx)) : '';
ok('⑧ 래퍼를 소스에서 찾았다', !!wrapSrc);

if (wrapSrc && bigSrc) {
  /* 가짜 video — closest 로 box 를 돌려주고 style.setProperty 를 기록한다.
     _smartFit(정본)이 불리면 «전체 보이기 판정에 맡겼다» 는 뜻이다. */
  function run(bw, bh, vw, vh, opts) {
    opts = opts || {};
    const rec = { fit: null, fellBack: false };
    const b = {
      id: opts.local ? 'vc-local-box' : 'vc-video-teacher',
      clientWidth: bw, clientHeight: bh,
      querySelector: (s) => (opts.share && s === '.vc-ss-badge') ? {} : null,
    };
    const v = {
      videoWidth: vw, videoHeight: vh,
      closest: () => b,
      style: { setProperty: (k, val) => { if (k === 'object-fit') rec.fit = val; } },
    };
    const mm = (q) => ({ matches: /min-width:\s*1024px/.test(q) ? !opts.phone : false });
    const cls = String(opts.mode || 'video-threequarter').split(/\s+/);
    const doc = { getElementById: (id) => {
      if (id === 'vc-main-row') return { classList: { contains: (c) => cls.includes(c) } };
      if (id === 'vc-video-grid') return { getAttribute: () => String(opts.count || 2) };
      return null;
    } };
    const _smartFit = { apply: () => { rec.fellBack = true; return undefined; } };
    const isScreenShareTile = (box) => !!(box && box.querySelector('.vc-ss-badge'));
    const fn = new Function('matchMedia', 'document', 'isScreenShareTile', '_smartFit',
      bigSrc + '\nreturn function (v) ' + wrapSrc + ';')(mm, doc, isScreenShareTile, _smartFit);
    fn(v);
    return rec;
  }

  const r1 = run(850, 938, 1280, 720);
  ok('「얼굴 크게」 — 꽉 채우지 않고 정본(전체 보이기)에 맡긴다',
     r1.fit !== 'cover' && r1.fellBack === true, `fit=${r1.fit} fallback=${r1.fellBack}`);
  const r1b = run(459, 938, 1280, 720, { mode: 'video-half' });
  ok('「기본」(학생 기본값) — 여전히 꽉 채운다', r1b.fit === 'cover', `fit=${r1b.fit}`);

  const r2 = run(132, 180, 1280, 720, { mode: 'video-quarter' });
  ok('「교재 크게」 사이드컬럼 — 여전히 꽉 채운다', r2.fit === 'cover', `fit=${r2.fit}`);
  const r3 = run(210, 157, 1280, 720);
  ok('PC PIP — 여전히 꽉 채운다', r3.fit === 'cover', `fit=${r3.fit}`);
  const r4 = run(345, 687, 1280, 720, { phone: true });
  ok('폰 — 여전히 꽉 채운다', r4.fit === 'cover', `fit=${r4.fit}`);
  const r4b = run(273, 361, 1280, 720, { count: 4 });
  ok('4인 그룹 수업의 학생 타일 — 여전히 꽉 채운다 (반대 방향 부작용 방지)',
     r4b.fit === 'cover', `fit=${r4b.fit}`);

  /* ③ 건드리면 안 되는 것들 */
  const r5 = run(680, 985, 1920, 1080, { share: true });
  ok('화면 공유는 큰 칸에서도 전체 보이기', r5.fit === 'contain', `fit=${r5.fit}`);
  const r6 = run(132, 180, 1920, 1080, { share: true });
  ok('화면 공유는 좁은 칸에서도 전체 보이기', r6.fit === 'contain', `fit=${r6.fit}`);
  const r7 = run(680, 985, 1280, 720, { local: true });
  ok('내 타일은 정본 그대로 (가상배경 켜면 턱·목이 잘린다 — 2026-07-13)',
     r7.fit !== 'cover' && r7.fellBack === true);
  const r8 = run(345, 687, 720, 1280);
  ok('교사가 폰 세로로 들어오면(세로 영상) 정본 그대로', r8.fit !== 'cover' && r8.fellBack === true);
}

console.log('\n③ 모드 이름이 화면과 같은 말을 하는가');

/* ⚠️ 목록을 하니스에 손으로 적어 두면 «내가 적은 값» 만 보게 된다(CLAUDE.md).
      소스에서 읽은 이름이 화면(index.html)에 실재하는 클래스인지 대조한다 —
      크기바가 그 이름을 바꾸면 판정이 «에러 없이» 헛돌기 때문이다. */
if (modesM) {
  const names = [...modesM[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  ok('목록이 비어 있지 않다', names.length > 0);
  for (const n of names) {
    ok(`«${n}» 는 화면에 실재하는 모드다`, html.includes(n),
       'index.html 에 없는 이름이면 그 줄은 아무것도 안 막는다');
  }
  ok('「얼굴 크게」는 목록에 있다 (사장님이 크다고 한 그 모드)',
     names.includes('video-threequarter'));
  ok('「기본」·「교재 크게」는 목록에 없다 — 학생 기본값을 건드리면 27.5% 가 된다',
     !names.includes('video-half') && !names.includes('video-quarter'));
  /* ⛔ video-solo 는 이름과 달리 «얼굴을 감추는» 모드다 — vcScreenSet 의
     「얼굴 화면 숨기기」·「칠판만」·「교재만」이 재활용한다. */
  ok('«video-solo» 는 목록에 없다 — 넓게 보는 모드가 아니라 얼굴을 감추는 모드다',
     !names.includes('video-solo'));
}

console.log(`\n${fail ? '❌' : '✅'} vc_face_fit_contain: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
