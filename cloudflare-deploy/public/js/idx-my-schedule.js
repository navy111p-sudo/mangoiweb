/* idx-my-schedule.js — 오늘 수업이 없는 학생에게 "무슨 요일 몇 시" 수업인지 보여준다 (2026-08-24)
   ═══════════════════════════════════════════════════════════════════════════════
   [왜] idx-next-class.js 의 "다음 수업 카운트다운" 카드는 *오늘* 수업이 없으면 그냥 사라진다
        (hide()). "수업은 내일부터" 인 학생은 홈 어디에도 자기 요일·시간을 볼 곳이 없었다.
   [무엇] 순수 안내용 — 입장 로직·자동입장과는 무관하다(그건 idx-main.js/idx-vc-fastentry.js).
        새 읽기 전용 API(/api/class/schedule/mine, api-mango.ts)를 불러 요일·시간·다음 수업
        날짜만 같은 카드 자리(#next-class-countdown)에 그린다.
   [왜 idx-next-class.js 에 직접 안 넣었나] 그 파일은 defer 를 못 붙인다(뒤 코드가 전역을 씀)
        → idx-main.js 처럼 index.html 의 "첫 화면 blocking" 예산에 그대로 잡힌다. 실측:
        이 기능 전체를 그 파일에 넣었더니 first_paint_budget_harness 가 즉시 FAIL 냈다
        (여유 12KB인데 이 기능만 3.6KB). 그래서 훅 하나(__nccNoClassToday, idx-next-class.js
        쪽 변경은 그 한 줄뿐)만 blocking 쪽에 남기고, 나머지는 전부 이 defer 파일로 옮겼다.
   ⚠️ idx-main.js 에도 넣지 않는다(849KB, blocking, 예산 여유 최소). */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function L() { try { return (window.getLang ? window.getLang() : 'ko') !== 'en'; } catch (_) { return true; } }
  function fmtTime12(hhmm) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); if (!m) return hhmm || '';
    var h = Number(m[1]), mi = m[2];
    if (L()) return (h < 12 ? '오전 ' : '오후 ') + ((h % 12) || 12) + ':' + mi;
    return (((h % 12) || 12) + ':' + mi + ' ' + (h < 12 ? 'AM' : 'PM'));
  }
  function fmtNextDate(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); if (!m) return '';
    return L() ? (Number(m[2]) + '월 ' + Number(m[3]) + '일') : (Number(m[2]) + '/' + Number(m[3]));
  }

  var weekly = { uid: null, fetched: false, fetching: false, schedules: [] };
  function fetchWeeklyOnce(u) {
    if (weekly.uid !== u.uid) { weekly.uid = u.uid; weekly.fetched = false; weekly.schedules = []; }
    if (weekly.fetched || weekly.fetching) return;
    weekly.fetching = true;
    var qs = 'user_id=' + encodeURIComponent(u.uid);
    if (u.name) qs += '&student_name=' + encodeURIComponent(u.name);
    fetch('/api/class/schedule/mine?' + qs, { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        weekly.schedules = (d && d.ok && d.schedules) || [];
        weekly.fetched = true; weekly.fetching = false;
      }, function () { weekly.fetched = true; weekly.fetching = false; });
  }

  var lastKey = '';
  /** idx-next-class.js 가 "오늘 수업 없음" 을 만나면 부른다. 그렸으면 true(카드 유지),
      아니면 false(호출부가 hide() 하도록) — 실제 표시 여부는 항상 호출부가 정한다. */
  window.__nccNoClassToday = function (c) {
    var u = (window.getCurrentUser ? window.getCurrentUser() : null);
    if (!u || !u.uid) return false;
    fetchWeeklyOnce(u);
    var list = weekly.schedules || [];
    if (!list.length) return false;
    var seen = {}, days = [];
    list.forEach(function (s) {
      ((L() ? s.day_labels_ko : s.day_labels_en) || []).forEach(function (d) { if (!seen[d]) { seen[d] = 1; days.push(d); } });
    });
    var next = list[0];
    var head = days.length ? ((L() ? '매주 ' : 'Every ') + days.join(L() ? '·' : '/')) : (L() ? '내 수업' : 'Your class');
    var when = next && next.start_time ? fmtTime12(next.start_time) : '';
    var nextLine = '';
    if (next && next.next_date) {
      nextLine = (L() ? '다음 수업: ' : 'Next class: ') + fmtNextDate(next.next_date) + ' ' + fmtTime12(next.start_time)
        + (next.teacher_name ? (' · ' + esc(next.teacher_name)) : '');
    }
    var key = 'weekly:' + days.join(',') + ':' + when + ':' + nextLine;
    if (key !== lastKey || c.style.display !== 'block') {
      lastKey = key; c.style.display = 'block';
      c.innerHTML = '<div class="ncc-card">'
        + '<div class="ncc-top">📅 ' + esc(head) + (when ? (' ' + esc(when)) : '') + '</div>'
        + (nextLine ? ('<div class="ncc-sub">' + esc(nextLine) + '</div>') : '')
        + '</div>';
    }
    return true;
  };
})();
