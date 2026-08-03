/**
 * speak_cycle_harness.mjs — 「말하기 선순환」 배선 게이트 (2026-08-04)
 *
 * 왜 필요한가
 * ─────────────────────────────────────────────────────────────
 * 이 배선은 **눈에 안 띄게 끊긴다.** 화면은 멀쩡히 돌아가고 점수도 나오는데,
 * 서버에 기록만 안 남는다. 그러면 이런 일이 조용히 벌어진다:
 *   · 학생이 기기를 바꾸면(태블릿 → 폰) 그동안의 발음 기록이 사라진다
 *   · 교사 화면에 학생별 발음 향상이 안 보인다
 *   · 다른 게임이 "어제 막힌 문장"을 받아오지 못해 선순환이 끊긴다
 * 실제로 2026-08-04 이전까지 게임 15종이 **한 건도 안 보내고 있었고**, 아무도 몰랐다.
 * 사람 눈으로는 못 잡는 종류의 결함이라 게이트로 막는다.
 *
 * 검사 항목
 *   ① 점수를 실어 MangoiMemory.log 를 부르는 화면은 서버 적립 경로가 있어야 한다
 *      (mangoi-shadow-sync.js 를 싣거나, 자체 /api/games/shadow 전송이 있거나)
 *   ② mangoi-shadow-sync.js 는 반드시 mangoi-memory.js **뒤에** 실려야 한다
 *      (앞에 실리면 감쌀 대상이 없어 조용히 안 붙는다)
 *   ③ MangoiCycle 을 쓰는 화면은 그 의존 모듈을 다 실어야 한다
 *   ④ 이중 전송 금지 — shadow-sync 와 자체 전송을 같이 두려면 가드가 있어야 한다
 *      (없으면 pron_count 가 부풀어 교사 화면의 연습 횟수가 실제보다 많아 보인다)
 *
 * 실행: node test-harness/speak_cycle_harness.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');

/* ── public/**.html 수집 (이미지·폰트 폴더는 건너뜀) ── */
const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (/^(img|face-fx|media|fonts|lib|vendor)$/i.test(name)) continue;
      walk(p);
    } else if (/\.html$/i.test(name)) htmlFiles.push(p);
  }
})(PUB);

const rel = (p) => p.slice(PUB.length + 1).replace(/\\/g, '/');
const fails = [];
const notes = [];
let checked = 0;

for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8');
  const name = rel(file);

  // ── 이 화면이 점수를 실어 기억큐에 적립하는가 ──
  //    (게임들의 실제 형태: MangoiMemory.log({en:...}, ok, { tags, goodTags, score }) )
  const logsWithScore = /MangoiMemory\.log\([\s\S]{0,300}?score\s*:/.test(src);

  const hasSyncTag   = /<script[^>]+mangoi-shadow-sync\.js/.test(src);
  const hasMemoryTag = /<script[^>]+mangoi-memory\.js/.test(src);
  const hasCycleTag  = /<script[^>]+mangoi-speak-cycle\.js/.test(src);
  const usesCycle    = /MangoiCycle\.(run|warmWeak)\s*\(/.test(src);
  const selfPosts    = /['"]\/api\/games\/shadow['"]/.test(src);

  if (!logsWithScore && !usesCycle && !hasSyncTag && !hasCycleTag) continue;   // 말하기와 무관한 화면
  checked++;

  /* ① 점수를 적립하면서 서버로 보낼 길이 하나도 없다 = 기록이 이 기기에만 남는다 */
  if (logsWithScore && !hasSyncTag && !selfPosts && !usesCycle) {
    fails.push(`${name}\n      점수를 기억큐에 적립하는데 서버 적립 경로가 없습니다.\n` +
      `      → <script src="/js/mangoi-shadow-sync.js?v=1"></script> 를 mangoi-memory.js 다음에 추가하세요.\n` +
      `      (안 하면 기기를 바꿀 때 기록이 사라지고 교사 화면에도 안 남습니다)`);
  }

  /* ② shadow-sync 는 memory 뒤에 실려야 감쌀 수 있다 */
  if (hasSyncTag) {
    if (!hasMemoryTag) {
      fails.push(`${name}\n      mangoi-shadow-sync.js 는 실렸는데 mangoi-memory.js 가 없습니다 — 감쌀 대상이 없어 아무 일도 안 합니다.`);
    } else {
      const iMem = src.search(/<script[^>]+mangoi-memory\.js/);
      const iSyn = src.search(/<script[^>]+mangoi-shadow-sync\.js/);
      if (iSyn < iMem) {
        fails.push(`${name}\n      스크립트 순서가 거꾸로입니다: mangoi-shadow-sync.js 가 mangoi-memory.js 보다 먼저 실립니다.\n` +
          `      → 순서를 바꾸세요. 지금은 재시도 폴링으로 겨우 붙지만, 조용히 안 붙는 편이 더 위험합니다.`);
      }
    }
  }

  /* ③ MangoiCycle 을 쓰면 의존 모듈이 다 있어야 한다 */
  if (usesCycle) {
    if (!hasCycleTag) {
      fails.push(`${name}\n      MangoiCycle 을 부르는데 mangoi-speak-cycle.js 를 안 싣고 있습니다.`);
    }
    for (const dep of ['mangoi-speak-score.js', 'mangoi-stt.js', 'mangoi-voice-input.js']) {
      if (!new RegExp('<script[^>]+' + dep.replace('.', '\\.')).test(src)) {
        fails.push(`${name}\n      MangoiCycle 의 의존 모듈 ${dep} 가 없습니다.\n` +
          `      (없으면 4단이 채점을 못 하거나 미지원 브라우저에서 마이크를 아예 못 씁니다)`);
      }
    }
  }

  /* ④ 이중 전송 — 자동 후킹과 자체 전송이 같이 있으면 가드가 필요하다 */
  if (hasSyncTag && selfPosts) {
    const guarded = /MangoiShadow\.stats\(\)\.hooked/.test(src);
    if (!guarded) {
      fails.push(`${name}\n      mangoi-shadow-sync.js(자동 전송)와 자체 /api/games/shadow 전송이 같이 있는데 가드가 없습니다.\n` +
        `      → 자체 전송 앞에 다음 한 줄을 넣으세요:\n` +
        `        if(window.MangoiShadow && MangoiShadow.stats && MangoiShadow.stats().hooked) return;\n` +
        `      (없으면 같은 점수가 두 번 기록되어 교사 화면의 연습 횟수가 실제보다 많아 보입니다)`);
    }
  }

  if (hasSyncTag || usesCycle || selfPosts) {
    notes.push(`  · ${name}${usesCycle ? '  [4단 사이클]' : ''}${hasSyncTag ? '  [자동 적립]' : ''}${selfPosts ? '  [자체 전송]' : ''}`);
  }
}

/* ── 모듈 자체가 있는지도 본다 ── */
for (const m of ['js/mangoi-speak-cycle.js', 'js/mangoi-shadow-sync.js', 'js/mangoi-speak-score.js']) {
  try { statSync(join(PUB, m)); }
  catch { fails.push(`${m} 파일이 없습니다 — 말하기 선순환의 핵심 모듈입니다.`); }
}

console.log('════════ 🗣 말하기 선순환 배선 게이트 ════════');
console.log(`  검사 대상: 말하기 관련 화면 ${checked}개 (전체 HTML ${htmlFiles.length}개 중)`);
if (notes.length) {
  console.log('──────────────────────────────────────────');
  console.log('  배선된 화면:');
  notes.sort().forEach((n) => console.log(n));
}
console.log('──────────────────────────────────────────');
if (fails.length) {
  fails.forEach((f) => console.log(`  ❌ ${f}`));
  console.log(`\n  ${fails.length}건 실패 — 위 안내대로 고치세요.`);
  process.exit(1);
}
console.log('  ✅ 배선 이상 없음 — 발음 기록이 서버까지 이어지고, 이중 전송도 없습니다.');
console.log('══════════════════════════════════════════');
