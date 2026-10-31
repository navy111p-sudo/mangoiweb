// vc_sizebar_labels_harness.mjs — 크기바와 하단 독 시트의 «이름이 갈리는 것» 을 막는다 (2026-08-25)
//
// 배경
//   화상수업의 얼굴 크기는 **두 곳**에서 고를 수 있다.
//     ① 얼굴 영역 위 크기바 — index.html 의 .vsb-seg (그림 4칸)
//     ② 하단 독 [화면공유] → 「화면 분할」 시트 — js/idx-main.js 의 VC_FOLDERS.screen
//   같은 vcSetVideoSize/vcScreenSet 를 부르는데 **이름을 각자 적는다.**
//   실제로 오래 갈려 있었다 — 바는 '1/4·1/2·3/4·전체', 시트는 '1/4 화면…참가자 전체 보기'.
//   그래서 「전체가 무엇의 전체냐」를 강사가 못 알아봤고(2026-07-30 Kaye 18번), 시트에서만
//   이름을 고쳐도 바는 그대로였다.
//
//   ⚠️ 여기에 toast 까지 «세 번째» 로 같은 말을 적는다(vcScreenSet 의 labels).
//      세 곳이 한 벌이어야 「눌렀더니 딴 이름이 뜬다」가 안 생긴다.
//
// 🔴 이름이 «겹치는데 동작이 다른» 것도 막는다
//   · 시트 '솔로'(vcScreenSet('solo')) = video-solo → **얼굴 영역이 통째로 사라지고 교재만**
//   · 바 ⋯ 메뉴 '솔로'(vcToggleSolo)   = **다른 참가자만 숨기고 내 얼굴은 남김**
//   반대 동작인데 이름이 같아 오래 헷갈렸다 → 2026-08-25 에 각각
//   「영상 끄고 교재만」·「내 얼굴만」 으로 갈랐다. 다시 붙지 않게 못 박는다.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');
const html = readFileSync(join(PUB, 'index.html'), 'utf8');
const main = readFileSync(join(PUB, 'js/idx-main.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
};

/* 네 크기의 «정본» 이름. 세 곳이 이것과 같아야 한다. */
const CANON = {
  quarter: '교재 크게',
  half: '기본',
  threequarter: '얼굴 크게',
  full: '모두 보기',
};

/* ── ① 크기바(index.html) — <span class="vsb-t" data-ko="…"> ── */
const barBlock = html.slice(html.indexOf('id="vc-size-bar"'), html.indexOf('id="vc-size-bar"') + 12000);
for (const [size, want] of Object.entries(CANON)) {
  const segRe = new RegExp(`data-size="${size}"[\\s\\S]{0,1600}?<span class="vsb-t" data-ko="([^"]+)"`);
  const m = barBlock.match(segRe);
  ok(`크기바 ${size} 라벨 = «${want}»`, !!m && m[1] === want, m ? `실제 «${m[1]}»` : '칸을 못 찾음');
}

/* ── ② 하단 독 시트(idx-main.js VC_FOLDERS.screen) ── */
for (const [size, want] of Object.entries(CANON)) {
  const re = new RegExp(`label:'([^']+)'[^}]*vcScreenSet\\('${size}'\\)`);
  const m = main.match(re);
  ok(`독 시트 ${size} 라벨이 «${want}» 로 시작`, !!m && m[1].startsWith(want), m ? `실제 «${m[1]}»` : '항목을 못 찾음');
}

/* ── ③ 전환 토스트(vcScreenSet 의 labels) ── */
const toast = main.match(/const labels = \{([^}]+)\}/);
ok('vcScreenSet 에 toast labels 가 있다', !!toast);
if (toast) {
  for (const [size, want] of Object.entries(CANON)) {
    const m = toast[1].match(new RegExp(`\\b${size}:'([^']+)'`));
    ok(`토스트 ${size} = «${want}»`, !!m && m[1] === want, m ? `실제 «${m[1]}»` : '없음');
  }
}

/* ── ④ «겹치는데 동작이 다른» 이름이 되살아나지 않게 ── */
const soloSheet = main.match(/label:'([^']+)'[^}]*vcScreenSet\('solo'\)/);
ok('독 시트의 solo 를 «솔로» 라고 부르지 않는다 (얼굴이 통째로 사라지는 모드다)',
   !!soloSheet && !/솔로/.test(soloSheet[1]), soloSheet ? `실제 «${soloSheet[1]}»` : '항목 없음');

const soloBar = html.match(/id="vc-solo-btn"[^>]*data-ko="([^"]+)"/);
ok('크기바 ⋯ 메뉴의 vcToggleSolo 도 «솔로» 라고 부르지 않는다',
   !!soloBar && !/솔로/.test(soloBar[1]), soloBar ? `실제 «${soloBar[1]}»` : '버튼 없음');
ok('그 둘의 이름이 서로 다르다 (반대 동작이므로)',
   !!soloSheet && !!soloBar && soloSheet[1].split(' (')[0] !== soloBar[1].replace(/^\S+\s*/, ''),
   soloSheet && soloBar ? `시트 «${soloSheet[1]}» / 바 «${soloBar[1]}»` : '');

/* ── ⑤ 그림 4칸이 아이콘 버튼인 채로 남아 있어야 한다 ──
   ⛔ 아이콘 버튼에 data-ko/data-en 을 달면 i18n 엔진이 textContent 를 통째로 갈아치워
      34px 짜리 버튼 안에 문장이 들어앉는다(CLAUDE.md 2장). 설명은 title/aria 로만. */
for (const size of Object.keys(CANON)) {
  const seg = barBlock.match(new RegExp(`<button[^>]*data-size="${size}"[^>]*>`));
  ok(`크기바 ${size} 버튼에 data-ko/data-en 이 직접 붙어 있지 않다`,
     !!seg && !/\sdata-ko="/.test(seg[0]) && !/\sdata-en="/.test(seg[0]),
     seg ? seg[0].slice(0, 120) : '버튼 없음');
}

/* ── ⑥ 기존 코드가 쓰는 셀렉터가 살아 있어야 한다 ──
   idx-main.js 6곳이 `.video-size-bar button[onclick*="half"]` 로 버튼을 찾고,
   자유 크기 모드의 «제목줄 드래그» 도 .video-size-bar 다. 이름을 바꾸면 조용히 죽는다. */
ok('바가 class="video-size-bar" 를 유지한다', /class="video-size-bar vsb2"/.test(html));
for (const s of ['quarter', 'half', 'threequarter', 'full']) {
  ok(`onclick 에 vcSetVideoSize('${s}' 문자열이 남아 있다`,
     html.includes(`vcSetVideoSize('${s}', this)`));
}

/* ── ④ 그림이 «실제 화면» 과 같은 말을 하는가 (2026-08-28) ──────────────────
   🔴 사고: 2026-07-28 에 배치를 「교재 왼쪽 / 얼굴 오른쪽」 으로 뒤집었는데(order),
      그것을 설명하는 이 그림 4칸이 안 딸려가 **넉 달 가까이 좌우가 반대** 였다.
      비율도 이름이 약속하는 25/50/75 로 그려져 실제 CSS(18/27/45%)와 달랐다.
      에러가 안 나고 라벨 검사(①~③)도 전부 통과해서 아무도 못 봤다.
   ✅ 그래서 «글자가 있는가» 가 아니라 **«CSS 와 그림이 서로 같은 말을 하는가»** 로 검사한다
      (CLAUDE.md 2장 「여러 곳이 서로 같은 말을 하는가」). CSS 폭을 바꾸면 여기가 FAIL 나서
      그림도 함께 고치게 된다. */
const cssPct = {};
for (const size of ['quarter', 'half', 'threequarter']) {
  const m = html.match(new RegExp(`#vc-main-row\\.video-${size}\\s*>\\s*#vc-video-pane\\s*\\{[^}]*?clamp\\([^,]+,\\s*([\\d.]+)%`));
  ok(`CSS 에서 ${size} 얼굴 폭(%)을 읽었다`, !!m, m ? `${m[1]}%` : '규칙을 못 찾음');
  if (m) cssPct[size] = parseFloat(m[1]);
}

/** 한 칸의 <svg> 에서 rect·circle 을 뽑는다 */
function iconOf(size) {
  const seg = barBlock.match(new RegExp(`data-size="${size}"[\\s\\S]{0,1600}?(<svg[\\s\\S]*?</svg>)`));
  if (!seg) return null;
  const svg = seg[1];
  const rects = [...svg.matchAll(/<rect\b[^>]*>/g)].map(t => ({
    x: parseFloat((t[0].match(/\bx="([^"]+)"/) || [0, 'NaN'])[1]),
    w: parseFloat((t[0].match(/\bwidth="([^"]+)"/) || [0, 'NaN'])[1]),
    filled: /fill="currentColor"/.test(t[0]),
  }));
  const heads = [...svg.matchAll(/<circle\b[^>]*>/g)].map(t => ({
    cx: parseFloat((t[0].match(/\bcx="([^"]+)"/) || [0, 'NaN'])[1]),
  }));
  return { rects, heads };
}

for (const size of ['quarter', 'half', 'threequarter']) {
  const ic = iconOf(size);
  if (!ic || ic.rects.length !== 2) { ok(`${size} 그림에서 두 칸을 읽었다`, false, ic ? `rect ${ic.rects.length}개` : '<svg> 를 못 찾음'); continue; }
  const face = ic.rects.find(r => r.filled);
  const board = ic.rects.find(r => !r.filled);
  if (!face || !board) { ok(`${size} 그림에 «채운 칸(얼굴)» 과 «빈 칸(칠판)» 이 하나씩 있다`, false); continue; }

  /* 4-1. 방향 — 실제 화면이 「교재 왼쪽 / 얼굴 오른쪽」 이므로 채운 칸이 오른쪽이어야 한다 */
  ok(`${size} — 얼굴 칸이 «오른쪽» 에 있다`, face.x > board.x,
     `얼굴 x=${face.x} / 칠판 x=${board.x}`);

  /* 4-2. 비율 — CSS 값과 ±1.5%p 안 */
  const ratio = (face.w / (face.w + board.w)) * 100;
  const want = cssPct[size];
  ok(`${size} — 그림 비율 ${ratio.toFixed(1)}% 가 CSS ${want}% 와 맞는다`,
     want != null && Math.abs(ratio - want) <= 1.5, `차이 ${want != null ? (ratio - want).toFixed(1) : '?'}%p`);

  /* 4-3. 사람 — 얼굴 칸 안에 머리가 있어야 «어느 칸이 얼굴인지» 글자 없이 안다.
     ⛔ 라벨은 KO/EN 뿐이라 중국인 강사는 못 읽는다(CLAUDE.md 2장). 지우지 말 것. */
  ok(`${size} — 얼굴 칸 안에 사람(머리)이 있다`,
     ic.heads.some(h => h.cx >= face.x && h.cx <= face.x + face.w),
     `머리 ${ic.heads.length}개 / 얼굴 칸 ${face.x}~${(face.x + face.w).toFixed(2)}`);
}

/* 4-4. 「모두 보기」는 네 칸 전부가 얼굴이므로 머리도 넷 */
const full = iconOf('full');
ok('모두 보기 — 네 칸에 각각 사람이 있다',
   !!full && full.rects.length === 4 && full.heads.length === 4,
   full ? `rect ${full.rects.length} / 머리 ${full.heads.length}` : '<svg> 를 못 찾음');


console.log(`\n  ${fail ? '❌' : '🎉'} ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
