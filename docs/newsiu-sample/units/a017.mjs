// SIU ADVANCE 017 — Punishment (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법 예문 "He quickly agreed…" 두 줄은 뜻 차이(동사 앞/문장 끝)만 보여 줘서, 규칙(형용사+ly · 위치)으로 다시 정리
//  - Q2 "How should teachers punish bad students?" → "…students who behave badly?" (학생을 «나쁜 아이»로 부르지 않게. Keyword bad 는 그대로)
//  - Q3 "Are natural disasters God's Punishment for sin?" → 대문자 P 바로잡음
//  - Q4 "Do you the death penalty is a good idea?" → "Do you think the death penalty is a good idea?" (think 빠짐)
//  - Q5 "Do you think punishment is a good way…" → "Is punishment a good way…" (카드 칸에 맞게 줄임, 뜻 같음)
//  - Q10 "What are the good and bad side of punishment" → "What are the good and bad sides of punishment?"
//  - Keyword Side 의 품사가 verb(편들다)로 되어 있었으나 질문에서는 명사(면) → noun 으로 바로잡음
//  - Keyword Required 한글 뜻 «요청하다»(동사) → «의무적인, 필수의»(형용사)
//  - 대답 틀 Q1 "A: The advantages and disadvantages of being a man is" 는 다른 단원 것이 섞임 → 새로 씀
// 민감 내용: 쉬운 판은 학교·가정 규칙, 공정함, 사과·책임으로만 말함(사형·감옥은 «생명은 소중하다 / 바뀔 기회» 수준). 어려운 판은 사형·종신형을 성숙하게 토론.
export default {
 no: "a017",
 title: "Punishment",
 book: "SIU ADVANCE 017 - Punishment",
 next: "018 Work",
 cover: { h1: "Crime and", em: "Punishment", goals: ["Talk about rules and fairness", "Ask and answer 10 questions", "Describe actions with adverbs"] },
 KW: [
  ["punishment", "noun", "처벌, 벌", "something bad that happens to you because you broke a rule"],
  ["bad", "adjective", "나쁜, 잘못된", "not good; not acceptable"],
  ["sin", "noun", "(종교·도덕적) 죄", "an act that breaks a religious or moral rule"],
  ["penalty", "noun", "처벌, 벌금, 형벌", "a punishment for breaking a law or rule"],
  ["young", "adjective", "어린, 젊은", "not old; in the early part of life"],
  ["jail", "noun", "감옥, 교도소", "a place where people who broke the law are kept"],
  ["required", "adjective", "의무적인, 필수의", "that must be done because of a rule"],
  ["receive", "verb", "받다", "to get something that someone gives you"],
  ["imprisonment", "noun", "징역, 투옥", "the state of being kept in prison"],
  ["side", "noun", "면, 측면", "one part or way of looking at something"]
 ],
 QS: [
  "What is the purpose of punishment?",
  "How should teachers punish students who behave badly?",
  "Are natural disasters God's punishment for sin?",
  "Do you think the death penalty is a good idea?",
  "Is punishment a good way to teach young people a lesson?",
  "Would you rather be dead than spend your life in jail?",
  "Should prisoners be required to work?",
  "What was the worst punishment you received as a child?",
  "Which is worse, life imprisonment or the death penalty?",
  "What are the good and bad sides of punishment?"
 ],
 IMG_E: ["scene-words/16341", "scene-words/15206", "scene-words/17347", "scene-words/13065", "scene-words/15415", "scene-words/14933", "scene-words/17334", "scene-words/14182", "scene-words/14145", "scene-words/18755"],
 IMG_H: ["scene-words/18537", "scene-words/16306", "scene-words/14373", "scene-words/14145", "scene-words/17335", "scene-words/17337", "scene-words/17334", "scene-words/15415", "scene-words/14933", "scene-words/18912"],
 PICS: {
  opener: "scene-words/18537",
  talk: "scene-words/15206",
  group: "scene-words/17285",
  speech: "scene-words/16688",
  reporter: "scene-words/16386",
  survey: "scene-words/18339",
  pron: "scene-words/19705",
  roleB: "scene-words/16306",
  cover: "scene-words/17285",
  back: "scene-words/18688"
 },
 gram1: {
  can: "say how something happens",
  title: "Adverbs of",
  em: "Manner",
  rules: [
   ["adjective + ly", "The teacher spoke <b>calmly</b> to him."],
   ["After the verb", "She apologized <b>sincerely</b>."]
  ],
  hardNote: "fair → fairly · careful → carefully · good → well · hard → hard",
  say: [
   "Adverbs of manner tell us how something happens.",
   "The teacher spoke calmly to him.",
   "She apologized sincerely."
  ]
 },
 gram2: {
  can: "ask \"How did…?\"",
  cols: ["Regular (+ly)", "Irregular"],
  rows: [
   ["+", "The judge acted <b>fair<mark>ly</mark></b>.", "He works <b>hard</b>."],
   ["−", "She didn't speak <b>polite<mark>ly</mark></b>.", "They didn't do <b>well</b>."],
   ["?", "Did he listen <b>careful<mark>ly</mark></b>?", "Did she run <b>fast</b>?"]
  ]
 },
 gapCan: "ask \"What happened…?\"",
 role: {
  title: "The",
  em: "Fair Principal",
  tail: "Meeting",
  opener: "Please sit down. Can you tell me what happened?",
  a: "Principal",
  b: "Student"
 },
 pron: {
  can: "stress words with -ly",
  title: "Stress in",
  em: "-ly adverbs",
  game: "Teacher says an adjective → you say the adverb and a sentence: <i>\"careful → carefully. He listened carefully.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["Its purpose is to stop bad behavior.", "It teaches people to follow rules."],
   ["Teachers should talk to them calmly first.", "Then the students could clean the classroom."],
   ["No, I don't think so.", "Disasters just happen in nature."],
   ["No, I don't think it's a good idea.", "Every life is important, and a court can make mistakes."],
   ["Yes, sometimes.", "But a clear reason works better."],
   ["No, I'd rather be alive.", "In jail, I could still change and help others."],
   ["Yes, I think they should work.", "They can learn useful skills for their future."],
   ["I couldn't use my phone for a week.", "I was upset, but I learned to finish my homework first."],
   ["I think life imprisonment is worse.", "You lose your freedom for a very long time."],
   ["It teaches people the rules.", "But some people just get angry."]
  ],
  frame: [
   "Its purpose is to ___.",
   "Teachers should ___ first. Then ___.",
   "Yes, I think so. / No, I don't think so. Disasters ___.",
   "Yes / No. I think it's ___ because ___.",
   "Yes / No. ___ works better.",
   "I'd rather ___.",
   "Yes / No, they should ___. They can ___.",
   "The worst punishment I received was ___.",
   "I think ___ is worse because ___.",
   "Good side: ___. Bad side: ___."
  ],
  bank: [
   ["stop bad behavior", "teach rules", "protect people", "be fair"],
   ["talk calmly", "listen carefully", "call parents", "give extra work"],
   ["happen naturally", "come from nature", "are not a punishment", "can't be stopped"],
   ["a bad idea", "unfair", "too cruel", "necessary"],
   ["Talking", "A reward", "A reason", "Punishment"],
   ["be alive", "have hope", "change", "help others"],
   ["work", "learn skills", "grow food", "clean"],
   ["no phone", "no TV", "no games", "extra chores"],
   ["life imprisonment", "the death penalty", "losing freedom", "being alone"],
   ["people learn", "it's fair", "people feel angry", "it hurts feelings"]
  ],
  more: [
   ["Who makes your school rules?", "What if you break one?"],
   ["What is a fair punishment at school?", "Is shouting at students okay?"],
   ["What disasters do you know?", "How can we help after one?"],
   ["What should happen to people who break the law?", "Can a court make mistakes?"],
   ["Did a punishment help you?", "Are rewards better?"],
   ["What would you miss most in jail?", "Can people really change?"],
   ["What work could prisoners do?", "Should they get paid?"],
   ["Were you punished fairly?", "What did you learn?"],
   ["Why do people break the law?", "What is freedom to you?"],
   ["Do punishments always work?", "What works better?"]
  ],
  gram1: {
   chain: ["My teacher speaks ___.", "I do my homework ___."],
   ex: "T: My teacher speaks slowly.<br>S: My teacher speaks clearly.<br>T: I …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Do you speak quietly?", "Do you walk slowly?", "Do you eat quickly?", "Do you write neatly?", "Do you sing loudly?"],
    ans: "Yes, I do. / No, I don't. <b>+ one more sentence</b>"
   },
   b: {
    title: "A fair teacher",
    big: "A fair teacher speaks ___ and listens ___.",
    ans: "Then ask: <b>How does your teacher speak?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What is the judge doing?", "Why do we have rules at school?", "What is a fair punishment?"]
  },
  convo: [
   ["A", "Why do you look so upset?"],
   ["B", "I {was late for class} again."],
   ["A", "Oh no. What was the punishment?"],
   ["B", "I have to {clean the classroom}."],
   ["A", "Is that fair?"],
   ["B", "I think it's {fair}. I broke the rule."],
   ["A", "Next time, leave home {earlier}!"]
  ],
  swap: [["a rule you broke", "was late for class"], ["a punishment", "clean the classroom"], ["your opinion", "fair"], ["advice", "earlier"]],
  lang: [
   ["Give an opinion", ["I think …", "In my opinion, …", "I don't think so."]],
   ["Ask for reasons", ["Why?", "Is that fair?"]],
   ["Agree / disagree", ["I agree.", "I'm not sure."]]
  ],
  langPractice: ["Phones should be banned at school.", "Homework is a punishment.", "Rules make school safe.", "Being late is not a big deal.", "Teachers should never shout.", "Everyone breaks rules sometimes."],
  survey: {
   ask: "Do you think",
   cols: ["Me", "My teacher"],
   rows: ["school rules are fair", "phones should be banned in class", "being late deserves a punishment", "rewards work better than punishment", "parents should be strict", "people can change"],
   q: "Do you think …?  → Yes, I do. / No, I don't.",
   report: "I think ___, but my teacher thinks ___."
  },
  gap: {
   who: "Minho at school",
   q: ["What rule did Minho break?", "How did he feel?", "What was his punishment?", "What did he learn?"],
   A: [["rule", "used his phone in class"], ["feeling", "?"], ["punishment", "no phone for a day"], ["learned", "?"]],
   B: [["rule", "?"], ["feeling", "very embarrassed"], ["punishment", "?"], ["learned", "to listen carefully"]],
   tip: "He listened <b>carefully</b> · She spoke <b>calmly</b>"
  },
  role: {
   A: ["You are the principal.", "Ask what happened.", "Choose a fair punishment."],
   B: ["You broke a school rule.", "Choose: late / phone in class / no homework.", "Explain and say sorry."]
  },
  tts: {
   title: "Make fair class rules",
   steps: ["Think of 3 class rules.", "Ask your teacher what they think.", "Agree on a fair result for each rule.", "Show your poster and explain!"],
   lang: ["Rule 1: Students must ___.", "If someone ___, they will ___.", "I think this is fair because ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Today I'll talk about rules.", "At my school, we can't use phones in class.", "If you break this rule, the teacher keeps your phone.", "I think this rule is fair.", "It helps us listen carefully.", "Thank you!"],
   outline: ["Hello", "A rule at your school", "What happens if you break it", "Is it fair? Why?", "Thank you!"],
   check: ["Loud voice", "Look at your teacher", "Use one adverb"]
  },
  pron: {
   cols: [["Oo-ly", ["QUICKly", "FAIRly", "STRICTly"]], ["Ooo-ly", ["CAREfully", "HONestly", "PATiently"]], ["oOo-ly", ["sinCEREly", "poLITEly", "exACTly"]]],
   up: "Is that rule fair?",
   down: "Why do we have rules?"
  },
  review: ["I can talk about rules and fairness.", "I can use adverbs like calmly.", "I can give my opinion.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I think the main purpose is to prevent future crime.", "If people fear the result, they think twice.", "Speed cameras quickly made drivers slow down in my city.", "Do you think fear really changes behavior?"],
   ["Teachers should respond calmly, not angrily.", "Students learn more when they understand why.", "My teacher had a bully write a real apology.", "How were students punished at your school?"],
   ["No, I don't believe that at all.", "Disasters are caused by nature, and they hurt innocent people.", "The 2004 tsunami killed thousands of children who did nothing wrong.", "Why do you think some people believe it?"],
   ["Personally, I'm against the death penalty.", "Courts make mistakes that can't be undone.", "Some prisoners were later proven innocent by DNA.", "Would you change your mind for terrible crimes?"],
   ["Only partly.", "Young people learn when adults explain patiently.", "When I lied, a long talk worked better than grounding.", "What worked for you?"],
   ["No, I'd rather live, even in jail.", "As long as you're alive, there's a chance to change.", "Some prisoners write books or earn degrees behind bars.", "Which would you choose, honestly?"],
   ["Yes, I think prisoners should be required to work.", "Work gives them skills and a daily routine.", "Prison programs that teach woodworking help people find jobs later.", "Should they be paid fairly for that work?"],
   ["I once lost my phone for a month.", "It felt unfair, but I studied seriously.", "I actually read five books that month.", "What punishment do you remember?"],
   ["I think life imprisonment is harder to endure.", "You live for decades without freedom or hope.", "Some prisoners say that waiting year after year is the real punishment.", "Which do you think is more humane?"],
   ["It protects people and sets clear limits.", "But it can make people bitter, not better.", "Harsh prisons often have more repeat crime.", "Can you think of a better system?"]
  ],
  frame: [
   "I think the main purpose is to … because …",
   "Teachers should respond … because … For example, …",
   "I do / don't believe that because …",
   "Personally, I'm for / against … because …",
   "Punishment can …, but … works better.",
   "I'd rather … because … For example, …",
   "I think prisoners should / shouldn't … because …",
   "My worst punishment was … It made me …",
   "I think … is harder to endure because …",
   "The good side is … , but …"
  ],
  more: [
   ["Is punishment more about justice or revenge?", "Who should decide punishments?", "Would society work without punishment?"],
   ["Should schools use detention?", "Is punishing the whole class okay?", "What punishment is unfair?"],
   ["How do different religions explain disasters?", "Why do people look for meaning in tragedy?", "Does science answer every question?"],
   ["Does the death penalty stop crime?", "Which countries still use it?", "Would you feel differently as a victim?"],
   ["Are parents too strict or too soft?", "Should kids be punished in public?", "Discipline or punishment — the difference?"],
   ["What would you do to stay sane in prison?", "Should very old prisoners be released?", "Is a very long sentence really fair?"],
   ["What jobs are suitable for prisoners?", "Is it fair to pay prisoners very little?", "Should prisons focus on punishment or education?"],
   ["Were your parents strict?", "Would you punish your kids the same way?", "Did any punishment feel unfair?"],
   ["Is life imprisonment more humane?", "Should prisoners ever get a second chance?", "What would you change about prisons?"],
   ["Can rewards replace punishment?", "Do harsh punishments reduce crime?", "What is a fair punishment to you?"]
  ],
  gram1: {
   chain: ["A good judge acts ___ because ___.", "When I'm angry, I speak ___."],
   ex: "T: A good judge acts fairly because everyone deserves justice.<br>S: A good judge listens carefully because …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Do you make decisions quickly?", "Do you react calmly when criticized?", "Do you apologize easily?", "Do you drive carefully?", "Do you judge people fairly?"],
    ans: "Yes, I do. / No, I don't. <b>+ an example</b>"
   },
   b: {
    title: "Describe a fair judge",
    big: "A fair judge listens ___, decides ___, and never acts ___. Do you agree?",
    ans: "Then ask: <b>How should a leader behave?</b>"
   }
  },
  opener: {
   think: ["Should punishment focus on the past or on the future?", "Is a punishment fair if it's the same for everyone?", "What is the difference between justice and revenge?"]
  },
  convo: [
   ["A", "Did you see the news about the {drunk driver}?"],
   ["B", "Yes. He only got {two years in prison}."],
   ["A", "Honestly, I think that's too light."],
   ["B", "Really? Why do you think so?"],
   ["A", "He acted {carelessly}, and someone was badly hurt."],
   ["B", "I see your point, but prison won't fix everything."],
   ["A", "So what would be fairer?"],
   ["B", "Maybe {community service} as well as prison."],
   ["A", "Hmm, that's a fair point. I'm still not sure, though."]
  ],
  swap: [["a crime", "drunk driver"], ["a sentence", "two years in prison"], ["an adverb", "carelessly"], ["another punishment", "community service"]],
  lang: [
   ["Give an opinion", ["Honestly, I think …", "In my view, …", "Personally, …"]],
   ["Ask for reasons", ["Why do you think so?", "What makes you say that?", "Can you give an example?"]],
   ["Partly agree", ["I see your point, but …", "That's true, however …"]],
   ["Disagree politely", ["I'm not so sure.", "I see it differently."]]
  ],
  langPractice: ["Prisons are too comfortable.", "Punishment never works.", "Parents should be strict.", "Everyone deserves a second chance.", "Fines are better than prison.", "The death penalty stops crime."],
  survey: {
   ask: "Do you think",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["punishment prevents crime", "prisoners should work", "the death penalty should exist", "rich people get lighter punishments", "parents should be strict", "criminals can truly change"],
   q: "Do you think …? → Yes. → Ask: Why? / Can you give an example?",
   report: "We both think ___, but only I think ___."
  },
  gap: {
   who: "The case of Mr. Kim",
   q: ["What did Mr. Kim do?", "How did he act in court?", "What was his punishment?", "What work does he do now?", "What does the victim think?"],
   A: [["crime", "stole a car"], ["in court", "?"], ["punishment", "18 months in prison"], ["work now", "?"], ["victim", "?"]],
   B: [["crime", "?"], ["in court", "apologized sincerely"], ["punishment", "?"], ["work now", "fixes cars in a prison garage"], ["victim", "thinks it was fair"]],
   tip: "How did he act? → He acted <b>calmly</b>."
  },
  role: {
   A: ["You are a school principal.", "Ask 5 questions + 2 follow-ups.", "Decide on a fair punishment and explain it."],
   B: ["You broke a rule.", "Choose: cheating / skipping class / fighting online.", "Give reasons. Try to reduce the punishment."]
  },
  tts: {
   title: "Design a fairer justice system",
   steps: ["Think: what is wrong with punishment today?", "Ask your teacher 4 of today's questions.", "Agree on 3 changes together.", "Present your system in 1 minute."],
   lang: ["I think we should ___ because ___.", "That's true, but ___.", "So we agree that ___."]
  },
  speech: {
   time: "2 min",
   model: ["Good afternoon. Today I'll share my view on punishment.", "I believe punishment should teach, not just hurt.", "Harsh punishments often make people angry, not better.", "For example, some countries focus on education in prison.", "Their prisoners are less likely to commit crimes again.", "Of course, dangerous people must be kept away from society.", "But we should also give people a real chance to change.", "Thank you. Any questions?"],
   outline: ["Hook — \"Today I'll share…\"", "Your main opinion", "Reason", "An example from a country", "A counterpoint", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Adverbs of manner", "Answer 1 question"]
  },
  pron: {
   cols: [["Oo-ly", ["STRICTly", "HARSHly", "FAIRly"]], ["Ooo-ly", ["CAREfully", "SERiously", "HONestly"]], ["oOo-ly", ["sinCEREly", "unFAIRly", "comPLETEly"]]],
   up: "Should prisoners work?",
   down: "What is the purpose of punishment?"
  },
  review: ["I can answer in 4 parts.", "I can use adverbs of manner.", "I can agree and disagree politely.", "I can give a short presentation."]
 }
};
