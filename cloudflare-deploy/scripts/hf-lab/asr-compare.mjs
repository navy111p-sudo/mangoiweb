// 동의받은 짧은 샘플(clips.csv: file,reference)을 여러 ASR 모델에 넣어 WER 을 비교한다.
// English: offline model comparison runner. Needs HF_API_TOKEN; never called by the app.
// Usage: HF_API_TOKEN=... node scripts/hf-lab/asr-compare.mjs <clips_dir> <model1,model2,...>
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { meanWer, wer } from './asr-wer.mjs';

// 추론 엔드포인트는 HF 가 바꿀 수 있으므로 환경변수로 덮어쓴다 (실측 전 기본값 — 미검증).
// English: default base URL is unverified from this container; override with HF_INFERENCE_BASE.
export const DEFAULT_BASE = 'https://router.huggingface.co/hf-inference/models';
const MAX_BYTES = 2 * 1024 * 1024; // 문서 규칙: 짧은 클립 2MB 이하

/** CSV(헤더 없이 file,reference 또는 헤더 file,reference) 파싱. 쉼표가 든 정답은 따옴표로 감싼다. */
export function parseManifest(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(/^("?)(.*?)\1,(.*)$/);
    if (!m) continue;
    const file = m[2].trim();
    const reference = m[3].replace(/^"|"$/g, '').trim();
    if (file === 'file') continue; // 헤더 행 건너뛰기
    rows.push({ file, reference });
  }
  return rows;
}

/** 한 모델에 오디오 한 개를 보내 텍스트를 받는다. fetchImpl 은 테스트에서 바꿔 끼운다. */
export async function transcribe({ model, audio, token, base = DEFAULT_BASE, fetchImpl = fetch, timeoutMs = 15000 }) {
  if (audio.byteLength > MAX_BYTES) throw new Error('clip_too_large');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: audio,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`hf_http_${res.status}`);
    const body = await res.json();
    return String(body?.text ?? '');
  } finally {
    clearTimeout(timer);
  }
}

/** 모델별 평균 WER 표를 만든다. 실패한 클립은 건너뛰고 실패 횟수를 따로 센다. */
export async function compareModels({ clipsDir, models, token, fetchImpl, base }) {
  const manifest = parseManifest(readFileSync(join(clipsDir, 'clips.csv'), 'utf8'));
  const report = [];
  for (const model of models) {
    const pairs = [];
    let failed = 0;
    for (const { file, reference } of manifest) {
      const path = join(clipsDir, basename(file));
      if (!existsSync(path)) { failed++; continue; }
      try {
        const hyp = await transcribe({ model, audio: readFileSync(path), token, fetchImpl, base });
        pairs.push([reference, hyp]);
      } catch {
        failed++;
      }
    }
    report.push({ model, clips: pairs.length, failed, meanWer: meanWer(pairs) });
  }
  return report.sort((a, b) => (a.meanWer ?? 1) - (b.meanWer ?? 1));
}

// CLI 진입점
if (import.meta.url === `file://${process.argv[1]}`) {
  const [clipsDir, modelsArg] = process.argv.slice(2);
  const token = process.env.HF_API_TOKEN;
  if (!clipsDir || !modelsArg) { console.error('usage: asr-compare.mjs <clips_dir> <models,csv>'); process.exit(2); }
  if (!token) { console.error('HF_API_TOKEN 이 없습니다 (HF_API_TOKEN is not set).'); process.exit(2); }
  const rows = await compareModels({ clipsDir, models: modelsArg.split(','), token, base: process.env.HF_INFERENCE_BASE || undefined });
  console.table(rows.map((r) => ({ ...r, meanWer: r.meanWer === null ? 'n/a' : (r.meanWer * 100).toFixed(1) + '%' })));
}
