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
  half: '반반',
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

console.log(`\n  ${fail ? '❌' : '🎉'} ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
