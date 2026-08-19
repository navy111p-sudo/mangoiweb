// "Easy Admin Page Guide" — English script (written so a 10-year-old can follow it)
//   ⚠️ Screenshots come from tools/guide-shots/shoot.mjs. `shot` is that file's name.
//   ⚠️ Do not describe anything that is not visible in the capture.
export const meta = {
  title: 'Easy Admin Page Guide',
  brand: 'MANGOI · 망고아이',
  header: 'Mangoi Admin — Easy Guide',
  sub: "You don't need to be good with computers — just follow one step at a time",
  cover: 'For directors and staff using the admin page for the first time   |   August 2026 screens',
  site: 'mangoi.ai',
};

export const slides = [
  { kind:'cover' },

  { kind:'intro', title:'What this guide is', icon:'📘',
    lead:'The admin page is the cockpit that runs your school. Students, teachers, money and messages all live here.',
    points:[
      ['One thing per page', 'Each slide teaches one thing. Just follow them in order.'],
      ['Real screens', 'Every picture is the real August 2026 screen, including the newest changes.'],
      ['Why numbers look empty', 'Tables fill up after you press "Load". The pictures were taken before pressing it.'],
      ['Korean · English', 'Press 🌐 KO / EN at the bottom left to switch. This guide comes in both too.'],
    ],
    tip:'Take your time. Almost everything can be undone — only think twice before pressing a delete button.' },

  { kind:'toc', title:'Contents', icon:'📑' },

  { kind:'step', n:1, icon:'🔐', title:'Getting in (signing in)', subtitle:'Type your ID and password',
    lead:'Go to mangoi.ai, then type your ID and password on the admin sign-in screen.',
    steps:[
      'Type your ID in the "ID" box.',
      'Type your password. Press 👁 to peek at it.',
      'Press the blue "✅ Log in" button.',
      'On your own computer, turn on "💾 Save ID" to make next time easier.',
      "Forgot it? Press \"🔧 Find password\".",
    ],
    remember:[
      'What you can see depends on who you are. Signing in sets that for you.',
      'You can also come in with Kakao, Naver or Google.',
    ],
    tip:"Never turn on \"Save ID\" on someone else's computer.",
    shot:'login', mode:'contain' },

  { kind:'step', n:2, icon:'🖥', title:'What the screen looks like', subtitle:'Menu on the left, content in the middle',
    lead:'The screen has just two parts. The left strip is the menu; the middle is what you are looking at. Know that and you will never get lost.',
    steps:[
      'Top left — Korea time and Philippines time side by side.',
      'Below it — the 🔍 menu search box, and "Expand All / Collapse All".',
      'Middle — ⚡ Quick access, the big search box, and today\'s four numbers.',
      'Bottom left — 🩺 Health · 🌐 KO/EN · 🔈 Voice, and your name.',
      'The yellow mango at the bottom right is the AI Ops Assistant.',
    ],
    remember:[
      'There are 8 menu groups — Today · Students · Teachers · Lessons · Finance · HQ·Branches·Agencies · System, plus the AI Ops Assistant.',
      'The number next to a group name is how many menus are inside it.',
    ],
    tip:'Lost? Press "Menu map" at the very top left. That is the way back to the start.',
    shot:'home', mode:'cover' },

  { kind:'step', n:3, icon:'📂', title:'The menu opens three levels deep', subtitle:'Group ▸ menu ▸ the exact spot', badge:'NEW',
    lead:'The left menu opens in three presses. Press a big group, press a menu inside it, and the exact spots appear.',
    steps:[
      '① Press a big group. Example: "Teachers" — its 8 menus open up.',
      '② Press a menu inside. Example: "Payroll".',
      '③ Numbered spots appear. Example: 1 Auto Payroll · 2 Mangoi Teacher Payroll & Rating Dashboard.',
      'Press the number you want and the screen scrolls right to it.',
      'Press the same thing again and it folds back. All three levels work that way.',
    ],
    remember:[
      'A "▸" mark means "there is more inside".',
      'On a phone the menu closes as you pick, then the screen jumps to the spot. That is normal.',
    ],
    tip:'Want to see everything? "⇊ Expand All". Want it tidy? "⇈ Collapse All".',
    shot:'sidebar3', mode:'tall' },

  { kind:'step', n:4, icon:'🔎', title:'Finding what you need, fast', subtitle:'The search box is the shortest path',
    lead:'Do not hunt through menus. Type what you want in the top search box and only that menu stays.',
    steps:[
      'Press the 🔍 box at the top left.',
      'Just type it. Examples: "payroll", "attendance", "notice".',
      'Matching menus light up in yellow. Press one.',
      'Press × to clear the search and get everything back.',
      'The big box in the middle searches students, teachers and franchises too.',
    ],
    remember:[
      'Press 🎤 next to the big search box to search by voice.',
      "When you don't know what to press, search is always the fastest.",
    ],
    tip:'The left box searches menu names. For a student name, use the big search box in the middle.',
    shot:'search', mode:'tall' },

  { kind:'step', n:5, icon:'🗺', title:'Menu map — everything on one page', subtitle:'See where everything lives',
    lead:'Press "Menu map" at the very top left and the whole of Mangoi opens on one page.',
    steps:[
      'Press "Menu map" at the top left.',
      'There are five columns, one per kind of person — Visitor · Student · Parent · Teacher · Operator.',
      'Use the buttons on top to show just one column.',
      'Press any name inside a column to jump straight to that screen.',
      'Use "Search" at the top right to search inside the map.',
    ],
    remember:[
      'The Operator column is the biggest — that is what HQ, branches and agencies use.',
      'Items marked with a lock only open after you sign in.',
    ],
    tip:'Show this map to a new staff member first. It is faster than explaining.',
    shot:'map', mode:'cover' },

  { kind:'step', n:6, icon:'⚡', title:'Quick access', subtitle:'What you use daily sits at the top',
    lead:'The orange box at the top of the middle is Quick access. Whatever you press most moves to the front by itself.',
    steps:[
      "Today's classes (join) — go straight into a class that is running.",
      'Attendance · End / extend classes · Class observation.',
      'Student list · Enrollment · Payments & overdue.',
      'Level test · Evaluations · Inquiries.',
      'Just under it, "Recent" keeps the menus you just visited.',
    ],
    remember:[
      '"auto order" at the bottom right means it sorts itself by what you use most.',
      'A 📌 pin is a shortcut you pinned yourself.',
    ],
    tip:'Most of a normal day ends inside this one box. Start here.',
    shot:'quick', mode:'cover' },

  { kind:'step', n:7, icon:'📅', title:"Today's work", subtitle:'The "Today" group is all you need',
    lead:'The "Today" group on the left holds the 9 things you deal with today.',
    steps:[
      "Today's classes — see what is running now. Press \"Refresh\" for the latest.",
      'Attendance — who came and who did not.',
      'Long absences — students who have been away a while.',
      'Class observation · Postpone & change · Room invite.',
      'New inquiries · Bugs & feedback · Alerts.',
    ],
    remember:[
      'An empty table just means nothing has been loaded yet. Press "Refresh".',
      "Today's four numbers (revenue, students, classes, signups) sit at the top of the middle.",
    ],
    tip:'When you arrive in the morning, read the "Today" group from top to bottom.',
    shot:'today', mode:'cover' },

  { kind:'step', n:8, icon:'👪', title:'Finding a student', subtitle:'Students ▸ Students',
    lead:'Press "Students" then "Students" and the student management screen opens.',
    steps:[
      'Press "🧮 Load" to bring the list in. (Before that it is empty.)',
      'Type a name, ID or academy name in the 🔍 box.',
      'Use "🏫 All agencies·academies" to look at one academy only.',
      'Press a column heading to sort by it.',
      'To see one student in detail, press the 🔍 on that row.',
    ],
    remember:[
      'One student has 16 tabs inside — extensions, evaluations, counselling and messages all happen there.',
      'Use "📥 CSV download" to move the list into Excel.',
    ],
    tip:'If you remember the name, the big search box in the middle is even faster.',
    shot:'students', mode:'cover' },

  { kind:'step', n:9, icon:'🎓', title:'Looking at teachers', subtitle:'Teachers ▸ Teachers',
    lead:'"Teachers" then "Teachers" is where you add, edit and find teachers.',
    steps:[
      'Press "+ Add new teacher" to add someone.',
      'Search by name, phone, email or Kakao ID in the 🔍 box.',
      'Filter with "All status" and "All groups".',
      'The table shows photo, status, location, 10-minute rate and start date.',
      'Use "📥 Bulk roster import" to paste many rows from Google Sheets.',
    ],
    remember:[
      'What you save here shows up on the student site\'s "Teachers" page right away. Nothing else to do.',
      'Only teachers whose status is "active" are shown to students.',
    ],
    tip:'Add a photo and an intro video — parent meetings get much easier.',
    shot:'teachers', mode:'cover' },

  { kind:'step', n:10, icon:'💰', title:'Teacher payroll', subtitle:'Teachers ▸ Payroll',
    lead:'"Teachers" then "Payroll" opens two spots: auto payroll, and the payroll & rating dashboard.',
    steps:[
      'Press "Teachers" to open the group.',
      'Press "Payroll". Two numbered spots appear underneath.',
      '1 Auto payroll — works the month out for you.',
      '2 Mangoi Teacher Payroll & Rating Dashboard — pay and ratings side by side.',
      'Press the number you want and the screen scrolls to it.',
    ],
    remember:[
      'This is money. If a number looks wrong, tell a person before changing anything.',
      'Branches and agencies only see their own.',
    ],
    tip:'When the month rolls over, press "Load"/"Refresh" first to be sure you are looking at the latest.',
    shot:'payroll', mode:'cover' },

  { kind:'step', n:11, icon:'📋', title:'Writing an evaluation', subtitle:'Lessons ▸ Evaluations',
    lead:'It takes one minute after class. Five stars and one line each, and the parent gets it.',
    steps:[
      "Fill in the student's ID and name, and the teacher's name.",
      'Choose the class name and the class date.',
      'Give 5 star ratings — participation · understanding · homework · attitude · speaking.',
      'Always write one line under "✨ Did well".',
      'A line for "💪 To work on" and "🎯 Next goal" helps too.',
    ],
    remember:[
      'When you save, a Kakao alert goes to the parent and student, or an evaluation link is made.',
      'Writing many at once, and AI drafts, are in the same group.',
    ],
    tip:'Write "Did well" first — it is the line parents read first.',
    shot:'eval', mode:'cover' },

  { kind:'step', n:12, icon:'📢', title:'Sending a notice', subtitle:'System ▸ Announcements',
    lead:'This is where news goes out to parents and students — posters, popups, Kakao alerts and app push.',
    steps:[
      'Press "System" then "Announcements".',
      'The "Notice studio" is two steps — ① make a poster → ② publish as a popup.',
      'In ① you design the notice picture. It is kept in "My posters".',
      'In ② you push it into the student app as a popup, and set how long it shows.',
      'Kakao alerts and Web Push live in the same group.',
    ],
    remember:[
      'Always check who it is going to. A sent message cannot be taken back.',
      'Sending the same thing from two places means parents get it twice. Use one.',
    ],
    tip:'Send one to yourself first. If it looks right, then send it to everyone.',
    shot:'poster', mode:'cover' },

  { kind:'step', n:13, icon:'🧾', title:'Looking at the money', subtitle:'Finance ▸ Accounting',
    lead:'This is where you pull the profit & loss and financial statements by month or by quarter, and save them as PDF or Excel.',
    steps:[
      'Press "Finance" then "Accounting".',
      'Choose "Monthly" or "Quarterly".',
      'Choose the month (or quarter).',
      'Choose the statement — Profit & Loss (P&L) and so on.',
      'Press the blue "Generate". The table appears below. Save with "PDF" or "Excel".',
    ],
    remember:[
      'The same group also holds unpaid-renewal alerts, student payment history and teacher payroll.',
      'Read the numbers here. Leave changing them to the person in charge.',
    ],
    tip:'Pull it on the same day each month and keep it — comparing later gets easy.',
    shot:'accounting', mode:'cover' },

  { kind:'step', n:14, icon:'📊', title:'Level test results', subtitle:'Students ▸ Level test',
    lead:'This is where you see the test that decides which class a new student fits.',
    steps:[
      'Press "Students" then "Level test".',
      '"Level test requests" — what students book piles up here live.',
      'Filter with the search box, "All status" and "Newest". There is a "📅 Calendar view" too.',
      'After the test, press "+ Enter result" to type the score in.',
      'Past results sit below in "Results (level · score)".',
    ],
    remember:[
      'Once you handle a row it is filed away as "done".',
      'An empty table means nobody has booked yet, or nothing is loaded.',
    ],
    tip:'Open this screen before a parent meeting — it makes explaining simple.',
    shot:'leveltest', mode:'cover' },

  { kind:'step', n:15, icon:'📚', title:'Getting manuals from the Library', subtitle:'System ▸ Library',
    lead:'Every manual and video lives here — including this guide.',
    steps:[
      'Press "System" then "Library".',
      'There are five rooms — Admin · Teacher · Branch · Agency · Student & Parent.',
      '"🎬 Video manual" has ▶Play · ⬇Save · 💬Copy Link.',
      '"📘 Admin manual" comes as PDF · PPT · Excel.',
      '"📊 Easy Admin Page Guide" is this guide. Korean and English both.',
    ],
    remember:[
      'To share on KakaoTalk use "💬 Copy Link", not the file — the quality stays sharp.',
      'The room that matches your role opens without a password.',
    ],
    tip:'When someone new joins, send them this guide first.',
    shot:'library', mode:'cover' },

  { kind:'step', n:16, icon:'🛡', title:'Staff and permissions', subtitle:'System ▸ Staff & roles',
    lead:'This is where you decide who can see what. HQ only.',
    steps:[
      'Press "System" then "Staff & roles".',
      '"Role permission matrix" — 6 roles × every menu in one table.',
      'Each press of a cell cycles ✅ allow → 👁 read only → ❌ blocked.',
      'It saves as soon as you change it. That person sees it from their next sign-in.',
      'Use "➕ Add HQ staff" to create a new staff account.',
    ],
    remember:[
      'The 6 roles are HQ executive · HQ manager · HQ teacher · master branch · branch · agency.',
      'A new account is really saved. That ID can sign in right away.',
    ],
    tip:'Give only the access someone needs. Adding more later is easier than taking it away.',
    shot:'permissions', mode:'cover' },

  { kind:'step', n:17, icon:'🚪', title:'My info · password · signing out', subtitle:'Press your own name',
    lead:'Press your name and a window opens. My page, change password and sign out are all in it.',
    steps:[
      'Press your name.',
      '"👤 My page" — see and edit your own details.',
      '"🔑 Change password" — change your password.',
      '"📘 Library / manuals" · "🩺 Health check" · "❓ Help".',
      'When you are done, press "🚪 Log out" at the bottom.',
    ],
    remember:[
      'Changing your password signs your other devices out automatically.',
      'On a shared computer, always sign out before you walk away.',
    ],
    tip:'If a screen looks broken, press "🩺 Health check" — it tells you what is wrong.',
    shot:'usermenu', mode:'cover' },

  { kind:'roles', title:'People see different menus', icon:'👥',
    lead:'Same address, different view. What you can see depends on who you are — nothing is broken.',
    rows:[
      ['🏯 HQ executive · manager', 'Sees everything. Only HQ adds staff and sets permissions.'],
      ['🎓 HQ teacher', 'Sees the class and student side. Most money screens stay hidden.'],
      ['🏢 Master branch · branch', 'Sees its own branch and the agencies under it.'],
      ['🏫 Agency (academy)', 'Sees its own academy only.'],
    ],
    notes:[
      'The differences are on purpose. They keep one academy’s data away from another.',
      'If a menu you truly need is missing, tell HQ.',
      'Your own role is shown in small letters next to your name.',
    ] },

  { kind:'whatsnew', title:"What's new", icon:'✨', when:'August 2026',
    items:[
      ['The left menu opens three levels', 'Group ▸ menu ▸ the exact spot. Just keep pressing in.'],
      ['Press again to fold it back', 'All three levels behave the same way.'],
      ['A group was renamed', '"HQ · Branches · Agencies" — the place to look at the organisation.'],
      ['There is a "Menu map" now', 'The whole of Mangoi on one page.'],
      ['Quick access sorts itself', 'What you press most moves to the front.'],
      ['Accounting works by quarter too', 'Three months rolled into one profit & loss.'],
      ['Adding staff really saves', 'The new ID can sign in immediately.'],
      ['Changing a password really changes it', 'Your name ▸ Change password.'],
      ['Wide tables stay inside the screen', 'Screens like "Students" are much easier now.'],
      ['Branches and agencies see only their own', "Other academies' data stays hidden."],
    ] },

  { kind:'faq', title:'Frequently asked questions', icon:'❓',
    qa:[
      ['I pressed a menu and nothing happened.', 'Pressing it again folds it. On a narrow screen press ≡ at the top left first.'],
      ['The menu I want is not there.', 'People see different menus. Ask HQ if you need it.'],
      ['The table is empty.', 'Press "Load" or "Refresh". That is when the data comes in.'],
      ['I want to read it in Korean.', 'Press 🌐 KO at the bottom left. Press EN to go back.'],
      ['I want to change my password.', 'Your name ▸ "🔑 Change password", or "👤 My page".'],
      ["I don't know what to press.", 'Just type what you want into the search box at the top left.'],
      ['The screen looks wrong.', 'Press "🩺 Health" at the bottom left.'],
      ['I want to start over.', 'Press "Menu map" at the very top left.'],
    ] },

  { kind:'checklist', title:'First-day checklist', icon:'✅',
    lead:'Do just these today. Once they are done you can use it on your own.',
    items:[
      'Can you sign in?',
      'Can you see your name at the bottom left?',
      'Did you press a menu group open?',
      'Did you press a menu inside it and reach the numbered spots?',
      'Did you press the same thing again to fold it?',
      'Did you type "payroll" into the search box?',
      'Did you open the "Menu map"?',
      'Did you press "Load" on the student list?',
      'Did you download a manual from the Library?',
      'Did you sign out?',
    ] },

  { kind:'end', title:"You're all set!", icon:'🎉',
    lines:[
      'Only three things to remember.',
      '① On the left, press group ▸ menu ▸ the exact spot',
      '② If you are unsure, just type it into the search box',
      '③ If you get lost, go back through the "Menu map"',
    ],
    foot:'Want more? The Library has manuals and videos. Still stuck? Ask HQ.' },
];
