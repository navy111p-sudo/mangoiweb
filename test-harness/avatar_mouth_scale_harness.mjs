/* avatar_mouth_scale_harness.mjs — Lily·Noah «입이 얼굴에 비해 크다» 수리 감시 (2026-10-18)
 *   ① 커밋된 그림 == tools/shrink-mouth.py 출력 (sha) · 입력 == smile-folds 출력(사슬)
 *   ② 입이 실제로 줄었다(0.85~0.95배) · 지원 영역 밖은 인코딩 전 0 변화 · 칸 테두리 0 변화
 *   ③ PRECISION rect 가 보고서 rect 와 같다(Noah 는 넓힌 칸) · transitions 칸 크기도 같다
 *   ④ FACE_ZOOM 은 lily·noah 에만, 폭·높이 같은 비율(카드 비율 유지)
 *   ⑤ «오» 입모양(E·F) 정리 · Noah G·H 대체 — tools/clean-o-mouths.py 출력·사슬
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy/public');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ FAIL ' + m); } };
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const J = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const CFG = J(join(ROOT, 'tools/mouth-scale.json')), REP = J(join(ROOT, 'tools/mouth-scale-report.json'));
const OC = J(join(ROOT, 'tools/o-mouth-clean-report.json')), OCC = J(join(ROOT, 'tools/o-mouth-clean.json'));
const SF = J(join(ROOT, 'tools/smile-folds-report.json')), TR = J(join(PUB, 'img/visemes/transitions.json'));
const AV = readFileSync(join(PUB, 'js/mango-avatar.js'), 'utf8');
ok(!!CFG && !!REP && !!SF && !!TR, '설정·보고서를 읽었다');
if (!CFG || !REP || !SF || !TR) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
ok(['lily', 'noah'].every(a => REP.actors[a]), '보고서에 lily·noah 가 있다');
ok(REP.sourceRev === CFG.sourceRev && JSON.stringify(REP.params) === JSON.stringify(CFG.params), '보고서가 지금 설정으로 만들어졌다');
const precM = AV.match(/var PRECISION=(\{[\s\S]*?\}\});/);
let PREC = null; try { PREC = Function('return ' + precM[1])(); } catch {}
ok(!!PREC, 'PRECISION 표를 읽었다');
let seen = 0;
for (const [a, act] of Object.entries(REP.actors)) {
  for (const [rel, f] of Object.entries(act.files)) {
    const abs = join(PUB, rel);
    const oc = OC && OC.actors[a] && OC.actors[a].files[rel];
    ok(existsSync(abs) && (sha(abs) === f.sha256 || (!!oc && oc.sourceSha256 === f.sha256 && sha(abs) === oc.sha256)),
      `${a}: ${rel} == 도구 출력${oc ? ' (→ clean-o-mouths 출력)' : ''}`);
    const sf = SF.actors[a] && SF.actors[a].files[rel];
    ok(!!sf && sf.sha256 === f.sourceSha256, `${a}: ${rel} 입력 == 주름 제거 출력(사슬)`);
    seen++;
    if (f.tiles) {
      const real = f.tiles.filter(t => t.lipWidthBefore > 20);
      ok(real.length >= 7, `${a}: 입 폭을 잰 칸 ${real.length}개`);
      for (const t of real) ok(t.lipWidthAfter / t.lipWidthBefore >= 0.85 && t.lipWidthAfter / t.lipWidthBefore <= 0.97,
        `${a} ${t.pose}: 입 폭 ${t.lipWidthBefore} → ${t.lipWidthAfter}`);
      ok(f.tiles.every(t => t.borderMaxChange === 0), `${a}: 칸 테두리 0 변화(이음매 없음)`);
    } else {
      ok(f.outsideMaxChangePreEncode === 0, `${a} ${rel}: 입 둘레 밖은 인코딩 전 0 변화`);
      ok(f.lipWidthAfter < f.lipWidthBefore, `${a} ${rel}: 입 폭 ${f.lipWidthBefore} → ${f.lipWidthAfter}`);
      ok(f.bytes <= 300 * 1024, `${a} ${rel}: ${Math.round(f.bytes / 1024)}KB ≤ 300KB`);
    }
  }
  const r = act.rect, p = PREC && PREC[a];
  ok(!!p && p.x === r[0] && p.y === r[1] && p.w === r[2] && p.h === r[3], `${a}: PRECISION rect == 보고서 rect [${r}]`);
  const t = TR.actors[a];
  ok(!!t && sha(join(PUB, `img/visemes/${a}-mouths.webp`)) === t.sourceSha256, `${a}: 중간 그림이 줄인 입으로 다시 만들어졌다`);
}
ok(seen === 8, `대조한 그림 ${seen}개`);
// ⑤ «오» 입모양 정리 (2026-10-18 「Noah·Lily 가 o 발음 할 때 가장 어색해 · 입가 주름 · Noah 붉은 사각 얼룩」)
//    tools/clean-o-mouths.py — E·F 만 손대고 입술·칸 테두리는 0 변화, Noah G·H(검은 타원)는 B·C 로.
ok(!!OC && !!OCC && OC.sourceRev === OCC.sourceRev && JSON.stringify(OC.params) === JSON.stringify(OCC.params),
  '«오» 정리 보고서가 지금 설정으로 만들어졌다');
for (const a of ['lily', 'noah']) {
  const rel = `img/visemes/${a}-mouths.webp`, f = OC && OC.actors[a] && OC.actors[a].files[rel];
  const ms = REP.actors[a].files[rel];
  ok(!!f && f.sourceSha256 === ms.sha256, `${a}: «오» 정리의 입력 == 입 줄이기 출력(사슬)`);
  ok(!!f && sha(join(PUB, rel)) === f.sha256, `${a}: 커밋된 입모양 묶음 == «오» 정리 출력`);
  const T = f ? f.tiles : [];
  ok(T.length === 9 && T.every(t => t.borderMaxChange === 0), `${a}: 아홉 칸 모두 테두리 0 변화(이음매 없음)`);
  const sub = (OCC.actors[a] || {}).substitute || {};
  for (const t of T) {
    if (sub[t.pose]) { ok(t.action === 'substitute:' + sub[t.pose], `${a} ${t.pose}: ${t.action}`); continue; }
    if (OCC.params.poses.includes(t.pose)) {
      ok(t.action === 'clean', `${a} ${t.pose}: 정리했다`);
      ok(t.lipMaxChange === 0, `${a} ${t.pose}: 입술은 0 변화`);
      ok(t.foldAfter < t.foldBefore, `${a} ${t.pose}: 입가 주름 ${t.foldBefore} → ${t.foldAfter}`);
      ok(t.skinToBaseAfter <= t.skinToBaseBefore * 0.6, `${a} ${t.pose}: 원본 얼굴과의 피부색 차 ${t.skinToBaseBefore} → ${t.skinToBaseAfter}`);
    } else ok(t.action === 'keep', `${a} ${t.pose}: 그대로`);
  }
}
ok(JSON.stringify((OCC && OCC.actors.noah.substitute) || {}) === '{"G":"B","H":"C"}', 'Noah G·H(검은 타원) → B·C',
  '생성이 실패해 검은 타원으로 들어간 칸입니다 — 새 그림을 만들기 전까지 되돌리지 마세요');
const ZR = /still:'\/img\/(?:visemes\/)?([a-z0-9-]+)\.webp(?:\?v=\d+)?', rect:\{ l:([\d.]+), t:([\d.]+), r:([\d.]+), b:([\d.]+) \}/g;
const zoomed = [];
for (const m of AV.matchAll(ZR)) { const [l, t, r, b] = m.slice(2).map(Number);
  if (!(l === 0 && t === 0 && r === 1 && b === 1) && m[1] !== 'teacher-avatar' && m[1] !== 'hero-avatar') {
    zoomed.push(m[1]); ok(Math.abs((r - l) - (b - t)) < 1e-9 && r - l < 1, `${m[1]}: 확대 rect 폭·높이 같은 비율(카드 비율 유지)`); } }
ok(zoomed.sort().join() === 'lily-closed,noah-closed', `얼굴 확대는 lily·noah 둘에만 (${zoomed.join(',')})`);
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
