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

/** 소액·반복 항목 자동 승인 — 기본 꺼짐. 실제 데이터가 쌓인 뒤 항목별로 켜는 것이 안전하다. */
export const AUTO_APPROVE_ENABLED = false;

/* ═══════════════════════════════════════════════════════════════════════════
 * ② 업무 분류
 * ═════════════════════════════════════════════════════════════════════════ */

export type ReqType = 'purchase' | 'expense' | 'hr' | 'complaint' | 'urgent' | 'doc' | 'leave';

/** 결재 단계의 «누가» — staff = 본사 담당, exec = 경영진, any = 먼저 본 사람(긴급 전용) */
export type StageRole = 'staff' | 'exec' | 'any';

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
}

/**
 * 분류 정의.
 *   ⚠️ 'expense' · 'doc' · 'leave' 는 **2026-08-05 부터 쌓인 기존 데이터의 값**이다.
 *      이름을 바꾸면 옛 결재가 «알 수 없는 분류»가 된다. 추가만 하고 바꾸지 말 것.
 */
export const TYPES: TypeSpec[] = [
  { key: 'purchase',  ko: '물품 구입', en: 'Purchase',    needsAmount: true,  teacherMaySubmit: false, visibility: 'chain',     slaHours: 24, wantsFile: true,  requiresFile: true },
  { key: 'expense',   ko: '지출 정산', en: 'Expense',     needsAmount: true,  teacherMaySubmit: false, visibility: 'chain',     slaHours: 24, wantsFile: true,  requiresFile: true },
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
 * ③ 결재선 자동 결정
 * ═════════════════════════════════════════════════════════════════════════ */

export interface Stage { seq: number; role: StageRole }

/**
 * 이 기안의 결재선은 몇 단계이고 누가 결재하는가.
 *
 *   · 인사·급여      → 경영진 1단계 (중간을 건너뛴다. 급여 내역이 담당자를 거칠 이유가 없다)
 *   · 긴급           → 0.5단계. 먼저 본 사람이 «확인»으로 닫는다
 *   · 물품·지출 고액 → 담당 → 경영진 2단계
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
    if (big) return [{ seq: 1, role: 'staff' }, { seq: 2, role: 'exec' }];
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
  // staff 단계는 본사 계정이면 되지만, 필리핀 매니저는 제외한다.
  //   («필리핀에서 올리고 한국에서 결재한다»는 실제 흐름. 더 좁히려면 이 한 줄만 고치면 된다.)
  if (phManager) return false;
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
}

export function buildFindQuery(inp: FindInput): { cond: string; binds: any[]; order: string } {
  const where: string[] = [];
  const binds: any[] = [];
  const me = String(inp.me || '');
  const scope = String(inp.scope || 'mine');

  if (scope === 'mine')          { where.push('requester_username = ?'); binds.push(me); }
  else if (scope === 'open')     { where.push('requester_username = ?'); binds.push(me); where.push("status = 'pending'"); }
  else if (scope === 'done')     { where.push('requester_username = ?'); binds.push(me); where.push("status = 'approved'"); }
  else if (scope === 'rejected') { where.push('requester_username = ?'); binds.push(me); where.push("status = 'rejected'"); }
  else if (scope === 'pending')  { where.push("status = 'pending'"); where.push('requester_username != ?'); binds.push(me); }
  // 'all' 은 조건 없음 — 결재자에게만 열린다(호출부가 막는다)

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

  const st = String(inp.status || '').trim();
  if (st === 'pending' || st === 'approved' || st === 'rejected') { where.push('status = ?'); binds.push(st); }

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
