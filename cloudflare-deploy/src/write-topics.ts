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
 *        flux-2-klein-4b(멀티파트) → 실패하면 flux-1-schnell. 공개(published) 그림만 1년 공개 캐시.
 *        🔒 그 밖(학생 «나만 보는 주제»·초안·숨김)은 ?sig= 단기 서명 또는 소유자·본사 세션 + no-store(2026-10-26).
 */
import { json } from './api-util';
import { getAdminActor } from './auth-admin';
import { authUidFromRequest, signWtImgSig, verifyWtImgSig } from './auth-token';
import { orgScopeVerdict, readScopeType, type OrgScopeVerdict } from './org-scope-guard';
import { isEnglishText } from './english-only';

/* 목록 응답은 «지금» 이 정본(방금 게시한 글감이 바로 보여야 한다) — 캐시하지 않는다. */
const jsonNoStore = (data: any, status = 200): Response => {
  const r = json(data, status);
  r.headers.set('Cache-Control', 'no-store');
  return r;
};

export const WT_USER_DAILY_CAP = 30;    // 한 사람 24시간 AI 호출(초안+그림) 상한
/* 🎒 학생도 «나만 보는 주제» 를 만든다(2026-10-26 사장님 «학생에게도 보이게»).
   학생 것은 created_by 앞에 이 접두사가 붙어 직원 계정과 섞이지 않고, «학원 전체 올리기» 는 못 한다(본인 목록에만 보임). */
export const WT_STUDENT_DAILY_CAP = 10;
export const WT_STUDENT_PREFIX = 'stu:';
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

export interface WtQuestion { k: string; p: number; ko: string; en: string; starter: string; ph: string; choices?: string[]; }

/* 🎚 학생 단계에 맞춘 질문(제안 2 — 2026-10-26). 값은 AI 영작 화면의 단계 버튼(data-level, CEFR)과 같은 말이다.
   ⛔ 학생이 만든 주제에만 쓴다 — 선생님 글감은 모든 단계 학생에게 같이 나가므로 한 단계에 맞추면 안 된다.
   ⛔ 지시만으로는 안 지켜진다(CLAUDE.md 반복 실측) — 질문 수·예시 길이·고르는 답은 normalizeDraft 가 결정론으로 맞춘다.
   maxQ 질문 수 상한 · exWords 예시 낱말 상한 · choiceWords 고르는 답 낱말 상한(0 = 고르는 답 없음) · needWhy «왜» 필수 */
export const WT_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type WtLevel = typeof WT_LEVELS[number];
export const WT_LEVEL_SPEC: Record<WtLevel, { maxQ: number; exWords: number; choiceWords: number; needWhy: boolean }> = {
  A1: { maxQ: 4, exWords: 3, choiceWords: 3, needWhy: false },
  A2: { maxQ: 5, exWords: 5, choiceWords: 4, needWhy: false },
  B1: { maxQ: 6, exWords: 6, choiceWords: 0, needWhy: false },
  B2: { maxQ: 6, exWords: 8, choiceWords: 0, needWhy: true },
};
/** 모르는 값은 '' (= 예전 동작, 단계 맞춤 없음). */
export function normalizeLevel(v: unknown): WtLevel | '' {
  const s = String(v ?? '').trim().toUpperCase();
  return (WT_LEVELS as readonly string[]).includes(s) ? s as WtLevel : '';
}
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

/** 📅 숙제 마감일(제안 6, 2026-10-26) — 'YYYY-MM-DD'(한국 날짜 하루 끝까지). '' = 숙제 아님(지우기).
 *  달력에 실제로 있는 날짜만 받는다(2026-02-30 같은 값은 null = 거절). 화면이 보낸 값을 믿지 않는다. */
export function normalizeDueDate(v: unknown): string | null {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 2020 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

/** 📋 숙제 제출 명단을 볼 수 있는가(제안 6) — 이름·점수·글 첫 줄이 나가므로 좁게.
 *  본사(선생님·조직 아님)는 학생 주제가 아닌 것 전부 · 선생님은 자기가 낸 숙제만 · 학생과 지사·대리점은 못 본다
 *  (지사·대리점은 학원 전체 숙제에 남의 지사 학생이 섞이므로 — 건수만 본다). */
export function canSeeSubmits(actor: { username: string; isTeacher: boolean; ownOnly?: boolean; student?: boolean } | null, row: { created_by?: string | null } | null): boolean {
  if (!actor || !row || actor.student || actor.ownOnly) return false;
  const me = String(actor.username || ''), owner = String(row.created_by || '');
  if (owner.startsWith(WT_STUDENT_PREFIX)) return false;
  if (!actor.isTeacher) return true;
  return !!me && me === owner;
}

/* 🛡 부드러운 거르기(제안 8, 2026-10-26) — 학생이 만드는 «나만 보는 주제» 에만 건다(AI 를 부르기 «전» 이라 횟수를 안 쓴다).
   ⛔ 화면에 복제하지 말 것 — 화면은 서버가 준 message 를 그리기만 한다.
   ⚠️ 낱말 목록은 «아이 주제» 기준으로 좁게 — 넓히면 멀쩡한 주제가 막힌다(예: «불이 꺼져요» 의 꺼져, «시발점», «개 색깔», «Moby Dick», «murder mystery»).
   kind: hurt(자해·해치기) · private(전화·주소·이메일) · adult · swear. 못 찾으면 ''. */
export type WtUnsafeKind = '' | 'hurt' | 'private' | 'adult' | 'swear';
const WT_HURT = ['자살', '자해', '죽고싶', '죽을래', '죽여버', '죽일거', '죽이고싶', '살인', '살해', '목매', 'suicide', 'killmyself'];
const WT_ADULT = ['섹스', '야동', '포르노', '성관계', '19금', '야한', 'porn', 'nude'];
const WT_ADULT_WORD = /\b(sex|sexy|naked|boobs)\b/i;
const WT_SWEAR = ['씨발', '시발', '씨바', '씨빨', 'ㅅㅂ', 'ㅆㅂ', '병신', '븅신', '빙신', 'ㅂㅅ', '개새끼', '개새', '좆', '존나', 'ㅈㄴ', '지랄', 'ㅈㄹ',
  '미친놈', '미친년', '미친새', '닥쳐', '썅', '쌍년', '염병', '등신', '찐따', '느금', '니애미', '니엄마', '패드립', '엿먹',
  'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'asshole', 'motherf'];
const WT_SWEAR_WORD = /\b(bastard|retard|damn)\b/i;
export function topicUnsafeKind(...texts: unknown[]): WtUnsafeKind {
  const raw = texts.map(t => String(t == null ? '' : t)).join(' \n ').normalize('NFKC');
  if (!raw.trim()) return '';
  // 기호를 끼워 넣거나(s.h.i.t) 한 글자씩 띄어 써도(씨 발) 잡는다. 낱말끼리는 붙이지 않는다 —
  // 붙이면 «물병 신발»·«출시 발표» 가 욕이 된다. 시발점·시발역은 정상 낱말이라 먼저 뺀다.
  const toks: string[] = [];
  let run = '';
  for (const w of raw.toLowerCase().split(/\s+/)) {
    const c = w.replace(/시발(점|역|택시)/g, '').replace(/[._\-*~!@#$%^&()\[\]{}'"`,/\\|+=?:;<>]/g, '');
    if (!c) continue;
    if ([...c].length === 1) { run += c; continue; }
    if (run) { toks.push(run); run = ''; }
    toks.push(c);
  }
  if (run) toks.push(run);
  const has = (list: string[]) => list.some(w => toks.some(t => t.includes(w)));
  // 자해·해치기만은 띄어 써도 잡는다(«죽고 싶어») — 잘못 막는 값보다 놓치는 값이 크다.
  const flat = raw.toLowerCase().replace(/\s+/g, '');
  if (has(WT_HURT) || WT_HURT.some(w => flat.includes(w))) return 'hurt';
  if (/01[016789][\s.\-]?\d{3,4}[\s.\-]?\d{4}/.test(raw) || /\d{6}\s*-\s*[1-4]\d{6}/.test(raw) ||
      /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(raw) || /\d+\s*동\s*\d+\s*호/.test(raw) || /(\d[.\-]?){9,}/.test(raw)) return 'private';
  if (has(WT_ADULT) || WT_ADULT_WORD.test(raw)) return 'adult';
  if (has(WT_SWEAR) || WT_SWEAR_WORD.test(raw)) return 'swear';
  return '';
}
export const WT_UNSAFE_MSG: Record<Exclude<WtUnsafeKind, ''>, string> = {
  hurt: '이 주제는 여기서 만들 수 없어요. 마음이 힘들면 선생님이나 부모님께 꼭 이야기해 주세요. 💛 / This topic can\'t be made here. If you feel upset, please talk to a teacher or your parents. 💛',
  private: '전화번호·주소·이메일 같은 개인정보는 넣지 말아요. 빼고 다시 적어 주세요. / Please leave out personal info like phone numbers, addresses or emails.',
  adult: '이 주제는 여기서 쓸 수 없어요. 아래 💡 주제 중에서 골라 볼까요? / This topic can\'t be used here. How about one of the ideas below?',
  swear: '고운 말로 바꿔서 다시 적어 주세요. 아래 💡 주제 중에서 골라도 좋아요. / Please use kind words. You can also pick an idea below.',
};

/** 🖼 비공개 그림을 볼 수 있는가(2026-10-26) — 목록(manage)과 같은 기준.
 *  만든 사람 본인(아이디 완전일치) · 또는 본사(선생님·조직 아님)는 «학생 주제가 아닌» 것만.
 *  ⛔ 학생의 «나만 보는 주제»(stu:)는 본사도 못 본다(목록에서도 빼는 것과 같은 말). */
export function canViewTopicImage(actor: { username: string; isTeacher: boolean; ownOnly?: boolean } | null, row: { created_by?: string | null } | null): boolean {
  if (!actor || !row) return false;
  const me = String(actor.username || ''), owner = String(row.created_by || '');
  if (me && me === owner) return true;
  if (actor.isTeacher || actor.ownOnly) return false;
  return !owner.startsWith(WT_STUDENT_PREFIX);
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
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
/** 고르는 답(1·2단계) — 영어·짧음·중복 없음·최대 3개. 2개도 못 남으면 빈 배열(= 칸을 안 그린다). */
export function normalizeChoices(raw: any, maxWords: number): string[] {
  if (!maxWords || !Array.isArray(raw)) return [];
  const out: string[] = [], seen = new Set<string>();
  for (const c of raw) {
    const t = clean(c, 30).replace(/[.!?]+$/, '');
    if (!t || !isEnglishText(t, 30) || !/[A-Za-z]/.test(t) || wordCount(t) > maxWords) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(t);
    if (out.length >= 3) break;
  }
  return out.length >= 2 ? out : [];
}
export function normalizeQuestion(raw: any, k: string, level: WtLevel | '' = ''): WtQuestion {
  const slot = WT_SLOTS.find(s => s.k === k)!;
  const spec = level ? WT_LEVEL_SPEC[level] : null;
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
  if (spec && wordCount(ex) > spec.exWords) ex = ex.split(/\s+/).slice(0, spec.exWords).join(' ');
  const q: WtQuestion = { k, p: slot.p, ko, en, starter, ph: '예) ' + ex };
  const ch = normalizeChoices(raw && raw.choices, spec ? spec.choiceWords : 0);
  if (ch.length) q.choices = ch;
  return q;
}

/** LLM 초안 → 화면에 그대로 내보낼 수 있는 모양. 제목은 선생님이 적은 것이 이긴다. */
export function normalizeDraft(raw: any, titleInput: string, levelIn: unknown = ''): WtDraft {
  const level = normalizeLevel(levelIn), spec = level ? WT_LEVEL_SPEC[level] : null;
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
  if (spec) {
    if (spec.needWhy && !keys.includes('why')) keys = SLOT_KEYS.filter(k => keys.includes(k) || k === 'why');
    // 상한을 넘으면 뒤에서부터 덜어 낸다 — 'what'(·4단계 'why')은 남긴다
    while (keys.length > spec.maxQ) {
      const drop = [...keys].reverse().find(k => k !== 'what' && !(spec.needWhy && k === 'why'));
      if (!drop) break;
      keys = keys.filter(k => k !== drop);
    }
  }
  const questions = keys.map(k => normalizeQuestion(given[k], k, level));
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
    // 고르는 답은 편집 칸에 없다 — 같은 칸이면 저장 전 값을 그대로 이어 붙인다(저장 한 번에 사라지지 않게)
    questions: keys.map(k => {
      const q = normalizeQuestion(given[k], k);
      const old = (prev.questions || []).find(x => x && x.k === k);
      const ch = normalizeChoices(old && old.choices, 8);
      if (ch.length) q.choices = ch;
      return q;
    }),
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
  // 📅 숙제 마감일(제안 6) — 지연 ALTER. 실패해도(이미 있음) 그대로 간다.
  try { await env.DB.exec(`ALTER TABLE write_topics ADD COLUMN due_date TEXT`); } catch { /* 있음 */ }
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
    due_date: normalizeDueDate(r.due_date) || '',   // 📅 '' = 숙제 아님
  };
  if (staff) { item.status = r.status; item.created_by = r.created_by || ''; item.image_prompt = r.image_prompt || ''; }
  return item;
}
/** 공개가 아닌 글감의 그림 주소에 «그 한 장 전용» 단기 서명을 붙인다(본인·직원 응답에만 쓴다).
 *  서명을 못 만들면(비밀 미설정) 주소는 그대로 — 그 경우 직원 쿠키로만 열리고 학생 화면에는 안 보인다(막는 쪽). */
async function withImgSig(env: any, item: any, r: any): Promise<any> {
  if (!item || !item.image_url || !r || r.status === 'published') return item;
  try { item.image_url += '?sig=' + encodeURIComponent(await signWtImgSig(Number(r.id), Number(r.image_ver), env)); }
  catch (e: any) { console.warn('[write-topics] img sig:', e?.message); }
  return item;
}
const staffItem = (env: any, row: any) => withImgSig(env, rowToItem(row, true), row);
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

/** 학생 — 로그인 토큰(Authorization: Bearer)만 받는다. 게스트 id 는 계정이 아니라 안 받는다. */
async function studentActor(request: Request, env: any): Promise<any | null> {
  let uid: string | null = null;
  try { uid = await authUidFromRequest(request, new URL(request.url), env); } catch { uid = null; }
  uid = String(uid || '').trim();
  if (!uid || /^guest/i.test(uid)) return null;
  return { ok: true, username: WT_STUDENT_PREFIX + uid, name: '', role: 'student', isTeacher: false, ownOnly: true, student: true };
}

/** 직원 세션이 통과하면 직원, 아니면 학생 토큰, 둘 다 아니면 거절. */
async function actorGate(request: Request, env: any): Promise<{ actor: any } | { res: Response }> {
  let staffRes: Response | null = null;
  if (/mangoi_admin_session=/.test(request.headers.get('Cookie') || '')) {
    const g = await editGate(request, env);
    if ('actor' in g) return g;
    staffRes = g.res;
  }
  const s = await studentActor(request, env);
  if (s) return { actor: s };
  return { res: staffRes || json({ ok: false, error: 'auth_required', message: '로그인하면 나만의 주제를 만들 수 있어요. / Log in to create your own topics.' }, 401) };
}

async function countUsage(env: any, username: string): Promise<{ user: number | null; total: number | null }> {
  const since = Date.now() - 86400000;
  let user: number | null = null, total: number | null = null;
  try { const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM write_topic_gen_log WHERE username = ? AND ts > ?`).bind(username, since).first(); user = r ? Number(r.n) : null; } catch { user = null; }
  try { const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM write_topic_gen_log WHERE ts > ?`).bind(since).first(); total = r ? Number(r.n) : null; } catch { total = null; }
  return { user, total };
}
async function costGateOrRes(env: any, username: string, kind: string, userCap = WT_USER_DAILY_CAP): Promise<{ logId: number | null } | { res: Response }> {
  const used = await countUsage(env, username);
  const g = writeTopicCostGate(used.user, used.total, userCap);
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

const LEVEL_RULE: Record<WtLevel, string> = {
  A1: 'LEVEL: Step 1 (youngest beginners, age 7-9). Ask only 3 or 4 questions. Korean questions must be very short and easy. Examples are 1-3 English words. For EVERY question also add "choices": three different short English answers (1-3 words each) the child can tap. Each choice must read correctly when appended to the starter of that question, like the example.',
  A2: 'LEVEL: Step 2 (beginners). Ask 4 or 5 questions. Examples are 2-5 English words. For EVERY question also add "choices": three different short English answers (2-4 words each) the child can tap. Each choice must read correctly when appended to the starter of that question, like the example.',
  B1: 'LEVEL: Step 3 (intermediate, short essay). Ask 5 or 6 questions. Examples are short phrases.',
  B2: 'LEVEL: Step 4 (high school grade 10, essay). Ask 5 or 6 questions and ALWAYS include "why"; the Korean "why" question asks for two reasons. Examples may be a short clause (4-8 words).',
};
function draftPrompt(title: string, level: WtLevel | '' = ''): string {
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
that will appear in the picture. No scary, violent or sad scenes. No text or letters in the picture description.${level ? '\n' + LEVEL_RULE[level] : ''}`;
}

async function runDraft(env: any, title: string, level: WtLevel | '' = ''): Promise<any> {
  const models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'];
  for (const m of models) {
    try {
      const resp: any = await env.AI.run(m, {
        messages: [{ role: 'user', content: draftPrompt(title, level) }],
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

const unsafeRes = (...texts: unknown[]): Response | null => {
  const k = topicUnsafeKind(...texts);
  return k ? json({ ok: false, error: 'unsafe_topic', kind: k, message: WT_UNSAFE_MSG[k] }, 400) : null;
};

/* 📅📋 숙제 제출(제안 6) — 쓴 글(ai_writing_corrections.topic_id, api-ai.ts 가 적는다)로 센다.
   ⚠️ 그 칸은 지연 ALTER 라 아직 없을 수 있다 — 그때는 «못 셈» 으로 둔다(0건 «아무도 안 냈다» 로 위장하지 않는다). */
async function doneTopicIds(env: any, uid: string): Promise<number[] | null> {
  if (!uid) return null;
  try {
    const rs: any = await env.DB.prepare(`SELECT DISTINCT topic_id FROM ai_writing_corrections WHERE student_uid = ? AND topic_id IS NOT NULL`).bind(uid).all();
    return (rs.results || []).map((r: any) => Number(r.topic_id)).filter((n: number) => Number.isInteger(n) && n > 0);
  } catch { return null; }
}
async function attachSubmitCounts(env: any, manage: any[]): Promise<void> {
  if (!manage.some(it => it.due_date)) return;
  try {
    // 바인드 없이 «숙제인 글감» 으로만 좁힌다(목록 길이와 무관)
    const rs: any = await env.DB.prepare(`SELECT topic_id, COUNT(DISTINCT student_uid) AS n FROM ai_writing_corrections WHERE topic_id IN (SELECT id FROM write_topics WHERE COALESCE(due_date, '') != '') GROUP BY topic_id`).all();
    const m = new Map<number, number>((rs.results || []).map((r: any) => [Number(r.topic_id), Number(r.n) || 0]));
    for (const it of manage) if (it.due_date) it.submit_count = m.get(Number(it.id)) || 0;
  } catch { /* 칸이 아직 없음 — submit_count 를 안 실으면 화면이 «—» 로 그린다 */ }
}
async function submitsList(request: Request, env: any, id: number): Promise<Response> {
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'id_required' }, 400);
  const g = await actorGate(request, env);
  if ('res' in g) return g.res;
  const row: any = await env.DB.prepare(`SELECT id, created_by, status FROM write_topics WHERE id = ?`).bind(id).first();
  if (!row || row.status === 'deleted') return json({ ok: false, error: 'not_found' }, 404);
  if (!canSeeSubmits(g.actor, row)) return json({ ok: false, error: 'not_allowed', message: '제출 명단은 본사와 그 숙제를 낸 선생님만 볼 수 있어요. / Only HQ and the teacher who set this homework can see the list.' }, 403);
  const base = `FROM ai_writing_corrections c WHERE c.topic_id = ? GROUP BY c.student_uid ORDER BY last_at DESC LIMIT 200`;
  const cols = `c.student_uid AS uid, COUNT(*) AS n, MAX(c.created_at) AS last_at, MAX(c.score) AS best`;
  let rs: any;
  try { rs = await env.DB.prepare(`SELECT ${cols}, (SELECT e.korean_name FROM students_erp e WHERE e.user_id = c.student_uid LIMIT 1) AS name ${base}`).bind(id).all(); }
  catch {
    try { rs = await env.DB.prepare(`SELECT ${cols} ${base}`).bind(id).all(); }
    catch { return jsonNoStore({ ok: true, unknown: true, items: [] }); }   // 칸이 아직 없음 = 못 셈
  }
  const items = (rs.results || []).filter((r: any) => r.uid).map((r: any) => ({ uid: String(r.uid), name: String(r.name || ''), n: Number(r.n) || 0, last_at: Number(r.last_at) || 0, best: Number(r.best) || 0 }));
  return jsonNoStore({ ok: true, items });
}

export async function handleWriteTopicsApi(request: Request, url: URL, env: any): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (path !== '/api/class/write-topics' && !path.startsWith('/api/class/write-topics/')) return null;
  try { await ensureWriteTopicTables(env); }
  catch (e: any) { return json({ ok: false, error: 'db_unavailable' }, 503); }

  // 🖼 그림 — 주소에 판(ver)이 있어 1년 캐시. 판이 안 맞으면 404(옛 주소가 새 그림을 보이지 않게).
  const im = path.match(/^\/api\/class\/write-topics\/img\/(\d+)\/(\d+)$/);
  if (im && (method === 'GET' || method === 'HEAD')) {
    const row: any = await env.DB.prepare(`SELECT image_key, image_ver, image_mime, status, created_by FROM write_topics WHERE id = ?`).bind(Number(im[1])).first();
    if (!row || !row.image_key || Number(row.image_ver) !== Number(im[2]) || !env.RECORDINGS) return new Response('not found', { status: 404 });
    // 🔒 (2026-10-26) 공개(published)만 누구나·공개 캐시. 나머지(학생 «나만 보는 주제»·초안·숨김)는
    //   단기 서명 또는 소유자·본사 세션이 있어야 하고 캐시에 남기지 않는다. 남이면 «없음»(존재도 안 알림).
    const isPublic = row.status === 'published';
    if (!isPublic) {
      let allowed = row.status !== 'deleted' && await verifyWtImgSig(Number(im[1]), Number(im[2]), url.searchParams.get('sig') || '', env);
      if (!allowed && row.status !== 'deleted') {
        const hasCred = /mangoi_admin_session=/.test(request.headers.get('Cookie') || '') || /^Bearer\s+\S/.test(request.headers.get('Authorization') || '');
        if (hasCred) { try { const g = await actorGate(request, env); allowed = 'actor' in g && canViewTopicImage(g.actor, row); } catch { allowed = false; } }
      }
      if (!allowed) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const obj = await env.RECORDINGS.get(row.image_key);
    if (!obj) return new Response('not found', { status: 404 });
    return new Response(method === 'HEAD' ? null : obj.body, { headers: {
      'Content-Type': row.image_mime || 'image/jpeg',
      'Cache-Control': isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  }

  if (path !== '/api/class/write-topics') return json({ ok: false, error: 'not_found' }, 404);

  if (method === 'GET' && url.searchParams.has('submits')) return submitsList(request, env, Number(url.searchParams.get('submits')));
  if (method === 'GET') {
    const rs: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE status = 'published' ORDER BY published_at DESC, id DESC LIMIT ?`).bind(WT_LIST_MAX).all();
    const items = (rs.results || []).map((r: any) => rowToItem(r, false));
    // 만들 수 있는 사람인지(쿠키가 있을 때만 묻는다 — 학생 화면은 여기서 끝)
    // 만들 수 있는 사람인지 — 직원 세션 쿠키 또는 학생 로그인 토큰이 있을 때만 묻는다
    const hasCookie = /mangoi_admin_session=/.test(request.headers.get('Cookie') || '');
    const hasBearer = /^Bearer\s+\S/.test(request.headers.get('Authorization') || '');
    if (hasCookie || hasBearer) {
      const g = await actorGate(request, env);
      if ('actor' in g) {
        const a = g.actor;
        // 본사 전체 목록에서도 학생의 «나만 보는 주제» 는 뺀다(본인 것만 본인 목록에)
        const ms: any = (a.isTeacher || a.ownOnly)
          ? await env.DB.prepare(`SELECT * FROM write_topics WHERE created_by = ? AND status != 'deleted' ORDER BY updated_at DESC LIMIT ?`).bind(a.username, WT_LIST_MAX).all()
          : await env.DB.prepare(`SELECT * FROM write_topics WHERE status != 'deleted' AND COALESCE(created_by, '') NOT LIKE 'stu:%' ORDER BY updated_at DESC LIMIT ?`).bind(WT_LIST_MAX).all();
        const manage = await Promise.all((ms.results || []).map((r: any) => staffItem(env, r)));
        const cap = a.student ? WT_STUDENT_DAILY_CAP : WT_USER_DAILY_CAP;
        const used = await countUsage(env, a.username);
        const cg = writeTopicCostGate(used.user, used.total, cap);
        const out: any = { ok: true, items, can_create: true, role: a.student ? 'student' : 'staff', manage, ai_left: cg.left, ai_cap: cap };
        if (a.student) out.done_ids = await doneTopicIds(env, a.username.slice(WT_STUDENT_PREFIX.length));   // null = 못 셈(✓·«마감 지남» 을 안 그린다)
        else await attachSubmitCounts(env, manage);
        return jsonNoStore(out);
      }
      return jsonNoStore({ ok: true, items, can_create: false, manage: [], reason: 'denied' });
    }
    return jsonNoStore({ ok: true, items, can_create: false, manage: [], reason: 'login' });
  }

  if (method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const b: any = await request.json().catch(() => null);
  const action = String(b && b.action || '');
  if (!(WT_ACTIONS as readonly string[]).includes(action)) return json({ ok: false, error: 'unknown_action' }, 400);

  const g = await actorGate(request, env);
  if ('res' in g) return g.res;
  const actor = g.actor;
  const now = Date.now();
  const aiCap = actor.student ? WT_STUDENT_DAILY_CAP : WT_USER_DAILY_CAP;
  if (actor.student && action === 'publish') return json({ ok: false, error: 'student_no_publish', message: '학생이 만든 주제는 나만 볼 수 있어요. / Topics made by students are just for you.' }, 403);

  if (action === 'draft') {
    const title = clean(b.title, WT_TITLE_MAX);
    if (title.length < 2) return json({ ok: false, error: 'title_required', message: '주제를 2글자 이상 적어 주세요. / Please type a title (2+ letters).' }, 400);
    if (actor.student) { const bad = unsafeRes(title); if (bad) return bad; }   // 🛡 AI 를 부르기 «전» — 횟수를 안 쓴다
    if (!env.AI) return json({ ok: false, error: 'ai_unavailable' }, 503);
    const cg = await costGateOrRes(env, actor.username, 'draft', aiCap);
    if ('res' in cg) return cg.res;
    const level = actor.student ? normalizeLevel(b.level) : '';   // 단계 맞춤은 학생 주제만(선생님 글감은 모든 단계에 나간다)
    const raw = await runDraft(env, title, level);
    const d = normalizeDraft(raw, title, level);
    const r: any = await env.DB.prepare(
      `INSERT INTO write_topics (title_ko, title_en, icon, open_line, questions_json, words_json, image_prompt, image_ver, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'draft', ?, ?, ?)`
    ).bind(d.title_ko, d.title_en, d.icon, d.open, JSON.stringify(d.questions), JSON.stringify(d.words), d.image_prompt, actor.username, now, now).run();
    await markLogOk(env, cg.logId);
    const id = Number(r?.meta?.last_row_id);
    const row: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE id = ?`).bind(id).first();
    return json({ ok: true, item: await staffItem(env, row), ai_used: !!raw });
  }

  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'id_required' }, 400);
  const row: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE id = ?`).bind(id).first();
  if (!row || row.status === 'deleted') return json({ ok: false, error: 'not_found' }, 404);
  if (!canEditTopic(actor, row)) return json({ ok: false, error: 'not_owner', message: '내가 만든 글감만 고칠 수 있어요. / You can only edit your own topics.' }, 403);

  if (action === 'save') {
    const d = normalizeSave(b, rowToDraft(row));
    if (actor.student) {
      const bad = unsafeRes(d.title_ko, d.title_en, d.open, d.words.join(' '), d.questions.map(q => [q.ko, q.en, q.starter, q.ph].join(' ')).join(' '));
      if (bad) return bad;
    }
    // 📅 숙제 마감일 — 직원 글감만(학생 주제는 숙제가 아니다). 안 보내면 그대로 둔다.
    let due: string | null | undefined = undefined;
    if (!actor.student && b.due_date !== undefined) {
      due = normalizeDueDate(b.due_date);
      if (due === null) return json({ ok: false, error: 'bad_due_date', message: '마감일을 다시 골라 주세요. / Please pick the due date again.' }, 400);
    }
    await env.DB.prepare(`UPDATE write_topics SET title_ko = ?, title_en = ?, icon = ?, open_line = ?, questions_json = ?, words_json = ?, updated_at = ? WHERE id = ?`)
      .bind(d.title_ko, d.title_en, d.icon, d.open, JSON.stringify(d.questions), JSON.stringify(d.words), now, id).run();
    if (due !== undefined) {
      try { await env.DB.prepare(`UPDATE write_topics SET due_date = ? WHERE id = ?`).bind(due || null, id).run(); }
      catch (e: any) { console.warn('[write-topics] due_date:', e?.message); return json({ ok: false, error: 'due_unavailable', message: '글감은 저장했지만 마감일은 저장하지 못했어요. 잠시 후 다시 저장해 주세요. / Saved, but the due date could not be saved. Please save again.' }, 503); }
    }
    const nr: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE id = ?`).bind(id).first();
    return json({ ok: true, item: await staffItem(env, nr) });
  }
  if (action === 'publish') {
    const d = rowToDraft(row);
    if (!d.title_ko || !d.questions.length) return json({ ok: false, error: 'incomplete' }, 400);
    await env.DB.prepare(`UPDATE write_topics SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?`).bind(now, now, id).run();
    const nr: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE id = ?`).bind(id).first();
    return json({ ok: true, item: await staffItem(env, nr) });
  }
  if (action === 'hide') {
    await env.DB.prepare(`UPDATE write_topics SET status = 'hidden', updated_at = ? WHERE id = ?`).bind(now, id).run();
    const nr: any = await env.DB.prepare(`SELECT * FROM write_topics WHERE id = ?`).bind(id).first();
    return json({ ok: true, item: await staffItem(env, nr) });
  }
  // action === 'image'
  if (!env.AI) return json({ ok: false, error: 'ai_unavailable' }, 503);
  if (!env.RECORDINGS) return json({ ok: false, error: 'storage_unavailable' }, 503);
  const cg = await costGateOrRes(env, actor.username, 'image', aiCap);
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
  return json({ ok: true, item: await staffItem(env, nr) });
}
