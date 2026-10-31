// SIU BASIC 021 — Likes and Dislikes (8판 형식, 001 본보기와 같은 모양)
// 원본과 다른 점:
//  Q4 "Who are your favorite actors or actress?" → "…actors or actresses?" (복수)
//  Q7 "…after you graduate highschool?" → "…after you graduate from high school?"
//  Q8 "Do you like or hate Math subject?" → "Do you like or hate math?"
//  Q9 "What amusement rides you like and dislike?" → "What amusement park rides do you like and dislike?" (do 빠짐)
//  Q10 "What outdoor activities you like and dislike" → "What outdoor activities do you like and dislike?" (do·물음표)
//  KW after: 원본 품사 adj → preposition(이 질문에서 쓰인 뜻) / KW outdoor: 원본 adv → adjective 로 바로잡음
//  문법: 원본은 부사 불규칙 비교(good/well-better-best, bad-worse-worst, much-more-most, little-less-least, late-later-last)
//        → 좋고 싫음을 말할 때 쓰는 better·best·more·most·less·worst 로 쉽게 다시 풀이 (later/latter 구분은 뺌)
export default {
 no: "021",
 title: "Likes and Dislikes",
 book: "SIU BASIC 021 - Likes and Dislikes",
 next: "022 Manners and Meeting People",
 cover: { h1: "Likes and", em: "Dislikes", goals: ["Talk about what you like and don't like", "Ask and answer 10 questions", "Tell about your favorites"] },
 KW: [
  ["genre", "noun", "장르", "a kind or style of music, movies or books"],
  ["dislike", "verb", "싫어하다", "to not like someone or something"],
  ["like", "verb", "좋아하다", "to enjoy something or think it is nice"],
  ["actor", "noun", "배우", "a person who acts in movies, plays or TV shows"],
  ["athlete", "noun", "운동선수", "a person who is good at sports and competes in them"],
  ["read", "verb", "읽다", "to look at words and understand them"],
  ["after", "preposition", "~후에", "later than something"],
  ["math", "noun", "수학", "the study of numbers and shapes"],
  ["ride", "verb", "타다", "to sit on something and travel on it"],
  ["outdoor", "adjective", "야외의", "happening outside, not in a building"]
 ],
 QS: [
  "What genre of music do you like?",
  "Name some singers or groups that you dislike.",
  "Do you like to watch movies?",
  "Who are your favorite actors or actresses?",
  "Who are your favorite athletes?",
  "Do you like reading books?",
  "What college course would you like to take after you graduate from high school?",
  "Do you like or hate math?",
  "What amusement park rides do you like and dislike?",
  "What outdoor activities do you like and dislike?"
 ],
 IMG_E: ["scene-words/16266", "scene-words/18717", "scene-words/19112", "scene-words/12540", "scene-words/12550", "scene-words/12495", "scene-words/16603", "scene-words/18420", "scene-words/16296", "scene-words/12831"],
 IMG_H: ["scene-words/14668", "scene-words/18717", "scene-words/15580", "scene-words/16830", "scene-words/15187", "scene-clips/7331", "scene-words/17159", "scene-words/15033", "scene-words/15776", "scene-words/12200"],
 PICS: {
  opener: "scene-clips/7405", talk: "scene-words/15843", group: "scene-words/12870", speech: "scene-words/15661",
  reporter: "scene-words/16345", survey: "scene-words/12061", pron: "scene-words/19100", roleB: "scene-clips/7465",
  cover: "scene-words/15846", back: "scene-words/16534"
 },
 gram1: {
  can: "say which one I like better or best",
  title: "Good, Better,",
  em: "Best",
  rules: [
   ["Two things", "I like soccer <b>better</b> than baseball."],
   ["Three or more", "I like pizza <b>the best</b>. Math is <b>the worst</b>!"]
  ],
  hardNote: "good/well → better → best · bad → worse → worst · much → more → most · little → less → least",
  say: [
   "Some words change their form when we compare. Good, better, best. Bad, worse, worst.",
   "I like soccer better than baseball.",
   "I like pizza the best. Math is the worst!"
  ]
 },
 gram2: {
  can: "ask \"Which do you like better?\"",
  cols: ["better · more", "best · most · worst"],
  rows: [
   ["+", "I like movies <b>more</b> than books.", "I like comedies <b>the most</b>."],
   ["−", "I like jazz <b>less</b> than rock.", "Horror is <b>the worst</b> genre for me."],
   ["?", "Which do you like <b>better</b>, cats or dogs?", "What do you like <b>the best</b>?"]
  ]
 },
 gapCan: "ask \"What does she like?\"",
 role: { title: "The", em: "Favorites", tail: "Survey", opener: "Excuse me! Can I ask you a few questions about your favorite things?", a: "Reporter", b: "Shopper" },
 pron: { can: "say don't · doesn't · can't clearly", title: "Short", em: "forms", game: "Teacher says a thing → you say how you feel: <i>\"I can't stand spiders!\"</i>" },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["I like K-pop the best.", "It makes me want to dance."],
   ["I don't like very loud songs.", "They hurt my ears."],
   ["Yes, I do. I love cartoon movies.", "I watch them on weekends."],
   ["My favorite actor is Tom Holland.", "He plays Spider-Man."],
   ["My favorite athlete is Son Heung-min.", "He is a great soccer player."],
   ["Yes, I do. I read comic books.", "They are funny."],
   ["After high school, I want to study art.", "I love drawing."],
   ["I like math.", "It's like a puzzle."],
   ["I like the bumper cars.", "I don't like the roller coaster."],
   ["I like riding my bike outside.", "I don't like hiking."]
  ],
  frame: [
   "I like ___ the best.",
   "I don't like ___. They are too ___.",
   "Yes, I do. I love ___ movies. / No, I don't.",
   "My favorite actor is ___.",
   "My favorite athlete is ___. He/She is a great ___.",
   "Yes, I do. I read ___. / No, I don't.",
   "After high school, I want to study ___.",
   "I like / hate math. It's ___.",
   "I like the ___. I don't like the ___.",
   "I like ___ outside. I don't like ___."
  ],
  bank: [
   ["K-pop", "rock", "hip-hop", "classical"],
   ["loud songs", "sad songs", "loud", "boring"],
   ["cartoon", "action", "funny", "scary"],
   ["Tom Holland", "Emma Watson", "Song Kang-ho", "IU"],
   ["Son Heung-min", "Kim Yuna", "soccer player", "skater"],
   ["comic books", "stories", "science books", "magazines"],
   ["art", "music", "science", "computers"],
   ["fun", "hard", "easy", "boring"],
   ["bumper cars", "carousel", "roller coaster", "Viking ship"],
   ["riding my bike", "swimming", "hiking", "camping"]
  ],
  more: [
   ["Who is your favorite singer?", "Do you sing it?"],
   ["What songs do you like?", "Do your parents like loud music?"],
   ["What is your favorite movie?", "Do you like popcorn?"],
   ["What movie is he in?", "Would you like to be an actor?"],
   ["What sport does he play?", "Do you play it too?"],
   ["What is your favorite book?", "When do you read?"],
   ["What do you want to be?", "Is it hard to study?"],
   ["What subject do you like the best?", "Is math easy for you?"],
   ["Are you scared of fast rides?", "Who do you go with?"],
   ["What do you do in summer?", "Do you like rain?"]
  ],
  gram1: {
   chain: ["I like ___ better than ___.", "I like ___ the best!"],
   ex: "T: I like cats better than dogs.<br>S: I like summer better than winter.<br>T: I like …"
  },
  gram2: {
   a: { title: "Which do you like better?", items: ["Cats or dogs?", "Pizza or chicken?", "Math or art?", "Summer or winter?", "Movies or books?"], ans: "I like dogs <b>better</b>. <b>+ one more sentence</b>" },
   b: { title: "My top 3", big: "I like ___ the best. I like ___ the least.", ans: "Then ask: <b>What do you like the best?</b>" }
  },
  opener: { think: ["Look at the photo. Who likes the movie?", "What do you love?", "What don't you like?"] },
  convo: [
   ["A", "Hi, Jun! What are you doing this weekend?"],
   ["B", "I'm going to see a {cartoon} movie."],
   ["A", "Cool! Do you like cartoons?"],
   ["B", "Yes! I love them. How about you?"],
   ["A", "I like {action} movies better."],
   ["B", "Oh! Do you like {popcorn}?"],
   ["A", "No, I don't. I like {nachos} the best!"]
  ],
  swap: [["a movie type", "cartoon"], ["your partner's movie type", "action"], ["a snack", "popcorn"], ["another snack", "nachos"]],
  lang: [
   ["Say you like it", ["I love it!", "It's great!", "I like it a lot."]],
   ["Say you don't", ["I don't like it.", "It's not for me."]],
   ["Ask back", ["How about you?", "Do you like it?"]]
  ],
  langPractice: ["I love spiders.", "I don't like ice cream.", "I like math the best.", "I hate rainy days.", "I love roller coasters.", "I don't like reading."],
  survey: {
   ask: "Do you like",
   cols: ["Me", "My teacher"],
   rows: ["scary movies", "reading books", "math", "roller coasters", "camping", "K-pop"],
   q: "Do you like …?  → Yes, I do. / No, I don't.",
   report: "I like ___, but my teacher doesn't."
  },
  gap: {
   who: "Yuna",
   q: ["What music does Yuna like?", "Who is her favorite athlete?", "Does she like math?", "What ride does she dislike?"],
   A: [["music", "hip-hop"], ["favorite athlete", "?"], ["math?", "Yes — it's fun"], ["dislikes", "?"]],
   B: [["music", "?"], ["favorite athlete", "Kim Yuna"], ["math?", "?"], ["dislikes", "the roller coaster"]],
   tip: "What <b>does</b> she like? · She like<b>s</b> · She <b>doesn't</b> like"
  },
  role: {
   A: ["You are a reporter.", "Ask 5 questions.", "Write short notes."],
   B: ["You are a shopper.", "Choose: a sports fan / a movie fan / a book fan.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a \"We both like…\" poster",
   steps: ["Pick 4 things: music, food, sport, movie.", "Ask your teacher. Answer, too.", "Find 2 same and 1 different.", "Show your poster and tell!"],
   lang: ["We both like ___!", "I like ___, but my teacher likes ___.", "My teacher doesn't like ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! My name is Jisu.", "I love K-pop. I like BLACKPINK the best.", "I like reading comic books.", "I don't like math. It's hard!", "I like camping better than hiking.", "Thank you!"],
   outline: ["Name", "Music I love", "Something I like", "Something I don't like", "Better than …"],
   check: ["Loud voice", "Look at the camera", "Say like and don't like"]
  },
  pron: {
   cols: [["don't", ["I don't like it", "I don't know", "don't go"]], ["doesn't", ["She doesn't like it", "He doesn't play", "It doesn't work"]], ["can't", ["I can't swim", "I can't stand it", "I can't wait"]]],
   up: "Do you like math?",
   down: "What do you like the best?"
  },
  review: ["I can say what I like and don't like.", "I can use better / the best.", "I can ask \"Do you like …?\"", "I can tell about my favorites."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I mostly listen to R&B and indie pop.", "The melodies are calm and the lyrics feel real.", "I play Lauv or Crush when I study at night.", "What genre do you listen to most?"],
   ["I'm not a fan of heavy metal bands.", "The screaming sounds more like noise to me.", "My brother plays it loudly, and it gives me a headache.", "Is there a genre you can't stand?"],
   ["Yes, I love movies, especially thrillers.", "I like trying to guess the ending.", "I watched Parasite three times and noticed new details each time.", "What was the last movie you saw?"],
   ["My favorite actor is Song Kang-ho.", "He can play any role and still feel natural.", "He was funny and scary at the same time in Parasite.", "Who is your favorite actor?"],
   ["I really admire Kim Yuna.", "She stayed calm under huge pressure.", "She won Olympic gold in 2010 with a record score.", "Which athlete inspires you?"],
   ["Yes, but I read more online than books now.", "It's quicker and I can read on the bus.", "Still, I finished two mystery novels last month.", "Do you prefer e-books or paper books?"],
   ["I'd like to study psychology.", "I'm interested in why people act the way they do.", "I love watching videos about memory and habits.", "What would you study?"],
   ["Honestly, I don't like math very much.", "I get worse when there's a time limit.", "But I like geometry better than algebra.", "Were you good at math in school?"],
   ["I love the free-fall ride the most.", "The drop feels scary but exciting.", "But I hate spinning cups — they make me dizzy.", "Are you brave on rides?"],
   ["I like hiking, but I dislike camping.", "Hiking clears my head, but I sleep badly in a tent.", "Last fall I hiked Bukhansan and loved the view.", "What outdoor activity do you enjoy?"]
  ],
  frame: [
   "I mostly listen to … because …",
   "I'm not a fan of … because …",
   "Yes, I love … especially … / No, I …",
   "My favorite actor is … He/She …",
   "I really admire … because …",
   "Yes, I read … / Not really, but …",
   "I'd like to study … because …",
   "I like / don't like math very much. …",
   "I love … the most, but I hate …",
   "I like …, but I dislike … because …"
  ],
  more: [
   ["Does music change your mood?", "Is music better now or in the past?", "Why do people's tastes change?"],
   ["Is it OK to say you dislike a popular singer?", "Why do some songs get stuck in your head?", "What makes a song annoying?"],
   ["Theater or streaming at home — which is better?", "Should movies be shorter?", "Which movie would you watch again?"],
   ["Is acting a talent or a skill?", "Should actors talk about politics?", "Which role would you like to play?"],
   ["Are athletes paid too much?", "What makes an athlete a role model?", "Is e-sports a real sport?"],
   ["Why do fewer people read books today?", "Should schools make students read more?", "What book changed the way you think?"],
   ["Should you study what you love or what pays well?", "Is college necessary for everyone?", "What subject should every student take?"],
   ["Why do so many students dislike math?", "How can math be more fun?", "Where do you use math in real life?"],
   ["Why do people enjoy being scared?", "What is the scariest thing you have done?", "Are theme parks worth the price?"],
   ["Do young people spend enough time outside?", "Which is better: the sea or the mountains?", "What outdoor activity would you like to try?"]
  ],
  gram1: {
   chain: ["I like ___ much more than ___.", "___ is the worst ___ I know."],
   ex: "T: I like tea much more than coffee.<br>S: Spinning cups is the worst ride I know.<br>T: …"
  },
  gram2: {
   a: { title: "Which do you like better?", items: ["Morning or night?", "Books or movies?", "The sea or the mountains?", "Texting or calling?", "Cooking or eating out?"], ans: "I like night <b>better</b> because … <b>What about you?</b>" },
   b: { title: "Best & worst", big: "The best ___ I've ever had was ___, and the worst was ___.", ans: "Then ask: <b>What's the best … you've ever …?</b>" }
  },
  opener: { think: ["Can two people with different tastes be close friends?", "Do your likes come from your family or your friends?", "Is it rude to say you dislike something?"] },
  convo: [
   ["A", "Hey, want to see a movie this weekend?"],
   ["B", "Sure! What kind of movie are you thinking of?"],
   ["A", "Maybe a {horror} movie? I love them."],
   ["B", "Hmm, honestly, horror isn't really my thing."],
   ["A", "Oh, really? What do you like, then?"],
   ["B", "I prefer {comedies}. I like laughing better than screaming."],
   ["A", "Fair enough. How about {Marvel}? It's funny and exciting."],
   ["B", "That sounds great! Should we get {popcorn}?"],
   ["A", "Of course. Movies are the best with popcorn!"]
  ],
  swap: [["a genre you like", "horror"], ["a genre your partner likes", "comedies"], ["a movie series", "Marvel"], ["a snack", "popcorn"]],
  lang: [
   ["Say you like it", ["I'm really into …", "I'm a big fan of …", "I can't get enough of …"]],
   ["Say you don't (politely)", ["It isn't really my thing.", "I'm not a fan of …", "I can't stand …"]],
   ["Compare", ["I prefer … to …", "I like … better than …"]],
   ["Suggest", ["How about …?", "Fair enough."]]
  ],
  langPractice: ["I can't stand K-pop.", "I think reading is boring.", "Math is my favorite subject.", "I hate the beach.", "Horror movies are the best.", "I love roller coasters."],
  survey: {
   ask: "Do you like",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["horror movies", "reading before bed", "math", "extreme rides", "camping", "live concerts"],
   q: "Do you like …? → Yes. → Ask: Why? / Since when? / What's the best one?",
   report: "My teacher likes ___ better than I do, but we both ___."
  },
  gap: {
   who: "Yuna",
   q: ["What genre of music does Yuna like?", "Who is her favorite actor?", "How does she feel about math?", "What ride does she love, and which does she hate?", "What does she want to study?"],
   A: [["music", "jazz — relaxing"], ["favorite actor", "?"], ["math", "?"], ["rides", "loves the Viking ship"], ["wants to study", "?"]],
   B: [["music", "?"], ["favorite actor", "Kim Tae-ri"], ["math", "hates it — too stressful"], ["rides", "hates spinning cups"], ["wants to study", "film directing"]],
   tip: "What <b>does</b> she like? · She <b>doesn't</b> like · She likes A <b>better</b> than B"
  },
  role: {
   A: ["You are a reporter.", "Ask 5 questions + 2 follow-ups.", "Report the 3 strongest likes."],
   B: ["You are a shopper.", "Choose: a sports fan / a movie fan / a book lover.", "Give reasons and examples. Hide one strange dislike — tell it only if asked \"Anything you hate?\""]
  },
  tts: {
   title: "Plan the perfect weekend for both of you",
   steps: ["Think: what do you both like — and hate?", "Ask your teacher 4 of today's questions.", "Agree on 3 activities you both enjoy.", "Present your weekend plan in 1 minute."],
   lang: ["I'd rather ___ because ___.", "That's not really my thing, but ___.", "So we agree on ___."]
  },
  speech: {
   time: "2 min",
   model: [
    "Hi everyone. Let me tell you about my likes and dislikes.",
    "I'm really into indie music because it calms me down.",
    "I also love thrillers — Parasite is the best movie I've seen.",
    "My favorite athlete is Kim Yuna because she never gave up.",
    "On the other hand, I can't stand math tests.",
    "Outside, I like hiking better than camping.",
    "I think our likes show who we are.",
    "Thanks for listening! Any questions?"
   ],
   outline: ["Hook — \"Let me tell you…\"", "Music + reason", "Best movie / actor", "A person I admire", "Something I can't stand", "Better than … + questions"],
   check: ["Clear voice", "Eye contact", "Use better / best", "Answer 1 question"]
  },
  pron: {
   cols: [["don't", ["I don't mind", "I don't care", "don't worry"]], ["doesn't", ["She doesn't like it", "It doesn't matter", "He doesn't care"]], ["can't", ["I can't stand it", "I can't decide", "I can't wait"]]],
   up: "Do you like horror movies?",
   down: "Which genre do you like best?"
  },
  review: ["I can answer in 4 parts.", "I can use better / best / worse / worst.", "I can say I dislike something politely.", "I can talk about my likes for 2 minutes."]
 }
};
