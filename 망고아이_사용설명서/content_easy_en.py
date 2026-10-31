# -*- coding: utf-8 -*-
"""Easy Admin Page Guide (English) — for staff who are not comfortable with computers."""

SITE = "www.mangoi.co.kr"
ADMIN_SITE = "admin.mangoi.co.kr"

OUT_SUFFIX = "_easy_en"
FILENAMES = {"easy": "Mangoi_Admin_Page_Guide_EN"}

UI = {"section":"One Step at a Time","intro":"Introduction","summary":"Summary · Data",
      "toc":"Contents","toc_title":"📑 Contents","toc_page":"p.","toc_slide":"slide",
      "faqpage":"FAQ · Checklist","howto":"Do this","point":"✅ Just remember this",
      "note":"⚠️ Be careful","tip":"💡 Easier way","faq":"❓ Frequently Asked Questions",
      "data":"📊 Data at a Glance","closing":"You're all set!",
      "closing_sub":"Stuck? Ask the A.i assistant at the bottom right of the screen.",
      "guide_of":"Easy Guide","target":"For","docuse":"How to use this document",
      "sheet_index":"Task Index","sheet_steps":"Step-by-Step","sheet_check":"First-Day Checklist",
      "sheet_faq":"FAQ","sheet_data":"Data & Charts","sheet_cover":"Cover",
      "xls_index_title":"📇 {label} Task Index",
      "xls_index_head":["No.","Icon","Task","How to do it (key steps)","Easier way"],
      "xls_steps_title":"🧭 Do this on the screen","xls_step":"Step","xls_do":"What to do",
      "xls_check_title":"✅ {title}","xls_check_head":["✔","Item","Done"],
      "xls_faq_title":"❓ Frequently Asked Questions","xls_faq_head":["Question (Q)","Answer (A)"],
      "xls_data_title":"📊 Data & Charts","xls_item":"Item","xls_value":"Value",
      "concl_page":"Conclusion","concl_flow":"🔄 Your Day at a Glance","concl_principles":"⭐ Core Principles",
      "concl_remember":"📌 Remember",
      "xls_docuse":("How to use this document\n\n"
                    "• [Task Index] sheet : everything you can do, at a glance\n"
                    "• [Step-by-Step] sheet : follow along with the screen\n"
                    "• [First-Day Checklist] sheet : print it and keep it beside you\n"
                    "• [FAQ] sheet : check here first when stuck\n"
                    "• [Data & Charts] sheet : reference numbers")}

BRAND = {"name":"Mangoi","en":"MANGOI","tagline":"Live 1:1 video English + AI learning",
         "mango":"#FF9F1C","mango_dark":"#E8630A","ink":"#1E2340"}

THEMES = {
    "easy": {"label":"Admin","en":"EASY ADMIN GUIDE","emoji":"💻",
        "primary":"#2563EB","primary2":"#0EA5E9","accent":"#FF9500",
        "soft":"#EFF6FF","chip":"#DBEAFE","grad":("#1D4ED8","#0EA5E9"),
        "who":"Directors and staff using the admin page for the first time"},
}

COVERS = {"easy": ("Easy Admin Page Guide", "Not confident with computers? That's fine — just follow along")}


def sec(icon, title, sub, img, desc, steps, points, note=None, tip=None):
    d = {"icon":icon, "title":title, "sub":sub, "img":img, "desc":desc,
         "steps":steps, "points":points}
    if note: d["note"] = note
    if tip:  d["tip"]  = tip
    return d


SECTIONS = [
sec("🔐","① Getting in (signing in)","Type the address · enter your ID · go","admin_login",
    "The very first thing is **getting into the admin page**. Open your internet browser (Chrome) and type the address. It is not difficult — do it three times and it becomes automatic.",
    ["Open your internet browser (**Chrome**).",
     "Type **admin.mangoi.co.kr** in the address bar at the top and press Enter.",
     "Enter your **ID** and **password**.",
     "Press the **Sign in** button.",
     "If you forgot your password, press **Forgot password**."],
    ["It works best in **Chrome**. Do not use Internet Explorer.",
     "Once you are in, the same computer **will not ask again**.",
     "You only see the screens for **your role** (director, HQ, branch, agency) — nothing to break."],
    "If the computer is shared, always **sign out** when you finish.",
    "Tired of typing the address? Once you are in, press the star (bookmark). Next time it is one click."),

sec("🖥","② What the screen looks like","Top · left · middle — three parts","admin_dashboard",
    "The screen has **exactly three parts**. Know these and you will never get lost. The **top bar** is your profile and settings, the **left column** is the menu, and the **middle** is whatever you are looking at.",
    ["**Top bar** — your name, language (EN) and the admin button are on the right.",
     "**Left column (sidebar)** — the menu, organised into 9 groups.",
     "**Middle** — the content you are currently viewing.",
     "Type a word into the **search box** above the middle to jump straight to a feature.",
     "Lost? Press the **logo at the top left** to return to the start."],
    ["The **number** beside a menu name is how many features it contains.",
     "The **search box** is the fastest route — do not hunt through menus.",
     "On a small screen the left menu collapses into the **≡ button**."],
    None,
    "Not sure what to press? Just type **what you want to do** into the search box — e.g. “attendance”, “payroll”, “notice”."),

sec("🔎","③ Finding what you need, fast","One search box is all it takes","admin_dashboard",
    "It may look like a lot of features, but do not worry. **One word in the search box** takes you straight there. You never have to click through menus one by one.",
    ["Click the **search box** at the top middle.",
     "Type **a single word** — e.g. “attendance”, “refund”, “teacher”.",
     "Click the item you want from the list.",
     "To find an academy, type part of its name into the **academy list search box**.",
     "Prefer to speak? Press the **microphone button** and say it."],
    ["**One word is enough** — no need for full sentences.",
     "**Part of a name** is enough to find it.",
     "Speaking and typing do **exactly the same thing**."],
    None,
    "For screens you check often, memorise two or three letters. That alone opens them instantly."),

sec("📋","④ Viewing evaluations","How the children are doing","admin_report",
    "An **evaluation** is what the teacher writes after a lesson — what the child did well and what comes next. When a parent calls, start here.",
    ["Click **Evaluations** in the left menu.",
     "**Search** by student name or date.",
     "Click an evaluation to **read it**.",
     "If needed, **send it to the parent as a link**."],
    ["An empty evaluation means **the teacher has not written it yet**.",
     "What accumulates here becomes the **monthly report card**.",
     "Most parent questions are answered from this one screen."],
    None,
    "Open this screen while you are on the phone with a parent. The conversation goes far more smoothly."),

sec("📢","⑤ Sending a notice","Do it once and it's easy","admin_noticestudio",
    "**Sending notifications** to parents or teachers is one of the most common admin tasks. Walk through it once and it takes a minute after that.",
    ["Click **Notification Center** in the left menu.",
     "Press **New notice**.",
     "Choose the **recipients** (everyone, a year group, a specific academy).",
     "Write the **subject and message**.",
     "Check it with **Preview**, then press **Send**."],
    ["Always look at the **Preview** before sending.",
     "The narrower the recipient group, the **safer**.",
     "Sent notices are **kept on record** so you can check them later."],
    "‘Send to everyone’ really does go to everyone. The first time, **send a test to yourself**.",
    "Save the wording you use often — after that it is just picking from a list."),

sec("👪","⑥ Finding students and parents","Contacts and lesson status","admin_menu_students",
    "The **Students / Parents** menu lets you find your students and see their contact details and lesson status. Open this first when a consultation call comes in.",
    ["Click **Students / Parents** in the left menu.",
     "**Search** by name or ID.",
     "Click a student to see their **lessons, attendance and payments**.",
     "If the parent's contact number is empty, **add it**."],
    ["**Reports and text messages only go out** if a contact number is registered.",
     "With a number on file, parents can **reset their own password**.",
     "If attendance suddenly drops, it is worth **reaching out first**."],
    "Student records are **personal data**. Do not screenshot them and send them outside the company.",
    "Check the contact number on every consultation call and fill it in on the spot. It pays off later."),

sec("📅","⑦ Sending the parent report","Weekly proof of growth","admin_parent_weekly",
    "This is the **report sent to parents** summarising the child's week — attendance, AI chats, words conquered and pronunciation. It is the strongest tool you have for re-enrolment.",
    ["Click **Parent Weekly Report** in the left menu.",
     "Enter a student ID and check it with **Preview**.",
     "Use **Send to this parent** to test with a single recipient.",
     "Use **Count recipients** to see how many can receive it.",
     "Check **Recent send log** for what actually went out."],
    ["**Only students with a registered phone number** can receive it.",
     "The report contains **only real activity** — no invented numbers.",
     "A **Friday-evening automatic send** is ready and waiting."],
    "🔴 **The full automatic send is OFF by default.** It is a safeguard against accidentally messaging 29,000 people. Turn it on only after management decides.",
    "Send one to yourself or a colleague's number first. Once you are happy with the wording, turning it on is stress-free."),

sec("🏫","⑧ Viewing teachers","Roster · schedule · payroll","admin_teachers",
    "The **Teachers** menu shows the roster, working schedules and payroll. It has been reorganised to be much easier to search.",
    ["Click **Teachers** in the left menu.",
     "Use the **status and group dropdowns** at the top to filter.",
     "Click a teacher to open the **Profile · Payroll · Evaluation** tabs.",
     "Use the **Work / Break / Leave shortcut** to manage schedules.",
     "Scroll the table sideways — the **teacher's name stays pinned**."],
    ["The more teachers you have, the more the **filters** help.",
     "**Managers** are marked with a badge, with employment status alongside.",
     "If a name is blank, the **ID is shown instead**."],
    None,
    "When a teacher says “this feature doesn't exist”, it usually does — they just **could not find the route**. Look for it together first."),

sec("💳","⑨ Payments and refunds","Anything involving money","admin_refund",
    "Tuition payments and refunds live under **Accounting / Points**. The new payment screen now asks **who the lessons are for first**, which makes it far easier for parents to choose.",
    ["Click **Accounting / Points** in the left menu.",
     "Find the record by date or student under **Payment history**.",
     "For a refund, **check the refund policy first**.",
     "Guide parents through the **choose-the-audience-first** flow.",
     "If they want to compare everything, press **See Full Price List**."],
    ["A refund always starts with **checking the policy**.",
     "Prices and products are **unchanged** — only the way you choose got easier.",
     "If a number looks wrong, do not fix it yourself — **ask HQ**."],
    "Payments and refunds move real money. If you are not certain, **ask before you click**.",
    "Note down two or three common refund cases and your consultation time halves."),

sec("📚","⑩ Getting manuals from the Library","Every document in one place","admin_dashboard",
    "The **Library** holds all the manuals and videos for admins, teachers, branches, agencies, students and parents. Just send the right person the right link.",
    ["Click **Library** in the left menu.",
     "Choose the room (admin, teacher, branch, agency, student).",
     "Pick **PDF · PPT · Excel** — it downloads immediately.",
     "For videos use **▶ Play**, or **💬 Copy Link** to share.",
     "On KakaoTalk, send **the link, not the file**."],
    ["Attaching a video **file** to KakaoTalk ruins the quality — **send the link**.",
     "Manuals are **updated** whenever new features ship.",
     "Each room has a password, but **your own role's rooms open automatically**."],
    None,
    "When a new staff member starts, send them the ‘Easy Guide’ link. It saves a lot of explaining."),

sec("🏠","⑪ How our home page looks to visitors","What a new parent sees","student_home",
    "The first screen of our website **changes depending on who is looking**. A first-time parent sees **Book a Free Trial**; a logged-in student sees **Enter Class**.",
    ["Open a **new incognito window** in your browser (Ctrl+Shift+N).",
     "Go to our website address.",
     "Check that the **Book a Free Trial** button is large and prominent.",
     "In promotional messages, just use the **plain website address**."],
    ["**No separate marketing page is needed** — the same address adapts.",
     "You can check what a parent sees at any time with an **incognito window**.",
     "When logged in, it shows the **countdown to the next class**."],
    None,
    "Open the incognito home page before a consultation. You and the parent can then look at the same screen."),

sec("🚪","⑫ Finishing safely","Sign out + where to ask","admin_login",
    "Finish by **signing out**. Then all you need to know is where to ask when you get stuck — and you are ready.",
    ["Click **your name** at the top right.",
     "Press **Sign out**.",
     "On a shared computer, **close the browser window too**.",
     "Stuck? Ask the **A.i assistant** at the bottom right.",
     "Still stuck? Message the **KakaoTalk channel** (10:00–23:00)."],
    ["Signing out is **the habit that protects personal data**.",
     "If the screen looks wrong, try **refresh (Ctrl+F5)** first.",
     "For enquiries, **KakaoTalk is fastest**."],
    None,
    "Do not experiment with buttons you do not recognise — ask first. **Payments, refunds and deletions** are especially hard to undo."),
]

for _i, _s in enumerate(SECTIONS, 1):
    _s["no"] = _i


MANUALS = {"easy": {
    "intro": {
        "title": "Who is this guide for?",
        "body": ("It is fine if you are not confident with computers. This guide picks only the things you will "
                 "use most often and walks you through them **one step at a time**, with the screen in front of you.\n\n"
                 "You do not need to memorise any of it. **Stuck? Use the search box.** Still stuck? **Ask the A.i assistant.** "
                 "Those two things are enough."),
        "points": [("🔐","Getting in","Type the address, enter your ID — that's it."),
                   ("🖥","Screen layout","Only three parts: top, left, middle."),
                   ("🔎","Search box","Don't hunt menus — search one word."),
                   ("📢","Sending a notice","Do it once and it takes a minute after that."),
                   ("📅","Parent report","Weekly proof of growth, sent for you."),
                   ("🚪","Finishing safely","Always sign out when you're done.")],
    },
    "sections": SECTIONS,
    "feature_table": {
        "title": "🧰 What you can do on day one",
        "head": ["Task","Where","What it does","Time"],
        "rows": [
            ["Sign in","admin.mangoi.co.kr","Enter your ID and password","1 min"],
            ["Learn the screen","Home screen","Identify top, left and middle","3 min"],
            ["Find a feature","Search box","Open any feature with one word","10 sec"],
            ["View evaluations","Evaluations","Check a student's lesson records","2 min"],
            ["Send a notice","Notification Center","Choose recipients, preview, send","5 min"],
            ["Find a student","Students / Parents","Search by name, check contact","1 min"],
            ["Weekly report","Parent Weekly Report","Preview and test-send","5 min"],
            ["View teachers","Teachers","Filter the roster","2 min"],
            ["Check payments","Accounting / Points","Review payments and refunds","3 min"],
            ["Get manuals","Library","Download PDF, PPT and videos","1 min"],
            ["Sign out","Your name, top right","Finish safely","5 sec"],
        ],
    },
    "charts": {
        "first": {"title":"Your first day (minutes)","labels":["Sign in","Learn screen","Practise search","Test notice"],
                  "values":[1,3,2,5],"colors":["#2563EB","#0EA5E9","#00B85C","#FF9500"]},
        "often": {"title":"Menus you'll use most","labels":["Students/Parents","Evaluations","Notifications","Accounting"],
                  "values":[9,7,6,4],"colors":["#2563EB","#0EA5E9","#00B85C","#FF9500"]},
        "help":  {"title":"When you're stuck — in order","labels":["Search box","A.i assistant","KakaoTalk"],
                  "values":[3,2,1],"colors":["#2563EB","#0EA5E9","#FF9500"]},
    },
    "faq": [
        ("Where exactly do I type the address?","In the **long bar at the very top** of your Chrome window — the address bar, not a search box. Type `admin.mangoi.co.kr` and press Enter. Once you are in, press the star to bookmark it and it is one click from then on."),
        ("I forgot my password.","Press **Forgot password** on the sign-in screen. A 6-digit code is sent by text to your registered phone number. If it says no number is registered, contact HQ or the KakaoTalk channel."),
        ("There are too many menus — I can't find anything.","Do not click through the menus. Type **one word into the search box** at the top middle — “attendance”, “refund”, “notice”. It takes you straight there."),
        ("The screen looks broken.","First press **Ctrl and F5 together** (a hard refresh). That fixes it most of the time. If it still looks wrong, take a screenshot and send it to us."),
        ("What happens if I click the wrong thing?","Most buttons ask for confirmation before anything is saved. However **payments, refunds and deletions** are hard to undo, so ask before clicking if you are unsure."),
        ("I sent a notice by mistake.","A notification that has gone out cannot be recalled. That is why we recommend **sending a test to yourself first**. The send record stays in the Notification Center."),
        ("Can I turn on the parent report?","The full automatic send is **off by default** — a safeguard against accidentally messaging 29,000 people. Use preview and a single test send only; turning it on is a management decision."),
        ("Where should I ask for help?","Ask the **A.i assistant** at the bottom right of the screen first. If that does not solve it, the **KakaoTalk channel** (10:00–23:00, closed weekends and holidays) is fastest."),
    ],
    "checklist": {
        "title": "First-Day Checklist",
        "items": [
            "Did you reach admin.mangoi.co.kr in Chrome?",
            "Did you bookmark it with the star?",
            "Did you identify the three parts of the screen?",
            "Did you open a feature using the search box?",
            "Did you look at a student record in Evaluations?",
            "Did you send a test notice to yourself?",
            "Did you check that one student has a contact number?",
            "Did you download a manual from the Library?",
            "Did you view the home page in an incognito window?",
            "Did you sign out when you finished?",
        ],
    },
    "conclusion": {
        "title": "You're all set!",
        "lead": ("If you have followed this far, you can already do almost everything you need on the admin page. "
                 "You do not have to memorise it — just remember **the search box** and **the A.i assistant**."),
        "flow": [
            ("Morning", "Sign in → check today's lessons and attendance on the home screen"),
            ("Late morning", "Review evaluations and student questions; call parents if needed"),
            ("Afternoon", "Send notices; check payments and refunds"),
            ("Weekly", "Preview the parent weekly report; review the teacher roster"),
            ("End of day", "Sign out (and close the window on a shared computer)"),
        ],
        "principles": [
            "**Stuck? Use the search box** — do not click through menus.",
            "**Ask before you act** — especially payments, refunds and deletions.",
            "**Preview before sending** — notifications cannot be recalled.",
            "**Fill in contact numbers** — that is where reports and texts go.",
            "**Sign out when done** — it is the habit that protects personal data.",
        ],
        "remember": [
            "Address: **admin.mangoi.co.kr** · Browser: **Chrome**.",
            "Screen looks wrong? **Ctrl + F5**.",
            "Full automatic send is **off by default** — management decides.",
            "**KakaoTalk is the fastest** way to reach us (10:00–23:00).",
            "Student records are **personal data** — never send them outside.",
        ],
        "closing": ("It feels unfamiliar at first, but after three days it is second nature. "
                    "Ask whenever you are unsure — asking is always the fastest route. "
                    "Thank you for your work today! 🥭"),
    },
}}
