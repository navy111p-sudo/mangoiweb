// 한자 글꼴 통일 가드 — 중국어 한자가 화면마다 다른 글꼴로 그려지는 사고를 막는다.
//
// 왜 하네스가 필요한가:
//   같은 문제가 세 번 재발했다. 매번 원인이 «다른 경로» 였다.
//     1차: 한글 글꼴만 지정돼 있어서 한자가 대체글꼴로 샘
//     2차: 이름은 넣었는데 «순서» 가 뒤라 공통한자는 앞의 한글글꼴이 먼저 그림
//     3차: font-family 는 맞는데 그 화면에 @font-face «정의» 가 없어 이름이 조용히 무시됨
//          + 캔버스(ctx.font)는 CSS 를 아예 안 봐서 검사에 안 걸림
//   → 네 갈래를 한꺼번에 지켜야 통일이 유지된다.
//
// 검사 대상은 학생·게임 화면(public/*.html)과 공용 js/css.
// 관리자(public/admin/*, js/adm-*.js)는 한국어·영어 전용 UI 라 대상에서 뺐다 — 담당 영역도 다르다.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const PUB = path.join(HERE, '..', 'cloudflare-deploy', 'public');
const FONT = 'MangoiHanSC';

// 벤더 번들·이모지 전용 그리기는 제외
const SKIP = new Set(['pdf.min.js', 'pdf.worker.min.js', 'idx-x6.js',
                      'tailwind-build.css', 'mangoi-han.css',
                      'admin-readability.css']);   // 관리자 전용 CSS — 위와 같은 이유로 제외

const ls = (dir, ext) => {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith(ext) && !SKIP.has(f) && !f.startsWith('adm-'))
             .map(f => path.join(dir, f));
  } catch { return []; }
};

const HTML = ls(PUB, '.html');
const JS = ls(path.join(PUB, 'js'), '.js');
const CSS = ls(path.join(PUB, 'css'), '.css');

const FF = /font-family:\s*([^;}\n]{0,90})/g;
const CFONT = /\.font\s*=\s*([^;\n]{0,200})/g;
const KEYWORD = /^(inherit|initial|unset|revert)/i;

const fails = [];
let nFF = 0, nCanvas = 0, nLink = 0;

for (const p of [...HTML, ...JS, ...CSS]) {
  const rel = path.relative(PUB, p).replace(/\\/g, '/');
  const s = fs.readFileSync(p, 'utf8');

  // ① CSS: 모든 font-family 의 «맨 앞» 이 우리 글꼴이어야 한다.
  //    뒤에 있으면 공통 한자(我·的·社)는 앞의 한글 글꼴이 먼저 그려 자형이 섞인다.
  for (const m of s.matchAll(FF)) {
    const v = m.group ? m.group(1) : m[1];
    const t = v.trim();
    if (KEYWORD.test(t)) continue;
    if (t.startsWith(`'${FONT}'`) || t.startsWith(`"${FONT}'`)) continue;  // @font-face 정의문
    nFF++;
    if (!t.toLowerCase().startsWith(FONT.toLowerCase()))
      fails.push(`${rel} — font-family 맨 앞이 ${FONT} 가 아님: ${t.slice(0, 50)}`);
  }

  // ② 캔버스: ctx.font 는 CSS 상속을 받지 않는다. 문자열 안에 직접 있어야 한다.
  for (const m of s.matchAll(CFONT)) {
    const e = m[1];
    if (!/px/.test(e)) continue;
    nCanvas++;
    if (!e.includes(FONT))
      fails.push(`${rel} — 캔버스 글꼴에 ${FONT} 없음: ${e.trim().slice(0, 55)}`);
  }
}

// ③ 화면마다 @font-face «정의» 가 닿아 있어야 한다.
//    정의가 없으면 font-family 에 이름이 있어도 브라우저가 조용히 건너뛴다.
for (const p of HTML) {
  const rel = path.basename(p);
  const s = fs.readFileSync(p, 'utf8');
  nLink++;
  const hasLink = s.includes('mangoi-han.css');
  const hasInline = s.includes('@font-face') && s.includes('mangoi-han-sc.woff2');
  if (!hasLink && !hasInline)
    fails.push(`${rel} — 글꼴 정의가 없음 (/css/mangoi-han.css 링크 또는 인라인 @font-face 필요)`);
}

// ④ 글꼴 파일 자체
const woff2 = path.join(PUB, 'fonts', 'mangoi-han-sc.woff2');
if (!fs.existsSync(woff2)) fails.push('fonts/mangoi-han-sc.woff2 가 없음');

console.log('\n════════ 한자 글꼴 통일 가드 ════════');
console.log(`  검사: 화면 ${nLink}개 · font-family ${nFF}곳 · 캔버스 글꼴 ${nCanvas}곳`);
if (fails.length) {
  console.log(`  ❌ ${fails.length}건`);
  for (const f of fails.slice(0, 30)) console.log('     ' + f);
  if (fails.length > 30) console.log(`     ... 외 ${fails.length - 30}건`);
  console.log('──────────────────────────────────────');
  console.log('  한자가 화면마다 다른 글꼴로 보이게 됩니다. 위 항목을 고치세요.');
  process.exit(1);
}
console.log('  ✅ 전 화면의 한자가 한 글꼴로 통일돼 있음.');
process.exit(0);
