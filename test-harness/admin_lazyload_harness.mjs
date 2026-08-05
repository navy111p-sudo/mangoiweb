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

console.log('\n[ ②-2 안내 그림은 WebP (같은 그림, 용량 1/3) ]');
{
  const s18 = rd('../cloudflare-deploy/public/js/adm-s18.js');
  const gdir = resolve(__dir, '../cloudflare-deploy/public/guide');
  let webpKo = 0, jpgKo = 0;
  try {
    const fs = await import('node:fs');
    const ls = fs.readdirSync(gdir + '/admin-easy');
    webpKo = ls.filter(f => f.endsWith('.webp')).length;
    jpgKo = ls.filter(f => f.endsWith('.jpg')).length;
  } catch { }
  check(`한국어 안내 그림이 .webp 로 변환돼 있다 (${webpKo}장)`, webpKo >= 20);
  check(`원본 .jpg 도 폴백용으로 남아 있다 (${jpgKo}장)`, jpgKo >= 20);
  check('환영 모달이 .webp 를 가리킨다', /admin-easy(-en)?\/' \+ pad\([^)]*\) \+ '\.webp'/.test(welc));
  check('상세 뷰어도 .webp 를 가리킨다', /pad\(n\+1\)\+'\.webp'/.test(s18));
  check('환영 모달에 .jpg 폴백이 있다',
    /onErrorFallback/.test(welc) && /replace\(\/\\\.webp\$\/, '\.jpg'\)/.test(welc));
  check('상세 뷰어에 .jpg 폴백이 있다(큰 그림·썸네일 둘 다)',
    /toJpg\(/.test(s18) && /onerror=/.test(s18) && /\.jpg/.test(s18));
}

console.log('\n[ ②-3 한자 폰트(983KB)를 «장식 문자» 때문에 받지 않기 ]');
{
  const fs = await import('node:fs');
  const pub = resolve(__dir, '../cloudflare-deploy/public');
  // 폰트 unicode-range 에 CJK 문장부호·전각형이 들어 있어, 「」·＋ 같은 «한국어 UI 장식» 하나만 있어도
  // 한자가 한 글자도 없는 화면이 983KB 를 통째로 내려받는다. (실제로 vocab·finance-realtime 이 그랬다)
  const HAN = c => (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) || (c >= 0xF900 && c <= 0xFAFF);
  const DECO = c => (c >= 0x3000 && c <= 0x303F) || (c >= 0xFF00 && c <= 0xFFEF);
  const walk = (d, out = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = d + '/' + e.name;
      if (e.isDirectory()) walk(p, out); else if (p.endsWith('.html')) out.push(p);
    }
    return out;
  };
  const bad = [];
  for (const f of walk(pub)) {
    let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (!t.includes('mangoi-han.css')) continue;
    // 화면에 그려지는 부분만 본다 — <script> 안 정규식·주석은 폰트를 부르지 않는다
    const body = t.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    let han = 0, deco = 0;
    for (const ch of body) { const c = ch.codePointAt(0); if (HAN(c)) han++; else if (DECO(c)) deco++; }
    const rel = f.slice(pub.length + 1);
    // 예외: refund.html 의 「」 는 «학원의 설립·운영 및 과외교습에 관한 법률» 처럼
    //   법령 이름을 감싸는 한국 법률 인용 표기다. 표기를 바꾸는 건 문서 내용을 바꾸는 것이라 그대로 둔다.
    if (rel === 'refund.html') continue;
    if (!han && deco) bad.push(rel + ' (장식 ' + deco + '자)');
  }
  check(`한자 없는 화면이 장식 문자로 폰트를 부르지 않는다${bad.length ? ' — ' + bad.join(', ') : ''}`, bad.length === 0);
}

console.log('\n[ ③ 카드 스크립트 지연 로딩 ]');
const lazyTags = [...html.matchAll(/<script type="text\/lazy-js" data-src="([^"]+)" data-card="([^"]+)"(?:\s+data-globals="([^"]*)")?><\/script>/g)];
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

console.log('\n[ 🛟 대역 함수 — «안 받고도 안 깨지게» (전체 프리페치 대체) ]');
check('모든 지연 태그가 노출 함수 목록(data-globals)을 들고 있다',
  lazyTags.every(m => m[3] && m[3].split(',').filter(Boolean).length > 0));
check(`대역 대상 함수가 충분히 잡혀 있다 (${lazyTags.reduce((a, m) => a + (m[3] || '').split(',').filter(Boolean).length, 0)}개)`,
  lazyTags.reduce((a, m) => a + (m[3] || '').split(',').filter(Boolean).length, 0) >= 50);
check('부팅 때 대역 함수를 먼저 깐다', /installStubs\(\);/.test(lazy) && /function installStubs\(/.test(lazy));
check('이미 존재하는 전역은 덮어쓰지 않는다',
  /typeof window\[name\] !== 'undefined'\) return;/.test(lazy));
check('대역이 불리면 그때 받아서 «같은 인자로» 다시 부른다',
  /real\.apply\(self, args\)/.test(lazy));
check('진짜 함수가 덮었는지 구분한다 (무한 재귀 방지)', /real !== stubOf\[name\]/.test(lazy));
check('⛔ 전체 프리페치를 «자동으로» 돌리지 않는다 — 이게 바이트 절감의 핵심',
  !/setTimeout\(\s*loadRest/.test(lazy)
  && !/requestIdleCallback\(\s*loadRest/.test(lazy)
  && !/addEventListener\([^)]*loadRest/.test(lazy));
check('긴급 복구용 수동 호출구는 남겨 둔다', /loadRest: loadRest/.test(lazy));
check('같은 파일을 두 번 넣지 않는다', /loadedSrc\[src\]/.test(lazy));
check('순서를 보존한다 (async=false)', /s\.async = false/.test(lazy));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
