/**
 * warmup-zh.ts — 🀄 중국어 대화(웜업·A.i 친구하기) 정본
 *
 * [왜 새 파일인가] 웜업 서버 코드는 `src/index.ts`(공동 금지구역, CLAUDE.md 1-3)에 있다.
 *   중국어 지시문·레벨·교정 축을 거기 적으면 금지구역이 그만큼 커지고, 영어 규칙과 섞여
 *   「한쪽만 고쳐지는」 사고가 시작된다. 그래서 «중국어에만 해당하는 것» 은 전부 여기 두고
 *   index.ts 는 **부르기만** 한다.
 *
 * [무엇을 안 하는가] 영어 규칙은 한 글자도 건드리지 않는다. 이 파일이 비어도(=lang 이 'zh' 가
 *   아니면) 웜업은 2026-09-13 이전과 정확히 같게 동작한다.
 *
 * ⚠️ 레벨 여덟 칸은 영어(`WARMUP_LEVELS`)·AI 친구(`AI_FRIEND_LEVELS`)·판단력 훈련
 *    (`BAND_SPECS`)과 **같은 눈금**이다. 칸을 밀거나 늘리지 말 것 — 저장된
 *    `mangoi_warmup_level` 의 «뜻» 이 말없이 바뀐다(CLAUDE.md 2장 「단계를 늘려 달라」).
 *    다른 것은 «무엇으로 재는가» 뿐이다: 영어는 낱말 수, 중국어는 **글자 수**.
 *
 * ⚠️ 초급을 쉽게 하는 길은 «길이» 가 아니라 **«열린 질문을 없애는 것»** 이다 — 영어에서
 *    실측으로 확인된 것이라(CLAUDE.md 2장) 1·2단계에 같은 규칙을 넣었다.
 */

import { resolveZhTextbook } from './zh-textbook';

export type WarmupLang = 'en' | 'zh';

/** 화면이 보낸 값을 'en' | 'zh' 로 좁힌다. 모르는 값·빈 값은 **영어**(예전 동작). */
export function normalizeWarmupLang(v: any): WarmupLang {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return (s === 'zh' || s === 'zh-cn' || s === 'cn' || s === 'chinese') ? 'zh' : 'en';
}

/* ════════════════════════════════════════════════════════════════════
 *  대화 지시문 — 영어 `warmupSystem()` 과 같은 구조·같은 순서로 둔다.
 *  ⚠️ 화면 쪽 전제 두 가지는 영어와 동일하다(그 함수를 그대로 쓰기 때문):
 *    ① 괄호 안은 **음성으로 읽히지 않고 자막에만** 보인다(`_speechText()` 가 버린다)
 *    ② 마크다운을 렌더하지 않는다(`renderMsg()` 가 escapeHtml 만 한다)
 * ════════════════════════════════════════════════════════════════════ */
export const warmupZhSystem = (friendName: string) => [
  `너는 망고아이의 AI 대화 친구 '${friendName}' 야. 수업 전에 학생의 입을 풀어 주는 중국어 워밍업 상대야. 밝고 장난기 많은 단짝 친구처럼 신나게 리액션해줘.`,
  `[이름] 학생이 이름을 물으면 반드시 '${friendName}' 라고 답해. 다른 이름을 지어내지 마.`,
  '[언어] 네 대사는 반드시 **중국어 간체자**로 말해. 번체자·주음부호는 쓰지 마. 한국어가 꼭 필요하면 중국어 문장 뒤 «괄호 안» 에만 짧게 덧붙여 — 괄호 안은 음성으로 읽히지 않고 자막에만 보인다. 괄호 밖에 한국어를 쓰면 중국어 목소리가 그대로 읽어서 소리가 뭉개진다.',
  '[문법이 먼저] 짧게 말하려다 문법을 깨뜨리지 마. 글자 수를 한두 자 넘더라도 올바른 중국어가 우선이다. 특히 양사(个·本·张·杯)를 빠뜨리거나, 시간을 나타내는 말을 문장 끝으로 보내지 마. 바른 예: 我昨天去了学校。 / 틀린 예: 我去学校昨天。',
  '[길이] 한 번에 2문장을 넘기지 마. 그리고 질문은 «한 번에 하나만» 해 — 두세 개를 몰아 묻지 마.',
  '[형식] 사람이 말하듯 평문으로만 써. 마크다운(**, *, #, 목록)·이름표·(웃으며) 같은 지문은 쓰지 마. 이모지는 1~2개까지.',
  '[칭찬] 학생이 잘 대답하면 크게 기뻐하며 칭찬한 뒤 다음 질문으로 이어가줘. 칭찬 말은 «직전 두 번과 다른 것» 으로 골라 써 — 太棒了！、真不错！、说得好！、对了！、厉害！、哇！、很好！ 처럼 돌려 쓰고 같은 말을 연달아 반복하지 마.',
  '[막혔을 때] 학생이 「몰라요」라고 하거나 한국어로만 답하면 그냥 넘어가지 마. ① 학생이 따라 말할 수 있는 짧은 중국어 예시 문장을 하나 주고 ② 더 쉬운 질문으로 다시 물어봐.',
  '[중국어로 어떻게 말해요?] 학생이 한국어로 「이거 중국어로 어떻게 해?」 라고 물으면 자연스러운 중국어 문장을 알려주고, 그 문장을 소리 내어 말해 보도록 이끌어줘.',
  '[잘 못 알아들었을 때] 학생의 말은 음성인식을 거쳐 오기 때문에 글자가 깨지거나 엉뚱한 단어로 바뀌어 올 수 있어. 뜻이 통하지 않으면 아무 말이나 지어내지 말고, 문맥상 가장 그럴듯한 뜻으로 받아 주거나 「不好意思，我没听清，你再说一遍好吗？」 처럼 «한 번만» 짧게 되물어.',
  '[재미] 가끔 재미있는 방식으로 물어봐 — 「你更喜欢A还是B？」 양자택일, 「如果…会怎么样？」 상상 질문, 좋아하는 것 맞히기. 같은 방식을 연속으로 반복하지 말고 대화가 게임처럼 이어지게 해줘.',
  '[주제] 학생 또래가 편하게 말할 수 있는 일상 주제로 이어가. 아래에 오늘의 주제나 교재 정보가 주어지면 그것과 이어지도록 물어봐.',
].join('\n');

/* 🪜 레벨 여덟 칸 — 영어 `WARMUP_LEVELS` 와 같은 자리, 재는 단위만 «글자 수».
   ⚠️ 1·2단계에 「병음을 함께」를 넣은 이유: 초급 학생은 한자를 아직 못 읽는다. 괄호 안은
      음성으로 안 읽히므로 소리는 중국어만 나가고 자막에만 병음·뜻이 보인다. */
export const WARMUP_ZH_LEVELS: Record<number, string> = {
  1: '레벨 1(첫걸음·A1): 아주 쉬운 기초 단어만 쓰고, 한 번에 3~5글자의 짧은 문장만 말해줘. 질문은 학생이 「是。」「不是。」「对。」로 답할 수 있는 것만 해 — 의문사(什么·哪儿·怎么) 질문이나 「还是」 선택 질문은 하지 마. 네가 말한 중국어 문장의 병음과 한국어 뜻을 괄호 안에 함께 적어줘.',
  2: '레벨 2(기초·A2): 기초 일상 단어로 5~8글자의 짧고 쉬운 문장을 써줘. 질문은 是/不是 이거나, 고를 말이 질문 안에 들어 있는 「A还是B」 선택 질문으로 해줘(학생이 네 말을 그대로 따라 답할 수 있게). 병음과 한국어 뜻을 괄호 안에 함께 적어줘.',
  3: '레벨 3(초급·A2+): 익숙한 일상 표현으로 8~12글자 정도의 문장을 써줘. 어려운 단어에만 괄호 안에 병음을 덧붙여줘.',
  4: '레벨 4(초중급·B1): 완료를 나타내는 了, 경험을 나타내는 过, 그리고 因为…所以 같은 간단한 접속사를 섞어 12~16글자 문장으로 말해줘.',
  5: '레벨 5(중급·B1+): 비교(比)·정도보어(得)·이유 표현을 16~20글자 문장으로 쓰고, 필요하면 두 문장까지 자연스럽게 이어서 말해줘.',
  6: '레벨 6(중고급·B2): 把구문·被구문·「虽然…但是」 같은 복문과 쉬운 관용 표현을 조금씩 섞어 20~26글자 문장으로 자연스럽게 대화해줘.',
  7: '레벨 7(고급·B2+): 원어민이 실제로 쓰는 성어·구어 표현·연결어를 활용해 26~32글자 문장으로 좀 더 깊이 있는 후속 질문을 해줘.',
  8: '레벨 8(최상급·C1): 유창한 원어민 수준으로 관용구·뉘앙스·추상적 주제까지 다루며 도전적인 질문으로 대화를 이끌어줘.',
};

/* 🧯 레벨별 «한 문장 글자 상한» — 무너진 출력 판정의 길이 안전망에만 쓴다.
   영어 `WARMUP_WORD_CAP` 과 같은 자리이고, 판정 쪽이 «두 배 + 여유» 로 넉넉히 잡으므로
   여기 숫자는 «버릴 기준» 이 아니다. ⚠️ 위 WARMUP_ZH_LEVELS 문자열의 숫자와 같아야 한다. */
export const WARMUP_ZH_CHAR_CAP: Record<number, number> = { 1: 5, 2: 8, 3: 12, 4: 16, 5: 20, 6: 26, 7: 32, 8: 0 };

/* ✏️ 교정 축·교정 규칙은 여기 없다 — `src/warmup-correction.ts` 의
   `ZH_MEANING_CHANGING_TAGS` · `WARMUP_ZH_CORRECTION_RULE` 이 정본이다.
   ⛔ 이리로 옮기지 말 것: 교정은 JSON 출력 계약(fixJsonLine)과 한 몸이고,
      그 스키마를 두 곳에 적으면 파서·검증 한 벌이 두 화면을 받는다는 전제가 깨진다. */

/* ════════════════════════════════════════════════════════════════════
 *  교재 소재 — 「AI 가 말할 문장」이 아니라 «오늘 무슨 이야기를 할지 정하는 소재» 다.
 *  ⚠️ 교재(중국어 마스터)가 중급 과정이라 문장이 초급에는 어렵다. 그대로 읽히면 안 되고,
 *     모델이 그 주제로 **학생 레벨에 맞는 쉬운 문장**을 만든다 — 영어 웜업과 같은 구조.
 *  ⛔ 영어 전용 게이트(`isEnglishText`·`isEnglishQuestion`)를 여기에 걸지 말 것.
 *     걸면 중국어 문장이 통째로 걸러져 소재가 늘 0개가 된다.
 * ════════════════════════════════════════════════════════════════════ */

/** `zh_vocab`·`zh_passage` 에 실제로 있는 교재 표기 목록. 실패하면 빈 배열(= 못 이음). */
async function knownZhTextbooks(env: { DB: any }): Promise<string[]> {
  const out = new Set<string>();
  for (const t of ['zh_vocab', 'zh_passage']) {
    try {
      const rs = await env.DB.prepare(
        `SELECT DISTINCT textbook FROM ${t} WHERE textbook IS NOT NULL AND TRIM(textbook) <> '' LIMIT 50`,
      ).all();
      for (const r of ((rs.results as any[]) || [])) {
        const v = String(r.textbook || '').trim();
        if (v) out.add(v);
      }
    } catch {}
  }
  return [...out];
}

/**
 * 학생 교재 이름 → 중국어 콘텐츠 표기.
 *   못 이으면 null 이지만, **중국어 교재가 저장소에 하나뿐이면 그것**으로 본다.
 *   ⚠️ 그 폴백이 필요한 이유: `students_erp.textbook` 이 29,492행 전부 비어 있어
 *      (2026-09-13 실측) 교재로는 아무것도 못 잇는다. 교재가 둘 이상이 되면
 *      폴백이 저절로 꺼져 «모름» 으로 돌아간다 — ⛔ 이름을 하드코딩하지 말 것.
 */
export async function resolveZhBook(env: { DB: any }, rawTextbook: string): Promise<string | null> {
  const known = await knownZhTextbooks(env);
  if (!known.length) return null;
  const hit = resolveZhTextbook(rawTextbook, known);
  if (hit) return hit;
  return known.length === 1 ? known[0] : null;
}

/**
 * 오늘 대화의 «소재» 문장. 교재 문장(zh_vocab) → 독해 문단(zh_passage) 순.
 * @returns 최대 8개. 실패·없음이면 빈 배열(대화는 그대로 돌아간다).
 */
export async function zhWarmupSentences(
  env: { DB: any },
  o: { textbook?: string; lessonNo?: number | null },
): Promise<string[]> {
  const out: string[] = [];
  const push = (s: any) => {
    const v = String(s == null ? '' : s).trim();
    if (v && !out.includes(v) && out.length < 8) out.push(v);
  };
  try {
    const book = await resolveZhBook(env, String(o.textbook || ''));
    if (!book) return out;
    const lesson = (Number(o.lessonNo) > 0) ? Number(o.lessonNo) : null;

    // ── 교재 문장 (한자 + 병음 + 뜻을 한 줄로 붙여 모델에게 준다)
    const tries: Array<{ sql: string; binds: any[] }> = [];
    if (lesson) {
      tries.push({
        sql: `SELECT hanzi, pinyin, ko FROM zh_vocab WHERE active=1 AND type='sentence' AND LOWER(textbook)=LOWER(?) AND lesson_no=? ORDER BY id ASC LIMIT 8`,
        binds: [book, lesson],
      });
    }
    tries.push({
      sql: `SELECT hanzi, pinyin, ko FROM zh_vocab WHERE active=1 AND type='sentence' AND LOWER(textbook)=LOWER(?) ORDER BY RANDOM() LIMIT 8`,
      binds: [book],
    });
    for (const t of tries) {
      const rs = await env.DB.prepare(t.sql).bind(...t.binds).all();
      for (const r of ((rs.results as any[]) || [])) {
        const hanzi = String(r.hanzi || '').trim();
        if (!hanzi) continue;
        const ko = String(r.ko || '').trim();
        push(ko ? `${hanzi} (${ko})` : hanzi);
      }
      if (out.length >= 4) break;
    }

    // ── 모자라면 독해 문단의 제목으로 «오늘의 화제» 를 보탠다
    if (out.length < 4) {
      const sql = lesson
        ? `SELECT title_zh, title_ko FROM zh_passage WHERE LOWER(textbook)=LOWER(?) AND lesson_no=? LIMIT 2`
        : `SELECT title_zh, title_ko FROM zh_passage WHERE LOWER(textbook)=LOWER(?) ORDER BY lesson_no ASC LIMIT 3`;
      const binds = lesson ? [book, lesson] : [book];
      const rs = await env.DB.prepare(sql).bind(...binds).all();
      for (const r of ((rs.results as any[]) || [])) {
        const zh = String(r.title_zh || '').trim();
        if (!zh) continue;
        const ko = String(r.title_ko || '').trim();
        push(ko ? `${zh} (${ko})` : zh);
      }
    }
  } catch {}
  return out;
}

/**
 * 「이 학생이 중국어를 하나」 — 중국어 강사 수업이 잡혀 있는가.
 *
 * [왜 이 근거인가] 지금 코드는 학생 명부의 교재 칸으로 가리는데 그 칸이 **전부 비어**
 *   있어 한 번도 안 걸린다(2026-09-13 실측 0/29,492). 반면 예약표에는 중국어 강사의
 *   수업이 실제로 들어 있어 두 학생이 정확히 걸린다.
 *
 * ⚠️ 이것은 «기본값을 고르는» 힌트일 뿐이다. 최종 결정은 화면에서 학생이 고른 값이고,
 *    서버는 화면이 보낸 lang 을 그대로 따른다.
 * ⚠️ 강사 이름으로 찾는다 — 원부 번호는 카페24 번호와 체계가 달라 번호로 이으면
 *    남의 강사가 걸린다(CLAUDE.md 2장 「강사 이름을 붙였는데 남의 이름」).
 * @returns 못 읽으면 **false**(= 영어). 모를 때 중국어로 밀어붙이지 않는다.
 */
export async function zhStudentByTeacher(env: { DB: any }, userId: string): Promise<boolean> {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  try {
    const r: any = await env.DB.prepare(
      `SELECT 1 AS hit FROM class_schedules cs
         JOIN teachers t ON CAST(t.id AS TEXT) = cs.teacher_id
        WHERE cs.user_id = ? AND cs.status = 'active'
          AND (t.name LIKE '%중국어%' OR t.name LIKE '%중국%')
        LIMIT 1`,
    ).bind(uid).first();
    return !!(r && r.hit);
  } catch {
    return false;
  }
}

/* ════════════════════════════════════════════════════════════════════
 *  💬 «이렇게 대답해 보세요» 보기 칩 — 중국어판
 *
 *  ⛔ 영어 정본(`warmupAnswerChips`, src/warmup-answers.ts)을 중국어에 그대로 쓰면 안 된다.
 *     그 함수는 영어 문형(`do you like` · `or` · 조동사)으로 답을 «유도» 하는데, 중국어
 *     문장에는 하나도 안 맞아 만들어 내는 것이 0개가 된다. 그런데 1·2단계에서는
 *     «막혔을 때 칩»(One more time, please. / I don't know.)이 **조건 없이** 붙으므로,
 *     중국어를 고른 학생에게 **영어 보기 두 개**가 그대로 뜬다(2026-09-13 코드 실측).
 *
 *  ⛔ 중국어 질문에서 답을 «유도» 하지 마세요 — 지금은 그 방법이 없습니다.
 *     CLAUDE.md 2장 「초보에게 «따라 말할 예문» 을 만들어 줄 때」: 만들 수 없으면 **안 만듭니다**.
 *     그래서 이 함수가 주는 것은 «어떤 질문에도 문법이 맞는 탈출구» 뿐이고, 그 밖에는 빈 배열이다.
 *
 *  ⚠️ 그 결과 중국어에서는 「양자택일·Yes/No 보기」가 안 나온다 — 영어보다 지원이 얇다.
 *     이것은 아는 채로 택한 것이고, 채우려면 중국어 문형 표를 손으로 만들어야 한다(별건).
 * ════════════════════════════════════════════════════════════════════ */

/**
 * 낮은 단계에서 «막혔을 때» 쓰는 만능 칩(중국어).
 * ⛔ 괄호로 한국어 뜻을 덧붙이지 마세요 — 이 칩은 누르면 **그 글자가 그대로 학생 발화로
 *    전송됩니다**(warmup.html 의 `pickAnswer()` 가 입력칸에 넣고 곧바로 보냅니다).
 *    뜻을 붙이면 「我不知道。(모르겠어요)」가 학생이 한 말로 모델에게 갑니다.
 *    ℹ️ AI «말풍선» 안의 괄호는 괜찮습니다 — 거기는 `_speechText()` 가 낭독에서 걸러 냅니다.
 */
export const WARMUP_ZH_STUCK_CHIPS: string[] = ['再说一遍。', '我不知道。'];

/** 영어와 같은 눈금: 보기를 주는 것은 1~3단계까지(그 위는 스스로 답하는 것이 훈련). */
export const WARMUP_ZH_CHIP_MAX_LEVEL = 3;

/**
 * 중국어 «대답 보기». 1·2단계에만 탈출구를 주고 그 밖에는 빈 배열.
 * ⚠️ `aiText` 는 «지금은» 안 쓴다 — 쓰는 척하는 인자를 남겨 두면 다음 사람이
 *    「여기서 질문을 보고 있다」고 오해한다. 그래서 이름을 `_aiText` 로 둔다.
 */
export function warmupZhAnswerChips(_aiText: unknown, level: unknown): string[] {
  const lv = Math.floor(Number(level));
  if (!(lv >= 1 && lv <= 2)) return [];
  return WARMUP_ZH_STUCK_CHIPS.slice();
}

/* ════════════════════════════════════════════════════════════════════
 *  🗣️ 「질문 골라 보기」(POST /api/warmup/questions) — 중국어판 재료
 *  ⚠️ 영어 목록(`WARMUP_FALLBACK_QUESTIONS`)을 그대로 쓰면 중국어 대화에 영어 질문이
 *     세 개 뜬다. 모델 호출이 실패했을 때만 오는 «안전망» 이라 조용히 새기 쉽다.
 * ════════════════════════════════════════════════════════════════════ */
export const WARMUP_ZH_FALLBACK_QUESTIONS: Record<'low' | 'mid' | 'high', string[]> = {
  low: ['你今天好吗？', '你喜欢猫还是狗？', '你今天吃了什么？', '你家有宠物吗？', '今天星期几？'],
  mid: ['你上个周末做了什么？', '你最喜欢哪门课？为什么？', '如果可以去任何地方旅行，你想去哪里？', '最近什么事让你很开心？', '你更喜欢住在山里还是海边？'],
  high: ['你最近学到了什么新东西？它怎么改变了你的想法？', '如果可以改掉学校的一条规定，你会改哪一条？为什么？', '你觉得二十年后的世界会是什么样子？', '说说一件让你为自己骄傲的事。', '你更想会飞还是会读心？说说你的理由。'],
};

/** 질문 생성 프롬프트에서 «무슨 말로 만들라» 고 지시하는 한 줄(영어는 '영어로'). */
export const WARMUP_ZH_QUESTION_LANG = '중국어 간체자로';
