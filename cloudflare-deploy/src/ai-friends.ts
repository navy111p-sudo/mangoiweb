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

   ⚠️ 거짓경보가 이 검사의 진짜 위험입니다. 멀쩡한 답을 버리면 대화가 그 자리에서
      끊깁니다. 그래서 두 단계로 나눴습니다.
        ① 확실한 자리 — "my name is X" · "call me X" 뒤에는 사실상 이름만 옵니다.
           여기서는 «대문자로 시작하는 낱말» 이면 잡습니다.
        ② 애매한 자리 — "I'm X" 는 "I'm happy" · "I'm a teacher" 가 훨씬 흔합니다.
           그래서 X 가 «우리 친구 넷 중 다른 이름» 일 때만 잡습니다.
      ⛔ ②를 ①처럼 넓히지 마세요. 초보 대화에서 "I'm ~" 이 얼마나 흔한지 생각하면
         멀쩡한 답을 무더기로 버리게 됩니다.
   ═══════════════════════════════════════════════════════════════════════ */

/** 우리가 아는 친구 이름들(소문자). 「나는 Emma 야」 같은 «남의 이름» 판정에 쓴다.
 *  ⚠️ 기본 이름(Mango)도 넣는다 — Lily 를 골랐는데 「I'm Mango」라고 하면 그것도 «어긴 것» 이다. */
function knownNamesLower(): string[] {
  return Object.keys(AI_FRIEND_NAMES)
    .map((k) => String(AI_FRIEND_NAMES[k] || '').toLowerCase())
    .concat([AI_FRIEND_DEFAULT.toLowerCase()]);
}

/** «이름 자리에 왔지만 이름이 아닌» 낱말.
 *
 *  🔴 2026-09-01 실측 — 첫 판(2026-08-31)은 열 가지 자기소개 모양 중 «두 가지» 만 잡았다.
 *     사장님이 계속 보시던 「Hi! I'm Louie.」가 정확히 제가 «일부러 안 잡는다» 고 해 둔 자리였다.
 *     그때 근거는 「"I'm happy" · "I'm a teacher" 가 훨씬 흔하다」였는데, 그 예들은 전부
 *     «소문자» 다. 영어에서 I'm 뒤에 «대문자» 낱말이 오면 사실상 고유명사다.
 *     그래서 판정을 «대문자인가» 로 바꾸고, 대문자로 올 수 있는 «이름 아닌 것» 만 여기 모은다.
 *
 *  ⛔ 이 목록을 «흔한 영어 낱말 사전» 으로 키우지 말 것 — 그러면 진짜 사람 이름(Grace·May·
 *     Summer·Joy)까지 통과시킨다. 여기 담는 것은 ① 국적·언어 ② 상태를 강조해 대문자로
 *     쓰는 낱말 ③ 이름 앞에 붙는 호칭, 셋뿐이다. */
const NOT_A_NAME = new Set([
  /* 한정사·부사 — 「My name is NOT Roy」의 NOT 이 여기서 걸린다 */
  'not', 'no', 'never', 'still', 'also', 'actually', 'really', 'just', 'always', 'only',
  'the', 'a', 'an', 'your', 'my', 'his', 'her', 'their', 'so', 'very', 'super', 'too',
  /* 국적·언어 — 「I'm Korean」이 가장 흔한 거짓경보다 */
  'korean', 'american', 'filipino', 'filipina', 'english', 'chinese', 'japanese', 'spanish',
  'french', 'british', 'canadian', 'australian', 'indian', 'german', 'italian', 'mexican',
  'brazilian', 'russian', 'vietnamese', 'thai', 'asian', 'european', 'african', 'latino',
  /* 상태·감정 — 강조하려고 대문자로 쓰는 경우 */
  'ok', 'okay', 'fine', 'good', 'great', 'happy', 'sad', 'sorry', 'ready', 'excited',
  'glad', 'sure', 'tired', 'hungry', 'busy', 'fun', 'nice', 'proud', 'fantastic',
  'awesome', 'wonderful', 'curious', 'here', 'back', 'done', 'new', 'young', 'old',
  'from', 'going', 'learning', 'thinking', 'listening', 'waiting', 'looking',
  /* 호칭 — 「I'm Teacher Lily」의 Teacher. (이 문장은 아래 «같은 문장에 기대 이름» 규칙으로도 걸러진다) */
  'teacher', 'student', 'friend', 'miss', 'mister', 'mr', 'ms', 'mrs',
]);

/**
 * AI 답변이 «기대한 이름이 아닌 다른 이름» 으로 자기를 소개했으면 그 이름을 돌려준다.
 * 멀쩡하면 빈 문자열.
 *
 * ✅ 판정은 «문장 단위» 다. 같은 문장에 기대 이름이 함께 있으면 자기소개를 어긴 것이 아니다 —
 *    「I'm Teacher Lily.」·「My name is not Emma, my name is Lily!」가 그래서 통과한다.
 * ⚠️ 곱슬 따옴표(’)를 먼저 편다 — 모델이 자주 쓰는데, 안 펴면 「I’m Louie」를 통째로 놓친다.
 */
export function wrongSelfName(reply: unknown, expected: string): string {
  /* 곱슬 따옴표 정규화 — I’m · name’s */
  const t = String(reply || '').replace(/[\u2018\u2019\u02BC\u00B4`]/g, "'");
  const want = String(expected || '').trim().toLowerCase();
  if (!t || !want) return '';
  const known = knownNamesLower();
  /* ⚠️ 앞말은 대소문자를 가리지 않아야 한다("My name is" 는 문장 첫머리라 대문자로 온다).
     그래서 i 플래그를 쓰고, «이름처럼 생겼는가» 는 코드에서 따로 본다 —
     정규식에 [A-Z] 만 적으면 i 플래그가 그것까지 풀어 버린다(실제로 그렇게 짰다가
     실사고 문장을 하나도 못 잡았다). */
  const looksName = (w: string) => !!w && /^[A-Za-z][A-Za-z'-]*$/.test(w)
    && /^[A-Z]/.test(w) && !NOT_A_NAME.has(w.toLowerCase());
  const wantRe = new RegExp('\\b' + want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');

  for (const sent of t.split(/(?<=[.!?])\s+|\n+/)) {
    /* 같은 문장이 기대 이름을 함께 말하고 있으면 어긴 것이 아니다 */
    if (wantRe.test(sent)) continue;
    let m: RegExpExecArray | null;

    /* ① 이름만 오는 자리 — 대문자면 이름 후보로 본다.
       「I'm X」를 여기 넣은 것이 2026-09-01 수리의 핵심이다(위 주석). */
    const strong = /\b(?:my name(?:'s| is)|call me|you can call me|i'm|i am)\s+([A-Za-z][A-Za-z'-]{1,19})|\b([A-Za-z][A-Za-z'-]{1,19})\s+is my name\b/gi;
    while ((m = strong.exec(sent))) {
      const got = m[1] || m[2] || '';
      if (!looksName(got)) continue;
      if (got.toLowerCase() !== want) return got;
    }

    /* ② 애매한 자리 — «우리 친구 이름(+기본값 Mango)» 일 때만.
       ⛔ 여기를 ①처럼 넓히지 말 것: 「This is a dog.」·「Come here!」 처럼 이름이 아닌 것이
          그 자리에 흔히 오고, 학생 이름을 부르는 말(「This is Minsu's book」)까지 잡는다. */
    const weak = /\b(?:this is)\s+([A-Za-z][A-Za-z'-]{1,19})|\b([A-Za-z][A-Za-z'-]{1,19})\s+here\b/gi;
    while ((m = weak.exec(sent))) {
      const got = m[1] || m[2] || '';
      if (!looksName(got)) continue;
      const low = got.toLowerCase();
      if (low === want) continue;
      if (known.indexOf(low) >= 0) return got;
    }
  }

  return '';
}
