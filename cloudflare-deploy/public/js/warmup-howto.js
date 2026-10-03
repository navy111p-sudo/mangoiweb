/* 📘 «A.i말하기 사용방법 쉽게 알기» — /warmup.html 사용 설명 안내창 정본 (2026-10-03 사장님 지시)
   EN: "How to use A.i Speaking" help popup for /warmup.html (KO/EN).
   [어디서 여나] ① 설정 화면 «💡 차이» 칩 옆 칩  ② 대화 중 ⋮ 메뉴 «📘 사용방법» 줄 — 둘 다 mgOpenWarmupHowto().
   ⛔ 문구를 warmup.html 에 복사하지 말 것 — 여기 한 곳만 고친다.
   ⚠️ 내용(사실)은 warmup.html · js/warmup-auto-talk.js · js/warmup-facetalk.js 기준 — 기능이 바뀌면 이 문구도 함께.
   ⚠️ 이 파일을 고치면 warmup.html 의 ?v= 를 함께 올릴 것.
   ⛔ 상주 타이머·MutationObserver 없음 — 열 때만 그린다. */
(function () {
  'use strict';
  if (window.mgOpenWarmupHowto) return;
  function isEn() {
    try { return localStorage.getItem('mangoi_lang') === 'en'; } catch (e) {}
    return false;
  }
  var ID = 'wuhowto-ov';
  var TXT = {
    ko: {
      title: '📘 A.i말하기 사용방법 쉽게 알기',
      lead: 'AI 와 영어(또는 중국어)로 이야기하며 입을 푸는 곳이에요. 아래 순서대로 고르고 <b>시작하기</b>만 누르면 돼요. <b>✨ 자동으로 말하기</b>를 고르면 마이크를 누르지 않아도 대화가 이어져요.',
      quickT: '1분 요약',
      quick: ['무슨 말로 할지 고르기 (영어 / 중국어)', '교재로 할지, 자유 대화로 할지 고르기', '누가 하는지(나이) 고르기',
        '대화 수준 고르기 — 모르면 <b>🔍 내 수준 찾아줄까요?</b>', '<b>말하는 방법 고르기 — 🎤 버튼으로 / ✨ 자동으로</b>',
        '🚀 시작하기 → 말하기 (자동이면 마이크를 안 눌러도 돼요)'],
      steps: [
        ['무슨 말로 이야기할까요?', '<b>영어</b>(기본) 또는 <b>중국어</b>를 골라요. 고른 말로 AI 가 말하고, 마이크도 그 말을 들어요. 중국어 낮은 단계는 병음과 뜻을 함께 보여 줘요.'],
        ['오늘은 어떻게 이야기할까요?', '<b>📘 교재로 연습</b>을 누르면 교재 목록이 펼쳐져요 — 지금 배우는 교재와 과를 고르세요. <b>💬 자유 대화</b>는 일상 주제로 이야기해요. 시작 버튼 위 줄이 지금 무엇으로 시작하는지 알려 줘요.'],
        ['누가 연습하나요?', '<b>유아·초등 저학년</b>(놀이·동물·가족) · <b>초등 고학년·중학생</b>(학교·친구·취미, 기본) · <b>고등학생</b>(관심사·진로) · <b>성인</b>(직장·주말·여행). 나이는 «이야기 소재» 만 바꿔요.'],
        ['대화 수준', '8단계예요. 위로 갈수록 짧고 쉬워요 — 예) 첫걸음 “I like apples.” · 기초 “I can ride my bike now.” 잘 모르겠으면 <b>🔍 내 수준 찾아줄까요?</b>를 누르세요. 짧게 몇 번 이야기한 뒤 알맞은 단계를 정해 줘요.'],
        ['어떻게 말할까요? (말하는 방법)', '<b>🎤 버튼으로 말하기</b>(기본): 말할 때마다 마이크를 눌러요.<br><b>✨ 자동으로 말하기</b>(베타): <b>AI 말이 끝나면 마이크가 저절로 켜지고</b>, 말을 멈추면 저절로 보내져요. 이어폰을 쓰면 더 정확해요. 한 번 고르면 다음에도 기억해요.'],
        ['시작하기', '<b>🚀 이 설정으로 말하기 연습 시작하기</b>를 눌러요. 버튼 아래 «고른 것» 한 줄이 맞는지 확인하세요.'],
        ['AI 와 이야기하기', 'AI 선생님이 먼저 인사해요. 버튼으로를 골랐으면 🎤 를 누르고, 자동으로를 골랐으면 그냥 말하면 돼요. 마이크 사용을 물으면 «허용» 을 눌러 주세요.']
      ],
      toolsT: '대화 중 버튼',
      tools: [['🎤 마이크', '누르고 말해요 (자동일 땐 안 눌러도 돼요)'], ['🎤 / ✨ 말하는 방법', '입력칸 바로 위 스위치로 한 번에 바꿔요'],
        ['💡 대답할 때 도움', '따라 말할 대답 예시가 나와요'], ['👁 자막', 'AI 말을 글로 보기 / 가리기'],
        ['🔊 소리', 'AI 목소리 켜기·끄기'], ['⋮ 설정', '듣기 속도·수준·교재를 대화 중에 바꾸기'],
        ['📋 끝내고 요약 보기', '오늘 나눈 이야기를 정리해 줘요']],
      autoT: '✨ 자동으로 말하기 — 이렇게 돌아가요',
      flow: ['🔊 AI 가 말해요', '👂 듣는 중', '🗣️ 말하는 중', '🤖 AI 확인 중', '✅ 완료'],
      flowTail: '다시 처음으로',
      autoTips: [
        '화면 아래 표시가 <b>👂 듣는 중</b>이면 말하세요. AI 가 말하는 동안에는 마이크가 열리지 않고, 끝나고 약 0.6초 뒤 저절로 열려요.',
        '두 번 연속 아무 말이 없으면 잠깐 쉬어요. 🎤 를 한 번 누르면 다시 시작해요.',
        '입력칸에 글을 쓰기 시작하면 그 차례에는 마이크가 저절로 안 켜져요.',
        '화상수업 안에서는 베타 동안 꺼져 있어요 — 🎤 버튼으로 말하기를 쓰세요.',
        '😊 선생님 얼굴을 누르면 얼굴만 크게 보며 자동으로 대화해요. 아래 반투명 판을 누르면 대화 글과 대답 보기가 나오고, ✕ 로 끝내요.'
      ],
      faqT: '자주 묻는 것',
      faq: [
        ['AI 가 먼저 말을 안 걸어요', '설정 화면에서 <b>🚀 시작하기</b>를 눌러야 첫 인사가 나와요.'],
        ['자동으로 말하기는 어떻게 켜요?', '시작 전에는 시작 버튼 위 «🎤 어떻게 말할까요?» 에서 <b>✨ 자동으로 말하기</b>를 고르세요. 대화 중에는 입력칸 위 «말하는 방법» 스위치나 ⋮ 메뉴에서 바꿔요.'],
        ['언제 말하면 되나요?', 'AI 말이 끝나고 <b>👂 듣는 중</b>이 보이면 말하세요.'],
        ['말을 다 안 했는데 먼저 보내져요', '자동으로 말하기는 말이 잠깐 멈추면 다 했다고 보고 보내요. 문장을 끊지 말고 이어서 말하거나, 천천히 말하고 싶으면 <b>🎤 버튼으로</b>로 바꾸세요.'],
        ['AI 목소리를 내 말로 받아 적어요', '스피커 소리가 마이크로 다시 들어가서 그래요. <b>이어폰</b>을 끼면 거의 없어져요. 없으면 소리를 줄이거나 🎤 버튼으로 말하기를 쓰세요.'],
        ['자동으로 말하기가 멈췄어요', '두 번 연속 말이 없으면 잠깐 쉬어요. 🎤 를 한 번 누르면 다시 이어져요. ⋮ 메뉴가 열려 있으면 마이크가 안 켜지니 닫아 주세요.'],
        ['화상수업 안에서는 자동으로 말하기가 안 보여요', '선생님 목소리를 학생 말로 잘못 들을 수 있어서 베타 동안 꺼 두었어요. 🎤 버튼으로 말하기를 쓰세요.'],
        ['내 말을 못 알아들어요', '마이크 권한을 «허용» 했는지 보고, 조용한 곳에서 또박또박 말해 보세요. 카톡 안에서 열었다면 크롬으로 다시 열면 잘 돼요.'],
        ['너무 어렵거나 너무 쉬워요', '오른쪽 위 <b>⋮</b> 에서 수준을 바꾸거나, «연령·수준·교재 다시 고르기» 를 누르세요.']
      ],
      close: '닫기', ok: '알겠어요', mute: '음성 끄기', unmute: '음성 듣기'
    },
    en: {
      title: '📘 How to use A.i Speaking',
      lead: 'Warm up by talking with an AI in English or Chinese. Pick in order below, then press <b>Start</b>. With <b>✨ Auto talk</b>, the chat keeps going without tapping the mic.',
      quickT: 'In one minute',
      quick: ['Pick a language (English / Chinese)', 'Pick textbook or free talk', 'Pick who is practicing (age)',
        'Pick a level — not sure? tap <b>🔍 Find my level</b>', '<b>Pick how to talk — 🎤 Tap mic / ✨ Auto</b>',
        '🚀 Start → speak (with Auto you don’t need to tap the mic)'],
      steps: [
        ['Which language?', '<b>English</b> (default) or <b>Chinese</b>. The AI speaks in that language and the mic listens for it. Low Chinese levels show pinyin and meaning.'],
        ['How do you want to talk today?', '<b>📘 Textbook</b> opens the book list — choose your book and unit. <b>💬 Free talk</b> uses everyday topics. The bar above Start shows what you’ll start with.'],
        ['Who is practicing?', '<b>Young kids</b> (play, animals, family) · <b>Older kids / middle school</b> (school, friends, hobbies; default) · <b>High school</b> (interests, future) · <b>Adults</b> (work, weekends, travel). Age only changes the topics.'],
        ['Conversation level', '8 levels; higher up = shorter and easier — e.g. “I like apples.”, “I can ride my bike now.” Not sure? Tap <b>🔍 Find my level</b>.'],
        ['How do you want to talk?', '<b>🎤 Tap mic</b> (default): tap the mic each time you speak.<br><b>✨ Auto talk</b> (beta): <b>the mic turns on by itself when the AI finishes</b>, and sends when you stop talking. Earphones make it more accurate. Your choice is remembered.'],
        ['Start', 'Tap <b>🚀 Start speaking practice</b>. Check the one-line summary under the button.'],
        ['Talk with the AI', 'The AI greets you first. With Tap mic, tap 🎤 and answer; with Auto, just speak. If asked for microphone access, choose “Allow”.']
      ],
      toolsT: 'Buttons during the chat',
      tools: [['🎤 Mic', 'Tap and speak (not needed in Auto)'], ['🎤 / ✨ How to talk', 'Switch right above the input box'],
        ['💡 Need help?', 'Shows answers you can repeat'], ['👁 Subtitles', 'Show or hide the AI’s words'],
        ['🔊 Sound', 'Turn the AI voice on/off'], ['⋮ Settings', 'Change speed, level or book mid-chat'],
        ['📋 Finish & summary', 'Wraps up today’s talk']],
      autoT: '✨ Auto talk — how it works',
      flow: ['🔊 AI speaks', '👂 Listening', '🗣️ Speaking', '🤖 AI checking', '✅ Done'],
      flowTail: 'repeat',
      autoTips: [
        'Speak when the label shows <b>👂 Listening</b>. The mic stays off while the AI talks and opens about 0.6 s after it finishes.',
        'After two silent turns it rests. Tap 🎤 once to start again.',
        'If you start typing, the mic won’t open for that turn.',
        'Inside a live class it is off during beta — use 🎤 Tap mic.',
        '😊 Tap the teacher’s face for face-only chat. Tap the glass panel at the bottom for the words and hints; close with ✕.'
      ],
      faqT: 'Common questions',
      faq: [
        ['The AI doesn’t say anything', 'The greeting starts only after you tap <b>🚀 Start</b>.'],
        ['How do I turn on Auto talk?', 'Before starting, choose <b>✨ Auto talk</b> right above Start. During the chat, use the “How to talk” switch above the input box or the ⋮ menu.'],
        ['When should I speak?', 'When <b>👂 Listening</b> appears after the AI finishes.'],
        ['It sent before I finished', 'Auto talk sends when you pause. Keep the sentence going, or switch to <b>🎤 Tap mic</b> to take your time.'],
        ['It writes down the AI’s voice as mine', 'The speaker sound goes back into the mic. <b>Earphones</b> fix this. Otherwise lower the volume or use 🎤 Tap mic.'],
        ['Auto talk stopped', 'It rests after two silent turns. Tap 🎤 once to resume, and close the ⋮ menu if it is open.'],
        ['Auto talk is missing inside a live class', 'It is off in classes during beta because the teacher’s voice could be mistaken for yours. Use 🎤 Tap mic.'],
        ['It doesn’t hear me', 'Allow the microphone and speak clearly in a quiet place. If you opened it inside KakaoTalk, reopen it in Chrome.'],
        ['Too hard or too easy', 'Change the level with <b>⋮</b> at the top right, or tap “Change age · level · book”.']
      ],
      close: 'Close', ok: 'Got it', mute: 'Turn voice off', unmute: 'Play voice guide (Korean)'
    }
  };
  window.mgWarmupHowtoText = TXT;
  function T() { return isEn() ? TXT.en : TXT.ko; }
  function style() {
    if (document.getElementById('wuhowto-style')) return;
    var P = '#' + ID;
    var st = document.createElement('style'); st.id = 'wuhowto-style';
    st.textContent =
      '.howto-chip{display:inline-flex;align-items:center;gap:4px;margin:8px 4px 4px;padding:6px 14px;border-radius:99px;background:rgba(56,189,248,.16);border:1px solid rgba(56,189,248,.6);color:#bae6fd;font:inherit;font-size:14px;font-weight:800;line-height:1.35;cursor:pointer}'
      + '.menu-howto{appearance:none;-webkit-appearance:none;width:100%;padding:10px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:800;color:#bae6fd;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.5)}'
      + '.menu-howto:hover,.menu-howto:focus-visible{background:rgba(56,189,248,.22);outline:none}'
      + '.howto-chip:hover,.howto-chip:focus-visible{background:rgba(56,189,248,.3);outline:none}'
      + P + '{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,16,.8)}'
      + P + '[hidden]{display:none!important}'
      + P + ' .hw-box{position:relative;width:100%;max-width:720px;max-height:90vh;overflow-y:auto;background:#131c33;border:1px solid rgba(56,189,248,.45);border-radius:22px;padding:26px 22px 20px;color:#f1f5f9;font-size:15px;line-height:1.6}'
      + P + ' .hw-x{position:absolute;top:12px;right:12px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#bae6fd;font-size:17px;cursor:pointer}'
      + P + ' .hw-snd{position:absolute;top:12px;right:58px;height:38px;min-width:38px;padding:0 12px;border:1px solid rgba(56,189,248,.5);border-radius:99px;background:rgba(56,189,248,.14);color:#bae6fd;font:inherit;font-size:14px;font-weight:800;cursor:pointer;white-space:nowrap}'
      + P + ' .hw-snd:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}'
      + P + ' .hw-snd.off{border-color:rgba(148,163,184,.45);background:rgba(255,255,255,.08);color:#cbd5e1}'
      + P + ' h3{margin:0 150px 6px 0;font-size:21px;font-weight:900;color:#f8fafc}'
      + P + ' h4{margin:18px 0 8px;font-size:16px;font-weight:900;color:#7dd3fc}'
      + P + ' p{margin:0 0 8px;color:#e2e8f0}'
      + P + ' b{color:#fde68a}'
      + P + ' .hw-quick{margin:0;padding:12px 14px 12px 32px;border-radius:14px;background:rgba(255,255,255,.07)}'
      + P + ' .hw-quick li{margin:3px 0}'
      + P + ' .hw-step{display:grid;grid-template-columns:34px 1fr;gap:10px;margin:10px 0}'
      + P + ' .hw-n{width:34px;height:34px;border-radius:50%;background:#f59e0b;color:#1f2937;font-weight:900;display:flex;align-items:center;justify-content:center}'
      + P + ' .hw-step div{min-width:0}'
      + P + ' .hw-step strong{display:block;color:#fff;font-size:15.5px}'
      + P + ' .hw-step span{color:#cbd5e1;font-size:14.5px}'
      + P + ' .hw-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px}'
      + P + ' .hw-tool{border:1px solid rgba(148,163,184,.35);border-radius:12px;padding:8px 10px;font-size:14px;color:#cbd5e1;min-width:0}'
      + P + ' .hw-tool strong{display:block;color:#fff}'
      + P + ' .hw-auto{border:2px solid rgba(245,158,11,.7);border-radius:16px;padding:12px 14px;background:rgba(245,158,11,.08)}'
      + P + ' .hw-auto h4{margin-top:0;color:#fcd34d}'
      + P + ' .hw-flow{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 10px;font-size:13.5px}'
      + P + ' .hw-flow span{background:rgba(255,255,255,.1);border-radius:99px;padding:3px 10px;font-weight:800;white-space:nowrap}'
      + P + ' .hw-flow i{font-style:normal;color:#94a3b8}'
      + P + ' .hw-auto ul{margin:0;padding-left:18px}'
      + P + ' .hw-auto li{margin:4px 0;color:#e2e8f0;font-size:14.5px}'
      + P + ' details{border:1px solid rgba(148,163,184,.35);border-radius:12px;padding:8px 12px;margin:6px 0}'
      + P + ' summary{cursor:pointer;font-weight:800;color:#fff}'
      + P + ' details p{margin:6px 0 2px;font-size:14.5px;color:#cbd5e1}'
      + P + ' .hw-ok{display:block;width:100%;margin-top:16px;padding:12px;border:0;border-radius:14px;background:linear-gradient(90deg,#38bdf8,#2563eb);color:#fff;font:inherit;font-weight:900;cursor:pointer}'
      + P + ' button:focus-visible,' + P + ' summary:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}'
      /* 🖥 PC 에서는 크게 (2026-10-03 사장님 «PC에서 잘 보이게 키워줘») — 창 폭·글자 모두 */
      + '@media(min-width:1024px){' + P + ' .hw-box{max-width:1040px;max-height:92vh;padding:34px 38px 28px;font-size:19px;line-height:1.65}'
      + P + ' h3{font-size:30px;margin-right:240px}' + P + ' h4{font-size:22px;margin-top:24px}'
      + P + ' .hw-x{width:48px;height:48px;font-size:21px;top:16px;right:16px}'
      + P + ' .hw-snd{height:48px;top:16px;right:76px;font-size:17px;padding:0 18px}'
      + P + ' .hw-quick li{margin:5px 0}' + P + ' .hw-step{grid-template-columns:44px 1fr;gap:14px;margin:14px 0}'
      + P + ' .hw-n{width:44px;height:44px;font-size:20px}' + P + ' .hw-step strong{font-size:20px}' + P + ' .hw-step span{font-size:18px}'
      + P + ' .hw-tool{font-size:17px;padding:12px 14px}' + P + ' .hw-tool strong{font-size:18px}'
      + P + ' .hw-flow{font-size:17px}' + P + ' .hw-auto li,' + P + ' details p{font-size:18px}' + P + ' summary{font-size:18px}'
      + P + ' .hw-ok{font-size:19px;padding:15px}}'
      + '@media(max-width:560px){' + P + ' .hw-tools{grid-template-columns:1fr}' + P + ' h3{font-size:18px;margin-top:40px;margin-right:0}' + P + ' .hw-snd{left:16px;right:auto}' + P + ' .hw-box{padding-bottom:28px}}';
    document.head.appendChild(st);
  }
  function html() {
    var t = T(), i, o = [];
    o.push('<div class="hw-box" role="dialog" aria-modal="true" aria-labelledby="wuhowto-title">');
    o.push('<button type="button" class="hw-x" aria-label="' + t.close + '">✕</button>');
    var on = sndOn();
    o.push('<button type="button" class="hw-snd' + (on ? '' : ' off') + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + (on ? t.mute : t.unmute) + '" title="' + (on ? t.mute : t.unmute) + '">' + (on ? '🔊 ' + t.mute : '🔇 ' + t.unmute) + '</button>');
    o.push('<h3 id="wuhowto-title">' + t.title + '</h3><p>' + t.lead + '</p>');
    o.push('<h4>' + t.quickT + '</h4><ol class="hw-quick">');
    for (i = 0; i < t.quick.length; i++) o.push('<li>' + t.quick[i] + '</li>');
    o.push('</ol>');
    for (i = 0; i < t.steps.length; i++) o.push('<div class="hw-step"><span class="hw-n">' + (i + 1) + '</span><div><strong>' + t.steps[i][0] + '</strong><span>' + t.steps[i][1] + '</span></div></div>');
    o.push('<h4>' + t.toolsT + '</h4><div class="hw-tools">');
    for (i = 0; i < t.tools.length; i++) o.push('<div class="hw-tool"><strong>' + t.tools[i][0] + '</strong>' + t.tools[i][1] + '</div>');
    o.push('</div><div class="hw-auto" style="margin-top:18px"><h4>' + t.autoT + '</h4><div class="hw-flow">');
    for (i = 0; i < t.flow.length; i++) o.push((i ? '<i>→</i>' : '') + '<span>' + t.flow[i] + '</span>');
    o.push('<i>→ ' + t.flowTail + '</i></div><ul>');
    for (i = 0; i < t.autoTips.length; i++) o.push('<li>' + t.autoTips[i] + '</li>');
    o.push('</ul></div><h4>' + t.faqT + '</h4>');
    for (i = 0; i < t.faq.length; i++) o.push('<details><summary>' + t.faq[i][0] + '</summary><p>' + t.faq[i][1] + '</p></details>');
    o.push('<button type="button" class="hw-ok">' + t.ok + '</button></div>');
    return o.join('');
  }
  /* 🔊 성우 음성 (2026-10-03 사장님) — 열면 바로 말한다. 옆 버튼으로 끄고 켠다(기기에 기억).
     ⚠️ 음성은 한국어 한 벌이라 영어 화면에서는 «꺼진 채» 시작하고 누르면 들려준다.
     ⚠️ <audio> 는 안내창 «상자 밖» 에 둔다 — 언어를 바꿔 상자를 다시 그려도 재생이 안 끊긴다.
     ⛔ ?v= 를 올리지 않고 파일만 바꾸지 말 것 — 1년 immutable 캐시에 옛 음성이 남는다. */
  var AUDIO_SRC = '/audio/warmup-howto-ko.mp3?v=2';
  var MUTE_KEY = 'mangoi_howto_voice_off';
  var playing = false;
  function voiceOff() { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; } }
  function sndOn() { return playing; }
  function audioEl() {
    var o = document.getElementById(ID); if (!o) return null;
    var a = o.querySelector('audio.hw-audio');
    if (!a) {
      a = document.createElement('audio'); a.className = 'hw-audio'; a.preload = 'none'; a.src = AUDIO_SRC;
      a.addEventListener('ended', function () { playing = false; paintSnd(); });
      o.appendChild(a);
    }
    return a;
  }
  function paintSnd() {
    var o = document.getElementById(ID); var b = o && o.querySelector('.hw-snd'); if (!b) return;
    var t = T(), on = sndOn(), label = on ? t.mute : t.unmute;
    b.classList.toggle('off', !on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', label); b.title = label;
    b.textContent = (on ? '🔊 ' : '🔇 ') + label;
  }
  function play() {
    var a = audioEl(); if (!a) return;
    playing = true; paintSnd();
    try {
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function () { playing = false; paintSnd(); });   /* 자동재생이 막히면 «꺼짐» 으로 정직하게 */
    } catch (e) { playing = false; paintSnd(); }
  }
  function stop(reset) {
    var a = audioEl(); playing = false;
    if (a) { try { a.pause(); if (reset) a.currentTime = 0; } catch (e) {} }
    paintSnd();
  }
  function toggleSnd() {
    if (sndOn()) { stop(false); try { localStorage.setItem(MUTE_KEY, '1'); } catch (e) {} }
    else { try { localStorage.removeItem(MUTE_KEY); } catch (e) {} play(); }
  }
  function close() { var o = document.getElementById(ID); if (o) { stop(true); o.hidden = true; } }
  function open() {
    style();
    /* ⛔ ⋮ 메뉴를 닫지 않는다 — closeMenu 는 자동 말하기가 감싸 «닫히면 마이크를 켠다». 안내창이 그 위에 뜬다(z 100002). */
    var o = document.getElementById(ID);
    if (!o) {
      o = document.createElement('div'); o.id = ID;
      o.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.hw-snd')) { toggleSnd(); return; }
        if (e.target === o || (e.target.closest && e.target.closest('.hw-x,.hw-ok'))) close();
      });
      document.body.appendChild(o);
    }
    var keep = o.querySelector('audio.hw-audio');
    o.innerHTML = html();   /* 여는 순간의 언어로 그린다 */
    if (keep) o.appendChild(keep);
    o.hidden = false;
    if (!isEn() && !voiceOff()) play(); else paintSnd();   /* 연 클릭이 사용자 동작이라 바로 재생된다 */
    try { o.querySelector('.hw-x').focus(); } catch (e) {}
  }
  window.mgOpenWarmupHowto = open;
  try { style(); } catch (e) {}   /* 화면에 이미 있는 칩(.howto-chip) 모양도 이 파일이 책임진다 */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { var o = document.getElementById(ID); if (o && !o.hidden) close(); }
  });
  function relang() {
    var o = document.getElementById(ID); if (!o || o.hidden) return;
    var keep = o.querySelector('audio.hw-audio');
    o.innerHTML = html(); if (keep) o.appendChild(keep);
  }
  window.addEventListener('mangoi:lang-changed', relang);
  document.addEventListener('mangoi:lang-changed', relang);
})();
