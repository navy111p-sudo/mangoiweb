/**
 * textbook-ocr.ts — 교재 이미지에서 «영어 본문» 을 뽑을 수 있는가 (판정 정본)
 *
 * [왜 생겼나] 2026-09-02. 복습퀴즈·웜업·판단력 훈련의 원료가 될 «교재 본문» 이
 *   이 저장소에 **한 글자도 없다.** `textbook_files` 12,000여 장이 전부 이미지이고
 *   `description` 도 전부 NULL 이다. 그래서 AI 가 만드는 문항이 교재와 무관하다.
 *
 * ⚠️ 이 파일은 «본격 추출» 이 아니라 **«될지 안 될지 재 보는 시험»** 이다.
 *   결과를 D1 에 쓰지 않는다 — 되는 것이 확인된 뒤에 저장을 설계하는 것이 순서다.
 *   (기능은 만들어 놓고 실사용이 0인 채로 방치되는 것이 이 저장소의 반복 사고다.)
 *
 * 🔴 «비전 모델이 이 계정에서 도는지» 는 아직 아무도 모른다 (2026-09-02 실측).
 *   저장소에 비전 호출이 두 곳 있지만(`api-approval.ts` 영수증 · `index.ts` 칠판)
 *   결재는 2건뿐이고 **파일 첨부가 0건** 이라 그 경로는 한 번도 돌아 본 적이 없다.
 *   그래서 이 시험의 첫 항목이 「어느 엔진이 도는가」이고, 그래서 엔진을 **하나만
 *   고르지 않고 여러 개를 같은 장에 나란히** 돌린다. 하나가 죽어도 나머지 답이 남는다.
 *
 * ⛔ 판정을 «사람 눈» 에만 맡기지 않는다 — 뽑힌 글자를 기계로도 잰다.
 *   비전 모델의 전형적인 실패는 «못 읽는 것» 이 아니라 **«설명문을 토하는 것»** 이다
 *   (「The image shows a page with some text」). 그것을 성공으로 세면 「OCR 이 된다」는
 *   결론이 통째로 거짓이 된다. `looksLikeProse()` 가 그 자리다.
 *
 * 📌 사장님 정보(2026-09-02) — 「BTS 교재는 레벨에 따라 글자 수가 다르다.
 *   낮은 레벨은 적고 높은 레벨은 많다.」 ⟹ **낮은 권 하나로만 시험하면
 *   「OCR 해도 소용없다」는 잘못된 결론이 난다.** 그래서 화면이 낮은 권과 높은 권을
 *   각각 돌리고, 여기서는 «영어 낱말 수» 를 재서 그 차이가 숫자로 보이게 한다.
 */

import { isEnglishText } from './english-only';

/* ── 엔진 목록 ──────────────────────────────────────────────────
 * ⚠️ 순서가 «폴백 순서» 가 아니다 — 시험이므로 **전부** 돌려 나란히 비교한다.
 *    (본격 추출로 갈 때 이 결과를 보고 하나를 고르는 것이 순서다.)
 * ⚠️ `image: number[]` 는 이 저장소가 이미 쓰는 구형 입력 방식이다
 *    (`api-approval.ts` readReceipt · `index.ts` handleWbOcr). 신형 모델은
 *    messages + image_url 을 쓰므로 `shape` 로 갈라 둔다 — 한 모양만 지원하면
 *    «신형이 되는데 안 되는 것으로» 판정하게 된다. */
export type OcrEngineShape = 'bytes' | 'messages';

export type OcrEngine = { id: string; label: string; shape: OcrEngineShape; note?: string };

export const OCR_ENGINES: OcrEngine[] = [
  // 이 저장소가 이미 1순위로 쓰는 것. ⚠️ 라이선스 1회 동의가 필요하다(아래 agree 처리).
  { id: '@cf/meta/llama-3.2-11b-vision-instruct', label: 'Llama 3.2 Vision (11B)', shape: 'bytes', note: '기존 1순위 · 라이선스 동의 필요' },
  // 이 저장소의 2순위 폴백.
  { id: '@cf/llava-hf/llava-1.5-7b-hf', label: 'LLaVA 1.5 (7B)', shape: 'bytes', note: '기존 2순위' },
  // 신형. 글자가 많은 페이지에서 앞의 둘보다 나을 수 있어 함께 잰다.
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout (17B)', shape: 'messages', note: '신형 · 긴 본문 기대' },
];

export function ocrEngineById(id: unknown): OcrEngine | null {
  const s = String(id == null ? '' : id);
  return OCR_ENGINES.find(e => e.id === s) || null;
}

/* ── 프롬프트 ────────────────────────────────────────────────────
 * ⛔ 「무엇이 보이는지 설명해 줘」로 쓰지 말 것 — 그러면 모델이 반드시 설명문을 토한다.
 *    「글자만 그대로」를 여러 번, 서로 다른 말로 못 박는다. 그래도 토하므로
 *    `looksLikeProse()` 로 한 번 더 거른다(지시만으로는 안 지켜진다 — 이 저장소의 반복 실측). */
export const OCR_PROMPT =
  'You are an OCR engine. Transcribe ALL text that is printed in this textbook page image, exactly as written. ' +
  'Keep the original line breaks. Keep punctuation and capitalization. ' +
  'Do NOT describe the image. Do NOT explain. Do NOT add any words that are not printed on the page. ' +
  'Output ONLY the transcribed text. If the page has no readable text at all, output exactly: NONE';

/* ── 판정 ───────────────────────────────────────────────────────── */

/** 모델이 «읽지 않고 설명한» 것인가.
 *
 *  🔴 이 판정은 **양쪽으로 다 틀릴 수 있고, 두 방향의 대가가 똑같이 크다.**
 *     · 설명문을 본문으로 세면 → 「OCR 이 된다」가 거짓이 되고 그 위에 추출을 설계한다
 *     · 본문을 설명문으로 보면 → 「OCR 이 안 된다」가 거짓이 되고 이 길을 접는다
 *
 *  ⛔ 그래서 «시작하는 낱말» 만으로 가르지 않는다 — 교재 본문과 **구조가 똑같다**:
 *       설명문  "I can see a page with the words cat and dog."
 *       교재본문 "I can see a bird."          ← 실제로 BTS 에 나오는 문장이다
 *       설명문  "It appears to be a worksheet."
 *       교재본문 "It looks good."             ← 역시 교재 문장이다
 *       설명문  "Sure! Here is the text."
 *       교재본문 "Sure!" · "Of course, I will help you."   ← 교재 대화문에 나온다
 *       설명문  "The image shows…"
 *       교재본문 "The page is white."         ← 그래서 동사에 is·has 를 넣지 않는다
 *     (같은 뿌리: CLAUDE.md 「구조가 같은 문장은 낱말을 모르면 절대 못 가릅니다」)
 *
 *  ✅ 그래서 «이미지를 가리키는 낱말» 이나 «출력을 소개하는 말» 이 **함께** 있을 때만
 *     설명문으로 본다. 애매하면 **설명문이 아닌 쪽으로** 실패한다 —
 *     그때는 원문이 화면에 그대로 보이므로 사람이 눈으로 가릴 수 있다.
 *  ⚠️ 첫 줄만 본다. 교재 페이지는 여러 줄이고, 설명문은 첫 줄에서 정체가 드러난다. */
const MEDIA = '(image|picture|photo|screenshot|page|document|text)';
const PROSE_HEAD = new RegExp(
  '^(?:'
  // 「The image shows…」·「This picture contains…」 — 이미지를 «가리키고» 무엇을 한다
  + '(?:the|this)\\s+' + MEDIA + '\\s+(?:shows|contains|displays|depicts|appears|seems|looks\\s+like)\\b'
  // 「It appears to be a worksheet」 — 「It looks good」(교재 문장)과 갈린다
  + '|it\\s+(?:appears|seems)\\s+to\\s+be\\b'
  // 「Here is the text from the image」 — 「Here is my book」(교재 문장)과 갈린다
  + '|here(?:\'s| is)\\s+(?:the\\s+)?(?:' + MEDIA + '|transcription|transcribed|content|what)\\b'
  // 「I can see a page with…」 — 「I can see a bird」(교재 문장)과 갈린다
  + '|i\\s+(?:can\\s+)?see\\s+(?:a|an|the)?\\s*' + MEDIA + '\\b'
  + '|i\\s+(?:cannot|can\'t|am unable to)\\s+(?:read|see|make out)\\b'
  // 「Sure! Here is…」 — 「Sure!」 한 마디(교재 대화)와 갈린다
  + '|(?:sure|of\\s+course|certainly)[,!.]?\\s+(?:here(?:\'s|\\s+is)|the\\s+' + MEDIA + ')\\b'
  + ')', 'i');

export function looksLikeProse(raw: unknown): boolean {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return false;
  return PROSE_HEAD.test(s.split(/\r?\n/)[0].trim());
}

/** OCR 결과에서 «쓸 수 있는 영어 줄» 만 골라낸다.
 *  ⚠️ `isEnglishText` 를 결과 «전체» 에 걸면 안 된다 — 그 함수는 ASCII 인쇄가능
 *     문자만 통과시키므로 줄바꿈(\n) 하나에 통째로 탈락한다. 교재는 여러 줄이다.
 *     그리고 줄 단위로 보는 것이 뜻에도 맞다(교재 한 줄 = 문장 하나).
 *  ⚠️ 상한 200 은 교재 한 줄 기준이다. 웜업 80·게임 90·단어장 30 과 «통일하지 말 것» —
 *     자리마다 다르다는 것이 english-only.ts 의 명시된 규칙이다. */
export function englishLines(raw: unknown, maxLen = 200): string[] {
  const s = String(raw == null ? '' : raw);
  const out: string[] = [];
  for (const line of s.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (!isEnglishText(t, maxLen)) continue;
    out.push(t);
  }
  return out;
}

/** 영어 낱말 수 — 사장님 정보(레벨별 글자 양)를 숫자로 확인하는 핵심 지표. */
export function countEnglishWords(lines: string[]): number {
  let n = 0;
  for (const l of lines) {
    const m = l.match(/[A-Za-z][A-Za-z'’-]*/g);
    if (m) n += m.length;
  }
  return n;
}

export type OcrProbeResult = {
  engine: string;
  label: string;
  ok: boolean;
  /** 모델이 돌려준 날것 — 사람이 눈으로 볼 수 있어야 «왜 안 되는지» 를 판단한다 */
  raw: string;
  /** 쓸 수 있다고 판정한 영어 줄 */
  lines: string[];
  words: number;
  /** 날것의 줄 수 대비 영어로 인정된 줄 수 — 「한글·잡음이 얼마나 섞였나」 */
  line_total: number;
  prose: boolean;
  ms: number;
  error: string;
};

/** 결과 하나를 판정 — 모델 응답을 받아 «쓸 수 있는가» 까지 매긴다.
 *  분리해 둔 이유: 하니스가 AI 없이 이 함수만 돌려 판정을 검사할 수 있어야 한다. */
export function judgeOcrText(engine: OcrEngine, raw: unknown, ms: number, error = ''): OcrProbeResult {
  const text = String(raw == null ? '' : raw).trim();
  const isNone = /^none$/i.test(text);
  const prose = looksLikeProse(text);
  // 설명문이면 그 «내용» 을 본문으로 세지 않는다 — 세면 「OCR 이 된다」가 거짓이 된다.
  const lines = (prose || isNone) ? [] : englishLines(text);
  const lineTotal = text ? text.split(/\r?\n/).filter(l => l.trim()).length : 0;
  return {
    engine: engine.id,
    label: engine.label,
    ok: !error && lines.length > 0,
    raw: text.slice(0, 4000),
    lines,
    words: countEnglishWords(lines),
    line_total: lineTotal,
    prose,
    ms,
    error: error || '',
  };
}

/* ── 호출 ───────────────────────────────────────────────────────── */

type AnyAI = { run: (model: string, input: any) => Promise<any> };

/** llama-3.2-vision 은 라이선스 1회 동의가 필요하다.
 *  `index.ts handleWbOcr` 가 쓰는 방식 그대로 — KV 에 «동의함» 을 남겨 매번 안 부른다.
 *  ⚠️ 실패해도 그냥 넘어간다(이미 동의돼 있을 수도 있고, 여기서 막으면 시험 자체가 못 돈다). */
async function ensureLicense(AI: AnyAI, kv: any, model: string): Promise<void> {
  if (!/llama-3\.2-11b-vision/.test(model)) return;
  try {
    const key = 'tbocr:llama32v_agreed';
    const agreed = kv ? await kv.get(key) : '1';
    if (agreed) return;
    try { await AI.run(model, { prompt: 'agree' }); } catch { /* 동의 호출 자체는 실패해도 무해 */ }
    try { if (kv) await kv.put(key, '1'); } catch { /* KV 가 없어도 시험은 돈다 */ }
  } catch { /* 여기서 던지면 시험이 통째로 멈춘다 */ }
}

function pickText(r: any): string {
  if (r == null) return '';
  if (typeof r === 'string') return r;
  const direct = r.response ?? r.description ?? r.text ?? r.output_text;
  if (typeof direct === 'string') return direct;
  // messages 형태 응답
  const c = r?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x: any) => (typeof x === 'string' ? x : x?.text || '')).join('\n');
  return '';
}

/** 엔진 하나로 한 장을 읽는다. ⛔ 절대 던지지 않는다 — 한 엔진이 죽어도 나머지 답이 남아야 한다. */
export async function runOcrEngine(
  AI: AnyAI, kv: any, engine: OcrEngine, bytes: Uint8Array, mime: string, maxTokens = 1024,
): Promise<OcrProbeResult> {
  const t0 = Date.now();
  try {
    await ensureLicense(AI, kv, engine.id);
    let r: any;
    if (engine.shape === 'messages') {
      // data: URI 로 넘긴다 — 이 모양의 모델은 바이트 배열을 안 받는다.
      const b64 = bytesToBase64(bytes);
      r = await AI.run(engine.id, {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: OCR_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mime || 'image/jpeg'};base64,${b64}` } },
          ],
        }],
        max_tokens: maxTokens,
      });
    } else {
      r = await AI.run(engine.id, { image: Array.from(bytes), prompt: OCR_PROMPT, max_tokens: maxTokens });
    }
    return judgeOcrText(engine, pickText(r), Date.now() - t0);
  } catch (e: any) {
    return judgeOcrText(engine, '', Date.now() - t0, String(e?.message || e).slice(0, 300));
  }
}

/** ⚠️ btoa 는 문자열 하나를 통째로 받으므로 큰 이미지에서 «인자 너무 많음» 으로 죽는다.
 *  조각내서 이어 붙인다(교재 이미지 실측 평균 144KB · 최대 1.7MB). */
export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return btoa(s);
}

/** 한 장을 «여러 엔진으로» 읽어 나란히 돌려준다.
 *  ⛔ 병렬로 돌리지 않는다 — 뉴런 소진(429)을 한꺼번에 맞으면 어느 엔진이 되는지 못 가린다. */
export async function probeImage(
  AI: AnyAI, kv: any, bytes: Uint8Array, mime: string, engineIds?: string[],
): Promise<OcrProbeResult[]> {
  const list = (engineIds && engineIds.length)
    ? engineIds.map(ocrEngineById).filter(Boolean) as OcrEngine[]
    : OCR_ENGINES;
  const out: OcrProbeResult[] = [];
  for (const e of list) out.push(await runOcrEngine(AI, kv, e, bytes, mime));
  return out;
}
