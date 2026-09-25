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
 *        ✅ **2026-09-09 사장님 결정: 그대로 둔다.** 「내가 직접 큰 돈을 올릴 일이 없어.
 *           이거 아주 예외적인 경우야」 — 대표가 직접 큰돈을 올리는 것은 예외적인 경우이고,
 *           그때는 배너를 보고 취소한 뒤 다른 사람이 올리면 된다.
 *        ⛔ 그러니 「경영진이 올린 건은 예외로 통과」로 «고치지» 말 것 — 이미 사람이 보고
 *           고른 것이지 «아직 안 정한 것» 이 아니다. 그건 돈이 나가는 규칙을 느슨하게 하는
 *           일이라, 다시 열려면 사장님 지시가 한 번 더 있어야 한다.
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
  /** 그중 최근 7일 안의 건수 — 이건 «실수로 두 번 올림» 일 가능성이 높아 🔴 로 본다 */
  duplicateRecentCount?: number;
  /** 🔎 꼼꼼 점검(2026-09-24) — 돈이 나가는 분류에만 쓴다. 없으면 그 점검을 건너뛴다. */
  body?: string | null;
  spentAt?: string | null;
  /** 영수증에서 읽어낸 날짜(YYYY-MM-DD) */
  ocrSpentAt?: string | null;
  /** 판정 기준 시각(ms). 하니스가 날짜를 고정해 돌릴 수 있게 받는다. */
  now?: number;
  /** 이번 달 같은 분류 승인 합계 (이 건 제외) */
  monthTotal?: number | null;
  /** 최근 같은 분류 금액들의 중앙값 (없으면 null) */
  medianAmount?: number | null;
  /** 🧾 같은 영수증 파일(내용 해시가 같음)이 이미 다른 살아 있는 결재에 쓰인 건수 */
  receiptReusedCount?: number;
  /** 📷 휴대폰이 잰 사진 상태 — 'blurry' | 'dark' 만 뜻이 있다(normPhotoQuality). 7단계 */
  photoQuality?: string | null;
  /** 🔁 같은 사람이 최근 7일 안에 올린 같은 분류 건수(이 건 제외). 11단계 */
  weekCount?: number;
  /** 🏪 영수증 가게 이름 — 처음 보는 가게면 newVendor 가 true. 11단계 */
  vendor?: string | null;
  newVendor?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🧾 영수증 품목 → 결재서 내용 (8단계, 2026-09-24 사장님 「영수증 찍으면 내용·목록·금액이 자동으로」)
 *
 *   AI(비전 모델)는 «품목 목록» 만 읽는다. 그것을 «어떻게 적을지» 는 여기 순수 함수가 정한다 —
 *   같은 영수증이면 언제나 같은 글이 나와야 결재자가 믿고, 하니스가 실제로 돌려 볼 수 있다.
 *   ⛔ 품목을 지어내지 않는다 — 이름이 빈 줄은 버리고, 못 읽은 값은 null(빈칸)로 둔다.
 *   ⚠️ 판독은 틀릴 수 있다 — 글 머리에 «영수증에서 읽음 · 확인» 을 적고, 품목 합계가 총액과
 *      다르면 그 사실을 한 줄로 남긴다(맞춰 «고치지» 않는다).
 * ═════════════════════════════════════════════════════════════════════════ */

export interface ReceiptItem { name: string; qty: number; price: number | null }

/** 모델이 준 품목 배열을 믿을 수 있는 모양으로. 모르는 값은 버리거나 null. 최대 15줄. */
export function normReceiptItems(raw: unknown): ReceiptItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ReceiptItem[] = [];
  for (const it of raw) {
    if (out.length >= 15) break;
    if (!it || typeof it !== 'object') continue;
    const name = String((it as any).name == null ? '' : (it as any).name).replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name) continue;
    const qn = Number(String((it as any).qty == null ? '' : (it as any).qty).replace(/[^\d.]/g, ''));
    const qty = (isFinite(qn) && qn >= 1) ? Math.min(999, Math.round(qn)) : 1;
    const praw = String((it as any).price == null ? '' : (it as any).price);
    // ⚠️ 할인 줄(-₱3)을 숫자만 남기면 +3 이 된다 — 음수는 «모름»(null)으로 둔다.
    const ps = /-\s*[₱₩$]?\s*\d/.test(praw) ? '' : praw.replace(/[^\d.]/g, '');
    const pn = ps === '' ? NaN : Number(ps);
    const price = (isFinite(pn) && pn > 0) ? Math.round(pn * 100) / 100 : null;
    out.push({ name, qty, price });
  }
  return out;
}

/** 품목 → 결재서 «내용» 칸 글. 품목이 없으면 ''(내용을 지어내지 않음). */
export function receiptBody(items: ReceiptItem[], amount: number | null, currency: string): string {
  if (!items || !items.length) return '';
  const lines = ['Items (read from the receipt — please check / 영수증에서 읽음 · 확인해 주세요):'];
  let sum = 0, allPriced = true;
  for (const it of items) {
    const q = it.qty > 1 ? ' × ' + it.qty : '';
    lines.push('- ' + it.name + q + (it.price != null ? ' — ' + fmt(it.price, currency) : ''));
    if (it.price == null) allPriced = false; else sum += it.price;
  }
  const a = Number(amount);
  if (allPriced && isFinite(a) && a > 0 && Math.abs(sum - a) >= 1) {
    lines.push('※ Items add up to ' + fmt(sum, currency) + ', total says ' + fmt(a, currency) +
               ' / 품목 합계와 총액이 다릅니다 — 확인해 주세요');
  }
  return lines.join('\n');
}

/** 가게·품목 낱말로 «항목(계정)» 을 짐작한다. 확신이 없으면(0개·동점) null — 사람이 고른다. */
const CAT_WORDS: [string, RegExp][] = [
  ['supplies',  /\b(paper|bond|pen|pens|pencil|ink|folder|tape|stapler|marker|envelope|notebook|clip|glue|tissue|soap|detergent|cleaner|national book ?store|office ?warehouse)\b/i],
  ['equipment', /\b(printer|monitor|laptop|computer|keyboard|mouse|chair|table|desk|aircon|air ?con|fan|headset|webcam|router|cable|speaker|cabinet)\b/i],
  ['transport', /\b(grab|taxi|jeep|jeepney|bus|fare|fuel|gasoline|diesel|petron|shell|caltex|toll|parking|lrt|mrt|angkas)\b/i],
  ['meal',      /\b(restaurant|coffee|cafe|jollibee|mcdo|mcdonald|chowking|food|meal|lunch|dinner|snack|pizza|starbucks|bakery)\b/i],
  ['books',     /\b(book|books|print|printing|xerox|photocopy|copy|laminat\w*|tarpaulin)\b/i],
  ['utility',   /\b(meralco|electric|electricity|water|maynilad|pldt|globe|smart|converge|internet|load|wifi)\b/i],
  ['rent',      /\b(rent|rental|lease|association dues)\b/i],
  ['ads',       /\b(ads?|advert\w*|boost|flyers?|poster|banner|promo)\b/i],
];
export function guessCategory(vendor: string | null | undefined, items: ReceiptItem[]): string | null {
  const text = [String(vendor || '')].concat((items || []).map(i => i.name)).join(' ');
  if (!text.trim()) return null;
  let best: string | null = null, bestN = 0, tie = false;
  for (const [key, re] of CAT_WORDS) {
    const g = new RegExp(re.source, 'gi');
    const n = (text.match(g) || []).length;
    if (n > bestN) { best = key; bestN = n; tie = false; }
    else if (n > 0 && n === bestN) tie = true;
  }
  return (bestN > 0 && !tie) ? best : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🏪 처음 보는 가게 · 🔁 일주일에 여러 번 (11단계, 2026-09-25)
 *   제안서 🟡 «처음 보는 거래처» · «같은 사람이 일주일에 여러 번» — 둘 다 «확인 필요» 참고일 뿐
 *   🔴(되돌림)로 올리지 않는다. 멀쩡한 새 가게·바쁜 주는 흔하다.
 * ═════════════════════════════════════════════════════════════════════════ */
/** 이 건 말고 최근 7일에 같은 분류를 이만큼 이상 올렸으면 «이번이 N번째» 로 알린다. */
export const FREQUENT_WEEK_MIN = 3;
/** 아는 가게가 이만큼 쌓이기 전에는 «처음 보는 가게» 를 말하지 않는다 — 기록이 적으면 전부 «처음» 이다. */
export const VENDOR_HISTORY_MIN = 10;

/** 처음 보는 가게인가. 모르면(이름이 짧음·기록 부족) false — 지어내지 않는다.
 *  비교 열쇠는 6단계 정본 vendorKey(대소문자·공백·기호 무시) 그대로. */
export function isNewVendor(vendor: unknown, known: unknown[], minHistory: number = VENDOR_HISTORY_MIN): boolean {
  const k = vendorKey(vendor == null ? '' : String(vendor));
  if (k.length < 3) return false;
  const keys = new Set((Array.isArray(known) ? known : []).map(x => vendorKey(x == null ? '' : String(x))).filter(x => x.length >= 3));
  if (keys.size < minHistory) return false;
  return !keys.has(k);
}

/** 👀 대표님께 즉시 알리는 신호 — 결재권자 혼자 확정하는 소액 건에서 이것이 있을 때만.
 *  ⚠️ ocr_unread 는 넣지 않는다(PDF 마다 울려 소음). */
export const EXEC_WATCH_CODES: readonly string[] = [
  'unusual_amount', 'over_budget', 'duplicate', 'duplicate_recent', 'spent_old',
  'date_mismatch', 'ai_review', 'no_file', 'no_reason', 'spent_future', 'amount_mismatch_big',
  'new_vendor', 'frequent',
];

/** 📷 사진 상태 값 정리 — 화면이 보낸 값 중 아는 것만. 모르면 null(점검 안 함). */
export function normPhotoQuality(v: unknown): 'blurry' | 'dark' | null {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return (s === 'blurry' || s === 'dark') ? s : null;
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
  //   7일 안이면 «두 번 올림» 쪽이라 따로 표시한다(signalOf 가 🔴 로 본다).
  //   30일 안은 매달 같은 금액(인터넷비 등)일 수 있어 경고로만 둔다.
  if ((inp.duplicateRecentCount || 0) > 0) {
    out.push({
      code: 'duplicate_recent', level: 'warn',
      ko: '최근 7일 안에 같은 금액의 같은 분류 기안이 ' + inp.duplicateRecentCount + '건 있음',
      en: (inp.duplicateRecentCount || 0) + ' request(s) with the same amount in the last 7 days',
    });
  } else if ((inp.duplicateCount || 0) > 0) {
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

  /* 🔎 꼼꼼 점검 — 돈이 나가는 분류에만. 전부 «고치면 되는 것» 이다.
     no_reason · spent_future 는 신호등이 🔴(올리기 전에 고치게)로 본다. */
  if (spec.needsAmount) {
    if (inp.body != null && String(inp.body).replace(/\s+/g, ' ').trim().length < 10) {
      out.push({ code: 'no_reason', level: 'warn',
        ko: '무엇을 왜 샀는지(썼는지) 설명이 없습니다', en: 'Explain what it was for and why (at least one sentence)' });
    }
    const today = kstYmd(inp.now != null ? inp.now : Date.now());
    const sp = ymdDays(inp.spentAt);
    if (sp != null) {
      const t = ymdDays(today)!;
      if (sp > t + 1) {
        out.push({ code: 'spent_future', level: 'warn',
          ko: '사용 날짜가 미래입니다', en: 'The spending date is in the future' });
      } else if (sp < t - 60) {
        out.push({ code: 'spent_old', level: 'warn',
          ko: '60일도 더 지난 지출입니다', en: 'This was spent more than 60 days ago' });
      }
      const oc = ymdDays(inp.ocrSpentAt);
      if (oc != null && Math.abs(oc - sp) > 3) {
        out.push({ code: 'date_mismatch', level: 'warn',
          ko: '영수증 날짜(' + inp.ocrSpentAt + ')와 입력한 날짜가 다릅니다',
          en: 'Receipt date (' + inp.ocrSpentAt + ') differs from the date entered' });
      }
    }
  }

  // 🧾 같은 영수증 재사용 — 파일 «내용» 이 한 글자도 다르지 않은 사진·PDF 가 이미 다른 결재에 붙어 있다.
  //   이름·크기가 아니라 내용 해시로 본다(이름은 누구나 바꾼다). 반려·회수·취소된 건은 세지 않는다
  //   — 반려된 뒤 같은 영수증으로 «고쳐서 다시 올리는» 것은 정상이다.
  if ((inp.receiptReusedCount || 0) > 0) {
    out.push({
      code: 'receipt_reused', level: 'warn',
      ko: '같은 영수증 파일이 이미 다른 결재 ' + inp.receiptReusedCount + '건에 쓰였습니다',
      en: 'The same receipt file is already attached to ' + inp.receiptReusedCount + ' other request(s)',
    });
  }

  // 📷 흐리거나 어두운 영수증 사진(7단계) — 휴대폰이 선명도·밝기를 «계산» 으로 잰 값.
  //   ⚠️ 🔴 로 올리지 않는다 — 어림 판정이라 멀쩡한 사진을 반려하면 필리핀 업무가 멈춘다. 🟡 참고만.
  const pq = normPhotoQuality(inp.photoQuality);
  if (inp.hasFile && pq) {
    out.push({
      code: 'photo_unclear', level: 'warn',
      ko: pq === 'dark' ? '영수증 사진이 너무 어둡습니다 — 글자를 확인해 주세요'
                        : '영수증 사진이 흐립니다 — 글자를 확인해 주세요',
      en: pq === 'dark' ? 'The receipt photo is very dark — please check it can be read'
                        : 'The receipt photo looks blurry — please check it can be read',
    });
  }

  // 🔁 일주일에 여러 번 · 🏪 처음 보는 가게 (11단계) — 돈 나가는 분류만, «참고» 로만.
  if (spec.needsAmount) {
    const wk = Number(inp.weekCount) || 0;
    if (wk >= FREQUENT_WEEK_MIN) {
      out.push({ code: 'frequent', level: 'info',
        ko: '이번 주에 같은 분류로 ' + (wk + 1) + '번째 올린 건입니다',
        en: 'This is request #' + (wk + 1) + ' of this kind in the last 7 days' });
    }
    const vn = String(inp.vendor || '').trim();
    if (inp.newVendor === true && vn) {
      out.push({ code: 'new_vendor', level: 'info',
        ko: '처음 보는 가게입니다(' + vn.slice(0, 40) + ')',
        en: 'First time we see this shop (' + vn.slice(0, 40) + ')' });
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

/* ═══════════════════════════════════════════════════════════════════════════
 * 🔀 잘못 고른 분류 알려 주기 (14단계, 2026-09-25 사장님 「휴가신청에 잘못 결제 영수증이나 물품주문을
 *    올리면 잘못 올렸다고 알림을 주고 자동으로 물품으로 이동해서 올려주게」)
 *
 *   ⛔ LLM 을 쓰지 않는다 — 말로 정해진 낱말만 센다(결정론). 판정이 흔들리면 같은 글이 어떤 날은
 *      «잘못» 이고 어떤 날은 아니게 되고, 사람이 그것을 못 믿는다.
 *   ⛔ «모르면 안 알린다» — 양쪽 낱말이 섞이면(예: «휴가 중 택시비») 제안하지 않는다.
 *      헛경보는 사람이 버튼을 무시하게 만들어, 진짜 잘못 고른 건까지 놓친다.
 *   ⛔ 고객 불만·긴급·인사는 보지 않는다 — 불만은 원래 «결제했는데…» 처럼 돈 이야기를 하고,
 *      긴급은 분류보다 빨리 닿는 것이 먼저다. 인사·급여는 경영진 전용 분류라 옮기면 안 된다.
 *   ⚠️ 여기서는 «제안» 만 한다 — 옮기는 것은 사람이 누르는 버튼이고, 올리기도 사람이 누른다
 *      (물품 구입은 금액·영수증이 «반드시» 필요해 휴가 폼에서는 원래 채울 수 없다).
 * ═════════════════════════════════════════════════════════════════════════ */
/** 이 분류로 올리려 할 때 «잘못 골랐나» 를 본다. 화면이 올리기 전 점검을 부를지 정하는 데도 쓴다. */
export const MISFILE_FROM = ['leave', 'doc', 'purchase', 'expense'] as const;

const MIS_ORDER = [/주문/, /구매/, /구입/, /비품/, /사무용품/, /물품/, /사야/, /살\s*것/, /\border(ed|s)?\b/, /\bbuy(ing)?\b/, /\bbought\b/, /\bpurchas(e|ed|ing)\b/, /\bsupplies\b/, /\bbumili\b/, /\bbibili\b/];
const MIS_PAID = [/영수증/, /정산/, /환급/, /결제(했|함|한|완료)/, /택시/, /교통비/, /식대/, /\breceipts?\b/, /\breimburs(e|ement)\b/, /\bpaid\b/, /\btaxi\b/, /\bgrab\b/, /\bfare\b/, /\bresibo\b/];
const MIS_LEAVE = [/휴가/, /연차/, /병가/, /반차/, /결근/, /쉬겠/, /쉬고\s*싶/, /\bday\s*off\b/, /\bdays\s*off\b/, /\bvacation\b/, /\bsick\s*(leave|day)\b/, /\bon\s*leave\b/, /\bleave\s*(request|of absence)\b/, /\babsent\b/, /\brest\s*day\b/];
const MIS_MONEY_RE = /(₱|₩|\bphp\b|\bpesos?\b|\bkrw\b)\s*[\d,]+(\.\d+)?|[\d,]*\d(\.\d+)?\s*(원|₱|\bphp\b|\bpesos?\b|\bkrw\b)/i;

function misCount(list: RegExp[], text: string): number {
  let n = 0;
  for (const re of list) if (re.test(text)) n++;
  return n;
}

/** 글 속 «금액 한 개» — 정확히 하나일 때만(둘 이상이면 어느 것인지 모른다 → null). */
export function amountInText(text: string): { amount: number; currency: 'PHP' | 'KRW' } | null {
  const t = String(text || '');
  const re = new RegExp(MIS_MONEY_RE.source, 'gi');
  const hits = t.match(re) || [];
  if (hits.length !== 1) return null;
  const h = hits[0];
  const num = Number((h.match(/\d[\d,]*(\.\d+)?/) || [''])[0].replace(/,/g, ''));
  if (!isFinite(num) || num <= 0) return null;
  const cur: 'PHP' | 'KRW' = /₩|원|krw/i.test(h) ? 'KRW' : 'PHP';
  return { amount: num, currency: cur };
}

export interface MisfileInput { reqType: string; title?: string | null; body?: string | null; amount?: number | null; hasFile?: boolean }
export interface MisfileGuess {
  to: 'purchase' | 'expense' | 'leave';
  why_ko: string; why_en: string;
  amount_hint: { amount: number; currency: 'PHP' | 'KRW' } | null;
}

export function misfileGuess(inp: MisfileInput): MisfileGuess | null {
  const from = String(inp?.reqType || '');
  if ((MISFILE_FROM as readonly string[]).indexOf(from) < 0) return null;
  const text = (String(inp?.title || '') + '\n' + String(inp?.body || '')).toLowerCase();
  if (!text.trim()) return null;
  const order = misCount(MIS_ORDER, text), paid = misCount(MIS_PAID, text);
  const moneyText = MIS_MONEY_RE.test(text) ? 1 : 0;
  const leave = misCount(MIS_LEAVE, text);
  const money = order + paid + moneyText;

  // ① 돈이 나가는 이야기인데 휴가·일반 문서로 고른 경우 → 물품 구입(주문) / 지출 정산(이미 냄)
  if (from === 'leave' || from === 'doc') {
    if (leave > 0) return null;                          // 휴가 낱말이 있으면 안 건드린다(섞임 = 모름)
    const need = from === 'doc' ? 2 : 1;                 // 일반 문서는 돈 이야기가 원래 섞이므로 더 엄격하게
    if (money < need || (order + paid) === 0) return null;
    const to: 'purchase' | 'expense' = paid > order ? 'expense' : 'purchase';
    const fromKo = from === 'leave' ? '휴가 신청' : '일반 문서';
    const fromEn = from === 'leave' ? 'Time off' : 'Document';
    return to === 'purchase'
      ? { to, why_ko: fromKo + '인데 물건을 사거나 주문하는 내용입니다. «물품 구입» 으로 올려야 결재자에게 제대로 갑니다.',
              why_en: 'This is a ' + fromEn + ' request but it is about buying or ordering items. Use «Purchase» so it reaches the right approver.',
              amount_hint: amountInText(text) }
      : { to, why_ko: fromKo + '인데 이미 쓴 돈(영수증·정산) 이야기입니다. «지출 정산» 으로 올려야 돈을 돌려받을 수 있습니다.',
              why_en: 'This is a ' + fromEn + ' request but it is about money already spent (receipt / reimbursement). Use «Expense» to get paid back.',
              amount_hint: amountInText(text) };
  }

  // ② 휴가 이야기인데 물품 구입·지출 정산으로 고른 경우 → 휴가 신청
  if (from === 'purchase' || from === 'expense') {
    if (leave === 0 || money > 0) return null;           // 돈 낱말이 하나라도 있으면 안 건드린다
    if (inp?.hasFile) return null;                       // 영수증을 붙였으면 돈 결재일 가능성이 크다
    const amt = Number(inp?.amount);
    if (inp?.amount != null && isFinite(amt) && amt > 0) return null;
    return { to: 'leave',
      why_ko: '금액·영수증 없이 쉬는 날 이야기만 있습니다. «휴가 신청» 으로 올려야 그 날 수업 예약이 막힙니다.',
      why_en: 'There is no amount or receipt — only days off. Use «Time off» so bookings are blocked on those days.',
      amount_hint: null };
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 📒 간단 회계장부 (12단계, 2026-09-25 사장님 「간단한 회계장부도 자동으로 … 이번달것과 일년치것,
 *    결제액수·날짜 오름차순 내림차순」)
 *   «승인된 지출» 한 건 = 장부 한 줄. 날짜는 결재를 올린 날(KST) — 기간 거르기(from/to)와 같은 기준이라
 *   «이번 달 장부» 에 지난달 날짜가 섞이지 않는다.
 *   ⛔ 대기 건은 넣지 않는다(아직 안 나간 돈) — 건수만 따로 말한다.
 *   ⛔ 통화를 합치지 않는다 — 환율을 모른다(지출 정리와 같은 규칙).
 *   ⛔ 취소 결재(reverses_id)는 지출이 아니다(isSpendRow).
 * ═════════════════════════════════════════════════════════════════════════ */
export interface LedgerRow {
  id: number; ymd: string; title: string; who: string;
  category_ko: string | null; category_en: string | null;
  amount: number; currency: string;
}
export interface LedgerCat { cur: string; key: string; ko: string | null; en: string | null; sum: number; n: number }
export function ledgerFrom(items: any[]): { rows: LedgerRow[]; totals: { cur: string; sum: number; n: number }[]; by_category: LedgerCat[]; pending: number; no_amount: number } {
  const rows: LedgerRow[] = [];
  const tot: Record<string, { cur: string; sum: number; n: number }> = {};
  /* 🧾 분류별 소계(13단계) — «통화 + 분류» 가 한 칸. ⛔ 통화를 넘어 합치지 않는다.
     분류가 없는 건은 key '' 로 모아 «분류 없음» 으로 보여 준다(빼면 소계 합이 총계와 어긋난다). */
  const cat: Record<string, LedgerCat> = {};
  let pending = 0, noAmount = 0;
  for (const r of (Array.isArray(items) ? items : [])) {
    if (!r || !isSpendRow(r)) continue;
    if (String(r.status || '').trim().toLowerCase() !== 'approved') { pending++; continue; }
    const amt = Number(r.amount);
    if (r.amount == null || !isFinite(amt) || amt <= 0) { noAmount++; continue; }
    const cur = normCurrency(r.currency);
    const at = Number(r.created_at);
    rows.push({
      id: Number(r.id), ymd: isFinite(at) && at > 0 ? kstYmd(at) : '',
      title: String(r.title || ''), who: String(r.requester_name || r.requester_username || ''),
      category_ko: r.category_ko || null, category_en: r.category_en || null,
      amount: amt, currency: cur,
    });
    const t = tot[cur] || (tot[cur] = { cur, sum: 0, n: 0 });
    t.sum = Math.round((t.sum + amt) * 100) / 100; t.n++;
    const ck = String(r.category || r.category_ko || '').trim();
    const cid = cur + '|' + ck;
    const c = cat[cid] || (cat[cid] = { cur, key: ck, ko: ck ? (r.category_ko || ck) : null, en: ck ? (r.category_en || r.category_ko || ck) : null, sum: 0, n: 0 });
    c.sum = Math.round((c.sum + amt) * 100) / 100; c.n++;
  }
  // 기본 순서: 최근 날짜 먼저(같은 날이면 번호 큰 것 먼저). 화면이 사람이 고른 순서로 다시 정렬한다.
  rows.sort((a, b) => (a.ymd < b.ymd ? 1 : a.ymd > b.ymd ? -1 : b.id - a.id));
  // 소계 순서: 통화(총계와 같은 순서) → 큰 돈 먼저 → «분류 없음» 은 맨 뒤.
  const by_category = Object.keys(cat).map(k => cat[k]).sort((a, b) =>
    a.cur !== b.cur ? (a.cur < b.cur ? -1 : 1)
    : (!a.key !== !b.key ? (a.key ? -1 : 1)
    : (b.sum - a.sum || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))));
  return { rows, totals: Object.keys(tot).sort().map(k => tot[k]), by_category, pending, no_amount: noAmount };
}

/* 📅 장부 기간(13단계) — 화면이 날짜를 계산하지 않고 «이름» 만 보낸다.
 *   화면이 브라우저 시계로, 서버가 KST 로 세면 두 벌이 되어 월말·연말에 하루씩 어긋난다(문서함 함 경계와 같은 이유).
 *   month = 이번 달 1일~말일 · last_month = 지난달 1일~말일 · year = 최근 12개월(1년 전 다음날 ~ 오늘).
 *   ⚠️ 모르는 이름이면 null — 부르는 쪽이 원래 from/to 를 그대로 쓴다(지어내지 않는다). */
export function ledgerRange(period: unknown, today: string): { from: string; to: string } | null {
  const p = String(period == null ? '' : period).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))) return null;
  if (p === 'month' || p === 'last_month') return archivePeriods(today)[p];
  if (p === 'year') {
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)), d = Number(today.slice(8, 10));
    const from = new Date(Date.UTC(y - 1, m - 1, d + 1)).toISOString().slice(0, 10);
    return { from, to: today };
  }
  return null;
}

/* 📷 결재 카드의 영수증 미리보기 (12단계, 2026-09-25 — 제안서 ② «카드 맨 위에 요약 + 신호등 + 영수증 사진»)
 *   휴대폰에서 «첨부 보기» 가 내려받기라 파일을 열고 돌아와야 했다. 사진은 카드 안에서 바로 보이게 한다.
 *   ⚠️ 화면 안에 띄우는(inline) 것은 **사진만** — 올릴 때 바이트로 형식을 확인한 jpg·png·webp.
 *      PDF 는 예전처럼 내려받기(브라우저 PDF 뷰어에 문서를 띄우는 길은 열지 않는다). 모르면 내려받기. */
export function fileKind(ext: unknown): 'image' | 'pdf' | null {
  const e = normExt(String(ext == null ? '' : ext));
  if (e === 'jpg' || e === 'png' || e === 'webp') return 'image';
  if (e === 'pdf') return 'pdf';
  return null;
}
/** 내려줄 때의 Content-Disposition 종류 — 사진이고 화면이 «inline» 을 달라고 했을 때만 inline. */
export function fileDisposition(ext: unknown, wantInline: boolean): 'inline' | 'attachment' {
  return (wantInline === true && fileKind(ext) === 'image') ? 'inline' : 'attachment';
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


/* ═══════════════════════════════════════════════════════════════════════════
 * ⑦ 신호등 · 자동 반려 · 알림 단계 (2026-09-24 사장님 「모두 추진」)
 *
 *   ⚠️ 판정은 전부 «계산» 이다. AI(대화 모델)는 같은 건도 매번 다르게 판단할 수 있어
 *      멀쩡한 건을 반려하면 필리핀 쪽 업무가 멈춘다. AI 는 영수증 읽기·문장 쓰기만 한다.
 *   ⚠️ AI 는 절대 «승인» 하지 않는다. 자동으로 하는 일은 «서류 보완으로 되돌림» 뿐이다
 *      — 돈이 나가지 않는 방향이라 잘못돼도 다시 올리면 된다.
 * ═════════════════════════════════════════════════════════════════════════ */

export type Signal = 'green' | 'yellow' | 'red';
export interface SignalReason { code: string; ko: string; en: string }

/** 영수증 금액과 입력 금액이 이 비율보다 더 다르면 🔴(오타가 아니라 틀린 금액). */
export const AUTO_REJECT_MISMATCH = 0.10;

export interface SignalInput {
  reqType: string;
  amount?: number | null;
  ocrAmount?: number | null;
  hasFile: boolean;
  flags?: Flag[] | null;
}

/**
 * 🟢 바로 승인 가능 / 🟡 사람이 확인 / 🔴 서류 보완으로 되돌릴 대상.
 *   🔴 사유는 «고치면 되는 것» 만이다 — 영수증 없음 · 영수증과 금액이 10% 넘게 다름 · 7일 안 중복.
 *   예산 초과·큰 금액은 «정상일 수도 있는» 것이라 🟡 로 둔다(판단은 사람이).
 */
export function signalOf(inp: SignalInput): { signal: Signal; reasons: SignalReason[] } {
  const spec = typeSpec(inp.reqType);
  const flags = Array.isArray(inp.flags) ? inp.flags : [];
  const red: SignalReason[] = [];
  if (spec.requiresFile && !inp.hasFile) {
    red.push({ code: 'no_file', ko: '영수증이 필요한데 첨부가 없습니다', en: 'A receipt is required but none is attached' });
  }
  const amt = (inp.amount == null) ? null : Number(inp.amount);
  const ocr = (inp.ocrAmount == null) ? null : Number(inp.ocrAmount);
  if (amt != null && ocr != null && isFinite(amt) && isFinite(ocr) && ocr > 0) {
    const diff = Math.abs(ocr - amt);
    if (diff >= 1 && diff / Math.max(ocr, amt) > AUTO_REJECT_MISMATCH) {
      red.push({ code: 'amount_mismatch_big',
        ko: '영수증 금액과 입력 금액이 10% 넘게 다릅니다',
        en: 'The amount entered differs from the receipt by more than 10%' });
    }
  }
  if (flags.some(f => f && f.code === 'no_reason')) {
    red.push({ code: 'no_reason', ko: '무엇을 왜 썼는지 설명을 한 문장 이상 적어 주세요',
      en: 'Write at least one sentence on what it was for and why' });
  }
  if (flags.some(f => f && f.code === 'spent_future')) {
    red.push({ code: 'spent_future', ko: '사용 날짜가 미래입니다 — 날짜를 확인해 주세요',
      en: 'The spending date is in the future — please check it' });
  }
  if (flags.some(f => f && f.code === 'receipt_reused')) {
    red.push({ code: 'receipt_reused',
      ko: '이 영수증은 이미 다른 결재에 쓰였습니다 — 이번 지출의 영수증을 붙여 주세요',
      en: 'This receipt was already used on another request — attach the receipt for this purchase' });
  }
  if (flags.some(f => f && f.code === 'duplicate_recent')) {
    red.push({ code: 'duplicate_recent',
      ko: '최근 7일 안에 같은 금액으로 이미 올린 건이 있습니다',
      en: 'You already submitted the same amount in the last 7 days' });
  }
  if (red.length) return { signal: 'red', reasons: red };

  const yellow: SignalReason[] = [];
  for (const f of flags) {
    if (!f || !f.code) continue;
    yellow.push({ code: f.code, ko: f.ko, en: f.en });
  }
  // 영수증은 있는데 AI 가 금액을 못 읽었다 — 눈으로 한 번 봐야 한다(PDF 가 그렇다).
  if (spec.needsAmount && spec.requiresFile && inp.hasFile && (ocr == null || !(ocr > 0))) {
    yellow.push({ code: 'ocr_unread',
      ko: 'AI 가 영수증 금액을 읽지 못했습니다 — 금액을 눈으로 확인해 주세요',
      en: 'AI could not read the receipt amount — please check it by eye' });
  }
  if (yellow.length) return { signal: 'yellow', reasons: yellow };
  return { signal: 'green', reasons: [] };
}

/**
 * 📲 «알림에서 바로 승인» — 폰 알림의 [승인] 버튼으로 화면을 안 열고 결재한다
 *    (2026-09-24 사장님 「알림에서 바로 승인 만들어줘」).
 *
 *   화면을 안 보고 누르는 것이라 **«볼 것이 없는» 건만** 받는다:
 *     · 🟢 신호(점검 전부 통과) — 알림을 보낸 «뒤» 에 신호가 바뀌었을 수 있어 **누르는 순간 다시 잰다**
 *     · 돈이 나가는 분류(물품·지출)만 — 휴가·인사급여는 화면에서 내용을 봐야 한다
 *     · 알림이 가리킨 그 단계(expectSeq)일 때만 — 그 사이 다음 단계로 넘어갔으면 안 받는다
 *     · «승인» 만 — 반려는 사유를 써야 하니 화면에서
 *     · 대신 결재(부재중 경영진이 결재권자 몫을 누름)·취소 결재는 안 받는다
 *   ⛔ 이 게이트는 «추가로 막는» 것이다 — 권한·같은사람연속·본인건 검사는 decide 가 그대로 한다.
 *   반환: 막는 이유 코드, 통과면 null.
 */
export function pushApproveDenyReason(inp: {
  decision: string; expectSeq: unknown; seq: number; signal: Signal;
  reqType: string | null | undefined; byProxy: boolean; reversesId?: number | null;
}): string | null {
  if (inp.decision !== 'approved') return 'approve_only';
  const es = Number(inp.expectSeq);
  if (!Number.isInteger(es) || es !== inp.seq) return 'stage_moved';
  if (!blocksSameDecider(inp.reqType)) return 'type_not_quick';
  if (inp.reversesId) return 'reversal';
  if (inp.byProxy) return 'proxy';
  if (inp.signal !== 'green') return 'not_green';
  return null;
}

/** 알림에 [승인] 버튼을 붙여도 되는 건인가 — 위 게이트와 같은 기준(보내는 시점 판정). */
export function quickApprovable(inp: {
  signal: Signal; reqType: string | null | undefined; reversesId?: number | null;
}): boolean {
  return inp.signal === 'green' && blocksSameDecider(inp.reqType) && !inp.reversesId;
}

/**
 * 📋 반려 사유 목록 — 결재함 반려 버튼(work.html 의 WHYS)과 **같은 글자**여야 한다.
 *    ⚠️ 한쪽만 고치면 «자주 반려된 이유» 가 조용히 0 이 된다(하니스가 두 목록을 대조한다).
 */
export const REJECT_REASONS: readonly { code: string; en: string; ko: string; tip_en: string; tip_ko: string }[] = [
  { code: 'receipt',  en: 'Receipt needed', ko: '영수증 첨부 필요',
    tip_en: 'Attach a clear photo of the receipt', tip_ko: '영수증 사진을 선명하게 첨부했나요?' },
  { code: 'amount',   en: 'Check the amount', ko: '금액 확인 필요',
    tip_en: 'The amount matches the receipt exactly', tip_ko: '금액이 영수증과 똑같나요?' },
  { code: 'budget',   en: 'Over budget', ko: '예산 초과',
    tip_en: 'It fits this month\'s budget for the category', tip_ko: '이번 달 이 항목 예산 안인가요?' },
  { code: 'detail',   en: 'Add more detail (what, why, for whom)', ko: '설명 보충 필요',
    tip_en: 'You wrote what it is, why, and for whom', tip_ko: '무엇을·왜·누구를 위해 썼는지 적었나요?' },
  { code: 'duplicate', en: 'Duplicate request', ko: '중복 결재',
    tip_en: 'You have not already submitted this one', tip_ko: '이미 올린 건이 아닌가요?' },
];

/**
 * 📋 «자주 반려된 이유» — 반려 메모에서 위 사유를 세어 많은 순으로(최대 3개, 0건은 안 싣는다).
 *    반려가 한 건도 없으면 빈 배열 → 화면은 아무것도 안 그린다(지어내지 않는다).
 */
export function rejectTipsFrom(memos: (string | null | undefined)[]):
  { code: string; n: number; tip_en: string; tip_ko: string }[] {
  const out: { code: string; n: number; tip_en: string; tip_ko: string }[] = [];
  for (const r of REJECT_REASONS) {
    let n = 0;
    for (const m of memos) {
      const t = String(m || '');
      if (t && (t.indexOf(r.en) >= 0 || t.indexOf(r.ko) >= 0)) n++;
    }
    if (n > 0) out.push({ code: r.code, n, tip_en: r.tip_en, tip_ko: r.tip_ko });
  }
  out.sort((a, b) => b.n - a.n);
  return out.slice(0, 3);
}

/**
 * 🤖 자동 반려 «켤지 말지» 판단 자료 — 연습 모드(shadow) 기간에 AI 가 🔴 로 본 건을
 *    사람이 실제로 어떻게 처리했는지 센다. 끝나지 않은 건(대기)은 세지 않는다.
 *    agreed = 사람도 반려 · disagreed = 사람은 승인(= AI 가 켜져 있었으면 잘못 되돌렸을 건).
 */
export function shadowTally(rows: { signal: Signal; status: string | null | undefined }[]):
  { red: number; agreed: number; disagreed: number } {
  let red = 0, agreed = 0, disagreed = 0;
  for (const r of rows) {
    if (!r || r.signal !== 'red') continue;
    const st = String(r.status || '');
    if (st === 'rejected') { red++; agreed++; }
    else if (st === 'approved') { red++; disagreed++; }
  }
  return { red, agreed, disagreed };
}

/**
 * 🔁 매달 반복 지출 — 같은 제목이 «서로 다른 달» 에 두 번 이상 승인됐으면 반복으로 본다.
 *    입력은 승인된 내 기안(최근 몇 달). 반환은 제목별 대표 1건(가장 최근) + 달 수 · 늘 쓰던 금액.
 */
export function monthlyRepeats(rows: { title: string; amount?: number | null; currency?: string | null;
  req_type: string; body?: string | null; category?: string | null; created_at: number }[]):
  { title: string; amount: number | null; currency: string | null; req_type: string; body: string | null;
    category: string | null; months: number }[] {
  const by: Record<string, { rows: any[]; months: Record<string, 1> }> = {};
  for (const r of rows) {
    const key = r.req_type + '|' + String(r.title || '').trim().toLowerCase();
    if (!String(r.title || '').trim()) continue;
    const mo = new Date(Number(r.created_at) + 9 * 3600000).toISOString().slice(0, 7);
    (by[key] = by[key] || { rows: [], months: {} }).rows.push(r);
    by[key].months[mo] = 1;
  }
  const out: any[] = [];
  for (const k of Object.keys(by)) {
    const g = by[k];
    const months = Object.keys(g.months).length;
    if (months < 2) continue;
    g.rows.sort((a: any, b: any) => Number(b.created_at) - Number(a.created_at));
    const last = g.rows[0];
    out.push({ title: last.title, amount: last.amount == null ? null : Number(last.amount),
               currency: last.currency || null, req_type: last.req_type, body: last.body || null,
               category: last.category || null, months });
  }
  out.sort((a, b) => b.months - a.months);
  return out;
}

/**
 * 🤖 자동 반려를 «켜도 되는가» — 경영진 화면의 판단 패널이 쓰는 한 줄 판정.
 *   not_yet = AI 가 🔴 로 본 건을 사람이 «승인» 한 적이 있다(켜면 멀쩡한 건을 되돌렸을 것)
 *   too_few = 표본이 모자라다(🔴 5건 미만 또는 연습 기간 14일 미만)
 *   ready   = 14일 넘게 🔴 5건 이상이 전부 사람도 반려 — 켜 볼 만하다
 *   ⚠️ 켜는 것은 «사람» 이다. 이 함수는 권할 뿐 스위치를 바꾸지 않는다.
 */
export const AUTOREJECT_MIN_RED = 5;
export const AUTOREJECT_MIN_DAYS = 14;
export function autoRejectReadiness(t: { red: number; agreed: number; disagreed: number },
                                    days: number): 'ready' | 'not_yet' | 'too_few' {
  const red = Number(t && t.red) || 0, dis = Number(t && t.disagreed) || 0;
  if (dis > 0) return 'not_yet';
  if (red < AUTOREJECT_MIN_RED || !(Number(days) >= AUTOREJECT_MIN_DAYS)) return 'too_few';
  return 'ready';
}

/** 스위치 «쓰기» 입력 — 읽기(autoRejectMode)와 달리 모르는 값은 null(= 거절). 조용히 shadow 로 바꾸지 않는다. */
export function autoRejectModeInput(v: unknown): AutoRejectMode | null {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return (s === 'on' || s === 'off' || s === 'shadow') ? s : null;
}

/** 자동 반려 방식 — KV 'approval_autoreject'. 모르는 값·못 읽음 = 'shadow'(표시만). */
export type AutoRejectMode = 'off' | 'shadow' | 'on';
export function autoRejectMode(v: unknown): AutoRejectMode {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return (s === 'on' || s === 'off') ? s : 'shadow';
}

/**
 * 이 건을 AI 가 «되돌려도» 되는가.
 *   ⛔ 경영진이 올린 건 · 긴급 · 인사급여 · 취소 결재는 절대 되돌리지 않는다.
 *   ⛔ 🔴 가 아니면 되돌리지 않는다(🟡 는 사람이 판단).
 */
export function autoRejectable(inp: {
  signal: Signal; reqType: string; requesterIsExec: boolean; reversesId?: number | null;
}): boolean {
  if (inp.signal !== 'red') return false;
  if (inp.requesterIsExec) return false;
  if (inp.reversesId) return false;
  const t = String(inp.reqType || '');
  if (t === 'urgent' || t === 'hr') return false;
  return true;
}

/**
 * ⏰ 알림 단계 — 단계가 열린 시각부터 잽니다.
 *   4시간 푸시 → 8시간 문자 → 12시간 사이렌 → 24시간 경영진 승격.
 *   마감이 짧은 분류(긴급 2시간)는 같은 비율로 줄인다(긴급: 20분·40분·1시간·2시간).
 */
export const NUDGE_HOURS = { push: 4, sms: 8, siren: 12, escalate: 24 };

export interface NudgePlan { stageStart: number; pushAt: number; smsAt: number; sirenAt: number; escalateAt: number }

export function nudgePlan(reqType: string, stageStartMs: number): NudgePlan {
  const k = Math.min(1, Math.max(0.01, typeSpec(reqType).slaHours / 24));
  const h = 3600_000 * k;
  const s = Number(stageStartMs) || 0;
  return {
    stageStart: s,
    pushAt: s + NUDGE_HOURS.push * h,
    smsAt: s + NUDGE_HOURS.sms * h,
    sirenAt: s + NUDGE_HOURS.siren * h,
    escalateAt: s + NUDGE_HOURS.escalate * h,
  };
}

/** 단계가 열린 시각 — stage_due_at 에서 거꾸로 센다(stageDeadlineMs 의 짝). 모르면 null. */
export function stageStartOf(reqType: string, stageDueAt: number | null | undefined): number | null {
  const d = Number(stageDueAt || 0);
  if (!(d > 0)) return null;
  return d - typeSpec(reqType).slaHours * 3600_000;
}

/** 지금 도달한 단계: 0 없음 · 1 푸시 · 2 문자 · 3 사이렌. (승격은 따로 판정) */
export function nudgeLevel(plan: NudgePlan, now: number): 0 | 1 | 2 | 3 {
  if (now >= plan.sirenAt) return 3;
  if (now >= plan.smsAt) return 2;
  if (now >= plan.pushAt) return 1;
  return 0;
}

/**
 * 📱 이번 회차에 «문자» 를 보낼 단계인가 (2026-09-25 사장님 「ARS 음성 메시지는 하지 말고 문자로만」).
 *   8시간(2) 과 12시간 사이렌(3) 에 «처음 닿을 때» 한 번씩만. 전화(ARS)는 쓰지 않는다.
 *   한 번에 여러 단계를 건너뛰면(0→3) 문자는 하나만 — 가장 높은 단계의 것.
 *   반환: 'siren' | 'late' | null
 */
export function nudgeSmsKind(target: number, cur: number): 'siren' | 'late' | null {
  const t = Number(target) || 0, c = Number(cur) || 0;
  if (t <= c) return null;
  if (t >= 3 && c < 3) return 'siren';
  if (t >= 2 && c < 2) return 'late';
  return null;
}

/**
 * 📬 하루 두 번 요약 알림을 누르면 어디로 가나 (2026-09-25, 10단계).
 *   🟢(바로 승인 가능) 건이 있으면 결재함의 «한 번에 승인» 자리로 바로 연다(?bulk=1).
 *   없으면 결재함 첫 화면. ⛔ 여기서 승인까지 하지는 않는다 — 누르는 것은 사람이다(확인 1회).
 */
export function digestUrl(green: number): string {
  return (Number(green) || 0) > 0 ? '/work?bulk=1' : '/work';
}

/**
 * 📊 대표님 주간 요약 — 이번 주 «승인된 지출» 합계(통화별)와 그중 🟡/🔴 였던 건 수.
 *   ⚠️ 지출 판정은 정본 isSpendRow(취소 결재·끝나지 않은 건 제외)를 그대로 쓴다.
 *   ⚠️ 통화는 섞어 더하지 않는다(₱ 와 ₩ 는 따로). 금액이 없거나 0 이하인 줄은 건너뛴다.
 */
export function weeklySpend(rows: { status?: string | null; reverses_id?: number | null;
  amount?: number | null; currency?: string | null; signal?: string | null }[]):
  { byCur: { cur: string; sum: number; n: number }[]; flagged: number; count: number } {
  const acc: Record<string, { sum: number; n: number }> = {};
  let flagged = 0, count = 0;
  for (const r of rows || []) {
    if (!r || String(r.status || '') !== 'approved' || !isSpendRow(r)) continue;
    const a = Number(r.amount);
    if (!isFinite(a) || a <= 0) continue;
    const cur = normCurrency(r.currency || 'PHP');
    (acc[cur] = acc[cur] || { sum: 0, n: 0 });
    acc[cur].sum += a; acc[cur].n++;
    count++;
    if (r.signal === 'yellow' || r.signal === 'red') flagged++;
  }
  const byCur = Object.keys(acc).sort().map(c => ({ cur: c, sum: Math.round(acc[c].sum * 100) / 100, n: acc[c].n }));
  return { byCur, flagged, count };
}

/** 한국 시각 밤 22시~아침 8시 — 문자·사이렌을 쉬는 시간(긴급은 예외, 호출하는 쪽이 정한다). */
export function isQuietKst(ms: number): boolean {
  const h = new Date(Number(ms) + 9 * 3600_000).getUTCHours();
  return h >= 22 || h < 8;
}

/** 하루 두 번 요약 — 한국 시각 이 시(時)에 보낸다. */
export const DIGEST_HOURS_KST = [9, 17];
export function digestSlotKst(ms: number): string | null {
  const t = new Date(Number(ms) + 9 * 3600_000);
  const h = t.getUTCHours();
  if (DIGEST_HOURS_KST.indexOf(h) < 0) return null;
  return t.toISOString().slice(0, 10) + ':' + h;
}

/** 한국 시각 기준 YYYY-MM-DD */
export function kstYmd(ms: number): string {
  return new Date(Number(ms) + 9 * 3600_000).toISOString().slice(0, 10);
}
/** YYYY-MM-DD → 일 수(비교용). 형식이 아니면 null — 모르면 점검하지 않는다. */
export function ymdDays(s: string | null | undefined): number | null {
  const v = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)));
  return isFinite(t) ? Math.floor(t / 86400_000) : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🤖 결재 자동화 4단계 (2026-09-24 사장님 「다음 단계로 계속 · 결제 자동화」)
 *   ① 같은 영수증 재사용 — 파일 내용 해시(SHA-256, 소문자 16진수 64자)
 *   ② 결재 전 이력 — «이 제목·이 사람이 전에도?» 를 계산으로 답한다(AI 대화 아님)
 *   ③ 올린 사람별 «첫 번에 통과» 비율 — 주간 요약에 싣는다
 * ═════════════════════════════════════════════════════════════════════════ */

/** SHA-256 16진수 문자열인가. 아니면 그 값은 쓰지 않는다(화면이 보낸 값이라 믿지 않는다). */
export function isSha256Hex(v: unknown): boolean {
  return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
}

/** 제목 비교용 — 앞뒤 공백·대소문자·겹공백·끝 숫자/달 이름(「인터넷비 9월」·「Internet Sept」) 차이는 같은 것으로 본다.
 *   ⚠️ 끝말은 «구분자 뒤» 에 올 때만 뗀다 — 안 그러면 「grammar」가 「gram」이 된다. */
export function titleKey(t: string | null | undefined): string {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/[\s\-_/.,:()#]+(\d{1,4}\s*(월|month)?|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?)$/i, '')
    .trim();
}

export interface HistoryRow {
  id: number; title: string; amount?: number | null; currency?: string | null;
  status: string | null | undefined; created_at: number; requester_username: string;
  reverses_id?: number | null;
}
export interface HistoryCard {
  /** 같은 사람이 비슷한 제목으로 올려 «승인된» 것 — 최근 것부터 최대 3건 */
  sameTitle: { id: number; amount: number | null; currency: string; at: number }[];
  sameTitleCount: number;
  /** 그 금액들의 중앙값(없으면 null) — 이번 금액과 견줄 기준 */
  sameTitleMedian: number | null;
  /** 이번 금액이 그 중앙값보다 몇 배인가(없으면 null) */
  ratio: number | null;
  /** 올린 사람의 최근 기록 — 올린 수 · 반려 수 */
  requesterTotal: number;
  requesterRejected: number;
}

/**
 * 결재 전 이력 카드. rows = 같은 분류의 최근 결재들(이 건 제외해서 넘기지 않아도 된다 — 여기서 뺀다).
 *   ⚠️ «승인됨» 만 이력으로 센다 — 반려·회수된 것은 «그때도 이랬다» 의 근거가 아니다.
 *   ⚠️ 취소 결재(reverses_id)는 지출이 아니라 빼고, 취소된 원본(status='cancelled')도 뺀다.
 */
export function historyCard(cur: { id: number; title: string; amount?: number | null; currency?: string | null; requester_username: string },
                            rows: HistoryRow[]): HistoryCard {
  const key = titleKey(cur.title);
  const ccy = normCurrency(cur.currency);
  const same = (rows || []).filter(r => r && r.id !== cur.id && r.requester_username === cur.requester_username
    && r.status === 'approved' && !r.reverses_id && key !== '' && titleKey(r.title) === key
    && normCurrency(r.currency) === ccy)
    .sort((a, b) => Number(b.created_at) - Number(a.created_at));
  const nums = same.map(r => Number(r.amount)).filter(n => isFinite(n) && n > 0).sort((a, b) => a - b);
  const median = nums.length ? nums[Math.floor(nums.length / 2)] : null;
  const amt = cur.amount == null ? null : Number(cur.amount);
  const ratio = (median && amt != null && isFinite(amt)) ? Math.round((amt / median) * 100) / 100 : null;
  const mine = (rows || []).filter(r => r && r.id !== cur.id && r.requester_username === cur.requester_username && !r.reverses_id);
  return {
    sameTitle: same.slice(0, 3).map(r => ({ id: r.id, amount: r.amount == null ? null : Number(r.amount), currency: normCurrency(r.currency), at: Number(r.created_at) })),
    sameTitleCount: same.length,
    sameTitleMedian: median,
    ratio,
    requesterTotal: mine.filter(r => r.status === 'approved' || r.status === 'rejected').length,
    requesterRejected: mine.filter(r => r.status === 'rejected').length,
  };
}

/**
 * 올린 사람별 «첫 번에 통과» 비율 — 결정이 난 건(승인·반려)만 센다.
 *   «첫 번에 통과» = 승인됐고, 회수 뒤 다시 올린 건(origin_id)이 아닌 것.
 *   ⚠️ 대기 중인 건은 아직 모르는 것이라 분모에 넣지 않는다(넣으면 비율이 부당하게 낮아진다).
 *   반환은 결정 건수가 많은 순. 결정이 0건인 사람은 싣지 않는다.
 */
export function firstPassRates(rows: { requester_username: string; requester_name?: string | null;
  status: string | null | undefined; origin_id?: number | null; reverses_id?: number | null }[]):
  { user: string; name: string; decided: number; firstPass: number; rejected: number; pct: number }[] {
  const m = new Map<string, { user: string; name: string; decided: number; firstPass: number; rejected: number }>();
  for (const r of rows || []) {
    if (!r || r.reverses_id) continue;
    if (r.status !== 'approved' && r.status !== 'rejected') continue;
    const u = String(r.requester_username || '');
    if (!u) continue;
    const e = m.get(u) || { user: u, name: String(r.requester_name || u), decided: 0, firstPass: 0, rejected: 0 };
    e.decided++;
    if (r.status === 'rejected') e.rejected++;
    else if (!r.origin_id) e.firstPass++;
    m.set(u, e);
  }
  return Array.from(m.values())
    .map(e => ({ ...e, pct: Math.round((e.firstPass / e.decided) * 100) }))
    .sort((a, b) => b.decided - a.decided || a.user.localeCompare(b.user));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 📅 월초 요약 (2026-09-24 사장님 「다음 단계」 — 결재함 자동화 5단계)
 *
 *   매달 1일 KST 9시에 «지난달» 결재를 경영진에게 한 번 보낸다.
 *   ⚠️ 크론을 새로 만들 수 없다(계정 한도 5/5) — 15분 SLA 점검에 얹고 KV 로 한 번만 보낸다.
 *   ⚠️ 판정·문구는 여기 순수 함수로 — 라우트 안에 두면 하니스가 «그 글자가 있는가» 로밖에 못 본다.
 *   ⛔ 통화를 섞지 않는다(₱·₩ 따로) · 모르는 금액을 0으로 때우지 않는다(summarizeApprovals 규칙).
 * ═════════════════════════════════════════════════════════════════════════ */

/** 1일 KST 9시 회차면 «지난달» 'YYYY-MM', 아니면 null. */
export function monthlySlotKst(ms: number): string | null {
  const t = new Date(Number(ms) + 9 * 3600_000);
  if (t.getUTCDate() !== 1 || t.getUTCHours() !== 9) return null;
  const y = t.getUTCFullYear(), m = t.getUTCMonth(); // m: 이번 달(0~11) → 지난달은 m-1
  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 12 : m;
  return py + '-' + String(pm).padStart(2, '0');
}

/** 'YYYY-MM'(KST) → [시작 ms, 다음 달 시작 ms). 형식이 아니면 null. */
export function kstMonthRange(month: string | null | undefined): [number, number] | null {
  const v = String(month || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return null;
  const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7));
  const start = Date.UTC(y, m - 1, 1) - 9 * 3600_000;
  const end = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - 9 * 3600_000;
  return [start, end];
}

/** 월초 요약 문장 — 한 건도 없으면 빈 배열(보내지 않는다). */
export function monthlyReportLines(month: string, s: ApprovalSummary,
  fp: { name: string; pct: number; firstPass: number; decided: number }[] = []): string[] {
  if (!s || !s.counted) return [];
  const b = s.by_status;
  const money = (list: MoneyBucket[]) => list.length
    ? list.map(x => fmt(x.total, x.currency) + ' (' + x.count + '건)').join(' · ')
    : '없음';
  const lines = [
    '[망고아이] ' + month + ' 결재 월간 요약',
    '올라온 결재 ' + s.counted + '건 (승인 ' + b.approved + ' · 반려 ' + b.rejected + ' · 대기 ' + b.pending +
      (b.withdrawn ? ' · 회수 ' + b.withdrawn : '') + (b.cancelled ? ' · 취소 ' + b.cancelled : '') + ')',
    '승인된 지출: ' + money(s.approved_money),
  ];
  const cats = (s.by_category || []).filter(c => c.key !== null).slice(0, 3);
  if (cats.length) lines.push('많은 항목: ' + cats.map(c => c.ko + ' ' + c.count + '건').join(', '));
  if (s.no_amount) lines.push('⚠ 금액이 빠진 건 ' + s.no_amount + '건 — 합계에 안 들어갔습니다');
  if (b.pending) lines.push('⚠ 지난달 올라와 아직 대기 중 ' + b.pending + '건');
  const top = (fp || []).filter(e => e.decided >= 2).slice(0, 5);
  if (top.length) lines.push('첫 번에 통과: ' + top.map(e => e.name + ' ' + e.pct + '% (' + e.firstPass + '/' + e.decided + ')').join(', '));
  return lines;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ❓ 결재 전 질문 (2026-09-24 결재함 자동화 6단계 — 제안서 「이 거래처 지난달에도? · 이번 달 비품 합계는?」)
 *
 *   ⚠️ 대화 모델에 묻지 않는다 — 같은 질문에 매번 다른 숫자를 주면 결재 근거가 못 된다.
 *      «질문 두 개» 를 미리 정해 두고 D1 행을 세어 답한다(결정론).
 *   ⚠️ 가게 이름은 영수증 판독값(ocr_vendor)이다 — 판독이 틀리면 «처음 보는 가게» 로 나올 수 있다.
 *      화면이 «영수증에서 읽은 이름» 이라고 말한다.
 * ═════════════════════════════════════════════════════════════════════════ */

/** 가게 이름 비교 열쇠 — 대소문자·공백·기호를 무시. 두 글자 미만이면 '' (비교하지 않는다). */
export function vendorKey(v: string | null | undefined): string {
  const k = String(v || '').toLowerCase().replace(/[^0-9a-z가-힣]+/g, '');
  return k.length >= 2 ? k : '';
}

/** 돈 나가는 분류 목록 — 콤마 문자열(SQL 에서 instr 로 쓴다. ⛔ IN (?,?,…) 로 펴지 말 것). */
export function spendTypesCsv(): string {
  return ',' + TYPES.filter(t => t.wantsCategory).map(t => t.key).join(',') + ',';
}

export interface AskCard {
  vendor: string | null;
  /** 같은 가게에서 승인된 건(이 건 제외, 최근 90일) */
  vendorCount: number;
  vendorLast: number | null;
  /** 그중 다른 사람이 올린 건 */
  vendorOthers: number;
  category: { key: string; ko: string; en: string } | null;
  /** 이번 달(KST) 같은 항목 승인 합계 — 통화별 */
  catMonth: MoneyBucket[];
  month: string;
}

type AskRow = { id: number; status?: string | null; reverses_id?: number | null; amount?: number | string | null;
  currency?: string | null; created_at?: number | string | null; requester_username?: string | null;
  vendor?: string | null; category?: string | null };

export function askCard(cur: { id: number; vendor?: string | null; category?: string | null; requester_username: string },
  rows: AskRow[], nowMs: number): AskCard {
  const vk = vendorKey(cur.vendor);
  const cs = categorySpec(cur.category);
  const month = kstMonth(nowMs);
  const range = kstMonthRange(month);
  const out: AskCard = { vendor: vk ? String(cur.vendor).trim() : null, vendorCount: 0, vendorLast: null,
    vendorOthers: 0, category: cs ? { key: cs.key, ko: cs.ko, en: cs.en } : null, catMonth: [], month };
  for (const r of rows || []) {
    if (!r || Number(r.id) === Number(cur.id)) continue;
    if (String(r.status || '') !== 'approved' || !isSpendRow(r)) continue;
    const at = Number(r.created_at || 0);
    if (vk && vendorKey(r.vendor) === vk && at >= nowMs - 90 * 86400_000) {
      out.vendorCount++;
      out.vendorLast = Math.max(out.vendorLast || 0, at);
      if (String(r.requester_username || '') !== String(cur.requester_username)) out.vendorOthers++;
    }
    if (cs && range && normCategory(r.category) === cs.key && at >= range[0] && at < range[1]) {
      addMoney(out.catMonth, String(r.currency || ''), money(r.amount));
    }
  }
  return out;
}
