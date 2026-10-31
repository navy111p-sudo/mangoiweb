# -*- coding: utf-8 -*-
"""English manuals (STUDENT/ADMIN/TEACHER) — imported by content_en.py."""
from content_en import SITE, ADMIN_SITE, build_classroom

STUDENT = {
    "intro": {
        "title": "What is Mangoi?",
        "body": "Mangoi brings together live 1:1 video English lessons with a native-speaker teacher and "
                "AI learning & games you can do on your own before and after class. Connect right from your "
                "web browser (Chrome/Edge) on a phone, tablet or PC — no app install needed. Just follow this "
                "guide and even first-timers can use it easily on their own.",
        "points": [
            ("📹","1:1 native video lessons","Meet your teacher face-to-face and talk in English at set times."),
            ("🔥","AI warm-up · pronunciation coach","Warm up before class and get instant pronunciation fixes."),
            ("🎮","10 learning games","Review today's words and sentences through fun games."),
            ("🏅","Points · badges · streak","The more you study, the more points and badges you collect."),
        ],
    },
    "sections": [
        {"icon":"🚀","title":"Getting Started & Home","sub":"Access · login · screen layout","img":"student_home",
         "desc":"Mangoi opens right away when you type the address in Chrome or Edge. After you log in, a space-themed home screen appears, and from here you move to lessons, games and learning menus.",
         "steps":[
            "Go to **" + SITE + "** in your browser and **log in** (social login works too).",
            "Check your **name and points (P)** at the top-right to confirm you're logged in.",
            "Tap the **'Open' tab** on the left to expand the menu sidebar.",
            "Ask the **A.i assistant** at the bottom-right anything you're curious about.",
            "Use the **EN button** to switch the on-screen text to English."],
         "points":[
            "No app install — a web browser is all you need.",
            "'Add Mangoi app' at the bottom of home creates a home-screen icon.",
            "Study on phone, tablet or PC with the same account, anywhere."],
         "tip":"Turn on auto-login only on your own trusted device so you don't type it every time."},

        {"icon":"🎥","title":"Enter a Video Lesson","sub":"Meet your teacher 1:1 (30 seconds!)","img":"class_room",
         "desc":"When it's lesson time, join the classroom and study face-to-face with your native teacher. It feels new at first, but just follow the steps and you'll be in quickly.",
         "steps":[
            "Tap the **invite link** you received, or the **today's lesson card** on the site.",
            "Enter your **name** (the room code is usually filled in; if empty, you go to the shared room).",
            "Press the **Enter** button.",
            "When the browser asks, press **'Allow'** for camera and mic — that connects your face and voice.",
            "When you see your teacher, say hello and start the lesson!"],
         "points":[
            "It works best opened in Chrome or Edge.",
            "Opening the link inside KakaoTalk may block the camera → choose 'open in another browser'.",
            "A headset makes the sound clearer and cuts noise."],
         "note":"If sound/video won't work, refresh the page and 'Allow' camera and mic again.",
         "tip":"Enter 5 minutes early to check your face and sound — it puts you at ease."},

        *build_classroom("student"),

        {"icon":"🙋","title":"How to Join In During Class","sub":"Speak, ask, write together","img":"class_video",
         "desc":"A video lesson isn't a lesson you just watch — it's one you do together. Don't only listen; the more you join in with the ways below, the faster your English grows.",
         "steps":[
            "When the teacher asks, turn on your 🎤 **mic and answer out loud**. (turn it on only when speaking to cut noise)",
            "If you can't hear or you're curious, **ask in 💬 chat**. Check unknown words in text too.",
            "🖊 **Write on the board together** — with the teacher's OK, use the pen to write or draw answers.",
            "📄 **Turn textbook pages together** and follow the page you're on.",
            "📷 **Keep your camera on** — the teacher helps more when they can see your face."],
         "points":[
            "The more you speak, the better. Mistakes are fine!",
            "Do well and the teacher gives you 🌟 praise points (see earlier page).",
            "Earphones in a quiet place make the sound clear."],
         "tip":"Memorize phrases like 'One more time, please' to make class easier."},

        {"icon":"🏁","title":"After Class — Review & Rating","sub":"Review quiz & rating for +10P","img":"student_reviewquiz",
         "desc":"When class ends, tidy up what you learned right away. A 'Take the review quiz?' popup appears, and leaving a star rating earns you points too.",
         "steps":[
            "When class ends, a **'Take the review quiz? Yes / No'** popup appears.",
            "Press **'Yes'** and a **review quiz matched to today's class** appears automatically.",
            "Leave a **star rating** (How was today's class? 7 stars) to get **+10P**.",
            "Then review today's words once more with a **learning game** to make it perfect."],
         "points":[
            "Reviewing right after class stays in memory longest.",
            "The rating helps your teacher, and you get points too."],
         "note":"You must leave a star rating to exit the class (it's OK to be honest).",
         "tip":"Review quiz → game → vocabulary, in that order, makes today's lesson truly yours."},

        {"icon":"🩺","title":"Pre-class Device Check","sub":"Check camera, mic and internet first","img":"teacher_precheck",
         "desc":"This screen checks your camera, mic, network and lighting before class. A score and traffic-light signals tell you right away whether things are good, preventing drop-outs mid-lesson.",
         "steps":[
            "The check screen tests **camera, mic, network and lighting** all at once.",
            "Read the **overall score** and each item's signal (green/yellow/red).",
            "If red appears, follow the tips to **turn on a light or move seats** and check again."],
         "points":[
            "When your face is well-lit, the teacher can read your expression and help more.",
            "If Wi-Fi is weak, moving closer to the router helps."],
         "tip":"Do the check 5 minutes before class — fixing issues early keeps the lesson smooth."},

        {"icon":"🔥","title":"Warm Up with AI","sub":"A 3-minute warm-up before class","img":"student_warmup",
         "desc":"Before class, an AI friend asks English questions tied to today's textbook. Answering casually loosens you up so the first 5 minutes of class feel much easier.",
         "steps":[
            "Before class, the **AI friend greets you in English** — reply casually.",
            "**Questions linked to today's textbook** appear so you get a feel in advance.",
            "Use the speak/listen buttons to **answer by voice** or type."],
         "points":[
            "Your teacher can see your warm-up, so class flows naturally from it.",
            "Mistakes are fine — it's just a warm-up, so relax!"],
         "tip":"Make the warm-up a habit before every class and you'll start speaking sooner."},

        {"icon":"🎙️","title":"AI Pronunciation Coach","sub":"Fixes your pronunciation instantly","img":"student_speechcoach",
         "desc":"Read a sentence at your level, record it with the mic, and the AI tells you a pronunciation score and what to fix. You can also replay the native audio and correct yourself.",
         "steps":[
            "Pick a **level (Phonics, BTS, SIU, etc.)** to get sentences at your level.",
            "**Read the sentence** on screen and press the red **mic button** to record.",
            "The AI shows your **pronunciation score and what to fix**.",
            "Use 'replay' to hear the **native audio** and practice once more."],
         "points":[
            "Start with short sentences, clearly — your score rises faster.",
            "Repeating sentences from class here makes them stick."],
         "tip":"Five sentences a day and your pronunciation noticeably improves."},

        {"icon":"📈","title":"Take a Level Test","sub":"Find out your English level","img":"student_leveltest",
         "desc":"A test that shows your current English level. The result feeds into your curriculum, so you avoid lessons that are too easy or too hard.",
         "steps":[
            "On the **level test request** screen, pick a method (AI/teacher) and a date/time.",
            "Follow the guide and answer the **speaking and listening questions**.",
            "The result is reflected in your **curriculum (my level)**."],
         "points":[
            "We recommend taking it once when you first start.",
            "Retake it periodically to see how much you've improved."],
         "tip":"Relax — the goal is just to know your level accurately."},

        {"icon":"🗺️","title":"My Level · Curriculum","sub":"See how far you've come","img":"student_curriculum",
         "desc":"Levels 1–10 show where you are now and what you'll learn next. As you take lessons and play games, you move up to the next level.",
         "steps":[
            "Check which of **Levels 1–10** you're at now.",
            "Tap a level to see **what you learn and the goals**.",
            "Set a target level and keep challenging yourself."],
         "points":[
            "As levels rise, the sentences get longer and more practical.",
            "Setting a goal with your teacher boosts motivation."],
         "tip":"Knowing your level means games and reviews use the right words for you."},

        {"icon":"🎮","title":"Learning Games Hub","sub":"Review with 10 games","img":"student_games",
         "desc":"The Games menu has 10 games. Today's textbook and level words appear in them, so you review naturally while playing and earn points.",
         "steps":[
            "In **Games**, tap a game card to start right away.",
            "At the top, choose **English/Chinese** and the **game speed**.",
            "Correct answers earn **points** and keep your **learning streak** flame going.",
            "Fill 10 correct answers to see your **result and highlights**."],
         "points":[
            "Game words are linked to what you learned today.",
            "Games marked 'speaking' score better when you say the answer aloud."],
         "tip":"Games are review. When class words appear in a game, they stick longer."},

        {"icon":"⚔️","title":"3D Battle","sub":"Quiz duel with a boss!","img":"student_battle3d",
         "desc":"A boss-battle game where you attack with a 3D character by answering questions. The more you get right, the stronger you get and the more badges you earn.",
         "steps":[
            "Enter the lesson **boss battle** and attack by solving questions.",
            "The more correct answers, the stronger you get and the more **badges** you earn.",
            "Wrong is fine — try again and learn the words."],
         "points":["Turn on sound for extra excitement with sound effects.","Beat the boss for a special badge."],
         "tip":"Too hard? Change the game speed to 'slow'."},

        {"icon":"🚀","title":"Shooting · Mastery Games","sub":"Shoot and fish while speaking","img":"student_mastery",
         "desc":"Shoot words in space (Shooting + Speaking) or build target sentences by hunting and fishing words (Mastery). Pick a difficulty and speed to suit you.",
         "steps":[
            "**Shooting + Speaking**: shoot words in order to complete a sentence.",
            "**Mastery (word hunt / sentence fishing)**: build the target sentence while speaking.",
            "Change **difficulty and speed** to pick your challenge."],
         "points":["Speaking games score better when you say answers aloud.","Reading the target sentence loudly helps memory."],
         "tip":"Start at 'easy/normal' and raise it as you get comfortable."},

        {"icon":"🧟","title":"Word Fighter (zombies)","sub":"Beat zombies with words","img":"student_wordfighter",
         "desc":"An action game where you fend off oncoming zombies with words and sentences. It trains you to recall words quickly under pressure.",
         "steps":[
            "Type or speak **to match the word/sentence** on screen to stop zombies.",
            "The faster you answer, the higher your **score and combo**.",
            "Get as many right as you can before you run out of lives."],
         "points":["Great for quick-reaction practice.","Don't skip unknown words — check their meaning."],
         "tip":"Nervous? Breathe — accuracy matters more than speed."},

        {"icon":"🕵️","title":"Suspect Mystery","sub":"Listening & speaking through story","img":"student_suspect",
         "desc":"A mystery game where you listen to the teacher's (AI) English hints, find the culprit, and explain in English. You practice listening and speaking at the same time inside a story.",
         "steps":[
            "Press '**Start Class**' to begin the case.",
            "**Listen to the English hints** and gather clues.",
            "Pick the culprit and **explain your reason in English**."],
         "points":["Improves listening focus.","Practices giving reasons in English."],
         "tip":"Missed a hint? Use replay to check it."},

        {"icon":"🗣️","title":"Speaking Quiz","sub":"Listen and repeat","img":"student_speaking",
         "desc":"A quiz where you listen to a sentence and repeat it to check pronunciation and sentences. A great way to review today's lesson out loud.",
         "steps":[
            "Press '**Start**' to get questions.",
            "**Listen and repeat** each sentence.",
            "Fill 10 correct answers to see your **result and pronunciation feedback**."],
         "points":["The more you speak aloud, the more you improve.","A quiet place helps recognition."],
         "tip":"Doing it right after class doubles what you remember."},

        {"icon":"✅","title":"Review Quiz","sub":"A quick check of the lesson","img":"student_reviewquiz",
         "desc":"After class, a short quiz checks today's content. It tells you what you did well and what to review more.",
         "steps":[
            "Take the **review quiz** that pops up after class.",
            "Recheck wrong questions with the **explanation**.",
            "Note the **words to review more** from your result."],
         "points":["It's short, so you can do it every time without pressure.","Wrong words link to the vocabulary book and games."],
         "tip":"Review quiz → game, in that order, is perfect."},

        {"icon":"📚","title":"My Vocab","sub":"Memorize with word cards","img":"student_vocab",
         "desc":"Your own vocabulary book to memorize collected words as cards. Check meanings and pronunciation and review even on the go.",
         "steps":[
            "Flip through **your word cards** in the vocabulary book.",
            "Check the **meaning and pronunciation** on each card.",
            "Split known and unknown words and repeat."],
         "points":["Words from games and lessons collect here.","Perfect for spare moments on the go."],
         "tip":"Just 10 words a day is 300 words in a month."},

        {"icon":"🤖","title":"AI Friend (Mango)","sub":"Free English chat","img":"student_aifriend",
         "desc":"Chat freely in English with your AI friend Mango to practice conversation. Mistakes aren't embarrassing, so you can speak as much as you like.",
         "steps":[
            "Open the **AI friend** screen.",
            "**Type or say** what you want in English.",
            "Read Mango's reply and **keep the conversation going naturally**."],
         "points":["Mistakes are fine — practice freely!","Great for chatting in English when bored."],
         "tip":"Learn by asking things like 'What is …?'"},

        {"icon":"✍️","title":"AI Writing","sub":"Make your sentences natural","img":"student_aiwrite",
         "desc":"Enter a sentence you want to write and the AI rewrites it into natural English. Learn why it changes and build your writing skills.",
         "steps":[
            "**Type the sentence** you want to write.",
            "Press the **AI Writing** button.",
            "Check the corrected sentence and the **reason**, then copy it."],
         "points":["Great for diary and self-introduction practice.","Memorizing the fixes speeds up your growth."],
         "tip":"Read the corrected sentence aloud — it helps speaking too."},

        {"icon":"🔥","title":"Attendance Streak · Badges","sub":"Consistency is skill!","img":"student_streak",
         "desc":"Study every day to keep the flame (streak) going, and meet conditions to auto-collect 10 kinds of badges. Consistency adds up to real skill.",
         "steps":[
            "Do '**today's study**' every day to keep the flame going.",
            "Skip a day and the flame goes out — so **do a little every day**.",
            "Meet the conditions and **receive badges** automatically."],
         "points":["Doing a little every day matters most.","Collecting badges builds the habit for fun."],
         "tip":"Just pressing 'today's study' keeps your streak alive."},

        {"icon":"🧭","title":"MBTI Style Test","sub":"Know your learning style","img":"student_mbti",
         "desc":"A short quiz to learn your learning style. It helps you find study methods that suit you.",
         "steps":[
            "**Answer the questions** casually.",
            "See **your style and study tips** in the result.",
            "Apply the recommended methods to lessons and games."],
         "points":["Enjoy it and get to know yourself.","Pick games that fit your style, too."],
         "tip":"Share the result with your teacher for tailored coaching."},

        {"icon":"📅","title":"Book a Lesson","sub":"Set your own schedule","img":"common_booking",
         "desc":"A screen to book by choosing lesson type (1:1/group), date and time on a calendar. Once booked, your remaining count and next lesson are organized automatically.",
         "steps":[
            "Pick the **lesson type (1:1/group)**.",
            "Select the **date and time** on the calendar.",
            "Set the weekly count and move to **payment/confirm**."],
         "points":["Available times are color-coded for easy picking.","You can also choose by teacher."],
         "tip":"Popular slots fill fast — book early."},

        {"icon":"🔄","title":"Postpone · Change a Lesson","sub":"When something comes up","img":"common_postpone",
         "desc":"A screen to push a lesson to later or change its time when something comes up. The changed schedule is announced automatically.",
         "steps":[
            "Choose **Postpone / Change**.",
            "Set the **date and time** to move to.",
            "Confirm and your **lesson count stays preserved**."],
         "points":["Requesting early makes it easier to get the time you want.","Postponing never removes your lesson count."],
         "note":"Postponing right before a lesson may not be possible (check the postpone/refund policy).",
         "tip":"If your plans might change, request at least a day ahead."},

        {"icon":"👨‍👩‍👧","title":"[Parents] See Your Child's Learning","sub":"Just a student ID","img":"admin_parent",
         "desc":"Parents can see how well their child is doing on one screen in 'My Page' just by entering the child's student ID. No app install — check it right from the web.",
         "steps":[
            "Open **My Page (the parent screen)**.",
            "Enter the **child's student ID** and press **Look up**. (it's saved after one look-up)",
            "Check the **30-day attendance grid** for when they had class, and **point flow** for accrual/use.",
            "See the **learning report** (teacher's latest reviews), **AI voice-coaching progress** and **badge shelf**.",
            "Wrap up the month with **AI study recommendations** and the **monthly report** (print/PDF)."],
         "points":[
            "Attendance, reviews, points and coaching progress are all on one screen.",
            "The monthly report can be printed or saved as PDF.",
            "If you don't know the student ID, ask the teacher/academy."],
         "note":"Manage the student ID like a password — anyone with it can view.",
         "tip":"Reading the review together the day after class and praising your child boosts their motivation a lot."},

        {"icon":"💳","title":"[Parents] Payment · Postpone · Refund","sub":"Tuition and schedule","img":"common_booking",
         "desc":"Tuition payment, postponing/changing a lesson when something comes up, and the refund policy — useful things for parents to know. It's all handled on the web and auto-calculated by policy.",
         "steps":[
            "**Book/Pay**: choose the lesson type (1:1/group) and count, then pay.",
            "**Postpone/Change**: if something comes up, request in advance to move it later. (lesson count is preserved)",
            "**Refund**: auto-calculated per the refund table (100% before the lesson starts, etc.).",
            "Questions? Contact **support** (phone, email, Kakao)."],
         "points":[
            "The earlier you request a postpone, the easier to get the time you want.",
            "Refunds on discounted lessons are recalculated at list price.",
            "Overdue/payment notices can arrive via alert-talk/SMS."],
         "note":"Lessons missed without postponing may be marked absent. Check the policy in advance.",
         "tip":"Checking the postpone/refund policy at signup avoids confusion later."},
    ],
    "feature_table": {
        "title": "Student Features at a Glance",
        "head": ["Menu","What it does","When to use","What you gain"],
        "rows": [
            ["Video lesson","1:1 native lesson","At set lesson times","Speaking skill ↑"],
            ["Class toolbar","Video·materials·board·chat","During class","Tool mastery"],
            ["AI warm-up","Pre-class warm-up","5 min before class","An easy start"],
            ["AI voice coach","Record & fix pronunciation","Daily self-study","Accurate sounds"],
            ["Games","Review by playing","After class","Points·memory"],
            ["Vocabulary","Memorize word cards","On the go","Vocabulary ↑"],
            ["AI friend","Free English chat","When bored","Speaking confidence"],
            ["Streak","Daily study flame","Every day","Badges·habit"],
            ["Level test","Assess your level","Start & periodically","Tailored lessons"],
        ],
    },
    "charts": {
        "routine": {"title":"Recommended Daily Routine (min)","labels":["AI warm-up","Video lesson","Review games","Vocabulary","AI friend"],
                    "values":[3,25,10,7,5],"colors":["#F59E0B","#7C3AED","#4F46E5","#0EA5E9","#10B981"]},
        "games":   {"title":"Skills Each Game Practices","labels":["Speaking","Listening","Words","Sentences"],
                    "values":[9,7,10,8],"colors":["#7C3AED","#0EA5E9","#F59E0B","#10B981"]},
        "growth":  {"title":"Keep it up and… (example points)","labels":["W1","W2","W3","W4","W6","W8"],
                    "values":[20,45,80,130,210,320],"colors":["#7C3AED"]},
    },
    "faq": [
        ("What do I use to connect?","Phone, tablet and PC all work. We recommend Chrome or Edge. No app install needed."),
        ("How do I enter a lesson?","Tap the invite link or lesson card, enter your name, press 'Enter', then 'Allow' camera and mic."),
        ("No sound or video.","Check that you pressed 'Allow' for camera/mic, and reopen in Chrome/Edge. Inside KakaoTalk, choose 'open in another browser'."),
        ("How do I see the textbook in class?","Press the 'Materials' tab at the top to see what the teacher uploaded. Switch board/chat with tabs too."),
        ("What are points for?","Use points earned from studying and games to get rewards in the shop, roulette, etc."),
        ("English feels hard.","The AI friend and voice coach are fine with mistakes. A level test matches your level so it gets easier."),
    ],
    "checklist": {
        "title": "Pre-class Checklist",
        "items": [
            "Did you connect with Chrome/Edge?",
            "Did you 'Allow' the camera and mic?",
            "Is your face well-lit and visible?",
            "Did you connect earphones (a headset)?",
            "Did you warm up with the AI before class?",
            "Are your textbook and pen ready?",
            "Did you enter 5 minutes before class?",
        ],
    },
    "conclusion": {
        "title": "Conclusion · Your Mangoi Routine — Easy on Your Own!",
        "lead": "Now you know how to use Mangoi! Finally, here's one page on how to study through the day and the "
                "habits that make you improve fast. Keep just this page in mind and you can study on your own with ease.",
        "flow": [
            ("Before class (5–10 min)", "My Page → 🎥 Pre-check camera/mic, warm up with the 🔥 AI warm-up"),
            ("Enter class", "🎥 Enter Class button → type your name → 'Allow' camera and mic"),
            ("During class", "🎤 Answer with your mic · 💬 ask in chat · 🖊 write on the board together · 🌟 earn praise points"),
            ("After class", "🧠 Review quiz 'Yes' → ⭐ star rating (+10P) → 🎮 review today's words with a game"),
            ("A little every day", "🔥 Keep your attendance flame · 📚 vocabulary · 🤖 AI friend · 🎙️ voice-coach pronunciation"),
        ],
        "principles": [
            "**A little every day** — even short, daily practice keeps your attendance flame alive.",
            "**Speak a lot** — mistakes are fine! The more you say aloud, the faster you grow.",
            "**Review right after class** — a quiz/game right away doubles what you remember.",
            "**Have fun with games** — today's words appear in games, so you review while playing.",
            "**Check what you don't know** — don't skip unknown words; check meaning and pronunciation.",
        ],
        "remember": [
            "Connect in **Chrome/Edge** and be sure to 'Allow' **camera·mic** (inside KakaoTalk, open another browser)",
            "**Points** build from study, games and in-class 🌟 praise — spend them in the **shop/roulette**",
            "If English is hard, the **AI friend/voice-coach are fine with mistakes**; use the **level test** to match your level",
            "Study rhythm: **'Warm-up → Class → Praise → Review'**!",
        ],
        "closing": "The friend who keeps at it a little every day ends up best at English. Don't fear mistakes — speak "
                   "all you want. Your Mangoi friends are always cheering for you. You've got this today too! 🍊",
    },
}

ADMIN = {
    "intro": {
        "title": "What is the Admin Page?",
        "body": "The admin page gathers everything you need to run an academy — students, teachers, payments, "
                "parents and content — on one screen. In particular, the AI Operations Assistant looks things up "
                "and even handles tasks when you tell it by voice or text, making operations much faster. Menus and "
                "data scope adjust automatically based on your role (permissions).",
        "points": [
            ("🤖","AI Ops Assistant","Tell it by voice/text; it finds and handles it."),
            ("🔎","Feature search · card menus","Type part of a name to jump right there."),
            ("🧲","Retention Center","Churn risk · contagion · settlement · coaching hub."),
            ("🌳","Org settlement","HQ → branch → agency auto-settlement."),
        ],
    },
    "sections": [
        {"icon":"🔐","title":"Admin Login & Permissions","sub":"Data scope by role, automatically","img":"admin_login",
         "desc":"Logging in with an admin account shows only the menus and data that match your role (director, HQ, staff, etc.). Social login and password reset are supported.",
         "steps":[
            "Log in with **ID and password** (Kakao, Naver, Google also work).",
            "Forgot your password? Reset via **'Find password'** (SMS/email/Kakao).",
            "**Visible menus and data scope** change automatically by role.",
            "New here? Preview with **'View demo account'**."],
         "points":[
            "Permission settings let you split access per staff member.",
            "Turn on 'Save ID' only on your own trusted PC."],
         "tip":"On shared PCs, turn off auto-login and always log out when done."},

        {"icon":"🏠","title":"Dashboard & Feature Search","sub":"Every feature as a card","img":"admin_dashboard",
         "desc":"After login, categories (Teachers, Accounting, Students, Content, System) are organized as cards. Just type a word in the top search box to jump straight to a feature.",
         "steps":[
            "From the category cards (Teachers·Accounting·Students·Content·System), tap the feature you want.",
            "Type a word in the **feature search box** to jump right there.",
            "The **number** beside each category is how many features it holds.",
            "Use **Self-check · Color/Bright · EN** at the top to change screen and language."],
         "points":[
            "If you can't find a feature, search is fastest.",
            "You can also tell the AI assistant 'open ○○' to jump there."],
         "tip":"Remember search terms for features you use often to cut clicks."},

        {"icon":"🤖","title":"AI Operations Assistant","sub":"Tell it by voice/text; it acts","img":"admin_dashboard",
         "desc":"Speak or type into the search/mic and the AI looks up numbers or opens screens. Important actions are confirmed first, and it only does what your permissions allow — so it's safe.",
         "steps":[
            "Speak or type into the center **search/mic**. e.g. 'How's today's revenue?'",
            "The AI **looks up numbers** or **opens a screen**. e.g. 'Open student management.'",
            "Important actions are **confirmed with 'Shall I?' first**. e.g. 'Push Jung Woo-young's next lesson by 1 hour.'",
            "The assistant only executes **tasks you have permission for**."],
         "points":[
            "Can't find a button? Just say 'show me ○○'.",
            "Voice and text both work the same."],
         "tip":"When busy, telling it by voice is much faster than clicking."},

        {"icon":"🎥","title":"Understand Lesson Entry","sub":"To support students & teachers","img":"class_room",
         "desc":"Even without teaching, admins should know how students and teachers enter so you can answer questions and fix problems. Entry uses a name and a room code (or the shared room).",
         "steps":[
            "On the entry screen, enter a **name** and **room code**, then press **Enter**.",
            "If the room code is empty, you go to the **shared lesson room**.",
            "Advise that the browser's **camera/mic permission** is required.",
            "For trouble, first advise **reconnecting in Chrome/Edge**."],
         "points":[
            "KakaoTalk's in-app browser blocks the camera — 'open in an external browser' is needed.",
            "Lessons needing room/token management can be checked from the admin screen."],
         "note":"Most 'can't enter' tickets are browser permission issues — check permissions and browser first.",
         "tip":"Turn frequent entry questions into an FAQ to cut support load."},

        *build_classroom("admin"),

        {"icon":"👩‍🏫","title":"Teacher Management","sub":"Payroll · matching · reviews · MBTI","img":"admin_menu_students",
         "desc":"Manage the teacher list, profiles, payroll, matching and reviews in one place. Gather star ratings students leave, by teacher, to use in coaching.",
         "steps":[
            "In **Teachers**, check the teacher list, profiles and matching.",
            "Manage **payroll**, **MBTI/style** and student↔teacher **matching**.",
            "Gather each teacher's **lesson reviews (stars)**."],
         "points":["Better matching raises re-enrollment.","Link low-rated teachers to the coaching tab."],
         "tip":"Assign top teachers to popular slots first to boost satisfaction."},

        {"icon":"💳","title":"Accounting · Points","sub":"Payments · overdue · points · gifts","img":"admin_refund",
         "desc":"Manage payments, overdue balances and refunds, plus point/gift accrual and use. Amounts are auto-calculated by policy to reduce mistakes.",
         "steps":[
            "In **Accounting/Points**, process payments, overdue balances and refunds.",
            "Check **point/gift** accrual and usage history.",
            "Notify overdue items via **alert-talk/SMS**."],
         "points":["Manage recurring payments and overdue on one screen.","Points drive learning motivation."],
         "tip":"Automating overdue alerts raises collection rates."},

        {"icon":"🎁","title":"Points & Reward Policy","sub":"Praise points → shop → gifts","img":"admin_refund",
         "desc":"The 🌟 praise points a student gets during class and the star rating (+10P) all accrue to the student's total points, leading to point-shop, roulette and gift rewards. Admins manage this accrual/usage flow and the reward line-up.",
         "steps":[
            "**Check accrual paths**: points build from in-class teacher praise (+1P), end-of-class rating (+10P), game learning, etc.",
            "In **Accounting/Points**, check each student's **accrual/usage history**.",
            "Manage the **point-shop / roulette rewards** and **gift** line-up.",
            "If abnormal accrual/errors are suspected, look up the history and adjust."],
         "points":[
            "Instant rewards (praise points) boost participation and re-enrollment.",
            "Shaping rewards lets you tune motivation and cost together.",
            "Points are summed into the student's top-bar P and My Page."],
         "note":"Teachers give praise points; admins configure the shop/reward/gift policy.",
         "tip":"Setting stock/limits on popular rewards keeps costs stable."},

        {"icon":"↩️","title":"Refund Policy & Processing","sub":"Auto-calculated by the table","img":"admin_refund",
         "desc":"Amounts are auto-calculated per the refund table (100% before the lesson starts, tiered by progress). Discounted payments are recalculated at the list price.",
         "steps":[
            "Check the refund request timing and **calculate by the table**.",
            "For **discounted payments**, apply the list-price recalculation rule.",
            "Check the **absence rule** for lessons missed without postponing."],
         "points":["The table reduces disputes.","Explain the policy to parents before processing."],
         "note":"For discounted lessons, already-taken lessons are deducted at list price, then the balance is refunded.",
         "tip":"Explaining refund/postpone policies at signup greatly reduces conflict."},

        {"icon":"🧑‍🎓","title":"Student · Parent Management","sub":"Real-data roster · attendance · grades","img":"admin_menu_students",
         "desc":"Manage the enrolled roster, attendance and grades. The student list is linked to real member data, and you can see each student's history at a glance.",
         "steps":[
            "In **Students/Parents**, check the enrolled roster.",
            "View **attendance/reviews/points/chat history** by student.",
            "Flag students who need counseling/management."],
         "points":["The student list is linked to real members.","At-risk students link to the Retention Center."],
         "tip":"Counsel frequently-absent students quickly to prevent churn."},

        {"icon":"👨‍👩‍👧","title":"Parent My-Page","sub":"View learning with just a student ID","img":"admin_parent",
         "desc":"Parents can see attendance, reviews, payments and AI-recommended study on one screen just by entering their child's student ID. It reduces support questions and raises satisfaction.",
         "steps":[
            "Share the **my-page link** with parents.",
            "The parent enters the **child's student ID** and looks it up.",
            "They see 30-day attendance, points, payments, reviews and the monthly report."],
         "points":["Easy access with just the student ID.","The monthly report can be printed or saved as PDF."],
         "note":"Advise parents to manage the student ID like a password.",
         "tip":"Explaining my-page at signup reduces questions."},

        {"icon":"📅","title":"Booking Management","sub":"Schedule assignment","img":"common_booking",
         "desc":"A booking screen to assign lesson type, teacher, date and time. You can review and adjust students' booking status.",
         "steps":[
            "In **Booking**, assign lesson type, teacher and time.",
            "Check empty slots and overlaps and adjust.",
            "Once confirmed, students and teachers are notified."],
         "points":["Spread popular slots to balance teacher load.","Recurring bookings can be set."],
         "tip":"Pre-register each teacher's available times to speed up assignment."},

        {"icon":"🔄","title":"Postpone Management","sub":"Review & process requests","img":"common_postpone",
         "desc":"Review students' postpone/change requests and process them per policy. Last-minute requests outside policy link to the absence/deduction rule.",
         "steps":[
            "Check students' **postpone/change requests**.",
            "If within policy (advance notice), **adjust the schedule**.",
            "Changes are **auto-announced to both sides**."],
         "points":["Clearly announce the postpone cutoff.","Guide out-of-policy requests per policy."],
         "tip":"Enforcing the postpone cutoff reduces no-show losses."},

        {"icon":"📚","title":"Content · Curriculum","sub":"Levels · textbooks · game reports","img":"admin_curriculum",
         "desc":"Manage the Levels 1–10 curriculum, textbook status and game learning reports (weak words). Improve content based on learning data.",
         "steps":[
            "Check the **Levels 1–10 curriculum** structure.",
            "Review textbook upload status.",
            "Find weak words in the **game learning report**."],
         "points":["Surface weak words more in games/reviews.","Clear level goals raise achievement."],
         "tip":"Reviewing the curriculum at the start of the year makes it easy."},

        {"icon":"🧲","title":"Retention Center","sub":"Churn risk · contagion · settlement · coaching","img":"admin_dashboard",
         "desc":"A hub to find students likely to quit early and to prevent chain churn spread through family, joint lessons and referrals. Manage four tabs in one place.",
         "steps":[
            "Find at-risk students with the **churn-risk graph**.",
            "Prevent chain churn with the **churn contagion network**.",
            "Deliver review-based feedback in the **teacher coaching** tab.",
            "Intervene on at-risk students with **alert-talk/counseling**."],
         "points":["Intervening early raises retention.","Manage family/referral relationships together."],
         "tip":"Just caring for the top at-risk students weekly noticeably cuts churn."},

        {"icon":"🌳","title":"Org Settlement · Monthly Report","sub":"HQ → branch → agency","img":"admin_monthlyreport",
         "desc":"Revenue and commissions auto-settle down the org tree, and the monthly report shows branch/agency performance. AI insights summarize the state.",
         "steps":[
            "Revenue/commissions **auto-settle** down the **org tree**.",
            "Check branch/agency performance with the **monthly report**.",
            "Watch **today's revenue, enrollment and attendance** daily on the dashboard."],
         "points":["Distributing the settlement report early builds partner trust.","A 5-minute daily check of the metrics is recommended."],
         "tip":"The sooner you catch warning signs (revenue drop, attendance dip), the easier to respond."},

        {"icon":"🎧","title":"Support · FAQ Operations","sub":"Inquiries · refunds · postpone","img":"common_contact",
         "desc":"Guide phone, email, Kakao and remote-support channels, and organize frequent questions into an FAQ to reduce inquiries.",
         "steps":[
            "In **Support**, guide channels and hours.",
            "Share **refund/postpone policies** with students/parents.",
            "Add repeat questions to the **FAQ**."],
         "points":["Growing the FAQ cuts support load.","Help directly with remote support for hard issues."],
         "tip":"Turn repeat questions like 'can't enter' into an FAQ with screenshots."},
    ],
    "feature_table": {
        "title": "Admin Feature Categories",
        "head": ["Category","Key features","Count (ex.)","Core benefit"],
        "rows": [
            ["Teachers","Payroll·matching·reviews·MBTI","11","Efficient teacher mgmt"],
            ["Accounting / Points","Payments·overdue·refunds·points","8","Accurate settlement"],
            ["Students / Parents","Roster·attendance·grades·parents","14","Churn prevention"],
            ["Content","Curriculum·textbooks·game reports","11","Learning quality ↑"],
            ["System","Settings·permissions·logs","12","Safe operations"],
            ["AI Ops Assistant","Look up/act by voice·text","-","Faster operations"],
        ],
    },
    "charts": {
        "kpi": {"title":"Today's Key Metrics (example)","labels":["Revenue (10k KRW)","Enrolled","Attendance (%)"],
                "values":[82,312,94],"colors":["#4F46E5","#0EA5E9","#10B981"]},
        "cats": {"title":"Features per Category","labels":["Teachers","Accounting","Students","Content","System"],
                 "values":[11,8,14,11,12],"colors":["#4F46E5","#7C3AED","#0EA5E9","#F59E0B","#10B981"]},
        "churn": {"title":"Churn-risk Distribution (example)","labels":["Safe","Watch","At risk"],
                  "values":[68,22,10],"colors":["#10B981","#F59E0B","#EF4444"]},
    },
    "faq": [
        ("Where do I log in?", "Log in at " + ADMIN_SITE + ". Phone, tablet and PC all connect right from the web."),
        ("I can't see a feature.","Menus vary by role. Use the top feature search or ask the AI assistant by name."),
        ("A student can't enter a lesson.","Usually a browser permission issue. Advise reconnecting in Chrome/Edge and allowing camera/mic. Inside KakaoTalk, open in an external browser."),
        ("Does the AI assistant execute tasks?","Look-ups happen instantly; important actions are confirmed with 'Shall I?' It only does what you have permission for."),
        ("Refund math is confusing.","It's auto-calculated by the refund table; discounted payments are recalculated at list price."),
        ("I'm worried about churn.","Find at-risk students early with the Retention Center's churn-risk/contagion network and intervene via alert-talk/counseling."),
    ],
    "checklist": {
        "title": "Daily Operations Checklist",
        "items": [
            "Did you check today's revenue, enrollment and attendance?",
            "Did you handle new counseling/inquiries?",
            "Did you check overdue and refund items?",
            "Did you check the live (LIVE) lesson status?",
            "Did you care for students whose churn risk rose?",
            "Did you reflect teacher reviews/coaching feedback?",
            "Did you add repeat questions to the FAQ?",
        ],
    },
    "conclusion": {
        "title": "Conclusion · A Practical Guide to Stable Academy Operations",
        "lead": "You've now reviewed every feature of the admin page. Finally, here's one page on how a day of "
                "operations flows and the principles to keep for stable running. Keep just this rhythm and operations "
                "get much lighter.",
        "flow": [
            ("Morning (5 min)", "Check today's revenue, enrollment and attendance on the dashboard; read the AI insight summary"),
            ("Late morning", "Handle new counseling/inquiries; check overdue/refund items and send alert-talk"),
            ("Class hours", "Monitor live (LIVE) lessons; for 'can't enter' tickets, guide browser/permission first"),
            ("Afternoon", "Care for at-risk students in the 🧲 Retention Center; reflect teacher reviews/coaching"),
            ("Weekly · Monthly", "Distribute org settlement/monthly reports, check points/rewards (shop/gifts), improve the FAQ"),
        ],
        "principles": [
            "**Metrics, 5 minutes each morning** — catching revenue/attendance signals early makes response easy.",
            "**Intervene on churn early** — the sooner you care for at-risk students, the higher retention.",
            "**Announce policies upfront** — sharing refund/postpone policies at signup greatly cuts disputes.",
            "**Turn repeats into FAQ** — make frequent questions into an FAQ with screenshots.",
            "**Decide with data** — judge and improve by metrics/graphs, not gut feeling.",
        ],
        "remember": [
            "Log in at **admin.mangoi.co.kr**; menus and data scope change by **role (permissions)**",
            "The **AI assistant** looks up instantly, confirms important actions, and only does **what you're permitted**",
            "Most 'can't enter class' tickets are **browser and camera/mic permission** issues",
            "**Praise points → student total → shop/gifts**; the policy and rewards are the admin's job",
        ],
        "closing": "Good operations come not from fancy features but from 'small daily checks.' Watch your metrics, "
                   "prevent churn early, and announce policies clearly. The AI Operations Assistant and Retention "
                   "Center help you do it. Questions? Contact support anytime — cheering on your steadily growing "
                   "academy! 🍊",
    },
}

TEACHER = {
    "intro": {
        "title": "What is the Teacher Site Guide?",
        "body": "This guide explains how a teacher who runs video lessons uses the Mangoi site. From pre-class device "
                "checks to entering the classroom, the materials/board/chat tools, using the AI warm-up and "
                "pronunciation coach, writing lesson reviews, praising students and learning reports — it follows "
                "the real lesson flow. (This is a 'how to use the site' guide, not a teaching methodology.)",
        "points": [
            ("🩺","Pre-class detailed check","Camera·mic·network·lighting scores."),
            ("🎥","Classroom tools","Video·materials·board·chat·recording."),
            ("📝","Lesson review · praise","Post-class review and star/sticker praise."),
            ("📊","Learning reports","Game weak words·reports for next lesson prep."),
        ],
    },
    "sections": [
        {"icon":"🩺","title":"Pre-class Detailed Check","sub":"Check devices before entering","img":"teacher_precheck",
         "desc":"A screen that checks camera, mic, network and lighting at once before class. An overall score and per-item signals catch problems early and prevent drop-outs mid-lesson.",
         "steps":[
            "Check **camera, mic, network and lighting** on the check screen.",
            "Read the **overall score** and each item's signal (normal/warning).",
            "For red items, adjust **lighting, seat or connection** and check again."],
         "points":["Do the check 5–10 minutes before class.","Fix issues before the student enters."],
         "tip":"Put the light in front of your face so your expression shows and student focus rises."},

        {"icon":"👤","title":"Enter a Lesson from My Page","sub":"The first button to the lesson room","img":"mypage_enter",
         "desc":"Teachers enter a lesson the same way students do — with the **'Enter Class' button on My Page**. After logging in, open My Page and you'll find the gold 'Enter Class' button; pressing it takes you to the video-class lobby.",
         "steps":[
            "After logging in, press the **'👤 My Page'** button.",
            "Find the gold **'🎥 Enter Class'** button below (in a row with '💳 Payment').",
            "Press **'Enter Class'** and you go to the **video-class lobby**.",
            "Check the hint **'🎥 Enter video class lobby · 📹 Mic/Camera required'**.",
            "Then in the lobby, confirm your name → **Allow camera/mic** → enter the classroom (see next page)."],
         "points":[
            "One 'Enter Class' button takes you straight to the lobby.",
            "My Page also has pre-check, postpone/change, all-menu and more.",
            "Students enter with the same 'Enter Class' button."],
         "note":"Even after pressing the button, your face/sound won't connect unless you allow camera/mic.",
         "tip":"Enter early from My Page 5–10 minutes before class to check your devices."},

        {"icon":"🧭","title":"Make the Most of My Page","sub":"Every entry point you need for class","img":"teacher_mypage",
         "desc":"My Page has more than just 'Enter Class' — every menu you need for a lesson is gathered here. Knowing the buttons you use most makes prep much faster.",
         "steps":[
            "🎥 **Pre-check**: check camera, mic, network and lighting before class. (a must 5–10 min before)",
            "🎥 **Enter Class**: go to the video-class lobby. (see earlier page)",
            "📅 **Postpone/Change**: adjust the schedule per a student's request or your situation.",
            "🧠 **Review Quiz** · 🎤 **Curriculum Pronunciation**: preview review/pronunciation material for students.",
            "💬 **New Inquiry** · 🏠 **All Menu** · 📝 **Book Class**: go to intake and all features."],
         "points":[
            "Make 'Pre-check → Enter Class' a habit.",
            "If text looks Korean, switch to English with the EN button.",
            "You can also tell the AI search/assistant 'open ○○' to jump there."],
         "tip":"Pre-class routine: ① Pre-check devices → ② pre-upload the textbook → ③ Enter Class."},

        {"icon":"🎥","title":"Enter the Classroom","sub":"Getting into the lesson room","img":"class_room",
         "desc":"On the entry screen, enter your name and room code to join. Allow camera and mic, then wait for the student.",
         "steps":[
            "Enter your **name** on the entry screen.",
            "Check the **room code** (empty = shared lesson room).",
            "Press **Enter** and click **Allow** for camera/mic.",
            "Wait for the student and check screen/sound."],
         "points":["Enter early to check your camera framing and sound.","Chrome/Edge recommended; avoid the KakaoTalk in-app browser."],
         "note":"If a student can't enter, have them check browser permissions and type first.",
         "tip":"A 30-second check of background, lighting and sound after entering makes the lesson smooth."},

        *build_classroom("teacher"),

        {"icon":"📤","title":"Pre-upload Materials","sub":"Prepare lesson files in advance","img":"teacher_textbook_upload",
         "desc":"Pre-upload lesson files to the materials uploader so you can share them instantly in class. Being prepared makes the lesson far smoother.",
         "steps":[
            "Drag files into or select them in the **materials uploader** to upload.",
            "Review uploaded materials in the **materials viewer**.",
            "In class, bring them up instantly via **materials-tab sharing**."],
         "points":["Uploading before class saves time.","Both PDFs and images are supported."],
         "tip":"Naming files by lesson number makes them easy to find."},

        {"icon":"🔥","title":"Start with the AI Warm-up","sub":"A 3-minute icebreaker","img":"student_warmup",
         "desc":"Use the student's pre-class AI warm-up to open the conversation naturally. The warm-up is tied to today's textbook, so it leads straight into the main lesson.",
         "steps":[
            "Open the conversation using the student's **AI warm-up content**.",
            "Carry the warm-up questions into the **main lesson topic**.",
            "For students who skipped it, ease in with **1–2 light questions**."],
         "points":["Mentioning the warm-up raises student engagement.","A smooth intro improves the lesson rhythm."],
         "tip":"'You said … in the warm-up, right?' instantly breaks the ice."},

        {"icon":"🎙️","title":"Use the Pronunciation Coach","sub":"Correct with the AI voice coach","img":"student_speechcoach",
         "desc":"Practice AI voice-coach sentences with students who struggle with pronunciation. Guide them to self-correct through record → score → replay.",
         "steps":[
            "Pick **voice-coach sentences** at the student's level together.",
            "Have them self-correct via **record → score → replay**.",
            "Link the lesson sentences to **voice-coach homework**."],
         "points":["The 'lesson sentence → voice-coach repeat' routine is effective.","Scores give a sense of achievement to keep going."],
         "tip":"For tough sounds (r, th), repeat with short words first."},

        {"icon":"📝","title":"Write the Lesson Review","sub":"Record post-class feedback","img":"teacher_eval",
         "desc":"After class, record today's lesson in the review. Leave per-item stars and comments on strengths and areas to improve; it's reflected in the parent my-page and reports.",
         "steps":[
            "Record today's lesson on the **review** screen.",
            "Leave **per-item stars and comments**.",
            "Once saved, it's reflected in the **report/parent page**."],
         "points":["One praise + one improvement, short and specific.","Writing right after class is most accurate."],
         "tip":"Adding a concrete example ('today's r sound was great') builds trust."},

        {"icon":"🌟","title":"Leave Student Praise","sub":"Stars · stickers · comments","img":"teacher_praise",
         "desc":"On the Teacher Praise screen, pick the student and items and leave stars, stickers and comments. It shows to the student and parents and motivates them.",
         "steps":[
            "Pick the student and items in **Teacher Praise**.",
            "Leave **stars (7 items)** and stickers/comments.",
            "Once saved, it shows to the student and parents."],
         "points":["Leaving it right after class is most effective.","Specific praise beats vague praise."],
         "tip":"Praising even small wins improves participation next lesson."},

        {"icon":"🧠","title":"Game Learning Report","sub":"Check a student's weak words","img":"teacher_gamereport",
         "desc":"Look up by student ID to see the words most often missed in games. Adding those words to the next lesson's intro for review is effective.",
         "steps":[
            "Enter the student ID in the **game learning report** and look up.",
            "Check the **weak words** (often missed).",
            "Review them intensively in the next lesson."],
         "points":["Pinpoints weaknesses with data.","Even 3 words gives a clear review effect."],
         "tip":"Put weak words on the chat/board and repeat them."},

        {"icon":"📄","title":"Reports · Lesson Management","sub":"Check progress & performance","img":"teacher_lessons",
         "desc":"Check a student's learning progress and performance in reports, and organize past/upcoming lessons and progress in lesson management. Use it to set the next lesson's goal.",
         "steps":[
            "Check learning progress/performance in **reports**.",
            "Organize past/upcoming lessons in **lesson management**.",
            "Set the next lesson **goal in one line**."],
         "points":["Progress continuity improves.","Writing goals makes lesson direction clear."],
         "tip":"Noting the next goal at the end of each lesson makes handover easy too."},

        {"icon":"🔄","title":"Handle Lesson Postpones","sub":"Respond to student requests","img":"common_postpone",
         "desc":"Review students' postpone/change requests and adjust the schedule per policy. Changes are auto-announced to both sides.",
         "steps":[
            "Check students' **postpone/change requests**.",
            "If within policy, **adjust the schedule**.",
            "Confirm the change is **auto-announced**."],
         "points":["Guide out-of-policy last-minute requests per policy.","Postponing preserves the student's lesson count."],
         "tip":"Tell students the postpone cutoff in advance."},

        {"icon":"🎧","title":"Support · Inquiries","sub":"When something goes wrong","img":"common_contact",
         "desc":"If there's a technical issue or a question during class, contact support channels. Knowing common issues in advance lets you respond quickly.",
         "steps":[
            "Use phone, email, Kakao and remote support in **Support**.",
            "For urgent issues, get direct help via **remote support**.",
            "**Note the fix** for repeat issues."],
         "points":["'No sound/video' — check permissions and browser first.","Inquiries within business hours are faster."],
         "tip":"Keeping notes of common issues and fixes reduces lesson loss."},
    ],
    "feature_table": {
        "title": "Tools by Lesson Stage",
        "head": ["Stage","Screen used","What you do","Tip"],
        "rows": [
            ["Before class","Detailed check","Check devices·lighting","5–10 min early"],
            ["Entry","Classroom","Enter name·allow","Enter early"],
            ["Toolbar","Board·materials·video","Switch·control screen","Guide tabs"],
            ["Prep","Materials uploader","Upload·share files","Pre-upload"],
            ["Intro","AI warm-up","Icebreaker","Mention warm-up"],
            ["Main","Materials·board·chat","Explain together","Same page"],
            ["Practice","AI voice coach","Record·fix pronunciation","Link homework"],
            ["Wrap-up","Review·praise","Feedback·stars","1 praise + 1 fix"],
            ["After","Game report·reports","Check weak points·progress","Next goal"],
        ],
    },
    "charts": {
        "timeline": {"title":"25-min Lesson Time Split (ex., min)","labels":["Warm-up/greeting","Main lesson","Speaking practice","Wrap-up/review"],
                     "values":[3,14,5,3],"colors":["#F59E0B","#EA580C","#059669","#4F46E5"]},
        "precheck": {"title":"Pre-check Items (example scores)","labels":["Camera","Mic","Network","Lighting"],
                     "values":[100,100,90,80],"colors":["#EA580C","#F59E0B","#059669","#0EA5E9"]},
        "quality":  {"title":"Elements of a Good Lesson","labels":["Prep","Interaction","Feedback","Pronunciation","Records"],
                     "values":[9,8,9,8,7],"colors":["#EA580C"]},
    },
    "faq": [
        ("How do I enter a lesson?","On the classroom entry screen, enter your name, press 'Enter', then allow camera and mic."),
        ("How do I share materials?","In the materials tab, upload PDF/JPEG/PNG to share with all participants. Use prev/next and fit-to-screen to view larger."),
        ("How do I use the board?","In the board tab, write with pen/shapes/color/thickness, and save the board as an image if needed."),
        ("A student can't enter.","Often a browser permission issue. Advise reconnecting in Chrome/Edge and allowing camera/mic."),
        ("When do I write the review?","Writing right after class is most accurate. Leave stars and a short comment and it's reflected in the report."),
        ("How do I know a student's weak points?","Look up by student ID in the game learning report to see often-missed weak words."),
    ],
    "checklist": {
        "title": "Lesson Checklist",
        "items": [
            "Did you run the detailed check 5–10 min before class?",
            "Did you pre-upload the materials?",
            "Did you check camera framing and sound?",
            "Did you check the student's AI warm-up?",
            "Did you prepare the materials/board/chat tools?",
            "Did you write the lesson review after class?",
            "Did you leave praise (stars/comment)?",
            "Did you check weak words in the game report?",
        ],
    },
    "conclusion": {
        "title": "Conclusion · A Practical Guide to Great Lessons",
        "lead": "You've now learned how to use the Mangoi site 'along the real lesson flow.' Finally, here's one page "
                "summarizing how a single lesson unfolds and the principles to keep every time. Keep just this page "
                "nearby and your lessons will run far more smoothly and reliably.",
        "flow": [
            ("Before class (5–10 min)", "My Page → 🎥 Pre-check camera, mic, network, lighting; pre-upload the textbook"),
            ("Enter", "🎥 Enter Class → confirm name → allow camera/mic → check background/sound while waiting"),
            ("Intro (2–3 min)", "Open lightly by mentioning the student's AI warm-up; state today's goal in one line"),
            ("Main lesson", "Share the same page via materials tools · write on the board · key words in chat; draw out plenty of student speech"),
            ("Praise", "The moment they do well, tap the 🌟 Praise button (+1P) → piles up live in the 🧺 basket"),
            ("Practice", "Link weak-pronunciation sentences to AI voice-coach homework for repetition"),
            ("Wrap-up (3 min)", "Summarize today → prompt the review quiz & rating (+10P) → leave the next goal in one line"),
            ("After class", "Write the review (1 praise + 1 improvement) · leave praise · check weak words in the game report"),
        ],
        "principles": [
            "**Preparation is half the battle** — pre-check and pre-upload keep the lesson from stalling.",
            "**Make them speak a lot** — students should speak more than the teacher to improve.",
            "**Praise instantly** — the moment they do well, 🌟praise! Instant rewards are the strongest motivator.",
            "**Keep records** — the review and 'next goal in one line' power the next lesson and handovers.",
            "**Reinforce with data** — put the game report's weak words into the next lesson's intro.",
        ],
        "remember": [
            "No sound/video → check **Chrome/Edge + camera·mic permission** first (KakaoTalk in-app → external browser)",
            "**Praise points are given by the teacher**; the student's star rating earns **+10P**",
            "Handle **postpone requests** after checking policy; guide out-of-policy last-minute requests per policy",
            "Run every lesson in the rhythm of **'Check → Engage → Praise → Record'**!",
        ],
        "closing": "A teacher's warm words and instant praise build a child's confidence in English. Keep this guide "
                   "beside you and lead every lesson with it. Praise even the small wins and students will look "
                   "forward to the next class. Questions? Contact support anytime — cheering you on for lessons "
                   "that grow together! 🍊",
    },
}

BRANCH = {
    "intro": {
        "title": "What is the Branch Admin Page?",
        "body": "The branch page is where you manage your branch and its sub-agencies with authority delegated by HQ. "
                "When you log in, only 'my branch' data (revenue, enrollment, attendance, settlement) is shown "
                "automatically. You see your sub-agencies' performance at a glance and process the settlement that "
                "flows HQ ↔ branch ↔ agency. The layout is the same as the admin page — only the scope differs.",
        "points": [
            ("🏢","My-branch scope, automatic","Just log in and see only your branch's data."),
            ("🏬","Manage sub-agencies","Agency list, performance and recruiting in one place."),
            ("🌳","HQ→branch→agency settlement","Receipt/distribution auto-calculated by the tree."),
            ("📊","Performance reports","Branch/agency performance in a monthly report."),
        ],
    },
    "sections": [
        {"icon":"🔐","title":"Branch Login & Permissions","sub":"Only my branch's data shows","img":"admin_login",
         "desc":"Logging in with a branch account shows only 'my branch' menus and data. HQ-wide or other branches' data isn't visible, so you can focus on your branch with peace of mind.",
         "steps":[
            "Log in with **ID and password** (Kakao, Naver, Google also work).",
            "On login, menus/data for your **role (branch)** are applied automatically.",
            "Forgot your password? Reset via **'Find password'**.",
            "You can split **permission scope** among staff."],
         "points":["Only your branch and sub-agency data shows.","Turn on 'Save ID' only on your own trusted PC."],
         "tip":"On shared PCs, turn off auto-login and always log out when done."},

        {"icon":"👤","title":"My Page & Admin Dashboard","sub":"Open the management screen from My Page","imgs":[("mypage_menu","My Page menu"),("admin_dashboard","Admin dashboard")],
         "desc":"Branch operations start from 'My Page.' After logging in, press the 📊 'Admin' button in the My Page menu to enter the branch-scope admin (operations) dashboard, where you manage revenue, enrollment, agencies and settlement.",
         "steps":[
            "After logging in, open **'👤 My Page'**.",
            "Press the **📊 'Admin'** button in the My Page menu. (goes to the admin dashboard)",
            "On the **admin dashboard**, check your branch revenue, enrollment, attendance and sub-agencies.",
            "My Page also has postpone/change, new inquiry, all-menu, pre-check and more.",
            "If text looks English, use the **EN** button to switch language."],
         "points":[
            "One 'Admin' button takes you straight to the operations dashboard.",
            "All dashboard data is auto-totaled to 'your branch scope'.",
            "Menus and data are set automatically by your role (branch)."],
         "note":"My Page and the admin dashboard open only within the logged-in branch account's permission scope.",
         "tip":"Each day, spend 5 minutes: My Page → Admin dashboard → check branch metrics."},

        {"icon":"🏠","title":"Branch Dashboard","sub":"Your branch status at a glance","img":"admin_dashboard",
         "desc":"On login, your branch's revenue, enrollment and attendance plus sub-agency status are organized as cards. Type a word in the top search box to jump right to a feature.",
         "steps":[
            "Check **today's revenue, enrollment and attendance** (your branch total) at the top.",
            "Tap features from the **category cards** (agencies, teachers, accounting, students, content).",
            "Type a word in the **feature search box** to jump right there.",
            "The **AI insight** summarizes your branch status."],
         "points":["All numbers are auto-totaled to 'your branch scope'.","If a feature is hard to find, search is fastest."],
         "tip":"A 5-minute morning check of branch metrics catches warning signs early."},

        {"icon":"🤖","title":"Using the AI Assistant","sub":"Look up/act by voice or text","img":"admin_dashboard",
         "desc":"Speak or type into the search/mic and the AI looks up numbers or opens screens within your branch scope. Important actions are confirmed first, and it only does what you're permitted.",
         "steps":[
            "Speak or type into the center **search/mic**. e.g. 'How's the branch revenue this month?'",
            "The AI **looks up numbers** or **opens a screen**. e.g. 'Open the agency list.'",
            "Important actions are **confirmed with 'Shall I?' first**.",
            "The assistant only executes **what you're permitted**."],
         "points":["When busy, voice is much faster.","Results are limited to your branch scope."],
         "tip":"Just say 'show me/open ○○' to jump to the screen you want."},

        {"icon":"🏬","title":"Manage Sub-agencies","sub":"List, performance, recruiting","img":"admin_menu_students",
         "desc":"Manage the agencies under your branch as a list and compare each agency's enrollment, revenue and performance. Recruiting and onboarding new agencies is handled here too.",
         "steps":[
            "Check each agency's enrollment, revenue and activity in the **agency list**.",
            "Compare strong/weak agencies to set **support priorities**.",
            "Manage **new-agency recruiting/onboarding** progress.",
            "Set **goals/incentives** per agency if needed."],
         "points":["Link agencies with big performance gaps to coaching/support.","Share top agencies' methods with the others."],
         "note":"Agency data is also managed by each agency's own login; the branch sees the whole picture.",
         "tip":"Sharing a monthly performance report at month-start boosts partner motivation."},

        {"icon":"🌳","title":"Branch Settlement (receive & distribute)","sub":"HQ→branch→agency","img":"admin_monthlyreport",
         "desc":"Receive the settlement coming from HQ to your branch and check the amount distributed from the branch to sub-agencies. Revenue and commissions are auto-calculated down the org tree.",
         "steps":[
            "Check **HQ→branch settlement** (received) by month.",
            "**Branch→agency distribution** is auto-calculated by the tree.",
            "Review/save the settlement in a **monthly report** (PDF).",
            "If an item looks off, look up the details to confirm."],
         "points":["Settlement is auto-calculated down the org tree (HQ·branch·agency).","Distributing the settlement report early builds agency trust."],
         "tip":"Announcing settlement terms (rate·timing) to agencies in advance reduces disputes."},

        {"icon":"🧑‍🎓","title":"Student · Parent Status","sub":"Branch-scope enrollment·attendance·grades","img":"admin_menu_students",
         "desc":"Check the status of students in your branch (enrollment, attendance, grades). View by agency or as a branch total.",
         "steps":[
            "Check branch-scope enrolled students in **Students/Parents**.",
            "Compare attendance/grades **by agency and overall**.",
            "Flag students/agencies that need attention."],
         "points":["The student list is linked to real member data.","At-risk students link to the Retention Center."],
         "tip":"Find agencies whose attendance/enrollment is dipping and support them quickly."},

        {"icon":"💳","title":"Payments·Overdue·Refunds (branch)","sub":"Branch-scope accounting","img":"admin_refund",
         "desc":"Check payments, overdue and refunds in your branch scope and review amounts auto-calculated by policy. Also see collection status by agency.",
         "steps":[
            "Check branch-scope payments/overdue/refunds in **Accounting/Points**.",
            "Compare **collection rate by agency**.",
            "Amounts are auto-calculated per the **refund table**."],
         "points":["Strengthen alerts/support for agencies with high overdue.","Discounted-payment refunds recalc at list price."],
         "tip":"Advise agencies with low collection to automate reminders."},

        {"icon":"🧲","title":"Branch Retention","sub":"Churn risk·contagion·coaching","img":"admin_dashboard",
         "desc":"Find at-risk students across your branch/agencies early and prevent chain churn through family/referral. It ties into agency and teacher coaching.",
         "steps":[
            "Find at-risk students/agencies with the **churn-risk graph**.",
            "Prevent chain churn with the **contagion network**.",
            "Link high-risk spots to **alert-talk/counseling/coaching**."],
         "points":["Intervening early raises retention.","Compare churn patterns by agency to support them."],
         "tip":"Just caring weekly for the top at-risk agencies/students noticeably cuts churn."},

        {"icon":"📊","title":"Monthly Report·Performance","sub":"Branch·agency performance","img":"admin_monthlyreport",
         "desc":"Summarize your branch and sub-agencies' performance in a monthly report. See revenue, enrollment, attendance and settlement at a glance and save/print to share.",
         "steps":[
            "Check branch/agency performance with the **monthly report**.",
            "**Compare** metrics (revenue·enrollment·attendance·settlement) vs prior month/year.",
            "Save the report as **print/PDF** to share."],
         "points":["The AI insight helps summarize performance.","The report also works as agency motivation material."],
         "tip":"Making monthly report sharing routine keeps branch operations transparent."},

        {"icon":"🎓","title":"Agency Support·Training","sub":"Onboarding·ops coaching","img":"common_contact",
         "desc":"Support sub-agencies to operate well with onboarding and ops coaching. Guide the user guide/FAQ/support channels and share best practices.",
         "steps":[
            "Guide new agencies to the **user guide·ops guide**.",
            "Organize frequent questions into an **FAQ** and distribute.",
            "Share top-agency cases to **level everyone up**."],
         "points":["Early onboarding largely decides an agency's success.","Turn repeat questions into FAQ to cut support load."],
         "tip":"Quarterly agency meetings help review performance and pain points together."},

        {"icon":"🎧","title":"Support·Inquiries","sub":"Get HQ support","img":"common_contact",
         "desc":"If a problem comes up in operations, contact HQ support channels. System/settlement/policy questions get resolved quickly.",
         "steps":[
            "Use phone, email, Kakao and remote support in **Support**.",
            "Route settlement/policy questions to the **HQ contact**.",
            "**Note the fix** for repeat issues."],
         "points":["System issues resolve fast with remote support.","Inquiries within business hours are faster."],
         "tip":"Compile common inquiries and fixes and share them with agencies too."},
    ],
    "feature_table": {
        "title": "Branch Features at a Glance",
        "head": ["Feature","What it does","Scope","Core benefit"],
        "rows": [
            ["Branch dashboard","Revenue·enrollment·attendance","My branch","Quick read"],
            ["Agency mgmt","List·performance·recruiting","Sub-agencies","Level up"],
            ["Branch settlement","Receive·distribute auto-calc","HQ↔branch↔agency","Accurate settlement"],
            ["Students·parents","Enrollment·attendance·grades","Branch scope","Churn prevention"],
            ["Accounting","Payments·overdue·refunds","Branch scope","Healthy collection"],
            ["Retention","Churn risk·contagion","Branch·agency","Retention ↑"],
            ["Monthly report","Performance analysis","Branch·agency","Transparent ops"],
        ],
    },
    "charts": {
        "kpi": {"title":"Your Branch Metrics (example)","labels":["Revenue (M KRW)","Enrolled","Sub-agencies"],
                "values":[64,980,12],"colors":["#0D9488","#0EA5E9","#F59E0B"]},
        "agencies": {"title":"Enrollment by Agency (example)","labels":["Gangnam","Bundang","Ilsan","Suwon","Incheon"],
                     "values":[210,180,150,120,90],"colors":["#0D9488","#0EA5E9","#14B8A6","#F59E0B","#64748B"]},
        "settle": {"title":"Settlement Split (example)","labels":["HQ fee","Branch share","Agency distribution"],
                   "values":[20,30,50],"colors":["#64748B","#0D9488","#F59E0B"]},
    },
    "faq": [
        ("Where do I log in?", "Log in at " + ADMIN_SITE + ". By role (branch), only your branch's data shows automatically."),
        ("Can I see other branches' data?","No. By permission scope, only your branch and sub-agency data is visible."),
        ("How is settlement calculated?","Revenue/commissions are auto-calculated down the org tree (HQ→branch→agency). Check the monthly report."),
        ("An agency is underperforming.","Find causes via retention/accounting/reports and support with onboarding/coaching/incentives; sharing best cases helps."),
        ("A system problem occurred.","Contact HQ support (phone·email·Kakao·remote) for a quick fix."),
    ],
    "checklist": {
        "title": "Branch Operations Checklist",
        "items": [
            "Did you check today's branch revenue/enrollment/attendance?",
            "Did you spot and support underperforming agencies?",
            "Did you review this month's settlement (receive·distribute)?",
            "Did you check overdue/refund items?",
            "Did you care for at-risk students/agencies?",
            "Did you onboard new agencies?",
            "Did you share the monthly report?",
        ],
    },
    "conclusion": {
        "title": "Conclusion · A Practical Guide to Branch Growth",
        "lead": "A branch is the bridge between HQ and agencies. Watch your branch metrics, support your agencies to "
                "grow, and process settlement transparently — and the whole branch grows together. Keep this rhythm "
                "and operations get far more stable.",
        "flow": [
            ("Morning (5 min)", "Check revenue/enrollment/attendance on the branch dashboard; read the AI insight"),
            ("Late morning", "Review performance/collection by agency; check overdue/refunds"),
            ("Afternoon", "Support/coach underperforming agencies; care for at-risk students (retention)"),
            ("Weekly", "Onboard new agencies; share best practices"),
            ("Monthly", "Check/distribute HQ→branch→agency settlement; share the monthly report"),
        ],
        "principles": [
            "**Metrics, 5 minutes each morning** — catch branch/agency signals early.",
            "**Agencies as partners** — close performance gaps with coaching/support.",
            "**Transparent settlement** — announcing terms upfront builds trust.",
            "**Intervene on churn early** — care for at-risk agencies/students first.",
            "**Spread best practices** — share top agencies' methods branch-wide.",
        ],
        "remember": [
            "Log in at **admin.mangoi.co.kr**; data is auto-limited to **your branch scope**",
            "Settlement is auto-calculated by the **HQ→branch→agency** tree",
            "Most field inquiries like 'can't enter' are **browser/permission** issues",
            "Ops rhythm: **'Check → Support → Settle → Report'**!",
        ],
        "closing": "A good branch is one that helps its agencies thrive. Read the situation with metrics, support your "
                   "partners, and keep settlement transparent — and branch and agencies grow together. Questions? "
                   "Contact HQ support anytime — cheering on your solid branch operations! 🍊",
    },
}

AGENCY = {
    "intro": {
        "title": "What is the Agency Admin Page?",
        "body": "The agency page is where you directly manage your agency's students, lessons, payments and "
                "settlement. From recruiting and counseling to enrollment, lesson assignment, collection, parent "
                "communication and receiving settlement — everything you need to run an agency is here. On login, "
                "only 'my agency' data shows, so you can focus on your students.",
        "points": [
            ("🤝","My-agency scope, automatic","Just log in and see only your students/revenue."),
            ("🧑‍🎓","Recruit·enroll·manage students","From counseling to enrollment and lesson assignment."),
            ("💳","Collection·settlement","Payments/overdue and receiving branch→agency settlement."),
            ("📈","Learning status·reports","Your students' learning at a glance."),
        ],
    },
    "sections": [
        {"icon":"🔐","title":"Agency Login & Permissions","sub":"Only my agency's data","img":"admin_login",
         "desc":"Logging in with an agency account shows only 'my agency' menus and data. Other agencies or branch-wide data isn't visible, so you can focus on managing your students.",
         "steps":[
            "Log in with **ID and password** (social login also works).",
            "On login, menus/data for your **role (agency)** are applied automatically.",
            "Forgot your password? Reset via **'Find password'**."],
         "points":["Only your agency's student/revenue data shows.","Turn on 'Save ID' only on your own trusted PC."],
         "tip":"On shared PCs, turn off auto-login and log out when done."},

        {"icon":"👤","title":"My Page & Admin Dashboard","sub":"Open the management screen from My Page","imgs":[("mypage_menu","My Page menu"),("admin_dashboard","Admin dashboard")],
         "desc":"Agency operations also start from 'My Page.' After logging in, press the 📊 'Admin' button in the My Page menu to enter the agency-scope admin (operations) dashboard, where you manage students, revenue, lessons and settlement.",
         "steps":[
            "After logging in, open **'👤 My Page'**.",
            "Press the **📊 'Admin'** button in the My Page menu. (goes to the admin dashboard)",
            "On the **admin dashboard**, check your agency revenue, enrollment and today's lessons.",
            "My Page also has postpone/change, new inquiry, all-menu, pre-check and more.",
            "If text looks English, use the **EN** button to switch language."],
         "points":[
            "One 'Admin' button takes you straight to the operations dashboard.",
            "All dashboard data is auto-totaled to 'your agency scope'.",
            "Menus and data are set automatically by your role (agency)."],
         "note":"My Page and the admin dashboard open only within the logged-in agency account's permission scope.",
         "tip":"Each day, go My Page → Admin dashboard to check your agency metrics."},

        {"icon":"🏠","title":"Agency Dashboard","sub":"Your students·revenue·today's lessons","img":"admin_dashboard",
         "desc":"On login, your agency's enrollment, revenue and today's lessons are organized as cards. Find features fast with the search box.",
         "steps":[
            "Check **today's revenue, enrollment and attendance** (your agency) at the top.",
            "Tap features from the **category cards** (students, accounting, content, etc.).",
            "Type a word in the **feature search box** to jump right there.",
            "Check the **live (LIVE) lesson** status."],
         "points":["Numbers are auto-totaled to 'your agency scope'.","If a feature is hard to find, search is fastest."],
         "tip":"A morning metrics check quickly tells you your academy's status."},

        {"icon":"🤖","title":"Using the AI Assistant","sub":"Look up/act by voice or text","img":"admin_dashboard",
         "desc":"Speak or type into the search/mic and the AI helps you look up and handle things within your agency scope. Especially handy during busy counseling hours.",
         "steps":[
            "Speak or type into the center **search/mic**. e.g. 'How's today's revenue?'",
            "The AI **looks up** or **opens a screen**. e.g. 'Open student management.'",
            "Important actions are **confirmed with 'Shall I?' first**."],
         "points":["Voice is much faster than clicking.","Only permitted actions are handled, safely."],
         "tip":"Can't find a button? Just say 'open ○○'."},

        {"icon":"🧑‍🎓","title":"Recruit·Enroll·Manage Students","sub":"From counseling to enrollment","img":"admin_menu_students",
         "desc":"Take new counseling, enroll students, and manage enrolled students' attendance, grades and history. This is your agency's core work.",
         "steps":[
            "Take **new counseling** and convert to enrollment.",
            "Manage the roster/history in **Students/Parents**.",
            "Check attendance/reviews/points/chat history by student.",
            "Flag and care for students who need attention."],
         "points":["The student list is linked to real member data.","Raising the counsel→enroll conversion is key to growth."],
         "tip":"Keeping thorough counseling notes greatly helps re-counseling and conversion."},

        {"icon":"👨‍👩‍👧","title":"Parent Communication","sub":"Guide My Page","img":"admin_parent",
         "desc":"Guide parents to My Page so they can check their child's learning themselves. It reduces inquiries and raises satisfaction and re-enrollment.",
         "steps":[
            "Share the **My Page link** with parents.",
            "Parents check attendance/reviews/payments/reports with the **child's student ID**.",
            "Share growth with the **monthly report** (print/PDF)."],
         "points":["Parent satisfaction leads to re-enrollment.","Advise managing the student ID like a password."],
         "tip":"Reading the review together periodically builds parent trust."},

        {"icon":"📅","title":"Booking·Assignment","sub":"Schedule and teacher","img":"common_booking",
         "desc":"Assign a student's lesson type, time and teacher, and manage booking status. Handle postpone/change requests too.",
         "steps":[
            "Assign lesson type, teacher and time in **Booking**.",
            "Check empty slots/overlaps and adjust.",
            "Handle students' **postpone/change requests** per policy."],
         "points":["Assign popular slots in advance.","Announcing the postpone cutoff reduces no-shows."],
         "tip":"Pre-registering each teacher's available times speeds up assignment."},

        {"icon":"💳","title":"Payments·Collection","sub":"Payments·overdue·refunds","img":"admin_refund",
         "desc":"Process your agency's payments, overdue and refunds. Amounts auto-calculate by policy, and overdue is managed with alerts.",
         "steps":[
            "Process payments/overdue/refunds in **Accounting/Points**.",
            "Notify overdue via **alert-talk/SMS**.",
            "Amounts are auto-calculated per the **refund table**."],
         "points":["Automate overdue alerts to raise collection.","Discounted-payment refunds recalc at list price."],
         "tip":"Reviewing collection status regularly stabilizes revenue."},

        {"icon":"📈","title":"Student Learning·Reports","sub":"Progress·performance","img":"admin_parent",
         "desc":"Check your students' attendance, reviews and learning progress, and review performance with reports. Use it for parent counseling and re-enrollment persuasion.",
         "steps":[
            "Check each student's **attendance·reviews·progress**.",
            "Summarize performance with the **monthly report**.",
            "Use reports in **parent counseling**."],
         "points":["Showing data builds parent trust.","Link high-performing students to reviews/referrals."],
         "tip":"Showing performance with a report before re-enrollment makes persuasion easier."},

        {"icon":"🌳","title":"Agency Settlement","sub":"Receive branch→agency","img":"admin_monthlyreport",
         "desc":"Check the settlement coming from the branch to your agency. Revenue and commissions are auto-calculated down the org tree, so you can see your share transparently.",
         "steps":[
            "Check **branch→agency settlement** (received) by month.",
            "Review the revenue/commission calculation details.",
            "**Save (PDF)** the settlement report to keep."],
         "points":["Settlement is auto-calculated by the org tree.","Ask the branch/HQ to confirm any off items."],
         "tip":"Viewing revenue and settlement together clarifies your agency's profit structure."},

        {"icon":"🧲","title":"Prevent Churn (care for students)","sub":"Spot at-risk early","img":"admin_dashboard",
         "desc":"Find students likely to quit early and care for them. Quickly caring for students with frequent absences or dropping performance raises re-enrollment.",
         "steps":[
            "Check **churn-risk** signals (absences·performance drop).",
            "Intervene on at-risk students with **counseling/alert-talk**.",
            "Manage family/referral relationships too."],
         "points":["Intervening early raises retention.","Care before re-enrollment season is especially important."],
         "tip":"Caring first for frequently-absent students noticeably cuts churn."},

        {"icon":"💬","title":"New Counseling·Recruiting","sub":"Intake·conversion","img":"common_contact",
         "desc":"Take new counseling/inquiries and convert to enrollment. Recruiting is the starting point of agency growth.",
         "steps":[
            "Take **new counseling/inquiries**.",
            "Record the counseling and **convert to enrollment**.",
            "Drive enrollment with trial lessons·level tests."],
         "points":["Fast response raises conversion.","Make the trial→enroll flow smooth."],
         "tip":"Following up after counseling raises conversion."},

        {"icon":"🎧","title":"Support·Help","sub":"Get branch·HQ support","img":"common_contact",
         "desc":"If a problem comes up in operations, contact branch/HQ support. System/settlement/policy questions get resolved quickly.",
         "steps":[
            "Use phone, email, Kakao and remote support in **Support**.",
            "Route settlement/policy questions to the **branch/HQ**.",
            "**Note the fix** for repeat issues."],
         "points":["System issues resolve fast with remote support.","For 'can't enter' tickets, check browser/permission first."],
         "tip":"Compiling common inquiries and fixes speeds up counseling."},
    ],
    "feature_table": {
        "title": "Agency Features at a Glance",
        "head": ["Feature","What it does","When","Core benefit"],
        "rows": [
            ["Dashboard","Revenue·enrollment·today","Every morning","Quick read"],
            ["Student mgmt","Recruit·enroll·history","Always","Grow enrollment"],
            ["Parent comm","Guide My Page","Enroll·re-enroll","Satisfaction ↑"],
            ["Booking","Schedule·teacher","Assigning lessons","Smooth flow"],
            ["Payments","Payments·overdue·refunds","Collection","Stable revenue"],
            ["Reports","Learning performance","Counsel·re-enroll","Persuasion ↑"],
            ["Settlement","Receive branch→agency","Monthly","Transparent profit"],
            ["Retention","Care for at-risk","Always","Retention ↑"],
        ],
    },
    "charts": {
        "kpi": {"title":"Your Agency Metrics (example)","labels":["Revenue (10k KRW)","Enrolled","Attendance (%)"],
                "values":[46,180,93],"colors":["#E11D48","#F59E0B","#0EA5E9"]},
        "growth": {"title":"Enrollment Trend (example)","labels":["Jan","Feb","Mar","Apr","May","Jun"],
                   "values":[120,135,150,162,171,180],"colors":["#E11D48"]},
        "churn": {"title":"Churn-risk Distribution (example)","labels":["Safe","Watch","At risk"],
                  "values":[72,20,8],"colors":["#10B981","#F59E0B","#EF4444"]},
    },
    "faq": [
        ("Where do I log in?", "Log in at " + ADMIN_SITE + ". By role (agency), only your agency's data shows automatically."),
        ("Can I see other agencies' data?","No. By permission scope, only your agency's data is visible."),
        ("How do I grow enrollment?","Fast counseling response, a smooth trial→enroll flow, and persuading parents with learning reports are key."),
        ("How do I check settlement?","Branch→agency settlement (received) is auto-calculated by the org tree; check it in the monthly report."),
        ("A student seems about to quit.","Watch churn-risk signals (absences·performance drop) and intervene quickly with counseling/alert-talk."),
    ],
    "checklist": {
        "title": "Agency Operations Checklist",
        "items": [
            "Did you check today's revenue/enrollment/attendance?",
            "Did you take and respond to new counseling/inquiries?",
            "Did you check and notify overdue items?",
            "Did you care for at-risk students?",
            "Did you guide parents to the report/My Page?",
            "Did you check this month's settlement (received)?",
            "Did you follow up on trial→enroll?",
        ],
    },
    "conclusion": {
        "title": "Conclusion · A Practical Guide to Agency Growth",
        "lead": "The core of agency operations is the virtuous cycle of 'recruit → enroll → satisfy → re-enroll.' "
                "Respond to counseling fast, show learning results with data, and prevent churn early — and your "
                "agency grows steadily. Keep this rhythm and operations feel solid.",
        "flow": [
            ("Morning (5 min)", "Check revenue/enrollment/attendance on the dashboard; check live-lesson status"),
            ("Late morning", "Respond to new counseling·convert; notify overdue"),
            ("Class hours", "Check lesson assignment/progress; guide 'entry' tickets to browser/permission first"),
            ("Afternoon", "Care for at-risk students; parent reports·counseling"),
            ("Monthly", "Check branch→agency settlement; re-enroll·follow-up"),
        ],
        "principles": [
            "**Respond fast** — the faster you handle counseling/inquiries, the higher conversion.",
            "**Persuade with data** — showing results via learning reports makes re-enrollment easy.",
            "**Intervene on churn early** — care first for frequently-absent students.",
            "**Communicate with parents** — build trust with My Page and reports.",
            "**Follow up** — following up after counseling completes enrollment.",
        ],
        "remember": [
            "Log in at **admin.mangoi.co.kr**; data is auto-limited to **your agency scope**",
            "Settlement is auto-calculated by the **branch→agency** tree",
            "Most 'can't enter class' tickets are **browser/permission** issues",
            "Growth rhythm: **'Recruit → Enroll → Satisfy → Re-enroll'**!",
        ],
        "closing": "An agency's strength comes from 'the care you give each student.' Respond quickly, show results, "
                   "and prevent churn early. Your branch and HQ back you up solidly. Questions? Contact support "
                   "anytime — cheering on your thriving agency! 🍊",
    },
}
