// SIU ADVANCE 004 — Environment (8판 형식, units/001.mjs 본보기)
// 원본과 다른 점:
//  - 원본 문법 = Passive voice(수동태). 예문 "Marry cleaned the classroom" → 이름 철자 Mary 로 바로잡음. 형식표(+ − ?) 는 원본대로 살림
//  - Q2 "Can you suggest three things that each of us can do to help preserve our planet?" → "What are three things each of us can do to preserve our planet?"
//  - Q2 대답 틀 "I cant please them its because" (1단원에서 잘못 들어온 줄) → 이 질문에 맞게 새로 씀
//  - Q8 "recycle papers, plastics, cans, glass bottle etc." → "recycle paper, plastic, cans and glass?"
//  - Q10 "Do you think nuclear power is safe for our environment?" 그대로
//  - Keyword Cause(noun) → 질문에서 동사로 쓰여 verb 로 바로잡음. Affected(adj) → "affected by" 로 쓰여 뜻 그대로
//  - 대답 틀 "The countries cause most of the pollution is its because" · "For I think they will have to" → 문법에 맞게 새로 씀
//  - Q6 "Which countries cause the most pollution?" 는 특정 나라 탓하기가 되지 않게 모범 답을 «에너지를 많이 쓰는 큰 나라들» 로 일반화
export default {
 no: "a004",
 title: "Environment",
 book: "SIU ADVANCE 004 - Environment",
 next: "005 Technology and Inventions",
 cover: { h1: "Our", em: "Environment", goals: ["Talk about environmental problems", "Suggest ways to protect the planet", "Use the passive voice"] },
 KW: [
  ["serious", "adjective", "심각한", "very bad and worrying; needing attention"],
  ["preserve", "verb", "보존하다", "to keep something safe and as it is"],
  ["climate", "noun", "기후", "the usual weather in a place over a long time"],
  ["affected", "adjective", "영향을 받은", "changed by something from outside"],
  ["home", "noun", "집, 가정", "the place where you live"],
  ["cause", "verb", "일으키다, 원인이 되다", "to make something happen"],
  ["energy", "noun", "에너지", "power that gives light, heat or moves machines"],
  ["recycle", "verb", "재활용하다", "to make used things into new things"],
  ["overpopulation", "noun", "인구 과잉", "too many people living in one place"],
  ["nuclear", "adjective", "원자력의, 핵의", "using power from splitting atoms"]
 ],
 QS: [
  "What are the most serious environmental problems today?",
  "What are three things each of us can do to preserve our planet?",
  "What is your opinion on climate change?",
  "How will our children be affected by climate change?",
  "How can we make our homes more environmentally friendly?",
  "Which countries cause the most pollution?",
  "If we run out of oil, where will we get our energy from?",
  "Do you think people should recycle paper, plastic, cans and glass?",
  "Do you think overpopulation is an important environmental issue?",
  "Do you think nuclear power is safe for our environment?"
 ],
 IMG_E: ["scene-words/13185", "scene-words/18949", "scene-words/18547", "scene-words/18108", "scene-words/12069", "scene-words/14650", "scene-words/12939", "scene-words/13224", "scene-words/12563", "scene-words/18294"],
 IMG_H: ["scene-words/20314", "scene-words/18998", "scene-words/14525", "scene-words/18459", "scene-words/14081", "scene-words/19779", "scene-words/19877", "scene-words/13224", "scene-words/16683", "scene-words/18228"],
 PICS: {
  opener: "scene-words/18720",
  talk: "scene-words/18819",
  group: "scene-words/18998",
  speech: "scene-words/19705",
  reporter: "scene-words/18278",
  survey: "scene-words/13224",
  pron: "scene-words/16172",
  roleB: "scene-words/17284",
  cover: "scene-words/18998",
  back: "scene-words/12685"
 },
 gram1: {
  can: "use the passive voice",
  title: "Passive",
  em: "Voice",
  rules: [
   ["Active = who does it", "Mary <b>cleaned</b> the classroom."],
   ["Passive = what happens", "The classroom <b>was cleaned</b> (by Mary)."]
  ],
  hardNote: "be + past participle · is made · was built · will be used · by …",
  say: [
   "We use the passive voice when the action is more important than who does it.",
   "Mary cleaned the classroom.",
   "The classroom was cleaned by Mary."
  ]
 },
 gram2: {
  can: "ask \"Is it recycled?\"",
  cols: ["Present — is / are + p.p.", "Past — was / were + p.p."],
  rows: [
   ["+", "Plastic <b>is recycled</b> here.", "The park <b>was cleaned</b> yesterday."],
   ["−", "Glass <b>isn't thrown</b> away.", "The trees <b>weren't cut</b> down."],
   ["?", "<b>Are</b> cans <b>collected</b> on Monday?", "<b>Was</b> the river <b>polluted</b>?"]
  ]
 },
 gapCan: "ask \"What was done…?\"",
 role: {
  title: "The",
  em: "Green",
  tail: "Reporter",
  opener: "Hello! I'm from the school news. What is your eco-club doing?",
  a: "Reporter",
  b: "Eco-club leader"
 },
 pron: {
  can: "say -ed endings clearly",
  title: "Three sounds of",
  em: "-ed",
  game: "Teacher says a verb → you say the -ed form and make a passive sentence: <i>\"The bottles were recycled.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["The most serious problem is plastic waste.", "A lot of plastic is thrown into the sea."],
   ["We can recycle, save water and walk more.", "I bring my own bottle to school."],
   ["I think climate change is very serious.", "Summers are getting hotter every year."],
   ["They will be affected by hot weather and storms.", "Some animals may disappear."],
   ["We can turn off lights and use solar panels.", "My family uses LED lights."],
   ["Big countries with many factories cause the most.", "They use a lot of coal and oil."],
   ["We can get energy from the sun and wind.", "Solar panels are used on many roofs."],
   ["Yes, I do. Recycling saves resources.", "At my school, paper is collected every week."],
   ["Yes, I think it is.", "More people use more water and food."],
   ["I'm not sure. It's clean, but it can be dangerous.", "Waste is hard to store safely."]
  ],
  frame: [
   "The most serious problem is ___.",
   "We can ___, ___ and ___.",
   "I think climate change is ___.",
   "They will be affected by ___.",
   "We can ___ and ___.",
   "Countries with ___ cause the most pollution.",
   "We can get energy from ___.",
   "Yes / No. At my school, ___ is collected ___.",
   "Yes / No, I think ___.",
   "I think nuclear power is ___ because ___."
  ],
  bank: [
   ["plastic waste", "air pollution", "climate change", "cutting trees"],
   ["recycle", "save water", "walk more", "plant trees"],
   ["serious", "scary", "a big problem", "real"],
   ["hot weather", "storms", "floods", "dirty air"],
   ["turn off lights", "use solar panels", "save water", "use less plastic"],
   ["many factories", "many cars", "lots of coal", "big cities"],
   ["the sun", "the wind", "water", "plants"],
   ["paper", "plastic", "every week", "on Mondays"],
   ["it is important", "it isn't a big problem", "cities are crowded", "we need more food"],
   ["safe / clean", "dangerous / risky", "cheap", "useful"]
  ],
  more: [
   ["Which problem worries you most?", "Why?"],
   ["What do you do every day?", "What can your school do?"],
   ["Is the weather changing in Korea?", "How do you feel about it?"],
   ["Which animals are in danger?", "What can we do for them?"],
   ["Do you turn off the lights?", "Does your home recycle?"],
   ["Is there pollution in your city?", "Where does it come from?"],
   ["Have you seen solar panels?", "Where?"],
   ["What do you recycle at home?", "Is it easy?"],
   ["Is your city crowded?", "Would you like a quiet town?"],
   ["Is nuclear power used in Korea?", "Would you live near a plant?"]
  ],
  gram1: {
   chain: ["At my school, ___ is recycled.", "Yesterday, ___ was cleaned."],
   ex: "T: At my school, paper is recycled.<br>S: At my school, cans are recycled.<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Is paper recycled?", "Are lights turned off?", "Is water saved?", "Was the park cleaned?", "Were trees planted?"],
    ans: "Yes, it is. / No, it wasn't. <b>+ one more</b>"
   },
   b: {
    title: "My school",
    big: "At my school, ___ is recycled. ___ is not recycled.",
    ans: "Then ask: <b>What is recycled at your home?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What are the students worried about?", "Is your city clean or dirty?", "What do you do to help the Earth?"]
  },
  convo: [
   ["A", "Hey! Don't throw that on the ground."],
   ["B", "Oops, sorry. Where's the trash can?"],
   ["A", "Over there. {Plastic} is recycled here."],
   ["B", "Oh, I didn't know. Is {paper} recycled, too?"],
   ["A", "Yes! It's collected {every Monday}."],
   ["B", "Cool. I'll {bring my own bottle} next time."]
  ],
  swap: [["something to recycle", "Plastic"], ["another thing", "paper"], ["when", "every Monday"], ["a green promise", "bring my own bottle"]],
  lang: [
   ["Warn", ["Don't …!", "Be careful!"]],
   ["Suggest", ["We should …", "Why don't we …?"]],
   ["Agree", ["Good idea!", "Let's do it!"]]
  ],
  langPractice: ["I use plastic bags every day.", "My family has two cars.", "I take long showers.", "I never recycle.", "I walk to school.", "I leave the lights on."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["recycle at home", "turn off the lights", "use your own bottle", "take short showers", "walk or ride a bike", "use plastic bags"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Green Day at school",
   q: ["What was cleaned?", "How many trees were planted?", "What was collected?", "Who was the prize given to?"],
   A: [["cleaned", "the playground"], ["trees planted", "?"], ["collected", "old batteries"], ["prize given to", "?"]],
   B: [["cleaned", "?"], ["trees planted", "twenty"], ["collected", "?"], ["prize given to", "Class 2-3"]],
   tip: "It <b>was</b> cleaned · They <b>were</b> planted"
  },
  role: {
   A: ["You are a school reporter.", "Ask 5 questions about the eco-club.", "Write 3 facts."],
   B: ["You are the eco-club leader.", "Choose: recycling / tree planting / beach clean-up.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a \"Green school\" poster",
   steps: ["Pick 3 green actions.", "Ask your teacher. Answer, too.", "Choose the best one.", "Draw it and tell!"],
   lang: ["At our school, ___ should be recycled.", "We should ___.", "___ will be saved."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Today I'll talk about plastic.", "Too much plastic is used every day.", "A lot of it is thrown into the sea.", "Sea animals are hurt by it.", "I bring my own bottle and bag.", "Let's use less plastic. Thank you!"],
   outline: ["Hello + the problem", "Why it's bad", "Who is hurt", "What you do", "Ending + thank you"],
   check: ["Clear voice", "Look at your teacher", "Use 1 passive sentence"]
  },
  pron: {
   cols: [["/t/", ["washed", "helped", "dropped"]], ["/d/", ["recycled", "used", "saved"]], ["/ɪd/", ["polluted", "planted", "collected"]]],
   up: "Is paper recycled here?",
   down: "What was collected today?"
  },
  review: ["I can talk about the environment.", "I can use is / was + p.p.", "I can suggest green ideas.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Climate change is the most serious problem.", "It makes every other problem worse.", "Heat waves are breaking records every summer.", "Which problem worries you most?"],
   ["Eat less meat, use public transport and buy less.", "These three cut our carbon footprint the most.", "I switched to the subway and saved money, too.", "Which would be hardest for you?"],
   ["I think it's real and mostly caused by humans.", "Scientists around the world agree on this.", "Korea's spring is shorter than it was 30 years ago.", "Have you noticed changes where you live?"],
   ["They'll be affected by extreme weather and food prices.", "Crops will be damaged by droughts and floods.", "Some islands may even disappear under the sea.", "Do you think it's too late to act?"],
   ["Insulate them well and install solar panels.", "Most home energy is used for heating and cooling.", "My parents' bills dropped 30% after new windows.", "What's one change you could make at home?"],
   ["Big industrial countries cause the most in total.", "They burn huge amounts of coal and oil.", "But per person, some rich small countries are worse.", "Should rich countries pay more to fix it?"],
   ["We'll get it from solar, wind and hydro power.", "Renewables are getting cheaper every year.", "Whole towns are now powered by wind farms.", "Which energy source do you trust most?"],
   ["Yes, but recycling alone isn't enough.", "Much of our plastic is never actually recycled.", "Some is shipped abroad and burned.", "Is reducing better than recycling?"],
   ["Yes, but consumption matters even more.", "A few rich people use far more resources.", "One flight can produce more CO2 than a year of driving.", "Is the real problem people or lifestyles?"],
   ["I think it's safe if it's managed very carefully.", "It produces almost no carbon.", "But the Fukushima accident showed the risks.", "Would you accept a plant near your city?"]
  ],
  frame: [
   "… is the most serious because … For example, …",
   "We can …, … and … because …",
   "I think climate change is … because …",
   "They will be affected by … because …",
   "We can … Most energy is used for …",
   "… cause the most because … However, …",
   "We will get energy from … because …",
   "Yes / No, but … because …",
   "I think it is / isn't … because …",
   "I think nuclear power is … because … However, …"
  ],
  more: [
   ["Are people doing enough?", "Is this problem worse in Asia or Europe?", "What will be the biggest problem in 2050?"],
   ["Is one person's action meaningful?", "Should green habits be required by law?", "Which habit would you give up for the planet?"],
   ["Why do some people deny climate change?", "Should schools teach about it more?", "Would you pay a carbon tax?"],
   ["Should people have fewer children because of it?", "What will school be like for them?", "What would you tell a child in 2050?"],
   ["Are eco-friendly homes too expensive?", "Should the government pay for solar panels?", "Would you live in a tiny home?"],
   ["Is it fair to blame developing countries?", "Should polluters pay a fine?", "Can companies be trusted to reduce pollution?"],
   ["Will electric cars really help?", "What happens on days without sun or wind?", "Would you pay more for green electricity?"],
   ["Should plastic packaging be banned?", "Why don't people recycle properly?", "Should stores be fined for too much packaging?"],
   ["Is overpopulation a problem in Korea or the opposite?", "Can technology feed 10 billion people?", "Should governments control population?"],
   ["Is nuclear better than coal?", "Where should nuclear waste be stored?", "Should Korea build more plants?"]
  ],
  gram1: {
   chain: ["In my city, ___ is ___ every day.", "Last year, ___ was ___."],
   ex: "T: In my city, trash is collected every day.<br>S: In my city, … is …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Is your trash sorted?", "Was your home built long ago?", "Are solar panels used here?", "Were you taught about climate?", "Will coal be banned?"],
    ans: "Yes, it is. / No, … <b>+ why?</b>"
   },
   b: {
    title: "News headlines",
    big: "Yesterday, a new park was ___. Next year, plastic bags will be ___.",
    ans: "Then ask: <b>What should be banned next?</b>"
   }
  },
  opener: {
   think: ["Who is most responsible for protecting the planet?", "Is climate change the biggest problem we face?", "What green habit is hardest for you?"]
  },
  convo: [
   ["A", "Did you see the news? {The river} was polluted again."],
   ["B", "Seriously? By whom this time?"],
   ["A", "Waste was dumped there by {a factory}."],
   ["B", "That's awful. Were they fined?"],
   ["A", "Not yet. The case is being investigated."],
   ["B", "Companies like that should be punished."],
   ["A", "I agree. But we can help, too."],
   ["B", "Like what?"],
   ["A", "We could join the {clean-up} this Saturday."]
  ],
  swap: [["a place", "The river"], ["who did it", "a factory"], ["an action", "clean-up"], ["when", "this Saturday"]],
  lang: [
   ["React to news", ["Seriously?", "That's awful.", "I can't believe it."]],
   ["Give an opinion", ["I think … should be …", "In my view, …"]],
   ["Suggest", ["We could …", "What if we …?"]],
   ["Agree / disagree", ["I agree.", "That's true, but …"]]
  ],
  langPractice: ["Recycling is a waste of time.", "Climate change isn't real.", "Electric cars are the answer.", "One person can't make a difference.", "Nuclear power is too risky.", "Plastic bags should be banned."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["sort your trash carefully", "eat meat every day", "use public transport", "buy second-hand things", "avoid plastic bags", "worry about climate change"],
   q: "Do you …? → Why? / How often? / Is it hard?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Greenville's new plan",
   q: ["What was banned?", "What was built?", "How much energy is made by the sun?", "What will be planted?", "Who was the plan made by?"],
   A: [["banned", "plastic bags"], ["built", "?"], ["solar energy", "40% of the city's power"], ["will be planted", "?"], ["made by", "?"]],
   B: [["banned", "?"], ["built", "100 km of bike lanes"], ["solar energy", "?"], ["will be planted", "10,000 trees"], ["made by", "a team of students"]],
   tip: "It <b>was</b> built · They <b>will be</b> planted"
  },
  role: {
   A: ["You are a news reporter.", "Ask 5 questions + 2 follow-ups.", "Report 3 facts using the passive."],
   B: ["You are the city's environment officer.", "Choose: air / water / trash problem.", "Explain what was done and what will be done."]
  },
  tts: {
   title: "Design a \"Green city\" plan",
   steps: ["Think: what is your city's biggest problem?", "Ask your teacher 4 of today's questions.", "Agree on 3 changes together.", "Present your plan in 1 minute."],
   lang: ["First, ___ should be banned.", "___ will be built so that ___.", "We think ___ because ___."]
  },
  speech: {
   time: "2 min",
   model: ["Good afternoon. Today I'll talk about plastic.", "Every year, millions of tons of plastic are thrown away.", "Most of it is never recycled.", "A lot of it is carried into the ocean.", "Sea animals are killed by it every day.", "I think single-use plastic should be banned.", "Until then, we can refuse straws and bring our own bags.", "Thank you. Any questions?"],
   outline: ["Hook — the problem", "A fact with numbers", "Who is affected", "Your opinion", "A simple solution", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Passive voice ×3", "Answer 1 question"]
  },
  pron: {
   cols: [["/t/", ["reduced", "produced", "dumped"]], ["/d/", ["recycled", "banned", "powered"]], ["/ɪd/", ["affected", "polluted", "protected"]]],
   up: "Was the river polluted?",
   down: "How is energy produced here?"
  },
  review: ["I can answer in 4 parts.", "I can use the passive voice.", "I can give opinions on the environment.", "I can present a green plan."]
 }
};
