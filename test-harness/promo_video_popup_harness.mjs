// 🎬 홍보영상 팝업 가드 (2026-08-25)
//   실행: node test-harness/promo_video_popup_harness.mjs
//
//   무엇을 지키나 — 이 구성의 핵심은 «홈에 내려가는 것은 그림 한 장뿐» 이라는 한 문장이다.
//   그 문장은 코드 네 곳이 함께 지킨다. 하나만 무너져도 무게가 조용히 돌아온다.
//     ① promo.html 이 외부 js/css 를 안 부른다 (부르는 순간 이 페이지도 «무거운 화면» 이 된다)
//     ② 영상은 «누른 뒤» 붙인다 — HTML 에 <video src=…> 를 박으면 열자마자 받는다
//     ③ ?src= 는 같은 출처만 (외부 주소를 우리 페이지에서 재생시키는 길 차단)
//     ④ 관리자 프리셋이 팝업의 video_url 을 비워 둔다
//        — 넣으면 홈 팝업이 <video preload="metadata"> 를 그려 모두에게 앞부분이 내려간다
//     ⑤ 업로드 미디어 프록시가 Range(206) 를 준다 — iOS 재생·되감기가 여기에 걸려 있다
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };
// 부정 검사(«이 단어가 없어야 한다»)는 주석을 벗긴 사본으로 — 설명 주석이 자기 검사에 걸린다
const strip = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond, hint) => {
  if (cond) { PASS++; console.log(`  ✅ ${name}`); }
  else { FAIL++; FAILS.push(name); console.log(`  ❌ ${name}${hint ? ' — ' + hint : ''}`); }
};

const promo = rd('../cloudflare-deploy/public/promo.html');
const promoBare = strip(promo);
const setup = rd('../cloudflare-deploy/public/js/adm-promo-setup.js');
const setupBare = strip(setup);
const admin = rd('../cloudflare-deploy/public/admin.html');
const api = rd('../cloudflare-deploy/src/api-admin.ts');

console.log('\n════════ 🎬 홍보영상 팝업 가드 ════════');

console.log('\n[ ① 영상 페이지가 가볍게 유지되는가 ]');
check('promo.html 이 있다', promo.length > 0);
check('외부 스크립트를 하나도 안 부른다', !/<script\s[^>]*src=/i.test(promoBare),
  '이 페이지는 자기 <script> 하나로 끝나야 한다');
{
  const links = [...promoBare.matchAll(/<link[^>]+href="([^"]+)"/gi)].map((m) => m[1]);
  const bad = links.filter((h) => !/^\/css\/mangoi-han\.css/.test(h));
  check('외부 스타일시트는 한자 글꼴 하나뿐', bad.length === 0, bad.join(', '));
}
check('첫 화면 예산이 걸린 index.html 을 건드리지 않았다',
  !rd('../cloudflare-deploy/public/index.html').includes('promo-setup'),
  '홈에 코드를 넣으면 first_paint_budget_harness 가 FAIL 낸다');

console.log('\n[ ② 영상은 누른 뒤에 받는가 ]');
check('HTML 에 영상 src 를 박아 두지 않았다', !/<video[^>]+\ssrc=/i.test(promoBare));
check('누를 때 코드로 붙인다 (video.src = SRC)', /video\.src\s*=\s*SRC/.test(promoBare));
check('재생 버튼 클릭으로 시작한다', /playBtn\.addEventListener\('click',\s*start\)/.test(promoBare));
check('포스터 그림이 실제로 있다',
  existsSync(resolve(__dir, '../cloudflare-deploy/public/img/promo/mangoi-promo-poster.png')));
check('영상을 못 받으면 안내를 띄운다(검은 화면 금지)',
  /addEventListener\('error'/.test(promoBare) && /showWarn/.test(promoBare));

console.log('\n[ ③ ?src= 가 같은 출처로 묶여 있는가 ]');
check('safeSrc 검사가 있다', /function safeSrc/.test(promoBare));
check('/ 로 시작하지 않으면 버린다', /charAt\(0\)\s*!==\s*'\/'/.test(promoBare));
check('// 로 시작하는 «프로토콜 상대» 외부 주소도 버린다', /charAt\(1\)\s*===\s*'\/'/.test(promoBare));
check('동영상 확장자만 받는다', /mp4\|webm\|mov/.test(promoBare));

console.log('\n[ ④ 관리자 프리셋이 홈 무게를 늘리지 않는가 ]');
check('adm-promo-setup.js 가 있다', setup.length > 0);
check('팝업의 video_url 을 비워 둔다', /video_url:\s*null/.test(setupBare),
  '여기에 영상을 넣으면 홈 팝업이 모두에게 앞부분을 내려받게 한다');
check('포스터 + /promo.html 링크로 만든다',
  /image_url:\s*POSTER/.test(setupBare) && /link_url:\s*PAGE\s*\+\s*'\?src='/.test(setupBare));
check('만들어지는 팝업은 꺼진 상태다', /enabled:\s*false/.test(setupBare),
  '켜진 채로 만들면 확인 없이 학생 29,000명에게 노출된다');
check('만들기 전에 외부 주소를 막는다', /charAt\(1\)\s*===\s*'\/'/.test(setupBare));
check('관리자 화면에 상자가 있다',
  ['promo-setup-file', 'promo-setup-url', 'promo-setup-make', 'promo-setup-status']
    .every((id) => admin.includes('id="' + id + '"')));
check('관리자 화면이 그 스크립트를 부른다', /adm-promo-setup\.js\?v=\d+/.test(admin));

console.log('\n[ ⑤ 업로드한 영상이 폰에서 재생되는가 (Range) ]');
check('팝업 미디어 프록시가 Range 를 읽는다', /bytes=\(\\d\+\)-/.test(api));
check('206 으로 구간을 돌려준다', /status:\s*206/.test(api) && /Content-Range/.test(api));
check('Accept-Ranges 를 알린다', /Accept-Ranges/.test(api));
check('HEAD 도 받는다', /method === 'HEAD'/.test(api));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
