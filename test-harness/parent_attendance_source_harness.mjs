// parent_attendance_source_harness.mjs — 학부모 마이페이지 출석 «원천·판정» 회귀 가드
// ─────────────────────────────────────────────────────────────────────────────
// 📜 이력
//  · 2026-07-31 (원판) — 출석을 point_rule_log(포인트 적립 로그)에서 읽던 것을 attendance 로 통일.
//    그 계약(원천은 attendance, 월간 리포트와 같은 원천)은 지금도 그대로 지킨다.
//  · 2026-08-30 (v4 제안서 02) — «정시율» 판정을 바꿨다. 이 하니스도 함께 바꾼다. 왜:
//      원판은 `on_time_days = status==='attended'` 를 못 박았는데, **운영 D1 실측**
//      (2026-08-30, SELECT 만) 결과 attendance 181,983행의 status 분포가
//        present 121,735 · scheduled 58,246 · left 1,893 · **attended 109(0.06%)**
//      였다. 최근 30일 출석 상위 학생(18일 출석)조차 attended 가 **0건**이라
//      분자가 늘 0 → 화면이 **언제나 «0%»** 였다(「출석했는데 출석률 0」 제보의 정체).
//      또 `status='scheduled'` 는 카페24가 **미래 날짜로 미리 넣어 둔 예약**(최대 2030-02-20)인데
//      그것까지 «출석일» 로 세고 있었다.
//    ⟹ 이제 판정 정본은 src/attendance-truth.ts 의 summarizeAttendance() 하나다.
//       ⛔ 「on_time_rate 가 0 이어야 한다」로 되돌리지 말 것 — 그건 «못 잰 것» 을 «0점» 이라고
//          말하는 것이다(CLAUDE.md 2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」).
//  이 하니스는 문자열이 아니라 **정본 함수를 실제로 돌려서** 판정한다.
//  실행: node test-harness/parent_attendance_source_harness.mjs
import { readFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readOr = (rel) => { try { return readFileSync(path(rel), 'utf8'); } catch { return null; } };
const CF = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy');

let pass = 0, fail = 0;
const ok = (name, cond, got) => {
  if (cond) pass++;
  else { fail++; console.log('  X ' + name + (got !== undefined ? '  -> ' + JSON.stringify(got) : '')); }
};

// ── 1) 판정 정본을 «실제로 돌려» 본다 ────────────────────────────────────────
//    ⚠️ esbuild 가 없는 환경(컨테이너에 node_modules 미설치)에서는 건너뛴다 —
//       그건 «코드 판정» 이 아니라 «환경 사유» 다(CLAUDE.md 2장).
let esbuildApi = null;
try {
  const { createRequire } = await import('node:module');
  esbuildApi = createRequire(join(CF, 'package.json'))('esbuild');
} catch { /* 미설치 */ }

if (!esbuildApi) {
  console.log('  ⏭ esbuild 없음 — 실행 검증 건너뜀 (아래 정적 계약 검사만 유효)');
} else {
  const out = join(mkdtempSync(join(tmpdir(), 'atttruth-')), 'bundle.mjs');
  esbuildApi.buildSync({ entryPoints: [join(CF, 'src', 'attendance-truth.ts')],
    bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent' });
  const { summarizeAttendance } = await import('file://' + out.replace(/\\/g, '/'));

  const NOW = Date.parse('2026-07-20T00:00:00Z');
  const ms = (d) => Date.parse(d + 'T00:00:00Z');

  {
    const rows = [
      { date: '2026-07-10', status: 'present',  attended_at: null,     joined_at: ms('2026-07-10') },
      { date: '2026-07-10', status: 'left',     attended_at: 1,        joined_at: ms('2026-07-10') },  // 같은 날 재입장
      { date: '2026-07-11', status: 'present',  attended_at: null,     joined_at: ms('2026-07-11') },
      { date: '2026-07-12', status: 'attended', attended_at: 1,        joined_at: ms('2026-07-12') },
      { date: '2026-07-15', status: 'scheduled',attended_at: null,     joined_at: ms('2026-07-15') },  // 예정인데 안 옴
      { date: '2030-02-20', status: 'scheduled',attended_at: null,     joined_at: ms('2030-02-20') },  // 미래 예약
      { date: null,          status: 'present', attended_at: null,     joined_at: ms('2026-07-13') },  // date 없음
    ];
    const a = summarizeAttendance(rows, NOW);
    ok('출석일 = 실제로 온 날(중복·null·미래·예정 제외)', a.last_30d_days === 3, a);
    ok('🔴 미래 예약(scheduled, 2030년)은 예정일에도 안 센다', a.scheduled_days === 4, a);
    ok('출석률 = 출석일 ÷ 예정일 = round(3/4*100) = 75', a.attendance_rate === 75, a);
    ok('제시간 판정은 attended_at 이 있거나 status=attended 인 날', a.on_time_days === 2, a);
    ok('제시간율 = 2/2 = 100 (분모는 «잴 수 있는 날» 뿐)', a.on_time_rate === 100, a);
    ok('days 는 YYYY-MM-DD 오름차순', JSON.stringify(a.days) === JSON.stringify(['2026-07-10','2026-07-11','2026-07-12']), a.days);
  }
  {
    /* 🔴 이 저장소의 실제 다수 사례 — 카페24 동기화 행에는 attended_at 이 아예 없다.
       그때 제시간율은 **0% 가 아니라 «못 잼»(null)** 이다. 이 한 줄이 이 수리의 핵심이다. */
    const rows = [
      { date: '2026-07-01', status: 'present', attended_at: null, joined_at: ms('2026-07-01') },
      { date: '2026-07-02', status: 'present', attended_at: null, joined_at: ms('2026-07-02') },
    ];
    const a = summarizeAttendance(rows, NOW);
    ok('🔴 입장시각 기록이 없으면 제시간율은 null(«—»), 0 이 아니다', a.on_time_rate === null, a);
    ok('그래도 출석일은 정상으로 센다', a.last_30d_days === 2, a);
    ok('전부 출석했으면 출석률 100', a.attendance_rate === 100, a);
  }
  {
    const a = summarizeAttendance([], NOW);
    ok('행이 하나도 없으면 출석률도 null(0 이 아니다)', a.attendance_rate === null, a);
    ok('빈 입력에서 NaN 이 나오지 않는다', a.last_30d_days === 0 && a.on_time_days === 0, a);
  }
  {
    const rows = [{ date: '2026-07-05', status: 'attended', attended_at: 1, joined_at: ms('2026-07-05') }];
    const a = summarizeAttendance(rows, NOW);
    ok('🔴 제시간일은 언제나 출석일의 부분집합', a.on_time_days <= a.last_30d_days, a);
    ok('🔴 어떤 비율도 100을 넘지 않는다', a.on_time_rate <= 100 && a.attendance_rate <= 100, a);
  }
}

// ── 2) 원천 계약 — 마이페이지가 attendance 로 읽고, 판정은 정본 함수에 맡기는가 ──
const truth = readOr('../cloudflare-deploy/src/attendance-truth.ts');
ok('attendance-truth.ts(판정 정본) 존재', truth !== null);
if (truth) {
  ok('정본이 예정(scheduled)을 «출석» 에서 뺀다', /=== 'scheduled'/.test(truth));
  ok('정본이 미래 행(joined_at > now)을 뺀다', /joined_at\);?[\s\S]{0,80}> nowMs/.test(truth) || /joined > nowMs/.test(truth));
  ok('🔴 못 잰 값은 null 로 돌려준다(0 으로 채우지 않는다)', /b > 0 \? [\s\S]{0,40}: null/.test(truth));
}

const students = readOr('../cloudflare-deploy/src/api-students.ts');
ok('api-students.ts 존재', students !== null);
if (students) {
  /* ⚠️ 2026-09-21 — 여기를 «SQL 모양» 으로 못 박아 두었더니, 학생을 «계정»(account_uid)
     으로도 찾게 넓힌 수리에 **보장은 오히려 세졌는데 검사만** 빨간불이 났다.
     ⛔ 그렇다고 «파일 어딘가에 그 글자가 있나» 로 풀지 말 것 — 같은 파일에 attendance
        조회가 여럿이라 그 자리를 딴 표로 바꿔도 통과한다(그렇게 고쳤다가 변이 2종이
        그대로 빠져나갔다). **그 SELECT 의 지문으로 «그 자리» 를 콕 집어** 본다. */
  const mypageSql = /SELECT date, status, attended_at, joined_at\s+FROM attendance\s+WHERE ([\s\S]{0,140}?) AND joined_at >= \?/.exec(students);
  ok('마이페이지 출석을 attendance 테이블에서 읽음(joined_at 필터)', !!mypageSql);
  /* 🔗 짝 — 그 조건이 «계정» 도 보는가(정본). user_id 만 보면 화상수업 출석이 0건이 된다.
     2026-09-21 실사고: 학생 상세·학부모 대시보드가 전부 「출석 0일」이었다. */
  ok('🔴 학생을 찾는 조건이 정본(ATTENDANCE_BY_UID)인가 — user_id 는 기기번호다',
     !!mypageSql && /\$\{ATTENDANCE_BY_UID(_NOCASE)?\}/.test(mypageSql[1]), mypageSql && mypageSql[1]);
  ok('🔴 판정은 정본 함수(summarizeAttendance)에 맡긴다 — 여기서 다시 세지 않는다',
     /summarizeAttendance\(/.test(students));
  ok('🔴 옛 판정(status===\'attended\' 만으로 정시)이 되살아나지 않았다',
     !/r\.status === 'attended'/.test(students), '판정이 파일 안으로 되돌아왔다');
  ok('🔴 옛 버그 패턴(point_rule_log on_time 리더) 미복귀',
     !/rule_code === 'on_time'/.test(students) && !/rule_code === 'attendance'/.test(students),
     'point_rule_log 로 되돌아갔다');
}

// ── 3) 화면이 «못 잼» 을 0% 라고 말하지 않는가 (parent.html) ──
const parentHtml = readOr('../cloudflare-deploy/public/parent.html');
ok('parent.html 존재', parentHtml !== null);
if (parentHtml) {
  /* ⚠️ 부정 검사는 «주석을 벗겨 낸 사본» 으로 한다 — 「왜 바꿨는지」 적은 설명 주석에 옛 패턴을
     그대로 인용해 두면 검사가 자기 주석을 잡는다(CLAUDE.md 2장, 실제로 한 번 밟았다). */
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
  const parentCode = strip(parentHtml);
  ok('🔴 화면이 null 을 «—» 로 그린다(0% 라고 단정하지 않는다)',
     /\(v === null \|\| v === undefined\) \? '—'/.test(parentCode));
  ok('🔴 옛 «(att.on_time_rate||0)+\'%\'» 패턴 미복귀',
     !/on_time_rate\s*\|\|\s*0\)\s*\+\s*'%'/.test(parentCode));
  ok('출석률 칸이 화면에 있다', /id="pd-att-rate"/.test(parentHtml));
}

// ── 4) 쓰기측 정합 — api-mango.ts 가 수업시간 내 입장을 status='attended' 로 쓰는가 ──
const mango = readOr('../cloudflare-deploy/src/api-mango.ts');
ok('api-mango.ts 존재', mango !== null);
if (mango) {
  ok("checkin 이 withinClass 를 'attended' 로 기록", /withinClass \? 'attended' : 'present'/.test(mango));
  ok('attendance.joined_at 는 ms(Date.now) — 리더의 joined_at>=ms 필터와 단위 일치',
     /INSERT INTO attendance[\s\S]{0,400}joined_at/.test(mango) && /const now = Date\.now\(\)/.test(mango));
}

// ── 5) 월간 리포트와 «같은 말» 을 하는가 — 예정(scheduled) 제외가 양쪽에 다 있어야 한다 ──
const reports = readOr('../cloudflare-deploy/src/api-reports.ts');
ok('api-reports.ts 존재', reports !== null);
if (reports) {
  const monthlySql = /COUNT\(DISTINCT date\) AS d FROM attendance\s+WHERE ([\s\S]{0,140}?) AND joined_at >= \?/.exec(reports);
  ok('월간 리포트도 attendance 에서 DISTINCT date 로 집계(같은 원천)', !!monthlySql);
  ok('🔴 월간 리포트도 학생을 정본 조건으로 찾는다 (2026-09-21)',
     !!monthlySql && /\$\{ATTENDANCE_BY_UID\}/.test(monthlySql[1]), monthlySql && monthlySql[1]);
  ok('🔴 월간 리포트도 예정(scheduled)을 뺀다 — 안 빼면 마이페이지와 숫자가 갈린다',
     /COALESCE\(status,''\) <> 'scheduled'/.test(reports));
}

console.log(`\nparent attendance source: ${pass}/${pass + fail} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
