// ═══════════════════════════════════════════════════════════════
// content.js — copy for the English admin guide deck.
//
// Menu names are NOT written by hand: they come from menu_en.json, which
// dump_menu.js produces by running the app's own i18n-sweep engine over the
// real sidebar. Never hand-edit a name here — fix the dictionary in
// public/js/i18n-sweep.js and re-run, so the deck and the screen always agree.
//
// SUB_DESC is keyed by card id (stable across renames). gen.js fails loudly if
// a key here matches no real card, so a menu rename can't silently rot the deck.
// ═══════════════════════════════════════════════════════════════

// One-line "what is this for" per sub-menu.
const SUB_DESC = {
  // 1 Evaluations
  'card-eval-mgmt': 'Write one student’s report card',
  'card-bulk-eval': 'Grade many students at once',
  'card-ai-lesson-report': 'AI turns a lesson into a report',
  'card-ai-eval-draft': 'AI writes your first draft',
  'card-monthly-report': 'One month of learning, summarised',
  'card-comparison-report': 'Compare vs last month & class average',
  // 2 Notification Center
  'card-webpush-mgmt': 'Pop-up alerts in the browser',
  'card-kakao-mgmt': 'Send KakaoTalk messages',
  'card-poster-maker': 'Design & send notices and posters',
  'card-popups-mgmt': 'Show a popup on the site',
  'card-notifications': 'Automatic event alerts',
  'card-notice-board': 'Posts on the notice board',
  // 3 Teachers
  'card-teacher-mgmt': 'Add & edit teacher profiles',
  'card-payroll-auto': 'Pay calculated automatically',
  'card-schedule-requests': 'Approve postpone / change requests',
  'card-bug-reports': 'Problems teachers reported',
  'card-class-audit': 'Who changed which class, and when',
  'card-class-ratings': 'Star ratings from students',
  'card-payroll': 'Review and pay salaries',
  'card-mbti-mgmt': 'Teacher personality profiles',
  'card-praise-stats': 'Who is giving praise points',
  'card-supervisor': 'Supervisor assignments',
  'card-room-invite': 'Invitations to class rooms',
  'card-timetable': 'Who teaches when',
  'card-lesson-log': 'What happened in each lesson',
  'card-report-forms': 'Templates used for reports',
  // 4 Stats / KPI
  'card-kpi-dashboard': 'The academy’s key numbers',
  'card-daily-charts': 'Day-by-day activity',
  'card-rankings': 'Student & teacher leaderboards',
  'card-retention-risk': 'Who might quit soon',
  'card-retention': 'Delete data past its keep-period',
  'card-active-rooms': 'Classes running right now',
  'card-nps-monthly': 'Monthly satisfaction score',
  'card-ai-forecast': 'AI predicts what is coming',
  'card-voice-stats': 'Speaking-practice statistics',
  // 5 Accounting / Points
  'card-accounting-mgmt': 'Payments, refunds, invoices',
  'card-payments-b2b': 'Billing for companies & partners',
  'card-payments-b2c': 'Payments from parents',
  'card-recurring-billing': 'Automatic monthly charges',
  'card-auto-dunning': 'Chase unpaid fees automatically',
  'card-settlement-stats': 'Branch & agency settlement figures',
  'card-points-mgmt': 'Student reward points',
  // 6 Students / Parents
  'sm-all-schedules': 'Every class on one calendar',
  'card-students-mgmt': 'Add & edit students',
  'card-school-attendance-stats': 'Attendance per academy',
  'card-family-mgmt': 'Siblings & family discounts',
  'card-inquiry-mgmt': 'Questions from parents',
  'card-enrollments': 'New sign-ups',
  'card-badges-mgmt': 'Achievement badges',
  'card-community': 'Community posts',
  'card-counseling-booking': 'Consultation appointments',
  'card-parent-digest': 'The summary parents receive',
  'card-parent-faq-bot': 'Auto-answers common questions',
  'card-referral': 'Referral rewards',
  'card-alumni': 'Space for graduates',
  'card-gallery': 'Class photos & videos',
  // 7 Education / Content
  'card-review-quiz': 'Set review quizzes',
  'card-textbooks': 'Manage textbooks',
  'card-microlearn': 'Bite-size lessons',
  'card-mini-toeic': 'Short TOEIC tests',
  'card-pronunciation': 'Pronunciation coaching',
  'card-video-dict': 'Videos for words',
  'card-voice-diary': 'Students’ spoken diaries',
  'card-level-tests': 'Placement tests & CEFR level',
  'card-battle-mgmt': 'The English battle game',
  'card-recording-storage': 'Saved class recordings',
  'card-homework': 'Assign & check homework',
  // 8 Library
  'card-lib-admin': 'Files for admins (password)',
  'card-lib-teacher': 'Files for teachers',
  'card-lib-branch': 'Files for branches',
  'card-lib-agency': 'Files for agencies',
  'card-lib-student': 'Files for students & parents',
  // 9 System
  'card-calendar': 'Academy calendar & holidays',
  'card-permissions': 'Who can see and do what',
  'card-franchises': 'Franchise accounts',
  'card-centers': 'Center & branch records',
  'card-data-export': 'Download data as files',
  'card-admin-alerts': 'Alerts for administrators',
  'card-admin-ghost': 'Watch a live class invisibly',
  'card-admin-whisper': 'Send a private note to a teacher',
  'card-attendance-status': 'Attendance overview',
  'card-auto-attendance': 'Check in with a QR code',
  'card-class-attendance': 'Attendance per class'
};

// Fallback for sub-menus that have no card id (data-card="null") — keyed by EN label.
const SUB_DESC_BY_NAME = {
  '🏢 Capitown Settlement ⭐New': 'Capitown partner settlement'
};

// Per-group narrative: what it does, why it exists, the screenshot, and one tip.
const GROUP_INFO = {
  'Evaluations': {
    what: 'Grade students and build the reports that parents receive.',
    why: 'Every teacher used to grade in their own style. One shared format makes grading fair and gives parents something they can trust.',
    shot: '05_evaluations', tip: 'Start with AI Draft, then edit. It is far faster than a blank page.'
  },
  'Notification Center': {
    what: 'Send news to parents and students — push, KakaoTalk, popups and notices.',
    why: 'Messages used to go out from several places and some families were missed. Now everything is sent, and logged, in one place.',
    shot: '06_notice_studio', tip: 'Notice Studio designs the poster and sends it in one go.'
  },
  'Teachers': {
    what: 'Everything about your instructors: profiles, pay, timetable and teaching quality.',
    why: 'Teachers are the product. Pay used to be worked out by hand each month; now it is calculated from the lessons that actually happened.',
    shot: '07_teachers', tip: 'Auto Payroll fills the numbers; Payroll is where you check and approve them.'
  },
  'Stats / KPI': {
    what: 'The numbers that tell you how the academy is really doing.',
    why: 'So decisions come from data instead of a feeling — including which students are about to leave, while you can still act.',
    shot: '08_kpi', tip: 'Churn Risk is the one to check every week.'
  },
  'Accounting / Points': {
    what: 'Money coming in, money going out, and student reward points.',
    why: 'This replaced a pile of spreadsheets. Unpaid fees are now chased automatically instead of being forgotten.',
    shot: '09_accounting', tip: 'Auto Collection sends the reminders so nobody has to phone families.'
  },
  'Students / Parents': {
    what: 'The people you serve — students, their families, enquiries and bookings.',
    why: 'One record per student, so anyone can answer a parent’s question without hunting through files.',
    shot: '10_students', tip: 'The search box at the top of the sidebar finds any student instantly.'
  },
  'Education / Content': {
    what: 'What students actually study: textbooks, quizzes, tests and games.',
    why: 'Content needs to stay fresh and matched to each student’s level, without rebuilding lessons by hand.',
    shot: null, tip: 'Level Test sets the CEFR level that the rest of the content follows.'
  },
  'Library': {
    what: 'File downloads, separated by who is allowed to see them.',
    why: 'The right files reach the right people — and internal documents stay internal.',
    shot: '11_library', tip: 'The Admin Library is password-gated on purpose.'
  },
  'System': {
    what: 'Settings, permissions and attendance — the machinery underneath.',
    why: 'To keep the data correct and make sure each role only sees what it should.',
    shot: '12_permissions', tip: 'Get Permissions right first. Everything else depends on it.'
  }
};

module.exports = { SUB_DESC, SUB_DESC_BY_NAME, GROUP_INFO };
