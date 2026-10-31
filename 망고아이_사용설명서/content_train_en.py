# -*- coding: utf-8 -*-
"""Mangoi Teacher Training Manual (English) — built by the same generators as the user guides.

Most Mangoi teachers are based in the Philippines, so the English edition is the
primary working copy, not a translation afterthought.
"""

SITE = "www.mangoi.co.kr"
ADMIN_SITE = "admin.mangoi.co.kr"

OUT_SUFFIX = "_train_en"
FILENAMES = {"train": "Mangoi_Teacher_Training_Manual_EN"}

UI = {"section":"Skills That Make a Lesson Work","intro":"Introduction","summary":"Skill Summary · Data",
      "toc":"Contents","toc_title":"📑 Contents","toc_page":"p.","toc_slide":"slide",
      "faqpage":"FAQ · Checklist","howto":"How to do it","point":"✅ Key Points",
      "note":"⚠️ Good to know","tip":"💡 Pro tip","faq":"❓ Frequently Asked Questions",
      "data":"📊 Data at a Glance","closing":"You are the curriculum",
      "closing_sub":"Questions? Contact the Teacher Support team or our KakaoTalk channel.",
      "guide_of":"Training Manual","target":"For","docuse":"How to use this document",
      "sheet_index":"Skill Index","sheet_steps":"Step-by-Step","sheet_check":"Lesson Checklist",
      "sheet_faq":"FAQ","sheet_data":"Data & Charts","sheet_cover":"Cover",
      "xls_index_title":"📇 {label} Skill Index",
      "xls_index_head":["No.","Icon","Skill","What it does (key steps)","Pro tip"],
      "xls_steps_title":"🧭 How to do it in class","xls_step":"Step","xls_do":"What to do",
      "xls_check_title":"✅ {title}","xls_check_head":["✔","Item","Done"],
      "xls_faq_title":"❓ Frequently Asked Questions","xls_faq_head":["Question (Q)","Answer (A)"],
      "xls_data_title":"📊 Data & Charts","xls_item":"Item","xls_value":"Value",
      "concl_page":"Conclusion","concl_flow":"🔄 One Lesson, End to End","concl_principles":"⭐ Core Principles",
      "concl_remember":"📌 Remember",
      "xls_docuse":("How to use this document\n\n"
                    "• [Skill Index] sheet : every teaching skill at a glance\n"
                    "• [Step-by-Step] sheet : follow it directly in class\n"
                    "• [Lesson Checklist] sheet : print it and use every lesson\n"
                    "• [FAQ] sheet : frequently asked questions\n"
                    "• [Data & Charts] sheet : the numbers behind the advice")}

BRAND = {"name":"Mangoi","en":"MANGOI","tagline":"Live 1:1 video English + AI learning",
         "mango":"#FF9F1C","mango_dark":"#E8630A","ink":"#1E2340"}

THEMES = {
    "train": {"label":"Teacher","en":"TEACHER TRAINING","emoji":"🎓",
        "primary":"#0B5FFF","primary2":"#00B85C","accent":"#FF9500",
        "soft":"#E9F1FF","chip":"#DBEAFE","grad":("#08296B","#0B5FFF"),
        "who":"Mangoi video-English teachers · new-teacher onboarding"},
}

COVERS = {"train": ("Teacher Training Manual", "Getting kids to speak — from principle to practice")}


def sec(icon, title, sub, img, desc, steps, points, note=None, tip=None):
    d = {"icon":icon, "title":title, "sub":sub, "img":img, "desc":desc,
         "steps":steps, "points":points}
    if note: d["note"] = note
    if tip:  d["tip"]  = tip
    return d


SECTIONS = [
sec("🔥","Energy — the first 60 seconds set the whole lesson","Your energy becomes their energy","class_room",
    "Children read **the mood before the content**. If you are bright and quick to react in the first minute, the lesson stays alive to the end; if that first minute is quiet, you will spend the remaining 25 minutes pulling it uphill. Energy is not a personality trait — it is **a skill you switch on deliberately**.",
    ["The moment the camera is on, **greet them by name** — “Hi, Minjun! I missed you!”",
     "Make your expressions **20% bigger than normal**. A screen eats about half of them.",
     "Make the first question **impossible to fail** — “Did you eat lunch?”",
     "**React instantly** to anything they say — “Wow, really?”",
     "**Vary your pitch.** A flat tone is even duller through a screen."],
    ["If the child **laughs even once** in the first 60 seconds, the lesson is already half won.",
     "Energy is **speed of reaction, not volume**. React fast.",
     "If you look tired, children often assume **it is their fault**."],
    "Big reactions and forced cheerfulness are not the same thing. With teenagers, too much energy creates distance — the older the student, the more you want **calm but fast** reactions.",
    "Stand up for 30 seconds before class, breathe deeply and loosen your face. Energy is something you warm up for."),

sec("🗣","Talk time — the more you talk, the less they learn","Aim for 70% student · 30% teacher","student_aifriend",
    "English grows from **how much they say, not how much they hear**. Yet in most video lessons the teacher does 70% of the talking. Deliberately **saying less and waiting** is the single most important skill in this manual.",
    ["After asking, **count to five in your head.** Do not break the silence first.",
     "If they answer with one word, **echo it back as a sentence** — “Pizza? You like pizza?”",
     "Turn statements into questions — instead of “This is a cat”, ask “What is this?”",
     "When they make a mistake, **do not correct immediately** — recast it naturally.",
     "Ask yourself mid-lesson: **“How long have I been talking?”**"],
    ["**Five seconds of silence** is what produces their first sentence. Do not give up at three.",
     "One minute of your explanation is one minute taken from their speaking.",
     "For quiet students, go **closed questions (Yes/No) → open questions**, in that order."],
    "Do not push so hard that waiting feels like pressure. **Silence should read as patience, not demand.**",
    "Watch one recording of your own lesson. Seeing how much you talk changes your very next class."),

sec("⭐","Make progress visible — praise they can see","Praise that stays, not praise that vanishes","class_praise",
    "Children keep going when they can **see evidence that they are improving**. “Good job” disappears in three seconds; stars, points and badges stay on the screen. The **praise basket and points** in Mangoi exist for exactly this.",
    ["Drop praise into the **praise basket (🧺)** the moment they do something well.",
     "Be **specific** — not “Good”, but “Your ‘th’ sound was perfect!”",
     "At the end of the lesson, **look at the points they earned** together.",
     "Always name **one thing that improved** since last lesson.",
     "Remember: what you write in the evaluation **becomes the parent's report**."],
    ["Praise **the attempt, not just the result** — praising “you said it even though it was wrong” is what makes them try again.",
     "Points and badges are what keep them going **between lessons**.",
     "Aim for **at least three specific compliments** per lesson."],
    "Praise loses value if you scatter it. Children notice a **reflexive “Good job”** every time.",
    "Prepare five specific praise sentences in advance. They save you when nothing specific comes to mind in the moment."),

sec("🎯","Personalisation — remember one thing about this child","Name, interest, last lesson","teacher_precheck",
    "The moment a child feels **“this teacher knows me”**, their attitude changes. It does not take much — **remembering one thing they said last week** is enough.",
    ["Skim the **last evaluation** for 30 seconds before class.",
     "Note **one interest** (football, K-pop, games).",
     "Bring it up in your greeting — “Did your team win last week?”",
     "Rebuild your examples and games **around that interest**.",
     "Write down what to ask next time in the **evaluation notes**."],
    ["Personalisation is **record-keeping, not memory**. Write it down.",
     "Putting their interests into example sentences makes the **same grammar far stickier**.",
     "Simply using their name often raises attention."],
    None,
    "Ask “What do you love?” in the first week. That one answer becomes six months of lesson material."),

sec("🎵","Rhythm — cut 25 minutes into four pieces","Never run one activity past 7 minutes","room_base",
    "A child's attention on a single activity lasts **5–7 minutes**. Run 25 minutes as one continuous block and the last 10 are effectively wasted. **Simply switching activity** brings attention back.",
    ["**Warm-up, 3 min** — AI warm-up or light questions to get their mouth moving.",
     "**Core, 7 min** — today's target expression or textbook.",
     "**Speaking, 7 min** — real conversation using what they just learned.",
     "**Game & reward, 5 min** — review through a learning game, earn points.",
     "**Close, 3 min** — praise plus a preview of next time."],
    ["Attention **resets every time the activity changes**.",
     "If they look bored, **change the activity — do not add explanation**.",
     "That final 3-minute preview measurably improves **next-lesson attendance**."],
    "Rhythm is a tool, not a rule. If a child is deeply engaged, **do not interrupt it.**",
    "Keep the on-screen timer running. The child starts to anticipate “game time is coming”, which itself helps."),

sec("🌡","Warm-up — loosen the mouth before you expect words","3 minutes that change 25","room_warmup",
    "Go straight into the material from cold and the child will spend **the first 10 minutes in silence**. The **AI warm-up** is the stretching that gets sound out of them with no pressure.",
    ["Open the **AI Warm-up tab** in the classroom.",
     "Choose the **speed and level** that fits the child.",
     "**Model it yourself first.**",
     "Have them say it aloud, and **praise even a quiet attempt**.",
     "Carry the warm-up phrases **straight into the main lesson**."],
    ["The goal of a warm-up is **making sound, not being accurate**.",
     "Going first yourself removes most of their hesitation.",
     "Reusing warm-up phrases later **doubles the sense of achievement**."],
    None,
    "For very quiet students, stretch the warm-up to five minutes. Once the mouth is moving everything else gets easier."),

sec("🎮","Games — turning review into play","Not a reward — the review itself","student_games",
    "A game is not **a prize after the lesson**; it is **the review**. Inside a game a child will meet the same word five times without getting bored. Used with a stated purpose, it is the strongest learning tool you have.",
    ["Pick a **game that contains today's expressions**.",
     "State the goal first — “Let's get 10 points with today's words!”",
     "While they play, **note the words they get wrong**.",
     "After the game, **revisit only the wrong ones**.",
     "Tie the result back to the **praise basket and points**."],
    ["A game with **no stated purpose** is just playtime. Say the goal first.",
     "The wrong answers are the real harvest — they are next lesson's material.",
     "Rotating game types keeps the novelty alive."],
    "On slower devices or weak connections games can stutter. Switch to a lighter quiz-style activity when that happens.",
    "Cheer out loud while they play. A game played alone and a game played together are completely different experiences."),

sec("🚪","The room that only opens when they speak","A game where clicking does nothing","student_escape",
    "**Escape by Voice** is a game that only advances when the child **says something in English out loud**. There are no buttons, so “I don't want to speak” simply does not work. Treat it as a **specialist tool** for reluctant speakers.",
    ["Open **🚪 Escape** for a student who rarely speaks.",
     "**Demonstrate one room yourself** first.",
     "Have them press the mic and speak — **accept a quiet attempt**.",
     "If they are stuck, let them use the **Hint button** — there is no penalty.",
     "At the end, look at **how many times they spoke** and praise it."],
    ["The experience of **“speaking really does open the door”** changes their attitude.",
     "Even a failed escape shows **how far they got**, so there is little discouragement.",
     "The spoken-attempt count is **good evidence for the evaluation**."],
    "Microphone permission is required. If nothing registers, check the browser's mic permission first.",
    "Do just one room in the first session. A single success changes how much they speak in every lesson after."),

sec("📖","Vocabulary — don't make them memorise, make them meet it again","Automatic review · Preview tab","student_vocab",
    "Words are not memorised — they are **met repeatedly**. The Mangoi word list brings a word back **just as the child is about to forget it**. Your job is simply to **get today's words into it**.",
    ["In the last minute of class, have them save **three words from today**.",
     "They can leave the meaning blank — **AI fills in the meaning and an example**.",
     "Ask them to check the **🔮 Preview tab** before the next lesson.",
     "When that word appears in class, point it out — **“You saved this yesterday!”**",
     "Let it flow into the review game — points for every correct answer."],
    ["**Three is enough.** Ask for ten and you will get none.",
     "A student who previewed **follows the lesson far better** that day.",
     "As the collection fills, their baby mango grows — that is what keeps them coming back."],
    None,
    "Make “three words today” a fixed end-of-class ritual. That is 60 words a month — enough for the child to feel it."),

sec("📝","Evaluations — 3 minutes that build parent trust","One line from you becomes the report","teacher_eval",
    "The evaluation is not paperwork. What you write here fills **the five axes of the monthly report** and **the weekly report** parents receive. In other words, **if you do not write it, the parent receives no evidence at all**.",
    ["Write it **immediately** after the lesson, while it is fresh.",
     "Always include **one thing done well and one next goal**.",
     "Score pronunciation, vocabulary, sentences, attitude and participation **honestly**.",
     "Note in the memo field **what to ask next lesson**.",
     "Read and refine the **AI draft comment** before it goes out."],
    ["**A consistent one-liner** beats an occasional essay for report quality.",
     "Axes with no evaluation **appear empty** on the parent's report.",
     "Writing the next goal also finishes your prep for the next lesson."],
    "Scoring more generously than reality feels kind, but parents eventually notice the gap and trust collapses. Be **accurate, and warm about it**.",
    "Build a two-sentence template (“did well: … / next goal: …”) and evaluations take one minute."),

sec("👪","Parents — send proof of growth every week","Weekly report · monthly report card","admin_parent_weekly",
    "Parents re-enrol based on **a feeling of progress, not a score**. Mangoi sends a weekly report covering **attendance, AI chats, judgment training, words conquered and pronunciation**, and a **pentagon report card** every two months. You are the person who fills them.",
    ["Encourage the student to use **AI Friend chat, judgment training and the word list**.",
     "Attendance and activity are what **make the report fill up**.",
     "Keep writing evaluations to fill **the five axes** of the report card.",
     "On an especially good day, leave **one specific line**."],
    ["The report contains **no invented numbers** — only what actually happened.",
     "Students who play games and use the word list get **much richer reports**.",
     "Parents read **your one line** before they read any number."],
    None,
    "When a consultation is booked, ask for the report link to be sent beforehand. A prepared parent makes a completely different conversation."),

sec("🧒","Age tactics — one approach does not fit all","Preschool · primary · teens","student_home",
    "**Teach a 7-year-old and a 15-year-old the same way and you will fail both.** Attention span, motivation and how they respond differ completely by age.",
    ["**Preschool (5–7)**: change activity every 3–4 min; songs, movement, colours; praise participation over correctness.",
     "**Lower primary (8–10)**: games and points are strongest; favour collecting over competing.",
     "**Upper primary (11–13)**: they follow you if you explain why; use peer topics (games, idols).",
     "**Teens (14+)**: no forced cheerfulness; connect to usefulness, exams, future; correct privately.",
     "All ages — **give the chance to speak first**."],
    ["Younger means **shorter activity cycles**; older means **explain the reason**.",
     "For teens, **embarrassment** is the biggest barrier. Make it feel safe.",
     "Temperament often matters more than age."],
    None,
    "Watch what they respond to over the first three lessons and write it in the evaluation. That becomes their personal manual."),

sec("🧩","The student who won't speak — the order that unlocks it","Start with closed questions","student_speechcoach",
    "A silent student is **not unwilling — they are afraid**. Afraid of being wrong, of sounding strange. Follow the order and most of them open up.",
    ["Start with **questions they can answer with a nod** — “Do you like pizza?”",
     "Move up to **choosing between two** — “Pizza or chicken?”",
     "Accept a **one-word answer** and echo it back as a sentence.",
     "Build success with **repeat-after-me**.",
     "Only then ask an **open question** — “What did you do?”"],
    ["Skip a step and they close again. Go **one step at a time**.",
     "**Do not correct pronunciation on the spot** — recasting it is enough.",
     "The **Escape game and voice coach** work especially well with these students."],
    "This can take weeks. Do not write “this child is just like that” in the evaluation after one or two attempts.",
    "Record the day they first spoke freely. For a parent, that story is the most moving thing you can give them."),

sec("⚡","Distraction & mixed levels — handling it live","Redirect, don't suppress","room_game",
    "Distraction is **surplus energy**; a level gap is **a difference in pace**. Suppress either and it grows; redirect it and it becomes a resource.",
    ["When they lose focus, **change the activity instead of scolding** — game or whiteboard, immediately.",
     "Get them moving — gestures, hands up, drawing on screen.",
     "**Give them a role** — “You be the teacher. Ask me!”",
     "Give the advanced student **one harder task** on the side.",
     "For a slower student, **reduce the amount and increase the wins**."],
    ["Forcing a **static activity** on a restless child collapses the whole lesson.",
     "A bored advanced student **turns into a behaviour problem** — prepare an extra task.",
     "A slower student needs **small successes**, not more time."],
    "In group lessons, managing the level gap matters even more. Do not spend too long on one child.",
    "Restless children love the whiteboard. Let them draw and engagement jumps."),

sec("🌐","When the connection wobbles — protect the lesson","Never dropping is the first priority","room_base",
    "Mangoi's **first principle is that a lesson must not drop**. Even if quality falls or the picture freezes, **the lesson continues**. Staying calm is itself a skill.",
    ["If quality drops, the system **lowers the video quality automatically** — carry on.",
     "If it gets much worse, it switches to **audio-only mode**. The voice survives.",
     "If the other side freezes, **wait a moment** — automatic recovery runs.",
     "If it still fails, **refresh once** and re-enter.",
     "If the lesson genuinely stops, **tell an admin straight away**."],
    ["Even with no picture, **a speaking lesson can continue**.",
     "**Say what is happening** so the child does not get anxious.",
     "Lost time is **made up as a replacement lesson** once reported."],
    "Never end a lesson yourself because of a connection problem. The system distinguishes a brief drop from someone leaving.",
    "Make a pre-class camera and mic check a habit and half of these incidents disappear."),

sec("📈","Your own growth — turning feedback into an asset","AI coaching · star ratings","teacher_aicoach",
    "After each lesson **AI drafts a coaching note**, and **star ratings and one-line feedback** from students and parents accumulate. This is not an assessment — it is **material for your next lesson**.",
    ["Read the **AI coaching comment** after class.",
     "Look for what **repeats** in the ratings and feedback tags.",
     "Change **exactly one thing** in the next lesson.",
     "Record the result in the evaluation.",
     "**Share** what worked with other teachers."],
    ["Do not try to fix everything — **one change per lesson** is enough.",
     "**Repeated** feedback is the real signal; one-offs can be let go.",
     "Your growth record also supports pay reviews and renewals."],
    "The AI coaching draft is a reference. Read it and adjust it yourself before acting on it.",
    "Set one goal a month. “This month: wait five seconds” is a complete goal."),
]

for _i, _s in enumerate(SECTIONS, 1):
    _s["no"] = _i


MANUALS = {"train": {
    "intro": {
        "title": "What is this manual for?",
        "body": ("The Mangoi Teacher Training Manual is about **getting children to speak**. "
                 "It is not a guide to the website — it is a guide to **the skills that make a lesson work**. "
                 "Nothing here is theory; every item is something that repeatedly worked in real video lessons.\n\n"
                 "There is one central idea — **the more a child speaks, the faster they improve.** "
                 "Every technique in this manual exists to serve that one thing."),
        "points": [("🔥","Energy","The first 60 seconds set the temperature of the whole lesson."),
                   ("🗣","Talk time","Aim for 70% student, 30% teacher."),
                   ("⭐","Visible progress","They keep going when they can see it."),
                   ("🎯","Personalisation","Remember one thing about this child."),
                   ("🎵","Rhythm","Never run one activity past 7 minutes."),
                   ("📝","Records","One line in the evaluation becomes parent trust.")],
    },
    "sections": SECTIONS,
    "feature_table": {
        "title": "🧰 Teaching Skills Summary",
        "head": ["Skill","What it does","When to use it","Expected effect"],
        "rows": [
            ["Building energy","Greeting, expression, reaction in the first 60s","Every lesson start","Sets the mood for the whole lesson"],
            ["Waiting 5 seconds","Holding the silence after a question","Every question","More student talk time"],
            ["Praise basket","Making good moments visible","3+ times per lesson","Sustained motivation"],
            ["AI warm-up","Loosening the mouth first","First 3 minutes","Removes early silence"],
            ["Learning games","Review through play","Last 5 minutes","Repetition plus points"],
            ["Escape game","A room that needs speech","Reluctant speakers","Forced output, success experience"],
            ["Three words","Saving today's words","Last minute of class","Feeds automatic review"],
            ["Two-line evaluation","One win, one next goal","Right after class","Evidence for reports"],
            ["Age tactics","Matching delivery to age","At assignment","Prevents drop-off"],
            ["Reviewing AI coaching","One change from feedback","Weekly","Teacher growth"],
        ],
    },
    "charts": {
        "talk": {"title":"Talk time in a lesson — target","labels":["Student talk","Teacher talk"],
                 "values":[70,30],"colors":["#00B85C","#0B5FFF"]},
        "focus": {"title":"Attention per activity by age (minutes)","labels":["Age 5–7","Age 8–10","Age 11–13","Age 14+"],
                  "values":[4,6,8,10],"colors":["#FF9500","#0B5FFF","#00B85C","#7C3AED"]},
        "rhythm": {"title":"Structure of a 25-minute lesson (minutes)","labels":["Warm-up","Core","Speaking","Game","Close"],
                   "values":[3,7,7,5,3],"colors":["#FF9500","#0B5FFF","#00B85C","#7C3AED","#F03E3E"]},
    },
    "faq": [
        ("My student keeps speaking Korean.","Do not scold — **lower the question until they can answer in English.** Start with a two-way choice (“Pizza or chicken?”), then one word, then a sentence. Making English easy works far faster than banning Korean."),
        ("They keep mispronouncing. Should I correct every time?","Correct **one thing per lesson**. For the rest, recasting the sentence correctly is enough. Constant correction makes them stop speaking."),
        ("How much game time is appropriate?","About **5 minutes** in a 25-minute lesson. But a game with no stated purpose is just playtime — always tie it to today's expressions and say the goal first."),
        ("Do I really have to write an evaluation every time?","Yes. Without it, **the axes of the parent's report card look empty.** It does not need to be long — “one win + one next goal” is enough."),
        ("The student is too distracted to continue.","Instead of scolding, **change the activity immediately.** Drawing on the whiteboard or giving them a role usually brings them back. Distraction is surplus energy; it only needs redirecting."),
        ("The connection dropped and we lost the lesson.","Do not end it yourself — **tell an admin right away.** Lost time is verified and made up as a replacement lesson. The system distinguishes a brief drop from leaving."),
        ("Where do I register work hours, breaks and leave?","Use the **shortcut on the Teachers screen**. The earlier you register leave, the more reliably it is reflected in assignments."),
        ("I have no lesson today, so I cannot see the screens.","Ask an admin to **create a sample lesson**. It is created on the demo student account, so no real student data is affected."),
    ],
    "checklist": {
        "title": "Every-Lesson Checklist",
        "items": [
            "Did you skim the last evaluation for 30 seconds?",
            "Did you check your camera and microphone beforehand?",
            "Did you greet them by name in the first 60 seconds?",
            "Did you wait five seconds after asking a question?",
            "Did you give at least three specific compliments?",
            "Did you avoid running one activity past 7 minutes?",
            "Did they save three of today's words to their list?",
            "Did you close with a preview of next time?",
            "Did you write the evaluation right after class?",
            "Have you read this week's AI coaching feedback?",
        ],
    },
    "conclusion": {
        "title": "You are the curriculum",
        "lead": ("Good materials and a good system still do not make a child speak — you do. "
                 "Do not try to apply every technique in this manual at once. **One thing per lesson is enough.**"),
        "flow": [
            ("Before class", "Check the last evaluation · test camera & mic · prepare one personal topic"),
            ("First 3 minutes", "Greet by name · AI warm-up to get the mouth moving"),
            ("Main lesson", "Wait five seconds after questions · change activity every 7 minutes"),
            ("Last 5 minutes", "Review game · praise basket · save three words"),
            ("Right after", "Two-line evaluation · note what to ask next time"),
        ],
        "principles": [
            "**Let them speak more** — the less you talk, the faster they improve.",
            "**Make praise visible** — spoken praise vanishes; praise that stacks up stays.",
            "**Remember one thing** — “this teacher knows me” changes their attitude.",
            "**Keep the rhythm** — if they look bored, change the activity, not the explanation.",
            "**Leave a record** — one line in the evaluation becomes parent trust.",
        ],
        "remember": [
            "Wait **five seconds** after a question. That is where their first sentence comes from.",
            "Three **specific** compliments beat thirty “Good job”s.",
            "For silent students, start with the **Escape game** and **closed questions**.",
            "Never end a lesson yourself over a connection problem — **tell an admin**.",
            "Choose **one thing to change** each month.",
        ],
        "closing": ("If one child said their first full sentence today, that lesson was a success. "
                    "Those sentences add up to fluency, and those records add up to parent trust. "
                    "One lesson of yours changes one child's English. Thank you for today! 🥭"),
    },
}}
