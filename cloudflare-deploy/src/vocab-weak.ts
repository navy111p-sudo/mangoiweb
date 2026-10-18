// ═══════════════════════════════════════════════════════════════════════
// 🔁 vocab-weak.ts — «단어장에서 틀린 낱말» 을 웜업·게임으로 다시 가져오기 (2026-10-18)
//    개선안 0순위의 남은 일 · src/index.ts(공동 금지구역) 배선은 사장님 승인(«약점 낱말 넣기»).
//
//   [왜] 단어장(vocabulary)·단어 퀴즈에서 틀린 낱말이 «복습 일정» 에만 남고, 웜업 대화에도
//        게임 문제에도 다시 나오지 않았다. 틀린 것을 «써 보는» 경험이 끊겨 있었다.
//        [잰 것 — 2026-10-18 운영 D1, SELECT 만] 틀린 기록이 있는 낱말 29개(17명) 중
//        실제 학생 6명·11개, 그중 지금 복습 단계가 처음(0)인 것 10개 · 전부 최근 60일 안.
//
//   [규칙 — 단어장 쪽 «약점»]
//     ① 틀린 기록이 있다(wrong_count > 0)
//     ② 지금 복습 단계가 처음(level 0). 2026-10-18 #1608 부터 퀴즈 오답이 level 을 0 으로 되돌리고
//        정답 한 번이면 1 이 되어 빠진다(vocabSrsNext).
//        ⚠️ 그 전에는 퀴즈가 level 을 안 건드려서, 옛 행의 level 0 은 «마지막 답이 오답» 이라는 뜻이 아니다.
//     ③ 오답 ≥ 정답 — 게임 약점과 같은 판정. 위 ⚠️ 의 옛 행 중 «여러 번 맞힌» 낱말을 약점으로 잘못 읽지 않게.
//        [잰 것 — 2026-10-18] ①②④ 를 만족하는 실제 학생 행 10개 중 정답이 오답보다 많은 행은 0개(1:1 이 3개).
//     ④ 최근 60일 — 게임 약점과 «같은 창»(weak-words.ts 의 WEAK_RECENT_DAYS).
//     순서: 최근에 본 것 먼저, 같으면 오답이 많은 것 먼저.
//
//   [쓰는 곳]
//     · 웜업 대화 — 단어장 약점 + 게임 약점(정본 weak-words.ts)을 합쳐 «가끔 하나만» 섞어 쓰게.
//       매 턴 끼워 넣으면 2026-09-03 원장님 제보(「정해진 문장 안에서만 한다」)가 되살아난다 — 문구가 그것을 막는다.
//     · /api/games/vocab — 단어 목록에 약점 낱말을 «먼저» 담는다(단어가 30개를 넘어도 빠지지 않게 — 구조상.
//       [잰 것 — 2026-10-18] 오늘 대상 학생은 단어가 10~17개라 이 순서가 바꾸는 것은 아직 없다).
//     · /api/games/weak  — vocab_weak 칸으로 따로 실어 게임 허브가 복습 큐에 넣는다.
//       ⛔ weak(게임 기록) 배열에는 섞지 않는다 — 교사용 게임 리포트가 그 배열을
//          «게임에서 자주 틀린 단어» 로 그린다(출처를 거짓으로 말하게 된다).
//     · A.i 친구(api-ai.ts chat-friend) — 단어장 약점 + 게임 약점을 «낱말 (뜻)» 으로 합쳐 프롬프트에(friendWeakList).
//       그 경로는 원래부터 토큰 uid == 요청 uid 일 때만 돈다(그 확인을 지나서 부른다). 기초(S1~S3)는 원래대로 안 넣는다.
//     ⛔ 웜업·games/weak 둘 다 «본인 확인»(토큰 uid 또는 같은 이름의 관리자 세션)이 될 때만 읽는다.
//        user_id 는 화면이 보내는 값이고, 단어장의 «틀린 기록» 은 /api/vocab/list 에서도 본인에게만 보인다(gateVocabOwner).
//        판정은 index.ts 의 vocabWeakCallerVerified 하나 — 캐시를 읽기 «전» 에 매번 묻는다.
//
//   ⛔ 던지지 않는다 — 조회가 실패하면 빈 목록. 웜업·게임이 멈추면 안 된다.
//   ⛔ uid 는 정확일치(`Kim`/`kim` 처럼 대소문자만 다른 실제 계정이 있다).
//   ⛔ 기록을 지우거나 바꾸지 않는다(읽기만).
//   ⚠️ 하니스가 import 줄을 떼고 weak-words.ts 와 이어 붙여 그대로 돌린다 — 새 import 를 늘리지 말 것.
// ═══════════════════════════════════════════════════════════════════════
import { WEAK_WHERE, WEAK_ORDER, weakSince } from './weak-words';

/** 단어장 «마지막으로 본 시각» — 복습한 적 없으면 넣은 시각 */
const VOCAB_SEEN = 'COALESCE(last_reviewed_at, created_at, 0)';

/** WHERE 에 덧붙일 조각 — 바인드 1개(weakSince 값)를 받는다. */
export const VOCAB_WEAK_WHERE = `wrong_count > 0 AND COALESCE(level, 0) = 0 AND wrong_count >= COALESCE(correct_count, 0) AND ${VOCAB_SEEN} >= ?`;

/** ORDER BY 조각(앞에 ORDER BY 를 붙이지 않는다). */
export const VOCAB_WEAK_ORDER = `${VOCAB_SEEN} DESC, wrong_count DESC, id DESC`;

/** 웜업 프롬프트에 넣을 최대 개수 — 기초(1~2단계·미지정)는 1개만 */
export const WEAK_WORDS_MAX = 3;
export const WEAK_WORDS_MAX_BEGINNER = 1;

/** 게임(/api/games/vocab 의 앞자리 · /api/games/weak 의 vocab_weak)에 실을 최대 개수 — 두 곳이 같아야
 *  허브가 vocab_weak 의 낱말을 단어 목록에서 모두 찾는다(다르면 남는 낱말이 조용히 빠진다). */
export const VOCAB_WEAK_GAME_MAX = 8;

/** 짧은 영어 낱말·표현만(30자 · 4낱말 이하). 따옴표·백슬래시는 떼어 프롬프트 문장을 깨지 않게. 안 되면 ''. */
export function cleanWeakWord(raw: any): string {
  const s = String(raw == null ? '' : raw).replace(/["\\`]/g, '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 30) return '';
  if (!/[A-Za-z]/.test(s)) return '';
  if (!/^[A-Za-z0-9' .,!?-]+$/.test(s)) return '';            // 한글·한자·병음(성조 부호)이 섞이면 버린다
  if (s.split(' ').length > 4) return '';                       // 문장은 낱말이 아니다(게임 기록에는 문장도 있다)
  return s;
}

/** 앞 목록을 먼저, 대소문자 무시 중복 제거, 최대 max 개 */
export function mergeWeakFirst<T>(first: T[], rest: T[], max: number, keyOf: (x: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const x of [...(first || []), ...(rest || [])]) {
    const k = String(keyOf(x) || '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

/** 단어장 약점 행(word, korean) — 실패하면 []. */
export async function loadVocabWeakRows(db: any, uid: string, nowMs: number, limit = 8): Promise<Array<{ word: string; korean: string }>> {
  if (!db || !uid) return [];
  try {
    const rs = await db.prepare(
      `SELECT word, korean FROM vocabulary WHERE user_id = ? AND ${VOCAB_WEAK_WHERE} ORDER BY ${VOCAB_WEAK_ORDER} LIMIT ?`
    ).bind(uid, weakSince(nowMs), Math.max(1, Math.min(20, Math.floor(Number(limit) || 8)))).all();
    return ((rs && rs.results) || []).map((r: any) => ({ word: String(r.word || ''), korean: String(r.korean || '') }));
  } catch { return []; }
}

/** 웜업에 쓸 약점 낱말 — 단어장 약점이 먼저, 다음 게임 약점(영어). 최대 WEAK_WORDS_MAX 개. 실패하면 []. */
export async function loadWeakWordsForWarmup(db: any, uid: string, nowMs: number): Promise<string[]> {
  if (!db || !uid) return [];
  const vocab = (await loadVocabWeakRows(db, uid, nowMs, 6)).map((r) => cleanWeakWord(r.word)).filter(Boolean);
  let game: string[] = [];
  try {
    const rs = await db.prepare(
      `SELECT item FROM game_progress WHERE user_id = ? AND lang = 'en' AND ${WEAK_WHERE} ORDER BY ${WEAK_ORDER} LIMIT 8`
    ).bind(uid, weakSince(nowMs)).all();
    game = ((rs && rs.results) || []).map((r: any) => cleanWeakWord(r.item)).filter(Boolean);
  } catch { game = []; }   // 표가 아직 없는 DB 등 — 단어장 쪽만 쓴다
  return mergeWeakFirst(vocab, game, WEAK_WORDS_MAX, (w) => w);
}

/** 뜻(한국어) 정리 — 따옴표·줄바꿈을 떼고, 30자를 넘으면 뜻은 빼고 낱말만 쓴다(''). */
export function cleanWeakKo(raw: any): string {
  const s = String(raw == null ? '' : raw).replace(/["\\`]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > 30 ? '' : s;
}

/** A.i 친구 프롬프트용 «낱말 (뜻)» 목록 — 단어장 약점 먼저, 게임 약점 다음, 대소문자 무시 중복 제거, 최대 max 개.
 *  ⛔ 단어장 낱말은 cleanWeakWord 를 지난 것만(한글·문장·따옴표). 게임 약점은 예전 그대로(이미 lang='en' · 정본 WEAK_WHERE). */
export function friendWeakList(vocabRows: any[], gameRows: any[], max = 5): string[] {
  const v = (vocabRows || []).map((r: any) => ({ item: cleanWeakWord(r && r.word), ko: cleanWeakKo(r && r.korean) })).filter((x) => x.item);
  const g = (gameRows || []).map((r: any) => ({ item: String((r && r.item) || ''), ko: String((r && r.ko) || '') })).filter((x) => x.item);
  return mergeWeakFirst(v, g, max, (x) => x.item).map((x) => (x.ko ? `${x.item} (${x.ko})` : x.item));
}

/** 웜업 시스템 프롬프트에 붙일 한 줄 — 없으면 ''. 기초는 1개만. */
export function weakWordsPromptLine(words: string[], beginner: boolean): string {
  const max = beginner ? WEAK_WORDS_MAX_BEGINNER : WEAK_WORDS_MAX;
  const list = mergeWeakFirst((words || []).map(cleanWeakWord).filter(Boolean), [], max, (w) => w);
  if (!list.length) return '';
  return `\nThis student recently missed these words in their word book or games: ${list.map((w) => `"${w}"`).join(' / ')}.\n`
    + 'Only now and then (about once every few replies, never two replies in a row), when it fits the chat naturally, use ONE of them in a question or in your own sentence so the student gets a chance to say it. '
    + 'Never change the topic for it, never list or quiz these words, never mention that they were missed, and never let this break the level rule. If they use it well, a short natural word of praise is enough.';
}

/** 웜업에서 약점 낱말을 읽어도 되는가 — 요청 user_id 가 «본인» 으로 확인될 때만(정확일치). */
export function weakWordsCallerOk(uid: string, tokUid: any, sesUsername: any): boolean {
  const u = String(uid || '');
  if (!u) return false;
  if (tokUid != null && String(tokUid) === u) return true;
  if (sesUsername != null && String(sesUsername) === u) return true;
  return false;
}
