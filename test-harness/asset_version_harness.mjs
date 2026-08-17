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
/* 🛡️ (2026-07-30) 해시 전에 줄바꿈을 LF 로 정규화한다.
   raw 바이트로 해싱했더니 **작업트리의 checkout 방식(CRLF/LF)만 달라도 전부 불일치**했다.
   실제로 한 사람이 새 트리(LF)에서 ?v= 를 올려 manifest 를 기록하자, CRLF 로 받아둔
   다른 트리에서 14건이 전부 ❌ 로 떠서 배포 게이트가 막혔다. git blob 은 동일한데도 그렇다.
   이 가드가 막아야 하는 건 '내용이 바뀌었는데 ?v= 를 안 올린 것'이지 줄바꿈 표기가 아니다.
   ?v= 를 억지로 올려 넘기면 반대쪽 트리가 깨져 핑퐁이 되므로, 여기서 정규화한다. */
const sha = (buf) => createHash('sha256')
  .update(Buffer.from(buf).toString('binary').replace(/\r\n/g, '\n'), 'binary')
  .digest('hex').slice(0, 16);

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

/* 🔀 (2026-08-17) 원장은 **주소 순으로 정렬해서** 저장한다.
   왜 —
     JSON.stringify 는 «넣은 순서» 를 그대로 유지한다. 그래서 새 항목이 누가 무엇을
     올리든 **언제나 파일의 마지막 줄에** 붙었다. 병렬 PR 이 둘 있으면 git 이 보기에는
     «둘이 같은 마지막 줄을 서로 다르게 고쳤다» 가 되어, 내용은 아무 관계도 없는
     css 항목과 js 항목이 자리만 겹쳐서 충돌했다.
     2026-08-17 에 PR 하나 병합하는 동안 이 파일 때문에 **네 번** 충돌했다
     (/js/adm-core.js v94~97 대 /css/admin-inline-c.css v23~24).
   정렬하면 —
     /css/… 와 /js/… 가 파일에서 100행 넘게 떨어진 자리에 각각 들어가서
     git 의 평범한 3-way 병합이 그냥 성공한다(실측: 충돌 0). 내 컴퓨터·GitHub·CI
     어디서나 똑같이 동작한다.
   ⛔ .gitattributes 의 merge=union 으로 풀지 말 것.
     union 은 양쪽 줄을 «글자 그대로» 이어 붙이는데 마지막 줄에는 쉼표가 없어서
     **깨진 JSON** 이 된다. 게다가 git 이 충돌이라고 말하지 않고 «병합 성공» 으로
     조용히 넘어가므로 그대로 커밋된다(실측으로 확인 — 구조상 매번 반드시 그렇다).
   ⚠️ 순서는 의미를 갖지 않는다 — 원장은 «주소로 찾아보는 목록» 이다.
      정렬 전후로 항목 663개·해시 변경 0건을 확인했다.
   ⚠️ 여전히 충돌하는 경우가 하나 있고, 그건 **없애면 안 되는** 충돌이다 —
      두 사람이 «같은 파일» 의 버전을 동시에 올리면 두 줄이 나란히 붙어 충돌한다.
      그때는 정말로 사람이 봐야 한다(자동으로 합치면 한쪽 수정이 조용히 묻힌다). */
if (added > 0 || UPDATE) {
  const sorted = {};
  for (const k of Object.keys(manifest).sort()) sorted[k] = manifest[k];
  writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

console.log('\n════════ 정적자산 버전 가드 (?v= 누락 방지) ════════');
console.log(`  검사 대상: 버전 붙은 js/css 참조 ${refs.size}건 (HTML ${htmlFiles.length}개)`);
if (added) console.log(`  🆕 새 버전 ${added}건 기록 (정상 — 버전을 올렸거나 최초 실행)`);
if (failures.length) console.log(failures.join('\n'));
console.log('──────────────────────────────────────────');
console.log(`총 ${pass + fail + missing}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패 / ⚠️ ${missing} 파일없음`);
if (fail === 0 && missing === 0) console.log('🎉 모든 버전 표기가 파일 내용과 일치 — immutable 캐시 안전.');
process.exit(fail === 0 && missing === 0 ? 0 : 1);
