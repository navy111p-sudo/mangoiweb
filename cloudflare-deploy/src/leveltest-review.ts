/* 📘 레벨테스트 «틀린 문제 다시 보기» — 정답·해설을 학생에게 돌려주는 판정 정본
   (2026-09-22 사장님 지시: 「결과만 나오는데 틀린문제에 대한 해설과 정답이 나왔으면 좋겠음」)

   [왜 이 파일이 따로 있나]
     채점은 `api-admin.ts` 의 diagnose 안에 있고 문항은행(CEFR_BANK)도 그 안의 지역 상수다.
     그런데 여기서 정하는 것은 «무엇을 학생에게 돌려줄 것인가» 라 문자열 검사로는 못 본다
     (함수도 값도 다 «있고» 틀리는 것은 «무엇이 실리는가» 뿐이다). 그래서 순수 함수로 빼서
     하니스가 **실제로 돌려** 답을 보게 한다 — CLAUDE.md 「비용·보안 게이트를 라우트 안에만
     두지 마세요」와 같은 이유다.

   [🔒 정답이 새는 창을 좁힌다 — 여기가 이 파일의 핵심 계약이다]
     `/api/leveltest/questions` 는 정답(a)을 «일부러» 숨긴다. 이 기능은 그 반대 방향이라,
     아무 제약 없이 실으면 «답을 하나도 안 내고 diagnose 만 호출해 24문항 정답을 통째로
     받아 가는» 길이 열린다(이 경로는 무인증 공개다 — index.ts 허용목록).
     그래서 세 겹으로 좁힌다:
       ① 학생이 **실제로 고른** 문항만 (안 푼 문항은 해설할 것도 없다)
       ② 그 값이 **보기 범위 안의 정수**일 때만 (범위 밖 쓰레기 24개로 훑는 길을 막는다)
       ③ **틀린 문항만** (맞힌 문항의 정답은 본인이 이미 고른 값이라 새 정보가 아니다)
     🔴 그래도 «24문항을 전부 답하면 그중 틀린 것의 정답은 온다» 는 남는다 — 그것이
        이 기능 자체다. 막으려면 기능을 없애야 한다.
        ⛔ 그 남는 위험을 «시험을 끝까지 봐야 하니 비용이 든다» 로 적지 마라 — 틀렸다.
           [잰 것 — 2026-09-22, 이 함수를 실제로 돌림] 24문항에 «전부 0번» 을 채운 본문으로
           **단 한 번** 부르면 정답키가 **100% 복원**된다: review 로 오는 18건은 answer 가
           그대로 오고, 안 오는 6건은 «내가 고른 0 이 정답» 이라는 뜻이라 저절로 확정된다.
           ⟹ 세 겹이 막는 것은 «빈 본문 1회» 이고 «0 채운 본문 1회» 는 그대로 통과한다.
              자동 호출자에게 그 둘은 비용 차이가 없다 — 이 변경은 유출을 «막은» 것이
              아니라 **난이도를 낮췄다**(옛 경로는 breakdown 뿐이라 여러 번이 필요했다).
        ℹ️ 완충: 배치 결과(students_erp.level)는 applyPlacementLevel 이 «이미 레벨이 있으면
           안 덮는다» 라 재응시로 학습도구 배정이 바뀌지는 않는다. 화상수업 학생은 선생님
           1:1 평가가 최종이다. ⚠️ 다만 AI 학습만 하는 학생(ai_done)은 그 단계가 없고,
           이 경로에는 속도 제한이 없으며 호출마다 leveltest_applications 행이 쌓인다.
           ⟹ 추가 제한을 둘지는 **사람이 정할 일**이다(2026-09-22 미결).
     ⛔ ①②③ 중 하나라도 풀면 그 창이 도로 넓어진다. 하니스가 셋을 각각 못 박는다.

   [⛔ 해설을 지어내지 않는다]
     해설이 비어 있으면 그 문항은 «해설 없음» 으로 두고 화면이 정답만 말한다.
     모르면서 그럴듯한 설명을 붙이는 것은 이 저장소가 반복해서 금지한 방향이다. */

export type LtBankItem = {
  id: string;
  cefr: string;
  skill?: string;
  q: string;
  choices: string[];
  a: number;
  /** 한국어 해설 한 줄. 비면 화면이 «정답만» 말한다(지어내지 않는다). */
  why?: string;
};

export type LtReviewItem = {
  id: string;
  cefr: string;
  q: string;
  choices: string[];
  /** 학생이 고른 보기 번호 — 범위 안의 정수임이 확인된 값만 온다 */
  picked: number;
  /** 정답 보기 번호 */
  answer: number;
  /** 한국어 해설(없으면 빈 문자열) */
  why: string;
  /** 빈칸(___)을 정답으로 채운 영어 문장. 빈칸이 없는 문항이면 빈 문자열 */
  sentence: string;
};

/** 보기 범위 안의 «정수» 인가. ⚠️ 0(A번)은 정당한 값이라 falsy 로 거르면 안 된다. */
function pickedIndexOf(raw: any, choiceCount: number): number | null {
  if (raw == null) return null;                    // 안 푼 문항
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n < 0 || n >= choiceCount) return null;      // 범위 밖 쓰레기
  return n;
}

/** 빈칸(___)을 정답으로 채운 문장. 빈칸이 없으면 '' — 「완성 문장」을 지어내지 않는다. */
export function filledSentence(item: LtBankItem): string {
  const q = String(item.q || '');
  if (!/_{2,}/.test(q)) return '';
  const ans = item.choices && item.choices[item.a];
  if (ans == null) return '';
  return q.replace(/_{2,}/, String(ans));
}

/**
 * 틀린 문항의 정답·해설 목록을 만든다.
 * ⚠️ 문항 순서(문항은행 순서)를 그대로 지킨다 — 학생이 푼 차례와 같아야 찾기 쉽다.
 */
export function buildLeveltestReview(bank: LtBankItem[], answers: any): LtReviewItem[] {
  const out: LtReviewItem[] = [];
  if (!Array.isArray(bank)) return out;
  const src = (answers && typeof answers === 'object') ? answers : {};
  for (const item of bank) {
    if (!item || !Array.isArray(item.choices)) continue;
    const picked = pickedIndexOf(src[item.id], item.choices.length);
    if (picked == null) continue;                  // ① 안 푼 문항 · ② 범위 밖
    if (picked === item.a) continue;               // ③ 맞힌 문항
    out.push({
      id: item.id,
      cefr: item.cefr,
      q: item.q,
      choices: item.choices.slice(),
      picked,
      answer: item.a,
      why: String(item.why || ''),
      sentence: filledSentence(item),
    });
  }
  return out;
}
