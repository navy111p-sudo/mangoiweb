// -*- coding: utf-8 -*-
// 🗄🎬 마이마이 ⑥(목록에서 MES 빼기) · ⑩(수업 중 BTS·SIU·교사영상 불필요) 하네스 (2026-08-11)
//   실행: node test-harness/retired_course_video_260811_harness.mjs
//
//   ⑥ "Pls remove MES from the list we don't use anymore sir"
//   ⑩ "No need for the videos for BTS, SIU and Teachers videos during the class and OLD MES book"
//
//   🔑 이 하네스가 지키는 핵심 규칙은 «숨김이지 삭제가 아니다» 이다.
//      운영 DB 에 MES 교재 325건·BTS 영상 113건이 있고 지난 수업 기록이 그것을 가리킨다.
//      누군가 «간단히» 지우려 들면 여기서 걸린다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };
const x3    = rd('../cloudflare-deploy/public/js/idx-x3.js');
const html  = rd('../cloudflare-deploy/public/index.html');
const thtml = rd('../cloudflare-deploy/public/teacher.html');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (n, c, x) => {
  if (c) PASS++; else { FAIL++; FAILS.push(n); }
  console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x !== undefined ? '  → ' + JSON.stringify(x) : ''}`);
};

// ── ⑥ 교재 숨김 판정을 «떼어내 실제로 실행» ──────────────────────────────
const i0 = x3.indexOf('var RETIRED_COURSES');
const i1 = x3.indexOf('var COURSE_ORDER');
const SRC = x3.slice(i0, i1);
const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(SRC, ctx);
const hidden = (pub, tb) => ctx.window.__libIsRetiredCourse({ publisher: pub, textbook: tb || pub });

console.log('\n[ ⑥ 교재 목록에서 MES 가 사라진다 ]');
check('MES 교재는 숨긴다', hidden('MES') && hidden('MES 3') && hidden('A MES 3'));
check('BTS·SIU·Phonics 는 그대로 보인다', !hidden('BTS') && !hidden('SIU 1') && !hidden('Phonics'));
check('🔴 낱말 속 우연일치는 안 숨긴다 (JAMES 안의 MES)', !hidden('JAMES BOOK'), { JAMES: hidden('JAMES BOOK') });
check('중국어·기타 교재는 영향 없다', !hidden('중국어 마스터 3') && !hidden('Darakwon'));
check('목록·카드·검색이 한 곳에서 걸러진다 (트리에서만 빼면 검색으로 나온다)',
  /_libAllBooks\s*=\s*\(res\.textbooks \|\| \[\]\)\.filter\(/.test(x3));
check('🔒 삭제가 아니라 숨김이다 (DB 를 지우는 코드가 없다)',
  !/DELETE FROM textbook_files/.test(x3));
check('되살리기 쉬운 자리에 목록이 있다', /var RETIRED_COURSES = \['MES'\]/.test(x3));

// ── ⑩ 수업 영상 숨김 판정 ────────────────────────────────────────────────
const j0 = html.indexOf('var MV_RETIRED');
const j1 = html.indexOf('async function mvFetchHome');
const SRC2 = html.slice(j0, j1);
const c2 = { console }; c2.window = c2;
vm.createContext(c2);
vm.runInContext(SRC2 + '\nwindow.__t = mvIsRetired;', c2);
const vhid = (t, cat) => c2.window.__t({ title: t, category: cat || '' });

console.log('\n[ ⑩ 수업 중 BTS·SIU·교사안내 영상이 안 보인다 ]');
check('BTS 영상 숨김', vhid('BTS 03 004 006(How old are you)'));
check('SIU 영상 숨김', vhid('SIU 2 unit 5'));
check('교사안내 영상 숨김', vhid("Mangoi Teacher's Guide ( DOS and DON'TS in Online Class )"));
check('그 외 영상은 그대로 보인다', !vhid('BtoB회원 수업안내동영상') && !vhid('Phonics song'));
check('⚠️ MES 영상은 일부러 남겼다 (요청서가 지목한 건 «MES 책»)', !vhid('A MES 3 ep 2'));
check('🔒 삭제가 아니라 화면에서만 거른다 (관리자 화면 영향 없음)',
  /mvCache = \(d\.items \|\| \[\]\)\.filter\(/.test(html) && !/DELETE FROM mango_videos/.test(html));

console.log('\n[ ⑩ 교재를 열어도 영상을 «묻지도 않고» 부르지 않는다 ]');
check('🔴 교재 선택이 더는 영상을 자동 호출하지 않는다',
  !/mangoiPlayLessonVideo\(_bk\)/.test(x3));
check('⛔ 영상 기능 자체는 지우지 않았다 (누르면 보는 길은 남는다)',
  /window\.mangoiPlayLessonVideo = async function/.test(html));
check('«지금 어느 책인가» 는 계속 기록한다 (다른 코드가 읽는다)',
  /window\.__mangoiCurrentBookId = _bk/.test(x3));

console.log('\n[ ⑧ 강사페이지에서 연·월·일을 바로 고른다 ]');
check('날짜 입력이 있다', /id="wk-date"/.test(thtml));
check('고르면 «그 주» 로 실제 이동한다 (배선 없으면 장식일 뿐)',
  /dt\.addEventListener\('change', function\(\)\{ loadWeekOf\(this\.value\); \}\)/.test(thtml));
check('PC 직접입력용 이동 버튼도 있다', /id="wk-go"/.test(thtml));
check('한/영 라벨', /data-en="Jump to date"/.test(thtml));

console.log('\n[ 🧪 헛통과 방지 ]');
check('가짜 브라우저에서 판정 함수가 실제로 돌았다',
  typeof ctx.window.__libIsRetiredCourse === 'function' && typeof c2.window.__t === 'function');

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
