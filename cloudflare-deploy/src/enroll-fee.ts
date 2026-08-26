/**
 * enroll-fee.ts — 수강신청 「월 수강료」 계산 정본 (2026-08-26 사장님 지시)
 *
 * ── 왜 이 파일이 따로 있나 ──────────────────────────────────────────────────
 * 「수업 시간 배수대로 수강료도 자동 계산되게 해 줘」.
 * 그 전까지 관리자 수강신청 등록은 `monthly_fee_krw` 를 **사람이 적은 값 그대로** 저장했다.
 * 그래서 40분을 골라도 20분 값으로 청구됐다 — `class-policy.ts` 가 직접 경고하는 상황이다
 * (「수업료와 강사료가 반드시 같은 배수를 써야 한다. 한쪽만 바꾸면 강사가 30분을 가르치고
 *   20분 값을 받는다」).
 *
 * 🔴 «자동으로 붙는 금액» 이라는 것을 반드시 사람이 보게 해야 한다.
 *    이 표에는 수강료를 «치는 칸이 없다»(2026-08-12 에 일부러 없앴다 — hidden 으로만 남아 있다).
 *    그래서 정상 등록에서는 기준가가 늘 비어 있고, 아래 «대리점 단가» 갈래가 **매번** 걸린다.
 *    즉 예전에는 `monthly_fee_krw` 가 NULL 이라 확정 단계가 「월 수강료가 0원입니다」 로 사람을
 *    세웠는데, 이제는 그 자리를 그냥 통과해 `subscriptions.amount` 로 들어간다.
 *    ⟹ 그래서 확정 화면이 **금액과 그 근거를 «언제나»** 보여 준다(배수가 1배여도). 안 보여 주면
 *      「아무도 치지 않은 금액이 조용히 청구되는」 상태가 된다.
 *
 * ⛔ 이 계산을 «여러 곳에» 두면 반드시 어긋난다 — 이 저장소가 반복해서 밟은 사고다.
 *    특히 위험한 것은 «두 번 곱하기» 다: 화면이 곱해서 보내고 서버가 또 곱하면 40분이 4배가 된다.
 *    그래서 규칙은 여기 하나뿐이고, **곱하는 곳은 저장하는 순간 딱 한 번**이다.
 *    저장 뒤에는 `monthly_fee_krw` 가 «이미 곱해진 최종값» 이므로 읽는 쪽은 아무도 다시 곱하지 않는다
 *    (확정 단계·정기결제 예약이 그 값을 그대로 쓴다).
 *    ⚠️ 등록 «직후» 나가는 카톡·CSV·워드 요약은 화면이 만드는데, 폼에 남아 있는 값은 곱하기 «전»
 *       기준가다. 그래서 서버가 응답에 계산 결과(`fee`)를 함께 실어 주고 화면이 그것을 받아 적는다
 *       (`adm-core.js`). 화면이 스스로 곱해서 맞추면 «두 번 곱하기» 가 된다.
 *    되돌아볼 수 있게 곱하기 «전» 값은 `base_fee_krw` 에 따로 남긴다.
 *
 * ⚠️ 다른 경로는 손대지 않는다 —
 *    · `api-pay.ts` 의 토스 결제 자동활성화: 금액이 이미 `enrollQuoteCalc`(길이배수 포함)을
 *      거친 «실제 결제액» 이다. 여기서 또 곱하면 그대로 과금 사고다.
 *    · `api-mango.ts` 의 시연 시드: 실제 돈이 아니다.
 *
 * ⚠️ 「사람이 적은 값」은 «20분 기준가» 로 본다. 근거 — 「수업 시간」 칸 자체가 2026-08-26 에
 *    처음 생겼고, 그 전 모든 등록은 정책 기본값 20분으로 잡혔다. 즉 그때 적힌 금액은
 *    20분 수업의 값이다. (가져오기 양식에는 지금도 수업 시간 칸이 없다.)
 */
import { DEFAULT_CLASS_MINUTES, classLengthMultiplier, isAllowedClassMinutes } from './class-policy';

/** 10원 절사 — `enrollQuoteCalc` 와 같은 자리에서 끊는다(두 화면의 금액이 어긋나지 않게) */
export function floor10(n: number): number {
  return Math.floor(n / 10) * 10;
}

/** 「월수금」·「Mon,Wed」 → 주 몇 회인가. 못 세면 0 */
export function weeklyCountFromDays(daysOfWeek: any): number {
  const s = String(daysOfWeek == null ? '' : daysOfWeek).trim();
  if (!s) return 0;
  const ko = s.match(/[월화수목금토일]/g);
  if (ko && ko.length) return new Set(ko).size;
  const en = s.match(/mon|tue|wed|thu|fri|sat|sun/gi);
  if (en && en.length) return new Set(en.map((x) => x.toLowerCase())).size;
  return 0;
}

export type FeeInput = {
  /** 사람이 적었거나 가져오기 양식이 실어 온 «20분 기준» 월 수강료. 없으면 null */
  baseFeeKrw?: any;
  /** 고른 수업 시간(분). 모르면 정책 기본값 20분으로 본다 */
  minutes?: any;
  /** 대리점 주1회(=월4회) 단가 — `priceForUid()` 가 준다. 기준가가 없을 때만 쓴다 */
  weekly1Price?: any;
  /** 주 몇 회인가 (요일 수) */
  weekly?: any;
};

export type FeeResult = {
  /** 곱하기 «전» 20분 기준가. 못 정하면 null */
  baseFeeKrw: number | null;
  /** 실제로 저장·청구할 최종 월 수강료. 못 정하면 null */
  monthlyFeeKrw: number | null;
  /** 적용한 수업 시간(분) */
  minutes: number;
  /** 적용한 길이 배수 (20분 1.0 / 30분 1.5 / 40분 2.0) */
  multiplier: number;
  /** 기준가를 어디서 얻었나 — 화면이 사람에게 근거를 보여 줄 때 쓴다 */
  source: 'entered' | 'agency_price' | 'none';
};

/**
 * 월 수강료 = 기준가(20분) × 길이배수 (10원 절사).
 *
 * 기준가는 ① 사람이 적은 값 ② 없으면 «대리점 단가 × 주 횟수» 순으로 정한다.
 * ⛔ 둘 다 없으면 **지어내지 않고 null** 로 둔다 — 이 저장소가 가장 오래 속은 방식이
 *    「측정할 수 없는 값을 그럴듯하게 채우는 것」이었다. 금액은 특히 그렇다.
 *    null 이면 확정 단계가 예전 그대로 「월 수강료가 0원입니다」 로 멈춘다(오늘과 같은 동작).
 */
export function computeMonthlyFee(input: FeeInput): FeeResult {
  const rawMin = Number(input.minutes);
  const minutes = isAllowedClassMinutes(rawMin) ? rawMin : DEFAULT_CLASS_MINUTES;
  const multiplier = classLengthMultiplier(minutes);

  const entered = Number(input.baseFeeKrw);
  let base: number | null = null;
  let source: FeeResult['source'] = 'none';

  if (Number.isFinite(entered) && entered > 0) {
    base = Math.round(entered);
    source = 'entered';
  } else {
    const w1 = Number(input.weekly1Price);
    const weekly = Number(input.weekly);
    if (Number.isFinite(w1) && w1 > 0 && Number.isFinite(weekly) && weekly > 0) {
      base = Math.round(w1 * weekly);
      source = 'agency_price';
    }
  }

  if (base == null) return { baseFeeKrw: null, monthlyFeeKrw: null, minutes, multiplier, source };
  return { baseFeeKrw: base, monthlyFeeKrw: floor10(base * multiplier), minutes, multiplier, source };
}

/** 사람에게 보여 줄 한 줄 근거 — 「20분 기준 60,000원 × 30분(1.5배) = 90,000원」 */
export function feeExplain(r: FeeResult, en = false): string {
  if (r.monthlyFeeKrw == null) {
    return en ? 'no amount (no price set)' : '금액 없음 (기준가가 없습니다)';
  }
  const from = r.source === 'agency_price'
    ? (en ? 'agency rate' : '대리점 단가')
    : (en ? 'entered' : '입력값');
  const b = r.baseFeeKrw!.toLocaleString();
  const f = r.monthlyFeeKrw.toLocaleString();
  return en
    ? `${DEFAULT_CLASS_MINUTES}min base ₩${b} (${from}) × ${r.minutes}min (${r.multiplier}×) = ₩${f}`
    : `${DEFAULT_CLASS_MINUTES}분 기준 ${b}원(${from}) × ${r.minutes}분 ${r.multiplier}배 = ${f}원`;
}
