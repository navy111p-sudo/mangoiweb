/**
 * 🔗 conversation-connectors.ts — 아바타 대화의 «연결 표현» 정본 (2026-10-28)
 *
 * [발단] 사장님 「미국 사람이 일상 대화에서 쓰는 접속사·담화 표지(So, Well, Actually, By the way …)를
 *        상황에 맞게 써서, 친근한 영어 선생님과 대화하는 느낌을 주게 해 줘. 매 문장에 붙이지 말고,
 *        같은 말로 반복해서 시작하지 말고, 학생 수준에 맞게. 후처리로 덧붙이지 말고 프롬프트에 반영해.」
 *
 * [쓰는 곳 — 세 화면이 «같은 규칙» 을 본다]
 *   · A.i 선생님 수업  — src/class-ask.ts 의 buildClassAskMessages (한 번 묻고 답하는 즉답 · 기록 없음)
 *   · A.i 말하기 연습  — src/index.ts 의 handleWarmupChat (웜업 · 엘리더잼 L1 도 이 엔진을 지난다)
 *   · AI 친구(망고아이) — src/api-ai.ts 의 /api/ai/chat-friend
 *   ⛔ 규칙 문장을 부르는 쪽에 복제하지 마세요 — 세 화면이 서로 다른 말을 하기 시작합니다
 *      (CLAUDE.md 2장 「두 화면이 다른 기준을 쓰면 «화면마다 답이 다른» 사고」).
 *
 * [하는 일] ① 수준(초급·중급·고급)별 «연결 표현 규칙» 을 영어 지시문으로 만든다(connectorRule)
 *          ② 최근 답장이 어떤 말로 «시작» 했는지 읽어, 이번에는 다르게 시작하라고 지시에 싣는다(openerAvoidLine)
 *          ③ 하니스·배포 뒤 측정용으로 «답장 한 개의 문제» 를 결정론으로 잰다(connectorIssues — 대화 중에는 안 부른다)
 *
 * ⛔ 답장에 연결 표현을 «덧붙이거나 바꿔 쓰는» 후처리는 하지 않는다 — 사장님이 명시적으로 막으셨고,
 *    아이가 그대로 따라 읽을 문장을 코드가 지어내면 안 된다(이 저장소의 반복 규칙).
 * ⛔ connectorIssues 를 대화 경로의 «다시 뽑기» 조건으로 쓰지 마세요 — 휴리스틱이라 거짓 경보가 있고,
 *    그때마다 모델을 한 번 더 불러 학생이 기다립니다. 측정용입니다.
 * ⚠️ 수준 규칙(ai-friend-level.ts 의 A1 「No commas, no because, no but」, 웜업 1단계 «3~5단어»)이
 *    이 목록보다 «언제나» 이긴다 — 지시문 첫 줄이 그렇게 말한다. 연결어가 문법 낱말을 밀어내면
 *    「By the way, like space?」가 된다(CLAUDE.md 2장 · src/reply-questions.ts).
 * ⛔ 이 파일은 import 가 없다 — 하니스가 타입만 벗겨 «실제로 돌려서» 검증한다.
 */

export type LinkBand = 'beginner' | 'intermediate' | 'advanced';

/** 대화 난이도 1~8(웜업 슬라이더·AI 친구 S1~S8 과 같은 눈금) → 연결 표현 수준.
 *  ⚠️ 0·모르는 값은 «초급» — 웜업이 «미지정» 을 기초로 다루는 것과 같은 방향(CLAUDE.md 「기초(1~2단계·미지정)」). */
export function linkBandForStep(step: any): LinkBand {
  const n = Math.floor(Number(step));
  if (!(n >= 1 && n <= 8)) return 'beginner';
  if (n <= 3) return 'beginner';
  if (n <= 5) return 'intermediate';
  return 'advanced';
}

/** AI 친구 레벨 키('S1'~'S8') → 수준. 옛 키(A1…C1)는 부르는 쪽이 aiFriendNormalizeLevel 로 먼저 바꾼다. */
export function linkBandForFriendLevel(level: any): LinkBand {
  const m = /^S([1-8])$/.exec(String(level == null ? '' : level).trim().toUpperCase());
  return linkBandForStep(m ? Number(m[1]) : 0);
}

/* ── ① 규칙 문장 ──────────────────────────────────────────────────────────────
 *  🔗 «뜻으로 고른다» 표 — 사장님이 주신 목록 그대로이고, 문법 분류(접속사·접속부사)와
 *     «대화에서의 쓰임»(담화 표지)을 나눠 적었다. 모델은 이 줄을 «언제 쓰는가» 로 읽는다.
 *  ⛔ however·therefore·moreover 는 «일상 회화 기본 말투» 에서 뺀다 — 고급에서 «차근차근 설명할 때» 만.
 *     (엘리더잼 L1 의 회전 목록에 있던 Moreover·Of course 도 같은 날 뺐다 — src/eleader-l1.ts L1_LINKS) */
const CORE_RULE = [
  'LINKING WORDS - sound like a friendly American teacher talking, not a textbook. Your LEVEL rule wins over this section: if it bans a word ("no but", "no commas"), obey the LEVEL rule. If another part of these instructions names the exact linking word for this turn, use that word; it counts as your one linking word.',
  '- Respond to what the learner actually said first. Add a linking word only when it helps; many good replies have none. Never start every reply or every sentence with one.',
  '- Pick by meaning, never at random: and / also / plus / too = adding; but / though / still = contrast; so = result; because = reason; or = choice; if / unless / when / while / before / after = condition or time.',
  '- Talk markers: "So," opens or moves the talk on (different from "so" = result); "Well," = thinking or a gentle answer, not at the start of every reply; "Actually," = a correction or surprising fact, never to keep correcting the learner; "By the way," = a related new topic, only after you responded to their answer; "Anyway," = back to the point or wrapping up, never right after the learner shared something; "I mean," = really restating; "For example,"; "Oh, and" = something you just remembered; "To be honest," = an honest opinion, never to pretend you have personal experiences or feelings.',
  '- Natural spoken contractions (I\'m, it\'s, don\'t). No heavy slang and no filler habits ("like", "you know").',
  '- Keep it short so the learner talks more, with at most ONE question. Do not stop the chat to explain a linking word unless the learner asks.',
].join('\n');

const BAND_RULE: Record<LinkBand, string> = {
  beginner: '- BEGINNER learner: at most ONE easy linking word per reply (and, but, so, because, or, too, also), often none. It never replaces grammar words and does not count toward your word limit: "So, do you like cats?" or "I like cats too!", never "So, like cats?". Do not use however, therefore, moreover, even though, unless, as soon as, basically, I mean or to be honest.',
  intermediate: '- INTERMEDIATE learner: a little more variety is good (because, so, but, when, if, before / after, plus, and "though" at the end for a light contrast: "It\'s a bit pricey, though."). "So,", "Well,", "Oh, and" or "By the way," once in a while, not every reply. No however, therefore or moreover in this casual chat.',
  advanced: '- ADVANCED learner: use the full range naturally (even though, unless, as soon as, still, actually, I mean, basically, to be honest, anyway) and join two ideas in one sentence when it sounds natural. Use however, therefore or moreover only when carefully explaining something, never as your normal chat voice.',
};

/** 수준별 연결 표현 규칙(영어 지시문). 세 화면이 이 한 함수를 본다. */
export function connectorRule(band: LinkBand): string {
  const b: LinkBand = BAND_RULE[band] ? band : 'beginner';
  return CORE_RULE + '\n' + BAND_RULE[b];
}

/** Speaking practice and AI friend only; completed replies, never waiting audio.
 *  🗣️ (2026-11-04 사장님 「아직 안 됐어?」) 첫 판(PR #2025)은 «가끔 써라 · 많은 답에는 없다 · 좁으면 빼라» 라서
 *     모델이 거의 안 썼다. 이제 «이번 턴에 쓸지·무슨 말 후보인지» 는 서버가 정하고(아래 ④ turnOpenerLine),
 *     이 글은 «어떻게 말하나» 만 말한다.
 *  ⛔ 소리형(hmm·aww·ooh·uh·um)은 쓰지 않는다(2026-11-04 사장님 결정 — 음성 엔진 발음).
 *  ⚡ 속도: 첫마디는 «짧은 반응·칭찬 자리» 를 대신한다 — 답이 길어지지 않는다. 이 글 + ④ 한 줄을 합쳐도
 *     첫 판(1,221자)보다 짧다(하니스 ⑧이 잰다 — 지시가 길수록 첫 글자가 늦다). */
export const AVATAR_NATURAL_OPENERS = [
  'NATURAL OPENERS: real people often start with a short word that shows they heard you. Use one only when a THIS TURN\'S OPENER line asks for it. On other turns do not start with Oh, Well, By the way or Anyway.',
  '- Clear standard English: normal spelling, no stretched letters (weeell, oooh), no sound words (hmm, aww, ooh, uh, um), no stage directions, SSML or "...". Never invent experiences.',
  '- LEVEL and empathy rules win. Focused correction comes first: no opener before "You can say", none inside the corrected sentence or its repetitions.',
].join('\n');

/* ── ② 최근 답장의 «시작 말» ───────────────────────────────────────────────────
 *  📏 «시작 말» = 답장 맨 앞의 연결 표현·감탄·칭찬, 없으면 첫 낱말.
 *     · 아래 목록의 여러 낱말 표지(By the way · Oh, and · That sounds …)는 그 전체를 한 덩어리로 본다
 *     · 그 밖에는 «문장부호 앞까지 3낱말 이하» 면 그 덩어리(「Great try!」「Ooh nice one!」「So,」)
 *     · 아니면 첫 낱말(「Sometimes」)
 *  ⚠️ 지시에 싣는 글자는 «영문·공백·작은 부호» 만 남긴다 — 모델이 만든 글이라도 지시에 그대로 끼우지 않는다.
 *  ⚠️ «비교 열쇠» 는 앞 두 낱말 — 「That sounds fun!」과 「That sounds great!」는 같은 시작으로 본다. */
const MULTI_MARKERS: readonly string[] = [
  'by the way', 'oh and', 'to be honest', 'for example', 'i mean', 'as soon as', 'even though', 'one more thing',
  'that sounds', 'sounds like', 'great try', 'nice try', 'good try', 'ooh nice one', 'nice one', 'haha nice',
  'good job', 'great job', 'nice job', 'well done', 'you got it', 'well said', 'i see', 'i love that', 'i like that',
  "that's great", "that's right", "that's cool", "that's awesome", 'of course', 'no worries', "don't worry",
  // 🗣️ (2026-11-04) ④ 의 첫마디 — 「Oh, …」 가 전부 «Oh,» 한 열쇠로 묶이면 «최근 시작 말 피하기» 가 후보를 다 지워 버린다
  'oh nice', 'oh really', 'oh cool', 'oh wow', 'oh great', 'oh i see', 'oh okay', 'oh no', "oh i'm sorry", "oh that's too bad",
  'how fun', 'no way',
  'good question', 'great question', "that's okay", 'no problem', 'let me think', 'all right', 'okay then', 'got it',
].slice().sort((a, b) => b.length - a.length);
/** 앞에 낄 수 있는 것 — 공백·이모지·따옴표(글자는 안 된다). */
const LEAD_GAP = /^[\s"'“”‘’‍️\u{1f3fb}-\u{1f3ff}\p{Extended_Pictographic}]*/u;

function normWords(s: string): string[] {
  return String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

/** 답장의 «시작 말» — 사람이 읽는 모양(「So,」「Great try!」「By the way,」). 영어가 없으면 ''. */
export function replyOpener(text: any): string {
  try {
    const raw = String(text == null ? '' : text);
    const s = raw.slice((raw.match(LEAD_GAP) || [''])[0].length);
    if (!/^[A-Za-z]/.test(s)) return '';
    const low = s.toLowerCase().replace(/[’‘]/g, "'");
    for (const m of MULTI_MARKERS) {
      // 「Oh, and」 처럼 쉼표가 끼어도 같은 표지로 본다
      const re = new RegExp('^' + m.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("[\\s,]+") + "(?![a-z'])");
      const mm = low.match(re);
      if (mm) {
        const tail = (s.slice(mm[0].length).match(/^[,!.?…]/) || [''])[0];
        return clean(s.slice(0, mm[0].length) + tail);
      }
    }
    // 물음표로 끝나는 짧은 덩어리(「Is it big?」)는 «시작 말» 이 아니라 질문 그 자체라 안 본다
    const seg = s.match(/^([A-Za-z][A-Za-z']*(?:\s+[A-Za-z][A-Za-z']*){0,2})\s*([,!.…])/);
    if (seg) return clean(seg[1] + seg[2]);
    const first = (s.match(/^[A-Za-z][A-Za-z']*/) || [''])[0];
    // 「I」「Do」「What」 같은 문법 낱말로 시작하는 것은 «같은 말머리» 가 아니다 — 피하라고 하면 오히려 말이 어색해진다
    return PLAIN_FIRST.has(first.toLowerCase().replace(/[’‘]/g, "'")) ? '' : clean(first);
  } catch { return ''; }
}
const PLAIN_FIRST = new Set(['i', "i'm", "i've", "i'd", "i'll", 'you', "you're", 'we', "we're", 'it', "it's", 'they', 'he', 'she',
  'my', 'your', 'our', 'the', 'a', 'an', 'this', 'that', 'these', 'those', 'there', "there's", "let's",
  'do', 'does', 'did', 'is', 'are', 'am', 'was', 'were', 'can', 'could', 'will', 'would', 'have', 'has',
  'what', "what's", 'where', "where's", 'who', 'why', 'when', 'how', "how's", 'which']);
function clean(s: string): string {
  return String(s || '').replace(/[’‘]/g, "'").replace(/[^A-Za-z' ,!.?]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
}

/** 비교 열쇠 — 앞 두 낱말(소문자). 「So,」→'so' · 「That sounds fun!」→'that sounds'. */
export function openerKey(opener: any): string {
  return normWords(opener).slice(0, 2).join(' ');
}

/** 최근 AI 답장 n 개의 시작 말(겹치면 하나로). history 는 {role, content} 배열 — 웜업 KV · ai_friend_chats 와 같은 모양. */
export function recentOpeners(history: any, n: number = 3): string[] {
  try {
    const out: string[] = [];
    const seen = new Set<string>();
    const rows = Array.isArray(history) ? history : [];
    for (let i = rows.length - 1; i >= 0 && out.length < n; i--) {
      const h = rows[i];
      if (!h || h.role !== 'assistant') continue;
      const o = replyOpener(h.content);
      if (!o) continue;
      const k = openerKey(o);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(o);
    }
    return out;
  } catch { return []; }
}

/** 「이번에는 다르게 시작해」 한 줄. 시작 말이 없으면 ''. */
export function openerAvoidLine(openers: string[]): string {
  const list = (Array.isArray(openers) ? openers : []).map(clean).filter(Boolean).slice(0, 3);
  if (!list.length) return '';
  return '- Your last replies started with ' + list.map((o) => JSON.stringify(o)).join(', ') +
    '. Start this reply in a different way (a different word, or no linking word at all).';
}

/* ── ④ 이번 턴 «첫마디» (2026-11-04 사장님 「well, wow, by the way, anyway … 문장 앞에서 말하게」) ──────────
 *  [왜 서버가 정하나] «가끔 써라» 만 주면 모델이 거의 안 쓴다(첫 판 PR #2025 뒤 사장님 체감 「아직 안 됐어?」).
 *     서버가 «이번 턴에 쓴다/쉰다» 와 «상황별 후보 한 개씩» 을 정하고, 지금 어느 상황인지(슬픔·부탁·질문·모름·
 *     좋은 소식·놀라운 말·평범한 정보)는 모델이 학생 말을 보고 고른다 — 학생 말을 서버가 다시 판정하지 않아 정본이 둘이 되지 않는다.
 *  [빈도] 바로 앞 AI 답장이 첫마디로 시작했으면 이번엔 쉰다 ⟹ 대략 «두 턴에 한 번».
 *     ⚠️ «AI 답장 개수의 홀짝» 으로 정하지 마세요 — AI 친구 기록은 최근 20줄만 읽어 개수가 어느 순간 멈추고,
 *        그러면 «늘 쓴다» 나 «영영 안 쓴다» 로 굳습니다. 앞 답장의 실제 시작을 보면 모델이 한 번 어겨도 다음 턴에 바로 맞춰집니다.
 *  [후보] 최근 시작 말(③)과 겹치지 않는 것을 고른다 — 「다르게 시작해」 줄과 서로 다른 말을 하지 않게.
 *  [첫 답장] 기록에 AI 답장이 없으면(인사·첫 응답) 정하지 않는다.
 *  ⚡ 속도: 이미 읽어 온 기록만 본다 — 새 조회·새 모델 호출이 없다. 후보는 모두 기초 문법 검사·조각 질문 검사를
 *     통과하는 모양이라(하니스 ⑧) «다시 뽑기» 를 부르지 않는다.
 *  ⛔ 소리형(hmm·aww·ooh·uh·um) 금지 · ⛔ 후처리로 덧붙이지 않는다(모델이 쓴다). */
type OpenerCase = 'sad' | 'request' | 'asked' | 'lost' | 'good' | 'surprise' | 'info';
/*  ⚠️ 칸마다 후보 «4개» — 최근 시작 말(③)은 3개까지 피하므로, 3개 이하면 전부 지워져 「다르게 시작해」 줄과 부딪힌다(하니스 ⑧ 실측).
 *  ⚠️ 후보끼리 «시작 말 열쇠»(앞 두 낱말)가 달라야 한다 — 「Oh, that's too bad.」·「Oh, that's hard.」 처럼 겹치면 같은 말로 본다. */
export const TURN_OPENERS: Readonly<Record<OpenerCase, readonly string[]>> = {
  sad: ['Oh no.', "Oh, I'm sorry.", "Oh, that's too bad.", "I'm sorry."],
  request: ['Sure!', 'Okay!', 'Of course!', 'All right!'],
  asked: ['Good question!', 'Well,', 'Let me think.', 'Great question!'],
  lost: ["That's okay!", 'No problem!', "Don't worry!", 'No worries!'],
  // 🎯 (2026-11-04 사장님 「최대한 자연스럽게 문맥에 맞게」) «그 밖» 한 칸을 뜻으로 셋으로 나눴다 —
  //    「I ate rice.」에 「Oh, nice!」가 아니라 「Oh, I see.」가 나오게(좋은 소식 · 놀라운 말 · 평범한 정보·짧은 대답)
  // 🎧 (2026-11-04 후속) «좋은 소식»·«놀라운 말» 은 학생 영어가 아니라 «내용» 에 반응하는 말로 둔다 — 「Oh, nice!」「Oh, wow!」 류는
  //    칭찬 떼기 표(warmup-empathy.ts CHEER_LEADS · «Oh,» 머리)에 걸려 등급을 알 때까지 미리듣기가 멈춘다(속도 손해).
  //    이 말들은 그 표에 안 걸려 미리듣기가 #2036 때처럼 바로 나가고, 틀린 문장에도 «영어 칭찬» 이 되지 않는다(하니스 ⑧-7).
  good: ['Sounds fun!', 'Oh, fun!', 'Sounds nice!', 'Sounds great!'],
  surprise: ['Oh, really?', 'No way!', 'Really?', 'Oh my!'],
  info: ['Oh, I see.', 'Oh, okay.', 'I see.', 'Got it.'],
};
/** 🏅 (2026-11-04 사장님 「칭찬 규칙이랑 합쳐」) «잘 해냈을 때» 칸 — 고친 문장을 제대로 말했거나 어려운 문장을 맞게 말했을 때.
 *  ⚠️ 위 표(TURN_OPENERS)와 «따로» 둔다 — 이 말로 시작한 다음 턴은 쉬지 않는다(isTurnOpener 가 이 열쇠를 모른다).
 *     쉬게 하면 칭찬 → (쉬는 턴의 칭찬 규칙) → 칭찬 으로 상투 칭찬이 연달아 붙던 예전 모양이 돌아온다.
 *  ⛔ 틀린 문장에는 이 칸을 쓰지 않는다 — 지시가 «실수가 있으면 칭찬하지 마» 를 함께 말하고, 그래도 쓰면
 *     서버가 뗀다(이 말들은 전부 warmup-empathy.ts 의 CHEER_LEADS 에 있다 — 하니스 ⑨가 대조한다). */
export const TURN_PRAISE: readonly string[] = ['Great job!', 'Nice sentence!', 'You got it!', 'Well done!', 'Perfect!'];
/** 「앞 답장이 첫마디로 시작했나」 판정용 열쇠 — 위 후보 + 모델이 스스로 쓰는 같은 갈래(Oh …·Well·By the way·Anyway). */
let OPENER_KEYS: Set<string> | null = null;
function openerKeys(): Set<string> {
  if (!OPENER_KEYS) {
    const ks = new Set<string>(['well', 'by the', 'anyway', 'sure', 'okay', 'i see', 'really', 'good question']);
    for (const list of Object.values(TURN_OPENERS)) for (const o of list) ks.add(openerKey(replyOpener(o + ' Do you like it?')));
    OPENER_KEYS = ks;
  }
  return OPENER_KEYS;
}
/** 그 시작 말이 «첫마디» 갈래인가(「Oh, …」 는 무엇이 붙어도 첫마디). */
export function isTurnOpener(opener: any): boolean {
  const k = openerKey(opener);
  return !!k && (k === 'oh' || k.startsWith('oh ') || openerKeys().has(k));
}
function textSeed(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
  return h;
}
function pickOpener(list: readonly string[], seed: number, avoid: Set<string>): string {
  for (let k = 0; k < list.length; k++) {
    const c = list[(seed + k) % list.length];
    if (!avoid.has(openerKey(replyOpener(c + ' Do you like it?')))) return c;
  }
  return list[seed % list.length];
}

/** 이번 턴 첫마디 한 줄. 첫 답장이거나 «쉬는 턴» 이면 ''. 던지지 않는다. */
export function turnOpenerLine(history: any): string {
  try {
    const rows = Array.isArray(history) ? history : [];
    let last: string | null = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const h = rows[i];
      if (h && h.role === 'assistant') { last = String(h.content == null ? '' : h.content); break; }
    }
    if (last == null) return '';
    if (isTurnOpener(replyOpener(last))) return '';
    const avoid = new Set(recentOpeners(rows).map(openerKey));
    const seed = textSeed(last);
    const q = (c: OpenerCase) => JSON.stringify(pickOpener(TURN_OPENERS[c], seed, avoid));
    /* 🎯 «문맥에 맞게» — 어느 칸인지는 모델이 학생 말을 보고 고르고, 딱 맞는 것이 없으면 «같은 느낌의 다른 짧은 말» 을 허락한다.
       By the way 는 «새 질문으로 넘어갈 때만» (억지로 화제를 바꾸게 하지 않는다) — 그것도 세 턴에 한 번쯤만 권한다.
       🧭 (2026-11-05 사장님 「F1~F5 진행」 — AI 친구 «주제가 너무 빨리 바뀐다» 실측) «모름» 칸은 예전에 「…, then start your next
          question with "Anyway,"」 였다 — 모르는 학생을 «다음 질문» 으로 넘겨 주제가 뛰었다. 지금은 «같은 것을 쉽게·두 개 중 고르기로».
          ⛔ «Anyway, 새 질문» 으로 되돌리지 말 것. ⚠️ 그 질문은 이번 턴 기억에서 빠진다(question-memory.ts isDontKnowAnswer) — 반복이 아니다.
          By the way 권유도 «주제를 바꾸려고 쓰지 마» 를 먼저 말한다. */
    /* 🏅 (2026-11-04) 칭찬 규칙과 «한 자리» — 이 줄이 이번 턴의 반응이자 칭찬이다(따로 칭찬을 더하지 않는다).
       ⛔ 사장님 「틀린 문장에선 반드시 칭찬을 막아줘」 — 실수가 있으면 «평범한 정보» 칸으로 받게 하고, 그래도 칭찬하면 서버가 뗀다. */
    return '- THIS TURN\'S OPENER: use the one that fits what they just said. It is your whole reaction and cheer: add no other, and never praise English with a mistake. Sad or hard news: ' + q('sad')
      + '; a request: ' + q('request') + '; a question to you: ' + q('asked')
      + '; "I don\'t know" or confused: ' + q('lost') + ', then ask it again more easily (two choices)'
      + '; they fixed a mistake or said it right: ' + JSON.stringify(pickOpener(TURN_PRAISE, seed, avoid))
      + '; good or fun news: ' + q('good') + '; something surprising: ' + q('surprise')
      + '; a mistake, a short answer or plain information: ' + q('info') + '. If none fits, use another short one with the same feeling.'
      + (seed % 3 === 0 ? ' If their story is done and you ask about something new, start it with "By the way,".' : '');
  } catch { return ''; }
}

/** 지시에 붙일 덩어리 — 규칙 + (기록이 있으면) 최근 시작 말 피하기 + (그 턴이면) 이번 턴 첫마디. 던지지 않는다.
 *  ⚠️ 첫마디 줄은 «맨 끝» — 「다르게 시작해」 줄보다 뒤에 두어야 «이번 턴에 할 일» 로 읽힌다(후보는 이미 겹치지 않게 골랐다).
 *  ℹ️ 이 함수는 A.i 말하기(index.ts)·AI 친구(api-ai.ts) 두 곳만 부른다 — 그래서 첫마디도 이 두 화면에만 실리고
 *     A.i 선생님 수업 즉답(connectorRule 만 씀)·중국어·엘리더잼 예시형 계약에는 안 실린다(부르는 쪽이 이미 거른다). */
export function connectorPromptBlock(band: LinkBand, history?: any): string {
  try {
    const avoid = openerAvoidLine(recentOpeners(history));
    const turn = turnOpenerLine(history);
    return connectorRule(band) + (avoid ? '\n' + avoid : '') + (turn ? '\n' + turn : '');
  } catch { return ''; }
}

/* ── ③ 측정 — 답장 한 개의 문제(하니스·배포 뒤 D1 표본 측정용. 대화 중에는 안 부른다) ──────────
 *  돌려주는 코드:
 *    repeat_opener   직전 답장들과 같은 말로 시작했다
 *    formal_in_chat  초·중급 대화에 however·therefore·moreover·furthermore
 *    above_level     초급 대화에 even though·unless·as soon as·basically·I mean·to be honest
 *    cold_shift      반응 없이 By the way·Anyway 로 곧장 화제를 바꿨다(답장 맨 앞)
 *    anyway_cut      학생이 무언가를 이야기한 턴에 Anyway(끊는 느낌)
 *    stacked_links   문장마다 연결어로 시작했다(2문장 이상) · 초급인데 문장 앞 연결어가 둘 이상
 *  ⚠️ 휴리스틱이다 — «잡았다» 는 «틀렸다» 의 증명이 아니라 사람이 볼 후보다. */
const FORMAL = /\b(however|therefore|moreover|furthermore|nevertheless|consequently)\b/i;
const ABOVE_BEGINNER = /\b(even though|unless|as soon as|basically|i mean|to be honest)\b/i;
const SENT_LINK = /^(?:and|but|so|also|plus|still|though|because|or|well|actually|anyway|by the way|oh,? and|i mean|basically|for example|to be honest|however|therefore|moreover|furthermore|then|now)\b/i;
function sentencesOf(text: string): string[] {
  return String(text == null ? '' : text).replace(/\([^)]*\)/g, ' ').replace(/[’‘]/g, "'")
    .split(/(?<=[.!?])\s+/).map((x) => x.replace(LEAD_GAP, '').trim()).filter((x) => /[A-Za-z]/.test(x));
}
/** 학생이 «무언가를 이야기했는가»(Anyway 가 끊는 말이 되는 때) — 모르겠다·되묻기·한두 낱말은 아님. */
function studentShared(said: string): boolean {
  const w = normWords(said);
  if (w.length < 3) return false;
  const t = w.join(' ');
  if (/\b(i don'?t know|dont know|no idea|what|pardon|again|slowly)\b/.test(t) && w.length <= 5) return false;
  return true;
}

export function connectorIssues(reply: any, ctx?: { band?: LinkBand; studentSaid?: string; prevOpeners?: string[] }): string[] {
  try {
    const text = String(reply == null ? '' : reply);
    const band: LinkBand = (ctx && ctx.band) || 'beginner';
    const out: string[] = [];
    const op = replyOpener(text);
    const k = openerKey(op);
    if (k && (ctx?.prevOpeners || []).some((p) => openerKey(p) === k)) out.push('repeat_opener');
    if (band !== 'advanced' && FORMAL.test(text)) out.push('formal_in_chat');
    if (band === 'beginner' && ABOVE_BEGINNER.test(text)) out.push('above_level');
    if (k === 'by the' || k === 'anyway') out.push('cold_shift');
    if (/\banyway\b/i.test(text) && studentShared(String(ctx?.studentSaid || ''))) out.push('anyway_cut');
    const ss = sentencesOf(text);
    const linked = ss.filter((x) => SENT_LINK.test(x)).length;
    if ((ss.length >= 2 && linked === ss.length) || (band === 'beginner' && linked >= 2)) out.push('stacked_links');
    return out;
  } catch { return []; }
}
