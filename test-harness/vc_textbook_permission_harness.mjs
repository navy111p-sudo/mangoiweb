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

console.log('\n──────────────────────────────────────────');
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('──────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
