/* ═══════════════════════════════════════════════════════════════════════════
   💳 바로빌 카드 승인내역 — 순수 파싱/변환 (2026-08-14)

   [왜 파일을 나눴나] 이 안에는 **네트워크도 DB도 없다.** 순수 함수만 둔다.
   그래야 회귀 하니스(test-harness/barobill_parse_harness.mjs)가 이 파일을 그대로
   import 해서 **실제 코드**를 검증할 수 있다. 사본을 따로 만들어 검사하면 원본이
   바뀌어도 초록불이 유지된다 — 그건 검사가 아니다.
   ⚠️ 그래서 이 파일은 다른 모듈을 import 하지 않는다. 의존이 생기면 하니스가 깨진다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── 🧩 XML 최소 파서 ───────────────────────────────────────────────────────
   Workers 에는 DOMParser 가 없다(브라우저 전용). 정규식으로 필요한 것만 꺼낸다.
   ⚠️ 범용 XML 파서가 아니다 — 바로빌 응답처럼 «평평한 필드의 반복» 에만 쓴다. */
export function xmlUnescape(s: string): string {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&');   // ⚠️ 반드시 마지막 — 먼저 풀면 &amp;lt; 가 < 로 잘못 풀린다
}

/** 첫 번째 <tag>…</tag> 의 속. 네임스페이스 접두사(ns:tag)도 함께 잡는다. */
export function xmlFirst(xml: string, tag: string): string {
  const m = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`).exec(xml || '');
  return m ? xmlUnescape(m[1]) : '';
}

/** 같은 이름의 블록 전부 (원문 그대로 — 안에서 다시 xmlFirst 로 파낸다) */
export function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'g');
  const out: string[] = []; let m: RegExpExecArray | null;
  while ((m = re.exec(xml || '')) !== null) out.push(m[1]);
  return out;
}

export const xmlEscape = (v: any): string => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── 💱 값 변환 ───────────────────────────────────────────────────────────── */

/** ApprovalDT(YYYYMMDDHHMMSS) → 'YYYY-MM-DD HH:MM'. 짧게 와도 날짜까지는 살린다. */
export function baroDT(v: string): string {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length < 8) return '';
  const t = d.padEnd(14, '0');
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)} ${t.slice(8, 10)}:${t.slice(10, 12)}`;
}

/* ApprovalType(승인/취소/부분취소/거절/환불) 을 회계적으로 어떻게 다룰 것인가.
   [원칙] 이번 달 사용액이 실제 지출과 어긋나면 안 된다.
     · 승인      → 그대로 적립(+)
     · 거절      → 애초에 결제가 안 된 것 → 합계에서 제외
     · 취소/환불 → 되돌린 것 → 합계에서 제외
     · 부분취소  → 일부만 돌려받은 것. 원거래를 통째로 지우면 과소계상, 그냥 두면
                  과대계상이다 → **음수 금액**으로 적립해 합계에서 정확히 차감한다
   ⚠️ 「부분취소」 검사가 「취소」보다 **먼저** 와야 한다. 순서를 바꾸면 부분취소가
      취소로 먹혀 원거래 전체가 빠진다(= 지출이 실제보다 적게 보인다). */
export type BaroKind = 'approve' | 'reject' | 'cancel' | 'partial';
export function baroKind(approvalType: string): BaroKind {
  const t = String(approvalType || '');
  if (/부분\s*취소/.test(t)) return 'partial';
  if (/취소|환불/.test(t)) return 'cancel';
  if (/거절|거부|실패/.test(t)) return 'reject';
  return 'approve';
}

export interface BaroRow {
  key: string; usedAt: string; cardNo: string; merchant: string;
  bizType: string; amount: number; cancelled: 0 | 1; kind: BaroKind; approvalNum: string;
}

/** 응답 한 건 → 우리 DB 행의 재료. 분류(category)는 부르는 쪽이 붙인다(여기는 의존 없음). */
export function baroRow(h: Record<string, string>): BaroRow {
  const kind = baroKind(h.ApprovalType);
  const amtRaw = parseInt(String(h.ApprovalAmount || '0').replace(/[^\d-]/g, ''), 10) || 0;
  const amount = kind === 'partial' ? -Math.abs(amtRaw) : Math.abs(amtRaw);
  /* Store* 는 문서상 «카드사가 제공하는 경우에만» 온다(필수 X). 가맹점명이 비면
     상점번호 → 승인번호 순으로 대체한다. 빈칸으로 두면 화면에서 «어디서 썼는지 모르는
     지출» 이 되어 회계 확인 자체가 불가능해진다. */
  const merchant = h.StoreName || h.StoreNum || (h.ApprovalNum ? `승인 ${h.ApprovalNum}` : '');
  return {
    // 중복 방지 키 — 문서 지정: 「카드번호(CardNum) + 내역키(HistoryKey)」 조합
    key: `${h.CardNum || ''}|${h.HistoryKey || ''}`,
    usedAt: baroDT(h.ApprovalDT),
    cardNo: h.CardNum || '',
    merchant,
    bizType: h.StoreBizType || '',
    amount,
    cancelled: (kind === 'cancel' || kind === 'reject') ? 1 : 0,
    kind,
    approvalNum: h.ApprovalNum || '',
  };
}

/** CardApprovalHistory 에서 뽑아 쓰는 필드 (문서 4.17 원문 순서) */
export const BARO_FIELDS = ['CorpNum', 'CardNum', 'CardName', 'HistoryKey', 'ApprovalType',
  'ApprovalNum', 'ApprovalDT', 'ApprovalAmount', 'ForeignApprovalAmount', 'Amount', 'Tax',
  'ServiceCharge', 'CurrencyCode', 'StoreNum', 'StoreCorpNum', 'StoreName', 'StoreCeo',
  'StoreAddr', 'StoreBizType', 'StoreTel'];

/** SOAP 응답 XML → 승인내역 행 목록 + 페이징 정보. CurrentPage 가 음수면 실패(문서 규약). */
export function parseApprovalXml(xml: string): { currentPage: number; maxPage: number; rows: BaroRow[]; raw: Record<string, string>[] } {
  const currentPage = parseInt(xmlFirst(xml, 'CurrentPage') || '0', 10) || 0;
  const maxPage = parseInt(xmlFirst(xml, 'MaxPageNum') || '1', 10) || 1;
  const raw = xmlBlocks(xml, 'CardApprovalHistory').map((b) => {
    const o: Record<string, string> = {};
    for (const f of BARO_FIELDS) o[f] = xmlFirst(b, f);
    return o;
  });
  return { currentPage, maxPage, rows: raw.map(baroRow), raw };
}
