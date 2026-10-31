// -*- coding: utf-8 -*-
/*
 * 🧾 사이드바 맨 위 「결재함」 줄 감시 (2026-08-20)
 *   실행: node test-harness/sidebar_approval_row_harness.mjs
 *
 * [왜 만들었나]
 *   이 한 줄은 **함정 위에 지어져 있다.** 아무 생각 없이 «정리» 하면 조용히 죽는다.
 *     ① 사이드바 클릭은 window 캡처 핸들러 둘(adm-s11 ph97 · adm-ia6 wireDelegate)이 가로챈다.
 *        다만 `.ph85-head` / `.ph85-sub` / `.ph86-action-btn` 만 본다. 그래서 이 줄은
 *        **다른 class 의 진짜 <a>** 로 뒀다. class 를 저 셋 중 하나로 바꾸면 클릭이 삼켜진다.
 *     ② 자식 메뉴의 선행 이모지는 adm-menu-icons.js 가 **벗겨낸다**(2026-07-22 결정).
 *        그래서 벨을 글자에 넣으면 화면에서 사라진다 — 숫자는 **별도 배지 요소**여야 한다.
 *     ③ hover 확대(transform)는 「정신없다」고 일부러 뺐다(CLAUDE.md 1-3). 강조는 색으로만.
 *     ④ 숫자는 admin.html 이 **이미 부르는 API 한 번**으로 채운다. 여기서 또 부르면
 *        첫 화면에서 같은 요청이 두 번 나간다(필리핀 회선에서 그게 그대로 지연이 된다).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => { try { return readFileSync(join(ROOT, 'cloudflare-deploy', 'public', p), 'utf8'); } catch { return ''; } };

let PASS = 0, FAIL = 0; const FAILS = [];
const ok = (n, c, x) => { if (c) PASS++; else { FAIL++; FAILS.push(n + (x ? ' — ' + x : '')); }
  console.log(`  ${c ? '✅' : '❌'} ${n}${c || !x ? '' : ' — ' + x}`); };

const IA6 = rd('js/adm-ia6.js');
const ADM = rd('admin.html');
const APPR = rd('js/adm-appr-badge.js');   // 2026-09-09: 배지 JS 는 defer 파일로 분리(첫 화면 예산). CSS 는 admin.html 에 남음

console.log('\n[ ① 줄이 그려진다 ]');
ok('adm-ia6.js 가 결재함 줄을 만든다', /appr\.id\s*=\s*'ia6-appr'/.test(IA6));
ok('/work 로 가는 진짜 링크다', /appr\.href\s*=\s*'\/work'/.test(IA6));
ok('그룹들보다 «먼저» 붙는다 (접힌 그룹 안에 묻히지 않게)',
  IA6.indexOf("frag.appendChild(appr)") < IA6.indexOf('GROUPS.forEach(function (g) {\n      var grp'));
/* 🔁 2026-09-09 — 라벨의 data-ko/data-en 은 <a> 가 아니라 «글자만 담은 span» 에 있어야 한다.
   <a> 에 달려 있던 동안 EN/KO 토글이 textContent 를 갈아끼워 아이콘·배지 요소가 지워졌다. */
ok('한국어·영어 라벨을 함께 싣는다 (🌐 를 눌러도 따라오게) — 라벨 span 에',
  /class="ia6-appr-l" data-ko="결재함" data-en="Approvals"/.test(IA6));
ok('⛔ <a> 자체에는 data-ko/data-en 을 달지 않는다 (i18n 이 배지 요소를 지운다)',
  !/appr\.setAttribute\('data-(ko|en)'/.test(IA6));

console.log('\n[ ② 클릭이 삼켜지지 않는가 — 가장 중요한 것 ]');
/* ph97·wireDelegate 가 보는 class 를 쓰면 그 순간 리스너가 이 클릭을 가로챈다.
   ⚠️ 아이콘 상자에 쓰는 .ph85-ico 는 «보는 대상» 이 아니라 무해하므로 검사에서 뺀다. */
const apprBlock = (IA6.match(/var appr = document\.createElement[\s\S]*?frag\.appendChild\(appr\);/) || [''])[0];   // 범위는 길이가 아니라 양쪽 앵커로 — 주석이 길어졌다고 검사가 «못 찾았다» 로 헛돌지 않게(2026-09-09 실제로 밟음)
ok('결재함 줄을 만드는 구간을 찾았다', apprBlock.length > 0);
ok('⛔ class 에 ph85-head 를 쓰지 않는다 (쓰면 ph97 이 삼킨다)', !/ph85-head/.test(apprBlock));
ok('⛔ class 에 ph85-sub 를 쓰지 않는다 (쓰면 ph97 이 삼킨다)', !/ph85-sub/.test(apprBlock));
ok('⛔ class 에 ph86-action-btn 을 쓰지 않는다', !/ph86-action-btn/.test(apprBlock));

console.log('\n[ ③ 숫자는 «별도 배지» 다 (글자에 이모지를 넣으면 벗겨진다) ]');
ok('배지 요소가 따로 있다', /id="ia6-appr-n"/.test(IA6) || /ia6-appr-n/.test(IA6));
ok('⛔ 라벨 글자에 벨 이모지를 넣지 않았다 (adm-menu-icons.js 가 벗겨낸다)',
  !/결재함\s*\\u?d?83?\u{1F514}/u.test(IA6) && !/'\u{1F514}/u.test(apprBlock));
ok('0 건이면 배지가 숨는다', /\.ia6-appr-n:empty\{display:none\}/.test(ADM));

console.log('\n[ ④ 강조는 색으로만 — hover 확대 금지 (CLAUDE.md 1-3) ]');
const css = (ADM.match(/<style id="ia6-appr-css">[\s\S]*?<\/style>/) || [''])[0];
/* 🪤 부정 검사(«이 단어가 없어야 한다»)는 **주석을 벗겨 낸 사본**으로 해야 한다.
      안 그러면 «왜 쓰면 안 되는지» 적어 둔 설명 주석이 자기 자신에게 걸린다
      (CLAUDE.md 에 적힌 함정 — 만들면서 그대로 밟았다). */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
ok('전용 스타일 블록이 있다', css.length > 0);
ok('⛔ transform(확대·이동)을 쓰지 않는다', !/transform/.test(cssCode));
ok('대기가 있으면 «켜지는» 상태가 있다 (.on)', /#ia6-appr\.on\{/.test(cssCode));
ok('0 건에도 테두리로 남는다 (올리러 들어갈 때 찾기 쉽게)', /#ia6-appr\{[^}]*border:[^}]*#0b6e63/.test(cssCode));

console.log('\n[ ⑤ API 를 두 번 부르지 않는다 ]');
ok('배지 JS(adm-appr-badge.js)가 기존 호출로 사이드바 배지도 채운다', /paintSidebar\(s\)/.test(APPR) && /\/api\/approval\/home/.test(APPR));
ok('admin.html 이 그 파일을 defer 로 싣는다 (인라인 되돌리기 금지 — 첫 화면 예산)',
  /<script src="\/js\/adm-appr-badge\.js\?v=\d+" defer>/.test(ADM) && !/paintSidebar\(s\)/.test(ADM));
ok('⛔ adm-ia6.js 는 결재 API 를 따로 부르지 않는다', !/\/api\/approval\//.test(IA6));

console.log('\n[ ⑥ 캐시 번호 ]');
ok('adm-ia6.js 를 고쳤으면 ?v= 도 올렸다 (asset_version_harness 와 짝)',
  /adm-ia6\.js\?v=(\d+)/.test(ADM) && Number(ADM.match(/adm-ia6\.js\?v=(\d+)/)[1]) >= 45);

console.log('\n────────────────────────────────');
console.log(`총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패:'); FAILS.forEach((f) => console.log('  - ' + f)); }
process.exit(FAIL === 0 ? 0 : 1);
