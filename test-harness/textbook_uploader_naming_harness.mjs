// 📚 교재 업로더 — «유닛 폴더가 교재 이름이 되는» 사고 감시 하니스 (2026-08-27)
//
//   왜 필요한가 —
//     「업로더가 안 된다」 제보로 시작해 브라우저로 실제로 돌려 보니, 업로더는 «돌긴 도는데»
//     교재 이름을 틀리게 붙이고 있었다. `BTS 2/001/Slide1.JPG` 를 올리면 교재 이름이
//     **「001」** 이 됐다 — 2026-08-14 주석이 「BTS 2 001」 을 약속하고 있었는데도.
//       [뿌리] 유닛 번호를 «교재 이름에 붙이는» 규칙이 `textbook.indexOf(유닛) < 0` 일 때만
//              도는데, 교재 이름 자체가 이미 「001」 이라 그 조건이 늘 거짓이었다.
//       [반경] 공용 자료실(서버)의 묶음 이름은 파일명 앞 [대괄호] 하나뿐이다
//              (`js/idx-x3.js` `_serverFilesToBooks`). 출판사는 안 실리므로
//              **BTS 2 의 001 과 BTS 3 의 001 이 같은 「001」 묶음으로 합쳐진다.**
//              내 PC(IndexedDB)에서는 출판사로 갈라져 «멀쩡해 보여» 발견이 늦는다.
//
//   이 하니스가 못 박는 것 —
//     ① 🔴 **분류기를 HTML 에서 오려 내 실제로 돌린다** — 규칙을 여기에 베껴 쓰지 않는다.
//        문자열 검사는 「그 규칙이 있는가」만 볼 뿐 「무슨 이름이 나오는가」는 못 본다
//        (CLAUDE.md 2장 「헬퍼에 행을 넘겼는데 아무 일도 안 일어남」과 같은 사정).
//     ② 유닛뿐인 2단계 폴더(001 · 001. Title · A)는 **상위 폴더 이름이 앞에 붙는다.**
//     ③ 그전에 «맞았던» 구조는 하나도 바뀌지 않는다(다락원 …/제N과 · Phonics A · BTS 1 …).
//     ④ 자동 저장이 사람의 검토를 앞지르지 않는다 — 대기 8초 · «만지면 멈춤» ·
//        이미 저장된 뒤에는 다시 누르지 않는다.
//
//   ⚠️ 이 하니스는 «이름» 만 본다. 「눌러서 진짜 올라가는가」는 브라우저로 봐야 한다:
//        node test-harness/manual/textbook-uploader-browser.mjs
//
//   실행: node test-harness/textbook_uploader_naming_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dir);
const read = (p) => { try { return readFileSync(join(root, p), 'utf8'); } catch { return ''; } };

let pass = 0, fail = 0; const FAILS = [];
const check = (name, ok) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; FAILS.push(name); console.log('  ❌ ' + name); }
};
const eq = (name, got, want) => check(`${name} → «${got}»`, got === want);

console.log('📚 교재 업로더 이름 하니스 · ' + new Date().toISOString());

/* ✂️ (2026-08-27) 검사 범위는 «길이» 로 자르지 않는다 — 그 사이에 줄이 들어가면
   보장은 그대로인데 검사만 깨진다(CLAUDE.md 2장 「검사 범위를 «길이» 로 자르지 마세요」).
   여는 중괄호부터 짝이 맞는 닫는 중괄호까지 잘라 «그 블록 안» 을 본다. */
const blockAt = (src, anchor) => {
  const i = src.indexOf(anchor);
  if (i < 0) return '';
  let j = src.indexOf('{', i);
  if (j < 0) return '';
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return src.slice(i);
};

const UP = read('cloudflare-deploy/public/textbook-uploader.html');
check('교재 업로더 화면이 있다', UP.length > 0);

/* ═══════════════════════════════════════════════════════════════════════
   [A] 분류기를 오려 내 «실제로» 돌린다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[A] 🔴 분류기(classifyFile)를 소스에서 오려 내 실행');
const rxSrc = (UP.match(/const RX = \{[\s\S]*?\n\};/) || [])[0] || '';
const fnSrc = (UP.match(/function classifyFile\(file\) \{[\s\S]*?\n\}\n/) || [])[0] || '';
check('RX · classifyFile 을 오려 냈다', !!rxSrc && !!fnSrc);

let run = null;
if (rxSrc && fnSrc) {
  run = new Function('path',
    rxSrc + '\n' + fnSrc +
    '\nfunction fileKind(){ return "image"; }' +
    '\nreturn classifyFile({ fullPath: path, name: path.split("/").pop(), size: 1 });');
  check('분류기가 실행된다', typeof run('X/Y/z.jpg').textbook === 'string');
}

if (run) {
  /* ═════════════════════════════════════════════════════════════════════
     [B] 유닛뿐인 2단계 폴더 — 상위 폴더 이름이 «앞에» 붙어야 한다
     ═════════════════════════════════════════════════════════════════════ */
  console.log('\n[B] 🔢 유닛뿐인 2단계 폴더 — 책 이름이 살아남는가');
  /* ⛔ 이 절이 FAIL 하면 공용 자료실에 「001」·「002」 라는 이름 없는 묶음이 생기고,
        다른 책의 같은 번호와 **한 묶음으로 합쳐진다**(대괄호 이름 하나로 묶으므로). */
  eq('BTS 2/001/…        (숫자만)',      run('BTS 2/001/Slide1.JPG').textbook, 'BTS 2 001');
  eq('BTS 2/002/…        (숫자만)',      run('BTS 2/002/Slide7.JPG').textbook, 'BTS 2 002');
  eq('BTS 2/034/…        (세 자리)',     run('BTS 2/034/Slide7.JPG').textbook, 'BTS 2 034');
  eq('BTS 3/001. Welcome (제목 붙은 유닛)', run('BTS 3/001. Welcome/Slide1.JPG').textbook, 'BTS 3 001. Welcome');
  eq('Phonics/A/…        (글자만)',      run('Phonics/A/Slide1.JPG').textbook, 'Phonics A');
  check('숫자 폴더도 «과» 로 인식된다(레슨이 비지 않는다)',
    run('BTS 2/001/Slide1.JPG').lesson === '제1과');
  check('유닛 번호가 교재 이름에 «두 번» 안 붙는다',
    (run('BTS 2/001/Slide1.JPG').textbook.match(/001/g) || []).length === 1);
  /* ⚠️ 네 자리는 일부러 유닛으로 안 본다 — 2019 같은 연도 폴더를 유닛으로 읽지 않기 위해
        (2026-08-14 결정). 그래서 그 폴더는 «책 이름» 으로 남는다. */
  eq('BTS 2/2019/…       (네 자리 = 연도)', run('BTS 2/2019/Slide1.JPG').textbook, '2019');
  /* ⚠️ 글자는 «한 글자뿐일 때만» 유닛이다(2026-08-14 결정: 「A」 처럼 글자만 있는 폴더).
        「B. Advanced」 처럼 글자+제목까지 유닛으로 넓히면 멀쩡한 책 이름을 유닛으로 읽는다. */
  eq('BTS/B. Advanced/…   (글자+제목 = 책 이름)', run('BTS/B. Advanced/p1.JPG').textbook, 'B. Advanced');
  eq('Phonics/A-Z/…       (글자-글자 = 책 이름)', run('Phonics/A-Z/p1.JPG').textbook, 'A-Z');

  /* ═════════════════════════════════════════════════════════════════════
     [C] 그전에 «맞았던» 구조는 하나도 바뀌지 않는다
     ═════════════════════════════════════════════════════════════════════ */
  console.log('\n[C] ✅ 되던 것이 그대로인가 (되돌림 감시)');
  const ZH = '다락원 중국어 마스터 3';
  for (const n of [1, 7, 14]) {
    eq(`${ZH}/제${n}과/… — 교재명 그대로`, run(`${ZH}/제${n}과/p1.JPG`).textbook, ZH);
  }
  eq('Mangoi Phonics/Mangoi Phonics A/… — 폴더명이 권 이름',
    run('Mangoi Phonics/Mangoi Phonics A/Slide1.JPG').textbook, 'Mangoi Phonics A');
  eq('Mangoi Phonics/Mangoi Phonics Z/… — 폴더명이 권 이름',
    run('Mangoi Phonics/Mangoi Phonics Z/Slide1.JPG').textbook, 'Mangoi Phonics Z');
  eq('BTS 1/BTS 1 001 (Welcome to school)/… — 이미 책 이름이 붙어 있다',
    run('BTS 1/BTS 1 001 (Welcome to school)/Slide1.JPG').textbook, 'BTS 1 001 (Welcome to school)');
  eq('SIU Basic/Unit 1/… — 낱말 붙은 유닛은 1단계 이름',
    run('SIU Basic/Unit 1/p1.JPG').textbook, 'SIU Basic');
  eq('SIU Basic/Lesson 2/… — 낱말 붙은 유닛은 1단계 이름',
    run('SIU Basic/Lesson 2/p1.JPG').textbook, 'SIU Basic');
  eq('BTS 4/Slide1.JPG — 폴더 한 겹뿐',
    run('BTS 4/Slide1.JPG').textbook, 'BTS 4');
  eq('Phonics/Phonics 1/Lv1/… — 2단계가 책 이름',
    run('Phonics/Phonics 1/Lv1/Slide1.JPG').textbook, 'Phonics 1');
  /* ⚠️ 3단계(출판사/교재/유닛)는 그전부터 잘 붙었다 — 그 경로가 안 깨졌는지 함께 본다. */
  eq('다락원/마스터3/001/… — 3단계는 교재+유닛',
    run('다락원/마스터3/001/p1.JPG').textbook, '마스터3 001');

  /* ═════════════════════════════════════════════════════════════════════
     [D] 서버 묶음 이름 — 대괄호 하나로 묶이므로 책 이름이 그 안에 있어야 한다
     ═════════════════════════════════════════════════════════════════════ */
  console.log('\n[D] 📡 공용 자료실 묶음 이름이 책끼리 안 섞이는가');
  /* 업로더가 서버에 보내는 이름은 `[교재명] 레슨 / 파일명` 이고, 화면은 그 대괄호만 보고
     묶는다(`js/idx-x3.js`). 그래서 «다른 책의 같은 유닛» 이 다른 묶음이어야 한다. */
  const bracket = (p) => {
    const r = run(p);
    return '[' + r.textbook + '] ' + (r.lesson || '미분류 레슨') + ' / ' + r.fileName;
  };
  const b2 = bracket('BTS 2/001/Slide1.JPG');
  const b3 = bracket('BTS 3/001/Slide1.JPG');
  check('BTS 2 의 001 과 BTS 3 의 001 이 «다른» 묶음이다', b2.split(']')[0] !== b3.split(']')[0]);
  check('묶음 이름에 책 이름이 들어 있다 (BTS 2)', /^\[BTS 2 001\]/.test(b2));
  check('묶음 이름이 «번호만» 이 아니다', !/^\[\d+\]/.test(b2) && !/^\[\d+\]/.test(b3));
}

/* ═══════════════════════════════════════════════════════════════════════
   [E] 자동 저장이 사람의 검토를 앞지르지 않는다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[E] 🤖 자동 저장(ph241) — 사람이 이름을 고칠 틈이 있는가');
/* [왜] 그전에는 2초 뒤 무조건 `btn.click()` 이었다. 위 cr.scrollIntoView 가 smooth 라
      카드가 화면에 들어오는 데만 0.5초쯤 걸린다 — 교재 이름을 «읽을» 시간조차 없었고,
      분류가 틀렸을 때 고칠 방법이 사실상 없어 틀린 이름이 공용 자료실에 그대로 쌓였다.
   ⛔ 자동 저장 «자체» 를 없애는 것이 아니다(ph241 의 취지). 언제 누르는가만 본다. */
const secs = (UP.match(/var ph241Left\s*=\s*(\d+)/) || [])[1];
check('자동 저장 대기가 5초 이상이다 (실측 ' + secs + '초)', Number(secs) >= 5);
check('남은 초를 버튼에 보여 준다', /ph241Left\s*\+\s*'초 뒤 자동 저장/.test(UP));
check('분류 카드를 만지면 멈춘다 (focusin·input·change)',
  /\['focusin',\s*'input',\s*'change'\]/.test(UP) && /ph241Stop\('사람이 분류 결과를 고치는 중'\)/.test(UP));
check('리스너를 한 번만 묶는다 (렌더마다 쌓이지 않게)', /wrap\.__ph241Bound/.test(UP));
/* 🔁 사람이 먼저 버튼을 눌렀을 때 이 타이머가 뒤늦게 또 눌러 «✅ 저장 완료» 바로 뒤에
      «⚠️ 저장할 교재가 없습니다» 가 떴다(2026-08-27 실측). 성공 직후의 경고는
      «저장이 안 됐다» 로 읽힌다. */
check('이미 저장된 뒤에는 자동 트리거를 건너뛴다',
  /if \(!pendingGroups\.length \|\| btn\.disabled\)/.test(UP));
{
  const cancelBlk = blockAt(UP, "document.getElementById('btn-cancel').onclick");
  check('❌ 취소 핸들러를 오려 냈다', cancelBlk.length > 0);
  check('❌ 취소가 카운트다운 타이머까지 끈다',
    /_autoSaveCancelled = true/.test(cancelBlk) && /clearInterval\(window\._ph241Timer\)/.test(cancelBlk));
}
/* 🔴 (2026-08-27) `#btn-save` 는 `#cr-groups` 의 «형제» 라, 분류 카드를 만지지 않고 곧바로
   [저장] 을 누르면 focusin/input/change 가 안 걸려 타이머가 계속 돈다 → 「💾 저장 중… n/m」
   진행률을 매초 덮고, 저장이 끝난 뒤에도 몇 초간 «또 저장한다» 고 말한다(실측). */
{
  const saveBlk = blockAt(UP, "document.getElementById('btn-save').onclick");
  check('💾 저장 핸들러를 오려 냈다', saveBlk.length > 0);
  check('저장이 시작되면 카운트다운을 끈다 (진행률을 덮지 않게)',
    /clearInterval\(window\._ph241Timer\)/.test(saveBlk));
  check('카운트다운도 «저장 중»(btn.disabled)이면 손을 뗀다 (이중 방어)',
    /window\._autoSaveCancelled \|\| btn\.disabled/.test(UP));
}

/* ═══════════════════════════════════════════════════════════════════════
   [F] 완료 알림이 «어디까지 갔는지» 를 말한다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[F] 📡 «내 PC» 와 «공용 자료실» 을 갈라 말하는가');
/* 2026-08-13 제보(「Teachers can upload but we don't know how to add in the library」)의
   뿌리가 «자기 PC 에만 들어간 것을 성공이라 말한» 것이었다. 그 뒤 버튼 글자에는 적었지만
   알림을 닫는 순간 버튼이 되돌아가 아무도 못 읽었다. */
check('완료 알림에 공용 자료실 결과를 적는다', /📡 공용 자료실: 새로 ' \+ srvOk/.test(UP));
check('완료 알림에 저장한 «교재 이름» 을 적는다', /savedNames\.slice\(0, 6\)/.test(UP));
{
  // 「var head = (조건) ? A : B;」 한 문장만 잘라 본다 — 길이로 자르지 않는다
  const headStmt = (UP.match(/var head = [\s\S]*?;\n/) || [''])[0];
  check('완료 알림 머리글을 조건으로 정한다', /srvOk === 0 && srvFail > 0/.test(headStmt));
  check('공용 자료실에 한 장도 못 올렸으면 «완료» 라고 쓰지 않는다',
    /이 컴퓨터에만 저장되었습니다/.test(headStmt) && /'✅ 저장 완료!'/.test(headStmt));
}
check('건너뜀(중복)을 올린 것처럼 세지 않는다', /srvDup \? ' · 이미 있어 건너뜀 '/.test(UP));

/* ═══════════════════════════════════════════════════════════════════════
   [G] 화면 안내가 서로 반대를 말하지 않는가 (2026-08-27 trap-check 가 잡은 것)
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[G] 🗣 한 화면이 «한 가지» 를 말하는가');
/* [왜] 드롭존 예시와 팁 상자가 같은 것을 두고 반대를 말하고 있었다.
     드롭존: 「과 폴더는 제1과 · Unit 1 · 001 다 됩니다」
     팁 상자(8/26): 「⚠️ 숫자 폴더(001)는 유닛마다 다른 책으로 쪼개집니다 — 제1과 처럼 쓰세요」
   사람은 위에 있는 쪽을 따르고, 하필 그 문구가 다락원 예시 바로 아래였다.
   ⚠️ 주석은 벗겨 내고 본다 — 「왜 이렇게 적었나」 설명에 그 문구가 들어가면 자기 주석을 잡는다
      (CLAUDE.md 2장 「부정 검사가 자기 주석 때문에 FAIL」). */
{
  const strip = (t) => t
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  const body = strip(UP);
  check('드롭존이 «001 도 된다» 고 말하지 않는다',
    !/<code[^>]*>001<\/code>\s*다 됩니다/.test(body) && !/001<\/code>\s*·?\s*다 됩니다/.test(body));
  check('팁 상자의 «숫자 폴더는 쪼개진다» 경고가 그대로 있다 (8/26)',
    /숫자 폴더\(<code>001<\/code>\)는 <b>유닛마다 다른 책<\/b>/.test(body));
  check('팁 첫 줄이 «출판사 / 교재명 / 레슨 가장 정확» 이라고 말하지 않는다',
    !/출판사 \/ 교재명 \/ 레슨<\/code> 구조로 정리하면 가장 정확/.test(body));
  check('팁 첫 줄과 드롭존이 같은 규칙(«교재 이름을 맨 위 폴더»)을 말한다',
    /<b>교재 이름을 맨 위 폴더<\/b>/.test(body) && /맨 위 폴더 이름이 그대로 «교재 이름»/.test(body));
  /* ⚠️ 「다락원/마스터3/제1과」 가 파일에 «있는가» 로 묻지 마세요 — 팁 상자의 ⛔ 경고가
        「이렇게 쓰지 마세요」라며 그 경로를 **일부러** 적습니다(멀쩡한 안내를 잡습니다).
        물어야 할 것은 «사람이 따라 하는 예시»(드롭존)가 안전한 쪽인가입니다. */
  const dzSub = (body.match(/<div class="dz-sub">[\s\S]*?<\/div>/) || [''])[0];
  check('드롭존 예시 블록을 오려 냈다', dzSub.length > 0);
  check('드롭존 예시가 «다락원 중국어 마스터 3/제1과» 다 (교재명이 안 바뀌는 구조)',
    /다락원 중국어 마스터 3\/제1과/.test(dzSub) && !/다락원\/마스터3\/제1과/.test(dzSub));
  check('분류 결과 카드가 «여기서 고칠 수 있다» 를 화면에 적는다',
    /교재명·레벨은 아래 칸에서 바로 고칠 수 있습니다/.test(body));
}

console.log('\n' + '═'.repeat(60));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n❌ 실패:'); FAILS.forEach(f => console.log('   - ' + f)); process.exit(1); }
console.log('\n🎉 교재 업로더 이름 전체 통과 — 유닛 폴더가 책 이름을 잡아먹지 않고, 자동 저장이 검토를 앞지르지 않는다.');
