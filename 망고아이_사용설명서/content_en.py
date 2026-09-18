# -*- coding: utf-8 -*-
"""Mangoi User Guide — English content model (Student / Admin / Teacher).
Mirrors content.py structure so the same generators produce the English editions."""

SITE = "www.mangoi.co.kr"
ADMIN_SITE = "admin.mangoi.co.kr"

OUT_SUFFIX = "_en"
FILENAMES = {
    "student": "Mangoi_Student_User_Guide",
    "admin":   "Mangoi_Admin_User_Guide",
    "teacher": "Mangoi_Teacher_User_Guide",
    "branch":  "Mangoi_Branch_User_Guide",
    "agency":  "Mangoi_Agency_User_Guide",
}
UI = {"section":"How to Use the Main Features","intro":"Introduction",
      "toc":"Contents","toc_title":"📑 Contents","toc_page":"p.","toc_slide":"slide",
      "summary":"Feature Summary · Data","faqpage":"FAQ · Checklist",
      "howto":"How to use","point":"✅ Key Points","note":"Good to know","tip":"💡 Tip",
      "faq":"❓ Frequently Asked Questions (FAQ)","data":"📊 Data at a Glance",
      "closing":"Let's grow together with Mangoi!",
      "closing_sub":"Questions? Ask the on-site A.i assistant or contact customer support.",
      "guide_of":"User Guide","target":"For","docuse":"How to use this file",
      "sheet_index":"Feature Index","sheet_steps":"Step-by-Step","sheet_check":"Checklist",
      "sheet_faq":"FAQ","sheet_data":"Data & Charts","sheet_cover":"Cover",
      "xls_index_title":"📇 {label} Feature Index",
      "xls_index_head":["No.","Icon","Feature","What does it do? (key steps)","Tip"],
      "xls_steps_title":"🧭 Follow Along, Screen by Screen","xls_step":"Step","xls_do":"What to do",
      "xls_check_title":"✅ {title}","xls_check_head":["✔","Item","Done"],
      "xls_faq_title":"❓ Frequently Asked Questions","xls_faq_head":["Question (Q)","Answer (A)"],
      "xls_data_title":"📊 Data & Charts","xls_item":"Item","xls_value":"Value",
      "concl_page":"Conclusion","concl_flow":"🔄 The Flow at a Glance","concl_principles":"⭐ Key Principles",
      "concl_remember":"📌 Remember",
      "xls_docuse":("How to use this file\n\n"
                    "• [Feature Index] sheet: every feature at a glance\n"
                    "• [Step-by-Step] sheet: follow along screen by screen\n"
                    "• [Checklist] sheet: print and use\n"
                    "• [FAQ] sheet: frequently asked questions\n"
                    "• [Data & Charts] sheet: statistics graphs")}

BRAND = {"name":"Mangoi","en":"MANGOI","tagline":"Live 1:1 Video English + AI Learning",
         "mango":"#FF9F1C","mango_dark":"#E8630A","ink":"#1E2340"}

THEMES = {
    "student": {"label":"Student","en":"STUDENT GUIDE","emoji":"🎒",
        "primary":"#7C3AED","primary2":"#4F46E5","accent":"#FF9F1C",
        "soft":"#F3F0FF","chip":"#EDE9FE","grad":("#7C3AED","#4F46E5"),
        "who":"Students learning with Mangoi"},
    "admin": {"label":"Admin","en":"ADMIN GUIDE","emoji":"🏫",
        "primary":"#4F46E5","primary2":"#0EA5E9","accent":"#FF9F1C",
        "soft":"#EEF2FF","chip":"#E0E7FF","grad":("#3730A3","#0EA5E9"),
        "who":"Academy directors · HQ · operations managers"},
    "teacher": {"label":"Teacher","en":"TEACHER GUIDE","emoji":"🏫",
        "primary":"#EA580C","primary2":"#059669","accent":"#FFB020",
        "soft":"#FFF4E6","chip":"#FFE8CC","grad":("#EA580C","#F59E0B"),
        "who":"Native-speaker teachers and Korean instructors"},
    "branch": {"label":"Branch","en":"BRANCH GUIDE","emoji":"🏢",
        "primary":"#0D9488","primary2":"#0EA5E9","accent":"#F59E0B",
        "soft":"#ECFDF5","chip":"#CCFBF1","grad":("#0F766E","#0EA5E9"),
        "who":"Regional branch operators"},
    "agency": {"label":"Agency","en":"AGENCY GUIDE","emoji":"🤝",
        "primary":"#E11D48","primary2":"#F59E0B","accent":"#0EA5E9",
        "soft":"#FFF1F2","chip":"#FFE4E6","grad":("#BE123C","#F59E0B"),
        "who":"Agency (franchise) operators"},
}

CLASS_IMGS = [("class_video","Video tab"), ("class_materials","Materials tab"),
              ("class_whiteboard","Board tab"), ("class_chat","Chat sidebar")]


def build_classroom(aud):
    """Detailed, button-by-button walkthrough of the live classroom (lesson screen)."""
    full = [
        {"icon":"🖥️","title":"The Classroom at a Glance","sub":"What does the lesson screen look like?","img":"room_base",
         "desc":"When you enter a lesson, the screen has three main areas: ① the top bar (room info, timer, language, dark mode), ② the large center workspace (where the board, materials, video, etc. open), and ③ the bottom control dock (camera, chat, leave). Your face video and the praise basket sit in a small window at the top-left.",
         "steps":[
            "**Top-left**: `Room: mangoi-class · Users: 2` — the room name and how many people are connected.",
            "**Top-right**: ⏰ **Timer** (lesson time), 🔴 **REC** (recording indicator), 🌐 **EN** (switch language), 🌙 **Dark** (dark screen).",
            "**Center**: the tool you pick from the top tabs (board, materials, video…) opens here.",
            "**Bottom-center**: the control dock — camera, screen share, chat and leave buttons.",
            "**Small window, top-left**: your face video and the 🧺 **praise basket** (how many praises you received)."],
         "points":[
            "Hover over a button to see its name (tooltip).",
            "If text looks Korean, press EN at the top-right to switch language.",
            "If the screen is too bright, switch to 🌙 Dark."],
         "tip":"It looks like a lot of buttons at first, but the four you use most are board, materials, camera and chat."},

        {"icon":"🗂️","title":"Switching the 6 Top Tabs","sub":"Board · Video · Games · Background · AI Warm-up · Review Quiz","img":"room_whiteboard",
         "desc":"At the top of the center workspace there are six tab buttons. Click one to switch to that tool. The active tab is highlighted.",
         "steps":[
            "🖊 **Board**: a whiteboard for writing and drawing while explaining.",
            "📹 **Video**: watch a YouTube link or a video file together.",
            "🎮 **Games**: open learning games during class (may be limited during lesson time).",
            "🎨 **Background**: change the backdrop behind your video and decorate your face.",
            "🗣️ **AI Warm-up**: an English warm-up before the lesson.",
            "🧠 **Review Quiz**: an AI-made quiz matched to this lesson's textbook and level."],
         "points":[
            "Your face video stays visible even after switching tabs.",
            "At the far right of the tabs there are also 📚 Materials Tools ▾ and ✍️ Writing Tools ▾."],
         "tip":"Lessons mostly use the 🖊 Board and 📚 Materials the most."},

        {"icon":"🖊️","title":"Board Tools, One by One","sub":"Pen · eraser · shapes · text · save","img":"room_whiteboard",
         "desc":"Open the 🖊 Board tab and a row of drawing tools appears at the top. Let's go through each button from left to right.",
         "steps":[
            "✏️ **Pen**: draw freely. / 🧽 **Eraser**: erase what you drew.",
            "📏 **Line** / ⬜ **Rectangle** / ⭕ **Circle**: draw straight lines and shapes.",
            "📝 **Text**: type letters with the keyboard.",
            "🎨 **Color** (color box): pick the pen color. / **Thickness** (slider): adjust line width.",
            "✨ **AI Shapes**: even rough drawings snap into neat shapes automatically.",
            "✍️ **AI Text**: recognizes handwriting and turns it into clean typed text.",
            "🗑️ **Clear All**: wipe the whole board. / 💾 **Save**: save the board as an image."],
         "points":[
            "Change color and thickness to highlight key parts so they stick.",
            "AI Shapes / AI Text auto-tidy when turned on (experimental)."],
         "note":"Pressing Save (💾) downloads the current board as an image you can use for review.",
         "tip":"Save (💾) the board before class ends to keep exactly what you learned today."},

        {"icon":"📚","title":"Materials Tools (share PDF/photos)","sub":"Upload · library · turn pages","img":"room_materials_dock",
         "desc":"Click 📚 **Materials Tools ▾** at the right of the tabs and a menu drops down. This is where you upload textbooks (PDF/photos) to view together.",
         "steps":[
            "📁 **Upload (PDF/JPG/PNG)**: upload a textbook file from your device to share.",
            "📚 **Library**: pick from textbooks the academy (admin) uploaded.",
            "⬇ **Download**: download the file you're currently viewing.",
            "◀ **Prev** / **Next** ▶: turn textbook pages.",
            "🔲 **Fit** / **100%** / **1:1**: fit the page to the screen or view at real size.",
            "⏹ **Stop sharing**: end textbook sharing."],
         "points":[
            "The moment you upload, the other person sees the exact same page.",
            "Not only PDFs — JPG and PNG photos work too."],
         "tip":"Upload the textbook before class for a smooth start."},

        {"icon":"✍️","title":"Writing Tools (annotate on top)","sub":"Pen · highlighter · text · undo","img":"room_write_dock",
         "desc":"Click ✍️ **Writing Tools ▾** at the right of the tabs and the writing menu drops down. Use it to write directly on top of a textbook or the screen.",
         "steps":[
            "🖊 **Pen**: write freely on the screen. / 🖍 **Highlighter**: brightly mark important spots.",
            "🧽 **Eraser**: erase your writing. / 📝 **Text**: type letters.",
            "✨ **AI Shapes**: tidy your drawn shapes.",
            "**Thickness** (slider): adjust the pen width.",
            "↩ **Undo**: cancel your last mark. / 🗑 **Clear**: erase all writing."],
         "points":[
            "With a textbook open, your writing appears right on top of it.",
            "Highlight key words to make them stand out."],
         "tip":"Made a mistake? One tap on ↩ Undo cleans it up."},

        {"icon":"📹","title":"Watch Video Together","sub":"Share YouTube · video files","img":"room_video",
         "desc":"In the 📹 **Video** tab you can paste a YouTube link or upload a video file to watch together — great for songs and video materials.",
         "steps":[
            "Paste a **YouTube link (URL)** into the box, or **upload a video file**.",
            "Press ▶ **Play URL** / **Play** to start the video.",
            "Use **New video** to switch to a different one."],
         "points":[
            "The video plays on the other person's screen too.",
            "For sound-heavy material, earphones help you hear better."],
         "tip":"Prepare the video link in advance so you can play it instantly in class."},

        {"icon":"🎨","title":"Background & Face Decorations","sub":"Change backdrop · masks · accessories","img":"room_bg",
         "desc":"In the 🎨 **Background** tab you can change the backdrop behind your face and add fun decorations. Just click what you want in the grid.",
         "steps":[
            "In the **background grid**, tap a backdrop (space, desert, forest, cherry blossom, beach, pyramids…).",
            "Tap **Background off** to return to your normal camera view.",
            "Below, in **Face Decorations (masks/accessories)**, pick glasses, hats, animals and more.",
            "Don't like it? Tap again to turn it off."],
         "points":[
            "Changing the background keeps your face visible.",
            "Very flashy decorations can distract from the lesson."],
         "tip":"Use a clean background for class and fun decorations for break time."},

        {"icon":"🔲","title":"Resize & Arrange the Screen","sub":"1/4 · 1/2 · 3/4 · Full · PIP · Solo · Free","img":"room_layout_full",
         "desc":"The size bar above the video lets you change the size and layout of your face-video window. The current size is shown in blue.",
         "steps":[
            "**1/4 · 1/2 · 3/4 · Full**: make the video window 1/4 up to full-screen.",
            "📌 **PIP**: float the video as a small overlay on top of the board/materials.",
            "👤 **Solo**: hide others and see only your own screen larger.",
            "⤡ **Free**: drag the title bar to move it, drag the bottom-right corner to resize freely."],
         "points":[
            "Make the video small (1/4) when reading materials, large (Full) when presenting.",
            "📌 PIP is great when you want to see the textbook and faces at once."],
         "tip":"On a small screen, shrink the video to 1/4 and view the textbook large."},

        {"icon":"🌟","title":"Praise Points During Class","sub":"Teacher gives → +1P in student's basket","img":"class_praise",
         "desc":"When you do well, the teacher can give praise points on the spot. When the teacher taps the 🌟 'Praise' star button on your video, that student instantly gets +1P, and it piles up in real time in the 🧺 point basket on the student's screen.",
         "steps":[
            "**Teacher**: tap the **🌟 'Praise' button at the top-left** of a student's video → that student gets **+1P**. (the count builds up next to the star)",
            "With several students, you can also pick a student from the **'Give Praise' bar**.",
            "**Student**: **+1P flies into** the **🧺 point basket at the top-left** of your screen in real time.",
            "**When class ends**, the student leaves a **star rating** to get an extra **+10P**.",
            "Collected points are spent as rewards in the **point shop, roulette**, etc."],
         "points":[
            "The more praise you get, the faster points pile up.",
            "The praise star has an anti-spam cooldown, so it may briefly turn gray.",
            "The basket shows points earned this class; your total P (top bar) is the running sum."],
         "note":"Praise points are given by the teacher — students can't add them by themselves.",
         "tip":"Teachers: praise 🌟 the moment a student does well — instant rewards motivate best."},

        {"icon":"🎛️","title":"Bottom Dock & Praise Basket","sub":"Camera · screen share · chat · leave · praise","img":"room_base",
         "desc":"The control dock at the bottom-center holds the buttons you use most during class. Let's also look at the small 🧺 praise basket at the top-left.",
         "steps":[
            "⚙️ **Settings**: pick camera/mic devices and check their status.",
            "📷 **Camera** / 🎤 **Mic**: turn your face and sound on/off.",
            "🖥️ **Screen Share**: show your computer screen to the other person.",
            "💬 **Chat**: talk in text (great for words and links).",
            "🗣️ **Native**: call the native-speaker helper / interpreter feature.",
            "🚪 **Leave**: end the lesson and exit the room.",
            "🧺 **Praise Basket** (top-left): the praise (stars/stickers) you receive during class collects here."],
         "points":[
            "Before leaving (🚪), make sure you saved the board / notes.",
            "No sound? Check the mic/speaker devices in ⚙️ Settings."],
         "note":"Screen share asks the browser which window to share — pick the screen and allow it.",
         "tip":"When your praise basket fills up, it means you're doing great!"},
    ]
    if aud == "admin":
        return [
            {"icon":"🖥️","title":"Understand the Classroom Layout","sub":"Screen structure for support","img":"room_base",
             "desc":"Admins don't teach, but knowing the classroom layout makes support easy. It has a top bar (room info, timer, REC, EN, dark), a center workspace (tab tools), and a bottom control dock (camera, screen share, chat, leave).",
             "steps":[
                "**Top bar**: room name · user count · timer · recording (REC) · language (EN) · dark mode.",
                "**Center tabs**: Board · Video · Games · Background · AI Warm-up · Review Quiz + Materials Tools · Writing Tools.",
                "**Bottom dock**: Settings · Camera · Screen Share · Chat · Native · Leave.",
                "The 🧺 **praise basket** at the top-left collects praise during class."],
             "points":[
                "For 'no sound/video' tickets, tell users to check the dock's camera/mic and ⚙️ Settings.",
                "The REC indicator shows whether a lesson is being recorded."],
             "tip":"Turn common classroom questions into an FAQ with these screenshots."},
            {"icon":"🧰","title":"Understand the Classroom Tools","sub":"Board · materials · background · video","imgs":[("room_whiteboard","Board"),("room_materials_dock","Materials Tools"),("room_bg","Background"),("room_video","Video")],
             "desc":"Knowing the tools students and teachers use makes guidance easier. The core ones are the board (draw/save), materials tools (upload PDF/photos, library), background (backdrop & face decorations), and video (YouTube/file).",
             "steps":[
                "🖊 **Board**: pen, shapes, text, AI shapes, save.",
                "📚 **Materials Tools**: upload (PDF/JPG/PNG), library, page turning, fit-to-screen.",
                "🎨 **Background**: change backdrop, decorate face.",
                "📹 **Video**: share YouTube links / video files."],
             "points":[
                "The materials 'Library' shows textbooks the admin uploaded — it ties into content management.",
                "Coach teachers on the 'pre-upload materials → share in class' flow."],
             "tip":"A well-stocked textbook library helps teachers prep faster."},
            {"icon":"🌟","title":"In-class Praise Points (give & accrue)","sub":"Teacher gives → adds to student points","img":"class_praise",
             "desc":"During class the teacher instantly gives praise points (+1P) to students, and a post-class star rating adds +10P. These sum into the student's total points and are spent in the point shop, roulette, etc. Admins manage the points policy and shop.",
             "steps":[
                "The **teacher** gives **+1P** instantly via the 🌟 praise button on a student's video.",
                "It accrues in real time in the student's 🧺 point basket and sums into their total (P).",
                "A **post-class star rating** gives the student an extra **+10P**.",
                "Accrued points connect to rewards in the **point shop / roulette**.",
                "Admins manage accrual/usage policy under **Accounting/Points**."],
             "points":[
                "Instant rewards help participation and re-enrollment.",
                "Shaping shop rewards lets you tune learning motivation."],
             "note":"Praise points are given by the teacher; the points policy and shop are the admin's job.",
             "tip":"Periodically check that points flow well (given & spent) to manage motivation."},
        ]
    return full


# ── Recent new features (shared section builders) ──
def sec_worldclock(aud):
    desc = {
        "student":"A small clock on screen shows 🇰🇷 Korea time and 🇵🇭 Philippines time together. Our native teachers are in the Philippines, so seeing both times keeps you from mixing up lesson times.",
        "teacher":"A clock on screen shows 🇰🇷 Korea time and 🇵🇭 Philippines (local) time together. Students use Korea time, you use Philippines time — seeing both lets you match lesson times exactly.",
    }.get(aud, "A clock on screen shows 🇰🇷 Korea and 🇵🇭 Philippines time together. It lets you check the time difference instantly when coordinating lessons between Philippine teachers and Korean students.")
    return {"icon":"🕐","title":"Korea·Philippines Dual Clock","sub":"Two countries' time on screen","img":"world_clock",
        "desc":desc,
        "steps":[
            "On the on-screen **dual clock**, see 🇰🇷 Korea and 🇵🇭 Philippines time at once.",
            "**Drag** the clock to move it anywhere you like.",
            "**Tap (click)** the clock to go to the home screen."],
        "points":[
            "The Philippines is **1 hour behind** Korea (−1 hour).",
            "You can check booking/entry times in both countries' time."],
        "tip":"When a lesson time is confusing due to the time difference, this clock clears it up instantly."}

def sec_cncoach(aud):
    desc = {
        "student":"You can get coaching not just in English but in **Chinese pronunciation** too! Read sentences along the 'Darakwon Chinese Master' textbook (Lv 1–20) and the AI recognizes your voice and compares it to a native speaker. Characters and pinyin (pronunciation) appear together.",
        "teacher":"If a student also learns Chinese, guide them to the **Chinese pronunciation coach**. They read Darakwon Chinese Master (Lv 1–20) sentences and compare with a native speaker to fix pronunciation and tones.",
    }.get(aud, "Mangoi offers not only English but also a **Chinese course**. With a Darakwon Chinese Master (Lv 1–20) pronunciation coach (characters+pinyin, AI voice recognition, native comparison), you can attract and manage students who want Chinese.")
    return {"icon":"🇨🇳","title":"Chinese Pronunciation Coach","sub":"Darakwon Chinese Master Lv1–20","img":"student_speechcoach_cn",
        "desc":desc,
        "steps":[
            "In the AI voice coach, pick the **CN Chinese** level (or go to the Chinese pronunciation coach).",
            "Choose a **Master series (1–6, HSK 1–6)** and a unit.",
            "Read the sentence (**characters + pinyin**) and compare with **'Play native audio'**.",
            "Practice hard sounds/tones with **repeat and slow (0.85x)**."],
        "points":[
            "Characters and pinyin appear together, so it's easy to read.",
            "The AI recognizes your voice and compares it to a native speaker.",
            "The learning games hub supports Chinese too."],
        "tip":"Listen slowly and repeat clearly to nail the four tones."}

def sec_praise_op(aud):
    scope = "branch" if aud == "branch" else "agency"
    return {"icon":"🌟","title":"In-class Praise Points (understand & use)","sub":"Linked to motivation·re-enrollment","img":"class_praise",
        "desc":f"During class the teacher gives 🌟 praise points (+1P) to students on the spot, and an end-of-class rating (+10P) adds up into the student's total points. Points lead to shop/gift rewards, helping motivation and re-enrollment. Your {scope} understands and uses this flow for performance.",
        "steps":[
            "The **teacher** gives **+1P** via the 🌟 praise button on a student's video during class.",
            "It accrues live in the student's 🧺 point basket and sums into their total.",
            "A **post-class star rating** gives the student an extra **+10P**.",
            "Points connect to **shop/roulette/gift** rewards."],
        "points":[
            "Instant rewards boost participation and re-enrollment.",
            f"Use your {scope} students' points/reward response as a performance signal."],
        "note":"Teachers give praise points; HQ (admin) configures the shop/reward/gift policy.",
        "tip":"Classes (teachers) where praise points flow well tend to have higher re-enrollment."}


# ── 2026-07 new features (added after the last build) ──

def sec_voicediary(aud):
    return {"icon":"📔","title":"AI Voice Diary","sub":"Speak about your day in English and AI corrects it","img":"student_voicediary",
        "desc":"**Say what happened today in English**, and AI transcribes your speech, **polishes** the sentences, and leaves a **score and encouragement**. A little every day builds your own English diary!",
        "steps":[
            "On the home menu, tap the **📔 AI Voice Diary** card (next to the English/Chinese pronunciation coach).",
            "In the **🎤 Record** tab, press **‘Start recording’** and talk about your day in English (about 30 seconds is plenty!).",
            "Press **‘Stop’** and AI automatically does **transcribe → correct → score & encourage**.",
            "The **📅 Calendar** tab lets you revisit past entries by date."],
        "points":[
            "Turns your spoken English **into text** and rewrites awkward sentences naturally.",
            "A **score (0–100) and a word of encouragement** keep you motivated daily.",
            "Doing it daily also connects to **attendance streaks and badges**."],
        "note":"Recording requires you to be logged in. Speaking clearly in a quiet place makes the transcription more accurate.",
        "tip":"It doesn't have to be perfect. The habit of saying even ‘one sentence’ a day matters most!"}

def sec_flowconnector(aud):
    return {"icon":"🚀","title":"Where to next? (Learning-flow guide)","sub":"Finish one activity and get the next one suggested","img":"student_flow",
        "desc":"**When you finish an activity** — warm-up, game, class, review, pronunciation — a **‘🚀 Where would you like to go next?’** menu pops up. No need to hunt for menus again; just follow the **recommended (⭐)** item to flow into your next activity.",
        "steps":[
            "**Fully complete** a warm-up, student game, review quiz, class, or step-by-step pronunciation.",
            "Look for the **‘🚀 Choose next activity’** button (or the menu that appears automatically).",
            "Pick from **Enter Class · AI Warm-up · Review Quiz · Student Games · Replay Recording · Pronunciation**, etc.",
            "The **recommended (⭐)** item is a good next step for right now."],
        "points":[
            "Suggested flow: **Warm-up → Game → Class → Review → Pronunciation → Game**, naturally connected.",
            "Choosing **‘Replay Recording’** instantly replays your last class video.",
            "Even without playing a game/quiz, the list screen's **‘🚀 Go next’** button opens the menu."],
        "tip":"When you're unsure what to do, open this menu to keep today's study flowing smoothly."}

def sec_aiavatar(aud):
    return {"icon":"🤖","title":"Ask the A.i Assistant","sub":"The consultant avatar at the bottom-right","img":"student_aiavatar",
        "desc":"Tap the **‘A.i Assistant’** at the **bottom-right** of the screen to ask anything, anytime. It explains how to use features and where they are, and can **take you straight to the right menu**.",
        "steps":[
            "Tap the **A.i Assistant** icon at the **bottom-right** of the home screen.",
            "Type your **question** freely (e.g. “Where do I take the review quiz?”).",
            "The assistant **answers** and guides you to the **right menu**.",
            "You can also **speak** your question using the 🎤 mic."],
        "points":[
            "Points you **straight to features** like student games, pronunciation coach, or voice diary.",
            "Available anytime (nights & weekends too) so you can use everything **on your own**."],
        "note":"Requests that need a human — billing, operations — are routed to KakaoTalk chat or customer support.",
        "tip":"Say what you want to do, like “I want to ○○,” and it takes you to that screen."}

def sec_noticestudio(aud):
    scope = {"branch":"your branch","agency":"your agency"}.get(aud, "your academy")
    return {"icon":"📢","title":"Notice Studio (Poster + Popup)","sub":"Design notice/event posters and push them as app popups","img":"admin_noticestudio",
        "desc":f"This **merges the old ‘Poster Maker’ and ‘Popup Notice’ tools into one place**. In the **①Create** tab you design a notice/event poster, then hand it straight to the **②Publish·Popup** tab to show it as a **popup** in {scope}'s student app.",
        "steps":[
            "Go to the admin menu **Notification Center → 📢 Notice Studio**.",
            "In the **①Create** tab, design a poster with text, images, and video (resize · save on server · reuse).",
            "Press **‘📢 Publish as popup’** on the finished poster to auto-switch to the **②Publish·Popup** tab.",
            "In the publish tab, set the **display period / stop** and publish it as a student-app popup."],
        "points":[
            "Poster creation and popup publishing flow through **one screen, two tabs** — no more confusion.",
            "Posters you make can be **saved and reused**.",
            "Whichever route you enter from — AI assistant or sidebar search — the **correct tab opens**."],
        "note":"Existing posters/popups are preserved (it was only merged, nothing was deleted).",
        "tip":"Promoting an event takes just one flow: ‘Create → Publish as popup’ right away."}

def sec_aicommand(aud):
    return {"icon":"🤖","title":"Command the AI Operations Assistant","sub":"Navigate with one phrase: “Take me to ○○”","img":"admin_aicommand",
        "desc":"Type what you want to do into the **top search bar (or the bottom-right AI assistant)** in plain language, and the AI understands and **jumps straight to that screen**. It now reliably follows navigation commands like **‘Take me to teacher ○○'s schedule’** or **‘Open auto-scheduling’**.",
        "steps":[
            "Type a command in the top **search bar** or speak with the 🎤 mic.",
            "e.g. **“Take me to teacher Kim Minji's schedule”** → auto-finds that teacher in the weekly schedule and opens it.",
            "e.g. **“Open auto-scheduling,” “Go to settlement”** to navigate menus.",
            "Press **‘Go now →’** on the AI response card to move to that screen."],
        "points":[
            "Navigation commands **actually navigate** — far fewer ‘explain only, do nothing’ replies.",
            "Searching a schedule by teacher name **auto-fills the search box + filters + scrolls**.",
            "For data/statistics questions it also helps with **card-style answers**."],
        "note":"Commands that actually change things — ‘register · send · modify’ — ask for one more confirmation (a safety guard).",
        "tip":"When you can't recall a menu name, just say what you want to do — it finds its way there."}

def sec_diarymonitor(aud):
    return {"icon":"📔","title":"Student Voice-Diary Monitor","sub":"View each student's English diary · AI correction · score","img":"admin_voicediary",
        "desc":"View the **AI voice diaries** students leave, right from the admin screen. Per student, check the **transcript · AI correction · encouragement · score** by month to encourage consistent writers and gauge their learning.",
        "steps":[
            "Open the **📔 Voice Diary (monitor)** card in the admin menu.",
            "Enter the **student UID, pick the month** to look up, and press **‘Search’**.",
            "Open an entry from the list to see the **transcript · correction · encouragement · score**."],
        "points":[
            "It only shows up **once a student actually writes** a diary (the entry point is the 📔 card on the student home).",
            "Find consistent writers and connect them to **praise/rewards** to lock in the habit."],
        "tip":"‘Nothing shows up’ usually just means that student hasn't left a diary yet."}

def sec_teachercoach(aud):
    if aud == "admin":
        return {"icon":"🤖","title":"Teacher AI-Coaching Review (Ops)","sub":"Collected per-class AI coaching · quality scores","img":"teacher_aicoach",
            "desc":"After every class, the AI leaves the teacher a **coaching card (strengths · areas to improve · a class-quality score)**. From the admin screen you can see these **gathered by most-recent**. Use it as a **growth-support / coaching-quality** tool — not surveillance.",
            "steps":[
                "Go to admin **🧲 Retention Center → 💼 Teacher Coaching** tab.",
                "In the **‘🤖 Per-class AI coaching (recent)’** section, review each teacher's latest coaching.",
                "Use each card's **quality score · talk ratio · improvement point** to plan coaching and training."],
            "points":[
                "See every teacher's recent coaching **at a glance**.",
                "Admins get a **monthly rollup** focus, so it's low-pressure."],
            "note":"Coaching text is for a teacher's personal growth. We recommend using it as a **support tool**, not for evaluation/discipline.",
            "tip":"For teachers whose quality score stays low, coach them together with the teacher training manual."}
    return {"icon":"🤖","title":"AI Coaching After Class","sub":"Strengths · areas to improve · one action for today","img":"teacher_aicoach",
        "desc":"When you finish and leave a class, the AI analyzes it and shows a coaching card with **‘What you did well / Areas to improve / One action for today’** in **both Korean and English**. Based on **real class signals** — talk ratio, engagement, praise count — it helps in a **warm coaching tone**, not surveillance.",
        "steps":[
            "End the video class with **‘Leave’** and the coaching card appears automatically.",
            "Toggle **🇰🇷 Korean / 🇺🇸 English** to read it in the language you prefer.",
            "Check the **engagement · talk-ratio · praise-count** summary and the **strengths · improvements · one action**.",
            "Press **‘Full report’** to see class details plus recent coaching history (quality score · summary)."],
        "points":[
            "**English is the default** for native-speaker teachers, with Korean provided alongside.",
            "A **class-quality score (0–100)** and a **detailed summary** help you find your own growth points.",
            "Even if the AI is briefly slow, **baseline coaching in both languages** is always provided."],
        "note":"Coaching is meant to support your own growth. Admins only receive a monthly rollup.",
        "tip":"Trying just the ‘one action for today’ in your next class visibly improves how you draw out student speech."}


# ── Mid-July 2026 new features (Jul 8–14 updates) ──

def sec_vc_comfort(aud):
    return {"icon":"🎛️","title":"New Classroom Comforts","sub":"Hide my face · teacher first · mobile tool dock","img":"room_base",
        "desc":"The lesson screen got more comfortable. A **🙈 button hides your own face** for a moment, the **teacher's face now appears first and large** when you enter, and on phones the bottom tools stay tucked away behind a **⋯ button** — so you can focus on the lesson itself.",
        "steps":[
            "Tap the **🙈 button** on your own tile to hide your face for a bit. Tap the **🙂 chip** to bring it back.",
            "When you enter, the **teacher's face is placed on top, large,** automatically — no hunting.",
            "On a **phone (portrait)**, the default screen is faces on top and the textbook below.",
            "The mobile bottom dock opens only when you tap **⋯**, keeping the screen roomy."],
        "points":[
            "Hiding your face doesn't turn the camera off — it only **hides it on screen**, so class continues.",
            "Rotate to landscape and it auto-arranges to **faces left · textbook right**."],
        "note":"Hide your face only for a moment when you're shy — lessons are much more fun with eye contact!",
        "tip":"If the screen feels cramped, fold the dock away with the ⋯ button."}

def sec_dm_chat(aud):
    who = "teacher" if aud == "student" else "student"
    return {"icon":"💬","title":"1:1 Private Chat & File Sharing","sub":f"Whisper messages only your {who} sees + share any file","img":"class_chat",
        "desc":f"Class chat now supports **1:1 private messages (DM)**. Send a message only a specific {who} can see, and share **any file — PDF, image, document —** through chat; it appears on the other side as a **download card**.",
        "steps":[
            "Open **💬 Chat** from the bottom dock.",
            f"Switch the recipient from **Everyone** to a **{who}'s name** to whisper 1:1.",
            "Use the **📎 file button** to upload a PDF, photo, or document — a download card appears for them.",
            "Received files are saved with the card's **⬇ Save** button."],
        "points":[
            "Private chats are visible **only to the two of you**.",
            "Homework files and notes get exchanged **in one step** during class."],
        "note":"Private chats are not stored on the server and disappear after class. Keep important things as files.",
        "tip":"Perfect for quietly asking a question without interrupting anyone else."}

def sec_home_theme(aud):
    return {"icon":"🌗","title":"Home Screen: Bright · Dark","sub":"Auto by time of day, or pick your own","img":"student_home",
        "desc":"The home screen now **switches automatically** — bright by day, dark at night. Or use the **Bright / Auto / Dark 3-way chip** to set the mood yourself, anytime.",
        "steps":[
            "Find the **🌗 theme chip** at the top of the home screen.",
            "Pick **Bright · Auto · Dark**.",
            "Leave it on **Auto** and it brightens in the morning and dims at night on its own."],
        "points":[
            "Late-night studying is **easier on the eyes**.",
            "Your chosen theme is **remembered next time** you sign in."],
        "tip":"Dark for bedtime review, bright for a morning warm-up — it changes the mood too!"}

def sec_tabsync(aud):
    return {"icon":"🔄","title":"Tab Sync (Your Screen Leads)","sub":"Switch a tab and students follow instantly","img":"room_whiteboard",
        "desc":"When you switch top tabs — **Board → Video → Review Quiz** — the **students' screens follow to the same tab automatically**. No more saying “tap the ○○ tab”; you carry the lesson flow yourself.",
        "steps":[
            "Switch the top tabs as usual (Board · Video · Games · Background · AI Warm-up · Review Quiz).",
            "Watch the student's screen **switch to the same tab** automatically.",
            "Textbook and file sharing carry over to students the same way."],
        "points":[
            "Even young learners follow along **without hunting for buttons**.",
            "The lesson rhythm never breaks, so **pacing gets faster**."],
        "note":"Sync works while you're in the room together. If a screen doesn't follow, ask the student to re-enter.",
        "tip":"A quick heads-up before jumping to a video or quiz keeps students from being startled."}

def sec_schedule_req(aud):
    if aud == "admin":
        return {"icon":"🗓️","title":"Approving Postpone/Change Requests","sub":"Review and approve teacher-submitted requests","img":"common_postpone",
            "desc":"**Class postpone and time-change requests** submitted by teachers gather on the admin screen in real time. Check the reason and **approve or decline** — the schedule updates immediately, replacing phone-and-messenger juggling with one screen.",
            "steps":[
                "Open the **Class Postpone/Change Requests** card in the admin menu.",
                "Review each pending request's **teacher · class · reason**.",
                "Press **Approve** or **Decline** — the result flows to the schedule and the teacher."],
            "points":[
                "Request and decision history is kept, so everything stays **transparent**.",
                "For changes parents should know about, follow approval with a notification."],
            "tip":"Clearing pending requests every morning prevents same-day confusion."}
    return {"icon":"🗓️","title":"Requesting a Postpone / Change","sub":"Something came up? Submit right on the site","img":"common_postpone",
        "desc":"When something urgent comes up, you can now **request a class postponement or time change right on the site**. Your request reaches the admin in real time, and **once approved it's applied to the schedule automatically**.",
        "steps":[
            "Pick the class in **My Page → class schedule**.",
            "Press **Request postpone/change** and write the **reason and preferred time**.",
            "After admin approval it's **applied to the schedule automatically** — you can track the status too."],
        "points":[
            "It's an **official, recorded request** — no phone calls or messengers needed.",
            "The original schedule holds until approval, so request **early (ideally a day ahead)**."],
        "note":"Last-minute changes need time to notify students and parents. If it's urgent, also alert support.",
        "tip":"Offering 2–3 preferred times gets you approved much faster."}

def sec_lesson_fee(aud):
    return {"icon":"🧾","title":"Checking My Lesson-Fee Settlement","sub":"See this month's classes and pay yourself","img":"teacher_mypage",
        "desc":"In My Page's **🧾 Settlement tab**, you can check **this month's class count and lesson-fee settlement** yourself. Settlement data is protected so **only you** can see yours, and past months are available too.",
        "steps":[
            "Open the **🧾 Settlement** tab in My Page.",
            "Check **this month's class count and settlement amount**.",
            "Switch the month to review **previous months** as well."],
        "points":[
            "Settlement details are **visible only to you** — safe and private.",
            "Class records connect to settlement automatically, so **nothing gets missed**."],
        "note":"If a figure looks wrong, don't fix it yourself — contact the admin (HQ).",
        "tip":"Make it a habit to skim last month's statement at the start of each month."}

def sec_qr_attend(aud):
    return {"icon":"📱","title":"QR Attendance Check-in","sub":"One scan and attendance is done","img":"admin_dashboard",
        "desc":"Post an **attendance QR code** at the entrance, and the moment a student scans it with their phone, **attendance is recorded automatically**. The admin dashboard shows **today's attendance in real time** — no more paper rosters.",
        "steps":[
            "Open the **QR Attendance** card in the admin menu and generate **your academy's QR code**.",
            "Print the QR and post it at the **entrance or front desk**.",
            "Students scan with their phone camera and check in on the **check-in screen**.",
            "Watch today's arrivals and times live on the dashboard's **attendance view**."],
        "points":[
            "Arrival times are recorded automatically — **fast and accurate**.",
            "Attendance data flows into student management and reports."],
        "note":"The QR code is unique to your academy. Keep it from being shared outside.",
        "tip":"Stand a tablet at the desk during arrival hours so students can scan without queuing."}

def sec_consult_booking(aud):
    return {"icon":"📞","title":"Consultation Booking Management","sub":"From new inquiries to scheduled consults","img":"common_booking",
        "desc":"Take **consultation bookings from parents and prospects and manage them on one screen**. Track each booking's **schedule and status (pending/done)** and carry the consult onward toward enrollment.",
        "steps":[
            "Open the **Consultation Booking** card in the admin menu.",
            "Register a **new booking** (name, contact, preferred time) or review incoming ones.",
            "After the consult, set the **status to done** and leave a note.",
            "Carry it forward: consult → **level test → enrollment**."],
        "points":[
            "Bookings live in one place, so **no consult slips through**.",
            "Consult history makes **repeat inquiries easy** to handle."],
        "tip":"A quick follow-up call the day after a consult noticeably lifts enrollment conversion."}

def sec_referral(aud):
    return {"icon":"🎁","title":"Friend-Referral Rewards","sub":"Track referrals · pay out rewards","img":"admin_refund",
        "desc":"See the **referral status** of enrolled students bringing friends, and **process reward payouts**. Who referred whom, and whether the reward was paid — all on one screen, turning word-of-mouth into a system.",
        "steps":[
            "Open the **Referral Rewards** card in the admin menu.",
            "Review the list of **referrer · referred friend · enrollment status**.",
            "For qualifying cases, process the **reward payout** (points, gift vouchers, etc.)."],
        "points":[
            "Referral history is kept as data — **transparent, no disputes**.",
            "Linking rewards to student points and the shop multiplies the effect."],
        "tip":"Pair it with a 'refer a friend' event before each semester and watch inquiries jump."}

def sec_kakao_share(aud):
    return {"icon":"💬","title":"Share Library Links via KakaoTalk","sub":"Send videos & docs in original quality","img":"admin_noticestudio",
        "desc":"Every guide and video in the library now has a **'💬 Copy KakaoTalk link' button**. **Attaching a file to KakaoTalk crushes the quality, but sending a link plays the original** as-is. One tap copies the link — guiding parents and teachers gets much easier.",
        "steps":[
            "In the admin **Library**, press **💬 Copy KakaoTalk link** next to the file.",
            "**Paste** it into the KakaoTalk chat room.",
            "Recipients tap the link to watch or download in **original quality**."],
        "points":[
            "For videos, **link sharing = original quality**; file attachments degrade it.",
            "Works the same for PDFs, PPTs, and videos anywhere in the library."],
        "note":"Anyone with the link can open it. For internal-only material, check who you share with.",
        "tip":"In a parents' group chat, one video-guide link does all the explaining."}


# ══════════════════════════════════════════════════════════════════
#  Late-July 2026 new features (Jul 15 – Jul 23)
# ══════════════════════════════════════════════════════════════════

def sec_judgment(aud):
    """🧠 Judgment Training."""
    if aud == "student":
        return {"icon":"🧠","title":"Judgment Training (pick the right words)","sub":"Not memorising answers — what fits right now?","img":"student_judgment",
            "desc":"The AI creates a **situation that could really happen**, and you pick the expression that **fits that situation best** — then write **one line saying why you chose it**. “Give me that!” works with a friend, but “Could I have that, please?” is right for a teacher. Real English ability isn't how much you know; it's **judging which words fit right now**.",
            "steps":[
                "On the student home, open **AI Learning Tools → 🧠 Judgment Training**.",
                "Read **Here's the situation** and pick one of A–D.",
                "In **Why did you choose it?**, write your reason. **Your own language is fine.**",
                "Press **Submit** — the AI scores it and explains **why another option may fit better**.",
                "Tap **🏅 My Growth** (top right) to see your judgment index and its 5 axes."],
            "points":[
                "Every option carries **partial credit** — only a clearly wrong choice scores low.",
                "**The better you explain your reason, the higher the score** — it trains thinking in words.",
                "Questions are **linked to your textbook** (e.g. Side by Side 2), so they stay in range.",
                "Each round comes from a **different topic and angle**, so questions never repeat."],
            "note":"The AI needs a few seconds to write a question. The next one is prepared while you answer, so it usually appears instantly.",
            "tip":"Getting it wrong is fine. **Writing why you thought so** is the whole point of this training."}
    if aud == "teacher":
        return {"icon":"🧠","title":"Using Judgment Training in class","sub":"Turn the student's reasoning into lesson material","img":"student_judgment",
            "desc":"**Judgment Training** works well as an in-class activity. Because the student's choice **and their stated reason** are both recorded, you can respond to *how they thought* rather than just right/wrong. Judgments made during class feed into the student's growth metrics.",
            "steps":[
                "Ask the student to open **🧠 Judgment Training** and solve one question together.",
                "Have them read out their choice **and the reason they wrote**.",
                "Explain why the other options fit less well — by **listener, tone, and situation**.",
                "After class, check the **judgment index trend** in the student report."],
            "points":[
                "Partial credit means **a near-miss still earns points** — students don't feel punished.",
                "**Recent answers are weighted more heavily**, so a student who improves lately climbs quickly.",
                "Students who **recover after a wrong answer** are identified separately."],
            "tip":"Ask “Why did you think so?” in English and let them answer in their own language. The reasoning comes first."}
    return {"icon":"🧠","title":"Running Judgment Training (student judgment index)","sub":"Not memorisation but judgment — a new outcome metric","img":"student_judgment",
        "desc":"In **Judgment Training**, a student picks the expression that fits a situation and explains why. Results accumulate into a **judgment index** across 5 axes — evidence you can show in parent consultations that answers **“how well do they judge for themselves”**, not just “what did they memorise”.",
        "steps":[
            "The feature lives at **AI Learning Tools → Judgment Training** on the student screen.",
            "Per-student results appear on the **My Growth** screen and in learning reports.",
            "Show the **index trend chart** as supporting evidence during consultations."],
        "points":[
            "**Recent answers are weighted more** (half-life weighting), so current ability shows up fast.",
            "**Partial credit** means one wrong answer doesn't crash the index.",
            "Questions combine **24 topics × 12 angles**, so students get different questions."],
        "note":"Read the judgment index as a **growth trend**, not an exam score. The direction matters more than the absolute number.",
        "tip":"This is the best material to answer the classic parent question: “They know the words but can't speak.”"}

def sec_game_pizza(aud):
    """🍕 Grammar Pizza Master."""
    return {"icon":"🍕","title":"Grammar Pizza Master (word order)","sub":"Stack the toppings in sentence order","img":"student_pizza",
        "desc":"Words arrive as **pizza toppings**. Listen to the sentence first, then **place the toppings in sentence order** to finish the pizza. Subject, verb and object are colour-coded, so **English word order sinks in visually**.",
        "steps":[
            "Open **🍕 Grammar Pizza Master** in the games hub.",
            "Press **Listen and start** to hear the sentence first.",
            "Place the toppings below **in sentence order** onto the pizza.",
            "Stuck? Tap **💡 Hint!** at the top right.",
            "Sentences grow longer from Level 1 → 2 → 3."],
        "points":[
            "Each topping is labelled **subject / verb / object**, so word order becomes natural.",
            "If a **textbook is assigned**, sentences come from that book.",
            "A time limit keeps the drill **fast and focused**."],
        "tip":"Read each word aloud as you place it — the order sticks far faster."}

def sec_game_tetris(aud):
    """🧱 Word Tetris."""
    return {"icon":"🧱","title":"Word Tetris","sub":"Stack word blocks and complete two lines","img":"student_tetris",
        "desc":"**Classic Tetris with words on top.** Words fall **one at a time in sentence order** — stack them well and clear a line to complete the sentence. Long words are wide blocks, short words are small ones; fitting them together makes the vocabulary stick.",
        "steps":[
            "Open **🧱 Word Tetris** in the games hub.",
            "Choose **US English mode** or **CN Chinese mode**.",
            "Use **◀ ▶** to move, **rotate**, **▼** to speed up, **↓** to drop instantly.",
            "Each time a block lands you **hear the word** — repeat it aloud."],
        "points":[
            "**English and Chinese** modes play exactly the same way.",
            "Your **high score is saved** so you can beat it next time.",
            "Tidied up so nothing is cut off on a phone screen."],
        "tip":"Lay the long words down low first — clearing lines gets much easier."}

def sec_game_tank(aud):
    """🛡️ Tank Battle · Language Ace."""
    return {"icon":"🛡️","title":"Tank Battle · Language Ace","sub":"Destroy in word order · action learning","img":"student_tank",
        "desc":"Two new action-style learning games. In **Tank Battle** you destroy enemy tanks **in the sentence's word order**; in **Language Ace** you fly and answer as you go. Hands stay busy, so **focus is high and repetition never feels dull**.",
        "steps":[
            "Open **🛡️ Tank Battle** or **✈️ Language Ace** in the games hub.",
            "For Tank Battle pick **English / 中文**, a **battlefield (grass · desert · snow)** and **difficulty 1–7**.",
            "**Hold and drag** the left button to move; **short tap** fires in that direction.",
            "Destroy the tanks carrying the **gold words** of the sentence above, **in order**.",
            "Pick up **jelly fuel cans** to gain more time."],
        "points":[
            "Higher difficulty means faster enemies **and faster speech** — listening practice included.",
            "If a **textbook is assigned**, its sentences are used.",
            "Fully playable by touch on phones and tablets."],
        "note":"These games are motion-heavy. On a slower device, lower the difficulty.",
        "tip":"Games work best as **review after the lesson**, not before it."}

def sec_passkey(aud):
    """🔐 Passkey (face / fingerprint) login."""
    return {"icon":"🔐","title":"Log in with your face or fingerprint (passkey)","sub":"No password needed in the app","img":"student_home",
        "desc":"You can now **log in with your face or fingerprint** in the Mangoi **Android app**. Register once and you're in with a glance or a touch — no ID and password to type. Your secret **never leaves your phone**, so it's safer too.",
        "steps":[
            "Update the app to the **latest version (v1.9 or later)**.",
            "Log in once with your ID and password as usual.",
            "When prompted, tap **Register passkey** and enrol your face or fingerprint.",
            "From then on, log in **with your face or fingerprint**."],
        "points":[
            "The credential stays **only on your phone** and is never sent to the server.",
            "Changed phones? Just **register once more** on the new device.",
            "Devices without passkey support keep working with **the usual ID + password**."],
        "note":"This is an **app-only** feature. In a web browser, log in the usual way.",
        "tip":"Younger students forget passwords constantly. Registering a passkey cuts those requests dramatically."}

def sec_speak_better(aud):
    """🎤 Speech recognition + AI friend improvements."""
    return {"icon":"🎤","title":"Your speaking isn't cut off any more · a smarter AI friend","sub":"It waits even when you speak slowly","img":"student_aifriend",
        "desc":"The microphone used to shut off while you were still thinking mid-sentence — that's fixed. The **waiting time now adapts to the situation**, and if your phone kills the microphone by itself it **restarts automatically**. The **AI friend (Mango)** no longer repeats itself, **asks again** when your speech is cut off, and actually **slows down** when you say “speak slowly”.",
        "steps":[
            "Press the **🎤 button** in Speech Coach, AI Warm-up or AI Friend and talk.",
            "Pausing to think is fine — **it waits until you're really finished**.",
            "Say **“Please speak slowly”** to the AI friend and it will slow down.",
            "Choose the voice: **male · female · alternating**."],
        "points":[
            "Sudden microphone cut-outs on Android phones now **recover automatically**.",
            "The AI friend **never repeats the same sentence**.",
            "If your speech is clipped, the AI asks **“Did you mean this?”**"],
        "note":"Noisy surroundings hurt recognition. Speak clearly in a quiet place.",
        "tip":"Using an earphone microphone raises recognition accuracy noticeably."}

def sec_enroll(aud):
    """💳 Enrolment & payment → automatic lesson creation."""
    if aud == "student":
        return {"icon":"💳","title":"Enrol and pay in one go","sub":"Pick teacher, days and time — lessons are scheduled automatically","img":"admin_enroll",
            "desc":"You can now **choose your teacher, days and time yourself and pay** — and **your whole schedule is created automatically**. No more phoning after payment to arrange a timetable. If a slot already clashes with another lesson, **you're told before you pay**.",
            "steps":[
                "Open the **Enrolment** screen.",
                "**① Choose a teacher.**",
                "**② Lesson options** — times per week (1–5), term (1 / 3 / 6 / 12 months), length (20 or 40 min).",
                "**③ Days & time** — pick as many days as your weekly count, then the start time and start date.",
                "When **✅ Available** appears, press **Pay** at the bottom.",
                "Once payment completes, **every session is created at once**. Check it on My Page."],
            "points":[
                "Longer terms are cheaper — **6 months −5%, 12 months −10%**.",
                "If the slot is taken, an **❌ appears** so you can change it before paying.",
                "Postponing is **free up to 30 minutes before** the lesson; renewing **extends the same day, time and teacher**."],
            "note":"Lessons are created after payment is confirmed. Wait a moment right after paying and the schedule will appear.",
            "tip":"Avoid days with school commitments. Choosing well up front beats rescheduling later."}
    return {"icon":"💳","title":"Enrolment & payment → automatic lesson creation","sub":"Once payment is confirmed, every session is scheduled","img":"admin_enroll",
        "desc":"On the **Enrolment screen** a student picks teacher, days and time and pays — and **all lesson sessions are created automatically the moment payment is confirmed**. The old manual timetable entry after payment is gone. If the slot **clashes with an existing lesson, the conflict is detected before payment**.",
        "steps":[
            "Send students and parents the **enrolment link**.",
            "They choose **teacher → lesson options (weekly count, term, length) → days & time**.",
            "The **slot check must pass** before the pay button unlocks (payment is blocked on a clash).",
            "On confirmed payment, **all sessions are created at once** — verify in the admin lesson list.",
            "Head-office prices and discount rates are managed on the **pricing screen**."],
        "points":[
            "**Idempotent** — a duplicated payment callback will not create the sessions twice.",
            "Clashes with holidays or existing lessons are **pushed back** so the session count is still met.",
            "Term discounts (6 months −5%, 12 months −10%) are applied to the amount automatically."],
        "note":"**Stage 1 (enrol → pay → auto-create sessions)** is live today. Later stages will follow.",
        "tip":"Consultation → level test → send the enrolment link is the smoothest conversion path."}

def sec_class_observe(aud):
    """👀 Class observation (live)."""
    return {"icon":"👀","title":"Class Observation (live)","sub":"Quietly look in on a lesson in progress","img":"admin_ghost",
        "desc":"You can **sit in on a live lesson without the student or teacher knowing**. No join notification is sent, so the lesson isn't disturbed — use it for **mentoring new teachers, quality checks and parent complaints**. Every observation is **permanently written to the audit log**.",
        "steps":[
            "Open the **Class Observation (Live)** card in the admin menu.",
            "Enter your **admin UID** and the **room ID**.",
            "Write an **observation reason** — this is required (e.g. new-teacher mentoring).",
            "Press **Start observing**; press **Stop observing** when done.",
            "Past sessions are listed under **Observation log**."],
        "points":[
            "While observing, **your audio and video are not transmitted**.",
            "**A reason is mandatory** — this is student privacy policy.",
            "Who observed, when and why is **fully recorded**."],
        "note":"This touches student privacy directly. Use it **only when there is a business need**, and write a specific reason.",
        "tip":"Observe new teachers once a week for their first two weeks, then coach — quality stabilises quickly."}

def sec_admin_newui(aud):
    """🧭 Refreshed admin screen."""
    return {"icon":"🧭","title":"A refreshed admin screen","sub":"Collapsible sidebar · lighter background · line icons","img":"admin_sidebar_rail",
        "desc":"The admin screen is now **easier on the eyes and wider**. The left menu collapses to a **narrow icon rail** via the **‹ Collapse** button, and the background is now a **consistent light tone**. Menu icons were redrawn as **line icons** so labels read clearly.",
        "steps":[
            "Press **‹ Collapse** at the top of the left menu — it shrinks to an icon rail and **the content gets wider**.",
            "Press the **›** button in the same place to expand it again.",
            "The collapsed state is **remembered for your next visit**.",
            "Too many menus to find one? Type its name into **menu search** at the top."],
        "points":[
            "Screens full of tables and lists gain **a lot of horizontal space**.",
            "15 sub-pages were moved onto the **same light theme**, so the colour jump between screens is gone.",
            "The collapse animation was **removed** so low-spec PCs don't stutter."],
        "tip":"Wide-table screens like settlement and payroll are far easier to read with the menu collapsed."}

def sec_lang_auto(aud):
    """🌐 Automatic interface language."""
    return {"icon":"🌐","title":"The interface language sets itself","sub":"Overseas staff and teachers start in English","img":"admin_dashboard",
        "desc":"Filipino teachers and overseas staff now **start in English from the first screen**. The interface language is decided from the account's **nationality**, and teacher accounts are **always English** regardless of name or previous choice. You can still switch any time with the **🌐 EN / KR** button at the top.",
        "steps":[
            "If the account has a **nationality** on file, the right language appears automatically at login.",
            "To change it manually, press the **🌐 EN / KR** button at the top.",
            "A manual choice is stored **per account** — several people can share one PC without interference.",
            "Teacher guide slides and manuals **switch to the English editions** with it."],
        "points":[
            "**Teacher accounts are always English** — no more getting lost in a Korean screen.",
            "Accounts with an English name no longer flip to Korean because of a Korean job title.",
            "Language choice is **isolated per account**, so an overseas account isn't overwritten by someone else's pick."],
        "note":"Accounts with no nationality fall back to the old name/ID heuristic. Please fill in nationality when registering teachers.",
        "tip":"Enter nationality when registering a new teacher and their very first login is in English — fewer support requests."}

def sec_classlock(aud):
    """🔒 Three class-control tools."""
    return {"icon":"🔒","title":"Three class controls (focus · background lock · exit guard)","sub":"Fewer distractions and accidental exits","img":"room_base",
        "desc":"Three controls the teacher can switch on and off. **Focus mode** stops the student drifting to other screens during the lesson, **background lock** stops them changing backgrounds and face decorations over and over, and **exit guard** catches an accidental back-button press before they leave the lesson.",
        "steps":[
            "Open **⚙️ Settings** in the bottom dock of the lesson screen.",
            "Turn on **Focus mode** to pin the student's screen to the lesson.",
            "Turn on **Background lock** so backgrounds and face decorations can't be changed.",
            "Leave **Exit guard** on and the student is **asked to confirm** before leaving.",
            "All three release automatically when the lesson ends."],
        "points":[
            "A brief disconnection **does not end the lesson** — the student picks up where they left off.",
            "No-shows are **counted automatically** and appear on the admin screen.",
            "Especially effective with younger classes."],
        "note":"These are **tools for helping focus, not for punishing**. Explain them to the student at the start of the lesson.",
        "tip":"Rather than switching them on only for restless students, leave them on from lesson one — it feels more natural."}

def sec_pdf_anno(aud):
    """✍️ Textbook PDF annotation + navigation."""
    return {"icon":"✍️","title":"Textbook PDF — annotations that stay · faster page jumps","sub":"Turn the page and come back; your marks are still there","img":"room_write_dock",
        "desc":"Annotations you draw on a textbook PDF now **survive turning the page and coming back**. Navigation is faster with **◀ ▶ buttons and direct page-number entry**, and a new **light mode** keeps page turns smooth on older devices and slow connections.",
        "steps":[
            "Open the **Textbook** tab and load the PDF.",
            "Underline and circle with the **writing tools**.",
            "Move with **◀ ▶**, or **type a page number** to jump.",
            "Go back a page and **your earlier marks are still there**.",
            "If the screen feels slow, turn on **light mode**."],
        "points":[
            "Annotations are stored **per page**, so they never mix up.",
            "Light mode trades a little sharpness for **much smoother page turns**.",
            "The student sees **the same page with the same annotations**."],
        "tip":"Note down the page numbers you use most before class and jumping becomes instant."}

def sec_lowbw(aud):
    """🔉 Automatic handling of poor connections."""
    return {"icon":"🔉","title":"It rides out a slow connection by itself","sub":"Video may fold away, but the voice keeps going","img":"class_room",
        "desc":"When the line degrades, the system **lowers video quality by itself**, and if that isn't enough it **switches automatically to a voice-first (audio-only) mode** so the lesson doesn't break. When the connection recovers, **video comes back**. Built with unstable connections — like on-site in the Philippines — in mind.",
        "steps":[
            "There is nothing to press — **it happens automatically**.",
            "If the picture blurs or freezes, **carry on by voice**.",
            "Video **returns on its own** once the line improves.",
            "If it stays unstable, ask the student to **move closer to their Wi-Fi**."],
        "points":[
            "**Voice is protected to the very last** — the lesson can continue by speech alone.",
            "A brief drop **never auto-ends the lesson**.",
            "If the far side freezes to black, it **attempts self-recovery**."],
        "note":"If nothing returns after 90 seconds, a notice card appears. That's the moment to contact the student.",
        "tip":"For students who drop often, have them run the **device check** screen once before class."}

def sec_teacher_account(aud):
    """🔑 Teacher account management."""
    if aud == "teacher":
        return {"icon":"🔑","title":"Your account (password · interface language)","sub":"When you forget your password · English screen","img":"teacher_mypage",
            "desc":"If you forget your password, **ask an administrator and it's reset straight away**. Teacher accounts also now **always open in English**, so no one gets lost looking for a menu on a Korean screen.",
            "steps":[
                "Forgot your password? **Ask the admin (operations team) for a reset**.",
                "Once you receive a temporary password, log in and **change it immediately**.",
                "Switch the interface language with the **🌐 EN / KR** button at the top.",
                "If you use the app, registering a **face / fingerprint passkey** is the easiest option."],
            "points":[
                "Teacher accounts default to **the English interface**.",
                "A language you pick yourself is saved **to your account only**.",
                "**Always replace** the temporary password."],
            "tip":"If you forget passwords often, register an app passkey — a glance gets you in."}
    return {"icon":"🔑","title":"Teacher accounts (password reset · access limits)","sub":"Handling lost passwords · scoping permissions","img":"teacher_mypage",
        "desc":"When a teacher forgets their password you can **reset it directly from the admin screen**. Teacher account access was also tightened so that **operations and settlement features a teacher doesn't need simply don't open**.",
        "steps":[
            "Find the teacher under **Teachers** in the admin menu.",
            "Use **Reset password** to issue a temporary password.",
            "Pass it on and tell them to **change it right after logging in**.",
            "If the teacher's nationality is blank, **fill it in** so their screen opens in English."],
        "points":[
            "Teacher accounts **cannot reach operations or settlement features** (32 areas blocked).",
            "Reset actions are logged.",
            "Teachers with a nationality on file **start in English from their first login**."],
        "note":"Send temporary passwords only over a channel where **you can verify who you're talking to**.",
        "tip":"Fill in nationality and contact details when registering a new teacher — later questions drop sharply."}

def sec_recording(aud):
    """🎥 Replay recorded lessons."""
    return {"icon":"🎥","title":"Replay a recorded lesson","sub":"Play back a recording where you found it","img":"teacher_lessons",
        "desc":"A lesson recorded with **REC** can now be **played back directly from the management screen**. No download needed — **one click plays it**, and the old bug that threw you back to the login screen is fixed.",
        "steps":[
            "Press **REC** at the top during the lesson to record.",
            "After class, find the lesson under **Lesson log / Recordings**.",
            "Press **▶ Play** to review it right there.",
            "If a parent needs a copy, **ask an administrator**."],
        "points":[
            "Playback **no longer bounces you to the login screen**.",
            "Recordings are kept on the server and **cleaned up per the storage policy**.",
            "They contain student faces — **external sharing is prohibited**."],
        "note":"Record **only with student and parent consent**.",
        "tip":"Watching five minutes of your own lesson afterwards visibly improves your pace and question ratio."}


# ══════════════════════════════════════════════════════════════════
#  2026-07-25 new features (Jul 24 – Jul 25)
# ══════════════════════════════════════════════════════════════════

def sec_rescue(aud):
    """🌊 Mango Rescue Voyage."""
    return {"icon":"🌊","title":"Rescue Voyage (Mango Rescue Voyage)","sub":"Rescue sea friends while you learn words","img":"student_rescue",
        "desc":"Swept up by a storm, **word friends have fallen into the sea — steer your boat and lift them out**. Rescue one and its **native pronunciation and meaning are revealed**; along the way, dodge sea creatures like **sharks, turtles and dolphins**. After rescuing as many as you can in time, a **listen-and-repeat sentence mission** follows, built from the words you saved.",
        "steps":[
            "Open **🌊 Rescue Voyage** in the games hub.",
            "Pick **English / 中文 mode** and press **Start**.",
            "Steer your boat to the **word friends** in the water and lift them out.",
            "Avoid the **sharks, turtles and dolphins**.",
            "When rescue ends, take on the **repeat-the-sentence mission**."],
        "points":[
            "Each rescue plays the **native pronunciation**, so it's listening practice too.",
            "English and Chinese modes play the same way.",
            "Lifelike sea creatures make it more immersive."],
        "note":"This game is motion-heavy. On a slower device, take a short break if it lags.",
        "tip":"The sentence mission from your rescued words is the real review — repeat it aloud, clearly."}

def sec_report_pentagon(aud):
    """🌟 Parent monthly report (pentagon)."""
    return {"icon":"🌟","title":"[Parents] Pentagon Monthly Report","sub":"Five strengths at a glance · print in one tap","img":"student_report_pentagon",
        "desc":"A report card that shows your child's month across **five axes of a pentagon graph** — **Pronunciation & Fluency / Vocabulary / Sentence Building / Class Attitude / Participation** — followed by attendance, judgment index and a teacher's note. The **Print/PDF button** up top outputs it as-is or saves a file.",
        "steps":[
            "Open the **report link** you received on KakaoTalk.",
            "Check the balance of the five strengths in the **pentagon graph** at the top.",
            "Read **This Period's Status** (attendance, judgment) and the **Teacher's Note**.",
            "Note the **How You Can Help at Home** tips.",
            "To keep a paper copy, press **🖨 Print/PDF** at the top."],
        "points":[
            "**Only axes with real records** are filled in — no invented numbers.",
            "Compiled **every two months**, so the trend is easy to read.",
            "It all fits one screen — **a single printed page**."],
        "note":"The report fills in as learning records accumulate. In a low-activity month some axes may look empty.",
        "tip":"An evenly large pentagon means balanced learning. A dented axis is this month's challenge."}

def sec_report_ops(aud):
    """🌟 Running the parent monthly report."""
    if aud == "teacher":
        return {"icon":"🌟","title":"Parent Monthly Report (built from your evaluations)","sub":"The five axes come from the evaluations you leave","img":"student_report_pentagon",
            "desc":"The five axes of the **pentagon monthly report** parents receive (Pronunciation & Fluency / Vocabulary / Sentence Building / Class Attitude / Participation) are filled from **the lesson evaluations and pronunciation records you leave**. The more consistently you evaluate, the more accurate and complete the report. The **Teacher's Note** is an AI draft you review and adjust before it goes out.",
            "steps":[
                "Fill in the **lesson evaluation** conscientiously, as usual.",
                "Pronunciation practice and judgment-training records feed the axes automatically.",
                "Review and refine the **Teacher's Note** AI draft on the report.",
                "Preview to confirm the pentagon is well filled in."],
            "points":[
                "**Only axes with values** are filled — no evaluation means that axis looks empty.",
                "**Consistent evaluations** matter more than a long comment."],
            "tip":"Even a one-line evaluation each lesson makes the month-end report complete itself."}
    return {"icon":"🌟","title":"Sending the Parent Monthly Report (pentagon)","sub":"Preview the 5-axis report, then share the link","img":"student_report_pentagon",
        "desc":"The **monthly report** sent to parents is renewed as a **pentagon 5-axis graph** — **Pronunciation & Fluency / Vocabulary / Sentence Building / Class Attitude / Participation** — at a glance, with attendance, judgment and a teacher's note. Admins and teachers enter a student ID and month to **preview**, then send the **KakaoTalk link**.",
        "steps":[
            "Open the **Monthly Report** screen.",
            "Enter a **student ID** and **month**, press **View Report** to preview.",
            "Check the pentagon and teacher's note; top up evaluations if needed.",
            "Append **?uid=ID&period=YYYY-MM** to the URL and send the **KakaoTalk link**."],
        "points":[
            "**Only axes with real records** are filled, so it's trustworthy.",
            "Compiled on a **two-month cycle** — conveys change without tiring parents.",
            "The Print/PDF button makes a paper report for consultations instantly."],
        "note":"Report access passes an **approval gate** — admins via their login session, parents only via the issued link (token).",
        "tip":"Sending the report link ahead of a booked consultation makes the meeting much smoother."}

def sec_teacher_roster(aud):
    """🗂️ Teacher management redesign."""
    return {"icon":"🗂️","title":"Teacher Management, redesigned (roster filters · groups · detail tabs)","sub":"Easy-to-search roster · detail at a glance","img":"admin_teachers",
        "desc":"The teacher-management screen is now **easier to search and read**. Scattered menus are **grouped into four bundles** in the sidebar, and above the roster there are **status/group dropdown filters** with **applied-filter chips**. Tapping a teacher opens a detail view split into **Profile / Payroll / Evaluation tabs**, with a **manager badge** and **employment status (active / on-leave / left)** shown at a glance.",
        "steps":[
            "Open **Teachers** in the admin menu (menus are tidied into four bundles).",
            "Filter to just the teachers you want with the **status/group dropdowns** above the roster.",
            "Applied filters show as **chips**; remove a chip to clear it.",
            "Tap a teacher to open the **Profile / Payroll / Evaluation** detail tabs.",
            "The **summary numbers on the payroll/evaluation tabs** load only as needed when opened."],
        "points":[
            "**Managers** are marked with a badge, and status shows as **active / on-leave / left (3 states)**.",
            "A blank name **falls back to the ID**, so there are no empty cells.",
            "Detail tabs **reuse existing APIs** for speed, and the screen is bilingual (KO/EN).",
            "The duplicate payroll entry was tidied and **bug reports moved to a separate system**."],
        "note":"This is a filtering/detail cleanup. Registering, editing and deleting teachers works exactly as before.",
        "tip":"The more teachers you have, the more the status/group filters help. Keep your usual conditions filtered."}


from content_en_manuals import STUDENT, ADMIN, TEACHER, BRANCH, AGENCY

MANUALS = {"student": STUDENT, "admin": ADMIN, "teacher": TEACHER, "branch": BRANCH, "agency": AGENCY}

# ── Recent new-feature sections (all audiences) ──
for _aud in ("student", "admin", "teacher"):
    MANUALS[_aud]["sections"] += [sec_worldclock(_aud), sec_cncoach(_aud)]
for _aud in ("branch", "agency"):
    MANUALS[_aud]["sections"] += [sec_worldclock(_aud), sec_cncoach(_aud), sec_praise_op(_aud)]

# ── 2026-07 new-feature sections (per audience) ──
MANUALS["student"]["sections"] += [sec_voicediary("student"), sec_flowconnector("student"), sec_aiavatar("student")]
MANUALS["admin"]["sections"]   += [sec_noticestudio("admin"), sec_aicommand("admin"), sec_diarymonitor("admin"), sec_teachercoach("admin")]
MANUALS["teacher"]["sections"] += [sec_teachercoach("teacher")]
for _aud in ("branch", "agency"):
    MANUALS[_aud]["sections"] += [sec_noticestudio(_aud), sec_aicommand(_aud)]

# ── Mid-July 2026 new-feature sections (per audience) ──
MANUALS["student"]["sections"] += [sec_vc_comfort("student"), sec_dm_chat("student"), sec_home_theme("student")]
MANUALS["teacher"]["sections"] += [sec_tabsync("teacher"), sec_dm_chat("teacher"), sec_schedule_req("teacher"), sec_lesson_fee("teacher")]
MANUALS["admin"]["sections"]   += [sec_qr_attend("admin"), sec_consult_booking("admin"), sec_referral("admin"), sec_schedule_req("admin"), sec_kakao_share("admin")]
for _aud in ("branch", "agency"):
    MANUALS[_aud]["sections"] += [sec_kakao_share(_aud)]

# ── Late-July 2026 (Jul 15–23) new-feature sections (per audience) ──
MANUALS["student"]["sections"] += [
    sec_judgment("student"), sec_game_pizza("student"), sec_game_tetris("student"),
    sec_game_tank("student"), sec_passkey("student"), sec_speak_better("student"),
    sec_enroll("student")]
MANUALS["teacher"]["sections"] += [
    sec_classlock("teacher"), sec_pdf_anno("teacher"), sec_lowbw("teacher"),
    sec_judgment("teacher"), sec_recording("teacher"), sec_teacher_account("teacher")]
MANUALS["admin"]["sections"] += [
    sec_enroll("admin"), sec_class_observe("admin"), sec_admin_newui("admin"),
    sec_lang_auto("admin"), sec_judgment("admin"), sec_teacher_account("admin")]
for _aud in ("branch", "agency"):
    MANUALS[_aud]["sections"] += [sec_admin_newui(_aud), sec_lang_auto(_aud), sec_enroll(_aud)]

# ── 2026-07-26~28 new features (shared section builders) ──
def sec_home_hero(aud):
    """🏠 Home hero splits by login state."""
    if aud in ("admin", "branch", "agency"):
        return {"icon":"🏠","title":"Home Screen Split (first-time parent vs. existing member)","sub":"Fewer 'how do I start?' calls, more trial sign-ups","img":"student_home",
            "desc":"The first screen of the site (the hero) now shows **one of two versions depending on who is looking**. A **first-time parent** sees <b>Book a Free Trial</b> as the biggest button; a **logged-in member** sees <b>Enter Class</b>. We checked four competitors directly (Cambly Kids, Min Byung-chul UPhone, Engoo, Ringle) and **all four lead with a new-customer call to action** — this change follows that evidence.",
            "steps":[
                "Open the **home URL in a private/incognito window** to see the **guest screen**.",
                "Confirm the two large buttons: **Book a Free Trial · Browse Teachers**.",
                "Log in and open the same page — it becomes **Enter Class · Chat with AI**.",
                "Use the **plain home URL** in flyers and text messages — no separate landing page is needed."],
            "points":[
                "**No new page was created.** The same URL decides for itself based on login state.",
                "The guest screen still keeps a **small 'Enter Class' link** — this prevents an existing student who changed devices or was logged out from being locked out of class.",
                "If the check fails for any reason, it **always falls back to the guest screen** — the page is never blank.",
                "**No flicker.** The decision is made before the page paints."],
            "note":"Never remove the small 'Enter Class' link on the guest screen. Existing members also land there when their login expires (30 days) or they switch devices.",
            "tip":"To see what a parent sees, open the home page in an incognito window — that is the exact first impression."}
    return {"icon":"🏠","title":"The First Screen Adapts to You","sub":"It looks different before and after you log in","img":"student_home",
        "desc":"The Mangoi home screen looks **different before and after you log in**. If you have not logged in yet, **Book a Free Trial** and **Browse Teachers** are the big buttons. Once you log in, **Enter Class** and **Chat with AI** take their place. The screen changes so you never have to wonder what to do next.",
        "steps":[
            "Open the home screen.",
            "If you are not logged in, **Book a Free Trial** is the biggest button.",
            "If you are already our student, tap the small **'Already enrolled? Enter Class →'** link below it.",
            "Once you log in, the first screen switches to focus on **Enter Class**."],
        "points":[
            "When logged in, the home screen also shows the **countdown to your next class**.",
            "Even if your login expired, the **small Enter Class link** always gets you in.",
            "The screen **does not flicker** when it switches."],
        "note":"If you have not visited for a long time your login may expire and you will see the guest screen. Just tap the small 'Enter Class' link and log in again.",
        "tip":"When showing Mangoi to a parent, do it **logged out** — the Free Trial button is large and easy to explain."}


def sec_game_escape(aud):
    """🚪 Escape by Voice."""
    if aud == "teacher":
        return {"icon":"🚪","title":"Escape by Voice (using it in class)","sub":"A room with no buttons — it only opens when they speak","img":"student_escape",
            "desc":"A new escape game where the room opens **only when the student speaks English out loud**. Clicking does nothing, which makes it **unusually effective at raising talk time for quiet students**. Looking around the room reveals clues, and each clue tells them what to say next.",
            "steps":[
                "In class, have the student open **Games → 🚪 Escape**.",
                "The student presses the **🎤 microphone button** and says the line shown.",
                "If it is right, the room reacts and moves to the **next stage**.",
                "If they are stuck, let them use the **Hint button** (no penalty).",
                "At the end, **how many times they spoke and their success rate** appear — praise them on the spot."],
            "points":[
                "**Clicking never advances it** — only speaking opens the room.",
                "As time runs down the room darkens, adding **just enough tension**.",
                "The end screen leaves **spoken-attempt and success counts** you can use for coaching."],
            "note":"Microphone permission is required. If nothing is picked up, check that the browser is allowed to use the mic.",
            "tip":"Give a reluctant speaker exactly one room in their first session. The moment they realise speaking really opens the door changes every lesson after."}
    return {"icon":"🚪","title":"Escape by Voice","sub":"No buttons here — the room moves when you speak English","img":"student_escape",
        "desc":"**There are no buttons to press in this room.** It only moves — and the door only opens — when you **say something in English out loud**. Look around carefully and **clues** appear, and each clue tells you what to say next. As time runs down the room gets darker, so hurry!",
        "steps":[
            "Open **🚪 Escape** in the games hub and press **▶ Enter the room**.",
            "**Look around the room** — a clue appears.",
            "Press **🎤 Tap to speak in English** and say it clearly.",
            "If you get it right you'll see **'Perfect!'**, the room reacts and you move on.",
            "Stuck? Press **💡 Hint** — it does not cost you any points."],
        "points":[
            "**Clicking will never open it.** You have to speak.",
            "If it did not hear you, it says **'Try saying that again'** — that is not a failure.",
            "At the end you see **how many times you spoke, how many were right, and how many hints you used**.",
            "Even if you do not escape, it tells you **how far you got**, so it is easy to try again."],
        "note":"This game uses your microphone. When the browser asks to use it, please press **Allow**.",
        "tip":"Mumbling quietly is hard to pick up. Speak **clearly and a little louder** and the room opens much more easily!"}


def sec_vocab_hub(aud):
    """📖 My Vocabulary hub."""
    if aud == "teacher":
        return {"icon":"📖","title":"My Vocabulary, Redesigned (Preview tab · 6 tabs)","sub":"Let students meet next lesson's sentences early","img":"student_vocab",
            "desc":"The student vocabulary page is now **one screen with six tabs**. Most notably a new **🔮 Preview tab** lets a student **hear the textbook sentences from their next lesson in advance** and add any word straight to their list. First-time visitors get a **30-second onboarding guide**.",
            "steps":[
                "Have the student open **My Vocabulary**.",
                "In the **🔮 Preview** tab, let them hear next lesson's textbook sentences.",
                "Have them tap words they like to **add them to their list**.",
                "After class, move them on to the **Review Game** tab."],
            "points":[
                "The Preview tab is visible to **logged-in students only**.",
                "If no textbook sentences are registered it shows **'Preview coming soon'**.",
                "If the meaning field is left blank, **AI generates the Korean meaning and an example sentence** automatically."],
            "note":"Preview content depends on textbook and lesson registration. If it is empty, check the assigned textbook.",
            "tip":"Make 'add three of today's words to your list' the last minute of class — it builds the review habit fast."}
    return {"icon":"📖","title":"My Vocabulary, Redesigned (6 tabs, preview included)","sub":"Collect · memorise · compete · grow","img":"student_vocab",
        "desc":"Your vocabulary page is now a tidy **single screen with six tabs**: **🔮 Preview · ＋ Add Word · 🃏 Flashcards · 🎮 Review Game · 🏆 Weekly Ranking · 📔 Word Collection**. Just tap between them. On your first visit a **30-second guide** shows you exactly how it works.",
        "steps":[
            "In **🔮 Preview**, hear the sentences from your next lesson and save the words you like.",
            "In **＋ Add Word**, type just the English word and **AI creates the meaning and an example** for you.",
            "Memorise with the **🎮 Review Game** — **+10P** for every correct answer, plus a **combo bonus** for streaks!",
            "Complete the **10-word daily review mission** for **+50P**; do it every day to build a 🔥 review streak.",
            "Watch your cards grow Seed → Silver → Gold → Master in the **📔 Word Collection**."],
        "points":[
            "Saved words come back **right when you are about to forget them** (automatic review scheduling).",
            "You can **add many words at once from a file** — Excel (.xlsx) and Word (.docx), and a template is downloadable.",
            "The fuller your Word Collection gets, the bigger your **baby mango** grows.",
            "Log in and your points, review streak, ranking and collection are **saved to your account**."],
        "note":"You can try it without logging in for **10 minutes a day over 3 days** — but nothing is saved.",
        "tip":"Five minutes in the **Preview tab** before class makes your teacher far easier to follow that day!"}


def sec_pw_reset(aud):
    """🔑 Self-service password reset."""
    if aud in ("admin", "branch", "agency"):
        return {"icon":"🔑","title":"Self-Service Password Reset (SMS verification)","sub":"A self-help path that cuts parent enquiries","img":"student_home",
            "desc":"Students and parents can now **reset their own password without going through staff**, from both the login modal and the **report-card screen**. A **6-digit SMS code** is sent to the registered phone number; once verified, they set a new password immediately.",
            "steps":[
                "Point the parent to **🔑 Forgot your password? — Reset by SMS** on the login or report-card screen.",
                "They enter their ID and a **6-digit code goes to the registered phone number**.",
                "After verifying the code they set a **new password** right away.",
                "If it says no number is registered, guide them to the **KakaoTalk channel**."],
            "points":[
                "The link now also exists on the **report-card screen**, so fewer parents get stuck there.",
                "The **KakaoTalk enquiry button stays** — if self-service fails, it flows naturally into a conversation."],
            "note":"**Only accounts with a registered phone number actually work.** Most accounts currently have no number on file, so coverage grows as numbers are filled in. The real fix is contact-data migration (Cafe24 sync), not code.",
            "tip":"When a parent calls, register their number first. From then on they solve it themselves."}
    return {"icon":"🔑","title":"If You Forget Your Password (reset by SMS)","sub":"You can change it yourself","img":"student_home",
        "desc":"Even if you cannot remember your password, **you can change it yourself**. Tap **🔑 Forgot your password? — Reset by SMS** on the login screen or the report-card screen, and a **6-digit code** is sent to your registered phone number.",
        "steps":[
            "Tap **🔑 Forgot your password?** on the login or report-card screen.",
            "Enter your **ID**.",
            "Type in the **6-digit code** you receive by text.",
            "Choose a **new password** — done."],
        "points":[
            "You can also do it **right there** if you get stuck trying to view a report card.",
            "If no text arrives, a **KakaoTalk enquiry** button is right next to it."],
        "note":"Your **phone number must be registered** with the academy to receive the text. If it says no number is on file, please contact the academy on KakaoTalk.",
        "tip":"If your number changed, tell the academy in advance — then you can solve this on your own next time."}


def sec_payment_step(aud):
    """💳 Step-by-step payment screen."""
    if aud in ("admin", "branch", "agency"):
        return {"icon":"💳","title":"New-Payment Screen, Now Step-by-Step","sub":"It no longer shows 12 products at once","img":"admin_refund",
            "desc":"The new-payment screen now starts with **'who is this for?'**. Previously all **12 products** appeared at once and parents had no idea where to start. Now they pick from **Kids · 1:1 · Group · Business · Test Prep · Corporate** and only the matching products remain.",
            "steps":[
                "Point the parent to the **New Payment** screen.",
                "Have them pick the **audience** first (Kids, 1:1, Group, Business, Test Prep, Corporate).",
                "Only the products for that audience stay on screen.",
                "If they want to compare everything, press **See Full Price List**."],
            "points":[
                "**No product card or payment logic was changed** — only what is displayed, so it is safe.",
                "Verified counts: 3 initially (free trial, other, policy) → 4 when Kids is selected → 12 in full view.",
                "**See Full Price List was deliberately kept** — hiding prices backfires."],
            "tip":"When a caller says 'I don't know which one to pick', just have them choose the audience first."}
    return {"icon":"💳","title":"Payment Made Simpler (choose who it's for first)","sub":"No need to read all 12 at once","img":"admin_refund",
        "desc":"When you sign up for lessons, **you pick who is learning first** and only the matching products appear. Choose one of **Kids · 1:1 · Group · Business · Test Prep · Corporate**. No more scanning twelve products at once.",
        "steps":[
            "Open the **New Payment** screen.",
            "Under **Who is learning?**, choose the audience.",
            "Only the products for that choice remain.",
            "Want to compare everything? Press **See Full Price List**."],
        "points":[
            "Prices and product contents are **exactly the same as before** — only the display is grouped.",
            "**See Full Price List** is always one tap away."],
        "tip":"If you are new, start with the **free trial**. You can decide after seeing whether it suits your child."}


def sec_sample_report(aud):
    """📋 Sample report card for prospects."""
    if aud in ("admin", "branch", "agency"):
        return {"icon":"📋","title":"Sample Report Card for Parents Without an Account","sub":"Something to show in front of the login wall","img":"student_report_pentagon",
            "desc":"Until now there was **nothing to show a prospective parent** who had no account. The report-card screen now offers **'No account — view a sample report first'**, so you can show what the **5-axis scores + teacher comment + AI analysis** look like without logging in.",
            "steps":[
                "During a consultation, open the **report-card screen** for the parent.",
                "Press **No account — view a sample report first**.",
                "Walk through the 5-axis scores, teacher comment and AI analysis together.",
                "Close with 'this is what you'll receive for your child' and offer the trial."],
            "points":[
                "⚠️ **All values are examples.** The title and top banner are marked 'Sample'.",
                "**Never remove that marking** — if it is mistaken for a real record it becomes a trust problem."],
            "note":"The sample uses no real student data. Use it for consultations only.",
            "tip":"Showing the sample report in the first three minutes of a consultation makes 'what do I actually get?' concrete and lifts trial conversion."}
    return {"icon":"📋","title":"See a Sample Report Card Without an Account","sub":"See what your child's report will look like","img":"student_report_pentagon",
        "desc":"Even without an account you can **see what a report card looks like**. On the report-card screen, press **'No account — view a sample report first'** to see how the **five scores, teacher comment and AI analysis** are presented.",
        "steps":[
            "Open the report-card screen.",
            "Press **No account — view a sample report first**.",
            "Look through the 5 score axes, teacher comment and AI analysis."],
        "points":[
            "The numbers shown are **examples (a sample)** — not real records.",
            "A **'Sample' label** always appears at the top of the screen."],
        "note":"Your child's real report card becomes available once lesson records build up and you log in.",
        "tip":"Showing this screen makes Mangoi much easier to explain to a parent."}


def sec_parent_menu(aud):
    """🧭 Parent side menu grouping."""
    if aud in ("admin", "branch", "agency"):
        return {"icon":"🧭","title":"Parent Side Menu Grouped into Categories","sub":"18 flat items → 4 groups","img":"student_home",
            "desc":"The parent screen's left menu used to list **18 items flat, with no structure**. It is now organised into **four categories** — **My Child's Learning / Classes / Learning Tools / Payment & Support** (plus Other) — with headings only, so **every item is still one click**.",
            "steps":[
                "Open the **left menu** on the parent screen.",
                "Check the four **category headings** and the items under each.",
                "When helping a parent, refer to the group — e.g. 'look under Payment & Support'."],
            "points":[
                "**It is not an accordion** — collapsing would add one extra click to every single item.",
                "**All 18 items are still there** (verified — none disappeared).",
                "Any item not assigned to a group is **collected automatically under 'Other'** so nothing vanishes silently."],
            "tip":"Naming the group first on a support call gets parents to the right place much faster."}
    return {"icon":"🧭","title":"The Parent Menu Is Now in Four Groups","sub":"See at a glance where to look","img":"student_home",
        "desc":"The left menu on the parent screen is now organised into **four groups**: **My Child's Learning · Classes · Learning Tools · Payment & Support**. The headings tell you straight away which group holds what you are looking for.",
        "steps":[
            "Look at the left menu.",
            "Use the **group headings** to decide where to look.",
            "Tap the item you want — still **just one tap**."],
        "points":[
            "Grouping did **not add any clicks** — nothing has to be expanded.",
            "**No menu items were removed.**"],
        "tip":"Report cards are under **My Child's Learning**; payments and enquiries are under **Payment & Support**."}


def sec_parent_weekly(aud):
    """📅 Parent weekly report."""
    if aud == "teacher":
        return {"icon":"📅","title":"Parent Weekly Report (your lessons are the evidence)","sub":"A week of growth, sent to parents every week","img":"admin_parent",
            "desc":"The report parents receive **every week** contains the child's activity for that week — **attendance days · attendance streak · AI friend chats · judgment training · words conquered · pronunciation practice**. What you create in class becomes **the evidence of growth parents actually see**.",
            "steps":[
                "Teach as usual and leave your **evaluation and pronunciation records**.",
                "Encourage students to use **AI Friend chat, judgment training and the vocabulary list**.",
                "Those activities are **counted into the weekly report automatically**."],
            "points":[
                "**Only items with real attendance and activity** are filled in — no invented numbers.",
                "The more students play the games and use their word list, the **richer the report**."],
            "tip":"One line at the end of class — 'just three words into your list today' — makes the weekly report noticeably better."}
    return {"icon":"📅","title":"Parent Weekly Report (the re-enrolment lever)","sub":"Deliver the proof of growth competitors cannot show","img":"admin_parent_weekly",
        "desc":"A report sent to parents containing the child's **week of activity** (attendance, AI friend chats, judgment training, words conquered, pronunciation). The purpose is explicit — **deliver the proof of growth competitors cannot show, every week, and convert it into re-enrolment**. The admin screen covers **preview → test send → recipient count → send log**.",
        "steps":[
            "Open **📅 Parent Weekly Report** in the admin menu.",
            "Enter a student ID and press **Preview** to check the content.",
            "If needed, use **Send to this parent** to test with a single recipient.",
            "Use **Count recipients** to see how many students can receive it (those with a registered phone number).",
            "Check **Recent send log** for what actually went out."],
        "points":[
            "What the report contains: **📅 attendance days · 🔥 streak · 🤖 AI chats · 📚 words conquered · 🧠 judgment · 🎤 pronunciation**.",
            "**Only students with a registered phone number** can receive it — the count screen also reports how many are missing one.",
            "A **Friday-evening automatic send (cron)** is prepared and ready."],
        "note":"🔴 **The full automatic send is OFF by default.** Real messages only go out after an admin turns on the KV switch — a safeguard against accidentally messaging 29,000 people. Turn it on only after the alert-talk template is approved and management has decided.",
        "tip":"Start with **preview → a single test send** only. Once the wording is settled, then turn on the full switch."}


def sec_admin_speed(aud):
    """⚡ Admin screen speed-up."""
    return {"icon":"⚡","title":"The Admin Screen Is Much Faster Now","sub":"The freeze after clicking is gone","img":"admin_dashboard",
        "desc":"We removed the **brief freeze that happened whenever you clicked something** in the admin screen. The cause was not the feature you clicked — a readability-enhancement routine was **recalculating every collapsed card each time**. It now skips collapsed cards and never re-touches what it has already processed.",
        "steps":[
            "Use the admin screen as usual.",
            "Check that menus and cards **open immediately, with no freeze**.",
            "If it still feels slow, do a **hard refresh (Ctrl+F5)** in the browser."],
        "points":[
            "Freeze on click dropped **396ms → 57ms**; idle load dropped **366ms → 0ms**.",
            "**Nothing about the look or colours changed** — only the speed.",
            "The difference is largest on card-heavy screens (teacher and student lists)."],
        "note":"If your browser still holds an old copy of the page you may not feel the improvement. Do one **hard refresh (Ctrl+F5)**.",
        "tip":"If it is still slow, check whether too many browser tabs are open."}


def sec_agency_search(aud):
    """🔎 Academy search box."""
    return {"icon":"🔎","title":"Academy Search Box (find it by name)","sub":"No more scrolling the whole list","img":"admin_dashboard",
        "desc":"The academy (branch/agency) list now has a **search box so you can find one by typing its name**. No more scrolling up and down a long list.",
        "steps":[
            "Open the **academy list** screen in the admin menu.",
            "Type part of an academy name into the **search box** above the list.",
            "The list filters to **matching academies as you type**.",
            "Clear the box to return to the **full list**."],
        "points":[
            "**A partial name is enough** to find it.",
            "The existing list and its features are unchanged — **only the way you find things was added**."],
        "tip":"For academies you check often, remember two or three letters of the name — that is enough to filter instantly."}


def sec_roster_sticky(aud):
    """🧾 Sticky first column · demo lesson."""
    if aud == "teacher":
        return {"icon":"🧾","title":"Learn the Screens with a Sample Lesson","sub":"Even when you have no class today","img":"teacher_lessons",
            "desc":"Previously, with no lesson assigned today you **could not open the textbook, video, quiz or report screens** at all. Now an admin can create a **sample lesson on the demo student account**, so you can learn the screens without affecting any real student.",
            "steps":[
                "Ask an admin to **create a sample lesson**.",
                "Use it to open the **textbook, video, quiz and report** screens.",
                "Once you are comfortable, use them the same way in a real lesson."],
            "points":[
                "Sample lessons are created **only on the demo student account (student)** — no real student data is touched.",
                "Creating a sample lesson **does not send any KakaoTalk or push notification**."],
            "tip":"Ask for one sample lesson on a new teacher's first day. A 30-minute explanation becomes a 5-minute hands-on."}
    return {"icon":"🧾","title":"Sticky First Column · Create a Sample Lesson","sub":"Scroll sideways and you still know whose row it is","img":"admin_teachers",
        "desc":"Two frustrations fixed. ① Scrolling the teacher roster to the right made the **teacher's name disappear**, so you could not tell whose row you were reading → the **first column is now pinned**. ② With no lesson today you could not check the textbook, video, quiz or report screens → a **Create Sample Lesson button** was added to the timetable card.",
        "steps":[
            "Open **Teachers → Teacher Roster**.",
            "Scroll the table **to the right** and confirm the teacher name stays pinned on the left.",
            "To check the lesson screens, press **Timetable card → Create Sample Lesson**.",
            "Enter a **teacher name** in the confirmation dialog and create it."],
        "points":[
            "The pinned column is **opaque**, so text behind it never shows through.",
            "Sample lessons are **fixed to the demo student account (student)** — real student data stays clean.",
            "Creating one **sends no KakaoTalk or push notification** (verified).",
            "The screen is labelled in **both Korean and English**."],
        "note":"Sample lessons are for checking screens. Left in place they have no effect on real settlement or statistics, because they belong to the demo account.",
        "tip":"Create one sample lesson for new-staff training and you can demonstrate the entire flow without any real student."}


def sec_contact_hours(aud):
    """📞 Unified support hours and channel order."""
    if aud in ("student",):
        return {"icon":"📞","title":"KakaoTalk Is the Fastest Way to Reach Us","sub":"Support 10:00–23:00 · closed weekends & holidays","img":"common_contact",
            "desc":"When you have a question, **KakaoTalk channel is the fastest channel**. Support hours are **10:00 to 23:00** (closed weekends and public holidays) — previously different screens showed different hours, now they all say the same thing.",
            "steps":[
                "Open the **Contact** screen.",
                "Use the **KakaoTalk channel** at the top — it is the fastest.",
                "You can still call the main number, but KakaoTalk is quicker."],
            "points":[
                "Support hours: **10:00–23:00**, closed weekends and public holidays.",
                "Messages left late at night are answered in the next support window."],
            "tip":"For a problem right before class, include your **student ID and class time** in the KakaoTalk message — it gets resolved much faster."}
    return {"icon":"📞","title":"Unified Support Hours & Channel Order (KakaoTalk first)","sub":"One value across every screen","img":"common_contact",
        "desc":"Support hours previously appeared as **09-22 / 10-20 / 7 p.m.** on different screens. They are now unified to **10:00–23:00 (closed weekends and public holidays)**. The **KakaoTalk channel was also moved to first place**, and the phone card now notes that KakaoTalk is faster.",
        "steps":[
            "On the **Contact** screen, confirm the card order is **KakaoTalk → phone**.",
            "When advising parents, **point them to the KakaoTalk channel first**.",
            "Quote support hours as **10:00–23:00 (closed weekends and holidays)**."],
        "points":[
            "Places corrected: contact screen, home menu, FAQ (both languages), AI consultant fact block, student FAQ — **all the same value now**.",
            "The unused **fax number and placeholder phone numbers were deleted**.",
            "The AI consultant quotes the same hours and the same channel order."],
        "note":"If real operating hours change, **all of these must be updated together**. Changing only one brings the inconsistency straight back.",
        "tip":"If you need the Philippines call-centre numbers listed, provide the real ones — the previous placeholders were removed."}


def sec_teacher_calendar(aud):
    """📆 Work / break / leave registration."""
    if aud == "teacher":
        return {"icon":"📆","title":"Registering Work Hours, Breaks and Leave","sub":"Now reachable directly from Teachers","img":"teacher_mypage",
            "desc":"The screen for registering work hours, breaks and leave **always existed — but there was no entry point in the teacher's path**, so nobody could find it. A **shortcut has now been added to the Teachers screen**, so you can get there in one step.",
            "steps":[
                "Open the **Teachers** screen.",
                "Press the **Work / Break / Leave** shortcut.",
                "Pick the date and time on the calendar and register.",
                "What you register affects assignment — please enter it **in advance**."],
            "points":[
                "The feature was never missing — **only the route to it was**. How you register has not changed.",
                "The earlier you register leave, the more reliably it is reflected in assignments."],
            "note":"For time slots that already have assigned lessons, please check with an admin before registering.",
            "tip":"Register the whole month's leave at the start of each month and scheduling conflicts almost disappear."}
    return {"icon":"📆","title":"Work / Break / Leave — Entry Point Added","sub":"The real cause behind 'this feature doesn't exist'","img":"admin_teachers",
        "desc":"Teachers reporting that **'work, break and leave registration doesn't work'** were not describing a missing feature — they were describing a **missing entry point**. The screen already existed under System ▸ Calendar, but **there was no route to it from the teacher's path**. A shortcut on the Teachers screen fixed it.",
        "steps":[
            "Confirm the **Work / Break / Leave shortcut** is present on the **Teachers** screen.",
            "When a teacher asks, point them to this route.",
            "The original **System ▸ Calendar** route still works."],
        "points":[
            "**No new feature was built — a connection was added.** Data and behaviour are unchanged.",
            "A large share of teacher complaints turn out to be this same **'missing connection'** pattern."],
            "tip":"When a teacher reports a missing feature, first check whether the screen really is absent. Usually only the entry point is."}


# ── 2026-07-25 new-feature sections (Jul 24–25, per audience) ──
MANUALS["student"]["sections"] += [sec_rescue("student"), sec_report_pentagon("student")]
MANUALS["teacher"]["sections"] += [sec_report_ops("teacher")]
MANUALS["admin"]["sections"]   += [sec_teacher_roster("admin"), sec_report_ops("admin")]
for _aud in ("branch", "agency"):
    MANUALS[_aud]["sections"] += [sec_teacher_roster(_aud), sec_report_ops(_aud)]

# ── 2026-07-26~28 new-feature sections (per audience) ──
MANUALS["student"]["sections"] += [
    sec_home_hero("student"), sec_game_escape("student"), sec_vocab_hub("student"),
    sec_pw_reset("student"), sec_payment_step("student"), sec_sample_report("student"),
    sec_parent_menu("student"), sec_contact_hours("student")]
MANUALS["teacher"]["sections"] += [
    sec_game_escape("teacher"), sec_vocab_hub("teacher"), sec_teacher_calendar("teacher"),
    sec_roster_sticky("teacher"), sec_parent_weekly("teacher")]
MANUALS["admin"]["sections"] += [
    sec_parent_weekly("admin"), sec_home_hero("admin"), sec_admin_speed("admin"),
    sec_agency_search("admin"), sec_roster_sticky("admin"), sec_teacher_calendar("admin"),
    sec_payment_step("admin"), sec_sample_report("admin"), sec_parent_menu("admin"),
    sec_pw_reset("admin"), sec_contact_hours("admin")]
for _aud in ("branch", "agency"):
    MANUALS[_aud]["sections"] += [
        sec_parent_weekly(_aud), sec_home_hero(_aud), sec_admin_speed(_aud),
        sec_agency_search(_aud), sec_payment_step(_aud), sec_sample_report(_aud),
        sec_contact_hours(_aud)]

# auto-number sections
for _m in MANUALS.values():
    for _i, _s in enumerate(_m["sections"], 1):
        _s["no"] = _i

COVERS = {
    "student": ("Student User Guide", "Easy on your own — the complete Mangoi guide"),
    "admin":   ("Admin User Guide", "Everything about running your academy, in one book"),
    "teacher": ("Teacher User Guide", "Follow the lesson flow — how to use the site"),
    "branch":  ("Branch User Guide", "Sub-agencies, settlement & performance in one book"),
    "agency":  ("Agency User Guide", "From enrollment to lessons and settlement, in one book"),
}
