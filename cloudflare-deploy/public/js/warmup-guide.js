/* Focused warmup. No model calls, recording, persistence or classroom connection of its own. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var help = null, examples = [], step = 0, scene = '', answers = [], fixes = [], assisted = false;
  var contextKey = '', videoEpoch = 0;
  var startedAt = 0, firstReplyMs = null, historyOpen = false, lastQuestion = '';
  var scenes = [
    { id:'cooking', img:'cooking-action', ko:'요리하기', en:'Cooking', zh:'做饭', noun:'cooking', zhQ:'做饭', alt:'가족이 주방에서 함께 팬케이크를 만들고 있어요.' },
    { id:'soccer', img:'soccer-motion', ko:'축구하기', en:'Soccer', zh:'足球', noun:'soccer', zhQ:'足球', alt:'아이들이 밖에서 축구를 하고 있어요.' },
    { id:'train', img:'train', ko:'여행하기', en:'Travelling', zh:'旅行', noun:'travelling', zhQ:'旅行', alt:'기차 여행 장면이에요.' }
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
    help=null; examples=[]; step=0;
    $('wgHelpOutput').textContent=''; $('wgHelpActions').replaceChildren(); $('wgHelp').hidden=true;
    label($('wgHelpNext'),'단어 힌트','Word hint'); $('wgHelpNext').disabled=false;
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
      ? {words:zh()?['想','学习']:['learn',s.noun],frame:zh()?'我想学____。':'I want to learn ____.',example:zh()?'我想学做饭。':'I want to learn something new.'}
      : {words:zh()?['喜欢','不喜欢']:['yes','no'],frame:zh()?'我____。':'Yes, I ____.',example:zh()?'我喜欢。':'Yes, I do.'},[]);
    var current=$('log').querySelector('.msg.ai:last-of-type');
    if(current)current.scrollIntoView({block:'nearest'});
  }
  function receiveHelp(h, list) {
    help=h && Array.isArray(h.words) && typeof h.frame==='string' && typeof h.example==='string' ? h : null;
    examples=Array.isArray(list)?list.filter(function(s){return typeof s==='string';}).slice(0,3):[];
  }
  function offerHelp() {
    if (_warmPaused || sending || _recognizing) return;
    $('wgHelp').hidden=false;
    requestAnimationFrame(function(){$('wgHelp').scrollIntoView({block:'nearest'});});
    if(!step) $('wgHelpOutput').textContent=tr('천천히 생각해도 괜찮아요. 단어나 짧은 대답부터 시작해요.','Take your time. Start with a word or a short answer.');
  }
  function nextHelp() {
    offerHelp(); if (_warmPaused || sending || _recognizing) return;
    step=Math.min(step+1,3); $('wgHelpActions').replaceChildren();
    var out=$('wgHelpOutput');
    if(step===1){
      out.textContent=help?help.words.join(' · '):tr('질문에서 아는 단어를 찾아보세요. 필요하면 질문의 ‘뜻’을 눌러 보세요.','Look for a word you know. You can check the question’s meaning.');
      label($('wgHelpNext'),'문장 시작 도움','Sentence starter');
    } else if(step===2){
      out.textContent=help?help.frame:tr('생각나는 단어 하나로 답해도 괜찮아요. 예시가 있으면 다음 단계에서 볼 수 있어요.','One word is a good start. Check the next step for an available example.');
      label($('wgHelpNext'),'예시 보기','Show example');
    } else {
      var list=help?[help.example]:examples;
      out.textContent=list.length?tr('예시예요. 내 생각에 맞게 바꾸어 말해 보세요.','These are examples. Change one to match your own idea.'):tr('이 질문의 예시는 아직 없어요. ‘뜻’을 확인하거나 다른 질문을 골라도 괜찮아요.','No example is available for this question. Check its meaning or choose another question.');
      list.forEach(function(txt){
        var line=document.createElement('p'); line.textContent=txt; out.appendChild(line);
        $('wgHelpActions').appendChild(button('입력칸에 넣고 고치기','Edit this example',function(){
          if($('inp').value.trim()) { out.textContent=tr('작성 중인 답변이 있어요. 예시를 참고해 직접 고쳐 주세요.','Your draft is still here. Use the example to edit it yourself.'); return; }
          $('inp').value=txt; assisted=true; $('inp').focus();
        }));
      });
      $('wgHelpNext').disabled=true;
    }
  }
  function onMessage(text, who) {
    if(who==='ai' || who==='me')pauseScene();
    if(who==='ai'){lastQuestion=String(text);resetHelp();}
    if(who==='me'){
      if(firstReplyMs===null) firstReplyMs=Math.max(0,Date.now()-startedAt);
      answers.push({text:String(text).slice(0,500),assisted:assisted,lang:zh()?'zh':'en'});
      if(answers.length>40) answers.shift(); assisted=false; $('wgHelp').hidden=true;
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
  function summary() {
    var title=WCTX.textbook || LESSON_TOPIC || (zh()?'中文对话':'Free conversation');
    var own=answers.filter(function(a){return !a.assisted;}).length;
    return ['Warmup summary / 웜업 요약',
      'Topic: '+title+(WCTX.lesson_no?' · Lesson '+WCTX.lesson_no:''),
      'Language / Level: '+(zh()?'Chinese':'English')+' / '+_warmLevel,
      'Submitted replies: '+answers.length+' (example-assisted: '+(answers.length-own)+')',
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
  var guide=window.MangoWarmupGuide={start:start,onMessage:onMessage,receiveHelp:receiveHelp,offerHelp:offerHelp,fix:fix,finish:finish,pauseScene:pauseScene,
    scene:function(){return scene;}, metrics:function(){return {firstReplyMs:firstReplyMs,replies:answers.length};}};
  $('wgHistory').onclick=function(){historyOpen=!historyOpen;updateHistory();};
  $('wgHelpOpen').onclick=offerHelp; $('wgHelpNext').onclick=nextHelp;
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
