/**
 * home_bg_preload_harness.mjs — 첫 화면에서 «안 쓸 것을 먼저 받는» 상태로 되돌아가지 않게 (2026-08-23)
 *
 * 왜 필요한가
 *   ① index.html 은 홈 배경을 두 장(밝은 147KB · 어두운 40KB) 다 preload 했다.
 *      첫 화면에 실제로 쓰이는 건 «언제나 한 장뿐» 이라 나머지는 그냥 버려지는 다운로드였고,
 *      필리핀 저속 회선에서는 그게 그대로 «홈이 늦게 뜸» 이 된다.
 *      지금은 <head> 인라인 스크립트가 «이번에 쓸 한 장» 만 고른다.
 *      ⚠️ 그 판정은 이 파일 뒤쪽 applyHomeTheme() 과 «같은 규칙» 이어야 한다.
 *         어긋나도 화면은 멀쩡하다 — 안 쓸 그림을 먼저 받을 뿐이라 아무도 눈치 못 챈다.
 *
 *   ② teacher.html 은 수업에 쓸 js 를 «미리 받아» 둔다(강사가 대기하는 몇 분을 활용).
 *      그 목록의 ?v= 가 index.html 이 실제로 부르는 값과 어긋나면
 *      «아무도 안 쓰는 파일» 을 받는 것이라 도움이 되기는커녕 데이터만 버린다.
 *      역시 화면에는 아무 표시도 안 난다.
 *
 * ⚠️ 부정 검사(«이 태그가 없어야 한다»)는 반드시 주석을 벗겨 낸 사본으로 한다.
 *    「왜 없앴는지」 적은 설명 주석에 그 태그가 들어가면 검사가 자기 주석을 잡는다
 *    (CLAUDE.md 2장 — c24_finance_kcpm_harness ③ 에서 실제로 밟은 함정).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy', 'public');
const index = readFileSync(join(PUB, 'index.html'), 'utf8');
const teacher = readFileSync(join(PUB, 'teacher.html'), 'utf8');

/** 주석 제거 — HTML 주석 · JS 블록/줄 주석 */
const strip = t => t
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const indexBare = strip(index);
const teacherBare = strip(teacher);

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✅ ${m}`); };
const no = (m) => { fail++; console.log(`  ❌ ${m}`); };

console.log('home_bg_preload_harness — 첫 화면에서 안 쓸 것을 먼저 받지 않는가');

/* ── ① 배경 두 장을 다시 «둘 다» 정적으로 preload 하지 않는가 ───────────── */
const staticBgPreloads = (indexBare.match(
  /<link[^>]*rel=["']preload["'][^>]*\/img\/home-bg-[a-z]+\.webp/gi) || []);
if (staticBgPreloads.length === 0) ok('① 정적 <link rel=preload> 로 배경을 미리 받지 않는다 (스크립트가 한 장만 고름)');
else no(`① 배경을 정적 preload 로 되돌렸다 (${staticBgPreloads.length}줄) — 안 쓸 한 장까지 받게 된다`);

/* ── ② 고르는 스크립트가 실제로 있는가 ────────────────────────────────── */
if (/document\.createElement\(['"]link['"]\)/.test(indexBare)
    && /home-bg-bright\.webp/.test(indexBare) && /home-bg-dark\.webp/.test(indexBare)
    && /rel\s*=\s*['"]preload['"]/.test(indexBare))
  ok('② <head> 스크립트가 배경 한 장을 골라 preload 한다');
else no('② 배경을 고르는 스크립트가 없다 — 그러면 배경이 늦게 와 «배경 없는 옛 화면» 이 보인다');

/* ── ③ 나머지 한 장은 «나중에» 받는가 (테마 칩 즉시 전환 유지) ───────────── */
if (/rel\s*=\s*['"]prefetch['"]/.test(indexBare) && /requestIdleCallback/.test(indexBare))
  ok('③ 나머지 한 장은 화면을 다 그린 뒤 한가할 때 받는다');
else no('③ 나머지 한 장을 아예 안 받는다 — 테마를 바꿀 때 그때서야 받아 늦어진다');

/* ── ④ 데이터 절약 모드를 존중하는가 ─────────────────────────────────── */
const saveDataHits = (indexBare.match(/saveData/g) || []).length;
if (saveDataHits >= 1) ok('④ 데이터 절약 모드(saveData)면 나중 한 장을 안 받는다');
else no('④ saveData 를 안 본다 — 아끼겠다고 켠 사람에게 그림을 밀어 넣는다');

/* ── ⑤ 🔴 시간 규칙이 두 곳에서 같은가 (핵심) ────────────────────────── */
//   <head> 의 이른 판정과 뒤쪽 applyHomeTheme() 이 어긋나면 «안 쓸 그림» 을 먼저 받는다.
const hourRules = (indexBare.match(/hr?>=\s*6\s*&&\s*hr?<\s*18|h>=6\s*&&\s*h<18/g) || []);
if (hourRules.length >= 2) ok(`⑤ «자동 = 6~18시가 밝음» 규칙이 두 곳 모두에 있다 (${hourRules.length}곳)`);
else no(`⑤ 시간 규칙이 한 곳에만 있다 (${hourRules.length}곳) — 이른 판정과 실제 테마가 어긋나 안 쓸 그림을 받는다`);

/* ── ⑥ 저장 키 이름이 같은가 ─────────────────────────────────────── */
const keyHits = (indexBare.match(/mangoi_home_theme_mode/g) || []).length;
if (keyHits >= 2) ok(`⑥ 테마 저장 키(mangoi_home_theme_mode)를 두 곳이 같이 쓴다 (${keyHits}곳)`);
else no(`⑥ 테마 저장 키가 한 곳에만 있다 (${keyHits}곳) — 사용자가 고른 테마를 이른 판정이 모른다`);

/* ── ⑦ 🔴 teacher.html 이 미리 받는 파일의 ?v= 가 index.html 과 같은가 ── */
//   다르면 «아무도 안 쓰는 파일» 을 받는다. 화면에는 아무 표시도 안 난다.
const warmList = [...teacherBare.matchAll(/['"](\/js\/[a-z0-9._-]+\.js\?v=\d+)['"]/gi)].map(m => m[1]);
if (warmList.length === 0) {
  no('⑦ teacher.html 이 수업 자산을 미리 받지 않는다 — 필리핀 강사가 매번 처음부터 받는다');
} else {
  const indexRefs = new Set(
    [...index.matchAll(/<script\b[^>]*\bsrc=["'](\/js\/[^"']+)["']/gi)].map(m => m[1]));
  const bad = warmList.filter(u => !indexRefs.has(u));
  if (bad.length === 0) ok(`⑦ 미리 받는 ${warmList.length}개의 ?v= 가 index.html 과 정확히 같다`);
  else {
    no(`⑦ index.html 이 그 주소로 부르지 않는 파일을 미리 받는다 (${bad.length}개) — 받아도 안 쓰인다`);
    for (const b of bad) {
      const same = [...indexRefs].find(r => r.split('?')[0] === b.split('?')[0]);
      console.log(`       · teacher.html: ${b}   ← index.html: ${same || '(그 파일을 아예 안 부름)'}`);
    }
  }
}

/* ── ⑧ 수업이 있을 때만 받는가 ──────────────────────────────────── */
if (/data-join/.test(teacherBare) && /saveData/.test(teacherBare))
  ok('⑧ 오늘 수업이 있을 때만, 그리고 데이터 절약 모드가 아닐 때만 미리 받는다');
else no('⑧ 조건 없이 미리 받는다 — 수업 없는 날 온 강사의 데이터를 쓴다');

console.log(`\n${fail === 0 ? '✅' : '🚨'} home_bg_preload_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
