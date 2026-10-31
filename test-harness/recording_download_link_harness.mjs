// 📼 녹화 «저장»·«링크» 통로 감시 — 2026-09-01
//
// [무엇이 문제였나]
//   사장님 제보 「빠르게 작동이 안돼. 카카오에 저장도 안돼」(2026-09-01, class-1015).
//   관리자 › 녹화 목록의 ⬇저장이 `/api/recordings/blob/<키>` + <a download> 를 쓰고 있었다.
//   그 통로(index.ts handleRecordingDownload)는 Range 를 그대로 존중해 **206** 을 돌려주는데,
//   갤럭시 일부 기기가 저장 요청에 `Range: bytes=0-` 를 끼워 넣는다 → 안드로이드
//   DownloadManager 가 사유 없이 «다운로드에 실패했습니다» 만 반복한다.
//   이 진단과 수리는 2026-08-15 에 이미 있었다 — `/api/recording/play?…&dl=1` 이
//   Range 를 무시하고 200 전체 본문 + Content-Disposition 을 준다. 강사 화면(flow.js)은
//   그것을 쓰는데 **관리자 목록만** 옛 통로에 남아 있었다.
//
// [왜 문자열 검사만으로는 모자란가]
//   함수도 값도 다 «있었고» 틀린 것은 «어느 통로를 부르는가» 뿐이라, 수리 전에도 회귀
//   하니스가 전부 초록이었다. 그래서 여기서는 서버의 «이 녹화를 내려줄 수 있는가» 판정을
//   **소스에서 오려 내 실제로 돌리고**, 그 판정이 /api/recording/play 의 404 조건과
//   «같은 말» 을 하는지 두 파일을 맞대어 본다.
//
// 실행: node test-harness/recording_download_link_harness.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => readFileSync(resolve(__dir, p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};
// ⚠️ 부정 검사는 주석을 벗긴 사본으로 — 「왜 고쳤나」 설명 주석이 그 낱말을 그대로 담는다(CLAUDE.md 2장)
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const MANGO = rd('../cloudflare-deploy/src/api-mango.ts');
const R2    = rd('../cloudflare-deploy/src/recordings-r2.ts');
const CORE  = rd('../cloudflare-deploy/public/js/adm-core.js');
const INDEX = rd('../cloudflare-deploy/src/index.ts');
const SITE  = rd('../cloudflare-deploy/src/site-url.ts');

/* ══ ① 서버 판정을 «실제로 돌린다» ════════════════════════════════════════
   여기서 통과한 행에만 ⬇저장·🔗링크 버튼이 붙는다. 조건을 하나라도 지우면
   «눌러도 404 나는 버튼» 이 생기고(느슨해질 때), 반대로 넓히면 멀쩡한 녹화의
   버튼이 사라진다(좁아질 때). 둘 다 화면에는 에러가 안 난다. */
console.log('\n① 「이 녹화를 내려줄 수 있는가」 판정 — 소스를 오려 내 실행');

const mSrc = MANGO.match(/let key = String\(row\.file_url \|\| ''\);[\s\S]*?&& !\(row\.expires_at && Number\(row\.expires_at\) < _nowMs\);/);
check('판정부를 소스에서 찾았다', !!mSrc,
  '못 찾으면 아래 검사는 전부 무의미하다 — 모양이 바뀌었으면 여기부터 고칠 것');

if (mSrc) {
  let playable;
  try {
    playable = new Function('row', '_nowMs', mSrc[0] + '\n return playable;');
  } catch (e) { check('판정부가 그대로 실행된다', false, String(e && e.message)); }

  if (playable) {
    const NOW = 1_800_000_000_000;
    const run = (row) => playable(row, NOW);
    const base = { id: 7, file_url: 'rec/class-1015/7_1.webm', filename: null, status: 'completed', storage: 'r2', expires_at: null };

    check('정상 녹화는 내려줄 수 있다', run({ ...base }) === true);
    check('file_url 이 비고 filename 만 있어도 내려줄 수 있다(옛 행)',
      run({ ...base, file_url: null, filename: 'abc.webm' }) === true);
    check('filename 이 이미 rec/ 로 시작해도 내려줄 수 있다',
      run({ ...base, file_url: null, filename: 'rec/class-1/9.webm' }) === true);

    check('보관 만료(status=deleted)는 안 준다',        run({ ...base, status: 'deleted' })  === false);
    check('저장 실패(status=upload_failed)는 안 준다',  run({ ...base, status: 'upload_failed' }) === false);
    check('storage=r2_failed 는 안 준다',               run({ ...base, storage: 'r2_failed' }) === false);
    check('storage=error 는 안 준다',                   run({ ...base, storage: 'error' })     === false);
    check('storage=debug 는 안 준다',                   run({ ...base, storage: 'debug' })     === false);
    check('만료일이 지난 녹화는 안 준다',                run({ ...base, expires_at: NOW - 1 })  === false);
    check('만료일이 남았으면 준다',                      run({ ...base, expires_at: NOW + 1 })  === true);
    check('외부 http(s) 주소는 안 준다(우리 R2 가 아니다)',
      run({ ...base, file_url: 'https://example.com/a.webm' }) === false);
    check('키를 못 풀면(파일 정보 없음) 안 준다',
      run({ ...base, file_url: null, filename: null }) === false);
  }
}

/* ══ ② 만들어 주는 주소가 «저장 전용» 통로인가 ══════════════════════════ */
console.log('\n② ⬇저장 주소 — Range 를 무시하고 200 을 주는 통로인가');
const mDl = MANGO.match(/dl_url:\s*'([^']+)'\s*\+\s*qs\s*\+\s*'([^']+)'/);
check('dl_url 이 /api/recording/play 를 가리킨다', !!mDl && mDl[1] === '/api/recording/play', mDl && mDl[1]);
check('dl_url 에 dl=1 이 붙는다 (이게 없으면 206 이 돌아와 갤럭시 저장이 실패한다)',
  !!mDl && /dl=1/.test(mDl[2]), mDl && mDl[2]);
check('dl_url 이 옛 blob 통로가 아니다',
  !!mDl && !/\/api\/recordings\/blob\//.test(mDl[1] + mDl[2]));
check('서명(&sig=)을 동봉한다 (쿠키 없는 다운로드 관리자용 — 2026-08-13)',
  /const qs = '\?id=' \+ row\.id \+ '&sig=' \+ encodeURIComponent\(sig\)/.test(MANGO));
check('dl=1 이면 서버가 Range 를 무시한다 (recordings-r2.ts 쪽 계약)',
  /const wantDl = url\.searchParams\.get\("dl"\) === "1"/.test(R2)
  && /const range = wantDl \? null : request\.headers\.get\("Range"\)/.test(R2));
check('dl=1 이면 Content-Disposition: attachment 를 붙인다',
  /headers\.set\("Content-Disposition", `attachment; filename="\$\{dlName\}"`\)/.test(R2));

/* ══ ③ 링크 공유 주소가 «정본 도메인» 인가 ═══════════════════════════════
   CLAUDE.md 0장 — 사람에게 안내하는 링크의 정본은 src/site-url.ts 의 SITE_ORIGIN.
   location.origin 으로 만들면 관리자가 옛 도메인에서 열었을 때 그 주소가 나간다. */
console.log('\n③ 🔗 링크 — 사람에게 보내는 주소가 정본 도메인인가');
check('share_url 을 siteUrl() 로 만든다', /share_url:\s*siteUrl\(/.test(MANGO));
check("api-mango.ts 가 site-url 을 import 한다", /import \{ siteUrl \} from '\.\/site-url'/.test(MANGO));
check('SITE_ORIGIN 이 mangoi.ai 다', /export const SITE_ORIGIN = 'https:\/\/mangoi\.ai'/.test(SITE));
check('화면이 자기 마음대로 공유 주소를 조립하지 않는다(location.origin 금지)',
  !/share_url\s*[:=][^\n]*location\.origin/.test(strip(CORE)));

/* ══ ④ 유효기간을 «두 벌» 로 적지 않았는가 ═══════════════════════════════
   서명은 "만료ms.서명" 형식이다. 숫자를 또 적어 두면 TTL 을 바꿀 때 한쪽만 고쳐져
   화면이 거짓 시각을 말한다(CLAUDE.md 2장 «숫자 대신 근거를 검사하라»). */
console.log('\n④ 만료 시각 — 서명에서 읽는가, 따로 적어 두었는가');
check('share_expires_at 을 서명 문자열에서 파싱한다',
  /share_expires_at:\s*parseInt\(String\(sig\)\.split\('\.'\)\[0\], 10\)/.test(MANGO));
check('api-mango.ts 가 TTL 시간을 따로 하드코딩하지 않는다',
  !/6\s*\*\s*3600\s*\*\s*1000/.test(strip(MANGO)));

/* ══ ⑤ 화면이 그 통로를 실제로 쓰는가 ════════════════════════════════════ */
console.log('\n⑤ 관리자 목록 — ⬇저장이 새 통로를 쓰는가');
const SCORE = strip(CORE);
check('저장 버튼이 dl_url 을 먼저 본다', /var saveUrl = r\.dl_url \|\| playUrl;/.test(SCORE));
check('저장 <a> 의 href 가 saveUrl 이다 (playUrl 을 직접 쓰지 않는다)',
  /playBtn \+= '<a href="' \+ saveUrl \+ '" download="/.test(SCORE));
check('폴백은 남아 있다 (서버가 못 푼 행은 지금처럼 옛 통로로 — 되던 것을 잃지 않는다)',
  /r\.dl_url \|\| playUrl/.test(SCORE));
check('통합 행이 서버가 준 세 값을 실어 나른다',
  /dl_url: r\.dl_url \|\| null/.test(SCORE)
  && /share_url: r\.share_url \|\| null/.test(SCORE)
  && /share_expires_at: r\.share_expires_at \|\| 0/.test(SCORE));

/* ══ ⑥ 링크 버튼과 그 함수 ═══════════════════════════════════════════════ */
console.log('\n⑥ 🔗 링크 버튼 — 붙어 있고, 눌리는가');
check('share_url 이 있는 행에만 링크 버튼을 그린다', /if \(r\.share_url\) \{/.test(SCORE));
check('버튼이 shareRecordingLink(id) 를 부른다', /onclick="shareRecordingLink\(' \+ r\.id \+ '\)"/.test(SCORE));
/* 🔴 CLAUDE.md 2장 — 함수 선언을 다른 함수 «안» 에 넣으면 inline onclick 이
   ReferenceError 로 죽는데 «선언도 있고 호출도 있다» 라 문자열 검사는 통과한다.
   이 파일은 IIFE 로 감싸여 있지 않으므로(맨 앞이 주석) 열 0 선언 = 최상위다. */
check('shareRecordingLink 가 **최상위**에 선언돼 있다 (열 0 — 함수 안에 있으면 눌러도 죽는다)',
  /^async function shareRecordingLink\(id\) \{/m.test(CORE));
check('adm-core.js 가 IIFE 로 감싸여 있지 않다 (위 «열 0 = 최상위» 판정의 근거)',
  !/^\s*\(\s*function\s*\(/.test(CORE.slice(0, 4000)));

const shareFn = CORE.match(/^async function shareRecordingLink\(id\) \{[\s\S]*?\n\}/m);
check('링크 함수 본문을 찾았다', !!shareFn);
if (shareFn) {
  const B = strip(shareFn[0]);
  /* ⛔ 카톡·문자앱 인앱 브라우저는 새 창을 못 열고 **예외도 안 던진 채 null 만** 돌려준다.
     그래서 window.open 으로 링크를 띄우면 조용히 아무 일도 안 일어난다(CLAUDE.md 2장). */
  check('window.open 을 쓰지 않는다 (인앱 브라우저에서 조용히 실패한다)', !/window\.open\(/.test(B));
  check('휴대폰에서는 공유 시트를 쓴다 (여기에 카카오톡이 뜬다)', /navigator\.share\(/.test(B));
  check('공유 시트를 닫은 것은 실패로 처리하지 않는다', /AbortError/.test(B));
  check('PC 는 복사로 떨어진다 (윈도우 공유 시트에는 카톡이 없는 경우가 많다)',
    /navigator\.maxTouchPoints/.test(B) && /navigator\.clipboard\.writeText/.test(B));
  check('클립보드가 막히면 사람이 직접 복사할 수 있게 보여 준다', /prompt\(/.test(B));
  /* ⛔ 유효기간을 감추면 「보냈는데 안 열린대요」가 된다 — 링크는 6시간 뒤 만료된다. */
  check('만료 시각을 사람에게 말해 준다', /share_expires_at/.test(B) && /untilTxt/.test(B));
  check('미성년자 영상이라는 주의를 함께 띄운다', /미성년자/.test(B));
  check('공유 링크를 만들 수 없는 행은 그렇다고 말한다', /공유 링크를 만들 수 없습니다/.test(B));
}

/* ══ ⑦ 두 파일이 «같은 말» 을 하는가 ════════════════════════════════════
   서버 판정(api-mango)이 느슨해지면 «눌러도 404» 인 버튼이 생긴다. play 쪽이
   거절하는 사유가 여기에도 전부 있어야 한다. */
console.log('\n⑦ 목록 판정과 /api/recording/play 의 404 조건이 서로 같은 말인가');
const playBlk = R2.match(/if \(path === "\/api\/recording\/play" && method === "GET"\) \{[\s\S]*?let r2Key/);
check('play 핸들러 블록을 찾았다', !!playBlk);
if (playBlk && mSrc) {
  const P = playBlk[0], M = mSrc[0];
  for (const tok of ['deleted', 'upload_failed', 'r2_failed', 'error', 'debug']) {
    const inPlay = new RegExp('"' + tok + '"').test(P);
    const inList = new RegExp("'" + tok + "'").test(M);
    check(`«${tok}» 을 양쪽이 함께 거절한다`, inPlay === inList, { play: inPlay, list: inList });
  }
  check('만료(expires_at)도 양쪽이 함께 본다',
    /row\.expires_at && row\.expires_at < Date\.now\(\)/.test(P) && /row\.expires_at/.test(M));
}

/* ══ ⑧ 서명 발급의 전제 — 이 목록 API 는 관리자 전용이어야 한다 ══════════
   서명은 «인증을 통과한 뒤에만» 발급된다는 전제 위에 서 있다. 이 경로가 공개로
   열리면 누구나 녹화 다운로드 서명을 받아 간다(미성년자 수업 영상). */
console.log('\n⑧ 서명 발급의 전제 — /api/recordings 목록이 관리자 전용인가');
check("index.ts 가 GET /api/recordings 를 관리자 전용으로 잠근다",
  /if \(path === '\/api\/recordings' && method === 'GET'\) return true;/.test(INDEX));
check('서명은 그 관리자 전용 목록 안에서만 발급된다 (다른 곳으로 새지 않았는가)',
  (MANGO.match(/signRecDlSig\(/g) || []).length <= 3,
  '늘었다면 새 호출부가 인증 뒤인지 사람이 확인할 것');

console.log(`\n${PASS} PASS / ${FAIL} 실패`);
if (FAIL) console.log('실패 목록:\n  · ' + FAILS.join('\n  · '));
process.exit(FAIL ? 1 : 0);
