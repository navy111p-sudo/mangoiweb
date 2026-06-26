/**
 * mango-class-time.js - 화상 수업 헤더에 "수업 시간(시작~종료) + 경과 타이머" 표시
 *  - 우측 상단 REC 배지(#mango-rec-badge) 바로 왼쪽에 시계 22:00 ~ 22:25 . 경과 12:34 형태로 표시
 *  - 서버(class_schedules)에서 오늘 수업의 start_time + duration_min 을 받아 종료시간 계산
 *  - 시작시간부터 1초마다 흐르는 경과 시간 표시 (시작 전이면 "시작 전")
 *  - 다크 모드 / 모바일·태블릿·데스크탑 반응형
 *  - 수업(통화) 중(body.vc-in-call)에만 노출 - 로비/메인 화면에서는 숨김
 *  - mango.js(MangoV3) 이후에 로드되어야 함
 */
(function () {
  'use strict';

  // ===== 1) 순수 헬퍼 (테스트 가능) =====

  /** "22:00" 또는 ISO("2026-06-23T22:00:00") -> "HH:MM" */
  function formatTime(value) {
    if (!value) return '--:--';
    if (/^\d{1,2}:\d{2}/.test(String(value))) return String(value).slice(0, 5);
    var d = new Date(value);
    if (isNaN(d.getTime())) return '--:--';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /** "HH:MM" + 분 -> "HH:MM" (종료시간 계산, 24시 넘어가면 wrap) */
  function addMinutes(hhmm, minutes) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm));
    if (!m) return '--:--';
    var total = (parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (minutes || 0)) % 1440;
    if (total < 0) total += 1440;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  /** 경과 밀리초 -> "MM:SS" (1시간 넘으면 "H:MM:SS"), 음수면 "시작 전" */
  function formatElapsed(ms) {
    if (ms == null || isNaN(ms)) return '';
    if (ms < 0) return '시작 전';
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
    return (h > 0 ? (h + ':' + mm) : mm) + ':' + ss;
  }

  /** 오늘 요일/날짜에 맞고 현재 시각에 가장 가까운 수업 1건 선택 */
  function pickTodaySchedule(items, now) {
    if (!Array.isArray(items) || !items.length) return null;
    now = now || new Date();
    var todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    var dowKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    var todayDow = dowKeys[now.getDay()];
    var nowMin = now.getHours() * 60 + now.getMinutes();

    function startMin(t) {
      var mm = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
      return mm ? parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) : 0;
    }

    var todays = items.filter(function (it) {
      if (it.scheduled_date) return it.scheduled_date === todayStr;       // 1회성: 날짜 일치
      if (it.day_of_week) return String(it.day_of_week).toLowerCase().indexOf(todayDow) !== -1; // 정기: 요일 일치
      return true;
    });
    if (!todays.length) return null;

    // 현재 시각에 가장 가까운 수업 선택
    todays.sort(function (a, b) {
      return Math.abs(startMin(a.start_time) - nowMin) - Math.abs(startMin(b.start_time) - nowMin);
    });
    return todays[0];
  }

  // ===== 2) UI 생성 / 렌더 =====

  var elWrap, elText, elElapsed;
  var elapsedTimer = null, classStartMs = null;

  function ensureUI() {
    if (elWrap) return;
    elWrap = document.createElement('div');
    elWrap.id = 'mango-class-time';
    elWrap.className = 'is-loading';
    elWrap.style.display = 'none'; // 기본 숨김 - 수업(body.vc-in-call) 중에만 표시
    elWrap.innerHTML = '<span class="mct-clock">⏰</span><span id="mango-class-time-text">불러오는 중…</span>'
      + '<span id="mango-class-elapsed" class="mct-elapsed"></span>';
    document.body.appendChild(elWrap);
    elText = document.getElementById('mango-class-time-text');
    elElapsed = document.getElementById('mango-class-elapsed');

    if (!document.getElementById('mango-class-time-style')) {
      var s = document.createElement('style');
      s.id = 'mango-class-time-style';
      s.textContent = [
        '#mango-class-time{position:fixed;top:104px;right:120px;z-index:9998;',
        '  display:flex;align-items:center;gap:6px;',
        '  color:#ffffff;font-size:14px;font-weight:500;line-height:1;',
        '  padding:6px 12px;background:rgba(15,23,42,0.72);backdrop-filter:blur(4px);',
        '  border:1px solid rgba(255,255,255,0.14);border-radius:20px;',
        '  white-space:nowrap;user-select:none;box-shadow:0 4px 12px rgba(0,0,0,0.25);}',
        '#mango-class-time .mct-clock{font-size:14px;line-height:1;}',
        '#mango-class-time .mct-elapsed{color:#fbbf24;font-weight:700;font-variant-numeric:tabular-nums;}',
        '#mango-class-time .mct-elapsed:empty{display:none;}',
        '#mango-class-time.is-loading{color:#cbd5e1;}',
        '@media (max-width:900px){',
        '  #mango-class-time{top:calc(env(safe-area-inset-top,0) + 10px);right:90px;',
        '   font-size:12px;padding:4px 9px;}',
        '}'
      ].join('');
      document.head.appendChild(s);
    }
    repositionLoop();
  }

  /** REC 배지가 나타나면 그 왼쪽에 딱 붙도록 위치 보정 (배지 폭이 녹화시간에 따라 변함) */
  function repositionLoop() {
    function tick() {
      if (!elWrap) return;
      var rec = document.getElementById('mango-rec-badge');
      if (rec) {
        var r = rec.getBoundingClientRect();
        if (r.width > 0) {
          // REC 배지 왼쪽에 16px 띄움 → 시간·녹화 절대 안 겹침
          elWrap.style.right = Math.max(8, (window.innerWidth - r.left + 16)) + 'px';
          elWrap.style.top = r.top + 'px';
          // 남는 가로폭을 넘지 않게 폭 제한(좁은 화면에서 REC 밑으로 안 파고듦)
          var avail = Math.max(80, r.left - 16 - 8);
          elWrap.style.maxWidth = avail + 'px';
          elWrap.style.overflow = 'hidden';
          elWrap.style.textOverflow = 'ellipsis';
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /** 시작 "HH:MM"(오늘 기준)부터 1초마다 경과 시간을 갱신 */
  function startElapsed(startHHMM) {
    var mm = /^(\d{1,2}):(\d{2})/.exec(String(startHHMM || ''));
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    if (!mm) { if (elElapsed) elElapsed.textContent = ''; classStartMs = null; return; }
    var d = new Date();
    d.setHours(parseInt(mm[1], 10), parseInt(mm[2], 10), 0, 0);
    classStartMs = d.getTime();
    function upd() {
      if (!elElapsed) return;
      var diff = Date.now() - classStartMs;
      elElapsed.textContent = (diff < 0) ? '· 시작 전' : ('· 경과 ' + formatElapsed(diff));
    }
    upd();
    elapsedTimer = setInterval(upd, 1000);
  }

  function stopElapsed() {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    if (elElapsed) elElapsed.textContent = '';
    classStartMs = null;
  }

  /** 일정이 없을 때 폴백: 입장 시각(window.__vcStartedAt)부터, 없으면 표시 시점부터 경과 */
  function startElapsedFromEntry() {
    var base = (window.__vcStartedAt && isFinite(window.__vcStartedAt)) ? window.__vcStartedAt : Date.now();
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    classStartMs = base;
    function upd() {
      if (!elElapsed) return;
      var diff = Date.now() - classStartMs;
      elElapsed.textContent = '· 경과 ' + formatElapsed(diff < 0 ? 0 : diff);
    }
    upd();
    elapsedTimer = setInterval(upd, 1000);
  }

  function render(startTime, endTime) {
    ensureUI();
    elText.textContent = formatTime(startTime) + ' ~ ' + formatTime(endTime);
    elWrap.classList.remove('is-loading');
    startElapsed(formatTime(startTime));   // 시작시간부터 흐르는 경과 타이머 시작
  }

  function renderFail(msg) {
    ensureUI();
    elText.textContent = '수업 중';          // 일정 정보가 없어도 '수업 중' + 경과 표시
    elWrap.classList.remove('is-loading');
    startElapsedFromEntry();                 // 입장 시각부터 흐르는 경과 타이머
  }

  // ===== 3) 서버 데이터 연동 =====

  /** 현재 수업의 시작/종료 시간을 받아 표시 */
  async function loadClassTime() {
    ensureUI();
    try {
      // 학생 이름(vcUsername) 우선, 없으면 로그인 사용자 ID로 조회
      var studentName = (typeof vcUsername !== 'undefined' && vcUsername) ? vcUsername : '';
      var userId = (window.MangoV3 && window.MangoV3.userId) ? window.MangoV3.userId : '';
      var today = new Date().toISOString().slice(0, 10);

      var qs = new URLSearchParams({ from_date: today, to_date: today, limit: '50' });
      if (studentName && studentName !== '관찰자') qs.set('student_name', studentName);
      else if (userId) qs.set('user_id', userId);

      var data = await (window.MangoV3
        ? window.MangoV3.api('/api/admin/class-schedules?' + qs.toString())
        : fetch('/api/admin/class-schedules?' + qs.toString(), { credentials: 'include' }).then(function (r) { return r.json(); })
      );

      var sched = pickTodaySchedule((data && data.items) || [], new Date());
      if (!sched || !sched.start_time) { renderFail('시간 정보 없음'); return; }

      var start = sched.start_time;                              // "22:00"
      var end = addMinutes(start, sched.duration_min || 30);     // 시작 + 수업시간(기본 30분)
      render(start, end);
    } catch (err) {
      console.warn('[mango-class-time] 수업 시간 로드 실패:', err);
      renderFail('시간 정보 없음');
    }
  }

  // ===== 4) 표시 조건 (수업/통화 중에만) =====

  /** 화상 수업(통화) 중인지 - 다른 스크립트(mango-rec/attendance)와 동일한 신호 사용 */
  function isInClass() {
    return !!(document.body && document.body.classList.contains('vc-in-call'));
  }

  var wasInClass = false;

  /** vc-in-call 상태에 따라 배지를 보이거나 숨김. 수업 진입 시 1회 일정 로드 */
  function applyVisibility() {
    var inClass = isInClass();
    if (inClass && !wasInClass) {        // 로비 -> 수업 진입
      ensureUI();
      elWrap.style.display = 'flex';
      loadClassTime();
    } else if (!inClass && wasInClass) { // 수업 -> 로비/메인 이탈
      if (elWrap) elWrap.style.display = 'none';
      stopElapsed();                     // 경과 타이머 정지
    }
    wasInClass = inClass;
  }

  // ===== 5) 초기화 =====

  function init() {
    applyVisibility();                 // 현재 상태 반영 (메인이면 숨김)
    setInterval(applyVisibility, 2000); // vc-in-call 진입/이탈 감지 (mango-rec와 동일 주기)
    setInterval(function () {            // 수업 중일 때만 5분마다 일정 갱신
      if (isInClass()) loadClassTime();
    }, 5 * 60 * 1000);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.MangoClassTime = { reload: loadClassTime, render: render }; // 외부 수동 갱신용
  }

  // ===== 테스트용 export (Node) =====
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatTime: formatTime, addMinutes: addMinutes, pickTodaySchedule: pickTodaySchedule, formatElapsed: formatElapsed };
  }
})();
