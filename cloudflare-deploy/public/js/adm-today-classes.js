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
 * - (2026-09-01) 출처 고르기 + 검색창 — 카페24 수업과 «새로 넣은 수업» 을 갈라 본다.
 *   가르는 근거는 서버가 실어 준 `source` 하나다(방 번호로 짐작하지 않는다). 아래 srcFilter 참고.
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

  /* ☎️ 번호 보기 — 저장은 «숫자만» 이다(api-retention.ts 가 정규화해 넣는다).
     ⛔ font-family 를 주지 말 것: 한자 글꼴 통일 가드(hanzi_font_harness)가
        «맨 앞이 MangoiHanSC 가 아니다» 로 FAIL 낸다(CLAUDE.md 2장, 실제로 밟은 함정). */
  function telFmt(p) {
    var d = String(p == null ? '' : p).replace(/[^0-9]/g, '');
    if (d.length === 11) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
    if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d;
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

  /* 🔒 (2026-08-30 사장님 지시 2차) 대체강사 배정은 **강사만** 못 한다.
     처음엔 지사·대리점도 통째로 막았는데, 사장님 지시로 «차단» 이 아니라 «자기 소속 수업만»
     으로 바꿨다 — 「우리 학원 강사가 병가」일 때 본사에 매번 요청하지 않아도 된다.
     ⚠️ 그래서 이 화면은 조직 계정에게도 버튼을 그린다. 안전한 이유는 **이 표 자체가 이미
        잘려 있기** 때문이다 — `/api/admin/classes/today` 가 `scopeStudentCond()` 로 자기 학생의
        수업만 내려준다. 서버도 회차마다 같은 조건으로 다시 확인한다(enroll-ops.ts `subScopeDenied`).
        두 판정이 어긋나면 «화면엔 있는데 눌러도 안 되는 버튼» 이 되므로 같은 함수를 쓴다.
     ⚠️ 신원은 서버가 확인해 주는 window.__ADM_ME(js/adm-identity.js)가 정본이다. 아직 안 왔으면
        «막지 않는다» — 그 사이 눌러도 서버가 거절한다. 신원이 도착하면 `mangoi:identity` 로
        다시 그린다(발행처가 document 라 거기서 듣는다 — CLAUDE.md 2장). */
  function subAllowed() {
    var me = null;
    try { me = window.__ADM_ME || (typeof window.admIdentity === 'function' ? window.admIdentity() : null); } catch (e) {}
    var role = (me && me.role) ? String(me.role) : '';
    if (!role) return true;                       // 아직 모름 — 서버가 최종 판정
    return role !== 'teacher';
  }

  /* 🔗 초대 링크 (2026-08-30 v4 제안서 16)
     [왜] 「화상강의실 초대 관리」가 사이드바에 독립 메뉴로 따로 있었다. 그 화면에서 하는 일은
       «방 번호를 손으로 적고 학생 아이디를 적는 것» 뿐인데, 그 두 값은 바로 이 목록에 이미 있다.
       옮겨 적다 한 글자만 틀려도 아무도 없는 방 링크가 나가서 「학생이 못 들어와요」가 된다.
     [무엇] 이 줄의 방 번호로 입장 링크를 만들어 클립보드에 넣는다. 링크 자체는 서버 토큰이 아니라
       **입장 주소**다 — 실제 입장 인증은 /api/class/verify-room 이 한다(그 게이트는 안 건드린다).
     ⛔ JWT 토큰을 여기서 발급해 링크에 박지 않는다 — 5분짜리라 카톡으로 보내면 대개 이미 만료다.
        토큰 발급·회수가 필요하면 「방 초대」 카드가 그대로 남아 있다(2026-09-01 부터 「시스템 › 화상강의실 초대」).
     ⚠️ 클립보드는 https·사용자 제스처 안에서만 된다. 실패하면 링크를 그대로 보여 준다
        (조용히 실패하면 「눌렀는데 아무 일도 안 일어난다」가 된다). */
  window.tcInviteLink = function (roomId, studentUid) {
    var url = location.origin + '/?vc_room=' + encodeURIComponent(roomId);
    if (studentUid) url += '&uid=' + encodeURIComponent(studentUid);
    function fallback() {
      window.prompt(T('아래 링크를 복사해 학생에게 보내세요', 'Copy this link and send it to the student'), url);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          if (window.mangoiToast) window.mangoiToast(T('초대 링크를 복사했습니다', 'Invite link copied'));
          else fallback();
        }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
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
  var _contactSrc = '';   // 서버가 준 연락처 근거('retention' | 'restricted')

  /* 🔎 (2026-09-01 사장님 요청) 「카페24 수업」과 「우리가 새로 넣은 수업」 가르기 + 검색.
     [왜] 오늘 목록 166건 중 142건이 카페24라, 새로 넣은 수업이 그 안에 파묻혀 눈으로 못 찾았다.
     [무엇으로 가르나] **서버가 실어 준 `source`** 하나다('mangoi' | 'cafe24' — api-admin.ts).
       ⛔ 방 번호 접두사(`c24-`)로 짐작하지 말 것 — 판정이 두 벌이 되면 언젠가 어긋난다.
     ⚠️ 카페24 줄은 `join_open` 이 **항상 false** 다(망고아이 방이 없다). 그래서
        「지금 들어갈 수 있는 것만」 + 「카페24」 조합은 0건이 정상이고, 그때 화면이 «왜 비었는지»
        를 말해 줘야 한다(아니면 「검색이 고장났다」로 읽힌다). */
  function srcFilter() {
    var el = $('tc-source');
    var v = el ? String(el.value || '') : '';
    return (v === 'mangoi' || v === 'cafe24') ? v : '';
  }
  function qFilter() {
    var el = $('tc-q');
    return el ? String(el.value || '').trim().toLowerCase() : '';
  }
  /* 한 줄에서 검색이 훑는 칸 — 학생·강사·강의실·교재·레벨. 옮겨 적은 방 번호로 찾는 일이 잦아
     room_id 를 반드시 포함한다(예: 「c24-512074」·「class-1015-20260901」). */
  function rowText(s) {
    return [
      s.student_name, s.student_uid, s.teacher_name, s.substituted_from,
      s.room_id, s.textbook, s.level, s.start_time,
      /* 🏫☎️ (2026-09-07) 학원 이름·연락처로도 찾을 수 있게 — 매니저는 「○○학원 학생들」 이나
         번호 뒷자리로 찾는다. 칸을 화면에 그렸으면 검색도 함께 넓혀야 한다
         (안 그러면 「보이는데 검색하면 0건」이 된다 — CLAUDE.md 2장). */
      s.academy, s.contact_phone,
      /* ⚠️ 화면은 번호를 끊어서 그린다(telFmt). 저장값(01012345678)만 훑으면
         **화면에 보이는 그대로**(「010-1234-5678」·「010-1234」) 쳤을 때 0건이 된다 —
         「보이는데 검색하면 아무것도 없다」(CLAUDE.md 2장). 둘 다 넣는다. */
      telFmt(s.contact_phone)
    ].filter(Boolean).join(' ').toLowerCase();
  }

  /* 📣 (2026-09-01 A안) 「오늘 수업」 탭 줄이 숫자를 그린다 — 세는 곳은 여기 하나뿐이고
     탭은 받아 적기만 한다(같은 계산을 두 벌 두면 반드시 어긋난다).
     ⚠️ 관리자 화면의 이벤트는 document 에서 쏜다(adm-core 의 lang 이벤트와 같은 자리).
     ⚠️ 던지면 안 된다 — 이 함수는 목록을 그리는 길목이다. */
  function announceCounts(shown) {
    try {
      document.dispatchEvent(new CustomEvent('mangoi:today-counts', { detail: {
        total: _rows.length,
        live: _rows.filter(function (s) { return s.join_open; }).length,
        shown: shown
      } }));
    } catch (e) { /* 무시 */ }
  }

  /* ☎️ 연락처가 «왜 대부분 비어 있는지» — 서버가 준 근거로만 말한다(_contactSrc).
     ⛔ 화면이 스스로 판정하지 않는다: 화면은 자기 역할도, 그 표의 성격도 모른다.
     ⚠️ 폰에는 hover 가 없어 title 로는 못 전한다 → **보이는 줄**로 그린다. */
  function contactNote(missing, total) {
    if (!missing) return '';
    if (_contactSrc === 'restricted') {
      return T('☎ 연락처는 본사 계정에서만 보입니다.',
               'Contact numbers are visible to HQ accounts only.');
    }
    return T('☎ 연락처 ' + missing + '/' + total + '건이 «—» 입니다 — 학생 명부에는 번호가 저장돼 있지 않고, '
           + '«관리 대상(만료·휴면)» 명단에 오른 학생만 번호가 있습니다.',
             '☎ ' + missing + ' of ' + total + ' have no number — the student roster stores no phone numbers; '
           + 'only students on the at-risk (expiring/inactive) list have one.');
  }

  /* 📚 (2026-09-08 사장님 요청) «교재 미배정» 이 몇 건인지 목록 위에서 한 번 말하고,
     그 자리에서 기존 「일괄 교재 배정」 모달을 연다.
     [왜 줄마다가 아니라 여기인가] 배지는 줄마다 뜨는데, 2026-09-08 운영 D1 실측으로
       students_erp.textbook 이 채워진 학생이 **29,485명 중 0명**이었다. 그래서 그 노란 배지가
       «예외 표시» 가 아니라 모든 줄의 배경색이 되어 있었고, 숫자로 한 번 말해 주지 않으면
       아무도 «몇 건인지» 를 모른다.
     ⛔ 배지를 눌러 «교재 업로드» 화면으로 보내지 않는다 — 같은 날 실측으로 서버에는 교재 파일이
        이미 38,998장(2,791묶음) 있고, 비어 있는 것은 «이 학생 = 이 교재» 연결 하나다.
        업로더는 textbook_files 에 쓰므로 아무리 올려도 이 배지는 그대로 남는다(읽는 칸이 다르다).
     ⚠️ 배정 판정과 상한(대상 미리보기 강제 · 미배정 학생만 · 2000명 초과 force)은 전부
        그 모달과 서버에 이미 있다. 여기서 다시 만들지 않는다 — 문만 하나 더 낸 것이다.
     ⛔ 이 줄을 display:flex 로 감싸지 말 것 — 짧은 글이 낱글자로 쪼개진다(CLAUDE.md 2장). */
  function bookNoteHtml(missing, total) {
    if (!missing) return '';
    /* ⚠️ 짧게 쓴다 — 1500px 창에서도 이 카드 폭이 좁아(관리자 zoom 1.3) 긴 문장은 세 줄로 접힌다.
       실측으로 세 줄이 나와 한 번 줄인 문장이다(브라우저 검사 ⑥절이 두 줄 이내로 못 박는다). */
    var msg = T('📚 표시된 ' + total + '건 중 ' + missing + '건이 교재 미배정 — 학생 명부의 교재 칸이 비어 있습니다.',
                '📚 ' + missing + ' of ' + total + ' shown have no textbook — the student roster field is empty.');
    /* 🎨 클래스는 `tc-act` 를 그대로 쓴다 — admin-inline-c.css 의 특이성 꼬리 규칙이
       전역 「카드 안 button = 파란 알약」을 이미 이기고 있어 새 CSS 를 만들지 않아도 된다.
       ⛔ 클래스 이름을 «-btn» 으로 끝내지 말 것(같은 파일 9503행 경고 — 이 버튼만 흰 버튼이 된다). */
    return '<div style="padding:6px 2px 8px;color:#92400e;font-size:11.5px;line-height:1.6">'
      + esc(msg)
      + ' <button type="button" id="tc-bulk-book" class="tc-act" title="'
      + T('학생 교재 일괄 배정 창을 엽니다 (대상 미리보기 → 실행)',
          'Opens bulk textbook assignment (preview targets, then run)')
      + '">' + T('📚 일괄 배정', '📚 Bulk assign') + '</button>'
      + '</div>';
  }

  function render() {
    var box = $('tc-body'), cntEl = $('tc-count');
    if (!box) return;
    var onlyLive = !!($('tc-only-live') && $('tc-only-live').checked);
    var src = srcFilter(), q = qFilter();
    var rows = _rows.filter(function (s) {
      if (onlyLive && !s.join_open) return false;
      if (src && (s.source === 'cafe24' ? 'cafe24' : 'mangoi') !== src) return false;
      if (q && rowText(s).indexOf(q) < 0) return false;
      return true;
    });
    var filtering = !!(src || q);

    if (!rows.length) {
      /* 비어 있는 이유를 그 자리에서 말한다 — 「거르는 중이라 없는 것」과 「원래 없는 것」은 다르다 */
      var why;
      if (filtering) {
        why = T('조건에 맞는 수업이 없습니다', 'No classes match the filter')
          + ' (' + (src === 'cafe24' ? T('카페24', 'cafe24') : src === 'mangoi' ? T('망고아이', 'Mangoi') : T('전체', 'All'))
          + (q ? ' · "' + esc(q) + '"' : '')
          + (onlyLive ? ' · ' + T('지금 입장가능만', 'joinable only') : '')
          + ') · ' + T('전체 ', 'total ') + _rows.length + T('건', '');
      } else {
        why = onlyLive
          ? T('지금 들어갈 수 있는 수업이 없습니다.', 'No classes are joinable right now.')
          : T('오늘 예정된 수업이 없습니다.', 'No classes scheduled today.');
      }
      box.innerHTML = '<div class="empty">' + why + '</div>';
      if (cntEl) cntEl.textContent = filtering ? T('0건 표시', '0 shown') : '';
      announceCounts(0);
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
      /* 🔎 거르는 중이면 «몇 건이 보이는지» 를 맨 앞에 둔다 — 합계만 보이면 「검색했는데 숫자가
         안 변한다」가 되고, 반대로 합계를 지우면 「수업이 사라졌다」로 읽힌다. 둘 다 보여 준다. */
      var shown = filtering ? T('표시 ' + rows.length + '건 / 전체 ', rows.length + ' shown / ') : '';
      /* 🥭 새로 넣은 수업 건수도 함께 — 사장님이 찾는 것이 대개 이쪽이다(카페24 142건에 파묻힌다) */
      var mg = _rows.length - c24;
      cntEl.textContent = T(
        shown + _rows.length + '건 · 지금 입장가능 ' + live + '건' + (c24 ? ' · 카페24 ' + c24 + '건' : '')
          + (mg ? ' · 망고아이 ' + mg + '건' : '')
          + (lt ? ' · 레벨테스트 ' + lt + '건' : ''),
        shown + _rows.length + ' total · ' + live + ' joinable now' + (c24 ? ' · ' + c24 + ' on cafe24' : '')
          + (mg ? ' · ' + mg + ' on Mangoi' : '')
          + (lt ? ' · ' + lt + ' level test' : '')
      );
    }

    /* 🚪 (2026-07-24 강사 피드백) "입장 버튼이 학생 이름과 멀리 떨어져 있어 다른 방에 잘못 들어간다"
       → 액션 버튼을 별도 맨 끝 열이 아니라 학생 이름 칸 바로 옆에 붙여, 줄을 눈으로 훑지 않고
       같은 칸만 보고 누를 수 있게 한다. */
    var note = contactNote(rows.filter(function (s) { return !s.contact_phone; }).length, rows.length);
    /* 📚 «표시된 줄» 기준으로 센다 — 거르는 중이면 합계가 아니라 눈앞의 목록을 말해야 한다.
       (합계로 세면 「8건 보이는데 142건 미배정」 이 되어 무엇을 눌러야 하는지 흐려진다) */
    var bookLine = bookNoteHtml(rows.filter(function (s) { return !s.textbook_assigned; }).length, rows.length);
    box.innerHTML = (note
        ? '<div style="padding:6px 2px 8px;color:#6b7280;font-size:11.5px;line-height:1.6">' + esc(note) + '</div>'
        : '')
      + bookLine
      + '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">'
      + '<thead><tr>'
      +   '<th>' + T('시간', 'Time') + '</th>'
      +   '<th>' + T('상태', 'Status') + '</th>'
      +   '<th>' + T('학생 / 액션', 'Student / Action') + '</th>'
      +   '<th>' + T('연락처', 'Contact') + '</th>'
      +   '<th>' + T('학원', 'Academy') + '</th>'
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
            /* 🔐 (2026-08-30 v4 제안서 16) 초대 링크 — 독립 메뉴를 없애고 «수업 옆» 으로 옮긴 것.
               방 번호를 손으로 옮겨 적던 일이 사라진다(옮겨 적다 틀리면 빈 방이 열린다). */
            act += '<button type="button" class="tc-act tc-act-invite" onclick="tcInviteLink(decodeURIComponent(\'' + rid + '\'),decodeURIComponent(\'' + esc(encodeURIComponent(s.student_uid || '')) + '\'))" '
                + 'title="' + T('이 수업의 입장 링크를 만들어 복사합니다', 'Create and copy the join link for this class') + '">'
                + T('🔗 초대 링크', '🔗 Invite link') + '</button>';
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
          /* ☎️🏫 (2026-09-07 매니저 요청 «student Name, ID, contact number, Academy»)
             수업에 안 들어오는 학생을 그 줄에서 바로 찾기 위한 칸.
             ⛔ 없을 때 다른 값으로 채우지 않는다 — «—» 와 «왜 없는지» 를 적는다
                (빈칸은 «고장» 으로 읽힌다: CLAUDE.md 2장 「모르면 모른다고 말하게 하라」).
             ☎ 는 tel: 링크다 — 매니저 대부분이 폰으로 이 화면을 본다. */
          var contact = s.contact_phone
            ? '<a href="tel:' + esc(String(s.contact_phone).replace(/[^0-9+]/g, '')) + '" '
              + 'style="font-size:11.5px;color:#1d4ed8;text-decoration:none;white-space:nowrap" '
              + 'title="' + T('눌러서 전화 걸기', 'Tap to call') + '">☎ ' + esc(telFmt(s.contact_phone)) + '</a>'
            /* ⛔ 이유를 `title` 로만 달지 말 것 — title 툴팁은 **마우스 전용**이라
               폰에서는 영원히 안 뜬다(CLAUDE.md 2장). 매니저는 대부분 폰으로 본다.
               → 칸에는 «—» 만 두고, **이유는 목록 위에 보이는 줄로 한 번** 말한다(contactNote).
                 줄마다 반복해 적으면 76% 의 줄이 같은 문장으로 시끄러워진다. */
            : '<span style="color:#9ca3af;font-size:11px">—</span>';
          var academy = s.academy
            ? '<span style="font-size:11.5px;color:#475569;white-space:nowrap">' + esc(s.academy) + '</span>'
            : '<span style="color:#9ca3af;font-size:11px">—</span>';

          /* 🔄 (2026-08-28) 대체강사 배정 — 강사 병가·휴가 대응. 카페24 수업은 망고아이 쪽
             예약(schedule_id)이 없어 대상이 아니다(위 「입장 불가」 와 같은 이유).
             ⛔ (2026-08-30) 클래스 이름을 «-btn» 으로 끝내지 말 것 — admin-inline-c.css 의
                `html[data-admin-theme="ivory"] [id^="card-"] [class$="-btn"]:not(…)×8` (0,11,1) 이
                `button.tc-act:not(…)×6` (0,7,1) 을 이겨 이 버튼만 «흰 버튼» 이 된다(실측:
                background #ffffff · color #344054 — 옆 참관 칩은 보라). 그 파일 9503·9710·9737 행에
                같은 경고가 세 번 적혀 있다. 그래서 `tc-sub-act` 다. */
          if (!isC24 && s.schedule_id && subAllowed()) {
            teacher += '<button type="button" class="tc-act tc-sub-act" onclick="tcOpenSubModal(' + Number(s.schedule_id) + ')" '
              + 'title="' + T('대체강사 배정', 'Assign substitute teacher') + '">🔄</button>';
          }
          return '<tr>'
            + '<td style="white-space:nowrap">' + hhmm(s.start_ts) + '</td>'
            + '<td>' + badge(s.status) + '</td>'
            + '<td><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b>' + esc(s.student_name || s.student_uid || '-') + '</b>' + kindTag + act + '</div>'
              /* 🆔 아이디 — 이름이 같은 학생이 실재해서(동명이인) 매니저가 확정하려면 필요하다.
                 ⛔ display:flex 로 감싸지 말 것 — 짧은 글이 낱글자로 쪼개진다(CLAUDE.md 2장). */
              + (s.student_uid && s.student_name
                  ? '<div style="font-size:10.5px;color:#6b7280;letter-spacing:0.2px">' + esc(s.student_uid) + '</div>'
                  : '')
            + '</td>'
            + '<td>' + contact + '</td>'
            + '<td>' + academy + '</td>'
            + '<td><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' + levelTag + bookTag + '</div></td>'
            + '<td>' + teacher + '</td>'
            + '<td><code style="font-size:11px;color:#6b7280">' + esc(s.room_id) + '</code>'
            +   (isC24 ? ' <span style="font-size:10px;color:#92400e;font-weight:800">LMS</span>' : '') + '</td>'
            + '</tr>';
        }).join('')
      + '</tbody></table></div>';
    /* 🔗 인라인 onclick 을 쓰지 않는다 — 이 파일은 IIFE 라 안쪽 함수가 전역이 아니고,
       인라인 핸들러는 언제나 window 에서 이름을 찾아 ReferenceError 가 난다(CLAUDE.md 2장).
       render() 가 통째로 다시 그리므로 리스너는 쌓이지 않는다. */
    var bulkBtn = $('tc-bulk-book');
    if (bulkBtn) {
      bulkBtn.addEventListener('click', function () {
        /* ⛔ 이 화면이 배정을 «직접» 하지 않는다 — 대상 미리보기를 강제하는 그 모달로만 간다.
           ⚠️ 함수가 없으면(스크립트 미로드·이름 변경) 조용히 넘기지 말고 사람에게 말한다 —
              아무 일도 안 일어나면 «버튼이 고장났다» 로 읽힌다. */
        if (typeof window.mangoiOpenBulkTextbook === 'function') { window.mangoiOpenBulkTextbook(); return; }
        alert(T('교재 배정 창을 열지 못했습니다. 새로고침 후 다시 시도해 주세요.',
                'Could not open the textbook assignment dialog. Please refresh and try again.'));
      });
    }
    announceCounts(rows.length);
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
      /* 🔒 (2026-09-01) 403 은 «고장» 이 아니라 «권한» 이다 — 사실대로 말하고 끝낸다.
         [왜 생겼나] 이 칸이 사이드바 「오늘 › 오늘 수업」의 목적지가 되면서, 저장값이 없는
           첫 방문은 여기에 착지한다. 그런데 /api/admin/classes/today 는 강사 차단 경로라
           강사 계정에는 「⚠ 불러오기 실패: HTTP 403」이라는 **빨간 오류 상자**가 떴다.
           쓰는 사람은 그것을 «화면이 깨졌다» 로 읽는다. */
      if (r.status === 403) {
        box.innerHTML = '<div class="empty" style="color:#6b7280;line-height:1.7">🔒 '
          + T('이 목록은 본사 관리자·매니저만 볼 수 있습니다.',
              'This list is visible to HQ managers only.') + '</div>';
        return;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status + (d && d.error ? ' · ' + d.error : ''));
      if (!d || d.ok !== true || !Array.isArray(d.sessions)) {
        throw new Error((d && d.error) || 'load_failed');
      }
      /* ☎️ 연락처 근거는 서버 말을 그대로 받는다(모르면 빈 값 → 안내를 안 그린다) */
      _contactSrc = (d.contact_source === 'retention' || d.contact_source === 'restricted') ? d.contact_source : '';
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

  /* 안내 문구도 함께 — 버튼이 없는데 「[🔄] 버튼 = 대체강사 배정」이라고 적혀 있으면
     그게 곧 「내 화면에는 없는 것이 남의 화면에는 있다」 제보가 된다(CLAUDE.md 2장). */
  function syncSubHelp() {
    var h = $('tc-sub-help');
    if (h) h.style.display = subAllowed() ? '' : 'none';
  }

  function bind() {
    var b = $('tc-load');
    if (b && !b._tcBound) { b._tcBound = true; b.addEventListener('click', window.tcLoadToday); }
    var c = $('tc-only-live');
    if (c && !c._tcBound) { c._tcBound = true; c.addEventListener('change', render); }
    /* 🔎 출처·검색은 **화면 안에서만** 거른다 — 서버를 다시 부르지 않는다(이미 받아 둔 목록이라
       한 글자 칠 때마다 요청이 나갈 이유가 없다). 날짜만 서버를 다시 부른다(아래).
       ⚠️ 입력칸은 #tc-body «밖» 이라 다시 그려도 포커스·커서가 그대로다 — 안에 두면 한 글자마다
          포커스가 날아가 「한 글자만 쳐진다」가 된다. */
    var sf = $('tc-source');
    if (sf && !sf._tcBound) { sf._tcBound = true; sf.addEventListener('change', render); }
    var qf = $('tc-q');
    if (qf && !qf._tcBound) {
      qf._tcBound = true;
      qf.addEventListener('input', render);
      /* type=search 의 ✕ 는 브라우저마다 input 대신 search 만 쏘는 경우가 있어 둘 다 듣는다 */
      qf.addEventListener('search', render);
    }
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
  syncSubHelp();
  /* 신원은 나중에 온다 — 그때 버튼·안내를 다시 맞춘다. ⛔ 상주 감시(MutationObserver·
     setInterval)는 쓰지 않는다(홈을 통째로 멎게 한 전력 — CLAUDE.md 2장). */
  document.addEventListener('mangoi:identity', function () { syncSubHelp(); if (_rows.length) render(); });
  window.addEventListener('mangoi:identity', function () { syncSubHelp(); if (_rows.length) render(); });
})();
