// ═══════════════════════════════════════════════════════════════════════
// 🔤 correction-reason.ts — «왜 고쳤는지» 를 원문→교정 쌍에서 결정론으로 만든다
//
//   [왜 필요한가 — 2026-08-31 운영 D1 실측]
//     AI 영작 첨삭의 최근 8건, 교정 **21건 전부** 이유가 서버 폴백 문구
//     (「더 자연스러운 표현으로 바꿨어요」·「조금 더 자연스럽게 읽히도록 표현을 보탰어요」)
//     였습니다. 즉 모델이 `reason` 을 **매번 비워 보내고** 있고, 학생은 «무엇을» 고쳤는지는
//     보지만 **«왜» 는 한 번도 배우지 못합니다.**
//
//   [왜 프롬프트로 안 푸는가]
//     이 저장소의 반복 실측 — 「지시만으로는 안 지켜진다」(단어 수·문법·구두점).
//     프롬프트는 보조로 두고, **보장은 이 파일의 결정론 분류**가 합니다.
//
//   [원칙]
//     ⛔ 확신이 없으면 지어내지 않습니다 — `null` 을 돌려주고 부르는 쪽이 일반 문구를 씁니다.
//        틀린 설명은 «설명 없음» 보다 나쁩니다(아이가 그대로 외웁니다).
//     ✅ 아이가 읽을 글이라 «틀렸다» 가 아니라 «이렇게 쓰면 더 자연스럽다» 톤을 지킵니다.
//     ✅ 바뀐 낱말은 **학생이 쓴 그대로**(대문자면 대문자로) 보여 줍니다 — 자기 글에서
//        어디를 보라는지가 분명해집니다. 판정만 소문자로 하고 «표시» 는 원문을 씁니다.
//     ⚠️ `guessMisconception`(api-judgment.ts)이 이 글에서 오답유형을 뽑습니다.
//        그래서 「시제」·「관사」·「전치사」·「어순」·「표현」 같은 **낱말을 일부러 넣습니다.**
//        문구를 고칠 때 그 낱말을 빼면 판단력 오답유형이 조용히 null 이 됩니다.
//        ⛔ 반대로 철자 교정 문구에 「과거」·「시제」를 넣지 마세요 — 그 정규식이 **먼저**
//        걸려서 철자 오타가 TENSE_CONFUSION 으로 잘못 분류됩니다.
// ═══════════════════════════════════════════════════════════════════════

/** 아이 글에 자주 나오는 불규칙 과거형 (원형 → 과거) */
const PAST: Record<string, string> = {
  go: 'went', come: 'came', eat: 'ate', see: 'saw', get: 'got', give: 'gave', take: 'took',
  make: 'made', run: 'ran', swim: 'swam', sing: 'sang', drink: 'drank', write: 'wrote',
  read: 'read', buy: 'bought', bring: 'brought', think: 'thought', teach: 'taught',
  catch: 'caught', find: 'found', lose: 'lost', win: 'won', meet: 'met', sleep: 'slept',
  feel: 'felt', tell: 'told', say: 'said', do: 'did', have: 'had', fly: 'flew', ride: 'rode',
  fall: 'fell', sit: 'sat', stand: 'stood', put: 'put', hear: 'heard', leave: 'left', keep: 'kept',
  forget: 'forgot', break: 'broke', speak: 'spoke', wear: 'wore', draw: 'drew', grow: 'grew',
  know: 'knew', throw: 'threw', begin: 'began', become: 'became', build: 'built', send: 'sent',
  spend: 'spent', hold: 'held', hide: 'hid', bite: 'bit', choose: 'chose', drive: 'drove',
};
const BE_PAST: Record<string, string> = { is: 'was', am: 'was', are: 'were' };
const ART = new Set(['a', 'an', 'the']);
const PREP = new Set(['in', 'on', 'at', 'to', 'for', 'with', 'about', 'of', 'from', 'by',
  'into', 'over', 'under', 'near', 'around', 'after', 'before', 'during']);
const BE = new Set(['is', 'am', 'are', 'was', 'were', 'be']);
const SUBJ = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they']);
const MODAL_TO = new Set(['want', 'wants', 'wanted', 'need', 'needs', 'try', 'tried', 'like', 'likes', 'decided', 'started']);
// 문장과 문장을 잇는 말 — 하나만 «보태진» 경우에만 씁니다(빼는 쪽은 뜻이 달라질 수 있어 안 봅니다).
const CONJ = new Set(['and', 'but', 'so', 'because', 'or']);

// 「'an' 을 넣었어요」 — 조사(을/를)는 **영어 낱말의 한국어 발음**을 따릅니다.
//   an=앤(받침 O)→을 · the=더→를 · and=앤드→를 · will=윌→을.
//   ⛔ 끝 글자로 어림하면 틀립니다(and 는 d 로 끝나지만 «앤드» 라 를).
//   그래서 **실제로 넣거나 빼는 낱말**(ART·PREP·BE·SUBJ·CONJ·will)만 표로 못 박습니다.
const EUL_WORDS = new Set(['an', 'in', 'on', 'at', 'it', 'am', 'about', 'from', 'during', 'but', 'will']);
const REUL_WORDS = new Set(['a', 'the', 'to', 'for', 'with', 'of', 'by', 'into', 'over', 'under',
  'near', 'around', 'after', 'before', 'is', 'are', 'was', 'were', 'be',
  'i', 'you', 'he', 'she', 'we', 'they', 'and', 'so', 'or', 'because']);
/** 낱말 뒤에 붙일 목적격 조사. 표에 없는 낱말은 «를»(영어 낱말은 대개 모음으로 읽힙니다). */
function eul(w: string): string {
  const k = String(w || '').toLowerCase().replace(/[^a-z']/g, '');
  if (EUL_WORDS.has(k)) return '을';
  if (REUL_WORDS.has(k)) return '를';
  return '를';
}

const norm = (s: string) => String(s || '').trim().replace(/\s+/g, ' ');
const words = (s: string) => norm(s).split(' ').filter(Boolean);
const bare = (w: string) => String(w || '').toLowerCase().replace(/[^a-z']/g, '');
/** 화면에 보여 줄 형태 — 학생이 쓴 대소문자를 살리고 앞뒤 문장부호만 턴다. */
const strip = (w: string) => String(w || '').replace(/^[^A-Za-z']+/, '').replace(/[^A-Za-z']+$/, '');

/** 편집거리 (철자 오타 판정용). max 를 넘으면 굳이 정확히 세지 않는다. */
function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
// 긴 낱말일수록 오타가 늘어납니다 — 허용 거리를 «길이에 맞춰» 잡습니다.
//   2026-08-31 운영 D1 실측: sutentents→students 는 거리 4(10글자), pootball→football 은 1.
//   고정 2 로 두면 긴 오타가 「더 자연스러운 낱말로 바꿨어요」로 새어 나갑니다.
const spellTol = (a: string, b: string) => {
  const n = Math.max(a.length, b.length);
  return n >= 10 ? 4 : n >= 8 ? 3 : 2;
};
/**
 * 철자 오타로 볼 수 있는가.
 *   ⛔ «전혀 다른 낱말» 을 오타라고 부르면 아이가 잘못 배웁니다 — 세 조건을 모두 봅니다.
 *     ① 거리가 길이 기준 허용치 이내  ② 바뀐 비율이 40% 이하  ③ 첫 글자나 끝 두 글자가 같음
 *   실측으로 갈린 경계: peoples→players(비율 0.71) 는 «낱말 바꿈», pootball→football(0.13,
 *   첫 글자는 다르지만 끝 두 글자가 같음) 은 «철자».
 */
function looksMisspelled(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3 || a === b) return false;
  const tol = spellTol(a, b), n = Math.max(a.length, b.length);
  const d = editDistance(a, b, tol);
  if (d > tol || d / n > 0.4) return false;
  return a[0] === b[0] || a.slice(-2) === b.slice(-2);
}

/** «-ed 를 붙여 만든 가짜 과거형» 의 원형 후보 (losed→lose, runned→run, studied→study) */
function edStems(w: string): string[] {
  const out: string[] = [];
  if (/ed$/.test(w) && w.length >= 4) {
    const s2 = w.slice(0, -2);           // walked → walk
    out.push(s2, w.slice(0, -1));        // losed  → lose
    if (s2.length >= 3 && s2[s2.length - 1] === s2[s2.length - 2]) out.push(s2.slice(0, -1)); // runned → run
    if (/i$/.test(s2)) out.push(s2.slice(0, -1) + 'y');   // studied → study
  }
  return out;
}

/** 낱말 단위 diff — 앞뒤로 같은 부분을 깎아 «바뀐 구간» 만 남긴다. */
function diffWords(o: string[], s: string[]) {
  let head = 0;
  while (head < o.length && head < s.length && bare(o[head]) === bare(s[head])) head++;
  let tail = 0;
  while (tail < o.length - head && tail < s.length - head &&
         bare(o[o.length - 1 - tail]) === bare(s[s.length - 1 - tail])) tail++;
  return { removed: o.slice(head, o.length - tail), added: s.slice(head, s.length - tail), head, tail };
}

/**
 * 원문 → 교정 한 쌍을 보고 «왜 그렇게 고쳤는지» 한국어 한 문장을 만든다.
 * 분류가 안 되면 null (부르는 쪽이 일반 문구를 쓴다 — 지어내지 않는다).
 */
export function explainCorrection(original: string, suggested: string): string | null {
  const o = words(original), s = words(suggested);
  if (!o.length || !s.length) return null;
  const oJoin = o.map(bare).join(' '), sJoin = s.map(bare).join(' ');
  if (!oJoin || !sJoin) return null;

  // ① 대소문자·문장부호만 다름
  //   ⚠️ 원문 문자열을 통째로 비교하면 «마침표를 찍어 준 교정»(i like it → I like it.)이
  //      여기서 안 걸려 아래 diff 로 흘러가고, 그러면 바뀐 낱말이 없어 null 이 됩니다.
  //      그래서 «낱말 열» 로 비교합니다. 숫자는 bare() 가 지우므로 따로 대조합니다
  //      (2 cats → 3 cats 를 «부호만 다듬었다» 고 말하면 거짓말이 됩니다).
  const digits = (x: string) => (String(x).match(/\d+/g) || []).join(' ');
  if (oJoin === sJoin && digits(original) === digits(suggested)) {
    const letters = (x: string) => String(x).replace(/[^A-Za-z]/g, '');
    const caseChanged = letters(original) !== letters(suggested);
    const punctChanged = norm(original).replace(/[A-Za-z0-9\s]/g, '') !== norm(suggested).replace(/[A-Za-z0-9\s]/g, '');
    if (caseChanged && punctChanged) return '이름과 문장 첫 글자는 대문자로 쓰고, 문장 끝에는 마침표를 찍어요. 뜻은 그대로예요.';
    if (caseChanged) return '이름과 문장 첫 글자는 대문자로 써요. 뜻은 그대로예요.';
    if (punctChanged) return '문장부호만 다듬었어요. 뜻은 그대로예요.';
    return null;   // 눈에 보이는 차이가 없다 — 설명할 것이 없습니다
  }

  const d = diffWords(o, s);
  const remRaw = d.removed.filter(w => bare(w)), addRaw = d.added.filter(w => bare(w));
  const rem = remRaw.map(bare), add = addRaw.map(bare);
  // 표시는 학생이 쓴 그대로, 판정은 소문자로 — 두 벌을 나란히 든다.
  const R = (i: number) => strip(remRaw[i]) || rem[i];
  const A = (i: number) => strip(addRaw[i]) || add[i];
  const showAllR = () => remRaw.map(w => strip(w) || bare(w)).join(' ');
  const showAllA = () => addRaw.map(w => strip(w) || bare(w)).join(' ');

  // ② 낱말 하나 ↔ 하나
  if (rem.length === 1 && add.length === 1) {
    const a = rem[0], b = add[0];
    if (PAST[a] === b) return `지난 일이니까 과거형으로 써요: ${R(0)} → ${A(0)}. 시제를 맞추면 언제 있었던 일인지 분명해져요.`;
    if (BE_PAST[a] === b) return `지난 일이니까 be동사도 과거형으로 써요: ${R(0)} → ${A(0)}.`;
    // ⚠️ 불규칙 과거형은 «철자 오타» 보다 **먼저** 봅니다(losed→lost 가 편집거리 2 라 오타로 새어 나갔습니다).
    for (const st of edStems(a)) {
      if (PAST[st] === b) return `이 동사는 -ed 를 붙이지 않는 불규칙 과거형이에요: ${R(0)} → ${A(0)} (${st} → ${b}). 시제는 맞았으니 모양만 외워 두면 돼요.`;
    }
    if (b === a + 'ed' || (a.endsWith('e') && b === a + 'd')) return `지난 일이니까 과거형(-ed)으로 써요: ${R(0)} → ${A(0)}.`;
    if (PAST[b] === a) return `여기서는 현재 이야기라 원래 형태로 써요: ${R(0)} → ${A(0)}. 시제를 문장에 맞췄어요.`;
    if (b === a + 's' || b === a + 'es') return `둘 이상이거나 he/she/it 이라서 -s 를 붙여요: ${R(0)} → ${A(0)}.`;
    if (a === b + 's' || a === b + 'es') return `여기서는 하나라서 -s 를 뺐어요: ${R(0)} → ${A(0)}.`;
    if (ART.has(a) && ART.has(b)) return `관사를 다듬었어요: ${R(0)} → ${A(0)}. 모음 소리로 시작하면 an 을 써요.`;
    if (PREP.has(a) && PREP.has(b)) return `이 표현에는 '${A(0)}' 가 함께 쓰여요: ${R(0)} → ${A(0)}. 전치사는 짝지어 외워 두면 좋아요.`;
    if (BE.has(a) && BE.has(b)) return `주어에 맞는 be동사로 바꿨어요: ${R(0)} → ${A(0)}.`;
    if (looksMisspelled(a, b)) return `철자를 다듬었어요: ${R(0)} → ${A(0)}. 소리 내어 읽어 보면 기억에 남아요.`;
    return `더 자연스러운 낱말로 바꿨어요: ${R(0)} → ${A(0)}.`;
  }

  // ③ 낱말이 «더해진» 경우 (뺀 것 없음)
  if (rem.length === 0 && add.length >= 1) {
    if (add.length === 1) {
      const b = add[0];
      if (ART.has(b)) return `셀 수 있는 명사 앞에는 관사가 필요해요: '${A(0)}'${eul(b)} 넣었어요.`;
      if (b === 'to') return `동사 앞에 to 를 붙여 'to + 동사원형' 으로 써요.`;
      if (PREP.has(b)) return `이 표현에는 전치사 '${A(0)}' 가 함께 쓰여요. 짝지어 외워 두면 좋아요.`;
      if (BE.has(b)) return `영어 문장에는 동사가 있어야 해서 '${A(0)}'${eul(b)} 넣었어요.`;
      if (SUBJ.has(b)) return `영어 문장에는 주어가 꼭 있어야 해서 '${A(0)}'${eul(b)} 넣었어요.`;
      if (b === 'will') return `앞으로의 일이라 'will' 을 넣어 미래 시제로 맞췄어요.`;
      if (CONJ.has(b)) return `문장과 문장을 이어 주는 '${A(0)}'${eul(b)} 넣었어요. 이어 쓰면 한 문장처럼 자연스럽게 읽혀요.`;
    }
    if (add.includes('to') && o.some(w => MODAL_TO.has(bare(w))))
      return `want·need·like 다음에는 'to + 동사원형' 으로 써요: to ${add.filter(w => w !== 'to')[0] || ''}`.trim() + '.';
    if (add.every(w => ART.has(w) || PREP.has(w) || BE.has(w) || SUBJ.has(w)))
      return `문장에 꼭 필요한 말(${showAllA()})을 보탰어요. 영어는 이런 말을 생략하지 않아요.`;
    return null;   // 뜻을 보탠 경우 — 확신이 없으므로 지어내지 않는다
  }

  // ④ 낱말이 «빠진» 경우 (더한 것 없음)
  if (add.length === 0 && rem.length >= 1) {
    // 같은 말이 두 번 들어간 경우 — «덜어 냈다» 보다 «두 번 썼다» 가 배울 것이 있습니다.
    const dup = rem.length >= 2 && (new Set(rem).size === 1 || sJoin.indexOf(rem.join(' ')) >= 0);
    if (dup) return `같은 말이 두 번 들어가 있어서 하나만 남겼어요: ${showAllR()}.`;
    if (rem.length === 1 && PREP.has(rem[0])) return `전치사가 겹쳐서 '${R(0)}' 하나를 뺐어요. 한 자리에 전치사는 하나면 충분해요.`;
    if (rem.length === 1 && ART.has(rem[0])) return `여기에는 관사 '${R(0)}' 가 필요 없어요.`;
    if (rem.every(w => PREP.has(w) || ART.has(w))) return `겹치는 말(${showAllR()})을 뺐어요.`;
    return `없어도 뜻이 통하는 말을 덜어 냈어요: ${showAllR()}.`;
  }

  // ⑤ 낱말은 그대로인데 순서만 바뀜
  const key = (arr: string[]) => arr.slice().sort().join(' ');
  if (rem.length && add.length && key(rem) === key(add))
    return `영어는 «누가 → 무엇을 → 어디서» 순서로 써요. 어순만 바꿨어요.`;

  // ⑥ 여러 낱말이 통째로 바뀜 — 전치사·관사만 달라진 경우까지는 잡아 준다
  if (rem.length && add.length) {
    const remIdx = rem.map((w, i) => [w, i] as [string, number]).filter(([w]) => !add.includes(w));
    const addIdx = add.map((w, i) => [w, i] as [string, number]).filter(([w]) => !rem.includes(w));
    if (remIdx.length === 1 && addIdx.length === 1) {
      const [a, ai] = remIdx[0], [b, bi] = addIdx[0];
      const rw = strip(remRaw[ai]) || a, aw = strip(addRaw[bi]) || b;
      if (PAST[a] === b) return `지난 일이니까 과거형으로 써요: ${rw} → ${aw}.`;
      for (const st of edStems(a)) {
        if (PAST[st] === b) return `이 동사는 -ed 를 붙이지 않는 불규칙 과거형이에요: ${rw} → ${aw} (${st} → ${b}).`;
      }
      if (PREP.has(a) && PREP.has(b)) return `이 표현에는 '${aw}' 가 함께 쓰여요: ${rw} → ${aw}. 전치사는 짝지어 외워 두세요.`;
      if (looksMisspelled(a, b)) return `철자를 다듬었어요: ${rw} → ${aw}.`;
    }
    if (addIdx.length === 1 && ART.has(addIdx[0][0]) && !remIdx.length) {
      const b = addIdx[0][0], aw = strip(addRaw[addIdx[0][1]]) || b;
      return `셀 수 있는 명사 앞에는 관사가 필요해요: '${aw}'${eul(b)} 넣었어요.`;
    }
  }

  return null;   // ⛔ 여기까지 왔으면 «모른다» — 지어내지 않는다
}
