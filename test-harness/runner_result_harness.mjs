/** Result classification must never silently hide a failed non-browser check. */
import assert from 'node:assert/strict';
import { classifyHarnessResult, usesPuppeteer } from './runner-result.mjs';
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
check('browser import recognized', () => assert.equal(usesPuppeteer("import p from 'puppeteer-core';"), true));
check('browser mentioned in comment is not an import', () => assert.equal(usesPuppeteer('// puppeteer is unavailable'), false));
console.log(`PASS ${pass} / FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
