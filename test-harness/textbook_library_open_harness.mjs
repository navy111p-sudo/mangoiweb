// 📚 수업 중 교재 라이브러리 — «목록은 보이는데 눌러도 안 되는» 사고 감시 (2026-08-27)
//
//   왜 필요한가 —
//     마이마이 제보: 「The library doesn't work sir, even I restarted my pc, clear cache and refresh.
//     After uploading book folder at the library, we can't now open the library during the class.」
//
//     브라우저로 재현하니 **교재를 실제로 여는 함수(`window.selectFromTextbookLibrary`)가
//     `_loadAllIDB` 안의 `chk()` 한가운데에 잘못 들어가 있었다.** 그 정의는 `chk()` 의
//     `if (done) return;` **뒤**에 있어서, «IndexedDB 읽기가 5초 안에 성공했을 때만» 정의됐다.
//       · 읽기 시간 초과(교재를 많이 올린 뒤) · DB 열기 실패 · store 누락 · 예외
//     이 넷 중 하나라도 걸리면 **영영 정의되지 않는다.** 그런데 라이브러리 «목록» 은 서버에서
//     받아 와 멀쩡히 그려지므로, 쓰는 사람에게는 «목록은 보이는데 눌러도 아무 일도 안 일어나는»
//     상태가 된다(에러도 안 난다).
//
//     그리고 DB 열기 실패는 실제로 일어날 수 있었다 — 이 화면은 `open(name, 3)` 으로 버전을
//     지정했는데, 교재 업로더에는 store 가 없을 때 «버전을 올려» store 를 만드는 길이 있어
//     DB 가 4 가 될 수 있다. 그러면 VersionError 로 열기 자체가 실패하고,
//     **재시작·캐시삭제·새로고침으로도 안 풀린다**(IndexedDB 는 캐시가 아니다).
//     2026-08-27 실측: 버전을 4로 올린 뒤 `typeof window.selectFromTextbookLibrary` = 'undefined'.
//
//   이 하니스가 못 박는 것 —
//     ① `selectFromTextbookLibrary` 정의가 `_loadAllIDB` **밖**에 있다 (중괄호 짝으로 판정)
//     ② `_loadAllIDB` 는 DB 를 «버전을 지정하지 않고» 연다
//     ③ 거절 안내가 조용하지 않다 — `mangoToast` 는 정의가 없으므로 폴백을 둔다
//
//   ⚠️ 이 하니스는 «소스의 모양» 만 본다. 「로드 직후 정말 정의돼 있는가」는 브라우저로:
//        node test-harness/manual/textbook-library-open-browser.mjs
//
//   실행: node test-harness/textbook_library_open_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dir);
const read = (p) => { try { return readFileSync(join(root, p), 'utf8'); } catch { return ''; } };

let pass = 0, fail = 0; const FAILS = [];
const check = (n, ok) => { if (ok) { pass++; console.log('  ✅ ' + n); } else { fail++; FAILS.push(n); console.log('  ❌ ' + n); } };

console.log('📚 수업 중 교재 라이브러리 하니스 · ' + new Date().toISOString());

const X3 = read('cloudflare-deploy/public/js/idx-x3.js');
check('교재 라이브러리 스크립트가 있다', X3.length > 0);

/* ✂️ 검사 범위는 «길이» 로 자르지 않는다 — 중괄호 짝으로 함수 본문을 잘라 낸다
   (CLAUDE.md 2장 「검사 범위를 «길이» 로 자르지 마세요」). */
const fnBody = (src, anchor) => {
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

console.log('\n[A] 🔴 «교재를 여는 함수» 가 IDB 읽기에 매달려 있지 않은가');
{
  const body = fnBody(X3, 'function _loadAllIDB()');
  check('_loadAllIDB 본문을 오려 냈다', body.length > 200);
  /* ⛔ 이 검사가 FAIL 하면, IndexedDB 가 느리거나(교재를 많이 올린 뒤) 열리지 않을 때
        교재를 골라도 아무 일도 안 일어난다 — 목록은 정상으로 보이므로 «고장» 으로 안 읽힌다. */
  check('selectFromTextbookLibrary 정의가 _loadAllIDB «안» 에 없다',
    body.length > 0 && !/window\.selectFromTextbookLibrary\s*=/.test(body));
  check('selectFromTextbookLibrary 가 파일 최상위에서 정의된다',
    /^  window\.selectFromTextbookLibrary = async function/m.test(X3));
  /* 그 정의가 «_loadAllIDB 보다 뒤» 인지도 본다 — 앞에 두면 chk 안으로 되돌아간 것과 같다 */
  const iDef = X3.indexOf('  window.selectFromTextbookLibrary = async function');
  const iFn = X3.indexOf('function _loadAllIDB()');
  const iEnd = iFn >= 0 ? iFn + fnBody(X3, 'function _loadAllIDB()').length : -1;
  check('정의 위치가 _loadAllIDB 가 끝난 뒤다', iDef > 0 && iEnd > 0 && iDef > iEnd);
}

console.log('\n[B] 🪤 DB 버전을 지정하지 않고 여는가 (VersionError 방지)');
{
  const body = fnBody(X3, 'function _loadAllIDB()');
  /* ⛔ `open(name, 3)` 으로 되돌리면, 업로더가 버전을 올린 브라우저에서 이 화면은 IDB 를
        영영 못 읽는다(재시작·캐시삭제로도 안 풀린다). 2026-08-27 실측으로 재현했다. */
  check('_loadAllIDB 가 버전을 지정하지 않고 연다',
    /indexedDB\.open\('mangoi-textbooks'\)/.test(body));
  check('_loadAllIDB 에 «버전 3 고정» 이 남아 있지 않다',
    !/indexedDB\.open\('mangoi-textbooks',\s*\d/.test(body));
  check('열기 실패·차단·예외를 모두 resolve 로 받는다 (모달이 안 멈추게)',
    /err:'open_failed'/.test(body) && /err:'blocked'/.test(body) && /err:'exception:/.test(body));
}

console.log('\n[C] 📢 거절이 조용하지 않은가');
{
  /* `vcTextbookDenied`(idx-main.js)는 bare `mangoToast` 를 부르는데 그 함수는 저장소에
     **정의가 없다** — `js/idx-chatbot-frame.js` 주석이 그 사실을 적어 두었다. 정의가 없으면
     학생·매니저가 라이브러리를 눌렀을 때 «아무 일도 안 일어난다» → 고장으로 읽힌다. */
  check('mangoToast 폴백을 둔다', /window\.mangoToast = function/.test(X3));
  check('이미 정의돼 있으면 덮지 않는다',
    /if \(typeof window\.mangoToast !== 'function'\)/.test(X3));
  check('재연결 안내를 가리지 않는 z-index (2147483001 이하)',
    /z-index:2147483001/.test(X3) && !/z-index:214748364/.test(X3));
  const denied = read('cloudflare-deploy/public/js/idx-main.js');
  check('거절 문구가 한국어·영어 둘 다 있다',
    /Only the teacher can change the textbook/.test(denied) && /교재는 선생님만 바꿀 수 있어요/.test(denied));
}

console.log('\n[D] 🔗 화면이 그 스크립트의 새 판을 받는가 (?v=)');
{
  const html = read('cloudflare-deploy/public/index.html');
  const m = html.match(/\/js\/idx-x3\.js\?v=(\d+)/);
  check('index.html 이 idx-x3.js 를 ?v= 로 부른다', !!m);
  check('?v= 가 10 보다 크다 (이번 수리분을 받게)', !!m && Number(m[1]) > 10);
}

console.log('\n' + '═'.repeat(60));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n❌ 실패:'); FAILS.forEach((f) => console.log('   - ' + f)); process.exit(1); }
console.log('\n🎉 교재 라이브러리 전체 통과 — «목록은 보이는데 눌러도 안 되는» 상태가 재발하지 않는다.');
