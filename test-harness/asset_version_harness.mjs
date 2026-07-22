/**
 * asset_version_harness.mjs
 * ── "js/css 를 고쳤으면 ?v= 도 올렸다" 배포 게이트 ──
 *
 * 왜 필요한가:
 *   worker(src/index.ts)는 URL 에 ?v= 가 붙은 js/css 를 immutable(1년) 로 캐시시킨다.
 *   필리핀 저속·고지연 회선에서 admin.html 이 부르는 js 80개를 매 접속마다 재검증하던
 *   왕복 비용을 없애기 위한 것이다(측정: JS 실행은 79개 합쳐 101ms, 병목은 왕복 지연).
 *
 *   그 대가로 규칙이 하나 생긴다 — 파일 내용을 고치면 HTML 의 ?v= 를 반드시 올려야 한다.
 *   안 올리면 이미 접속했던 사용자에게 옛 파일이 최대 1년간 남는다.
 *   사람 기억에 맡기면 언젠가 반드시 사고가 나므로, 이 하니스가 배포 게이트에서 막는다.
 *
 * 동작:
 *   public/**.html 이 참조하는 `/js/x.js?v=N` (css 포함) 을 모두 찾아
 *   현재 파일 내용의 해시를 manifest(asset-versions.json) 와 대조한다.
 *     · 같은 (경로, 버전) 인데 내용이 바뀜  → ❌ 실패 (?v= 를 올려야 함)
 *     · 처음 보는 (경로, 버전)             → 기록하고 통과 (= 버전을 올린 정상 경우)
 *
 * 실행: node test-harness/asset_version_harness.mjs
 *   manifest 를 현재 상태로 재기록: node test-harness/asset_version_harness.mjs --update
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'cloudflare-deploy', 'public');
const MANIFEST = join(__dirname, 'asset-versions.json');
const UPDATE = process.argv.includes('--update');

const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      // 자료·이미지 폴더는 HTML 이 없으므로 건너뛴다(스캔 시간 절약)
      if (/^(img|face-fx|media|fonts|lib)$/i.test(name)) continue;
      walk(p);
    } else if (/\.html$/i.test(name)) {
      htmlFiles.push(p);
    }
  }
})(PUBLIC);

// HTML 이 참조하는 버전 붙은 js/css 수집: src="/js/foo.js?v=3" · href="/x.css?v=2"
const refs = new Map();   // "js/foo.js?v=3" → Set(참조한 html)
const REF_RE = /(?:src|href)="(\/[^"?]+\.(?:js|css))\?([^"]*)"/g;
for (const hf of htmlFiles) {
  const html = readFileSync(hf, 'utf8');
  let m;
  while ((m = REF_RE.exec(html))) {
    const assetPath = m[1];                       // "/js/foo.js"
    const query = m[2];                           // "v=3" 또는 "a=1&v=3"
    const vm = /(?:^|&)v=([^&]*)/.exec(query);
    if (!vm) continue;                            // 버전 없는 참조는 immutable 대상이 아님
    const key = `${assetPath}?v=${vm[1]}`;
    if (!refs.has(key)) refs.set(key, new Set());
    refs.get(key).add(hf.slice(PUBLIC.length + 1).replace(/\\/g, '/'));
  }
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

let pass = 0, fail = 0, added = 0, missing = 0;
const out = [];
const failures = [];

for (const [key, users] of [...refs.entries()].sort()) {
  const assetPath = key.split('?')[0];
  const filePath = join(PUBLIC, assetPath.replace(/^\//, ''));
  if (!existsSync(filePath)) {
    missing++;
    failures.push(`  ⚠️  참조된 파일이 없음: ${assetPath}  (참조: ${[...users].join(', ')})`);
    continue;
  }
  const hash = sha(readFileSync(filePath));
  const known = manifest[key];
  if (!known) {
    manifest[key] = hash;
    added++;
    pass++;
  } else if (known === hash) {
    pass++;
  } else if (UPDATE) {
    manifest[key] = hash;
    added++;
    pass++;
  } else {
    fail++;
    failures.push(
      `  ❌ ${assetPath} 내용이 바뀌었는데 ?v= 가 그대로입니다 (현재 ${key.split('?v=')[1]}).\n` +
      `      → ${[...users].join(', ')} 의 ?v= 를 올리세요. 안 올리면 기존 사용자에게 옛 파일이 남습니다.`
    );
  }
}

if (added > 0 || UPDATE) {
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

console.log('\n════════ 정적자산 버전 가드 (?v= 누락 방지) ════════');
console.log(`  검사 대상: 버전 붙은 js/css 참조 ${refs.size}건 (HTML ${htmlFiles.length}개)`);
if (added) console.log(`  🆕 새 버전 ${added}건 기록 (정상 — 버전을 올렸거나 최초 실행)`);
if (failures.length) console.log(failures.join('\n'));
console.log('──────────────────────────────────────────');
console.log(`총 ${pass + fail + missing}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패 / ⚠️ ${missing} 파일없음`);
if (fail === 0 && missing === 0) console.log('🎉 모든 버전 표기가 파일 내용과 일치 — immutable 캐시 안전.');
process.exit(fail === 0 && missing === 0 ? 0 : 1);
