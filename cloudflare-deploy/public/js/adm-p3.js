// ═══════════════════════════════════════════════════════════════
// adm-p3.js — admin.html 인라인 스크립트 추출 (2단계, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // === 거대한 한국어 → 영어 사전 ===
  var I18N = {
    // ── (2026-07-22) 이모지 제거 별칭 ──
    //   사이드바·카드 헤더에서 선행 이모지를 떼어내면서(adm-menu-icons.js)
    //   "📊 …" 형태의 키가 전체일치에 실패해 영문 전환이 한국어로 남았다.
    //   원래 키는 그대로 두고, 이모지를 뗀 형태를 같은 뜻으로 추가한다.
    "AI 예측": "AI Forecast",
    "BtoB 결제관리": "B2B Payments",
    "BtoB 결제관리 (학원 ↔ 본사/대리점)": "B2B Payments (Academy ↔ HQ/Agency)",
    "BtoC 결제관리": "B2C Payments",
    "BtoC 결제관리 (학원 → 학부모 직판매)": "B2C Payments (Academy → Parents)",
    "CSV 다운로드": "Download CSV",
    "Excel": "Excel",
    "Excel 다운로드": "Download Excel",
    "Ghost View": "Ghost View",
    "PDF": "PDF",
    "QR 출결": "QR Attendance",
    "Word": "Word",
    "가족 관리": "Family",
    "강사 모드": "Teacher Mode",
    "강사 슈퍼바이저": "Supervisor",
    "강사 자료실": "Teacher Library",
    "거래 건수": "Transactions",
    "결재 상신": "Submit for Approval",
    "공지 스튜디오": "Notice Studio",
    "공지사항 게시판": "Notice Board",
    "관리자 알림": "Admin Alerts",
    "관리자 자료실": "Admin Library",
    "관리자로 복귀": "Back to Admin",
    "귓속말": "Whisper",
    "기안 및 지출서": "Proposal & Expense",
    "기안 및 지출서 (구)": "Proposal & Expense Form",
    "녹화 보관": "Recording Storage",
    "다른 계정으로 로그인": "Login with Different Account",
    "대리점 모드": "Agency Mode",
    "대리점 자료실": "Agency Library",
    "도움말 / FAQ": "Help / FAQ",
    "레벨테스트": "Level Test",
    "로그아웃": "Logout",
    "로그인": "Login",
    "로그인이 필요합니다": "Login Required",
    "마이크로러닝": "Microlearning",
    "마이페이지": "My Page",
    "메뉴": "Menu",
    "모두 접기": "Collapse All",
    "모두 펼치기": "Expand All",
    "미니 토익": "Mini TOEIC",
    "발음 교정": "Pronunciation",
    "방 초대 관리": "Room Invite",
    "보고서 양식": "Report Forms",
    "보고서 양식 관리": "Report Form Management",
    "보관기간 파기": "Auto Cleanup",
    "비밀번호 변경": "Change Password",
    "사진/영상 갤러리": "Photo/Video Gallery",
    "상담 예약": "Counseling",
    "세금계산서 미발행": "Tax Invoice Pending",
    "세금계산서 일괄발행": "Bulk Tax Invoice",
    "셀프 진단": "Self Check",
    "수수료 합계": "Fees Total",
    "수업 일지": "Lesson Log",
    "수업 출결": "Class Attendance",
    "숙제 관리": "Homework",
    "숨기기": "Hide",
    "시간표": "Timetable",
    "실시간 수업 (활성 룸)": "Live Classes (Active Rooms)",
    "역할 선택 (7가지)": "Select Role (7 Roles)",
    "역할 선택 (로그인)": "Role Selection (Login)",
    "역할 전환 (테스트)": "Switch Role (Test)",
    "연기·변경 요청": "Reschedule Requests",
    "영상 사전": "Video Dictionary",
    "영어 배틀": "English Battle",
    "오늘 거래액": "Today’s Revenue",
    "오늘 매출": "Today Sales",
    "월별 NPS": "Monthly NPS",
    "위험군 (≤70%)": "Risk Group (≤70%)",
    "위험군 학부모 알림": "Notify Risk Parents",
    "음성 일기": "Voice Diary",
    "음성 통계": "Voice Stats",
    "이번달 거래액": "This Month",
    "이번달 매출": "Monthly Sales",
    "인쇄": "Print",
    "임시 저장": "Save Draft",
    "자동 수금": "Auto Dunning",
    "자료실 / 사용 안내서": "Resources / Manuals",
    "전체 출석률": "Overall Attendance",
    "정기 결제": "Recurring",
    "정산 통계": "Settlement",
    "졸업생 커뮤니티": "Alumni",
    "주문 건수": "Orders",
    "지사 모드": "Branch Mode",
    "지사 자료실": "Branch Library",
    "최근 12개월 월별 매출": "Last 12 Months Sales",
    "최근 30일 일별 거래액": "Last 30 Days Revenue",
    "출결 상태": "Attendance Status",
    "친구 추천": "Referral",
    "캘린더 관리": "Calendar Management",
    "통합 시간표": "Integrated Timetable",
    "팝업 게시": "Popup Posting",
    "필터 초기화": "Reset Filters",
    "학부모 FAQ봇": "Parent FAQ Bot",
    "학부모 요약": "Parent Digest",
    "학생 수업 평가": "Student Class Ratings",
    "학생·학부모 자료실": "Student·Parent Library",
    "학원 수": "Academies",
    "학원 전체 스케줄": "Academy Full Schedule",
    "학원별 학생 수업현황": "Attendance by School",
    "학원별 학생 수업현황 (SLP 출석 통계)": "Attendance Stats by Academy (SLP)",
    "현재 역할": "Current Role",
    "활성 학생": "Active Students",
    "휴가 계획서": "Vacation Request",

    // === 8 사이드바 그룹 ===    '평가서 통합': 'Evaluations',
    '알림 센터': 'Notifications',
    '강사 통합': 'Teachers',
    '통계 / KPI': 'Stats / KPI',
    '회계 / 포인트': 'Accounting / Points',
    '학생 / 학부모': 'Students / Parents',
    '교육 / 콘텐츠': 'Education / Content',
    '시스템': 'System',

    // === 평가서 통합 sub ===
    '평가서 작성': 'Write Evaluation',
    '일괄 평가': 'Bulk Evaluation',
    'AI 수업 리포트': 'AI Lesson Report',
    'AI 초안': 'AI Draft',
    '월별 리포트': 'Monthly Report',
    '비교 리포트': 'Comparison Report',
    '📊 비교 리포트': '📊 Comparison Report',

    // === 알림 센터 sub ===
    '웹 푸시': 'Web Push',
    '카카오 알림': 'KakaoTalk Alert',
    '팝업 관리': 'Popup Management',
    '이벤트 알림': 'Event Alert',
    '공지사항': 'Notice Board',
    '📌 공지사항 ⭐신규': '📌 Notice Board ⭐NEW',

    // === 강사 통합 sub ===
    '강사 관리': 'Teacher Management',
    '자동 급여': 'Auto Payroll',
    '📅 연기·변경 요청 ⭐신규': '📅 Reschedule Requests ⭐NEW',
    '⭐ 학생 수업 평가': '⭐ Student Class Ratings',
    '급여 관리': 'Payroll',
    'MBTI': 'MBTI',
    '칭찬 통계': 'Praise Stats',
    '👁 강사 슈퍼바이저': '👁 Supervisor',
    '📨 방 초대 관리': '📨 Room Invite',
    '🗓 시간표 ⭐신규': '🗓 Timetable ⭐NEW',
    '📝 수업 일지 ⭐신규': '📝 Lesson Log ⭐NEW',
    '📋 보고서 양식': '📋 Report Forms',

    // === 통계 / KPI sub ===
    'KPI 대시보드': 'KPI Dashboard',
    '일별 차트': 'Daily Charts',
    '랭킹': 'Rankings',
    '이탈 위험': 'Churn Risk',
    '🗑 보관기간 파기': '🗑 Auto Cleanup',
    '🔴 실시간 수업 (활성 룸)': '🔴 Live Classes (Active Rooms)',
    '📈 월별 NPS': '📈 Monthly NPS',
    '🔮 AI 예측': '🔮 AI Forecast',
    '🎙 음성 통계': '🎙 Voice Stats',

    // === 회계 / 포인트 sub ===
    '회계 관리': 'Accounting',
    '🏢 BtoB 결제관리': '🏢 B2B Payments',
    '👨‍👩‍👧 BtoC 결제관리': '👨‍👩‍👧 B2C Payments',
    '🔄 정기 결제': '🔄 Recurring',
    '💸 자동 수금': '💸 Auto Dunning',
    '📊 정산 통계': '📊 Settlement',
    '포인트 관리': 'Points',

    // === 학생 / 학부모 sub ===
    '학생 관리': 'Student Management',
    '📊 학원별 학생 수업현황': '📊 Attendance by School',
    '👨‍👩‍👧‍👦 가족 관리': '👨‍👩‍👧‍👦 Family',
    '문의 관리': 'Inquiries',
    '등록 관리': 'Enrollments',
    '뱃지 관리': 'Badges',
    '커뮤니티': 'Community',
    '📅 상담 예약': '📅 Counseling',
    '📰 학부모 요약': '📰 Parent Digest',
    '🤖 학부모 FAQ봇': '🤖 Parent FAQ Bot',
    '🎁 친구 추천': '🎁 Referral',
    '🎓 졸업생 커뮤니티': '🎓 Alumni',
    '📷 사진/영상 갤러리 ⭐신규': '📷 Photo/Video Gallery ⭐NEW',

    // === 교육 / 콘텐츠 sub ===
    '교재 콘텐츠': 'Textbooks',
    '📖 마이크로러닝': '📖 Microlearning',
    '🎯 미니 토익': '🎯 Mini TOEIC',
    '🗣 발음 교정': '🗣 Pronunciation',
    '🎬 영상 사전': '🎬 Video Dictionary',
    '🎙 음성 일기': '🎙 Voice Diary',
    '📊 레벨테스트': '📊 Level Test',
    '⚔ 영어 배틀': '⚔ English Battle',
    '💾 녹화 보관': '💾 Recording Storage',
    '📚 숙제 관리 ⭐신규': '📚 Homework ⭐NEW',

    // === 시스템 sub ===
    '권한 관리': 'Permissions',
    '가맹점': 'Franchises',
    '센터': 'Centers',
    '데이터 추출': 'Data Export',
    '테스트 시드': 'Test Seed',
    '🔔 관리자 알림': '🔔 Admin Alerts',
    '👻 Ghost View': '👻 Ghost View',
    '👀 수업 관찰': '👀 Ghost View',
    '💬 귓속말': '💬 Whisper',
    '📋 출결 상태': '📋 Attendance Status',
    '📷 QR 출결': '📷 QR Attendance',
    '📝 수업 출결': '📝 Class Attendance',

    // === 📚 자료실 / 📢 공지 스튜디오 (2026-07-10 누락 보강) ===
    '자료실': 'Library',
    '📕 관리자 자료실': '📕 Admin Library',
    '👨‍🏫 강사 자료실': '👨‍🏫 Teacher Library',
    '🏢 지사 자료실': '🏢 Branch Library',
    '🏬 대리점 자료실': '🏬 Agency Library',
    '🎒 학생·학부모 자료실': '🎒 Student·Parent Library',
    '📢 공지 스튜디오': '📢 Notice Studio',
    '📢 팝업 게시': '📢 Popup Posting',
    '📅 캘린더 관리': '📅 Calendar Management',
    '📅 학원 전체 스케줄': '📅 Academy Full Schedule',

    // === ph125 손자 메뉴 누락 보강 (2026-07-10) ===
    'QR 생성': 'Generate QR',
    '스캔 이력': 'Scan History',
    '오늘 출결': 'Today’s Attendance',
    '부정 출결': 'Attendance Fraud',
    '출결 자동': 'Auto Attendance',
    '강사 체크인': 'Teacher Check-in',
    '지각·결석': 'Late · Absent',
    '학부모 알림': 'Parent Alerts',
    '학생 알림': 'Student Alerts',
    '강사 알림': 'Teacher Alerts',
    '자동 알림': 'Auto Alerts',
    '월별 통계': 'Monthly Stats',
    '학생별 이력': 'History by Student',
    '귓속말 발송': 'Send Whisper',
    '새 포스터': 'New Poster',
    '크기·동영상': 'Size · Video',
    '저장 목록': 'Saved List',
    '다시 사용': 'Reuse',
    'AI 상담': 'AI Consult',
    '카톡상담': 'Kakao Consult',

    // === 사이드바 액션 버튼 ===
    '↧ 모두 펼치기': '↧ Expand All',
    '↥ 모두 접기': '↥ Collapse All',
    '🙈 숨기기': '🙈 Hide',
    '☰ 메뉴': '☰ Menu',

    // === ph115/117 사용자 메뉴 ===
    '관리자': 'Admin',
    '경영진': 'Executive',
    '교사': 'Teacher',
    '지사': 'Branch',
    '대리점': 'Agency',
    '학부모': 'Parent',
    '학생': 'Student',
    '본사 · 경영진': 'HQ · Executive',
    '본사 · 관리자': 'HQ · Admin',
    '본사 · 강사': 'HQ · Teacher',
    '본사 · CFO': 'HQ · CFO',
    '지사 · 부산': 'Branch · Busan',
    '지사 · 대구': 'Branch · Daegu',
    '대리점 · 강남001': 'Agency · GN001',
    '대리점 · 송파002': 'Agency · SC002',
    '👤 마이페이지': '👤 My Page',
    '🔑 비밀번호 변경': '🔑 Change Password',
    '📘 자료실 / 사용 안내서': '📘 Resources / Manuals',
    '🩺 셀프 진단': '🩺 Self Check',
    '❓ 도움말 / FAQ': '❓ Help / FAQ',
    '🔄 역할 전환 (테스트)': '🔄 Switch Role (Test)',
    '🔄 역할 선택 (7가지)': '🔄 Select Role (7 Roles)',
    '🎭 역할 선택 (로그인)': '🎭 Role Selection (Login)',
    '✅ 다른 계정으로 로그인': '✅ Login with Different Account',
    '🚪 로그아웃': '🚪 Logout',
    '✓ 현재 역할': '✓ Current Role',

    // === ph116 배너 ===
    '👨‍🏫 강사 모드': '👨‍🏫 Teacher Mode',
    '🏬 지사 모드': '🏬 Branch Mode',
    '🤝 대리점 모드': '🤝 Agency Mode',
    '🛠 관리자로 복귀': '🛠 Back to Admin',
    '본인 수업·평가만 접근 권한': 'Access to own classes/evaluations only',
    '산하 대리점 데이터만': 'Sub-agency data only',
    '본인 학생만 접근 권한': 'Own students only',

    // === ph106 BtoB/BtoC ===
    '🏢 BtoB 결제관리 (학원 ↔ 본사/대리점)': '🏢 B2B Payments (Academy ↔ HQ/Agency)',
    '👨‍👩‍👧 BtoC 결제관리 (학원 → 학부모 직판매)': '👨‍👩‍👧 B2C Payments (Academy → Parents)',
    '📅 오늘 거래액': '📅 Today’s Revenue',
    '📊 이번달 거래액': '📊 This Month',
    '🧾 거래 건수': '🧾 Transactions',
    '💸 수수료 합계': '💸 Fees Total',
    '📅 오늘 매출': '📅 Today Sales',
    '📊 이번달 매출': '📊 Monthly Sales',
    '🧾 주문 건수': '🧾 Orders',
    '📄 세금계산서 미발행': '📄 Tax Invoice Pending',
    '전체 본사': 'All HQ',
    '전체 지사': 'All Branches',
    '전체 대리점': 'All Agencies',
    '전체 결제수단': 'All Methods',
    '전체 상태': 'All Status',
    '전체 결과': 'All Results',
    '전체 세금계산서': 'All Tax Invoices',
    '전체 분류': 'All Categories',
    '결제완료': 'Paid',
    '취소': 'Cancel',
    '환불': 'Refund',
    '대기': 'Pending',
    '정상처리': 'Normal',
    '🔍 검색': '🔍 Search',
    '📥 CSV 다운로드': '📥 Download CSV',
    '📊 Excel 다운로드': '📊 Download Excel',
    '📄 세금계산서 일괄발행': '📄 Bulk Tax Invoice',
    '📲 위험군 학부모 알림': '📲 Notify Risk Parents',
    '📈 최근 30일 일별 거래액': '📈 Last 30 Days Revenue',
    '📈 최근 12개월 월별 매출': '📈 Last 12 Months Sales',

    // === ph107 보고서 양식 ===
    '📋 보고서 양식 관리': '📋 Report Form Management',
    '🌴 휴가 계획서': '🌴 Vacation Request',
    '📄 기안 및 지출서 (구)': '📄 Proposal & Expense Form',
    '📄 기안 및 지출서': '📄 Proposal & Expense',
    '신규 양식 등록': 'Register New Form',
    '➕ 신규 양식 등록': '➕ Register New Form',
    '인사/총무': 'HR / General Affairs',
    '회계': 'Accounting',
    '운영': 'Operations',
    '기타': 'Other',
    '사용중': 'Active',
    '보관': 'Archived',
    '편집': 'Edit',
    '보고서 양식명': 'Form Name',
    '분류': 'Category',
    '상태': 'Status',
    '최종 수정일': 'Last Modified',
    '액션': 'Action',
    '신청자 정보': 'Applicant Info',
    '신청자 이름': 'Applicant Name',
    '사번 / ID': 'Employee ID',
    '소속 부서': 'Department',
    '직급': 'Position',
    '휴가 정보': 'Vacation Info',
    '휴가 종류': 'Vacation Type',
    '연차 휴가': 'Annual Leave',
    '병가': 'Sick Leave',
    '경조사': 'Family Event',
    '포상 휴가': 'Bonus Leave',
    '반차 여부': 'Half Day',
    '전일 사용': 'Full Day',
    '오전 반차': 'Morning Half',
    '오후 반차': 'Afternoon Half',
    '시작일': 'Start Date',
    '종료일': 'End Date',
    '사유 및 인수인계': 'Reason & Handover',
    '휴가 사유': 'Vacation Reason',
    '업무 인수자 (수업 대체)': 'Handover (Substitute)',
    '비상 연락처': 'Emergency Contact',
    '취소': 'Cancel',
    '💾 임시 저장': '💾 Save Draft',
    '📤 결재 상신': '📤 Submit for Approval',

    // === ph109 출력 ===
    '🖨 인쇄': '🖨 Print',
    '📄 PDF': '📄 PDF',
    '📊 Excel': '📊 Excel',
    '📝 Word': '📝 Word',

    // === ph112 학원별 수업현황 ===
    '📊 학원별 학생 수업현황 (SLP 출석 통계)': '📊 Attendance Stats by Academy (SLP)',
    '📊 전체 출석률': '📊 Overall Attendance',
    '🏫 학원 수': '🏫 Academies',
    '👨‍🎓 활성 학생': '👨‍🎓 Active Students',
    '⚠ 위험군 (≤70%)': '⚠ Risk Group (≤70%)',
    '지사명': 'Branch',
    '학당명': 'Academy',
    '학생이름': 'Student Name',
    '영어이름': 'English Name',
    '학생아이디': 'Student ID',
    '결석수': 'Absences',
    '출석수/수업수': 'Present/Total',
    '출석률': 'Attendance Rate',
    '출석률 결과': 'Result',
    '출석률 그래프': 'Chart',

    // === ph110 신규 5개 카드 ===
    '📌 공지사항 게시판 ⭐신규': '📌 Notice Board ⭐NEW',
    '📌 공지사항 게시판': '📌 Notice Board',
    '🗓 통합 시간표 ⭐신규': '🗓 Integrated Timetable ⭐NEW',
    '🗓 통합 시간표': '🗓 Integrated Timetable',
    '📝 수업 일지 ⭐신규': '📝 Lesson Log ⭐NEW',
    '📝 수업 일지': '📝 Lesson Log',
    '📷 사진/영상 갤러리 ⭐신규': '📷 Photo/Video Gallery ⭐NEW',
    '📷 사진/영상 갤러리': '📷 Photo/Video Gallery',
    '📚 숙제 관리 ⭐신규': '📚 Homework ⭐NEW',
    '📚 숙제 관리': '📚 Homework',

    // === ph118 권한 통계 ===
    '허용': 'Allow',
    '읽기전용': 'Read Only',
    '차단': 'Blocked',

    // === 공통 단어 ===
    '검색': 'Search',
    '초기화': 'Reset',
    '저장': 'Save',
    '취소': 'Cancel',
    '확인': 'Confirm',
    '등록': 'Register',
    '수정': 'Edit',
    '삭제': 'Delete',
    '추가': 'Add',
    '닫기': 'Close',
    '열기': 'Open',
    '발송': 'Send',
    '다운로드': 'Download',
    '업로드': 'Upload',
    '오늘': 'Today',
    '이번달': 'This Month',
    '지난달': 'Last Month',
    '전체': 'All',
    '명': '',
    '건': '',
    '개': '',
    '회': '',
    '시간': 'Hours',
    '분': 'min',
    '초': 'sec',

    // === ph123/124/125 손자 메뉴 헤더 ===
    '카드 전체 열기': 'Open Full Card',
    '📂 카드 전체 열기': '📂 Open Full Card',
    '손자 메뉴': 'Sub-items',

    // === ph111/115 사용자 헤더 ===
    '로그인 필요': 'Login Required',
    '관리자 페이지에 접근하려면 로그인해주세요.': 'Please login to access the admin page.',
    '🔐 로그인이 필요합니다': '🔐 Login Required',
    '✅ 로그인': '✅ Login',

    // === ph128 다중 필터 ===
    '필터 결과': 'Filter Results',
    '↩ 필터 초기화': '↩ Reset Filters',
    '활성': 'active'
  };

  // 정규식 패턴: 텍스트 노드 안의 한국어 매칭 → 영어 치환
  function translateText(text){
    if (!text) return text;
    // 1) 정확 일치 우선
    if (I18N[text.trim()]) return I18N[text.trim()];
    // 2) 부분 치환 (긴 키부터)
    var keys = Object.keys(I18N).sort(function(a,b){ return b.length - a.length; });
    var result = text;
    keys.forEach(function(k){
      if (k.length < 2) return;
      var v = I18N[k];
      if (!v) return;
      // 안전한 정규식 (escape)
      var safe = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.split(k).join(v);
    });
    return result;
  }

  // === EN 모드일 때 자동 번역 ===
  // ph129Marks: 실제로 바꾼 노드 기록 [{n:노드, a:'nv'(텍스트노드)|'tc'(textContent), o:원문}]
  // (기존 코드는 '.__ph129' 라는 존재하지 않는 CSS 클래스 선택자로 복원/리셋을 시도해 KO 복원이 전혀 동작하지 않았음 — 2026-07-10 근본수정)
  var ph129Marks = [];
  var ph129Flagged = [];
  function ph129Flag(el){ el.__ph129 = true; ph129Flagged.push(el); }

  function ph129ApplyEN(){
    if (window.adminLang !== 'en') return;
    // ph85 사이드바 — 그룹 타이틀
    document.querySelectorAll('#ph85-sidebar .ph85-title').forEach(function(el){
      if (el.__ph129) return;
      var t = translateText(el.textContent);
      if (t !== el.textContent) { ph129Marks.push({ n: el, a: 'tc', o: el.textContent }); el.textContent = t; }
      ph129Flag(el);
    });
    // 사이드바 sub 라벨 — 첫 텍스트 노드만 (토글 화살표/툴팁 제외)
    document.querySelectorAll('#ph85-sidebar .ph85-sub').forEach(function(el){
      if (el.__ph129) return;
      for (var i = 0; i < el.childNodes.length; i++){
        var nd = el.childNodes[i];
        if (nd.nodeType === 3 && nd.nodeValue.trim()) {
          var firstText = nd.nodeValue.trim();
          var translated = translateText(firstText);
          if (translated !== firstText) {
            ph129Marks.push({ n: nd, a: 'nv', o: nd.nodeValue });
            nd.nodeValue = translated;
          }
          break;
        }
      }
      ph129Flag(el);
    });
    // ph85 액션 버튼
    document.querySelectorAll('#ph85-sidebar .ph86-action-btn').forEach(function(el){
      if (el.__ph129) return;
      var t = translateText(el.textContent);
      if (t !== el.textContent) { ph129Marks.push({ n: el, a: 'tc', o: el.textContent }); el.textContent = t; }
      ph129Flag(el);
    });
    // 손자 메뉴 (ph125 인라인 아코디언)
    document.querySelectorAll('#ph85-sidebar .ph125-gc .ph125-text').forEach(function(el){
      if (el.__ph129) return;
      var t = translateText(el.textContent);
      if (t !== el.textContent) { ph129Marks.push({ n: el, a: 'tc', o: el.textContent }); el.textContent = t; }
      ph129Flag(el);
    });
    // 신규 ph 카드 summary 들 (data-ko 없는 것들)
    document.querySelectorAll('details.menu-card > summary').forEach(function(el){
      if (el.__ph129 || el.querySelector('[data-ko]')) return;
      var orig = el.textContent.trim();
      var translated = translateText(orig);
      if (translated !== orig) {
        // span 안에 텍스트만 교체
        var span = el.querySelector('span');
        var target = span || el;
        ph129Marks.push({ n: target, a: 'tc', o: target.textContent });
        target.textContent = translated;
      }
      ph129Flag(el);
    });
    // ph114 사용자 모달 등
    document.querySelectorAll('[data-ph129-i18n]').forEach(function(el){
      var t = translateText(el.textContent);
      if (t !== el.textContent) { ph129Marks.push({ n: el, a: 'tc', o: el.textContent }); el.textContent = t; }
    });
  }

  // KO 모드로 돌아갈 때 복구 — 기록해 둔 노드를 역순으로 원문 복원
  function ph129RestoreKO(){
    if (window.adminLang === 'en') return;
    for (var i = ph129Marks.length - 1; i >= 0; i--){
      var m = ph129Marks[i];
      try {
        if (m.a === 'nv') m.n.nodeValue = m.o;
        else m.n.textContent = m.o;
      } catch(e){}
    }
    ph129Marks = [];
  }

  // === toggleAdminLang() 호출 후 자동 재실행 ===
  var origToggle = window.toggleAdminLang;
  window.toggleAdminLang = function(){
    if (typeof origToggle === 'function') origToggle.apply(this, arguments);
    // 모든 ph129 적용 element 의 flag 리셋 후 재적용
    ph129Flagged.forEach(function(el){ el.__ph129 = false; });
    ph129Flagged = [];
    setTimeout(function(){
      if (window.adminLang === 'en') ph129ApplyEN();
      else ph129RestoreKO();
    }, 100);
  };

  // 초기 + 주기 적용
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph129ApplyEN);
  else ph129ApplyEN();
  setInterval(function(){
    if (window.adminLang === 'en') ph129ApplyEN();
  }, 2000);

  console.log('[ph129] i18n 사전 ' + Object.keys(I18N).length + '개 활성 — EN 모드 시 자동 번역');
})();
