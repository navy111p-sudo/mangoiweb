// Daily manager manual. Account IDs match auth-admin.ts and approval-policy.ts.
// Only a fresh /api/admin/me response may select recipients; never trust stored names.
(function () {
  'use strict';
  if (window.__adminDailyManual) return;
  window.__adminDailyManual = true;
  var PH = [["인수인계 확인", "Read handover", "어제 남은 일·공지·오늘 담당자를 확인합니다.", "Read open issues and notices. Assign today’s duty lead."], ["교사 출근 확인", "Check attendance", "결근·지각 확인 후 대체 교사를 준비합니다.", "Check absences and delays. Arrange cover and tell Korea."], ["수업 준비 확인", "Check readiness", "카메라·마이크·인터넷·교재를 점검합니다.", "Before the first class, test audio, video, internet and books."], ["수업 진행 확인", "Monitor classes", "입장·끊김을 확인하고 문제 발생 즉시 연락합니다.", "Check class entry and connection. Act on issues at once."], ["카카오 문의와 평가 확인", "Review Kakao inquiries & feedback", "새 문의에 답하고 교사에게 개선점을 안내합니다.", "Reply to new inquiries. Coach teachers on feedback."], ["수업 기록 확인", "Check records", "결석·중단·피드백 누락·녹화 이상을 기록합니다.", "Log absences, interruptions, missing notes and recording issues."], ["퇴근 전 보고", "Send handover", "처리 결과·남은 수업·미해결 일을 한국에 인계합니다.", "Tell Korea what is done, what is open and who covers remaining classes."]];
  var KR = [["필리핀 보고 확인", "Read PH report", "급한 문제부터 담당자와 처리 기한을 정합니다.", "Review urgent issues. Set an owner and deadline."], ["고객 문의 응대", "Reply to customers", "카카오채널 미답변·불만부터 확인하고 답합니다.", "Reply to unanswered Kakao inquiries and complaints first."], ["수업 일정 확인", "Confirm schedules", "신규·체험·보강·교사 변경을 확인하고 안내합니다.", "Confirm new, trial, makeup and changed classes with PH and students."], ["사이트 점검", "Check the service", "로그인·교실·교재·AI·알림 오류를 확인합니다.", "Check login, classroom, books, AI and alerts. Report faults to tech support."], ["수강과 결제 확인", "Check accounts", "미납·만료·연장과 화상수업·AI 권한을 확인합니다.", "Check unpaid fees, renewals, expiry and video/AI access."], ["문제 최종 처리", "Resolve issues", "불만·중단 수업을 확인하고 회사 기준대로 처리합니다.", "Follow up on complaints and interrupted classes. Apply approved makeup/refund rules."], ["퇴근 전 마무리", "Close the day", "학생 안내·조치 완료를 확인하고 중요 일을 보고합니다.", "Confirm action and student updates. Report key issues to the owner; hand over open work."]];
  var COMMON = [["즉시 공유", "Alert both teams", "불참·접속 불가·끊김은 양쪽 관리자에게 즉시 공유합니다.", "Report no-shows, access failures and connection loss to both teams at once."], ["역할대로 조치", "Act by role", "필리핀은 교사·대체 준비, 한국은 학생 안내·후속 처리를 맡습니다.", "PH handles teachers and cover. Korea handles student updates and follow-up."], ["완료 확인", "Confirm closure", "수업 재개·학생 안내까지 확인하고, 남은 일은 담당자·기한을 남깁니다.", "Confirm class recovery and student updates. Assign an owner and deadline to open items."]];
  var TARGETS = ['mgr_maimai', 'mgr_karl', 'mgr_melca', 'admin', 'mgr_jjw'];
  var PREFIX = 'mangoi_admin_manual_closed_v1:';
  var pending = false, checkedDay = '', currentUser = '', openedDay = '';
  var dialog, host, priorFocus, memoryClosed = Object.create(null);
  function koreaDay() { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); }
  function closedDay(uid) {
    try { return localStorage.getItem(PREFIX + uid) || memoryClosed[uid]; }
    catch (_) { return memoryClosed[uid]; }
  }
  function escapeText(s) {
    return s.replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; });
  }
  function list(rows) {
    return '<ol>' + rows.map(function (r, i) {
      return '<li><span class="number" aria-hidden="true">' + (i + 1) + '</span><div>'
        + '<h3 lang="ko">' + escapeText(r[0]) + '</h3><div class="en-title" lang="en">' + escapeText(r[1]) + '</div>'
        + '<p lang="ko">' + escapeText(r[2]) + '</p><p class="en" lang="en">' + escapeText(r[3]) + '</p></div></li>';
    }).join('') + '</ol>';
  }
  function dismiss() {
    if (!dialog || !dialog.open) return;
    // Mark only on dismissal, not when the network request succeeds or the modal opens.
    memoryClosed[currentUser] = openedDay;
    try { localStorage.setItem(PREFIX + currentUser, openedDay); } catch (_) {}
    dialog.close();
    if (priorFocus && priorFocus.isConnected && typeof priorFocus.focus === 'function') priorFocus.focus({ preventScroll: true });
  }
  function build() {
    host = document.createElement('div');
    host.id = 'admin-daily-manual';
    // Isolate from admin.html's legacy theme rules and single-language translators.
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>'
      + ':host{all:initial}*{box-sizing:border-box}dialog{color:#19324b;background:#fff;border:0;border-radius:20px;padding:0;width:min(1120px,calc(100% - 24px));max-width:none;max-height:calc(100dvh - 24px);margin:auto;box-shadow:0 20px 70px #0006;font:16px/1.55 system-ui,-apple-system,"Noto Sans KR",sans-serif;overflow:hidden}dialog[open]{display:flex;flex-direction:column}dialog::backdrop{background:rgba(10,25,45,.72)}'
      + 'header{padding:22px 26px 14px;border-bottom:1px solid #dde5ed;flex:none}h1{font-size:25px;line-height:1.3;margin:0 0 5px}header p{margin:3px 0;font-size:14px;color:#4a6074}.subtitle{font-weight:650}.content{padding:20px 26px;overflow:auto;overscroll-behavior:contain;min-height:0}.columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}.team{--accent:#087c87;--tint:#f0fafa;--line:#b5dcdc}.team.kr{--accent:#2555a5;--tint:#f2f6ff;--line:#c4d3ed}h2{font-size:20px;line-height:1.4;margin:0;padding:12px 16px;background:var(--accent);color:#fff;border-radius:10px}.names{display:block;font-size:14px;font-weight:500;margin-top:3px}ol{list-style:none;padding:0;margin:12px 0 0;display:grid;gap:10px}li{display:flex;align-items:flex-start;gap:12px;background:var(--tint);border:1px solid var(--line);border-radius:12px;padding:14px;break-inside:avoid}.number{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:var(--accent);color:#fff;font-weight:750}li>div{min-width:0}h3{font-size:17px;margin:0;color:var(--accent);line-height:1.4}.en-title{font-size:15px;font-weight:650;color:var(--accent)}p{margin:7px 0 0;overflow-wrap:anywhere}.en{color:#40576d;font-size:15px;margin-top:4px}.shared{--accent:#88550a;--tint:#fff8e9;--line:#e9d29b;margin-top:22px}.shared h2{background:#fff1cc;color:#775007}.report{margin-top:18px;background:#f3f5f8;border:1px solid #d5dde5;border-radius:12px;padding:15px}.report h2{background:none;color:#19324b;padding:0;font-size:18px}.timezone{font-size:13px;color:#4a6074}footer{flex:none;display:flex;align-items:center;justify-content:space-between;gap:15px;padding:14px 26px;background:#fff;border-top:1px solid #d6e0e9}footer p{font-size:13px;color:#526779;margin:0}button{font:700 17px/1.4 inherit;font-family:inherit;font-size:17px;font-weight:700;flex:none;min-height:48px;padding:11px 26px;border:0;border-radius:10px;background:#193b63;color:#fff;cursor:pointer}button:hover{background:#0f2949}button:focus-visible{outline:3px solid #d48800;outline-offset:3px}h1:focus{outline:none}'
      + '@media(max-width:700px){dialog{border-radius:14px}header{padding:16px}h1{font-size:21px}.content{padding:16px}.columns{grid-template-columns:1fr;gap:20px}footer{padding:12px 16px}footer p{font-size:12px}button{padding:11px 18px}h2{font-size:19px}li{padding:12px}}'
      + '@media(max-height:500px){header{padding:10px 16px}header .intro{display:none}h1{font-size:20px}footer{padding:8px 16px}}'
      + '</style><dialog aria-labelledby="daily-manual-title" aria-describedby="daily-manual-description">'
      + '<header><h1 id="daily-manual-title" tabindex="-1">망고아이 관리자 매일 업무 매뉴얼</h1><p class="subtitle" lang="en">MANGOAI DAILY ADMIN CHECKLIST</p>'
      + '<p id="daily-manual-description" class="intro">출근부터 퇴근까지 번호 순서대로 확인하세요.<br><span lang="en">Follow the numbers from arrival to end of shift.</span></p></header>'
      + '<div class="content"><div class="columns">'
      + '<section class="team ph"><h2>필리핀 관리자 | Philippines team<span class="names">Maimai · Karl · Melca</span></h2>' + list(PH) + '</section>'
      + '<section class="team kr"><h2>한국 관리자 | Korea team<span class="names">정우영 대표이사 · 장지웅 부장</span></h2>' + list(KR) + '</section></div>'
      + '<section class="shared"><h2>공통 대응 순서 | When a problem occurs</h2>' + list(COMMON) + '</section>'
      + '<section class="report"><h2>매일 보고 | Daily handover</h2><p>날짜·담당자 / 학생 이름·ID / 교사·수업 시간 / 문제·조치 / 남은 일·담당자·기한</p><p class="en" lang="en">Date &amp; staff / Student name &amp; ID / Teacher &amp; class time / Issue &amp; action / Open items, owner &amp; deadline</p></section>'
      + '<p class="timezone">시간은 한국 기준으로 공유합니다. 필리핀은 1시간 느립니다.<br><span lang="en">Use Korea time. PH is 1 hour behind.</span></p></div>'
      + '<footer><p>한국 시간 기준 매일 표시됩니다.<br><span lang="en">Shown daily, based on Korea time.</span></p><button type="button" aria-label="닫기 / Close">닫기 / Close <span aria-hidden="true">X</span></button></footer></dialog>';
    document.body.appendChild(host);
    dialog = root.querySelector('dialog');
    root.querySelector('button').addEventListener('click', dismiss);
    dialog.addEventListener('cancel', function (e) { e.preventDefault(); dismiss(); });
  }
  function show(uid, day) {
    if (!dialog) build();
    if (dialog.open) return;
    currentUser = uid;
    openedDay = day;
    priorFocus = document.activeElement;
    dialog.showModal();
    host.shadowRoot.querySelector('.content').scrollTop = 0;
    host.shadowRoot.querySelector('h1').focus({ preventScroll: true });
  }
  function check() {
    var day = koreaDay();
    if (pending || (dialog && dialog.open) || checkedDay === day) return;
    pending = true;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 10000);
    fetch('/api/admin/me', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok || !j.user) return;
        checkedDay = day;
        var uid = String(j.user.username || '').trim().toLowerCase();
        if (j.role !== 'hq' || !j.scope || j.scope.type !== 'hq' || TARGETS.indexOf(uid) < 0) return;
        if (closedDay(uid) !== day) show(uid, day);
      })
      .catch(function () { /* Keep the dashboard usable; retry on focus/online after a failed lookup. */ })
      .finally(function () { clearTimeout(timer); pending = false; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check, { once: true });
  else check();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
})();
