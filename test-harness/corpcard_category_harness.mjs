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
eq('네이버(구독)', cat('네이버', ''), '구독');
eq('구글 클라우드', cat('구글 클라우드', ''), '구독');
eq('GOOGLE*GOOGLE DIGITAL', cat('GOOGLE*GOOGLE DIGITAL', ''), '구독');
eq('카카오모먼트(광고)', cat('카카오모먼트', ''), '마케팅');

/* ── ② 구독 vs 장비 — «결제를 멈추면 못 쓰나» 로 가른다 (2026-08-15 원장님 확정) ──
      오전: 통신 → 오후: 장비 → 최종: 구독을 장비에서 분리.
      통신에는 통신사 회선요금만 남는다. */
console.log('  ── ☁️ 구독(끊으면 못 씀) vs 💻 장비(물건이 남음) vs 📞 통신(회선)');
eq('ANTHROPIC* CLAUDE TEAM', cat('ANTHROPIC* CLAUDE TEAM', ''), '구독');
eq('Google Digital Inc.', cat('Google Digital Inc.', ''), '구독');
eq('OPENAI CHATGPT', cat('OPENAI CHATGPT', ''), '구독');
eq('Adobe 구독', cat('ADOBE CREATIVE CLOUD', ''), '구독');
eq('MS 365(구독)', cat('MS 365', ''), '구독');
eq('Microsoft*Store(구매)', cat('Microsoft*Store', ''), '장비');
eq('노트북 구매', cat('OO컴퓨터 노트북', ''), '장비');
eq('SKT 통신요금', cat('SKT 통신요금', ''), '통신');
eq('LG U+ 인터넷', cat('LG U+ 인터넷', ''), '통신');

/* ── ②-b 🌐 해외 판정 — 카테고리가 아니라 «표시». 부가세 매입세액 공제 판단용 ──
      ⛔ 모르면 끈다(false). 「영문이면 해외」로 넘겨짚지 않는다 — GS25·CU 도 영문이다. */
console.log('  ── 🌐 해외 판정 (부가세 불공제 표시)');
const ov = (m) => M.isOverseas(m);
eq('GOOGLE*GOOGLE DIGITAL', ov('GOOGLE*GOOGLE DIGITAL'), true);
eq('ANTHROPIC* CLAUDE TEAM', ov('ANTHROPIC* CLAUDE TEAM'), true);
eq('네이버(국내)', ov('네이버'), false);
eq('빽다방(국내)', ov('빽다방 청주복대대농점'), false);
eq('GS25(영문이지만 국내)', ov('GS25 어딘가'), false);
eq('빈 값', ov(''), false);

/* ── ②-c ⚠️ 기업업무추진비(접대비) 확인 표시 — 3만원 초과 식대만 ──────────
      ⛔ 카테고리를 바꾸지 않는다. 표시만 하고 판단은 사람이 한다. */
console.log('  ── ⚠️ 접대비 확인 표시 (건당 3만원 초과 식대)');
const ent = (c, a) => M.needsEntertainCheck(c, a);
eq('식대 ₩50,000', ent('식대', 50000), true);
eq('식대 ₩30,000(경계 — 초과 아님)', ent('식대', 30000), false);
eq('식대 ₩8,000', ent('식대', 8000), false);
eq('교통 ₩50,000(식대 아님)', ent('교통', 50000), false);

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

/* ── ⑤ 업태가 «틀리게» 올 때 — 가맹점명이 이겨야 한다 ────────────────────
      카드사가 보내는 업태는 신뢰할 수 없다. 실제로 두 건이 장비로 샜다. */
console.log('  ── 업태 오태깅 방어');
// 하이패스 자동충전인데 업태가 「컴퓨터 소프트웨어」로 온다 (5건 ₩170,000)
eq('에스엠하이플러스(하이패스 충전)', cat('에스엠하이플러스 (주)', '컴퓨터  소프트웨어'), '교통');
// 등기수수료인데 업태가 「전자상거래(다품목취급)」 — 「전자」로 장비에 걸리면 안 된다
eq('법원행정처(등기수수료)', cat('법원행정처', '전자상거래(다품목취급)'), '기타');
// 진짜 전자제품 매장은 여전히 장비
eq('하이마트(전자제품)', cat('롯데하이마트', '전자제품'), '장비');

/* ── ⑤ 분류할 수 없는 것은 «기타» 로 남는다 (억지로 넣지 않는다) ─────────── */
console.log('  ── 판단 불가 → 기타');
eq('결제대행(PG) — 실제 판매처를 알 수 없다', cat('대표(일반)', '결제대행(PG)'), '기타');
eq('빈 값', cat('', ''), '기타');
eq('업태: 기타4', cat('', '기타4'), '기타');

console.log('──────────────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
process.exit(fail ? 1 : 0);
