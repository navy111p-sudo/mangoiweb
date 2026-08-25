/* idx-vc-shared-notice.js — "공용 연습방" 진입 사후 안내 (2026-08-25)
   원래 idx-main.js(849KB, blocking) 안에 있던 것을 여기로 뺐다 — 첫 화면 예산 여유가
   거의 0(CLAUDE.md)이라, idx-main.js 는 window.__vcSharedRoomNotice 를 세팅만 하고
   실제 배너·alert 는 이 defer 파일이 그린다. 호출부는 idx-main.js 의 vcJoinRoom() 안,
   showView('view-videocall-call') + vc-in-call 추가 + 전체화면 호출 «뒤» 다(순서 유지 필수).

   값 모양: 'teacher' | 'student' | { who:'student', openAtTs }
     openAtTs 가 있으면 "오늘 수업이 없다"가 아니라 "있지만 아직 시작 10분 전"인 경우다
     (api-mango.ts 의 session.status==='early' — join_open 인 게 없으면 서버 current 가
     가장 가까운 예정 수업을 그대로 준다). 이때는 "수업 없음" 대신 열리는 시각을 알려준다. */
(function () {
  'use strict';
  window.vcSharedRoomAlert = function (raw) {
    try {
      var isObj = raw && typeof raw === 'object';
      var who = isObj ? raw.who : raw;
      var openAtTs = isObj ? raw.openAtTs : null;
      var en0 = (typeof getLang === 'function' && getLang() === 'en');
      var nm = document.getElementById('vc-room-name');
      if (nm && nm.parentNode) {
        var tag = document.createElement('span');
        tag.textContent = en0 ? '  (shared practice room - others may join)' : '  (공용 연습방 · 다른 사람도 들어올 수 있어요)';
        tag.style.cssText = 'font-size:11.5px;font-weight:700;color:#fbbf24;margin-left:6px';
        nm.parentNode.insertBefore(tag, nm.nextSibling);
      }
      setTimeout(function () {
        if (who === 'student') {
          if (openAtTs) {
            var oL = new Date(openAtTs).toLocaleTimeString(en0 ? 'en-US' : 'ko-KR', { hour: '2-digit', minute: '2-digit' });
            alert(en0
              ? ('Not open for entry yet, so you entered a SHARED practice room.\n\nYour class opens at ' + oL + ' (10 min before start). Come back then and use "Enter My Class Now".')
              : ('아직 입장 시간이 아니라서 "공용 연습방"으로 들어왔어요.\n\n오늘 수업은 ' + oL + '부터 입장할 수 있어요(시작 10분 전). 그 시간에 "오늘 내 수업 바로 입장"으로 다시 들어와 주세요.'));
          } else {
            alert(en0
              ? "You don't have a class booked for today, so you entered a SHARED practice room — not your real classroom.\n\nOther students/teachers may also be here. Please don't start a lesson here. Check the home screen for your class days/times, and use \"Enter My Class\" when it's actually time."
              : '오늘 예약된 수업이 없어서, 실제 수업방이 아닌 "공용 연습방"으로 들어왔어요.\n\n다른 학생·강사도 이 방에 있을 수 있어요. 여기서 수업을 진행하지 마세요.\n홈 화면에서 내 수업 요일·시간을 확인하고, 수업 시간이 되면 "오늘 내 수업 바로 입장"을 이용해 주세요.');
          }
        } else {
          alert(en0
            ? 'You have no class booked for today, so you entered the shared practice room.\n\nOther teachers can also enter this room. For a real class, enter from your booked class - then you get your own room.'
            : '오늘 예약된 수업이 없어 공용 연습방으로 들어왔어요.\n\n이 방에는 다른 선생님도 들어올 수 있습니다.\n실제 수업은 예약된 수업으로 입장하시면 선생님만의 방으로 들어갑니다.');
        }
      }, 900);
    } catch (e) {}
  };
})();
