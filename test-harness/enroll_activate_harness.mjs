// 📚 수강신청 «확정 파이프라인» 하니스 — 2026-08-08
//
//   배경: 관리자 「수강신청 관리」의 액션 버튼은 `UPDATE enrollments SET status` 한 줄이 전부였다.
//     확정을 눌러도 계정·강사·시간표·안내 어느 것도 일어나지 않아 «아무 일도 안 난» 것처럼 보였다.
//     그 일을 할 엔진(enroll-ops.ts)은 결제 경로에 이미 있었고, 관리자 카드만 연결이 없었다.
//     src/enroll-activate.ts 가 그 다리다.
//
//   이 하니스가 못 박는 것 — 전부 «조용한 오등록» 또는 «중복 청구» 로 이어지는 것들:
//     ① 요일 문자열을 잘못 읽으면 엉뚱한 날에 수업이 잡힌다 ('월수금' → [1,3,5])
//     ② 요일별 다른 시간('월 07:30, 수 08:00')을 한 시각으로 뭉개면 안 된다
//     ③ 회차를 잘못 세면 돈 받은 만큼 수업이 안 생긴다 ('4회권' → 4)
//     ④ 말일 청구일 보정 (1/31 + 1개월 = 2/28. 2/31 을 만들면 안 된다)
//     ⑤ 전화번호가 화면·로그에 그대로 나오면 안 된다
//     ⑥ 막는 조건(blocker)이 있는데 «실행» 버튼이 살아 있으면 안 된다
//     ⑦ 시간표 생성은 멱등이어야 한다 — 두 번 눌러 두 벌이 생기면 강사가 이중 예약된다
//     ⑧ 학부모 문자·결제 예약은 **기본 꺼짐** 이어야 한다 (바깥으로 나가는 일·돈)
//     ⑨ 새 API 는 index.ts 의 라우팅 + 인증 게이트에 등록돼야 동작한다 (CLAUDE.md 규칙)
//
//   실행: node test-harness/enroll_activate_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');

const actSrc = readFileSync(join(SRC, 'enroll-activate.ts'), 'utf8');
const idxSrc = readFileSync(join(SRC, 'index.ts'), 'utf8');
const admSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
const coreSrc = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'js', 'adm-core.js'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* ═══ 1부. 순수 파서를 «진짜로 실행» 한다 ═══════════════════════════════
   «정규식이 이렇게 적혀 있다» 를 눈으로 확인해 봐야 소용없다. 돌려 봐야 안다.
   TS 파일에서 export 된 순수 함수만 오려내 타입 표기를 지우고 실행한다. */
console.log('\n════════ 1부. 요일·시간·회차 파서 ════════');

// TS → JS 최소 변환. «적혀 있다» 가 아니라 «돌아간다» 를 보려면 실행해야 한다.
function stripTypes(s) {
  return s
    .replace(/^export /gm, '')
    .replace(/\bnew (Set|Map)<[^>]*>/g, 'new $1')          // new Set<number>()
    .replace(/:\s*(?:Record|Set|Map|Array)<[^>]*>/g, '')   // : Record<string,string>
    .replace(/\):\s*[A-Za-z_$][\w$<>,\s[\]|]*?\s*\{/g, ') {') // 반환 타입
    .replace(/:\s*[A-Za-z_$][\w$]*(\[\])?(?=\s*[,)=])/g, ''); // 매개변수·변수 타입
}
function extractFn(name) {
  const re = new RegExp('export function ' + name + '\\b[\\s\\S]*?\\n\\}', 'm');
  const m = re.exec(actSrc);
  if (!m) throw new Error('함수를 못 찾음: ' + name);
  return stripTypes(m[0]);
}

const consts = stripTypes(/const DOW_KO[\s\S]*?const DOW_LABEL = \[[^\]]*\];/.exec(actSrc)[0]);

const fns = ['parseDowList', 'dowLabel', 'parseTimesByDow', 'parseSessions', 'parseClassSize', 'maskPhone', 'nextBillingDay', 'kstDay']
  .map(extractFn).join('\n');

const P = new Function(consts + '\n' + fns + '\nreturn {parseDowList,dowLabel,parseTimesByDow,parseSessions,parseClassSize,maskPhone,nextBillingDay,kstDay};')();

// ① 요일
check("'월수금' → [1,3,5]", JSON.stringify(P.parseDowList('월수금')) === '[1,3,5]', P.parseDowList('월수금'));
check("'화, 목' → [2,4]", JSON.stringify(P.parseDowList('화, 목')) === '[2,4]', P.parseDowList('화, 목'));
check("'일' → [0] (일요일을 빠뜨리지 않는다)", JSON.stringify(P.parseDowList('일')) === '[0]', P.parseDowList('일'));
check("'mon wed' → [1,3]", JSON.stringify(P.parseDowList('mon wed')) === '[1,3]', P.parseDowList('mon wed'));
check("'월월수' → [1,3] (중복 제거)", JSON.stringify(P.parseDowList('월월수')) === '[1,3]', P.parseDowList('월월수'));
check("'' → [] (빈 값에 요일을 지어내지 않는다)", JSON.stringify(P.parseDowList('')) === '[]');
check("dowLabel([1,3,5]) → '월수금'", P.dowLabel([1, 3, 5]) === '월수금', P.dowLabel([1, 3, 5]));

// ② 시간 — 요일별 다른 시간을 뭉개면 안 된다
const t1 = P.parseTimesByDow('19:20', [1, 3, 5]);
check("'19:20' → 세 요일 모두 19:20", t1['1'] === '19:20' && t1['3'] === '19:20' && t1['5'] === '19:20', t1);
const t2 = P.parseTimesByDow('월 07:30, 수 08:00', [1, 3]);
check("'월 07:30, 수 08:00' → 요일별로 다르게", t2['1'] === '07:30' && t2['3'] === '08:00', t2);
const t3 = P.parseTimesByDow('7:30', [2]);
check("'7:30' → '07:30' (앞자리 0 보정)", t3['2'] === '07:30', t3);
const t4 = P.parseTimesByDow('월 07:30', [1, 3]);
check('요일별 표기가 일부만 있으면 나머지는 그 시각으로 메움', t4['1'] === '07:30' && t4['3'] === '07:30', t4);
check("시간이 없으면 빈 맵 (0시로 지어내지 않는다)", Object.keys(P.parseTimesByDow('', [1])).length === 0);

// ③ 회차
check("'1:1 4회권' → 4", P.parseSessions('1:1 4회권', 2) === 4, P.parseSessions('1:1 4회권', 2));
check("'그룹 12회권' → 12", P.parseSessions('그룹 12회권', 2) === 12);
check("'주2회 3개월' → 24", P.parseSessions('주2회 3개월', 2) === 24, P.parseSessions('주2회 3개월', 2));
check("'정규반'(단서 없음) + 주3회 → 12 (한 달치)", P.parseSessions('정규반', 3) === 12, P.parseSessions('정규반', 3));
check('회차가 0 이 되는 일은 없다', P.parseSessions('', 0) >= 1, P.parseSessions('', 0));
check('회차 상한 400 (오타 9999회권 방어)', P.parseSessions('9999회권', 1) === 400, P.parseSessions('9999회권', 1));

// ④ 인원
check("'1:3' → 3", P.parseClassSize('1:3') === 3);
check("'1대2' → 2", P.parseClassSize('1대2') === 2);
check("'그룹' → 0 (모르면 0)", P.parseClassSize('그룹') === 0);

// ⑤ 말일 청구일 보정 — 2/31 같은 날짜를 만들면 그 뒤 계산이 전부 어긋난다
check('2026-01-31 + 1개월 → 2026-02-28', P.nextBillingDay('2026-01-31') === '2026-02-28', P.nextBillingDay('2026-01-31'));
check('2028-01-31 + 1개월 → 2028-02-29 (윤년)', P.nextBillingDay('2028-01-31') === '2028-02-29', P.nextBillingDay('2028-01-31'));
check('2026-12-15 + 1개월 → 2027-01-15 (해 넘김)', P.nextBillingDay('2026-12-15') === '2027-01-15', P.nextBillingDay('2026-12-15'));
check('2026-03-31 + 1개월 → 2026-04-30', P.nextBillingDay('2026-03-31') === '2026-04-30', P.nextBillingDay('2026-03-31'));

// ⑥ 전화번호 가리기
check("010-1234-5678 → 010-****-5678", P.maskPhone('010-1234-5678') === '010-****-5678', P.maskPhone('010-1234-5678'));
check('빈 값은 빈 값', P.maskPhone('') === '');
check('원본 가운데 4자리가 남지 않는다', !P.maskPhone('01012345678').includes('1234'));

/* ═══ 2부. 서버 파이프라인의 «안전장치» 가 코드에 실제로 있는가 ═══ */
console.log('\n════════ 2부. 파이프라인 안전장치 ════════');

check('⑦ 시간표는 source 로 멱등 — 이미 있으면 건너뛴다',
  /already_created\s*>\s*0/.test(actSrc) && /INSERT OR IGNORE INTO class_schedules/.test(actSrc));
check("멱등 키가 이 신청 건 전용 (adm-enroll:<id>)",
  /const SRC_PREFIX = 'adm-enroll:'/.test(actSrc));
check('충돌·공휴일을 회피해서 날짜를 잡는다 (회차 보존)',
  /enrollConflicts\(/.test(actSrc) && /holidaySet\(/.test(actSrc) && /enrollDates\(/.test(actSrc));
check('강사 후보는 «그 시간에 비어 있는» 사람만 (teachersFreeAt)',
  /teachersFreeAt\(/.test(actSrc));
check('학생 계정을 «새로 만들지» 않는다 (동명이인이면 사람이 고른다)',
  !/INSERT INTO students_erp/.test(actSrc) && /동명이인/.test(actSrc));
check('결제 단계가 «청구» 하지 않는다 — next_billing_at 만 적는다',
  /next_billing_at/.test(actSrc) && !/payment_orders|charge|billingKey|결제요청/.test(actSrc));
// ⚠️ indexOf 로 찾으면 파일 맨 위 «왜 만들었나» 주석의 인용문에 걸린다 — 실행되는 마지막 것을 본다
check('상태 변경은 맨 마지막 (앞 단계 결과를 보고 나서)',
  actSrc.lastIndexOf('UPDATE enrollments SET status') > actSrc.lastIndexOf("step: 'create_schedules'"),
  { status: actSrc.lastIndexOf('UPDATE enrollments SET status'), sched: actSrc.lastIndexOf("step: 'create_schedules'") });
check('단계별 성공/실패를 그대로 돌려준다 (뭉뚱그리지 않는다)',
  /steps:\s*results/.test(actSrc) && /all_ok/.test(actSrc));
check('dry(미리보기)면 아무것도 저장하지 않는다',
  (actSrc.match(/if \(!dry\)/g) || []).length >= 2 && /dry \?/.test(actSrc));

/* ═══ 3부. CLAUDE.md 규칙 — 새 API 는 index.ts 두 곳에 등록해야 동작한다 ═══ */
console.log('\n════════ 3부. 라우팅 · 인증 게이트 등록 ════════');

const gateRe = /enrollments\\\/\\d\+\(\\\/\(plan\|activate\)\)\?\$/;
const hits = (idxSrc.match(/enrollments\\\/\\d\+\(\\\/\(plan\|activate\)\)\?\$/g) || []).length;
check('⑨ index.ts 에 plan·activate 경로가 등록됨 (라우팅 + 인증 게이트 두 곳)', hits >= 2, { hits });
check('옛 \\d+$ 만 남아 새 경로가 새는 곳이 없다',
  !/enrollments\\\/\\d\+\$\/\.test/.test(idxSrc), (idxSrc.match(/enrollments\\\/\\d\+\$[^\n]*/g) || []).slice(0, 3));
check('api-admin.ts 가 파이프라인 핸들러를 CRUD 보다 «먼저» 호출',
  admSrc.indexOf('handleEnrollActivateApi(request') < admSrc.indexOf("path === '/api/admin/enrollments'") ||
  admSrc.indexOf('handleEnrollActivateApi(request') > 0 &&
  admSrc.indexOf('handleEnrollActivateApi(request') < admSrc.indexOf("if ((method === 'GET' || method === 'POST') && path === '/api/admin/enrollments')"));
check('actor 조회가 경로 일치일 때만 (모든 관리자 API 에 DB 왕복을 더하지 않는다)',
  /if \(\/\^\\\/api\\\/admin\\\/enrollments[^\n]*\)\s*\{\s*\n\s*const _actor/.test(admSrc));

/* ═══ 4부. 화면 — 위험한 단계가 기본으로 켜져 있으면 안 된다 ═══ */
console.log('\n════════ 4부. 화면 기본값 · 잠금 ════════');

const panel = /function _enPanelHtml[\s\S]*?\n\}/.exec(coreSrc)[0];
const chkCall = (key) => new RegExp("chk\\('" + key + "'[^\\n]*").exec(panel)?.[0] || '';
const isOn = (key) => {
  const line = chkCall(key);
  // chk(key, label, on, note) — 세 번째 인자
  const m = /,\s*(true|false)\s*[,)]/.exec(line.slice(line.indexOf('),') + 1) || line);
  return /,\s*true\s*[,)]/.test(line);
};
check('⑧ 학부모 문자는 기본 꺼짐', !isOn('notify_parent'), chkCall('notify_parent').slice(0, 90));
check('⑧ 결제 예약은 기본 꺼짐', !isOn('create_subscription'), chkCall('create_subscription').slice(0, 90));
check('시간표 생성은 기본 켜짐 (이게 본 목적)', isOn('create_schedules'));
check('⑥ blocker 가 있으면 실행 버튼이 잠긴다',
  /const canRun = \(p\.blockers \|\| \[\]\)\.length === 0/.test(panel) && /canRun \? '' : 'disabled '/.test(panel));
check('실제 실행 전에 «무엇이 바깥으로 나가는지» 확인한다',
  /outward\.push/.test(coreSrc) && /if \(!confirm\(msg\)\) return/.test(coreSrc));
check('미리보기 결과는 «저장하지 않았다» 고 명시한다',
  /아무것도 저장하지 않았습니다/.test(coreSrc));
/* ✅ (2026-08-12) 등록 = 확정으로 합치면서 이 줄의 계약이 바뀌었다.
   예전: pending·confirmed 둘 다 «▸ 처리» (사람이 눌러야 확정됨)
   지금: 등록하는 순간 자동 확정 → pending 은 «확정이 막힌 건» 이라 「▸ 확정 안 됨」,
         confirmed 는 학부모 문자·결제 예약을 나중에 켜는 「⚙ 후속」. 취소된 건엔 여전히 없다. */
check('pending = 「▸ 확정 안 됨」 (확정이 막힌 건만)',
  /cur === 'pending'[\s\S]{0,400}enOpenPanel[\s\S]{0,400}확정 안 됨/.test(coreSrc));
check('confirmed = 「⚙ 후속」 (문자·결제만 남는다)',
  /cur === 'confirmed'[\s\S]{0,400}enOpenPanel[\s\S]{0,400}후속/.test(coreSrc));
check('⛔ 별도 「확정」 버튼은 화면에서 사라졌다',
  !/_enBtn\([^)]*'confirmed'/.test(coreSrc), (coreSrc.match(/_enBtn\([^)]*'confirmed'[^)]*\)/) || [])[0]);
check('등록이 끝나면 확정 파이프라인이 바로 이어진다',
  /_enAutoConfirm\s*\(/.test(coreSrc) && /async function _enAutoConfirm/.test(coreSrc));
check('자동 확정은 «바깥으로 나가는 것»을 켜지 않는다 (문자·결제)',
  /_enAutoConfirm[\s\S]{0,700}create_subscription:\s*false[\s\S]{0,80}notify_parent:\s*false/.test(coreSrc));
check('실패한 단계가 있으면 서버가 상태를 안 올린다 (조용한 반쪽 성공 금지)',
  /const finalStatus = hardFail \? 'pending' : wantStatus/.test(actSrc) &&
  /\.bind\(finalStatus, now, id\)/.test(actSrc));

console.log('\n──────────────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail === 0) console.log('🎉 수강신청 확정 파이프라인 — 계약 전부 유지됨.');
process.exit(fail === 0 ? 0 : 1);
