/* 🎯 A.i 말하기 › 상황별 말하기 — 상황 표 «정본» (2026-11-03)
   ─────────────────────────────────────────────────────────────
   이 표를 읽는 곳은 둘입니다.
     · /ai-speaking.html — 상황 고르기 목록(4단계 × 5개)을 그립니다
     · /warmup.html?sit=<id> — 그 상황으로 대화를 엽니다(첫 말·보기·서버에 보낼 역할)
   ⛔ 같은 표를 다른 파일에 베껴 적지 마세요 — 한쪽만 고쳐지면 «고른 상황과 다른 대화» 가 됩니다.

   📜 사장님 2026-11-03: 어린이·청소년 대상 · 단계마다 5개 · 영어만(중국어 빼기) · 5단계(고급) 취소.

   칸
     id     주소에 실리는 값(영문 소문자·숫자·-) — 바꾸면 옛 링크가 «자유 대화» 로 떨어집니다
     step   1~4 — 목록 묶음일 뿐, 대화 수준(웜업 1~8)을 바꾸지 않습니다
     ic     아이콘 — ⛔ Unicode 13 이상·ZWJ 조합·국기 금지(옛 윈도우에서 두부·글자로 보임)
     img    그 상황 사진(저장소의 /img/write-scenes/*.webp). 없으면 아이콘만
     en/ko  상황 이름(화면의 «오늘의 주제») · den/dko 한 줄 설명
     open   AI 가 먼저 하는 첫 말(화면이 그리는 고정 문장) · openKo = 「뜻」 버튼 한국어
     chips  낮은 단계 학생에게 보여 줄 대답 보기 둘
            ⛔ 한글을 섞지 마세요 — 누르면 그 글자가 그대로 영어 발화로 전송됩니다
     ai/st  역할(AI 가 맡는 사람 / 학생이 맡는 사람)
   role 은 아래에서 만듭니다. 서버가 「오늘의 대화 주제는 '…' 이야.」 안에 넣으므로
   ⛔ 문장에 작은따옴표(')를 쓰지 마세요(하니스가 막습니다). */
(function (root) {
  'use strict';
  function role(scene, ai, student, open) {
    return scene + ' 역할극 — 너는 ' + ai + ', 학생은 ' + student + '이야. 너는 이미 학생에게 "' + open +
      '" 라고 먼저 말했어. 학생의 대답에 이어서 끝까지 ' + ai + ' 역할로 영어 대화를 이어 가. ' +
      '학생은 어린이·청소년이야. 한 번에 한 가지만 쉽게 묻고, 학생이 상황 속에서 직접 말해 보게 해 줘.';
  }
  var W = '/img/write-scenes/';
  function S(o) { return o; }
  var L = [
    /* ── 1단계 · 첫걸음 ── */
    S({ id: 'new-friend', step: 1, ic: '🙋', img: W + 'playground.webp', en: 'Meeting a new friend', ko: '새 친구에게 자기소개',
      den: 'Say your name and what you like', dko: '이름과 좋아하는 것을 말해요',
      open: 'Hi! I am new here. What is your name?', openKo: '안녕! 나 여기 처음 왔어. 너 이름이 뭐야?',
      chips: ['My name is Minji.', 'Hi! I am Junho. Nice to meet you.'], ai: '학교에서 처음 만난 새 친구', st: '친구' }),
    S({ id: 'birthday', step: 1, ic: '🎂', img: W + 'birthday.webp', en: 'A birthday party', ko: '생일 축하하기',
      den: 'Say happy birthday and give a gift', dko: '생일을 축하하고 선물을 줘요',
      open: 'Hi! Thank you for coming to my birthday party!', openKo: '안녕! 내 생일 파티에 와 줘서 고마워!',
      chips: ['Happy birthday! This is for you.', 'Happy birthday! How old are you?'], ai: '오늘 생일인 친구', st: '파티에 온 친구' }),
    S({ id: 'zoo', step: 1, ic: '🦁', img: W + 'zoo.webp', en: 'At the zoo', ko: '동물원 구경하기',
      den: 'Talk about animals you see', dko: '보이는 동물에 대해 말해요',
      open: 'Welcome to the zoo! Which animal do you want to see first?', openKo: '동물원에 온 걸 환영해! 어떤 동물부터 보고 싶어?',
      chips: ['I want to see the lions.', 'I like monkeys!'], ai: '친절한 동물원 사육사', st: '동물원에 온 어린이' }),
    S({ id: 'picnic', step: 1, ic: '🧺', img: W + 'picnic.webp', en: 'A picnic in the park', ko: '공원에서 소풍',
      den: 'Share food and talk about the day', dko: '음식을 나누고 기분을 말해요',
      open: 'What a sunny day! Do you want a sandwich or some fruit?', openKo: '날씨 정말 좋다! 샌드위치 먹을래, 과일 먹을래?',
      chips: ['A sandwich, please.', 'I want some strawberries.'], ai: '함께 소풍 온 친구', st: '친구' }),
    S({ id: 'store', step: 1, ic: '🛒', img: W + 'market.webp', en: 'Shopping at a store', ko: '가게에서 물건 사기',
      den: 'Find things and ask prices', dko: '물건을 찾고 값을 물어요',
      open: 'Hello! Can I help you find something?', openKo: '안녕하세요! 찾는 물건이 있나요?',
      chips: ['Yes, where are the pencils?', 'How much is this ball?'], ai: '가게 직원', st: '어린이 손님' }),
    /* ── 2단계 · 기초 ── */
    S({ id: 'bakery', step: 2, ic: '🥐', img: W + 'bakery.webp', en: 'Ordering at a bakery', ko: '빵집에서 주문하기',
      den: 'Choose bread and a drink, then pay', dko: '빵과 음료를 고르고 계산해요',
      open: 'Hi! Welcome to Mango Bakery. What would you like?', openKo: '안녕하세요! 망고 빵집에 온 걸 환영해요. 뭘 드릴까요?',
      chips: ['Can I have a chocolate muffin, please?', 'I would like an orange juice.'], ai: '빵집 점원', st: '손님' }),
    S({ id: 'restaurant', step: 2, ic: '🍽️', img: W + 'restaurant.webp', en: 'Ordering at a restaurant', ko: '식당에서 주문하기',
      den: 'Choose from the menu', dko: '메뉴를 고르고 원하는 것을 말해요',
      open: 'Hello! Here is your menu. What would you like to eat?', openKo: '안녕하세요! 메뉴판 여기 있어요. 뭘 드시겠어요?',
      chips: ['I would like the spaghetti, please.', 'Can I have a cheeseburger?'], ai: '식당 직원', st: '가족과 온 어린이 손님' }),
    S({ id: 'library', step: 2, ic: '📚', img: W + 'library.webp', en: 'Borrowing a library book', ko: '도서관에서 책 빌리기',
      den: 'Find a book and borrow it', dko: '책을 찾고 빌려요',
      open: 'Hello! What kind of book are you looking for today?', openKo: '안녕! 오늘은 어떤 책을 찾고 있니?',
      chips: ['I am looking for a book about dinosaurs.', 'Can I borrow this book?'], ai: '도서관 사서', st: '책을 빌리러 온 학생' }),
    S({ id: 'art-class', step: 2, ic: '🎨', img: W + 'artroom.webp', en: 'In art class', ko: '미술 시간에 말하기',
      den: 'Ask for things and talk about your picture', dko: '필요한 것을 부탁하고 그림을 설명해요',
      open: 'Wow, nice drawing! What are you drawing today?', openKo: '와, 그림 멋지다! 오늘은 뭘 그리고 있니?',
      chips: ['I am drawing my dog.', 'Can I borrow a red crayon?'], ai: '미술 선생님', st: '학생' }),
    S({ id: 'aquarium', step: 2, ic: '🐠', img: W + 'aquarium.webp', en: 'Buying aquarium tickets', ko: '아쿠아리움 표 사기',
      den: 'Ask how many tickets and the price', dko: '표 수와 가격을 물어요',
      open: 'Hello! How many tickets would you like?', openKo: '안녕하세요! 표 몇 장 드릴까요?',
      chips: ['Two tickets, please.', 'How much is a ticket for kids?'], ai: '아쿠아리움 매표소 직원', st: '어린이 손님' }),
    /* ── 3단계 · 초급 ── */
    S({ id: 'directions', step: 3, ic: '🗺️', img: '', en: 'Asking for directions', ko: '길 묻기',
      den: 'Ask the way and follow it', dko: '가고 싶은 곳을 묻고 길을 들어요',
      open: 'Hi there! You look a little lost. Can I help you?', openKo: '안녕! 길을 잃은 것 같네. 도와줄까?',
      chips: ['Yes, please. Where is the bus stop?', 'How can I get to the library?'], ai: '길에서 만난 친절한 어른', st: '길을 잃은 학생' }),
    S({ id: 'phone-plan', step: 3, ic: '📞', img: '', en: 'Making plans on the phone', ko: '전화로 약속 잡기',
      den: 'Choose a day and a time to meet', dko: '만날 날짜와 시간을 정해요',
      open: 'Hello? Oh, hi! Do you want to play this weekend?', openKo: '여보세요? 아, 안녕! 이번 주말에 같이 놀래?',
      chips: ['Sure! How about Saturday afternoon?', 'Sorry, I am busy on Saturday. Is Sunday OK?'], ai: '전화를 받은 친구', st: '친구' }),
    S({ id: 'soccer-team', step: 3, ic: '⚽', img: W + 'soccer.webp', en: 'Joining the soccer team', ko: '축구부 들어가기',
      den: 'Talk about your skills and practice times', dko: '잘하는 것과 연습 시간을 이야기해요',
      open: 'Hi! Do you want to join our soccer team?', openKo: '안녕! 우리 축구부에 들어올래?',
      chips: ['Yes! I love playing soccer.', 'When do you practice?'], ai: '학교 축구부 코치', st: '들어오고 싶은 학생' }),
    S({ id: 'music-club', step: 3, ic: '🎸', img: W + 'musicroom.webp', en: 'Joining the school band', ko: '학교 밴드 오디션',
      den: 'Talk about your instrument and favorite songs', dko: '연주하는 악기와 좋아하는 노래를 말해요',
      open: 'Welcome to band practice! Which instrument do you play?', openKo: '밴드 연습에 온 걸 환영해! 어떤 악기를 연주하니?',
      chips: ['I play the piano.', 'I can sing. I want to be a singer.'], ai: '학교 밴드 선생님', st: '오디션 보러 온 학생' }),
    S({ id: 'camping', step: 3, ic: '⛺', img: W + 'camping.webp', en: 'Planning a camping trip', ko: '캠핑 계획 세우기',
      den: 'Decide what to bring and what to do', dko: '가져갈 것과 할 일을 정해요',
      open: 'Our camping trip is this Saturday! What should we bring?', openKo: '캠핑이 이번 토요일이야! 뭘 챙겨 가야 할까?',
      chips: ['We should bring a flashlight.', 'Let us bring marshmallows!'], ai: '함께 캠핑 가는 친구', st: '친구' }),
    /* ── 4단계 · 중급 ── */
    S({ id: 'doctor', step: 4, ic: '🏥', img: W + 'clinic.webp', en: 'At the doctor', ko: '병원에서 증상 말하기',
      den: 'Explain how you feel', dko: '어디가 아픈지 설명해요',
      open: 'Hello, please have a seat. How are you feeling today?', openKo: '안녕, 앉으렴. 오늘은 어디가 불편하니?',
      chips: ['I have a headache and a fever.', 'My stomach hurts since yesterday.'], ai: '친절한 소아과 의사', st: '환자인 학생' }),
    S({ id: 'exchange', step: 4, ic: '🔄', img: W + 'warmup-shopping.webp', en: 'Exchanging an item', ko: '물건 교환하기',
      den: 'Explain a problem with something you bought', dko: '산 물건의 문제를 설명해요',
      open: 'Hi, how can I help you today?', openKo: '안녕하세요, 무엇을 도와줄까요?',
      chips: ['I would like to exchange this shirt. It is too small.', 'This toy is broken. Can I change it?'], ai: '가게 직원', st: '산 물건을 바꾸러 온 학생' }),
    S({ id: 'train', step: 4, ic: '🚆', img: W + 'train.webp', en: 'Buying a train ticket', ko: '기차표 사기',
      den: 'Choose a time and a seat', dko: '시간과 자리를 골라 표를 사요',
      open: 'Good morning! Where would you like to go today?', openKo: '안녕하세요! 오늘 어디로 가세요?',
      chips: ['One ticket to Busan, please.', 'What time is the next train?'], ai: '기차역 매표소 직원', st: '여행 가는 청소년' }),
    S({ id: 'science-museum', step: 4, ic: '🤖', img: W + 'robot.webp', en: 'At the science museum', ko: '과학관 체험하기',
      den: 'Ask questions about robots and science', dko: '로봇과 과학에 대해 질문해요',
      open: 'Welcome to the science museum! This robot can talk. What do you want to ask it?', openKo: '과학관에 온 걸 환영해! 이 로봇은 말을 할 수 있어. 뭘 물어보고 싶니?',
      chips: ['How does the robot move?', 'Can robots help people at home?'], ai: '과학관 안내원', st: '체험 학습 온 학생' }),
    S({ id: 'sports-day', step: 4, ic: '🏅', img: W + 'sportsday.webp', en: 'Sports day interview', ko: '운동회 인터뷰',
      den: 'Talk about your race and how you felt', dko: '경기와 그때 기분을 이야기해요',
      open: 'Congratulations! You ran so fast. How do you feel right now?', openKo: '축하해! 정말 빨리 달렸어. 지금 기분이 어때?',
      chips: ['I feel very happy and tired.', 'I practiced every day for this race.'], ai: '학교 방송부 기자', st: '운동회에서 달린 학생' })
  ];
  L.forEach(function (s) { s.role = role(s.ko, s.ai, s.st, s.open); });
  var restaurant = find('restaurant');
  restaurant.role += ' 딸기 도넛은 개당 2달러 50센트, 라지 아메리카노는 한 잔에 4달러야. ' +
    '학생이 주문한 수량대로 합산하고 가격은 항상 영어 단어로 말해. 딸기 도넛을 복수로만 주문하면 2개로 계산해. ' +
    '딸기 도넛 2개와 라지 아메리카노 1잔만 주문했을 때 계산 대사는 "Your total is nine dollars."야.';
  var STEPS = [
    { n: 1, ko: '1단계 · 첫걸음', en: 'Step 1 · First steps' },
    { n: 2, ko: '2단계 · 기초', en: 'Step 2 · Basic' },
    { n: 3, ko: '3단계 · 초급', en: 'Step 3 · Beginner' },
    { n: 4, ko: '4단계 · 중급', en: 'Step 4 · Intermediate' }
  ];
  function find(id) {
    id = String(id || '').trim().toLowerCase();
    for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;   // 모르는 값 → null (부르는 쪽은 예전처럼 자유 대화)
  }
  /* 상황 하나로 여는 주소. 상황 대화는 영어만 — lang=en 을 함께 넘겨 웜업에 중국어가 저장된 학생도 영어로 엽니다(저장값은 안 바꿈). */
  function url(s) { return '/warmup.html?setup=0&lang=en&sit=' + encodeURIComponent(s.id); }
  root.MangoiSituations = { list: L, steps: STEPS, find: find, url: url };
})(typeof window !== 'undefined' ? window : globalThis);
