// 🤖 A.i 컨텐츠 결제 안내서 — 글 정본 (2026-10-28)
//   대리점 자료실·관리자 자료실의 /library/agency/ai-pay-guide-kr|en.pdf 와,
//   관리자용 사용설명서 10장(docs/자료실_원본/관리자용_사용설명서/content.mjs)이 같은 그림(capture.mjs)을 쓴다.
//   ⛔ 화면 이름·순서·단가를 바꾸면 이 글도 함께 고칠 것 — 사실과 다른 안내서는 없는 것보다 나쁘다.
//   문구의 근거(코드 정본):
//     대리점 화면 manager.html — 사이드바 「정산통계관리 › AI 컨텐츠 결제」(#sideAibill) · 카드 #c-aibill (paintAiBill)
//       버튼 「우리 학원 학생 불러와서 고르기」 = aiBillGenerate(명단만 · 결제 안 됨) · 「OOO원 결제하기」 = aiBillPay(토스 카드 결제창)
//       「결제한 학생은 빼거나 바꿀 수 없습니다」 = aibFailText(student_already_paid) · 결제 후 학생 추가 = topup(늘어난 몫만)
//     단가 src/ai-billing-price.ts (AI_TIERS 7,500/6,500/5,500/4,500 · 최소 청구 없음 2026-10-26 · 경계 보정 = 인원이 늘어도 총액이 줄지 않음)
//     마감 = 서버 prepayDue(이번 달 말일까지 다음 달 이용분) · 화상반(live)은 A.i 가 수업료에 포함
//     카카오 상담 링크는 채널 홈 pf.kakao.com/_xlqnSxd — ⛔ 뒤에 /chat 을 붙이지 말 것(CLAUDE.md 2장)
//   marks = 그림 위 빨간 표시의 글자(그림마다 언어가 다르다). img 이름은 capture.mjs 의 shot 이름과 짝.
export const DATE = '2026-10-28';
export const T = {
  ko: {
    htmlLang: 'ko', file: 'ai-pay-guide-kr.pdf',
    title: 'A.i 컨텐츠 결제 안내서', sub: '망고아이 대리점용 · 2026년 10월',
    flow: ['로그인', 'AI 컨텐츠 결제', '학생 불러오기', '학생 체크', '카드 결제', '✅ 끝'],
    facts: [
      ['누구 몫인가요?', '화상영어 <u>안 듣고</u> A.i 만 쓰는 학생'],
      ['언제 내나요?', '매달 <u>말일까지</u> 다음 달 이용분'],
      ['얼마인가요?', '고른 학생 수 × 1명 단가 (끝쪽 표)'],
      ['어떻게 내나요?', '관리자 화면에서 카드로 결제'],
    ],
    steps: [
      { h: '로그인하기', addr: 'mangoi.ai/admin/login', img: 'p1-login',
        p: ['<b class="n">1</b> 대리점 아이디 <b class="n">2</b> 비밀번호를 넣고 <b class="n">3</b> <b>로그인</b>을 누릅니다.'],
        tip: '카카오톡 안에서 열면 로그인이 풀릴 수 있어요. <b>크롬·사파리</b>로 열어 주세요.' },
      { h: '메뉴 열기', img: 'p2-menu',
        p: ['<b class="n">4</b> 왼쪽 메뉴 「정산통계관리」에서 🤖 <b>AI 컨텐츠 결제</b>를 누릅니다.'] },
      { h: '학생 명단 불러오기', img: 'p3-load',
        p: ['<b class="n">!</b> 오른쪽 위에서 <b>결제 마감일</b>을 확인하고 <b class="n">5</b> <b>우리 학원 학생 불러와서 고르기</b>를 누릅니다.'],
        tip: '이 버튼은 명단만 불러옵니다. <b>아직 아무것도 결제되지 않아요.</b>' },
      { h: '다음 달에 쓸 학생 체크하기', img: 'p4-check', img2: 'p4-notyet',
        p: ['<b class="n">6</b> 다음 달 A.i 를 쓸 학생은 <b>체크</b>, 그만둔 학생은 <b>체크를 풀어</b> 주세요.'],
        p2: ['<b class="n">7</b> 「아직 신청 안 한 학생」 중에 쓸 학생이 있으면 여기서도 체크합니다.'],
        tip: '「📹 화상영어」 표시 학생은 수업료에 A.i 가 포함돼 있어 <b>고를 필요가 없습니다.</b> 이름·아이디 검색도 됩니다.' },
      { h: '금액 확인하고 결제하기', img: 'p5-pay',
        p: ['<b class="n">8</b> 합계 인원과 금액을 확인하고 <b class="n">9</b> <b>OOO원 결제하기</b> → 카드 결제창에서 결제합니다.'],
        tip: '「결제가 완료됐습니다」가 나오면 끝입니다.' },
      { h: '결제 확인하기', img: 'p6-done',
        p: ['<b class="n">10</b> 「지난 결제」에 ✅ 표시가 있으면 결제 완료입니다. 나중에 학생을 더 넣으면 늘어난 학생 몫만 <b>추가 결제</b>됩니다.'] },
    ],
    marks: {
      id: '대리점 아이디', pw: '비밀번호', login: '로그인 누르기', menu: '「AI 컨텐츠 결제」 누르기',
      due: '마감일 확인', load: '학생 불러오기 (아직 결제 안 됨)', check: '다음 달 쓸 학생 = 체크 ✓',
      notyet: '쓸 학생이면 여기서도 체크', sum: '금액 확인', pay: '결제하기 → 카드 결제', done: '✅ = 결제 완료',
    },
    priceTitle: '학생 1명 단가 (한 달)',
    priceHead: ['고른 인원', '20명 이하', '21~50명', '51~70명', '71명 이상'],
    priceRow: ['1명 단가', '7,500원', '6,500원', '5,500원', '4,500원'],
    priceNote: '예) 10명 → 75,000원 · 30명 → 195,000원. 인원이 늘어도 총액은 줄지 않게 계산됩니다. <b>화면 금액이 정확한 금액</b>입니다.',
    faqTitle: '자주 묻는 질문',
    faq: [
      ['메뉴에 「AI 컨텐츠 결제」가 안 보여요.', '대리점 아이디로 로그인했는지 확인해 주세요.'],
      ['「본사가 아직 A.i 컨텐츠 결제를 열지 않았습니다」가 나와요.', '고장이 아닙니다. 본사가 결제를 켜면 바로 됩니다.'],
      ['이미 결제한 학생을 빼고 싶어요.', '화면에서는 못 뺍니다. 환불은 본사에 문의해 주세요.'],
      ['결제창이 안 열려요.', '크롬·사파리로 다시 열고, 팝업 차단을 꺼 주세요.'],
      ['돈은 나갔는데 완료가 안 떠요.', '다시 누르기 전에 칸을 한 번 다시 열어 확인해 주세요. 확인 안 된 결제는 카드사에서 자동 취소됩니다.'],
    ],
    contact: '📞 문의: 망고아이 카카오톡 채널 <b>pf.kakao.com/_xlqnSxd</b>',
    footnote: '※ 화면 사진의 학생 이름·아이디·금액은 설명용 예시입니다. 실제 화면에는 우리 학원 학생이 나옵니다.',
  },
  en: {
    htmlLang: 'en', file: 'ai-pay-guide-en.pdf',
    title: 'A.i Content Payment Guide', sub: 'For Mangoi agencies · October 2026',
    flow: ['Log in', 'A.i content payment', 'Load students', 'Check students', 'Pay by card', '✅ Done'],
    facts: [
      ['Who is it for?', 'Students who use <u>only</u> A.i — no video classes'],
      ['When do I pay?', '<u>By the last day</u> of each month, for next month'],
      ['How much?', 'Students you choose × price per student (table on the last page)'],
      ['How do I pay?', 'By card, on the admin screen'],
    ],
    steps: [
      { h: 'Log in', addr: 'mangoi.ai/admin/login', img: 'p1-login',
        p: ['Enter <b class="n">1</b> your agency ID and <b class="n">2</b> password, then press <b class="n">3</b> <b>Log In</b>.'],
        tip: 'Links opened inside KakaoTalk may lose the login. Please open it in <b>Chrome or Safari</b>.' },
      { h: 'Open the menu', img: 'p2-menu',
        p: ['<b class="n">4</b> In the left menu, under «Settlement &amp; stats», press 🤖 <b>A.i content payment</b>.'] },
      { h: 'Load your student list', img: 'p3-load',
        p: ['<b class="n">!</b> Check the <b>payment due date</b> at the top right, then press <b class="n">5</b> <b>Load my students and choose</b>.'],
        tip: 'This button only loads the list. <b>Nothing is paid yet.</b>' },
      { h: 'Check the students for next month', img: 'p4-check', img2: 'p4-notyet',
        p: ['<b class="n">6</b> <b>Check</b> the students who will use A.i next month, and <b>uncheck</b> students who have left.'],
        p2: ['<b class="n">7</b> If a student under «Not signed up» will use it, check them here too.'],
        tip: 'Students marked «📹 video class» get A.i with their tuition, so <b>you do not need to choose them.</b> You can also search by name or ID.' },
      { h: 'Check the amount and pay', img: 'p5-pay',
        p: ['<b class="n">8</b> Check the number of students and the total, then press <b class="n">9</b> <b>Pay OOO KRW</b> and pay in the card payment window.'],
        tip: 'When you see «Paid», you are done.' },
      { h: 'Check the payment', img: 'p6-done',
        p: ['<b class="n">10</b> A ✅ next to the month under «Past payments» means it is paid. If you add more students later, you pay <b>only for the added students</b>.'] },
    ],
    marks: {
      id: 'Agency ID', pw: 'Password', login: 'Press Log In', menu: 'Press «A.i content payment»',
      due: 'Check the due date', load: 'Load students (no payment yet)', check: 'Next month’s users = checked ✓',
      notyet: 'Will use it? Check here too', sum: 'Check the amount', pay: 'Pay → card payment', done: '✅ = paid',
    },
    priceTitle: 'Price per student (one month)',
    priceHead: ['Students chosen', '20 or fewer', '21–50', '51–70', '71 or more'],
    priceRow: ['Price per student', '7,500 KRW', '6,500 KRW', '5,500 KRW', '4,500 KRW'],
    priceNote: 'e.g. 10 students → 75,000 KRW · 30 students → 195,000 KRW. The total never goes down when you add students. <b>The amount on the screen is the exact amount.</b>',
    faqTitle: 'Frequently asked questions',
    faq: [
      ['I cannot see «A.i content payment» in the menu.', 'Please check that you logged in with your agency ID.'],
      ['It says «Head office has not opened A.i content payment yet».', 'It is not broken. It works as soon as head office opens payment.'],
      ['I want to remove a student I already paid for.', 'This cannot be done on the screen. For a refund, please contact head office.'],
      ['The payment window does not open.', 'Open the page again in Chrome or Safari and turn off the pop-up blocker.'],
      ['My card was charged but it does not say «Paid».', 'Before pressing again, close and reopen the card once to check. A payment that is not confirmed is cancelled automatically by the card company.'],
    ],
    contact: '📞 Contact: Mangoi KakaoTalk channel <b>pf.kakao.com/_xlqnSxd</b>',
    footnote: '※ Student names, IDs and amounts in the screenshots are samples. Your screen shows your own academy’s students.',
  },
};
