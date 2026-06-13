/* ════════════════════════════════════════════════════════════════
   🥭 Mango AI Avatar — 말하는 영상 아바타 (D-ID Agents SDK 연동)
   - 위치: 홈 화면 왼쪽 위 플로팅 오브
   - 키 미설정 시: 망고 캐릭터 idle + 말풍선(텍스트)로 graceful 동작
   - 키 설정 시: D-ID 실사 아바타가 AI 답변을 음성으로 말함
   설정값은 window.MANGO_AVATAR_CONFIG 로 주입 (index.html 상단)
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__mangoAvatarLoaded) return;
  window.__mangoAvatarLoaded = true;

  var CFG = Object.assign({
    agentId:   '',   // ← D-ID Studio > Agent > Embed 의 data-agent-id
    clientKey: '',   // ← D-ID Studio > Agent > Embed 의 data-client-key
    sdkUrl:    'https://cdn.jsdelivr.net/npm/@d-id/client-sdk/+esm',
    voiceKo:   'ko-KR-SunHiNeural',
    voiceEn:   'en-US-JennyNeural',
    idleImg:   '/img/Mangoi_Character.png',
    autoConnect: false,   // true면 페이지 로드시 바로 연결(분 소진 주의)
    homeOnly:  true       // 홈(view-home) 활성일 때만 노출
  }, window.MANGO_AVATAR_CONFIG || {});

  var hasKeys = !!(CFG.agentId && CFG.clientKey);

  // ── 상태 ──
  var agentManager = null;
  var connected = false;
  var connecting = false;
  var speakQueue = [];
  var els = {};

  // ── 스타일 주입 ──
  function injectStyle() {
    if (document.getElementById('mavatar-style')) return;
    var css = ''
      + '.mavatar-dock{position:fixed;top:70px;left:14px;z-index:100040;display:flex;flex-direction:column;align-items:flex-start;gap:8px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:none}'
      + '.mavatar-dock *{box-sizing:border-box}'
      + '.mavatar-orb{pointer-events:auto;position:relative;width:74px;height:74px;border-radius:50%;cursor:pointer;border:2px solid rgba(251,191,36,.85);background:#0b1224;overflow:hidden;box-shadow:0 10px 26px -6px rgba(0,0,0,.6),0 0 18px rgba(251,191,36,.25);transition:transform .25s cubic-bezier(.22,.7,.3,1),box-shadow .25s}'
      + '.mavatar-orb:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 14px 30px -6px rgba(0,0,0,.65),0 0 26px rgba(251,191,36,.45)}'
      + '.mavatar-orb img,.mavatar-orb video{width:100%;height:100%;object-fit:cover;display:block}'
      + '.mavatar-orb video{display:none}'
      + '.mavatar-orb.talking{border-color:#4ec9ff;box-shadow:0 14px 30px -6px rgba(0,0,0,.65),0 0 28px rgba(78,201,255,.6);animation:mavatarPulse 1.1s ease-in-out infinite}'
      + '@keyframes mavatarPulse{0%,100%{box-shadow:0 14px 30px -6px rgba(0,0,0,.65),0 0 22px rgba(78,201,255,.45)}50%{box-shadow:0 14px 30px -6px rgba(0,0,0,.65),0 0 34px rgba(78,201,255,.8)}}'
      + '.mavatar-dot{position:absolute;right:3px;bottom:3px;width:14px;height:14px;border-radius:50%;background:#64748b;border:2px solid #0b1224}'
      + '.mavatar-dot.on{background:#22c55e}'
      + '.mavatar-dot.busy{background:#f59e0b}'
      + '.mavatar-speech{pointer-events:auto;max-width:min(280px,72vw);background:rgba(11,18,36,.94);color:#e8eef8;border:1px solid rgba(148,163,184,.28);border-radius:14px;border-top-left-radius:4px;padding:10px 13px;font-size:13.5px;line-height:1.5;box-shadow:0 12px 30px -10px rgba(0,0,0,.7);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);opacity:0;transform:translateY(-6px);transition:opacity .25s,transform .25s;display:none}'
      + '.mavatar-speech.show{opacity:1;transform:translateY(0);display:block}'
      + '.mavatar-speech .mavatar-badge{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.3px;color:#fbbf24;margin-bottom:3px}'
      + '.mavatar-hint{font-size:10.5px;color:#94a3b8;margin-top:5px}'
      + '@media (max-width:640px){'
      + '.mavatar-dock{top:92px;left:10px;gap:6px}'
      + '.mavatar-orb{width:56px;height:56px;border-width:2px}'
      + '.mavatar-dot{width:12px;height:12px}'
      + '.mavatar-speech{max-width:70vw;font-size:12.5px;padding:8px 11px}'
      + '}';
    var st = document.createElement('style');
    st.id = 'mavatar-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ── DOM 생성 ──
  function buildDom() {
    if (document.querySelector('.mavatar-dock')) return;
    var dock = document.createElement('div');
    dock.className = 'mavatar-dock';
    dock.id = 'mavatar-dock';

    var speech = document.createElement('div');
    speech.className = 'mavatar-speech';
    speech.id = 'mavatar-speech';

    var orb = document.createElement('div');
    orb.className = 'mavatar-orb';
    orb.id = 'mavatar-orb';
    orb.setAttribute('role', 'button');
    orb.setAttribute('aria-label', 'AI 아바타');
    orb.setAttribute('title', hasKeys ? 'AI 아바타 — 클릭해 음성 켜기' : 'AI 아바타');

    var img = document.createElement('img');
    img.src = CFG.idleImg;
    img.alt = 'Mango AI';
    img.draggable = false;

    var video = document.createElement('video');
    video.id = 'mavatar-video';
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');

    var dot = document.createElement('span');
    dot.className = 'mavatar-dot';
    dot.id = 'mavatar-dot';

    orb.appendChild(img);
    orb.appendChild(video);
    orb.appendChild(dot);
    dock.appendChild(speech);
    dock.appendChild(orb);
    document.body.appendChild(dock);

    els = { dock: dock, speech: speech, orb: orb, img: img, video: video, dot: dot };

    orb.addEventListener('click', onOrbClick);
    applyHomeVisibility();
  }

  // ── 홈에서만 노출 ──
  function applyHomeVisibility() {
    if (!els.dock) return;
    if (!CFG.homeOnly) { els.dock.style.display = 'flex'; return; }
    var home = document.getElementById('view-home');
    var isHome = home && home.classList.contains('active');
    els.dock.style.display = isHome ? 'flex' : 'none';
  }

  // ── 말풍선 표시 ──
  var speechTimer = null;
  function showSpeech(text, badge) {
    if (!els.speech) return;
    var safe = String(text || '').replace(/[<>&]/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
    });
    els.speech.innerHTML = (badge ? '<span class="mavatar-badge">' + badge + '</span><br>' : '') + safe
      + (!hasKeys ? '<div class="mavatar-hint">🔇 음성 아바타는 키 설정 후 활성화돼요</div>' : '');
    els.speech.classList.add('show');
    if (speechTimer) clearTimeout(speechTimer);
    var ms = Math.min(14000, 4000 + safe.length * 90);
    speechTimer = setTimeout(function () { els.speech.classList.remove('show'); }, ms);
  }

  function setDot(state) {
    if (!els.dot) return;
    els.dot.className = 'mavatar-dot' + (state ? ' ' + state : '');
  }
  function setTalking(on) {
    if (!els.orb) return;
    els.orb.classList.toggle('talking', !!on);
    setDot(on ? 'busy' : (connected ? 'on' : ''));
  }

  // ── 언어 감지 → 음성 선택 ──
  function pickVoice(text) {
    var ko = /[가-힣]/.test(text || '');
    return ko ? CFG.voiceKo : CFG.voiceEn;
  }

  // ── D-ID 연결 ──
  function onOrbClick() {
    if (!hasKeys) { showSpeech('안녕하세요! 무엇을 도와드릴까요? 검색창에 물어보세요 🙂', '망고 AI'); return; }
    if (connected) { showSpeech('네, 듣고 있어요. 무엇이 궁금하세요?', '망고 AI'); return; }
    connect();
  }

  function connect() {
    if (!hasKeys || connecting || connected) return;
    connecting = true;
    setDot('busy');
    showSpeech('연결 중이에요…', '망고 AI');
    import(CFG.sdkUrl).then(function (sdk) {
      var auth = { type: 'key', clientKey: CFG.clientKey };
      var callbacks = {
        onSrcObjectReady: function (value) {
          els.video.srcObject = value;
          window.__mavatarSrc = value;
          return value;
        },
        onConnectionStateChange: function (state) {
          if (state === 'connected') {
            connected = true; connecting = false;
            setDot('on');
            els.video.style.display = 'block';
            els.img.style.display = 'none';
            flushQueue();
          } else if (state === 'fail' || state === 'closed' || state === 'disconnected') {
            connected = false;
            setDot('');
            els.video.style.display = 'none';
            els.img.style.display = 'block';
          }
        },
        onVideoStateChange: function (state) {
          if (state === 'STOP') {
            setTalking(false);
            // idle 영상으로 복귀
            try {
              els.video.srcObject = undefined;
              if (agentManager && agentManager.agent && agentManager.agent.presenter && agentManager.agent.presenter.idle_video) {
                els.video.src = agentManager.agent.presenter.idle_video;
              }
            } catch (e) {}
          } else {
            setTalking(true);
            try {
              els.video.src = '';
              els.video.srcObject = window.__mavatarSrc;
            } catch (e) {}
          }
        },
        onError: function (err, data) {
          console.warn('[mango-avatar] error', err, data);
          connecting = false;
        }
      };
      var streamOptions = { compatibilityMode: 'auto', streamWarmup: true };
      return sdk.createAgentManager(CFG.agentId, { auth: auth, callbacks: callbacks, streamOptions: streamOptions });
    }).then(function (mgr) {
      agentManager = mgr;
      return mgr.connect();
    }).catch(function (e) {
      connecting = false;
      setDot('');
      console.warn('[mango-avatar] 연결 실패', e);
      showSpeech('아바타 연결에 실패했어요. 잠시 후 다시 시도해 주세요.', '망고 AI');
    });
  }

  function flushQueue() {
    while (speakQueue.length) {
      var t = speakQueue.shift();
      doSpeak(t);
    }
  }

  function doSpeak(text) {
    if (!agentManager || !connected) return;
    var voice = pickVoice(text);
    var payload = { type: 'text', input: String(text).slice(0, 1000) };
    try {
      payload.provider = { type: 'microsoft', voice_id: voice };
      agentManager.speak(payload);
    } catch (e) {
      // provider 미지원이면 기본 음성으로 재시도
      try { agentManager.speak({ type: 'text', input: payload.input }); } catch (e2) {}
    }
    setTalking(true);
  }

  // ── 공개 API: AI 답변을 아바타가 말하게 ──
  function speak(text, opts) {
    text = (text || '').toString().trim();
    if (!text) return;
    // 마크업/이모지 정리
    var clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    showSpeech(clean, '망고 AI');
    if (!hasKeys) return;            // 키 없으면 텍스트만
    if (connected) { doSpeak(clean); return; }
    speakQueue.push(clean);
    connect();                        // 첫 답변에서 자동 연결
  }

  // ── 초기화 ──
  function init() {
    injectStyle();
    buildDom();
    if (CFG.autoConnect && hasKeys) connect();
    // 뷰 전환 감지 → 홈에서만 표시
    var home = document.getElementById('view-home');
    if (home && window.MutationObserver) {
      new MutationObserver(applyHomeVisibility).observe(home, { attributes: true, attributeFilter: ['class'] });
    }
    document.addEventListener('mango:viewchange', applyHomeVisibility);
  }

  window.MangoAvatar = {
    speak: speak,
    connect: connect,
    disconnect: function () { try { agentManager && agentManager.disconnect(); } catch (e) {} connected = false; setDot(''); },
    isReady: function () { return connected; },
    config: CFG
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
