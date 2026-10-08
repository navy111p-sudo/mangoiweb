/* ═══════════════════════════════════════════════════════════════════════
 * ✋ class-ask.ts — A.i 선생님 수업(/ai-class.html)의 «학생 질문 → Lily 즉답» 정본
 *                  (2026-10-08, 사장님 「학생이 물어보면 바로 바로 아바타 선생님이 대답」
 *                   → B안(수업 전용 API) · 「누구나, 하루 상한」 선택)
 *
 * [무엇을] POST /api/ai/class-ask  { q, title?, lines?:string[], name? }
 *          → { ok:true, en, ko }  ·  막히면 { ok:false, error:'daily_cap' | 'ai_unavailable' | … }
 * [왜 따로] AI 영어친구(/api/ai/chat-friend)는 로그인 토큰이 있어야 하고 그 대화 기록에 섞입니다.
 *          이 수업은 로그인 없이도 열리는 시범 주소라, «지금 보고 있는 교재 쪽» 을 문맥으로 받는
 *          짧은 즉답 전용 길을 둡니다. 기록(D1)은 남기지 않습니다 — 학생 질문 원문을 저장할 곳이 아닙니다.
 *
 * ⛔ 상한 판정(classAskAllowed·classAskCapKey)을 라우트 안에 복제하지 마세요 —
 *    CLAUDE.md 2장 「비용이 나가는 API」: 라우트 안에 두면 조건을 뒤집어도 문자열 검사가 통과합니다.
 * ⚠️ 이 상한은 «한 회선(IP)» 을 KV 로 셉니다 — KV 는 정확한 카운터가 아니고(쓰기 초당 1회·읽기 60초 캐시),
 *    IP 를 바꾸면 그대로 나갑니다. 한계는 voice-tts-cap.ts 머리말과 같습니다.
 * ⚠️ 모델이 실패하면 «답인 척» 하는 고정 문구를 주지 않습니다(ai_unavailable) —
 *    CLAUDE.md 「AI 가 답을 못 만들었을 때 명랑한 고정 문구로 자리를 메울 때」.
 * ═══════════════════════════════════════════════════════════════════════ */

/** 한 IP 가 하루(KST)에 물을 수 있는 횟수. 학원 한 곳이 IP 하나를 나눠 쓰는 경우를 생각해 넉넉히. */
export const CLASS_ASK_MAX_PER_IP_DAY = 200;
export const CLASS_ASK_MAX_Q = 200;          // 질문 글자 수 상한
export const CLASS_ASK_MAX_LINES = 14;       // 문맥으로 받는 교재 줄 수 상한
export const CLASS_ASK_MAX_LINE = 160;       // 한 줄 글자 수 상한

/** 오늘 `used` 번 물은 IP 에게 한 번 더 허락할 것인가. 못 세면(KV 장애·이상한 값) 막지 않습니다(fail-open). */
export function classAskAllowed(used: any, cap: number = CLASS_ASK_MAX_PER_IP_DAY): boolean {
  if (used === null || used === undefined || used === '') return true;
  const n = Number(used);
  if (!isFinite(n) || n < 0) return true;
  return n < cap;
}

/** 그 IP 의 «오늘» 카운터 키 — KST 자정에 새로 시작. */
export function classAskCapKey(ip: any, nowMs: any): string {
  const who = String(ip || '').trim() || 'unknown';
  const t = Number(nowMs);
  const day = isFinite(t) && t > 0 ? Math.floor((t + 9 * 3600000) / 86400000) : 0;
  return 'classaskcap:' + who + ':' + day;
}

/** 요청 본문을 다듬습니다. 질문이 비면 null. 줄은 개수·길이를 자르고 빈 줄은 뺍니다. */
export function cleanAsk(b: any): { q: string; title: string; lines: string[]; name: string } | null {
  const one = (s: any, n: number) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const q = one(b && b.q, CLASS_ASK_MAX_Q);
  if (!q) return null;
  const raw = Array.isArray(b && b.lines) ? b.lines : [];
  const lines: string[] = [];
  for (const l of raw) {
    if (lines.length >= CLASS_ASK_MAX_LINES) break;
    const t = one(l, CLASS_ASK_MAX_LINE);
    if (t) lines.push(t);
  }
  // 이름은 영문 한 낱말만(프롬프트에 그대로 들어가므로) — 아니면 비웁니다
  const nm = one(b && b.name, 20);
  const name = /^[A-Za-z][A-Za-z .'-]{0,19}$/.test(nm) && nm.toLowerCase() !== 'friend' ? nm : '';
  return { q, title: one(b && b.title, 80), lines, name };
}

/** 모델에게 보낼 메시지. 출력 계약은 «EN: …» 한 줄 + «KO: …» 한 줄. */
export function buildClassAskMessages(a: { q: string; title: string; lines: string[]; name: string }): Array<{ role: string; content: string }> {
  const page = a.lines.length ? a.lines.map((l) => '- ' + l).join('\n') : '(no text on this page)';
  const sys = [
    'You are Lily, a warm, patient English teacher in a one-to-one video lesson with a Korean child.',
    'The child just asked you a question in the middle of the lesson. Answer it right away.',
    'Lesson: ' + (a.title || 'English textbook lesson') + '.',
    'The textbook page on the screen right now:',
    page,
    'Rules:',
    '1. Answer in simple, correct English for a young beginner: at most 2 short sentences, at most 25 words in total. Grammar must be correct — never drop small words like a, the, to, is.',
    '2. If the question is about a word or sentence on the page, explain its meaning simply, and give one tiny example if it helps.',
    '3. The child may ask in Korean. Still answer in English, and the Korean line gives the meaning.',
    '4. If the question has nothing to do with English or the lesson, answer kindly in one sentence and invite the child back to the page.',
    '5. Never ask for or mention personal information (address, phone, school name). Never discuss anything unsafe for children.',
    '6. Reply in EXACTLY this format, two lines, nothing else:',
    'EN: <your English answer>',
    'KO: <natural Korean translation of your English answer, using polite friendly 해요체>',
  ].join('\n');
  const user = (a.name ? 'Student (' + a.name + ') asks: ' : 'Student asks: ') + a.q;
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}

/** Workers AI 응답 → 글자. 객체로 오는 경우까지(CLAUDE.md 「[object Object]」 함정). */
export function aiText(r: any): string {
  const v = r && typeof r === 'object' ? (r.response ?? (r.result && r.result.response) ?? r.result) : r;
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return ''; }
}

const HANGUL = /[가-힣ㄱ-ㆎ]/;

/** 모델 출력에서 en·ko 를 꺼냅니다. 영어 답이 없으면 null(= 답인 척하지 않는다). */
export function parseClassAsk(raw: any): { en: string; ko: string } | null {
  const s = String(raw == null ? '' : raw).replace(/\r/g, '');
  if (!s.trim() || /\[object [A-Za-z]+\]/.test(s)) return null;
  let en = '', ko = '';
  for (const line of s.split('\n')) {
    const m = line.match(/^\s*\**\s*(EN|KO)\s*\**\s*[:：]\s*\**\s*(.*)$/i);
    if (!m) continue;
    if (m[1].toUpperCase() === 'EN' && !en) en = m[2].trim();
    else if (m[1].toUpperCase() === 'KO' && !ko) ko = m[2].trim();
  }
  if (!en) {
    // 형식을 안 지켰을 때 — 한글이 없는 첫 줄만 영어 답으로 인정합니다
    const first = s.split('\n').map((x) => x.trim()).find((x) => x && !HANGUL.test(x) && !/^\{/.test(x));
    en = first || '';
  }
  const strip = (x: string) => x.replace(/^["'“”]+|["'“”]+$/g, '').replace(/\s+/g, ' ').trim();
  en = strip(en); ko = strip(ko);
  // 영어 답 안에 한글이 섞이면 영어 TTS 가 한글을 읽습니다 — 한글 괄호를 떼고, 그래도 남으면 버립니다
  en = en.replace(/\s*[(（][^)）]*[가-힣][^)）]*[)）]/g, '').trim();
  if (!en || HANGUL.test(en) || !/[A-Za-z]/.test(en)) return null;
  if (en.length > 260) en = en.slice(0, 260).replace(/\s+\S*$/, '') + '…';
  if (ko && !HANGUL.test(ko)) ko = '';
  if (ko.length > 200) ko = ko.slice(0, 200) + '…';
  return { en, ko };
}

export const CLASS_ASK_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct',
];

/** 라우트 본체 — api-ai.ts 는 이것을 «부르기만» 합니다. */
export async function handleClassAsk(request: Request, env: any, deps: {
  json: (o: any, s?: number) => Response;
  recordFailure?: (f: any) => Promise<void>;
}): Promise<Response> {
  const { json } = deps;
  const b: any = await request.json().catch(() => ({}));
  const a = cleanAsk(b);
  if (!a) return json({ ok: false, error: 'q_required' }, 400);
  if (!env.AI) return json({ ok: false, error: 'ai_unavailable' }, 503);

  // 💸 하루 상한 — 부르기 «전» 에 셉니다(동시 요청이 서로를 보게)
  const capKey = classAskCapKey(request.headers.get('cf-connecting-ip'), Date.now());
  let used: any = null;
  try { used = await env.SESSION_STATE?.get?.(capKey); } catch {}
  if (!classAskAllowed(used)) return json({ ok: false, error: 'daily_cap' }, 429);
  try { await env.SESSION_STATE?.put?.(capKey, String((Number(used) || 0) + 1), { expirationTtl: 172800 }); } catch { /* KV 장애로 막지 않음 */ }

  const msgs = buildClassAskMessages(a);
  let lastErr: any = null, plain = 0;
  for (const m of CLASS_ASK_MODELS) {
    try {
      const r = await env.AI.run(m, { messages: msgs, max_tokens: 220, temperature: 0.4 });
      const out = parseClassAsk(aiText(r));
      if (out) return json({ ok: true, en: out.en, ko: out.ko });
      plain++;
    } catch (e: any) {
      lastErr = e;
      console.error('[class-ask] model failed:', m, e?.message || e);
    }
  }
  // ⛔ 질문 원문은 기록하지 않습니다(무엇이 실패했나만)
  try {
    await deps.recordFailure?.({ feature: 'class-ask', models: CLASS_ASK_MODELS.join(','), err: String(lastErr?.message || lastErr || 'unparsable'), rf: 0, plain, empty: 0, level: '' });
  } catch {}
  return json({ ok: false, error: 'ai_unavailable' }, 503);
}
