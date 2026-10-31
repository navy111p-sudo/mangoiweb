// -*- coding: utf-8 -*-
// 🧾 「NEW TEACHER'S PAGE PROBLEM」 2026-08-14 접수분 하네스
//   실행: node test-harness/teacher_page_problem_260814_harness.mjs
//
//   마이마이(필리핀 매니저) 8/14 신고 + «이미 됐다고 한 것» 중 실제로는 반쪽이던 것들을 규칙으로 굳힌다.
//     ① 「파닉스가 한 권에 다 들어 있다 — A~Z 로 나눠 달라」
//     ② 「페이지 목록에 쪽 번호가 안 보인다 — BODA 처럼 파일 이름이 보이게」 (8/13 요청의 남은 절반)
//     ③ 영어 화면인데 한국어가 그대로 나오던 자리들 (🌐 를 눌러도 안 바뀜)
//     ④ 교재 카드 배지가 영어에서 「0 and · 781」 로 나오던 것
//
//   ⚠️ 규칙으로 쓴다 — «그 글자가 있는가» 가 아니라 «그 규칙이 지켜지는가».
import { readFileSync } from 'node:fs';
import { readPageSource } from './page-source.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try {
  const m = /public\/([\w.-]+\.html)$/.exec(p);
  if (m) return readPageSource(m[1]);
  return readFileSync(resolve(__dir, p), 'utf8');
} catch { return ''; } };

const main     = rd('../cloudflare-deploy/public/js/idx-main.js');
const x3       = rd('../cloudflare-deploy/public/js/idx-x3.js');
const idx      = rd('../cloudflare-deploy/public/index.html');
const uploader = rd('../cloudflare-deploy/public/textbook-uploader.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

// pdfTogglePageList 함수 «본문» 만 떼어 본다 (거리로 보지 않기 위해)
const _s = main.indexOf('async function pdfTogglePageList');
const _e = main.indexOf('window.pdfTogglePageList =', _s);
const pageListFn = (_s >= 0 && _e > _s) ? main.slice(_s, _e) : '';

console.log('\n[ ①  파닉스 A~Z — 글자로 나뉜 폴더도 «권» 이 된다 ]');
/* 원본 드라이브에는 「Mangoi Phonics A」…「Z」 26폴더가 있는데, 업로더가 숫자 폴더(001)만
   유닛으로 봤다. 26폴더가 통째로 «미분류» 가 되어 한 권(781장)이 됐다. */
check('폴더 이름이 한 글자(A~Z)로 끝나면 유닛으로 인정한다',
  /\^\(\.\*\?\[\\s_\\-\]\)\?\(\[A-Za-z\]\)\$/.test(uploader));
check('🔴 이름이 붙은 폴더(Mangoi Phonics A)는 그 폴더명이 그대로 «권 이름» 이 된다',
  /if \(am\[1\]\) \{[\s\S]{0,200}textbook = seg;/.test(uploader));
check('글자만 있는 폴더(A)는 윗 교재 이름에 글자를 붙인다',
  /textbook = textbook \+ ' ' \+ letter/.test(uploader));
check('🔴 숫자 규칙이 실패했을 때만 돈다 — 기존 교재 분류를 안 바꾼다',
  uploader.indexOf("um = /^(\\d{1,3})") < uploader.indexOf('am = /^(.*?[\\s_\\-])?([A-Za-z])$/'));
check('🔴 파일 이름은 유닛 판정에 쓰지 않는다 (Slide A.JPG 의 A 를 유닛으로 읽으면 안 된다)',
  /const am = \/\^\(\.\*\?\[\\s_\\-\]\)\?\(\[A-Za-z\]\)\$\/\.exec\(seg\)/.test(uploader)
  && /for \(let i = dirParts\.length - 1; i >= 1; i--\)[\s\S]{0,400}am = /.test(uploader));

console.log('\n[ ②  페이지 목록 — 줄마다 «몇 쪽인지» 가 보인다 ]');
/* 자료실 파일 이름은 «[BTS 6 Korea (Bedroom, living room)] 미분류 레슨 / Slide12.JPG» 라
   앞부분이 모든 줄에서 같다. 한 줄 말줄임이라 화면에는 어느 줄이나 똑같이 잘려 보였다. */
check('쪽 이름만 남기는 규칙이 있다 (_pdfShortPageName)',
  /function _pdfShortPageName\(/.test(main));
check('🔴 마지막 슬래시 뒤(진짜 파일 이름)를 쓴다',
  /lastIndexOf\('\/'\)[\s\S]{0,200}slice\(slash \+ 1\)/.test(main));
check('앞에 남은 [교재명] 대괄호도 뗀다',
  /replace\(\/\^\\\[\[\^\\\]\]\*\\\]\\s\*\/, ''\)/.test(main));
check('🔴 이름을 못 알아볼 때만 «N쪽 / Page N» 으로 대신한다 (빈 줄을 만들지 않는다)',
  /if \(!s\) s = \(en \? 'Page ' : ''\) \+ \(idx \+ 1\)/.test(main));
check('목록 줄이 짧은 이름을 쓴다',
  /var nm = _pdfShortPageName\(nmFull, i, en\)/.test(pageListFn));
check('전체 이름은 잃지 않는다 — 마우스를 올리면 title 로 뜬다',
  /title="' \+ _pdfEscAttr\(nmFull\) \+ '"/.test(pageListFn));
check('🔴 번호(1. 2. 3.)는 그대로 있다',
  /\(i \+ 1\) \+ '\. ' \+ nm/.test(pageListFn));

console.log('\n[ ③  🌐 를 눌렀을 때 실제로 영어가 된다 ]');
/* CLAUDE.md 「언어 판정」 함정: index.html 은 i18n 엔진이 둘이고, 나중에 로드되는
   mango-i18n.js 가 getLang/setLang 을 덮어쓰지만 인라인 전역 currentLang 은 안 건드린다.
   → currentLang 을 직접 읽던 자리는 🌐 를 눌러도 한국어인 채로 남았다(필리핀 강사만 겪는다). */
check('언어 판정 정본 함수가 있다 (miIsEn)',
  /function miIsEn\(\)/.test(main) && /window\.miIsEn = miIsEn/.test(main));
check('🔴 getLang() 를 «먼저» 본다 (덮어쓴 엔진의 값이 정답이다)',
  /function miIsEn\(\)[\s\S]{0,200}typeof getLang === 'function'[\s\S]{0,60}getLang\(\) === 'en'/.test(main));
check('getLang 이 없을 때만 localStorage(mangoi_lang) → currentLang 순으로 물러선다',
  /function miIsEn\(\)[\s\S]{0,400}mangoi_lang[\s\S]{0,200}typeof currentLang !== 'undefined'/.test(main));
{
  // 헬퍼 본문 밖에서 currentLang 을 직접 읽는 곳이 남아 있으면 안 된다
  const helperStart = main.indexOf('function miIsEn()');
  const helperEnd = main.indexOf('window.miIsEn = miIsEn');
  const outside = (helperStart >= 0 && helperEnd > helperStart)
    ? main.slice(0, helperStart) + main.slice(helperEnd)
    : main;
  const stray = outside.split('\n').filter(l => /currentLang\s*===/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
  check('🔴 idx-main.js 에서 currentLang 을 직접 읽는 코드가 하나도 없다',
    stray.length === 0);
  if (stray.length) stray.slice(0, 5).forEach(l => console.log('       남은 줄: ' + l.trim().slice(0, 90)));
}
check('페이지 목록도 정본 판정을 쓴다',
  /var en = miIsEn\(\)/.test(pageListFn));

console.log('\n[ ④  교재 카드 배지 — 영어에서 「0 and · 781」 이 아니다 ]');
/* i18n 사전이 한국어 조사 「과」를 and 로 번역해 «0과 · 781» 이 «0 and · 781» 이 됐다.
   숫자만 남고 그게 무엇의 숫자인지 사라졌다 — 조사를 아예 쓰지 않는다. */
check('🔴 배지에 조사 「과」를 쓰지 않는다 (and 로 번역되던 자리)',
  !/lessonCount \+ '과 · /.test(x3));
check('한국어는 «단원 · 쪽» 으로 센다',
  /lessonCount \+ '단원 · 📄 ' \+ totalFiles \+ '쪽'/.test(x3));
check('영어는 units · pages 로 센다 (단수/복수도 맞춘다)',
  /' units · 📄 '/.test(x3) && /' unit · 📄 '/.test(x3) && /' pages'/.test(x3));
check('🔴 그릴 때 data-ko / data-en 을 함께 단다 — 🌐 를 눌렀을 때 따라온다',
  /data-ko="' \+ esc\(_cntKo\) \+ '" data-en="' \+ esc\(_cntEn\) \+ '"/.test(x3));
check('지금 언어로 먼저 그린다 (첫 화면부터 맞다)',
  /getLang\(\) === 'en'\) \? _cntEn : _cntKo/.test(x3));

console.log('\n[ ⑤  캐시 버전 — 고쳤으면 ?v= 도 올렸다 ]');
check('idx-main.js ?v= 가 23 보다 높다',
  (Number((/\/js\/idx-main\.js\?v=(\d+)/.exec(idx) || [])[1]) || 0) >= 24);
check('idx-x3.js ?v= 가 7 보다 높다',
  (Number((/\/js\/idx-x3\.js\?v=(\d+)/.exec(idx) || [])[1]) || 0) >= 8);

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
