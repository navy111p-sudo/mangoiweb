/* Optional closing activity for New BTS. No autoplay or room broadcast. */
(function () {
  'use strict';
  var button, dialog, player, status, en = false;
  function text(ko, eng) { return en ? eng : ko; }
  function stop() { if (player) { player.pause(); try { player.currentTime = 0; } catch (_) {} } }
  function close() { stop(); if (dialog && dialog.open) dialog.close(); }
  function ensure() {
    if (button) return;
    var style = document.createElement('style');
    style.textContent = '#bts-goodbye-open{position:fixed;right:12px;bottom:76px;z-index:96;background:#fff3d4;color:#533000;border:2px solid #eaa52c;border-radius:14px;padding:12px 16px;font:700 16px/1.3 system-ui;cursor:pointer}#bts-goodbye-open[hidden]{display:none}#bts-goodbye{margin:auto;width:min(480px,calc(100vw - 24px));max-height:85vh;overflow:auto;border:0;border-radius:18px;padding:24px;background:#fff;color:#182230;font:16px/1.6 system-ui}#bts-goodbye::backdrop{background:rgba(0,0,0,.65)}#bts-goodbye h2{font-size:24px;margin:0 0 8px}#bts-goodbye button,#bts-goodbye select{font:inherit;max-width:100%;min-height:44px;padding:8px;border-radius:8px;border:1px solid #98a2b3;background:#fff;color:#182230}#bts-goodbye audio{width:100%;margin:14px 0}#bts-goodbye p{margin:10px 0}#bts-goodbye a{color:#175cd3}#bts-goodbye-close{float:right}#bts-goodbye-status{color:#b42318}';
    document.head.appendChild(style);
    button = document.createElement('button'); button.id = 'bts-goodbye-open'; button.type = 'button';
    document.body.appendChild(button);
    dialog = document.createElement('dialog'); dialog.id = 'bts-goodbye';
    dialog.setAttribute('aria-labelledby', 'bts-goodbye-title');
    document.body.appendChild(dialog);
    button.addEventListener('click', function () {
      dialog.innerHTML = '<button type="button" id="bts-goodbye-close">' + text('닫기', 'Close') + '</button>' +
        '<h2 id="bts-goodbye-title">Goodbye Song</h2><p>' + text('수업을 마치며 함께 불러요 · 약 1분', 'Sing together at the end of class · about 1 minute') + '</p>' +
        '<label for="bts-goodbye-mode">' + text('노래 선택', 'Choose a track') + '</label> <select id="bts-goodbye-mode"><option value="vocal">' + text('보컬 · 듣고 따라 부르기', 'Vocals · Listen and sing along') + '</option><option value="inst">' + text('반주 · 직접 부르기', 'Instrumental · Sing on your own') + '</option></select>' +
        '<audio controls preload="none" src="/audio/new-bts/goodbye_vocal.mp3"></audio><p id="bts-goodbye-status" role="status"></p>' +
        '<p>It’s time to go home.<br>It’s time to go home.<br>It’s time to go home.<br>It’s time to say goodbye.</p>' +
        '<p>I had so much fun,<br>and you had so much fun.<br>We all had so much fun,<br>and now we say goodbye!</p>' +
        '<p>Goodbye, goodbye.<br>See you again!</p><p>' + text('같은 가사가 한 번 더 반복돼요.', 'The lyrics repeat once.') + '</p>' +
        '<p>' + text('재생 버튼을 눌러 주세요. 소리는 이 화면에서만 재생됩니다.', 'Press play to start. Audio plays only on this screen.') + '</p>' +
        '<a href="/audio/new-bts/goodbye.mid" download="goodbye.mid">' + text('MIDI 내려받기', 'Download MIDI') + '</a>';
      player = dialog.querySelector('audio'); status = dialog.querySelector('#bts-goodbye-status');
      player.addEventListener('error', function () { status.textContent = text('음원을 불러오지 못했어요. 창을 닫고 다시 열어 주세요.', 'Could not load the audio. Close and reopen this window to retry.'); });
      dialog.querySelector('#bts-goodbye-mode').addEventListener('change', function (e) {
        stop(); status.textContent = ''; player.src = '/audio/new-bts/goodbye_' + e.target.value + '.mp3'; player.load();
      });
      dialog.querySelector('#bts-goodbye-close').addEventListener('click', close);
      dialog.showModal();
    });
    dialog.addEventListener('close', stop);
    dialog.addEventListener('cancel', stop);
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  }
  window.MangoiBtsGoodbye = {
    update: function (book, lesson, english) {
      en = !!english;
      var eligible = /^BTS\s+\d+\b/i.test(String(book || '').replace(/^\[/, '')) && /^New$/i.test(String(lesson || '').trim());
      if (!eligible && !button) return;
      ensure(); close(); button.hidden = !eligible;
      button.textContent = text('♪ 마무리 노래', '♪ Goodbye Song');
    }
  };
})();
