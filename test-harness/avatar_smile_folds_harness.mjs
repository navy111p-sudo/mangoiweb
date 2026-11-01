/* avatar_smile_folds_harness.mjs — Lily·Noah 입가 주름(팔자주름) 제거 감시 (2026-10-18)
 *
 * 왜: 기본 초상화가 활짝 웃는 얼굴이라 입 둘레 주름이 입모양 칸(PRECISION rect) «경계» 에 걸려
 *     있었고, 입모양 9장은 각자 다른 자리에 자기 주름을 갖고 있어 화면에서 «끊긴 이중 주름» 으로
 *     보였습니다(사장님 「입가에 주름을 없애줘. 이게 있어서 이상하게 보여」).
 *     tools/remove-smile-folds.py 가 원본(sourceRev)에서 다시 만들고 보고서를 남깁니다.
 *
 * 이 하니스가 지키는 것 (문자열이 아니라 «파일·보고서·표» 를 서로 대조합니다)
 *   ① 커밋된 그림이 «도구가 만든 그대로» 인가 (sha256 == 보고서) — 손으로 덧칠하면 FAIL
 *   ② 주름이 실제로 줄었는가 (에너지 비율) · ROI 밖은 한 픽셀도 안 바꿨는가 · 경계 이음이 나빠지지 않았는가
 *   ③ 중간 그림(transitions)이 «고친 입모양» 으로 다시 만들어졌는가 (transitions.json sourceSha256)
 *      — 안 맞으면 말하는 도중에만 옛 주름이 번쩍입니다(에러 없음)
 *   ④ 고친 파일을 부르는 «모든» 주소가 같은 ?v= 를 단다 — media 는 ?v= 없으면 7일 캐시라
 *      안 달면 학생 화면에 옛 얼굴이 남고, 섞이면 같은 그림을 두 번 받습니다
 *   ⑤ ROI 가 눈 칸(EYES)과 겹치지 않고, PRECISION rect 와 보고서 rect 가 같다
 *   ⑥ 바보 검사 방지: 위 대조가 «실제로 무언가를 봤는가» (전제)
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy/public');
let pass = 0, fail = 0;
const ok = (c, msg, why = '') => {
  if (c) { pass++; console.log('  ✅ ' + msg); }
  else { fail++; console.log('  ❌ FAIL ' + msg + (why ? '\n       → ' + why : '')); }
};
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const readJson = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

const CFG = readJson(join(ROOT, 'tools/smile-folds-roi.json'));
const REP = readJson(join(ROOT, 'tools/smile-folds-report.json'));
const TR = readJson(join(PUB, 'img/visemes/transitions.json'));
const AV = readFileSync(join(PUB, 'js/mango-avatar.js'), 'utf8');
// 2026-10-18: tools/shrink-mouth.py 가 이 도구의 출력을 «입력» 으로 받아 입을 줄였습니다(사슬).
//   그래서 지금 파일은 «이 도구 출력» 이거나, «이 도구 출력을 입력으로 한 shrink-mouth 출력» 이어야 합니다.
const MS = readJson(join(ROOT, 'tools/mouth-scale-report.json'));
// 2026-10-18: tools/clean-o-mouths.py 가 shrink-mouth 출력(입모양 묶음)을 다시 입력으로 받았습니다(사슬 한 칸 더).
const OC = readJson(join(ROOT, 'tools/o-mouth-clean-report.json'));
const link = (R, a, rel, want) => { const f = R && R.actors && R.actors[a] && R.actors[a].files && R.actors[a].files[rel];
  return f && f.sourceSha256 === want ? f.sha256 : null; };
const chained = (a, rel, want) => { const m = link(MS, a, rel, want); return m ? (link(OC, a, rel, m) || m) : null; };

console.log('⓪ 전제');
ok(!!CFG && !!CFG.actors && !!CFG.params, 'tools/smile-folds-roi.json 을 읽었다');
ok(!!REP && !!REP.actors, 'tools/smile-folds-report.json 을 읽었다', '도구를 돌리고 보고서를 함께 커밋할 것');
ok(!!TR && !!TR.actors, 'img/visemes/transitions.json 을 읽었다');
const ACTORS = Object.keys((CFG && CFG.actors) || {});
ok(ACTORS.includes('lily') && ACTORS.includes('noah'), 'ROI 표에 lily·noah 가 있다');
if (!CFG || !REP || !TR) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
ok(REP.sourceRev === CFG.sourceRev, `보고서의 원본 기준(${REP.sourceRev})이 ROI 표와 같다`);
ok(JSON.stringify(REP.params) === JSON.stringify(CFG.params), '보고서 params 가 ROI 표 params 와 같다',
  'params 를 바꿨으면 도구를 다시 돌려 그림·보고서를 함께 갱신할 것');

console.log('① 커밋된 그림 == 도구 출력');
let filesSeen = 0;
for (const a of ACTORS) {
  const files = (REP.actors[a] || {}).files || {};
  ok(Object.keys(files).length === 4, `${a}: 보고서에 그림 4개(closed·mid·wide·mouths)`);
  for (const [rel, info] of Object.entries(files)) {
    const abs = join(PUB, rel);
    ok(existsSync(abs), `${a}: ${rel} 이 있다`);
    if (!existsSync(abs)) continue;
    filesSeen++;
    const now = sha(abs);
    ok(now === info.sha256 || now === chained(a, rel, info.sha256), `${a}: ${rel} 이 도구가 만든 그대로다(또는 그 출력을 입력으로 한 shrink-mouth 출력)`,
      '그림만 바꾸고 보고서를 안 갱신했거나 손으로 고쳤다 — python3 tools/remove-smile-folds.py 로 다시 만들 것');
    ok(info.sourceSha256 !== info.sha256, `${a}: ${rel} 이 원본과 다르다(실제로 고쳤다)`);
  }
}
ok(filesSeen === ACTORS.length * 4, `실제로 대조한 그림 ${filesSeen}개`);

console.log('② 주름이 줄었는가 · ROI 밖은 그대로인가 · 이음이 나빠지지 않았는가');
let framesSeen = 0, tilesSeen = 0;
for (const a of ACTORS) {
  const files = (REP.actors[a] || {}).files || {};
  for (const [rel, info] of Object.entries(files)) {
    if (info.tiles) {
      const real = info.tiles.filter(t => !t.skipped);
      ok(real.length >= 7, `${a}: 고친 입모양 칸이 7개 이상 (${real.length})`);
      for (const t of real) {
        tilesSeen++;
        ok(t.energyAfter <= t.energyBefore * 0.65,
          `${a} ${t.pose}: 주름 세기 ${t.energyBefore} → ${t.energyAfter} (≤65%)`);
        ok(t.seamAfter <= t.seamBefore, `${a} ${t.pose}: 칸 경계 이음 ${t.seamBefore} → ${t.seamAfter} (나빠지지 않음)`);
      }
      for (const t of info.tiles.filter(t => t.skipped))
        ok(t.skipped === 'dark_placeholder', `${a} ${t.pose}: 건너뛴 이유가 «검은 자리표시» 다`);
    } else {
      framesSeen++;
      ok(info.energyAfter <= info.energyBefore * 0.65,
        `${a} ${rel}: 주름 세기 ${info.energyBefore} → ${info.energyAfter} (≤65%)`);
      ok(info.outsideMaxChangePreEncode === 0, `${a} ${rel}: ROI 밖 픽셀은 인코딩 전 한 점도 안 바뀌었다`);
      ok(info.outsideMeanChangeEncoded < 2, `${a} ${rel}: ROI 밖 평균 변화(인코딩 손실만) ${info.outsideMeanChangeEncoded} < 2`);
      ok(info.bytes <= 300 * 1024, `${a} ${rel}: ${Math.round(info.bytes / 1024)}KB ≤ 300KB`);
    }
  }
}
ok(framesSeen === ACTORS.length * 3, `실제로 본 통짜 얼굴 ${framesSeen}장`);
ok(tilesSeen >= 14, `실제로 본 입모양 칸 ${tilesSeen}개`);

console.log('③ 중간 그림이 고친 입모양으로 다시 만들어졌는가');
for (const a of Object.keys(TR.actors)) {
  const e = TR.actors[a];
  const src = a === 'emma' ? 'img/visemes/emma-v2-mouths.webp' : `img/visemes/${a}-mouths.webp`;
  ok(existsSync(join(PUB, src)) && sha(join(PUB, src)) === e.sourceSha256,
    `${a}: transitions.json 의 원본 지문이 지금 ${src} 와 같다`,
    '입모양을 고치고 python3 tools/build-viseme-transitions.py ' + a + ' 를 안 돌림 — 말하는 도중 옛 얼굴이 번쩍입니다');
  const tf = join(PUB, `img/visemes/${a}-transitions.webp`);
  ok(existsSync(tf) && readFileSync(tf).length === e.bytes, `${a}: 중간 그림 크기가 기록과 같다 (${e.bytes})`);
}
for (const a of ACTORS) ok(!!TR.actors[a], `${a}: transitions.json 에 들어 있다`);
ok(!!TR.actors.emma, 'emma 항목이 남아 있다 (lily·noah 만 다시 만들어도 지워지지 않음)');

console.log('④ 고친 파일을 부르는 모든 주소가 같은 ?v= 를 단다');
const files = [];
const walk = (dir) => {
  for (const f of readdirSyncSafe(dir)) {
    const p = join(dir, f.name);
    if (f.isDirectory()) { if (!['img', 'node_modules', 'downloads'].includes(f.name)) walk(p); }
    else if (/\.(html|js)$/.test(f.name)) files.push(p);
  }
};
import { readdirSync } from 'node:fs';
function readdirSyncSafe(d) { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } }
walk(PUB);
const URL_RE = /['"]\/img\/(?:visemes\/)?(lily|noah)-(closed|mid|wide|mouths|transitions)\.webp(\?v=(\d+))?['"]/g;
const versions = new Map();   // actor -> Set(version)
let refs = 0, unversioned = [];
const perFile = new Map();     // 상대경로 -> Set('lily-closed' …)
for (const f of files) {
  const t = readFileSync(f, 'utf8');
  for (const m of t.matchAll(URL_RE)) {
    refs++;
    const rel = f.replace(PUB + '/', '');
    if (!perFile.has(rel)) perFile.set(rel, new Set());
    perFile.get(rel).add(m[1] + '-' + m[2]);
    if (!m[4]) unversioned.push(rel + ' ' + m[0]);
    else { if (!versions.has(m[1])) versions.set(m[1], new Set()); versions.get(m[1]).add(m[4]); }
  }
}
// 정규식이 조용히 헛돌면(따옴표 모양이 바뀌면) 0개를 찾고 아래 검사가 저절로 통과합니다 —
// «몇 개» 가 아니라 «부르는 곳마다 그 그림을 찾았는가» 로 묻습니다.
const want = ['closed', 'mid', 'wide', 'mouths', 'transitions'];
for (const a of ACTORS) for (const k of want)
  ok((perFile.get('js/mango-avatar.js') || new Set()).has(a + '-' + k), `mango-avatar.js 에서 ${a}-${k} 주소를 찾았다`,
    '찾는 정규식이 헛돌고 있습니다 — 아래 «?v= 없는 주소가 없다» 가 아무것도 안 봅니다');
// (2026-10-18) ai-class.html 의 선생님은 Emma 로 바뀌어 lily 그림을 안 씁니다 — 그 검사는 ai_class_page_harness 가 맡습니다
for (const a of ACTORS)
  ok((perFile.get('js/warmup-photo-icons.js') || new Set()).has(a + '-closed'), `warmup-photo-icons.js 에서 ${a}-closed 주소를 찾았다`);
console.log(`  (찾은 주소 ${refs}개 · 파일 ${perFile.size}개)`);
ok(unversioned.length === 0, '?v= 없는 주소가 없다' + (unversioned.length ? ': ' + unversioned.join(' · ') : ''),
  '?v= 없는 media 는 7일 캐시 — 고친 얼굴이 학생 화면에 안 나옵니다');
for (const a of ACTORS) {
  const vs = [...(versions.get(a) || [])];
  ok(vs.length === 1 && Number(vs[0]) >= 2, `${a}: 모든 주소가 같은 버전 ?v=${vs.join(',')}`,
    '다음에 그림을 또 바꾸면 «전부» 함께 올릴 것 (섞이면 같은 그림을 두 번 받음)');
}
ok(/load\(transitions,\s*p\.trans\s*\|\|/.test(AV), 'mango-avatar.js 가 중간 그림을 PRECISION 의 trans 주소로 부른다',
  '주소를 지어서 부르면 ?v= 가 빠집니다');
ok(/load\(mouths,\s*p\.atlas\s*\|\|/.test(AV), 'mango-avatar.js 가 입모양을 PRECISION 의 atlas 주소로 부른다');

console.log('⑤ ROI 가 눈 칸과 겹치지 않고 PRECISION rect 가 같다');
const eyesM = AV.match(/var EYES=(\{[^;]*?\}\s*\});?/) || AV.match(/var EYES=(\{.*?\}\});/s);
let EYES = null;
try { EYES = Function('return ' + (eyesM ? eyesM[1] : 'null'))(); } catch { EYES = null; }
ok(!!EYES && !!EYES.lily && !!EYES.noah, 'mango-avatar.js 에서 EYES 표를 읽었다');
const precM = AV.match(/var PRECISION=(\{[\s\S]*?\}\});/);
let PREC = null;
try { PREC = Function('return ' + (precM ? precM[1] : 'null'))(); } catch { PREC = null; }
ok(!!PREC && !!PREC.lily && !!PREC.noah, 'mango-avatar.js 에서 PRECISION 표를 읽었다');
for (const a of ACTORS) {
  const ys = CFG.actors[a].roi.flat().map(p => p[1]);
  if (EYES && EYES[a]) ok(Math.min(...ys) >= EYES[a].y + EYES[a].h,
    `${a}: ROI 맨 위(y=${Math.min(...ys)})가 눈 칸 아래(y=${EYES[a].y + EYES[a].h})다`, '눈 깜빡임 그림과 겹치면 눈가가 번쩍입니다');
  if (PREC && PREC[a]) {
    const ms = MS && MS.actors && MS.actors[a];
    const r = (ms && ms.rect) || CFG.actors[a].rect, p = PREC[a];   // shrink-mouth 가 칸을 넓혔으면 그 rect
    ok(r[0] === p.x && r[1] === p.y && r[2] === p.w && r[3] === p.h, `${a}: ROI 표 rect 가 PRECISION 과 같다`);
    ok(/\?v=\d+$/.test(p.base || '') && /\?v=\d+$/.test(p.atlas || '') && /\?v=\d+$/.test(p.trans || ''),
      `${a}: PRECISION 의 base·atlas·trans 가 모두 ?v= 를 단다`);
  }
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
