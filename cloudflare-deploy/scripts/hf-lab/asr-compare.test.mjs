// 실행: node --test scripts/hf-lab/
// 네트워크 없이 가짜 fetch 로 검증한다. English: offline tests with a fake fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wer, meanWer, tokenize } from './asr-wer.mjs';
import { parseManifest, compareModels, transcribe } from './asr-compare.mjs';

test('tokenize: 대소문자·구두점 무시', () => {
  assert.deepEqual(tokenize('Hello, world!'), ['hello', 'world']);
});

test('wer: 완전 일치 0, 한 단어 틀리면 1/3', () => {
  assert.equal(wer('the cat sat', 'the cat sat'), 0);
  assert.ok(Math.abs(wer('the cat sat', 'the dog sat') - 1 / 3) < 1e-9);
});

test('wer: 정답이 비면 null, 가설이 비면 1', () => {
  assert.equal(wer('', 'anything'), null);
  assert.equal(wer('one two', ''), 1);
});

test('meanWer: 계산 불가 항목은 평균에서 뺀다', () => {
  assert.equal(meanWer([['a b', 'a b'], ['', 'x']]), 0);
});

test('parseManifest: 헤더와 따옴표 정답 처리', () => {
  const rows = parseManifest('file,reference\na.wav,"hi, there"\nb.wav,ok\n');
  assert.deepEqual(rows, [
    { file: 'a.wav', reference: 'hi, there' },
    { file: 'b.wav', reference: 'ok' },
  ]);
});

test('transcribe: 2MB 초과 클립은 네트워크 전에 거절', async () => {
  await assert.rejects(
    transcribe({ model: 'm', audio: new Uint8Array(2 * 1024 * 1024 + 1), token: 't', fetchImpl: () => { throw new Error('should not call'); } }),
    /clip_too_large/,
  );
});

test('compareModels: 가짜 응답으로 모델 순위와 실패 집계', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'asr-'));
  writeFileSync(join(dir, 'clips.csv'), 'file,reference\n1.wav,good morning\n2.wav,see you\n');
  writeFileSync(join(dir, '1.wav'), Buffer.from([0, 1, 2]));
  writeFileSync(join(dir, '2.wav'), Buffer.from([9, 9, 9]));
  const fakeBody = new Map();
  const fake = async (url, init) => {
    fakeBody.set(url, init.body[0]);
    if (url.endsWith('/perfect')) {
      // 클립 바이트 첫 값으로 정답 문장을 고른다 (0 → 첫 클립, 9 → 둘째 클립)
      const first = (fakeBody.get(url) ?? 0);
      return { ok: true, json: async () => ({ text: first === 9 ? 'See you!' : 'Good morning' }) };
    }
    return { ok: false, status: 503, json: async () => ({}) };
  };
  const rows = await compareModels({ clipsDir: dir, models: ['bad', 'perfect'], token: 't', fetchImpl: fake, base: 'https://x' });
  assert.equal(rows[0].model, 'perfect');
  assert.equal(rows[0].meanWer, 0);
  assert.equal(rows[0].clips, 2);
  assert.equal(rows[1].clips, 0);
  assert.equal(rows[1].failed, 2);
});
