/* ═══════════════════════════════════════════════════════════════════════════
   💳 법인카드(신한) 자동 연동 — CODEF API 경유 (2026-08-13)

   [왜 CODEF 인가] 신한카드는 개별 기업에 거래내역 API 를 직접 열어주지 않는다.
   자동화의 실무 표준은 스크래핑 중개사(CODEF/쿠콘)이고, 여기서는 CODEF 를 쓴다.
   admin.html 「💳 법인카드 사용내역」 카드의 /api/admin/corpcard/* 가 이 모듈을 부른다.

   [키 3개가 없으면 아무 것도 안 한다] — wrangler secret 로 넣는다:
     · CODEF_CLIENT_ID / CODEF_CLIENT_SECRET  (CODEF 콘솔 > 마이페이지 > 키 발급)
     · CODEF_CONNECTED_ID                     (신한카드 기업회원 계정을 CODEF 에 1회 등록하면 발급)
   선택: CODEF_ORG(기본 '0306'=신한카드) · CODEF_API_BASE(기본 https://api.codef.io,
         개발 계정이면 https://development.codef.io) · CODEF_CARD_NO(특정 카드만 조회)

   ⚠️ 요청/응답 필드명은 CODEF 공식 SDK(easycodef) 계약 기준으로 썼다.
      실키 연결 첫 실행에서 결과가 비면 corpcard_meta.last_sync_result 에 남는
      원문 코드/메시지를 보고 파라미터를 CODEF 콘솔 명세와 대조할 것.
      (응답 데이터는 방어적으로 파싱한다 — 필드명 후보를 여럿 받는다)
   ═══════════════════════════════════════════════════════════════════════════ */

const OAUTH_URL = 'https://oauth.codef.io/oauth/token';
const APPROVAL_PATH = '/v1/kr/card/b/account/approval-list';   // 법인카드 승인내역

export function corpcardConfigured(env: any): boolean {
  return !!(env.CODEF_CLIENT_ID && env.CODEF_CLIENT_SECRET && env.CODEF_CONNECTED_ID);
}

async function ensureTables(env: any): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS corpcard_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, approval_no TEXT UNIQUE, used_at TEXT NOT NULL, card_no TEXT, merchant TEXT, category TEXT, amount INTEGER NOT NULL DEFAULT 0, cancelled INTEGER NOT NULL DEFAULT 0, memo TEXT, raw TEXT, created_at INTEGER NOT NULL);`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_corpcard_used ON corpcard_transactions(used_at)`); } catch {}
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS corpcard_meta (k TEXT PRIMARY KEY, v TEXT);`);
}

async function metaSet(env: any, k: string, v: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO corpcard_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(k, v).run().catch(() => {});
}
async function metaGet(env: any, k: string): Promise<string | null> {
  const r: any = await env.DB.prepare(`SELECT v FROM corpcard_meta WHERE k = ?`).bind(k).first().catch(() => null);
  return r ? String(r.v) : null;
}

// ── CODEF OAuth 토큰 (client_credentials). 동기화는 하루 1~2회라 캐시 없이 매번 발급 ──
async function codefToken(env: any): Promise<string> {
  const basic = btoa(`${env.CODEF_CLIENT_ID}:${env.CODEF_CLIENT_SECRET}`);
  const r = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=read',
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) throw new Error(`codef_token_failed: HTTP ${r.status} ${JSON.stringify(j || {}).slice(0, 200)}`);
  return String(j.access_token);
}

// ── CODEF 호출 — 응답이 URL 인코딩된 JSON 문자열로 온다(공식 SDK 계약). 둘 다 시도 ──
function parseCodefBody(text: string): any {
  try { return JSON.parse(text); } catch {}
  try { return JSON.parse(decodeURIComponent(text.replace(/\+/g, '%20'))); } catch {}
  throw new Error('codef_parse_failed: ' + text.slice(0, 200));
}

async function codefRequest(env: any, path: string, body: any): Promise<any> {
  const token = await codefToken(env);
  const base = String(env.CODEF_API_BASE || 'https://api.codef.io').replace(/\/$/, '');
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  const j = parseCodefBody(text);
  const code = j?.result?.code || '';
  if (code !== 'CF-00000') {
    // CF-12xxx 등 — 원문 코드·메시지를 그대로 올려 meta 에 남긴다(진단용)
    throw new Error(`codef_error ${code}: ${String(j?.result?.message || '').slice(0, 200)}`);
  }
  return j.data;
}

// ── 업종/가맹점명 → 화면 8분류 (adm-core.js CARD_CATEGORIES 와 같은 키) ──
const CAT_RULES: Array<[RegExp, string]> = [
  [/스타벅스|커피|카페|배달|배민|요기요|쿠팡이츠|맥도날|버거|치킨|피자|김밥|분식|식당|한식|중식|일식|양식|주점|베이커리|제과|음식|외식|레스토랑/i, '식대'],
  [/택시|카카오\s*T|모빌리티|주유|칼텍스|에너지|오일|버스|철도|코레일|SRT|항공|주차|톨게이트|하이패스|렌터카|교통/i, '교통'],
  [/SKT|SK텔레콤|\bKT\b|LG\s*U|유플러스|텔레콤|통신/i, '통신'],
  [/광고|Ads|애드|마케팅|페이스북|메타|인스타|틱톡|네이버\s*광고|카카오모먼트|홍보/i, '마케팅'],
  [/AWS|아마존웹|클라우드|Cloudflare|호스팅|소프트웨어|Figma|Adobe|어도비|Microsoft|마이크로소프트|구글\s*클라우드|GitHub|전산|컴퓨터|노트북|전자/i, '장비'],
  [/기프티콘|상품권|선물|경조|화환|회식|복지|복리/i, '복리후생'],
  [/문구|오피스|사무|서적|책|교보문고|영풍문고|다이소|프린트|인쇄|복사/i, '사무용품'],
];
function categorize(merchant: string, storeType: string): string {
  const s = `${storeType || ''} ${merchant || ''}`;
  for (const [re, cat] of CAT_RULES) if (re.test(s)) return cat;
  return '기타';
}

const pick = (row: any, keys: string[]): string => {
  for (const k of keys) { const v = row?.[k]; if (v != null && v !== '') return String(v); }
  return '';
};

function kstToday(): Date { return new Date(Date.now() + 9 * 3600 * 1000); }
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

/* ── 동기화 본체 — 승인내역을 월 단위로 끊어 당겨서 approval_no 로 중복 없이 적재.
      (카드사에 따라 한 번에 조회 가능한 기간이 짧아, 월 단위가 안전하다)
      첫 실행: 최근 6개월. 이후: 마지막 거래일 7일 전부터(취소 반영 여유). ── */
export async function runCorpCardSync(env: any): Promise<any> {
  if (!corpcardConfigured(env)) return { ok: false, error: 'codef_not_configured' };
  await ensureTables(env);

  const today = kstToday();
  let from = new Date(today.getTime() - 180 * 86400000);
  const last: any = await env.DB.prepare(`SELECT MAX(used_at) AS m FROM corpcard_transactions`).first().catch(() => null);
  if (last && last.m) {
    const lastD = new Date(String(last.m).slice(0, 10) + 'T00:00:00Z');
    const cand = new Date(lastD.getTime() - 7 * 86400000);
    if (cand > from) from = cand;
  }

  // 월 경계로 자른 구간 목록
  const spans: Array<{ s: string; e: string }> = [];
  let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (cur <= today) {
    const monthEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const end = monthEnd < today ? monthEnd : today;
    spans.push({ s: ymd(cur), e: ymd(end) });
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }

  let inserted = 0, seen = 0, cancelledCnt = 0;
  const errors: string[] = [];
  for (const span of spans) {
    let data: any;
    try {
      const body: any = {
        connectedId: env.CODEF_CONNECTED_ID,
        organization: env.CODEF_ORG || '0306',        // 신한카드
        startDate: span.s, endDate: span.e,
        orderBy: '0', inquiryType: '0',
      };
      if (env.CODEF_CARD_NO) { body.cardNo = env.CODEF_CARD_NO; body.inquiryType = '1'; }
      data = await codefRequest(env, APPROVAL_PATH, body);
    } catch (e: any) {
      errors.push(`${span.s}~${span.e}: ${String(e?.message || e).slice(0, 300)}`);
      continue;
    }
    // 응답 모양 방어: data 가 배열이거나, 목록 필드를 품은 객체거나
    const rows: any[] = Array.isArray(data) ? data
      : Array.isArray(data?.resApprovalList) ? data.resApprovalList
      : Array.isArray(data?.resCardApprovalList) ? data.resCardApprovalList
      : Array.isArray(data?.list) ? data.list : (data ? [data] : []);
    for (const row of rows) {
      const apNo = pick(row, ['resApprovalNo', 'approvalNo', 'resApprovalNumber']);
      const d8 = pick(row, ['resUsedDate', 'usedDate', 'resApprovalDate']).replace(/\D/g, '').slice(0, 8);
      if (!d8) continue;
      const t6 = pick(row, ['resUsedTime', 'usedTime', 'resApprovalTime']).replace(/\D/g, '').padEnd(4, '0');
      const usedAt = `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)} ${t6.slice(0, 2)}:${t6.slice(2, 4)}`;
      const merchant = pick(row, ['resMemberStoreName', 'memberStoreName', 'resStoreName', 'merchantName']);
      const storeType = pick(row, ['resMemberStoreType', 'memberStoreType', 'resStoreType']);
      const amount = parseInt(pick(row, ['resUsedAmount', 'usedAmount', 'resApprovalAmount', 'amount']).replace(/[^\d-]/g, ''), 10) || 0;
      const cardNo = pick(row, ['resCardNo', 'cardNo', 'resCardNumber']);
      const cancelYn = pick(row, ['resCancelYN', 'cancelYN', 'resCancelYn']);
      const status = pick(row, ['resApprovalStatus', 'approvalStatus']);
      const isCancel = cancelYn === '1' || /Y/i.test(cancelYn) || /취소/.test(status);
      // 승인번호가 없는 카드사 대비 — 일시+금액+가맹점으로 준식별키를 만든다
      const key = apNo || `${usedAt}|${amount}|${merchant}`.slice(0, 120);
      seen++;
      const now = Date.now();
      if (isCancel) {
        // 취소 승인: 원거래가 있으면 취소 표시, 없으면 취소 행으로 적재(합계에서 제외됨)
        const upd: any = await env.DB.prepare(`UPDATE corpcard_transactions SET cancelled = 1 WHERE approval_no = ?`).bind(key).run().catch(() => null);
        if (!upd || !(upd.meta?.changes > 0)) {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO corpcard_transactions (approval_no, used_at, card_no, merchant, category, amount, cancelled, raw, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
          ).bind(key, usedAt, cardNo, merchant, categorize(merchant, storeType), amount, JSON.stringify(row).slice(0, 2000), now).run().catch(() => {});
        }
        cancelledCnt++;
        continue;
      }
      const r: any = await env.DB.prepare(
        `INSERT OR IGNORE INTO corpcard_transactions (approval_no, used_at, card_no, merchant, category, amount, cancelled, raw, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).bind(key, usedAt, cardNo, merchant, categorize(merchant, storeType), amount, JSON.stringify(row).slice(0, 2000), now).run().catch(() => null);
      if (r && r.meta?.changes > 0) inserted++;
    }
  }

  const summary = { ok: errors.length < spans.length, spans: spans.length, seen, inserted, cancelled: cancelledCnt, errors };
  await metaSet(env, 'last_sync_at', String(Date.now()));
  await metaSet(env, 'last_sync_result', JSON.stringify(summary).slice(0, 1500));
  return summary;
}

/* ── 화면(adm-core.js)이 기대하는 모양으로 꺼내기:
      { current: [{id, datetime, merchant, category, amount, memo}], history: {'YYYY-MM': 합계} } ── */
export async function corpcardData(env: any, month?: string): Promise<any> {
  await ensureTables(env);
  const nowKst = kstToday().toISOString().slice(0, 7);
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : nowKst;

  const rs: any = await env.DB.prepare(
    `SELECT id, used_at, merchant, category, amount, memo FROM corpcard_transactions
      WHERE cancelled = 0 AND substr(used_at, 1, 7) = ? ORDER BY used_at`
  ).bind(m).all().catch(() => ({ results: [] }));
  const current = (rs.results || []).map((r: any) => ({
    id: r.id, datetime: r.used_at, merchant: r.merchant || '', category: r.category || '기타',
    amount: Number(r.amount) || 0, memo: r.memo || '',
  }));

  // 조회 월 포함 최근 6개월 — 값이 없는 달도 0 으로 채운다(전월/3개월 평균 계산이 흔들리지 않게)
  const history: Record<string, number> = {};
  const [y, mo] = m.split('-').map((x) => parseInt(x, 10));
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, mo - 1 - i, 1));
    history[d.toISOString().slice(0, 7)] = 0;
  }
  const hs: any = await env.DB.prepare(
    `SELECT substr(used_at, 1, 7) AS ym, SUM(amount) AS total FROM corpcard_transactions
      WHERE cancelled = 0 GROUP BY substr(used_at, 1, 7)`
  ).all().catch(() => ({ results: [] }));
  for (const r of (hs.results || [])) if (r.ym in history) history[r.ym] = Number(r.total) || 0;

  const lastSync = await metaGet(env, 'last_sync_at');
  return { current, history, month: m, last_sync_at: lastSync ? Number(lastSync) : null };
}
