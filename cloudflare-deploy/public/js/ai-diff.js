/* 💡 「A.i말하기와 A.i친구하기 차이」 — 학생 안내창 정본 (2026-09-26 사장님 지시 · 10대 눈높이)
   [어디서 여나] ① 홈 「AI와 친구하기」 두 카드의 칩(js/idx-allmenu.js 가 이 파일을 눌렀을 때 불러옴)
                ② /warmup.html 설정 화면 · ③ /ai-friend.html 첫 화면 — 둘 다 이 파일을 직접 싣는다.
   ⛔ 문구를 다른 파일에 복사하지 말 것 — 안내가 세 곳에서 따로 놀게 된다. 여기 한 곳만 고친다.
   ⚠️ 내용(사실)은 warmup.html · ai-friend.html 기준 — 기능이 바뀌면 이 문구도 함께.
   ⚠️ 이 파일을 고치면 부르는 세 곳의 ?v= 를 함께 올릴 것(idx-allmenu.js 안의 주소 포함). */
(function(){
  if (window.mgOpenAiDiff) return;
  function isEn(){
    try{ if(typeof window.getLang === 'function') return String(window.getLang()||'').toLowerCase().indexOf('en') === 0; }catch(e){}
    try{ return (localStorage.getItem('mangoi_lang')||'') === 'en'; }catch(e){}
    return false;
  }
  var AIDIFF_ID = 'aidiff-ov';
  var AIDIFF_TXT = {
    ko: {
      chip: '💡 A.i말하기와 A.i친구하기 차이',
      title: 'A.i말하기와 A.i친구하기 차이',
      lead: '둘 다 AI랑 영어로 말하는 건 똑같아요. 다른 점은 딱 하나, <b>누가 대화를 이끄느냐</b>예요!',
      aName: '🗣️ A.i 말하기', aOne: 'AI가 먼저 말을 걸어요',
      a: ['오늘 배울 <b>교재 내용</b>으로 대화해요 — 수업 전 입 풀기에 딱!',
          '뭐라고 할지 막히면 <b>「대답 보기」</b>로 힌트를 볼 수 있어요',
          '말하는 동안 <b>자막이 바로바로</b> 떠요',
          '<b>영어·중국어</b> 둘 다 할 수 있어요'],
      bName: '🤖 A.i 친구하기', bOne: '내가 주제를 골라요',
      b: ['동물·영화·음식처럼 <b>좋아하는 얘기</b>로 수다 떨어요',
          '문장은 <b>내가 직접</b> 만들어요 — 그래서 실력이 더 늘어요',
          '말이 끝나면 글자가 떠요. 대신 <b>발음을 더 정확히</b> 알아들어요',
          '<b>영어</b>로 대화해요'],
      same: '<b>둘 다 똑같은 점</b> · 틀린 문장은 교정 카드로 고쳐 줘요 · 레벨이 서로 이어져요',
      whenT: '언제 뭘 하면 좋을까?',
      whenA: '수업 바로 전이거나, 영어로 말하는 게 아직 어색하다면',
      whenB: '수업이 없는 날, 좋아하는 주제로 자유롭게 떠들고 싶다면',
      goA: 'A.i 말하기 시작', goB: 'A.i 친구하기 시작', close: '닫기'
    },
    en: {
      chip: '💡 Speaking vs. Friend: what\'s different?',
      title: 'A.i Speaking vs. A.i Friend',
      lead: 'Both let you talk with AI in English. The one big difference: <b>who leads the chat</b>!',
      aName: '🗣️ A.i Speaking', aOne: 'The AI talks to you first',
      a: ['You talk about <b>today\'s textbook</b> — perfect speaking practice before class!',
          'Stuck? Tap <b>“Show answers”</b> for a hint',
          '<b>Subtitles appear right away</b> while you speak',
          'Works in <b>English and Chinese</b>'],
      bName: '🤖 A.i Friend', bOne: 'You pick the topic',
      b: ['Chat about <b>things you like</b> — animals, movies, food…',
          'You build <b>your own sentences</b> — so you improve faster',
          'Text shows up after you finish, but it <b>hears your pronunciation better</b>',
          'Chat in <b>English</b>'],
      same: '<b>Both</b> · fix your mistakes with a correction card · share the same level',
      whenT: 'Which one should I do?',
      whenA: 'Right before class, or if speaking English still feels awkward',
      whenB: 'On days without class, when you just want to chat about fun stuff',
      goA: 'Start A.i Speaking', goB: 'Start A.i Friend', close: 'Close'
    }
  };
  function aidiffT(){ return isEn() ? AIDIFF_TXT.en : AIDIFF_TXT.ko; }
  window.mgAiDiffText = AIDIFF_TXT;
  function aidiffStyle(){
    if (document.getElementById('aidiff-style')) return;
    var st = document.createElement('style'); st.id = 'aidiff-style';
    st.textContent =
      '.aidiff-chip{display:inline-flex;align-items:center;gap:4px;margin:8px auto 4px;padding:6px 14px;border-radius:99px;background:rgba(251,191,36,.16);border:1px solid rgba(251,191,36,.6);color:#fde68a;font:inherit;font-size:14px;font-weight:800;line-height:1.35;cursor:pointer}'
     +'.aidiff-chip:hover,.aidiff-chip:focus-visible{background:rgba(251,191,36,.3);outline:none}'
     +'#'+AIDIFF_ID+'{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,16,.8)}'
     +'#'+AIDIFF_ID+'[hidden]{display:none!important}'
     +'#'+AIDIFF_ID+' .ad-box{position:relative;width:100%;max-width:720px;max-height:90vh;overflow-y:auto;background:#131c33;border:1px solid rgba(251,191,36,.45);border-radius:22px;padding:26px 22px 20px;color:#f1f5f9;font-size:15px;line-height:1.55}'
     +'#'+AIDIFF_ID+' .ad-x{position:absolute;top:12px;right:12px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fde68a;font-size:17px;cursor:pointer}'
     +'#'+AIDIFF_ID+' h3{margin:0 40px 6px 0;font-size:21px;font-weight:900;color:#fdf6e3}'
     +'#'+AIDIFF_ID+' .ad-lead{margin:0 0 14px;color:#e2e8f0}'
     +'#'+AIDIFF_ID+' .ad-lead b{color:#fbbf24}'
     +'#'+AIDIFF_ID+' .ad-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
     +'#'+AIDIFF_ID+' .ad-col{border-radius:16px;padding:14px 14px 10px;border:1px solid}'
     +'#'+AIDIFF_ID+' .ad-a{background:rgba(234,88,12,.14);border-color:rgba(251,146,60,.6)}'
     +'#'+AIDIFF_ID+' .ad-b{background:rgba(37,99,235,.16);border-color:rgba(96,165,250,.6)}'
     +'#'+AIDIFF_ID+' .ad-name{font-size:17px;font-weight:900;color:#fff}'
     +'#'+AIDIFF_ID+' .ad-one{display:inline-block;margin:4px 0 8px;padding:2px 10px;border-radius:99px;font-size:13px;font-weight:800;color:#111827}'
     +'#'+AIDIFF_ID+' .ad-a .ad-one{background:#fdba74}#'+AIDIFF_ID+' .ad-b .ad-one{background:#93c5fd}'
     +'#'+AIDIFF_ID+' ul{margin:0;padding-left:18px}#'+AIDIFF_ID+' li{margin:4px 0;color:#e2e8f0}'
     +'#'+AIDIFF_ID+' li b{color:#fff}'
     +'#'+AIDIFF_ID+' .ad-same{margin:12px 0 0;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.07);color:#e2e8f0;font-size:14px}'
     +'#'+AIDIFF_ID+' .ad-same b{color:#fbbf24}'
     +'#'+AIDIFF_ID+' .ad-when{margin:12px 0 0}'
     +'#'+AIDIFF_ID+' .ad-when h4{margin:0 0 6px;font-size:15px;font-weight:900;color:#fdf6e3}'
     +'#'+AIDIFF_ID+' .ad-go{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
     +'#'+AIDIFF_ID+' .ad-go a{display:block;text-decoration:none;border-radius:14px;padding:10px 12px;font-size:13.5px;color:#e2e8f0;border:1px solid}'
     +'#'+AIDIFF_ID+' .ad-go a b{display:block;font-size:15px;color:#fff;margin-top:4px}'
     +'#'+AIDIFF_ID+' .ad-go .ad-a{border-color:rgba(251,146,60,.6)}#'+AIDIFF_ID+' .ad-go .ad-b{border-color:rgba(96,165,250,.6)}'
     +'@media(max-width:560px){#'+AIDIFF_ID+' .ad-cols,#'+AIDIFF_ID+' .ad-go{grid-template-columns:1fr}#'+AIDIFF_ID+' h3{font-size:18px}#'+AIDIFF_ID+' .ad-box{padding-bottom:96px}}';
    document.head.appendChild(st);
  }
  function aidiffHtml(){
    var t = aidiffT();
    function li(arr){ return arr.map(function(x){ return '<li>'+x+'</li>'; }).join(''); }
    return '<div class="ad-box" role="dialog" aria-modal="true" aria-labelledby="aidiff-title">'
      + '<button type="button" class="ad-x" aria-label="'+t.close+'">✕</button>'
      + '<h3 id="aidiff-title">'+t.title+'</h3>'
      + '<p class="ad-lead">'+t.lead+'</p>'
      + '<div class="ad-cols">'
      +   '<div class="ad-col ad-a"><div class="ad-name">'+t.aName+'</div><span class="ad-one">'+t.aOne+'</span><ul>'+li(t.a)+'</ul></div>'
      +   '<div class="ad-col ad-b"><div class="ad-name">'+t.bName+'</div><span class="ad-one">'+t.bOne+'</span><ul>'+li(t.b)+'</ul></div>'
      + '</div>'
      + '<p class="ad-same">'+t.same+'</p>'
      + '<div class="ad-when"><h4>'+t.whenT+'</h4><div class="ad-go">'
      +   '<a class="ad-a" href="/warmup.html">'+t.whenA+'<b>👉 '+t.goA+'</b></a>'
      +   '<a class="ad-b" href="/ai-friend.html">'+t.whenB+'<b>👉 '+t.goB+'</b></a>'
      + '</div></div>'
      + '</div>';
  }
  function aidiffClose(){ var o = document.getElementById(AIDIFF_ID); if (o) o.hidden = true; }
  function aidiffOpen(){
    aidiffStyle();
    var o = document.getElementById(AIDIFF_ID);
    if (!o) {
      o = document.createElement('div'); o.id = AIDIFF_ID;
      o.addEventListener('click', function(e){
        if (e.target === o || (e.target.closest && e.target.closest('.ad-x'))) aidiffClose();
      });
      document.body.appendChild(o);
    }
    o.innerHTML = aidiffHtml();   /* 여는 순간의 언어로 그린다 */
    o.hidden = false;
    try { o.querySelector('.ad-x').focus(); } catch(e){}
  }
  window.mgOpenAiDiff = aidiffOpen;
  /* 화면에 이미 그려진 칩(.aidiff-chip)의 모양도 이 파일이 책임진다 — 싣는 즉시 입힌다 */
  try { aidiffStyle(); } catch(e){}
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') { var o = document.getElementById(AIDIFF_ID); if (o && !o.hidden) aidiffClose(); }
  });
  function aidiffRelang(){ var o = document.getElementById(AIDIFF_ID); if (o && !o.hidden) o.innerHTML = aidiffHtml(); }
  /* 관리자 쪽은 document, 공용 엔진은 window 에서 쏜다 — 양쪽 다 듣는다(CLAUDE.md 2장) */
  window.addEventListener('mangoi:lang-changed', aidiffRelang);
  document.addEventListener('mangoi:lang-changed', aidiffRelang);

})();
