// -*- coding: utf-8 -*-
// 📅 레벨테스트 → 캘린더 이동 하네스 (2026-08-06)
//   실행: node test-harness/leveltest_calendar_jump_harness.mjs
//
//   신고: 「스케줄 캘린더 클릭하면 왜 나타나지 않아?」 (레벨테스트 표의 «📅 #852 ✓» 를 가리키며)
//   원인 2겹 — 둘 다 «에러 없이 아무 일도 안 일어남» 이라 눈으로만 보면 못 찾는다.
//     ① 그 배지는 클릭 핸들러가 하나도 없는 <span> 이었다. 파란 배경·굵은 글씨라 누구나
//        버튼으로 읽는데 눌러도 무반응. — 「눌러도 안 되는 버튼 금지」는 바로 옆 줄에 주석으로
//        적혀 있었는데(희망일 없음 케이스) 정작 이 배지가 그 금지를 어기고 있었다.
//     ② 달력의 «일반 수업» 레이어는 그 달 수업이 150건을 넘으면 통째로 안 그린다. 반복 수업이
//        3,900건대라 항상 넘는다. 그런데 레벨테스트로 만든 수업은 전부 «일회성(one_off)» 이고
//        현재 2건뿐인데, 반복과 함께 싸잡혀 접혀서 달력에 영영 나타나지 않았다.
//   이 하네스는 그 둘이 되돌아가지 못하게 막는다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const core = rd('../cloudflare-deploy/public/js/adm-core.js');
const html = rd('../cloudflare-deploy/public/admin.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

console.log('\n[ ① «📅 #N ✓» 배지 — 눌리는 요소여야 한다 ]');
// 배지를 만드는 삼항식 한 덩어리를 떼어 본다 (schedule_id 가 있을 때의 가지)
const cellSrc = (core.match(/const clsCell = a\.schedule_id[\s\S]{0,2500}?\n\s*const actions =/) || [''])[0];
check('배지 만드는 코드를 찾았다', cellSrc.length > 50);
check('배지가 <span> 이 아니라 눌리는 요소다', /schedule_id\s*\n?\s*\?\s*`<button/.test(cellSrc.replace(/\r/g, '')));
check('클릭 핸들러가 붙어 있다 (onclick 없는 배지 금지)', /onclick="ltOpenClass\(/.test(cellSrc));
check('«그 수업이 잡힌 날짜» 를 넘긴다 (달만 안 맞으면 없는 것처럼 보인다)',
  /ltOpenClass\('\$\{String\(a\.desired_date/.test(cellSrc));
check('눌러 보라는 표시가 있다 (cursor:pointer)', /cursor:pointer/.test(cellSrc));

console.log('\n[ ②  call() 하는 이름은 «반드시 존재» 해야 한다 ]');
check('ltOpenClass 가 실제로 정의돼 있다', /function ltOpenClass\s*\(/.test(core));
check('ltOpenClass 가 window.calGotoDate 를 부른다', /window\.calGotoDate/.test(core));
check('그 함수가 admin.html 에 정의돼 있다', /window\.calGotoDate\s*=\s*function/.test(html));
check('없을 때의 대비책이 있다 (무동작 금지)',
  /typeof window\.calGotoDate === 'function'/.test(core) && /ltGotoCalendar\(\);\s*\n\}/.test(core));
check('대비책이 부르는 ltGotoCalendar 도 존재한다', /function ltGotoCalendar\s*\(/.test(core));

console.log('\n[ ③ 달력이 «그 날짜» 로 간다 ]');
check('그 달로 옮긴다 (calCur 재설정)', /window\.calGotoDate[\s\S]{0,700}?calCur\s*=\s*new Date\(Number\(p\[0\]\)/.test(html));
check('옮긴 뒤 다시 그린다', /window\.calGotoDate[\s\S]{0,900}?calLoad\(\)\)\.then/.test(html));
check('레벨테스트 레이어를 켜 준다', /window\.calGotoDate[\s\S]{0,600}?cal-layer-lt/.test(html));
check('수업 레이어도 켜 준다 (수업을 보러 온 것이므로)', /window\.calGotoDate[\s\S]{0,700}?cal-layer-cls/.test(html));
check('어느 칸인지 눈으로 짚어 준다', /function calFlashDay\(/.test(html));
check('날짜 칸을 찾을 수 있게 data-date 가 박혀 있다', /class="cal-cell'\+[\s\S]{0,120}?data-date="'\+iso\+'"/.test(html));
check('뒤늦은 toggle 이 방금 옮긴 달을 되돌리지 않는다 (_calInit 선점)',
  /window\.calGotoDate[\s\S]{0,500}?card\._calInit\s*=\s*true/.test(html));

console.log('\n[ ④ 「너무 많음」이 일회성 수업까지 접으면 안 된다 ]');
check('세는 대상은 반복 수업뿐이다',
  /clsTotal\+=clsOn\([\s\S]{0,40}?\)\.filter\(function\(c\)\{return c\.schedule_kind!=='one_off';\}\)\.length/.test(html));
check('일회성 수업은 접히지 않고 그려진다',
  /return !tooMany \|\| c\.schedule_kind==='one_off';/.test(html));
check('안내문이 «반복 수업만 숨겼다» 고 정확히 말한다',
  /반복 수업은 표시하지 않았습니다/.test(html) && /일회성 수업<\/b>은 그대로 보입니다/.test(html));
check('레벨테스트 수업은 한눈에 구분된다', /c\.class_type==='level_test'/.test(html));
check('수업 칩 툴팁에 수업 번호가 있다 (#852 를 눈으로 대조)', /'수업 #'\)\+c\.id|'수업 #'\+c\.id/.test(html));

console.log('\n[ ⑤ 필리핀 강사·매니저도 읽을 수 있어야 한다 (한/영 둘 다) ]');
check('달력 안내·툴팁이 화면 언어를 따른다 (calEn)', /function calEn\(\)\s*\{\s*return !!\(window\.adminLang/.test(html));
check('«왜 안 보이는지» 안내가 영어로도 나온다',
  /recurring classes<\/b> this month/.test(html) && /recurring classes are hidden/.test(html));
check('수업 칩 툴팁이 영어로도 나온다', /calEn\(\)\?'Class #':'수업 #'/.test(html));
check('레벨테스트 칩 툴팁이 영어로도 나온다', /Wish date only — no class yet/.test(html));
check('범례(색이 무슨 뜻인지)가 영어로도 나온다',
  /data-en="KR holiday"/.test(html) && /data-en="PH holiday"/.test(html) && /data-en="Teacher vacation"/.test(html));
check('배지 툴팁이 영어로도 나온다', /Open this class on the calendar/.test(core));
check('통합 캘린더 설명 영문이 옛 내용(휴가 전용)으로 남아 있지 않다',
  !/data-en="💡 Register teacher vacations and KR\/PH holidays/.test(html));

console.log('\n[ ⑥ 캐시 — 고친 js 가 실제로 내려가야 한다 ]');
{
  const m = html.match(/adm-core\.js\?v=(\d+)/);
  check(`admin.html 이 adm-core.js 를 버전과 함께 부른다 (?v=${m ? m[1] : '없음'})`, !!m);
  check('버전이 36 이상 (이번 수정 반영)', !!m && Number(m[1]) >= 36);
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
