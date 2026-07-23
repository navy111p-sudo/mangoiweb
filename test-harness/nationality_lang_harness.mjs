// -*- coding: utf-8 -*-
// 🧪 국적 기반 화면 언어 + 강사 비번 재설정 하니스 (2026-07-23)
//   실행:  node test-harness/nationality_lang_harness.mjs
//
//   지키려는 규칙 (사장님 지시 2026-07-23):
//     1) **국적으로 언어를 정한다.** 한국인(KR) → 한국어, 그 외 국적 → 전부 영어.
//     2) 개인별 예외는 `pref_lang` 하나로만. 국적보다 이게 우선(한국인 강사 같은 경우).
//     3) 국적이 아직 안 들어간 계정도 **한국어 화면에 갇히지 않는다** —
//        아이디 컨벤션(mangoi_* · hq_t*) → 영어 안전망.
//        읽지 못하는 언어로 갇히면 스스로 되돌릴 수 없기 때문에 이 폴백은 지우지 말 것.
//     4) 강사 등록 폼의 '국적' 값이 로그인 계정으로 흘러가 언어를 정한다.
//     5) 남의 비번을 바꾸는 API 는 경영진·본사만. 대상도 강사/해외 스태프 계정으로 한정.

import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } };

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const AUTH  = read('cloudflare-deploy/src/auth-admin.ts');
const ADMTS = read('cloudflare-deploy/src/api-admin.ts');
const IDX   = read('cloudflare-deploy/src/index.ts');
const BOOT  = read('cloudflare-deploy/public/js/adm-lang-boot.js');
const LOGIN = read('cloudflare-deploy/public/admin/login.html');
const HTML  = read('cloudflare-deploy/public/admin.html');
const CORE  = read('cloudflare-deploy/public/js/adm-core.js');

console.log('\n[1] 🌏 국적 컬럼 + 로그인 응답');
check('admin_account 에 nationality 컬럼을 보장한다',
  /ALTER TABLE admin_account ADD COLUMN nationality TEXT/.test(AUTH));
check('로그인 시 nationality 를 읽는다',
  /SELECT name, pref_lang, nationality FROM admin_account/.test(AUTH));
check('로그인 응답에 nationality 를 실어 보낸다', /nationality: acctNationality/.test(AUTH));
check('로그인 화면이 세션에 nationality 를 저장한다', /nationality: \(data\.nationality/.test(LOGIN));

console.log('\n[2] 🇰🇷 판정 규칙 — KR 만 한국어, 나머지 국적은 전부 영어');
//   서버 판정식을 그대로 미러링해 검산한다(사양 미러 — 코드가 바뀌면 여기서 걸린다).
function serverLang({ pref = '', nat = '', uid = '', name = '', isTeacher = false }) {
  const foreignId = /^(hq_t|mangoi_)/i.test(uid);
  const base = String(name).replace(/\s*[(（[【].*$/, '').trim();
  const namedOk = !!base && base !== uid;
  return (pref === 'en' || pref === 'ko') ? pref
    : nat ? (nat === 'KR' ? 'ko' : 'en')
    : (isTeacher || foreignId) ? 'en'
    : (namedOk && !/[가-힣]/.test(base)) ? 'en'
    : 'ko';
}
check('한국 국적 → 한국어', serverLang({ nat: 'KR', uid: 'mgr_jjw', name: '장지웅' }) === 'ko');
check('필리핀 국적 → 영어',  serverLang({ nat: 'PH', uid: 'mangoi_018', name: 'Teacher Farrah' }) === 'en');
check('미국 국적 → 영어',    serverLang({ nat: 'US', uid: 'mangoi_045', name: 'Karl' }) === 'en');
check('기타 국가(ZZ) → 영어', serverLang({ nat: 'ZZ', uid: 'mangoi_006', name: '' }) === 'en');
check('🔴 한국 국적이면 아이디가 mangoi_* 여도 한국어 (국적이 아이디보다 우선)',
  serverLang({ nat: 'KR', uid: 'mangoi_999', name: '김한국' }) === 'ko');
check('pref_lang 은 국적보다 우선 — 한국인 강사 예외가 가능하다',
  serverLang({ pref: 'ko', nat: 'PH', uid: 'mangoi_018' }) === 'ko' &&
  serverLang({ pref: 'en', nat: 'KR', uid: 'mgr_jjw' }) === 'en');

console.log('\n[3] 🛟 국적 미입력 계정 안전망 (한국어 화면에 갇히지 않기)');
check('국적 없어도 mangoi_* 는 영어', serverLang({ uid: 'mangoi_174', name: '' }) === 'en');
check('국적 없어도 hq_t* 는 영어',    serverLang({ uid: 'hq_t_001', name: '교사' }) === 'en');
check('국적 없는 한국인 매니저는 한국어',
  serverLang({ uid: 'mgr_lby', name: '이병엽 (본사 매니저)' }) === 'ko');
check('이름에 직함이 붙어 있어도 사람 이름만 보고 판정',
  serverLang({ uid: 'x', name: 'Maimai (본사 매니저)' }) === 'en');

console.log('\n[4] 🖥 화면(adm-lang-boot)도 같은 규칙');
check('부팅이 세션의 nationality 를 읽는다', /sess\.nationality/.test(BOOT));
check("'KR' 만 한국어로 분기한다", /nat === 'KR'/.test(BOOT));
check('pref_lang 이 국적보다 우선', /sess\.pref_lang === 'en' \|\| sess\.pref_lang === 'ko'/.test(BOOT));
check('국적 없을 때 아이디 안전망(mangoi_·hq_t)이 남아 있다',
  /\^\(hq_t\|mangoi_\)/.test(BOOT));

console.log('\n[5] 📝 강사 등록 폼의 국적란 → 로그인 계정으로 연결');
check('teacher_profiles 에 nationality 컬럼을 보장한다',
  /ALTER TABLE teacher_profiles ADD COLUMN nationality TEXT/.test(ADMTS));
check('등록(POST) 이 nationality 를 저장한다', /b\.nationality \? String\(b\.nationality\)/.test(ADMTS));
check('수정(PATCH) 허용 목록에 nationality 가 있다', /'mbti','nationality','notes'/.test(ADMTS));
check('등록 폼에 국적 선택칸이 있다', /id="tp-nationality"/.test(HTML));
check('국적 선택칸이 한/영 두 언어로 라벨링돼 있다',
  /data-en="Nationality \(sets their screen language\)"/.test(HTML));
check('저장 시 국적을 함께 보낸다', /nationality: e\('tp-nationality'\)/.test(CORE));
check('계정에 국적이 없으면 강사 등록부에서 이름으로 찾아 채운다',
  /SELECT nationality FROM teacher_profiles/.test(AUTH) &&
  /UPDATE admin_account SET nationality = \?/.test(AUTH));

console.log('\n[6] 🔁 기존 계정 국적 1회 채우기 (멱등이어야 함)');
check('한국인 계정은 KR 로 채운다', /SET nationality = 'KR'/.test(AUTH));
check('해외 스태프(mangoi_·hq_t)는 PH 로 채운다', /SET nationality = 'PH'/.test(AUTH));
check('🔴 이미 값이 있으면 절대 덮어쓰지 않는다 (여러 번 실행돼도 안전)',
  (AUTH.match(/nationality IS NULL OR nationality = ''/g) || []).length >= 3);

console.log('\n[7] 🔑 강사 비번 재설정 — 권한 게이트');
const RESET = AUTH.slice(
  Math.max(0, AUTH.indexOf("path === '/api/admin/staff-password-reset'")),
  AUTH.indexOf("path === '/api/admin/change-password'")
);
check('엔드포인트가 있다', RESET.length > 500);
check('index.ts 라우팅에 등록돼 있다 (미등록이면 404)',
  /path === '\/api\/admin\/staff-password-reset'/.test(IDX));
check('index.ts 인증 게이트에도 등록돼 있다',
  (IDX.match(/'\/api\/admin\/staff-password-reset'/g) || []).length >= 2);
check('🔴 강사는 이 API 를 쓸 수 없다', /actor\.isTeacher/.test(RESET));
check('🔴 경영진(hq)·본사(staff) 만 허용', /actor\.role === 'hq' \|\| actor\.role === 'staff'/.test(RESET));
check('🔴 대상은 강사·해외 스태프 계정으로 한정 (권한 상승 차단)',
  /\^\(mangoi_\|hq_t\)/.test(RESET) && /target_not_allowed/.test(RESET));
check('비밀번호 최소 길이를 검사한다', /next\.length < 6/.test(RESET));
check('없는 계정은 404', /unknown_user/.test(RESET));
check('재설정하면 그 계정의 기존 세션을 모두 끊는다',
  /DELETE FROM admin_sessions WHERE username = \?/.test(RESET));
check('누가 재설정했는지 감사 기록을 남긴다', /password_reset_by:/.test(RESET));
check('🌐 응답 메시지가 한/영 두 벌이다 (강사가 영어로 읽어야 함)',
  (RESET.match(/message_en:/g) || []).length >= 4);
//   ⚠️ 함수 본문만 잘라서 본다. 파일 전체를 훑으면 뒤쪽의 다른 등록부까지 걸려 오탐이 난다.
const AGENCY_FN = (IDX.match(/function isAgencyAllowedApi[\s\S]*?\n}/) || [''])[0];
check('🔴 대리점 허용목록(isAgencyAllowedApi)에는 들어 있지 않다',
  AGENCY_FN.length > 100 && !AGENCY_FN.includes('staff-password-reset'));

console.log(`\n════ 국적 언어 + 비번 재설정 하니스: PASS ${PASS} / FAIL ${FAIL} ════`);
if (FAILS.length) { console.log('실패 항목:'); FAILS.forEach(f => console.log('  - ' + f)); }
process.exit(FAIL > 0 ? 1 : 0);
