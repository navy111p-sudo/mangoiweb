// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   ☑ 「오늘 수업」 고른 학생에게 한 번에 메시지 (2026-11-11 매니저 «Select All» 제안)

   [무엇을] js/adm-today-classes.js 의 tcSelKey·tcMsgable·tcMsgTargets·tcFillMsg·tcSendMsgs 를
            중괄호 짝으로 오려 내 가짜 fetch 로 «실제로» 돌린다.
     ① 누구에게 가나 — 고른 줄만 · 옮긴 줄 빼기 · 같은 학생 한 번만 (짝: «고르면 간다»)
     ② 글 채우기 — {name}·{time}·{teacher} 가 학생마다 바뀐다, 값 없으면 빈칸도 지운다
     ③ 보내기 — 한 명씩 차례로, 한 명이 실패해도 나머지는 계속, 실패를 «보냄» 으로 안 센다
     ④ 배선 — 전체 선택 칸·일괄 버튼·📩 칩이 같은 규칙(tcMsgable)을 쓴다
   화면 확인: node test-harness/manual/today-classes-bulk-message-browser.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(process.env.TC_SRC || join(ROOT, 'cloudflare-deploy', 'public', 'js', 'adm-today-classes.js'), 'utf8');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (extra ? '  → ' + extra : '')); }
};
function fnSrc(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}
const NAMES = ['tcSelKey', 'tcMsgable', 'tcMsgTargets', 'tcFillMsg', 'tcSendMsgs'];
const parts = NAMES.map(n => fnSrc(SRC, n));
ok('필요한 함수를 전부 오려 냈다 (전제)', parts.every(Boolean), NAMES.filter((n, i) => !parts[i]).join(','));

const make = fetchImpl => new Function('fetch', 'T',
  parts.join('\n') + '\nreturn { tcSelKey, tcMsgable, tcMsgTargets, tcFillMsg, tcSendMsgs };')(fetchImpl, (ko) => ko);

console.log('\n① 누구에게 가나');
const m = make(() => Promise.reject(new Error('안 불려야 함')));
const R = [
  { student_uid: 'a1', student_name: '가', teacher_name: 'KAYE', start_time: '20:00', start_ts: 1 },
  { student_uid: 'b2', student_name: '나', teacher_name: 'KAYE', start_time: '20:20', start_ts: 2 },
  { student_uid: 'a1', student_name: '가', teacher_name: 'KAYE', start_time: '21:00', start_ts: 3 },   // 같은 학생 두 번째 수업
  { student_uid: 'c3', student_name: '다', teacher_name: 'KAYE', start_time: '21:30', start_ts: 4, moved_away: true },
  { student_uid: '', student_name: '아이디없음', start_ts: 5 },
];
const all = {}; R.forEach(s => { all[m.tcSelKey(s)] = 1; });
const t1 = m.tcMsgTargets(R, all);
ok('전부 고르면 a1·b2 두 명 (같은 학생은 한 번 · 옮긴 줄·아이디 없는 줄 빼기)', JSON.stringify(t1.map(t => t.uid)) === '["a1","b2"]', JSON.stringify(t1));
ok('   같은 학생이면 «첫 줄» 시각으로 안내', t1[0].time === '20:00', t1[0].time);
ok('안 고르면 0명 (짝)', m.tcMsgTargets(R, {}).length === 0);
const one = {}; one[m.tcSelKey(R[1])] = 1;
ok('하나만 고르면 그 한 명만', JSON.stringify(m.tcMsgTargets(R, one).map(t => t.uid)) === '["b2"]');
ok('선택 열쇠는 수업 시각까지 — 같은 학생 다른 수업은 다른 열쇠', m.tcSelKey(R[0]) !== m.tcSelKey(R[2]));
ok('옮긴 줄은 보낼 수 없다 / 보통 줄은 보낼 수 있다 (짝)', !m.tcMsgable(R[3]) && m.tcMsgable(R[0]));

console.log('\n② 글 채우기');
const tpl = '[망고아이] {name} 학생, 오늘 {time} 수업 안내입니다.\n{teacher} 선생님께 문제가 생겼습니다.';
ok('이름·시각·강사가 그 학생 값으로', m.tcFillMsg(tpl, { name: '가', time: '20:00', teacher: 'KAYE' })
  === '[망고아이] 가 학생, 오늘 20:00 수업 안내입니다.\nKAYE 선생님께 문제가 생겼습니다.');
ok('값이 없으면 뒤 빈칸까지 지운다 («오늘  수업» 이 안 된다)', m.tcFillMsg(tpl, { name: '가', time: '', teacher: '' })
  === '[망고아이] 가 학생, 오늘 수업 안내입니다.\n선생님께 문제가 생겼습니다.');
ok('자리표가 없는 글은 그대로 (1명 창에서 미리 채운 글)', m.tcFillMsg('그냥 글', { name: 'x' }) === '그냥 글');

console.log('\n③ 보내기');
{
  const calls = [];
  let live = 0, maxLive = 0;
  const fake = (url, o) => {
    const b = JSON.parse(o.body); calls.push(b);
    live++; maxLive = Math.max(maxLive, live);
    const reply = b.user_id === 'b2' ? { status: 200, j: { ok: true, status: 'failed', detail: '문자: 보낼 번호가 없습니다' } }
      : b.user_id === 'x9' ? null
      : { status: 200, j: { ok: true, status: 'sent', detail: '문자 발송 → ***1234' } };
    return new Promise((res, rej) => setTimeout(() => {
      live--;
      if (!reply) return rej(new Error('offline'));
      res({ ok: reply.status < 400, status: reply.status, json: () => Promise.resolve(reply.j) });
    }, 5));
  };
  const s = make(fake);
  const steps = [];
  const res = await s.tcSendMsgs(
    [{ uid: 'a1', name: '가', time: '20:00', teacher: 'KAYE' }, { uid: 'b2', name: '나', time: '20:20', teacher: 'KAYE' }, { uid: 'x9', name: '라', time: '', teacher: '' }],
    '{name} 학생 {time} 안내', true, true, (i, n) => steps.push(i + '/' + n));
  ok('세 명 모두에게 요청했다 (한 명 실패해도 계속)', calls.length === 3, calls.length);
  ok('   한 번에 하나씩 (동시에 몰지 않는다)', maxLive === 1, 'max ' + maxLive);
  ok('   학생마다 자기 글', calls[0].message === '가 학생 20:00 안내' && calls[2].message === '라 학생 안내', JSON.stringify(calls.map(c => c.message)));
  ok('   서버 정본 class_notice 로 · 푸시/문자 고른 값 그대로', calls.every(c => c.action_type === 'class_notice' && c.push === true && c.sms === true));
  ok('   진행 표시 1/3 → 3/3', steps.join(',') === '1/3,2/3,3/3', steps.join(','));
  ok('결과: 보냄 1 · 못 보냄 2 (닿지 않음·통신 오류를 «보냄» 으로 안 센다)',
    JSON.stringify(res.map(r => r.ok)) === '[true,false,false]', JSON.stringify(res.map(r => r.ok)));
  ok('   못 보낸 이유를 그대로 말한다', /보낼 번호가 없습니다/.test(res[1].why) && /offline/.test(res[2].why), res.map(r => r.why).join(' | '));
}
{
  const s = make(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ ok: false, error: 'hq_only' }) }));
  const res = await s.tcSendMsgs([{ uid: 'a1', name: '가' }], '안내', true, false);
  ok('403(권한 없음)은 실패로 말한다', res.length === 1 && !res[0].ok && /hq_only/.test(res[0].why), JSON.stringify(res));
}

console.log('\n④ 배선');
ok('📩 칩도 같은 규칙(tcMsgable)을 쓴다', /if \(tcMsgable\(s\) && tcCanMessage\(\)\)/.test(SRC));
ok('전체 선택 칸이 있다', SRC.includes('id="tc-sel-all"'));
ok('   th·td 가 같은 조건(selCol)으로 짝지어 그려진다', /\(selCol \? '<th/.test(SRC) && /\(selCol \? '<td/.test(SRC));
ok('일괄 버튼은 «보이는 줄» 에서 대상을 뽑는다', /tcMsgTargets\(rows, _tcSel\)/.test(fnSrc(SRC, 'render')));
ok('여러 명이면 보내기 전에 한 번 더 묻는다', /targets\.length > 1 && !confirm\(/.test(SRC));
ok('보낸 뒤엔 «못 보낸 학생만» 다시 — 같은 문자 두 번 방지', /targets = bad\.map/.test(SRC));
// Codex P2 — 창 안 지역 변수면 «닫고 다시 열기» 로 두 묶음이 겹친다. 깃발은 창 밖(모듈)에.
const modal = fnSrc(SRC, 'tcOpenMsgModal');
ok('보내는 중 깃발이 창 밖에 있다 (닫았다 열어도 겹쳐 보내지 않는다)',
  /\n  var _tcMsgBusy = false;/.test(SRC) && /if \(_tcMsgBusy\)/.test(modal) && !/var busy\b/.test(modal));

console.log('\n════════════════════════════════════════════');
console.log(`  ${FAIL ? "⚠" : "✅"} PASS ${PASS} / FAIL ${FAIL}`);
console.log('════════════════════════════════════════════');
process.exit(FAIL ? 1 : 0);
