/**
 * english-only.ts — 영어 학습 콘텐츠 «영어만» 게이트 (판정 정본)
 *
 * ⚠️ 이 저장소의 복습퀴즈 은행 `review_quizzes` 는 **영어 전용 표가 아니다** —
 *    중국어 교재 「다락원」이 같은 표에 들어 있다(2026-08-26 실측: 활성 31건 중 15건).
 *    그래서 「영어 문장인가」를 라틴 글자 유무로 판정하면 **병음이 그대로 통과한다.**
 *
 * 이 파일을 쓰는 곳 (규칙을 복사하지 말고 여기서 import 할 것)
 *   src/warmup-graph.ts : 웜업 취약문장 ETL·조회
 *   src/index.ts        : warmupLessonContext · handleGamesVocab · handleGamesLessons
 *
 * ℹ️ 중국어 학습 콘텐츠에는 «따로 마련된 길» 이 있다 — `zh_vocab` 표와
 *    `/api/games/zh-vocab` · `/api/games/zh-passage`. 그래서 영어 쪽에서 중국어를
 *    걸러 내도 중국어 학습이 손해 보지 않는다.
 */

/* ── 게이트 두 겹 ────────────────────────────────────────────────
 *  [왜 생겼나] 2026-08-26 사장님 제보 — 「수업 전 AI 웜업」 첫 화면의
 *    «🎯 오늘의 연습 포인트» 에 중국어 병음 "cāochǎng"·"shuāngyǎnpí" 가 떴다.
 *    웜업은 영어 전용 화면인데(WARMUP_SYSTEM 「네 대사는 반드시 영어로」) 왜 중국어냐면 —
 *    복습퀴즈 은행(review_quizzes)이 «영어 전용 표가 아니다». 실측(2026-08-26): 활성 퀴즈
 *    31건 중 15건이 중국어 교재 「다락원」이고, 그 안에 이런 문항이 있다.
 *        { type:'write', q:'🔤 다음 한자의 병음을 알파벳으로 쓰세요: (한자)',
 *          answer_text:'cāochǎng', explain:'(한자) (cāochǎng) = 운동장' }
 *    옛 판정은 `/[a-zA-Z]/.test(s)` — 「라틴 글자가 한 자라도 있으면 영어」였다.
 *    병음은 라틴 글자로 적으므로 **그 검사를 그대로 통과**한다. 그래서 학생 `jeong` 이
 *    다락원 퀴즈(28·30번)에서 틀린 병음이 Neo4j 취약문장으로 적재되고, 영어 웜업 화면에
 *    「오늘의 연습 포인트」로 되돌아 나왔다.
 *
 *  [규칙] 두 겹이다 — 한쪽만으로는 못 막는다.
 *    ① 글자 게이트 isEnglishText() : ASCII 인쇄가능 문자(+따옴표·대시 몇 종)만 허용.
 *       성조부호(ā·ǎ·ě·ù…)·한자·한글·가나가 한 자라도 있으면 영어가 아니다.
 *       ⚠️ 이 게이트가 **이미 Neo4j 에 들어간 옛 데이터까지** 막는다(읽을 때 거른다) —
 *          그래프를 다시 쓰지 않고도 화면이 바로 깨끗해지는 유일한 자리다.
 *    ② 문항 게이트 isEnglishQuestion() : 문항 자체가 중국어·일본어 강의면 통째로 건너뛴다.
 *       ①만 두면 **성조부호 없는 병음**(accept:['caochang'] 같은 표기)이 언젠가 answer_text
 *       자리에 들어올 때 그대로 새어 나온다. 문제 지문에 남는 «한자·병음·중국어» 흔적으로 가른다.
 *
 *  ⛔ 「두 낱말 이상만 통과」로 풀지 말 것 — 영어 교재의 정답이 한 낱말인 문항이 실제로 많다
 *     (BTS 2 «빨간색의 영어 단어를 쓰세요» → answer_text:'red'). 그걸 같이 버리게 된다.
 *  ⚠️ 한글은 ②에서 «중국어 표시» 로 치지 않는다 — 이 표의 문제 지문은 원래 한국어다.
 *     ①이 결과 문자열에서 한글을 이미 막으므로 겹쳐서 막을 필요도 없다. */

/** ① 결과로 내보낼 «문장» 이 영어인가 — ASCII + 흔한 따옴표·대시만 허용
 *  @param maxLen 길이 상한. 부르는 쪽이 정한다 — 웜업 문장 80 · 게임 문장 90 · 단어장 낱말 30.
 *                (옛 코드가 자리마다 다른 상한을 쓰고 있었고, 그것까지 80으로 좁히면
 *                 «고치려던 것» 이 아니라 «되던 것» 을 깨는 변경이 된다.) */
export function isEnglishText(raw: unknown, maxLen = 80): boolean {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s.length > maxLen) return false;
  if (!/[A-Za-z]/.test(s)) return false;               // 라틴 글자가 아예 없으면 문장이 아니다
  // \u2018\u2019 = ‘’ · \u201c\u201d = “” · \u2013\u2014 = –— · \u2026 = …
  return /^[\x20-\x7E\u2018\u2019\u201c\u201d\u2013\u2014\u2026]+$/.test(s);
}

/** 한자(CJK 통합·확장A·호환)·가나 — 한글(가-힯)은 «일부러» 뺐다(위 주석 참고) */
const CJK_KANA_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
/** 중국어·일본어 강의임을 드러내는 한국어 표시어 */
const FOREIGN_COURSE_RE = /(중국어|일본어|한자|병음)/;

/** ② 이 문항이 영어 학습 문항인가 — 중국어·일본어 문항이면 문장을 하나도 꺼내지 않는다 */
export function isEnglishQuestion(q: unknown): boolean {
  if (!q || typeof q !== 'object') return false;
  const o = q as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of ['q', 'explain', 'answer_text', 'audio_text', 'target']) parts.push(String(o[k] == null ? '' : o[k]));
  if (Array.isArray(o.opts)) for (const v of o.opts) parts.push(String(v == null ? '' : v));
  if (Array.isArray(o.accept)) for (const v of o.accept) parts.push(String(v == null ? '' : v));
  const blob = parts.join(' ');
  return !CJK_KANA_RE.test(blob) && !FOREIGN_COURSE_RE.test(blob);
}
