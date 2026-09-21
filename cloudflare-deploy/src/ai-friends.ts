/* ai-friends.ts — «AI 친구» 이름의 정본 (2026-08-31)
 *
 * 왜 이 파일이 있나
 *   웜업·AI영어친구·음성코치에서 학생이 네 친구(Emma·Jake·Lily·Noah) 중 하나를 고른다.
 *   그런데 이름·얼굴·목소리를 넷으로 늘리면서 «AI 자신의 정체성» 이라는 축을 빠뜨렸다 —
 *   서버 프롬프트가 「너는 '망고(Mango)'야」로 하드코딩돼 있었고 화면은 고른 이름을
 *   서버에 보내지도 않았다. 그래서 화면은 "Hi! I'm Lily." 라고 인사해 놓고, 학생이
 *   이름을 물으면 AI 가 Mango 라 하거나 그때그때 다른 이름을 지어냈다
 *   (2026-08-31 사장님 제보 「이름이 lily 로 나오는데 자신의 이름이 루이라고 말한다」).
 *
 * ⛔ 화면이 보낸 문자열을 그대로 프롬프트에 넣지 말 것
 *   그 자리는 시스템 프롬프트라, 임의 문자열이 들어가면 프롬프트 주입 통로가 된다.
 *   반드시 이 표를 거쳐 «아는 이름» 으로만 바꾼다. 모르는 값이면 기존 'Mango'.
 *
 * ⚠️ 화면 목록과 이 표는 «짝» 이다 — 화면에만 친구를 늘리면 서버가 모르는 값이라
 *    조용히 Mango 로 떨어진다(CLAUDE.md 「화면에서 골랐는데 그 값만 저장이 안 됨」과 같은 뿌리).
 *    ai_friend_name_harness 가 화면 세 곳과 이 표를 대조한다.
 */

/** 화면이 쓰는 키 → AI 가 «자기 이름» 으로 말할 표시 이름 */
export const AI_FRIEND_NAMES: Record<string, string> = {
  emma: 'Emma',
  jake: 'Jake',
  lily: 'Lily',
  noah: 'Noah',
  /* 🀄 메이 — 중국어 웜업 전용(2026-09-14). 값이 «중국어 이름» 인 이유:
     이 값은 그대로 「너는 '…' 야」·「이름을 물으면 '…' 라고 답해」로 중국어 프롬프트에
     들어간다. 'Mei' 라고 적으면 AI 가 중국어 문장 한가운데에 로마자를 섞어 읽는다.
     화면의 첫 인사(warmup.html VOICE_MODES.mei.hi)도 「我是美美老师」 이므로 같은 말이다.
     ⚠️ 화면 이름표는 한국어 「메이 선생님」 이다 — 학생이 보는 글자와 AI 가 말하는
        이름이 다른 언어인 것은 «어긋남» 이 아니라 같은 사람의 두 언어 표기다.
     ⛔ 이 줄을 지우지 마세요 — 지우면 resolveFriendName('mei') 가 모르는 값이 되어
        조용히 기본값 'Mango' 로 떨어지고, 중국어 수업에서 AI 가 「我是Mango」 라고 말합니다
        (2026-09-14 사장님 제보 「你好，我是Emma」의 사촌이고, 에러는 안 납니다). */
  mei: '美美老师',
  /* 🀄 룽 — 중국어 «남자» 교사(2026-09-14 사장님 「남자 교사도 한명더 추가해줘」).
     값이 중국어 이름인 까닭은 바로 위 메이와 같습니다.
     ⚠️ 이 표의 이름끼리 «앞가리» 가 되면 안 됩니다 — 자기소개 가드(wrongSelfName ④절)가
        긴 이름부터 견주긴 하지만, 새 이름을 넣을 때 기존 이름의 앞토막이 아닌지 보세요
        (지금: 美美老师 · 龙老师 — 어느 쪽도 다른 쪽의 앞토막이 아닙니다).
     ⛔ 화면 이름표는 한국어 「룽 선생님」 입니다. 그것을 여기 적지 마세요 —
        이 값은 «AI 가 자기를 부르는 이름» 이라 그대로 중국어 프롬프트에 들어갑니다. */
  long: '龙老师',
};

/** 아무도 안 골랐거나 모르는 값일 때 — 네 친구가 생기기 전의 이름을 그대로 쓴다 */
export const AI_FRIEND_DEFAULT = 'Mango';

/**
 * 화면이 보낸 값을 «아는 이름» 으로 바꾼다.
 * ⚠️ 「번갈아(mix)」는 화면이 «그 턴에 말할 사람» 을 보내므로 여기서는 다루지 않는다 —
 *    mix 를 그대로 받으면 목록에 없어 기본값이 된다(그것이 맞는 동작이다).
 */
export function resolveFriendName(raw: unknown): string {
  const k = String(raw || '').trim().toLowerCase();
  /* ⚠️ `NAMES[k] || 기본값` 만으로는 «모르는 값이면 기본값» 이 지켜지지 않는다 —
     평범한 객체 리터럴이라 프로토타입 키가 그대로 조회된다.
       'constructor' → function Object() { [native code] }
       '__proto__'   → [object Object]
     그 값이 시스템 프롬프트에 「너는 '…' 야」로 들어간다. 반드시 자기 칸인지 확인한다. */
  if (!Object.prototype.hasOwnProperty.call(AI_FRIEND_NAMES, k)) return AI_FRIEND_DEFAULT;
  const v = AI_FRIEND_NAMES[k];
  return typeof v === 'string' && v ? v : AI_FRIEND_DEFAULT;
}

/* ═══════════════════════════════════════════════════════════════════════
   🏷️ 「AI 가 자기를 다른 이름으로 소개했나」 — 2026-08-31 사장님 지시로 추가

   왜 «프롬프트에 적는 것» 만으로 부족한가
     이름은 이미 시스템 프롬프트에 들어갑니다(위 resolveFriendName). 그런데 모델이
     가끔 어깁니다 — 사장님 제보가 두 번 왔고 그때마다 «다른» 이름이었습니다
     (루이 → 로이). 즉 «Roy 로 정착» 한 것이 아니라 매번 지어내는 것이라,
     화면 이름을 바꿔 맞추는 것은 움직이는 과녁을 쫓는 일입니다.
     이 저장소가 오늘만 세 번 확인한 그 규칙입니다 — 「지시만으로는 안 지켜진다」
     (단어 수·문법·구두점). 전부 «만든 뒤 확인하고 어기면 다시 뽑기» 로 풀었습니다.

   ⛔ 문장을 고쳐 쓰지 않습니다 — 이름만 바꿔치기하면 「제 이름은 Lily 예요」 뒤에
      이어지는 말과 앞뒤가 안 맞을 수 있습니다. 다시 뽑게만 합니다.

   🔴 거짓경보가 이 검사의 진짜 위험입니다. 멀쩡한 답을 버리면 학생은 자기 질문에 대한 답
      대신 «이름 정정» 을 받습니다 — 이름 한 번 틀린 것보다 나쁩니다.

   📜 2026-09-01 에 여기서 두 번 틀렸습니다.
      1차(8/31) — 「I'm X」 자리를 통째로 포기했다가 사장님이 보시는 형태를 못 잡았습니다.
      2차(9/1)  — 반대로 「I'm + 대문자면 이름」으로 넓혔다가, 함정 대조가 정상 문장 98종에서
                  거짓경보 71건을 실측했습니다. 「I'm Taiwanese.」·「I'm Catholic.」 은
                  «I'm Louie.» 와 문장 구조가 «완전히 같아» 낱말을 모르면 절대 못 가릅니다.
                  허용목록을 키우는 길은 끝이 없고, 키우면 진짜 이름(Grace·May·Joy)이 샙니다.

   ⟹ 그래서 «구조로 가를 수 있는 것» 과 «없는 것» 을 갈라 놓았습니다.
      ① 이름만 오는 자리(my name is X · call me X · X is my name) — 거짓경보가 사실상 없습니다.
         여기서는 대문자이기만 하면 잡습니다.
      ② 「I'm X」 — 구조로는 못 가릅니다. 그래서 «뒷받침» 이 있을 때만 잡습니다:
           ⓐ X 가 우리가 아는 이름(네 친구 + 기본값 Mango) 이거나
           ⓑ 학생이 방금 이름을 물었거나(askedName)
           ⓒ 그 답이 인사말 모양이거나(Hi/Hello/Hey/Nice to meet you).
         셋 다 아니면 «모르는 것» 으로 두고 넘어갑니다 — 지어내지 않는 쪽입니다.
      ③ this is X · X here — 아는 이름일 때만(「This is a dog」·「Come here」가 흔합니다).

   ⛔ NOT_A_NAME 을 «흔한 영어 낱말 사전» 으로 키우지 마세요. 담는 것은 «닫힌 범주» 뿐입니다 —
      국적·언어, 종교, 한정사·부사, 호칭. 상태 형용사는 대문자로 올 일이 드물어 최소만 둡니다.
   ═══════════════════════════════════════════════════════════════════════ */

/** 우리가 아는 친구 이름들(소문자).
 *  ⚠️ 기본 이름(Mango)도 넣는다 — Lily 를 골랐는데 「I'm Mango」라고 하면 그것도 «어긴 것» 이다. */
function knownNamesLower(): string[] {
  return Object.keys(AI_FRIEND_NAMES)
    .map((k) => String(AI_FRIEND_NAMES[k] || '').toLowerCase())
    .concat([AI_FRIEND_DEFAULT.toLowerCase()]);
}

/** 「I'm X」 자리에 대문자로 오지만 이름이 아닌 것 — «닫힌 범주» 만 담는다(위 ⛔).
 *  이것은 ②의 «뒷받침» 규칙을 보조하는 값싼 1차 거름망일 뿐, 그 자체가 방어선이 아니다. */
const NOT_A_NAME = new Set([
  /* 한정사·부사 — 「My name is NOT Roy」의 NOT 이 여기서 걸린다 */
  'not', 'no', 'never', 'still', 'also', 'actually', 'really', 'just', 'always', 'only',
  'the', 'a', 'an', 'your', 'my', 'his', 'her', 'their', 'so', 'very', 'super', 'too',
  /* 국적·언어 — 「I'm Korean」류. 이 서비스는 필리핀 강사·중국 학생이 있어 실제로 나온다 */
  'korean', 'american', 'filipino', 'filipina', 'english', 'chinese', 'japanese', 'spanish',
  'french', 'british', 'canadian', 'australian', 'indian', 'german', 'italian', 'mexican',
  'brazilian', 'russian', 'vietnamese', 'thai', 'asian', 'european', 'african', 'latino',
  'taiwanese', 'singaporean', 'malaysian', 'indonesian', 'cebuano', 'bisaya', 'visayan',
  'ilocano', 'tagalog', 'turkish', 'dutch', 'irish', 'scottish', 'swedish', 'polish',
  'greek', 'portuguese', 'egyptian', 'nigerian', 'kenyan', 'danish', 'norwegian', 'finnish',
  'swiss', 'belgian', 'austrian', 'czech', 'hungarian', 'romanian', 'ukrainian', 'peruvian',
  'argentine', 'chilean', 'colombian', 'cuban', 'cambodian', 'burmese', 'nepali',
  'pakistani', 'bangladeshi', 'mongolian', 'lao', 'khmer',
  /* 종교 — 국적과 같은 자리에 같은 모양으로 온다 */
  'christian', 'catholic', 'buddhist', 'muslim', 'jewish', 'hindu', 'protestant',
  /* 호칭 — 「I'm Teacher Lily」의 Teacher (이 문장은 아래 «같은 문장에 기대 이름» 으로도 걸러진다) */
  'teacher', 'student', 'friend', 'miss', 'mister', 'mr', 'ms', 'mrs',
  /* 상태 — 대문자로 강조해 쓰는 것 중 흔한 것만 */
  'ok', 'okay', 'sorry', 'here', 'from',
]);

/** 학생이 «이름» 을 물었는가. ②ⓑ 의 뒷받침 신호.
 *  ⚠️ 한국어로 묻는 학생이 훨씬 많다 — 영어만 보면 이 신호가 거의 안 켜진다. */
export function askedOwnName(studentInput: unknown): boolean {
  const t = String(studentInput || '');
  if (/이름|누구세[요야]|누구야|넌 누구/.test(t)) return true;
  return /\b(?:what(?:'s| is| s)?\s+(?:your|ur)\s+name|who\s+are\s+you|your\s+name|call\s+you)\b/i.test(t);
}

export interface SelfNameOpts {
  /** 학생이 방금 이름을 물었나 — 켜지면 「I'm X」도 이름으로 본다(②ⓑ) */
  askedName?: boolean;
}

/**
 * AI 답변이 «기대한 이름이 아닌 다른 이름» 으로 자기를 소개했으면 그 이름을 돌려준다.
 * 멀쩡하면 빈 문자열.
 *
 * ✅ 판정은 «문장 단위» 다. 같은 문장에 기대 이름이 함께 있으면 어긴 것이 아니다 —
 *    「I'm Teacher Lily.」·「My name is not Emma, my name is Lily!」가 그래서 통과한다.
 *    ⚠️ 대가: 「I'm Louie, but everyone calls me Lily.」처럼 한 문장에 둘 다 있으면 통과한다.
 * ⚠️ 곱슬 따옴표(’)를 먼저 편다 — 모델이 자주 쓰는데, 안 펴면 「I’m Louie」를 통째로 놓친다.
 */
export function wrongSelfName(reply: unknown, expected: string, opts?: SelfNameOpts): string {
  const t = String(reply || '').replace(/[\u2018\u2019\u02BC\u00B4`]/g, "'");
  const want = String(expected || '').trim().toLowerCase();
  if (!t || !want) return '';
  const known = knownNamesLower();
  const askedName = !!(opts && opts.askedName);
  /* ②ⓒ 인사말 모양인가 — «답 전체» 로 본다. "Hi!" 와 "I'm Louie." 는 다른 문장이기 때문이다. */
  const greeting = /\b(?:hi|hello|hey|nice to meet you|good to meet you)\b/i.test(t);

  /* ⚠️ 앞말은 대소문자를 가리지 않아야 한다("My name is" 는 문장 첫머리라 대문자로 온다).
     그래서 i 플래그를 쓰고, «이름처럼 생겼는가» 는 코드에서 따로 본다 —
     정규식에 [A-Z] 만 적으면 i 플래그가 그것까지 풀어 버린다(2026-08-31 에 그렇게 짰다가
     실사고 문장을 하나도 못 잡았다). */
  const looksName = (w: string): boolean => {
    if (!w || !/^[A-Za-z][A-Za-z'-]*$/.test(w)) return false;
    if (!/^[A-Z]/.test(w)) return false;
    if (/'s$/i.test(w)) return false;                       // 소유격 — 「I'm Mangoi's friend」
    if (w.length > 1 && w === w.toUpperCase()) return false; // 전부 대문자 강조 — 「I'm SLEEPY」
    return !NOT_A_NAME.has(w.toLowerCase());
  };
  /* 이름은 «절» 이 끝나는 자리에 온다. 「I'm Seoul born」·「I'm Zoom ready」처럼 뒤에 말이
     이어지면 그것은 이름이 아니라 꾸미는 말이다. */
  const atClauseEnd = (rest: string) => /^\s*(?:[.,!?;:\u2014-]|$|and\b|but\b|or\b|so\b)/i.test(rest);

  const wantRe = new RegExp('\\b' + want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  const TOK = "([A-Za-z][A-Za-z'-]{1,19})";

  for (const sent of t.split(/(?<=[.!?])\s+|\n+/)) {
    if (wantRe.test(sent)) continue;   // 같은 문장이 기대 이름을 함께 말하고 있다
    let m: RegExpExecArray | null;

    /* ① 이름만 오는 자리 — 거짓경보가 사실상 없어 대문자이기만 하면 잡는다 */
    const strong = new RegExp("\\b(?:my name(?:'s| is)|call me|you can call me)\\s+" + TOK
      + "|\\b" + TOK + '\\s+is my name\\b', 'gi');
    while ((m = strong.exec(sent))) {
      const got = m[1] || m[2] || '';
      if (!looksName(got)) continue;
      if (got.toLowerCase() !== want) return got;
    }

    /* ② 「I'm X」 — 구조로는 「I'm Taiwanese.」와 못 가른다. 뒷받침이 있을 때만 잡는다. */
    const im = new RegExp("\\b(?:i'm|i am)\\s+" + TOK, 'gi');
    while ((m = im.exec(sent))) {
      const got = m[1] || '';
      if (!looksName(got)) continue;
      if (!atClauseEnd(sent.slice(m.index + m[0].length))) continue;
      const low = got.toLowerCase();
      if (low === want) continue;
      /* ⓓ 동격 — 「I'm Louie, your English friend.」 처럼 뒤에 «역할» 이 붙으면 이름이다.
         국적·종교는 그 자리에 «, and …» 로 이어지지 «, your/the …» 로 이어지지 않는다. */
      const appositive = /^\s*,\s*(?:your|the)\b/i.test(sent.slice(m.index + m[0].length));
      if (known.indexOf(low) >= 0 || askedName || greeting || appositive) return got;
    }

    /* ③ 애매한 자리 — 아는 이름일 때만.
       ⛔ 여기를 ①처럼 넓히지 말 것: 「This is a dog.」·「Come here!」·「Right here!」가 흔하다. */
    const weak = new RegExp('\\b(?:this is)\\s+' + TOK + '|\\b' + TOK + '\\s+here\\b', 'gi');
    while ((m = weak.exec(sent))) {
      const got = m[1] || m[2] || '';
      if (!looksName(got)) continue;
      const low = got.toLowerCase();
      if (low === want) continue;
      if (known.indexOf(low) >= 0) return got;
    }
  }

  /* ④ 🀄 중국어 자기소개 — 「我是Emma」 (2026-09-14 사장님 제보)

     위 ①②③ 는 전부 영어 문형이라 중국어 답장에서는 한 번도 안 걸린다 —
     문장을 가를 때 쓰는 [.!?] 도 중국어 종결부호(。！？)를 모른다.
     그래서 「你好！我是Emma。」가 그대로 통과했다.

     ⛔ 「我是」 뒤의 글자를 «이름» 으로 뽑지 마세요 — 「我是老师」(나는 선생이야)·
        「我是韩国人」 같은 평범한 문장이 전부 걸립니다. 한자는 이름과 보통명사를
        구조로 가를 수 없습니다 — 이 파일 ② 가 영어에서 이미 두 번 밟은 바로 그 함정입니다
        (「I'm Taiwanese.」과 「I'm Louie.」는 구조가 같습니다).
     ✅ 그래서 «우리가 아는 이름» 일 때만 잡습니다(②ⓐ 와 같은 근거). 그런 이름이
        나왔다면 모델이 다른 친구를 지어낸 것이 확실합니다.
     ⚠️ 긴 이름이 먼저 맞아야 합니다 — 짧은 이름이 긴 이름의 앞가리일 때
        (例: 'Mei' 와 'Meimei') 짧은 쪽이 먼저 걸리면 «기대한 이름» 을 «남» 으로 읽습니다. */
  const zhKnown = Object.keys(AI_FRIEND_NAMES)
    .map((k) => String(AI_FRIEND_NAMES[k] || ''))
    .concat([AI_FRIEND_DEFAULT])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);   // ⚠️ 긴 이름 먼저
  const ZH_LEAD = /(?:我是|我叫|我的名字(?:是|叫))\s*/g;
  let zm: RegExpExecArray | null;
  while ((zm = ZH_LEAD.exec(t))) {
    const rest = t.slice(zm.index + zm[0].length);
    for (const nm of zhKnown) {
      if (rest.slice(0, nm.length).toLowerCase() !== nm.toLowerCase()) continue;
      if (nm.toLowerCase() === want) break;   // 기대한 이름이다 — 어긴 것이 아니다
      return nm;
    }
  }

  return '';
}
