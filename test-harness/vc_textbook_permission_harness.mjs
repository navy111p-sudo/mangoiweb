/**
 * 📚 교재를 «누가» 조종할 수 있는가 — 강사 Melca 빨간글씨 6·7·8번
 *
 *   6. "학생이 교재를 선택할 때 자물쇠 아이콘이 보인다. 강사 계정에만 보여야 한다."
 *   7. "강사가 저에게 펜 권한을 주면, 강사가 펜을 쓰거나 페이지를 옮길 수 없게 된다."
 *   8. "학생이 보드에 파일을 직접 붙여넣을 수 있다. 의도된 기능인지 확인 바란다."
 *
 * [셋 다 뿌리가 하나였다]
 *   상단 탭바의 강사 전용 칩은 잘 숨겨져 있었지만, **교재도구 바(.pdf-controls)는
 *   학생에게도 통째로 열려 있었다.** 그래서 학생이 업로드·라이브러리·페이지넘김·
 *   붙여넣기·드래그를 전부 할 수 있었고, 그 조작이 반 전체에 방송됐다.
 *   강사가 느낀 「제어권 상실」은 권한을 «준» 결과가 아니라, 학생이 처음부터 갖고
 *   있던 조작권으로 강사의 페이지를 되돌린 것이었다.
 *   6번은 다른 갈래다 — 이름 휴리스틱이 «이미 정해진 역할» 을 덮어써서, ?vc_role=student
 *   로 들어온 사람도 이름에 teacher 가 있으면 강사 칩(자물쇠)이 전부 보였다.
 *
 * ⚠️ 되돌리면 안 되는 것
 *   · 학생의 «내 화면에서만» 보기(확대·다운로드·페이지 넘겨보기)는 막지 «않는다».
 *     막는 것은 반 전체에 영향을 주는 조작뿐 — 수업 방해 금지 원칙.
 *   · 이름 휴리스틱은 «내리는» 쪽으로만 작동해야 한다. 올리는 데 쓰면 학생이 강사가 된다.
 *
 * 실행: node test-harness/vc_textbook_permission_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
const js = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');
const x3 = readFileSync(join(PUB, 'js', 'idx-x3.js'), 'utf8');
const html = readFileSync(join(PUB, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); }
};
/* 함수 하나만 잘라 본다 — «파일 어딘가에 그 글자가 있다» 는 검사는 옆 함수 때문에 통과해 버린다. */
const body = (src, startNeedle, endNeedle) => {
  const s = src.indexOf(startNeedle);
  if (s < 0) return '';
  const e = src.indexOf(endNeedle, s + startNeedle.length);
  return e > s ? src.slice(s, e) : src.slice(s, s + 4000);
};

console.log('\n════════ 교재 조작 권한 (Melca 6·7·8) ════════\n');

/* ── ⑥ 자물쇠가 학생에게 보이던 이유: 이름 추측이 확정된 역할을 이겼다 ───────── */
console.log('▶ ⑥ 학생에게 강사 칩(자물쇠)이 보이지 않는가');
const role = body(js, 'function vcIsTeacherRole()', 'window.vcIsStaffNow');
check('vcIsTeacherRole 을 찾았다', role.length > 300);

/* 재발 방지 핵심: 역할 별칭을 여러 곳의 정규식으로 복사하지 않고 한 함수에서만 정한다. */
const normalizeSrc = body(js, 'window.vcNormalizeClassRole = function(raw)', '\n\nfunction vcIsTeacherRole()');
let normalizeRole = null;
try {
  const win = {};
  Function('window', normalizeSrc + '\n; return window.vcNormalizeClassRole;')(win);
  normalizeRole = win.vcNormalizeClassRole;
} catch (_) {}
check('역할 정규화 단일 정본을 실행할 수 있다', typeof normalizeRole === 'function');
if (normalizeRole) {
  const teacherAliases = ['teacher', 'Teacher', ' tutor ', 'instructor', '교사', '강사',
                          'hq_teacher', 'head-teacher', 'english_teacher', 'chinese_teacher',
                          'foreign_teacher', 'native_teacher'];
  teacherAliases.forEach(v => check('강사 별칭 → teacher: ' + v, normalizeRole(v) === 'teacher'));
  ['admin', 'hq', 'hq_admin'].forEach(v =>
    check('관리자 별칭 → admin: ' + v, normalizeRole(v) === 'admin'));
  ['student', 'observer'].forEach(v =>
    check('낮은 권한 유지: ' + v, normalizeRole(v) === v));
  ['student_teacher', 'teacher_assistant', 'not_a_teacher', 'instructor_student', '', null, undefined]
    .forEach(v => check('부분 문자열로 강사 승격 금지: ' + String(v), normalizeRole(v) === ''));
}
check('입장 역할 판정이 단일 정본을 호출한다',
      /_normalizedRole\s*=\s*window\.vcNormalizeClassRole\s*\?\s*window\.vcNormalizeClassRole\(_rr\)/.test(js),
      'join-room 앞에서 별도 정규식을 쓰면 다음 별칭 추가 때 다시 갈라진다');
check('강사 별칭 정규식 복사본이 남아 있지 않다',
      !/teacher\|tutor\|instructor\|교사\|강사/.test(js),
      '복사된 역할 목록은 한쪽만 수정되는 재발 원인이다');

/* 실제로 돌려 본다 — 정규식으로 «그 줄이 있나» 만 보면 순서가 틀려도 통과한다.
   (이름 추측이 위쪽에 남아 있으면 새 가드보다 먼저 return true 를 해 버린다) */
if (role.length > 300) {
  const run = (opts) => {
    const g = {
      getCurrentUser: () => opts.user || null,
      vcRoleStored: () => opts.stored || '',
      vcUsername: opts.name || '',
      window: {},
      MangoV3: null,
    };
    g.window.vcRoleStored = g.vcRoleStored;
    g.window.vcNormalizeClassRole = normalizeRole;
    g.window.MangoV3 = null;
    g.window.vcMyRole = opts.myRole || '';
    g.window.__vcRoleFromUrl = !!opts.fromUrl;
    return Function('getCurrentUser', 'vcRoleStored', 'vcUsername', 'window', 'MangoV3',
                    role + '; return vcIsTeacherRole();')
                   (g.getCurrentUser, g.vcRoleStored, g.vcUsername, g.window, g.MangoV3);
  };

  check('①  ?vc_role=student + 이름이 "Teacher Melca" → 강사 아님',
        run({ myRole: 'student', fromUrl: true, name: 'Teacher Melca' }) === false,
        'URL 이 «학생» 이라고 명시했는데 이름 때문에 승격되면 자물쇠 칩이 학생에게 보인다');
  check('②  서버가 「이 예약의 학생」이라 판정해 내린 뒤에도 다시 안 올라간다',
        run({ myRole: 'student', name: '선생님 Melca' }) === false,
        '서버의 결정이 조용히 뒤집히던 경로');
  check('③  로그인한 학생 아이디에 teacher 가 들어 있어도 강사 아님',
        run({ user: { role: 'student' }, name: 'teacher_kim' }) === false);
  check('④  진짜 강사는 그대로 강사다 (계정 역할)',
        run({ user: { role: 'teacher' }, name: 'Melca' }) === true,
        '내리기만 해야지, 진짜 강사를 막으면 수업이 멈춘다');
  check('④-1 중국어 강사 instructor 역할도 강사다',
        run({ user: { role: 'instructor' }, name: '강선생님' }) === true,
        '화면 이름은 교사여도 계정 역할 별칭을 놓치면 교재 공유가 서버에서 거절된다');
  check('④-2 한국어 교사 역할값도 강사다',
        run({ user: { role: '교사' }, name: '강선생님' }) === true);
  check('⑤  역할이 «아무것도 없을» 때는 예전처럼 이름으로 백업 판정한다',
        run({ name: '교사 홍길동' }) === true,
        '관리자 임베드·데모 입장(로그인 없음)이 이 길로 들어온다');
  check('⑥  역할도 이름도 없으면 학생 (모르면 낮은 쪽)',
        run({ name: 'Melca' }) === false);
}

/* ── ⑦⑧ 반 전체를 바꾸는 조작은 강사만 ─────────────────────────────── */
console.log('\n▶ ⑦⑧ 반 전체를 바꾸는 조작에 게이트가 있는가');
check('권한 판정의 «정본» 이 하나 있다', /window\.vcCanControlTextbook = function/.test(js),
      '곳곳이 제각각이면 «버튼은 보이는데 거절당하는» 어긋남이 다시 난다');
check('정본은 vcIsStaffNow 를 쓴다 (칩 노출과 같은 판정)',
      /vcCanControlTextbook = function[\s\S]{0,300}vcIsStaffNow/.test(js));
check('거절할 때 이유를 말해 준다 (한/영)',
      /교재는 선생님만 바꿀 수 있어요/.test(js) &&
      /Only the teacher can change the textbook/.test(js),
      '조용히 무시하면 학생 눈에는 고장난 버튼이 된다');
check('잔소리 도배 방지 (4초에 한 번)', /__vcTbDenyAt[\s\S]{0,120}4000/.test(js));
check('입장 직전 역할 정규화도 instructor·교사 별칭을 teacher 로 바꾼다',
      /_normalizedRole === 'teacher'/.test(js) && normalizeRole &&
      normalizeRole('instructor') === 'teacher' && normalizeRole('교사') === 'teacher',
      '화면 권한과 WebSocket join-room 역할이 같은 정본을 써야 한다');

const GATED = [
  ['업로드 버튼',        'function triggerUpload(kind) {'],
  ['업로드 본체',        'async function pdfUpload(input) {'],
  ['파일 공유 업로드',   'async function fileShareUpload(input) {'],
  ['공유 중지',          'function pdfStopShare() {'],
  ['교재 파일 통째 이동','function _pdfGoSeqFile(f) {'],
];
GATED.forEach(([label, needle]) => {
  const b = body(js, needle, '\n}');
  check(label + ' 에 게이트가 있다', /vcCanControlTextbook\(\)/.test(b),
        b ? '이 함수 안에 검사가 없다' : '함수를 못 찾았다');
});

const paste = body(js, '(function vcEnableImagePaste(){', '\nasync function pdfLoad');
check('붙여넣기(📋)에 게이트가 있다 — Melca 8번 그 자체',
      /vcCanControlTextbook\(\)/.test(paste));
check('붙여넣기는 «그림일 때만» 거절한다',
      paste.indexOf('vcCanControlTextbook') > paste.indexOf('imgItem.getAsFile()'),
      '글자 붙여넣기까지 거절하면 학생의 평범한 동작에 잔소리가 붙는다');
const drop = body(js, '(function initPdfDropzone(){', '\n})();');
check('끌어다 놓기에도 게이트가 있다', /vcCanControlTextbook\(\)/.test(drop));

console.log('\n▶ ⑦ 페이지 «방송» 만 막고 «보기» 는 막지 않았는가');
const bc = body(js, 'function _pdfBroadcastPage() {', '\n}');
check('학생은 페이지 이동을 방송하지 않는다', /vcCanControlTextbook\(\)/.test(bc),
      '이게 「강사가 페이지를 못 넘긴다」의 실제 원인이었다');
check('내 화면 렌더·표시키 갱신은 그대로 둔다 (게이트보다 «먼저»)',
      bc.indexOf('_pdfSyncShownKey()') < bc.indexOf('vcCanControlTextbook'),
      '여기서 먼저 막으면 학생이 자기 화면에서도 못 넘긴다');
check('⛔ 페이지 넘김 자체를 막지 않았다',
      !/function pdfNextPage\(\) \{\s*if \(!window\.vcCanControlTextbook/.test(js),
      '학생이 자기 화면에서 앞뒤를 보는 것까지 막으면 수업 방해다');

console.log('\n▶ 라이브러리 (교재 갈아치우기)');
const lib = body(x3, 'window.openTextbookLibrary = function(){', '\n  };');
check('수업 중에는 강사만 연다', /vcCanControlTextbook\(\)/.test(lib));
check('수업 밖에서는 예전대로 열린다 (강사 수업 준비)',
      /vc-in-call/.test(lib),
      '조건 없이 막으면 수업 전에 교재를 못 본다');
check('🪤 vcRoomId 로 판정하지 않는다 (idx-main 의 let 이라 window 에 없다)',
      !/window\.vcRoomId/.test(lib),
      'window.vcRoomId 는 늘 undefined → 게이트가 영원히 통과한다');

console.log('\n▶ 버튼 숨김 (동작 게이트와 이중 방어)');
check('교재도구 바를 다시 그리는 함수가 있다', /window\.vcRenderTextbookControls = function/.test(js));
const rend = body(js, 'window.vcRenderTextbookControls = function()', '\n};');
['triggerUpload', 'openTextbookLibrary', 'pdfStopShare'].forEach(k =>
  check('학생에게 숨긴다: ' + k, new RegExp('onclick\\*="' + k).test(rend)));
check('역할이 확정되는 곳에서 함께 불린다',
      /vcClassLockChipsRender[\s\S]{0,3000}vcRenderTextbookControls\(\)/.test(js),
      '한 곳에서 부르지 않으면 로비 입장 강사만 버튼이 사라진다');
check('◀▶·확대·다운로드는 숨기지 않는다',
      !/pdfPrevPage|pdfNextPage|pdfZoom|vcDownloadCurrentTextbook/.test(rend),
      '학생이 자기 화면에서 쓰는 기능이다');

/* 🔴 (2026-08-28 사장님 제보 「라이브러리랑 업로드가 안 되는 거야?」)
   위 네 검사는 **버튼 숨김이 통째로 죽어 있는 동안에도 전부 초록이었다.**
   숨기는 «대상» 도 «호출 시점» 도 다 맞았고, 틀린 것은 «어떻게 숨기는가» 하나뿐이었다:
     b.style.display = 'none'   ← 인라인
     .pdf-controls > button { display: inline-flex !important }   ← 작성자 !important 가 이김
   브라우저 실측(getComputedStyle): 인라인엔 display:none 이 들어가 있는데 계산값은 flex.
   그래서 학생 화면에 📁교재 업로드·📎파일 업로드·📚라이브러리·공유 중지가 그대로 보였고,
   누르면 동작 게이트가 거절해 「보이는데 안 눌리는 버튼」이 됐다.
   ⚠️ 두 줄은 **짝**이다 — 아래 ②가 FAIL 이면 ①의 important 가 더는 필요 없을 수도 있으니
      «지우기» 전에 브라우저에서 계산값을 다시 재라. */
check('① 숨김을 setProperty(…, "important") 로 한다',
      /setProperty\(\s*'display'\s*,\s*'none'\s*,\s*'important'\s*\)/.test(rend),
      "인라인 b.style.display='none' 은 작성자 !important 에 져서 아무 효과가 없다");
check('① 되돌릴 때는 removeProperty 로 푼다',
      /removeProperty\(\s*'display'\s*\)/.test(rend),
      "important 로 박아 둔 값은 style.display='' 로 안 지워진다");
check('② index.html 의 .pdf-controls > button 이 display 를 !important 로 정한다',
      /\.pdf-controls > button[^{]*\{[^}]*display:\s*inline-flex\s*!important/.test(html),
      '이 규칙이 ①의 이유다 — 사라졌으면 ① 주석과 함께 다시 판단할 것');

console.log('\n──────────────────────────────────────────');
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('──────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
