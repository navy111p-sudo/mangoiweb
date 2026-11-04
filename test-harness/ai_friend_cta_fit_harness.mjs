// -*- coding: utf-8 -*-
/* ai_friend_cta_fit_harness.mjs — A.i 친구하기 첫 화면 노란 버튼 글자 맞추기(efFitCta) (2026-11-04)
 *
 * 왜: 사장님 폰(폭 320px · 삼성 «화면 확대» 기기)에서 «Emma에게 말 걸기» 가 버튼 밖으로 넘쳤다.
 *     고친 뒤에도 scrollWidth 정수 비교로 재면 0.3px 넘침을 못 봐 «말 …» 로 잘렸다(실측 글자 53.11 · 칸 52).
 * 무엇을 보나(함수를 HTML 에서 오려 내 «가짜 버튼» 으로 실제로 돌린다 — 글자로 묻지 않는다):
 *   ① 넓으면 원래 글자 그대로 · 버튼 이름(aria-label) 없음
 *   ② 이름을 먼저 살린다 — 아이콘을 빼서 들어가면 짧은 글자로 안 바꾼다
 *   ③ 정말 안 들어가면 짧은 글자 + 버튼 이름에 원래 글자(보이는 글자가 그 안에 든다 — WCAG 2.5.3)
 *   ④ 0.4px 넘침도 «안 들어감» 으로 본다(정수 반올림 함정)
 *   ⑤ 버튼이 안 보이면(폭 0) 원래 글자 그대로
 *   ⑥ 영어도 같은 규칙
 *   ⑦ 처음 그릴 때·친구 바꿀 때·화면 크기 바뀔 때 부른다(배선)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'cloudflare-deploy/public/ai-friend.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); } };

function bodyOf(src, name) {
  const i = src.search(new RegExp('function\\s+' + name + '\\s*\\('));
  if (i < 0) return '';
  const st = src.indexOf('{', src.indexOf(')', i));
  let d = 0;
  for (let k = st; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  return '';
}
const fitSrc = bodyOf(html, 'efFitCta');
const ctaSrc = bodyOf(html, 'efCtaText');
ok('전제: efFitCta·efCtaText 를 오려 냈다', fitSrc.length > 200 && ctaSrc.length > 20);

// 가짜 버튼 — 글자 폭은 «한 글자 = cw px», 아이콘 20·18px, 안쪽 여백 14·14, 간격 8
function world({ btnW, en = false, name = 'Emma', cw = 9.5 }) {
  const cls = new Set(['efa-cta']);
  const attrs = {};
  const span = { textContent: '', style: {}, getBoundingClientRect: () => ({ width: span.textContent.length * cw }) };
  const svg1 = { getBoundingClientRect: () => ({ width: cls.has('efa-cta-noicon') ? 0 : 20 }) };
  const svg2 = { getBoundingClientRect: () => ({ width: (cls.has('efa-cta-noicon') || cls.has('efa-cta-noarrow')) ? 0 : 18 }) };
  const btn = {
    children: [svg1, span, svg2], clientWidth: Math.round(btnW),
    classList: { add: c => cls.add(c), remove: (...c) => c.forEach(x => cls.delete(x)), contains: c => cls.has(c) },
    setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; },
    getBoundingClientRect: () => ({ width: btnW }),
  };
  const document = { querySelector: () => btn, getElementById: () => span };
  const getComputedStyle = () => ({ paddingLeft: '14px', paddingRight: '14px', borderLeftWidth: '0px', borderRightWidth: '0px', columnGap: '8px' });
  let fn;
  try {
    fn = new Function('document', 'getComputedStyle', 'isEn', 'friendOf', 'personNow',
      ctaSrc + '\n' + fitSrc + '\nreturn efFitCta;')(document, getComputedStyle, () => en, () => ({ name }), () => name);
    fn();
  } catch (e) { return { err: String(e).slice(0, 120) }; }
  return { text: span.textContent, aria: attrs['aria-label'] || '', cls: [...cls].filter(c => c !== 'efa-cta'), flexLeft: span.style.flex };
}
const full = 'Emma에게 말 걸기'.length * 9.5;   // 114
const short = '말 걸기'.length * 9.5;           // 38

let r = world({ btnW: 28 + 20 + 8 + full + 8 + 18 + 5 });
ok('① 넓으면 원래 글자 · 아이콘 그대로 · 버튼 이름 없음', !r.err && r.text === 'Emma에게 말 걸기' && r.cls.length === 0 && !r.aria, JSON.stringify(r));
r = world({ btnW: 28 + full + 1 });
ok('② 아이콘을 빼면 들어가는 폭 → 이름 든 글자를 살린다', !r.err && r.text === 'Emma에게 말 걸기' && r.cls.includes('efa-cta-noicon'), JSON.stringify(r));
r = world({ btnW: 28 + 20 + 8 + full + 1 });
ok('② 화살표만 빼면 들어가는 폭 → 화살표만 뺀다', !r.err && r.text === 'Emma에게 말 걸기' && r.cls.includes('efa-cta-noarrow') && !r.cls.includes('efa-cta-noicon'), JSON.stringify(r));
r = world({ btnW: 28 + 20 + 8 + short + 8 + 18 + 1 });
ok('③ 안 들어가면 짧은 글자(아이콘 함께)', !r.err && r.text === '말 걸기' && r.cls.length === 0, JSON.stringify(r));
ok('③ 짧은 글자면 버튼 이름 = 원래 글자 · 보이는 글자가 그 안에 든다', r.aria === 'Emma에게 말 걸기' && r.aria.indexOf(r.text) >= 0, JSON.stringify(r));
r = world({ btnW: 28 + short + 1 });
ok('③ 아주 좁으면 짧은 글자만(아이콘 없이)', !r.err && r.text === '말 걸기' && r.cls.includes('efa-cta-noicon'), JSON.stringify(r));
r = world({ btnW: 28 + full - 0.4 });
ok('④ 0.4px 모자라도 «안 들어감» — 원래 글자를 고르지 않는다', !r.err && r.text !== 'Emma에게 말 걸기', JSON.stringify(r));
ok('④ 잰 뒤 글자 칸을 원래대로 돌려 둔다(flex 빈 값)', r.flexLeft === '', JSON.stringify(r));
r = world({ btnW: 0 });
ok('⑤ 버튼이 안 보이면 원래 글자 그대로', !r.err && r.text === 'Emma에게 말 걸기' && !r.aria, JSON.stringify(r));
r = world({ btnW: 28 + 'Say hi'.length * 9.5 + 1, en: true });
ok('⑥ 영어 — 짧은 글자 Say hi · 버튼 이름 Say hi to Emma', !r.err && r.text === 'Say hi' && r.aria === 'Say hi to Emma', JSON.stringify(r));
r = world({ btnW: 400, en: true, name: 'Noah' });
ok('⑥ 영어 — 넓으면 Say hi to Noah', !r.err && r.text === 'Say hi to Noah' && !r.aria, JSON.stringify(r));

// ⑦ 배선 — 주석을 벗긴 사본에서 «부르는가»
const live = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const re = bodyOf(html, 'renderEmpty'), sy = bodyOf(html, 'efSyncFriend');
ok('⑦ 처음 그릴 때(renderEmpty) 맞춘다', /\befFitCta\(\)/.test(live(re)));
ok('⑦ 친구를 바꿀 때(efSyncFriend) 맞춘다', /\befFitCta\(\)/.test(live(sy)));
ok('⑦ 친구를 바꿀 때 옛 방식(글자만 갈아끼우기)으로 되돌아가지 않았다', !/efCta[\s\S]{0,80}textContent\s*=\s*efCtaText/.test(live(sy)));
ok('⑦ 화면 크기가 바뀌면 다시 잰다(resize)', /addEventListener\(\s*'resize'[\s\S]{0,60}\)/.test(live(html.slice(html.indexOf('function efFitCta'), html.indexOf('function efFitCta') + 4000))));
ok('⑦ CSS — 글자 칸이 버튼 안에서 줄고 «…» 를 쓴다', /#chat \.efa #efCta\{[^}]*min-width:0[^}]*text-overflow:ellipsis/.test(html));
ok('⑦ CSS — 아이콘 빼기 클래스가 실제로 아이콘을 감춘다', /\.efa-cta-noarrow > svg:last-child[^{]*\.efa-cta-noicon > svg\{\s*display:none/.test(html));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
