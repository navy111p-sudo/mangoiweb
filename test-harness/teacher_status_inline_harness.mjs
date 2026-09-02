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

console.log('\n[ ⑤-2 계정 연결이 두 개인 강사가 «두 줄» 로 보이던 것 ]');
check('목록 조회에 teacher_account_links LEFT JOIN 이 남아 있지 않다',
  !/LEFT JOIN teacher_account_links/.test(adminCode));
check('목록·단건이 «같은» 조각(PICK_LOGIN_USERNAME)을 쓴다 — 서로 다른 계정을 보여 주지 않게',
  (adminCode.match(/\$\{PICK_LOGIN_USERNAME\}/g) || []).length === 2);
check('연결 개수(login_link_count)를 함께 내려준다',
  /LOGIN_LINK_COUNT/.test(adminCode) && /login_link_count/.test(adminCode));
check('화면이 그 사실을 말한다 (연결 N개 표시)',
  /_tpLinkDupChip/.test(coreCode) && /login_link_count \|\| 0\) > 1/.test(coreCode));
check('그 표시도 background-color 로 쓴다 (background: 는 옛 규칙에 먹힌다)',
  /tp-link-dup[\s\S]{0,400}background-color:#fef3c7/.test(coreSrc));

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
/* ⚠️ 목록을 «정확한 문자열» 로 못 박지 않는다 — 다른 배지를 한 항목 더해도 FAIL 이 나서,
      보장은 오히려 세지는데 검사만 깨진다(2026-09-01 .tr-st-badge 를 더하다 실제로 밟음).
      물어야 할 것은 «그 목록에 우리 배지가 들어 있는가» 이고, 목록을 잘라서 본다. */
const keepList = (s12Src.match(/KEEP_SEL\s*=\s*'([^']*)'/) || [, ''])[1];
check('adm-s12(darken)도 배지를 건너뛴다',
  keepList.split(',').map(x => x.trim()).includes('.tp-st-badge') && /el\.matches\(KEEP_SEL\)/.test(s12Src));
const txList = (s13Src.match(/TX_KEEP\s*=\s*'([^']*)'/) || [, ''])[1];
check('adm-s13(fixTextOnDark)도 배지를 건너뛴다',
  txList.split(',').map(x => x.trim()).includes('.tp-st-badge') && /t\.matches\(TX_KEEP\)/.test(s13Src));
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

  /* ═══ 🔴 계정 연결이 두 개여도 «한 줄» 이어야 한다 (2026-09-01 사장님 「왜 Len 이 두 명이나?」)
     LEFT JOIN 이던 시절에는 링크가 두 줄이면 프로필 하나가 두 행으로 그려졌다.
     ⚠️ 이건 «문자열로 조인이 없나» 를 보는 것으로는 못 박을 수 없다 — 진짜로 돌려서 행 수를 센다. */
  db.exec(`CREATE TABLE IF NOT EXISTS teacher_account_links (username TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, teacher_name TEXT, linked_by TEXT, linked_at INTEGER);`);
  db.exec(`ALTER TABLE teacher_profiles ADD COLUMN linked_teacher_id INTEGER`);
  const lenId = ins.run('Teacher Len', '활동중', now).lastInsertRowid;
  db.prepare(`UPDATE teacher_profiles SET linked_teacher_id = 18 WHERE id = ?`).run(lenId);
  // 운영 D1 실측 그대로 — 대소문자만 다른 계정 두 개가 같은 원부 18번에 걸려 있었다
  const insL = db.prepare(`INSERT INTO teacher_account_links (username, teacher_id, teacher_name, linked_at) VALUES (?,?,?,?)`);
  insL.run('mangoi_168', '18', 'LEN', 1756200038000);   // 2026-08-26 20:20 연결 · 로그인 3회
  insL.run('Mangoi_168', '18', 'LEN', 1756285346000);   // 2026-08-27 18:02 연결 · 로그인 26회(실사용)

  // 소스에서 «실제로 쓰는» 두 조각을 오려 낸다 — 하니스가 따로 적으면 어긋난다
  const pickM = adminSrc.match(/const PICK_LOGIN_USERNAME = `([\s\S]*?)`;/);
  const cntM  = adminSrc.match(/const LOGIN_LINK_COUNT = `([\s\S]*?)`;/);
  check('소스에서 login_username 서브쿼리를 오려 냈다', !!pickM && !!cntM);
  if (pickM && cntM) {
    const rows = db.prepare(
      `SELECT tp.id, tp.korean_name AS n, ${pickM[1]}, ${cntM[1]} FROM teacher_profiles tp WHERE tp.id = ?`
    ).all(lenId);
    check('🔴 링크가 두 개여도 «한 줄» 이다 (LEFT JOIN 이면 두 줄이 된다)', rows.length === 1,
      rows.length + '줄');
    check('고르는 계정은 «가장 최근에 연결한» 것이다 (실측상 실사용 계정과 같다)',
      rows[0] && rows[0].login_username === 'Mangoi_168', rows[0] && rows[0].login_username);
    check('⛔ 중복을 감추지 않는다 — 몇 개인지 함께 내려준다',
      rows[0] && rows[0].login_link_count === 2, rows[0] && rows[0].login_link_count);
    // 링크가 하나뿐인 평범한 강사도 그대로여야 한다
    db.prepare(`DELETE FROM teacher_account_links WHERE username = ?`).run('mangoi_168');
    const one = db.prepare(
      `SELECT tp.id, ${pickM[1]}, ${cntM[1]} FROM teacher_profiles tp WHERE tp.id = ?`
    ).all(lenId);
    check('링크가 하나면 그 아이디를 그대로 준다', one.length === 1 && one[0].login_username === 'Mangoi_168');
    check('링크가 하나면 «연결 N개» 표시가 안 뜬다 (count === 1)', one[0].login_link_count === 1);
    // 연결이 아예 없는 강사는 NULL (추측하지 않는다)
    const none = db.prepare(
      `SELECT ${pickM[1]}, ${cntM[1]} FROM teacher_profiles tp WHERE tp.korean_name = '활동강사'`
    ).all();
    check('연결이 없으면 NULL 이다 (아이디를 지어내지 않는다)',
      none[0] && none[0].login_username === null && none[0].login_link_count === 0);
  }

  /* 🔴 «LEFT JOIN 으로 되돌리면 두 줄이 된다» 를 이 자리에서 증명한다 —
     그래야 이 검사가 헛돌지 않는다는 것이 눈에 보인다. */
  insL.run('mangoi_168', '18', 'LEN', 1756200038000);
  const joined = db.prepare(
    `SELECT tp.id FROM teacher_profiles tp
       LEFT JOIN teacher_account_links tal ON CAST(tal.teacher_id AS TEXT) = CAST(tp.linked_teacher_id AS TEXT)
      WHERE tp.id = ?`
  ).all(lenId);
  check('(대조) 옛 LEFT JOIN 은 실제로 두 줄을 만든다 — 그래서 바꾼 것이다', joined.length === 2,
    joined.length + '줄');
  db.close();
}

/* ══════════════════════════════════════════════════════════════
   ⑩ 「강사 명부 (실데이터)」 상태 배지 — 색이 «구분 정보» 다
   ══════════════════════════════════════════════════════════════
   [왜] 이 배지는 인라인 style 로 색을 갖고 있어서, 카드 «안» 에서는 테마 규칙
        html[data-admin-theme="ivory"][data-admin-tone="slate"] [id^="card-"] .sub-body :is(span…)
        의 color:#101828 !important 에 눌려 **재직·퇴사·미확인 세 상태가 전부 검정**이었다
        (2026-09-01 브라우저 실측: 셋 다 rgb(16,24,40) — 색으로 가릴 수 없었다).
   ⚠️ 문자열 하니스가 못 잡던 종류다 — 함수도 값도 다 «있고» 틀린 것은 «무슨 색으로 그려지는가»
      뿐이라 수리 전에도 --fast 가 전부 초록이었다. 그래서 여기서는 «배선» 만 못 박고,
      실제 색·대비는 브라우저로 잰다(manual/teacher-status-inline-browser.mjs).
   ⛔ 인라인 색으로 되돌리지 말 것. ⛔ background 단축(`background:`)으로 쓰지 말 것. */
const p7Src   = read('cloudflare-deploy/public/js/adm-p7.js');
const trCss   = read('cloudflare-deploy/public/css/admin-inline-c.css');

check('실데이터 명부 배지가 클래스를 쓴다 (인라인 색은 테마 규칙에 눌린다)',
  /class="'\s*\+\s*stCls\s*\+\s*'"/.test(p7Src) && /tr-st-badge tr-st-/.test(p7Src));
check('그 자리에 인라인 색이 남아 있지 않다',
  !/font-weight:700;background:'\s*\+\s*stStyle\s*\+\s*'">'\s*\+\s*_trStatLabel/.test(p7Src));

/* 조상 id 를 앞에 붙여야 테마 규칙(!important, id 0개)을 이긴다 — 클래스만 쌓으면 진다. */
const trRules = (trCss.match(/^#card-teacher-mgmt \.tr-st-badge[^\n]*$/gm) || []);
check('CSS 가 조상 id(#card-teacher-mgmt)로 되살린다', trRules.length >= 4, trRules.length + '줄');
for (const st of ['active', 'inactive', 'unknown']) {
  const rule = trRules.find(r => r.includes('.tr-st-' + st));
  check(`  ${st} 상태에 색이 정해져 있다`, !!rule && /color:\s*#[0-9a-f]{6}\s*!important/i.test(rule));
  check(`  ${st} 배경은 background-color 로 쓴다`, !!rule && /background-color:/.test(rule));
}
/* 세 상태가 «서로 다른» 색이어야 구분이 산다 — 같은 색이면 클래스만 붙이고 뜻은 그대로다. */
const trColors = trRules.map(r => (r.match(/[^-]color:\s*(#[0-9a-f]{6})/i) || [, ''])[1]).filter(Boolean);
check('세 상태의 글자색이 서로 다르다', new Set(trColors).size === 3, trColors.join(' '));

/* 글자색을 인라인 !important 로 덮는 페인터 셋에 «모두» 등재돼야 한다(한 곳만 하면 나머지가 덮는다). */
check('실데이터 배지도 밝기 페인터 SKIP_SEL 에 등재됐다', /'\.tr-st-badge'/.test(paintSrc));
check('실데이터 배지도 adm-s12 KEEP_SEL 에 등재됐다',
  keepList.split(',').map(x => x.trim()).includes('.tr-st-badge'));
check('실데이터 배지도 adm-s13 TX_KEEP 에 등재됐다',
  txList.split(',').map(x => x.trim()).includes('.tr-st-badge'));

/* ══════════════════════════════════════════════════════════════
   ⑪ 퇴사·비활동 강사의 «수업입장 🎥 · 수업관찰 👁» 은 흐리게
   ══════════════════════════════════════════════════════════════
   [왜] 사장님 「퇴사시켰는데 왜 파란 불이 그대로 켜져 있나」(2026-09-02).
        브라우저 실측상 활동중·비활동·퇴사 세 행의 액션 버튼 색이 **완전히 같아서**,
        퇴사 처리를 해도 그 줄에서 눈에 달라지는 것이 하나도 없었다.
   ⛔ 버튼을 없애거나 disabled 로 만들지 않는다 — 지난 수업 확인이 걸려 있고,
      「보이는데 안 눌린다」는 그것대로 고장으로 읽힌다. 흐리게 + 툴팁으로 이유를 말한다.
   ⚠️ 판정을 화면에 다시 적으면(`t.status === '퇴사'`) «비활동» 이 빠지거나 NULL 처리가
      어긋난다 — 그래서 정본과 «같은 답» 인지 아래에서 실제로 돌려 대조한다. */
const coreSrc2 = read('cloudflare-deploy/public/js/adm-core.js');
const cssSrc2  = read('cloudflare-deploy/public/css/admin-inline-c.css');

check('화면 판정 헬퍼 _tpIsWorking 이 있다', /function _tpIsWorking\s*\(/.test(coreSrc2));
check('흐리게 하는 두 버튼에만 클래스가 붙는다', (() => {
  // 버튼을 그리는 줄만 잘라 «어느 버튼이 _tpDimCls 를 받는가» 를 센다.
  const lines = coreSrc2.split('\n').filter(l => /class="tp-act-btn tp-act--/.test(l));
  const dimmed = lines.filter(l => l.includes('_tpDimCls')).map(l => (l.match(/tp-act--(\w+)/) || [])[1]);
  const plain  = lines.filter(l => !l.includes('_tpDimCls')).map(l => (l.match(/tp-act--(\w+)/) || [])[1]);
  return dimmed.sort().join(',') === 'ghost,video'
      && !plain.some(k => k === 'ghost' || k === 'video');
})());
check('상세보기·수정·제거는 흐려지지 않는다 (지난 수업 확인이 걸려 있다)', (() => {
  const lines = coreSrc2.split('\n').filter(l => /class="tp-act-btn tp-act--(view|edit|del)/.test(l));
  return lines.length >= 3 && lines.every(l => !l.includes('_tpDimCls'));
})());
check('CSS 가 opacity 로 흐리게 한다 (글자색 페인터가 안 건드리는 속성)',
  /#tp-list-table td button\.tp-act-btn\.tp-act--dim\s*\{[^}]*opacity:\s*\.?\d/.test(cssSrc2));
check('disabled 로 막지 않는다 (눌리면 기존 안내가 사실대로 답한다)',
  !/tp-act--dim[^\n]*disabled/.test(coreSrc2));
/* 🔴 행을 다시 그린 «뒤» 에 도는 _tpPaintLive 가 👁 툴팁을 덮어쓴다 —
      거기서도 같은 사유를 말해야 그리는 쪽이 붙인 설명이 조용히 사라지지 않는다. */
check('나중에 도는 _tpPaintLive 도 퇴사·비활동 사유를 유지한다',
  /dataset\.working === '0'/.test(coreSrc2) && /_notWorking \?/.test(coreSrc2));
check('행이 data-working 을 싣는다 (_tpPaintLive 가 읽는 근거)',
  /data-working="' \+ \(_tpWorking \? '1' : '0'\)/.test(coreSrc2));

/* 🔬 정본과 «같은 답» 인가 — 문자열이 아니라 두 함수를 나란히 돌려 대조한다. */
if (mod && mod.isActiveTeacherStatus) {
  const m = coreSrc2.match(/function _tpIsWorking\s*\([\s\S]*?\n\}/);
  if (!m) {
    check('화면 판정 함수를 오려 낼 수 있다', false);
  } else {
    const fn = new Function(m[0] + '; return _tpIsWorking;')();
    const cases = ['활동중', '비활동', '퇴사', '재직', '  퇴사 ', '', '  ', 'hidden', '비활둥'];
    const diff = cases.filter(c => fn(c) !== mod.isActiveTeacherStatus(c));
    check('화면 판정이 서버 정본과 같은 답을 낸다 (NULL·빈 값 포함)',
      diff.length === 0 && fn(null) === mod.isActiveTeacherStatus(null)
                        && fn(undefined) === mod.isActiveTeacherStatus(undefined),
      diff.length ? '어긋남: ' + diff.join(' ') : '');
    check('  상태를 한 번도 안 만진 옛 행(NULL)은 흐려지지 않는다', fn(null) === true && fn('') === true);
    check('  퇴사·비활동만 흐려진다', fn('퇴사') === false && fn('비활동') === false && fn('활동중') === true);
  }
} else {
  skipIt('typescript 없음 — 정본 대조 건너뜀');
}

console.log('\n──────────────────────────────');
console.log(`  PASS ${pass} / FAIL ${fail}` + (skip ? ` / SKIP ${skip}` : ''));
if (fail > 0) { console.log('  ❌ 실패가 있습니다.'); process.exit(1); }
console.log('  ✅ 전부 통과');
