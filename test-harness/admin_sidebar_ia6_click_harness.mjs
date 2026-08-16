// -*- coding: utf-8 -*-
// 🧭 관리자 사이드바(6그룹) 클릭 배선 하네스 (2026-08-08)
//   실행: node test-harness/admin_sidebar_ia6_click_harness.mjs
//
//   신고: 「사이드바에서 레벨테스트를 눌러도 그 메뉴로 안 간다. 다른 것들도 마찬가지다.」
//
//   🔴 원인 — `adm-ia6.js` 가 리스너를 **사이드바(#ph85-sidebar)** 에 달았다.
//      그런데 `adm-s11.js`(ph97)가 **window 캡처**에서 `.ph85-sub`·`.ph85-head` 를 가로채
//      `e.stopPropagation()` 을 부른다(그 파일 주석: «어떤 stopPropagation 도 막을 수 없음»).
//      캡처는 window → … → 사이드바 순서라, window 에서 끊기면 이벤트가 사이드바까지
//      **내려오지 않는다.** 실측: 사이드바 버블 리스너 발화 **0회** / window 캡처 **1회**.
//      → 클릭은 ph97 만 처리했고, ph97 은 인라인 `style.display=''` 로 카드를 되살리려 하는데
//        ia6 는 `.ia6-hide{display:none !important}` 로 감춘다. **인라인은 !important 를 못 이긴다.**
//        그래서 «카드는 열렸는데 화면엔 안 보이고, 스크롤도 안 움직이는» 상태가 됐다. 에러 0.
//
//   🔴 두 번째 — 필터가 걸려도 대시보드 머리(hero·KPI·빠른메뉴 ≈ 1,200px)는 카드가 아니라
//      감춰지지 않는다. 그래서 `window.scrollTo(0,0)` 로는 카드가 화면 밖(top 1203px)에 남았다.
//      → 대표 카드를 `scrollIntoView` 로 올린다.
//   🪤 그 스크롤을 **rAF 로 하면 안 된다** — 백그라운드/숨은 탭에서 rAF 는 아예 안 돈다(실측 0회).
//      타이머는 돈다. (CLAUDE.md 의 «백그라운드 탭에서 rAF 가 멈춘다» 와 같은 함정)
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const ia6  = rd('../cloudflare-deploy/public/js/adm-ia6.js');
const s11  = rd('../cloudflare-deploy/public/js/adm-s11.js');
const html = rd('../cloudflare-deploy/public/admin.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

console.log('\n[ ① 전제 — ph97 은 정말 window 캡처에서 전파를 끊는가 ]');
check('adm-s11.js(ph97)가 window 캡처 click 을 건다',
  /window\.addEventListener\('click'/.test(s11) && /\}, true\);\s*\/\/ CAPTURE phase/.test(s11));
check('그 안에서 .ph85-sub 를 가로챈다', /closest\('#ph85-sidebar \.ph85-sub'\)/.test(s11));
check('그리고 stopPropagation 을 부른다 — 사이드바에 단 리스너는 굶는다', /e\.stopPropagation\(\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*\}, true\);/.test(s11));

console.log('\n[ ② 그래서 ia6 는 window 캡처로 들어야 한다 ]');
check('🔴 사이드바(bar)에 직접 달지 않는다 — 이걸로 되돌리면 전 메뉴가 죽는다',
  !/bar\.addEventListener\('click'/.test(ia6));
check('window 에 건다', /window\.addEventListener\('click'/.test(ia6));
check('캡처 단계다 (마지막 인자 true)', /window\.addEventListener\('click'[\s\S]{0,3000}?\}, true\);/.test(ia6));
check('중복 등록 가드가 window 기준이다 (bar 가 다시 그려져도 유지)', /window\.__ia6Deleg/.test(ia6));
{
  // 주석에는 설명으로 등장하므로 «실행되는 줄» 만 골라서 본다.
  const body = (ia6.match(/function wireDelegate\([\s\S]*?\n  \}/) || [''])[0]
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  check('우리는 stopPropagation 하지 않는다 — 아래 리스너를 굶기지 않기 위해',
    body.length > 50 && !/e\.stopPropagation\(\)/.test(body));
}

console.log('\n[ ③ 아코디언을 두 번 토글하지 않는다 (서로 상쇄되면 영영 안 열린다) ]');
check('그룹 헤더 토글은 ph97 에게 맡긴다 — ia6 는 .ph85-group 의 open 을 건드리지 않는다',
  !/wasOpen/.test(ia6) && !/querySelectorAll\('\.ph85-group'\)/.test(ia6));
check('ia6 가 헤더에서 맡는 것은 「전체 보기」 하나뿐', /data-ia6-head'\)\s*===\s*'__all'/.test(ia6));

console.log('\n[ ④ 고른 카드를 «화면에» 올린다 ]');
check('대표 카드를 붙잡아 둔다 (lead)', /var lead = null;/.test(ia6));
check('scrollIntoView 로 올린다', /lead\.scrollIntoView\(\{ behavior: 'auto'/.test(ia6));
check('🪤 rAF 를 쓰지 않는다 — 숨은 탭에서 안 돌아 스크롤이 영영 안 일어난다',
  !/requestAnimationFrame/.test(ia6));
check('배치가 끝난 뒤 보정한다 (타이머 2번)', (ia6.match(/setTimeout\(toLead/g) || []).length >= 2);
check('smooth 금지 규칙을 지킨다', !/behavior:\s*'smooth'/.test(ia6));
check('대표 카드를 못 찾을 때만 맨 위로 (무동작 금지)', /\} else \{\s*\n\s*try \{ window\.scrollTo\(0, 0\)/.test(ia6));

console.log('\n[ ⑤ 감추기는 class + !important — 인라인 display 로는 못 되돌린다 ]');
check('ia6 는 class 로만 감춘다 (DOM 에서 빼지 않는다)', /classList\.add\(HIDE\)/.test(ia6) && !/\.remove\(\)/.test(ia6));
check('그 CSS 가 !important 다', /HIDE \+ '\{display:none !important\}|\.' \+ HIDE \+ '\{display:none !important\}/.test(ia6));

console.log('\n[ ⑥ 캐시 — 고친 js 가 실제로 내려가야 한다 ]');
{
  const m = html.match(/adm-ia6\.js\?v=(\d+)/);
  check(`admin.html 이 adm-ia6.js 를 버전과 함께 부른다 (?v=${m ? m[1] : '없음'})`, !!m);
  check('버전이 3 이상 (이번 수정 반영 — ?v= 를 안 올리면 옛 파일이 캐시에서 나온다)', !!m && Number(m[1]) >= 3);
}

/* 🐞 (2026-08-13 수정요청 #04) 버그·문의 화면에 «신규상담 → 등록 전환» 이 같이 떴다.
   원인은 GROUPS 의 한 항목이 두 카드를 함께 맡고 있던 것 하나뿐이다(다른 코드는 정상).
   항목을 둘로 쪼개 고쳤으니, 「다시 한 칸으로 묶으면 신고가 되돌아온다」를 여기서 막는다.
   ⚠️ 「card-inquiry-mgmt 를 통째로 지운다」로 고치는 것도 막는다 — 그러면 요구사항 2
      (신규상담 기능은 다른 화면에서 그대로 유지)를 어기고 메뉴에서 아예 사라진다. */
console.log('\n[ ⑦ 버그 화면과 신규상담 화면은 따로다 (2026-08-13 #04) ]');
{
  const start = ia6.indexOf('var GROUPS = [');
  const end = ia6.indexOf('\n  ];', start);
  const G = start >= 0 && end > start ? eval(ia6.slice(start + 'var GROUPS = '.length, end + 4)) : [];
  const items = G.flatMap(g => g.items.map(it => ({ key: g.key + ':' + it.ko, cards: it.cards || [] })));
  const owners = (id) => items.filter(it => it.cards.indexOf(id) >= 0);
  const inq = owners('card-inquiry-mgmt'), bug = owners('card-bug-reports');

  check('GROUPS 를 읽어냈다 (아래 검사의 전제)', items.length > 0);
  check('💌 신규상담 카드를 맡은 항목이 있다 — 없으면 메뉴에서 사라진다', inq.length > 0);
  check('🐞 버그 카드를 맡은 항목이 있다', bug.length > 0);
  check('🔴 둘을 같은 항목이 맡지 않는다 — 같이 맡으면 한 화면에 함께 뜬다',
    !items.some(it => it.cards.indexOf('card-inquiry-mgmt') >= 0 && it.cards.indexOf('card-bug-reports') >= 0));
  check('🐞 버그 카드가 «대표 카드(cards[0])» 다 — 점프·딥링크가 제 항목을 찾는다',
    bug.some(it => it.cards[0] === 'card-bug-reports'));
}

/* 🔁 항목 이름이 곧 localStorage 키다. 이름을 바꿔 놓고 이사를 안 시키면
   쓰던 사람이 다음 접속에 「오늘의 수업」으로 튄다 — «메뉴가 없어졌다» 신고가 된다. */
console.log('\n[ ⑧ 이름이 바뀐 항목은 옛 키를 새 키로 옮긴다 ]');
check('RENAMED 이사표가 있다', /var RENAMED = \{/.test(ia6));
check('옛 「문의·버그」 키를 잇는다', /'today:문의·버그'\s*:\s*'today:신규상담'/.test(ia6));
check('옮긴 값을 localStorage 에 다시 적는다 (다음 접속에도 유지)',
  /RENAMED\[want\][\s\S]{0,220}?localStorage\.setItem\(LS_KEY, want\)/.test(ia6));

/* 🔝 (2026-08-15 사장님) 「사이드바 메뉴를 눌러도 그 화면이 맨 위에 안 오고 경영지표 KPI 가 위에 남는다」
   원인은 «문서가 짧아서 더 못 내려가는» 것이었다(브라우저 실측: 스크롤 끝까지 갔는데 카드 top 380px).
   ⚠️ 여기서 막는 되돌림 세 가지 —
      ① 「머리(KPI)를 감추면 되지」 → 안 된다. 위쪽 X px 을 감추면 문서 높이도 X 만큼 줄어 차이가 그대로다.
      ② 꼬리 여백을 #legacy-cards «안»에 붙이기 → 그 컨테이너 밖 카드(결제·시간표·수업일지·숙제)에는 소용없다.
      ③ 시한·손떼기 없이 계속 맨 위로 되돌리기 → 「읽고 있는데 화면이 되돌아간다」가 된다. */
console.log('\n[ ⑨ 고른 화면이 «맨 위»에 오게 — 꼬리 여백 (2026-08-15) ]');
check('꼬리 여백 요소를 만든다 (ia6-tail)', /TAIL_ID\s*=\s*'ia6-tail'/.test(ia6));
check('🔴 body 맨 끝에 붙인다 — 컨테이너 안에 붙이면 그 밖의 카드엔 소용없다',
  /document\.body\.appendChild\(t\)/.test(ia6) && !/root\(\)\.appendChild\(t\)/.test(ia6));
check('여백은 «모자란 만큼만» 계산한다 (문서높이·화면높이로)',
  /scrollHeight/.test(ia6) && /window\.innerHeight/.test(ia6));
check('한 화면을 넘게는 넣지 않는다 (끝없는 빈 화면 방지)',
  /gap\s*>\s*window\.innerHeight\)\s*gap\s*=\s*window\.innerHeight/.test(ia6));
{
  // 주석에는 «실측 1.3배» 처럼 설명으로 나오므로 «실행되는 줄» 만 골라서 본다.
  const code = ia6.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  check('zoom 배율을 «재서» 맞춘다 — 배율을 코드에 박아 넣지 않는다',
    /ratio\s*=\s*css\s*\/\s*shown/.test(ia6) && !/[*/]\s*1\.\d/.test(code));
}
check('전체 보기에서는 여백을 0 으로 되돌린다', /showAll[\s\S]{0,400}?style\.height\s*=\s*'0px'/.test(ia6));
check('스크롤을 올리기 «전»에 여백부터 만든다 (순서가 바뀌면 올라갈 자리가 없다)',
  /fitTail\(\)[\s\S]{0,220}?lead\.scrollIntoView/.test(ia6));
check('자리가 잡힐 때까지 잠깐 따라간다 (한 번 보정으로는 부족 — 늦게 그려지는 표가 밀어낸다)',
  /alignTop/.test(ia6) && /setTimeout\(toLeadAgain/.test(ia6));
check('🔴 시한이 있다 — 없으면 영영 스크롤을 못 하게 된다', /Date\.now\(\)\s*\+\s*\d{3,}/.test(ia6));
check('🔴 사람이 스크롤하면 즉시 손을 뗀다 (wheel·touch·key)',
  /addEventListener\('wheel', release/.test(ia6) &&
  /addEventListener\('touchstart', release/.test(ia6) &&
  /addEventListener\('keydown', release/.test(ia6));
check('다른 곳으로 가려는 점프에는 양보한다 (⚡자주 쓰는 기능의 하위 항목 이동이 취소되지 않게)',
  /this\s*!==\s*alignLead\)\s*alignRelease\(\)/.test(ia6));
check('🪤 여기서도 rAF 를 쓰지 않는다', !/requestAnimationFrame/.test(ia6));

/* 📐 (2026-08-15 사장님) 「사이드바에서 시스템(=경영·설정)이 안 보인다」
   원인 셋: ⓐ 메뉴 6그룹 위에 «메뉴가 아닌 것»이 636px 쌓여 있어 첫 화면(441px)에 한 줄도 안 들어왔다,
           ⓑ 옛 「시스템」은 2026-08-08 개편에서 「경영·설정」으로 이름이 바뀌어 맨 아래 있었다,
           ⓒ 옛 메뉴 전체로 가는 「전체 보기」가 adm-q10(ph118)의 «빈 그룹 숨김»에 걸려 아예 안 보였다.
   ⚠️ 되돌림 방지 — 순서를 되돌리거나(메뉴가 다시 아래로), 이름을 지우거나, ph118 예외를 빼면 여기서 걸린다. */
console.log('\n[ ⑩ 메뉴가 사이드바 첫 화면에 · 🗺 메뉴 지도 (2026-08-15) ]');
check('메뉴 위에 있던 것들을 메뉴 «아래»로 내린다 (liftGroupsUp)', /function liftGroupsUp/.test(ia6));
check('내리는 대상이 그대로다 (음성 안내·AI 운영비서·사용법 안내·⚡자주 쓰는 기능)',
  /'ph85-voice-toggle', 'ph85-ai-asst', 'ph85-howto', 'ph161-quick'/.test(ia6));
check('🔴 지우지 않고 «옮기기»만 한다 (있던 것이 없어지면 그것도 신고다)',
  !/removeChild|\.remove\(\)/.test(ia6) && /insertBefore|appendChild/.test(ia6));
check('사이드바를 세울 때 자동으로 부른다', /liftGroupsUp\(bar\);/.test(ia6));
check('그룹 줄 높이를 낮춰 6그룹이 첫 화면에 들어오게 한다',
  /ph85-group\[data-ia6\][^']*margin-bottom:4px/.test(ia6) &&
  /ph85-head\{padding-top:5px !important;padding-bottom:5px !important\}/.test(ia6));
check('🔴 글자 크기는 건드리지 않는다 (「글씨가 작아졌다」 방지)', !/font-size/.test(ia6));
check('「전체 보기」를 「메뉴 지도」로 부른다', /data-ko="메뉴 지도" data-en="Menu map"/.test(ia6));
/* 🏷 사람들이 찾는 이름은 「시스템」이다(같은 신고 두 번). 「경영·설정」으로 되돌리면 여기서 걸린다.
   ⚠️ 그룹 이름은 localStorage 키가 아니다(키는 key='ops'). 그래서 이사표 없이 바꿔도 안전하다. */
check('여섯 번째 그룹 이름이 「시스템 / System」이다', /key: 'ops', ko: '시스템', en: 'System'/.test(ia6));
check('그룹 이름을 바꿔도 «마지막으로 보던 항목» 키는 그대로다 (키는 group.key 로 만든다)',
  /g\.key \+ ':' \+ it\.ko/.test(ia6) && !/g\.ko \+ ':'/.test(ia6));
check('쉬운말 툴팁(GRP)의 「시스템」 설명이 지금 내용과 맞다',
  /"시스템": "경영 지표·공지 발송·자료실·직원 권한·데이터 보관/.test(html));
/* 🗺 「사이트 구조도」(2026-08-15 추가)는 카드가 아니라 다른 페이지다. 옛 사이드바의 「시스템」
   그룹에만 있었는데 그 그룹은 ia6 가 감추므로 **아무도 볼 수 없었다**. 새 사이드바에도 있어야 한다. */
check('시스템 그룹에 「사이트 구조도」가 있다 (옛 사이드바에만 있으면 아무도 못 본다)',
  /ko: '사이트 구조도'[\s\S]{0,120}?href: '\/admin\/site-structure\.html'/.test(ia6));
check('그 문서 페이지가 실제로 있다', existsSync(resolve(__dir, '../cloudflare-deploy/public/admin/site-structure.html')));

/* 🗺 (2026-08-15 사장님) 「메뉴 지도 아무리 눌러도 안 보여, 조직도와 페이지가」
   옛 동작(showAll)은 감춘 카드를 다시 보이게 할 뿐이라 **화면에 아무 변화가 없었다** —
   지금 보는 자리는 그대로고 카드는 화면 «아래»에 늘어날 뿐이다. 그래서 진짜 지도를 연다.
   그리고 「무엇이 들어 있는지 음성이 안 나온다」 → 읽어 주고 «다 읽은 뒤에» 연다(먼저 옮기면 소리가 끊긴다). */
console.log('\n[ ⑪ 「메뉴 지도」는 진짜 지도를 연다 + 내용을 읽어 준다 (2026-08-15) ]');
{
  const r15 = rd('../cloudflare-deploy/public/js/adm-r15.js');
  check('🔴 눌러도 티가 안 나던 showAll 이 아니라 지도 페이지로 간다',
    /MAP_HREF = '\/admin\/site-structure-map\.html'/.test(ia6) &&
    /function openMenuMap/.test(ia6) && !/'__all'[\s\S]{0,120}?showAll\(\)/.test(ia6));
  check('그 지도 문서가 실제로 있다',
    existsSync(resolve(__dir, '../cloudflare-deploy/public/admin/site-structure-map.html')));
  check('무엇이 들어 있는지 읽어 준다 (한국어·영어 둘 다)',
    /function menuMapSpeech/.test(ia6) && /손님, 학생, 부모님, 선생님, 운영자/.test(ia6) &&
    /guests, students, parents, teachers and operators/.test(ia6));
  check('🔴 다 읽은 «뒤에» 연다 — 먼저 옮기면 그 순간 소리가 끊긴다',
    /admVoiceSay\(menuMapSpeech\(\), go\)/.test(ia6));
  check('🔴 음성이 꺼져 있거나 소리가 안 나도 반드시 열린다 (안 그러면 또 «눌러도 안 열린다»)',
    /if \(!speaking\) go\(\);/.test(ia6));
  check('adm-r15: 다 읽으면 알려 주는 창구를 연다 (admVoiceSay)',
    /window\.admVoiceSay = function\(text, onDone\)/.test(r15));
  check('🔴 onDone 은 어떤 경우에도 한 번은 불린다 (안전장치 타이머)',
    /if \(onDone\) setTimeout\(done, \d{4}\)/.test(r15) && /if \(!text \|\| !isOn\(\)\)\{ done\(\); return false; \}/.test(r15));
  check('오디오·브라우저음성 어느 쪽으로 나가도 끝을 잡는다',
    /a\.onended = function\(\)\{[^}]*done\(\)/.test(r15) && /u\.onend = onDone; u\.onerror = onDone;/.test(r15));
  check('음성 안내가 「메뉴 지도」를 두 번 읽지 않는다 (ia6 가 읽으므로 r15 는 건너뛴다)',
    /data-ia6-head'\) === '__all'\) return;/.test(r15));
  const mv = html.match(/adm-r15\.js\?v=(\d+)/);
  check(`admin.html 의 adm-r15.js 버전이 4 이상 (?v=${mv ? mv[1] : '없음'})`, !!mv && Number(mv[1]) >= 4);
}

/* 🔊 (2026-08-15 사장님) 「음성 켜짐과 꺼짐이 사이드바에서 이렇게 큰 자리를 차지하지 않아도 될 것 같아」
   메뉴 한 줄(48px)을 통째로 쓰던 토글을 아래 도크의 세 번째 칸(🩺진단 · 🌐EN 옆)으로 옮겼다.
   업계 관행도 «켜기/끄기 스위치는 도구 줄의 작은 자리»다(구글 접근성·워드·엣지·유튜브 자막).
   ⚠️ 여기서 막는 되돌림 —
      ① 계정 카드(#ph115-user)는 런타임에 #ph162-lang 뒤로 끼어든다. «한 번 붙이고 끝»으로 두면
         버튼이 셋째 줄로 밀려 도크가 12px 높아지고 「메뉴 지도」가 가려진다(실측으로 밟음).
      ② className 통째 대입 → 도크에서 얻은 .ph162-pill 이 지워져 한 번 누르면 모양이 무너진다.
      ③ 아이콘만 남기기 → 컴퓨터가 익숙하지 않은 직원이 지금 상태를 알 수 없다. 글자를 함께 둔다. */
console.log('\n[ ⑫ 음성 안내 토글을 아래 도크로 (2026-08-15) ]');
{
  const r15 = rd('../cloudflare-deploy/public/js/adm-r15.js');
  check('도크에 자리를 잡는 함수가 있다 (placeToggle)', /function placeToggle\(btn\)/.test(r15));
  check('🔴 계정 카드 «앞»에 넣는다 — 뒤에 넣으면 셋째 줄로 밀린다',
    /var ref = \(user && user\.parentNode === dock\) \? user : lang\.nextSibling;/.test(r15));
  check('🔴 재시도마다 자리를 다시 잡는다 (계정 카드가 나중에 끼어들기 때문)',
    /if \(made\) \{ placeToggle\(made\); return; \}/.test(r15));
  check('도크를 2칸 → 3칸으로 (줄 수는 그대로)',
    /has-voice\{grid-template-columns:1fr 1fr 1fr !important\}/.test(r15) &&
    /dock\.classList\.add\('has-voice'\)/.test(r15));
  check('🔴 className 을 통째로 대입하지 않는다 (.ph162-pill 이 지워진다)',
    /classList\.toggle\('off', !on\)/.test(r15) && !/btn\.className = on \? '' : 'off'/.test(r15));
  check('상태를 «글자»로 보여 준다 (아이콘만 두지 않는다)',
    /'음성 ' \+ \(on \? '켜짐' : '꺼짐'\)/.test(r15) && /'Voice ' \+ \(on \? 'on' : 'off'\)/.test(r15));
  check('마우스를 올리면 «누르면 어떻게 되는지» 를 알려 준다',
    /누르면 끕니다/.test(r15) && /누르면 켭니다/.test(r15) && /btn\.title =/.test(r15));
  check('스크린리더용 상태도 준다 (aria-pressed)', /setAttribute\('aria-pressed'/.test(r15));
  check('🪤 이모지 대신 SVG 를 쓴다 (Win10 두부 방지 · 도크 톤 일치)',
    /var SPK_ON  = '<svg/.test(r15) && !/\(on \? '🔊' : '🔇'\)/.test(r15));
  check('도크가 없는 옛 화면에서는 예전 자리로 되돌아간다 (버튼이 사라지지 않게)',
    /if \(placeToggle\(btn\)\) return;[\s\S]{0,220}?ph85-search-wrap/.test(r15));
  check('id 는 그대로 둔다 — 이 id 를 보는 곳이 셋 있다', /btn\.id = 'ph85-voice-toggle'/.test(r15));
  const mv2 = html.match(/adm-r15\.js\?v=(\d+)/);
  check(`admin.html 의 adm-r15.js 버전이 5 이상 (?v=${mv2 ? mv2[1] : '없음'})`, !!mv2 && Number(mv2[1]) >= 5);
}
check('🔴 라벨에 이모지를 넣지 않는다 — 왼쪽 SVG 와 «아이콘 두 개»가 된다',
  !/data-ko="[^"]*[\u{1F300}-\u{1FAFF}]/u.test(ia6));
{
  const q10 = rd('../cloudflare-deploy/public/js/adm-q10.js');
  check('adm-q10(ph118): 하위 항목이 «원래 없는» 그룹은 빈 그룹으로 보지 않는다',
    /if \(!subs\.length\) \{ g\.classList\.remove\('ph118-empty'\); return; \}/.test(q10));
  check('그 규칙 자체는 살아 있다 (권한으로 다 감춰진 그룹은 여전히 숨김)',
    /if \(visible === 0\) g\.classList\.add\('ph118-empty'\)/.test(q10));
  const mq = html.match(/adm-q10\.js\?v=(\d+)/);
  check(`admin.html 의 adm-q10.js 버전이 8 이상 (?v=${mq ? mq[1] : '없음'})`, !!mq && Number(mq[1]) >= 8);
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
