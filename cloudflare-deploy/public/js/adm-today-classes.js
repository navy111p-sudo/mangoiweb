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
  /* 🌐 언어 판정 — 정본은 window.adminLang (adm-lang-boot.js 가 정하고, adm-core.js 의
     `var adminLang` 이 같은 바인딩이라 KO/EN 토글까지 따라온다. 저장 키는 mangoi_lang).
     ⚠️ 예전엔 localStorage 'adminLang' 을 읽었는데 그 키는 **아무도 저장하지 않는 죽은 키**라
        EN 스태프에게도 늘 한국어였다(2026-08-27 수리). ⛔ 그 키에 쓰는 방식으로 되살리지 말 것. */
  function isEn() {
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; }
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
  /* 📷 (2026-08-20) 카메라를 끈 채로 입장 — &vc_cam=off (js/vc-observe-guard.js 가 처리).
     수업 중간에 낯선 얼굴이 뜨는 것을 막되, 트랙은 살아 있어 [카메라] 버튼 한 번으로 켜진다.
     ⚠️ 확인 문구를 늘릴 때는 teacher_feedback_admin_harness 의 «tcEnterClass 뒤 700자 안에
        confirm» 검사를 넘기지 않게 — 긴 설명은 이렇게 함수 «위» 에 둔다. */
  window.tcEnterClass = function (roomId, who) {
    var msg = T(
      '수업에 직접 입장할까요?\n\n강의실: ' + roomId + '\n학생: ' + (who || '-') +
        '\n\n※ 참관이 아니라 실제 참가자입니다. 학생·강사에게 보입니다.' +
        '\n※ 카메라는 꺼진 채로 입장합니다([카메라] 버튼으로 켜기).',
      'Join this class as a participant?\n\nRoom: ' + roomId + '\nStudent: ' + (who || '-') +
        '\n\nNote: NOT observation — students and the teacher see you.' +
        '\nCamera starts OFF ([Camera] button turns it on).'
    );
    if (!confirm(msg)) return;
    var url = location.origin + '/?vc_autojoin=1&vc_cam=off&vc_role=teacher&vc_room=' + encodeURIComponent(roomId);
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

  /* 🔄 (2026-08-28) 대체강사 배정 — 강사 휴가·병가 대응(사장님 요청).
     "매주 반복 수업" 은 정본 행을 손대지 않고 그 날짜만 겹쳐 보이는 오버레이라
     다음 회차는 자동으로 원래 강사로 돌아간다(백엔드 src/enroll-ops.ts 의 (m-2)/(m-3) 참고).
     ⚠️ 날짜지정(수강신청) 수업은 그 회차 자체가 그 날 하루뿐이라 되돌리기 버튼이 없다 —
        되돌리려면 그 목록에서 원래 강사를 다시 고르면 된다(오버레이가 필요 없는 경우라 생략). */
  function kstTodayStr() {
    var k = new Date(Date.now() + 9 * 3600 * 1000);
    return k.getUTCFullYear() + '-' + String(k.getUTCMonth() + 1).padStart(2, '0') + '-' + String(k.getUTCDate()).padStart(2, '0');
  }

  function tcSubModalClose() {
    var box = $('tc-sub-modal');
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }

  window.tcOpenSubModal = async function (scheduleId) {
    var dEl = $('tc-date');
    var date = (dEl && /^\d{4}-\d{2}-\d{2}$/.test(dEl.value || '')) ? dEl.value : kstTodayStr();
    tcSubModalClose();
    var box = document.createElement('div');
    box.id = 'tc-sub-modal';
    /* ⚠️ 세로가 짧은 폰에서 넘친 부분이 잘려 맨 아래 [배정] 을 못 누르는 사고를 막는다
       — flex 정렬 대신 자식 margin:auto + overflow-y:auto (CLAUDE.md 2장 도크 모달 항목). */
    box.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,0.55);display:flex;justify-content:center;padding:16px;overflow-y:auto';
    box.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:420px;width:100%;margin:auto;padding:18px;box-shadow:0 20px 50px -10px rgba(0,0,0,0.4);color:#111827">'
      + '<div id="tc-sub-body">' + T('불러오는 중…', 'Loading…') + '</div>'
      + '<div style="text-align:right;margin-top:12px"><button type="button" id="tc-sub-close" style="padding:6px 14px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer">' + T('닫기', 'Close') + '</button></div>'
      + '</div>';
    document.body.appendChild(box);
    document.getElementById('tc-sub-close').addEventListener('click', tcSubModalClose);
    box.addEventListener('click', function (e) { if (e.target === box) tcSubModalClose(); });

    try {
      var r = await fetch('/api/pay/enroll/admin/substitute-candidates?schedule_id=' + encodeURIComponent(scheduleId) + '&date=' + encodeURIComponent(date), { credentials: 'include' });
      var d = await r.json().catch(function () { return null; });
      if (!r.ok || !d || d.ok !== true) throw new Error((d && (d.message || d.error)) || ('HTTP ' + r.status));
      tcRenderSubModal(scheduleId, date, d);
    } catch (e) {
      var b = $('tc-sub-body');
      if (b) b.innerHTML = '<div style="color:#dc2626">⚠ ' + T('불러오기 실패: ', 'Load failed: ') + esc(e.message || e) + '</div>';
    }
  };

  function tcRenderSubModal(scheduleId, date, d) {
    var b = $('tc-sub-body');
    if (!b) return;
    var sc = d.schedule;
    var recurNote = sc.is_recurring
      ? T('⚠ 매주 반복되는 수업입니다 — 이번 회차(이 날짜)만 바뀌고, 다음 회차부터는 원래 강사로 자동 복귀합니다.',
          '⚠ This is a weekly recurring class — only this occurrence changes; it reverts to the original teacher next time.')
      : T('이 날짜의 수업만 바뀝니다.', 'Only this date changes.');
    var existingHtml = '';
    if (d.existing_substitution) {
      existingHtml = '<div id="tc-sub-existing" style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:12.5px">'
        + T('현재 대체: ', 'Current substitute: ') + '<b>' + esc(d.existing_substitution.substitute_teacher_name || d.existing_substitution.substitute_teacher_id) + '</b>'
        + (d.existing_substitution.reason ? ' · ' + esc(d.existing_substitution.reason) : '')
        + ' <button type="button" id="tc-sub-revert" data-orig="' + esc(d.existing_substitution.original_teacher_id || '') + '" '
        + 'style="margin-left:6px;padding:2px 8px;border-radius:6px;border:1px solid #d97706;background:#fff;cursor:pointer;font-size:11.5px">'
        + T('🔙 되돌리기', '🔙 Revert') + '</button></div>';
    }
    var cands = (d.candidates || []).map(function (c) {
      return '<option value="' + esc(c.id) + '">' + (c.free ? '🟢 ' : '🔴 ') + esc(c.name)
        + (c.free ? '' : T(' (그 시간 다른 수업 있음)', ' (busy at that time)')) + '</option>';
    }).join('');
    b.innerHTML =
      '<div style="font-weight:800;margin-bottom:4px">' + T('대체강사 배정', 'Assign substitute teacher') + '</div>'
      + '<div style="font-size:12px;color:#6b7280;margin-bottom:8px">' + esc(sc.student_name || '-') + ' · ' + esc(sc.start_time || '')
      + ' · ' + T('현재', 'current') + ': ' + esc(sc.teacher_name || T('미배정', 'unassigned')) + '</div>'
      + '<div style="font-size:11.5px;color:#92400e;background:rgba(245,158,11,0.1);border-radius:6px;padding:6px 8px;margin-bottom:10px">' + recurNote + '</div>'
      + existingHtml
      + '<label style="font-size:12px;color:#374151;display:block;margin-bottom:4px">' + T('대체 강사 선택 (🟢 그 시간 가능 · 🔴 다른 수업 있음)', 'Pick substitute (🟢 available · 🔴 busy)') + '</label>'
      + '<select id="tc-sub-teacher" style="width:100%;padding:6px;border-radius:6px;border:1px solid #d1d5db;margin-bottom:8px;box-sizing:border-box">' + cands + '</select>'
      + '<label style="font-size:12px;color:#374151;display:block;margin-bottom:4px">' + T('사유', 'Reason') + '</label>'
      + '<input id="tc-sub-reason" type="text" placeholder="' + T('예: 병가, 휴가', 'e.g. sick leave, vacation') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid #d1d5db;box-sizing:border-box;margin-bottom:10px" />'
      + '<div id="tc-sub-msg" style="font-size:12px;margin-bottom:8px"></div>'
      + '<button type="button" id="tc-sub-go" style="width:100%;padding:9px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer">' + T('배정', 'Assign') + '</button>';

    document.getElementById('tc-sub-go').addEventListener('click', function () {
      var sel = document.getElementById('tc-sub-teacher');
      var reasonEl = document.getElementById('tc-sub-reason');
      if (!sel || !sel.value) return;
      tcSubmitSub(scheduleId, date, sel.value, reasonEl ? reasonEl.value : '');
    });
    var revertBtn = document.getElementById('tc-sub-revert');
    if (revertBtn) revertBtn.addEventListener('click', function () {
      var origId = revertBtn.getAttribute('data-orig');
      if (!origId) return;
      tcSubmitSub(scheduleId, date, origId, '');
    });
  }

  window.tcSubmitSub = async function (scheduleId, date, teacherId, reason) {
    var msg = $('tc-sub-msg');
    if (msg) msg.textContent = T('처리 중…', 'Working…');
    try {
      var r = await fetch('/api/pay/enroll/admin/substitute', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_id: scheduleId, date: date, substitute_teacher_id: teacherId, reason: reason || '' })
      });
      var d = await r.json().catch(function () { return null; });
      if (!r.ok || !d || d.ok !== true) throw new Error((d && (d.message || d.error)) || ('HTTP ' + r.status));
      tcSubModalClose();
      window.tcLoadToday();
    } catch (e) {
      if (msg) msg.innerHTML = '<span style="color:#dc2626">⚠ ' + esc(e.message || e) + '</span>';
    }
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
      /* 🧪 (2026-08-06 마이마이 요청) 레벨테스트도 이 목록에 함께 있다는 것을 숫자로 먼저 알린다.
         "레벨테스트는 어디서 보나요"가 반복 질문이었는데, 실제로는 같은 목록에 섞여 있었고
         구분 표시가 없어서 못 찾았을 뿐이다. */
      var lt = _rows.filter(function (s) { return s.is_level_test; }).length;
      /* 🏷 (2026-08-25) 카페24 건수를 «따로» 센다. 합계만 보여 주면 「목록엔 많은데 왜 다 입장이 안 되나」가 된다 —
         숫자가 갈려 있어야 «들어갈 수 있는 것»과 «카페24에서 도는 것»이 다르다는 게 먼저 읽힌다. */
      var c24 = _rows.filter(function (s) { return s.source === 'cafe24'; }).length;
      cntEl.textContent = T(
        _rows.length + '건 · 지금 입장가능 ' + live + '건' + (c24 ? ' · 카페24 ' + c24 + '건' : '')
          + (lt ? ' · 레벨테스트 ' + lt + '건' : ''),
        _rows.length + ' total · ' + live + ' joinable now' + (c24 ? ' · ' + c24 + ' on cafe24' : '')
          + (lt ? ' · ' + lt + ' level test' : '')
      );
    }

    /* 🚪 (2026-07-24 강사 피드백) "입장 버튼이 학생 이름과 멀리 떨어져 있어 다른 방에 잘못 들어간다"
       → 액션 버튼을 별도 맨 끝 열이 아니라 학생 이름 칸 바로 옆에 붙여, 줄을 눈으로 훑지 않고
       같은 칸만 보고 누를 수 있게 한다. */
    box.innerHTML = '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">'
      + '<thead><tr>'
      +   '<th>' + T('시간', 'Time') + '</th>'
      +   '<th>' + T('상태', 'Status') + '</th>'
      +   '<th>' + T('학생 / 액션', 'Student / Action') + '</th>'
      +   '<th>' + T('레벨 · 교재', 'Level · Textbook') + '</th>'
      +   '<th>' + T('강사', 'Teacher') + '</th>'
      +   '<th>' + T('강의실', 'Room') + '</th>'
      + '</tr></thead><tbody>'
      + rows.map(function (s) {
          var rid = encodeURIComponent(s.room_id);
          var who = encodeURIComponent(s.student_name || s.student_uid || '');
          /* 강사 미배정은 매니저가 가장 먼저 봐야 하는 줄 → 눈에 띄게 */
          var teacher = s.teacher_name
            ? esc(s.teacher_name)
            : '<span style="color:#b45309;font-weight:800">' + T('⚠ 미배정', '⚠ unassigned') + '</span>';
          /* 🔄 (2026-08-28) 대체강사가 배정된 회차 — 「오늘 왜 다른 선생님이냐」 를 바로 답할 수 있게
             원래 강사 이름을 함께 보인다. teacher 는 이미 대체강사 이름으로 덮여 온다(api-admin.ts). */
          if (s.substituted && s.substituted_from) {
            teacher += '<div style="font-size:10px;color:#7c3aed;font-weight:700;white-space:nowrap">🔄 '
              + T('대체 · 원래 ', 'sub for ') + esc(s.substituted_from) + '</div>';
          }
          /* 🏷 (2026-08-25) 카페24 수업에는 버튼을 주지 않는다 — 망고아이 방이 없어 들어갈 데가 없다.
             ⛔ 「일단 눌러 보게」 두면 아무도 없는 방이 열리고, 매니저는 «수업이 깨졌다» 고 읽는다.
                왜 없는지를 그 자리에 적어 준다(버튼이 없는 것보다 «이유 없이 없는 것» 이 나쁘다). */
          var isC24 = (s.source === 'cafe24');
          var act;
          if (isC24) {
            act = '<span style="color:#92400e;font-size:11.5px;margin-right:4px" title="'
              + T('카페24에서 진행되는 수업입니다. 망고아이 화상방이 없어 입장·참관할 수 없습니다.',
                  'This class runs on cafe24. There is no Mangoi room, so join/observe is not possible.') + '">'
              + T('카페24 수업 · 입장 불가', 'on cafe24 · cannot join') + '</span>';
          } else {
            act = s.join_open
              /* 🚪 학생에게 «보이는» 입장이라 참관(보라)과 색을 갈라 둔다 — 주황 + (보임) 표시 */
              ? '<button type="button" class="tc-act tc-act-enter" onclick="tcEnterClass(decodeURIComponent(\'' + rid + '\'),decodeURIComponent(\'' + who + '\'))" '
                + 'title="' + T('실제 참가자로 입장 — 학생에게 보입니다 (카메라는 꺼진 채로 시작)',
                                'Join as a real participant — students see you (camera starts off)') + '" '
                + '>'
                + T('🚪 입장(보임)', '🚪 Join (visible)') + '</button>'
              : '<span style="color:#9ca3af;font-size:11.5px;margin-right:4px">' + T('입장 시간 아님', 'not open') + '</span>';
            if (s.observable !== false) {
              act += '<button type="button" class="tc-act tc-act-observe" onclick="tcObserveClass(decodeURIComponent(\'' + rid + '\'))" '
                  + '>'
                  + T('👁 참관', '👁 Observe') + '</button>';
            }
          }
          /* 📚 (2026-08-25 보고서 ①) 옛 LMS 한 줄에 있던 「TEXTBOOK 배정 없음」 배지의 대응.
             수업 «전에» 손써야 하는 줄이라 눈에 띄어야 한다 — 배정된 줄은 조용히 교재명만. */
          var bookTag = s.textbook_assigned
            ? '<span style="font-size:11px;color:#6b7280">📚 ' + esc(s.textbook) + '</span>'
            : '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:10.5px;font-weight:800;'
              + 'background:rgba(245,158,11,0.16);color:#b45309;border:1px solid rgba(245,158,11,0.45)">'
              + T('📚 교재 미배정', '📚 no textbook') + '</span>';
          var levelTag = s.level
            ? '<span style="font-size:11px;color:#475569">' + esc(s.level) + '</span>'
            : '';
          /* 🧪 레벨테스트 표시 — 일반수업과 응대가 다르다(첫 수업·보호자 대기·결과 입력).
             한 목록에 두되 눈으로 즉시 갈라지게. 크기·위치는 고정, 색으로만 구분한다. */
          var kindTag = s.is_level_test
            ? '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:10.5px;font-weight:800;'
              + 'background:rgba(245,158,11,0.16);color:#b45309;border:1px solid rgba(245,158,11,0.45)">'
              + T('🧪 레벨테스트', '🧪 Level test') + '</span>'
            : '';
          /* 🔄 (2026-08-28) 대체강사 배정 — 강사 병가·휴가 대응. 카페24 수업은 망고아이 쪽
             예약(schedule_id)이 없어 대상이 아니다(위 「입장 불가」 와 같은 이유).
             ⛔ (2026-08-30) 클래스 이름을 «-btn» 으로 끝내지 말 것 — admin-inline-c.css 의
                `html[data-admin-theme="ivory"] [id^="card-"] [class$="-btn"]:not(…)×8` (0,11,1) 이
                `button.tc-act:not(…)×6` (0,7,1) 을 이겨 이 버튼만 «흰 버튼» 이 된다(실측:
                background #ffffff · color #344054 — 옆 참관 칩은 보라). 그 파일 9503·9710·9737 행에
                같은 경고가 세 번 적혀 있다. 그래서 `tc-sub-act` 다. */
          if (!isC24 && s.schedule_id) {
            teacher += '<button type="button" class="tc-act tc-sub-act" onclick="tcOpenSubModal(' + Number(s.schedule_id) + ')" '
              + 'title="' + T('대체강사 배정', 'Assign substitute teacher') + '">🔄</button>';
          }
          return '<tr>'
            + '<td style="white-space:nowrap">' + hhmm(s.start_ts) + '</td>'
            + '<td>' + badge(s.status) + '</td>'
            + '<td><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b>' + esc(s.student_name || s.student_uid || '-') + '</b>' + kindTag + act + '</div></td>'
            + '<td><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' + levelTag + bookTag + '</div></td>'
            + '<td>' + teacher + '</td>'
            + '<td><code style="font-size:11px;color:#6b7280">' + esc(s.room_id) + '</code>'
            +   (isC24 ? ' <span style="font-size:10px;color:#92400e;font-weight:800">LMS</span>' : '') + '</td>'
            + '</tr>';
        }).join('')
      + '</tbody></table></div>';
  }

  window.tcLoadToday = async function () {
    var box = $('tc-body');
    if (!box) return;
    box.innerHTML = '<div class="empty">' + T('불러오는 중…', 'Loading…') + '</div>';
    try {
      var qs = '';
      var dEl = $('tc-date');
      /* 📆 (2026-08-25 보고서 ③) 날짜를 고르면 «완료된 수업 기록» 이 된다 — 조회는 같은 API 다.
         비워 두면 서버가 오늘(KST)로 본다. 모양이 틀린 값은 서버가 오늘로 되돌린다. */
      if (dEl && /^\d{4}-\d{2}-\d{2}$/.test(dEl.value || '')) qs = '?date=' + encodeURIComponent(dEl.value);
      var r = await fetch('/api/admin/classes/today' + qs, { credentials: 'include' });
      var d = await r.json().catch(function () { return null; });
      /* 🔴 (2026-08-25) 예전엔 `d.ok === false` 만 봤다. 그런데 라우팅이 빠졌을 때 오는 404 본문은
         `{error:'Not Found'}` 라 **`ok` 칸이 아예 없다** → 이 검사를 그냥 통과하고
         `d.sessions || []` 가 빈 배열이 되어 **「오늘 예정된 수업이 없습니다」라는 정상 문구**로 그려졌다.
         그래서 이 카드는 2026-07-23 신설 이래 줄곧 404 였는데 아무도 «고장» 으로 신고하지 않았다.
         ✅ 판정은 «성공이라고 말했는가»(`ok === true` + 목록이 배열) 로 한다 — «실패라고 말했는가» 가 아니라. */
      if (!r.ok) throw new Error('HTTP ' + r.status + (d && d.error ? ' · ' + d.error : ''));
      if (!d || d.ok !== true || !Array.isArray(d.sessions)) {
        throw new Error((d && d.error) || 'load_failed');
      }
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
    /* 📆 날짜를 바꾸면 곧바로 다시 불러온다 — 「바꿨는데 표가 그대로」 를 만들지 않는다.
       ⚠️ render() 가 아니라 로더를 부른다. 날짜가 바뀌면 «서버에서 다시» 받아야 한다. */
    var dt = $('tc-date');
    if (dt && !dt._tcBound) { dt._tcBound = true; dt.addEventListener('change', function () { window.tcLoadToday(); }); }
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
