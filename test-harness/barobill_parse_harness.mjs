// barobill_parse_harness.mjs — 💳 바로빌 카드 승인내역 파싱·금액 가드 (2026-08-14)
//
//   [배경] CODEF 정식 견적이 월 80만 원이라 바로빌(카드 1장 월 3,300원)로 옮긴다.
//   바로빌은 SOAP(XML) 이라 응답을 직접 파싱해야 한다 — Workers 에는 DOMParser 가 없다.
//
//   이 하니스는 **실제 모듈(src/barobill-parse.ts)을 그대로 import** 해서 검사한다.
//   사본을 따로 만들어 검사하면 원본이 바뀌어도 초록불이 유지된다 — 그건 검사가 아니다.
//
//   지키는 것 — 깨지면 «회계 숫자가 조용히 틀리는» 지점들:
//     ① 취소·부분취소·거절이 사용액에 잘못 반영되지 않는다
//        (특히 「부분취소」를 「취소」로 먹으면 원거래 전체가 빠져 지출이 적게 보인다)
//     ② 같은 결제가 두 번 적재되지 않는다 (중복키 = 카드번호 + 내역키, 문서 지정)
//     ③ 가맹점명이 비어도 «어디서 썼는지 모르는 지출» 이 되지 않는다
//        (Store* 는 문서상 필수 X — "카드사가 제공하는 경우에만")
//     ④ 실패 응답(CurrentPage 음수)을 성공으로 읽지 않는다

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const M = await import('file://' + resolve(__dir, '../cloudflare-deploy/src/barobill-parse.ts').replace(/\\/g, '/'));

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}
const eq = (name, got, want) => check(`${name} = ${JSON.stringify(want)}`, got === want, `실제 ${JSON.stringify(got)}`);

console.log('════════ 💳 바로빌 승인내역 파싱 가드 ════════');

/* 실제 응답을 흉내낸 SOAP XML — 네임스페이스 접두사·CDATA·엔티티를 일부러 섞었다 */
const XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
<GetApprovalHistoriesResponse xmlns="http://www.baroservice.com/">
 <GetApprovalHistoriesResult>
  <CurrentPage>1</CurrentPage><CountPerPage>100</CountPerPage>
  <MaxPageNum>2</MaxPageNum><MaxIndex>150</MaxIndex>
  <Histories>
   <CardApprovalHistory>
    <CorpNum>1348630816</CorpNum><CardNum>1234567890128842</CardNum><CardName>신한 법인</CardName>
    <HistoryKey>HK0001</HistoryKey><ApprovalType>승인</ApprovalType><ApprovalNum>12345678</ApprovalNum>
    <ApprovalDT>20260812143005</ApprovalDT><ApprovalAmount>67000</ApprovalAmount>
    <StoreName><![CDATA[스타벅스 강남R점]]></StoreName><StoreBizType>일반음식점</StoreBizType>
   </CardApprovalHistory>
   <CardApprovalHistory>
    <CardNum>1234567890128842</CardNum><HistoryKey>HK0002</HistoryKey>
    <ApprovalType>부분취소</ApprovalType><ApprovalNum>12345679</ApprovalNum>
    <ApprovalDT>20260813090000</ApprovalDT><ApprovalAmount>20000</ApprovalAmount>
    <StoreName>길동상사 &amp; 파트너</StoreName><StoreBizType>도소매</StoreBizType>
   </CardApprovalHistory>
   <CardApprovalHistory>
    <CardNum>1234567890128842</CardNum><HistoryKey>HK0003</HistoryKey>
    <ApprovalType>취소</ApprovalType><ApprovalNum>12345680</ApprovalNum>
    <ApprovalDT>20260813110000</ApprovalDT><ApprovalAmount>15000</ApprovalAmount>
    <StoreName>카카오T 택시</StoreName><StoreBizType>운수업</StoreBizType>
   </CardApprovalHistory>
   <CardApprovalHistory>
    <CardNum>1234567890128842</CardNum><HistoryKey>HK0004</HistoryKey>
    <ApprovalType>거절</ApprovalType><ApprovalNum>12345681</ApprovalNum>
    <ApprovalDT>20260813120000</ApprovalDT><ApprovalAmount>9000</ApprovalAmount>
   </CardApprovalHistory>
  </Histories>
 </GetApprovalHistoriesResult>
</GetApprovalHistoriesResponse></soap:Body></soap:Envelope>`;

const p = M.parseApprovalXml(XML);

/* ── 파싱 기본 ─────────────────────────────────────────────────────────── */
eq('① CurrentPage', p.currentPage, 1);
eq('① MaxPageNum', p.maxPage, 2);
eq('① 승인내역 건수', p.rows.length, 4);
check('① 네임스페이스 접두사(soap:)가 있어도 파싱된다', p.currentPage === 1);
eq('① CDATA 가 풀린다', p.rows[0].merchant, '스타벅스 강남R점');
eq('① &amp; 엔티티가 풀린다', p.rows[1].merchant, '길동상사 & 파트너');

/* ── 날짜 ──────────────────────────────────────────────────────────────── */
eq('② ApprovalDT 14자리 → 화면 표기', M.baroDT('20260812143005'), '2026-08-12 14:30');
eq('② 8자리만 와도 날짜는 살린다', M.baroDT('20260812'), '2026-08-12 00:00');
eq('② 값이 없으면 빈 문자열', M.baroDT(''), '');

/* ── ① 승인형태 → 회계 처리 (제일 중요) ──────────────────────────────────── */
eq('③ 승인', M.baroKind('승인'), 'approve');
eq('③ 취소', M.baroKind('취소'), 'cancel');
eq('③ 환불', M.baroKind('환불'), 'cancel');
eq('③ 거절', M.baroKind('거절'), 'reject');
check('③ 「부분취소」가 「취소」로 먹히지 않는다', M.baroKind('부분취소') === 'partial',
  '순서가 뒤바뀌면 원거래 전체가 빠져 지출이 실제보다 적게 보인다');
check('③ 「부분 취소」(공백) 도 부분취소로 본다', M.baroKind('부분 취소') === 'partial');

const [approve, partial, cancel, reject] = p.rows;
eq('④ 승인 금액은 양수', approve.amount, 67000);
eq('④ 승인은 합계에 포함(cancelled=0)', approve.cancelled, 0);
check('④ 부분취소는 음수로 차감된다', partial.amount === -20000, `실제 ${partial.amount}`);
eq('④ 부분취소는 제외되지 않는다(cancelled=0)', partial.cancelled, 0);
eq('④ 취소는 합계에서 제외(cancelled=1)', cancel.cancelled, 1);
eq('④ 거절은 합계에서 제외(cancelled=1)', reject.cancelled, 1);

// 합계가 실제 지출과 맞는가 — cancelled=0 인 것만 더한다(화면 쿼리와 같은 규칙)
const total = p.rows.filter((r) => r.cancelled === 0).reduce((s, r) => s + r.amount, 0);
eq('④ 이번 달 사용액 = 67,000 − 20,000', total, 47000);

/* ── ② 중복키 ─────────────────────────────────────────────────────────── */
eq('⑤ 중복키 = 카드번호|내역키', approve.key, '1234567890128842|HK0001');
check('⑤ 건마다 키가 다르다', new Set(p.rows.map((r) => r.key)).size === 4);

/* ── ③ 가맹점명이 비는 경우 ────────────────────────────────────────────── */
eq('⑥ 상점명이 없으면 승인번호로 대체', reject.merchant, '승인 12345681');
check('⑥ 상점명이 비어도 빈칸으로 두지 않는다', reject.merchant.length > 0,
  '빈칸이면 «어디서 썼는지 모르는 지출» 이 되어 회계 확인이 불가능하다');
eq('⑥ 업태를 그대로 넘긴다(분류에 쓰인다)', approve.bizType, '일반음식점');

/* ── ④ 실패 응답 ──────────────────────────────────────────────────────── */
const failXml = '<Envelope><CurrentPage>-12345</CurrentPage><MaxPageNum>0</MaxPageNum></Envelope>';
check('⑦ CurrentPage 음수는 실패로 읽힌다', M.parseApprovalXml(failXml).currentPage < 0,
  '문서 규약: 음수 = 오류코드');
check('⑦ 빈 응답을 성공으로 읽지 않는다', !(M.parseApprovalXml('').currentPage > 0));

/* ── ⑨ 통신 규격 — 개발자센터 「직접 HTTP 통신을 구현하는 방법」 원문과 대조 ───────
   문서에 실린 세금계산서 예시:
     SOAPAction: "https://testws.baroservice.com/IssueTaxInvoiceEx"
     <IssueTaxInvoiceEx xmlns="http://ws.baroservice.com/">
   ⚠️ 한 번 틀렸던 지점이다 — 네임스페이스를 www 로, SOAPAction 을 네임스페이스 기반으로
      잡았었다. 둘은 서로 다른 주소다. */
eq('⑨ 본문 네임스페이스는 ws.baroservice.com (www 아님)', M.BAROBILL_NS, 'http://ws.baroservice.com/');
eq('⑨ SOAPAction 은 접속 호스트 기반 — 운영',
  M.soapAction('https://ws.baroservice.com/CARD.asmx', 'GetApprovalHistories'),
  'https://ws.baroservice.com/GetApprovalHistories');
eq('⑨ SOAPAction 은 접속 호스트 기반 — 테스트(호스트를 바꾸면 따라간다)',
  M.soapAction('https://testws.baroservice.com/CARD.asmx', 'GetApprovalHistories'),
  'https://testws.baroservice.com/GetApprovalHistories');
check('⑨ SOAPAction 에 네임스페이스를 쓰지 않는다',
  !M.soapAction('https://ws.baroservice.com/CARD.asmx', 'X').startsWith(M.BAROBILL_NS));

const env = M.soapEnvelope('GetApprovalHistories', [
  ['CERTKEY', 'K'], ['CorpNum', '1348630816'], ['ID', 'joey'], ['CardNum', '1234'],
  ['StartDate', '20260201'], ['EndDate', '20260813'],
  ['CountPerPage', 100], ['CurrentPage', 1], ['OrderDirection', 1],
]);
check('⑨ 메서드 요소에 네임스페이스가 붙는다',
  env.includes('<GetApprovalHistories xmlns="http://ws.baroservice.com/">'), env.slice(0, 260));
check('⑨ 파라미터 순서가 문서 표와 같다',
  /<CERTKEY>[\s\S]*<CorpNum>[\s\S]*<ID>[\s\S]*<CardNum>[\s\S]*<StartDate>[\s\S]*<EndDate>[\s\S]*<CountPerPage>[\s\S]*<CurrentPage>[\s\S]*<OrderDirection>/.test(env),
  '순서가 바뀌면 ASMX 는 값을 엉뚱한 파라미터로 받는다');
check('⑨ SOAP 1.1 봉투 형식', env.startsWith('<?xml version="1.0" encoding="utf-8"?><soap:Envelope')
  && env.includes('xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'));

/* ── XML 이스케이프(요청 만들 때) ───────────────────────────────────────── */
eq('⑧ 요청 값의 &,<,> 를 이스케이프', M.xmlEscape('a&b<c>d'), 'a&amp;b&lt;c&gt;d');
check('⑧ &amp;lt; 를 < 로 잘못 풀지 않는다', M.xmlUnescape('&amp;lt;') === '&lt;',
  '&amp; 를 먼저 풀면 이중 이스케이프가 깨진다');

console.log('──────────────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
process.exit(fail ? 1 : 0);
