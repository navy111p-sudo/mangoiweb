(function(){
  'use strict';
  var D=window.MangoiSceneQuest,$=function(id){return document.getElementById(id);};
  var ui='ko';try{ui=localStorage.getItem('mangoi_lang')==='en'?'en':'ko';}catch(_){}
  var rounds=[],index=0,score=0,combo=0,maxCombo=0,history=[],mistakes=[],active=false,passed=false,skipped=false,assisted=false,hints=0,attempts=0,remaining=45,paused=false,reviewing=false,muted=true,audio=null,mediaEpoch=0,reported=false;
  var lastTick=performance.now(),style='practice';
  function tr(ko,en){return ui==='en'?en:ko;}
  function text(id,value){$(id).textContent=value;}
  function label(id,ko,en){var el=$(id);el.setAttribute('data-ko',ko);el.setAttribute('data-en',en);el.textContent=tr(ko,en);}
  function language(){document.documentElement.lang=ui;document.querySelectorAll('[data-ko]').forEach(function(el){el.innerHTML=el.getAttribute('data-'+ui);});text('ui-lang',ui==='ko'?'EN':'한국어');if(active)renderText();}
  function feedback(msg,kind){text('feedback',msg);$('feedback').className='feedback '+(kind||'');}
  function current(){return rounds[index];}
  function model(){return current().scene.answers[current().level][0];}
  function stopMedia(){mediaEpoch++;$('video').pause();if(window.speechSynthesis)window.speechSynthesis.cancel();if(audio&&audio.state==='running')audio.suspend().catch(function(){});}
  function tone(success){if(muted)return;try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return;audio=audio||new A();audio.resume().catch(function(){});[0,1,2].forEach(function(i){var o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.08;o.frequency.value=(success?523:220)*[1,1.25,1.5][i];g.gain.setValueAtTime(.035,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.19);});}catch(_){} }
  function start(list){stopMedia();rounds=list;index=score=combo=maxCombo=0;history=[];mistakes=[];reported=false;active=true;paused=false;style=$('style').value;$('intro').hidden=true;$('result').hidden=true;$('play').hidden=false;$('paused').hidden=true;loadRound();}
  function renderText(){
    var r=current();text('round-label',reviewing?tr('복습 탐험','REVIEW ADVENTURE'):r.boss?tr('마지막 보물문 · 한 단계 도전','FINAL GATE · LEVEL UP'):'SCENE '+(index+1)+' / '+rounds.length);
    text('scene-title',r.scene[ui]);text('level-tag',['WORD · 단어','PHRASE · 구문','SENTENCE · 문장'][r.level]);
    text('question',r.level===0?tr('무엇이 보이나요?','What can you see?'):r.level===1?tr('어떤 행동을 하나요?','What action can you see?'):tr('장면을 한 문장으로 써 보세요.','Describe the action in a sentence.'));
    text('clue',r.level===0?tr('찾을 단서: ','Look for: ')+r.scene[ui==='ko'?'clueKo':'clueEn']:tr('동영상을 보고 중심 인물의 행동을 써 보세요.','Watch the clip and describe the main action.'));
    $('answer').placeholder=r.level===0?tr('단어를 써 보세요…','Type a word…'):r.level===1?tr('행동을 짧은 구문으로…','Type an action phrase…'):tr('누가 무엇을 하고 있나요?','Who is doing what?');
    text('media-tag',tr('실사 스타일 · 6초 영상','PHOTOREAL · 6-SECOND CLIP'));
    text('gate-title',r.boss?tr('마지막 도전! 배운 장면을 더 길게 써 봐요.','Final challenge! Say more about a familiar scene.'):tr('보물문 열쇠 ','Treasure keys ')+Math.min(index,4)+' / 4');
    text('gate-copy',tr('힌트를 써도 끝까지 갈 수 있어요. 연속 정답은 보너스!','Hints help you finish. Consecutive answers earn a bonus!'));
    if(passed){text('gate-title',model());text('gate-copy',skipped?tr('이번엔 넘어갔어요. 마지막 복습에서 다시 연습해요.','Skipped this time. You will practise it in the review.'):tr('정답을 듣거나 다음 장면으로 이동하세요.','Listen to the answer or continue to the next scene.'));}
    text('next',index===rounds.length-1?tr('보물 상자 열기 →','Open the treasure →'):tr('다음 장면 →','Next scene →'));
  }
  function loadRound(){
    stopMedia();passed=assisted=skipped=false;hints=attempts=0;remaining=45;lastTick=performance.now();
    var r=current(),v=$('video');v.hidden=true;v.removeAttribute('src');v.load();v.poster=r.scene.poster;
    $('poster').hidden=false;$('poster').src=r.scene.poster;$('poster').alt=r.scene.en+' — '+r.scene.clueEn;
    $('answer').value='';$('answer').disabled=false;$('submit').disabled=false;$('hint').disabled=false;$('reveal').disabled=false;$('next').hidden=true;$('listen').hidden=true;$('skip').hidden=false;$('skip').disabled=false;$('hint-box').hidden=true;
    $('timer').hidden=style!=='challenge';$('gate').classList.remove('unlocked','flash');text('gate-icon',r.boss?'🔒':'🔑');
    $('path').innerHTML=rounds.map(function(_,i){return '<span class="'+(i<index?'done':i===index?'current':'')+'"></span>';}).join('');
    feedback('');renderText();text('media-msg',tr('동영상은 눌렀을 때만 재생해요. 그림으로도 도전할 수 있어요.','Clips play only when you choose. You can also use the picture.'));updateHud();
  }
  function updateHud(){text('score',score);text('combo',combo+' COMBO');text('timer',remaining>0?tr('시간 보너스 ','Bonus time ')+Math.ceil(remaining)+'s':tr('계속 도전 가능','Keep trying'));}
  function remember(){if(!mistakes.some(function(r){return r.scene.id===current().scene.id&&r.level===current().level;}))mistakes.push(current());}
  function award(){
    if(passed||!active||paused)return;
    passed=true;var clean=!assisted&&!hints&&attempts===0;combo=clean?combo+1:0;maxCombo=Math.max(maxCombo,combo);
    var gain=assisted?0:50+(clean?Math.min(combo,5)*10:0)+(style==='challenge'&&clean&&remaining>0?Math.ceil(remaining):0)+(current().boss?30:0);
    score+=gain;history.push({scene:current().scene,level:current().level,answer:model(),assisted:assisted,review:assisted||hints>0||attempts>0});
    if(!clean)remember();$('answer').disabled=true;$('submit').disabled=true;$('hint').disabled=true;$('reveal').disabled=true;$('skip').hidden=true;$('next').hidden=false;$('listen').hidden=false;
    feedback(assisted?tr('배웠어요! 이 표현은 마지막에 다시 연습해요.','Learned! Try this expression again in review.'):tr('정답! 문이 열렸어요. +','Correct! Gate unlocked. +')+gain+' ★','good');
    $('gate').classList.add('unlocked','flash');text('gate-icon','🔓');text('gate-title',model());text('gate-copy',tr('정답을 듣거나 다음 장면으로 이동하세요.','Listen to the answer or continue to the next scene.'));tone(true);updateHud();$('next').focus({preventScroll:true});
  }
  function skip(){
    if(passed||!active||paused)return;
    passed=true;skipped=true;combo=0;remember();updateHud();
    history.push({scene:current().scene,level:current().level,answer:model(),assisted:true,review:true,skipped:true});
    $('answer').disabled=true;$('submit').disabled=true;$('hint').disabled=true;$('reveal').disabled=true;$('skip').hidden=true;
    $('next').hidden=false;$('listen').hidden=false;$('hint-box').hidden=false;
    text('hint-box',model()+'\n'+tr('이 표현은 마지막 복습에서 다시 만나요.','You will practise this expression again in the review.'));
    feedback(tr('넘어갔어요. 정답을 한 번 읽거나 들어 보세요.','Skipped. Read or listen to the answer once.'),'retry');
    renderText();tone(false);$('next').focus({preventScroll:true});
  }
  function submit(e){e.preventDefault();if(e.isComposing||passed||!active||paused)return;var result=D.check($('answer').value,current().scene,current().level);
    if(result==='correct'){award();return;}
    if(result==='empty'){feedback(tr('먼저 영어 단어나 구문을 써 보세요.','Type an English word or phrase first.'),'retry');return;}
    attempts++;combo=0;remember();updateHud();feedback(result==='close'?tr('거의 다 왔어요! 철자 한 글자를 다시 살펴봐요.','Almost! Check one letter in your spelling.'):tr('다시 살펴볼까요? 이 미션의 목표 표현은 힌트로 확인할 수 있어요.','Try again. Use a hint to find this mission’s target expression.'),'retry');
  }
  function hint(){if(passed||paused||!active)return;hints=Math.min(2,hints+1);combo=0;remember();updateHud();$('hint-box').hidden=false;
    text('hint-box',hints===1?tr('뜻 단서: ','Meaning clue: ')+current().scene[current().level===0?(ui==='ko'?'clueKo':'clueEn'):(ui==='ko'?'actionKo':'actionEn')]+'\n'+tr('첫 글자: ','First letter: ')+model()[0]+tr(' · 단어 수: ',' · Words: ')+model().split(' ').length:tr('글자 힌트: ','Letter clue: ')+model().split(' ').map(function(w){return w[0]+w.slice(1).replace(/[a-z]/gi,'_');}).join(' '));
  }
  function reveal(){if(passed||paused||!active)return;assisted=true;combo=0;remember();updateHud();$('hint-box').hidden=false;text('hint-box',model()+'\n'+tr('직접 입력해 문을 열어 보세요. 이번 문제는 연습으로 기록돼요.','Type it yourself to open the gate. This round counts as practice.'));$('answer').focus();}
  function fallback(msg){var v=$('video');v.pause();v.hidden=true;$('poster').hidden=false;text('media-msg',msg);}
  async function watch(){if(!active||paused)return;stopMedia();var epoch=mediaEpoch,v=$('video');if(!v.getAttribute('src'))v.src=current().scene.video;v.hidden=false;v.muted=true;$('poster').hidden=false;
    text('media-msg',tr('영상을 불러오는 중… 잠시 기다리거나 그림으로 풀어 보세요.','Loading the clip… You can keep using the picture.'));
    try{await v.play();if(epoch!==mediaEpoch){if(paused||!active||v.hidden)v.pause();return;}if(paused||!active){v.pause();return;}$('poster').hidden=true;text('media-msg',tr('행동을 자세히 살펴봐요. 다시 누르면 처음부터 볼 수 있어요.','Watch the action. Tap again to replay from the beginning.'));}catch(_){if(epoch===mediaEpoch){fallback(tr('영상을 재생할 수 없어 그림을 보여 드려요. 힌트를 사용해도 좋아요.','Showing the picture because the clip could not play. You can use a hint.'));}}}
  function pause(){if(!active||paused)return;paused=true;stopMedia();$('paused').hidden=false;$('resume').focus();}
  function resume(){paused=false;lastTick=performance.now();$('paused').hidden=true;$(passed?'next':'answer').focus({preventScroll:true});}
  function summary(){return ['Mangoi Scene Quest',tr('탐험 점수: ','Adventure points: ')+score,tr('최고 콤보: ','Best combo: ')+maxCombo].concat(history.map(function(h,i){return (i+1)+'. '+h.scene[ui]+': '+h.answer+(h.skipped?tr(' [넘어감]',' [skipped]'):h.review?tr(' [복습]',' [review]'):'');})).join('\n');}
  function finish(){
    active=false;stopMedia();$('play').hidden=true;$('result').hidden=false;text('total-score',score);text('max-combo',maxCombo);text('review-count',mistakes.length);text('copy-status','');
    var solved=history.filter(function(h){return !h.skipped;}).length;
    label('result-title',solved?'보물문이 열렸어요!':'끝까지 왔어요!',solved?'The treasure gate is open!':'You made it to the end!');
    label('result-copy',solved?'보고, 쓰고, 끝까지 탐험했어요. 배운 표현을 한 번 더 말해 보세요!':'이번엔 모두 넘어갔어요. 아래 표현을 한 번씩 따라 써 보면 다음엔 문이 열려요.',solved?'You watched, wrote, and finished the adventure. Say what you learned once more!':'You skipped every scene this time. Copy the expressions below once and the gate will open next time.');
    $('review-list').replaceChildren();history.forEach(function(h){var row=document.createElement('div'),title=document.createElement('span'),answer=document.createElement('strong');row.className='review-item';title.textContent=h.scene[ui]+(h.skipped?tr(' · 넘어감',' · Skipped'):h.review?tr(' · 다시 연습',' · Review'):tr(' · 통과',' · Passed'));answer.textContent=h.answer;row.append(title,answer);$('review-list').append(row);});$('review').hidden=mistakes.length===0;
    // Hub quest completion only; points are local to this adventure, not spendable coins.
    if(!reviewing&&!reported){reported=true;if(window.parent!==window)window.parent.postMessage({type:'mangoi-game-complete',game:'scenequest',score:score},location.origin);}
  }
  $('answer-form').addEventListener('submit',submit);$('answer').addEventListener('keydown',function(e){if(e.key==='Enter'&&e.isComposing)e.preventDefault();});
  $('start').addEventListener('click',function(){reviewing=false;start(D.deck($('world').value,Number($('level').value)));});
  $('next').addEventListener('click',function(){if(!passed||paused)return;if(index+1>=rounds.length)finish();else{index++;loadRound();}});
  $('hint').addEventListener('click',hint);$('reveal').addEventListener('click',reveal);$('skip').addEventListener('click',skip);
  $('watch').addEventListener('click',function(){if($('video').getAttribute('src'))$('video').currentTime=0;watch();});
  $('still').addEventListener('click',function(){stopMedia();fallback(tr('그림을 보고 천천히 써 보세요.','Take your time with the picture.'));});
  $('video').addEventListener('error',function(){if(active&&$('video').getAttribute('src')){fallback(tr('영상 대신 그림으로 도전해요.','Continue with the picture.'));}});
  $('poster').addEventListener('error',function(){if(active){text('media-msg',tr('그림을 불러오지 못했어요. 동영상이나 힌트로 계속할 수 있어요.','The picture could not load. Try the clip or a hint.'));}});
  $('listen').addEventListener('click',function(){if(!passed||paused||!window.speechSynthesis)return;stopMedia();var utter=new SpeechSynthesisUtterance(model());utter.lang='en-US';utter.rate=.85;window.speechSynthesis.speak(utter);});
  $('pause').addEventListener('click',pause);$('resume').addEventListener('click',resume);
  $('sound').addEventListener('click',function(){muted=!muted;this.setAttribute('aria-pressed',String(!muted));text('sound',muted?'♪ OFF':'♪ ON');if(muted)stopMedia();else tone(true);});
  $('ui-lang').addEventListener('click',function(){ui=ui==='ko'?'en':'ko';language();});
  $('back').addEventListener('click',function(){stopMedia();if(window.parent!==window)window.parent.postMessage({type:'mangoi-game-back'},location.origin);else location.href='/student-games.html';});
  $('again').addEventListener('click',function(){stopMedia();$('result').hidden=true;$('intro').hidden=false;});
  $('review').addEventListener('click',function(){var list=mistakes.slice();reviewing=true;start(list);});
  $('copy').addEventListener('click',async function(){try{await navigator.clipboard.writeText(summary());text('copy-status',tr('복사했어요. 선생님에게 보여 주세요.','Copied. Share it with your teacher.'));}catch(_){text('copy-status',tr('복사할 수 없어요. 위 결과의 텍스트를 선택해 복사해 주세요.','Copy is unavailable. Select and copy the results above.'));}});
  document.addEventListener('visibilitychange',function(){if(document.hidden)pause();});window.addEventListener('pagehide',stopMedia);
  // Hidden parent iframe does not fire visibilitychange. Observe its display state too.
  try{if(window.frameElement){var parentObserver=new MutationObserver(function(){if(window.frameElement.getClientRects().length===0)pause();});for(var el=window.frameElement;el;el=el.parentElement)parentObserver.observe(el,{attributes:true,attributeFilter:['style','class','hidden']});}}catch(_){}
  setInterval(function(){var now=performance.now(),delta=(now-lastTick)/1000;lastTick=now;if(active&&!passed&&!paused&&style==='challenge'){remaining=Math.max(0,remaining-delta);updateHud();}},250);
  language();
})();
