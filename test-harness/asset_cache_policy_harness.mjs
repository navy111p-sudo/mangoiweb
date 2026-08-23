/**
 * asset_cache_policy_harness.mjs — «재방문은 공짜» 를 지키는 캐시 규칙이 사라지지 않게 (2026-08-23)
 *
 * 왜 필요한가
 *   필리핀 저속·고지연 회선에서 첫 화면 체감의 대부분은 «왕복 지연» 이다.
 *   그래서 src/index.ts 가 두 가지를 해 두었다:
 *     · 2026-07-22 — ?v= 가 붙은 js/css 는 1년 immutable (재검증 0회)
 *     · 2026-08-14 — 이미지·폰트·소리·영상에도 캐시 지시 (그 전엔 «아예 없었다»)
 *   이 두 줄이 사라지면 아무도 눈치채지 못한다 — 화면은 똑같이 나오고, 느려질 뿐이다.
 *   그리고 느려진 것은 «회선 탓» 으로 오해된다. 그래서 코드로 못 박는다.
 *
 *   ⚠️ 전제: js/css 를 고치면 HTML 의 ?v= 를 반드시 올려야 한다(안 올리면 옛 파일이 1년 남는다).
 *      그 규칙은 asset_version_harness.mjs 가 따로 강제한다. 이 하니스는 «캐시를 준다» 쪽만 본다.
 *
 * ⚠️ 이 하니스는 «코드에 그렇게 적혀 있는가» 까지만 본다.
 *    실제 응답 헤더는 배포된 사이트에서 사람이 봐야 한다(개발자도구 → Network → idx-main.js).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy', 'src', 'index.ts');
const raw = readFileSync(SRC, 'utf8');
/* 부정 검사가 자기 설명 주석을 잡지 않도록 주석을 벗긴 사본으로 판정한다 */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

let pass = 0, fail = 0;
const ok = m => { pass++; console.log(`  ✅ ${m}`); };
const no = m => { fail++; console.log(`  ❌ ${m}`); };

console.log('asset_cache_policy_harness — 재방문이 공짜인 상태를 지키는가');

/* ① js/css : ?v= 가 붙으면 1년 immutable
   ⚠️ 「파일 어딘가에 max-age=31536000 이 있는가」로 검사하면 안 된다 — 그 문자열은 아래
      «이미지·폰트» 규칙에도 있어서, js/css 쪽을 통째로 지워도 검사가 통과한다.
      (2026-08-23 실제로 그렇게 짰다가, 일부러 지워 보는 시험에서 안 잡히는 것을 발견했다.)
      그래서 «_versioned 로 판정한 그 분기 안에서» immutable 을 주는지까지 본다. */
const vBlock = code.match(/_versioned\s*=[\s\S]{0,600}/);
const jsRule = /_versioned\s*=\s*\/\\?\.\(js\|css\)/.test(code) || /_versioned/.test(code);
const jsImmutable = !!vBlock && /if\s*\(\s*_versioned\s*\)[\s\S]{0,200}?max-age=31536000,\s*immutable/.test(vBlock[0]);
if (jsRule && jsImmutable) ok('① ?v= 가 붙은 js/css 를 1년 immutable 로 준다');
else no('① js/css 의 immutable 규칙이 없다 — 접속마다 파일 24개를 재검증한다(왕복 지연이 그대로 체감)');

/* ② 버전 없는 js/css 는 no-cache (안전한 기본값) — 이것까지 immutable 로 하면 사고가 난다 */
if (/assetHeaders\.set\('Cache-Control',\s*'no-cache'\)/.test(code))
  ok('② 버전이 없는 js/css 는 no-cache 로 둔다 (옛 파일이 1년 남는 사고 방지)');
else no('② 버전 없는 파일까지 캐시한다 — 고쳐도 사용자에게 안 나가는 사고가 난다');

/* ③ 이미지·폰트·소리·영상에도 캐시 지시가 있는가 (2026-08-14 이전엔 아예 없었다) */
const mediaRule = /\(png\|jpe\?g\|gif\|webp\|avif\|svg\|ico\|woff2\?\|ttf\|otf/.test(code);
const mediaCache = /max-age=604800,\s*stale-while-revalidate/.test(code);
if (mediaRule && mediaCache) ok('③ 이미지·폰트·소리·영상에 캐시 지시가 있다 (7일 + 뒤에서 갱신)');
else no('③ 미디어에 캐시 지시가 없다 — 페이지를 옮길 때마다 그림을 한 장씩 다시 물어본다');

/* ④ 폰트는 언제나 1년 (한자 폰트 983KB) */
if (/_isFont/.test(code) && /woff2\?\|ttf\|otf/.test(code))
  ok('④ 폰트는 언제나 1년 (한자 폰트 983KB 를 매번 받지 않는다)');
else no('④ 폰트 예외가 사라졌다 — 983KB 폰트를 다시 받게 된다');

/* ⑤ 이 대책이 «필리핀 회선» 을 위한 것이라는 근거가 코드에 남아 있는가.
      숫자만 남고 이유가 사라지면 다음 사람이 «필요 없는 최적화» 로 지운다.
      (긍정 검사이므로 주석이 있는 원본에서 본다) */
if (/필리핀/.test(raw) && /immutable/.test(raw))
  ok('⑤ 왜 이렇게 했는지(필리핀 회선)가 코드에 적혀 있다');
else no('⑤ 이유가 사라졌다 — 다음 사람이 «필요 없는 최적화» 로 지울 수 있다');

console.log(`\n${fail === 0 ? '✅' : '🚨'} asset_cache_policy_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
