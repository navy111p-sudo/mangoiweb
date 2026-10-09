/**
 * 매일보고 ↔ 결재 길 안내 (2026-10-09 사장님 「매일보고와 결재가 헷갈린다 — AI 가 판단해서 정리」).
 *
 * 기준 한 줄: «누가 결정·승인해야 하면 결재, 알리기만 하면 매일보고».
 *
 * 이 모듈은 매일보고 본문에서 «결재로 올려야 할 것 같은 줄» 을 골라 «제안» 만 한다.
 *   ⛔ 자동으로 옮기거나 제출하지 않는다 — 사람이 [결재로 옮기기] 를 눌러야 결재 폼이 열린다.
 *   ⛔ AI 가 «지어낸 줄» 은 받지 않는다 — 원문에 실제로 있는 줄만 통과(verifyLine).
 *   ✅ 돈·휴가·급여는 AI 보다 먼저 «정해진 규칙» 으로 잡는다(AI 가 놓쳐도 남는다).
 *   ✅ 이미 결재를 올렸다고 적힌 줄은 건너뛴다(「휴가 결재 올림」 을 다시 올리라 하지 않게).
 * 종류는 approval-policy.ts TYPES 의 key 와 같아야 한다 — 화면이 /work?type=<key> 로 넘긴다.
 */

export type RouteType = 'purchase' | 'expense' | 'leave' | 'hr';
export const ROUTE_TYPES: readonly RouteType[] = ['purchase', 'expense', 'leave', 'hr'];

export interface ApprovalHint {
  line: string;            // 원문 그대로의 한 줄
  type: RouteType;
  reason_ko: string;
  reason_en: string;
  amount: number | null;   // 읽어 낸 금액(모르면 null — 지어내지 않는다)
  currency: 'PHP' | 'KRW' | null;
  source: 'rule' | 'ai';
}

const REASON: Record<RouteType, [string, string]> = {
  purchase: ['돈을 써서 물건을 사야 해서 구입 승인이 필요합니다', 'Buying something needs purchase approval'],
  expense:  ['이미 쓴 돈을 돌려받으려면 지출 정산 결재가 필요합니다', 'Getting paid back needs an expense claim'],
  leave:    ['쉬는 날은 허락이 필요해서 휴가 신청 결재가 필요합니다', 'Time off needs approval'],
  hr:       ['인사·급여는 결정이 필요한 일이라 결재로 올려야 합니다', 'HR and pay matters need a decision'],
};

/** 이미 결재로 처리했다고 적힌 줄 — 다시 권하지 않는다 */
const DONE_RE = /(결재|승인|품의)\s*(를|을)?\s*(올림|올렸|요청함|요청했|완료|받음|받았|됨|났)|approv(ed|al\s+(sent|submitted|requested))|already\s+(submitted|filed)|submitted\s+(a\s+)?(request|claim)/i;

/** 금액: ₱1,200 / PHP 1200 / 1,200페소 / 12,000원 / 3만원 / ₩5000 / 1,200 pesos */
export function parseAmount(line: string): { amount: number; currency: 'PHP' | 'KRW' } | null {
  const s = String(line || '');
  const num = (t: string) => Number(t.replace(/,/g, ''));
  let m = s.match(/(?:₱|php)\s*([\d,]+(?:\.\d+)?)/i);
  if (m && num(m[1]) > 0) return { amount: num(m[1]), currency: 'PHP' };
  m = s.match(/([\d,]+(?:\.\d+)?)\s*(?:페소|pesos?|php)\b/i) || s.match(/([\d,]+(?:\.\d+)?)\s*페소/);
  if (m && num(m[1]) > 0) return { amount: num(m[1]), currency: 'PHP' };
  m = s.match(/([\d,]+(?:\.\d+)?)\s*만\s*원/);
  if (m && num(m[1]) > 0) return { amount: Math.round(num(m[1]) * 10000), currency: 'KRW' };
  m = s.match(/(?:₩|krw)\s*([\d,]+)/i) || s.match(/([\d,]+)\s*(?:원|krw)(?:(?=에|으로|짜리|정도|어치|씩|이|을|은)|(?![가-힣]))/i);
  if (m && num(m[1]) > 0) return { amount: num(m[1]), currency: 'KRW' };
  return null;
}

const LEAVE_RE = /(휴가|연차|반차|월차|병가|조퇴|결근|day\s*off|days\s*off|leave\b|vacation|sick\s*leave|absent\s+(on|tomorrow|next))/i;
const HR_RE = /(급여|월급|임금|채용|해고|퇴사|사직|계약\s*(연장|해지)|salary|payroll|raise\b|hire|hiring|resign|termination|contract\s+(renewal|extension))/i;
const BUY_RE = /(구입|구매|사야|살\s*예정|주문|교체\s*필요|buy|purchase|order\b|need\s+to\s+get|replace)/i;
const PAID_RE = /(정산|환급|대신\s*(냄|결제|지불)|자비|사비|영수증|reimburse|paid\s+(for|out\s+of)|out\s+of\s+pocket|receipt|refund\s+me)/i;

const INCOME_RE = /(입금|수납|결제\s*(됨|완료|받)|결제를?\s*받|(학생|학부모|부모님?).{0,12}결제|received\s+payment|payment\s+(from|received)|paid\s+by\s+(the\s+)?(student|parent))/i;
/** 학생·학부모 이야기 — 직원 휴가가 아니다(「학생 조퇴함」) */
const STUDENT_RE = /(학생|학부모|아이가|student|parent|kid)/i;

/** 한 줄을 규칙으로 판정 — 모르면 null(지어내지 않는다) */
export function ruleTypeOf(line: string): RouteType | null {
  const s = String(line || '');
  if (!s.trim() || DONE_RE.test(s)) return null;
  const money = parseAmount(s);
  if (LEAVE_RE.test(s)) return STUDENT_RE.test(s) ? null : 'leave';
  if (HR_RE.test(s)) return 'hr';
  if (INCOME_RE.test(s)) return null;      // 학생 결제를 «받은» 것은 매출 — 결재가 아니다(지출 정산보다 먼저 본다)
  if (PAID_RE.test(s) && (money || /영수증|receipt/i.test(s))) return 'expense';
  if (BUY_RE.test(s) && money) return 'purchase';
  // 금액만 있고 «사야 한다/내가 냈다» 가 없으면 모른다 — 지어내지 않는다(AI 가 볼 몫).
  return null;
}

/** 본문을 줄 단위로 — 머리기호를 벗기고 빈 줄은 버린다 */
export function linesOf(text: string): string[] {
  return String(text || '').split(/\r?\n|[;•]/)
    .map(l => l.replace(/^\s*(?:[-*·•]|\d+[.)])\s*/, '').trim())   // 머리기호·번호만 — 「1,200페소」의 숫자는 벗기지 않는다
    .filter(l => l.length >= 2);
}

function norm(s: string): string { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

/** AI 가 준 줄이 원문 줄 중 하나와 맞는가 — 맞으면 «원문» 줄을 돌려준다(AI 표기 아님) */
export function verifyLine(aiLine: string, lines: string[]): string | null {
  const a = norm(aiLine);
  if (a.length < 2) return null;
  for (const l of lines) { const n = norm(l); if (n === a || n.includes(a) || (a.includes(n) && n.length >= 6)) return l; }
  return null;
}

export interface HandoverText { work?: string; issue?: string; open?: string; no_issue?: boolean; no_open?: boolean }

function hint(line: string, type: RouteType, source: 'rule' | 'ai'): ApprovalHint {
  const m = (type === 'purchase' || type === 'expense') ? parseAmount(line) : null;
  return { line, type, reason_ko: REASON[type][0], reason_en: REASON[type][1],
    amount: m ? m.amount : null, currency: m ? m.currency : null, source };
}

/**
 * 규칙 판정 + (있으면) AI 판정을 합친다. 같은 줄은 한 번만 — 규칙이 이긴다.
 * aiItems 는 모델이 준 [{line,type}] — 모르는 종류·원문에 없는 줄·이미 처리된 줄은 버린다.
 */
export function approvalHints(d: HandoverText, aiItems?: unknown, allowed?: (t: RouteType) => boolean): ApprovalHint[] {
  const lines = [
    ...linesOf(d.work || ''),
    ...(d.no_issue ? [] : linesOf(d.issue || '')),
    ...(d.no_open ? [] : linesOf(d.open || '')),
  ];
  const out: ApprovalHint[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    const t = ruleTypeOf(l);
    if (t && !seen.has(norm(l))) { seen.add(norm(l)); out.push(hint(l, t, 'rule')); }
  }
  if (Array.isArray(aiItems)) {
    for (const it of aiItems.slice(0, 10)) {
      const type = String((it as any)?.type || '').toLowerCase() as RouteType;
      if (!ROUTE_TYPES.includes(type)) continue;
      const line = verifyLine(String((it as any)?.line || ''), lines);
      if (!line || DONE_RE.test(line) || seen.has(norm(line))) continue;
      seen.add(norm(line)); out.push(hint(line, type, 'ai'));
    }
  }
  // 이 계정이 올릴 수 없는 분류는 빼다(«보이는데 못 쓰는 버튼» 금지). 판정이 던지면 그 분류만 뺀다.
  const can = (t: RouteType) => { if (!allowed) return true; try { return !!allowed(t); } catch { return false; } };
  return out.filter(h => can(h.type)).slice(0, 5);
}

/** AI 프롬프트에 덧붙이는 규칙 — 기존 정리 JSON 에 approval 칸 하나를 더한다 */
export const APPROVAL_PROMPT_RULE =
  'Also add "approval": a list (max 3) of {"line": exact text copied from the input, "type": one of purchase|expense|leave|hr} ' +
  'for items that need a manager decision instead of a report: buying something (purchase), being paid back for money already spent (expense), ' +
  'time off (leave), pay or hiring matters (hr). Only include an item if the input clearly asks for it; skip items already approved or submitted. Use [] when none.';
