// ⏱ 주간 스케줄 — 10분 단위 · 수업시간 옵션 · 매니저 시간제한 우회 하니스 — 2026-08-12
//
//   사장님 수정요청 3건(프롬프트 블럭 #2·#3·#4)이 전부 admin/weekly-schedule.html 한 파일에 있다.
//
//   #2 수업 시간 옵션: 60분을 없애고 20/40분만. 20분이 맨 왼쪽 + 화면 열자마자 선택돼 있을 것.
//       🕐 (2026-08-17) 30분 추가 — «A안: 10분 격자 · 20/30/40분» 확정(사장님).
//       20·30·40 은 전부 SLOT_STEP(10) 의 배수라 격자·슬롯 로직은 그대로 둔다.
//       25분을 켜려면 SLOT_STEP 을 5 로 내려야 하고, 그때 아래 2부 기대값(10분·6칸)도 함께 바뀐다.
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
check('20 / 30 / 40분 세 개', durBtns.join(',') === '20,30,40', durBtns);
check('⛔ 25분은 아직 꺼져 있다 (켜려면 SLOT_STEP=5 로 함께 내려야 함)', !durBtns.includes('25'), durBtns);
check('20분이 맨 왼쪽', durBtns[0] === '20', durBtns);
check('화면 진입 시 기본 선택 = 20분 (버튼)', activeDur === '20', activeDur);
check('화면 진입 시 기본 선택 = 20분 (변수)', /var defaultDuration=20;/.test(src),
  (src.match(/var defaultDuration=\d+/) || [])[0]);
check('새 수업 모달의 길이 카드도 20/30/40 세 개', /\[20,30,40\]\.map\(function\(d\)\{/.test(src));
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
  /* 🟡 (2026-08-24) hourHasSlot 이 isGhostSlot 을 쓴다 — LMS·시드 칸을 «빈 시간» 으로 세기 위해서다.
     판정을 여기에 복제하지 않고 **화면 소스에서 그대로 뽑아** 쓴다. 복제하면 한쪽만 바뀐다. */
  cut(/function isGhostSlot\(s\)\{[^}]*\}/, 'isGhostSlot(LMS·시드 판정)'),
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
  /* 🟡 (2026-08-24 사장님 지시) LMS·시드 «자리표시» 칸은 «빈 시간» 으로 센다.
     [왜] 그 칸이 «찬 시간» 으로 잡히면 그 자리에 수업을 아예 못 넣는다
          (실측: HANNAH 화요일 15~18·21시가 전부 LMS 라 배정 불가, 목요일은 21시가 비어 배정됨).
     ⛔ 되돌리려면 데이터가 아니라 이 규칙을 되돌리는 것이다 — 행은 지우지 않았다. */
  api.addSlot('t1', '2026-08-12', 22, { type: '1on1', duration_min: 60, origin: 'lms' }, 0);
  check('🟡 LMS 자리표시 칸은 «빈 시간» 이다 (그 자리에 수업을 넣을 수 있다)',
    api.hourHasSlot('t1', '2026-08-12', 22) === false);
  api.addSlot('t1', '2026-08-12', 23, { type: '1on1', duration_min: 60, origin: 'sample' }, 0);
  check('🟡 시드 자리표시 칸도 «빈 시간» 이다',
    api.hourHasSlot('t1', '2026-08-12', 23) === false);
  api.addSlot('t1', '2026-08-13', 22, { type: '1on1', duration_min: 60 }, 0);
  check('⛔ 진짜 수업은 그대로 «찬 시간» 이다 (겹침 방어까지 풀면 안 된다)',
    api.hourHasSlot('t1', '2026-08-13', 22) === true);
  check('minLabel 은 0 을 채운다', api.minLabel(9 * 60 + 5) === '09:05', api.minLabel(9 * 60 + 5));

  /* 🕐 (2026-08-17) 빈틈 0 의 근거 — 고를 수 있는 «모든» 길이가 격자의 배수여야 한다.
     하나라도 배수가 아니면(예: 10분 격자에 25분) 수업마다 자투리가 남아 강사 시간이 샌다. */
  check('고를 수 있는 길이가 전부 SLOT_STEP 의 배수다 (= 이어 붙이면 빈틈 0)',
    durBtns.every(d => Number(d) % api.SLOT_STEP === 0), { durBtns, step: api.SLOT_STEP });

  // 20 → 30 → 40 을 이어 붙이면 자투리 없이 딱 맞아떨어지는가
  api.addSlot('t2', '2026-08-13', 14, { type: '1on1', duration_min: 20 }, 0);
  api.addSlot('t2', '2026-08-13', 14, { type: '1on1', duration_min: 30 }, 20);
  api.addSlot('t2', '2026-08-13', 15, { type: '1on1', duration_min: 40 }, 20);
  const mixed = api.slotsOfDay('t2', '2026-08-13');
  check('길이를 섞어 이어 붙여도 시작 시각이 14:00 / 14:20 / 15:20 으로 격자에 맞는다',
    mixed.map(x => api.minLabel(x.startMin)).join(' ') === '14:00 14:20 15:20',
    mixed.map(x => api.minLabel(x.startMin)));
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
/* 🔎 «분» 이 저장까지 살아서 가는가. 2026-08-24 부터 만들기는 서버로 나가므로
   화면 슬롯(addSlot 의 마지막 인자)만 보면 안 되고 **서버로 보내는 start_time** 도 봐야 한다.
   ⛔ 옛 검사는 `},info.minute||0);` 라는 «코드 모양» 을 못 박아 두어, 저장이 서버로 바뀌자
      뜻은 멀쩡한데 검사만 깨졌다. 뜻으로 적는다. */
check('저장할 때 고른 칸의 분이 들어간다 (서버로 보내는 시각)',
  /start_time:minLabel\(info\.hour\*60\+\(info\.minute\|\|0\)\)/.test(src));
check('저장할 때 고른 칸의 분이 들어간다 (화면 슬롯)',
  /addSlot\([^;]*?,\s*info\.minute\|\|0\);/s.test(src));
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

/* ═══════════════════════════════════════════════════════════════════════════
   🟡 (2026-08-24 사장님 지시) LMS·시드 «자리표시» 칸에도 수업을 배정할 수 있어야 한다.
   ───────────────────────────────────────────────────────────────────────────
   [무엇이 문제였나] class_schedules 활성 행의 대부분이 진짜 수업이 아니라 자리표시인데
     (user_id='lms' — 옛 LMS 점유 / 'type_seed' — 6월 시연 시드), 화면과 서버가 그걸
     «이미 예약된» 으로 보고 그 시간에 수업을 못 넣게 막았다. 실측 제보: HANNAH 화요일
     15·16·17·18·21시가 전부 LMS 라 배정 불가, 목요일은 21시가 비어 수업이 들어갔다.
   [고른 길] 데이터는 지우지 않고 «판정» 만 바꾼다 — 되돌리기가 재배포 한 번이면 된다.
   ⛔ 옛 주석에 「renderMoveGrid 의 충돌판정은 그대로 둔다」고 적혀 있었다.
      그 문장을 근거로 되돌리지 말 것 — 위 지시로 뒤집힌 것이다.
   ⚠️ 판정을 흩어 놓지 않는다 — 화면은 cellBusy() 한 곳, 서버는 NOT_PLACEHOLDER 한 곳.
      아래 검사는 «직접 읽는 코드가 되살아나지 않았는가» 까지 함께 본다. */
console.log('\n════════ 4부. LMS·시드 칸에 수업을 넣을 수 있는가 ════════');
{
  check('화면 판정이 한 곳에 모여 있다 (cellBusy)', /function cellBusy\(td\)/.test(src));
  check('cellBusy 는 LMS·시드를 «빈 칸» 으로 본다',
    /function cellBusy\(td\)\{[^}]*!isGhostCell\(td\)/.test(src));
  check('학생 배정 충돌판정이 cellBusy 를 쓴다', /if\(cellBusy\(td\) \|\| td\.dataset\.cont\)/.test(src));
  check('충돌판정이 SLOTS 쪽에서도 LMS·시드를 통과시킨다', /if\(_s && !isGhostSlot\(_s\)\)/.test(src));
  check('빈칸 드래그 시작이 cellBusy 를 쓴다', /if\(!td\|\|cellBusy\(td\)\)return/.test(src));
  check('빈칸 드래그 범위 선택이 cellBusy 를 쓴다', /if\(cellBusy\(cell\)\)return/.test(src));
  check('수업 이동 드롭 판정이 cellBusy 를 쓴다',
    /var occupied = cellBusy\(dropCell\)/.test(src) && /if\(cellBusy\(dropCell\)\)\{/.test(src));
  /* 🔴 클릭으로 상세 모달을 열면 mouseup 이 띄운 「새 슬롯 추가」 를 덮어써서
     «눌러도 추가가 안 되는» 것처럼 보인다(click 은 mouseup «뒤» 에 온다). */
  check('🔴 LMS·시드 칸 클릭이 상세 모달로 새 슬롯 모달을 덮지 않는다',
    !/if\(t\.dataset\.slot\)\{\s*\n\s*var data=JSON\.parse/.test(src));
  /* «직접 읽기» 가 한 곳이라도 되살아나면 그 자리만 조용히 옛 동작으로 돌아간다 */
  const rawBusy = src.split('\n').filter((l) =>
    /(?:if\s*\(|&&|\|\|)\s*!?\w+\.dataset\.slot\b/.test(l) &&
    !/cellBusy|!t\.dataset\.slot|!td\.dataset\.slot/.test(l));
  check('«칸이 찼나» 를 dataset.slot 으로 직접 보는 코드가 없다 (전부 cellBusy 경유)',
    rawBusy.length === 0, rawBusy.slice(0, 3).map((x) => x.trim()));

  const sc = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'schedule-conflict.ts'), 'utf8');
  check('서버 겹침판정에도 제외 규칙이 있다', /NOT_PLACEHOLDER/.test(sc));
  check('제외식이 다른 파일과 글자까지 같다',
    /NOT IN \('lms','type_seed'\)/.test(sc) && /LOWER\(COALESCE\(user_id,''\)\)/.test(sc));
  const qs = sc.match(/FROM class_schedules[\s\S]{0,220}?`/g) || [];
  check('class_schedules 를 보는 겹침·정원 쿼리가 모두 제외한다 (한 곳만 빠지면 조용히 막힌다)',
    qs.length > 0 && qs.every((x) => x.includes('NOT_PLACEHOLDER')),
    qs.filter((x) => !x.includes('NOT_PLACEHOLDER')).length + '개 누락');
}

/* 🧹 (2026-08-24 사장님 지시) LMS·시드 자리표시 «일괄 정리» — 지우는 API 라 안전장치를 못 박는다.
   [왜 지우나] 판정만 바꿔 배정을 열었지만 칸이 화면에 그대로 남아 실제 운영에서는
     달라진 게 없다는 판단. 「실제 데이터가 아니고 지워도 영향 없다」는 확인 아래 정리한다.
   ⛔ 이 검사들은 «지나치게 많이 지우는» 쪽을 막는 것이다. 느슨하게 고치지 말 것. */
console.log('\n════ 5부. LMS·시드 일괄 정리 API 의 안전장치 ════');
{
  const api = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'api-admin.ts'), 'utf8');
  const i = api.indexOf("path === '/api/admin/class-schedules/purge-placeholders'");
  const blk = i > 0 ? api.slice(i, i + 3500) : '';
  check('일괄 정리 API 가 있다', !!blk);
  check('🔴 강사는 실행할 수 없다', /_pActor\.isTeacher\) return json\((?:\{ ok: false, error: 'forbidden_teacher' \}|forbiddenTeacherBody\(_pActor\)), 403\)/.test(blk));
  check('🔴 지사·대리점도 실행할 수 없다 (본사만)', /canEditOrg\(_pScope\)\) return json\(\{ ok: false, error: 'forbidden_scope' \}, 403\)/.test(blk));
  /* 🔴 여기가 사고가 날 자리다 — 조건을 자유 문자열로 받으면 언젠가 진짜 수업을 지운다. */
  check('🔴 지울 대상을 «표시자 목록» 으로만 정한다 (자유 조건 금지)',
    /const UIDS = which === 'lms'[\s\S]{0,160}?\['lms', 'type_seed'\]/.test(blk));
  check("🔴 user_id 가 정확히 lms/type_seed 인 행만 (학생이 붙은 행은 절대 안 건드림)",
    /LOWER\(COALESCE\(user_id,''\)\) IN \(\$\{ph\}\)/.test(blk));
  check('🔴 이미 취소된 행은 다시 안 건드린다', /status IS NULL OR status = 'active'/.test(blk));
  check('⛔ 물리 삭제하지 않는다 — 되돌릴 수 있게 status=cancelled',
    /UPDATE class_schedules SET status = 'cancelled'/.test(blk) && !/DELETE\s+FROM\s+class_schedules/i.test(blk));
  check('🟡 «몇 건인지» 만 세어 보는 길이 있다 (화면이 먼저 묻는다)', /dry_run/.test(blk));
  check('📜 감사 로그를 남긴다', /writeClassAudit\(env, \{/.test(blk));

  /* 🔴 (2026-08-24 실측) 여기가 이번에 실제로 밟은 자리다 — 핸들러·화면·권한이 전부 맞는데
     화면이 「⚠️ 건수를 확인하지 못했습니다: Not Found」 를 냈다.
     새 `/api/admin/*` 경로는 **관문이 셋**이고 하나만 빠져도 404 다:
       ① index.ts 인증 게이트  — `/api/admin/` default-deny 라 자동 통과(등록 불필요)
       ② index.ts **라우팅 허용목록** — 경로를 «하나씩» 적는다. 여기가 빠졌었다.
       ③ api-mango.ts 위임 가드 — 여기 없으면 handleAdminApi 까지 못 간다
     ⚠️ ①과 ②를 같은 것으로 착각하면 이 사고가 그대로 재현된다.
     ⚠️ `/api/admin/class-schedules` 는 ②에 **정확일치**로만 올라와 있어 하위 경로는
        매번 한 줄을 더해야 한다(`startsWith` 가 아니다). */
  const idx = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'index.ts'), 'utf8');
  const mango = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'api-mango.ts'), 'utf8');
  check('🔴 index.ts 라우팅 허용목록에 등록돼 있다 (없으면 Not Found)',
    idx.includes("path === '/api/admin/class-schedules/purge-placeholders'"));
  check('🔴 api-mango.ts 위임 가드를 통과한다 (없으면 handleAdminApi 까지 못 간다)',
    /path\.startsWith\('\/api\/admin\/class-schedules'\)/.test(mango));

  const w = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'admin', 'weekly-schedule.html'), 'utf8');
  check('화면이 «건수 확인 → 사람 확인 → 실행» 두 단계다',
    /dry_run:true/.test(w.replace(/\s/g, '')) && /confirm\(msg\)/.test(w));
  check('정리할 것이 0건이면 버튼을 감춘다 (누를 게 없는 버튼 금지)',
    /purgeBtn\.hidden=!\(s\.ghost>0\)/.test(w));
  check('정리 뒤 서버에서 다시 읽는다 (화면만 바뀌는 착시 금지)',
    /await loadData\(\);\s*\n\s*render\(\);/.test(w));
}

/* 💾 (2026-08-24 사장님 제보) 「수업을 잡았는데 학생 화면엔 오늘 수업이 없다 · 강의실에서 못 만난다」
   [무엇이 문제였나] 이 화면의 «수업 만들기» 가 메모리(SLOTS)에만 넣고 서버에 POST 를 안 했다.
     → `class_schedules` 에 행이 없으니 학생 조회(/api/class/sessions/today)도 0건이고,
        방 번호(`class-{예약id}-{YYYYMMDD}`)를 만들 근거 자체가 없어 서로 다른 방에 앉는다.
     차단(blocked)은 2026-08-12 에 같은 이유로 고쳤는데 «수업» 쪽이 그대로 남아 있었다.
   ⚠️ 이 사고는 «화면에는 멀쩡히 그려진다» 는 것이 함정이다 — 새로고침해야 사라진다.
      그래서 «저장 전에 addSlot 으로 그리지 않는다» 를 함께 못 박는다. */
console.log('\n════ 6부. 수업 «만들기» 가 서버에 저장되는가 ════');
{
  const cutBlock = (from, to) => {
    const i = src.indexOf(from); if (i < 0) return '';
    const j = src.indexOf(to, i + from.length); return j < 0 ? src.slice(i) : src.slice(i, j);
  };
  const save = cutBlock('async function saveNewSlot(){', 'window.saveNewSlot=saveNewSlot;');
  const assign = cutBlock('async function assignStudent(stu, info){', '\n  // ── 9)');
  check('saveNewSlot 을 찾았다', !!save);
  check('assignStudent 를 찾았다', !!assign);

  /* 🔴 핵심 — 두 «만들기» 경로가 모두 서버를 부른다. 문자열이 아니라 «부르는가» 를 본다. */
  check('🔴 새 슬롯 저장이 서버에 수업을 등록한다',
    /postClassScheduleAsk\(/.test(save));
  check('🔴 대기 풀 배정도 서버에 수업을 등록한다',
    /postClassScheduleAsk\(/.test(assign));
  check('🔴 실제로 /api/admin/class-schedules 로 나간다',
    /fetch\('\/api\/admin\/class-schedules'/.test(src));

  /* ⛔ 저장이 끝나기 전에 화면에 그리면, 서버가 거절해도 «있는 것처럼» 보여 이 사고가 그대로 남는다. */
  check('⛔ saveNewSlot 이 서버 저장 없이 화면에만 그리지 않는다 (addSlot 직접 호출 0건)',
    !/\baddSlot\(/.test(save));
  check('⛔ assignStudent 는 저장 «성공한 뒤에만» 그린다 (실패하면 그리지도, 풀에서 빼지도 않음)',
    /if\(!res2\.ok\)\{[\s\S]{0,400}?return;\s*\}[\s\S]*?addSlot\(/.test(assign) &&
    assign.indexOf('POOL = POOL.filter') > assign.indexOf('if(!res2.ok)'));

  /* 겹침(409 conflict)은 사람에게 한 번 되묻고, 근무불가(teacher_unavailable)는 되묻지 않는다 —
     강사가 실제로 없는 시간에 수업을 꽂으면 그 수업은 진행 자체가 불가능하다. */
  check('🟡 겹치면 사람에게 한 번 되묻는다', /error==='conflict'[\s\S]{0,220}?confirm\(/.test(src));
  check("⛔ 되묻는 것은 «conflict» 일 때뿐 (근무불가는 force 로 못 뚫는다)",
    /res\.status===409 && res\.j && res\.j\.error==='conflict'/.test(src));

  /* 저장 뒤에는 반드시 서버에서 다시 읽는다 — 예약 id 가 붙어야 이동·삭제가 되고,
     서버가 실제로 무엇을 만들었는지 화면이 «자기 기억» 이 아니라 «서버» 로 확인한다. */
  check('🔴 저장 뒤 서버에서 다시 읽는다 (화면만 바뀌는 착시 금지)',
    /await reloadAndRender\(\);/.test(save));

  /* 서버가 받는 모양 — 하나라도 빠지면 400 이 나고 화면엔 «저장 실패» 만 뜬다. */
  check('🟡 일회성(one_off) + 날짜를 함께 보낸다 (없으면 서버가 date_required)',
    /schedule_kind:'one_off'/.test(save) && /scheduled_date:info\.dateISO/.test(save));
  check('🟡 시작 시각을 HH:MM 으로 보낸다 (칸의 «분» 까지)',
    /start_time:minLabel\(info\.hour\*60\+\(info\.minute\|\|0\)\)/.test(save));
  check('🟡 학생이 없으면 아예 보내지 않는다 (서버는 학생 없는 수업을 만들 수 없다)',
    /if\(!students\.length\)\{[\s\S]{0,200}?return;/.test(save));

  /* 수업 종류 매핑 — 서버 허용목록과 «함께» 본다. 한쪽만 늘리면 조용히 regular 가 된다
     (CLAUDE.md 2장 「화면에서 골랐는데 그 값만 저장이 안 됨」 과 같은 뿌리). */
  const api2 = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'api-admin.ts'), 'utf8');
  const allow = /\['regular', 'trial', 'level_test', 'makeup'\]\.includes\(String\(body\.class_type/.test(api2);
  check('서버의 class_type 허용목록을 찾았다', allow);
  const mapped = [...(src.match(/SLOT_TYPE_TO_CLASS_TYPE=\{[^}]*\}/) || [''])[0].matchAll(/:'([a-z_]+)'/g)].map(m => m[1]);
  check('🔴 화면이 보내는 class_type 이 전부 서버 허용목록 안에 있다',
    mapped.length > 0 && mapped.every((x) => ['regular', 'trial', 'level_test', 'makeup'].includes(x)), mapped);

  /* 메모 입력칸 id 가 종류마다 다르다 — 예전엔 차단용 id 만 읽어 수업 메모가 항상 빈 값이었다. */
  check('🟡 수업 메모 입력칸(ns-note-2)도 읽는다',
    /getElementById\('ns-note-2'\)\?\.value/.test(save));

  /* 👥 서버에는 group 이라는 class_type 이 없어 그룹 수업은 «학생마다 한 행» 으로 들어온다.
     같은 칸에 그냥 넣으면 나중 행이 앞 행을 덮어써 3명짜리가 1명으로 보인다. */
  check('👥 같은 칸의 여러 행을 한 수업으로 합친다 (그룹이 1명으로 줄지 않게)',
    /getSlotAt\(s\.teacher_id,s\.date,hh\*60\+mm\)/.test(src) && /exist0\.type='group'/.test(src));
}

console.log('\n' + '─'.repeat(58));
console.log(fail === 0 ? `✅ ALL PASS (${pass})` : `⚠ PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
