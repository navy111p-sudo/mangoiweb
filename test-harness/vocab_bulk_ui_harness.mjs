/**
 * 📂 단어장 "파일 일괄 추가" UI 실측 하니스 (2026-07-13)
 *  - vocab.html file:// 로 열어 드롭존/양식버튼 렌더 + 파일 선택 → 미리보기 → 선택 카운트 실측
 *  - CSV 파일을 실제 input[type=file] 에 주입해 클라이언트 파싱 경로 end-to-end 확인
 * 실행: node test-harness/vocab_bulk_ui_harness.mjs
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOCAB = path.resolve(__dirname, '..', 'cloudflare-deploy', 'public', 'vocab.html');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let pass = 0, fail = 0;
function check(name, ok, detail){
  if (ok) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (detail ? ' — ' + detail : '')); }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.setViewport({ width: 400, height: 850, isMobile: true, hasTouch: true });
await page.goto('file:///' + VOCAB.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1200));

// 1) 렌더: 드롭존/양식버튼/파일 input
check('드롭존 렌더', await page.$('#drop-zone') !== null);
check('양식 내려받기 버튼', await page.$('.tmpl-btn') !== null);
check('파일 input(hidden)', await page.$('#bulk-file') !== null);
const dzVisible = await page.evaluate(() => {
  const el = document.getElementById('drop-zone');
  const r = el.getBoundingClientRect();
  return r.width > 100 && r.height > 60;
});
check('드롭존 크기 정상(모바일 400px)', dzVisible);

// 2) CSV 파일 주입 → 미리보기
const tmp = path.join(os.tmpdir(), 'vocab_test_' + Date.now() + '.csv');
fs.writeFileSync(tmp, '﻿영어단어,한국어 뜻\ngorgeous,아주 멋진\nbrave,용감한\ncurious,\n', 'utf8');
const input = await page.$('#bulk-file');
await input.uploadFile(tmp);
await new Promise(r => setTimeout(r, 1500));

const preview = await page.evaluate(() => {
  const pv = document.getElementById('bulk-preview');
  return {
    visible: pv && pv.style.display !== 'none' && pv.innerHTML.length > 0,
    rows: document.querySelectorAll('#bulk-preview .bp-row').length,
    btnText: (document.getElementById('bp-add-btn') || {}).textContent || '',
    aiRows: document.querySelectorAll('#bulk-preview .bk.ai').length,
  };
});
check('미리보기 표시', preview.visible);
check('3단어 행 렌더', preview.rows === 3, 'rows=' + preview.rows);
check('추가 버튼 카운트=3', preview.btnText.includes('3개'), preview.btnText);
check('빈 뜻 → "AI 자동" 표기', preview.aiRows === 1, 'aiRows=' + preview.aiRows);

// 3) 체크 해제 → 카운트 갱신 / 전체 토글 / 취소
await page.evaluate(() => { const cb = document.querySelector('#bulk-preview input[type=checkbox]'); cb.checked = false; cb.dispatchEvent(new Event('change')); });
const btnAfter = await page.evaluate(() => document.getElementById('bp-add-btn').textContent);
check('해제 후 카운트=2', btnAfter.includes('2개'), btnAfter);
await page.evaluate(() => bulkToggleAll());
const allOn = await page.evaluate(() => Array.from(document.querySelectorAll('#bulk-preview input[type=checkbox]')).every(c => c.checked));
check('전체 선택 토글', allOn);
await page.evaluate(() => bulkCancel());
const hidden = await page.evaluate(() => document.getElementById('bulk-preview').style.display === 'none');
check('취소 → 미리보기 닫힘', hidden);

// 4) HWP 안내 (파일 주입 없이 확장자 게이트 직접 호출)
await page.evaluate(() => handleBulkFile(new File(['dummy'], 'sample.hwp')));
await new Promise(r => setTimeout(r, 300));
const hwpMsg = await page.evaluate(() => document.getElementById('bulk-status').textContent);
check('HWP 친절 안내', /한글\(HWP\)/.test(hwpMsg), hwpMsg.slice(0, 60));

// 5) 페이지 JS 에러 없음
check('pageerror 없음', errs.length === 0, errs.join(' | '));

fs.unlinkSync(tmp);
await browser.close();
console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ FAILURES') + ` (pass ${pass} / fail ${fail})`);
process.exit(fail === 0 ? 0 : 1);
