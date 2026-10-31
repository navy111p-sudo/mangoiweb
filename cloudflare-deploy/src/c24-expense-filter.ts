/* ═══════════════════════════════════════════════════════════════════════════
   🧾 카페24 지출결의(Neo4j `ExpenseReport`) — «우리 것이 아닌» 건 걸러내기
   (2026-08-24 사장님 지시)

   [왜 필요한가]
     관리자 「정산·매출 ▸ 회계 ▸ 🧾 카페24 회계 실데이터 ▸ 🧾 지출결의」 탭은
     카페24 그래프DB 의 `ExpenseReport` 를 **거르지 않고 그대로** 보여 준다.
     그런데 그 노드에는 **망고아이와 무관한 다른 조직이 올린 지출품의서가 함께 쌓인다**
     (「정기휴가 / 개인사정」·「유치부 야외활동 매트」·「약품구입 지품의」 …).
     그래서 이 화면은 «우리 회사 지출» 을 보는 자리인데 남의 회사 결재가 절반 넘게 섞여 나온다.

   [무엇이 우리 것인가 — 사장님이 알려 주신 판별법 두 가지]
     ① 결재라인에 「Joy」 또는 「박상인」 이 있으면 **우리 것이 아니다.**
     ② 제목·문구가 **한글**이면 우리 것이 아니다.
        필리핀 강사들이 올리는 우리 결재는 전부 **영어**다
        (「1ST CUT SALARY JULY 30- AUGUST 12, 2026」 처럼).

   [왜 «제목» 으로 판정하는가 — 내용까지 보면 안 되는 이유]
     우리(필리핀) 결재에도 거래처·비고에 한글이 섞일 수 있다(「쿠팡」 등).
     내용에 한글이 한 글자라도 있으면 버리는 규칙으로 하면 **진짜 우리 지출이 사라진다.**
     지출이 화면에서 사라지는 쪽이 남의 것이 섞이는 쪽보다 훨씬 나쁘므로,
     판정은 **제목** 으로 한다. 제목에 글자가 아예 없을 때만(빈 제목·번호만 있는 제목)
     내용으로 판정한다.

   [왜 「Joy」는 아무 칸에서나 찾지 않는가]
     Joy 는 **필리핀에서 매우 흔한 이름**이다. 제목·내용·비고에서 「Joy」를 찾아 버리면
     「Joy 선생님 병원비」 같은 **진짜 우리 결재**가 통째로 날아간다.
     그래서 「Joy」는 결재라인이 들어 있을 **메타 칸에서만** 찾는다(자유 서술 칸 제외).
     한글 이름 「박상인」은 영어 결재에 우연히 나올 일이 없으므로 어느 칸에서나 찾는다.

   ⚠️ Neo4j 는 TS 정규식을 못 쓰므로 **Cypher(`=~`, Java 정규식) 문자열**을 함께 내보낸다.
      같은 파일의 `KCP_TRANSFER_CYPHER_RE`(accounting-reports.ts)와 같은 관례다.
      Cypher 쪽은 «먼저 덜어내기»(전송량·속도)일 뿐이고 **최종 판정은 언제나 TS**(`c24ExpenseDrop`)가 한다.
      그래서 Cypher 정규식이 언젠가 헛돌아도 화면 결과는 틀리지 않는다 — 조금 느려질 뿐이다.
      ⛔ 한쪽만 고치지 말 것. 회귀 감시: `test-harness/c24_expense_filter_harness.mjs`

   ⚠️ 이 목록은 그래서 «카페24 원본 그대로» 가 아니다. 원본 대조는 카페24에서 해야 한다
      (「케이씨피M」 을 장부 목록에서 뺀 것과 같은 사정 — CLAUDE.md 1-3·2장 참고).
   ═══════════════════════════════════════════════════════════════════════════ */

/** 한글이 한 글자라도 있는가 — 음절(가–힣)과 자모(ㄱ–ㅎ·ㅏ–ㅣ) 둘 다 본다. */
const HANGUL_TEXT_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
/** 「글자」가 있는가 — 한글 또는 라틴 알파벳. 숫자·기호만 있는 제목은 판정 근거가 못 된다. */
const LETTER_TEXT_RE = /[A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ]/;

/* Cypher(Java 정규식)용 — `=~` 는 **문자열 전체**가 맞아야 하므로 `.*` 로 감싼다.
   ⚠️ `\p{IsHangul}` 같은 유니코드 속성 대신 **문자 범위**를 쓴다. Neo4j 판·JDK 판에 따라
      속성 이름 지원이 갈리는데, 범위는 어디서나 같게 동작한다. */
export const C24_HANGUL_CYPHER_RE = '(?s).*[가-힣ㄱ-ㅎㅏ-ㅣ].*';
export const C24_LETTER_CYPHER_RE = '(?s).*[A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ].*';

/** 우리 것이 아님을 알려 주는 결재자 이름 (2026-08-24 사장님) */
export const C24_FOREIGN_APPROVERS = ['Joy', '박상인'] as const;

/* 「박상인」 — 어느 칸에서나 찾는다(영어 결재에 우연히 나올 수 없는 한글 이름).
   「Joy」   — 결재라인이 들어 있을 메타 칸에서만, 낱말 단위로만 찾는다.
              (`\b` 를 요구하므로 「Joyce」·「Enjoy」 는 안 걸린다) */
const APPROVER_ANYWHERE_RE = /박상인/;
const APPROVER_META_ONLY_RE = /\bjoy\b/i;
export const C24_APPROVER_ANYWHERE_CYPHER_RE = '(?s).*박상인.*';
export const C24_APPROVER_META_CYPHER_RE = '(?is).*\\bjoy\\b.*';

/** 사람이 자유롭게 쓰는 칸 — 여기서는 「Joy」를 찾지 않는다(필리핀 흔한 이름). */
const FREE_TEXT_KEYS = new Set(['name', 'content', 'memo']);

export type C24ExpenseDropReason = 'approver' | 'korean' | null;

export interface C24ExpenseVerdict {
  /** 이 행을 목록에서 뺄 것인가 */
  drop: boolean;
  /** 왜 뺐는가 — 진단용(응답에는 담지 않는다) */
  reason: C24ExpenseDropReason;
  /** 걸린 칸 이름 — 결재라인이 실제로 어느 속성에 들어 있는지 확인할 때 쓴다 */
  key?: string;
}

/**
 * 지출결의 한 행이 «우리 것이 아닌가» 를 판정한다.
 *
 * @param row Neo4j 에서 온 행. `properties(d)` 를 통째로 넘기면 결재라인이 어느 속성에
 *            들어 있든 찾아낸다(카페24 쪽 속성 이름을 우리가 정한 것이 아니라서 그렇다).
 */
export function c24ExpenseDrop(row: Record<string, unknown> | null | undefined): C24ExpenseVerdict {
  const r = (row && typeof row === 'object') ? row : {};

  // ① 결재라인에 「Joy」·「박상인」
  for (const key of Object.keys(r)) {
    const raw = r[key];
    // 문자열·숫자만 본다. 리스트·맵이 오면 문자열로 펴서 본다(결재라인이 배열로 올 수 있다).
    const text = (raw == null) ? ''
      : (typeof raw === 'object') ? JSON.stringify(raw)
      : String(raw);
    if (!text) continue;
    if (APPROVER_ANYWHERE_RE.test(text)) return { drop: true, reason: 'approver', key };
    if (!FREE_TEXT_KEYS.has(key) && APPROVER_META_ONLY_RE.test(text)) {
      return { drop: true, reason: 'approver', key };
    }
  }

  // ② 제목이 한글이면 우리 것이 아니다. 제목에 글자가 없을 때만 내용으로 판정한다.
  const title = String(r.name ?? '').trim();
  const body = String(r.content ?? '').trim();
  const decisive = LETTER_TEXT_RE.test(title) ? title : body;
  if (HANGUL_TEXT_RE.test(decisive)) {
    return { drop: true, reason: 'korean', key: LETTER_TEXT_RE.test(title) ? 'name' : 'content' };
  }

  return { drop: false, reason: null };
}
