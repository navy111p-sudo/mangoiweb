/* 📝 평가(1분 수업일지) 바로 보기 — 2026-09-30
 *
 * 왜 / Why
 *   「오늘 수업」 목록의 «지난 수업 평가 / 오늘 평가» 칸은 90자로 잘린 한 줄이라,
 *   대체강사가 «지난 수업에서 무엇을 했는지» 를 읽으려면 다른 화면을 찾아가야 했다
 *   (2026-09-30 매니저 제보: "can we immediately open … today's feedback and last class feedback?").
 *   ⛔ eval.html(학부모용)을 열어 주는 것으로는 안 된다 — 그 화면은 한국어 학부모용이라
 *      강사가 영어로 쓴 본문(note_en)을 한 줄도 안 그린다.
 *
 * 무엇을 / What
 *   window.mgEvalQuick(id, { en:true|false }) → 같은 화면 위에 창을 띄워
 *   GET /api/eval/:id(관리자·강사 세션 쿠키로 통과)의 전문을 그린다.
 *
 * ⚠️ 부르는 화면이 셋이다 — js/adm-today-classes.js · manager.html · teacher.html.
 *    manager.html·teacher.html 은 «첫 화면 외부 리소스 0개» 계약이라 이 파일을
 *    «처음 누를 때» 만 불러온다(첫 화면 비용 0). 판정을 화면마다 복제하지 말 것.
 * ⚠️ 이 파일을 고치면 부르는 세 곳의 «?v=» 를 «함께» 올릴 것 — 주소를 JS 가 만들어서
 *    asset_version_harness(HTML 의 <script src> 만 셈)가 못 잡는다. 셋이 같은지는
 *    test-harness/eval_quick_view_harness.mjs D-9 가 본다.
 * ⚠️ 이 창은 «보기» 만 한다 — 수정 API(PATCH /api/eval/:id)는 아직 없다(사람 결정 대기).
 */
(function () {
  'use strict';
  if (window.mgEvalQuick) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ymd(ms) {
    var n = Number(ms) || 0; if (!n) return '';
    return new Date(n + 9 * 3600000).toISOString().slice(0, 10);   // KST
  }
  // 📏 score_overall 은 «한 칸에 두 척도» — 수업일지 1~5, AI 리포트 0~100 (CLAUDE.md 2장).
  function maxOf(n) { return n > 5 ? 100 : 5; }

  var STYLE_ID = 'mg-evq-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent =
      '#mg-evq{position:fixed;inset:0;z-index:100010;background:rgba(15,23,42,.55);display:flex;'
      + 'align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 12px}'
      + '#mg-evq .evq-box{background:#ffffff;color:#101828;border-radius:14px;max-width:560px;width:100%;'
      + 'margin:auto;box-shadow:0 18px 50px rgba(0,0,0,.35);font-size:14px;line-height:1.55;box-sizing:border-box}'
      + '#mg-evq .evq-hd{padding:14px 16px;border-bottom:1px solid #e5e7eb;display:flex;gap:10px;align-items:flex-start}'
      + '#mg-evq .evq-ti{flex:1;min-width:0}'
      + '#mg-evq .evq-ti b{display:block;font-size:15px}'
      + '#mg-evq .evq-sub{color:#475467;font-size:12.5px}'
      + '#mg-evq .evq-x{background:#f1f5f9;color:#101828;border:1px solid #cbd5e1;border-radius:8px;'
      + 'padding:4px 10px;font-size:14px;cursor:pointer;flex:0 0 auto}'
      + '#mg-evq .evq-bd{padding:12px 16px}'
      + '#mg-evq .evq-sec{margin:0 0 12px}'
      + '#mg-evq .evq-lb{font-size:12px;font-weight:800;color:#475467;margin:0 0 3px}'
      + '#mg-evq .evq-tx{white-space:pre-wrap;word-break:break-word;background:#f8fafc;border:1px solid #e5e7eb;'
      + 'border-radius:8px;padding:8px 10px}'
      + '#mg-evq .evq-chips span{display:inline-block;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;'
      + 'border-radius:99px;padding:1px 9px;margin:0 4px 4px 0;font-size:12px}'
      + '#mg-evq .evq-ft{padding:10px 16px 14px;border-top:1px solid #e5e7eb;display:flex;gap:10px;'
      + 'justify-content:space-between;align-items:center;flex-wrap:wrap}'
      + '#mg-evq .evq-ft a{color:#1d4ed8;font-size:13px}'
      + '#mg-evq .evq-msg{padding:22px 16px;color:#475467}';
    document.head.appendChild(st);
  }

  function close() {
    var el = document.getElementById('mg-evq');
    if (el) el.parentNode.removeChild(el);
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function sec(label, text) {
    if (text == null || String(text).trim() === '') return '';
    return '<div class="evq-sec"><div class="evq-lb">' + esc(label) + '</div>'
      + '<div class="evq-tx">' + esc(String(text).trim()) + '</div></div>';
  }

  /** 행 하나 → 창 본문 HTML. 하니스가 이 함수를 오려 내 실제로 돌린다. */
  function renderEval(e, en) {
    var T = function (enS, koS) { return en ? enS : koS; };
    var n = Number(e.score_overall);
    var hasScore = e.score_overall != null && e.score_overall !== '' && isFinite(n);
    var date = String(e.lesson_date || '').slice(0, 10) || ymd(e.created_at);
    var sub = [date, e.teacher_name ? T('Teacher ', '강사 ') + e.teacher_name : '',
      hasScore ? '⭐ ' + n + '/' + maxOf(n) : ''].filter(Boolean).join(' · ');
    var chips = String(e.note_chips || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
    var body = ''
      + sec(T('Lesson', '수업'), e.lesson_title)
      + (chips.length ? '<div class="evq-sec"><div class="evq-lb">' + esc(T('Tags', '태그')) + '</div><div class="evq-chips">'
          + chips.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div></div>' : '')
      + sec(T('Teacher note (English)', '강사 메모 (영어)'), e.note_en)
      + sec(T('Sent to parents (Korean)', '학부모 안내 (한국어)'), e.note_ko)
      + sec(T('Strengths', '잘한 점'), e.strengths)
      + sec(T('To improve', '보완할 점'), e.improvements)
      + sec(T('Next goals', '다음 목표'), e.next_goals)
      + sec(T('Comment', '코멘트'), e.teacher_comment);
    if (!body) body = '<div class="evq-msg">' + esc(T('Only the score was saved — no written note.', '점수만 저장됐고 적힌 글은 없습니다.')) + '</div>';
    return '<div class="evq-hd"><div class="evq-ti"><b>📝 ' + esc(e.student_name || T('Class log', '수업일지')) + '</b>'
      + '<span class="evq-sub">' + esc(sub) + '</span></div>'
      + '<button type="button" class="evq-x" data-evq-close aria-label="' + esc(T('Close', '닫기')) + '">✕</button></div>'
      + '<div class="evq-bd">' + body + '</div>'
      + '<div class="evq-ft"><a href="/eval.html?id=' + encodeURIComponent(e.id) + '" target="_blank" rel="noopener">'
      + esc(T('Open the parent view ↗', '학부모 화면으로 보기 ↗')) + '</a>'
      + '<span class="evq-sub">' + esc(T('View only — editing is not available yet.', '보기 전용 — 수정은 아직 안 됩니다.')) + '</span></div>';
  }

  function show(html) {
    ensureStyle();
    var wrap = document.getElementById('mg-evq');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'mg-evq';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.addEventListener('click', function (ev) {
        if (ev.target === wrap || (ev.target.closest && ev.target.closest('[data-evq-close]'))) close();
      });
      document.body.appendChild(wrap);
      document.addEventListener('keydown', onKey, true);
    }
    wrap.innerHTML = '<div class="evq-box">' + html + '</div>';
  }

  var seq = 0;
  window.mgEvalQuick = function (id, opts) {
    var en = !!(opts && opts.en);
    var T = function (enS, koS) { return en ? enS : koS; };
    var n = parseInt(id, 10);
    if (!(n > 0)) return;
    var my = ++seq;
    var closeBtn = '<button type="button" class="evq-x" data-evq-close aria-label="' + esc(T('Close', '닫기')) + '">✕</button>';
    show('<div class="evq-hd"><div class="evq-ti"><b>📝 ' + esc(T('Class log', '수업일지')) + '</b></div>' + closeBtn + '</div>'
      + '<div class="evq-msg">' + esc(T('Loading…', '불러오는 중…')) + '</div>');
    fetch('/api/eval/' + n, { credentials: 'same-origin' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { st: r.status, d: d }; });
      })
      .then(function (x) {
        if (my !== seq || !document.getElementById('mg-evq')) return;   // 그 사이 닫았거나 다른 것을 열었다
        if (x.st === 200 && x.d && x.d.ok === true && x.d.eval) { show(renderEval(x.d.eval, en)); return; }
        var why = x.st === 401 ? T('Your login has expired — please log in again.', '로그인이 끊겼습니다 — 다시 로그인해 주세요.')
          : x.st === 404 ? T('This log was not found (it may have been deleted).', '이 일지를 찾지 못했습니다(지워졌을 수 있습니다).')
          : T('Could not load (HTTP ' + x.st + ').', '불러오지 못했습니다 (HTTP ' + x.st + ').');
        show('<div class="evq-hd"><div class="evq-ti"><b>📝 ' + esc(T('Class log', '수업일지')) + '</b></div>' + closeBtn + '</div>'
          + '<div class="evq-msg">⚠️ ' + esc(why) + '</div>');
      })
      .catch(function () {
        if (my !== seq || !document.getElementById('mg-evq')) return;
        show('<div class="evq-hd"><div class="evq-ti"><b>📝 ' + esc(T('Class log', '수업일지')) + '</b></div>' + closeBtn + '</div>'
          + '<div class="evq-msg">⚠️ ' + esc(T('Network problem — please try again.', '연결 문제로 못 불러왔습니다 — 다시 눌러 주세요.')) + '</div>');
      });
  };
  window.mgEvalQuick._render = renderEval;   // 하니스용
})();
