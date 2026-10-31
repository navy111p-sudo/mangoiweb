/* Focused warmup. No model calls, recording, persistence or classroom connection of its own. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var help = null, examples = [], step = 0, scene = '', answers = [], fixes = [], assisted = false;
  /* 🪜 (2026-10-02) 이번 질문에 받은 도움 — 'own'(혼자) · 'meaning'(뜻을 열었음) · 'example'(대답 예시를 썼음).
     선생님 요약을 세 갈래로 나누는 근거다. 학생이 답하면 그 답에 붙여 두고 다음 질문에서 'own' 으로 돌아간다. */
  var helpLevel = 'own', meaningOpen = false, nudgeTimer = 0;
  /* 막혔을 때 보기 — 서버 정본(src/warmup-answers.ts WARMUP_STUCK_CHIPS · src/warmup-zh.ts WARMUP_ZH_STUCK_CHIPS)과
     «같은 글자» 여야 «문장 예시» 와 갈라 작은 «바로 보내기» 줄로 그린다(하니스가 두 곳을 대조한다). */
  var STUCK = ['One more time, please.', "I don't know.", '再说一遍。', '我不知道。'];
  var contextKey = '', videoEpoch = 0;
  var startedAt = 0, firstReplyMs = null, historyOpen = false, lastQuestion = '';
  var scenes = [
    { id:'cooking', img:'cooking-action', ko:'요리하기', en:'Cooking', zh:'做饭', noun:'cooking', zhQ:'做饭', learn:'to cook', zhLearn:'做饭', alt:'가족이 주방에서 함께 팬케이크를 만들고 있어요.' },
    { id:'soccer', img:'soccer-motion', ko:'축구하기', en:'Soccer', zh:'足球', noun:'soccer', zhQ:'踢足球', learn:'to play soccer', zhLearn:'踢足球', alt:'아이들이 밖에서 축구를 하고 있어요.' },
    { id:'train', img:'train', ko:'여행하기', en:'Travelling', zh:'旅行', noun:'travelling', zhQ:'旅行', learn:'to plan a trip', zhLearn:'计划旅行', alt:'기차 여행 장면이에요.' },
    { id:'cycling', img:'warmup-cycling', ko:'자전거 타기', en:'Cycling', zh:'骑自行车', noun:'riding a bike', zhQ:'骑自行车', learn:'to ride a bike', zhLearn:'骑自行车', alt:'헬멧을 쓴 아이가 공원에서 자전거를 타고 있어요.' },
    { id:'pets', img:'warmup-pets', ko:'반려동물 돌보기', en:'Caring for pets', zh:'照顾宠物', noun:'caring for pets', zhQ:'照顾宠物', learn:'to care for pets', zhLearn:'照顾宠物', alt:'아이가 정원에서 강아지의 털을 부드럽게 빗어 주고 있어요.' },
    { id:'painting', img:'warmup-painting', ko:'그림 그리기', en:'Painting', zh:'画画', noun:'painting', zhQ:'画画', learn:'to paint', zhLearn:'画画', alt:'아이가 붓으로 해와 하늘을 그리고 있어요.' },
    { id:'music', img:'warmup-music', ko:'음악 연주', en:'Playing music', zh:'演奏音乐', noun:'playing music', zhQ:'演奏音乐', learn:'to play the piano', zhLearn:'弹钢琴', alt:'아이가 피아노 앞에 앉아 건반을 누르고 있어요.' },
    { id:'gardening', img:'warmup-gardening', ko:'정원 가꾸기', en:'Gardening', zh:'园艺', noun:'gardening', zhQ:'种花', learn:'to grow flowers', zhLearn:'种花', alt:'아이가 물뿌리개로 꽃에 물을 주고 있어요.' },
    { id:'shopping', img:'warmup-shopping', ko:'장보기', en:'Shopping', zh:'买东西', noun:'shopping for food', zhQ:'买水果', learn:'to shop for food', zhLearn:'买食物', alt:'부모와 아이가 시장에서 과일을 고르고 있어요.' },
    { id:'beach', img:'warmup-beach', ko:'해변 놀이', en:'Beach play', zh:'海边玩耍', noun:'playing at the beach', zhQ:'在海边玩', learn:'to build a sandcastle', zhLearn:'堆沙堡', alt:'아이들이 해변의 모래 위에서 모래성을 만들고 있어요.' }
  ];
  function zh() { return typeof isZh === 'function' && isZh(); }
  function tr(ko, en) { return typeof getLang === 'function' && getLang() === 'en' ? en : ko; }
  function label(el, ko, en) { el.setAttribute('data-ko',ko); el.setAttribute('data-en',en); el.textContent=tr(ko,en); }
  function button(ko, en, fn) {
    var b=document.createElement('button'); b.type='button'; b.className='wg-btn'; label(b,ko,en); b.onclick=fn; return b;
  }
  function pauseScene() { $('wgSceneVideo').pause(); }
  function videoButton() {
    var v=$('wgSceneVideo'), b=$('wgScenePlay');
    b.setAttribute('aria-pressed',String(!v.paused));
    label(b,v.paused?(v.ended?'영상 다시 보기':'5초 영상 보기'):'영상 멈추기',v.paused?(v.ended?'Watch again':'Watch 5-second scene'):'Pause scene');
  }
  function resetSceneMedia(s) {
    videoEpoch++;
    var v=$('wgSceneVideo');v.pause();v.removeAttribute('src');v.load();v.hidden=true;
    v.dataset.src=s?'/video/warmup-scenes/'+s.id+'.mp4':'';
    v.poster=s?'/img/write-scenes/'+s.img+'.webp':'';
    $('wgSceneImage').hidden=false;$('wgVideoNotice').textContent='';videoButton();
  }
  async function playScene() {
    if(_warmPaused || sending || _recognizing || !scene)return;
    var v=$('wgSceneVideo'), epoch=videoEpoch;
    if(!v.paused){v.pause();return;}
    _stopSpeak();v.muted=true;
    if(!v.getAttribute('src'))v.src=v.dataset.src;
    if(v.ended)v.currentTime=0;
    v.hidden=false;$('wgSceneImage').hidden=true;
    $('wgVideoNotice').textContent=tr('장면을 보고 내 생각을 말해 보세요.','Watch the scene, then share your thought.');
    try{await v.play();if(epoch===videoEpoch && (_warmPaused || _recognizing))v.pause();}
    catch(e){if(epoch===videoEpoch && e.name!=='AbortError')videoUnavailable();}
  }
  function videoUnavailable() {
    var v=$('wgSceneVideo');if(!v.getAttribute('src'))return;
    v.pause();v.hidden=true;$('wgSceneImage').hidden=false;
    $('wgVideoNotice').textContent=tr('영상을 불러오지 못했어요. 그림을 보고 이야기해요.','The video is unavailable. Talk about the picture instead.');
  }
  function resetHelp() {
    help=null; examples=[]; step=0; meaningOpen=false; helpLevel='own'; clearTimeout(nudgeTimer);
    $('wgHelpOutput').replaceChildren(); $('wgHelpActions').replaceChildren(); $('wgHelp').hidden=true;
    renderSteps();
  }
  function updateHistory() {
    var msgs=Array.from($('log').querySelectorAll('.msg'));
    var latestAI=-1;
    msgs.forEach(function(m,i){ if(m.classList.contains('ai')) latestAI=i; });
    msgs.forEach(function(m,i){m.classList.toggle('wg-past',i<latestAI);});
    $('log').classList.toggle('wg-history-open',historyOpen);
    $('wgHistory').setAttribute('aria-expanded',String(historyOpen));
    label($('wgHistory'),historyOpen?'이전 대화 접기':'이전 대화 보기',historyOpen?'Hide earlier conversation':'Earlier conversation');
  }
  function renderChoices() {
    $('wgChoices').replaceChildren();
    scenes.forEach(function(s){
      var b=document.createElement('button'); b.type='button'; b.className='wg-choice';
      b.setAttribute('aria-pressed',String(scene===s.id)); b.dataset.scene=s.id;
      var img=document.createElement('img'); img.src='/img/write-scenes/'+s.img+'.webp'; img.alt=s.alt; img.loading='lazy';
      var cap=document.createElement('span'); cap.textContent=zh()?s.zh:s.en+' · '+s.ko;
      b.append(img,cap); b.onclick=function(){selectScene(s);}; $('wgChoices').appendChild(b);
    });
  }
  async function selectScene(s) {
    if (sending || _warmPaused) return;
    if($('inp').value.trim()){ $('wgState').textContent=tr('작성 중인 답변을 먼저 보내거나 지워 주세요.','Send or clear your draft before changing the picture.');return;}
    scene=s.id; resetSceneMedia(s);renderChoices();
    $('wgSceneImage').src='/img/write-scenes/'+s.img+'.webp'; $('wgSceneImage').alt=s.alt;
    $('wgSceneCaption').textContent=zh()?s.zh:s.en+' · '+s.ko;
    $('wgScene').hidden=false; $('wgScenes').open=false;
    var goals=/goals?|dreams?|목표|꿈/i.test(LESSON_TOPIC || '');
    var q=zh()?'你喜欢'+s.zhQ+'吗？': 'Do you like '+s.noun+'?';
    if(goals && _warmLevel>=3) q=zh()?'你想学会什么？':'What would you like to learn?';
    var ok=await pickFollowup(q);
    if (_warmPaused) return;
    if(!ok){scene='';resetSceneMedia();$('wgScene').hidden=true;renderChoices();return;}
    // Authored hint matches this exact authored question; it never pretends to be an answer.
    receiveHelp(goals && _warmLevel>=3
      ? {words:zh()?['想',s.zhLearn]:['learn',s.learn],frame:zh()?'我想学____。':'I want to learn ____.',example:zh()?'我想学'+s.zhLearn+'。':'I want to learn '+s.learn+'.'}
      : {words:zh()?['喜欢','不喜欢']:['yes','no'],frame:zh()?'我____。':'Yes, I ____.',example:zh()?'我喜欢。':'Yes, I do.'},[]);
    var current=$('log').querySelector('.msg.ai:last-of-type');
    if(current)current.scrollIntoView({block:'nearest'});
  }
  function receiveHelp(h, list) {
    help=h && Array.isArray(h.words) && typeof h.frame==='string' && typeof h.example==='string' ? h : null;
    examples=Array.isArray(list)?list.filter(function(s){return typeof s==='string';}).slice(0,3):[];
  }
  /* 🪜 단계 표시 — 1 혼자 해 보기 · 2 뜻 보기 · 3 대답 예시. 지금 어디까지 왔는지만 보여 준다(버튼이 아니다). */
  function renderSteps() {
    var box=$('wgHelpSteps'); if(!box)return;
    var at=step>=3?3:(meaningOpen?2:1);
    var items=[['혼자 해 보기','Try alone'],['뜻 보기','Meaning'],['대답 예시','Answer ideas']];
    box.replaceChildren();
    items.forEach(function(it,i){
      var li=document.createElement('li'); if(i+1===at)li.className='on'; else if(i+1<at)li.className='done';
      var n=document.createElement('b'); n.textContent=String(i+1);
      var t=document.createElement('span'); label(t,it[0],it[1]);
      li.append(n,t); box.appendChild(li);
    });
  }
  function showPanel() {
    $('wgHelp').hidden=false; renderSteps();
    requestAnimationFrame(function(){$('wgHelp').scrollIntoView({block:'nearest'});});
  }
  /* 두 대답에서 «서로 다른 낱말» 하나를 찾는다 — 그 낱말만 노랗게 칠해 «바꿔 말할 자리» 를 보여 준다.
     ⛔ 바꿀 낱말 목록을 화면에 두지 않는다 — 서버(src/warmup-answers.ts SWAP_SETS)가 이미 바꿔서 보냈다. */
  function swapIndex(a, b) {
    var x=String(a).replace(/[.!?]$/,'').split(' '), y=String(b).replace(/[.!?]$/,'').split(' ');
    if(x.length!==y.length)return -1;
    var at=-1;
    for(var i=0;i<x.length;i++) if(x[i]!==y[i]){ if(at>=0)return -1; at=i; }
    return at;
  }
  function sentenceNode(txt, swapAt) {
    var frag=document.createDocumentFragment();
    var words=String(txt).split(' ');
    words.forEach(function(w,i){
      if(i)frag.appendChild(document.createTextNode(' '));
      if(i===swapAt){
        var m=document.createElement('mark'); m.className='wg-swap';
        var core=w.replace(/[.!?]$/,''); m.textContent=core; frag.appendChild(m);
        if(core!==w)frag.appendChild(document.createTextNode(w.slice(core.length)));
      } else frag.appendChild(document.createTextNode(w));
    });
    return frag;
  }
  function useSentence(txt) {
    if($('inp').value.trim()){
      label($('wgHelpNote'),'작성 중인 답변이 있어요. 예시를 보고 직접 고쳐 주세요.','Your draft is still here. Use the idea to edit it yourself.');
      return;
    }
    $('inp').value=txt; assisted=true; helpLevel='example'; $('inp').focus();
    label($('wgHelpNote'),'입력칸에 넣었어요. 노란 낱말을 내 생각으로 바꿔도 좋아요.','Added to the box. Change the yellow word to your own idea.');
  }
  /* 3단계 — 대답 예시. 문장 자체가 버튼이다(누르면 입력칸으로). «막혔을 때» 말은 작은 바로 보내기 줄. */
  function showAnswers() {
    step=3; helpLevel='example'; showPanel();
    var out=$('wgHelpOutput'), act=$('wgHelpActions'); out.replaceChildren(); act.replaceChildren();
    var sentences=examples.filter(function(t){return STUCK.indexOf(t)<0;});
    var stuck=examples.filter(function(t){return STUCK.indexOf(t)>=0;});
    if(!sentences.length && help)sentences=[help.example];
    var swapAt=sentences.length>=2?swapIndex(sentences[0],sentences[1]):-1;
    if(help && help.frame && sentences.length<2){
      var f=document.createElement('p'); f.className='wg-frame';
      var fl=document.createElement('span'); label(fl,'문장 시작: ','Starter: ');
      var ft=document.createElement('span'); ft.textContent=help.frame;
      f.append(fl,ft); out.appendChild(f);
    }
    sentences.forEach(function(txt){
      var b=document.createElement('button'); b.type='button'; b.className='wg-say';
      b.appendChild(sentenceNode(txt,swapAt));
      b.setAttribute('aria-label',tr('입력칸에 넣기: ','Put in the box: ')+txt);
      b.onclick=function(){useSentence(txt);};
      act.appendChild(b);
    });
    stuck.forEach(function(txt){
      var a=document.createElement('button'); a.type='button'; a.className='wg-stuck';
      var l=document.createElement('span'); label(l,'막혔으면 바로 보내기: ','Stuck? Send: ');
      var t=document.createElement('span'); t.textContent='“'+txt+'”';
      a.append(l,t);
      a.onclick=function(){
        if(_warmPaused || sending)return;
        $('inp').value=txt; assisted=true; helpLevel='example';
        if(typeof sendMsg==='function')sendMsg();
      };
      act.appendChild(a);
    });
    var note=$('wgHelpNote');
    if(sentences.length) label(note,'문장을 누르면 입력칸에 들어가요. 노란 낱말은 바꿔 말해도 돼요.','Tap a sentence to put it in the box. You can change the yellow word.');
    else label(note,'이 질문은 예시가 없어요. 아는 낱말 하나로 답해도 좋아요.','No example for this question. One word you know is a fine answer.');
    $('wgHelpMore').hidden=true; renderSteps();
  }
  /* 2단계 — 뜻을 연 뒤. 대답 예시는 «더 필요할 때» 한 번 더 눌러야 나온다(버튼 하나). */
  function meaningOpened() {
    clearTimeout(nudgeTimer); clearNudge();
    if(meaningOpen)return;
    meaningOpen=true; if(helpLevel==='own')helpLevel='meaning'; step=Math.max(step,2);
    if(_warmPaused || sending){renderSteps();return;}   // 듣는 중(자동 마이크)에도 패널은 띄운다 — 마이크는 건드리지 않는다
    showPanel(); $('wgHelpOutput').replaceChildren(); $('wgHelpActions').replaceChildren();
    label($('wgHelpNote'),'뜻을 알았으면 먼저 혼자 말해 보세요.','Now that you know the meaning, try answering on your own.');
    $('wgHelpMore').hidden=false;
  }
  /* «대답할 때 도움» — 뜻을 아직 안 열었으면 뜻부터(가장 가벼운 도움), 열었으면 대답 예시. */
  function offerHelp(byUser) {
    if (_warmPaused || sending || _recognizing) return;
    if(!meaningOpen){
      if(byUser!==true){ nudge(); return; }        // 혼자 멈춘 지 오래 — 열지 않고 알리기만
      if(typeof openLatestMeaning==='function' && openLatestMeaning()) return;   // → meaningOpened()
      meaningOpened();
      return;
    }
    showAnswers();
  }
  function clearNudge() {
    var v=document.querySelectorAll('#log .mean-veil.nudge');
    for(var i=0;i<v.length;i++){ v[i].classList.remove('nudge'); var l=v[i].querySelector('.mv-lbl'); if(l)label(l,'뜻을 모르겠으면 눌러요','Tap if you don’t know the meaning'); }
  }
  /* 👀 막힌 것 같으면 뜻 줄을 한 번 반짝여 알린다 — 열어 주지는 않는다(뜻은 «모를 때만»). */
  function nudge() {
    if(meaningOpen || _warmPaused || sending)return;   // 자동 마이크가 듣는 중이어도 «반짝» 은 보인다(마이크는 그대로)
    if($('inp').value.trim())return;
    var all=document.querySelectorAll('#log .msg.ai'), last=all.length?all[all.length-1]:null;
    var v=last && last.querySelector('.mean-veil'); if(!v || v.hidden)return;
    v.classList.remove('nudge'); void v.offsetWidth; v.classList.add('nudge');
    var l=v.querySelector('.mv-lbl'); if(l)label(l,'막혔나요? 눌러서 뜻 보기','Stuck? Tap to see the meaning');
  }
  function scheduleNudge() {
    clearTimeout(nudgeTimer);
    var ms=(typeof _warmLevel==='number' && _warmLevel<=2)?5000:8000;   // 1~2단계는 더 빨리
    nudgeTimer=setTimeout(nudge,ms);
  }
  function onMessage(text, who) {
    if(who==='ai' || who==='me')pauseScene();
    if(who==='ai'){lastQuestion=String(text);resetHelp();scheduleNudge();}
    if(who==='me'){
      if(firstReplyMs===null) firstReplyMs=Math.max(0,Date.now()-startedAt);
      clearTimeout(nudgeTimer); clearNudge();
      answers.push({text:String(text).slice(0,500),assisted:assisted,help:helpLevel,lang:zh()?'zh':'en'});
      if(answers.length>40) answers.shift(); assisted=false; helpLevel='own'; $('wgHelp').hidden=true;
      label($('wgProgress'), '내 답변 '+answers.length+'개 · 내 생각을 이어가요','My replies: '+answers.length+' · Keep sharing your ideas');
    }
    updateHistory();
    if(who==='ai' && answers.length)requestAnimationFrame(function(){if(!document.hidden)$('wgWorkspace').scrollTop=$('wgWorkspace').scrollHeight;});
  }
  function fix(f) { if(f && f.now){fixes.push(String(f.now).slice(0,200));if(fixes.length>3)fixes.shift();} }
  function start() {
    var key=[_warmLang,_warmLevel,_warmAge,WCTX.textbook,WCTX.lesson_no,LESSON_TOPIC].join('|');
    if(contextKey && key!==contextKey){answers=[];fixes=[];firstReplyMs=null;startedAt=0;assisted=false;label($('wgProgress'),'내 답변 0개 · 새 설정으로 시작해요','My replies: 0 · New settings');}
    contextKey=key;startedAt=startedAt||Date.now();
    $('wgScenes').open=/goals?|dreams?|목표|꿈/i.test(LESSON_TOPIC||'');
    scene='';resetSceneMedia();$('wgScene').hidden=true;resetHelp();renderChoices();
  }
  /* 🗑 «새로 시작» (2026-09-23) — 앞 대화의 답변·교정·경과시간을 버린다. 대화 자체를 지우는
     일은 warmup.html 의 newWarmupChat() 이 하고, 여기서는 이 모듈이 들고 있던 기록만 비운다. */
  function reset() {
    answers=[];fixes=[];firstReplyMs=null;startedAt=0;assisted=false;contextKey='';historyOpen=false;lastQuestion='';
    label($('wgProgress'),'약 3분 · 내 속도로 말해요','About 3 minutes · At your pace');
    updateHistory();
  }
  function summary() {
    var title=WCTX.textbook || LESSON_TOPIC || (zh()?'中文对话':'Free conversation');
    var cnt=function(k){return answers.filter(function(a){return (a.help||(a.assisted?'example':'own'))===k;}).length;};
    return ['Speaking practice summary / 말하기 연습 요약',
      'Topic: '+title+(WCTX.lesson_no?' · Lesson '+WCTX.lesson_no:''),
      'Language / Level: '+(zh()?'Chinese':'English')+' / '+_warmLevel,
      'Submitted replies / 답변: '+answers.length,
      answers.length?'On own / 혼자: '+cnt('own')+' · After meaning / 뜻 본 뒤: '+cnt('meaning')+' · With example / 예시 사용: '+cnt('example'):'',
      answers.length?'Student’s last reply: '+answers[answers.length-1].text:'No student reply yet.',
      fixes.length?'Practice expression: '+fixes[fixes.length-1]:'',
      answers.length?'Teacher: ask one follow-up about the student’s last reply.':'Teacher: help the student begin with an easy choice.',
    ].filter(Boolean).join('\n');
  }
  function finish() {
    pauseWarmup(); $('wgSummaryText').textContent=summary();
    $('wgSummaryNotice').textContent=tr('요약을 복사해 선생님께 전달할 수 있어요.','Copy this summary to share with your teacher.');
    // Reuses the already established in-class echo channel, only on an explicit finish.
    if(window.parent!==window){
      window.parent.postMessage({__mangoiWarmup:1,who:'me',text:summary().slice(0,500)},location.origin);
      $('wgSummaryNotice').textContent=tr('수업 화면으로 요약을 보냈어요. 선생님 연결 여부는 수업 화면에서 확인해 주세요.','Summary sent to the classroom. Check the classroom for teacher connectivity.');
    }
    $('wgSummary').showModal();
  }
  var guide=window.MangoWarmupGuide={start:start,onMessage:onMessage,receiveHelp:receiveHelp,offerHelp:offerHelp,meaningOpened:meaningOpened,fix:fix,finish:finish,pauseScene:pauseScene,reset:reset,
    scene:function(){return scene;}, metrics:function(){return {firstReplyMs:firstReplyMs,replies:answers.length};}};
  $('wgHistory').onclick=function(){historyOpen=!historyOpen;updateHistory();};
  $('wgHelpOpen').onclick=function(){offerHelp(true);}; $('wgHelpMore').onclick=showAnswers;
  $('wgSceneClose').onclick=function(){scene='';resetSceneMedia();$('wgScene').hidden=true;renderChoices();};
  $('wgScenePlay').onclick=playScene;
  $('wgSceneVideo').addEventListener('play',function(){if(_warmPaused || _recognizing)pauseScene();videoButton();});
  $('wgSceneVideo').addEventListener('pause',videoButton);
  $('wgSceneVideo').addEventListener('ended',videoButton);
  $('wgSceneVideo').addEventListener('error',videoUnavailable);
  $('wgFinish').onclick=finish;
  $('wgSummaryBack').onclick=function(){$('wgSummary').close();resumeWarmup();};
  $('wgSummary').addEventListener('cancel',function(){resumeWarmup();});
  $('wgSummaryNext').onclick=function(){
    if(!window.MangoFlow)return;
    // Native modal dialogs sit above the flow menu regardless of its z-index.
    $('wgSummary').close();resumeWarmup();MangoFlow.open('warmup');
  };
  $('wgSummaryCopy').onclick=async function(){
    try{await navigator.clipboard.writeText(summary());$('wgSummaryNotice').textContent=tr('요약을 복사했어요.','Summary copied.');}
    catch(e){$('wgSummaryNotice').textContent=tr('복사하지 못했어요. 위 요약을 선택해 복사해 주세요.','Select and copy the summary above.');}
  };
  $('wgState').textContent=tr('준비되면 마이크를 누르거나 글로 답해 보세요.','When ready, use the microphone or type your answer.');
})();
