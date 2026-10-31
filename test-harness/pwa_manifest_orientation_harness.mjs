/* pwa_manifest_orientation_harness.mjs — 설치된 웹앱(PWA)이 세로로 잠겨 있지 않은지 감시 (2026-08-27)
 *
 * 왜 필요한가
 *   「휴대폰을 가로로 돌렸는데 수업 화면이 세로 그대로」 제보의 원인이 CSS 가 아니라
 *   **manifest.json 의 `"orientation": "portrait"`** 이었다.
 *   그 값은 «설치된 웹앱»(홈 화면에 추가 = Android WebAPK / iOS 홈화면 앱)에서
 *   **화면 회전 자체를 OS 수준에서 잠근다.** 그래서
 *     · 브라우저 탭으로 열면 정상(가로 배치가 나온다)
 *     · 홈 화면 아이콘으로 열면 영영 세로
 *   가 되어 재현이 «되는 사람 / 안 되는 사람» 으로 갈린다.
 *   실측(2026-08-27, 헤드리스 크로미움): 390x844 세로 = 위아래 배치,
 *   844x390 · 915x412 · 932x430 가로 = 전부 좌우 배치 → **CSS 는 무죄**였다.
 *   (사장님 기기가 «설치된 웹앱» 이라는 것은 2026-08-20 작업기록에 이미 적혀 있었다 —
 *    시작화면 남색이 manifest 의 background_color 와 같았다.)
 *
 * 무엇을 검사하나 — «여러 곳이 서로 같은 말을 하는가»
 *   화면 CSS 는 「화상수업은 가로로 돌려라」고 말하는데(회전 안내 오버레이 + 가로 전용 배치)
 *   manifest 는 「세로로 잠근다」고 말하면 그 자체가 모순이다. 그 모순을 잡는다.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

console.log('■ 설치된 웹앱 화면 회전 (manifest.json)');

let mf = null, raw = '';
try { raw = readFileSync(join(PUB, 'manifest.json'), 'utf8'); mf = JSON.parse(raw); } catch (e) { mf = null; }
ok(!!mf, 'manifest.json 이 있고 JSON 으로 읽힌다', mf ? '' : '파싱 실패 — 설치된 앱이 아이콘·시작화면을 잃는다');

if (mf) {
  const PORTRAIT_LOCK = ['portrait', 'portrait-primary', 'portrait-secondary'];
  const orient = typeof mf.orientation === 'string' ? mf.orientation.trim().toLowerCase() : '(없음)';
  const standalone = ['standalone', 'fullscreen', 'minimal-ui'].includes(String(mf.display || '').toLowerCase());

  ok(!PORTRAIT_LOCK.includes(orient),
    `orientation 이 세로 고정이 아니다 (지금: ${orient})`,
    '세로 고정이면 홈 화면 아이콘으로 연 사람은 폰을 돌려도 영영 세로다 — 화상수업이 가로를 요구하므로 모순');

  // 화면 쪽이 «가로» 를 요구한다는 근거를 실제로 확인한다(둘이 같은 말을 하는가)
  let idx = '';
  try { idx = readFileSync(join(PUB, 'index.html'), 'utf8'); } catch {}
  const wantsLandscape = /id="vc-orientation-overlay"/.test(idx)
    && /@media[^{]*max-width:\s*920px[^{]*orientation:\s*landscape/.test(idx.replace(/\s+/g, ' '));
  ok(wantsLandscape, '수업 화면은 여전히 «가로» 를 전제로 그린다(회전 안내 + 가로 전용 배치)',
    '이 전제가 사라졌다면 manifest 규칙도 사람이 다시 판단해야 한다');

  if (standalone && wantsLandscape) {
    ok(!PORTRAIT_LOCK.includes(orient),
      `display=${mf.display} 인데 세로로 잠그지 않는다`,
      '설치형(standalone)에서 세로 고정 = OS 가 회전을 막는다. 화면 CSS 로는 절대 못 이긴다');
  }

  ok(!/"orientation"\s*:\s*"portrait/.test(raw), '원문에도 portrait 잠금 문자열이 없다');
}

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
