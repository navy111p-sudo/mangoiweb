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

  /* 📋 (2026-09-14 사장님 지시 — 샘플 A «세로 목록») 수업 «한 건 = 한 줄» 로 그린다.
     [왜] 그전에는 모든 수업의 요일을 한 줄로 합치고(「매주 화·수·목·금」) 시간·강사는 list[0]
          것 «하나만» 붙였다 → 강사·시간이 다른 수업이 여럿이면 없는 수업(「화·수·목·금 7:20」)을
          말했다. 줄을 갈라 두면 구조적으로 섞일 자리가 없다.
     [묶기] 같은 «시각 + 강사» 의 반복 수업만 한 줄로 합친다(화 7:20 강선생님 + 목 7:20 강선생님
          → 「화·목 7:20 강선생님」). 시각이나 강사가 다르면 절대 합치지 않는다.
     [정렬] 다음 수업이 가장 가까운 줄이 맨 위 + 앰버 강조. 날짜를 못 구한 줄은 맨 아래.
     ⛔ 강사 이름은 DB 값이다 — 반드시 esc() 를 거친다. ⛔ hover 확대(scale/translate) 금지. */
  function fmtShortDate(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); if (!m) return '';
    return Number(m[2]) + '/' + Number(m[3]);
  }
  /** 서버 schedules[] → 화면 줄 목록. 순수 함수(하니스가 오려 내 돌린다). */
  function buildRows(list, ko) {
    var groups = {}, order = [];
    list.forEach(function (s) {
      var days = (ko ? s.day_labels_ko : s.day_labels_en) || [];
      var teacher = s.teacher_name || '';
      // 일회성(scheduled_date) 은 날짜가 곧 «요일 칸» 이라 합치지 않는다
      var key = s.scheduled_date ? ('once:' + s.schedule_id) : ('rec:' + String(s.start_time || '') + '|' + teacher);
      var g = groups[key];
      if (!g) { g = groups[key] = { key: key, days: [], seen: {}, start_time: s.start_time || '', teacher: teacher, once: s.scheduled_date || null, next_date: null, next_ts: null }; order.push(g); }
      days.forEach(function (d) { if (!g.seen[d]) { g.seen[d] = 1; g.days.push(d); } });
      if (s.next_start_ts != null && (g.next_ts == null || s.next_start_ts < g.next_ts)) { g.next_ts = s.next_start_ts; g.next_date = s.next_date || null; }
    });
    order.sort(function (a, b) {
      if (a.next_ts == null && b.next_ts == null) return 0;
      if (a.next_ts == null) return 1; if (b.next_ts == null) return -1;
      return a.next_ts - b.next_ts;
    });
    // 요일은 «도착 순» 이 아니라 «주 순서» 로 — 서버가 다음 날짜순으로 주므로 수요일에 보면 목이 화보다 먼저 온다
    var DOW = ko ? ['월', '화', '수', '목', '금', '토', '일'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var dowIdx = function (d) { var i = DOW.indexOf(d); return i < 0 ? 99 : i; };
    return order.map(function (g, i) {
      var days = g.days.slice().sort(function (a, b) { return dowIdx(a) - dowIdx(b); });
      return {
        dayLabel: g.once ? fmtShortDate(g.once) : days.join(ko ? '·' : '/'),
        time: g.start_time ? fmtTime12(g.start_time) : '',
        teacher: g.teacher,
        isNext: i === 0 && g.next_ts != null,
        // 일회성은 요일 칸이 이미 날짜라 «다음» 줄일 때만 오른쪽에 한 번 더 적는다(같은 날짜 두 번 금지)
        nextShort: g.next_date && (!g.once || (i === 0 && g.next_ts != null)) ? fmtShortDate(g.next_date) : '',
        weeklyCount: g.once ? 0 : g.days.length
      };
    });
  }

  function ensureStyle() {
    if (document.getElementById('nms-style')) return;
    var st = document.createElement('style'); st.id = 'nms-style';
    st.textContent = '.ncc-card.nms-card{padding:12px 16px;text-align:left;min-width:280px;max-width:min(360px,calc(100vw - 32px));display:flex;flex-direction:column;gap:6px}'
      + '.nms-head{display:flex;justify-content:flex-start;align-items:baseline;gap:10px}'
      + '.nms-head .ncc-sub{margin-left:auto}'
      + '.nms-head .ncc-top{margin-bottom:0}.nms-head .ncc-sub{margin-top:0}'
      + '.nms-row{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:12px;border:1px solid transparent}'
      + '.nms-row.nms-next{background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.55)}'
      + '.nms-day{flex:0 0 auto;min-width:46px;box-sizing:border-box;text-align:center;font-size:12px;font-weight:800;color:#cbd5e1;padding:3px 6px;border-radius:8px;background:rgba(148,163,184,.14);font-variant-numeric:tabular-nums;white-space:nowrap}'
      + '.nms-next .nms-day{color:#fcd34d;background:rgba(251,191,36,.16)}'
      + '.nms-time{flex:0 0 auto;font-size:14px;font-weight:800;color:#e2e8f0;font-variant-numeric:tabular-nums;white-space:nowrap}'
      + '.nms-next .nms-time{color:#fde68a}'
      + '.nms-teacher{flex:1 1 auto;min-width:0;font-size:12px;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.nms-next .nms-teacher{color:#e2e8f0}'
      + '.nms-date{flex:0 0 auto;font-size:11.5px;color:#94a3b8;font-variant-numeric:tabular-nums;white-space:nowrap}'
      + '.nms-next .nms-date{font-size:10.5px;font-weight:800;color:#1a1a1a;background:#f59e0b;padding:2px 7px;border-radius:99px}';
    document.head.appendChild(st);
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
    var ko = L();
    var rows = buildRows(list, ko);
    var weeklyCount = 0, teachers = {}, nTeachers = 0;
    rows.forEach(function (r) { weeklyCount += r.weeklyCount; if (r.teacher && !teachers[r.teacher]) { teachers[r.teacher] = 1; nTeachers++; } });
    var head = ko ? '📅 내 수업' : '📅 My classes';
    if (weeklyCount) head += ko ? (' · 매주 ' + weeklyCount + '회') : (' · ' + weeklyCount + '/week');
    var side = nTeachers > 1 ? (ko ? ('강사 ' + nTeachers + '명') : (nTeachers + ' teachers')) : '';
    var key = 'weekly:' + ko + ':' + JSON.stringify(rows);
    if (key !== lastKey || c.style.display !== 'block') {
      lastKey = key; c.style.display = 'block';
      ensureStyle();
      var html = '<div class="ncc-card nms-card">'
        + '<div class="nms-head"><span class="ncc-top">' + esc(head) + '</span>'
        + (side ? ('<span class="ncc-sub">' + esc(side) + '</span>') : '') + '</div>';
      rows.forEach(function (r) {
        html += '<div class="nms-row' + (r.isNext ? ' nms-next' : '') + '">'
          + '<span class="nms-day">' + esc(r.dayLabel || '—') + '</span>'
          + '<span class="nms-time">' + esc(r.time) + '</span>'
          + '<span class="nms-teacher">' + esc(r.teacher) + '</span>'
          + (r.nextShort ? ('<span class="nms-date">' + (r.isNext ? esc((ko ? '다음 · ' : 'Next · ') + r.nextShort) : esc(r.nextShort)) + '</span>') : '')
          + '</div>';
      });
      c.innerHTML = html + '</div>';
    }
    return true;
  };
})();
