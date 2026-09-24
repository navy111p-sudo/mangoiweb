/* 📋 수강신청 «이렇게 하세요» 안내 줄 (2026-09-24 사장님 지시)
 *
 *  관리자 › 학생 › 수강신청 카드의 「양식 받기 / 양식 등록」 두 카드 바로 위에
 *  4단계 안내(글) + 🔊 설명 듣기(브라우저 음성) + 🔇 음소거를 얹는다.
 *
 *  ✅ 음성은 «누를 때만» 나온다(자동재생 없음 — 사장님 결정). 직원이 하루에도 여러 번 여는
 *     화면이라 열 때마다 말하면 방해가 되고, 크롬도 사람이 누르기 전의 재생을 막는다.
 *  ✅ 목소리는 브라우저 음성(speechSynthesis). 서버 TTS 는 한국어가 깨진다(CLAUDE.md 2장).
 *  ✅ 음소거·접기 상태는 이 기기에 기억한다(localStorage — 실패해도 화면은 그대로).
 *  ✅ 한/영: window.adminLang 이 정본(adm-core.js). 토글 이벤트는 document 에서 발행되므로
 *     document·window 둘 다에서 듣는다(CLAUDE.md 2장 「mangoi:lang-changed 가 안 불림」).
 *  ⛔ 안내 문구에 data-ko/data-en 을 달지 않는다 — i18n 엔진이 textContent 를 통째로
 *     갈아끼워 안쪽 버튼·번호표가 사라진다. 언어가 바뀌면 이 파일이 직접 다시 그린다.
 *  ⛔ 「카톡도 양식을 다운받는다」로 쓰지 않는다 — 카톡 버튼은 파일이 아니라 «양식 글 복사» 다
 *     (adm-core.js copyEmptyEnrollmentTemplateKakao).
 *  ⛔ 「올리면 바로 등록」으로 쓰지 않는다 — 올리면 미리보기가 뜨고 「✅ N건 일괄 등록」을
 *     한 번 더 눌러야 등록·확정된다(adm-core.js _renderImportPreview).
 *  ⛔ 진한 배경(흰 글자)을 쓰지 않는다 — 관리자 밝기 보정(adm-s13 등)이 «어두운 면» 으로 보고
 *     글자색을 인라인 !important 로 덮는다(2026-09-24 실측: 🔊 버튼 대비 1.05). 밝은 바탕 + 진한 글자.
 *  ⛔ 상주 setInterval·MutationObserver 없음(홈을 멎게 한 전력). 메뉴를 옮기면 adm-ia6.js 가
 *     speechSynthesis.cancel() 로 소리를 끊는다.
 */
(function () {
  'use strict';
  if (window.__mgEnrollGuide) return;
  window.__mgEnrollGuide = true;

  var LS_MUTE = 'mangoi_enroll_guide_mute';
  var LS_FOLD = 'mangoi_enroll_guide_fold';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  function isEn() {
    try {
      if (window.adminLang === 'en') return true;
      if (window.adminLang === 'ko') return false;
      return localStorage.getItem('mangoi_lang') === 'en';
    } catch (e) { return false; }
  }

  var TEXT = {
    ko: {
      title: '수강신청 이렇게 하세요',
      steps: [
        ['수강신청 메뉴', '지금 이 화면'],
        ['양식 받기', '엑셀·워드·카톡 중 하나'],
        ['작성하기', '학원·학부모님이 작성'],
        ['양식 등록', '올리고 «일괄 등록» 누르기']
      ],
      done: '학생 수업 자동 등록',
      note: '📊 엑셀·📄 워드는 파일로 받고, 📱 카톡은 양식 글이 복사됩니다. 작성한 파일은 오른쪽 «파일» 칸에, 카톡 답장은 «카톡» 칸에 붙여 넣고 [등록] → 미리보기에서 [✅ 일괄 등록]을 누르면 끝입니다.',
      play: '🔊 설명 듣기', stop: '⏹ 멈추기',
      mute: '🔇 음소거', unmute: '🔈 음소거 해제',
      muted: '음소거 중', noVoice: '이 브라우저는 음성 설명을 지원하지 않아요',
      fold: '접기', unfold: '펼치기',
      speech: [
        '수강신청은 네 단계면 됩니다.',
        '첫째, 지금 보고 계신 수강신청 메뉴로 들어옵니다.',
        '둘째, 아래 양식 받기에서 엑셀, 워드, 카톡 중 편한 것 하나를 고릅니다. 엑셀과 워드는 파일로 받고, 카톡은 양식 글이 복사됩니다.',
        '셋째, 학원이나 학부모님이 양식을 작성합니다.',
        '넷째, 작성한 파일은 오른쪽 양식 등록의 파일 칸에 올리고, 카톡 답장은 카톡 칸에 붙여 넣은 뒤 등록을 누릅니다.',
        '미리보기가 뜨면 일괄 등록 버튼을 한 번 더 눌러 주세요. 그러면 학생 수업이 자동으로 등록됩니다.'
      ]
    },
    en: {
      title: 'How to register classes',
      steps: [
        ['Enrollment menu', 'this screen'],
        ['Download a form', 'Excel, Word or KakaoTalk'],
        ['Fill it in', 'by the academy or parent'],
        ['Upload the form', 'then press «Register all»']
      ],
      done: 'Classes are registered',
      note: '📊 Excel and 📄 Word download a file; 📱 KakaoTalk copies the form text. Put the filled file in the «File» box on the right, or paste the KakaoTalk reply in the «KakaoTalk» box, press [Upload], then press [✅ Register all] in the preview.',
      play: '🔊 Listen', stop: '⏹ Stop',
      mute: '🔇 Mute', unmute: '🔈 Unmute',
      muted: 'Muted', noVoice: 'Voice guide is not supported in this browser',
      fold: 'Hide', unfold: 'Show',
      speech: [
        'Registering classes takes four steps.',
        'First, open this Enrollment menu.',
        'Second, under Download a form, pick Excel, Word, or KakaoTalk. Excel and Word download a file, and KakaoTalk copies the form text.',
        'Third, the academy or the parent fills in the form.',
        'Fourth, upload the filled file in the File box on the right, or paste the KakaoTalk reply in the KakaoTalk box, and press Upload.',
        'When the preview appears, press Register all once more. The classes are then registered automatically.'
      ]
    }
  };

  function T() { return isEn() ? TEXT.en : TEXT.ko; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  /* ── 음성 ─────────────────────────────────────────────── */
  var synth = window.speechSynthesis || null;
  var speaking = false;
  var seq = 0;

  function pickVoice(lang) {
    try {
      var vs = synth.getVoices() || [];
      var want = lang.toLowerCase();
      for (var i = 0; i < vs.length; i++) if ((vs[i].lang || '').toLowerCase() === want) return vs[i];
      var pre = want.slice(0, 2);
      for (var j = 0; j < vs.length; j++) if ((vs[j].lang || '').toLowerCase().indexOf(pre) === 0) return vs[j];
    } catch (e) {}
    return null;
  }

  function stop() {
    seq++;
    speaking = false;
    try { if (synth) synth.cancel(); } catch (e) {}
    paint();
  }

  function play() {
    if (!synth || lsGet(LS_MUTE) === '1') return;
    stop();
    var my = ++seq;
    var t = T();
    var lang = isEn() ? 'en-US' : 'ko-KR';
    var voice = pickVoice(lang);
    // 크롬은 긴 발화를 15초 안팎에서 끊는다 → 문장 단위로 이어 읽는다
    var lines = t.speech.slice();
    speaking = true;
    paint();
    function next() {
      if (my !== seq) return;
      if (!lines.length) { speaking = false; paint(); return; }
      var u = new SpeechSynthesisUtterance(lines.shift());
      u.lang = lang;
      if (voice) u.voice = voice;
      u.rate = 1;
      u.onend = next;
      u.onerror = function () { if (my === seq) { speaking = false; paint(); } };
      try { synth.speak(u); } catch (e) { speaking = false; paint(); }
    }
    try { synth.resume(); } catch (e) {}
    next();
  }

  /* ── 화면 ─────────────────────────────────────────────── */
  var root = null;

  function paint() {
    if (!root) return;
    var t = T();
    var muted = lsGet(LS_MUTE) === '1';
    var folded = lsGet(LS_FOLD) === '1';
    var steps = t.steps.map(function (s, i) {
      return '<div class="eg-step"><span class="eg-num">' + (i + 1) + '</span>' +
        '<span class="eg-sname">' + esc(s[0]) + '</span><span class="eg-shint">' + esc(s[1]) + '</span></div>' +
        '<span class="eg-arrow" aria-hidden="true">→</span>';
    }).join('') +
      '<div class="eg-step eg-done"><span class="eg-num">✓</span><span class="eg-sname">' + esc(t.done) + '</span></div>';

    var voiceBtns = synth
      ? '<button type="button" class="eg-btn eg-play" data-eg="play"' + (muted ? ' disabled' : '') + '>' +
          esc(muted ? t.muted : (speaking ? t.stop : t.play)) + '</button>' +
        '<button type="button" class="eg-btn eg-mute" data-eg="mute" aria-pressed="' + (muted ? 'true' : 'false') + '">' +
          esc(muted ? t.unmute : t.mute) + '</button>'
      : '<span class="eg-novoice">' + esc(t.noVoice) + '</span>';

    root.innerHTML =
      '<div class="eg-head">' +
        '<span class="eg-title">📋 ' + esc(t.title) + '</span>' +
        '<span class="eg-tools">' + voiceBtns +
          '<button type="button" class="eg-btn eg-fold" data-eg="fold" aria-expanded="' + (folded ? 'false' : 'true') + '">' +
            esc(folded ? t.unfold : t.fold) + '</button>' +
        '</span>' +
      '</div>' +
      (folded ? '' : '<div class="eg-steps">' + steps + '</div><div class="eg-note">' + esc(t.note) + '</div>');
    paintBadges();
  }

  // 두 카드 제목 앞에 ②·④ 번호표 — 제목 div 는 data-ko 가 달려 있어 그 «안» 에 넣으면
  // 언어 토글 때 지워진다. 그래서 머리줄(.enroll-bulk-head)의 맨 앞 «형제» 로 넣는다.
  function paintBadges() {
    var bulk = root && root.parentNode;
    if (!bulk) return;
    [['.enroll-bulk-download', '2'], ['.enroll-bulk-upload', '4']].forEach(function (p) {
      var head = bulk.querySelector(p[0] + ' .enroll-bulk-head');
      if (!head || head.querySelector('.eg-badge')) return;
      var b = document.createElement('span');
      b.className = 'eg-badge';
      b.setAttribute('aria-hidden', 'true');
      b.textContent = p[1];
      head.insertBefore(b, head.firstChild);
    });
  }

  function onClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-eg]') : null;
    if (!b || !root || !root.contains(b)) return;
    e.preventDefault();
    var k = b.getAttribute('data-eg');
    if (k === 'play') { if (speaking) stop(); else play(); }
    else if (k === 'mute') {
      if (lsGet(LS_MUTE) === '1') lsSet(LS_MUTE, null);
      else { lsSet(LS_MUTE, '1'); stop(); }
      paint();
    } else if (k === 'fold') {
      lsSet(LS_FOLD, lsGet(LS_FOLD) === '1' ? null : '1');
      paint();
    }
  }

  var CSS =
    '#card-enrollments #en-guide{margin:14px 0 0;padding:12px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:12px;color:#14532d;font-size:13px;line-height:1.5}' +
    '#card-enrollments #en-guide .eg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}' +
    '#card-enrollments #en-guide .eg-title{font-weight:800;font-size:14px;color:#14532d}' +
    '#card-enrollments #en-guide .eg-tools{display:flex;gap:6px;flex-wrap:wrap}' +
    '#card-enrollments #en-guide button.eg-btn{box-sizing:border-box;min-height:32px;padding:5px 12px !important;font-size:12.5px !important;font-weight:700;border-radius:999px !important;border:1px solid #16a34a !important;background:#ffffff !important;background-image:none !important;color:#166534 !important;box-shadow:none !important;cursor:pointer;transform:none !important;width:auto !important}' +
    '#card-enrollments #en-guide button.eg-btn:hover{background:#dcfce7 !important}' +
    '#card-enrollments #en-guide button.eg-play{background:#dcfce7 !important;border:2px solid #15803d !important;color:#14532d !important}' +
    '#card-enrollments #en-guide button.eg-play:hover{background:#bbf7d0 !important}' +
    '#card-enrollments #en-guide button.eg-play[disabled]{background:#e5e7eb !important;border-color:#d1d5db !important;color:#4b5563 !important;cursor:not-allowed}' +
    '#card-enrollments #en-guide .eg-novoice{font-size:12px;color:#4b5563}' +
    '#card-enrollments #en-guide .eg-steps{display:flex;align-items:stretch;gap:6px;flex-wrap:wrap;margin-top:10px}' +
    '#card-enrollments #en-guide .eg-step{display:block;padding:7px 10px;background:#ffffff;border:1px solid #bbf7d0;border-radius:10px;min-width:0}' +
    '#card-enrollments #en-guide .eg-num{display:inline-block;min-width:20px;height:20px;line-height:18px;text-align:center;border-radius:999px;background:#dcfce7;border:1px solid #15803d;color:#14532d;font-weight:800;font-size:12px;margin-right:6px}' +
    '#card-enrollments #en-guide .eg-sname{font-weight:800;color:#14532d}' +
    '#card-enrollments #en-guide .eg-shint{display:block;font-size:11.5px;color:#374151;margin-top:1px}' +
    '#card-enrollments #en-guide .eg-done{background:#dcfce7;border-color:#16a34a}' +
    '#card-enrollments #en-guide .eg-arrow{align-self:center;color:#16a34a;font-weight:800}' +
    '#card-enrollments #en-guide .eg-note{margin-top:8px;font-size:12.5px;color:#1f2937}' +
    '#card-enrollments .enroll-bulk-head .eg-badge{display:inline-block;flex:0 0 auto;min-width:22px;height:22px;line-height:20px;text-align:center;border-radius:999px;background:#dcfce7;border:1px solid #15803d;color:#14532d;font-weight:800;font-size:12px;margin-right:6px}' +
    '@media (max-width:640px){#card-enrollments #en-guide .eg-arrow{display:none}#card-enrollments #en-guide .eg-step{flex:1 1 100%}}';

  function boot() {
    var bulk = document.querySelector('#card-enrollments .enroll-bulk');
    if (!bulk || document.getElementById('en-guide')) return;
    // admin-inline-c.css 가 <body> 안에서 링크되므로 우리 규칙도 body 끝에 둔다(CLAUDE.md 2장).
    var st = document.createElement('style');
    st.id = 'en-guide-style';
    st.textContent = CSS;
    document.body.appendChild(st);

    root = document.createElement('div');
    root.id = 'en-guide';
    root.setAttribute('role', 'region');
    bulk.insertBefore(root, bulk.firstChild);
    root.addEventListener('click', onClick);
    paint();

    function relang() { stop(); }
    document.addEventListener('mangoi:lang-changed', relang);
    window.addEventListener('mangoi:lang-changed', relang);
    // 탭을 떠나면 끊는다(메뉴 이동은 adm-ia6.js 가 이미 끊는다)
    document.addEventListener('visibilitychange', function () { if (document.hidden && speaking) stop(); });
    window.addEventListener('pagehide', function () { if (speaking) stop(); });
    if (synth) { try { synth.getVoices(); } catch (e) {} }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
