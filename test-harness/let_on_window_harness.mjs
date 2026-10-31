/* ═══════════════════════════════════════════════════════════════════════════
   🕳 «let 으로 선언한 것을 window. 로 읽는» 코드 감시 (2026-08-28 신설)

   [무엇을 막나] classic script 의 `let`/`const` 는 **window 의 속성이 되지 않는다.**
   그래서 다른 파일이 `window.그이름` 으로 읽으면 **영원히 undefined** 인데,
   에러가 안 나고 `|| ''` · `typeof … !== 'undefined'` 같은 가드를 조용히 통과한다.

   이 저장소가 실제로 세 번 밟았다:
     · window.vcRoomId  → 회선품질 로그 675건 중 673건에 방 번호가 없었다(한 달간)
     · window.pdfZoom   → 핀치·더블탭이 배율을 못 바꿨다(→ pdfSetZoom() 신설로 수리)
     · window.pdfZoom   → 교재를 바꿔도 확대가 초기화되지 않았다. 그 초기화 줄은
                          **한 번도 실행된 적이 없었다**(2026-08-28 사장님 화면 실측 320%)

   [검사 방법] idx-main.js 에서 최상위 `let`/`const` 이름을 모으고,
   다른 화면 스크립트가 그 이름을 `window.` 로 만지는지 본다.
   ⚠️ «있는가» 가 아니라 «선언 방식과 접근 방식이 어긋나는가» 를 본다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'cloudflare-deploy', 'public', 'js');
let pass = 0, fail = 0;
const ok = (n) => { console.log('  ✅ ' + n); pass++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w ? '\n       ' + w : '')); fail++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

/** 줄 단위로 주석을 벗긴다 — 블록주석을 정규식 하나로 지우면 짝 없는 «별표+슬래시»
 *  하나에 코드가 통째로 함께 지워진다(이 저장소 index.ts 에서 실측 8만자). */
function stripComments(src) {
  let inBlk = false;
  return src.split(/\r?\n/).map((raw) => {
    const t = raw.trim();
    if (inBlk) { if (t.includes('*/')) inBlk = false; return ''; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlk = true; return ''; }
    if (t.startsWith('//')) return '';
    return raw.replace(/\s\/\/.*$/, '');
  }).join('\n');
}

const mainSrc = stripComments(readFileSync(join(JS, 'idx-main.js'), 'utf8'));

console.log('\n[ A. idx-main.js 의 최상위 let/const 이름을 모은다 ]');
// 들여쓰기 없는 최상위 선언만 — 함수 안의 지역변수는 애초에 window 와 무관하다
const declared = new Set();
for (const m of mainSrc.matchAll(/^(?:let|const)\s+([A-Za-z_$][\w$]*)/gm)) declared.add(m[1]);
check(`최상위 let/const ${declared.size}개를 읽었다`, declared.size > 10, '선언을 못 찾았다 — 파일 구조가 바뀌었나?');

console.log('\n[ B. 다른 화면 스크립트가 그 이름을 window. 로 만지지 않는다 ]');
{
  // 이 이름들은 idx-main.js 가 window 에 «따로» 노출해 둔 것이라 예외다(접근자·명시적 대입)
  const exposed = new Set(
    [...mainSrc.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]),
  );
  for (const m of mainSrc.matchAll(/Object\.defineProperty\(\s*window\s*,\s*['"]([\w$]+)['"]/g)) exposed.add(m[1]);

  const hits = [];
  for (const f of readdirSync(JS).filter((f) => f.endsWith('.js') && f !== 'idx-main.js')) {
    const src = stripComments(readFileSync(join(JS, f), 'utf8'));
    /* ⚠️ `window.` 만 찾으면 절반만 본다 — 이 저장소에는 `(function (w, d) { … })(window, document)`
       처럼 **window 를 별칭으로 받는** 파일이 있고, 그 안의 `w.vcRoomId` 는 같은 버그인데
       검사에 안 걸렸다(2026-08-28 trap-check 지적 — vc-judgment-capture.js 4곳이 그랬고,
       그 탓에 수업 중 판단 캡처가 한 건도 안 올라가고 있었다). 별칭을 찾아 함께 본다. */
    const aliases = new Set(['window']);
    for (const a of src.matchAll(/\(\s*function\s*\(\s*([A-Za-z_$][\w$]*)\s*(?:,[^)]*)?\)\s*\{[\s\S]*?\}\s*\)\s*\(\s*window\b/g)) aliases.add(a[1]);
    for (const a of src.matchAll(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*window\s*[;,]/g)) aliases.add(a[1]);
    const pat = new RegExp(`\\b(?:${[...aliases].join('|')})\\.([A-Za-z_$][\\w$]*)`, 'g');
    for (const m of src.matchAll(pat)) {
      const name = m[1];
      if (!declared.has(name) || exposed.has(name)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      /* ✅ 정상 형태는 넘어간다 — «맨 이름 우선, window 는 폴백».
         `(typeof vcRoomId !== 'undefined') ? vcRoomId : window.vcRoomId`
         이 꼴은 앞쪽이 늘 먹으므로 뒤의 window 는 죽은 폴백일 뿐 해가 없다
         (본보기: mango-attendance.js). 그 줄에 «맨 이름 typeof» 가 있으면 통과. */
      const lineText = src.split('\n')[line - 1] || '';
      if (new RegExp(`typeof\\s+${name}\\b`).test(lineText)) continue;
      hits.push(`${f}:${line} — ${m[0]} (idx-main.js 에 let/const 로 선언됨 → 늘 undefined)`);
    }
  }
  check('let/const 를 window. 로 읽는 곳이 없다', hits.length === 0,
    hits.slice(0, 12).join('\n       ')
    + (hits.length > 12 ? `\n       … 외 ${hits.length - 12}건` : '')
    + '\n       → 값이 늘 undefined 다. 노출된 접근자·setter(예: window.pdfSetZoom)를 쓰거나,'
    + '\n         같은 classic script 끼리는 «맨 이름»(window. 없이) 으로 읽을 것.');
}

console.log('\n[ C. 교재 확대 초기화가 정본 함수를 쓴다 ]');
{
  const x3 = stripComments(readFileSync(join(JS, 'idx-x3.js'), 'utf8'));
  check('새 교재를 열 때 pdfSetZoom 으로 초기화한다',
    /window\.pdfSetZoom\s*\(\s*1\s*\)/.test(x3),
    '교재를 바꿔도 앞 교재의 확대가 남는다(실측 320%). window.pdfZoom 대입은 아무 일도 하지 않는다');
  check('pdfSetZoom 이 배율을 실제로 바꾸고 다시 그린다',
    /function pdfSetZoom\([\s\S]{0,200}pdfZoom = /.test(mainSrc) && /function pdfSetZoom\([\s\S]{0,260}pdfRender\(\)/.test(mainSrc),
    'setter 가 배율만 바꾸고 렌더를 안 하면 화면이 그대로다');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 let_on_window_harness 실패'); process.exit(1); }
console.log('🎉 let_on_window_harness — 전부 통과');
