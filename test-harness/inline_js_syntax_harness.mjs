/**
 * 🧨 인라인 JS 문법 게이트 — "수업 입장 불가" 급 장애 재발 방지 (2026-07-23)
 *
 * 왜 만들었나
 *   폰트 일괄치환이 **JS 문자열 안의 CSS**를 건드려 문자열이 끊겼다.
 *     ov.style.cssText = '…font-family:"Noto Sans KR",'Malgun Gothic','맑은 고딕',sans-serif';
 *                                                     ↑ 여기서 문자열 종료 → SyntaxError
 *   index.html 인라인 script 10블록이 통째로 죽어 showView·createWebSocket·pdfLoad 가
 *   아예 정의되지 않았다 = 전 사용자 수업 입장 불가.
 *
 *   🔴 그런데 **배포 게이트를 전부 통과했다.** 이유:
 *     · tsc 는 .ts 만 본다 (HTML 인라인 JS 는 대상 밖)
 *     · 스모크는 HTTP 200 만 확인한다 (문법이 깨져도 파일은 200 이다)
 *     · 인라인 JS 검사는 changes_qa_harness 안에 있는데, 그 하니스는 git 상태에 의존해서
 *       run.mjs 의 GATE_EXCLUDE 로 **배포 게이트에서 통째로 제외**돼 있었다.
 *   → 그래서 '의존성 없이 항상 도는' 이 파일을 따로 만든다.
 *
 * 검사 범위: cloudflare-deploy/public 의 모든 .html 인라인 <script> + 모든 .js
 * 성질: 네트워크·git·DB 무관, 결정론적.
 *
 * 실행: node test-harness/inline_js_syntax_harness.mjs
 *      MANGOI_ROOT=<폴더> 로 대상 교체 (역검증용)
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.env.MANGOI_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const TMP = mkdtempSync(join(tmpdir(), 'mangoi-syntax-'));

let checked = 0, failed = 0;
const failures = [];

function listFiles(dir, out = []) {
  let ents;
  try { ents = readdirSync(dir); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    // 외부 라이브러리 원본(vendor)은 우리가 고치는 대상이 아니라 제외
    if (st.isDirectory()) { if (e !== 'vendor' && e !== 'node_modules') listFiles(p, out); }
    else out.push(p);
  }
  return out;
}

/** node --check 로 한 조각을 검사. 통과=null, 실패=에러 첫 줄들 */
function syntaxError(code, tag) {
  const f = join(TMP, tag.replace(/[^\w.-]/g, '_') + '.js');
  writeFileSync(f, code, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    return null;
  } catch (e) {
    const raw = (e.stderr && e.stderr.toString('utf8')) || String(e.message || e);
    const lines = raw.split('\n').filter(Boolean);
    // 사람이 바로 알아볼 수 있게: 문제 코드 줄 + SyntaxError 줄만
    const codeLine = (lines.find(l => /^\s*\S.*$/.test(l) && !/^[A-Za-z]:\\|^\/|node:internal|at /.test(l)) || '').trim();
    const errLine = (lines.find(l => /SyntaxError/.test(l)) || lines[0] || '').trim();
    return { errLine, codeLine: codeLine.slice(0, 190) };
  }
}

console.log('═'.repeat(66));
console.log(' 🧨 인라인 JS 문법 게이트 (HTML <script> + .js 전수)');
console.log('═'.repeat(66));

const files = listFiles(PUB);
const htmls = files.filter(f => extname(f).toLowerCase() === '.html');
const jss = files.filter(f => extname(f).toLowerCase() === '.js');

// ── ① HTML 안의 인라인 <script> ──────────────────────────────────────
//   src= 가 있는 건 외부 파일이라 여기선 건너뛴다(아래 ②에서 따로 본다).
//   type 이 module/JSON/템플릿인 것도 제외 — JS 문법으로 볼 대상이 아니다.
const SCRIPT_RE = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
for (const f of htmls) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  let m, idx = 0;
  while ((m = SCRIPT_RE.exec(src))) {
    const attrs = m[1] || '', body = m[2] || '';
    idx++;
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (!body.trim()) continue;
    const typeM = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    const type = typeM ? typeM[1].toLowerCase() : '';
    if (type && !/^(text\/javascript|application\/javascript|module)$/.test(type)) continue;
    checked++;
    const err = syntaxError(body, `${rel.replace(/\//g, '_')}_${idx}`);
    if (err) {
      failed++;
      failures.push({ file: rel, where: `인라인 script #${idx}`, ...err });
    }
  }
}

// ── ② 별도 .js 파일 ──────────────────────────────────────────────────
for (const f of jss) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  const code = readFileSync(f, 'utf8');
  // ESM(import/export)은 --check 가 CJS 로 파싱해 오탐 → 모듈로 저장해 검사
  const isModule = /^\s*(import|export)\s/m.test(code);
  checked++;
  const err = isModule ? null : syntaxError(code, rel.replace(/\//g, '_'));
  if (err) { failed++; failures.push({ file: rel, where: '파일 전체', ...err }); }
}

console.log(`  검사한 조각: ${checked}개  (HTML ${htmls.length}개 · JS ${jss.length}개)`);
console.log('─'.repeat(66));

if (!failed) {
  console.log('  ✅ 문법 오류 0건 — 인라인 JS 가 죽어 화면이 통째로 멈추는 사고는 없음.');
} else {
  console.log(`  ❌ 문법 오류 ${failed}건 — 이대로 배포하면 해당 화면의 JS 가 통째로 죽습니다.`);
  for (const x of failures.slice(0, 20)) {
    console.log(`\n   ▸ ${x.file}  (${x.where})`);
    if (x.codeLine) console.log(`     문제 줄: ${x.codeLine}`);
    console.log(`     ${x.errLine}`);
  }
  if (failures.length > 20) console.log(`\n   … 외 ${failures.length - 20}건`);
  console.log('\n  💡 흔한 원인: 작은따옴표 JS 문자열 안에 또 작은따옴표가 들어감');
  console.log("     예) '…font-family:\"Noto Sans KR\",\\'Malgun Gothic\\',sans-serif'  ← 폰트명 따옴표가 문자열을 끊음");
  console.log('     HTML 을 일괄치환(sed/replace)한 뒤에는 반드시 이 검사를 돌릴 것.');
}
console.log('═'.repeat(66));
process.exit(failed ? 1 : 0);
