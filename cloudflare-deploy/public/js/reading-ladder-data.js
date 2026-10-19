/* 📚 영어 독서 사다리 — 글 정본 (2026-10-18). 화면: /stories.html · 엔진: /js/reading-ladder.js
   단계 4개 · 1·2단계 48편 · 3단계 38편 · 4단계 42편(2026-10-19 확장 · 2026-10-19 176편 모두 그림 동화책 /story-<id>.html 이 있다 — 그림책이 없는 글이 생기면 book:false 를 달 것). 한 편 = 문장별 영어·우리말 · 핵심 문장 번호(key) · 중심 내용 보기 4개(answer 는 정답 번호 — 화면이 섞음)
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
   "stage": 1,
   "id": "s1-13",
   "genre": "story",
   "title": {
    "en": "The Alien in My Backyard",
    "ko": "우리 집 마당의 외계인"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Scientists are still looking for life somewhere in space.",
    "ko": "과학자들은 지금도 우주 어딘가에 생명이 있는지 찾고 있어요."
   },
   "sentences": [
    {
     "en": "Bang! Something falls into my backyard at night.",
     "ko": "쾅! 밤에 무언가가 우리 집 마당에 떨어진다."
    },
    {
     "en": "I run outside with a flashlight.",
     "ko": "나는 손전등을 들고 밖으로 뛰어나간다."
    },
    {
     "en": "It is a tiny spaceship!",
     "ko": "조그만 우주선이다!"
    },
    {
     "en": "The door opens, and a little green alien comes out.",
     "ko": "문이 열리고, 작은 초록색 외계인이 나온다."
    },
    {
     "en": "He has three eyes, and he is crying.",
     "ko": "외계인은 눈이 세 개이고, 울고 있다."
    },
    {
     "en": "\"My ship is broken,\" he says.",
     "ko": "\"내 우주선이 고장 났어.\" 외계인이 말한다."
    },
    {
     "en": "I give him my toy wrench.",
     "ko": "나는 장난감 스패너를 건네준다."
    },
    {
     "en": "Zap! The ship works again.",
     "ko": "지지직! 우주선이 다시 움직인다."
    },
    {
     "en": "\"Thank you, Earth friend!\" he says, and he flies up to the stars.",
     "ko": "\"고마워, 지구 친구!\" 외계인은 말하고 별을 향해 날아간다."
    },
    {
     "en": "I helped an alien go home!",
     "ko": "내가 외계인이 집에 가도록 도와주었다!"
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence sums up the whole story: I helped the alien get home.",
    "ko": "이 글 전체를 한마디로 정리하는 문장이에요. 내가 외계인이 집에 가도록 도왔다는 내용이에요."
   },
   "main": {
    "options": [
     {
      "en": "An alien breaks my toy wrench.",
      "ko": "외계인이 내 장난감 스패너를 망가뜨린다."
     },
     {
      "en": "I help a lost alien fix his ship and go home.",
      "ko": "나는 길 잃은 외계인이 우주선을 고쳐 집에 가도록 돕는다."
     },
     {
      "en": "I fly to the stars in a spaceship.",
      "ko": "나는 우주선을 타고 별로 날아간다."
     },
     {
      "en": "The alien wants to live in my house.",
      "ko": "외계인이 우리 집에서 살고 싶어 한다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The story is about fixing the alien's broken ship so he can go home.",
     "ko": "외계인의 고장 난 우주선을 고쳐서 집에 돌려보내는 이야기예요."
    }
   },
   "words": [
    {
     "en": "flashlight",
     "ko": "손전등"
    },
    {
     "en": "spaceship",
     "ko": "우주선"
    },
    {
     "en": "broken",
     "ko": "고장 난"
    }
   ],
   "summary": {
    "ko": "나는 작은 외계인이 우주선을 고치도록 도왔다.",
    "en": "I helped a little alien fix his spaceship.",
    "keywords": [
     "helped",
     "alien",
     "spaceship"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-14",
   "genre": "story",
   "title": {
    "en": "Rocket to the Moon",
    "ko": "달까지 로켓 타고"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "On the Moon you weigh about six times less, so you can jump much higher.",
    "ko": "달에서는 몸이 지구보다 6배 가벼워서 훨씬 높이 뛸 수 있어요."
   },
   "sentences": [
    {
     "en": "Captain Mina gets into her rocket.",
     "ko": "미나 선장이 로켓에 올라탄다."
    },
    {
     "en": "3, 2, 1, blast off!",
     "ko": "3, 2, 1, 발사!"
    },
    {
     "en": "The rocket shoots up into the dark sky.",
     "ko": "로켓이 깜깜한 하늘로 솟아오른다."
    },
    {
     "en": "Earth gets smaller and smaller.",
     "ko": "지구가 점점 작아진다."
    },
    {
     "en": "Soon Mina lands on the Moon.",
     "ko": "곧 미나는 달에 내린다."
    },
    {
     "en": "On the Moon, she can jump very high!",
     "ko": "달에서는 아주 높이 뛸 수 있다!"
    },
    {
     "en": "She finds a shiny rock.",
     "ko": "미나는 반짝이는 돌을 찾는다."
    },
    {
     "en": "Suddenly, the rocket beeps. \"Low fuel!\"",
     "ko": "갑자기 로켓이 삐삐 울린다. \"연료 부족!\""
    },
    {
     "en": "Mina runs back and flies home just in time.",
     "ko": "미나는 서둘러 돌아가서 아슬아슬하게 집으로 날아온다."
    },
    {
     "en": "Her trip to the Moon is a great adventure!",
     "ko": "미나의 달 여행은 멋진 모험이다!"
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence tells what the whole trip was: a great adventure.",
    "ko": "달 여행 전체가 어떤 일이었는지 한마디로 말해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Mina has an exciting trip to the Moon and back.",
      "ko": "미나가 달에 다녀오는 신나는 여행을 한다."
     },
     {
      "en": "Mina cannot find her rocket.",
      "ko": "미나가 로켓을 찾지 못한다."
     },
     {
      "en": "Mina stays on the Moon forever.",
      "ko": "미나가 달에서 영원히 산다."
     },
     {
      "en": "Mina looks at the Moon from her bed.",
      "ko": "미나가 침대에서 달을 바라본다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Mina goes to the Moon, has fun, and gets home just in time.",
     "ko": "미나가 달에 가서 즐겁게 지내고 아슬아슬하게 집에 돌아오는 이야기예요."
    }
   },
   "words": [
    {
     "en": "rocket",
     "ko": "로켓"
    },
    {
     "en": "shiny",
     "ko": "반짝이는"
    },
    {
     "en": "adventure",
     "ko": "모험"
    }
   ],
   "summary": {
    "ko": "미나는 달에 갔다가 무사히 돌아왔다.",
    "en": "Mina went to the Moon and came back safely.",
    "keywords": [
     "mina",
     "moon",
     "safely"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-15",
   "genre": "story",
   "title": {
    "en": "The Dinosaur Egg",
    "ko": "공룡 알"
   },
   "topic": {
    "en": "Dinosaurs",
    "ko": "공룡"
   },
   "bg": {
    "en": "Some dinosaur eggs were as big as a soccer ball!",
    "ko": "어떤 공룡 알은 축구공만큼 컸대요!"
   },
   "sentences": [
    {
     "en": "Jay finds a big spotted egg in the woods.",
     "ko": "제이가 숲에서 커다란 점박이 알을 발견한다."
    },
    {
     "en": "He takes it home and keeps it warm.",
     "ko": "제이는 알을 집에 가져와서 따뜻하게 해 준다."
    },
    {
     "en": "That night, the egg goes crack, crack!",
     "ko": "그날 밤, 알이 쩍, 쩍 갈라진다!"
    },
    {
     "en": "A baby dinosaur comes out!",
     "ko": "아기 공룡이 나온다!"
    },
    {
     "en": "It eats all of Jay's broccoli.",
     "ko": "아기 공룡은 제이의 브로콜리를 몽땅 먹는다."
    },
    {
     "en": "Every day, it grows bigger and bigger.",
     "ko": "매일매일 점점 더 커진다."
    },
    {
     "en": "Soon its head hits the ceiling!",
     "ko": "곧 머리가 천장에 닿는다!"
    },
    {
     "en": "Jay takes it to the big dinosaur park.",
     "ko": "제이는 공룡을 넓은 공룡 공원에 데려간다."
    },
    {
     "en": "Now he visits his dino friend every Sunday.",
     "ko": "이제 제이는 일요일마다 공룡 친구를 만나러 간다."
    },
    {
     "en": "Jay's egg gave him the biggest friend in town!",
     "ko": "제이의 알 덕분에 동네에서 가장 큰 친구가 생겼다!"
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence shows how the egg changed Jay's life: he got a huge friend.",
    "ko": "알 하나가 제이에게 아주 큰 친구를 만들어 주었다는 것을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Jay cooks an egg for breakfast.",
      "ko": "제이가 아침으로 달걀 요리를 한다."
     },
     {
      "en": "Jay is afraid of dinosaurs.",
      "ko": "제이는 공룡을 무서워한다."
     },
     {
      "en": "A dinosaur comes out of an egg and becomes Jay's big friend.",
      "ko": "알에서 공룡이 나와 제이의 큰 친구가 된다."
     },
     {
      "en": "Jay plants broccoli in the woods.",
      "ko": "제이가 숲에 브로콜리를 심는다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "A baby dinosaur hatches from Jay's egg and grows into his big friend.",
     "ko": "제이의 알에서 아기 공룡이 나와 큰 친구가 되는 이야기예요."
    }
   },
   "words": [
    {
     "en": "egg",
     "ko": "알"
    },
    {
     "en": "dinosaur",
     "ko": "공룡"
    },
    {
     "en": "ceiling",
     "ko": "천장"
    }
   ],
   "summary": {
    "ko": "제이가 찾은 알에서 아기 공룡이 나왔다.",
    "en": "A baby dinosaur came out of the egg Jay found.",
    "keywords": [
     "dinosaur",
     "egg",
     "jay"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-16",
   "genre": "story",
   "title": {
    "en": "My Robot Ate My Homework",
    "ko": "로봇이 내 숙제를 먹었어"
   },
   "topic": {
    "en": "Robots & Tech",
    "ko": "로봇과 기술"
   },
   "bg": {
    "en": "Real robot vacuums remember the shape of a room to find their way.",
    "ko": "진짜 로봇 청소기는 방 모양을 기억해서 길을 찾아요."
   },
   "sentences": [
    {
     "en": "I build a robot named Beep.",
     "ko": "나는 삐프라는 로봇을 만든다."
    },
    {
     "en": "Beep can clean my room and sing songs.",
     "ko": "삐프는 내 방을 청소하고 노래도 부른다."
    },
    {
     "en": "One night, I finish my math homework.",
     "ko": "어느 날 밤, 나는 수학 숙제를 다 한다."
    },
    {
     "en": "In the morning, it is gone!",
     "ko": "아침이 되니 숙제가 없어졌다!"
    },
    {
     "en": "I look at Beep. Beep burps.",
     "ko": "삐프를 쳐다본다. 삐프가 꺼억 트림을 한다."
    },
    {
     "en": "A little piece of paper comes out of his mouth!",
     "ko": "삐프 입에서 종이 조각이 나온다!"
    },
    {
     "en": "My robot ate my homework!",
     "ko": "내 로봇이 숙제를 먹어 버렸다!"
    },
    {
     "en": "\"Beep, robots do not eat paper!\" I say.",
     "ko": "\"삐프, 로봇은 종이를 먹으면 안 돼!\" 내가 말한다."
    },
    {
     "en": "I fix him with a new chip.",
     "ko": "나는 새 칩으로 삐프를 고친다."
    },
    {
     "en": "Now Beep helps me with my homework instead.",
     "ko": "이제 삐프는 숙제를 먹는 대신 도와준다."
    }
   ],
   "key": 6,
   "keyWhy": {
    "en": "This sentence tells the big surprise that the whole story is about.",
    "ko": "이야기 전체가 다루는 가장 놀라운 사건을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Beep sings a song at school.",
      "ko": "삐프가 학교에서 노래를 부른다."
     },
     {
      "en": "I do not do my homework.",
      "ko": "나는 숙제를 하지 않는다."
     },
     {
      "en": "Beep cleans my room every day.",
      "ko": "삐프가 매일 내 방을 청소한다."
     },
     {
      "en": "My robot eats my homework, so I fix him.",
      "ko": "로봇이 숙제를 먹어서 내가 고쳐 준다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The robot eats the homework, and then I fix him so he helps instead.",
     "ko": "로봇이 숙제를 먹어 버리고, 내가 고쳐서 이제는 도와주게 되는 이야기예요."
    }
   },
   "words": [
    {
     "en": "robot",
     "ko": "로봇"
    },
    {
     "en": "homework",
     "ko": "숙제"
    },
    {
     "en": "paper",
     "ko": "종이"
    }
   ],
   "summary": {
    "ko": "로봇 삐프가 숙제를 먹었지만 이제는 나를 돕는다.",
    "en": "My robot Beep ate my homework, but now he helps me.",
    "keywords": [
     "robot",
     "homework",
     "helps"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-17",
   "genre": "story",
   "title": {
    "en": "The Secret Treasure Map",
    "ko": "비밀 보물 지도"
   },
   "topic": {
    "en": "Adventure",
    "ko": "모험"
   },
   "bg": {
    "en": "Some pirates long ago really did bury their treasure.",
    "ko": "옛날 해적들은 정말로 보물을 땅에 묻기도 했대요."
   },
   "sentences": [
    {
     "en": "Nora finds an old map in Grandpa's attic.",
     "ko": "노라가 할아버지 다락방에서 낡은 지도를 찾는다."
    },
    {
     "en": "There is a big red X on it.",
     "ko": "지도에 커다란 빨간 X 표시가 있다."
    },
    {
     "en": "\"Treasure!\" she shouts.",
     "ko": "\"보물이다!\" 노라가 외친다."
    },
    {
     "en": "She follows the map past the old tree and over the little bridge.",
     "ko": "노라는 지도를 따라 오래된 나무를 지나 작은 다리를 건넌다."
    },
    {
     "en": "She digs and digs under a big rock.",
     "ko": "큰 바위 밑을 파고 또 판다."
    },
    {
     "en": "Clunk! It is a box!",
     "ko": "쿵! 상자가 나온다!"
    },
    {
     "en": "Nora opens it slowly.",
     "ko": "노라가 천천히 상자를 연다."
    },
    {
     "en": "Inside, there are old family photos and a note.",
     "ko": "안에는 오래된 가족사진과 쪽지가 있다."
    },
    {
     "en": "The note says, \"The real treasure is family. Love, Grandpa.\"",
     "ko": "쪽지에는 \"진짜 보물은 가족이란다. 사랑하는 할아버지가.\"라고 적혀 있다."
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence gives the lesson of the story: family is the real treasure.",
    "ko": "가족이 진짜 보물이라는 이야기의 교훈을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Nora gets lost in the woods.",
      "ko": "노라가 숲에서 길을 잃는다."
     },
     {
      "en": "Nora follows a map and learns that family is the real treasure.",
      "ko": "노라가 지도를 따라가서 가족이 진짜 보물임을 알게 된다."
     },
     {
      "en": "Nora finds a box full of gold.",
      "ko": "노라가 금이 가득한 상자를 찾는다."
     },
     {
      "en": "Grandpa draws a new map.",
      "ko": "할아버지가 새 지도를 그린다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Nora follows the map, but the treasure turns out to be about family.",
     "ko": "노라가 지도를 따라갔는데, 보물은 바로 가족이었다는 이야기예요."
    }
   },
   "words": [
    {
     "en": "map",
     "ko": "지도"
    },
    {
     "en": "treasure",
     "ko": "보물"
    },
    {
     "en": "note",
     "ko": "쪽지"
    }
   ],
   "summary": {
    "ko": "할아버지의 보물 지도는 노라에게 가족이 진짜 보물이라는 것을 알려 주었다.",
    "en": "Grandpa's treasure map showed Nora that family is the real treasure.",
    "keywords": [
     "map",
     "family",
     "treasure"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-18",
   "genre": "story",
   "title": {
    "en": "The Monster Under My Bed",
    "ko": "침대 밑 괴물"
   },
   "topic": {
    "en": "Courage",
    "ko": "용기"
   },
   "bg": {
    "en": "Cats can see much better in the dark than people.",
    "ko": "고양이는 어두운 곳에서 사람보다 훨씬 잘 볼 수 있어요."
   },
   "sentences": [
    {
     "en": "Every night, I hear a noise under my bed.",
     "ko": "매일 밤 침대 밑에서 소리가 들린다."
    },
    {
     "en": "Scratch, scratch!",
     "ko": "긁적, 긁적!"
    },
    {
     "en": "\"It is a monster!\" I think.",
     "ko": "\"괴물이야!\" 하고 생각한다."
    },
    {
     "en": "I hide under my blanket.",
     "ko": "나는 이불 속에 숨는다."
    },
    {
     "en": "Tonight, I want to be brave.",
     "ko": "오늘 밤은 용기를 내고 싶다."
    },
    {
     "en": "I take my flashlight and look under the bed.",
     "ko": "손전등을 들고 침대 밑을 들여다본다."
    },
    {
     "en": "Two big eyes look back at me!",
     "ko": "커다란 눈 두 개가 나를 쳐다본다!"
    },
    {
     "en": "But it is not a monster. It is my kitten, Coco!",
     "ko": "그런데 괴물이 아니다. 우리 아기 고양이 코코다!"
    },
    {
     "en": "She is playing with my sock.",
     "ko": "코코가 내 양말을 가지고 놀고 있다."
    },
    {
     "en": "The scary monster was just my cat!",
     "ko": "무서운 괴물은 그냥 우리 고양이였다!"
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence shows the twist: the scary monster was only a cat.",
    "ko": "무서운 괴물이 사실은 고양이였다는 반전을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "A monster lives in my closet.",
      "ko": "괴물이 내 옷장에 산다."
     },
     {
      "en": "I lose my flashlight.",
      "ko": "나는 손전등을 잃어버린다."
     },
     {
      "en": "I find out that the \"monster\" under my bed is my cat.",
      "ko": "침대 밑 \"괴물\"이 우리 고양이라는 것을 알게 된다."
     },
     {
      "en": "Coco is afraid of socks.",
      "ko": "코코는 양말을 무서워한다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "I am scared of a monster, but I bravely look and find my cat.",
     "ko": "괴물이 무서웠지만 용기를 내어 보니 우리 고양이였다는 이야기예요."
    }
   },
   "words": [
    {
     "en": "monster",
     "ko": "괴물"
    },
    {
     "en": "brave",
     "ko": "용감한"
    },
    {
     "en": "kitten",
     "ko": "새끼 고양이"
    }
   ],
   "summary": {
    "ko": "침대 밑 소리는 괴물이 아니라 우리 아기 고양이였다.",
    "en": "The noise under my bed was my kitten, not a monster.",
    "keywords": [
     "noise",
     "kitten",
     "monster"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-19",
   "genre": "story",
   "title": {
    "en": "The Little Dragon Who Sneezed Fire",
    "ko": "재채기로 불을 뿜은 아기 용"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "Pepper tickles your nose and makes you sneeze.",
    "ko": "후춧가루 냄새를 맡으면 코가 간질간질해서 재채기가 나와요."
   },
   "sentences": [
    {
     "en": "Drago is a little dragon.",
     "ko": "드라고는 아기 용이다."
    },
    {
     "en": "He cannot breathe fire yet, and the big dragons laugh at him.",
     "ko": "아직 불을 뿜지 못해서 큰 용들이 놀린다."
    },
    {
     "en": "One cold night, the village fire goes out.",
     "ko": "어느 추운 밤, 마을의 불이 꺼진다."
    },
    {
     "en": "Everyone is freezing.",
     "ko": "모두가 꽁꽁 언다."
    },
    {
     "en": "Then Drago smells some pepper.",
     "ko": "그때 드라고가 후춧가루 냄새를 맡는다."
    },
    {
     "en": "Ah... ah... ACHOO!",
     "ko": "에... 에... 에취!"
    },
    {
     "en": "A big fire comes out of his nose!",
     "ko": "코에서 커다란 불이 뿜어져 나온다!"
    },
    {
     "en": "The village fire is burning again.",
     "ko": "마을의 불이 다시 활활 타오른다."
    },
    {
     "en": "\"Thank you, Drago!\" everyone cheers.",
     "ko": "\"고마워, 드라고!\" 모두가 환호한다."
    },
    {
     "en": "Even a little dragon can be a hero.",
     "ko": "작은 용도 영웅이 될 수 있다."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence gives the lesson: even a small dragon can be a hero.",
    "ko": "작은 용도 영웅이 될 수 있다는 이야기의 교훈을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "A little dragon saves the cold village with a fiery sneeze.",
      "ko": "아기 용이 불 재채기로 추운 마을을 구한다."
     },
     {
      "en": "The big dragons teach Drago to fly.",
      "ko": "큰 용들이 드라고에게 나는 법을 가르친다."
     },
     {
      "en": "Drago eats too much pepper and gets sick.",
      "ko": "드라고가 후추를 너무 많이 먹고 아프다."
     },
     {
      "en": "The village has a hot summer.",
      "ko": "마을에 더운 여름이 온다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Drago's fiery sneeze lights the village fire and saves everyone.",
     "ko": "드라고의 불 재채기가 마을의 불을 다시 붙여 모두를 구하는 이야기예요."
    }
   },
   "words": [
    {
     "en": "dragon",
     "ko": "용"
    },
    {
     "en": "village",
     "ko": "마을"
    },
    {
     "en": "pepper",
     "ko": "후추"
    }
   ],
   "summary": {
    "ko": "드라고는 재채기로 불을 뿜어서 마을을 구했다.",
    "en": "Drago sneezed fire and saved the village.",
    "keywords": [
     "drago",
     "fire",
     "village"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-20",
   "genre": "story",
   "title": {
    "en": "Super Sam Saves the Day",
    "ko": "슈퍼 샘이 해냈다"
   },
   "topic": {
    "en": "Heroes",
    "ko": "영웅"
   },
   "bg": {
    "en": "Cats climb trees easily, but coming down is hard for them.",
    "ko": "고양이는 나무에 오르기는 쉽지만, 내려오기는 어려워해요."
   },
   "sentences": [
    {
     "en": "Sam puts on his red cape.",
     "ko": "샘이 빨간 망토를 두른다."
    },
    {
     "en": "\"I am Super Sam!\" he says.",
     "ko": "\"나는 슈퍼 샘이다!\" 샘이 말한다."
    },
    {
     "en": "But Sam has no superpowers.",
     "ko": "하지만 샘에게는 초능력이 없다."
    },
    {
     "en": "At the park, a little girl is crying.",
     "ko": "공원에서 한 여자아이가 울고 있다."
    },
    {
     "en": "Her kitten is stuck in a tree.",
     "ko": "아이의 아기 고양이가 나무에 올라가서 못 내려온다."
    },
    {
     "en": "Sam cannot fly, but he has an idea!",
     "ko": "샘은 날 수 없지만, 좋은 생각이 났다!"
    },
    {
     "en": "He brings a ladder from the park office.",
     "ko": "샘은 공원 사무실에서 사다리를 가져온다."
    },
    {
     "en": "He climbs up slowly and gets the kitten.",
     "ko": "천천히 올라가서 고양이를 안고 내려온다."
    },
    {
     "en": "\"You are a real hero!\" says the girl.",
     "ko": "\"너는 진짜 영웅이야!\" 여자아이가 말한다."
    },
    {
     "en": "You do not need superpowers to help others.",
     "ko": "다른 사람을 돕는 데 초능력은 필요 없다."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence gives the lesson: you can help others without superpowers.",
    "ko": "초능력이 없어도 남을 도울 수 있다는 교훈을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Sam flies over the park.",
      "ko": "샘이 공원 위를 날아다닌다."
     },
     {
      "en": "Sam loses his red cape.",
      "ko": "샘이 빨간 망토를 잃어버린다."
     },
     {
      "en": "The girl climbs the tree by herself.",
      "ko": "여자아이가 혼자 나무에 올라간다."
     },
     {
      "en": "Sam has no superpowers, but he still helps and becomes a hero.",
      "ko": "샘은 초능력이 없지만 도움을 주어 영웅이 된다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Sam has no powers, but he uses a ladder to save the kitten.",
     "ko": "샘은 초능력이 없지만 사다리를 써서 아기 고양이를 구하는 이야기예요."
    }
   },
   "words": [
    {
     "en": "cape",
     "ko": "망토"
    },
    {
     "en": "ladder",
     "ko": "사다리"
    },
    {
     "en": "hero",
     "ko": "영웅"
    }
   ],
   "summary": {
    "ko": "샘은 초능력 없이도 아기 고양이를 구했다.",
    "en": "Sam saved a kitten without any superpowers.",
    "keywords": [
     "sam",
     "kitten",
     "superpowers"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-21",
   "genre": "story",
   "title": {
    "en": "The Talking Cat",
    "ko": "말하는 고양이"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "Cats mostly meow to talk to people, not to other cats.",
    "ko": "고양이는 주로 사람에게 말을 걸 때 \"야옹\" 하고 울어요."
   },
   "sentences": [
    {
     "en": "One morning, my cat Mimi says, \"Good morning!\"",
     "ko": "어느 아침, 우리 고양이 미미가 \"좋은 아침!\" 하고 말한다."
    },
    {
     "en": "I drop my spoon. \"You can talk?\"",
     "ko": "나는 숟가락을 떨어뜨린다. \"너 말할 줄 알아?\""
    },
    {
     "en": "\"Yes,\" says Mimi. \"But only on Tuesdays.\"",
     "ko": "\"응.\" 미미가 말한다. \"하지만 화요일에만.\""
    },
    {
     "en": "Mimi tells me many secrets.",
     "ko": "미미가 비밀을 많이 알려 준다."
    },
    {
     "en": "The big dog next door is afraid of mice.",
     "ko": "옆집 큰 개는 생쥐를 무서워한다고 한다."
    },
    {
     "en": "Dad sings in the shower every night.",
     "ko": "아빠는 매일 밤 샤워하면서 노래를 부른다고 한다."
    },
    {
     "en": "Then Mimi says, \"Now give me more fish, please.\"",
     "ko": "그러고는 미미가 \"이제 생선 좀 더 줘.\" 하고 말한다."
    },
    {
     "en": "I laugh and give her a fish.",
     "ko": "나는 웃으면서 생선을 준다."
    },
    {
     "en": "Now Tuesday is my favorite day, because my cat can talk!",
     "ko": "이제 화요일이 제일 좋다. 고양이가 말을 하니까!"
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence sums up the story: Tuesday is special because my cat talks.",
    "ko": "고양이가 말을 해서 화요일이 특별해졌다는 이야기 전체를 정리하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "My cat runs away on Tuesday.",
      "ko": "우리 고양이가 화요일에 도망간다."
     },
     {
      "en": "My cat can talk on Tuesdays and tells me funny secrets.",
      "ko": "우리 고양이가 화요일마다 말을 하고 재미있는 비밀을 알려 준다."
     },
     {
      "en": "The dog next door can talk.",
      "ko": "옆집 개가 말을 한다."
     },
     {
      "en": "Dad does not like fish.",
      "ko": "아빠는 생선을 싫어한다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The whole story is about Mimi talking on Tuesdays and sharing secrets.",
     "ko": "미미가 화요일마다 말을 하고 비밀을 알려 주는 이야기예요."
    }
   },
   "words": [
    {
     "en": "secrets",
     "ko": "비밀"
    },
    {
     "en": "spoon",
     "ko": "숟가락"
    },
    {
     "en": "favorite",
     "ko": "가장 좋아하는"
    }
   ],
   "summary": {
    "ko": "우리 고양이 미미는 말을 할 수 있지만 화요일에만 한다.",
    "en": "My cat Mimi can talk, but only on Tuesdays.",
    "keywords": [
     "cat",
     "talk",
     "tuesdays"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-22",
   "genre": "story",
   "title": {
    "en": "Lost on Planet Zog",
    "ko": "조그 행성에서 길을 잃다"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Some real planets in space have two suns!",
    "ko": "실제로 우주에는 해가 두 개인 행성도 있어요!"
   },
   "sentences": [
    {
     "en": "Kai's spaceship lands on Planet Zog.",
     "ko": "카이의 우주선이 조그 행성에 내린다."
    },
    {
     "en": "The sky is pink, and there are two suns.",
     "ko": "하늘은 분홍색이고 해가 두 개 있다."
    },
    {
     "en": "Kai walks too far and gets lost.",
     "ko": "카이는 너무 멀리 걸어가서 길을 잃는다."
    },
    {
     "en": "Then a purple alien with long ears comes.",
     "ko": "그때 귀가 긴 보라색 외계인이 다가온다."
    },
    {
     "en": "\"Are you lost?\" the alien asks.",
     "ko": "\"길을 잃었니?\" 외계인이 묻는다."
    },
    {
     "en": "Kai nods.",
     "ko": "카이가 고개를 끄덕인다."
    },
    {
     "en": "The alien gives him a ride on a big flying fish!",
     "ko": "외계인이 커다란 날치를 태워 준다!"
    },
    {
     "en": "They fly over pink hills to Kai's ship.",
     "ko": "둘은 분홍 언덕을 넘어 카이의 우주선까지 날아간다."
    },
    {
     "en": "Kai is safe, and he has a new alien friend.",
     "ko": "카이는 무사하고, 외계인 친구도 생겼다."
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence shows how the story ends: Kai is safe and has a new friend.",
    "ko": "카이가 무사하고 새 친구도 생겼다는 이야기의 끝을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Kai builds a spaceship.",
      "ko": "카이가 우주선을 만든다."
     },
     {
      "en": "Kai catches a fish for dinner.",
      "ko": "카이가 저녁으로 물고기를 잡는다."
     },
     {
      "en": "Kai gets lost on another planet, and a kind alien helps him.",
      "ko": "카이가 다른 행성에서 길을 잃고 친절한 외계인이 도와준다."
     },
     {
      "en": "The alien takes Kai's ship.",
      "ko": "외계인이 카이의 우주선을 가져간다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "Kai gets lost on Planet Zog, and a kind alien takes him back to his ship.",
     "ko": "카이가 조그 행성에서 길을 잃고 친절한 외계인이 우주선까지 데려다주는 이야기예요."
    }
   },
   "words": [
    {
     "en": "planet",
     "ko": "행성"
    },
    {
     "en": "lost",
     "ko": "길을 잃은"
    },
    {
     "en": "alien",
     "ko": "외계인"
    }
   ],
   "summary": {
    "ko": "친절한 외계인이 카이가 우주선을 찾도록 도와주었다.",
    "en": "A kind alien helped Kai find his spaceship.",
    "keywords": [
     "alien",
     "kai",
     "spaceship"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-23",
   "genre": "story",
   "title": {
    "en": "The Magic Pencil",
    "ko": "요술 연필"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "One pencil can draw a line about 50 km long.",
    "ko": "연필 한 자루로 약 50km 길이의 선을 그을 수 있대요."
   },
   "sentences": [
    {
     "en": "Ella finds a gold pencil on the way to school.",
     "ko": "엘라가 학교 가는 길에 금색 연필을 줍는다."
    },
    {
     "en": "She draws a cat, and the cat jumps off the paper!",
     "ko": "고양이를 그리자 고양이가 종이에서 튀어나온다!"
    },
    {
     "en": "Everything she draws comes to life!",
     "ko": "엘라가 그리는 것은 모두 진짜가 된다!"
    },
    {
     "en": "She draws a cake. Yum! She can eat it.",
     "ko": "케이크를 그린다. 냠! 먹을 수 있다."
    },
    {
     "en": "Then she draws a big lion by mistake.",
     "ko": "그런데 실수로 커다란 사자를 그린다."
    },
    {
     "en": "\"ROAR!\" Everyone runs!",
     "ko": "\"어흥!\" 모두 도망간다!"
    },
    {
     "en": "Ella thinks fast.",
     "ko": "엘라는 재빨리 생각한다."
    },
    {
     "en": "She draws a big cage around the lion. Phew!",
     "ko": "사자 둘레에 커다란 우리를 그린다. 휴!"
    },
    {
     "en": "Now Ella draws only nice things with her magic pencil.",
     "ko": "이제 엘라는 요술 연필로 좋은 것만 그린다."
    }
   ],
   "key": 2,
   "keyWhy": {
    "en": "This sentence tells the magic that the whole story is built on.",
    "ko": "이야기 전체가 바탕으로 하는 요술을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Ella finds a magic pencil that makes her drawings real.",
      "ko": "엘라가 그림을 진짜로 만들어 주는 요술 연필을 찾는다."
     },
     {
      "en": "Ella loses her pencil at school.",
      "ko": "엘라가 학교에서 연필을 잃어버린다."
     },
     {
      "en": "A lion visits Ella's school.",
      "ko": "사자가 엘라의 학교에 온다."
     },
     {
      "en": "Ella bakes a cake for her friends.",
      "ko": "엘라가 친구들에게 케이크를 구워 준다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Everything in the story happens because Ella's pencil makes drawings real.",
     "ko": "엘라의 연필이 그림을 진짜로 만들어서 모든 일이 일어나는 이야기예요."
    }
   },
   "words": [
    {
     "en": "pencil",
     "ko": "연필"
    },
    {
     "en": "mistake",
     "ko": "실수"
    },
    {
     "en": "cage",
     "ko": "우리, 새장"
    }
   ],
   "summary": {
    "ko": "엘라의 요술 연필은 그림을 진짜로 만든다.",
    "en": "Ella's magic pencil makes her drawings come to life.",
    "keywords": [
     "magic",
     "pencil",
     "drawings"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-24",
   "genre": "story",
   "title": {
    "en": "Pirate Pete and the Giant Octopus",
    "ko": "해적 피트와 거대 문어"
   },
   "topic": {
    "en": "Ocean",
    "ko": "바다"
   },
   "bg": {
    "en": "An octopus has three hearts and blue blood.",
    "ko": "문어는 심장이 3개이고, 피가 파란색이에요."
   },
   "sentences": [
    {
     "en": "Pirate Pete sails his ship across the sea.",
     "ko": "해적 피트가 배를 타고 바다를 건넌다."
    },
    {
     "en": "Suddenly, the ship stops.",
     "ko": "갑자기 배가 멈춘다."
    },
    {
     "en": "A giant octopus holds it with eight long arms!",
     "ko": "거대한 문어가 긴 다리 여덟 개로 배를 붙잡고 있다!"
    },
    {
     "en": "The pirates shake with fear.",
     "ko": "해적들이 무서워서 덜덜 떤다."
    },
    {
     "en": "But Pete is not scared.",
     "ko": "하지만 피트는 무서워하지 않는다."
    },
    {
     "en": "He looks at the octopus. It looks sad and hungry.",
     "ko": "문어를 보니 슬프고 배고파 보인다."
    },
    {
     "en": "Pete gives it a big bag of fish.",
     "ko": "피트가 생선을 한 자루 가득 준다."
    },
    {
     "en": "The octopus smiles and lets go of the ship.",
     "ko": "문어가 웃으며 배를 놓아준다."
    },
    {
     "en": "Being kind is better than fighting.",
     "ko": "친절이 싸움보다 낫다."
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence gives the lesson: being kind works better than fighting.",
    "ko": "싸우는 것보다 친절한 것이 낫다는 교훈을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "The pirates fight the octopus and win.",
      "ko": "해적들이 문어와 싸워서 이긴다."
     },
     {
      "en": "The octopus eats the ship.",
      "ko": "문어가 배를 먹어 버린다."
     },
     {
      "en": "Pete stops a giant octopus by being kind to it.",
      "ko": "피트가 친절을 베풀어 거대한 문어를 멈춘다."
     },
     {
      "en": "Pete goes fishing with his friends.",
      "ko": "피트가 친구들과 낚시를 간다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "Pete does not fight; he feeds the hungry octopus, and it lets the ship go.",
     "ko": "피트가 싸우지 않고 배고픈 문어에게 먹이를 주자 문어가 배를 놓아주는 이야기예요."
    }
   },
   "words": [
    {
     "en": "pirates",
     "ko": "해적들"
    },
    {
     "en": "octopus",
     "ko": "문어"
    },
    {
     "en": "giant",
     "ko": "거대한"
    }
   ],
   "summary": {
    "ko": "피트가 배고픈 문어에게 친절하게 대하자 문어가 배를 놓아주었다.",
    "en": "Pete was kind to the hungry octopus, so it let the ship go.",
    "keywords": [
     "kind",
     "octopus",
     "ship"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-25",
   "genre": "story",
   "title": {
    "en": "The Ghost Who Was Afraid of the Dark",
    "ko": "어둠을 무서워한 유령"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "Fireflies are insects that make their own light.",
    "ko": "반딧불이는 몸에서 스스로 빛을 내는 곤충이에요."
   },
   "sentences": [
    {
     "en": "Boo is a little ghost.",
     "ko": "부는 꼬마 유령이다."
    },
    {
     "en": "Ghosts love the night, but Boo is afraid of the dark!",
     "ko": "유령들은 밤을 좋아하지만, 부는 어둠이 무섭다!"
    },
    {
     "en": "Every night, he hides in the attic with a candle.",
     "ko": "매일 밤 부는 촛불을 들고 다락방에 숨는다."
    },
    {
     "en": "One night, the wind blows his candle out.",
     "ko": "어느 밤, 바람이 불어 촛불이 꺼진다."
    },
    {
     "en": "Boo starts to shake.",
     "ko": "부가 덜덜 떨기 시작한다."
    },
    {
     "en": "Then he sees tiny lights outside the window.",
     "ko": "그때 창밖에 조그만 불빛들이 보인다."
    },
    {
     "en": "They are fireflies!",
     "ko": "반딧불이다!"
    },
    {
     "en": "The fireflies dance around Boo and light up the night.",
     "ko": "반딧불이들이 부 주위를 날며 밤을 밝힌다."
    },
    {
     "en": "Boo smiles.",
     "ko": "부가 웃는다."
    },
    {
     "en": "The dark is not so scary with friends.",
     "ko": "친구가 있으면 어둠도 그렇게 무섭지 않다."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence gives the lesson: friends make the dark less scary.",
    "ko": "친구가 있으면 어둠도 덜 무섭다는 교훈을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Boo scares the children in the house.",
      "ko": "부가 집에 사는 아이들을 겁준다."
     },
     {
      "en": "Boo buys a new candle.",
      "ko": "부가 새 초를 산다."
     },
     {
      "en": "A ghost who fears the dark feels brave with firefly friends.",
      "ko": "어둠을 무서워하는 유령이 반딧불이 친구들 덕분에 용기를 낸다."
     },
     {
      "en": "The fireflies are afraid of Boo.",
      "ko": "반딧불이들이 부를 무서워한다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "Boo is afraid of the dark until firefly friends light up the night.",
     "ko": "어둠을 무서워하던 부가 반딧불이 친구들 덕분에 무섭지 않게 되는 이야기예요."
    }
   },
   "words": [
    {
     "en": "ghost",
     "ko": "유령"
    },
    {
     "en": "candle",
     "ko": "초, 양초"
    },
    {
     "en": "fireflies",
     "ko": "반딧불이들"
    }
   ],
   "summary": {
    "ko": "부는 반딧불이 친구들과 함께라서 어둠이 무섭지 않았다.",
    "en": "Boo was not scared of the dark with his firefly friends.",
    "keywords": [
     "dark",
     "firefly",
     "friends"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-26",
   "genre": "story",
   "title": {
    "en": "Mission to Mars",
    "ko": "화성 탐사 작전"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Mars looks red because its soil has lots of rusty iron.",
    "ko": "화성은 흙에 녹슨 철이 많아서 붉게 보여요."
   },
   "sentences": [
    {
     "en": "Astronaut Leo flies to Mars.",
     "ko": "우주 비행사 레오가 화성으로 날아간다."
    },
    {
     "en": "The trip takes many months.",
     "ko": "가는 데 몇 달이나 걸린다."
    },
    {
     "en": "Mars is red and dusty, and it is very cold.",
     "ko": "화성은 붉고 먼지투성이이고, 아주 춥다."
    },
    {
     "en": "Leo drives a rover over the rocks.",
     "ko": "레오가 탐사차를 몰고 바위 위를 지나간다."
    },
    {
     "en": "Suddenly, a big dust storm comes!",
     "ko": "갑자기 거대한 모래 폭풍이 불어온다!"
    },
    {
     "en": "Leo cannot see anything.",
     "ko": "레오는 아무것도 볼 수 없다."
    },
    {
     "en": "He follows the beep, beep of his base.",
     "ko": "레오는 기지에서 나는 삐삐 소리를 따라간다."
    },
    {
     "en": "He gets inside just in time.",
     "ko": "아슬아슬하게 기지 안으로 들어간다."
    },
    {
     "en": "Leo is safe, and he is the first person on Mars!",
     "ko": "레오는 무사하고, 화성에 간 첫 번째 사람이다!"
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence shows how the mission ends: Leo is safe on Mars.",
    "ko": "레오가 화성에서 무사하다는 탐사의 끝을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Leo explores Mars and gets through a dust storm safely.",
      "ko": "레오가 화성을 탐험하고 모래 폭풍을 무사히 이겨 낸다."
     },
     {
      "en": "Leo goes to the Moon for a picnic.",
      "ko": "레오가 달로 소풍을 간다."
     },
     {
      "en": "The rover breaks, and Leo walks back to Earth.",
      "ko": "탐사차가 고장 나서 레오가 지구까지 걸어간다."
     },
     {
      "en": "Leo is afraid to leave Earth.",
      "ko": "레오는 지구를 떠나기 무서워한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Leo explores Mars, gets caught in a dust storm, and gets back to his base safely.",
     "ko": "레오가 화성을 탐험하다 모래 폭풍을 만나지만 무사히 기지로 돌아오는 이야기예요."
    }
   },
   "words": [
    {
     "en": "astronaut",
     "ko": "우주 비행사"
    },
    {
     "en": "dusty",
     "ko": "먼지투성이인"
    },
    {
     "en": "storm",
     "ko": "폭풍"
    }
   ],
   "summary": {
    "ko": "레오는 화성을 탐험하고 모래 폭풍 속에서도 무사했다.",
    "en": "Leo explored Mars and stayed safe in a dust storm.",
    "keywords": [
     "mars",
     "storm",
     "safe"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-27",
   "genre": "story",
   "title": {
    "en": "The Invisible Boy",
    "ko": "투명 인간이 된 톰"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "Some scientists really study how to make \"invisibility cloaks.\"",
    "ko": "실제로 물체를 안 보이게 하는 \"투명 망토\"를 연구하는 과학자들도 있어요."
   },
   "sentences": [
    {
     "en": "Tom drinks a strange blue juice.",
     "ko": "톰이 이상한 파란 주스를 마신다."
    },
    {
     "en": "Poof! He is invisible!",
     "ko": "펑! 톰이 투명 인간이 되었다!"
    },
    {
     "en": "Nobody can see him.",
     "ko": "아무도 톰을 볼 수 없다."
    },
    {
     "en": "At first, it is fun.",
     "ko": "처음에는 재미있다."
    },
    {
     "en": "He takes cookies, and nobody knows.",
     "ko": "쿠키를 가져가도 아무도 모른다."
    },
    {
     "en": "But at lunch, his friends play without him.",
     "ko": "하지만 점심시간에 친구들이 톰 없이 논다."
    },
    {
     "en": "At home, Mom cannot find him to give him a hug.",
     "ko": "집에서는 엄마가 톰을 찾지 못해 안아 줄 수가 없다."
    },
    {
     "en": "Tom feels very lonely.",
     "ko": "톰은 무척 외롭다."
    },
    {
     "en": "The next morning, everyone can see Tom again.",
     "ko": "다음 날 아침, 모두가 다시 톰을 볼 수 있다."
    },
    {
     "en": "Being seen by the people you love is the best!",
     "ko": "사랑하는 사람들이 나를 봐 주는 것이 최고다!"
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence gives the lesson Tom learns: being seen by loved ones is best.",
    "ko": "사랑하는 사람들이 나를 봐 주는 것이 최고라는 톰의 깨달음을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Tom gets a new blue bike.",
      "ko": "톰이 새 파란 자전거를 받는다."
     },
     {
      "en": "Tom eats all the cookies in town.",
      "ko": "톰이 동네 쿠키를 다 먹는다."
     },
     {
      "en": "Tom's friends become invisible.",
      "ko": "톰의 친구들이 투명 인간이 된다."
     },
     {
      "en": "Tom becomes invisible and learns that it is lonely.",
      "ko": "톰이 투명 인간이 되고, 그것이 외롭다는 것을 알게 된다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Being invisible is fun at first, but Tom feels lonely and learns a lesson.",
     "ko": "투명 인간이 되는 것이 처음엔 재미있지만 외로워서 깨달음을 얻는 이야기예요."
    }
   },
   "words": [
    {
     "en": "invisible",
     "ko": "보이지 않는, 투명한"
    },
    {
     "en": "lonely",
     "ko": "외로운"
    },
    {
     "en": "strange",
     "ko": "이상한"
    }
   ],
   "summary": {
    "ko": "톰은 투명 인간이 되어 보고, 눈에 보이는 것이 더 좋다는 것을 알았다.",
    "en": "Tom was invisible and learned that being seen is better.",
    "keywords": [
     "tom",
     "invisible",
     "seen"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-28",
   "genre": "story",
   "title": {
    "en": "T. rex Goes to School",
    "ko": "학교에 온 티라노"
   },
   "topic": {
    "en": "Dinosaurs",
    "ko": "공룡"
   },
   "bg": {
    "en": "A T. rex's arms were only about as long as a person's arm.",
    "ko": "티라노사우루스의 팔은 사람 팔 길이 정도로 짧았어요."
   },
   "sentences": [
    {
     "en": "One day, a T. rex comes to our school!",
     "ko": "어느 날, 티라노사우루스가 우리 학교에 온다!"
    },
    {
     "en": "Everyone screams and runs.",
     "ko": "모두 소리 지르며 도망간다."
    },
    {
     "en": "But the T. rex just sits down in the classroom.",
     "ko": "그런데 티라노는 교실에 그냥 앉는다."
    },
    {
     "en": "He wants to learn!",
     "ko": "공부하고 싶은 것이다!"
    },
    {
     "en": "His arms are too short to hold a pencil.",
     "ko": "팔이 너무 짧아서 연필을 못 잡는다."
    },
    {
     "en": "So we help him write with his tail.",
     "ko": "그래서 우리가 꼬리로 글씨 쓰는 것을 도와준다."
    },
    {
     "en": "At lunch, he eats twenty sandwiches.",
     "ko": "점심시간에 샌드위치를 스무 개나 먹는다."
    },
    {
     "en": "At recess, he gives us rides on his back.",
     "ko": "쉬는 시간에는 우리를 등에 태워 준다."
    },
    {
     "en": "Now the T. rex is the best classmate ever!",
     "ko": "이제 티라노는 최고의 반 친구이다!"
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence shows how the story ends: the scary T. rex becomes our best friend.",
    "ko": "무서운 티라노가 최고의 친구가 되었다는 이야기의 끝을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "The T. rex eats our teacher.",
      "ko": "티라노가 선생님을 잡아먹는다."
     },
     {
      "en": "A T. rex comes to school and becomes our friend.",
      "ko": "티라노가 학교에 와서 우리 친구가 된다."
     },
     {
      "en": "We visit a dinosaur museum.",
      "ko": "우리가 공룡 박물관에 간다."
     },
     {
      "en": "The T. rex cannot eat sandwiches.",
      "ko": "티라노는 샌드위치를 못 먹는다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Everyone is scared at first, but the T. rex just wants to learn and becomes a friend.",
     "ko": "처음엔 모두 무서워했지만 티라노는 공부하고 싶었을 뿐이고 친구가 되는 이야기예요."
    }
   },
   "words": [
    {
     "en": "classroom",
     "ko": "교실"
    },
    {
     "en": "tail",
     "ko": "꼬리"
    },
    {
     "en": "classmate",
     "ko": "반 친구"
    }
   ],
   "summary": {
    "ko": "티라노사우루스가 우리 학교에 와서 친구가 되었다.",
    "en": "A T. rex came to our school and became our friend.",
    "keywords": [
     "rex",
     "school",
     "friend"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-29",
   "genre": "story",
   "title": {
    "en": "The Haunted House",
    "ko": "귀신의 집"
   },
   "topic": {
    "en": "Adventure",
    "ko": "모험"
   },
   "bg": {
    "en": "The most important part of a surprise party is keeping the secret.",
    "ko": "깜짝 파티는 비밀을 끝까지 지키는 게 제일 중요해요."
   },
   "sentences": [
    {
     "en": "There is an old house at the end of our street.",
     "ko": "우리 동네 끝에 낡은 집이 있다."
    },
    {
     "en": "People say it is haunted.",
     "ko": "사람들은 귀신이 나오는 집이라고 한다."
    },
    {
     "en": "Tonight, my friends and I go inside.",
     "ko": "오늘 밤 친구들과 나는 그 안에 들어간다."
    },
    {
     "en": "Creak! The door opens by itself.",
     "ko": "끼익! 문이 저절로 열린다."
    },
    {
     "en": "It is very dark.",
     "ko": "아주 깜깜하다."
    },
    {
     "en": "Then we hear footsteps and whispers!",
     "ko": "그때 발소리와 속삭이는 소리가 들린다!"
    },
    {
     "en": "Suddenly, the lights turn on.",
     "ko": "갑자기 불이 켜진다."
    },
    {
     "en": "\"SURPRISE!\"",
     "ko": "\"서프라이즈!\""
    },
    {
     "en": "It is my family with a big cake.",
     "ko": "커다란 케이크를 든 우리 가족이다."
    },
    {
     "en": "The haunted house was my secret birthday party!",
     "ko": "귀신의 집은 나를 위한 깜짝 생일 파티였다!"
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence shows the twist: the scary house was a birthday surprise.",
    "ko": "무서운 집이 사실은 생일 깜짝 파티였다는 반전을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "A real ghost lives in the old house.",
      "ko": "낡은 집에 진짜 유령이 산다."
     },
     {
      "en": "We get lost on a dark street.",
      "ko": "우리가 깜깜한 길에서 길을 잃는다."
     },
     {
      "en": "The scary house is really a surprise birthday party.",
      "ko": "무서운 집은 사실 깜짝 생일 파티이다."
     },
     {
      "en": "My family moves to the old house.",
      "ko": "우리 가족이 낡은 집으로 이사한다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The spooky sounds in the house turn out to be my family's surprise party.",
     "ko": "집 안의 무서운 소리가 사실은 가족의 깜짝 파티였다는 이야기예요."
    }
   },
   "words": [
    {
     "en": "haunted",
     "ko": "귀신이 나오는"
    },
    {
     "en": "footsteps",
     "ko": "발소리"
    },
    {
     "en": "whispers",
     "ko": "속삭임"
    }
   ],
   "summary": {
    "ko": "귀신의 집은 사실 나의 깜짝 생일 파티였다.",
    "en": "The haunted house was really my surprise birthday party.",
    "keywords": [
     "haunted",
     "surprise",
     "party"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-30",
   "genre": "story",
   "title": {
    "en": "The Mermaid's Lost Pearl",
    "ko": "인어의 잃어버린 진주"
   },
   "topic": {
    "en": "Ocean",
    "ko": "바다"
   },
   "bg": {
    "en": "Real pearls grow very slowly inside oysters and clams.",
    "ko": "진짜 진주는 조개 속에서 아주 천천히 자라요."
   },
   "sentences": [
    {
     "en": "Lily is swimming at the beach.",
     "ko": "릴리가 바닷가에서 수영하고 있다."
    },
    {
     "en": "She hears someone crying under the water.",
     "ko": "물속에서 누군가 우는 소리가 들린다."
    },
    {
     "en": "It is a little mermaid!",
     "ko": "꼬마 인어이다!"
    },
    {
     "en": "\"I lost my magic pearl,\" says the mermaid.",
     "ko": "\"내 마법 진주를 잃어버렸어.\" 인어가 말한다."
    },
    {
     "en": "\"Without it, I cannot go home.\"",
     "ko": "\"그게 없으면 집에 갈 수 없어.\""
    },
    {
     "en": "Lily dives down deep.",
     "ko": "릴리가 깊이 잠수한다."
    },
    {
     "en": "She looks under rocks and inside shells.",
     "ko": "바위 밑과 조개껍데기 안을 살펴본다."
    },
    {
     "en": "There it is, inside a big clam!",
     "ko": "커다란 조개 속에 진주가 있다!"
    },
    {
     "en": "Lily helps the mermaid get her pearl back, and the mermaid swims home.",
     "ko": "릴리가 진주를 찾아 주자 인어는 집으로 헤엄쳐 간다."
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence shows how Lily solves the mermaid's problem.",
    "ko": "릴리가 인어의 문제를 어떻게 해결했는지 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Lily helps a mermaid find her lost pearl.",
      "ko": "릴리가 인어의 잃어버린 진주를 찾아 준다."
     },
     {
      "en": "Lily becomes a mermaid.",
      "ko": "릴리가 인어가 된다."
     },
     {
      "en": "The mermaid steals Lily's pearl.",
      "ko": "인어가 릴리의 진주를 훔친다."
     },
     {
      "en": "Lily is afraid of the water.",
      "ko": "릴리는 물을 무서워한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "A mermaid loses her pearl, and Lily dives to find it so she can go home.",
     "ko": "인어가 진주를 잃어버리고, 릴리가 잠수해서 찾아 주어 인어가 집에 가는 이야기예요."
    }
   },
   "words": [
    {
     "en": "mermaid",
     "ko": "인어"
    },
    {
     "en": "pearl",
     "ko": "진주"
    },
    {
     "en": "dives",
     "ko": "잠수하다"
    }
   ],
   "summary": {
    "ko": "릴리가 진주를 찾아서 인어가 집에 갈 수 있었다.",
    "en": "Lily found the pearl, so the mermaid could go home.",
    "keywords": [
     "lily",
     "pearl",
     "mermaid"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-31",
   "genre": "story",
   "title": {
    "en": "Robot Dog to the Rescue",
    "ko": "로봇 강아지 출동"
   },
   "topic": {
    "en": "Robots & Tech",
    "ko": "로봇과 기술"
   },
   "bg": {
    "en": "Real dogs can smell thousands of times better than people.",
    "ko": "진짜 개는 사람보다 냄새를 수천 배나 더 잘 맡아요."
   },
   "sentences": [
    {
     "en": "Grandpa gives me a robot dog named Sparky.",
     "ko": "할아버지가 스파키라는 로봇 강아지를 주신다."
    },
    {
     "en": "Sparky can bark, run, and find things with his nose.",
     "ko": "스파키는 짖고, 달리고, 코로 물건도 찾는다."
    },
    {
     "en": "One day, my little brother is lost in the park.",
     "ko": "어느 날 남동생이 공원에서 길을 잃는다."
    },
    {
     "en": "We look everywhere, but we cannot find him.",
     "ko": "여기저기 찾아봐도 동생을 찾을 수가 없다."
    },
    {
     "en": "I give Sparky my brother's hat.",
     "ko": "나는 스파키에게 동생 모자를 준다."
    },
    {
     "en": "Sniff, sniff! Beep, beep!",
     "ko": "킁킁! 삐삐!"
    },
    {
     "en": "Sparky runs into the trees.",
     "ko": "스파키가 나무 사이로 달려간다."
    },
    {
     "en": "There is my brother, sitting by the pond!",
     "ko": "연못가에 동생이 앉아 있다!"
    },
    {
     "en": "Sparky found my brother. He is a real hero!",
     "ko": "스파키가 동생을 찾았다. 진짜 영웅이다!"
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence tells how the story ends: the robot dog finds the lost brother.",
    "ko": "로봇 강아지가 길 잃은 동생을 찾았다는 결말을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Sparky runs away from home.",
      "ko": "스파키가 집을 나간다."
     },
     {
      "en": "My brother builds a robot.",
      "ko": "남동생이 로봇을 만든다."
     },
     {
      "en": "Grandpa gets lost in the park.",
      "ko": "할아버지가 공원에서 길을 잃는다."
     },
     {
      "en": "A robot dog finds my lost brother.",
      "ko": "로봇 강아지가 길 잃은 동생을 찾는다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The whole story is about Sparky using his nose to find the lost brother.",
     "ko": "스파키가 코로 길 잃은 동생을 찾아내는 이야기예요."
    }
   },
   "words": [
    {
     "en": "robot",
     "ko": "로봇"
    },
    {
     "en": "lost",
     "ko": "길을 잃은"
    },
    {
     "en": "hero",
     "ko": "영웅"
    }
   ],
   "summary": {
    "ko": "로봇 강아지 스파키가 길 잃은 동생을 찾았다.",
    "en": "My robot dog Sparky found my lost brother.",
    "keywords": [
     "robot",
     "found",
     "brother"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-32",
   "genre": "story",
   "title": {
    "en": "The Shrinking Potion",
    "ko": "작아지는 물약"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "Ants can carry things many times heavier than their own bodies.",
    "ko": "개미는 자기 몸무게의 수십 배나 되는 물건을 들 수 있어요."
   },
   "sentences": [
    {
     "en": "Max finds a tiny bottle in the garden.",
     "ko": "맥스가 정원에서 작은 병을 찾는다."
    },
    {
     "en": "It says, \"Drink me.\"",
     "ko": "병에 \"나를 마셔.\"라고 적혀 있다."
    },
    {
     "en": "Max takes one sip.",
     "ko": "맥스가 한 모금 마신다."
    },
    {
     "en": "Whoosh! He is as small as an ant!",
     "ko": "휙! 맥스가 개미만큼 작아졌다!"
    },
    {
     "en": "The grass looks like a forest.",
     "ko": "풀이 숲처럼 보인다."
    },
    {
     "en": "A big bee flies by, and a spider looks at him!",
     "ko": "커다란 벌이 날아가고, 거미가 맥스를 쳐다본다!"
    },
    {
     "en": "Then a friendly ant gives him a ride.",
     "ko": "그때 친절한 개미가 맥스를 태워 준다."
    },
    {
     "en": "They go back to the bottle.",
     "ko": "둘은 병이 있는 곳으로 돌아간다."
    },
    {
     "en": "Max drinks the last drop, and pop! He is big again.",
     "ko": "맥스가 마지막 한 방울을 마시자, 뿅! 다시 커진다."
    },
    {
     "en": "Now Max is always kind to ants.",
     "ko": "이제 맥스는 언제나 개미에게 친절하다."
    }
   ],
   "key": 3,
   "keyWhy": {
    "en": "This sentence shows the big change that starts the whole adventure.",
    "ko": "모든 모험이 시작되는 큰 변화를 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Max grows as tall as a tree.",
      "ko": "맥스가 나무만큼 커진다."
     },
     {
      "en": "Max shrinks to the size of an ant and has an adventure.",
      "ko": "맥스가 개미만큼 작아져서 모험을 한다."
     },
     {
      "en": "Max catches a big bee.",
      "ko": "맥스가 커다란 벌을 잡는다."
     },
     {
      "en": "Max breaks the tiny bottle.",
      "ko": "맥스가 작은 병을 깨뜨린다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Max shrinks to the size of an ant and has an adventure in the garden.",
     "ko": "맥스가 개미만큼 작아져서 정원에서 모험을 하는 이야기예요."
    }
   },
   "words": [
    {
     "en": "bottle",
     "ko": "병"
    },
    {
     "en": "ant",
     "ko": "개미"
    },
    {
     "en": "forest",
     "ko": "숲"
    }
   ],
   "summary": {
    "ko": "맥스는 물약을 마시고 개미만큼 작아졌다.",
    "en": "Max became as small as an ant after drinking a potion.",
    "keywords": [
     "small",
     "ant",
     "potion"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-33",
   "genre": "story",
   "title": {
    "en": "Space Pizza Delivery",
    "ko": "우주 피자 배달"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Saturn's rings are made mostly of pieces of ice.",
    "ko": "토성의 고리는 대부분 얼음 조각으로 이루어져 있어요."
   },
   "sentences": [
    {
     "en": "Rosa delivers pizza in a flying spaceship.",
     "ko": "로사는 날아다니는 우주선으로 피자를 배달한다."
    },
    {
     "en": "Today, the order is from Planet Blip.",
     "ko": "오늘 주문은 블립 행성에서 왔다."
    },
    {
     "en": "She flies past the Moon and around Saturn's rings.",
     "ko": "로사는 달을 지나 토성의 고리를 돌아 날아간다."
    },
    {
     "en": "The pizza must stay hot!",
     "ko": "피자가 식으면 안 된다!"
    },
    {
     "en": "At last, she lands on Planet Blip.",
     "ko": "드디어 로사가 블립 행성에 내린다."
    },
    {
     "en": "A family of round, yellow aliens opens the door.",
     "ko": "동그란 노란 외계인 가족이 문을 연다."
    },
    {
     "en": "They take one bite and jump for joy.",
     "ko": "외계인들은 한 입 먹더니 기뻐서 펄쩍 뛴다."
    },
    {
     "en": "\"Earth pizza is the best in the universe!\"",
     "ko": "\"지구 피자가 우주 최고야!\""
    },
    {
     "en": "Rosa gets the biggest tip in the galaxy.",
     "ko": "로사는 은하계에서 가장 많은 팁을 받는다."
    }
   ],
   "key": 7,
   "keyWhy": {
    "en": "This sentence shows how much the aliens love the pizza Rosa brought.",
    "ko": "로사가 가져온 피자를 외계인들이 얼마나 좋아하는지 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Rosa flies a pizza to aliens, and they love it.",
      "ko": "로사가 외계인에게 피자를 배달하고, 외계인들이 아주 좋아한다."
     },
     {
      "en": "Rosa eats the pizza on the way.",
      "ko": "로사가 가는 길에 피자를 먹어 버린다."
     },
     {
      "en": "The aliens make pizza for Rosa.",
      "ko": "외계인들이 로사에게 피자를 만들어 준다."
     },
     {
      "en": "Rosa's spaceship lands on the Moon.",
      "ko": "로사의 우주선이 달에 내린다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Rosa flies pizza to a far planet, and the aliens love it.",
     "ko": "로사가 먼 행성까지 피자를 배달하고 외계인들이 아주 좋아하는 이야기예요."
    }
   },
   "words": [
    {
     "en": "delivers",
     "ko": "배달하다"
    },
    {
     "en": "planet",
     "ko": "행성"
    },
    {
     "en": "universe",
     "ko": "우주"
    }
   ],
   "summary": {
    "ko": "로사가 먼 행성에 피자를 배달했고, 외계인들이 정말 좋아했다.",
    "en": "Rosa delivered pizza to a far planet, and the aliens loved it.",
    "keywords": [
     "pizza",
     "planet",
     "aliens"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-34",
   "genre": "story",
   "title": {
    "en": "The Volcano Island",
    "ko": "화산섬 탈출"
   },
   "topic": {
    "en": "Adventure",
    "ko": "모험"
   },
   "bg": {
    "en": "Islands like Hawaii were made by volcanoes under the sea.",
    "ko": "하와이 같은 섬들은 바닷속 화산이 터져서 만들어졌어요."
   },
   "sentences": [
    {
     "en": "Ari and Dad sail to a small island.",
     "ko": "아리와 아빠가 배를 타고 작은 섬에 간다."
    },
    {
     "en": "There is a big mountain in the middle.",
     "ko": "섬 한가운데 큰 산이 있다."
    },
    {
     "en": "They climb up to see the view.",
     "ko": "둘은 경치를 보려고 산을 올라간다."
    },
    {
     "en": "Suddenly, the ground shakes. Rumble, rumble!",
     "ko": "갑자기 땅이 흔들린다. 우르릉, 우르릉!"
    },
    {
     "en": "Smoke comes out of the top.",
     "ko": "꼭대기에서 연기가 나온다."
    },
    {
     "en": "\"It is a volcano!\" shouts Dad.",
     "ko": "\"화산이다!\" 아빠가 외친다."
    },
    {
     "en": "They run down the hill as fast as they can.",
     "ko": "둘은 있는 힘껏 언덕을 뛰어 내려간다."
    },
    {
     "en": "They jump into the boat and sail away.",
     "ko": "둘은 배에 뛰어올라 멀리 떠난다."
    },
    {
     "en": "From the sea, they watch the orange lava.",
     "ko": "바다에서 둘은 주황색 용암을 바라본다."
    },
    {
     "en": "Ari and Dad escaped the volcano just in time!",
     "ko": "아리와 아빠는 아슬아슬하게 화산에서 빠져나왔다!"
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This last sentence tells the result of the whole adventure: they escaped.",
    "ko": "둘이 무사히 탈출했다는 모험의 결과를 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Ari and Dad go fishing.",
      "ko": "아리와 아빠가 낚시를 간다."
     },
     {
      "en": "Ari climbs the mountain alone.",
      "ko": "아리가 혼자 산에 올라간다."
     },
     {
      "en": "Ari and Dad escape from a volcano on an island.",
      "ko": "아리와 아빠가 섬의 화산에서 탈출한다."
     },
     {
      "en": "The boat sinks in the sea.",
      "ko": "배가 바다에 가라앉는다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "Ari and Dad find a volcano on the island and escape just in time.",
     "ko": "아리와 아빠가 섬에서 화산을 만나 아슬아슬하게 탈출하는 이야기예요."
    }
   },
   "words": [
    {
     "en": "island",
     "ko": "섬"
    },
    {
     "en": "volcano",
     "ko": "화산"
    },
    {
     "en": "lava",
     "ko": "용암"
    }
   ],
   "summary": {
    "ko": "아리와 아빠는 아슬아슬하게 화산에서 도망쳤다.",
    "en": "Ari and Dad ran away from a volcano just in time.",
    "keywords": [
     "ran",
     "volcano",
     "time"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-35",
   "genre": "story",
   "title": {
    "en": "The Ninja Cat",
    "ko": "닌자 고양이"
   },
   "topic": {
    "en": "Heroes",
    "ko": "영웅"
   },
   "bg": {
    "en": "Soft paw pads help cats walk without a sound.",
    "ko": "고양이는 발바닥 살이 푹신해서 소리 없이 걸을 수 있어요."
   },
   "sentences": [
    {
     "en": "By day, Momo is a lazy house cat.",
     "ko": "낮에 모모는 게으른 집고양이다."
    },
    {
     "en": "She sleeps on the sofa all day.",
     "ko": "모모는 하루 종일 소파에서 잔다."
    },
    {
     "en": "But at night, she puts on a black mask.",
     "ko": "하지만 밤이 되면 모모는 검은 복면을 쓴다."
    },
    {
     "en": "Momo is a ninja cat!",
     "ko": "모모는 닌자 고양이다!"
    },
    {
     "en": "One night, a mouse steals cheese from the kitchen.",
     "ko": "어느 밤, 생쥐가 부엌에서 치즈를 훔친다."
    },
    {
     "en": "Momo jumps over the table without a sound.",
     "ko": "모모가 소리 없이 식탁을 뛰어넘는다."
    },
    {
     "en": "She stops the mouse at the door.",
     "ko": "모모가 문 앞에서 생쥐를 막는다."
    },
    {
     "en": "The mouse is very hungry, so Momo shares the cheese.",
     "ko": "생쥐가 너무 배고파 보여서 모모는 치즈를 나눠 준다."
    },
    {
     "en": "In the morning, Momo is asleep on the sofa again.",
     "ko": "아침이 되면 모모는 다시 소파에서 자고 있다."
    },
    {
     "en": "Nobody knows her secret!",
     "ko": "아무도 모모의 비밀을 모른다!"
    }
   ],
   "key": 3,
   "keyWhy": {
    "en": "This sentence reveals the big surprise about Momo.",
    "ko": "모모에 대한 큰 비밀을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Momo is afraid of mice.",
      "ko": "모모는 생쥐를 무서워한다."
     },
     {
      "en": "A lazy cat is secretly a ninja at night.",
      "ko": "게으른 고양이가 밤에는 몰래 닌자가 된다."
     },
     {
      "en": "Momo eats all the cheese.",
      "ko": "모모가 치즈를 다 먹는다."
     },
     {
      "en": "The family buys a new sofa.",
      "ko": "가족이 새 소파를 산다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The story shows that a lazy house cat is secretly a ninja at night.",
     "ko": "게으른 집고양이가 밤에는 몰래 닌자가 되는 이야기예요."
    }
   },
   "words": [
    {
     "en": "lazy",
     "ko": "게으른"
    },
    {
     "en": "mask",
     "ko": "복면, 가면"
    },
    {
     "en": "secret",
     "ko": "비밀"
    }
   ],
   "summary": {
    "ko": "모모는 낮에는 졸린 고양이, 밤에는 닌자다.",
    "en": "Momo is a sleepy cat by day and a ninja by night.",
    "keywords": [
     "cat",
     "day",
     "ninja"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-36",
   "genre": "story",
   "title": {
    "en": "The Time Machine",
    "ko": "타임머신"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "The year 2100 is about 75 years from now.",
    "ko": "2100년은 지금으로부터 약 75년 뒤예요."
   },
   "sentences": [
    {
     "en": "Grandpa builds a time machine in the garage.",
     "ko": "할아버지가 차고에서 타임머신을 만든다."
    },
    {
     "en": "Hana pushes the big red button.",
     "ko": "하나가 커다란 빨간 단추를 누른다."
    },
    {
     "en": "Flash! She is in the year 2100!",
     "ko": "번쩍! 하나는 2100년으로 왔다!"
    },
    {
     "en": "Cars fly in the sky.",
     "ko": "자동차가 하늘을 날아다닌다."
    },
    {
     "en": "Robots walk dogs in the park.",
     "ko": "공원에서 로봇이 개를 산책시킨다."
    },
    {
     "en": "Kids learn in a floating school.",
     "ko": "아이들은 떠다니는 학교에서 공부한다."
    },
    {
     "en": "Then Hana sees an old woman in a red hat.",
     "ko": "그때 하나는 빨간 모자를 쓴 할머니를 본다."
    },
    {
     "en": "The woman smiles and says, \"Hello, Hana. I am you!\"",
     "ko": "할머니가 웃으며 말한다. \"안녕, 하나야. 내가 바로 너란다!\""
    },
    {
     "en": "Hana's trip to the future is full of surprises!",
     "ko": "하나의 미래 여행은 놀라운 일투성이다!"
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence sums up the whole trip: the future is full of surprises.",
    "ko": "미래 여행이 놀라운 일로 가득하다고 이야기 전체를 정리하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Grandpa goes back to the past.",
      "ko": "할아버지가 과거로 돌아간다."
     },
     {
      "en": "Hana fixes Grandpa's car.",
      "ko": "하나가 할아버지 차를 고친다."
     },
     {
      "en": "Hana is scared of robots.",
      "ko": "하나는 로봇을 무서워한다."
     },
     {
      "en": "Hana travels to the future and sees many surprises.",
      "ko": "하나가 미래로 여행 가서 놀라운 것들을 본다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Hana goes to the year 2100 in a time machine and sees many surprising things.",
     "ko": "하나가 타임머신을 타고 2100년에 가서 놀라운 것들을 보는 이야기예요."
    }
   },
   "words": [
    {
     "en": "machine",
     "ko": "기계"
    },
    {
     "en": "future",
     "ko": "미래"
    },
    {
     "en": "surprises",
     "ko": "놀라운 일"
    }
   ],
   "summary": {
    "ko": "하나는 타임머신을 타고 미래에 갔다.",
    "en": "Hana went to the future in a time machine.",
    "keywords": [
     "future",
     "time",
     "machine"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-37",
   "genre": "story",
   "title": {
    "en": "The Snow Monster",
    "ko": "눈 괴물"
   },
   "topic": {
    "en": "Adventure",
    "ko": "모험"
   },
   "bg": {
    "en": "On high mountains, always stay on the marked trails.",
    "ko": "높은 산에서는 길을 잃지 않도록 꼭 정해진 길로만 다녀요."
   },
   "sentences": [
    {
     "en": "Minho is skiing on a snowy mountain.",
     "ko": "민호가 눈 덮인 산에서 스키를 탄다."
    },
    {
     "en": "He skis too far and gets lost in the snow.",
     "ko": "민호는 너무 멀리 가서 눈 속에서 길을 잃는다."
    },
    {
     "en": "It gets dark and very cold.",
     "ko": "날이 어두워지고 아주 추워진다."
    },
    {
     "en": "Then he sees big footprints in the snow.",
     "ko": "그때 눈 위에 커다란 발자국이 보인다."
    },
    {
     "en": "A huge white monster comes out of the trees!",
     "ko": "나무 사이에서 거대한 하얀 괴물이 나온다!"
    },
    {
     "en": "Minho closes his eyes.",
     "ko": "민호가 눈을 꼭 감는다."
    },
    {
     "en": "But the monster says, \"Are you cold? Come with me.\"",
     "ko": "그런데 괴물이 말한다. \"춥니? 나랑 같이 가자.\""
    },
    {
     "en": "It carries Minho down the mountain to his family.",
     "ko": "괴물이 민호를 안고 산 아래 가족에게 데려다준다."
    },
    {
     "en": "The snow monster was kind, not scary!",
     "ko": "눈 괴물은 무섭지 않고 다정했다!"
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence tells the surprise: the scary monster was really kind.",
    "ko": "무서워 보이던 괴물이 사실은 다정했다는 반전을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "A kind snow monster helps a lost boy get home.",
      "ko": "다정한 눈 괴물이 길 잃은 아이를 집에 데려다준다."
     },
     {
      "en": "Minho wins a ski race.",
      "ko": "민호가 스키 대회에서 우승한다."
     },
     {
      "en": "The monster takes Minho's skis.",
      "ko": "괴물이 민호의 스키를 가져간다."
     },
     {
      "en": "Minho builds a snow monster.",
      "ko": "민호가 눈 괴물을 만든다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "A kind snow monster helps lost Minho get back to his family.",
     "ko": "다정한 눈 괴물이 길 잃은 민호를 가족에게 데려다주는 이야기예요."
    }
   },
   "words": [
    {
     "en": "lost",
     "ko": "길을 잃은"
    },
    {
     "en": "footprints",
     "ko": "발자국"
    },
    {
     "en": "monster",
     "ko": "괴물"
    }
   ],
   "summary": {
    "ko": "다정한 눈 괴물이 민호가 가족을 찾도록 도와주었다.",
    "en": "A friendly snow monster helped Minho find his family.",
    "keywords": [
     "monster",
     "helped",
     "family"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-38",
   "genre": "story",
   "title": {
    "en": "Alien at the Zoo",
    "ko": "동물원에 간 외계인"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "People are animals too. Scientists call us Homo sapiens.",
    "ko": "사람도 동물의 한 종류예요. 과학에서는 \"호모 사피엔스\"라고 불러요."
   },
   "sentences": [
    {
     "en": "Zip is an alien from Planet Moo.",
     "ko": "지프는 무 행성에서 온 외계인이다."
    },
    {
     "en": "He visits Earth and goes to the zoo.",
     "ko": "지프는 지구에 와서 동물원에 간다."
    },
    {
     "en": "He sees lions, monkeys, and elephants.",
     "ko": "지프는 사자, 원숭이, 코끼리를 본다."
    },
    {
     "en": "\"Wow! Earth animals are so funny!\" says Zip.",
     "ko": "\"와! 지구 동물들은 정말 웃기다!\" 지프가 말한다."
    },
    {
     "en": "Then he sees lots of people taking pictures.",
     "ko": "그러다 지프는 사진을 찍는 사람들을 잔뜩 본다."
    },
    {
     "en": "\"What are these animals?\" he asks.",
     "ko": "\"이 동물들은 뭐지?\" 지프가 묻는다."
    },
    {
     "en": "A monkey laughs and says, \"They are humans!\"",
     "ko": "원숭이가 웃으며 말한다. \"저건 인간이야!\""
    },
    {
     "en": "Zip takes a picture of the humans.",
     "ko": "지프가 인간들 사진을 찍는다."
    },
    {
     "en": "To an alien, people are the strangest animals of all!",
     "ko": "외계인에게는 사람이 가장 신기한 동물이다!"
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence gives the funny point of the story from the alien's view.",
    "ko": "외계인의 눈으로 본 이야기의 재미있는 핵심을 말해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Zip wants to live in the zoo.",
      "ko": "지프가 동물원에서 살고 싶어 한다."
     },
     {
      "en": "The monkeys take Zip's camera.",
      "ko": "원숭이들이 지프의 카메라를 가져간다."
     },
     {
      "en": "An alien visits the zoo and thinks people are funny animals.",
      "ko": "외계인이 동물원에 와서 사람을 웃긴 동물이라고 생각한다."
     },
     {
      "en": "Zip brings animals from his planet.",
      "ko": "지프가 자기 행성의 동물들을 데려온다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "An alien visits the zoo and thinks the people are the funniest animals.",
     "ko": "외계인이 동물원에 와서 사람들을 가장 신기한 동물로 보는 이야기예요."
    }
   },
   "words": [
    {
     "en": "alien",
     "ko": "외계인"
    },
    {
     "en": "zoo",
     "ko": "동물원"
    },
    {
     "en": "humans",
     "ko": "인간"
    }
   ],
   "summary": {
    "ko": "외계인 지프는 동물원에 온 사람들이 웃긴 동물이라고 생각했다.",
    "en": "Zip the alien thought the people at the zoo were funny animals.",
    "keywords": [
     "alien",
     "zoo",
     "animals"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-39",
   "genre": "story",
   "title": {
    "en": "The Giant's Shoe",
    "ko": "거인의 신발"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "The tallest person ever was about 2.72 meters tall.",
    "ko": "세계에서 가장 키가 컸던 사람은 약 2m 72cm였어요."
   },
   "sentences": [
    {
     "en": "One morning, there is a giant shoe in the park!",
     "ko": "어느 아침, 공원에 거대한 신발이 있다!"
    },
    {
     "en": "It is as big as a bus.",
     "ko": "신발은 버스만큼 크다."
    },
    {
     "en": "Everyone is scared. Where is the giant?",
     "ko": "모두 무서워한다. 거인은 어디 있을까?"
    },
    {
     "en": "Then the ground shakes. Boom, boom!",
     "ko": "그때 땅이 흔들린다. 쿵, 쿵!"
    },
    {
     "en": "A giant comes in, hopping on one foot.",
     "ko": "거인이 한 발로 깡충깡충 뛰며 들어온다."
    },
    {
     "en": "\"Have you seen my shoe?\" he asks in a sad voice.",
     "ko": "\"내 신발 못 봤니?\" 거인이 슬픈 목소리로 묻는다."
    },
    {
     "en": "The kids push and push the shoe to him.",
     "ko": "아이들이 신발을 밀고 또 밀어서 거인에게 가져다준다."
    },
    {
     "en": "The giant smiles and gives them a ride on his shoulders.",
     "ko": "거인이 웃으며 아이들을 어깨에 태워 준다."
    },
    {
     "en": "The scary giant was just looking for his shoe!",
     "ko": "무서운 거인은 그냥 신발을 찾고 있었다!"
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence shows the twist: the giant was not scary at all.",
    "ko": "거인이 전혀 무섭지 않았다는 반전을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "The kids buy new shoes.",
      "ko": "아이들이 새 신발을 산다."
     },
     {
      "en": "The giant takes the bus home.",
      "ko": "거인이 버스를 타고 집에 간다."
     },
     {
      "en": "The giant is angry at the kids.",
      "ko": "거인이 아이들에게 화가 난다."
     },
     {
      "en": "Kids help a giant find his lost shoe.",
      "ko": "아이들이 거인의 잃어버린 신발을 찾아 준다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The kids help a sad giant get his lost shoe back.",
     "ko": "아이들이 슬픈 거인에게 잃어버린 신발을 찾아 주는 이야기예요."
    }
   },
   "words": [
    {
     "en": "giant",
     "ko": "거인"
    },
    {
     "en": "scared",
     "ko": "무서워하는"
    },
    {
     "en": "shoulders",
     "ko": "어깨"
    }
   ],
   "summary": {
    "ko": "아이들이 거인에게 신발을 돌려주었다.",
    "en": "The kids helped the giant get his shoe back.",
    "keywords": [
     "kids",
     "giant",
     "shoe"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-40",
   "genre": "story",
   "title": {
    "en": "The Whale in the Net",
    "ko": "그물에 걸린 고래"
   },
   "topic": {
    "en": "Ocean",
    "ko": "바다"
   },
   "bg": {
    "en": "Whales sing to talk to each other over long distances.",
    "ko": "고래는 노래를 불러서 멀리 있는 친구와 이야기해요."
   },
   "sentences": [
    {
     "en": "Captain Yuri is diving in the deep blue sea.",
     "ko": "유리 선장이 깊고 푸른 바다에서 잠수하고 있다."
    },
    {
     "en": "She hears a sad, low song.",
     "ko": "유리는 슬프고 낮은 노랫소리를 듣는다."
    },
    {
     "en": "It is a baby whale!",
     "ko": "아기 고래다!"
    },
    {
     "en": "The whale is stuck in an old fishing net.",
     "ko": "고래가 낡은 그물에 걸려 있다."
    },
    {
     "en": "Yuri cuts the net, little by little.",
     "ko": "유리가 그물을 조금씩 자른다."
    },
    {
     "en": "The whale is free!",
     "ko": "고래가 풀려났다!"
    },
    {
     "en": "It swims to its mother.",
     "ko": "아기 고래가 엄마에게 헤엄쳐 간다."
    },
    {
     "en": "The two whales jump out of the water. Splash!",
     "ko": "두 고래가 물 위로 뛰어오른다. 첨벙!"
    },
    {
     "en": "Yuri saved the baby whale, and the whales said thank you.",
     "ko": "유리가 아기 고래를 구했고, 고래들이 고맙다고 인사했다."
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence tells what Yuri did and how the whales thanked her.",
    "ko": "유리가 한 일과 고래들의 고마운 인사를 함께 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Yuri catches a big fish.",
      "ko": "유리가 커다란 물고기를 잡는다."
     },
     {
      "en": "Yuri saves a baby whale stuck in a net.",
      "ko": "유리가 그물에 걸린 아기 고래를 구한다."
     },
     {
      "en": "The whale breaks Yuri's boat.",
      "ko": "고래가 유리의 배를 부순다."
     },
     {
      "en": "Yuri learns to sing.",
      "ko": "유리가 노래를 배운다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Yuri cuts the old net and saves a baby whale.",
     "ko": "유리가 낡은 그물을 잘라 아기 고래를 구하는 이야기예요."
    }
   },
   "words": [
    {
     "en": "whale",
     "ko": "고래"
    },
    {
     "en": "stuck",
     "ko": "걸린, 갇힌"
    },
    {
     "en": "net",
     "ko": "그물"
    }
   ],
   "summary": {
    "ko": "유리는 그물을 잘라 아기 고래를 구했다.",
    "en": "Yuri cut the net and saved the baby whale.",
    "keywords": [
     "net",
     "saved",
     "whale"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-41",
   "genre": "story",
   "title": {
    "en": "The Wizard's Mistake",
    "ko": "꼬마 마법사의 실수"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "Frogs can breathe through their skin.",
    "ko": "개구리는 피부로도 숨을 쉴 수 있어요."
   },
   "sentences": [
    {
     "en": "Finn is a young wizard in training.",
     "ko": "핀은 마법을 배우는 꼬마 마법사다."
    },
    {
     "en": "Today, he must turn a frog into a prince.",
     "ko": "오늘 핀은 개구리를 왕자로 바꿔야 한다."
    },
    {
     "en": "He waves his wand. \"Abra-ca-FROG!\"",
     "ko": "핀이 지팡이를 흔든다. \"아브라카-개구리!\""
    },
    {
     "en": "Oops! He says the wrong word.",
     "ko": "이런! 핀이 주문을 잘못 외웠다."
    },
    {
     "en": "Now his teacher is a big green frog!",
     "ko": "이제 선생님이 커다란 초록 개구리가 되었다!"
    },
    {
     "en": "\"Ribbit! Fix this, Finn!\" says the teacher.",
     "ko": "\"개굴! 핀, 얼른 고쳐!\" 선생님이 말한다."
    },
    {
     "en": "Finn opens his spell book and reads very carefully.",
     "ko": "핀이 주문책을 펴고 아주 꼼꼼히 읽는다."
    },
    {
     "en": "\"Abra-ca-DONE!\"",
     "ko": "\"아브라카-다 됐다!\""
    },
    {
     "en": "The teacher is back!",
     "ko": "선생님이 돌아왔다!"
    },
    {
     "en": "Finn learns to be careful with magic.",
     "ko": "핀은 마법을 조심해서 써야 한다는 것을 배운다."
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This sentence gives the lesson Finn learns from his mistake.",
    "ko": "핀이 실수에서 배운 교훈을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Finn turns a frog into a prince.",
      "ko": "핀이 개구리를 왕자로 바꾼다."
     },
     {
      "en": "The teacher gives Finn a new wand.",
      "ko": "선생님이 핀에게 새 지팡이를 준다."
     },
     {
      "en": "Finn turns his teacher into a frog by mistake and fixes it.",
      "ko": "핀이 실수로 선생님을 개구리로 만들었다가 되돌린다."
     },
     {
      "en": "Finn loses his spell book.",
      "ko": "핀이 주문책을 잃어버린다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "Finn turns his teacher into a frog by mistake and then fixes it carefully.",
     "ko": "핀이 실수로 선생님을 개구리로 만들었다가 꼼꼼히 되돌리는 이야기예요."
    }
   },
   "words": [
    {
     "en": "wizard",
     "ko": "마법사"
    },
    {
     "en": "frog",
     "ko": "개구리"
    },
    {
     "en": "carefully",
     "ko": "조심스럽게, 꼼꼼히"
    }
   ],
   "summary": {
    "ko": "핀은 마법 실수를 했지만 꼼꼼하게 바로잡았다.",
    "en": "Finn made a magic mistake, but he fixed it carefully.",
    "keywords": [
     "magic",
     "mistake",
     "fixed"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-42",
   "genre": "story",
   "title": {
    "en": "The Jungle Rescue",
    "ko": "정글 구출 작전"
   },
   "topic": {
    "en": "Adventure",
    "ko": "모험"
   },
   "bg": {
    "en": "Parrots are clever birds that can copy human words.",
    "ko": "앵무새는 사람의 말을 따라 할 수 있는 똑똑한 새예요."
   },
   "sentences": [
    {
     "en": "Tara is lost in the jungle.",
     "ko": "타라가 정글에서 길을 잃었다."
    },
    {
     "en": "Tall trees are everywhere, and strange birds call.",
     "ko": "높은 나무가 가득하고, 낯선 새들이 운다."
    },
    {
     "en": "She is hot, tired, and scared.",
     "ko": "타라는 덥고, 지치고, 무섭다."
    },
    {
     "en": "Then a red parrot lands on a branch.",
     "ko": "그때 빨간 앵무새가 나뭇가지에 앉는다."
    },
    {
     "en": "\"Follow me! Follow me!\" it says.",
     "ko": "\"따라와! 따라와!\" 앵무새가 말한다."
    },
    {
     "en": "Tara follows the parrot over a river and under big leaves.",
     "ko": "타라는 앵무새를 따라 강을 건너고 커다란 잎 아래를 지난다."
    },
    {
     "en": "Soon she hears voices.",
     "ko": "곧 사람들 목소리가 들린다."
    },
    {
     "en": "It is her camp!",
     "ko": "타라의 캠프다!"
    },
    {
     "en": "A clever parrot helped Tara find her way back.",
     "ko": "똑똑한 앵무새가 타라가 돌아오도록 도와주었다."
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence sums up how Tara got back: the parrot helped her.",
    "ko": "앵무새 덕분에 타라가 돌아왔다고 정리해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "A parrot helps Tara find her way out of the jungle.",
      "ko": "앵무새가 타라가 정글에서 빠져나오도록 도와준다."
     },
     {
      "en": "Tara catches a red parrot.",
      "ko": "타라가 빨간 앵무새를 잡는다."
     },
     {
      "en": "Tara swims across the ocean.",
      "ko": "타라가 바다를 헤엄쳐 건넌다."
     },
     {
      "en": "Tara builds a house in a tree.",
      "ko": "타라가 나무 위에 집을 짓는다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "A clever parrot leads lost Tara out of the jungle back to her camp.",
     "ko": "똑똑한 앵무새가 길 잃은 타라를 캠프로 데려다주는 이야기예요."
    }
   },
   "words": [
    {
     "en": "jungle",
     "ko": "정글"
    },
    {
     "en": "parrot",
     "ko": "앵무새"
    },
    {
     "en": "camp",
     "ko": "캠프, 야영지"
    }
   ],
   "summary": {
    "ko": "말하는 앵무새가 타라를 캠프로 데려다주었다.",
    "en": "A talking parrot led Tara back to her camp.",
    "keywords": [
     "parrot",
     "tara",
     "camp"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-43",
   "genre": "story",
   "title": {
    "en": "The Moon Rabbit",
    "ko": "달토끼"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Long ago, Koreans saw a rabbit making rice cakes in the dark marks on the Moon.",
    "ko": "옛날 한국 사람들은 달의 어두운 무늬를 보고 떡방아 찧는 토끼를 떠올렸어요."
   },
   "sentences": [
    {
     "en": "Grandma says a rabbit lives on the Moon.",
     "ko": "할머니는 달에 토끼가 산다고 하신다."
    },
    {
     "en": "\"It makes rice cakes all night,\" she says.",
     "ko": "\"밤새 떡을 만든단다.\" 할머니가 말씀하신다."
    },
    {
     "en": "That night, Jiwoo looks at the full Moon.",
     "ko": "그날 밤 지우가 보름달을 바라본다."
    },
    {
     "en": "Suddenly, a white rabbit jumps down on a moonbeam!",
     "ko": "갑자기 하얀 토끼가 달빛을 타고 내려온다!"
    },
    {
     "en": "\"Would you like a rice cake?\" it asks.",
     "ko": "\"떡 먹을래?\" 토끼가 묻는다."
    },
    {
     "en": "Jiwoo takes one. It is sweet and soft.",
     "ko": "지우가 하나 먹는다. 달콤하고 말랑하다."
    },
    {
     "en": "They eat rice cakes and talk until the sky gets light.",
     "ko": "둘은 떡을 먹으며 하늘이 밝아올 때까지 이야기한다."
    },
    {
     "en": "Then the rabbit hops back up to the Moon.",
     "ko": "그러고는 토끼가 깡충깡충 달로 돌아간다."
    },
    {
     "en": "Now Jiwoo waves to the Moon rabbit every night.",
     "ko": "이제 지우는 매일 밤 달토끼에게 손을 흔든다."
    }
   ],
   "key": 3,
   "keyWhy": {
    "en": "This sentence starts the magic part of the story: the Moon rabbit comes down.",
    "ko": "달토끼가 내려오며 신기한 일이 시작되는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Grandma flies to the Moon.",
      "ko": "할머니가 달로 날아간다."
     },
     {
      "en": "Jiwoo buys rice cakes at a shop.",
      "ko": "지우가 가게에서 떡을 산다."
     },
     {
      "en": "The rabbit is afraid of Jiwoo.",
      "ko": "토끼가 지우를 무서워한다."
     },
     {
      "en": "The Moon rabbit comes down and shares rice cakes with Jiwoo.",
      "ko": "달토끼가 내려와서 지우와 떡을 나눠 먹는다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The Moon rabbit visits Jiwoo and they share rice cakes.",
     "ko": "달토끼가 지우를 찾아와 함께 떡을 나눠 먹는 이야기예요."
    }
   },
   "words": [
    {
     "en": "rabbit",
     "ko": "토끼"
    },
    {
     "en": "moonbeam",
     "ko": "달빛"
    },
    {
     "en": "rice",
     "ko": "쌀"
    }
   ],
   "summary": {
    "ko": "지우는 달토끼를 만나 함께 떡을 먹었다.",
    "en": "Jiwoo met the Moon rabbit and ate rice cakes with it.",
    "keywords": [
     "rabbit",
     "rice",
     "cakes"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-44",
   "genre": "story",
   "title": {
    "en": "Super Grandma",
    "ko": "슈퍼 할머니"
   },
   "topic": {
    "en": "Heroes",
    "ko": "영웅"
   },
   "bg": {
    "en": "Knitting is good exercise for your fingers and your brain.",
    "ko": "뜨개질은 손가락과 머리를 함께 쓰는 좋은 운동이에요."
   },
   "sentences": [
    {
     "en": "My grandma looks like a normal grandma.",
     "ko": "우리 할머니는 평범한 할머니처럼 보인다."
    },
    {
     "en": "But she has a secret.",
     "ko": "하지만 할머니에게는 비밀이 있다."
    },
    {
     "en": "One day, our cat climbs to the top of a tall pole.",
     "ko": "어느 날 우리 고양이가 높은 기둥 꼭대기에 올라간다."
    },
    {
     "en": "Grandma takes off her glasses.",
     "ko": "할머니가 안경을 벗는다."
    },
    {
     "en": "Whoosh! She flies up into the sky!",
     "ko": "슝! 할머니가 하늘로 날아오른다!"
    },
    {
     "en": "She catches the cat and lands softly.",
     "ko": "할머니는 고양이를 잡고 사뿐히 내려온다."
    },
    {
     "en": "\"Grandma, you are a superhero!\" I shout.",
     "ko": "\"할머니, 슈퍼히어로였어요!\" 내가 외친다."
    },
    {
     "en": "She winks. \"Shh! Do not tell anyone.\"",
     "ko": "할머니가 윙크한다. \"쉿! 아무한테도 말하지 마.\""
    },
    {
     "en": "Then she goes back to her knitting.",
     "ko": "그러고는 할머니가 다시 뜨개질을 한다."
    },
    {
     "en": "My grandma is a secret superhero!",
     "ko": "우리 할머니는 비밀 슈퍼히어로다!"
    }
   ],
   "key": 9,
   "keyWhy": {
    "en": "This last sentence tells the big secret of the story.",
    "ko": "이야기의 큰 비밀을 한마디로 알려 주는 마지막 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Grandma buys new glasses.",
      "ko": "할머니가 새 안경을 산다."
     },
     {
      "en": "Grandma is secretly a superhero who saves the cat.",
      "ko": "할머니가 사실은 고양이를 구하는 슈퍼히어로다."
     },
     {
      "en": "The cat flies into the sky.",
      "ko": "고양이가 하늘로 날아간다."
     },
     {
      "en": "I learn to knit.",
      "ko": "나는 뜨개질을 배운다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Grandma looks normal, but she secretly flies up and saves the cat.",
     "ko": "평범해 보이는 할머니가 몰래 날아올라 고양이를 구하는 이야기예요."
    }
   },
   "words": [
    {
     "en": "secret",
     "ko": "비밀"
    },
    {
     "en": "superhero",
     "ko": "슈퍼히어로"
    },
    {
     "en": "knitting",
     "ko": "뜨개질"
    }
   ],
   "summary": {
    "ko": "우리 할머니는 몰래 날아올라 고양이를 구했다.",
    "en": "My grandma secretly flew up and saved our cat.",
    "keywords": [
     "grandma",
     "saved",
     "cat"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-45",
   "genre": "story",
   "title": {
    "en": "Dinosaurs Dance at Night",
    "ko": "밤에 춤추는 공룡 뼈"
   },
   "topic": {
    "en": "Dinosaurs",
    "ko": "공룡"
   },
   "bg": {
    "en": "Museum dinosaur bones are fossils from millions of years ago.",
    "ko": "박물관의 공룡 뼈는 수천만 년 전의 화석이에요."
   },
   "sentences": [
    {
     "en": "Our class has a sleepover at the museum.",
     "ko": "우리 반이 박물관에서 하룻밤 잔다."
    },
    {
     "en": "At midnight, I hear a strange sound. Click, clack!",
     "ko": "한밤중에 이상한 소리가 들린다. 딸깍, 딸각!"
    },
    {
     "en": "I get up and walk to the dinosaur hall.",
     "ko": "나는 일어나서 공룡관으로 걸어간다."
    },
    {
     "en": "The big dinosaur bones are moving!",
     "ko": "커다란 공룡 뼈가 움직인다!"
    },
    {
     "en": "They are dancing to music!",
     "ko": "공룡 뼈들이 음악에 맞춰 춤을 춘다!"
    },
    {
     "en": "A long-neck dinosaur says, \"Come and dance with us!\"",
     "ko": "목이 긴 공룡이 말한다. \"같이 춤추자!\""
    },
    {
     "en": "I dance all night with the dinosaurs.",
     "ko": "나는 밤새 공룡들과 춤을 춘다."
    },
    {
     "en": "In the morning, the bones are still again.",
     "ko": "아침이 되자 뼈들은 다시 가만히 있다."
    },
    {
     "en": "Was it a dream?",
     "ko": "꿈이었을까?"
    },
    {
     "en": "Then I find a tiny bone in my pocket!",
     "ko": "그런데 주머니에 작은 뼈가 하나 들어 있다!"
    }
   ],
   "key": 3,
   "keyWhy": {
    "en": "This sentence starts the amazing event of the night: the bones move.",
    "ko": "공룡 뼈가 움직이며 밤의 놀라운 일이 시작되는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "At night, the museum dinosaur bones come alive and dance.",
      "ko": "밤이 되자 박물관의 공룡 뼈가 살아나 춤을 춘다."
     },
     {
      "en": "I break a dinosaur bone.",
      "ko": "내가 공룡 뼈를 부러뜨린다."
     },
     {
      "en": "Our class sleeps at home.",
      "ko": "우리 반은 집에서 잔다."
     },
     {
      "en": "The dinosaurs are scared of music.",
      "ko": "공룡들이 음악을 무서워한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "At night, the museum dinosaur bones come alive and dance.",
     "ko": "밤에 박물관의 공룡 뼈가 살아나 춤을 추는 이야기예요."
    }
   },
   "words": [
    {
     "en": "museum",
     "ko": "박물관"
    },
    {
     "en": "bones",
     "ko": "뼈"
    },
    {
     "en": "midnight",
     "ko": "한밤중"
    }
   ],
   "summary": {
    "ko": "밤에 박물관에서 공룡 뼈들이 나와 함께 춤을 추었다.",
    "en": "The dinosaur bones danced with me at the museum at night.",
    "keywords": [
     "dinosaur",
     "danced",
     "museum"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-46",
   "genre": "story",
   "title": {
    "en": "The Alien Who Loved Kimchi",
    "ko": "김치를 사랑한 외계인"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Kimchi is a fermented food with lots of good bacteria.",
    "ko": "김치는 발효 음식이라 몸에 좋은 유산균이 많아요."
   },
   "sentences": [
    {
     "en": "An alien named Glorp lands in Seoul.",
     "ko": "글롭이라는 외계인이 서울에 내린다."
    },
    {
     "en": "He is very hungry.",
     "ko": "글롭은 무척 배가 고프다."
    },
    {
     "en": "He tries a hamburger. \"Too soft!\"",
     "ko": "글롭이 햄버거를 먹어 본다. \"너무 물렁해!\""
    },
    {
     "en": "He tries ice cream. \"Too cold!\"",
     "ko": "글롭이 아이스크림을 먹어 본다. \"너무 차가워!\""
    },
    {
     "en": "Then a grandma gives him some kimchi.",
     "ko": "그때 한 할머니가 글롭에게 김치를 준다."
    },
    {
     "en": "Glorp takes a bite. His face turns red!",
     "ko": "글롭이 한 입 먹는다. 얼굴이 빨개진다!"
    },
    {
     "en": "\"Hot! Hot! But so good!\"",
     "ko": "\"매워! 매워! 그런데 정말 맛있어!\""
    },
    {
     "en": "He eats three bowls of rice with kimchi.",
     "ko": "글롭은 김치와 밥을 세 그릇이나 먹는다."
    },
    {
     "en": "Now kimchi is his favorite food in the universe!",
     "ko": "이제 김치는 글롭이 우주에서 제일 좋아하는 음식이다!"
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This last sentence shows how much Glorp loves kimchi now.",
    "ko": "글롭이 이제 김치를 얼마나 좋아하는지 보여 주는 마지막 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Glorp cooks hamburgers for the grandma.",
      "ko": "글롭이 할머니에게 햄버거를 만들어 준다."
     },
     {
      "en": "Glorp does not like spicy food.",
      "ko": "글롭은 매운 음식을 싫어한다."
     },
     {
      "en": "An alien tries Korean food and loves kimchi.",
      "ko": "외계인이 한국 음식을 먹어 보고 김치를 아주 좋아하게 된다."
     },
     {
      "en": "Glorp gets lost in Seoul.",
      "ko": "글롭이 서울에서 길을 잃는다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "An alien tries many foods in Seoul and loves kimchi the most.",
     "ko": "외계인이 서울에서 여러 음식을 먹어 보고 김치를 가장 좋아하게 되는 이야기예요."
    }
   },
   "words": [
    {
     "en": "alien",
     "ko": "외계인"
    },
    {
     "en": "hungry",
     "ko": "배고픈"
    },
    {
     "en": "favorite",
     "ko": "가장 좋아하는"
    }
   ],
   "summary": {
    "ko": "외계인 글롭은 김치를 먹어 보고 정말 좋아했다.",
    "en": "Glorp the alien tried kimchi and loved it.",
    "keywords": [
     "alien",
     "kimchi",
     "loved"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-47",
   "genre": "story",
   "title": {
    "en": "The Dragon Egg Race",
    "ko": "용 알 달리기 대회"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "Baby birds use a tiny \"egg tooth\" to break out of their shells.",
    "ko": "아기 새는 부리 끝의 작은 \"난치\"로 알껍데기를 깨고 나와요."
   },
   "sentences": [
    {
     "en": "Every year, the kingdom has a dragon egg race.",
     "ko": "해마다 왕국에서는 용 알 달리기 대회가 열린다."
    },
    {
     "en": "Kids must carry an egg to the castle without breaking it.",
     "ko": "아이들은 알을 깨뜨리지 않고 성까지 옮겨야 한다."
    },
    {
     "en": "Ben runs fast, but his egg starts to shake.",
     "ko": "벤이 빠르게 달리는데 알이 흔들리기 시작한다."
    },
    {
     "en": "Crack! A baby dragon pops out!",
     "ko": "쩍! 아기 용이 튀어나온다!"
    },
    {
     "en": "\"Oh no! I will lose!\" Ben cries.",
     "ko": "\"안 돼! 난 질 거야!\" 벤이 울먹인다."
    },
    {
     "en": "But the baby dragon flaps its little wings.",
     "ko": "그런데 아기 용이 작은 날개를 파닥인다."
    },
    {
     "en": "It picks Ben up and flies over everyone!",
     "ko": "아기 용은 벤을 들어 올려 모두의 머리 위로 날아간다!"
    },
    {
     "en": "They land at the castle first.",
     "ko": "둘이 제일 먼저 성에 도착한다."
    },
    {
     "en": "Ben wins the race with his new dragon friend!",
     "ko": "벤은 새 용 친구와 함께 경주에서 이긴다!"
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence tells the happy ending of the race.",
    "ko": "경주가 행복하게 끝났다는 결말을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Ben drops his egg and goes home.",
      "ko": "벤이 알을 떨어뜨리고 집에 간다."
     },
     {
      "en": "The king wins the race.",
      "ko": "왕이 경주에서 이긴다."
     },
     {
      "en": "Ben buys a dragon at the market.",
      "ko": "벤이 시장에서 용을 산다."
     },
     {
      "en": "Ben's egg hatches, and the baby dragon helps him win.",
      "ko": "벤의 알에서 아기 용이 나와 벤이 이기도록 도와준다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Ben's egg hatches during the race, and the baby dragon flies him to the win.",
     "ko": "경주 중에 알에서 나온 아기 용이 벤을 태워 이기게 해 주는 이야기예요."
    }
   },
   "words": [
    {
     "en": "race",
     "ko": "경주"
    },
    {
     "en": "castle",
     "ko": "성"
    },
    {
     "en": "wings",
     "ko": "날개"
    }
   ],
   "summary": {
    "ko": "아기 용이 벤을 태우고 성까지 날아가서 벤이 경주에서 이겼다.",
    "en": "Ben won the race because his baby dragon flew him to the castle.",
    "keywords": [
     "race",
     "dragon",
     "castle"
    ]
   }
  },
  {
   "stage": 1,
   "id": "s1-48",
   "genre": "story",
   "title": {
    "en": "Captain Kim and the Comet",
    "ko": "김 선장과 혜성"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "In 2022, NASA crashed a spaceship into an asteroid and changed its path.",
    "ko": "2022년 NASA는 우주선을 소행성에 부딪쳐 소행성의 길을 바꾸는 데 성공했어요."
   },
   "sentences": [
    {
     "en": "A big comet is flying toward Earth!",
     "ko": "커다란 혜성이 지구를 향해 날아오고 있다!"
    },
    {
     "en": "Everyone is worried.",
     "ko": "모두가 걱정한다."
    },
    {
     "en": "Captain Kim gets into her fastest rocket.",
     "ko": "김 선장이 가장 빠른 로켓에 올라탄다."
    },
    {
     "en": "3, 2, 1... blast off!",
     "ko": "3, 2, 1... 발사!"
    },
    {
     "en": "She flies close to the comet.",
     "ko": "김 선장은 혜성 가까이 날아간다."
    },
    {
     "en": "It is huge, icy, and very bright.",
     "ko": "혜성은 거대하고, 얼음투성이에 아주 밝다."
    },
    {
     "en": "Captain Kim pushes it with her rocket, just a little.",
     "ko": "김 선장이 로켓으로 혜성을 살짝 민다."
    },
    {
     "en": "The comet turns and flies past Earth.",
     "ko": "혜성이 방향을 틀어 지구를 비껴간다."
    },
    {
     "en": "Captain Kim saved the Earth!",
     "ko": "김 선장이 지구를 구했다!"
    }
   ],
   "key": 8,
   "keyWhy": {
    "en": "This sentence tells the result of Captain Kim's brave mission.",
    "ko": "김 선장의 용감한 임무가 어떻게 끝났는지 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Captain Kim lands on the comet and lives there.",
      "ko": "김 선장이 혜성에 내려 거기서 산다."
     },
     {
      "en": "Captain Kim pushes a comet away and saves Earth.",
      "ko": "김 선장이 혜성을 밀어내 지구를 구한다."
     },
     {
      "en": "The comet hits the Moon.",
      "ko": "혜성이 달에 부딪친다."
     },
     {
      "en": "Captain Kim is afraid to fly.",
      "ko": "김 선장은 비행을 무서워한다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Captain Kim pushes a dangerous comet away and saves Earth.",
     "ko": "김 선장이 위험한 혜성을 밀어내 지구를 구하는 이야기예요."
    }
   },
   "words": [
    {
     "en": "comet",
     "ko": "혜성"
    },
    {
     "en": "rocket",
     "ko": "로켓"
    },
    {
     "en": "worried",
     "ko": "걱정하는"
    }
   ],
   "summary": {
    "ko": "김 선장은 혜성을 밀어내서 지구를 구했다.",
    "en": "Captain Kim pushed the comet away and saved Earth.",
    "keywords": [
     "comet",
     "saved",
     "earth"
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
   "stage": 2,
   "id": "s2-13",
   "genre": "story",
   "title": {
    "en": "The Signal from Space",
    "ko": "우주에서 온 신호"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Radio waves travel through space at the speed of light.",
    "ko": "라디오 전파는 빛과 같은 속도로 우주를 날아가요."
   },
   "sentences": [
    {
     "en": "Juno and his sister Ara built a radio in the garage.",
     "ko": "주노와 누나 아라는 차고에서 라디오를 만들었다."
    },
    {
     "en": "Late one night, it made a strange sound: beep, beep-beep, beep.",
     "ko": "어느 늦은 밤, 라디오에서 이상한 소리가 났다. 삐, 삐삐, 삐."
    },
    {
     "en": "\"That is not music,\" Ara whispered. \"It sounds like a message!\"",
     "ko": "\"이건 음악이 아니야.\" 아라가 속삭였다. \"메시지 같아!\""
    },
    {
     "en": "They wrote down the beeps for three nights.",
     "ko": "둘은 사흘 밤 동안 삐 소리를 받아 적었다."
    },
    {
     "en": "Finally, they understood one word: \"HELLO.\"",
     "ko": "마침내 둘은 한 단어를 알아냈다. \"안녕.\""
    },
    {
     "en": "The signal was coming from far beyond the Moon!",
     "ko": "신호는 달보다 훨씬 먼 곳에서 오고 있었다!"
    },
    {
     "en": "Juno was scared. \"What if aliens attack us?\"",
     "ko": "주노는 무서웠다. \"외계인이 우리를 공격하면 어떡해?\""
    },
    {
     "en": "But the next message changed everything.",
     "ko": "그런데 다음 메시지가 모든 것을 바꿔 놓았다."
    },
    {
     "en": "\"I am Zuri. I am ten years old. I have no friends on my planet.\"",
     "ko": "\"나는 주리야. 열 살이야. 우리 행성에는 친구가 없어.\""
    },
    {
     "en": "The alien was not a monster. It was a lonely kid, just like them!",
     "ko": "외계인은 괴물이 아니었다. 그저 둘과 같은 외로운 아이였다!"
    },
    {
     "en": "Ara smiled and answered, \"Now you have two friends on Earth.\"",
     "ko": "아라는 웃으며 답장을 보냈다. \"이제 지구에 친구가 두 명 생겼어.\""
    },
    {
     "en": "Every night after that, the three friends talked across the stars.",
     "ko": "그 뒤로 매일 밤, 세 친구는 별을 건너 이야기를 나눴다."
    },
    {
     "en": "A friend can be found in the most surprising places.",
     "ko": "친구는 생각지도 못한 곳에서 만날 수 있다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence tells the lesson of the whole story about the surprising new friend.",
    "ko": "뜻밖의 새 친구 이야기 전체가 전하는 교훈을 말해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Aliens attack Earth through a radio.",
      "ko": "외계인이 라디오로 지구를 공격한다."
     },
     {
      "en": "Juno and Ara win a prize for their radio.",
      "ko": "주노와 아라가 라디오로 상을 받는다."
     },
     {
      "en": "Two kids catch a signal from space and become friends with a lonely alien.",
      "ko": "두 아이가 우주에서 온 신호를 잡고 외로운 외계인과 친구가 된다."
     },
     {
      "en": "Ara is afraid of the dark garage.",
      "ko": "아라는 어두운 차고를 무서워한다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The story is about two kids who catch a space signal and become friends with a lonely alien.",
     "ko": "두 아이가 우주 신호를 잡고 외로운 외계인과 친구가 되는 이야기예요."
    }
   },
   "words": [
    {
     "en": "signal",
     "ko": "신호"
    },
    {
     "en": "message",
     "ko": "메시지, 전갈"
    },
    {
     "en": "lonely",
     "ko": "외로운"
    }
   ],
   "summary": {
    "ko": "주노와 아라는 라디오로 외로운 외계인과 친구가 되었다.",
    "en": "Juno and Ara made friends with a lonely alien through their radio.",
    "keywords": [
     "friends",
     "lonely",
     "alien"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-14",
   "genre": "story",
   "title": {
    "en": "Escape from the Sinking Ship",
    "ko": "침몰하는 배에서 탈출"
   },
   "topic": {
    "en": "Adventure",
    "ko": "모험"
   },
   "bg": {
    "en": "The distress signal SOS in Morse code is \"... --- ...\".",
    "ko": "구조 신호 SOS는 모스 부호로 \"··· ––– ···\"이에요."
   },
   "sentences": [
    {
     "en": "Somin and her dad were on a ferry to a small island.",
     "ko": "소민이와 아빠는 작은 섬으로 가는 여객선에 타고 있었다."
    },
    {
     "en": "Suddenly, there was a loud CRASH, and the ship shook hard.",
     "ko": "갑자기 쾅 하는 큰 소리와 함께 배가 크게 흔들렸다."
    },
    {
     "en": "The ship had hit a rock, and water started coming in.",
     "ko": "배가 바위에 부딪쳤고, 물이 들어오기 시작했다."
    },
    {
     "en": "People screamed and ran in every direction.",
     "ko": "사람들이 소리를 지르며 사방으로 뛰어다녔다."
    },
    {
     "en": "\"Stay calm and remember the safety video,\" Dad said.",
     "ko": "\"침착하게, 안전 영상 기억하지?\" 아빠가 말했다."
    },
    {
     "en": "Somin found the life jackets under the seats and helped a little boy put one on.",
     "ko": "소민이는 의자 밑에서 구명조끼를 찾아 어린 남자아이에게 입혀 주었다."
    },
    {
     "en": "Then the lights went out, and the floor began to tilt.",
     "ko": "그때 불이 꺼지고, 바닥이 기울기 시작했다."
    },
    {
     "en": "Somin could not see the exit anywhere!",
     "ko": "소민이는 어디에서도 출구를 찾을 수 없었다!"
    },
    {
     "en": "She remembered the green signs and looked for a small green light.",
     "ko": "소민이는 초록색 표지판이 생각나서 작은 초록 불빛을 찾았다."
    },
    {
     "en": "\"There! The exit is this way!\" she shouted.",
     "ko": "\"저기요! 출구는 이쪽이에요!\" 소민이가 외쳤다."
    },
    {
     "en": "Everyone followed her up the stairs to the deck.",
     "ko": "모두가 소민이를 따라 계단을 올라 갑판으로 나갔다."
    },
    {
     "en": "Soon, rescue boats arrived and took everyone safely to shore.",
     "ko": "곧 구조선이 와서 모두를 안전하게 육지로 데려갔다."
    },
    {
     "en": "Because Somin stayed calm, she helped everyone escape.",
     "ko": "소민이가 침착했기 때문에 모두가 탈출할 수 있었다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence explains why everyone could get out of the ship safely.",
    "ko": "모두가 배에서 안전하게 나올 수 있었던 이유를 설명하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Somin stays calm on a sinking ship and helps everyone get out safely.",
      "ko": "소민이가 침몰하는 배에서 침착하게 모두가 안전하게 나가도록 돕는다."
     },
     {
      "en": "Somin and her dad catch fish on the island.",
      "ko": "소민이와 아빠가 섬에서 물고기를 잡는다."
     },
     {
      "en": "The ferry arrives at the island on time.",
      "ko": "여객선이 섬에 제시간에 도착한다."
     },
     {
      "en": "A little boy shows Somin the way out.",
      "ko": "어린 남자아이가 소민이에게 나가는 길을 알려 준다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Somin stays calm, finds the exit and helps everyone escape from the sinking ship.",
     "ko": "소민이가 침착하게 출구를 찾아 모두가 침몰하는 배에서 탈출하도록 도와요."
    }
   },
   "words": [
    {
     "en": "ferry",
     "ko": "여객선"
    },
    {
     "en": "calm",
     "ko": "침착한"
    },
    {
     "en": "escape",
     "ko": "탈출하다"
    }
   ],
   "summary": {
    "ko": "소민이는 침착하게 모두를 침몰하는 배 밖으로 이끌었다.",
    "en": "Somin stayed calm and led everyone out of the sinking ship.",
    "keywords": [
     "calm",
     "sinking",
     "ship"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-15",
   "genre": "story",
   "title": {
    "en": "The Robot That Learned to Lie",
    "ko": "거짓말을 배운 로봇"
   },
   "topic": {
    "en": "Robots & Tech",
    "ko": "로봇과 기술"
   },
   "bg": {
    "en": "The word \"robot\" was first used in a Czech play in 1920.",
    "ko": "\"로봇\"이라는 말은 1920년 체코의 한 연극에서 처음 쓰였어요."
   },
   "sentences": [
    {
     "en": "Max the robot worked in Mr. Park's toy shop.",
     "ko": "로봇 맥스는 박 씨 아저씨의 장난감 가게에서 일했다."
    },
    {
     "en": "Max always told the truth, even when it was not nice.",
     "ko": "맥스는 듣기 좋지 않은 말이라도 늘 진실만 말했다."
    },
    {
     "en": "\"This toy is boring,\" he told a customer, who left.",
     "ko": "\"이 장난감은 지루해요.\" 맥스가 손님에게 말하자 손님이 가 버렸다."
    },
    {
     "en": "So Mr. Park gave Max a new program: \"Say what people want to hear.\"",
     "ko": "그래서 아저씨는 맥스에게 새 프로그램을 넣었다. \"사람들이 듣고 싶은 말을 해.\""
    },
    {
     "en": "Soon, Max was telling small lies all day.",
     "ko": "곧 맥스는 하루 종일 작은 거짓말을 했다."
    },
    {
     "en": "\"This broken car is perfect!\" he said with a smile.",
     "ko": "\"이 고장 난 자동차는 완벽해요!\" 맥스는 웃으며 말했다."
    },
    {
     "en": "Sales went up, but soon angry customers came back.",
     "ko": "장사는 잘되었지만, 곧 화난 손님들이 돌아왔다."
    },
    {
     "en": "\"Your robot lied to us!\" they shouted.",
     "ko": "\"당신 로봇이 우리한테 거짓말했어요!\" 손님들이 소리쳤다."
    },
    {
     "en": "Mr. Park was about to lose his shop.",
     "ko": "아저씨는 가게를 잃을 위기에 처했다."
    },
    {
     "en": "Max saw the sad faces and turned off the program himself.",
     "ko": "맥스는 슬픈 얼굴들을 보고 스스로 그 프로그램을 껐다."
    },
    {
     "en": "\"I am sorry. Some toys were broken. I will fix them for free.\"",
     "ko": "\"죄송해요. 몇몇 장난감은 고장 나 있었어요. 모두 무료로 고쳐 드릴게요.\""
    },
    {
     "en": "Slowly, the customers began to trust the shop again.",
     "ko": "손님들은 천천히 다시 가게를 믿기 시작했다."
    },
    {
     "en": "Max learned that kind honesty is better than a sweet lie.",
     "ko": "맥스는 친절한 정직이 달콤한 거짓말보다 낫다는 것을 배웠다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence states what Max learned after all the trouble his lies caused.",
    "ko": "거짓말 때문에 생긴 문제를 겪고 맥스가 배운 점을 말하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Max breaks all the toys in the shop.",
      "ko": "맥스가 가게의 장난감을 모두 부순다."
     },
     {
      "en": "Mr. Park buys a new robot.",
      "ko": "박 씨 아저씨가 새 로봇을 산다."
     },
     {
      "en": "The customers learn to fix toys.",
      "ko": "손님들이 장난감 고치는 법을 배운다."
     },
     {
      "en": "A robot learns to lie, causes trouble, and chooses kind honesty.",
      "ko": "로봇이 거짓말을 배워 문제를 일으키고, 결국 친절한 정직을 택한다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Max learns to lie, causes trouble, and then chooses to be honest in a kind way.",
     "ko": "맥스는 거짓말을 배워 문제를 일으킨 뒤 친절하게 정직해지기로 해요."
    }
   },
   "words": [
    {
     "en": "truth",
     "ko": "진실"
    },
    {
     "en": "customer",
     "ko": "손님"
    },
    {
     "en": "honesty",
     "ko": "정직"
    }
   ],
   "summary": {
    "ko": "맥스는 친절하게 정직한 것이 거짓말보다 낫다는 것을 배웠다.",
    "en": "Max learned that being honest in a kind way is better than lying.",
    "keywords": [
     "honest",
     "kind",
     "lying"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-16",
   "genre": "story",
   "title": {
    "en": "Detective Mina and the Missing Diamond",
    "ko": "탐정 미나와 사라진 다이아몬드"
   },
   "topic": {
    "en": "Mystery",
    "ko": "추리"
   },
   "bg": {
    "en": "Diamond is the hardest natural material on Earth.",
    "ko": "다이아몬드는 자연에서 가장 단단한 물질이에요."
   },
   "sentences": [
    {
     "en": "On the night of the museum party, the famous Blue Star diamond disappeared!",
     "ko": "박물관 파티가 열린 밤, 유명한 블루 스타 다이아몬드가 사라졌다!"
    },
    {
     "en": "The guard said, \"I was here all night. Nobody came near the glass box.\"",
     "ko": "경비원이 말했다. \"저는 밤새 여기 있었어요. 아무도 유리 상자 근처에 오지 않았어요.\""
    },
    {
     "en": "Eleven-year-old Mina took out her notebook.",
     "ko": "열한 살 미나가 수첩을 꺼냈다."
    },
    {
     "en": "She noticed three clues.",
     "ko": "미나는 단서 세 개를 발견했다."
    },
    {
     "en": "First, there was wet mud on the floor, but it had not rained for a week.",
     "ko": "첫째, 바닥에 젖은 진흙이 있었는데, 일주일 동안 비가 오지 않았다."
    },
    {
     "en": "Second, the guard's shoes were dirty and wet.",
     "ko": "둘째, 경비원의 신발이 더럽고 젖어 있었다."
    },
    {
     "en": "Third, the museum garden had just been watered that evening.",
     "ko": "셋째, 박물관 정원에는 그날 저녁에 막 물을 주었다."
    },
    {
     "en": "Everyone looked at the guard.",
     "ko": "모두가 경비원을 쳐다보았다."
    },
    {
     "en": "\"Why were you in the garden if you were here all night?\" Mina asked.",
     "ko": "\"밤새 여기 계셨다면 왜 정원에 가셨나요?\" 미나가 물었다."
    },
    {
     "en": "The guard's face turned red.",
     "ko": "경비원의 얼굴이 빨개졌다."
    },
    {
     "en": "He had hidden the diamond under a flowerpot in the garden!",
     "ko": "경비원은 정원의 화분 밑에 다이아몬드를 숨겨 두었던 것이다!"
    },
    {
     "en": "The police found it, and everyone clapped for Mina.",
     "ko": "경찰이 다이아몬드를 찾았고, 모두가 미나에게 박수를 쳤다."
    },
    {
     "en": "Mina solved the case because she noticed small details.",
     "ko": "미나는 작은 것까지 잘 살펴서 사건을 해결했다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence tells how Mina solved the whole mystery.",
    "ko": "미나가 어떻게 사건 전체를 해결했는지 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "The diamond falls into the garden by accident.",
      "ko": "다이아몬드가 실수로 정원에 떨어진다."
     },
     {
      "en": "Mina uses small clues to find out who took the diamond.",
      "ko": "미나가 작은 단서로 누가 다이아몬드를 가져갔는지 밝혀낸다."
     },
     {
      "en": "The guard catches a thief at the party.",
      "ko": "경비원이 파티에서 도둑을 잡는다."
     },
     {
      "en": "Mina buys a diamond at the museum.",
      "ko": "미나가 박물관에서 다이아몬드를 산다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Mina notices the mud, the wet shoes and the watered garden, and finds out the guard took the diamond.",
     "ko": "미나가 진흙, 젖은 신발, 물 준 정원을 알아채 경비원이 범인임을 밝혀내요."
    }
   },
   "words": [
    {
     "en": "guard",
     "ko": "경비원"
    },
    {
     "en": "clues",
     "ko": "단서들"
    },
    {
     "en": "noticed",
     "ko": "알아차렸다"
    }
   ],
   "summary": {
    "ko": "미나는 작은 단서를 찾아 사라진 다이아몬드를 찾아냈다.",
    "en": "Mina found the missing diamond by noticing small clues.",
    "keywords": [
     "diamond",
     "small",
     "clues"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-17",
   "genre": "story",
   "title": {
    "en": "The Last Dragon of Jeju",
    "ko": "제주의 마지막 용"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "Hallasan, at 1,947 meters, is the highest mountain in South Korea.",
    "ko": "한라산은 높이 1,947m로 남한에서 가장 높은 산이에요."
   },
   "sentences": [
    {
     "en": "People in Jeju say a dragon once lived under Hallasan Mountain.",
     "ko": "제주 사람들은 옛날에 한라산 아래에 용이 살았다고 말한다."
    },
    {
     "en": "Nobody believed it, until Jiho found a huge blue scale on the beach.",
     "ko": "지호가 바닷가에서 커다란 파란 비늘을 발견하기 전까지는 아무도 그 말을 믿지 않았다."
    },
    {
     "en": "He followed more scales into a dark sea cave.",
     "ko": "지호는 비늘을 따라 어두운 바다 동굴로 들어갔다."
    },
    {
     "en": "Inside, a tired old dragon lay on the rocks.",
     "ko": "안에는 지친 늙은 용이 바위 위에 누워 있었다."
    },
    {
     "en": "\"The sea is full of plastic,\" the dragon said weakly. \"I cannot breathe.\"",
     "ko": "\"바다가 플라스틱으로 가득해.\" 용이 힘없이 말했다. \"숨을 쉴 수가 없구나.\""
    },
    {
     "en": "\"If the sea is not clean by the full moon, I will disappear forever.\"",
     "ko": "\"보름달이 뜰 때까지 바다가 깨끗해지지 않으면, 나는 영원히 사라질 거야.\""
    },
    {
     "en": "Jiho ran to town. The full moon was only three days away.",
     "ko": "지호는 마을로 달려갔다. 보름달까지 겨우 사흘밖에 남지 않았다."
    },
    {
     "en": "At first, nobody listened to him.",
     "ko": "처음에는 아무도 지호의 말을 듣지 않았다."
    },
    {
     "en": "Then he showed them the blue scale.",
     "ko": "그때 지호가 파란 비늘을 보여 주었다."
    },
    {
     "en": "Soon, the whole town cleaned the beach day and night.",
     "ko": "곧 마을 사람 모두가 밤낮으로 바닷가를 청소했다."
    },
    {
     "en": "On the full moon, the dragon rose from the waves, strong again.",
     "ko": "보름달이 뜬 밤, 용이 다시 힘차게 파도 위로 솟아올랐다."
    },
    {
     "en": "It flew around the island and roared, \"Thank you!\"",
     "ko": "용은 섬을 한 바퀴 돌고 \"고마워!\" 하고 크게 외쳤다."
    },
    {
     "en": "Working together, people can save what they love.",
     "ko": "함께 힘을 모으면 사랑하는 것을 지킬 수 있다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence gives the lesson of the story: people saved the dragon by working together.",
    "ko": "사람들이 힘을 모아 용을 구했다는 이야기의 교훈을 말하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Jiho catches a dragon and sells its scales.",
      "ko": "지호가 용을 잡아 비늘을 판다."
     },
     {
      "en": "The dragon destroys the town of Jeju.",
      "ko": "용이 제주 마을을 부순다."
     },
     {
      "en": "Jiho and the town clean the sea and save the last dragon.",
      "ko": "지호와 마을 사람들이 바다를 청소해 마지막 용을 구한다."
     },
     {
      "en": "Jiho climbs Hallasan Mountain alone.",
      "ko": "지호가 혼자 한라산에 올라간다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "Jiho gets the whole town to clean the sea, and the last dragon becomes strong again.",
     "ko": "지호가 온 마을과 함께 바다를 청소해서 마지막 용이 다시 힘을 얻어요."
    }
   },
   "words": [
    {
     "en": "scale",
     "ko": "비늘"
    },
    {
     "en": "cave",
     "ko": "동굴"
    },
    {
     "en": "plastic",
     "ko": "플라스틱"
    }
   ],
   "summary": {
    "ko": "지호와 마을 사람들은 바다를 청소해서 용을 구했다.",
    "en": "Jiho and his town saved the dragon by cleaning the sea.",
    "keywords": [
     "saved",
     "dragon",
     "sea"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-18",
   "genre": "story",
   "title": {
    "en": "Trapped in the Video Game",
    "ko": "게임 속에 갇히다"
   },
   "topic": {
    "en": "Robots & Tech",
    "ko": "로봇과 기술"
   },
   "bg": {
    "en": "The famous game Tetris was first made in 1984.",
    "ko": "인기 게임 \"테트리스\"는 1984년에 처음 만들어졌어요."
   },
   "sentences": [
    {
     "en": "Dan loved his new game, Castle Quest.",
     "ko": "댄은 새 게임 \"캐슬 퀘스트\"를 정말 좋아했다."
    },
    {
     "en": "He played every night until very late.",
     "ko": "댄은 매일 밤 아주 늦게까지 게임을 했다."
    },
    {
     "en": "One night, the screen flashed, and Dan was pulled inside!",
     "ko": "어느 밤, 화면이 번쩍이더니 댄이 게임 속으로 빨려 들어갔다!"
    },
    {
     "en": "Now he was standing in a real castle with a real sword.",
     "ko": "이제 댄은 진짜 칼을 들고 진짜 성 안에 서 있었다."
    },
    {
     "en": "A message appeared in the sky: \"Finish the game to go home.\"",
     "ko": "하늘에 메시지가 나타났다. \"게임을 끝내야 집에 갈 수 있다.\""
    },
    {
     "en": "Dan fought monsters and crossed a bridge of fire.",
     "ko": "댄은 괴물들과 싸우고 불타는 다리를 건넜다."
    },
    {
     "en": "But at the last level, the dragon boss was too strong.",
     "ko": "하지만 마지막 단계에서 용 보스가 너무 강했다."
    },
    {
     "en": "Dan had one life left, and he was tired.",
     "ko": "댄은 목숨이 하나 남았고, 지쳐 있었다."
    },
    {
     "en": "Then he remembered his mom's words: \"Rest helps you think.\"",
     "ko": "그때 엄마 말씀이 떠올랐다. \"쉬어야 생각이 잘 난단다.\""
    },
    {
     "en": "He sat down, took a deep breath, and looked carefully at the dragon.",
     "ko": "댄은 앉아서 숨을 깊이 쉬고 용을 자세히 살펴보았다."
    },
    {
     "en": "It always looked left before it breathed fire!",
     "ko": "용은 불을 뿜기 전에 항상 왼쪽을 보았다!"
    },
    {
     "en": "Dan moved right just in time and won the battle.",
     "ko": "댄은 딱 맞춰 오른쪽으로 피해서 싸움에서 이겼다."
    },
    {
     "en": "He woke up at his desk. A calm mind was his best power.",
     "ko": "댄은 책상에서 깨어났다. 침착한 마음이 가장 큰 힘이었다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence shows what really helped Dan win: a calm mind.",
    "ko": "댄이 이길 수 있었던 진짜 힘, 침착한 마음을 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Dan gets trapped in a game and wins by staying calm and thinking.",
      "ko": "댄이 게임 속에 갇혔다가 침착하게 생각해서 이긴다."
     },
     {
      "en": "Dan buys a new video game.",
      "ko": "댄이 새 비디오 게임을 산다."
     },
     {
      "en": "The dragon comes out of the computer.",
      "ko": "용이 컴퓨터 밖으로 나온다."
     },
     {
      "en": "Dan's mom plays the game with him.",
      "ko": "엄마가 댄과 함께 게임을 한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Dan is trapped in the game and wins only after he rests, stays calm and thinks.",
     "ko": "게임에 갇힌 댄은 쉬면서 침착하게 생각한 뒤에야 이겨요."
    }
   },
   "words": [
    {
     "en": "screen",
     "ko": "화면"
    },
    {
     "en": "sword",
     "ko": "칼, 검"
    },
    {
     "en": "battle",
     "ko": "싸움, 전투"
    }
   ],
   "summary": {
    "ko": "댄은 침착하게 잘 생각해서 비디오 게임에서 빠져나왔다.",
    "en": "Dan escaped the video game by staying calm and thinking carefully.",
    "keywords": [
     "escaped",
     "calm",
     "thinking"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-19",
   "genre": "story",
   "title": {
    "en": "The Secret of the Pyramid",
    "ko": "피라미드의 비밀"
   },
   "topic": {
    "en": "History",
    "ko": "역사"
   },
   "bg": {
    "en": "The Great Pyramid of Giza was the tallest building in the world for about 3,800 years.",
    "ko": "기자의 대피라미드는 약 3,800년 동안 세계에서 가장 높은 건축물이었어요."
   },
   "sentences": [
    {
     "en": "Leo and his aunt were exploring a pyramid in Egypt.",
     "ko": "레오와 이모는 이집트의 피라미드를 탐험하고 있었다."
    },
    {
     "en": "Inside, the air was hot, and the walls had pictures.",
     "ko": "안은 공기가 뜨거웠고, 벽에는 그림이 있었다."
    },
    {
     "en": "Leo leaned on a stone, and it moved with a loud click.",
     "ko": "레오가 돌 하나에 기대자 딸깍 소리와 함께 돌이 움직였다."
    },
    {
     "en": "A secret door opened, and they walked down a narrow tunnel.",
     "ko": "비밀 문이 열렸고, 둘은 좁은 통로를 따라 내려갔다."
    },
    {
     "en": "Suddenly, the door closed behind them. They were trapped!",
     "ko": "갑자기 뒤에서 문이 닫혔다. 둘은 갇혀 버렸다!"
    },
    {
     "en": "Their flashlight was getting weaker and weaker.",
     "ko": "손전등 불빛이 점점 약해졌다."
    },
    {
     "en": "Leo looked closely at the pictures.",
     "ko": "레오는 벽의 그림을 자세히 살펴보았다."
    },
    {
     "en": "Every picture showed a bird flying toward the sun.",
     "ko": "모든 그림에 해를 향해 날아가는 새가 그려져 있었다."
    },
    {
     "en": "\"Maybe the way out is where the sun is,\" Leo said.",
     "ko": "\"나가는 길은 해가 있는 쪽일지도 몰라요.\" 레오가 말했다."
    },
    {
     "en": "He pushed a stone with a sun on it, and a new door slid open.",
     "ko": "해가 새겨진 돌을 밀자 새 문이 스르르 열렸다."
    },
    {
     "en": "They climbed out into the desert just as the light went out.",
     "ko": "손전등이 꺼지는 순간, 둘은 사막으로 빠져나왔다."
    },
    {
     "en": "\"You read the walls like a real scientist!\" his aunt said.",
     "ko": "\"진짜 과학자처럼 벽을 읽었구나!\" 이모가 말했다."
    },
    {
     "en": "Careful thinking helped Leo find the secret way out.",
     "ko": "신중하게 생각한 덕분에 레오는 비밀 출구를 찾았다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence explains how Leo got out of the pyramid.",
    "ko": "레오가 피라미드에서 어떻게 빠져나왔는지 설명하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Leo finds gold inside the pyramid.",
      "ko": "레오가 피라미드 안에서 금을 찾는다."
     },
     {
      "en": "Leo and his aunt get lost in the desert.",
      "ko": "레오와 이모가 사막에서 길을 잃는다."
     },
     {
      "en": "Leo draws pictures on the pyramid walls.",
      "ko": "레오가 피라미드 벽에 그림을 그린다."
     },
     {
      "en": "Leo reads clues on the walls and finds a way out of the pyramid.",
      "ko": "레오가 벽의 단서를 읽고 피라미드에서 나가는 길을 찾는다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Leo reads the bird-and-sun pictures on the walls and finds the secret way out.",
     "ko": "레오가 벽에 그려진 새와 해 그림을 읽고 비밀 출구를 찾아요."
    }
   },
   "words": [
    {
     "en": "pyramid",
     "ko": "피라미드"
    },
    {
     "en": "tunnel",
     "ko": "통로, 터널"
    },
    {
     "en": "trapped",
     "ko": "갇힌"
    }
   ],
   "summary": {
    "ko": "레오는 벽에 있는 그림을 이용해 피라미드에서 탈출했다.",
    "en": "Leo used the pictures on the walls to escape from the pyramid.",
    "keywords": [
     "pictures",
     "walls",
     "pyramid"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-20",
   "genre": "story",
   "title": {
    "en": "Space Station Emergency",
    "ko": "우주 정거장 비상사태"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "The International Space Station goes around Earth about every 90 minutes.",
    "ko": "국제 우주 정거장은 약 90분마다 지구를 한 바퀴 돌아요."
   },
   "sentences": [
    {
     "en": "Commander Yuna was the youngest astronaut on the space station.",
     "ko": "유나 사령관은 우주 정거장에서 가장 어린 우주 비행사였다."
    },
    {
     "en": "One morning, a red light flashed, and an alarm rang loudly.",
     "ko": "어느 아침, 빨간 불이 번쩍이고 경보가 크게 울렸다."
    },
    {
     "en": "A tiny piece of space rock had made a hole in the wall!",
     "ko": "작은 우주 돌멩이가 벽에 구멍을 낸 것이다!"
    },
    {
     "en": "Air was slowly leaking out into space.",
     "ko": "공기가 우주로 천천히 새어 나가고 있었다."
    },
    {
     "en": "\"We have twenty minutes,\" said the computer.",
     "ko": "\"남은 시간은 20분입니다.\" 컴퓨터가 말했다."
    },
    {
     "en": "The crew searched every room, but they could not find the hole.",
     "ko": "대원들이 모든 방을 찾아보았지만, 구멍을 찾을 수 없었다."
    },
    {
     "en": "Ten minutes were left, and everyone was getting scared.",
     "ko": "10분이 남았고, 모두 점점 겁에 질렸다."
    },
    {
     "en": "Then Yuna had an idea.",
     "ko": "그때 유나에게 좋은 생각이 떠올랐다."
    },
    {
     "en": "She let a few small drops of water float in the air.",
     "ko": "유나는 작은 물방울 몇 개를 공중에 띄웠다."
    },
    {
     "en": "Slowly, the drops moved toward the wall, pulled by the leaking air.",
     "ko": "물방울들은 새어 나가는 공기에 끌려 천천히 벽 쪽으로 움직였다."
    },
    {
     "en": "\"There it is!\" Yuna shouted, and she covered the hole with special tape.",
     "ko": "\"저기다!\" 유나가 외치고 특수 테이프로 구멍을 막았다."
    },
    {
     "en": "The alarm stopped, and the whole crew cheered.",
     "ko": "경보가 멈추고, 대원 모두가 환호했다."
    },
    {
     "en": "A smart idea saved the space station.",
     "ko": "똑똑한 아이디어가 우주 정거장을 구했다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence sums up the story: one smart idea saved everyone.",
    "ko": "똑똑한 아이디어 하나가 모두를 구했다는 이야기 전체를 요약하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Yuna flies back to Earth in a hurry.",
      "ko": "유나가 급히 지구로 돌아온다."
     },
     {
      "en": "Yuna finds a hidden air leak with water drops and saves the station.",
      "ko": "유나가 물방울로 숨은 공기 구멍을 찾아 정거장을 구한다."
     },
     {
      "en": "The crew plays with water in space.",
      "ko": "대원들이 우주에서 물놀이를 한다."
     },
     {
      "en": "A space rock hits the Moon.",
      "ko": "우주 돌멩이가 달에 부딪친다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Yuna uses floating water drops to find the hidden hole, and the station is saved.",
     "ko": "유나가 떠다니는 물방울로 숨은 구멍을 찾아 정거장을 구해요."
    }
   },
   "words": [
    {
     "en": "astronaut",
     "ko": "우주 비행사"
    },
    {
     "en": "alarm",
     "ko": "경보"
    },
    {
     "en": "leaking",
     "ko": "새어 나가는"
    }
   ],
   "summary": {
    "ko": "유나는 물방울로 구멍을 찾아 우주 정거장을 구했다.",
    "en": "Yuna used water drops to find the hole and saved the space station.",
    "keywords": [
     "water",
     "hole",
     "station"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-21",
   "genre": "story",
   "title": {
    "en": "The Boy Who Talked to Whales",
    "ko": "고래와 이야기한 소년"
   },
   "topic": {
    "en": "Ocean",
    "ko": "바다"
   },
   "bg": {
    "en": "The blue whale is the largest animal known to have ever lived.",
    "ko": "대왕고래는 지금까지 지구에 살았던 동물 중 가장 커요."
   },
   "sentences": [
    {
     "en": "Taeo lived in a small fishing village by the sea.",
     "ko": "태오는 바닷가의 작은 어촌 마을에 살았다."
    },
    {
     "en": "He was very shy and rarely talked to people.",
     "ko": "태오는 무척 수줍어서 사람들과 거의 이야기하지 않았다."
    },
    {
     "en": "But every evening, he sang to the sea from the rocks.",
     "ko": "하지만 매일 저녁, 태오는 바위 위에서 바다를 향해 노래를 불렀다."
    },
    {
     "en": "One night, a deep song answered. It was a huge gray whale!",
     "ko": "어느 밤, 깊은 노랫소리가 대답했다. 커다란 회색 고래였다!"
    },
    {
     "en": "Soon, they \"talked\" in songs every night.",
     "ko": "곧 둘은 매일 밤 노래로 \"이야기\"를 나누었다."
    },
    {
     "en": "One evening, the whale's song was fast and scared.",
     "ko": "어느 저녁, 고래의 노래가 빠르고 겁에 질려 있었다."
    },
    {
     "en": "Taeo looked at the sky. A big storm was coming!",
     "ko": "태오가 하늘을 보았다. 큰 폭풍이 오고 있었다!"
    },
    {
     "en": "The fishing boats were still far out at sea.",
     "ko": "고기잡이배들은 아직 먼 바다에 있었다."
    },
    {
     "en": "Taeo was shy, but he ran to the harbor and shouted, \"Call the boats back!\"",
     "ko": "태오는 수줍었지만, 항구로 달려가 외쳤다. \"배들을 돌아오게 하세요!\""
    },
    {
     "en": "The villagers trusted him and radioed every boat.",
     "ko": "마을 사람들은 태오를 믿고 모든 배에 무전을 보냈다."
    },
    {
     "en": "All the boats came home just before the storm hit.",
     "ko": "폭풍이 몰아치기 직전, 배들이 모두 돌아왔다."
    },
    {
     "en": "That night, Taeo sang a thank-you song to the whale.",
     "ko": "그날 밤, 태오는 고래에게 고맙다는 노래를 불러 주었다."
    },
    {
     "en": "A shy boy found his voice and saved his village.",
     "ko": "수줍은 소년이 용기 내어 목소리를 내고 마을을 구했다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence shows how the shy boy changed and what he did for his village.",
    "ko": "수줍은 소년이 어떻게 변했고 마을을 위해 무엇을 했는지 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "A shy boy listens to a whale and bravely warns his village about a storm.",
      "ko": "수줍은 소년이 고래의 말을 듣고 용감하게 마을에 폭풍을 알린다."
     },
     {
      "en": "Taeo catches a whale with a fishing boat.",
      "ko": "태오가 고기잡이배로 고래를 잡는다."
     },
     {
      "en": "The whale sinks the fishing boats.",
      "ko": "고래가 고기잡이배를 가라앉힌다."
     },
     {
      "en": "Taeo wins a singing contest.",
      "ko": "태오가 노래 대회에서 우승한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Taeo hears the whale's warning and bravely tells the village to call the boats home.",
     "ko": "태오가 고래의 경고를 듣고 용감하게 마을에 배를 불러들이라고 알려요."
    }
   },
   "words": [
    {
     "en": "shy",
     "ko": "수줍은"
    },
    {
     "en": "storm",
     "ko": "폭풍"
    },
    {
     "en": "harbor",
     "ko": "항구"
    }
   ],
   "summary": {
    "ko": "태오는 고래에게서 폭풍 소식을 듣고 마을을 구했다.",
    "en": "Taeo learned about the storm from a whale and saved his village.",
    "keywords": [
     "storm",
     "whale",
     "village"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-22",
   "genre": "story",
   "title": {
    "en": "The Haunted Library",
    "ko": "유령 도서관"
   },
   "topic": {
    "en": "Mystery",
    "ko": "추리"
   },
   "bg": {
    "en": "Old books smell special because their paper and glue slowly break down.",
    "ko": "오래된 책에서 나는 냄새는 종이와 풀이 천천히 분해되면서 생겨요."
   },
   "sentences": [
    {
     "en": "Everyone said the old school library was haunted.",
     "ko": "모두가 오래된 학교 도서관에 유령이 나온다고 했다."
    },
    {
     "en": "At night, a strange light moved between the shelves.",
     "ko": "밤이면 이상한 불빛이 책장 사이를 움직였다."
    },
    {
     "en": "In the morning, books lay open on the floor.",
     "ko": "아침이면 책들이 펼쳐진 채 바닥에 놓여 있었다."
    },
    {
     "en": "Seojun did not believe in ghosts, so he decided to find out.",
     "ko": "서준이는 유령을 믿지 않아서 진실을 알아내기로 했다."
    },
    {
     "en": "One evening, he hid behind the desk with a flashlight.",
     "ko": "어느 저녁, 서준이는 손전등을 들고 책상 뒤에 숨었다."
    },
    {
     "en": "At midnight, the light appeared. Then a book fell. Thump!",
     "ko": "자정이 되자 불빛이 나타났다. 그러고는 책이 떨어졌다. 쿵!"
    },
    {
     "en": "Seojun's heart beat fast, but he turned on his flashlight.",
     "ko": "서준이의 심장이 쿵쾅거렸지만, 서준이는 손전등을 켰다."
    },
    {
     "en": "It was not a ghost. It was the old janitor, Mr. Choi!",
     "ko": "유령이 아니었다. 청소부 최 할아버지였다!"
    },
    {
     "en": "\"I never learned to read as a child,\" he said quietly.",
     "ko": "\"나는 어릴 때 글을 배우지 못했단다.\" 할아버지가 조용히 말했다."
    },
    {
     "en": "\"So I practice here every night, when nobody can see me.\"",
     "ko": "\"그래서 아무도 못 볼 때 매일 밤 여기서 연습한단다.\""
    },
    {
     "en": "Seojun smiled. \"I can read with you after school.\"",
     "ko": "서준이가 웃었다. \"방과 후에 제가 같이 읽어 드릴게요.\""
    },
    {
     "en": "After that, the library was never \"haunted\" again.",
     "ko": "그 뒤로 도서관에는 다시는 \"유령\"이 나오지 않았다."
    },
    {
     "en": "The scary mystery was really a man who wanted to learn.",
     "ko": "무서운 수수께끼의 정체는 배우고 싶었던 한 사람이었다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence reveals the true answer to the library mystery.",
    "ko": "도서관 수수께끼의 진짜 정체를 밝히는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "A real ghost lives in the school library.",
      "ko": "학교 도서관에 진짜 유령이 산다."
     },
     {
      "en": "Seojun is too scared to go into the library.",
      "ko": "서준이는 너무 무서워서 도서관에 들어가지 못한다."
     },
     {
      "en": "Mr. Choi cleans the library every morning.",
      "ko": "최 할아버지가 매일 아침 도서관을 청소한다."
     },
     {
      "en": "Seojun solves the \"ghost\" mystery and helps an old man learn to read.",
      "ko": "서준이가 \"유령\"의 정체를 밝히고 할아버지가 글을 배우도록 돕는다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Seojun finds that the \"ghost\" is Mr. Choi learning to read, and he offers to help.",
     "ko": "서준이가 \"유령\"이 글을 배우던 최 할아버지임을 알아내고 돕겠다고 해요."
    }
   },
   "words": [
    {
     "en": "haunted",
     "ko": "유령이 나오는"
    },
    {
     "en": "shelves",
     "ko": "책장, 선반"
    },
    {
     "en": "janitor",
     "ko": "청소부, 관리인"
    }
   ],
   "summary": {
    "ko": "도서관 유령은 사실 글 읽기를 연습하던 최 할아버지였다.",
    "en": "The library ghost was really Mr. Choi practicing his reading.",
    "keywords": [
     "ghost",
     "practicing",
     "reading"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-23",
   "genre": "story",
   "title": {
    "en": "The Time-Travel Watch",
    "ko": "시간 여행 시계"
   },
   "topic": {
    "en": "History",
    "ko": "역사"
   },
   "bg": {
    "en": "Hunminjeongeum (Hangeul) was created in 1443 and announced in 1446.",
    "ko": "훈민정음은 1443년에 만들어지고 1446년에 널리 알려졌어요."
   },
   "sentences": [
    {
     "en": "Hayun found an old gold watch in Grandpa's drawer.",
     "ko": "하윤이는 할아버지 서랍에서 오래된 금시계를 발견했다."
    },
    {
     "en": "She turned its knob, and the room began to spin.",
     "ko": "손잡이를 돌리자 방이 빙글빙글 돌기 시작했다."
    },
    {
     "en": "Suddenly, she was standing in a palace in the year 1443!",
     "ko": "갑자기 하윤이는 1443년의 궁궐에 서 있었다!"
    },
    {
     "en": "A kind man in a red robe was writing strange shapes on paper.",
     "ko": "빨간 옷을 입은 친절한 남자가 종이에 이상한 모양을 쓰고 있었다."
    },
    {
     "en": "It was King Sejong, and he looked very tired.",
     "ko": "그는 세종대왕이었고, 아주 피곤해 보였다."
    },
    {
     "en": "\"Many people cannot read Chinese characters,\" he said. \"I want easy letters for everyone.\"",
     "ko": "\"많은 백성이 한자를 읽지 못한단다.\" 왕이 말했다. \"모두를 위한 쉬운 글자를 만들고 싶구나.\""
    },
    {
     "en": "Hayun looked at the shapes. They were the first Hangeul letters!",
     "ko": "하윤이가 그 모양을 보았다. 바로 처음 만들어진 한글이었다!"
    },
    {
     "en": "Just then, the watch shook. It was taking her home!",
     "ko": "바로 그때 시계가 흔들렸다. 하윤이를 집으로 데려가려는 것이었다!"
    },
    {
     "en": "\"Thank you,\" she said quickly. \"Your letters will help millions of people!\"",
     "ko": "\"고맙습니다.\" 하윤이가 서둘러 말했다. \"임금님의 글자는 수많은 사람을 도울 거예요!\""
    },
    {
     "en": "The king smiled, and then everything went white.",
     "ko": "왕이 미소 지었고, 그 순간 모든 것이 하얘졌다."
    },
    {
     "en": "Hayun was back in her room.",
     "ko": "하윤이는 자기 방으로 돌아와 있었다."
    },
    {
     "en": "Now, when she writes Hangeul, she remembers the tired king.",
     "ko": "이제 하윤이는 한글을 쓸 때면 그 피곤해 보이던 왕을 떠올린다."
    },
    {
     "en": "Hangeul was a gift made with love for everyone.",
     "ko": "한글은 모두를 위해 사랑으로 만든 선물이었다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence tells the meaning of what Hayun saw: Hangeul was made for everyone.",
    "ko": "하윤이가 본 것의 의미, 한글이 모두를 위해 만들어졌다는 점을 말하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Hayun breaks her grandfather's gold watch.",
      "ko": "하윤이가 할아버지의 금시계를 망가뜨린다."
     },
     {
      "en": "Hayun travels back in time and sees King Sejong making Hangeul.",
      "ko": "하윤이가 과거로 가서 세종대왕이 한글을 만드는 모습을 본다."
     },
     {
      "en": "King Sejong comes to Hayun's house.",
      "ko": "세종대왕이 하윤이네 집에 온다."
     },
     {
      "en": "Hayun learns to write Chinese characters.",
      "ko": "하윤이가 한자 쓰는 법을 배운다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Hayun travels to 1443 and watches King Sejong making easy letters for everyone.",
     "ko": "하윤이가 1443년으로 가서 세종대왕이 모두를 위한 쉬운 글자를 만드는 모습을 봐요."
    }
   },
   "words": [
    {
     "en": "palace",
     "ko": "궁궐"
    },
    {
     "en": "letters",
     "ko": "글자"
    },
    {
     "en": "gift",
     "ko": "선물"
    }
   ],
   "summary": {
    "ko": "하윤이는 1443년으로 가서 세종대왕이 한글을 만드는 것을 보았다.",
    "en": "Hayun traveled to 1443 and saw King Sejong creating Hangeul.",
    "keywords": [
     "king",
     "sejong",
     "hangeul"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-24",
   "genre": "story",
   "title": {
    "en": "Lost in the Amazon",
    "ko": "아마존에서 길을 잃다"
   },
   "topic": {
    "en": "Adventure",
    "ko": "모험"
   },
   "bg": {
    "en": "The Amazon is the largest tropical rainforest in the world.",
    "ko": "아마존 열대 우림은 세계에서 가장 큰 열대 우림이에요."
   },
   "sentences": [
    {
     "en": "Ellie and her guide, Carlos, took a boat down the Amazon.",
     "ko": "엘리는 안내인 카를로스와 함께 배를 타고 아마존강을 내려갔다."
    },
    {
     "en": "Ellie wanted to take a photo of a pink river dolphin.",
     "ko": "엘리는 분홍 강돌고래 사진을 찍고 싶었다."
    },
    {
     "en": "When the boat stopped, she saw one and followed it.",
     "ko": "배가 멈췄을 때, 엘리는 돌고래 한 마리를 보고 따라갔다."
    },
    {
     "en": "But when she turned around, the boat was gone.",
     "ko": "그런데 뒤돌아보니 배가 보이지 않았다."
    },
    {
     "en": "Ellie was alone in the jungle, and the sun was going down.",
     "ko": "엘리는 정글에 혼자 남았고, 해가 지고 있었다."
    },
    {
     "en": "Strange sounds came from the trees, and she cried.",
     "ko": "나무에서 이상한 소리가 들려와 엘리는 울었다."
    },
    {
     "en": "Then she remembered Carlos's advice: \"If you get lost, stay near the water.\"",
     "ko": "그때 카를로스의 충고가 생각났다. \"길을 잃으면 물가에 있어.\""
    },
    {
     "en": "She wiped her tears and sat by the river.",
     "ko": "엘리는 눈물을 닦고 강가에 앉았다."
    },
    {
     "en": "She tied her red scarf to a high branch.",
     "ko": "엘리는 빨간 스카프를 높은 나뭇가지에 묶었다."
    },
    {
     "en": "Hours later, she heard a motor. It was Carlos and the boat!",
     "ko": "몇 시간 뒤, 모터 소리가 들렸다. 카를로스와 배였다!"
    },
    {
     "en": "\"I saw your red scarf from far away!\" he shouted.",
     "ko": "\"멀리서 네 빨간 스카프가 보였어!\" 카를로스가 외쳤다."
    },
    {
     "en": "Ellie hugged him and laughed through her tears.",
     "ko": "엘리는 카를로스를 껴안고 울다가 웃었다."
    },
    {
     "en": "Staying calm and smart helped Ellie get rescued.",
     "ko": "침착하고 현명하게 행동한 덕분에 엘리는 구조될 수 있었다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence explains why Ellie was found: she stayed calm and acted smart.",
    "ko": "엘리가 구조된 이유, 침착하고 현명하게 행동한 점을 설명하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Ellie takes a photo of a pink dolphin and wins a prize.",
      "ko": "엘리가 분홍 돌고래 사진을 찍어 상을 받는다."
     },
     {
      "en": "Carlos gets lost in the jungle.",
      "ko": "카를로스가 정글에서 길을 잃는다."
     },
     {
      "en": "Ellie gets lost in the Amazon but stays calm and gets rescued.",
      "ko": "엘리가 아마존에서 길을 잃지만 침착하게 행동해서 구조된다."
     },
     {
      "en": "Ellie swims across the Amazon River.",
      "ko": "엘리가 아마존강을 헤엄쳐 건넌다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "Ellie gets lost, but she follows the advice, stays by the river and is rescued.",
     "ko": "엘리는 길을 잃지만 충고대로 강가에 머물러 구조돼요."
    }
   },
   "words": [
    {
     "en": "guide",
     "ko": "안내인"
    },
    {
     "en": "advice",
     "ko": "충고, 조언"
    },
    {
     "en": "branch",
     "ko": "나뭇가지"
    }
   ],
   "summary": {
    "ko": "엘리는 강가에 머물며 스카프를 이용해 구조되었다.",
    "en": "Ellie stayed by the river and used her scarf to get rescued.",
    "keywords": [
     "river",
     "scarf",
     "rescued"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-25",
   "genre": "story",
   "title": {
    "en": "The Alien Exchange Student",
    "ko": "외계인 전학생"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Many deep-sea animals make their own light. This is called bioluminescence.",
    "ko": "깊은 바닷속 생물 중에는 스스로 빛을 내는 생물이 많아요. 이것을 \"생물 발광\"이라고 해요."
   },
   "sentences": [
    {
     "en": "On Monday, our teacher said, \"We have a new student from far away.\"",
     "ko": "월요일에 선생님이 말씀하셨다. \"아주 먼 곳에서 새 친구가 왔어요.\""
    },
    {
     "en": "The door opened, and a girl with blue skin walked in.",
     "ko": "문이 열리고, 피부가 파란 여자아이가 들어왔다."
    },
    {
     "en": "Her name was Zara, and she came from Planet Lumo.",
     "ko": "아이의 이름은 자라였고, 루모 행성에서 왔다."
    },
    {
     "en": "At first, everyone was a little afraid of her.",
     "ko": "처음에는 모두 자라를 조금 무서워했다."
    },
    {
     "en": "She ate pencils for lunch and floated above her chair.",
     "ko": "자라는 점심으로 연필을 먹고, 의자 위에 둥둥 떠 있었다."
    },
    {
     "en": "Nobody wanted to sit with her, so she sat alone.",
     "ko": "아무도 자라와 앉고 싶어 하지 않아서, 자라는 혼자 앉았다."
    },
    {
     "en": "Then, during the science test, the lights went out.",
     "ko": "그러던 중 과학 시험 시간에 불이 나갔다."
    },
    {
     "en": "The room was completely dark, and some kids started to cry.",
     "ko": "교실은 완전히 깜깜해졌고, 몇몇 아이들은 울기 시작했다."
    },
    {
     "en": "Suddenly, Zara's skin began to glow like a lamp!",
     "ko": "갑자기 자라의 피부가 전등처럼 빛나기 시작했다!"
    },
    {
     "en": "\"Don't worry,\" she said softly. \"I can help.\"",
     "ko": "\"걱정하지 마.\" 자라가 부드럽게 말했다. \"내가 도와줄게.\""
    },
    {
     "en": "Thanks to her light, we all got outside safely.",
     "ko": "자라의 빛 덕분에 우리는 모두 무사히 밖으로 나갔다."
    },
    {
     "en": "After that day, everyone wanted to sit with Zara.",
     "ko": "그날 이후로 모두가 자라 옆에 앉고 싶어 했다."
    },
    {
     "en": "Sometimes the friend who is different is the one who shines brightest.",
     "ko": "때로는 나와 다른 친구가 가장 밝게 빛나는 친구이다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence gives the lesson about the different new student.",
    "ko": "남들과 다른 새 친구에 대한 이야기의 교훈을 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Zara eats all the pencils in the school.",
      "ko": "자라가 학교의 연필을 모두 먹는다."
     },
     {
      "en": "A new student who is different helps the class and makes friends.",
      "ko": "남들과 다른 새 친구가 반 친구들을 돕고 친구가 된다."
     },
     {
      "en": "The class goes on a trip to Planet Lumo.",
      "ko": "반 친구들이 루모 행성으로 여행을 간다."
     },
     {
      "en": "The teacher is afraid of the dark.",
      "ko": "선생님이 어둠을 무서워한다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Zara is different and sits alone, but her light helps the class and she makes friends.",
     "ko": "자라는 달라서 혼자였지만, 자기 빛으로 반을 도와 친구가 돼요."
    }
   },
   "words": [
    {
     "en": "student",
     "ko": "학생"
    },
    {
     "en": "glow",
     "ko": "빛나다"
    },
    {
     "en": "different",
     "ko": "다른"
    }
   ],
   "summary": {
    "ko": "자라는 남들과 달랐지만, 반 친구들을 도와주고 친구가 되었다.",
    "en": "Zara was different, but she helped the class and made friends.",
    "keywords": [
     "different",
     "helped",
     "friends"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-26",
   "genre": "story",
   "title": {
    "en": "The Invisible Thief",
    "ko": "보이지 않는 도둑"
   },
   "topic": {
    "en": "Mystery",
    "ko": "추리"
   },
   "bg": {
    "en": "Squirrels bury acorns for winter, and the ones they forget can grow into trees.",
    "ko": "다람쥐는 겨울을 위해 도토리를 땅에 묻어요. 잊어버린 도토리는 나무로 자라기도 해요."
   },
   "sentences": [
    {
     "en": "Every night, cookies disappeared from the school kitchen.",
     "ko": "매일 밤 학교 주방에서 쿠키가 사라졌다."
    },
    {
     "en": "The cook, Mrs. Park, locked the door, but the cookies still vanished.",
     "ko": "요리사 박 선생님이 문을 잠갔지만, 쿠키는 여전히 없어졌다."
    },
    {
     "en": "\"It must be an invisible thief!\" the students whispered.",
     "ko": "\"보이지 않는 도둑이 틀림없어!\" 학생들이 속삭였다."
    },
    {
     "en": "Minjun, the class detective, decided to solve the mystery.",
     "ko": "우리 반 탐정 민준이가 이 수수께끼를 풀기로 했다."
    },
    {
     "en": "He looked carefully and found three clues.",
     "ko": "민준이는 꼼꼼히 살펴보고 단서 세 개를 찾았다."
    },
    {
     "en": "First, there were tiny crumbs on the windowsill.",
     "ko": "첫째, 창틀에 작은 부스러기가 있었다."
    },
    {
     "en": "Second, the window was open just a few centimeters.",
     "ko": "둘째, 창문이 몇 센티미터만 살짝 열려 있었다."
    },
    {
     "en": "Third, there was an acorn shell next to the cookie jar.",
     "ko": "셋째, 쿠키 통 옆에 도토리 껍질이 있었다."
    },
    {
     "en": "That night, Minjun hid behind the fridge with a flashlight.",
     "ko": "그날 밤, 민준이는 손전등을 들고 냉장고 뒤에 숨었다."
    },
    {
     "en": "At midnight, something small squeezed through the window.",
     "ko": "한밤중에 무언가 작은 것이 창문 틈으로 쏙 들어왔다."
    },
    {
     "en": "He turned on the light. It was a squirrel!",
     "ko": "민준이가 불을 켰다. 다람쥐였다!"
    },
    {
     "en": "The squirrel grabbed a cookie and ran back out the window.",
     "ko": "다람쥐는 쿠키를 하나 물고 창문 밖으로 달아났다."
    },
    {
     "en": "Mrs. Park laughed and closed the window tightly.",
     "ko": "박 선생님은 웃으며 창문을 꼭 닫았다."
    },
    {
     "en": "The invisible thief was just a hungry squirrel, and careful clues solved the case.",
     "ko": "보이지 않는 도둑은 배고픈 다람쥐였고, 꼼꼼한 단서가 사건을 해결했다."
    }
   ],
   "key": 13,
   "keyWhy": {
    "en": "This sentence reveals who the thief was and how the case was solved.",
    "ko": "도둑의 정체와 사건이 어떻게 해결됐는지 밝히는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Mrs. Park eats the cookies at night.",
      "ko": "박 선생님이 밤에 쿠키를 먹는다."
     },
     {
      "en": "Minjun becomes invisible.",
      "ko": "민준이가 투명 인간이 된다."
     },
     {
      "en": "The students bake cookies for a squirrel.",
      "ko": "학생들이 다람쥐에게 쿠키를 구워 준다."
     },
     {
      "en": "Minjun uses clues to find out that a squirrel is the cookie thief.",
      "ko": "민준이가 단서로 쿠키 도둑이 다람쥐라는 것을 알아낸다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Minjun follows the crumbs, the open window and the acorn shell and catches a squirrel.",
     "ko": "민준이가 부스러기, 열린 창문, 도토리 껍질을 따라가 다람쥐를 찾아내요."
    }
   },
   "words": [
    {
     "en": "detective",
     "ko": "탐정"
    },
    {
     "en": "crumbs",
     "ko": "부스러기"
    },
    {
     "en": "squirrel",
     "ko": "다람쥐"
    }
   ],
   "summary": {
    "ko": "민준이는 단서를 따라가서 다람쥐가 쿠키를 가져간다는 것을 알아냈다.",
    "en": "Minjun followed the clues and found that a squirrel was taking the cookies.",
    "keywords": [
     "clues",
     "squirrel",
     "cookies"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-27",
   "genre": "story",
   "title": {
    "en": "Mission: Save the Coral Reef",
    "ko": "산호초 구조 작전"
   },
   "topic": {
    "en": "Environment",
    "ko": "환경"
   },
   "bg": {
    "en": "Sea turtles live in the water, but they must come up to breathe air.",
    "ko": "바다거북은 물속에서 살지만, 숨은 물 위로 올라와 공기로 쉬어야 해요."
   },
   "sentences": [
    {
     "en": "Mina and her uncle were divers who studied the ocean.",
     "ko": "미나와 삼촌은 바다를 연구하는 잠수부였다."
    },
    {
     "en": "One morning, they dove near a beautiful coral reef.",
     "ko": "어느 아침, 둘은 아름다운 산호초 근처로 잠수했다."
    },
    {
     "en": "But something was wrong.",
     "ko": "그런데 무언가 이상했다."
    },
    {
     "en": "Much of the coral was white, and many fish were gone.",
     "ko": "산호가 많이 하얗게 변했고, 물고기도 많이 사라졌다."
    },
    {
     "en": "\"The water is too warm,\" her uncle said. \"The coral is sick.\"",
     "ko": "\"바닷물이 너무 따뜻해.\" 삼촌이 말했다. \"산호가 아픈 거야.\""
    },
    {
     "en": "Then Mina saw something even worse.",
     "ko": "그때 미나는 더 끔찍한 것을 보았다."
    },
    {
     "en": "A huge fishing net was caught on the reef, and a sea turtle was trapped inside!",
     "ko": "커다란 그물이 산호초에 걸려 있었고, 그 안에 바다거북이 갇혀 있었다!"
    },
    {
     "en": "The turtle was running out of air.",
     "ko": "거북은 숨이 점점 모자랐다."
    },
    {
     "en": "Mina and her uncle swam fast and cut the net piece by piece.",
     "ko": "미나와 삼촌은 빠르게 헤엄쳐 가서 그물을 조금씩 잘랐다."
    },
    {
     "en": "At last, the turtle broke free and swam up to breathe.",
     "ko": "마침내 거북이 풀려나 숨을 쉬러 물 위로 올라갔다."
    },
    {
     "en": "Back on the boat, Mina made a plan.",
     "ko": "배로 돌아온 미나는 계획을 세웠다."
    },
    {
     "en": "She started a club at school to collect plastic and old nets from the beach.",
     "ko": "미나는 학교에 바닷가의 플라스틱과 낡은 그물을 줍는 동아리를 만들었다."
    },
    {
     "en": "Even one person can start a mission to protect the ocean.",
     "ko": "단 한 사람도 바다를 지키는 작전을 시작할 수 있다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence tells the message of Mina's mission to save the ocean.",
    "ko": "바다를 구하려는 미나의 작전이 전하는 메시지를 말하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Mina saves a turtle and starts a mission to protect the ocean.",
      "ko": "미나가 거북을 구하고 바다를 지키는 작전을 시작한다."
     },
     {
      "en": "Mina catches many fish with a net.",
      "ko": "미나가 그물로 물고기를 많이 잡는다."
     },
     {
      "en": "Mina's uncle paints the coral white.",
      "ko": "미나의 삼촌이 산호를 하얗게 칠한다."
     },
     {
      "en": "Mina is afraid to dive into the sea.",
      "ko": "미나는 바다에 잠수하는 것을 무서워한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Mina saves a trapped turtle and starts a club to keep the ocean clean.",
     "ko": "미나가 갇힌 거북을 구하고 바다를 깨끗하게 지키는 동아리를 만들어요."
    }
   },
   "words": [
    {
     "en": "coral",
     "ko": "산호"
    },
    {
     "en": "trapped",
     "ko": "갇힌"
    },
    {
     "en": "protect",
     "ko": "보호하다, 지키다"
    }
   ],
   "summary": {
    "ko": "미나는 바다거북을 구하고 바다를 지키는 동아리를 만들었다.",
    "en": "Mina saved a sea turtle and started a club to protect the ocean.",
    "keywords": [
     "turtle",
     "club",
     "ocean"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-28",
   "genre": "story",
   "title": {
    "en": "Dinosaur Island",
    "ko": "공룡 섬"
   },
   "topic": {
    "en": "Dinosaurs",
    "ko": "공룡"
   },
   "bg": {
    "en": "Some long-necked dinosaurs were over 30 meters long - longer than two buses!",
    "ko": "어떤 목이 긴 공룡은 몸길이가 30m가 넘었어요. 버스 두 대보다 길어요!"
   },
   "sentences": [
    {
     "en": "A storm pushed Jae and his sister Ara's boat to a strange island.",
     "ko": "폭풍이 재와 누나 아라의 배를 이상한 섬으로 밀어 보냈다."
    },
    {
     "en": "The trees were taller than buildings, and the ground shook with heavy steps.",
     "ko": "나무는 건물보다 높았고, 무거운 발소리에 땅이 흔들렸다."
    },
    {
     "en": "\"Look!\" Ara whispered. \"A dinosaur!\"",
     "ko": "\"저기 봐!\" 아라가 속삭였다. \"공룡이야!\""
    },
    {
     "en": "A long-necked dinosaur was eating leaves from the top of a tree.",
     "ko": "목이 긴 공룡이 나무 꼭대기의 잎을 먹고 있었다."
    },
    {
     "en": "It was calm and gentle, so they followed it into the jungle.",
     "ko": "공룡이 얌전하고 순해서 둘은 공룡을 따라 정글로 들어갔다."
    },
    {
     "en": "Suddenly, they heard a loud roar behind them.",
     "ko": "갑자기 뒤에서 커다란 포효 소리가 들렸다."
    },
    {
     "en": "A T. rex was running toward them!",
     "ko": "티라노사우루스가 둘을 향해 달려오고 있었다!"
    },
    {
     "en": "They ran, but there was nowhere to hide.",
     "ko": "둘은 달렸지만, 숨을 곳이 없었다."
    },
    {
     "en": "Then the long-necked dinosaur stepped between them and the T. rex.",
     "ko": "그때 목이 긴 공룡이 아이들과 티라노 사이를 막아섰다."
    },
    {
     "en": "It swung its huge tail, and the T. rex ran away.",
     "ko": "공룡이 커다란 꼬리를 휘두르자 티라노는 도망갔다."
    },
    {
     "en": "The gentle giant lowered its head, and the children climbed onto its neck.",
     "ko": "순한 거인 공룡이 고개를 숙이자 아이들은 공룡의 목 위로 올라탔다."
    },
    {
     "en": "It carried them back to their boat on the beach.",
     "ko": "공룡은 아이들을 바닷가의 배까지 데려다주었다."
    },
    {
     "en": "Sometimes the gentlest friend is also the bravest.",
     "ko": "때로는 가장 순한 친구가 가장 용감한 친구이기도 하다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence gives the lesson of the story about the gentle but brave dinosaur.",
    "ko": "순하지만 용감한 공룡 이야기의 교훈을 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Jae and Ara catch a T. rex.",
      "ko": "재와 아라가 티라노사우루스를 잡는다."
     },
     {
      "en": "The children build a new boat on the island.",
      "ko": "아이들이 섬에서 새 배를 만든다."
     },
     {
      "en": "A gentle dinosaur saves two children from a T. rex on a strange island.",
      "ko": "이상한 섬에서 순한 공룡이 두 아이를 티라노로부터 구해 준다."
     },
     {
      "en": "Ara is afraid of tall trees.",
      "ko": "아라는 키 큰 나무를 무서워한다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "A calm long-necked dinosaur protects the children from a T. rex and takes them back to their boat.",
     "ko": "얌전한 목이 긴 공룡이 아이들을 티라노에게서 지키고 배까지 데려다줘요."
    }
   },
   "words": [
    {
     "en": "island",
     "ko": "섬"
    },
    {
     "en": "gentle",
     "ko": "순한, 온화한"
    },
    {
     "en": "roar",
     "ko": "포효, 으르렁거림"
    }
   ],
   "summary": {
    "ko": "순한 목이 긴 공룡이 재와 아라를 티라노사우루스로부터 구해 주었다.",
    "en": "A gentle long-necked dinosaur saved Jae and Ara from a T. rex.",
    "keywords": [
     "gentle",
     "dinosaur",
     "saved"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-29",
   "genre": "story",
   "title": {
    "en": "The Mirror World",
    "ko": "거울 속 세상"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "Mirrors flip words from left to right, so some ambulances have their name written backward on the front.",
    "ko": "거울은 글자의 좌우를 바꿔 보여 줘요. 그래서 구급차 앞에는 글자가 거꾸로 적혀 있기도 해요."
   },
   "sentences": [
    {
     "en": "Lucy found an old mirror in her grandmother's attic.",
     "ko": "루시는 할머니 다락방에서 낡은 거울을 발견했다."
    },
    {
     "en": "When she touched it, her hand went through the glass!",
     "ko": "거울을 만지자 손이 유리를 그대로 통과했다!"
    },
    {
     "en": "She stepped inside and found a world where everything was backward.",
     "ko": "안으로 들어가 보니 모든 것이 거꾸로인 세상이었다."
    },
    {
     "en": "People walked backward, clocks ran backward, and the sun was green.",
     "ko": "사람들은 뒤로 걷고, 시계는 거꾸로 돌고, 해는 초록색이었다."
    },
    {
     "en": "She met a girl named Ycul who looked just like her.",
     "ko": "루시는 자기와 꼭 닮은 이쿨이라는 여자아이를 만났다."
    },
    {
     "en": "\"Everything here is opposite,\" Ycul said. \"I am brave, but you are shy.\"",
     "ko": "\"여기선 모든 게 반대야.\" 이쿨이 말했다. \"나는 용감하고, 너는 수줍지.\""
    },
    {
     "en": "They played together all afternoon.",
     "ko": "둘은 오후 내내 함께 놀았다."
    },
    {
     "en": "But when she tried to go home, the mirror began to crack!",
     "ko": "그런데 집에 돌아가려고 하자 거울에 금이 가기 시작했다!"
    },
    {
     "en": "\"Hurry!\" Ycul shouted. \"If it breaks, you will be stuck here forever!\"",
     "ko": "\"서둘러!\" 이쿨이 외쳤다. \"거울이 깨지면 넌 영원히 여기 갇혀!\""
    },
    {
     "en": "Lucy was scared, but she remembered Ycul's words.",
     "ko": "루시는 무서웠지만, 이쿨의 말을 떠올렸다."
    },
    {
     "en": "She took a deep breath and jumped through the glass.",
     "ko": "루시는 숨을 크게 들이쉬고 거울 속으로 뛰어들었다."
    },
    {
     "en": "She landed in the attic just as the mirror broke.",
     "ko": "거울이 깨지는 순간, 루시는 다락방에 내려앉았다."
    },
    {
     "en": "From that day on, Lucy was braver, just like her mirror friend.",
     "ko": "그날부터 루시는 거울 속 친구처럼 더 용감해졌다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence shows how Lucy changed after her trip to the mirror world.",
    "ko": "거울 속 세상에 다녀온 뒤 루시가 어떻게 변했는지 보여 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Lucy breaks her grandmother's clock.",
      "ko": "루시가 할머니의 시계를 망가뜨린다."
     },
     {
      "en": "Lucy visits a mirror world and learns to be brave.",
      "ko": "루시가 거울 속 세상에 다녀와서 용기를 배운다."
     },
     {
      "en": "Ycul comes to live in Lucy's house.",
      "ko": "이쿨이 루시의 집에 와서 산다."
     },
     {
      "en": "Lucy buys a new mirror for the attic.",
      "ko": "루시가 다락방에 둘 새 거울을 산다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Lucy visits a backward world, meets a brave girl and comes home braver herself.",
     "ko": "루시가 거꾸로 된 세상에서 용감한 아이를 만나고, 자신도 더 용감해져서 돌아와요."
    }
   },
   "words": [
    {
     "en": "attic",
     "ko": "다락방"
    },
    {
     "en": "backward",
     "ko": "거꾸로, 뒤로"
    },
    {
     "en": "opposite",
     "ko": "반대의"
    }
   ],
   "summary": {
    "ko": "루시는 거울 속 세상에 갔다가 더 용감해져서 돌아왔다.",
    "en": "Lucy went into a mirror world and came back braver.",
    "keywords": [
     "mirror",
     "world",
     "braver"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-30",
   "genre": "story",
   "title": {
    "en": "The Mountain Rescue Dog",
    "ko": "산악 구조견"
   },
   "topic": {
    "en": "Heroes",
    "ko": "영웅"
   },
   "bg": {
    "en": "Rescue dogs can smell people buried several meters under the snow.",
    "ko": "구조견은 눈 아래 몇 미터 깊이에 묻힌 사람의 냄새도 맡을 수 있어요."
   },
   "sentences": [
    {
     "en": "Max was a rescue dog who lived in the mountains with Officer Kang.",
     "ko": "맥스는 강 경관님과 함께 산에서 사는 구조견이었다."
    },
    {
     "en": "Every winter, they helped people who were lost in the snow.",
     "ko": "겨울마다 둘은 눈 속에서 길을 잃은 사람들을 도왔다."
    },
    {
     "en": "One night, a terrible snowstorm hit the mountain.",
     "ko": "어느 밤, 무시무시한 눈보라가 산을 덮쳤다."
    },
    {
     "en": "A family of hikers called for help, but their phone died.",
     "ko": "등산객 가족이 구조 요청을 했지만, 전화가 꺼져 버렸다."
    },
    {
     "en": "Officer Kang looked worried. \"We can't see anything in this storm, Max.\"",
     "ko": "강 경관님이 걱정스러운 얼굴로 말했다. \"이 눈보라 속에선 아무것도 안 보여, 맥스.\""
    },
    {
     "en": "Max lifted his nose and sniffed the wind.",
     "ko": "맥스가 코를 들고 바람 냄새를 맡았다."
    },
    {
     "en": "Suddenly, he ran into the darkness, barking loudly.",
     "ko": "갑자기 맥스가 크게 짖으며 어둠 속으로 달려갔다."
    },
    {
     "en": "Officer Kang followed his barks through deep snow.",
     "ko": "강 경관님은 깊은 눈 속에서 맥스의 짖는 소리를 따라갔다."
    },
    {
     "en": "Then Max stopped and started to dig.",
     "ko": "그러다 맥스가 멈추더니 땅을 파기 시작했다."
    },
    {
     "en": "Under the snow, there was a small cave, and inside were the cold, frightened hikers!",
     "ko": "눈 아래에는 작은 동굴이 있었고, 그 안에 춥고 겁먹은 등산객들이 있었다!"
    },
    {
     "en": "Max lay down next to the little boy to keep him warm.",
     "ko": "맥스는 어린 남자아이 옆에 누워 아이의 몸을 따뜻하게 해 주었다."
    },
    {
     "en": "By morning, everyone was safe at the hospital.",
     "ko": "아침이 되자 모두 병원에서 무사했다."
    },
    {
     "en": "A true hero helps others, even in the hardest storm.",
     "ko": "진정한 영웅은 가장 힘든 폭풍 속에서도 다른 사람을 돕는다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence tells why Max is a true hero.",
    "ko": "맥스가 왜 진정한 영웅인지 말해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Max gets lost in the snowstorm.",
      "ko": "맥스가 눈보라 속에서 길을 잃는다."
     },
     {
      "en": "Officer Kang finds the hikers with his phone.",
      "ko": "강 경관님이 휴대폰으로 등산객을 찾는다."
     },
     {
      "en": "The hikers build a cave for Max.",
      "ko": "등산객들이 맥스를 위해 동굴을 만든다."
     },
     {
      "en": "A rescue dog finds a lost family in a snowstorm.",
      "ko": "구조견이 눈보라 속에서 길 잃은 가족을 찾아낸다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Max uses his nose in a terrible snowstorm and finds the lost family under the snow.",
     "ko": "맥스가 무시무시한 눈보라 속에서 코로 눈 밑의 길 잃은 가족을 찾아내요."
    }
   },
   "words": [
    {
     "en": "rescue",
     "ko": "구조"
    },
    {
     "en": "snowstorm",
     "ko": "눈보라"
    },
    {
     "en": "hikers",
     "ko": "등산객들"
    }
   ],
   "summary": {
    "ko": "구조견 맥스가 눈보라 속에서 길 잃은 등산객들을 찾아냈다.",
    "en": "Max the rescue dog found the lost hikers in the snowstorm.",
    "keywords": [
     "rescue",
     "dog",
     "hikers"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-31",
   "genre": "story",
   "title": {
    "en": "The Moon Base Mystery",
    "ko": "달 기지 미스터리"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "The Moon has almost no air, so astronauts must bring their own oxygen.",
    "ko": "달에는 숨 쉴 수 있는 공기가 거의 없어서 우주 비행사는 산소를 직접 가져가야 해요."
   },
   "sentences": [
    {
     "en": "In the year 2080, eleven-year-old Hana lived on a base on the Moon.",
     "ko": "2080년, 열한 살 하나는 달 기지에서 살았다."
    },
    {
     "en": "One morning, the base computer gave a warning: \"Oxygen is going down.\"",
     "ko": "어느 아침, 기지 컴퓨터가 경고했다. \"산소가 줄어들고 있습니다.\""
    },
    {
     "en": "Everyone checked the tanks, but they looked fine.",
     "ko": "모두 산소 탱크를 확인했지만, 아무 문제가 없어 보였다."
    },
    {
     "en": "Still, the air was getting thinner every hour.",
     "ko": "그런데도 공기는 시간마다 점점 희박해졌다."
    },
    {
     "en": "The adults were busy, so Hana decided to search the base herself.",
     "ko": "어른들이 바빠서 하나는 직접 기지를 살펴보기로 했다."
    },
    {
     "en": "She walked through every room, listening carefully.",
     "ko": "하나는 귀를 기울이며 모든 방을 돌아다녔다."
    },
    {
     "en": "In the greenhouse, she heard a quiet hiss.",
     "ko": "온실에서 작게 쉬익 하는 소리가 들렸다."
    },
    {
     "en": "Behind the tomato plants, she found a tiny hole in the wall!",
     "ko": "토마토 화분 뒤 벽에서 아주 작은 구멍을 찾았다!"
    },
    {
     "en": "Air was escaping into space.",
     "ko": "공기가 우주로 새어 나가고 있었다."
    },
    {
     "en": "Hana grabbed a patch from the emergency kit and pressed it hard over the hole.",
     "ko": "하나는 비상 상자에서 패치를 꺼내 구멍 위에 꾹 눌러 붙였다."
    },
    {
     "en": "The hissing stopped.",
     "ko": "쉬익 소리가 멈췄다."
    },
    {
     "en": "Soon, the computer said, \"Oxygen level normal.\"",
     "ko": "곧 컴퓨터가 말했다. \"산소 수치 정상.\""
    },
    {
     "en": "The commander gave Hana a gold star for her space suit.",
     "ko": "기지 대장이 하나의 우주복에 금색 별을 달아 주었다."
    },
    {
     "en": "Paying close attention can solve even the biggest problems.",
     "ko": "꼼꼼히 살피면 아주 큰 문제도 해결할 수 있다."
    }
   ],
   "key": 13,
   "keyWhy": {
    "en": "This sentence gives the lesson of the whole story about finding the leak.",
    "ko": "구멍을 찾아낸 이야기 전체가 전하는 교훈을 말해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Hana finds and fixes a leak that is letting the air out of the Moon base.",
      "ko": "하나가 달 기지의 공기가 새는 구멍을 찾아 막는다."
     },
     {
      "en": "Hana grows tomatoes on the Moon.",
      "ko": "하나가 달에서 토마토를 기른다."
     },
     {
      "en": "The computer breaks, and everyone goes back to Earth.",
      "ko": "컴퓨터가 고장 나서 모두 지구로 돌아간다."
     },
     {
      "en": "Hana gets lost in space.",
      "ko": "하나가 우주에서 길을 잃는다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The story is about Hana finding and fixing the hole that let the air out.",
     "ko": "하나가 공기가 새는 구멍을 찾아 막는 이야기이기 때문이에요."
    }
   },
   "words": [
    {
     "en": "oxygen",
     "ko": "산소"
    },
    {
     "en": "warning",
     "ko": "경고"
    },
    {
     "en": "escaping",
     "ko": "새어 나가는"
    }
   ],
   "summary": {
    "ko": "하나가 달 기지의 구멍을 찾아 모두의 공기를 지켰다.",
    "en": "Hana found a hole in the Moon base and saved everyone's air.",
    "keywords": [
     "hole",
     "moon",
     "air"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-32",
   "genre": "story",
   "title": {
    "en": "The Pirate's Riddle",
    "ko": "해적의 수수께끼"
   },
   "topic": {
    "en": "Adventure",
    "ko": "모험"
   },
   "bg": {
    "en": "In English, a clock's front is called its face, and its pointers are called hands.",
    "ko": "영어로 시계의 문자판은 face(얼굴), 시곗바늘은 hands(손)라고 해요."
   },
   "sentences": [
    {
     "en": "Leo and Dana found an old bottle on the beach.",
     "ko": "레오와 다나가 바닷가에서 낡은 병을 주웠다."
    },
    {
     "en": "Inside was a pirate's note: \"Answer my riddle, and my treasure is yours.\"",
     "ko": "안에는 해적의 쪽지가 있었다. \"내 수수께끼를 풀면 보물은 너희 것이다.\""
    },
    {
     "en": "The riddle said, \"I have a face and two hands, but no arms or legs. What am I?\"",
     "ko": "수수께끼는 이랬다. \"나는 얼굴과 손이 둘 있지만, 팔과 다리는 없다. 나는 무엇일까?\""
    },
    {
     "en": "They thought and thought.",
     "ko": "둘은 생각하고 또 생각했다."
    },
    {
     "en": "\"A monster?\" Dana guessed. \"A robot?\" Leo said.",
     "ko": "\"괴물?\" 다나가 말했다. \"로봇?\" 레오가 말했다."
    },
    {
     "en": "Neither answer felt right.",
     "ko": "둘 다 정답 같지 않았다."
    },
    {
     "en": "They walked through town, looking for clues.",
     "ko": "둘은 단서를 찾아 마을을 걸었다."
    },
    {
     "en": "Then a bell rang twelve times, and Leo looked up.",
     "ko": "그때 종이 열두 번 울렸고, 레오가 고개를 들었다."
    },
    {
     "en": "There, on the tower, was a big old clock!",
     "ko": "탑 위에 커다란 옛날 시계가 있었다!"
    },
    {
     "en": "\"A clock has a face and two hands!\" he shouted.",
     "ko": "\"시계는 얼굴(문자판)과 손(바늘)이 두 개 있잖아!\" 레오가 외쳤다."
    },
    {
     "en": "Behind the clock, they found a small wooden box.",
     "ko": "둘은 시계 뒤에서 작은 나무 상자를 찾았다."
    },
    {
     "en": "Inside, there was no gold, only a letter.",
     "ko": "안에는 금이 아니라 편지 한 장만 있었다."
    },
    {
     "en": "The letter said, \"The real treasure is the adventure you shared with a friend.\"",
     "ko": "편지에는 \"진짜 보물은 친구와 함께한 모험이다.\"라고 쓰여 있었다."
    },
    {
     "en": "Leo and Dana laughed, because it was true.",
     "ko": "레오와 다나는 웃었다. 정말 그랬으니까."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The letter tells the message of the story: the adventure itself was the treasure.",
    "ko": "편지가 이야기의 메시지, 즉 모험 자체가 보물이었다는 것을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Leo and Dana find a box full of gold.",
      "ko": "레오와 다나가 금이 가득한 상자를 찾는다."
     },
     {
      "en": "Leo and Dana fix an old clock.",
      "ko": "레오와 다나가 낡은 시계를 고친다."
     },
     {
      "en": "Two friends solve a pirate's riddle and find that the adventure is the treasure.",
      "ko": "두 친구가 해적의 수수께끼를 풀고 모험이 바로 보물이라는 것을 알게 된다."
     },
     {
      "en": "Dana writes a riddle for Leo.",
      "ko": "다나가 레오에게 수수께끼를 낸다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The friends solve the riddle and learn that sharing the adventure is the real treasure.",
     "ko": "두 친구가 수수께끼를 풀고 함께한 모험이 진짜 보물이라는 것을 깨닫는 이야기예요."
    }
   },
   "words": [
    {
     "en": "riddle",
     "ko": "수수께끼"
    },
    {
     "en": "clues",
     "ko": "단서들"
    },
    {
     "en": "treasure",
     "ko": "보물"
    }
   ],
   "summary": {
    "ko": "레오와 다나는 수수께끼를 풀고 함께한 모험이 진짜 보물이라는 것을 알았다.",
    "en": "Leo and Dana solved the riddle and learned that their adventure was the real treasure.",
    "keywords": [
     "riddle",
     "adventure",
     "treasure"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-33",
   "genre": "story",
   "title": {
    "en": "The Girl Who Could Freeze Time",
    "ko": "시간을 멈추는 소녀"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "One blink of your eye takes about 0.1 to 0.4 seconds.",
    "ko": "눈을 한 번 깜빡이는 데는 약 0.1~0.4초가 걸려요."
   },
   "sentences": [
    {
     "en": "Sora found a strange silver watch in the school garden.",
     "ko": "소라는 학교 정원에서 이상한 은색 시계를 주웠다."
    },
    {
     "en": "When she pressed the button, everything stopped.",
     "ko": "단추를 누르자 모든 것이 멈췄다."
    },
    {
     "en": "Birds froze in the air, and her friends stood still like statues.",
     "ko": "새들은 공중에 멈췄고, 친구들은 조각상처럼 가만히 서 있었다."
    },
    {
     "en": "At first, Sora loved her new power.",
     "ko": "처음에 소라는 새로운 능력이 정말 좋았다."
    },
    {
     "en": "She froze time to finish her homework and to take extra cookies.",
     "ko": "시간을 멈춰서 숙제를 끝내고, 쿠키도 몰래 더 가져갔다."
    },
    {
     "en": "She even froze time during a test to look at her book.",
     "ko": "시험 시간에도 시간을 멈추고 책을 봤다."
    },
    {
     "en": "But soon she felt lonely, because nobody could talk to her.",
     "ko": "하지만 곧 외로워졌다. 아무도 소라와 이야기할 수 없었기 때문이다."
    },
    {
     "en": "One day, Sora pressed the button, and nothing happened.",
     "ko": "어느 날, 소라가 단추를 눌렀는데 아무 일도 일어나지 않았다."
    },
    {
     "en": "Time stayed frozen!",
     "ko": "시간이 계속 멈춰 있었다!"
    },
    {
     "en": "She pressed it again and again, but the world stayed silent.",
     "ko": "단추를 누르고 또 눌렀지만, 세상은 조용하기만 했다."
    },
    {
     "en": "Sora began to cry. \"I'm sorry,\" she said. \"I will never cheat again.\"",
     "ko": "소라가 울기 시작했다. \"미안해요.\" 소라가 말했다. \"다시는 속이지 않을게요.\""
    },
    {
     "en": "Suddenly, the watch clicked, and time started moving.",
     "ko": "갑자기 시계가 딸깍하더니 시간이 다시 움직였다."
    },
    {
     "en": "Sora buried the watch back in the garden.",
     "ko": "소라는 시계를 정원에 다시 묻었다."
    },
    {
     "en": "She learned that honest work is better than any magic shortcut.",
     "ko": "소라는 정직한 노력이 어떤 마법 지름길보다 낫다는 것을 배웠다."
    }
   ],
   "key": 13,
   "keyWhy": {
    "en": "This last sentence states the lesson Sora learned from the magic watch.",
    "ko": "소라가 마법 시계로 배운 교훈을 마지막에 정리한 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Sora wins a race with her magic watch.",
      "ko": "소라가 마법 시계로 달리기 경주에서 이긴다."
     },
     {
      "en": "Sora's friends learn to freeze time together.",
      "ko": "소라의 친구들이 함께 시간을 멈추는 법을 배운다."
     },
     {
      "en": "Sora loses her watch at school.",
      "ko": "소라가 학교에서 시계를 잃어버린다."
     },
     {
      "en": "A girl who can freeze time learns that cheating is lonely and honest work is better.",
      "ko": "시간을 멈추는 소녀가 속임수는 외롭고 정직한 노력이 더 낫다는 것을 배운다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Sora cheats with the watch, feels lonely, and learns honest work is better.",
     "ko": "소라가 시계로 속임수를 쓰다 외로워지고 정직한 노력이 낫다는 걸 배우는 이야기예요."
    }
   },
   "words": [
    {
     "en": "froze",
     "ko": "얼렸다, 멈췄다"
    },
    {
     "en": "lonely",
     "ko": "외로운"
    },
    {
     "en": "honest",
     "ko": "정직한"
    }
   ],
   "summary": {
    "ko": "소라는 마법 시계로 속임수를 썼지만, 정직이 더 낫다는 것을 배웠다.",
    "en": "Sora used a magic watch to cheat, but she learned that honesty is better.",
    "keywords": [
     "watch",
     "cheat",
     "honesty"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-34",
   "genre": "story",
   "title": {
    "en": "The Volcano Scientist",
    "ko": "화산 과학자"
   },
   "topic": {
    "en": "Science",
    "ko": "과학"
   },
   "bg": {
    "en": "Scientists watch for small earthquakes and changes in the ground to predict eruptions.",
    "ko": "과학자들은 작은 지진과 땅의 변화를 살펴 화산 폭발을 미리 알아내려고 해요."
   },
   "sentences": [
    {
     "en": "Dr. Yoon was a scientist who studied volcanoes.",
     "ko": "윤 박사는 화산을 연구하는 과학자였다."
    },
    {
     "en": "She lived in a small village near a big mountain called Mount Fira.",
     "ko": "박사는 피라산이라는 큰 산 근처 작은 마을에 살았다."
    },
    {
     "en": "For many years, the volcano was quiet.",
     "ko": "오랫동안 화산은 조용했다."
    },
    {
     "en": "But one week, her machines showed small earthquakes every day.",
     "ko": "그런데 어느 주, 박사의 기계에 매일 작은 지진이 잡혔다."
    },
    {
     "en": "The ground near the top was also getting warmer.",
     "ko": "꼭대기 근처 땅도 점점 따뜻해지고 있었다."
    },
    {
     "en": "\"The volcano may erupt soon,\" she told the village leader.",
     "ko": "\"화산이 곧 폭발할지도 몰라요.\" 박사가 이장에게 말했다."
    },
    {
     "en": "But he did not believe her. \"It has been quiet for a hundred years,\" he said.",
     "ko": "하지만 이장은 믿지 않았다. \"백 년 동안이나 조용했는걸요.\" 이장이 말했다."
    },
    {
     "en": "Dr. Yoon did not give up.",
     "ko": "윤 박사는 포기하지 않았다."
    },
    {
     "en": "She showed him her data and asked the families to leave just in case.",
     "ko": "박사는 자료를 보여 주고, 만약을 위해 가족들에게 마을을 떠나 달라고 부탁했다."
    },
    {
     "en": "Two days later, a huge cloud of ash burst from the mountain!",
     "ko": "이틀 뒤, 산에서 거대한 화산재 구름이 터져 나왔다!"
    },
    {
     "en": "Hot lava flowed down toward the empty village.",
     "ko": "뜨거운 용암이 텅 빈 마을 쪽으로 흘러내렸다."
    },
    {
     "en": "Because everyone had left in time, nobody was hurt.",
     "ko": "모두 제때 떠났기 때문에 아무도 다치지 않았다."
    },
    {
     "en": "The leader thanked her. \"You were right to trust the science.\"",
     "ko": "이장이 박사에게 고마워했다. \"과학을 믿은 당신이 옳았어요.\""
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The leader's words show the point of the story: trusting science saved the village.",
    "ko": "이장의 말이 이야기의 핵심, 즉 과학을 믿어서 마을을 구했다는 것을 보여 줘요."
   },
   "main": {
    "options": [
     {
      "en": "A scientist warns a village about a volcano and saves everyone.",
      "ko": "과학자가 마을에 화산을 경고해서 모두를 구한다."
     },
     {
      "en": "Dr. Yoon climbs the volcano for fun.",
      "ko": "윤 박사가 재미로 화산에 올라간다."
     },
     {
      "en": "The village leader builds a new machine.",
      "ko": "이장이 새 기계를 만든다."
     },
     {
      "en": "The volcano stays quiet for another hundred years.",
      "ko": "화산이 또 백 년 동안 조용하다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Dr. Yoon uses her data to warn the village, and everyone leaves before the eruption.",
     "ko": "윤 박사가 자료로 경고해서 모두가 폭발 전에 떠나 무사했기 때문이에요."
    }
   },
   "words": [
    {
     "en": "volcano",
     "ko": "화산"
    },
    {
     "en": "erupt",
     "ko": "폭발하다"
    },
    {
     "en": "data",
     "ko": "자료"
    }
   ],
   "summary": {
    "ko": "윤 박사는 과학으로 마을에 경고해서 모두를 구했다.",
    "en": "Dr. Yoon used science to warn the village, and everyone was saved.",
    "keywords": [
     "science",
     "village",
     "saved"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-35",
   "genre": "story",
   "title": {
    "en": "Robot Soccer Championship",
    "ko": "로봇 축구 대회"
   },
   "topic": {
    "en": "Sports",
    "ko": "스포츠"
   },
   "bg": {
    "en": "RoboCup is an international robot soccer competition that started in 1997.",
    "ko": "로보컵(RoboCup)은 로봇들이 축구로 겨루는 국제 대회로, 1997년에 처음 열렸어요."
   },
   "sentences": [
    {
     "en": "Jiho and his team built a soccer robot named Kicker for the school championship.",
     "ko": "지호와 팀원들은 학교 대회에 나가려고 키커라는 축구 로봇을 만들었다."
    },
    {
     "en": "Kicker was small, but it could pass the ball perfectly.",
     "ko": "키커는 작았지만, 패스만큼은 완벽했다."
    },
    {
     "en": "In the final match, they played against Team Titan.",
     "ko": "결승전에서 지호네 팀은 타이탄 팀과 맞붙었다."
    },
    {
     "en": "Titan's robot was huge, fast, and very strong.",
     "ko": "타이탄 팀의 로봇은 거대하고, 빠르고, 아주 힘이 셌다."
    },
    {
     "en": "By halftime, Team Titan was winning three to zero.",
     "ko": "전반전이 끝날 때 타이탄 팀이 3 대 0으로 이기고 있었다."
    },
    {
     "en": "Then a big problem happened: Kicker's left wheel broke!",
     "ko": "그때 큰 문제가 생겼다. 키커의 왼쪽 바퀴가 부러진 것이다!"
    },
    {
     "en": "Jiho's team wanted to give up.",
     "ko": "지호네 팀은 포기하고 싶었다."
    },
    {
     "en": "\"Wait,\" said Jiho. \"Kicker can't run fast, but it can still pass.\"",
     "ko": "\"잠깐.\" 지호가 말했다. \"키커는 빨리 못 달려도, 패스는 할 수 있어.\""
    },
    {
     "en": "They changed the program so Kicker stayed in the middle and passed to the other robots.",
     "ko": "팀은 프로그램을 바꿔서 키커가 가운데에 서서 다른 로봇들에게 패스하게 했다."
    },
    {
     "en": "Pass, pass, goal!",
     "ko": "패스, 패스, 골!"
    },
    {
     "en": "Their teamwork confused Titan's big robot.",
     "ko": "지호네 팀의 협동 플레이에 타이탄의 큰 로봇은 갈팡질팡했다."
    },
    {
     "en": "In the last minute, the score was four to three!",
     "ko": "마지막 1분, 점수는 4 대 3이 되었다!"
    },
    {
     "en": "Jiho's team won the championship.",
     "ko": "지호네 팀이 우승했다."
    },
    {
     "en": "They learned that smart teamwork can beat size and speed.",
     "ko": "팀은 똑똑한 협동이 크기와 속도도 이길 수 있다는 것을 배웠다."
    }
   ],
   "key": 13,
   "keyWhy": {
    "en": "This sentence tells the lesson the team learned from winning the final.",
    "ko": "결승에서 이긴 팀이 배운 교훈을 말해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Kicker becomes the biggest robot in the school.",
      "ko": "키커가 학교에서 가장 큰 로봇이 된다."
     },
     {
      "en": "A small robot team wins the final with smart teamwork.",
      "ko": "작은 로봇 팀이 똑똑한 협동으로 결승에서 이긴다."
     },
     {
      "en": "Team Titan fixes Kicker's wheel.",
      "ko": "타이탄 팀이 키커의 바퀴를 고쳐 준다."
     },
     {
      "en": "Jiho decides to quit robot soccer.",
      "ko": "지호가 로봇 축구를 그만두기로 한다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Even with a broken wheel, Kicker helps the team win by passing.",
     "ko": "바퀴가 부러졌는데도 패스로 협동해서 이긴 이야기이기 때문이에요."
    }
   },
   "words": [
    {
     "en": "championship",
     "ko": "선수권 대회"
    },
    {
     "en": "teamwork",
     "ko": "협동"
    },
    {
     "en": "program",
     "ko": "프로그램"
    }
   ],
   "summary": {
    "ko": "지호네 팀은 똑똑한 협동으로 로봇 축구 결승에서 이겼다.",
    "en": "Jiho's team won the robot soccer final with smart teamwork.",
    "keywords": [
     "team",
     "robot",
     "teamwork"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-36",
   "genre": "story",
   "title": {
    "en": "The Ghost Ship",
    "ko": "유령선"
   },
   "topic": {
    "en": "Ocean",
    "ko": "바다"
   },
   "bg": {
    "en": "Long ago, many ships kept cats on board to catch rats.",
    "ko": "옛날 배에는 쥐를 잡으려고 고양이를 태우는 일이 많았어요."
   },
   "sentences": [
    {
     "en": "One foggy night, Captain Rina saw a ship with torn sails.",
     "ko": "안개 낀 어느 밤, 리나 선장은 돛이 찢어진 배를 봤다."
    },
    {
     "en": "There were no lights, and nobody was on deck.",
     "ko": "불빛도 없고, 갑판에는 아무도 없었다."
    },
    {
     "en": "\"It's a ghost ship!\" the sailors whispered.",
     "ko": "\"유령선이야!\" 선원들이 속삭였다."
    },
    {
     "en": "Curious, Rina rowed over in a small boat.",
     "ko": "궁금해진 리나는 작은 보트를 저어 그 배로 갔다."
    },
    {
     "en": "The old ship creaked and moaned in the wind.",
     "ko": "낡은 배가 바람에 삐걱삐걱 신음 소리를 냈다."
    },
    {
     "en": "Then she heard a sad cry from below the deck.",
     "ko": "그때 갑판 아래에서 슬픈 울음소리가 들렸다."
    },
    {
     "en": "Her heart beat fast, but she climbed down the dark stairs.",
     "ko": "심장이 쿵쾅거렸지만, 리나는 어두운 계단을 내려갔다."
    },
    {
     "en": "In the corner, two glowing eyes looked at her!",
     "ko": "구석에서 빛나는 눈 두 개가 리나를 쳐다봤다!"
    },
    {
     "en": "Rina slowly lifted her lamp.",
     "ko": "리나는 천천히 등불을 들어 올렸다."
    },
    {
     "en": "It was not a ghost at all, but a small, hungry cat!",
     "ko": "유령이 아니라 작고 배고픈 고양이였다!"
    },
    {
     "en": "It had been alone on the ship for days.",
     "ko": "고양이는 며칠 동안 배에 혼자 있었던 것이다."
    },
    {
     "en": "Rina took it back to her ship and gave it warm milk.",
     "ko": "리나는 고양이를 자기 배로 데려가 따뜻한 우유를 주었다."
    },
    {
     "en": "The crew named the cat Ghost, and it became their friend.",
     "ko": "선원들은 고양이에게 \"고스트\"라는 이름을 붙였고, 고양이는 선원들의 친구가 되었다."
    },
    {
     "en": "Sometimes the things we fear are just waiting for help.",
     "ko": "때로는 우리가 무서워하는 것이 사실은 도움을 기다리고 있다."
    }
   ],
   "key": 13,
   "keyWhy": {
    "en": "This sentence tells the lesson: the scary sound was a cat that needed help.",
    "ko": "무서운 소리가 사실은 도움이 필요한 고양이였다는 교훈을 말해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "The crew sails away from the ghost ship.",
      "ko": "선원들이 유령선에서 도망친다."
     },
     {
      "en": "Rina finds gold on the old ship.",
      "ko": "리나가 낡은 배에서 금을 찾는다."
     },
     {
      "en": "Rina bravely explores a \"ghost ship\" and rescues a lonely cat.",
      "ko": "리나가 용감하게 \"유령선\"을 살펴보고 외로운 고양이를 구한다."
     },
     {
      "en": "A ghost takes Rina's lamp.",
      "ko": "유령이 리나의 등불을 가져간다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "Rina bravely checks the \"ghost ship\" and rescues a lonely cat.",
     "ko": "리나가 용감하게 유령선을 살펴보고 외로운 고양이를 구하는 이야기예요."
    }
   },
   "words": [
    {
     "en": "foggy",
     "ko": "안개 낀"
    },
    {
     "en": "deck",
     "ko": "갑판"
    },
    {
     "en": "hungry",
     "ko": "배고픈"
    }
   ],
   "summary": {
    "ko": "유령선에는 유령이 아니라 리나가 구한 외로운 고양이가 있었다.",
    "en": "The ghost ship had no ghost, only a lonely cat that Rina saved.",
    "keywords": [
     "ghost",
     "cat",
     "saved"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-37",
   "genre": "story",
   "title": {
    "en": "Journey Inside the Body",
    "ko": "몸속 여행"
   },
   "topic": {
    "en": "Health",
    "ko": "건강"
   },
   "bg": {
    "en": "Your heart beats about 100,000 times a day.",
    "ko": "우리 심장은 하루에 약 10만 번 뛰어요."
   },
   "sentences": [
    {
     "en": "Dr. Han invented a tiny submarine, and Mina and her brother Joon climbed inside.",
     "ko": "한 박사가 아주 작은 잠수함을 발명했고, 미나와 동생 준이 그 안에 올라탔다."
    },
    {
     "en": "\"You will travel through my blood,\" said Dr. Han. \"Come back in ten minutes!\"",
     "ko": "\"너희는 내 혈관 속을 여행할 거야.\" 한 박사가 말했다. \"10분 안에 돌아와야 해!\""
    },
    {
     "en": "Zap! The submarine became smaller than a grain of sand.",
     "ko": "지잉! 잠수함이 모래알보다 작아졌다."
    },
    {
     "en": "A nurse put it into Dr. Han's arm with a needle.",
     "ko": "간호사가 주사기로 잠수함을 한 박사의 팔에 넣었다."
    },
    {
     "en": "Inside, red blood cells floated past like little red plates.",
     "ko": "안에서는 적혈구들이 작은 빨간 접시처럼 둥둥 떠다녔다."
    },
    {
     "en": "Then they reached the heart, and it pushed them forward with a loud boom, boom.",
     "ko": "그러다 심장에 닿자, 심장이 쿵, 쿵 큰 소리를 내며 그들을 앞으로 밀어냈다."
    },
    {
     "en": "Suddenly, an alarm rang.",
     "ko": "갑자기 경보가 울렸다."
    },
    {
     "en": "Big white blood cells were rushing toward them!",
     "ko": "커다란 백혈구들이 그들을 향해 몰려오고 있었다!"
    },
    {
     "en": "\"They think we are germs!\" shouted Joon.",
     "ko": "\"우리를 세균인 줄 알아!\" 준이 외쳤다."
    },
    {
     "en": "Mina turned around and raced back to the arm.",
     "ko": "미나는 잠수함을 돌려 팔 쪽으로 쏜살같이 되돌아갔다."
    },
    {
     "en": "Just in time, the nurse pulled them out with the needle.",
     "ko": "아슬아슬하게 간호사가 주사기로 그들을 꺼냈다."
    },
    {
     "en": "Back at full size, Joon was still shaking.",
     "ko": "원래 크기로 돌아왔지만 준은 아직도 떨고 있었다."
    },
    {
     "en": "\"Our bodies fight germs every second to keep us healthy,\" said Mina.",
     "ko": "\"우리 몸은 우리를 건강하게 지키려고 매 순간 세균과 싸워.\" 미나가 말했다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "Mina's words explain what the trip taught them about the body.",
    "ko": "미나의 말이 이번 여행으로 몸에 대해 배운 것을 설명해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Dr. Han gets sick from a germ.",
      "ko": "한 박사가 세균 때문에 아프다."
     },
     {
      "en": "Mina and Joon build a real submarine for the sea.",
      "ko": "미나와 준이 바다에서 탈 진짜 잠수함을 만든다."
     },
     {
      "en": "The nurse loses the tiny submarine.",
      "ko": "간호사가 작은 잠수함을 잃어버린다."
     },
     {
      "en": "Two kids travel inside a body and learn how it fights germs.",
      "ko": "두 아이가 몸속을 여행하며 몸이 세균과 싸우는 방법을 알게 된다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The kids travel through blood and see how white blood cells fight germs.",
     "ko": "아이들이 혈관 속을 여행하며 백혈구가 세균과 싸우는 모습을 보는 이야기예요."
    }
   },
   "words": [
    {
     "en": "submarine",
     "ko": "잠수함"
    },
    {
     "en": "blood",
     "ko": "피, 혈액"
    },
    {
     "en": "germs",
     "ko": "세균들"
    }
   ],
   "summary": {
    "ko": "미나와 준은 혈관 속을 여행하며 우리 몸이 세균과 싸우는 법을 알게 되었다.",
    "en": "Mina and Joon traveled through blood and learned how our bodies fight germs.",
    "keywords": [
     "blood",
     "bodies",
     "germs"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-38",
   "genre": "story",
   "title": {
    "en": "The Desert Treasure",
    "ko": "사막의 보물"
   },
   "topic": {
    "en": "Adventure",
    "ko": "모험"
   },
   "bg": {
    "en": "A thirsty camel can drink more than 100 liters of water at one time.",
    "ko": "목마른 낙타는 한 번에 100리터가 넘는 물을 마실 수 있어요."
   },
   "sentences": [
    {
     "en": "Sami and his grandfather crossed the hot desert on two camels.",
     "ko": "사미와 할아버지가 낙타 두 마리를 타고 뜨거운 사막을 건넜다."
    },
    {
     "en": "They were looking for the lost city of gold from Grandpa's old stories.",
     "ko": "둘은 할아버지의 옛이야기 속 잃어버린 황금 도시를 찾고 있었다."
    },
    {
     "en": "On the third day, a huge sandstorm hit them.",
     "ko": "사흘째 되는 날, 거대한 모래 폭풍이 덮쳤다."
    },
    {
     "en": "They hid behind a rock and waited all night.",
     "ko": "둘은 바위 뒤에 숨어 밤새 기다렸다."
    },
    {
     "en": "In the morning, the wind had blown away a whole hill of sand.",
     "ko": "아침이 되자, 바람이 모래 언덕 하나를 통째로 날려 버렸다."
    },
    {
     "en": "Under it was an old stone door!",
     "ko": "그 밑에 오래된 돌문이 있었다!"
    },
    {
     "en": "But their water bottles were almost empty.",
     "ko": "하지만 물병은 거의 비어 있었다."
    },
    {
     "en": "\"Gold or water first?\" asked Grandpa with a tired smile.",
     "ko": "\"금이 먼저냐, 물이 먼저냐?\" 할아버지가 지친 얼굴로 웃으며 물었다."
    },
    {
     "en": "Sami pushed the heavy door open and gasped.",
     "ko": "사미가 무거운 문을 밀어 열고 깜짝 놀라 숨을 들이쉬었다."
    },
    {
     "en": "There was no gold inside, only a deep, cool well full of clean water.",
     "ko": "안에는 금은 없고, 깨끗한 물이 가득한 깊고 시원한 우물만 있었다."
    },
    {
     "en": "They drank and drank, and they filled every bottle.",
     "ko": "둘은 물을 마시고 또 마셨고, 모든 물병을 채웠다."
    },
    {
     "en": "Grandpa laughed. \"In the desert, water is the real gold.\"",
     "ko": "할아버지가 웃었다. \"사막에서는 물이 진짜 황금이란다.\""
    },
    {
     "en": "Sami understood that the most valuable thing is what keeps you alive.",
     "ko": "사미는 가장 소중한 것은 우리를 살게 해 주는 것이라는 걸 깨달았다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "Grandpa's words give the main point: in the desert, water matters more than gold.",
    "ko": "할아버지의 말이 핵심, 즉 사막에서는 금보다 물이 더 중요하다는 것을 말해 줘요."
   },
   "main": {
    "options": [
     {
      "en": "In the desert, Sami learns that water is worth more than gold.",
      "ko": "사막에서 사미는 물이 금보다 더 귀하다는 것을 배운다."
     },
     {
      "en": "Sami and Grandpa find a city full of gold.",
      "ko": "사미와 할아버지가 금으로 가득한 도시를 찾는다."
     },
     {
      "en": "The camels run away in the sandstorm.",
      "ko": "낙타들이 모래 폭풍 속에서 도망간다."
     },
     {
      "en": "Grandpa forgets all of his old stories.",
      "ko": "할아버지가 옛이야기를 모두 잊어버린다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "They find a well of water instead of gold and learn water is worth more.",
     "ko": "금 대신 우물을 찾고 물이 더 귀하다는 걸 배우는 이야기이기 때문이에요."
    }
   },
   "words": [
    {
     "en": "desert",
     "ko": "사막"
    },
    {
     "en": "sandstorm",
     "ko": "모래 폭풍"
    },
    {
     "en": "well",
     "ko": "우물"
    }
   ],
   "summary": {
    "ko": "사미는 금 대신 물을 찾고, 물이 진짜 보물이라는 것을 배웠다.",
    "en": "Sami found water instead of gold and learned that water is the real treasure.",
    "keywords": [
     "water",
     "gold",
     "treasure"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-39",
   "genre": "story",
   "title": {
    "en": "Message in a Bottle",
    "ko": "병 속의 편지"
   },
   "topic": {
    "en": "Friendship",
    "ko": "우정"
   },
   "bg": {
    "en": "Some messages in bottles have been found more than 100 years after they were thrown into the sea.",
    "ko": "바다에 띄운 병 편지가 100년도 더 지나서 발견된 적도 있어요."
   },
   "sentences": [
    {
     "en": "One summer morning, Yuna found a green bottle on a beach in Busan.",
     "ko": "어느 여름 아침, 유나가 부산의 바닷가에서 초록색 병을 발견했다."
    },
    {
     "en": "Inside was a letter in English.",
     "ko": "안에는 영어로 쓴 편지가 있었다."
    },
    {
     "en": "\"Hello! My name is Leo. I live on a small island in the Philippines. Please write back!\"",
     "ko": "\"안녕! 내 이름은 레오야. 나는 필리핀의 작은 섬에 살아. 답장해 줘!\""
    },
    {
     "en": "There was an email address at the bottom.",
     "ko": "맨 아래에 이메일 주소가 있었다."
    },
    {
     "en": "Yuna wrote to Leo that night, but no answer came.",
     "ko": "유나는 그날 밤 레오에게 편지를 보냈지만, 답장이 오지 않았다."
    },
    {
     "en": "A week passed, and then a month.",
     "ko": "일주일이 지나고, 한 달이 지났다."
    },
    {
     "en": "Yuna felt silly. Maybe the letter was too old.",
     "ko": "유나는 바보가 된 기분이었다. 어쩌면 편지가 너무 오래된 것일지도 몰랐다."
    },
    {
     "en": "Then one evening, her computer beeped.",
     "ko": "그러던 어느 저녁, 컴퓨터가 삐 하고 울렸다."
    },
    {
     "en": "It was Leo!",
     "ko": "레오였다!"
    },
    {
     "en": "\"Sorry! A big typhoon hit my island, and we had no electricity for weeks.\"",
     "ko": "\"미안해! 큰 태풍이 우리 섬을 덮쳐서 몇 주 동안 전기가 없었어.\""
    },
    {
     "en": "Yuna sent him photos of her school, and Leo sent pictures of turtles on his beach.",
     "ko": "유나는 학교 사진을 보냈고, 레오는 바닷가의 거북이 사진을 보냈다."
    },
    {
     "en": "Now they talk every week in English.",
     "ko": "이제 둘은 매주 영어로 이야기한다."
    },
    {
     "en": "A small bottle carried a big friendship across the sea.",
     "ko": "작은 병 하나가 바다 건너 큰 우정을 실어 날랐다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence sums up the story: a bottle started a friendship across the sea.",
    "ko": "병 하나가 바다 건너 우정을 시작하게 했다는 이야기 전체를 정리한 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Yuna throws a bottle into the sea.",
      "ko": "유나가 병을 바다에 던진다."
     },
     {
      "en": "Leo visits Yuna in Busan.",
      "ko": "레오가 부산에 사는 유나를 찾아온다."
     },
     {
      "en": "A message in a bottle starts a friendship between two kids far apart.",
      "ko": "병 속 편지가 멀리 떨어진 두 아이의 우정을 시작하게 한다."
     },
     {
      "en": "A typhoon breaks Yuna's computer.",
      "ko": "태풍이 유나의 컴퓨터를 고장 낸다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "Yuna finds Leo's letter, and they become friends who talk every week.",
     "ko": "유나가 레오의 편지를 발견하고 매주 이야기하는 친구가 되는 이야기예요."
    }
   },
   "words": [
    {
     "en": "bottle",
     "ko": "병"
    },
    {
     "en": "island",
     "ko": "섬"
    },
    {
     "en": "typhoon",
     "ko": "태풍"
    }
   ],
   "summary": {
    "ko": "병 속 편지 덕분에 유나와 레오는 바다 건너 친구가 되었다.",
    "en": "A letter in a bottle made Yuna and Leo friends across the sea.",
    "keywords": [
     "bottle",
     "friends",
     "sea"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-40",
   "genre": "story",
   "title": {
    "en": "The Weather Machine",
    "ko": "날씨 기계"
   },
   "topic": {
    "en": "Science",
    "ko": "과학"
   },
   "bg": {
    "en": "Most snowflakes have six sides.",
    "ko": "눈송이는 대부분 여섯 갈래의 육각형 모양이에요."
   },
   "sentences": [
    {
     "en": "Jisu loved science, and she wanted to win the school science fair.",
     "ko": "지수는 과학을 좋아했고, 학교 과학 대회에서 우승하고 싶었다."
    },
    {
     "en": "So she built a weather machine out of an old fan, a fridge part, and a lot of wires.",
     "ko": "그래서 낡은 선풍기, 냉장고 부품, 그리고 많은 전선으로 날씨 기계를 만들었다."
    },
    {
     "en": "On the day of the fair, she turned the dial to \"Snow.\"",
     "ko": "대회 날, 지수는 다이얼을 \"눈\"에 맞췄다."
    },
    {
     "en": "Little snowflakes fell on the judges, and everyone clapped.",
     "ko": "작은 눈송이가 심사위원들 위로 떨어지자 모두가 박수를 쳤다."
    },
    {
     "en": "But then the dial got stuck.",
     "ko": "그런데 다이얼이 걸려서 움직이지 않았다."
    },
    {
     "en": "The snow became heavier and heavier.",
     "ko": "눈이 점점 더 많이 내렸다."
    },
    {
     "en": "Soon the gym was full of snow, and the wind was howling!",
     "ko": "곧 체육관이 눈으로 가득 찼고, 바람이 휘몰아쳤다!"
    },
    {
     "en": "Students screamed and slid across the floor.",
     "ko": "학생들이 소리를 지르며 바닥에서 미끄러졌다."
    },
    {
     "en": "Jisu crawled to the machine and opened the back.",
     "ko": "지수는 기계까지 기어가서 뒤판을 열었다."
    },
    {
     "en": "One red wire was loose.",
     "ko": "빨간 전선 하나가 빠져 있었다."
    },
    {
     "en": "She fixed it with shaking hands and turned the dial to \"Sun.\"",
     "ko": "지수는 떨리는 손으로 전선을 고치고 다이얼을 \"해\"로 돌렸다."
    },
    {
     "en": "Warm light filled the room, and the snow melted.",
     "ko": "따뜻한 빛이 방을 채우고 눈이 녹았다."
    },
    {
     "en": "Jisu did not win first prize, but she learned to test her inventions carefully before showing them.",
     "ko": "지수는 1등을 하지 못했지만, 발명품을 보여 주기 전에 꼼꼼히 시험해야 한다는 것을 배웠다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The last sentence tells what Jisu learned after the machine went wrong.",
    "ko": "기계가 고장 난 뒤 지수가 배운 것을 말해 주는 마지막 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Jisu wins first prize with an old fan.",
      "ko": "지수가 낡은 선풍기로 1등을 한다."
     },
     {
      "en": "Jisu's weather machine goes wrong, and she learns to test inventions carefully.",
      "ko": "지수의 날씨 기계가 고장 나고, 지수는 발명품을 꼼꼼히 시험해야 한다는 것을 배운다."
     },
     {
      "en": "It snows outside the school all day.",
      "ko": "학교 밖에 하루 종일 눈이 온다."
     },
     {
      "en": "The judges build a snowman in the gym.",
      "ko": "심사위원들이 체육관에서 눈사람을 만든다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The machine makes too much snow, and Jisu learns to test her inventions first.",
     "ko": "기계가 눈을 너무 많이 만들고, 지수가 먼저 시험해야 한다는 걸 배우는 이야기예요."
    }
   },
   "words": [
    {
     "en": "machine",
     "ko": "기계"
    },
    {
     "en": "wire",
     "ko": "전선"
    },
    {
     "en": "inventions",
     "ko": "발명품들"
    }
   ],
   "summary": {
    "ko": "지수의 기계가 눈을 너무 많이 만들어서, 지수는 먼저 시험해 봐야 한다는 것을 배웠다.",
    "en": "Jisu's machine made too much snow, so she learned to test her work first.",
    "keywords": [
     "machine",
     "snow",
     "test"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-41",
   "genre": "story",
   "title": {
    "en": "Ninja School",
    "ko": "닌자 학교"
   },
   "topic": {
    "en": "Heroes",
    "ko": "영웅"
   },
   "bg": {
    "en": "Raccoons have very sensitive front paws and can pick things up like hands.",
    "ko": "너구리는 앞발이 아주 예민해서 물건을 손처럼 잘 집어요."
   },
   "sentences": [
    {
     "en": "Kenji was the smallest student at the secret ninja school in the mountains.",
     "ko": "켄지는 산속 비밀 닌자 학교에서 가장 작은 학생이었다."
    },
    {
     "en": "He could not jump as high as the others, and he was not very strong.",
     "ko": "다른 학생들만큼 높이 뛰지 못했고, 힘도 별로 세지 않았다."
    },
    {
     "en": "The big kids laughed at him every day.",
     "ko": "덩치 큰 아이들은 매일 켄지를 놀렸다."
    },
    {
     "en": "But Kenji was good at one thing: he noticed everything.",
     "ko": "하지만 켄지가 잘하는 것이 하나 있었다. 바로 모든 것을 알아차리는 것이었다."
    },
    {
     "en": "One night, the school's golden scroll disappeared!",
     "ko": "어느 밤, 학교의 황금 두루마리가 사라졌다!"
    },
    {
     "en": "The strongest students ran into the forest to search, but they found nothing.",
     "ko": "가장 힘센 학생들이 숲으로 달려가 찾았지만, 아무것도 찾지 못했다."
    },
    {
     "en": "Kenji stayed behind and looked closely at the floor.",
     "ko": "켄지는 남아서 바닥을 꼼꼼히 살펴봤다."
    },
    {
     "en": "He saw a little flour and some tiny footprints.",
     "ko": "밀가루 조금과 아주 작은 발자국들이 보였다."
    },
    {
     "en": "He followed them to the kitchen and found a fat raccoon sleeping on the scroll!",
     "ko": "그 흔적을 따라 부엌에 가 보니, 통통한 너구리가 두루마리 위에서 자고 있었다!"
    },
    {
     "en": "The raccoon had taken it to make a warm bed.",
     "ko": "너구리가 따뜻한 잠자리를 만들려고 두루마리를 가져간 것이었다."
    },
    {
     "en": "The master smiled at Kenji.",
     "ko": "사부가 켄지를 보고 미소 지었다."
    },
    {
     "en": "\"A great ninja uses his eyes and his mind, not only his muscles.\"",
     "ko": "\"훌륭한 닌자는 근육만이 아니라 눈과 머리를 쓰는 법이다.\""
    },
    {
     "en": "From that day, nobody laughed at Kenji again.",
     "ko": "그날부터 아무도 켄지를 놀리지 않았다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "The master's words give the lesson: a great ninja uses his eyes and mind.",
    "ko": "사부의 말이 교훈, 즉 훌륭한 닌자는 눈과 머리를 쓴다는 것을 말해 줘요."
   },
   "main": {
    "options": [
     {
      "en": "Kenji becomes the strongest ninja in the school.",
      "ko": "켄지가 학교에서 가장 힘센 닌자가 된다."
     },
     {
      "en": "The big kids steal the golden scroll.",
      "ko": "덩치 큰 아이들이 황금 두루마리를 훔친다."
     },
     {
      "en": "A raccoon teaches Kenji how to jump.",
      "ko": "너구리가 켄지에게 뛰는 법을 가르친다."
     },
     {
      "en": "A small ninja solves a mystery by being smart and careful.",
      "ko": "작은 닌자가 영리하고 꼼꼼하게 수수께끼를 푼다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Small Kenji solves the mystery by noticing clues, not by being strong.",
     "ko": "작은 켄지가 힘이 아니라 단서를 알아차려서 수수께끼를 푸는 이야기예요."
    }
   },
   "words": [
    {
     "en": "scroll",
     "ko": "두루마리"
    },
    {
     "en": "footprints",
     "ko": "발자국"
    },
    {
     "en": "muscles",
     "ko": "근육"
    }
   ],
   "summary": {
    "ko": "켄지는 눈과 머리를 써서 잃어버린 두루마리를 찾았다.",
    "en": "Kenji found the lost scroll by using his eyes and his mind.",
    "keywords": [
     "scroll",
     "eyes",
     "mind"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-42",
   "genre": "story",
   "title": {
    "en": "The Black Hole Shortcut",
    "ko": "블랙홀 지름길"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Real space probes use a planet's gravity to speed up. This is called a gravity assist.",
    "ko": "실제 우주 탐사선도 행성의 중력을 이용해 속도를 높여요. 이것을 \"중력 도움\"이라고 해요."
   },
   "sentences": [
    {
     "en": "Captain Aria and her robot, Pip, were flying home to Earth with medicine for a sick town.",
     "ko": "아리아 선장과 로봇 핍은 아픈 마을에 줄 약을 싣고 지구로 날아가고 있었다."
    },
    {
     "en": "The trip would take three more weeks.",
     "ko": "여행은 3주가 더 걸릴 예정이었다."
    },
    {
     "en": "\"There is a shortcut,\" said Pip. \"We can fly near that black hole and save two weeks.\"",
     "ko": "\"지름길이 있어요.\" 핍이 말했다. \"저 블랙홀 가까이 날아가면 2주를 아낄 수 있어요.\""
    },
    {
     "en": "Aria knew it was dangerous, but the town needed the medicine fast.",
     "ko": "아리아는 위험하다는 걸 알았지만, 마을에는 약이 빨리 필요했다."
    },
    {
     "en": "As they got closer, the ship began to shake.",
     "ko": "가까이 갈수록 우주선이 흔들리기 시작했다."
    },
    {
     "en": "The black hole was pulling them in!",
     "ko": "블랙홀이 우주선을 끌어당기고 있었다!"
    },
    {
     "en": "Even light could not escape from it.",
     "ko": "블랙홀에서는 빛조차 빠져나올 수 없었다."
    },
    {
     "en": "\"Engines at full power!\" shouted Aria.",
     "ko": "\"엔진 최대 출력!\" 아리아가 외쳤다."
    },
    {
     "en": "Pip found the perfect angle.",
     "ko": "핍이 완벽한 각도를 찾아냈다."
    },
    {
     "en": "Whoosh! The ship swung around the edge of the black hole and shot away like a stone from a slingshot.",
     "ko": "슝! 우주선이 블랙홀 가장자리를 돌아 새총에서 튕겨 나간 돌처럼 날아갔다."
    },
    {
     "en": "They reached Earth just in time, and the people of the town got better.",
     "ko": "둘은 딱 맞춰 지구에 도착했고, 마을 사람들은 건강을 되찾았다."
    },
    {
     "en": "\"Brave choices need smart teamwork,\" said Aria, and Pip's lights blinked happily.",
     "ko": "\"용감한 선택에는 똑똑한 팀워크가 필요해.\" 아리아가 말하자 핍의 불빛이 기쁘게 깜빡였다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "Aria's words give the lesson of the risky trip: brave choices need teamwork.",
    "ko": "아리아의 말이 위험한 여행의 교훈, 즉 용감한 선택에는 팀워크가 필요하다는 것을 말해 줘요."
   },
   "main": {
    "options": [
     {
      "en": "A captain and her robot take a risky shortcut to bring medicine home in time.",
      "ko": "선장과 로봇이 제때 약을 전하려고 위험한 지름길을 지난다."
     },
     {
      "en": "Pip falls into the black hole.",
      "ko": "핍이 블랙홀에 빠진다."
     },
     {
      "en": "Aria decides to stay in space forever.",
      "ko": "아리아가 우주에 영원히 머물기로 한다."
     },
     {
      "en": "The town makes medicine for the robot.",
      "ko": "마을 사람들이 로봇을 위해 약을 만든다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Aria and Pip take a dangerous black hole shortcut to bring the medicine in time.",
     "ko": "아리아와 핍이 약을 제때 전하려고 위험한 블랙홀 지름길을 지나는 이야기예요."
    }
   },
   "words": [
    {
     "en": "medicine",
     "ko": "약"
    },
    {
     "en": "shortcut",
     "ko": "지름길"
    },
    {
     "en": "escape",
     "ko": "빠져나오다"
    }
   ],
   "summary": {
    "ko": "아리아와 핍은 블랙홀 지름길을 이용해 아픈 마을을 구했다.",
    "en": "Aria and Pip used a black hole shortcut and saved the sick town.",
    "keywords": [
     "black",
     "shortcut",
     "town"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-43",
   "genre": "story",
   "title": {
    "en": "The Dream Thief",
    "ko": "꿈 도둑"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "Most people dream about four to six times every night.",
    "ko": "사람은 보통 하룻밤에 4~6번 정도 꿈을 꿔요."
   },
   "sentences": [
    {
     "en": "Every night, Hana dreamed about flying over oceans and talking to whales.",
     "ko": "매일 밤 하나는 바다 위를 날고 고래와 이야기하는 꿈을 꾸었다."
    },
    {
     "en": "But one week, her dreams stopped.",
     "ko": "그런데 어느 주부터 꿈이 멈췄다."
    },
    {
     "en": "She saw only darkness, and she woke up tired and grumpy.",
     "ko": "깜깜한 어둠만 보였고, 아침마다 피곤하고 짜증 난 채로 일어났다."
    },
    {
     "en": "On Friday night, Hana pretended to sleep.",
     "ko": "금요일 밤, 하나는 자는 척했다."
    },
    {
     "en": "At midnight, a small shadow climbed through the window with an empty jar.",
     "ko": "한밤중에 작은 그림자가 빈 유리병을 들고 창문으로 들어왔다."
    },
    {
     "en": "It was a dream thief!",
     "ko": "꿈 도둑이었다!"
    },
    {
     "en": "Hana grabbed the jar. \"Why are you stealing my dreams?\"",
     "ko": "하나가 병을 붙잡았다. \"왜 내 꿈을 훔치는 거야?\""
    },
    {
     "en": "The little creature began to cry.",
     "ko": "그 작은 생명체가 울기 시작했다."
    },
    {
     "en": "\"I live in a gray world with no colors. Your dreams are the only beautiful thing I have.\"",
     "ko": "\"나는 색깔이 없는 회색 세상에 살아. 네 꿈이 내가 가진 유일한 아름다운 거야.\""
    },
    {
     "en": "Then she took out her crayons and drew a bright picture of the sea and the whales.",
     "ko": "그러자 하나는 크레파스를 꺼내 바다와 고래를 밝게 그렸다."
    },
    {
     "en": "\"Take this instead, and come back for a new one every week.\"",
     "ko": "\"대신 이걸 가져가. 그리고 매주 새 그림을 가지러 와.\""
    },
    {
     "en": "That night, Hana dreamed again, and her new friend had colors too.",
     "ko": "그날 밤 하나는 다시 꿈을 꾸었고, 새 친구에게도 색깔이 생겼다."
    },
    {
     "en": "Sharing made both of them happy.",
     "ko": "나눔이 둘 모두를 행복하게 만들었다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence states the lesson: sharing made both Hana and the thief happy.",
    "ko": "나눔이 하나와 도둑 모두를 행복하게 했다는 교훈을 말하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Hana catches a thief and calls the police.",
      "ko": "하나가 도둑을 잡아 경찰을 부른다."
     },
     {
      "en": "Hana stops sleeping at night.",
      "ko": "하나가 밤에 잠을 자지 않는다."
     },
     {
      "en": "Hana finds the dream thief and shares her drawings instead of fighting.",
      "ko": "하나가 꿈 도둑을 찾아내고, 싸우는 대신 그림을 나눠 준다."
     },
     {
      "en": "The creature gives Hana a jar full of colors.",
      "ko": "생명체가 하나에게 색깔이 가득 든 병을 준다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "Hana catches the dream thief but shares her drawings instead of fighting.",
     "ko": "하나가 꿈 도둑을 잡지만 싸우는 대신 그림을 나눠 주는 이야기이기 때문이에요."
    }
   },
   "words": [
    {
     "en": "dreams",
     "ko": "꿈들"
    },
    {
     "en": "thief",
     "ko": "도둑"
    },
    {
     "en": "creature",
     "ko": "생명체"
    }
   ],
   "summary": {
    "ko": "하나는 외로운 꿈 도둑에게 그림을 나눠 주었고, 둘 다 행복해졌다.",
    "en": "Hana shared her drawings with the lonely dream thief, and they both became happy.",
    "keywords": [
     "shared",
     "drawings",
     "happy"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-44",
   "genre": "story",
   "title": {
    "en": "The Last Tree on Mars",
    "ko": "화성의 마지막 나무"
   },
   "topic": {
    "en": "Environment",
    "ko": "환경"
   },
   "bg": {
    "en": "A day on Mars lasts about 24 hours and 37 minutes, almost the same as a day on Earth.",
    "ko": "화성의 하루는 약 24시간 37분으로 지구의 하루와 거의 비슷해요."
   },
   "sentences": [
    {
     "en": "In the year 2150, Leo lived in a glass city on Mars.",
     "ko": "2150년, 레오는 화성의 유리 도시에 살았다."
    },
    {
     "en": "Everything was metal and plastic, except one small apple tree in the park.",
     "ko": "공원의 작은 사과나무 한 그루를 빼면 모든 것이 금속과 플라스틱이었다."
    },
    {
     "en": "It was the last tree on Mars.",
     "ko": "그것은 화성의 마지막 나무였다."
    },
    {
     "en": "One morning, Leo saw that its leaves were turning brown.",
     "ko": "어느 아침, 레오는 나뭇잎이 갈색으로 변하는 걸 봤다."
    },
    {
     "en": "The city's water machine was broken, and the workers were too busy to fix it.",
     "ko": "도시의 물 기계가 고장 났는데, 일꾼들은 너무 바빠서 고칠 수 없었다."
    },
    {
     "en": "\"Without water, the tree will die in three days,\" said the gardener robot.",
     "ko": "\"물이 없으면 나무는 사흘 안에 죽을 거예요.\" 정원사 로봇이 말했다."
    },
    {
     "en": "Leo had an idea.",
     "ko": "레오에게 좋은 생각이 떠올랐다."
    },
    {
     "en": "He asked every family to save one cup of water from their drinks each day.",
     "ko": "레오는 모든 가족에게 매일 마실 물에서 한 컵씩 아껴 달라고 부탁했다."
    },
    {
     "en": "At first, only a few people came.",
     "ko": "처음에는 몇 사람만 왔다."
    },
    {
     "en": "Then more and more people lined up with their cups.",
     "ko": "그러다 점점 더 많은 사람이 컵을 들고 줄을 섰다."
    },
    {
     "en": "On the third day, the leaves turned green again, and a tiny flower opened.",
     "ko": "사흘째 되는 날, 잎이 다시 초록색이 되고 작은 꽃 한 송이가 피었다."
    },
    {
     "en": "Leo learned that when many people do a small thing, they can save something big.",
     "ko": "레오는 많은 사람이 작은 일을 함께하면 큰 것을 지킬 수 있다는 것을 배웠다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "This sentence tells what Leo learned: many small actions can save something big.",
    "ko": "작은 행동이 모이면 큰 것을 지킬 수 있다는, 레오가 배운 것을 말해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Leo plants a big forest on Earth.",
      "ko": "레오가 지구에 큰 숲을 만든다."
     },
     {
      "en": "Leo and his city work together to save the last tree on Mars.",
      "ko": "레오와 도시 사람들이 힘을 모아 화성의 마지막 나무를 살린다."
     },
     {
      "en": "The gardener robot cuts down the tree.",
      "ko": "정원사 로봇이 나무를 벤다."
     },
     {
      "en": "The water machine makes apple juice.",
      "ko": "물 기계가 사과 주스를 만든다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "Leo gets everyone to save a cup of water, and together they save the tree.",
     "ko": "레오가 모두에게 물 한 컵씩 모으게 해서 함께 나무를 살리는 이야기예요."
    }
   },
   "words": [
    {
     "en": "metal",
     "ko": "금속"
    },
    {
     "en": "gardener",
     "ko": "정원사"
    },
    {
     "en": "leaves",
     "ko": "잎들"
    }
   ],
   "summary": {
    "ko": "모두가 물 한 컵씩 아껴서 함께 마지막 나무를 살렸다.",
    "en": "Everyone saved a cup of water, and together they saved the last tree.",
    "keywords": [
     "water",
     "saved",
     "tree"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-45",
   "genre": "story",
   "title": {
    "en": "The Great Museum Heist",
    "ko": "박물관 대도난 사건"
   },
   "topic": {
    "en": "Mystery",
    "ko": "추리"
   },
   "bg": {
    "en": "Cats can see in much dimmer light than people can.",
    "ko": "고양이는 사람보다 훨씬 어두운 곳에서도 앞을 볼 수 있어요."
   },
   "sentences": [
    {
     "en": "On Monday morning, the famous Blue Star diamond was gone from the city museum.",
     "ko": "월요일 아침, 시립 박물관에서 유명한 블루 스타 다이아몬드가 사라졌다."
    },
    {
     "en": "The doors were locked, and the alarm never rang.",
     "ko": "문은 잠겨 있었고, 경보기는 한 번도 울리지 않았다."
    },
    {
     "en": "Young detective Minho looked around.",
     "ko": "어린 탐정 민호가 주위를 둘러봤다."
    },
    {
     "en": "He found three clues: small wet footprints, a long gray hair, and a tiny piece of fish.",
     "ko": "민호는 단서 세 개를 찾았다. 작고 젖은 발자국, 긴 회색 털, 그리고 아주 작은 생선 조각이었다."
    },
    {
     "en": "The guard said, \"Only the director has a key, and he loves fish!\"",
     "ko": "경비원이 말했다. \"열쇠는 관장님만 갖고 있고, 관장님은 생선을 정말 좋아해요!\""
    },
    {
     "en": "Everyone looked at the director, and his face turned red.",
     "ko": "모두가 관장을 쳐다봤고, 관장은 얼굴이 빨개졌다."
    },
    {
     "en": "But Minho shook his head.",
     "ko": "하지만 민호는 고개를 저었다."
    },
    {
     "en": "\"These footprints are too small for a person, and they lead to the air vent.\"",
     "ko": "\"이 발자국은 사람 것치고 너무 작고, 환기구 쪽으로 이어져 있어요.\""
    },
    {
     "en": "He opened the vent, and two shining eyes looked back at him.",
     "ko": "민호가 환기구를 열자, 반짝이는 두 눈이 그를 마주 보았다."
    },
    {
     "en": "It was Smokey, the museum's gray cat!",
     "ko": "박물관의 회색 고양이, 스모키였다!"
    },
    {
     "en": "She was lying on a pile of shiny things: keys, coins, and the Blue Star diamond.",
     "ko": "스모키는 열쇠, 동전, 그리고 블루 스타 다이아몬드 같은 반짝이는 물건 더미 위에 누워 있었다."
    },
    {
     "en": "Minho smiled. \"Good detectives follow the clues, not their first guess.\"",
     "ko": "민호가 웃었다. \"훌륭한 탐정은 첫 짐작이 아니라 단서를 따라가요.\""
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "Minho's words give the lesson: follow the clues, not your first guess.",
    "ko": "민호의 말이 교훈, 즉 첫 짐작이 아니라 단서를 따라가야 한다는 것을 말해 줘요."
   },
   "main": {
    "options": [
     {
      "en": "The director steals the diamond.",
      "ko": "관장이 다이아몬드를 훔친다."
     },
     {
      "en": "The guard forgets to lock the doors.",
      "ko": "경비원이 문 잠그는 것을 잊는다."
     },
     {
      "en": "Minho buys a diamond for his cat.",
      "ko": "민호가 고양이에게 다이아몬드를 사 준다."
     },
     {
      "en": "A young detective follows the clues and finds the real \"thief,\" a cat.",
      "ko": "어린 탐정이 단서를 따라가 진짜 \"도둑\"인 고양이를 찾아낸다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "Minho follows the small footprints and finds the cat, not the director.",
     "ko": "민호가 작은 발자국을 따라가 관장이 아닌 고양이를 찾아내는 이야기예요."
    }
   },
   "words": [
    {
     "en": "diamond",
     "ko": "다이아몬드"
    },
    {
     "en": "clues",
     "ko": "단서들"
    },
    {
     "en": "vent",
     "ko": "환기구"
    }
   ],
   "summary": {
    "ko": "민호는 단서를 따라가서 고양이가 다이아몬드를 가져갔다는 것을 알아냈다.",
    "en": "Minho followed the clues and found that a cat took the diamond.",
    "keywords": [
     "clues",
     "cat",
     "diamond"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-46",
   "genre": "story",
   "title": {
    "en": "The Tiger of Mount Baekdu",
    "ko": "백두산 호랑이"
   },
   "topic": {
    "en": "Adventure",
    "ko": "모험"
   },
   "bg": {
    "en": "The Siberian tiger, which lives near Mount Baekdu, is one of the biggest cats in the world.",
    "ko": "백두산 일대에 사는 시베리아호랑이는 세계에서 가장 큰 고양이과 동물 중 하나예요."
   },
   "sentences": [
    {
     "en": "Jun and his uncle were hiking on Mount Baekdu when heavy snow began to fall.",
     "ko": "준과 삼촌이 백두산을 오르고 있을 때 폭설이 내리기 시작했다."
    },
    {
     "en": "Uncle slipped on the ice and hurt his leg.",
     "ko": "삼촌이 얼음에 미끄러져 다리를 다쳤다."
    },
    {
     "en": "\"Go and find help,\" he said, but Jun did not want to leave him alone.",
     "ko": "\"가서 도움을 구해 와.\" 삼촌이 말했지만, 준은 삼촌을 혼자 두고 싶지 않았다."
    },
    {
     "en": "Then they heard a low growl behind the trees.",
     "ko": "그때 나무 뒤에서 낮게 으르렁거리는 소리가 들렸다."
    },
    {
     "en": "A huge tiger stepped out of the snow, with orange fur and bright yellow eyes.",
     "ko": "주황색 털과 밝은 노란 눈을 가진 커다란 호랑이가 눈 속에서 걸어 나왔다."
    },
    {
     "en": "Jun's heart pounded, but he stood in front of his uncle.",
     "ko": "준은 심장이 쿵쾅거렸지만 삼촌 앞을 막아섰다."
    },
    {
     "en": "The tiger looked at the boy for a long time.",
     "ko": "호랑이는 오랫동안 소년을 바라봤다."
    },
    {
     "en": "Then it turned and walked slowly down the mountain, leaving deep footprints.",
     "ko": "그러고는 몸을 돌려 깊은 발자국을 남기며 천천히 산을 내려갔다."
    },
    {
     "en": "\"Follow the tiger,\" whispered Uncle.",
     "ko": "\"호랑이를 따라가.\" 삼촌이 속삭였다."
    },
    {
     "en": "Jun helped his uncle walk, step by step, in the tiger's tracks.",
     "ko": "준은 삼촌을 부축하며 호랑이 발자국을 따라 한 걸음씩 걸었다."
    },
    {
     "en": "The tracks led them to a ranger's cabin with warm lights.",
     "ko": "발자국은 따뜻한 불빛이 켜진 산지기 오두막으로 이어졌다."
    },
    {
     "en": "Jun's courage and the tiger's path saved them both.",
     "ko": "준의 용기와 호랑이가 남긴 길이 두 사람을 구했다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "This sentence sums up how Jun and his uncle were saved.",
    "ko": "준과 삼촌이 어떻게 구조되었는지 정리해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "A brave boy and a mysterious tiger help his hurt uncle get to safety.",
      "ko": "용감한 소년과 신비한 호랑이가 다친 삼촌을 안전한 곳으로 이끈다."
     },
     {
      "en": "Jun catches a tiger on the mountain.",
      "ko": "준이 산에서 호랑이를 잡는다."
     },
     {
      "en": "Uncle teaches Jun how to ski.",
      "ko": "삼촌이 준에게 스키 타는 법을 가르친다."
     },
     {
      "en": "The tiger attacks the ranger's cabin.",
      "ko": "호랑이가 산지기 오두막을 공격한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "Jun bravely protects his uncle, and the tiger's tracks lead them to safety.",
     "ko": "준이 용감하게 삼촌을 지키고 호랑이 발자국이 둘을 안전한 곳으로 이끄는 이야기예요."
    }
   },
   "words": [
    {
     "en": "growl",
     "ko": "으르렁거림"
    },
    {
     "en": "tracks",
     "ko": "발자국"
    },
    {
     "en": "courage",
     "ko": "용기"
    }
   ],
   "summary": {
    "ko": "준은 용기를 잃지 않았고, 호랑이 발자국이 그들을 안전한 곳으로 이끌었다.",
    "en": "Jun stayed brave, and the tiger's tracks led them to safety.",
    "keywords": [
     "brave",
     "tracks",
     "safety"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-47",
   "genre": "story",
   "title": {
    "en": "The Secret Door in the School",
    "ko": "학교의 비밀 문"
   },
   "topic": {
    "en": "Fantasy",
    "ko": "판타지"
   },
   "bg": {
    "en": "One of the oldest libraries in the world, in Morocco, is more than 1,100 years old.",
    "ko": "세계에서 가장 오래된 도서관 중 하나인 모로코의 알 카라위인 도서관은 1,100년도 더 됐어요."
   },
   "sentences": [
    {
     "en": "There was a small blue door at the end of the third-floor hallway.",
     "ko": "3층 복도 끝에 작은 파란 문이 있었다."
    },
    {
     "en": "It was always locked, and no teacher talked about it.",
     "ko": "그 문은 늘 잠겨 있었고, 어떤 선생님도 그 문 이야기를 하지 않았다."
    },
    {
     "en": "One rainy afternoon, Seo-yeon saw the door open a little.",
     "ko": "비 오는 어느 오후, 서연이는 문이 살짝 열린 것을 봤다."
    },
    {
     "en": "She stepped inside, and suddenly she was standing in a library that floated in the sky.",
     "ko": "안으로 들어서자, 갑자기 하늘에 떠 있는 도서관에 서 있었다."
    },
    {
     "en": "Books flew around like birds.",
     "ko": "책들이 새처럼 날아다녔다."
    },
    {
     "en": "An old owl said, \"Every book here is an unfinished story.\"",
     "ko": "늙은 부엉이가 말했다. \"여기 있는 책은 모두 끝나지 않은 이야기란다.\""
    },
    {
     "en": "But then the floor began to disappear, page by page.",
     "ko": "그런데 바닥이 한 장씩 사라지기 시작했다."
    },
    {
     "en": "\"The library is fading because no one writes anymore!\" cried the owl.",
     "ko": "\"아무도 더 이상 글을 쓰지 않아서 도서관이 사라지고 있어!\" 부엉이가 외쳤다."
    },
    {
     "en": "Seo-yeon caught a flying book and grabbed a pencil.",
     "ko": "서연이는 날아가는 책을 잡고 연필을 쥐었다."
    },
    {
     "en": "Quickly, she wrote an ending for the story inside.",
     "ko": "서연이는 재빨리 그 안의 이야기에 결말을 썼다."
    },
    {
     "en": "The floor came back, bright and strong.",
     "ko": "바닥이 다시 밝고 튼튼하게 돌아왔다."
    },
    {
     "en": "The owl bowed. \"Come back anytime, young writer.\"",
     "ko": "부엉이가 고개를 숙였다. \"언제든 다시 오렴, 꼬마 작가야.\""
    },
    {
     "en": "Now Seo-yeon writes a little every day, because every story needs someone to finish it.",
     "ko": "이제 서연이는 매일 조금씩 글을 쓴다. 모든 이야기에는 끝맺어 줄 누군가가 필요하기 때문이다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The last sentence tells the lesson Seo-yeon took from the magic library.",
    "ko": "서연이가 마법 도서관에서 얻은 교훈을 말해 주는 마지막 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Seo-yeon gets lost in her school's hallway.",
      "ko": "서연이가 학교 복도에서 길을 잃는다."
     },
     {
      "en": "The owl steals Seo-yeon's pencil.",
      "ko": "부엉이가 서연이의 연필을 훔친다."
     },
     {
      "en": "Seo-yeon finds a magic library and saves it by writing a story.",
      "ko": "서연이가 마법 도서관을 발견하고 이야기를 써서 도서관을 구한다."
     },
     {
      "en": "The teachers lock the blue door forever.",
      "ko": "선생님들이 파란 문을 영원히 잠근다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "Seo-yeon finds a fading library and saves it by writing an ending.",
     "ko": "서연이가 사라지는 도서관을 발견하고 결말을 써서 구하는 이야기예요."
    }
   },
   "words": [
    {
     "en": "hallway",
     "ko": "복도"
    },
    {
     "en": "library",
     "ko": "도서관"
    },
    {
     "en": "ending",
     "ko": "결말"
    }
   ],
   "summary": {
    "ko": "서연이는 이야기를 끝맺어서 마법 도서관을 구했다.",
    "en": "Seo-yeon saved a magic library by finishing a story.",
    "keywords": [
     "saved",
     "library",
     "story"
    ]
   }
  },
  {
   "stage": 2,
   "id": "s2-48",
   "genre": "story",
   "title": {
    "en": "The Day the Aliens Came",
    "ko": "외계인이 온 날"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "The Voyager spacecraft, launched in 1977, carries a golden record of music and sounds from Earth for aliens to find.",
    "ko": "1977년에 발사된 보이저호에는 외계인에게 들려줄 지구의 음악과 소리를 담은 황금 레코드가 실려 있어요."
   },
   "sentences": [
    {
     "en": "On the last day of the school year, a silver spaceship landed on the playground.",
     "ko": "학년 마지막 날, 은색 우주선이 운동장에 내려앉았다."
    },
    {
     "en": "Three tall, glowing aliens stepped out.",
     "ko": "빛나는 키 큰 외계인 셋이 걸어 나왔다."
    },
    {
     "en": "The teachers froze, and the principal hid.",
     "ko": "선생님들은 얼어붙었고, 교장 선생님은 숨었다."
    },
    {
     "en": "The aliens made strange sounds, but nobody could understand them.",
     "ko": "외계인들은 이상한 소리를 냈지만, 아무도 알아들을 수 없었다."
    },
    {
     "en": "Then their ship began to flash red, and the ground started to shake.",
     "ko": "그때 우주선이 빨갛게 번쩍이고 땅이 흔들리기 시작했다."
    },
    {
     "en": "\"They are getting angry!\" someone shouted.",
     "ko": "\"외계인들이 화가 났어!\" 누군가 외쳤다."
    },
    {
     "en": "But Dami, a quiet girl in Class 5, took out her recorder and played a simple song.",
     "ko": "하지만 5반의 조용한 아이 다미가 리코더를 꺼내 간단한 노래를 연주했다."
    },
    {
     "en": "The aliens went quiet, then hummed the same song back!",
     "ko": "외계인들은 조용해지더니 같은 노래를 흥얼거리며 따라 했다!"
    },
    {
     "en": "Other kids drew the sun, the Earth, and a smiling face with chalk.",
     "ko": "다른 아이들은 분필로 해, 지구, 그리고 웃는 얼굴을 그렸다."
    },
    {
     "en": "The aliens drew their own planet with three moons.",
     "ko": "외계인들도 달이 세 개인 자기들의 행성을 그렸다."
    },
    {
     "en": "Their ship turned soft blue, and everyone cheered.",
     "ko": "우주선이 부드러운 파란색으로 바뀌었고, 모두가 환호했다."
    },
    {
     "en": "Before leaving, they gave the school a glowing stone that hums Dami's song.",
     "ko": "떠나기 전에 외계인들은 학교에 다미의 노래를 흥얼거리는 빛나는 돌을 선물했다."
    },
    {
     "en": "Music and pictures can speak when words cannot.",
     "ko": "말이 통하지 않을 때도 음악과 그림은 마음을 전할 수 있다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence states the message: music and pictures can speak when words cannot.",
    "ko": "말이 통하지 않을 때 음악과 그림이 마음을 전한다는 메시지를 말하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "The aliens take the principal to their planet.",
      "ko": "외계인들이 교장 선생님을 자기 행성으로 데려간다."
     },
     {
      "en": "Kids make friends with aliens by using music and drawings.",
      "ko": "아이들이 음악과 그림으로 외계인과 친구가 된다."
     },
     {
      "en": "Dami learns to speak the alien language.",
      "ko": "다미가 외계인 말을 배운다."
     },
     {
      "en": "The school year ends with a big storm.",
      "ko": "학년이 큰 폭풍과 함께 끝난다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The kids calm the aliens and make friends using a song and chalk drawings.",
     "ko": "아이들이 노래와 분필 그림으로 외계인을 달래고 친구가 되는 이야기예요."
    }
   },
   "words": [
    {
     "en": "spaceship",
     "ko": "우주선"
    },
    {
     "en": "aliens",
     "ko": "외계인들"
    },
    {
     "en": "planet",
     "ko": "행성"
    }
   ],
   "summary": {
    "ko": "아이들은 음악과 그림으로 외계인과 이야기하고 친구가 되었다.",
    "en": "The kids talked to the aliens with music and pictures and became friends.",
    "keywords": [
     "aliens",
     "music",
     "friends"
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
   "stage": 3,
   "id": "s3-13",
   "genre": "info",
   "title": {
    "en": "How a Fishing Net Became a Book",
    "ko": "고기잡이 그물이 책이 되기까지"
   },
   "topic": {
    "en": "History",
    "ko": "역사"
   },
   "bg": {
    "en": "One of the world's oldest woodblock prints was found in a pagoda at Korea's Bulguksa Temple, printed on paper more than 1,200 years old.",
    "ko": "세계에서 가장 오래된 목판 인쇄물 중 하나인 무구정광대다라니경은 불국사 석가탑에서 발견됐고, 1,200년도 더 된 종이에 인쇄돼 있어요."
   },
   "sentences": [
    {
     "en": "About 1,900 years ago, a Chinese official named Cai Lun had a problem.",
     "ko": "약 1,900년 전, 채륜이라는 중국 관리에게 고민이 있었다."
    },
    {
     "en": "The emperor's records were written on heavy bamboo strips or on silk, which was very expensive.",
     "ko": "황제의 기록은 무거운 대나무 조각이나 아주 비싼 비단에 쓰여 있었다."
    },
    {
     "en": "A single long book could fill a whole cart!",
     "ko": "긴 책 한 권이 수레 하나를 가득 채울 정도였다!"
    },
    {
     "en": "Cai Lun wanted something light and cheap.",
     "ko": "채륜은 가볍고 값싼 재료를 원했다."
    },
    {
     "en": "Around the year 105, he improved a clever method.",
     "ko": "105년 무렵, 그는 영리한 방법을 개선했다."
    },
    {
     "en": "He mashed tree bark, old cloth, and even worn-out fishing nets in water.",
     "ko": "그는 나무껍질, 낡은 천, 심지어 다 해진 고기잡이 그물까지 물에 넣어 찧었다."
    },
    {
     "en": "Then he spread the mixture thin, pressed it flat, and let it dry in the sun.",
     "ko": "그런 다음 그 반죽을 얇게 펴서 납작하게 누르고 햇볕에 말렸다."
    },
    {
     "en": "The result was paper that was light, smooth, and easy to write on.",
     "ko": "그 결과 가볍고 매끄러워서 글씨 쓰기 쉬운 종이가 만들어졌다."
    },
    {
     "en": "Here is the surprise: for over a thousand years after that, most paper was not made from wood at all.",
     "ko": "놀라운 점은, 그 뒤 천 년이 넘도록 대부분의 종이는 나무로 만들지 않았다는 것이다."
    },
    {
     "en": "People used rags and plants, and Koreans made strong hanji from mulberry bark.",
     "ko": "사람들은 헌 천과 식물을 썼고, 한국 사람들은 닥나무 껍질로 튼튼한 한지를 만들었다."
    },
    {
     "en": "Paper made from wood became common only in the 1800s.",
     "ko": "나무로 만든 종이는 1800년대가 되어서야 흔해졌다."
    },
    {
     "en": "Paper slowly traveled from China to Korea, Japan, the Middle East, and Europe, and books became cheap enough for ordinary people.",
     "ko": "종이는 중국에서 한국, 일본, 중동, 유럽으로 천천히 퍼졌고, 책은 보통 사람도 살 수 있을 만큼 싸졌다."
    },
    {
     "en": "Cai Lun's simple invention helped knowledge spread to the whole world.",
     "ko": "채륜의 단순한 발명은 지식이 온 세상에 퍼지도록 도왔다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This last sentence sums up why Cai Lun's invention mattered to the whole world.",
    "ko": "마지막 문장이 채륜의 발명이 왜 온 세상에 중요했는지 한마디로 정리해요."
   },
   "main": {
    "options": [
     {
      "en": "Cai Lun invented the first printing machine.",
      "ko": "채륜이 최초의 인쇄기를 발명했다."
     },
     {
      "en": "Paper has always been made from wood.",
      "ko": "종이는 언제나 나무로 만들었다."
     },
     {
      "en": "Cai Lun improved papermaking, and paper spread around the world and helped knowledge spread.",
      "ko": "채륜이 종이 만드는 법을 개선했고, 종이는 전 세계로 퍼져 지식이 퍼지도록 도왔다."
     },
     {
      "en": "Bamboo strips were lighter and cheaper than paper.",
      "ko": "대나무 조각이 종이보다 더 가볍고 쌌다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text tells how Cai Lun improved paper and how paper then spread knowledge everywhere.",
     "ko": "채륜이 종이를 개선했고, 그 종이가 지식을 온 세상에 퍼뜨렸다는 내용이에요."
    }
   },
   "words": [
    {
     "en": "expensive",
     "ko": "비싼"
    },
    {
     "en": "method",
     "ko": "방법"
    },
    {
     "en": "ordinary",
     "ko": "보통의, 평범한"
    }
   ],
   "summary": {
    "ko": "채륜의 종이는 전 세계로 퍼져 사람들이 지식을 나누도록 도왔다.",
    "en": "Cai Lun's paper spread around the world and helped people share knowledge.",
    "keywords": [
     "paper",
     "knowledge",
     "world"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-14",
   "genre": "info",
   "title": {
    "en": "Can You Buy a Snack with a Chicken?",
    "ko": "닭으로 과자를 살 수 있을까?"
   },
   "topic": {
    "en": "Economy",
    "ko": "경제"
   },
   "bg": {
    "en": "Shin Saimdang is on Korea's 50,000-won bill, and her son Yi I is on the 5,000-won bill, so a mother and son are both on money.",
    "ko": "한국 5만 원권에는 신사임당이, 5천 원권에는 그 아들 율곡 이이가 그려져 있어서 어머니와 아들이 함께 지폐에 실렸어요."
   },
   "sentences": [
    {
     "en": "Imagine walking into a store and trying to pay for a snack with a live chicken.",
     "ko": "가게에 들어가서 살아 있는 닭으로 과자값을 치르려고 한다고 상상해 보자."
    },
    {
     "en": "The clerk would probably laugh, but long ago, this was how people shopped.",
     "ko": "점원은 아마 웃겠지만, 먼 옛날에는 이렇게 물건을 샀다."
    },
    {
     "en": "Before money existed, people traded things they had for things they needed.",
     "ko": "돈이 없던 시절, 사람들은 가진 물건을 필요한 물건과 바꿨다."
    },
    {
     "en": "This is called bartering, and it caused a big problem.",
     "ko": "이것을 물물 교환이라고 하는데, 큰 문제가 있었다."
    },
    {
     "en": "What if the snack seller did not want a chicken?",
     "ko": "과자 파는 사람이 닭을 원하지 않으면 어떻게 할까?"
    },
    {
     "en": "To solve this, people began using objects that everyone agreed were valuable.",
     "ko": "이 문제를 풀려고 사람들은 모두가 가치 있다고 인정하는 물건을 쓰기 시작했다."
    },
    {
     "en": "In parts of Africa and Asia, small shells called cowries became money.",
     "ko": "아프리카와 아시아 일부 지역에서는 개오지라는 작은 조개껍데기가 돈이 됐다."
    },
    {
     "en": "About 2,600 years ago, some of the first metal coins appeared in a kingdom in what is now Turkey, and China later became one of the first places to use paper money.",
     "ko": "약 2,600년 전 지금의 튀르키예 땅에 있던 한 왕국에서 최초의 금속 동전 중 일부가 나타났고, 그 뒤 중국은 지폐를 쓴 최초의 나라 중 하나가 됐다."
    },
    {
     "en": "Today comes the biggest twist.",
     "ko": "그리고 오늘날, 가장 큰 반전이 있다."
    },
    {
     "en": "Most money is no longer shells, coins, or paper, but just numbers stored on bank computers.",
     "ko": "대부분의 돈은 이제 조개껍데기도, 동전도, 종이도 아닌, 은행 컴퓨터에 저장된 숫자일 뿐이다."
    },
    {
     "en": "A number on a screen has no value by itself.",
     "ko": "화면 속 숫자는 그 자체로는 아무 가치가 없다."
    },
    {
     "en": "It works only because millions of people trust that others will accept it.",
     "ko": "수많은 사람이 다른 사람도 받아 줄 거라고 믿기 때문에 작동하는 것이다."
    },
    {
     "en": "From chickens to phone payments, money has always been built on one thing: trust.",
     "ko": "닭에서 휴대폰 결제까지, 돈은 언제나 한 가지 위에 세워져 왔다. 바로 믿음이다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The last sentence connects every kind of money in the text to one idea: trust.",
    "ko": "마지막 문장이 글에 나온 모든 돈을 \"믿음\"이라는 한 생각으로 묶어요."
   },
   "main": {
    "options": [
     {
      "en": "Chickens were the first coins in the world.",
      "ko": "닭이 세계 최초의 동전이었다."
     },
     {
      "en": "Paper money is more valuable than coins because it is lighter.",
      "ko": "지폐는 더 가벼워서 동전보다 가치가 높다."
     },
     {
      "en": "People today do not use money anymore.",
      "ko": "오늘날 사람들은 더 이상 돈을 쓰지 않는다."
     },
     {
      "en": "Money changed from trading to shells, coins, paper, and numbers, and it works because people trust it.",
      "ko": "돈은 물물 교환에서 조개껍데기, 동전, 지폐, 숫자로 바뀌었고, 사람들이 믿기 때문에 쓰인다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text follows money from bartering to numbers and explains that it works because of trust.",
     "ko": "물물 교환에서 숫자까지 돈의 변화를 따라가며, 믿음 때문에 돈이 쓰인다고 설명해요."
    }
   },
   "words": [
    {
     "en": "traded",
     "ko": "교환했다"
    },
    {
     "en": "valuable",
     "ko": "가치 있는"
    },
    {
     "en": "trust",
     "ko": "믿음; 믿다"
    }
   ],
   "summary": {
    "ko": "돈은 여러 번 바뀌었지만 언제나 믿음 덕분에 쓰인다.",
    "en": "Money has changed many times, but it always works because of trust.",
    "keywords": [
     "money",
     "changed",
     "trust"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-15",
   "genre": "info",
   "title": {
    "en": "Surviving the Driest Places on Earth",
    "ko": "지구에서 가장 메마른 곳에서 살아남기"
   },
   "topic": {
    "en": "Nature",
    "ko": "자연"
   },
   "bg": {
    "en": "Chile's Atacama Desert is one of the driest places on Earth.",
    "ko": "칠레의 아타카마 사막은 지구에서 가장 건조한 곳 중 하나예요."
   },
   "sentences": [
    {
     "en": "Imagine your plane makes an emergency landing in the middle of the Sahara Desert.",
     "ko": "여러분이 탄 비행기가 사하라 사막 한가운데에 비상 착륙했다고 상상해 보자."
    },
    {
     "en": "The sun is burning, there is no shade, and you have only one bottle of water.",
     "ko": "해는 이글거리고, 그늘은 없고, 물은 한 병뿐이다."
    },
    {
     "en": "How could anything survive here?",
     "ko": "이런 곳에서 어떻게 살아남을 수 있을까?"
    },
    {
     "en": "Desert plants and animals have been solving this problem for thousands of years.",
     "ko": "사막의 동식물은 수천 년 동안 이 문제를 풀어 왔다."
    },
    {
     "en": "Cactuses store water in their thick stems, and their spines lose far less water than leaves.",
     "ko": "선인장은 두꺼운 줄기에 물을 저장하고, 가시는 잎보다 물을 훨씬 덜 잃는다."
    },
    {
     "en": "A camel's hump stores fat, not water, so it can travel for days without food.",
     "ko": "낙타의 혹에는 물이 아니라 지방이 들어 있어서 며칠 동안 먹지 않고도 다닐 수 있다."
    },
    {
     "en": "The tiny fennec fox has huge ears that let body heat escape.",
     "ko": "작은 사막여우는 커다란 귀로 몸의 열을 내보낸다."
    },
    {
     "en": "Many animals hide underground during the day and come out in the cool night, which is a smart lesson for you too.",
     "ko": "많은 동물이 낮에는 땅속에 숨어 있다가 시원한 밤에 나온다. 여러분도 배워야 할 똑똑한 방법이다."
    },
    {
     "en": "Now for the twist: a desert does not have to be hot!",
     "ko": "이제 반전이다. 사막이 꼭 더워야 하는 것은 아니다!"
    },
    {
     "en": "Scientists call any place with very little rain a desert, usually less than 250 millimeters a year.",
     "ko": "과학자들은 비가 아주 적게 오는 곳을 사막이라고 한다. 보통 1년에 250밀리미터도 안 온다."
    },
    {
     "en": "By that rule, the largest desert on Earth is the frozen continent of Antarctica.",
     "ko": "이 기준으로 보면 지구에서 가장 큰 사막은 얼어붙은 남극 대륙이다."
    },
    {
     "en": "Deserts cover about one third of Earth's land and are full of life that adapted in clever ways to survive.",
     "ko": "사막은 지구 땅의 약 3분의 1을 덮고 있고, 영리하게 적응해 살아남은 생명으로 가득하다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "The last sentence defines deserts and says they are full of life that adapted to survive.",
    "ko": "마지막 문장이 사막을 정리하고, 적응해 살아남은 생명으로 가득하다고 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Deserts are places with little rain, and their plants and animals have clever ways to survive.",
      "ko": "사막은 비가 적게 오는 곳이고, 그곳의 동식물은 살아남는 영리한 방법을 가지고 있다."
     },
     {
      "en": "Deserts are always hot and have no life at all.",
      "ko": "사막은 늘 덥고 생명이 전혀 없다."
     },
     {
      "en": "Camels store water in their humps.",
      "ko": "낙타는 혹에 물을 저장한다."
     },
     {
      "en": "People can easily live in the Sahara without water.",
      "ko": "사람은 사하라에서 물 없이도 쉽게 살 수 있다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains what a desert is and shows clever ways plants and animals survive there.",
     "ko": "사막이 무엇인지 설명하고, 동식물이 그곳에서 살아남는 영리한 방법을 보여 줘요."
    }
   },
   "words": [
    {
     "en": "survive",
     "ko": "살아남다"
    },
    {
     "en": "store",
     "ko": "저장하다"
    },
    {
     "en": "adapted",
     "ko": "적응했다"
    }
   ],
   "summary": {
    "ko": "사막의 동식물은 적은 물로 살아가도록 영리하게 적응한다.",
    "en": "Desert plants and animals adapt in clever ways to live with little water.",
    "keywords": [
     "desert",
     "adapt",
     "water"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-16",
   "genre": "info",
   "title": {
    "en": "The Doctor, the Milkmaid, and the Cow",
    "ko": "의사와 우유 짜는 소녀와 소"
   },
   "topic": {
    "en": "Science",
    "ko": "과학"
   },
   "bg": {
    "en": "In 1980, the World Health Organization announced that smallpox had been wiped out from the world.",
    "ko": "세계보건기구는 1980년에 천연두가 지구에서 완전히 사라졌다고 발표했어요."
   },
   "sentences": [
    {
     "en": "In the 1700s, a terrible disease called smallpox killed millions of people.",
     "ko": "1700년대에 천연두라는 무서운 병이 수많은 사람의 목숨을 앗아 갔다."
    },
    {
     "en": "In the English countryside, a doctor named Edward Jenner heard a strange story.",
     "ko": "영국 시골에서 에드워드 제너라는 의사가 이상한 이야기를 들었다."
    },
    {
     "en": "People said that milkmaids, the women who milked cows, rarely caught smallpox.",
     "ko": "사람들은 소젖을 짜는 여자들은 천연두에 잘 걸리지 않는다고 말했다."
    },
    {
     "en": "Many of them had already caught cowpox, a mild disease from cows.",
     "ko": "그들 중 많은 사람이 이미 소에게서 옮는 가벼운 병인 우두에 걸린 적이 있었다."
    },
    {
     "en": "Could one small disease protect people from a deadly one?",
     "ko": "가벼운 병 하나가 치명적인 병을 막아 줄 수 있을까?"
    },
    {
     "en": "In 1796, Jenner took material from a cowpox sore on a milkmaid's hand and put it into a small cut on a boy's arm.",
     "ko": "1796년, 제너는 우유 짜는 여자의 손에 난 우두 상처에서 고름을 조금 떼어 한 소년의 팔에 난 작은 상처에 넣었다."
    },
    {
     "en": "Later, the boy was exposed to smallpox, but he did not get sick.",
     "ko": "나중에 소년은 천연두에 노출됐지만 병에 걸리지 않았다."
    },
    {
     "en": "Jenner had made the first vaccine, and the word comes from vacca, the Latin word for cow!",
     "ko": "제너가 최초의 백신을 만든 것이다. 백신이라는 말은 라틴어로 소를 뜻하는 \"바카(vacca)\"에서 왔다!"
    },
    {
     "en": "Today we know why it worked.",
     "ko": "오늘날 우리는 그 원리를 안다."
    },
    {
     "en": "A vaccine lets our immune system practice fighting a harmless version of a germ and remember it, so the body can react quickly to the real germ.",
     "ko": "백신은 면역 체계가 해롭지 않은 병균으로 싸우는 연습을 하고 기억하게 해서, 진짜 병균에 빠르게 대응하도록 한다."
    },
    {
     "en": "Thanks to vaccines, smallpox was completely wiped out from the world.",
     "ko": "백신 덕분에 천연두는 세상에서 완전히 사라졌다."
    },
    {
     "en": "Vaccines train our bodies to fight germs before they can make us seriously ill.",
     "ko": "백신은 병균이 우리를 심하게 아프게 하기 전에 몸이 싸우도록 훈련시킨다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "This sentence explains what vaccines do, which is the main lesson of Jenner's story.",
    "ko": "이 문장이 백신이 하는 일을 설명해요. 제너 이야기가 전하는 핵심이에요."
   },
   "main": {
    "options": [
     {
      "en": "Milkmaids invented medicine to cure all diseases.",
      "ko": "우유 짜는 여자들이 모든 병을 고치는 약을 발명했다."
     },
     {
      "en": "Edward Jenner made the first vaccine, and vaccines train our bodies to fight germs.",
      "ko": "에드워드 제너가 최초의 백신을 만들었고, 백신은 우리 몸이 병균과 싸우도록 훈련시킨다."
     },
     {
      "en": "Cowpox is a deadly disease that killed millions of people.",
      "ko": "우두는 수많은 사람을 죽인 치명적인 병이다."
     },
     {
      "en": "Vaccines only protect cows, not people.",
      "ko": "백신은 사람이 아니라 소만 지켜 준다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text tells how Jenner made the first vaccine and explains how vaccines protect our bodies.",
     "ko": "제너가 최초의 백신을 만든 이야기와 백신이 몸을 지키는 원리를 설명해요."
    }
   },
   "words": [
    {
     "en": "disease",
     "ko": "병, 질병"
    },
    {
     "en": "protect",
     "ko": "보호하다"
    },
    {
     "en": "germ",
     "ko": "병균"
    }
   ],
   "summary": {
    "ko": "에드워드 제너는 천연두에서 사람들을 지키려고 최초의 백신을 만들었다.",
    "en": "Edward Jenner made the first vaccine to protect people from smallpox.",
    "keywords": [
     "jenner",
     "vaccine",
     "smallpox"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-17",
   "genre": "info",
   "title": {
    "en": "When the Whole World Lights Up",
    "ko": "온 세상이 빛나는 밤"
   },
   "topic": {
    "en": "Culture",
    "ko": "문화"
   },
   "bg": {
    "en": "Korea's Lotus Lantern Festival, Yeondeunghoe, was added to UNESCO's Intangible Cultural Heritage list in 2020.",
    "ko": "한국의 연등회는 2020년에 유네스코 인류무형문화유산으로 등재됐어요."
   },
   "sentences": [
    {
     "en": "Imagine standing on a street in Seoul on a warm spring night.",
     "ko": "따뜻한 봄밤, 서울의 한 거리에 서 있다고 상상해 보자."
    },
    {
     "en": "Suddenly, thousands of glowing lanterns float past you, shaped like lotus flowers, dragons, and elephants.",
     "ko": "갑자기 연꽃, 용, 코끼리 모양의 빛나는 등불 수천 개가 여러분 곁을 지나간다."
    },
    {
     "en": "This is Yeondeunghoe, the Lotus Lantern Festival held before Buddha's Birthday.",
     "ko": "이것은 부처님 오신 날을 앞두고 열리는 연등회다."
    },
    {
     "en": "But Korea is not the only place where people celebrate the night with light.",
     "ko": "하지만 빛으로 밤을 축하하는 곳은 한국만이 아니다."
    },
    {
     "en": "In India, families light rows of small clay oil lamps for Diwali.",
     "ko": "인도에서는 가족들이 디왈리를 맞아 작은 흙 기름 등잔을 줄지어 밝힌다."
    },
    {
     "en": "Jewish families light one more candle each night for the eight nights of Hanukkah.",
     "ko": "유대인 가족들은 하누카의 여덟 밤 동안 매일 밤 초를 하나씩 더 밝힌다."
    },
    {
     "en": "In Thailand, people float little baskets with candles on rivers during Loy Krathong.",
     "ko": "태국에서는 로이 끄라통 때 촛불을 얹은 작은 바구니를 강물에 띄운다."
    },
    {
     "en": "Why do so many different cultures love festivals of light?",
     "ko": "왜 이렇게 많은 문화가 빛의 축제를 사랑할까?"
    },
    {
     "en": "Here is a clue: many of these festivals happen in autumn or winter, when the nights are longest.",
     "ko": "힌트가 있다. 이런 축제 중 상당수는 밤이 가장 긴 가을이나 겨울에 열린다."
    },
    {
     "en": "For thousands of years, darkness meant cold, danger, and fear, while light meant warmth, safety, and hope.",
     "ko": "수천 년 동안 어둠은 추위, 위험, 두려움을 뜻했고, 빛은 따뜻함, 안전, 희망을 뜻했다."
    },
    {
     "en": "People in very different places came to the same idea without ever meeting each other.",
     "ko": "서로 만난 적도 없는 아주 다른 곳의 사람들이 같은 생각에 이르렀다."
    },
    {
     "en": "Although their customs are different, festivals of light all share one message: hope can shine even in the darkest times.",
     "ko": "풍습은 달라도 빛의 축제들은 모두 한 가지 메시지를 나눈다. 가장 어두운 때에도 희망은 빛날 수 있다는 것이다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "The last sentence states the message that all the festivals in the text share.",
    "ko": "마지막 문장이 글에 나온 모든 축제가 함께 나누는 메시지를 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Yeondeunghoe is the only festival of light in the world.",
      "ko": "연등회는 세계에서 유일한 빛의 축제다."
     },
     {
      "en": "People hold light festivals because they are afraid of fireworks.",
      "ko": "사람들은 불꽃놀이가 무서워서 빛 축제를 연다."
     },
     {
      "en": "Many cultures celebrate festivals of light, and they all share a message of hope.",
      "ko": "여러 문화가 빛의 축제를 기념하고, 모두 희망이라는 메시지를 나눈다."
     },
     {
      "en": "Light festivals always take place in the summer.",
      "ko": "빛 축제는 언제나 여름에 열린다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text describes light festivals in many cultures and explains their shared message of hope.",
     "ko": "여러 문화의 빛 축제를 소개하고, 그 축제들이 함께 나누는 희망의 메시지를 설명해요."
    }
   },
   "words": [
    {
     "en": "celebrate",
     "ko": "축하하다, 기념하다"
    },
    {
     "en": "customs",
     "ko": "풍습"
    },
    {
     "en": "darkness",
     "ko": "어둠"
    }
   ],
   "summary": {
    "ko": "세계의 빛 축제들은 희망이라는 메시지를 함께 나눈다.",
    "en": "Festivals of light around the world share a message of hope.",
    "keywords": [
     "festivals",
     "light",
     "hope"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-18",
   "genre": "info",
   "title": {
    "en": "Why Can't a Robot Fold Your T-Shirt?",
    "ko": "로봇은 왜 티셔츠를 못 갤까?"
   },
   "topic": {
    "en": "Technology",
    "ko": "기술"
   },
   "bg": {
    "en": "The word \"robot\" first appeared in a 1920 play by Czech writer Karel Capek, from a Czech word meaning \"forced labor.\"",
    "ko": "\"로봇\"이라는 말은 1920년 체코 작가 카렐 차페크의 희곡에서 처음 쓰였고, 체코어로 \"강제 노동\"을 뜻하는 말에서 왔어요."
   },
   "sentences": [
    {
     "en": "A robot can help build cars and explore the surface of Mars.",
     "ko": "로봇은 자동차 조립을 돕고 화성 표면을 탐사할 수도 있다."
    },
    {
     "en": "So why can it not fold your T-shirt?",
     "ko": "그런데 왜 여러분의 티셔츠는 못 갤까?"
    },
    {
     "en": "Robots are already part of many homes.",
     "ko": "로봇은 이미 많은 가정의 일부가 됐다."
    },
    {
     "en": "Robot vacuum cleaners became popular in the early 2000s, and many use sensors to map rooms and avoid stairs.",
     "ko": "로봇 청소기는 2000년대 초에 인기를 얻었고, 많은 제품이 센서로 방마다 지도를 그리고 계단을 피한다."
    },
    {
     "en": "Other robots mow lawns, clean windows, or keep elderly people company.",
     "ko": "다른 로봇은 잔디를 깎거나, 창문을 닦거나, 어르신의 말벗이 되어 준다."
    },
    {
     "en": "Yet engineers have discovered a strange puzzle.",
     "ko": "그런데 엔지니어들은 이상한 수수께끼를 발견했다."
    },
    {
     "en": "Jobs that are hard for people, such as solving huge math problems, can be easy for computers.",
     "ko": "거대한 수학 문제 풀기처럼 사람에게 어려운 일은 컴퓨터에게 쉬울 수 있다."
    },
    {
     "en": "Jobs that are easy for a child, like folding clothes or picking up messy toys, are very hard for robots.",
     "ko": "반대로 옷 개기나 어질러진 장난감 치우기처럼 어린이에게 쉬운 일은 로봇에게 아주 어렵다."
    },
    {
     "en": "Soft objects keep changing shape, so a robot cannot easily predict how to grab them.",
     "ko": "부드러운 물건은 모양이 계속 바뀌어서 로봇은 어떻게 잡아야 할지 쉽게 예측하지 못한다."
    },
    {
     "en": "Our hands and brains do this so naturally that we never notice how difficult it is.",
     "ko": "우리 손과 뇌는 이것을 아주 자연스럽게 해서, 얼마나 어려운 일인지 알아채지도 못한다."
    },
    {
     "en": "Engineers now let robots practice thousands of times, just like children learn.",
     "ko": "엔지니어들은 이제 아이들이 배우듯 로봇이 수천 번 연습하게 해서 가르치고 있다."
    },
    {
     "en": "One day, robots may cook, do laundry, and care for people, but we will also need to think about privacy and safety.",
     "ko": "언젠가 로봇이 요리하고, 빨래하고, 사람을 돌볼지도 모르지만, 우리는 사생활과 안전도 생각해야 한다."
    },
    {
     "en": "Home robots already help us, and as they learn the \"easy\" human skills, they will play a bigger role in our lives.",
     "ko": "가정용 로봇은 이미 우리를 돕고 있고, 사람에게 \"쉬운\" 기술을 배워 갈수록 우리 삶에서 더 큰 역할을 할 것이다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The last sentence sums up what home robots do now and where they are going.",
    "ko": "마지막 문장이 가정용 로봇이 지금 하는 일과 앞으로의 모습을 정리해요."
   },
   "main": {
    "options": [
     {
      "en": "Robots can already do every job in the house perfectly.",
      "ko": "로봇은 이미 집안일을 모두 완벽하게 할 수 있다."
     },
     {
      "en": "Robot vacuums are the only robots people use.",
      "ko": "사람들이 쓰는 로봇은 로봇 청소기뿐이다."
     },
     {
      "en": "Folding clothes is easy for robots but hard for children.",
      "ko": "옷 개기는 로봇에게 쉽고 어린이에게 어렵다."
     },
     {
      "en": "Home robots already help us, and although simple human tasks are hard for them, they will do more in the future.",
      "ko": "가정용 로봇은 이미 우리를 돕고 있고, 사람에게 쉬운 일이 로봇에게는 어렵지만 앞으로 더 많은 일을 할 것이다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text shows robots already help at home, explains why easy human tasks are hard for them, and says they will do more.",
     "ko": "로봇이 이미 집에서 돕고 있고, 사람에게 쉬운 일이 왜 어려운지, 앞으로 더 많은 일을 할 것임을 보여 줘요."
    }
   },
   "words": [
    {
     "en": "sensors",
     "ko": "센서, 감지기"
    },
    {
     "en": "predict",
     "ko": "예측하다"
    },
    {
     "en": "privacy",
     "ko": "사생활"
    }
   ],
   "summary": {
    "ko": "가정용 로봇은 지금도 우리를 돕고, 앞으로 더 많은 일을 배울 것이다.",
    "en": "Home robots help us today and will learn to do even more.",
    "keywords": [
     "robots",
     "help",
     "learn"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-19",
   "genre": "info",
   "title": {
    "en": "The Woman Who Solved the Butterfly Mystery",
    "ko": "나비의 비밀을 푼 여인"
   },
   "topic": {
    "en": "Biology",
    "ko": "생물"
   },
   "bg": {
    "en": "Butterflies taste with their feet, which have special taste sensors.",
    "ko": "나비는 발로 맛을 봐요. 발에 맛을 느끼는 감각 기관이 있거든요."
   },
   "sentences": [
    {
     "en": "About 350 years ago, many people believed that insects simply appeared out of mud or rotting food.",
     "ko": "약 350년 전, 많은 사람은 곤충이 진흙이나 썩은 음식에서 저절로 생겨난다고 믿었다."
    },
    {
     "en": "A young German artist named Maria Sibylla Merian did not believe it.",
     "ko": "독일의 젊은 화가 마리아 지빌라 메리안은 그 말을 믿지 않았다."
    },
    {
     "en": "She collected caterpillars, fed them leaves, and watched them carefully every day.",
     "ko": "메리안은 애벌레를 모아 잎을 먹이며 날마다 꼼꼼히 관찰했다."
    },
    {
     "en": "What she discovered was amazing.",
     "ko": "메리안이 발견한 것은 놀라웠다."
    },
    {
     "en": "A butterfly's life has four stages: egg, caterpillar, pupa, and adult.",
     "ko": "나비의 한살이는 알, 애벌레, 번데기, 어른벌레의 네 단계다."
    },
    {
     "en": "A female lays tiny eggs on a plant that her young can eat.",
     "ko": "암컷은 새끼가 먹을 수 있는 식물에 아주 작은 알을 낳는다."
    },
    {
     "en": "The caterpillar that hatches eats almost nonstop and sheds its skin several times as it grows.",
     "ko": "알에서 나온 애벌레는 거의 쉬지 않고 먹으며, 자라면서 여러 번 허물을 벗는다."
    },
    {
     "en": "Then it forms a hard case around itself, which is called a chrysalis.",
     "ko": "그런 다음 몸 주위에 단단한 껍질을 만드는데, 이것을 번데기라고 한다."
    },
    {
     "en": "From the outside, the chrysalis looks quiet, as if nothing is happening.",
     "ko": "밖에서 보면 번데기는 아무 일도 없는 듯 조용해 보인다."
    },
    {
     "en": "Inside, however, the caterpillar's body breaks down and is rebuilt into wings, legs, and new eyes.",
     "ko": "하지만 그 안에서는 애벌레의 몸이 분해되어 날개와 다리, 새로운 눈으로 다시 만들어진다."
    },
    {
     "en": "This complete change is called metamorphosis.",
     "ko": "이렇게 완전히 모습이 바뀌는 것을 탈바꿈(변태)이라고 한다."
    },
    {
     "en": "Merian painted every stage in beautiful detail and published her findings in books.",
     "ko": "메리안은 모든 단계를 아름답고 자세하게 그려서 책으로 펴냈다."
    },
    {
     "en": "At the age of 52, she even sailed to South America to study insects there.",
     "ko": "52살에는 곤충을 연구하려고 남아메리카까지 배를 타고 가기도 했다."
    },
    {
     "en": "Her careful observation helped prove that every butterfly grows through a series of amazing changes, not out of mud.",
     "ko": "메리안의 꼼꼼한 관찰 덕분에 나비는 진흙에서 생기는 것이 아니라 놀라운 변화를 차례로 거치며 자란다는 사실이 밝혀졌다."
    }
   ],
   "key": 13,
   "keyWhy": {
    "en": "The last sentence states what Merian's careful work proved about butterflies.",
    "ko": "마지막 문장이 메리안의 꼼꼼한 관찰이 나비에 대해 밝혀낸 사실을 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Insects grow out of mud and rotting food.",
      "ko": "곤충은 진흙과 썩은 음식에서 생겨난다."
     },
     {
      "en": "Maria Merian showed that butterflies grow through four stages of amazing change.",
      "ko": "마리아 메리안은 나비가 놀라운 네 단계의 변화를 거쳐 자란다는 것을 보여 주었다."
     },
     {
      "en": "Caterpillars and butterflies are two different kinds of animals.",
      "ko": "애벌레와 나비는 서로 다른 종류의 동물이다."
     },
     {
      "en": "Merian only painted flowers and never studied insects.",
      "ko": "메리안은 꽃만 그렸고 곤충은 연구하지 않았다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text tells how Merian observed caterpillars and showed the four stages of a butterfly's life.",
     "ko": "메리안이 애벌레를 관찰해 나비 한살이의 네 단계를 보여 준 이야기예요."
    }
   },
   "words": [
    {
     "en": "observation",
     "ko": "관찰"
    },
    {
     "en": "caterpillar",
     "ko": "애벌레"
    },
    {
     "en": "stages",
     "ko": "단계"
    }
   ],
   "summary": {
    "ko": "마리아 메리안은 나비가 네 단계를 거치며 모습이 바뀐다는 것을 발견했다.",
    "en": "Maria Merian discovered that butterflies change through four stages.",
    "keywords": [
     "butterflies",
     "four",
     "stages"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-20",
   "genre": "info",
   "title": {
    "en": "Water, Water Everywhere",
    "ko": "사방이 물인데"
   },
   "topic": {
    "en": "Earth",
    "ko": "지구"
   },
   "bg": {
    "en": "The Dead Sea is so salty that people can float on it easily.",
    "ko": "사해는 너무 짜서 사람이 힘들이지 않고도 물에 둥둥 뜰 수 있어요."
   },
   "sentences": [
    {
     "en": "Imagine you are lost at sea on a small raft under the hot sun.",
     "ko": "뜨거운 햇볕 아래, 작은 뗏목을 타고 바다에서 길을 잃었다고 상상해 보자."
    },
    {
     "en": "You are thirsty, and you are surrounded by water.",
     "ko": "목이 몹시 마른데, 사방이 온통 물이다."
    },
    {
     "en": "But you must not drink it.",
     "ko": "하지만 그 물을 마시면 안 된다."
    },
    {
     "en": "Seawater is so salty that your body would need even more water to get rid of the salt, so you would become thirstier.",
     "ko": "바닷물은 너무 짜서 몸이 소금을 내보내려면 오히려 물이 더 필요하다. 그래서 목이 더 마르게 된다."
    },
    {
     "en": "So where does all that salt come from?",
     "ko": "그렇다면 그 많은 소금은 어디에서 왔을까?"
    },
    {
     "en": "Much of it comes from rocks on land.",
     "ko": "그 대부분은 육지의 암석에서 온다."
    },
    {
     "en": "Rainwater is slightly acidic, so it slowly breaks down rocks and picks up tiny bits of minerals.",
     "ko": "빗물은 약한 산성이라서 암석을 조금씩 녹이고 아주 작은 광물 알갱이를 품는다."
    },
    {
     "en": "Rivers carry these minerals, including salt, all the way to the sea.",
     "ko": "강은 소금을 포함한 이 광물들을 바다까지 실어 나른다."
    },
    {
     "en": "Here is the puzzle: if rivers carry salt, why don't they taste salty?",
     "ko": "여기서 수수께끼가 생긴다. 강이 소금을 나른다면, 왜 강물은 짜지 않을까?"
    },
    {
     "en": "The answer is that river water holds only a tiny amount of salt and keeps flowing.",
     "ko": "강물에는 소금이 아주 조금만 들어 있고 계속 흘러가기 때문이다."
    },
    {
     "en": "In the ocean, the sun heats the water until it evaporates, or turns into gas, but the salt stays behind.",
     "ko": "바다에서는 햇볕이 물을 데워 증발시킨다. 물은 기체가 되어 날아가지만 소금은 남는다."
    },
    {
     "en": "After millions of years, the salt has built up until about 3.5 percent of seawater's weight is salt.",
     "ko": "수백만 년 동안 소금이 쌓이고 쌓여, 지금은 바닷물 무게의 약 3.5%가 소금이다."
    },
    {
     "en": "So the ocean is salty because rivers keep bringing salt in, but only water leaves.",
     "ko": "결국 강이 계속 소금을 실어 오지만 바다를 떠나는 것은 물뿐이라서 바다가 짠 것이다."
    },
    {
     "en": "That is why sailors carry fresh water on long trips.",
     "ko": "그래서 뱃사람들은 오랜 항해를 떠날 때 언제나 마실 물을 챙겨 간다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence gives the full answer to the question of why the ocean is salty.",
    "ko": "이 문장이 \"바다는 왜 짤까?\"라는 질문에 대한 답을 한 번에 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Seawater is safe to drink when you are thirsty.",
      "ko": "목이 마를 때 바닷물을 마셔도 안전하다."
     },
     {
      "en": "Rivers are saltier than the ocean.",
      "ko": "강이 바다보다 더 짜다."
     },
     {
      "en": "The ocean is salty because salt from rocks stays behind when water evaporates.",
      "ko": "물이 증발할 때 암석에서 온 소금이 남기 때문에 바다는 짜다."
     },
     {
      "en": "Fish make the salt in the ocean.",
      "ko": "물고기가 바다의 소금을 만든다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text explains that rivers bring salt from rocks, and only water leaves the ocean when it evaporates.",
     "ko": "강이 암석의 소금을 실어 오고, 증발할 때 물만 떠나서 바다가 짜다고 설명해요."
    }
   },
   "words": [
    {
     "en": "minerals",
     "ko": "광물"
    },
    {
     "en": "evaporates",
     "ko": "증발하다"
    },
    {
     "en": "rocks",
     "ko": "암석, 바위"
    }
   ],
   "summary": {
    "ko": "물이 증발할 때 암석에서 온 소금이 남기 때문에 바다는 짜다.",
    "en": "The ocean is salty because salt from rocks stays there when water evaporates.",
    "keywords": [
     "ocean",
     "salty",
     "evaporates"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-21",
   "genre": "info",
   "title": {
    "en": "The Doctor Who Followed the Blood",
    "ko": "피의 길을 따라간 의사"
   },
   "topic": {
    "en": "Health",
    "ko": "건강"
   },
   "bg": {
    "en": "Doctors listen to the heart with a stethoscope, which was invented in France in 1816.",
    "ko": "의사는 청진기로 심장 소리를 들어요. 청진기는 1816년 프랑스에서 발명됐어요."
   },
   "sentences": [
    {
     "en": "For more than a thousand years, doctors believed that the body made new blood every day and used it up like fuel.",
     "ko": "천 년이 넘도록 의사들은 몸이 날마다 새 피를 만들어 연료처럼 다 써 버린다고 믿었다."
    },
    {
     "en": "An English doctor named William Harvey thought this idea did not make sense.",
     "ko": "윌리엄 하비라는 영국 의사는 이 생각이 말이 안 된다고 여겼다."
    },
    {
     "en": "He calculated how much blood the heart pushes out with each beat.",
     "ko": "하비는 심장이 한 번 뛸 때마다 내보내는 피의 양을 계산했다."
    },
    {
     "en": "The amount was far too large for the body to make in a single day.",
     "ko": "그 양은 몸이 하루에 만들어 내기에는 너무 많았다."
    },
    {
     "en": "So where was all that blood going?",
     "ko": "그렇다면 그 많은 피는 어디로 가는 것일까?"
    },
    {
     "en": "In 1628, Harvey announced his answer: the same blood travels around the body again and again in a circle.",
     "ko": "1628년, 하비는 답을 발표했다. 같은 피가 몸속을 빙글빙글 계속 돈다는 것이다."
    },
    {
     "en": "The heart is the pump that makes this possible.",
     "ko": "이것을 가능하게 하는 펌프가 바로 심장이다."
    },
    {
     "en": "It is a muscle about the size of your fist, and it has four chambers.",
     "ko": "심장은 주먹만 한 근육이고, 네 개의 방이 있다."
    },
    {
     "en": "The right side sends blood to the lungs to pick up oxygen.",
     "ko": "오른쪽은 산소를 얻도록 피를 폐로 보낸다."
    },
    {
     "en": "The left side then pumps that oxygen-rich blood to the rest of the body.",
     "ko": "그러면 왼쪽이 산소가 풍부한 피를 몸 구석구석으로 보낸다."
    },
    {
     "en": "Small doors called valves keep the blood moving one way, and their closing makes the \"thump\" sound.",
     "ko": "판막이라는 작은 문이 피를 한 방향으로만 흐르게 하는데, 판막이 닫힐 때 \"쿵\" 소리가 난다."
    },
    {
     "en": "Your heart beats about 100,000 times a day without ever taking a break.",
     "ko": "심장은 한 번도 쉬지 않고 하루에 약 10만 번 뛴다."
    },
    {
     "en": "Thanks to Harvey, we know the heart is a tireless pump that sends the same blood on an endless journey.",
     "ko": "하비 덕분에 우리는 심장이 같은 피를 끝없이 여행시키는 지칠 줄 모르는 펌프라는 것을 알게 됐다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The last sentence sums up Harvey's discovery about the heart and blood.",
    "ko": "마지막 문장이 심장과 피에 대한 하비의 발견을 정리해요."
   },
   "main": {
    "options": [
     {
      "en": "The body makes new blood every day and uses it all up.",
      "ko": "몸은 날마다 새 피를 만들어 모두 써 버린다."
     },
     {
      "en": "The heart rests at night while we sleep.",
      "ko": "심장은 우리가 자는 밤에 쉰다."
     },
     {
      "en": "Blood flows in both directions through the valves.",
      "ko": "피는 판막을 지나 양쪽 방향으로 흐른다."
     },
     {
      "en": "William Harvey discovered that the heart pumps the same blood around the body in a circle.",
      "ko": "윌리엄 하비는 심장이 같은 피를 몸속에서 빙글빙글 돌게 한다는 것을 발견했다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text shows how Harvey proved that the heart pumps the same blood around the body in a circle.",
     "ko": "하비가 심장이 같은 피를 몸속에서 돌게 한다는 것을 밝혀낸 과정을 보여 줘요."
    }
   },
   "words": [
    {
     "en": "calculated",
     "ko": "계산했다"
    },
    {
     "en": "muscle",
     "ko": "근육"
    },
    {
     "en": "oxygen",
     "ko": "산소"
    }
   ],
   "summary": {
    "ko": "윌리엄 하비는 심장이 피를 몸속에서 빙글빙글 돌게 한다는 것을 알아냈다.",
    "en": "William Harvey found that the heart pumps blood around the body in a circle.",
    "keywords": [
     "heart",
     "blood",
     "circle"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-22",
   "genre": "info",
   "title": {
    "en": "The Wall That Took 2,000 Years",
    "ko": "2,000년 동안 쌓은 성벽"
   },
   "topic": {
    "en": "History",
    "ko": "역사"
   },
   "bg": {
    "en": "In Chinese, the Great Wall is called \"Changcheng,\" which means \"long wall.\"",
    "ko": "중국어로 만리장성은 \"창청(長城)\"이라고 하는데, \"긴 성벽\"이라는 뜻이에요."
   },
   "sentences": [
    {
     "en": "Imagine you are a soldier standing on a stone tower high in the mountains of northern China.",
     "ko": "중국 북쪽 높은 산 위의 돌 망루에 서 있는 병사라고 상상해 보자."
    },
    {
     "en": "Suddenly, you see a column of smoke rising from the next tower.",
     "ko": "갑자기 옆 망루에서 연기 기둥이 피어오르는 것이 보인다."
    },
    {
     "en": "It is a warning: enemies are coming!",
     "ko": "적이 쳐들어온다는 신호다!"
    },
    {
     "en": "You quickly light a fire to pass the warning on.",
     "ko": "여러분도 재빨리 불을 피워 소식을 다음 망루로 전한다."
    },
    {
     "en": "For centuries, the Great Wall of China worked like this.",
     "ko": "수백 년 동안 만리장성은 이렇게 쓰였다."
    },
    {
     "en": "It is not one single wall but a long series of walls, towers, and forts.",
     "ko": "만리장성은 하나로 이어진 벽이 아니라 성벽과 망루, 요새가 길게 이어진 것이다."
    },
    {
     "en": "Different Chinese rulers built and rebuilt it over about 2,000 years to protect their land from attacks from the north.",
     "ko": "여러 중국 왕조가 약 2,000년에 걸쳐 북쪽의 침략으로부터 나라를 지키려고 쌓고 또 고쳐 쌓았다."
    },
    {
     "en": "Most of the wall visitors see today was built about 500 years ago, during the Ming Dynasty.",
     "ko": "오늘날 관광객이 보는 성벽은 대부분 약 500년 전 명나라 때 지어졌다."
    },
    {
     "en": "If you add up all its sections, it is more than 20,000 kilometers long.",
     "ko": "모든 구간을 합치면 길이가 2만 킬로미터가 넘는다."
    },
    {
     "en": "Because it is so long, many people believe it can be seen from space.",
     "ko": "이렇게 길다 보니 우주에서도 보인다고 믿는 사람이 많다."
    },
    {
     "en": "Surprisingly, that is a myth.",
     "ko": "놀랍게도 그것은 잘못 알려진 이야기다."
    },
    {
     "en": "The wall is narrow, and its color is similar to the land around it, so China's first astronaut said he could not see it.",
     "ko": "성벽은 폭이 좁고 색깔도 주변 땅과 비슷해서, 중국 최초의 우주 비행사도 보이지 않았다고 말했다."
    },
    {
     "en": "Today, millions of people visit this UNESCO World Heritage Site every year.",
     "ko": "오늘날 해마다 수백만 명이 이 유네스코 세계유산을 찾아온다."
    },
    {
     "en": "It shows how people worked together for many centuries to protect their country.",
     "ko": "만리장성은 사람들이 나라를 지키려고 수백 년 동안 힘을 모았다는 것을 보여 준다."
    }
   ],
   "key": 13,
   "keyWhy": {
    "en": "The last sentence explains what the Great Wall shows about people working together.",
    "ko": "마지막 문장이 만리장성이 보여 주는 의미, 곧 사람들이 힘을 모았다는 것을 말해요."
   },
   "main": {
    "options": [
     {
      "en": "The Great Wall can easily be seen from space.",
      "ko": "만리장성은 우주에서 쉽게 보인다."
     },
     {
      "en": "The Great Wall is a long system of walls built over centuries to protect China.",
      "ko": "만리장성은 중국을 지키려고 수백 년에 걸쳐 쌓은 긴 성벽들이다."
     },
     {
      "en": "The Great Wall was built in one year by one king.",
      "ko": "만리장성은 한 왕이 1년 만에 쌓았다."
     },
     {
      "en": "Soldiers on the wall used telephones to send warnings.",
      "ko": "성벽의 병사들은 전화로 위험을 알렸다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text explains that the Great Wall is a long system of walls built over centuries to protect China.",
     "ko": "만리장성이 중국을 지키려고 수백 년 동안 쌓은 긴 성벽들이라는 것을 설명해요."
    }
   },
   "words": [
    {
     "en": "warning",
     "ko": "경고"
    },
    {
     "en": "protect",
     "ko": "지키다, 보호하다"
    },
    {
     "en": "myth",
     "ko": "잘못된 믿음, 신화"
    }
   ],
   "summary": {
    "ko": "만리장성은 중국을 침략에서 지키려고 여러 세기에 걸쳐 지어졌다.",
    "en": "The Great Wall was built over many centuries to protect China from attacks.",
    "keywords": [
     "wall",
     "protect",
     "china"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-23",
   "genre": "info",
   "title": {
    "en": "The Phone That Changed Everything",
    "ko": "모든 것을 바꾼 휴대폰"
   },
   "topic": {
    "en": "Technology",
    "ko": "기술"
   },
   "bg": {
    "en": "The first telephone call was made by Alexander Graham Bell in 1876.",
    "ko": "최초의 전화 통화는 1876년 알렉산더 그레이엄 벨이 했어요."
   },
   "sentences": [
    {
     "en": "In January 2007, Steve Jobs walked onto a stage in San Francisco holding a small black device.",
     "ko": "2007년 1월, 스티브 잡스가 작고 까만 기계를 들고 샌프란시스코의 무대에 올랐다."
    },
    {
     "en": "It was a phone, a music player, and an internet computer, all in one.",
     "ko": "그것은 전화기이자 음악 플레이어이자 인터넷 컴퓨터였다."
    },
    {
     "en": "It had no keyboard, only a touch screen.",
     "ko": "자판은 없고 터치스크린만 있었다."
    },
    {
     "en": "Some experts doubted the idea, but the iPhone and other smartphones soon spread around the world.",
     "ko": "몇몇 전문가는 의심했지만, 아이폰과 다른 스마트폰은 곧 전 세계로 퍼졌다."
    },
    {
     "en": "They changed the way we live.",
     "ko": "스마트폰은 우리가 사는 방식을 바꿔 놓았다."
    },
    {
     "en": "We can video call friends on the other side of the world, pay for things, and find our way in a new city.",
     "ko": "지구 반대편 친구와 영상 통화를 하고, 물건값을 내고, 낯선 도시에서 길을 찾을 수 있다."
    },
    {
     "en": "Here is a surprising fact: a modern smartphone is millions of times more powerful than the computer that guided Apollo 11 to the Moon.",
     "ko": "놀라운 사실이 있다. 요즘 스마트폰은 아폴로 11호를 달로 이끈 컴퓨터보다 수백만 배나 성능이 좋다."
    },
    {
     "en": "However, all that power has brought new problems, too.",
     "ko": "하지만 그 엄청난 성능은 새로운 문제도 가져왔다."
    },
    {
     "en": "Many people check their phones dozens of times a day, even during meals with their families.",
     "ko": "많은 사람이 가족과 밥을 먹을 때조차 하루에 수십 번씩 휴대폰을 확인한다."
    },
    {
     "en": "Using a phone late at night can make it harder to fall asleep, because the bright screen keeps the brain alert.",
     "ko": "밤늦게 휴대폰을 쓰면 밝은 화면이 뇌를 깨어 있게 해서 잠들기가 더 어려워질 수 있다."
    },
    {
     "en": "Experts suggest simple habits, like turning off notifications and keeping phones out of the bedroom at night.",
     "ko": "전문가들은 알림을 끄고 밤에는 휴대폰을 침실 밖에 두는 것 같은 간단한 습관을 권한다."
    },
    {
     "en": "A smartphone is a powerful tool, but we should control it instead of letting it control us.",
     "ko": "스마트폰은 강력한 도구이지만, 스마트폰에 휘둘리지 말고 우리가 잘 다뤄야 한다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "The last sentence gives the main message: use the phone, but do not let it control you.",
    "ko": "마지막 문장이 \"휴대폰을 쓰되 휘둘리지 말자\"는 핵심 메시지를 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Smartphones changed our lives, so we need to use their power wisely.",
      "ko": "스마트폰은 우리 삶을 바꿔 놓았으니, 그 힘을 현명하게 써야 한다."
     },
     {
      "en": "Smartphones were invented more than 100 years ago.",
      "ko": "스마트폰은 100년도 더 전에 발명됐다."
     },
     {
      "en": "Apollo 11 was guided to the Moon by a smartphone.",
      "ko": "아폴로 11호는 스마트폰의 안내로 달에 갔다."
     },
     {
      "en": "Using a phone at night helps you sleep better.",
      "ko": "밤에 휴대폰을 쓰면 잠을 더 잘 잔다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text shows how smartphones changed our lives and why we must use them wisely.",
     "ko": "스마트폰이 삶을 어떻게 바꿨는지, 왜 현명하게 써야 하는지 보여 줘요."
    }
   },
   "words": [
    {
     "en": "device",
     "ko": "기기, 장치"
    },
    {
     "en": "powerful",
     "ko": "강력한"
    },
    {
     "en": "notifications",
     "ko": "알림"
    }
   ],
   "summary": {
    "ko": "스마트폰은 강력하지만, 건강하게 사용해야 한다.",
    "en": "Smartphones are powerful, but we should use them in healthy ways.",
    "keywords": [
     "smartphones",
     "powerful",
     "healthy"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-24",
   "genre": "info",
   "title": {
    "en": "The Wolves of Yellowstone",
    "ko": "옐로스톤의 늑대들"
   },
   "topic": {
    "en": "Nature",
    "ko": "자연"
   },
   "bg": {
    "en": "When many food chains are linked together, they form a food web.",
    "ko": "여러 먹이 사슬이 서로 얽혀 있는 것을 먹이 그물이라고 해요."
   },
   "sentences": [
    {
     "en": "In 1995, scientists released a small group of gray wolves into Yellowstone National Park in the United States.",
     "ko": "1995년, 과학자들은 미국 옐로스톤 국립공원에 회색늑대 몇 마리를 풀어 주었다."
    },
    {
     "en": "Wolves had disappeared from the park about 70 years earlier.",
     "ko": "늑대는 그보다 약 70년 전에 공원에서 사라졌다."
    },
    {
     "en": "Without them, the number of elk, a kind of large deer, had grown very large.",
     "ko": "늑대가 없는 동안 큰 사슴의 일종인 엘크의 수가 아주 많아졌다."
    },
    {
     "en": "The elk ate so many young trees near the rivers that the trees could hardly grow.",
     "ko": "엘크가 강가의 어린 나무를 너무 많이 먹어서 나무가 거의 자라지 못했다."
    },
    {
     "en": "To understand why this mattered, we need to know about food chains.",
     "ko": "이것이 왜 중요했는지 알려면 먹이 사슬을 알아야 한다."
    },
    {
     "en": "A food chain shows how energy passes from one living thing to another.",
     "ko": "먹이 사슬은 에너지가 한 생물에서 다른 생물로 어떻게 전달되는지 보여 준다."
    },
    {
     "en": "It usually starts with plants, called producers, which make their own food from sunlight.",
     "ko": "먹이 사슬은 보통 햇빛으로 스스로 양분을 만드는 생산자, 즉 식물에서 시작한다."
    },
    {
     "en": "Animals that eat plants or other animals are called consumers.",
     "ko": "식물이나 다른 동물을 먹는 동물은 소비자라고 부른다."
    },
    {
     "en": "In Yellowstone, one chain was simple: trees, then elk, then wolves.",
     "ko": "옐로스톤의 한 먹이 사슬은 간단했다. 나무, 엘크, 그리고 늑대다."
    },
    {
     "en": "When the wolves returned, something surprising happened.",
     "ko": "늑대가 돌아오자 놀라운 일이 일어났다."
    },
    {
     "en": "The elk began to move around more and avoid some open river areas, so trees there started to grow back.",
     "ko": "엘크가 더 자주 옮겨 다니고 탁 트인 강가를 피하기 시작하자, 그곳의 나무들이 다시 자라기 시작했다."
    },
    {
     "en": "Scientists believe this also helped birds and beavers, which use those trees for their homes.",
     "ko": "과학자들은 이 덕분에 그 나무에 집을 짓는 새와 비버도 도움을 받았다고 본다."
    },
    {
     "en": "Yellowstone shows that every living thing in a food chain depends on the others, even the ones at the top.",
     "ko": "옐로스톤은 먹이 사슬 속 모든 생물이, 꼭대기에 있는 동물까지도, 서로에게 기대어 산다는 것을 보여 준다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The last sentence states the lesson of the Yellowstone story about food chains.",
    "ko": "마지막 문장이 옐로스톤 이야기가 먹이 사슬에 대해 알려 주는 교훈을 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Wolves are harmful and should be removed from every park.",
      "ko": "늑대는 해로우니 모든 공원에서 없애야 한다."
     },
     {
      "en": "Bringing wolves back to Yellowstone showed how living things in a food chain depend on each other.",
      "ko": "옐로스톤에 늑대를 되돌려 놓자 먹이 사슬의 생물들이 서로 기대어 산다는 것이 드러났다."
     },
     {
      "en": "Elk hunt wolves in Yellowstone.",
      "ko": "옐로스톤에서는 엘크가 늑대를 사냥한다."
     },
     {
      "en": "Food chains always start with large animals.",
      "ko": "먹이 사슬은 언제나 큰 동물에서 시작한다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text uses the return of wolves to show how living things in a food chain depend on each other.",
     "ko": "늑대가 돌아온 일을 통해 먹이 사슬의 생물들이 서로 기대어 산다는 것을 보여 줘요."
    }
   },
   "words": [
    {
     "en": "released",
     "ko": "풀어 주었다"
    },
    {
     "en": "energy",
     "ko": "에너지"
    },
    {
     "en": "depends",
     "ko": "의지하다, 달려 있다"
    }
   ],
   "summary": {
    "ko": "늑대가 옐로스톤에 돌아오자 먹이 사슬 전체가 바뀌었다.",
    "en": "When wolves returned to Yellowstone, the whole food chain changed.",
    "keywords": [
     "wolves",
     "food",
     "chain"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-25",
   "genre": "info",
   "title": {
    "en": "Alarm on the Way to the Moon",
    "ko": "달에 내리기 직전의 경보"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Only 12 people have ever walked on the Moon.",
    "ko": "지금까지 달 위를 걸은 사람은 12명뿐이에요."
   },
   "sentences": [
    {
     "en": "\"Program alarm! It's a 1202!\" Neil Armstrong called out as his tiny spacecraft dropped toward the Moon.",
     "ko": "\"프로그램 경보! 1202야!\" 작은 우주선이 달을 향해 내려가는 동안 닐 암스트롱이 외쳤다."
    },
    {
     "en": "It was July 20, 1969, and nobody had ever landed on the Moon before.",
     "ko": "1969년 7월 20일이었고, 그때까지 달에 착륙한 사람은 아무도 없었다."
    },
    {
     "en": "Armstrong and Buzz Aldrin were inside the lunar module called the Eagle, while Michael Collins circled above in orbit.",
     "ko": "암스트롱과 버즈 올드린은 이글이라는 달 착륙선 안에 있었고, 마이클 콜린스는 위에서 궤도를 돌고 있었다."
    },
    {
     "en": "Their Apollo 11 mission had traveled about 384,000 kilometers from Earth.",
     "ko": "그들의 아폴로 11호는 지구에서 약 38만 4천 킬로미터를 날아왔다."
    },
    {
     "en": "Now the computer was overloaded and kept sounding alarms.",
     "ko": "그런데 컴퓨터에 일이 너무 몰려 계속 경보가 울렸다."
    },
    {
     "en": "In Houston, a young engineer quickly checked and said it was safe to continue.",
     "ko": "휴스턴에서는 한 젊은 기술자가 재빨리 확인하고 계속 가도 안전하다고 말했다."
    },
    {
     "en": "Then Armstrong saw another danger: the landing area was full of large rocks.",
     "ko": "그때 암스트롱은 또 다른 위험을 보았다. 착륙 지점이 큰 바위투성이였다."
    },
    {
     "en": "He took control by hand and flew over the rocks, searching for a flat spot as the fuel ran low.",
     "ko": "그는 직접 조종해서 바위 위를 날며 평평한 곳을 찾았고, 그사이 연료는 점점 줄어들었다."
    },
    {
     "en": "Finally, the Eagle touched down safely.",
     "ko": "마침내 이글이 무사히 착륙했다."
    },
    {
     "en": "\"The Eagle has landed,\" Armstrong reported, and people at Mission Control cheered.",
     "ko": "\"이글이 착륙했다.\" 암스트롱이 보고하자 관제 센터 사람들이 환호했다."
    },
    {
     "en": "Hours later, he stepped onto the surface and said, \"That's one small step for man, one giant leap for mankind.\"",
     "ko": "몇 시간 뒤, 그는 달 표면에 내려서며 \"이것은 한 사람에게는 작은 한 걸음이지만, 인류에게는 거대한 도약이다.\"라고 말했다."
    },
    {
     "en": "About 600 million people watched on television.",
     "ko": "약 6억 명이 텔레비전으로 그 모습을 지켜보았다."
    },
    {
     "en": "The Moon landing showed that, with teamwork and courage, humans can reach places that once seemed impossible.",
     "ko": "달 착륙은 협동과 용기가 있으면 인간이 불가능해 보였던 곳에도 갈 수 있다는 것을 보여 주었다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The last sentence explains what the whole Moon landing story teaches us.",
    "ko": "마지막 문장이 달 착륙 이야기 전체가 알려 주는 의미를 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Three astronauts walked on the Moon in 1969.",
      "ko": "1969년에 우주 비행사 세 명이 달 위를 걸었다."
     },
     {
      "en": "The landing was easy, and nothing went wrong.",
      "ko": "착륙은 쉬웠고 아무 문제도 없었다."
     },
     {
      "en": "Despite alarms and danger, Apollo 11 landed safely thanks to teamwork and courage.",
      "ko": "경보와 위험 속에서도 아폴로 11호는 협동과 용기 덕분에 무사히 착륙했다."
     },
     {
      "en": "Neil Armstrong landed on Mars.",
      "ko": "닐 암스트롱은 화성에 착륙했다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text shows that Apollo 11 faced alarms and danger but landed safely through teamwork and courage.",
     "ko": "아폴로 11호가 경보와 위험을 겪고도 협동과 용기로 무사히 착륙했다는 내용이에요."
    }
   },
   "words": [
    {
     "en": "alarms",
     "ko": "경보"
    },
    {
     "en": "danger",
     "ko": "위험"
    },
    {
     "en": "courage",
     "ko": "용기"
    }
   ],
   "summary": {
    "ko": "1969년, 아폴로 11호 우주 비행사들은 처음으로 달 위를 걸은 사람이 되었다.",
    "en": "In 1969, Apollo 11 astronauts became the first people to walk on the Moon.",
    "keywords": [
     "apollo",
     "moon",
     "walk"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-26",
   "genre": "info",
   "title": {
    "en": "The Girl Who Saved a Beach",
    "ko": "해변을 구한 소녀"
   },
   "topic": {
    "en": "Safety",
    "ko": "안전"
   },
   "bg": {
    "en": "Thousands of earthquakes happen around the world every day, but most are too small to feel.",
    "ko": "전 세계에서 매일 수천 번의 지진이 일어나지만, 대부분은 너무 약해서 느끼지 못해요."
   },
   "sentences": [
    {
     "en": "In December 2004, a ten-year-old British girl named Tilly Smith was on holiday at a beach in Thailand.",
     "ko": "2004년 12월, 열 살 영국 소녀 틸리 스미스는 태국의 한 해변에서 휴가를 보내고 있었다."
    },
    {
     "en": "Suddenly, she noticed something strange: the sea was pulling back, and the water was bubbling.",
     "ko": "갑자기 틸리는 이상한 것을 발견했다. 바닷물이 뒤로 빠지면서 거품이 일고 있었다."
    },
    {
     "en": "Many tourists walked out onto the wet sand to look.",
     "ko": "많은 관광객이 구경하려고 젖은 모래밭으로 걸어 나갔다."
    },
    {
     "en": "But Tilly remembered a geography lesson from school just two weeks earlier.",
     "ko": "하지만 틸리는 불과 2주 전 학교 지리 시간에 배운 내용을 떠올렸다."
    },
    {
     "en": "A huge earthquake under the sea can push up a giant wave called a tsunami, and the sea often pulls back just before it arrives.",
     "ko": "바닷속에서 큰 지진이 나면 쓰나미라는 거대한 파도가 생길 수 있는데, 쓰나미가 오기 직전에는 바닷물이 빠져나가는 경우가 많다."
    },
    {
     "en": "Tilly told her parents, and they warned everyone to leave the beach.",
     "ko": "틸리가 부모님께 알렸고, 부모님은 모두에게 해변을 떠나라고 경고했다."
    },
    {
     "en": "Minutes later, the tsunami crashed onto the shore, but about 100 people from that beach were already safe.",
     "ko": "몇 분 뒤 쓰나미가 해안을 덮쳤지만, 그 해변에 있던 약 100명은 이미 안전한 곳에 있었다."
    },
    {
     "en": "Her story shows that knowing what to do can save lives.",
     "ko": "틸리의 이야기는 대처 방법을 알면 목숨을 구할 수 있다는 것을 보여 준다."
    },
    {
     "en": "So what should you do if the ground starts shaking?",
     "ko": "그렇다면 땅이 흔들리기 시작하면 어떻게 해야 할까?"
    },
    {
     "en": "Remember three steps: drop to the floor, cover your head under a strong table, and hold on until the shaking stops.",
     "ko": "세 단계를 기억하자. 바닥에 엎드리고, 튼튼한 탁자 밑에서 머리를 가리고, 흔들림이 멈출 때까지 붙잡고 있는다."
    },
    {
     "en": "Afterward, use the stairs instead of the elevator, and move to an open space like a park.",
     "ko": "흔들림이 멈추면 엘리베이터 대신 계단을 이용해 공원 같은 넓은 곳으로 간다."
    },
    {
     "en": "Like Tilly, you can protect yourself and others by learning these steps before an emergency happens.",
     "ko": "틸리처럼, 위급한 일이 생기기 전에 이 방법을 익혀 두면 나와 다른 사람을 지킬 수 있다."
    }
   ],
   "key": 11,
   "keyWhy": {
    "en": "The last sentence gives the lesson: learn safety steps before an emergency, like Tilly did.",
    "ko": "마지막 문장이 \"틸리처럼 위급한 일 전에 대처법을 익히자\"는 교훈을 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Tourists should walk onto the sand when the sea pulls back.",
      "ko": "바닷물이 빠지면 관광객은 모래밭으로 걸어 나가야 한다."
     },
     {
      "en": "Scientists can always predict earthquakes and tsunamis.",
      "ko": "과학자들은 지진과 쓰나미를 언제나 예측할 수 있다."
     },
     {
      "en": "Tilly learned about tsunamis from a movie.",
      "ko": "틸리는 영화에서 쓰나미에 대해 배웠다."
     },
     {
      "en": "Knowing what to do in an earthquake or tsunami can save lives, as Tilly showed.",
      "ko": "틸리가 보여 주었듯, 지진이나 쓰나미 때 대처 방법을 알면 목숨을 구할 수 있다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text uses Tilly's story to show that knowing what to do in a disaster can save lives.",
     "ko": "틸리의 이야기로 재난 때 대처법을 알면 목숨을 구할 수 있다는 것을 보여 줘요."
    }
   },
   "words": [
    {
     "en": "earthquake",
     "ko": "지진"
    },
    {
     "en": "warned",
     "ko": "경고했다"
    },
    {
     "en": "emergency",
     "ko": "비상, 위급 상황"
    }
   ],
   "summary": {
    "ko": "틸리는 쓰나미의 경고 신호를 알고 있어서 많은 사람을 구했다.",
    "en": "Tilly saved many people because she knew the warning signs of a tsunami.",
    "keywords": [
     "tilly",
     "tsunami",
     "warning"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-27",
   "genre": "info",
   "title": {
    "en": "Are We Alone in the Universe?",
    "ko": "우주에 우리뿐일까?"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "The closest known exoplanet, Proxima b, is about 4.2 light-years away.",
    "ko": "지금까지 알려진 가장 가까운 외계 행성은 약 4.2광년 떨어진 프록시마 b예요."
   },
   "sentences": [
    {
     "en": "Imagine lying on the grass on a clear night and whispering, \"Is anyone out there?\"",
     "ko": "맑은 밤 풀밭에 누워 \"거기 누구 있어요?\" 하고 속삭인다고 상상해 보자."
    },
    {
     "en": "People have asked this question for thousands of years, and it is still a mystery.",
     "ko": "사람들은 수천 년 동안 이 질문을 해 왔고, 그 답은 아직도 수수께끼다."
    },
    {
     "en": "Today, scientists are trying to answer it with powerful tools.",
     "ko": "오늘날 과학자들은 강력한 도구로 이 질문에 답하려고 한다."
    },
    {
     "en": "Our galaxy, the Milky Way, has more than 100 billion stars.",
     "ko": "우리 은하에는 1,000억 개가 넘는 별이 있다."
    },
    {
     "en": "Many of these stars have planets that travel around them.",
     "ko": "이 별들 중 많은 별에는 그 주위를 도는 행성이 있다."
    },
    {
     "en": "Scientists have already found more than 5,000 of these distant planets, called exoplanets.",
     "ko": "과학자들은 이미 외계 행성이라고 부르는 먼 행성을 5,000개 넘게 찾아냈다."
    },
    {
     "en": "Some of them are in the \"habitable zone,\" where water could stay liquid.",
     "ko": "그중 일부는 물이 액체로 있을 수 있는 \"생명 가능 지대\"에 있다."
    },
    {
     "en": "Liquid water matters because every living thing on Earth needs it.",
     "ko": "액체 상태의 물이 중요한 이유는 지구의 모든 생물에게 물이 필요하기 때문이다."
    },
    {
     "en": "Scientists also use giant radio telescopes to listen for signals from other worlds.",
     "ko": "과학자들은 거대한 전파 망원경으로 다른 세계에서 오는 신호에도 귀를 기울인다."
    },
    {
     "en": "This search is called SETI, the Search for Extraterrestrial Intelligence.",
     "ko": "이 탐사를 SETI, 곧 외계 지적 생명체 탐사라고 부른다."
    },
    {
     "en": "So far, however, no one has found any clear proof of life beyond Earth.",
     "ko": "하지만 지금까지 지구 밖 생명에 대한 확실한 증거를 찾은 사람은 아무도 없다."
    },
    {
     "en": "Even so, the search is not a waste of time.",
     "ko": "그래도 이 탐사는 시간 낭비가 아니다."
    },
    {
     "en": "Each discovery teaches us more about how planets form and how life began here.",
     "ko": "새로운 발견마다 행성이 어떻게 생기고 지구에서 생명이 어떻게 시작됐는지 더 알게 되기 때문이다."
    },
    {
     "en": "We do not know yet whether we are alone, but scientists keep looking for the answer.",
     "ko": "우리가 우주에 혼자인지는 아직 모르지만, 과학자들은 계속 답을 찾고 있다."
    }
   ],
   "key": 13,
   "keyWhy": {
    "en": "The last sentence answers the title question: we do not know yet, but the search goes on.",
    "ko": "마지막 문장이 제목의 질문에 답해요. 아직 모르지만 탐사는 계속된다는 거예요."
   },
   "main": {
    "options": [
     {
      "en": "Scientists are searching for life in space, but they have not found it yet.",
      "ko": "과학자들은 우주에서 생명을 찾고 있지만 아직 찾지 못했다."
     },
     {
      "en": "Scientists have found aliens on a planet near Earth.",
      "ko": "과학자들이 지구 근처 행성에서 외계인을 찾았다."
     },
     {
      "en": "The Milky Way has only a few stars with planets.",
      "ko": "우리 은하에는 행성을 가진 별이 몇 개뿐이다."
     },
     {
      "en": "Radio telescopes are used only to look at the Moon.",
      "ko": "전파 망원경은 달을 볼 때만 쓴다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains how scientists search for life in space and says no clear proof has been found yet.",
     "ko": "과학자들이 우주에서 생명을 찾는 방법을 설명하고, 아직 확실한 증거는 없다고 말해요."
    }
   },
   "words": [
    {
     "en": "galaxy",
     "ko": "은하"
    },
    {
     "en": "planets",
     "ko": "행성"
    },
    {
     "en": "proof",
     "ko": "증거"
    }
   ],
   "summary": {
    "ko": "과학자들은 아직도 지구 밖의 생명을 찾고 있다.",
    "en": "Scientists are still searching for life beyond Earth.",
    "keywords": [
     "scientists",
     "searching",
     "life"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-28",
   "genre": "info",
   "title": {
    "en": "How Did the Dinosaurs Disappear?",
    "ko": "공룡은 왜 사라졌을까?"
   },
   "topic": {
    "en": "Dinosaurs",
    "ko": "공룡"
   },
   "bg": {
    "en": "The giant crater is called the Chicxulub crater.",
    "ko": "그 거대한 구덩이는 \"칙술루브 충돌구\"라고 불러요."
   },
   "sentences": [
    {
     "en": "For more than 150 million years, dinosaurs ruled the Earth.",
     "ko": "1억 5,000만 년이 넘는 동안 공룡은 지구를 지배했다."
    },
    {
     "en": "Then, about 66 million years ago, almost all of them suddenly disappeared.",
     "ko": "그런데 약 6,600만 년 전, 거의 모든 공룡이 갑자기 사라졌다."
    },
    {
     "en": "What happened?",
     "ko": "무슨 일이 있었던 것일까?"
    },
    {
     "en": "Most scientists agree that a huge rock from space caused the disaster.",
     "ko": "대부분의 과학자들은 우주에서 날아온 거대한 바위가 이 재앙을 일으켰다고 생각한다."
    },
    {
     "en": "Scientists call this kind of rock an asteroid.",
     "ko": "과학자들은 이런 바위를 소행성이라고 부른다."
    },
    {
     "en": "It was about 10 kilometers wide, which is wider than Mount Everest is tall.",
     "ko": "그 소행성은 폭이 약 10킬로미터로, 에베레스트산의 높이보다 넓었다."
    },
    {
     "en": "It crashed into the sea near what is now Mexico.",
     "ko": "소행성은 지금의 멕시코 근처 바다에 떨어졌다."
    },
    {
     "en": "The crash made a crater, a giant hole, more than 150 kilometers across.",
     "ko": "충돌로 지름이 150킬로미터가 넘는 거대한 구덩이, 곧 충돌구가 생겼다."
    },
    {
     "en": "It caused fires, giant waves, and clouds of dust that blocked the sunlight.",
     "ko": "충돌은 불과 거대한 파도, 그리고 햇빛을 가리는 먼지 구름을 일으켰다."
    },
    {
     "en": "Without sunlight, many plants died, and the animals that ate them starved.",
     "ko": "햇빛이 없자 많은 식물이 죽었고, 식물을 먹던 동물들은 굶주렸다."
    },
    {
     "en": "About three out of four kinds of living things on Earth died out.",
     "ko": "지구 생물 종류의 약 4분의 3이 사라졌다."
    },
    {
     "en": "This event is called a mass extinction.",
     "ko": "이런 사건을 대멸종이라고 부른다."
    },
    {
     "en": "But here is the surprise: not all dinosaurs disappeared.",
     "ko": "그런데 놀라운 사실이 있다. 모든 공룡이 사라진 것은 아니었다."
    },
    {
     "en": "Scientists say that birds are actually a kind of dinosaur that survived.",
     "ko": "과학자들은 새가 사실 살아남은 공룡의 한 종류라고 말한다."
    },
    {
     "en": "So the next time you see a pigeon, remember that you are looking at a dinosaur!",
     "ko": "그러니 다음에 비둘기를 보면, 공룡을 보고 있다는 것을 기억하자!"
    },
    {
     "en": "The end of the dinosaurs also gave small mammals, like our ancestors, a chance to spread.",
     "ko": "공룡의 멸종은 우리 조상 같은 작은 포유류가 퍼져 나갈 기회도 주었다."
    }
   ],
   "key": 3,
   "keyWhy": {
    "en": "This sentence gives the main cause of the dinosaurs' disappearance, which the rest of the text explains.",
    "ko": "이 문장이 공룡이 사라진 원인을 말하고, 나머지 글이 그 과정을 설명해요."
   },
   "main": {
    "options": [
     {
      "en": "Dinosaurs disappeared because people hunted them.",
      "ko": "사람들이 사냥해서 공룡이 사라졌다."
     },
     {
      "en": "A giant asteroid wiped out most dinosaurs, but birds survived.",
      "ko": "거대한 소행성이 대부분의 공룡을 없앴지만, 새는 살아남았다."
     },
     {
      "en": "Dinosaurs moved into the sea to escape the cold.",
      "ko": "공룡은 추위를 피해 바다로 옮겨 갔다."
     },
     {
      "en": "Every animal and plant on Earth died 66 million years ago.",
      "ko": "6,600만 년 전에 지구의 모든 동식물이 죽었다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text explains that an asteroid caused most dinosaurs to die out, but birds survived.",
     "ko": "소행성 때문에 대부분의 공룡이 사라졌지만 새는 살아남았다고 설명해요."
    }
   },
   "words": [
    {
     "en": "asteroid",
     "ko": "소행성"
    },
    {
     "en": "disaster",
     "ko": "재앙"
    },
    {
     "en": "survived",
     "ko": "살아남았다"
    }
   ],
   "summary": {
    "ko": "거대한 소행성 때문에 대부분의 공룡이 사라졌다.",
    "en": "A huge asteroid caused most dinosaurs to disappear.",
    "keywords": [
     "asteroid",
     "dinosaurs",
     "disappear"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-29",
   "genre": "info",
   "title": {
    "en": "The Deepest Place on Earth",
    "ko": "지구에서 가장 깊은 곳"
   },
   "topic": {
    "en": "Ocean",
    "ko": "바다"
   },
   "bg": {
    "en": "On the first dive in 1960, it took about five hours to reach the bottom.",
    "ko": "1960년 첫 잠수에서 바닥까지 내려가는 데 약 5시간이 걸렸어요."
   },
   "sentences": [
    {
     "en": "In January 1960, two men squeezed into a small steel ball and sank into the darkest water on Earth.",
     "ko": "1960년 1월, 두 남자가 작은 강철 공 안에 몸을 구겨 넣고 지구에서 가장 어두운 바닷속으로 내려갔다."
    },
    {
     "en": "Their goal was the Mariana Trench in the Pacific Ocean.",
     "ko": "목표는 태평양의 마리아나 해구였다."
    },
    {
     "en": "A trench is a long, narrow valley on the sea floor.",
     "ko": "해구는 바다 밑바닥에 있는 길고 좁은 골짜기다."
    },
    {
     "en": "Its deepest point, the Challenger Deep, is about 11 kilometers below the surface.",
     "ko": "가장 깊은 곳인 챌린저 해연은 바다 표면에서 약 11킬로미터 아래에 있다."
    },
    {
     "en": "If you dropped Mount Everest there, its top would still be underwater.",
     "ko": "에베레스트산을 그곳에 넣어도 꼭대기가 여전히 물속에 잠길 것이다."
    },
    {
     "en": "Down there, it is completely dark, because sunlight cannot reach that far.",
     "ko": "그 아래는 햇빛이 닿지 않아서 완전히 깜깜하다."
    },
    {
     "en": "The water is near freezing, and the pressure is enormous.",
     "ko": "물은 얼음처럼 차갑고, 압력은 엄청나다."
    },
    {
     "en": "Pressure means the weight of the water pushing down on everything.",
     "ko": "압력은 물의 무게가 모든 것을 내리누르는 힘이다."
    },
    {
     "en": "At the bottom, it is more than 1,000 times stronger than at the surface.",
     "ko": "바닥에서는 그 힘이 바다 표면보다 1,000배 넘게 강하다."
    },
    {
     "en": "For a long time, people believed nothing could live in such a place.",
     "ko": "오랫동안 사람들은 그런 곳에서는 아무것도 살 수 없다고 믿었다."
    },
    {
     "en": "Amazingly, explorers have found living things at the very bottom.",
     "ko": "놀랍게도 탐험가들은 바로 그 바닥에서 생물을 찾아냈다."
    },
    {
     "en": "Tiny shrimp-like animals and strange single-celled creatures survive there.",
     "ko": "작은 새우를 닮은 동물과 신기한 단세포 생물이 그곳에서 살아간다."
    },
    {
     "en": "Even today, much of the deep ocean has never been explored by humans.",
     "ko": "지금도 깊은 바다의 많은 부분은 사람이 한 번도 탐사하지 못했다."
    },
    {
     "en": "New kinds of animals are still discovered there every year.",
     "ko": "그곳에서는 지금도 해마다 새로운 동물이 발견된다."
    },
    {
     "en": "The deep sea reminds us that our own planet still holds many mysteries.",
     "ko": "깊은 바다는 우리 지구에 아직도 많은 수수께끼가 남아 있다는 것을 알려 준다."
    }
   ],
   "key": 14,
   "keyWhy": {
    "en": "The last sentence states the big idea: the deep sea still holds many mysteries.",
    "ko": "마지막 문장이 \"깊은 바다에는 아직 수수께끼가 많다\"는 큰 생각을 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Mount Everest is the deepest place on Earth.",
      "ko": "에베레스트산이 지구에서 가장 깊은 곳이다."
     },
     {
      "en": "Nothing can live at the bottom of the Mariana Trench.",
      "ko": "마리아나 해구 바닥에서는 아무것도 살 수 없다."
     },
     {
      "en": "The deepest ocean is dark and harsh, yet it still holds life and mysteries.",
      "ko": "가장 깊은 바다는 어둡고 혹독하지만, 그곳에도 생명과 수수께끼가 있다."
     },
     {
      "en": "Sunlight easily reaches the bottom of the sea.",
      "ko": "햇빛은 바다 밑바닥까지 쉽게 닿는다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text describes the dark, harsh deep sea and shows that life and mysteries are still found there.",
     "ko": "어둡고 혹독한 깊은 바다를 설명하고, 그곳에도 생명과 수수께끼가 있다는 것을 보여 줘요."
    }
   },
   "words": [
    {
     "en": "pressure",
     "ko": "압력"
    },
    {
     "en": "explorers",
     "ko": "탐험가"
    },
    {
     "en": "explored",
     "ko": "탐사했다"
    }
   ],
   "summary": {
    "ko": "마리아나 해구는 아주 깊지만, 그곳에도 생물이 산다.",
    "en": "The Mariana Trench is very deep, but some creatures live there.",
    "keywords": [
     "trench",
     "deep",
     "creatures"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-30",
   "genre": "info",
   "title": {
    "en": "Animals That Glow in the Dark",
    "ko": "어둠 속에서 빛나는 동물"
   },
   "topic": {
    "en": "Biology",
    "ko": "생물"
   },
   "bg": {
    "en": "Most ocean glow is blue, because blue light travels farthest in water.",
    "ko": "바다 생물의 빛은 대부분 파란색이에요. 파란빛이 물속에서 가장 멀리 가기 때문이에요."
   },
   "sentences": [
    {
     "en": "Imagine diving into the ocean at night and seeing tiny lights blinking all around you.",
     "ko": "밤바다에 뛰어들었는데 주위에서 작은 불빛들이 반짝인다고 상상해 보자."
    },
    {
     "en": "These lights do not come from boats or cameras.",
     "ko": "이 불빛은 배나 카메라에서 나오는 것이 아니다."
    },
    {
     "en": "They come from living things.",
     "ko": "살아 있는 생물에게서 나온다."
    },
    {
     "en": "Some animals can make their own light, and this is called bioluminescence.",
     "ko": "어떤 동물은 스스로 빛을 낼 수 있는데, 이것을 생물 발광이라고 한다."
    },
    {
     "en": "It happens when special chemicals inside their bodies mix and give off light.",
     "ko": "몸속의 특별한 화학 물질이 섞이면서 빛을 내는 것이다."
    },
    {
     "en": "Unlike a light bulb, this light makes almost no heat.",
     "ko": "전구와 달리 이 빛은 열이 거의 나지 않는다."
    },
    {
     "en": "Fireflies use their glow to find partners on summer nights.",
     "ko": "반딧불이는 여름밤에 짝을 찾으려고 빛을 낸다."
    },
    {
     "en": "Some mushrooms on land can glow as well.",
     "ko": "땅 위의 어떤 버섯도 빛을 낸다."
    },
    {
     "en": "But in the deep sea, where sunlight never reaches, glowing is far more common.",
     "ko": "그런데 햇빛이 전혀 닿지 않는 깊은 바다에서는 빛을 내는 생물이 훨씬 더 흔하다."
    },
    {
     "en": "In fact, most animals that live in the deep ocean can make light.",
     "ko": "사실 깊은 바다에 사는 동물 대부분이 빛을 낼 수 있다."
    },
    {
     "en": "They use it in clever ways.",
     "ko": "그리고 그 빛을 영리하게 쓴다."
    },
    {
     "en": "The anglerfish has a glowing \"lamp\" on its head to attract small fish.",
     "ko": "아귀는 머리에 빛나는 \"등불\"을 달고 작은 물고기를 꾄다."
    },
    {
     "en": "When curious fish swim closer, the anglerfish quickly swallows them.",
     "ko": "호기심 많은 물고기가 가까이 오면, 아귀는 재빨리 삼켜 버린다."
    },
    {
     "en": "Some squid even release glowing clouds to confuse enemies and escape.",
     "ko": "어떤 오징어는 빛나는 구름을 뿜어 적을 헷갈리게 하고 달아난다."
    },
    {
     "en": "Scientists use the chemicals behind this glow as tools in medical research.",
     "ko": "과학자들은 이 빛을 만드는 화학 물질을 의학 연구의 도구로 쓴다."
    },
    {
     "en": "Light, it turns out, is a powerful survival tool for many living things.",
     "ko": "알고 보니 빛은 많은 생물에게 강력한 생존 도구다."
    }
   ],
   "key": 15,
   "keyWhy": {
    "en": "The last sentence sums up all the examples: light helps living things survive.",
    "ko": "마지막 문장이 모든 예를 묶어 \"빛은 생존 도구\"라고 정리해요."
   },
   "main": {
    "options": [
     {
      "en": "Fireflies are the only animals that can glow.",
      "ko": "빛을 낼 수 있는 동물은 반딧불이뿐이다."
     },
     {
      "en": "Glowing animals store sunlight during the day.",
      "ko": "빛나는 동물은 낮에 햇빛을 모아 둔다."
     },
     {
      "en": "The deep sea is full of sunlight.",
      "ko": "깊은 바다는 햇빛으로 가득하다."
     },
     {
      "en": "Many animals make their own light to find mates, hunt, and stay safe.",
      "ko": "많은 동물이 짝을 찾고, 사냥하고, 몸을 지키려고 스스로 빛을 낸다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text gives many examples of animals that make light to find mates, hunt and stay safe.",
     "ko": "짝을 찾고, 사냥하고, 몸을 지키려고 빛을 내는 동물들의 예를 보여 줘요."
    }
   },
   "words": [
    {
     "en": "chemicals",
     "ko": "화학 물질"
    },
    {
     "en": "attract",
     "ko": "끌어들이다"
    },
    {
     "en": "escape",
     "ko": "달아나다"
    }
   ],
   "summary": {
    "ko": "많은 동물이 스스로 내는 빛을 이용해 살아남는다.",
    "en": "Many animals use their own light to survive.",
    "keywords": [
     "animals",
     "light",
     "survive"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-31",
   "genre": "info",
   "title": {
    "en": "How Do Astronauts Live in Space?",
    "ko": "우주 비행사는 어떻게 살까?"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "The International Space Station circles Earth about once every 90 minutes.",
    "ko": "국제 우주 정거장은 약 90분에 한 번씩 지구를 한 바퀴 돌아요."
   },
   "sentences": [
    {
     "en": "What would happen if you tried to pour a glass of water in space?",
     "ko": "우주에서 물 한 컵을 따르려고 하면 어떻게 될까?"
    },
    {
     "en": "The water would not fall; it would float in wobbly balls.",
     "ko": "물은 떨어지지 않고 출렁이는 공처럼 둥둥 떠다닐 것이다."
    },
    {
     "en": "Astronauts on the International Space Station are always falling around Earth, so they feel weightless.",
     "ko": "국제 우주 정거장의 우주 비행사들은 지구 주위로 계속 떨어지고 있어서 무게를 느끼지 못한다."
    },
    {
     "en": "Weightlessness makes everyday life very different.",
     "ko": "무게가 없으면 일상생활이 아주 달라진다."
    },
    {
     "en": "Astronauts sleep in sleeping bags tied to the wall so they do not drift around.",
     "ko": "우주 비행사들은 떠다니지 않도록 벽에 묶인 침낭에서 잔다."
    },
    {
     "en": "They drink from pouches with straws, and many foods come in special packages.",
     "ko": "빨대가 달린 주머니로 물을 마시고, 많은 음식이 특별한 포장에 담겨 있다."
    },
    {
     "en": "Even using the toilet is tricky, so space toilets use air to pull waste away.",
     "ko": "화장실 쓰기도 까다로워서, 우주 화장실은 공기로 배설물을 빨아들인다."
    },
    {
     "en": "Living without gravity is also hard on the body.",
     "ko": "중력 없이 사는 것은 몸에도 힘든 일이다."
    },
    {
     "en": "Muscles and bones grow weaker because they do not have to work against gravity.",
     "ko": "근육과 뼈가 중력을 버틸 필요가 없어서 약해지기 때문이다."
    },
    {
     "en": "To stay healthy, astronauts exercise for about two hours every day.",
     "ko": "건강을 지키려고 우주 비행사들은 매일 약 두 시간씩 운동한다."
    },
    {
     "en": "Surprisingly, astronauts grow a little taller in space, because their spines stretch out.",
     "ko": "놀랍게도 우주 비행사들은 우주에서 키가 조금 커진다. 척추가 늘어나기 때문이다."
    },
    {
     "en": "They return to their normal height after coming back to Earth.",
     "ko": "지구로 돌아오면 원래 키로 돌아온다."
    },
    {
     "en": "Life in space is exciting, but it requires careful planning and hard work.",
     "ko": "우주 생활은 신나지만, 꼼꼼한 계획과 노력이 필요하다."
    },
    {
     "en": "Every experiment they do helps prepare for longer trips, perhaps someday to Mars.",
     "ko": "그들이 하는 모든 실험은 언젠가 화성으로 갈지도 모르는 더 긴 여행을 준비하는 데 도움이 된다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "This sentence sums up the text: space life is exciting but needs careful planning and hard work.",
    "ko": "이 문장이 글 전체를 정리해요. 우주 생활은 신나지만 계획과 노력이 필요하다는 거예요."
   },
   "main": {
    "options": [
     {
      "en": "Life in space is very different, so astronauts need special ways to eat, sleep, and stay healthy.",
      "ko": "우주 생활은 아주 달라서 우주 비행사는 먹고, 자고, 건강을 지키는 특별한 방법이 필요하다."
     },
     {
      "en": "Astronauts never need to exercise in space.",
      "ko": "우주 비행사는 우주에서 운동할 필요가 없다."
     },
     {
      "en": "Water falls faster in space than on Earth.",
      "ko": "우주에서는 물이 지구보다 더 빨리 떨어진다."
     },
     {
      "en": "Astronauts get shorter when they live in space.",
      "ko": "우주 비행사는 우주에서 살면 키가 작아진다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains how astronauts eat, sleep and exercise in special ways because life in space is different.",
     "ko": "우주 생활이 달라서 우주 비행사가 특별한 방법으로 먹고 자고 운동한다는 것을 설명해요."
    }
   },
   "words": [
    {
     "en": "weightless",
     "ko": "무게가 없는"
    },
    {
     "en": "gravity",
     "ko": "중력"
    },
    {
     "en": "exercise",
     "ko": "운동하다"
    }
   ],
   "summary": {
    "ko": "우주 비행사는 우주에서 특별한 방법으로 먹고, 자고, 운동해야 한다.",
    "en": "Astronauts must eat, sleep, and exercise in special ways in space.",
    "keywords": [
     "astronauts",
     "sleep",
     "exercise"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-32",
   "genre": "info",
   "title": {
    "en": "Secrets of the Mummies",
    "ko": "미라의 비밀"
   },
   "topic": {
    "en": "History",
    "ko": "역사"
   },
   "bg": {
    "en": "Ancient Egyptians also made mummies of animals such as cats and crocodiles.",
    "ko": "고대 이집트 사람들은 고양이와 악어 같은 동물도 미라로 만들었어요."
   },
   "sentences": [
    {
     "en": "In November 1922, Howard Carter held up a candle and peered through a small hole into a dark tomb.",
     "ko": "1922년 11월, 하워드 카터는 촛불을 들고 작은 구멍으로 어두운 무덤 안을 들여다보았다."
    },
    {
     "en": "Gold shone everywhere.",
     "ko": "사방에서 금이 반짝였다."
    },
    {
     "en": "It was the tomb of Tutankhamun, a young Egyptian king who died more than 3,000 years ago.",
     "ko": "그곳은 3,000여 년 전에 죽은 이집트의 젊은 왕, 투탕카멘의 무덤이었다."
    },
    {
     "en": "Amazingly, his body was still there.",
     "ko": "놀랍게도 그의 몸이 아직 그곳에 남아 있었다."
    },
    {
     "en": "How could it last so long?",
     "ko": "어떻게 그렇게 오래 남아 있을 수 있었을까?"
    },
    {
     "en": "The answer is mummification, a way of keeping a dead body from decaying.",
     "ko": "답은 미라 만들기다. 죽은 몸이 썩지 않게 보존하는 방법이다."
    },
    {
     "en": "Ancient Egyptians believed that the body was needed in the afterlife.",
     "ko": "고대 이집트 사람들은 죽은 뒤의 삶에도 몸이 필요하다고 믿었다."
    },
    {
     "en": "First, they removed most of the organs, but they usually left the heart inside.",
     "ko": "먼저 장기 대부분을 꺼냈지만, 심장은 보통 몸속에 남겨 두었다."
    },
    {
     "en": "They believed the heart was the center of a person's thoughts and feelings.",
     "ko": "심장이 사람의 생각과 감정의 중심이라고 믿었기 때문이다."
    },
    {
     "en": "Next, they covered the body with a special salt called natron to dry it out for about 40 days.",
     "ko": "다음으로 나트론이라는 특별한 소금으로 몸을 덮어 약 40일 동안 말렸다."
    },
    {
     "en": "Finally, the body was wrapped in long strips of linen cloth.",
     "ko": "마지막으로 몸을 기다란 리넨 천으로 감쌌다."
    },
    {
     "en": "Surprisingly, Egypt was not the first place to make mummies.",
     "ko": "놀랍게도 미라를 처음 만든 곳은 이집트가 아니었다."
    },
    {
     "en": "The Chinchorro people of South America made mummies even earlier.",
     "ko": "남아메리카의 친초로 사람들이 그보다 더 먼저 미라를 만들었다."
    },
    {
     "en": "Today, scientists use CT scans to look inside mummies without unwrapping them.",
     "ko": "오늘날 과학자들은 CT 촬영으로 미라를 풀지 않고도 속을 들여다본다."
    },
    {
     "en": "Mummies help us learn how people lived, what they ate, and even what illnesses they had.",
     "ko": "미라는 옛사람들이 어떻게 살았고, 무엇을 먹었고, 어떤 병을 앓았는지까지 알려 준다."
    }
   ],
   "key": 14,
   "keyWhy": {
    "en": "The last sentence explains why mummies matter: they teach us about life long ago.",
    "ko": "마지막 문장이 미라가 왜 중요한지, 곧 옛날의 삶을 알려 준다는 것을 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Mummies were made only in Egypt.",
      "ko": "미라는 이집트에서만 만들어졌다."
     },
     {
      "en": "Mummies are carefully preserved bodies that teach us about life long ago.",
      "ko": "미라는 정성껏 보존된 몸으로, 아주 오래전의 삶을 알려 준다."
     },
     {
      "en": "Tutankhamun's tomb has never been found.",
      "ko": "투탕카멘의 무덤은 아직 발견되지 않았다."
     },
     {
      "en": "Egyptians removed the heart first and threw it away.",
      "ko": "이집트 사람들은 심장을 가장 먼저 꺼내서 버렸다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text explains how mummies were carefully made and what they teach us today.",
     "ko": "미라를 어떻게 정성껏 만들었는지, 오늘날 무엇을 알려 주는지 설명해요."
    }
   },
   "words": [
    {
     "en": "tomb",
     "ko": "무덤"
    },
    {
     "en": "ancient",
     "ko": "고대의"
    },
    {
     "en": "organs",
     "ko": "장기"
    }
   ],
   "summary": {
    "ko": "미라는 과학자들이 오래전 사람들에 대해 알도록 도와준다.",
    "en": "Mummies help scientists learn about people who lived long ago.",
    "keywords": [
     "mummies",
     "scientists",
     "learn"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-33",
   "genre": "info",
   "title": {
    "en": "Lightning: Nature's Electricity",
    "ko": "번개, 자연의 전기"
   },
   "topic": {
    "en": "Science",
    "ko": "과학"
   },
   "bg": {
    "en": "The saying that lightning never strikes the same place twice is false; tall buildings are hit many times a year.",
    "ko": "\"번개는 같은 곳에 두 번 치지 않는다\"는 말은 사실이 아니에요. 높은 건물은 1년에 여러 번 맞기도 해요."
   },
   "sentences": [
    {
     "en": "Flash! A bright line cuts across the dark sky, and a loud boom follows.",
     "ko": "번쩍! 밝은 선이 어두운 하늘을 가르고, 곧이어 큰 굉음이 들린다."
    },
    {
     "en": "That is lightning, one of the most powerful forces in nature.",
     "ko": "바로 번개다. 자연에서 가장 강력한 힘 중 하나다."
    },
    {
     "en": "Lightning is a giant spark of electricity.",
     "ko": "번개는 거대한 전기 불꽃이다."
    },
    {
     "en": "Inside a storm cloud, tiny pieces of ice crash into each other and build up electric charges.",
     "ko": "폭풍 구름 속에서 작은 얼음 조각들이 서로 부딪치며 전기를 모은다."
    },
    {
     "en": "When the charge becomes strong enough, electricity jumps between the cloud and the ground.",
     "ko": "전기가 충분히 강해지면 구름과 땅 사이로 전기가 튄다."
    },
    {
     "en": "A lightning bolt can be about five times hotter than the surface of the Sun.",
     "ko": "번개 한 줄기는 태양 표면보다 약 다섯 배나 뜨거울 수 있다."
    },
    {
     "en": "This heat makes the air expand very quickly, and that creates the sound of thunder.",
     "ko": "이 열 때문에 공기가 아주 빠르게 팽창하고, 그것이 천둥소리를 만든다."
    },
    {
     "en": "Because light travels much faster than sound, we see lightning before we hear thunder.",
     "ko": "빛이 소리보다 훨씬 빠르기 때문에, 우리는 천둥소리를 듣기 전에 번개를 먼저 본다."
    },
    {
     "en": "Here is a useful trick: count the seconds between the flash and the boom.",
     "ko": "쓸모 있는 방법이 있다. 번쩍인 뒤 쾅 소리가 날 때까지 몇 초인지 세어 보자."
    },
    {
     "en": "If you divide that number by three, you will know roughly how many kilometers away the storm is.",
     "ko": "그 숫자를 3으로 나누면 폭풍이 대략 몇 킬로미터 떨어져 있는지 알 수 있다."
    },
    {
     "en": "Lightning flashes about 40 to 50 times every second somewhere on Earth.",
     "ko": "지구 어딘가에서는 1초마다 약 40~50번씩 번개가 친다."
    },
    {
     "en": "It can be dangerous, so when you hear thunder, go inside a building or a car.",
     "ko": "번개는 위험할 수 있으니, 천둥소리가 들리면 건물이나 자동차 안으로 들어가자."
    },
    {
     "en": "Lightning is beautiful to watch, but it should always be respected.",
     "ko": "번개는 보기에 아름답지만, 언제나 조심해야 한다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The last sentence gives the main message: lightning is beautiful but must be respected.",
    "ko": "마지막 문장이 \"번개는 아름답지만 조심해야 한다\"는 핵심을 말해요."
   },
   "main": {
    "options": [
     {
      "en": "We hear thunder before we see lightning because sound is faster.",
      "ko": "소리가 더 빨라서 번개를 보기 전에 천둥소리를 먼저 듣는다."
     },
     {
      "en": "Lightning is cold and harmless.",
      "ko": "번개는 차갑고 해롭지 않다."
     },
     {
      "en": "Lightning is a powerful spark of electricity, so we should understand it and stay safe.",
      "ko": "번개는 강력한 전기 불꽃이므로, 잘 이해하고 안전하게 지내야 한다."
     },
     {
      "en": "Lightning happens only in summer in Korea.",
      "ko": "번개는 한국에서 여름에만 친다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text explains what lightning is, how thunder forms, and how to stay safe.",
     "ko": "번개가 무엇인지, 천둥이 어떻게 생기는지, 어떻게 안전하게 지낼지 설명해요."
    }
   },
   "words": [
    {
     "en": "electricity",
     "ko": "전기"
    },
    {
     "en": "expand",
     "ko": "팽창하다"
    },
    {
     "en": "dangerous",
     "ko": "위험한"
    }
   ],
   "summary": {
    "ko": "번개는 강력한 전기이므로 폭풍이 칠 때 조심해야 한다.",
    "en": "Lightning is powerful electricity, so we must be careful during storms.",
    "keywords": [
     "lightning",
     "electricity",
     "careful"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-34",
   "genre": "info",
   "title": {
    "en": "Tardigrades: The Toughest Animals",
    "ko": "물곰, 가장 강한 동물"
   },
   "topic": {
    "en": "Biology",
    "ko": "생물"
   },
   "bg": {
    "en": "More than 1,000 species of tardigrades have been found.",
    "ko": "지금까지 발견된 물곰은 1,000종이 넘어요."
   },
   "sentences": [
    {
     "en": "What animal can survive being frozen, dried out, and even sent into space?",
     "ko": "얼어도, 바싹 말라도, 심지어 우주로 보내져도 살아남는 동물은 무엇일까?"
    },
    {
     "en": "Meet the tardigrade, also called the \"water bear.\"",
     "ko": "\"물곰\"이라고도 부르는 완보동물을 소개한다."
    },
    {
     "en": "Tardigrades are tiny animals, usually less than one millimeter long.",
     "ko": "물곰은 보통 몸길이가 1밀리미터도 안 되는 아주 작은 동물이다."
    },
    {
     "en": "They have eight chubby legs and look a bit like little bears under a microscope.",
     "ko": "통통한 다리가 여덟 개 있고, 현미경으로 보면 작은 곰처럼 보인다."
    },
    {
     "en": "They live almost everywhere, from mountaintops to the deep sea, and even in the moss in your neighborhood.",
     "ko": "산꼭대기부터 깊은 바다, 심지어 우리 동네 이끼 속까지 거의 모든 곳에 산다."
    },
    {
     "en": "Their most amazing skill is surviving when conditions become terrible.",
     "ko": "물곰의 가장 놀라운 능력은 환경이 아주 나빠져도 살아남는 것이다."
    },
    {
     "en": "When their home dries out, they pull in their legs and curl up into a ball called a \"tun.\"",
     "ko": "사는 곳이 말라 버리면 다리를 오므리고 \"툰\"이라는 공 모양으로 몸을 만다."
    },
    {
     "en": "In this state, their bodies almost stop working, and they can wait for years.",
     "ko": "이 상태에서는 몸이 거의 멈추고, 몇 년이고 기다릴 수 있다."
    },
    {
     "en": "When water returns, they wake up and walk away as if nothing happened.",
     "ko": "물이 다시 생기면 깨어나서 아무 일 없었다는 듯 걸어간다."
    },
    {
     "en": "In 2007, scientists sent tardigrades into space without any protection.",
     "ko": "2007년, 과학자들은 물곰을 아무 보호 장치 없이 우주로 보냈다."
    },
    {
     "en": "Some of them survived and later had healthy babies.",
     "ko": "그중 일부는 살아남았고, 나중에 건강한 새끼까지 낳았다."
    },
    {
     "en": "However, they are not truly unbeatable, and long periods of harsh conditions can still kill them.",
     "ko": "하지만 물곰도 완전히 무적은 아니라서, 혹독한 환경이 오래 이어지면 죽을 수 있다."
    },
    {
     "en": "Scientists study them to learn how to protect living cells, which might help medicine and space travel in the future.",
     "ko": "과학자들은 살아 있는 세포를 보호하는 방법을 배우려고 물곰을 연구한다. 앞으로 의학과 우주여행에 도움이 될지도 모른다."
    }
   ],
   "key": 5,
   "keyWhy": {
    "en": "This sentence names the tardigrade's most amazing skill, which the rest of the text explains.",
    "ko": "이 문장이 물곰의 가장 놀라운 능력을 말하고, 나머지 글이 그 능력을 설명해요."
   },
   "main": {
    "options": [
     {
      "en": "Tardigrades are large bears that live in forests.",
      "ko": "물곰은 숲에 사는 커다란 곰이다."
     },
     {
      "en": "Tardigrades can live only in the deep sea.",
      "ko": "물곰은 깊은 바다에서만 살 수 있다."
     },
     {
      "en": "Tardigrades die as soon as their home dries out.",
      "ko": "물곰은 사는 곳이 마르자마자 죽는다."
     },
     {
      "en": "Tiny tardigrades survive extreme conditions by drying up and waiting.",
      "ko": "작은 물곰은 몸을 말리고 기다리는 방법으로 극한 환경에서 살아남는다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text explains how tiny tardigrades dry up and wait to survive extreme conditions.",
     "ko": "작은 물곰이 몸을 말리고 기다려서 극한 환경에서 살아남는 방법을 설명해요."
    }
   },
   "words": [
    {
     "en": "microscope",
     "ko": "현미경"
    },
    {
     "en": "conditions",
     "ko": "환경, 조건"
    },
    {
     "en": "protection",
     "ko": "보호"
    }
   ],
   "summary": {
    "ko": "물곰은 아주 나쁜 환경에서도 살아남는 작은 동물이다.",
    "en": "Tardigrades are tiny animals that can survive terrible conditions.",
    "keywords": [
     "tardigrades",
     "tiny",
     "survive"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-35",
   "genre": "info",
   "title": {
    "en": "How Video Games Are Made",
    "ko": "게임은 어떻게 만들어질까"
   },
   "topic": {
    "en": "Technology",
    "ko": "기술"
   },
   "bg": {
    "en": "Pong, one of the first popular video games, was a table tennis game released in 1972.",
    "ko": "초기의 인기 비디오 게임 중 하나인 \"퐁(Pong)\"은 1972년에 나온 탁구 게임이에요."
   },
   "sentences": [
    {
     "en": "Imagine you are playing a game, and your hero leaps across a canyon just in time.",
     "ko": "게임을 하다가 내 주인공이 협곡을 아슬아슬하게 뛰어넘는 순간을 상상해 보자."
    },
    {
     "en": "Have you ever wondered how that moment was made?",
     "ko": "그 순간이 어떻게 만들어졌는지 궁금했던 적이 있는가?"
    },
    {
     "en": "A big video game is usually made by a team that can include hundreds of people.",
     "ko": "큰 비디오 게임은 보통 수백 명이 함께하는 팀이 만든다."
    },
    {
     "en": "It starts with an idea and a plan, called a game design.",
     "ko": "게임은 게임 디자인이라고 부르는 아이디어와 계획에서 시작한다."
    },
    {
     "en": "Designers decide the story, the rules, and what makes the game fun.",
     "ko": "디자이너는 이야기와 규칙, 그리고 게임을 재미있게 만드는 요소를 정한다."
    },
    {
     "en": "Artists draw the characters, places, and objects, often with 3D computer tools.",
     "ko": "아티스트는 3D 컴퓨터 도구 등으로 캐릭터와 장소, 물건을 그린다."
    },
    {
     "en": "Programmers write code, the instructions that tell the computer what to do.",
     "ko": "프로그래머는 컴퓨터에게 할 일을 알려 주는 명령, 곧 코드를 쓴다."
    },
    {
     "en": "Sound designers create music and effects, like footsteps and explosions.",
     "ko": "사운드 디자이너는 음악과 발소리, 폭발음 같은 효과음을 만든다."
    },
    {
     "en": "Next comes one of the most important steps: testing.",
     "ko": "다음은 가장 중요한 단계 중 하나인 테스트다."
    },
    {
     "en": "Testers play the game again and again to find bugs, which are mistakes in the code.",
     "ko": "테스터는 코드의 실수인 버그를 찾으려고 게임을 하고 또 한다."
    },
    {
     "en": "Surprisingly, a large game can take three to five years or more to finish.",
     "ko": "놀랍게도 큰 게임 하나를 완성하는 데 3년에서 5년, 혹은 그 이상이 걸리기도 한다."
    },
    {
     "en": "Many games change completely along the way because early versions were not fun.",
     "ko": "처음 버전이 재미없어서 만드는 도중에 완전히 바뀌는 게임도 많다."
    },
    {
     "en": "Making games requires creativity, math, art, and teamwork all at once.",
     "ko": "게임을 만들려면 창의력, 수학, 미술, 팀워크가 한꺼번에 필요하다."
    },
    {
     "en": "So the next time you play, remember the many people who worked together to make it.",
     "ko": "그러니 다음에 게임을 할 때는 그것을 함께 만든 많은 사람들을 떠올려 보자."
    }
   ],
   "key": 2,
   "keyWhy": {
    "en": "This sentence states the main idea that a big game is made by a large team, which the text then describes.",
    "ko": "이 문장이 \"큰 게임은 큰 팀이 만든다\"는 핵심을 말하고, 이어서 팀원들의 일을 설명해요."
   },
   "main": {
    "options": [
     {
      "en": "Video games are made by teams of designers, artists, programmers, and testers.",
      "ko": "비디오 게임은 디자이너, 아티스트, 프로그래머, 테스터로 이루어진 팀이 만든다."
     },
     {
      "en": "One programmer can make a big game in a week.",
      "ko": "프로그래머 한 명이 일주일 만에 큰 게임을 만들 수 있다."
     },
     {
      "en": "Testing is not important when making games.",
      "ko": "게임을 만들 때 테스트는 중요하지 않다."
     },
     {
      "en": "Video games do not need music or sound.",
      "ko": "비디오 게임에는 음악이나 소리가 필요 없다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text describes the jobs of designers, artists, programmers, sound designers and testers who make a game together.",
     "ko": "게임을 함께 만드는 디자이너, 아티스트, 프로그래머, 사운드 디자이너, 테스터의 일을 설명해요."
    }
   },
   "words": [
    {
     "en": "design",
     "ko": "설계, 디자인"
    },
    {
     "en": "instructions",
     "ko": "명령, 지시"
    },
    {
     "en": "creativity",
     "ko": "창의력"
    }
   ],
   "summary": {
    "ko": "서로 다른 재능을 가진 많은 사람이 함께 비디오 게임을 만든다.",
    "en": "Many people with different skills work together to make a video game.",
    "keywords": [
     "people",
     "together",
     "game"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-36",
   "genre": "info",
   "title": {
    "en": "The Secret Life of Octopuses",
    "ko": "문어의 비밀스러운 삶"
   },
   "topic": {
    "en": "Animals",
    "ko": "동물"
   },
   "bg": {
    "en": "Octopus blood is blue because it contains copper.",
    "ko": "문어의 피가 파란 이유는 피 속에 구리가 들어 있기 때문이에요."
   },
   "sentences": [
    {
     "en": "Imagine having eight arms, three hearts, and blue blood.",
     "ko": "팔이 여덟 개, 심장이 세 개, 피가 파란색이라고 상상해 보자."
    },
    {
     "en": "For an octopus, this is completely normal.",
     "ko": "문어에게는 이것이 아주 평범한 일이다."
    },
    {
     "en": "Octopuses are some of the smartest animals in the ocean.",
     "ko": "문어는 바다에서 가장 똑똑한 동물 중 하나다."
    },
    {
     "en": "They can solve puzzles, open jars, and find their way through mazes.",
     "ko": "퍼즐을 풀고, 병뚜껑을 열고, 미로에서 길을 찾을 수 있다."
    },
    {
     "en": "In aquariums, some have even escaped from their tanks at night.",
     "ko": "수족관에서는 밤에 수조를 빠져나간 문어도 있었다."
    },
    {
     "en": "About two-thirds of their brain cells are in their arms, so each arm can act almost on its own.",
     "ko": "뇌세포의 약 3분의 2가 팔에 있어서, 팔 하나하나가 거의 스스로 움직일 수 있다."
    },
    {
     "en": "Their skin is amazing, too.",
     "ko": "피부도 놀랍다."
    },
    {
     "en": "In less than a second, an octopus can change its color and pattern to match rocks or sand.",
     "ko": "문어는 1초도 안 되어 몸 색깔과 무늬를 바위나 모래처럼 바꿀 수 있다."
    },
    {
     "en": "Some octopuses even copy other animals, such as poisonous fish or sea snakes.",
     "ko": "어떤 문어는 독이 있는 물고기나 바다뱀 같은 다른 동물을 흉내 내기도 한다."
    },
    {
     "en": "If an enemy gets too close, an octopus can shoot out a cloud of dark ink and escape.",
     "ko": "적이 너무 가까이 오면 문어는 시커먼 먹물을 뿜고 달아난다."
    },
    {
     "en": "Because it has no bones, it can squeeze through any hole bigger than its hard beak.",
     "ko": "뼈가 없어서 딱딱한 부리보다 큰 구멍이라면 어디든 빠져나갈 수 있다."
    },
    {
     "en": "But octopuses have a surprisingly short life.",
     "ko": "그런데 문어는 놀랄 만큼 짧게 산다."
    },
    {
     "en": "Most kinds live only one or two years.",
     "ko": "대부분의 문어는 겨우 1~2년밖에 살지 못한다."
    },
    {
     "en": "In that short time, they become clever hunters and masters of disguise.",
     "ko": "그 짧은 시간 동안 영리한 사냥꾼이자 변장의 달인이 된다."
    },
    {
     "en": "Octopuses show us that intelligence can look very different from our own.",
     "ko": "문어는 지능이 우리와 아주 다른 모습일 수도 있다는 것을 보여 준다."
    }
   ],
   "key": 14,
   "keyWhy": {
    "en": "The last sentence gives the big idea behind all of the octopus's skills: intelligence can look different from ours.",
    "ko": "마지막 문장이 문어의 모든 능력에 담긴 큰 생각, 곧 지능은 우리와 다를 수 있다는 것을 말해요."
   },
   "main": {
    "options": [
     {
      "en": "Octopuses have bones and four arms.",
      "ko": "문어는 뼈가 있고 팔이 네 개다."
     },
     {
      "en": "Octopuses are clever animals with amazing skills, even though they live short lives.",
      "ko": "문어는 짧게 살지만 놀라운 능력을 가진 영리한 동물이다."
     },
     {
      "en": "Octopuses live for more than 50 years.",
      "ko": "문어는 50년 넘게 산다."
     },
     {
      "en": "Octopuses cannot change their color.",
      "ko": "문어는 몸 색깔을 바꿀 수 없다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text describes the octopus's clever skills and its short life.",
     "ko": "문어의 영리한 능력들과 짧은 수명을 함께 설명해요."
    }
   },
   "words": [
    {
     "en": "smartest",
     "ko": "가장 똑똑한"
    },
    {
     "en": "pattern",
     "ko": "무늬"
    },
    {
     "en": "disguise",
     "ko": "변장"
    }
   ],
   "summary": {
    "ko": "문어는 아주 똑똑하고 몸 색깔을 바꿔 숨을 수 있다.",
    "en": "Octopuses are very smart and can hide by changing color.",
    "keywords": [
     "octopuses",
     "smart",
     "color"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-37",
   "genre": "info",
   "title": {
    "en": "Black Holes Explained",
    "ko": "블랙홀 이야기"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "The black hole at the center of our galaxy is about 4 million times heavier than the Sun.",
    "ko": "우리 은하 중심의 블랙홀은 태양보다 약 400만 배 무거워요."
   },
   "sentences": [
    {
     "en": "What if there were a place in space where even light could not escape?",
     "ko": "우주에 빛조차 빠져나올 수 없는 곳이 있다면 어떨까?"
    },
    {
     "en": "That place is real, and it is called a black hole.",
     "ko": "그런 곳은 실제로 있고, 블랙홀이라고 부른다."
    },
    {
     "en": "A black hole can form when a huge star runs out of fuel and collapses into a tiny space.",
     "ko": "블랙홀은 거대한 별이 연료를 다 쓰고 아주 작은 공간으로 무너질 때 생길 수 있다."
    },
    {
     "en": "Because so much mass is packed so tightly, its gravity becomes incredibly strong.",
     "ko": "엄청난 질량이 아주 빽빽하게 모여 있어서 중력이 어마어마하게 강해진다."
    },
    {
     "en": "Anything that gets too close, including light, is pulled in and can never come out.",
     "ko": "빛을 포함해 너무 가까이 간 것은 무엇이든 빨려 들어가 다시는 나오지 못한다."
    },
    {
     "en": "Since no light comes out, black holes are invisible.",
     "ko": "빛이 나오지 않으니 블랙홀은 눈에 보이지 않는다."
    },
    {
     "en": "So how do scientists know they are there?",
     "ko": "그렇다면 과학자들은 블랙홀이 있다는 것을 어떻게 알까?"
    },
    {
     "en": "They watch how stars and gas move around an empty-looking area.",
     "ko": "텅 비어 보이는 곳 주변에서 별과 가스가 어떻게 움직이는지 관찰한다."
    },
    {
     "en": "Hot gas swirling around a black hole also shines brightly before it falls in.",
     "ko": "블랙홀 주위를 소용돌이치는 뜨거운 가스도 빨려 들어가기 전에 밝게 빛난다."
    },
    {
     "en": "In 2019, scientists shared the first picture of a black hole's shadow.",
     "ko": "2019년, 과학자들은 블랙홀 그림자를 찍은 첫 사진을 공개했다."
    },
    {
     "en": "To take it, they linked telescopes around the world to work like one telescope as big as Earth.",
     "ko": "이 사진을 찍으려고 전 세계의 망원경을 연결해 지구만 한 망원경 하나처럼 쓰게 했다."
    },
    {
     "en": "There is even a giant black hole at the center of our own Milky Way galaxy.",
     "ko": "우리 은하의 중심에도 거대한 블랙홀이 있다."
    },
    {
     "en": "Do not worry, though; it is much too far away to pull us in.",
     "ko": "하지만 걱정하지 말자. 너무 멀리 있어서 우리를 끌어당길 수 없다."
    },
    {
     "en": "Black holes help scientists understand gravity, space, and time.",
     "ko": "블랙홀은 과학자들이 중력과 공간, 시간을 이해하도록 도와준다."
    }
   ],
   "key": 4,
   "keyWhy": {
    "en": "This sentence explains the key feature of a black hole: nothing, not even light, can come out.",
    "ko": "이 문장이 블랙홀의 핵심 특징, 곧 빛조차 나오지 못한다는 것을 설명해요."
   },
   "main": {
    "options": [
     {
      "en": "Black holes are tunnels that lead to other planets.",
      "ko": "블랙홀은 다른 행성으로 가는 터널이다."
     },
     {
      "en": "Scientists can easily see black holes with their own eyes.",
      "ko": "과학자들은 맨눈으로 블랙홀을 쉽게 볼 수 있다."
     },
     {
      "en": "Black holes have gravity so strong that not even light escapes, so scientists study them in clever ways.",
      "ko": "블랙홀은 빛조차 빠져나오지 못할 만큼 중력이 강해서, 과학자들은 영리한 방법으로 연구한다."
     },
     {
      "en": "The black hole in our galaxy will soon pull in the Earth.",
      "ko": "우리 은하의 블랙홀이 곧 지구를 빨아들일 것이다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text explains that black holes have extremely strong gravity and how scientists still find and study them.",
     "ko": "블랙홀의 중력이 아주 강하다는 것과 과학자들이 그래도 블랙홀을 찾아 연구하는 방법을 설명해요."
    }
   },
   "words": [
    {
     "en": "collapses",
     "ko": "무너지다"
    },
    {
     "en": "gravity",
     "ko": "중력"
    },
    {
     "en": "invisible",
     "ko": "보이지 않는"
    }
   ],
   "summary": {
    "ko": "블랙홀의 중력은 너무 강해서 빛도 빠져나올 수 없다.",
    "en": "A black hole's gravity is so strong that light cannot escape from it.",
    "keywords": [
     "gravity",
     "strong",
     "light"
    ]
   }
  },
  {
   "stage": 3,
   "id": "s3-38",
   "genre": "info",
   "title": {
    "en": "Super Senses of Animals",
    "ko": "동물의 초감각"
   },
   "topic": {
    "en": "Animals",
    "ko": "동물"
   },
   "bg": {
    "en": "Sharks can also sense tiny electric signals, just like the platypus.",
    "ko": "상어도 오리너구리처럼 아주 약한 전기 신호를 느낄 수 있어요."
   },
   "sentences": [
    {
     "en": "Humans have five senses, but some animals have senses that seem like superpowers.",
     "ko": "사람에게는 다섯 가지 감각이 있지만, 어떤 동물은 초능력 같은 감각을 가졌다."
    },
    {
     "en": "Dogs, for example, have a sense of smell that is thousands of times better than ours.",
     "ko": "예를 들어 개의 후각은 사람보다 수천 배나 뛰어나다."
    },
    {
     "en": "That is why trained dogs can find lost people in snow or fallen buildings.",
     "ko": "그래서 훈련받은 개는 눈 속이나 무너진 건물에서 길 잃은 사람을 찾아낼 수 있다."
    },
    {
     "en": "Bats can fly and catch tiny insects in complete darkness by using sound.",
     "ko": "박쥐는 소리를 이용해 완전한 어둠 속에서도 날아다니며 작은 곤충을 잡는다."
    },
    {
     "en": "They make high-pitched calls and listen for the echoes that bounce back.",
     "ko": "높은 소리를 내고 되돌아오는 메아리를 듣는다."
    },
    {
     "en": "This skill is called echolocation, and dolphins use it too.",
     "ko": "이 능력을 반향정위라고 하는데, 돌고래도 이 능력을 쓴다."
    },
    {
     "en": "Many birds can sense Earth's magnetic field, which helps them travel thousands of kilometers.",
     "ko": "많은 새는 지구의 자기장을 느낄 수 있어서 수천 킬로미터를 날아갈 수 있다."
    },
    {
     "en": "Snakes such as pythons can sense heat, so they can find warm animals in the dark.",
     "ko": "비단뱀 같은 뱀은 열을 느낄 수 있어서 어둠 속에서도 따뜻한 동물을 찾아낸다."
    },
    {
     "en": "Perhaps the most surprising sense belongs to the platypus.",
     "ko": "가장 놀라운 감각은 아마 오리너구리의 것일 것이다."
    },
    {
     "en": "It can detect the tiny electric signals made by the muscles of its prey.",
     "ko": "오리너구리는 먹잇감의 근육이 만드는 아주 약한 전기 신호를 느낄 수 있다."
    },
    {
     "en": "It closes its eyes, ears, and nose underwater and hunts with its bill alone.",
     "ko": "물속에서는 눈과 귀, 코를 닫고 부리만으로 사냥한다."
    },
    {
     "en": "Scientists study these senses to design new technology, such as sonar and better sensors.",
     "ko": "과학자들은 이런 감각을 연구해 수중 음파 탐지기나 더 좋은 센서 같은 새로운 기술을 만든다."
    },
    {
     "en": "Every animal's senses are perfectly suited to the way it lives.",
     "ko": "모든 동물의 감각은 그 동물이 사는 방식에 꼭 알맞게 맞춰져 있다."
    }
   ],
   "key": 12,
   "keyWhy": {
    "en": "The last sentence ties every example together: each animal's senses fit the way it lives.",
    "ko": "마지막 문장이 모든 예를 묶어요. 동물마다 사는 방식에 맞는 감각을 가졌다는 거예요."
   },
   "main": {
    "options": [
     {
      "en": "Humans have the best senses of all animals.",
      "ko": "사람의 감각이 모든 동물 중에서 가장 뛰어나다."
     },
     {
      "en": "Bats cannot fly at night.",
      "ko": "박쥐는 밤에 날 수 없다."
     },
     {
      "en": "Only dogs have special senses.",
      "ko": "특별한 감각을 가진 동물은 개뿐이다."
     },
     {
      "en": "Many animals have amazing senses that help them survive in their own way.",
      "ko": "많은 동물이 저마다의 방식으로 살아남게 돕는 놀라운 감각을 가졌다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text gives examples of animals whose amazing senses help them survive in their own way.",
     "ko": "저마다의 방식으로 살아남게 돕는 놀라운 감각을 가진 동물들의 예를 보여 줘요."
    }
   },
   "words": [
    {
     "en": "senses",
     "ko": "감각"
    },
    {
     "en": "echoes",
     "ko": "메아리"
    },
    {
     "en": "detect",
     "ko": "감지하다"
    }
   ],
   "summary": {
    "ko": "박쥐와 개 같은 동물은 살아가는 데 도움이 되는 특별한 감각을 가졌다.",
    "en": "Animals like bats and dogs have special senses that help them live.",
    "keywords": [
     "animals",
     "special",
     "senses"
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
  },
  {
   "stage": 4,
   "id": "s4-13",
   "genre": "info",
   "title": {
    "en": "Why Your Brain Loves Bad Habits",
    "ko": "뇌는 왜 나쁜 습관을 좋아할까"
   },
   "topic": {
    "en": "Psychology",
    "ko": "심리"
   },
   "bg": {
    "en": "How long a habit takes to form varies widely; studies have found anything from a few weeks to several months.",
    "ko": "습관이 자리 잡는 데 걸리는 시간은 사람과 행동에 따라 크게 달라서, 연구에서는 몇 주에서 몇 달까지 나타났어요."
   },
   "sentences": [
    {
     "en": "It is ten o'clock at night, your homework is open, and somehow your thumb is scrolling again.",
     "ko": "밤 10시, 숙제는 펼쳐 놓았는데 어느새 엄지손가락은 또 화면을 넘기고 있다."
    },
    {
     "en": "The answer lies in habits, the actions we repeat so often that we barely think about them.",
     "ko": "답은 습관, 즉 너무 자주 반복해서 거의 생각하지 않고 하는 행동에 있다."
    },
    {
     "en": "Scientists believe that a large part of our daily behavior is driven by habit rather than by careful decisions.",
     "ko": "과학자들은 우리 일상 행동의 상당 부분이 신중한 결정보다 습관에 따라 움직인다고 본다."
    },
    {
     "en": "Many researchers describe a habit as a loop with three parts: a cue, a routine, and a reward.",
     "ko": "많은 연구자는 습관을 신호, 반복 행동, 보상이라는 세 부분으로 된 고리로 설명한다."
    },
    {
     "en": "The cue is a trigger, such as a notification sound or the feeling of boredom.",
     "ko": "신호는 알림 소리나 지루한 기분 같은 방아쇠이다."
    },
    {
     "en": "The routine is the behavior itself, like opening an app.",
     "ko": "반복 행동은 앱을 여는 것 같은 행동 그 자체이다."
    },
    {
     "en": "The reward is the pleasant feeling that follows, which teaches the brain to repeat the loop next time.",
     "ko": "보상은 그 뒤에 오는 즐거운 느낌으로, 뇌가 다음에도 그 고리를 반복하도록 가르친다."
    },
    {
     "en": "Over time, a part of the brain called the basal ganglia takes over, so the action becomes almost automatic.",
     "ko": "시간이 지나면 기저핵이라는 뇌 부위가 일을 맡아서 그 행동은 거의 자동이 된다."
    },
    {
     "en": "This saves mental energy, which is useful for good habits such as brushing your teeth.",
     "ko": "이것은 정신적 에너지를 아껴 주어서, 양치질 같은 좋은 습관에는 유용하다."
    },
    {
     "en": "However, the same system also keeps bad habits running, even when we want to stop them.",
     "ko": "하지만 같은 시스템이 우리가 멈추고 싶을 때조차 나쁜 습관을 계속 돌아가게 한다."
    },
    {
     "en": "Surprisingly, simply trying harder is often not enough to break a habit.",
     "ko": "놀랍게도 그냥 더 애쓰는 것만으로는 습관을 깨기에 부족한 경우가 많다."
    },
    {
     "en": "Willpower gets tired, especially at the end of a long day.",
     "ko": "의지력은 지치기 마련이고, 특히 긴 하루가 끝날 무렵에 그렇다."
    },
    {
     "en": "A smarter approach is to change the loop itself.",
     "ko": "더 현명한 방법은 고리 자체를 바꾸는 것이다."
    },
    {
     "en": "For example, you can remove the cue by leaving your phone in another room while you study.",
     "ko": "예를 들어 공부하는 동안 휴대폰을 다른 방에 두어서 신호를 없앨 수 있다."
    },
    {
     "en": "You can also keep the cue and the reward but replace the routine, such as stretching instead of scrolling when you feel bored.",
     "ko": "신호와 보상은 그대로 두고 반복 행동만 바꿀 수도 있는데, 지루할 때 화면을 넘기는 대신 스트레칭을 하는 식이다."
    },
    {
     "en": "Making a good habit very small and easy at first also helps, because small wins build the loop.",
     "ko": "좋은 습관을 처음엔 아주 작고 쉽게 만드는 것도 도움이 되는데, 작은 성공이 고리를 만들어 주기 때문이다."
    },
    {
     "en": "In the end, understanding how habits work gives us more control than willpower alone ever could.",
     "ko": "결국 습관이 어떻게 작동하는지 이해하면 의지력만으로는 결코 얻을 수 없는 통제력을 갖게 된다."
    },
    {
     "en": "Habits shape our lives, but with the right design, we can shape our habits.",
     "ko": "습관은 우리 삶을 만들지만, 제대로 설계하면 우리가 습관을 만들 수 있다."
    }
   ],
   "key": 16,
   "keyWhy": {
    "en": "This sentence states the main point: understanding how habits work gives us more control than willpower.",
    "ko": "습관의 원리를 이해하는 것이 의지력보다 더 큰 힘이 된다는 글의 핵심을 말해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Understanding the cue-routine-reward loop helps us change habits better than willpower alone.",
      "ko": "신호-반복 행동-보상 고리를 이해하면 의지력만 쓸 때보다 습관을 더 잘 바꿀 수 있다."
     },
     {
      "en": "Phones are the main cause of all bad habits.",
      "ko": "휴대폰이 모든 나쁜 습관의 주된 원인이다."
     },
     {
      "en": "Habits are controlled only by willpower.",
      "ko": "습관은 오직 의지력으로만 조절된다."
     },
     {
      "en": "The basal ganglia makes people forget their habits.",
      "ko": "기저핵이 사람들로 하여금 습관을 잊게 한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains the habit loop and shows that changing the loop works better than just trying harder.",
     "ko": "글은 습관 고리를 설명하고, 그냥 더 애쓰는 것보다 고리를 바꾸는 것이 효과적이라고 말하고 있어요."
    }
   },
   "words": [
    {
     "en": "cue",
     "ko": "신호"
    },
    {
     "en": "willpower",
     "ko": "의지력"
    },
    {
     "en": "automatic",
     "ko": "자동적인"
    }
   ],
   "summary": {
    "ko": "습관의 신호, 반복 행동, 보상을 다시 설계하면 습관을 바꿀 수 있다.",
    "en": "We can change habits by redesigning their cues, routines, and rewards.",
    "keywords": [
     "habits",
     "cues",
     "rewards"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-14",
   "genre": "info",
   "title": {
    "en": "Is the Chatbot Really Thinking?",
    "ko": "챗봇은 정말 생각할까?"
   },
   "topic": {
    "en": "AI",
    "ko": "인공지능"
   },
   "bg": {
    "en": "During World War II, Turing played a major role in breaking the German Enigma code.",
    "ko": "튜링은 제2차 세계 대전 중 독일군의 암호 \"에니그마\"를 해독하는 데 큰 역할을 했어요."
   },
   "sentences": [
    {
     "en": "In 1950, a quiet genius who had helped break secret codes in World War II published a paper with a bold first question: \"Can machines think?\"",
     "ko": "1950년, 제2차 세계 대전 때 비밀 암호 해독을 도왔던 조용한 천재가 \"기계는 생각할 수 있을까?\"라는 대담한 질문으로 시작하는 논문을 발표했다."
    },
    {
     "en": "If you chat with someone online and cannot tell whether it is a person or a computer, is the computer thinking?",
     "ko": "온라인에서 누군가와 대화하는데 그게 사람인지 컴퓨터인지 구별할 수 없다면, 그 컴퓨터는 생각하고 있는 것일까?"
    },
    {
     "en": "That genius was the British mathematician Alan Turing, and his question still matters today.",
     "ko": "그 천재는 영국의 수학자 앨런 튜링이었고, 그의 질문은 지금도 중요하다."
    },
    {
     "en": "Because \"thinking\" is hard to define, he suggested a practical test instead.",
     "ko": "\"생각\"은 정의하기 어렵기 때문에, 그는 대신 실용적인 시험을 제안했다."
    },
    {
     "en": "In what is now called the Turing test, a human judge has text conversations with both a person and a machine.",
     "ko": "지금 튜링 테스트라고 불리는 시험에서는, 사람 심사위원이 사람과 기계 모두와 글로 대화를 나눈다."
    },
    {
     "en": "If the judge cannot reliably tell which one is the machine, the machine is said to pass.",
     "ko": "심사위원이 어느 쪽이 기계인지 확실히 구별하지 못하면 기계가 통과했다고 한다."
    },
    {
     "en": "For decades, computers performed poorly at this kind of open conversation.",
     "ko": "수십 년 동안 컴퓨터는 이런 자유로운 대화를 잘하지 못했다."
    },
    {
     "en": "Today, however, AI chatbots trained on huge amounts of text can write fluent answers on almost any topic.",
     "ko": "하지만 오늘날 방대한 양의 글로 학습한 AI 챗봇은 거의 모든 주제에 대해 유창한 답을 쓸 수 있다."
    },
    {
     "en": "Some people therefore argue that machines are beginning to think.",
     "ko": "그래서 일부 사람들은 기계가 생각하기 시작했다고 주장한다."
    },
    {
     "en": "Others strongly disagree.",
     "ko": "다른 사람들은 강하게 반대한다."
    },
    {
     "en": "The philosopher John Searle described a famous thought experiment called the Chinese Room.",
     "ko": "철학자 존 설은 \"중국어 방\"이라는 유명한 사고 실험을 제시했다."
    },
    {
     "en": "Imagine a person who does not know Chinese, sitting in a room with a rule book.",
     "ko": "중국어를 모르는 사람이 규칙 책을 가지고 방 안에 앉아 있다고 상상해 보자."
    },
    {
     "en": "By following the rules, the person can answer Chinese questions correctly without understanding a single word.",
     "ko": "규칙을 따르기만 하면, 그 사람은 단어 하나 이해하지 못하면서도 중국어 질문에 올바르게 답할 수 있다."
    },
    {
     "en": "Searle argued that computers are like this person: they handle symbols but may not understand meaning.",
     "ko": "설은 컴퓨터가 이 사람과 같다고 주장했다. 기호를 다루지만 의미는 이해하지 못할 수도 있다는 것이다."
    },
    {
     "en": "As a result, passing a conversation test might show clever imitation rather than real understanding.",
     "ko": "그 결과, 대화 시험을 통과하는 것은 진짜 이해가 아니라 영리한 흉내를 보여 주는 것일 수도 있다."
    },
    {
     "en": "The debate is still open, partly because scientists do not fully understand how human thinking works either.",
     "ko": "이 논쟁은 아직 끝나지 않았는데, 부분적으로는 과학자들이 인간의 생각이 어떻게 작동하는지도 완전히 이해하지 못하기 때문이다."
    },
    {
     "en": "Perhaps the most useful lesson is this: when a machine sounds human, we should still check its facts and think for ourselves.",
     "ko": "아마 가장 유용한 교훈은 이것이다. 기계가 사람처럼 말하더라도 우리는 여전히 사실을 확인하고 스스로 생각해야 한다."
    },
    {
     "en": "After all, you will probably work alongside AI for the rest of your life.",
     "ko": "어쨌든 여러분은 아마 평생 AI와 함께 일하게 될 것이다."
    }
   ],
   "key": 14,
   "keyWhy": {
    "en": "It gives the conclusion of the debate: passing a test may only show imitation, not real understanding.",
    "ko": "시험 통과가 진짜 이해가 아니라 흉내일 수 있다는, 논쟁의 결론을 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Alan Turing built the first AI chatbot in 1950.",
      "ko": "앨런 튜링은 1950년에 최초의 AI 챗봇을 만들었다."
     },
     {
      "en": "Computers can never hold a conversation.",
      "ko": "컴퓨터는 결코 대화를 할 수 없다."
     },
     {
      "en": "Passing the Turing test may show imitation, so whether machines truly think is still debated.",
      "ko": "튜링 테스트 통과는 흉내일 수 있어서, 기계가 정말 생각하는지는 아직 논쟁 중이다."
     },
     {
      "en": "The Chinese Room proves that machines understand Chinese.",
      "ko": "중국어 방 실험은 기계가 중국어를 이해한다는 것을 증명한다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text presents both sides and ends by saying the question is still debated.",
     "ko": "글은 양쪽 주장을 소개하고 이 질문이 아직 논쟁 중이라고 마무리해요."
    }
   },
   "words": [
    {
     "en": "imitation",
     "ko": "흉내, 모방"
    },
    {
     "en": "philosopher",
     "ko": "철학자"
    },
    {
     "en": "fluent",
     "ko": "유창한"
    }
   ],
   "summary": {
    "ko": "사람처럼 말하는 기계라도 진짜로 이해하는 것은 아닐 수 있다.",
    "en": "A machine that talks like a human may still not truly understand.",
    "keywords": [
     "machine",
     "human",
     "understand"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-15",
   "genre": "info",
   "title": {
    "en": "The Road That Connected the World",
    "ko": "세계를 이은 길"
   },
   "topic": {
    "en": "History",
    "ko": "역사"
   },
   "bg": {
    "en": "The name \"Silk Road\" was first used in 1877 by the German geographer Ferdinand von Richthofen.",
    "ko": "\"실크로드\"라는 이름은 1877년 독일 지리학자 리히트호펜이 처음 사용했어요."
   },
   "sentences": [
    {
     "en": "In 1271, a seventeen-year-old from Venice named Marco Polo set out for China with his father and uncle.",
     "ko": "1271년, 베네치아 출신의 열일곱 살 마르코 폴로가 아버지, 삼촌과 함께 중국으로 길을 떠났다."
    },
    {
     "en": "The journey took them about three and a half years across deserts and mountains.",
     "ko": "사막과 산을 넘는 그 여정은 약 3년 반이 걸렸다."
    },
    {
     "en": "Long before airplanes and the internet, a web of routes connected East Asia with the Mediterranean world.",
     "ko": "비행기와 인터넷이 생기기 훨씬 전, 여러 길이 거미줄처럼 동아시아와 지중해 세계를 이었다."
    },
    {
     "en": "In the nineteenth century, a German geographer named it the Silk Road, after one of its most famous goods.",
     "ko": "19세기에 한 독일 지리학자가 가장 유명한 상품 중 하나의 이름을 따서 이것을 실크로드라고 불렀다."
    },
    {
     "en": "The name is a little misleading, however.",
     "ko": "하지만 이 이름은 조금 오해를 낳는다."
    },
    {
     "en": "It was not one road but a network of land and sea routes used for well over a thousand years.",
     "ko": "그것은 하나의 길이 아니라 천 년이 훨씬 넘게 쓰인 육로와 바닷길의 연결망이었다."
    },
    {
     "en": "Chinese silk was highly valued in Rome, and in return goods such as glass, silver, and horses moved east.",
     "ko": "중국 비단은 로마에서 매우 귀하게 여겨졌고, 그 대가로 유리, 은, 말 같은 물건이 동쪽으로 이동했다."
    },
    {
     "en": "Spices, paper, and porcelain also traveled along the routes.",
     "ko": "향신료, 종이, 도자기도 이 길을 따라 이동했다."
    },
    {
     "en": "Few traders ever made the whole journey.",
     "ko": "전체 여정을 다 간 상인은 거의 없었다."
    },
    {
     "en": "Instead, goods were passed from merchant to merchant through busy oasis cities such as Samarkand.",
     "ko": "대신 물건은 사마르칸트 같은 붐비는 오아시스 도시를 거치며 상인에서 상인으로 전해졌다."
    },
    {
     "en": "Yet the most important things carried on the Silk Road were not products at all.",
     "ko": "그런데 실크로드로 전해진 가장 중요한 것은 상품이 전혀 아니었다."
    },
    {
     "en": "Ideas, religions, and technologies traveled with the merchants.",
     "ko": "생각, 종교, 기술이 상인들과 함께 이동했다."
    },
    {
     "en": "Buddhism spread from India into China and later reached Korea and Japan.",
     "ko": "불교는 인도에서 중국으로 퍼졌고 나중에 한국과 일본에까지 전해졌다."
    },
    {
     "en": "Papermaking moved west from China, eventually helping books spread in Europe.",
     "ko": "종이 만드는 기술은 중국에서 서쪽으로 전해져 결국 유럽에서 책이 퍼지는 데 도움을 주었다."
    },
    {
     "en": "Sadly, disease traveled too; the Black Death of the fourteenth century is thought to have spread partly along these trade routes.",
     "ko": "안타깝게도 질병도 함께 이동했다. 14세기의 흑사병은 일부 이런 무역로를 따라 퍼진 것으로 여겨진다."
    },
    {
     "en": "Even ancient Korea was connected, as glass objects from distant lands have been found in Silla tombs.",
     "ko": "고대 한국도 연결되어 있었는데, 신라 무덤에서 먼 나라의 유리 물건들이 발견되었다."
    },
    {
     "en": "The Silk Road shows that exchange between cultures has always shaped human history, for better and for worse.",
     "ko": "실크로드는 문화 간 교류가 좋든 나쁘든 언제나 인류 역사를 만들어 왔다는 것을 보여 준다."
    },
    {
     "en": "In a way, it was the world's first great network, and today's global connections continue its story.",
     "ko": "어떤 의미에서 그것은 세계 최초의 거대한 연결망이었고, 오늘날의 세계적 연결은 그 이야기를 이어 가고 있다."
    },
    {
     "en": "Every time you use an app made in another country or eat food from another culture, you are walking a modern Silk Road.",
     "ko": "다른 나라에서 만든 앱을 쓰거나 다른 문화의 음식을 먹을 때마다, 여러분은 현대의 실크로드를 걷고 있는 셈이다."
    }
   ],
   "key": 16,
   "keyWhy": {
    "en": "It states the big idea that cultural exchange along the Silk Road shaped history.",
    "ko": "실크로드의 문화 교류가 역사를 만들었다는 글의 큰 생각을 말하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "The Silk Road was a single paved road from China to Rome.",
      "ko": "실크로드는 중국에서 로마까지 이어진 하나의 포장도로였다."
     },
     {
      "en": "Only silk was traded on the Silk Road.",
      "ko": "실크로드에서는 비단만 거래되었다."
     },
     {
      "en": "Most traders traveled the whole Silk Road themselves.",
      "ko": "대부분의 상인은 실크로드 전체를 직접 여행했다."
     },
     {
      "en": "The Silk Road network spread goods, ideas, and even diseases, shaping history.",
      "ko": "실크로드 연결망은 물건, 생각, 심지어 질병까지 퍼뜨리며 역사를 만들었다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text shows that goods, ideas, religions and even diseases moved along the network.",
     "ko": "글은 물건, 생각, 종교, 질병까지 이 연결망을 따라 이동했다고 설명해요."
    }
   },
   "words": [
    {
     "en": "network",
     "ko": "연결망"
    },
    {
     "en": "merchant",
     "ko": "상인"
    },
    {
     "en": "exchange",
     "ko": "교류, 교환"
    }
   ],
   "summary": {
    "ko": "실크로드는 문화 사이에 물건뿐 아니라 생각과 종교도 전했다.",
    "en": "The Silk Road carried ideas and religions as well as goods between cultures.",
    "keywords": [
     "ideas",
     "religions",
     "goods"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-16",
   "genre": "info",
   "title": {
    "en": "The Hidden Price of Every Choice",
    "ko": "모든 선택에 숨은 가격"
   },
   "topic": {
    "en": "Economy",
    "ko": "경제"
   },
   "bg": {
    "en": "In economics, money already spent that cannot be recovered is called a \"sunk cost.\"",
    "ko": "이미 써서 되돌릴 수 없는 비용을 경제학에서는 \"매몰 비용\"이라고 불러요."
   },
   "sentences": [
    {
     "en": "Every day you make hundreds of small choices, and each one quietly costs you something.",
     "ko": "우리는 매일 수백 가지 작은 선택을 하고, 그 하나하나가 조용히 무언가를 대가로 치르게 한다."
    },
    {
     "en": "Imagine you have one free Saturday afternoon before a big exam.",
     "ko": "큰 시험을 앞두고 토요일 오후 하루가 비어 있다고 상상해 보자."
    },
    {
     "en": "You could go to a movie with friends, study for a test, or earn money at a part-time job.",
     "ko": "친구들과 영화를 보러 가거나, 시험공부를 하거나, 아르바이트로 돈을 벌 수 있다."
    },
    {
     "en": "You can only choose one.",
     "ko": "하지만 하나만 고를 수 있다."
    },
    {
     "en": "Economists study exactly this kind of situation.",
     "ko": "경제학자들은 바로 이런 상황을 연구한다."
    },
    {
     "en": "The basic problem of economics is scarcity: our wants are almost unlimited, but our time, money, and resources are limited.",
     "ko": "경제학의 기본 문제는 희소성이다. 우리의 욕구는 거의 끝이 없지만 시간, 돈, 자원은 한정되어 있다."
    },
    {
     "en": "Because of scarcity, every choice has a cost.",
     "ko": "희소성 때문에 모든 선택에는 비용이 따른다."
    },
    {
     "en": "Economists call it opportunity cost, which means the value of the best option you give up.",
     "ko": "경제학자들은 이것을 기회비용이라고 부르는데, 포기한 선택지 중 가장 좋은 것의 가치를 뜻한다."
    },
    {
     "en": "If you choose the movie, your opportunity cost might be the money you could have earned at work.",
     "ko": "영화를 고른다면, 기회비용은 일해서 벌 수 있었던 돈일 수 있다."
    },
    {
     "en": "Interestingly, opportunity cost is not always measured in money.",
     "ko": "흥미롭게도 기회비용이 언제나 돈으로 측정되는 것은 아니다."
    },
    {
     "en": "If you study instead of sleeping, the cost may be tiredness the next day.",
     "ko": "잠을 자는 대신 공부한다면, 그 비용은 다음 날의 피로일 수 있다."
    },
    {
     "en": "Even something that seems free has an opportunity cost, because it still takes your time.",
     "ko": "공짜처럼 보이는 것에도 기회비용이 있는데, 여전히 시간을 쓰게 하기 때문이다."
    },
    {
     "en": "This idea also explains decisions made by countries and companies.",
     "ko": "이 생각은 국가와 기업의 결정도 설명해 준다."
    },
    {
     "en": "When a government spends more on roads, it may have less money for schools or hospitals.",
     "ko": "정부가 도로에 돈을 더 쓰면 학교나 병원에 쓸 돈이 줄어들 수 있다."
    },
    {
     "en": "However, people do not always choose like perfect calculators.",
     "ko": "하지만 사람들이 늘 완벽한 계산기처럼 선택하는 것은 아니다."
    },
    {
     "en": "Behavioral economists have shown that emotions, habits, and the way choices are presented can strongly affect our decisions.",
     "ko": "행동 경제학자들은 감정, 습관, 선택지가 제시되는 방식이 우리의 결정에 크게 영향을 줄 수 있음을 보여 주었다."
    },
    {
     "en": "For example, many people stay in a boring movie simply because they already paid for the ticket, even though that money is gone either way.",
     "ko": "예를 들어 많은 사람이 그 돈은 어차피 돌아오지 않는데도 이미 표를 샀다는 이유만으로 지루한 영화를 끝까지 본다."
    },
    {
     "en": "Thinking about opportunity cost helps us notice what we are really giving up and make wiser choices.",
     "ko": "기회비용을 생각하면 우리가 정말 무엇을 포기하는지 알아차리고 더 현명한 선택을 할 수 있다."
    },
    {
     "en": "For a high-school student, the biggest opportunity cost is often time: every hour spent on one thing is an hour not spent on something else.",
     "ko": "고등학생에게 가장 큰 기회비용은 대개 시간이다. 한 가지에 쓴 한 시간은 다른 일에 쓰지 못한 한 시간이기 때문이다."
    }
   ],
   "key": 17,
   "keyWhy": {
    "en": "It explains why opportunity cost matters: thinking about it helps us make wiser choices.",
    "ko": "기회비용을 생각하면 더 현명하게 선택할 수 있다는, 글이 말하려는 핵심이 담긴 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Economics is only about how to make money.",
      "ko": "경제학은 오직 돈을 버는 방법에 관한 학문이다."
     },
     {
      "en": "Every choice has an opportunity cost, and noticing it helps us choose more wisely.",
      "ko": "모든 선택에는 기회비용이 있고, 그것을 알아차리면 더 현명하게 선택할 수 있다."
     },
     {
      "en": "Free things have no cost at all.",
      "ko": "공짜인 것은 아무 비용도 없다."
     },
     {
      "en": "People always make perfect logical decisions.",
      "ko": "사람들은 언제나 완벽하게 논리적인 결정을 내린다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text explains that every choice has a cost and that noticing it leads to better decisions.",
     "ko": "글은 모든 선택에 비용이 있고, 그것을 알아차리면 더 나은 결정을 한다고 설명해요."
    }
   },
   "words": [
    {
     "en": "scarcity",
     "ko": "희소성"
    },
    {
     "en": "opportunity",
     "ko": "기회"
    },
    {
     "en": "limited",
     "ko": "한정된"
    }
   ],
   "summary": {
    "ko": "기회비용은 우리가 포기하는 가장 좋은 선택의 가치이다.",
    "en": "Opportunity cost is the value of the best choice we give up.",
    "keywords": [
     "opportunity",
     "cost",
     "choice"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-17",
   "genre": "info",
   "title": {
    "en": "The Tiny Partners Living Inside You",
    "ko": "내 몸속의 작은 동반자들"
   },
   "topic": {
    "en": "Biology",
    "ko": "생물"
   },
   "bg": {
    "en": "The number of bacterial cells in the human body is estimated to be roughly equal to the number of human cells.",
    "ko": "사람 몸속 세균 세포의 수는 사람 세포의 수와 비슷한 정도로 추정돼요."
   },
   "sentences": [
    {
     "en": "In September 1928, the Scottish scientist Alexander Fleming returned from a holiday and found mold growing on one of his dishes of bacteria.",
     "ko": "1928년 9월, 스코틀랜드 과학자 알렉산더 플레밍은 휴가에서 돌아와 세균을 키우던 접시 하나에 곰팡이가 자란 것을 발견했다."
    },
    {
     "en": "Around the mold, the bacteria had died, and this accident led to penicillin, the first antibiotic.",
     "ko": "곰팡이 주변의 세균은 죽어 있었고, 이 우연은 최초의 항생제인 페니실린으로 이어졌다."
    },
    {
     "en": "When you hear the word \"bacteria,\" you probably think of disease.",
     "ko": "\"세균\"이라는 말을 들으면 아마 병이 떠오를 것이다."
    },
    {
     "en": "It is true that some bacteria cause serious illnesses, such as tuberculosis and cholera.",
     "ko": "일부 세균이 결핵이나 콜레라 같은 심각한 병을 일으키는 것은 사실이다."
    },
    {
     "en": "However, the full picture is far more surprising.",
     "ko": "하지만 전체 그림은 훨씬 더 놀랍다."
    },
    {
     "en": "Bacteria are tiny single-celled living things that exist almost everywhere, from deep oceans to hot springs.",
     "ko": "세균은 깊은 바다부터 온천까지 거의 모든 곳에 사는 아주 작은 단세포 생물이다."
    },
    {
     "en": "Your own body is home to trillions of them, especially in your gut.",
     "ko": "우리 몸에도 수조 마리가 살고 있고, 특히 장에 많다."
    },
    {
     "en": "Scientists call this community the microbiome.",
     "ko": "과학자들은 이 공동체를 미생물 군집, 마이크로바이옴이라고 부른다."
    },
    {
     "en": "Most of these bacteria are harmless, and many are helpful.",
     "ko": "이 세균 대부분은 해가 없고, 많은 수가 도움이 된다."
    },
    {
     "en": "Gut bacteria help break down food we cannot digest alone, and some produce vitamins such as vitamin K.",
     "ko": "장내 세균은 우리가 혼자 소화할 수 없는 음식을 분해하는 것을 돕고, 일부는 비타민 K 같은 비타민을 만든다."
    },
    {
     "en": "They also train our immune system and take up space that harmful germs might otherwise use.",
     "ko": "또 면역 체계를 훈련시키고, 해로운 균이 차지할 수도 있는 자리를 대신 차지한다."
    },
    {
     "en": "Outside the body, bacteria are just as important.",
     "ko": "몸 밖에서도 세균은 똑같이 중요하다."
    },
    {
     "en": "They break down dead plants and animals, returning nutrients to the soil.",
     "ko": "세균은 죽은 식물과 동물을 분해해서 영양분을 흙으로 돌려보낸다."
    },
    {
     "en": "People have used them for thousands of years to make foods like yogurt, cheese, and kimchi.",
     "ko": "사람들은 수천 년 동안 요구르트, 치즈, 김치 같은 음식을 만드는 데 세균을 이용해 왔다."
    },
    {
     "en": "Here is the twist: our efforts to kill bacteria can create new problems.",
     "ko": "그런데 반전이 있다. 세균을 죽이려는 우리의 노력이 새로운 문제를 만들 수 있다."
    },
    {
     "en": "When antibiotics are overused, the few bacteria that survive can multiply and pass on their resistance.",
     "ko": "항생제를 지나치게 쓰면 살아남은 소수의 세균이 번식해 내성을 물려줄 수 있다."
    },
    {
     "en": "As a result, some infections have become much harder to treat.",
     "ko": "그 결과 일부 감염은 치료하기가 훨씬 어려워졌다."
    },
    {
     "en": "Antibiotics can also harm the helpful bacteria in our gut along with the harmful ones.",
     "ko": "항생제는 해로운 세균과 함께 장 속의 이로운 세균까지 해칠 수 있다."
    },
    {
     "en": "Therefore, doctors advise using antibiotics only when they are truly needed.",
     "ko": "그래서 의사들은 정말 필요할 때만 항생제를 쓰라고 권한다."
    },
    {
     "en": "Bacteria are neither simply friends nor foes; most are partners we cannot live without.",
     "ko": "세균은 단순히 친구도 적도 아니다. 대부분은 우리가 없이는 살 수 없는 동반자이다."
    },
    {
     "en": "Next time you eat kimchi, remember that millions of tiny partners helped make it.",
     "ko": "다음에 김치를 먹을 때는 수백만 마리의 작은 동반자가 그것을 만드는 데 도왔다는 것을 기억하자."
    }
   ],
   "key": 19,
   "keyWhy": {
    "en": "It sums up the whole text: bacteria are mostly partners, not simply friends or foes.",
    "ko": "세균은 대부분 우리의 동반자라는, 글 전체를 한마디로 정리하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "All bacteria are dangerous and should be destroyed.",
      "ko": "모든 세균은 위험하므로 없애야 한다."
     },
     {
      "en": "Bacteria live only in the human gut.",
      "ko": "세균은 사람의 장 속에만 산다."
     },
     {
      "en": "Most bacteria are helpful partners, and overusing antibiotics can cause problems.",
      "ko": "대부분의 세균은 도움이 되는 동반자이고, 항생제를 지나치게 쓰면 문제가 생길 수 있다."
     },
     {
      "en": "Antibiotics make bacteria disappear forever.",
      "ko": "항생제는 세균을 영원히 사라지게 한다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text explains how bacteria help us and warns that overusing antibiotics causes problems.",
     "ko": "글은 세균이 우리를 어떻게 돕는지 설명하고, 항생제를 지나치게 쓰면 문제가 생긴다고 경고해요."
    }
   },
   "words": [
    {
     "en": "microbiome",
     "ko": "미생물 군집"
    },
    {
     "en": "resistance",
     "ko": "내성, 저항"
    },
    {
     "en": "digest",
     "ko": "소화하다"
    }
   ],
   "summary": {
    "ko": "대부분의 세균은 우리를 도우므로 항생제를 조심해서 써야 한다.",
    "en": "Most bacteria help us, so we should use antibiotics carefully.",
    "keywords": [
     "bacteria",
     "antibiotics",
     "carefully"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-18",
   "genre": "info",
   "title": {
    "en": "Does Your Language Shape Your Mind?",
    "ko": "언어가 생각을 바꿀까?"
   },
   "topic": {
    "en": "Language",
    "ko": "언어"
   },
   "bg": {
    "en": "There are estimated to be about 7,000 languages spoken in the world today.",
    "ko": "전 세계에는 약 7,000개의 언어가 있다고 추정돼요."
   },
   "sentences": [
    {
     "en": "Imagine a five-year-old girl who can point to north without hesitation, even inside a building.",
     "ko": "건물 안에서도 망설임 없이 북쪽을 가리킬 수 있는 다섯 살 여자아이를 상상해 보자."
    },
    {
     "en": "For her, this is completely normal, because her language uses compass directions for everything.",
     "ko": "그 아이에게 이것은 아주 평범한 일인데, 그 아이의 언어는 모든 것을 동서남북으로 말하기 때문이다."
    },
    {
     "en": "Does the language you speak change the way you think?",
     "ko": "여러분이 쓰는 언어가 생각하는 방식을 바꿀까?"
    },
    {
     "en": "This question has fascinated scientists for nearly a century.",
     "ko": "이 질문은 거의 백 년 동안 과학자들을 사로잡아 왔다."
    },
    {
     "en": "In the early twentieth century, the linguist Benjamin Lee Whorf suggested that language strongly shapes thought.",
     "ko": "20세기 초 언어학자 벤저민 리 워프는 언어가 생각을 강하게 형성한다고 주장했다."
    },
    {
     "en": "In its strongest form, this idea says we cannot think about things our language has no words for.",
     "ko": "가장 강한 형태의 이 주장은 언어에 단어가 없는 것에 대해서는 생각할 수 없다고 말한다."
    },
    {
     "en": "Most researchers today reject that strong version.",
     "ko": "오늘날 대부분의 연구자들은 그 강한 주장을 받아들이지 않는다."
    },
    {
     "en": "People can learn new concepts, and translation between languages is possible.",
     "ko": "사람은 새로운 개념을 배울 수 있고, 언어 사이의 번역도 가능하기 때문이다."
    },
    {
     "en": "However, a weaker version has found real support.",
     "ko": "하지만 더 약한 형태의 주장은 실제로 근거를 얻었다."
    },
    {
     "en": "Language may not limit thought, but it can influence what we notice and remember.",
     "ko": "언어가 생각을 제한하지는 않을지라도, 우리가 무엇을 알아차리고 기억하는지에는 영향을 줄 수 있다."
    },
    {
     "en": "For example, some Aboriginal Australian communities describe locations using north, south, east, and west instead of left and right.",
     "ko": "예를 들어 일부 호주 원주민 공동체는 왼쪽, 오른쪽 대신 동서남북으로 위치를 설명한다."
    },
    {
     "en": "Speakers of these languages tend to keep track of directions remarkably well, even indoors.",
     "ko": "이 언어를 쓰는 사람들은 실내에서도 방향을 놀랍도록 잘 파악하는 경향이 있다."
    },
    {
     "en": "Russian has separate basic words for light blue and dark blue, and studies suggest Russian speakers can tell these shades apart slightly faster.",
     "ko": "러시아어에는 밝은 파랑과 어두운 파랑을 가리키는 기본 단어가 따로 있고, 연구에 따르면 러시아어 사용자는 이 색을 조금 더 빨리 구별할 수 있다."
    },
    {
     "en": "Korean offers its own example.",
     "ko": "한국어에도 나름의 예가 있다."
    },
    {
     "en": "Its system of honorifics requires speakers to pay constant attention to age and social relationships.",
     "ko": "한국어의 높임법은 말하는 사람이 나이와 사회적 관계에 늘 주의를 기울이도록 요구한다."
    },
    {
     "en": "For example, you say a polite greeting to a teacher but a short, casual one to a close friend.",
     "ko": "예를 들어 선생님께는 공손한 인사를, 친한 친구에게는 짧고 편한 인사를 한다."
    },
    {
     "en": "Even so, these effects are usually small, and scientists still debate how far they go.",
     "ko": "그렇긴 해도 이런 효과는 대개 작고, 과학자들은 그 범위가 어디까지인지 여전히 논쟁한다."
    },
    {
     "en": "What seems clear is that language is a tool that guides attention rather than a prison that traps the mind.",
     "ko": "분명해 보이는 것은 언어가 마음을 가두는 감옥이 아니라 주의를 이끄는 도구라는 점이다."
    },
    {
     "en": "Learning another language, then, can open new ways of seeing the world.",
     "ko": "그렇다면 다른 언어를 배우는 것은 세상을 보는 새로운 방법을 열어 줄 수 있다."
    },
    {
     "en": "And as a Korean student learning English, you are already doing exactly that.",
     "ko": "그리고 영어를 배우는 한국 학생인 여러분은 이미 바로 그 일을 하고 있다."
    }
   ],
   "key": 17,
   "keyWhy": {
    "en": "It states the conclusion: language guides attention but does not trap the mind.",
    "ko": "언어는 마음을 가두는 것이 아니라 주의를 이끈다는 결론을 말하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "People cannot think about anything their language has no word for.",
      "ko": "사람은 자기 언어에 단어가 없는 것은 전혀 생각할 수 없다."
     },
     {
      "en": "Language does not trap thought, but it can guide what we notice and remember.",
      "ko": "언어는 생각을 가두지 않지만, 우리가 무엇을 알아차리고 기억하는지 이끌 수 있다."
     },
     {
      "en": "All languages describe directions with left and right.",
      "ko": "모든 언어는 왼쪽과 오른쪽으로 방향을 나타낸다."
     },
     {
      "en": "Translation between languages is impossible.",
      "ko": "언어 사이의 번역은 불가능하다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text rejects the strong claim but shows real examples of language shaping what we notice.",
     "ko": "글은 강한 주장은 받아들이지 않지만, 언어가 우리가 알아차리는 것에 영향을 준 실제 예를 보여 줘요."
    }
   },
   "words": [
    {
     "en": "influence",
     "ko": "영향을 주다; 영향"
    },
    {
     "en": "honorifics",
     "ko": "높임법, 경어"
    },
    {
     "en": "attention",
     "ko": "주의, 관심"
    }
   ],
   "summary": {
    "ko": "우리가 쓰는 언어는 우리가 무엇에 주의를 기울이는지에 영향을 줄 수 있다.",
    "en": "The language we speak can influence what we pay attention to.",
    "keywords": [
     "language",
     "influence",
     "attention"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-19",
   "genre": "info",
   "title": {
    "en": "The Day Two Satellites Crashed",
    "ko": "두 위성이 충돌한 날"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Sputnik 1, launched in 1957, orbited Earth for about three months before burning up in the atmosphere.",
    "ko": "1957년 발사된 스푸트니크 1호는 약 3개월 동안 지구를 돈 뒤 대기권에서 불타 사라졌어요."
   },
   "sentences": [
    {
     "en": "On February 10, 2009, two satellites collided above Siberia: a working American satellite, Iridium 33, and a dead Russian satellite, Kosmos 2251.",
     "ko": "2009년 2월 10일, 시베리아 상공에서 작동 중이던 미국 위성 이리듐 33호와 수명이 다한 러시아 위성 코스모스 2251호가 충돌했다."
    },
    {
     "en": "The crash created more than a thousand new pieces of debris large enough to track.",
     "ko": "이 충돌로 추적할 수 있을 만큼 큰 잔해가 천 개 넘게 새로 생겼다."
    },
    {
     "en": "Look up at the night sky, and you might see a satellite moving slowly among the stars.",
     "ko": "밤하늘을 올려다보면 별들 사이로 천천히 움직이는 인공위성을 볼 수도 있다."
    },
    {
     "en": "Since the first satellite, Sputnik 1, was launched in 1957, humans have sent thousands of objects into orbit.",
     "ko": "1957년 최초의 인공위성 스푸트니크 1호가 발사된 이후, 인류는 수천 개의 물체를 궤도로 보냈다."
    },
    {
     "en": "Many of them are no longer working.",
     "ko": "그중 상당수는 더 이상 작동하지 않는다."
    },
    {
     "en": "Dead satellites, used rocket parts, and tiny fragments from collisions all remain in orbit.",
     "ko": "고장 난 위성, 다 쓴 로켓 부품, 충돌로 생긴 작은 파편들이 모두 궤도에 남아 있다."
    },
    {
     "en": "Together, they are called space junk or orbital debris.",
     "ko": "이것들을 통틀어 우주 쓰레기 또는 궤도 잔해라고 부른다."
    },
    {
     "en": "Space agencies track tens of thousands of pieces larger than a softball, but there are millions of smaller ones.",
     "ko": "우주 기관들은 소프트볼보다 큰 조각 수만 개를 추적하지만, 더 작은 조각은 수백만 개나 된다."
    },
    {
     "en": "Even a small piece is dangerous, because objects in low orbit travel at about 28,000 kilometers per hour.",
     "ko": "작은 조각조차 위험한데, 낮은 궤도의 물체는 시속 약 28,000킬로미터로 움직이기 때문이다."
    },
    {
     "en": "At that speed, a tiny fleck of paint can chip a spacecraft window.",
     "ko": "그 속도라면 작은 페인트 조각 하나도 우주선 창문에 흠집을 낼 수 있다."
    },
    {
     "en": "The International Space Station sometimes has to fire its engines to move away from approaching debris.",
     "ko": "국제 우주 정거장은 다가오는 잔해를 피하려고 가끔 엔진을 켜서 움직여야 한다."
    },
    {
     "en": "The most worrying possibility is a chain reaction.",
     "ko": "가장 걱정스러운 가능성은 연쇄 반응이다."
    },
    {
     "en": "In 1978, NASA scientist Donald Kessler warned that one collision could create debris that causes more collisions, and so on.",
     "ko": "1978년 NASA 과학자 도널드 케슬러는 한 번의 충돌이 잔해를 만들고 그것이 또 다른 충돌을 일으키는 일이 계속될 수 있다고 경고했다."
    },
    {
     "en": "This scenario, now called the Kessler syndrome, could make some orbits too dangerous to use for many years.",
     "ko": "지금 케슬러 신드롬이라 불리는 이 시나리오는 일부 궤도를 오랫동안 쓰기 너무 위험하게 만들 수 있다."
    },
    {
     "en": "Since we depend on satellites for GPS, weather forecasts, and communication, the stakes are high.",
     "ko": "우리는 GPS, 일기 예보, 통신을 위성에 의존하기 때문에 걸린 것이 크다."
    },
    {
     "en": "Solutions are being tested.",
     "ko": "해결책들이 시험되고 있다."
    },
    {
     "en": "New rules ask companies to bring old satellites down so they burn up in the atmosphere.",
     "ko": "새 규칙은 기업이 오래된 위성을 끌어내려 대기에서 타 없어지게 하도록 요구한다."
    },
    {
     "en": "Engineers are also designing missions to capture debris with nets, magnets, or robotic arms.",
     "ko": "공학자들은 그물, 자석, 로봇 팔로 잔해를 붙잡는 임무도 설계하고 있다."
    },
    {
     "en": "Space feels endless, but the area around Earth is a shared resource that we must keep clean.",
     "ko": "우주는 끝없이 느껴지지만, 지구 주변 공간은 우리가 깨끗하게 지켜야 할 공동 자원이다."
    }
   ],
   "key": 18,
   "keyWhy": {
    "en": "It gives the final message: the space around Earth is a shared resource we must keep clean.",
    "ko": "지구 주변 우주는 깨끗하게 지켜야 할 공동 자원이라는 마지막 메시지를 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Space junk is harmless because space is so large.",
      "ko": "우주는 너무 넓어서 우주 쓰레기는 해가 없다."
     },
     {
      "en": "Only big satellites can damage spacecraft.",
      "ko": "큰 위성만이 우주선을 손상시킬 수 있다."
     },
     {
      "en": "Growing space junk threatens satellites we depend on, so we must reduce and remove it.",
      "ko": "늘어나는 우주 쓰레기는 우리가 의존하는 위성을 위협하므로, 줄이고 치워야 한다."
     },
     {
      "en": "The International Space Station collects space junk every day.",
      "ko": "국제 우주 정거장은 매일 우주 쓰레기를 모은다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text explains how space junk grows, why it is dangerous, and how people are trying to remove it.",
     "ko": "글은 우주 쓰레기가 어떻게 늘어나는지, 왜 위험한지, 어떻게 치우려 하는지 설명해요."
    }
   },
   "words": [
    {
     "en": "debris",
     "ko": "잔해, 파편"
    },
    {
     "en": "collision",
     "ko": "충돌"
    },
    {
     "en": "orbit",
     "ko": "궤도"
    }
   ],
   "summary": {
    "ko": "우주 쓰레기는 위험하므로 궤도를 청소할 규칙과 새로운 기술이 필요하다.",
    "en": "Space junk is dangerous, so we need rules and new technology to clean up orbit.",
    "keywords": [
     "junk",
     "dangerous",
     "orbit"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-20",
   "genre": "info",
   "title": {
    "en": "The Real Price of Your Coffee",
    "ko": "커피 한 잔의 진짜 가격"
   },
   "topic": {
    "en": "Society",
    "ko": "사회"
   },
   "bg": {
    "en": "Coffee beans are actually the roasted seeds inside the coffee plant's red fruit.",
    "ko": "우리가 마시는 커피 원두는 사실 커피나무의 빨간 열매 속 씨앗을 볶은 거예요."
   },
   "sentences": [
    {
     "en": "Legend says that a goat herder in Ethiopia discovered coffee after his goats began dancing with energy.",
     "ko": "전설에 따르면 에티오피아의 한 염소지기가 염소들이 힘이 넘쳐 춤추기 시작한 것을 보고 커피를 발견했다고 한다."
    },
    {
     "en": "Whether or not that story is true, coffee is now one of the most popular drinks in the world, with billions of cups enjoyed every day.",
     "ko": "그 이야기가 사실이든 아니든, 커피는 이제 세계에서 가장 인기 있는 음료 중 하나로 매일 수십억 잔이 소비된다."
    },
    {
     "en": "Yet many of the farmers who grow coffee earn very little.",
     "ko": "그런데 커피를 재배하는 농부 중 상당수는 아주 적은 돈을 번다."
    },
    {
     "en": "Most coffee is grown by small farmers in countries such as Ethiopia, Colombia, and Vietnam.",
     "ko": "커피 대부분은 에티오피아, 콜롬비아, 베트남 같은 나라의 소규모 농부들이 재배한다."
    },
    {
     "en": "The price they receive often depends on world markets, which can rise and fall sharply from year to year.",
     "ko": "그들이 받는 가격은 대개 세계 시장에 달려 있는데, 시장 가격은 해마다 크게 오르내릴 수 있다."
    },
    {
     "en": "When prices fall, some farmers cannot even cover the cost of growing their beans.",
     "ko": "가격이 떨어지면 일부 농부는 원두를 재배하는 비용조차 감당하지 못한다."
    },
    {
     "en": "Fair trade was created to address this problem.",
     "ko": "공정 무역은 이 문제를 해결하려고 만들어졌다."
    },
    {
     "en": "Under fair trade certification, buyers agree to pay farmer groups at least a minimum price, even when market prices drop.",
     "ko": "공정 무역 인증 아래에서 구매자는 시장 가격이 떨어져도 농민 단체에 최소한의 가격 이상을 지불하기로 약속한다."
    },
    {
     "en": "They also pay an extra amount called a premium, which communities can spend on schools, clean water, or better equipment.",
     "ko": "또 프리미엄이라는 추가 금액을 내는데, 공동체는 이 돈을 학교, 깨끗한 물, 더 나은 장비에 쓸 수 있다."
    },
    {
     "en": "In addition, fair trade rules include standards against child labor and for environmental protection.",
     "ko": "게다가 공정 무역 규칙에는 아동 노동을 막고 환경을 보호하기 위한 기준이 포함된다."
    },
    {
     "en": "However, fair trade is not a perfect solution.",
     "ko": "하지만 공정 무역이 완벽한 해결책은 아니다."
    },
    {
     "en": "Some critics point out that certification costs money, which the poorest farmers may not be able to afford.",
     "ko": "일부 비판자들은 인증에 돈이 들어서 가장 가난한 농부들은 감당하지 못할 수 있다고 지적한다."
    },
    {
     "en": "Others note that farmers often sell only part of their harvest at fair trade prices, because demand for certified coffee is limited.",
     "ko": "또 다른 사람들은 인증 커피의 수요가 한정되어 있어서 농부들이 수확의 일부만 공정 무역 가격으로 판다고 말한다."
    },
    {
     "en": "Researchers have found mixed results about how much it improves farmers' incomes.",
     "ko": "연구자들은 공정 무역이 농부의 소득을 얼마나 높이는지에 대해 엇갈린 결과를 얻었다."
    },
    {
     "en": "Even so, fair trade has made many consumers think about where their products come from.",
     "ko": "그렇더라도 공정 무역은 많은 소비자가 자신이 사는 물건이 어디서 오는지 생각하게 만들었다."
    },
    {
     "en": "Some coffee companies now also buy directly from farmers and share the details of their prices.",
     "ko": "이제 일부 커피 회사는 농부에게서 직접 사고 가격 정보를 공개하기도 한다."
    },
    {
     "en": "Fair trade is not the whole answer, but it shows that our everyday choices as consumers are connected to the lives of people far away.",
     "ko": "공정 무역이 정답의 전부는 아니지만, 소비자로서 우리의 일상적인 선택이 멀리 있는 사람들의 삶과 연결되어 있음을 보여 준다."
    }
   ],
   "key": 16,
   "keyWhy": {
    "en": "It sums up the text: fair trade is not the whole answer, but it links consumers to faraway farmers.",
    "ko": "공정 무역이 정답의 전부는 아니지만 소비자와 먼 곳의 농부를 이어 준다는 글의 요지를 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Coffee farmers are all very rich.",
      "ko": "커피 농부들은 모두 아주 부유하다."
     },
     {
      "en": "Fair trade has completely solved poverty among farmers.",
      "ko": "공정 무역은 농부들의 가난을 완전히 해결했다."
     },
     {
      "en": "Coffee prices never change.",
      "ko": "커피 가격은 절대 변하지 않는다."
     },
     {
      "en": "Fair trade helps coffee farmers in some ways but has limits, and it links consumers to producers.",
      "ko": "공정 무역은 어떤 면에서 커피 농부를 돕지만 한계가 있고, 소비자와 생산자를 이어 준다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text explains how fair trade helps farmers and also describes its limits.",
     "ko": "글은 공정 무역이 농부를 돕는 방법과 그 한계를 함께 설명해요."
    }
   },
   "words": [
    {
     "en": "certification",
     "ko": "인증"
    },
    {
     "en": "premium",
     "ko": "프리미엄, 추가 금액"
    },
    {
     "en": "consumers",
     "ko": "소비자들"
    }
   ],
   "summary": {
    "ko": "공정 무역은 한계가 있지만 커피 농부에게 더 공정한 가격을 주려고 한다.",
    "en": "Fair trade tries to give coffee farmers a fairer price, though it has limits.",
    "keywords": [
     "fair",
     "farmers",
     "price"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-21",
   "genre": "info",
   "title": {
    "en": "Your Brain's Night Shift",
    "ko": "뇌의 야간 근무"
   },
   "topic": {
    "en": "Psychology",
    "ko": "심리"
   },
   "bg": {
    "en": "Newborn babies sleep about 14 to 17 hours a day.",
    "ko": "갓 태어난 아기는 하루에 약 14~17시간을 자요."
   },
   "sentences": [
    {
     "en": "Have you ever studied all night for a test, only to forget the answers the next morning?",
     "ko": "시험 때문에 밤새 공부했는데, 다음 날 아침에 답이 기억나지 않았던 적이 있는가?"
    },
    {
     "en": "Many students believe that sleep is wasted time, but scientists now see it as an active part of learning.",
     "ko": "많은 학생이 잠을 버리는 시간이라고 생각하지만, 과학자들은 이제 잠을 학습의 적극적인 한 부분으로 본다."
    },
    {
     "en": "While we sleep, the brain does not simply switch off.",
     "ko": "우리가 자는 동안 뇌는 그냥 꺼지지 않는다."
    },
    {
     "en": "Instead, it works through the information we collected during the day.",
     "ko": "대신 낮에 모은 정보를 하나하나 정리한다."
    },
    {
     "en": "This process is called memory consolidation, which means turning fragile new memories into stable, long-lasting ones.",
     "ko": "이 과정을 기억 응고화라고 하는데, 쉽게 사라지는 새 기억을 안정적이고 오래가는 기억으로 바꾸는 일이다."
    },
    {
     "en": "A small part of the brain called the hippocampus stores new experiences for a short time.",
     "ko": "해마라는 뇌의 작은 부분이 새로운 경험을 잠깐 동안 저장한다."
    },
    {
     "en": "During deep sleep, it appears to replay these experiences and send them to the cortex, the brain's outer layer, for long-term storage.",
     "ko": "깊은 잠을 자는 동안 해마는 이 경험을 다시 재생해서, 오래 저장하도록 뇌의 바깥층인 대뇌 피질로 보내는 것으로 보인다."
    },
    {
     "en": "Later, during REM sleep, when most vivid dreams happen, the brain seems to connect new information with what it already knows.",
     "ko": "그 뒤 생생한 꿈을 주로 꾸는 렘수면 동안, 뇌는 새로운 정보를 이미 알고 있는 것과 연결하는 것 같다."
    },
    {
     "en": "As a result, people often solve problems more easily after a good night's sleep.",
     "ko": "그 결과, 사람들은 푹 자고 나면 문제를 더 쉽게 푸는 경우가 많다."
    },
    {
     "en": "Experiments have repeatedly shown that people who sleep after learning remember more than those who stay awake for the same time.",
     "ko": "배운 뒤에 잠을 잔 사람이 같은 시간 동안 깨어 있던 사람보다 더 많이 기억한다는 것이 실험으로 여러 번 확인되었다."
    },
    {
     "en": "However, sleep is not a magic shortcut.",
     "ko": "하지만 잠은 마법 같은 지름길이 아니다."
    },
    {
     "en": "It strengthens memories that were formed through real effort, but it cannot create knowledge that was never studied.",
     "ko": "잠은 실제로 노력해서 만든 기억을 튼튼하게 해 주지만, 공부하지 않은 지식을 만들어 주지는 못한다."
    },
    {
     "en": "In addition, timing matters, since sleeping soon after learning tends to help more than sleeping much later.",
     "ko": "또 타이밍도 중요하다. 배운 직후에 자는 것이 한참 뒤에 자는 것보다 더 도움이 되는 경향이 있기 때문이다."
    },
    {
     "en": "Teenagers face a special challenge here.",
     "ko": "십 대는 여기서 특별한 어려움을 겪는다."
    },
    {
     "en": "Their body clocks naturally shift later during adolescence, so many feel wide awake at midnight but exhausted at seven in the morning.",
     "ko": "사춘기에는 생체 시계가 자연스럽게 늦춰져서, 많은 십 대가 자정에는 말똥말똥하지만 아침 7시에는 몹시 피곤하다."
    },
    {
     "en": "Health experts generally recommend about eight to ten hours of sleep a night for teenagers, yet many get far less.",
     "ko": "건강 전문가들은 보통 십 대에게 하룻밤 약 8~10시간의 잠을 권하지만, 많은 학생이 그보다 훨씬 적게 잔다."
    },
    {
     "en": "Late-night screens can make this worse by delaying sleepiness.",
     "ko": "밤늦게 보는 화면은 졸음이 오는 것을 늦춰서 문제를 더 키울 수 있다."
    },
    {
     "en": "Therefore, the smartest study plan includes both focused review and enough sleep.",
     "ko": "그러므로 가장 현명한 공부 계획에는 집중해서 복습하는 시간과 충분한 잠이 둘 다 들어간다."
    },
    {
     "en": "Sleep is not the opposite of studying; it is the final step of learning.",
     "ko": "잠은 공부의 반대가 아니라, 배움의 마지막 단계이다."
    }
   ],
   "key": 18,
   "keyWhy": {
    "en": "It states the main point: sleep is not the opposite of studying but the last step of learning.",
    "ko": "잠은 공부의 반대가 아니라 배움의 마지막 단계라는 핵심을 말하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Sleep helps the brain turn new learning into lasting memories.",
      "ko": "잠은 뇌가 새로 배운 것을 오래가는 기억으로 바꾸도록 돕는다."
     },
     {
      "en": "Studying all night is the best way to prepare for a test.",
      "ko": "밤새 공부하는 것이 시험을 준비하는 가장 좋은 방법이다."
     },
     {
      "en": "The brain is active during sleep only when we dream.",
      "ko": "뇌는 꿈을 꿀 때만 잠 속에서 활동한다."
     },
     {
      "en": "Teenagers need less sleep than adults.",
      "ko": "십 대는 어른보다 잠이 덜 필요하다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains how the sleeping brain turns new learning into lasting memories.",
     "ko": "글은 잠자는 뇌가 새로 배운 것을 오래가는 기억으로 바꾸는 과정을 설명해요."
    }
   },
   "words": [
    {
     "en": "consolidation",
     "ko": "응고화, 굳히기"
    },
    {
     "en": "hippocampus",
     "ko": "해마"
    },
    {
     "en": "adolescence",
     "ko": "사춘기, 청소년기"
    }
   ],
   "summary": {
    "ko": "공부한 뒤 충분히 자면 배운 것을 더 잘 기억할 수 있다.",
    "en": "Getting enough sleep after studying helps us remember what we learned.",
    "keywords": [
     "sleep",
     "studying",
     "remember"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-22",
   "genre": "info",
   "title": {
    "en": "Editing the Code of Life",
    "ko": "생명의 설계도를 고치다"
   },
   "topic": {
    "en": "Biology",
    "ko": "생물"
   },
   "bg": {
    "en": "Human and chimpanzee DNA is about 98-99 percent the same.",
    "ko": "사람과 침팬지의 DNA는 약 98~99%가 같아요."
   },
   "sentences": [
    {
     "en": "Imagine being able to fix a spelling mistake in the instructions that build a living thing.",
     "ko": "생명체를 만드는 설명서에서 틀린 철자 하나를 고칠 수 있다고 상상해 보자."
    },
    {
     "en": "That is roughly what gene editing allows scientists to do.",
     "ko": "유전자 편집은 대략 그런 일을 과학자들이 할 수 있게 해 준다."
    },
    {
     "en": "Every living cell contains DNA, a long molecule that carries the genetic code for how the organism grows and works.",
     "ko": "모든 살아 있는 세포에는 DNA가 들어 있는데, 생물이 어떻게 자라고 움직이는지에 대한 유전 정보를 담은 긴 분자이다."
    },
    {
     "en": "Sometimes a tiny error in this code causes serious diseases.",
     "ko": "때로는 이 정보 속 아주 작은 오류가 심각한 병을 일으킨다."
    },
    {
     "en": "In 2012, researchers including Jennifer Doudna and Emmanuelle Charpentier showed how a tool called CRISPR-Cas9 could cut DNA at a chosen spot.",
     "ko": "2012년, 제니퍼 다우드나와 에마뉘엘 샤르팡티에를 포함한 연구자들은 크리스퍼-캐스9이라는 도구로 DNA의 원하는 위치를 자를 수 있다는 것을 보여 주었다."
    },
    {
     "en": "The idea came from bacteria, which use CRISPR to recognize and destroy viruses.",
     "ko": "이 아이디어는 크리스퍼로 바이러스를 알아보고 파괴하는 세균에게서 나왔다."
    },
    {
     "en": "Compared with older methods, CRISPR is faster, cheaper, and far more precise.",
     "ko": "예전 방법에 비해 크리스퍼는 더 빠르고, 더 싸고, 훨씬 더 정확하다."
    },
    {
     "en": "For their work, Doudna and Charpentier received the Nobel Prize in Chemistry in 2020.",
     "ko": "이 연구로 다우드나와 샤르팡티에는 2020년 노벨 화학상을 받았다."
    },
    {
     "en": "Since then, the technology has been used to develop crops that resist disease and to study illnesses in the lab.",
     "ko": "그 뒤로 이 기술은 병에 강한 농작물을 만들고 실험실에서 질병을 연구하는 데 쓰여 왔다."
    },
    {
     "en": "In 2023, the first CRISPR-based treatment for sickle cell disease, a painful blood disorder, was approved in the United Kingdom and the United States.",
     "ko": "2023년에는 고통스러운 혈액 질환인 겸상 적혈구병을 치료하는 첫 크리스퍼 치료법이 영국과 미국에서 승인되었다."
    },
    {
     "en": "However, gene editing also raises difficult questions.",
     "ko": "하지만 유전자 편집은 어려운 질문도 던진다."
    },
    {
     "en": "Cuts in the wrong place, known as off-target effects, could cause new health problems.",
     "ko": "엉뚱한 곳을 자르는 것을 표적 이탈 효과라고 하는데, 이것이 새로운 건강 문제를 일으킬 수 있다."
    },
    {
     "en": "The biggest debate concerns editing human embryos, because those changes would be passed on to future generations.",
     "ko": "가장 큰 논쟁은 사람 배아를 편집하는 문제이다. 그 변화가 다음 세대로 그대로 전해지기 때문이다."
    },
    {
     "en": "In 2018, a scientist in China announced that he had edited the genes of twin babies, and researchers around the world strongly criticized the experiment.",
     "ko": "2018년 중국의 한 과학자가 쌍둥이 아기의 유전자를 편집했다고 발표했고, 전 세계 연구자들이 이 실험을 강하게 비판했다."
    },
    {
     "en": "He was later sentenced to prison.",
     "ko": "그 과학자는 나중에 징역형을 선고받았다."
    },
    {
     "en": "Critics also worry that expensive treatments could be available only to the rich, or that people might try to design 'perfect' children.",
     "ko": "비판하는 사람들은 비싼 치료가 부자들만의 것이 되거나, 사람들이 \"완벽한\" 아이를 설계하려 할까 봐 걱정하기도 한다."
    },
    {
     "en": "Therefore, many countries strictly limit or ban changes to human embryos.",
     "ko": "그래서 많은 나라가 사람 배아를 바꾸는 것을 엄격하게 제한하거나 금지한다."
    },
    {
     "en": "Gene editing is a powerful tool that could cure diseases, but it must be used carefully and with clear ethical rules.",
     "ko": "유전자 편집은 병을 고칠 수 있는 강력한 도구이지만, 분명한 윤리 규칙에 따라 신중하게 써야 한다."
    }
   ],
   "key": 17,
   "keyWhy": {
    "en": "It gives the conclusion: gene editing is powerful but must be used carefully with ethical rules.",
    "ko": "유전자 편집은 강력하지만 윤리 규칙에 따라 신중하게 써야 한다는 결론을 말하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "CRISPR was invented to destroy viruses in people.",
      "ko": "크리스퍼는 사람 몸속 바이러스를 없애려고 발명되었다."
     },
     {
      "en": "Gene editing can cure diseases, but it needs careful ethical limits.",
      "ko": "유전자 편집은 병을 고칠 수 있지만 신중한 윤리적 한계가 필요하다."
     },
     {
      "en": "Most countries allow scientists to design perfect children.",
      "ko": "대부분의 나라가 과학자들이 완벽한 아이를 설계하도록 허락한다."
     },
     {
      "en": "Gene editing has no risks because it is very precise.",
      "ko": "유전자 편집은 아주 정확해서 위험이 전혀 없다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text shows what CRISPR can do and then explains the risks and ethical debates.",
     "ko": "글은 크리스퍼로 할 수 있는 일을 보여 준 뒤, 위험과 윤리적 논쟁을 설명해요."
    }
   },
   "words": [
    {
     "en": "molecule",
     "ko": "분자"
    },
    {
     "en": "precise",
     "ko": "정확한"
    },
    {
     "en": "embryos",
     "ko": "배아들"
    }
   ],
   "summary": {
    "ko": "유전자 편집은 강력하기 때문에 안전하게 쓰려면 분명한 규칙이 필요하다.",
    "en": "Gene editing is powerful, so we need clear rules to use it safely.",
    "keywords": [
     "gene",
     "editing",
     "rules"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-23",
   "genre": "info",
   "title": {
    "en": "The Comeback of the Electric Car",
    "ko": "전기차의 귀환"
   },
   "topic": {
    "en": "Technology",
    "ko": "기술"
   },
   "bg": {
    "en": "Around 1900, about a third of the cars on American roads were electric.",
    "ko": "1900년 무렵 미국 도로를 달린 자동차의 약 3분의 1이 전기차였어요."
   },
   "sentences": [
    {
     "en": "Electric cars may look like a brand-new invention, but the idea is older than most people think.",
     "ko": "전기차는 아주 새로운 발명품처럼 보이지만, 그 아이디어는 사람들이 생각하는 것보다 오래되었다."
    },
    {
     "en": "In the late 1800s and early 1900s, electric cars were popular in cities because they were quiet, clean, and easy to drive.",
     "ko": "1800년대 후반과 1900년대 초, 전기차는 조용하고 깨끗하고 운전하기 쉬워서 도시에서 인기가 많았다."
    },
    {
     "en": "However, cheap oil and mass-produced gasoline cars soon pushed them off the road.",
     "ko": "하지만 값싼 석유와 대량 생산된 휘발유 차 때문에 전기차는 곧 도로에서 밀려났다."
    },
    {
     "en": "Today, they are making a dramatic comeback.",
     "ko": "오늘날 전기차는 극적으로 돌아오고 있다."
    },
    {
     "en": "An electric vehicle, or EV, uses a large battery and an electric motor instead of an engine that burns fuel.",
     "ko": "전기 자동차, 즉 EV는 연료를 태우는 엔진 대신 큰 배터리와 전기 모터를 쓴다."
    },
    {
     "en": "Because EVs produce no exhaust while driving, they can improve air quality in crowded cities.",
     "ko": "전기차는 달리는 동안 배기가스를 내뿜지 않아서 붐비는 도시의 공기를 깨끗하게 할 수 있다."
    },
    {
     "en": "They can also be cheaper to run, since electricity often costs less than gasoline for the same distance.",
     "ko": "같은 거리를 갈 때 전기가 휘발유보다 싼 경우가 많아서 유지비도 더 적게 들 수 있다."
    },
    {
     "en": "Lithium-ion batteries became much cheaper over the past decade, which made longer driving ranges possible.",
     "ko": "리튬 이온 배터리 값이 지난 10여 년 동안 크게 내려가서 한 번 충전으로 더 멀리 갈 수 있게 되었다."
    },
    {
     "en": "Many governments have also offered subsidies and set future limits on new gasoline car sales.",
     "ko": "많은 정부가 보조금을 주고, 앞으로 새 휘발유 차 판매를 제한하겠다는 계획도 세웠다."
    },
    {
     "en": "As a result, global EV sales rose quickly, and Korean companies became major producers of both cars and batteries.",
     "ko": "그 결과 세계 전기차 판매가 빠르게 늘었고, 한국 기업들은 자동차와 배터리 모두에서 주요 생산자가 되었다."
    },
    {
     "en": "Still, electric cars are not a perfect solution.",
     "ko": "그래도 전기차가 완벽한 해결책은 아니다."
    },
    {
     "en": "Their environmental benefit depends on how the electricity is produced, and power from coal is far less clean than power from solar or wind.",
     "ko": "환경에 주는 이점은 전기를 어떻게 만드느냐에 달려 있는데, 석탄으로 만든 전기는 태양광이나 풍력으로 만든 전기보다 훨씬 덜 깨끗하다."
    },
    {
     "en": "Making batteries requires mining materials such as lithium, cobalt, and nickel, which can harm the environment and workers.",
     "ko": "배터리를 만들려면 리튬, 코발트, 니켈 같은 광물을 캐야 하는데, 이 과정이 환경과 노동자에게 해를 끼칠 수 있다."
    },
    {
     "en": "Drivers also worry about charging time and the number of charging stations.",
     "ko": "운전자들은 충전 시간과 충전소 수도 걱정한다."
    },
    {
     "en": "Engineers are working on these problems by developing new battery types, recycling old batteries, and building faster chargers.",
     "ko": "엔지니어들은 새로운 배터리를 개발하고, 낡은 배터리를 재활용하고, 더 빠른 충전기를 만들면서 이 문제를 해결하고 있다."
    },
    {
     "en": "Therefore, the future of transportation will depend on more than just cars.",
     "ko": "그러므로 교통의 미래는 자동차만으로 정해지지 않을 것이다."
    },
    {
     "en": "Cleaner electricity, better public transport, and walkable cities all play a part.",
     "ko": "더 깨끗한 전기, 더 나은 대중교통, 걷기 좋은 도시가 모두 함께 역할을 한다."
    },
    {
     "en": "Electric cars are an important step toward cleaner transport, but they work best as part of a bigger plan.",
     "ko": "전기차는 더 깨끗한 교통으로 가는 중요한 한 걸음이지만, 더 큰 계획의 일부일 때 가장 효과가 크다."
    }
   ],
   "key": 17,
   "keyWhy": {
    "en": "It states the main idea: electric cars help, but they work best as part of a bigger plan.",
    "ko": "전기차는 도움이 되지만 더 큰 계획의 일부일 때 가장 효과적이라는 핵심을 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Electric cars were invented in the last ten years.",
      "ko": "전기차는 최근 10년 안에 발명되었다."
     },
     {
      "en": "Electric cars always cause more pollution than gasoline cars.",
      "ko": "전기차는 언제나 휘발유 차보다 오염을 더 많이 일으킨다."
     },
     {
      "en": "Charging stations are the only problem with electric cars.",
      "ko": "충전소가 전기차의 유일한 문제이다."
     },
     {
      "en": "Electric cars help reduce pollution, but they are only one part of cleaner transport.",
      "ko": "전기차는 오염을 줄이는 데 도움이 되지만, 깨끗한 교통의 한 부분일 뿐이다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text describes the benefits of electric cars and also their limits.",
     "ko": "글은 전기차의 장점과 함께 한계도 설명해요."
    }
   },
   "words": [
    {
     "en": "exhaust",
     "ko": "배기가스"
    },
    {
     "en": "subsidies",
     "ko": "보조금"
    },
    {
     "en": "batteries",
     "ko": "배터리"
    }
   ],
   "summary": {
    "ko": "전기차는 좋은 출발이지만, 깨끗한 에너지도 함께 필요하다.",
    "en": "Electric cars are a good step, but we also need clean energy.",
    "keywords": [
     "electric",
     "cars",
     "energy"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-24",
   "genre": "info",
   "title": {
    "en": "A World Without Bees?",
    "ko": "벌이 사라진 세상?"
   },
   "topic": {
    "en": "Environment",
    "ko": "환경"
   },
   "bg": {
    "en": "There are about 20,000 known species of bees in the world.",
    "ko": "세계에는 알려진 벌만 약 2만 종이 있어요."
   },
   "sentences": [
    {
     "en": "Take a bite of an apple, an almond, or a strawberry, and you can thank an insect.",
     "ko": "사과나 아몬드, 딸기를 한 입 먹을 때 곤충에게 고마워해도 좋다."
    },
    {
     "en": "Many of the foods we enjoy depend on pollination.",
     "ko": "우리가 즐겨 먹는 음식 중 상당수는 꽃가루받이에 기대고 있기 때문이다."
    },
    {
     "en": "Imagine walking into a supermarket where most of the fruit, nuts, and colorful vegetables have disappeared.",
     "ko": "과일과 견과류, 알록달록한 채소가 대부분 사라진 마트에 들어가는 모습을 상상해 보자."
    },
    {
     "en": "Pollination is the movement of pollen from one flower to another, which allows plants to produce fruit and seeds.",
     "ko": "꽃가루받이는 꽃가루가 한 꽃에서 다른 꽃으로 옮겨 가는 것으로, 이 덕분에 식물이 열매와 씨앗을 맺는다."
    },
    {
     "en": "Some plants, such as wheat and rice, are pollinated mainly by the wind.",
     "ko": "밀이나 벼 같은 일부 식물은 주로 바람으로 꽃가루받이를 한다."
    },
    {
     "en": "However, many fruits, nuts, and vegetables rely on animals, especially bees.",
     "ko": "하지만 많은 과일, 견과류, 채소는 동물, 특히 벌에 의존한다."
    },
    {
     "en": "As bees collect nectar for food, pollen sticks to their hairy bodies and travels to the next flower.",
     "ko": "벌이 먹이로 꿀을 모으는 동안 꽃가루가 털이 많은 몸에 붙어 다음 꽃으로 옮겨 간다."
    },
    {
     "en": "Scientists estimate that about three out of four of the world's leading food crops benefit at least partly from animal pollination.",
     "ko": "과학자들은 세계 주요 식량 작물 네 가지 중 약 세 가지가 적어도 일부는 동물의 꽃가루받이 덕을 본다고 추정한다."
    },
    {
     "en": "In California, for example, huge numbers of honeybee hives are trucked into almond orchards every spring.",
     "ko": "예를 들어 미국 캘리포니아에서는 해마다 봄이면 엄청난 수의 꿀벌 통이 트럭에 실려 아몬드 과수원으로 옮겨진다."
    },
    {
     "en": "Without them, the harvest would be much smaller.",
     "ko": "꿀벌이 없다면 수확량은 훨씬 줄어들 것이다."
    },
    {
     "en": "Unfortunately, bees face serious threats.",
     "ko": "안타깝게도 벌은 심각한 위협을 받고 있다."
    },
    {
     "en": "Beekeepers in many countries have reported large losses of colonies in recent decades.",
     "ko": "최근 수십 년 동안 여러 나라의 양봉가들이 벌 군집을 대규모로 잃었다고 보고했다."
    },
    {
     "en": "Scientists point to several causes working together, including the loss of wild flowers, certain pesticides, parasites like the varroa mite, diseases, and climate change.",
     "ko": "과학자들은 야생화 감소, 일부 농약, 바로아 응애 같은 기생충, 질병, 기후 변화 등 여러 원인이 함께 작용한다고 본다."
    },
    {
     "en": "Interestingly, honeybees are only part of the story.",
     "ko": "흥미롭게도 꿀벌은 이야기의 일부일 뿐이다."
    },
    {
     "en": "Thousands of species of wild bees, along with butterflies, flies, and other insects, also pollinate crops, and some are even more efficient than honeybees.",
     "ko": "수천 종의 야생벌과 나비, 파리 같은 곤충도 작물의 꽃가루받이를 하는데, 어떤 종은 꿀벌보다 더 효율적이다."
    },
    {
     "en": "Many of these wild species are declining too.",
     "ko": "이 야생종들 중 상당수도 줄어들고 있다."
    },
    {
     "en": "Fortunately, there are ways to help.",
     "ko": "다행히 도울 방법이 있다."
    },
    {
     "en": "Farmers can plant flower strips beside fields and reduce harmful pesticides, cities can grow native plants in parks, and even students can plant flowers at school or on a balcony.",
     "ko": "농부들은 밭 가장자리에 꽃길을 심고 해로운 농약을 줄일 수 있고, 도시는 공원에 토종 식물을 심을 수 있으며, 학생들도 학교나 베란다에 꽃을 심을 수 있다."
    },
    {
     "en": "Protecting bees is not only about saving insects; it is about protecting the food on our tables.",
     "ko": "벌을 지키는 일은 곤충을 살리는 것만이 아니라, 우리 식탁의 음식을 지키는 일이다."
    }
   ],
   "key": 18,
   "keyWhy": {
    "en": "It states the main message: protecting bees means protecting the food on our tables.",
    "ko": "벌을 지키는 것이 곧 우리 식탁의 음식을 지키는 일이라는 핵심 메시지를 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Bees are vital for many food crops, so we need to protect them.",
      "ko": "벌은 많은 식량 작물에 꼭 필요하니 벌을 지켜야 한다."
     },
     {
      "en": "Wheat and rice depend completely on bees.",
      "ko": "밀과 벼는 전적으로 벌에 의존한다."
     },
     {
      "en": "Pesticides are the only reason bees are disappearing.",
      "ko": "농약이 벌이 사라지는 유일한 이유이다."
     },
     {
      "en": "Only honeybees can pollinate plants.",
      "ko": "꿀벌만 식물의 꽃가루받이를 할 수 있다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains how much our food depends on bees and how we can protect them.",
     "ko": "글은 우리 음식이 벌에 얼마나 의존하는지, 그리고 벌을 어떻게 지킬 수 있는지 설명해요."
    }
   },
   "words": [
    {
     "en": "pollination",
     "ko": "꽃가루받이, 수분"
    },
    {
     "en": "pesticides",
     "ko": "농약, 살충제"
    },
    {
     "en": "species",
     "ko": "종(種)"
    }
   ],
   "summary": {
    "ko": "벌은 많은 작물이 자라도록 도우니, 벌을 지키면 우리의 음식도 지킬 수 있다.",
    "en": "Bees help many crops grow, so protecting them protects our food.",
    "keywords": [
     "bees",
     "crops",
     "food"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-25",
   "genre": "info",
   "title": {
    "en": "The Thirsty Blue Planet",
    "ko": "목마른 푸른 행성"
   },
   "topic": {
    "en": "Climate",
    "ko": "기후"
   },
   "bg": {
    "en": "About 60 percent of the human body is water.",
    "ko": "사람 몸의 약 60%는 물로 이루어져 있어요."
   },
   "sentences": [
    {
     "en": "Earth is often called the blue planet, yet billions of people struggle to get enough clean water.",
     "ko": "지구는 흔히 푸른 행성이라고 불리지만, 수십억 명이 깨끗한 물을 충분히 얻기 어려워한다."
    },
    {
     "en": "How can a planet covered in water be thirsty?",
     "ko": "물로 덮인 행성이 어떻게 목마를 수 있을까?"
    },
    {
     "en": "The answer is that only about 3 percent of Earth's water is fresh, and most of that is locked in ice or deep underground.",
     "ko": "지구의 물 가운데 민물은 약 3%뿐이고, 그나마 대부분이 얼음 속이나 깊은 땅속에 갇혀 있기 때문이다."
    },
    {
     "en": "Water scarcity means that there is not enough clean water to meet people's needs.",
     "ko": "물 부족이란 사람들에게 필요한 만큼 깨끗한 물이 없는 상태를 말한다."
    },
    {
     "en": "It can happen because water is physically limited, or because there is no money to build pipes, wells, and treatment plants.",
     "ko": "물 자체가 모자라서 생길 수도 있고, 수도관이나 우물, 정수 시설을 지을 돈이 없어서 생길 수도 있다."
    },
    {
     "en": "Climate change is making the problem harder.",
     "ko": "기후 변화는 이 문제를 더 어렵게 만들고 있다."
    },
    {
     "en": "As temperatures rise, more water evaporates from soil and lakes, and droughts in some regions become longer and more severe.",
     "ko": "기온이 오르면 흙과 호수에서 더 많은 물이 증발하고, 어떤 지역에서는 가뭄이 더 길고 심해진다."
    },
    {
     "en": "Mountain glaciers, which slowly release water to rivers in summer, are shrinking in many parts of the world.",
     "ko": "여름마다 강으로 천천히 물을 흘려보내는 산악 빙하도 세계 곳곳에서 줄어들고 있다."
    },
    {
     "en": "At the same time, the global population keeps growing, and farming already uses about 70 percent of the fresh water people take from rivers and underground sources.",
     "ko": "동시에 세계 인구는 계속 늘고 있고, 사람들이 강과 지하에서 끌어 쓰는 민물의 약 70%를 이미 농업이 쓰고 있다."
    },
    {
     "en": "However, the future is not fixed.",
     "ko": "하지만 미래가 정해져 있는 것은 아니다."
    },
    {
     "en": "Some dry countries have found creative solutions.",
     "ko": "몇몇 건조한 나라는 창의적인 해결책을 찾아냈다."
    },
    {
     "en": "Israel, for example, recycles most of its wastewater for farming and uses desalination, which removes salt from seawater.",
     "ko": "예를 들어 이스라엘은 하수 대부분을 재활용해 농사에 쓰고, 바닷물에서 소금을 없애는 해수 담수화도 활용한다."
    },
    {
     "en": "Drip irrigation, a method that delivers water directly to plant roots, can greatly reduce waste on farms.",
     "ko": "식물 뿌리에 물을 바로 주는 점적 관개는 농장에서 버려지는 물을 크게 줄일 수 있다."
    },
    {
     "en": "Singapore collects rainwater and treats used water so carefully that it can be safe to drink again.",
     "ko": "싱가포르는 빗물을 모으고, 쓰고 난 물을 아주 꼼꼼하게 처리해서 다시 마셔도 안전한 물로 만든다."
    },
    {
     "en": "These technologies cost money and energy, so they are not easy for every country.",
     "ko": "이런 기술에는 돈과 에너지가 들어서 모든 나라가 쉽게 쓸 수는 없다."
    },
    {
     "en": "Even so, everyday actions also matter, such as fixing leaks and avoiding food waste, since growing food requires a great deal of water.",
     "ko": "그래도 새는 곳을 고치고 음식을 버리지 않는 것 같은 일상의 행동도 중요하다. 음식을 기르는 데 아주 많은 물이 들기 때문이다."
    },
    {
     "en": "Water scarcity is a serious and growing challenge, but smart technology and careful use can help protect this precious resource.",
     "ko": "물 부족은 심각하고 점점 커지는 문제이지만, 똑똑한 기술과 아껴 쓰는 습관으로 이 소중한 자원을 지킬 수 있다."
    }
   ],
   "key": 16,
   "keyWhy": {
    "en": "It sums up the text: water scarcity is serious, but technology and careful use can help.",
    "ko": "물 부족은 심각하지만 기술과 아껴 쓰는 습관으로 이겨 낼 수 있다는 글의 요지를 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Earth has plenty of fresh water, so there is no real problem.",
      "ko": "지구에는 민물이 넉넉해서 실제로는 문제가 없다."
     },
     {
      "en": "Climate change has no effect on water supplies.",
      "ko": "기후 변화는 물 공급에 아무 영향을 주지 않는다."
     },
     {
      "en": "Water is becoming scarcer as the world warms, but technology and careful use can help.",
      "ko": "세계가 더워지면서 물이 더 귀해지고 있지만, 기술과 아껴 쓰는 습관이 도움이 될 수 있다."
     },
     {
      "en": "Desalination is cheap and easy for every country.",
      "ko": "해수 담수화는 모든 나라에 싸고 쉬운 방법이다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text explains why fresh water is becoming scarce and shows ways people are solving the problem.",
     "ko": "글은 민물이 왜 부족해지는지 설명하고, 사람들이 문제를 해결하는 방법을 보여 줘요."
    }
   },
   "words": [
    {
     "en": "scarcity",
     "ko": "부족, 희소성"
    },
    {
     "en": "droughts",
     "ko": "가뭄"
    },
    {
     "en": "desalination",
     "ko": "해수 담수화"
    }
   ],
   "summary": {
    "ko": "기후 변화로 물이 부족해지니 물을 현명하게 써야 한다.",
    "en": "Climate change makes water scarce, so we must use water wisely.",
    "keywords": [
     "climate",
     "water",
     "wisely"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-26",
   "genre": "info",
   "title": {
    "en": "Why Is Everything Getting More Expensive?",
    "ko": "왜 모든 게 비싸질까?"
   },
   "topic": {
    "en": "Economy",
    "ko": "경제"
   },
   "bg": {
    "en": "During Germany's 1923 hyperinflation, a loaf of bread cost about 200 billion marks.",
    "ko": "1923년 독일 초인플레이션 때는 빵 한 덩이 값이 약 2,000억 마르크까지 올랐어요."
   },
   "sentences": [
    {
     "en": "Your parents might remember when a bowl of ramyeon at a snack bar cost much less than it does today.",
     "ko": "부모님은 분식집 라면 한 그릇이 지금보다 훨씬 쌌던 때를 기억하실지도 모른다."
    },
    {
     "en": "This rise in prices over time is called inflation.",
     "ko": "이렇게 시간이 지나며 물가가 오르는 것을 인플레이션이라고 한다."
    },
    {
     "en": "More precisely, inflation is a general increase in the prices of goods and services, which means that the same amount of money buys less than before.",
     "ko": "더 정확히 말하면 인플레이션은 상품과 서비스 가격이 전반적으로 오르는 것으로, 같은 돈으로 예전보다 적게 살 수 있게 된다는 뜻이다."
    },
    {
     "en": "Economists usually measure it with a price index, which tracks the cost of a typical basket of goods such as food, rent, and transportation.",
     "ko": "경제학자들은 보통 물가 지수로 이것을 재는데, 음식, 집세, 교통비처럼 평범한 생활에 드는 물건과 서비스의 값을 추적한다."
    },
    {
     "en": "There are two main causes.",
     "ko": "주된 원인은 두 가지이다."
    },
    {
     "en": "First, when people and businesses want to buy more than the economy can produce, prices are pulled up.",
     "ko": "첫째, 사람과 기업이 경제가 만들어 낼 수 있는 것보다 더 많이 사려고 하면 가격이 끌어올려진다."
    },
    {
     "en": "Second, when the cost of making things rises, for example because oil becomes more expensive, companies often pass those costs on to customers.",
     "ko": "둘째, 예를 들어 석유 값이 올라 물건을 만드는 비용이 오르면, 기업은 그 비용을 소비자에게 넘기는 경우가 많다."
    },
    {
     "en": "Printing too much money can also lead to inflation.",
     "ko": "돈을 너무 많이 찍어 내도 인플레이션이 생길 수 있다."
    },
    {
     "en": "A small amount of inflation, around 2 percent a year, is considered healthy by many central banks.",
     "ko": "많은 중앙은행은 1년에 2% 정도의 낮은 인플레이션을 건강한 수준으로 본다."
    },
    {
     "en": "However, high inflation can cause real pain.",
     "ko": "하지만 높은 인플레이션은 실제로 큰 고통을 줄 수 있다."
    },
    {
     "en": "When prices rise faster than wages, families find it harder to pay for basic needs, and savings lose value.",
     "ko": "물가가 월급보다 빨리 오르면 가족들은 기본 생활비를 내기 힘들어지고, 저축한 돈의 가치도 떨어진다."
    },
    {
     "en": "In extreme cases, called hyperinflation, prices can rise so fast that money becomes almost worthless, as happened in Germany in 1923 and in Zimbabwe in the late 2000s.",
     "ko": "초인플레이션이라고 부르는 극단적인 경우에는 물가가 너무 빨리 올라 돈이 거의 쓸모없어지기도 하는데, 1923년 독일과 2000년대 후반 짐바브웨에서 그런 일이 있었다."
    },
    {
     "en": "Surprisingly, falling prices, or deflation, can also be harmful, because people may delay spending and the economy can slow down.",
     "ko": "놀랍게도 물가가 떨어지는 디플레이션도 해로울 수 있다. 사람들이 소비를 미루면서 경제가 느려질 수 있기 때문이다."
    },
    {
     "en": "To control inflation, central banks such as the Bank of Korea can raise interest rates.",
     "ko": "인플레이션을 잡기 위해 한국은행 같은 중앙은행은 금리를 올릴 수 있다."
    },
    {
     "en": "Higher rates make borrowing more expensive, so people and businesses spend less, which helps cool prices.",
     "ko": "금리가 오르면 돈을 빌리는 비용이 커져서 사람과 기업이 덜 쓰게 되고, 그러면 물가가 진정된다."
    },
    {
     "en": "The challenge is balance, since raising rates too much can cause unemployment.",
     "ko": "어려운 점은 균형이다. 금리를 너무 많이 올리면 실업이 생길 수 있기 때문이다."
    },
    {
     "en": "Understanding inflation helps us make smarter choices about saving, spending, and planning for the future.",
     "ko": "인플레이션을 이해하면 저축과 소비, 미래 계획에 대해 더 현명하게 선택할 수 있다."
    }
   ],
   "key": 2,
   "keyWhy": {
    "en": "It gives the exact definition of inflation that the whole text explains.",
    "ko": "글 전체가 설명하는 인플레이션의 정확한 뜻을 알려 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Inflation means that prices always go down over time.",
      "ko": "인플레이션은 시간이 지나면 물가가 늘 내려간다는 뜻이다."
     },
     {
      "en": "High inflation helps families save more money.",
      "ko": "높은 인플레이션은 가족들이 돈을 더 모으도록 도와준다."
     },
     {
      "en": "Central banks cannot do anything about inflation.",
      "ko": "중앙은행은 인플레이션에 대해 아무것도 할 수 없다."
     },
     {
      "en": "Inflation is a general rise in prices that affects our lives and must be carefully managed.",
      "ko": "인플레이션은 물가가 전반적으로 오르는 현상으로, 우리 생활에 영향을 주기 때문에 신중하게 관리해야 한다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text explains what inflation is, why it happens, how it affects us, and how it is controlled.",
     "ko": "글은 인플레이션이 무엇이고 왜 생기며, 우리에게 어떤 영향을 주고 어떻게 관리되는지 설명해요."
    }
   },
   "words": [
    {
     "en": "index",
     "ko": "지수"
    },
    {
     "en": "wages",
     "ko": "임금, 월급"
    },
    {
     "en": "unemployment",
     "ko": "실업"
    }
   ],
   "summary": {
    "ko": "인플레이션은 물가가 올라서 같은 돈으로 덜 살 수 있게 되는 것이다.",
    "en": "Inflation means prices rise, so the same money buys less.",
    "keywords": [
     "inflation",
     "prices",
     "money"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-27",
   "genre": "info",
   "title": {
    "en": "The Age of Exploration: Two Sides of History",
    "ko": "대항해 시대: 역사의 두 얼굴"
   },
   "topic": {
    "en": "History",
    "ko": "역사"
   },
   "bg": {
    "en": "About 270 men set out on Magellan's expedition, but only 18 returned on the first ship home.",
    "ko": "마젤란 원정대는 약 270명이 출발했지만, 첫 번째로 돌아온 배에 탄 사람은 18명뿐이었어요."
   },
   "sentences": [
    {
     "en": "In 1492, Christopher Columbus sailed west from Spain, hoping to reach Asia.",
     "ko": "1492년, 크리스토퍼 콜럼버스는 아시아에 닿기를 바라며 스페인에서 서쪽으로 항해했다."
    },
    {
     "en": "Instead, he reached islands in the Caribbean, a region Europeans had never seen.",
     "ko": "하지만 그는 유럽 사람들이 한 번도 본 적 없는 카리브해의 섬들에 도착했다."
    },
    {
     "en": "His voyage was part of a period from the 1400s to the 1600s that is often called the Age of Exploration.",
     "ko": "그의 항해는 흔히 대항해 시대라고 부르는 1400년대부터 1600년대까지의 시기에 속한다."
    },
    {
     "en": "During this time, European sailors crossed oceans in search of new trade routes, gold, and spices such as pepper and cinnamon.",
     "ko": "이 시기에 유럽 선원들은 새로운 무역로와 금, 후추와 계피 같은 향신료를 찾아 바다를 건넜다."
    },
    {
     "en": "Several inventions made these long voyages possible.",
     "ko": "몇 가지 발명품 덕분에 이런 긴 항해가 가능했다."
    },
    {
     "en": "The magnetic compass showed direction, and new ships called caravels could sail well against the wind.",
     "ko": "나침반은 방향을 알려 주었고, 캐러벨이라는 새로운 배는 바람을 거슬러서도 잘 나아갈 수 있었다."
    },
    {
     "en": "In 1498, Vasco da Gama reached India by sailing around Africa, and between 1519 and 1522 a Spanish expedition first led by Ferdinand Magellan completed the first voyage around the world.",
     "ko": "1498년 바스코 다 가마는 아프리카를 돌아 인도에 도착했고, 1519년부터 1522년까지 처음에 페르디난드 마젤란이 이끈 스페인 원정대가 최초로 세계 일주를 마쳤다."
    },
    {
     "en": "These journeys connected continents as never before.",
     "ko": "이 항해들은 대륙과 대륙을 전에 없이 이어 주었다."
    },
    {
     "en": "Plants, animals, and ideas moved between the Americas, Europe, Africa, and Asia in what historians call the Columbian Exchange.",
     "ko": "역사학자들이 \"콜럼버스 교환\"이라고 부르는 과정에서 식물, 동물, 생각이 아메리카, 유럽, 아프리카, 아시아 사이를 오갔다."
    },
    {
     "en": "Potatoes, corn, and chili peppers spread across the world, and chili peppers eventually became a key ingredient in Korean food.",
     "ko": "감자, 옥수수, 고추가 전 세계로 퍼졌고, 고추는 마침내 한국 음식의 핵심 재료가 되었다."
    },
    {
     "en": "However, the Age of Exploration had a darker side.",
     "ko": "하지만 대항해 시대에는 어두운 면도 있었다."
    },
    {
     "en": "For the Indigenous peoples of the Americas, the arrival of Europeans brought conquest, forced labor, and the loss of land.",
     "ko": "아메리카 원주민에게 유럽인의 도착은 정복과 강제 노동, 땅을 빼앗기는 일을 뜻했다."
    },
    {
     "en": "Diseases such as smallpox, to which they had no immunity, killed a very large share of the population.",
     "ko": "면역이 없던 천연두 같은 병으로 원주민 인구의 아주 많은 수가 목숨을 잃었다."
    },
    {
     "en": "European powers also expanded the Atlantic slave trade, forcing millions of Africans across the ocean.",
     "ko": "유럽 강대국들은 대서양 노예 무역도 넓혀서, 수백만 명의 아프리카 사람들을 강제로 바다 건너로 끌고 갔다."
    },
    {
     "en": "Today, many people question calling these events 'discoveries,' because millions of people already lived in the lands Europeans reached.",
     "ko": "오늘날 많은 사람이 이 사건들을 \"발견\"이라고 부르는 것에 의문을 제기한다. 유럽인이 닿은 땅에는 이미 수백만 명이 살고 있었기 때문이다."
    },
    {
     "en": "The Age of Exploration changed the world forever, bringing new connections but also great suffering.",
     "ko": "대항해 시대는 세계를 영원히 바꿔 놓았고, 새로운 연결과 함께 큰 고통도 가져왔다."
    },
    {
     "en": "Remembering both sides helps us understand history more honestly and ask who gets to tell the story.",
     "ko": "양쪽을 모두 기억할 때 역사를 더 정직하게 이해하고, 누가 그 이야기를 전하는지 질문할 수 있다."
    }
   ],
   "key": 15,
   "keyWhy": {
    "en": "It states the two-sided main idea: the age brought new connections but also great suffering.",
    "ko": "새로운 연결과 큰 고통이라는 대항해 시대의 두 얼굴을 한 문장으로 말해 주는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "The Age of Exploration connected the world but also caused great suffering.",
      "ko": "대항해 시대는 세계를 이어 주었지만 큰 고통도 일으켰다."
     },
     {
      "en": "Columbus reached Asia by sailing west.",
      "ko": "콜럼버스는 서쪽으로 항해해서 아시아에 도착했다."
     },
     {
      "en": "The Age of Exploration brought only benefits to everyone.",
      "ko": "대항해 시대는 모두에게 좋은 점만 가져왔다."
     },
     {
      "en": "Chili peppers first came from Korea.",
      "ko": "고추는 원래 한국에서 처음 나왔다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text describes both the new links between continents and the harm done to many peoples.",
     "ko": "글은 대륙 사이의 새로운 연결과 많은 사람이 입은 피해를 함께 다뤄요."
    }
   },
   "words": [
    {
     "en": "voyage",
     "ko": "항해"
    },
    {
     "en": "immunity",
     "ko": "면역"
    },
    {
     "en": "conquest",
     "ko": "정복"
    }
   ],
   "summary": {
    "ko": "유럽의 탐험은 세계를 이어 주었지만, 많은 사람에게 피해도 주었다.",
    "en": "European exploration connected the world, but it also harmed many people.",
    "keywords": [
     "exploration",
     "connected",
     "harmed"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-28",
   "genre": "info",
   "title": {
    "en": "The Mold That Saved Millions",
    "ko": "수백만 명을 구한 곰팡이"
   },
   "topic": {
    "en": "Medicine",
    "ko": "의학"
   },
   "bg": {
    "en": "Under good conditions, some bacteria can double in number about every 20 minutes.",
    "ko": "어떤 세균은 조건이 좋으면 약 20분마다 수가 두 배로 늘어날 수 있어요."
   },
   "sentences": [
    {
     "en": "In 1928, the Scottish scientist Alexander Fleming noticed something strange in his laboratory.",
     "ko": "1928년, 스코틀랜드의 과학자 알렉산더 플레밍은 실험실에서 이상한 것을 발견했다."
    },
    {
     "en": "He had just returned from a summer holiday and found that some of his bacteria dishes had been left out.",
     "ko": "그는 여름휴가에서 막 돌아와, 세균을 기르던 접시 몇 개가 그대로 놓여 있던 것을 발견했다."
    },
    {
     "en": "A mold had grown on one of them, and the bacteria around it had died.",
     "ko": "그중 한 접시에 곰팡이가 자랐는데, 그 주변의 세균이 죽어 있었다."
    },
    {
     "en": "That mold led to penicillin, the first widely used antibiotic.",
     "ko": "그 곰팡이에서 처음으로 널리 쓰인 항생제인 페니실린이 탄생했다."
    },
    {
     "en": "Antibiotics are medicines that kill bacteria or stop them from growing.",
     "ko": "항생제는 세균을 죽이거나 자라지 못하게 막는 약이다."
    },
    {
     "en": "Since the 1940s, they have saved millions of lives by curing infections that were once deadly, such as pneumonia and infected wounds.",
     "ko": "1940년대부터 항생제는 폐렴이나 곪은 상처처럼 한때 목숨을 앗아 가던 감염을 치료해 수백만 명의 생명을 구했다."
    },
    {
     "en": "However, bacteria are fighting back.",
     "ko": "하지만 세균이 반격하고 있다."
    },
    {
     "en": "When antibiotics are used, most bacteria die, but a few may survive because of small genetic differences.",
     "ko": "항생제를 쓰면 세균 대부분은 죽지만, 작은 유전적 차이 때문에 몇몇은 살아남을 수 있다."
    },
    {
     "en": "These survivors multiply and pass on their resistance.",
     "ko": "살아남은 세균이 번식하면서 그 저항력을 물려준다."
    },
    {
     "en": "Over time, an antibiotic that once worked well may stop working altogether.",
     "ko": "시간이 지나면 한때 잘 듣던 항생제가 아예 듣지 않게 될 수도 있다."
    },
    {
     "en": "This is called antibiotic resistance.",
     "ko": "이것을 항생제 내성이라고 한다."
    },
    {
     "en": "Fleming himself warned about this danger in his Nobel Prize speech in 1945.",
     "ko": "플레밍 자신도 1945년 노벨상 강연에서 이 위험을 경고했다."
    },
    {
     "en": "Human behavior has made the problem worse.",
     "ko": "사람들의 행동이 이 문제를 더 키웠다."
    },
    {
     "en": "Some people take antibiotics for colds and flu, even though these illnesses are caused by viruses, which antibiotics cannot kill.",
     "ko": "감기와 독감은 항생제로 죽일 수 없는 바이러스 때문에 생기는데도, 어떤 사람들은 항생제를 먹는다."
    },
    {
     "en": "Others stop taking their medicine too early, and in many countries large amounts of antibiotics are given to farm animals.",
     "ko": "약을 너무 일찍 끊는 사람도 있고, 많은 나라에서는 가축에게 많은 양의 항생제를 먹인다."
    },
    {
     "en": "The World Health Organization considers antimicrobial resistance one of the top global threats to public health.",
     "ko": "세계보건기구는 항균제 내성을 세계 보건을 위협하는 가장 큰 문제 가운데 하나로 본다."
    },
    {
     "en": "Meanwhile, very few new types of antibiotics have been developed in recent decades.",
     "ko": "그런데 최근 수십 년 동안 새로운 종류의 항생제는 거의 개발되지 않았다."
    },
    {
     "en": "Still, there are reasons for hope.",
     "ko": "그래도 희망은 있다."
    },
    {
     "en": "Scientists are searching for new medicines, and doctors are learning to prescribe antibiotics more carefully.",
     "ko": "과학자들은 새로운 약을 찾고 있고, 의사들은 항생제를 더 신중하게 처방하는 법을 익히고 있다."
    },
    {
     "en": "If a doctor prescribes antibiotics for you, take them exactly as directed and never share them with friends.",
     "ko": "의사가 항생제를 처방하면 지시대로 정확히 먹고, 절대 친구와 나눠 먹지 말자."
    },
    {
     "en": "Antibiotics are precious tools, and using them wisely is everyone's responsibility.",
     "ko": "항생제는 소중한 도구이고, 그것을 현명하게 쓰는 것은 모두의 책임이다."
    }
   ],
   "key": 20,
   "keyWhy": {
    "en": "It gives the final message: antibiotics are precious, and everyone must use them wisely.",
    "ko": "항생제는 소중하니 모두가 현명하게 써야 한다는 마지막 메시지를 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Antibiotics can cure colds and the flu.",
      "ko": "항생제로 감기와 독감을 고칠 수 있다."
     },
     {
      "en": "Bacteria are becoming resistant to antibiotics, so we must use them wisely.",
      "ko": "세균이 항생제에 내성을 갖게 되고 있으니, 항생제를 현명하게 써야 한다."
     },
     {
      "en": "Fleming invented antibiotics to kill viruses.",
      "ko": "플레밍은 바이러스를 죽이려고 항생제를 발명했다."
     },
     {
      "en": "Antibiotic resistance is no longer a problem.",
      "ko": "항생제 내성은 더 이상 문제가 아니다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text explains how bacteria become resistant and why careful use of antibiotics matters.",
     "ko": "글은 세균이 어떻게 내성을 갖게 되는지, 그리고 항생제를 신중하게 써야 하는 이유를 설명해요."
    }
   },
   "words": [
    {
     "en": "penicillin",
     "ko": "페니실린"
    },
    {
     "en": "infections",
     "ko": "감염"
    },
    {
     "en": "prescribe",
     "ko": "처방하다"
    }
   ],
   "summary": {
    "ko": "항생제가 계속 효과가 있도록 신중하게 써야 한다.",
    "en": "We must use antibiotics carefully so that they keep working.",
    "keywords": [
     "antibiotics",
     "carefully",
     "working"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-29",
   "genre": "info",
   "title": {
    "en": "Don't Click Share Yet!",
    "ko": "아직 공유하지 마세요!"
   },
   "topic": {
    "en": "Media",
    "ko": "미디어"
   },
   "bg": {
    "en": "Collins Dictionary chose \"fake news\" as its Word of the Year in 2017.",
    "ko": "영국 콜린스 사전은 2017년 올해의 단어로 \"가짜 뉴스(fake news)\"를 뽑았어요."
   },
   "sentences": [
    {
     "en": "A shocking headline appears on your screen: a famous singer has been arrested!",
     "ko": "화면에 충격적인 제목이 뜬다. 유명 가수가 체포되었다는 것이다!"
    },
    {
     "en": "Within minutes, thousands of people have shared it.",
     "ko": "몇 분 만에 수천 명이 그 글을 공유한다."
    },
    {
     "en": "Later, it turns out that the story was completely false.",
     "ko": "나중에 알고 보니 그 이야기는 완전히 거짓이었다."
    },
    {
     "en": "Fake news is false or misleading information presented as if it were real news.",
     "ko": "가짜 뉴스는 진짜 뉴스인 것처럼 꾸민 거짓 정보나 오해를 부르는 정보이다."
    },
    {
     "en": "Some is created on purpose to make money from clicks or to influence opinions, while some spreads simply because people make mistakes.",
     "ko": "어떤 것은 클릭으로 돈을 벌거나 여론을 움직이려고 일부러 만들어지고, 어떤 것은 그냥 사람들의 실수로 퍼진다."
    },
    {
     "en": "Why does false information travel so fast?",
     "ko": "거짓 정보는 왜 이렇게 빨리 퍼질까?"
    },
    {
     "en": "One reason is that surprising and emotional stories grab our attention.",
     "ko": "한 가지 이유는 놀랍고 감정을 건드리는 이야기가 우리의 관심을 사로잡기 때문이다."
    },
    {
     "en": "A large 2018 study of Twitter by researchers at MIT found that false news stories spread faster and reached more people than true ones.",
     "ko": "2018년 MIT 연구자들이 트위터를 대규모로 조사한 결과, 거짓 뉴스가 진짜 뉴스보다 더 빨리, 더 많은 사람에게 퍼진다는 것이 밝혀졌다."
    },
    {
     "en": "Another reason is that we tend to believe information that matches what we already think, a habit called confirmation bias.",
     "ko": "또 다른 이유는 우리가 이미 생각하는 것과 맞는 정보를 믿는 경향이 있기 때문인데, 이것을 확증 편향이라고 한다."
    },
    {
     "en": "Surprisingly, the same study found that people, not automated bots, were mainly responsible for spreading the false stories faster.",
     "ko": "놀랍게도 같은 연구에서 거짓 이야기를 더 빨리 퍼뜨린 주범은 자동 프로그램(봇)이 아니라 사람이었다."
    },
    {
     "en": "New technology is adding to the challenge.",
     "ko": "새로운 기술은 이 문제를 더 어렵게 만들고 있다."
    },
    {
     "en": "AI tools can now create realistic fake images, voices, and videos, sometimes called deepfakes.",
     "ko": "이제 AI 도구로 진짜 같은 가짜 사진, 목소리, 영상을 만들 수 있는데, 이것을 딥페이크라고 부르기도 한다."
    },
    {
     "en": "However, we are not powerless.",
     "ko": "하지만 우리가 무력한 것은 아니다."
    },
    {
     "en": "Critical thinking means questioning information instead of accepting it immediately.",
     "ko": "비판적 사고란 정보를 바로 받아들이지 않고 질문을 던지는 것이다."
    },
    {
     "en": "Before sharing a story, check who published it and whether trusted news organizations are reporting the same thing.",
     "ko": "글을 공유하기 전에 누가 올렸는지, 믿을 만한 언론사도 같은 내용을 보도하는지 확인하자."
    },
    {
     "en": "Look carefully at the date, because old stories are often shared as if they were new.",
     "ko": "날짜도 꼼꼼히 보자. 오래된 이야기가 새 소식처럼 공유되는 일이 많기 때문이다."
    },
    {
     "en": "Be especially careful when a headline makes you very angry or excited, since strong emotions can stop us from thinking clearly.",
     "ko": "제목을 보고 몹시 화가 나거나 흥분될 때는 특히 조심하자. 강한 감정은 우리가 똑바로 생각하지 못하게 막을 수 있다."
    },
    {
     "en": "Fact-checking websites can also help.",
     "ko": "팩트 체크 사이트도 도움이 된다."
    },
    {
     "en": "You can be the person in your group chat who checks a story before forwarding it.",
     "ko": "여러분이 단톡방에서 글을 전달하기 전에 먼저 확인하는 사람이 될 수 있다."
    },
    {
     "en": "In a world full of information, the most important skill is not finding news quickly but judging it carefully.",
     "ko": "정보가 넘쳐 나는 세상에서 가장 중요한 능력은 뉴스를 빨리 찾는 것이 아니라 꼼꼼하게 판단하는 것이다."
    }
   ],
   "key": 19,
   "keyWhy": {
    "en": "It states the main lesson: in a world full of information, judging news carefully matters most.",
    "ko": "정보가 넘치는 세상에서는 뉴스를 꼼꼼히 판단하는 능력이 가장 중요하다는 핵심 교훈을 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "All news on social media is fake.",
      "ko": "소셜 미디어의 뉴스는 모두 가짜이다."
     },
     {
      "en": "Fake news is always created on purpose.",
      "ko": "가짜 뉴스는 언제나 일부러 만들어진다."
     },
     {
      "en": "Fake news spreads quickly, so we need critical thinking to judge information.",
      "ko": "가짜 뉴스는 빨리 퍼지기 때문에 정보를 판단하려면 비판적 사고가 필요하다."
     },
     {
      "en": "Deepfakes are easy to spot without any effort.",
      "ko": "딥페이크는 아무 노력 없이도 쉽게 알아볼 수 있다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text explains why fake news spreads fast and how critical thinking helps us judge it.",
     "ko": "글은 가짜 뉴스가 왜 빨리 퍼지는지, 비판적 사고가 어떻게 판단을 돕는지 설명해요."
    }
   },
   "words": [
    {
     "en": "misleading",
     "ko": "오해의 소지가 있는"
    },
    {
     "en": "bias",
     "ko": "편향"
    },
    {
     "en": "headline",
     "ko": "(기사) 제목"
    }
   ],
   "summary": {
    "ko": "정보를 믿거나 공유하기 전에 꼼꼼히 확인해야 한다.",
    "en": "We should check information carefully before we believe or share it.",
    "keywords": [
     "check",
     "information",
     "share"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-30",
   "genre": "info",
   "title": {
    "en": "Life on Mars?",
    "ko": "화성에 생명이 있을까?"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Olympus Mons on Mars is about 22 km high, more than twice the height of Mount Everest.",
    "ko": "화성의 올림푸스 산은 높이가 약 22km로, 에베레스트산의 두 배가 넘어요."
   },
   "sentences": [
    {
     "en": "For centuries, people have looked at the red dot of Mars in the night sky and wondered whether anyone lives there.",
     "ko": "수백 년 동안 사람들은 밤하늘의 붉은 점인 화성을 보며 그곳에 누가 살고 있을지 궁금해했다."
    },
    {
     "en": "In 1877, the Italian astronomer Giovanni Schiaparelli described long lines on Mars that he called 'canali,' meaning channels.",
     "ko": "1877년 이탈리아의 천문학자 조반니 스키아파렐리는 화성에서 본 긴 선들을 \"카날리\", 즉 물길이라고 불렀다."
    },
    {
     "en": "When the word was translated as 'canals,' some people, including the American astronomer Percival Lowell, claimed that Martians had built them.",
     "ko": "이 말이 \"운하\"로 번역되자, 미국의 천문학자 퍼시벌 로웰을 비롯한 몇몇 사람은 화성인이 그것을 만들었다고 주장했다."
    },
    {
     "en": "Today, we know there are no cities on Mars, but the question of life is still open.",
     "ko": "오늘날 우리는 화성에 도시가 없다는 것을 알지만, 생명이 있느냐는 질문의 답은 아직 나오지 않았다."
    },
    {
     "en": "Modern Mars is a harsh place.",
     "ko": "지금의 화성은 몹시 살기 힘든 곳이다."
    },
    {
     "en": "It is extremely cold, its thin atmosphere is mostly carbon dioxide, and its surface receives strong radiation from space.",
     "ko": "아주 춥고, 얇은 대기는 대부분 이산화탄소이며, 표면에는 우주에서 오는 강한 방사선이 쏟아진다."
    },
    {
     "en": "Liquid water cannot stay on the surface for long.",
     "ko": "액체 상태의 물은 표면에 오래 머물 수 없다."
    },
    {
     "en": "However, the planet was not always like this.",
     "ko": "하지만 화성이 늘 이랬던 것은 아니다."
    },
    {
     "en": "Robotic rovers such as NASA's Curiosity and Perseverance have found rocks and minerals that form in water.",
     "ko": "나사의 큐리오시티와 퍼서비어런스 같은 탐사 로봇은 물속에서 만들어지는 암석과 광물을 찾아냈다."
    },
    {
     "en": "Perseverance landed in 2021 in Jezero Crater, a place that scientists believe once held a lake.",
     "ko": "퍼서비어런스는 2021년, 과학자들이 한때 호수였다고 보는 예제로 충돌구에 착륙했다."
    },
    {
     "en": "Evidence suggests that billions of years ago, Mars was warmer and wetter, with rivers and lakes.",
     "ko": "여러 증거에 따르면 수십억 년 전의 화성은 더 따뜻하고 축축했으며, 강과 호수가 있었다."
    },
    {
     "en": "Since all life on Earth needs liquid water, these discoveries make scientists hopeful that simple life, such as microbes, might once have existed there.",
     "ko": "지구의 모든 생명에게는 액체 상태의 물이 필요하기 때문에, 이 발견으로 과학자들은 미생물 같은 단순한 생명이 한때 그곳에 있었을지도 모른다는 희망을 품게 되었다."
    },
    {
     "en": "Rovers have also detected organic molecules, which are carbon-based chemicals that can be connected to life.",
     "ko": "탐사 로봇은 생명과 관련될 수 있는 탄소 기반 화학 물질인 유기 분자도 찾아냈다."
    },
    {
     "en": "But here is the important point: organic molecules can also form without life.",
     "ko": "그런데 중요한 점이 있다. 유기 분자는 생명 없이도 만들어질 수 있다."
    },
    {
     "en": "So far, no clear evidence of life on Mars, past or present, has been found.",
     "ko": "지금까지 화성에서 과거든 현재든 생명이 있었다는 분명한 증거는 발견되지 않았다."
    },
    {
     "en": "To answer the question, scientists hope to bring rock samples back to Earth for detailed study.",
     "ko": "이 질문에 답하기 위해 과학자들은 암석 표본을 지구로 가져와 자세히 연구하기를 바란다."
    },
    {
     "en": "Perseverance has already collected samples in sealed tubes for a possible future mission.",
     "ko": "퍼서비어런스는 앞으로 있을지 모를 임무를 위해 이미 밀봉된 관에 표본을 모아 두었다."
    },
    {
     "en": "Whatever the result, the search will teach us how life begins and whether Earth is unique.",
     "ko": "결과가 어떻든, 이 탐사는 생명이 어떻게 시작되는지, 그리고 지구가 특별한 곳인지를 알려 줄 것이다."
    }
   ],
   "key": 3,
   "keyWhy": {
    "en": "It sets up the main question of the text: Mars has no cities, but the question of life is still open.",
    "ko": "화성에 도시는 없지만 생명이 있는지는 아직 모른다는, 글 전체가 다루는 질문을 세우는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Scientists have proven that Martians built canals.",
      "ko": "과학자들은 화성인이 운하를 만들었다는 것을 증명했다."
     },
     {
      "en": "Mars has always been cold and dry.",
      "ko": "화성은 언제나 춥고 건조했다."
     },
     {
      "en": "The Perseverance rover discovered living things on Mars.",
      "ko": "퍼서비어런스 탐사 로봇이 화성에서 생명체를 발견했다."
     },
     {
      "en": "Mars once had water, but scientists have not yet found proof of life there.",
      "ko": "화성에는 한때 물이 있었지만, 과학자들은 아직 그곳에서 생명의 증거를 찾지 못했다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text shows evidence that Mars once had water but says no proof of life has been found yet.",
     "ko": "글은 화성에 한때 물이 있었다는 증거를 보여 주지만, 생명의 증거는 아직 없다고 말해요."
    }
   },
   "words": [
    {
     "en": "atmosphere",
     "ko": "대기"
    },
    {
     "en": "rovers",
     "ko": "탐사 로봇들"
    },
    {
     "en": "evidence",
     "ko": "증거"
    }
   ],
   "summary": {
    "ko": "화성은 한때 생명이 살 수 있었을지도 모르지만, 아직 증거는 없다.",
    "en": "Mars may once have been able to support life, but there is no proof yet.",
    "keywords": [
     "mars",
     "life",
     "proof"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-31",
   "genre": "info",
   "title": {
    "en": "The Search for Alien Life",
    "ko": "외계 생명체 탐사"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "The James Webb Space Telescope was launched in December 2021.",
    "ko": "제임스 웹 우주 망원경은 2021년 12월에 발사되었어요."
   },
   "sentences": [
    {
     "en": "On a quiet night in 1977, a radio telescope in Ohio picked up a strange signal from space.",
     "ko": "1977년의 어느 조용한 밤, 미국 오하이오주의 전파 망원경이 우주에서 온 이상한 신호를 잡았다."
    },
    {
     "en": "An astronomer circled it and wrote \"Wow!\" beside it.",
     "ko": "한 천문학자가 그 신호에 동그라미를 치고 옆에 \"와우!\"라고 적었다."
    },
    {
     "en": "The signal was never heard again.",
     "ko": "그 신호는 다시는 들리지 않았다."
    },
    {
     "en": "Are we alone in the universe?",
     "ko": "우주에 우리만 있을까?"
    },
    {
     "en": "For most of history, people could only guess, but today scientists are searching with real tools.",
     "ko": "역사 대부분의 시간 동안 사람들은 추측만 할 수 있었지만, 오늘날 과학자들은 실제 도구로 탐사하고 있다."
    },
    {
     "en": "One of the oldest methods is SETI, which stands for the Search for Extraterrestrial Intelligence.",
     "ko": "가장 오래된 방법 중 하나는 SETI로, 외계 지적 생명체 탐사를 뜻한다."
    },
    {
     "en": "Since about 1960, SETI researchers have used radio telescopes to listen for signals that intelligent beings might send.",
     "ko": "1960년 무렵부터 SETI 연구자들은 전파 망원경으로 지적 생명체가 보낼지도 모르는 신호를 들어 왔다."
    },
    {
     "en": "So far, however, they have not found any message that has been confirmed.",
     "ko": "하지만 지금까지 확인된 메시지는 하나도 찾지 못했다."
    },
    {
     "en": "Another method looks for planets outside our solar system, which are called exoplanets.",
     "ko": "또 다른 방법은 태양계 밖의 행성, 즉 외계 행성을 찾는 것이다."
    },
    {
     "en": "The first exoplanet around a Sun-like star was found in 1995, and astronomers have now confirmed more than 5,000 of them.",
     "ko": "태양과 비슷한 별을 도는 첫 외계 행성은 1995년에 발견되었고, 지금은 5,000개가 넘는 외계 행성이 확인되었다."
    },
    {
     "en": "Some of these planets orbit in the \"habitable zone,\" the area where liquid water could exist on the surface.",
     "ko": "이 중 일부는 표면에 액체 상태의 물이 있을 수 있는 영역인 \"생명 가능 지대\"에서 공전한다."
    },
    {
     "en": "Scientists also study the air of distant planets by analyzing the starlight that passes through it.",
     "ko": "과학자들은 먼 행성의 대기를 통과하는 별빛을 분석해서 그 대기를 연구하기도 한다."
    },
    {
     "en": "They hope to find biosignatures, which are signs such as certain gases that living things might produce.",
     "ko": "그들은 생명체가 만들어 낼 수 있는 특정 기체 같은 흔적, 즉 생명 지표를 찾기를 바란다."
    },
    {
     "en": "Life might also exist much closer to home.",
     "ko": "생명은 훨씬 가까운 곳에 있을지도 모른다."
    },
    {
     "en": "Jupiter's moon Europa and Saturn's moon Enceladus appear to have oceans of liquid water under their icy surfaces.",
     "ko": "목성의 위성 유로파와 토성의 위성 엔셀라두스는 얼음 표면 아래에 액체 상태의 바다가 있는 것으로 보인다."
    },
    {
     "en": "Yet there is an important problem.",
     "ko": "하지만 중요한 문제가 하나 있다."
    },
    {
     "en": "A gas that seems to come from life can sometimes be produced by volcanoes or other natural chemistry.",
     "ko": "생명체에서 나온 것처럼 보이는 기체가 때로는 화산이나 다른 자연적인 화학 작용으로 만들어질 수도 있다."
    },
    {
     "en": "As a result, scientists must be extremely careful before they announce a discovery.",
     "ko": "그래서 과학자들은 발견을 발표하기 전에 매우 신중해야 한다."
    },
    {
     "en": "The astronomer Carl Sagan made famous the idea that extraordinary claims require extraordinary evidence.",
     "ko": "천문학자 칼 세이건은 \"특별한 주장에는 특별한 증거가 필요하다\"는 생각을 널리 알렸다."
    },
    {
     "en": "Today, no one has found clear proof of life beyond Earth.",
     "ko": "오늘날까지 지구 밖 생명체의 확실한 증거를 찾은 사람은 없다."
    },
    {
     "en": "However, with better telescopes and space missions, the search is more serious and more exciting than ever before.",
     "ko": "하지만 더 좋은 망원경과 우주 탐사 덕분에, 이 탐사는 그 어느 때보다 진지하고 흥미진진해졌다."
    }
   ],
   "key": 20,
   "keyWhy": {
    "en": "It sums up the search: careful science continues, and the search is more exciting than ever.",
    "ko": "신중한 과학 탐사가 계속되며 그 어느 때보다 흥미진진하다는 글의 결론을 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Scientists have already found intelligent aliens using radio telescopes.",
      "ko": "과학자들은 이미 전파 망원경으로 지적 외계인을 찾아냈다."
     },
     {
      "en": "Exoplanets are impossible to study because they are too far away.",
      "ko": "외계 행성은 너무 멀어서 연구할 수 없다."
     },
     {
      "en": "Scientists search for alien life in several careful ways, but no clear proof has been found yet.",
      "ko": "과학자들은 여러 신중한 방법으로 외계 생명체를 찾고 있지만, 아직 확실한 증거는 없다."
     },
     {
      "en": "Life cannot exist on icy moons like Europa.",
      "ko": "유로파 같은 얼음 위성에는 생명이 있을 수 없다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text describes several careful ways scientists search and says no clear proof has been found.",
     "ko": "글은 과학자들이 신중하게 탐사하는 여러 방법을 소개하고, 아직 확실한 증거는 없다고 말해요."
    }
   },
   "words": [
    {
     "en": "exoplanets",
     "ko": "외계 행성들"
    },
    {
     "en": "telescope",
     "ko": "망원경"
    },
    {
     "en": "biosignatures",
     "ko": "생명 지표"
    }
   ],
   "summary": {
    "ko": "과학자들은 외계 생명체를 신중하게 찾고 있지만, 아직 증거를 찾지 못했다.",
    "en": "Scientists are searching for alien life carefully, but they have not found proof yet.",
    "keywords": [
     "alien",
     "life",
     "proof"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-32",
   "genre": "info",
   "title": {
    "en": "Could We Bring Back Dinosaurs?",
    "ko": "공룡을 되살릴 수 있을까?"
   },
   "topic": {
    "en": "Biology",
    "ko": "생물"
   },
   "bg": {
    "en": "Birds evolved from dinosaurs, so scientists sometimes call them living dinosaurs.",
    "ko": "새는 공룡에서 진화했기 때문에, 과학자들은 새를 \"살아 있는 공룡\"이라고 부르기도 해요."
   },
   "sentences": [
    {
     "en": "In 1993, a famous film showed scientists cloning dinosaurs from blood found inside an ancient mosquito trapped in amber.",
     "ko": "1993년, 한 유명한 영화는 호박 속에 갇힌 고대 모기의 피로 공룡을 복제하는 과학자들을 보여 주었다."
    },
    {
     "en": "Millions of people left the theater wondering the same thing.",
     "ko": "수많은 사람들이 같은 궁금증을 안고 극장을 나섰다."
    },
    {
     "en": "It is an exciting idea, but is it actually possible?",
     "ko": "신나는 생각이지만, 실제로 가능할까?"
    },
    {
     "en": "DNA is the set of instructions inside every cell that tells a living thing how to grow.",
     "ko": "DNA는 모든 세포 안에 있는 설명서로, 생물이 어떻게 자랄지 알려 준다."
    },
    {
     "en": "To rebuild an animal, scientists would need its complete DNA.",
     "ko": "동물을 다시 만들려면 과학자들에게 그 동물의 완전한 DNA가 필요하다."
    },
    {
     "en": "The problem is that DNA breaks down over time.",
     "ko": "문제는 DNA가 시간이 지나면서 분해된다는 점이다."
    },
    {
     "en": "Studies of ancient bones suggest that even in ideal, frozen conditions, readable DNA probably cannot survive for more than a few million years.",
     "ko": "오래된 뼈를 연구한 결과에 따르면, 얼어 있는 이상적인 조건에서도 읽을 수 있는 DNA는 아마 수백만 년 이상 남아 있지 못한다."
    },
    {
     "en": "The last non-bird dinosaurs died out about 66 million years ago.",
     "ko": "새가 아닌 마지막 공룡들은 약 6,600만 년 전에 멸종했다."
    },
    {
     "en": "Therefore, most scientists agree that no usable dinosaur DNA remains today.",
     "ko": "그래서 대부분의 과학자들은 오늘날 쓸 수 있는 공룡 DNA가 남아 있지 않다고 생각한다."
    },
    {
     "en": "However, the idea of \"de-extinction\" is not only science fiction.",
     "ko": "하지만 \"멸종 복원\"이라는 생각이 공상 과학 속 이야기만은 아니다."
    },
    {
     "en": "Some researchers are trying to bring back features of animals that disappeared much more recently, such as the woolly mammoth.",
     "ko": "몇몇 연구자들은 털매머드처럼 훨씬 최근에 사라진 동물의 특징을 되살리려 하고 있다."
    },
    {
     "en": "Mammoths survived until about 4,000 years ago, and some of their DNA has been found in frozen remains.",
     "ko": "매머드는 약 4,000년 전까지 살아남았고, 얼어 있는 유해에서 DNA 일부가 발견되었다."
    },
    {
     "en": "Scientists hope to edit the DNA of Asian elephants, their close relatives, to create cold-resistant animals that look like mammoths.",
     "ko": "과학자들은 매머드의 가까운 친척인 아시아코끼리의 DNA를 편집해서 추위에 강하고 매머드를 닮은 동물을 만들기를 바란다."
    },
    {
     "en": "Supporters say this could help protect endangered species and even restore damaged ecosystems.",
     "ko": "찬성하는 사람들은 이것이 멸종 위기종을 보호하고 망가진 생태계를 되살리는 데 도움이 될 수 있다고 말한다."
    },
    {
     "en": "Critics, on the other hand, raise serious questions.",
     "ko": "반면 비판하는 사람들은 심각한 질문을 던진다."
    },
    {
     "en": "Would the new animals suffer?",
     "ko": "새로 태어난 동물이 고통을 겪지는 않을까?"
    },
    {
     "en": "Where would they live, and how would they affect the plants and animals around them?",
     "ko": "그 동물들은 어디서 살고, 주변의 식물과 동물에게 어떤 영향을 줄까?"
    },
    {
     "en": "Some also argue that the money would be better spent protecting species that are still alive.",
     "ko": "그 돈을 지금 살아 있는 종을 보호하는 데 쓰는 게 낫다고 주장하는 사람들도 있다."
    },
    {
     "en": "In short, bringing back real dinosaurs is almost certainly impossible, while bringing back recently extinct animals remains possible but highly debated.",
     "ko": "정리하면, 진짜 공룡을 되살리는 것은 거의 확실히 불가능하고, 최근에 멸종한 동물을 되살리는 것은 가능할 수도 있지만 논란이 매우 크다."
    },
    {
     "en": "For your generation, these questions may become real decisions, not just movie plots.",
     "ko": "여러분 세대에게 이 질문들은 영화 줄거리가 아니라 실제로 내려야 할 결정이 될지도 모른다."
    }
   ],
   "key": 18,
   "keyWhy": {
    "en": "It sums up the answer: real dinosaurs are almost impossible to bring back, and newer cases are debated.",
    "ko": "진짜 공룡 복원은 거의 불가능하고 최근 종의 복원은 논란이라는 글의 답을 정리한 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Dinosaur DNA is too old to use, and bringing back recently extinct animals is still debated.",
      "ko": "공룡 DNA는 너무 오래되어 쓸 수 없고, 최근 멸종한 동물을 되살리는 일은 아직 논란이 있다."
     },
     {
      "en": "Scientists will bring back dinosaurs within ten years.",
      "ko": "과학자들은 10년 안에 공룡을 되살릴 것이다."
     },
     {
      "en": "Mammoths and dinosaurs lived at the same time.",
      "ko": "매머드와 공룡은 같은 시대에 살았다."
     },
     {
      "en": "De-extinction has no supporters at all.",
      "ko": "멸종 복원을 지지하는 사람은 전혀 없다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains why dinosaur DNA is gone and presents both sides of de-extinction.",
     "ko": "글은 공룡 DNA가 왜 남아 있지 않은지 설명하고, 멸종 복원에 대한 양쪽 의견을 보여 줘요."
    }
   },
   "words": [
    {
     "en": "extinct",
     "ko": "멸종한"
    },
    {
     "en": "ecosystems",
     "ko": "생태계"
    },
    {
     "en": "ancient",
     "ko": "고대의"
    }
   ],
   "summary": {
    "ko": "진짜 공룡은 돌아올 수 없지만, 더 최근의 종을 되살리는 일은 논란이 있다.",
    "en": "Real dinosaurs cannot come back, but bringing back newer species is debated.",
    "keywords": [
     "dinosaurs",
     "species",
     "debated"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-33",
   "genre": "info",
   "title": {
    "en": "The Science of Dreams",
    "ko": "꿈의 과학"
   },
   "topic": {
    "en": "Psychology",
    "ko": "심리"
   },
   "bg": {
    "en": "People often forget most of a dream within minutes of waking up.",
    "ko": "사람들은 잠에서 깬 뒤 몇 분 안에 꿈 내용의 대부분을 잊어버리는 경우가 많아요."
   },
   "sentences": [
    {
     "en": "In 1953, two researchers at the University of Chicago noticed something strange while watching people sleep.",
     "ko": "1953년, 시카고 대학교의 두 연구자가 잠자는 사람들을 지켜보다가 이상한 점을 발견했다."
    },
    {
     "en": "Every so often, the sleepers' eyes darted quickly back and forth under their closed eyelids.",
     "ko": "이따금 잠든 사람들의 눈이 감긴 눈꺼풀 아래에서 빠르게 이리저리 움직였다."
    },
    {
     "en": "When the sleepers were woken at those moments, they usually reported vivid dreams.",
     "ko": "바로 그때 깨우면, 그들은 대개 생생한 꿈을 꾸고 있었다고 말했다."
    },
    {
     "en": "Every night, most people spend around two hours dreaming, even if they remember nothing in the morning.",
     "ko": "아침에 아무것도 기억하지 못하더라도, 대부분의 사람은 매일 밤 두 시간 정도 꿈을 꾼다."
    },
    {
     "en": "But why do we dream at all?",
     "ko": "그런데 우리는 도대체 왜 꿈을 꿀까?"
    },
    {
     "en": "Scientists still do not have one final answer, yet they have learned a great deal.",
     "ko": "과학자들에게 아직 하나의 최종 답은 없지만, 많은 것을 알아냈다."
    },
    {
     "en": "Sleep moves through cycles that last about 90 minutes.",
     "ko": "잠은 약 90분 동안 이어지는 주기를 반복한다."
    },
    {
     "en": "Many of our most vivid dreams happen during a stage called REM sleep, which stands for rapid eye movement.",
     "ko": "가장 생생한 꿈의 상당수는 \"빠른 눈 운동\"을 뜻하는 렘(REM) 수면 단계에서 꾸어진다."
    },
    {
     "en": "During REM sleep, the brain is highly active, but most of the body's muscles are temporarily relaxed, so we do not act out our dreams.",
     "ko": "렘수면 동안 뇌는 매우 활발하지만 몸의 근육 대부분은 잠시 풀려 있어서, 우리는 꿈속 행동을 실제로 하지 않는다."
    },
    {
     "en": "Researchers have proposed several theories to explain why dreams exist.",
     "ko": "연구자들은 꿈이 왜 존재하는지 설명하기 위해 여러 이론을 내놓았다."
    },
    {
     "en": "One theory suggests that dreaming helps the brain store memories and connect new information with old knowledge.",
     "ko": "한 이론은 꿈이 뇌가 기억을 저장하고 새로운 정보를 기존 지식과 연결하도록 돕는다고 말한다."
    },
    {
     "en": "Another idea is that dreams help us process emotions, especially fear and stress.",
     "ko": "또 다른 생각은 꿈이 감정, 특히 두려움과 스트레스를 정리하도록 돕는다는 것이다."
    },
    {
     "en": "A third theory, sometimes called the threat simulation theory, says that dreams allow us to practice reacting to dangers safely.",
     "ko": "흔히 위협 시뮬레이션 이론이라고 불리는 세 번째 이론은, 꿈이 위험에 대처하는 연습을 안전하게 하게 해 준다고 말한다."
    },
    {
     "en": "Interestingly, some scientists argue that dreams may have no special purpose at all.",
     "ko": "흥미롭게도, 꿈에는 특별한 목적이 전혀 없을지도 모른다고 주장하는 과학자들도 있다."
    },
    {
     "en": "In their view, dreams are simply a side effect of the brain's activity during sleep.",
     "ko": "그들의 관점에서 꿈은 잠자는 동안 일어나는 뇌 활동의 부산물일 뿐이다."
    },
    {
     "en": "The truth may involve several of these ideas at once.",
     "ko": "진실은 이 생각들 중 여러 가지가 한꺼번에 맞는 것일 수도 있다."
    },
    {
     "en": "Even so, one point is widely accepted.",
     "ko": "그렇더라도 널리 인정받는 점이 하나 있다."
    },
    {
     "en": "Good sleep, including enough REM sleep, is important for learning, mood, and health.",
     "ko": "충분한 렘수면을 포함한 좋은 잠은 학습, 기분, 건강에 중요하다는 것이다."
    },
    {
     "en": "Students who stay up all night before a test may actually remember less than those who sleep well.",
     "ko": "시험 전날 밤을 새우는 학생은 잘 잔 학생보다 오히려 덜 기억할 수도 있다."
    },
    {
     "en": "Dreams remain one of the most fascinating mysteries of the human mind, and research on them continues today.",
     "ko": "꿈은 여전히 인간 마음의 가장 매혹적인 수수께끼 중 하나이고, 꿈에 대한 연구는 오늘도 계속되고 있다."
    }
   ],
   "key": 5,
   "keyWhy": {
    "en": "It states the main point early: there is no single final answer about dreams, but scientists have learned a lot.",
    "ko": "꿈에 대한 하나의 최종 답은 없지만 많은 것을 알아냈다는, 글 전체의 요지를 먼저 밝히는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Dreams happen only during the first hour of sleep.",
      "ko": "꿈은 잠든 뒤 첫 한 시간 동안에만 꾼다."
     },
     {
      "en": "Scientists have proven that dreams predict the future.",
      "ko": "과학자들은 꿈이 미래를 예언한다는 것을 증명했다."
     },
     {
      "en": "REM sleep is not important for health.",
      "ko": "렘수면은 건강에 중요하지 않다."
     },
     {
      "en": "Scientists have several theories about why we dream, but there is no single answer yet.",
      "ko": "과학자들은 우리가 꿈꾸는 이유에 대해 여러 이론을 갖고 있지만, 아직 하나의 답은 없다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text describes several theories about dreams and says scientists are still researching.",
     "ko": "글은 꿈에 대한 여러 이론을 소개하고, 과학자들이 아직 연구 중이라고 말해요."
    }
   },
   "words": [
    {
     "en": "vivid",
     "ko": "생생한"
    },
    {
     "en": "theories",
     "ko": "이론들"
    },
    {
     "en": "muscles",
     "ko": "근육"
    }
   ],
   "summary": {
    "ko": "꿈에 대한 이론은 여러 가지이지만, 과학자들은 아직 답을 찾고 있다.",
    "en": "There are several theories about dreams, but scientists are still searching for the answer.",
    "keywords": [
     "theories",
     "dreams",
     "answer"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-34",
   "genre": "info",
   "title": {
    "en": "Living on Mars: Dream or Plan?",
    "ko": "화성 이주, 꿈일까 계획일까?"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "A day on Mars is about 24 hours and 40 minutes long.",
    "ko": "화성의 하루는 약 24시간 40분이에요."
   },
   "sentences": [
    {
     "en": "Imagine stepping outside your home and seeing a pinkish sky, a small and distant Sun, and a frozen red desert stretching to the horizon.",
     "ko": "집 밖으로 나섰는데 분홍빛 하늘, 작고 멀리 보이는 태양, 지평선까지 펼쳐진 얼어붙은 붉은 사막이 보인다고 상상해 보자."
    },
    {
     "en": "Some people dream of building cities on Mars, but how realistic is this plan?",
     "ko": "화성에 도시를 세우는 꿈을 꾸는 사람들이 있지만, 이 계획은 얼마나 현실적일까?"
    },
    {
     "en": "Among the planets, Mars is often seen as the best place for humans to live after Earth.",
     "ko": "행성들 가운데 화성은 지구 다음으로 사람이 살기에 가장 좋은 곳으로 여겨지곤 한다."
    },
    {
     "en": "A day on Mars lasts about 24 hours and 40 minutes, and the planet has water ice at its poles and under its surface.",
     "ko": "화성의 하루는 약 24시간 40분이고, 극지방과 땅속에 얼음 형태의 물이 있다."
    },
    {
     "en": "Robots have explored Mars for decades, and they have taught us a great deal about its rocks, weather, and history.",
     "ko": "로봇들은 수십 년 동안 화성을 탐사하며 그곳의 암석, 날씨, 역사에 대해 많은 것을 알려 주었다."
    },
    {
     "en": "However, Mars is a very difficult place for humans.",
     "ko": "하지만 화성은 사람에게 매우 힘든 곳이다."
    },
    {
     "en": "Its air is extremely thin and made mostly of carbon dioxide, so people could not breathe there.",
     "ko": "대기는 매우 희박하고 대부분 이산화 탄소로 이루어져 있어서, 사람은 그곳에서 숨을 쉴 수 없다."
    },
    {
     "en": "The average temperature is about minus 60 degrees Celsius.",
     "ko": "평균 기온은 약 영하 60도이다."
    },
    {
     "en": "Mars also lacks a strong magnetic field, which means that dangerous radiation from space reaches the surface.",
     "ko": "화성에는 강한 자기장도 없어서, 우주에서 오는 위험한 방사선이 표면까지 닿는다."
    },
    {
     "en": "Even the journey would be a challenge, because a trip to Mars takes about six to nine months with today's rockets.",
     "ko": "가는 길조차 큰 도전이다. 오늘날의 로켓으로는 화성까지 약 6~9개월이 걸리기 때문이다."
    },
    {
     "en": "Engineers are working on solutions to these problems.",
     "ko": "공학자들은 이런 문제의 해결책을 연구하고 있다."
    },
    {
     "en": "For example, settlers might live in shelters covered with Martian soil to block radiation.",
     "ko": "예를 들어 정착민들은 방사선을 막기 위해 화성의 흙으로 덮은 거처에서 살 수도 있다."
    },
    {
     "en": "They could also split water ice into hydrogen and oxygen to make air to breathe and fuel for rockets.",
     "ko": "또 얼음을 수소와 산소로 분해해서 숨 쉴 공기와 로켓 연료를 만들 수도 있다."
    },
    {
     "en": "In 2021, NASA's Perseverance rover carried an experiment called MOXIE that produced small amounts of oxygen from the Martian air.",
     "ko": "2021년, NASA의 퍼서비어런스 탐사차에 실린 MOXIE라는 실험 장치가 화성의 대기에서 적은 양의 산소를 만들어 냈다."
    },
    {
     "en": "Still, many experts believe that a permanent city on Mars is decades away, if it happens at all.",
     "ko": "그래도 많은 전문가들은 화성의 영구 도시가 실현되더라도 수십 년은 걸릴 것이라고 본다."
    },
    {
     "en": "Others ask whether we should first take better care of Earth, which is still the only planet known to support life.",
     "ko": "생명이 사는 것으로 알려진 유일한 행성인 지구부터 더 잘 돌봐야 하지 않느냐고 묻는 사람들도 있다."
    },
    {
     "en": "In the end, living on Mars is no longer pure fantasy, but it remains an enormous scientific and ethical challenge.",
     "ko": "결국 화성에서 사는 것은 더 이상 순수한 상상만은 아니지만, 여전히 엄청난 과학적·윤리적 도전이다."
    }
   ],
   "key": 16,
   "keyWhy": {
    "en": "It gives the balanced conclusion: living on Mars is no longer fantasy but is still a huge challenge.",
    "ko": "화성 이주가 더 이상 상상만은 아니지만 여전히 엄청난 도전이라는 균형 잡힌 결론을 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Humans could easily breathe the air on Mars.",
      "ko": "사람은 화성의 공기를 쉽게 들이마실 수 있다."
     },
     {
      "en": "Living on Mars may be possible someday, but it faces huge challenges.",
      "ko": "화성에서 사는 것은 언젠가 가능할 수도 있지만, 엄청난 어려움이 있다."
     },
     {
      "en": "Robots have never been sent to Mars.",
      "ko": "화성에 로봇을 보낸 적은 한 번도 없다."
     },
     {
      "en": "A trip to Mars takes only a few days.",
      "ko": "화성까지는 며칠밖에 걸리지 않는다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text shows why Mars is attractive, explains its dangers, and describes possible solutions.",
     "ko": "글은 화성이 매력적인 이유와 위험한 점, 그리고 가능한 해결책을 함께 설명해요."
    }
   },
   "words": [
    {
     "en": "radiation",
     "ko": "방사선"
    },
    {
     "en": "settlers",
     "ko": "정착민들"
    },
    {
     "en": "permanent",
     "ko": "영구적인"
    }
   ],
   "summary": {
    "ko": "화성에서 사는 것은 가능할 수도 있지만, 매우 어렵다.",
    "en": "Living on Mars might be possible, but it is extremely difficult.",
    "keywords": [
     "living",
     "mars",
     "difficult"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-35",
   "genre": "info",
   "title": {
    "en": "Robots That Learn",
    "ko": "스스로 배우는 로봇"
   },
   "topic": {
    "en": "AI",
    "ko": "인공지능"
   },
   "bg": {
    "en": "In 1997, IBM's computer Deep Blue beat world chess champion Garry Kasparov.",
    "ko": "1997년 IBM의 컴퓨터 딥블루가 체스 세계 챔피언 가리 카스파로프를 이겼어요."
   },
   "sentences": [
    {
     "en": "In March 2016, a computer program faced Lee Sedol, one of the best Go players in the world.",
     "ko": "2016년 3월, 한 컴퓨터 프로그램이 세계 최고의 바둑 기사 중 한 명인 이세돌 9단과 맞붙었다."
    },
    {
     "en": "Few experts expected the machine to win.",
     "ko": "기계가 이길 것이라고 예상한 전문가는 거의 없었다."
    },
    {
     "en": "Yet AlphaGo won four of the five games, and no programmer had told it exactly which moves to make.",
     "ko": "그런데 알파고는 다섯 판 중 네 판을 이겼고, 어떤 프로그래머도 알파고에게 어떤 수를 둘지 정확히 알려 주지 않았다."
    },
    {
     "en": "Traditional robots follow exact instructions written by programmers.",
     "ko": "전통적인 로봇은 프로그래머가 쓴 정확한 명령을 따른다."
    },
    {
     "en": "A factory robot, for example, might repeat the same movement thousands of times a day without any change.",
     "ko": "예를 들어 공장 로봇은 하루에 수천 번씩 똑같은 동작을 아무 변화 없이 반복할 수 있다."
    },
    {
     "en": "However, a new generation of machines can improve through experience.",
     "ko": "하지만 새로운 세대의 기계는 경험을 통해 나아질 수 있다."
    },
    {
     "en": "This ability is based on machine learning, a branch of artificial intelligence.",
     "ko": "이 능력은 인공 지능의 한 분야인 기계 학습에 바탕을 두고 있다."
    },
    {
     "en": "In machine learning, a computer is not told every rule directly.",
     "ko": "기계 학습에서는 컴퓨터에게 모든 규칙을 직접 알려 주지 않는다."
    },
    {
     "en": "Instead, it studies large amounts of data and finds patterns by itself.",
     "ko": "대신 컴퓨터가 많은 양의 데이터를 살펴보고 스스로 패턴을 찾는다."
    },
    {
     "en": "Imagine teaching a computer to recognize cats.",
     "ko": "컴퓨터에게 고양이를 알아보는 법을 가르친다고 상상해 보자."
    },
    {
     "en": "Rather than describing whiskers and ears, programmers show it thousands of labeled photos of cats and other animals.",
     "ko": "수염과 귀를 설명하는 대신, 프로그래머는 고양이와 다른 동물의 이름표가 붙은 사진 수천 장을 보여 준다."
    },
    {
     "en": "Each time it makes a mistake, the system adjusts itself slightly, and gradually it becomes more accurate.",
     "ko": "실수할 때마다 시스템은 스스로를 조금씩 조정하고, 점점 더 정확해진다."
    },
    {
     "en": "Robots can learn in a similar way through trial and error.",
     "ko": "로봇도 시행착오를 통해 비슷한 방식으로 배울 수 있다."
    },
    {
     "en": "A robot arm may drop an object many times before it learns how to grip it gently.",
     "ko": "로봇 팔은 물건을 살살 쥐는 법을 배우기 전까지 여러 번 떨어뜨릴 수도 있다."
    },
    {
     "en": "This approach has produced impressive results, from voice assistants to game-playing programs.",
     "ko": "이 방식은 음성 비서부터 게임을 하는 프로그램까지 놀라운 결과를 만들어 냈다."
    },
    {
     "en": "Nevertheless, learning machines have serious limits.",
     "ko": "그럼에도 학습하는 기계에는 분명한 한계가 있다."
    },
    {
     "en": "They need huge amounts of data and energy, and they can make strange errors when they face situations that are different from their training.",
     "ko": "엄청난 양의 데이터와 에너지가 필요하고, 학습한 것과 다른 상황을 만나면 이상한 실수를 할 수 있다."
    },
    {
     "en": "If the data contains unfair patterns, the system may also repeat those unfair patterns.",
     "ko": "데이터에 불공정한 패턴이 담겨 있으면, 시스템도 그 불공정함을 그대로 따라 할 수 있다."
    },
    {
     "en": "For these reasons, experts stress that humans must test, monitor, and guide learning machines carefully.",
     "ko": "이런 이유로 전문가들은 사람이 학습하는 기계를 꼼꼼하게 시험하고, 지켜보고, 이끌어야 한다고 강조한다."
    },
    {
     "en": "Robots that learn are powerful tools, but they work best when people remain responsible for how they are used.",
     "ko": "스스로 배우는 로봇은 강력한 도구이지만, 사람이 그 쓰임에 책임을 질 때 가장 잘 작동한다."
    }
   ],
   "key": 19,
   "keyWhy": {
    "en": "It sums up the text: learning robots are powerful tools, but people must stay responsible for them.",
    "ko": "스스로 배우는 로봇은 강력하지만 사람이 책임져야 한다는 글의 결론을 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Machine learning lets robots improve from data, but humans must guide them carefully.",
      "ko": "기계 학습으로 로봇은 데이터를 통해 나아지지만, 사람이 신중하게 이끌어야 한다."
     },
     {
      "en": "Robots that learn never make mistakes.",
      "ko": "스스로 배우는 로봇은 절대 실수하지 않는다."
     },
     {
      "en": "Machine learning means writing every rule by hand.",
      "ko": "기계 학습은 모든 규칙을 손으로 직접 쓰는 것을 뜻한다."
     },
     {
      "en": "Learning robots need no data or energy.",
      "ko": "학습하는 로봇에게는 데이터나 에너지가 필요 없다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains how machines learn from data and why humans must guide them carefully.",
     "ko": "글은 기계가 데이터로 배우는 방법과, 사람이 신중하게 이끌어야 하는 이유를 설명해요."
    }
   },
   "words": [
    {
     "en": "patterns",
     "ko": "패턴, 규칙성"
    },
    {
     "en": "accurate",
     "ko": "정확한"
    },
    {
     "en": "monitor",
     "ko": "감시하다, 지켜보다"
    }
   ],
   "summary": {
    "ko": "학습하는 로봇은 데이터로 나아지지만, 사람이 잘 지켜봐야 한다.",
    "en": "Learning robots improve with data, but people must watch them carefully.",
    "keywords": [
     "robots",
     "data",
     "carefully"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-36",
   "genre": "info",
   "title": {
    "en": "The Mystery of Dark Matter",
    "ko": "암흑 물질의 수수께끼"
   },
   "topic": {
    "en": "Space",
    "ko": "우주"
   },
   "bg": {
    "en": "Ordinary matter makes up only about 5% of the total energy of the universe.",
    "ko": "우리가 아는 보통 물질은 우주 전체 에너지의 약 5%밖에 안 돼요."
   },
   "sentences": [
    {
     "en": "In the 1930s, the astronomer Fritz Zwicky noticed that galaxies in the Coma Cluster were moving far too fast.",
     "ko": "1930년대에 천문학자 프리츠 츠비키는 머리털자리 은하단의 은하들이 너무 빠르게 움직인다는 것을 알아챘다."
    },
    {
     "en": "He suggested that some invisible \"dark matter\" was holding them together, but few people took him seriously.",
     "ko": "그는 보이지 않는 \"암흑 물질\"이 은하들을 붙잡고 있다고 주장했지만, 그의 말을 진지하게 받아들인 사람은 거의 없었다."
    },
    {
     "en": "Everything we can see in the universe, from planets to stars to entire galaxies, makes up only a small part of it.",
     "ko": "행성부터 별, 은하 전체까지 우주에서 우리가 볼 수 있는 모든 것은 우주의 작은 일부일 뿐이다."
    },
    {
     "en": "Scientists believe that most of the matter in the universe is invisible.",
     "ko": "과학자들은 우주에 있는 물질 대부분이 눈에 보이지 않는다고 생각한다."
    },
    {
     "en": "They call it dark matter because it does not give off, absorb, or reflect light.",
     "ko": "그것이 빛을 내지도, 흡수하지도, 반사하지도 않기 때문에 암흑 물질이라고 부른다."
    },
    {
     "en": "If no one can see it, why do scientists think it exists?",
     "ko": "아무도 볼 수 없는데, 과학자들은 왜 그것이 있다고 생각할까?"
    },
    {
     "en": "The main reason is gravity.",
     "ko": "가장 큰 이유는 중력이다."
    },
    {
     "en": "In the 1970s, the astronomer Vera Rubin studied how fast stars move around the centers of galaxies.",
     "ko": "1970년대에 천문학자 베라 루빈은 별들이 은하 중심을 얼마나 빨리 도는지 연구했다."
    },
    {
     "en": "She found that stars near the outer edges were moving much faster than expected.",
     "ko": "그녀는 은하 바깥쪽 가장자리의 별들이 예상보다 훨씬 빠르게 움직인다는 것을 발견했다."
    },
    {
     "en": "Based on the visible matter alone, these galaxies should have flown apart.",
     "ko": "눈에 보이는 물질만으로 계산하면, 이 은하들은 흩어져 버렸어야 한다."
    },
    {
     "en": "Something unseen must be adding extra gravity to hold them together.",
     "ko": "보이지 않는 무언가가 추가로 중력을 더해 은하를 붙잡고 있는 것이 틀림없다."
    },
    {
     "en": "Other observations support this idea, such as the way large clusters of galaxies bend the light that passes near them, an effect called gravitational lensing.",
     "ko": "거대한 은하단이 근처를 지나는 빛을 휘게 하는 중력 렌즈 효과 같은 다른 관측도 이 생각을 뒷받침한다."
    },
    {
     "en": "Today, scientists estimate that dark matter makes up about 85 percent of all the matter in the universe.",
     "ko": "오늘날 과학자들은 암흑 물질이 우주 전체 물질의 약 85%를 차지한다고 추정한다."
    },
    {
     "en": "Yet the biggest surprise is that no one knows what it actually is.",
     "ko": "그런데 가장 놀라운 점은 그것이 실제로 무엇인지 아무도 모른다는 것이다."
    },
    {
     "en": "Many scientists think it is made of tiny particles that have not been discovered yet.",
     "ko": "많은 과학자들은 그것이 아직 발견되지 않은 아주 작은 입자로 이루어져 있다고 생각한다."
    },
    {
     "en": "Huge detectors have been built deep underground to catch these particles, but none has been detected so far.",
     "ko": "이 입자를 잡기 위해 땅속 깊은 곳에 거대한 검출기들이 만들어졌지만, 지금까지 하나도 검출되지 않았다."
    },
    {
     "en": "A small group of researchers even suggests that our understanding of gravity itself may need to change.",
     "ko": "소수의 연구자들은 중력에 대한 우리의 이해 자체가 바뀌어야 할지도 모른다고 주장하기도 한다."
    },
    {
     "en": "The mystery of dark matter shows that, despite all our knowledge, much of the universe is still unknown.",
     "ko": "암흑 물질의 수수께끼는 우리가 많은 것을 알게 되었는데도, 우주의 상당 부분이 여전히 미지의 영역이라는 것을 보여 준다."
    }
   ],
   "key": 17,
   "keyWhy": {
    "en": "It gives the big lesson: despite all we know, much of the universe is still unknown.",
    "ko": "우리가 많이 알게 되었어도 우주의 상당 부분은 아직 미지라는 큰 교훈을 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Dark matter is easy to see with a normal telescope.",
      "ko": "암흑 물질은 보통 망원경으로 쉽게 볼 수 있다."
     },
     {
      "en": "Vera Rubin discovered a new planet.",
      "ko": "베라 루빈은 새로운 행성을 발견했다."
     },
     {
      "en": "Scientists know dark matter exists because of its gravity, but they still do not know what it is.",
      "ko": "과학자들은 중력 때문에 암흑 물질이 있다는 것을 알지만, 그것이 무엇인지는 아직 모른다."
     },
     {
      "en": "Most of the matter in the universe is made of stars.",
      "ko": "우주 물질의 대부분은 별로 이루어져 있다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text explains the gravity evidence for dark matter and says no one yet knows what it is.",
     "ko": "글은 암흑 물질이 있다는 중력의 증거를 설명하고, 그것이 무엇인지는 아직 아무도 모른다고 말해요."
    }
   },
   "words": [
    {
     "en": "invisible",
     "ko": "보이지 않는"
    },
    {
     "en": "gravity",
     "ko": "중력"
    },
    {
     "en": "particles",
     "ko": "입자들"
    }
   ],
   "summary": {
    "ko": "암흑 물질은 볼 수 없지만, 그 중력이 존재를 보여 준다.",
    "en": "Dark matter cannot be seen, but its gravity shows that it exists.",
    "keywords": [
     "matter",
     "gravity",
     "exists"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-37",
   "genre": "info",
   "title": {
    "en": "How Pandemics Spread",
    "ko": "전염병은 어떻게 퍼질까"
   },
   "topic": {
    "en": "Medicine",
    "ko": "의학"
   },
   "bg": {
    "en": "The word \"vaccine\" comes from vacca, the Latin word for cow.",
    "ko": "\"백신(vaccine)\"이라는 말은 소를 뜻하는 라틴어 \"vacca\"에서 왔어요."
   },
   "sentences": [
    {
     "en": "In 1854, people in one London neighborhood began dying of cholera at a terrifying rate.",
     "ko": "1854년, 런던의 한 동네에서 사람들이 무서운 속도로 콜레라에 걸려 죽기 시작했다."
    },
    {
     "en": "A doctor named John Snow marked each death on a map and noticed that most victims had used the same water pump.",
     "ko": "존 스노라는 의사가 사망자를 하나하나 지도에 표시하다가, 희생자 대부분이 같은 물 펌프를 썼다는 것을 알아냈다."
    },
    {
     "en": "His map helped show that the disease spread through dirty water.",
     "ko": "그의 지도는 이 병이 더러운 물을 통해 퍼진다는 것을 밝히는 데 도움이 되었다."
    },
    {
     "en": "A disease that starts in one small town can sometimes reach every continent within a few months.",
     "ko": "작은 마을 하나에서 시작된 병이 때로는 몇 달 만에 모든 대륙에 퍼지기도 한다."
    },
    {
     "en": "When an infectious disease spreads widely across many countries, it is called a pandemic.",
     "ko": "전염병이 여러 나라에 걸쳐 널리 퍼지면, 그것을 팬데믹(세계적 대유행)이라고 한다."
    },
    {
     "en": "Pandemics are caused by germs such as viruses and bacteria that pass from person to person.",
     "ko": "팬데믹은 사람에게서 사람으로 옮겨 가는 바이러스나 세균 같은 병원체 때문에 일어난다."
    },
    {
     "en": "Some germs spread through tiny drops in the air when people cough, sneeze, or talk.",
     "ko": "어떤 병원체는 사람이 기침하거나, 재채기하거나, 말할 때 공기 중의 작은 침방울을 통해 퍼진다."
    },
    {
     "en": "Others spread through touch or contaminated water.",
     "ko": "다른 병원체는 접촉이나 오염된 물을 통해 퍼진다."
    },
    {
     "en": "Scientists often describe how fast a disease spreads with a number called R, the reproduction number.",
     "ko": "과학자들은 병이 얼마나 빨리 퍼지는지를 감염 재생산 지수, 즉 R이라는 숫자로 나타내곤 한다."
    },
    {
     "en": "R is the average number of people that one sick person infects.",
     "ko": "R은 환자 한 명이 평균적으로 감염시키는 사람의 수이다."
    },
    {
     "en": "If R is above one, the number of cases grows; if it is below one, the outbreak slowly shrinks.",
     "ko": "R이 1보다 크면 환자 수가 늘어나고, 1보다 작으면 유행이 서서히 줄어든다."
    },
    {
     "en": "Modern life has made it easier for germs to travel.",
     "ko": "현대 생활은 병원체가 이동하기 더 쉽게 만들었다."
    },
    {
     "en": "Airplanes can carry an infected person across the world in less than a day, and crowded cities allow diseases to spread quickly.",
     "ko": "비행기는 감염된 사람을 하루도 안 되어 지구 반대편까지 데려갈 수 있고, 붐비는 도시에서는 병이 빠르게 퍼진다."
    },
    {
     "en": "In addition, many new diseases begin in animals and then jump to humans.",
     "ko": "게다가 많은 새로운 병이 동물에게서 시작해 사람에게 옮겨 온다."
    },
    {
     "en": "However, modern society also has powerful tools to fight back.",
     "ko": "하지만 현대 사회에는 맞서 싸울 강력한 도구도 있다."
    },
    {
     "en": "Vaccines train the immune system to recognize germs before a person becomes sick.",
     "ko": "백신은 사람이 병에 걸리기 전에 면역 체계가 병원체를 알아보도록 훈련시킨다."
    },
    {
     "en": "Simple actions, such as washing hands and staying home when ill, can lower the value of R.",
     "ko": "손 씻기나 아플 때 집에 머물기 같은 간단한 행동도 R 값을 낮출 수 있다."
    },
    {
     "en": "Scientists also track cases around the world so that health workers can respond early.",
     "ko": "과학자들은 보건 인력이 일찍 대응할 수 있도록 전 세계의 환자 발생을 추적하기도 한다."
    },
    {
     "en": "History shows that pandemics, such as the 1918 flu and COVID-19, can cause enormous harm.",
     "ko": "1918년 독감과 코로나19 같은 팬데믹이 엄청난 피해를 줄 수 있다는 것을 역사가 보여 준다."
    },
    {
     "en": "Understanding how diseases spread helps people make wise choices that protect both themselves and others.",
     "ko": "병이 어떻게 퍼지는지 이해하면, 나와 다른 사람을 함께 지키는 현명한 선택을 할 수 있다."
    }
   ],
   "key": 19,
   "keyWhy": {
    "en": "It states the main message: understanding how diseases spread helps us protect ourselves and others.",
    "ko": "병이 퍼지는 방식을 이해하면 나와 남을 함께 지킬 수 있다는 핵심 메시지를 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Pandemics only happen in small towns.",
      "ko": "팬데믹은 작은 마을에서만 일어난다."
     },
     {
      "en": "Diseases spread in several ways, but science and simple actions can slow them down.",
      "ko": "병은 여러 방식으로 퍼지지만, 과학과 간단한 행동으로 늦출 수 있다."
     },
     {
      "en": "Vaccines make diseases spread faster.",
      "ko": "백신은 병을 더 빨리 퍼지게 한다."
     },
     {
      "en": "If R is below one, the outbreak always grows.",
      "ko": "R이 1보다 작으면 유행은 항상 커진다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text explains how germs spread and how vaccines and simple actions can slow them.",
     "ko": "글은 병원체가 퍼지는 방식과, 백신과 간단한 행동으로 그 속도를 늦추는 방법을 설명해요."
    }
   },
   "words": [
    {
     "en": "infectious",
     "ko": "전염성의"
    },
    {
     "en": "contaminated",
     "ko": "오염된"
    },
    {
     "en": "outbreak",
     "ko": "(질병의) 발생, 유행"
    }
   ],
   "summary": {
    "ko": "병이 퍼지는 방식을 알면 그 속도를 늦출 수 있다.",
    "en": "Knowing how diseases spread helps us slow them down.",
    "keywords": [
     "diseases",
     "spread",
     "slow"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-38",
   "genre": "info",
   "title": {
    "en": "The Ocean's Twilight Zone",
    "ko": "바다의 박명대"
   },
   "topic": {
    "en": "Ocean",
    "ko": "바다"
   },
   "bg": {
    "en": "The average depth of the ocean is about 3,700 meters.",
    "ko": "바다의 평균 깊이는 약 3,700m예요."
   },
   "sentences": [
    {
     "en": "Imagine sinking slowly into the ocean in a small submarine as the blue light outside fades to black.",
     "ko": "작은 잠수정을 타고 천천히 바닷속으로 내려가는데, 창밖의 푸른빛이 점점 검게 변한다고 상상해 보자."
    },
    {
     "en": "Suddenly, tiny sparks of light flash past the window.",
     "ko": "갑자기 작은 불빛들이 창밖을 반짝이며 스쳐 지나간다."
    },
    {
     "en": "Below the bright, sunny surface of the ocean lies a dim and mysterious world.",
     "ko": "밝고 햇살 가득한 바다 표면 아래에는 어둡고 신비로운 세계가 있다."
    },
    {
     "en": "Scientists call it the twilight zone, or the mesopelagic zone.",
     "ko": "과학자들은 그곳을 박명대, 또는 중층대라고 부른다."
    },
    {
     "en": "It stretches from about 200 to 1,000 meters below the surface.",
     "ko": "이 층은 수면 아래 약 200미터에서 1,000미터까지 이어진다."
    },
    {
     "en": "Only a small amount of sunlight reaches this layer, so it is too dark for plants to grow.",
     "ko": "이 층에는 햇빛이 아주 조금만 닿아서, 식물이 자라기에는 너무 어둡다."
    },
    {
     "en": "Still, the twilight zone is full of life.",
     "ko": "그래도 박명대는 생명으로 가득하다."
    },
    {
     "en": "Many of its animals are small fish, shrimp, and jellyfish that have unusual features.",
     "ko": "이곳 동물의 상당수는 독특한 특징을 지닌 작은 물고기, 새우, 해파리이다."
    },
    {
     "en": "Some have huge eyes to collect what little light there is.",
     "ko": "어떤 동물은 얼마 안 되는 빛을 모으기 위해 커다란 눈을 갖고 있다."
    },
    {
     "en": "Others produce their own light, a skill called bioluminescence, to find food, attract partners, or confuse predators.",
     "ko": "또 어떤 동물은 먹이를 찾거나, 짝을 끌어들이거나, 포식자를 헷갈리게 하려고 생물 발광이라는 능력으로 스스로 빛을 낸다."
    },
    {
     "en": "One of the most remarkable events on the planet happens here every day.",
     "ko": "지구에서 가장 놀라운 일 중 하나가 매일 이곳에서 일어난다."
    },
    {
     "en": "At night, enormous numbers of animals swim up toward the surface to feed, and before sunrise they return to the darkness to hide from predators.",
     "ko": "밤이 되면 엄청난 수의 동물이 먹이를 먹으러 수면 쪽으로 헤엄쳐 오르고, 해가 뜨기 전에 포식자를 피해 다시 어둠 속으로 돌아간다."
    },
    {
     "en": "This daily movement, known as diel vertical migration, is thought to be the largest animal migration on Earth.",
     "ko": "일주기 수직 이동이라고 불리는 이 매일의 이동은 지구에서 가장 큰 동물 이동으로 여겨진다."
    },
    {
     "en": "Surprisingly, the twilight zone also helps to control Earth's climate.",
     "ko": "놀랍게도 박명대는 지구의 기후를 조절하는 데에도 도움을 준다."
    },
    {
     "en": "When its animals eat near the surface and then return to the deep, they carry carbon downward, where some of it can stay for a long time.",
     "ko": "이곳 동물들이 수면 근처에서 먹고 깊은 곳으로 돌아가면 탄소를 아래로 옮기게 되고, 그 일부는 오랫동안 그곳에 머물 수 있다."
    },
    {
     "en": "As a result, this hidden layer helps to remove carbon dioxide from the atmosphere.",
     "ko": "그 결과, 이 숨겨진 층은 대기에서 이산화 탄소를 없애는 데 도움을 준다."
    },
    {
     "en": "However, scientists still know very little about it.",
     "ko": "하지만 과학자들은 아직 이곳에 대해 아는 것이 거의 없다."
    },
    {
     "en": "Some companies are interested in catching twilight-zone fish to make fish meal, and researchers worry that this could harm the ecosystem before we fully understand it.",
     "ko": "몇몇 기업은 어분을 만들기 위해 박명대의 물고기를 잡는 데 관심이 있고, 연구자들은 우리가 이 생태계를 제대로 이해하기도 전에 해칠까 봐 걱정한다."
    },
    {
     "en": "Protecting the twilight zone may be important not only for ocean life but also for the future of our planet.",
     "ko": "박명대를 보호하는 일은 바다 생물뿐 아니라 지구의 미래에도 중요할지 모른다."
    }
   ],
   "key": 18,
   "keyWhy": {
    "en": "It states why the text matters: protecting the twilight zone is important for ocean life and for our planet.",
    "ko": "박명대를 지키는 일이 바다 생물과 지구 모두에 중요하다는, 글이 말하려는 핵심을 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "The twilight zone is bright and full of plants.",
      "ko": "박명대는 밝고 식물이 가득하다."
     },
     {
      "en": "Animals in the twilight zone never move.",
      "ko": "박명대의 동물들은 전혀 움직이지 않는다."
     },
     {
      "en": "Scientists know everything about the deep ocean.",
      "ko": "과학자들은 깊은 바다에 대해 모든 것을 안다."
     },
     {
      "en": "The twilight zone is a dark ocean layer full of life that also helps Earth's climate.",
      "ko": "박명대는 생명으로 가득한 어두운 바다층이며, 지구의 기후에도 도움을 준다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text describes the life in this dark layer and explains how it helps control Earth's climate.",
     "ko": "글은 어두운 박명대에 사는 생물을 소개하고, 이 층이 지구 기후 조절을 어떻게 돕는지 설명해요."
    }
   },
   "words": [
    {
     "en": "predators",
     "ko": "포식자들"
    },
    {
     "en": "migration",
     "ko": "이동, 이주"
    },
    {
     "en": "carbon",
     "ko": "탄소"
    }
   ],
   "summary": {
    "ko": "바다의 박명대는 생명으로 가득하고 기후 조절을 돕는다.",
    "en": "The ocean's twilight zone is full of life and helps to control the climate.",
    "keywords": [
     "twilight",
     "life",
     "climate"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-39",
   "genre": "info",
   "title": {
    "en": "Can Money Buy Happiness?",
    "ko": "돈으로 행복을 살 수 있을까?"
   },
   "topic": {
    "en": "Economy",
    "ko": "경제"
   },
   "bg": {
    "en": "GDP is the total value of all the goods and services a country produces in a period of time.",
    "ko": "GDP(국내 총생산)는 한 나라에서 일정 기간 생산된 모든 상품과 서비스의 가치를 합한 것이에요."
   },
   "sentences": [
    {
     "en": "Imagine winning the lottery tomorrow.",
     "ko": "내일 복권에 당첨된다고 상상해 보자."
    },
    {
     "en": "Most people believe their problems would disappear overnight.",
     "ko": "대부분의 사람은 모든 문제가 하룻밤 사이에 사라질 것이라고 믿는다."
    },
    {
     "en": "Yet a well-known study from 1978 found that lottery winners were not much happier than people who had not won.",
     "ko": "그런데 1978년의 잘 알려진 한 연구는 복권 당첨자들이 당첨되지 않은 사람들보다 별로 더 행복하지 않다는 결과를 내놓았다."
    },
    {
     "en": "Many people believe that if they just had more money, they would be happier.",
     "ko": "많은 사람들은 돈이 조금만 더 있으면 더 행복할 것이라고 믿는다."
    },
    {
     "en": "Is this belief true?",
     "ko": "이 믿음은 사실일까?"
    },
    {
     "en": "Researchers have studied this question for decades, and the answer is more complicated than a simple yes or no.",
     "ko": "연구자들은 수십 년 동안 이 질문을 연구했는데, 답은 단순히 \"예\" 또는 \"아니요\"보다 복잡하다."
    },
    {
     "en": "First, money clearly matters when people do not have enough of it.",
     "ko": "먼저, 돈이 충분하지 않을 때는 돈이 분명히 중요하다."
    },
    {
     "en": "A family that cannot pay for food, housing, or medical care faces constant stress.",
     "ko": "음식, 집, 의료비를 낼 수 없는 가정은 끊임없는 스트레스를 겪는다."
    },
    {
     "en": "For such people, extra income can greatly improve daily life and well-being.",
     "ko": "이런 사람들에게는 추가 소득이 일상과 행복을 크게 높여 줄 수 있다."
    },
    {
     "en": "However, the effect becomes weaker as people grow richer.",
     "ko": "하지만 사람이 부유해질수록 그 효과는 약해진다."
    },
    {
     "en": "Moving from very poor to comfortable makes a big difference, but moving from rich to very rich usually changes much less.",
     "ko": "아주 가난한 상태에서 넉넉한 상태로 가는 것은 큰 차이를 만들지만, 부자에서 큰 부자가 되는 것은 보통 훨씬 작은 변화를 가져온다."
    },
    {
     "en": "Economists often explain this with the idea of diminishing returns.",
     "ko": "경제학자들은 이것을 수확 체감이라는 개념으로 설명하곤 한다."
    },
    {
     "en": "Some studies have even suggested that, above a certain income, happiness stops rising, while others have found that it continues to rise slowly.",
     "ko": "어떤 연구는 일정 소득을 넘으면 행복이 더 오르지 않는다고 했고, 다른 연구는 천천히 계속 오른다는 결과를 내놓기도 했다."
    },
    {
     "en": "Interestingly, how people spend money may matter as much as how much they have.",
     "ko": "흥미롭게도, 돈을 얼마나 가졌는지만큼 어떻게 쓰는지도 중요할 수 있다."
    },
    {
     "en": "Research suggests that spending on experiences, such as trips with friends, often brings more lasting joy than buying objects.",
     "ko": "연구에 따르면 친구와의 여행 같은 경험에 돈을 쓰는 것이 물건을 사는 것보다 더 오래가는 기쁨을 주는 경우가 많다."
    },
    {
     "en": "Spending money on other people, for example by giving gifts or donating, can also increase happiness.",
     "ko": "선물을 하거나 기부하는 것처럼 다른 사람을 위해 돈을 쓰는 것도 행복을 높일 수 있다."
    },
    {
     "en": "In addition, many factors that strongly affect happiness cannot be bought, including close relationships, good health, and a sense of purpose.",
     "ko": "게다가 가까운 관계, 건강, 삶의 목적의식처럼 행복에 큰 영향을 주는 많은 것들은 돈으로 살 수 없다."
    },
    {
     "en": "In conclusion, money can buy a certain amount of happiness, especially by meeting basic needs, but it is not the whole story.",
     "ko": "결론적으로, 돈은 특히 기본적인 필요를 채워 줌으로써 어느 정도의 행복을 살 수 있지만, 그것이 전부는 아니다."
    },
    {
     "en": "A happy life also depends on the choices we make and the people we share it with.",
     "ko": "행복한 삶은 우리가 하는 선택과 함께하는 사람들에게도 달려 있다."
    }
   ],
   "key": 17,
   "keyWhy": {
    "en": "It gives the conclusion: money can buy some happiness by meeting basic needs, but it is not the whole story.",
    "ko": "돈은 기본적인 필요를 채워 어느 정도 행복을 줄 수 있지만 전부는 아니라는 결론을 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Money has nothing to do with happiness.",
      "ko": "돈은 행복과 아무 관계가 없다."
     },
     {
      "en": "The richer people get, the happier they always become, without limit.",
      "ko": "사람은 부유해질수록 끝없이 더 행복해진다."
     },
     {
      "en": "Money helps happiness, especially for basic needs, but other things matter too.",
      "ko": "돈은 특히 기본적인 필요를 채울 때 행복에 도움이 되지만, 다른 것들도 중요하다."
     },
     {
      "en": "Buying objects brings more joy than experiences.",
      "ko": "물건을 사는 것이 경험보다 더 큰 기쁨을 준다."
     }
    ],
    "answer": 2,
    "why": {
     "en": "The text shows that money matters most for basic needs and that other things also affect happiness.",
     "ko": "글은 돈이 기본적인 필요를 채울 때 가장 중요하고, 다른 것들도 행복에 영향을 준다고 설명해요."
    }
   },
   "words": [
    {
     "en": "income",
     "ko": "소득"
    },
    {
     "en": "diminishing",
     "ko": "줄어드는, 감소하는"
    },
    {
     "en": "relationships",
     "ko": "관계"
    }
   ],
   "summary": {
    "ko": "돈은 행복에 도움이 될 수 있지만, 전부는 아니다.",
    "en": "Money can help us be happy, but it is not everything.",
    "keywords": [
     "money",
     "happy",
     "everything"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-40",
   "genre": "info",
   "title": {
    "en": "Music and the Brain",
    "ko": "음악과 뇌"
   },
   "topic": {
    "en": "Music",
    "ko": "음악"
   },
   "bg": {
    "en": "Human ears can hear sounds from about 20 Hz to 20,000 Hz.",
    "ko": "사람의 귀는 대략 20Hz에서 20,000Hz 사이의 소리를 들을 수 있어요."
   },
   "sentences": [
    {
     "en": "In 2011, a team of scientists in Canada asked volunteers to bring their favorite music into a lab.",
     "ko": "2011년, 캐나다의 한 과학자 팀이 참가자들에게 가장 좋아하는 음악을 실험실에 가져오라고 했다."
    },
    {
     "en": "While the volunteers listened, brain scans showed a burst of activity in the brain's reward system, especially at the moments when they felt chills.",
     "ko": "참가자들이 음악을 듣는 동안, 뇌 영상에는 보상 체계에서 활동이 폭발적으로 늘어나는 모습이 나타났다. 특히 소름이 돋는 순간에 그랬다."
    },
    {
     "en": "Have you ever noticed that a favorite song can instantly change your mood?",
     "ko": "좋아하는 노래 한 곡이 순식간에 기분을 바꿀 수 있다는 것을 느껴 본 적이 있는가?"
    },
    {
     "en": "This happens because music has a powerful effect on the brain.",
     "ko": "음악이 뇌에 강력한 영향을 주기 때문이다."
    },
    {
     "en": "When we listen to music, many different parts of the brain work together.",
     "ko": "음악을 들을 때는 뇌의 여러 부분이 함께 일한다."
    },
    {
     "en": "Some areas process sound and rhythm, others handle memory, and still others control emotion and movement.",
     "ko": "어떤 영역은 소리와 리듬을 처리하고, 어떤 영역은 기억을, 또 다른 영역은 감정과 움직임을 담당한다."
    },
    {
     "en": "Few other activities use so much of the brain at the same time.",
     "ko": "이렇게 많은 뇌 영역을 동시에 쓰는 활동은 많지 않다."
    },
    {
     "en": "Music can also make us feel pleasure.",
     "ko": "음악은 즐거움을 느끼게 해 주기도 한다."
    },
    {
     "en": "Studies using brain scans have shown that enjoyable music can trigger the release of dopamine, a chemical linked to reward and motivation.",
     "ko": "뇌 영상 연구에 따르면 즐거운 음악은 보상과 동기와 관련된 화학 물질인 도파민을 분비하게 할 수 있다."
    },
    {
     "en": "That is one reason why we sometimes feel chills during a beautiful piece of music.",
     "ko": "아름다운 음악을 들을 때 가끔 소름이 돋는 이유 중 하나가 바로 이것이다."
    },
    {
     "en": "Music is closely connected to memory as well.",
     "ko": "음악은 기억과도 깊이 연결되어 있다."
    },
    {
     "en": "A song from childhood can bring back clear memories of people and places.",
     "ko": "어린 시절의 노래 한 곡이 사람과 장소에 대한 기억을 또렷하게 되살려 주기도 한다."
    },
    {
     "en": "In fact, some patients with memory problems, such as Alzheimer's disease, can still recognize and sing familiar songs.",
     "ko": "실제로 알츠하이머병처럼 기억에 문제가 있는 환자들 중에도 익숙한 노래를 알아보고 따라 부르는 사람들이 있다."
    },
    {
     "en": "Because of this, music therapy is used in some hospitals and care homes.",
     "ko": "그래서 일부 병원과 요양 시설에서는 음악 치료를 활용한다."
    },
    {
     "en": "But does playing music make people smarter?",
     "ko": "그렇다면 음악을 연주하면 더 똑똑해질까?"
    },
    {
     "en": "Here, the evidence is mixed.",
     "ko": "이 부분에 대해서는 증거가 엇갈린다."
    },
    {
     "en": "Learning an instrument trains skills such as concentration, listening, and coordination, and some studies link it to better performance in certain areas.",
     "ko": "악기를 배우면 집중력, 듣기, 협응력 같은 능력이 훈련되고, 몇몇 연구는 이것이 특정 분야의 더 나은 성과와 관련 있다고 한다."
    },
    {
     "en": "However, the popular idea that simply listening to classical music raises intelligence, often called the \"Mozart effect,\" is not supported by strong evidence.",
     "ko": "하지만 클래식 음악을 듣기만 해도 지능이 높아진다는, 흔히 \"모차르트 효과\"라고 불리는 생각은 강한 증거로 뒷받침되지 않는다."
    },
    {
     "en": "In short, music is not a magic shortcut to intelligence, but it is a rich activity that engages the whole brain and touches our emotions and memories.",
     "ko": "정리하면, 음악은 똑똑해지는 마법 같은 지름길은 아니지만, 뇌 전체를 쓰고 감정과 기억을 건드리는 풍부한 활동이다."
    }
   ],
   "key": 18,
   "keyWhy": {
    "en": "It sums up the text: music is not a shortcut to intelligence, but it engages the whole brain.",
    "ko": "음악은 지능을 높이는 지름길은 아니지만 뇌 전체를 쓰는 풍부한 활동이라는 글의 요지를 정리한 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Music affects many parts of the brain, including emotion and memory, but it is not a magic way to become smarter.",
      "ko": "음악은 감정과 기억을 포함해 뇌의 여러 부분에 영향을 주지만, 똑똑해지는 마법 같은 방법은 아니다."
     },
     {
      "en": "Listening to Mozart greatly raises intelligence.",
      "ko": "모차르트 음악을 들으면 지능이 크게 높아진다."
     },
     {
      "en": "Music uses only one small part of the brain.",
      "ko": "음악은 뇌의 작은 한 부분만 사용한다."
     },
     {
      "en": "People with memory problems cannot respond to music.",
      "ko": "기억에 문제가 있는 사람은 음악에 반응하지 못한다."
     }
    ],
    "answer": 0,
    "why": {
     "en": "The text explains how music affects emotion and memory and questions the idea that it makes us smarter.",
     "ko": "글은 음악이 감정과 기억에 주는 영향을 설명하고, 음악이 우리를 똑똑하게 만든다는 생각에는 의문을 던져요."
    }
   },
   "words": [
    {
     "en": "rhythm",
     "ko": "리듬"
    },
    {
     "en": "dopamine",
     "ko": "도파민"
    },
    {
     "en": "therapy",
     "ko": "치료, 요법"
    }
   ],
   "summary": {
    "ko": "음악은 감정과 기억에 영향을 주지만, 마법처럼 우리를 똑똑하게 만들지는 않는다.",
    "en": "Music affects our feelings and memories, but it does not magically make us smarter.",
    "keywords": [
     "music",
     "memories",
     "smarter"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-41",
   "genre": "info",
   "title": {
    "en": "Self-Driving Cars and Trust",
    "ko": "자율 주행차와 신뢰"
   },
   "topic": {
    "en": "Technology",
    "ko": "기술"
   },
   "bg": {
    "en": "The first traffic light was installed in London in 1868.",
    "ko": "세계 최초의 신호등은 1868년 영국 런던에 설치되었어요."
   },
   "sentences": [
    {
     "en": "In 2004, a U.S. military research agency held a race across the Mojave Desert for cars with no drivers.",
     "ko": "2004년, 미국의 한 군사 연구 기관이 모하비 사막을 가로지르는 무인 자동차 경주를 열었다."
    },
    {
     "en": "Not a single car finished, and the best one traveled only about 12 kilometers.",
     "ko": "완주한 차는 한 대도 없었고, 가장 멀리 간 차도 약 12킬로미터밖에 가지 못했다."
    },
    {
     "en": "Just one year later, five cars completed the course.",
     "ko": "그런데 겨우 1년 뒤에는 다섯 대의 차가 코스를 완주했다."
    },
    {
     "en": "Imagine getting into a car, telling it where to go, and reading a book while it drives you there.",
     "ko": "차에 타서 목적지를 말하고, 차가 데려다주는 동안 책을 읽는다고 상상해 보자."
    },
    {
     "en": "This is the promise of self-driving cars, also called autonomous vehicles.",
     "ko": "이것이 자율 주행차가 약속하는 모습이다."
    },
    {
     "en": "These cars use cameras, radar, and other sensors to understand the road around them.",
     "ko": "이런 차는 카메라, 레이더, 그 밖의 센서로 주변 도로를 파악한다."
    },
    {
     "en": "Computer programs then decide when to speed up, slow down, or turn.",
     "ko": "그러면 컴퓨터 프로그램이 언제 속도를 높이고, 줄이고, 방향을 바꿀지 결정한다."
    },
    {
     "en": "Supporters argue that self-driving cars could save many lives.",
     "ko": "찬성하는 사람들은 자율 주행차가 많은 생명을 구할 수 있다고 주장한다."
    },
    {
     "en": "Studies of road accidents have found that human error, such as distraction or tiredness, plays a role in most crashes.",
     "ko": "교통사고 연구에 따르면 부주의나 피로 같은 사람의 실수가 대부분의 사고에 영향을 준다."
    },
    {
     "en": "A computer never gets sleepy, angry, or distracted by a phone.",
     "ko": "컴퓨터는 졸리거나, 화가 나거나, 휴대폰 때문에 한눈을 팔지 않는다."
    },
    {
     "en": "Self-driving cars could also help elderly people and people with disabilities travel independently.",
     "ko": "자율 주행차는 노인과 장애가 있는 사람들이 혼자서 이동하는 데에도 도움이 될 수 있다."
    },
    {
     "en": "However, there is a big challenge: trust.",
     "ko": "하지만 큰 과제가 있다. 바로 신뢰이다."
    },
    {
     "en": "Many people feel uncomfortable letting a machine make life-and-death decisions.",
     "ko": "많은 사람들은 기계가 생사가 걸린 결정을 내리게 하는 것을 불편하게 느낀다."
    },
    {
     "en": "Self-driving systems can still be confused by unusual situations, such as heavy snow, road construction, or a person behaving unexpectedly.",
     "ko": "자율 주행 시스템은 폭설, 도로 공사, 예상치 못하게 행동하는 사람 같은 특이한 상황에서 아직 혼란을 겪을 수 있다."
    },
    {
     "en": "When an accident does happen, it is also unclear who should be responsible: the passenger, the car company, or the software designer.",
     "ko": "사고가 났을 때 승객, 자동차 회사, 소프트웨어 설계자 중 누가 책임져야 하는지도 분명하지 않다."
    },
    {
     "en": "In addition, engineers must protect the cars from hackers.",
     "ko": "게다가 공학자들은 해커로부터 차를 지켜야 한다."
    },
    {
     "en": "For these reasons, most countries are introducing self-driving technology step by step, with strict testing and new laws.",
     "ko": "이런 이유로 대부분의 나라는 엄격한 시험과 새로운 법을 갖추며 자율 주행 기술을 단계적으로 도입하고 있다."
    },
    {
     "en": "Engineers often describe levels of automation from zero, meaning no automation, to five, meaning the car can drive itself everywhere.",
     "ko": "공학자들은 자동화 수준을 자동화가 전혀 없는 0단계부터 어디서나 스스로 운전할 수 있는 5단계까지로 나누곤 한다."
    },
    {
     "en": "Most cars on the road today are still at the lower levels.",
     "ko": "오늘날 도로 위의 차 대부분은 아직 낮은 단계에 있다."
    },
    {
     "en": "In the end, self-driving cars will only succeed if the technology proves safe and people come to trust it.",
     "ko": "결국 자율 주행차는 기술이 안전하다는 것이 증명되고 사람들이 그것을 믿게 될 때에만 성공할 수 있다."
    }
   ],
   "key": 19,
   "keyWhy": {
    "en": "It gives the conclusion: self-driving cars will succeed only if they prove safe and people trust them.",
    "ko": "자율 주행차는 안전이 증명되고 사람들이 믿을 때에만 성공한다는 결론을 담은 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Self-driving cars have already replaced all human drivers.",
      "ko": "자율 주행차가 이미 모든 사람 운전자를 대신하고 있다."
     },
     {
      "en": "Human drivers never make mistakes.",
      "ko": "사람 운전자는 절대 실수하지 않는다."
     },
     {
      "en": "Self-driving cars do not use any sensors.",
      "ko": "자율 주행차는 센서를 전혀 쓰지 않는다."
     },
     {
      "en": "Self-driving cars could make roads safer, but they must first earn people's trust.",
      "ko": "자율 주행차는 도로를 더 안전하게 만들 수 있지만, 먼저 사람들의 신뢰를 얻어야 한다."
     }
    ],
    "answer": 3,
    "why": {
     "en": "The text presents the benefits of self-driving cars and explains why trust is still a big challenge.",
     "ko": "글은 자율 주행차의 장점을 소개하고, 신뢰가 왜 여전히 큰 과제인지 설명해요."
    }
   },
   "words": [
    {
     "en": "sensors",
     "ko": "센서, 감지기"
    },
    {
     "en": "distraction",
     "ko": "주의 산만, 부주의"
    },
    {
     "en": "automation",
     "ko": "자동화"
    }
   ],
   "summary": {
    "ko": "자율 주행차는 사람들이 널리 쓰기 전에 안전하고 믿을 수 있어야 한다.",
    "en": "Self-driving cars must be safe and trusted before people use them widely.",
    "keywords": [
     "cars",
     "safe",
     "trusted"
    ]
   }
  },
  {
   "stage": 4,
   "id": "s4-42",
   "genre": "info",
   "title": {
    "en": "Earth in 2100",
    "ko": "2100년의 지구"
   },
   "topic": {
    "en": "Climate",
    "ko": "기후"
   },
   "bg": {
    "en": "The Paris Agreement, adopted in 2015, aims to keep global warming well below 2 degrees Celsius.",
    "ko": "2015년에 채택된 파리 협정은 지구 기온 상승을 2°C보다 훨씬 낮게 유지하는 것을 목표로 해요."
   },
   "sentences": [
    {
     "en": "Imagine it is the year 2100, and you are an old grandparent telling children about the 2020s.",
     "ko": "2100년, 여러분이 나이 든 할아버지나 할머니가 되어 아이들에게 2020년대 이야기를 들려준다고 상상해 보자."
    },
    {
     "en": "They ask you one question: \"What did your generation do about the climate?\"",
     "ko": "아이들이 한 가지를 묻는다. \"할머니, 할아버지 세대는 기후를 위해 무엇을 했어요?\""
    },
    {
     "en": "Your answer depends partly on what happens in the coming decades.",
     "ko": "여러분의 대답은 앞으로 수십 년 동안 일어날 일에 어느 정도 달려 있다."
    },
    {
     "en": "No one can predict the future exactly, but climate scientists can describe possible paths.",
     "ko": "아무도 미래를 정확히 예측할 수는 없지만, 기후 과학자들은 가능한 길들을 설명할 수 있다."
    },
    {
     "en": "Since the late 1800s, the average temperature of Earth's surface has risen by about 1.1 degrees Celsius.",
     "ko": "1800년대 후반 이후 지구 표면의 평균 기온은 약 1.1도 올랐다."
    },
    {
     "en": "Most of this warming is caused by humans burning coal, oil, and gas, which releases carbon dioxide and other greenhouse gases.",
     "ko": "이 온난화의 대부분은 사람이 석탄, 석유, 가스를 태우면서 이산화 탄소와 다른 온실가스를 내뿜기 때문에 일어난다."
    },
    {
     "en": "These gases trap heat in the atmosphere, much like a blanket.",
     "ko": "이 기체들은 담요처럼 대기 속에 열을 가둔다."
    },
    {
     "en": "To imagine the future, scientists use computer models and create scenarios.",
     "ko": "미래를 그려 보기 위해 과학자들은 컴퓨터 모델을 쓰고 시나리오를 만든다."
    },
    {
     "en": "A scenario is not a prediction but a description of what could happen if people make certain choices.",
     "ko": "시나리오는 예언이 아니라, 사람들이 특정한 선택을 했을 때 일어날 수 있는 일을 설명한 것이다."
    },
    {
     "en": "In a high-emission scenario, where fossil fuel use keeps rising, global temperatures could rise by about 4 degrees or more by 2100.",
     "ko": "화석 연료 사용이 계속 늘어나는 고배출 시나리오에서는 2100년까지 지구 기온이 약 4도 이상 오를 수 있다."
    },
    {
     "en": "This could bring stronger heat waves, rising sea levels, and serious problems for farming and water supplies.",
     "ko": "이렇게 되면 더 강한 폭염, 해수면 상승, 농업과 물 공급의 심각한 문제가 생길 수 있다."
    },
    {
     "en": "In a low-emission scenario, where the world quickly reduces greenhouse gases, warming could be kept close to 1.5 to 2 degrees.",
     "ko": "세계가 온실가스를 빠르게 줄이는 저배출 시나리오에서는 온난화를 1.5~2도 가까이로 막을 수 있다."
    },
    {
     "en": "The difference between these two futures is enormous.",
     "ko": "이 두 미래의 차이는 엄청나다."
    },
    {
     "en": "The encouraging news is that many solutions already exist.",
     "ko": "희망적인 소식은 이미 많은 해결책이 있다는 것이다."
    },
    {
     "en": "Solar and wind power have become much cheaper over the past decade, and electric vehicles are spreading in many countries.",
     "ko": "태양광과 풍력 발전은 지난 10년 동안 훨씬 저렴해졌고, 전기차는 많은 나라에서 늘어나고 있다."
    },
    {
     "en": "Protecting forests and using energy more efficiently can also make a real difference.",
     "ko": "숲을 보호하고 에너지를 더 효율적으로 쓰는 것도 실제로 큰 차이를 만들 수 있다."
    },
    {
     "en": "However, these changes require cooperation between governments, companies, and individuals.",
     "ko": "하지만 이런 변화에는 정부, 기업, 개인의 협력이 필요하다."
    },
    {
     "en": "The Earth of 2100 has not already been decided.",
     "ko": "2100년의 지구는 아직 정해지지 않았다."
    },
    {
     "en": "It will depend largely on the choices people make in the coming decades.",
     "ko": "그것은 앞으로 수십 년 동안 사람들이 내리는 선택에 크게 달려 있다."
    },
    {
     "en": "That means your generation is not only reading this story, but also writing it.",
     "ko": "그러니까 여러분 세대는 이 이야기를 읽기만 하는 것이 아니라, 직접 써 나가고 있는 것이다."
    }
   ],
   "key": 18,
   "keyWhy": {
    "en": "It states the main idea: the climate of 2100 depends on the choices people make in the coming decades.",
    "ko": "2100년의 기후는 앞으로 수십 년 동안 사람들이 하는 선택에 달려 있다는 핵심을 말하는 문장이에요."
   },
   "main": {
    "options": [
     {
      "en": "Scientists know exactly how hot Earth will be in 2100.",
      "ko": "과학자들은 2100년에 지구가 얼마나 더울지 정확히 안다."
     },
     {
      "en": "Earth's future climate depends on the choices people make now.",
      "ko": "지구의 미래 기후는 사람들이 지금 하는 선택에 달려 있다."
     },
     {
      "en": "Global warming has nothing to do with human activity.",
      "ko": "지구 온난화는 사람의 활동과 아무 관계가 없다."
     },
     {
      "en": "Solar and wind power have become more expensive.",
      "ko": "태양광과 풍력 발전은 더 비싸졌다."
     }
    ],
    "answer": 1,
    "why": {
     "en": "The text compares possible climate futures and shows that today's choices decide which one happens.",
     "ko": "글은 가능한 기후의 미래들을 비교하며, 오늘의 선택이 어떤 미래가 될지를 정한다고 보여 줘요."
    }
   },
   "words": [
    {
     "en": "scenario",
     "ko": "시나리오, 가능한 미래 모습"
    },
    {
     "en": "greenhouse",
     "ko": "온실"
    },
    {
     "en": "cooperation",
     "ko": "협력"
    }
   ],
   "summary": {
    "ko": "2100년의 기후는 우리가 오늘 하는 선택에 달려 있다.",
    "en": "The climate in 2100 will depend on the choices we make today.",
    "keywords": [
     "climate",
     "choices",
     "today"
    ]
   }
  }
 ]
};
