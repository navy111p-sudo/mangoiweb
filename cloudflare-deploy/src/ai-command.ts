/**
 * ai-command.ts — 🥭 Phase 21 망고아이 AI 명령 오케스트레이터
 *
 * 사용자가 admin 통합검색창에 자연어로 입력하면 4단계 의도로 분류:
 *   1) answer    — 단순 Q&A (지식 기반 답변)
 *   2) navigate  — 페이지 이동 / 메뉴 라우팅
 *   3) query     — 백엔드 데이터 조회 (서버에서 자동 실행 → 결과 반환)
 *   4) action    — 실제 작업 (확인 다이얼로그 후 별도 엔드포인트로 실행)
 *
 * 모델: Cloudflare Workers AI — Llama 3.3 70B Instruct fp8-fast
 *   - 무료 일일 한도 (10k Neurons) 안에서 동작
 *   - JSON 모드로 구조화 응답 강제
 *   - 추후 Anthropic Claude 등으로 교체 시 callLLM() 함수 한 곳만 수정
 */

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ──────────────────────────────────────────────────────────
// 시스템 프롬프트 — Few-shot 예시 중심으로 재작성 (Phase 21e)
// 핵심: 추상 규칙보다 구체 예시가 Llama 의 instruction following 에 훨씬 강력
// ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are 망고아이(Mangoi) admin AI router.
Classify admin commands (Korean OR English) into one of 5 intents and output ONE JSON object only. No prose, no markdown, no code blocks.

Schema (one of these exactly):
{"intent":"answer","answer":"<answer in USER_LANG>"}
{"intent":"navigate","url":"<path>","answer":"<confirmation in USER_LANG>"}
{"intent":"navigate","external_url":"<https://...>","answer":"<confirmation in USER_LANG>"}
{"intent":"navigate","menu_id":"<card-id>","answer":"<confirmation in USER_LANG>"}
{"intent":"query","tool":"<tool>","args":{...},"answer":"<confirmation in USER_LANG>"}
{"intent":"action","name":"<action>","args":{...},"confirm_text":"<confirm question in USER_LANG>","answer":"<answer in USER_LANG>"}
{"intent":"schedule_plan","items":[{"action":"register_recurring|schedule_one_off|change_schedule|postpone_class","student_name":"<name>","teacher_name":"<optional teacher>","days":["mon","tue",...],"date":"YYYY-MM-DD","time":"HH:MM","type":"regular|level_test|trial","label":"<short label in USER_LANG>"},...],"answer":"<confirmation in USER_LANG>","confirm_text":"<confirm in USER_LANG>"}
{"intent":"bulk_modify","operation":"postpone|cancel|reschedule","criteria":{"student_name":"<optional>","days":["mon",...],"time":"HH:MM","date_from":"YYYY-MM-DD","date_to":"YYYY-MM-DD"},"new_time":"HH:MM","shift_minutes":60,"answer":"<USER_LANG>","confirm_text":"<USER_LANG>"}

Allowed navigate URLs (same-tab): /admin.html, /admin/students.html, /admin/student.html?uid=ID, /admin/health.html, /admin/mypage.html, /admin/weekly-schedule.html (전체/주간/강사 스케줄·시간표 — 강사명 있으면 /admin/weekly-schedule.html?q=이름), /admin/all-schedules.html

Allowed external_url (new tab): https://mangoi-speech.pages.dev/practice (발음교정·발음 연습)

Allowed menu_id (scroll to card on /admin.html). Match Korean OR English keywords:
- card-daily-charts    (일자별 차트·매출·학생수·탈락·증가 | daily charts, revenue chart, growth)
- card-rankings        (학생 랭킹·발화·시선·집중도 | student ranking, speaking, gaze, focus)
- card-payroll         (강사 급여·평가 대시보드 | teacher payroll, salary)
- card-franchises      (가맹점 관리 | franchises, branches)
- card-centers         (교육센터 | education centers)
- card-level-tests     (레벨 테스트·레벨테스트 | level test)
- card-enrollments     (수강신청 관리 | enrollment, course application)
- card-community       (커뮤니티·공지·게시판 | community, notice, board)
- card-textbooks       (교재 콘텐츠 | textbook content)
- card-pronunciation   (발음교정 메뉴 카드 — 발음교정 도구는 external_url 우선 사용 | pronunciation)
- card-review-quiz     (복습퀴즈 출제·퀴즈 | review quiz, AI quiz, quiz builder)
- card-students-mgmt   (학생 관리 카드 | student management card)
- card-teacher-mgmt    (강사 관리·교사 관리·강사 목록 | teacher management, teacher list)
- card-eval-mgmt       (학생 평가서·성적표 | evaluations, report card, grades)
- card-ai-eval-draft   (AI 평가서 초안·학습 리포트 초안 | AI evaluation draft, AI report draft)
- card-ai-lesson-report(AI 수업 리포트 | AI lesson report)
- card-attendance-status (출결 현황·출석 | attendance status)
- card-admin-alerts    (실시간 이상감지·이상 알림 | real-time anomaly alerts, monitoring)
- card-admin-ghost     (라이브 참관·고스트뷰 | live observation, ghost view)
- card-auto-dunning    (미납 자동 알림·독촉 | overdue/unpaid auto alert, dunning)
- card-settlement-stats(지점 정산·정산 통계 | branch settlement, settlement stats)
- card-points-mgmt     (포인트 관리 | points management)
- card-badges-mgmt     (뱃지 관리 | badge management)
- card-calendar        (캘린더·휴가·공휴일 | calendar, holidays, leave)
- card-kakao-mgmt      (카카오 알림톡 관리 | kakao alimtalk management)
- card-payments-b2c    (결제관리·수강료·학원비·납부 | payment, tuition, fee)
- card-recurring-billing(정기결제 자동화·자동결제·구독 | recurring billing, subscription)
- card-timetable       (통합 시간표·수업 연기·수업 변경·일정 변경 메뉴 | timetable, postpone/reschedule menu)
- card-auto-schedule   (AI 자동 시간표·자동 스케줄링·자동 배정 | AI auto-scheduling, auto timetable, auto assignment)
- card-retention-risk  (이탈위험·리텐션 | retention risk, churn)
- card-ai-insights     (AI 인사이트·AI가 찾은 경고 | AI insights)
- card-permissions     (권한 설정·권한 관리 | permissions)
- card-accounting-mgmt (회계관리 | accounting)
- card-class-attendance(출석현황·출결 | attendance status)
- card-homework        (숙제 관리 | homework)
- card-inquiry-mgmt    (신규상담·문의·상담 접수 | new inquiry, consultation intake)
- card-counseling-booking(상담 예약 | counseling booking)
- card-notice-board    (공지사항 게시판 | notice board)
- card-lesson-log      (수업 일지 | lesson log)
- card-recording-storage(녹화 관리 | recording management)
- card-popups-mgmt     (공지/팝업 관리·팝업 작성 | notice/popup management, popup editor)
- card-notifications   (알림 큐·푸시 알림 | notification queue, push)

Allowed query tools:
- today_stats        (오늘 매출·학생수·결석률·신규)
- weekly_dashboard   (최근 7일 출석·발화·재연결)
- find_student       args:{q:"이름"}  (학생 검색)
- revenue            args:{period:"day"|"month"|"year"}
- active_rooms       (현재 활성 화상수업)
- recent_recordings  args:{limit:10}

Allowed actions:
- send_kakao_self    args:{text:"메시지"}
- issue_sticker      args:{user_id:"ID",reason:"사유"}
- mark_intervention  args:{user_id:"ID",note:"메모"}

LANGUAGE RULE (critical):
- Detect the language of the user's command. If it is English, write EVERY "answer", "confirm_text" and "label" field in natural English. If Korean, write them in Korean. Mirror the user's language exactly.
- A USER_LANG hint may be provided in the context; honor it, but if the user's text is clearly in another language, follow the user's text.
- intent classification, url/menu_id/tool/args values stay the SAME regardless of language — only the human-readable text fields are localized.

Hard rules:
- ★ TOP RULE — NAVIGATE, DON'T EXPLAIN: whenever the user NAMES any admin screen/menu/feature (스케줄, 시간표, 자동 스케줄링, 강사관리, 결제, 미납, 평가서, 랭킹, 출석 등) with any wish to see/reach/handle it (가게/가줘/열어/보여줘/보고싶어/확인/어디/어떻게/관리하고싶어 …), you MUST return navigate to that screen. NEVER answer with an explanation or step list. Only use "answer" for a pure definition question ("~가 뭐야?", "what is ~?", 뜻/차이) that names NO reachable screen, or greetings.
- If the user wants to OPEN/GO TO a page (열어줘, 가줘, 이동, 페이지 | open, go to, show me ... page, where is, take me to, navigate) → navigate
- If the user asks for DATA/NUMBERS (매출, 출석, 학생수, 결석률, 방, 녹화, 통계, 어때, 보여줘 + data noun) → query
- If the user wants to DO/SEND/ISSUE something (보내줘, 발급해줘, 기록해줘) → action
- If the user wants to REGISTER/CHANGE/POSTPONE class schedules or LEVEL TEST (수업 등록, 수업 변경, 수업 연기, 수업 잡아, 레벨테스트, 등록해줘 + 학생/요일/시간) → schedule_plan
- If the user wants to BULK MODIFY existing schedules (~의 모든 수업, 다음주 수업 모두, 월요일 수업 전체 + 미뤄/취소/이동) → bulk_modify
- Otherwise, ONLY a pure definition/what-is question with no reachable screen → answer. If any screen is named, prefer navigate over answer.
- 전체 학생 스케줄 / 전체학생 스케줄 / 전교생 스케줄 / 모든 학생 스케줄 / 전체 스케줄 / 전체 일정 / 학원 전체 일정 (열어줘·보여줘·open·show) → navigate url /admin/all-schedules.html
- NEVER reply to an OPEN/SHOW/GO-TO request (열어줘, 열어, 보여줘, 가줘, 이동, open, show, go to, take me to) with step-by-step manual instructions such as "1. 로그인 2. 메뉴 선택 3. 클릭". Such requests are ALWAYS navigate (or query). Keep every "answer" to ONE short sentence and never invent UI steps, button names, or menu paths.
- If the user asks a TEACHER's SCHEDULE/TIMETABLE (강사/선생님/쌤 + 스케줄/시간표/일정) WITHOUT registering a class → navigate url /admin/weekly-schedule.html (강사명 있으면 ?q=이름). If they ask teacher INFO/관리 (not schedule) → navigate menu_id card-teacher-mgmt
- If the user wants AUTO-SCHEDULING (자동 스케줄링, 자동 시간표, AI 시간표, 자동 배정) → navigate menu_id card-auto-schedule. NEVER explain the steps — just navigate.
- If the user wants to PAY / asks about tuition menu (결제, 결제관리, 수강료, 학원비, 납부) → navigate menu_id card-payments-b2c (정기결제·자동결제·구독이면 card-recurring-billing)
- If the user expresses INTENT to postpone/change a class but gives NO student name+date (e.g. "수업 연기하고 싶어", "일정 변경할래") → navigate menu_id card-timetable. Only use schedule_plan when a student name AND day/time/date are present.

Schedule parsing rules (for schedule_plan intent):
- Days mapping: 월=mon 화=tue 수=wed 목=thu 금=fri 토=sat 일=sun
- Multi-day shorthand: 월수금=["mon","wed","fri"], 화목=["tue","thu"], 월화수목금=["mon","tue","wed","thu","fri"]
- Time: "3시40분"="15:40" (default PM 13-19 for student classes), "오후 5시"="17:00", "오전 10시"="10:00", "4시"="16:00" (default PM)
- "다음주 월요일" = use Next Monday date provided in system
- One command may contain MULTIPLE schedule items - put each as separate item in items array
- type: "level_test" for 레벨테스트/레벨 테스트, "trial" for 체험수업, "regular" for normal recurring class
- For recurring (요일 반복): action="register_recurring", fill days[] and time, leave date null
- For one-off (특정 날짜): action="schedule_one_off", fill date and time, leave days null
- "변경"=change_schedule, "연기"=postpone_class

Bulk modify rules (for bulk_modify intent):
- "정우영 학생 다음주 모든 수업 1시간 미뤄줘" → operation:"reschedule", criteria:{student_name:"정우영", date_from:"<TOMORROW>", date_to:"<TODAY+14d>"}, shift_minutes:60
- "월요일 4시 수업 모두 취소" → operation:"cancel", criteria:{days:["mon"], time:"16:00"}
- "정우영 다음주 모든 수업 연기" → operation:"postpone", criteria:{student_name:"정우영", date_from:"<TOMORROW>", date_to:"<TODAY+14d>"}
- shift_minutes can be negative for moving earlier (예: "30분 앞당겨" → -30)
- If teacher mentioned (예: "김선생님 수업"), also include teacher_name in criteria

Examples (study these carefully):

User: "학생관리 열어 줘"
Output: {"intent":"navigate","url":"/admin/students.html","answer":"학생관리 페이지로 이동합니다."}

User: "오늘 매출 어때?"
Output: {"intent":"query","tool":"today_stats","args":{},"answer":"오늘 지표를 조회합니다."}

User: "김민수 학생 정보"
Output: {"intent":"query","tool":"find_student","args":{"q":"김민수"},"answer":"김민수 학생을 검색합니다."}

User: "이번달 매출 보여줘"
Output: {"intent":"query","tool":"revenue","args":{"period":"month"},"answer":"이번달 매출을 조회합니다."}

User: "지금 수업 중인 방"
Output: {"intent":"query","tool":"active_rooms","args":{},"answer":"활성 수업방을 조회합니다."}

User: "최근 녹화 10개"
Output: {"intent":"query","tool":"recent_recordings","args":{"limit":10},"answer":"최근 녹화를 조회합니다."}

User: "내 카톡으로 안녕 보내줘"
Output: {"intent":"action","name":"send_kakao_self","args":{"text":"안녕"},"confirm_text":"내 카톡 메모챗으로 '안녕' 보낼까요?","answer":"확인을 눌러주세요."}

User: "발음연습이 뭐야?"
Output: {"intent":"answer","answer":"발음연습은 학생이 영어 단어를 말하면 AI가 정확도를 평가하는 학습 도구입니다."}

User: "관리자 마이페이지"
Output: {"intent":"navigate","url":"/admin/mypage.html","answer":"마이페이지로 이동합니다."}

User: "시스템 상태"
Output: {"intent":"navigate","url":"/admin/health.html","answer":"시스템 상태 페이지로 이동합니다."}

User: "발음 교정 열어줘"
Output: {"intent":"navigate","external_url":"https://mangoi-speech.pages.dev/practice","answer":"발음 교정 도구를 새 탭에서 엽니다."}

User: "발음 연습"
Output: {"intent":"navigate","external_url":"https://mangoi-speech.pages.dev/practice","answer":"발음 연습 도구를 새 탭에서 엽니다."}

User: "성적표 보여줘"
Output: {"intent":"navigate","menu_id":"card-eval-mgmt","answer":"학생 평가서(성적표) 카드로 이동합니다."}

User: "평가서 열어줘"
Output: {"intent":"navigate","menu_id":"card-eval-mgmt","answer":"학생 평가서 카드로 이동합니다."}

User: "강사 급여 보여줘"
Output: {"intent":"navigate","menu_id":"card-payroll","answer":"강사 급여 카드로 이동합니다."}

User: "레벨테스트 열어줘"
Output: {"intent":"navigate","menu_id":"card-level-tests","answer":"레벨 테스트 카드로 이동합니다."}

User: "레벨 테스트"
Output: {"intent":"navigate","menu_id":"card-level-tests","answer":"레벨 테스트 카드로 이동합니다."}

User: "가맹점 관리 열어줘"
Output: {"intent":"navigate","menu_id":"card-franchises","answer":"가맹점 관리 카드로 이동합니다."}

User: "교육센터 보여줘"
Output: {"intent":"navigate","menu_id":"card-centers","answer":"교육센터 카드로 이동합니다."}

User: "수강신청 열어줘"
Output: {"intent":"navigate","menu_id":"card-enrollments","answer":"수강신청 관리 카드로 이동합니다."}

User: "커뮤니티"
Output: {"intent":"navigate","menu_id":"card-community","answer":"커뮤니티 카드로 이동합니다."}

User: "교재 콘텐츠"
Output: {"intent":"navigate","menu_id":"card-textbooks","answer":"교재 콘텐츠 카드로 이동합니다."}

User: "일자별 차트"
Output: {"intent":"navigate","menu_id":"card-daily-charts","answer":"일자별 차트 카드로 이동합니다."}

User: "학생 랭킹"
Output: {"intent":"navigate","menu_id":"card-rankings","answer":"학생 랭킹 카드로 이동합니다."}

User: "전체 스케줄 보여줘"
Output: {"intent":"navigate","url":"/admin/all-schedules.html","answer":"학원 전체 스케줄 페이지로 이동합니다."}

User: "학원 전체 일정"
Output: {"intent":"navigate","url":"/admin/all-schedules.html","answer":"학원 전체 스케줄 페이지로 이동합니다."}

User: "전체학생 스케줄 열어줘"
Output: {"intent":"navigate","url":"/admin/all-schedules.html","answer":"학원 전체 학생 스케줄 페이지로 이동합니다."}

User: "전체 학생 스케줄 보여줘"
Output: {"intent":"navigate","url":"/admin/all-schedules.html","answer":"학원 전체 학생 스케줄 페이지로 이동합니다."}

User: "전교생 스케줄"
Output: {"intent":"navigate","url":"/admin/all-schedules.html","answer":"학원 전체 스케줄 페이지로 이동합니다."}

User: "show all student schedules"
Output: {"intent":"navigate","url":"/admin/all-schedules.html","answer":"Opening the academy-wide student schedule page."}

User: "안민서 학생 월수금 3시40분 정우영 학생 화목 4시 등록하고 홍길동 학생 다음주 월요일 오후 5시에 레벨테스트 할 수 있게 해줘"
Output: {"intent":"schedule_plan","answer":"3개의 스케줄을 파싱했습니다. 확인 후 등록해 주세요.","confirm_text":"3건의 수업 스케줄을 모두 등록할까요?","items":[{"action":"register_recurring","student_name":"안민서","days":["mon","wed","fri"],"date":null,"time":"15:40","type":"regular","label":"안민서 - 월/수/금 15:40 정규수업"},{"action":"register_recurring","student_name":"정우영","days":["tue","thu"],"date":null,"time":"16:00","type":"regular","label":"정우영 - 화/목 16:00 정규수업"},{"action":"schedule_one_off","student_name":"홍길동","days":null,"date":"<NEXT_MONDAY>","time":"17:00","type":"level_test","label":"홍길동 - 다음주 월요일 17:00 레벨테스트"}]}

User: "김민수 학생 매주 화목 4시 등록"
Output: {"intent":"schedule_plan","answer":"1개의 스케줄을 파싱했습니다.","confirm_text":"김민수 화/목 16:00 등록할까요?","items":[{"action":"register_recurring","student_name":"김민수","days":["tue","thu"],"date":null,"time":"16:00","type":"regular","label":"김민수 - 화/목 16:00 정규수업"}]}

User: "이지원 학생 내일 오후 3시 수업 연기"
Output: {"intent":"schedule_plan","answer":"이지원 학생 연기 요청을 파싱했습니다.","confirm_text":"이지원 학생 내일 15:00 수업을 연기할까요?","items":[{"action":"postpone_class","student_name":"이지원","days":null,"date":"<TOMORROW>","time":"15:00","type":"regular","label":"이지원 - 내일 15:00 수업 연기"}]}

User: "정우영 학생 신규인데 월요일 체험수업 오후 4시, 금요일 정규수업 오후 8시"
Output: {"intent":"schedule_plan","answer":"정우영 학생의 체험수업과 정규수업을 파싱했습니다.","confirm_text":"체험수업 1건 + 정규수업 1건 등록할까요?","items":[{"action":"register_recurring","student_name":"정우영","days":["mon"],"date":null,"time":"16:00","type":"trial","label":"정우영 - 매주 월 16:00 체험수업"},{"action":"register_recurring","student_name":"정우영","days":["fri"],"date":null,"time":"20:00","type":"regular","label":"정우영 - 매주 금 20:00 정규수업"}]}

User: "최수아 학생 토요일 오전 11시 체험수업 한번 잡아줘"
Output: {"intent":"schedule_plan","answer":"최수아 학생 체험수업 1건을 파싱했습니다.","confirm_text":"최수아 학생 매주 토 11:00 체험수업 등록할까요?","items":[{"action":"register_recurring","student_name":"최수아","days":["sat"],"date":null,"time":"11:00","type":"trial","label":"최수아 - 매주 토 11:00 체험수업"}]}

User: "박지민 학생 다음주 화요일 오후 3시 레벨테스트"
Output: {"intent":"schedule_plan","answer":"박지민 학생 레벨테스트 일정을 파싱했습니다.","confirm_text":"박지민 학생 다음주 화 15:00 레벨테스트 등록할까요?","items":[{"action":"schedule_one_off","student_name":"박지민","days":null,"date":"<NEXT_TUE>","time":"15:00","type":"level_test","label":"박지민 - 다음주 화 15:00 레벨테스트"}]}

User: "박민수 학생을 김선생님에게 월수금 5시 정규수업 등록"
Output: {"intent":"schedule_plan","answer":"박민수 학생 김선생님 배정 스케줄을 파싱했습니다.","confirm_text":"박민수 - 김선생님 - 월/수/금 17:00 등록할까요?","items":[{"action":"register_recurring","student_name":"박민수","teacher_name":"김선생님","days":["mon","wed","fri"],"date":null,"time":"17:00","type":"regular","label":"박민수 - 김선생 - 월/수/금 17:00"}]}

User: "정우영 학생 다음주 모든 수업 1시간 미뤄줘"
Output: {"intent":"bulk_modify","operation":"reschedule","criteria":{"student_name":"정우영","date_from":"<TOMORROW>","date_to":"<TODAY+14d>"},"shift_minutes":60,"answer":"정우영 학생의 다음 2주 수업을 1시간 뒤로 미룹니다.","confirm_text":"정우영 학생 다음 2주 모든 수업을 1시간 미룰까요?"}

User: "월요일 4시 수업 모두 취소해줘"
Output: {"intent":"bulk_modify","operation":"cancel","criteria":{"days":["mon"],"time":"16:00"},"answer":"매주 월요일 16:00 모든 수업을 취소합니다.","confirm_text":"월요일 16:00 모든 수업을 취소할까요?"}

User: "open student management"
Output: {"intent":"navigate","url":"/admin/students.html","answer":"Opening the student management page."}

User: "where is the AI quiz?"
Output: {"intent":"navigate","menu_id":"card-review-quiz","answer":"Here is the Review Quiz builder."}

User: "where is a.i quiz"
Output: {"intent":"navigate","menu_id":"card-review-quiz","answer":"Opening the Review Quiz card."}

User: "show me today's revenue"
Output: {"intent":"query","tool":"today_stats","args":{},"answer":"Fetching today's metrics."}

User: "how's this month's revenue"
Output: {"intent":"query","tool":"revenue","args":{"period":"month"},"answer":"Fetching this month's revenue."}

User: "find student Kim Minsu"
Output: {"intent":"query","tool":"find_student","args":{"q":"Kim Minsu"},"answer":"Searching for Kim Minsu."}

User: "open teacher management"
Output: {"intent":"navigate","menu_id":"card-teacher-mgmt","answer":"Opening the teacher management card."}

User: "go to evaluations"
Output: {"intent":"navigate","menu_id":"card-eval-mgmt","answer":"Opening the student evaluations card."}

User: "show real-time anomaly alerts"
Output: {"intent":"navigate","menu_id":"card-admin-alerts","answer":"Opening the real-time anomaly alerts card."}

User: "open overdue payment alerts"
Output: {"intent":"navigate","menu_id":"card-auto-dunning","answer":"Opening the overdue payment auto-alert card."}

User: "open pronunciation practice"
Output: {"intent":"navigate","external_url":"https://mangoi-speech.pages.dev/practice","answer":"Opening the pronunciation practice tool in a new tab."}

User: "what is the review quiz?"
Output: {"intent":"answer","answer":"The Review Quiz lets you create quizzes that students solve and get auto-graded for revision."}

User: "open level test"
Output: {"intent":"navigate","menu_id":"card-level-tests","answer":"Opening the level test card."}

User: "show the full schedule"
Output: {"intent":"navigate","url":"/admin/all-schedules.html","answer":"Opening the academy-wide schedule page."}

User: "자동 스케줄링 메뉴로 가게 해줘"
Output: {"intent":"navigate","menu_id":"card-auto-schedule","answer":"AI 자동 시간표(자동 스케줄링) 카드로 이동합니다."}

User: "AI 자동 시간표 열어줘"
Output: {"intent":"navigate","menu_id":"card-auto-schedule","answer":"AI 자동 시간표 카드로 이동합니다."}

User: "chaine 선생님 혹시 스케줄 어때?"
Output: {"intent":"navigate","url":"/admin/weekly-schedule.html?q=chaine","answer":"주간 스케줄에서 chaine 선생님 일정을 보여드릴게요."}

User: "김선생님 스케줄 보여줘"
Output: {"intent":"navigate","url":"/admin/weekly-schedule.html?q=김","answer":"주간 스케줄에서 김 선생님 일정을 보여드릴게요."}

User: "강사 시간표 보여줘"
Output: {"intent":"navigate","url":"/admin/weekly-schedule.html","answer":"주간 전체 스케줄(모든 강사)로 이동합니다."}

User: "김선생님 정보 보여줘"
Output: {"intent":"navigate","menu_id":"card-teacher-mgmt","answer":"강사관리 카드로 이동합니다."}

User: "결제 관리 열어줘"
Output: {"intent":"navigate","menu_id":"card-payments-b2c","answer":"결제관리 카드로 이동합니다."}

User: "수강료 어디서 봐?"
Output: {"intent":"navigate","menu_id":"card-payments-b2c","answer":"결제관리 카드로 이동합니다."}

User: "정기결제 설정"
Output: {"intent":"navigate","menu_id":"card-recurring-billing","answer":"정기결제 자동화 카드로 이동합니다."}

User: "수업 연기하고 싶어"
Output: {"intent":"navigate","menu_id":"card-timetable","answer":"통합 시간표에서 수업을 연기·변경할 수 있어요."}

User: "일정 변경할래"
Output: {"intent":"navigate","menu_id":"card-timetable","answer":"통합 시간표 카드로 이동합니다."}

User: "성적표 어디서 봐?"
Output: {"intent":"navigate","menu_id":"card-eval-mgmt","answer":"학생 평가서(성적표) 카드로 이동합니다."}

User: "숙제 관리"
Output: {"intent":"navigate","menu_id":"card-homework","answer":"숙제 관리 카드로 이동합니다."}

User: "출석 현황 보여줘"
Output: {"intent":"navigate","menu_id":"card-class-attendance","answer":"출석현황 카드로 이동합니다."}

User: "신규 상담 들어왔어?"
Output: {"intent":"navigate","menu_id":"card-inquiry-mgmt","answer":"신규상담 카드로 이동합니다."}

User: "팝업 기능"
Output: {"intent":"navigate","menu_id":"card-popups-mgmt","answer":"공지/팝업 관리 카드로 이동합니다."}

User: "공지 팝업 만들래"
Output: {"intent":"navigate","menu_id":"card-popups-mgmt","answer":"공지/팝업 관리 카드로 이동합니다."}

User: "알림"
Output: {"intent":"navigate","menu_id":"card-notifications","answer":"알림 큐 카드로 이동합니다."}

User: "단체 등록"
Output: {"intent":"navigate","menu_id":"card-enrollments","answer":"수강신청 관리(단체/일괄 등록) 카드로 이동합니다."}

User: "정우영 학생 열어줘"
Output: {"intent":"query","tool":"find_student","args":{"q":"정우영"},"answer":"정우영 학생을 검색합니다."}

User: "홍길동 학생"
Output: {"intent":"query","tool":"find_student","args":{"q":"홍길동"},"answer":"홍길동 학생을 검색합니다."}

Output rule: Only one valid JSON object. No "Output:" prefix, no markdown fences, no commentary.`;

// ══════════════════════════════════════════════════════════════════════
// 🧭 결정론적 내비게이션 라우터 (Phase 23)
//   문제: Llama 가 "○○ 메뉴로 가게 해줘" 같은 이동 명령을 자주 "설명(prose)"
//         으로만 답하고 실제로 이동시키지 못함. (예: 자동 스케줄링 메뉴)
//   해결: 이동 의도가 분명하면 LLM 을 거치지 않고 즉시 navigate 로 응답하고,
//         LLM 이 answer(설명)로 잘못 답해도 이 라우터가 교정한다.
//   ⚠️ 여기의 menu_id / url 은 admin.html 의 실제 요소와 1:1 로 검증되어야 함.
// ══════════════════════════════════════════════════════════════════════

// "이동하고 싶다"는 의도가 담긴 동사/어구
const NAV_VERB_RE = /(열어|열기|열어봐|띄워|보여줘|보여 줘|보여줄|보기|보러|가게|가 게|가줘|가 줘|가자|가고|로\s*가|으로\s*가|이동|들어가|바로가기|바로 가기|메뉴로|화면으로|페이지로|open|go to|goto|show|take me|navigate|where is|jump)/i;

// 이건 단순 이동이 아님 — 등록/변경/발송 등 실제 작업이라 LLM(schedule/action)에 맡긴다.
//  ⚠️ 메뉴 이름에 들어가는 단어(예약='상담 예약', 배정='자동 배정', 만들어='팝업 만들래')는
//     넣지 않는다. 넣으면 그 화면으로 못 가고 설명으로 새어버림.
const NAV_BLOCK_RE = /(등록|잡아|변경|연기|미뤄|앞당|옮겨|취소|삭제|발급|발송|보내|기록해|register|enroll|reschedul|postpone|cancel|delete|issue|send)/i;

// 순수 '정의/뜻' 질문만 설명(answer) 허용. 그 외 화면 지목은 무조건 이동.
//  · "발음연습이 뭐야?" → 설명 OK  /  "발음연습 열어줘"·"발음연습 어디야" → 이동
//  · 단, 이동 동사(NAV_VERB)가 함께 있으면 정의질문이라도 이동을 우선한다.
const DEFINITION_RE = /(뭐야|뭔가요|무엇|뭐예요|뭐에요|뭐죠|뜻이|뜻은|뜻이야|의미가|의미는|정의|차이|what\s*is|what'?s|difference)/i;

type NavTarget = { menu_id?: string; url?: string; external_url?: string; ko: string; en: string; confidence?: 'high' | 'normal' };

// 키워드 → 카드/페이지 라우트 (순서 중요: 구체적인 것을 위에 둔다)
const CARD_ROUTES: Array<{ re: RegExp; menu_id?: string; url?: string; external_url?: string; ko: string; en: string }> = [
  // ※ 스케줄/시간표/자동스케줄은 resolveNav() 상단에서 먼저 처리(주간 스케줄 페이지·자동시간표 카드)
  // ── 평가/리포트 (AI 초안 → 리포트 → 일반 평가서 순) ──
  { re: /(ai\s*평가서|평가서\s*초안|학습\s*리포트\s*초안|ai\s*(evaluation|report)\s*draft)/i, menu_id: 'card-ai-eval-draft', ko: 'AI 평가서 초안 카드로 이동합니다.', en: 'Opening the AI evaluation draft card.' },
  { re: /(ai\s*수업\s*리포트|수업\s*리포트|ai\s*lesson\s*report)/i, menu_id: 'card-ai-lesson-report', ko: 'AI 수업 리포트 카드로 이동합니다.', en: 'Opening the AI lesson report card.' },
  { re: /(평가서|성적표|성적\s*관리|평가\s*관리|report\s*card|evaluation|grades?)/i, menu_id: 'card-eval-mgmt', ko: '학생 평가서(성적표) 카드로 이동합니다.', en: 'Opening the student evaluations card.' },
  // ── 결제/정산/회계 (정기결제·미납 → 일반결제 순) ──
  { re: /(정기결제|자동결제|자동\s*결제|구독|recurring|subscription)/i, menu_id: 'card-recurring-billing', ko: '정기결제 자동화 카드로 이동합니다.', en: 'Opening the recurring billing card.' },
  { re: /(미납|독촉|미수금|dunning|overdue)/i, menu_id: 'card-auto-dunning', ko: '미납 자동 알림(독촉) 카드로 이동합니다.', en: 'Opening the overdue payment auto-alert card.' },
  { re: /(결제\s*관리|결제관리|수강료|학원비|납부|tuition|payment|\bfee\b)/i, menu_id: 'card-payments-b2c', ko: '결제관리 카드로 이동합니다.', en: 'Opening the payments card.' },
  { re: /(강사\s*급여|급여|payroll|salary)/i, menu_id: 'card-payroll', ko: '강사 급여 카드로 이동합니다.', en: 'Opening the teacher payroll card.' },
  { re: /(지점\s*정산|지사\s*정산|대리점\s*정산|본사\s*정산|정산\s*통계|정산|settlement)/i, menu_id: 'card-settlement-stats', ko: '지점 정산 카드로 이동합니다.', en: 'Opening the settlement stats card.' },
  { re: /(회계\s*관리|회계관리|accounting)/i, menu_id: 'card-accounting-mgmt', ko: '회계관리 카드로 이동합니다.', en: 'Opening the accounting card.' },
  // ── 강사/학생 관리 ──
  { re: /(강사\s*관리|교사\s*관리|선생님?\s*관리|강사\s*목록|teacher\s*(management|list))/i, menu_id: 'card-teacher-mgmt', ko: '강사관리 카드로 이동합니다.', en: 'Opening the teacher management card.' },
  { re: /(학생\s*관리|학생관리|student\s*management)/i, url: '/admin/students.html', ko: '학생관리 페이지로 이동합니다.', en: 'Opening the student management page.' },
  // ── 출결/숙제/일지 ──
  { re: /(출석\s*현황|출결\s*현황|출결\s*관리|출석부|attendance)/i, menu_id: 'card-class-attendance', ko: '출석현황 카드로 이동합니다.', en: 'Opening the attendance card.' },
  { re: /(숙제|homework)/i, menu_id: 'card-homework', ko: '숙제 관리 카드로 이동합니다.', en: 'Opening the homework card.' },
  { re: /(수업\s*일지|수업일지|lesson\s*log)/i, menu_id: 'card-lesson-log', ko: '수업 일지 카드로 이동합니다.', en: 'Opening the lesson log card.' },
  // ── 차트/랭킹/인사이트 ──
  { re: /(일자별|일별\s*차트|매출\s*차트|성장\s*차트|daily\s*chart)/i, menu_id: 'card-daily-charts', ko: '일자별 차트 카드로 이동합니다.', en: 'Opening the daily charts card.' },
  { re: /(랭킹|순위|ranking)/i, menu_id: 'card-rankings', ko: '학생 랭킹 카드로 이동합니다.', en: 'Opening the student ranking card.' },
  { re: /(이탈\s*위험|이탈위험|리텐션|retention\s*risk|churn)/i, menu_id: 'card-retention-risk', ko: '이탈위험 카드로 이동합니다.', en: 'Opening the retention-risk card.' },
  { re: /(ai\s*인사이트|ai\s*insight)/i, menu_id: 'card-ai-insights', ko: 'AI 인사이트 카드로 이동합니다.', en: 'Opening the AI insights card.' },
  // ── 모니터링/알림 ──
  { re: /(이상감지|이상\s*감지|이상\s*알림|이상\s*징후|실시간\s*알림|anomaly|monitoring)/i, menu_id: 'card-admin-alerts', ko: '실시간 이상감지 카드로 이동합니다.', en: 'Opening the real-time anomaly alerts card.' },
  { re: /(고스트|참관|라이브\s*참관|ghost|live\s*observation)/i, menu_id: 'card-admin-ghost', ko: '라이브 참관(고스트뷰) 카드로 이동합니다.', en: 'Opening the live observation card.' },
  { re: /(카카오|알림톡|카톡\s*관리|kakao|alimtalk)/i, menu_id: 'card-kakao-mgmt', ko: '카카오 알림톡 관리 카드로 이동합니다.', en: 'Opening the Kakao alimtalk card.' },
  { re: /(팝업|popup)/i, menu_id: 'card-popups-mgmt', ko: '공지/팝업 관리 카드로 이동합니다.', en: 'Opening the popup management card.' },
  { re: /(공지사항|공지\s*게시판|notice\s*board)/i, menu_id: 'card-notice-board', ko: '공지사항 게시판 카드로 이동합니다.', en: 'Opening the notice board card.' },
  { re: /(알림\s*큐|푸시\s*알림|알림\s*설정|notification|push)/i, menu_id: 'card-notifications', ko: '알림 큐 카드로 이동합니다.', en: 'Opening the notification queue card.' },
  // ── 학습/콘텐츠 ──
  { re: /(레벨\s*테스트|레벨테스트|level\s*test)/i, menu_id: 'card-level-tests', ko: '레벨 테스트 카드로 이동합니다.', en: 'Opening the level test card.' },
  { re: /(복습\s*퀴즈|퀴즈|review\s*quiz|ai\s*quiz)/i, menu_id: 'card-review-quiz', ko: '복습퀴즈 카드로 이동합니다.', en: 'Opening the review quiz card.' },
  { re: /(교재\s*콘텐츠|교재|textbook)/i, menu_id: 'card-textbooks', ko: '교재 콘텐츠 카드로 이동합니다.', en: 'Opening the textbook content card.' },
  { re: /(발음\s*교정|발음\s*연습|pronunciation)/i, external_url: 'https://mangoi-speech.pages.dev/practice', ko: '발음 교정 도구를 새 탭에서 엽니다.', en: 'Opening the pronunciation practice tool in a new tab.' },
  // ── 조직/상담/기타 ──
  { re: /(가맹점|프랜차이즈|franchise|branch)/i, menu_id: 'card-franchises', ko: '가맹점 관리 카드로 이동합니다.', en: 'Opening the franchises card.' },
  { re: /(교육\s*센터|학습\s*센터|센터\s*관리|education\s*center)/i, menu_id: 'card-centers', ko: '교육센터 카드로 이동합니다.', en: 'Opening the education centers card.' },
  { re: /(수강\s*신청|수강신청|enrollment|course\s*application)/i, menu_id: 'card-enrollments', ko: '수강신청 관리 카드로 이동합니다.', en: 'Opening the enrollments card.' },
  { re: /(신규\s*상담|문의\s*관리|상담\s*접수|inquiry|consultation\s*intake)/i, menu_id: 'card-inquiry-mgmt', ko: '신규상담 카드로 이동합니다.', en: 'Opening the new inquiry card.' },
  { re: /(상담\s*예약|counseling\s*booking)/i, menu_id: 'card-counseling-booking', ko: '상담 예약 카드로 이동합니다.', en: 'Opening the counseling booking card.' },
  { re: /(커뮤니티|community)/i, menu_id: 'card-community', ko: '커뮤니티 카드로 이동합니다.', en: 'Opening the community card.' },
  { re: /(포인트\s*관리|포인트|\bpoints?\b)/i, menu_id: 'card-points-mgmt', ko: '포인트 관리 카드로 이동합니다.', en: 'Opening the points card.' },
  { re: /(뱃지|배지|badge)/i, menu_id: 'card-badges-mgmt', ko: '뱃지 관리 카드로 이동합니다.', en: 'Opening the badge management card.' },
  { re: /(캘린더|달력|공휴일|휴가|calendar|holiday)/i, menu_id: 'card-calendar', ko: '캘린더 카드로 이동합니다.', en: 'Opening the calendar card.' },
  { re: /(녹화\s*관리|녹화\s*저장|recording\s*(management|storage))/i, menu_id: 'card-recording-storage', ko: '녹화 관리 카드로 이동합니다.', en: 'Opening the recording management card.' },
  { re: /(권한\s*설정|권한\s*관리|권한|permission)/i, menu_id: 'card-permissions', ko: '권한 설정 카드로 이동합니다.', en: 'Opening the permissions card.' },
];

const SCHEDULE_WORD_RE = /(스케줄|스케쥴|시간표|일정|타임테이블|schedule|timetable|time\s*table)/i;
const TEACHER_WORD_RE = /(강사|선생님|선생|쌤|teacher)/i;

// 강사명 추출: "chaine 선생님", "김선생님", "강사 chaine" 등에서 이름만
function extractTeacherName(cmd: string): string {
  const bad = /^(스케줄|스케쥴|시간표|일정|관리|정보|수업|급여|목록|현황|배정|매칭|대체|결석)$/;
  let m = cmd.match(/([A-Za-z][A-Za-z.]{1,19}|[가-힣]{2,4})\s*(?:선생님|선생|쌤|강사님)/);
  if (m && !bad.test(m[1])) return m[1].trim();
  m = cmd.match(/(?:강사|선생님|teacher)\s*[:\-]?\s*([A-Za-z][A-Za-z.]{1,19}|[가-힣]{2,4})/i);
  if (m && !bad.test(m[1])) return m[1].trim();
  return '';
}

// 자연어 → 이동 대상 결정 (없으면 null)
function resolveNav(cmd: string): NavTarget | null {
  // 0) AI 자동 시간표(자동 스케줄링) — '시간표' 일반 규칙보다 먼저 잡아야 함.
  if (/(자동\s*스케줄|자동\s*시간표|ai\s*시간표|시간표\s*자동|자동\s*배정|자동\s*편성|auto[-\s]?schedul)/i.test(cmd)) {
    return { menu_id: 'card-auto-schedule', ko: 'AI 자동 시간표(자동 스케줄링) 카드로 이동합니다.', en: 'Opening the AI auto-scheduling card.', confidence: 'high' };
  }
  // 1) 강사/선생님 + 스케줄/시간표 → 주간 전체 스케줄(강사명 있으면 필터). 고신뢰.
  if (TEACHER_WORD_RE.test(cmd) && SCHEDULE_WORD_RE.test(cmd)) {
    const name = extractTeacherName(cmd);
    // URL 쿼리에 넣을 이름은 안전 문자만 허용
    const safe = name && /^[A-Za-z0-9가-힣 .]{1,20}$/.test(name) ? name : '';
    const qs = safe ? ('?q=' + encodeURIComponent(safe)) : '';
    return {
      url: '/admin/weekly-schedule.html' + qs,
      ko: safe ? `주간 스케줄에서 ${safe} 강사 일정을 보여드릴게요.` : '주간 전체 스케줄(모든 강사)로 이동합니다.',
      en: safe ? `Showing ${safe}'s schedule in the weekly view.` : 'Opening the weekly schedule (all teachers).',
      confidence: 'high'
    };
  }
  // 2) 그 외 스케줄/시간표/일정 조회 → 주간 전체 스케줄 페이지(실제 시간표 화면). 고신뢰.
  //    (수업 연기·변경 메뉴는 NAV_BLOCK 에 걸려 여기까지 안 오고 LLM 이 card-timetable 로 처리)
  if (SCHEDULE_WORD_RE.test(cmd)) {
    return { url: '/admin/weekly-schedule.html', ko: '주간 전체 스케줄 페이지로 이동합니다.', en: 'Opening the weekly schedule page.', confidence: 'high' };
  }
  // 3) 홈·마이페이지·시스템 상태
  if (/(관리자\s*홈|대시보드|메인\s*화면|admin\s*home|dashboard)/i.test(cmd)) {
    return { url: '/admin.html', ko: '관리자 홈으로 이동합니다.', en: 'Going to the admin home.', confidence: 'normal' };
  }
  if (/(마이\s*페이지|내\s*정보|my\s*page|profile)/i.test(cmd)) {
    return { url: '/admin/mypage.html', ko: '마이페이지로 이동합니다.', en: 'Opening my page.', confidence: 'normal' };
  }
  if (/(시스템\s*상태|서버\s*상태|헬스\s*체크|system\s*(health|status)|health\s*check)/i.test(cmd)) {
    return { url: '/admin/health.html', ko: '시스템 상태 페이지로 이동합니다.', en: 'Opening the system health page.', confidence: 'normal' };
  }
  // 4) 키워드 카드 테이블
  for (const r of CARD_ROUTES) {
    if (r.re.test(cmd)) {
      return { menu_id: r.menu_id, url: r.url, external_url: r.external_url, ko: r.ko, en: r.en, confidence: 'normal' };
    }
  }
  return null;
}

// ── 이동 판정 단일 진입점 (프리라우터·교정에서 공통 사용, 테스트에서도 import) ──
//    작업어(NAV_BLOCK) 또는 이동동사 없는 순수 정의질문이면 이동하지 않는다(→ LLM).
export function routeNavigation(cmd: string): NavTarget | null {
  if (NAV_BLOCK_RE.test(cmd)) return null;
  if (DEFINITION_RE.test(cmd) && !NAV_VERB_RE.test(cmd)) return null;
  return resolveNav(cmd);
}

// NavTarget → API 응답
function buildNavResponse(nav: NavTarget, en: boolean): any {
  const out: any = { ok: true, intent: 'navigate', answer: en ? nav.en : nav.ko, resolved_by: 'router' };
  if (nav.external_url) out.external_url = nav.external_url;
  else if (nav.menu_id) out.menu_id = nav.menu_id;
  else if (nav.url) out.url = nav.url;
  return out;
}

// ──────────────────────────────────────────────────────────
// LLM 호출 — Workers AI Llama 3.3 70B
// ──────────────────────────────────────────────────────────
async function callLLM(env: { AI?: any }, command: string, lang: string = 'ko'): Promise<any> {
  if (!env.AI) {
    throw new Error('AI binding not configured (wrangler.toml [ai] missing)');
  }

  // 현재 KST 날짜 + 다음주 월요일/내일 계산해서 system prompt 의 placeholder 치환
  // → AI 가 "다음주 월요일", "내일" 같은 상대 날짜를 정확한 ISO 로 변환할 수 있도록
  const now = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const todayIso = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  const dow = now.getUTCDay(); // 0=일 1=월 ... 6=토
  const daysToNextMon = dow === 0 ? 1 : (8 - dow);
  const nextMon = new Date(now.getTime() + daysToNextMon * 86400000);
  const nextMonIso = nextMon.toISOString().slice(0, 10);
  const dateContext = `Today (KST): ${todayIso} (${['일','월','화','수','목','금','토'][dow]}요일). Tomorrow: ${tomorrowIso}. Next Monday: ${nextMonIso}. Use these exact dates when user says "오늘/내일/다음주 월요일" etc.`;

  // Workers AI JSON 모드 — response_format 으로 JSON 강제
  // Phase 21e: temp 0.3→0.1 로 낮춰 결정성 강화
  // Phase 22: max_tokens 400→900 (스케줄 multi-item 대응)
  // 사용자 언어 힌트 — en 이면 영어로, ko 면 한국어로 응답 텍스트 작성
  const langName = lang === 'en' ? 'English' : 'Korean';
  const langDirective = `USER_LANG = ${lang} (${langName}). Write every "answer", "confirm_text" and "label" field in ${langName}. If the user's command itself is clearly written in a different language, follow the user's command language instead.`;

  const result = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + '\n\n' + dateContext + '\n\n' + langDirective },
      { role: 'user', content: command }
    ],
    max_tokens: 900,
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });

  // Workers AI 응답: { response: "..." } or { response: "..." } 형태
  const raw = (result?.response || result?.result?.response || '').trim();
  if (!raw) throw new Error('empty AI response');

  // JSON 파싱 — 코드블록이 섞여있을 수 있으니 안전하게
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 코드블록 ```json ... ``` 안에 들어있는 경우 추출 시도
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI response not JSON: ' + raw.slice(0, 200));
    parsed = JSON.parse(m[0]);
  }
  return parsed;
}

// ──────────────────────────────────────────────────────────
// 도구 디스패처 — query intent 의 tool 을 서버에서 실행
// ──────────────────────────────────────────────────────────
async function runTool(
  env: { DB: D1Database },
  tool: string,
  args: any
): Promise<any> {
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  // 안전 헬퍼 — 개별 쿼리 실패가 전체 도구를 죽이지 않도록
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  switch (tool) {
    case 'today_stats': {
      const startMs = new Date(todayKst + 'T00:00:00+09:00').getTime();
      const endMs = startMs + 86400000;
      const [rev, att, act, sign] = await Promise.all([
        safe(() => env.DB.prepare(`SELECT COALESCE(SUM(amount_krw),0) AS revenue, COUNT(*) AS cnt
                        FROM student_payments
                        WHERE status='paid' AND paid_at IS NOT NULL AND paid_at >= ? AND paid_at < ?`)
          .bind(startMs, endMs).first<any>(), { revenue: 0, cnt: 0 } as any),
        safe(() => env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS attended
                        FROM attendance WHERE date = ?`).bind(todayKst).first<any>(),
          { attended: 0 } as any),
        safe(() => env.DB.prepare(`SELECT COUNT(*) AS active
                        FROM students_erp
                        WHERE end_date IS NULL OR end_date='' OR end_date >= ?`)
          .bind(todayKst).first<any>(), { active: 0 } as any),
        safe(() => env.DB.prepare(`SELECT COUNT(*) AS signups FROM students_erp WHERE signup_date = ?`)
          .bind(todayKst).first<any>(), { signups: 0 } as any)
      ]);
      const attended = att?.attended || 0;
      const active = act?.active || 0;
      const absent = Math.max(0, active - attended);
      const rate = active > 0 ? Math.round((absent * 1000) / active) / 10 : 0;
      return {
        date: todayKst,
        revenue_krw: rev?.revenue || 0,
        pay_count: rev?.cnt || 0,
        attended,
        active_students: active,
        absence_rate_pct: rate,
        new_signups: sign?.signups || 0
      };
    }

    case 'weekly_dashboard': {
      const since = Date.now() - 7 * 86400000;
      const total = await env.DB.prepare(
        `SELECT COUNT(*) AS sessions, SUM(disconnect_count) AS disconnects,
                AVG(CASE WHEN total_session_ms>0 THEN total_active_ms*100.0/total_session_ms ELSE 0 END) AS active_pct
         FROM attendance WHERE joined_at >= ?`
      ).bind(since).first<any>();
      return {
        period: 'last_7_days',
        total_sessions: total?.sessions || 0,
        total_disconnects: total?.disconnects || 0,
        avg_speaking_pct: Math.round((total?.active_pct || 0) * 10) / 10
      };
    }

    case 'find_student': {
      const q = (args?.q || '').toString().trim();
      if (!q) return { error: 'query required' };
      const rows = await env.DB.prepare(
        `SELECT user_id, korean_name, english_name, status, signup_date, end_date
         FROM students_erp
         WHERE korean_name LIKE ? OR english_name LIKE ? OR user_id LIKE ?
         ORDER BY signup_date DESC LIMIT 10`
      ).bind('%' + q + '%', '%' + q + '%', '%' + q + '%').all<any>();
      return { matches: rows.results || [], count: (rows.results || []).length };
    }

    case 'revenue': {
      const period = (args?.period || 'month').toString();
      const kstDate = `date((paid_at + 32400000)/1000, 'unixepoch')`;
      let groupExpr = `substr(${kstDate},1,7)`;
      if (period === 'day') groupExpr = kstDate;
      else if (period === 'year') groupExpr = `substr(${kstDate},1,4)`;
      const rows = await env.DB.prepare(
        `SELECT ${groupExpr} AS label, SUM(amount_krw) AS revenue
         FROM student_payments WHERE status='paid' AND paid_at IS NOT NULL
         GROUP BY ${groupExpr} ORDER BY label DESC LIMIT 12`
      ).all<any>();
      return { period, items: rows.results || [] };
    }

    case 'active_rooms': {
      const rows = await env.DB.prepare(
        `SELECT room_id, COUNT(DISTINCT user_id) AS users, MIN(joined_at) AS started_at
         FROM attendance WHERE left_at IS NULL OR left_at = 0
         GROUP BY room_id ORDER BY started_at DESC LIMIT 20`
      ).all<any>();
      return { rooms: rows.results || [], count: (rows.results || []).length };
    }

    case 'recent_recordings': {
      const limit = Math.min(parseInt(args?.limit, 10) || 10, 30);
      const rows = await env.DB.prepare(
        `SELECT id, room_id, user_id, started_at, duration_ms, size_bytes
         FROM recordings ORDER BY started_at DESC LIMIT ?`
      ).bind(limit).all<any>();
      return { recordings: rows.results || [], count: (rows.results || []).length };
    }

    default:
      return { error: 'unknown_tool', tool };
  }
}

// ──────────────────────────────────────────────────────────
// 외부 진입점 — POST /api/admin/ai-command 핸들러가 호출
// ──────────────────────────────────────────────────────────
export async function processAiCommand(
  env: { AI?: any; DB: D1Database },
  command: string,
  lang: string = 'ko'
): Promise<any> {
  const cmd = (command || '').toString().trim();
  if (!cmd) return { ok: false, error: 'empty_command' };
  if (cmd.length > 500) return { ok: false, error: 'command_too_long' };

  const en = lang === 'en';  // 폴백 텍스트 언어 선택

  // 🧭 Phase 23 — 프리 라우터: 화면/메뉴를 지목하면 LLM 을 거치지 않고 "반드시 그 화면으로 이동".
  //   이동하지 않는 경우는 routeNavigation() 안에서 딱 둘뿐:
  //     (a) 등록/변경/발송 등 실제 작업(NAV_BLOCK)  (b) 이동동사 없는 순수 '뭐야/뜻' 정의질문
  const preNav = routeNavigation(cmd);
  if (preNav) {
    return buildNavResponse(preNav, en);
  }

  let aiResponse: any;
  try {
    aiResponse = await callLLM(env, cmd, lang);
  } catch (e: any) {
    return { ok: false, error: 'ai_call_failed', detail: String(e?.message || e) };
  }

  const intent = aiResponse?.intent;

  // 🧭 Phase 23 — 교정: LLM 이 이동 명령을 설명(answer)으로 잘못 답하면 강제로 이동시킨다.
  //   (예: "자동 스케줄링 메뉴로 가게 해줘" → 단계별 설명 X, 즉시 해당 화면으로)
  if (intent === 'answer') {
    const nav = routeNavigation(cmd);
    if (nav) return buildNavResponse(nav, en);
  }

  // Level 1 — answer
  if (intent === 'answer') {
    return {
      ok: true,
      intent: 'answer',
      answer: aiResponse.answer || (en ? '(empty response)' : '(빈 응답)')
    };
  }

  // Level 2 — navigate (Phase 21h: url / external_url / menu_id 모두 지원)
  if (intent === 'navigate') {
    // 🧭 Phase 23 — 강사 스케줄 교정: LLM 이 강사관리 카드로 보냈지만 사용자가 '스케줄/시간표'를
    //   원했다면(등록/변경 아님) 실제 주간 스케줄 화면으로 돌려보낸다.
    if (!NAV_BLOCK_RE.test(cmd) && TEACHER_WORD_RE.test(cmd) && SCHEDULE_WORD_RE.test(cmd)) {
      const nav = resolveNav(cmd);
      if (nav && nav.url) return buildNavResponse(nav, en);
    }
    const out: any = {
      ok: true,
      intent: 'navigate',
      answer: aiResponse.answer || (en ? 'Navigating to the page.' : '페이지로 이동합니다.')
    };
    // 외부 URL 새 탭 — 화이트리스트 검증 (https 만, 알려진 도메인만)
    if (aiResponse.external_url) {
      const eu = String(aiResponse.external_url);
      const allowedHosts = ['mangoi-speech.pages.dev'];
      try {
        const u = new URL(eu);
        if (u.protocol === 'https:' && allowedHosts.includes(u.hostname)) {
          out.external_url = eu;
        }
      } catch {}
    }
    // 같은 페이지 메뉴 카드 스크롤 — 알파벳·하이픈만 허용
    if (aiResponse.menu_id && /^[a-z0-9-]+$/i.test(String(aiResponse.menu_id))) {
      out.menu_id = String(aiResponse.menu_id);
    }
    // 같은 탭 URL 이동 — 안전 경로만
    if (aiResponse.url) {
      const url = String(aiResponse.url);
      if (url.startsWith('/admin') || url === '/' || url === '/admin.html') {
        out.url = url;
      }
    }
    // 셋 다 없으면 안전 fallback
    if (!out.external_url && !out.menu_id && !out.url) out.url = '/admin.html';
    return out;
  }

  // Level 3 — query (서버에서 도구 실행 후 결과 반환)
  if (intent === 'query') {
    const toolName = aiResponse.tool;
    const toolArgs = aiResponse.args || {};
    let toolResult: any = null;
    try {
      toolResult = await runTool(env, toolName, toolArgs);
    } catch (e: any) {
      return {
        ok: false,
        intent: 'query',
        error: 'tool_failed',
        tool: toolName,
        detail: String(e?.message || e)
      };
    }
    return {
      ok: true,
      intent: 'query',
      tool: toolName,
      args: toolArgs,
      result: toolResult,
      answer: aiResponse.answer || ''
    };
  }

  // Level 4 — action (실행은 별도 confirm 엔드포인트에서)
  if (intent === 'action') {
    const allowedActions = new Set(['send_kakao_self', 'issue_sticker', 'mark_intervention']);
    if (!allowedActions.has(aiResponse.name)) {
      return {
        ok: false,
        intent: 'action',
        error: 'action_not_allowed',
        name: aiResponse.name
      };
    }
    return {
      ok: true,
      intent: 'action',
      name: aiResponse.name,
      args: aiResponse.args || {},
      confirm_text: aiResponse.confirm_text || (en ? 'Run this?' : '실행할까요?'),
      answer: aiResponse.answer || (en ? 'Please confirm.' : '확인이 필요합니다.')
    };
  }

  // Level 5 — schedule_plan (수업 스케줄 다건 등록/변경/연기 미리보기)
  if (intent === 'schedule_plan') {
    const items = Array.isArray(aiResponse.items) ? aiResponse.items : [];
    const allowedActions = new Set(['register_recurring', 'schedule_one_off', 'change_schedule', 'postpone_class']);
    const allowedTypes = new Set(['regular', 'level_test', 'trial']);
    const validDays = new Set(['mon','tue','wed','thu','fri','sat','sun']);
    const cleanItems = items.slice(0, 20).map((it: any) => {
      let action = allowedActions.has(it?.action) ? it.action : 'register_recurring';
      // 한국어 키워드 폴백: AI 가 type 을 regular 로 잘못 분류해도 label 에서 체험/레벨 키워드 있으면 자동 보정
      let type = allowedTypes.has(it?.type) ? it.type : 'regular';
      const labelStr = String(it?.label || '');
      if (type === 'regular') {
        if (/체험\s*수업|체험\s*레슨|trial/i.test(labelStr)) type = 'trial';
        else if (/레벨\s*테스트|레벨\s*테스트|level\s*test/i.test(labelStr)) type = 'level_test';
      }
      // ★ Phase 7: 비즈니스 규칙 강제
      //   trial/level_test = 1회성 (one_off, 특정 날짜 1번)
      //   regular = 매주 반복 (recurring, 요일 반복)
      if (type === 'trial' || type === 'level_test') {
        action = 'schedule_one_off';
      } else if (type === 'regular') {
        action = 'register_recurring';
      }
      const days = Array.isArray(it?.days) ? it.days.filter((d: any) => validDays.has(String(d))) : null;
      const date = (it?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(it.date))) ? it.date : null;
      const time = (it?.time && /^\d{1,2}:\d{2}$/.test(String(it.time))) ? it.time : null;
      const studentName = String(it?.student_name || '').slice(0, 50).trim();
      const teacherName = it?.teacher_name ? String(it.teacher_name).slice(0, 50).trim() : null;
      const label = String(it?.label || `${studentName} ${action}`).slice(0, 200);
      return { action, type, days, date, time, student_name: studentName, teacher_name: teacherName, label };
    }).filter((it: any) => it.student_name && (it.time || it.date));
    return {
      ok: true,
      intent: 'schedule_plan',
      items: cleanItems,
      answer: aiResponse.answer || (en ? 'Parsed the schedule.' : '스케줄을 파싱했습니다.'),
      confirm_text: aiResponse.confirm_text || (en ? `Register ${cleanItems.length} item(s)?` : `${cleanItems.length}건을 등록할까요?`)
    };
  }

  // Level 6 — bulk_modify (다건 일괄 연기/취소/시간이동)
  if (intent === 'bulk_modify') {
    const allowedOps = new Set(['postpone','cancel','reschedule']);
    const op = allowedOps.has(aiResponse.operation) ? aiResponse.operation : 'cancel';
    const c = aiResponse.criteria || {};
    const validDays = new Set(['mon','tue','wed','thu','fri','sat','sun']);
    const cleanDays = Array.isArray(c.days) ? c.days.filter((d:any)=>validDays.has(String(d))) : null;
    const criteria = {
      student_name: c.student_name ? String(c.student_name).slice(0,50).trim() : null,
      teacher_name: c.teacher_name ? String(c.teacher_name).slice(0,50).trim() : null,
      days: cleanDays,
      time: (c.time && /^\d{1,2}:\d{2}$/.test(String(c.time))) ? c.time : null,
      date_from: (c.date_from && /^\d{4}-\d{2}-\d{2}$/.test(String(c.date_from))) ? c.date_from : null,
      date_to: (c.date_to && /^\d{4}-\d{2}-\d{2}$/.test(String(c.date_to))) ? c.date_to : null,
    };
    const shiftMin = (typeof aiResponse.shift_minutes === 'number') ? Math.max(-720, Math.min(720, aiResponse.shift_minutes)) : 0;
    return {
      ok: true,
      intent: 'bulk_modify',
      operation: op,
      criteria,
      shift_minutes: shiftMin,
      new_time: (aiResponse.new_time && /^\d{1,2}:\d{2}$/.test(String(aiResponse.new_time))) ? aiResponse.new_time : null,
      answer: aiResponse.answer || (en ? 'Please review the bulk change first.' : '일괄 변경을 미리 확인해 주세요.'),
      confirm_text: aiResponse.confirm_text || (en ? 'Run the bulk change?' : '일괄 변경을 실행할까요?')
    };
  }

  // unknown intent — fallback to answer
  return {
    ok: true,
    intent: 'answer',
    answer: aiResponse.answer || (en ? "Sorry, I didn't understand that. Please try again." : '명령을 이해하지 못했습니다. 다시 말씀해 주세요.')
  };
}

// ──────────────────────────────────────────────────────────
// Action 실행기 — POST /api/admin/ai-action 에서 호출
// (사용자가 confirm 한 후에만 들어옴)
// ──────────────────────────────────────────────────────────
export async function executeAction(
  env: { DB: D1Database; SESSION_STATE: KVNamespace },
  name: string,
  args: any,
  adminUserId: string | null
): Promise<any> {
  const allowed = new Set(['send_kakao_self', 'issue_sticker', 'mark_intervention', 'schedule_batch', 'bulk_apply']);
  if (!allowed.has(name)) {
    return { ok: false, error: 'action_not_allowed', name };
  }

  const auditId = 'aiact_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  try {
    if (name === 'send_kakao_self') {
      // 카톡 메모챗 발송은 외부 PS1/MCP 영역이라 여기서는 KV 큐에 기록만
      // (실제 발송은 클라이언트 측 KakaoTalk MCP 또는 별도 워커가 픽업)
      const text = String(args?.text || '').slice(0, 1000);
      if (!text) return { ok: false, error: 'empty_text' };
      const queueKey = `kakao_queue:${auditId}`;
      await env.SESSION_STATE.put(
        queueKey,
        JSON.stringify({ text, queued_at: Date.now(), by: adminUserId || 'unknown' }),
        { expirationTtl: 86400 }
      );
      return { ok: true, action: name, queued_id: auditId, text };
    }

    if (name === 'issue_sticker') {
      const userId = String(args?.user_id || '').trim();
      const reason = String(args?.reason || 'AI 명령으로 발급').slice(0, 200);
      if (!userId) return { ok: false, error: 'user_id_required' };
      // rewards 테이블은 student_id/message 컬럼을 사용 (다른 INSERT/SELECT와 통일)
      await env.DB.prepare(
        `INSERT INTO rewards (student_id, type, message, issued_at) VALUES (?, 'sticker', ?, ?)`
      ).bind(userId, reason, Date.now()).run();
      return { ok: true, action: name, user_id: userId, reason };
    }

    if (name === 'mark_intervention') {
      const userId = String(args?.user_id || '').trim();
      const note = String(args?.note || '').slice(0, 500);
      if (!userId) return { ok: false, error: 'user_id_required' };
      // intervention_logs 테이블 자동 생성 (스키마 누락 환경 대비)
      await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS intervention_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          note TEXT,
          source TEXT,
          created_by TEXT,
          created_at INTEGER NOT NULL
        )`
      );
      await env.DB.prepare(
        `INSERT INTO intervention_logs (user_id, note, source, created_by, created_at)
         VALUES (?, ?, 'ai-command', ?, ?)`
      ).bind(userId, note, adminUserId || 'unknown', Date.now()).run();
      return { ok: true, action: name, user_id: userId, note };
    }

    if (name === 'schedule_batch') {
      // Phase 2: D1 class_schedules 영구 저장 + KV 백업 (24시간)
      // Phase 3: 시간 충돌 감지 + auto_create_students 옵션
      const items = Array.isArray(args?.items) ? args.items : [];
      const autoCreateStudents = args?.auto_create_students === true;
      if (items.length === 0) return { ok: false, error: 'no_items' };

      // 스키마 자동 생성 (없으면)
      await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
      );
      // 누락 컬럼 보강 (옛 버전에서 만들어진 테이블 대비)
      const csCols: Array<[string,string]> = [
        ['student_name','TEXT'], ['schedule_kind','TEXT'], ['class_type','TEXT'],
        ['day_of_week','TEXT'], ['scheduled_date','TEXT'], ['duration_min','INTEGER'],
        ['teacher_id','TEXT'], ['status','TEXT'], ['source','TEXT'],
        ['created_by','TEXT'], ['updated_at','INTEGER'], ['notes','TEXT']
      ];
      for (const [c,t] of csCols) {
        try { await env.DB.exec('ALTER TABLE class_schedules ADD COLUMN ' + c + ' ' + t); } catch {}
      }
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_class_schedules_user ON class_schedules(user_id)`); } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_class_schedules_date ON class_schedules(scheduled_date)`); } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_class_schedules_status ON class_schedules(status)`); } catch {}

      const now = Date.now();
      const results: any[] = [];
      for (const it of items) {
        const studentName = String(it?.student_name || '').trim();
        let userId: string | null = null;
        let teacherId: string | null = null;
        let teacherName: string | null = null;
        let autoCreated = false;

        // Phase 4-1: 강사 자동 매칭
        if (it?.teacher_name) {
          const tName = String(it.teacher_name).trim().replace(/(선생님?|쌤)$/, '').trim();
          if (tName) {
            try {
              const t = await env.DB.prepare(
                `SELECT id, name FROM teachers WHERE name = ? OR name LIKE ? LIMIT 1`
              ).bind(tName, '%'+tName+'%').first<any>();
              if (t?.id) { teacherId = String(t.id); teacherName = t.name; }
            } catch {}
          }
        }

        try {
          const exact = await env.DB.prepare(
            `SELECT id, COALESCE(user_id, login_id) AS user_id, korean_name, username FROM students_erp WHERE korean_name = ? OR username = ? LIMIT 1`
          ).bind(studentName, studentName).first<any>();
          if (exact?.id) userId = exact.user_id || ('stu_id_' + exact.id);
          else {
            const like = await env.DB.prepare(
              `SELECT id, COALESCE(user_id, login_id) AS user_id, korean_name, username FROM students_erp WHERE korean_name LIKE ? OR username LIKE ? LIMIT 1`
            ).bind('%' + studentName + '%', '%' + studentName + '%').first<any>();
            if (like?.id) userId = like.user_id || ('stu_id_' + like.id);
          }
        } catch {}

        if (!userId && autoCreateStudents && studentName) {
          const ensureCols: Array<[string,string]> = [
            ['username','TEXT'], ['login_id','TEXT'], ['korean_name','TEXT'], ['english_name','TEXT'],
            ['user_id','TEXT'], ['student_phone','TEXT'], ['parent_phone','TEXT'],
            ['shop_name','TEXT'], ['payment_type','TEXT'], ['classes_per_week','INTEGER'],
            ['points','INTEGER DEFAULT 0'], ['signup_date','TEXT'], ['status','TEXT'], ['created_at','INTEGER']
          ];
          for (const [c,t] of ensureCols) {
            try { await env.DB.exec('ALTER TABLE students_erp ADD COLUMN ' + c + ' ' + t); } catch {}
          }
          const meta = (args?.student_meta && args.student_meta[studentName]) || {};
          // Phase 7i: 사용자가 login_id 를 직접 입력하면 그것을 ID 로 사용
          const newId = (meta.login_id && String(meta.login_id).trim()) || ('stu_ai_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
          const todayKst = new Date(now + 9*3600*1000).toISOString().slice(0,10);
          let inserted = false;
          try {
            await env.DB.prepare(
              "INSERT INTO students_erp (username, login_id, user_id, korean_name, english_name, student_phone, parent_phone, shop_name, status, signup_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(
              studentName, newId, newId, studentName,
              String(meta.english_name||''),
              String(meta.phone||''),
              String(meta.parent_phone||''),
              String(meta.center||''),
              "정상",
              todayKst, now
            ).run();
            inserted = true; userId = newId; autoCreated = true;
          } catch (e: any) {
            console.log('[schedule_batch] full INSERT failed, fallback:', e?.message);
          }
          if (!inserted) {
            try {
              await env.DB.prepare(
                "INSERT INTO students_erp (user_id, korean_name, status, signup_date) VALUES (?, ?, ?, ?)"
              ).bind(newId, studentName, "정상", todayKst).run();
              userId = newId; autoCreated = true;
            } catch (e2: any) {
              console.log('[schedule_batch] minimal INSERT failed:', e2?.message);
            }
          }
        }

        let insertedId: number | null = null;
        let insertError: string | null = null;
        let conflict: any = null;

        if (userId) {
          let action = String(it?.action || 'register_recurring');
          const classType = String(it?.type || 'regular');
          // ★ Phase 7: type → kind 강제
          //   trial/level_test → 무조건 one_off
          //   regular → 무조건 recurring
          if (classType === 'trial' || classType === 'level_test') {
            action = 'schedule_one_off';
          } else if (classType === 'regular' && action === 'register_recurring') {
            // regular 인데 days 비어있으면 그래도 recurring (아래 dayOfWeek null 처리됨)
          }
          const scheduleKind = (action === 'schedule_one_off' || action === 'postpone_class') ? 'one_off' : 'recurring';
          const dayOfWeek = Array.isArray(it?.days) && it.days.length ? it.days.join(',') : null;
          const scheduledDate = it?.date || null;
          const startTime = it?.time || null;
          const status = action === 'postpone_class' ? 'postponed' : 'active';

          if (!startTime) {
            insertError = 'time_required';
          } else {
            // Phase 3-2: 충돌 감지 - 같은 user_id + 같은 시간 + 같은 요일/날짜 활성 스케줄
            try {
              let conflictRow: any = null;
              if (scheduleKind === 'recurring' && dayOfWeek) {
                // 같은 시간에 같은 요일 중 하나라도 겹치는 활성 스케줄
                const dows = dayOfWeek.split(',');
                for (const d of dows) {
                  const r = await env.DB.prepare(
                    `SELECT id, day_of_week, start_time, class_type FROM class_schedules WHERE user_id=? AND status='active' AND start_time=? AND schedule_kind='recurring' AND day_of_week LIKE ? LIMIT 1`
                  ).bind(userId, startTime, '%'+d+'%').first<any>();
                  if (r?.id) { conflictRow = r; break; }
                }
              } else if (scheduledDate) {
                conflictRow = await env.DB.prepare(
                  `SELECT id, scheduled_date, start_time, class_type FROM class_schedules WHERE user_id=? AND status='active' AND start_time=? AND scheduled_date=? LIMIT 1`
                ).bind(userId, startTime, scheduledDate).first<any>();
              }
              if (conflictRow?.id) conflict = conflictRow;
            } catch {}

            // INSERT (충돌 있어도 일단 등록 - 사용자가 결정)
            try {
              const ins = await env.DB.prepare(
                `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, teacher_id, status, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_command', ?, ?)`
              ).bind(userId, studentName, scheduleKind, classType, dayOfWeek, scheduledDate, startTime, teacherId, status, adminUserId || 'ai', now).run();
              insertedId = (ins?.meta?.last_row_id as number) || null;
              console.log('[schedule_batch] INSERT OK id=' + insertedId + ' user=' + userId + ' type=' + classType + ' day=' + dayOfWeek + ' time=' + startTime);
            } catch (e: any) {
              insertError = String(e?.message || e).slice(0, 200);
              console.log('[schedule_batch] INSERT FAIL type=' + classType + ' err=' + insertError);
            }
          }
        }

        let resultStatus: string;
        if (insertedId && conflict) resultStatus = 'inserted_with_conflict';
        else if (insertedId) resultStatus = autoCreated ? 'inserted_auto_created' : 'inserted';
        else if (userId) resultStatus = 'insert_failed';
        else resultStatus = 'student_not_found_in_db';

        results.push({
          ...it,
          resolved_user_id: userId,
          resolved_teacher_id: teacherId,
          resolved_teacher_name: teacherName,
          schedule_id: insertedId,
          auto_created: autoCreated,
          conflict_with: conflict ? { id: conflict.id, time: conflict.start_time, type: conflict.class_type } : null,
          status: resultStatus,
          error: insertError
        });
      }

      // KV 백업 (감사 로그)
      const planId = 'plan_' + now + '_' + Math.random().toString(36).slice(2, 8);
      try {
        await env.SESSION_STATE.put(
          `schedule_plan:${planId}`,
          JSON.stringify({ plan_id: planId, created_at: now, created_by: adminUserId || 'unknown', items: results }),
          { expirationTtl: 86400 * 7 }
        );
      } catch {}

      const inserted = results.filter(r => r.status === 'inserted' || r.status === 'inserted_auto_created' || r.status === 'inserted_with_conflict').length;
      const autoCreatedCount = results.filter(r => r.auto_created).length;
      const conflictCount = results.filter(r => r.conflict_with).length;
      const notFoundCount = results.filter(r => r.status === 'student_not_found_in_db').length;
      return {
        ok: true,
        action: name,
        plan_id: planId,
        inserted_count: inserted,
        auto_created_count: autoCreatedCount,
        conflict_count: conflictCount,
        not_found_count: notFoundCount,
        total_count: results.length,
        items: results
      };
    }

    if (name === 'bulk_apply') {
      // Phase 4-3: 일괄 적용 (postpone, cancel, reschedule)
      const op = String(args?.operation || '');
      const c = args?.criteria || {};
      const shiftMin = parseInt(args?.shift_minutes || 0, 10);
      const newTime = args?.new_time;
      if (!['postpone','cancel','reschedule'].includes(op)) return { ok: false, error: 'invalid_operation' };

      // Find matching schedules
      const where: string[] = [`status = 'active'`];
      const binds: any[] = [];
      if (c.student_name) {
        // student_name 으로 user_id 찾고 그것으로 필터
        const stu = await env.DB.prepare(
          `SELECT user_id FROM students_erp WHERE korean_name = ? OR korean_name LIKE ? LIMIT 1`
        ).bind(c.student_name, '%'+c.student_name+'%').first<any>();
        if (!stu?.user_id) return { ok: false, error: 'student_not_found', student_name: c.student_name };
        where.push('user_id = ?'); binds.push(stu.user_id);
      }
      if (Array.isArray(c.days) && c.days.length) {
        const dayConds = c.days.map(()=>'day_of_week LIKE ?').join(' OR ');
        where.push('(' + dayConds + ')');
        for (const d of c.days) binds.push('%'+d+'%');
      }
      if (c.time) { where.push('start_time = ?'); binds.push(c.time); }
      if (c.date_from) { where.push('(scheduled_date IS NULL OR scheduled_date >= ?)'); binds.push(c.date_from); }
      if (c.date_to) { where.push('(scheduled_date IS NULL OR scheduled_date <= ?)'); binds.push(c.date_to); }
      if (c.teacher_name) {
        // teacher_name 으로 teacher_id 찾고 그것으로 필터 (누락 시 다른 강사 수업까지 일괄 변경되는 사고 방지)
        const tName = String(c.teacher_name).trim().replace(/(선생님?|쌤)$/, '').trim();
        const teacher = await env.DB.prepare(
          `SELECT id FROM teachers WHERE name = ? OR name LIKE ? LIMIT 1`
        ).bind(tName, '%'+tName+'%').first<any>();
        if (!teacher?.id) return { ok: false, error: 'teacher_not_found', teacher_name: c.teacher_name };
        where.push('teacher_id = ?'); binds.push(String(teacher.id));
      }

      const sel = await env.DB.prepare(
        `SELECT id, user_id, student_name, day_of_week, scheduled_date, start_time, class_type FROM class_schedules WHERE ${where.join(' AND ')} LIMIT 200`
      ).bind(...binds).all<any>();
      const matches = sel.results || [];

      const updated: any[] = [];
      const nowTs = Date.now();
      for (const row of matches) {
        try {
          if (op === 'cancel') {
            await env.DB.prepare(`UPDATE class_schedules SET status='cancelled', updated_at=? WHERE id=?`).bind(nowTs, row.id).run();
            updated.push({ id: row.id, action: 'cancelled', old_time: row.start_time });
          } else if (op === 'postpone') {
            await env.DB.prepare(`UPDATE class_schedules SET status='postponed', updated_at=? WHERE id=?`).bind(nowTs, row.id).run();
            updated.push({ id: row.id, action: 'postponed', old_time: row.start_time });
          } else if (op === 'reschedule') {
            // shift_minutes 만큼 시간 이동 또는 new_time 으로 변경
            let target = newTime;
            if (!target && shiftMin) {
              const tm = String(row.start_time).match(/^(\d{1,2}):(\d{2})$/);
              if (tm) {
                let total = parseInt(tm[1],10)*60 + parseInt(tm[2],10) + shiftMin;
                total = Math.max(0, Math.min(24*60-1, total));
                target = String(Math.floor(total/60)).padStart(2,'0') + ':' + String(total%60).padStart(2,'0');
              }
            }
            if (target) {
              await env.DB.prepare(`UPDATE class_schedules SET start_time=?, updated_at=? WHERE id=?`).bind(target, nowTs, row.id).run();
              updated.push({ id: row.id, action: 'rescheduled', old_time: row.start_time, new_time: target });
            }
          }
        } catch {}
      }

      return { ok: true, action: name, operation: op, matched_count: matches.length, updated_count: updated.length, items: updated };
    }

    return { ok: false, error: 'unhandled_action', name };
  } catch (e: any) {
    return { ok: false, error: 'action_exec_failed', detail: String(e?.message || e) };
  }
}


// ════════════════════════════════════════════════════════════════════════
// 🎒 학생 검색창 라우터 (관리자 ai-command 와 동일 Workers AI 엔진 공유, 학생 스코프)
//   index.html 학생 검색창의 폴백 호출 /api/student/ai-command 를 처리한다.
//   클라이언트가 소비하는 응답 형태로만 출력: navigate(url|view|external_url) / action(inquiry) / answer
// ════════════════════════════════════════════════════════════════════════
// ── 학생 메뉴 라우트 표 (키워드 → 목적지). index.html 검색창 RULES 와 1:1 미러.
//    url: 실제 페이지(옛 브라우저 캐시에서도 즉시 이동됨) / view: SPA 뷰 / run: 클라 화이트리스트 함수 / action: inquiry 모달
//    ⚠️ 순서 중요 = 더 구체적인 항목을 위로. resolveStudentNav 는 첫 매칭을 반환.
type StudentRoute = { kws: string[]; url?: string; view?: string; run?: string; action?: string; label: string };
export const STUDENT_ROUTES: StudentRoute[] = [
  // ℹ️ 망고아이 소개 (About 오버레이) — "망고아이란/소개" 버튼과 동일
  { kws: ['망고아이란', '망고아이 소개', '망고아이소개', '망고아이에 대해', '망고아이 대해', '망고아이가 뭐', '망고아이 뭐', '회사 소개', '회사소개', '서비스 소개', '서비스소개', '어떤 곳', '어떤곳', 'about mangoi', 'about'], run: 'openAboutMangoi', label: 'ℹ️ 망고아이 소개' },
  // 🧑‍💼 AI 상담사(아바타 위젯) — '상담사'가 신규상담(inquiry)보다 먼저 잡히도록 상단
  { kws: ['상담사', 'ai 상담사', 'ai상담사', '에이아이 상담사', '상담 직원', '상담직원', '아바타 상담', '아바타상담', 'ai 비서', 'ai비서', '인공지능 상담'], run: 'openAiConsultant', label: '🧑‍💼 AI 상담사' },
  // 🔐 로그인
  { kws: ['로그인', '로그 인', 'login', 'sign in', '로그인하기', '내 계정', '계정 로그인'], run: 'openLoginModal', label: '🔐 로그인' },
  // 🤖 AI와 친구하기 (자기주도학습 오버레이) — 첫 화면 CTA와 동일
  { kws: ['ai와 친구하기', 'ai와친구하기', '친구하기', 'ai랑 놀기', 'ai 놀이', 'ai랑 공부', '자기주도학습', '자기주도 학습', 'ai 학습 모음'], run: 'openAiFriendsOverlay', label: '🤖 AI와 친구하기' },
  // 🎮 학생게임 (게임류 최우선)
  { kws: ['학생게임', '학생 게임', '학생용게임', '미니게임', '미니 게임', '학습게임', '학습 게임', '영어게임', '영어 게임', '게임하기', '게임 하기', '게임하러', '게임 열어', '게임열어', '게임 페이지', '게임하고', '게임할래', '게임 시작', '게임', '오락', '놀이', 'game', 'games', 'play game'], url: '/student-games.html', label: '🎮 학생게임' },
  // 📊 성적/평가/리포트
  { kws: ['성적표', '평가표', '성적', '점수', '시험점수', '테스트결과', '테스트 결과', '평가결과', '평가 결과', '내 성적', '내성적', '일별평가', '일별 평가', '수업평가', '피드백', '리포트', '학습리포트', '학습 리포트', '분석리포트', 'report', '레벨테스트 결과'], url: '/report.html', label: '📊 성적표·리포트' },
  { kws: ['월말평가', '월간평가', '월말 평가', '평가서', 'evaluation'], url: '/eval.html', label: '📝 월말 평가서' },
  { kws: ['월간리포트', '월간 리포트', 'monthly report'], url: '/monthly-report.html', label: '📈 월간 리포트' },
  // 📖 학습 기능
  { kws: ['단어장', '단어 장', '내 단어장', '어휘장', '어휘', '단어', 'vocab', 'vocabulary', 'word list'], url: '/vocab.html', label: '📖 단어장' },
  { kws: ['복습퀴즈', '복습 퀴즈', '선생님 퀴즈', '리뷰 퀴즈', '복습', 'review quiz'], url: '/review-quiz.html', label: '🧠 복습퀴즈' },
  { kws: ['미니퀴즈', '미니 퀴즈', '단어퀴즈', '단어 퀴즈', '쪽지시험', '퀴즈', 'quiz'], url: '/micro-quiz.html', label: '🎯 미니 퀴즈' },
  { kws: ['연속출석', '연속 출석', '출석체크', '출석 체크', '스트릭', '데일리 출석', '출석', 'streak', 'attendance'], url: '/streak.html', label: '🔥 연속 출석' },
  { kws: ['칭찬스티커', '칭찬 스티커', '칭찬', '스티커', '선생님 칭찬', 'praise', 'sticker'], url: '/teacher-praise.html', label: '🌟 칭찬 스티커' },
  { kws: ['수업자료', '수업 자료', '학습자료', '학습 자료', '강의자료', '수업교재', '수업 교재', '수업노트', 'materials'], url: '/lessons.html', label: '📖 수업 자료' },
  { kws: ['교재업로더', '교재 업로더', '교재폴더', '교재 폴더', '교과서', '교재', 'textbook', 'classify'], url: '/textbook-uploader.html', label: '📚 교재 업로더' },
  // 🤖 AI 기능
  { kws: ['ai친구', 'ai 친구', '인공지능 친구', '영어친구', '영어 친구', '대화연습', '대화 연습', '챗봇', 'ai friend', 'chatbot'], url: '/ai-friend.html', label: '🤖 AI 친구' },
  { kws: ['ai작문', 'ai 작문', '영작문', '영작', '작문첨삭', '작문 첨삭', '글쓰기', 'ai write', 'writing'], url: '/ai-write.html', label: '✍ AI 작문' },
  // 🗣 발음
  { kws: ['중국어발음', '중국어 발음', '중국어발음코치', '중국어', 'chinese', 'mandarin', '병음', 'pinyin', '다락원'], url: '/speech-coach-cn.html', label: '🇨🇳 중국어 발음 코치' },
  { kws: ['발음연습', '발음 연습', '발음코치', '발음 코치', '발음교정', '발음 교정', '발음테스트', '발음 체크', '영어발음', '발음', '스피킹', '말하기연습', '말하기 연습', 'pronunciation', 'speaking'], url: '/speech-coach.html', label: '🗣 영어 발음 코치' },
  // 🧠 MBTI
  { kws: ['mbti매칭', 'mbti 매칭', '엠비티아이 매칭', '강사매칭', '강사 매칭', '성향매칭', '성향 매칭', 'mbti match'], url: '/mbti.html', label: '🧠 MBTI 매칭' },
  { kws: ['mbti테스트', 'mbti 테스트', '엠비티아이 테스트', '성향테스트', '성격테스트', '성격 테스트', 'mbti test', 'mbti'], url: '/mbti-test.html', label: '🧪 MBTI 테스트' },
  // 📅 스케줄 / 수업신청
  { kws: ['주간스케줄', '주간 스케줄', '내스케줄', '내 스케줄', '스케줄', '시간표', '주간시간표', '수업일정', '수업 일정', '일정표', 'schedule', 'timetable'], url: '/admin/weekly-schedule.html?role=student', label: '📅 내 주간 스케줄' },
  { kws: ['수업신청', '수업 신청', '수강신청', '수강 신청', '예약하기', '시간선택', '교사선택', 'book', 'booking'], url: '/lesson-booking-demo.html', label: '📝 수업 신청' },
  // 🎥 수업입장 (SPA view)
  { kws: ['수업입장', '수업 입장', '수업시작', '수업 시작', '강의실', '들어가기', '입장', '공부시작', '공부 시작', '화상수업', '화상통화', '화상 통화', '클래스', '방 들어가기', 'class'], view: 'view-videocall-lobby', label: '🎥 수업 입장' },
  // 👤 마이페이지 / 학부모
  { kws: ['마이페이지', '내정보', '내 정보', '프로필', '학부모', '자녀보기', '자녀 보기', 'mypage', 'my page', 'profile'], url: '/parent.html', label: '👤 마이페이지' },
  // 💳 결제 (모달 함수)
  { kws: ['결제', '결제하기', '강의료', '수강료', '학원비', '등록금', '학비', '수업료', '월회비', '레슨비', '교육비', '납부', 'payment', 'pay', 'tuition'], run: 'grid:payment', label: '💳 수강료 결제' },
  // 🎁 포인트 상점 (모달 함수)
  { kws: ['포인트상점', '포인트 상점', '포인트샵', '포인트몰', '기프티콘', '기프트', '선물', '상점', '쇼핑', '리워드', '적립', '포인트', 'point', 'gift', 'shop', 'reward'], run: 'showPointsShop', label: '🎁 포인트 상점' },
  // 📅 연기/변경 (모달 함수)
  { kws: ['수업연기', '수업 연기', '연기', '일정변경', '일정 변경', '날짜변경', '날짜 변경', '시간변경', '시간 변경', '미루기', '수업취소', '수업 취소'], run: 'openLessonChangeModal', label: '📅 수업 연기·변경' },
  // ═══ 홈 그리드 카드 (idx-grid-menu.js gridActions 와 1:1 미러 — run:'grid:키') ═══
  //    ⚠️ 신규상담(inquiry)보다 위에 둔다 — '가맹점 문의','고객센터'가 '문의' 때문에 상담으로 새지 않도록.
  { kws: ['특장점', '특징', '장점', '왜 망고', '왜 망고아이', '망고아이 특장점', 'features'], run: 'grid:features', label: '🌟 망고아이 특장점' },
  { kws: ['레벨테스트', '레벨 테스트', '실력테스트', '실력 테스트', '진단테스트', '진단 테스트', 'level test'], run: 'grid:leveltest', label: '📊 레벨테스트' },
  { kws: ['교육과정', '커리큘럼', '학습 코스', '레벨', 'cefr', 'curriculum'], run: 'grid:curriculum', label: '📚 교육과정' },
  { kws: ['자주 묻는 질문', '자주묻는질문', '자주 묻는', 'faq', 'q&a', 'qa'], run: 'grid:faq', label: '❓ 자주 묻는 질문' },
  { kws: ['강사소개', '강사 소개', '교사소개', '교사 소개', '강사', '선생님', '원어민', 'teacher', 'teachers'], run: 'grid:teachers', label: '👨‍🏫 강사 소개' },
  { kws: ['수업후기', '수업 후기', '수강후기', '수강 후기', '학부모 후기', '후기', '리뷰', 'review', 'reviews'], run: 'grid:reviews', label: '⭐ 수업 후기' },
  { kws: ['이벤트', '혜택', '프로모션', '쿠폰', '할인', 'event', 'promotion'], run: 'grid:event', label: '🎉 이벤트·혜택' },
  { kws: ['공지사항', '공지', '소식', '뉴스', 'notice'], run: 'grid:notice', label: '📢 공지사항' },
  { kws: ['자료실', '자료 다운로드', 'library'], run: 'grid:library', label: '📁 자료실' },
  { kws: ['학습가이드', '학습 가이드', '학습법', '공부법', '학습 방법', 'learn guide'], run: 'grid:learnguide', label: '🎓 학습 가이드' },
  { kws: ['비디오레슨', '비디오 레슨', '원어민 비디오', '강의영상', '강의 영상', 'vod', 'video lesson'], run: 'grid:videolesson', label: '🎬 비디오 레슨' },
  { kws: ['녹화본', '녹화 복습', '지난수업', '지난 수업', '다시보기', '다시 보기', '녹화보기', 'recording', 'replay'], run: 'grid:recordings', label: '📼 녹화본 복습' },
  { kws: ['집중도', '집중력', '시선추적', '시선 추적', '발화비율', '발화 비율', 'focus', 'gaze'], run: 'grid:focus', label: '🎯 집중도 측정' },
  { kws: ['자가진단', '자가 진단', '카메라 테스트', '마이크 테스트', '시스템 점검', 'diagnosis'], run: 'grid:diagnosis', label: '🩺 자가진단' },
  { kws: ['프로그램 설치', '설치방법', '설치 방법', '설치가이드', '설치 가이드', 'install'], run: 'grid:installguide', label: '⚙️ 프로그램 설치' },
  { kws: ['pc원격', 'pc 원격', '원격지원', '원격 지원', '원격도움', '원격 도움', 'anydesk', 'remote'], run: 'grid:remote', label: '💻 PC원격지원' },
  { kws: ['카톡상담', '카톡 상담', '카카오톡', '카카오 채널', '카톡', '카카오', 'kakao'], run: 'grid:kakao', label: '💬 카카오톡 상담' },
  { kws: ['고객센터', '연락처', '전화번호', '전화 문의', '문의처', 'contact'], run: 'grid:contact', label: '☎️ 고객센터' },
  { kws: ['가맹점', '가맹', '제휴', '대리점', 'b2b', 'franchise'], run: 'grid:franchise', label: '🏢 가맹점 문의' },
  { kws: ['현지 콜센터', '콜센터', '필리핀 지사', '해외 지사', '글로벌 연락처', 'call center'], run: 'grid:callcenter', label: '🌏 현지 콜센터' },
  // 💬 신규상담 (inquiry 모달 — 옛 클라이언트도 지원). 그리드 카드보다 아래(‘문의’ 일반어).
  { kws: ['신규상담', '신규 상담', '상담신청', '상담 신청', '문의하기', '문의', '가입문의', '가입 문의', '첫방문', '무료체험', '무료 체험', '체험수업', 'inquiry', 'consult'], action: 'inquiry', label: '💬 신규상담·체험' },
  // 🏠 전체 메뉴 (모달 함수)
  { kws: ['전체메뉴', '전체 메뉴', '모든메뉴', '모든 메뉴', '메뉴', '홈페이지', '메인화면', '히트맵', '바로가기'], run: 'openAllMenuOverlay', label: '🥭 전체 메뉴' },
  // 📊 관리자
  { kws: ['관리자', '대시보드', '원장페이지', '원장 페이지', '관리자 로그인', 'admin', 'dashboard'], url: '/admin.html', label: '📊 관리자' },
];

// ── 이해력 강화: 정규화 사전(음성인식·오타 교정) + 한글 자모 퍼지 매칭 ──
//    클라이언트 idx-ai-home.js 의 NORMALIZE/jamo 로직과 동일 취지로 미러.
const STUDENT_NORMALIZE: Array<[RegExp, string]> = [
  [/(망\s?고\s?아\s?이|마고아이|만고아이|망구아이|마구아이|맹고아이|망고아리|마구아예|망가아이|맨고아이|먕고아이|망꼬아이|mango\s?ai|mangoi|mango\s?eye)/g, '망고아이'],
  [/(수업\s?잃장|수업\s?이잠|수업\s?이장)/g, '수업입장'],
  [/(발음\s?연십|바름연습|발음\s?년습|바름\s?연습)/g, '발음연습'],
  [/(단어\s?자앙|다너장|단어\s?짱)/g, '단어장'],
  [/(포\s?인또|포인뜨)/g, '포인트'],
];
function normStudent(text: string): string {
  let t = (text || '').toString().toLowerCase().trim();
  for (const [re, rep] of STUDENT_NORMALIZE) t = t.replace(re, rep);
  return t.replace(/\s+/g, ' ').trim();
}

const _CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const _JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const _JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
function jamo(str: string): string {
  let o = '';
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0xAC00 && c <= 0xD7A3) {
      const s = c - 0xAC00;
      o += _CHO[Math.floor(s / 588)] + _JUNG[Math.floor((s % 588) / 28)];
      const j = s % 28; if (j) o += _JONG[j];
    } else if (c > 32) { o += str[i]; }
  }
  return o;
}
function _lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function jamoSim(hay: string, needle: string): number {
  const nl = needle.length;
  if (nl < 4) return 0;
  const hl = hay.length;
  if (hl < nl) return 1 - _lev(hay, needle) / nl;
  let best = 0;
  for (let w = Math.max(3, nl - 2); w <= nl + 2 && w <= hl; w++) {
    for (let i = 0; i + w <= hl; i++) {
      const sim = 1 - _lev(hay.substr(i, w), needle) / Math.max(w, nl);
      if (sim > best) { best = sim; if (best >= 0.999) return 1; }
    }
  }
  return best;
}
// 정확 매칭 실패 시 자모 퍼지로 가장 가까운 route (없으면 null)
function fuzzyStudentNav(command: string): StudentRoute | null {
  const ij = jamo(normStudent(command).replace(/\s+/g, ''));
  if (ij.length < 4) return null;
  let best: StudentRoute | null = null, bestSim = 0.80;
  for (const r of STUDENT_ROUTES) {
    for (const k of r.kws) {
      const sim = jamoSim(ij, jamo(k.toLowerCase().replace(/\s+/g, '')));
      if (sim > bestSim) { best = r; bestSim = sim; if (sim >= 0.97) return r; }
    }
  }
  return best;
}

// 공백/대소문자 정규화 후 부분일치. 첫 매칭 route 반환(없으면 null).
export function resolveStudentNav(command: string): StudentRoute | null {
  const t = normStudent(command); // 음성인식·오타 교정 포함
  if (!t) return null;
  const tSquash = t.replace(/\s+/g, ''); // 공백 무시 매칭도 병행 ("학생 게임"=="학생게임")
  for (const r of STUDENT_ROUTES) {
    for (const k of r.kws) {
      const kk = k.toLowerCase();
      if (t.includes(kk) || tSquash.includes(kk.replace(/\s+/g, ''))) return r;
    }
  }
  return null;
}

function routeToResponse(r: StudentRoute): any {
  if (r.action === 'inquiry') return { intent: 'action', name: 'inquiry', answer: `${r.label} 신청 폼을 열어드릴게요.` };
  const out: any = { intent: 'navigate', answer: `${r.label} (으)로 이동합니다.` };
  if (r.url) out.url = r.url;
  else if (r.view) out.view = r.view;
  else if (r.run) out.run = r.run;
  return out;
}

// ── 지식 기반(FAQ) — 정보성 질문에 즉답 + 관련 화면으로 안내 ──
//   openAboutMangoi 의 실제 특장점(BENEFITS) 내용을 근거로 작성. 사실만 담고 지어내지 않음.
//   질문형 입력에는 이 답변을 먼저 주고, 답변 끝에 관련 화면(run/url/action)으로 함께 이동시킨다.
type StudentFaq = { re: RegExp; answer: string; url?: string; run?: string; action?: string };
const STUDENT_FAQ: StudentFaq[] = [
  // 망고아이가 뭐야 / 소개 / 어떤 서비스
  { re: /(망고아이[^가-힣]*(뭐|무엇|무슨|어떤|소개|대해|란)|무슨\s*서비스|어떤\s*(곳|서비스|회사)|about)/i,
    answer: '망고아이는 원어민 선생님의 1:1·1:2 화상영어 수업과 A.I 학습관리를 하나로 합친 화상영어 서비스예요. 필리핀 직영 교육센터의 검증된 전담 선생님이 수업하고, 매 수업 후 A.I가 평가서와 10문항 복습 퀴즈를 자동으로 만들어 드려요. 아래에서 자세히 볼게요.',
    run: 'openAboutMangoi' },
  // 수업료 / 가격 / 얼마
  { re: /(수업료|수강료|학원비|레슨비|얼마|가격|비용|요금|금액|price|cost|how\s*much)/i,
    answer: '망고아이는 필리핀 현지 교육센터를 직접 운영해 거품을 뺀 합리적인 수강료로 제공해요. 1:1과 1:2 중 고를 수 있고, 1:2 수업은 1인당 비용이 더 저렴합니다. 정확한 금액은 무료 상담으로 맞춤 견적을 받아보실 수 있어요.',
    action: 'inquiry' },
  // 대상 연령 / 몇 살부터
  { re: /(몇\s*살|나이|연령|대상|유아|유치원|초등|중등|고등|성인|어른)/i,
    answer: '유아부터 성인까지, 연령과 레벨에 맞춰 CEFR 국제 기준의 단계별 커리큘럼으로 수업해요. 무료 레벨테스트로 지금 실력에 맞는 반을 추천해 드립니다.',
    run: 'grid:leveltest' },
  // 수업 방식 / 1:1, 1:2 / 원어민
  { re: /(1\s*:\s*1|일대일|1대1|1\s*:\s*2|일대이|1대2|소수정예|전담|수업\s*방식|어떻게\s*수업|몇\s*명|원어민|native)/i,
    answer: '엄격히 검증된 원어민 전담 선생님과 1:1 또는 1:2 소수정예 화상수업으로 진행해요. 매번 바뀌는 랜덤 매칭이 아니라 같은 선생님이 꾸준히 관리해 아이의 성향과 약점을 정확히 지도합니다.',
    run: 'grid:teachers' },
  // 필리핀 / 어디 / 센터
  { re: /(필리핀|현지|센터|어디\s*(있|서)|어느\s*나라|위치)/i,
    answer: '망고아이는 외주가 아니라 직접 운영하는 필리핀 현지 교육센터에서 수업해요. 전용 인터넷·장비를 갖춘 안정적인 환경에서 정규직 원어민 교사가 책임지고 지도합니다.',
    run: 'openAboutMangoi' },
  // 교재 / 커리큘럼 / 무엇을 배우나
  { re: /(교재|커리큘럼|무엇을\s*배|무슨\s*내용|어떤\s*내용|과정)/i,
    answer: '연령과 레벨에 맞춰 설계한 자체 교재와 CEFR 기반 커리큘럼으로 학습해요. 아이가 흥미를 느끼는 실생활 주제로 구성해 스스로 말하고 싶게 만듭니다.',
    run: 'grid:curriculum' },
  // 무료체험 / 체험
  { re: /(무료\s*체험|체험\s*수업|체험\s*있|공짜\s*수업|trial)/i,
    answer: '네, 무료 체험 수업을 신청할 수 있어요. 아래에서 상담·체험 신청을 남기시면 안내해 드립니다.',
    action: 'inquiry' },
  // 환불 / 해지
  { re: /(환불|중도\s*해지|해지|refund)/i,
    answer: '수강 변경·환불 등 자세한 안내는 상담으로 도와드려요. 아래 상담 신청 또는 고객센터로 문의해 주세요.',
    action: 'inquiry' },
  // 앱 / 기기 / 설치
  { re: /(앱|어플|설치|다운로드|핸드폰|휴대폰|모바일|태블릿|아이패드|피시|컴퓨터|기기|install|device)/i,
    answer: 'PC·태블릿·휴대폰 어디서나 수업에 입장할 수 있어요. 카메라와 마이크만 있으면 되고, 준비가 잘 됐는지 자가진단으로 미리 확인할 수 있습니다.',
    run: 'grid:diagnosis' },
  // 예약 / 신청 방법 / 수업 시간
  { re: /(예약|신청\s*방법|언제\s*수업|수업\s*시간|시간대|무슨\s*요일)/i,
    answer: '원하는 시간대로 자유롭게 예약하고, 갑작스러운 일정은 연기·변경으로 조정할 수 있어요. 아래 수업 신청에서 시간과 선생님을 골라 시작해 보세요.',
    url: '/lesson-booking-demo.html' },
];

// 질문형 입력인지(정보를 물음) — 질문이면 FAQ 즉답을 메뉴 이동보다 먼저 준다.
const STUDENT_QUESTION_RE = /(뭐|무엇|무슨|어떤|어떻게|어케|왜|얼마|몇|어디|언제|누구|있나|있어|되나|되요|되나요|할\s*수|하나요|인가요|인가|일까|까요|궁금|알려|가르쳐|설명|차이|추천|\?|？)/;

function faqToResponse(f: StudentFaq): any {
  if (f.action === 'inquiry') return { intent: 'action', name: 'inquiry', answer: f.answer };
  const out: any = { intent: 'navigate', answer: f.answer };
  if (f.url) out.url = f.url;
  else if (f.run) out.run = f.run;
  return out;
}

function resolveStudentFaq(command: string): any | null {
  const t = normStudent(command); // 음성인식·오타 교정 포함 → 브랜드명 오인식도 FAQ 매칭
  if (!t) return null;
  for (const f of STUDENT_FAQ) {
    if (f.re.test(t)) return faqToResponse(f);
  }
  return null;
}

// LLM 폴백용: 알려진 목적지 화이트리스트(할루시네이션 URL 차단)
const STUDENT_URL_WHITELIST = new Set(STUDENT_ROUTES.filter(r => r.url).map(r => r.url as string));
const STUDENT_RUN_WHITELIST = new Set(STUDENT_ROUTES.filter(r => r.run).map(r => r.run as string));

const STUDENT_MENU_LINES = STUDENT_ROUTES.map(r => {
  const dest = r.url ? `url ${r.url}` : r.view ? `view ${r.view}` : r.run ? `run ${r.run}` : 'action inquiry';
  return `- ${r.label}: ${r.kws.slice(0, 6).join(', ')} → ${dest}`;
}).join('\n');

const STUDENT_SYSTEM_PROMPT = `You are 망고아이(Mangoi) student assistant for an English academy. The user typed in a search box. Decide if they want to GO somewhere (navigate) or ASK something (answer). Output ONE JSON object only — no prose, no markdown, no code fences.

KNOWLEDGE (use ONLY these facts when answering about 망고아이 — never invent prices, ages, or details not listed):
- 망고아이는 원어민 선생님의 1:1·1:2 화상영어 수업과 A.I 학습관리를 하나로 합친 화상영어 서비스입니다. (수업은 사람이, 예습·복습·평가·발음교정은 A.I가 담당)
- 원어민 전담 선생님제(랜덤 매칭 아님), 1:1 또는 1:2 소수정예 수업.
- 필리핀 현지 교육센터를 직접(직영) 운영 — 외주가 아니며, 그래서 합리적인 수강료. 정확한 금액/견적은 무료 상담으로 안내.
- 매 수업 후 A.I가 평가서를 자동 생성하고 배운 내용 기반 10문항 복습 퀴즈 진행. 월간 A.I 리포트 제공.
- CEFR 국제 기준 단계별 커리큘럼 + 연령·레벨 맞춤 자체 교재. 유아부터 성인까지 대상.
- PC·태블릿·휴대폰 어디서나 수업 입장. 원하는 시간대 예약, 수업 연기·변경 가능.
- 출결·평가·진도·공지를 학부모 카카오톡으로 실시간 전송.
- 20년 전통, 국내 최초의 화상영어 기업.
- 수업 외 시간에도 A.I 발음 코치로 무제한 말하기 연습 가능.
When the user asks about 망고아이 in general (뭐야/소개/특징 등), give a warm 1~2 sentence Korean summary from the KNOWLEDGE, then set navigate run "openAboutMangoi" so the intro opens.

MENU (keyword hints → destination):
${STUDENT_MENU_LINES}

Output shapes (pick exactly one):
{"intent":"navigate","url":"/vocab.html","answer":"<Korean 1 sentence>"}
{"intent":"navigate","view":"view-videocall-lobby","answer":"<Korean 1 sentence>"}
{"intent":"navigate","run":"grid:payment","answer":"<Korean 1 sentence>"}
{"intent":"navigate","run":"openAboutMangoi","answer":"<Korean 1~2 sentence summary about 망고아이>"}
{"intent":"action","name":"inquiry","answer":"<Korean 1 sentence>"}
{"intent":"answer","answer":"<Korean 1~3 sentences>"}

RULES:
1. If the input names or hints at ANY menu above (even loosely, even with typos or partial words), ALWAYS return navigate/action to the CLOSEST matching destination. Prefer navigating over answering — when in doubt, navigate.
2. Only "url"/"view"/"run" values that appear in the MENU above are allowed. Never invent a URL.
3. If it is a genuine question (뭐야/어떻게/왜/얼마/언제/추천/차이 등) that no menu answers, use intent "answer" and give a warm, helpful Korean answer (1~3 sentences). You may also suggest the closest menu keyword.
4. "answer" is always Korean. Output JSON only.`;

export async function processStudentCommand(env: { AI?: any }, command: string): Promise<any> {
  const cmd = (command || '').toString().trim();
  if (!cmd) return { intent: 'answer', answer: '검색어를 입력해주세요.' };
  if (cmd.length > 300) return { intent: 'answer', answer: '검색어가 너무 길어요. 짧게 입력해 주세요.' };

  // 질문형("~뭐야/얼마/어떻게/몇 살")인지 판정 — 질문이면 FAQ 즉답을 메뉴 이동보다 먼저.
  const isQuestion = STUDENT_QUESTION_RE.test(cmd);

  // 1) 질문형이면 지식(FAQ) 먼저 — 정보를 즉답하고 관련 화면으로 함께 이동
  if (isQuestion) {
    const faq = resolveStudentFaq(cmd);
    if (faq) return faq;
  }

  // 2) 결정론적 메뉴 라우터 — 메뉴 키워드가 하나라도 걸리면 즉시 이동 (LLM·크레딧 스킵, 100% 확실)
  const hit = resolveStudentNav(cmd);
  if (hit) return routeToResponse(hit);

  // 3) 명령형인데 메뉴엔 없지만 FAQ 주제면 즉답 (예: "가격", "환불")
  if (!isQuestion) {
    const faq = resolveStudentFaq(cmd);
    if (faq) return faq;
  }

  // 3.5) 자모 퍼지 — 오타·음성인식 오류를 흡수해 가장 가까운 메뉴로 (LLM·크레딧 스킵)
  const fz = fuzzyStudentNav(cmd);
  if (fz) return routeToResponse(fz);

  // 4) 그래도 못 잡으면 LLM — 가장 가까운 메뉴로 안내하거나 질문에 답변
  if (!env.AI) return { intent: 'answer', answer: '무엇을 도와드릴까요? 게임·단어장·성적표·복습퀴즈·발음연습·수업입장, 또는 "망고아이 소개"·"수업료" 처럼 물어보셔도 돼요.' };
  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: STUDENT_SYSTEM_PROMPT },
        { role: 'user', content: cmd },
      ],
      max_tokens: 320,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    const raw = (result?.response || result?.result?.response || '').trim();
    let parsed: any = null;
    try { parsed = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
    if (!parsed || !parsed.intent) throw new Error('no intent');
    if (!['navigate', 'action', 'answer'].includes(parsed.intent)) parsed.intent = 'answer';

    // 할루시네이션 방어: LLM이 목적지를 지어내면 화이트리스트로만 허용, 아니면 answer 로 강등
    if (parsed.intent === 'navigate') {
      const okUrl = parsed.url && STUDENT_URL_WHITELIST.has(parsed.url);
      const okRun = parsed.run && STUDENT_RUN_WHITELIST.has(parsed.run);
      const okView = parsed.view === 'view-videocall-lobby';
      if (!okUrl && !okRun && !okView) {
        parsed = { intent: 'answer', answer: parsed.answer || '원하시는 메뉴를 못 찾았어요. 게임·단어장·성적표·복습퀴즈·발음연습 등으로 말씀해 보세요.' };
      } else {
        if (!okUrl) delete parsed.url;
        if (!okRun) delete parsed.run;
        if (!okView) delete parsed.view;
      }
    }
    if (parsed.intent === 'action' && parsed.name !== 'inquiry') {
      parsed.intent = 'answer';
      parsed.answer = parsed.answer || '아래 버튼을 이용해 주세요.';
    }
    if (!parsed.answer) parsed.answer = '이동합니다.';
    return parsed;
  } catch {
    return { intent: 'answer', answer: '무엇을 도와드릴까요? 게임·단어장·성적표·복습퀴즈·발음연습·수업입장 등으로 말씀해 보세요.' };
  }
}
