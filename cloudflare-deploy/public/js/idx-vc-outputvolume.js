/* 🔊 (2026-08-26 학생 제보) 안드로이드 일부 기기(삼성 실측)에서 하드웨어 볼륨키가 "통화" 스트림을
   움직이는데, 실제 소리 출력은 "미디어" 스트림을 따라간다 — 버튼을 눌러도 안 커지고, 시스템 볼륨
   패널을 펼쳐 미디어 슬라이더를 직접 올려야 소리가 났다. 어느 안드로이드 오디오 스트림을 쓸지는
   크로미움이 내부적으로 정하고 웹페이지에는 그걸 고르는 표준 API가 없다 — 그래서 "OS 스트림 자체를
   하나로 통일"하는 것은 이 파일이 할 수 없다.
   대신 OS 스트림이 무엇이든 항상 먹는 자체 음량을 하나 둔다(vc-dock.js 설정 패널의 "출력 음량" 슬라이더).
   ⛔ 2026-08-06 에 있었던 "마이크 음량" 가짜 슬라이더(부르는 함수가 없어 아무 동작도 안 함,
   vc-dock.js:600 주석)와 같은 실수를 반복하지 않기 위해, 이 파일이 실제로 .volume 을 바꾼다.
   idx-main.js(849KB, blocking, 첫 화면 예산 빡빡)는 한 줄도 안 건드리고 이 파일이 스스로 붙는다 —
   원격 타일·보조 오디오(vc-aud-*)를 DOM 에서 직접 찾아 적용한다(첫 화면 예산 문서 참고). */
(function () {
  var KEY = 'mangoi_vc_out_vol';

  function savedVolume() {
    try {
      var v = parseFloat(localStorage.getItem(KEY));
      return (isFinite(v) && v >= 0 && v <= 1) ? v : 1;
    } catch (e) { return 1; }
  }

  function applyVolume(vol) {
    try {
      var els = document.querySelectorAll('#vc-video-grid video, audio[id^="vc-aud-"]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.closest && el.closest('#vc-local-box')) continue; // 내 미리보기는 항상 음소거 — 건드릴 이유 없음
        try { el.volume = vol; } catch (e) {}
      }
    } catch (e) {}
  }

  window.vcSavedOutputVolume = savedVolume;
  window.vcSetOutputVolume = function (vol) {
    vol = parseFloat(vol);
    if (!isFinite(vol)) return;
    vol = Math.max(0, Math.min(1, vol));
    try { localStorage.setItem(KEY, String(vol)); } catch (e) {}
    applyVolume(vol);
  };

  /* 새로 들어오는 참가자 타일·보조 오디오에도 저장된 값을 물려준다. idx-main.js 의 타일 생성부를
     건드리지 않으므로, 수업 중에만 가볍게 다시 먹인다(1.5초 간격 — 폴링이지만 DOM 조회 몇 개뿐). */
  setInterval(function () {
    if (document.body.classList.contains('vc-in-call')) applyVolume(savedVolume());
  }, 1500);
})();
