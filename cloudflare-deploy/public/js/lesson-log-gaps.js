/* ═══════════════════════════════════════════════════════════════════════════
   📒 일일 보고 누락 목록 — /admin/lesson-log-gaps.html          (2026-10-14 신설)

   [무엇] 그날 «끝난» 수업마다 1분 수업일지(학부모에게 가는 일일 보고)를 보고 둘로 가릅니다.
     · 미작성 — 수업은 끝났는데 강사가 일지를 안 썼다
     · 미확인 — 일지는 썼는데 학부모가 아직 안 열었다(student_evaluations.viewed_by_parent)
     (2026-10-14 사장님 결정: «둘 다» · 관리자 새 화면 · 기본은 어제 하루)

   [근거 — 새 판정을 만들지 않는다] 서버는 이미 있는 /api/admin/classes/today?date= 하나다.
     그 API 가 «그날 열린 수업»(반복·일회성·카페24·휴강·연기·그 주만 빠진 날)과
     «그 수업의 오늘 일지»(today_eval — 같은 방 번호, 없으면 그날 쓴 것)를 이미 정본으로 판정한다.
     ⛔ 여기서 수업 목록이나 일지 짝짓기를 다시 계산하지 마세요 — 매니저 «오늘 수업» 과 답이 갈립니다.
     이 화면이 하는 일은 그 줄을 «누락 / 미확인 / 완료 / 대상 아님» 으로 나누는 것뿐입니다(classifyLogGap).

   [대상 아님] 아직 안 끝난 수업(early·open·live) · 휴강 · 연기 — 일지가 없는 것이 정상입니다.
     ⚠️ 학생이 결석한 수업도 «미작성» 에 남깁니다(결석 기록도 일지로 남기는지는 사람이 판단) —
        대신 그 줄에 «학생 결석» 을 함께 적어 거를 수 있게 합니다.

   [모름] 지사·대리점은 서버가 일지를 아예 안 싣습니다(eval_hidden) → 지어내지 않고 «볼 수 없음» 이라고 말합니다.
     학부모 열람 칸이 없는 옛 행(viewed === null)도 «모름» 으로 따로 셉니다(«미확인» 으로 부풀리지 않음).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /** 한 줄을 가른다 — 순수 함수(test-harness/lesson_log_gaps_harness.mjs 가 그대로 돌린다).
   *  돌려주는 값: 'not_ended' · 'holiday' · 'postponed' · 'hidden' · 'missing' · 'unread' · 'unknown_view' · 'done' */
  function classifyLogGap(s) {
    if (!s || typeof s !== 'object') return 'not_ended';
    var st = String(s.status || '');
    if (st === 'holiday' || s.holiday === true) return 'holiday';
    if (st === 'postponed' || s.postponed === true) return 'postponed';
    if (st !== 'ended') return 'not_ended';          // early · open · live — 아직 쓸 때가 아님
    if (s.eval_hidden === true) return 'hidden';
    var ev = s.today_eval;
    if (!ev) return 'missing';
    if (ev.viewed === true) return 'done';
    if (ev.viewed === false) return 'unread';
    return 'unknown_view';                           // 칸이 없는 옛 행 — «안 열었다» 고 단정하지 않는다
  }

  /** 어제(KST) 'YYYY-MM-DD' — 기본 조회 날짜. */
  function kstYesterday(nowMs) {
    var k = new Date((Number(nowMs) || Date.now()) + 9 * 3600 * 1000 - 86400000);
    return k.toISOString().slice(0, 10);
  }

  /** 줄 묶음을 세어 요약한다(화면 맨 위 숫자). */
  function summarize(sessions) {
    var c = { total: 0, target: 0, missing: 0, unread: 0, unread_unsent: 0, unknown_view: 0, done: 0,
              hidden: 0, not_ended: 0, holiday: 0, postponed: 0 };
    (sessions || []).forEach(function (s) {
      c.total++;
      var k = classifyLogGap(s);
      c[k] = (c[k] || 0) + 1;
      if (k === 'missing' || k === 'unread' || k === 'unknown_view' || k === 'done') c.target++;
      if (k === 'unread' && s.today_eval && s.today_eval.notified === false) c.unread_unsent++;
    });
    return c;
  }

  // 하니스가 «이 파일을 그대로» 돌리게 내보낸다(브라우저에서는 window 에 붙을 뿐 해가 없다).
  var API = { classifyLogGap: classifyLogGap, kstYesterday: kstYesterday, summarize: summarize };
  if (typeof window !== 'undefined') window.__lessonLogGaps = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof document === 'undefined' || !document.getElementById('llg-root')) return;

  /* ── 화면 ─────────────────────────────────────────────────────────────── */
  // 언어 전환은 공용 🌐 버튼(adm-lang-boot.js 미니 토글 — 저장 후 새로고침)이 맡는다. 화면 자체 토글을 두지 않는다(두 개면 헷갈림).
  var LANG = (window.adminLang === 'en') ? 'en' : 'ko';
  function T(en, ko) { return LANG === 'en' ? en : ko; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function hm(ms) {
    if (!ms) return '';
    return new Date(Number(ms) + 9 * 3600 * 1000).toISOString().slice(11, 16);
  }
  function mdhm(ms) {
    if (!ms) return '';
    var s = new Date(Number(ms) + 9 * 3600 * 1000).toISOString();
    return s.slice(5, 10).replace('-', '/') + ' ' + s.slice(11, 16);
  }

  var $ = function (id) { return document.getElementById(id); };
  var state = { data: null, filter: 'gaps', loading: false, err: null };

  var LABEL = {
    missing:      function () { return T('Not written', '미작성'); },
    unread:       function () { return T('Parent not opened', '미확인'); },
    unknown_view: function () { return T('Opened? unknown', '열람 모름'); },
    done:         function () { return T('Parent opened', '확인 완료'); },
  };
  var ATT = {
    attended: ['Attended', '출석'], late: ['Late', '지각'], absent: ['Absent', '결석'],
    unknown: ['Unclear', '확인 불가'], cafe24: ['Cafe24', '카페24'], waiting: ['Waiting', '대기'],
    not_yet: ['Not yet', '시작 전'], postponed: ['Postponed', '연기'], holiday: ['Holiday', '휴강'],
  };

  function attText(a) {
    if (!a || !a.state) return '—';
    var p = ATT[a.state];
    var t = p ? T(p[0], p[1]) : a.state;
    if (a.state === 'late' && a.late_min != null) t += ' +' + a.late_min + T('m', '분');
    return t;
  }

  function rowHtml(s) {
    var k = classifyLogGap(s);
    var ev = s.today_eval;
    var who = '<b>' + esc(s.student_name || '—') + '</b>'
      + (s.student_uid ? '<div class="llg-dim">' + esc(s.student_uid) + '</div>' : '');
    var src = s.source === 'cafe24' ? ' <span class="llg-tag">' + esc(T('Cafe24', '카페24')) + '</span>' : '';
    var log;
    if (k === 'missing') {
      log = '<span class="llg-badge llg-missing">' + esc(LABEL.missing()) + '</span>';
      if (s.attendance && s.attendance.state === 'absent') {
        log += '<div class="llg-dim">' + esc(T('Student was absent', '학생 결석 수업')) + '</div>';
      }
    } else {
      log = '<span class="llg-ok">' + esc(T('Written', '작성')) + '</span>'
        + (ev && ev.date ? ' <span class="llg-dim">' + esc(ev.date) + '</span>' : '')
        + (ev && ev.score != null ? ' <span class="llg-dim">' + esc(ev.score) + '/' + esc(ev.max) + '</span>' : '');
    }
    var parent;
    if (k === 'missing') parent = '<span class="llg-dim">—</span>';
    else if (k === 'done') parent = '<span class="llg-badge llg-done">' + esc(LABEL.done()) + '</span>'
      + (ev && ev.viewed_at ? '<div class="llg-dim">' + esc(mdhm(ev.viewed_at)) + '</div>' : '');
    else if (k === 'unread') {
      parent = '<span class="llg-badge llg-unread">' + esc(LABEL.unread()) + '</span>';
      if (ev && ev.notified === false) parent += '<div class="llg-warn">' + esc(T('Not sent to parent', '학부모 발송 안 됨')) + '</div>';
      else if (ev && ev.notified === true) parent += '<div class="llg-dim">' + esc(T('Sent, not opened', '발송됨 · 아직 안 엶')) + '</div>';
    } else parent = '<span class="llg-badge llg-unknown">' + esc(LABEL.unknown_view()) + '</span>';
    return '<tr data-k="' + k + '">'
      + '<td class="llg-time">' + esc(s.start_time || hm(s.start_ts)) + '</td>'
      + '<td>' + who + src + '</td>'
      + '<td>' + esc(s.academy || '—') + '</td>'
      + '<td>' + esc(s.teacher_name || '—') + '</td>'
      + '<td>' + esc(attText(s.attendance)) + '</td>'
      + '<td>' + log + '</td>'
      + '<td>' + parent + '</td>'
      + '</tr>';
  }

  function render() {
    var root = $('llg-root');
    $('llg-title').textContent = T('Missing daily lesson logs', '일일 보고 누락 목록');
    $('llg-sub').textContent = T(
      'For each finished class: was the 1-minute lesson log written, and has the parent opened it?',
      '끝난 수업마다 1분 수업일지를 썼는지, 학부모가 열어 봤는지 봅니다.');
    $('llg-date-lab').textContent = T('Date', '날짜');
    $('llg-load').textContent = T('Show', '보기');

    if (state.loading) { root.innerHTML = '<p class="llg-dim">' + esc(T('Loading…', '불러오는 중…')) + '</p>'; return; }
    if (state.err) { root.innerHTML = '<p class="llg-err">' + esc(state.err) + '</p>'; return; }
    var d = state.data;
    if (!d) { root.innerHTML = ''; return; }
    var list = d.sessions || [];
    var c = summarize(list);

    var html = '';
    // 서버가 일지를 싣지 않는 계정(지사·대리점) — 판단할 근거가 없으니 그 사실을 말한다
    if (c.hidden > 0) {
      html += '<p class="llg-note">' + esc(T(
        'This account cannot see lesson logs (head office only), so missing/unread cannot be judged here.',
        '이 계정은 수업일지를 볼 수 없어(본사 전용) 누락·미확인을 판단할 수 없습니다.')) + '</p>';
    }
    if (d.holiday && d.holiday.closed) {
      html += '<p class="llg-note">' + esc(T('Public holiday', '공휴일 휴강')) + (d.holiday.name ? ' · ' + esc(d.holiday.name) : '')
        + ' — ' + esc(T(d.holiday.closed + ' classes closed', d.holiday.closed + '건 휴강')) + '</p>';
    }
    html += '<div class="llg-kpis">'
      + kpi('gaps', T('To check', '확인 필요'), c.missing + c.unread, 'llg-k-gap')
      + kpi('missing', T('Not written', '미작성'), c.missing, 'llg-k-miss')
      + kpi('unread', T('Parent not opened', '미확인'), c.unread, 'llg-k-unread')
      + kpi('done', T('Parent opened', '확인 완료'), c.done, 'llg-k-done')
      + kpi('all', T('Finished classes', '끝난 수업'), c.target, '')
      + '</div>';
    var extra = [];
    if (c.unread_unsent) extra.push(T('Not opened and never sent to the parent: ' + c.unread_unsent, '미확인 중 ' + c.unread_unsent + '건은 학부모에게 발송되지 않았습니다'));
    if (c.unknown_view) extra.push(T('Older logs with no «opened» record (unknown): ' + c.unknown_view, c.unknown_view + '건은 열람 기록 칸이 없는 옛 일지라 «모름» 입니다'));
    if (c.not_ended) extra.push(T('Not finished yet (not counted): ' + c.not_ended, c.not_ended + '건은 아직 안 끝난 수업이라 세지 않았습니다'));
    if (c.postponed) extra.push(T('Postponed (not counted): ' + c.postponed, c.postponed + '건은 연기되어 세지 않았습니다'));
    if (extra.length) html += '<ul class="llg-extra">' + extra.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';

    var rows = list.filter(function (s) {
      var k = classifyLogGap(s);
      if (state.filter === 'gaps') return k === 'missing' || k === 'unread';
      if (state.filter === 'all') return k === 'missing' || k === 'unread' || k === 'unknown_view' || k === 'done';
      return k === state.filter;
    });
    if (!rows.length) {
      html += '<p class="llg-empty">' + esc(state.filter === 'gaps' && c.target > 0
        ? T('No unwritten or unopened logs on this date.', '이 날짜에는 미작성·미확인 일지가 없습니다.')
        : (c.target === 0 ? T('No finished classes on this date.', '이 날짜에 끝난 수업이 없습니다.')
                          : T('No classes in this group.', '이 묶음에 해당하는 수업이 없습니다.'))) + '</p>';
    } else {
      html += '<div class="llg-scroll"><table class="llg-table"><thead><tr>'
        + '<th>' + esc(T('Time', '시각')) + '</th>'
        + '<th>' + esc(T('Student', '학생')) + '</th>'
        + '<th>' + esc(T('Academy', '학원')) + '</th>'
        + '<th>' + esc(T('Teacher', '강사')) + '</th>'
        + '<th>' + esc(T('Attendance', '출결')) + '</th>'
        + '<th>' + esc(T('Lesson log', '수업일지')) + '</th>'
        + '<th>' + esc(T('Parent', '학부모')) + '</th>'
        + '</tr></thead><tbody>' + rows.map(rowHtml).join('') + '</tbody></table></div>';
    }
    root.innerHTML = html;
  }

  function kpi(key, label, n, cls) {
    var on = state.filter === key ? ' llg-on' : '';
    return '<button type="button" class="llg-kpi ' + cls + on + '" data-f="' + key + '">'
      + '<span class="llg-n">' + n + '</span><span class="llg-l">' + esc(label) + '</span></button>';
  }

  function load() {
    var date = $('llg-date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    state.loading = true; state.err = null; render();
    try { history.replaceState(null, '', location.pathname + '?date=' + date); } catch (e) {}
    fetch('/api/admin/classes/today?date=' + encodeURIComponent(date), { credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (d) { return { r: r, d: d }; });
      })
      .then(function (x) {
        state.loading = false;
        // ✅ «성공이라고 말했는가» 로 판정 — 404·403 본문에는 ok 칸이 없을 수 있다(CLAUDE.md 2장 「새 API 추가」)
        if (!x.r.ok || !x.d || x.d.ok !== true || !Array.isArray(x.d.sessions)) {
          var code = x.d && x.d.error ? String(x.d.error) : ('HTTP ' + x.r.status);
          var who = x.d && x.d.who_line ? ' ' + x.d.who_line : '';
          state.err = T('Could not load the list (' + code + ').', '목록을 불러오지 못했습니다(' + code + ').') + who;
          state.data = null;
        } else state.data = x.d;
        render();
      })
      .catch(function () {
        state.loading = false;
        state.err = T('Network error — please try again.', '연결 오류 — 다시 시도해 주세요.');
        render();
      });
  }

  function boot() {
    var q = (location.search.match(/[?&]date=(\d{4}-\d{2}-\d{2})/) || [])[1];
    $('llg-date').value = q || kstYesterday(Date.now());
    $('llg-load').addEventListener('click', load);
    $('llg-date').addEventListener('change', load);
    $('llg-root').addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-f]') : null;
      if (!b) return;
      state.filter = b.getAttribute('data-f');
      render();
    });
    render();
    load();
  }
  boot();
})();
