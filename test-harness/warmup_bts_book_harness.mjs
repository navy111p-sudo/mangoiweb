#!/usr/bin/env node
/**
 * warmup_bts_book_harness.mjs — 웜업 «오늘 배울 교재(BTS)» 회귀 감시
 *
 * [왜 생겼나] 2026-09-14 사장님 지시 «BTS부터 해줘. 강사가 참여하지 않아도 모든 것이
 *   작동하게. 지금 하고 있는 자유대화는 그대로 나두고.»
 *   학생 명부의 배정 교재가 «29,498명 중 0건»(D1 실측)이라 교재 축이 통째로 비어 있었고,
 *   그래서 학생이 직접 고르고 화면이 기억하는 방식으로 넣었습니다.
 *
 * ⚠️ 문자열로만 검사하면 이 기능은 «표도 함수도 다 있는데 답만 틀린» 사고를 못 잡습니다.
 *   그래서 표와 판정 함수를 warmup.html 에서 **오려 내 실제로 돌립니다.**
 * ⛔ 기대값을 이 파일에 손으로 적지 마세요 — 밴드 구간은 LEVEL_CATALOG 를,
 *   권 목록은 BTS_BOOKS 를 «읽어» 옵니다. 베껴 적으면 자기가 적은 상수를 검사하게 됩니다.
 * ⚠️ 화면에 «실제로 그려지는가»(보인다·눌린다)는 원리상 여기서 못 봅니다 —
 *   그쪽은 test-harness/manual/warmup-bts-book-browser.mjs 가 브라우저로 잽니다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'cloudflare-deploy/public/warmup.html');
const P = [], F = [];
const ok = (n) => P.push(n);
const no = (n, got) => F.push(n + (got === undefined ? '' : `  →  ${JSON.stringify(got)}`));
const t = (n, c, got) => (c ? ok(n) : no(n, got));

if (!existsSync(FILE)) { console.error('❌ warmup.html 없음'); process.exit(1); }
const S = readFileSync(FILE, 'utf8');

/** 주석을 벗겨 낸 사본 — 부정 검사가 «자기 주석» 을 잡지 않게 (CLAUDE.md 2장). */
function strip(src) {
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n) { if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i]; if (src[i] === q) { i++; break; } i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}
/** 여는 괄호부터 짝이 맞는 닫는 괄호까지 (문자열 안은 건너뜀). */
function matchFrom(src, start, open, close) {
  let d = 0, i = src.indexOf(open, start);
  if (i < 0) return null;
  const from = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) break; i++; }
      continue;
    }
    if (c === open) d++;
    else if (c === close) { d--; if (d === 0) return src.slice(from, i + 1); }
  }
  return null;
}
const cut = (name, open, close) => {
  const i = S.indexOf(name);
  return i < 0 ? null : matchFrom(S, i, open, close);
};

// ── ⓪ 전제: 표와 함수를 실제로 오려 냈는가 ────────────────────────
const btsSrc = cut('var BTS_BOOKS = [', '[', ']');
const lvlSrc = cut('var LEVEL_CATALOG = [', '[', ']');
const bandSrc = (() => {
  const i = S.indexOf('function btsBandOf(');
  return i < 0 ? null : S.slice(i, i + (matchFrom(S, i, '{', '}') || '').length + (S.indexOf('{', i) - i));
})();
t('⓪ BTS_BOOKS 를 오려 냈다', !!btsSrc);
t('⓪ LEVEL_CATALOG 를 오려 냈다', !!lvlSrc);
t('⓪ btsBandOf 를 오려 냈다', !!bandSrc && bandSrc.includes('LEVEL_CATALOG'));

let BOOKS = null, CAT = null, bandOf = null;
try {
  BOOKS = new Function('return ' + btsSrc)();
  CAT = new Function('return ' + lvlSrc)();
  bandOf = new Function('LEVEL_CATALOG', bandSrc + '; return btsBandOf;')(CAT);
} catch (e) { no('⓪ 평가 실패', String(e && e.message)); }

if (BOOKS && CAT && bandOf) {
  // ── ① 표 자체 ──────────────────────────────────────────────────
  t('① 권이 하나 이상', BOOKS.length > 0, BOOKS && BOOKS.length);
  const vols = BOOKS.map(b => b.v);
  t('① 권 번호 중복 없음', new Set(vols).size === vols.length,
    vols.filter((v, i) => vols.indexOf(v) !== i));
  t('① 권 번호가 전부 1 이상의 정수', vols.every(v => Number.isInteger(v) && v >= 1),
    vols.filter(v => !(Number.isInteger(v) && v >= 1)));
  t('① 모든 권에 영어 주제', BOOKS.every(b => typeof b.en === 'string' && b.en.trim()),
    BOOKS.filter(b => !(b.en || '').trim()).map(b => b.v));
  t('① 모든 권에 한국어 안내', BOOKS.every(b => typeof b.ko === 'string' && b.ko.trim()),
    BOOKS.filter(b => !(b.ko || '').trim()).map(b => b.v));
  /* ⚠️ 영어 주제가 AI 에게 가는 값입니다 — 한글이 섞이면 영어 프롬프트에 한국어가 샙니다. */
  t('① 영어 주제에 한글이 없다', BOOKS.every(b => !/[가-힣]/.test(b.en)),
    BOOKS.filter(b => /[가-힣]/.test(b.en)).map(b => b.v));

  // ── ② 밴드 매핑을 «실제로 돌려» LEVEL_CATALOG 와 대조 ──────────
  const bad = [];
  for (const b of BOOKS) {
    const band = bandOf(b.v);
    const c = CAT[band - 1];
    if (!c) { bad.push(`${b.v}:밴드없음(${band})`); continue; }
    const m = String(c.lv || '').match(/(\d+)\s*[-~]\s*(\d+)/);
    if (!m || b.v < +m[1] || b.v > +m[2]) bad.push(`${b.v}→밴드${band}(${c.lv})`);
  }
  t('② 모든 권이 LEVEL_CATALOG 구간과 일치', bad.length === 0, bad);
  t('② 모르는 권은 0(«모르면 손대지 않는다»)', bandOf(0) === 0 && bandOf(999) === 0 && bandOf('x') === 0,
    [bandOf(0), bandOf(999), bandOf('x')]);
  /* 짝 검사 — «전부 0» 으로 만들어도 위 ②가 통과하지 않게. */
  t('② 실제 권은 1~8 밴드를 돌려준다', BOOKS.every(b => bandOf(b.v) >= 1 && bandOf(b.v) <= 8),
    BOOKS.filter(b => !(bandOf(b.v) >= 1 && bandOf(b.v) <= 8)).map(b => b.v));

  // ── ③ 자유 대화가 그대로인가 (사장님 지시) ─────────────────────
  const C = strip(S);
  t('③ 교재를 풀면 textbook 을 비운다',
    /function clearBtsBook\([\s\S]{0,400}?WCTX\.textbook\s*=\s*''/.test(C));
  t('③ 교재를 풀면 주제를 «원래 URL 값» 으로 되돌린다',
    /function clearBtsBook\([\s\S]{0,400}?LESSON_TOPIC\s*=\s*LESSON_TOPIC_URL/.test(C));
  t('③ 교재를 풀면 저장값을 지운다',
    /function clearBtsBook\([\s\S]{0,400}?removeItem\(BTS_KEY\)/.test(C));
  /* ⛔ 되돌릴 때 대화 단계까지 되돌리면 «내가 고른 수준» 이 사라집니다. */
  const clearBody = (() => { const i = C.indexOf('function clearBtsBook('); return i < 0 ? '' : (matchFrom(C, i, '{', '}') || ''); })();
  t('③ 되돌리기가 대화 단계를 건드리지 않는다', !!clearBody && !/setLevel\s*\(/.test(clearBody));

  // ── ④ 강사 없이 이어지는가 ─────────────────────────────────────
  const restore = (() => { const i = C.indexOf('function restoreBtsBook('); return i < 0 ? '' : (matchFrom(C, i, '{', '}') || ''); })();
  t('④ 저장값 복원 절이 있다', !!restore && restore.includes('applyBtsBook'));
  t('④ ?textbook= 이 있으면 복원이 양보한다', /if\s*\(\s*WCTX\.textbook\s*\)\s*return/.test(restore), restore.slice(0, 120));
  /* ⛔ 복원이 단계를 덮으면 학생이 직접 올린 수준이 매번 되돌아갑니다. */
  t('④ 복원은 단계를 덮지 않는다(syncBand=false)',
    /applyBtsBook\s*\(\s*v\s*,\s*false\s*,\s*false\s*\)/.test(restore), restore);

  // ── ⑤ 서버는 안 고쳤는가 (이 변경의 전제) ──────────────────────
  const idx = join(ROOT, 'cloudflare-deploy/src/index.ts');
  if (existsSync(idx)) {
    const I = readFileSync(idx, 'utf8');
    t('⑤ 서버가 쓰는 통로(lesson_topic)가 그대로 살아 있다', I.includes('오늘의 대화 주제는'));
    t('⑤ 서버가 교재 통로(textbook)를 그대로 읽는다', I.includes('[오늘 수업 정보]'));
    t('⑤ 서버에 BTS 목록을 복제하지 않았다', !/BTS_BOOKS/.test(I));
  }
}

const label = 'warmup_bts_book_harness';
console.log(`\n▶ ${label}`);
P.forEach(x => console.log('  ✅ ' + x));
F.forEach(x => console.log('  ❌ ' + x));
console.log(`\n${label} — PASS ${P.length} / FAIL ${F.length}`);
if (F.length) process.exit(1);
