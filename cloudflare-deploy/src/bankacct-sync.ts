/* ═══════════════════════════════════════════════════════════════════════════
   🏦 신한은행 계좌 입출금 자동 연동 — 바로빌(BaroBill) 계좌조회 API (2026-08-14)

   [왜 만들었나] 법인카드 승인내역(barobill-sync.ts)만으로는 회사 지출의 반쪽이다.
   급여 이체·임대료·공과금처럼 **계좌에서 바로 나가는 돈**이 회계 화면에 안 잡혔다.
   이 모듈이 계좌 거래내역(입금·출금)을 D1 `bankacct_transactions` 에 적재하고,
   손익계산서(accounting-reports.ts)가 출금분을 실지출로 읽는다.

   [카드 연동과 같은 골격] SOAP(ASMX) + CERTKEY 인증 + 페이지 조회 + INSERT OR IGNORE.
   바로빌이 미리 수집해 둔 것을 조회만 한다 — 수집 주기는 계약에 따르며(카드는 1일),
   계좌 등록 «다음 수집 시각» 이후에야 데이터가 생긴다. 0건이라도 오류가 아닐 수 있다.

   [설정] wrangler secret / 대시보드 «변수 및 비밀»:
     · BAROBILL_CERTKEY / BAROBILL_CORPNUM / BAROBILL_ID   (카드 연동과 공유)
     · BAROBILL_BANK_ACCTNUM   조회할 계좌번호(하이픈 제외) — 이것만 새로 넣으면 켜진다
     선택: BAROBILL_BANK_WS_BASE  SOAP 엔드포인트 (기본 …/BANKACCOUNT.asmx)
           BAROBILL_BANK_METHOD   조회 메서드명 (기본 GetPeriodBankAccountLogEx)
           BAROBILL_SOAP_NS       네임스페이스 (카드와 공유)

   ⚠️⚠️ 아직 문서 원문으로 확인하지 못한 것 — 카드 때(/CARD.asmx)와 같은 상황이다.
      ① 엔드포인트 경로(/BANKACCOUNT.asmx)  ② 메서드명·파라미터 순서
      카드의 GetApprovalHistories(CERTKEY, CorpNum, ID, CardNum, Start, End,
      CountPerPage, CurrentPage, OrderDirection) 와 같은 꼴로 짰고, 둘 다 시크릿으로
      덮어쓸 수 있다. 틀리면 HTTP 404 / SOAP fault 원문이 화면에 그대로 뜬다
      (조용히 0건이 되지 않는다 — 카드 연동과 같은 원칙).
   ═══════════════════════════════════════════════════════════════════════════ */

import { cleanSecret, metaSet, metaGet, kstToday } from './corpcard-sync';
import { xmlFirst, parseBankLogXml, soapEnvelope, soapAction, BAROBILL_NS } from './barobill-parse';

export const BANK_DEFAULT_WS = 'https://ws.baroservice.com/BANKACCOUNT.asmx';
export const BANK_DEFAULT_METHOD = 'GetPeriodBankAccountLogEx';

export function bankCreds(env: any) {
  const digits = (v: any) => cleanSecret(v).replace(/\D/g, '');
  return {
    certKey: cleanSecret(env.BAROBILL_CERTKEY),
    corpNum: digits(env.BAROBILL_CORPNUM),
    id: cleanSecret(env.BAROBILL_ID),
    acctNum: digits(env.BAROBILL_BANK_ACCTNUM),
    ws: cleanSecret(env.BAROBILL_BANK_WS_BASE) || BANK_DEFAULT_WS,
    method: cleanSecret(env.BAROBILL_BANK_METHOD) || BANK_DEFAULT_METHOD,
    ns: cleanSecret(env.BAROBILL_SOAP_NS) || BAROBILL_NS,
  };
}

export function bankConfigured(env: any): boolean {
  const c = bankCreds(env);
  return !!(c.certKey && c.corpNum && c.id && c.acctNum);
}

/** 어느 값이 비었는지 — 값은 절대 노출하지 않고 이름만 (카드 연동과 같은 원칙). */
export function bankMissing(env: any): string[] {
  const c = bankCreds(env);
  const out: string[] = [];
  if (!c.certKey) out.push('BAROBILL_CERTKEY');
  if (!c.corpNum) out.push('BAROBILL_CORPNUM');
  if (!c.id) out.push('BAROBILL_ID');
  if (!c.acctNum) out.push('BAROBILL_BANK_ACCTNUM');
  return out;
}

export async function ensureBankTables(env: any): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS bankacct_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, trans_key TEXT UNIQUE, trans_at TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'out', amount INTEGER NOT NULL DEFAULT 0, balance INTEGER NOT NULL DEFAULT 0, remark TEXT, category TEXT, memo TEXT, raw TEXT, created_at INTEGER NOT NULL);`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_bankacct_at ON bankacct_transactions(trans_at)`); } catch {}
  // meta 는 카드와 같은 corpcard_meta 를 bank_ 접두사 키로 같이 쓴다(테이블 난립 방지)
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS corpcard_meta (k TEXT PRIMARY KEY, v TEXT);`);
}

/* ── 🏷️ 출금 적요 → 지출 분류 ────────────────────────────────────────────────
   손익계산서가 이 분류로 «이중계상 제외» 를 판정한다:
     · 급여이체 → 강사급여(payslips)와 겹침  · 카드대금 → 법인카드 지출과 겹침
   둘 다 화면에는 보여 주되 판관비 합계에서는 뺀다. ⚠️ 순서 중요 — 급여가 카드보다 먼저. */
const BANK_CAT_RULES: Array<[RegExp, string]> = [
  [/급여|월급|급료|봉급|상여|수당|퇴직|PAYROLL|SALARY/i, '급여이체'],
  [/카드대금|카드결제|신한카드|비씨카드|BC카드|국민카드|삼성카드|현대카드|롯데카드|하나카드|우리카드/, '카드대금'],
  [/임대|월세|관리비|보증금/, '임대·관리비'],
  [/부가세|국세|지방세|세금|공과|국민연금|건강보험|고용보험|산재|4대보험/, '세금·보험'],
  [/전기|가스|수도|통신|KT|SKT|LGU|유플러스|인터넷/i, '공과금·통신'],
  [/이자|대출|원리금|상환/, '금융비용'],
];
export function bankCategorize(kind: 'in' | 'out', remark: string): string {
  if (kind === 'in') return '입금';
  const s = String(remark || '');
  for (const [re, cat] of BANK_CAT_RULES) if (re.test(s)) return cat;
  return '기타출금';
}

/* ── 📮 SOAP 호출 — barobill-sync.baroCall 과 같은 골격(엔드포인트·메서드만 다름) ── */
async function bankCall(env: any, args: Array<[string, any]>): Promise<string> {
  const c = bankCreds(env);
  const r = await fetch(c.ws, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"${soapAction(c.ws, c.method, c.ns)}"`,
    },
    body: soapEnvelope(c.method, args, c.ns),
  });
  const text = await r.text();
  if (!r.ok) {
    const head = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new Error(`bankacct_http_${r.status}: ${head || '(본문 없음)'} @ ${c.ws} [${c.method}]`);
  }
  const fault = xmlFirst(text, 'faultstring');
  if (fault) throw new Error(`bankacct_soap_fault: ${fault.slice(0, 200)} [${c.method}]`);
  return text;
}

/** 한 페이지 조회. 실패는 CurrentPage 음수로 온다(카드와 같은 규약). */
async function fetchBankPage(env: any, start: string, end: string, page: number) {
  const c = bankCreds(env);
  const xml = await bankCall(env, [
    ['CERTKEY', c.certKey], ['CorpNum', c.corpNum], ['ID', c.id], ['BankAccountNum', c.acctNum],
    ['StartDate', start], ['EndDate', end],
    ['CountPerPage', 100], ['CurrentPage', page], ['OrderDirection', 1],
  ]);
  const p = parseBankLogXml(xml);
  if (!(p.currentPage > 0)) {
    throw new Error(`bankacct_error ${p.currentPage || '(CurrentPage 없음)'}: 조회 실패 — 오류코드는 개발자센터 「바로빌 API 오류코드」 참조`);
  }
  return p;
}

/* ── 🔁 동기화 본체 — 카드(180일)보다 보수적으로 90일씩 끊는다(계좌 조회기간 한도 미확인).
      첫 실행: 최근 6개월. 이후: 마지막 거래일 7일 전부터(정정 거래 여유). ── */
export async function runBankSync(env: any, opts: { dryRun?: boolean } = {}): Promise<any> {
  const missing = bankMissing(env);
  if (missing.length) return { ok: false, error: 'bankacct_not_configured', missing };
  await ensureBankTables(env);
  const dryRun = !!opts.dryRun;
  const preview: any[] = [];

  const today = kstToday();
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  let from = new Date(today.getTime() - 180 * 86400000);
  const last: any = await env.DB.prepare(`SELECT MAX(trans_at) AS m FROM bankacct_transactions`).first().catch(() => null);
  if (last && last.m) {
    const cand = new Date(new Date(String(last.m).slice(0, 10) + 'T00:00:00Z').getTime() - 7 * 86400000);
    if (cand > from) from = cand;
  }

  const spans: Array<{ s: string; e: string }> = [];
  for (let cur = new Date(from); cur <= today;) {
    const end = new Date(Math.min(cur.getTime() + 89 * 86400000, today.getTime()));
    spans.push({ s: ymd(cur), e: ymd(end) });
    cur = new Date(end.getTime() + 86400000);
  }

  let seen = 0, inserted = 0, deposits = 0, withdrawals = 0, pages = 0;
  const errors: string[] = [];
  const now = Date.now();

  for (const span of spans) {
    let page = 1, maxPage = 1;
    do {
      let res;
      try { res = await fetchBankPage(env, span.s, span.e, page); }
      catch (e: any) { errors.push(`${span.s}~${span.e} p${page}: ${String(e?.message || e).slice(0, 300)}`); break; }
      maxPage = res.maxPage; pages++;
      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows[i];
        if (!row.transAt || !row.key.replace(/\|/g, '')) continue;   // 날짜·키가 없으면 못 쓴다
        if (!row.amount) continue;                                    // 0원 거래(메모성 행)는 버린다
        seen++;
        if (row.kind === 'out') withdrawals++; else deposits++;
        const category = bankCategorize(row.kind, row.remark);
        if (dryRun) { if (preview.length < 20) preview.push({ ...row, category }); continue; }
        const r: any = await env.DB.prepare(
          `INSERT OR IGNORE INTO bankacct_transactions (trans_key, trans_at, kind, amount, balance, remark, category, raw, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(row.key, row.transAt, row.kind, row.amount, row.balance, row.remark, category,
          JSON.stringify(res.raw[i]).slice(0, 2000), now).run().catch(() => null);
        if (r && r.meta?.changes > 0) inserted++;
      }
      page++;
    } while (page <= maxPage && page <= 200);   // 200 = 폭주 방지 상한 (카드와 동일)
  }

  const summary: any = {
    ok: errors.length < spans.length, provider: 'barobill-bank',
    spans: spans.length, pages, seen, inserted, deposits, withdrawals, errors,
    ws: bankCreds(env).ws, method: bankCreds(env).method, dry_run: dryRun,
  };
  if (dryRun) summary.preview = preview;
  if (!dryRun) {
    await metaSet(env, 'bank_last_sync_at', String(Date.now()));
    await metaSet(env, 'bank_last_sync_result', JSON.stringify(summary).slice(0, 1500));
  }
  return summary;
}

/* ── 📣 상태 한 줄 — 카드의 corpcardStatus 와 같은 목적: «지금 무슨 상태인지» 를
      사실대로 화면에 말한다(«조용히 0건» 금지). ── */
export type BankState = 'ok' | 'not_configured' | 'sync_error' | 'never_synced' | 'no_data';

export async function bankacctStatus(env: any, data?: any): Promise<any> {
  await ensureBankTables(env);
  const configured = bankConfigured(env);
  const lastAtRaw = await metaGet(env, 'bank_last_sync_at');
  const lastResRaw = await metaGet(env, 'bank_last_sync_result');
  let last: any = null; try { last = lastResRaw ? JSON.parse(lastResRaw) : null; } catch {}

  const rowCnt: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM bankacct_transactions`).first().catch(() => null);
  const totalRows = Number(rowCnt?.n) || 0;
  const monthRows = data && Array.isArray(data.current) ? data.current.length : null;
  const errText = String((last?.errors || []).join(' | '));

  let state: BankState;
  if (!configured) state = 'not_configured';
  else if (!lastAtRaw) state = 'never_synced';
  else if (totalRows === 0 && last && !last.ok) state = 'sync_error';
  else if (totalRows === 0 || monthRows === 0) state = 'no_data';
  else state = 'ok';

  const MSG: Record<BankState, [string, string]> = {
    ok: ['계좌 연동 정상. 아래는 실제 입출금 내역입니다.',
         'Bank sync is healthy — the rows below are real transactions.'],
    not_configured: [
      '계좌 연동이 꺼져 있습니다. BAROBILL_BANK_ACCTNUM(계좌번호) 시크릿을 등록하면 켜집니다 — 빠진 것: '
      + (bankMissing(env).join(' · ') || '(없음)')
      + '  (값은 Cloudflare 대시보드 → 변수 및 비밀에서 넣고 «배포» 를 눌러야 반영됩니다)',
      'Bank sync is off. Missing secrets: ' + (bankMissing(env).join(', ') || '(none)')],
    sync_error: ['계좌 동기화가 실패했습니다. 아래 오류 원문을 확인하세요.',
                 'Bank sync failed — see the raw error below.'],
    never_synced: ['아직 한 번도 동기화하지 않았습니다. «신한 동기화» 를 눌러 주세요.',
                   'No sync has run yet — press “Sync”.'],
    no_data: ['연동은 정상입니다. 조회 구간에 거래가 없거나, 바로빌이 아직 이 계좌를 수집하지 않았습니다(계좌 등록 다음 수집 주기부터 쌓입니다).',
              'Sync is healthy. No transactions yet — BaroBill may not have collected this account yet.'],
  };

  return {
    state, configured,
    missing: configured ? [] : bankMissing(env),
    ws: bankCreds(env).ws, method: bankCreds(env).method,
    message_ko: MSG[state][0], message_en: MSG[state][1],
    last_sync_at: lastAtRaw ? Number(lastAtRaw) : null,
    last_error: errText.slice(0, 400) || null,
    rows_total: totalRows, rows_month: monthRows,
  };
}

/* ── 화면·리포트가 쓰는 모양 — corpcardData 와 같은 골격:
      { current: [{id, datetime, kind, remark, category, amount, balance, memo}],
        history: {'YYYY-MM': {in, out}} } ── */
export async function bankacctData(env: any, month?: string): Promise<any> {
  await ensureBankTables(env);
  const nowKst = kstToday().toISOString().slice(0, 7);
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : nowKst;

  const rs: any = await env.DB.prepare(
    `SELECT id, trans_at, kind, amount, balance, remark, category, memo FROM bankacct_transactions
      WHERE substr(trans_at, 1, 7) = ? ORDER BY trans_at`
  ).bind(m).all().catch(() => ({ results: [] }));
  const current = (rs.results || []).map((r: any) => ({
    id: r.id, datetime: r.trans_at, kind: r.kind, remark: r.remark || '',
    category: r.category || (r.kind === 'in' ? '입금' : '기타출금'),
    amount: Number(r.amount) || 0, balance: Number(r.balance) || 0, memo: r.memo || '',
  }));

  // 조회 월 포함 최근 6개월 — 빈 달도 0 으로 (카드 history 와 같은 이유)
  const history: Record<string, { in: number; out: number }> = {};
  const [y, mo] = m.split('-').map((x) => parseInt(x, 10));
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, mo - 1 - i, 1));
    history[d.toISOString().slice(0, 7)] = { in: 0, out: 0 };
  }
  const hs: any = await env.DB.prepare(
    `SELECT substr(trans_at, 1, 7) AS ym, kind, SUM(amount) AS total FROM bankacct_transactions
      GROUP BY substr(trans_at, 1, 7), kind`
  ).all().catch(() => ({ results: [] }));
  for (const r of (hs.results || [])) {
    if (r.ym in history) history[r.ym][r.kind === 'in' ? 'in' : 'out'] = Number(r.total) || 0;
  }

  const lastSync = await metaGet(env, 'bank_last_sync_at');
  const lastRes = await metaGet(env, 'bank_last_sync_result');
  return { current, history, month: m, last_sync_at: lastSync ? Number(lastSync) : null, last_sync_result: lastRes || null };
}
