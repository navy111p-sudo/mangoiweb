/* vc_portrait_tidy_harness.mjs — 세로 수업 화면 «떠 있는 버튼» 자리 회귀 감시 (2026-08-20)
 * ───────────────────────────────────────────────────────────────────────────────
 * 왜 만들었나
 *   사장님 제보 ③ 「세로 아이콘 자리 정돈」. 떠 있는 버튼들이 서로를 모른 채 각자 좌표를
 *   갖고 있어서, 새 버튼이 생길 때마다 «몇 px 아래로» 를 손으로 맞춰 오다가 결국
 *   얼굴 영상 위와 「잠시만 기다려 주세요」 안내문 위로 올라왔다.
 *   고친 방식은 «덧칠» 이 아니라 **원래 규칙의 좌표를 고친 것**이라, 누가 옛 값으로
 *   되돌리면 조용히 그대로 재발한다 — 에러도 안 난다. 그래서 값 자체를 못 박는다.
 *
 * ⚠️ 한계를 알고 쓸 것
 *   이 검사는 «문자열» 검사다. 진짜 겹침은 브라우저로 렌더해서 좌표를 재야 알 수 있고,
 *   그건 실제로 그렇게 확인했다(헤드리스 크로미움, 500×757: 겹침 0개).
 *   여기서 잡는 것은 «되돌림» 이다 — CLAUDE.md 2장의 「별칭 때문에 조용히 안 먹던」 함정처럼
 *   문자열 검사만 믿지 말 것.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (p) => join(ROOT, 'cloudflare-deploy/public', p);

const html = readFileSync(P('index.html'), 'utf8');
const dock = readFileSync(P('js/vc-dock.js'), 'utf8');

// 부정 검사(«이 값이 없어야 한다»)는 주석을 벗겨 낸 사본으로 판정한다 —
// 「왜 없앴는지」 적은 설명 주석에 그 값이 들어 있어 자기 주석을 잡는 사고를 막는다.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const htmlNoC = strip(html.replace(/<!--[\s\S]*?-->/g, ''));
const dockNoC = strip(dock);

let pass = 0, fail = 0;
const ok = (name, cond, why) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n       ${why}`); }
};

console.log('════════ 세로 수업화면 떠 있는 버튼 자리 감시 ════════');

// ① 포인트 바구니(떠 있는 미러) — 통합바와 «같은 줄» (윗줄)
ok('① 바구니(뜬)가 맨 윗줄에 있다',
  /#vc-basket-float\{position:fixed;top:calc\(env\(safe-area-inset-top,0px\) \+ 8px\);left:8px;/.test(htmlNoC),
  '#vc-basket-float 의 top 이 8px 가 아니다. 56px 로 되돌리면 얼굴 영상 위에 얹힌다(본문은 51px 에서 시작).');

// ② 얼굴 타일 «안» 의 바구니·칭찬 버튼 — 얼굴 한가운데가 아니라 모서리
ok('② 타일 안 바구니·칭찬이 모서리(6px)에 있다',
  /#vc-local-box \.vc-point-basket,\s*[\s\S]{0,120}?\.vc-star-btn\{ top: 6px; \}/.test(htmlNoC),
  '.vc-point-basket / .vc-star-btn 의 top 이 6px 가 아니다. 46px 로 되돌리면 얼굴 한가운데를 덮는다.');

// ③ ☰ 기능 — 안내문 위가 아니라 화면 맨 아래
ok('③ ☰기능이 화면 맨 아래에 있다',
  /\.vc-phero-ctrl \{[\s\S]{0,200}?bottom: calc\(env\(safe-area-inset-bottom,0px\) \+ 8px\)/.test(htmlNoC),
  '.vc-phero-ctrl 의 bottom 이 안전영역+8px 가 아니다. 58px 로 되돌리면 「잠시만 기다려 주세요」 카드 위에 걸린다.');

ok('③-2 독을 열면 떠 있는 ☰기능을 «감춘다»(올리지 않는다)',
  /vc-dock-open \.vc-phero-ctrl\{display:none !important;\}/.test(dockNoC) &&
  !/vc-dock-open \.vc-phero-ctrl\{bottom:[^}]*132px/.test(dockNoC),
  '독이 열릴 때 .vc-phero-ctrl 을 132px 로 «올리는» 옛 규칙이 살아 있다. 그 자리가 안내문 한가운데다(실측 t=580).');

// ④ 라이트(밝기) — 떠 있지 않고 상단바 안
ok('④ 라이트가 상단바 안에 있다(떠 있지 않다)',
  !/body\.vc-in-call\.mg-uni-on #mango-theme-toggle\{[^}]*position:fixed/.test(htmlNoC.replace(/\s+/g, ' ').replace(/ \{/g, '{')),
  '#mango-theme-toggle 이 다시 position:fixed(top:56px) 로 떠 있다. 그 자리가 얼굴 영상 위다.');

// ⑤ 통합바가 좌우 칩과 겹치지 않도록 폭 상한
ok('⑤ 통합바 폭 상한으로 좌우 칩 자리를 비워 둔다',
  /#mg-unibar\{ max-width:calc\(100% - 200px\) !important; \}/.test(htmlNoC),
  '#mg-unibar 의 폭 상한이 없다. 좁은 폰에서 바구니·라이트와 겹친다.');

// ⑥ 세로 하단 독: 화면공유 자리를 «기능» 이 대신한다 (사장님 지시 2026-08-20)
ok('⑥ 세로에서 독의 화면공유 ↔ 기능 교체가 살아 있다',
  /#vc-dock #vc-dock-share\{display:none !important;\}/.test(dockNoC) &&
  /#vc-dock #vc-dock-func\{display:flex !important;\}/.test(dockNoC),
  '세로 전용 교체 규칙이 없다. 화면공유는 ☰기능 메뉴 안으로 옮겼으므로, 이 규칙이 없으면 세로에서 기능 버튼이 사라진다.');

ok('⑥-2 PC·가로 독에는 기능 버튼이 안 나온다(거긴 기능 메뉴가 없다)',
  /#vc-dock #vc-dock-func\{display:none;\}/.test(dockNoC),
  '기본 숨김이 «#vc-dock #vc-dock-func» 가 아니다. «#vc-dock-func» 하나로는 «#vc-dock button{display:flex}»(특정성 1,0,1)를 못 이겨 PC 에서 버튼이 8개가 된다(실제로 밟음).');

// ⑦ 화면공유를 «없앤» 것이 아니라 옮긴 것 — 기능 메뉴에 항목이 있어야 한다
const rc = readFileSync(P('js/idx-vc-roomcode.js'), 'utf8');
ok('⑦ 화면공유가 ☰기능 메뉴 안에 있다',
  /vc-phero-share-btn/.test(rc) && /vcFolderOpen\('screen'\)/.test(rc),
  '기능 메뉴의 화면공유 항목이 없다. 세로 독에서 뺐으므로 이게 없으면 세로에서 화면공유를 쓸 방법이 사라진다.');

/* ── 맨 윗줄을 «한 줄» 로 합치는 장치 (2026-08-20 사장님 추가 지시) ──
   「위의 표시들이 일자로 맨 위에 나오게 해 줘. 너무 분산되어 산만해」
   → 좌표를 맞추는 대신 통합바 «안» 으로 옮긴다. 그 장치가 살아 있는지 못 박는다. */
const toprow = readFileSync(P('js/idx-vc-toprow.js'), 'utf8');
const toprowNoC = strip(toprow);

ok('⑧ 한 줄 합치기 파일을 index.html 이 defer 로 부른다',
  /<script\s+defer\s+src="\/js\/idx-vc-toprow\.js\?v=\d+"><\/script>/.test(html),
  'idx-vc-toprow.js 를 안 부르거나 defer 가 빠졌다. defer 를 빼면 첫 화면 무게 예산을 넘긴다(여유 0).');

ok('⑨ 한 줄 규칙이 index.html 규칙을 이길 특정성을 쓴다',
  /var K = 'body\.vc-in-call\.mg-uni-on\.mg-uni-one '/.test(toprow),
  'index.html 의 «body.vc-in-call.mg-uni-on #…»(특정성 1,2,1) 가 !important 로 높이·폭을 못 박고 있다. ' +
  '선택자를 한 단계 낮추면 통합바가 안 펴지고 칩 높이도 안 맞는다(실측으로 밟음).');

ok('⑩ 상단바 자리를 비워 둔다(본문이 위로 올라오지 않게)',
  /\.toolbar\{min-height:56px !important;\}/.test(toprowNoC),
  '라이트·번개가 통합바 안으로 가면 .toolbar 가 15px 로 쪼그라들어 본문이 위로 올라오고, ' +
  '통합바가 다시 영상 위에 얹힌다(실측: 본문 시작 51px → 15px).');

ok('⑪ body class 를 MutationObserver 로 지켜보지 않는다',
  !/MutationObserver/.test(toprowNoC),
  'body class 를 지켜보면 콜백이 쉴 새 없이 돌아 화면이 멎는다 — 이 작업 중 실제로 밟았고, ' +
  '2026-07-14 라이브 장애(idx-vc-screenmode.js 주석)와 같은 뿌리다.');

ok('⑫ 가로·PC 로 돌아가면 원래 자리로 되돌린다',
  /function restore\(/.test(toprowNoC) && /__toprowHome/.test(toprowNoC),
  '되돌리는 코드가 없다. 세로에서 옮긴 버튼이 가로·PC 에서 통합바 안에 갇힌다.');

console.log('──────────────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n⚠️ 값이 옛것으로 되돌아갔습니다 — 사장님 제보 ③ 의 겹침이 그대로 재발합니다.'); process.exit(1); }
console.log('🎉 세로 화면 버튼 자리 유지됨.');
