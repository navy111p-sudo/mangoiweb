// ⏱ 주간 스케줄 — 10분 단위 · 수업시간 옵션 · 매니저 시간제한 우회 하니스 — 2026-08-12
//
//   사장님 수정요청 3건(프롬프트 블럭 #2·#3·#4)이 전부 admin/weekly-schedule.html 한 파일에 있다.
//
//   #2 수업 시간 옵션: 60분을 없애고 20/40분만. 20분이 맨 왼쪽 + 화면 열자마자 선택돼 있을 것.
//   #3 매니저 권한:    수업까지 «남은 시간»(연기 30분 전 / 변경 24시간 전) 컷오프를 매니저는 안 받는다.
//   #4 10분 단위:      슬롯 키가 «시(hour)» 였다. 실데이터의 분은 getHours() 로 잘려 나갔고
//                      (19:20 수업이 19:00 으로 보였다), 20분 수업 세 건이 한 칸에 겹쳐도 하나만 보였다.
//
//   이 하니스가 못 박는 것 — 전부 «조용히 되돌아가면 아무도 모르는» 것들:
//     ① 60분이 되살아나거나 기본값이 20분에서 벗어나면 안 된다
//     ② 슬롯 키가 다시 시 단위로 돌아가면 안 된다 (겹치는 수업이 사라진다)
//     ③ 로더가 분·수업길이를 버리면 안 된다
//     ④ 매니저 우회가 지사·대리점·강사에게까지 열리면 안 된다 (반대로 새면 규정이 무의미)
//     ⑤ 컷오프 계산이 «분» 을 무시하면 최대 59분 어긋난다
//
//   실행: node test-harness/schedule_10min_manager_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILE = join(ROOT, 'cloudflare-deploy', 'public', 'admin', 'weekly-schedule.html');
const src = readFileSync(FILE, 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* ══ 1부. #2 수업 시간 옵션 — 화면에 적힌 그대로 ══════════════════════ */
console.log('\n════════ 1부. #2 수업 시간 옵션 (60분 제거 · 20분 기본·최좌측) ════════');
const toggle = /<div class="view-toggle">((?:(?!<\/div>).)*data-dur=(?:(?!<\/div>).)*)<\/div>/s.exec(src);
const durBtns = toggle ? [...toggle[1].matchAll(/data-dur="(\d+)"/g)].map(m => m[1]) : [];
const activeDur = toggle ? (/<button class="active" data-dur="(\d+)"/.exec(toggle[1]) || [])[1] : null;
check('수업 길이 토글을 찾았다', durBtns.length > 0, durBtns);
check('⛔ 60분 옵션이 없다', !durBtns.includes('60'), durBtns);
check('20분 / 40분 두 개뿐', durBtns.join(',') === '20,40', durBtns);
check('20분이 맨 왼쪽', durBtns[0] === '20', durBtns);
check('화면 진입 시 기본 선택 = 20분 (버튼)', activeDur === '20', activeDur);
check('화면 진입 시 기본 선택 = 20분 (변수)', /var defaultDuration=20;/.test(src),
  (src.match(/var defaultDuration=\d+/) || [])[0]);
check('새 수업 모달의 길이 카드도 20/40 두 개', /\[20,40\]\.map\(function\(d\)\{/.test(src));
check('폴백값도 60이 아니다', !/defaultDuration!=='undefined'\)\?defaultDuration:60/.test(src) &&
  !/defaultDuration!=='undefined'\?defaultDuration:60/.test(src));

/* ══ 2부. #4 10분 단위 — 함수를 «실제로 실행» 한다 ═════════════════════ */
console.log('\n════════ 2부. #4 10분 단위 — 슬롯 저장·조회를 돌려 본다 ════════');
// 필요한 순수 함수만 오려내 실행한다. «이렇게 적혀 있다» 는 확인이 아니다.
function cut(re, label) {
  const m = re.exec(src);
  if (!m) { check('소스에서 ' + label + ' 를 찾았다', false); return ''; }
  return m[0];
}
const parts = [
  cut(/var SLOT_STEP=10;[\s\S]*?function minLabel\(startMin\)\{[^}]*\}/, '10분 격자 헬퍼'),
  'function pad2(n){return String(n).padStart(2,"0");}',
];
const sandbox = { SLOTS: {} };
let api = null;
try {
  api = new Function('SLOTSREF', parts.join('\n') + `
    SLOTS = SLOTSREF;
    return {slotKey,addSlot,getSlot,getSlotAt,hourHasSlot,slotsOfDay,minLabel,SLOT_STEP,STEPS_PER_HOUR};
  `)(sandbox.SLOTS);
  check('10분 격자 헬퍼가 실행된다', true);
} catch (e) {
  check('10분 격자 헬퍼가 실행된다', false, e.message);
}

if (api) {
  check('SLOT_STEP = 10분', api.SLOT_STEP === 10, api.SLOT_STEP);
  check('한 시간 = 6칸', api.STEPS_PER_HOUR === 6, api.STEPS_PER_HOUR);

  // 같은 «시» 안에 세 수업 — 예전 키(시 단위)라면 서로 덮어써서 하나만 남는다
  api.addSlot('t1', '2026-08-12', 19, { type: '1on1', duration_min: 20 }, 0);
  api.addSlot('t1', '2026-08-12', 19, { type: '1on1', duration_min: 20 }, 20);
  api.addSlot('t1', '2026-08-12', 19, { type: 'group', duration_min: 40 }, 40);
  const day = api.slotsOfDay('t1', '2026-08-12');
  check('19시 안에 20분 수업 3건이 «각각» 남는다 (덮어쓰지 않는다)', day.length === 3, day.length);
  check('시작 시각이 19:00 / 19:20 / 19:40', day.map(x => api.minLabel(x.startMin)).join(' ') === '19:00 19:20 19:40',
    day.map(x => api.minLabel(x.startMin)));
  check('키가 «분» 이다 (19:20 → 1160)', !!api.getSlotAt('t1', '2026-08-12', 19 * 60 + 20));
  check('getSlot 은 예전처럼 «시» 를 받고 분은 선택 인자', !!api.getSlot('t1', '2026-08-12', 19) &&
    !!api.getSlot('t1', '2026-08-12', 19, 20));
  check('hourHasSlot: 19:40+40분이 20시에 걸치는 것을 잡는다', api.hourHasSlot('t1', '2026-08-12', 20) === true);
  check('hourHasSlot: 아무것도 없는 21시는 false', api.hourHasSlot('t1', '2026-08-12', 21) === false);
  check('minLabel 은 0 을 채운다', api.minLabel(9 * 60 + 5) === '09:05', api.minLabel(9 * 60 + 5));
}

/* 격자·렌더링 계약 — 문자열로 확인할 수밖에 없는 것들 */
console.log('\n──────── 2-2. 격자가 10분으로 그려지는가 ────────');
check('일간 격자가 10분 단위로 돈다 (TOTAL_STEPS)',
  /var TOTAL_STEPS=\(GRID_H1-GRID_H0\)\*STEPS_PER_HOUR/.test(src));
check('헤더 한 칸이 6칸을 덮는다 (colspan)', /colspan="'\+STEPS_PER_HOUR\+'"/.test(src));
check('셀이 data-min 을 «실제 분» 으로 단다 (0 고정 아님)',
  /data-min="'\+m3\+'"/.test(src) && !/data-hour="'\+h3\+'" data-min="0"/.test(src));
check('수업 길이만큼 칸을 덮는다 (colspan=ceil(길이/10))',
  /var span=Math\.max\(1,Math\.ceil\(durMin\/SLOT_STEP\)\)/.test(src));
check('덮은 칸은 건너뛴다 (겹쳐 그리지 않는다)', /skip=span-1;/.test(src) && /if\(skip>0\)\{skip--;continue;\}/.test(src));
check('드래그 선택이 «시» 가 아니라 «분» 으로 범위를 잡는다',
  /var sMin=Math\.min\(dragStart\.startMin,info\.startMin\)/.test(src));
check('주간 타임라인도 분으로 위치를 잡는다', /var DAY0=GRID_H0\*60, SPAN_MIN=GRID_SPAN\*60;/.test(src));
check('저장할 때 고른 칸의 분이 들어간다', /\},info\.minute\|\|0\);/.test(src));
check('슬롯 이동 시 원본 키를 분까지 맞춰 지운다 (안 지우면 «복사» 가 된다)',
  /delete SLOTS\[slotKey\(ctx\.srcTeacher\.id,ctx\.srcCoords\.dateISO,ctx\.srcCoords\.hour\*60\+\(ctx\.srcCoords\.minute\|\|0\)\)\]/.test(src));

console.log('\n──────── 2-3. 실데이터 로더가 분·길이를 살리는가 ────────');
check('⛔ getHours() 로 분을 버리지 않는다', !/new Date\(s\.start_time\)\.getHours\(\)/.test(src));
/* (2026-08-12) 서버 /api/admin/schedules 는 hour 를 «분 절삭»으로 항상 내려주고 minute 필드가
   없다 — s.hour 를 먼저 보면 start_time 파싱이 영영 안 타서 19:20 이 도로 19:00 이 된다.
   그래서 계약이 「start_time 의 시:분('HH:MM' 맨 앞·ISO 의 T 뒤·공백 뒤)이 정본, hour 는 폴백」으로 바뀌었다. */
check("start_time 에서 «시:분» 을 찾는다 ('HH:MM'·ISO·공백 구분 모두)", /\/\(\?:\^\|\[T \]\)\(\\d\{1,2\}\):\(\\d\{2\}\)\/\.exec\(raw\)/.test(src));
check('⛔ start_time 이 hour(분 절삭)보다 우선한다 — hour 먼저 보면 분이 도로 사라진다',
  /if\(m\)\{ hh=parseInt\(m\[1\],10\); mm=parseInt\(m\[2\],10\); \}\s*\n\s*else if\(s\.hour!==undefined\)/.test(src));
check('10분 격자로 스냅한다', /mm=Math\.round\(\(mm\|\|0\)\/SLOT_STEP\)\*SLOT_STEP/.test(src));
check('duration_min 을 옮겨 담는다 (예전엔 통째로 빠져 있었다)',
  /duration_min:Number\(s\.duration_min\)>0\?Number\(s\.duration_min\):20/.test(src));

/* ══ 3부. #3 매니저 시간제한 우회 — 실제로 실행 ═══════════════════════ */
console.log('\n════════ 3부. #3 매니저는 «남은 시간» 제약을 안 받는다 ════════');
const roleFns = cut(/var MANAGER_ROLES\s*=[\s\S]*?function canOverrideTimeLimit\(\)\s*\{[^}]*\}/, '역할 판정');
const gateFns = cut(/function canPostpone\(dateISO, hour, minute\)\{[\s\S]*?\n\}\n\/\/ 변경 가능 여부[\s\S]*?\n\}/, '컷오프');
const timeFn = cut(/function getClassStartTime\(dateISO, hour, minute\)\{[^}]*\}/, 'getClassStartTime');

let gate = null;
try {
  gate = new Function('localStorage', `
    ${timeFn}
    ${roleFns}
    ${gateFns}
    return {canPostpone,canChange,canOverrideTimeLimit,schedEffectiveRole,getClassStartTime};
  `);
  // 컴파일만으로는 «식별자가 실제로 있는지» 를 못 잡는다 — 한 번 불러 봐야 안다
  gate({ getItem: () => null }).canOverrideTimeLimit();
  check('역할·컷오프 함수가 실행된다', true);
} catch (e) {
  check('역할·컷오프 함수가 실행된다', false, e.message);
  gate = null;
}

if (gate) {
  const mkLS = (store) => ({ getItem: (k) => (k in store ? store[k] : null) });
  const soon = new Date(Date.now() + 5 * 60000);              // 5분 뒤 수업 = 모든 컷오프 위반
  const iso = soon.toISOString().slice(0, 10);
  const H = soon.getHours(), M = soon.getMinutes();

  const probe = (store) => {
    const g = gate(mkLS(store));
    return { role: g.schedEffectiveRole(), over: g.canOverrideTimeLimit(),
             post: g.canPostpone(iso, H, M), chg: g.canChange(iso, H, M) };
  };
  const sess = (role) => ({ mangoi_admin_session: JSON.stringify({ uid: 'x', role }) });

  const mgr = probe(sess('hq_mgr'));
  check('본사 운영매니저(hq_mgr)는 우회한다', mgr.over && mgr.post && mgr.chg, mgr);
  const exec = probe(sess('hq_exec'));
  check('경영진(hq_exec)도 우회한다', exec.over && exec.post && exec.chg, exec);
  for (const r of ['branch', 'agency', 'hq_teacher', 'parent', 'student', '']) {
    const p = probe(sess(r));
    check(`⛔ ${r || '(역할없음)'} 은 우회하지 못한다`, !p.over && !p.post && !p.chg, p);
  }
  // 역할 미리보기(ph117) 중에는 미리보기 역할을 따른다 — 경영진이 지사를 보는 중이면 막혀야 한다
  const preview = probe({ ...sess('hq_exec'), admin_session: JSON.stringify({ uid: 'branch_busan' }) });
  check('경영진이 «지사로 미리보기» 중이면 우회하지 않는다', !preview.over && preview.role === 'branch', preview);

  // 컷오프가 «분» 을 반영하는가 — 분을 무시하면 최대 59분 어긋난다
  const g = gate(mkLS(sess('branch')));
  const t0 = g.getClassStartTime('2026-09-01', 19, 0).getTime();
  const t50 = g.getClassStartTime('2026-09-01', 19, 50).getTime();
  check('getClassStartTime 이 분을 반영한다 (19:00 ≠ 19:50)', t50 - t0 === 50 * 60000, (t50 - t0) / 60000);
}

console.log('\n──────── 3-2. 규정 문구·격자도 함께 풀리는가 ────────');
check('그리드의 tooSoon 도 매니저면 풀린다', /var tooSoon = !mgrOverride &&/.test(src));
check('규정 문구가 «되는데 안 된다고 적힌» 상태로 남지 않는다', /매니저 권한 — 시간 제한 없이 수정 가능/.test(src));
check('컷오프 호출이 분까지 넘긴다', /!canPostpone\(dateISO, hour, minute\)/.test(src) && /!canChange\(dateISO, hour, minute\)/.test(src));

console.log('\n' + '─'.repeat(58));
console.log(fail === 0 ? `✅ ALL PASS (${pass})` : `⚠ PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
