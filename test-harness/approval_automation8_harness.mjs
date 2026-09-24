#!/usr/bin/env node
/**
 * 🧾 결재 자동화 8단계 (2026-09-24) — 영수증 사진 → 결재서 «내용(품목)»·«항목» 자동 작성
 *
 * 무엇을 지키나
 *   ① normReceiptItems — 모델이 준 품목을 믿을 모양으로(이름 없는 줄 버림 · 수량 1~999 · 가격 모르면 null · 15줄).
 *   ② receiptBody — 품목 → 내용 글. 품목이 없으면 ''(지어내지 않음). 합계≠총액이면 한 줄 경고(짝: 같으면 없음).
 *   ③ guessCategory — 낱말로 항목 짐작. 모르거나 동점이면 null(사람이 고름).
 *   ④ 배선 — 서버가 items 를 읽고 body_draft·category_guess 를 돌려준다 · 화면이 비어 있는 칸만 채운다(짝: 이미 적은 칸은 안 덮음).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const P = await import(pathToFileURL(process.env.POLICY_SRC || join(SRC, 'approval-policy.ts')).href);
const API = readFileSync(process.env.API_SRC || join(SRC, 'api-approval.ts'), 'utf8');
const WORK = readFileSync(process.env.WORK_SRC || join(PUB, 'work.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}
function bodyAt(src, i) {
  const s = src.indexOf('{', i); if (s < 0 || i < 0) return '';
  let d = 0;
  for (let k = s; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(s, k + 1); }
  }
  return '';
}
function grab(src, name) { const i = src.indexOf(name); return i < 0 ? '' : src.slice(i, src.indexOf('{', i)) + bodyAt(src, i); }

console.log('\n① normReceiptItems');
try {
  const it = P.normReceiptItems([
    { name: '  Bond  paper A4 ', qty: '2', price: '₱240.00' },
    { name: '', qty: 1, price: 10 },
    { name: 'Ballpen', qty: 0, price: null },
    { name: 'Folder', qty: 5000, price: -3 },
    'junk', null,
  ]);
  ok('이름 없는 줄·잡동사니는 버린다', it.length === 3, JSON.stringify(it));
  ok('이름 공백 정리 · 수량 숫자로 · 가격 숫자로', it[0].name === 'Bond paper A4' && it[0].qty === 2 && it[0].price === 240);
  ok('수량 0 → 1 · 가격 모름 → null', it[1].qty === 1 && it[1].price === null);
  ok('수량 상한 999 · 음수(할인 줄) 가격은 +3 이 아니라 null', it[2].qty === 999 && it[2].price === null);
  ok('(짝) "-₱3" 도 null, "₱1,250.50" 은 1250.5', P.normReceiptItems([{name:'a',price:'-₱3'},{name:'b',price:'₱1,250.50'}]).map(x=>x.price).join() === ',1250.5');
  ok('배열이 아니면 []', P.normReceiptItems(null).length === 0 && P.normReceiptItems('x').length === 0);
  const many = P.normReceiptItems(Array.from({ length: 40 }, (_, i) => ({ name: 'x' + i, qty: 1, price: 1 })));
  ok('최대 15줄', many.length === 15);
} catch (e) { ok('normReceiptItems 를 돌렸다', false, e.message); }

console.log('\n② receiptBody');
try {
  const items = [{ name: 'Bond paper', qty: 2, price: 240 }, { name: 'Ink', qty: 1, price: 360 }];
  const b = P.receiptBody(items, 600, 'PHP');
  ok('머리에 «영수증에서 읽음·확인» 을 적는다', /영수증에서 읽음/.test(b) && /please check/.test(b));
  ok('품목마다 한 줄 · 수량 · 가격(₱)', /- Bond paper × 2 — ₱240/.test(b) && /- Ink — ₱360/.test(b));
  ok('합계=총액이면 경고 줄 없음', !/품목 합계와 총액이 다릅니다/.test(b));
  const b2 = P.receiptBody(items, 700, 'PHP');
  ok('(짝) 합계≠총액이면 경고 한 줄', /품목 합계와 총액이 다릅니다/.test(b2) && /₱600/.test(b2) && /₱700/.test(b2));
  ok('₩ 로 적는다', /₩240/.test(P.receiptBody(items, 600, 'KRW')));
  const b3 = P.receiptBody([{ name: 'Tape', qty: 1, price: null }, { name: 'Pen', qty: 1, price: 20 }], 999, 'PHP');
  ok('가격 모르는 품목이 있으면 합계 경고 안 함(모르는 것을 틀렸다고 하지 않음)', !/다릅니다/.test(b3) && /- Tape\n/.test(b3 + '\n'));
  ok('품목이 없으면 빈 글(지어내지 않음)', P.receiptBody([], 100, 'PHP') === '' && P.receiptBody(null, 100, 'PHP') === '');
} catch (e) { ok('receiptBody 를 돌렸다', false, e.message); }

console.log('\n③ guessCategory');
try {
  const g = (v, names) => P.guessCategory(v, names.map(n => ({ name: n, qty: 1, price: 1 })));
  ok('종이·펜 → supplies', g('National Book Store', ['Bond paper', 'Ballpen']) === 'supplies');
  ok('Grab → transport', g('Grab', ['Fare']) === 'transport');
  ok('Jollibee → meal', g('Jollibee', ['Chickenjoy']) === 'meal');
  ok('Meralco → utility', g('Meralco', []) === 'utility');
  ok('모르는 낱말 → null', g('ABC Trading', ['Item 1']) === null);
  ok('동점 → null(사람이 고름)', g('', ['printer', 'taxi']) === null);
  ok('빈 입력 → null', P.guessCategory('', []) === null);
  const keys = new Set((P.CATEGORY_KEYS || []));
  ok('짐작 결과는 전부 실제 항목 목록 안의 값', ['supplies','transport','meal','utility','equipment','books','rent','ads'].every(k => keys.has(k)));
} catch (e) { ok('guessCategory 를 돌렸다', false, e.message); }

console.log('\n④ 배선');
{
  const ri = API.indexOf('async function readReceipt('); const rr = ri < 0 ? '' : API.slice(ri, API.indexOf('async function transcribe(', ri));
  ok('readReceipt 를 잘라 냈다(전제)', rr.length > 200);
  ok('서버: 모델에게 items 를 묻는다', /"items":/.test(rr));
  ok('서버: items 를 normReceiptItems 로 받는다', /items: normReceiptItems\(obj\.items\)/.test(rr));
  ok('서버: 토큰 상한을 품목만큼 늘렸다(>= 400)', (() => { const m = rr.match(/max_tokens:\s*(\d+)/); return m && Number(m[1]) >= 400; })());
  const i = API.indexOf("path === '/api/approval/ocr'");
  const route = i < 0 ? '' : bodyAt(API, i);
  ok('서버: 응답에 body_draft = receiptBody(items, amount, cur)', /body_draft: receiptBody\(got\.items, got\.amount, cur\)/.test(route));
  ok('서버: category_guess = guessCategory(vendor, items)', /category_guess: guessCategory\(got\.vendor, got\.items\)/.test(route));
  ok('서버: 통화는 화면이 보낸 cur 을 normCurrency 로', /normCurrency\(new URL\(request\.url\)\.searchParams\.get\('cur'\)\)/.test(route));
  ok('화면: 통화를 붙여 부른다', /fetch\('\/api\/approval\/ocr\?cur=' \+ encodeURIComponent\(CUR/.test(WORK));
  const gf = WORK.indexOf('OCR = j;');
  ok('화면: 판독 성공 뒤 fillFromReceipt 를 부른다', gf > 0 && /fillFromReceipt\(j\)/.test(WORK.slice(gf, gf + 600)));
  try {
    const f = new Function('document', 'getVal', 'setVal', grab(WORK, 'function fillFromReceipt(') + '\nreturn fillFromReceipt;');
    const mk = (body, catVal) => {
      const vals = { f_body: body };
      const sel = { value: catVal, options: [{ value: '' }, { value: 'supplies' }, { value: 'meal' }] };
      const fn = f({ getElementById: id => id === 'f_cat' ? sel : null }, id => vals[id] || '', (id, v) => { vals[id] = v; });
      return { vals, sel, fn };
    };
    let t = mk('', '');
    const r1 = t.fn({ body_draft: 'Items…', category_guess: 'supplies' });
    ok('빈 칸이면 내용·항목을 채운다', r1 === true && t.vals.f_body === 'Items…' && t.sel.value === 'supplies');
    t = mk('내가 적은 글', 'meal');
    const r2 = t.fn({ body_draft: 'Items…', category_guess: 'supplies' });
    ok('(짝) 이미 적은 내용·고른 항목은 안 덮는다', r2 === false && t.vals.f_body === '내가 적은 글' && t.sel.value === 'meal');
    t = mk('', '');
    t.fn({ body_draft: '', category_guess: 'nonsense' });
    ok('목록에 없는 항목 값은 안 넣는다 · 빈 초안은 안 채운다', t.sel.value === '' && !t.vals.f_body);
  } catch (e) { ok('fillFromReceipt 를 돌렸다', false, e.message); }
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
