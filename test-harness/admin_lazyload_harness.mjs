// -*- coding: utf-8 -*-
// 🐢 관리자 초기 로딩 다이어트 하네스 (2026-08-04)
//   실행: node test-harness/admin_lazyload_harness.mjs
//
//   실측(로컬 렌더, 캐시 헤더 포함): 초기 요청 102개·7,762KB → 84개·5,534KB (−28.7%)
//     ① 같은 안내 영상(750KB)을 <video> 3개가 preload="auto" 로 각각 받아 첫 방문에 4번 내려받았다
//     ② 첫 접속 세션마다 «쉬운 사용법» 18장(폴더 7.5MB)을 전부 미리 받았다
//     ③ 카드별 스크립트 15개(188KB)를 열지도 않은 채 미리 받았다
//   이 하네스는 그 세 가지가 되돌아가지 못하게 막는다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const html = rd('../cloudflare-deploy/public/admin.html');
const lazy = rd('../cloudflare-deploy/public/js/adm-lazy.js');
const welc = rd('../cloudflare-deploy/public/js/adm-welcome.js');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

console.log('\n[ ① 안내 영상 — 같은 파일을 여러 번 받지 않기 ]');
const vids = [...html.matchAll(/<video[^>]*src="\/video\/ai-ops-greeting\.mp4"[^>]*>/g)].map(m => m[0]);
check(`영상 요소는 3개 그대로 (${vids.length}개)`, vids.length === 3);
check('그중 preload="auto" 는 최대 1개 (보이는 FAB 하나만)',
  vids.filter(v => /preload="auto"/.test(v)).length <= 1);
check('접혀 있는 메뉴 안 영상은 autoplay 를 쓰지 않는다 (autoplay 는 preload=none 을 무시함)',
  vids.filter(v => /autoplay/.test(v) && /preload="none"/.test(v)).length === 0);
check('메뉴가 열릴 때 재생하도록 배선돼 있다',
  /dial\.querySelector\('video'\)/.test(html) && /sdv\.play\(\)/.test(html));

console.log('\n[ ② 사용법 안내 이미지 — 18장 통째 미리받기 금지 ]');
check('처음 몇 장만 미리 받는다', /SLIDES\.slice\(0,\s*\d\)\.forEach/.test(welc));
check('전체 미리받기(SLIDES.forEach)로 되돌아가지 않았다',
  !/SLIDES\.forEach\(function \(s\) \{ var im = new Image\(\)/.test(welc));
check('넘길 때 다음 장 미리받기는 그대로 살아 있다 (넘김이 끊기지 않게)',
  /tmp\s*=\s*new Image\(\)/.test(welc));

console.log('\n[ ③ 카드 스크립트 지연 로딩 ]');
const lazyTags = [...html.matchAll(/<script type="text\/lazy-js" data-src="([^"]+)" data-card="([^"]+)"><\/script>/g)];
check(`지연 태그가 남아 있다 (${lazyTags.length}개)`, lazyTags.length >= 10);
check('모든 지연 태그에 소속 카드가 지정돼 있다', lazyTags.every(m => /^card-/.test(m[2])));
check('모든 지연 태그가 ?v= 캐시 버전을 유지한다 (immutable 캐시 안전)',
  lazyTags.every(m => /\?v=\d+/.test(m[1])));
check('지정된 카드가 실제로 존재한다',
  lazyTags.every(m => html.includes(`id="${m[2]}"`)));
check('로더가 먼저 실행되도록 등록돼 있다', /adm-lazy\.js\?v=\d+/.test(html));
check('로더가 지연 태그보다 앞에 있다',
  html.indexOf('adm-lazy.js?v=') < html.indexOf('type="text/lazy-js"'));

console.log('\n[ 지연 때문에 깨질 수 있는 두 가지를 막았는가 ]');
check('① DOMContentLoaded 로 스스로 배선하는 스크립트를 대신 깨워준다',
  /DOMContentLoaded/.test(lazy) && /pending\.push\(fn\)/.test(lazy) && /new Event\('DOMContentLoaded'\)/.test(lazy));
check('   가로챈 addEventListener 를 반드시 되돌린다 (누수 방지)',
  /function restore\(\)/.test(lazy) && /restore\(\);/.test(lazy));
check('② 카드의 ontoggle 을 로드 후 다시 흘려준다',
  /dispatchEvent\(new Event\('toggle'\)\)/.test(lazy));
check('details 의 toggle 은 캡처 단계로 받는다 (버블링하지 않음)',
  /addEventListener\('toggle'[\s\S]{0,900}?\}\s*,\s*true\)/.test(lazy));
check('처음부터 펼쳐진 카드도 챙긴다', /menu-card\[open\]/.test(lazy));
check('안전망이 남은 것을 결국 다 받는다', /function loadRest\(/.test(lazy));
check('안전망이 너무 일찍 돌지 않는다 (유휴 즉시 실행 방지)',
  /IDLE_AFTER\s*=\s*\d{4}/.test(lazy) && /setTimeout\(function \(\)[\s\S]{0,180}requestIdleCallback/.test(lazy));
check('같은 파일을 두 번 넣지 않는다', /loadedSrc\[src\]/.test(lazy));
check('순서를 보존한다 (async=false)', /s\.async = false/.test(lazy));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
