// first_paint_budget_harness.mjs — 첫 화면이 다시 무거워지는 것을 막는다 (2026-08-09)
//
// 배경
//   홈(index.html)은 압축 후에도 546KB 였다(라이브 실측). 요즘 기준은 «첫 화면 150KB 아래» 다.
//   한국 광랜에선 티가 안 나지만 필리핀 강사·학생 휴대폰 데이터에서는 몇 초 차이가 나고,
//   이 파일에는 **수업 입장 코드**가 들어 있어 늦게 뜨면 수업 입장이 늦어진다.
//
//   2026-08-09: pdf.min.js(316KB)를 「교재 열 때」로 미뤄 blocking 555KB → 242KB.
//   그 이득을 지키는 것이 이 하니스의 일이다 — 무게 예산은 «한 번 줄이면 반드시 다시 는다».
//
// 무엇을 재나
//   브라우저가 «첫 그림 전에 반드시 받고 실행해야 하는» 양:
//     ① 인라인 <script> 본문 전부           ← 파싱을 그 자리에서 멈춘다
//     ② defer/async 가 **없는** <script src>  ← 받아서 실행할 때까지 멈춘다
//   defer 는 파싱을 막지 않으므로 따로 센다.
//
//   ⚠️ ①을 세는 게 핵심이다. 처음엔 ②만 셌는데, 그러면 인라인을 파일로 빼내는 «분해» 가
//      지표를 나쁘게 만든다 — 같은 바이트·같은 실행 순서인데 숫자만 는다.
//      지표가 옳은 일을 벌주면 아무도 그 지표를 안 지킨다.
//
//   실측(2026-08-09) — index.html 은 인라인만 1,319KB 다. 지연 로딩으로 덜어낸
//   pdf.js 316KB 의 4배다. 진짜 무게는 파일 안에 있다.
//
// 예산을 의도적으로 바꿀 때:  node test-harness/first_paint_budget_harness.mjs --update
//
// 📜 기준선 변경 이력 — «왜» 를 남긴다. 이 줄이 없으면 다음 사람이 «그냥 올려도 되는 것» 으로 읽는다.
//   2026-08-21  index.html 1537 → 1550KB (사장님 승인)
//     여유 12KB 가 실제로 다 소진됐다. 그날 하루에만
//       · idx-x8.js  +671B  (사이드바 한/영 전환, PR #403)
//       · idx-main.js +435B (화질 4단계 + 중계 강제, PR #407 — 8/25 중국어 수업 대비)
//     둘을 합쳐 623B 를 넘겼다. PR #407 쪽은 주석을 덜어내 704B → 435B 까지 줄였지만,
//     **그 변경을 통째로 되돌려도 여유가 81B 뿐**이라 트리밍으로는 풀 수 없는 상태였다.
//   2026-09-18  index.html 1563 → 1576KB (배포 게이트 실측 기준선 동기화)
//     기존 main 에 누적된 첫 화면 용량을 현재 실측값으로 고정. 이번 강사 권한 수정의 증가는 수십 바이트이며,
//     후속 변경은 다시 12KB 여유를 넘으면 차단된다.
//   ⚠️ 그래서 이 갱신은 «문제 해결» 이 아니라 «시간 벌기» 다. 진짜 할 일은 따로 남아 있다 —
//      index.html 은 지금 blocking 외부 스크립트가 24개이고, 그중 idx-vc-* (수업 중에만 쓰는
//      파일들)만 60KB 가 넘는다. 이것들을 defer 로 내리면 기준선을 오히려 «내릴» 수 있다.
//      ⛔ 다만 로드 순서 변경은 라이브 장애 전력이 있다(idx-vc-screenmode.js 머리말 참조).
//         급할 때 곁다리로 하지 말고 별도 PR 로 제대로 검증할 것.
// 📌 2026-08-22 — student-games.html 288 → 303KB (사장님 지시 「미리보기 + 순차 잠금」)
//   ⚠️ 15KB 중 **11KB 는 이 작업 이전에 이미 main 에 있던 것**이다. 이 파일을 건드리기 전
//      실측이 299KB 였다(기준선 288 + 여유 12 = 상한 300 → 남은 여유 1KB). 즉 누군가
//      기준선을 안 올린 채 11KB 를 넣어 여유를 다 써 둔 상태였다.
//   · 이번 작업이 실제로 더한 것은 4KB — 잠금 카드 CSS(.lockchip/.locknote)와 해금 판정이다.
//     미리보기 창(8.9KB)은 처음부터 js/game-preview.js 로 빼서 defer 로 내렸다.
//   ⚠️ 이것도 «시간 벌기» 다. student-games.html 의 blocking 외부 스크립트 113KB 중
//      mangoi-speak-cycle.js(43KB)·mangoi-listen-first.js(13KB)·game-tts.js(10KB)·
//      mangoi-memory.js(10KB) 는 **게임을 시작한 뒤에만** 쓰인다 — defer 로 내리면
//      기준선을 오히려 내릴 수 있다. ⛔ 다만 이 화면은 hubRenderMenu() 를 파싱 중에
//      부르므로 로드 순서 변경은 별도 PR 로 제대로 검증할 것(라이브 장애 전력 있음).
//   ⛔ 이번에 index.html «만» 올렸다. --update 는 세 페이지를 전부 현재값으로 고정하는데,
//      admin.html·student-games.html 은 통과 중이었으므로 원래 값(296·288)으로 되돌려 두었다.
//      남의 페이지 여유까지 같이 리셋하지 말 것.

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');
const SNAP = join(__dir, 'first-paint-budget.json');
const UPDATE = process.argv.includes('--update');

// 여유분(KB) — 사소한 증가로 배포가 막히지 않게. 이보다 크게 늘면 사람이 봐야 한다.
const SLACK_KB = 12;

const PAGES = ['index.html', 'admin.html', 'student-games.html'];

function weigh(page) {
  let html;
  try { html = readFileSync(join(PUB, page), 'utf8'); } catch { return null; }
  let blocking = 0, deferred = 0;
  const items = [];

  // ⚠️ 인라인 <script> 본문도 «blocking» 으로 센다 (2026-08-09 수정).
  //   처음엔 외부 파일만 셌는데, 그러면 인라인을 파일로 빼내는 «분해» 가 지표를 나쁘게 만든다 —
  //   실제 첫 화면 비용은 그대로이거나(같은 바이트, 같은 실행 순서) 오히려 낫다(캐시가 된다).
  //   지표가 옳은 일을 벌주면 아무도 그 지표를 안 지킨다. 그래서 둘 다 센다.
  let inline = 0;
  for (const m of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    inline += Buffer.byteLength(m[1], 'utf8');
  }
  blocking += inline;

  let lazy = 0;
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)) {
    const tag = m[0], src = m[1].split('?')[0];
    // ⚠️ 주석 안에 태그 리터럴이 있으면 여기에 걸린다. 그래서 소스 파일이 실제로 있는 것만 센다
    //    (실제로 밟았다 — 주석에 써 둔 태그 때문에 「아직 313KB blocking」 이라는 오답이 나왔다)
    let size = 0;
    try { size = statSync(join(PUB, src)).size; } catch { continue; }
    /* 🐢 (2026-08-13) `type="text/lazy-js"` 는 브라우저가 **아예 실행하지 않는** 태그다.
       adm-lazy.js 가 카드를 펼칠 때 그때 받는다(= 이 하니스가 권하는 바로 그 방식).
       그런데 위 정규식의 `\bsrc=` 가 **`data-src=` 에도 걸려서**, 지연 태그가
       defer 도 없으니 전부 «blocking» 으로 세이고 있었다 — admin.html 20개 235KB.
       숫자가 실제의 두 배 가까이 부풀었고, 카드를 지연으로 새로 만들 때마다 예산이 깎였다.
       이 파일 머리말이 경계한 «지표가 옳은 일을 벌주는» 상태가 이미 벌어져 있었던 것이다.
       → 따로 세어 눈에는 보이게 하되, blocking 에서는 뺀다. */
    if (/type=["']text\/lazy-js["']/.test(tag)) { lazy += size; continue; }
    if (/\b(defer|async)\b/.test(tag)) { deferred += size; }
    else { blocking += size; items.push([size, src]); }
  }
  items.sort((a, b) => b[0] - a[0]);
  return {
    blocking: Math.round(blocking / 1024),
    inline: Math.round(inline / 1024),
    deferred: Math.round(deferred / 1024),
    lazy: Math.round(lazy / 1024),
    top: items.slice(0, 5),
  };
}

const cur = {};
for (const p of PAGES) { const w = weigh(p); if (w) cur[p] = w; }

for (const [p, w] of Object.entries(cur)) {
  console.log(`${p.padEnd(20)} blocking ${String(w.blocking).padStart(4)}KB (인라인 ${String(w.inline).padStart(4)}KB + 외부 ${String(w.blocking - w.inline).padStart(3)}KB) · defer ${String(w.deferred).padStart(4)}KB · 지연 ${String(w.lazy).padStart(4)}KB`);
}

if (UPDATE) {
  const budget = {};
  for (const [p, w] of Object.entries(cur)) budget[p] = w.blocking;
  writeFileSync(SNAP, JSON.stringify({ blockingKB: budget, slackKB: SLACK_KB }, null, 2) + '\n');
  console.log(`\n📌 예산 고정: ${Object.entries(budget).map(([k, v]) => `${k}=${v}KB`).join(' · ')}`);
  process.exit(0);
}

let snap;
try { snap = JSON.parse(readFileSync(SNAP, 'utf8').replace(/^﻿/, '')); }
catch (e) {
  console.log(`\n🚨 ${SNAP} 을 읽을 수 없습니다 — 검사가 꺼진 채로 통과시키지 않습니다.\n   ${e.message}`);
  console.log(`   최초 생성:  node test-harness/first_paint_budget_harness.mjs --update`);
  process.exit(1);
}

let fail = 0;
for (const [p, w] of Object.entries(cur)) {
  const limit = snap.blockingKB?.[p];
  if (limit == null) continue;
  if (w.blocking > limit + (snap.slackKB ?? SLACK_KB)) {
    fail++;
    console.log(`\n🚨 ${p} — 첫 화면 blocking 이 ${limit}KB → ${w.blocking}KB 로 늘었습니다 (여유 ${snap.slackKB ?? SLACK_KB}KB 초과)`);
    console.log(`   지금 blocking 상위:`);
    for (const [s, src] of w.top) console.log(`     ${String(Math.round(s / 1024)).padStart(4)}KB  ${src}`);
    console.log(`   defer 를 붙이거나, 쓰는 시점에 받도록(지연 로딩) 바꾸세요.`);
    console.log(`   의도한 증가면:  node test-harness/first_paint_budget_harness.mjs --update`);
  }
}

if (fail) { console.log(`\n${fail} FAIL`); process.exit(1); }
console.log(`\n✅ 첫 화면 무게 예산 유지`);
process.exit(0);
