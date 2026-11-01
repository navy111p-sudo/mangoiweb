/**
 * branch-ai-help.ts — 🤖 지사 화면(branch.html) 「통합 검색」의 AI 도우미 (2026-10-14 사장님)
 *
 * 사장님 지시: 「궁금한 점을 물어보면 AI 가 답변을 추천해 주거나, 어느 메뉴에 그 기능·정보가
 *   있는지 알려 주는 것」 → 「testbranch 계정에만 일단 넣어줘」.
 *
 * 하는 일은 둘뿐이다:
 *   ① 사용법 질문에 짧게 답한다        ② 이 화면의 어느 카드에 그것이 있는지 알려 준다
 * ⛔ 데이터를 꺼내거나(조회) 무언가를 실행하지 않는다. 관리자용 엔진(ai-command.ts)은 회사 전체 DB 를
 *    보므로 지사에 열면 남의 지사 학생·매출이 샌다. 그래서 그 엔진을 재사용하지 않고 «답 + 메뉴» 로만 좁혔다.
 *
 * 🔒 계정 게이트는 서버가 한다(BRANCH_AI_USERS) — 화면에서만 감추면 URL 로 뚫린다.
 *    다른 계정으로 넓히려면 그 목록에 한 줄 더하면 된다(정확일치 · 대소문자 무시).
 * 🔗 카드 목록(BRANCH_AI_CARDS)은 branch.html 의 <details id="c-…"> 와 짝이다 — 화면에 없는 id 를 넣으면
 *    «눌러도 아무 일 없는» 버튼이 된다(하니스가 대조한다). 화면이 그 카드를 감춘 계정이면 화면이 거른다.
 * ⛔ 모델이 준 카드 id 는 이 목록에 있을 때만 쓴다(지어낸 id 를 화면에 보내지 않는다).
 * ⛔ 모델이 실패하면 «지어내지 않고» 낱말 일치로 찾은 메뉴만 정직하게 돌려준다(used_ai:false).
 */

export const BRANCH_AI_USERS: readonly string[] = ['testbranch'];
/** 계정당 하루 질문 상한 — 무료 Workers AI 한도를 지킨다. */
export const BRANCH_AI_DAILY_CAP = 60;
export const BRANCH_AI_MAX_Q = 300;
export const BRANCH_AI_MAX_ANSWER = 700;
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export interface BranchAiCard { id: string; ko: string; en: string; about: string; kw: string[] }

export const BRANCH_AI_CARDS: readonly BranchAiCard[] = [
  { id: 'c-org', ko: '가맹점 · 대리점 명부', en: 'Franchise & academy roster',
    about: 'list of academies(agencies) under this branch, their managers and student counts',
    kw: ['대리점', '가맹점', '학원', '명부', '원장', '소속', 'academy', 'agency', 'franchise', 'roster'] },
  { id: 'c-students', ko: '우리 학생 명부', en: 'My students',
    about: 'student list of this branch: search by name or ID, filter by academy, class type, schedule',
    kw: ['학생', '명부', '아이디', '수강', '예약', 'student', 'students', 'list'] },
  { id: 'c-flow', ko: '학생 흐름 (30일)', en: 'Student flow (30 days)',
    about: 'new, ended, returning students over the last 30 days',
    kw: ['흐름', '신규', '이탈', '그만', '증가', '감소', 'new', 'churn', 'flow'] },
  { id: 'c-attn', ko: '학원별 출석 현황', en: 'Attendance by academy',
    about: 'attendance rate per academy',
    kw: ['출석', '결석', '출결', 'attendance', 'absent'] },
  { id: 'c-aiusage', ko: 'AI 학습도구 활용 학생', en: 'AI tool usage',
    about: 'which students use the AI learning tools (speaking practice, AI friend, writing, vocabulary, quizzes)',
    kw: ['ai', '학습도구', '단어', '퀴즈', '말하기', '글쓰기', '발음', 'vocab', 'quiz', 'tool'] },
  { id: 'c-today', ko: '오늘 전체 수업', en: 'All classes today',
    about: 'all classes today with teacher and student; pick a date to see past classes; join button for live rooms',
    kw: ['수업', '오늘', '시간표', '강사', '선생님', '입장', '날짜', 'class', 'classes', 'today', 'teacher', 'schedule'] },
  { id: 'c-trend', ko: '30일 추이', en: '30-day trend',
    about: 'daily revenue and student count chart for the last 30 days',
    kw: ['추이', '그래프', '차트', '매출', '추세', 'trend', 'chart', 'revenue'] },
  { id: 'c-settle', ko: '대리점별 정산', en: 'Settlement by agency',
    about: 'this month settlement amounts per academy; pick a month',
    kw: ['정산', '수수료', '매출', '돈', '금액', '입금', 'settlement', 'payout', 'fee'] },
  { id: 'c-aibill', ko: 'AI 사용료 청구서', en: 'AI usage invoice',
    about: 'AI usage invoice for an academy account (only shown to academy accounts)',
    kw: ['청구서', '사용료', '결제', 'invoice', 'bill'] },
  { id: 'c-search', ko: '통합 검색', en: 'Search',
    about: 'find a student or teacher by name',
    kw: ['검색', '찾기', 'search', 'find'] },
  { id: 'c-me', ko: '내 계정', en: 'My account',
    about: 'my ID, name, role; link to change password, login history, sessions',
    kw: ['계정', '비밀번호', '비번', '로그인', '내 정보', 'password', 'account', 'login'] },
];

const CARD_IDS = new Set(BRANCH_AI_CARDS.map(c => c.id));

/** 서버 게이트 — 목록에 있는 계정만(정확일치·대소문자 무시). 모르면(빈 값) 막는다. */
export function branchAiAllowed(username: unknown): boolean {
  const u = String(username ?? '').trim().toLowerCase();
  if (!u) return false;
  return BRANCH_AI_USERS.some(x => x.toLowerCase() === u);
}

/** 모델을 못 쓸 때의 정직한 폴백 — 질문 낱말과 카드 낱말이 겹치는 것만(많이 겹친 순, 최대 3). */
export function keywordCards(q: unknown): string[] {
  const s = String(q ?? '').toLowerCase();
  if (!s.trim()) return [];
  const scored: Array<{ id: string; n: number }> = [];
  for (const c of BRANCH_AI_CARDS) {
    let n = 0;
    for (const k of c.kw) if (k && s.indexOf(k.toLowerCase()) >= 0) n++;
    if (n > 0) scored.push({ id: c.id, n });
  }
  scored.sort((a, b) => b.n - a.n);
  return scored.slice(0, 3).map(x => x.id);
}

export function buildBranchAiMessages(q: string, lang: 'ko' | 'en') {
  const cards = BRANCH_AI_CARDS.map(c => `- ${c.id}: ${lang === 'en' ? c.en : c.ko} — ${c.about}`).join('\n');
  const L = lang === 'en' ? 'English' : 'Korean';
  const system = `You are the help assistant of the Mangoi branch-manager dashboard (an online English academy).
The user is a branch manager. Answer HOW TO use this dashboard and WHERE things are. You cannot see any data.
Output ONE JSON object only, no markdown:
{"answer":"<2-4 short sentences in ${L}>","cards":["<card id>", ...]}
Rules:
- "cards": 0 to 3 ids from the list below that best match the question, most relevant first. Never invent ids.
- Never invent numbers, names or facts about students, money or classes — say which card shows it instead.
- If something is not on this dashboard (e.g. changing a class time, refunds, approving postpone requests), say it is handled by the head office (본사) and give an empty or closest card list.
- Class postpone/change requests are not handled on this dashboard (head office handles them).
- Keep it friendly and short. Answer in ${L}.
Cards on this dashboard:
${cards}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: q },
  ];
}

/** 모델 응답 읽기 — 문자열·이미 파싱된 객체 둘 다 받는다(CLAUDE.md 「[object Object]」 함정). */
export function parseBranchAiReply(raw: unknown): { answer: string; cards: string[] } {
  let obj: any = null;
  if (raw && typeof raw === 'object') obj = raw;
  else {
    const s = String(raw ?? '').replace(/```(?:json)?/gi, '').trim();
    const st = s.indexOf('{'), en = s.lastIndexOf('}');
    if (st >= 0 && en > st) { try { obj = JSON.parse(s.slice(st, en + 1)); } catch { obj = null; } }
    if (!obj && s && s.indexOf('{') < 0) obj = { answer: s, cards: [] };   // 평문으로 답한 경우
  }
  let answer = obj && typeof obj.answer === 'string' ? obj.answer.trim() : '';
  // JSON 흔적·[object …] 가 남은 답은 내보내지 않는다
  if (/\[object\s|"answer"\s*:|^\{/.test(answer)) answer = '';
  if (answer.length > BRANCH_AI_MAX_ANSWER) answer = answer.slice(0, BRANCH_AI_MAX_ANSWER) + '…';
  const cardsIn = obj && Array.isArray(obj.cards) ? obj.cards : [];
  const cards: string[] = [];
  for (const c of cardsIn) {
    const id = String(c ?? '').trim();
    if (CARD_IDS.has(id) && cards.indexOf(id) < 0) cards.push(id);
    if (cards.length >= 3) break;
  }
  return { answer, cards };
}

function kstDay(now = Date.now()): string {
  return new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
}

/** 한 번 묻기 — 게이트·상한·모델·폴백을 모두 여기서. 던지지 않는다. */
export async function runBranchAiHelp(env: any, username: string, body: any): Promise<{ status: number; body: any }> {
  if (!branchAiAllowed(username)) return { status: 403, body: { ok: false, error: 'forbidden_ai_help' } };
  const lang: 'ko' | 'en' = body?.lang === 'en' ? 'en' : 'ko';
  const q = String(body?.q ?? '').trim();
  if (!q) return { status: 400, body: { ok: false, error: 'q_required' } };
  if (q.length > BRANCH_AI_MAX_Q) return { status: 400, body: { ok: false, error: 'q_too_long', max: BRANCH_AI_MAX_Q } };

  // 하루 상한 — KV 를 못 읽으면 막지 않는다(fail-open: 시연 계정 하나라 비용 위험이 작다).
  const capKey = `branch_ai_help:${username.toLowerCase()}:${kstDay()}`;
  let used = 0;
  try { used = Number(await env.SESSION_STATE?.get?.(capKey)) || 0; } catch { used = 0; }
  if (used >= BRANCH_AI_DAILY_CAP) {
    return { status: 200, body: { ok: true, used_ai: false, capped: true,
      answer: lang === 'en' ? `Today's AI question limit (${BRANCH_AI_DAILY_CAP}) is used up. Showing related menus only.`
                            : `오늘 AI 질문 한도(${BRANCH_AI_DAILY_CAP}회)를 다 썼습니다. 관련 메뉴만 찾아 드립니다.`,
      cards: keywordCards(q) } };
  }
  try { await env.SESSION_STATE?.put?.(capKey, String(used + 1), { expirationTtl: 172800 }); } catch {}

  let parsed = { answer: '', cards: [] as string[] };
  if (env.AI) {
    try {
      const r: any = await env.AI.run(MODEL, { messages: buildBranchAiMessages(q, lang), max_tokens: 400, temperature: 0.2 });
      const raw = r?.response ?? r?.result?.response ?? r;
      parsed = parseBranchAiReply(raw);
    } catch (e: any) {
      console.warn('[branch-ai-help] model failed:', e?.message || e);
    }
  }
  if (!parsed.answer) {
    const cards = parsed.cards.length ? parsed.cards : keywordCards(q);
    return { status: 200, body: { ok: true, used_ai: false,
      answer: lang === 'en' ? 'The AI could not answer right now. These menus look related:'
                            : 'AI 가 지금 답을 만들지 못했습니다. 관련 있어 보이는 메뉴입니다:',
      cards } };
  }
  return { status: 200, body: { ok: true, used_ai: true, answer: parsed.answer, cards: parsed.cards } };
}
