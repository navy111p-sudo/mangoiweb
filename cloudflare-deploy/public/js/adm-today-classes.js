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

  /* 🌙 (2026-09-08 사장님 요청) 「23시 이후」 거르기 — 늦은 밤 수업만 따로 본다.
     [무엇을 재나] 그 수업의 **시작 시각(KST)** 하나다. 시(hour)는 화면에 그린 벽시계 문자열
       (hhmm 의 toLocaleTimeString)을 **다시 파싱하지 말고** «+9시간 뒤 UTC 시» 로 곧장 센다
       — 그 문자열은 로케일·엔진이 정하는 표시용 값이라 판정의 근거로 삼을 것이 못 된다
       (자정을 '24:00' 으로 주는 판이 있다고 알려져 있는데, **이 컨테이너 Node ICU 78 에서는
       '00:00' 이라 재현하지 못했다** — 못 본 것을 봤다고 적지 않는다). 여기서 재는 값은
       그래서 «표시» 와 무관하게 결정론이다.
     ⚠️ 이 목록은 **하루치**다(날짜 칸이 정하는 그 날). 그래서 여기서 걸러지는 것은
        23:00~23:59 이고, 자정을 넘긴 00:10 수업은 «그 날짜 목록의 맨 앞» 에 있지
        23시 뒤에 있지 않다. 라벨도 그렇게 적어 둔다(「23시 이후」가 새벽까지 포함한다고
        읽히면 「필터가 빠뜨린다」는 제보가 된다).
     ⛔ 문턱을 화면 여러 곳에 적지 말 것 — 여기 한 줄이 정본이다. */
  var LATE_FROM_HOUR = 23;
  /* 🌙🌒 (2026-09-09 사장님 요청) 「자정 이후까지 보는 야간」 — 위 「23시 이후」의 짝이다.
     [무엇이 다른가] 이 목록은 여전히 **하루치**이고, 그 하루의 «양 끝» 이 둘 다 밤이다:
       새벽 00:00~05:59 (= 전날 밤에서 이어진 수업) + 밤 23:00~23:59 (= 그날 밤의 시작).
       「23시 이후」는 뒤쪽만 보고, 「야간」은 둘 다 본다.
     📊 [잰 것] CLAUDE.md 배포창 항목의 실측에 00:00~00:20 접속 22건 · 00:40~01:10 이 있다.
       그것이 「23시 이후」에 안 걸리던 바로 그 수업들이다. 06시를 끝으로 둔 것은 그 실측(01:10)을
       넉넉히 덮으면서 아침 수업과 섞이지 않는 자리라서다.
     ⚠️ 그래도 **«자정을 넘겨 이어지는 한 판»** 을 한 화면에 모아 주지는 못한다 — 오늘 23:40 수업의
        이어지는 00:20 은 «내일 날짜» 목록에 있다(서버가 날짜로 자른다). 그래서 화면이 그 사실을
        말해 준다(nightNote) — 감추면 「필터가 빠뜨린다」는 제보가 된다.
     ⛔ 문턱 둘은 여기 두 줄이 정본이다(화면 HTML 에 숫자를 다시 적지 말 것). */
  var NIGHT_UNTIL_HOUR = 6;          // 새벽 끝(이 시각 «전» 까지) — 06:00 부터는 아침
  function kstHour(ts) {
    var n = Number(ts);
    /* 모르면 «늦은 밤 아님» 으로 떨어뜨린다 — 즉 거르기를 **켜면 그 줄은 화면에서 빠진다**.
       ⛔ 「삼키지 않는다」로 읽지 말 것: 빠지는 게 맞다(모르는 것을 «23시 이후» 라고
          말하는 쪽이 더 나쁘다). 끄면 그대로 돌아오고, 그동안에도 «전체 N건» 에는 남는다. */
    if (!isFinite(n) || !n) return -1;
    return new Date(n + 9 * 3600 * 1000).getUTCHours();
  }
  function isLate(s) { return kstHour(s.start_ts) >= LATE_FROM_HOUR; }
  /* 🌒 새벽 — ⛔ `h < NIGHT_UNTIL_HOUR` «만» 쓰지 말 것: 시각을 모르는 줄은 kstHour 가 -1 이라
     그 조건을 그냥 통과해 «모르는 것» 이 새벽으로 둔갑한다(23시 쪽과 반대 방향의 사고).
     반드시 `h >= 0` 을 짝으로 둔다. */
  function isDawn(s) { var h = kstHour(s.start_ts); return h >= 0 && h < NIGHT_UNTIL_HOUR; }
  /* 고른 모드에 걸리는가 — 'late' 는 밤만, 'night' 는 밤 + 새벽. 모르는 모드는 «안 거른다». */
  function inNight(s, mode) {
    if (mode === 'late') return isLate(s);
    if (mode === 'night') return isLate(s) || isDawn(s);
    return true;
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
  /* ══════════════════════════════════════════════════════════════════════
     📅 (2026-09-22) 줄에서 바로 연기 · 변경 · 취소 — manager.html 의 taRun 과 «같은 서버 경로».
     ⚠️ 새 판정을 만들지 않는다:
        · 연기·변경 → POST /schedule-requests(기록) → POST /schedule-requests/decide(적용)
          (겹침 검사·반복수업 자동이동 거부·스코프 재확인·강사 차단·변경이력을 서버가 한다)
        · 취소 → DELETE /class-schedules/:id (status='cancelled' + 이력)
          ⛔ request_type:'cancel' 로 보내지 말 것 — 서버 승인이 그것을 status='postponed' 로
             적어(급여 규칙이 걸림) 화면이 거짓말을 하게 된다(CLAUDE.md 2장).
     ⛔ 취소는 막는 쪽으로 실패: can_move===true · 역할을 «알고» 본사 계열일 때만.
        (DELETE 는 지사·대리점에 403 — 주면 «눌러도 안 되는 버튼».)
     ══════════════════════════════════════════════════════════════════════ */
  var _mvChanged = false;
  function mvRowOf(sid) {
    for (var i = 0; i < _rows.length; i++) if (String(_rows[i].schedule_id) === String(sid)) return _rows[i];
    return null;
  }
  function mvMe() {
    var me = null;
    try { me = window.__ADM_ME || null; } catch (e) {}
    return me;
  }
  function mvCanCancel(r) {
    var me = mvMe();
    var role = (me && me.role) ? String(me.role) : '';
    if (!role) return false;                                         // 모르면 안 준다
    if (role === 'teacher' || role === 'branch' || role === 'agency' || role === 'franchise') return false;
    return r && r.can_move === true;
  }
  function mvMsgOf(j) {
    var a = j && j.applied;
    if (a === 'moved')     return { ok: true,  s: T('이번 한 번 옮겼습니다.', 'Moved (this class only).') };
    if (a === 'postponed') return { ok: true,  s: T('연기 처리했습니다.', 'Postponed.') };
    if (a === 'recorded')  return { ok: false, s: T('반복 수업이라 자동으로 못 옮깁니다 — 시간표에서 직접 옮겨 주세요.', 'Weekly class — move it by hand in the timetable.') };
    if (a === 'conflict')  return { ok: false, s: T('그 시간에 다른 수업이 있어 못 옮겼습니다 — 직접 옮겨 주세요.', 'That slot is taken — move it by hand.') };
    return { ok: true, s: T('처리했습니다.', 'Done.') };
  }
  function mvErrOf(st, j) {
    var e = (j && j.error) || '';
    if (e === 'forbidden_teacher') {
      var w = (j && (isEn() ? j.who_line_en : j.who_line)) || '';
      return T('강사 계정은 처리할 수 없습니다.', 'Teachers cannot do this.') + (w ? ' ' + w : '');
    }
    if (st === 403 || e === 'forbidden_scope') return T('권한 밖의 수업입니다.', 'Not in your scope.');
    if (st === 409 || e === 'already_decided') return T('이미 처리된 요청입니다.', 'Already handled.');
    if (st === 404) return T('수업을 찾을 수 없습니다.', 'Class not found.');
    return T('처리하지 못했습니다. 다시 눌러 주세요.', 'Failed. Try again.');
  }
  function mvReq(method, path, payload) {
    return fetch(path, {
      method: method, credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload || {})
    }).then(function (rs) {
      return rs.json().catch(function () { return null; }).then(function (j) { return { st: rs.status, j: j }; });
    });
  }
  function tcMoveModalClose() {
    var b = $('tc-move-modal');
    if (b && b.parentNode) b.parentNode.removeChild(b);
    if (_mvChanged) { _mvChanged = false; try { window.tcLoadToday(); } catch (e) {} }
  }
  /* 동작별 색 — 연기=호박(이번 한 번) · 변경=남색(앞으로 계속) · 취소=빨강. */
  /* ⚠️ 눌린 상태를 «짙은 바탕 + 흰 글자» 로 칠하지 않는다 — 관리자 화면의 밝기 페인터
        (js/adm-light-surfaces.js)가 짙은 인라인 바탕을 밝게 덮어 «흰 바탕에 흰 글자» 가 된다
        (2026-09-23 브라우저 실측). 옅은 바탕 + 짙은 글자 + 두꺼운 테두리로 — 페인터가 안 건드린다. */
  var MV_COLOR = { postpone: ['#b45309', '#fff4e0'], series: ['#3b3fc4', '#ecedff'], cancel: ['#b42318', '#fdecea'] };
  function mvModeStyle(el, mode, on) {
    var c = MV_COLOR[mode] || ['#1d4ed8', '#eff6ff'];
    el.style.border = (on ? '2px solid ' + c[0] : '2px solid #d1d5db');
    el.style.background = on ? c[1] : '#fff';
    el.style.color = on ? c[0] : '#111827';
  }
  function mvBtn(mode, label, on) {
    var c = MV_COLOR[mode] || ['#1d4ed8', '#eff6ff'];
    return '<button type="button" data-mv-mode="' + mode + '" aria-pressed="' + (on ? 'true' : 'false') + '" '
      + 'style="padding:6px 12px;border-radius:8px;border:2px solid ' + (on ? c[0] : '#d1d5db') + ';'
      + 'background:' + (on ? c[1] : '#fff') + ';color:' + (on ? c[0] : '#111827') + ';font-weight:800;cursor:pointer">'
      + label + '</button>';
  }
  function mvSubBtn(sub, label, on) {
    return '<button type="button" data-mv-sub="' + sub + '" aria-pressed="' + (on ? 'true' : 'false') + '" '
      + 'style="padding:6px 10px;border-radius:8px;font-size:12.5px;cursor:pointer;color:#111827;'
      + 'border:1.5px solid ' + (on ? '#b45309' : '#d1d5db') + ';background:' + (on ? '#fff4e0' : '#fff') + ';font-weight:' + (on ? '800' : '500') + '">'
      + label + '</button>';
  }
  /* 📅 날짜 칸 — 「9/24 (목)」. 요일은 UTC 로 뽑는다(로컬 시간대면 하루 밀린다). */
  function mvDayLabel(iso) {
    var d = new Date(iso + 'T00:00:00Z');
    var w = isEn() ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] : ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' (' + w + ')';
  }
  function mvAddDays(iso, n) {
    return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  }
  /* 지금 고른 동작 — 'hold'(완전히 연기) · 'date'(지정한 날짜로 연기) · 'series'(변경·계속) · 'cancel'. */
  function mvAct() {
    var box = $('tc-move-modal'); if (!box) return 'hold';
    var on = box.querySelector('[data-mv-mode][aria-pressed="true"]');
    var mode = on ? on.getAttribute('data-mv-mode') : 'postpone';
    if (mode !== 'postpone') return mode;
    var sb = box.querySelector('[data-mv-sub][aria-pressed="true"]');
    return (sb && sb.getAttribute('data-mv-sub') === 'date') ? 'date' : 'hold';
  }
  function mvChip(kind, val, label, on) {
    return '<button type="button" data-mv-' + kind + '="' + esc(val) + '" aria-pressed="' + (on ? 'true' : 'false') + '" '
      + 'style="padding:5px 0;border-radius:8px;font-size:12px;cursor:pointer;min-width:' + (kind === 'day' ? '64px' : '52px') + ';'
      + 'border:2px solid ' + (on ? '#065f46' : '#e2e8f0') + ';background:' + (on ? '#d1fae5' : '#f8fafc') + ';color:' + (on ? '#065f46' : '#101828') + ';font-weight:' + (on ? '900' : '600') + '">'
      + esc(label) + '</button>';
  }
  function mvPaintChips(base, orig) {
    var dEl = $('tc-mv-date'), tEl = $('tc-mv-time');
    var dv = dEl ? dEl.value : '', tv = tEl ? tEl.value : '';
    var dh = '';
    for (var i = 0; i < 14; i++) { var iso = mvAddDays(base, i); dh += mvChip('day', iso, mvDayLabel(iso), iso === dv); }
    if (dv && dh.indexOf('"' + dv + '"') < 0) dh += mvChip('day', dv, mvDayLabel(dv), true);
    var th = '', seen = {};
    for (var m = 7 * 60; m <= 23 * 60 + 40; m += 20) {
      var hm = (m / 60 < 10 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60);
      seen[hm] = 1; th += mvChip('hm', hm, hm, hm === tv);
    }
    if (tv && !seen[tv]) th = mvChip('hm', tv, tv, true) + th;
    var a = $('tc-mv-days'), b = $('tc-mv-hms');
    if (a) a.innerHTML = dh;
    if (b) b.innerHTML = th;
  }
  function tcOpenMoveModal(sid) {
    var r = mvRowOf(sid);
    if (!r) return;
    tcMoveModalClose();
    var dEl = $('tc-date');
    var day = (dEl && /^\d{4}-\d{2}-\d{2}$/.test(dEl.value || '')) ? dEl.value : kstTodayStr();
    var canCancel = mvCanCancel(r);
    _mvData = null; _mvPick = ''; _mvSer = null;
    var who = String(r.student_name || r.student_uid || '');
    var inp = 'padding:6px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#101828;box-sizing:border-box';
    var box = document.createElement('div');
    box.id = 'tc-move-modal';
    box.setAttribute('data-day', day);
    box.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,0.55);display:flex;justify-content:center;padding:16px;overflow-y:auto';
    box.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:440px;width:100%;margin:auto;padding:18px;box-shadow:0 20px 50px -10px rgba(0,0,0,0.4);color:#111827">'
      + '<div style="font-weight:800;font-size:15px;margin-bottom:4px">📅 ' + T('수업 연기·변경', 'Postpone / move class') + '</div>'
      + '<div style="font-size:12.5px;color:#475467;margin-bottom:12px">' + esc(who) + ' · ' + esc(day) + ' ' + esc(hhmm(r.start_ts)) + (r.teacher_name ? ' · ' + esc(r.teacher_name) : '') + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'
      +   mvBtn('postpone', T('⏸ 연기 <small style="font-weight:500">이번 한 번</small>', '⏸ Postpone <small style="font-weight:500">once</small>'), true)
      +   mvBtn('series', T('🔄 변경 <small style="font-weight:500">앞으로 계속</small>', '🔄 Change <small style="font-weight:500">from now on</small>'), false)
      +   (canCancel ? mvBtn('cancel', T('수업 취소', 'Cancel class'), false) : '')
      + '</div>'
      /* ⏸ 연기 = «이번 한 번». 두 갈래: 날짜 미정 / 지정한 날짜 (2026-09-23 사장님 샘플 C). */
      + '<div id="tc-mv-sub" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'
      +   mvSubBtn('hold', T('완전히 연기 (날짜 미정)', 'Postpone (no new date)'), true)
      +   mvSubBtn('date', T('지정한 날짜로 연기', 'Postpone to a date'), false)
      + '</div>'
      + '<div id="tc-mv-when" hidden style="display:none;margin-bottom:10px">'
      +   '<div id="tc-mv-when-l" style="font-size:12px;font-weight:700;color:#344054;margin-bottom:4px"></div>'
      +   '<div id="tc-mv-days" style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px"></div>'
      +   '<div id="tc-mv-hms" style="display:flex;flex-wrap:wrap;gap:4px;max-height:124px;overflow-y:auto;margin-top:6px"></div>'
      +   '<div style="font-size:11.5px;color:#475467;margin-top:6px">' + T('다른 날짜·시각', 'Other date/time') + ' '
      +     '<input type="date" id="tc-mv-date" value="' + esc(day) + '" style="' + inp + ';font-size:12px;padding:3px"> '
      +     '<input type="time" id="tc-mv-time" step="600" value="' + esc(String(r.start_time || '').slice(0, 5)) + '" style="' + inp + ';font-size:12px;padding:3px"></div>'
      + '</div>'
      /* 📅 (2026-09-23 Karl 제안) 새 시간에 되는 강사 — 날짜·시각 변경일 때만 */
      + '<div id="tc-mv-teachers" hidden style="display:none;font-size:12px;line-height:1.6;color:#344054;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-bottom:10px"></div>'
      /* 🔄 변경(앞으로 계속) 미리보기 — 서버가 «어느 회차가 어떻게 바뀌는지» 를 먼저 세어 준다. */
      + '<div id="tc-mv-series" hidden style="display:none;font-size:12px;line-height:1.6;color:#101828;background:#ecedff;border:1px solid #b9bcf7;border-radius:8px;padding:8px 10px;margin-bottom:10px"></div>'
      /* 무엇이 일어나는지 한 줄 — 이번 한 번인지, 앞으로 계속인지. */
      + '<div id="tc-mv-note" style="font-size:12px;line-height:1.55;color:#101828;border-radius:8px;padding:8px 10px;margin-bottom:10px"></div>'
      + '<label style="font-size:12px;color:#475467">' + T('사유 (선택)', 'Reason (optional)') + '<br>'
      +   '<input type="text" id="tc-mv-reason" maxlength="200" placeholder="' + T('예: 학부모 연락', 'e.g. parent called') + '" style="width:100%;' + inp + '"></label>'
      + (canCancel ? '' : '<div style="font-size:11.5px;color:#475467;margin-top:6px">'
          + (r.can_move === true
              ? T('수업 «취소» 는 본사 계정에서 합니다.', 'Cancelling a class is done by an HQ account.')
              : T('«취소» 는 날짜가 정해진 수업에서만 됩니다.', 'Cancel is offered only for a date-fixed class.')) + '</div>')
      + '<div id="tc-mv-msg" style="font-size:12.5px;font-weight:700;margin-top:10px;min-height:1em"></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">'
      +   '<button type="button" id="tc-mv-close" style="padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;color:#111827;cursor:pointer">' + T('닫기', 'Close') + '</button>'
      +   '<button type="button" id="tc-mv-go" style="padding:8px 16px;border:0;border-radius:8px;background:#065f46;color:#fff;font-weight:800;cursor:pointer">' + T('실행', 'Apply') + '</button>'
      + '</div></div>';
    document.body.appendChild(box);
    box.addEventListener('click', function (e) {
      if (e.target === box) { tcMoveModalClose(); return; }
      var pk = e.target.closest && e.target.closest('[data-mv-pick]');
      if (pk) { _mvPick = pk.getAttribute('data-mv-pick') || ''; mvPaint(); if (mvAct() === 'series') mvSeriesLater(r); return; }
      var mb = e.target.closest && e.target.closest('[data-mv-mode]');
      if (mb) {
        var all = box.querySelectorAll('[data-mv-mode]');
        for (var i = 0; i < all.length; i++) {
          var on = all[i] === mb;
          all[i].setAttribute('aria-pressed', on ? 'true' : 'false');
          mvModeStyle(all[i], all[i].getAttribute('data-mv-mode'), on);
        }
        mvSync(r, day); return;
      }
      var sb = e.target.closest && e.target.closest('[data-mv-sub]');
      if (sb) {
        var subs = box.querySelectorAll('[data-mv-sub]');
        for (var j = 0; j < subs.length; j++) {
          var so = subs[j] === sb;
          subs[j].setAttribute('aria-pressed', so ? 'true' : 'false');
          subs[j].style.borderColor = so ? '#b45309' : '#d1d5db';
          subs[j].style.background = so ? '#fff4e0' : '#fff';
          subs[j].style.fontWeight = so ? '800' : '500';
        }
        mvSync(r, day); return;
      }
      var dc = e.target.closest && e.target.closest('[data-mv-day]');
      var tc = e.target.closest && e.target.closest('[data-mv-hm]');
      if (dc || tc) {
        if (dc) $('tc-mv-date').value = dc.getAttribute('data-mv-day');
        if (tc) $('tc-mv-time').value = tc.getAttribute('data-mv-hm');
        mvPaintChips(day, r); mvWhenChanged(r);
      }
    });
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var pk = e.target.closest && e.target.closest('[data-mv-pick]');
      if (pk) { e.preventDefault(); _mvPick = pk.getAttribute('data-mv-pick') || ''; mvPaint(); if (mvAct() === 'series') mvSeriesLater(r); }
    });
    ['tc-mv-date', 'tc-mv-time'].forEach(function (id) {
      var el = $(id);
      if (el) {
        el.addEventListener('change', function () { mvPaintChips(day, r); mvWhenChanged(r); });
        el.addEventListener('input', function () { mvWhenChanged(r); });
      }
    });
    mvPaintChips(day, r);
    mvSync(r, day);
    $('tc-mv-close').addEventListener('click', tcMoveModalClose);
    $('tc-mv-go').addEventListener('click', function () { mvRun(r, day); });
  }
  /* 📅 (2026-09-23 Karl 매니저 제안) 새 날짜·시각에 «누가 되는가».
     "some students choose specific teacher" — 그래서 **학생의 담당 강사를 먼저** 말하고,
     안 되면 그 시간에 빈 다른 강사를 보여 준다. 판정은 서버(move-candidates)가 한다 —
     옮기기 승인이 쓰는 그 겹침 검사라 여기서 «가능» 이면 승인에서도 안 막힌다.
     ⛔ 읽기 전용 — 강사를 바꾸지 않는다. 안 되면 «실행해도 안 옮겨진다» 를 사실대로 말한다.
     ⚠️ 늦게 온 응답이 새 입력을 덮지 않게 번호(_mvSeq)로 물러난다. */
  var _mvSeq = 0, _mvTimer = null;
  function mvWhy(w) {
    return w === 'busy' ? T('이 시간 다른 수업', 'another class then')
      : w === 'substituting' ? T('그날 대체 수업 중', 'substituting then')
      : w === 'time_off' ? T('근무 불가 등록', 'marked unavailable')
      : w === 'long_class_cap' ? T('긴 수업 정원 참', 'long-class cap reached')
      : T('안 됨', 'not available');
  }
  /* 🖼 (2026-09-23 사장님 「이렇게 강사리스트가 나와서 선택하면 좋을 것 같아」 ·
        「그 시간대 가능한 강사들만」) — 홈 「강사 소개」 카드처럼 사진 카드로, **그 시간에 되는
        강사만** 보여 주고 누르면 고른다. 담당 강사가 되면 맨 앞에 두고 미리 골라 둔다
        ("some students choose specific teacher" — 학생이 고른 강사를 먼저). */
  var _mvData = null, _mvPick = '';
  function mvCard(t, tag) {
    var on = String(t.id) === String(_mvPick);
    var nm = t.display_name || t.name || '';
    var face = t.photo
      ? '<img src="' + esc(t.photo) + '" alt="" loading="lazy" style="width:56px;height:56px;border-radius:50%;object-fit:cover;display:block;margin:0 auto">'
      : '<div style="width:56px;height:56px;border-radius:50%;margin:0 auto;background:#e0e7ff;color:#3730a3;font-weight:800;font-size:22px;line-height:56px;text-align:center">' + esc(String(nm).replace(/^teacher\s+/i, '').charAt(0).toUpperCase() || '?') + '</div>';
    return '<div role="button" tabindex="0" data-mv-pick="' + esc(t.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" '
      + 'style="cursor:pointer;width:92px;box-sizing:border-box;padding:8px 4px;border-radius:12px;text-align:center;'
      + 'border:2px solid ' + (on ? '#1d4ed8' : '#e2e8f0') + ';background:' + (on ? '#eff6ff' : '#fff') + '">'
      + face
      + '<div style="font-size:11.5px;font-weight:800;color:#101828;margin-top:4px;line-height:1.25;word-break:break-word">' + esc(nm) + '</div>'
      + (tag ? '<div style="font-size:10px;color:#065f46;font-weight:700">' + tag + '</div>' : '')
      + (on ? '<div style="font-size:10px;color:#1d4ed8;font-weight:800">✔ ' + T('선택', 'picked') + '</div>' : '')
      + '</div>';
  }
  function mvTeachersHtml(d) {
    var h = '';
    if (d.student_conflict) {
      h += '<div style="color:#b91c1c;font-weight:700;margin-bottom:6px">⚠ ' + T('학생에게 이 시간 다른 수업이 있어 옮길 수 없습니다.', 'The student already has a class then — it cannot move.') + '</div>';
    }
    var c = d.current;
    if (c && !c.free) {
      h += '<div style="margin-bottom:6px">👤 ' + T('담당 강사', 'Assigned teacher') + ' <b>' + esc(c.display_name || c.name) + '</b> — '
        + '<b style="color:#b91c1c">⛔ ' + esc(mvWhy(c.why)) + '</b>'
        + (d.teacher_change_ok ? ' · ' + T('아래에서 다른 강사를 고르세요.', 'pick another teacher below.') : '') + '</div>';
    } else if (!c) {
      h += '<div style="margin-bottom:6px">👤 ' + T('담당 강사 미배정', 'No assigned teacher') + '</div>';
    }
    var list = [];
    if (c && c.free) list.push(mvCard(c, T('담당 강사', 'assigned')));
    if (d.teacher_change_ok) {
      (d.candidates || []).forEach(function (t) { list.push(mvCard(t, '')); });
    }
    h += '<div style="font-weight:700;margin-bottom:4px">' + T('이 시간 가능한 강사', 'Teachers free at this time') + ' ' + list.length + T('명', '') + '</div>';
    if (list.length) h += '<div style="display:flex;flex-wrap:wrap;gap:6px;max-height:260px;overflow-y:auto">' + list.join('') + '</div>';
    else h += '<div style="color:#b91c1c">' + T('이 시간에 되는 강사가 없습니다. 다른 시간을 고르세요.', 'No teacher is free then. Pick another time.') + '</div>';
    if (!d.teacher_change_ok && (d.candidates || []).length) {
      h += '<div style="color:#92400e;margin-top:6px">' + T('카페24 수업은 날짜를 바꾸면서 강사까지 바꿀 수 없습니다(같은 날짜 안에서는 됩니다).', 'A cafe24 class cannot change teacher while moving to another date (same day is OK).') + '</div>';
    }
    if (d.busy_count > 0) h += '<div style="color:#475467;margin-top:6px">' + T('그 시간 안 되는 강사 ', 'Not available then: ') + d.busy_count + T('명 (목록에서 뺐습니다)', '') + '</div>';
    return h;
  }
  function mvPaint() {
    var box = $('tc-mv-teachers'); if (!box || !_mvData) return;
    box.innerHTML = mvTeachersHtml(_mvData);
  }
  function mvTeachersLater(r) {
    if (_mvTimer) clearTimeout(_mvTimer);
    _mvTimer = setTimeout(function () { mvLoadTeachers(r); }, 350);
  }
  function mvLoadTeachers(r) {
    var box = $('tc-mv-teachers'); if (!box || box.hidden) return;
    var date = String(($('tc-mv-date') || {}).value || '').trim();
    var time = String(($('tc-mv-time') || {}).value || '').slice(0, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) {
      box.innerHTML = T('새 날짜와 시각을 고르면 되는 강사를 보여 드립니다.', 'Pick a date and time to see available teachers.');
      return;
    }
    var my = ++_mvSeq;
    _mvData = null;
    box.innerHTML = T('강사 확인 중…', 'Checking teachers…');
    fetch('/api/pay/enroll/admin/move-candidates?schedule_id=' + encodeURIComponent(r.schedule_id)
          + '&date=' + encodeURIComponent(date) + '&time=' + encodeURIComponent(time), { credentials: 'include' })
      .then(function (rs) { return rs.json().catch(function () { return null; }).then(function (j) { return { st: rs.status, j: j }; }); })
      .then(function (res) {
        if (my !== _mvSeq || !$('tc-mv-teachers')) return;
        if (!res.j || res.j.ok !== true) {
          box.innerHTML = '<span style="color:#475467">' + (res.st === 403
            ? T('강사 가능 여부는 이 계정으로 볼 수 없습니다. (옮기기는 됩니다)', 'This account cannot see teacher availability. (Moving still works.)')
            : T('강사 가능 여부를 불러오지 못했습니다. (옮기기는 됩니다)', 'Could not load teacher availability. (Moving still works.)')) + '</span>';
          return;
        }
        _mvData = res.j;
        /* 기본 선택 = 담당 강사(그 시간에 되면). 안 되면 아무도 안 고른 채로 둔다 — 지어내지 않는다. */
        var cur = res.j.current;
        var keep = _mvPick && ((cur && cur.free && String(cur.id) === _mvPick)
          || (res.j.teacher_change_ok && (res.j.candidates || []).some(function (t) { return String(t.id) === _mvPick; })));
        if (!keep) _mvPick = (cur && cur.free) ? String(cur.id) : '';
        mvPaint();
      })
      .catch(function () {
        if (my !== _mvSeq) return;
        box.innerHTML = '<span style="color:#475467">' + T('강사 가능 여부를 불러오지 못했습니다. (옮기기는 됩니다)', 'Could not load teacher availability. (Moving still works.)') + '</span>';
      });
  }
  /* ── 🔄 (2026-09-23 사장님 「연기는 지정한 날짜에 한 번이고, 변경은 계속이야.」) ──
     ⏸ 연기 ▸ 완전히  = 이 회만 «연기»(날짜 미정) — /schedule-requests(postpone) + /decide
     ⏸ 연기 ▸ 지정 날짜 = 이 회만 새 날짜·시각으로   — /schedule-requests(change)  + /decide
     🔄 변경(앞으로 계속) = 이 회부터 같은 요일·시각 수업 «전부» — /api/pay/enroll/admin/series-move
     ⛔ 예전 버튼 이름 «날짜·시각 변경» 은 실제로 «이 회만» 옮겼다 — 새 규칙으로는 «연기 ▸ 지정 날짜» 다.
        이름만 바꾸고 하는 일(서버 경로)은 그대로 둔다. */
  var _mvSer = null, _mvSerSeq = 0, _mvSerTimer = null;
  function mvSync(r, day) {
    var act = mvAct();
    var picking = act === 'date' || act === 'series';
    var show = function (id, on, disp) { var el = $(id); if (el) { el.hidden = !on; el.style.display = on ? (disp || 'block') : 'none'; } };
    show('tc-mv-sub', act === 'hold' || act === 'date', 'flex');
    show('tc-mv-when', picking);
    show('tc-mv-teachers', picking);
    show('tc-mv-series', act === 'series');
    var wl = $('tc-mv-when-l');
    if (wl) wl.textContent = act === 'series'
      ? T('📅 새 요일·시각 — 이 회가 옮겨 갈 날짜를 고르면, 앞으로의 회차도 같은 요일·시각으로 갑니다', '📅 New day & time — pick where this class goes; later classes follow the same weekday & time')
      : T('📅 이 회를 옮길 날짜 · 🕐 시각', '📅 Date · 🕐 time for this one class');
    var note = $('tc-mv-note');
    if (note) {
      var who = String(r.student_name || r.student_uid || '');
      var nd = String(($('tc-mv-date') || {}).value || ''), nt = String(($('tc-mv-time') || {}).value || '').slice(0, 5);
      var when = mvDayLabel(day) + ' ' + String(r.start_time || '').slice(0, 5);
      var styleOf = { hold: ['#fff4e0', '#f5c77a'], date: ['#fff4e0', '#f5c77a'], series: ['#ecedff', '#b9bcf7'], cancel: ['#fdecea', '#f3a8a0'] }[act];
      note.style.background = styleOf[0]; note.style.border = '1px solid ' + styleOf[1];
      note.innerHTML = act === 'hold'
        ? T('<b>이번 한 번만</b> — ' + esc(when) + ' 수업이 «연기» 상태가 됩니다(새 날짜는 나중에). 다음 회부터는 원래 시간표 그대로입니다.',
            '<b>This class only</b> — ' + esc(when) + ' becomes «postponed» (new date later). Following classes stay as they are.')
        : act === 'date'
        ? T('<b>이번 한 번만</b> — ' + esc(when) + ' → ' + esc(nd ? mvDayLabel(nd) : '?') + ' ' + esc(nt) + '. 다음 회부터는 원래 시간표 그대로입니다.',
            '<b>This class only</b> — ' + esc(when) + ' → ' + esc(nd ? mvDayLabel(nd) : '?') + ' ' + esc(nt) + '. Following classes stay as they are.')
        : act === 'series'
        ? T('<b>앞으로 계속</b> — 이 회부터 같은 요일·시각의 수업을 <b>모두</b> 옮깁니다. 한 회라도 자리가 겹치면 아무것도 바꾸지 않습니다.',
            '<b>From now on</b> — this and every later class at the same weekday & time move. If any one clashes, nothing changes.')
        : T('<b>이번 한 번만</b> — ' + esc(who) + ' · ' + esc(when) + ' 수업을 취소합니다.', '<b>This class only</b> — cancels ' + esc(who) + ' · ' + esc(when) + '.');
    }
    if (picking) mvTeachersLater(r);
    if (act === 'series') mvSeriesLater(r);
  }
  function mvWhenChanged(r) {
    var box = $('tc-move-modal'); if (!box) return;
    mvSync(r, (box.getAttribute('data-day') || ''));
  }
  function mvSeriesLater(r) {
    if (_mvSerTimer) clearTimeout(_mvSerTimer);
    _mvSerTimer = setTimeout(function () { mvLoadSeries(r); }, 400);
  }
  /* 서버에 «미리보기»(apply 없이)를 묻는다 — 몇 회가 어디로 가는지·겹치는 날짜·막히는 이유. */
  function mvSeriesBody(r) {
    var nd = String(($('tc-mv-date') || {}).value || '').trim();
    var nt = String(($('tc-mv-time') || {}).value || '').slice(0, 5);
    var cur = (_mvData && _mvData.current) ? String(_mvData.current.id) : '';
    var body = { schedule_id: Number(r.schedule_id), new_date: nd, new_time: nt };
    if (_mvPick && _mvPick !== cur) body.teacher_id = _mvPick;
    return body;
  }
  function mvSerKey(b) { return [b.schedule_id, b.new_date, b.new_time, b.teacher_id || ''].join('|'); }
  function mvLoadSeries(r) {
    var box = $('tc-mv-series'); if (!box || box.hidden) return;
    var b = mvSeriesBody(r);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.new_date) || !/^\d{1,2}:\d{2}$/.test(b.new_time)) {
      box.innerHTML = T('새 요일·시각을 고르면 앞으로 바뀌는 회차를 보여 드립니다.', 'Pick a new day & time to see which classes change.'); return;
    }
    var my = ++_mvSerSeq;
    _mvSer = null;
    box.innerHTML = T('앞으로의 회차 확인 중…', 'Checking later classes…');
    mvReq('POST', '/api/pay/enroll/admin/series-move', b).then(function (res) {
      if (my !== _mvSerSeq || !$('tc-mv-series')) return;
      _mvSer = { key: mvSerKey(b), st: res.st, j: res.j };
      box.innerHTML = mvSeriesHtml(res.st, res.j);
    }).catch(function () {
      if (my !== _mvSerSeq) return;
      box.innerHTML = '<span style="color:#b91c1c">' + T('앞으로의 회차를 불러오지 못했습니다. 다시 골라 주세요.', 'Could not load later classes. Pick again.') + '</span>';
    });
  }
  function mvSerErr(st, j) {
    var e = (j && j.error) || '';
    if (e === 'mirror_series') return T('카페24 수업은 «앞으로 계속» 바꾸기를 <b>카페24에서</b> 해야 합니다 — 여기서 바꾸면 밤마다 카페24 동기화가 옛 시간표로 다시 만듭니다. 이번 한 번만 옮기려면 «⏸ 연기 ▸ 지정한 날짜로 연기» 를 쓰세요.',
      'A cafe24 class must be changed «from now on» <b>in cafe24</b> — otherwise the nightly sync recreates the old timetable. To move just this one class use «⏸ Postpone ▸ to a date».');
    if (e === 'weekly_row') return T('매주 반복 수업은 시간표에서 바꿔 주세요.', 'A weekly class is changed in the timetable.');
    if (e === 'no_change') return T('지금과 같은 요일·시각입니다. 다른 요일·시각을 고르세요.', 'That is the same day & time. Pick another.');
    if (e === 'too_many') return T('앞으로의 회차가 너무 많아(60회 초과) 한 번에 못 옮깁니다. 시간표에서 나눠 옮겨 주세요.', 'Too many later classes (over 60). Move them in the timetable.');
    if (e === 'forbidden_scope' || e === 'teacher_move_forbidden' || st === 403) return T('담당 강사를 바꾸며 옮기는 것은 본사 계정에서 합니다. 담당 강사를 그대로 두면 됩니다.', 'Changing the teacher is done by an HQ account. Keep the assigned teacher to proceed.');
    if (e === 'forbidden_teacher') return T('강사 계정은 처리할 수 없습니다.', 'Teachers cannot do this.');
    return mvErrOf(st, j);
  }
  function mvSeriesHtml(st, j) {
    if (!j) return '<span style="color:#b91c1c">' + T('확인하지 못했습니다.', 'Could not check.') + '</span>';
    var items = j.items || [];
    var line = function (it) {
      return '<div>' + esc(mvDayLabel(it.from_date)) + ' ' + esc(it.from_time) + ' → <b>' + esc(mvDayLabel(it.to_date)) + ' ' + esc(it.to_time) + '</b></div>';
    };
    var list = function () {
      var h = items.slice(0, 8).map(line).join('');
      if (items.length > 8) h += '<div style="color:#475467">' + T('… 외 ', '… and ') + (items.length - 8) + T('회', ' more') + '</div>';
      return h;
    };
    var tch = (j.teacher && j.teacher.changed)
      ? '<div style="margin-top:4px">👤 ' + T('담당 강사: ', 'Teacher: ') + esc(j.teacher.from_name || '—') + ' → <b>' + esc(j.teacher.to_name || '') + '</b></div>' : '';
    if (j.ok === true) {
      return '<div style="font-weight:800;margin-bottom:4px">🔄 ' + T('앞으로 ', 'From now on: ') + items.length + T('회를 옮깁니다', ' classes move') + '</div>' + list() + tch;
    }
    if (j.error === 'conflict') {
      var cs = (j.conflicts || []).map(function (c) { return esc(mvDayLabel(c.date)); }).join(', ');
      return '<div style="color:#b91c1c;font-weight:800">⛔ ' + T('자리가 겹치는 날이 있어 옮길 수 없습니다: ', 'Some dates clash, so nothing can move: ') + cs + '</div>'
        + '<div style="color:#475467;margin-top:2px">' + T('다른 요일·시각이나 다른 강사를 고르세요. (앞으로 ', 'Pick another day/time or teacher. (') + items.length + T('회 중)', ' classes in total)') + '</div>';
    }
    return '<span style="color:#92400e">' + mvSerErr(st, j) + '</span>';
  }
  /* 🔄 변경(앞으로 계속) 실행 — 미리보기와 «같은 조건» 일 때만. 확인창에 회차를 그대로 적는다. */
  function mvRunSeries(r, day, reason, swapTo, curT) {
    var msg = $('tc-mv-msg'), go = $('tc-mv-go');
    var bad = function (t) { msg.style.color = '#b91c1c'; msg.innerHTML = t; };
    var b = mvSeriesBody(r);
    if (swapTo) b.teacher_id = String(swapTo.id);
    if (!_mvSer || _mvSer.key !== mvSerKey(b)) { bad(T('앞으로의 회차를 확인하는 중입니다. 잠깐 뒤 다시 눌러 주세요.', 'Still checking later classes — press again in a moment.')); mvSeriesLater(r); return; }
    var j = _mvSer.j;
    if (!j || j.ok !== true) { bad(j && j.error === 'conflict' ? T('자리가 겹치는 날이 있어 옮길 수 없습니다 — 위 목록을 보세요.', 'Some dates clash — see the list above.') : mvSerErr(_mvSer.st, j)); return; }
    var items = j.items || [];
    var lines = items.slice(0, 10).map(function (it) { return '· ' + mvDayLabel(it.from_date) + ' ' + it.from_time + ' → ' + mvDayLabel(it.to_date) + ' ' + it.to_time; }).join('\n')
      + (items.length > 10 ? '\n' + T('… 외 ', '… and ') + (items.length - 10) + T('회', ' more') : '');
    var tline = (j.teacher && j.teacher.changed) ? '\n\n' + T('담당 강사: ', 'Teacher: ') + (j.teacher.from_name || '—') + ' → ' + (j.teacher.to_name || '') : '';
    var who = String(r.student_name || r.student_uid || '');
    if (!window.confirm(T('앞으로 계속 바꿀까요?\n\n' + who + ' · ' + items.length + '회\n' + lines + tline + '\n\n· 한 회라도 그 사이 자리가 겹치면 아무것도 바꾸지 않습니다.',
                          'Change from now on?\n\n' + who + ' · ' + items.length + ' classes\n' + lines + tline + '\n\n· If any one clashes in the meantime, nothing changes.'))) return;
    go.disabled = true;
    msg.style.color = '#475467'; msg.textContent = T('처리 중...', 'Sending...');
    var payload = { schedule_id: b.schedule_id, new_date: b.new_date, new_time: b.new_time, apply: true, reason: reason || undefined };
    if (b.teacher_id) payload.teacher_id = b.teacher_id;
    mvReq('POST', '/api/pay/enroll/admin/series-move', payload).then(function (res) {
      var jj = res.j;
      if (!jj || jj.ok !== true) {
        go.disabled = false;
        if (jj && jj.error === 'conflict') { _mvSer = { key: mvSerKey(b), st: res.st, j: jj }; var sb = $('tc-mv-series'); if (sb) sb.innerHTML = mvSeriesHtml(res.st, jj); bad(T('그 사이 자리가 겹쳐 아무것도 바꾸지 않았습니다.', 'A clash appeared — nothing was changed.')); return; }
        bad(mvSerErr(res.st, jj) + ' ' + T('(아무것도 바꾸지 않았습니다)', '(Nothing was changed)')); return;
      }
      _mvChanged = true;
      var n = Number(jj.moved) || 0, total = Number(jj.count) || items.length;
      if (n === total) { msg.style.color = '#047857'; msg.textContent = T('앞으로 ' + n + '회를 옮겼습니다. (닫으면 목록을 다시 불러옵니다)', 'Moved ' + n + ' classes from now on. (Closing reloads the list)'); }
      else { msg.style.color = '#92400e'; msg.textContent = T('⚠ ' + total + '회 중 ' + n + '회만 옮겨졌습니다 — 그 사이 누군가 바꾼 회차가 있습니다. 시간표에서 확인해 주세요.', '⚠ Only ' + n + ' of ' + total + ' moved — some were changed meanwhile. Check the timetable.'); }
    }).catch(function () { go.disabled = false; bad(T('연결이 끊겼습니다. 결과를 모르니 목록을 다시 불러와 확인해 주세요.', 'Network error — reload the list to check the result.')); _mvChanged = true; });
  }
  function mvRun(r, day) {
    var box = $('tc-move-modal'); if (!box) return;
    /* 서버 경로는 그대로 — «완전히 연기» = postpone, «지정한 날짜로 연기» = 예전 «날짜·시각 변경»(이 회만 옮김). */
    var act = mvAct();
    var mode = act === 'hold' ? 'postpone' : act === 'date' ? 'change' : act;
    var msg = $('tc-mv-msg');
    var go = $('tc-mv-go');
    var newDate = String(($('tc-mv-date') || {}).value || '').trim();
    var newTime = String(($('tc-mv-time') || {}).value || '').slice(0, 5);
    var reason = String(($('tc-mv-reason') || {}).value || '').trim();
    var who = String(r.student_name || r.student_uid || '');
    var when = day + ' ' + hhmm(r.start_ts);
    var bad = function (t) { msg.style.color = '#b91c1c'; msg.textContent = t; };
    if ((mode === 'change' || mode === 'series') && !(/^\d{4}-\d{2}-\d{2}$/.test(newDate) && /^\d{1,2}:\d{2}$/.test(newTime))) {
      bad(T('새 날짜와 시각을 먼저 고르세요.', 'Pick a new date and time first.')); return;
    }
    if (mode === 'cancel' && !mvCanCancel(r)) { bad(T('이 수업은 여기서 취소할 수 없습니다.', 'This class cannot be cancelled here.')); return; }
    /* 🧑‍🏫 고른 강사가 담당 강사와 다르면 «강사도 바꾼다». 강사 확인을 못 받았으면(실패·권한 없음)
       예전처럼 담당 강사 그대로 옮긴다 — 모르는 채로 강사를 바꾸지 않는다. */
    var curT = (_mvData && _mvData.current) || null;
    var curId = curT ? String(curT.id) : '';
    var swapTo = null;
    if ((mode === 'change' || mode === 'series') && _mvData) {
      if (_mvData.date !== newDate || String(_mvData.time) !== newTime) {
        bad(T('강사 확인이 끝날 때까지 잠깐 기다려 주세요.', 'Wait a moment — checking teachers for the new time.')); mvTeachersLater(r); return;
      }
      if (_mvPick && _mvPick !== curId) {
        swapTo = (_mvData.candidates || []).filter(function (t) { return String(t.id) === _mvPick; })[0] || null;
        if (!swapTo || !_mvData.teacher_change_ok) { bad(T('고른 강사로 바꿀 수 없습니다. 목록을 다시 확인해 주세요.', 'Cannot switch to that teacher. Check the list again.')); return; }
      }
      if (!_mvPick && !(curT && curT.free)) { bad(T('이 시간에 되는 강사를 먼저 골라 주세요.', 'Pick a teacher who is free at this time first.')); return; }
    }
    if (mode === 'series') { mvRunSeries(r, day, reason, swapTo, curT); return; }
    var swapLine = swapTo
      ? T('\n· 담당 강사: ' + ((curT && (curT.display_name || curT.name)) || '—') + ' → ' + (swapTo.display_name || swapTo.name),
          '\n· Teacher: ' + ((curT && (curT.display_name || curT.name)) || '—') + ' → ' + (swapTo.display_name || swapTo.name))
      : '';
    /* 💰 연기를 시작 30분보다 이르게 하면 서버가 «사전 연기»(fee_type='free')로 매기고
       급여가 «사전 연기 지급률»(기본 0)을 따른다 — manager.html 과 같은 경고. */
    var mins = (typeof r.start_ts === 'number' && r.start_ts > 0) ? Math.round((r.start_ts - Date.now()) / 60000) : null;
    var feeWarn = (mode === 'postpone' && mins !== null && mins > 30)
      ? T('\n\n⚠ «사전 연기» 로 기록됩니다 (시작 30분보다 이름).\n   이 수업의 강사 수업료가 급여 규칙 «사전 연기 지급률» 을 따릅니다 — 0원일 수 있습니다.',
          '\n\n⚠ Recorded as an EARLY postponement (more than 30 min before).\n   Teacher pay for this class follows «postponed_early_pay_percent» — it may be 0.')
      : '';
    var ask = mode === 'cancel'
      ? T('이 수업을 취소할까요?\n\n' + who + ' · ' + when + '\n\n· 목록에서 사라집니다.\n· 되돌리려면 시간표에서 직접 고쳐야 합니다.',
          'Cancel this class?\n\n' + who + ' · ' + when + '\n\n· It disappears from the lists.\n· To undo it you must fix it in the timetable.')
      : mode === 'change'
      ? T('이번 한 번만 옮길까요? (지정한 날짜로 연기)\n\n' + who + '\n' + when + '  →  ' + newDate + ' ' + newTime + '\n\n· 다음 회부터는 원래 시간표 그대로입니다.\n· 그 시간에 다른 수업이 있으면 안 옮기고 알려 드립니다.' + swapLine,
          'Move just this one class? (postpone to a date)\n\n' + who + '\n' + when + '  →  ' + newDate + ' ' + newTime + '\n\n· Later classes keep the usual timetable.\n· If that slot is taken it will not move — you will be told.' + swapLine)
      : T('이 수업을 연기할까요?\n\n' + who + ' · ' + when + '\n\n· 수업이 «연기» 상태가 됩니다. 새 날짜는 나중에 잡습니다.',
          'Postpone this class?\n\n' + who + ' · ' + when + '\n\n· The class becomes «postponed». Pick a new date later.') + feeWarn;
    if (!window.confirm(ask)) return;
    go.disabled = true;
    msg.style.color = '#475467'; msg.textContent = T('처리 중...', 'Sending...');
    var me = mvMe();
    var nm = (me && (me.name || me.uid)) || '';
    var unlock = function () { go.disabled = false; };
    var sid = Number(r.schedule_id);
    var p;
    if (mode === 'cancel') {
      p = mvReq('DELETE', '/api/admin/class-schedules/' + encodeURIComponent(sid), { reason: reason || undefined }).then(function (res) {
        if (!res.j || res.j.ok !== true) {
          bad(res.st === 403 ? T('수업 «취소» 는 본사 계정에서 합니다.', 'Cancelling a class is done by an HQ account.') : mvErrOf(res.st, res.j));
          unlock(); return;
        }
        _mvChanged = true;
        msg.style.color = '#047857'; msg.textContent = T('취소했습니다. (닫으면 목록을 다시 불러옵니다)', 'Cancelled. (Closing reloads the list)');
      });
    } else {
      /* 강사 변경 → 옮기기 순서. 옮기기 승인(/decide)의 겹침 검사는 «그 행의 담당 강사» 로 재므로
         강사를 먼저 바꿔야 새 강사 기준으로 잰다. 옮기지 못하면 강사를 원래대로 되돌린다
         (반쪽 — «강사만 바뀌고 시간은 그대로» — 을 남기지 않는다). */
      var patchTeacher = function (tid) {
        return mvReq('PATCH', '/api/admin/class-schedules/' + encodeURIComponent(sid), { teacher_id: String(tid) });
      };
      var pre = swapTo ? patchTeacher(swapTo.id) : Promise.resolve({ st: 200, j: { ok: true } });
      p = pre.then(function (pt) {
        if (!pt.j || pt.j.ok !== true) {
          bad((pt.st === 403 ? T('담당 강사 변경은 본사 계정에서 합니다.', 'Changing the teacher is done by an HQ account.') : mvErrOf(pt.st, pt.j))
            + ' ' + T('(아무것도 바꾸지 않았습니다)', '(Nothing was changed)'));
          unlock(); return;
        }
        if (swapTo) _mvChanged = true;
        var rollback = function (why) {
          if (!swapTo || !curId) { bad(why); unlock(); return; }
          return patchTeacher(curId).then(function (rb) {
            bad(why + ' ' + ((rb.j && rb.j.ok === true)
              ? T('담당 강사는 원래대로 되돌렸습니다.', 'The teacher was switched back.')
              : T('⚠ 담당 강사를 원래대로 되돌리지 못했습니다 — 시간표에서 확인해 주세요.', '⚠ Could not switch the teacher back — check the timetable.')));
            unlock();
          });
        };
        return mvReq('POST', '/api/admin/schedule-requests', {
        schedule_id: sid,
        request_type: mode === 'change' ? 'change' : 'postpone',
        requester_role: 'admin',
        requester_name: nm || undefined,
        teacher_name: (swapTo && (swapTo.display_name || swapTo.name)) || r.teacher_name || nm || T('관리자', 'admin'),
        student_name: r.student_name || r.student_uid || undefined,
        student_uid: r.student_uid || undefined,
        new_date: mode === 'change' ? newDate : undefined,
        new_time: mode === 'change' ? newTime : undefined,
        reason: reason || undefined
      }).then(function (mk) {
        if (!mk.j || mk.j.ok !== true || !mk.j.id) { return rollback(mvErrOf(mk.st, mk.j)); }
        return mvReq('POST', '/api/admin/schedule-requests/decide', { id: Number(mk.j.id), action: 'approve', decided_by: nm || undefined }).then(function (res) {
          _mvChanged = true;
          if (!res.j || res.j.ok !== true) {
            return rollback(mvErrOf(res.st, res.j) + ' ' + T('요청은 저장됐습니다 — 「수업 연기·변경 요청」에서 승인해 주세요.',
                                                  'The request is saved — approve it in the schedule requests.'));
          }
          var m = mvMsgOf(res.j);
          /* 강사까지 바꿨는데 «옮겨지지» 않았으면(겹침·반복) 강사를 되돌린다. */
          if (swapTo && res.j.applied !== 'moved') return rollback(m.s);
          msg.style.color = m.ok ? '#047857' : '#92400e';
          msg.textContent = m.s + (swapTo ? ' ' + T('담당 강사: ', 'Teacher: ') + (swapTo.display_name || swapTo.name) + '.' : '')
            + ' ' + T('(닫으면 목록을 다시 불러옵니다)', '(Closing reloads the list)');
        });
      });
      });
    }
    p.catch(function () { bad(T('연결이 끊겼습니다. 다시 눌러 주세요.', 'Network error. Try again.')); unlock(); });
  }

  function srcFilter() {
    var el = $('tc-source');
    var v = el ? String(el.value || '') : '';
    return (v === 'mangoi' || v === 'cafe24') ? v : '';
  }
  function qFilter() {
    var el = $('tc-q');
    return el ? String(el.value || '').trim().toLowerCase() : '';
  }
  /* 고른 시간대 — '' (전체) · 'late' (23:00~23:59) · 'night' (23:00~05:59).
     ⛔ 모르는 값은 «전체» 로 떨어뜨린다(옛 화면이 캐시에 남아 다른 값을 보내도 줄이 안 사라진다). */
  function nightMode() {
    var el = $('tc-night');
    var v = el ? String(el.value || '') : '';
    return (v === 'late' || v === 'night') ? v : '';
  }
  function nightLabel(mode) {
    return mode === 'night' ? T('🌙 야간 (23:00~05:59)', '🌙 Night (23:00–05:59)')
         : mode === 'late'  ? T('🌙 23시 이후 (23:00~23:59)', '🌙 After 23:00 (23:00–23:59)')
         : '';
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
  /* 🌒 「야간」을 켰을 때 «날짜 경계» 를 말해 준다 — 이 목록은 하루치라 «자정을 넘겨 이어지는
     한 판» 이 두 날짜로 갈린다. 그 사실을 감추면 「오늘 23:40 수업의 새벽이 안 보인다」가
     그대로 「필터가 빠뜨린다」는 제보가 된다(그리고 그건 사실이다 — 필터가 아니라 목록의 성질이다).
     ⚠️ 폰에는 hover 가 없어 title 로는 못 전한다 → **보이는 줄**로 그린다.
     ⛔ 이 줄을 «항상» 그리지 말 것: 야간을 안 켠 사람에게는 아무 뜻도 없는 문장이다. */
  function nightNote(mode, dawn, late) {
    if (mode !== 'night') return '';
    return T(
      '🌒 야간 = 이 날짜의 새벽 ' + dawn + '건(00:00~05:59) + 밤 ' + late + '건(23:00~23:59) 입니다. '
        + '자정을 넘겨 이어진 수업은 «다음 날짜» 목록의 새벽에 있습니다 — 날짜를 하루 넘겨 보세요.',
      '🌒 Night = ' + dawn + ' early-morning (00:00–05:59) + ' + late + ' late-night (23:00–23:59) on this date. '
        + 'A class that runs past midnight appears in the NEXT date\u2019s list — step the date forward by one.'
    );
  }

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
  function bookNoteHtml(missing, total, ltSkipped) {
    if (!missing) return '';
    /* ⚠️ 짧게 쓴다 — 1500px 창에서도 이 카드 폭이 좁아(관리자 zoom 1.3) 긴 문장은 세 줄로 접힌다.
       실측으로 세 줄이 나와 한 번 줄인 문장이다(브라우저 검사 ⑥절이 두 줄 이내로 못 박는다). */
    /* 🧪 (2026-09-08) 레벨테스트는 «첫 수업» 이라 교재가 없는 것이 정상이다 — 세지 않는다.
       ⛔ 대신 «세지 않았다» 를 감추지 않는다: 분모는 «화면에 보이는 줄 수» 그대로 두고
          몇 건을 왜 뺐는지 꼬리말로 적는다. 그러지 않으면 「4건 다 노란데 왜 2건이라 하지」가 된다
          (CLAUDE.md 2장 「«없는 것» 을 세는 칸 — 아예 존재하지 않는 종류까지 세고 있지 않은지」·
           「두 수를 비교해 알려 줄 때 — 두 수의 모집단이 같은지부터」). */
    var msg = T('📚 표시된 ' + total + '건 중 ' + missing + '건이 교재 미배정 — 학생 명부의 교재 칸이 비어 있습니다.'
                  + (ltSkipped ? ' (레벨테스트 ' + ltSkipped + '건 제외)' : ''),
                '📚 ' + missing + ' of ' + total + ' shown have no textbook — the student roster field is empty.'
                  + (ltSkipped ? ' (' + ltSkipped + ' level test excluded)' : ''));
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
    var night = nightMode();
    var rows = _rows.filter(function (s) {
      if (onlyLive && !s.join_open) return false;
      if (night && !inNight(s, night)) return false;
      if (src && (s.source === 'cafe24' ? 'cafe24' : 'mangoi') !== src) return false;
      if (q && rowText(s).indexOf(q) < 0) return false;
      return true;
    });
    /* 🌙 시간대 고르기도 거르기다 — 여기 안 넣으면 0건일 때 «원래 없다» 고 말해
       버려서(아래 else 갈래) 「필터가 켜져 있다」는 사실이 화면에서 사라진다. */
    var filtering = !!(src || q || night);

    if (!rows.length) {
      /* 비어 있는 이유를 그 자리에서 말한다 — 「거르는 중이라 없는 것」과 「원래 없는 것」은 다르다 */
      var why;
      if (filtering) {
        why = T('조건에 맞는 수업이 없습니다', 'No classes match the filter')
          + ' (' + (src === 'cafe24' ? T('카페24', 'cafe24') : src === 'mangoi' ? T('망고아이', 'Mangoi') : T('전체', 'All'))
          + (q ? ' · "' + esc(q) + '"' : '')
          + (onlyLive ? ' · ' + T('지금 입장가능만', 'joinable only') : '')
          + (night ? ' · ' + nightLabel(night) : '')
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
    /* 🌒 «표시된 줄» 기준으로 센다 — 거르는 중이면 눈앞의 목록을 말해야 한다(교재 줄과 같은 규칙) */
    var nNote = nightNote(night,
      rows.filter(isDawn).length,
      rows.filter(isLate).length);
    /* 📚 «표시된 줄» 기준으로 센다 — 거르는 중이면 합계가 아니라 눈앞의 목록을 말해야 한다.
       (합계로 세면 「8건 보이는데 142건 미배정」 이 되어 무엇을 눌러야 하는지 흐려진다) */
    var missing = rows.filter(function (s) { return !s.textbook_assigned && !s.is_level_test; }).length;
    /* 🧪 «미배정인 레벨테스트» 만 센다 — 배정된 레벨테스트는 애초에 셈에 안 들어와 말할 것이 없다 */
    var ltSkipped = rows.filter(function (s) { return !s.textbook_assigned && s.is_level_test; }).length;
    var bookLine = bookNoteHtml(missing, rows.length, ltSkipped);
    box.innerHTML = (nNote
        ? '<div style="padding:6px 2px 4px;color:#4338ca;font-size:11.5px;line-height:1.6">' + esc(nNote) + '</div>'
        : '')
      + (note
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
            /* 📅 (2026-09-22) 줄에서 바로 연기·변경·취소 — manager.html 「오늘 전체 수업」과 같은 기능.
               [왜] 매니저 화면에만 넣었더니 사장님이 보시는 이 카드(admin.html)에는 없었다
                 (「관리자 페이지」가 사람마다 다른 화면 — CLAUDE.md 2장).
               ⛔ 매주 반복 행(can_move===false)에는 조작을 주지 않는다 — 한 행이 «매주» 라
                  취소하면 모든 주가 죽는다. 판정은 서버가 준 can_move 하나.
               ⛔ <button> 이 아니라 span[role=button] — 카드 안 전역 button 규칙이 파란 알약으로 덮는다. */
            if (s.schedule_id) {
              if (s.can_move === false) {
                act += '<span style="display:inline-block;white-space:nowrap;font-size:10.5px;color:#475467;padding:2px 8px;border-radius:99px;background:#f1f5f9;border:1px solid #cbd5e1">'
                  + T('매주 반복 — 시간표에서', 'weekly — use timetable') + '</span>';
              } else {
                act += '<span class="tc-move-pin" role="button" tabindex="0" data-sid="' + esc(s.schedule_id) + '" '
                  + 'title="' + T('이 수업을 연기·변경·취소합니다', 'Postpone, move or cancel this class') + '" '
                  + 'style="cursor:pointer;display:inline-block;white-space:nowrap;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:800;'
                  + 'background:#eaf0fb;color:#1d4ed8;border:1px solid #bfd3f5">'
                  + T('📅 연기·변경', '📅 Move') + '</span>';
              }
            }
          }
          /* 📚 (2026-08-25 보고서 ①) 옛 LMS 한 줄에 있던 「TEXTBOOK 배정 없음」 배지의 대응.
             수업 «전에» 손써야 하는 줄이라 눈에 띄어야 한다 — 배정된 줄은 조용히 교재명만. */
          /* 🎯 (2026-09-08 사장님 요청) 미배정 배지를 누르면 «그 학생만» 배정 창이 열린다.
             ⛔ <button> 으로 만들지 않는다 — admin-inline-c.css 의 전역
                `details.menu-card button{ background:인디고 !important; padding:9px 18px !important }` 가
                인라인 style 을 이겨 배지가 **파란 알약**이 된다(CLAUDE.md 2장 「표 안의 작은
                아이콘 버튼」). `<span role="button" tabindex="0">` 은 그 규칙에 안 걸린다.
             ⚠️ 학생 아이디가 없으면 누를 것을 주지 않는다 — 누구에게 배정할지 모르면
                열어 봐야 «전체» 로 흐른다(그게 이 기능이 막으려는 바로 그 사고다). */
          var canPin = !s.textbook_assigned && !!(s.student_uid && String(s.student_uid).trim());
          var bookTag = s.textbook_assigned
            ? '<span style="font-size:11px;color:#6b7280">📚 ' + esc(s.textbook) + '</span>'
            : '<span' + (canPin
                  ? ' class="tc-book-pin" role="button" tabindex="0"'
                    + ' data-uid="' + esc(s.student_uid) + '"'
                    + ' data-who="' + esc((s.student_name || s.student_uid) + ' (' + s.student_uid + ')') + '"'
                    + ' title="' + T('이 학생에게 교재를 배정합니다', 'Assign a textbook to this student') + '"'
                    + ' style="cursor:pointer;'
                  : ' style="')
              /* ⚠️ nowrap — 좁은 칸에서 「📚 교재 미배정 ▸」가 두 줄로 접혀 배지가 48px 이 됐다(실측).
                 한 줄짜리 상자에는 줄바꿈을 막아 둔다(CLAUDE.md 2장). */
              + 'display:inline-block;white-space:nowrap;padding:2px 8px;border-radius:99px;font-size:10.5px;font-weight:800;'
              + 'background:rgba(245,158,11,0.16);color:#b45309;border:1px solid rgba(245,158,11,0.45)">'
              /* ▸ 는 «누를 수 있다» 는 표시다 — 폰에는 hover 도 title 도 없어서 글자로 말해야 한다 */
              + T('📚 교재 미배정', '📚 no textbook') + (canPin ? ' ▸' : '') + '</span>';
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
    /* 🎯 배지 → «그 학생만» 배정 창. render() 가 통째로 다시 그리므로 리스너는 안 쌓인다.
       ⚠️ role="button" 이라 키보드도 받아야 한다(Enter·Space) — 안 그러면 마우스 전용이 된다. */
    var pins = box.querySelectorAll('.tc-book-pin');
    for (var pi = 0; pi < pins.length; pi++) {
      (function (el) {
        var open = function (ev) {
          if (ev) ev.preventDefault();
          var uid = el.getAttribute('data-uid') || '';
          if (!uid) return;
          if (typeof window.mangoiOpenBulkTextbook !== 'function') {
            alert(T('교재 배정 창을 열지 못했습니다. 새로고침 후 다시 시도해 주세요.',
                    'Could not open the textbook assignment dialog. Please refresh and try again.'));
            return;
          }
          window.mangoiOpenBulkTextbook({ userIds: [uid], who: el.getAttribute('data-who') || uid });
        };
        el.addEventListener('click', open);
        el.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') open(ev);
        });
      })(pins[pi]);
    }
    /* 📅 연기·변경 칩 → 창. render() 가 통째로 다시 그리므로 리스너는 안 쌓인다. */
    var mvs = box.querySelectorAll('.tc-move-pin');
    for (var mi = 0; mi < mvs.length; mi++) {
      (function (el) {
        var open = function (ev) { if (ev) ev.preventDefault(); tcOpenMoveModal(el.getAttribute('data-sid')); };
        el.addEventListener('click', open);
        el.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') open(ev);
        });
      })(mvs[mi]);
    }
    var bulkBtn = $('tc-bulk-book');
    if (bulkBtn) {
      bulkBtn.addEventListener('click', function () {
        /* ⛔ 이 화면이 배정을 «직접» 하지 않는다 — 대상 미리보기를 강제하는 그 모달로만 간다.
           ⚠️ 함수가 없으면(스크립트 미로드·이름 변경) 조용히 넘기지 말고 사람에게 말한다 —
              아무 일도 안 일어나면 «버튼이 고장났다» 로 읽힌다. */
        /* 📌 «이 줄이 센 수» 와 «저 창의 기본 대상» 은 모집단이 다르다 — 이 줄은 «화면에 보이는
           줄» 을 세는데, 저 창은 학생 검색어가 비면 «권한 범위 전체» 가 대상이다.
           그 말을 실행 직전에 사람이 보는 자리(상태줄)에 적어 준다. 감추면 「3건인 줄 알고
           눌렀는데 수백 명이 잡혔다」가 된다(CLAUDE.md 2장 「두 수를 비교해 알려 줄 때」).
           ⛔ 대신 검색어를 채워 좁히지는 않는다 — 그 칸은 **부분일치**라 아이디 하나로
              남의 계정까지 걸린다(정확일치는 서버 몫 — 다음 판). */
        if (typeof window.mangoiOpenBulkTextbook === 'function') {
          window.mangoiOpenBulkTextbook({ note: T(
            '⚠ 이 창의 기본 대상은 «오늘 수업 ' + missing + '건» 이 아니라 권한 범위의 미배정 학생 전체입니다. 「대상 미리보기」로 인원을 먼저 확인하세요.',
            '⚠ This dialog targets ALL unassigned students in your scope — not just the ' + missing + ' shown here. Preview the targets first.') });
          return;
        }
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
    /* 🌙 시간대(23시 이후 · 야간) — 화면 안에서만 거른다(서버를 다시 부르지 않는다). */
    var nt = $('tc-night');
    if (nt && !nt._tcBound) { nt._tcBound = true; nt.addEventListener('change', render); }
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
  /* 🌐 (2026-09-08) 🌐 EN 을 누르면 이 표도 따라오게 한다.
     [무엇이 문제였나] 이 표는 render() 가 T() 로 글자를 «그리는» 방식이라
       adm-core.js 의 applyAdminLangDom() 이 손댈 수 없다(그건 data-ko/data-en 요소만 본다).
       그런데 여기엔 lang 리스너가 없어서, 매니저가 EN 을 눌러도 표 전체가 한국어로 남고
       🔄 불러오기를 다시 눌러야 바뀌었다(함정 대조에서 잡힘).
     ⚠️ 발행처가 화면마다 다르다 — adm-core.js 의 toggleAdminLang 은 **document** 에 쏘고
        CustomEvent 는 기본이 bubbles:false 라 window 로 안 올라간다. **둘 다** 듣는다.
     ⛔ data-ko/data-en 으로 풀지 말 것 — 그 줄에는 버튼이 들어 있어 두 i18n 엔진이
        textContent 를 통째로 갈아끼우면 **버튼이 사라진다**(CLAUDE.md 2장).
     ⛔ 서버를 다시 부르지 않는다(render() 만) — 이미 받아 둔 _rows 로 다시 그린다. */
  document.addEventListener('mangoi:lang-changed', function () { syncSubHelp(); if (_rows.length) render(); });
  window.addEventListener('mangoi:lang-changed', function () { syncSubHelp(); if (_rows.length) render(); });
})();
