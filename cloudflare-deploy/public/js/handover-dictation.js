/* Handover dictation: visible interim text, bounded sessions, explicit recording fallback. */
(function(){
  'use strict';
  window.HandoverDictation={create:function(o){
    var active=false,kind='',serial=0,rec=null,parts={},committed={},watch=null,limit=null,settle=null,captured=false;
    var Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
    function status(s){o.status.textContent=s;}
    function pending(){return Object.keys(parts).sort(function(a,b){return a-b;}).filter(function(k){return !committed[k];}).map(function(k){return parts[k];}).join(' ').trim();}
    function append(t){if(t){captured=true;o.onText(t);}}
    function flush(){append(pending());Object.keys(parts).forEach(function(k){committed[k]=true;});o.interim.textContent='';}
    function clear(){clearTimeout(watch);clearTimeout(limit);clearTimeout(settle);}
    function busy(value){active=value;o.onBusy(value);o.language.disabled=value;o.button.textContent=value?'■ 정지하고 입력 / Stop & insert':'말로 입력 / Dictate';o.fallback.textContent=value&&kind==='record'?'■ 녹음 정지 / Stop recording':'녹음해서 입력 / Record instead';o.button.setAttribute('aria-pressed',String(value));}
    function finish(message){clear();rec=null;kind='';busy(false);if(message)status(message);}
    function startBrowser(){
      if(!Speech){startRecord();return;}
      var token=++serial;kind='browser';captured=false;parts={};committed={};o.interim.textContent='';busy(true);status('마이크 연결 중 / Connecting microphone…');
      try{rec=new Speech();}catch(e){finish('브라우저 인식 시작 실패 · 녹음해서 입력을 눌러 주세요. / Use Record instead.');return;}
      var current=rec;current.lang=o.language.value;current.continuous=true;current.interimResults=true;
      function watchResults(){clearTimeout(watch);watch=setTimeout(function(){if(token!==serial||!active)return;stop('인식 응답이 없습니다. 마이크를 확인하거나 녹음해서 입력을 눌러 주세요. / No recognition response. Check your mic or use Record instead.');},12000);}
      current.onstart=function(){if(token!==serial)return;status('말씀해 주세요. 인식 중인 글자가 아래에 표시됩니다. / Speak; live words appear below.');watchResults();};
      current.onresult=function(e){if(token!==serial||!active)return;watchResults();var final=[];for(var i=e.resultIndex;i<e.results.length;i++){parts[i]=String(e.results[i][0].transcript||'').trim();if(e.results[i].isFinal&&!committed[i]){committed[i]=true;final.push(parts[i]);}}append(final.join(' '));o.interim.textContent=pending();};
      current.onerror=function(e){if(token!==serial)return;flush();++serial;try{current.abort();}catch(ignore){}finish(e.error==='not-allowed'||e.error==='service-not-allowed'?'마이크 권한을 허용해 주세요. 주소창 사이트 설정에서 확인할 수 있습니다. / Allow microphone access in site settings.':e.error==='audio-capture'?'사용 가능한 마이크가 없습니다. PC·휴대폰의 입력 장치를 확인해 주세요. / Check your microphone input.':'브라우저 음성인식 연결 실패 · 녹음해서 입력을 눌러 주세요. / Recognition failed; use Record instead.');};
      current.onend=function(){if(token!==serial)return;flush();finish(captured?'음성 입력을 마쳤습니다. 내용을 확인해 주세요. / Dictation finished; please check the text.':'인식된 말이 없습니다. 녹음해서 입력을 눌러 다시 시도해 주세요. / No words received; try Record instead.');};
      watchResults();limit=setTimeout(function(){stop();},60000);
      try{current.start();}catch(e){++serial;finish('음성인식을 시작하지 못했습니다. 녹음해서 입력을 눌러 주세요. / Use Record instead.');}
    }
    function stop(message){
      if(!active)return;
      if(kind==='record'){if(window.MangoiVoice)window.MangoiVoice.stop();return;}
      var current=rec,token=serial;clear();status('마지막 문장을 반영하는 중 / Finishing your sentence…');
      // Give final results a short chance to arrive, then retain the latest interim text.
      settle=setTimeout(function(){if(token!==serial)return;flush();++serial;try{current.abort();}catch(ignore){}finish(message||'입력 완료 · 내용을 확인해 주세요. / Inserted; please check the text.');},1200);
      if(message){current.onend=function(){if(token!==serial)return;flush();finish(message);};}
      try{current.stop();}catch(e){flush();++serial;try{current.abort();}catch(ignore){}finish(message);}
    }
    function startRecord(){
      var voice=window.MangoiVoice;if(!voice||!voice.supported()){status('이 브라우저에서 녹음할 수 없습니다. Chrome/Safari에서 마이크 권한을 확인해 주세요. / Recording unavailable; check browser and mic permission.');return;}
      var token=++serial;kind='record';o.interim.textContent='';busy(true);var failure='';
      limit=setTimeout(function(){if(token!==serial)return;++serial;voice.cancel();finish('음성 변환 응답이 늦습니다. 다시 시도해 주세요. 작성 내용은 유지됩니다. / Timed out; your existing text is kept.');},90000);
      voice.record({lang:o.language.value.split('-')[0],maxMs:45000,firstMs:12000,silenceMs:3000,onState:function(state,info){
        if(token!==serial)return;
        var messages={ready:'마이크 권한 요청 중 / Requesting microphone…',waiting:'녹음 중 · 말씀해 주세요 / Recording · please speak',speaking:'목소리 감지 · 3초 쉬거나 정지를 누르면 변환합니다 / Voice detected · pause or stop to convert',thinking:'녹음한 말을 글자로 변환 중 / Converting your recording…'};
        if(state==='error'){var reason=info&&info.reason;failure=reason==='denied'?'마이크 권한을 허용해 주세요. / Allow microphone access.':reason==='no_audio'?'목소리를 감지하지 못했습니다. 입력 마이크를 확인해 주세요. / No audio; check your microphone.':'음성 변환에 실패했습니다. 다시 시도해 주세요. / Conversion failed; please retry.';status(failure);}else status(messages[state]||state);
      }}).then(function(t){if(token!==serial)return;append(String(t||'').trim());finish(failure||(t?'입력 완료 · 내용을 확인해 주세요. / Inserted; please check the text.':'인식된 말이 없습니다. 다시 말씀해 주세요. / No speech recognized; please retry.'));}).catch(function(){if(token===serial)finish('음성 변환 실패 · 다시 시도해 주세요. / Please retry.');});
    }
    function cancel(){if(!active)return;var current=rec;flush();++serial;if(kind==='record'&&window.MangoiVoice)window.MangoiVoice.cancel();if(current)try{current.abort();}catch(ignore){}finish('음성 입력을 종료했습니다. / Dictation stopped.');}
    o.button.onclick=function(){if(active)stop();else if(o.canStart())startBrowser();};
    o.fallback.onclick=function(){if(active){stop();return;}if(o.canStart())startRecord();};
    return {stop:stop,cancel:cancel,busy:function(){return active;}};
  }};
})();
