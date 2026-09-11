#!/usr/bin/env node
/**
 * 📅 시간표 입구 회귀 감시 — 「여섯 카드가 전부 같은 주소」 사고가 다시 안 나게 (2026-09-11)
 *
 * [무엇을 막나]
 *   admin.html 의 통합 시간표 카드 6장이 전부
 *     onclick="location.href='/admin/weekly-schedule.html'"
 *   한 줄이라 무엇을 눌러도 같은 화면이 나왔다(사장님 제보). 파라미터도 분기도 없었다.
 *
 * [이 검사가 «실제로» 묻는 것]
 *   ① 카드를 그리는 목록(js/adm-schedule-cards.js 의 CARDS)을 «오려 내 실제로 평가» 한다.
 *      — 「그 글자가 있는가」로 물으면 주석·설명에 걸려 헛돈다(CLAUDE.md 반복 교훈).
 *   ② 그 preset 값이 도착 화면(weekly-schedule.html)의 PRESET_KEYS «안» 에 있는가.
 *      두 파일을 손으로 맞추면 반드시 어긋나므로 «양쪽을 읽어» 대조한다.
 *   ③ 카드끼리 목적지가 서로 다른가 (= 이 사고 자체).
 *   ④ admin.html 이 옛 하드코딩 카드로 되돌아가지 않았는가 (주석을 벗겨 낸 사본으로 판정).
 *   ⑤ 도착 화면이 프리셋을 «흉내내지» 않고 진짜 조작을 누르는가.
 *   ⑥ 숫자 정본이 «못 잰 값을 0 으로 채우지» 않는가.
 *
 * ⛔ 개수(6·5)로 못 박지 않는다 — 카드가 정당하게 늘 때 멀쩡한 수리가 빨간불이 된다.
 *    묻는 것은 「서로 다른가」·「양쪽이 같은 말을 하는가」다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P_CARDS = join(ROOT, 'cloudflare-deploy/public/js/adm-schedule-cards.js');
const P_ADMIN = join(ROOT, 'cloudflare-deploy/public/admin.html');
const P_WEEK  = join(ROOT, 'cloudflare-deploy/public/admin/weekly-schedule.html');
const P_SUM   = join(ROOT, 'cloudflare-deploy/src/schedule-summary.ts');

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };
const chk = (c, m) => c ? ok(m) : bad(m);

/** 주석을 벗긴 사본 — 부정 검사(«이 글자가 없어야 한다»)는 반드시 이걸로 판정한다.
 *  ⚠️ 블록주석을 정규식 한 줄로 지우면 문자열 안의 짝 없는 «슬래시+별표» 에 뒤가 통째로
 *     사라진다(CLAUDE.md). 그래서 줄 단위로 «지금 블록주석 안인가» 를 추적한다. */
function strip(src) {
  const out = [];
  let inBlock = false;
  for (const line of src.split('\n')) {
    let s = '', i = 0;
    while (i < line.length) {
      if (inBlock) {
        const e = line.indexOf('*/', i);
        if (e < 0) { i = line.length; break; }
        inBlock = false; i = e + 2; continue;
      }
      const b = line.indexOf('/*', i);
      const l = line.indexOf('//', i);
      const h = line.indexOf('<!--', i);
      const cands = [b, l, h].filter((x) => x >= 0);
      const first = cands.length ? Math.min(...cands) : -1;
      if (first < 0) { s += line.slice(i); break; }
      s += line.slice(i, first);
      if (first === l) { i = line.length; break; }
      if (first === h) {
        const e = line.indexOf('-->', first);
        if (e < 0) { i = line.length; inBlock = false; break; }   /* HTML 주석은 줄바꿈 포함 — 아래서 다시 */
        i = e + 3; continue;
      }
      inBlock = true; i = first + 2;
    }
    out.push(s);
  }
  return out.join('\n');
}

/** HTML 주석은 여러 줄에 걸치므로 따로 한 번 더 벗긴다. */
function stripHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '');
}

console.log('\n📅 시간표 입구 프리셋 — 회귀 감시\n');

// ── ⓪ 전제: 파일이 모두 있는가 (없으면 아래 검사가 조용히 뜻을 잃는다) ──
console.log('⓪ 전제');
for (const [p, n] of [[P_CARDS, 'adm-schedule-cards.js'], [P_ADMIN, 'admin.html'], [P_WEEK, 'weekly-schedule.html'], [P_SUM, 'schedule-summary.ts']]) {
  chk(existsSync(p), `${n} 이 있다`);
}
if (fail) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}\n`); process.exit(1); }

const cardsSrc = readFileSync(P_CARDS, 'utf8');
const adminSrc = readFileSync(P_ADMIN, 'utf8');
const weekSrc  = readFileSync(P_WEEK, 'utf8');
const sumSrc   = readFileSync(P_SUM, 'utf8');

// ── ① 카드 목록을 «실제로 평가» 해서 preset 을 뽑는다 ──
console.log('\n① 카드 목록 (오려 내 실제로 평가)');
let presets = [];
let cardKeys = [];
try {
  const m = cardsSrc.match(/var\s+CARDS\s*=\s*\[/);
  if (!m) throw new Error('CARDS 배열을 못 찾음');
  const start = m.index + m[0].length - 1;
  let depth = 0, end = -1;
  for (let i = start; i < cardsSrc.length; i++) {
    const c = cardsSrc[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('CARDS 배열의 짝 ] 를 못 찾음');
  const lit = cardsSrc.slice(start, end + 1);
  /* 값에 함수가 들어 있으므로 그대로 평가한다. T()/en() 은 여기서 안 불린다(정의만 담긴다). */
  const arr = new Function('T', 'return ' + lit + ';')((ko) => ko);
  chk(Array.isArray(arr) && arr.length > 0, `CARDS 를 평가했다 (${arr.length}장)`);
  presets = arr.map((c) => c.preset).filter((p) => p != null);
  cardKeys = arr.map((c) => c.key);
  chk(presets.length > 0, `preset 을 가진 카드가 있다 (${presets.length}장)`);
} catch (e) {
  bad('CARDS 를 평가하지 못했다 — ' + (e && e.message));
}

// ── ② 카드끼리 목적지가 서로 다른가 (= 이 사고 자체) ──
console.log('\n② 여섯이 서로 다른 곳으로 가는가');
chk(new Set(presets).size === presets.length,
    `preset 값이 전부 서로 다르다 (${presets.join(', ')})`);
chk(new Set(cardKeys).size === cardKeys.length, 'card key 가 전부 서로 다르다');

// ── ③ 도착 화면이 그 값을 «아는가» (두 파일 대조) ──
console.log('\n③ 도착 화면이 그 preset 을 아는가');
let known = [];
try {
  const m = weekSrc.match(/var\s+PRESET_KEYS\s*=\s*(\[[^\]]*\])/);
  if (!m) throw new Error('PRESET_KEYS 를 못 찾음');
  known = new Function('return ' + m[1] + ';')();
  chk(Array.isArray(known) && known.length > 0, `PRESET_KEYS 를 읽었다 (${known.join(', ')})`);
} catch (e) {
  bad('PRESET_KEYS 를 읽지 못했다 — ' + (e && e.message));
}
for (const p of presets) {
  chk(known.indexOf(p) >= 0, `카드가 보내는 '${p}' 를 도착 화면이 안다`);
}
/* 반대 방향도 본다 — 화면만 아는 값이 있으면 «죽은 분기» 다(해롭진 않지만 알려 준다). */
const orphan = known.filter((k) => presets.indexOf(k) < 0);
chk(orphan.length === 0, orphan.length ? `화면만 아는 preset 이 있다: ${orphan.join(', ')} (카드가 안 보냄)` : '화면만 아는 preset 이 없다');

// ── ④ admin.html 이 옛 하드코딩으로 되돌아가지 않았는가 ──
console.log('\n④ 옛 하드코딩으로 되돌아가지 않았는가');
const adminBody = stripHtmlComments(adminSrc);
const cardBlock = (() => {
  const i = adminBody.indexOf('id="card-timetable"');
  if (i < 0) return '';
  /* 다음 <details 까지 — 범위를 «길이» 로 자르면 옆 카드가 딸려 온다(CLAUDE.md). */
  const j = adminBody.indexOf('<details', i + 10);
  return adminBody.slice(i, j < 0 ? adminBody.length : j);
})();
chk(cardBlock.length > 0, '통합 시간표 카드 블록을 잘라 냈다 (전제)');
const oldHandlers = (cardBlock.match(/onclick="location\.href='\/admin\/weekly-schedule\.html'"/g) || []).length;
chk(oldHandlers <= 1,
    oldHandlers <= 1
      ? `파라미터 없는 같은 주소가 ${oldHandlers}개다 (아래 「시간표 보기」 버튼 한 개까지만 허용)`
      : `파라미터 없는 같은 주소가 ${oldHandlers}개다 — 사고가 되돌아왔다`);
chk(cardBlock.includes('id="sc-cards"'), '카드를 그릴 자리(#sc-cards)가 있다');
chk(/adm-schedule-cards\.js\?v=\d+/.test(cardBlock), '카드 스크립트를 ?v= 와 함께 싣는다');
chk(!cardBlock.includes('주간/월간'), '없는 「월간」 뷰를 더는 약속하지 않는다');

// ── ⑤ 프리셋이 «흉내내지» 않고 진짜 조작을 누르는가 ──
console.log('\n⑤ 진짜 조작을 누르는가');
const weekCode = strip(weekSrc);
const presetBlock = (() => {
  const i = weekCode.indexOf('function applyPreset');
  if (i < 0) return '';
  const j = weekCode.indexOf('\n})();', i);
  return weekCode.slice(i, j < 0 ? weekCode.length : j);
})();
chk(presetBlock.length > 0, 'applyPreset 블록을 잘라 냈다 (전제)');
chk(/getElementById\(['"]btn-free['"]\)[\s\S]{0,200}\.click\(\)/.test(presetBlock),
    '빈자리는 #btn-free 를 실제로 누른다');
chk(/data-view="day"[\s\S]{0,200}\.click\(\)/.test(presetBlock),
    '오늘은 일간 뷰 버튼을 실제로 누른다');
chk(presetBlock.includes('search-input'), '강사·학생은 검색창을 세워 준다');
/* 배지는 흐름 안에 넣어야 한다 — fixed 로 띄우면 다른 것을 덮는다 */
chk(!/position\s*:\s*fixed/.test(presetBlock), '배지를 position:fixed 로 띄우지 않는다');
/* 상주 타이머 금지 — 홈을 통째로 멎게 한 전력 */
chk(!/setInterval/.test(presetBlock), '상주 setInterval 을 두지 않는다');

// ── ⑥ 숫자 정본이 «모름» 을 0 으로 채우지 않는가 ──
console.log('\n⑥ 못 잰 값을 지어내지 않는가');
const sumCode = strip(sumSrc);
chk(/return\s+null;/.test(sumCode), '조회가 실패하면 null(모름)을 돌려준다');
chk(!/catch\s*\{\s*return\s+0\s*;?\s*\}/.test(sumCode), '실패를 0 으로 바꾸지 않는다');
chk(sumCode.includes("NOT IN ('lms','type_seed')"), '자리표시(LMS·시드)를 집계에서 뺀다');
/* 정기와 날짜를 한 숫자로 더하면 그 자리에서 거짓이 된다 */
chk(!/dated\s*\+\s*recurring|recurring\s*\+\s*dated/.test(sumCode),
    '날짜가 잡힌 건수와 매주 반복을 더해 한 숫자로 만들지 않는다');
/* 카드 쪽도 같은 계약 */
const cardsCode = strip(cardsSrc);
chk(/v\s*==\s*null[\s\S]{0,120}'—'/.test(cardsCode) || cardsCode.includes("big.textContent = '—'"),
    '카드가 «모름» 을 «—» 로 그린다');
chk(cardsCode.includes('d.ok !== true'),
    '응답 판정을 «성공이라고 말했는가» 로 한다 (404 본문에는 ok 칸이 없다)');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}\n`);
/* ⚠️ 실패하면 반드시 1 로 나간다 — 종료코드 0 으로 나가면 --fast 합계가 한 자리도 안 움직여
   검사가 조용히 사라진다(CLAUDE.md 실사고). */
process.exit(fail ? 1 : 0);
