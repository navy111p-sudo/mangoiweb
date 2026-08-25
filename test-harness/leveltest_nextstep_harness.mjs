// -*- coding: utf-8 -*-
// 🎯 레벨테스트 → 수강신청 «다음 걸음» 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/leveltest_nextstep_harness.mjs
//   대상:  public/t.html · public/parent.html · public/enroll.html
//          public/admin/mypage.html · src/api-admin.ts
//
//   발단(2026-08-25): 레벨테스트 결과 화면에 최종 레벨·추천 교재·다음 수업 안내가
//   다 나오는데, 거기서 «그래서 뭘 하면 되나» 로 이어지는 길이 한 곳도 없었습니다.
//   결과를 받은 학부모가 스스로 신청 화면을 찾아가야 했습니다.
//
//   이 하니스가 지키는 것:
//     A. 결과가 «나왔을 때만» 신청으로 가는 길을 낸다 (테스트 전에 권하면 순서가 뒤집힌다)
//     B. 🔴 주소를 «&amp;» 로 적는다 — «&lt_level» 은 브라우저가 옛 문자참조 &lt(=<) 로
//        읽어 버려 레벨이 통째로 사라진다. 2026-08-25 브라우저 검사에서 실제로 잡혔다
//     C. 신청 화면은 그 값을 «표시만» 한다 — 가격·권한에 쓰지 않는다
//     D. 계정 없는 체험 학생이 로그인 화면으로 튕겨도 결과를 잃지 않는다(sessionStorage)
//        ⛔ localStorage 로 굳히지 않는다 — 그 폰을 다음 사람이 써도 남의 레벨이 뜬다
//     E. 추천 교재 제안은 «규칙을 지어내는» 것이 아니라 사람이 고른 것을 세어 되돌려 준다
//
//   ⚠️ 문자열 검사다 — «눌러서 갈 수 있는가»·«대비가 읽히는가» 는 브라우저에서만 보인다:
//        PW_DIR=/tmp/pw node test-harness/manual/leveltest-nextstep-browser.mjs
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const __dir = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(resolve(__dir, '..', p), 'utf8');
const T = R('cloudflare-deploy/public/t.html');
const PARENT = R('cloudflare-deploy/public/parent.html');
const ENROLL = R('cloudflare-deploy/public/enroll.html');
const MYPAGE = R('cloudflare-deploy/public/admin/mypage.html');
const ADMIN = R('cloudflare-deploy/src/api-admin.ts');

/* 부정 검사는 주석을 벗겨 낸 사본으로 판정한다 (CLAUDE.md 2장 — 자기 설명 주석을 잡는 사고) */
const strip = (t) => t
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

console.log('\n[ A. 결과 화면(t.html) — 결과가 나왔을 때만 길을 낸다 ]');
{
  check('«이 결과로 신청» 버튼이 있다', /class="nextstep"[\s\S]{0,200}\/enroll\.html/.test(T));
  check('최종 레벨이 있을 때만 그린다', /if \(r\.final_level\) \{[\s\S]{0,900}class="nextstep"/.test(T));
  check('레벨을 주소에 싣는다', /lt_level=' \+ encodeURIComponent\(r\.final_level\)/.test(T));
  check('추천 교재가 있으면 함께 싣는다',
    /if \(r\.recommended_textbook\)[\s\S]{0,80}lt_book=' \+ encodeURIComponent\(r\.recommended_textbook\)/.test(T));
  check('어디서 왔는지 표시한다(from=lt)', /\?from=lt/.test(T));
  check('버튼 글자에도 레벨을 적어 준다', /class="nextstep"[\s\S]{0,600}esc\(r\.final_level\)/.test(T));
}

console.log('\n[ B. 🔴 «&lt» 문자참조 함정 — 주소가 조용히 깨지지 않는가 ]');
{
  // «&lt_level» 은 세미콜론이 없어도 legacy named reference 로 디코딩된다 → «<_level»
  check('t.html 은 &amp; 로 적는다', /'\?from=lt&amp;lt_level=/.test(T));
  check('parent.html 도 &amp; 로 적는다', /'\?from=lt&amp;lt_level=/.test(PARENT));
  check('t.html 에 날 «&lt_» 가 남아 있지 않다', !/&lt_(level|book)=/.test(strip(T)));
  check('parent.html 에 날 «&lt_» 가 남아 있지 않다', !/&lt_(level|book)=/.test(strip(PARENT)));
  check('왜 그렇게 적는지 이유가 코드 옆에 남아 있다',
    /문자참조/.test(T) && /문자참조/.test(PARENT));
}

console.log('\n[ C. 학부모 화면(parent.html) — 어느 결과를 쓰는가 ]');
{
  check('결과가 나온 신청에서만 고른다', /items\.filter\(a => a && a\.final_level\)/.test(PARENT));
  check('가장 최근 결과 하나만 쓴다 (옛 레벨로 신청하지 않게)',
    /\.sort\(\(x, y\) => \(y\.created_at \|\| 0\) - \(x\.created_at \|\| 0\)\)\[0\]/.test(PARENT));
  check('결과가 없으면 아무것도 안 그린다', /: '';/.test(PARENT) && /const nextStep = withLevel/.test(PARENT));
  check('신청현황 목록과 함께 그린다', /el\.innerHTML = rows \+ nextStep \+ cta;/.test(PARENT));
}

console.log('\n[ D. 신청 화면(enroll.html) — 표시만 한다 · 결과를 잃지 않는다 ]');
{
  check('받은 결과를 되짚어 주는 상자가 있다', /id="stLtResult"/.test(ENROLL));
  check('기본은 감춰져 있다 (일반 신청자에게는 없던 화면 그대로)',
    /id="stLtResult" style="display:none/.test(ENROLL));
  check('레벨·추천 교재 자리가 있다', /id="ltResLevel"/.test(ENROLL) && /id="ltResBook"/.test(ENROLL));
  check('주소에서 읽는다', /qp\.get\('lt_level'\)/.test(ENROLL) && /qp\.get\('lt_book'\)/.test(ENROLL));
  check('길이를 잘라서 넣는다 (주소로 받은 값)', /lt_level'\) \|\| ''\)\.trim\(\)\.slice\(0, 12\)/.test(ENROLL));
  check('textContent 로 넣는다 (innerHTML 조립 금지)',
    /lvEl\.textContent = lv;/.test(ENROLL) && !/ltResLevel[\s\S]{0,200}innerHTML/.test(strip(ENROLL)));
  // ⛔ 이 값으로 금액·강사·권한을 정하면 주소만 고쳐 쓰는 문이 열린다
  check('그 값으로 금액을 정하지 않는다', !/lt_level[\s\S]{0,400}(price|amount|QUOTE =)/.test(strip(ENROLL)));

  check('로그인 왕복을 견디게 sessionStorage 에 담아 둔다',
    /sessionStorage\.setItem\(LT_KEY/.test(ENROLL) && /sessionStorage\.getItem\(LT_KEY/.test(ENROLL));
  check('⛔ localStorage 로 굳히지 않는다', !/localStorage\.[gs]etItem\(LT_KEY/.test(ENROLL));
  check('주소에 없으면 담아 둔 것을 꺼낸다', /if \(!lv\) \{[\s\S]{0,400}sessionStorage\.getItem\(LT_KEY/.test(ENROLL));
  check('로그인 화면에도 «기억해 뒀다» 고 적어 준다',
    /LT_HINT && LT_HINT\.level/.test(ENROLL) && /기억해 뒀어요/.test(ENROLL));
  check('그 안내문도 textContent 로 넣는다', /_ltNote\.textContent = /.test(ENROLL));
  // 🌐 JS 로 그린 글자는 data-ko/data-en 이 없으면 🌐 를 눌러도 안 따라온다 (CLAUDE.md 2장)
  check('안내문에 한/영을 함께 박는다',
    /_ltNote\.setAttribute\('data-ko'/.test(ENROLL) && /_ltNote\.setAttribute\('data-en'/.test(ENROLL));
  check('결과 상자의 라벨에도 한/영이 있다',
    /id="ltResLevel"/.test(ENROLL) && /data-ko="최종 레벨" data-en="Level"/.test(ENROLL)
      && /data-ko="추천 교재" data-en="Textbook"/.test(ENROLL));
  check('로그인 잠금 자체는 그대로다 (그냥 통과시키지 않는다)',
    /class="login-need"/.test(ENROLL) && /document\.querySelector\('\.price'\)\.style\.display = 'none';[\s\S]{0,40}return;/.test(ENROLL));
}

console.log('\n[ E. 추천 교재 제안 — 규칙을 지어내지 않는다 ]');
{
  check('서버가 레벨별 최빈 교재를 세어 준다', /GROUP BY final_level, recommended_textbook/.test(ADMIN));
  check('빈 값은 세지 않는다', /TRIM\(final_level\) <> ''[\s\S]{0,200}TRIM\(recommended_textbook\) <> ''/.test(ADMIN));
  check('많이 고른 순으로 정렬해 첫 줄만 남긴다',
    /ORDER BY final_level, n DESC/.test(ADMIN) && /if \(lv && !bookHints\[lv\]\)/.test(ADMIN));
  check('응답에 book_hints 로 실어 보낸다', /json\(\{ ok: true, items, pending, book_hints: bookHints \}\)/.test(ADMIN));
  check('조회가 실패해도 화면은 지금과 똑같이 돈다 (조용히 빈 객체)',
    /catch \(e\) \{ console\.warn\('\[leveltest\] book hints:/.test(ADMIN));
  // ⛔ 「A1 이면 파닉스」 같은 고정 표를 코드에 박지 않는다 — 교재 선택은 나이·목적이 함께 걸린 사업 판단
  check('레벨→교재 고정표를 코드에 박지 않았다',
    !/(BOOK_BY_LEVEL|LEVEL_BOOK_MAP|levelToBook)/.test(strip(ADMIN)));

  check('평가 화면이 그 제안을 받는다', /__ltBookHints = \(d && d\.book_hints\) \|\| \{\}/.test(MYPAGE));
  check('이미 적힌 값은 절대 덮지 않는다', /if \(touched \|\| \(bookEl\.value \|\| ''\)\.trim\(\)\) return;/.test(MYPAGE));
  check('사람이 손댄 뒤에는 다시 안 건드린다',
    /addEventListener\('input', function\(\)\{ touched = true; \}\)/.test(MYPAGE));
  check('레벨을 바꾸면 제안도 따라 바꾼다', /sel\.addEventListener\('change', applyHint\)/.test(MYPAGE));
  check('제안이라고 말해 준다 (title)', /bookEl\.title = /.test(MYPAGE));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`레벨테스트 다음걸음 하니스: ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('\n실패 항목:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
