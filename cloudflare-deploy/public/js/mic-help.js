/* 🎤 마이크 도움말 — «마이크 인식이 안 되시나요?» (2026-11-10 사장님 요청)
 *
 * A.i 말하기·발음 교정처럼 마이크를 쓰는 화면에 한 줄로 싣는다:
 *   <script defer src="/js/mic-help.js?v=1"></script>
 *
 * 하는 일
 *  ① 화면 구석에 작은 「🎤 마이크 인식이 안 되시나요?」 버튼을 늘 띄운다(수업 안 iframe 에서는 안 띄움).
 *  ② 마이크 실패를 감지하면 화면 아래에 크게 알린다 — 권한 거부·마이크 없음·다른 앱이 사용 중.
 *     감지 경로: getUserMedia 실패 / SpeechRecognition 'not-allowed'·'audio-capture' / 권한 상태 'denied'.
 *  ③ 누르면 기기(PC 크롬·맥·안드로이드·아이폰·카톡 인앱)에 맞춘 해결 순서와 «마이크 테스트»(소리 막대)를 보여 준다.
 *
 * ⛔ 페이지의 녹음 흐름은 바꾸지 않는다 — getUserMedia 는 원래 결과를 그대로 돌려주고(성공·실패 모두) 실패만 엿본다.
 * ⛔ 마이크를 저절로 켜지 않는다 — 테스트는 사람이 버튼을 눌렀을 때만, 끝나면 트랙을 끈다.
 */
(function () {
  'use strict';
  if (window.__mgMicHelp) return;
  window.__mgMicHelp = true;

  var inFrame = false;
  try { inFrame = window.top !== window.self; } catch (e) { inFrame = true; }

  var ua = navigator.userAgent || '';
  var ENV = (function () {
    if (/KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua)) return 'inapp';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
    return 'pc';
  })();

  /* ── 감지 ─────────────────────────────────────────── */
  var lastProblem = null; // 'denied' | 'nodevice' | 'busy' | 'insecure' | 'other'

  function kindOf(name) {
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'not-allowed' || name === 'service-not-allowed') return 'denied';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError' || name === 'audio-capture') return 'nodevice';
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
    if (name === 'SecurityError') return 'insecure';
    return 'other';
  }

  function report(kind) {
    lastProblem = kind;
    showAlert(kind);
  }
  window.mangoiMicProblem = function (kind) { report(kind || 'other'); };

  var md = navigator.mediaDevices;
  var origGUM = md && md.getUserMedia ? md.getUserMedia.bind(md) : null;
  if (origGUM) {
    try {
      md.getUserMedia = function (c) {
        var p = origGUM(c);
        if (c && c.audio) p.then(null, function (err) { try { report(kindOf(err && err.name)); } catch (e) {} });
        return p;
      };
    } catch (e) {}
  }

  ['SpeechRecognition', 'webkitSpeechRecognition'].forEach(function (k) {
    var Orig = window[k];
    if (typeof Orig !== 'function') return;
    try {
      var Wrapped = function () {
        var r = new Orig();
        try {
          r.addEventListener('error', function (e) {
            var c = e && e.error;
            if (c === 'not-allowed' || c === 'service-not-allowed' || c === 'audio-capture') report(kindOf(c));
          });
        } catch (e2) {}
        return r;
      };
      Wrapped.prototype = Orig.prototype;
      window[k] = Wrapped;
    } catch (e) {}
  });

  try {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' }).then(function (st) {
        if (st.state === 'denied') { lastProblem = 'denied'; markPill(); }
        st.onchange = function () {
          if (st.state === 'denied') report('denied');
          else if (lastProblem === 'denied') { lastProblem = null; unmarkPill(); }
        };
      }, function () {});
    }
  } catch (e) {}

  /* ── 화면 ─────────────────────────────────────────── */
  var css = [
    '#mgmh-pill{position:fixed;left:12px;bottom:12px;z-index:2147482000;display:flex;align-items:center;gap:6px;',
    'padding:8px 13px;border-radius:999px;border:1px solid #fcd34d;background:#fffbeb;color:#92400e;',
    'font:700 13px/1.2 system-ui,-apple-system,"Malgun Gothic",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer}',
    '#mgmh-pill:hover{background:#fef3c7}',
    /* 대화 화면(#ftk, z 2147483050)이 열리면 그 위로 — 아래쪽은 말하기·자막 버튼 자리라 「✋ 질문」 옆(위쪽)으로 옮긴다.
       :has 를 모르는 옛 브라우저는 예전 자리(대화 화면 뒤)에 남는다 — 버튼을 가리는 것보다 낫다. 문제가 생기면 아래 큰 알림은 그대로 뜬다. */
    'body:has(#ftk.on) #mgmh-pill{z-index:2147483100;top:66px;bottom:auto;left:112px}',
    '#mgmh-pill.mgmh-hot{background:#dc2626;border-color:#dc2626;color:#fff;animation:mgmhPulse 1.4s ease-in-out 4}',
    '@keyframes mgmhPulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.55)}50%{box-shadow:0 0 0 10px rgba(220,38,38,0)}}',
    '#mgmh-alert{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483600;width:min(440px,calc(100vw - 32px));',
    'box-sizing:border-box;padding:16px 16px 14px;border-radius:16px;background:#fff;color:#111827;border:2px solid #dc2626;',
    'box-shadow:0 12px 40px rgba(0,0,0,.35);font:15px/1.5 system-ui,-apple-system,"Malgun Gothic",sans-serif}',
    '#mgmh-alert b.t{display:block;font-size:17px;margin-bottom:4px;color:#b91c1c}',
    '#mgmh-alert .row{display:flex;gap:8px;margin-top:12px}',
    '.mgmh-btn{flex:1;padding:11px 12px;border-radius:10px;border:0;font:700 15px/1 system-ui,-apple-system,"Malgun Gothic",sans-serif;cursor:pointer}',
    '.mgmh-pri{background:#dc2626;color:#fff}.mgmh-sec{background:#f3f4f6;color:#374151}',
    '#mgmh-ov{position:fixed;inset:0;z-index:2147483640;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}',
    '#mgmh-box{width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#111827;border-radius:18px;',
    'padding:20px 20px 18px;box-sizing:border-box;font:15px/1.6 system-ui,-apple-system,"Malgun Gothic",sans-serif;position:relative}',
    '#mgmh-box h2{margin:0 34px 6px 0;font-size:20px}',
    '#mgmh-x{position:absolute;right:12px;top:12px;width:34px;height:34px;border-radius:50%;border:0;background:#f3f4f6;font-size:18px;cursor:pointer;color:#374151}',
    '#mgmh-why{margin:8px 0 12px;padding:10px 12px;border-radius:10px;background:#fef2f2;color:#991b1b;font-weight:700}',
    '#mgmh-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}',
    '#mgmh-tabs button{padding:7px 11px;border-radius:999px;border:1px solid #d1d5db;background:#fff;font:600 13px/1 system-ui,-apple-system,"Malgun Gothic",sans-serif;cursor:pointer;color:#374151}',
    '#mgmh-tabs button.on{background:#111827;color:#fff;border-color:#111827}',
    '#mgmh-steps{margin:0;padding-left:22px}#mgmh-steps li{margin:7px 0}',
    '#mgmh-steps code{background:#f3f4f6;padding:1px 6px;border-radius:6px;font-size:13px;word-break:break-all}',
    '#mgmh-test{margin-top:14px;padding:12px;border-radius:12px;background:#f0fdf4;border:1px solid #bbf7d0}',
    '#mgmh-meter{height:14px;border-radius:7px;background:#e5e7eb;overflow:hidden;margin:10px 0 6px}',
    '#mgmh-meter i{display:block;height:100%;width:0;background:#16a34a;transition:width .08s}',
    '#mgmh-res{font-weight:700;min-height:1.5em}',
    '@media (max-width:520px){#mgmh-pill{font-size:12px;padding:7px 11px}}'
  ].join('');

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  var pill = null;
  function ensureCss() {
    if (document.getElementById('mgmh-css')) return;
    var s = el('style', { id: 'mgmh-css' }); s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  function mountPill() {
    if (inFrame || pill || !document.body) return;
    ensureCss();
    pill = el('button', { id: 'mgmh-pill', type: 'button', 'aria-label': '마이크 인식이 안 되시나요? 해결 방법 보기' },
      '<span aria-hidden="true">🎤</span><span>마이크 인식이 안 되시나요?</span>');
    pill.addEventListener('click', function () { openManual(lastProblem); });
    document.body.appendChild(pill);
    if (lastProblem) markPill();
  }
  function markPill() { if (pill) pill.classList.add('mgmh-hot'); }
  function unmarkPill() { if (pill) pill.classList.remove('mgmh-hot'); }

  var WHY = {
    denied: '마이크 사용이 «차단» 되어 있어요. 아래 순서대로 «허용» 으로 바꿔 주세요.',
    nodevice: '연결된 마이크를 찾지 못했어요. 이어폰·헤드셋 마이크가 꽂혀 있는지 확인해 주세요.',
    busy: '다른 프로그램(줌·카카오톡 통화·다른 탭 등)이 마이크를 쓰고 있어요. 그 프로그램을 끄고 다시 해 주세요.',
    insecure: '이 화면에서는 마이크를 쓸 수 없어요. 주소가 https://mangoi.ai 인지 확인해 주세요.',
    silent: '마이크는 켜졌는데 소리가 거의 안 들어와요. 다른 마이크가 선택되어 있거나 볼륨이 꺼져 있을 수 있어요.',
    other: '마이크를 켜지 못했어요. 아래 순서대로 확인해 주세요.'
  };

  var alertBox = null, alertShownFor = {};
  function showAlert(kind) {
    markPill();
    if (alertShownFor[kind] || !document.body) return; // 같은 문제로 반복해서 덮지 않는다
    alertShownFor[kind] = true;
    ensureCss();
    if (alertBox) alertBox.remove();
    alertBox = el('div', { id: 'mgmh-alert', role: 'alertdialog', 'aria-live': 'assertive' },
      '<b class="t">🎤 마이크 인식이 안 되시나요?</b><div>' + (WHY[kind] || WHY.other) + '</div>' +
      '<div class="row"><button type="button" class="mgmh-btn mgmh-pri" data-a="open">해결 방법 보기</button>' +
      '<button type="button" class="mgmh-btn mgmh-sec" data-a="close">닫기</button></div>');
    alertBox.addEventListener('click', function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
      if (!a) return;
      alertBox.remove(); alertBox = null;
      if (a === 'open') openManual(kind);
    });
    document.body.appendChild(alertBox);
  }

  /* ── 해결 순서(기기별) ──────────────────────────────── */
  var STEPS = {
    pc: ['PC (윈도우·크롬)', [
      '주소창 왼쪽의 <b>자물쇠(🔒) 또는 조절 아이콘</b>을 누르세요.',
      '<b>마이크</b>를 <b>「허용」</b>으로 바꾸세요. (마이크 항목이 안 보이면 「사이트 설정」 → 마이크 → 허용)',
      '페이지를 <b>새로고침(F5)</b> 한 뒤 다시 🎤 를 눌러 보세요.',
      '그래도 안 되면 주소창에 <code>chrome://settings/content/microphone</code> 를 붙여넣고, 맨 위에서 <b>사용할 마이크</b>를 고르세요. 차단 목록에 mangoi.ai 가 있으면 지워 주세요.',
      '윈도우 <b>설정 → 개인 정보 및 보안 → 마이크</b>에서 「마이크 액세스」와 「앱이 마이크에 액세스하도록 허용」, 「데스크톱 앱이 마이크에 액세스하도록 허용」을 모두 <b>켬</b>으로 하세요.',
      '윈도우 <b>설정 → 시스템 → 소리 → 입력</b>에서 쓰는 마이크(헤드셋 등)가 선택되어 있고 볼륨이 0 이 아닌지 확인하세요.',
      '줌·카카오톡 통화 등 마이크를 쓰는 다른 프로그램은 끄고 다시 해 주세요.'
    ]],
    mac: ['맥 (크롬·사파리)', [
      '주소창 왼쪽의 <b>자물쇠(🔒) 또는 조절 아이콘</b>을 눌러 <b>마이크 → 허용</b>으로 바꾸세요. (사파리: 메뉴 Safari → 설정 → 웹사이트 → 마이크 → mangoi.ai 허용)',
      '페이지를 <b>새로고침</b> 한 뒤 다시 🎤 를 눌러 보세요.',
      '애플 메뉴 → <b>시스템 설정 → 개인정보 보호 및 보안 → 마이크</b>에서 Chrome(또는 Safari)을 <b>켬</b>으로 하세요. 켠 뒤 브라우저를 껐다 켜야 할 수 있어요.',
      '애플 메뉴 → <b>시스템 설정 → 사운드 → 입력</b>에서 쓰는 마이크가 선택되어 있고 입력 음량이 낮지 않은지 확인하세요.'
    ]],
    android: ['안드로이드 휴대폰·태블릿', [
      '주소창 왼쪽의 <b>자물쇠(🔒) 또는 조절 아이콘</b> → <b>권한</b> → <b>마이크 허용</b>을 누르세요.',
      '안 보이면 휴대폰 <b>설정 → 애플리케이션 → Chrome → 권한 → 마이크 → 「앱 사용 중에만 허용」</b>으로 바꾸세요. (망고아이 앱이면 설정 → 애플리케이션 → 망고아이 → 권한 → 마이크)',
      '화면을 새로고침한 뒤 다시 🎤 를 눌러 보세요. 「허용」 창이 뜨면 꼭 <b>허용</b>을 누르세요.',
      '블루투스 이어폰이 연결돼 있으면 잠시 끊고 다시 해 보세요.'
    ]],
    ios: ['아이폰·아이패드', [
      '사파리: 주소창 왼쪽 <b>「가가(aA)」</b> → <b>웹사이트 설정</b> → <b>마이크 → 허용</b>.',
      '또는 아이폰 <b>설정 → 앱 → Safari → 마이크</b>(크롬이면 설정 → Chrome → 마이크)를 <b>허용</b>으로 하세요.',
      '화면을 새로고침한 뒤 다시 🎤 를 눌러 보세요. 「마이크 접근」 창이 뜨면 <b>허용</b>을 누르세요.',
      '무음 모드·블루투스 이어폰 연결을 잠시 끄고 다시 해 보세요.'
    ]],
    inapp: ['카카오톡·네이버 등 앱 안에서 열었을 때', [
      '카카오톡·네이버·인스타 <b>앱 안의 화면</b>에서는 마이크가 막히는 경우가 많아요.',
      '오른쪽 위(또는 아래)의 <b>⋮ / 공유 버튼</b> → <b>「다른 브라우저로 열기」 / 「Chrome(사파리)으로 열기」</b>를 누르세요.',
      '열린 크롬·사파리에서 다시 로그인한 뒤 🎤 를 눌러 주세요. 마이크 허용 창이 뜨면 <b>허용</b>을 누르세요.'
    ]]
  };

  var ov = null, testStream = null, testAc = null, testRaf = 0, testTimer = 0;

  function stopTest() {
    if (testRaf) cancelAnimationFrame(testRaf); testRaf = 0;
    if (testTimer) clearTimeout(testTimer); testTimer = 0;
    if (testStream) { try { testStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} testStream = null; }
    if (testAc) { try { testAc.close(); } catch (e) {} testAc = null; }
  }

  function closeManual() {
    stopTest();
    if (ov) { ov.remove(); ov = null; }
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) { if (e.key === 'Escape') closeManual(); }

  function renderSteps(env) {
    var s = STEPS[env] || STEPS.pc;
    var list = ov.querySelector('#mgmh-steps');
    list.innerHTML = s[1].map(function (t) { return '<li>' + t + '</li>'; }).join('');
    var tabs = ov.querySelectorAll('#mgmh-tabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-env') === env);
  }

  function setWhy(kind) {
    var w = ov && ov.querySelector('#mgmh-why');
    if (!w) return;
    if (kind && WHY[kind]) { w.textContent = '지금 상태: ' + WHY[kind]; w.style.display = ''; }
    else w.style.display = 'none';
  }

  function runTest() {
    var res = ov.querySelector('#mgmh-res'), bar = ov.querySelector('#mgmh-meter i'), btn = ov.querySelector('#mgmh-run');
    stopTest();
    if (!origGUM) { res.textContent = '❌ 이 브라우저는 마이크를 지원하지 않아요. 크롬으로 열어 주세요.'; return; }
    res.textContent = '마이크를 켜는 중… 「허용」 창이 뜨면 허용을 눌러 주세요.';
    btn.disabled = true;
    origGUM({ audio: true }).then(function (stream) {
      testStream = stream;
      var label = '';
      try { label = stream.getAudioTracks()[0].label || ''; } catch (e) {}
      res.textContent = '🗣️ 지금 «아~» 하고 말해 보세요 (5초)' + (label ? ' · 사용 중인 마이크: ' + label : '');
      var peakMax = 0;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        testAc = new AC();
        if (testAc.state === 'suspended' && testAc.resume) testAc.resume();
        var an = testAc.createAnalyser(); an.fftSize = 1024;
        testAc.createMediaStreamSource(stream).connect(an);
        var buf = new Uint8Array(an.fftSize);
        var tick = function () {
          an.getByteTimeDomainData(buf);
          var p = 0;
          for (var i = 0; i < buf.length; i++) { var v = Math.abs(buf[i] - 128); if (v > p) p = v; }
          if (p > peakMax) peakMax = p;
          bar.style.width = Math.min(100, Math.round(p / 64 * 100)) + '%';
          testRaf = requestAnimationFrame(tick);
        };
        testRaf = requestAnimationFrame(tick);
      } catch (e) { peakMax = -1; }
      testTimer = setTimeout(function () {
        stopTest(); bar.style.width = '0'; btn.disabled = false; btn.textContent = '🎤 다시 테스트';
        if (peakMax < 0) { res.textContent = '✅ 마이크가 켜졌어요. 화면을 새로고침하고 다시 해 보세요.'; }
        else if (peakMax >= 12) {
          res.textContent = '✅ 소리가 잘 들어와요! 마이크는 정상이에요. 창을 닫고 다시 🎤 를 눌러 주세요.';
          lastProblem = null; unmarkPill(); setWhy(null);
        } else {
          res.textContent = '⚠️ 마이크는 켜졌는데 소리가 거의 안 들려요. 아래 순서 중 «입력 장치·볼륨» 확인을 해 주세요.';
          lastProblem = 'silent'; setWhy('silent');
        }
      }, 5000);
    }, function (err) {
      btn.disabled = false; btn.textContent = '🎤 다시 테스트';
      var k = kindOf(err && err.name);
      lastProblem = k; markPill(); setWhy(k);
      res.textContent = '❌ ' + (WHY[k] || WHY.other);
    });
  }

  function openManual(kind) {
    if (ov) return;
    ensureCss();
    if (alertBox) { alertBox.remove(); alertBox = null; }
    var tabs = ['pc', 'mac', 'android', 'ios', 'inapp'].map(function (k) {
      return '<button type="button" data-env="' + k + '">' + STEPS[k][0] + '</button>';
    }).join('');
    ov = el('div', { id: 'mgmh-ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': '마이크 인식 해결 방법' },
      '<div id="mgmh-box">' +
      '<button id="mgmh-x" type="button" aria-label="닫기">✕</button>' +
      '<h2>🎤 마이크 인식이 안 될 때</h2>' +
      '<div id="mgmh-why"></div>' +
      '<div id="mgmh-test"><b>1단계 · 마이크 테스트</b><div style="font-size:13px;color:#166534">버튼을 누르고 말해 보면 마이크가 소리를 듣는지 바로 알 수 있어요.</div>' +
      '<div id="mgmh-meter"><i></i></div><div id="mgmh-res"></div>' +
      '<button id="mgmh-run" type="button" class="mgmh-btn mgmh-pri" style="width:100%;margin-top:8px;background:#16a34a">🎤 마이크 테스트 시작</button></div>' +
      '<div style="margin-top:16px"><b>2단계 · 내 기기에 맞는 방법</b> <span style="font-size:13px;color:#6b7280">(지금 기기를 자동으로 골라 두었어요)</span></div>' +
      '<div id="mgmh-tabs">' + tabs + '</div>' +
      '<ol id="mgmh-steps"></ol>' +
      '<div style="margin-top:12px;font-size:13px;color:#6b7280">그래도 안 되면 키보드로 글을 써서 보낼 수도 있어요. 계속 안 되면 화면을 캡처해 상담 채널로 보내 주세요.</div>' +
      '<button type="button" class="mgmh-btn mgmh-sec" data-a="reload" style="width:100%;margin-top:12px">🔄 허용했어요 — 새로고침</button>' +
      '</div>');
    ov.addEventListener('click', function (e) {
      var t = e.target;
      if (t === ov || t.id === 'mgmh-x') return closeManual();
      if (t.id === 'mgmh-run') return runTest();
      var env = t.getAttribute && t.getAttribute('data-env');
      if (env) return renderSteps(env);
      if (t.getAttribute && t.getAttribute('data-a') === 'reload') { closeManual(); location.reload(); }
    });
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey, true);
    renderSteps(ENV);
    setWhy(kind || lastProblem);
  }
  window.mangoiMicHelp = function () { openManual(lastProblem); };

  if (document.body) mountPill();
  else document.addEventListener('DOMContentLoaded', mountPill);
})();
