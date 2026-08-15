// corpcard_category_harness.mjs — 💳 법인카드 자동 분류 규칙 가드 (2026-08-15)
//
//   [배경] 바로빌 실데이터 236건이 들어오고 나서야 분류 구멍이 보였다.
//   「기타」가 전체의 69%였고, 그 안에 성격이 완전히 다른 것들이 섞여 있었다:
//       편의점 26건 · 정비/세차 ₩695,000 · 모텔 8건 ₩440,000 ·
//       ANTHROPIC CLAUDE ₩107,085 · GOOGLE ₩192,693 · 네이버 ₩36,300
//
//   [이 하니스가 지키는 것 — 규칙 «순서» 가 곧 우선순위라 조용히 뒤집히기 쉽다]
//     ① 「네이버 광고」가 장비로 새지 않는다 (마케팅이 장비보다 위)
//     ② 네이버·구글·AI 구독은 «장비·소프트웨어» (2026-08-15 오후 지시로 통신 → 장비)
//     ③ 업태(StoreBizType)만 있어도 분류된다 — 가맹점명이 부실한 카드가 많다
//     ④ 숙박이 식대·교통에 먹히지 않는다
//
//   규칙을 손볼 때 이 파일이 빨간불이면, «순서» 를 바꿨는지부터 보면 된다.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const M = await import('file://' + resolve(__dir, '../cloudflare-deploy/src/corpcard-sync.ts').replace(/\\/g, '/'));

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; console.log(`  ✅ ${name} → ${want}`); }
  else { fail++; console.log(`  ❌ ${name} → 기대 ${want} / 실제 ${got}`); }
}
// categorize(가맹점명, 업태)
const cat = (merchant, biz = '') => M.categorize(merchant, biz);

console.log('════════ 💳 법인카드 자동 분류 가드 ════════');

/* ── ① 우선순위 — 넓은 규칙이 좁은 규칙을 잡아먹으면 안 된다 ─────────────── */
console.log('  ── 우선순위(순서가 뒤집히면 여기서 걸린다)');
eq('네이버 광고', cat('네이버 광고', ''), '마케팅');
eq('네이버(구독)', cat('네이버', ''), '장비');
eq('구글 클라우드', cat('구글 클라우드', ''), '장비');
eq('GOOGLE*GOOGLE DIGITAL', cat('GOOGLE*GOOGLE DIGITAL', ''), '장비');
eq('카카오모먼트(광고)', cat('카카오모먼트', ''), '마케팅');

/* ── ② 원장님 지시(2026-08-15, 오후 수정) — 온라인 구독은 «장비·소프트웨어» ──
      같은 날 오전엔 통신비였다가 뒤집혔다. 통신은 통신사 회선요금만 남긴다. */
console.log('  ── 온라인 구독/AI → 장비');
eq('ANTHROPIC* CLAUDE TEAM', cat('ANTHROPIC* CLAUDE TEAM', ''), '장비');
eq('Google Digital Inc.', cat('Google Digital Inc.', ''), '장비');
eq('OPENAI CHATGPT', cat('OPENAI CHATGPT', ''), '장비');
eq('SKT 통신요금', cat('SKT 통신요금', ''), '통신');
eq('LG U+ 인터넷', cat('LG U+ 인터넷', ''), '통신');

/* ── ③ 숙박 신설 — 식대·교통에 먹히지 않아야 한다 ──────────────────────── */
console.log('  ── 숙박');
eq('노바모텔', cat('노바모텔', ''), '숙박');
eq('업태만: 모텔,여관,기타숙박', cat('', '모텔,여관,기타숙박'), '숙박');
eq('호텔', cat('OO호텔', ''), '숙박');

/* ── ④ 업태만으로도 분류된다 (가맹점명이 부실한 경우가 많다) ────────────── */
console.log('  ── 업태(StoreBizType)만 있을 때');
eq('업태: 편의점', cat('GS25 어딘가', '편의점'), '식대');
eq('업태: 커피전문점', cat('빽다방 청주복대대농점', '커피전문점'), '식대');
eq('업태: 한식', cat('푸드스토리온기', '한식'), '식대');
eq('업태: 식품잡화', cat('', '식품잡화'), '식대');
eq('업태: 할인점/슈퍼마켓', cat('', '할인점/슈퍼마켓'), '식대');
eq('업태: 정비,세차장,자동차SVC', cat('', '정비,세차장,자동차SVC'), '교통');

/* ── ⑤ 분류할 수 없는 것은 «기타» 로 남는다 (억지로 넣지 않는다) ─────────── */
console.log('  ── 판단 불가 → 기타');
eq('결제대행(PG) — 실제 판매처를 알 수 없다', cat('대표(일반)', '결제대행(PG)'), '기타');
eq('빈 값', cat('', ''), '기타');
eq('업태: 기타4', cat('', '기타4'), '기타');

console.log('──────────────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
process.exit(fail ? 1 : 0);
