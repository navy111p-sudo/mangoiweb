// 📘 관리자용 사용설명서 — 글 정본 (2026-10-09 새로 씀)
//   ⛔ 화면 이름·순서·규칙을 바꾸면 이 글도 함께 고칠 것 — 사실과 다른 안내서는 없는 것보다 나쁘다.
//   문구의 근거(코드 정본):
//     메뉴 7묶음 js/adm-ia6.js GROUPS · 학생 목록 js/adm-core.js _smRowHtml · 학생 등록 smSubmitRegisterStudent
//     수업 예약 등록 admin/student.html ns-* · 연기·변경·취소 창 js/class-move-modal.js
//     오늘 수업 js/adm-today-classes.js · 주간 스케줄 admin/weekly-schedule.html (잠금 3분·되돌리기 15초)
//     수강신청 취소 → 남은 수업 종료 src/enroll-cancel-cascade.ts · 급여 js/adm-q3.js · 공제 규칙 /api/admin/payroll/deduction-rules
//   img 이름은 capture.mjs 의 shot 이름과 짝입니다(파일은 <lang>-<img>.jpg).
export const DATE = '2026-10-09';
export const T = {
  ko: {
    htmlLang: 'ko', date: '2026-10-09 기준 · 최신 화면',
    title: '관리자용 사용설명서', sub: '본사·사무실 직원용 · 관리자 페이지 mangoi.ai/admin',
    files: { pdf: 'admin-kr.pdf', pptx: 'admin-kr.pptx', xlsx: 'admin-kr.xlsx' },
    tocTitle: '차례', beforeTitle: '시작하기 전에',
    before: [
      '주소는 <b>https://mangoi.ai/admin</b> 입니다. (예전 주소 mangoi.co.kr 은 옛 서버라 이 기능이 없습니다)',
      '수업 시각은 모두 <b>한국 시간(KST)</b> 입니다. 필리핀은 1시간 늦습니다 — KST 19:30 = PH 18:30.',
      '계정마다 할 수 있는 일이 다릅니다. <b>수업 취소·매주 수업 나누기·학생 등록·급여</b>는 본사 계정만 됩니다. 강사·지사·대리점 계정은 서버가 막습니다.',
      '캡처 속 학생·강사(Emma Kim, Teacher Anna …)와 숫자는 <b>설명용 가짜 데이터</b>입니다. 실제 화면에는 실제 이름과 숫자가 나옵니다.',
      '빨간 상자 = 누를 곳입니다.'
    ],
    chapters: [
      { title: '들어가기 · 화면 둘러보기', intro: '로그인하고, 왼쪽 메뉴와 검색으로 원하는 화면을 찾는 법.',
        steps: [
          { h: '로그인', img: 'c1-login', p: ['<b>mangoi.ai/admin</b> 을 엽니다.', '아이디·비밀번호를 넣고 <b>✅ 로그인</b>. 지문·Face ID 를 등록했다면 초록 버튼으로 들어갈 수 있습니다.', '카카오톡 안에서 링크를 열면 로그인이 풀릴 수 있습니다 — 크롬으로 열어 주세요.'] },
          { h: '첫 화면', img: 'c1-home', p: ['맨 위 <b>자주 쓰는 기능</b> 타일에서 오늘 수업·결재함·수강신청 등으로 바로 갑니다.', '가운데 <b>통합 검색</b>에 학생·강사·학원·메뉴 이름을 치면 바로 찾아 줍니다.', '오른쪽 아래 <b>AI 운영비서</b>에게 말이나 글로 시킬 수도 있습니다(예: “오늘 수업 보여줘”).'] },
          { h: '왼쪽 메뉴 7묶음과 메뉴 검색', img: 'c1-search', p: ['메뉴는 <b>오늘 · 학생 · 강사 · 수업·콘텐츠 · 정산·매출 · 본사·지사·대리점 · 시스템</b> 7묶음입니다. 맨 위 <b>결재함</b>은 따로 고정돼 있습니다.', '왼쪽 위 <b>🔍 메뉴 검색</b>에 “급여”처럼 치면 그 메뉴만 남습니다.', '▸ 가 있는 메뉴는 누르면 그 안의 칸(손자 메뉴)이 펼쳐집니다.', '맨 아래 <b>EN</b> 으로 영어 화면, <b>admin ▾</b> 에서 비밀번호 변경·로그아웃을 합니다.'] }
        ] },
      { title: '학생 명부 · 학생 등록', intro: '학생을 찾고, 새 학생 계정을 만들고, 학생 상세로 들어갑니다.',
        steps: [
          { h: '학생 목록 열기', img: 'c2-list', p: ['메뉴 <b>학생 › 학생 명부</b> → <b>🧮 불러오기</b>.', '검색칸에 이름·아이디·학원명을 칩니다. 학원별로 거르려면 <b>전체 대리점·학원</b> 목록을 고릅니다.', '위 칩(전체·화상수업·AI 전용·미수강·확인 필요)으로 학생 종류를 거릅니다.', '칸 머리를 누르면 정렬, Shift+클릭으로 여러 칸 정렬.'] },
          { h: '한 줄의 버튼 — 관련 칸에 붙어 있습니다', img: 'c2-list-actions', p: ['<b>학생 이름</b>을 누르면 학생 상세로, 옆의 <b>✏️</b> 는 연락처 수정으로 갑니다.', '<b>수강 종료일</b> 칸 아래 <b>🗓️ 종료·연장</b>.', '<b>예약</b> 칸에 “주 2회 · 단건 1회”와 담당 강사 이름이 보이고, 그 아래 <b>📅 스케줄</b> · <b>⏸ 연기·변경</b>(예약이 있을 때만).', '<b>수강신청</b> 칸의 <b>📚 수강신청</b>은 그 학생으로 신청서를 미리 채워 줍니다.', '(예전의 «상세보기» 칸은 없어졌습니다 — 2026-10-09)'] },
          { h: '«➕ 학생 등록» 누르기', img: 'c2-add-button', p: ['목록 위 <b>➕ 학생 등록</b>을 누릅니다.', '먼저 이름으로 검색해 보세요. 이미 있는 학생이면 계정을 또 만들지 마세요(출석·포인트가 두 갈래가 됩니다).'] },
          { h: '학생 정보 입력', img: 'c2-register-form', p: ['<b>아이디</b>(필수) 4~20자 영문·숫자·밑줄, 소문자로.', '<b>이름</b>(필수). <b>비밀번호</b>는 비워 두면 자동으로 만들어집니다.', '<b>부모님 연락처</b>를 꼭 넣으세요 — 수업 안내 문자가 이 번호로 갑니다.', '<b>소속 대리점·학원</b>은 몇 글자 치고 목록에서 고릅니다. <b>✅ 학생 등록</b>.'] },
          { h: '임시 비밀번호는 한 번만 보입니다', img: 'c2-register-done', p: ['완료 줄과 <b>임시 비밀번호</b>가 뜹니다. 지금 복사해서 학부모님께 보내세요.', '창을 닫으면 다시 볼 수 없습니다.'] },
          { h: '학생 상세 화면', img: 'c2-detail', p: ['왼쪽에 학생 요약(아이디·가입일·수강 종료·지사 …), 위에 탭이 있습니다.', '탭: 개요 · 등록·수강 · <b>📅 스케줄</b> · 종료·연장 · 수업료 · 출결 · 평가서 · 연락처 · 교재 · 수업 녹화 등.', '수업을 넣고 미루고 바꾸는 일은 모두 <b>📅 스케줄</b> 탭에서 합니다(다음 장).', '위쪽 <b>English</b> 로 이 화면만 영어로 볼 수 있습니다.'] }
        ] },
      { title: '오늘 수업', intro: '오늘 열리는 모든 수업을 한 표로 보고, 바로 입장·참관·연기·변경합니다.',
        steps: [
          { h: '오늘 수업 표', img: 'c3-today', p: ['메뉴 <b>오늘 › 오늘 수업</b> → <b>🔄 불러오기</b>.', '위 칩이 상태별 개수입니다: 입장가능 · ⏸ 연기됨 · 종료.', '날짜를 바꾸면 다른 날 수업도 봅니다. 출처(망고아이/카페24)·학원·강사로 거를 수 있습니다.', '카페24 수업은 망고아이 방이 없어 입장·참관이 안 됩니다(“카페24 수업 · 입장 불가”).'] },
          { h: '한 줄에서 바로 처리', img: 'c3-today-move', p: ['<b>🚪 입장(보임)</b> 수업에 실제로 들어갑니다(학생에게 보입니다).', '<b>👁 참관</b> 보이지 않게 지켜봅니다. <b>🔗 초대 링크</b> 방 링크를 복사합니다.', '<b>📅 연기·변경</b>(빨간 상자) 이 수업 하루를 미루거나 바꾸거나 취소합니다 — 5장의 창과 같습니다.', '<b>💬 메시지</b> 그 학생에게 문자를 보냅니다.', '연기된 수업은 «⏸ 연기됨 — 새 날짜 미정» 과 <b>📅 새 날짜로</b> 버튼이 보입니다.'] }
        ] },
      { title: '수업 입력 (예약 등록 · 수강신청)', intro: '한 학생에게 수업을 넣는 두 가지 길: ① 학생 상세에서 바로 ② 수강신청서로(여러 명).',
        steps: [
          { h: '학생 상세 › 📅 스케줄 탭', img: 'c4-sched-top', p: ['맨 위 <b>다음 수업</b> 카드에 날짜·시각·담당 강사가 보입니다.', '“주 2회 · 월·수 19:30” 처럼 <b>매주 묶음</b>이 한 줄로 보이고, 아래에 앞으로 14일의 <b>날짜 칩</b>이 있습니다.', '칩마다 강사 이름이 붙어 있어 대신 들어가는 강사도 바로 보입니다.'] },
          { h: '정규수업(매주) 넣기', img: 'c4-add-regular', p: ['아래 <b>➕ 수업 예약 등록</b>에서 <b>종류 = 정규수업(매주)</b>.', '<b>요일</b>을 모두 체크(예: 월 + 수), <b>시작일</b>, <b>시작 시각(KST)</b>, <b>분</b>(보통 20).', '<b>담당 강사</b>를 목록에서 고릅니다. <b>근무지(전체·홈·사무실)</b>로 목록을 좁힐 수 있고, 퇴사 강사는 기본으로 감춰져 있습니다.', '<b>등록</b>. “같은 시간에 이미 예약이 있습니다”가 뜨면 그 강사 일정을 먼저 확인하세요.', '예약을 만들면 강사와 학생이 <b>방 코드 없이 같은 방</b>으로 들어갑니다.'] },
          { h: '하루짜리 수업(보강·체험·레벨테스트)', img: 'c4-add-oneoff', p: ['<b>종류</b>에서 <b>보강수업 / 체험수업 / 레벨테스트</b>를 고르면 요일 대신 <b>날짜</b> 하나를 고릅니다.', '색으로 구분됩니다: 정규 주황 · 보강 보라 · 체험 초록 · 레벨테스트 파랑.', '하루짜리는 “이 날 하루만” 표시가 붙고, 날짜가 지나면 «⌛ 지난 수업» 이 됩니다.'] },
          { h: '수강신청서로 넣기(여러 명 한 번에)', img: 'c4-enroll-form', p: ['메뉴 <b>학생 › 수강신청</b> → <b>+ 수강신청 등록</b>.', '한 줄 = 학생 한 명: 아이디 · 레벨 구분 · 배정 우선순위(요일·시간 우선 / 강사 우선) · 요일 · 시간 · 수업 시간 · 시작일 · 수업 기간 · 학부모 연락처.', '<b>+ 줄 추가</b>로 여러 명, <b>✅ 일괄 등록</b>. 엑셀·워드·카톡 양식으로 받아 채운 뒤 올릴 수도 있습니다.', '등록하면 자동으로 확정되어 <b>수업 기간만큼</b> 수업이 만들어집니다(6개월이면 6개월치).', '학생이 같은 시각에 이미 수업이 있으면 그 날짜는 건너뛰고 알려 줍니다.'] },
          { h: '신청서 목록', img: 'c4-enroll-list', p: ['상태: 대기 · 확정 · 수강중 · 취소 · 종료.', '<b>▸ 확정 안 됨</b> / <b>⚙ 후속</b>으로 확정 단계(학생 연결·강사 배정·수업 만들기)를 확인합니다.', '<b>✕ 취소</b>·<b>↩ 되살리기</b>는 6장을 보세요.'] }
        ] },
      { title: '수업 연기 · 변경', intro: '«연기» = 이번 한 번만 옮기기. «변경» = 이 회부터 앞으로 계속 바꾸기. 어디서 누르든 같은 창이 열립니다.',
        steps: [
          { h: '들어가는 곳 ① 날짜 칩', img: 'c5-chip-act', p: ['학생 상세 › 📅 스케줄에서 <b>날짜 칩</b>을 누르면 아래에 할 일이 펼쳐집니다.', '하루짜리 수업: <b>⏸ 연기 · ✏️ 변경 · ✕ 취소</b>.', '매주 수업: <b>“⏸ 연기 · ✏️ 변경 · ✕ 취소 — 이 날만”</b> — 그 주 하루만 바꾸고 다른 주는 그대로 둡니다.', '그 옆 <b>📅 날짜별로 나누기</b>는 매주 묶음을 날짜마다 따로 된 수업으로 풀어 줍니다(본사 계정).'] },
          { h: '들어가는 곳 ② 요일별 보기', img: 'c5-weekly-rows', p: ['<b>요일별 보기 · 연기/변경 ▾</b> 를 펼치면 수업 줄마다 <b>⏸ 연기</b> · <b>✏️ 변경</b> 버튼이 있습니다.', '누르면 앞으로 28일의 수업 날짜가 뜨고, 날짜를 고르면 같은 연기·변경 창이 열립니다.', '매주 시각 자체를 바꾸려면 묶음 줄의 <b>✏️ 매주 변경</b>.'] },
          { h: '들어가는 곳 ③ 학생 목록 · 오늘 수업', img: 'c5-pick-window', p: ['학생 목록의 <b>⏸ 연기·변경</b>, 오늘 수업의 <b>📅 연기·변경</b>도 같은 고르기 창을 엽니다.', '“매주 수업 — 나눈 뒤 처리” 표시는 고르면 먼저 그 날을 떼어 낸 뒤 처리한다는 뜻입니다.', '카페24 매주 수업은 카페24에서 바꿔야 합니다(여기서 바꾸면 밤 동기화가 되돌립니다).'] },
          { h: '연기·변경 창', img: 'c5-move-open', p: ['맨 위: 학생 · 날짜 · 시각 · 강사.', '세 버튼: <b>⏸ 연기(이번 한 번)</b> · <b>🔄 변경(앞으로 계속)</b> · <b>수업 취소</b>(본사 계정만).', '아래 <b>사유</b>는 기록에 남습니다(예: 학부모 연락). <b>실행</b> 전에 확인창이 한 번 더 뜹니다.'] },
          { h: '연기 ① 지정한 날짜로', img: 'c5-move-postpone-date', p: ['<b>지정한 날짜로 연기</b> → 날짜 칩과 10분 단위 시각 칩을 고릅니다(목록에 없으면 아래 칸에 직접).', '<b>이 시간 가능한 강사</b>가 카드로 보입니다. 담당 강사가 안 되면 다른 강사를 고를 수 있습니다(본사 계정).', '안 되는 강사는 이유(다른 수업·휴가·대체 중)가 붙어 목록에서 빠집니다.'] },
          { h: '연기 ② 완전히 연기(날짜 미정)', img: 'c5-move-postpone-hold', p: ['새 날짜를 아직 모를 때. 수업은 «⏸ 연기됨» 으로 남고 나중에 <b>📅 새 날짜로</b>를 눌러 정합니다.', '연기된 수업은 오늘 수업·학생 입장·결석 감지에서 빠집니다.'] },
          { h: '연기 ③ 끝에 보강(연기보강)', img: 'c5-move-postpone-end', p: ['이 회만 <b>수업 끝(마지막 수업) 다음 수업일</b>로 옮기고 «연기보강» 표시를 붙입니다. 날짜는 서버가 계산합니다.', '다른 회차는 그대로입니다.'] },
          { h: '변경(앞으로 계속)', img: 'c5-move-change', p: ['새 요일·시각을 고르면 <b>앞으로 옮겨질 회차 목록</b>을 미리 보여 줍니다(“앞으로 6회를 옮깁니다”).', '자리가 겹치는 날이 하나라도 있으면 아무것도 옮기지 않고 그 날짜를 알려 줍니다.', '미리보기를 확인한 뒤 <b>실행</b>.'] },
          { h: '결과는 캘린더에서 확인', img: 'c5-calendar-week', p: ['📅 스케줄 탭 아래 <b>주간/월간 캘린더</b>. 카드마다 종류 색과 담당 강사 이름이 보입니다.', '카드를 누르면 그 날 수업의 연기·변경 창이 바로 열립니다.', '공휴일(KR/PH)도 표시됩니다.'] },
          { h: '월간 캘린더', img: 'c5-calendar-month', p: ['<b>월간</b>을 누르면 한 달이 한 눈에 보입니다.', '신청서만 있고 실제 수업이 없는 경우 캘린더에 그리지 않고 위에 «안 그린 N건» 으로 알려 줍니다.'] },
          { h: '연기·변경 기록(요청함)', img: 'c5-requests', p: ['메뉴 <b>오늘 › 연기·변경</b>. 강사·학생이 보낸 요청과 관리자가 한 처리가 <b>시간과 함께</b> 남습니다.', '학생의 무료 연기·변경은 <b>승인 없이 바로</b> 시간표에 반영되고 여기에는 기록으로 남습니다.', '대기 중 요청은 <b>✅ 승인 / 반려</b>. 승인하면 일정에 자동 반영됩니다.'] }
        ] },
      { title: '수업 취소', intro: '취소는 되돌리기 어렵습니다. 본사 계정만 할 수 있고, 실행 전에 한 번 더 묻습니다.',
        steps: [
          { h: '하루 취소', img: 'c6-move-cancel', p: ['연기·변경 창에서 <b>수업 취소</b> → 사유 → <b>실행</b> → 확인.', '하루짜리 수업은 그 수업만, 매주 수업은 <b>그 날만</b> 떼어 내 취소합니다(다른 주는 그대로).', '이미 연기된 수업도 <b>✕ 이 수업 취소</b>로 취소할 수 있습니다.', '취소한 기록은 지워지지 않고 남습니다.'] },
          { h: '수강신청 취소 → 남은 수업도 함께 종료', img: 'c4-enroll-list', p: ['수강신청 목록의 <b>✕ 취소</b>: 그 신청이 만든 <b>앞으로의 수업</b>도 함께 끝납니다(“남은 수업 N건 종료”).', '날짜 없는 <b>매주 반복 줄은 그대로</b> 둡니다 — 급여 계산 때문입니다. 그 줄은 학생 › 📅 스케줄에서 따로 정리하세요.', '<b>↩ 되살리기</b>: 이번 취소로 끝난 수업 중 아직 안 지난 것을, 겹치지 않을 때만 되살립니다. 되살리지 못한 수업은 스케줄에서 손으로 넣으세요.'] }
        ] },
      { title: '시간표 (주간·일간 스케줄)', intro: '모든 강사의 수업을 한 판에서 보고, 끌어서 옮깁니다. 실수 방지를 위해 기본은 «잠김» 입니다.',
        steps: [
          { h: '주간 전체 스케줄', img: 'c7-weekly', p: ['메뉴 <b>강사 › 시간표·근무</b>. 가로 = 시간, 세로 = 강사.', '색: 정규 주황 · 그룹 분홍 · 보강 보라 · 체험 초록 · 레벨테스트 파랑 · 휴무 빗금.', '위 숫자: 총 수업 · 정규 · 활동 교사 · 빈 슬롯. <b>빈자리 찾기</b>로 비어 있는 시간을 찾습니다.', '오른쪽 위 <b>🔒 잠김</b> — 잠긴 동안은 끌어도 바뀌지 않습니다.'] },
          { h: '편집 켜기', img: 'c7-weekly-edit', p: ['<b>🔒 잠김</b>을 누르면 <b>✏️ 편집 중 3:00</b>. 3분 동안 아무 저장이 없으면 다시 잠깁니다.', '저장한 뒤 <b>15초 동안 «되돌리기»</b>가 나옵니다. 실수했으면 바로 누르세요.'] },
          { h: '일간 보기 · 끌어서 옮기기', img: 'c7-daily', p: ['<b>일간</b>(또는 사이드바 «시간표·근무» 첫 화면)은 오늘 하루를 크게 보여 줍니다.', '학생 카드를 끌어 다른 시간·다른 강사 칸에 놓으면 <b>“연기할까요, 변경할까요?”</b> 를 묻습니다.', '<b>연기</b> = 그 날만, <b>변경</b> = 앞으로 계속.'] },
          { h: '오른쪽 클릭 메뉴', img: 'c7-weekly-ctx', p: ['수업 칸을 오른쪽 클릭: <b>상세보기 · 수업 연기 · 수업 변경 · 시간 변경 · 삭제</b>.', '연기·변경 창에서 10분 단위로 시각을 고릅니다.'] }
        ] },
      { title: '급여', intro: '강사 급여는 실제 수업 기록으로 자동 계산됩니다. 단위는 ₱(필리핀 페소)입니다.',
        steps: [
          { h: '강사 급여 자동 정산 — 계산', img: 'c8-payroll', p: ['메뉴 <b>강사 › 급여</b> → <b>💼 강사 급여 자동 정산</b>.', '<b>정산 월</b>(연·월)을 고르고 <b>🔍 계산</b>.', '계산식: <b>수업 시간 ÷ 10분 × 10분 단가</b>를 수업마다 더합니다. 등급별 단가(예: Teacher 1 = ₱50/20분, Teacher 2 = ₱70/20분).', '위 요약: 강사 수 · 총 수업 · 공제 · 실지급 · 지급 완료 수. <b>₩ 원화로 보기</b>로 환율 환산도 볼 수 있습니다.'] },
          { h: '강사별 표', img: 'c8-payroll-table', p: ['강사마다: 등급(요율) · 수업 수 · 총 분 · 10분 단가 · 수업료 · 공제 · <b>실지급액</b>.', '등급은 이 표에서 바로 바꿀 수 있습니다(다음 계산부터 반영).', '<b>조정 금액</b>을 넣고 <b>💾 전체 저장</b>, 지급하면 <b>✅ 지급 완료</b>.', '<b>📥 CSV 다운로드</b>로 엑셀에 받습니다. «카페24» 배지는 카페24 월간 집계에서 온 값입니다.'] },
          { h: '수업 한 건씩 보기(📋 상세)', img: 'c8-payroll-detail', p: ['강사 줄의 <b>📋 상세</b>: 수업 날짜·학생·상태·분·수업료·피드백·지각(분)·공제가 한 줄씩 나옵니다.', '학생 결석 · 강사 미입장 · 피드백 미작성 수가 위에 요약됩니다.', '지각 분은 여기서 직접 입력할 수 있습니다.'] },
          { h: '공제 규칙과 연기 수업 지급률', img: 'c8-payroll-rules', p: ['<b>⚙️ 공제 규칙</b>에서 등급 요율과 공제 금액을 고칩니다. 저장 후 다시 <b>🔍 계산</b>.', '당일 피드백 미작성 −₱25/수업 · 지각 연장 실패 −₱10/분 · 강사 미입장.', '<b>학생 결석 지급률</b>(기본 0%), <b>연기 수업 지급률</b>(기본 100%), <b>사전 연기(시작 30분보다 이전) 지급률</b>(기본 0%).', '즉 수업 직전(30분 이내) 연기는 수업료가 나가고, 미리 연기한 수업은 나가지 않습니다(기본값 기준).'] }
        ] },
      { title: '결재 · 매일보고', intro: '돈이 나가는 일은 결재로, 하루 업무는 매일보고로.',
        steps: [
          { h: '결재함', img: 'c9-approval', p: ['왼쪽 메뉴 맨 위 <b>결재함</b>(숫자 = 내가 결재할 건수).', '<b>내가 결재할 것</b>: 내용·금액·첨부를 보고 <b>승인 / 반려</b>. 점검을 통과한 건은 <b>한 번에 승인</b>할 수 있습니다.', '₱5,000 이상 물품·지출은 결재권자 → 대표 2단계입니다. 그 미만은 결재권자가 결재하고 대표는 «확인» 만 합니다.', 'AI 영수증 판독이 엉터리로 보이면(날짜가 너무 옛날 등) 자동 반려하지 않고 노란 표시만 합니다.'] },
          { h: '매일보고', img: 'c9-handover', p: ['<b>/daily-handover</b> (관리자 첫 화면 배너에서도 들어갑니다).', '<b>내 보고 작성</b>: 오늘 한 일 · 문제 · 후속 조치 → 받는 사람 → <b>확인 후 전달</b>. 녹음해서 입력도 됩니다.', '받은 보고는 «한국어로 번역» 버튼으로 읽을 수 있습니다.', '결재가 필요한 줄은 AI 가 알려 주고 <b>결재로 옮기기</b>로 바로 결재를 올립니다.', '근무일에 안 쓰면 다음 날 아침 본인과 대표에게 알림이 갑니다(공휴일 제외).'] }
        ] }
    ],
    faq: [
      ['수업을 넣었는데 강사 화면에 안 보여요', '예약의 담당 강사와 KST 시각부터 확인하세요. 하루짜리면 날짜가 맞는지도 보세요.'],
      ['연기와 변경은 무엇이 다른가요?', '연기 = 이번 한 번만 옮김. 변경 = 이 회부터 앞으로 계속 바뀜.'],
      ['매주 수업을 그 주 하루만 미루고 싶어요', '날짜 칩 → «이 날만» 으로 하면 그 날만 떼어 내 처리하고 다른 주는 그대로입니다.'],
      ['취소 버튼이 안 보여요', '수업 취소는 본사 계정만 할 수 있습니다. 강사·지사·대리점 계정에는 버튼이 없습니다.'],
      ['수강신청을 취소했는데 매주 수업이 남아 있어요', '날짜 없는 매주 반복 줄은 급여 계산 때문에 그대로 둡니다. 학생 › 📅 스케줄에서 정리하세요.'],
      ['시간표에서 끌었는데 안 바뀌어요', '🔒 잠김 상태입니다. 눌러서 편집을 켜세요(3분 뒤 다시 잠김).'],
      ['급여에 연기 수업이 어떻게 들어가나요?', '공제 규칙의 «연기 수업 지급률»(기본 100%)과 «사전 연기 지급률»(30분보다 이전, 기본 0%)을 따릅니다.'],
      ['카페24 수업은 왜 입장이 안 되나요?', '카페24 수업은 망고아이 화상방을 쓰지 않습니다. 시간 변경도 카페24에서 하세요.']
    ],
    xlsx: { sheet1: '사용설명서', header: ['장', '장 제목', '번호', '단계', '설명', '그림'], picSheet: '화면그림', faqSheet: '자주 묻는 질문', faqHeader: ['질문', '답'] },
    foot: '망고아이 관리자 자료실 · 관리자용 사용설명서 · 2026-10-09'
  },
  en: {
    htmlLang: 'en', date: 'As of 2026-10-09 · current screens',
    title: 'Admin User Guide', sub: 'For HQ / office staff · Admin page mangoi.ai/admin',
    files: { pdf: 'admin-en.pdf', pptx: 'admin-en.pptx', xlsx: 'admin-en.xlsx' },
    tocTitle: 'Contents', beforeTitle: 'Before you start',
    before: [
      'The address is <b>https://mangoi.ai/admin</b>. (The old mangoi.co.kr site is a different server and does not have these features.)',
      'All class times are <b>Korea time (KST)</b>. The Philippines is 1 hour earlier — KST 19:30 = PH 18:30.',
      'What you can do depends on your account. <b>Cancelling classes, splitting weekly classes, registering students and payroll</b> need an HQ account. Teacher, branch and agency accounts are refused by the server.',
      'The students, teachers (Emma Kim, Teacher Anna …) and numbers in the screenshots are <b>sample data</b>. Your screen shows real ones.',
      'Red box = the place to press.'
    ],
    chapters: [
      { title: 'Getting in · Finding your way', intro: 'Log in, and find any screen with the left menu or search.',
        steps: [
          { h: 'Log in', img: 'c1-login', p: ['Open <b>mangoi.ai/admin</b>.', 'Enter your ID and password and press <b>Log in</b>. If you registered a fingerprint / Face ID, use the green button.', 'Links opened inside KakaoTalk may lose the login — open them in Chrome.'] },
          { h: 'Home screen', img: 'c1-home', p: ['The <b>Frequently used</b> tiles at the top jump to Today’s classes, Approvals, Enrollment and more.', 'The <b>search box</b> in the middle finds students, teachers, academies and menus.', 'You can also ask the <b>AI assistant</b> (bottom right) in words, e.g. “show today’s classes”.'] },
          { h: 'Left menu (7 groups) and menu search', img: 'c1-search', p: ['Groups: <b>Today · Students · Teachers · Lessons · Finance · HQ/Branches/Agencies · System</b>. <b>Approvals</b> is pinned on top.', 'Type in <b>🔍 Menu search</b> (top left), e.g. “payroll”, to filter the menu.', 'Items with ▸ open sub-items.', 'At the bottom: <b>EN/KO</b> language, and <b>admin ▾</b> for password change and logout.'] }
        ] },
      { title: 'Student list · Adding a student', intro: 'Find students, create a new student account, and open the student detail page.',
        steps: [
          { h: 'Open the student list', img: 'c2-list', p: ['Menu <b>Students › Students</b> → <b>Load</b>.', 'Search by name, ID or academy, or pick one academy from the list.', 'The chips (All · Video class · AI only · Not enrolled · Check needed) filter the kind of student.', 'Click a column header to sort; Shift+click to sort by several columns.'] },
          { h: 'Row buttons sit in the related columns', img: 'c2-list-actions', p: ['Click the <b>student name</b> to open the detail page; <b>✏️</b> next to it edits contacts.', 'Under <b>End date</b>: <b>🗓️ End/Extend</b>.', 'The <b>Bookings</b> column shows “2/wk · 1 one-off” and the teacher, with <b>📅 Schedule</b> and <b>⏸ Postpone</b> (only when there are bookings).', '<b>📚 Enrollment</b> pre-fills an enrollment form for that student.', '(The old “Details” column was removed on 2026-10-09.)'] },
          { h: 'Press «➕ Add Student»', img: 'c2-add-button', p: ['Press <b>➕ Add Student</b> above the list.', 'Search the name first. If the student already exists, do not create a second account.'] },
          { h: 'Fill in the student’s information', img: 'c2-register-form', p: ['<b>User ID</b> (required): 4–20 letters/numbers/underscore, small letters.', '<b>Name</b> (required). Leave <b>Password</b> blank to get a temporary one.', 'Please enter the <b>Parent phone</b> — class reminder texts go there.', 'Pick the <b>Agency/Academy</b> from the list. Press <b>Register</b>.'] },
          { h: 'The temporary password is shown once', img: 'c2-register-done', p: ['Copy the <b>temporary password</b> now and send it to the parent.', 'It is not shown again after you close the window.'] },
          { h: 'Student detail page', img: 'c2-detail', p: ['Summary on the left, tabs on top.', 'Tabs: Overview · Enrollment · <b>📅 Schedule</b> · End/Extend · Payment · Attendance · Evaluations · Contacts · Textbook · Recordings …', 'Adding, postponing and changing classes is all done in the <b>📅 Schedule</b> tab (next chapters).'] }
        ] },
      { title: 'Today’s classes', intro: 'All of today’s classes in one table — join, observe, postpone or change right there.',
        steps: [
          { h: 'Today’s class table', img: 'c3-today', p: ['Menu <b>Today › Today’s classes</b> → <b>Load</b>.', 'The chips count classes by status: Joinable · ⏸ Postponed · Ended.', 'Change the date to see another day. Filter by source (Mangoi/Cafe24), academy or teacher.', 'Cafe24 classes have no Mangoi room, so you cannot join or observe them.'] },
          { h: 'Actions on one row', img: 'c3-today-move', p: ['<b>🚪 Join (visible)</b> enters the class (students see you).', '<b>👁 Observe</b> watches invisibly. <b>🔗 Invite link</b> copies the room link.', '<b>📅 Postpone/Change</b> (red box) postpones, changes or cancels this one class — the same window as chapter 5.', '<b>💬 Message</b> texts the student.', 'Postponed classes show “⏸ Postponed — no new date” and a <b>📅 New date</b> button.'] }
        ] },
      { title: 'Adding classes (booking · enrollment)', intro: 'Two ways: ① from the student detail page ② with an enrollment form (many students).',
        steps: [
          { h: 'Student detail › 📅 Schedule', img: 'c4-sched-top', p: ['The <b>Next class</b> card shows date, time and teacher.', 'A weekly pattern shows as one line, e.g. “2x a week · Mon·Wed 19:30”, with <b>date chips</b> for the next 14 days below.', 'Each chip shows the teacher’s name, so substitutes are easy to see.'] },
          { h: 'Add a regular (weekly) class', img: 'c4-add-regular', p: ['In <b>➕ Add class</b>, set <b>Type = Regular (weekly)</b>.', 'Tick the <b>days</b> (e.g. Mon + Wed), the <b>start date</b>, <b>start time (KST)</b> and <b>minutes</b> (usually 20).', 'Pick the <b>teacher</b>. <b>Place (All/Home/Office)</b> narrows the list; teachers who left are hidden by default.', 'Press <b>Add</b>. If it warns about a clash, check that teacher’s schedule first.', 'Teacher and student then join the <b>same room automatically</b>, no room code.'] },
          { h: 'One-day classes (make-up · trial · level test)', img: 'c4-add-oneoff', p: ['Choose <b>Make-up / Trial / Level test</b>: you pick one <b>date</b> instead of days.', 'Colours: Regular amber · Make-up purple · Trial green · Level test blue.', 'One-day classes show “this day only”, and “⌛ past” after the date.'] },
          { h: 'Enrollment form (many students at once)', img: 'c4-enroll-form', p: ['Menu <b>Students › Enrollment</b> → <b>+ Add enrollment</b>.', 'One row per student: ID · level · priority (day/time or teacher) · days · time · length · start date · period · parent phone.', '<b>+ Add row</b>, then <b>✅ Register all</b>. You can also download an Excel/Word/Kakao form, fill it in and upload it.', 'Registered rows are confirmed automatically and classes are created for the <b>whole period</b> (6 months = 6 months of classes).', 'Dates where the student already has a class at that time are skipped and reported.'] },
          { h: 'Enrollment list', img: 'c4-enroll-list', p: ['Status: Pending · Confirmed · Active · Cancelled · Ended.', '<b>▸ Not confirmed</b> / <b>⚙ Follow-up</b> shows the confirmation steps (link student, assign teacher, create classes).', 'For <b>✕ Cancel</b> and <b>↩ Restore</b> see chapter 6.'] }
        ] },
      { title: 'Postponing · Changing classes', intro: '«Postpone» = move just this one class. «Change» = from this class on, every time. The same window opens from everywhere.',
        steps: [
          { h: 'Way in ① date chips', img: 'c5-chip-act', p: ['In Student detail › 📅 Schedule, press a <b>date chip</b>; the actions open below.', 'One-day class: <b>⏸ Postpone · ✏️ Change · ✕ Cancel</b>.', 'Weekly class: <b>“… — this day only”</b> — only that week changes, other weeks stay.', '<b>📅 Split by date</b> turns a weekly pattern into separate dated classes (HQ account).'] },
          { h: 'Way in ② weekly rows', img: 'c5-weekly-rows', p: ['Open <b>By weekday · Postpone/Change ▾</b>: each row has <b>⏸ Postpone</b> and <b>✏️ Change</b>.', 'They list the next 28 days of classes; pick a date to open the same window.', 'To change the weekly time itself use <b>✏️ Change weekly</b>.'] },
          { h: 'Way in ③ student list · today’s classes', img: 'c5-pick-window', p: ['<b>⏸ Postpone</b> in the student list and <b>📅 Postpone/Change</b> in Today’s classes open the same picker.', '“weekly — split first” means that day is separated first, then handled.', 'Cafe24 weekly classes must be changed in Cafe24 (the nightly sync would undo it here).'] },
          { h: 'The postpone/change window', img: 'c5-move-open', p: ['Top: student · date · time · teacher.', 'Three buttons: <b>⏸ Postpone (once)</b> · <b>🔄 Change (from now on)</b> · <b>Cancel class</b> (HQ only).', 'The <b>reason</b> is saved in the history. A confirm box appears before anything is saved.'] },
          { h: 'Postpone ① to a set date', img: 'c5-move-postpone-date', p: ['<b>Postpone to a date</b> → pick a day chip and a time chip (10-minute steps), or type below.', 'Available teachers appear as cards. If the usual teacher is busy you can pick another (HQ account).', 'Teachers who cannot take it (other class, leave, substituting) are left out with the reason.'] },
          { h: 'Postpone ② on hold (no date yet)', img: 'c5-move-postpone-hold', p: ['Use it when the new date is not known. The class stays as “⏸ Postponed”; set the date later with <b>📅 New date</b>.', 'Postponed classes are left out of Today’s classes, joining and absence alerts.'] },
          { h: 'Postpone ③ make up at the end', img: 'c5-move-postpone-end', p: ['Moves just this class to the next class day <b>after the last class</b>, marked “make-up”. The server works out the date.', 'Other classes stay as they are.'] },
          { h: 'Change (from now on)', img: 'c5-move-change', p: ['Pick a new day and time; a <b>preview</b> lists every later class that will move (“6 classes move”).', 'If any date clashes, nothing moves and the clashing dates are shown.', 'Check the preview, then press <b>Apply</b>.'] },
          { h: 'Check the result in the calendar', img: 'c5-calendar-week', p: ['Below the 📅 Schedule tab: <b>week/month calendar</b>, cards coloured by type with the teacher’s name.', 'Click a card to open the postpone/change window for that day.', 'KR/PH public holidays are shown too.'] },
          { h: 'Month view', img: 'c5-calendar-month', p: ['Press <b>Month</b> for a whole month at once.', 'Enrollments without real classes are not drawn; a note above says how many were left out.'] },
          { h: 'Postpone/change history', img: 'c5-requests', p: ['Menu <b>Today › Reschedule</b>: every request from teachers and students, and what admins did, <b>with times</b>.', 'Students’ free postpone/change requests are applied <b>immediately without approval</b> and only recorded here.', 'Pending requests: <b>Approve / Reject</b>. Approving updates the schedule automatically.'] }
        ] },
      { title: 'Cancelling classes', intro: 'Cancelling is hard to undo. HQ accounts only, and you are asked to confirm.',
        steps: [
          { h: 'Cancel one class', img: 'c6-move-cancel', p: ['In the window: <b>Cancel class</b> → reason → <b>Apply</b> → confirm.', 'A one-day class is cancelled; for a weekly class <b>only that day</b> is separated and cancelled (other weeks stay).', 'An already postponed class can also be cancelled with <b>✕ Cancel this class</b>.', 'Cancelled classes stay in the history.'] },
          { h: 'Cancel an enrollment → its remaining classes end too', img: 'c4-enroll-list', p: ['<b>✕ Cancel</b> in the enrollment list also ends that enrollment’s <b>future classes</b> (“N remaining classes ended”).', 'Weekly repeat rows without dates are <b>kept</b> (because of payroll) — tidy them in Student › 📅 Schedule.', '<b>↩ Restore</b> brings back classes this cancel ended, if not past and not clashing. Add any that could not be restored by hand.'] }
        ] },
      { title: 'Timetable (weekly · daily)', intro: 'Every teacher’s classes on one board; drag to move. It is <b>locked</b> by default to prevent mistakes.',
        steps: [
          { h: 'Weekly timetable', img: 'c7-weekly', p: ['Menu <b>Teachers › Schedule</b>. Across = time, down = teachers.', 'Colours: Regular amber · Group pink · Make-up purple · Trial green · Level test blue · Off hatched.', 'Top numbers: total classes · regular · active teachers · free slots. <b>Find free slot</b> finds empty times.', '<b>🔒 Locked</b> (top right): dragging does nothing while locked.'] },
          { h: 'Turn editing on', img: 'c7-weekly-edit', p: ['Press <b>🔒 Locked</b> → <b>✏️ Editing 3:00</b>. It locks again after 3 minutes without a save.', 'After a save, <b>Undo</b> is available for <b>15 seconds</b>.'] },
          { h: 'Daily view · drag to move', img: 'c7-daily', p: ['<b>Day</b> view (the first screen from the sidebar) shows today large.', 'Drag a student card to another time or teacher; it asks <b>“Postpone or Change?”</b>.', '<b>Postpone</b> = that day only, <b>Change</b> = from now on.'] },
          { h: 'Right-click menu', img: 'c7-weekly-ctx', p: ['Right-click a class: <b>Details · Postpone · Change · Change time · Delete</b>.', 'Times are picked in 10-minute steps.'] }
        ] },
      { title: 'Payroll', intro: 'Teacher pay is calculated automatically from real class records. Amounts are in ₱ (Philippine peso).',
        steps: [
          { h: 'Automatic payroll — calculate', img: 'c8-payroll', p: ['Menu <b>Teachers › Payroll</b> → <b>💼 Automatic teacher payroll</b>.', 'Choose the <b>month</b> and press <b>🔍 Calculate</b>.', 'Formula: <b>class minutes ÷ 10 × rate per 10 min</b>, added up per class. Rates by level (e.g. Teacher 1 = ₱50 / 20 min, Teacher 2 = ₱70 / 20 min).', 'Summary: teachers · classes · deductions · final pay · paid. <b>₩ Show in KRW</b> converts with the exchange rate.'] },
          { h: 'Per-teacher table', img: 'c8-payroll-table', p: ['Per teacher: level (rate) · classes · minutes · rate per 10 min · lesson fee · deduction · <b>final pay</b>.', 'Change the level right in the table (used from the next calculation).', 'Enter an <b>adjusted amount</b>, press <b>💾 Save all</b>; after paying press <b>✅ Mark paid</b>.', '<b>📥 CSV</b> downloads it. A “Cafe24” badge means the value came from the Cafe24 monthly sync.'] },
          { h: 'Class by class (📋 Detail)', img: 'c8-payroll-detail', p: ['<b>📋 Detail</b> lists each class: date · student · status · minutes · fee · feedback · late minutes · deduction.', 'Student absences, teacher no-shows and missing feedback are counted at the top.', 'Late minutes can be entered here.'] },
          { h: 'Deduction rules and postponed-class pay', img: 'c8-payroll-rules', p: ['<b>⚙️ Deduction rules</b>: edit level rates and deductions, save, then <b>Calculate</b> again.', 'No same-day feedback −₱25/class · late, not extended −₱10/min · teacher no-show.', '<b>Student absent pay %</b> (default 0%), <b>Postponed class pay %</b> (default 100%), <b>Early postpone (30+ min before start) pay %</b> (default 0%).', 'So with the defaults, a class postponed within 30 minutes of start is paid; one postponed earlier is not.'] }
        ] },
      { title: 'Approvals · Daily handover', intro: 'Spending goes through Approvals; daily work goes in the daily handover.',
        steps: [
          { h: 'Approvals', img: 'c9-approval', p: ['<b>Approvals</b> at the top of the left menu (number = items waiting for you).', '<b>For me to approve</b>: check the content, amount and attachments, then <b>Approve / Reject</b>. Items that passed every check can be approved together.', 'Supplies/expenses of ₱5,000 or more need the approver and then the CEO. Below that the approver decides and the CEO only “acknowledges”.', 'If the AI receipt reading looks wrong (e.g. a date far in the past) it is not auto-rejected — it is only marked yellow.'] },
          { h: 'Daily handover', img: 'c9-handover', p: ['<b>/daily-handover</b> (also from the banner on the admin home).', '<b>Write my report</b>: work done · issues · follow-up → recipient → <b>Confirm & send</b>. You can also record your voice.', 'Received reports can be read with “Translate to Korean”.', 'AI flags lines that need approval; <b>Move to approval</b> starts one directly.', 'If you skip a workday, you and the CEO get a reminder next morning (holidays excluded).'] }
        ] }
    ],
    faq: [
      ['I booked a class but the teacher cannot see it', 'Check the booking’s teacher and the KST time first. For a one-day class check the date too.'],
      ['What is the difference between Postpone and Change?', 'Postpone = move this one class. Change = from this class on, every time.'],
      ['I want to postpone a weekly class for just one week', 'Date chip → “this day only”: only that day is separated and handled, other weeks stay.'],
      ['I do not see the Cancel button', 'Only HQ accounts can cancel. Teacher, branch and agency accounts do not get it.'],
      ['I cancelled the enrollment but weekly classes remain', 'Weekly repeat rows without dates are kept for payroll. Tidy them in Student › 📅 Schedule.'],
      ['Dragging in the timetable does nothing', 'It is 🔒 locked. Press it to edit (locks again after 3 minutes).'],
      ['How do postponed classes count in payroll?', 'By “Postponed class pay %” (default 100%) and “Early postpone pay %” (30+ min before, default 0%) in the deduction rules.'],
      ['Why can’t I join a Cafe24 class?', 'Cafe24 classes do not use the Mangoi video room. Change their times in Cafe24 too.']
    ],
    xlsx: { sheet1: 'Guide', header: ['Ch', 'Chapter', 'No.', 'Step', 'Explanation', 'Picture'], picSheet: 'Screens', faqSheet: 'FAQ', faqHeader: ['Question', 'Answer'] },
    foot: 'Mangoi Admin Library · Admin User Guide · 2026-10-09'
  }
};
