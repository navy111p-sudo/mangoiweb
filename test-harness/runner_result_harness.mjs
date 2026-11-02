/** Result classification must never silently hide a failed non-browser check. */
import assert from 'node:assert/strict';
import { classifyHarnessResult } from './runner-result.mjs';
import { usesPuppeteer } from './runner-source.mjs';
function classify(result, browser = false) { return classifyHarnessResult(result, browser)[0]; }
let pass = 0, fail = 0;
function check(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL:', name, e.message); } }
const result = (stdout, status = 0) => ({ stdout, stderr: '', status });
check('ordinary success', () => assert.equal(classify(result('PASS 5 / FAIL 0')), 'PASS'));
check('nonzero exit', () => assert.equal(classify(result('', 1)), 'FAIL'));
check('non-browser timeout', () => assert.equal(classify({ error: { code: 'ETIMEDOUT' }, status: null }), 'FAIL'));
check('Korean failed assertions with exit zero', () => assert.equal(classify(result('✅ 4 통과 / ❌ 1 실패\n')), 'FAIL'));
check('Korean failure with punctuation', () => assert.equal(classify(result('4 통과, 1 실패.')), 'FAIL'));
check('Korean word sharing prefix is not failure count', () => assert.equal(classify(result('1 실패방지 검사 통과')), 'PASS'));
check('zero Korean failures', () => assert.equal(classify(result('✅ 4 통과 / ❌ 0 실패\n')), 'PASS'));
check('English failed assertions', () => assert.equal(classify(result('4 passed, 1 failed')), 'FAIL'));
check('non-browser crash', () => assert.equal(classify(result('Cannot read properties of undefined', 1)), 'FAIL'));
check('browser timeout keeps explicit skip', () => assert.equal(classify({ error: { code: 'ETIMEDOUT' }, status: null }, true), 'SKIP'));
check('browser import recognized', () => assert.equal(usesPuppeteer(["import p", "from", "'puppeteer-core';"].join(" ")), true));
check('browser mentioned in comment is not an import', () => assert.equal(usesPuppeteer('// puppeteer is unavailable'), false));
for (const text of [
  'PASS 5 / FAIL 1', 'PASS 5 FAIL 1', 'FAIL 1', 'FAIL: 1', 'FAIL=1',
  'Suite name: PASS 5 / FAIL 1', '결과: PASS 5 / FAIL 1', '통과 5 · 실패 1',
  '총 6건 중 ✅ 5 통과 / ❌ 1 실패', '5 passed, 1 failed', '1 FAIL', '1 실패.',
  '\x1b[31mFAIL 1\x1b[0m', '1 FAIL\n' + Array(26).fill('detail').join('\n'),
  Array(100).fill('detail').join('\n') + '\nPASS 5 / FAIL 1\n' + Array(100).fill('detail').join('\n'),
]) check('whole-output failure '+JSON.stringify(text.slice(0,40)),()=>assert.equal(classify(result(text)),'FAIL'));
for (const text of [
  'PASS 5 FAIL 0', 'PASS 5 / FAIL 0', '5 passed, 0 failed', '통과 5 · 실패 0',
  '총 5건 중 ✅ 5 통과 / ❌ 0 실패', '결과: PASS 5 / FAIL 0',
  'PASS: literal "PASS 5 / FAIL 1" was rejected', 'expected 1 FAIL was caught',
  '✅ 실패 1회 안내', '✅ 실패 2회 안내', '✅ 실패 3회 안내', '✅ 실패 1건이 집계된다',
  'PASS 1 "1 FAIL" sample handled', 'FAILURE_COUNT=1 example', '1 실패방지 통과',
]) check('no false failure '+JSON.stringify(text),()=>assert.equal(classify(result(text)),'PASS'));
check('stderr failure summary',()=>assert.equal(classify({status:0,stdout:'ok',stderr:'PASS 5 / FAIL 1'}),'FAIL'));
console.log(`PASS ${pass} / FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
