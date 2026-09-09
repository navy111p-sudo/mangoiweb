// -*- coding: utf-8 -*-
// 💳 결제 상품 카탈로그 하니스 — 화면과 서버가 «같은 상품·같은 금액» 을 말하는가
//   실행:  node test-harness/pay_product_catalog_harness.mjs
//
//   [왜 필요한가 — CLAUDE.md 2장 「화면에서 골랐는데 그 값만 저장이 안 됨」]
//   서버는 «아는 값 목록»(src/api-pay.ts 의 PRICES)을 따로 들고 있고, 거기 없는 상품은
//   `unknown_program` 으로 **결제 자체가 거절**됩니다. 그런데 상품은 «네 곳» 에 적혀 있습니다:
//       ① src/api-pay.ts            PRICES            ← 금액 정본(위변조 방지의 근거)
//       ② public/index.html         .product-card     ← 홈 결제 카드
//       ③ public/js/idx-payment-modal.js  PROG_INFO / ADDON_CATALOG
//       ④ public/admin/send-pay-link.html <option>    ← 관리자 «결제 링크 보내기»
//   한 곳만 고치면 **에러가 안 나고** 「고를 수는 있는데 결제가 안 되는」·「화면 금액과
//   실제 청구액이 다른」 상태가 됩니다. 2026-09-09 «AI 콘텐츠 전용(1개월)» 을 넣으면서
//   네 곳을 함께 고쳤고, 다음 사람이 한 곳을 빠뜨리지 않도록 이 하니스를 둡니다.
//
//   [이 하니스가 지키는 것 — 목록을 «읽어서» 대조합니다(손으로 베껴 적지 않습니다)]
//     A. 네 목록을 소스에서 실제로 꺼냈다 (전제 — 못 꺼내면 FAIL)
//     B. 화면이 말하는 금액 == 서버가 청구하는 금액
//     C. ⛔ 서버가 모르는 상품을 화면이 팔지 않는다 (누르면 400 «결제 가능한 상품이 아닙니다»)
//     D. 관리자 결제링크 목록이 서버 가격표를 «빠짐없이» 담는다
//     E. 상품 키가 중복되지 않는다
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(resolve(__dir, '../cloudflare-deploy/' + p), 'utf8');
const API_PAY = R('src/api-pay.ts');
const MODAL   = R('public/js/idx-payment-modal.js');
const HOME    = R('public/index.html');
const ADMIN   = R('public/admin/send-pay-link.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

/* 선언된 «값» 을 그대로 꺼냅니다 — 파일에 그 글자가 있는지 세지 않습니다.
   (「자기가 새로 만든 상수를 잡아 통과」 함정을 피하는 방법입니다) */
function literalAfter(src, anchorRe, open, close) {
  const m = anchorRe.exec(src);
  if (!m) return null;
  let i = src.indexOf(open, m.index + m[0].length - 1);
  if (i < 0) return null;
  let depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; j++; } continue; }
    if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; j++; continue; }
    if (c === '/' && n === '*') { inBlock = true; j++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}
function evalLiteral(text) {
  try { return new Function(`return (${text});`)(); } catch (e) { return null; }
}

console.log('\n[ A. 전제 — 네 목록을 소스에서 실제로 꺼냈는가 ]');

const PRICES = evalLiteral(literalAfter(API_PAY, /const\s+PRICES\s*:[^=]*=\s*\{/, '{', '}') || '');
check('① 서버 가격표 PRICES (src/api-pay.ts)', !!PRICES && Object.keys(PRICES).length >= 10,
  PRICES ? `${Object.keys(PRICES).length}개` : '꺼내기 실패');

const PROG_INFO = evalLiteral(literalAfter(MODAL, /const\s+PROG_INFO\s*=\s*\{/, '{', '}') || '');
check('③-1 결제 모달 PROG_INFO (js/idx-payment-modal.js)', !!PROG_INFO && Object.keys(PROG_INFO).length >= 5,
  PROG_INFO ? `${Object.keys(PROG_INFO).length}개` : '꺼내기 실패');

const ADDONS = evalLiteral(literalAfter(MODAL, /const\s+ADDON_CATALOG\s*=\s*\[/, '[', ']') || '');
check('③-2 연장 추가옵션 ADDON_CATALOG', Array.isArray(ADDONS) && ADDONS.length >= 5,
  Array.isArray(ADDONS) ? `${ADDONS.length}개` : '꺼내기 실패');

// ④ 관리자 결제링크 <option value="키">이름 · 12,345원
const ADMIN_OPTS = [...ADMIN.matchAll(/<option value="([^"]+)">([^<·]*)·\s*([0-9,]+)\s*원<\/option>/g)]
  .map((m) => ({ key: m[1], name: m[2].trim(), amount: Number(m[3].replace(/,/g, '')) }));
check('④ 관리자 결제링크 상품 목록 (admin/send-pay-link.html)', ADMIN_OPTS.length >= 10, `${ADMIN_OPTS.length}개`);

// ② 홈 결제 카드 — data-program / data-price
const HOME_CARDS = [...HOME.matchAll(/<button class="product-card"[^>]*data-program="([^"]+)"[^>]*data-price="([0-9]+)"/g)]
  .map((m) => ({ key: m[1], amount: Number(m[2]) }));
check('② 홈 결제 카드 (public/index.html)', HOME_CARDS.length >= 8, `${HOME_CARDS.length}개`);

const ok = PRICES && PROG_INFO && Array.isArray(ADDONS) && ADMIN_OPTS.length && HOME_CARDS.length;

console.log('\n[ B. 화면이 말하는 금액 == 서버가 청구하는 금액 ]');
if (!ok) check('금액 대조', false, '전제 실패 — 위 A절을 먼저 고치세요');
else {
  for (const c of HOME_CARDS) {
    if (!c.amount) continue;                       // 0원 카드(무료체험·B2B·상담)는 결제 대상이 아닙니다
    const p = PRICES[c.key];
    check(`홈 카드 ${c.key} — 화면 ${c.amount.toLocaleString('ko-KR')}원 == 서버 가격표`,
      !!p && p.amount === c.amount, p ? `서버: ${p.amount}` : '서버 가격표에 없음');
  }
  for (const [k, v] of Object.entries(PROG_INFO)) {
    if (!v || !v.price) continue;
    const p = PRICES[k];
    check(`결제 모달 ${k} — ${v.price.toLocaleString('ko-KR')}원 == 서버 가격표`,
      !!p && p.amount === v.price, p ? `서버: ${p.amount}` : '서버 가격표에 없음');
  }
  for (const a of ADDONS) {
    const p = PRICES[a.id];
    check(`추가옵션 ${a.id} — ${a.price.toLocaleString('ko-KR')}원 == 서버 가격표`,
      !!p && p.amount === a.price, p ? `서버: ${p.amount}` : '서버 가격표에 없음');
  }
  for (const o of ADMIN_OPTS) {
    const p = PRICES[o.key];
    check(`관리자 결제링크 ${o.key} — ${o.amount.toLocaleString('ko-KR')}원 == 서버 가격표`,
      !!p && p.amount === o.amount, p ? `서버: ${p.amount}` : '서버 가격표에 없음');
  }
}

console.log('\n[ C. ⛔ 서버가 모르는 상품을 화면이 팔지 않는다 ]');
if (!ok) check('미등록 상품 없음', false, '전제 실패');
else {
  /* 서버 판정은 «PRICES 에 있으면 그 금액, other 만 입력금액, 나머지는 거절» 입니다.
     ⚠️ 아래 `serverAccepts` 는 그 조건을 «옮겨 적은» 것이라, 서버가 바뀌면 조용히 어긋납니다.
        그래서 «옮겨 적은 근거» 자체를 먼저 검사합니다 — 서버가 그 규칙을 바꾸면 여기가
        먼저 빨간불이 되어 이 절이 헛돌지 않습니다(CLAUDE.md 「예외로 빼는 값은 그 근거
        자체를 검사로 함께 남기세요」). */
  check('(근거) 서버는 가격표에 없으면 unknown_program 으로 거절한다',
    /if \(!priced\)[\s\S]{0,200}unknown_program/.test(API_PAY));
  check('(근거) 서버는 0원 이하를 not_payable 로 거절한다',
    /if \(amount <= 0\)[\s\S]{0,200}not_payable/.test(API_PAY));
  check("(근거) 입력 금액을 받는 예외는 'other' 뿐이다",
    /else if \(program === 'other'\)/.test(API_PAY) &&
    (API_PAY.match(/program === 'other'/g) || []).length >= 1);

  const serverAccepts = (key, amount) => {
    if (PRICES[key]) return PRICES[key].amount > 0;   // 가격표에 있고 0원 초과면 결제 가능
    return key === 'other' && amount > 0;             // 상담형만 입력 금액 허용
  };
  const sellable = [
    ...HOME_CARDS.filter((c) => c.amount > 0).map((c) => ({ where: '홈 카드', key: c.key, amount: c.amount })),
    ...ADMIN_OPTS.map((o) => ({ where: '관리자 결제링크', key: o.key, amount: o.amount })),
  ];
  const rejected = sellable.filter((s) => !serverAccepts(s.key, s.amount));
  check('화면이 파는 상품을 서버가 전부 받는다', rejected.length === 0,
    rejected.map((r) => `${r.where}:${r.key}`).join(', '));
  // 짝 — 이 검사가 헛돌지 않는지: 없는 키는 실제로 거절돼야 합니다
  check('(짝) 없는 키는 서버가 거절한다', serverAccepts('__not_a_product__', 10000) === false);
  check('(짝) 0원 상품은 결제 대상이 아니다', serverAccepts('trial', 0) === false || !PRICES['trial']);
}

console.log('\n[ D. 관리자 결제링크가 서버 가격표를 «빠짐없이» 담는다 ]');
if (!ok) check('누락 없음', false, '전제 실패');
else {
  const adminKeys = new Set(ADMIN_OPTS.map((o) => o.key));
  const missing = Object.keys(PRICES).filter((k) => !adminKeys.has(k));
  check('서버 가격표의 모든 상품이 관리자 화면에 있다', missing.length === 0, missing.join(', '));
  // 이름도 맞아야 합니다 — 문자로 보내는 안내에 그대로 실립니다
  const nameMismatch = ADMIN_OPTS.filter((o) => PRICES[o.key] && PRICES[o.key].name !== o.name);
  check('상품 이름이 서버 가격표와 같다', nameMismatch.length === 0,
    nameMismatch.map((o) => `${o.key}: 화면 "${o.name}" vs 서버 "${PRICES[o.key].name}"`).join(' / '));
}

console.log('\n[ E. 상품 키가 중복되지 않는다 ]');
if (!ok) check('중복 없음', false, '전제 실패');
else {
  const dupIn = (arr, get) => { const s = new Set(), d = []; for (const x of arr) { const k = get(x); if (s.has(k)) d.push(k); s.add(k); } return d; };
  check('홈 카드에 같은 상품이 두 번 없다', dupIn(HOME_CARDS, (c) => c.key).length === 0, dupIn(HOME_CARDS, (c) => c.key).join(', '));
  check('관리자 목록에 같은 상품이 두 번 없다', dupIn(ADMIN_OPTS, (o) => o.key).length === 0, dupIn(ADMIN_OPTS, (o) => o.key).join(', '));
}

console.log('\n[ F. 2026-09-09 추가분 — AI 콘텐츠 전용(1개월) 이 네 곳에 다 있다 ]');
if (!ok) check('ai_content 배선', false, '전제 실패');
else {
  check('① 서버 가격표에 ai_content 10,000원', !!PRICES['ai_content'] && PRICES['ai_content'].amount === 10000);
  check('② 홈 결제 카드에 ai_content', HOME_CARDS.some((c) => c.key === 'ai_content' && c.amount === 10000));
  check('③ 결제 모달 PROG_INFO 에 ai_content', !!PROG_INFO['ai_content'] && PROG_INFO['ai_content'].price === 10000);
  check('④ 관리자 결제링크에 ai_content', ADMIN_OPTS.some((o) => o.key === 'ai_content' && o.amount === 10000));
  /* 나이·목적 카테고리와 무관한 상품이라 «어떤 대상을 골라도» 보이게 ALWAYS 에 넣었습니다.
     빠지면 대상 필터에서 카드가 사라져 «있는데 안 보이는» 상품이 됩니다. */
  const ALWAYS = evalLiteral(literalAfter(MODAL, /var\s+ALWAYS\s*=\s*\{/, '{', '}') || '');
  check('대상 필터와 무관하게 늘 보인다(ALWAYS)', !!ALWAYS && ALWAYS['ai_content'] === 1,
    ALWAYS ? JSON.stringify(ALWAYS) : 'ALWAYS 를 못 꺼냄');
}

console.log(`\n${FAIL === 0 ? '🎉' : '💥'} pay_product_catalog_harness — PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
