/* ═══════════════════════════════════════════════════════════════════════
 * 📖 story-correct.ts — 영어 동화책 «바꿔 쓰기» 2단계: AI 한 번 더 보기 + 강사용 기록
 *                     (2026-10-13, 원장님 지적 1번 «완성하기 때 구조·철자 고쳐 주기» 의 2단계)
 *
 * [무엇을] POST /api/ai/write-history  { action: 'story_fix' | 'story_log', … }
 *   · story_fix — 규칙 점검(js/story-kit.js)을 통과한 문장을 AI 가 한 번 더 봅니다.
 *                 → { ok:true, changed, a, b, reasons:[{ko,en}] } · 못 보면 { ok:false, error:'ai_unavailable'|'daily_cap'|… }
 *   · story_log — 도장을 받은 문장을 «로그인한 학생» 에 한해 기록합니다(강사 인수인계 카드가 읽음).
 * [왜 그 주소] 새 경로는 src/index.ts(공동 금지구역) 허용목록에 한 줄을 더해야 합니다.
 *              /api/ai/write-history 는 이미 등록돼 있고 GET 만 쓰므로 «비어 있는 POST» 에 얹습니다
 *              (CLAUDE.md 2장 「새 API 추가」 2026-09-02 덧붙임). ⛔ 모르는 action 은 400 으로 거절합니다.
 *
 * ⛔ AI 답을 그대로 믿지 않습니다 — verifyStoryFix 가 «학생 낱말을 함부로 바꾸지 않았는가 · 문장 틀이 그대로인가»
 *    를 보고, 통과 못 하면 고친 문장을 보여 주지 않습니다(= 'unverified'). 아이가 그대로 따라 쓸 문장입니다.
 * ⛔ «왜 고쳤는지» 는 AI 가 아니라 결정론 설명기(correction-reason.ts)로 만듭니다.
 * ⛔ AI 가 실패하면 «틀린 곳 없음» 이라고 말하지 않습니다(ai_unavailable — 화면이 «지금은 확인하지 못했어요»).
 * ⛔ 상한 판정을 라우트 안에 복제하지 마세요 — 순수 함수(storyFixAllowed·storyCapKey)를 부르기만 합니다
 *    (CLAUDE.md 「비용이 나가는 API」). 기기당 하루 30회 + 회선(IP)당 300회(기기 id 를 바꿔 끼우는 것 대비).
 * ⚠️ KV 카운터는 정확하지 않습니다(쓰기 초당 1회·읽기 60초 캐시) — 짧은 폭주에는 약합니다(voice-tts-cap.ts 와 같은 한계).
 * ⚠️ 학생 아이디를 응답에 싣지 않습니다(CLAUDE.md 「공개 API 에 학생 아이디」).
 * ═══════════════════════════════════════════════════════════════════════ */
import { isEnglishText } from './english-only';
import { explainCorrection } from './correction-reason';

export const STORY_FIX_MAX_PER_DEVICE_DAY = 30;
export const STORY_FIX_MAX_PER_IP_DAY = 300;
export const STORY_LOG_MAX_PER_UID_DAY = 60;
export const STORY_PART_MAX = 80;
export const STORY_SENT_MAX = 200;
export type Slot = 'vp' | 'cl';

/** 오늘 `used` 번 쓴 곳에 한 번 더 허락할 것인가. 못 세면(KV 장애·이상한 값) 막지 않습니다(fail-open). */
export function storyFixAllowed(used: any, cap: number): boolean {
  if (used === null || used === undefined || used === '') return true;
  const n = Number(used);
  if (!isFinite(n) || n < 0) return true;
  return n < cap;
}

/** 카운터 키 — kind 는 'dev'|'ip'|'log'. KST 자정에 새로 시작합니다. */
export function storyCapKey(kind: string, who: any, nowMs: any): string {
  const w = String(who || '').trim().slice(0, 80) || 'unknown';
  const t = Number(nowMs);
  const day = isFinite(t) && t > 0 ? Math.floor((t + 9 * 3600000) / 86400000) : 0;
  return 'storyfix:' + kind + ':' + w + ':' + day;
}

function part(v: any): string {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '').trim();
}

/** 요청 본문을 다듬습니다. 모양이 틀리면 null. */
export function cleanStoryFix(b: any): { story: string; a: string; b: string; slots: [Slot, Slot]; device: string; sentence: string } | null {
  if (!b || typeof b !== 'object') return null;
  const story = String(b.story || '').trim();
  if (!/^[a-z0-9-]{1,40}$/.test(story)) return null;
  const a = part(b.a), bb = part(b.b);
  if (!isEnglishText(a, STORY_PART_MAX) || !isEnglishText(bb, STORY_PART_MAX)) return null;
  const s = Array.isArray(b.slots) ? b.slots.slice(0, 2) : [];
  if (s.length !== 2 || !s.every((x: any) => x === 'vp' || x === 'cl')) return null;
  const device = String(b.device || '').trim();
  if (!/^[A-Za-z0-9_.-]{4,64}$/.test(device)) return null;
  const sentence = String(b.sentence || '').replace(/\s+/g, ' ').trim();
  if (!isEnglishText(sentence, STORY_SENT_MAX)) return null;
  return { story, a, b: bb, slots: [s[0], s[1]], device, sentence };
}

const SLOT_EN: Record<Slot, string> = {
  vp: 'a verb phrase that starts with the base form of a verb, with no subject (like "go home")',
  cl: 'a clause with a subject and a verb (like "it rains")',
};

export function buildStoryFixMessages(x: { a: string; b: string; slots: [Slot, Slot]; sentence: string }): Array<{ role: string; content: string }> {
  const sys = 'You check very short English sentences written by Korean children. '
    + 'Fix ONLY grammar and spelling mistakes. Keep the child\'s own words and meaning. '
    + 'Do not add new ideas, do not make it longer, do not change words that are already correct. '
    + 'If a part is already correct, return it exactly unchanged. '
    + 'Reply with ONLY JSON: {"a":"...","b":"..."}';
  const user = 'Full sentence: ' + JSON.stringify(x.sentence) + '\n'
    + 'Part A (must be ' + SLOT_EN[x.slots[0]] + '): ' + JSON.stringify(x.a) + '\n'
    + 'Part B (must be ' + SLOT_EN[x.slots[1]] + '): ' + JSON.stringify(x.b);
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}

/** Workers AI 응답 → 글자(객체로 오기도 합니다 — CLAUDE.md 「[object Object]」 함정). */
export function storyAiText(r: any): string {
  const v = r && typeof r === 'object' ? (r.response ?? (r.result && r.result.response) ?? r.result) : r;
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return ''; }
}

/** 모델 출력에서 {a,b} 를 꺼냅니다. 못 꺼내면 null. */
export function parseStoryFix(raw: any): { a: string; b: string } | null {
  const s = String(raw == null ? '' : raw);
  if (!s.trim() || /\[object [A-Za-z]+\]/.test(s)) return null;
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  let o: any;
  try { o = JSON.parse(s.slice(i, j + 1)); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const a = part(o.a), b = part(o.b);
  if (!a || !b) return null;
  return { a, b };
}

const FUNC = new Set(['a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'to', 'do', 'does', 'did', 'not',
  'and', 'of', 'in', 'on', 'at', 'for', 'with', 'my', 'his', 'her', 'their', 'our', 'your', 'its', 'it', 'will', 'can']);
const SUBJ = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they']);
const words = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);

function editDist(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, k) => k);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i; let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp; if (prev[j] < rowMin) rowMin = prev[j];
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

/** 새로 들어온 낱말이 «학생 낱말의 변형» 인가 — 철자 고침·동사 변화(go→goes·went 는 아님)·기능어만 인정. */
function closeTo(w: string, orig: string[]): boolean {
  if (FUNC.has(w)) return true;
  for (const o of orig) {
    if (editDist(w, o, 2) <= 2) return true;
    const n = Math.min(w.length, o.length);
    if (n >= 3 && w.slice(0, 3) === o.slice(0, 3) && Math.abs(w.length - o.length) <= 3) return true;
  }
  return false;
}

/**
 * AI 가 고친 것을 믿어도 되는가(순수 함수). 하나라도 어기면 보여 주지 않습니다.
 *   ① 영어만·길이 ② 낱말 수가 크게 안 변함(±2) ③ 새 낱말은 학생 낱말의 변형이거나 기능어
 *   ④ 새 낱말 수 ≤ max(2, 원래의 절반) ⑤ 'vp' 칸이 주어로 시작하지 않음
 */
export function verifyStoryFix(orig: { a: string; b: string }, fix: { a: string; b: string }, slots: [Slot, Slot]): { ok: boolean; why?: string } {
  const pairs: Array<[string, string, Slot]> = [[orig.a, fix.a, slots[0]], [orig.b, fix.b, slots[1]]];
  for (const [o, f, slot] of pairs) {
    if (!isEnglishText(f, STORY_PART_MAX)) return { ok: false, why: 'not_english' };
    const ow = words(o), fw = words(f);
    if (!fw.length) return { ok: false, why: 'empty' };
    if (Math.abs(fw.length - ow.length) > 2) return { ok: false, why: 'length' };
    const oset = new Set(ow);
    const fresh = fw.filter((w) => !oset.has(w));
    if (fresh.length > Math.max(2, Math.ceil(ow.length / 2))) return { ok: false, why: 'too_many_new' };
    if (!fresh.every((w) => closeTo(w, ow))) return { ok: false, why: 'new_word' };
    if (slot === 'vp' && SUBJ.has(fw[0])) return { ok: false, why: 'frame' };
  }
  return { ok: true };
}

const same = (x: string, y: string) => words(x).join(' ') === words(y).join(' ');

/** «왜 고쳤는지» — 결정론 설명기. 모르면 일반 문구(지어내지 않음). */
export function storyFixReasons(orig: { a: string; b: string }, fix: { a: string; b: string }): Array<{ ko: string; en: string }> {
  const out: Array<{ ko: string; en: string }> = [];
  for (const [o, f] of [[orig.a, fix.a], [orig.b, fix.b]] as Array<[string, string]>) {
    if (same(o, f)) continue;
    const ko = explainCorrection(o, f) || '더 자연스러운 표현으로 바꿨어요.';
    out.push({ ko, en: '“' + o + '” → “' + f + '”' });
  }
  return out;
}

export const STORY_FIX_MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'];

export const STORY_LOG_SCHEMA = 'CREATE TABLE IF NOT EXISTS story_write_log (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, story TEXT NOT NULL, sentence TEXT NOT NULL, original TEXT, fixes INTEGER NOT NULL DEFAULT 0, ai TEXT, created_at INTEGER NOT NULL)';
export const STORY_LOG_INDEX = 'CREATE INDEX IF NOT EXISTS idx_story_write_log_uid ON story_write_log(student_uid, created_at)';
const AI_STATES = new Set(['none', 'fixed', 'kept', 'unavailable', 'skipped']);

/** story_log 본문 다듬기(순수 함수). */
export function cleanStoryLog(b: any): { story: string; sentence: string; original: string; fixes: number; ai: string } | null {
  if (!b || typeof b !== 'object') return null;
  const story = String(b.story || '').trim();
  if (!/^[a-z0-9-]{1,40}$/.test(story)) return null;
  const sentence = String(b.sentence || '').replace(/\s+/g, ' ').trim();
  if (!isEnglishText(sentence, STORY_SENT_MAX)) return null;
  const original = String(b.original || '').replace(/\s+/g, ' ').trim();
  const fx = Math.floor(Number(b.fixes));
  return {
    story, sentence,
    original: original && isEnglishText(original, STORY_SENT_MAX) && original !== sentence ? original : '',
    fixes: isFinite(fx) ? Math.max(0, Math.min(10, fx)) : 0,
    ai: AI_STATES.has(String(b.ai)) ? String(b.ai) : 'none',
  };
}

/** 여러 카운터를 «먼저 다 읽고» 전부 허락될 때만 «전부» 올립니다 — 하나에 막힌 요청이 다른 카운터를 먹지 않게
 *  (학원 한 회선에서 한 아이가 기기 상한을 넘긴 뒤 계속 눌러도 같은 반 공용 IP 카운터가 줄지 않음). */
async function bumpAll(env: any, items: Array<[string, number]>): Promise<boolean> {
  const used: any[] = [];
  for (const [k] of items) { let u: any = null; try { u = await env.SESSION_STATE?.get?.(k); } catch {} used.push(u); }
  for (let i = 0; i < items.length; i++) if (!storyFixAllowed(used[i], items[i][1])) return false;
  for (let i = 0; i < items.length; i++) {
    try { await env.SESSION_STATE?.put?.(items[i][0], String((Number(used[i]) || 0) + 1), { expirationTtl: 172800 }); } catch { /* KV 장애로 막지 않음 */ }
  }
  return true;
}
async function bump(env: any, key: string, cap: number): Promise<boolean> {
  let used: any = null;
  try { used = await env.SESSION_STATE?.get?.(key); } catch {}
  if (!storyFixAllowed(used, cap)) return false;
  try { await env.SESSION_STATE?.put?.(key, String((Number(used) || 0) + 1), { expirationTtl: 172800 }); } catch { /* KV 장애로 막지 않음 */ }
  return true;
}

/** 라우트 본체 — api-ai.ts 는 이것을 «부르기만» 합니다. */
export async function handleStoryApi(request: Request, env: any, deps: {
  json: (o: any, s?: number) => Response;
  authUid: (body: any) => Promise<string | null>;
  recordFailure?: (f: any) => Promise<void>;
}): Promise<Response> {
  const { json } = deps;
  const body: any = await request.json().catch(() => ({}));
  const action = String(body && body.action || '');

  if (action === 'story_fix') {
    const x = cleanStoryFix(body);
    if (!x) return json({ ok: false, error: 'bad_request' }, 400);
    if (!env.AI) return json({ ok: false, error: 'ai_unavailable' }, 503);
    const now = Date.now();
    // 💸 부르기 «전» 에 셉니다 — 회선(기기 id 바꿔 끼우기 대비)과 기기를 함께. 하나라도 막히면 아무것도 안 올림.
    //    ⚠️ 한 요청이 모델을 최대 2번 부릅니다(첫 모델 실패 시) — 실제 호출 상한은 기기당 60·회선당 600회.
    const capOk = await bumpAll(env, [
      [storyCapKey('ip', request.headers.get('cf-connecting-ip'), now), STORY_FIX_MAX_PER_IP_DAY],
      [storyCapKey('dev', x.device, now), STORY_FIX_MAX_PER_DEVICE_DAY],
    ]);
    if (!capOk) return json({ ok: false, error: 'daily_cap' }, 429);
    const msgs = buildStoryFixMessages(x);
    let lastErr: any = null, plain = 0;
    for (const m of STORY_FIX_MODELS) {
      try {
        const r = await env.AI.run(m, { messages: msgs, max_tokens: 120, temperature: 0.1 });
        const fix = parseStoryFix(storyAiText(r));
        if (!fix) { plain++; continue; }
        const orig = { a: x.a, b: x.b };
        if (same(orig.a, fix.a) && same(orig.b, fix.b)) return json({ ok: true, changed: false });
        const v = verifyStoryFix(orig, fix, x.slots);
        // ⛔ 검사를 못 넘으면 고친 문장을 안 보여 줍니다 — «틀린 곳 없음» 도 아닙니다.
        if (!v.ok) return json({ ok: false, error: 'unverified', why: v.why });
        return json({ ok: true, changed: true, a: fix.a, b: fix.b, reasons: storyFixReasons(orig, fix) });
      } catch (e: any) {
        lastErr = e;
        console.error('[story-fix] model failed:', m, e?.message || e);
      }
    }
    try { await deps.recordFailure?.({ feature: 'story-fix', models: STORY_FIX_MODELS.join(','), err: String(lastErr?.message || lastErr || 'unparsable'), rf: 0, plain, empty: 0, level: '' }); } catch {}
    return json({ ok: false, error: 'ai_unavailable' }, 503);
  }

  if (action === 'story_log') {
    const x = cleanStoryLog(body);
    if (!x) return json({ ok: false, error: 'bad_request' }, 400);
    const uid = String(body.uid || '').trim();
    let tokUid: string | null = null;
    try { tokUid = await deps.authUid(body); } catch { tokUid = null; }
    // 🔐 로그인한 «본인» 만 — 게스트·토큰 불일치는 저장하지 않습니다(조용히 성공처럼 굴지 않고 saved:false 로 말함).
    if (!uid || /^guest/i.test(uid) || tokUid !== uid) return json({ ok: true, saved: false, reason: 'not_logged_in' });
    if (!(await bump(env, storyCapKey('log', uid, Date.now()), STORY_LOG_MAX_PER_UID_DAY))) return json({ ok: true, saved: false, reason: 'daily_cap' });
    if (!env.DB) return json({ ok: true, saved: false, reason: 'no_db' });
    try {
      await env.DB.exec(STORY_LOG_SCHEMA);
      await env.DB.exec(STORY_LOG_INDEX);
      await env.DB.prepare('INSERT INTO story_write_log (student_uid, story, sentence, original, fixes, ai, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(uid, x.story, x.sentence, x.original || null, x.fixes, x.ai, Date.now()).run();
      return json({ ok: true, saved: true });
    } catch (e: any) {
      console.error('[story-log] insert failed:', e?.message || e);
      return json({ ok: true, saved: false, reason: 'db_error' });
    }
  }

  return json({ ok: false, error: 'unknown_action' }, 400);
}
