/* ═══════════════════════════════════════════════════════════════════════════
   💳 법인카드(신한) 자동 연동 — 바로빌(BaroBill) 카드조회 API (2026-08-14)

   [왜 바꿨나] CODEF 정식 견적이 **월 80만 원**이었다(2026-08-14 담당자 통화).
   카드 1장 조회에 쓸 금액이 아니다. 바로빌은 **카드 1장당 월 3,300원**
   (콘솔 「서비스별 계약정보」 실측: 카드(승인,1일) 3,300 / 카드(승인,6시간) 5,500).

   [CODEF 와 다른 점 — 이쪽이 더 단순하다]
     · connectedId 가 없다. CERTKEY + 사업자번호 + 아이디 + 카드번호면 끝.
     · 요청할 때 스크래핑하지 않는다. **바로빌이 미리 수집해 자기 DB에 저장**해 두고,
       우리는 그 저장분을 조회만 한다(수집: 1일 주기면 매일 04:00, 카드마다 1~5분 오차).
       → 우리 cron 은 그 이후에 돌아야 한다.

   [설정] wrangler secret / 대시보드 «변수 및 비밀» 에 넣는다:
     · BAROBILL_CERTKEY   연동인증키(50자). ⚠️ **운영용**과 테스트용이 따로 발급된다.
     · BAROBILL_CORPNUM   바로빌 회원사 사업자번호(하이픈 제외 10자리)
     · BAROBILL_ID        바로빌 회원 아이디
     · BAROBILL_CARDNUM   조회할 카드번호(하이픈 제외)
     선택: BAROBILL_WS_BASE  SOAP 엔드포인트 (아래 «미확인» 참조)
           BAROBILL_SOAP_NS  SOAP 네임스페이스

   ⚠️⚠️ 아직 문서로 확인하지 못한 것 — 이 둘만 맞으면 나머지는 검증된 스펙이다.
      ① 엔드포인트 URL  ② SOAP 네임스페이스
      개발자센터 「API 가이드 → 시작하기 → 개발준비」 에 있다. 접속이 막혀 확인 못 했다.
      그래서 **둘 다 시크릿으로 덮어쓸 수 있게** 해 두었고, 값이 틀리면 화면이
      「접속 주소를 확인해야 합니다」 라고 사실대로 말한다(조용히 0건이 되지 않는다).

   [검증된 스펙 — 개발자센터 원문 캡처 기준]
     GetApprovalHistories(CERTKEY, CorpNum, ID, CardNum, StartDate, EndDate,
                          CountPerPage, CurrentPage, OrderDirection)
       · StartDate~EndDate 는 **최대 200일**  · CountPerPage 최대 100
       · 반환 PagedCardApprovalHistories { CurrentPage, CountPerPage, MaxPageNum,
                                           MaxIndex, Histories: CardApprovalHistory[] }
       · **CurrentPage 가 음수면 실패**(오류코드), 양수면 성공
     CardApprovalHistory {
       CorpNum, CardNum, CardName, HistoryKey(카드 당 고유키), ApprovalType(승인/취소/
       부분취소/거절/환불), ApprovalNum, ApprovalDT(YYYYMMDDHHMMSS), ApprovalAmount,
       ForeignApprovalAmount, Amount, Tax, ServiceCharge, CurrencyCode,
       StoreNum, StoreCorpNum, StoreName, StoreCeo, StoreAddr, StoreBizType, StoreTel }
       ⚠️ Store* 는 전부 **필수 X** — "카드사 사이트에서 제공되는 경우에만 조회됩니다".
          신한카드가 상점명을 주는지는 실제로 받아봐야 안다. 비면 승인번호로 대체한다.
   ═══════════════════════════════════════════════════════════════════════════ */

import { cleanSecret, ensureTables, metaSet, categorize, kstToday } from './corpcard-sync';
import { xmlFirst, parseApprovalXml, soapEnvelope, soapAction, BAROBILL_NS } from './barobill-parse';
export { baroDT, baroKind, baroRow, parseApprovalXml, xmlFirst, xmlBlocks, xmlUnescape } from './barobill-parse';

/* 📍 접속 주소 — 「직접 HTTP 통신을 구현하는 방법」 원문에서 확인한 것:
     · 호스트: 테스트 testws.baroservice.com / **운영 ws.baroservice.com**
     · 경로  : 서비스마다 다르다. 세금계산서 예시가 `/TI.asmx` 였다.
   ⚠️ 카드조회의 경로(`/CARD.asmx`)만 아직 원문으로 확인하지 못했다.
      「카드조회 API 운영환경 통신규격 바로가기」 를 열면 확정된다.
      틀려도 BAROBILL_WS_BASE 시크릿으로 덮어쓰면 되고, 그때 화면에 HTTP 404 원문과
      접속 주소가 그대로 뜨므로 «조용히 0건» 이 되지 않는다. */
export const BAROBILL_DEFAULT_WS = 'https://ws.baroservice.com/CARD.asmx';

export function baroCreds(env: any) {
  const digits = (v: any) => cleanSecret(v).replace(/\D/g, '');
  return {
    certKey: cleanSecret(env.BAROBILL_CERTKEY),
    corpNum: digits(env.BAROBILL_CORPNUM),
    id: cleanSecret(env.BAROBILL_ID),
    cardNum: digits(env.BAROBILL_CARDNUM),
    ws: cleanSecret(env.BAROBILL_WS_BASE) || BAROBILL_DEFAULT_WS,
    ns: cleanSecret(env.BAROBILL_SOAP_NS) || BAROBILL_NS,
  };
}

/** 네 값이 다 있어야 조회가 된다. 하나라도 비면 화면이 «무엇이 비었는지» 를 말한다. */
export function barobillConfigured(env: any): boolean {
  const c = baroCreds(env);
  return !!(c.certKey && c.corpNum && c.id && c.cardNum);
}

/** 어느 값이 비었는지 — 값은 절대 노출하지 않고 이름만. (지난번 «키가 없다» 오진 재발 방지) */
export function baroMissing(env: any): string[] {
  const c = baroCreds(env);
  const out: string[] = [];
  if (!c.certKey) out.push('BAROBILL_CERTKEY');
  if (!c.corpNum) out.push('BAROBILL_CORPNUM');
  if (!c.id) out.push('BAROBILL_ID');
  if (!c.cardNum) out.push('BAROBILL_CARDNUM');
  return out;
}


/* ── 📮 SOAP 호출 ─────────────────────────────────────────────────────────
   바로빌은 ASMX(SOAP 1.1) 계열이다. 파라미터 «순서» 가 문서 표와 같아야 한다. */
async function baroCall(env: any, method: string, args: Array<[string, any]>): Promise<string> {
  const c = baroCreds(env);
  const r = await fetch(c.ws, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      // SOAPAction = 네임스페이스 + 메서드명. 호스트 기반으로 보내면 서버가 거절한다(라이브 실측)
      'SOAPAction': `"${soapAction(c.ws, method, c.ns)}"`,
    },
    body: soapEnvelope(method, args, c.ns),
  });
  const text = await r.text();
  if (!r.ok) {
    /* HTML 오류 페이지가 오는 경우가 있어(엔드포인트가 틀렸을 때) 태그를 걷어내고 머리만 남긴다.
       이 문구가 그대로 화면에 뜨므로 «조용히 0건» 이 되지 않는다. */
    const head = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new Error(`barobill_http_${r.status}: ${head || '(본문 없음)'} @ ${c.ws}`);
  }
  const fault = xmlFirst(text, 'faultstring');
  if (fault) throw new Error(`barobill_soap_fault: ${fault.slice(0, 200)}`);
  return text;
}


/** 한 페이지 조회. 실패는 CurrentPage 음수로 온다(문서 규약). */
async function fetchPage(env: any, start: string, end: string, page: number) {
  const c = baroCreds(env);
  const xml = await baroCall(env, 'GetApprovalHistories', [
    ['CERTKEY', c.certKey], ['CorpNum', c.corpNum], ['ID', c.id], ['CardNum', c.cardNum],
    ['StartDate', start], ['EndDate', end],
    ['CountPerPage', 100], ['CurrentPage', page], ['OrderDirection', 1],
  ]);
  const p = parseApprovalXml(xml);
  // 문서 규약: CurrentPage 가 음수면 실패(=오류코드). 0/누락도 정상 응답이 아니다.
  if (!(p.currentPage > 0)) {
    throw new Error(`barobill_error ${p.currentPage || '(CurrentPage 없음)'}: 조회 실패 — 오류코드는 개발자센터 「바로빌 API 오류코드」 참조`);
  }
  return p;
}

/* ── 🔁 동기화 본체 ────────────────────────────────────────────────────────
   기간 제한이 **200일**이라 구간을 180일씩 끊는다(경계 여유).
   첫 실행은 최근 6개월, 이후는 마지막 거래일 7일 전부터(취소가 뒤늦게 반영되므로). */
export async function runBarobillSync(env: any, opts: { dryRun?: boolean } = {}): Promise<any> {
  const missing = baroMissing(env);
  if (missing.length) return { ok: false, error: 'barobill_not_configured', missing };
  await ensureTables(env);
  const dryRun = !!opts.dryRun;
  const preview: any[] = [];

  const today = kstToday();
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  let from = new Date(today.getTime() - 180 * 86400000);
  const last: any = await env.DB.prepare(`SELECT MAX(used_at) AS m FROM corpcard_transactions`).first().catch(() => null);
  if (last && last.m) {
    const cand = new Date(new Date(String(last.m).slice(0, 10) + 'T00:00:00Z').getTime() - 7 * 86400000);
    if (cand > from) from = cand;
  }

  const spans: Array<{ s: string; e: string }> = [];
  for (let cur = new Date(from); cur <= today;) {
    const end = new Date(Math.min(cur.getTime() + 179 * 86400000, today.getTime()));
    spans.push({ s: ymd(cur), e: ymd(end) });
    cur = new Date(end.getTime() + 86400000);
  }

  let seen = 0, inserted = 0, cancelledCnt = 0, pages = 0;
  /* ApprovalType 별 건수를 남긴다. 「취소가 원거래와 «별도 행» 으로 오는가, 아니면 원거래
     자체가 취소로 바뀌는가」 를 문서로 확인하지 못했다 — 실데이터를 한 번 받아 이 집계를
     보고 확정한다. 그때까지는 취소·거절을 합계에서 빼는 쪽(아래 baroRow)으로 둔다. */
  const kindCount: Record<string, number> = {};
  const errors: string[] = [];
  const now = Date.now();

  for (const span of spans) {
    let page = 1, maxPage = 1;
    do {
      let res;
      try { res = await fetchPage(env, span.s, span.e, page); }
      catch (e: any) { errors.push(`${span.s}~${span.e} p${page}: ${String(e?.message || e).slice(0, 300)}`); break; }
      maxPage = res.maxPage; pages++;
      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows[i];
        if (!row.usedAt || !row.key.replace('|', '')) continue;   // 날짜·키가 없으면 못 쓴다
        seen++;
        kindCount[row.kind] = (kindCount[row.kind] || 0) + 1;
        if (dryRun) { if (preview.length < 20) preview.push(row); continue; }
        if (row.kind !== 'approve') cancelledCnt++;
        // 분류는 여기서 붙인다 — 업태(StoreBizType)가 있으면 가맹점명만 볼 때보다 정확하다
        const category = categorize(row.merchant, row.bizType);
        const r: any = await env.DB.prepare(
          `INSERT OR IGNORE INTO corpcard_transactions (approval_no, used_at, card_no, merchant, category, amount, cancelled, raw, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(row.key, row.usedAt, row.cardNo, row.merchant, category, row.amount, row.cancelled,
          JSON.stringify(res.raw[i]).slice(0, 2000), now).run().catch(() => null);
        if (r && r.meta?.changes > 0) inserted++;
      }
      page++;
    } while (page <= maxPage && page <= 200);   // 200 = 폭주 방지 상한
  }

  const summary: any = {
    ok: errors.length < spans.length, provider: 'barobill',
    spans: spans.length, pages, seen, inserted, cancelled: cancelledCnt, errors,
    kinds: kindCount,                    // 승인/취소/부분취소/거절 건수 — 취소 처리 방식 확정용
    ws: baroCreds(env).ws, dry_run: dryRun,
  };
  if (dryRun) summary.preview = preview;
  if (!dryRun) {
    await metaSet(env, 'last_sync_at', String(Date.now()));
    await metaSet(env, 'last_sync_result', JSON.stringify(summary).slice(0, 1500));
    await metaSet(env, 'provider', 'barobill');
  }
  return summary;
}
