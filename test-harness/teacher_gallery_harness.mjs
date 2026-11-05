// -*- coding: utf-8 -*-
// 👨‍🏫 홈 «강사 소개» 창 — 시안 A(스플릿 뷰) 하니스 (2026-11-04)
//   실행: node test-harness/teacher_gallery_harness.mjs
//
//   왜: 사장님 「PC 에서 글씨가 작아서 교사 프로필을 볼 수 없어」 → 옛 창(폭 600px·본문 10.5px)을
//       js/teacher-gallery.js(처음 열 때 불러오는 모듈)로 바꿨다.
//   무엇을 보나 — «글자가 있는가» 가 아니라, 모듈을 node 에서 «실제로 돌려» 답을 본다.
//     ① 배선   : idx-grid-menu.js 가 모듈을 버전과 함께 부르고, 그 버전이 파일 내용과 맞는가(캐시)
//     ② 안전   : 이름·주소를 탈출하는가 · javascript: 주소를 거르는가 · 내부 분류(group_name)를 안 그리는가
//     ③ 판정   : 국가 칸·년차/소개 가르기·유튜브 주소·검색 (짝: «되는 것» 과 «안 되는 것» 을 함께)
//     ④ 문구   : KO/EN 키·모양이 짝을 이루는가
//     ⑤ 그림   : 모듈이 가리키는 그림 파일(힉스필드 생성)이 실제로 있는가 — 없으면 화면은 그라데이션만
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = resolve(__dir, '../cloudflare-deploy/public');
const ROOT = resolve(__dir, '..');
const rd = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok) => { if (ok) { PASS++; console.log('  ✅ ' + name); } else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name); } };

const modSrc = rd(join(PUB, 'js/teacher-gallery.js'));
const grid   = rd(join(PUB, 'js/idx-grid-menu.js'));
const home   = rd(join(PUB, 'index.html'));
const manifest = JSON.parse(rd(resolve(__dir, 'asset-versions.json')) || '{}');

/* 중괄호 짝으로 함수 몸통을 자른다(문자열·주석 안 중괄호는 이 두 함수에 없음 — 전제 검사로 확인). */
function bodyOf(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return '';
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(j, k + 1); }
  }
  return '';
}

console.log('\n[ ① 배선 — 홈이 새 모듈을 부르고, 캐시 버전이 내용과 맞는다 ]');
check('모듈 파일이 있다 (js/teacher-gallery.js)', modSrc.length > 1000);
const srcM = /var TG_SRC = '(\/js\/teacher-gallery\.js)\?v=(\d+)'/.exec(grid);
check('idx-grid-menu.js 가 모듈을 «?v=숫자» 와 함께 부른다', !!srcM);
if (srcM) {
  const key = `${srcM[1]}?v=${srcM[2]}`;
  const sha = createHash('sha256').update(Buffer.from(modSrc, 'utf8').toString('binary').replace(/\r\n/g, '\n'), 'binary').digest('hex').slice(0, 16);
  check(`원장(asset-versions.json)에 ${key} 가 있다 — 없으면 이 키와 해시 ${sha} 를 넣을 것`, !!manifest[key]);
  check(`모듈 내용이 그 버전의 해시와 같다 (다르면 ?v= 를 올리고 원장을 갱신 — 안 그러면 옛 파일이 캐시에 남음)`, manifest[key] === sha);
}
const v = Number((home.match(/idx-grid-menu\.js\?v=(\d+)/) || [])[1] || 0);
check(`index.html 이 idx-grid-menu.js 를 37 이상으로 부른다 [현재 ${v}]`, v >= 37);
const tAct = bodyOf(grid, 'teachers:    () =>');
check('강사 소개 버튼이 불러오는 한 줄을 띄우고 모듈을 연다', /showModal\(TEACHERS_BOOT\(\)\)/.test(tAct) && /openTeacherGallery\(\)/.test(tAct));
check('강사 소개 음성 안내(15초)는 그대로 남아 있다', /teacher-intro-voice/.test(tAct) && /\/audio\/teacher-intro\.mp3/.test(tAct));
check('다른 정보 창을 열 때 강사 창을 정리한다 (showModal → tgClose)', /tgClose\(\)/.test(bodyOf(grid, 'function showModal(html)')));
check('창을 닫을 때 강사 창을 정리한다 (closeInfoModal → tgClose — 영상 소리 남지 않게)', /tgClose\(\)/.test(bodyOf(grid, 'window.closeInfoModal = function()')));
/* 불러오는 함수를 오려 내 가짜 창·문서로 «실제로» 돌린다 — «stillWaiting 이라는 글자가 있는가» 로는
   조건에서 빼도 정의부가 걸려 통과했다(변이시험 실측). */
{
  const body = bodyOf(grid, 'function openTeacherGallery()');
  const runLoader = ({ display = 'flex', boot = true, mod = true } = {}) => {
    const calls = { open: 0, scripts: [] };
    const bootEl = { textContent: 'loading' };
    const doc = {
      getElementById: (id) => (id === 'tg-boot' && boot ? bootEl : null),
      createElement: () => ({ remove() {} }),
      head: { appendChild: (s) => calls.scripts.push(s) },
    };
    const w = mod ? { MangoiTeacherGallery: { open: () => { calls.open++; } } } : {};
    try {
      new Function('modal', 'document', 'window', 'TG_SRC', 'tgBootMsg', body)({ style: { display } }, doc, w, '/js/teacher-gallery.js?v=X', (k) => 'msg:' + k);
    } catch (e) { calls.err = e.message; }
    return { calls, w, bootEl };
  };
  check('(전제) 불러오는 함수를 오려 냈다', body.length > 100);
  check('창이 열려 있고 기다리는 중이면 모듈을 연다', runLoader().calls.open === 1);
  check('불러오는 사이 창을 닫았으면 붙이지 않는다 (숨은 창에 그리기 방지)', runLoader({ display: 'none' }).calls.open === 0);
  check('다른 정보 창으로 바뀌었으면(tg-boot 없음) 붙이지 않는다', runLoader({ boot: false }).calls.open === 0);
  const nm = runLoader({ mod: false });
  const sc = nm.calls.scripts[0] || {};
  check('모듈이 아직 없으면 버전 붙은 주소로 한 번 불러온다', nm.calls.scripts.length === 1 && sc.src === '/js/teacher-gallery.js?v=X');
  nm.w.MangoiTeacherGallery = { open: () => { nm.calls.open++; } };
  try { sc.onload && sc.onload(); } catch (e) {}
  check('불러오기가 끝나면 그때 연다', nm.calls.open === 1);
  try { sc.onerror && sc.onerror(); } catch (e) {}
  check('불러오기에 실패하면 «다시 시도» 안내로 바꾼다 (빈 창 금지)', nm.bootEl.textContent === 'msg:error');
}
check('옛 갤러리·상세창 코드가 남아 있지 않다 (두 벌 금지)', !/loadDynamicTeacherGallery|openTeacherDetail|__renderTeacherGallery/.test(grid));
// (같은 이름이 성적표·후기 «예시 데이터» 에도 쓰여서 이름으로는 못 묻는다 — 옛 갤러리 «틀» 이 남았는지로 묻는다)
check('옛 정적 갤러리(지어낸 강사 6명 카드)가 남아 있지 않다', !/ph-gallery-dynamic|class="ph-card"|ph-gallery-heading/.test(grid));

console.log('\n[ 모듈을 node 에서 실제로 불러온다 ]');
const win = { getLang: () => 'ko' };
const ctx = { window: win, document: {}, console };
let G = null;
try { vm.runInNewContext(modSrc, ctx, { filename: 'teacher-gallery.js' }); G = win.MangoiTeacherGallery; } catch (e) { console.log('  (불러오기 실패: ' + e.message + ')'); }
check('맨 위에서 DOM 을 건드리지 않고 불러와진다 (window.MangoiTeacherGallery 가 생김)', !!(G && G._t && typeof G.open === 'function' && typeof G.close === 'function'));
const T = (G && G._t) || {};
const run = (f, ...a) => { try { return f(...a); } catch (e) { return '__THROW__' + e.message; } };

console.log('\n[ ② 안전 — 탈출 · 주소 거르기 · 내부 정보 ]');
if (T.cardHTML) {
  const evil = { id: 1, english_name: '<img src=x onerror=alert(1)>', certifications: '"><script>x</script>', career: '3' };
  const c = run(T.cardHTML, evil, 0, false, 'ko');
  check('카드가 이름·과목의 꺾쇠를 탈출한다', !/<img src=x/.test(c) && !/<script>/.test(c) && /&lt;img src=x/.test(c));
  const d = run(T.detailHTML, { id: 2, english_name: 'Ana', career: 'Motto <b>hi</b></blockquote><script>x</script>', group_name: 'Office Teacher', education: 'BSEd', intro_video_url: 'javascript:alert(1)' }, { index: 0, total: 1, playing: true }, 'ko');
  check('프로필이 소개 글·좌우명의 꺾쇠를 탈출한다', !/<script>/.test(d) && !/<b>hi<\/b>/.test(d) && /&lt;script&gt;/.test(d));
  check('내부 인사 분류(group_name)를 그리지 않는다 (2026-07-30 제보 #5)', !/Office Teacher/.test(d));
  check('javascript: 영상 주소면 영상 버튼도 재생기도 없다', !/data-tg="video"/.test(d) && !/<iframe|<video/.test(d) && !/javascript:/i.test(d));
  const p1 = run(T.detailHTML, { id: 3, english_name: 'B', image_url: 'javascript:alert(1)' }, { index: 0, total: 1 }, 'ko');
  check('javascript: 사진 주소는 <img> 로 그리지 않고 «사진 준비중» 그림으로', !/javascript:/i.test(p1) && /tg-nophoto/.test(p1));
}
if (T.safeUrl) {
  check('safeUrl: https 주소는 그대로', T.safeUrl('https://cdn.x/a.jpg') === 'https://cdn.x/a.jpg');
  check('safeUrl: 우리 사이트 경로(/img/…)는 그대로', T.safeUrl('/img/a.jpg') === '/img/a.jpg');
  check('safeUrl: javascript:·data:·//남의주소 는 빈 값', T.safeUrl('javascript:alert(1)') === '' && T.safeUrl('data:text/html,x') === '' && T.safeUrl('//evil.com/x.jpg') === '');
}

console.log('\n[ ②-2 근거 없는 평점을 그리지 않는다 (2026-11-04 사장님 결정) ]');
if (T.cardHTML) {
  // 옛 창은 모든 강사에게 «⭐ 4.9» 를 고정으로 박아 보여 줬다. 실제 평점 집계가 생기기 전까지는 그리지 않는다.
  const plain = { id: 7, english_name: 'E', career: '' };
  const vet = { id: 8, english_name: 'F', career: '6' };
  const html = [run(T.cardHTML, plain, 0, false, 'ko'), run(T.cardHTML, vet, 1, false, 'en'),
    run(T.detailHTML, plain, { index: 0, total: 2 }, 'ko'), run(T.detailHTML, vet, { index: 1, total: 2 }, 'en')].join('\n');
  check('카드·프로필 어디에도 «4.9»·별점 기호가 없다', !/4\.9|★|⭐/.test(html));
  check('대신 년차가 있으면 카드에 보인다 (짝 — 줄을 통째로 지운 것이 아님)', /6 yrs/.test(run(T.cardHTML, vet, 1, false, 'en')) && /6년차/.test(run(T.cardHTML, vet, 1, false, 'ko')));
}

console.log('\n[ ②-3 내부 관리 메모(notes)는 학부모 화면에 안 나간다 (2026-11-05 사장님 캡처) ]');
// teacher_profiles.notes 는 «선생님 한마디» 가 아니라 «아이디:mangoi_026 / 프랜차이즈:에듀비전 / 80분연강:제한 /
// 평점: 5.0 (2 reviews)» 꼴의 내부 메모다(운영 D1 활동중 25명 전원 실측). 강사 소개 창이 그것을 그대로 그렸다.
const MEMO = '아이디:mangoi_026 / 프랜차이즈:에듀비전 / 80분연강:제한 / 평점: 5.0 (2 reviews)';
if (T.detailHTML) {
  const janice = { id: 26, english_name: 'Teacher Janice', origin_region: '미국캐나다', notes: MEMO,
    career: 'Full Name: Janice M. Geolin Motto: "Learning is not a spectator sport."' };
  const dk = run(T.detailHTML, janice, { index: 0, total: 1 }, 'ko');
  const de = run(T.detailHTML, janice, { index: 0, total: 1 }, 'en');
  check('프로필에 내부 메모의 로그인 아이디·프랜차이즈·연강 글자가 없다 (KO·EN)',
    !/mangoi_026|아이디|프랜차이즈|80분연강|reviews/.test(dk + de), (dk + de).match(/mangoi_026|아이디|프랜차이즈|80분연강|reviews/));
  check('대신 강사가 직접 쓴 말(career)이 «선생님 한마디» 로 보인다 (짝 — 칸을 통째로 지운 것이 아님)',
    /선생님 한마디/.test(dk) && /Learning is not a spectator sport/.test(dk) && /In their words/.test(de));
  check('입력칸 라벨 «Full Name: …»·«Motto:» 는 화면에 안 보인다', !/Full Name|Geolin|Motto\s*:/i.test(dk));
  const memoOnly = run(T.detailHTML, { id: 27, english_name: 'X', notes: MEMO }, { index: 0, total: 1 }, 'ko');
  check('career 가 없고 메모만 있으면 «소개 글 없음» 한 줄 (메모로 메우지 않는다)',
    /아직 등록된 소개 글이 없어요/.test(memoOnly) && !/mangoi_026/.test(memoOnly));
}
if (T.aboutOf) {
  check('aboutOf: «Motto: X» → X', T.aboutOf({ career: "Motto: Dreams don't work unless you do!" }) === "Dreams don't work unless you do!");
  check('aboutOf: 라벨이 없는 글은 그대로 (짝)', T.aboutOf({ career: 'Every day is a chance to get better.' }) === 'Every day is a chance to get better.');
}
{
  // 모듈 안에서 notes 를 «읽는» 코드가 없어야 한다 — 주석을 벗긴 사본으로 판정(⛔ 자기 주석을 잡지 않게).
  const live = modSrc.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n');
  check('teacher-gallery.js 가 t.notes 를 읽지 않는다', !/\.notes\b/.test(live));
  check('(전제) 주석 벗기기가 파일을 통째로 먹지 않았다', live.length > modSrc.length * 0.5);
}

console.log('\n[ ②-4 공개 API 가 내부 메모 원문을 안 내보낸다 (src/teacher-public.ts · api-mango.ts) ]');
{
  const { stripTypeScriptTypes } = await import('node:module');
  const pubSrc = readFileSync(join(ROOT, 'cloudflare-deploy/src/teacher-public.ts'), 'utf8');
  let P = {};
  try {
    const js = stripTypeScriptTypes(pubSrc).replace(/\bexport\s+/g, '');
    P = new Function(js + '\nreturn { publicTeacherNotes, publicTeacherRow, isPublicTeacher };')();
  } catch (e) { console.log('  (teacher-public.ts 실행 실패: ' + e.message + ')'); }
  const N = P.publicTeacherNotes || (() => '__MISSING__');
  check('실제 메모 → «평점: 5.0 (2 reviews)» 만 남는다', N(MEMO) === '평점: 5.0 (2 reviews)', N(MEMO));
  check('평점이 없는 메모(관리자·작업 메모) → null', N('아이디:mangoi_144 / 프랜차이즈:에듀비전 / 역할: 관리자(수업 안 함)') === null && N('[2026-09-01 사장님 지시 …]') === null);
  check('문자열이 아니거나 비면 null', N(null) === null && N(undefined) === null && N(42) === null && N('') === null);
  // 짝 — 이 칸을 읽는 공개 화면 둘의 정규식이 그대로 값을 꺼낸다(옛 화면을 안 고쳐도 된다).
  const out = N(MEMO) || '';
  const rate = (out.match(/평점:\s*([\d.]+)/) || [])[1], revs = (out.match(/\((\d+)\s*reviews?\)/i) || [])[1];
  check('lesson-booking·lesson-postpone 의 평점 정규식이 그 값을 그대로 꺼낸다', rate === '5.0' && revs === '2');
  const demoSrc = readFileSync(join(PUB, 'lesson-postpone-demo.html'), 'utf8') + readFileSync(join(PUB, 'lesson-booking-demo.html'), 'utf8');
  check('(전제) 그 두 화면이 아직 notes 에서 «평점:» 을 꺼내 쓴다 (바뀌면 이 짝을 다시 볼 것)', /평점:\\s\*\(\[\\d\.\]\+\)/.test(demoSrc));

  // 라우트를 중괄호 짝으로 오려 내 가짜 D1 로 실제로 돌린다.
  const mango = readFileSync(join(ROOT, 'cloudflare-deploy/src/api-mango.ts'), 'utf8');
  const head = "if (path === '/api/teacher-profiles' && method === 'GET') {";
  const i = mango.indexOf(head);
  let block = '';
  if (i >= 0) {
    let depth = 0, j = i + head.length - 1;
    for (; j < mango.length; j++) { const ch = mango[j]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) break; } }
    block = mango.slice(i + head.length, j);
  }
  check('(전제) 공개 강사 목록 라우트를 오려 냈다', block.length > 200);
  check('api-mango.ts 가 teacher-public 을 불러 쓴다', /import\s*\{[^}]*\bpublicTeacherRow\b[^}]*\}\s*from\s*'\.\/teacher-public'/.test(mango));
  check('api-mango.ts 가 isPublicTeacher 도 불러 쓴다 (매니저 거르기)', /import\s*\{[^}]*\bisPublicTeacher\b[^}]*\}\s*from\s*'\.\/teacher-public'/.test(mango));
  const runRoute = async (opts) => {
    const sqls = [];
    const env = { DB: {
      exec: async () => {},
      prepare: (sql) => { sqls.push(sql); return { bind: () => ({ all: async () => {
        if (opts.noHiddenCol && /list_hidden/.test(sql)) throw new Error('no such column: list_hidden');
        // 질의문을 «읽어서» 답한다 — 이름만 보면 조건을 뒤집어도(= 1) 통과한다(변이 실측).
        const hm = sql.match(/COALESCE\(\s*list_hidden\s*,\s*0\s*\)\s*=\s*(\d)/);
        const keep = (r) => !hm || Number(r.list_hidden || 0) === Number(hm[1]);
        return { results: opts.rows.filter((r) => /status\s*=\s*'활동중'/.test(sql) && keep(r)).map((r) => ({ ...r })) };
      } }) }; } } };
    const json = (b) => b;
    const url = new URL('https://x/api/teacher-profiles?limit=50');
    try {
      // ⚠️ 함수로 «감싼 뒤» 벗긴다 — 블록만 벗기면 함수 밖 return 으로 실패해 이 절이 통째로 헛돈다(CLAUDE.md 2장).
      const fn = new Function('path', 'method', 'url', 'env', 'json', 'publicTeacherRow', 'isPublicTeacher',
        'return ' + stripTypeScriptTypes('(async () => {' + block + '\n})') + '();');
      return { body: await fn('/api/teacher-profiles', 'GET', url, env, json, P.publicTeacherRow, P.isPublicTeacher), sqls };
    } catch (e) { return { err: e.message, sqls }; }
  };
  const ROWS = [
    { id: 26, english_name: 'Teacher Janice', notes: MEMO, career: 'Motto: x', list_hidden: 0 },
    { id: 38, english_name: 'test teacher', notes: '[2026-09-01 사장님 지시 …]', list_hidden: 1 },
    // 🧑‍💼 매니저 셋 — 운영 D1 실측 모양 그대로(2026-11-05)
    { id: 19, english_name: 'Melca', group_name: null, notes: '아이디:mangoi_144 / 프랜차이즈:에듀비전 / 80분연강:제한 / 역할: 관리자(수업 안 함)', list_hidden: 0 },
    { id: 25, english_name: 'Teacher Maimai', group_name: 'Head Teacher', notes: '아이디:mangoi_033 / 프랜차이즈:에듀비전 / 80분연강:제한 / 역할: 관리자(수업 안 함)', list_hidden: 0 },
    { id: 33, english_name: 'Karl', group_name: 'Head Teacher', notes: null, list_hidden: 0 },
    { id: 4, english_name: 'Teacher Belle', group_name: 'Home-based', notes: '아이디:mangoi_172 / 프랜차이즈:에듀비전 / 80분연강:제한 / 평점: 5.0 (4 reviews)', list_hidden: 0 },
  ];
  const a = await runRoute({ rows: ROWS });
  check('(전제) 라우트가 실제로 돌았다 (예외 없음)', !a.err && !!a.body, a.err);
  const items = (a.body && a.body.items) || [];
  check('라우트 응답에 로그인 아이디가 없다', items.length > 0 && !JSON.stringify(a.body).includes('mangoi_026'), a.err || JSON.stringify(a.body).slice(0, 200));
  check('평점 조각은 남는다 (짝)', items.some((r) => r.notes === '평점: 5.0 (2 reviews)'));
  check('명부에서 숨긴 계정(list_hidden)은 공개 목록에 없다', !items.some((r) => r.id === 38));
  check('숨기지 않은 강사는 그대로 있다 (짝)', items.some((r) => r.id === 26));
  check('수업 안 하는 매니저(Melca·Maimai·Karl)는 공개 목록에 없다 (2026-11-05 사장님 「매니저는 빼줘」)',
    ![19, 25, 33].some((id) => items.some((r) => r.id === id)), items.map((r) => r.id).join(','));
  check('일반 강사(Home-based·미국 오후반)는 그대로 있다 (짝 — «전부 빼기» 가 아님)', items.some((r) => r.id === 4) && items.some((r) => r.id === 26));
  const b = await runRoute({ rows: ROWS, noHiddenCol: true });
  const items2 = (b.body && b.body.items) || [];
  check('list_hidden 칸이 없는 DB 면 예전처럼 숨김을 거르지 않고 보여 준다 (빈 목록 금지)',
    b.sqls.length === 2 && items2.some((r) => r.id === 38) && items2.some((r) => r.id === 26) && items2.some((r) => r.id === 4), b.err || items2.map((r) => r.id).join(','));
  check('그 경우에도 메모 원문은 안 나간다', !JSON.stringify(b.body || {}).includes('mangoi_026'));
  check('그 경우에도 매니저는 빠진다', !((b.body && b.body.items) || []).some((r) => [19, 25, 33].includes(r.id)));
  const IP = P.isPublicTeacher || (() => '__MISSING__');
  check('isPublicTeacher: 분류 «Head Teacher»(대소문자·공백 무관) → 뺀다', IP({ group_name: ' head teacher ' }) === false && IP({ group_name: 'Head Teacher', notes: null }) === false);
  check('isPublicTeacher: 메모 «역할: 관리자(수업 안 함)» → 뺀다', IP({ notes: '아이디:x / 역할: 관리자(수업 안 함)' }) === false);
  check('isPublicTeacher: 평범한 강사 메모·분류는 남긴다 (짝)', IP({ group_name: 'Office Teacher', notes: MEMO }) === true && IP({ group_name: '중국어 강사' }) === true && IP({}) === true);
}

console.log('\n[ ③ 판정 — 국가 칸 · 년차/소개 · 유튜브 · 검색 ]');
if (T.regionOf) {
  const r = (o) => T.regionOf({ origin_region: o });
  check('출신 «미국»·«Canada» → 미국·캐나다 칸', r('미국') === 'us' && r('Canada') === 'us');
  check('출신 «호주»·«UK» → 영국·호주 칸', r('호주') === 'gb' && r('UK') === 'gb');
  check('출신 «중국»·«China» → 중국어 칸', r('중국') === 'cn' && r('China') === 'cn');
  check('출신을 모르면 필리핀 칸 (옛 규칙과 같음)', r('') === 'ph' && r('필리핀') === 'ph');
}
if (T.yearsOf) {
  check('career 가 숫자면 «년차» 로', T.yearsOf({ career: '5' }) === 5 && T.aboutOf({ career: '5' }) === '');
  check('career 가 글이면 «소개» 로 (년차 아님)', T.yearsOf({ career: "Motto: Dreams don't work unless you do!" }) === null && /Dreams/.test(T.aboutOf({ career: "Motto: Dreams don't work unless you do!" })));
  const d = run(T.detailHTML, { id: 4, english_name: 'C', career: '7' }, { index: 0, total: 1 }, 'ko');
  check('년차 강사의 프로필에 «7년차» 가 보이고 «소개» 칸은 없다', /7년차/.test(d) && !/tg-quote-about/.test(d));
}
if (T.ytEmbed) {
  const id = 'dQw4w9WgXcQ';
  check('유튜브 watch·youtu.be·shorts 주소 → 퍼가기 주소', [
    'https://www.youtube.com/watch?v=' + id, 'https://youtu.be/' + id, 'https://youtube.com/shorts/' + id, 'https://www.youtube.com/watch?list=x&v=' + id
  ].every(u => T.ytEmbed(u).indexOf('https://www.youtube.com/embed/' + id) === 0));
  check('유튜브가 아니면 빈 값 (그때는 <video> 로 튼다)', T.ytEmbed('https://cdn.x/intro.mp4') === '' && T.ytEmbed('') === '');
  const d = run(T.detailHTML, { id: 5, english_name: 'D', intro_video_url: 'https://youtu.be/' + id }, { index: 0, total: 1, playing: true }, 'ko');
  check('재생 중이면 사진 자리에 유튜브 재생기가 들어간다', /<iframe src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ/.test(d));
  const d2 = run(T.detailHTML, { id: 5, english_name: 'D', intro_video_url: 'https://youtu.be/' + id }, { index: 0, total: 1, playing: false }, 'ko');
  check('재생 전에는 «소개 영상 보기» 버튼만 있고 재생기는 없다 (짝)', /data-tg="video"/.test(d2) && !/<iframe/.test(d2));
  // 2026-11-05 사장님 「교사소개에서 수업입장은 삭제해줘」 — 강사 소개 창에는 수업방 입구가 없다.
  const d2en = run(T.detailHTML, { id: 5, english_name: 'D', intro_video_url: 'https://youtu.be/' + id }, { index: 0, total: 1, playing: false }, 'en');
  const noVid = run(T.detailHTML, { id: 6, english_name: 'E' }, { index: 0, total: 1 }, 'ko');
  check('프로필에 «수업 입장/Join class» 버튼이 없다 (KO·EN·영상 없는 강사)', [d2, d2en, noVid].every(h => !/data-tg="join"|수업 입장|Join class/.test(h)));
  check('…그래도 «소개 영상 보기 / Watch intro video» 버튼은 남아 있다 (짝 — 버튼 줄을 통째로 지운 것이 아님)', /data-tg="video"[^>]*>[\s\S]*소개 영상 보기/.test(d2) && /Watch intro video/.test(d2en));
  check('영상 없는 강사는 빈 버튼 줄(tg-d-actions)을 그리지 않는다', !/tg-d-actions/.test(noVid) && /tg-d-actions/.test(d2));
  check('모듈이 수업방 입장 함수(mangoiJoinClass)를 부르지 않는다', !/mangoiJoinClass/.test(modSrc));
}
if (T.filterList) {
  const L = [
    { id: 1, english_name: 'Teacher Ana', origin_region: '필리핀' },
    { id: 2, english_name: 'Teacher Olivia', origin_region: 'Canada' },
    { id: 3, korean_name: '강선생님', origin_region: '중국', certifications: '중국어 회화' },
  ];
  const ids = (a) => a.map(t => t.id).join(',');
  check('지역 «전체» + 검색어 없음 → 전부', ids(T.filterList(L, 'all', '')) === '1,2,3');
  check('지역 «미국·캐나다» → 그 칸만', ids(T.filterList(L, 'us', '')) === '2');
  check('검색은 대소문자를 무시하고 한글 이름·과목에서도 찾는다', ids(T.filterList(L, 'all', 'ANA')) === '1' && ids(T.filterList(L, 'all', '강선')) === '3' && ids(T.filterList(L, 'all', '중국어')) === '3');
  check('맞는 강사가 없으면 빈 목록 (짝 — «언제나 전부» 가 아님)', T.filterList(L, 'all', 'zzz').length === 0 && T.filterList(L, 'gb', '').length === 0);
  check('칩 숫자 = 그 지역 강사 수', T.countIn(L, 'all') === 3 && T.countIn(L, 'ph') === 1 && T.countIn(L, 'gb') === 0);
}

console.log('\n[ ④ 문구 — KO/EN 짝 ]');
if (T.TEXT) {
  const ko = T.TEXT.ko, en = T.TEXT.en;
  const kk = Object.keys(ko).sort().join(','), ek = Object.keys(en).sort().join(',');
  check('KO 와 EN 의 문구 키가 같다', kk === ek);
  check('같은 키는 같은 모양이다 (함수·목록·글)', Object.keys(ko).every(k => typeof ko[k] === typeof en[k] && Array.isArray(ko[k]) === Array.isArray(en[k]) && (!Array.isArray(ko[k]) || ko[k].length === en[k].length)));
  const ck = run(T.chipsHTML, [], 'all', 'ko'), ce = run(T.chipsHTML, [], 'all', 'en');
  check('국가 칩이 언어를 따른다 (KO 필리핀 / EN Philippines)', /필리핀/.test(ck) && /Philippines/.test(ce) && !/필리핀/.test(ce));
  check('영국·호주 칩에 «준비중/Soon» 표시', /준비중/.test(ck) && /Soon/.test(ce));
  check('옛 창의 «채용 기준·평가 시스템» 문구를 그대로 옮겼다', ko.recruit.indexOf('망고아이 자체 4단계 시범 수업 통과') !== -1 && ko.evals.indexOf('S·A·B·C 등급 기반 인센티브') !== -1);
  check('사이트 번역기가 손대지 않게 translate="no" 로 감싼다 (KO/EN 은 모듈이 직접 그림)', /class="tg" translate="no"/.test(modSrc));
}

console.log('\n[ ⑤ 그림 — 가리키는 파일이 실제로 있다 (힉스필드 생성 · /img/teachers) ]');
if (T.REGIONS) {
  const files = new Set(['tg-hero.webp', 'tg-no-photo.webp']);
  T.REGIONS.forEach(r => { if (r.cover) files.add(r.cover); });
  const refsInSrc = [...modSrc.matchAll(/(tg-[a-z-]+\.webp)/g)].map(m => m[1]);
  check('모듈이 쓰는 그림 이름이 모두 이 목록 안에 있다 (전제)', refsInSrc.every(f => files.has(f)));
  for (const f of files) check(`그림 파일이 있다: /img/teachers/${f}`, existsSync(join(PUB, 'img/teachers', f)));
}
check('제목 옆 마스코트는 Mr.mango 그림 (CLAUDE.md 0장) — 파일 실재', /\/img\/mango-char\.png/.test(modSrc) && existsSync(join(PUB, 'img/mango-char.png')));
check('국기는 SVG 그림 (Windows 이모지 «PH» 글자 방지) — 4종 실재', ['ph', 'us', 'gb', 'cn'].every(c => existsSync(join(PUB, 'img/flag-' + c + '.svg'))) && /\/img\/flag-' \+ code \+ '\.svg/.test(modSrc));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
