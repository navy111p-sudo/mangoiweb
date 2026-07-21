// ═══════════════════════════════════════════════════════════════
// adm-menu-icons.js — 사이드바 자식·손자 메뉴 아이콘 정돈 (2026-07-22)
//
//   문제: 자식(.ph85-sub)은 컬러 이모지, 손자(.ph125-gc)는 파란 원형 번호 배지라
//         상위 그룹(.ph85-ico, 단색 선 아이콘)과 톤이 어긋나 시각적으로 튀었다.
//   해결: 자식 = 상위와 같은 24px 선 아이콘(단색·currentColor), 평상시 흐리게 두고
//         hover/활성일 때만 또렷해진다. 손자 = 배지 제거, 얇은 마커만.
//
//   i18n(i18n-sweep)이 textContent 를 통째로 갈아끼우므로 data-ko/data-en 의
//   이모지까지 같이 벗겨내야 영어 전환 시 이모지가 되살아나지 않는다.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // 선 아이콘 라이브러리 — viewBox 0 0 24 24, stroke=currentColor
  var I = {
    calendar:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    users:     '<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4"/><path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8"/>',
    chartBar:  '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    family:    '<circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="7" r="2.6"/><path d="M2.5 20v-1.4A3.6 3.6 0 0 1 6.1 15h1.8"/><path d="M21.5 20v-1.4a3.6 3.6 0 0 0-3.6-3.6h-1.8"/><circle cx="12" cy="15" r="2.2"/><path d="M8.4 21v-.7A3.3 3.3 0 0 1 11.7 17h.6a3.3 3.3 0 0 1 3.3 3.3v.7"/>',
    inbox:     '<path d="M3 13h4l2 3h6l2-3h4"/><path d="M5.5 5h13l2.5 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 12l2 2 4-4"/>',
    award:     '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.6L7 22l5-2.6L17 22l-1.5-8.4"/>',
    message:   '<path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
    calClock:  '<path d="M21 11V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6"/><path d="M16 3v4M8 3v4M3 11h18"/><circle cx="17.5" cy="17.5" r="4"/><path d="M17.5 16v1.7l1.2.8"/>',
    news:      '<path d="M4 5h11a1 1 0 0 1 1 1v13H5a1 1 0 0 1-1-1z"/><path d="M16 9h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3"/><path d="M7 9h5M7 12.5h5M7 16h3"/>',
    bot:       '<rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M12 4.5V8"/><circle cx="12" cy="3.5" r="1.2"/><path d="M9 12.5v1.5M15 12.5v1.5"/><path d="M2 12.5v3M22 12.5v3"/>',
    gift:      '<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/><path d="M12 9v12"/><path d="M12 9S9.5 3 7.2 4.4C5.3 5.6 6.6 9 12 9z"/><path d="M12 9s2.5-6 4.8-4.6C18.7 5.6 17.4 9 12 9z"/>',
    cap:       '<path d="M2.5 8.5L12 4l9.5 4.5L12 13z"/><path d="M6.5 10.7V16c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-5.3"/><path d="M21.5 8.5v6"/>',
    image:     '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M4 17l4.5-4.5 3.5 3.5 3-2.5L20 17"/>',
    bookOpen:  '<path d="M12 6.5C10.5 5 8.5 4.3 4 4.3V18c4.5 0 6.5.7 8 2.2"/><path d="M12 6.5C13.5 5 15.5 4.3 20 4.3V18c-4.5 0-6.5.7-8 2.2"/><path d="M12 6.5v13.7"/>',
    brain:     '<path d="M12 5.5a3 3 0 0 0-5.6-1.4A2.8 2.8 0 0 0 4 8.4a3 3 0 0 0 .6 4.7A3 3 0 0 0 7 18a2.8 2.8 0 0 0 5 1.3z"/><path d="M12 5.5a3 3 0 0 1 5.6-1.4A2.8 2.8 0 0 1 20 8.4a3 3 0 0 1-.6 4.7A3 3 0 0 1 17 18a2.8 2.8 0 0 1-5 1.3z"/><path d="M12 5.5v13.8"/>',
    book:      '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v14.5H6.5A1.5 1.5 0 0 0 5 19z"/><path d="M5 19a1.5 1.5 0 0 0 1.5 1.5H19"/>',
    target:    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3"/>',
    mic:       '<rect x="9" y="3" width="6" height="10.5" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>',
    film:      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7.5 5v14M16.5 5v14M3 12h18M3 8.5h4.5M3 15.5h4.5M16.5 8.5H21M16.5 15.5H21"/>',
    gauge:     '<path d="M4 18a9 9 0 1 1 16 0"/><path d="M12 14.5l3.5-4"/><circle cx="12" cy="15.5" r="1.3"/>',
    swords:    '<path d="M14.5 14.5L20 20M20 4l-9.5 9.5"/><path d="M4 4l9.5 9.5M9.5 14.5L4 20"/><path d="M17 3.5h3.5V7M6.5 3.5H3V7"/>',
    drive:     '<rect x="3" y="12.5" width="18" height="7" rx="2"/><path d="M5.5 12.5l2.3-7A1.5 1.5 0 0 1 9.2 4.5h5.6a1.5 1.5 0 0 1 1.4 1l2.3 7"/><path d="M7 16h.01M11 16h6"/>',
    tasks:     '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 10h7M8.5 14h7M8.5 17.5h4"/>',
    shield:    '<path d="M12 3l7.5 3v6c0 4.3-3 7.5-7.5 9-4.5-1.5-7.5-4.7-7.5-9V6z"/><path d="M9.2 12l2 2 3.6-3.6"/>',
    store:     '<path d="M4 10.5V20h16v-9.5"/><path d="M3 6.5h18l-1 4a3 3 0 0 1-5.7.6 3 3 0 0 1-5.6 0A3 3 0 0 1 4 10.5z"/><path d="M10 20v-5h4v5"/>',
    building:  '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/><path d="M10.5 21v-3h3v3"/>',
    download:  '<path d="M12 4v11"/><path d="M8 11.5l4 4 4-4"/><path d="M4 18v1.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V18"/>',
    bell:      '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9"/><path d="M13.7 19.5a2 2 0 0 1-3.4 0"/>',
    eye:       '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12"/><circle cx="12" cy="12" r="3"/>',
    whisper:   '<path d="M21 12a8 8 0 1 1-3.3-6.5"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/><path d="M21 3.5v5h-5"/>',
    check:     '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M8 12.5l2.6 2.6L16.5 9"/>',
    scan:      '<path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><rect x="8" y="8" width="3.5" height="3.5"/><rect x="8" y="13.5" width="3.5" height="2.5"/><rect x="13.5" y="8" width="2.5" height="3.5"/><path d="M13.5 13.5h2.5V16"/>',
    file:      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h5"/>',
    card:      '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 14.5h3"/>',
    repeat:    '<path d="M4 9.5A5 5 0 0 1 9 4.5h9"/><path d="M15 1.8l3 2.7-3 2.7"/><path d="M20 14.5a5 5 0 0 1-5 5H6"/><path d="M9 22.2l-3-2.7 3-2.7"/>',
    alert:     '<path d="M12 4.5l8.5 14.5H3.5z"/><path d="M12 10v3.5M12 16.5h.01"/>',
    pie:       '<path d="M12 3.5v8.5h8.5A8.5 8.5 0 0 0 12 3.5"/><path d="M20 15.5A8.5 8.5 0 1 1 9.5 4.3"/>',
    coins:     '<ellipse cx="9" cy="7" rx="5.5" ry="2.6"/><path d="M3.5 7v4.5c0 1.4 2.5 2.6 5.5 2.6"/><ellipse cx="15" cy="14.5" rx="5.5" ry="2.6"/><path d="M9.5 14.5V17c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-2.5"/>',
    calc:      '<rect x="4.5" y="3" width="15" height="18" rx="2"/><rect x="7.5" y="6" width="9" height="3.5" rx="1"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/>',
    userCheck: '<path d="M15 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H6.5A3.5 3.5 0 0 0 3 18.5V20"/><circle cx="9" cy="8" r="3.5"/><path d="M16.5 11.5l1.8 1.8 3.2-3.4"/>',
    money:     '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
    sliders:   '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    puzzle:    '<path d="M10 4.5h4v2a1.8 1.8 0 1 0 3.5 0v-2h2v4h-2a1.8 1.8 0 1 0 0 3.5h2v4h-4v-2a1.8 1.8 0 1 0-3.5 0v2H4.5v-4h2a1.8 1.8 0 1 0 0-3.5h-2v-4H10z"/>',
    thumb:     '<path d="M7 10.5l3.5-6.5A2 2 0 0 1 14 5.5v3.5h4.5a2 2 0 0 1 2 2.4l-1.3 6a2 2 0 0 1-2 1.6H7"/><rect x="3" y="10.5" width="4" height="8.5" rx="1"/>',
    headset:   '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13.5" width="4" height="6" rx="1.6"/><rect x="17.5" y="13.5" width="4" height="6" rx="1.6"/><path d="M20 19.5v.5a2.5 2.5 0 0 1-2.5 2.5H13"/>',
    link:      '<path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.3"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
    grid:      '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M9 9.5v11M15 9.5v11"/>',
    activity:  '<path d="M3 12.5h4l2.5-7 4 14 2.5-7h5"/>',
    trophy:    '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5V7a3 3 0 0 0 3 3M16 5.5h3V7a3 3 0 0 1-3 3"/><path d="M12 13v3.5M9 20h6M10 20l.5-3.5h3l.5 3.5"/>',
    trash:     '<path d="M4.5 6.5h15"/><path d="M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7"/><path d="M6.5 6.5l1 12.3A1.7 1.7 0 0 0 9.2 20.5h5.6a1.7 1.7 0 0 0 1.7-1.7l1-12.3"/><path d="M10.5 10.5v6M13.5 10.5v6"/>',
    video:     '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.5l6-3.2v9.4l-6-3.2z"/>',
    smile:     '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4.3 4.3 0 0 0 7 0"/><path d="M9.3 9.5h.01M14.7 9.5h.01"/>',
    trend:     '<path d="M3 17l5.5-5.5 3.5 3.5L21 6"/><path d="M15.5 6H21v5.5"/>',
    send:      '<path d="M21 3.5L10.5 14"/><path d="M21 3.5l-6.7 17.2-3.8-6.7-6.7-3.8z"/>',
    megaphone: '<path d="M4 10v4a1.5 1.5 0 0 0 1.5 1.5H8l7 4.5V5.5L8 10z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/><path d="M8 15.5v3a1.5 1.5 0 0 0 1.5 1.5H11"/>',
    layers:    '<path d="M12 3.5l8.5 4.3L12 12 3.5 7.8z"/><path d="M3.5 12.2L12 16.5l8.5-4.3"/><path d="M3.5 16.4L12 20.7l8.5-4.3"/>',
    palette:   '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 2-.8 2-1.8 0-1.5-1.3-1.6-1.3-3 0-1 .8-1.7 1.9-1.7h1.7a4.2 4.2 0 0 0 4.2-4.2c0-3.5-3.8-6.3-8.5-6.3"/><path d="M7.5 11h.01M10 7.8h.01M14.5 7.8h.01M17 11h.01"/>',
    backpack:  '<path d="M5 20V11a7 7 0 0 1 14 0v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/><path d="M9 14h6v3.5H9z"/>',
    bug:       '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M8 11H4.5M8 15H4.5M16 11h3.5M16 15h3.5"/><path d="M9.5 7l-1.5-3M14.5 7l1.5-3"/>',
    clock:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/>',
    starLine:  '<path d="M12 4l2.5 5.2 5.5.8-4 4 .9 5.5L12 16.9 7.1 19.5l.9-5.5-4-4 5.5-.8z"/>',
    search:    '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    dot:       '<circle cx="12" cy="12" r="6"/>'
  };

  // 카드 → 아이콘 (직관 우선: 무엇을 하는 화면인지 형태로 바로 읽히게)
  var MAP = {
    'sm-all-schedules':'calendar','card-students-mgmt':'users','card-school-attendance-stats':'chartBar',
    'card-family-mgmt':'family','card-inquiry-mgmt':'inbox','card-enrollments':'clipboard',
    'card-badges-mgmt':'award','card-community':'message','card-counseling-booking':'calClock',
    'card-parent-digest':'news','card-parent-faq-bot':'bot','card-referral':'gift',
    'card-alumni':'cap','card-gallery':'image',

    'card-review-quiz':'brain','card-textbooks':'bookOpen','card-microlearn':'book',
    'card-mini-toeic':'target','card-pronunciation':'mic','card-video-dict':'film',
    'card-voice-diary':'mic','card-level-tests':'gauge','card-battle-mgmt':'swords',
    'card-recording-storage':'drive','card-homework':'tasks',

    'card-lib-admin':'shield','card-lib-teacher':'userCheck','card-lib-branch':'building',
    'card-lib-agency':'store','card-lib-student':'backpack',

    'card-calendar':'calendar','card-permissions':'shield','card-franchises':'store',
    'card-centers':'building','card-data-export':'download','card-admin-alerts':'bell',
    'card-admin-ghost':'eye','card-admin-whisper':'whisper','card-attendance-status':'check',
    'card-auto-attendance':'scan','card-class-attendance':'file','card-report-forms':'file',

    'card-accounting-mgmt':'calc','card-payments-b2b':'card','card-payments-b2c':'card',
    'card-recurring-billing':'repeat','card-auto-dunning':'alert','card-settlement-stats':'pie',
    'card-points-mgmt':'coins',

    'card-teacher-mgmt':'userCheck','card-payroll':'money','card-payroll-auto':'sliders',
    'card-mbti-mgmt':'puzzle','card-praise-stats':'thumb','card-supervisor':'headset',
    'card-room-invite':'link','card-timetable':'grid','card-lesson-log':'file',
    'card-schedule-requests':'clock',

    'card-kpi-dashboard':'activity','card-daily-charts':'chartBar','card-rankings':'trophy',
    'card-retention-risk':'alert','card-retention':'trash','card-active-rooms':'video',
    'card-nps-monthly':'smile','card-ai-forecast':'trend','card-voice-stats':'mic',

    'card-eval-mgmt':'clipboard','card-bulk-eval':'tasks','card-ai-lesson-report':'file',
    'card-ai-eval-draft':'file','card-monthly-report':'news','card-comparison-report':'chartBar',

    'card-webpush-mgmt':'bell','card-kakao-mgmt':'send','card-popups-mgmt':'layers',
    'card-poster-maker':'palette','card-notifications':'bell','card-notice-board':'megaphone',

    'card-bug-reports':'bug','card-class-audit':'search','card-class-ratings':'starLine',
    'card-vc-quality':'video',

    // 본문 카드 헤더까지 아이콘을 붙이며 채운 나머지(26-07-22) — 헤더에 아이콘이
    // 있는 카드와 없는 카드가 섞이면 오히려 더 산만해지므로 88개 전부 매핑한다.
    'card-ai-insights':'bot','card-auto-schedule':'grid','card-classroom-test':'gauge',
    'card-daily-briefing':'news','card-leveltest':'gauge','card-monthly-ai-report':'pie',
    'card-no-shows':'alert','card-selfscore':'trend','card-retention-center':'target'
  };

  function svg(key){
    var d = I[key] || I.dot;
    return '<svg class="mi-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
           'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  // 선행 이모지/기호 제거 — 한글·영문·숫자가 시작되기 전까지의 그림문자 구간만 벗긴다
  var LEAD = /^(?:[←-⯿⸀-⹿　-〿️‍\uD800-\uDFFF]|\s)+/;
  // 꼬리표 "⭐신규 / ★ 신규 / ⭐New"
  var NEWTAG = /\s*[★☆⭐]\s*(신규|New|NEW)\s*$/;

  function clean(s){
    if (!s) return s;
    return String(s).replace(NEWTAG, 'NEW').replace(LEAD, '').replace('NEW', '').trim();
  }
  function hadNew(s){ return NEWTAG.test(String(s || '')); }

  // ⚠️ el.textContent 로 판정하면 안 된다 — 먼저 실행된 adm-r25 가 붙인 토글('▸')이
  //    맨 끝에 끼어들어 NEWTAG 의 $ 앵커가 빗나간다(갤러리·숙제 관리에서 NEW 누락).
  //    직속 텍스트 노드만 이어붙여 판정한다.
  function ownText(el){
    var s = '';
    Array.prototype.forEach.call(el.childNodes, function(n){ if (n.nodeType === 3) s += n.nodeValue; });
    return s;
  }

  function decorateSub(el){
    if (el.__miIco) return;
    el.__miIco = true;

    var isNew = hadNew(ownText(el)) || hadNew(el.getAttribute('data-ko'));

    // i18n 사전이 되돌려 놓지 못하도록 속성까지 함께 정리
    ['data-ko','data-en'].forEach(function(a){
      var v = el.getAttribute(a);
      if (v) el.setAttribute(a, clean(v));
    });

    // 텍스트 노드만 손질 — 자식 span(.ph125-toggle 등)은 건드리지 않는다
    var touched = false;
    Array.prototype.forEach.call(el.childNodes, function(n){
      if (n.nodeType !== 3 || !n.nodeValue.trim()) return;
      if (!touched) { n.nodeValue = ' ' + clean(n.nodeValue); touched = true; }
      else n.nodeValue = n.nodeValue.replace(NEWTAG, '');
    });

    var key = MAP[el.getAttribute('data-card')] || 'dot';
    var holder = document.createElement('span');
    holder.className = 'mi-ico-wrap';
    holder.innerHTML = svg(key);
    el.insertBefore(holder, el.firstChild);

    if (isNew) {
      var tag = document.createElement('span');
      tag.className = 'mi-new';
      tag.textContent = 'NEW';
      var star = el.querySelector('.mi-new-anchor');
      el.insertBefore(tag, star || el.querySelector('.ph125-toggle') || null);
    }
  }

  function decorateGc(el){
    if (el.__miGc) return;
    el.__miGc = true;
    var t = el.querySelector('.ph125-text');
    if (t) t.textContent = clean(t.textContent) || t.textContent;
  }

  // ── 본문 카드 헤더(<summary>) — 사이드바와 같은 단색 선 아이콘으로 통일 (26-07-22)
  //    사이드바가 이미 선 아이콘인데 헤더만 컬러 이모지라 톤이 어긋났고,
  //    88개가 한 화면에 쌓이면 눈이 피로했다. 이모지는 벗기고 같은 아이콘을 붙인다.
  function decorateHeader(det){
    if (det.__miHd) return;
    var sm = det.querySelector(':scope > summary');
    if (!sm) return;
    det.__miHd = true;

    // 라벨 후보: data-ko 를 가진 첫 span, 없으면 summary 자신
    var target = sm.querySelector('span[data-ko]') || sm;

    ['data-ko','data-en'].forEach(function(a){
      var v = target.getAttribute && target.getAttribute(a);
      if (v) target.setAttribute(a, clean(v));
    });

    // 첫 번째 실텍스트 노드에서만 선행 이모지를 벗긴다(뱃지·카운터 span 은 보존)
    (function strip(node){
      for (var i = 0; i < node.childNodes.length; i++) {
        var n = node.childNodes[i];
        if (n.nodeType === 3 && n.nodeValue.trim()) { n.nodeValue = clean(n.nodeValue); return true; }
        if (n.nodeType === 1 && strip(n)) return true;
      }
      return false;
    })(target);

    var key = MAP[det.id];
    if (!key) return;                       // 매핑 없는 카드는 아이콘 없이 텍스트만
    var holder = document.createElement('span');
    holder.className = 'mi-hd-ico';
    holder.innerHTML = svg(key);
    sm.insertBefore(holder, sm.firstChild);
  }

  function run(){
    document.querySelectorAll('details.menu-card[id^="card-"]').forEach(decorateHeader);
    var bar = document.getElementById('ph85-sidebar');
    if (!bar) return false;
    var subs = bar.querySelectorAll('.ph85-sub');
    if (!subs.length) return false;
    subs.forEach(decorateSub);
    bar.querySelectorAll('.ph125-gc').forEach(decorateGc);
    return true;
  }

  function runHeaders(){
    document.querySelectorAll('details.menu-card[id^="card-"]').forEach(decorateHeader);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  // 손자 메뉴(adm-r25)는 나중에 생성되므로 정착 루프로 따라간다
  if (window.__admSettleRun) window.__admSettleRun(run);
  else { var t = setInterval(run, 600); setTimeout(function(){ clearInterval(t); }, 15000); }

  // 카드 일부(card-retention-center 등)는 15초 정착 루프가 끝난 뒤에 주입돼
  // 헤더 이모지가 그대로 남았다 → 옵저버로 끝까지 따라간다.
  // ⚠️ decorateHeader 가 summary 안에 아이콘을 넣으므로 옵저버가 자기 변경에
  //    재귀 반응한다. __miHd 가드 + 디바운스로 루프를 끊는다(재작성 주의).
  // ⚠️ 디바운스에 requestAnimationFrame 을 쓰면 안 된다 — 관리자 탭이 백그라운드일 때
  //    rAF 가 멈춰 카드가 주입돼도 아이콘이 영영 안 붙는다. setTimeout 유지할 것.
  try {
    var pending = false;
    new MutationObserver(function(){
      if (pending) return;
      pending = true;
      setTimeout(function(){ pending = false; runHeaders(); }, 50);
    }).observe(document.body, { childList: true, subtree: true });
  } catch(e){}
})();
