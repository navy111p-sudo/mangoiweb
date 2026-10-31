/* ═══════════════════════════════════════════════════════════════════════════
 * slides-en.mjs — "Easy Admin Page Guide" (English) — the **text master**
 *
 *   Same deck as slides.mjs (Korean), same order, same pictures and arrows.
 *   Bake it with:  GUIDE_LANG=en node capture.mjs && GUIDE_LANG=en node build.mjs
 *
 *   ⚠️ Keep this file in step with slides.mjs:
 *      · the same slide types in the same order
 *      · for every 'focus' slide, steps[n] = arrow n in the picture
 *        (= capture.mjs marks / marksEn, same order)
 *      · menu names must match the English admin screen (adm-ia6.js «en:» labels)
 *   ⛔ Emoji only inside Unicode 6.0 (CLAUDE.md 1-4).
 * ═══════════════════════════════════════════════════════════════════════════ */

import { SITE, ADMIN_URL, KAKAO } from './slides.mjs';
export { SITE, ADMIN_URL, KAKAO };

export const DECK_TITLE = 'Easy Admin Page Guide';

export const SLIDES = [

/* 01 */ { type:'cover', head:'',
  badge:'EASY ADMIN GUIDE', eyebrow:'MANGOI',
  title: DECK_TITLE,
  sub:'Class schedule · student payments · teacher payroll — just follow the red numbers in each picture.',
  foot:'For directors and staff using the admin page for the first time' },

/* 02 */ { type:'intro', head:'Introduction', title:'Who is this guide for?',
  lead:[
    'It is for anyone opening the admin page for the first time.',
    'No hard words. Only the things you use most.',
    'A red number in a picture = the same number in the steps beside it. Press them in order.'],
  cards:[
    ['Signing in',      'Type the address and your ID. That is all.'],
    ['The screen',      'Menu on the left, content in the middle. Just two parts.'],
    ['Finding things',  'Do not dig through menus. Type one word.'],
    ['Class schedule',  'Who teaches when — all on one page.'],
    ['Student payments','See who paid and how much, right away.'],
    ['Teacher payroll', 'Counts the month\'s classes and works out pay for you.'],
    ['Finishing',       'When you are done, always sign out.']] },

/* 03 */ { type:'toc', head:'Contents', title:'Contents' },

/* 04 */ { type:'step', n:'01', head:'Step by step',
  title:'Getting in (signing in)', sub:'Type the address · enter your ID · go in',
  lead:'The first job is getting into the admin page. It is easy. After three times your hands will remember.',
  shot:'login', crop:[560,0,1780,1800],
  steps:[
    'Open Chrome. That is your internet window.',
    `Type ${ADMIN_URL} in the address bar at the top and press Enter.`,
    'Enter your ID and password.',
    'Press the blue "Log In" button.'],
  remember:[
    'Forgot your password? Press "Forgot Password". Six digits come by text message.',
    'You only see screens for your own job, so do not worry about pressing the wrong thing.'],
  tip:'Tired of typing the address? Press the star (bookmark). Next time it is one click.',
  warn:'On a shared computer, always sign out when you finish.' },

/* 05 */ { type:'step', n:'02', head:'Step by step',
  title:'What the screen looks like', sub:'Menu on the left · content in the middle',
  lead:'The screen has only two big parts. Know these and you will not get lost.',
  shot:'home',
  steps:[
    'The column on the left is the menu: Today · Students · Teachers … 7 groups.',
    'Press a group to open the menus inside it.',
    'Press a menu and its content appears in the middle.',
    'Lost? Press "Home" at the top of the middle. You go back to the start.'],
  remember:[
    'The number next to a menu name is how many items are inside.',
    'At the bottom left are your account and the "Site home" button.',
    'On a small screen the left menu folds away. Press ≡ to bring it back.'],
  tip:'Press "Menu map" above the menu to see every menu on one page.' },

/* 06 */ { type:'step', n:'03', head:'Step by step',
  title:'Finding what you need, fast', sub:'Do not dig through menus — type one word',
  lead:'Do not open menus one by one. Type one word in the search box and it appears.',
  shot:'search', crop:[0,240,1300,800],
  steps:[
    'Click the "Search Menu…" box at the very top left.',
    'Type just one word. (notice · attendance · payroll …)',
    'Press the menu you want from what is left.'],
  remember:[
    'Do not type a whole sentence. One word finds best.',
    'The "Unified search" in the middle also finds student and teacher names.',
    'Delete the word and the menu goes back to normal.'],
  tip:'Not sure what to press? Just type what you want to do.' },

/* ── The 5 core jobs (2026-10-09: schedule · payment check · staff pay · student payment, in detail with arrows) ── */

/* K0 */ { type:'flow', head:'Core jobs', title:'What an admin does every day — at a glance',
  lead:'When a student joins, the work flows in this order. The next pages show each one with pictures.',
  flow:[
    ['Enrollment', 'Register · set days and time', 'Students › Enrollment', ['Registering confirms it', 'Stuck ones go to "Pending"']],
    ['Class schedule', 'Assign teachers · find open slots', 'Teachers › Schedule', ['One row = one teacher', 'Unlock before moving']],
    ['Reschedule', 'Approve teacher/student requests', 'Today › Reschedule', ['Approve = schedule updates', 'Red number = waiting']],
    ['Student payments', 'Who paid · how much', 'Finance › Payments', ['Find by date or name', 'Download as CSV']],
    ['Teacher payroll', 'Auto-calculated from classes · pay', 'Teachers › Payroll', ['One "Calculate" press', 'Paid? Press "Mark Paid"']]],
  foot:'If you get mixed up, remember this order — enroll → schedule → change → payment → payroll' },

/* K1 */ { type:'focus', head:'Core job ① Enrollment',
  title:'Taking enrollments and creating classes', sub:'Students › Enrollment › Enrollment management',
  lead:'Register a new student here. Once registered it is confirmed and the classes go into the schedule by themselves.',
  shot:'enroll', crop:'auto', aspect:1.55,
  steps:[
    'Open "+ Add Enrollment", fill in ID · level · days · time · start date · length, and register.',
    'Use the view box to pick "Pending / Confirmed" and narrow the list.',
    'The "Pending" number = enrollments that could not be confirmed. Look at these first.',
    'Press "▸ Not confirmed" to see why it is stuck. Fix it, then confirm again.'],
  tip:'For confirmed rows, turn on parent texts and payment scheduling from "⚙ Follow-up".',
  warn:'Registering puts the classes on the student\'s screen right away. Check the days and time once more.' },

/* K2 */ { type:'focus', head:'Core job ② Class schedule',
  title:'Seeing the class schedule at a glance', sub:'Teachers › Schedule › Weekly schedule',
  lead:'One row = one teacher\'s week. Coloured cells are classes, empty space is free time.',
  shot:'week', crop:'auto', aspect:1.55,
  steps:[
    'Use "◀ Prev · Today · Next ▶" to choose the week.',
    'Type a teacher or student name or ID in the search box to narrow the rows.',
    'Each row is one teacher. Press a coloured cell to see the student and time.',
    'Press "Find open slots" to leave only the empty cells where a class can go.',
    '"AI Match" suggests a teacher and time that suit the student.',
    'It starts 🔒 Locked. Press it to unlock before you can drag classes around.'],
  tip:'For 15 seconds after a move, an "Undo" button appears. Mistakes are easy to fix.',
  warn:'Moving a class also changes the student\'s screen and text reminders. Check before you move.' },

/* K3 */ { type:'focus', head:'Core job ③ Reschedule',
  title:'Approving postpone / change requests', sub:'Today › Reschedule',
  lead:'Requests from teachers and students — "please move this class" — gather here.',
  shot:'srq', crop:'auto', aspect:1.55,
  steps:[
    'Set the view box to "Pending only" to see just what needs doing.',
    'On each row read original time → wanted time · reason.',
    'If it is fine, press the green "Approve" — the schedule changes by itself.',
    'If not, press the red "Reject" — please write a reason.'],
  tip:'The red number next to "Reschedule" in the left menu = requests waiting.',
  warn:'If the teacher already has another class then, approval is refused and the reason is shown.' },

/* K4 */ { type:'focus', head:'Core job ④ Student payments',
  title:'Checking student payments', sub:'Finance › Payments › B2C Payments (parent card)',
  lead:'Money that parents pay by card collects here. Who · when · how much — all at a glance.',
  shot:'pay', crop:'auto', aspect:1.55,
  steps:[
    'The four boxes at the top — today · this month · number of payments · card fees.',
    'Choose an agency to see only your branch\'s payments.',
    'Enter a start and end date to set the period.',
    'Type a student name or ID.',
    'Press the blue "Search".',
    'Press "Download CSV" to get a spreadsheet file.',
    'Check payment date · student · method · amount in the table.'],
  tip:'Money academies send by bank transfer is in the separate "B2B Payments" table just above.',
  warn:'Refunds are hard to undo. If you are not sure, ask before you press.' },

/* K5 */ { type:'focus', head:'Core job ⑤ Teacher payroll',
  title:'Running teacher payroll', sub:'Teachers › Payroll › Automatic payroll',
  lead:'It counts the classes taught in a month and works out the pay. The unit is ₱ (Philippine peso).',
  shot:'payroll', crop:'auto', aspect:1.55,
  steps:[
    'Choose the year and month to pay.',
    'Press the blue "Calculate" to see each teacher\'s classes and amount.',
    'The line on the right shows teachers · total classes · deductions · final pay.',
    'Press "Detail" to check every single class.',
    'Once the money is sent, press "Mark Paid".',
    'When everything is checked, press "Save All".'],
  tip:'Press "₩ Show in KRW" to also see the amount in Korean won at today\'s rate.',
  warn:'Deductions are automatic. If an amount looks wrong, open "Detail" before changing it.' },

/* 07 */ { type:'step', n:'04', head:'Step by step',
  title:'Viewing evaluations', sub:'How did the child do today — the teacher\'s note',
  lead:'An evaluation is a note the teacher writes after class. It says what the child did well.',
  shot:'eval',
  steps:[
    'Press "Lessons" on the left.',
    'Press "Evaluations".',
    'In "Student Evaluations", search by name or date.',
    'Press a row to open it.'],
  remember:[
    'Parents can see evaluations too. Be careful when editing.',
    'No evaluation? Ask that class\'s teacher.'],
  tip:'Open "List & Stats" to see at a glance who has not written one yet.' },

/* 08 */ { type:'step', n:'05', head:'Step by step',
  title:'Sending a notice', sub:'Telling many people at once',
  lead:'A notice reaches parents and students all at once. Do it once and it gets easy.',
  shot:'notice',
  steps:[
    'Press "System" on the left, then "Announcements".',
    'Choose where to send. (KakaoTalk alert · web push · board)',
    'Write a title and the message. Shorter is better.',
    'First send a test to yourself.',
    'If it looks right, press "Send".'],
  remember:[
    'A sent notice cannot be taken back. Read it once more before sending.',
    'If it is your first time, always send it to yourself first.'],
  tip:'Send non-urgent notices between 10 a.m. and 8 p.m.',
  warn:'Never put personal details like phone numbers or addresses in a notice.' },

/* 09 */ { type:'step', n:'06', head:'Step by step',
  title:'Finding students and parents', sub:'Everything about one child on one screen',
  lead:'See one student\'s classes, attendance and payments on a single screen.',
  shot:'student',
  steps:[
    'Press "Students" on the left, then "Students" (the roster).',
    'Type a name or ID in the search box.',
    'Press the student\'s row.',
    'Classes · attendance · payments appear on one screen.'],
  remember:[
    'Not found by name? Try the ID.',
    'Brothers and sisters can be viewed together in "Family Accounts".'],
  warn:'Student information is personal data. Do not photograph the screen and send it outside.' },

/* 10 */ { type:'step', n:'07', head:'Step by step',
  title:'Sending the parent report', sub:'Look how much your child has grown',
  lead:'A report is a letter that shows "your child has grown this much". Parents love it.',
  shot:'parent',
  steps:[
    'Press "Students" on the left, then "Parents".',
    'Open "Weekly parent report".',
    'Choose the student and the period.',
    'Read it once in the preview.',
    'Press "Send".'],
  remember:[
    'Reports are built from class records by themselves.',
    'If there is something to be proud of, add one more line.'],
  tip:'Send it on the same weekday every week and parents will look forward to it.' },

/* 11 */ { type:'step', n:'08', head:'Step by step',
  title:'Viewing teachers', sub:'Who · when · which classes',
  lead:'This screen shows who each teacher is and when they teach.',
  shot:'teacher',
  steps:[
    'Press "Teachers" on the left, then "Teachers" (the roster).',
    'Search by name.',
    'Press a row to see contact details and classes.',
    'For the timetable, use "Schedule".'],
  remember:[
    'Teachers have more than one number, which is confusing. Searching by name is safest.',
    'Pay is in the separate "Payroll" menu.'],
  tip:'To see whether classes are going well, check the "Lesson log".' },

/* 13 */ { type:'step', n:'10', head:'Step by step',
  title:'Getting manuals from the Library', sub:'All the manuals are here',
  lead:'There are more manuals besides this guide. They are all in the Library.',
  shot:'library',
  steps:[
    'Press "System" on the left, then "Library".',
    'Press "Admin Library".',
    'Press the file you need to download it.'],
  remember:[
    'There are separate libraries for teachers, branches and students.',
    'Some libraries have a password. If you do not know it, ask HQ.'],
  tip:'You can also go straight there from the account button at the bottom left ▸ "Library / user guide".' },

/* 14 */ { type:'step', n:'11', head:'Step by step',
  title:'How our home page looks to visitors', sub:'Look at it through a parent\'s eyes',
  lead:'Take a look at the screen parents and students see. You will know what to tell them.',
  shot:'site',
  steps:[
    'Press "Site home" at the very bottom left.',
    'The first screen students see opens.',
    'Press Back to return.'],
  remember:[
    `The only address to give people is ${SITE}.`,
    'Give any other address and you will hear "I can\'t see it".'],
  tip:`When a parent asks "Where do I go?", just tell them ${SITE}.` },

/* 15 */ { type:'step', n:'12', head:'Step by step',
  title:'Finishing safely', sub:'Sign out before closing the window',
  lead:'When you are done, do not just close the window. Signing out keeps it safe.',
  shot:'logout',
  steps:[
    'Press the account button at the very bottom left.',
    'When the window opens, press "Log out" at the bottom.',
    'When you are back at the sign-in screen, you are done.'],
  remember:[
    'Change your password with "Change Password" in the same window.',
    'Never share your password.'],
  warn:'On a shared computer, always sign out.' },

/* 16 */ { type:'table', head:'Menus at a glance', title:'Menus at a glance',
  lead:'The left menu has 7 groups. You only need to know what is in each.',
  rows:[
    ['Today',                   'Today\'s classes · attendance · alerts',      'Everything to do today'],
    ['Students',                'Roster · enrollment · parents',               'Work about the children'],
    ['Teachers',                'Roster · schedule · lesson log · payroll',    'Work about the teachers'],
    ['Lessons',                 'Evaluations · textbooks · homework · recordings','Things used in class'],
    ['Finance',                 'Accounting · payments · points',              'Work about money'],
    ['HQ · Branches · Agencies','Master branch · branch · agency',             'Our company\'s structure'],
    ['System',                  'Announcements · library · staff & roles',     'Things for everyone']],
  foot:'The number next to a menu name is how many items are inside. Can\'t find it? Type one word in the search box.' },

/* 17 */ { type:'help', head:'When you get stuck', title:'When you get stuck, do this',
  lead:'Do not worry if you see something new. Try these three, in order.',
  ways:[
    ['1','Type one word in the search box','The box at the very top left. Just one word, like "notice" or "attendance".'],
    ['2','Ask the A.i assistant','Press the yellow face at the bottom right. You can ask by voice too.'],
    ['3','Ask a person',`Ask on our KakaoTalk channel ${KAKAO}.`]],
  askTitle:'Always ask before you press these',
  ask:['Refunds','Deleting records','A notice to everyone','Changing someone else\'s password'],
  foot:'Asking and not pressing is always better than pressing without knowing.' },

/* 18 */ { type:'faq', head:'Frequently asked questions', title:'Frequently asked questions',
  qa:[
    ['Where do I type the address?', `The long box at the very top of Chrome — the address bar, not the search box. Type ${ADMIN_URL} there and press Enter.`],
    ['I forgot my password.', 'Press "Forgot Password" on the sign-in screen. Six digits come by text to your registered number.'],
    ['There are too many menus.', 'Type one word in the search box at the top left, like "attendance", "payroll" or "notice".'],
    ['The screen looks strange.', 'Press Ctrl and F5 together on the keyboard. That fixes almost everything.'],
    ['What if I press the wrong thing?', 'Most actions ask "Are you sure?" once more. Just be careful with payments, refunds and deleting.'],
    ['Does it work on a phone?', 'Yes. On a small screen the left menu folds away. Press ≡ to open it.']] },

/* 19 */ { type:'check', head:'First-day checklist', title:'Just these on day one',
  lead:'You do not have to learn it all today. Try just these six.',
  items:[
    ['Sign in once',                    'Type the address and go in.'],
    ['Press the star (bookmark)',       'Next time it is one click.'],
    ['Type "notice" in the search box', 'Feel how fast search is.'],
    ['Find one student',                'Use a name you know.'],
    ['Send yourself a test notice',     'Practice before sending for real.'],
    ['Press sign out',                  'Learn how to finish, and you are done.']],
  foot:'That is enough for day one. The rest comes naturally as you use it.' },

/* 20 */ { type:'wrap', head:'Wrap-up', title:'Remember just three things',
  three:[
    ['Search box',   'Do not dig through menus — type one word'],
    ['A.i assistant','Ask the yellow face at the bottom right'],
    ['Sign out',     'Always press it before you leave']],
  lead:'You do not need to know the rest. You will pick it up as you go.',
  foot:'And one more — if you are not sure, ask before you press.' },

/* 21 */ { type:'end', head:'',
  title:'You\'re all set!',
  sub:'You can start using it today.',
  url: ADMIN_URL,
  lines:[
    `Where to sign in — ${ADMIN_URL}`,
    `Address for parents — ${SITE}`,
    `Stuck? — KakaoTalk channel ${KAKAO}`] }
];
