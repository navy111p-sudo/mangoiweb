// SIU ADVANCE 016 — Animals (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - Q1·Q6 첫 글자 OCR 오류(Pid/Vo) → Did/Do, Q3 "seared" → scared, Q7 "a 200" → a zoo
//  - Q2 "How will you teach animals to do some tricks?" → "How would you teach an animal to do tricks?"
//  - Q8 "Why hunting animals is bad?" → "Why is hunting animals bad?" (의문문 어순)
//  - Q9 "What animals do you think is…" → "Which animal do you think is the most dangerous?" (수 일치)
//  - Keyword Scare(adj) → scared(adjective), Unusual(adv) → adjective, Trick 뜻 «속이는 꾀» → 동물이 배우는 «재주»
//  - 대답 틀 "Some endangered species that I know is" → "…I know are", "the one that came first is its because" → 새 틀
//  - 쉬운 판(중고등): Q8 사냥은 «멸종 위기 동물 보호» 로만 답하고 잔인한 장면·설명은 넣지 않음
export default {
 no: "a016",
 title: "Animals",
 book: "SIU ADVANCE 016 - Animals",
 next: "017 Punishment",
 cover: { h1: "The World of", em: "Animals", goals: ["Talk about pets and wild animals", "Ask and answer 10 questions", "Say how much with very / extremely"] },
 KW: [
  ["grow up", "verb", "자라다", "to change from a child into an adult"],
  ["trick", "noun", "재주, 묘기", "a clever action an animal learns to do"],
  ["scared", "adjective", "무서워하는", "afraid of something"],
  ["endangered", "adjective", "멸종 위기의", "at risk of disappearing forever"],
  ["first", "adjective", "첫 번째의", "coming before all the others"],
  ["unusual", "adjective", "특이한, 흔치 않은", "not common; different from normal"],
  ["zoo", "noun", "동물원", "a place where people can see wild animals"],
  ["hunting", "noun", "사냥", "chasing and catching wild animals"],
  ["dangerous", "adjective", "위험한", "likely to hurt you"],
  ["human", "noun", "인간, 사람", "a person, not an animal"]
 ],
 QS: [
  "Did you grow up with pets in your home?",
  "How would you teach an animal to do tricks?",
  "What animals are you scared of?",
  "Can you name some endangered species?",
  "Which came first: the chicken or the egg?",
  "Do you know someone who owns an unusual pet?",
  "Have you ever been to a zoo?",
  "Why is hunting animals bad?",
  "Which animal do you think is the most dangerous?",
  "What are the biggest differences between animals and humans?"
 ],
 IMG_E: ["scene-words/18031", "scene-words/17252", "scene-words/15685", "scene-words/19205", "scene-words/21239", "scene-words/16617", "scene-words/15836", "scene-words/17213", "scene-words/19343", "scene-words/19217"],
 IMG_H: ["scene-clips/7363", "scene-words/19674", "scene-words/15396", "scene-words/19334", "scene-words/12432", "scene-words/15714", "scene-words/17171", "scene-words/21007", "scene-words/15698", "scene-words/18034"],
 PICS: {
  opener: "scene-clips/7164",
  talk: "scene-clips/7373",
  group: "scene-words/19052",
  speech: "scene-words/12053",
  reporter: "scene-words/12835",
  survey: "scene-words/18031",
  pron: "scene-words/16318",
  roleB: "scene-words/18460",
  cover: "scene-words/15836",
  back: "scene-words/18368"
 },
 gram1: {
  can: "say how much with very / extremely",
  title: "Adverbs of",
  em: "Degree",
  rules: [
   ["Strong", "This cake is <b>absolutely</b> wonderful."],
   ["Weak", "The water was <b>barely</b> warm. We're <b>almost</b> done."]
  ],
  hardNote: "barely · fairly · quite · very · really · extremely · completely · absolutely",
  say: [
   "Adverbs of degree tell us how much or how strong something is.",
   "They usually come before an adjective or a verb.",
   "This cake is absolutely wonderful.",
   "The water was barely warm."
  ]
 },
 gram2: {
  can: "make words stronger or weaker",
  cols: ["+ adjective", "+ verb"],
  rows: [
   ["+", "Tigers are <b>extremely</b> strong.", "I <b>completely</b> agree."],
   ["−", "Snakes are<b>n't very</b> friendly.", "I can <b>hardly</b> see it."],
   ["?", "Are sharks <b>really</b> dangerous?", "Do you <b>really</b> like spiders?"]
  ]
 },
 gapCan: "ask \"How big is it?\"",
 role: {
  title: "The",
  em: "Animal",
  tail: "Shelter",
  opener: "Hello! Are you looking for a new pet today?",
  a: "Shelter worker",
  b: "Pet adopter"
 },
 pron: {
  can: "stress degree words",
  title: "Make it",
  em: "stronger",
  game: "Teacher names an animal → you describe it and stress the degree word: <i>\"Sharks are exTREMEly dangerous!\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["Yes, I did. I grew up with a dog.", "He was very friendly and loved walks."],
   ["I would give it a treat.", "I would practice with it every day."],
   ["I'm scared of snakes.", "They move really fast."],
   ["Polar bears and pandas are endangered.", "They are losing their homes."],
   ["I think the egg came first.", "But it's a really hard question!"],
   ["Yes, my cousin has a lizard.", "It's quite small and very quiet."],
   ["Yes, I have. I went last spring.", "The giraffes were extremely tall."],
   ["Hunting can make animals disappear.", "We should protect endangered animals."],
   ["I think sharks are the most dangerous.", "They have very sharp teeth."],
   ["Humans can talk and read.", "But animals are much faster and stronger."]
  ],
  frame: [
   "Yes, I did. I grew up with a ___. / No, I didn't.",
   "I would give it a ___. I would practice ___.",
   "I'm scared of ___. They are very ___.",
   "___ and ___ are endangered.",
   "I think the ___ came first because ___.",
   "Yes, my ___ has a ___. / No, I don't.",
   "Yes, I have. The ___ were extremely ___.",
   "Hunting can ___. We should ___.",
   "I think ___ are the most dangerous.",
   "Humans can ___, but animals can ___."
  ],
  bank: [
   ["dog", "cat", "hamster", "fish"],
   ["treat", "toy", "every day", "slowly"],
   ["snakes", "spiders", "big dogs", "fast / scary"],
   ["Polar bears", "Pandas", "Tigers", "Elephants"],
   ["egg", "chicken", "it's a mystery", "eggs came from birds"],
   ["cousin", "friend", "lizard", "parrot"],
   ["giraffes", "elephants", "tall", "big"],
   ["make animals disappear", "hurt nature", "protect animals", "stop it"],
   ["sharks", "bears", "snakes", "mosquitoes"],
   ["talk", "read", "run fast", "fly"]
  ],
  more: [
   ["What was your pet's name?", "Who took care of it?"],
   ["What trick would you teach?", "Is it easy to teach a cat?"],
   ["Why are you scared?", "Have you ever touched one?"],
   ["Which animal would you save first?", "How can students help?"],
   ["Do you like hard questions?", "Can you think of another one?"],
   ["What unusual pet would you like?", "Would your parents say yes?"],
   ["What is your favorite zoo animal?", "Do animals like living in zoos?"],
   ["Why do some people hunt?", "How can we protect wild animals?"],
   ["Have you ever seen one?", "Which animal is the most gentle?"],
   ["Are animals smart?", "What can we learn from animals?"]
  ],
  gram1: {
   chain: ["___ are very ___.", "___ are extremely ___."],
   ex: "T: Elephants are very big.<br>S: Cheetahs are very fast.<br>T: Mice are extremely …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Are cats really lazy?", "Are dogs very smart?", "Are sharks too scary?", "Are pandas very cute?", "Are snakes really dangerous?"],
    ans: "Yes, they're very … / No, not really. <b>+ one more</b>"
   },
   b: {
    title: "My favorite animal",
    big: "My favorite animal is the ___. It's extremely ___ and really ___.",
    ans: "Then ask: <b>What's your favorite animal?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. How do they feel?", "Do you have a pet? Do you want one?", "What is the coolest animal you know?"]
  },
  convo: [
   ["A", "Look! That's my new {rabbit}."],
   ["B", "Wow, it's really cute! What's its name?"],
   ["A", "Her name is {Bori}."],
   ["B", "Is she hard to take care of?"],
   ["A", "Not really. She eats {carrots} every day."],
   ["B", "Can she do any tricks?"],
   ["A", "Yes! She can {jump} really high."],
   ["B", "That's amazing!"]
  ],
  swap: [["a pet", "rabbit"], ["a pet's name", "Bori"], ["pet food", "carrots"], ["a trick", "jump"]],
  lang: [
   ["Show interest", ["Wow!", "It's really cute!", "That's amazing!"]],
   ["Ask for more", ["What's its name?", "Can it do tricks?"]],
   ["Make it stronger", ["really …", "very …", "extremely …"]]
  ],
  langPractice: ["I have a snake.", "I'm scared of dogs.", "I went to the zoo yesterday.", "Cats are lazy.", "My dog can dance.", "I saw a panda!"],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["have a pet", "like cats", "feel scared of spiders", "like zoos", "want an unusual pet", "watch animal videos"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Max the dog",
   q: ["How old is Max?", "How big is he?", "What trick can he do?", "What is he scared of?"],
   A: [["age", "three years old"], ["size", "?"], ["trick", "give a paw"], ["scared of", "?"]],
   B: [["age", "?"], ["size", "quite small"], ["trick", "?"], ["scared of", "thunder"]],
   tip: "How <b>big</b> is he? · He's <b>quite</b> small."
  },
  role: {
   A: ["You work at an animal shelter.", "Ask 5 questions.", "Choose a pet for the visitor."],
   B: ["You want a pet.", "Choose: small home / big yard / busy family.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a \"Save the animals\" poster",
   steps: ["Pick one endangered animal.", "Ask your teacher. Answer, too.", "Choose 2 ways to help.", "Draw your poster and tell!"],
   lang: ["The ___ is very ___.", "It's endangered because ___.", "We can help by ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about my favorite animal.", "My favorite animal is the panda.", "Pandas are really cute and very gentle.", "They eat bamboo almost all day.", "Pandas are endangered, so we should protect them.", "Thank you!"],
   outline: ["Hello", "Your favorite animal", "What it looks like (very …)", "What it eats / does", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Use very / really"]
  },
  pron: {
   cols: [["Strong words", ["VERy", "REALly", "SO"]], ["Stress 2nd", ["exTREMEly", "comPLETEly", "enDANgered"]], ["Stress 1st", ["DANgerous", "ANimal", "HUman"]]],
   up: "Do you have a pet?",
   down: "What animals are you scared of?"
  },
  review: ["I can talk about animals.", "I can use very / really / extremely.", "I can ask \"Can it…?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Yes, I grew up with two cats.", "My parents said pets teach responsibility.", "I cleaned the litter box daily, which I hated.", "Did you have pets as a child?"],
   ["I'd use treats and a lot of patience.", "Animals learn fastest with quick rewards.", "I taught my dog to sit in about a week.", "Have you ever trained an animal?"],
   ["I'm terribly scared of spiders.", "I know most are harmless, but they move so unpredictably.", "Once I screamed when one dropped onto my desk.", "Is there an animal you can't stand?"],
   ["Tigers, snow leopards and sea turtles are endangered.", "Habitat loss and pollution are the main reasons.", "Sea turtles often mistake plastic bags for jellyfish.", "Which species do you think we should save first?"],
   ["Scientifically, I'd say the egg came first.", "Birds evolved from earlier animals that already laid eggs.", "So the first chicken must have hatched from an egg.", "Does that answer satisfy you?"],
   ["Yes, a coworker of mine keeps a pet snake.", "She says it's extremely quiet and easy to care for.", "She feeds it only once a week!", "Would you ever keep a reptile?"],
   ["Yes, I've been to a few, but I have mixed feelings.", "Some animals look really bored in small spaces.", "The tigers in one zoo paced back and forth all day.", "Do you think zoos help or harm animals?"],
   ["I think hunting for sport is wrong.", "It can push already endangered animals toward extinction.", "Rhino numbers dropped sharply because of illegal hunting.", "Is hunting ever acceptable, in your opinion?"],
   ["Surprisingly, the mosquito is the most dangerous.", "It spreads diseases that kill hundreds of thousands a year.", "Sharks are far less deadly than people imagine.", "Which animal did you expect me to say?"],
   ["The biggest difference is language and planning.", "Humans can share complex ideas and plan far ahead.", "Still, elephants mourn their dead, much like we do.", "Are animals more like us than we think?"]
  ],
  frame: [
   "Yes, I grew up with … My parents …",
   "I'd use … because … I once …",
   "I'm terribly scared of … because …",
   "… are endangered because …",
   "I'd say the … came first because …",
   "Yes, … keeps a … It's extremely …",
   "Yes, I have, but … For example, …",
   "I think hunting … because …",
   "Surprisingly, the … is the most dangerous because …",
   "The biggest difference is … Still, …"
  ],
  more: [
   ["Should every child have a pet?", "Is it cruel to keep pets indoors all day?", "What pet would suit your life now?"],
   ["Is it fair to train animals for shows?", "Which animals are the smartest?", "If animals could talk, what would they say?"],
   ["Are our fears learned or natural?", "How could you overcome a fear of animals?", "Would you hold a spider for money?"],
   ["Whose job is it to protect wildlife?", "Is it worth spending money to save one species?", "What would happen if bees disappeared?"],
   ["Why do people enjoy impossible questions?", "Can science answer every question?", "What other riddle do you like?"],
   ["Should exotic pets be banned?", "Why do people want unusual pets?", "What's the strangest pet you've heard of?"],
   ["Should zoos exist in the future?", "Are safari parks better than zoos?", "Would you work as a zookeeper?"],
   ["Is hunting for food different from hunting for sport?", "Should eating meat be discouraged?", "How could we stop illegal hunting?"],
   ["Why do we fear sharks more than cars?", "Should dangerous animals live near cities?", "What would you do if you met a bear?"],
   ["Do animals have feelings?", "Should animals have legal rights?", "What makes humans truly unique?"]
  ],
  gram1: {
   chain: ["I'm absolutely ___ about ___.", "I can hardly ___ when ___."],
   ex: "T: I'm absolutely crazy about dogs.<br>S: I'm absolutely terrified of …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Are zoos really necessary?", "Is it extremely hard to own a dog?", "Are cats completely independent?", "Is hunting ever fairly acceptable?", "Are humans really smarter than animals?"],
    ans: "Answer with a degree word <b>+ why?</b>"
   },
   b: {
    title: "Stronger or weaker?",
    big: "Pets are ___ important to me. Zoos are ___ necessary. Hunting is ___ wrong.",
    ans: "Then ask: <b>How strongly do you feel about …?</b>"
   }
  },
  opener: {
   think: ["Do humans have the right to use animals? For what?", "Why do some people love pets more than people?", "Which animal best describes your personality?"]
  },
  convo: [
   ["A", "I'm thinking of getting a {parrot}."],
   ["B", "Really? Aren't they extremely noisy?"],
   ["A", "Some are, but they're incredibly smart."],
   ["B", "True. But they live for {fifty years}, right?"],
   ["A", "Exactly. It's a real commitment."],
   ["B", "Why not adopt a {cat} from a shelter?"],
   ["A", "Hmm, I'm {allergic} to cats."],
   ["B", "Oh, that's a problem. What about a turtle?"],
   ["A", "That's actually not a bad idea!"]
  ],
  swap: [["an unusual pet", "parrot"], ["a long time", "fifty years"], ["a common pet", "cat"], ["a problem", "allergic"]],
  lang: [
   ["Express doubt", ["Aren't they …?", "Really?", "Are you sure?"]],
   ["Make it stronger", ["incredibly …", "extremely …", "absolutely …"]],
   ["Suggest", ["Why not …?", "What about …?", "Have you thought about …?"]],
   ["Agree", ["Exactly.", "That's not a bad idea!"]]
  ],
  langPractice: ["I think zoos should be closed.", "My cat is smarter than me.", "I'd love a pet snake.", "Hunting is a tradition.", "Dogs are better than cats.", "I'm terrified of birds."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["think zoos are necessary", "have an unusual fear", "believe animals have feelings", "want an exotic pet", "support banning hunting", "donate to animal groups"],
   q: "Do you …? → Yes. → Ask: Why? / How strongly? / Since when?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "The sea turtle",
   q: ["How long can a sea turtle live?", "How big can it grow?", "Why is it endangered?", "What does it eat?", "How can people help?"],
   A: [["lifespan", "about 80 years"], ["size", "?"], ["danger", "plastic in the sea"], ["food", "?"], ["help", "?"]],
   B: [["lifespan", "?"], ["size", "up to 2 meters"], ["danger", "?"], ["food", "jellyfish and seaweed"], ["help", "use less plastic"]],
   tip: "How <b>long</b> / How <b>big</b>…? · It's <b>extremely</b> …"
  },
  role: {
   A: ["You work at an animal shelter.", "Ask 5 questions + 2 follow-ups.", "Recommend a pet and explain why."],
   B: ["You want to adopt a pet.", "Choose: tiny flat / long work hours / allergies.", "Give reasons. Ask 2 questions back."]
  },
  tts: {
   title: "Plan \"A zoo of the future\"",
   steps: ["Think: how can a zoo be good for animals?", "Ask your teacher 4 of today's questions.", "Agree on 3 rules for your zoo.", "Present your zoo in 1 minute."],
   lang: ["Our zoo would be ___ different because ___.", "Animals would have ___.", "We'd absolutely never ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll talk about animals and me.", "I grew up with two cats, and I still love them.", "I'm terribly scared of spiders, though I know that's silly.", "I have mixed feelings about zoos.", "Some protect endangered animals, but some are really small.", "I think hunting for sport is completely wrong.", "In the future, I'd like to volunteer at an animal shelter.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll talk about…\"", "Pets you grew up with", "An animal you fear + why", "Your view on zoos", "Your view on hunting", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Degree words", "Answer 1 question"]
  },
  pron: {
   cols: [["Strong words", ["REALly", "TERribly", "QUITE"]], ["Stress 2nd", ["exTREMEly", "inCREDibly", "enDANgered"]], ["Stress 1st", ["DANgerous", "HUman", "SPEcies"]]],
   up: "Have you ever been to a zoo?",
   down: "Which animal is the most dangerous?"
  },
  review: ["I can answer in 4 parts.", "I can use adverbs of degree.", "I can give my opinion about animals.", "I can give a short presentation."]
 }
};
