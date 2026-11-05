import { fileURLToPath } from 'node:url';
// 🪙 A.i 말하기(웜업) 포인트 — 서버 판정·라우트 배선·화면 문구 (2026-11-03)
//   정본 src/warmup-points.ts 를 타입만 벗겨 «실제로» 돌리고, 화면 view() 를 오려 내 돌린다.
//   변이시험: WP_SRC=<고친 warmup-points.ts> · WPJS_SRC=<고친 js> · WPAPI_SRC=<고친 api-points.ts>
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const R = p => readFileSync(ROOT + p, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ FAIL ' + m); } };

const srcTs = process.env.WP_SRC ? readFileSync(process.env.WP_SRC, 'utf8') : R('cloudflare-deploy/src/warmup-points.ts');
let M = null;
try {
  const js = stripTypeScriptTypes(srcTs).replace(/^export /gm, '');
  M = new Function(js + '\nreturn {WARMUP_POINT_RULE,WARMUP_POINT_AMOUNT,WARMUP_POINT_DAILY_CAP,WARMUP_POINT_MIN_TURNS,WARMUP_KICKOFF_PREFIX,countStudentTurns,warmupPointGate};')();
} catch (e) { console.log('  (정본 실행 실패: ' + e.message + ')'); }
ok(!!M, '전제: 정본을 실제로 돌렸다');

console.log('\n① 판정 정본');
const K = M ? M.WARMUP_KICKOFF_PREFIX : 'x';
const H = n => JSON.stringify(Array.from({ length: n }, (_, i) => [{ role: 'user', content: 'I like dogs ' + i }, { role: 'assistant', content: 'Nice!' }]).flat());
const gate = o => { try { return M.warmupPointGate(Object.assign({ sessionId: 's1', historyRaw: H(3), userId: 'kim', sessionOwner: 'kim' }, o)); } catch (e) { return { ok: 'crash' }; } };
if (M) {
  ok(M.WARMUP_POINT_AMOUNT === 5 && M.WARMUP_POINT_DAILY_CAP === 1 && M.WARMUP_POINT_MIN_TURNS === 3, '금액 5P · 하루 1번 · 3번 이상(사장님 승인 값)');
  ok(gate({}).ok === true, '3번 말했으면 준다');
  ok(gate({ historyRaw: H(2) }).ok === false && gate({ historyRaw: H(2) }).error === 'not_enough_turns' && gate({ historyRaw: H(2) }).have === 2, '2번이면 안 주고 «2번» 이라고 말한다');
  const withKick = JSON.stringify([{ role: 'user', content: K + ' Greet me' }, { role: 'assistant', content: 'Hi' }].concat(JSON.parse(H(2))));
  ok(gate({ historyRaw: withKick }).ok === false, '첫 인사 합성 발화(kickoff)는 학생 말로 안 센다');
  const withKick3 = JSON.stringify([{ role: 'user', content: K + ' Greet me' }].concat(JSON.parse(H(3))));
  ok(gate({ historyRaw: withKick3 }).ok === true, '짝: kickoff 가 있어도 학생이 3번 말했으면 준다');
  ok(gate({ historyRaw: null }).error === 'turns_unknown', '대화 기록이 없으면 안 준다(모름)');
  ok(gate({ historyRaw: '{broken' }).error === 'turns_unknown', '기록이 깨졌으면 안 준다');
  ok(gate({ historyRaw: '{"a":1}' }).error === 'turns_unknown', '기록 모양이 배열이 아니면 안 준다');
  ok(gate({ sessionOwner: undefined }).error === 'turns_unknown', '세션 주인을 못 읽었으면 안 준다');
  ok(gate({ sessionOwner: 'lee' }).error === 'session_mismatch', '남의 대화로는 못 받는다');
  ok(gate({ sessionOwner: null }).ok === true, '짝: 세션 기록이 없는(로그 실패) 대화는 기록 횟수로 판정');
  ok(gate({ sessionId: '' }).error === 'session_required', '세션 없으면 안 준다');
  ok(M.countStudentTurns(JSON.parse(JSON.stringify([{ role: 'user', content: '   ' }, { role: 'user', content: 'Hi' }]))) === 1, '빈 말은 안 센다');
}

console.log('\n② 라우트 배선(api-points.ts)');
const api = process.env.WPAPI_SRC ? readFileSync(process.env.WPAPI_SRC, 'utf8') : R('cloudflare-deploy/src/api-points.ts');
const live = api.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const i = live.indexOf('if (ruleCode === WARMUP_POINT_RULE)');
const j = live.indexOf("SELECT * FROM point_rules WHERE code=? AND enabled=1");
ok(i > 0 && j > i, '웜업 판정이 규칙 조회·적립보다 앞에 있다');
const blk = i > 0 ? live.slice(i, j) : '';
ok(/const g = warmupPointGate\(/.test(blk) && /if \(!g\.ok\) return json\(/.test(blk), '판정을 부르고 실패면 돌아간다');
ok(/SESSION_STATE\.get\('warmup:' \+ sid\)/.test(blk), '대화 기록을 서버 KV 에서 읽는다(화면 숫자를 안 믿음)');
ok(!/body\.meta\??\.(turns|have|count)/.test(blk), '화면이 보낸 횟수를 안 읽는다');
ok(/WARMUP_POINT_AMOUNT, WARMUP_POINT_DAILY_CAP/.test(blk), '규칙 금액·한도를 정본 상수로 심는다');
const tp = R('cloudflare-deploy/src/today-points.ts');
ok(/c === 'warmup_talk'\) return 'warmup'/.test(tp), '오늘의 A.i 학습 카드: warmup_talk → warmup');

console.log('\n③ 화면 문구(view)');
const js = process.env.WPJS_SRC ? readFileSync(process.env.WPJS_SRC, 'utf8') : R('cloudflare-deploy/public/js/warmup-points.js');
let view = null;
try {
  const a = js.indexOf('function view('), b = js.indexOf('\n  function box()');
  view = new Function('NEED', js.slice(a, b) + '\nreturn view;')(3);
} catch (e) { console.log('  (view 실행 실패: ' + e.message + ')'); }
ok(!!view, '전제: view 를 오려 냈다');
const V = (d, o) => { try { return view(d, o); } catch (e) { return { cls: 'crash', ko: '' }; } };
if (view) {
  const e1 = V({ ok: true, signed: 5, newBalance: 120, rule: { amount: 5 } });
  ok(e1.cls === 'earn' && /\+5P/.test(e1.ko) && /120P/.test(e1.ko), '받으면 +5P 와 잔액');
  ok(V({ ok: true, rule: { amount: 5 } }).cls === 'earn', '짝: signed 가 없으면 규칙 금액');
  const n2 = V({ ok: false, error: 'not_enough_turns', have: 2, need: 3 });
  ok(n2.cls === 'info' && /2번/.test(n2.ko) && /3번/.test(n2.ko) && !/받았/.test(n2.ko), '모자라면 «2번 · 3번 이상» — 받았다고 안 함');
  ok(/이미 받았/.test(V({ ok: false, error: 'daily_cap_reached' }).ko), '하루 한도면 «이미 받았어요»');
  ok(/다 채웠/.test(V({ ok: false, error: 'daily_total_cap_reached' }).ko), '전체 한도면 «다 채웠어요»');
  ok(V(null).cls === 'warn' && !/\+\d+P 받았/.test(V(null).ko), '응답 없으면 «확인하지 못했어요»(지어내지 않음)');
  ok(V({ ok: false, error: 'x', signed: 5 }).cls === 'warn', 'ok 가 아니면 금액이 있어도 받았다고 안 함');
  ok(V({ ok: true, signed: 0 }).cls !== 'earn', '0P 면 «받았다» 고 안 함');
  ok(/로그인/.test(V(null, { guest: true }).ko), '비로그인은 로그인 안내');
  ok(!!V({ ok: true, signed: 5 }).en && /\+5P/.test(V({ ok: true, signed: 5 }).en), 'EN 문구도 있다');
}
ok(/btn\.addEventListener\('click'/.test(js) && /getElementById\('wgFinish'\)/.test(js), '«끝내고 요약 보기» 버튼에 붙는다');
ok(/rule_code: 'warmup_talk'/.test(js) && /session_id: sid/.test(js), '규칙·세션을 보낸다');
const html = R('cloudflare-deploy/public/warmup.html').replace(/<!--[\s\S]*?-->/g, '');
ok((html.match(/<script defer src="\/js\/warmup-points\.js\?v=\d+"><\/script>/g) || []).length === 1, 'warmup.html 이 정확히 한 번 싣는다');
const kickLine = R('cloudflare-deploy/public/warmup.html').match(/var kick = isZh\(\)\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/);
ok(!!kickLine && M && kickLine[1].indexOf(M.WARMUP_KICKOFF_PREFIX) === 0 && kickLine[2].indexOf(M.WARMUP_KICKOFF_PREFIX) === 0, '화면 kickoff 문장(영·중)이 정본 머리말로 시작한다');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
