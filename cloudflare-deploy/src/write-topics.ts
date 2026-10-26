/* ✏️ 선생님 글감 (AI 영작 첨삭 «오늘의 글감») — 정본 (2026-10-19 사장님 지시)
 *
 * [왜] 원장님(관리자)이 «오늘의 글감 제목» 을 직접 적으면 바로 아래에 그 제목의
 *      브레인스토밍(6하원칙 질문)이 나오고, 학생은 그 글감으로 쓰게 해 달라는 의견.
 *      사장님 결정: ① 원장(본사)·선생님 «둘 다» 만들 수 있다 ② «학원 전체» 학생에게 보인다
 *      ③ 글감마다 «AI 그림» 을 만든다.
 *
 * [경로] 전부 `/api/class/write-topics*` — `/api/class/` 는 src/index.ts 라우팅 허용목록에
 *        이미 있어서 공동 금지구역(index.ts)을 한 줄도 안 건드린다. 위임은 api-mango.ts 맨 앞.
 *   GET  /api/class/write-topics            → 게시된 글감(누구나) + 만들 수 있으면 can_create·manage
 *   POST /api/class/write-topics  {action}  → draft | image | save | publish | hide (모르는 값 = 400)
 *   GET  /api/class/write-topics/img/<id>/<ver> → 그 글감의 AI 그림(R2 `write-topics/` 밑)
 *
 * [권한] 쓰기는 «관리자 로그인한 사람 모두»(본사·선생님·지사·대리점·가맹 원장).
 *        📜 (2026-10-26 사장님 지시 «그냥 모두에게 보이게») 예전엔 지사·대리점을 막았다 — 글감이 «학원 전체»
 *           (전국 학생)에게 보여서. 강남캐피 원장님 요청으로 열었고, 글감은 여전히 «학원 전체» 에 보인다.
 *        조직 계정(지사·대리점·가맹)은 선생님처럼 «자기가 만든 것» 만 고친다(남의 글감을 내리지 못하게).
 *        🔴 getAdminActor() 는 스코프 조회 실패를 삼키고 본사 동급으로 떨어진다(CLAUDE.md 2장).
 *           그래서 admin_scope.scope_type 을 «삼키지 않고» 다시 읽고, 모르면 막는다(fail-closed).
 *        선생님·조직 계정은 «자기가 만든 것» 만 고치고, 본사는 전부 고친다.
 *
 * [비용] AI 호출(초안·그림)은 돈이 나간다 → 순수 함수 writeTopicCostGate 가 정한다.
 *        한 사람 24시간 WT_USER_DAILY_CAP 회 · 전체 WT_TOTAL_DAILY_CAP 회. 세기는 «부르기 전» 에
 *        (동시 요청이 서로를 보게). 못 세면 막지 않는다 — 부르는 사람이 이미 로그인한 직원뿐이라.
 *
 * [AI 출력] 학생이 그대로 따라 쓰는 문장이라 «그대로 믿지 않는다» — normalizeDraft 가 결정론으로
 *        걸러 내고(영어 칸은 isEnglishText, 한국어 칸은 한글 필수, 낱말은 서버가 «미션 단어» 로
 *        받는 글자만), 못 쓰는 칸은 손으로 쓴 기본 질문으로 채운다. 그리고 게시 «전» 에
 *        선생님이 화면에서 보고 고친다(초안 → 게시 두 단계).
 *
 * [그림] R2 RECORDINGS 의 `write-topics/<id>/<ver>.<ext>` — 녹화 청소기(`rec/` 만 훑음)와 겹치지 않는다.
 *        flux-2-klein-4b(멀티파트) → 실패하면 flux-1-schnell. 주소에 ver 가 있어 1년 캐시해도 안전.
 */
import { json } from './api-util';
import { getAdminActor } from './auth-admin';
import { orgScopeVerdict, readScopeType, type OrgScopeVerdict } from './org-scope-guard';
import { isEnglishText } from './english-only';

/* 목록 응답은 «지금» 이 정본(방금 게시한 글감이 바로 보여야 한다) — 캐시하지 않는다. */
const jsonNoStore = (data: any, status = 200): Response => {
  const r = json(data, status);
  r.headers.set('Cache-Control', 'no-store');
  return r;
};

export const WT_USER_DAILY_CAP = 30;    // 한 사람 24시간 AI 호출(초안+그림) 상한
export const WT_TOTAL_DAILY_CAP = 300;  // 전체 24시간 상한(폭주 안전판)
export const WT_ACTIONS = ['draft', 'image', 'save', 'publish', 'hide'] as const;
export const WT_IMG_PREFIX = 'write-topics/';
export const WT_TITLE_MAX = 40;
export const WT_LIST_MAX = 60;

/* 6하원칙 칸 — 순서·문단(p)·기본 문장은 화면의 GO_BASE 와 «같은 말» 이다(하니스가 대조).
   LLM 이 칸을 못 채우면 이 기본값을 쓴다. */
export const WT_SLOTS = [
  { k: 'when',  p: 0, ko: '🕒 When — 언제 있었던 일인가요?',      en: '🕒 When — When did it happen?',   starter: 'It happened ',         ex: 'last Sunday' },
  { k: 'where', p: 0, ko: '📍 Where — 어디에서 있었던 일인가요?', en: '📍 Where — Where did it happen?', starter: 'I was at ',            ex: 'the park' },
  { k: 'who',   p: 1, ko: '🧑 Who — 누구와 함께였나요?',          en: '🧑 Who — Who was with you?',      starter: 'I was with ',          ex: 'my best friend' },
  { k: 'what',  p: 1, ko: '💡 What — 무슨 일이 있었나요?',        en: '💡 What — What happened?',        starter: 'First, ',              ex: 'I played soccer' },
  { k: 'why',   p: 2, ko: '❓ Why — 왜 그런 일이 생겼나요?',      en: '❓ Why — Why did it happen?',     starter: 'It happened because ', ex: 'I ran too fast' },
  { k: 'how',   p: 2, ko: '💗 How — 그때 기분이 어땠나요?',       en: '💗 How — How did you feel?',      starter: 'I felt ',              ex: 'happy' },
] as const;
const SLOT_KEYS = WT_SLOTS.map(s => s.k as string);
const SLOT_ICON: Record<string, string> = { when: '🕒', where: '📍', who: '🧑', what: '💡', why: '❓', how: '💗' };
const SLOT_EN: Record<string, string> = { when: 'When', where: 'Where', who: 'Who', what: 'What', why: 'Why', how: 'How' };

export interface WtQuestion { k: string; p: number; ko: string; en: string; starter: string; ph: string; }
export interface WtDraft {
  title_ko: string; title_en: string; icon: string; open: string;
  questions: WtQuestion[]; words: string[]; image_prompt: string;
}

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const clean = (s: unknown, max: number) =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/* ───────────── 순수 판정 (하니스가 실제로 돌린다) ───────────── */

/** 쓰기 권한 — 'ok'(본사) | 'own'(지사·대리점 — 자기 글감만) | 'auth'(로그인 필요) | 'unknown'(권한을 못 읽음 = 막음) */
export type WtEditVerdict = 'ok' | 'own' | 'auth' | 'unknown';
export function writeTopicEditVerdict(actorOk: boolean, scope: OrgScopeVerdict): WtEditVerdict {
  if (!actorOk) return 'auth';
  if (scope === 'org') return 'own';
  if (scope !== 'hq') return 'unknown';   // 모르면 막는다(fail-closed) — 'hq' 만 통과
  return 'ok';
}

/** 비용 게이트 — 세지 못하면(null·NaN·음수) 막지 않는다(부르는 사람이 이미 로그인 직원). */
export function writeTopicCostGate(userUsed: unknown, totalUsed: unknown,
  userCap = WT_USER_DAILY_CAP, totalCap = WT_TOTAL_DAILY_CAP): { ok: boolean; reason: '' | 'user_cap' | 'total_cap'; left: number | null } {
  const u = Number(userUsed), t = Number(totalUsed);
  const uKnown = userUsed !== null && userUsed !== undefined && Number.isFinite(u) && u >= 0;
  const tKnown = totalUsed !== null && totalUsed !== undefined && Number.isFinite(t) && t >= 0;
  if (uKnown && u >= userCap) return { ok: false, reason: 'user_cap', left: 0 };
  if (tKnown && t >= totalCap) return { ok: false, reason: 'total_cap', left: 0 };
  return { ok: true, reason: '', left: uKnown ? Math.max(0, userCap - u) : null };
}

/** 고칠 수 있는가 — 선생님은 자기 것만(아이디 완전일치), 본사는 전부. */
export function canEditTopic(actor: { username: string; isTeacher: boolean; ownOnly?: boolean }, row: { created_by?: string | null } | null): boolean {
  if (!row) return false;
  if (!actor.isTeacher && !actor.ownOnly) return true;
  const me = String(actor.username || ''), owner = String(row.created_by || '');
  return !!me && me === owner;
}

/** 미션 단어 — 서버(api-ai.ts)가 «미션 단어를 썼다» 로 세는 글자만 받는다. */
export function normalizeWords(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const w of arr) {
    const s = clean(w, 30);
    if (!/^[a-zA-Z][a-zA-Z' -]{0,29}$/.test(s)) continue;
    if (s.split(' ').length > 2) continue;
    if (out.some(x => x.toLowerCase() === s.toLowerCase())) continue;
    out.push(s);
    if (out.length === 3) break;
  }
  return out;
}

/** 시작 문장 조각 — 학생이 이어 쓰는 영어. 대문자로 시작·관사로 끝나지 않음·공백으로 끝남. */
export function normalizeStarter(raw: unknown, fallback: string): string {
  let s = clean(raw, 40);
  if (!s) return fallback;
  if (!isEnglishText(s, 40) || !/^[A-Z]/.test(s)) return fallback;
  s = s.replace(/[.!?]+$/, '').trim();
  const words = s.split(' ');
  if (words.length > 6) return fallback;
  if (/\b(a|an|the)$/i.test(s)) return fallback;   // 「I want a 」 + 「an apple」 → 「a an apple」
  return s + ' ';
}

/** 첫 문장(서론 첫 줄) — 완성된 영어 한 문장. 못 쓰면 '' (그 줄을 안 넣는다). */
export function normalizeOpen(raw: unknown): string {
  const s = clean(raw, 120);
  if (!s || !isEnglishText(s, 120)) return '';
  if (!/^[A-Z]/.test(s) || !/[.!?]$/.test(s)) return '';
  return s;
}

/** 아이콘 — 이모지 한 개. Unicode 13 이상·ZWJ 조합은 안 받는다(Win10 두부). */
export function normalizeIcon(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 4 || /\u200d/.test(s) || /[A-Za-z0-9가-힣]/.test(s)) return '📝';
  const cps = [...s].map(c => c.codePointAt(0) || 0);
  if (cps.some(cp => cp >= 0x1FA70)) return '📝';
  if (!cps.some(cp => cp >= 0x2190)) return '📝';
  return s;
}

/** 질문 한 칸 — LLM 이 준 것 중 쓸 수 있는 칸만 고르고 나머지는 기본값. */
export function normalizeQuestion(raw: any, k: string): WtQuestion {
  const slot = WT_SLOTS.find(s => s.k === k)!;
  const icon = SLOT_ICON[k], enHead = SLOT_EN[k];
  let ko = clean(raw && raw.ko, 70);
  if (!HANGUL.test(ko)) ko = slot.ko;
  else if (!ko.startsWith(icon)) ko = icon + ' ' + enHead + ' — ' + ko.replace(/^[^가-힣A-Za-z]+/, '');
  let en = clean(raw && raw.en, 90);
  if (!isEnglishText(en.replace(/^\S+\s*/, ''), 90) || !/[A-Za-z]/.test(en)) en = slot.en;
  else if (!en.startsWith(icon)) en = icon + ' ' + enHead + ' — ' + en.replace(/^[^A-Za-z]+/, '');
  const starter = normalizeStarter(raw && raw.starter, slot.starter);
  let ex = clean(raw && (raw.example ?? raw.ph), 50).replace(/^예\)\s*/, '');
  if (!isEnglishText(ex, 50) || !/[A-Za-z]/.test(ex)) ex = slot.ex;
  return { k, p: slot.p, ko, en, starter, ph: '예) ' + ex };
}

/** LLM 초안 → 화면에 그대로 내보낼 수 있는 모양. 제목은 선생님이 적은 것이 이긴다. */
export function normalizeDraft(raw: any, titleInput: string): WtDraft {
  const r = raw && typeof raw === 'object' ? raw : {};
  const title = clean(titleInput, WT_TITLE_MAX);
  const titleKo = HANGUL.test(title) ? title : (HANGUL.test(clean(r.title_ko, WT_TITLE_MAX)) ? clean(r.title_ko, WT_TITLE_MAX) : title);
  let titleEn = clean(r.title_en, 60);
  if (!isEnglishText(titleEn, 60) || !/[A-Za-z]/.test(titleEn)) titleEn = isEnglishText(title, 60) ? title : '';
  const given: Record<string, any> = {};
  for (const q of Array.isArray(r.questions) ? r.questions : []) {
    const k = String(q && q.k || '').toLowerCase();
    if (SLOT_KEYS.includes(k) && !given[k]) given[k] = q;
  }
  // 칸 고르기: LLM 이 준 칸(3~6개) + 'what' 은 반드시. 너무 적으면 기본 6칸 전부.
  let keys = SLOT_KEYS.filter(k => given[k]);
  if (!keys.includes('what')) keys.push('what');
  if (keys.length < 3) keys = SLOT_KEYS.slice();
  keys = SLOT_KEYS.filter(k => keys.includes(k));       // 순서는 언제나 6하원칙 순서
  const questions = keys.map(k => normalizeQuestion(given[k], k));
  let prompt = clean(r.image_prompt, 280);
  if (!isEnglishText(prompt, 280) || prompt.length < 8) prompt = titleEn || 'children writing a story together in a bright classroom';
  return {
    title_ko: titleKo || titleEn,
    title_en: titleEn,
    icon: normalizeIcon(r.icon),
    open: normalizeOpen(r.open),
    questions,
    words: normalizeWords(r.words),
    image_prompt: prompt,
  };
}

/** 선생님이 화면에서 고친 값 — 같은 규칙으로 한 번 더 거른다(화면이 보낸 값을 믿지 않는다). */
export function normalizeSave(b: any, prev: WtDraft): WtDraft {
  const qIn = Array.isArray(b && b.questions) ? b.questions : prev.questions;
  const given: Record<string, any> = {};
  for (const q of qIn) { const k = String(q && q.k || '').toLowerCase(); if (SLOT_KEYS.includes(k) && !given[k]) given[k] = q; }
  let keys = SLOT_KEYS.filter(k => given[k]);
  if (!keys.includes('what')) keys.push('what');
  keys = SLOT_KEYS.filter(k => keys.includes(k));
  const titleKo = clean(b && b.title_ko, WT_TITLE_MAX) || prev.title_ko;
  let titleEn = clean(b && b.title_en, 60);
  if (titleEn && (!isEnglishText(titleEn, 60) || !/[A-Za-z]/.test(titleEn))) titleEn = prev.title_en;
  return {
    title_ko: titleKo,
    title_en: titleEn,
    icon: b && b.icon !== undefined ? normalizeIcon(b.icon) : prev.icon,
    open: b && b.open !== undefined ? normalizeOpen(b.open) : prev.open,
    questions: keys.map(k => normalizeQuestion(given[k], k)),
    words: b && b.words !== undefined ? normalizeWords(b.words) : prev.words,
    image_prompt: prev.image_prompt,
  };
}

/** 이미지 바이트 → 종류. 모르면 '' (저장하지 않는다). */
export function detectImageMime(b: Uint8Array): '' | 'image/png' | 'image/jpeg' | 'image/webp' {
  if (!b || b.length < 12) return '';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return '';
}

/** LLM 응답 → 객체. JSON 모드면 이미 객체가 올 수 있다(CLAUDE.md 2장 «[object Object]»). */
export function parseModelJson(resp: any): any {
  if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
    const inner = resp.response ?? resp.result?.response ?? resp.result;
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner;
    if (typeof inner === 'string') return parseModelJson(inner);
    if (resp.questions || resp.title_en) return resp;
    return null;
  }
  const s = String(resp ?? '').trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { /* 아래로 */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* 모름 */ } }
  return null;
}

/* ───────────── 저장소 ───────────── */

let _schemaReady = false;
export async function ensureWriteTopicTables(env: any): Promise<void> {
  if (_schemaReady) return;
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS write_topics (id INTEGER PRIMARY KEY AUTOINCREMENT, title_ko TEXT NOT NULL, title_en TEXT, icon TEXT, open_line TEXT, questions_json TEXT, words_json TEXT, image_prompt TEXT, image_key TEXT, image_ver INTEGER DEFAULT 0, image_mime TEXT, status TEXT NOT NULL DEFAULT 'draft', created_by TEXT, created_at INTEGER, updated_at INTEGER, published_at INTEGER)`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS write_topic_gen_log (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, kind TEXT, ok INTEGER DEFAULT 0, ts INTEGER)`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_wtgl_user_ts ON write_topic_gen_log(username, ts)`); } catch { /* 있음 */ }
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_wt_status ON write_topics(status, published_at)`); } catch { /* 있음 */ }
  _schemaReady = true;
}

function rowToItem(r: any, staff: boolean) {
  let questions: WtQuestion[] = [], words: string[] = [];
  try { questions = JSON.parse(r.questions_json || '[]'); } catch { questions = []; }
  try { words = JSON.parse(r.words_json || '[]'); } catch { words = []; }
  const item: any = {
    id: r.id, title_ko: r.title_ko, title_en: r.title_en || '', icon: r.icon || '📝',
    open: r.open_line || '', questions, words,
    image_url: r.image_key && r.image_ver ? `/api/class/write-topics/img/${r.id}/${r.image_ver}` : '',
    updated_at: r.updated_at || 0,
  };
  if (staff) { item.status = r.status; item.created_by = r.created_by || ''; item.image_prompt = r.image_prompt || ''; }
  return item;
}
function rowToDraft(r: any): WtDraft {
  const it = rowToItem(r, false);
  return { title_ko: it.title_ko, title_en: it.title_en, icon: it.icon, open: it.open, questions: it.questions, words: it.words, image_prompt: r.image_prompt || '' };
}

/** 쓰기 권한 판정(세션 + 스코프 재조회). 통과면 actor, 아니면 Response. */
async function editGate(request: Request, env: any): Promise<{ actor: any } | { res: Response }> {
  const actor = await getAdminActor(request, env as any);
  if (!actor.ok) return { res: json({ ok: false, error: 'auth_required', message: '로그인한 선생님·관리자만 만들 수 있어요. / Teachers and admins only.' }, 401) };
  const st = await readScopeType(env, actor.username);
  const v = writeTopicEditVerdict(actor.ok, orgScopeVerdict(st, actor.role));
  if (v === 'own') return { actor: { ...actor, ownOnly: true } };   // 지사·대리점 — 만들 수 있고, 고치기는 자기 것만
  if (v !== 'ok') return { res: json({ ok: false, error: 'scope_unknown', message: '권한을 확인하지 못했어요. 잠시 후 다시 해 주세요. / Could not check your permission. Please try again.' }, 403) };
  return { actor };
}

async function countUsage(env: any, username: string): Promise<{ user: number | null; total: number | null }> {
  const since = Date.now() - 86400000;
  let user: number | null = null, total: number | null = null;
  try { const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM write_topic_gen_log WHERE username = ? AND ts > ?`).bind(username, since).first(); user = r ? Number(r.n) : null; } catch { user = null; }
  try { const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM write_topic_gen_log WHERE ts > ?`).bind(since).first(); total = r ? Number(r.n) : null; } catch { total = null; }
  return { user, total };
}
async function costGateOrRes(env: any, username: string, kind: string): Promise<{ logId: number | null } | { res: Response }> {
  const used = await countUsage(env, username);
  const g = writeTopicCostGate(used.user, used.total);
  if (!g.ok) return { res: json({ ok: false, error: 'daily_cap', reason: g.reason, message: '오늘 AI 만들기 횟수를 다 썼어요. 내일 다시 해 주세요. / Daily AI limit reached — please try again tomorrow.' }, 429) };
  let logId: number | null = null;
  try {
    const r: any = await env.DB.prepare(`INSERT INTO write_topic_gen_log (username, kind, ok, ts) VALUES (?, ?, 0, ?)`).bind(username, kind, Date.now()).run();
    logId = Number(r?.meta?.last_row_id) || null;
  } catch (e: any) { console.warn('[write-topics] gen log:', e?.message); }
  return { logId };
}
async function markLogOk(env: any, logId: number | null) {
  if (!logId) return;
  try { await env.DB.prepare(`UPDATE write_topic_gen_log SET ok = 1 WHERE id = ?`).bind(logId).run(); } catch { /* 기록일 뿐 */ }
}

/* ───────────── AI 호출 ───────────── */

function draftPrompt(title: string): string {
  return `You are helping a Korean English academy make a writing topic for children (age 8-14, beginner to intermediate).
The teacher's topic title is: """${title}"""

Make a brainstorming outline (5W1H) the student answers before writing. Respond in this strict JSON only, no markdown:
{
  "title_en": "short English title (max 6 words)",
  "title_ko": "short Korean title",
  "icon": "one simple emoji",
  "open": "One complete, simple English opening sentence for the essay.",
  "questions": [
    {"k":"when|where|who|what|why|how","ko":"Korean question (child friendly)","en":"English question","starter":"English sentence starter the child continues, ending without a period","example":"short English example answer (2-6 words)"}
  ],
  "words": ["three", "simple", "English words"],
  "image_prompt": "English description of ONE bright, friendly, realistic scene that shows this topic, for children"
}
Rules: choose 4 to 6 of the six keys that fit the topic and always include "what". Starters must be grammatical with the example
appended (e.g. "I was at " + "the park"). Never end a starter with "a", "an" or "the". Words must be single common nouns or verbs
that will appear in the picture. No scary, violent or sad scenes. No text or letters in the picture description.`;
}

async function runDraft(env: any, title: string): Promise<any> {
  const models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'];
  for (const m of models) {
    try {
      const resp: any = await env.AI.run(m, {
        messages: [{ role: 'user', content: draftPrompt(title) }],
        max_tokens: 1200, temperature: 0.4,
      });
      const obj = parseModelJson(resp);
      if (obj && Array.isArray(obj.questions)) return obj;
    } catch (e: any) { console.warn('[write-topics] draft model', m, e?.message || e); }
  }
  return null;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(String(b64).replace(/^data:[^,]+,/, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function imageBytesFrom(resp: any): Promise<Uint8Array | null> {
  try {
    if (!resp) return null;
    if (resp instanceof Uint8Array) return resp;
    if (resp instanceof ArrayBuffer) return new Uint8Array(resp);
    if (typeof resp === 'object' && typeof resp.image === 'string') return b64ToBytes(resp.image);
    if (typeof resp === 'object' && resp.result && typeof resp.result.image === 'string') return b64ToBytes(resp.result.image);
    if (typeof resp.getReader === 'function') return new Uint8Array(await new Response(resp).arrayBuffer());
  } catch (e: any) { console.warn('[write-topics] image bytes:', e?.message); }
  return null;
}
export function imagePromptFor(p: string): string {
  return 'A bright, friendly, child-safe illustration for a children\'s English writing class. ' + p +
    '. Warm colors, cheerful mood, wide 16:9 scene, no text, no letters, no words, no watermark.';
}
async function runImage(env: any, prompt: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const full = imagePromptFor(prompt);
  try {
    const form = new FormData();
    form.append('prompt', full);
    form.append('width', '1024');
    form.append('height', '576');
    const fr = new Response(form);
    const resp: any = await env.AI.run('@cf/black-forest-labs/flux-2-klein-4b', {
      multipart: { body: fr.body, contentType: fr.headers.get('content-type') },
    });
    const b = await imageBytesFrom(resp);
    const mime = b ? detectImageMime(b) : '';
    if (b && mime) return { bytes: b, mime };
  } catch (e: any) { console.warn('[write-topics] flux-2-klein:', e?.message || e); }
  try {
    const resp: any = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt: full, steps: 6 });
    const b = await imageBytesFrom(resp);
    const mime = b ? detectImageMime(b) : '';
    if (b && mime) return { bytes: b, mime };
  } catch (e: any) { console.warn('[write-topics] flux-1-schnell:', e?.message || e); }
  return null;
}
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/* ───────────── 라우트 ───────────── */

export async function handleWriteTopicsApi(request: Request, url: URL, env: any): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (path !== '/api/class/write-topics' && !path.startsWith('/api/class/write-topics/')) return null;
  try { await ensureWriteTopicTables(env); }
  catch (e: any) { return json({ ok: false, error: 'db_unavailable' }, 503); }

  // 🖼 그림 — 주소에 판(ver)이 있어 1년 캐시. 판이 안 맞으면 404(옛 주소가 새 그림을 보이지 않게).
  const im = path.match(/^\/api\/class\/write-topics\/img\/(\d+)\/(\d+)$/);
  if (im && (method === 'GET' || method === 'HEAD')) {
    const row: any = await env.DB.prepare(`SELECT image_key, image_ver, image_mime, status FROM write_topics WHERE id = ?`).bind(Number(im[1])).first();
    if (!row || !row.image_key || Number(row.image_ver) !== Number(im[2]) || !env.RECORDINGS) return new Response('not found', { status: 404 });
    const obj = await env.RECORDINGS.get(row.image_key);
    if (!obj) return new Response('not found', { status: 404 });
    return new Response(method === 'HEAD' ? null : obj.body, { headers: {
      'Content-Type': row.image_mime || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    } });
  }

  if (path !== '/api/class/write-topics') return json({ ok: false, error: 'not_found' }, 404);

  if (method === 'GET') {
    const rs: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE status = 'published' ORDER BY published_at DESC, id DESC LIMIT ?`).bind(WT_LIST_MAX).all();
    const items = (rs.results || []).map((r: any) => rowToItem(r, false));
    // 만들 수 있는 사람인지(쿠키가 있을 때만 묻는다 — 학생 화면은 여기서 끝)
    let canCreate = false, manage: any[] = [], reason = '';
    if (/mangoi_admin_session=/.test(request.headers.get('Cookie') || '')) {
      const g = await editGate(request, env);
      if ('actor' in g) {
        canCreate = true;
        const a = g.actor;
        const ms: any = (a.isTeacher || a.ownOnly)
          ? await env.DB.prepare(`SELECT * FROM write_topics WHERE created_by = ? AND status != 'deleted' ORDER BY updated_at DESC LIMIT ?`).bind(a.username, WT_LIST_MAX).all()
          : await env.DB.prepare(`SELECT * FROM write_topics WHERE status != 'deleted' ORDER BY updated_at DESC LIMIT ?`).bind(WT_LIST_MAX).all();
        manage = (ms.results || []).map((r: any) => rowToItem(r, true));
        const used = await countUsage(env, a.username);
        const cg = writeTopicCostGate(used.user, used.total);
        return jsonNoStore({ ok: true, items, can_create: true, manage, ai_left: cg.left, ai_cap: WT_USER_DAILY_CAP });
      }
      reason = 'denied';
    }
    return jsonNoStore({ ok: true, items, can_create: canCreate, manage, reason });
  }

  if (method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const b: any = await request.json().catch(() => null);
  const action = String(b && b.action || '');
  if (!(WT_ACTIONS as readonly string[]).includes(action)) return json({ ok: false, error: 'unknown_action' }, 400);

  const g = await editGate(request, env);
  if ('res' in g) return g.res;
  const actor = g.actor;
  const now = Date.now();

  if (action === 'draft') {
    const title = clean(b.title, WT_TITLE_MAX);
    if (title.length < 2) return json({ ok: false, error: 'title_required', message: '글감 제목을 2글자 이상 적어 주세요. / Please type a title (2+ letters).' }, 400);
    if (!env.AI) return json({ ok: false, error: 'ai_unavailable' }, 503);
    const cg = await costGateOrRes(env, actor.username, 'draft');
    if ('res' in cg) return cg.res;
    const raw = await runDraft(env, title);
    const d = normalizeDraft(raw, title);
    const r: any = await env.DB.prepare(
      `INSERT INTO write_topics (title_ko, title_en, icon, open_line, questions_json, words_json, image_prompt, image_ver, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'draft', ?, ?, ?)`
    ).bind(d.title_ko, d.title_en, d.icon, d.open, JSON.stringify(d.questions), JSON.stringify(d.words), d.image_prompt, actor.username, now, now).run();
    await markLogOk(env, cg.logId);
    const id = Number(r?.meta?.last_row_id);
    const row: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE id = ?`).bind(id).first();
    return json({ ok: true, item: rowToItem(row, true), ai_used: !!raw });
  }

  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'id_required' }, 400);
  const row: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE id = ?`).bind(id).first();
  if (!row || row.status === 'deleted') return json({ ok: false, error: 'not_found' }, 404);
  if (!canEditTopic(actor, row)) return json({ ok: false, error: 'not_owner', message: '내가 만든 글감만 고칠 수 있어요. / You can only edit your own topics.' }, 403);

  if (action === 'save') {
    const d = normalizeSave(b, rowToDraft(row));
    await env.DB.prepare(`UPDATE write_topics SET title_ko = ?, title_en = ?, icon = ?, open_line = ?, questions_json = ?, words_json = ?, updated_at = ? WHERE id = ?`)
      .bind(d.title_ko, d.title_en, d.icon, d.open, JSON.stringify(d.questions), JSON.stringify(d.words), now, id).run();
    const nr: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE id = ?`).bind(id).first();
    return json({ ok: true, item: rowToItem(nr, true) });
  }
  if (action === 'publish') {
    const d = rowToDraft(row);
    if (!d.title_ko || !d.questions.length) return json({ ok: false, error: 'incomplete' }, 400);
    await env.DB.prepare(`UPDATE write_topics SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?`).bind(now, now, id).run();
    const nr: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE id = ?`).bind(id).first();
    return json({ ok: true, item: rowToItem(nr, true) });
  }
  if (action === 'hide') {
    await env.DB.prepare(`UPDATE write_topics SET status = 'hidden', updated_at = ? WHERE id = ?`).bind(now, id).run();
    const nr: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE id = ?`).bind(id).first();
    return json({ ok: true, item: rowToItem(nr, true) });
  }
  // action === 'image'
  if (!env.AI) return json({ ok: false, error: 'ai_unavailable' }, 503);
  if (!env.RECORDINGS) return json({ ok: false, error: 'storage_unavailable' }, 503);
  const cg = await costGateOrRes(env, actor.username, 'image');
  if ('res' in cg) return cg.res;
  const img = await runImage(env, row.image_prompt || row.title_en || row.title_ko);
  if (!img) return json({ ok: false, error: 'image_failed', message: '그림을 만들지 못했어요. 잠시 후 다시 눌러 주세요. / Could not make the picture. Please try again.' }, 502);
  const ver = (Number(row.image_ver) || 0) + 1;
  const key = `${WT_IMG_PREFIX}${id}/${ver}.${EXT[img.mime]}`;
  await env.RECORDINGS.put(key, img.bytes, { httpMetadata: { contentType: img.mime } });
  await env.DB.prepare(`UPDATE write_topics SET image_key = ?, image_ver = ?, image_mime = ?, updated_at = ? WHERE id = ?`).bind(key, ver, img.mime, now, id).run();
  await markLogOk(env, cg.logId);
  if (row.image_key && row.image_key !== key && String(row.image_key).startsWith(WT_IMG_PREFIX)) {
    try { await env.RECORDINGS.delete(row.image_key); } catch { /* 옛 판은 남아도 무해 */ }
  }
  const nr: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE id = ?`).bind(id).first();
  return json({ ok: true, item: rowToItem(nr, true) });
}
