// 모든 BTS 권이 같이 쓰는 여는 쪽·닫는 쪽
export const HELLO = ['Hello, teacher! Hello, teacher!', '(Hello, students! Hello, students!)', 'How are you? How are you?', 'I am fine, thank you.', 'I am fine, thank you.', 'And you? And you?'];
export const open = (goals, gsrc) => [
  { t: 'goals', k: 'fix', items: goals, src: gsrc || 'Lesson Goals', nt: '목표를 «I can…» 으로', n: ['원본은 문법 용어(Auxiliary Verb, Demonstrative Pronoun…)를 나열 → 학생이 «할 수 있게 될 말» 로 바꿨습니다. 강사용 문법 용어는 강사 메모로 옮깁니다', '끝에서 같은 문장으로 «I can ✅» 스스로 점검 — 처음과 끝이 짝입니다'] },
  { t: 'rules', k: 'fix', src: "Let's Do This! (Class Rules)", nt: '수업 약속 4가지', n: ['<del>참가하다</del> → 참여하기 · <del>질문</del> → 질문하기(동사로 통일)', '매 과 같은 쪽이라 30초 안에 넘깁니다'] },
  { t: 'song', k: 'fix', title: 'Hello Song', lines: HELLO, img: '19639', src: 'Warm Up', nt: '인사 노래', n: ['쉼표 앞 띄어쓰기 26곳 정리', '⚠️ «Fruit Salad» 곡조 표기는 뺐습니다 — 저작권 확인 전까지 자체 곡조로 녹음 권장'] },
];
export const close = (ican, next) => [
  { t: 'ican', k: 'new', items: ican, nt: '스스로 점검', n: ['학생이 별 1~3개를 스스로 칠합니다(화상수업에서는 손가락으로 1·2·3)', '처음 «I can…» 과 같은 문장이라 무엇이 늘었는지 바로 보입니다'] },
  { t: 'next', k: 'new', ...next, nt: '다음 시간 예고', n: ['다음 과 첫 장면을 미리 보여 주고 끝냅니다 — 다음 수업을 기다리게 하는 장치', '답은 말하지 않습니다(다음 시간 첫 질문으로 씁니다)'] },
  { t: 'goodbye', k: 'fix', src: 'Goodbye Song', nt: '작별 노래', n: ['<del>Goodbye,goodbye</del> → Goodbye, goodbye · 따옴표 짝 정리', 'QR·유튜브 주소는 화면판에서 뺐습니다(인쇄판은 mangoi.ai 주소로)'] },
];
