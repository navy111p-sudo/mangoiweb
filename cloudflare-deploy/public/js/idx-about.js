// idx-about.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

      window.openAboutMangoi = function(){
        var ex = document.getElementById('about-mangoi-ov');
        if (ex) { ex.style.display='flex'; if(window.__abmPlayIntro) window.__abmPlayIntro(); return; }
        var abmAudio=null;var abmMuted=(function(){try{return localStorage.getItem('abm_muted')==='1';}catch(e){return false;}})();function abmPlayVoice(src){ try{ if(abmMuted) return; abmStopVoice(); abmAudio=new Audio(src); var p=abmAudio.play(); if(p&&p.catch) p.catch(function(){}); }catch(e){} }function abmStopVoice(){ try{ if(abmAudio){ abmAudio.pause(); abmAudio.currentTime=0; } }catch(e){} }var closeAbout = function(){ abmStopVoice(); var o=document.getElementById('about-mangoi-ov'); if(o) o.style.display='none'; };
        var BENEFITS = [
          /* 🎬 (2026-09-05 사장님 지시) 안내 영상 — «처음 들어온 사람이 들어보고 이해하게».
             ⛔ 여기서 영상을 «틀지» 않는다. 24.4MB 라 카드를 여는 것만으로 받게 하면
                볼 생각이 없는 사람에게도 내려간다(adm-promo-setup.js 가 같은 판단을 해 뒀다).
                포스터 그림(26KB) + 링크로 간다 — 누르기 전엔 영상 0바이트.
             ⚠️ 대본이 「선생님은…」 으로 말한다(대상 = 학원 원장·강사). 그래서 카드 글도
                그렇게 적는다 — 학생이 눌렀다가 «내 이야기가 아니네» 로 끝나지 않게. */
          {ic:'🎬', t:'▶ 안내 영상 — 3분 47초로 보기', lead:true,
           d:'<img src="/img/promo/ai-tools-poster.jpg" alt="" style="width:100%;height:auto;border-radius:12px;display:block;margin:0 0 12px" loading="lazy" decoding="async">'
             + '망고아이 AI 학습도구를 <b>왜 만들었고 어떻게 쓰는지</b> 3분 47초에 담았습니다. '
             + '원장님·선생님께 드리는 안내라, 학생은 <b>부모님·선생님과 함께</b> 보시면 좋습니다.',
           p:['왜 만들었나 — 단어 하나를 제 것으로 만들려면 8~10번은 만나야 합니다',
              '어떻게 쓰나 — 정규수업을 바꾸지 않고 수업 전 10분·수업 후 10분을 붙입니다',
              '효과 — 주 100분이던 노출이 매일로 바뀝니다'],
           /* ⚠️ 카톡·문자앱 인앱 브라우저는 새 창을 «못 열고 null 만» 돌려준다(예외도 안 난다).
              ⛔ 기능 문자열에 'noopener' 를 주면 표준상 반환이 늘 null 이라 «막혔다» 판정이 항상 참이 된다
                 → 빼고 연 뒤 opener 를 끊는다(CLAUDE.md 2장 «window.open 이 안 열림»). */
           cta:{l:'▶ 영상 보기 (3분 47초)', go:function(){
             var u = '/promo.html?v=ai-tools', w = null;
             try { w = window.open(u, '_blank'); } catch (e) {}
             if (w) { try { w.opener = null; } catch (e) {} } else { location.href = u; }
           }}},
          {ic:'🤝', t:'교사와 A.I가 함께 학생 실력 향상', lead:true, voice:'/audio/teacher-ai-voice.mp3',
           d:'원어민 선생님의 1:1 화상수업과 A.I 학습관리가 하나의 시스템 안에서 맞물려 돌아갑니다. 수업은 사람이 이끌고, 예습·복습·평가·발음 교정은 A.I가 24시간 도와 학습의 빈틈을 메웁니다.',
           p:['수업(사람) + 학습관리(A.I)를 한 곳에서 — 수업만 제공하는 다른 대부분의 화상외국어 업체들과 다릅니다','매 수업이 끝나면 A.I가 자동으로 평가서를 생성하고, 배운 내용에 맞춰 듣기·말하기·쓰기 등 10문항 복습 퀴즈를 바로 진행','교사 피드백과 A.I 학습 데이터가 서로 연동되어 약점을 정확히 보완'],
           cta:{l:'🤖 AI 학습 친구 만나기', go:function(){ closeAbout(); location.href='/ai-friend.html'; }}},
          {ic:'🧑‍🏫', t:'원어민 선생님과 1:1 / 1:2 수업',
           d:'엄격하게 검증된 원어민 전담 선생님과 1:1 또는 1:2 소수정예로 진행합니다. 같은 선생님이 꾸준히 관리하기 때문에 아이의 성향과 약점을 정확히 파악해 맞춤 지도를 합니다.',
           p:['매번 바뀌는 랜덤 매칭이 아닌 전담 선생님제로 안정적인 관리','형제·친구와 함께하는 1:2 수업으로 비용 부담은 낮추고 효과는 그대로','직영 센터에서 근무하는 정규 교사 — 검증된 수업 품질'],
           cta:{l:'📝 수업 신청하러 가기', go:function(){ closeAbout(); location.href='/lesson-booking-demo.html'; }}},
          {ic:'💬', t:'영어 커뮤니케이션 능력의 향상',
           d:'문법 암기가 아니라 실제로 입이 트이는 말하기 중심 수업입니다. 매 수업 충분한 발화량과 즉각적인 교정으로 머릿속 영어를 살아있는 회화로 바꿔 줍니다.',
           p:['수업 외 시간에도 A.I 발음 코치로 무제한 말하기 연습','발화량과 발음 점수를 데이터로 기록해 성장 과정을 확인','실생활 표현 중심 커리큘럼으로 바로 쓰는 영어'],
           cta:{l:'🎤 AI 발음 코치 체험', go:function(){ closeAbout(); if(window.gridActions&&window.gridActions.speech) window.gridActions.speech(); }}},
          {ic:'💰', t:'저렴한 비용으로 최고의 학습 효과',
           d:'필리핀 현지 교육센터를 직접 운영해 불필요한 중간 비용을 없앴습니다. 영미권 원어민 화상영어 대비 합리적인 가격으로, 같은 예산이면 더 자주 수업할 수 있습니다.',
           p:['직영 운영으로 거품을 뺀 합리적인 수강료','1:2 수업을 선택하면 1인당 비용을 한 번 더 절감','월 단위 부담 없이 시작 — 무료 상담으로 맞춤 견적 제공'],
           cta:{l:'💳 수강료·결제 안내', go:function(){ closeAbout(); if(window.gridActions&&window.gridActions.payment) window.gridActions.payment(); }}},
          {ic:'🏆', t:'최고의 강사진과 체계적인 관리 시스템',
           d:'엄격한 채용과 정기 교육을 거친 강사진이 수업을 맡고, 출결·진도·성취를 데이터로 관리합니다. 담당 매니저가 학습 전반을 함께 챙겨 드립니다.',
           p:['매 수업 평가표를 자동으로 생성해 성장 추이를 한눈에','전담 매니저의 학습 케어와 정기 상담','데이터 기반 진도 관리로 빠짐없는 학습'],
           cta:{l:'👩‍🏫 강사 소개 보기', go:function(){ closeAbout(); if(window.gridActions&&window.gridActions.teachers) window.gridActions.teachers(); }},
           cta2:{l:'📋 평가표 살펴보기', go:function(){ closeAbout(); if(window.gridActions&&window.gridActions.report) window.gridActions.report(); }}},
          {ic:'⏰', t:'시간과 장소에 구애받지 않는 시스템',
           d:'집, 학교, 여행지 어디서나 PC·태블릿·휴대폰으로 수업에 입장합니다. 원하는 시간대로 예약하고, 갑작스러운 일정은 연기·변경으로 유연하게 조정할 수 있습니다.',
           p:['모바일까지 완벽 대응 — 언제 어디서나 수업 입장','수업 연기·변경 기능으로 일정 변동에도 빠짐없이','원하는 시간대 자유 예약'],
           cta:{l:'📅 수업 연기·변경 보기', go:function(){ closeAbout(); location.href='/lesson-postpone-demo.html'; }}},
          {ic:'📚', t:'우수한 교재로 영어 말하기 동기 부여',
           d:'연령과 레벨에 맞춰 설계된 자체 교재와 CEFR 기반 커리큘럼으로 학습합니다. 아이가 흥미를 느끼는 주제로 구성해 스스로 말하고 싶게 만듭니다.',
           p:['CEFR 국제 기준에 맞춘 단계별 커리큘럼','디지털 교재 뷰어로 예습·복습이 간편','연령·관심사 맞춤 주제로 학습 동기 부여'],
           cta:{l:'📚 교육과정 보기', go:function(){ closeAbout(); if(window.gridActions&&window.gridActions.curriculum) window.gridActions.curriculum(); }}},
          {ic:'📱', t:'편리하고 다양한 기능의 앱과 홈페이지',
           d:'수업 입장부터 예습·복습, 평가 확인, 결제, 상담까지 하나의 앱과 홈페이지에서 끝납니다. A.I 검색으로 원하는 기능을 말 한마디로 바로 찾을 수 있습니다.',
           p:['여러 앱을 오갈 필요 없는 올인원 통합 플랫폼','A.I 음성·텍스트 검색으로 원하는 기능 즉시 이동','전체 메뉴 한눈에 보기'],
           cta:{l:'🏠 전체 메뉴 열기', go:function(){ closeAbout(); if(window.openAllMenuOverlay) window.openAllMenuOverlay(); }}},
          /* 🚫 (2026-08-08 사장님 확정) 예복습 동영상 폐지 — 「예복습은 AI 로 간다」
             전에는 «예습 영상 + 복습 퀴즈» 였는데 영상을 빼므로, 카드도 «AI 예복습» 으로 바꾼다.
             ⚠️ 없는 걸 광고하면 안 된다 — 「영상 보기」 버튼(/lessons.html)도 함께 뺐다. */
          {ic:'🎯', t:'AI 예복습 — 수업 전후를 A.I가 챙깁니다',
           d:'수업 전에는 배울 문장을 미리 보고, 수업 후에는 틀린 문제를 A.I가 다시 냅니다. 단어장·연속 학습으로 습관까지 잡아 줍니다.',
           p:['게임형 마이크로 퀴즈로 지루하지 않은 복습','단어장·연속 학습(스트릭)으로 꾸준한 습관 형성','푼 기록이 매달 성적표의 «이해·정확도»로 쌓임'],
           cta:{l:'🎯 AI 단어 퀴즈 체험', go:function(){ closeAbout(); location.href='/micro-quiz.html'; }},
           cta2:{l:'📚 단어장 보기', go:function(){ closeAbout(); location.href='/vocab.html'; }}},
          {ic:'🤖', t:'A.I를 활용한 수업 평가 · 복습 · 소통', voice:'/audio/ai-report-voice.mp3',
           d:'매 수업이 끝나면 A.I가 발음·표현·참여도를 분석해 평가서를 자동으로 만들고, 아이에게 꼭 필요한 맞춤 복습을 추천합니다. 월간 리포트로 성장 흐름도 정리해 드립니다.',
           p:['수업마다 A.I 자동 평가서 생성','약점을 짚어 주는 맞춤형 복습 추천','월간 A.I 리포트로 한 달 성장 요약'],
           cta:{l:'📊 월간 AI 리포트 보기', go:function(){ closeAbout(); location.href='/monthly-report.html'; }}},
          // 🇵🇭 [2026-07-27] 국기 '이모지'는 Windows 에서 국가코드 문자("PH")로 표시된다.
          //   직원 피드백 #11 의 'PH 로만 보인다'가 바로 이것 — 다른 이모지로 바꿔도 재발한다.
          //   이모지가 아니라 SVG 파일이어야 해결된다. 되돌리지 말 것.
          {ic:'<img src="/img/flag-ph.svg?v=1" alt="필리핀" class="abm-flag">', t:'직영 필리핀 현지 교육센터 운영',
           d:'외주 업체가 아니라 망고아이가 직접 운영하는 필리핀 현지 교육센터입니다. 안정적인 인터넷과 근무 환경에서 검증된 정규 교사가 책임감 있게 수업합니다.',
           p:['외주가 아닌 직영 운영 — 수업 품질과 비용을 직접 관리','전용 인터넷·장비를 갖춘 안정적인 수업 환경','정규직 교사의 책임 있는 전담 관리'],
           cta:{l:'🌟 망고아이 특장점', go:function(){ closeAbout(); if(window.gridActions&&window.gridActions.features) window.gridActions.features(); }}},
          {ic:'🥇', t:'20년 전통, 국내 최초의 화상영어 기업',
           d:'국내에서 화상영어를 가장 먼저 시작한 20년 전통의 기업입니다. 오랜 노하우와 수많은 학생 데이터가 쌓인, 시간으로 검증된 교육 시스템을 제공합니다.',
           p:['신생 스타트업과는 다른 20년의 운영 노하우','수많은 학생을 지도하며 다듬어 온 커리큘럼','실제 학부모·학생 후기로 검증된 신뢰'],
           cta:{l:'⭐ 수강 후기 보기', go:function(){ closeAbout(); if(window.gridActions&&window.gridActions.reviews) window.gridActions.reviews(); }}},
          {ic:'📩', t:'학생 정보를 카카오톡으로 실시간 제공',
           d:'수업 출결, 평가, 진도, 공지를 학부모님 카카오톡으로 실시간 전송합니다. 따로 앱을 열지 않아도 아이의 학습 상황을 바로 확인할 수 있습니다.',
           p:['수업 출결·평가를 카카오톡으로 실시간 알림','월간 A.I 리포트도 카카오톡으로 발송','학부모와 센터 간 빠른 소통 창구'],
           cta:{l:'💬 카카오톡 채널 가기', go:function(){ closeAbout(); if(window.gridActions&&window.gridActions.kakao) window.gridActions.kakao(); }}}
        ];
        var ov = document.createElement('div'); ov.id='about-mangoi-ov';
        var gridHtml = BENEFITS.map(function(b,i){ var cls=b.lead?'abm-item abm-lead':'abm-item'; return '<button type="button" class="'+cls+'" data-i="'+i+'"><span class="abm-ic">'+b.ic+'</span><span class="abm-tx">'+b.t+'</span><span class="abm-chev">›</span></button>'; }).join('');
        ov.innerHTML =
          '<div class="abm-card" role="dialog" aria-modal="true">'
          + '<button class="abm-close" aria-label="닫기">✕</button>'
          + '<button class="abm-mute" type="button" aria-label="음성 켜기/끄기" title="음성 켜기/끄기">🔊</button>'
          + '<div class="abm-view abm-view-list">'
          +   '<div class="abm-head"><h2 class="abm-title">망고아이란?</h2>'
          +     '<p class="abm-sub">20년 전통 · 국내 최초의 화상영어 기업</p><div class="abm-rule"></div>'
          +     '<p class="abm-intro">원어민 1:1 화상수업과 A.I 학습관리로, 합리적인 비용에 최고의 영어 말하기 효과를 드립니다. <b class="abm-hint">카드를 누르면 자세히 볼 수 있어요 👆</b></p></div>'
          +   '<div class="abm-grid">'+gridHtml+'</div>'
          +   '<div class="abm-foot"><button class="abm-cta abm-cta-main">무료 상담 신청하기</button></div>'
          + '</div>'
          + '<div class="abm-view abm-view-detail" style="display:none">'
          +   '<button class="abm-back" type="button">← 목록으로</button>'
          +   '<div class="abm-detail-body"></div>'
          + '</div>'
          + '</div>';
        var card = ov.querySelector('.abm-card');
        var listView = ov.querySelector('.abm-view-list');
        var detailView = ov.querySelector('.abm-view-detail');
        var detailBody = ov.querySelector('.abm-detail-body');
        function showList(){ abmStopVoice(); detailView.style.display='none'; listView.style.display='block'; card.scrollTop=0; }
        function showDetail(i){
          var b=BENEFITS[i];
          var pts=b.p.map(function(x){ return '<li>'+x+'</li>'; }).join('');
          detailBody.innerHTML =
            '<div class="abm-dhead"><span class="abm-dic">'+b.ic+'</span><h3 class="abm-dtitle">'+b.t+'</h3></div>'
            + '<p class="abm-ddesc">'+b.d+'</p>'
            + '<div class="abm-dpts-h">✨ 망고아이만의 강점</div>'
            + '<ul class="abm-dpts">'+pts+'</ul>'
            + '<button class="abm-cta abm-dcta" type="button">'+b.cta.l+'</button>'
            // 🔗 [2026-07-27] 보조 CTA(cta2) — 카드 본문이 말하는 걸 정작 못 보던 문제(직원 피드백 #4·#8).
            //   예: "예습 영상과 퀴즈" 카드인데 퀴즈 버튼만 있었고, "최고의 강사진" 카드인데
            //   강사 소개로 가는 길이 없었다. 기능은 둘 다 이미 있었고 링크만 없었다.
            + (b.cta2 ? '<button class="abm-cta abm-dcta abm-dcta2" type="button">'+b.cta2.l+'</button>' : '');
          detailBody.querySelector('.abm-dcta').addEventListener('click', b.cta.go);
          if (b.cta2) detailBody.querySelector('.abm-dcta2').addEventListener('click', b.cta2.go);
          listView.style.display='none'; detailView.style.display='block';
          detailView.classList.remove('abm-anim'); void detailView.offsetWidth; detailView.classList.add('abm-anim'); abmStopVoice(); if(b&&b.voice){ abmPlayVoice(b.voice); }
          card.scrollTop=0;
        }
        ov.addEventListener('click', function(e){ if(e.target===ov && (window.mgBackdropClosable ? window.mgBackdropClosable(ov) : true)) closeAbout(); });   /* QA#4: 배경 클릭 닫힘 차단 */
        ov.querySelector('.abm-close').addEventListener('click', closeAbout);var abmMuteBtn=ov.querySelector('.abm-mute');function abmUpdateMute(){ if(!abmMuteBtn) return; abmMuteBtn.textContent=abmMuted?'🔇':'🔊'; abmMuteBtn.classList.toggle('muted',abmMuted); }abmUpdateMute();if(abmMuteBtn) abmMuteBtn.addEventListener('click', function(){ abmMuted=!abmMuted; try{localStorage.setItem('abm_muted',abmMuted?'1':'0');}catch(e){} if(abmMuted) abmStopVoice(); abmUpdateMute(); });
        ov.querySelector('.abm-cta-main').addEventListener('click', function(){ closeAbout(); if(window.openInquiryModal) window.openInquiryModal(); });
        ov.querySelector('.abm-back').addEventListener('click', showList);
        Array.prototype.forEach.call(ov.querySelectorAll('.abm-item'), function(btn){ btn.addEventListener('click', function(){ showDetail(+btn.getAttribute('data-i')); }); });
        document.body.appendChild(ov);
        window.__abmPlayIntro = function(){ abmPlayVoice('/audio/mangoi-intro.mp3'); };  // 🔊 (fix 2026-06-10) '망고아이란?' 모달 열기 인트로 음성 — abm_muted 무음설정 존중
        window.__abmPlayIntro();
        if(!document.getElementById('abm-style')){
          var st=document.createElement('style'); st.id='abm-style';
          st.textContent =
            '#about-mangoi-ov{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(4,9,20,.98);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}'
          + '.abm-card{position:relative;width:100%;max-width:760px;max-height:88vh;overflow-y:auto;background:linear-gradient(160deg,#0e1730,#0a1124);border:1px solid rgba(96,165,250,.28);border-radius:24px;box-shadow:0 30px 80px -20px rgba(0,0,0,.7);padding:30px 26px 24px;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:abmIn .28s cubic-bezier(.34,1.56,.64,1)}'
          + '@keyframes abmIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}'
          + '.abm-close{position:absolute;top:14px;right:14px;width:34px;height:34px;border:0;border-radius:50%;background:rgba(255,255,255,.1);color:#aebfd6;font-size:16px;cursor:pointer;z-index:5}'
          + '.abm-close:hover{color:#93c5fd;background:rgba(255,255,255,.18)}'
          + '.abm-mute{position:absolute;top:14px;right:56px;width:34px;height:34px;border:0;border-radius:50%;background:rgba(255,255,255,.1);color:#aebfd6;font-size:15px;cursor:pointer;z-index:5;line-height:1}'
          + '.abm-mute:hover{color:#93c5fd;background:rgba(255,255,255,.18)}'
          + '.abm-mute.muted{color:#f87171;background:rgba(248,113,113,.16)}'
          + '.abm-head{text-align:center;margin-bottom:20px}.abm-logo{font-size:44px;line-height:1;margin-bottom:6px}'
          + '.abm-title{margin:0;font-size:25px;font-weight:900;color:#f1f6ff;letter-spacing:-.5px}'
          + '.abm-sub{margin:6px 0 0;font-size:13px;font-weight:700;color:#8fb8f2}'
          + '.abm-rule{width:48px;height:4px;border-radius:4px;background:linear-gradient(90deg,#60a5fa,#3b82f6);margin:13px auto}'
          + '.abm-intro{margin:0;font-size:14px;line-height:1.65;color:#aebfd6;max-width:520px;margin-left:auto;margin-right:auto}'
          + '.abm-hint{display:inline-block;margin-top:6px;color:#93c5fd;font-weight:700}'
          + '.abm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px}'
          + '.abm-item{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.055);border:1px solid rgba(147,180,224,.28);border-radius:16px;padding:14px 16px;box-shadow:0 4px 12px -6px rgba(0,0,0,.3);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:transform .15s,box-shadow .15s,background .15s;cursor:pointer;text-align:left;width:100%;font-family:inherit}'
          + '.abm-item:hover{transform:translateY(-2px);background:rgba(255,255,255,.12);box-shadow:0 10px 22px -8px rgba(37,99,235,.45)}'
          + '.abm-item:active{transform:translateY(0)}'
          + '.abm-lead{grid-column:1 / -1;background:rgba(255,255,255,.055);border-color:rgba(147,180,224,.28);box-shadow:0 4px 12px -6px rgba(0,0,0,.3)}'
          + '.abm-lead .abm-tx{color:#e3edfb;font-size:15px}.abm-lead .abm-tx b{color:#93c5fd}.abm-lead .abm-ic{background:rgba(255,255,255,.1)}.abm-lead .abm-chev{color:#9ec1f0}'
          + '.abm-ic{font-size:22px;flex-shrink:0;width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.12);border-radius:13px}'
          + '.abm-tx{flex:1;font-size:14px;line-height:1.45;color:#e3edfb;font-weight:600}.abm-tx b{color:#93c5fd;font-weight:800}'
          + '.abm-chev{flex-shrink:0;font-size:22px;font-weight:800;color:#9ec1f0;line-height:1;transition:transform .15s}'
          + '.abm-item:hover .abm-chev{transform:translateX(3px);color:#2563eb}'
          + '.abm-foot{margin-top:20px;text-align:center}'
          + '.abm-cta{border:1px solid rgba(147,180,224,.45);border-radius:16px;padding:14px 30px;font-size:15px;font-weight:800;color:#e8f1fc;cursor:pointer;background:rgba(255,255,255,.07);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 8px 22px -10px rgba(0,0,0,.5);font-family:inherit}'
          + '.abm-cta:hover{filter:brightness(1.06)}'
          + '.abm-back{border:0;background:rgba(255,255,255,.08);color:#9ec1f0;font-size:13.5px;font-weight:700;padding:9px 16px;border-radius:12px;cursor:pointer;margin-bottom:18px;font-family:inherit}'
          + '.abm-back:hover{background:rgba(255,255,255,.16);color:#cfe2ff}'
          + '.abm-view-detail.abm-anim{animation:abmDetIn .3s cubic-bezier(.34,1.2,.64,1)}'
          + '@keyframes abmDetIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}'
          + '.abm-dhead{display:flex;align-items:center;gap:14px;margin-bottom:16px}'
          + '.abm-flag{width:26px;height:auto;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.45);display:block}'
          + '.abm-dic .abm-flag{width:36px}'
          + '.abm-dic{font-size:30px;flex-shrink:0;width:58px;height:58px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:18px}'
          + '.abm-dtitle{margin:0;font-size:20px;font-weight:900;color:#f1f6ff;line-height:1.3;letter-spacing:-.4px}'
          + '.abm-ddesc{margin:0 0 22px;font-size:15px;line-height:1.75;color:#c4d6ef}'
          + '.abm-dpts-h{font-size:14px;font-weight:800;color:#93c5fd;margin-bottom:12px}'
          + '.abm-dpts{list-style:none;margin:0 0 24px;padding:0;display:flex;flex-direction:column;gap:10px}'
          + '.abm-dpts li{position:relative;padding:13px 16px 13px 42px;background:rgba(255,255,255,.05);border:1px solid rgba(96,165,250,.18);border-radius:14px;font-size:14px;line-height:1.55;color:#dbe7f7}'
          + '.abm-dpts li:before{content:"✓";position:absolute;left:15px;top:13px;color:#34d399;font-weight:900}'
          + '.abm-dcta{width:100%;padding:15px}'
          // 보조 CTA — 1순위 버튼과 헷갈리지 않게 한 톤 낮춘다(테두리만·배경 옅게).
          + '.abm-dcta2{margin-top:8px;background:rgba(255,255,255,.03);border-color:rgba(147,180,224,.28);font-weight:700;font-size:14px}'
          + '@media(max-width:560px){.abm-grid{grid-template-columns:1fr}.abm-card{padding:24px 16px 18px}.abm-title{font-size:22px}.abm-dtitle{font-size:18px}.abm-dic{width:50px;height:50px;font-size:26px}.abm-ddesc{font-size:14px}}';
          document.head.appendChild(st);
        }
        ov.style.display='flex';
      };
      
