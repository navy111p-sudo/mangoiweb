/* 📚 영어 독서 사다리 — 글 정본 (2026-10-18). 화면: /stories.html · 엔진: /js/reading-ladder.js
   단계 4개 × 12편. 한 편 = 문장별 영어·우리말 · 핵심 문장 번호(key) · 중심 내용 보기 4개(answer 는 정답 번호 — 화면이 섞음)
   · 오늘의 낱말 3개 · 핵심 한 줄 영작(summary.ko → summary.en, keywords 3개).
   ⚠️ 고치면 이 파일을 부르는 stories.html 의 ?v= 를 올리고 reading_ladder_harness 를 돌리세요. */
window.READING_LADDER = {
 "stages": [
  {
   "n": 1,
   "color": "#2f9e44",
   "cefr": "A1",
   "name": {
    "ko": "쉬운 이야기",
    "en": "Easy stories"
   },
   "grade": {
    "ko": "초1~3",
    "en": "Grades 1-3"
   },
   "desc": {
    "ko": "짧은 문장으로 된 이야기 — 감정·교훈 한 가지를 찾아요.",
    "en": "Short stories in simple sentences — find the one feeling or lesson."
   }
  },
  {
   "n": 2,
   "color": "#1971c2",
   "cefr": "A2",
   "name": {
    "ko": "조금 긴 이야기",
    "en": "Longer stories"
   },
   "grade": {
    "ko": "초4~6",
    "en": "Grades 4-6"
   },
   "desc": {
    "ko": "우화·생활 이야기 — 이야기가 전하는 메시지를 찾아요.",
    "en": "Fables and everyday stories — find the message."
   }
  },
  {
   "n": 3,
   "color": "#e8590c",
   "cefr": "A2+/B1",
   "name": {
    "ko": "쉬운 지식 글",
    "en": "Easy non-fiction"
   },
   "grade": {
    "ko": "초6~중2",
    "en": "Grades 6-8"
   },
   "desc": {
    "ko": "과학·역사·문화 설명문 — 주제문을 찾고 배경지식을 넓혀요.",
    "en": "Science, history and culture — find the topic sentence and build background knowledge."
   }
  },
  {
   "n": 4,
   "color": "#862e9c",
   "cefr": "B1+/B2",
   "name": {
    "ko": "고1 지식 글",
    "en": "High-school non-fiction"
   },
   "grade": {
    "ko": "중3~고1",
    "en": "Grades 9-10"
   },
   "desc": {
    "ko": "사회·환경·기술 논설문 — 수능형 요지 찾기(핵심 문장이 중간·끝에도 있어요).",
    "en": "Society, environment and technology — exam-style gist (the key sentence may be in the middle or end)."
   }
  }
 ],
 "passages": [
  {
   "stage": 1,
   "id": "s1-01",
   "genre": "story",
   "title": {
    "en": "Max Finds His Way Home",
    "ko": "집을 찾아간 맥스"
   },
   "topic": {
    "en": "Animals",
    "ko": "동물"
   },
   "bg": {
    "en": "Dogs have a very strong sense of smell. They can smell things from far away!",
    "ko": "개는 냄새를 아주 잘 맡아요. 멀리 있는 냄새도 맡을 수 있답니다!"
   },
   "sentences": [
    {
     "en": "Max is a small brown puppy.",
     "ko": "맥스는 작은 갈색 강아지이다."
    },
    {
     "en": "One day, he runs after a red ball.",
     "ko": "어느 날, 맥스는 빨간 공을 쫓아 달려간다."
    },
    {
     "en": "Soon he is far from home, and he feels scared.",
     "ko": "곧 맥스는 집에서 멀어지고, 무서워진다."
    },
    {
     "en": "Then he smells something good.",
     "ko": "그때 맥스는 좋은 냄새를 맡는다."
    },
    {
     "en": "It is the smell of his family's dinner!",
     "ko": "그것은 가족의 저녁밥 냄새이다!"
    },
    {
     "en": "Max follows the smell all the way home.",
     "ko": "맥스는 냄새를 따라 집까지 쭉 간다."
    },
    {
     "en": "His family hugs him, and Max is happy again.",
     "ko": "가족이 맥스를 안아 주고, 맥스는 다시 행복해진다."
    }
   ],
   "key": 5,
   "keyWhy": {
    "en": "This sentence shows how the lost puppy finds his way home.",
    "ko": "길 잃은 강아지가 어떻게 집을 찾아가는지 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "A lost puppy uses his nose to find home.",
      "ko": "길 잃은 강아지가 코를 써서 집을 찾는다."
     },
     {
      "en": "Max likes to run after a red ball.",
      "ko": "맥스는 빨간 공을 쫓아가는 것을 좋아한다."
     },
     {
      "en": "Max stays lost and never finds his home.",
      "ko": "맥스는 계속 길을 잃고 집을 찾지 못한다."
     },
     {
      "en": "All dogs like to eat dinner.",
      "ko": "모든 개는 저녁밥 먹는 것을 좋아한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The story is about how Max gets lost and then follows a smell back home.",
     "ko": "맥스가 길을 잃었다가 냄새를 따라 집으로 돌아가는 이야기예요."
    }
   },
   "words": [
    {
     "en": "puppy",
     "ko": "강아지"
    },
    {
     "en": "scared",
     "ko": "무서워하는"
    },
    {
     "en": "smell",
     "ko": "냄새; 냄새 맡다"
    }
   ],
   "summary": {
    "ko": "길 잃은 강아지가 냄새를 따라 집을 찾아간다.",
    "en": "A lost puppy follows a smell to find home.",
    "keywords": [
     "puppy",
     "smell",
     "home"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-02",
   "genre": "story",
   "title": {
    "en": "A Fun Rainy Day",
    "ko": "재미있는 비 오는 날"
   },
   "topic": {
    "en": "Weather",
    "ko": "날씨"
   },
   "bg": {
    "en": "On rainy days, we often stay inside. There are many fun games to play at home!",
    "ko": "비가 오는 날에는 보통 집 안에 있어요. 집에서도 할 수 있는 재미있는 놀이가 많아요!"
   },
   "sentences": [
    {
     "en": "It is raining, and Lily cannot play outside.",
     "ko": "비가 와서 릴리는 밖에서 놀 수 없다."
    },
    {
     "en": "She feels sad and looks out the window.",
     "ko": "릴리는 슬퍼서 창밖을 바라본다."
    },
    {
     "en": "Then her brother Sam has an idea.",
     "ko": "그때 오빠 샘에게 좋은 생각이 떠오른다."
    },
    {
     "en": "They make a tent with blankets and chairs.",
     "ko": "둘은 담요와 의자로 텐트를 만든다."
    },
    {
     "en": "They read books in the tent with a flashlight.",
     "ko": "둘은 텐트 안에서 손전등을 켜고 책을 읽는다."
    },
    {
     "en": "They eat snacks and tell funny stories.",
     "ko": "둘은 간식을 먹고 웃긴 이야기를 한다."
    },
    {
     "en": "Lily says, \"Rainy days can be fun too!\"",
     "ko": "릴리가 말한다. \"비 오는 날도 재미있을 수 있구나!\""
    }
   ],
   "key": 6,
   "keyWhy": {
    "en": "Lily says the lesson of the story: rainy days can be fun.",
    "ko": "릴리가 이야기의 교훈인 '비 오는 날도 재미있다'를 직접 말해요."
   },
   "main": {
    "options": [
     {
      "en": "A rainy day can be fun if you play inside.",
      "ko": "집 안에서 놀면 비 오는 날도 재미있을 수 있다."
     },
     {
      "en": "Lily and Sam read books with a flashlight.",
      "ko": "릴리와 샘은 손전등을 켜고 책을 읽는다."
     },
     {
      "en": "Lily feels sad all day long.",
      "ko": "릴리는 하루 종일 슬프다."
     },
     {
      "en": "Rain helps plants grow tall.",
      "ko": "비는 식물이 크게 자라도록 돕는다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Lily is sad at first, but playing inside makes the rainy day fun.",
     "ko": "릴리는 처음엔 슬펐지만, 집 안에서 놀면서 비 오는 날이 즐거워졌어요."
    }
   },
   "words": [
    {
     "en": "window",
     "ko": "창문"
    },
    {
     "en": "tent",
     "ko": "텐트"
    },
    {
     "en": "blankets",
     "ko": "담요들"
    }
   ],
   "summary": {
    "ko": "비 오는 날에도 집 안에서 재미있게 놀 수 있다.",
    "en": "Rainy days can be fun inside the house.",
    "keywords": [
     "rainy",
     "fun",
     "inside"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-03",
   "genre": "story",
   "title": {
    "en": "Jun's New Friend",
    "ko": "준의 새 친구"
   },
   "topic": {
    "en": "Friends",
    "ko": "친구"
   },
   "bg": {
    "en": "A new school can feel scary at first. A friendly hello can help a lot!",
    "ko": "새 학교는 처음에 무섭게 느껴질 수 있어요. 다정한 인사 한마디가 큰 도움이 돼요!"
   },
   "sentences": [
    {
     "en": "It is Jun's first day at a new school.",
     "ko": "오늘은 준이 새 학교에 가는 첫날이다."
    },
    {
     "en": "He does not know anyone, so he feels shy.",
     "ko": "준은 아는 사람이 없어서 부끄럽다."
    },
    {
     "en": "At lunch, he sits alone.",
     "ko": "점심시간에 준은 혼자 앉아 있다."
    },
    {
     "en": "A girl named Mina sits next to him.",
     "ko": "미나라는 여자아이가 준의 옆에 앉는다."
    },
    {
     "en": "\"Hi! Do you like soccer?\" she asks.",
     "ko": "\"안녕! 너 축구 좋아해?\" 미나가 묻는다."
    },
    {
     "en": "Jun smiles and says, \"Yes, I love soccer!\"",
     "ko": "준은 웃으며 말한다. \"응, 나 축구 정말 좋아해!\""
    },
    {
     "en": "Now Jun has a new friend, and school is fun.",
     "ko": "이제 준에게는 새 친구가 생겼고, 학교가 즐겁다."
    }
   ],
   "key": 6,
   "keyWhy": {
    "en": "This sentence shows the result: Jun makes a new friend and is happy.",
    "ko": "준이 새 친구를 사귀고 행복해졌다는 결과를 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Jun makes a new friend on his first day.",
      "ko": "준은 첫날에 새 친구를 사귄다."
     },
     {
      "en": "Mina likes to play soccer.",
      "ko": "미나는 축구하는 것을 좋아한다."
     },
     {
      "en": "Jun stays alone and has no friends.",
      "ko": "준은 계속 혼자이고 친구가 없다."
     },
     {
      "en": "School lunch is always very good.",
      "ko": "학교 점심은 언제나 아주 맛있다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Jun is shy and alone at first, but he makes a friend with Mina.",
     "ko": "준은 처음엔 부끄럽고 혼자였지만, 미나와 친구가 되었어요."
    }
   },
   "words": [
    {
     "en": "shy",
     "ko": "부끄러워하는"
    },
    {
     "en": "alone",
     "ko": "혼자"
    },
    {
     "en": "friend",
     "ko": "친구"
    }
   ],
   "summary": {
    "ko": "준은 새 학교에서 새 친구를 사귄다.",
    "en": "Jun makes a new friend at his new school.",
    "keywords": [
     "friend",
     "new",
     "school"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-04",
   "genre": "story",
   "title": {
    "en": "Grandma's Garden",
    "ko": "할머니의 텃밭"
   },
   "topic": {
    "en": "Family",
    "ko": "가족"
   },
   "bg": {
    "en": "Many people grow vegetables in a garden. Plants need water and sun to grow.",
    "ko": "많은 사람들이 텃밭에서 채소를 길러요. 식물이 자라려면 물과 햇빛이 필요해요."
   },
   "sentences": [
    {
     "en": "Grandma has a big vegetable garden.",
     "ko": "할머니에게는 큰 채소밭이 있다."
    },
    {
     "en": "Tom visits her every summer.",
     "ko": "톰은 여름마다 할머니 댁에 간다."
    },
    {
     "en": "They water the plants together in the morning.",
     "ko": "둘은 아침에 함께 식물에 물을 준다."
    },
    {
     "en": "Tom pulls out weeds, and Grandma picks tomatoes.",
     "ko": "톰은 잡초를 뽑고, 할머니는 토마토를 딴다."
    },
    {
     "en": "The carrots are orange, and the beans are long.",
     "ko": "당근은 주황색이고, 콩은 길쭉하다."
    },
    {
     "en": "At night, Grandma cooks soup with the fresh vegetables.",
     "ko": "밤에 할머니는 신선한 채소로 수프를 끓인다."
    },
    {
     "en": "Tom thinks food from the garden tastes the best.",
     "ko": "톰은 텃밭에서 난 음식이 가장 맛있다고 생각한다."
    }
   ],
   "key": 6,
   "keyWhy": {
    "en": "This sentence tells how Tom feels about Grandma's garden.",
    "ko": "톰이 할머니의 텃밭을 어떻게 생각하는지 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Tom loves helping in Grandma's garden and eating its food.",
      "ko": "톰은 할머니의 텃밭 일을 돕고 그곳 음식을 먹는 것을 좋아한다."
     },
     {
      "en": "The beans in the garden are long.",
      "ko": "텃밭의 콩은 길쭉하다."
     },
     {
      "en": "Tom does not like vegetables at all.",
      "ko": "톰은 채소를 전혀 좋아하지 않는다."
     },
     {
      "en": "Many people live in big cities.",
      "ko": "많은 사람들이 큰 도시에 산다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Tom works in the garden with Grandma and thinks the garden food is the best.",
     "ko": "톰은 할머니와 텃밭에서 일하고, 텃밭 음식이 최고라고 생각해요."
    }
   },
   "words": [
    {
     "en": "garden",
     "ko": "정원, 텃밭"
    },
    {
     "en": "water",
     "ko": "물을 주다"
    },
    {
     "en": "fresh",
     "ko": "신선한"
    }
   ],
   "summary": {
    "ko": "톰은 할머니의 텃밭에서 기른 채소가 가장 맛있다고 생각한다.",
    "en": "Tom thinks vegetables from Grandma's garden taste best.",
    "keywords": [
     "vegetables",
     "garden",
     "taste"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-05",
   "genre": "story",
   "title": {
    "en": "A Surprise for Mom",
    "ko": "엄마를 위한 깜짝 선물"
   },
   "topic": {
    "en": "Family",
    "ko": "가족"
   },
   "bg": {
    "en": "A surprise is something nice that someone does not know about yet. People often plan surprises for birthdays.",
    "ko": "깜짝 선물은 상대방이 아직 모르는 좋은 일이에요. 사람들은 생일에 깜짝 파티를 자주 준비해요."
   },
   "sentences": [
    {
     "en": "Today is Mom's birthday.",
     "ko": "오늘은 엄마의 생일이다."
    },
    {
     "en": "Mina and Dad want to surprise her.",
     "ko": "미나와 아빠는 엄마를 깜짝 놀라게 해 주고 싶다."
    },
    {
     "en": "While Mom is at work, they bake a cake.",
     "ko": "엄마가 회사에 있는 동안, 둘은 케이크를 굽는다."
    },
    {
     "en": "Mina draws a card with a big red heart.",
     "ko": "미나는 커다란 빨간 하트가 그려진 카드를 그린다."
    },
    {
     "en": "They put balloons all over the living room.",
     "ko": "둘은 거실 곳곳에 풍선을 단다."
    },
    {
     "en": "When Mom comes home, they shout, \"Surprise!\"",
     "ko": "엄마가 집에 오자, 둘은 \"서프라이즈!\" 하고 외친다."
    },
    {
     "en": "Mom laughs and cries happy tears.",
     "ko": "엄마는 웃으면서 기쁨의 눈물을 흘린다."
    }
   ],
   "key": 6,
   "keyWhy": {
    "en": "This sentence shows that the surprise makes Mom very happy.",
    "ko": "깜짝 파티 덕분에 엄마가 아주 기뻐한다는 것을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Mina and Dad make Mom happy with a birthday surprise.",
      "ko": "미나와 아빠는 깜짝 생일 파티로 엄마를 기쁘게 한다."
     },
     {
      "en": "Mina draws a red heart on a card.",
      "ko": "미나는 카드에 빨간 하트를 그린다."
     },
     {
      "en": "Mom is angry about the surprise.",
      "ko": "엄마는 깜짝 파티 때문에 화가 난다."
     },
     {
      "en": "Everyone likes to eat cake.",
      "ko": "모든 사람은 케이크 먹는 것을 좋아한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Mina and Dad plan a surprise, and it makes Mom laugh and cry happy tears.",
     "ko": "미나와 아빠가 깜짝 파티를 준비했고, 엄마는 웃으며 기쁨의 눈물을 흘렸어요."
    }
   },
   "words": [
    {
     "en": "surprise",
     "ko": "깜짝 놀라게 하다; 깜짝 선물"
    },
    {
     "en": "bake",
     "ko": "굽다"
    },
    {
     "en": "balloons",
     "ko": "풍선들"
    }
   ],
   "summary": {
    "ko": "미나와 아빠는 깜짝 생일 파티로 엄마를 기쁘게 한다.",
    "en": "Mina and Dad make Mom happy with a birthday surprise.",
    "keywords": [
     "Mom",
     "happy",
     "surprise"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-06",
   "genre": "story",
   "title": {
    "en": "Half a Sandwich",
    "ko": "샌드위치 반쪽"
   },
   "topic": {
    "en": "Sharing",
    "ko": "나눔"
   },
   "bg": {
    "en": "Sharing means giving part of what you have to someone else. It is a kind thing to do.",
    "ko": "나눔은 내가 가진 것의 일부를 다른 사람에게 주는 거예요. 아주 친절한 행동이에요."
   },
   "sentences": [
    {
     "en": "At lunch, Sam opens his bag.",
     "ko": "점심시간에 샘은 가방을 연다."
    },
    {
     "en": "Oh no, he forgot his lunch at home!",
     "ko": "이런, 샘은 점심 도시락을 집에 두고 왔다!"
    },
    {
     "en": "His stomach makes a loud noise.",
     "ko": "샘의 배에서 꼬르륵 큰 소리가 난다."
    },
    {
     "en": "His friend Ben sees his sad face.",
     "ko": "친구 벤이 샘의 슬픈 얼굴을 본다."
    },
    {
     "en": "Ben gives Sam half of his sandwich and an apple.",
     "ko": "벤은 샘에게 자기 샌드위치 반쪽과 사과 하나를 준다."
    },
    {
     "en": "\"Thank you, Ben!\" says Sam with a big smile.",
     "ko": "\"고마워, 벤!\" 샘이 활짝 웃으며 말한다."
    },
    {
     "en": "Sharing makes both friends feel good.",
     "ko": "나눔은 두 친구 모두를 기분 좋게 만든다."
    }
   ],
   "key": 6,
   "keyWhy": {
    "en": "This sentence tells the lesson of the story: sharing feels good.",
    "ko": "'나누면 기분이 좋다'는 이야기의 교훈을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Ben shares his lunch, and both friends feel good.",
      "ko": "벤이 점심을 나누어 주고, 두 친구 모두 기분이 좋다."
     },
     {
      "en": "Sam's stomach makes a loud noise.",
      "ko": "샘의 배에서 큰 소리가 난다."
     },
     {
      "en": "Ben eats all his lunch and does not share.",
      "ko": "벤은 점심을 혼자 다 먹고 나누지 않는다."
     },
     {
      "en": "Apples are good for your body.",
      "ko": "사과는 몸에 좋다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Sam forgets his lunch, and Ben shares with him. Both friends are happy.",
     "ko": "샘이 도시락을 잊었고, 벤이 나누어 주었어요. 두 친구 모두 행복해졌어요."
    }
   },
   "words": [
    {
     "en": "forgot",
     "ko": "잊어버렸다"
    },
    {
     "en": "half",
     "ko": "반, 절반"
    },
    {
     "en": "sharing",
     "ko": "나눔, 나누기"
    }
   ],
   "summary": {
    "ko": "친구와 음식을 나누면 모두가 행복해진다.",
    "en": "Sharing food with a friend makes everyone happy.",
    "keywords": [
     "sharing",
     "friend",
     "happy"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-07",
   "genre": "story",
   "title": {
    "en": "Brave at the Dentist",
    "ko": "치과에서 용감하게"
   },
   "topic": {
    "en": "Feelings",
    "ko": "감정"
   },
   "bg": {
    "en": "A dentist is a doctor for your teeth. Visiting the dentist keeps your teeth healthy.",
    "ko": "치과 의사는 이를 돌봐 주는 의사예요. 치과에 가면 이를 건강하게 지킬 수 있어요."
   },
   "sentences": [
    {
     "en": "Ella has a dentist visit today.",
     "ko": "엘라는 오늘 치과에 간다."
    },
    {
     "en": "She is scared, and her hands shake.",
     "ko": "엘라는 무서워서 손이 떨린다."
    },
    {
     "en": "Mom holds her hand and says, \"You can do it.\"",
     "ko": "엄마가 엘라의 손을 잡고 말한다. \"너는 할 수 있어.\""
    },
    {
     "en": "Ella takes a deep breath and opens her mouth.",
     "ko": "엘라는 숨을 깊이 들이쉬고 입을 벌린다."
    },
    {
     "en": "The dentist checks her teeth gently.",
     "ko": "치과 의사 선생님이 엘라의 이를 살살 살펴본다."
    },
    {
     "en": "It does not hurt at all!",
     "ko": "하나도 아프지 않다!"
    },
    {
     "en": "Ella feels proud because she is brave.",
     "ko": "엘라는 자기가 용감해서 뿌듯하다."
    }
   ],
   "key": 6,
   "keyWhy": {
    "en": "This sentence shows the main feeling: Ella is brave and proud.",
    "ko": "엘라가 용감하고 뿌듯하다는 핵심 감정을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Ella is brave at the dentist and feels proud.",
      "ko": "엘라는 치과에서 용감했고 뿌듯해한다."
     },
     {
      "en": "The dentist checks Ella's teeth.",
      "ko": "치과 의사가 엘라의 이를 살펴본다."
     },
     {
      "en": "Ella runs away from the dentist.",
      "ko": "엘라는 치과에서 도망친다."
     },
     {
      "en": "Teeth are white and hard.",
      "ko": "이는 하얗고 단단하다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Ella is scared at first, but she is brave, and she feels proud.",
     "ko": "엘라는 처음엔 무서웠지만 용기를 냈고, 뿌듯함을 느꼈어요."
    }
   },
   "words": [
    {
     "en": "dentist",
     "ko": "치과 의사"
    },
    {
     "en": "breath",
     "ko": "숨, 호흡"
    },
    {
     "en": "brave",
     "ko": "용감한"
    }
   ],
   "summary": {
    "ko": "엘라는 치과에서 용기를 내고 뿌듯해한다.",
    "en": "Ella is brave at the dentist and feels proud.",
    "keywords": [
     "brave",
     "dentist",
     "proud"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-08",
   "genre": "story",
   "title": {
    "en": "The Cat in the Tree",
    "ko": "나무 위의 고양이"
   },
   "topic": {
    "en": "Animals",
    "ko": "동물"
   },
   "bg": {
    "en": "Cats are good at climbing up trees. But coming down is sometimes hard for them!",
    "ko": "고양이는 나무에 잘 올라가요. 하지만 내려오는 것은 가끔 어려워해요!"
   },
   "sentences": [
    {
     "en": "A little cat climbs up a tall tree.",
     "ko": "작은 고양이가 키 큰 나무 위로 올라간다."
    },
    {
     "en": "Now it cannot come down.",
     "ko": "이제 고양이는 내려올 수가 없다."
    },
    {
     "en": "\"Meow, meow!\" it cries.",
     "ko": "\"야옹, 야옹!\" 고양이가 운다."
    },
    {
     "en": "Mina and Jun hear the cat and run to help.",
     "ko": "미나와 준은 고양이 소리를 듣고 도와주러 달려간다."
    },
    {
     "en": "They cannot reach it, so they call Mina's dad.",
     "ko": "둘은 손이 닿지 않아서 미나의 아빠를 부른다."
    },
    {
     "en": "Dad brings a ladder and carefully gets the cat.",
     "ko": "아빠는 사다리를 가져와서 조심스럽게 고양이를 내려 준다."
    },
    {
     "en": "The cat purrs, and the children feel happy they helped.",
     "ko": "고양이는 가르랑거리고, 아이들은 도울 수 있어서 기쁘다."
    }
   ],
   "key": 5,
   "keyWhy": {
    "en": "This sentence shows how the problem is solved: the cat is saved.",
    "ko": "문제가 어떻게 해결되는지, 즉 고양이가 구조되는 장면을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "The children get help to save a cat in a tree.",
      "ko": "아이들은 도움을 받아 나무 위의 고양이를 구한다."
     },
     {
      "en": "The little cat cries meow, meow.",
      "ko": "작은 고양이가 야옹, 야옹 하고 운다."
     },
     {
      "en": "The cat stays in the tree all night.",
      "ko": "고양이는 밤새 나무 위에 있다."
     },
     {
      "en": "Trees grow tall in the forest.",
      "ko": "나무는 숲에서 크게 자란다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The cat is stuck, and the children and Dad work together to save it.",
     "ko": "고양이가 내려오지 못했고, 아이들과 아빠가 힘을 합쳐 구해 주었어요."
    }
   },
   "words": [
    {
     "en": "climbs",
     "ko": "올라가다"
    },
    {
     "en": "reach",
     "ko": "닿다"
    },
    {
     "en": "ladder",
     "ko": "사다리"
    }
   ],
   "summary": {
    "ko": "아이들은 도움을 받아 나무 위의 고양이를 구한다.",
    "en": "The children get help and save the cat in the tree.",
    "keywords": [
     "children",
     "save",
     "cat"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-09",
   "genre": "story",
   "title": {
    "en": "Pancakes with Dad",
    "ko": "아빠와 팬케이크 만들기"
   },
   "topic": {
    "en": "Cooking",
    "ko": "요리"
   },
   "bg": {
    "en": "Pancakes are made with eggs, milk, and flour. Cooking can be messy, and that is okay!",
    "ko": "팬케이크는 달걀, 우유, 밀가루로 만들어요. 요리하다 보면 지저분해질 수 있는데, 괜찮아요!"
   },
   "sentences": [
    {
     "en": "On Sunday, Lily and Dad make pancakes.",
     "ko": "일요일에 릴리와 아빠는 팬케이크를 만든다."
    },
    {
     "en": "Lily mixes the eggs, milk, and flour.",
     "ko": "릴리는 달걀, 우유, 밀가루를 섞는다."
    },
    {
     "en": "Oops! She spills flour on the floor.",
     "ko": "앗! 릴리가 바닥에 밀가루를 쏟는다."
    },
    {
     "en": "Now the kitchen is white and messy.",
     "ko": "이제 부엌이 하얗고 지저분하다."
    },
    {
     "en": "Dad laughs and says, \"That's okay!\"",
     "ko": "아빠는 웃으며 말한다. \"괜찮아!\""
    },
    {
     "en": "They clean up together and cook the pancakes.",
     "ko": "둘은 함께 청소하고 팬케이크를 굽는다."
    },
    {
     "en": "The pancakes taste great, and Lily learns that small mistakes are okay.",
     "ko": "팬케이크는 아주 맛있고, 릴리는 작은 실수는 괜찮다는 것을 배운다."
    }
   ],
   "key": 6,
   "keyWhy": {
    "en": "This sentence tells what Lily learns: small mistakes are okay.",
    "ko": "릴리가 배운 점, 즉 '작은 실수는 괜찮다'를 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Cooking with Dad is fun, and small mistakes are okay.",
      "ko": "아빠와 요리하는 것은 즐겁고, 작은 실수는 괜찮다."
     },
     {
      "en": "Lily mixes eggs, milk, and flour.",
      "ko": "릴리는 달걀, 우유, 밀가루를 섞는다."
     },
     {
      "en": "Dad gets very angry about the mess.",
      "ko": "아빠는 지저분해진 것 때문에 몹시 화를 낸다."
     },
     {
      "en": "People eat breakfast every morning.",
      "ko": "사람들은 매일 아침밥을 먹는다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Lily makes a mess, but Dad says it is okay, and they still have fun.",
     "ko": "릴리가 밀가루를 쏟았지만 아빠는 괜찮다고 했고, 둘은 즐겁게 요리했어요."
    }
   },
   "words": [
    {
     "en": "pancakes",
     "ko": "팬케이크"
    },
    {
     "en": "spills",
     "ko": "쏟다, 흘리다"
    },
    {
     "en": "messy",
     "ko": "지저분한"
    }
   ],
   "summary": {
    "ko": "작은 실수는 함께 치우면 괜찮다.",
    "en": "Small mistakes are okay when we clean up together.",
    "keywords": [
     "mistakes",
     "clean",
     "together"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-10",
   "genre": "story",
   "title": {
    "en": "The Lost Mitten",
    "ko": "잃어버린 벙어리장갑"
   },
   "topic": {
    "en": "Winter",
    "ko": "겨울"
   },
   "bg": {
    "en": "Mittens are warm gloves for winter. They keep your hands warm in the snow.",
    "ko": "벙어리장갑은 겨울에 끼는 따뜻한 장갑이에요. 눈 속에서도 손을 따뜻하게 지켜 줘요."
   },
   "sentences": [
    {
     "en": "Sam plays in the snow with his friends.",
     "ko": "샘은 친구들과 눈 속에서 논다."
    },
    {
     "en": "When he goes home, he has only one mitten.",
     "ko": "집에 갈 때 보니, 샘에게 장갑이 한 짝밖에 없다."
    },
    {
     "en": "His hand is cold, and he feels sad.",
     "ko": "샘은 손이 차갑고 슬프다."
    },
    {
     "en": "The next morning, he goes back to look.",
     "ko": "다음 날 아침, 샘은 장갑을 찾으러 다시 간다."
    },
    {
     "en": "He looks under the trees and near the snowman.",
     "ko": "샘은 나무 밑과 눈사람 근처를 찾아본다."
    },
    {
     "en": "At last, he sees something red in the snow.",
     "ko": "마침내 샘은 눈 속에서 빨간 무언가를 발견한다."
    },
    {
     "en": "It is his mitten, and Sam is very happy!",
     "ko": "그것은 샘의 장갑이고, 샘은 아주 기쁘다!"
    }
   ],
   "key": 6,
   "keyWhy": {
    "en": "This sentence shows the ending: Sam finds his lost mitten.",
    "ko": "샘이 잃어버린 장갑을 찾는 이야기의 결말을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Sam looks hard and finds his lost mitten.",
      "ko": "샘은 열심히 찾아서 잃어버린 장갑을 찾는다."
     },
     {
      "en": "There is a snowman near the trees.",
      "ko": "나무 근처에 눈사람이 있다."
     },
     {
      "en": "Sam never finds his mitten.",
      "ko": "샘은 끝내 장갑을 찾지 못한다."
     },
     {
      "en": "Winter is the coldest season of the year.",
      "ko": "겨울은 일 년 중 가장 추운 계절이다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Sam loses a mitten, goes back to look, and finds it in the snow.",
     "ko": "샘은 장갑을 잃어버렸지만, 다시 가서 찾아보고 눈 속에서 발견했어요."
    }
   },
   "words": [
    {
     "en": "snow",
     "ko": "눈"
    },
    {
     "en": "mitten",
     "ko": "벙어리장갑"
    },
    {
     "en": "cold",
     "ko": "차가운, 추운"
    }
   ],
   "summary": {
    "ko": "샘은 열심히 찾아서 잃어버린 장갑을 찾는다.",
    "en": "Sam looks hard and finds his lost mitten.",
    "keywords": [
     "finds",
     "lost",
     "mitten"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-11",
   "genre": "story",
   "title": {
    "en": "Hana's Flower",
    "ko": "하나의 꽃"
   },
   "topic": {
    "en": "Plants",
    "ko": "식물"
   },
   "bg": {
    "en": "A seed needs water, sun, and time to grow. Some plants grow very slowly.",
    "ko": "씨앗이 자라려면 물과 햇빛, 그리고 시간이 필요해요. 어떤 식물은 아주 천천히 자라요."
   },
   "sentences": [
    {
     "en": "Hana plants a little seed in a pot.",
     "ko": "하나는 화분에 작은 씨앗을 심는다."
    },
    {
     "en": "She waters it every day.",
     "ko": "하나는 매일 씨앗에 물을 준다."
    },
    {
     "en": "After one week, nothing happens.",
     "ko": "일주일이 지나도 아무 일도 일어나지 않는다."
    },
    {
     "en": "Hana wants to give up, but Mom says, \"Wait and see.\"",
     "ko": "하나는 포기하고 싶지만, 엄마가 말한다. \"기다려 보렴.\""
    },
    {
     "en": "Hana keeps watering the pot.",
     "ko": "하나는 계속 화분에 물을 준다."
    },
    {
     "en": "One morning, she sees a small green leaf.",
     "ko": "어느 날 아침, 하나는 작은 초록 잎을 발견한다."
    },
    {
     "en": "A few weeks later, a pretty yellow flower opens!",
     "ko": "몇 주 뒤, 예쁜 노란 꽃이 핀다!"
    }
   ],
   "key": 3,
   "keyWhy": {
    "en": "Mom's words give the lesson of the story: be patient and wait.",
    "ko": "엄마의 말이 '참고 기다리자'라는 이야기의 교훈을 알려 줘요."
   },
   "main": {
    "options": [
     {
      "en": "If you wait patiently, a seed can become a flower.",
      "ko": "참을성 있게 기다리면 씨앗이 꽃이 될 수 있다."
     },
     {
      "en": "Hana plants her seed in a pot.",
      "ko": "하나는 화분에 씨앗을 심는다."
     },
     {
      "en": "The seed never grows at all.",
      "ko": "씨앗은 전혀 자라지 않는다."
     },
     {
      "en": "All flowers are yellow and pretty.",
      "ko": "모든 꽃은 노랗고 예쁘다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Hana does not give up. She waits, and her seed grows into a flower.",
     "ko": "하나는 포기하지 않고 기다렸고, 씨앗이 꽃으로 자랐어요."
    }
   },
   "words": [
    {
     "en": "seed",
     "ko": "씨앗"
    },
    {
     "en": "waters",
     "ko": "물을 주다"
    },
    {
     "en": "flower",
     "ko": "꽃"
    }
   ],
   "summary": {
    "ko": "참고 기다리면 작은 씨앗이 꽃으로 자란다.",
    "en": "With patience, a little seed grows into a flower.",
    "keywords": [
     "patience",
     "seed",
     "flower"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-12",
   "genre": "story",
   "title": {
    "en": "Fireflies at Night",
    "ko": "밤의 반딧불이"
   },
   "topic": {
    "en": "Nature",
    "ko": "자연"
   },
   "bg": {
    "en": "Fireflies are small bugs that make light. You can see them on summer nights.",
    "ko": "반딧불이는 빛을 내는 작은 곤충이에요. 여름밤에 볼 수 있어요."
   },
   "sentences": [
    {
     "en": "On a summer night, Tom and Lily go to the field.",
     "ko": "어느 여름밤, 톰과 릴리는 들판에 간다."
    },
    {
     "en": "Little lights fly in the dark.",
     "ko": "작은 불빛들이 어둠 속을 날아다닌다."
    },
    {
     "en": "They are fireflies!",
     "ko": "그것은 반딧불이다!"
    },
    {
     "en": "Tom catches some fireflies in a jar.",
     "ko": "톰은 병에 반딧불이 몇 마리를 잡아 넣는다."
    },
    {
     "en": "The jar glows like a small lamp.",
     "ko": "병이 작은 등불처럼 빛난다."
    },
    {
     "en": "But Lily says, \"They want to be free.\"",
     "ko": "하지만 릴리가 말한다. \"반딧불이들은 자유롭고 싶어 해.\""
    },
    {
     "en": "Tom opens the jar, and the fireflies fly up to the stars.",
     "ko": "톰이 병을 열자, 반딧불이들이 별을 향해 날아오른다."
    }
   ],
   "key": 6,
   "keyWhy": {
    "en": "This sentence shows the ending: Tom lets the fireflies go free.",
    "ko": "톰이 반딧불이를 자유롭게 놓아주는 결말을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Tom and Lily catch fireflies and then let them go.",
      "ko": "톰과 릴리는 반딧불이를 잡았다가 놓아준다."
     },
     {
      "en": "The jar glows like a small lamp.",
      "ko": "병이 작은 등불처럼 빛난다."
     },
     {
      "en": "Tom keeps the fireflies in the jar forever.",
      "ko": "톰은 반딧불이를 병 속에 영원히 가둬 둔다."
     },
     {
      "en": "Summer is a hot season.",
      "ko": "여름은 더운 계절이다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Tom catches fireflies, but Lily reminds him they want to be free, so he lets them go.",
     "ko": "톰이 반딧불이를 잡았지만, 릴리의 말을 듣고 자유롭게 놓아주었어요."
    }
   },
   "words": [
    {
     "en": "fireflies",
     "ko": "반딧불이들"
    },
    {
     "en": "jar",
     "ko": "병, 유리병"
    },
    {
     "en": "free",
     "ko": "자유로운"
    }
   ],
   "summary": {
    "ko": "톰과 릴리는 반딧불이를 잡았다가 자유롭게 놓아준다.",
    "en": "Tom and Lily catch fireflies and let them go free.",
    "keywords": [
     "catch",
     "fireflies",
     "free"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-01",
   "genre": "story",
   "title": {
    "en": "The Ant and the Grasshopper",
    "ko": "개미와 베짱이"
   },
   "topic": {
    "en": "Fables",
    "ko": "우화"
   },
   "bg": {
    "en": "A fable is a short story, often with animals, that teaches a lesson. This one comes from Aesop, a storyteller from ancient Greece.",
    "ko": "우화는 주로 동물이 나와서 교훈을 알려 주는 짧은 이야기예요. 이 이야기는 옛날 그리스의 이야기꾼 이솝이 들려준 이야기예요."
   },
   "sentences": [
    {
     "en": "One hot summer, an ant worked hard every day.",
     "ko": "어느 더운 여름, 개미 한 마리가 날마다 열심히 일했어요."
    },
    {
     "en": "She carried seeds and grain to her home under the ground.",
     "ko": "개미는 씨앗과 곡식을 땅속 집으로 날랐어요."
    },
    {
     "en": "A grasshopper watched her and laughed.",
     "ko": "베짱이 한 마리가 개미를 보고 웃었어요."
    },
    {
     "en": "\"Why do you work so hard?\" he asked. \"Come and sing with me!\"",
     "ko": "\"왜 그렇게 열심히 일하니?\" 베짱이가 물었어요. \"이리 와서 나랑 노래하자!\""
    },
    {
     "en": "\"I am saving food for winter,\" said the ant, and she kept working.",
     "ko": "\"나는 겨울에 먹을 음식을 모으는 중이야.\" 개미는 이렇게 말하고 계속 일했어요."
    },
    {
     "en": "The grasshopper played music and slept in the sun all summer long.",
     "ko": "베짱이는 여름 내내 음악을 연주하고 햇볕 아래에서 잠을 잤어요."
    },
    {
     "en": "Then winter came, and the fields were covered with cold snow.",
     "ko": "그러다 겨울이 왔고, 들판은 차가운 눈으로 덮였어요."
    },
    {
     "en": "The grasshopper was hungry because he had no food at all.",
     "ko": "베짱이는 먹을 것이 하나도 없어서 배가 고팠어요."
    },
    {
     "en": "He knocked on the ant's door and asked for help.",
     "ko": "베짱이는 개미의 집 문을 두드리며 도와 달라고 했어요."
    },
    {
     "en": "The ant shared some food, and the grasshopper learned that it is wise to prepare for the future.",
     "ko": "개미는 음식을 조금 나누어 주었고, 베짱이는 미래를 위해 준비하는 것이 현명하다는 것을 배웠어요."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This last sentence tells the lesson the grasshopper learned: it is wise to prepare for the future.",
    "ko": "마지막 문장이 베짱이가 배운 교훈, 즉 미래를 위해 준비하는 것이 현명하다는 것을 직접 말해 주기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "It is wise to work hard and prepare for the future.",
      "ko": "열심히 일하며 미래를 준비하는 것이 현명하다."
     },
     {
      "en": "The ant carried seeds to her home under the ground.",
      "ko": "개미는 씨앗을 땅속 집으로 날랐다."
     },
     {
      "en": "Playing all summer is the best way to get ready for winter.",
      "ko": "여름 내내 노는 것이 겨울을 준비하는 가장 좋은 방법이다."
     },
     {
      "en": "Many insects live in fields and make different sounds.",
      "ko": "많은 곤충이 들판에 살며 여러 가지 소리를 낸다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The story shows that the ant, who prepared, had food, but the grasshopper, who only played, went hungry.",
     "ko": "준비한 개미는 먹을 것이 있었지만 놀기만 한 베짱이는 굶게 되었다는 것을 통해 미래를 준비하는 것이 중요하다고 말하는 이야기예요."
    }
   },
   "words": [
    {
     "en": "prepare",
     "ko": "준비하다"
    },
    {
     "en": "hungry",
     "ko": "배고픈"
    },
    {
     "en": "shared",
     "ko": "나누어 주었다"
    }
   ],
   "summary": {
    "ko": "미래를 위해 미리 준비하는 것이 현명하다.",
    "en": "It is wise to prepare for the future ahead of time.",
    "keywords": [
     "wise",
     "prepare",
     "future"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-02",
   "genre": "story",
   "title": {
    "en": "The Boy Who Cried Wolf",
    "ko": "양치기 소년"
   },
   "topic": {
    "en": "Fables",
    "ko": "우화"
   },
   "bg": {
    "en": "This is another fable by Aesop. In the old days, shepherds watched sheep on hills and kept them safe from wolves.",
    "ko": "이 이야기도 이솝 우화예요. 옛날에는 양치기가 언덕에서 양을 돌보며 늑대로부터 지켰어요."
   },
   "sentences": [
    {
     "en": "A young boy named Leo watched the sheep on a hill near his village.",
     "ko": "레오라는 어린 소년이 마을 근처 언덕에서 양을 돌보았어요."
    },
    {
     "en": "One day, he felt bored, so he shouted, \"Wolf! Wolf! A wolf is coming!\"",
     "ko": "어느 날 심심해진 레오는 \"늑대다! 늑대! 늑대가 와요!\" 하고 소리쳤어요."
    },
    {
     "en": "The villagers ran up the hill to help, but there was no wolf.",
     "ko": "마을 사람들이 도우려고 언덕으로 달려왔지만, 늑대는 없었어요."
    },
    {
     "en": "Leo laughed at them, and they went home angry.",
     "ko": "레오는 사람들을 보고 웃었고, 사람들은 화가 나서 집으로 돌아갔어요."
    },
    {
     "en": "A few days later, he played the same trick again.",
     "ko": "며칠 뒤, 레오는 또 같은 장난을 쳤어요."
    },
    {
     "en": "Again the villagers came running, and again Leo just laughed.",
     "ko": "마을 사람들은 또 달려왔고, 레오는 또 웃기만 했어요."
    },
    {
     "en": "Then one evening, a real wolf came out of the forest.",
     "ko": "그러던 어느 날 저녁, 진짜 늑대가 숲에서 나타났어요."
    },
    {
     "en": "Leo shouted as loudly as he could, but nobody came this time.",
     "ko": "레오는 있는 힘껏 소리쳤지만, 이번에는 아무도 오지 않았어요."
    },
    {
     "en": "The villagers thought he was lying again, so the wolf chased away many sheep.",
     "ko": "마을 사람들은 레오가 또 거짓말을 한다고 생각했고, 그래서 늑대가 양을 많이 쫓아 버렸어요."
    },
    {
     "en": "Leo learned that when you tell lies, people will not believe you even when you tell the truth.",
     "ko": "레오는 거짓말을 하면 진실을 말할 때조차 사람들이 믿어 주지 않는다는 것을 배웠어요."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence clearly states what Leo learned from his lies.",
    "ko": "레오가 거짓말 때문에 무엇을 배웠는지 분명하게 말해 주는 문장이기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "If you lie, people will not believe you later.",
      "ko": "거짓말을 하면 나중에 사람들이 믿어 주지 않는다."
     },
     {
      "en": "Leo watched the sheep on a hill near his village.",
      "ko": "레오는 마을 근처 언덕에서 양을 돌보았다."
     },
     {
      "en": "Telling lies is a good way to make friends.",
      "ko": "거짓말을 하는 것은 친구를 사귀는 좋은 방법이다."
     },
     {
      "en": "Wolves are dangerous animals that live in forests.",
      "ko": "늑대는 숲에 사는 위험한 동물이다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Because Leo lied twice, nobody believed him when the real wolf came. That is the main message.",
     "ko": "레오가 두 번 거짓말을 해서 진짜 늑대가 왔을 때 아무도 믿지 않았어요. 이것이 이 이야기의 핵심 메시지예요."
    }
   },
   "words": [
    {
     "en": "villagers",
     "ko": "마을 사람들"
    },
    {
     "en": "trick",
     "ko": "장난, 속임수"
    },
    {
     "en": "truth",
     "ko": "진실"
    }
   ],
   "summary": {
    "ko": "거짓말을 하면 진실을 말할 때도 사람들이 믿어 주지 않는다.",
    "en": "If you tell lies, people will not believe your truth.",
    "keywords": [
     "lies",
     "believe",
     "truth"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-03",
   "genre": "story",
   "title": {
    "en": "One Team",
    "ko": "하나의 팀"
   },
   "topic": {
    "en": "Sports and Teamwork",
    "ko": "운동과 협동"
   },
   "bg": {
    "en": "A soccer team has eleven players on the field. To win, players must pass the ball and help each other.",
    "ko": "축구 팀은 경기장에서 열한 명이 함께 뛰어요. 이기려면 서로 공을 패스하고 도와야 해요."
   },
   "sentences": [
    {
     "en": "Mina's soccer team had a big game on Saturday.",
     "ko": "미나의 축구 팀은 토요일에 큰 경기가 있었어요."
    },
    {
     "en": "Every player wanted to score, so nobody passed the ball.",
     "ko": "모든 선수가 골을 넣고 싶어 해서 아무도 공을 패스하지 않았어요."
    },
    {
     "en": "They ran into each other and lost the ball again and again.",
     "ko": "선수들은 서로 부딪히고 계속해서 공을 빼앗겼어요."
    },
    {
     "en": "At the end, the other team won by three goals.",
     "ko": "결국 상대 팀이 세 골 차이로 이겼어요."
    },
    {
     "en": "The players sat on the grass and felt sad and angry.",
     "ko": "선수들은 잔디에 앉아 슬프고 화가 났어요."
    },
    {
     "en": "Coach Park said, \"You played as eleven people, not as one team.\"",
     "ko": "박 코치님이 말했어요. \"너희는 한 팀이 아니라 열한 명의 따로따로인 사람으로 뛰었어.\""
    },
    {
     "en": "The next week, they practiced passing and talking to each other on the field.",
     "ko": "다음 주에 선수들은 경기장에서 패스하는 것과 서로 말하는 것을 연습했어요."
    },
    {
     "en": "Mina learned to look for open friends instead of always kicking the ball herself.",
     "ko": "미나는 항상 자기가 공을 차는 대신 비어 있는 친구를 찾는 법을 배웠어요."
    },
    {
     "en": "In their next game, they passed well and won two to one.",
     "ko": "다음 경기에서 그들은 패스를 잘해서 2대 1로 이겼어요."
    },
    {
     "en": "They understood that working together is more important than being a star.",
     "ko": "그들은 함께 협력하는 것이 혼자 스타가 되는 것보다 더 중요하다는 것을 깨달았어요."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence tells the big lesson the team learned after losing and then winning.",
    "ko": "경기에서 지고 다시 이긴 뒤 팀이 깨달은 가장 큰 교훈을 말해 주는 문장이기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "Working together as a team is more important than being a star.",
      "ko": "팀으로 함께 협력하는 것이 스타가 되는 것보다 더 중요하다."
     },
     {
      "en": "The other team won the first game by three goals.",
      "ko": "상대 팀이 첫 경기에서 세 골 차이로 이겼다."
     },
     {
      "en": "Every player should try to score goals alone.",
      "ko": "모든 선수는 혼자 골을 넣으려고 해야 한다."
     },
     {
      "en": "Soccer is a popular sport all around the world.",
      "ko": "축구는 전 세계에서 인기 있는 운동이다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The team lost when everyone played alone and won when they passed and helped each other.",
     "ko": "모두 혼자 뛰었을 때는 졌고, 서로 패스하고 도왔을 때는 이겼어요. 그래서 협동이 중요하다는 것이 핵심이에요."
    }
   },
   "words": [
    {
     "en": "score",
     "ko": "골을 넣다, 득점하다"
    },
    {
     "en": "practiced",
     "ko": "연습했다"
    },
    {
     "en": "together",
     "ko": "함께"
    }
   ],
   "summary": {
    "ko": "혼자 빛나는 것보다 팀으로 함께 협력하는 것이 더 중요하다.",
    "en": "Working together as a team matters more than playing alone.",
    "keywords": [
     "together",
     "team",
     "alone"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-04",
   "genre": "story",
   "title": {
    "en": "The New Kid",
    "ko": "새로 온 아이"
   },
   "topic": {
    "en": "Friendship",
    "ko": "우정"
   },
   "bg": {
    "en": "Many students change schools when their families move. Clubs are groups where students with the same hobby meet and have fun.",
    "ko": "가족이 이사하면 학교를 옮기는 학생이 많아요. 동아리는 같은 취미를 가진 학생들이 모여 즐겁게 활동하는 모임이에요."
   },
   "sentences": [
    {
     "en": "Last spring, Jiho moved to a new town with his family.",
     "ko": "지난봄, 지호는 가족과 함께 새로운 동네로 이사했어요."
    },
    {
     "en": "He did not know anyone at his new school.",
     "ko": "지호는 새 학교에서 아는 사람이 아무도 없었어요."
    },
    {
     "en": "At lunch, he ate alone and looked out the window.",
     "ko": "점심시간에 지호는 혼자 밥을 먹으며 창밖을 바라보았어요."
    },
    {
     "en": "He missed his old friends and felt very lonely.",
     "ko": "지호는 옛 친구들이 보고 싶었고 아주 외로웠어요."
    },
    {
     "en": "One day, he saw a poster for a drawing club on the wall.",
     "ko": "어느 날, 지호는 벽에 붙은 그림 동아리 포스터를 보았어요."
    },
    {
     "en": "Jiho loved drawing, but he was nervous about joining.",
     "ko": "지호는 그림 그리기를 아주 좋아했지만, 동아리에 들어가는 것이 떨렸어요."
    },
    {
     "en": "His mom said, \"Just try it once. You might like it.\"",
     "ko": "엄마가 말했어요. \"딱 한 번만 해 봐. 좋아하게 될지도 몰라.\""
    },
    {
     "en": "So he went to the club, and a girl named Sora showed him her comic book.",
     "ko": "그래서 지호는 동아리에 갔고, 소라라는 여자아이가 자기가 그린 만화책을 보여 주었어요."
    },
    {
     "en": "They talked about their favorite characters and laughed together.",
     "ko": "두 아이는 좋아하는 캐릭터에 대해 이야기하며 함께 웃었어요."
    },
    {
     "en": "Soon Jiho had many friends, and he learned that trying something new can help you feel at home.",
     "ko": "곧 지호는 친구가 많이 생겼고, 새로운 것에 도전하면 낯선 곳도 편안해질 수 있다는 것을 배웠어요."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence shows how Jiho's problem was solved and what he learned from it.",
    "ko": "지호의 외로움이 어떻게 해결되었고 무엇을 배웠는지 알려 주는 문장이기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "Trying something new can help you make friends in a new place.",
      "ko": "새로운 것에 도전하면 새로운 곳에서 친구를 사귈 수 있다."
     },
     {
      "en": "Jiho saw a poster for a drawing club on the wall.",
      "ko": "지호는 벽에 붙은 그림 동아리 포스터를 보았다."
     },
     {
      "en": "It is better to stay alone when you move to a new town.",
      "ko": "새로운 동네로 이사하면 혼자 지내는 것이 더 낫다."
     },
     {
      "en": "Many families move to different towns every year.",
      "ko": "많은 가족이 해마다 다른 동네로 이사한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Jiho was lonely until he tried the drawing club. Joining it helped him make friends.",
     "ko": "지호는 그림 동아리에 도전하기 전까지 외로웠어요. 동아리에 들어가면서 친구를 사귀게 되었어요."
    }
   },
   "words": [
    {
     "en": "lonely",
     "ko": "외로운"
    },
    {
     "en": "poster",
     "ko": "포스터, 벽보"
    },
    {
     "en": "nervous",
     "ko": "긴장한, 떨리는"
    }
   ],
   "summary": {
    "ko": "새로운 곳에서는 새로운 일에 도전하면 친구를 사귈 수 있다.",
    "en": "In a new place, trying new things can help you make friends.",
    "keywords": [
     "place",
     "trying",
     "friends"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-05",
   "genre": "story",
   "title": {
    "en": "Bolt the Robot Helper",
    "ko": "로봇 도우미 볼트"
   },
   "topic": {
    "en": "Robots and Technology",
    "ko": "로봇과 기술"
   },
   "bg": {
    "en": "Robots follow the instructions that people give them. They do not always understand what people really mean.",
    "ko": "로봇은 사람이 내리는 명령을 따라요. 하지만 사람이 진짜로 뜻하는 것을 항상 이해하지는 못해요."
   },
   "sentences": [
    {
     "en": "Dad bought a robot helper named Bolt to help with the housework.",
     "ko": "아빠가 집안일을 도와줄 볼트라는 로봇 도우미를 샀어요."
    },
    {
     "en": "Bolt did exactly what people told him to do.",
     "ko": "볼트는 사람들이 시키는 대로 정확히 그대로 했어요."
    },
    {
     "en": "One morning, Yuna said, \"Bolt, please wash the dishes.\"",
     "ko": "어느 날 아침, 유나가 말했어요. \"볼트, 설거지 좀 해 줘.\""
    },
    {
     "en": "Bolt washed the dishes, and then he washed the clean ones in the cupboard, too.",
     "ko": "볼트는 설거지를 했고, 그다음에는 찬장에 있던 깨끗한 그릇까지 씻었어요."
    },
    {
     "en": "Later, Yuna said, \"Put the cat outside,\" because it was a sunny day.",
     "ko": "나중에 유나는 날씨가 맑아서 \"고양이를 밖에 내보내 줘.\"라고 말했어요."
    },
    {
     "en": "Bolt put the cat outside, even when it started to rain hard.",
     "ko": "볼트는 고양이를 밖에 내보냈고, 비가 세차게 내리기 시작해도 그대로 두었어요."
    },
    {
     "en": "The poor cat cried at the door, all wet and cold.",
     "ko": "불쌍한 고양이는 흠뻑 젖고 추워서 문 앞에서 울었어요."
    },
    {
     "en": "Yuna laughed and said, \"Bolt, you have to think about what I really mean!\"",
     "ko": "유나는 웃으며 말했어요. \"볼트, 내가 진짜 무슨 뜻으로 말했는지 생각해야지!\""
    },
    {
     "en": "From then on, Yuna gave Bolt clear and careful instructions.",
     "ko": "그때부터 유나는 볼트에게 분명하고 꼼꼼하게 지시했어요."
    },
    {
     "en": "She learned that good instructions must be clear, because words can be understood in different ways.",
     "ko": "유나는 말은 여러 가지로 이해될 수 있으니 좋은 지시는 분명해야 한다는 것을 배웠어요."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence explains the lesson behind all of Bolt's funny mistakes.",
    "ko": "볼트가 저지른 웃긴 실수들 뒤에 숨은 교훈을 설명해 주는 문장이기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "Instructions should be clear because words can mean different things.",
      "ko": "말은 여러 뜻이 될 수 있으므로 지시는 분명해야 한다."
     },
     {
      "en": "Bolt washed the clean dishes in the cupboard, too.",
      "ko": "볼트는 찬장의 깨끗한 그릇까지 씻었다."
     },
     {
      "en": "Robots always understand exactly what people really mean.",
      "ko": "로봇은 사람이 진짜 뜻하는 것을 항상 정확히 이해한다."
     },
     {
      "en": "Machines are changing the way people live today.",
      "ko": "기계는 오늘날 사람들이 사는 방식을 바꾸고 있다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Bolt made mistakes because Yuna's words were not clear, so she learned to give clear instructions.",
     "ko": "유나의 말이 분명하지 않아서 볼트가 실수를 했고, 그래서 유나는 분명하게 지시하는 법을 배웠어요."
    }
   },
   "words": [
    {
     "en": "exactly",
     "ko": "정확히"
    },
    {
     "en": "instructions",
     "ko": "지시, 설명"
    },
    {
     "en": "clear",
     "ko": "분명한"
    }
   ],
   "summary": {
    "ko": "말은 다르게 이해될 수 있으므로 지시는 분명하게 해야 한다.",
    "en": "Instructions must be clear because words can be understood differently.",
    "keywords": [
     "instructions",
     "clear",
     "words"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-06",
   "genre": "story",
   "title": {
    "en": "Lost in the Museum",
    "ko": "박물관에서 길을 잃다"
   },
   "topic": {
    "en": "Safety",
    "ko": "안전"
   },
   "bg": {
    "en": "Museums have staff members who wear uniforms or name tags. If you get lost, they are safe people to ask for help.",
    "ko": "박물관에는 제복이나 이름표를 단 직원들이 있어요. 길을 잃으면 이 직원들에게 도움을 요청하면 안전해요."
   },
   "sentences": [
    {
     "en": "On a school trip, Hana visited a big history museum.",
     "ko": "학교 체험학습 날, 하나는 큰 역사 박물관에 갔어요."
    },
    {
     "en": "She stopped to look at an old golden crown for a long time.",
     "ko": "하나는 오래된 금관을 보려고 멈춰 서서 한참 동안 바라보았어요."
    },
    {
     "en": "When she looked up, her class was gone.",
     "ko": "고개를 들어 보니, 반 친구들이 사라지고 없었어요."
    },
    {
     "en": "Her heart beat fast, and she wanted to cry.",
     "ko": "하나는 심장이 빨리 뛰었고 울고 싶었어요."
    },
    {
     "en": "But she remembered her teacher's words: \"If you get lost, stay calm and ask a staff member.\"",
     "ko": "하지만 하나는 선생님의 말씀을 떠올렸어요. \"길을 잃으면 침착하게 직원에게 물어보세요.\""
    },
    {
     "en": "Hana took a deep breath and looked around.",
     "ko": "하나는 숨을 깊이 들이쉬고 주위를 둘러보았어요."
    },
    {
     "en": "She saw a woman in a blue uniform and said, \"Excuse me, I lost my class.\"",
     "ko": "하나는 파란 제복을 입은 여자를 보고 말했어요. \"실례합니다, 우리 반을 잃어버렸어요.\""
    },
    {
     "en": "The woman smiled and called the teacher on her radio.",
     "ko": "그 여자는 미소를 짓고 무전기로 선생님을 불렀어요."
    },
    {
     "en": "A few minutes later, her teacher came and gave her a big hug.",
     "ko": "몇 분 뒤, 선생님이 와서 하나를 꼭 안아 주었어요."
    },
    {
     "en": "Hana learned that staying calm and asking for help is the best way to solve a problem.",
     "ko": "하나는 침착하게 도움을 요청하는 것이 문제를 해결하는 가장 좋은 방법이라는 것을 배웠어요."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence sums up what Hana did right and what she learned.",
    "ko": "하나가 잘한 행동과 그로부터 배운 점을 한 번에 정리해 주는 문장이기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "Stay calm and ask for help when you get lost.",
      "ko": "길을 잃으면 침착하게 도움을 요청하자."
     },
     {
      "en": "Hana looked at an old golden crown for a long time.",
      "ko": "하나는 오래된 금관을 한참 동안 바라보았다."
     },
     {
      "en": "When you are lost, you should run around and cry.",
      "ko": "길을 잃으면 뛰어다니며 울어야 한다."
     },
     {
      "en": "Museums show many interesting things from the past.",
      "ko": "박물관은 옛날의 흥미로운 물건을 많이 보여 준다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Hana found her class because she stayed calm and asked a staff member for help.",
     "ko": "하나는 침착하게 직원에게 도움을 요청했기 때문에 반 친구들을 다시 찾을 수 있었어요."
    }
   },
   "words": [
    {
     "en": "calm",
     "ko": "침착한"
    },
    {
     "en": "uniform",
     "ko": "제복, 유니폼"
    },
    {
     "en": "breath",
     "ko": "숨, 호흡"
    }
   ],
   "summary": {
    "ko": "길을 잃었을 때는 침착하게 도움을 요청하는 것이 가장 좋다.",
    "en": "When you are lost, stay calm and ask for help.",
    "keywords": [
     "lost",
     "calm",
     "help"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-07",
   "genre": "story",
   "title": {
    "en": "The Volcano That Did Not Erupt",
    "ko": "터지지 않은 화산"
   },
   "topic": {
    "en": "Science",
    "ko": "과학"
   },
   "bg": {
    "en": "When you mix baking soda and vinegar, they make lots of gas bubbles. Many students use this to build a model volcano.",
    "ko": "베이킹소다와 식초를 섞으면 기체 거품이 많이 생겨요. 많은 학생이 이것으로 화산 모형을 만들어요."
   },
   "sentences": [
    {
     "en": "Minho wanted to win the school science fair.",
     "ko": "민호는 학교 과학 대회에서 상을 받고 싶었어요."
    },
    {
     "en": "He decided to build a small volcano that could erupt with bubbles.",
     "ko": "민호는 거품을 뿜어내는 작은 화산을 만들기로 했어요."
    },
    {
     "en": "He mixed baking soda and vinegar, but he did not test it first.",
     "ko": "민호는 베이킹소다와 식초를 섞었지만, 미리 실험해 보지는 않았어요."
    },
    {
     "en": "On the day of the fair, he poured in the vinegar in front of the judges.",
     "ko": "대회 날, 민호는 심사위원들 앞에서 식초를 부었어요."
    },
    {
     "en": "Nothing happened, and only a few tiny bubbles came out.",
     "ko": "아무 일도 일어나지 않았고, 아주 작은 거품 몇 개만 나왔어요."
    },
    {
     "en": "Minho's face turned red, and he wanted to hide.",
     "ko": "민호는 얼굴이 빨개졌고 숨고 싶었어요."
    },
    {
     "en": "At home, he checked his notes and found his mistake.",
     "ko": "집에서 민호는 자기 기록을 확인하다가 실수를 찾아냈어요."
    },
    {
     "en": "He had used too little baking soda, so the reaction was too weak.",
     "ko": "베이킹소다를 너무 적게 넣어서 반응이 너무 약했던 거예요."
    },
    {
     "en": "He tried again with more baking soda, and this time the volcano bubbled over.",
     "ko": "베이킹소다를 더 넣어 다시 해 보니, 이번에는 화산에서 거품이 넘쳐흘렀어요."
    },
    {
     "en": "Minho learned that mistakes are not failures but chances to learn and do better.",
     "ko": "민호는 실수는 실패가 아니라 배우고 더 잘할 수 있는 기회라는 것을 배웠어요."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence tells the message of the story: a mistake can help you learn.",
    "ko": "실수가 배움의 기회가 될 수 있다는 이야기의 메시지를 직접 말해 주는 문장이기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "Mistakes can teach us how to do better next time.",
      "ko": "실수는 다음에 더 잘하는 방법을 알려 줄 수 있다."
     },
     {
      "en": "Minho mixed baking soda and vinegar for his volcano.",
      "ko": "민호는 화산을 만들려고 베이킹소다와 식초를 섞었다."
     },
     {
      "en": "If your project fails once, you should give up science.",
      "ko": "프로젝트가 한 번 실패하면 과학을 포기해야 한다."
     },
     {
      "en": "Science fairs are held at many schools every year.",
      "ko": "과학 대회는 해마다 많은 학교에서 열린다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Minho's volcano failed, but he found his mistake and made it work. The story is about learning from mistakes.",
     "ko": "민호의 화산은 실패했지만, 실수를 찾아 고쳐서 성공했어요. 실수에서 배우는 것에 대한 이야기예요."
    }
   },
   "words": [
    {
     "en": "volcano",
     "ko": "화산"
    },
    {
     "en": "mistake",
     "ko": "실수"
    },
    {
     "en": "judges",
     "ko": "심사위원들"
    }
   ],
   "summary": {
    "ko": "실수는 실패가 아니라 배우고 더 나아질 수 있는 기회이다.",
    "en": "Mistakes are not failures but chances to learn and improve.",
    "keywords": [
     "mistakes",
     "failures",
     "chances"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-08",
   "genre": "story",
   "title": {
    "en": "Grandpa's Old Camera",
    "ko": "할아버지의 오래된 카메라"
   },
   "topic": {
    "en": "Family",
    "ko": "가족"
   },
   "bg": {
    "en": "Long ago, cameras used film. People had to wait for the film to be printed before they could see their photos.",
    "ko": "옛날 카메라는 필름을 사용했어요. 사람들은 필름을 사진으로 뽑을 때까지 기다려야 사진을 볼 수 있었어요."
   },
   "sentences": [
    {
     "en": "One rainy day, Ara found an old camera in Grandpa's closet.",
     "ko": "비 오는 어느 날, 아라는 할아버지의 벽장에서 오래된 카메라를 찾았어요."
    },
    {
     "en": "\"That is my film camera,\" Grandpa said with a smile.",
     "ko": "\"그건 내 필름 카메라란다.\" 할아버지가 웃으며 말했어요."
    },
    {
     "en": "\"You cannot see the pictures right away, so every photo was special.\"",
     "ko": "\"사진을 바로 볼 수 없어서 한 장 한 장이 다 특별했지.\""
    },
    {
     "en": "He took out a heavy box full of old photo albums.",
     "ko": "할아버지는 오래된 사진 앨범이 가득 든 무거운 상자를 꺼냈어요."
    },
    {
     "en": "Inside, Ara saw Grandma as a young woman and her dad as a baby.",
     "ko": "그 안에서 아라는 젊은 시절의 할머니와 아기였던 아빠를 보았어요."
    },
    {
     "en": "There was a picture of the whole family at the beach many years ago.",
     "ko": "오래전 바닷가에서 찍은 온 가족의 사진도 있었어요."
    },
    {
     "en": "Grandpa told her a story about each photo, and they laughed together for hours.",
     "ko": "할아버지는 사진마다 이야기를 들려주었고, 둘은 몇 시간 동안 함께 웃었어요."
    },
    {
     "en": "Ara asked Grandpa to teach her how to use the film camera.",
     "ko": "아라는 할아버지께 필름 카메라 쓰는 법을 가르쳐 달라고 했어요."
    },
    {
     "en": "The next weekend, she took pictures of the family having dinner together.",
     "ko": "다음 주말, 아라는 가족이 함께 저녁을 먹는 모습을 사진으로 찍었어요."
    },
    {
     "en": "She understood that photos keep our family memories alive and bring us closer.",
     "ko": "아라는 사진이 가족의 추억을 살아 있게 해 주고 우리를 더 가깝게 만들어 준다는 것을 알게 되었어요."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence tells what Ara understood about photos and family.",
    "ko": "아라가 사진과 가족에 대해 깨달은 점을 말해 주는 문장이기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "Old photos keep family memories alive and bring people closer.",
      "ko": "오래된 사진은 가족의 추억을 간직하고 사람들을 더 가깝게 만든다."
     },
     {
      "en": "Ara found an old camera in Grandpa's closet.",
      "ko": "아라는 할아버지의 벽장에서 오래된 카메라를 찾았다."
     },
     {
      "en": "Old photos are boring and not worth keeping.",
      "ko": "오래된 사진은 지루하고 간직할 가치가 없다."
     },
     {
      "en": "Cameras have changed a lot over many years.",
      "ko": "카메라는 오랜 세월 동안 많이 바뀌었다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Looking at the photos helped Ara and Grandpa share memories and feel close.",
     "ko": "사진을 보면서 아라와 할아버지는 추억을 나누고 더 가까워졌어요."
    }
   },
   "words": [
    {
     "en": "closet",
     "ko": "벽장"
    },
    {
     "en": "memories",
     "ko": "추억"
    },
    {
     "en": "albums",
     "ko": "앨범"
    }
   ],
   "summary": {
    "ko": "사진은 가족의 추억을 간직하게 해 주고 가족을 더 가깝게 만든다.",
    "en": "Photos keep family memories alive and bring families closer.",
    "keywords": [
     "photos",
     "memories",
     "closer"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-09",
   "genre": "story",
   "title": {
    "en": "The Honest Woodcutter",
    "ko": "금도끼 은도끼"
   },
   "topic": {
    "en": "Folktales",
    "ko": "전래 동화"
   },
   "bg": {
    "en": "This old folktale is told in many countries, including Korea. In the Korean version, a mountain spirit tests the woodcutter.",
    "ko": "이 옛이야기는 한국을 비롯한 여러 나라에 전해져요. 한국 이야기에서는 산신령이 나무꾼을 시험해요."
   },
   "sentences": [
    {
     "en": "A poor woodcutter was cutting a tree beside a deep river.",
     "ko": "가난한 나무꾼이 깊은 강가에서 나무를 베고 있었어요."
    },
    {
     "en": "Suddenly, his old iron axe slipped and fell into the water.",
     "ko": "갑자기 낡은 쇠도끼가 미끄러져 물속으로 빠졌어요."
    },
    {
     "en": "He sat down and cried because it was the only axe he had.",
     "ko": "그것이 하나뿐인 도끼여서 나무꾼은 주저앉아 울었어요."
    },
    {
     "en": "A mountain spirit came out of the river holding a golden axe.",
     "ko": "산신령이 금도끼를 들고 강에서 나타났어요."
    },
    {
     "en": "\"Is this your axe?\" the spirit asked.",
     "ko": "\"이 도끼가 네 도끼냐?\" 산신령이 물었어요."
    },
    {
     "en": "\"No, it is not,\" the woodcutter answered honestly.",
     "ko": "\"아니요, 제 것이 아닙니다.\" 나무꾼은 정직하게 대답했어요."
    },
    {
     "en": "The spirit showed him a silver axe, but he said no again.",
     "ko": "산신령이 은도끼를 보여 주었지만, 나무꾼은 또 아니라고 했어요."
    },
    {
     "en": "At last, the spirit brought out the old iron axe, and the woodcutter smiled.",
     "ko": "마침내 산신령이 낡은 쇠도끼를 꺼내자, 나무꾼은 미소를 지었어요."
    },
    {
     "en": "\"Yes, that one is mine!\" he said.",
     "ko": "\"네, 그게 제 도끼예요!\" 나무꾼이 말했어요."
    },
    {
     "en": "The spirit was so pleased with his honesty that he gave him all three axes.",
     "ko": "산신령은 나무꾼의 정직함이 아주 마음에 들어서 도끼 세 개를 모두 주었어요."
    },
    {
     "en": "The story teaches us that honesty is always the best choice.",
     "ko": "이 이야기는 정직함이 언제나 가장 좋은 선택이라는 것을 가르쳐 줘요."
    }
   ],
   "key": 10,
   "keyWhy": {
    "en": "The last sentence directly tells the lesson of the whole story.",
    "ko": "마지막 문장이 이야기 전체의 교훈을 직접 말해 주기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "Being honest is always the best choice.",
      "ko": "정직한 것이 언제나 가장 좋은 선택이다."
     },
     {
      "en": "The woodcutter's old iron axe fell into the river.",
      "ko": "나무꾼의 낡은 쇠도끼가 강에 빠졌다."
     },
     {
      "en": "Lying can help you get more gold and silver.",
      "ko": "거짓말을 하면 금과 은을 더 얻을 수 있다."
     },
     {
      "en": "Rivers and mountains are full of beautiful places.",
      "ko": "강과 산에는 아름다운 곳이 가득하다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The woodcutter told the truth and got a big reward, so the story is about honesty.",
     "ko": "나무꾼은 진실을 말해서 큰 상을 받았어요. 그래서 이 이야기는 정직함에 대한 이야기예요."
    }
   },
   "words": [
    {
     "en": "honesty",
     "ko": "정직함"
    },
    {
     "en": "axe",
     "ko": "도끼"
    },
    {
     "en": "spirit",
     "ko": "신령, 정령"
    }
   ],
   "summary": {
    "ko": "정직함은 언제나 가장 좋은 선택이다.",
    "en": "Being honest is always the best choice you can make.",
    "keywords": [
     "honest",
     "best",
     "choice"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-10",
   "genre": "story",
   "title": {
    "en": "Stone Soup",
    "ko": "돌멩이 수프"
   },
   "topic": {
    "en": "Folktales",
    "ko": "전래 동화"
   },
   "bg": {
    "en": "Stone Soup is an old European folktale. It has been told for hundreds of years to show the power of sharing.",
    "ko": "돌멩이 수프는 유럽의 오래된 옛이야기예요. 나눔의 힘을 보여 주려고 수백 년 동안 전해져 왔어요."
   },
   "sentences": [
    {
     "en": "A tired traveler came to a small village with an empty pot.",
     "ko": "지친 나그네가 빈 냄비를 들고 작은 마을에 왔어요."
    },
    {
     "en": "He was hungry, but the villagers said they had no food to share.",
     "ko": "나그네는 배가 고팠지만, 마을 사람들은 나눌 음식이 없다고 했어요."
    },
    {
     "en": "So he filled his pot with water and put a smooth stone inside.",
     "ko": "그래서 나그네는 냄비에 물을 채우고 매끈한 돌멩이 하나를 넣었어요."
    },
    {
     "en": "\"I am making stone soup,\" he said. \"It is delicious, but a carrot would make it better.\"",
     "ko": "\"돌멩이 수프를 만들고 있어요.\" 나그네가 말했어요. \"아주 맛있지만, 당근이 있으면 더 좋을 텐데요.\""
    },
    {
     "en": "A curious woman brought a carrot from her garden.",
     "ko": "궁금해진 한 아주머니가 텃밭에서 당근을 가져왔어요."
    },
    {
     "en": "Then a farmer added some potatoes, and a boy brought onions.",
     "ko": "그러자 한 농부가 감자를 넣었고, 한 소년은 양파를 가져왔어요."
    },
    {
     "en": "Soon, everyone in the village put something into the pot.",
     "ko": "곧 마을 사람 모두가 냄비에 무언가를 넣었어요."
    },
    {
     "en": "The soup smelled wonderful, and the whole village sat down to eat together.",
     "ko": "수프는 냄새가 아주 좋았고, 온 마을 사람들이 함께 앉아 먹었어요."
    },
    {
     "en": "Nobody had much alone, but together they made a big feast.",
     "ko": "혼자서는 가진 것이 별로 없었지만, 함께 모이니 큰 잔치가 되었어요."
    },
    {
     "en": "They learned that when everyone shares a little, there is enough for all.",
     "ko": "사람들은 모두가 조금씩 나누면 모두에게 충분하다는 것을 배웠어요."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence explains why a pot of water became a feast: everyone shared.",
    "ko": "물 한 냄비가 어떻게 잔치가 되었는지, 즉 모두가 나누었기 때문이라는 것을 설명해 주는 문장이기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "When everyone shares a little, there is enough for all.",
      "ko": "모두가 조금씩 나누면 모두에게 충분하다."
     },
     {
      "en": "A woman brought a carrot from her garden.",
      "ko": "한 아주머니가 텃밭에서 당근을 가져왔다."
     },
     {
      "en": "It is better to keep your food to yourself.",
      "ko": "음식은 혼자 갖고 있는 것이 더 낫다."
     },
     {
      "en": "Soup is a popular food in many countries.",
      "ko": "수프는 여러 나라에서 인기 있는 음식이다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Each person added a little food, and together they made a feast for the whole village.",
     "ko": "사람들이 저마다 음식을 조금씩 넣어서 온 마을이 먹을 잔치를 함께 만들었어요."
    }
   },
   "words": [
    {
     "en": "traveler",
     "ko": "나그네, 여행자"
    },
    {
     "en": "curious",
     "ko": "궁금한, 호기심 많은"
    },
    {
     "en": "feast",
     "ko": "잔치, 진수성찬"
    }
   ],
   "summary": {
    "ko": "모두가 조금씩 나누면 모두가 먹을 만큼 충분한 음식이 생긴다.",
    "en": "When everyone shares a little, there is enough food for all.",
    "keywords": [
     "everyone",
     "shares",
     "enough"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-11",
   "genre": "story",
   "title": {
    "en": "The Turtle on the Beach",
    "ko": "바닷가의 거북"
   },
   "topic": {
    "en": "Environment",
    "ko": "환경"
   },
   "bg": {
    "en": "Every year, lots of plastic trash goes into the ocean. Sea turtles can get caught in it or eat it by mistake.",
    "ko": "해마다 많은 플라스틱 쓰레기가 바다로 흘러가요. 바다거북은 그 쓰레기에 걸리거나 실수로 먹기도 해요."
   },
   "sentences": [
    {
     "en": "On a sunny morning, Jisu walked along the beach with her dad.",
     "ko": "맑은 아침, 지수는 아빠와 함께 바닷가를 걸었어요."
    },
    {
     "en": "Near the rocks, she saw a small sea turtle that was not moving well.",
     "ko": "바위 근처에서 지수는 잘 움직이지 못하는 작은 바다거북을 보았어요."
    },
    {
     "en": "Its legs were tangled in an old plastic bag and a fishing net.",
     "ko": "거북의 다리가 낡은 비닐봉지와 낚시 그물에 얽혀 있었어요."
    },
    {
     "en": "\"Dad, we have to help it!\" Jisu cried.",
     "ko": "\"아빠, 우리가 도와줘야 해요!\" 지수가 외쳤어요."
    },
    {
     "en": "Her dad carefully held the turtle while Jisu gently cut the plastic away with small scissors.",
     "ko": "아빠가 거북을 조심스럽게 잡고 있는 동안, 지수는 작은 가위로 플라스틱을 살살 잘라 냈어요."
    },
    {
     "en": "When it was free, the turtle slowly crawled back into the waves.",
     "ko": "자유로워진 거북은 천천히 기어서 파도 속으로 돌아갔어요."
    },
    {
     "en": "Jisu looked around and saw bottles, cups, and bags everywhere on the sand.",
     "ko": "지수가 주위를 둘러보니 모래 위 곳곳에 병, 컵, 봉지가 널려 있었어요."
    },
    {
     "en": "\"This trash can hurt so many animals,\" she said sadly.",
     "ko": "\"이 쓰레기가 정말 많은 동물을 다치게 할 수 있어요.\" 지수가 슬프게 말했어요."
    },
    {
     "en": "That afternoon, she and her dad picked up three bags of trash.",
     "ko": "그날 오후, 지수와 아빠는 쓰레기를 세 봉지나 주웠어요."
    },
    {
     "en": "Jisu learned that small actions, like picking up plastic, can protect sea animals.",
     "ko": "지수는 플라스틱을 줍는 것 같은 작은 행동이 바다 동물을 지킬 수 있다는 것을 배웠어요."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence tells the message: even small actions can help sea animals.",
    "ko": "작은 행동으로도 바다 동물을 도울 수 있다는 메시지를 말해 주는 문장이기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "Small actions like picking up plastic can protect sea animals.",
      "ko": "플라스틱 줍기 같은 작은 행동이 바다 동물을 지킬 수 있다."
     },
     {
      "en": "Jisu walked along the beach with her dad.",
      "ko": "지수는 아빠와 함께 바닷가를 걸었다."
     },
     {
      "en": "Plastic trash on the beach does not hurt anyone.",
      "ko": "바닷가의 플라스틱 쓰레기는 아무도 다치게 하지 않는다."
     },
     {
      "en": "The ocean is very big and very deep.",
      "ko": "바다는 아주 넓고 아주 깊다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Jisu saved a turtle from plastic and then cleaned the beach to protect other animals.",
     "ko": "지수는 플라스틱에 걸린 거북을 구하고, 다른 동물들을 지키려고 바닷가를 청소했어요."
    }
   },
   "words": [
    {
     "en": "tangled",
     "ko": "얽힌, 엉킨"
    },
    {
     "en": "plastic",
     "ko": "플라스틱"
    },
    {
     "en": "protect",
     "ko": "보호하다, 지키다"
    }
   ],
   "summary": {
    "ko": "작은 행동으로도 바다 동물을 플라스틱 쓰레기로부터 지킬 수 있다.",
    "en": "Even small actions can protect sea animals from plastic trash.",
    "keywords": [
     "actions",
     "protect",
     "plastic"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-12",
   "genre": "story",
   "title": {
    "en": "Juno's Song",
    "ko": "주노의 노래"
   },
   "topic": {
    "en": "Courage",
    "ko": "용기"
   },
   "bg": {
    "en": "Many people feel nervous before they perform on a stage. This feeling is called stage fright, and it is very normal.",
    "ko": "많은 사람이 무대에 서기 전에 긴장해요. 이런 느낌을 무대 공포증이라고 하는데, 아주 자연스러운 일이에요."
   },
   "sentences": [
    {
     "en": "Juno was a shy boy who loved to sing alone in his room.",
     "ko": "주노는 자기 방에서 혼자 노래하는 것을 좋아하는 수줍은 아이였어요."
    },
    {
     "en": "His teacher heard him one day and asked him to sing at the school concert.",
     "ko": "어느 날 선생님이 주노의 노래를 듣고 학교 음악회에서 노래해 달라고 했어요."
    },
    {
     "en": "Juno's hands shook, and he said, \"I can't. Everyone will look at me.\"",
     "ko": "주노는 손을 떨며 말했어요. \"못 하겠어요. 모두가 저를 쳐다볼 거예요.\""
    },
    {
     "en": "But his teacher said, \"Your voice is beautiful. Let's practice together.\"",
     "ko": "하지만 선생님이 말했어요. \"네 목소리는 정말 아름다워. 같이 연습해 보자.\""
    },
    {
     "en": "Every day after school, Juno practiced his song a little more.",
     "ko": "주노는 날마다 방과 후에 노래를 조금씩 더 연습했어요."
    },
    {
     "en": "On the night of the concert, his legs felt weak behind the curtain.",
     "ko": "음악회 날 밤, 무대 커튼 뒤에서 주노는 다리에 힘이 빠지는 것 같았어요."
    },
    {
     "en": "He saw his family smiling in the front row and took a deep breath.",
     "ko": "주노는 맨 앞줄에서 웃고 있는 가족을 보고 숨을 깊이 들이쉬었어요."
    },
    {
     "en": "Then he began to sing, quietly at first and then more strongly.",
     "ko": "그리고 노래를 시작했어요. 처음에는 조용히, 그다음에는 더 힘차게요."
    },
    {
     "en": "When the song ended, the whole room clapped and cheered.",
     "ko": "노래가 끝나자, 모든 사람이 손뼉을 치며 환호했어요."
    },
    {
     "en": "Juno learned that courage means doing something even when you feel scared.",
     "ko": "주노는 용기란 무서울 때에도 무언가를 해내는 것이라는 것을 배웠어요."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence explains what Juno learned about courage after singing.",
    "ko": "노래를 부른 뒤 주노가 용기에 대해 무엇을 배웠는지 설명해 주는 문장이기 때문이에요."
   },
   "main": {
    "options": [
     {
      "en": "Courage means doing something brave even when you feel scared.",
      "ko": "용기란 무서울 때에도 용감하게 해내는 것이다."
     },
     {
      "en": "Juno's family sat in the front row at the concert.",
      "ko": "주노의 가족은 음악회에서 맨 앞줄에 앉았다."
     },
     {
      "en": "Shy people should never try to sing in front of others.",
      "ko": "수줍은 사람은 절대 다른 사람 앞에서 노래하면 안 된다."
     },
     {
      "en": "Music is an important subject at many schools.",
      "ko": "음악은 많은 학교에서 중요한 과목이다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Juno was scared, but he practiced and sang anyway. The story is about having courage.",
     "ko": "주노는 무서웠지만 연습하고 결국 노래를 불렀어요. 용기에 대한 이야기예요."
    }
   },
   "words": [
    {
     "en": "concert",
     "ko": "음악회, 공연"
    },
    {
     "en": "courage",
     "ko": "용기"
    },
    {
     "en": "curtain",
     "ko": "커튼, 막"
    }
   ],
   "summary": {
    "ko": "용기란 무서울 때에도 무언가를 해내는 것이다.",
    "en": "Courage means doing something even when you feel scared.",
    "keywords": [
     "courage",
     "doing",
     "scared"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-01",
   "genre": "info",
   "title": {
    "en": "Why Leaves Change Color",
    "ko": "나뭇잎은 왜 색이 변할까?"
   },
   "topic": {
    "en": "Science",
    "ko": "과학"
   },
   "bg": {
    "en": "The red color in some leaves comes from materials called anthocyanins, which are also found in fruits like blueberries and red grapes.",
    "ko": "일부 나뭇잎의 붉은색은 안토시아닌이라는 물질에서 나오는데, 이 물질은 블루베리나 적포도 같은 과일에도 들어 있다."
   },
   "sentences": [
    {
     "en": "In autumn, many trees turn bright red, orange, and yellow.",
     "ko": "가을이 되면 많은 나무가 밝은 빨간색, 주황색, 노란색으로 변한다."
    },
    {
     "en": "These colors appear because trees stop making chlorophyll, the green material in their leaves.",
     "ko": "이런 색깔이 나타나는 것은 나무가 잎 속의 초록색 물질인 엽록소를 더 이상 만들지 않기 때문이다."
    },
    {
     "en": "During spring and summer, chlorophyll helps leaves use sunlight to make food for the tree.",
     "ko": "봄과 여름 동안 엽록소는 잎이 햇빛을 이용해 나무의 양분을 만들도록 돕는다."
    },
    {
     "en": "There is so much chlorophyll that it covers up all the other colors.",
     "ko": "엽록소가 아주 많아서 다른 색깔들을 모두 가려 버린다."
    },
    {
     "en": "However, leaves also contain yellow and orange materials all year long.",
     "ko": "하지만 잎에는 일 년 내내 노란색과 주황색 물질도 들어 있다."
    },
    {
     "en": "When days get shorter and cooler, the tree slowly stops making chlorophyll.",
     "ko": "낮이 짧아지고 날씨가 서늘해지면 나무는 천천히 엽록소 만들기를 멈춘다."
    },
    {
     "en": "As the green color breaks down, the hidden yellow and orange colors finally show.",
     "ko": "초록색이 분해되면서 숨어 있던 노란색과 주황색이 마침내 드러난다."
    },
    {
     "en": "Some trees, like maples, also make new red colors in autumn.",
     "ko": "단풍나무 같은 일부 나무는 가을에 새로운 붉은 색깔을 만들기도 한다."
    },
    {
     "en": "Soon after, the leaves dry up and fall to the ground.",
     "ko": "곧이어 잎은 말라서 땅으로 떨어진다."
    },
    {
     "en": "So the beautiful colors of autumn are a sign that trees are getting ready for winter.",
     "ko": "그러므로 가을의 아름다운 색깔은 나무가 겨울을 준비하고 있다는 신호이다."
    }
   ],
   "key": 1,
   "keyWhy": {
    "en": "This sentence gives the main reason leaves change color, and the other sentences explain this reason step by step.",
    "ko": "이 문장은 잎의 색이 변하는 핵심 이유를 말하고, 나머지 문장들은 그 이유를 단계별로 설명하기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "Leaves change color because trees stop making green chlorophyll in autumn.",
      "ko": "가을에 나무가 초록색 엽록소를 만들지 않아서 잎의 색이 변한다."
     },
     {
      "en": "Maple trees make new red colors in their leaves.",
      "ko": "단풍나무는 잎에서 새로운 붉은 색깔을 만든다."
     },
     {
      "en": "Trees make more chlorophyll in autumn, so their leaves turn green.",
      "ko": "나무는 가을에 엽록소를 더 많이 만들어서 잎이 초록색이 된다."
     },
     {
      "en": "Trees are important plants that change in many ways through the year.",
      "ko": "나무는 일 년 동안 여러 방식으로 변하는 중요한 식물이다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The whole text explains how less chlorophyll lets hidden colors appear. The maple fact is only a detail, the third option is the opposite of the text, and the last one is too general.",
     "ko": "글 전체가 엽록소가 줄어들면서 숨은 색이 드러나는 과정을 설명한다. 단풍나무 이야기는 세부 내용일 뿐이고, 세 번째는 글과 반대이며, 마지막은 너무 일반적이다."
    }
   },
   "words": [
    {
     "en": "chlorophyll",
     "ko": "엽록소"
    },
    {
     "en": "contain",
     "ko": "포함하다, 들어 있다"
    },
    {
     "en": "material",
     "ko": "물질"
    }
   ],
   "summary": {
    "ko": "가을에 나무가 엽록소를 만들지 않으면 잎에 숨어 있던 색깔이 드러난다.",
    "en": "In autumn, trees stop making chlorophyll, so the hidden leaf colors appear.",
    "keywords": [
     "autumn",
     "chlorophyll",
     "colors"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-02",
   "genre": "info",
   "title": {
    "en": "Honeybees and Flowers",
    "ko": "꿀벌과 꽃"
   },
   "topic": {
    "en": "Nature",
    "ko": "자연"
   },
   "bg": {
    "en": "A honeybee colony can have tens of thousands of bees, but usually only one queen lays all the eggs.",
    "ko": "꿀벌 한 무리에는 수만 마리의 벌이 있을 수 있지만, 보통 여왕벌 한 마리만이 모든 알을 낳는다."
   },
   "sentences": [
    {
     "en": "Honeybees are busy insects, and they play a big role in nature.",
     "ko": "꿀벌은 부지런한 곤충이며, 자연에서 큰 역할을 한다."
    },
    {
     "en": "They help many plants make seeds and fruit by carrying pollen from one flower to another.",
     "ko": "꿀벌은 꽃가루를 이 꽃에서 저 꽃으로 옮겨 많은 식물이 씨앗과 열매를 맺도록 돕는다."
    },
    {
     "en": "Pollen is a fine, yellow powder that flowers make.",
     "ko": "꽃가루는 꽃이 만드는 고운 노란 가루이다."
    },
    {
     "en": "When a bee visits a flower to drink sweet nectar, pollen sticks to the tiny hairs on its body.",
     "ko": "벌이 달콤한 꿀을 마시러 꽃에 들르면, 꽃가루가 벌의 몸에 난 작은 털에 달라붙는다."
    },
    {
     "en": "Then the bee flies to another flower of the same kind.",
     "ko": "그다음 벌은 같은 종류의 다른 꽃으로 날아간다."
    },
    {
     "en": "Some of the pollen falls off and lands on the new flower.",
     "ko": "꽃가루 일부가 떨어져 새로운 꽃에 내려앉는다."
    },
    {
     "en": "This process is called pollination, and it allows the plant to make seeds.",
     "ko": "이 과정을 꽃가루받이(수분)라고 하며, 이것 덕분에 식물이 씨앗을 만들 수 있다."
    },
    {
     "en": "Farmers depend on bees to pollinate crops such as apples and almonds.",
     "ko": "농부들은 사과나 아몬드 같은 작물의 꽃가루받이를 벌에게 의존한다."
    },
    {
     "en": "Without bees, there would be much less fruit and fewer flowers in the world.",
     "ko": "벌이 없다면 세상에 과일과 꽃이 훨씬 적어질 것이다."
    },
    {
     "en": "That is why protecting honeybees is important for both nature and people.",
     "ko": "그래서 꿀벌을 보호하는 것은 자연과 사람 모두에게 중요하다."
    }
   ],
   "key": 1,
   "keyWhy": {
    "en": "This sentence states how honeybees help plants, and the rest of the text explains this process in detail.",
    "ko": "이 문장은 꿀벌이 식물을 어떻게 돕는지 말하고, 나머지 글은 그 과정을 자세히 설명하기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "Honeybees help plants make seeds and fruit by carrying pollen.",
      "ko": "꿀벌은 꽃가루를 옮겨 식물이 씨앗과 열매를 맺도록 돕는다."
     },
     {
      "en": "Pollen sticks to the tiny hairs on a bee's body.",
      "ko": "꽃가루는 벌의 몸에 난 작은 털에 달라붙는다."
     },
     {
      "en": "Honeybees take pollen away, so plants cannot make any seeds.",
      "ko": "꿀벌이 꽃가루를 가져가 버려서 식물은 씨앗을 전혀 만들 수 없다."
     },
     {
      "en": "Insects live in many different places all around the world.",
      "ko": "곤충은 전 세계의 다양한 곳에 산다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text is about how bees carry pollen so plants can make seeds. Pollen on bee hairs is only one step, the third option says the opposite, and the last one is too broad.",
     "ko": "이 글은 벌이 꽃가루를 옮겨 식물이 씨앗을 만들게 하는 내용이다. 벌의 털에 꽃가루가 붙는 것은 한 단계일 뿐이고, 세 번째는 반대 내용이며, 마지막은 너무 넓다."
    }
   },
   "words": [
    {
     "en": "pollen",
     "ko": "꽃가루"
    },
    {
     "en": "process",
     "ko": "과정"
    },
    {
     "en": "depend",
     "ko": "의존하다"
    }
   ],
   "summary": {
    "ko": "꿀벌은 꽃가루를 옮겨 식물이 씨앗과 열매를 맺도록 돕는다.",
    "en": "Honeybees carry pollen between flowers and help plants make seeds and fruit.",
    "keywords": [
     "pollen",
     "seeds",
     "fruit"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-03",
   "genre": "info",
   "title": {
    "en": "How Volcanoes Form",
    "ko": "화산은 어떻게 만들어질까?"
   },
   "topic": {
    "en": "Science",
    "ko": "과학"
   },
   "bg": {
    "en": "Many of the world's volcanoes are found around the edge of the Pacific Ocean, an area often called the Ring of Fire.",
    "ko": "세계의 많은 화산은 태평양 가장자리를 따라 있는데, 이 지역은 흔히 '불의 고리'라고 불린다."
   },
   "sentences": [
    {
     "en": "A volcano is an opening in the Earth's surface where hot melted rock comes out.",
     "ko": "화산은 뜨겁게 녹은 암석이 밖으로 나오는 지구 표면의 구멍이다."
    },
    {
     "en": "Volcanoes form when melted rock from deep underground pushes its way up to the surface.",
     "ko": "화산은 땅속 깊은 곳의 녹은 암석이 표면까지 밀고 올라올 때 만들어진다."
    },
    {
     "en": "Deep inside the Earth, it is so hot that some rock melts.",
     "ko": "지구 속 깊은 곳은 너무 뜨거워서 일부 암석이 녹는다."
    },
    {
     "en": "This melted rock is called magma.",
     "ko": "이렇게 녹은 암석을 마그마라고 한다."
    },
    {
     "en": "Because magma is lighter than the solid rock around it, it slowly rises.",
     "ko": "마그마는 주변의 단단한 암석보다 가볍기 때문에 천천히 위로 올라온다."
    },
    {
     "en": "It often collects in a large space under the ground called a magma chamber.",
     "ko": "마그마는 종종 땅 밑의 마그마 방이라는 큰 공간에 모인다."
    },
    {
     "en": "When the pressure becomes too strong, the magma bursts out through cracks in the surface.",
     "ko": "압력이 너무 강해지면 마그마가 표면의 갈라진 틈을 통해 터져 나온다."
    },
    {
     "en": "Once magma reaches the surface, people call it lava.",
     "ko": "마그마가 표면에 도달하면 사람들은 그것을 용암이라고 부른다."
    },
    {
     "en": "After many eruptions, layers of cooled lava and ash build up and form a mountain.",
     "ko": "여러 번 분출한 뒤에는 식은 용암과 화산재의 층이 쌓여 산이 된다."
    },
    {
     "en": "In this way, a volcano grows slowly over a very long time.",
     "ko": "이렇게 화산은 아주 오랜 시간에 걸쳐 천천히 자란다."
    }
   ],
   "key": 1,
   "keyWhy": {
    "en": "This sentence explains how volcanoes form, and the other sentences describe each step of this process.",
    "ko": "이 문장은 화산이 만들어지는 방법을 말하고, 다른 문장들은 그 과정의 각 단계를 설명하기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "Volcanoes form when magma rises from deep inside the Earth.",
      "ko": "화산은 마그마가 지구 깊은 곳에서 올라올 때 만들어진다."
     },
     {
      "en": "Magma is called lava after it reaches the surface.",
      "ko": "마그마는 표면에 도달한 뒤 용암이라고 불린다."
     },
     {
      "en": "Volcanoes form when cold rock sinks deep under the ground.",
      "ko": "화산은 차가운 암석이 땅속 깊이 가라앉을 때 만들어진다."
     },
     {
      "en": "The Earth has many interesting mountains, rivers, and oceans.",
      "ko": "지구에는 흥미로운 산, 강, 바다가 많다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text shows how rising magma builds a volcano. The lava fact is just one detail, the third option is the opposite of the text, and the last one is too general.",
     "ko": "글은 올라오는 마그마가 화산을 만드는 과정을 보여 준다. 용암 이야기는 세부 내용 하나이고, 세 번째는 글과 반대이며, 마지막은 너무 일반적이다."
    }
   },
   "words": [
    {
     "en": "surface",
     "ko": "표면"
    },
    {
     "en": "pressure",
     "ko": "압력"
    },
    {
     "en": "layers",
     "ko": "층"
    }
   ],
   "summary": {
    "ko": "화산은 땅속 깊은 곳의 마그마가 지표로 올라와 쌓이면서 만들어진다.",
    "en": "Volcanoes form when magma rises from deep underground and builds up on the surface.",
    "keywords": [
     "Volcanoes",
     "magma",
     "surface"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-04",
   "genre": "info",
   "title": {
    "en": "The Water Cycle",
    "ko": "물의 순환"
   },
   "topic": {
    "en": "Science",
    "ko": "과학"
   },
   "bg": {
    "en": "Plants also add water to the air by releasing water vapor through tiny holes in their leaves.",
    "ko": "식물도 잎에 있는 작은 구멍을 통해 수증기를 내보내 공기 중에 물을 더한다."
   },
   "sentences": [
    {
     "en": "The water on Earth is always moving in a never-ending journey called the water cycle.",
     "ko": "지구의 물은 물의 순환이라고 불리는 끝없는 여행을 하며 늘 움직이고 있다."
    },
    {
     "en": "First, the sun heats water in oceans, lakes, and rivers.",
     "ko": "먼저 태양이 바다, 호수, 강의 물을 데운다."
    },
    {
     "en": "The warm water turns into an invisible gas called water vapor and rises into the air.",
     "ko": "따뜻해진 물은 수증기라는 눈에 보이지 않는 기체로 변해 공기 중으로 올라간다."
    },
    {
     "en": "This step is called evaporation.",
     "ko": "이 단계를 증발이라고 한다."
    },
    {
     "en": "High in the sky, the air is cool, so the water vapor turns back into tiny drops of water.",
     "ko": "하늘 높은 곳은 공기가 차가워서 수증기가 다시 작은 물방울로 변한다."
    },
    {
     "en": "These drops gather together and form clouds, and this step is called condensation.",
     "ko": "이 물방울들이 모여 구름을 만드는데, 이 단계를 응결이라고 한다."
    },
    {
     "en": "When the drops become too big and heavy, they fall as rain or snow.",
     "ko": "물방울이 너무 크고 무거워지면 비나 눈이 되어 떨어진다."
    },
    {
     "en": "This is called precipitation.",
     "ko": "이것을 강수라고 한다."
    },
    {
     "en": "The water then flows into rivers and oceans or soaks into the ground.",
     "ko": "그 후 물은 강과 바다로 흘러가거나 땅속으로 스며든다."
    },
    {
     "en": "Then the cycle starts all over again, so the same water is used again and again.",
     "ko": "그리고 순환이 다시 처음부터 시작되므로, 같은 물이 계속해서 다시 쓰인다."
    }
   ],
   "key": 0,
   "keyWhy": {
    "en": "The first sentence introduces the water cycle, and the rest of the text explains each step of the cycle.",
    "ko": "첫 문장이 물의 순환을 소개하고, 나머지 글은 순환의 각 단계를 설명하기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "Water keeps moving between the ground and the sky in a cycle.",
      "ko": "물은 순환하며 땅과 하늘 사이를 계속 움직인다."
     },
     {
      "en": "Clouds form when tiny drops of water gather together in the sky.",
      "ko": "구름은 하늘에서 작은 물방울들이 모일 때 생긴다."
     },
     {
      "en": "Water on Earth is used only once and then disappears forever.",
      "ko": "지구의 물은 한 번만 쓰이고 영원히 사라진다."
     },
     {
      "en": "Water is very important for all living things on our planet.",
      "ko": "물은 지구의 모든 생물에게 매우 중요하다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text describes how water moves around and around. Cloud forming is only one step, the third option is the opposite of the text, and the last one is true but not what the text explains.",
     "ko": "글은 물이 계속 돌고 도는 과정을 설명한다. 구름이 생기는 것은 한 단계일 뿐이고, 세 번째는 글과 반대이며, 마지막은 맞는 말이지만 글이 설명하는 내용이 아니다."
    }
   },
   "words": [
    {
     "en": "evaporation",
     "ko": "증발"
    },
    {
     "en": "condensation",
     "ko": "응결"
    },
    {
     "en": "precipitation",
     "ko": "강수"
    }
   ],
   "summary": {
    "ko": "물은 증발, 응결, 강수를 거치며 지구에서 끊임없이 순환한다.",
    "en": "Water on Earth moves in a cycle through evaporation, condensation, and precipitation.",
    "keywords": [
     "cycle",
     "evaporation",
     "precipitation"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-05",
   "genre": "info",
   "title": {
    "en": "King Sejong and Hangul",
    "ko": "세종대왕과 한글"
   },
   "topic": {
    "en": "History",
    "ko": "역사"
   },
   "bg": {
    "en": "Every year on October 9, Koreans celebrate Hangul Day to remember the creation of their alphabet.",
    "ko": "해마다 10월 9일, 한국인들은 한글의 창제를 기념하기 위해 한글날을 기린다."
   },
   "sentences": [
    {
     "en": "Today, Koreans read and write with Hangul, but this alphabet did not always exist.",
     "ko": "오늘날 한국인은 한글로 읽고 쓰지만, 이 문자가 늘 있었던 것은 아니다."
    },
    {
     "en": "It was created by King Sejong the Great to help ordinary people read and write.",
     "ko": "한글은 평범한 백성들이 읽고 쓸 수 있도록 돕기 위해 세종대왕이 만들었다."
    },
    {
     "en": "Before Hangul, Koreans used Chinese characters to write.",
     "ko": "한글 이전에 한국인은 한자를 사용해 글을 썼다."
    },
    {
     "en": "Chinese characters were very hard to learn, so most common people could not read or write.",
     "ko": "한자는 배우기가 매우 어려워서 대부분의 평민들은 읽거나 쓸 수 없었다."
    },
    {
     "en": "King Sejong felt sorry for them and wanted to make an easy writing system.",
     "ko": "세종대왕은 그들을 안타깝게 여겨 쉬운 문자 체계를 만들고 싶어 했다."
    },
    {
     "en": "He finished the new letters in 1443 and shared them with the people in 1446.",
     "ko": "그는 1443년에 새 글자를 완성했고 1446년에 백성들에게 널리 알렸다."
    },
    {
     "en": "The new alphabet was first called Hunminjeongeum, which means the correct sounds for teaching the people.",
     "ko": "새 문자는 처음에 훈민정음이라고 불렸는데, 이는 백성을 가르치는 바른 소리라는 뜻이다."
    },
    {
     "en": "Some consonants were designed to look like the shape of the mouth and tongue when making sounds.",
     "ko": "일부 자음은 소리를 낼 때의 입과 혀 모양을 본떠 만들어졌다."
    },
    {
     "en": "Because Hangul is simple and logical, many people can learn it in a short time.",
     "ko": "한글은 간단하고 논리적이어서 많은 사람이 짧은 시간에 배울 수 있다."
    },
    {
     "en": "Thanks to King Sejong, reading and writing became possible for many more people.",
     "ko": "세종대왕 덕분에 훨씬 더 많은 사람이 읽고 쓸 수 있게 되었다."
    }
   ],
   "key": 1,
   "keyWhy": {
    "en": "This sentence tells who created Hangul and why, which is the main idea of the whole text.",
    "ko": "이 문장은 누가 왜 한글을 만들었는지 알려 주는데, 이것이 글 전체의 중심 생각이기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "King Sejong created Hangul so that ordinary people could read easily.",
      "ko": "세종대왕은 평범한 백성이 쉽게 읽을 수 있도록 한글을 만들었다."
     },
     {
      "en": "Some Hangul letters look like the shape of the mouth.",
      "ko": "일부 한글 글자는 입 모양을 닮았다."
     },
     {
      "en": "King Sejong made Hangul because Chinese characters were too easy.",
      "ko": "세종대왕은 한자가 너무 쉬워서 한글을 만들었다."
     },
     {
      "en": "Many kings in history did important things for their countries.",
      "ko": "역사 속 많은 왕들은 나라를 위해 중요한 일을 했다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains why and how King Sejong made Hangul for the people. The mouth shape is a small detail, the third option is the opposite of the text, and the last one is too broad.",
     "ko": "글은 세종대왕이 백성을 위해 한글을 만든 이유와 과정을 설명한다. 입 모양은 작은 세부 내용이고, 세 번째는 글과 반대이며, 마지막은 너무 넓다."
    }
   },
   "words": [
    {
     "en": "alphabet",
     "ko": "문자, 알파벳"
    },
    {
     "en": "ordinary",
     "ko": "평범한"
    },
    {
     "en": "system",
     "ko": "체계"
    }
   ],
   "summary": {
    "ko": "세종대왕은 백성들이 쉽게 글을 읽고 쓸 수 있도록 한글을 만들었다.",
    "en": "King Sejong created Hangul so that ordinary people could easily read and write.",
    "keywords": [
     "Sejong",
     "Hangul",
     "ordinary"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-06",
   "genre": "info",
   "title": {
    "en": "Sleep and Your Brain",
    "ko": "잠과 뇌"
   },
   "topic": {
    "en": "Health",
    "ko": "건강"
   },
   "bg": {
    "en": "During one stage of sleep called REM sleep, the eyes move quickly under the eyelids, and most vivid dreams happen.",
    "ko": "렘수면이라는 수면 단계에서는 눈이 눈꺼풀 아래에서 빠르게 움직이고, 생생한 꿈은 대부분 이때 꾼다."
   },
   "sentences": [
    {
     "en": "Sleep may seem like a time when nothing happens, but your brain is very busy at night.",
     "ko": "잠은 아무 일도 일어나지 않는 시간처럼 보일 수 있지만, 밤에 뇌는 매우 바쁘다."
    },
    {
     "en": "Getting enough sleep is important because it helps your brain work well.",
     "ko": "충분히 자는 것은 뇌가 잘 작동하도록 돕기 때문에 중요하다."
    },
    {
     "en": "While you sleep, your brain sorts through what you learned during the day.",
     "ko": "잠자는 동안 뇌는 낮에 배운 것들을 정리한다."
    },
    {
     "en": "It stores important information as memories, so you can remember it later.",
     "ko": "뇌는 중요한 정보를 기억으로 저장해서 나중에 떠올릴 수 있게 한다."
    },
    {
     "en": "Sleep also gives the brain a chance to clean out waste that builds up while you are awake.",
     "ko": "잠은 또한 깨어 있는 동안 쌓인 노폐물을 뇌가 청소할 기회를 준다."
    },
    {
     "en": "When people do not get enough sleep, they often have trouble paying attention.",
     "ko": "사람들은 잠이 부족하면 집중하는 데 어려움을 겪는 경우가 많다."
    },
    {
     "en": "They may also feel grumpy and make more mistakes.",
     "ko": "또한 짜증이 나고 실수를 더 많이 할 수도 있다."
    },
    {
     "en": "Experts say that children and teenagers need more sleep than adults.",
     "ko": "전문가들은 어린이와 청소년이 어른보다 잠이 더 많이 필요하다고 말한다."
    },
    {
     "en": "Going to bed at the same time every night and putting away phones before bed can help.",
     "ko": "매일 밤 같은 시간에 잠자리에 들고 자기 전에 휴대폰을 치우는 것이 도움이 될 수 있다."
    },
    {
     "en": "Good sleep is not lazy; it is one of the best ways to keep your brain healthy.",
     "ko": "잘 자는 것은 게으른 것이 아니라, 뇌를 건강하게 지키는 가장 좋은 방법 중 하나이다."
    }
   ],
   "key": 1,
   "keyWhy": {
    "en": "This sentence states why sleep matters, and the other sentences give examples of what sleep does for the brain.",
    "ko": "이 문장은 잠이 왜 중요한지 말하고, 다른 문장들은 잠이 뇌에 해 주는 일의 예를 들기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "Sleep is important because it helps the brain learn and stay healthy.",
      "ko": "잠은 뇌가 배우고 건강을 유지하도록 돕기 때문에 중요하다."
     },
     {
      "en": "Putting away phones before bed can help people sleep better.",
      "ko": "자기 전에 휴대폰을 치우면 더 잘 잘 수 있다."
     },
     {
      "en": "The brain stops working completely while a person is sleeping.",
      "ko": "사람이 자는 동안 뇌는 완전히 활동을 멈춘다."
     },
     {
      "en": "There are many ways to have a healthy body and mind.",
      "ko": "건강한 몸과 마음을 가지는 방법은 많다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains how sleep helps the brain. The phone tip is only a detail, the third option is the opposite of the text, and the last one is too general.",
     "ko": "글은 잠이 뇌를 어떻게 돕는지 설명한다. 휴대폰 이야기는 세부 내용일 뿐이고, 세 번째는 글과 반대이며, 마지막은 너무 일반적이다."
    }
   },
   "words": [
    {
     "en": "information",
     "ko": "정보"
    },
    {
     "en": "memories",
     "ko": "기억"
    },
    {
     "en": "attention",
     "ko": "주의, 집중"
    }
   ],
   "summary": {
    "ko": "잠은 뇌가 기억을 저장하고 노폐물을 청소하도록 도와서 중요하다.",
    "en": "Sleep is important because it helps the brain store memories and clean out waste.",
    "keywords": [
     "Sleep",
     "brain",
     "memories"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-07",
   "genre": "info",
   "title": {
    "en": "Recycling Plastic",
    "ko": "플라스틱 재활용"
   },
   "topic": {
    "en": "Environment",
    "ko": "환경"
   },
   "bg": {
    "en": "Many plastic items have a small number inside a triangle of arrows that shows what type of plastic they are made of.",
    "ko": "많은 플라스틱 제품에는 화살표 삼각형 안에 작은 숫자가 있는데, 이 숫자는 어떤 종류의 플라스틱으로 만들어졌는지 알려 준다."
   },
   "sentences": [
    {
     "en": "Recycling plastic sounds simple, but it is actually a long and difficult process.",
     "ko": "플라스틱 재활용은 간단해 보이지만, 실제로는 길고 어려운 과정이다."
    },
    {
     "en": "First, used plastic is collected and taken to a recycling center.",
     "ko": "먼저 사용한 플라스틱을 모아 재활용 센터로 가져간다."
    },
    {
     "en": "There, workers and machines sort the plastic into different types.",
     "ko": "그곳에서 작업자와 기계가 플라스틱을 여러 종류로 분류한다."
    },
    {
     "en": "Next, the plastic is washed, cut into small pieces, and melted.",
     "ko": "다음으로 플라스틱을 씻고, 작은 조각으로 자른 뒤 녹인다."
    },
    {
     "en": "The melted plastic can then be made into new products, such as bottles or clothing.",
     "ko": "녹인 플라스틱은 병이나 옷 같은 새로운 제품으로 만들어질 수 있다."
    },
    {
     "en": "However, there are many types of plastic, and most of them cannot be mixed together.",
     "ko": "하지만 플라스틱은 종류가 많고, 대부분은 서로 섞을 수 없다."
    },
    {
     "en": "Plastic that is dirty with food or stuck to other materials is also hard to recycle.",
     "ko": "음식물로 더러워졌거나 다른 재료와 붙어 있는 플라스틱도 재활용하기 어렵다."
    },
    {
     "en": "In addition, plastic often becomes weaker each time it is recycled.",
     "ko": "게다가 플라스틱은 재활용될 때마다 약해지는 경우가 많다."
    },
    {
     "en": "Because of these problems, only a small part of all plastic is actually recycled.",
     "ko": "이런 문제들 때문에 전체 플라스틱 중 실제로 재활용되는 것은 일부에 불과하다."
    },
    {
     "en": "That is why using less plastic is just as important as recycling it.",
     "ko": "그래서 플라스틱을 덜 쓰는 것이 재활용하는 것만큼 중요하다."
    }
   ],
   "key": 0,
   "keyWhy": {
    "en": "The first sentence tells us that recycling plastic is a difficult process, and the text then explains the steps and the problems.",
    "ko": "첫 문장이 플라스틱 재활용이 어려운 과정이라고 말하고, 이어지는 글이 그 단계와 문제점을 설명하기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "Plastic is recycled in several steps, but the process has many problems.",
      "ko": "플라스틱은 여러 단계를 거쳐 재활용되지만, 그 과정에는 문제가 많다."
     },
     {
      "en": "Melted plastic can be made into new bottles or clothing.",
      "ko": "녹인 플라스틱은 새 병이나 옷으로 만들 수 있다."
     },
     {
      "en": "All plastic is easy to recycle and can be recycled forever.",
      "ko": "모든 플라스틱은 재활용하기 쉽고 영원히 재활용할 수 있다."
     },
     {
      "en": "People should take good care of the environment every day.",
      "ko": "사람들은 매일 환경을 잘 보살펴야 한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains both how plastic is recycled and why it is hard. New products are only one detail, the third option is the opposite of the text, and the last one is too broad.",
     "ko": "글은 플라스틱이 재활용되는 방법과 그것이 어려운 이유를 모두 설명한다. 새 제품 이야기는 세부 내용이고, 세 번째는 글과 반대이며, 마지막은 너무 넓다."
    }
   },
   "words": [
    {
     "en": "process",
     "ko": "과정"
    },
    {
     "en": "sort",
     "ko": "분류하다"
    },
    {
     "en": "products",
     "ko": "제품"
    }
   ],
   "summary": {
    "ko": "플라스틱은 분류, 세척, 녹이기를 거쳐 재활용되지만 여러 문제 때문에 어렵다.",
    "en": "Plastic is recycled through sorting, washing, and melting, but many problems make it difficult.",
    "keywords": [
     "Plastic",
     "recycled",
     "difficult"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-08",
   "genre": "info",
   "title": {
    "en": "How Penguins Stay Warm",
    "ko": "펭귄은 어떻게 따뜻하게 지낼까?"
   },
   "topic": {
    "en": "Nature",
    "ko": "자연"
   },
   "bg": {
    "en": "Not all penguins live in icy places; the Galapagos penguin lives near the equator.",
    "ko": "모든 펭귄이 얼음으로 덮인 곳에 사는 것은 아니다. 갈라파고스펭귄은 적도 근처에 산다."
   },
   "sentences": [
    {
     "en": "Many penguins live in very cold places, such as Antarctica, yet they stay warm.",
     "ko": "많은 펭귄이 남극 같은 아주 추운 곳에 살지만, 따뜻하게 지낸다."
    },
    {
     "en": "They can survive the cold because their bodies have several special features.",
     "ko": "펭귄은 몸에 몇 가지 특별한 특징이 있어서 추위를 견딜 수 있다."
    },
    {
     "en": "First, penguins have a thick layer of fat under their skin.",
     "ko": "첫째, 펭귄은 피부 아래에 두꺼운 지방층이 있다."
    },
    {
     "en": "This fat keeps body heat inside like a warm blanket.",
     "ko": "이 지방은 따뜻한 담요처럼 체온을 안에 가두어 준다."
    },
    {
     "en": "Second, they have many short feathers that overlap tightly, like tiles on a roof.",
     "ko": "둘째, 펭귄은 지붕의 기와처럼 촘촘하게 겹쳐진 짧은 깃털이 많다."
    },
    {
     "en": "The feathers are covered with oil, which keeps cold water away from the skin.",
     "ko": "깃털은 기름으로 덮여 있어서 차가운 물이 피부에 닿지 않게 해 준다."
    },
    {
     "en": "Special blood vessels in their legs also help their feet lose very little heat.",
     "ko": "다리에 있는 특별한 혈관도 발에서 열이 아주 조금만 빠져나가도록 돕는다."
    },
    {
     "en": "In addition, emperor penguins huddle together in large groups during storms.",
     "ko": "게다가 황제펭귄은 폭풍이 불 때 큰 무리를 지어 서로 바짝 붙어 모인다."
    },
    {
     "en": "They take turns standing in the warm middle and the cold outside of the group.",
     "ko": "그들은 무리의 따뜻한 가운데와 추운 바깥쪽에 번갈아 가며 선다."
    },
    {
     "en": "With fat, feathers, and teamwork, penguins are well prepared for the cold.",
     "ko": "지방, 깃털, 협동 덕분에 펭귄은 추위에 잘 대비되어 있다."
    }
   ],
   "key": 1,
   "keyWhy": {
    "en": "This sentence says penguins survive the cold because of special features, and the rest of the text describes each feature.",
    "ko": "이 문장은 펭귄이 특별한 특징 덕분에 추위를 견딘다고 말하고, 나머지 글은 각 특징을 설명하기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "Penguins stay warm in the cold through fat, feathers, and teamwork.",
      "ko": "펭귄은 지방, 깃털, 협동으로 추위 속에서 따뜻하게 지낸다."
     },
     {
      "en": "Emperor penguins huddle together in large groups during storms.",
      "ko": "황제펭귄은 폭풍이 불 때 큰 무리를 지어 모인다."
     },
     {
      "en": "Penguins have thin skin and no fat, so they feel cold.",
      "ko": "펭귄은 피부가 얇고 지방이 없어서 추위를 느낀다."
     },
     {
      "en": "Many animals live in different places all over the world.",
      "ko": "많은 동물이 전 세계 여러 곳에 산다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text lists the ways penguins keep warm. Huddling is only one of these ways, the third option is the opposite of the text, and the last one is too general.",
     "ko": "글은 펭귄이 따뜻함을 유지하는 여러 방법을 나열한다. 모여 있기는 그중 하나일 뿐이고, 세 번째는 글과 반대이며, 마지막은 너무 일반적이다."
    }
   },
   "words": [
    {
     "en": "survive",
     "ko": "살아남다, 견디다"
    },
    {
     "en": "features",
     "ko": "특징"
    },
    {
     "en": "layer",
     "ko": "층"
    }
   ],
   "summary": {
    "ko": "펭귄은 두꺼운 지방, 촘촘한 깃털, 서로 모이는 행동으로 추위를 이겨낸다.",
    "en": "Penguins survive the cold with thick fat, tight feathers, and huddling together.",
    "keywords": [
     "Penguins",
     "fat",
     "feathers"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-09",
   "genre": "info",
   "title": {
    "en": "The First Airplane Flight",
    "ko": "최초의 비행기 비행"
   },
   "topic": {
    "en": "History",
    "ko": "역사"
   },
   "bg": {
    "en": "A small piece of cloth from the original Flyer was carried to the Moon by the Apollo 11 astronauts in 1969.",
    "ko": "원래 플라이어호의 작은 천 조각이 1969년 아폴로 11호 우주 비행사들에 의해 달까지 옮겨졌다."
   },
   "sentences": [
    {
     "en": "On December 17, 1903, two brothers changed the history of travel.",
     "ko": "1903년 12월 17일, 두 형제가 여행의 역사를 바꾸었다."
    },
    {
     "en": "Orville and Wilbur Wright made the first successful powered airplane flight.",
     "ko": "오빌 라이트와 윌버 라이트는 최초로 동력 비행기 비행에 성공했다."
    },
    {
     "en": "The brothers owned a bicycle shop in Ohio, and they loved to build machines.",
     "ko": "형제는 오하이오주에서 자전거 가게를 운영했고, 기계 만드는 것을 좋아했다."
    },
    {
     "en": "They studied how birds fly and tested many gliders for several years.",
     "ko": "그들은 새가 나는 방법을 연구하고 몇 년 동안 여러 글라이더를 시험했다."
    },
    {
     "en": "They also built a small wind tunnel to test the shapes of wings.",
     "ko": "또한 날개 모양을 시험하기 위해 작은 풍동(바람 터널)도 만들었다."
    },
    {
     "en": "Finally, they built an airplane with an engine and called it the Flyer.",
     "ko": "마침내 그들은 엔진이 달린 비행기를 만들고 플라이어호라고 이름 붙였다."
    },
    {
     "en": "Their first flight took place near Kitty Hawk, North Carolina.",
     "ko": "그들의 첫 비행은 노스캐롤라이나주 키티호크 근처에서 이루어졌다."
    },
    {
     "en": "Orville flew the plane for only about 12 seconds and traveled about 37 meters.",
     "ko": "오빌은 겨우 약 12초 동안 비행기를 몰아 약 37미터를 날았다."
    },
    {
     "en": "That day, they made four flights, and the longest one lasted almost one minute.",
     "ko": "그날 그들은 네 번 비행했고, 가장 긴 비행은 거의 1분 동안 계속되었다."
    },
    {
     "en": "Their success showed the world that people could really fly.",
     "ko": "그들의 성공은 사람이 정말로 날 수 있다는 것을 세상에 보여 주었다."
    }
   ],
   "key": 1,
   "keyWhy": {
    "en": "This sentence states the main event of the text, and the other sentences explain how the brothers prepared and what happened.",
    "ko": "이 문장은 글의 중심 사건을 말하고, 다른 문장들은 형제가 어떻게 준비했고 무슨 일이 있었는지 설명하기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "The Wright brothers made the first successful powered airplane flight in 1903.",
      "ko": "라이트 형제는 1903년에 최초로 동력 비행기 비행에 성공했다."
     },
     {
      "en": "The Wright brothers owned a bicycle shop in Ohio.",
      "ko": "라이트 형제는 오하이오주에서 자전거 가게를 운영했다."
     },
     {
      "en": "The Wright brothers' first airplane flight lasted for several hours.",
      "ko": "라이트 형제의 첫 비행은 몇 시간 동안 계속되었다."
     },
     {
      "en": "People have always wanted to travel to new places.",
      "ko": "사람들은 늘 새로운 곳으로 여행하고 싶어 했다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text is about the Wright brothers' first flight. The bicycle shop is only a detail, the third option is the opposite of the text because the flight was very short, and the last one is too broad.",
     "ko": "글은 라이트 형제의 첫 비행에 관한 것이다. 자전거 가게는 세부 내용이고, 첫 비행은 아주 짧았으므로 세 번째는 글과 반대이며, 마지막은 너무 넓다."
    }
   },
   "words": [
    {
     "en": "engine",
     "ko": "엔진"
    },
    {
     "en": "tested",
     "ko": "시험했다"
    },
    {
     "en": "success",
     "ko": "성공"
    }
   ],
   "summary": {
    "ko": "라이트 형제는 오랜 연구 끝에 1903년 최초로 동력 비행기 비행에 성공했다.",
    "en": "After years of testing, the Wright brothers made the first powered airplane flight in 1903.",
    "keywords": [
     "Wright",
     "airplane",
     "flight"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-10",
   "genre": "info",
   "title": {
    "en": "The Ancient Olympic Games",
    "ko": "고대 올림픽"
   },
   "topic": {
    "en": "History",
    "ko": "역사"
   },
   "bg": {
    "en": "The marathon race was not part of the ancient games; it was first held at the modern Olympics in 1896.",
    "ko": "마라톤 경주는 고대 올림픽 종목이 아니었으며, 1896년 근대 올림픽에서 처음 열렸다."
   },
   "sentences": [
    {
     "en": "The first Olympic Games were held in ancient Greece almost 3,000 years ago as a festival for the god Zeus.",
     "ko": "최초의 올림픽 경기는 거의 3,000년 전 고대 그리스에서 제우스 신을 위한 축제로 열렸다."
    },
    {
     "en": "The games took place every four years in a place called Olympia.",
     "ko": "경기는 4년마다 올림피아라는 곳에서 열렸다."
    },
    {
     "en": "At first, there was only one event, a short running race.",
     "ko": "처음에는 짧은 달리기 경주 하나뿐이었다."
    },
    {
     "en": "Later, other events were added, such as wrestling, boxing, jumping, and chariot racing.",
     "ko": "나중에 레슬링, 권투, 멀리뛰기, 전차 경주 같은 다른 종목들이 추가되었다."
    },
    {
     "en": "Only free Greek men and boys could compete in the games.",
     "ko": "자유민인 그리스 남자와 소년만 경기에 참가할 수 있었다."
    },
    {
     "en": "Married women were not even allowed to watch.",
     "ko": "결혼한 여성은 경기를 구경하는 것조차 허락되지 않았다."
    },
    {
     "en": "Winners did not receive gold medals; instead, they got a crown made of olive leaves.",
     "ko": "우승자는 금메달을 받지 않았고, 대신 올리브 잎으로 만든 관을 받았다."
    },
    {
     "en": "During the games, a special peace agreement allowed athletes and visitors to travel safely.",
     "ko": "경기 기간에는 특별한 평화 협정 덕분에 선수와 방문객이 안전하게 여행할 수 있었다."
    },
    {
     "en": "The ancient games ended more than 1,500 years ago.",
     "ko": "고대 올림픽은 1,500여 년 전에 끝났다."
    },
    {
     "en": "The modern Olympics, which started in 1896, follow this old tradition.",
     "ko": "1896년에 시작된 근대 올림픽은 이 오래된 전통을 이어 가고 있다."
    }
   ],
   "key": 0,
   "keyWhy": {
    "en": "The first sentence tells what the ancient Olympic Games were, and the rest of the text gives facts about them.",
    "ko": "첫 문장이 고대 올림픽이 무엇이었는지 말하고, 나머지 글은 그에 관한 사실들을 알려 주기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "The ancient Olympic Games were a sports festival in Greece for Zeus.",
      "ko": "고대 올림픽은 그리스에서 제우스를 위해 열린 운동 경기 축제였다."
     },
     {
      "en": "Winners in ancient Greece received a crown made of olive leaves.",
      "ko": "고대 그리스의 우승자는 올리브 잎으로 만든 관을 받았다."
     },
     {
      "en": "The ancient Olympic Games were held every year in Rome.",
      "ko": "고대 올림픽은 로마에서 매년 열렸다."
     },
     {
      "en": "Sports are a popular way for people to have fun.",
      "ko": "스포츠는 사람들이 즐거움을 얻는 인기 있는 방법이다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text describes the ancient Olympic Games in Greece. The olive crown is only a detail, the third option is wrong about the place and time, and the last one is too general.",
     "ko": "글은 그리스의 고대 올림픽을 설명한다. 올리브 관은 세부 내용이고, 세 번째는 장소와 시기가 글과 다르며, 마지막은 너무 일반적이다."
    }
   },
   "words": [
    {
     "en": "ancient",
     "ko": "고대의"
    },
    {
     "en": "compete",
     "ko": "경쟁하다, 참가하다"
    },
    {
     "en": "tradition",
     "ko": "전통"
    }
   ],
   "summary": {
    "ko": "고대 올림픽은 약 3,000년 전 그리스에서 제우스를 위해 열린 운동 경기 축제였다.",
    "en": "The ancient Olympic Games were a Greek sports festival held for the god Zeus.",
    "keywords": [
     "ancient",
     "Greek",
     "festival"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-11",
   "genre": "info",
   "title": {
    "en": "The Changing Moon",
    "ko": "모양이 바뀌는 달"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "The moon always shows the same side to the Earth, so people need spacecraft to see its far side.",
    "ko": "달은 항상 지구에 같은 면만 보여 주기 때문에, 사람들은 우주선이 있어야 달의 뒷면을 볼 수 있다."
   },
   "sentences": [
    {
     "en": "The moon seems to change shape during the month, but its shape never really changes.",
     "ko": "달은 한 달 동안 모양이 바뀌는 것처럼 보이지만, 실제로 모양이 바뀌지는 않는다."
    },
    {
     "en": "These different shapes, called phases, depend on how much of the moon's sunlit side we can see.",
     "ko": "위상이라고 불리는 이 다양한 모양은 햇빛을 받는 달의 면을 우리가 얼마나 볼 수 있는지에 따라 달라진다."
    },
    {
     "en": "The moon does not make its own light.",
     "ko": "달은 스스로 빛을 내지 않는다."
    },
    {
     "en": "Instead, it shines because it reflects light from the sun.",
     "ko": "대신 태양의 빛을 반사하기 때문에 빛난다."
    },
    {
     "en": "The sun always lights up half of the moon.",
     "ko": "언제나 태양은 달의 절반을 비춘다."
    },
    {
     "en": "As the moon travels around the Earth, we see that bright half from different angles.",
     "ko": "달이 지구 주위를 돌면서 우리는 그 밝은 절반을 여러 각도에서 보게 된다."
    },
    {
     "en": "When the moon is between the Earth and the sun, we cannot see its bright side, so we call it a new moon.",
     "ko": "달이 지구와 태양 사이에 있을 때는 밝은 면을 볼 수 없는데, 이것을 삭(신월)이라고 한다."
    },
    {
     "en": "As the moon keeps moving, we see more of the bright side each night.",
     "ko": "달이 계속 움직이면서 우리는 밤마다 밝은 면을 더 많이 보게 된다."
    },
    {
     "en": "When the Earth is between the sun and the moon, we see the whole bright side, which is a full moon.",
     "ko": "지구가 태양과 달 사이에 있을 때는 밝은 면 전체를 보게 되는데, 이것이 보름달이다."
    },
    {
     "en": "This whole cycle takes about 29 and a half days, and then the pattern starts again.",
     "ko": "이 전체 주기는 약 29.5일이 걸리고, 그런 다음 같은 과정이 다시 시작된다."
    }
   ],
   "key": 1,
   "keyWhy": {
    "en": "This sentence explains what the phases depend on, and the other sentences show how this works.",
    "ko": "이 문장은 달의 위상이 무엇에 따라 달라지는지 설명하고, 다른 문장들은 그 원리를 보여 주기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "The moon's phases depend on how much of its sunlit side we see.",
      "ko": "달의 위상은 햇빛을 받는 면을 우리가 얼마나 보느냐에 따라 달라진다."
     },
     {
      "en": "The moon reflects light from the sun instead of making light.",
      "ko": "달은 스스로 빛을 내는 대신 태양의 빛을 반사한다."
     },
     {
      "en": "The moon really changes its shape because it makes its own light.",
      "ko": "달은 스스로 빛을 내기 때문에 실제로 모양이 바뀐다."
     },
     {
      "en": "There are many interesting objects to see in the night sky.",
      "ko": "밤하늘에는 볼 만한 흥미로운 천체가 많다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains why the moon seems to change shape. Reflected light is only one detail, the third option is the opposite of the text, and the last one is too broad.",
     "ko": "글은 달의 모양이 왜 바뀌어 보이는지 설명한다. 반사된 빛은 세부 내용 하나이고, 세 번째는 글과 반대이며, 마지막은 너무 넓다."
    }
   },
   "words": [
    {
     "en": "phases",
     "ko": "위상, 단계"
    },
    {
     "en": "reflects",
     "ko": "반사하다"
    },
    {
     "en": "cycle",
     "ko": "주기, 순환"
    }
   ],
   "summary": {
    "ko": "달의 모양은 우리가 볼 수 있는 달의 밝은 면의 양에 따라 달라 보인다.",
    "en": "The moon's phases change depending on how much of its bright side we see.",
    "keywords": [
     "phases",
     "bright",
     "side"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-12",
   "genre": "info",
   "title": {
    "en": "Kimchi and Fermentation",
    "ko": "김치와 발효"
   },
   "topic": {
    "en": "Culture",
    "ko": "문화"
   },
   "bg": {
    "en": "In 2013, UNESCO added Korea's kimjang tradition to its list of the Intangible Cultural Heritage of Humanity.",
    "ko": "2013년, 유네스코는 한국의 김장 문화를 인류무형문화유산 목록에 올렸다."
   },
   "sentences": [
    {
     "en": "Kimchi is a famous Korean food, and its special taste comes from a natural process called fermentation.",
     "ko": "김치는 유명한 한국 음식이며, 그 특별한 맛은 발효라는 자연적인 과정에서 나온다."
    },
    {
     "en": "To make kimchi, people mix vegetables like napa cabbage and radish with salt and spices.",
     "ko": "김치를 만들려면 배추와 무 같은 채소를 소금, 양념과 함께 버무린다."
    },
    {
     "en": "Then the kimchi is stored in a cool place for some time.",
     "ko": "그다음 김치를 서늘한 곳에 한동안 보관한다."
    },
    {
     "en": "During this time, tiny living things called lactic acid bacteria start to grow.",
     "ko": "이 기간 동안 유산균이라는 아주 작은 생물이 자라기 시작한다."
    },
    {
     "en": "These good bacteria change the sugars in the vegetables into acids.",
     "ko": "이 좋은 균들은 채소 속의 당분을 산으로 바꾼다."
    },
    {
     "en": "This is what gives kimchi its sour, tangy flavor.",
     "ko": "이것이 김치에 새콤하고 톡 쏘는 맛을 준다."
    },
    {
     "en": "The salt and acid also stop many harmful germs from growing, so kimchi can be kept for a long time.",
     "ko": "소금과 산은 또한 여러 해로운 세균이 자라지 못하게 막아서 김치를 오래 보관할 수 있다."
    },
    {
     "en": "In the past, families made large amounts of kimchi in late autumn to eat during the winter.",
     "ko": "옛날에는 가족들이 겨울 동안 먹으려고 늦가을에 김치를 많이 담갔다."
    },
    {
     "en": "This tradition, called kimjang, is still important in Korea today.",
     "ko": "김장이라고 불리는 이 전통은 오늘날에도 한국에서 여전히 중요하다."
    },
    {
     "en": "Thanks to fermentation, kimchi is both delicious and good for your health.",
     "ko": "발효 덕분에 김치는 맛도 좋고 건강에도 좋다."
    }
   ],
   "key": 0,
   "keyWhy": {
    "en": "The first sentence connects kimchi with fermentation, and the rest of the text explains how fermentation works in kimchi.",
    "ko": "첫 문장이 김치와 발효를 연결하고, 나머지 글은 김치에서 발효가 어떻게 일어나는지 설명하기 때문이다."
   },
   "main": {
    "options": [
     {
      "en": "Kimchi gets its special taste and long life from fermentation.",
      "ko": "김치는 발효를 통해 특별한 맛과 긴 보관 기간을 얻는다."
     },
     {
      "en": "Families made large amounts of kimchi in late autumn.",
      "ko": "가족들은 늦가을에 김치를 많이 담갔다."
     },
     {
      "en": "Fermentation makes kimchi spoil quickly and lose its flavor.",
      "ko": "발효는 김치를 빨리 상하게 하고 맛을 잃게 한다."
     },
     {
      "en": "Korea has many kinds of delicious traditional foods.",
      "ko": "한국에는 맛있는 전통 음식이 많다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains how fermentation gives kimchi its taste and helps it last. Kimjang is only a detail, the third option is the opposite of the text, and the last one is too general.",
     "ko": "글은 발효가 김치에 맛을 주고 오래 보관되게 하는 과정을 설명한다. 김장은 세부 내용이고, 세 번째는 글과 반대이며, 마지막은 너무 일반적이다."
    }
   },
   "words": [
    {
     "en": "fermentation",
     "ko": "발효"
    },
    {
     "en": "bacteria",
     "ko": "세균, 박테리아"
    },
    {
     "en": "flavor",
     "ko": "맛, 풍미"
    }
   ],
   "summary": {
    "ko": "김치는 발효를 통해 특별한 맛을 얻고 오래 보관할 수 있다.",
    "en": "Kimchi gets its special taste and can be kept long through fermentation.",
    "keywords": [
     "Kimchi",
     "taste",
     "fermentation"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-01",
   "genre": "info",
   "title": {
    "en": "Why Notifications Steal Our Focus",
    "ko": "알림은 왜 우리의 집중력을 빼앗을까"
   },
   "topic": {
    "en": "Technology",
    "ko": "기술"
   },
   "bg": {
    "en": "Many smartphones now include a focus or do-not-disturb mode that silences alerts for a set period of time.",
    "ko": "요즘 많은 스마트폰에는 정해진 시간 동안 알림을 꺼 주는 집중 모드나 방해 금지 모드가 들어 있다."
   },
   "sentences": [
    {
     "en": "Many people check their phones dozens of times a day, often without thinking about it.",
     "ko": "많은 사람들은 하루에도 수십 번씩, 종종 별생각 없이 휴대폰을 확인한다."
    },
    {
     "en": "Most of these checks are triggered by notifications: a buzz, a sound, or a red badge on an app icon.",
     "ko": "이런 확인의 대부분은 진동, 소리, 앱 아이콘 위의 빨간 배지 같은 알림 때문에 일어난다."
    },
    {
     "en": "Each alert seems harmless, since it takes only a second to glance at the screen.",
     "ko": "화면을 한 번 보는 데 1초밖에 걸리지 않으니 알림 하나하나는 별로 해롭지 않아 보인다."
    },
    {
     "en": "However, research on attention suggests that notifications quietly reduce our ability to focus deeply.",
     "ko": "그러나 주의력에 관한 연구에 따르면 알림은 우리가 깊이 집중하는 능력을 조용히 떨어뜨린다."
    },
    {
     "en": "When we switch from a task to a message, our brain needs time to return fully to what we were doing.",
     "ko": "하던 일에서 메시지로 주의를 옮기면, 뇌는 원래 하던 일로 완전히 돌아오는 데 시간이 필요하다."
    },
    {
     "en": "Psychologists call this lingering distraction 'attention residue.'",
     "ko": "심리학자들은 이렇게 남아 있는 산만함을 '주의 잔여물'이라고 부른다."
    },
    {
     "en": "Even an alert we choose to ignore can pull part of our mind away, because we start wondering what it says.",
     "ko": "무시하기로 한 알림조차 무슨 내용인지 궁금해지기 때문에 우리 마음의 일부를 끌어갈 수 있다."
    },
    {
     "en": "Over a day, these small interruptions add up and make it harder to read, study, or solve difficult problems.",
     "ko": "하루 동안 이런 작은 방해들이 쌓이면 글을 읽고, 공부하고, 어려운 문제를 푸는 것이 더 힘들어진다."
    },
    {
     "en": "App designers know this, and many notifications are built to feel urgent so that users return to the app.",
     "ko": "앱 설계자들은 이 사실을 알고 있어서, 많은 알림은 사용자가 앱으로 돌아오도록 급하게 느껴지게 만들어진다."
    },
    {
     "en": "Fortunately, the solution is simple.",
     "ko": "다행히 해결책은 간단하다."
    },
    {
     "en": "Turning off non-essential notifications or keeping the phone in another room can protect long periods of concentration.",
     "ko": "꼭 필요하지 않은 알림을 끄거나 휴대폰을 다른 방에 두면 오랜 시간의 집중을 지킬 수 있다."
    },
    {
     "en": "Our attention is limited, so it is worth deciding for ourselves where it goes.",
     "ko": "우리의 주의력은 한정되어 있으므로, 그것을 어디에 쓸지는 스스로 정할 가치가 있다."
    }
   ],
   "key": 3,
   "keyWhy": {
    "en": "The text first says that alerts seem harmless, then turns with 'However' to state the real claim: notifications reduce our ability to focus deeply. The rest of the text explains and supports this idea.",
    "ko": "글은 먼저 알림이 해롭지 않아 보인다고 말한 뒤 'However'로 방향을 바꿔 핵심 주장, 즉 알림이 깊이 집중하는 능력을 떨어뜨린다는 내용을 제시해요. 나머지 문장들은 이 주장을 설명하고 뒷받침해요."
   },
   "main": {
    "options": [
     {
      "en": "Frequent notifications weaken our ability to concentrate, so we should limit them.",
      "ko": "잦은 알림은 집중력을 약화시키므로 알림을 제한해야 한다."
     },
     {
      "en": "Psychologists use the term attention residue to describe lingering distraction.",
      "ko": "심리학자들은 남아 있는 산만함을 '주의 잔여물'이라는 용어로 설명한다."
     },
     {
      "en": "Notifications help us manage our time and focus better on important tasks.",
      "ko": "알림은 시간을 관리하고 중요한 일에 더 잘 집중하도록 돕는다."
     },
     {
      "en": "Smartphones have changed almost every part of modern daily life.",
      "ko": "스마트폰은 현대 일상생활의 거의 모든 부분을 바꾸어 놓았다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text argues that even brief alerts break our concentration and suggests turning them off. The other choices only give a detail (attention residue), reverse the claim, or make a general statement the text does not argue.",
     "ko": "글은 짧은 알림조차 집중을 깨뜨린다고 주장하며 알림을 끄라고 제안해요. 나머지 선택지는 세부 내용(주의 잔여물)만 말하거나, 주장을 뒤집거나, 글이 주장하지 않는 일반적인 내용이에요."
    }
   },
   "words": [
    {
     "en": "concentration",
     "ko": "집중"
    },
    {
     "en": "interruptions",
     "ko": "방해, 중단"
    },
    {
     "en": "residue",
     "ko": "잔여물"
    }
   ],
   "summary": {
    "ko": "알림은 집중력을 떨어뜨리므로 불필요한 알림을 줄여 주의력을 지켜야 한다.",
    "en": "Notifications reduce our focus, so we should cut unnecessary alerts to protect our attention.",
    "keywords": [
     "notifications",
     "focus",
     "attention"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-02",
   "genre": "info",
   "title": {
    "en": "The Greenhouse Effect: Helpful and Harmful",
    "ko": "온실 효과: 이로움과 해로움"
   },
   "topic": {
    "en": "Environment",
    "ko": "환경"
   },
   "bg": {
    "en": "In the mid-1800s, scientists such as Eunice Foote and John Tyndall showed through experiments that carbon dioxide and water vapor can trap heat.",
    "ko": "1800년대 중반에 유니스 푸트와 존 틴들 같은 과학자들은 실험을 통해 이산화탄소와 수증기가 열을 가둘 수 있다는 것을 보여 주었다."
   },
   "sentences": [
    {
     "en": "The greenhouse effect is a natural process that keeps Earth warm enough for life, but human activity is making it dangerously stronger.",
     "ko": "온실 효과는 지구를 생명이 살 수 있을 만큼 따뜻하게 유지해 주는 자연적인 과정이지만, 인간의 활동이 그것을 위험할 정도로 강하게 만들고 있다."
    },
    {
     "en": "Sunlight passes through the atmosphere and warms the planet's surface.",
     "ko": "햇빛은 대기를 통과하여 지구 표면을 데운다."
    },
    {
     "en": "The warm surface then gives off heat in the form of infrared radiation.",
     "ko": "데워진 표면은 적외선 복사의 형태로 열을 내보낸다."
    },
    {
     "en": "Certain gases in the air, such as carbon dioxide, methane, and water vapor, absorb much of this heat and send part of it back toward the ground.",
     "ko": "이산화탄소, 메탄, 수증기 같은 공기 중의 특정 기체들은 이 열의 상당 부분을 흡수하여 그중 일부를 다시 지면 쪽으로 보낸다."
    },
    {
     "en": "Without these greenhouse gases, Earth's average temperature would be far below freezing.",
     "ko": "이러한 온실가스가 없다면 지구의 평균 기온은 영하보다 훨씬 낮을 것이다."
    },
    {
     "en": "The problem is not the effect itself but its intensity.",
     "ko": "문제는 온실 효과 자체가 아니라 그 강도이다."
    },
    {
     "en": "Since the Industrial Revolution, people have burned huge amounts of coal, oil, and gas, releasing carbon dioxide that had been stored underground for millions of years.",
     "ko": "산업 혁명 이후 사람들은 엄청난 양의 석탄, 석유, 가스를 태워 수백만 년 동안 땅속에 저장되어 있던 이산화탄소를 배출해 왔다."
    },
    {
     "en": "Cutting down forests adds even more, because trees that once absorbed carbon are removed.",
     "ko": "숲을 베어 내면 한때 탄소를 흡수하던 나무들이 사라지기 때문에 온실가스는 더욱 늘어난다."
    },
    {
     "en": "As greenhouse gases build up, more heat is trapped, and global temperatures rise.",
     "ko": "온실가스가 쌓일수록 더 많은 열이 갇히고 지구의 기온이 올라간다."
    },
    {
     "en": "This warming melts glaciers, raises sea levels, and makes heat waves and heavy rainfall more frequent.",
     "ko": "이러한 온난화는 빙하를 녹이고 해수면을 높이며, 폭염과 폭우를 더 잦게 만든다."
    },
    {
     "en": "In other words, a process that protects life can threaten it when it goes too far.",
     "ko": "다시 말해, 생명을 보호하는 과정도 지나치면 생명을 위협할 수 있다."
    },
    {
     "en": "Reducing emissions is therefore essential to keeping the climate stable.",
     "ko": "따라서 배출량을 줄이는 것은 기후를 안정적으로 유지하는 데 필수적이다."
    }
   ],
   "key": 0,
   "keyWhy": {
    "en": "The first sentence states both sides of the main idea: the greenhouse effect is natural and necessary, but humans are making it too strong. Later signals such as 'The problem is' and 'In other words' return to this same point.",
    "ko": "첫 문장이 핵심 내용의 두 측면, 즉 온실 효과는 자연적이고 필요하지만 인간이 그것을 지나치게 강하게 만들고 있다는 점을 모두 말해요. 뒤에 나오는 'The problem is', 'In other words' 같은 신호도 같은 요점으로 되돌아가요."
   },
   "main": {
    "options": [
     {
      "en": "Human activities are strengthening the natural greenhouse effect, which is causing harmful climate change.",
      "ko": "인간의 활동이 자연적인 온실 효과를 강화하여 해로운 기후 변화를 일으키고 있다."
     },
     {
      "en": "Cutting down forests removes trees that once absorbed carbon from the air.",
      "ko": "숲을 베어 내면 한때 공기 중의 탄소를 흡수하던 나무들이 사라진다."
     },
     {
      "en": "The greenhouse effect is completely natural, so humans have little influence on it.",
      "ko": "온실 효과는 전적으로 자연적인 현상이므로 인간은 그것에 거의 영향을 주지 않는다."
     },
     {
      "en": "Weather on Earth changes constantly and is very difficult to predict.",
      "ko": "지구의 날씨는 끊임없이 변하며 예측하기가 매우 어렵다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains that the greenhouse effect is natural but argues that human emissions are making it dangerously strong. The other choices give only one example, reverse the claim, or state something general the text does not discuss.",
     "ko": "글은 온실 효과가 자연적인 현상이지만 인간의 배출이 그것을 위험할 정도로 강하게 만든다고 주장해요. 나머지 선택지는 예시 하나만 말하거나, 주장을 뒤집거나, 글이 다루지 않는 일반적인 내용이에요."
    }
   },
   "words": [
    {
     "en": "atmosphere",
     "ko": "대기"
    },
    {
     "en": "radiation",
     "ko": "복사, 방사"
    },
    {
     "en": "emissions",
     "ko": "배출(량)"
    }
   ],
   "summary": {
    "ko": "인간 활동이 자연적인 온실 효과를 지나치게 강화해 기후 변화를 일으키고 있다.",
    "en": "Human activity is making the natural greenhouse effect too strong, which causes climate change.",
    "keywords": [
     "greenhouse",
     "activity",
     "climate"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-03",
   "genre": "info",
   "title": {
    "en": "How Vaccines Train the Body",
    "ko": "백신은 어떻게 몸을 훈련시킬까"
   },
   "topic": {
    "en": "Health",
    "ko": "건강"
   },
   "bg": {
    "en": "The word vaccine comes from the Latin word vacca, meaning cow, because Edward Jenner's early vaccine in 1796 used cowpox.",
    "ko": "백신(vaccine)이라는 단어는 '소'를 뜻하는 라틴어 vacca에서 왔는데, 1796년 에드워드 제너의 초기 백신이 우두를 이용했기 때문이다."
   },
   "sentences": [
    {
     "en": "Our immune system is remarkably good at fighting germs, but it usually needs time to learn how to defeat a new one.",
     "ko": "우리의 면역 체계는 병균과 싸우는 데 놀라울 만큼 뛰어나지만, 보통 새로운 병균을 물리치는 법을 배우는 데에는 시간이 필요하다."
    },
    {
     "en": "Vaccines work by giving the immune system a safe chance to practice before a real infection happens.",
     "ko": "백신은 실제 감염이 일어나기 전에 면역 체계에 안전하게 연습할 기회를 줌으로써 작용한다."
    },
    {
     "en": "A vaccine may contain a weakened or inactivated germ, a small piece of a germ, or instructions that let the body make one harmless part of it.",
     "ko": "백신에는 약해지거나 비활성화된 병균, 병균의 작은 조각, 또는 몸이 병균의 무해한 일부를 만들 수 있게 하는 정보가 들어 있을 수 있다."
    },
    {
     "en": "This material cannot cause the full disease, yet it resembles the real germ closely enough to alert the body's defenses.",
     "ko": "이 물질은 완전한 질병을 일으키지는 못하지만, 실제 병균과 충분히 닮아서 몸의 방어 체계에 경보를 울린다."
    },
    {
     "en": "In response, white blood cells produce antibodies that recognize the specific invader.",
     "ko": "이에 반응하여 백혈구는 그 특정한 침입자를 알아보는 항체를 만들어 낸다."
    },
    {
     "en": "More importantly, the body creates memory cells that can remain for years.",
     "ko": "더 중요한 것은, 몸이 수년 동안 남아 있을 수 있는 기억 세포를 만든다는 점이다."
    },
    {
     "en": "If the real germ enters later, these memory cells recognize it quickly and launch a strong attack.",
     "ko": "나중에 진짜 병균이 들어오면 이 기억 세포들이 재빨리 그것을 알아보고 강력한 공격을 시작한다."
    },
    {
     "en": "As a result, the person may not get sick at all, or may have a much milder illness.",
     "ko": "그 결과 그 사람은 전혀 아프지 않거나 훨씬 가볍게 앓고 지나갈 수 있다."
    },
    {
     "en": "Vaccines also protect people who cannot be vaccinated, such as very young babies or people with certain illnesses.",
     "ko": "백신은 또한 아주 어린 아기나 특정 질병이 있는 사람처럼 백신을 맞을 수 없는 사람들도 보호한다."
    },
    {
     "en": "When enough people in a community are immune, a disease has difficulty spreading from person to person.",
     "ko": "한 공동체에서 충분히 많은 사람이 면역을 갖추면 질병이 사람에게서 사람으로 퍼지기 어려워진다."
    },
    {
     "en": "This is called herd immunity.",
     "ko": "이것을 집단 면역이라고 부른다."
    },
    {
     "en": "Thanks to this kind of training, diseases that once killed millions, such as smallpox, have been controlled or even eliminated.",
     "ko": "이러한 훈련 덕분에 천연두처럼 한때 수백만 명의 목숨을 앗아 간 질병들이 통제되거나 심지어 완전히 사라지기도 했다."
    }
   ],
   "key": 1,
   "keyWhy": {
    "en": "The first sentence introduces a problem: the immune system needs time to learn. The next sentence gives the main idea as the answer: vaccines let the body practice safely. Everything after explains how this practice works and why it matters.",
    "ko": "첫 문장은 면역 체계가 배우는 데 시간이 필요하다는 문제를 제시해요. 바로 다음 문장이 그 해답으로 핵심 내용, 즉 백신이 몸에 안전하게 연습할 기회를 준다는 점을 말해요. 그 뒤의 문장들은 이 연습이 어떻게 이루어지고 왜 중요한지 설명해요."
   },
   "main": {
    "options": [
     {
      "en": "Vaccines prepare the immune system to fight real germs by letting it practice safely.",
      "ko": "백신은 면역 체계가 안전하게 연습하게 하여 실제 병균과 싸울 준비를 시킨다."
     },
     {
      "en": "Herd immunity happens when enough people in a community are immune.",
      "ko": "집단 면역은 공동체에서 충분히 많은 사람이 면역을 가질 때 생긴다."
     },
     {
      "en": "Vaccines weaken the immune system, making the body depend on medicine.",
      "ko": "백신은 면역 체계를 약화시켜 몸이 약에 의존하게 만든다."
     },
     {
      "en": "Staying healthy requires good food, enough sleep, and regular exercise.",
      "ko": "건강을 유지하려면 좋은 음식, 충분한 잠, 규칙적인 운동이 필요하다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The whole text explains how vaccines give the immune system safe practice so it can respond quickly to real germs. The other choices give one detail, reverse the claim, or offer general health advice the text does not discuss.",
     "ko": "글 전체가 백신이 면역 체계에 안전한 연습 기회를 주어 실제 병균에 빠르게 대응하게 한다는 점을 설명해요. 나머지 선택지는 세부 내용 하나만 말하거나, 주장을 뒤집거나, 글이 다루지 않는 일반적인 건강 조언이에요."
    }
   },
   "words": [
    {
     "en": "immune",
     "ko": "면역의, 면역이 있는"
    },
    {
     "en": "antibodies",
     "ko": "항체"
    },
    {
     "en": "infection",
     "ko": "감염"
    }
   ],
   "summary": {
    "ko": "백신은 면역 체계가 안전하게 연습하게 하여 실제 병균에 대비하도록 한다.",
    "en": "Vaccines let the immune system practice safely so it is ready for real germs.",
    "keywords": [
     "vaccines",
     "immune",
     "germs"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-04",
   "genre": "info",
   "title": {
    "en": "The Press That Changed the World",
    "ko": "세상을 바꾼 인쇄기"
   },
   "topic": {
    "en": "History",
    "ko": "역사"
   },
   "bg": {
    "en": "Movable metal type was used in Korea even earlier: the Jikji, printed in 1377 during the Goryeo Dynasty, is the oldest surviving book printed with movable metal type.",
    "ko": "금속 활자는 한국에서 더 일찍 사용되었다. 고려 시대인 1377년에 인쇄된 '직지'는 현존하는 가장 오래된 금속 활자본이다."
   },
   "sentences": [
    {
     "en": "Around 1450, Johannes Gutenberg developed a printing press with movable metal type in Germany.",
     "ko": "1450년 무렵, 요하네스 구텐베르크는 독일에서 금속 활자를 이용한 인쇄기를 개발했다."
    },
    {
     "en": "Before then, most books in Europe were copied by hand, a slow and expensive process.",
     "ko": "그 전까지 유럽의 책은 대부분 손으로 베껴 썼는데, 이는 느리고 비용이 많이 드는 과정이었다."
    },
    {
     "en": "A single book could take months to produce, so only churches, universities, and wealthy people owned many of them.",
     "ko": "책 한 권을 만드는 데 몇 달이 걸릴 수 있었기 때문에, 교회와 대학, 부유한 사람들만 책을 많이 가지고 있었다."
    },
    {
     "en": "Gutenberg's press made it possible to print hundreds of identical pages quickly.",
     "ko": "구텐베르크의 인쇄기 덕분에 똑같은 페이지 수백 장을 빠르게 찍어 내는 것이 가능해졌다."
    },
    {
     "en": "Within a few decades, printing shops had spread to cities across Europe, and the price of books fell sharply.",
     "ko": "수십 년 만에 인쇄소는 유럽 전역의 도시로 퍼져 나갔고, 책값은 크게 떨어졌다."
    },
    {
     "en": "As books became cheaper, more ordinary people had reasons to learn to read.",
     "ko": "책이 저렴해지자 더 많은 평범한 사람들이 글 읽기를 배울 이유가 생겼다."
    },
    {
     "en": "Scientists could share their findings accurately, and others could check and build on their work.",
     "ko": "과학자들은 자신의 발견을 정확하게 공유할 수 있었고, 다른 사람들은 그 연구를 검증하고 발전시킬 수 있었다."
    },
    {
     "en": "New religious and political ideas also spread faster than authorities could control them.",
     "ko": "새로운 종교적, 정치적 사상도 권력자들이 통제할 수 없을 만큼 빠르게 퍼졌다."
    },
    {
     "en": "For example, Martin Luther's writings in the early 1500s reached a wide audience thanks to printed pamphlets.",
     "ko": "예를 들어, 1500년대 초 마르틴 루터의 글은 인쇄된 소책자 덕분에 많은 사람들에게 전해졌다."
    },
    {
     "en": "Printing also helped standardize spelling and grammar in many languages.",
     "ko": "인쇄술은 또한 여러 언어에서 철자와 문법을 표준화하는 데 도움을 주었다."
    },
    {
     "en": "Over time, people began to expect information to be shared widely rather than kept by a small group.",
     "ko": "시간이 흐르면서 사람들은 정보가 소수의 집단에 의해 독점되기보다 널리 공유되기를 기대하게 되었다."
    },
    {
     "en": "Thus, the printing press was far more than a new machine; it changed how knowledge was created, shared, and controlled.",
     "ko": "따라서 인쇄기는 단순한 새 기계를 훨씬 넘어서는 것이었으며, 지식이 만들어지고 공유되고 통제되는 방식을 바꾸어 놓았다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "The text lists many effects of printing, such as cheaper books, shared science, and spreading ideas. The final sentence, starting with 'Thus', pulls these examples together into one general claim.",
    "ko": "글은 책값 하락, 과학 지식 공유, 사상의 확산 등 인쇄술의 여러 영향을 나열해요. 'Thus'로 시작하는 마지막 문장이 이 예들을 하나의 일반적인 주장으로 묶어 줘요."
   },
   "main": {
    "options": [
     {
      "en": "The printing press transformed society by changing how knowledge was created and shared.",
      "ko": "인쇄기는 지식이 만들어지고 공유되는 방식을 바꿈으로써 사회를 변화시켰다."
     },
     {
      "en": "Martin Luther used printed pamphlets to spread his ideas widely.",
      "ko": "마르틴 루터는 인쇄된 소책자를 이용해 자신의 사상을 널리 퍼뜨렸다."
     },
     {
      "en": "The printing press had little effect on most people's everyday lives.",
      "ko": "인쇄기는 대부분의 사람들의 일상생활에 거의 영향을 미치지 않았다."
     },
     {
      "en": "New inventions always appear when people need them the most.",
      "ko": "새로운 발명품은 언제나 사람들이 그것을 가장 필요로 할 때 등장한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Every example in the text shows how printing changed the way knowledge spread in society. The other choices give only one example, reverse the claim, or make a general statement the text does not argue.",
     "ko": "글의 모든 예시는 인쇄술이 사회에서 지식이 퍼지는 방식을 어떻게 바꾸었는지 보여 줘요. 나머지 선택지는 예시 하나만 말하거나, 주장을 뒤집거나, 글이 주장하지 않는 일반적인 내용이에요."
    }
   },
   "words": [
    {
     "en": "identical",
     "ko": "똑같은, 동일한"
    },
    {
     "en": "authorities",
     "ko": "권력자, 당국"
    },
    {
     "en": "standardize",
     "ko": "표준화하다"
    }
   ],
   "summary": {
    "ko": "인쇄기는 지식이 만들어지고 공유되는 방식을 바꾸어 사회를 변화시켰다.",
    "en": "The printing press changed society by transforming how knowledge was created and shared.",
    "keywords": [
     "printing",
     "society",
     "knowledge"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-05",
   "genre": "info",
   "title": {
    "en": "What Sets the Price?",
    "ko": "가격은 무엇이 정할까"
   },
   "topic": {
    "en": "Economics",
    "ko": "경제"
   },
   "bg": {
    "en": "In 1776, the economist Adam Smith described how markets seem to be guided by an invisible hand in his book The Wealth of Nations.",
    "ko": "1776년 경제학자 애덤 스미스는 저서 '국부론'에서 시장이 마치 보이지 않는 손에 의해 움직이는 것 같다고 설명했다."
   },
   "sentences": [
    {
     "en": "In a market economy, prices are largely set by the balance between supply and demand.",
     "ko": "시장 경제에서 가격은 대체로 공급과 수요의 균형에 의해 정해진다."
    },
    {
     "en": "Supply is the amount of a product that sellers are willing to offer, while demand is the amount that buyers want to purchase.",
     "ko": "공급은 판매자가 내놓으려는 상품의 양이고, 수요는 구매자가 사고 싶어 하는 양이다."
    },
    {
     "en": "When demand rises but supply stays the same, buyers compete for limited goods, and prices tend to go up.",
     "ko": "수요는 늘었는데 공급이 그대로이면, 구매자들이 한정된 상품을 두고 경쟁하게 되어 가격이 오르는 경향이 있다."
    },
    {
     "en": "When supply increases while demand does not change, sellers must compete for customers, so prices usually fall.",
     "ko": "수요는 변하지 않는데 공급이 늘어나면, 판매자들이 고객을 두고 경쟁해야 하므로 가격은 보통 떨어진다."
    },
    {
     "en": "Consider what happens after a poor cabbage harvest.",
     "ko": "배추 농사가 흉작일 때 어떤 일이 일어나는지 생각해 보자."
    },
    {
     "en": "Because fewer cabbages reach the market, their price rises, sometimes sharply.",
     "ko": "시장에 나오는 배추가 줄어들기 때문에 가격이 오르는데, 때로는 급격히 오르기도 한다."
    },
    {
     "en": "When the next harvest is plentiful, the price falls again.",
     "ko": "다음 수확이 풍성하면 가격은 다시 떨어진다."
    },
    {
     "en": "Prices also send important signals.",
     "ko": "가격은 또한 중요한 신호를 보낸다."
    },
    {
     "en": "A high price tells producers that people want more of a product, encouraging them to make more.",
     "ko": "높은 가격은 생산자에게 사람들이 그 상품을 더 원한다는 것을 알려 주어 더 많이 생산하도록 이끈다."
    },
    {
     "en": "A low price suggests that resources might be better used elsewhere.",
     "ko": "낮은 가격은 자원을 다른 곳에 쓰는 편이 나을 수도 있음을 암시한다."
    },
    {
     "en": "Of course, real markets are also affected by other factors, such as government rules, advertising, and unexpected events.",
     "ko": "물론 실제 시장은 정부 규제, 광고, 예상치 못한 사건 같은 다른 요인들의 영향도 받는다."
    },
    {
     "en": "Still, the basic relationship between supply and demand helps explain why prices change in everyday life.",
     "ko": "그래도 공급과 수요의 기본적인 관계는 일상생활에서 가격이 왜 변하는지 설명하는 데 도움이 된다."
    }
   ],
   "key": 0,
   "keyWhy": {
    "en": "The first sentence states the general rule. The following sentences define the terms and give the cabbage example, and the last sentence, starting with 'Still', confirms the same main idea.",
    "ko": "첫 문장이 일반적인 원리를 제시해요. 이어지는 문장들은 용어를 정의하고 배추의 예를 들며, 'Still'로 시작하는 마지막 문장이 같은 핵심 내용을 다시 확인해요."
   },
   "main": {
    "options": [
     {
      "en": "Prices change mainly according to the balance between supply and demand.",
      "ko": "가격은 주로 공급과 수요의 균형에 따라 변한다."
     },
     {
      "en": "Cabbage prices can rise sharply after a poor harvest.",
      "ko": "배추 가격은 흉작 뒤에 급격히 오를 수 있다."
     },
     {
      "en": "Prices are decided mostly by government rules, not by supply and demand.",
      "ko": "가격은 공급과 수요가 아니라 주로 정부 규제에 의해 결정된다."
     },
     {
      "en": "People should save money instead of spending it on unnecessary things.",
      "ko": "사람들은 불필요한 것에 돈을 쓰는 대신 저축해야 한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains how changes in supply and demand push prices up or down. The other choices give only the example, reverse the claim, or offer advice the text does not give.",
     "ko": "글은 공급과 수요의 변화가 어떻게 가격을 올리거나 내리는지 설명해요. 나머지 선택지는 예시만 말하거나, 주장을 뒤집거나, 글이 하지 않는 조언이에요."
    }
   },
   "words": [
    {
     "en": "supply",
     "ko": "공급"
    },
    {
     "en": "demand",
     "ko": "수요"
    },
    {
     "en": "resources",
     "ko": "자원"
    }
   ],
   "summary": {
    "ko": "가격은 주로 공급과 수요의 균형에 따라 변한다.",
    "en": "Prices mainly change according to the balance between supply and demand.",
    "keywords": [
     "prices",
     "supply",
     "demand"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-06",
   "genre": "info",
   "title": {
    "en": "Where AI Bias Comes From",
    "ko": "인공지능의 편향은 어디서 올까"
   },
   "topic": {
    "en": "Technology",
    "ko": "기술"
   },
   "bg": {
    "en": "Since the early days of computing, programmers have used the phrase garbage in, garbage out, meaning that poor input leads to poor results.",
    "ko": "컴퓨터 초창기부터 프로그래머들은 '쓰레기가 들어가면 쓰레기가 나온다'라는 말을 써 왔는데, 이는 잘못된 입력이 잘못된 결과로 이어진다는 뜻이다."
   },
   "sentences": [
    {
     "en": "Many people believe that computers are objective because they follow mathematical rules rather than feelings.",
     "ko": "많은 사람들은 컴퓨터가 감정이 아니라 수학적 규칙을 따르기 때문에 객관적이라고 믿는다."
    },
    {
     "en": "Artificial intelligence systems, however, learn by finding patterns in large amounts of data collected from the real world.",
     "ko": "그러나 인공지능 시스템은 현실 세계에서 수집한 방대한 양의 데이터에서 패턴을 찾아 학습한다."
    },
    {
     "en": "If that data reflects past unfairness, the system can learn the unfairness too.",
     "ko": "그 데이터가 과거의 불공정함을 반영하고 있다면, 시스템도 그 불공정함을 배울 수 있다."
    },
    {
     "en": "In other words, bias in AI usually comes not from the machine itself but from the data it is trained on.",
     "ko": "다시 말해, 인공지능의 편향은 대개 기계 자체가 아니라 그것이 학습한 데이터에서 비롯된다."
    },
    {
     "en": "Suppose a company trains a hiring program using records of the employees it hired over the past twenty years.",
     "ko": "한 회사가 지난 20년 동안 채용한 직원들의 기록으로 채용 프로그램을 학습시킨다고 가정해 보자."
    },
    {
     "en": "If the company mostly hired men during that period, the program may conclude that male applicants are better candidates.",
     "ko": "그 기간에 회사가 주로 남성을 채용했다면, 프로그램은 남성 지원자가 더 나은 후보라고 결론 내릴 수 있다."
    },
    {
     "en": "Similarly, some facial recognition systems trained mainly on photos of lighter-skinned people have made more errors with darker-skinned faces.",
     "ko": "마찬가지로, 주로 피부색이 밝은 사람들의 사진으로 학습한 일부 얼굴 인식 시스템은 피부색이 어두운 얼굴에서 더 많은 오류를 냈다."
    },
    {
     "en": "The program is not trying to discriminate; it is simply copying the patterns it was given.",
     "ko": "프로그램이 차별하려는 것이 아니라, 그저 주어진 패턴을 따라 할 뿐이다."
    },
    {
     "en": "This is why developers need to check their data carefully and test their systems on many different groups of people.",
     "ko": "이것이 개발자들이 데이터를 꼼꼼히 확인하고 다양한 집단의 사람들을 대상으로 시스템을 시험해야 하는 이유이다."
    },
    {
     "en": "Diverse teams can also help notice problems that others might miss.",
     "ko": "다양한 사람들로 구성된 팀은 다른 사람들이 놓칠 수 있는 문제를 알아차리는 데에도 도움이 된다."
    },
    {
     "en": "Ignoring these steps can turn old human prejudices into automated decisions that affect millions of people.",
     "ko": "이러한 단계를 무시하면 오래된 인간의 편견이 수백만 명에게 영향을 미치는 자동화된 결정으로 바뀔 수 있다."
    }
   ],
   "key": 3,
   "keyWhy": {
    "en": "The text begins with a common belief that computers are objective, then challenges it with 'however.' The phrase 'In other words' signals that the key sentence restates the point clearly: AI bias comes from its training data. The hiring and face recognition examples support this.",
    "ko": "글은 컴퓨터가 객관적이라는 흔한 믿음으로 시작한 뒤 'however'로 그 믿음에 반박해요. 'In other words'는 핵심 문장이 요점을 분명하게 다시 말한다는 신호로, 인공지능의 편향은 학습 데이터에서 온다는 내용이에요. 채용 프로그램과 얼굴 인식의 예가 이를 뒷받침해요."
   },
   "main": {
    "options": [
     {
      "en": "AI systems become biased mainly because they learn from data that reflects human unfairness.",
      "ko": "인공지능 시스템은 주로 인간의 불공정함이 반영된 데이터로 학습하기 때문에 편향된다."
     },
     {
      "en": "A hiring program may prefer male applicants if trained on past records.",
      "ko": "채용 프로그램은 과거 기록으로 학습하면 남성 지원자를 선호할 수 있다."
     },
     {
      "en": "Computers are always objective because they follow mathematical rules, not feelings.",
      "ko": "컴퓨터는 감정이 아니라 수학적 규칙을 따르므로 항상 객관적이다."
     },
     {
      "en": "Artificial intelligence will change many jobs in the near future.",
      "ko": "인공지능은 가까운 미래에 많은 직업을 바꿀 것이다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text argues that AI copies unfair patterns from its training data, so the data must be checked. The other choices give only one example, repeat the belief the text rejects, or make a general prediction the text does not discuss.",
     "ko": "글은 인공지능이 학습 데이터 속 불공정한 패턴을 그대로 따라 하므로 데이터를 점검해야 한다고 주장해요. 나머지 선택지는 예시 하나만 말하거나, 글이 반박하는 믿음을 반복하거나, 글이 다루지 않는 일반적인 예측이에요."
    }
   },
   "words": [
    {
     "en": "objective",
     "ko": "객관적인"
    },
    {
     "en": "bias",
     "ko": "편향, 편견"
    },
    {
     "en": "discriminate",
     "ko": "차별하다"
    }
   ],
   "summary": {
    "ko": "인공지능의 편향은 기계 자체가 아니라 불공정함이 담긴 학습 데이터에서 비롯된다.",
    "en": "AI bias comes not from the machine itself but from unfair data it learns from.",
    "keywords": [
     "bias",
     "machine",
     "data"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-07",
   "genre": "info",
   "title": {
    "en": "Cooling Cities with Green Spaces",
    "ko": "녹지로 도시를 식히기"
   },
   "topic": {
    "en": "Environment",
    "ko": "환경"
   },
   "bg": {
    "en": "As early as the 1810s, the English scientist Luke Howard recorded that London was warmer than the countryside around it.",
    "ko": "이미 1810년대에 영국의 과학자 루크 하워드는 런던이 주변 시골보다 더 따뜻하다는 사실을 기록했다."
   },
   "sentences": [
    {
     "en": "On a hot summer day, the center of a large city can feel much warmer than the countryside nearby.",
     "ko": "더운 여름날, 대도시의 중심부는 근처 시골보다 훨씬 더 덥게 느껴질 수 있다."
    },
    {
     "en": "This phenomenon is known as the urban heat island effect.",
     "ko": "이 현상은 도시 열섬 효과라고 알려져 있다."
    },
    {
     "en": "Cities are full of asphalt roads, concrete buildings, and dark rooftops that absorb sunlight during the day.",
     "ko": "도시는 낮 동안 햇빛을 흡수하는 아스팔트 도로, 콘크리트 건물, 어두운 색의 지붕으로 가득하다."
    },
    {
     "en": "These surfaces release the stored heat slowly, keeping cities warm even at night.",
     "ko": "이러한 표면은 저장된 열을 천천히 내보내 밤에도 도시를 따뜻하게 유지한다."
    },
    {
     "en": "Heat from cars, factories, and air conditioners adds to the problem.",
     "ko": "자동차, 공장, 에어컨에서 나오는 열도 문제를 키운다."
    },
    {
     "en": "In addition, cities have fewer trees and less exposed soil, so there is less natural cooling.",
     "ko": "게다가 도시에는 나무와 드러난 흙이 적어서 자연적인 냉각 작용이 적다."
    },
    {
     "en": "Plants cool the air in two main ways.",
     "ko": "식물은 크게 두 가지 방식으로 공기를 식힌다."
    },
    {
     "en": "Their leaves provide shade, preventing sunlight from reaching the ground.",
     "ko": "잎은 그늘을 만들어 햇빛이 땅에 닿는 것을 막는다."
    },
    {
     "en": "They also release water vapor through their leaves, a process that takes heat from the surrounding air.",
     "ko": "또한 식물은 잎을 통해 수증기를 내보내는데, 이 과정은 주변 공기에서 열을 빼앗는다."
    },
    {
     "en": "For this reason, parks are often noticeably cooler than the streets around them.",
     "ko": "이런 이유로 공원은 주변 거리보다 눈에 띄게 시원한 경우가 많다."
    },
    {
     "en": "Some cities are planting street trees, creating rooftop gardens, and restoring streams to lower temperatures.",
     "ko": "일부 도시들은 기온을 낮추기 위해 가로수를 심고, 옥상 정원을 만들고, 하천을 복원하고 있다."
    },
    {
     "en": "Cheonggyecheon in Seoul, a stream restored in 2005, is often cited as an example of this approach.",
     "ko": "2005년에 복원된 서울의 청계천은 이러한 접근 방식의 사례로 자주 언급된다."
    },
    {
     "en": "Therefore, expanding green spaces is one of the most effective ways for cities to fight the heat island effect.",
     "ko": "따라서 녹지를 넓히는 것은 도시가 열섬 효과에 맞서는 가장 효과적인 방법 중 하나이다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The text first explains what causes urban heat islands and how plants cool the air. The final sentence, beginning with 'Therefore', draws the conclusion that all these facts lead to: green spaces are a key solution.",
    "ko": "글은 먼저 도시 열섬의 원인과 식물이 공기를 식히는 방식을 설명해요. 'Therefore'로 시작하는 마지막 문장이 이 모든 사실에서 나오는 결론, 즉 녹지가 핵심 해결책이라는 점을 제시해요."
   },
   "main": {
    "options": [
     {
      "en": "Expanding green spaces is an effective way to reduce heat in cities.",
      "ko": "녹지를 넓히는 것은 도시의 열기를 줄이는 효과적인 방법이다."
     },
     {
      "en": "Cheonggyecheon in Seoul was restored as a stream in 2005.",
      "ko": "서울의 청계천은 2005년에 하천으로 복원되었다."
     },
     {
      "en": "Green spaces have little effect on city temperatures compared to air conditioners.",
      "ko": "녹지는 에어컨에 비해 도시 기온에 거의 영향을 주지 않는다."
     },
     {
      "en": "Large cities offer more jobs and services than the countryside.",
      "ko": "대도시는 시골보다 더 많은 일자리와 서비스를 제공한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains why cities get hot and how plants cool them, leading to the claim that green spaces are an effective solution. The other choices give one example, reverse the claim, or state something unrelated to the argument.",
     "ko": "글은 도시가 더워지는 이유와 식물이 도시를 식히는 방식을 설명하며, 녹지가 효과적인 해결책이라는 주장으로 이어져요. 나머지 선택지는 예시 하나만 말하거나, 주장을 뒤집거나, 논지와 관계없는 내용이에요."
    }
   },
   "words": [
    {
     "en": "phenomenon",
     "ko": "현상"
    },
    {
     "en": "absorb",
     "ko": "흡수하다"
    },
    {
     "en": "surrounding",
     "ko": "주변의, 둘러싼"
    }
   ],
   "summary": {
    "ko": "녹지를 늘리는 것은 도시의 열섬 현상을 줄이는 효과적인 방법이다.",
    "en": "Increasing green spaces is an effective way to reduce the heat island effect in cities.",
    "keywords": [
     "green",
     "heat",
     "cities"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-08",
   "genre": "info",
   "title": {
    "en": "The Power of Belief: The Placebo Effect",
    "ko": "믿음의 힘: 플라세보 효과"
   },
   "topic": {
    "en": "Psychology",
    "ko": "심리"
   },
   "bg": {
    "en": "The word placebo comes from Latin and means I shall please.",
    "ko": "플라세보(placebo)라는 단어는 라틴어에서 왔으며 '나는 기쁘게 할 것이다'라는 뜻이다."
   },
   "sentences": [
    {
     "en": "In medical research, some patients are given a pill that contains no active medicine, such as a sugar pill.",
     "ko": "의학 연구에서 일부 환자들은 설탕 알약처럼 유효 성분이 전혀 없는 약을 받는다."
    },
    {
     "en": "This fake treatment is called a placebo.",
     "ko": "이 가짜 치료를 플라세보(위약)라고 부른다."
    },
    {
     "en": "Surprisingly, many patients who take a placebo report that they feel better.",
     "ko": "놀랍게도 플라세보를 먹은 많은 환자들이 몸이 나아졌다고 말한다."
    },
    {
     "en": "Their pain may decrease, or they may sleep more easily, even though the pill itself does nothing.",
     "ko": "알약 자체는 아무 작용도 하지 않는데도 통증이 줄어들거나 잠을 더 쉽게 잘 수도 있다."
    },
    {
     "en": "This is known as the placebo effect.",
     "ko": "이것을 플라세보 효과라고 한다."
    },
    {
     "en": "Scientists believe it happens partly because of expectation: when people expect to improve, the brain can release natural chemicals that reduce pain.",
     "ko": "과학자들은 이것이 부분적으로 기대 때문에 일어난다고 본다. 사람들이 나아질 거라고 기대하면 뇌가 통증을 줄이는 천연 화학 물질을 분비할 수 있다는 것이다."
    },
    {
     "en": "The setting of treatment matters too, as a caring doctor and a familiar medical routine can make people feel more confident.",
     "ko": "치료 환경도 중요한데, 친절한 의사와 익숙한 진료 절차가 사람들에게 더 큰 확신을 줄 수 있기 때문이다."
    },
    {
     "en": "However, the placebo effect has clear limits.",
     "ko": "하지만 플라세보 효과에는 분명한 한계가 있다."
    },
    {
     "en": "It can ease symptoms like pain or stress, but it cannot shrink a tumor or cure an infection.",
     "ko": "그것은 통증이나 스트레스 같은 증상은 덜어 줄 수 있지만, 종양을 줄이거나 감염을 치료하지는 못한다."
    },
    {
     "en": "That is why new drugs are tested against placebos, so researchers can see whether a medicine works better than belief alone.",
     "ko": "그래서 신약은 플라세보와 비교하여 시험되는데, 그래야 연구자들이 그 약이 단순한 믿음보다 더 효과가 있는지 확인할 수 있다."
    },
    {
     "en": "What the placebo effect reveals, then, is that the mind can influence how the body feels, though it cannot replace real medicine.",
     "ko": "그렇다면 플라세보 효과가 보여 주는 것은, 마음이 몸의 느낌에 영향을 줄 수는 있지만 진짜 약을 대신할 수는 없다는 사실이다."
    }
   ],
   "key": 10,
   "keyWhy": {
    "en": "The text first describes the power of the placebo effect, then turns with 'However' to its limits. The last sentence, with the phrase 'What the placebo effect reveals, then,' combines both sides into the main idea.",
    "ko": "글은 먼저 플라세보 효과의 힘을 설명한 뒤 'However'로 그 한계로 넘어가요. 'What the placebo effect reveals, then'으로 시작하는 마지막 문장이 두 측면을 하나로 묶어 핵심 내용을 제시해요."
   },
   "main": {
    "options": [
     {
      "en": "The mind can influence how the body feels, but belief cannot replace real medicine.",
      "ko": "마음은 몸이 느끼는 방식에 영향을 줄 수 있지만, 믿음이 진짜 약을 대신할 수는 없다."
     },
     {
      "en": "New drugs are tested against placebos in medical research.",
      "ko": "의학 연구에서 신약은 플라세보와 비교하여 시험된다."
     },
     {
      "en": "Placebos can cure serious diseases as well as real medicine can.",
      "ko": "플라세보는 진짜 약만큼 심각한 질병을 잘 치료할 수 있다."
     },
     {
      "en": "Doctors should always be kind and caring toward their patients.",
      "ko": "의사는 항상 환자에게 친절하고 배려심 있게 대해야 한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text shows both the power and the limits of the placebo effect and concludes that belief helps but cannot replace medicine. The other choices give one detail, reverse the claim, or offer advice the text does not argue.",
     "ko": "글은 플라세보 효과의 힘과 한계를 함께 보여 주며, 믿음이 도움은 되지만 약을 대신할 수는 없다고 결론 내려요. 나머지 선택지는 세부 내용 하나만 말하거나, 주장을 뒤집거나, 글이 주장하지 않는 조언이에요."
    }
   },
   "words": [
    {
     "en": "placebo",
     "ko": "위약, 플라세보"
    },
    {
     "en": "expectation",
     "ko": "기대"
    },
    {
     "en": "symptoms",
     "ko": "증상"
    }
   ],
   "summary": {
    "ko": "마음은 몸이 느끼는 방식에 영향을 줄 수 있지만 진짜 약을 대신할 수는 없다.",
    "en": "The mind can affect how the body feels, but it cannot replace real medicine.",
    "keywords": [
     "mind",
     "body",
     "medicine"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-09",
   "genre": "info",
   "title": {
    "en": "Tiny Plastics, Big Problem",
    "ko": "작은 플라스틱, 큰 문제"
   },
   "topic": {
    "en": "Environment",
    "ko": "환경"
   },
   "bg": {
    "en": "Microplastics have been found even in Arctic sea ice and in animals living in the Mariana Trench, the deepest part of the ocean.",
    "ko": "미세플라스틱은 북극의 바다 얼음과 바다에서 가장 깊은 곳인 마리아나 해구에 사는 동물들에게서도 발견되었다."
   },
   "sentences": [
    {
     "en": "Every year, millions of tons of plastic waste enter the ocean.",
     "ko": "매년 수백만 톤의 플라스틱 쓰레기가 바다로 흘러든다."
    },
    {
     "en": "Much of this plastic does not disappear but breaks into tiny pieces called microplastics, which pose a growing threat to marine life.",
     "ko": "이 플라스틱의 상당 부분은 사라지지 않고 미세플라스틱이라는 아주 작은 조각으로 부서지며, 이는 해양 생물에게 점점 커지는 위협이 되고 있다."
    },
    {
     "en": "Microplastics are usually defined as pieces smaller than five millimeters.",
     "ko": "미세플라스틱은 보통 크기가 5밀리미터보다 작은 조각으로 정의된다."
    },
    {
     "en": "Some come from larger items, such as bottles and bags, that are broken down by sunlight and waves.",
     "ko": "일부는 병이나 봉지 같은 큰 물건이 햇빛과 파도에 의해 잘게 부서져 생긴다."
    },
    {
     "en": "Others are tiny from the start, including fibers released when synthetic clothes are washed.",
     "ko": "다른 일부는 처음부터 아주 작은데, 합성 섬유 옷을 세탁할 때 빠져나오는 섬유가 그 예이다."
    },
    {
     "en": "Because they are so small, microplastics are almost impossible to remove from the water.",
     "ko": "미세플라스틱은 너무 작기 때문에 물에서 제거하는 것이 거의 불가능하다."
    },
    {
     "en": "Fish, shellfish, and even plankton often mistake them for food.",
     "ko": "물고기, 조개류, 심지어 플랑크톤도 종종 그것을 먹이로 착각한다."
    },
    {
     "en": "Eating plastic can harm their digestion and growth, and the particles may carry harmful chemicals.",
     "ko": "플라스틱을 먹으면 소화와 성장에 해를 입을 수 있고, 그 입자에는 해로운 화학 물질이 묻어 있을 수도 있다."
    },
    {
     "en": "These particles can also move up the food chain, as small animals are eaten by larger ones.",
     "ko": "작은 동물이 더 큰 동물에게 먹히면서 이 입자들은 먹이 사슬을 따라 위로 이동할 수도 있다."
    },
    {
     "en": "Scientists have found microplastics in seafood and in sea salt, raising questions about effects on human health.",
     "ko": "과학자들은 해산물과 바다 소금에서도 미세플라스틱을 발견했으며, 이는 인간의 건강에 미칠 영향에 대한 의문을 불러일으키고 있다."
    },
    {
     "en": "Since cleaning them up is so difficult, the most effective solution is to stop plastic from reaching the ocean in the first place.",
     "ko": "이를 치우는 것이 매우 어렵기 때문에, 가장 효과적인 해결책은 애초에 플라스틱이 바다에 이르지 못하게 하는 것이다."
    },
    {
     "en": "Using less single-use plastic and improving waste management are important first steps.",
     "ko": "일회용 플라스틱 사용을 줄이고 쓰레기 관리를 개선하는 것이 중요한 첫걸음이다."
    }
   ],
   "key": 1,
   "keyWhy": {
    "en": "After a short opening fact, the next sentence states the main idea: microplastics are a growing threat to marine life. The following sentences explain where they come from, how they harm animals, and what we can do about them.",
    "ko": "짧은 도입 사실 다음에 오는 문장이 핵심 내용, 즉 미세플라스틱이 해양 생물에게 점점 커지는 위협이라는 점을 말해요. 이어지는 문장들은 미세플라스틱이 어디서 생기는지, 동물에게 어떤 해를 끼치는지, 우리가 무엇을 할 수 있는지 설명해요."
   },
   "main": {
    "options": [
     {
      "en": "Microplastics are a growing threat to ocean life and are very hard to remove.",
      "ko": "미세플라스틱은 해양 생물에게 점점 커지는 위협이며 제거하기가 매우 어렵다."
     },
     {
      "en": "Microplastics are defined as plastic pieces smaller than five millimeters.",
      "ko": "미세플라스틱은 5밀리미터보다 작은 플라스틱 조각으로 정의된다."
     },
     {
      "en": "Plastic in the ocean breaks down quickly and causes little lasting harm.",
      "ko": "바다의 플라스틱은 빠르게 분해되어 지속적인 해를 거의 끼치지 않는다."
     },
     {
      "en": "The ocean is home to a wide variety of plants and animals.",
      "ko": "바다는 매우 다양한 동식물의 서식지이다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains how microplastics form, harm sea creatures, and resist cleanup. The other choices give only a definition, reverse the claim, or state a general fact the text does not argue.",
     "ko": "글은 미세플라스틱이 어떻게 생기고, 바다 생물에게 해를 끼치며, 치우기 어려운지 설명해요. 나머지 선택지는 정의만 말하거나, 주장을 뒤집거나, 글이 주장하지 않는 일반적인 사실이에요."
    }
   },
   "words": [
    {
     "en": "marine",
     "ko": "해양의, 바다의"
    },
    {
     "en": "synthetic",
     "ko": "합성의"
    },
    {
     "en": "particles",
     "ko": "입자"
    }
   ],
   "summary": {
    "ko": "바다로 흘러든 플라스틱이 미세플라스틱이 되어 해양 생물을 위협하므로 플라스틱 유입을 막아야 한다.",
    "en": "Microplastics threaten marine life, so we must stop plastic from reaching the ocean.",
    "keywords": [
     "microplastics",
     "marine",
     "ocean"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-10",
   "genre": "info",
   "title": {
    "en": "Learning from Failure",
    "ko": "실패에서 배우기"
   },
   "topic": {
    "en": "Education",
    "ko": "교육"
   },
   "bg": {
    "en": "Carol Dweck's book Mindset: The New Psychology of Success, published in 2006, made the idea of a growth mindset popular around the world.",
    "ko": "2006년에 출간된 캐럴 드웩의 책 '마인드셋'은 성장 마인드셋이라는 개념을 전 세계에 널리 알렸다."
   },
   "sentences": [
    {
     "en": "Many students see failure as proof that they are not smart enough.",
     "ko": "많은 학생들은 실패를 자신이 충분히 똑똑하지 않다는 증거로 여긴다."
    },
    {
     "en": "When they get a low test score, they may decide that they are simply bad at math or science.",
     "ko": "시험 점수가 낮게 나오면 그들은 자신이 그냥 수학이나 과학을 못한다고 단정할지도 모른다."
    },
    {
     "en": "This belief can make them avoid challenges, because trying something hard risks another failure.",
     "ko": "어려운 일을 시도하면 또다시 실패할 위험이 있기 때문에, 이런 믿음은 그들이 도전을 피하게 만들 수 있다."
    },
    {
     "en": "However, research on learning suggests that mistakes are a necessary part of getting better.",
     "ko": "그러나 학습에 관한 연구는 실수가 발전하는 데 꼭 필요한 부분이라는 것을 보여 준다."
    },
    {
     "en": "Psychologist Carol Dweck describes two ways of thinking about ability.",
     "ko": "심리학자 캐럴 드웩은 능력에 대한 두 가지 사고방식을 설명한다."
    },
    {
     "en": "People with a fixed mindset believe intelligence cannot change much, while people with a growth mindset believe it can develop through effort and good strategies.",
     "ko": "고정 마인드셋을 가진 사람들은 지능이 크게 바뀌지 않는다고 믿는 반면, 성장 마인드셋을 가진 사람들은 노력과 좋은 전략을 통해 지능이 발전할 수 있다고 믿는다."
    },
    {
     "en": "Students with a growth mindset tend to view a mistake as useful information rather than a final judgment.",
     "ko": "성장 마인드셋을 가진 학생들은 실수를 최종 판정이 아니라 유용한 정보로 보는 경향이 있다."
    },
    {
     "en": "They ask what went wrong and how they could approach the problem differently next time.",
     "ko": "그들은 무엇이 잘못되었는지, 그리고 다음에는 그 문제에 어떻게 다르게 접근할 수 있을지 묻는다."
    },
    {
     "en": "In fact, struggling with a difficult problem often helps people remember the solution better later.",
     "ko": "실제로 어려운 문제와 씨름하는 것은 나중에 그 해법을 더 잘 기억하는 데 도움이 되는 경우가 많다."
    },
    {
     "en": "Of course, effort alone is not enough; learners also need feedback and new methods.",
     "ko": "물론 노력만으로는 충분하지 않으며, 학습자에게는 피드백과 새로운 방법도 필요하다."
    },
    {
     "en": "Still, treating failure as a step in the process makes people more willing to take on challenges.",
     "ko": "그래도 실패를 과정의 한 단계로 받아들이면 사람들은 도전에 더 기꺼이 나서게 된다."
    },
    {
     "en": "Over time, this willingness leads to deeper and longer-lasting learning.",
     "ko": "시간이 지나면 이러한 의지가 더 깊고 오래가는 학습으로 이어진다."
    }
   ],
   "key": 3,
   "keyWhy": {
    "en": "The text opens with a common but mistaken view of failure. 'However' signals the author's real claim: mistakes are a necessary part of improving. The growth mindset research that follows supports it.",
    "ko": "글은 실패에 대한 흔하지만 잘못된 생각으로 시작해요. 'However'는 글쓴이의 진짜 주장, 즉 실수가 발전에 꼭 필요한 부분이라는 내용이 나온다는 신호예요. 뒤따르는 성장 마인드셋 연구가 이 주장을 뒷받침해요."
   },
   "main": {
    "options": [
     {
      "en": "Mistakes and failures are a necessary and valuable part of the learning process.",
      "ko": "실수와 실패는 학습 과정에서 꼭 필요하고 가치 있는 부분이다."
     },
     {
      "en": "Carol Dweck describes two different mindsets about intelligence and ability.",
      "ko": "캐럴 드웩은 지능과 능력에 대한 두 가지 다른 마인드셋을 설명한다."
     },
     {
      "en": "Failing a test shows that a student lacks natural ability in that subject.",
      "ko": "시험에 떨어지는 것은 학생이 그 과목에 타고난 능력이 부족하다는 것을 보여 준다."
     },
     {
      "en": "Students should study hard every day to get good grades.",
      "ko": "학생들은 좋은 성적을 얻기 위해 매일 열심히 공부해야 한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text argues that failure is not proof of low ability but a useful step toward learning. The other choices give one detail, repeat the mistaken view the text rejects, or offer general advice the text does not argue.",
     "ko": "글은 실패가 능력 부족의 증거가 아니라 배움으로 가는 유용한 단계라고 주장해요. 나머지 선택지는 세부 내용 하나만 말하거나, 글이 반박하는 잘못된 생각을 반복하거나, 글이 주장하지 않는 일반적인 조언이에요."
    }
   },
   "words": [
    {
     "en": "mindset",
     "ko": "사고방식, 마음가짐"
    },
    {
     "en": "intelligence",
     "ko": "지능"
    },
    {
     "en": "strategies",
     "ko": "전략"
    }
   ],
   "summary": {
    "ko": "실수와 실패는 배움에 꼭 필요하며 성장의 기회가 된다.",
    "en": "Mistakes and failures are a necessary part of learning and help us grow.",
    "keywords": [
     "mistakes",
     "failures",
     "learning"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-11",
   "genre": "info",
   "title": {
    "en": "Why Endangered Languages Matter",
    "ko": "사라져 가는 언어가 왜 중요할까"
   },
   "topic": {
    "en": "Culture",
    "ko": "문화"
   },
   "bg": {
    "en": "In 2010, UNESCO classified Jejueo, the traditional language of Jeju Island, as critically endangered.",
    "ko": "2010년 유네스코는 제주도의 전통 언어인 제주어를 소멸 위기 언어 중 가장 심각한 단계로 분류했다."
   },
   "sentences": [
    {
     "en": "There are about 7,000 languages spoken in the world today, but many of them are in danger of disappearing.",
     "ko": "오늘날 세계에는 약 7,000개의 언어가 쓰이고 있지만, 그중 많은 언어가 사라질 위기에 놓여 있다."
    },
    {
     "en": "Some have only a few elderly speakers left, and children are no longer learning them.",
     "ko": "어떤 언어는 나이 든 사용자 몇 명만 남아 있고, 아이들은 더 이상 그 언어를 배우지 않는다."
    },
    {
     "en": "When a language disappears, what exactly is lost?",
     "ko": "한 언어가 사라질 때 정확히 무엇을 잃게 되는 것일까?"
    },
    {
     "en": "Each language contains a unique way of understanding the world, built up over many generations.",
     "ko": "각 언어에는 여러 세대에 걸쳐 쌓아 온 고유한 세계 이해 방식이 담겨 있다."
    },
    {
     "en": "For example, many indigenous languages have detailed words for local plants, animals, and weather patterns.",
     "ko": "예를 들어, 많은 토착 언어에는 그 지역의 식물, 동물, 날씨 변화를 가리키는 세밀한 단어들이 있다."
    },
    {
     "en": "This knowledge can be valuable to scientists studying medicine or the environment.",
     "ko": "이러한 지식은 의학이나 환경을 연구하는 과학자들에게 귀중할 수 있다."
    },
    {
     "en": "Languages also carry stories, songs, and traditions that give a community its identity.",
     "ko": "언어는 또한 공동체에 정체성을 부여하는 이야기, 노래, 전통을 담고 있다."
    },
    {
     "en": "When young people lose their ancestors' language, they may feel cut off from their own history.",
     "ko": "젊은이들이 조상의 언어를 잃으면 자신의 역사와 단절된 느낌을 받을 수 있다."
    },
    {
     "en": "In addition, comparing many different languages helps linguists understand how the human mind works.",
     "ko": "게다가 여러 다양한 언어를 비교하는 것은 언어학자들이 인간의 마음이 어떻게 작동하는지 이해하는 데 도움이 된다."
    },
    {
     "en": "Fortunately, some communities are working to revive their languages through schools, recordings, and apps.",
     "ko": "다행히 일부 공동체는 학교, 녹음, 앱을 통해 자신들의 언어를 되살리려 노력하고 있다."
    },
    {
     "en": "Hawaiian, for instance, was once spoken by very few children, but immersion schools have helped bring it back into daily life.",
     "ko": "예를 들어 하와이어는 한때 이 언어를 쓰는 아이가 매우 적었지만, 몰입식 학교 덕분에 다시 일상생활 속으로 돌아오게 되었다."
    },
    {
     "en": "Protecting endangered languages, therefore, means protecting human knowledge and cultural diversity.",
     "ko": "따라서 사라질 위기의 언어를 보호하는 것은 인류의 지식과 문화적 다양성을 보호하는 일이다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "The question in the middle sets up the topic, and the following sentences give reasons and examples. The last sentence, with 'therefore', answers the question and states the author's main claim.",
    "ko": "중간의 질문이 글의 주제를 던지고, 이어지는 문장들이 이유와 예시를 제시해요. 'therefore'가 들어간 마지막 문장이 그 질문에 답하며 글쓴이의 핵심 주장을 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Protecting endangered languages helps preserve human knowledge and cultural diversity.",
      "ko": "사라질 위기의 언어를 보호하는 것은 인류의 지식과 문화적 다양성을 지키는 데 도움이 된다."
     },
     {
      "en": "Hawaiian has been revived through immersion schools for children.",
      "ko": "하와이어는 아이들을 위한 몰입식 학교를 통해 되살아났다."
     },
     {
      "en": "Losing small languages is natural and causes little real loss to humanity.",
      "ko": "작은 언어가 사라지는 것은 자연스러운 일이며 인류에게 실질적인 손실은 거의 없다."
     },
     {
      "en": "Learning a foreign language is useful for finding a good job.",
      "ko": "외국어를 배우는 것은 좋은 직업을 구하는 데 유용하다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text gives several reasons why losing a language means losing knowledge and identity, and concludes that these languages must be protected. The other choices give one example, reverse the claim, or discuss a different topic.",
     "ko": "글은 언어를 잃는 것이 지식과 정체성을 잃는 것인 이유를 여러 가지 제시하고, 이런 언어를 보호해야 한다고 결론 내려요. 나머지 선택지는 예시 하나만 말하거나, 주장을 뒤집거나, 다른 주제를 다뤄요."
    }
   },
   "words": [
    {
     "en": "indigenous",
     "ko": "토착의, 원주민의"
    },
    {
     "en": "identity",
     "ko": "정체성"
    },
    {
     "en": "diversity",
     "ko": "다양성"
    }
   ],
   "summary": {
    "ko": "사라져 가는 언어를 지키는 것은 인류의 지식과 문화적 다양성을 지키는 일이다.",
    "en": "Protecting endangered languages means protecting human knowledge and cultural diversity.",
    "keywords": [
     "languages",
     "knowledge",
     "diversity"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-12",
   "genre": "info",
   "title": {
    "en": "Clean Energy and the Storage Challenge",
    "ko": "청정에너지와 저장의 과제"
   },
   "topic": {
    "en": "Science",
    "ko": "과학"
   },
   "bg": {
    "en": "Solar panels work through the photovoltaic effect, which the French physicist Edmond Becquerel first observed in 1839.",
    "ko": "태양광 패널은 광전 효과(광기전력 효과)를 이용해 작동하는데, 이 현상은 1839년 프랑스 물리학자 에드몽 베크렐이 처음 관찰했다."
   },
   "sentences": [
    {
     "en": "Solar and wind power are often praised as the energy sources of the future.",
     "ko": "태양광과 풍력은 흔히 미래의 에너지원으로 칭송받는다."
    },
    {
     "en": "They produce electricity without burning fuel, so they release almost no greenhouse gases while operating.",
     "ko": "이들은 연료를 태우지 않고 전기를 만들기 때문에 가동 중에는 온실가스를 거의 배출하지 않는다."
    },
    {
     "en": "Once panels and turbines are built, sunlight and wind are also free.",
     "ko": "일단 패널과 터빈을 세우고 나면 햇빛과 바람은 무료이기도 하다."
    },
    {
     "en": "However, these sources have an important weakness: they do not produce power all the time.",
     "ko": "그러나 이 에너지원들에는 중요한 약점이 있다. 항상 전력을 생산하지는 않는다는 것이다."
    },
    {
     "en": "Solar panels generate nothing at night and less on cloudy days, and wind turbines slow down when the wind is calm.",
     "ko": "태양광 패널은 밤에는 전혀 전기를 만들지 못하고 흐린 날에는 덜 만들며, 풍력 터빈은 바람이 잔잔하면 느려진다."
    },
    {
     "en": "Yet people need electricity every hour, whether the weather cooperates or not.",
     "ko": "하지만 사람들은 날씨가 도와주든 그렇지 않든 매시간 전기가 필요하다."
    },
    {
     "en": "For this reason, the key to relying on renewable energy is finding ways to store power and balance supply.",
     "ko": "이런 이유로 재생 에너지에 의존하기 위한 핵심은 전력을 저장하고 공급의 균형을 맞추는 방법을 찾는 것이다."
    },
    {
     "en": "Large batteries can save extra electricity on sunny or windy days and release it later.",
     "ko": "대형 배터리는 햇빛이 강하거나 바람이 많은 날에 남는 전기를 저장했다가 나중에 내보낼 수 있다."
    },
    {
     "en": "Pumped hydro storage uses surplus power to pump water uphill, then lets it flow down through turbines when demand rises.",
     "ko": "양수 발전은 남는 전력으로 물을 높은 곳으로 끌어올린 뒤, 수요가 늘어날 때 그 물을 터빈으로 흘려보낸다."
    },
    {
     "en": "Connecting power grids across wide areas also helps, since the wind may be blowing in one region while it is calm in another.",
     "ko": "넓은 지역의 전력망을 연결하는 것도 도움이 되는데, 한 지역은 바람이 잔잔해도 다른 지역에서는 바람이 불고 있을 수 있기 때문이다."
    },
    {
     "en": "These solutions are becoming cheaper, but they still require major investment.",
     "ko": "이러한 해결책들은 점점 저렴해지고 있지만, 여전히 막대한 투자가 필요하다."
    },
    {
     "en": "As storage technology improves, solar and wind can supply a larger share of the world's electricity.",
     "ko": "저장 기술이 발전할수록 태양광과 풍력은 세계 전기의 더 큰 몫을 공급할 수 있을 것이다."
    }
   ],
   "key": 6,
   "keyWhy": {
    "en": "The text first praises solar and wind, then turns with 'However' to their weakness. The phrase 'For this reason, the key...' signals the main claim, and the examples of batteries, pumped hydro, and connected grids support it.",
    "ko": "글은 먼저 태양광과 풍력의 장점을 말한 뒤 'However'로 그 약점으로 넘어가요. 'For this reason, the key...'라는 표현이 핵심 주장을 알려 주는 신호이고, 배터리, 양수 발전, 전력망 연결의 예가 이를 뒷받침해요."
   },
   "main": {
    "options": [
     {
      "en": "To rely on solar and wind power, we must find good ways to store energy.",
      "ko": "태양광과 풍력에 의존하려면 에너지를 저장하는 좋은 방법을 찾아야 한다."
     },
     {
      "en": "Pumped hydro storage pumps water uphill using extra electricity.",
      "ko": "양수 발전은 남는 전기를 이용해 물을 높은 곳으로 끌어올린다."
     },
     {
      "en": "Solar and wind power can supply steady electricity at all times without storage.",
      "ko": "태양광과 풍력은 저장 없이도 언제나 안정적으로 전기를 공급할 수 있다."
     },
     {
      "en": "Everyone should try to use less electricity at home every day.",
      "ko": "모든 사람은 매일 집에서 전기를 덜 쓰도록 노력해야 한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text argues that solar and wind are clean but unreliable on their own, so storage and balancing are essential. The other choices give one example, reverse the claim, or offer advice the text does not discuss.",
     "ko": "글은 태양광과 풍력이 깨끗하지만 그 자체로는 공급이 불안정하므로 저장과 균형 조절이 꼭 필요하다고 주장해요. 나머지 선택지는 예시 하나만 말하거나, 주장을 뒤집거나, 글이 다루지 않는 조언이에요."
    }
   },
   "words": [
    {
     "en": "renewable",
     "ko": "재생 가능한"
    },
    {
     "en": "surplus",
     "ko": "남는, 잉여의"
    },
    {
     "en": "investment",
     "ko": "투자"
    }
   ],
   "summary": {
    "ko": "태양광과 풍력은 깨끗하지만 공급이 들쭉날쭉하므로 전력 저장 기술이 핵심이다.",
    "en": "Solar and wind power are clean but variable, so energy storage is the key.",
    "keywords": [
     "solar",
     "wind",
     "storage"
    ]
   }
  }
 ]
};
