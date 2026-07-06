/* ============================================================
   teacher-feedback.js — 교사 수업 종료 직후 AI 코칭 카드 (한/영 토글)
   학생용 flow.js 오버레이와 같은 톤(다크 네이비 + 시안).
   · 크기는 CSS(clamp+vw)로만 결정 → 데스크탑 약 2배 / 모바일 화면 94% 폭 + 글자 확대.
     (JS innerWidth 측정에 의존하지 않아 어떤 환경에서도 안정)

   사용:
     MangoTeacherFeedback.show({
       room_id, teacher_uid, teacher_name, student_name,
       lang:'en'|'ko', signals:{talk_ratio,praise_count,engagement,duration_min},
       transcript, recording_id, recording_url, reportUrl
     });
     MangoTeacherFeedback.demo('en'|'ko');   // 네트워크 없이 샘플 렌더(확인용)
   ============================================================ */
(function (w, d) {
  if (w.MangoTeacherFeedback) return;

  var DEFAULT_LANG = 'en'; // 교사 대상 → 기본 영어(원어민). opts.lang 로 덮어씀
  var current = { lang: DEFAULT_LANG, data: null, reportUrl: '/teacher-report.html' };

  // 카드 기본 글자크기(1em) = clamp(14px..26px) → 모바일 약 1.08배, 데스크탑 약 2배.
  // 아래 모든 치수는 이 1em 기준의 em 값. E(px) = 기존 px 값을 그대로 em 으로 환산(기준 13px).
  var BASE_FONT = 'clamp(15.5px, 2.3vw, 26px)';
  function E(px) { return (Math.round(px / 13 * 1000) / 1000) + 'em'; }

  var L = {
    ko: {
      title: '🤖 오늘 수업 AI 코칭',
      sub: function (s, m) { return '✅ ' + (s ? s + '님과의 수업' : '수업') + ' 완료' + (m ? ' · ' + m + '분' : ''); },
      m1: '😊 참여도', m2: '🎙️ 발화비율', m3: '❤️ 칭찬',
      eng: { good: '좋음', fair: '보통', low: '낮음' },
      talk: function (n) { return '교사 ' + n + '%'; }, praise: function (n) { return n + '회'; },
      goodh: '👍 잘하신 점', imph: '💡 다음엔 이렇게', acth: '🎯 다음 수업 실천 1가지',
      b1: '📄 전체 리포트', b2: '확인했어요',
      foot: '🔒 선생님에게만 보이는 코칭용 · 관리자에겐 월 누적만 공유',
      loading: '오늘 수업을 살펴보는 중…', err: '피드백을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
    },
    en: {
      title: '🤖 Today’s AI coaching',
      sub: function (s, m) { return '✅ Class' + (s ? ' with ' + s : '') + ' complete' + (m ? ' · ' + m + ' min' : ''); },
      m1: '😊 Engagement', m2: '🎙️ Talk ratio', m3: '❤️ Praise',
      eng: { good: 'Good', fair: 'Fair', low: 'Low' },
      talk: function (n) { return 'Teacher ' + n + '%'; }, praise: function (n) { return n + '×'; },
      goodh: '👍 What went well', imph: '💡 Try next time', acth: '🎯 One thing to try next class',
      b1: '📄 Full report', b2: 'Got it',
      foot: '🔒 Private coaching for you only · admins see monthly totals only',
      loading: 'Reviewing today’s lesson…', err: 'Could not load your feedback. Please try again shortly.'
    }
  };

  function topWin() { try { return (w.top && w.top !== w.self) ? w.top : w; } catch (_) { return w; } }
  function doc() { return topWin().document; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function close() {
    var el = doc().getElementById('mango-tf-overlay');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function shell(inner) {
    var dd = doc();
    close();
    var ov = dd.createElement('div');
    ov.id = 'mango-tf-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:rgba(2,6,23,.82);' +
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;' +
      'padding:clamp(8px,2vw,24px);font-family:"Noto Sans KR",-apple-system,sans-serif;animation:mgTfFade .25s ease-out';
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.innerHTML = inner;
    dd.body.appendChild(ov);
    if (!dd.getElementById('mango-tf-style')) {
      var st = dd.createElement('style'); st.id = 'mango-tf-style';
      st.textContent = '@keyframes mgTfFade{from{opacity:0}to{opacity:1}}.mg-tf-btn:active{transform:scale(.98)}' +
        '#mango-tf-overlay ::-webkit-scrollbar{width:8px}#mango-tf-overlay ::-webkit-scrollbar-thumb{background:#334155;border-radius:8px}';
      dd.head.appendChild(st);
    }
    return ov;
  }

  // 카드: 폭 = min(94vw, 760px) → 모바일 화면 94% / 데스크탑 최대 760px(약 2배). 글자 1em = BASE_FONT.
  //   flex-shrink:0 로 flex 컨테이너(오버레이) 안에서 찌부러지지 않게 고정.
  function card(html) {
    return '<div style="width:min(94vw,760px);flex:0 0 auto;box-sizing:border-box;max-height:94vh;overflow-y:auto;font-size:' + BASE_FONT + ';' +
      'background:#0b1220;border:1px solid #1e293b;border-radius:' + E(22) + ';padding:' + E(18) + ' ' + E(18) + ' ' + E(20) + ';' +
      'box-shadow:0 30px 80px -12px rgba(0,0,0,.75)">' + html + '</div>';
  }

  function loading(lang) {
    shell(card(
      '<div style="text-align:center;padding:' + E(26) + ' ' + E(8) + ';color:#e2e8f0">' +
      '<div style="font-size:' + E(34) + ';margin-bottom:' + E(12) + '">🤖</div>' +
      '<div style="font-size:' + E(15) + ';font-weight:700">' + esc(L[lang].loading) + '</div>' +
      '<div style="margin-top:' + E(14) + ';height:' + E(4) + ';border-radius:' + E(4) + ';background:#1e293b;overflow:hidden">' +
      '<div style="width:40%;height:100%;background:#38bdf8;border-radius:' + E(4) + ';animation:mgTfFade 1s infinite alternate"></div></div>' +
      '</div>'
    ));
  }

  function metricChip(label, value, tone) {
    var c = tone === 'warn'
      ? { bg: 'rgba(234,179,8,.15)', bd: 'rgba(234,179,8,.45)', l: '#fde047', v: '#fef08a' }
      : tone === 'bad'
      ? { bg: 'rgba(239,68,68,.15)', bd: 'rgba(239,68,68,.45)', l: '#fca5a5', v: '#fecaca' }
      : { bg: 'rgba(34,197,94,.14)', bd: 'rgba(34,197,94,.4)', l: '#86efac', v: '#bbf7d0' };
    return '<div style="flex:1;text-align:center;background:' + c.bg + ';border:1px solid ' + c.bd + ';border-radius:' + E(12) + ';padding:' + E(9) + ' ' + E(4) + '">' +
      '<div style="font-size:' + E(11.5) + ';color:' + c.l + ';font-weight:700">' + esc(label) + '</div>' +
      '<div style="font-size:' + E(13) + ';color:' + c.v + ';font-weight:800;margin-top:' + E(2) + '">' + esc(value) + '</div></div>';
  }

  function render(lang) {
    var t = L[lang], data = current.data;
    var fb = (lang === 'ko' ? data.feedback_ko : data.feedback_en) || data.feedback_en || data.feedback_ko || { good: [], improve: '', action: '' };
    var mt = data.metrics || {};
    var chips = '';
    chips += metricChip(t.m1, (t.eng[mt.engagement] || t.eng.good), (mt.engagement === 'low' ? 'bad' : mt.engagement === 'fair' ? 'warn' : 'ok'));
    if (mt.talk_ratio != null) chips += metricChip(t.m2, t.talk(Math.round(mt.talk_ratio)), (mt.talk_ratio > 60 ? 'warn' : 'ok'));
    if (mt.praise_count != null) chips += metricChip(t.m3, t.praise(mt.praise_count), 'ok');

    var goodLines = (fb.good || []).map(function (g) {
      return '<div style="font-size:' + E(12.5) + ';color:#cbd5e1;line-height:1.65;margin-bottom:' + E(5) + '">· ' + esc(g) + '</div>';
    }).join('');

    var tabOn = 'background:#38bdf8;color:#08213a;', tabOff = 'background:transparent;color:#94a3b8;';
    var tabBase = 'flex:1;border:0;border-radius:' + E(9) + ';padding:' + E(7) + ';font-size:' + E(12.5) + ';font-weight:800;font-family:inherit;cursor:pointer;';
    var html =
      '<div style="display:flex;gap:0;margin-bottom:' + E(14) + ';background:rgba(30,41,59,.6);border-radius:' + E(11) + ';padding:' + E(3) + '">' +
        '<button class="mg-tf-btn" data-lang="ko" style="' + tabBase + (lang === 'ko' ? tabOn : tabOff) + '">🇰🇷 한국어</button>' +
        '<button class="mg-tf-btn" data-lang="en" style="' + tabBase + (lang === 'en' ? tabOn : tabOff) + '">🇺🇸 English</button>' +
      '</div>' +
      '<div style="text-align:center;margin-bottom:' + E(14) + '">' +
        '<div style="font-size:' + E(12.5) + ';color:#94a3b8;font-weight:700;margin-bottom:' + E(5) + '">' + esc(t.sub(data.student_name, data.duration_min)) + '</div>' +
        '<div style="font-size:' + E(19) + ';font-weight:800;color:#f8fafc">' + esc(t.title) + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:' + E(7) + ';margin-bottom:' + E(14) + '">' + chips + '</div>' +
      '<div style="background:rgba(30,41,59,.55);border-radius:' + E(14) + ';padding:' + E(13) + ' ' + E(14) + ';margin-bottom:' + E(10) + '">' +
        '<div style="font-size:' + E(13) + ';font-weight:800;color:#4ade80;margin-bottom:' + E(7) + '">' + esc(t.goodh) + '</div>' + goodLines +
      '</div>' +
      '<div style="background:rgba(30,41,59,.55);border-radius:' + E(14) + ';padding:' + E(13) + ' ' + E(14) + ';margin-bottom:' + E(10) + '">' +
        '<div style="font-size:' + E(13) + ';font-weight:800;color:#fbbf24;margin-bottom:' + E(7) + '">' + esc(t.imph) + '</div>' +
        '<div style="font-size:' + E(12.5) + ';color:#cbd5e1;line-height:1.65">' + esc(fb.improve) + '</div>' +
      '</div>' +
      '<div style="background:linear-gradient(135deg,rgba(56,189,248,.14),rgba(37,99,235,.18));border:1px solid rgba(56,189,248,.4);border-radius:' + E(14) + ';padding:' + E(12) + ' ' + E(14) + ';margin-bottom:' + E(16) + '">' +
        '<div style="font-size:' + E(12.5) + ';color:#7dd3fc;font-weight:800;margin-bottom:' + E(4) + '">' + esc(t.acth) + '</div>' +
        '<div style="font-size:' + E(12.5) + ';color:#e0f2fe;line-height:1.6">' + esc(fb.action) + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:' + E(9) + '">' +
        '<button class="mg-tf-btn" data-act="report" style="flex:1;background:rgba(30,41,59,.8);color:#e2e8f0;border:1px solid #334155;border-radius:' + E(13) + ';padding:' + E(13) + ';font-size:' + E(14) + ';font-weight:700;font-family:inherit;cursor:pointer">' + esc(t.b1) + '</button>' +
        '<button class="mg-tf-btn" data-act="close" style="flex:1;background:#38bdf8;color:#08213a;border:0;border-radius:' + E(13) + ';padding:' + E(13) + ';font-size:' + E(14) + ';font-weight:800;font-family:inherit;cursor:pointer">' + esc(t.b2) + '</button>' +
      '</div>' +
      '<div style="text-align:center;margin-top:' + E(12) + ';font-size:' + E(11) + ';color:#64748b">' + esc(t.foot) + '</div>';

    var ov = shell(card(html));
    [].forEach.call(ov.querySelectorAll('.mg-tf-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var lg = btn.getAttribute('data-lang');
        if (lg) { current.lang = lg; render(lg); return; }
        var act = btn.getAttribute('data-act');
        if (act === 'close') close();
        else if (act === 'report') {
          var dq = current.data || {};
          var q = [];
          if (dq.room_id) q.push('room_id=' + encodeURIComponent(dq.room_id));
          if (dq.teacher_uid) q.push('teacher_uid=' + encodeURIComponent(dq.teacher_uid));
          if (dq.teacher_name) q.push('teacher_name=' + encodeURIComponent(dq.teacher_name));
          q.push('lang=' + current.lang);
          var url = current.reportUrl + (current.reportUrl.indexOf('?') > -1 ? '&' : '?') + q.join('&');
          try { topWin().location.href = url; } catch (_) { close(); }
        }
      });
    });
  }

  function errorBox(lang) {
    shell(card(
      '<div style="text-align:center;padding:' + E(22) + ' ' + E(10) + ';color:#e2e8f0">' +
      '<div style="font-size:' + E(34) + ';margin-bottom:' + E(10) + '">😥</div>' +
      '<div style="font-size:' + E(14) + ';color:#cbd5e1;margin-bottom:' + E(16) + '">' + esc(L[lang].err) + '</div>' +
      '<button class="mg-tf-btn" onclick="MangoTeacherFeedback.close()" style="background:#334155;color:#e2e8f0;border:0;border-radius:' + E(11) + ';padding:' + E(11) + ' ' + E(22) + ';font-size:' + E(14) + ';font-weight:700;cursor:pointer">닫기 / Close</button>' +
      '</div>'
    ));
  }

  function show(opts) {
    opts = opts || {};
    var lang = (opts.lang === 'ko' || opts.lang === 'en') ? opts.lang : DEFAULT_LANG;
    current.lang = lang;
    current.reportUrl = opts.reportUrl || '/teacher-report.html';
    if (!opts.room_id) { console.warn('[MangoTeacherFeedback] room_id required'); return; }
    loading(lang);
    fetch('/api/ai-feedback/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: opts.room_id, teacher_uid: opts.teacher_uid, teacher_name: opts.teacher_name,
        student_name: opts.student_name, signals: opts.signals, transcript: opts.transcript,
        recording_id: opts.recording_id, recording_url: opts.recording_url
      })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.ok) { errorBox(lang); return; }
      current.data = res;
      render(current.lang);
    }).catch(function () { errorBox(lang); });
  }

  // 네트워크 없이 샘플 렌더 — 붙이기 전 눈으로 확인용
  function demo(lang) {
    current.reportUrl = '/teacher-report.html';
    current.lang = (lang === 'ko') ? 'ko' : DEFAULT_LANG;
    current.data = {
      student_name: '민준', duration_min: 25,
      metrics: { engagement: 'good', talk_ratio: 68, praise_count: 7 },
      feedback_ko: {
        good: ['07:12 민준이가 막혔을 때 3초 기다려 스스로 답하게 유도한 점이 아주 좋았어요.', '“Good job, Minjun!” 등 즉각적인 칭찬으로 아이가 끝까지 편하게 말했어요.'],
        improve: '교사 발화가 68%로 조금 많았어요. “Why do you think so?” 같은 열린 질문을 3번만 더 던지면 민준이가 말할 틈이 생겨요.',
        action: '질문 후 5초간 기다려 아이가 먼저 답하게 해보기'
      },
      feedback_en: {
        good: ['At 07:12 you waited 3 seconds when Minjun got stuck and let him answer on his own — really nice.', 'Quick praise like “Good job, Minjun!” kept him speaking comfortably to the end.'],
        improve: 'Your talk time was a bit high at 68%. Just 3 more open questions like “Why do you think so?” will give Minjun room to speak.',
        action: 'After asking a question, wait 5 seconds so the child answers first.'
      }
    };
    render(current.lang);
  }

  w.MangoTeacherFeedback = { show: show, demo: demo, close: close };
})(window, document);
