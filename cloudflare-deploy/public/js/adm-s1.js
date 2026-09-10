// ═══════════════════════════════════════════════════════════════
// adm-s1.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const $ = id => document.getElementById(id);
  const v = id => ($(id)?.value||'').trim();

  // 👁 Ghost
  let _curObsId = null;

  /* 🔴 (2026-07-23) 진행 중인 수업 목록 — 매니저가 강의실 ID 를 몰라도 바로 참관/입장.
     기존 /api/active-rooms 를 그대로 쓴다(신규 API 없음).
     줄을 누르면 강의실 ID 칸이 채워지고, 버튼으로 참관 또는 직접 입장까지 이어진다. */
  /* 🌐 언어 판정 — 정본은 window.adminLang (adm-lang-boot.js 가 정하고, adm-core.js 의
     `var adminLang` 이 같은 바인딩이라 KO/EN 토글까지 따라온다. 저장 키는 mangoi_lang).
     ⚠️ 예전엔 localStorage 'adminLang' 을 읽었는데 그 키는 **아무도 저장하지 않는 죽은 키**라
        EN 스태프에게도 늘 한국어였다(2026-08-27 수리). ⛔ 그 키에 쓰는 방식으로 되살리지 말 것. */
  function _ghIsEn(){
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch(e){ return false; }
  }
  window.ghPickRoom = function(roomId){
    const el = $('gh-room-id');
    if (!el) return;
    el.value = roomId;
    el.focus();
    try { el.style.outline = '2px solid #8b5cf6'; setTimeout(function(){ el.style.outline = ''; }, 1200); } catch(e){}
  };
  /* 👤 내 관리자 아이디 — 로그인 세션(localStorage)에서 읽는다. 없으면 UID 칸의 값.
     (실시간 수업 현황의 observeRoom 과 같은 방식 — adm-core.js) */
  function _ghMyUid(){
    try {
      const s = JSON.parse(localStorage.getItem('mangoi_admin_session') || '{}') || {};
      if (s.uid) return String(s.uid).trim();
    } catch(e){}
    return v('gh-admin-uid');
  }
  /* 👁 (2026-08-27 사장님 「하나하나 입력해야 해서 관찰이 어렵다 — 보다는 줄마다 버튼 하나였다」)
     한 번 클릭으로 참관. UID 는 로그인 세션에서, 사유는 사유 칸에 글이 있으면 그 글로,
     비어 있으면 자동 문구로 감사 로그에 남긴다(기록 없이 들어가지 않는다 — 학생 사생활 보호 정책 그대로).
     기록이 실패해도 참관 자체는 막지 않는다(수업 대응이 우선 — adm-core observeRoom 과 같은 판단).
     새 탭으로 열리므로 여러 수업을 동시에 참관할 수 있다(방마다 참관 동시 4명 제한은 서버 그대로 — 정본은 video-call-room.ts 의 OBSERVER_MAX). */
  window.ghQuickObserve = function(roomId){
    const en = _ghIsEn();
    const uid = _ghMyUid();
    const reason = v('gh-reason')
      || (en ? 'Quick observe from the live list (Class Observation card)'
             : '라이브 목록에서 즉시 참관 (수업 관찰 카드)');
    try {
      if (uid) fetch('/api/admin/ghost/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ admin_uid: uid, room_id: roomId, reason: reason })
      }).catch(function(){});
    } catch(e){}
    const url = location.origin + '/?observe=' + encodeURIComponent(roomId);
    if (window.mangoiOpenTab) window.mangoiOpenTab(url, en ? 'Observe class' : '수업 관찰 열기');
    else window.open(url, '_blank', 'noopener');
  };
  /* 🚪 매니저 직접 입장 — 강사가 못 들어왔을 때 대신 수업을 맡기 위한 통로.
     참관(ghost)과 달리 실제 참가자로 들어간다. 새 창으로 열어 관리자 화면은 그대로 둔다. */
  /* 📷 (2026-08-20) 직접 입장은 카메라를 끈 채로 들어간다 — &vc_cam=off (js/vc-observe-guard.js 가 처리).
     [왜] 이 버튼은 참관이 아니라 «실제 참가자» 다. 켠 채로 들어가면 수업 중간에 학생 화면에
          낯선 얼굴이 갑자기 뜬다(2026-08-19 필리핀 매니저 제보). 트랙은 살려 두므로 수업 안에서
          [카메라] 버튼 한 번이면 켜진다 — 「강사 대신 수업을 맡는」 용도는 그대로다.
     ⚠️ 확인 문구를 늘릴 때는 teacher_feedback_admin_harness 의 «ghEnterRoom 뒤 600자 안에 confirm»
        검사를 넘기지 않게 — 긴 설명은 이렇게 함수 «위» 에 둔다. */
  window.ghEnterRoom = function(roomId){
    const en = _ghIsEn();
    const msg = en ? ('Enter class "' + roomId + '" as a participant?\n\n'
                    + '· NOT observation — students and the teacher see you.\n'
                    + '· Camera starts OFF ([Camera] button turns it on).')
                   : ('수업 "' + roomId + '" 에 직접 입장할까요?\n\n'
                    + '· 참관이 아니라 실제 참가자 — 학생·강사에게 보입니다.\n'
                    + '· 카메라는 꺼진 채로 입장합니다([카메라] 버튼으로 켜기).');
    if (!confirm(msg)) return;
    const url = location.origin + '/?vc_autojoin=1&vc_cam=off&vc_role=teacher&vc_room=' + encodeURIComponent(roomId);
    /* 팝업이 막히면 조용히 실패하지 않도록 공통 헬퍼 사용 (adm-core.js) */
    if (window.mangoiOpenTab) window.mangoiOpenTab(url, en ? 'Enter class' : '수업 입장');
    else window.open(url, '_blank', 'noopener');
  };
  /* 👥 (2026-09-10 사장님 「meet-1234 가 계속 이렇게 보이는데 이유가 뭐지?」)
     회의방(meet-…)을 «수업» 줄과 갈라 그린다.
     ─────────────────────────────────────────────────────────────────────────
     [무엇이 문제였나] 이 카드 제목은 「지금 진행 중인 수업」인데 /api/active-rooms 는
       방 종류를 가리지 않는다. 그래서 예약이 없는 회의방이 «수업» 칸 «—» 인 채로 진짜
       수업과 나란히 뜨고, 혼자 있으면 「⚠ 혼자 대기중」 노란불까지 붙었다.
       회의방은 «끝나는 시각» 이 없어 탭을 닫기 전에는 사라지지 않는다 — 서버의 죽은 소켓
       청소는 «브라우저가 죽었을 때» 만 돌고, 탭이 살아 있으면 25초마다 ping 이 가서
       «정상 접속» 이 맞다. ⟹ 그 노란불이 몇 시간이고 켜져 있었다(2026-09-10 실측:
       meet-1234 가 09:05 부터 「⚠ 혼자 대기중」으로 남아 있었다).
     [고침] 목록을 둘로 나눈다 — 수업방은 예전 그대로, 회의방은 접힌 «회의방» 구역으로
       내리고 노란 경고 대신 회색 «혼자» 로만 적는다. 개수도 갈라 센다.
     ⛔ 줄을 «지우지» 않는다 — 참관·양식·직접입장 버튼도 그대로다. 감추면 「기능이 없어졌다」가 된다.
     ⚠️ 판정은 방 이름 접두사 하나뿐이다(회의방 정본은 js/idx-vc-roomcode.js 의
        resolveRoomCode() 가 meet- 을 붙인다). 대소문자를 무시하는 이유는 MEET-1234 처럼
        대문자로 만들어진 «다른 방» 도 회의방으로 보여야 하기 때문이다(방 이름은
        idFromName 이라 대소문자를 구분한다 — CLAUDE.md 2장).
     ⛔ class-·c24-·demo-·room-·mangoi-class 는 한 글자도 건드리지 않는다. */
  function _ghIsMeetRoom(roomId){ return /^meet-/i.test(String(roomId || '')); }

  /* 방 한 줄. 수업방·회의방이 같은 함수를 쓰고 «회의방인가» 만 다르게 그린다. */
  function _ghRoomRow(rm, sched, en, isMeet){
    const names = (rm.users || []).map(function(u){ return esc(u.username); }).join(', ') || '-';
    const rid = esc(rm.roomId);
    const ridAttr = encodeURIComponent(rm.roomId);
    /* 👤 한 명뿐이면 상대가 아직 안 들어온 상태 — 매니저가 가장 먼저 봐야 할 줄이라 표시.
       ⚠️ 회의방에서는 «혼자» 가 흔하고 끝나는 시각도 없어 노란불이 늘 켜져 있다.
          그래서 회의방에서는 색만 낮춘다 — 사실(혼자다)은 그대로 적는다. */
    const alone = (rm.userCount === 1)
      ? (isMeet
          ? ' <span style="color:#94a3b8;font-weight:700">' + (en ? 'alone' : '혼자') + '</span>'
          : ' <span style="color:#fbbf24;font-weight:800">' + (en ? '⚠ waiting alone' : '⚠ 혼자 대기중') + '</span>')
      : '';
    /* 👥 예약된 강사·학생. 못 이었으면 «—» — 추측해서 채우지 않는다.
       (강사 번호가 세 벌이라 잘못 이으면 조용히 남의 이름이 붙는다 — CLAUDE.md 2장) */
    const sc = sched[rm.roomId];
    const whoT = (sc && sc.teacher_name) ? esc(sc.teacher_name) : '';
    const whoS = (sc && sc.student_name) ? esc(sc.student_name) : '';
    const whoTxt = (whoT || whoS)
      ? (whoT ? '<b style="color:#e9d5ff">' + whoT + '</b>' : '')
        + (whoT && whoS ? '<span style="color:#64748b"> · </span>' : '')
        + (whoS ? '<span style="color:#cbd5e1">' + whoS + '</span>' : '')
        + ((sc && sc.start_time) ? '<div style="color:#94a3b8;font-size:11px">' + esc(sc.start_time) + '</div>' : '')
      /* 회의방은 예약이 없어 이 칸이 늘 비는데, «—» 만 있으면 「빠진 것」 처럼 읽힌다.
         «회의방» 이라고 적어 «원래 없는 것» 임을 화면이 말하게 한다. */
      : (isMeet ? '<span style="color:#94a3b8;font-weight:700">' + (en ? 'meeting room' : '회의방') + '</span>'
                : '<span style="color:#64748b">—</span>');
    return '<tr style="border-top:1px solid rgba(255,255,255,0.06)">'
      + '<td style="padding:6px 8px">' + whoTxt + '</td>'
      + '<td style="padding:6px 8px"><code style="color:#c4b5fd">' + rid + '</code>' + alone + '</td>'
      + '<td style="padding:6px 8px">' + (rm.userCount || 0) + '</td>'
      + '<td style="padding:6px 8px;color:#cbd5e1">' + names + '</td>'
      + '<td style="padding:6px 8px;white-space:nowrap">'
      /* 👁 원클릭 — UID·사유 자동 기록, 새 탭. 여러 줄을 연달아 누르면 동시 참관(보다 방식) */
      +   '<button type="button" class="gh-act gh-act-quick" onclick="ghQuickObserve(decodeURIComponent(\'' + ridAttr + '\'))" '
      +     'title="' + (en ? 'One click — audit log recorded automatically, live view opens in a new tab'
                            : '한 번 클릭 — 감사 기록 자동, 새 탭으로 라이브 화면이 열립니다') + '" '
      +     '>'
      +     (en ? '👁 Observe now' : '👁 바로 참관') + '</button>'
      +   '<button type="button" class="gh-act gh-act-observe" onclick="ghPickRoom(decodeURIComponent(\'' + ridAttr + '\'))" '
      +     'title="' + (en ? 'Fill the form below (write your own reason)' : '아래 양식에 방 번호만 채웁니다 (사유를 직접 적을 때)') + '" '
      +     '>'
      +     (en ? '📋 Fill form' : '📋 양식 채우기') + '</button>'
      /* 🚪 직접 입장은 «학생에게 보이는» 조작이라 참관(보라)과 색을 갈라 둔다.
         초록은 «안전한 기본» 으로 읽혀 참관과 구분이 안 됐다 — 주황 + (보임) 표시. */
      +   '<button type="button" class="gh-act gh-act-enter" onclick="ghEnterRoom(decodeURIComponent(\'' + ridAttr + '\'))" '
      +     'title="' + (en ? 'Join as a real participant — students see you (camera starts off)'
                            : '실제 참가자로 입장 — 학생에게 보입니다 (카메라는 꺼진 채로 시작)') + '" '
      +     '>'
      +     (en ? '🚪 Enter (visible)' : '🚪 직접 입장(보임)') + '</button>'
      + '</td></tr>';
  }

  function _ghRoomsTable(list, sched, en, isMeet){
    return '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'
      + '<thead><tr style="color:#94a3b8;text-align:left">'
      +   '<th style="padding:6px 8px">' + (isMeet ? (en ? 'Kind' : '종류') : (en ? 'Class' : '수업')) + '</th>'
      +   '<th style="padding:6px 8px">' + (en ? 'Room' : '강의실') + '</th>'
      +   '<th style="padding:6px 8px">' + (en ? 'People' : '인원') + '</th>'
      +   '<th style="padding:6px 8px">' + (en ? 'Participants' : '참가자') + '</th>'
      +   '<th style="padding:6px 8px">' + (en ? 'Action' : '액션') + '</th>'
      + '</tr></thead><tbody>'
      + list.map(function(rm){ return _ghRoomRow(rm, sched, en, isMeet); }).join('')
      + '</tbody></table>';
  }

  /* 👥 회의방 구역 — 기본은 «접혀» 있다. 개수는 접힌 채로도 보인다.
     ⚠️ 이모지는 Unicode 13 미만만 쓴다(Win10 두부 방지 — CLAUDE.md 1-4). 👥 = U+1F465. */
  function _ghMeetHtml(list, sched, en){
    if (!list || !list.length) return '';
    return '<details style="margin-top:10px;border-top:1px dashed rgba(148,163,184,0.35);padding-top:8px">'
      + '<summary style="cursor:pointer;font-size:12.5px;color:#94a3b8;font-weight:700;padding:2px 0">'
      +   (en ? ('👥 Meeting rooms · ' + list.length + ' · not classes (click to open)')
             : ('👥 회의방 ' + list.length + '개 · 수업 아님 (눌러서 열기)'))
      + '</summary>'
      + '<div style="font-size:11.5px;color:#64748b;margin:4px 0 6px">'
      +   (en ? 'Rooms opened by typing a room code. They have no booking, so they have no end time — a room stays listed until the last tab is closed.'
             : '방 번호를 쳐서 연 회의방입니다. 예약이 없어 «끝나는 시각» 이 없고, 마지막 탭을 닫아야 목록에서 사라집니다.')
      + '</div>'
      + _ghRoomsTable(list, sched, en, true)
      + '</details>';
  }

  window.ghLoadLive = async function(){
    const box = $('gh-live-list'), cnt = $('gh-live-count');
    const en = _ghIsEn();
    if (!box) return;
    box.textContent = en ? 'Loading…' : '불러오는 중…';
    /* 👤 UID 칸이 비어 있으면 로그인 세션으로 미리 채운다 — 타이핑 한 칸 절약 */
    try {
      const uEl = $('gh-admin-uid');
      const su = JSON.parse(localStorage.getItem('mangoi_admin_session') || '{}') || {};
      if (uEl && !uEl.value.trim() && su.uid) uEl.value = String(su.uid).trim();
    } catch(e){}
    try {
      /* 📅 예약 기준 «지금 수업» 도 함께 받는다 — 카페24 수업은 망고아이 방을 안 거쳐
         이 목록에 안 뜬다(CLAUDE.md 2장 「실시간 수업 현황이 비었는데 수업은 돌고 있음」).
         비어 보이는 이유를 화면이 직접 말하게 한다. 실패해도 방 목록은 종전대로 그린다. */
      const [r, cr] = await Promise.all([
        fetch('/api/active-rooms', { credentials: 'include' }),
        fetch('/api/admin/classes-now', { credentials: 'include', cache: 'no-store' }).catch(function(){ return null; })
      ]);
      const rooms = await r.json();
      let sched2 = [];
      try { if (cr) { const cj = await cr.json(); if (cj && cj.ok) sched2 = cj.classes || []; } } catch(e){}
      const schedHtml = _ghSchedHtml(sched2, en);
      /* 🔢 개수는 «갈라서» 센다 — 한 숫자로 합치면 회의방이 수업 건수로 읽힌다(CLAUDE.md 2장
         「정상 정리분에 진짜 실패가 파묻힌다」와 같은 뿌리). */
      const cntTxt = function(nClass, nMeet){
        const parts = [ (en ? ('· ' + nClass + ' class room(s)') : ('· 수업방 ' + nClass + '개')) ];
        if (nMeet) parts.push(en ? (nMeet + ' meeting room(s)') : ('회의방 ' + nMeet + '개'));
        if (sched2.length) parts.push(en ? (sched2.length + ' booked') : ('예약 수업 ' + sched2.length + '건'));
        return parts.join(' · ');
      };
      if (!Array.isArray(rooms) || !rooms.length) {
        box.innerHTML = '<div style="padding:10px 0;color:#94a3b8">'
          + (en ? 'No one is connected to a Mango-i video room right now.'
                : '지금 망고아이 화상방에 접속해 있는 사람이 없습니다.') + '</div>' + schedHtml;
        if (cnt) cnt.textContent = cntTxt(0, 0);
        return;
      }
      const meetRooms = rooms.filter(function(rm){ return _ghIsMeetRoom(rm.roomId); });
      const classRooms = rooms.filter(function(rm){ return !_ghIsMeetRoom(rm.roomId); });
      if (cnt) cnt.textContent = cntTxt(classRooms.length, meetRooms.length);
      /* 👥 (2026-08-19 제보 2-①) 「누구 수업인지」 — 방 번호만으로는 알 수 없다.
         ⚠️ 참가자 칸(rm.users)은 «지금 접속해 있는 사람»이라 강사가 아직 안 들어왔으면 비어 있다.
            그때가 바로 급히 참관해야 할 때이므로, 예약된 강사·학생을 D1 에서 따로 받아 채운다.
         ⚠️ 실패해도 표는 그대로 뜬다(이름 칸만 «—»). 이름 때문에 목록이 안 나오면 더 나쁘다. */
      let sched = {};
      try {
        const ids = rooms.map(function(rm){ return rm.roomId; }).filter(Boolean);
        if (ids.length) {
          const rn = await fetch('/api/admin/live-classes?rooms=' + encodeURIComponent(ids.join(',')),
                                 { credentials: 'include' });
          const dn = await rn.json();
          if (dn && dn.ok && dn.rooms) sched = dn.rooms;
        }
      } catch (e) { /* 조용히 — 표는 이름 없이 그대로 그린다 */ }

      /* 수업방이 0개인데 회의방만 있을 때 «접속해 있는 사람이 없습니다» 라고 하면 거짓말이 된다.
         «수업» 이 없다는 것과 «아무도 없다» 는 다른 사실이다. */
      const classHtml = classRooms.length
        ? _ghRoomsTable(classRooms, sched, en, false)
        : '<div style="padding:10px 0;color:#94a3b8">'
          + (en ? ('No class room is in progress right now.'
                   + (meetRooms.length ? ' (' + meetRooms.length + ' meeting room(s) below — not classes.)' : ''))
                : ('지금 진행 중인 수업방이 없습니다.'
                   + (meetRooms.length ? ' (아래 회의방 ' + meetRooms.length + '개는 수업이 아닙니다.)' : '')))
          + '</div>';
      box.innerHTML = classHtml + _ghMeetHtml(meetRooms, sched, en) + schedHtml;
    } catch(e) {
      box.innerHTML = '<div style="padding:10px 0;color:#fca5a5">⚠ ' + esc(e.message || e) + '</div>';
    }
  };

  /* 📅 예약 기준 «지금 수업» 줄들 — 두 갈래가 함께 온다.
     · source='mangoi'  = 수강신청으로 만든 우리 수업. 방이 결정론적으로 있어
       **아무도 안 들어와도 참관할 수 있다**(observable) → 시작 직전에도 버튼이 있다.
     · source='cafe24'  = 카페24에서 도는 수업. 망고아이 방이 아예 없어 참관할 «방» 이 없다.
       접속이 확인돼 방이 잡힌 줄(live_room)에만 참관을 단다.
     ⛔ 참관 버튼을 live_room 하나로 가르지 말 것 — 2026-09-01 까지 그랬는데, 수강신청 수업이
        이 목록에 아예 안 왔고(서버가 카페24 행만 읽었다) 위쪽 «화상방» 목록은 사람이 붙어야
        떠서, 21:20 수업이 강사가 들어온 21:23 까지 어느 목록에도 없었다.
     ⛔ «접속 기록 없음» 을 «미접속» 이라고 쓰지 않는다 — 우리가 아는 것은 «기록이 없다» 까지다. */
  function _ghSchedHtml(list, en){
    if (!list || !list.length) return '';
    return '<div style="margin-top:10px;border-top:1px dashed rgba(148,163,184,0.35);padding-top:8px">'
      + '<b style="font-size:12.5px;color:#94a3b8">' + (en ? '📅 Booked classes for this moment' : '📅 예약 기준 지금 수업') + '</b>'
      + '<div style="font-size:11.5px;color:#64748b;margin:2px 0 6px">'
      + (en ? '«enrolment» classes have a Mango-i room, so you can observe even before anyone joins. «cafe24» classes do not go through a Mango-i room — «no connection record» is normal there.'
            : '«수강신청» 수업은 망고아이 방이 있어 아무도 안 들어와도 참관할 수 있습니다. «카페24» 수업은 망고아이 방을 거치지 않아 참관 버튼이 없고, «접속 기록 없음» 이 정상입니다.')
      + '</div>'
      + list.map(function(c){
          const ph = c.phase === 'soon' ? (en ? 'Starts soon' : '곧 시작')
                   : c.phase === 'ended' ? (en ? 'Just ended' : '방금 끝남')
                   : (en ? 'In progress' : '진행 중');
          /* 👁 참관할 방 — 망고아이 수업은 접속 전에도 방이 있다(observable),
             카페24 수업은 실제 접속이 잡혔을 때만 방이 생긴다(live_room). */
          const obsRoom = c.observable ? (c.room_id || '') : (c.live_room || '');
          const obsBtn = obsRoom
            ? ' <button type="button" class="gh-act gh-act-quick" onclick="ghQuickObserve(decodeURIComponent(\'' + encodeURIComponent(obsRoom) + '\'))">'
              + (en ? '👁 Observe now' : '👁 바로 참관') + '</button>'
            : '';
          const src = c.observable
            ? ' <span style="color:#c4b5fd;font-weight:700">' + (en ? 'enrolment' : '수강신청') + '</span>'
            : ' <span style="color:#64748b">' + (en ? 'cafe24' : '카페24') + '</span>';
          return '<div style="padding:4px 0;font-size:12.5px;color:#cbd5e1">'
            + '<b>' + esc(c.start_kst || '') + '~' + esc(c.end_kst || '') + '</b>'
            + ' <span style="color:#94a3b8">' + esc(ph) + '</span>' + src + ' · '
            + esc(c.student_name || (en ? '(unknown)' : '(학생 미상)'))
            + ' <span style="color:#64748b">·</span> '
            + esc(c.teacher_name || (en ? '(teacher unknown)' : '(강사 미상)'))
            + (c.connected
                ? ' <span style="color:#86efac;font-weight:700">✅ ' + (en ? 'Connected' : '접속 확인') + '</span>'
                : ' <span style="color:#fbbf24">' + (en ? 'No connection record' : '접속 기록 없음') + '</span>')
            + obsBtn
            + '</div>';
        }).join('')
      + '</div>';
  }

  /* 🔓 (2026-08-27) 카드를 열면 목록을 자동으로 불러온다 — 예전엔 새로고침을 눌러야 했다.
     toggle 은 버블링하지 않으므로 document «캡처» 로 듣는다(adm-core 의 카드 지연로드와 같은 방식).
     실패해도 다시 쏘지 않는다 — 카드 안에 🔄 새로고침 버튼이 따로 있다. */
  document.addEventListener('toggle', function(e){
    const d = e.target;
    if (!d || d.id !== 'card-admin-ghost' || !d.open) return;
    if (window.__ghLiveAutoLoaded) return;
    window.__ghLiveAutoLoaded = true;
    try { window.ghLoadLive(); } catch(err){}
  }, true);
  /* 🌐 언어를 바꾸면 목록을 새 언어로 다시 그린다.
     ⚠️ #gh-live-list 에는 data-ko/data-en 을 달지 않았다(달면 i18n 엔진이 목록을 통째로
        갈아끼운다 — CLAUDE.md 2장). 그래서 JS 가 그린 문자열은 여기서 직접 다시 그린다.
     ⚠️ admin.html 의 발행처는 adm-core.js 의 «document».dispatchEvent 이고 CustomEvent 는
        bubbles:false 라 window 까지 안 올라온다 — 반드시 document 에도 단다(둘 다 들어 안전). */
  function _ghOnLangChanged(){
    if (!window.__ghLiveAutoLoaded) return;
    try { window.ghLoadLive(); } catch(err){}
  }
  document.addEventListener('mangoi:lang-changed', _ghOnLangChanged);
  window.addEventListener('mangoi:lang-changed', _ghOnLangChanged);

  window.ghStart = async function(){
    const admin_uid = v('gh-admin-uid'), room_id = v('gh-room-id'), reason = v('gh-reason');
    if (!admin_uid || !room_id || !reason) { alert('관리자 UID, 강의실 ID, 사유 모두 필수입니다'); return; }
    const r = await fetch('/api/admin/ghost/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ admin_uid, room_id, reason }) });
    const d = await r.json();
    if (d.ok) {
      _curObsId = d.observation_id;
      const viewerUrl = '/admin/ghost-view.html?room_id=' + encodeURIComponent(room_id) + '&obs_id=' + d.observation_id + '&admin_uid=' + encodeURIComponent(admin_uid);
      $('gh-result').innerHTML = `
        <div style="padding:16px;background:linear-gradient(135deg,rgba(139,92,246,0.15),rgba(124,58,237,0.08));border:1px solid rgba(139,92,246,0.40);border-radius:12px;color:#c4b5fd">
          <div style="font-weight:800;color:#ddd6fe;margin-bottom:10px;font-size:14px">✅ 참관 시작 (관찰 ID: <b>${d.observation_id}</b>)</div>
          <div style="font-size:12px;color:#a3b3d1;margin-bottom:14px">📡 학생·강사에게 알림 안 보냄 · 모든 행동은 감사 로그에 기록</div>
          <a href="${viewerUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:14px;box-shadow:0 6px 18px rgba(139,92,246,0.5)">🎬 라이브 화면 열기 (새 창)</a>
          <span style="margin-left:10px;font-size:11.5px;color:#94a3b8">└ 강의실 채팅·참가자·알림을 3초마다 실시간 표시</span>
        </div>`;
    } else $('gh-result').innerHTML = '<div style="padding:12px;color:#fca5a5">⚠ ' + esc(d.error||'') + (d.message?'<br>'+esc(d.message):'') + '</div>';
  };
  window.ghEnd = async function(){
    if (!_curObsId) { alert('진행 중인 참관 세션이 없습니다'); return; }
    const admin_uid = v('gh-admin-uid');
    const r = await fetch('/api/admin/ghost/end', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ admin_uid, observation_id: _curObsId }) });
    const d = await r.json();
    $('gh-result').innerHTML = d.ok ? '<div style="padding:12px;color:#86efac">⏹ 참관 종료 (지속 ' + d.duration_sec + '초)</div>' : '<div style="color:#fca5a5">⚠ ' + esc(d.error||'') + '</div>';
    if (d.ok) _curObsId = null;
  };
  window.ghLoadSessions = async function(){
    const r = await fetch('/api/admin/ghost/sessions');
    const d = await r.json();
    if (!d.ok || !d.items.length) { $('gh-result').innerHTML = '<div style="padding:14px;color:#94a3b8">참관 기록이 없습니다.</div>'; return; }
    const rows = d.items.map(it => {
      const j = new Date(it.joined_at).toLocaleString('ko-KR');
      const dur = it.left_at ? Math.round((it.left_at - it.joined_at)/1000) + '초' : '<span style="color:#86efac">진행중</span>';
      return '<tr><td>' + esc(it.admin_uid) + '</td><td>' + esc(it.room_id) + '</td><td>' + esc(it.reason||'') + '</td><td>' + j + '</td><td>' + dur + '</td></tr>';
    }).join('');
    $('gh-result').innerHTML = '<table style="width:100%;font-size:12.5px;border-collapse:collapse"><thead><tr style="background:rgba(139,92,246,0.18)"><th style="padding:8px;text-align:left">관리자</th><th style="padding:8px;text-align:left">강의실</th><th style="padding:8px;text-align:left">사유</th><th style="padding:8px;text-align:left">시작</th><th style="padding:8px;text-align:left">지속</th></tr></thead><tbody>' + rows + '</tbody></table>';
  };

  // 📢 Whisper
  window.whSend = async function(){
    const admin_uid = v('wh-admin-uid'), room_id = v('wh-room-id'), teacher_uid = v('wh-teacher-uid');
    const message_type = v('wh-type') || 'text', urgency = v('wh-urgency') || 'normal', payload = v('wh-payload');
    if (!admin_uid || !room_id || !teacher_uid || !payload) { alert('모든 필드 필수'); return; }
    const r = await fetch('/api/admin/whisper/send', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ admin_uid, room_id, teacher_uid, message_type, urgency, payload }) });
    const d = await r.json();
    $('wh-result').innerHTML = d.ok
      ? '<div style="padding:12px;color:#fde68a;background:rgba(245,158,11,0.10);border-radius:8px">📢 귓속말 큐 등록 완료 (ID: ' + d.whisper_id + ', 상태: ' + esc(d.delivery_status) + ')<br><span style="font-size:11px;color:#a3b3d1">' + esc(d.learning_note||'') + '</span></div>'
      : '<div style="padding:12px;color:#fca5a5">⚠ ' + esc(d.error||'') + '</div>';
  };
  window.whLoadLogs = async function(){
    const r = await fetch('/api/admin/whisper/logs');
    const d = await r.json();
    if (!d.ok || !d.items.length) { $('wh-result').innerHTML = '<div style="padding:14px;color:#94a3b8">발송 기록이 없습니다.</div>'; return; }
    const rows = d.items.map(it => {
      const t = new Date(it.sent_at).toLocaleString('ko-KR');
      const preview = (it.payload||'').slice(0, 50);
      return '<tr><td>' + esc(it.admin_uid) + '</td><td>' + esc(it.target_teacher_uid) + '</td><td><span style="padding:2px 8px;background:rgba(245,158,11,0.18);color:#fcd34d;border-radius:99px;font-size:11px">' + esc(it.message_type) + '</span></td><td>' + esc(preview) + '…</td><td>' + t + '</td></tr>';
    }).join('');
    $('wh-result').innerHTML = '<table style="width:100%;font-size:12.5px;border-collapse:collapse"><thead><tr style="background:rgba(245,158,11,0.18)"><th style="padding:8px;text-align:left">관리자</th><th style="padding:8px;text-align:left">강사</th><th style="padding:8px;text-align:left">유형</th><th style="padding:8px;text-align:left">내용</th><th style="padding:8px;text-align:left">시각</th></tr></thead><tbody>' + rows + '</tbody></table>';
  };

  // 🚨 Alerts
  window.alLoad = async function(){
    const r = await fetch('/api/admin/alerts');
    const d = await r.json();
    if (!d.ok || !d.items.length) { $('al-result').innerHTML = '<div style="padding:14px;color:#94a3b8">알림이 없습니다.</div>'; return; }
    const rows = d.items.map(it => {
      const t = new Date(it.triggered_at).toLocaleString('ko-KR');
      const sev = it.severity === 'high' ? '#fca5a5' : it.severity === 'medium' ? '#fcd34d' : '#94a3b8';
      const ack = it.acknowledged_at ? '✅ 확인' : '<button onclick="alAck(' + it.id + ')" style="padding:3px 10px;background:rgba(16,185,129,0.18);color:#86efac;border:1px solid rgba(16,185,129,0.35);border-radius:6px;cursor:pointer;font-size:11px">✓ 확인</button>';
      return '<tr><td>' + it.id + '</td><td>' + esc(it.room_id) + '</td><td><span style="color:' + sev + ';font-weight:800">' + esc(it.alert_type) + '</span></td><td>' + esc(it.severity) + '</td><td>' + esc((it.detail||'').slice(0, 80)) + '</td><td>' + t + '</td><td>' + ack + '</td></tr>';
    }).join('');
    $('al-result').innerHTML = '<table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr style="background:rgba(239,68,68,0.18)"><th style="padding:8px;text-align:left">#</th><th style="padding:8px;text-align:left">강의실</th><th style="padding:8px;text-align:left">유형</th><th style="padding:8px;text-align:left">심각</th><th style="padding:8px;text-align:left">상세</th><th style="padding:8px;text-align:left">시각</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
  };
  window.alAck = async function(id){
    const admin_uid = prompt('관리자 UID 를 입력하세요:');
    if (!admin_uid) return;
    await fetch('/api/admin/alerts/' + id + '/ack', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ admin_uid }) });
    alLoad();
  };
  window.alTestFire = async function(){
    const room_id = prompt('테스트 강의실 ID (예: test-room):') || 'test-room';
    const alert_type = prompt('알림 유형 (silence_20s / forbidden_word / low_engagement):') || 'silence_20s';
    await fetch('/api/admin/alerts/test-fire', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ room_id, alert_type, severity: 'medium' }) });
    alLoad();
  };

  // 📝 Forbidden words
  window.fwLoad = async function(){
    const r = await fetch('/api/admin/forbidden-words');
    const d = await r.json();
    let html = '<div style="margin-bottom:10px"><input id="fw-word" type="text" placeholder="금지 단어" style="padding:7px 10px;background:#142950;color:#e6ecff;border:1px solid rgba(99,102,241,0.30);border-radius:6px;font-size:12.5px"> <select id="fw-sev" style="padding:7px;background:#142950;color:#e6ecff;border:1px solid rgba(99,102,241,0.30);border-radius:6px;font-size:12px"><option value="low">낮음</option><option value="medium" selected>보통</option><option value="high">높음</option></select> <button onclick="fwAdd()" style="padding:7px 14px;background:rgba(239,68,68,0.20);color:#fca5a5;border:1px solid rgba(239,68,68,0.4);border-radius:6px;cursor:pointer;font-size:12.5px">+ 추가</button></div>';
    if (d.ok && d.items.length) {
      const rows = d.items.map(it => '<tr><td>' + esc(it.word) + '</td><td><span style="padding:2px 8px;background:rgba(239,68,68,0.15);color:#fca5a5;border-radius:99px;font-size:11px">' + esc(it.severity) + '</span></td><td>' + esc(it.language) + '</td><td>' + (it.enabled?'✅':'❌') + '</td><td><button onclick="fwDel(' + it.id + ')" style="padding:3px 10px;background:rgba(239,68,68,0.18);color:#fca5a5;border:1px solid rgba(239,68,68,0.35);border-radius:6px;cursor:pointer;font-size:11px">🗑</button></td></tr>').join('');
      html += '<table style="width:100%;font-size:12.5px;border-collapse:collapse"><thead><tr style="background:rgba(239,68,68,0.15)"><th style="padding:8px;text-align:left">단어</th><th style="padding:8px;text-align:left">심각</th><th style="padding:8px;text-align:left">언어</th><th style="padding:8px;text-align:left">사용</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
    } else html += '<div style="padding:14px;color:#94a3b8">등록된 금지 단어가 없습니다.</div>';
    $('al-result').innerHTML = html;
  };
  window.fwAdd = async function(){
    const word = $('fw-word').value.trim(), severity = $('fw-sev').value;
    if (!word) { alert('단어를 입력하세요'); return; }
    await fetch('/api/admin/forbidden-words', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ word, severity, added_by: 'admin' }) });
    fwLoad();
  };
  window.fwDel = async function(id){
    if (!confirm('이 단어를 비활성화할까요?')) return;
    await fetch('/api/admin/forbidden-words/' + id, { method:'DELETE' });
    fwLoad();
  };
})();
