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

console.log('\n[ 🚮 임시 접속번호 거르기 ]');
const rxm = /\/\^\[a-z0-9\]\{(\d+),\}\$\//.exec(BLOCK);
check('임시번호 판정 정규식이 있다', !!rxm, BLOCK.match(/looksEphemeral[^\n]*/)?.[0]);
check('걸러진 것만 «빼고», 이름은 그대로 남긴다 (표시이름은 사람이 읽는 값)',
  /!looksEphemeral\s*&&/.test(BLOCK) && /participantNames\.push\(unm\)/.test(BLOCK));

if (rxm) {
  const rx = new RegExp(`^[a-z0-9]{${rxm[1]},}$`);
  console.log('\n[ 판정을 실제 값으로 돌려 본다 (운영 D1 에서 뽑은 실물) ]');
  // 임시번호 — 접속마다 새로 생긴다. 어떤 로그인 토큰과도 안 맞는다.
  for (const e of ['oucdtt8rwg63yjr4rdhe9', 'gz3iqyk6kcd3euyr2kh3gj', '4asz3a0amrku7nj4z3qpme'])
    check(`임시번호는 뺀다: ${e}`, rx.test(e));
  // 계정 아이디 — 이게 빠지면 학생이 자기 녹화를 못 본다(고치려던 문제 그 자체).
  for (const a of ['u_kdoj4an523', 'u_zfak0wl7r4', 'u_prf59yuu9l', 'jeong', 'mangoi_155', 'navy111p'])
    check(`계정 아이디는 남긴다: ${a}`, !rx.test(a));
}

console.log('\n[ 기존 «스케줄 방» 경로를 건드리지 않았다 ]');
check('class-<id>- 경로는 그대로 있다', /\/\^class-\(\\d\+\)-\//.test(src));
check('공용방 채우기는 스케줄이 없을 때만 돈다', /if\s*\(!schedMatch\)/.test(src));
check('실패해도 녹화는 시작된다 (try 로 감쌌다)',
  /try\s*\{[\s\S]*공용방 참가자 채우기 실패/.test(src) || /공용방 참가자 채우기 실패/.test(src) && /catch/.test(BLOCK + src.slice(i0, i0 + 200)));

console.log('\n────────────────────────────────');
console.log(`총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패:'); FAILS.forEach((f) => console.log('  - ' + f)); }
process.exit(FAIL === 0 ? 0 : 1);
