// -*- coding: utf-8 -*-
// 🏫🎥 공용방 녹화 참가자 채우기 하네스 (2026-08-12)
//   실행: node test-harness/shared_room_recording_participants_harness.mjs
//
//   무엇을 지키는가 — /api/recordings/start 가 공용방(mangoi-class)에서 참가자 계정을
//   attendance 로 채울 때 쓰는 «세 조건 + 임시번호 거르기» 이다.
//
//   🔑 이건 편의 기능이 아니라 **개인정보 경계**다. 조건이 하나라도 느슨해지면
//      앞 수업 학생이 다음 수업 녹화의 참가자로 붙는다. participant_ids 는 곧
//      재생 권한이므로(recordings-r2.ts: uid ∈ participant_ids 면 재생 허용),
//      그 순간 **남의 아이 수업 영상이 보인다.**
//
//   [실측 근거 — 왜 이 조건이어야 했나 · 운영 D1 2026-08-12]
//     · 공용방 recordings 1,329건(전체 1,552건의 86%)
//     · attendance 로 잇되 «시간 겹침 3분» 으로 느슨하게 재면 1,359건 중 1,122건이
//       학생 2명 이상에 걸렸다 → 한 녹화에 아이디 9개가 붙는 경우까지 나왔다
//     · left_at 은 못 믿는다 — 공용방 학생 1,583행 중 272행이 미기록, 최장 세션 15일
//     · 하트비트 90초 + 미퇴장 + 이미입장 으로 조이면 317건 전부 계정 1~5개(평균 2.33)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };
const src = rd('../cloudflare-deploy/src/api-mango.ts');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (n, c, x) => {
  if (c) PASS++; else { FAIL++; FAILS.push(n); }
  console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x !== undefined ? '  → ' + JSON.stringify(x) : ''}`);
};

// 공용방 채우기 블록만 잘라낸다 — 다른 곳의 attendance 조회에 걸리지 않게.
const i0 = src.indexOf('공용방 참가자 채우기 실패');
const blockStart = src.lastIndexOf('if (!schedMatch)', i0);
const BLOCK = (blockStart >= 0 && i0 > blockStart) ? src.slice(blockStart, i0) : '';

console.log('\n[ 공용방 참가자 채우기가 살아 있는가 ]');
check('스케줄 없는 방(공용방)에서 도는 분기가 있다', BLOCK.length > 0);
check('attendance 에서 읽는다', /FROM\s+attendance/i.test(BLOCK));

console.log('\n[ 🔒 «지금 이 방에 있는 사람» 세 조건 — 하나라도 빠지면 남이 섞인다 ]');
check('① 하트비트 신선도: last_seen_at >= (기준시각 - FRESH_MS)',
  /last_seen_at\s*>=\s*\?/.test(BLOCK) && /FRESH_MS/.test(BLOCK));
check('① 하트비트 창이 90초 이하다 (주기 30초 × 3)',
  (() => { const m = /FRESH_MS\s*=\s*(\d+)\s*\*\s*1000/.exec(BLOCK); return !!m && Number(m[1]) <= 90; })(),
  (/FRESH_MS\s*=\s*([^;]+);/.exec(BLOCK) || [])[1]);
check('② 아직 안 나갔다: left_at IS NULL OR left_at >= 기준시각',
  /left_at\s+IS\s+NULL\s+OR\s+left_at\s*>=\s*\?/i.test(BLOCK));
check('③ 이미 들어와 있다: joined_at <= 기준시각',
  /joined_at\s*<=\s*\?/.test(BLOCK));
check('🚫 last_seen_at 이 없는 옛 행은 쓰지 않는다',
  /last_seen_at\s+IS\s+NOT\s+NULL/i.test(BLOCK));

console.log('\n[ 🆔 «계정» 아이디만 참가자로 넣는다 — 여기가 이 수정의 핵심이다 ]');
/* 🪤 처음엔 attendance.user_id 를 계정으로 알고 그걸 넣었다. 아니었다.
      user_id 는 로그인해도 브라우저 localStorage 의 기기 식별자(`u_`+난수)가 오고,
      로그인 안 하면 접속마다 바뀌는 번호가 온다. 실측으로 한 기기 값(u_zfak0wl7r4)이
      두 계정(student·mangoi_155)에 걸쳐 있었다 — 같은 PC 를 두 사람이 썼다.
      그 값을 넣으면 학생 로그인과 영영 안 맞아 목록·재생·동의 어느 것도 안 붙는다. */
check('account_uid 를 읽는다', /SELECT\s+DISTINCT\s+account_uid/i.test(BLOCK));
check('🚫 user_id(기기 식별자)를 참가자로 넣지 않는다',
  !/participantIds\.push\(\s*[^)]*user_id/i.test(BLOCK) && !/r\.user_id/.test(BLOCK));
check('이름은 그대로 남긴다 (로그인 안 한 참가자는 이름밖에 없다)',
  /participantNames\.push\(unm\)/.test(BLOCK));

console.log('\n[ 🆔 attendance 가 계정 아이디를 실제로 받아 적는가 ]');
const attnJoin = src.slice(src.indexOf("'/api/attendance/join'"), src.indexOf("'/api/attendance/join'") + 2600);
check('INSERT 에 account_uid 칸이 있다', /INSERT INTO attendance[\s\S]{0,200}account_uid/i.test(attnJoin));
check('요청 본문의 account_uid 를 바인딩한다', /b\.account_uid/.test(attnJoin));
check('🔒 기존 user_id 컬럼은 그대로 둔다 (출석·발화시간 집계가 여기 이어져 있다)',
  /INSERT INTO attendance \(room_id, user_id, account_uid/.test(attnJoin));
check('컬럼이 없는 배포본 대비 ALTER 폴백이 있다',
  /ALTER TABLE attendance ADD COLUMN account_uid TEXT/.test(attnJoin));

console.log('\n[ 🛑 동의 없으면 녹화하지 않는다 (2026-08-12 사장님 결정) ]');
const consentJs = rd('../cloudflare-deploy/public/js/mango-consent.js');
check('녹화 시작이 consent_required 로 거절될 수 있다', /error:\s*'consent_required'/.test(src));
check('강사는 동의 대상에서 뺀다 (촬영 주체다)', /id\s*!==\s*teacherId/.test(src));
check('임시번호는 «미동의» 로 세지 않는다 (한 명만 있어도 수업 녹화가 통째로 멈춘다)',
  /_looksEphemeral\(String\(id\)\)/.test(src));
check('동의 창 파일이 있다', consentJs.length > 0);
check('학생 화면이 동의를 서버에 남긴다', /fetch\('\/api\/consents'/.test(consentJs) && /method:\s*'POST'/.test(consentJs));
check('🚪 동의하지 않아도 수업 입장은 막지 않는다 (막으면 사실상 강요다)',
  !/return\s*;/.test((/mangoConsentEnsure[\s\S]{0,400}/.exec(consentJs) || [''])[0].split('\n').filter(l => /입장|join/.test(l)).join('\n')));
check('한 번만 묻는다 (이미 답이 있으면 다시 안 묻는다)',
  /askedBefore\(uid\)/.test(consentJs) && /fetchExisting\(uid\)/.test(consentJs));
check('한/영 둘 다 있다', /I agree/.test(consentJs) && /동의합니다/.test(consentJs));
check('언어 판정은 getLang() 으로 한다 (인라인 currentLang 은 🌐 를 안 따라온다)',
  /getLang\s*===\s*'function'|typeof window\.getLang/.test(consentJs));

console.log('\n[ 🚪 학생이 동의를 «남길 수» 있는가 — 여기가 막히면 녹화가 통째로 멈춘다 ]');
/* 🔴 실제로 겪었다(2026-08-12). /api/consents 가 index.ts 의 관리자 전용 목록에 통째로 들어 있어
      학생 화면이 401 을 받았다. 그래서 consents 가 0행이었고, 그 상태로 「동의 없으면 녹화 안 함」을
      켜니 라이브에서 녹화가 거절되기 시작했다. 게이트와 기능이 서로 반대를 보고 있었던 것이다. */
const idxSrc = rd('../cloudflare-deploy/src/index.ts');
check('POST /api/consents 는 관리자 전용이 아니다 (본인이 남기는 쓰기)',
  /path === '\/api\/consents' && method !== 'POST'/.test(idxSrc));
check('POST /api/consents/withdraw 도 열려 있다 (철회는 학생의 권리)',
  /method === 'POST' && path === '\/api\/consents\/withdraw'/.test(idxSrc));
check('GET /api/consents/<uid> 는 열되 핸들러가 «관리자 또는 본인» 으로 막는다',
  /method !== 'GET'/.test(idxSrc) && /resolveOwnerScope\(request, url, env as any, userId\)/.test(src));
check('동의 창이 본인확인 토큰을 보낸다 (없으면 내 동의도 못 읽는다)',
  /Authorization/.test(consentJs) && /Bearer/.test(consentJs));
check('토큰을 URL 쿼리에 싣지 않는다 (프록시·로그·리퍼러에 남는다)',
  !/\?token=/.test(consentJs));

console.log('\n[ 🔐 동의를 남의 이름으로 만들 수 없다 ]');
check('동의 저장에 본인확인이 걸려 있다',
  /'\/api\/consents' && method === 'POST'[\s\S]{0,700}_attnSoftAuthOk/.test(src));
check('동의 철회에도 본인확인이 걸려 있다',
  /'\/api\/consents\/withdraw'[\s\S]{0,400}_attnSoftAuthOk/.test(src));

console.log('\n[ 기존 «스케줄 방» 경로를 건드리지 않았다 ]');
check('class-<id>- 경로는 그대로 있다', /\/\^class-\(\\d\+\)-\//.test(src));
check('공용방 채우기는 스케줄이 없을 때만 돈다', /if\s*\(!schedMatch\)/.test(src));
check('실패해도 녹화는 시작된다 (try 로 감쌌다)',
  /try\s*\{[\s\S]*공용방 참가자 채우기 실패/.test(src) || /공용방 참가자 채우기 실패/.test(src) && /catch/.test(BLOCK + src.slice(i0, i0 + 200)));

console.log('\n────────────────────────────────');
console.log(`총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패:'); FAILS.forEach((f) => console.log('  - ' + f)); }
process.exit(FAIL === 0 ? 0 : 1);
