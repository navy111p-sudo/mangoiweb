/* ═══════════════════════════════════════════════════════════════════════════
   📅 통합 시간표 카드 — 「누르기 전에 답을 말하는」 여섯 칸 (2026-09-11)

   [무엇이 문제였나 — 사장님 제보]
     admin.html 의 그 카드 여섯 장과 아래 버튼이 전부
       onclick="location.href='/admin/weekly-schedule.html'"
     한 줄이라, 무엇을 눌러도 «같은 강사 스케줄» 이 나왔다. 파라미터도 분기도 없었다.
     게다가 카드가 «기능 설명» 만 적고 있어서 시간표를 열어 봐야만 답을 알 수 있었다.

   [고친 방향 — 사장님이 A+D 를 고르심]
     A. 카드마다 다른 ?preset= 을 실어 보내 도착 화면이 «이미 그 상태로» 열리게 한다.
     D. 카드가 «지금 숫자» 를 먼저 말한다.

   ⛔ 숫자를 지어내지 않는다 — 못 재는 값은 «—» 와 «왜 없는지» 를 적는다.
      (CLAUDE.md 2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」)
   ⛔ 「빈자리」에는 숫자를 달지 않는다 — 그 정의(운영시간 대비 빈 칸)는 시간표 «화면» 이
      자기 그리드로 계산한다. 서버에서 같은 정의를 다시 만들면 「화면마다 답이 다른」 사고가 된다.
   ⛔ 카드 라벨에 data-ko/data-en 을 «상자» 에 달지 말 것 — i18n 엔진이 textContent 를
      통째로 갈아끼워 숫자 칸이 DOM 에서 사라진다(CLAUDE.md 「아이콘 버튼에 달았더니」).
      그래서 글자만 담은 <span> 에만 단다.

   ℹ️ 403(강사·지사·대리점)은 «고장» 이 아니다 — 이 숫자는 전사 집계라 그쪽이 보면 안 된다.
      그때는 «본사 계정에서 보입니다» 라고 사실대로 적는다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var EP = '/api/admin/reports/schedule-summary';
  var BASE = '/admin/weekly-schedule.html';

  function en() {
    /* 판정 정본은 전역 window.adminLang — localStorage 'adminLang' 은 저장소 어디에서도
       setItem 하지 않는 «죽은 키» 다(CLAUDE.md). 없을 때만 mangoi_lang 으로 떨어진다. */
    try {
      if (window.adminLang === 'en') return true;
      if (window.adminLang === 'ko') return false;
      return localStorage.getItem('mangoi_lang') === 'en';
    } catch (e) { return false; }
  }
  function T(ko, eng) { return en() ? eng : ko; }

  /* 카드 정의 — preset 은 weekly-schedule.html 이 «실제로 아는» 값이어야 한다.
     ⛔ 여기 이름을 바꾸면 그쪽도 함께 고칠 것. 하니스가 두 파일을 대조해 어긋나면 FAIL 낸다. */
  var CARDS = [
    {
      key: 'week', preset: 'week', icon: '📆',
      ko: '이번 주 수업', en: 'This week',
      /* 날짜가 잡힌 건수만 센다. 정기(매주 반복)는 그 주에 몇 번 도는지 알 수 없어
         같은 숫자에 더하지 않고 «따로» 적는다 — 더하면 그 자리에서 거짓이 된다. */
      num: function (d) { return d.dated; },
      unit: function () { return T('건', ''); },
      sub: function (d) {
        if (d.recurring == null || d.recurring === 0) return T('날짜가 잡힌 수업', 'classes with a set date');
        return T('+ 매주 반복 ' + d.recurring + '건 별도', '+ ' + d.recurring + ' recurring, counted separately');
      }
    },
    {
      key: 'today', preset: 'today', icon: '🔄',
      ko: '오늘 수업', en: 'Today',
      num: function (d) { return d.today_count; },
      unit: function () { return T('건', ''); },
      sub: function () { return T('일간 화면으로 — 끌어서 시간 변경', 'Opens the day view — drag to reschedule'); }
    },
    {
      key: 'teacher', preset: 'teacher', icon: '👨‍🏫',
      ko: '수업 있는 강사', en: 'Teachers booked',
      num: function (d) { return d.teachers; },
      unit: function () { return T('명', ''); },
      sub: function () { return T('강사 하나만 골라 보기', 'Filter down to one teacher'); }
    },
    {
      key: 'student', preset: 'student', icon: '👨‍🎓',
      ko: '수업 있는 학생', en: 'Students booked',
      num: function (d) { return d.students; },
      unit: function () { return T('명', ''); },
      sub: function () { return T('학생 하나만 골라 보기', 'Filter down to one student'); }
    },
    {
      key: 'free', preset: 'free', icon: '🟩',
      ko: '빈자리 찾기', en: 'Find open slots',
      /* ⛔ 여기에 숫자를 달지 않는다 — 위 머리말 참고. */
      num: function () { return undefined; },
      unit: function () { return ''; },
      sub: function () { return T('배정 가능한 칸만 남겨서 열기', 'Opens showing only assignable cells'); }
    },
    {
      key: 'notify', preset: null, icon: '📲',
      ko: '안 나간 알림', en: 'Unsent notices',
      num: function (d) { return d.notify_pending; },
      unit: function () { return T('건', ''); },
      alert: function (d) { return (d.notify_pending || 0) > 0; },
      sub: function (d) {
        var n = d.notify_pending;
        if (n == null) return T('상태를 읽지 못했습니다', 'Could not read the status');
        if (n === 0) return T('대기 중인 알림 없음', 'Nothing waiting');
        /* 사실대로 적는다: 이 큐를 꺼내 보내는 코드가 저장소에 없다(2026-09-11 실측).
           「대기 중」이라고만 쓰면 곧 나갈 것처럼 읽힌다. */
        var days = d.notify_oldest_days;
        var age = (days != null && days > 0) ? (T(' · ' + days + '일째', ' · ' + days + ' days')) : '';
        return T('발송 기능이 아직 없습니다' + age, 'No sender exists yet' + age);
      }
    }
  ];

  function fmt(n) {
    try { return Number(n).toLocaleString(en() ? 'en-US' : 'ko-KR'); } catch (e) { return String(n); }
  }

  /** 카드 한 장을 만든다. 숫자는 나중에 채운다(서버 응답 전에도 화면이 서 있어야 한다). */
  function build(c) {
    var el = document.createElement(c.preset ? 'a' : 'div');
    el.className = 'sc-card' + (c.preset ? '' : ' sc-static');
    el.setAttribute('data-sc', c.key);
    if (c.preset) {
      /* 🔗 href 로 둔다 — JS 가 죽어도 열리고, 가운데클릭·새 탭이 동작한다.
         onclick="location.href=…" 로 되돌리지 말 것(그것이 이 사고의 출발점이었다). */
      el.setAttribute('href', BASE + '?preset=' + encodeURIComponent(c.preset));
    }

    var head = document.createElement('div');
    head.className = 'sc-head';
    var ic = document.createElement('span');
    ic.className = 'sc-ic';
    ic.textContent = c.icon;
    var lb = document.createElement('span');
    lb.className = 'sc-lb';
    /* 글자만 담은 span 에만 단다 — 상자에 달면 숫자가 사라진다. */
    lb.setAttribute('data-ko', c.ko);
    lb.setAttribute('data-en', c.en);
    lb.textContent = T(c.ko, c.en);
    head.appendChild(ic);
    head.appendChild(lb);

    var big = document.createElement('div');
    big.className = 'sc-big';
    big.textContent = '—';

    var sub = document.createElement('div');
    sub.className = 'sc-sub';
    sub.textContent = '';

    el.appendChild(head);
    el.appendChild(big);
    el.appendChild(sub);
    return el;
  }

  /** 숫자·부제를 채운다. data 가 null 이면 «왜 없는지» 를 적는다. */
  function fill(root, data, why) {
    for (var i = 0; i < CARDS.length; i++) {
      var c = CARDS[i];
      var el = root.querySelector('[data-sc="' + c.key + '"]');
      if (!el) continue;
      var big = el.querySelector('.sc-big');
      var sub = el.querySelector('.sc-sub');

      if (!data) {
        if (big) big.textContent = '—';
        if (sub) sub.textContent = why || T('숫자를 읽지 못했습니다', 'Could not load the figures');
        continue;
      }

      var v = c.num(data);
      if (big) {
        if (v === undefined) {          /* 일부러 숫자를 안 다는 칸 */
          big.textContent = '';
          big.classList.add('sc-nonum');
        } else if (v == null) {         /* 못 잰 값 — 0 으로 채우지 않는다 */
          big.textContent = '—';
        } else {
          big.textContent = fmt(v);
          var u = c.unit();
          if (u) {
            var us = document.createElement('span');
            us.className = 'sc-u';
            us.textContent = u;
            big.appendChild(us);
          }
        }
      }
      if (sub) sub.textContent = c.sub(data);
      if (c.alert && c.alert(data)) el.classList.add('sc-alert');
      else el.classList.remove('sc-alert');
    }
  }

  function load(root) {
    fetch(EP, { credentials: 'include' })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) {
          /* 고장이 아니다 — 전사 집계라 강사·지사·대리점에는 닫혀 있다. */
          fill(root, null, T('본사 계정에서 숫자가 보입니다', 'Figures are visible on an HQ account'));
          return null;
        }
        if (!r.ok) { fill(root, null, T('숫자를 읽지 못했습니다', 'Could not load the figures')); return null; }
        return r.json();
      })
      .then(function (d) {
        if (!d) return;
        /* 판정은 «실패라고 말했는가» 가 아니라 «성공이라고 말했는가» 로 —
           종단 404 본문에는 ok 칸이 없어 d.ok === false 검사는 그냥 통과한다(CLAUDE.md). */
        if (d.ok !== true) { fill(root, null, T('숫자를 읽지 못했습니다', 'Could not load the figures')); return; }
        fill(root, d, null);
      })
      .catch(function () {
        fill(root, null, T('숫자를 읽지 못했습니다', 'Could not load the figures'));
      });
  }

  function init() {
    var root = document.getElementById('sc-cards');
    if (!root || root.getAttribute('data-built') === '1') return;
    root.setAttribute('data-built', '1');
    for (var i = 0; i < CARDS.length; i++) root.appendChild(build(CARDS[i]));
    load(root);

    /* 🌐 언어 전환 — 관리자 화면은 document 에서 쏜다(window 가 아니다. CustomEvent 기본이
       bubbles:false 라 document 에서 쏜 것은 window 로 안 올라간다 — CLAUDE.md).
       다른 화면은 window 라서 둘 다 듣는다. */
    var redraw = function () {
      for (var i = 0; i < CARDS.length; i++) {
        var c = CARDS[i];
        var el = root.querySelector('[data-sc="' + c.key + '"] .sc-lb');
        if (el) el.textContent = T(c.ko, c.en);
      }
      load(root);   /* 부제·단위가 언어를 타므로 다시 채운다 */
    };
    document.addEventListener('mangoi:lang-changed', redraw);
    window.addEventListener('mangoi:lang-changed', redraw);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  /* 카드가 <details> 안이라 늦게 열릴 수 있다 — 열릴 때 한 번 더 본다.
     ⛔ 상주 setInterval·body class MutationObserver 금지(홈을 통째로 멎게 한 전력). */
  document.addEventListener('toggle', function (e) {
    var t = e && e.target;
    if (t && t.id === 'card-timetable' && t.open) init();
  }, true);
})();
