// ────────────────────────────────────────────────────────────────────────────
// 📋 결재 규칙표 — 분류 · 결재선 · 마감 · 열람등급을 **한 파일에** 모은다
//
// 왜 별도 파일인가 (2026-08-16):
//   기준값(금액·시한·누가 경영진인가)은 «운영하다 보면 반드시 바뀌는 것»이다.
//   그걸 api-approval.ts 안에 흩어 두면 바꿀 때마다 로직을 읽어야 한다.
//   이 파일 위쪽 상수만 고치면 되도록 분리했다. 로직은 아래, 값은 위.
//
// 설계 원칙 — 사람이 고르지 않는다:
//   결재선을 기안자가 지정하는 방식(구 그룹웨어)은 «잘못 골라서 다시 올리는» 마찰을 낳는다.
//   필리핀 매니저가 한국 조직도를 외울 이유도 없다. 그래서 **분류와 금액만으로 결재선이 결정**된다.
//   지출관리 도구(Ramp·Concur)의 정책 기반 자동 라우팅과 같은 접근.
//
// ⚠️ 이 파일은 «판정»만 한다. DB 도, 네트워크도, AI 도 부르지 않는다.
//    순수 함수만 두어서 테스트와 추론이 쉽게 유지되도록 한다.
// ────────────────────────────────────────────────────────────────────────────

/* ═══════════════════════════════════════════════════════════════════════════
 * ① 바꾸고 싶으면 여기만 — 운영 기준값
 * ═════════════════════════════════════════════════════════════════════════ */

/** 2단계 결재로 넘어가는 금액. 통화별로 따로 둔다 — 환율 조회는 실패할 수 있는 의존성이라 안 쓴다. */
export const TWO_STEP_THRESHOLD: Record<string, number> = { PHP: 5000, KRW: 120000 };

/** 월 예산 — 넘으면 «예산 초과» 점검 표시가 뜬다(막지는 않는다. 판단은 사람이). */
export const MONTHLY_BUDGET: Record<string, number> = { PHP: 150000, KRW: 3600000 };

/**
 * 경영진 계정.
 *   ⚠️ 여기에 없으면 «경영진 단계» 결재를 할 수 없다. 사람을 추가하려면 이 배열에 한 줄.
 *   이름에 대표·사장·경영이 들어간 계정도 자동으로 인정한다(계정을 새로 만들었을 때 결재가
 *   멈추지 않도록 하는 안전장치).
 *
 *   ⚠️ 여기에 넣으면 «결재» 만 열리는 것이 아니다. 함께 열리는 것:
 *     · 인사·급여 결재의 **열람**(canView 의 visibility==='exec')
 *     · **전결** — 중간 단계를 건너뛰고 바로 최종 결재(api-approval 의 straightThrough)
 *   그래서 «매니저» 를 함부로 넣지 않는다(필리핀 매니저가 자기 지출을 스스로 최종 승인하게 된다).
 *
 *   📜 2026-09-04 `mgr_jjw`(장지웅, 본사 매니저) 추가 — 사장님 지시.
 *      왜 — 경영진이 `admin` 하나뿐이라, 사장님이 인사·급여나 큰 금액 결재를 올리시면
 *      「본인이 올린 결재는 본인이 승인할 수 없습니다」와 맞물려 **아무도 결재할 수 없었다.**
 *      실제로 8/30 긴급 건이 그 상태로 5일을 서 있었다(그 뒤 화면이 이유를 말하도록 고쳤다 —
 *      approverCounts, work.html 진행 추적).
 *   ⚠️ 소문자로 적을 것 — isExec 가 username 을 toLowerCase() 해서 비교한다.
 */
export const EXEC_USERNAMES = ['admin', 'mgr_jjw'];

/**
 * 💳 돈이 나가는 결재(물품 구입·지출 정산)의 **결재권자**.
 *
 *   📜 2026-09-09 사장님 지시 — 「결재는 장지웅 부장이 하고, 확인만 정우영 대표가 한다」.
 *      그전에는 결재선이 «본사 사람 아무나»(staff)였다. 그래서 필리핀에서 올라온 건이
 *      대표님 화면에도 떴고, 실측상 물품 3건(₱2,500·₱4,600·₱2,800)을 **대표님이 혼자**
 *      찍고 계셨다.
 *
 *   ⚠️ 이 명단은 «주 결재자» 다. 경영진(EXEC_USERNAMES)은 여기 없어도 **대신 결재**할 수
 *      있다(canDecideStage) — 다만 **알림은 가지 않는다**(isPrimaryApprover). 부재중에
 *      결재가 멈추는 쪽이 훨씬 나쁘기 때문이다(8/30 긴급 건 5일 방치 전례).
 *
 *   ⚠️ 비우면 옛 동작(본사 누구나)으로 돌아간다 — «명단을 못 읽어 아무도 결재 못 하는»
 *      쪽으로 실패하지 않게 한 것이다.
 *
 *   ⚠️ 소문자로 적을 것 — 판정이 username 을 toLowerCase() 해서 비교한다.
 */
export const MONEY_APPROVERS = ['mgr_jjw'];

/** 소액·반복 항목 자동 승인 — 기본 꺼짐. 실제 데이터가 쌓인 뒤 항목별로 켜는 것이 안전하다. */
export const AUTO_APPROVE_ENABLED = false;

/* ═══════════════════════════════════════════════════════════════════════════
 * ② 업무 분류
 * ═════════════════════════════════════════════════════════════════════════ */

export type ReqType = 'purchase' | 'expense' | 'hr' | 'complaint' | 'urgent' | 'doc' | 'leave';

/**
 * 결재 단계의 «누가»
 *   staff = 본사 담당 아무나 · mgr = 지정 결재권자(MONEY_APPROVERS) · exec = 경영진 ·
 *   any   = 먼저 본 사람(긴급 전용)
 *
 * ⚠️ 여기 값은 **approval_steps.role 에 그대로 저장**된다. 이름을 바꾸면 옛 결재가
 *    «알 수 없는 단계»가 되어 결재자가 0명이 된다(2026-09-04 5일 방치 건과 같은 모양).
 *    추가만 하고 바꾸지 말 것.
 */
export type StageRole = 'staff' | 'mgr' | 'exec' | 'any';

/** 열람 등급 — 누가 이 결재를 «볼» 수 있는가 */
export type Visibility =
  | 'exec'        // 경영진 + 기안자만. 인사·급여.
  | 'chain'       // 기안자 + 결재선에 있는 사람 + 경영진. 대부분이 여기.
  | 'broadcast';  // 조직 계정 전원(강사 제외). 긴급 소통.

export interface TypeSpec {
  key: ReqType;
  ko: string;
  en: string;
  /** 금액이 반드시 있어야 하는가 */
  needsAmount: boolean;
  /** 강사도 올릴 수 있는가 — 긴급·고객불만은 현장에서 교사가 먼저 안다 */
  teacherMaySubmit: boolean;
  visibility: Visibility;
  /** 한 단계당 마감 시간(시간 단위) */
  slaHours: number;
  /** 첨부(영수증)가 없으면 점검 표시를 띄울 것인가 */
  /** 파일을 «붙일 수 있는가» — 화면에 첨부 버튼을 그릴지 정한다. */
  wantsFile: boolean;
  /**
   * 파일이 «반드시 있어야 하는가» — 없으면 「영수증 첨부 없음」 경고를 낸다.
   *   ⚠️ wantsFile 과 갈라 둔 이유(2026-09-04) — 예전엔 한 칸이 둘을 겸했다. 그래서
   *      「일반 문서」에 첨부 버튼을 켜려면 «영수증이 없다» 는 엉뚱한 경고가 따라왔다.
   *      붙일 수 있는 것과 반드시 있어야 하는 것은 다른 사실이다.
   */
  requiresFile?: boolean;
  /**
   * 기간(시작일·종료일)을 받는가 — 휴가 전용.
   * 승인되는 순간 기존 «강사 근무불가» 에 그대로 반영되어 **그 시간 예약이 실제로 막힌다.**
   * (신청 창구는 결재함 하나로 모으고, 캘린더는 결과만 보여 준다 — 두 곳에 따로 적지 않는다)
   */
  wantsDates?: boolean;
  /**
   * 필리핀 매니저는 올릴 수 없는 분류.
   * 인사·급여가 그렇다 — 한국 본사가 집계하고 대표가 확정하는 일이라,
   * 현지 매니저의 결재함에는 아예 뜨지 않는 것이 맞다(있으면 눌러 보게 된다).
   */
  koreaOnly?: boolean;
  /**
   * 「지출 항목」을 고르게 하는가 — 돈이 나가는 분류(물품·지출)에만 켠다.
   *   ⚠️ 고객 불만·휴가·인사에 켜면 «무엇을 고르라는 것인지» 알 수 없는 칸이 되고,
   *      그 값이 지출 리포트에 섞여 합계를 흐린다.
   */
  wantsCategory?: boolean;
}

/**
 * 분류 정의.
 *   ⚠️ 'expense' · 'doc' · 'leave' 는 **2026-08-05 부터 쌓인 기존 데이터의 값**이다.
 *      이름을 바꾸면 옛 결재가 «알 수 없는 분류»가 된다. 추가만 하고 바꾸지 말 것.
 */
export const TYPES: TypeSpec[] = [
  { key: 'purchase',  ko: '물품 구입', en: 'Purchase',    needsAmount: true,  teacherMaySubmit: false, visibility: 'chain',     slaHours: 24, wantsFile: true,  requiresFile: true, wantsCategory: true },
  { key: 'expense',   ko: '지출 정산', en: 'Expense',     needsAmount: true,  teacherMaySubmit: false, visibility: 'chain',     slaHours: 24, wantsFile: true,  requiresFile: true, wantsCategory: true },
  { key: 'hr',        ko: '인사 · 급여', en: 'HR & Pay',  needsAmount: false, teacherMaySubmit: false, visibility: 'exec',      slaHours: 48, wantsFile: false, koreaOnly: true },
  { key: 'complaint', ko: '고객 불만', en: 'Complaint',   needsAmount: false, teacherMaySubmit: true,  visibility: 'chain',     slaHours: 24, wantsFile: false },
  { key: 'urgent',    ko: '긴급 소통', en: 'Urgent',      needsAmount: false, teacherMaySubmit: true,  visibility: 'broadcast', slaHours: 2,  wantsFile: false },
  { key: 'doc',       ko: '일반 문서', en: 'Document',    needsAmount: false, teacherMaySubmit: false, visibility: 'chain',     slaHours: 48, wantsFile: true  },
  // 🏖️ 휴가는 강사도 올린다 — 쉬는 사람이 본인이므로 당연하다.
  //    승인되면 teacher_unavailability 에 그대로 들어가 그 기간 예약이 실제로 막힌다.
  { key: 'leave',     ko: '휴가 신청', en: 'Time off',    needsAmount: false, teacherMaySubmit: true,  visibility: 'chain',     slaHours: 24, wantsFile: false, wantsDates: true },
];

export const REQ_TYPES: string[] = TYPES.map(t => t.key);

const TYPE_BY_KEY: Record<string, TypeSpec> = (() => {
  const m: Record<string, TypeSpec> = {};
  for (const t of TYPES) m[t.key] = t;
  return m;
})();

/** 모르는 분류가 들어오면 «일반 문서»로 본다 — 옛 데이터·잘못된 입력에도 화면이 깨지지 않게. */
export function typeSpec(reqType: string | null | undefined): TypeSpec {
  return TYPE_BY_KEY[String(reqType || '')] || TYPE_BY_KEY['doc'];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🏷️ 「지출 항목」 — 결재를 올릴 때 고르는 분류
 *
 *   [왜 필요한가]
 *     결재는 쌓이는데 «무슨 돈이었나» 를 나중에 셀 수가 없었다. 제목은 사람마다
 *     다르게 적으므로(「인터넷요금」·「인터넷 요금」·「PLDT」) 제목으로는 못 센다.
 *
 *   [왜 «자유 입력» 이 아닌가]
 *     서버는 예전부터 category 를 60자 자유 문자열로 받고 있었다(화면이 안 보냈을 뿐).
 *     그대로 열면 같은 항목이 세 이름으로 쌓여 합계가 조용히 갈라진다.
 *     그래서 **고르는 목록**으로 두고, 목록에 없는 것은 'etc'(기타)로 받는다.
 *
 *   [왜 «반드시» 는 아닌가]
 *     못 고르면 결재를 못 올리는 쪽이 더 나쁘다 — 급한 지출이 막힌다.
 *     비어 있으면 그냥 비워 두고, 나중에 리포트가 「항목 없음」으로 보여 준다.
 *
 *   [저장되는 값]
 *     한국어 라벨이 아니라 **key(ascii)** 를 넣는다. 라벨을 다듬어도 이미 쌓인
 *     결재의 뜻이 안 바뀐다. ⛔ key 는 바꾸지 말 것 — 옛 결재가 «알 수 없는 항목»이 된다.
 *
 *   [account — 회계 계정과목]
 *     새 분류 체계를 만들지 않는다. `accounting-reports.ts` 의 EXPENSE_CATEGORIES
 *     (통장 출금이 실제로 쓰는 13개 계정)에 **있는 이름만** 쓴다.
 *     그래야 나중에 「결재로 올라온 지출」과 「통장에서 나간 돈」을 나란히 놓고 볼 수 있다.
 *     ⚠️ 그 파일을 import 하지 않는 이유 — 이 파일은 아무것도 import 하지 않는 순수
 *        모듈이라 하니스가 그대로 불러 돌린다. 대신 하니스가 두 목록을 **대조**한다
 *        (approval_category_harness ⓪절). 여기에 EXPENSE_CATEGORIES 에 없는 이름을
 *        적으면 그 검사가 FAIL 난다.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface CategorySpec {
  /** 저장되는 값. ⛔ 바꾸지 말 것 */
  key: string;
  ko: string;
  en: string;
  /** 회계 계정과목 — accounting-reports.ts 의 EXPENSE_CATEGORIES 안에 있어야 한다 */
  account: string;
}

export const CATEGORIES: CategorySpec[] = [
  { key: 'supplies',  ko: '사무 · 소모품',   en: 'Office supplies',        account: '소모품비' },
  // 🖥️ 장비·비품도 회계 계정은 소모품비다 — 통장 계정 목록에 «비품» 이 따로 없다.
  //    새 계정을 여기서 만들면 회계 화면과 이름이 갈라진다.
  { key: 'equipment', ko: '장비 · 비품',     en: 'Equipment',              account: '소모품비' },
  { key: 'utility',   ko: '공과금 · 인터넷', en: 'Utilities & internet',   account: '공과금·통신' },
  { key: 'rent',      ko: '임대 · 관리비',   en: 'Rent & building',        account: '임대·관리비' },
  { key: 'transport', ko: '교통 · 출장',     en: 'Transport & travel',     account: '여비교통비' },
  { key: 'meal',      ko: '식대 · 접대',     en: 'Meals & entertainment',  account: '접대비' },
  { key: 'books',     ko: '교재 · 인쇄',     en: 'Books & printing',       account: '도서인쇄비' },
  { key: 'service',   ko: '서비스 · 수수료', en: 'Services & fees',        account: '지급수수료' },
  { key: 'ads',       ko: '광고 · 홍보',     en: 'Marketing',              account: '광고선전비' },
  { key: 'tax',       ko: '세금 · 보험',     en: 'Tax & insurance',        account: '세금·보험' },
  // 🧺 마지막은 언제나 «기타» — 목록에 없는 지출도 올릴 수 있어야 한다.
  { key: 'etc',       ko: '기타',            en: 'Other',                  account: '기타출금' },
];

export const CATEGORY_KEYS: string[] = CATEGORIES.map(c => c.key);

const CAT_BY_KEY: Record<string, CategorySpec> = (() => {
  const m: Record<string, CategorySpec> = {};
  for (const c of CATEGORIES) m[c.key] = c;
  return m;
})();

/**
 * 들어온 값을 목록 안의 key 로 맞춘다. 모르는 값이면 null.
 *
 *   ⛔ 모르는 값에 400 을 주지 않는다 — 결재를 못 올리게 막는 쪽이 더 나쁘다.
 *   ⛔ 그렇다고 'etc' 로 «떨어뜨리지도» 않는다 — 안 고른 것과 «기타를 고른 것» 은
 *      다른 사실이고, 섞으면 기타 합계가 조용히 부풀어 「기타가 제일 크다」가 된다.
 *   ✅ 옛 데이터·다른 화면이 한국어 라벨을 보냈을 수 있으므로 라벨로도 찾아 준다.
 */
export function normCategory(v: string | null | undefined): string | null {
  const raw = String(v || '').trim();
  if (!raw) return null;
  const low = raw.toLowerCase();
  if (CAT_BY_KEY[low]) return low;
  const flat = (x: string) => x.replace(/[\s·]/g, '');
  for (const c of CATEGORIES) {
    if (flat(c.ko) === flat(raw) || flat(c.en).toLowerCase() === flat(low)) return c.key;
  }
  return null;
}

/** key → 사람이 읽는 이름. 모르면 null(빈칸) — 지어내지 않는다. */
export function categorySpec(key: string | null | undefined): CategorySpec | null {
  return CAT_BY_KEY[String(key || '').toLowerCase()] || null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ③ 결재선 자동 결정
 * ═════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * 🔖 결재 상태 — 정본은 여기 한 곳
 *
 *   pending   대기 중
 *   approved  승인
 *   rejected  반려      — 결재자가 «아니오» 라고 한 것
 *   withdrawn 회수됨    — 기안자가 «내가 내렸다». 아무도 결재하기 «전» 에만 가능
 *   cancelled 취소됨    — 승인됐던 건이 «취소 결재» 로 무효가 된 것
 *
 *   ⛔ withdrawn·cancelled 를 rejected 로 뭉치지 말 것.
 *      「반려당함」·「내가 내림」·「승인됐다가 무효」는 서로 다른 사실이고,
 *      그 값을 **중복 감지**(최근 30일 같은 금액)와 **지출 합계** 가 함께 봅니다.
 *      한 글자를 아끼면 합계가 조용히 갈라집니다.
 *   ⚠️ 상태를 늘리면 세는 곳이 짝입니다 — buildFindQuery · summarizeApprovals ·
 *      맨 위 요약 SQL · 중복 감지 · CSV 라벨 · 화면 배지.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface StatusSpec { key: string; ko: string; en: string }

export const STATUSES: StatusSpec[] = [
  { key: 'pending',   ko: '대기 중',  en: 'Pending' },
  { key: 'approved',  ko: '승인',     en: 'Approved' },
  { key: 'rejected',  ko: '반려',     en: 'Rejected' },
  { key: 'withdrawn', ko: '회수됨',   en: 'Withdrawn' },
  { key: 'cancelled', ko: '취소됨',   en: 'Cancelled' },
];

export const STATUS_KEYS: string[] = STATUSES.map(s => s.key);

export function statusSpec(key: string | null | undefined): StatusSpec | null {
  const k = String(key || '').trim().toLowerCase();
  return STATUSES.find(s => s.key === k) || null;
}

/** 이 상태의 건이 «지출 합계» 에 들어가는가 — 승인·대기만. 정본은 이 함수 하나. */
export function countsAsSpend(status: string | null | undefined): boolean {
  const k = String(status || '').trim().toLowerCase();
  return k === 'approved' || k === 'pending';
}

/**
 * 🔁 이 행이 «쓴 돈» 으로 세어져야 하는가.
 *   ⛔ 취소 결재(reverses_id 가 있는 행)는 **아니다** — 그것은 지출이 아니라
 *      「이 지출을 되돌리자」는 요청이다. 금액을 그대로 들고 있는 이유는
 *      **결재자가 얼마짜리를 없애는지 봐야** 하기 때문이지 합계에 넣으려는 것이 아니다.
 *   📊 안 걸렀을 때 실측(원본 500,000 승인 + 취소 결재):
 *        대기 중  → 승인 500,000 **+ 대기 500,000**, 항목 합계 **1,000,000(2건)**
 *        승인 뒤  → 승인 **500,000 그대로**(원본이 빠진 자리를 취소 결재가 채움)
 *      즉 ① 올린 순간 두 배로 세고 ② 승인돼도 총액이 안 줄어든다. 에러는 안 난다.
 */
export function isSpendRow(row: { status?: string | null; reverses_id?: number | null } | null | undefined): boolean {
  if (!row) return false;
  if (row.reverses_id != null && Number(row.reverses_id) > 0) return false;
  return countsAsSpend(row.status);
}

/** 아직 «살아 있는» 건인가 — 결재를 기다리는 중. */
export function isLive(status: string | null | undefined): boolean {
  return String(status || '').trim().toLowerCase() === 'pending';
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ↩️ ① 회수 — 「내가 올린 것을 내가 내린다」
 *
 *   왜 «아무도 결재하기 전» 으로 좁히나 — 결재는 «그때 그 내용에 도장을 찍는» 기록이다.
 *   1단계가 승인된 뒤에 기안자가 내려 버리면 그 사람의 결재가 뜻을 잃는다.
 *   그건 회수가 아니라 «남의 결재를 지우는 것» 이다.
 *
 *   ⛔ 승인·반려된 건은 회수가 아니다 — 승인 건은 ③ 취소 결재로 간다.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface WithdrawInput {
  me: string;
  requesterUsername: string;
  status: string;
  /** approval_steps 에 이미 결재된(승인·반려) 단계가 하나라도 있는가 */
  anyDecided?: boolean;
  /** 다단계에서 지금 몇 번째 단계인가 — 2 이상이면 앞 단계가 승인된 것 */
  stageSeq?: number | null;
}

export type GateReason =
  | 'ok'
  | 'not_mine'
  | 'not_pending'
  | 'already_decided'
  | 'not_approved'
  | 'not_allowed'
  | 'already_cancelled'
  | 'already_requested'
  | 'not_withdrawn'
  | 'has_child'
  /** 판정에 필요한 것을 «조회하지 못했다» — 되돌릴 수 없는 조작은 모르면 막는다 */
  | 'lookup_failed';

export function canWithdraw(inp: WithdrawInput): { ok: boolean; reason: GateReason } {
  const me = String(inp?.me || '');
  if (!me || me !== String(inp?.requesterUsername || '')) return { ok: false, reason: 'not_mine' };
  if (!isLive(inp?.status)) return { ok: false, reason: 'not_pending' };
  // 앞 단계가 이미 승인된 다단계 건은 회수하지 않는다(남의 결재를 지우게 된다).
  if (inp?.anyDecided) return { ok: false, reason: 'already_decided' };
  if (Number(inp?.stageSeq || 1) > 1) return { ok: false, reason: 'already_decided' };
  return { ok: true, reason: 'ok' };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🗑️ ①-2 삭제 — 「없었던 것으로」
 *
 *   회수된 건만 지울 수 있다. 회수는 **아무도 결재 도장을 안 찍은 상태**라
 *   결재선에 판단이 하나도 안 남았고, 그건 «올렸다가 거둬들인 초안» 이다 —
 *   회사 기록으로서 가치가 없으므로 지워도 잃을 것이 없다.
 *
 *   ⛔ 지우면 안 되는 셋:
 *     · 승인된 건 — 돈이 나갔거나 바깥으로 나갔다(휴가→예약 차단, 인사·급여→달 잠금).
 *                   그건 ③ 취소 결재가 할 일이다.
 *     · 반려된 건 — 결재자가 「아니오」라고 **판단한 기록**이다. 기안자가 지울 수 있으면
 *                   «반려당한 적 없는 것처럼» 만들 수 있다.
 *     · 대기 중인 건 — 지금 남이 보고 있다. **먼저 회수**해야 한다.
 *
 *   ⚠️ 「회수 → 삭제」 두 단계인 것이 맞다 — 회수는 되돌릴 수 있고 삭제는 못 되돌린다.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface DeleteInput {
  me: string;
  requesterUsername: string;
  status: string;
  /** 이 건을 «이어받아 다시 올린» 결재가 있는가(다른 행의 origin_id 가 이 건을 가리킴).
   *  ⛔ optional 이 아니다 — 안 넘기면 안전장치가 «꺼진» 것이 기본값이 된다.
   *  `null` = «조회에 실패해 모른다» → 지우지 않는다(되돌릴 수 없는 조작은 막는 쪽으로 실패). */
  hasResubmitChild: boolean | null;
}

export function canDelete(inp: DeleteInput): { ok: boolean; reason: GateReason } {
  const me = String(inp?.me || '');
  if (!me || me !== String(inp?.requesterUsername || '')) return { ok: false, reason: 'not_mine' };
  if (String(inp?.status || '').trim().toLowerCase() !== 'withdrawn') {
    return { ok: false, reason: 'not_withdrawn' };
  }
  /* 🔴 이 건을 이어받아 다시 올린 결재가 있으면 지우지 않는다.
     지우면 그 자식의 「N일째」가 **원본 날짜를 잃고 오늘로 초기화**된다 —
     즉 «회수 → 다시 올리기 → 원본 삭제» 가 **지연을 지우는 우회로**가 된다.
     ①②를 만들 때 막으려던 바로 그 구멍이 다시 열린다. */
  /* ⛔ 모르면 막는다 — 자식 조회가 실패했을 때 «없다» 로 떨어뜨리면 이 가드가 통째로
     fail-open 이 된다(함정 대조 2026-09-06 지적). undefined(안 넘김)도 같은 취급이다. */
  if (inp?.hasResubmitChild == null) return { ok: false, reason: 'lookup_failed' };
  if (inp.hasResubmitChild) return { ok: false, reason: 'has_child' };
  return { ok: true, reason: 'ok' };
}

/**
 * 🗑️ 이 첨부 열쇠를 «우리가» 지워도 되는가.
 *   ⛔ `file_key` 칸에 다른 것이 들어 있을 수 있으므로 접두사를 확인한다 —
 *      녹화 파기가 같은 이유로 `rec/` 를 확인한다(엉뚱한 것을 지우면 되돌릴 수 없다).
 */
export function isApprovalFileKey(key: string | null | undefined): boolean {
  const k = String(key || '');
  return k.startsWith('approval/') && k.length > 'approval/'.length;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🔁 ③ 취소 결재 — 「승인된 것을 무효로 하려면, 새 결재를 올려 승인받는다」
 *
 *   ⛔ 승인 건을 그 자리에서 지우지 않는다. 승인은 **바깥으로 나간다** —
 *      휴가는 강사 근무불가를 만들어 예약을 막고, 인사·급여는 그 달을 잠근다.
 *      되돌리려면 그사이 잡힌 수업·정산을 어떻게 할지 «사람이» 정해야 한다.
 *      회계에서 원장을 지우지 않고 반대 분개를 넣는 것과 같은 이치다.
 *
 *   누가 올릴 수 있나 — **원래 기안자 본인** 또는 **경영진**.
 *   ⛔ 본사 직원 전원에게 열지 말 것 — 남의 지출을 함부로 무효화하게 된다.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface ReverseInput {
  me: string;
  isExec: boolean;
  requesterUsername: string;
  status: string;
  /** 이미 이 건을 취소한 결재의 id (approval_requests.cancelled_by_id) */
  cancelledById?: number | null;
  /** 이미 올라와 있는 «대기 중인» 취소 결재의 id */
  openReverseId?: number | null;
}

export function canReverse(inp: ReverseInput): { ok: boolean; reason: GateReason } {
  const st = String(inp?.status || '').trim().toLowerCase();
  if (st === 'cancelled' || inp?.cancelledById) return { ok: false, reason: 'already_cancelled' };
  if (st !== 'approved') return { ok: false, reason: 'not_approved' };
  const me = String(inp?.me || '');
  const mine = !!me && me === String(inp?.requesterUsername || '');
  if (!mine && !inp?.isExec) return { ok: false, reason: 'not_allowed' };
  // 같은 건에 취소 결재를 두 벌 올리지 않는다 — 둘 다 승인되면 뜻이 겹친다.
  if (inp?.openReverseId) return { ok: false, reason: 'already_requested' };
  return { ok: true, reason: 'ok' };
}

/** 취소 결재의 제목 — 원본을 한눈에 알아보게. 길이는 저장 상한(200)에 맞춰 자른다. */
export function reverseTitle(originalTitle: string | null | undefined): string {
  const t = String(originalTitle || '').trim();
  return ('[취소] ' + t).slice(0, 200);
}

export interface Stage { seq: number; role: StageRole }

/**
 * 이 기안의 결재선은 몇 단계이고 누가 결재하는가.
 *
 *   · 인사·급여      → 경영진 1단계 (중간을 건너뛴다. 급여 내역이 담당자를 거칠 이유가 없다)
 *   · 긴급           → 0.5단계. 먼저 본 사람이 «확인»으로 닫는다
 *   · 물품·지출 고액 → 결재권자 → 경영진 2단계
 *   · 물품·지출 소액 → 결재권자 1단계 (경영진은 «확인»만 — needsExecAck)
 *   · 그 외          → 담당 1단계
 *
 * 금액 비교는 **통화별 기준값**으로 한다. 환율 변환을 넣지 않는 이유는 위 상수 주석 참고.
 */
export function stagesFor(reqType: string, amount?: number | null, currency?: string | null): Stage[] {
  const spec = typeSpec(reqType);
  if (spec.key === 'hr') return [{ seq: 1, role: 'exec' }];
  if (spec.key === 'urgent') return [{ seq: 1, role: 'any' }];

  if (spec.key === 'purchase' || spec.key === 'expense') {
    const cur = normCurrency(currency);
    const limit = TWO_STEP_THRESHOLD[cur];
    // 금액을 모르면 «큰 건일 수도 있다»고 본다 — 놓치는 쪽보다 한 번 더 보는 쪽이 안전하다.
    const big = (amount == null) ? true : (Number(amount) >= limit);
    // 💳 돈이 나가는 건의 첫 도장은 «지정 결재권자»(MONEY_APPROVERS)가 찍는다.
    //    소액이면 그 한 장으로 확정되고, 경영진은 나중에 «확인»만 한다(needsExecAck).
    if (big) return [{ seq: 1, role: 'mgr' }, { seq: 2, role: 'exec' }];
    return [{ seq: 1, role: 'mgr' }];
  }
  return [{ seq: 1, role: 'staff' }];
}

export function normCurrency(c?: string | null): string {
  return String(c || 'PHP').toUpperCase() === 'KRW' ? 'KRW' : 'PHP';
}

/** 전체 마감(접수 시각 기준, ms). 단계 수만큼 곱한다. */
export function deadlineMs(reqType: string, createdAt: number, stageCount: number): number {
  const spec = typeSpec(reqType);
  return createdAt + spec.slaHours * 3600_000 * Math.max(1, stageCount);
}

/** 한 단계의 마감(ms) — 단계별 재알림·승격 판정에 쓴다. */
export function stageDeadlineMs(reqType: string, stageStartedAt: number): number {
  return stageStartedAt + typeSpec(reqType).slaHours * 3600_000;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ④ 사람의 등급 판정
 * ═════════════════════════════════════════════════════════════════════════ */

export interface ActorLike {
  ok?: boolean;
  username?: string;
  name?: string | null;
  role?: string;
  isTeacher?: boolean;
}

/** 경영진인가 — 결재선의 'exec' 단계를 처리할 수 있는 사람. */
export function isExec(actor: ActorLike | null | undefined): boolean {
  if (!actor || !actor.ok) return false;
  if (actor.isTeacher) return false;
  const u = String(actor.username || '').toLowerCase();
  if (EXEC_USERNAMES.indexOf(u) >= 0) return true;
  // 계정을 새로 만들었을 때 결재가 멈추지 않도록 하는 안전장치.
  // ⚠️ «매니저»는 넣지 않는다 — 필리핀 매니저가 자기 지출을 스스로 최종 승인하게 된다.
  return /대표|사장|경영진|이사|ceo|director/i.test(String(actor.name || ''));
}

/**
 * 본사 계정인가 — 결재를 올릴 수 있는 최소 조건.
 *   ⚠️ 강사는 여기서 걸러진다. 다만 긴급·고객불만은 별도로 열어 준다(canSubmit 참고).
 */
export function isHqStaff(actor: ActorLike | null | undefined): boolean {
  return !!actor?.ok && !actor.isTeacher && (actor.role === 'hq' || actor.role === 'staff');
}

/**
 * 이 사람이 이 단계를 결재할 수 있는가.
 *   phManager = 필리핀 매니저 여부(호출자가 PH_MANAGERS 로 판정해 넘긴다).
 *   ⚠️ 순환 참조를 피하려고 auth-admin 을 import 하지 않는다 — 이 파일은 순수하게 유지한다.
 */
export function canDecideStage(actor: ActorLike, role: StageRole, phManager: boolean): boolean {
  if (!isHqStaff(actor)) return false;
  if (role === 'exec') return isExec(actor);
  // 🚨 'any' = 긴급 소통. **돈이 오가는 결재가 아니라 «확인했다»는 표시**다.
  //    그래서 필리핀 매니저도 닫을 수 있어야 한다 — 현지 사고를 현지에서 못 닫으면
  //    한국이 깨어날 때까지 아무도 처리하지 못한다(시차 때문에 최대 반나절).
  if (role === 'any') return true;
  // staff·mgr 단계는 본사 계정이면 되지만, 필리핀 매니저는 제외한다.
  //   («필리핀에서 올리고 한국에서 결재한다»는 실제 흐름. 더 좁히려면 이 한 줄만 고치면 된다.)
  if (phManager) return false;
  // 💳 'mgr' = 돈이 나가는 건의 지정 결재권자.
  //   ⚠️ 경영진도 **대신** 결재할 수 있게 둔다 — 결재권자가 휴가·출장이면 그대로 멈추기
  //      때문이다(8/30 긴급 건이 그렇게 5일 서 있었다). 다만 알림은 안 간다 →
  //      isPrimaryApprover 가 «누구에게 알릴지»를 따로 판정한다.
  //   ⚠️ 명단이 비어 있으면 막지 않는다 — 명단을 못 읽어 «아무도 결재 못 하는» 쪽으로
  //      실패하면, 이 기능이 막으려던 것보다 나쁜 상태가 된다.
  if (role === 'mgr') return isMoneyApprover(actor) || isExec(actor) || MONEY_APPROVERS.length === 0;
  return true;
}

/** 지정 결재권자 명단에 있는가(대소문자 무시 — 계정 표기가 갈리는 전례가 있다). */
export function isMoneyApprover(actor: ActorLike | null | undefined): boolean {
  if (!actor || !actor.ok || actor.isTeacher) return false;
  return MONEY_APPROVERS.indexOf(String(actor.username || '').toLowerCase()) >= 0;
}

/**
 * 이 사람이 이 단계의 «주» 결재자인가 — **알림을 받을 사람**.
 *
 *   canDecideStage 와 갈라 둔 이유: 'mgr' 단계는 경영진도 «대신» 누를 수 있는데,
 *   그 사람들에게까지 알림이 가면 「결재는 장 부장이 한다」가 화면에서만 참이 된다.
 *   누를 수 있는 사람(canDecideStage)과 알려야 할 사람(여기)은 다른 질문이다.
 */
export function isPrimaryApprover(actor: ActorLike, role: StageRole, phManager: boolean): boolean {
  if (!canDecideStage(actor, role, phManager)) return false;
  if (role !== 'mgr') return true;
  if (MONEY_APPROVERS.length === 0) return true;   // 명단이 비면 옛 동작
  return isMoneyApprover(actor);
}

/**
 * 전결(중간 단계를 건너뛰고 바로 최종 결재)을 허용하는 분류인가.
 *
 *   🔴 돈이 나가는 분류(물품·지출)에서는 **끈다**. 지정 결재권자(장지웅 부장)가
 *      경영진 명단에도 있어서, 전결이 켜져 있으면 그가 1단계를 누르는 순간 2단계가
 *      «건너뜀»으로 닫힌다 ⟹ **대표님 차례가 아예 열리지 않는다.**
 *      2026-09-09 지시(「결재는 부장, 확인은 대표」)가 성립하려면 이 줄이 있어야 한다.
 *
 *   ⛔ 인사·급여에서는 끄지 말 것 — 그쪽은 애초에 1단계(exec)라 전결이 걸리지도 않지만,
 *      넓혀서 끄면 「대표님이 올린 건을 아무도 결재 못 하는」 8/30 사고 쪽으로 돌아간다.
 *
 *   ⛔ 「장지웅을 EXEC_USERNAMES 에서 빼기」로 이 문제를 풀지 말 것. 전결은 저절로
 *      꺼지지만 인사·급여 **열람**(visibility 'exec')까지 함께 닫혀 그 사고가 되살아난다.
 */
export function allowsStraightThrough(reqType: string | null | undefined): boolean {
  const k = typeSpec(reqType).key;
  return !(k === 'purchase' || k === 'expense');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🖐 같은 사람이 «두 단계 연달아» 못 누르게
 *
 *   [왜 — 2026-09-09 사장님 지시 「1번 막아주고」]
 *     지정 결재권자(장지웅 부장)가 경영진 명단(EXEC_USERNAMES)에도 있어서, 큰돈 건에서
 *     1단계(mgr)를 누른 그 사람이 2단계(exec)까지 이어서 누를 수 있었다. 그러면 대표님께는
 *     «결재» 가 아니라 «확인» 으로 내려와, 「₱5,000 이상은 대표가 결재한다」가 화면에서만
 *     참인 상태가 된다(2026-09-09 함정 대조가 정본을 돌려 확인한 실제 동작).
 *
 *   [대가 — 아는 채로 고른 것]
 *     둘 중 하나가 휴가·출장이면 큰돈 결재가 그 자리에서 멈춘다. 그래도 이쪽을 고른 이유는,
 *     막지 않으면 «두 사람 결재» 라는 규칙 자체가 없는 것과 같아지기 때문이다.
 *     🔴 정정(2026-09-09 함정 대조) — 「지금 명단으로는 교착이 없다」고 여기 적었던 것은
 *        **사실이 아니었다.** 정본을 실제로 돌려 재니, 경영진 둘 중 하나가 «올린» 큰돈 건은
 *        「본인이 올린 건은 본인이 승인 못 함」과 이 규칙이 맞물려 **2단계 결재자가 0명**이
 *        된다(예: 대표가 올림 → 1단계를 결재권자가 누름 → 2단계 후보 = 경영진 − 기안자 −
 *        앞 단계 결재자 = 없음). 남이 올린 건은 정상이다.
 *        ⚠️ 이 변경 «전» 에는 되던 흐름이다 — 즉 이 규칙이 만든 교착이다.
 *        📌 실측(2026-09-09 D1): 물품·지출 4건은 전부 필리핀 매니저가 올린 소액이라,
 *           오늘까지 이 교착에 걸린 건은 0건이다.
 *        ✅ 화면은 그 사실을 말한다 — approverCounts 가 이 판정을 함께 세어
 *           「이대로는 처리되지 않습니다」 배너를 띄운다(api-approval.ts).
 *        ⚠️ 「경영진이 올린 건은 예외로 통과」로 풀지 말 것 — 그건 돈이 나가는 규칙을
 *           느슨하게 하는 일이라 **사람이 정할 일**이다(작업기록 §6 미결).
 *        ✅ 이 사실은 하니스가 «기안자별로 1·2단계 후보를 실제로 세어» 못 박는다
 *           (approval_money_approver_harness Ⓔ-2). 규칙을 바꾸면 거기부터 빨간불이 된다.
 *
 *   ⛔ 반려(rejected)에는 걸지 않는다 — 반려는 돈이 나가지 않는 방향이고, 자기가 앞서 찍은
 *      도장을 스스로 물리는 것을 막을 이유가 없다. 막는 것은 «승인» 뿐이다.
 *
 *   ⛔ 이 규칙을 분류 전체로 넓히지 말 것 — 긴급·휴가·문서까지 걸면 1단계짜리 건에는
 *      아무 효과도 없으면서, 나중에 단계가 늘 때 엉뚱한 곳에서 멈춘다.
 * ═════════════════════════════════════════════════════════════════════════ */

/** 이 분류에 «같은 사람 연속 결재 금지» 를 거는가 — 돈이 나가는 둘만. */
export function blocksSameDecider(reqType: string | null | undefined): boolean {
  const k = typeSpec(reqType).key;
  return k === 'purchase' || k === 'expense';
}

export interface SameDeciderInput {
  reqType: string | null | undefined;
  /**
   * 앞 단계(seq 가 작은 단계)에서 **이미 승인 도장을 찍은** 사람들.
   *   🔴 조회에 실패했으면 반드시 `null` 을 넘길 것 — 빈 배열로 넘기면 «앞 단계에 아무도
   *      없다» 는 뜻이 되어 이 게이트가 조용히 통째로 풀린다. 돈이 걸린 자리라
   *      **모르면 막는 쪽**으로 실패한다.
   */
  priorDeciders: (string | null | undefined)[] | null | undefined;
  /** 지금 누르려는 사람 */
  me: string;
  /** 'approved' | 'rejected' — 반려는 막지 않는다. */
  decision: string | null | undefined;
}

/** 막아야 하는가. `reason` 은 화면이 «왜» 를 말할 수 있게 갈라 둔다. */
export function sameDeciderBlocked(inp: SameDeciderInput): { blocked: boolean; reason: string } {
  const pass = { blocked: false, reason: '' };
  if (!inp) return { blocked: true, reason: 'lookup_failed' };
  if (String(inp.decision || '').trim().toLowerCase() !== 'approved') return pass;
  if (!blocksSameDecider(inp.reqType)) return pass;
  const me = String(inp.me || '').trim().toLowerCase();
  if (!me) return { blocked: true, reason: 'unknown_actor' };
  if (inp.priorDeciders == null) return { blocked: true, reason: 'lookup_failed' };
  for (const d of inp.priorDeciders) {
    if (String(d || '').trim().toLowerCase() === me) return { blocked: true, reason: 'same_decider' };
  }
  return pass;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ✅ 「확인」 — 결재가 아니라 «봤다»는 표시
 *
 *   [왜 있나 — 2026-09-09 사장님 지시]
 *     「₱5,000 미만이면 나는 그냥 확인만 하게 해줘. 결재권자는 장 부장님으로.」
 *     그런데 이 시스템이 아는 것은 «찬성»과 «반대» 둘뿐이었다. «봤습니다»가 없었다.
 *
 *   [결재와 무엇이 다른가]
 *     · 결재는 **막는다** — 누르지 않으면 그 건은 진행되지 않는다.
 *     · 확인은 **막지 않는다** — 이미 확정되어 필리핀에 통보까지 끝난 건에 도장만 찍는다.
 *       그래서 안 눌러도 업무는 흘러간다. 놓쳐도 사고가 나지 않는 것이 설계 의도다.
 *
 *   ⚠️ 이 판정은 **금액을 보지 않는다** — «내가 마지막 도장을 찍었는가» 만 본다.
 *      큰돈(₱5,000 이상)을 대표님이 직접 최종 결재하면 그래서 저절로 빠진다.
 *
 *   ⚠️ «큰돈은 대표가 결재한다» 를 지키는 것은 이 함수가 아니라 **sameDeciderBlocked**
 *      (같은 사람이 두 단계 연달아 못 누름)다. 2026-09-09 그 규칙을 넣기 전에는
 *      결재권자가 1단계에 이어 2단계까지 눌러, 대표님께 «결재» 대신 «확인» 이 왔다.
 *      ⛔ 그 규칙을 끄면 이 문단이 다시 거짓이 된다 — 함께 보고 고칠 것.
 *
 *   ✅ 확인은 «결재권자가 아닌 경영진» 에게만 뜬다(isApprover) — 2026-09-09 사장님
 *      「2번은 대표만 보이게」. 결재권자는 결재를 하는 사람이지 확인하는 사람이 아니다.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface AckInput {
  reqType: string | null | undefined;
  status: string | null | undefined;
  /** 마지막으로 도장을 찍은 사람 (approval_requests.decided_by) */
  decidedBy: string | null | undefined;
  /** 이미 확인했으면 그 시각 (approval_requests.exec_ack_at) */
  ackAt: number | null | undefined;
  /**
   * 이 건을 취소시킨 «취소 결재» 의 id (approval_requests.cancelled_by_id).
   *   ⚠️ 없애기로 한 지출에 「봤다」 도장을 찍게 하지 않는다.
   *   ⚠️ 이 칸이 없으면 목록 SQL 과 판정이 어긋난다 — 목록에는 안 뜨는데 주소로 부르면
   *      통과하는 상태가 된다(2026-09-09 함정 대조 지적).
   */
  cancelledById?: number | null;
  /** 지금 보고 있는 사람 */
  me: string;
  isExec: boolean;
  /**
   * 이 사람이 돈 나가는 건의 **결재권자**인가(isMoneyApprover).
   *   결재권자에게는 「확인할 것」을 띄우지 않는다 — 결재를 하는 사람이지 확인하는
   *   사람이 아니다(2026-09-09 사장님 「확인은 대표만 보이게」).
   *   ⚠️ 이름을 못 박지 않고 «결재권자인가» 로 묻는다 — 결재권자가 바뀌어도 규칙이
   *      저절로 따라온다.
   *   ⚠️ 안 넘기면 기본 false = «확인 대상» 이다. 옛 동작 그대로라 조용히 빠지지는
   *      않지만, 새 호출부를 만들면 반드시 넘길 것(하니스가 호출부를 대조한다).
   */
  isApprover?: boolean;
}

/**
 * 이 건을 지금 이 사람이 «확인»해야 하는가.
 *
 *   ⛔ 분류를 넓히지 말 것 — 일반 문서·휴가까지 넣으면 「확인할 것 30건」이 되고,
 *      정작 돈이 나간 건이 그 안에 파묻힌다(이 저장소가 녹화 목록에서 이미 밟은 함정).
 */
export function needsExecAck(inp: AckInput): boolean {
  if (!inp || !inp.isExec) return false;
  // 💳 결재권자는 «확인» 대상이 아니다 — 그 사람은 결재로 이미 그 건을 봤다.
  if (inp.isApprover) return false;
  const k = typeSpec(inp.reqType).key;
  if (k !== 'purchase' && k !== 'expense') return false;
  if (String(inp.status || '').trim().toLowerCase() !== 'approved') return false;
  if (inp.cancelledById) return false;
  if (inp.ackAt != null && Number(inp.ackAt) > 0) return false;
  const me = String(inp.me || '').trim().toLowerCase();
  if (!me) return false;
  // 내가 찍은 도장이면 이미 본 것이다 — 다시 확인할 이유가 없다.
  if (String(inp.decidedBy || '').trim().toLowerCase() === me) return false;
  return true;
}

/**
 * 이 분류를 올릴 수 있는가. 긴급·고객불만·휴가는 강사에게도 열려 있다.
 *   phManager — 필리핀 매니저 여부. koreaOnly 분류(인사·급여)를 가리는 데 쓴다.
 *   ⚠️ 기본값 false 라 예전 호출부는 그대로 동작한다.
 */
export function canSubmit(actor: ActorLike, reqType: string, phManager = false): boolean {
  if (!actor?.ok) return false;
  const spec = typeSpec(reqType);
  if (actor.isTeacher) return spec.teacherMaySubmit;
  if (!isHqStaff(actor)) return false;
  if (spec.koreaOnly && phManager) return false;
  return true;
}

/**
 * 이 결재를 «볼» 수 있는가.
 *   chainUsernames = 이 건의 결재선에 실제로 이름이 오른 사람들(승인·반려한 사람 포함).
 *
 *   ⚠️ 목록 쿼리에서 한 번 거르고, 건별로 여기서 또 거른다. 화면에서만 숨기면 주소를 직접 쳐서 뚫린다.
 */
export function canView(
  actor: ActorLike,
  reqType: string,
  requesterUsername: string,
  chainUsernames: string[],
  phManager: boolean
): boolean {
  if (!actor?.ok) return false;
  const me = String(actor.username || '');
  if (me && me === String(requesterUsername)) return true;      // 내가 올린 건은 언제나 본다

  const spec = typeSpec(reqType);
  if (spec.visibility === 'exec') return isExec(actor);

  if (spec.visibility === 'broadcast') {
    // 긴급은 조직 전원이 본다 — 강사도 포함(현장에서 먼저 아는 사람이 강사인 경우가 많다).
    return !!actor.ok && (isHqStaff(actor) || !!actor.isTeacher);
  }

  // 'chain' — 결재선에 있거나, 그 단계를 결재할 수 있는 사람이거나, 경영진.
  if (actor.isTeacher) return false;                            // 회사 지출 내역이 담긴다
  if (isExec(actor)) return true;
  if (me && chainUsernames.indexOf(me) >= 0) return true;
  if (phManager) return false;                                  // 남의 결재를 훑어보지 못하게
  return isHqStaff(actor);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑤ 자동 점검 — 계산만으로 실수를 잡는다 (AI 를 쓰지 않는다)
 *
 *   이 저장소의 급여 기능이 쓰는 원칙과 같다: 숫자는 코드가 만들고, AI 는 문장만 쓴다.
 *   여기서 나오는 표시가 결재자의 «판단 재료»이며, 승인 여부를 대신 정하지는 않는다.
 * ═════════════════════════════════════════════════════════════════════════ */

export type FlagLevel = 'warn' | 'info';
export interface Flag { code: string; level: FlagLevel; ko: string; en: string }

export interface CheckInput {
  reqType: string;
  amount?: number | null;
  currency?: string | null;
  hasFile: boolean;
  /** 영수증에서 읽어낸 금액 (없으면 null) */
  ocrAmount?: number | null;
  /** 같은 사람이 최근 30일 안에 올린 같은 분류·같은 금액 건수 (자기 자신 제외) */
  duplicateCount?: number;
  /** 이번 달 같은 분류 승인 합계 (이 건 제외) */
  monthTotal?: number | null;
  /** 최근 같은 분류 금액들의 중앙값 (없으면 null) */
  medianAmount?: number | null;
}

export function runChecks(inp: CheckInput): Flag[] {
  const out: Flag[] = [];
  const spec = typeSpec(inp.reqType);
  const cur = normCurrency(inp.currency);
  const amt = (inp.amount == null) ? null : Number(inp.amount);

  // ① 첨부 누락 — 영수증이 «반드시» 필요한 분류인데 없다.
  //    ⚠️ wantsFile(붙일 수 있는가)이 아니라 requiresFile 을 본다. 일반 문서는 붙일 수는
  //       있지만 없어도 정상이라, 여기서 wantsFile 을 보면 「영수증 없음」이 늘 뜬다.
  if (spec.requiresFile && !inp.hasFile) {
    out.push({ code: 'no_file', level: 'warn', ko: '영수증 첨부 없음', en: 'No receipt attached' });
  }

  // ② 영수증 금액과 입력 금액 불일치 — 오타를 여기서 잡는다
  if (amt != null && inp.ocrAmount != null && inp.ocrAmount > 0) {
    const diff = Math.abs(inp.ocrAmount - amt);
    const rel = diff / Math.max(inp.ocrAmount, amt);
    if (rel > 0.01 && diff >= 1) {
      out.push({
        code: 'amount_mismatch', level: 'warn',
        ko: '영수증 금액(' + fmt(inp.ocrAmount, cur) + ')과 입력 금액이 다름',
        en: 'Receipt shows ' + fmt(inp.ocrAmount, cur) + ' — differs from the amount entered',
      });
    }
  }

  // ③ 중복 청구 의심 — 같은 사람이 같은 금액을 최근에 또 올렸다
  if ((inp.duplicateCount || 0) > 0) {
    out.push({
      code: 'duplicate', level: 'warn',
      ko: '최근 30일 안에 같은 금액의 같은 분류 기안이 ' + inp.duplicateCount + '건 있음',
      en: (inp.duplicateCount || 0) + ' similar request(s) with the same amount in the last 30 days',
    });
  }

  // ④ 예산 초과 — 막지 않는다. 판단은 사람이 한다
  if (amt != null && inp.monthTotal != null) {
    const budget = MONTHLY_BUDGET[cur];
    if (budget && (inp.monthTotal + amt) > budget) {
      out.push({
        code: 'over_budget', level: 'warn',
        ko: '이번 달 합계가 예산(' + fmt(budget, cur) + ')을 넘어섬',
        en: 'This pushes the month past the ' + fmt(budget, cur) + ' budget',
      });
    }
  }

  // ⑤ 평소보다 큰 금액 — 정상일 수도 있으니 «참고»로만
  if (amt != null && inp.medianAmount != null && inp.medianAmount > 0 && amt >= inp.medianAmount * 3) {
    out.push({
      code: 'unusual_amount', level: 'info',
      ko: '평소(' + fmt(inp.medianAmount, cur) + ')보다 큰 금액',
      en: 'Larger than usual (typically ' + fmt(inp.medianAmount, cur) + ')',
    });
  }

  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑥ 첨부 형식 — 이름표가 아니라 «내용» 으로 본다
 *
 *   왜 — 예전에는 파일 이름의 확장자만 봤다. 이름은 누구나 바꿀 수 있으므로 실행 파일을
 *   receipt.jpg 로 바꿔 올리면 그대로 통과했고, 그게 R2 에 저장돼 결재자가 내려받았다.
 *   (내려받기는 attachment + nosniff 라 브라우저가 실행하진 않지만, 애초에 안 받는 게 낫다.)
 * ═════════════════════════════════════════════════════════════════════════ */

/** 첨부 앞부분 바이트로 실제 형식을 판정한다. 'jpg'|'png'|'webp'|'pdf' 또는 null(알 수 없음). */
export function sniffKind(b: Uint8Array | number[]): string | null {
  if (!b || b.length < 12) return null;
  const at = (i: number) => Number((b as any)[i]);
  // JPEG: FF D8 FF
  if (at(0) === 0xFF && at(1) === 0xD8 && at(2) === 0xFF) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4E && at(3) === 0x47 &&
      at(4) === 0x0D && at(5) === 0x0A && at(6) === 0x1A && at(7) === 0x0A) return 'png';
  // PDF: %PDF
  if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return 'pdf';
  // WEBP: 'RIFF' .... 'WEBP'
  if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
      at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return 'webp';
  return null;
}

/** jpeg/jpg 처럼 같은 형식의 다른 이름을 한 이름으로 모은다. */
export function normExt(ext: string): string {
  return String(ext || '').toLowerCase() === 'jpeg' ? 'jpg' : String(ext || '').toLowerCase();
}

/** 판정된 형식에 맞는 Content-Type. 저장할 때 이 값을 쓴다(이름표가 아니라 내용 기준). */
export function contentTypeFor(kind: string): string {
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'png') return 'image/png';
  if (kind === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/** 금액 표기. 화면과 점검 문구가 같은 형식을 쓰도록 여기 하나만 둔다. */
export function fmt(v: number, currency: string): string {
  const cur = normCurrency(currency);
  const n = Math.round(Number(v) || 0).toLocaleString('en-US');
  return cur === 'KRW' ? ('₩' + n) : ('₱' + n);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🔎 문서함 조건 조립 — «무엇을 찾는가» 를 SQL 조각으로
 *
 *   왜 함수로 빼나 — 라우트 안에 두면 하니스가 «그 글자가 있는가» 로밖에 못 본다.
 *   조건을 뒤집어도(예: >= 를 <=) 글자는 그대로라 통과한다. 순수 함수라야
 *   **진짜 SQLite 에 돌려** «정말 걸러지는가» 를 잴 수 있다.
 *
 *   ⚠️ LIKE 를 쓰지 않는다 — D1 의 LIKE 패턴 한도는 50자다(CLAUDE.md 2장 실측).
 *      제목·내용은 그보다 길어질 수 있고, 이름 속 % 와 _ 를 와일드카드로 오해한다.
 *      instr() 은 패턴 한도가 없고 있는 그대로 찾는다.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface FindInput {
  scope?: string; me: string;
  q?: string; type?: string; status?: string; from?: string; to?: string;
  /** 지출 항목(CATEGORY_KEYS) */
  category?: string;
  /** 🗂 결재자로 거른다(계정명) — «그 사람이 도장을 찍은 건». 결재 권한자에게만(호출부가 막는다) */
  decidedBy?: string;
}

/* 🗂 「그 사람이 결재한 건」 — approval_requests.decided_by 를 쓰지 않는다.
   그 칸은 «최종 처리자» 라 회수하면 기안자 이름이 들어가고, 다단계면 1단계 결재자가 안 남는다.
   결재 도장은 approval_steps 에만 정직하게 남는다(승인·반려만 — 대기·건너뜀은 도장이 아니다).
   ⚠️ 바인드 1개(계정명). 호출하는 쪽이 binds 순서를 맞춘다. */
export const DECIDED_BY_SQL =
  "EXISTS (SELECT 1 FROM approval_steps s WHERE s.request_id = approval_requests.id" +
  " AND s.decided_by = ? AND s.status IN ('approved','rejected'))";

export function buildFindQuery(inp: FindInput): { cond: string; binds: any[]; order: string } {
  const where: string[] = [];
  const binds: any[] = [];
  const me = String(inp.me || '');
  const scope = String(inp.scope || 'mine');

  if (scope === 'mine')          { where.push('requester_username = ?'); binds.push(me); }
  else if (scope === 'open')     { where.push('requester_username = ?'); binds.push(me); where.push("status = 'pending'"); }
  else if (scope === 'done')     { where.push('requester_username = ?'); binds.push(me); where.push("status = 'approved'"); }
  /* 「반려·회수·취소」 한 묶음 — 셋 다 «결국 안 된 것» 이라 사람은 한자리에서 찾는다.
     ⚠️ 그래도 «상태» 는 따로 저장한다(화면 배지가 셋을 구분해 보여 준다). */
  else if (scope === 'rejected') {
    where.push('requester_username = ?'); binds.push(me);
    where.push("status IN ('rejected','withdrawn','cancelled')");
  }
  else if (scope === 'pending')  { where.push("status = 'pending'"); where.push('requester_username != ?'); binds.push(me); }
  /* 🗂 「내가 결재한 것」 — 내가 도장을 찍은 건(승인이든 반려든). 사장님이 2026-09-08 에
     「내가 결재한 것·남이 결재한 것을 볼 곳이 어디냐」고 물으실 때까지 이 함이 없었다. */
  else if (scope === 'decided')  { where.push(DECIDED_BY_SQL); binds.push(me); }
  // 'all' 은 조건 없음 — 결재자에게만 열린다(호출부가 막는다)

  /* 🗂 결재자별 함 — «그 사람이 결재한 건». all 과 같이 결재 권한자에게만(호출부가 막는다).
     계정명은 hqAccounts 목록에서 온 값이라 여기서 다시 검사하지 않고 길이만 자른다. */
  const by = String(inp.decidedBy || '').trim().slice(0, 60);
  if (by) { where.push(DECIDED_BY_SQL); binds.push(by); }

  const q = String(inp.q || '').trim().slice(0, 60);
  if (q) {
    where.push("(instr(lower(IFNULL(title,'')), lower(?)) > 0" +
               " OR instr(lower(IFNULL(body,'')), lower(?)) > 0" +
               " OR instr(lower(IFNULL(requester_name,'')), lower(?)) > 0" +
               " OR instr(lower(requester_username), lower(?)) > 0)");
    binds.push(q, q, q, q);
  }

  const t = String(inp.type || '').trim();
  if (t && REQ_TYPES.indexOf(t as any) >= 0) { where.push('req_type = ?'); binds.push(t); }

  /* 상태 필터 — 목록을 손으로 적지 않는다(STATUS_KEYS 가 정본).
     ⚠️ 손으로 적으면 상태가 늘 때 그 상태로 «찾을 수 없는» 상태가 조용히 생긴다. */
  const st = String(inp.status || '').trim().toLowerCase();
  if (STATUS_KEYS.indexOf(st) >= 0) { where.push('status = ?'); binds.push(st); }

  /* 🏷️ 지출 항목 — 모르는 값이면 조건을 «몰래 넣지 않는다».
     넣어 버리면 0건이 나오는데 화면은 「그런 지출이 없다」로 읽어 거짓말이 된다. */
  const cat = normCategory(inp.category);
  if (cat) { where.push('lower(IFNULL(category,\'\')) = ?'); binds.push(cat); }

  // 기간 — created_at 은 ms 라 KST 날짜로 바꿔 비교한다(사람이 고른 날짜와 같은 눈금).
  const from = String(inp.from || '').trim();
  const to   = String(inp.to || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push("date(created_at/1000,'unixepoch','+9 hours') >= ?"); binds.push(from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to))   { where.push("date(created_at/1000,'unixepoch','+9 hours') <= ?"); binds.push(to); }

  return {
    cond: where.length ? (' WHERE ' + where.join(' AND ')) : '',
    binds,
    order: (scope === 'pending')
      ? ' ORDER BY (stage_due_at IS NULL) ASC, stage_due_at ASC, created_at ASC'
      : " ORDER BY (status='pending') DESC, created_at DESC",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🗂 결재 보관함 — 왼쪽 «함» 옆에 붙는 건수(2026-09-08, 시안 A)
 *
 *   [왜 SQL 집계를 그대로 써도 되는가]
 *     범위 조건(archiveVisibleCond)이 canView 의 세 분기를 SQL 로 옮긴 것이라, SQL 이 준 행이
 *     곧 «오른쪽 표에 나올 수 있는 행» 이다 — 하니스가 세 등급 모두 canView 를 행마다
 *     실제로 불러 «같은 집합인가» 를 대조한다(approval_archive_harness ②절).
 *     한 줄만 어긋나면 함 옆 숫자가 표와 다른 말을 한다.
 *   ⛔ 이 조건을 «본사 직원은 전체» 로 넓히지 말 것 — 그 순간 인사·급여 건수가 함 옆에 뜬다.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface ArchiveActor { exec: boolean; ph: boolean }

/**
 * canView 를 SQL 로 옮긴 것 — 세 등급이 canView 의 분기와 하나씩 짝이다.
 *   ① 경영진        → 조건 없음(세 열람등급 전부 통과)
 *   ② 본사 직원      → 내가 올린 것 ∪ exec 등급(인사·급여)이 아닌 전부(canView 마지막 줄 isHqStaff)
 *   ③ 필리핀 매니저  → 내가 올린 것 ∪ 내가 도장 찍은 것 ∪ broadcast(긴급) — chain 은 결재선에 있을 때만
 *   ⚠️ 등급을 «키 목록» 으로 SQL 에 넣는다 — instr(콤마문자열) 한 바인드(자리표시자 생성 금지 규칙).
 *   하니스가 세 등급 모두 «SQL 이 준 행 == canView 가 참인 행» 을 실제로 대조한다.
 */
export function archiveVisibleCond(me: string, actor: ArchiveActor): { cond: string; binds: any[] } {
  const u = String(me || '');
  if (actor.exec) return { cond: '', binds: [] };
  const csv = (vis: string) => ',' + TYPES.filter(t => t.visibility === vis).map(t => t.key).join(',') + ',';
  if (!actor.ph) {
    return { cond: "(requester_username = ? OR instr(?, ',' || req_type || ',') = 0)", binds: [u, csv('exec')] };
  }
  return {
    cond: '(requester_username = ? OR ' + DECIDED_BY_SQL + " OR instr(?, ',' || req_type || ',') > 0)",
    binds: [u, u, csv('broadcast')],
  };
}

/** 기간 함 네 개 — KST 날짜(YYYY-MM-DD)로 돌려준다. today 도 KST 날짜여야 한다. */
export function archivePeriods(today: string): Record<string, { from: string; to: string }> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today || ''));
  const y = m ? Number(m[1]) : 1970, mo = m ? Number(m[2]) : 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const ym = (yy: number, mm: number) => `${yy}-${pad(mm)}`;
  const pm = mo === 1 ? { y: y - 1, m: 12 } : { y, m: mo - 1 };
  const qStart = Math.floor((mo - 1) / 3) * 3 + 1;
  return {
    month:      { from: ym(y, mo) + '-01',        to: ym(y, mo) + '-' + pad(lastDay(y, mo)) },
    last_month: { from: ym(pm.y, pm.m) + '-01',   to: ym(pm.y, pm.m) + '-' + pad(lastDay(pm.y, pm.m)) },
    quarter:    { from: ym(y, qStart) + '-01',    to: ym(y, qStart + 2) + '-' + pad(lastDay(y, qStart + 2)) },
    year:       { from: `${y}-01-01`,             to: `${y}-12-31` },
  };
}

export interface ArchiveFacetInput { me: string; exec: boolean; ph: boolean; today: string }
export interface SqlPiece { sql: string; binds: any[] }

/**
 * 함 옆 숫자를 세는 SQL 다섯 갈래. 라우트는 «부르기만» 하고, 하니스가 진짜 SQLite 에 돌린다.
 *   ⚠️ 바인드 순서: SELECT 절의 ? 가 WHERE 절의 ? 보다 «먼저» 다(SQLite 는 나오는 순서).
 */
export function buildArchiveFacets(inp: ArchiveFacetInput): {
  totals: SqlPiece; types: SqlPiece; approvers: SqlPiece;
  periods: Record<string, SqlPiece>;
} {
  const me = String(inp.me || '');
  const vis = archiveVisibleCond(me, { exec: !!inp.exec, ph: !!inp.ph });
  const W = (extra: string) => {
    const parts = [vis.cond, extra].filter(Boolean);
    return parts.length ? (' WHERE ' + parts.join(' AND ')) : '';
  };
  const D = "date(created_at/1000,'unixepoch','+9 hours')";
  const per = archivePeriods(inp.today);
  const periods: Record<string, SqlPiece> = {};
  for (const k of Object.keys(per)) {
    periods[k] = {
      sql: `SELECT COUNT(*) AS n FROM approval_requests` + W(`${D} >= ? AND ${D} <= ?`),
      binds: [...vis.binds, per[k].from, per[k].to],
    };
  }
  return {
    // «전체 · 내가 올린 것 · 내가 결재한 것» 셋을 한 번에
    totals: {
      sql: `SELECT COUNT(*) AS all_n, SUM(requester_username = ?) AS mine_n, SUM(${DECIDED_BY_SQL}) AS decided_n` +
           ` FROM approval_requests` + W(''),
      binds: [me, me, ...vis.binds],
    },
    types: {
      sql: `SELECT req_type AS k, COUNT(*) AS n FROM approval_requests` + W('') + ` GROUP BY req_type`,
      binds: [...vis.binds],
    },
    /* 결재자별 — 도장(approval_steps) 기준. 같은 건에 두 번 찍었어도(다단계) 한 건으로 센다.
       vis.cond 의 requester_username · approval_requests.id 가 조인 뒤에도 풀리도록 표 이름을 그대로 쓴다. */
    approvers: {
      sql: `SELECT s.decided_by AS u, COUNT(DISTINCT s.request_id) AS n` +
           ` FROM approval_steps s JOIN approval_requests ON approval_requests.id = s.request_id` +
           W(`s.decided_by IS NOT NULL AND s.status IN ('approved','rejected')`) +
           ` GROUP BY s.decided_by ORDER BY n DESC, u ASC LIMIT 20`,
      binds: [...vis.binds],
    },
    periods,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 📊 지출 정리 — 「이번 달 무슨 돈을 얼마나 썼나」
 *
 *   [왜 순수 함수인가]
 *     라우트 안에서 더하면 하니스가 «그 줄이 있는가» 로밖에 못 본다. 합계는
 *     **틀려도 에러가 안 나므로** 실제로 돌려서 숫자를 세어 봐야 한다.
 *
 *   [⛔ 통화를 섞지 않는다]
 *     PHP 와 KRW 를 더하면 안 된다 — 환율을 우리가 모른다. 지어내면 그 숫자가
 *     그대로 사장님 판단 근거가 된다(2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」).
 *     그래서 모든 합계가 **통화별**이다.
 *
 *   [⛔ 상태를 섞지 않는다]
 *     승인 = 쓰기로 확정된 돈 · 대기 = 아직 아닌 돈 · 반려 = 안 쓴 돈.
 *     합치면 「이번 달 얼마 썼나」가 거짓이 된다.
 *
 *   [⛔ 모르는 것을 0으로 때우지 않는다]
 *     금액이 없는 건은 «0원» 이 아니라 «금액 없음 N건» 으로 따로 센다.
 *     항목을 안 고른 건도 «기타» 가 아니라 «항목 없음» 으로 따로 센다.
 *
 *   [달 눈금]
 *     회계는 «쓴 날» 이 맞지만 spent_at 은 비어 있을 수 있다 →
 *     spent_at 이 있으면 그것, 없으면 올린 날. 어느 쪽을 썼는지 세어서 함께 돌려주고
 *     화면이 그 사실을 말한다.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface SummaryRowLike {
  req_type?: string | null;
  status?: string | null;
  category?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  spent_at?: string | null;
  created_at?: number | string | null;
  file_key?: string | null;
  has_file?: boolean | null;
  /* 🔁 «취소 결재» 인가 — 원본 번호. 이 행은 «쓴 돈» 이 아니라 «되돌리자는 요청» 이라
     금액·항목 합계에 넣으면 안 된다(2026-09-05 함정 대조 실측: 대기 중에는 두 배로,
     승인 뒤에는 원본이 빠진 자리를 그대로 채워 **총액이 한 푼도 안 줄었다**). */
  reverses_id?: number | null;
}

export interface MoneyBucket { currency: string; total: number; count: number }

export interface CategorySum {
  key: string | null;        // null = 항목을 안 고른 건
  ko: string; en: string;
  account: string | null;
  count: number;
  money: MoneyBucket[];
}

export interface ApprovalSummary {
  /** 센 행 수 (열람 가능분만) */
  counted: number;
  by_status: { approved: number; pending: number; rejected: number; withdrawn: number; cancelled: number; other: number };
  /** 승인된 것만 — «쓰기로 확정된 돈» */
  approved_money: MoneyBucket[];
  /** 대기 중 — «아직 아닌 돈» */
  pending_money: MoneyBucket[];
  /** 항목별(승인·대기만. 반려는 안 쓴 돈이라 뺀다) */
  by_category: CategorySum[];
  /** 달별(승인만) — [{ month, money }] */
  by_month: Array<{ month: string; money: MoneyBucket[]; count: number }>;
  /** 화면이 «모른다» 고 말해야 하는 것들 */
  no_amount: number;        // 금액이 없는 건
  no_category: number;      // 항목을 안 고른 건 (지출·물품 중에서만 센다)
  no_file: number;          // 영수증이 필요한데 없는 건
  /** 달 눈금을 무엇으로 잡았나 — 화면이 그대로 말한다 */
  dated_by_spent: number;
  dated_by_created: number;
}

function addMoney(list: MoneyBucket[], currency: string, amount: number | null): void {
  const cur = normCurrency(currency);
  let b = list.find(x => x.currency === cur);
  if (!b) { b = { currency: cur, total: 0, count: 0 }; list.push(b); }
  b.count++;
  if (amount != null) b.total += amount;
}

/** 금액을 숫자로. 못 읽으면 **0이 아니라 null** — 「모른다」와 「0원」은 다른 사실이다. */
function money(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return (isFinite(n) && n >= 0) ? n : null;
}

/** ms → KST 'YYYY-MM'. 못 읽으면 null. */
function monthOf(row: SummaryRowLike): { month: string | null; bySpent: boolean } {
  const sp = String(row.spent_at || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(sp)) return { month: sp.slice(0, 7), bySpent: true };
  const ms = Number(row.created_at || 0);
  if (!ms) return { month: null, bySpent: false };
  const d = new Date(ms + 9 * 3600_000);
  const p = (x: number) => String(x).padStart(2, '0');
  return { month: d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1), bySpent: false };
}

export function summarizeApprovals(rows: SummaryRowLike[]): ApprovalSummary {
  const out: ApprovalSummary = {
    counted: 0,
    by_status: { approved: 0, pending: 0, rejected: 0, withdrawn: 0, cancelled: 0, other: 0 },
    approved_money: [], pending_money: [],
    by_category: [], by_month: [],
    no_amount: 0, no_category: 0, no_file: 0,
    dated_by_spent: 0, dated_by_created: 0,
  };
  const catMap = new Map<string, CategorySum>();
  const monMap = new Map<string, { month: string; money: MoneyBucket[]; count: number }>();

  for (const r of (rows || [])) {
    out.counted++;
    /* ⚠️ 상태 이름을 손으로 적지 않는다 — 상태가 늘 때 조용히 «other» 로 묻힌다.
       회수·취소는 «금액» 에는 안 들어가지만(countsAsSpend) «몇 건인지» 는 말해야 한다:
       사람이 「분명 올렸는데 합계에 없다」를 스스로 설명할 수 있어야 한다. */
    const st = String(r.status || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(out.by_status, st)) (out.by_status as any)[st]++;
    else out.by_status.other++;

    const spec = typeSpec(r.req_type);
    const amt = money(r.amount);
    const cur = normCurrency(r.currency);

    /* 금액은 «돈이 나가는 분류» 에서만 뜻이 있다 — 긴급·불만에 금액이 없는 것은
       빠뜨린 것이 아니라 원래 없는 것이다. 그것까지 「금액 없음」으로 세면
       화면이 멀쩡한 결재를 «덜 채워진 것» 처럼 말한다.

       🔴 그리고 **반려는 세지 않는다** — 아래 by_category 가 반려를 빼기 때문에,
          반려까지 세면 화면이 「항목 없음 1건 — 위 「항목 없음」 줄이 그것입니다」라고
          하는데 그 줄이 **없다.** 사람이 없는 줄을 찾게 된다(2026-09-04 함정 대조 지적).
          이 상자는 «이 합계» 가 말하지 않는 것을 적는 자리이고, 그 합계는 승인·대기다. */
    const isSpend = !!spec.wantsCategory;
    // 정본 — 승인·대기만, 그리고 «취소 결재 자신» 은 지출이 아니다(isSpendRow)
    const counted = isSpendRow(r);
    if (counted && isSpend && amt == null) out.no_amount++;
    if (counted && isSpend && !String(r.category || '').trim()) out.no_category++;
    const hasFile = (r.has_file != null) ? !!r.has_file : !!r.file_key;
    if (counted && spec.requiresFile && !hasFile) out.no_file++;

    if (counted && st === 'approved') addMoney(out.approved_money, cur, amt);
    else if (counted && st === 'pending') addMoney(out.pending_money, cur, amt);

    // 항목별 — 반려·회수·취소는 «안 쓴 돈» 이라 뺀다(countsAsSpend 가 정본)
    if (isSpend && counted) {
      const key = String(r.category || '').trim() || '';
      const cs = categorySpec(key);
      const id = cs ? cs.key : '\u0000none';
      let row = catMap.get(id);
      if (!row) {
        row = cs
          ? { key: cs.key, ko: cs.ko, en: cs.en, account: cs.account, count: 0, money: [] }
          : { key: null, ko: '항목 없음', en: 'No item', account: null, count: 0, money: [] };
        catMap.set(id, row);
      }
      row.count++;
      addMoney(row.money, cur, amt);
    }

    // 달별 — 승인된 것만(«쓴 돈»)
    if (st === 'approved') {
      const m = monthOf(r);
      if (m.bySpent) out.dated_by_spent++; else if (m.month) out.dated_by_created++;
      if (m.month) {
        let mr = monMap.get(m.month);
        if (!mr) { mr = { month: m.month, money: [], count: 0 }; monMap.set(m.month, mr); }
        mr.count++;
        addMoney(mr.money, cur, amt);
      }
    }
  }

  /* 항목별은 «금액이 큰 것» 부터. 통화가 여럿이면 비교할 공통 잣대가 없으므로
     ⛔ 환산하지 않고 **건수** 로 정렬한다(그 다음 이름순 — 순서가 흔들리지 않게). */
  out.by_category = [...catMap.values()].sort((a, b) =>
    (b.count - a.count) || String(a.ko).localeCompare(String(b.ko)));
  // 「항목 없음」은 언제나 맨 뒤 — 항목이 붙은 것이 먼저 보여야 한다
  const noneAt = out.by_category.findIndex(c => c.key === null);
  if (noneAt >= 0) out.by_category.push(out.by_category.splice(noneAt, 1)[0]);

  out.by_month = [...monMap.values()].sort((a, b) => a.month < b.month ? -1 : 1);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🧭 맨 위 요약 — 「아침에 한 번 열어 보는 화면」(D안)
 *
 *   [왜 SQL 집계를 그대로 써도 되는가]
 *     C안(지출 정리)은 canView 를 못 걸어서 «행을 읽어 코드로» 셌다. 여기는 다르다 —
 *     집계 범위를 **canView 가 무조건 통과시키는 두 가지**로만 잡기 때문이다:
 *       ① 경영진 → 세 열람등급(exec·chain·broadcast)을 전부 통과한다
 *          ⚠️ 정확히는 «경영진 **이면서 본사 계정**» 일 때다 — broadcast 분기는 isExec 를
 *             보지 않고 isHqStaff 를 본다(실측: role 이 없는 exec 는 broadcast 가 false).
 *             본사 계정이 아니면 라우트 가드(api-approval.ts)가 403 이라 여기 닿지 못한다.
 *             ⛔ 그 가드를 지우면 이 전제가 조용히 깨진다 — 하니스가 둘 다 못 박는다.
 *       ② 그 밖의 사람 → **본인이 올린 것만**(canView 첫 줄 「내가 올린 건은 언제나 본다」)
 *     그래서 SQL 이 준 행이 곧 «볼 수 있는 행» 이고 거를 것이 없다.
 *     ⛔ 이 전제를 넓히지 말 것 — 예컨대 «본사 직원은 전체» 로 바꾸는 순간
 *        인사·급여가 요약으로 샌다(2026-09-04 에 C안에서 실제로 그랬다).
 *
 *   [⛔ 통화를 섞지 않는다 · 모르는 것을 0으로 때우지 않는다]
 *     summarizeApprovals 와 같은 규칙이다. 두 화면이 다른 말을 하면 안 된다.
 * ═════════════════════════════════════════════════════════════════════════ */

/** SQL 이 (통화 × 달)로 묶어 준 행. */
export interface MoneyGroupRow {
  cur?: string | null;
  ym?: string | null;          // 'YYYY-MM' (KST)
  n?: number | string | null;
  total?: number | string | null;
  no_amt?: number | string | null;
}

export interface HomeMoney {
  month: MoneyBucket[];
  year: MoneyBucket[];
  month_count: number;
  year_count: number;
  /** 금액이 없어 합계에 못 넣은 건 — 0으로 때우지 않고 따로 센다 */
  month_no_amount: number;
  year_no_amount: number;
}

/**
 * (통화 × 달) 묶음을 「이번 달」과 「올해」로 접는다.
 *   ⚠️ `ym` 은 이미 KST 로 잘린 값이어야 한다(SQL 에서 '+9 hours').
 *      여기서 다시 시간대를 만지지 않는다 — 두 곳에서 자르면 반드시 어긋난다.
 */
export function foldHomeMoney(rows: MoneyGroupRow[], thisMonth: string): HomeMoney {
  const out: HomeMoney = {
    month: [], year: [], month_count: 0, year_count: 0,
    month_no_amount: 0, year_no_amount: 0,
  };
  const yr = String(thisMonth || '').slice(0, 4);
  for (const r of (rows || [])) {
    const ym = String(r.ym || '');
    if (!yr || ym.slice(0, 4) !== yr) continue;      // 올해가 아니면 세지 않는다
    const cur = normCurrency(r.cur);
    const n = Number(r.n) || 0;
    const na = Number(r.no_amt) || 0;
    /* 합계는 «읽을 수 있는 숫자» 일 때만 더한다 — SUM 이 NULL 이면(전부 금액 없음)
       0 으로 때우지 않고 그냥 안 더한다. */
    const t = (r.total === null || r.total === undefined || r.total === '') ? null : Number(r.total);
    const amt = (t != null && isFinite(t) && t >= 0) ? t : null;

    const push = (list: MoneyBucket[]) => {
      let b = list.find(x => x.currency === cur);
      if (!b) { b = { currency: cur, total: 0, count: 0 }; list.push(b); }
      b.count += n;
      if (amt != null) b.total += amt;
    };
    push(out.year); out.year_count += n; out.year_no_amount += na;
    if (ym === thisMonth) { push(out.month); out.month_count += n; out.month_no_amount += na; }
  }
  /* ⚠️ 여기서 «비우지» 않는다 — 통화 줄은 그대로 돌려주고, 「—」로 그릴지는 **화면**이 정한다
     (`repMoney`). 이 함수가 하지 않는 일을 한다고 적어 두면 다음 사람이 여기를 고치러 온다.
     ⛔ 건수는 금액과 따로 둔다 — «0원짜리 승인 N건» 이 아니라 «금액 없는 승인 N건» 이다. */
  return out;
}

/** 지금이 KST 로 몇 년 몇 월인가 — 'YYYY-MM'. */
export function kstMonth(nowMs: number): string {
  const d = new Date(nowMs + 9 * 3600_000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
