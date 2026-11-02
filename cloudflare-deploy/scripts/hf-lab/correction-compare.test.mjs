// 실행: node --test scripts/hf-lab/correction-compare.test.mjs  (네트워크 없이 가짜 fetch 로 검증)
import test from 'node:test';
import assert from 'node:assert/strict';
import { sameCorrection, extractCorrection, parseSamples, correctOne, compareCorrections } from './correction-compare.mjs';

test('sameCorrection: 대소문자·구두점은 무시, 낱말 순서는 중요', () => {
  assert.equal(sameCorrection('I like dogs.', 'i like dogs'), true);
  assert.equal(sameCorrection('dogs like I', 'I like dogs'), false);
  assert.equal(sameCorrection('', ''), false);
});

test('extractCorrection: 첫 줄, 따옴표 제거', () => {
  assert.equal(extractCorrection('"I went to school."\nExplanation: ...'), 'I went to school.');
  assert.equal(extractCorrection(null), '');
});

test('parseSamples: 잘못된 줄과 너무 긴 줄은 건너뛴다', () => {
  const long = 'x'.repeat(301);
  const { rows, skipped } = parseSamples(`{"student":"I goed","reference":"I went"}\nnot json\n{"student":"${long}","reference":"y"}\n{"student":"a"}\n`);
  assert.equal(rows.length, 1);
  assert.equal(skipped, 3);
});

test('correctOne: 토큰이 Authorization 으로 가고 모델 답의 첫 줄을 돌려준다', async () => {
  let seen;
  const fake = async (url, init) => {
    seen = { url, auth: init.headers.Authorization, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'I went to school.' } }] }) };
  };
  const got = await correctOne({ model: 'm1', student: 'I goed to school', token: 't0', fetchImpl: fake, base: 'https://x' });
  assert.equal(got, 'I went to school.');
  assert.equal(seen.auth, 'Bearer t0');
  assert.equal(seen.body.model, 'm1');
  assert.equal(seen.body.messages[1].content, 'I goed to school');
});

test('compareCorrections: 정답과 맞힌 비율을 모델별로, 실패는 분모에서 뺀다', async () => {
  const rows = [
    { student: 'I goed', reference: 'I went' },
    { student: 'He have a dog', reference: 'He has a dog' },
  ];
  const fake = async (url, init) => {
    const model = JSON.parse(init.body).model;
    if (model === 'bad') return { ok: false, status: 503, json: async () => ({}) };
    const s = JSON.parse(init.body).messages[1].content;
    const fix = s === 'I goed' ? 'I went' : (model === 'good' ? 'He has a dog' : 'He have a dog');
    return { ok: true, json: async () => ({ choices: [{ message: { content: fix } }] }) };
  };
  const rep = await compareCorrections({ rows, models: ['good', 'weak', 'bad'], token: 't', fetchImpl: fake, base: 'https://x' });
  assert.equal(rep[0].model, 'good');
  assert.equal(rep[0].match, 1);
  assert.equal(rep[1].match, 0.5);
  assert.equal(rep[2].samples, 0);
  assert.equal(rep[2].match, null);
  assert.equal(rep[2].failed, 2);
});
