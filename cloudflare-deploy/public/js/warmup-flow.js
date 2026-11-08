/* Warmup UI only: existing conversation, audio, cancellation and stateless class-ask API.
   No new conversation engine, account storage, reward, teacher media or classroom messages. */
(function(){
  'use strict';
  if(window.MangoWarmupFlow)return;
  var $=function(id){return document.getElementById(id);};
  var tr=function(ko,en){return typeof wuT==='function'?wuT(ko,en):ko;};
  var PREF_KEY='mangoi_warmup_flow_v1', prefs={}, latest='', lastFix=null, requestId=0, voiceId=0;
  var busy=false, recording=false, opening=false, snapshot=null, opener=null, returnReady=false, panelOwner=null, questionReference=null, largeReference=null;
  var bgSeq=0, bgWanted='', bgContext='', bgChoices={}, session='', conversationTopic='', situationKey='', correctionContext='';
  var backgrounds={
    plain:{ko:'단색 집중',en:'Plain focus'},
    bakery:{file:'bakery',ko:'빵집',en:'Bakery'},restaurant:{file:'restaurant',ko:'식당',en:'Restaurant'},
    shopping:{file:'warmup-shopping',ko:'시장',en:'Market'},library:{file:'library',ko:'도서관',en:'Library'},
    playground:{file:'playground',ko:'놀이터',en:'Playground'},garden:{file:'warmup-gardening',ko:'정원',en:'Garden'},
    airport:{file:'airport',ko:'공항',en:'Airport'},train:{file:'train',ko:'기차 여행',en:'Train trip'},
    runway:{file:'hf-runway',ko:'경비행기 활주로',en:'Airplane runway'},raft:{file:'hf-raft',ko:'바다 위 뗏목',en:'Ocean raft'},
    beach:{file:'beach',ko:'해변',en:'Beach'},space:{file:'space',ko:'우주',en:'Space'},
    castle:{file:'castle',ko:'성',en:'Castle'},camping:{file:'camping',ko:'캠핑',en:'Camping'},
    aquarium:{file:'aquarium',ko:'수족관',en:'Aquarium'},soccer:{file:'soccer',ko:'축구장',en:'Soccer field'}
  };
  try{var p=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');if(p && typeof p==='object' && !Array.isArray(p))prefs=p;}catch(e){}
  prefs.mode=['auto','manual','plain'].indexOf(prefs.mode)>=0?prefs.mode:'auto';
  prefs.background=Object.prototype.hasOwnProperty.call(backgrounds,prefs.background)?prefs.background:'plain';
  prefs.locked=prefs.locked===true; prefs.hints=prefs.hints==='example'?'example':'steps';
  prefs.translation=prefs.translation==='show'?'show':'manual';
  function save(){try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}catch(e){$('wfPreferenceNote').textContent=tr('이 기기에 저장하지 못했어요. 이번 화면에서는 유지돼요.','Could not save on this device. Your choices still apply on this page.');}}
  function element(tag,id,cls){var e=document.createElement(tag);if(id)e.id=id;if(cls)e.className=cls;return e;}
  function text(el,ko,en){el.dataset.ko=ko;el.dataset.en=en;el.textContent=tr(ko,en);return el;}
  function button(id,ko,en,fn){var b=element('button',id,'wf-button');b.type='button';text(b,ko,en);b.onclick=fn;return b;}
  var conversation=document.querySelector('.wg-conversation'); if(!conversation || !$('log'))return;
  var stage=element('section','wfStage','wf-stage');stage.setAttribute('aria-label',tr('현재 말하기 연습','Current speaking practice'));
  conversation.insertBefore(stage,$('log'));stage.append($('tavatar-wrap'),$('log'));
  var tools=element('div','wfTools','wf-tools');
  var askButton=button('wfAskOpen','질문하기','Ask a question',function(){openPanel('wfAsk',askButton);});
  var prefsButton=button('wfPreferencesOpen','배경 · 내 속도','Background · My pace',function(){openPanel('wfPreferences',prefsButton);});
  tools.append(askButton,prefsButton,button('wfExpandOpen','현재 문장 크게','Enlarge current sentence',function(){
    openPanel('wfLarge',$('wfExpandOpen'));
  }));conversation.insertBefore(tools,stage);
  // Keep all existing touch actions and add a direct question entry beside the main mic.
  var touchTabs=$('tbTabs');
  if(touchTabs){var touchAsk=element('button','wfAskTouch');touchAsk.type='button';
    var qi=element('span',null,'tb-i');qi.textContent='?';qi.setAttribute('aria-hidden','true');
    touchAsk.append(qi,text(element('span',null,'tb-t'),'질문','Question'));
    touchAsk.onclick=function(){openPanel('wfAsk',touchAsk);};touchTabs.insertBefore(touchAsk,$('tbType'));
  }
  function panel(id,title){
    var d=element('dialog',id,'wf-panel');d.setAttribute('aria-labelledby',id+'Title');
    var h=element('h2',id+'Title');text(h,title[0],title[1]);d.appendChild(h);
    var close=button(id+'Close','연습으로 돌아가기','Back to practice',function(){d.close();});
    d.appendChild(close);document.body.appendChild(d);d.addEventListener('close',finishPanel);return d;
  }
  var ask=panel('wfAsk',['지금 문장에 대해 질문해요','Ask about this practice']);
  var context=element('details','wfAskContext');context.appendChild(text(element('summary'),'참고하는 문장 · 교재 · 교정','Sentence · book · correction used'));
  var contextText=element('pre','wfAskContextText');context.appendChild(contextText);ask.insertBefore(context,ask.lastChild);
  var notice=text(element('p'),'연습 녹음과 음성은 잠시 멈춰요. 질문은 대화 답변·점수로 기록하지 않아요.','Practice recording and speech pause here. Questions do not count as replies or scores.');ask.insertBefore(notice,ask.lastChild);
  var form=element('form','wfAskForm');
  var label=text(element('label'),'궁금한 점 (200자 이내)','Your question (up to 200 characters)');label.htmlFor='wfAskInput';
  var input=element('textarea','wfAskInput');input.maxLength=200;input.rows=3;input.placeholder=tr('왜 이렇게 말하나요?','Why do we say it this way?');
  var row=element('div',null,'wf-row');
  var mic=button('wfAskMic','한국어 질문 마이크','Question mic (Korean)',questionMic);
  var send=button('wfAskSend','질문 보내기','Send question',sendQuestion);send.type='submit';send.onclick=null;
  var cancel=button('wfAskCancel','요청 취소','Cancel request',cancelQuestion);
  row.append(mic,send,cancel);form.append(label,input,row);form.onsubmit=function(e){e.preventDefault();sendQuestion();};ask.insertBefore(form,ask.lastChild);
  var askState=element('p','wfAskState');askState.setAttribute('role','status');ask.insertBefore(askState,ask.lastChild);
  var answer=element('div','wfAskAnswer');answer.setAttribute('aria-live','polite');ask.insertBefore(answer,ask.lastChild);
  var prefPanel=panel('wfPreferences',['내 속도로 연습해요','Practice at your pace']);
  var body=element('div',null,'wf-preferences-body');prefPanel.insertBefore(body,prefPanel.lastChild);
  body.appendChild(text(element('p'),'프리셋은 속도·자막·교정에만 적용돼요. 자동 마이크는 직접 선택할 때만 켜져요.','Presets change speed, subtitles and correction only. Auto microphone remains an explicit choice.'));
  var presetRow=element('div',null,'wf-row');
  [['support','차근차근','Step by step',2,'on','balanced'],['conversation','편하게 대화','Easy conversation',3,'on','free_talk'],['focus','듣고 정확하게','Listen and refine',3,'blur','focused']].forEach(function(p){
    presetRow.appendChild(button('wfPreset'+p[0],p[1],p[2],function(){setRate(p[3]);setSubMode(p[4],true);if(!isZh())setCorrMode(p[5]);paintPreferences();}));
  });body.appendChild(presetRow);
  function select(parent,id,ko,en,options,change){
    var l=text(element('label'),ko,en);l.htmlFor=id;var s=element('select',id);
    options.forEach(function(o){var x=text(element('option'),o[1],o[2]);x.value=o[0];s.appendChild(x);});s.onchange=function(){change(s.value);};parent.append(l,s);return s;
  }
  select(body,'wfBackgroundMode','배경 선택 방식','Background mode',[['auto','상황에 맞춰 자동','Automatic by situation'],['manual','직접 고르기','Choose a place'],['plain','단색 집중','Plain focus']],function(v){prefs.mode=v;if(v==='plain')prefs.locked=false;save();updateBackground(true);paintPreferences();});
  select(body,'wfBackground','장소','Place',Object.keys(backgrounds).map(function(k){return[k,backgrounds[k].ko,backgrounds[k].en];}),function(v){prefs.background=v;prefs.mode=v==='plain'?'plain':'manual';prefs.locked=false;save();updateBackground(true);paintPreferences();});
  var lockLabel=element('label',null,'wf-check');var lock=element('input','wfBackgroundLock');lock.type='checkbox';
  lock.onchange=function(){prefs.locked=lock.checked;if(lock.checked)prefs.background=stage.dataset.background||'plain';save();updateBackground(true);paintPreferences();};
  lockLabel.append(lock,text(element('span'),'지금 보이는 배경 유지','Keep the background currently shown'));body.appendChild(lockLabel);
  var bgStatus=element('p','wfBackgroundStatus');bgStatus.setAttribute('role','status');body.appendChild(bgStatus);
  var bgRetry=button('wfBackgroundRetry','배경 다시 불러오기','Retry background',function(){updateBackground(true);});bgRetry.hidden=true;body.appendChild(bgRetry);
  var detail=element('details','wfSettingsDetail');detail.appendChild(text(element('summary'),'세부 설정 (개별 선택 유지)','Detailed settings (your individual choices)'));body.appendChild(detail);
  select(detail,'wfRate','듣기 속도','Listening speed',[1,2,3,4,5].map(function(n){return[String(n),RATE_NAMES[n],RATE_NAMES_EN[n]];}),function(v){setRate(v);});
  select(detail,'wfSubtitles','자막','Subtitles',[['on','보이기','Show'],['blur','가리기','Blur'],['off','끄기 (탭해서 확인)','Hide (tap to reveal)']],function(v){setSubMode(v,true);});
  select(detail,'wfCorrection','교정 방식','Correction style',CMODE_CATALOG.map(function(m){return[m.id,m.ko,m.en];}),function(v){setCorrMode(v);});
  select(detail,'wfCorrectionTiming','피드백 타이밍','Feedback timing',[['','기존 정책 유지','Keep existing policy'],['immediate','바로 교정','Correct immediately'],['key-mistakes','주요 실수 최대 3회','Up to 3 key corrections'],['after-lesson','연습 후 모아서 보기','Review after practice']],function(v){try{AiSpeakSettings.chooseTiming(localStorage,v);}catch(e){};});
  detail.appendChild(text(element('p','wfCorrectionNote'),'중국어 교정은 기존 수업 정책을 따릅니다. 이 영어 교정 선택은 바꾸지 않아요.','Chinese correction follows the existing lesson policy. This English correction choice stays unchanged.'));
  select(detail,'wfHints','도움 방식','Hint style',[['steps','뜻을 본 뒤 예시','Meaning, then examples'],['example','대답 예시 먼저','Answer ideas first']],function(v){prefs.hints=v;save();});
  select(detail,'wfTranslation','번역','Translation',[['manual','모를 때 눌러 보기','Tap when needed'],['show','새 문장의 뜻 펼치기','Expand new sentence meaning']],function(v){prefs.translation=v;save();});
  detail.appendChild(button('wfAllSettings','기존 전체 설정 열기','Open all existing settings',function(){prefPanel.close();openMenu();}));
  body.appendChild(element('p','wfPreferenceNote'));
  var large=panel('wfLarge',['현재 문장 크게 보기','Read the current sentence']);var largeText=element('p','wfLargeText');large.insertBefore(largeText,large.lastChild);
  [prefPanel,large].forEach(function(d){var note=element('p',d.id+'RecordingNote');note.setAttribute('role','status');d.insertBefore(note,d.lastChild);});
  function dialogs(){return[ask,prefPanel,large];}
  function active(){return dialogs().some(function(d){return d.open;});}
  function practiceKey(){return[SESSION_ID,_warmLang,_warmLevel,_warmAge,WCTX.textbook,WCTX.lesson_no,LESSON_TOPIC,_wuCorrMode,_voiceMode].join('|');}
  function contextKey(){return practiceKey()+'|'+_warmEpoch+'|'+latest+'|'+(lastFix?JSON.stringify(lastFix):'');}
  function capture(){
    var lines=questionReference&&!questionReference.pending?[questionReference.text]:[];if(questionReference&&questionReference.preview)lines.push('Displayed stream preview only: incomplete, not a final reply or confirmed correction.');if(lastFix){lines.push('Previous correction: '+lastFix.was+' → '+lastFix.now);if(lastFix.why_ko)lines.push('Reason: '+lastFix.why_ko);}
    (Array.isArray(WCTX.sentences)?WCTX.sentences:[]).slice(0,8).forEach(function(s){if(typeof s==='string')lines.push(s);});
    snapshot={practice:practiceKey(),pending:!!(questionReference&&questionReference.pending),preview:!!(questionReference&&questionReference.preview),key:contextKey(),lang:_warmLang,title:WCTX.textbook||LESSON_TOPIC||tr('자유 대화','Free conversation'),lines:lines.filter(Boolean).map(function(s){return s.slice(0,160);})};
    contextText.textContent=(snapshot.pending?tr('새 문장을 아직 받지 못했어요. 연습으로 돌아가 답변을 받은 뒤 질문해 주세요.','No new sentence has arrived. Return to practice and ask after a reply arrives.')+'\n':snapshot.preview?tr('받는 중 화면에 표시된 문장만 참고해요. 완성 답변이나 확정 교정이 아니에요.','Using only the streamed text visible when opened, not a final reply or confirmed correction.')+'\n':'')+snapshot.title+(WCTX.lesson_no?' · '+WCTX.lesson_no:'')+'\n'+snapshot.lines.join('\n');
  }
  function openPanel(id,source){
    if(panelOwner&&!panelOwner.open)finishPanel({target:panelOwner});
    if(active() || !document.getElementById('wuSetup').hidden)return;
    var interrupts=id==='wfAsk';
    if(interrupts && window.WarmupFaceTalk && WarmupFaceTalk.isActive())WarmupFaceTalk.exit();
    returnReady=interrupts&&!_warmPaused;opener=source;
    if(interrupts){questionReference=displayedSentence();opening=true;pauseWarmup();opening=false;}
    else {
      var listening=_recognizing||_whisperOn,repeat=!!document.querySelector('[data-warm-repeat]');
      _autoHook('panelOpen');
      _warmVoiceEpoch++;
      if(_warmMicCancel){_warmMicCancel();_warmMicCancel=null;}
      if(_recog){_recog.onstart=null;_recog.onresult=null;_recog.onend=null;_recog.onerror=null;}
      if(listening){_micAbortQuiet();if(_recognizing)setMicState(false);}
      if(_recog){try{_recog.abort();}catch(e){}}
      _fixRepeatTimers.splice(0).forEach(clearInterval);
      document.querySelectorAll('[data-warm-repeat]').forEach(function(b){b.disabled=false;delete b.dataset.warmRepeat;});
      if(listening||repeat)_repeatTarget=null;
      $(id+'RecordingNote').textContent=(listening?tr('진행 중이던 연습 녹음을 취소했어요. 대화 답변은 보내지 않아요. ','The practice recording was cancelled. No conversation reply is submitted. '):repeat?tr('뒤이을 따라 말하기 녹음을 취소했어요. 닫은 뒤 다시 선택할 수 있어요. ','The follow-up repeat recording was cancelled. You can choose it again after closing. '):'')+tr('이 창에서는 새 자동 녹음을 시작하지 않아요. 음성 재생은 계속돼요.','No new automatic recording starts in this panel. Speech playback continues.')+(window.WarmupAutoTalk&&WarmupAutoTalk.isOn()?tr(' 창을 닫으면 선택한 자동 말하기를 이어갈 수 있어요.',' Your selected automatic turn-taking can continue after closing.'):'');
    }
    if(id==='wfLarge'){largeReference=null;refreshLarge();}
    if(id==='wfAsk'){capture();answer.replaceChildren();askState.textContent=snapshot.pending?tr('새 문장을 아직 받지 못했어요. 돌아가 답변을 받은 뒤 질문해 주세요.','No new sentence has arrived. Return and ask after a reply arrives.'):tr('한국어·영어·중국어로 물어볼 수 있어요. 마이크는 한국어 질문을 받아 적어요.','Type in Korean, English or Chinese. The question mic transcribes Korean.');}
    paintPreferences();paintBusy();panelOwner=$(id);$(id).showModal();if(id==='wfAsk')input.focus();
  }
  function finishPanel(event){
    if(event && panelOwner!==event.target)return;var interrupted=panelOwner===ask;panelOwner=null;
    if(interrupted){pauseWarmup();snapshot=null;questionReference=null;requestId++;voiceId++;busy=false;recording=false;paintBusy();
      if(returnReady && !document.hidden)resumeWarmup();}
    else _autoHook('panelClose');
    returnReady=false;
    if(opener && opener.isConnected)opener.focus();
  }
  function paintBusy(){send.disabled=busy||recording||!!(snapshot&&snapshot.pending);mic.disabled=busy;cancel.disabled=!busy&&!recording;mic.textContent=recording?tr('녹음 마치기','Finish recording'):tr('한국어 질문 마이크','Question mic (Korean)');}
  function cancelVoice(){voiceId++;if(recording){try{window.MangoiVoice&&MangoiVoice.cancel();}catch(e){}}recording=false;}
  function cancelQuestion(){pauseWarmup();capture();askState.textContent=tr('취소했어요. 질문을 고쳐 다시 보낼 수 있어요.','Cancelled. Edit your question and try again.');}
  function onPause(){requestId++;busy=false;cancelVoice();paintBusy();if(ask.open && !opening)askState.textContent=tr('요청이 중단됐어요. 다시 보낼 수 있어요.','Request stopped. You can send it again.');}
  async function questionMic(){
    if(!ask.open||busy)return;
    if(recording){try{MangoiVoice.stop();}catch(e){}return;}
    if(!window.MangoiVoice || !MangoiVoice.supported()){askState.textContent=tr('질문 마이크를 쓸 수 없어요. 글로 입력해 주세요.','Question microphone unavailable. Please type.');return;}
    cancelVoice();var seq=++voiceId,epoch=_warmEpoch,heard=false;recording=true;paintBusy();
    try{
      var said=await MangoiVoice.record({lang:'ko',silenceMs:1000,maxMs:20000,onState:function(s){
        if(seq!==voiceId || !ask.open)return;
        if(s==='speaking')heard=true;
        askState.textContent=s==='thinking'?tr('말한 질문을 받아 적는 중…','Transcribing your question…'):s==='error'?tr('음성 입력에 실패했어요. 글로 입력해 주세요.','Voice input failed. Please type.'):tr('질문을 듣는 중… 녹음 마치기를 눌러 끝내세요.','Listening to your question… tap Finish recording when done.');
      }});
      if(seq!==voiceId || epoch!==_warmEpoch || !ask.open)return;
      if(heard&&said){input.value=String(said).slice(0,200);askState.textContent=tr('받아 적었어요. 확인한 뒤 질문 보내기를 눌러 주세요.','Transcribed. Review it, then tap Send question.');}
      else askState.textContent=tr('말소리를 확인하지 못했어요. 다시 말하거나 글로 입력해 주세요.','No speech confirmed. Try again or type.');
    }catch(e){if(seq===voiceId)askState.textContent=tr('질문 녹음에 실패했어요. 글로 입력해 주세요.','Question recording failed. Please type.');}
    finally{if(seq===voiceId){recording=false;paintBusy();}}
  }
  /* 📡 class-ask 스트림 읽기 — {partial,en} 은 onPartial 로, {done,…} 은 마지막 값으로 돌려줍니다.
     ⚠️ 끝까지 done 이 없으면 null 을 돌려주고, 호출하는 쪽이 실패로 봅니다(거짓 성공 금지). */
  async function readClassAskStream(resp, onPartial){
    var rd=resp.body.getReader(), dec=new TextDecoder(), buf='', fin=null;
    for(;;){
      var c=await rd.read(); if(c.done) break;
      buf+=dec.decode(c.value,{stream:true});
      var k; while((k=buf.indexOf('\n\n'))>=0){
        var ev=buf.slice(0,k); buf=buf.slice(k+2);
        var line=ev.split('\n').find(function(x){return x.indexOf('data:')===0;});
        if(!line) continue;
        var o; try{ o=JSON.parse(line.slice(5)); }catch(e){ continue; }
        if(o.done) fin=o; else if(o.partial && typeof o.en==='string' && onPartial) onPartial(o.en);
      }
    }
    return fin;
  }
  async function sendQuestion(){
    if(!ask.open || busy || recording || (snapshot&&snapshot.pending))return;var q=input.value.trim();if(!q){input.focus();return;}
    if(!snapshot || snapshot.key!==contextKey()){if(!questionReference)questionReference=displayedSentence();capture();answer.replaceChildren();}
    var ctx=snapshot,seq=++requestId;busy=true;paintBusy();answer.replaceChildren();askState.textContent=tr('질문을 보내고 설명을 만드는 중…','Sending your question and preparing an explanation…');
    try{
      /* 📡 영어 연습은 영어 답을 생성되는 즉시 보여 줍니다(stream:1). 중국어는 예전 JSON 응답 그대로. */
      var streamOn=ctx.lang!=='zh';
      var r=await warmupFetch('/api/ai/class-ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:q,title:ctx.title,lines:ctx.lines,lang:ctx.lang,audience:_warmAge,stream:streamOn?1:0})});
      var a=element('p'),ko=element('p');
      var isSse=/text\/event-stream/.test(r.headers.get('content-type')||'');
      var d;
      if(isSse){
        answer.replaceChildren(a,ko);
        d=await readClassAskStream(r,function(en){ if(seq===requestId && ask.open) a.textContent=en; });
      }else d=await r.json();
      if(seq!==requestId || !ask.open || ctx.key!==contextKey() || document.hidden)return;
      if(!r.ok || !d || !d.ok){ answer.replaceChildren(); throw new Error(d&&d.error==='daily_cap'?'daily_cap':'failed'); }
      var primary=ctx.lang==='zh'?d.zh:d.en;if(typeof primary!=='string' || !primary.trim()){ answer.replaceChildren(); throw new Error('failed'); }
      a.textContent=primary;ko.textContent=String(d.ko||'');answer.replaceChildren(a,ko);
      askState.textContent=tr('설명이 도착했어요. 돌아가면 같은 연습을 이어갈 수 있어요.','Explanation ready. Return to continue the same practice.');
    }catch(e){if(seq===requestId && ask.open)askState.textContent=e.message==='daily_cap'?tr('오늘 질문 한도에 도달했어요. 본 말하기 연습은 계속할 수 있어요.','Today’s question limit was reached. Speaking practice is still available.'):tr('설명을 받지 못했어요. 질문은 그대로예요. 다시 보내거나 취소해 주세요.','Could not get an explanation. Your question is still here. Retry or cancel.');}
    finally{if(seq===requestId){busy=false;paintBusy();if(ctx.key!==contextKey())askState.textContent=tr('연습 문맥이 바뀌었어요. 새 문맥으로 다시 보내 주세요.','Practice context changed. Send again with the new context.');}}
  }
  function candidates(){
    var scene=window.MangoWarmupGuide?MangoWarmupGuide.scene():'';
    var topic=(conversationTopic||scene||LESSON_TOPIC||WCTX.textbook||'').toLowerCase(),young=_warmAge==='kid'||_warmAge==='child';
    if(/space|planet|rocket|우주|행성|太空|星球/.test(topic))return['space'];
    if(/castle|fantasy|princess|성곽|공주|城堡/.test(topic))return['castle'];
    if(/food|cook|bread|bakery|cafe|café|restaurant|order|음식|요리|주문|빵|咖啡|餐|做饭/.test(topic))return['bakery','restaurant'];
    if(/shop|market|buy|쇼핑|장보|买|商店/.test(topic))return['shopping'];
    if(/\brunway\b|\bairstrip\b|활주로|跑道/.test(topic))return['runway'];
    if(/\braft\b|뗏목|木筏/.test(topic))return['raft'];
    if(/travel|trip|holiday|train|airport|flight|여행|휴가|기차|비행|旅行|机场|飞机/.test(topic))return['airport','train','beach'];
    if(/school|study|book|read|학교|공부|독서|学校|图书/.test(topic))return young?['library','playground']:['library'];
    if(/soccer|football|축구|足球/.test(topic))return['soccer'];
    if(/adventure|camp|모험|캠핑|冒险/.test(topic))return young?['camping','castle']:['camping'];
    if(/beach|ocean|sea|바다|해변|海/.test(topic))return['beach','aquarium'];
    if(/garden|park|cycling|pets|정원|공원|公园|花园/.test(topic))return young?['garden','playground']:['garden','camping'];
    // Existing picture prompts still show their art/music image; avoid an unrelated place behind the avatar.
    if(/\b(?:painting|music|art)\b|그림|음악|画画|音乐/.test(topic))return['plain'];
    return young?['playground','aquarium','garden']:['restaurant','library','garden'];
  }
  function autoBackground(){
    var list=candidates(),group=list.join(','),key=[SESSION_ID,_warmAge,group].join('|');
    if(bgChoices[key])return bgChoices[key];
    var recent={};try{recent=JSON.parse(sessionStorage.getItem('mangoi_warmup_bg_recent')||'{}')||{};}catch(e){}
    if(!recent || typeof recent!=='object' || Array.isArray(recent))recent={};
    var n=0;for(var i=0;i<SESSION_ID.length;i++)n=(n*31+SESSION_ID.charCodeAt(i))>>>0;
    var chosen=list[n%list.length];if(list.length>1 && chosen===recent[group])chosen=list[(list.indexOf(chosen)+1)%list.length];
    bgChoices[key]=chosen;recent[group]=chosen;try{sessionStorage.setItem('mangoi_warmup_bg_recent',JSON.stringify(recent));}catch(e){}return chosen;
  }
  function updateBackground(force){
    var key=prefs.mode==='plain'?'plain':prefs.locked||prefs.mode==='manual'?prefs.background:autoBackground();
    if(!force && bgWanted===key)return;bgWanted=key;var seq=++bgSeq,bg=backgrounds[key]||backgrounds.plain;
    bgRetry.hidden=true;
    if(!bg.file){stage.style.backgroundImage='none';stage.dataset.background='plain';bgStatus.textContent=tr('단색 배경이에요.','Plain background.');return;}
    bgStatus.textContent=tr('배경을 불러오는 중…','Loading background…');
    var image=new Image(),url='/img/write-scenes/'+bg.file+'.webp';
    image.onload=function(){if(seq!==bgSeq)return;stage.style.backgroundImage='linear-gradient(rgba(7,20,36,.58),rgba(7,20,36,.82)),url("'+url+'")';stage.dataset.background=key;bgStatus.textContent=tr(bg.ko,bg.en);if(prefs.mode==='auto'&&!prefs.locked)$('wfBackground').value=key;};
    image.onerror=function(){if(seq!==bgSeq)return;stage.style.backgroundImage='none';stage.dataset.background='plain';bgRetry.hidden=false;bgStatus.textContent=tr('배경을 가져오지 못해 단색으로 보여요. 다시 불러오거나 다른 장소를 골라 주세요.','Background unavailable. Plain mode is shown. Retry or choose another place.');};image.src=url;
  }
  function paintPreferences(){
    $('wfBackgroundMode').value=prefs.mode;$('wfBackground').value=prefs.mode==='auto'&&!prefs.locked?(stage.dataset.background||'plain'):prefs.background;lock.checked=prefs.locked;
    $('wfRate').value=String(_rateLevel);$('wfSubtitles').value=_subMode;
    $('wfCorrection').value=_wuCorrMode||''; // Do not turn the institution default into a personal selection.
    if(!_wuCorrMode && !$('wfCorrection').querySelector('option[value=""]')){var o=text(element('option'),'기존 학원 기본값','Existing institution default');o.value='';o.disabled=true;$('wfCorrection').prepend(o);$('wfCorrection').value='';}
    $('wfCorrection').disabled=isZh();
    $('wfCorrectionTiming').disabled=isZh();
    try{$('wfCorrectionTiming').value=AiSpeakSettings.read(localStorage).timing;}catch(e){}
    $('wfCorrectionNote').hidden=!isZh();
    $('wfHints').value=prefs.hints;$('wfTranslation').value=prefs.translation;
  }
  function contextChanged(interrupt){
    var currentSituation=[WCTX.textbook,WCTX.lesson_no,LESSON_TOPIC,window.MangoWarmupGuide?MangoWarmupGuide.scene():''].join('|');
    if(situationKey && currentSituation!==situationKey)conversationTopic='';situationKey=currentSituation;
    var correctionKey=[_warmLang,WCTX.textbook,WCTX.lesson_no].join('|');
    if(correctionContext&&correctionKey!==correctionContext)lastFix=null;correctionContext=correctionKey;
    var k=practiceKey();if(bgContext!==k){
      if(interrupt===true && bgContext && _warmStarted){var again=!_warmPaused;pauseWarmup();if(again)resumeWarmup();}
      if(session!==SESSION_ID){questionReference=null;latest='';lastFix=null;conversationTopic='';bgChoices={};session=SESSION_ID;}
      if(questionReference&&snapshot&&snapshot.practice!==k)questionReference=null;
      bgContext=k;
    }
    updateBackground(false);
  }
  function displayedSentence(){
    if($('log').querySelector('.typing'))return{text:'',pending:true,preview:false};
    var nodes=$('log').querySelectorAll('.msg.ai'),node=nodes[nodes.length-1];
    if(node&&node.classList.contains('stm-preview'))return{text:node.querySelector('.wu-text')?.textContent||'',preview:true,pending:false};
    return{text:currentSentence(),preview:false,pending:false};
  }
  function refreshLarge(){
    var r=displayedSentence(),completed=$('log').querySelectorAll('.msg.ai:not(.stm-preview)'),n=completed[completed.length-1];
    if(largeReference&&largeReference.pending&&!r.pending&&!r.preview&&n===largeReference.priorNode){largeText.textContent=tr('새 문장을 받기 전에 중단됐어요.','Interrupted before the new sentence arrived.');largeText.dataset.preview='interrupted';return;}
    if(largeReference&&largeReference.preview&&!r.pending&&!r.preview&&n===largeReference.priorNode){largeText.textContent=tr('중단되기 전 표시된 문장: ','Text displayed before interruption: ')+largeReference.text;largeText.dataset.preview='interrupted';return;}
    largeReference={text:r.text,preview:r.preview,pending:r.pending,priorNode:n};
    largeText.textContent=r.pending?tr('새 문장을 받는 중이에요…','Waiting for the new sentence…'):r.preview?tr('받는 중: ','Receiving: ')+r.text:r.text;largeText.dataset.preview=String(!!r.preview);
  }
  new MutationObserver(function(){if(large.open)refreshLarge();}).observe($('log'),{childList:true,subtree:true,characterData:true});
  function currentSentence(){var msgs=$('log').querySelectorAll('.msg.ai');return msgs.length?msgs[msgs.length-1]._warmText||msgs[msgs.length-1].querySelector('.wu-text')?.textContent||'':'';}
  var flow=window.MangoWarmupFlow={
    blocksPractice:function(){return ask.open;},blocksRecording:active,helpActive:function(){return ask.open;},hintStyle:function(){return prefs.hints;},
    /* ✋ 얼굴 화면(js/warmup-facetalk.js)에서도 같은 «질문하기» 창을 연다 — 여는 길은 openPanel 하나(얼굴 화면 끄기·연습 멈추기 포함). 열렸으면 true */
    openAsk:function(src){openPanel('wfAsk',src||askButton);return !!ask.open;},
    onPause:onPause,contextChanged:contextChanged,
    onMessage:function(t,who){contextChanged();
      // Only explicit topic-change requests are signals; ordinary replies and AI wording never rotate scenes.
      if(who==='me' && /let(?:['’]s| us)\s+(?:talk|practice).*?(?:about|at|in)|이제.{0,30}(?:이야기|연습)|聊聊|换个话题|现在.*聊/i.test(String(t))){conversationTopic=String(t).slice(0,200);updateBackground(false);}
      if(who==='ai'){
      latest=String(t);$('wfLargeText').textContent=latest;
      if(prefs.translation==='show')queueMicrotask(function(){if(!_warmPaused && latest===String(t))openLatestMeaning();});
    }},
    onFix:function(f){if(f&&f.was&&f.now)lastFix={was:String(f.was),now:String(f.now),why_ko:String(f.why_ko||'')};},
    backgroundCatalog:function(){return Object.keys(backgrounds);}
  };
  latest=currentSentence();contextChanged();latest=currentSentence();
  var fixes=$('log').querySelectorAll('.fix-card');if(fixes.length){var fc=fixes[fixes.length-1];lastFix={was:fc.querySelector('.fix-was')?.textContent||'',now:fc.querySelector('.fix-now')?.textContent||''};}
  paintPreferences();paintBusy();
  function relabel(){paintPreferences();paintBusy();input.placeholder=tr('왜 이렇게 말하나요?','Why do we say it this way?');}
  addEventListener('mangoi:lang-changed',relabel);
  // Track only viewport geometry; never touch media tracks or reset conversation state.
  var resizePending=false;
  function fitViewport(){if(resizePending)return;resizePending=true;requestAnimationFrame(function(){resizePending=false;var v=window.visualViewport,z=parseFloat(getComputedStyle(document.body).zoom)||1,head=document.querySelector('.top'),top=v?(v.offsetTop||0):0,height=v?v.height:innerHeight;document.documentElement.style.setProperty('--wf-viewport-height',(height/z)+'px');document.documentElement.style.setProperty('--wf-viewport-top',(top/z)+'px');document.documentElement.style.setProperty('--wf-keyboard-bottom',(Math.max(0,innerHeight-top-height)/z)+'px');if(head)document.documentElement.style.setProperty('--wf-header-height',(head.getBoundingClientRect().height/z)+'px');});}
  if(window.ResizeObserver){var header=document.querySelector('.top');if(header)new ResizeObserver(fitViewport).observe(header);}
  addEventListener('resize',fitViewport);if(window.visualViewport)visualViewport.addEventListener('resize',fitViewport);fitViewport();
})();
