/* ═══════════════════════════════════════════════════════════════════════════
   💳 법인카드(신한) 자동 연동 — CODEF API 경유 (2026-08-13)

   [왜 CODEF 인가] 신한카드는 개별 기업에 거래내역 API 를 직접 열어주지 않는다.
   자동화의 실무 표준은 스크래핑 중개사(CODEF/쿠콘)이고, 여기서는 CODEF 를 쓴다.
   admin.html 「💳 법인카드 사용내역」 카드의 /api/admin/corpcard/* 가 이 모듈을 부른다.

   [키 3개가 없으면 아무 것도 안 한다] — wrangler secret 로 넣는다:
     · CODEF_CLIENT_ID / CODEF_CLIENT_SECRET  (CODEF 콘솔 > 마이페이지 > 키 발급)
     · CODEF_CONNECTED_ID                     (신한카드 기업회원 계정을 CODEF 에 1회 등록하면 발급)
   선택: CODEF_ORG(기본 '0306'=신한카드) · CODEF_CARD_NO(특정 카드만 조회)
         CODEF_API_BASE — 기본 https://api.codef.io(정식). 데모 계정이면
         https://development.codef.io, 샌드박스면 https://sandbox.codef.io.
         ⚠️ 정식이 아닌 두 호스트의 응답은 실제 결제가 아니라 적재하지 않는다(아래 참조)

   ⚠️ 요청/응답 필드명은 CODEF 공식 SDK(easycodef) 계약 기준으로 썼다.
      실키 연결 첫 실행에서 결과가 비면 corpcard_meta.last_sync_result 에 남는
      원문 코드/메시지를 보고 파라미터를 CODEF 콘솔 명세와 대조할 것.
      (응답 데이터는 방어적으로 파싱한다 — 필드명 후보를 여럿 받는다)
   ═══════════════════════════════════════════════════════════════════════════ */

const OAUTH_URL = 'https://oauth.codef.io/oauth/token';
const APPROVAL_PATH = '/v1/kr/card/b/account/approval-list';   // 법인카드 승인내역

/* ── 🏠 호스트: CODEF 는 환경이 «셋» 이다 (2026-08-13 공식 SDK 원문으로 확정) ─────
   easycodef-node `lib/constant.ts` 원문:
     API_DOMAIN      = 'https://api.codef.io'          ← 정식(SERVICE_TYPE_API=0)
     DEMO_DOMAIN     = 'https://development.codef.io'  ← 데모(SERVICE_TYPE_DEMO=1)
     SANDBOX_DOMAIN  = 'https://sandbox.codef.io'      ← 샌드박스(SERVICE_TYPE_SANDBOX=2)
   ⚠️ development 는 sandbox 의 «옛 이름» 이 아니라 **서로 다른 환경**이다.
      (한때 그렇게 착각하고 development → sandbox 로 바꿔치기했었다. 데모 계정을 가진
       사람의 요청이 조용히 샌드박스로 새서 «고정 응답» 을 진짜인 줄 알게 된다.)

   **토큰 등급과 호스트가 짝이 맞아야 한다.** 짝이 틀리면 조회가 통째로 실패한다 —
   2026-08-13 라이브 실측(7개 구간 전부):
     CF-00017 "요청 도메인이 올바르지 않습니다. 해당 토큰은 샌드박스용입니다.
               https://sandbox.codef.io로 요청하세요."

   ⛔ 정식(api)이 아닌 두 호스트의 응답은 **실제 결제가 아니다**
      (샌드박스=고정 응답, 데모=체험용). 회계 테이블에 절대 넣지 않는다
      — 2026-08-07 «가짜 숫자를 띄우지 않는다» 결정과 같은 이유. 자가진단에만 쓴다. */
export const CODEF_PROD_BASE = 'https://api.codef.io';
export const CODEF_DEMO_BASE = 'https://development.codef.io';
export const CODEF_SANDBOX_BASE = 'https://sandbox.codef.io';

/* 🧼 시크릿 소독 — PowerShell 붙여넣기가 제어문자( 등)·CR·공백을 끼워 넣는 사고가
   실제로 났다(2026-08-13: CODEF_API_BASE 가 "" 한 글자로 저장 → fetch 실패,
   Basic 인증에 CR 이 섞이면 OAuth 401). ASCII 인쇄문자만 남기고 다듬는다. */
export const cleanSecret = (v: any): string => String(v ?? '').replace(/[^\x20-\x7E]/g, '').trim();

// 값 노출 없는 지문 — SHA-256 앞 8 hex. «저장된 키 = 손으로 테스트한 키» 대조용(2026-08-13)
export async function secretFp8(v: any): Promise<string> {
  const s = cleanSecret(v);
  if (!s) return '';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
}

function codefCreds(env: any) {
  return {
    clientId: cleanSecret(env.CODEF_CLIENT_ID),
    clientSecret: cleanSecret(env.CODEF_CLIENT_SECRET),
    connectedId: cleanSecret(env.CODEF_CONNECTED_ID),
    apiBase: cleanSecret(env.CODEF_API_BASE),
    org: cleanSecret(env.CODEF_ORG) || '0306',
    cardNo: cleanSecret(env.CODEF_CARD_NO),
  };
}

export function corpcardConfigured(env: any): boolean {
  const c = codefCreds(env);
  return !!(c.clientId && c.clientSecret && c.connectedId);
}

/** 설정된 호스트 + «실데이터 호스트인가». CODEF_API_BASE 가 비었거나 http 가 아니면 정식으로 본다.
 *  sandbox=true 는 «샌드박스 또는 데모» = 실제 결제가 아닌 응답이 오는 호스트라는 뜻이다. */
export function codefBase(env: any): { base: string; sandbox: boolean } {
  let b = codefCreds(env).apiBase;
  if (!/^https:\/\//.test(b)) b = CODEF_PROD_BASE;
  b = b.replace(/\/+$/, '');
  return { base: b, sandbox: b === CODEF_SANDBOX_BASE || b === CODEF_DEMO_BASE };
}

/** 「이 토큰은 샌드박스용」 이라는 CODEF 의 거절(CF-00017). 문구가 바뀌어도 코드로 잡는다. */
export const isSandboxTokenError = (msg: any): boolean =>
  /CF-00017/.test(String(msg || '')) || /샌드박스/.test(String(msg || ''));

export async function ensureTables(env: any): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS corpcard_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, approval_no TEXT UNIQUE, used_at TEXT NOT NULL, card_no TEXT, merchant TEXT, category TEXT, amount INTEGER NOT NULL DEFAULT 0, cancelled INTEGER NOT NULL DEFAULT 0, memo TEXT, raw TEXT, created_at INTEGER NOT NULL);`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_corpcard_used ON corpcard_transactions(used_at)`); } catch {}
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS corpcard_meta (k TEXT PRIMARY KEY, v TEXT);`);
}

export async function metaSet(env: any, k: string, v: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO corpcard_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(k, v).run().catch(() => {});
}
export async function metaGet(env: any, k: string): Promise<string | null> {
  const r: any = await env.DB.prepare(`SELECT v FROM corpcard_meta WHERE k = ?`).bind(k).first().catch(() => null);
  return r ? String(r.v) : null;
}

// ── CODEF OAuth 토큰 (client_credentials). 동기화는 하루 1~2회라 캐시 없이 매번 발급 ──
async function codefToken(env: any): Promise<string> {
  const c = codefCreds(env);
  const basic = btoa(`${c.clientId}:${c.clientSecret}`);
  const r = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=read',
  });
  const text = await r.text();
  let j: any = null; try { j = JSON.parse(text); } catch {}
  // ⚠️ 401 이 Tomcat HTML 로 오는 경우가 있어(로컬 실측) JSON 파싱 실패 시 원문 머리를 남긴다
  if (!r.ok || !j || !j.access_token) {
    throw new Error(`codef_token_failed: HTTP ${r.status} ${(j ? JSON.stringify(j) : text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).slice(0, 180)}`);
  }
  return String(j.access_token);
}

// ── CODEF 호출 — 응답이 URL 인코딩된 JSON 문자열로 온다(공식 SDK 계약). 둘 다 시도 ──
function parseCodefBody(text: string): any {
  try { return JSON.parse(text); } catch {}
  try { return JSON.parse(decodeURIComponent(text.replace(/\+/g, '%20'))); } catch {}
  throw new Error('codef_parse_failed: ' + text.slice(0, 200));
}

async function codefRequest(env: any, path: string, body: any, baseOverride?: string): Promise<any> {
  const token = await codefToken(env);
  const base = baseOverride || codefBase(env).base;
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
/* ⚠️ 업태(StoreBizType)가 함께 들어온다 — 바로빌/신한 실데이터로 확인(2026-08-15).
   가맹점명만 보면 놓치는 것들이 업태로는 잡힌다. 실측에서 「기타」 69% 중 상당수가
   업태만 보면 분류되는 것들이었다:
     편의점 26건 · 식품잡화 8건 · 할인점/슈퍼마켓 2건  → 식대
     정비,세차장,자동차SVC 3건(₩695,000)             → 교통
     모텔,여관,기타숙박 8건(₩440,000)                → 숙박(2026-08-15 신설) */
/* ⚠️ 순서가 곧 우선순위다 — 먼저 걸리는 규칙이 이긴다.
   그래서 «좁은 규칙» 을 «넓은 규칙» 보다 위에 둔다. 실제로 이것 때문에 한 번 꼬였다:
     · 마케팅의 「네이버 광고」 는 장비의 「네이버」 보다 **위**에 있어야 한다.
       아니면 네이버 광고비가 장비로 잡힌다.
     · 장비(네이버·구글·AI 구독)는 통신보다 **위**여야 한다. */
const CAT_RULES: Array<[RegExp, string]> = [
  // 🏨 숙박 — 출장 숙소(2026-08-15 원장님 요청으로 신설). 「기타」에 묻혀 있던 8건 ₩440,000
  [/모텔|여관|호텔|숙박|펜션|리조트|게스트하우스|민박|콘도/i, '숙박'],
  /* 💻 가전 양판점은 «식대보다 위» — 아니면 「롯데하이**마트**」가 식대 규칙의
     「마트」(이마트·홈플러스용)에 먼저 걸려 식대로 샌다. */
  [/하이마트|전자랜드|디지털프라자|베스트샵|테크노마트/i, '장비'],
  [/스타벅스|커피|카페|배달|배민|요기요|쿠팡이츠|맥도날|버거|치킨|피자|김밥|분식|식당|한식|중식|일식|양식|주점|베이커리|제과|음식|외식|레스토랑|편의점|식품잡화|할인점|슈퍼마켓|마트/i, '식대'],
  /* 🚕 교통 — 「하이플러스」는 하이패스 자동충전이다(원장님 확인 2026-08-15).
     ⚠️ 카드사가 「에스엠하이플러스 (주)」의 업태를 **「컴퓨터  소프트웨어」로 잘못** 보낸다.
        그래서 업태만 믿으면 아래 장비 규칙의 「소프트웨어」에 걸려 장비로 샜다(5건 ₩170,000).
        가맹점명 「하이플러스」를 교통에 넣어 **장비보다 위에서** 먼저 잡는다. */
  [/택시|카카오\s*T|모빌리티|주유|칼텍스|에너지|오일|버스|철도|코레일|SRT|항공|주차|톨게이트|하이패스|하이플러스|통행료|렌터카|교통|정비|세차|자동차/i, '교통'],
  /* 📣 마케팅은 반드시 장비보다 **위** — 아니면 「네이버 광고」가 장비로 샌다 */
  [/광고|Ads|애드|마케팅|페이스북|메타|인스타|틱톡|네이버\s*광고|카카오모먼트|홍보/i, '마케팅'],
  /* ☁️ SW구독(SaaS) — «결제를 멈추면 못 쓰는 것». 회계상 자산이 아니라 서비스(지급수수료).
     IFRIC 2021 결론과 같은 선긋기다. 2026-08-15 오후엔 통신 → 장비로 옮겼다가,
     같은 날 「장비랑 구독이 헷갈린다」는 지적을 받아 장비에서 다시 떼어냈다.
     ⚠️ 장비·통신보다 **위**여야 한다. 아래 규칙들이 구글/네이버를 통째로 잡기 때문
     실측 대상: GOOGLE*GOOGLE DIGITAL ₩397,108 · ANTHROPIC* CLAUDE TEAM ₩107,085 · 네이버 ₩108,900 */
  [/AWS|아마존웹|클라우드|Cloudflare|호스팅|Figma|Adobe|어도비|GitHub|Notion|노션|Slack|슬랙|Zoom|Canva|Vercel|Netlify|Linode|DigitalOcean|Midjourney|ElevenLabs|Perplexity|네이버|NAVER|구글|GOOGLE|ANTHROPIC|CLAUDE|OPENAI|CHATGPT|MS\s*365|Microsoft\s*365|오피스\s*365|구독|정기결제|SaaS/i, '구독'],
  /* 💻 장비·비품 — «돈을 안 내도 물건이 남는 것». 하드웨어 + 영구 라이선스.
     ⚠️ 「전자」 단독으로 잡지 않는다 — 업태 「전자상거래(다품목취급)」 가 통째로 걸려서
        법원행정처 등기수수료(₩1,000×3)까지 장비로 샜다. 「전자제품/전자기기」만 잡는다. */
  [/소프트웨어|Microsoft|마이크로소프트|전산|컴퓨터|노트북|모니터|프린터|전자제품|전자기기|가전/i, '장비'],
  /* 📞 통신 — 통신사 회선요금만 남긴다 */
  [/SKT|SK텔레콤|\bKT\b|LG\s*U|유플러스|텔레콤|통신|카카오/i, '통신'],
  [/기프티콘|상품권|선물|경조|화환|회식|복지|복리/i, '복리후생'],
  [/문구|오피스|사무|서적|책|교보문고|영풍문고|다이소|프린트|인쇄|복사/i, '사무용품'],
];
export function categorize(merchant: string, storeType: string): string {
  const s = `${storeType || ''} ${merchant || ''}`;
  for (const [re, cat] of CAT_RULES) if (re.test(s)) return cat;
  return '기타';
}

/* 🌐 해외 가맹점 판정 — 카테고리가 아니라 «표시»다.
   [왜 필요한가] 해외 SaaS 는 세금계산서가 없고 카드전표만 남아 **부가세 매입세액 공제가
   안 되는 경우가 대부분**이다. 국내(네이버 등)는 세금계산서를 받으면 공제된다.
   회계담당이 분기 부가세 신고 때 이 표만 보고 공제분/불공제분을 가를 수 있어야 한다.

   ⛔ 「영문이면 해외」로 판정하지 않는다 — 국내 가맹점도 영문 상호가 흔하다
      (「Microsoft*Store」 는 영문이지만 국내 결제일 수 있고, 「GS25」·「CU」 도 영문이다).
      카드사 데이터에 국가 필드가 없으므로 **아는 것만 켠다.** 모르면 끈다(false).
      새 해외 벤더를 쓰기 시작하면 여기에 한 줄 추가하면 된다. */
const OVERSEAS_RE =
  /GOOGLE|구글|ANTHROPIC|CLAUDE|OPENAI|CHATGPT|\bAWS\b|아마존웹|AMAZON|MICROSOFT|마이크로소프트|ADOBE|어도비|FIGMA|GITHUB|NOTION|SLACK|ZOOM|CANVA|CLOUDFLARE|APPLE|애플|META\s|FACEBOOK|LINODE|VERCEL|NETLIFY|DIGITALOCEAN|MIDJOURNEY|ELEVENLABS|PERPLEXITY|PADDLE|\bSTRIPE\b/i;
export function isOverseas(merchant: string): boolean {
  return OVERSEAS_RE.test(String(merchant || ''));
}

/* ⚠️ 기업업무추진비(구 접대비) 확인 표시 — 세무상 식대는 두 갈래로 갈린다.
     · 직원끼리      → 복리후생비 (전액 손금)
     · 외부인 동석   → 기업업무추진비 (한도 있음, 넘으면 손금불산입)
   가맹점명으로는 구분이 불가능하다. 그래서 «자동 분류하지 않고» 사람이 확인할 건만
   골라 표시한다. 기준은 건당 3만원 초과 — 직원 몇 명 식사로는 잘 안 넘는 선.
   ⛔ 이걸로 카테고리를 바꾸지 않는다. 표시만 한다. 판단은 사람이 한다. */
export const ENTERTAIN_THRESHOLD = 30000;
export function needsEntertainCheck(category: string, amount: number): boolean {
  return category === '식대' && (Number(amount) || 0) > ENTERTAIN_THRESHOLD;
}

const pick = (row: any, keys: string[]): string => {
  for (const k of keys) { const v = row?.[k]; if (v != null && v !== '') return String(v); }
  return '';
};

export function kstToday(): Date { return new Date(Date.now() + 9 * 3600 * 1000); }
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

/* ── 동기화 본체 — 승인내역을 월 단위로 끊어 당겨서 approval_no 로 중복 없이 적재.
      (카드사에 따라 한 번에 조회 가능한 기간이 짧아, 월 단위가 안전하다)
      첫 실행: 최근 6개월. 이후: 마지막 거래일 7일 전부터(취소 반영 여유). ── */
export async function runCorpCardSync(env: any, opts: { base?: string; dryRun?: boolean } = {}): Promise<any> {
  if (!corpcardConfigured(env)) return { ok: false, error: 'codef_not_configured' };
  await ensureTables(env);

  /* 호스트 결정 + 적재 여부. 샌드박스로 조회하면 돌아오는 건 CODEF 의 데모 거래이므로
     **무조건 dryRun**(적재 안 함). 미리보기만 돌려주고 회계 테이블은 건드리지 않는다. */
  const optBase = opts.base ? opts.base.replace(/\/+$/, '') : '';
  const hostSandbox = optBase ? (optBase === CODEF_SANDBOX_BASE || optBase === CODEF_DEMO_BASE) : codefBase(env).sandbox;
  const base = (opts.base || codefBase(env).base).replace(/\/+$/, '');
  const dryRun = opts.dryRun ?? hostSandbox;
  const preview: any[] = [];

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
      const c = codefCreds(env);
      const body: any = {
        connectedId: c.connectedId,
        organization: c.org,                          // 신한카드 = 0306
        startDate: span.s, endDate: span.e,
        orderBy: '0', inquiryType: '0',
      };
      if (c.cardNo) { body.cardNo = c.cardNo; body.inquiryType = '1'; }
      data = await codefRequest(env, APPROVAL_PATH, body, base);
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
      // 🧪 자가진단(샌드박스) — 파싱까지만 확인하고 DB 에는 한 줄도 안 쓴다
      if (dryRun) {
        if (preview.length < 20) {
          preview.push({ datetime: usedAt, merchant, category: categorize(merchant, storeType), amount, cancelled: isCancel ? 1 : 0 });
        }
        if (isCancel) cancelledCnt++;
        continue;
      }
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

  const summary: any = {
    ok: errors.length < spans.length, spans: spans.length, seen, inserted, cancelled: cancelledCnt, errors,
    base, sandbox: hostSandbox, dry_run: dryRun,
    // 🔎 «키는 맞는데 계정이 데모» 인 상태를 한 칸으로 못박는다. 화면이 이걸 그대로 읽는다.
    sandbox_token: errors.some(isSandboxTokenError),
  };
  if (dryRun) summary.preview = preview;
  // 자가진단(dryRun)은 «마지막 동기화» 기록을 덮지 않는다 — 진짜 적재 이력이 지워지면 안 된다
  if (!dryRun) {
    await metaSet(env, 'last_sync_at', String(Date.now()));
    await metaSet(env, 'last_sync_result', JSON.stringify(summary).slice(0, 1500));
  }
  return summary;
}

/* ── 📣 화면에 «지금 무슨 상태인지» 한 줄로 알려 주기 ─────────────────────────────
   [왜 만들었나] 2026-08-13 실측: 시크릿 3개는 제대로 등록돼 있고 OAuth 토큰도 잘 나오는데,
   일일 동기화가 7개 구간 전부 CF-00017(샌드박스 토큰) 로 실패해 D1 적재분이 0건이었다.
   그런데 화면은 «카드사 연동이 아직 되어 있지 않습니다» 라고만 말했다 — 사실과 다르다.
   연동은 돼 있고, 계정이 데모라 조회가 막힌 것이다. 원인이 화면에 안 뜨니 «키를 또 등록»
   하는 헛수고만 반복됐다. 그래서 상태를 코드로 구분해 그대로 내보낸다. ───────────── */
export type CorpcardState = 'ok' | 'not_configured' | 'sandbox_account' | 'sync_error' | 'never_synced' | 'no_data';

/* 🔀 지금 어느 카드사 연동을 쓰는가 (2026-08-14).
   ⚠️ barobill-sync 를 import 하지 않는다 — 그쪽이 이 파일을 import 하므로 순환이 된다.
      값 판정은 네 개가 다 찼는지만 보면 되므로 여기서 직접 읽는다. */
export function corpcardProvider(env: any): 'barobill' | 'codef' | 'none' {
  const has = (v: any) => !!cleanSecret(v);
  if (has(env.BAROBILL_CERTKEY) && has(env.BAROBILL_CORPNUM) && has(env.BAROBILL_ID) && has(env.BAROBILL_CARDNUM)) return 'barobill';
  if (corpcardConfigured(env)) return 'codef';
  return 'none';
}
const BARO_MISSING = (env: any): string[] => {
  const m: string[] = [];
  for (const k of ['BAROBILL_CERTKEY', 'BAROBILL_CORPNUM', 'BAROBILL_ID', 'BAROBILL_CARDNUM'])
    if (!cleanSecret(env[k])) m.push(k);
  return m;
};

export async function corpcardStatus(env: any, data?: any): Promise<any> {
  await ensureTables(env);
  const { base, sandbox } = codefBase(env);
  const provider = corpcardProvider(env);
  const configured = provider !== 'none';
  const lastAtRaw = await metaGet(env, 'last_sync_at');
  const lastResRaw = await metaGet(env, 'last_sync_result');
  let last: any = null; try { last = lastResRaw ? JSON.parse(lastResRaw) : null; } catch {}

  const rowCnt: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM corpcard_transactions WHERE cancelled = 0`).first().catch(() => null);
  const totalRows = Number(rowCnt?.n) || 0;
  const monthRows = data && Array.isArray(data.current) ? data.current.length : null;

  const errText = String((last?.errors || []).join(' | '));
  // 샌드박스 개념은 CODEF 에만 있다. 바로빌로 옮기면 이 판정이 끼어들면 안 된다.
  const sandboxAcct = provider === 'codef'
    && (sandbox || !!last?.sandbox_token || isSandboxTokenError(errText));

  let state: CorpcardState;
  if (!configured) state = 'not_configured';
  else if (sandboxAcct && totalRows === 0) state = 'sandbox_account';
  else if (!lastAtRaw) state = 'never_synced';
  else if (totalRows === 0 && last && !last.ok) state = 'sync_error';
  else if (monthRows === 0) state = 'no_data';
  else state = 'ok';

  const MSG: Record<CorpcardState, [string, string]> = {
    ok: ['카드사 연동 정상. 아래는 실제 결제 내역입니다.',
         'Card sync is healthy — the rows below are real transactions.'],
    not_configured: [
      '카드사 연동 키가 등록되지 않았습니다. 바로빌 시크릿 4개를 등록하면 바로 동작합니다 — 빠진 것: '
      + (BARO_MISSING(env).join(' · ') || '(없음)')
      + '  (값은 Cloudflare 대시보드 → 변수 및 비밀에서 넣고 «배포» 를 눌러야 반영됩니다)',
      'Card provider keys are not registered. Missing BaroBill secrets: ' + (BARO_MISSING(env).join(', ') || '(none)')],
    sandbox_account: [
      '키는 정상 등록됐고 CODEF 로그인도 성공합니다. 다만 지금 키가 «정식(운영) 등급이 아니라» 실제 카드내역 조회가 거부됩니다(CF-00017). '
      + 'CODEF 정식 서비스 신청·승인 후 발급되는 «정식 클라이언트 키» 로 바꾸면 이 화면에 실제 결제가 바로 채워집니다. '
      + '지금 연결 상태만 확인하려면 아래 «연동 자가진단» 을 누르세요(정식이 아닌 응답은 저장하지 않습니다).',
      'Keys are valid and CODEF login succeeds, but they are not production-tier, so real card data is refused (CF-00017). Switch to production CODEF client keys to see real transactions.'],
    sync_error: ['카드사 동기화가 실패했습니다. 아래 오류 원문을 확인하세요.',
                 'Card sync failed — see the raw error below.'],
    never_synced: ['아직 한 번도 동기화하지 않았습니다. «신한 동기화» 를 눌러 주세요.',
                   'No sync has run yet — press “Sync”.'],
    no_data: ['연동은 정상입니다. 선택한 달에는 결제 내역이 없습니다.',
              'Sync is healthy. No transactions for the selected month.'],
  };

  return {
    state, configured, sandbox_account: sandboxAcct,
    provider,                                   // 'barobill' | 'codef' | 'none'
    /* 화면 상단의 카드번호를 실제 설정값으로 맞추기 위한 **끝 4자리만**.
       하드코딩된 «8842» 가 낡아 실제 카드(…3575)와 어긋나 있었다(2026-08-14).
       전체 번호는 절대 내보내지 않는다 — 끝 4자리는 영수증에도 찍히는 수준이다. */
    card_last4: (cleanSecret(env.BAROBILL_CARDNUM) || cleanSecret(env.CODEF_CARD_NO))
      .replace(/\D/g, '').slice(-4) || null,
    base: provider === 'barobill' ? (last?.ws || '바로빌') : base,
    missing: provider === 'none' ? BARO_MISSING(env) : [],
    message_ko: MSG[state][0], message_en: MSG[state][1],
    last_sync_at: lastAtRaw ? Number(lastAtRaw) : null,
    last_error: errText.slice(0, 400) || null,
    rows_total: totalRows, rows_month: monthRows,
  };
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
  const current = (rs.results || []).map((r: any) => {
    const merchant = r.merchant || '';
    const category = r.category || '기타';
    const amount = Number(r.amount) || 0;
    // 🌐/⚠️ 는 DB 에 저장하지 않는다 — 가맹점명에서 그때그때 계산한다.
    //   규칙이 바뀌어도 재동기화 없이 바로 반영되고, 컬럼 추가(마이그레이션)도 필요 없다.
    return {
      id: r.id, datetime: r.used_at, merchant, category, amount, memo: r.memo || '',
      overseas: isOverseas(merchant), entertain: needsEntertainCheck(category, amount),
    };
  });

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
  const lastRes = await metaGet(env, 'last_sync_result');
  return { current, history, month: m, last_sync_at: lastSync ? Number(lastSync) : null, last_sync_result: lastRes || null };
}
