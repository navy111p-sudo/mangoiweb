/* Handover dictation: server (Whisper) recording only.
   2026-10-02: the browser SpeechRecognition button ("말로 입력") was removed at the owner's request —
   its quality varied by browser/device while recording worked reliably. One button now records and converts. */
(function(){
  'use strict';
  window.HandoverDictation={create:function(o){
    var active=false,serial=0,limit=null,captured=false;
    var IDLE='녹음해서 입력 / Record';
    function status(s){o.status.textContent=s;}
    function append(t){if(t){captured=true;o.onText(t);}}
    function busy(value){active=value;o.onBusy(value);o.language.disabled=value;o.button.textContent=value?'■ 녹음 정지 / Stop recording':IDLE;o.button.setAttribute('aria-pressed',String(value));}
    function finish(message){clearTimeout(limit);busy(false);if(message)status(message);}
    function start(){
      var voice=window.MangoiVoice;if(!voice||!voice.supported()){status('이 브라우저에서 녹음할 수 없습니다. Chrome/Safari에서 마이크 권한을 확인해 주세요. / Recording unavailable; check browser and mic permission.');return;}
      var token=++serial;captured=false;busy(true);var failure='';
      limit=setTimeout(function(){if(token!==serial)return;++serial;voice.cancel();finish('음성 변환 응답이 늦습니다. 다시 시도해 주세요. 작성 내용은 유지됩니다. / Timed out; your existing text is kept.');},90000);
      voice.record({lang:o.language.value.split('-')[0],maxMs:45000,firstMs:12000,silenceMs:3000,onState:function(state,info){
        if(token!==serial)return;
        var messages={ready:'마이크 권한 요청 중 / Requesting microphone…',waiting:'녹음 중 · 말씀해 주세요 / Recording · please speak',speaking:'목소리 감지 · 3초 쉬거나 정지를 누르면 변환합니다 / Voice detected · pause or stop to convert',thinking:'녹음한 말을 글자로 변환 중 / Converting your recording…'};
        if(state==='error'){var reason=info&&info.reason;failure=reason==='denied'?'마이크 권한을 허용해 주세요. / Allow microphone access.':reason==='no_audio'?'목소리를 감지하지 못했습니다. 입력 마이크를 확인해 주세요. / No audio; check your microphone.':'음성 변환에 실패했습니다. 다시 시도해 주세요. / Conversion failed; please retry.';status(failure);}else status(messages[state]||state);
      }}).then(function(t){if(token!==serial)return;append(String(t||'').trim());finish(failure||(t?'입력 완료 · 내용을 확인해 주세요. / Inserted; please check the text.':'인식된 말이 없습니다. 다시 말씀해 주세요. / No speech recognized; please retry.'));}).catch(function(){if(token===serial)finish('음성 변환 실패 · 다시 시도해 주세요. / Please retry.');});
    }
    function stop(){if(!active)return;if(window.MangoiVoice)window.MangoiVoice.stop();}
    function cancel(){if(!active)return;++serial;if(window.MangoiVoice)window.MangoiVoice.cancel();finish('녹음을 취소했습니다. / Recording cancelled.');}
    o.button.onclick=function(){if(active){stop();return;}if(o.canStart())start();};
    return {stop:stop,cancel:cancel,busy:function(){return active;},captured:function(){return captured;}};
  }};
})();
