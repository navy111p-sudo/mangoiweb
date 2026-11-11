/* avatar_cheek_seams_harness.mjs — Lily 코 양옆 볼의 대각선 이음매 제거 감시 (2026-11-11)
 *
 * 왜: v22(입 칸 1px 번짐 수리) 뒤에도 사장님 화면에 「코 양옆 볼의 선」이 그대로였습니다.
 *     원인은 그림 «안» — 입 조각의 볼(힘 뺀 볼)이 바탕(크게 웃는 볼)과 만나는 대각선이고,
 *     조각마다 조금씩 달라 말할 때 깜빡였습니다. tools/heal-cheek-seams.py 가 원본(sourceRev)에서
 *     두 다각형 안을 주변 피부로 메우고 보고서(tools/cheek-seams-report.json)를 남깁니다.
 *
 * 지키는 것 (문자열이 아니라 «파일·보고서·설정·표» 를 서로 대조)
 *   ⓪ 설정·보고서가 같은 기준(sourceRev·params)이고 다각형이 그대로다(픽셀 수 대조)
 *   ① 커밋된 그림 4장 == 도구 출력 · 입력 == 앞 단계 출력(shrink-mouth · «오» 정리) — 손 덧칠·순서 꼬임은 FAIL
 *   ② 선이 실제로 줄었다 · 다각형 밖은 인코딩 전 0 변화 · 칸 경계의 밝기 차가 «배포돼 있던 상태(옛 칸·옛 바탕)» 보다 나빠지지 않았다
 *      ⚠️ 선 세기·밖 0 변화는 도구가 적은 보고서를 믿습니다 — 그림이 그 보고서의 출력인지는 ①이 sha 로 묶습니다.
 *   ③ 사이 그림(transitions)이 고친 입모양으로 다시 만들어졌다 — 아니면 말하는 도중에만 옛 선이 번쩍입니다
 *   ④ 고친 그림 주소가 ?v=5 이상 — 옛 주소(?v=4)면 7일 캐시에 옛 얼굴이 남습니다
 *   ⑤ 다각형이 눈 칸(EYES) 아래 · 턱 띠(JAW) 위 · 그림 안에 있다
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
const J = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

const CFG = J(join(ROOT, 'tools/cheek-seams.json'));
const REP = J(join(ROOT, 'tools/cheek-seams-report.json'));
const MS = J(join(ROOT, 'tools/mouth-scale-report.json'));
const OC = J(join(ROOT, 'tools/o-mouth-clean-report.json'));
const TR = J(join(PUB, 'img/visemes/transitions.json'));
const AV = readFileSync(join(PUB, 'js/mango-avatar.js'), 'utf8');

console.log('⓪ 전제');
ok(!!CFG && !!REP && !!MS && !!OC && !!TR, '설정·보고서·앞 단계 보고서·transitions.json 을 읽었다');
if (!CFG || !REP || !MS || !OC || !TR) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
ok(REP.sourceRev === CFG.sourceRev && JSON.stringify(REP.params) === JSON.stringify(CFG.params),
  '보고서가 지금 설정(sourceRev·params)으로 만들어졌다', 'python3 tools/heal-cheek-seams.py 로 다시 만들 것');
const A = CFG.actors.lily, R = REP.actors.lily;
ok(!!A && !!R, '설정·보고서에 lily 가 있다');

// 다각형 픽셀 수 — 도구와 같은 규칙(픽셀 중심, 짝홀 교차)
function polyPx(polys) {
  let n = 0;
  for (let y = 0; y < 800; y++) for (let x = 0; x < 640; x++) {
    const X = x + 0.5, Y = y + 0.5; let any = false;
    for (const p of polys) {
      let inside = false;
      for (let i = 0; i < p.length; i++) {
        const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
        if (y1 === y2) continue;
        if (Y >= Math.min(y1, y2) && Y < Math.max(y1, y2) && X < x1 + (Y - y1) * (x2 - x1) / (y2 - y1)) inside = !inside;
      }
      if (inside) { any = true; break; }
    }
    if (any) n++;
  }
  return n;
}
ok(polyPx(A.roi) === R.roiPx, `다각형 픽셀 수 ${polyPx(A.roi)} == 보고서 ${R.roiPx}`, '다각형을 바꿨으면 도구를 다시 돌릴 것');

console.log('① 커밋된 그림 == 도구 출력 · 입력 == 앞 단계 출력');
const prev = rel => {
  const ms = MS.actors.lily && MS.actors.lily.files[rel];
  const oc = OC.actors.lily && OC.actors.lily.files[rel];
  return oc && ms && oc.sourceSha256 === ms.sha256 ? oc.sha256 : ms && ms.sha256;
};
const files = R.files || {};
const want = ['img/lily-closed.webp', 'img/lily-mid.webp', 'img/lily-wide.webp', 'img/visemes/lily-mouths.webp'];
ok(want.every(r => files[r]), '보고서에 그림 4장(closed·mid·wide·mouths)');
for (const rel of want) {
  const f = files[rel]; if (!f) continue;
  const abs = join(PUB, rel);
  ok(existsSync(abs) && sha(abs) === f.sha256, `${rel} == 도구 출력`, '그림만 바꾸고 보고서를 안 갱신했거나 손으로 고쳤다');
  ok(f.sourceSha256 === prev(rel), `${rel} 입력 == 앞 단계 출력(사슬)`);
  ok(f.sourceSha256 !== f.sha256, `${rel} 이 실제로 바뀌었다`);
}

console.log('② 선이 줄었다 · 다각형 밖은 그대로 · 경계가 나빠지지 않았다');
for (const rel of want.slice(0, 3)) {
  const f = files[rel]; if (!f) continue;
  ok(f.energyAfter <= f.energyBefore * 0.5, `${rel}: 선 세기 ${f.energyBefore} → ${f.energyAfter} (절반 이하)`);
  ok(f.outsideMaxChangePreEncode === 0, `${rel}: 다각형 밖 인코딩 전 0 변화`);
}
const T = (files['img/visemes/lily-mouths.webp'] || {}).tiles || [];
ok(T.length === 9 && T.map(t => t.pose).join('') === 'XABCDEFGH', '입모양 9칸 모두 처리');
for (const t of T) {
  ok(t.energyAfter <= t.energyBefore * 0.5 && t.outsideMaxChange === 0 && t.seamAfter <= t.seamBefore,
    `${t.pose}: 선 ${t.energyBefore} → ${t.energyAfter} · 밖 0 변화 · 경계 ${t.seamBefore} → ${t.seamAfter}`);
}

console.log('③ 사이 그림이 고친 입모양으로 다시 만들어졌다');
ok(!!TR.actors.lily && TR.actors.lily.sourceSha256 === sha(join(PUB, 'img/visemes/lily-mouths.webp')),
  'transitions.json lily sourceSha256 == 지금 입모양 묶음', 'python3 tools/build-viseme-transitions.py lily (opencv)');

console.log('④ 고친 그림 주소가 ?v=5 이상');
// ?v= 가 «없는» 주소도 함께 센다 — 하나만 ?v= 를 빠뜨려도 그 주소는 7일 캐시입니다.
const vs = [...AV.matchAll(/\/img\/(?:visemes\/)?lily-(?:closed|mid|wide|mouths|transitions)\.webp(?:\?v=(\d+))?/g)].map(m => (m[1] ? +m[1] : 0));
ok(vs.length >= 7, `mango-avatar.js 의 lily 그림 주소 ${vs.length}개를 찾았다(closed·mid·wide·still·base·atlas·trans)`);
ok(vs.length > 0 && vs.every(v => v >= 5), `모두 ?v=5 이상 (${vs.join(',')})`, '?v= 를 안 올리면(또는 빠뜨리면) 7일 캐시에 옛 얼굴이 남습니다');
const WP = readFileSync(join(PUB, 'js/warmup-photo-icons.js'), 'utf8').match(/lily-closed\.webp\?v=(\d+)/);
ok(!!WP && +WP[1] >= 5, `warmup-photo-icons.js 의 lily 주소도 ?v=5 이상 (${WP && WP[1]})`);

console.log('⑤ 다각형 자리');
const ey = AV.match(/var EYES=\{lily:\{x:(\d+),y:(\d+),w:(\d+),h:(\d+)\}/);
const jw = AV.match(/var JAW=\{lily:\{[^}]*top:(\d+)/);
const ys = A.roi.flat().map(p => p[1]), xs = A.roi.flat().map(p => p[0]);
ok(!!ey && Math.min(...ys) >= +ey[2] + +ey[4], `다각형 위쪽(${Math.min(...ys)}) ≥ 눈 칸 아래(${ey && +ey[2] + +ey[4]})`);
ok(!!jw && Math.max(...ys) < +jw[1], `다각형 아래쪽(${Math.max(...ys)}) < 턱 띠 위(${jw && jw[1]})`);
ok(Math.min(...xs) >= 0 && Math.max(...xs) < 640 && Math.max(...ys) < 800, '다각형이 그림 안에 있다');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
