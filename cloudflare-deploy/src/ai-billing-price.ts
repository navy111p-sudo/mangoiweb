/**
 * ai-billing-price.ts — 학원(B2B) A.i 공급가 계산 «정본» (2026-09-24 신설)
 * ════════════════════════════════════════════════════════════════════════
 *
 * [무엇] 망고아이가 학원에 주는 A.i 학습 공급가(도매가)를 «A.i반 인원» 으로 계산한다.
 *   사장님 공급가 제안서 5안(추천안) — ID당 월 공급가:
 *     71명 이상 4,500원 · 51~70명 5,500원 · 21~50명 6,500원 · 20명 이하 7,500원
 *   정책: 최소 20명분 청구 · 지사 커미션 = 학원 공급가의 40%.
 *
 * [두 가지 보정 — 2026-09-24 사장님 결정]
 *   ① 최소 청구: 20명 이하도 20명분(= 150,000원)을 받는다.
 *   ② 구간 경계 역전 방지: 5안 그대로면 «한 명 더 넣으면 청구액이 줄어든다»
 *      (20명 150,000 → 21명 136,500 / 50명 325,000 → 51명 280,500 / 70명 385,000 → 71명 319,500).
 *      그래서 청구액은 «아래 구간의 최대 금액» 보다 작아지지 않는다(예: 21~23명은 150,000원).
 *      ⟹ 인원이 늘면 청구액은 «절대 줄지 않는다»(하니스가 0~2,000명 전수로 확인).
 *
 * [A.i반 인원] 화상반 학생은 A.i 포함(0원)이라 여기 들어오지 않는다 — 세는 쪽(ai-billing.ts)이
 *   화상 학생을 빼고 넘겨준다. 이 파일은 «몇 명이면 얼마» 만 안다(순수 함수 · D1 없음).
 *
 * [학원별 예외 단가] agency_ai_rate 에 적힌 학원은 구간 대신 그 단가 × 청구 인원(최소 20명분 동일).
 *
 * ⛔ 이 규칙을 화면(JS)에 복제하지 말 것 — 화면은 서버가 계산해 준 금액·설명만 그린다.
 * ⛔ 표를 바꾸면 하니스(test-harness/ai_billing_price_harness.mjs)의 «줄지 않는다» 전수 검사가
 *    새 표로 다시 돈다 — 역전을 만드는 표는 거기서 빨간불이 난다.
 */

export interface AiTier { min: number; rate: number }

/** 5안 — 큰 구간부터. min = 그 구간이 시작하는 인원. */
export const AI_TIERS: readonly AiTier[] = [
  { min: 71, rate: 4500 },
  { min: 51, rate: 5500 },
  { min: 21, rate: 6500 },
  { min: 1,  rate: 7500 },
];

/** 최소 청구 인원 — 이보다 적어도 이 인원분을 받는다. */
export const AI_MIN_BILLABLE = 20;

/** 지사 커미션 — 학원 공급가(청구 총액)의 이 비율. 나머지가 본사 몫. */
export const BRANCH_COMMISSION_PCT = 40;

/** 청구서에 «생성 시점 규칙» 으로 스냅샷해 두는 값 — 나중에 표를 바꿔도 이미 만든 청구서 금액은 안 바뀐다. */
export interface AiPriceRule { tiers: AiTier[]; min: number; pct: number }

export function currentAiPriceRule(): AiPriceRule {
  return { tiers: AI_TIERS.map(t => ({ min: t.min, rate: t.rate })), min: AI_MIN_BILLABLE, pct: BRANCH_COMMISSION_PCT };
}

/** 저장된 JSON 을 규칙으로 되읽는다. 모양이 이상하면 null(부르는 쪽이 옛 방식으로 떨어진다). */
export function parseAiPriceRule(raw: unknown): AiPriceRule | null {
  try {
    const o: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || !Array.isArray(o.tiers) || !o.tiers.length) return null;
    const tiers = o.tiers.map((t: any) => ({ min: Math.floor(Number(t.min)), rate: Math.round(Number(t.rate)) }))
      .filter((t: AiTier) => Number.isFinite(t.min) && t.min >= 1 && Number.isFinite(t.rate) && t.rate > 0)
      .sort((a: AiTier, b: AiTier) => b.min - a.min);
    if (!tiers.length || tiers[tiers.length - 1].min !== 1) return null;   // 1명부터 덮지 못하면 쓸 수 없다
    const min = Math.max(0, Math.floor(Number(o.min) || 0));
    const pct = Number(o.pct);
    return { tiers, min, pct: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : BRANCH_COMMISSION_PCT };
  } catch { return null; }
}

export function tierFor(n: number, tiers: readonly AiTier[] = AI_TIERS): AiTier {
  for (const t of tiers) if (n >= t.min) return t;
  return tiers[tiers.length - 1];
}

/** 구간 단가로 n 명의 청구액(보정 포함). 바로 아래 구간의 «마지막 인원» 금액보다 작아지지 않는다.
 *  ⚠️ «아래 모든 구간 단가 × (경계-1)» 의 최대로 잡으면 안 된다 — 51명 구간의 바닥이
 *     50×7,500=375,000 으로 부풀어 «50명 325,000 → 51명 375,000» 이라는 새 계단이 생긴다.
 *     바닥은 «바로 아래 인원(경계-1)의 실제 청구액» 이다(재귀). */
function tierTotal(n: number, tiers: readonly AiTier[]): number {
  const t = tierFor(n, tiers);
  const raw = n * t.rate;
  return t.min > 1 ? Math.max(raw, tierTotal(t.min - 1, tiers)) : raw;
}

export interface AiPrice {
  /** A.i반 실제 인원 */
  count: number;
  /** 청구 인원(최소 청구 적용) */
  billable: number;
  /** 적용 단가(원/명) */
  rate: number;
  /** 청구 총액(원) */
  total: number;
  /** 'tier' = 인원 구간 단가 · 'custom' = 학원별 예외 단가 · 'none' = 인원 0 */
  basis: 'tier' | 'custom' | 'none';
  /** 구간 이름(예: '21~50명') — custom·none 이면 빈 문자열 */
  tier_label: string;
  /** 최소 청구가 적용됐는가 */
  min_applied: boolean;
  /** 구간 경계 보정(아래 구간 마지막 인원 금액)이 적용됐는가 */
  floor_applied: boolean;
  /** 지사 커미션(원) · 본사 몫(원) — 합 = total */
  branch_commission: number;
  hq_share: number;
  /** 적용한 최소 청구 인원 · 커미션 비율(설명용) */
  min_billable: number;
  commission_pct: number;
}

function tierLabel(t: AiTier, tiers: readonly AiTier[]): string {
  const i = tiers.indexOf(t);
  if (i <= 0) return `${t.min}명 이상`;
  const upper = tiers[i - 1].min - 1;
  return t.min <= 1 ? `${upper}명 이하` : `${t.min}~${upper}명`;
}

/**
 * A.i반 인원(count)으로 청구 금액을 낸다.
 * @param customRate 학원별 예외 단가(원). null/undefined/0 이하면 구간 단가.
 * @param rule 청구서에 스냅샷된 규칙. 없으면 지금 규칙.
 */
export function aiPrice(countIn: number, customRate?: number | null, rule?: AiPriceRule | null): AiPrice {
  const R = rule || currentAiPriceRule();
  const count = Math.max(0, Math.floor(Number(countIn) || 0));
  if (count === 0) {
    return { count: 0, billable: 0, rate: 0, total: 0, basis: 'none', tier_label: '',
      min_applied: false, floor_applied: false, branch_commission: 0, hq_share: 0,
      min_billable: R.min, commission_pct: R.pct };
  }
  const billable = Math.max(count, R.min);
  const min_applied = billable > count;
  const cr = Number(customRate);
  let rate: number, total: number, basis: AiPrice['basis'], label = '', floor_applied = false;
  if (Number.isFinite(cr) && cr > 0) {
    rate = Math.round(cr); total = billable * rate; basis = 'custom';
  } else {
    const t = tierFor(billable, R.tiers);
    rate = t.rate; basis = 'tier'; label = tierLabel(t, R.tiers);
    const raw = billable * rate;
    total = tierTotal(billable, R.tiers);
    floor_applied = total > raw;
  }
  const branch_commission = Math.round(total * R.pct / 100);
  return { count, billable, rate, total, basis, tier_label: label, min_applied, floor_applied,
    branch_commission, hq_share: total - branch_commission, min_billable: R.min, commission_pct: R.pct };
}

/** 사람이 읽는 한 줄 설명 — 화면이 이 글자를 그대로 그린다(규칙을 화면에 복제하지 않기 위해). */
export function aiPriceNote(p: AiPrice): { ko: string; en: string } {
  if (p.basis === 'none') return { ko: 'A.i반 학생이 없습니다', en: 'No A.i-only students' };
  const won = (n: number) => n.toLocaleString('ko-KR') + '원';
  const wonEn = (n: number) => '₩' + n.toLocaleString('en-US');
  const enTier = (l: string) => l.replace('명 이상', '+').replace('명 이하', ' or fewer').replace('명', '');
  const ko: string[] = [], en: string[] = [];
  if (p.basis === 'custom') { ko.push(`학원 지정 단가 ${won(p.rate)}/명`); en.push(`custom rate ${wonEn(p.rate)}/student`); }
  else { ko.push(`${p.tier_label} 구간 ${won(p.rate)}/명`); en.push(`${enTier(p.tier_label)} students tier ${wonEn(p.rate)}/student`); }
  if (p.min_applied) { ko.push(`최소 ${p.min_billable}명분 청구`); en.push(`minimum ${p.min_billable} students billed`); }
  if (p.floor_applied) { ko.push(`구간 경계 보정 ${won(p.total)}`); en.push(`tier-boundary floor ${wonEn(p.total)}`); }
  return { ko: ko.join(' · '), en: en.join(' · ') };
}
