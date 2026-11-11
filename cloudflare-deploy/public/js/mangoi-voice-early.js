/*!
 * ⚡ mangoi-voice-early.js — 녹음(Whisper) 경로 «미리 받아쓰기» / early transcription for the recording path
 *   (2026-11-05 사장님 「듣기 시간과 녹음 시간을 최소화해서 아바타가 가능한 빨리 말하게 — 특히 휴대폰」)
 *
 * EN: As soon as the speaker pauses, upload what has been recorded so far. If they stay quiet,
 *     the transcript is already there when recording ends (no second upload), and a reply that
 *     looks finished ends the recording early instead of waiting out the full silence.
 * KO: [왜] 예전 순서는 «말 끝 → 침묵 1.6초를 다 기다림 → 그제야 올리고 받아 적음(약 1~2초)» 이라
 *          그 둘이 «차례로» 더해졌다. 안드로이드 «자동으로»·앱(WebView)이 전부 이 경로다.
 *     [어떻게] 말이 멎고 WAIT_MS 가 지나면 지금까지 녹음분을 먼저 받아 적는다(공용 모듈의 early 고리 — snap()).
 *       · 그 사이 다시 말하면 → 그 결과는 버린다(다음 멈춤에서 새로 받는다).
 *       · 침묵 대기가 다 차서 끝나면 → 미리 받은 글자를 그대로 쓴다(같은 말을 다시 올리지 않는다).
 *       · 받은 글자가 accept(text) 를 통과하고(=끝난 말) MIN_MS 넘게 조용했으면 → 그 자리에서 끝낸다.
 *     ⛔ webm·ogg 만, 그리고 애플 WebKit(아이폰·아이패드·사파리·iOS 인앱)은 빼고 — iOS 18.4+ 는 webm 도 녹음하지만 녹음 «도중» 을
 *        잘라 낸 조각이 서버에서 읽히는지·«지금» 까지 다 담기는지 확인 못 했다(함정 대조). 그쪽은 예전대로(끝까지 녹음 → 한 번).
 *     ⛔ 미리 받은 뒤 REUSE_MS 넘게 더 녹음됐으면 그 글자를 쓰지 않고 전체를 올린다 — 그 사이 «작은 목소리» 를 소리 판정이 조용함으로
 *        봤을 수 있다(그 말이 빠진다 · 함정 대조 재현). 자동 모드의 침묵 끝(멈춤 + 1.6초)은 미리받기(멈춤 + 0.35초) 뒤 1.25초라 안에 든다.
 *     ⛔ 미리 받기는 한 녹음에 MAX_TRIES 번까지 — 매번 «처음부터 지금까지» 를 올리므로 길게 쉬며 말하면 비용이 쌓인다.
 *     ⛔ 판단은 전부 여기 둔다 — 공용 모듈(mangoi-voice-input.js)은 첫 화면(blocking)에 실려 여유가 수십 바이트다.
 *
 * 사용 / usage:
 *   MangoiVoice.record(MangoiVoiceEarly.wrap({ …평소 opts… }, { accept: function (text) { return bool; } }))
 *   cfg: accept(없으면 «미리 받기만» — ⏹ 로 끝내는 수동 모드) · waitMs · minMs · maxTries · reuseMs
 * 감시 / tests: test-harness/voice_early_harness.mjs (공용 모듈과 이 파일을 원문 그대로 가짜 마이크·시계로 돌린다)
 */
(function () {
  'use strict';
  if (window.MangoiVoiceEarly) return;

  var WAIT_MS = 350;     // 말이 멎고 이만큼 지나면 미리 받아 적기 시작
  var MIN_MS = 1000;     // «끝난 말» 이어도 최소 이만큼은 조용해야 끝낸다(숨 한 번 — 이어 말할 틈)
  var MAX_TRIES = 5;     // 한 녹음에서 미리 받기 최대 횟수
  var REUSE_MS = 1300;   // 미리 받은 뒤 이 안에 녹음이 끝났을 때만 그 글자를 쓴다(그보다 길면 전체를 다시 올림)
  var UA = String((window.navigator && navigator.userAgent) || '');
  var APPLE_WEBKIT = /AppleWebKit/.test(UA) && !/Chrome|Chromium|Android/.test(UA);   // iOS 크롬(CriOS)·인앱도 WebKit 이다

  function wrap(base, cfg) {
    base = base || {}; cfg = cfg || {};
    if (!(window.MangoiVoice && window.MangoiVoice.post)) return base;   // 공용 모듈이 옛 판(고리 없음)이면 손대지 않는다
    var wait = cfg.waitMs || WAIT_MS, min = cfg.minMs || MIN_MS, max = cfg.maxTries || MAX_TRIES, reuse = cfg.reuseMs || REUSE_MS;
    var gen = 0;          // 멈춤·다시 말함마다 +1 — 미리 받은 글자가 «지금 녹음의 끝» 과 같은 말인지 가른다
    var spec = null;      // { gen, p: Promise<전사 응답|null> }
    var timer = null, tries = 0;
    var send = function (fd) {
      return typeof base.transcribe === 'function' ? base.transcribe(fd) : window.MangoiVoice.post(fd);
    };
    var o = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) o[k] = base[k];

    o.early = function (ctl) {
      clearTimeout(timer); timer = null;
      gen++;
      if (!ctl) { spec = null; return; }                       // 다시 말한다 — 앞의 미리받기는 «지난 말»
      if (APPLE_WEBKIT || !/webm|ogg/i.test(ctl.mime || '') || tries >= max) return;
      var my = gen, quietAt = Date.now();
      timer = setTimeout(function () {
        timer = null;
        if (my !== gen) return;
        tries++;
        var s = { gen: my, p: null, at: Date.now() };
        s.p = ctl.snap()
          .then(function (fd) { return fd ? send(fd) : null; })
          .then(null, function () { return null; });
        spec = s;
        s.p.then(function (d) {
          if (spec !== s || my !== gen || !d || !d.ok || typeof cfg.accept !== 'function') return;
          var t = String(d.text || '').trim();
          if (!t || !cfg.accept(t)) return;
          var go = function () { timer = null; if (spec === s && my === gen) ctl.stop(); };
          var left = min - (Date.now() - quietAt);
          if (left > 0) timer = setTimeout(go, left); else go();
        });
      }, wait);
    };

    /* 녹음이 끝나면 공용 모듈이 부른다 — 끝까지 조용했으면 미리 받은 글자를, 아니면(또는 실패면) 예전처럼 전체를 올린다 */
    o.transcribe = function (fd) {
      var s = spec;
      if (s && s.gen === gen && Date.now() - s.at <= reuse) return s.p.then(function (d) { return (d && d.ok && String(d.text || '').trim()) ? d : send(fd); });
      return send(fd);
    };
    return o;
  }

  window.MangoiVoiceEarly = { wrap: wrap, _cfg: { WAIT_MS: WAIT_MS, MIN_MS: MIN_MS, MAX_TRIES: MAX_TRIES, REUSE_MS: REUSE_MS, APPLE_WEBKIT: APPLE_WEBKIT } };
})();
