// SIU ADVANCE 011 — Crime (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법 예문 5 "Would you rather go shopping or spend the day at the beach?" 는 상관접속사가 아니라 빼고, 네 짝(both…and · either…or · neither…nor · not only…but also)으로 정리
//  - Q3 "If your a thief will you steal from the rich to help the poor?" → "If you were a thief, would you steal from the rich to help the poor?"
//  - Q4 "What's your opinion of graffiti, is it a crime?" → "What's your opinion of graffiti? Is it a crime?"
//  - Q7 "Foes marijuana need to be legalized for medicinal purposes" → "Should marijuana be legalized for medical purposes?"
//  - Q10 "…in your home town?" → "…in your hometown?"
//  - Keyword Witness(verb) 뜻이 명사 뜻("a person who sees…")이었음 → 동사 뜻으로, Purpose(verb) → noun, 낱말 퍼즐의 ILLIGAL → illegal
//  - 쉬운 판(중고생): 무기(Q5)·마리화나(Q7)·낙태(Q8)·조직(Q10)은 «규칙·안전·누가 정하나» 로 답을 돌림, 폭력 묘사 없음
export default {
 no: "a011",
 title: "Crime",
 book: "SIU ADVANCE 011 - Crime",
 next: "012 Family",
 cover: { h1: "Crime", em: "and Fairness", goals: ["Talk about laws, rules and fairness", "Ask and answer 10 questions", "Use both…and · either…or · neither…nor"] },
 KW: [
  ["witness", "verb", "목격하다", "to see a crime or accident happen"],
  ["police", "noun", "경찰", "people whose job is to stop crime"],
  ["thief", "noun", "도둑", "a person who steals other people's things"],
  ["graffiti", "noun", "낙서, 그라피티", "pictures or words painted on walls without asking"],
  ["weapon", "noun", "무기", "a thing made to hurt people or damage things"],
  ["illegal", "adjective", "불법의", "not allowed by the law"],
  ["purpose", "noun", "목적", "the reason why something is done or made"],
  ["abortion", "noun", "낙태", "a medical act that ends a pregnancy on purpose"],
  ["punish", "verb", "처벌하다", "to make someone pay for doing wrong"],
  ["gang", "noun", "범죄 조직", "an organized group of criminals"]
 ],
 QS: [
  "Have you ever witnessed a crime?",
  "Do you trust the police to help you when you're in need? Why or why not?",
  "If you were a thief, would you steal from the rich to help the poor?",
  "What's your opinion of graffiti? Is it a crime?",
  "Should people be able to carry weapons?",
  "Have you ever done anything illegal? If so, what did you do?",
  "Should marijuana be legalized for medical purposes?",
  "Do you think abortion is a crime?",
  "Is prison an effective punishment? Why or why not?",
  "What gangs exist in your country or in your hometown?"
 ],
 IMG_E: ["scene-words/15004", "scene-words/18020", "scene-words/16244", "scene-words/18562", "scene-words/20273", "scene-words/19089", "scene-words/12404", "scene-words/12381", "scene-words/16341", "scene-words/19760"],
 IMG_H: ["scene-words/15310", "scene-words/13184", "scene-words/18523", "scene-clips/7320", "scene-words/20273", "scene-words/20017", "scene-words/16699", "scene-words/10010", "scene-words/17337", "scene-words/15311"],
 PICS: {
  opener: "scene-words/19046",
  talk: "scene-words/16862",
  group: "scene-words/17285",
  speech: "scene-words/15095",
  reporter: "scene-words/16295",
  survey: "scene-words/18537",
  pron: "scene-clips/7170",
  roleB: "scene-words/18467",
  cover: "scene-words/18020",
  back: "scene-words/19412"
 },
 gram1: {
  can: "join two ideas with pairs",
  title: "Pair",
  em: "Words",
  rules: [
   ["Two + / two −", "<b>Both</b> police <b>and</b> teachers help us. He is <b>neither</b> rich <b>nor</b> famous."],
   ["Choose one / add more", "<b>Either</b> call <b>or</b> text. She is <b>not only</b> smart <b>but also</b> kind."]
  ],
  hardNote: "both…and · either…or · neither…nor · not only…but also",
  say: [
   "Correlative conjunctions work in pairs to join two equal ideas.",
   "Both police and teachers help us. He is neither rich nor famous.",
   "Either call or text. She is not only smart but also kind."
  ]
 },
 gram2: {
  can: "ask \"Is it either … or …?\"",
  cols: ["both…and · either…or", "neither…nor · not only…but also"],
  rows: [
   ["+", "<b>Both</b> my mom <b>and</b> dad are fair.", "It's <b>not only</b> wrong <b>but also</b> illegal."],
   ["−", "I <b>didn't</b> tell <b>either</b> Mina <b>or</b> Jun.", "I <b>neither</b> lied <b>nor</b> cheated."],
   ["?", "Is graffiti <b>either</b> art <b>or</b> a crime?", "Is it <b>not only</b> rude <b>but also</b> unfair?"]
  ]
 },
 gapCan: "ask \"Who saw…? What did…?\"",
 role: {
  title: "The",
  em: "Detective",
  tail: "Interview",
  opener: "Excuse me, did you see what happened here?",
  a: "Detective",
  b: "Witness"
 },
 pron: {
  can: "stress both parts of a pair",
  title: "Stress the",
  em: "pairs",
  game: "Teacher gives two words → you join them and stress both: <i>\"It's BOTH fair AND safe.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["No, I haven't. But I saw a bike go missing at school.", "Both my teacher and I looked for it."],
   ["Yes, I do. The police keep our town safe.", "An officer once helped me find my way home."],
   ["No, I wouldn't. Stealing is wrong, even for a good reason.", "I would help the poor by volunteering."],
   ["I think some graffiti is art.", "But painting on walls without asking is not fair."],
   ["No, they shouldn't.", "Both students and adults feel safer without weapons."],
   ["No, I haven't.", "But I once crossed the street on a red light, and I felt bad."],
   ["I think doctors should decide what medicine is safe.", "Laws should protect sick people."],
   ["That's a very serious question for adults.", "I think doctors and families should talk about it carefully."],
   ["I think it works for some people.", "But people also need a second chance."],
   ["I don't know about gangs in my town.", "I think my town is safe because of the police."]
  ],
  frame: [
   "No, I haven't. / Yes, I have. I saw ___.",
   "Yes, I do. / No, I don't. The police ___.",
   "No, I wouldn't. / Yes, I would. ___ is wrong.",
   "I think graffiti is either ___ or ___.",
   "No, they shouldn't. It's ___.",
   "No, I haven't. But I once ___.",
   "I think ___ should decide because ___.",
   "I think ___ should talk about it carefully.",
   "I think prison ___. People need ___.",
   "I think my town is ___ because ___."
  ],
  bank: [
   ["a lost bike", "a broken window", "a fight on TV", "nothing"],
   ["keep us safe", "help people", "find lost things", "stop crime"],
   ["Stealing", "Lying", "Cheating", "Breaking rules"],
   ["art", "a crime", "fun", "messy"],
   ["dangerous", "unsafe", "Police help.", "scary"],
   ["crossed on red", "was loud at night", "littered", "ran in the hall"],
   ["doctors", "lawmakers", "scientists", "patients"],
   ["doctors", "families", "adults", "lawmakers"],
   ["works", "doesn't work", "a second chance", "help to change"],
   ["safe", "quiet", "friendly", "clean"]
  ],
  more: [
   ["Have you seen a crime on the news?", "How did you feel?"],
   ["Have you ever talked to a police officer?", "Is 112 easy to remember?"],
   ["Do you know the story of Robin Hood?", "How can we help poor people?"],
   ["Is there graffiti in your town?", "Where should artists paint?"],
   ["How do police keep us safe?", "What makes you feel safe?"],
   ["What rules do you break sometimes?", "Why do we need rules?"],
   ["Who decides if medicine is safe?", "Do you take medicine when sick?"],
   ["What other hard questions do adults discuss?", "Who can you ask about hard topics?"],
   ["What happens when you break a school rule?", "What is a fair punishment?"],
   ["What makes a town safe?", "Do you feel safe at night?"]
  ],
  gram1: {
   chain: ["Both ___ and ___ are ___.", "I like neither ___ nor ___."],
   ex: "T: Both police and doctors help people.<br>S: Both my mom and my teacher are fair.<br>T: I like neither …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Is lying wrong?", "Is graffiti art?", "Are rules fair?", "Is cheating bad?", "Are police helpful?"],
    ans: "Yes, it's both … and … / No, it's neither … nor … <b>+ one more</b>"
   },
   b: {
    title: "Either … or",
    big: "If I see a crime, I will either ___ or ___.",
    ans: "Then ask: <b>What would you do?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What are they watching?", "What is one important rule at your school?", "What does a police officer do every day?"]
  },
  convo: [
   ["A", "Did you hear? Someone took {Jun's bike} yesterday."],
   ["B", "Really? Where was it?"],
   ["A", "It was {in front of the school}. It wasn't locked."],
   ["B", "Did anyone witness it?"],
   ["A", "Neither the teachers nor the students saw anything."],
   ["B", "He should either {tell the police} or check the cameras."],
   ["A", "Good idea. And next time, he should {lock it}!"]
  ],
  swap: [["something missing", "Jun's bike"], ["a place", "in front of the school"], ["what to do", "tell the police"], ["how to stop it", "lock it"]],
  lang: [
   ["Show surprise", ["Really?", "No way!", "That's terrible!"]],
   ["Ask for details", ["Where was it?", "Did anyone see it?"]],
   ["Give advice", ["He should …", "Why don't you …?"]]
  ],
  langPractice: ["Someone took my umbrella.", "I saw a car crash.", "My friend copied my homework.", "Graffiti is art.", "Rules are boring.", "The police helped my grandma."],
  survey: {
   ask: "Do you think",
   cols: ["Me", "My teacher"],
   rows: ["lying is always wrong", "graffiti is art", "school rules are fair", "police are friendly", "cheating is a crime", "everyone deserves a second chance"],
   q: "Do you think …?  → Yes, I do. / No, I don't.",
   report: "Both my teacher and I think ___."
  },
  gap: {
   who: "The missing bike",
   q: ["Whose bike was it?", "Where was it?", "When did it go missing?", "Who witnessed it?"],
   A: [["owner", "Jun"], ["where", "?"], ["when", "after lunch"], ["witness", "?"]],
   B: [["owner", "?"], ["where", "by the gym"], ["when", "?"], ["witness", "both Mina and Sora"]],
   tip: "<b>Who</b> saw it? · <b>Both</b> Mina <b>and</b> Sora"
  },
  role: {
   A: ["You are a detective.", "Ask 5 questions.", "Say who you think did it."],
   B: ["You saw a bag go missing at school.", "Choose: library / gym / cafeteria.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make \"Our class rules\"",
   steps: ["Think of 3 rules that keep everyone safe.", "Ask your teacher 3 of today's questions.", "Agree on 3 fair rules.", "Share your rules and why!"],
   lang: ["Both students and teachers should ___.", "We should either ___ or ___.", "Neither ___ nor ___ is okay."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about a rule I like.", "My favorite rule is \"No bullying.\"", "It's not only kind but also fair.", "Both students and teachers follow it.", "If someone breaks it, they talk with the teacher.", "Rules help everyone feel safe. Thank you!"],
   outline: ["Hello", "The rule", "not only … but also …", "Both … and …", "What happens if…", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Pair words"]
  },
  pron: {
   cols: [["both … and", ["both of us", "both sides"]], ["either … or", ["either one", "either way"]], ["neither … nor", ["neither one", "neither of us"]]],
   up: "Is graffiti art?",
   down: "Why do we need rules?"
  },
  review: ["I can talk about rules and fairness.", "I can use both…and / either…or.", "I can ask about what happened.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Yes, I once saw a phone snatched on the subway.", "It happened so fast that nobody reacted.", "I gave the police a description, but they never caught him.", "Have you ever seen a crime?"],
   ["Mostly, yes, I trust the police here.", "Response times in Korean cities are quite fast.", "When my car was hit, an officer arrived in ten minutes.", "Do you trust the police where you live?"],
   ["No, I wouldn't, although I understand the idea.", "Stealing is neither fair nor a real solution.", "Charities and fair taxes help the poor more lastingly.", "Would you ever break a law for a good cause?"],
   ["I think graffiti is both art and a crime.", "It's creative, but it damages other people's property.", "Some cities give artists legal walls, which works well.", "Is there graffiti you like?"],
   ["No, I don't think ordinary people should.", "More weapons usually mean more deadly accidents.", "Countries with strict laws tend to have fewer shootings.", "What do you think about gun laws?"],
   ["Only small things, like jaywalking.", "Most people break minor rules without thinking.", "I once downloaded a movie illegally, and I felt guilty.", "Have you ever broken a small law?"],
   ["I think it should be legal for medical use.", "It can reduce pain for some serious illnesses.", "Several countries allow it, with strict prescriptions.", "Where do you draw the line?"],
   ["I don't see it as a crime in every case.", "It's a medical and personal decision with many sides.", "Many countries allow it in the early weeks only.", "How is it viewed in your country?"],
   ["Prison works only partly, in my opinion.", "It protects society but rarely changes people.", "Programs that teach job skills reduce repeat crimes.", "What punishment do you think works best?"],
   ["There are crime groups, but most people never meet them.", "They hide in illegal businesses.", "Movies make them look more exciting than they are.", "Do movies glamorize gangs?"]
  ],
  frame: [
   "Yes, I once … / No, I've never … because …",
   "I trust / don't trust the police because …",
   "I would / wouldn't … because it's neither … nor …",
   "I think graffiti is both … and … because …",
   "I think people should / shouldn't … because …",
   "Only … Once, I … and I felt …",
   "I think it should / shouldn't be … because …",
   "I think it is / isn't … because …",
   "I think prison … but … For example, …",
   "There are …, but … In movies, …"
  ],
  more: [
   ["Would you report a crime you saw?", "Should witnesses be protected?", "Why do some people look away?"],
   ["What makes people trust or distrust the police?", "Should police carry guns in Korea?", "Would you like to be a police officer?"],
   ["Is stealing ever justified?", "Is tax avoidance a kind of stealing?", "Why do we love Robin Hood stories?"],
   ["Where is the line between art and vandalism?", "Should famous graffiti be protected?", "Would you let an artist paint your wall?"],
   ["Why do some countries allow guns?", "Does self-defense justify weapons?", "What would happen if Korea allowed guns?"],
   ["Is illegal downloading really a crime?", "Which minor law do people break most?", "Should small crimes be punished strictly?"],
   ["What's the difference between medical and recreational use?", "Why are drug laws so different worldwide?", "Should doctors or politicians decide?"],
   ["Why is this issue so divisive?", "Should religion influence laws?", "How can people with opposite views talk respectfully?"],
   ["Is prison about punishment or rehabilitation?", "Should prisoners be allowed to study?", "What alternatives to prison exist?"],
   ["Why do young people join gangs?", "How can communities prevent gangs?", "Do crime dramas influence real life?"]
  ],
  gram1: {
   chain: ["I think ___ is not only ___ but also ___.", "It's neither ___ nor ___, so we should either ___ or ___."],
   ex: "T: I think cyberbullying is not only cruel but also illegal.<br>S: I think …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Is graffiti art or vandalism?", "Should police be armed or unarmed?", "Is prison for punishment or change?", "Is downloading movies a crime?", "Should laws be strict or flexible?"],
    ans: "It's both … and … / neither … nor … <b>+ why? + example</b>"
   },
   b: {
    title: "Two sides",
    big: "Not only ___ but also ___. However, neither ___ nor ___. So I think ___.",
    ans: "Then ask: <b>Which side are you on?</b>"
   }
  },
  opener: {
   think: ["Why are crime dramas so popular?", "Is breaking a law always wrong?", "What makes a punishment fair?"]
  },
  convo: [
   ["A", "Did you hear someone {broke into the café} on our street?"],
   ["B", "Seriously? When did it happen?"],
   ["A", "Last night. They took both {the cash} and a laptop."],
   ["B", "That's awful. Did anyone witness it?"],
   ["A", "Neither the owner nor the neighbors saw anything."],
   ["B", "Does the café have cameras?"],
   ["A", "Yes, so the police will either {check the footage} or ask around."],
   ["B", "I hope they catch them. I'll {lock my bike} more carefully now."],
   ["A", "Good idea. It's not only safer but also cheaper in the end!"]
  ],
  swap: [["a crime", "broke into the café"], ["what was taken", "the cash"], ["what police do", "check the footage"], ["your reaction", "lock my bike"]],
  lang: [
   ["React to news", ["Seriously?", "That's awful.", "I can't believe it."]],
   ["Ask for details", ["When did it happen?", "Did anyone see it?", "Was anyone hurt?"]],
   ["Give an opinion", ["In my view, …", "It's not only … but also …"]],
   ["Hedge", ["It depends.", "I see both sides."]]
  ],
  langPractice: ["Prison is too easy these days.", "I'd never call the police.", "Graffiti makes cities beautiful.", "Stealing food when hungry is okay.", "Small crimes don't matter.", "Police should carry guns."],
  survey: {
   ask: "Do you agree:",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["graffiti can be art", "police should be armed", "prison changes people", "small crimes need strict punishment", "stealing is sometimes justified", "crime dramas glamorize crime"],
   q: "Do you agree …? → Why? → Ask: Example? / What about …?",
   report: "Both my teacher and I ___, but neither of us ___."
  },
  gap: {
   who: "The café break-in",
   q: ["When did it happen?", "What was taken?", "Who witnessed it?", "What do the cameras show?", "What will the police do next?"],
   A: [["when", "Tuesday, 2 a.m."], ["taken", "?"], ["witness", "a taxi driver"], ["cameras", "?"], ["next", "?"]],
   B: [["when", "?"], ["taken", "cash and a laptop"], ["witness", "?"], ["cameras", "two people in hoodies"], ["next", "check nearby shops"]],
   tip: "<b>Who</b> witnessed it? · <b>Both</b> … <b>and</b> … were taken"
  },
  role: {
   A: ["You are a detective.", "Ask 5 questions + 2 follow-ups.", "Summarize the facts with pair words."],
   B: ["You witnessed a café break-in.", "Choose: taxi driver / neighbor / night worker.", "Describe what you saw and heard."]
  },
  tts: {
   title: "Design a \"Safer neighborhood\" plan",
   steps: ["Think: what crimes happen near you?", "Ask your teacher 4 of today's questions.", "Agree on 3 ideas to prevent crime.", "Present your plan in 1 minute."],
   lang: ["We need not only ___ but also ___.", "People should either ___ or ___.", "Neither ___ nor ___ works alone."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll talk about prison.", "Many people think prison is the best punishment.", "It's true that prison protects society.", "But it neither teaches skills nor changes most people.", "In Norway, prisons focus on education and work.", "As a result, both repeat crime and costs are lower.", "So I think prisons should rehabilitate, not only punish.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll talk about…\"", "Common view", "The problem (neither … nor …)", "An example", "Result (both … and …)", "Your opinion + questions"],
   check: ["Clear voice", "Eye contact", "Pair words", "Answer 1 question"]
  },
  pron: {
   cols: [["both … and", ["both", "and"]], ["either … or", ["/iː/ either", "/aɪ/ either"]], ["neither … nor", ["/iː/ neither", "/aɪ/ neither"]]],
   up: "Is graffiti a crime?",
   down: "What punishment works best?"
  },
  review: ["I can answer in 4 parts.", "I can use both…and / either…or / neither…nor.", "I can discuss crime and punishment.", "I can give a short presentation."]
 }
};
