// -*- coding: utf-8 -*-
// 🙂 강사 «성향» 매칭 하니스 — 의존성 없음 · node 로 바로 실행
//   실행:  node test-harness/teacher_personality_match_harness.mjs
//   대상:  cloudflare-deploy/src/api-admin.ts                   (teacher_mbti.personality)
//          cloudflare-deploy/public/js/adm-r5.js                (관리자 입력 칩)
//          cloudflare-deploy/public/admin.html                  (칩 5개)
//          cloudflare-deploy/public/admin/weekly-schedule.html  (추천 반영)
//
//   무엇을 지키나 (2026-08-18 사장님 수정요청 #02 후속) —
//     #252 가 신규 학생 등록 마법사에 «원하는 선생님 성향» 을 넣었는데, 정작 **강사 쪽에
//     성향 자료가 없어서** 추천에는 못 쓰고 메모로만 남았다. 그 반쪽을 채운 것이 이 변경이다.
//     입력(관리자 MBTI 카드) → 저장(teacher_mbti.personality) → 사용(마법사 추천) 세 곳이
//     **같은 다섯 값**을 쓰고, 그 사슬이 한 군데라도 끊기면 조용히 «반영 안 됨» 이 된다.
//
//   ⚠️ 이 하니스가 실제로 잡은 사고 두 개 (2026-08-18) —
//      ① 점수를 «더하기» 로 넣었더니 아무 효과가 없었다. 시간 점수가 곧바로 100 에 닿아서
//         무엇을 더해도 다시 100 이었다(세 강사가 전부 100%). → 가중평균으로 바꿨다.
//      ② 성향을 fetch 로 받는데 «불렀는지» 를 boolean 으로 기억해서, 두 번째 호출이 첫 fetch 를
//         안 기다리고 즉시 넘어갔다. 4단계가 성향 없는 순서로 그려졌다. → promise 를 기억한다.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = p => readFileSync(resolve(__dir, '..', p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name); }
};

const aapi = R('cloudflare-deploy/src/api-admin.ts');
const r5 = R('cloudflare-deploy/public/js/adm-r5.js');
const html = R('cloudflare-deploy/public/admin.html');
const wiz = R('cloudflare-deploy/public/admin/weekly-schedule.html');

const IDS = ['kind', 'fun', 'edu', 'serious', 'laugh'];

console.log('\n════ 🙂 강사 성향 매칭 ════');

console.log('\n[ A. 다섯 값이 세 곳에서 같다 ]');
/* 값이 어긋나면(예: 화면 'warm' · 서버 'kind') 저장은 되는데 매칭에서 영영 안 걸린다.
   조용히 «성향을 골라도 아무 일도 안 일어남» 이 되므로 세 곳을 함께 본다. */
check('서버 정본 PERSONALITY_IDS 가 다섯 개다',
  new RegExp("PERSONALITY_IDS = \\['" + IDS.join("', '") + "'\\]").test(aapi));
check('관리자 카드 칩이 다섯 개다', IDS.every(id => new RegExp('data-pid="' + id + '"').test(html)));
check('마법사 WIZ_PERSONALITY 가 같은 다섯 개다', IDS.every(id => new RegExp("id:'" + id + "'").test(wiz)));

console.log('\n[ B. 저장된다 ]');
check('teacher_mbti 에 personality 칸을 멱등 ALTER 로 붙인다',
  /ALTER TABLE teacher_mbti ADD COLUMN personality TEXT/.test(aapi));
/* 🪤 CREATE 문에 넣으면 schema_drift 하니스가 «운영 실제에 없는 CREATE 컬럼» 으로 막는다 */
check('🔴 CREATE 문에는 넣지 않았다 (schema_drift 회피)',
  !/CREATE TABLE IF NOT EXISTS teacher_mbti \([^)]*personality/.test(aapi));
check('모르는 값은 버린다 (오타가 저장되면 매칭에서 영영 안 걸린다)',
  /PERSONALITY_IDS\.includes\(k\)/.test(aapi));
check('저장 API 가 personality 를 받는다',
  /const pers = normPersonality\(b\.personality\)/.test(aapi) &&
  /personality = excluded\.personality/.test(aapi));
check('목록 API 가 personality 를 내려준다',
  /SELECT teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url, personality FROM teacher_mbti/.test(aapi));
check('관리자 화면이 고른 성향을 보낸다', /personality: persGet\(\)/.test(r5));
check('강사 목록 표에 성향 칸이 있다', /persLabel\(t\.personality\)/.test(r5));

console.log('\n[ C. 추천에 실제로 반영된다 ]');
const wb = wiz.slice(wiz.indexOf('function wizBuildMatches'), wiz.indexOf('function computeMatches'));
check('추천 계산이 성향을 본다', /persOverlap\(t,s\.personality\)/.test(wb));
/* 🪤 ① 더하기로 넣으면 아무 효과가 없다 — 시간 점수가 이미 100 이라 다시 100 이 된다. */
check('🔴 가중평균으로 섞는다 (더하기 금지 — 시간 점수가 100 에 닿아 묻힌다)',
  /Math\.round\(timeScore\*0\.7\+persPct\*0\.3\)/.test(wb) &&
  !/Math\.min\(100,timeScore\+persScore\)/.test(wb));
check('🔴 성향을 안 골랐으면 예전 점수 그대로다', /pm\.of\?Math\.round\(timeScore\*0\.7\+persPct\*0\.3\):timeScore/.test(wb));
check('성향은 시간이 맞는 강사 안에서만 겨룬다 (빈 슬롯 0이면 후보에서 빠진다)',
  /if\(!openSlots\.length\)return;/.test(wb));

console.log('\n[ D. 이름 붙이기 ]');
/* teacher_mbti 는 «Teacher Kes», teachers 는 «KES» 로 이름 체계가 다르고 id 는 키 공간이 아예 다르다.
   2026-08-18 실측: 아래 정규화로 등록된 19명 전원이 붙는다. 이걸 지우면 성향이 통째로 안 걸린다. */
check('🔴 이름을 정규화해서 붙인다 (Teacher/HT 접두어·대소문자·공백)',
  /replace\(\/\^HT\\s\+\/,''\)\.replace\(\/\^TEACHER\\s\+\/,''\)/.test(wiz));
check('영문 이름으로도 한 번 더 찾는다', /TEACHER_PERS\[persNormName\(teacher\.name_en\)\]/.test(wiz));

console.log('\n[ E. 늦게 오는 자료 ]');
/* 🪤 ② «불렀는지» 를 boolean 으로 기억하면 두 번째 호출이 첫 fetch 를 안 기다린다.
      4단계가 성향 없는 순서로 그려지고, 사람은 그 틀린 순서를 보고 고른다. */
check('🔴 약속(promise)을 기억한다 (boolean 금지)',
  /if\(_persPromise\)return _persPromise;/.test(wiz) && !/var _persLoaded=false;/.test(wiz));
check('성향이 도착하면 추천을 다시 그린다',
  /loadTeacherPersonality\(\)\.then\(function\(\)\{[\s\S]{0,220}computeMatches\(\)/.test(wiz));
check('마법사를 열 때 미리 받아 둔다', /loadTeacherPersonality\(\);\s*\/\/ 🙂/.test(wiz));

console.log('\n[ F. 계산이 한 곳이다 ]');
/* 예전에는 computeMatches() 와 wizPickMatch() 가 같은 계산을 각자 복사해 갖고 있었다.
   한쪽만 고치면 «화면의 1등» 과 «클릭했을 때 잡히는 1등» 이 갈려 엉뚱한 강사가 배정된다. */
check('🔴 추천 계산이 wizBuildMatches() 한 곳이다',
  (wiz.match(/function wizBuildMatches/g) || []).length === 1 &&
  /wizState\.chosenMatch=wizBuildMatches\(\)\[i\]/.test(wiz));
check('🔴 wizPickMatch 안에 계산 복사본이 없다',
  !/function wizPickMatch[\s\S]{0,900}hourHasSlot\(/.test(wiz));

console.log(`\n  ── PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) { console.log('\n  실패:'); for (const f of FAILS) console.log('   · ' + f); }
process.exit(FAIL ? 1 : 0);
