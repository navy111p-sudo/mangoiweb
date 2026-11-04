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
  const d = run(T.detailHTML, { id: 2, english_name: 'Ana', notes: '</blockquote><script>x</script>', career: 'Motto <b>hi</b>', group_name: 'Office Teacher', education: 'BSEd', intro_video_url: 'javascript:alert(1)' }, { index: 0, total: 1, playing: true }, 'ko');
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
