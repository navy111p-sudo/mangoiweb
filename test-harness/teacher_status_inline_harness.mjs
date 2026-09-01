// 🧑‍🏫 강사 «상태» 인라인 변경 하니스 — 활동중 · 비활동 · 퇴사 + 명부 숨김 (2026-09-01)
//
//   왜 필요한가 —
//     사장님 지시: 「퇴사한 강사를 강사 명부에서 비활동으로 바꾸고 싶다.
//     안보임이 아니라 비활동으로 — 즉 활동, 비활동, 그리고 안보임.」
//
//     조사해 보니 상태 세 값은 **이미 있었다**(수정 모달·필터·배지·PATCH 까지).
//     그런데 2026-09-01 운영 D1 실측으로 teacher_profiles 33행 중
//     활동중 32 · 퇴사 1 · **비활동 0**, 퇴사일이 적힌 강사도 0명이었다.
//     쓰이지 않은 이유는 바꾸는 길이 멀어서였고(수정 → 모달 → 스크롤 → 저장),
//     그래서 명부에서 사람을 빼는 실제 수단이 **🗑 영구 삭제뿐**이었다.
//
//   이 하니스가 못 박는 것 —
//     ① 판정 정본이 한 파일(src/teacher-status.ts)이고, **실제로 돌려서** 확인한다
//     ② 「안보임」은 status 값이 **아니다** — list_hidden 이라는 다른 축이다
//     ③ 서버가 모르는 상태값을 400 으로 **거절한다**(오타가 조용히 저장되면
//        그 강사는 어느 목록에도 안 잡힌다 — 배정·급여·순위가 전부 '활동중' 으로 거른다)
//     ④ 🔴 SQL 을 **진짜 SQLite 에 돌린다** — 지연 ALTER 와 숨김 조건이 실제로 먹는지.
//        문자열 검사는 「그 조건이 있는가」만 볼 뿐 「무엇이 걸러지는가」는 못 본다
//     ⑤ 화면 목록과 서버 허용목록이 **같은 말을 하는가**
//        (CLAUDE.md 2장 「화면에서 골랐는데 그 값만 저장이 안 됨」)
//     ⑥ 이 저장소가 실제로 밟은 함정 넷을 피해 갔는가 — 전역 button !important ·
//        아이콘 상자에 data-ko/data-en · body{zoom:1.3} 좌표 · 밝기 페인터
//
//   실행: node test-harness/teacher_status_inline_harness.mjs
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dir);
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0, skip = 0;
const check = (name, ok) => { if (ok) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };
const skipIt = (name) => { skip++; console.log('  ⏭ ' + name); };

/** 부정 검사는 주석을 벗긴 사본으로 — 「왜 그렇게 했는지」 적은 설명 주석이 자기 검사에 걸린다
 *  (CLAUDE.md 2장 「하니스에 부정 검사를 넣었는데 내 주석 때문에 FAIL」). */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const statusSrc = read('cloudflare-deploy/src/teacher-status.ts');
const adminSrc  = read('cloudflare-deploy/src/api-admin.ts');
const coreSrc   = read('cloudflare-deploy/public/js/adm-core.js');
const htmlSrc   = read('cloudflare-deploy/public/admin.html');
const cssSrc    = read('cloudflare-deploy/public/css/admin-inline-c.css');
const paintSrc  = read('cloudflare-deploy/public/js/adm-light-surfaces.js');
const adminCode = strip(adminSrc);
const coreCode  = strip(coreSrc);

console.log('\n[ ① 판정 정본이 전용 파일 «하나» 에 있다 ]');
check('src/teacher-status.ts 가 TEACHER_STATUSES 를 내보낸다',
  /export const TEACHER_STATUSES/.test(statusSrc));
check('canonTeacherStatus · isTeacherStatus · toTeacherListHidden · teacherVisibleSql 을 내보낸다',
  /export function canonTeacherStatus/.test(statusSrc) &&
  /export function isTeacherStatus/.test(statusSrc) &&
  /export function toTeacherListHidden/.test(statusSrc) &&
  /export function teacherVisibleSql/.test(statusSrc));
check('api-admin.ts 는 그 정본을 import 해서 쓴다 (규칙을 다시 쓰지 않았다)',
  /import \{[^}]*TEACHER_STATUSES[^}]*\} from '\.\/teacher-status'/.test(adminSrc));
check('⛔ 상태 목록을 다른 서버 파일에 복사하지 않았다',
  !/const\s+TEACHER_STATUSES\s*[:=]/.test(adminCode));

console.log('\n[ ② 「안보임」은 status 값이 아니라 «다른 축»(list_hidden) 이다 ]');
check('⛔ 상태 목록에 「안보임」이 들어가 있지 않다',
  !/TEACHER_STATUSES[\s\S]{0,200}안보임/.test(strip(statusSrc)));
check('teacher_profiles 에 list_hidden 을 «지연 ALTER» 로 붙인다',
  /ALTER TABLE teacher_profiles ADD COLUMN list_hidden INTEGER DEFAULT 0/.test(adminCode));
check('그 ALTER 는 try/catch 로 감싸 이미 있으면 삼킨다 (배포 실패로 보이지 않게)',
  /try \{ await env\.DB\.exec\(`ALTER TABLE teacher_profiles ADD COLUMN list_hidden[^`]*`\); \} catch \{\}/.test(adminCode));
check('PATCH 허용목록에 list_hidden 이 있다', /'list_hidden'\]/.test(adminCode));
check('list_hidden 은 0/1 로 눕혀서 저장한다',
  /k === 'list_hidden'\) v = toTeacherListHidden/.test(adminCode));

console.log('\n[ ③ 서버가 «모르는 상태값» 을 거절한다 ]');
check('bad_status 로 400 을 돌려준다',
  /error: 'bad_status'/.test(adminCode) && /isTeacherStatus\(_stRaw\)/.test(adminCode));
/* ⚠️ 「UPDATE teacher_profiles SET ${sets…}」 은 이 파일에 **두 곳** 이다 —
     ① /teacher-profiles/import (로스터 대량 임포트)  ② /teacher-profiles/:id PATCH.
   길이로 자르면 옆 핸들러가 딸려 온다(CLAUDE.md 2장). **구조 앵커**로 PATCH 블록만 오려 낸다. */
const tpIdIdx    = adminCode.indexOf('const tpMatch = path.match(');
const tpPatchIdx = adminCode.indexOf("if (method === 'PATCH')", tpIdIdx);
const tpDelIdx   = adminCode.indexOf("if (method === 'DELETE')", tpPatchIdx);
const tpPatchCode = (tpIdIdx > 0 && tpPatchIdx > 0 && tpDelIdx > tpPatchIdx)
  ? adminCode.slice(tpPatchIdx, tpDelIdx) : '';
check('PATCH 핸들러 블록을 오려 낼 수 있다 (앵커가 살아 있다)', tpPatchCode.length > 200);
check('그 블록 안에 PATCH 가 쓰는 UPDATE 문이 있다',
  tpPatchCode.indexOf("UPDATE teacher_profiles SET ${sets.join(', ')} WHERE id = ?") > 0);
check('⛔ 모르는 값을 조용히 null 로 눕히지 않는다 (400 이 UPDATE «앞» 에 있다)',
  tpPatchCode.indexOf("error: 'bad_status'") > 0 &&
  tpPatchCode.indexOf("error: 'bad_status'") < tpPatchCode.indexOf("UPDATE teacher_profiles SET ${sets.join(', ')} WHERE id = ?"));
check('빈 값은 종전대로 허용한다 (미지정 = 활동중으로 읽힌다)', /_stEmpty/.test(adminCode));

console.log('\n[ ③-2 대량 임포트(구글시트 붙여넣기)도 같은 문을 지난다 ]');
/* 🔴 여기가 반쪽이면 화이트리스트가 무의미하다 — /teacher-profiles/import 의 UPD_COLS 에
   'status' 가 있어서 시트에 적힌 문자열이 그대로 들어가고 있었다. */
check('임포트의 UPD_COLS 에 status 가 여전히 있다 (있어야 한다 — 걸러서 쓴다)',
  /UPD_COLS = \[[^\]]*'status'/.test(adminCode));
check('임포트도 canonTeacherStatus 로 거른다',
  /const _canon = canonTeacherStatus\(fields\.status\)/.test(adminCode));
check('모르는 값이면 «그 칸만» 빼고 나머지는 넣는다 (한 행 때문에 전체를 막지 않는다)',
  /delete fields\.status/.test(adminCode));
check('⛔ 조용히 버리지 않는다 — 뺐다는 사실을 응답에 실어 준다',
  /status_ignored: statusIgnored/.test(adminCode));
check('화면이 그 경고를 실제로 그린다',
  /x\.status_ignored/.test(coreCode) && /반영하지 않았습니다/.test(coreSrc));

console.log('\n[ ④ 감사 기록 — 상태·숨김 변경은 배정·급여를 흔든다 ]');
check('admin_audit_logs 에 teacher_status_change 를 남긴다',
  /'teacher_status_change'/.test(adminCode));
check('바꾸기 «전» 값을 먼저 읽어 before/after 로 남긴다',
  /_tpBefore/.test(adminCode) && /before:/.test(adminCode) && /after:/.test(adminCode));
check('⚠️ 기록은 try/catch 안이다 — 감시 장치가 던지면 방금 성공한 수정이 실패로 보인다',
  /catch \(e: any\) \{ console\.error\('\[teacher-status\] audit:'/.test(adminCode));

console.log('\n[ ⑤ 화면 배선 ]');
check('명부 상태 칸이 _tpStatusCell(t) 을 쓴다 (누를 수 있는 배지)',
  /_tpStatusCell\(t\)/.test(coreCode) && /id="tpstc-/.test(coreCode));
check('tpOpenStatusMenu · tpSetTeacherStatus · tpSetTeacherHidden 이 전역에 있다',
  /window\.tpOpenStatusMenu\s*=/.test(coreSrc) &&
  /window\.tpSetTeacherStatus\s*=/.test(coreSrc) &&
  /window\.tpSetTeacherHidden\s*=/.test(coreSrc));
check('되돌리기 토스트가 있다 (손이 스쳐도 되돌릴 수 있어야 한다)',
  /_tpStToast/.test(coreCode) && /tp-st-undo/.test(coreCode));
/* 🔴 숨김의 «되돌리기» 는 행 캐시(_tpRowById)에 기대면 안 된다 — 숨긴 직후 목록을 다시 읽으면
   그 행이 기본 조회에서 빠져 캐시에서도 사라지고, 5초 뒤 되돌리기가 조용히 무동작이 된다
   (2026-09-01 trap-check 가 잡음. 에러가 안 나서 「눌러도 아무 일 없음」으로만 보인다). */
check('숨김 되돌리기는 이름을 «닫힘으로» 넘겨 캐시 없이도 돈다',
  /tpSetTeacherHidden\(id, !hide, true, who\)/.test(coreCode));
check('⛔ tpSetTeacherHidden 이 캐시가 없다고 첫 줄에서 빠져나가지 않는다',
  !/tpSetTeacherHidden = async function \([^)]*\) \{\s*var t = \(window\._tpRowById \|\| \{\}\)\[id\];\s*if \(!t\) return;/.test(coreCode));
check('강사 본인 조회에는 숨김 조건을 걸지 않는다 (관리자가 숨기면 본인 화면이 빈손)',
  /!_tpActor\.isTeacher && \(url\.searchParams\.get\('include_hidden'\)/.test(adminCode));
check('임포트 «반영» 화면에도 무시된 상태값 건수가 남는다 (미리보기에만 있으면 사라진다)',
  /status_ignored; \}\)\.length/.test(coreCode) && /상태값 무시/.test(coreSrc));
check('필터 「🙈 안보임」은 status 가 아니라 ?hidden=1 로 보낸다',
  /params\.set\('hidden', '1'\)/.test(coreCode) &&
  /status === TP_STATUS_HIDDEN_FILTER/.test(coreCode));
check('admin.html 필터에 __hidden__ 선택지가 있다', /<option value="__hidden__"/.test(htmlSrc));
check('서버가 ?hidden=1 / ?include_hidden=1 을 읽는다',
  /url\.searchParams\.get\('hidden'\)/.test(adminCode) &&
  /url\.searchParams\.get\('include_hidden'\)/.test(adminCode));
check('기본 목록은 숨긴 행을 뺀다 (teacherVisibleSql 사용)',
  /where\.push\(teacherVisibleSql\('tp'\)\)/.test(adminCode));
check('상태만 바꿀 때는 표를 다시 그리지 않고 «칸만» 칠한다', /_tpStRepaint/.test(coreCode));

console.log('\n[ ⑥ 이 저장소가 실제로 밟은 함정을 피했는가 ]');
check('전역 button !important 를 ID 접두로 되살렸다 (#tp-list-table td button.tp-st-btn)',
  /#tp-list-table td button\.tp-st-btn \{/.test(cssSrc));
check('⛔ 트리거 버튼에 data-ko/data-en 을 달지 않았다 (배지가 사라지고 문장이 들어앉는다)',
  !/class="tp-st-btn"[^>]*data-ko=/.test(coreCode));
check('설명은 data-ko-title/data-en-title 로 단다',
  /data-ko-title="' \+ tipKo/.test(coreCode) && /data-en-title="' \+ tipEn/.test(coreCode));
check('body{zoom:1.3} 좌표 보정이 있다 (안 나누면 배율만큼 메뉴가 밀린다)',
  /_tpStZoom/.test(coreCode) && /r\.left \/ z/.test(coreCode));
check('밝기 페인터 SKIP_SEL 에 메뉴·토스트를 등재했다 (색이 구분 정보다)',
  /'#tp-st-menu'/.test(paintSrc) && /'#tp-st-toast'/.test(paintSrc));
check('메뉴 z-index 가 모바일 드로어(100001) 위다',
  /#tp-st-menu \{[\s\S]*?z-index: 100002/.test(cssSrc));
check('⛔ 상주 MutationObserver 로 자리를 지키지 않는다 (홈을 멎게 한 전력)',
  !/new MutationObserver[\s\S]{0,400}tp-st-menu/.test(coreCode));
/* 🪤 스크롤에 «닫으면» 안 된다 — 버튼에 포커스가 가며 브라우저가 스스로 스크롤하고,
   그 scroll 이 여는 클릭 직후 도착해 «열리자마자 닫힌다»(2026-09-01 브라우저 실측). */
check('스크롤·리사이즈에는 닫지 말고 «따라간다»',
  /addEventListener\('scroll', _tpStFollow, true\)/.test(coreCode) &&
  /addEventListener\('resize', _tpStFollow\)/.test(coreCode));
check('⛔ scroll 에 _tpStCloseMenu 를 직접 걸지 않았다 (열리자마자 닫히던 원인)',
  !/addEventListener\('scroll', _tpStCloseMenu/.test(coreCode));
check('버튼이 화면 밖으로 나가면 그때는 닫는다',
  /r\.bottom < 0 \|\| r\.top > window\.innerHeight/.test(coreCode));
check('배치는 한 함수(_tpStPlace)로 모았다 — 열 때와 따라갈 때가 어긋나지 않는다',
  /function _tpStPlace/.test(coreCode) && (coreCode.match(/_tpStPlace\(/g) || []).length >= 3);
check('상태 배지에 white-space:nowrap 이 있다 (좁은 칸에서 「🚪 퇴사」가 쪼개졌다)',
  /white-space:nowrap[^']*'\s*\+\s*\n?\s*s\.emoji/.test(coreSrc) || /border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap/.test(coreSrc));
check('배지가 밝기 페인터 SKIP_SEL 에 등재됐다', /'\.tp-st-badge'/.test(paintSrc) && /class="tp-st-badge"/.test(coreSrc));
/* 🔴 관리자 화면에는 글자색을 «인라인 !important» 로 덮는 페인터가 셋이다.
   2026-09-01 브라우저 실측: 셋을 그냥 두면 퇴사 배지가 «연분홍 위 흰 글자»(대비 2.2)가 됐다.
   CSS 로는 못 이긴다(인라인 !important) — 그래서 세 곳 «모두» 에 등재하는 것이 짝이다. */
const s12Src = read('cloudflare-deploy/public/js/adm-s12.js');
const s13Src = read('cloudflare-deploy/public/js/adm-s13.js');
check('adm-s12(darken)도 배지를 건너뛴다', /KEEP_SEL = '\.tp-st-badge'/.test(s12Src) && /el\.matches\(KEEP_SEL\)/.test(s12Src));
check('adm-s13(fixTextOnDark)도 배지를 건너뛴다', /TX_KEEP = '\.tp-st-badge'/.test(s13Src) && /t\.matches\(TX_KEEP\)/.test(s13Src));
/* 🔴 `background:#f…` 로 쓰면 admin-inline-c.css 의 옛 다크 규칙이 !important 로 덮어
   **배경이 투명**해진다(실측 rgba(0,0,0,0) — 세 상태가 화면에서 구분되지 않았다). */
check('배지 배경은 background-color 로 쓴다 (background: 는 옛 규칙에 먹힌다)',
  /style="background-color:' \+ s\.bg/.test(coreSrc) && !/style="background:' \+ s\.bg/.test(coreSrc));
check('«성공이라고 말했는가» 로 판정한다 (종단 404 본문에는 ok 칸이 없다)',
  /d\.ok !== true/.test(coreCode));
check('⛔ 🗑 영구 삭제 동작은 건드리지 않았다 (별건 — 사람이 정할 일)',
  /DELETE FROM teacher_profiles WHERE id = \?/.test(adminCode));

console.log('\n[ ⑦ 🔴 정본 모듈을 «실제로 돌려» 본다 ]');
const tsPath = resolve(root, 'cloudflare-deploy/node_modules/typescript/lib/typescript.js');
let mod = null;
if (!existsSync(tsPath)) {
  skipIt('typescript 없음 — 컴파일 실행 검사 건너뜀 (npm ci 필요)');
} else {
  const ts = (await import(pathToFileURL(tsPath).href)).default;
  const js = ts.transpileModule(statusSrc, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));

  check('허용 상태는 정확히 세 가지다',
    JSON.stringify(mod.TEACHER_STATUSES) === JSON.stringify(['활동중', '비활동', '퇴사']));
  check('아는 값은 통과한다', ['활동중', '비활동', '퇴사'].every(s => mod.isTeacherStatus(s)));
  check('모르는 값·오타는 막는다',
    !mod.isTeacherStatus('비활둥') && !mod.isTeacherStatus('휴직') &&
    !mod.isTeacherStatus('안보임') && !mod.isTeacherStatus('hidden'));
  check('옛 별칭 「재직」은 활동중으로 눕는다', mod.canonTeacherStatus('재직') === '활동중');
  check('앞뒤 공백은 다듬는다', mod.canonTeacherStatus('  퇴사 ') === '퇴사');
  check('NULL·빈 값은 «활동중» 으로 읽는다 (옛 행이 그렇게 들어 있다)',
    mod.isActiveTeacherStatus(null) && mod.isActiveTeacherStatus('') && mod.isActiveTeacherStatus('활동중'));
  check('비활동·퇴사는 «활동» 이 아니다',
    !mod.isActiveTeacherStatus('비활동') && !mod.isActiveTeacherStatus('퇴사'));
  check('list_hidden 은 0/1 로만 눕는다',
    mod.toTeacherListHidden(true) === 1 && mod.toTeacherListHidden('1') === 1 &&
    mod.toTeacherListHidden(0) === 0 && mod.toTeacherListHidden(null) === 0 &&
    mod.toTeacherListHidden('아무거나') === 0);
  check('칸이 없던 옛 행(undefined/NULL)은 «보임» 이다',
    !mod.isTeacherListHidden(undefined) && !mod.isTeacherListHidden(null) && !mod.isTeacherListHidden(''));

  console.log('\n[ ⑧ 화면 목록과 서버 허용목록이 «같은 말» 을 하는가 ]');
  const m = coreSrc.match(/var TP_STATUS_LIST = (\[[^\]]*\]);/);
  const clientList = m ? JSON.parse(m[1].replace(/'/g, '"')) : null;
  check('adm-core.js 의 TP_STATUS_LIST 를 읽을 수 있다', Array.isArray(clientList));
  check('화면 목록 == 서버 TEACHER_STATUSES (순서까지)',
    JSON.stringify(clientList) === JSON.stringify(mod.TEACHER_STATUSES));
  const filterBlock = htmlSrc.slice(htmlSrc.indexOf('id="tp-filter-status"'), htmlSrc.indexOf('id="tp-filter-group"'));
  const filterVals = [...filterBlock.matchAll(/<option value="([^"]*)"/g)].map(x => x[1]);
  check('필터 선택지 = 전체 + 서버 상태 3종 + __hidden__ (모르는 값이 섞이지 않았다)',
    JSON.stringify(filterVals) === JSON.stringify(['', ...mod.TEACHER_STATUSES, '__hidden__']));
  check('화면이 그리는 배지 3종이 전부 서버가 아는 값이다',
    mod.TEACHER_STATUSES.every(s => coreSrc.indexOf("'" + s + "':") >= 0));
}

console.log('\n[ ⑨ 🔴 SQL 을 «진짜 SQLite» 에 돌린다 ]');
let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
if (!DatabaseSync) {
  skipIt('node:sqlite 없음 — SQL 실행 검사 건너뜀');
} else if (!mod) {
  skipIt('정본 모듈 미로드 — SQL 실행 검사 건너뜀');
} else {
  // 소스에서 «실제로 쓰는» DDL 을 오려 낸다 — 하니스가 따로 적으면 어긋난다.
  /* ⚠️ 이 파일에는 teacher_profiles CREATE 가 «두 벌» 있다 — 1946행의 짧은 보강용(7칸)과
     ensureTeacherProfilesSchema() 의 정본(27칸). 둘 다 IF NOT EXISTS 라 실서비스에서는
     먼저 도는 쪽이 이긴다. 여기서는 **긴 쪽(정본)** 을 골라야 실제 스키마와 같아진다. */
  const creates = [...adminSrc.matchAll(/CREATE TABLE IF NOT EXISTS teacher_profiles \(id INTEGER PRIMARY KEY AUTOINCREMENT[^`]*?\);/g)]
    .map(x => x[0]).sort((a, b) => b.length - a.length);
  const createM = creates.length ? [creates[0]] : null;
  const alterM  = adminSrc.match(/ALTER TABLE teacher_profiles ADD COLUMN list_hidden INTEGER DEFAULT 0/);
  check('소스에서 CREATE·ALTER 를 오려 냈다', !!createM && !!alterM);
  check('정본 CREATE 에 created_at 이 있다 (짧은 보강용을 잘못 고르지 않았다)',
    !!createM && /created_at INTEGER NOT NULL/.test(createM[0]));

  const db = new DatabaseSync(':memory:');
  db.exec(createM[0]);
  db.exec(alterM[0]);
  let secondThrew = false;
  try { db.exec(alterM[0]); } catch { secondThrew = true; }
  check('같은 ALTER 를 두 번 돌리면 SQLite 가 막는다 → 그래서 try/catch 가 필요하다', secondThrew);

  const now = Date.now();
  const ins = db.prepare(`INSERT INTO teacher_profiles (korean_name, status, created_at) VALUES (?,?,?)`);
  ins.run('활동강사', '활동중', now);
  ins.run('비활동강사', '비활동', now);
  ins.run('퇴사강사', '퇴사', now);
  ins.run('옛행_상태없음', null, now);
  const hiddenId = ins.run('숨긴강사', '퇴사', now).lastInsertRowid;
  db.prepare(`UPDATE teacher_profiles SET list_hidden = ? WHERE id = ?`).run(1, hiddenId);

  const vis = mod.teacherVisibleSql('tp');
  const q = (where) => db.prepare(
    `SELECT tp.korean_name AS n FROM teacher_profiles tp WHERE ${where} ORDER BY tp.id`
  ).all().map(r => r.n);

  check('기본 목록에서 숨긴 강사가 빠진다 (그리고 나머지 넷은 그대로)',
    JSON.stringify(q(vis)) === JSON.stringify(['활동강사', '비활동강사', '퇴사강사', '옛행_상태없음']));
  check('?hidden=1 이면 숨긴 강사«만» 나온다 (지워진 것이 아님을 화면이 증명한다)',
    JSON.stringify(q('COALESCE(tp.list_hidden, 0) = 1')) === JSON.stringify(['숨긴강사']));
  check('?include_hidden=1 이면 다섯 명 전부 나온다', q('1=1').length === 5);
  check('⚠️ 칸이 NULL 인 옛 행도 «보임» 이다 (COALESCE 가 없으면 통째로 사라진다)',
    (() => {
      db.prepare(`UPDATE teacher_profiles SET list_hidden = NULL WHERE korean_name = ?`).run('활동강사');
      return q(vis).indexOf('활동강사') >= 0;
    })());
  check('숨김은 «삭제» 가 아니다 — 행이 그대로 남아 있다',
    db.prepare(`SELECT COUNT(*) c FROM teacher_profiles`).get().c === 5);

  const ordered = db.prepare(
    `SELECT korean_name AS n FROM teacher_profiles ORDER BY status='활동중' DESC, korean_name ASC`
  ).all().map(r => r.n);
  check('정렬은 종전대로 «활동중 먼저» 다', ordered[0] === '활동강사');
  db.close();
}

console.log('\n──────────────────────────────');
console.log(`  PASS ${pass} / FAIL ${fail}` + (skip ? ` / SKIP ${skip}` : ''));
if (fail > 0) { console.log('  ❌ 실패가 있습니다.'); process.exit(1); }
console.log('  ✅ 전부 통과');
