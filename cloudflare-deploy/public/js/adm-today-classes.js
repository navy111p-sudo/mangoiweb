/* adm-today-classes.js — 🚪 오늘 수업 (매니저 바로 입장)  2026-07-23
 *
 * 매니저 피드백: "오늘의 수업에는 매니저가 수업에 들어가는 기능이 없다.
 *   강사가 못 들어오면 매니저가 최대한 빨리 대신 맡아야 하는데, 지금은 강의실 ID 를
 *   일일이 찾아야 해서 시간이 걸린다."
 *
 * - 데이터: GET /api/admin/classes/today (오늘 열리는 수업 전체 + 결정론 room_id)
 * - [🚪 입장] = 참관이 아니라 '실제 참가자'로 새 창 입장 (강사 대체 목적)
 * - [👁 참관] = 학생·강사 모르게 보기 (기존 수업 관찰 카드로 넘김)
 * - 진행 중인 수업이 위로 오도록 정렬해, 급할 때 맨 위만 보면 되게 한다.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function isEn() {
    try { return localStorage.getItem('adminLang') === 'en'; } catch (e) { return false; }
  }
  function T(ko, en) { return isEn() ? en : ko; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 상태 뱃지 — 매니저가 한눈에 우선순위를 잡을 수 있게 색을 나눈다 */
  var BADGE = {
    live:  { ko: '🔴 진행중',   en: '🔴 Live',     bg: 'rgba(239,68,68,0.16)',  fg: '#b91c1c', bd: 'rgba(239,68,68,0.45)' },
    open:  { ko: '🟢 입장가능', en: '🟢 Open',     bg: 'rgba(16,185,129,0.16)', fg: '#047857', bd: 'rgba(16,185,129,0.45)' },
    early: { ko: '⏳ 예정',     en: '⏳ Upcoming', bg: 'rgba(148,163,184,0.18)', fg: '#475569', bd: 'rgba(148,163,184,0.45)' },
    ended: { ko: '✔ 종료',      en: '✔ Ended',    bg: 'rgba(148,163,184,0.12)', fg: '#94a3b8', bd: 'rgba(148,163,184,0.3)' }
  };

  function badge(status) {
    var b = BADGE[status] || BADGE.early;
    return '<span style="display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:800;'
      + 'background:' + b.bg + ';color:' + b.fg + ';border:1px solid ' + b.bd + '">'
      + (isEn() ? b.en : b.ko) + '</span>';
  }

  function hhmm(ts) {
    try {
      return new Date(ts).toLocaleTimeString('ko-KR', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul'
      });
    } catch (e) { return '-'; }
  }

  /* 🚪 실제 참가자로 입장 — 강사가 못 들어왔을 때 매니저가 대신 맡는 용도.
     참관(ghost)과 달리 학생에게 보이므로, 오해가 없도록 반드시 한 번 확인받는다. */
  window.tcEnterClass = function (roomId, who) {
    var msg = T(
      '수업에 직접 입장할까요?\n\n강의실: ' + roomId + '\n학생: ' + (who || '-') +
        '\n\n※ 참관이 아니라 실제 참가자로 들어갑니다. 학생·강사에게 보입니다.',
      'Join this class as a participant?\n\nRoom: ' + roomId + '\nStudent: ' + (who || '-') +
        '\n\nNote: this is NOT silent observation — students and the teacher will see you.'
    );
    if (!confirm(msg)) return;
    var url = location.origin + '/?vc_autojoin=1&vc_role=teacher&vc_room=' + encodeURIComponent(roomId);
    /* 팝업이 막히면 안내 링크를 띄운다 — 그냥 window.open 만 하면 조용히 실패한다 (adm-core.js 공통) */
    if (window.mangoiOpenTab) window.mangoiOpenTab(url, T('수업 입장', 'Enter class'));
    else window.open(url, '_blank', 'noopener');
  };

  /* 👁 참관 — 기존 '수업 관찰' 카드로 보내고 강의실 ID 를 채워준다(중복 구현 안 함) */
  window.tcObserveClass = function (roomId) {
    try {
      var card = $('card-admin-ghost');
      if (card) {
        if (card.tagName === 'DETAILS') card.open = true;
        card.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
      if (typeof window.ghPickRoom === 'function') window.ghPickRoom(roomId);
      else { var el = $('gh-room-id'); if (el) el.value = roomId; }
    } catch (e) {}
  };

  var _rows = [];

  function render() {
    var box = $('tc-body'), cntEl = $('tc-count');
    if (!box) return;
    var onlyLive = !!($('tc-only-live') && $('tc-only-live').checked);
    var rows = onlyLive ? _rows.filter(function (s) { return s.join_open; }) : _rows;

    if (!rows.length) {
      box.innerHTML = '<div class="empty">' + (onlyLive
        ? T('지금 들어갈 수 있는 수업이 없습니다.', 'No classes are joinable right now.')
        : T('오늘 예정된 수업이 없습니다.', 'No classes scheduled today.')) + '</div>';
      if (cntEl) cntEl.textContent = '';
      return;
    }
    if (cntEl) {
      var live = _rows.filter(function (s) { return s.join_open; }).length;
      cntEl.textContent = T(
        '오늘 ' + _rows.length + '건 · 지금 입장가능 ' + live + '건',
        _rows.length + ' today · ' + live + ' joinable now'
      );
    }

    box.innerHTML = '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">'
      + '<thead><tr>'
      +   '<th>' + T('시간', 'Time') + '</th>'
      +   '<th>' + T('상태', 'Status') + '</th>'
      +   '<th>' + T('학생', 'Student') + '</th>'
      +   '<th>' + T('강사', 'Teacher') + '</th>'
      +   '<th>' + T('강의실', 'Room') + '</th>'
      +   '<th>' + T('액션', 'Action') + '</th>'
      + '</tr></thead><tbody>'
      + rows.map(function (s) {
          var rid = encodeURIComponent(s.room_id);
          var who = encodeURIComponent(s.student_name || s.student_uid || '');
          /* 강사 미배정은 매니저가 가장 먼저 봐야 하는 줄 → 눈에 띄게 */
          var teacher = s.teacher_name
            ? esc(s.teacher_name)
            : '<span style="color:#b45309;font-weight:800">' + T('⚠ 미배정', '⚠ unassigned') + '</span>';
          var act = s.join_open
            ? '<button type="button" onclick="tcEnterClass(decodeURIComponent(\'' + rid + '\'),decodeURIComponent(\'' + who + '\'))" '
              + 'style="padding:4px 12px;font-size:11.5px;margin-right:4px;background:rgba(16,185,129,0.16);color:#047857;border:1px solid rgba(16,185,129,0.5);border-radius:6px;font-weight:800;cursor:pointer">'
              + T('🚪 입장', '🚪 Join') + '</button>'
            : '<span style="color:#9ca3af;font-size:11.5px;margin-right:4px">' + T('입장 시간 아님', 'not open') + '</span>';
          act += '<button type="button" onclick="tcObserveClass(decodeURIComponent(\'' + rid + '\'))" '
              + 'style="padding:4px 10px;font-size:11.5px;background:rgba(139,92,246,0.16);color:#6d28d9;border:1px solid rgba(139,92,246,0.45);border-radius:6px;font-weight:700;cursor:pointer">'
              + T('👁 참관', '👁 Observe') + '</button>';
          return '<tr>'
            + '<td style="white-space:nowrap">' + hhmm(s.start_ts) + '</td>'
            + '<td>' + badge(s.status) + '</td>'
            + '<td>' + esc(s.student_name || s.student_uid || '-') + '</td>'
            + '<td>' + teacher + '</td>'
            + '<td><code style="font-size:11px;color:#6b7280">' + esc(s.room_id) + '</code></td>'
            + '<td style="white-space:nowrap">' + act + '</td>'
            + '</tr>';
        }).join('')
      + '</tbody></table></div>';
  }

  window.tcLoadToday = async function () {
    var box = $('tc-body');
    if (!box) return;
    box.innerHTML = '<div class="empty">' + T('불러오는 중…', 'Loading…') + '</div>';
    try {
      var r = await fetch('/api/admin/classes/today', { credentials: 'include' });
      var d = await r.json();
      if (!d || d.ok === false) throw new Error(d && d.error ? d.error : 'load_failed');
      /* 지금 들어갈 수 있는 수업을 맨 위로 — 급할 때 위만 보면 되도록 */
      _rows = (d.sessions || []).slice().sort(function (a, b) {
        if (!!a.join_open !== !!b.join_open) return a.join_open ? -1 : 1;
        return a.start_ts - b.start_ts;
      });
      render();
    } catch (e) {
      box.innerHTML = '<div class="empty" style="color:#dc2626">⚠ '
        + T('불러오기 실패: ', 'Load failed: ') + esc(e.message || e) + '</div>';
    }
  };

  function bind() {
    var b = $('tc-load');
    if (b && !b._tcBound) { b._tcBound = true; b.addEventListener('click', window.tcLoadToday); }
    var c = $('tc-only-live');
    if (c && !c._tcBound) { c._tcBound = true; c.addEventListener('change', render); }
    /* 카드를 처음 펼칠 때 1회 자동 로드 — 매니저가 버튼을 또 누르지 않아도 되게 */
    var d = $('sm-today-classes');
    if (d && !d._tcBound) {
      d._tcBound = true;
      d.addEventListener('toggle', function () {
        if (d.open && !_rows.length) window.tcLoadToday();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
