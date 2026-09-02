/**
 * textbook-ocr.ts — 교재 이미지에서 «영어 본문» 을 뽑을 수 있는가 (판정 정본)
 *
 * [왜 생겼나] 2026-09-02. 복습퀴즈·웜업·판단력 훈련의 원료가 될 «교재 본문» 이
 *   이 저장소에 **한 글자도 없다.** `textbook_files` 는 **활성 17,246행 중 이미지 17,199장**
 *   이고 `description` 이 채워진 행은 **0건**이다(2026-09-02 D1 실측 — 전체 행은 38,998이고
 *   절반 넘게 숨김 처리돼 있다). 그래서 AI 가 만드는 문항이 교재와 무관하다.
 *
 * ⚠️ 이 파일은 «본격 추출» 이 아니라 **«될지 안 될지 재 보는 시험»** 이다.
 *   결과를 D1 에 쓰지 않는다 — 되는 것이 확인된 뒤에 저장을 설계하는 것이 순서다.
 *   (기능은 만들어 놓고 실사용이 0인 채로 방치되는 것이 이 저장소의 반복 사고다.)
 *
 * 🔴 «비전 모델이 이 계정에서 도는지» 는 아직 아무도 모른다 (2026-09-02 실측).
 *   [잰 것] `approval_requests` 는 2건이고 **파일 첨부가 0건**이다(2026-09-02 D1 실측).
 *   [거기서 내린 판단] ⟹ **영수증 OCR 경로**(`api-approval.ts`)는 한 번도 돌아 본 적이 없다.
 *   ⚠️ 칠판 OCR(`index.ts handleWbOcr`)은 **이 근거로 말할 수 없다** — 흔적을 남기지 않고,
 *      게다가 CLOVA 가 설정돼 있으면 비전 모델을 아예 안 탄다. 즉 「비전 모델이 도는가」는
 *      **어느 쪽으로도 확인되지 않았다.**
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
/* 🔴 «강한 신호» 만 잡는다 — 약한 낱말(picture·photo·page·text)은 교재 본문에 흔하다.
 *    함정 대조 검사가 실측으로 잡아 준 것들(전부 초등 교재에 실제로 나오는 문장):
 *      "I can see a picture." · "The picture shows a dog." · "The photo shows my family."
 *      "Here is the page number." · "I cannot read the sign."
 *    처음 판이 이것들을 전부 «설명문» 으로 판정했고, `judgeOcrText` 는 설명문이면
 *    **그 장의 본문을 통째로 버리므로**(lines=[]) 첫 줄 하나에 한 페이지가 날아갔다.
 *    그 값이 곧 화면의 「영어 낱말 평균」= 이 시험의 유일한 결론 지표다. */
const STRONG = '(?:image|screenshot|transcription|transcript)';   // 교재 본문에 거의 안 나온다
const WEAK   = '(?:picture|photo|page|document)';                 // 교재에도 흔하다 — 단독으로는 신호가 못 된다
const META_OBJ = '(?:text|words|sentences|worksheet|page|image|writing|content|paragraph)';

const PROSE_HEAD = new RegExp(
  '^(?:'
  // 「The image shows…」 — 강한 낱말은 그 자체로 «이미지를 가리킨다»
  + '(?:the|this)\\s+' + STRONG + '\\b'
  // 「This picture shows a worksheet」 — 약한 낱말은 «메타 목적어» 가 함께 있을 때만.
  //   ⛔ 「The picture shows a dog.」(교재)는 여기서 걸리지 않는다
  + '|(?:the|this)\\s+' + WEAK + '\\s+(?:shows|contains|displays|depicts)\\s+(?:a\\s+|an\\s+|the\\s+|\\d+\\s+)?(?:\\w+\\s+){0,2}' + META_OBJ + '\\b'
  // 「It appears to be a worksheet」 — 「It looks good.」(교재)와 갈린다
  + '|it\\s+(?:appears|seems)\\s+to\\s+be\\s+(?:a|an|the)\\s+(?:\\w+\\s+){0,2}(?:image|picture|photo|page|worksheet|document|screenshot|scan)\\b'
  // 「Here is the transcription:」 — 「Here is the page number.」(교재)와 갈린다
  + '|here(?:\'s|\\s+is)\\s+(?:the\\s+)?(?:transcription|transcript|text|content|what)\\b'
  // 「Transcription:」·「The text reads:」 — 콜론으로 끝나는 머리말
  + '|(?:transcription|transcribed\\s+text|the\\s+text\\s+reads?)\\s*:'
  // 「I can see a page with the words…」 — 「I can see a picture.」(교재)와 갈린다
  + '|i\\s+(?:can\\s+)?see\\s+(?:the\\s+)?text\\b'
  + '|i\\s+(?:can\\s+)?see\\s+[^.!?]{0,40}?(?:with\\s+the\\s+words|that\\s+says|of\\s+text|in\\s+the\\s+image|on\\s+the\\s+page)\\b'
  // 「I cannot read the text in this image」 — 「I cannot read the sign.」(교재)와 갈린다
  + '|i\\s+(?:cannot|can\'t|am\\s+unable\\s+to)\\s+(?:read|see|make\\s+out)\\s+(?:the\\s+)?(?:text|words|anything|this|it)\\b'
  // 「Sure! Here is…」 — 「Of course, I will help you.」(교재)와 갈린다
  //   ⛔ 여기에 「i'll|i will」 을 넣지 말 것 — 바로 그 교재 문장이 걸린다
  + '|(?:sure|of\\s+course|certainly)[,!.]?\\s+(?:here(?:\'s|\\s+is)|the\\s+text)\\b'
  + ')', 'i');

export function looksLikeProse(raw: unknown): boolean {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return false;
  return PROSE_HEAD.test(s.split(/\r?\n/)[0].trim());

}

/** 교재 한 줄의 길이 상한.
 *  ⚠️ 웜업 80·게임 90·단어장 30 과 **통일하지 말 것** — 자리마다 다르다는 것이
 *     `english-only.ts` 의 명시된 규칙이다. 여기는 「교재 한 문단이 한 줄로 올 수
 *     있다」를 감안해 넉넉히 잡고, 그래도 넘친 줄은 세어서 화면에 알린다. */
export const LINE_MAX = 400;

/** OCR 결과에서 «쓸 수 있는 영어 줄» 만 골라낸다.
 *  ⚠️ `isEnglishText` 를 결과 «전체» 에 걸면 안 된다 — 그 함수는 ASCII 인쇄가능
 *     문자만 통과시키므로 줄바꿈(\n) 하나에 통째로 탈락한다. 교재는 여러 줄이다.
 *     그리고 줄 단위로 보는 것이 뜻에도 맞다(교재 한 줄 = 문장 하나).
 *  ⚠️ 상한 200 은 교재 한 줄 기준이다. 웜업 80·게임 90·단어장 30 과 «통일하지 말 것» —
 *     자리마다 다르다는 것이 english-only.ts 의 명시된 규칙이다. */
export function englishLines(raw: unknown, maxLen = LINE_MAX): string[] {
  return splitEnglishLines(raw, maxLen).lines;
}

/** 위와 같은 일을 하되 «왜 버렸는지» 를 함께 돌려준다.
 *  ⚠️ 길이 상한은 이 시험의 가설과 **반대 방향으로 위험하다** —
 *     사장님 정보가 「높은 레벨은 글자가 많다」이고, `OCR_PROMPT` 가 원래 줄바꿈을
 *     지키라고 하므로 지문 한 문단이 **한 줄로** 올 수 있다. 그 줄이 상한을 넘으면
 *     통째로 사라져 **글자가 많을수록 더 많이 깎인다** ⟹ 「높은 권도 낱말이 적네」라는
 *     정반대 결론이 난다. 그래서 상한에 걸린 줄 수를 세어 화면이 말하게 한다.
 *  ⛔ 이 숫자를 «오류» 로 그리지 말 것 — 사실을 알려 주는 것이지 실패가 아니다. */
export function splitEnglishLines(raw: unknown, maxLen = LINE_MAX): { lines: string[]; tooLong: number } {
  const s = String(raw == null ? '' : raw);
  const out: string[] = [];
  let tooLong = 0;
  for (const line of s.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (!isEnglishText(t, maxLen)) {
      // 「길어서」 떨어진 것과 「영어가 아니라서」 떨어진 것을 가른다
      if (t.length > maxLen && isEnglishText(t.slice(0, maxLen), maxLen)) tooLong++;
      continue;
    }
    out.push(t);
  }
  return { lines: out, tooLong };
}

/** 같은 줄이 되풀이된 비율 (0~1).
 *  🔴 **비전 모델은 못 읽으면 «같은 문장을 계속 토합니다».** 2026-09-02 실측:
 *     LLaVA 가 한 장에서 84줄·647낱말을 64초 동안 뱉었는데 내용은 몇 줄의 반복이었다.
 *     그것을 그대로 세면 «제일 많이 뽑은 엔진» 이 되어 **낱말 평균이 부풀려지고**,
 *     「이 교재는 글자가 많다」는 거짓 결론이 난다 — 이 시험의 결론 지표가 바로 그 숫자다.
 *  ⚠️ 교재에는 «일부러 반복되는» 줄이 실제로 있다(노래 가사의 후렴).
 *     그래서 «반복이 있으면 실패» 로 판정하지 않고 **비율을 재서 화면이 말하게** 한다 —
 *     사람이 원문과 나란히 보고 판단하는 것이 이 시험의 방식이다. */
export function repeatRatio(lines: string[]): number {
  if (lines.length < 4) return 0;   // 짧으면 반복이 의미 없다
  const seen = new Set(lines.map(l => l.trim().toLowerCase()));
  return Math.round((1 - seen.size / lines.length) * 100) / 100;
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
  /** 영어인데 «너무 길어» 버린 줄 수 — 조용히 사라지면 높은 권을 과소평가한다 */
  too_long: number;
  /** 같은 줄이 되풀이된 비율 — 높으면 «못 읽고 반복해 토한» 것이다 */
  repeat: number;
  /** 되풀이를 걷어낸 낱말 수 — 평균은 이 값으로 세야 부풀려지지 않는다 */
  unique_words: number;
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
  const split = (prose || isNone) ? { lines: [] as string[], tooLong: 0 } : splitEnglishLines(text);
  const lines = split.lines;
  const lineTotal = text ? text.split(/\r?\n/).filter(l => l.trim()).length : 0;
  return {
    engine: engine.id,
    label: engine.label,
    ok: !error && lines.length > 0,
    raw: text.slice(0, 4000),
    lines,
    words: countEnglishWords(lines),
    line_total: lineTotal,
    too_long: split.tooLong,
    repeat: repeatRatio(lines),
    /* 화면의 「영어 낱말 평균」은 이 값을 쓴다 — 반복을 그대로 세면 못 읽은 엔진이 이긴다 */
    unique_words: countEnglishWords([...new Set(lines.map(l => l.trim()))]),
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
  /* 🔴 비용 상한은 «부르는 쪽» 이 아니라 **정본이** 든다.
   *    `ocrEngineById` 가 모르는 id 는 걸러 내지만 **같은 id 를 여러 번** 넣는 것은
   *    안 걸렀다 — 실측(함정 대조 검사): `engines` 에 같은 id 500개를 넣으니
   *    모델을 **500번** 불렀다. 화면의 「장 수 ≤ 20」 클램프는 클라이언트 전용이라
   *    근거가 못 되고, 라우트 주석의 「한 요청 = 엔진 수만큼」 약속이 본문 한 줄로 깨진다.
   *    ⇒ 중복을 없애고 엔진 목록 길이로 자른다(그보다 많을 수가 없다). */
  const list = (engineIds && engineIds.length)
    ? ([...new Set(engineIds.map(String))]
        .map(ocrEngineById).filter(Boolean) as OcrEngine[]).slice(0, OCR_ENGINES.length)
    : OCR_ENGINES;
  const out: OcrProbeResult[] = [];
  for (const e of list) out.push(await runOcrEngine(AI, kv, e, bytes, mime));
  return out;
}

/* ── 입구 게이트 ─────────────────────────────────────────────────
 * 🔴 **순수 함수로 뺀 이유**: 이 판정들이 라우트 안에만 있으면 하니스가 «문자열로»
 *    검사하게 되고, 그러면 조건을 `!==` → `===` 로 뒤집어도 그 글자가 그대로 남아
 *    **통과한다**(함정 대조 검사가 실제로 그 헛돎을 지적했다). 하필 그 자리가
 *    **비용을 지키는 자리**다 — 여기서 새면 모델 호출이 그대로 돈이 된다.
 *    ⟹ 라우트는 이 함수를 «부르기만» 하고, 하니스는 이 함수를 **실제로 돌린다.** */

export type OcrGateInput = {
  action: unknown;
  mime: unknown;
  ext: unknown;
  /** D1 의 size_bytes. ⚠️ NOT NULL 이 아니라 **NULL 일 수 있다** */
  sizeBytes: unknown;
  /** R2 에서 실제로 받은 바이트 길이. 있으면 이것도 함께 본다 */
  actualBytes?: number;
};

/** 3MB. 교재 이미지 실측 평균 167KB(2026-09-02 D1) 인데 PDF 는 6MB 를 넘는다. */
export const OCR_MAX_BYTES = 3_000_000;

/** 통과면 null, 막으면 {error, message, status}. */
export function ocrGate(inp: OcrGateInput): { error: string; message: string; status: number } | null {
  if (String(inp.action == null ? '' : inp.action) !== 'ocr_probe') {
    return { error: 'unknown_action', message: 'action 은 ocr_probe 여야 합니다.', status: 400 };
  }
  const mime = String(inp.mime == null ? '' : inp.mime);
  const ext = String(inp.ext == null ? '' : inp.ext).toLowerCase();
  if (!/^image\//.test(mime) && !/^(jpg|jpeg|png|webp|gif)$/.test(ext)) {
    return { error: 'not_an_image', message: '이미지 파일만 시험할 수 있습니다(PDF 는 제외).', status: 400 };
  }
  /* ⚠️ `size_bytes` 가 NULL 이면 이 검사를 그냥 통과한다(스키마상 NOT NULL 이 아니다).
   *    그래서 R2 에서 «실제로 받은» 길이도 함께 본다 — 둘 중 큰 쪽으로 판정한다. */
  const declared = Number(inp.sizeBytes || 0);
  const actual = Number(inp.actualBytes || 0);
  const size = Math.max(isFinite(declared) ? declared : 0, isFinite(actual) ? actual : 0);
  if (size > OCR_MAX_BYTES) {
    return { error: 'too_large', message: '3MB 를 넘는 파일은 시험하지 않습니다.', status: 413 };
  }
  return null;
}
