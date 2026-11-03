/* 🎯 A.i 말하기 › 상황별 말하기 — 상황 표 «정본» (2026-11-03)
   ─────────────────────────────────────────────────────────────
   이 표를 읽는 곳은 둘입니다.
     · /ai-speaking.html — 상황 고르기 목록(5단계)을 그립니다
     · /warmup.html?sit=<id>&lang=en|zh — 그 상황으로 대화를 엽니다(첫 말·보기·서버에 보낼 역할)
   ⛔ 같은 표를 다른 파일에 베껴 적지 마세요 — 한쪽만 고쳐지면 «고른 상황과 다른 대화» 가 됩니다.

   칸
     id     주소에 실리는 값(영문 소문자·숫자·-) — 바꾸면 옛 링크가 «자유 대화» 로 떨어집니다
     step   1~5 — 목록 묶음(사장님 2026-11-03 «5단계»). 대화 수준(웜업 1~8)을 바꾸지 않습니다
     ic     아이콘 — ⛔ Unicode 13 이상·ZWJ 조합·국기 금지(옛 윈도우에서 두부·글자로 보임)
     img    그 상황 사진(이미 저장소에 있는 /img/write-scenes/*.webp). 없으면 아이콘만
     en/ko/zh       상황 이름(화면의 «오늘의 주제»)
     den/dko        한 줄 설명
     open/zhOpen    AI 가 먼저 하는 첫 말(화면이 그리는 고정 문장) · openKo = 「뜻」 버튼 한국어
     chips/zhChips  낮은 단계 학생에게 보여 줄 대답 보기 둘
                    ⛔ 영어 보기에 한글, 중국어 보기에 병음·한글을 섞지 마세요 — 누르면 그 글자가 그대로 발화로 전송
     ai/st          역할(AI 가 맡는 사람 / 학생이 맡는 사람)
   role/zhRole 는 아래에서 만듭니다. 서버가 「오늘의 대화 주제는 '…' 이야.」 안에 넣으므로
   ⛔ 문장에 작은따옴표(')를 쓰지 마세요(하니스가 막습니다). */
(function (root) {
  'use strict';
  function role(scene, ai, student, open, zh) {
    return scene + ' 역할극 — 너는 ' + ai + ', 학생은 ' + student + '이야. 너는 이미 학생에게 "' + open +
      '" 라고 먼저 말했어. 학생의 대답에 이어서 끝까지 ' + ai + ' 역할로 ' + (zh ? '중국어' : '영어') +
      ' 대화를 이어 가. 한 번에 한 가지만 묻고, 학생이 상황 속에서 직접 말해 보게 해 줘.';
  }
  var W = '/img/write-scenes/';
  var L = [
    /* ── 1단계 · 첫걸음 ── */
    { id: 'new-friend', step: 1, ic: '🙋', img: W + 'playground.webp', en: 'Meeting a new friend', ko: '새 친구에게 자기소개', zh: '认识新朋友',
      den: 'Say your name and what you like', dko: '이름과 좋아하는 것을 말해요',
      open: 'Hi! I am new here. What is your name?', zhOpen: '你好！我是新来的。你叫什么名字？', openKo: '안녕! 나 여기 처음 왔어. 너 이름이 뭐야?',
      chips: ['My name is Minji.', 'Hi! I am Junho. Nice to meet you.'], zhChips: ['我叫敏智。', '你好！我叫俊浩。'],
      ai: '학교에서 처음 만난 새 친구', st: '친구' },
    { id: 'birthday', step: 1, ic: '🎂', img: W + 'birthday.webp', en: 'A birthday party', ko: '생일 축하하기', zh: '生日派对',
      den: 'Say happy birthday and give a gift', dko: '생일을 축하하고 선물을 줘요',
      open: 'Hi! Thank you for coming to my birthday party!', zhOpen: '你好！谢谢你来我的生日派对！', openKo: '안녕! 내 생일 파티에 와 줘서 고마워!',
      chips: ['Happy birthday! This is for you.', 'Happy birthday! How old are you?'], zhChips: ['生日快乐！这是给你的。', '生日快乐！你几岁了？'],
      ai: '오늘 생일인 친구', st: '파티에 온 친구' },
    { id: 'store', step: 1, ic: '🛒', img: W + 'market.webp', en: 'Shopping at a store', ko: '마트에서 물건 사기', zh: '在超市买东西',
      den: 'Find things and ask prices', dko: '물건을 찾고 값을 물어요',
      open: 'Hello! Can I help you find something?', zhOpen: '你好！你要找什么？', openKo: '안녕하세요! 찾으시는 물건이 있나요?',
      chips: ['Yes, where is the milk?', 'How much is this apple?'], zhChips: ['牛奶在哪里？', '这个苹果多少钱？'],
      ai: '마트 직원', st: '손님' },
    /* ── 2단계 · 기초 ── */
    { id: 'cafe', step: 2, ic: '☕', img: W + 'bakery.webp', en: 'Ordering at a cafe', ko: '카페에서 주문하기', zh: '在咖啡店点饮料',
      den: 'Order a drink and pay', dko: '음료를 주문하고 계산해요',
      open: 'Hi! Welcome to Mango Cafe. What would you like?', zhOpen: '你好！欢迎来到芒果咖啡店。你想喝什么？', openKo: '안녕하세요! 망고 카페에 오신 걸 환영해요. 뭘 드릴까요?',
      chips: ['Can I have a hot chocolate, please?', 'I would like an orange juice.'], zhChips: ['我要一杯热巧克力。', '我要一杯橙汁。'],
      ai: '카페 점원', st: '손님' },
    { id: 'restaurant', step: 2, ic: '🍽️', img: W + 'restaurant.webp', en: 'Ordering at a restaurant', ko: '식당에서 주문하기', zh: '在饭馆点菜',
      den: 'Choose from the menu', dko: '메뉴를 고르고 원하는 것을 말해요',
      open: 'Good evening! Here is your menu. Are you ready to order?', zhOpen: '晚上好！这是菜单。你们要点菜吗？', openKo: '안녕하세요! 메뉴판 여기 있어요. 주문하시겠어요?',
      chips: ['Yes, I would like the spaghetti, please.', 'Can I have a few more minutes?'], zhChips: ['我要一碗牛肉面。', '请等一下。'],
      ai: '식당 직원', st: '손님' },
    { id: 'movie', step: 2, ic: '🎬', img: '', en: 'Buying movie tickets', ko: '영화표 사기', zh: '买电影票',
      den: 'Pick a movie, a time and seats', dko: '영화와 시간, 자리를 골라요',
      open: 'Hello! Which movie would you like to see today?', zhOpen: '你好！你今天想看哪部电影？', openKo: '안녕하세요! 오늘 어떤 영화를 보시겠어요?',
      chips: ['Two tickets for the 7 PM show, please.', 'What movies are playing now?'], zhChips: ['我要两张七点的票。', '现在有什么电影？'],
      ai: '영화관 매표소 직원', st: '손님' },
    /* ── 3단계 · 초급 ── */
    { id: 'directions', step: 3, ic: '🗺️', img: '', en: 'Asking for directions', ko: '길 묻기', zh: '问路',
      den: 'Ask the way and follow it', dko: '가고 싶은 곳을 묻고 길을 들어요',
      open: 'Hi there! You look a little lost. Can I help you?', zhOpen: '你好！你是不是迷路了？要我帮你吗？', openKo: '안녕하세요! 길을 잃으신 것 같네요. 도와드릴까요?',
      chips: ['Yes, please. Where is the bus stop?', 'How can I get to the library?'], zhChips: ['好的，公交车站在哪里？', '去图书馆怎么走？'],
      ai: '길에서 만난 친절한 사람', st: '길을 잃은 여행자' },
    { id: 'phone-plan', step: 3, ic: '📞', img: '', en: 'Making plans on the phone', ko: '전화로 약속 잡기', zh: '打电话约时间',
      den: 'Choose a day and a time to meet', dko: '만날 날짜와 시간을 정해요',
      open: 'Hello? Oh, hi! Do you want to hang out this weekend?', zhOpen: '喂？你好！这个周末一起出去玩吗？', openKo: '여보세요? 아, 안녕! 이번 주말에 같이 놀래?',
      chips: ['Sure! How about Saturday afternoon?', 'Sorry, I am busy on Saturday. Is Sunday OK?'], zhChips: ['好啊！星期六下午怎么样？', '星期六我很忙，星期天可以吗？'],
      ai: '전화를 받은 학생의 친구', st: '친구' },
    { id: 'library', step: 3, ic: '📚', img: W + 'library.webp', en: 'Borrowing a library book', ko: '도서관에서 책 빌리기', zh: '在图书馆借书',
      den: 'Find a book and borrow it', dko: '책을 찾고 빌려요',
      open: 'Hello! Welcome to the library. What kind of book are you looking for?', zhOpen: '你好！欢迎来到图书馆。你想找什么书？', openKo: '안녕하세요! 도서관에 온 걸 환영해요. 어떤 책을 찾고 있어요?',
      chips: ['I am looking for a book about dinosaurs.', 'Can I borrow this book?'], zhChips: ['我想找关于恐龙的书。', '我可以借这本书吗？'],
      ai: '도서관 사서', st: '책을 빌리러 온 학생' },
    /* ── 4단계 · 중급 ── */
    { id: 'doctor', step: 4, ic: '🏥', img: W + 'clinic.webp', en: 'At the doctor', ko: '병원에서 증상 말하기', zh: '看医生',
      den: 'Explain how you feel', dko: '어디가 아픈지 설명해요',
      open: 'Hello, please have a seat. What seems to be the problem today?', zhOpen: '你好，请坐。你哪里不舒服？', openKo: '안녕하세요, 앉으세요. 오늘은 어디가 불편하세요?',
      chips: ['I have a headache and a fever.', 'My stomach hurts since yesterday.'], zhChips: ['我头疼，还发烧。', '我从昨天开始肚子疼。'],
      ai: '친절한 의사', st: '환자' },
    { id: 'exchange', step: 4, ic: '🔄', img: W + 'warmup-shopping.webp', en: 'Exchanging an item', ko: '물건 교환·환불', zh: '换货和退货',
      den: 'Explain a problem with something you bought', dko: '산 물건의 문제를 설명해요',
      open: 'Hi, how can I help you today?', zhOpen: '你好，有什么可以帮你的？', openKo: '안녕하세요, 무엇을 도와드릴까요?',
      chips: ['I would like to exchange this shirt. It is too small.', 'This toy is broken. Can I get a refund?'], zhChips: ['这件衣服太小了，我想换一件。', '这个玩具坏了，可以退钱吗？'],
      ai: '가게 직원', st: '산 물건을 바꾸러 온 손님' },
    { id: 'train', step: 4, ic: '🚆', img: W + 'train.webp', en: 'Buying a train ticket', ko: '기차표 사기', zh: '买火车票',
      den: 'Choose a time and a seat', dko: '시간과 자리를 골라 표를 사요',
      open: 'Good morning! Where would you like to go today?', zhOpen: '早上好！你今天想去哪里？', openKo: '안녕하세요! 오늘 어디로 가시겠어요?',
      chips: ['One ticket to Busan, please.', 'What time is the next train?'], zhChips: ['我要一张去上海的票。', '下一班火车几点开？'],
      ai: '기차역 매표소 직원', st: '여행자' },
    /* ── 5단계 · 고급 ── */
    { id: 'hotel', step: 5, ic: '🏨', img: '', en: 'Checking in at a hotel', ko: '호텔 체크인', zh: '酒店入住',
      den: 'Confirm your booking and get a room', dko: '예약을 확인하고 방을 받아요',
      open: 'Good afternoon, and welcome to our hotel. Do you have a reservation?', zhOpen: '下午好，欢迎光临。您有预订吗？', openKo: '안녕하세요, 저희 호텔에 오신 걸 환영합니다. 예약하셨나요?',
      chips: ['Yes, I have a reservation under Kim.', 'No, do you have a room for tonight?'], zhChips: ['有，我用金的名字预订了。', '没有，今晚还有房间吗？'],
      ai: '호텔 프런트 직원', st: '손님' },
    { id: 'airport', step: 5, ic: '✈️', img: W + 'airport.webp', en: 'Checking in at the airport', ko: '공항 탑승 수속', zh: '机场办登机',
      den: 'Show your passport and pick a seat', dko: '여권을 보여 주고 좌석을 골라요',
      open: 'Good morning! May I see your passport, please? Where are you flying today?', zhOpen: '早上好！请出示您的护照。您今天飞往哪里？', openKo: '안녕하세요! 여권 좀 보여 주시겠어요? 오늘 어디로 가세요?',
      chips: ['Here you are. I am flying to Sydney.', 'Can I have a window seat, please?'], zhChips: ['给您。我去北京。', '我想要靠窗的座位。'],
      ai: '항공사 카운터 직원', st: '승객' },
    { id: 'lost-found', step: 5, ic: '🔎', img: '', en: 'At the lost and found', ko: '분실물 찾기', zh: '找丢失的东西',
      den: 'Describe what you lost and where', dko: '잃어버린 물건과 장소를 설명해요',
      open: 'Hello, this is the lost and found. What did you lose?', zhOpen: '你好，这里是失物招领处。你丢了什么？', openKo: '안녕하세요, 분실물 센터입니다. 무엇을 잃어버리셨어요?',
      chips: ['I lost my blue backpack on the bus.', 'I think I left my phone here yesterday.'], zhChips: ['我在公交车上丢了一个蓝色的书包。', '我昨天好像把手机忘在这里了。'],
      ai: '분실물 센터 직원', st: '물건을 잃어버린 사람' }
  ];
  L.forEach(function (s) { s.role = role(s.ko, s.ai, s.st, s.open, false); s.zhRole = role(s.ko, s.ai, s.st, s.zhOpen, true); });
  var STEPS = [
    { n: 1, ko: '1단계 · 첫걸음', en: 'Step 1 · First steps' },
    { n: 2, ko: '2단계 · 기초', en: 'Step 2 · Basic' },
    { n: 3, ko: '3단계 · 초급', en: 'Step 3 · Beginner' },
    { n: 4, ko: '4단계 · 중급', en: 'Step 4 · Intermediate' },
    { n: 5, ko: '5단계 · 고급', en: 'Step 5 · Advanced' }
  ];
  function find(id) {
    id = String(id || '').trim().toLowerCase();
    for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;   // 모르는 값 → null (부르는 쪽은 예전처럼 자유 대화)
  }
  /* 상황 하나로 여는 주소. 대화 언어(en/zh)를 함께 넘깁니다 — 웜업의 저장값은 안 바꿉니다. */
  function url(s, lang) { return '/warmup.html?setup=0&lang=' + (lang === 'zh' ? 'zh' : 'en') + '&sit=' + encodeURIComponent(s.id); }
  root.MangoiSituations = { list: L, steps: STEPS, find: find, url: url };
})(typeof window !== 'undefined' ? window : globalThis);
