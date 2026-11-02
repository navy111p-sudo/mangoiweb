// 교정 품질 비교 (보고서 6장 D) — 실제 학생 문장 샘플을 여러 오픈 LLM 에 넣고
// 정답 교정과 얼마나 맞는지 본다. 네트워크·HF 토큰이 있을 때만 실행된다.
// English: offline-first comparison runner. Never called by the app; no route wiring.
// Usage: HF_API_TOKEN=... node scripts/hf-lab/correction-compare.mjs <samples.jsonl> <model1,model2,...>
// samples.jsonl 한 줄 = {"student":"...", "reference":"..."}  (동의받은 샘플 또는 가공 문장만)
import { readFileSync } from 'node:fs';
import { tokenize } from './asr-wer.mjs';

export const DEFAULT_CHAT_BASE = 'https://router.huggingface.co/v1/chat/completions';
const MAX_SAMPLE_CHARS = 300; // 아이 문장은 짧다. 긴 입력은 샘플 실수로 본다.

/** 정답과 같은 교정인가: 구두점·대소문자·공백을 무시한 낱말 열 비교. */
export function sameCorrection(a, b) {
  const ta = tokenize(a), tb = tokenize(b);
  return ta.length > 0 && ta.join(' ') === tb.join(' ');
}

/** 모델 답에서 교정 문장만 꺼낸다. 여러 줄이면 첫 줄, 따옴표는 벗긴다. */
export function extractCorrection(reply) {
  const first = String(reply ?? '').split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? '';
  return first.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
}

/** 샘플 JSONL 을 읽는다. 잘못된 줄은 건너뛰고 개수를 함께 돌려준다. */
export function parseSamples(text) {
  const rows = [];
  let skipped = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      const student = String(o.student ?? '');
      const reference = String(o.reference ?? '');
      if (!student || !reference || student.length > MAX_SAMPLE_CHARS) { skipped++; continue; }
      rows.push({ student, reference });
    } catch { skipped++; }
  }
  return { rows, skipped };
}

/** 한 모델에 한 문장을 보내 교정을 받는다. fetchImpl 은 테스트에서 바꿔 끼운다. */
export async function correctOne({ model, student, token, base = DEFAULT_CHAT_BASE, fetchImpl = fetch, timeoutMs = 20000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 60,
        messages: [
          { role: 'system', content: 'You correct English sentences written by young learners. Reply with the corrected sentence only, nothing else.' },
          { role: 'user', content: student },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`hf_http_${res.status}`);
    const body = await res.json();
    return extractCorrection(body?.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timer);
  }
}

/** 모델별 정답 일치율. 실패한 문장은 분모에서 뺀다. */
export async function compareCorrections({ rows, models, token, fetchImpl, base }) {
  const report = [];
  for (const model of models) {
    let ok = 0, n = 0, failed = 0;
    for (const { student, reference } of rows) {
      try {
        const got = await correctOne({ model, student, token, fetchImpl, base });
        n++;
        if (sameCorrection(got, reference)) ok++;
      } catch {
        failed++;
      }
    }
    report.push({ model, samples: n, failed, match: n ? ok / n : null });
  }
  return report.sort((a, b) => (b.match ?? -1) - (a.match ?? -1));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, modelsArg] = process.argv.slice(2);
  const token = process.env.HF_API_TOKEN;
  if (!file || !modelsArg) { console.error('usage: correction-compare.mjs <samples.jsonl> <models,csv>'); process.exit(2); }
  if (!token) { console.error('HF_API_TOKEN 이 없습니다 (HF_API_TOKEN is not set).'); process.exit(2); }
  const { rows, skipped } = parseSamples(readFileSync(file, 'utf8'));
  if (skipped) console.warn(`건너뛴 줄 ${skipped}개 (skipped lines)`);
  const out = await compareCorrections({ rows, models: modelsArg.split(','), token, base: process.env.HF_CHAT_BASE || undefined });
  console.table(out.map((r) => ({ ...r, match: r.match === null ? 'n/a' : (r.match * 100).toFixed(1) + '%' })));
}
