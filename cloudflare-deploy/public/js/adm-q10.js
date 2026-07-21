// ═══════════════════════════════════════════════════════════════
// adm-q10.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // === 권한 매트릭스 (메뉴 × 7역할) ===
  // V=허용, R=읽기전용, 없음=차단
  // role: exec, mgr, teacher, branch, agency, parent, student
  var PERMS = {
    // === 상단 대시보드 — 경영진·관리자 전용 ===
    'card-ai-insights':            {exec:'V', mgr:'V'},
    // === 평가서 통합 ===
    'card-eval-mgmt':              {exec:'V', mgr:'V', teacher:'V', branch:'R'},
    'card-bulk-eval':              {exec:'V', mgr:'V', teacher:'V'},
    'card-ai-lesson-report':       {exec:'V', mgr:'V', teacher:'V', parent:'R', student:'R'},
    'card-ai-eval-draft':          {exec:'V', mgr:'V', teacher:'V'},
    'card-monthly-report':         {exec:'V', mgr:'V', teacher:'V', branch:'V', agency:'V', parent:'V', student:'V'},
    'card-comparison-report':      {exec:'V', mgr:'V', teacher:'V', parent:'V'},

    // === 알림 센터 ===
    'card-webpush-mgmt':           {exec:'V', mgr:'V'},
    'card-kakao-mgmt':             {exec:'V', mgr:'V'},
    'card-popups-mgmt':            {exec:'V', mgr:'V', branch:'R'},
    'card-poster-maker':           {exec:'V', mgr:'V', branch:'R'},
    'card-notifications':          {exec:'V', mgr:'V', teacher:'V', branch:'V', agency:'V', parent:'R', student:'R'},
    'card-notice-board':           {exec:'V', mgr:'V', teacher:'R', branch:'R', agency:'R', parent:'R', student:'R'},

    // === 강사 통합 ===
    'card-teacher-mgmt':           {exec:'V', mgr:'V', branch:'R', agency:'R'},
    'card-payroll-auto':           {exec:'V', mgr:'V'},
    'card-payroll':                {exec:'V', mgr:'R', branch:'R'},
    'card-mbti-mgmt':              {exec:'V', mgr:'V', teacher:'V'},
    'card-praise-stats':           {exec:'V', mgr:'V', teacher:'V', branch:'V', agency:'V', parent:'R'},
    'card-supervisor':             {exec:'V', mgr:'V', branch:'R'},
    'card-room-invite':            {exec:'V', mgr:'V', teacher:'V', agency:'V'},
    'card-timetable':              {exec:'V', mgr:'V', teacher:'V', branch:'V', agency:'V', parent:'V', student:'V'},
    'card-lesson-log':             {exec:'V', mgr:'V', teacher:'V', parent:'V', student:'V'},
    'card-report-forms':           {exec:'V', mgr:'V', teacher:'V', branch:'V', agency:'V'},

    // === 통계 / KPI ===
    'card-kpi-dashboard':          {exec:'V', mgr:'V'},
    'card-daily-charts':           {exec:'V', mgr:'V', branch:'V', agency:'V'},
    'card-rankings':               {exec:'V', mgr:'V', branch:'V', agency:'V', student:'V'},
    'card-retention-risk':         {exec:'V', mgr:'V', branch:'V', agency:'V'},
    'card-retention':              {exec:'V', mgr:'V', branch:'R', agency:'R'},
    'card-active-rooms':           {exec:'V', mgr:'V', branch:'V'},
    'card-nps-monthly':            {exec:'V', mgr:'V'},
    'card-ai-forecast':            {exec:'V', mgr:'V'},
    'card-voice-stats':            {exec:'V', mgr:'V'},

    // === 회계 / 포인트 ===
    'card-accounting-mgmt':        {exec:'V', mgr:'V'},
    'card-payments-b2b':           {exec:'V', mgr:'V', branch:'V'},
    'card-payments-b2c':           {exec:'V', mgr:'V', agency:'V', parent:'R'},
    'card-recurring-billing':      {exec:'V', mgr:'V', agency:'V'},
    'card-auto-dunning':           {exec:'V', mgr:'V'},
    'card-settlement-stats':       {exec:'V', mgr:'V', branch:'V', agency:'V'},
    'card-points-mgmt':            {exec:'V', mgr:'V', student:'V', parent:'R'},

    // === 학생 / 학부모 ===
    'card-students-mgmt':          {exec:'V', mgr:'V', teacher:'V', branch:'V', agency:'V'},
    'card-family-mgmt':            {exec:'V', mgr:'V', agency:'V', parent:'V'},
    'card-inquiry-mgmt':           {exec:'V', mgr:'V', agency:'V'},
    'card-enrollments':            {exec:'V', mgr:'V', agency:'V'},
    'card-badges-mgmt':            {exec:'V', mgr:'V', teacher:'V', student:'V'},
    'card-community':              {exec:'V', mgr:'V', teacher:'V', parent:'V', student:'V'},
    'card-counseling-booking':     {exec:'V', mgr:'V', teacher:'V', agency:'V', parent:'V'},
    'card-parent-digest':          {exec:'V', mgr:'V', parent:'V'},
    'card-parent-faq-bot':         {exec:'V', mgr:'V', parent:'V'},
    'card-referral':               {exec:'V', mgr:'V', agency:'V', parent:'V'},
    'card-alumni':                 {exec:'V', mgr:'V', student:'V'},
    'card-gallery':                {exec:'V', mgr:'V', teacher:'V', agency:'V', parent:'V', student:'V'},

    // === 교육 / 콘텐츠 ===
    'card-textbooks':              {exec:'V', mgr:'V', teacher:'V', student:'V'},
    'card-microlearn':             {exec:'V', mgr:'V', teacher:'V', student:'V'},
    'card-mini-toeic':             {exec:'V', mgr:'V', teacher:'V', student:'V'},
    'card-pronunciation':          {exec:'V', mgr:'V', teacher:'V', student:'V'},
    'card-video-dict':             {exec:'V', mgr:'V', teacher:'V', student:'V'},
    'card-voice-diary':            {exec:'V', mgr:'V', teacher:'V', student:'V', parent:'R'},
    'card-level-tests':            {exec:'V', mgr:'V', teacher:'V', student:'V'},
    'card-battle-mgmt':            {exec:'V', mgr:'V', teacher:'V', student:'V'},
    'card-recording-storage':      {exec:'V', mgr:'V', teacher:'V', student:'V', parent:'R'},
    'card-homework':               {exec:'V', mgr:'V', teacher:'V', student:'V', parent:'V'},

    // === 시스템 ===
    'card-permissions':            {exec:'V', mgr:'R'},
    'card-franchises':             {exec:'V', mgr:'V'},
    'card-centers':                {exec:'V', mgr:'V', branch:'V'},
    'card-data-export':            {exec:'V', mgr:'V'},
    'card-test-seed':              {exec:'V'},
    'card-admin-alerts':           {exec:'V', mgr:'V'},
    'card-admin-ghost':            {exec:'V', mgr:'V'},
    'card-admin-whisper':          {exec:'V', mgr:'V', teacher:'V'},
    'card-attendance-status':      {exec:'V', mgr:'V', teacher:'V', branch:'V', agency:'V', parent:'V', student:'V'},
    'card-auto-attendance':        {exec:'V', mgr:'V', teacher:'V', agency:'V'},
    'card-class-attendance':       {exec:'V', mgr:'V', teacher:'V', agency:'V'},
    'card-school-attendance-stats':{exec:'V', mgr:'V', branch:'V', agency:'V'}
  };

  // === UID → ROLE 매핑 ===
  var UID_TO_ROLE = {
    'hq_exec':       'exec',
    'hq_mgr':        'mgr',
    'admin':         'exec',
    'cfo01':         'mgr',
    'ops_lead':      'mgr',
    'hq_t_001':      'teacher',
    'hq_teacher':    'teacher',
    'branch_busan':  'branch',
    'branch_daegu':  'branch',
    'agency_gn001':  'agency',
    'agency_sc002':  'agency',
    'parent_001':    'parent',
    'student_001':   'student'
  };

  // === 로그인 세션의 role 문자열 → PERMS 역할 키 정규화 ===
  //   (mangoi_admin_session.role 이 hq_exec·franchise·capitown 등 다양하게 저장되므로 표준 키로 매핑)
  var ROLE_NORM = {
    'exec':'exec', 'hq_exec':'exec', 'admin':'exec',
    'hq':'exec',   // 서버 scope 'hq' 원문(라벨 '본사·경영진') — 마이페이지 세션 주입이 이 값을 저장함
    'mgr':'mgr', 'hq_mgr':'mgr', 'manager':'mgr',
    'teacher':'teacher', 'hq_teacher':'teacher',
    'branch':'branch', 'franchise':'branch',
    'agency':'agency',
    'parent':'parent', 'student':'student',
    'capitown':'capitown'   // 캐피타운은 별도 게이트 사용 — 표준 회계권한은 미부여(현행 유지)
  };

  function getCurrentRole(){
    try {
      // ⚠️ 학생용 페이지 미리보기 역할 시뮬레이션(mangoi_user_role)은
      //   관리자 콘솔 사이드바 권한에는 적용하지 않는다 — '실제 로그인 역할'만 따른다.
      //   (예전엔 이 시뮬 값이 여기까지 새어들어와, 경영자 본인이 시뮬을 켜 두면
      //    회계/포인트 등 자기 메뉴가 통째로 사라지는 버그가 있었음. 2026-07-08 근본수정)
      var u = null;
      try { u = JSON.parse(localStorage.getItem('mangoi_admin_session') || 'null'); } catch(e){}
      if (!u || !u.uid) { try { u = JSON.parse(localStorage.getItem('admin_session') || 'null'); } catch(e){} }
      if (!u) return 'exec'; // 비로그인은 일단 전체 허용 (테스트)
      // 👑 (2026-07-13) 오너 계정 자가치유: 'admin'(대표) 세션에 마이페이지 주입('hq')이나
      //   옛 기본값('hq_mgr') 같은 잘못된 role 이 남아 있어도 항상 경영진으로 판정한다.
      //   ("권한 관리 메뉴가 나왔다가 사라진다" 신고의 근본 원인 — 로그인 경로마다 role 값이 달랐음)
      if (String(u.uid) === 'admin') return 'exec';
      // 1) 세션에 명시된 role 을 표준 키로 정규화 → 2) uid 매핑 → 3) 기본 exec
      var norm = ROLE_NORM[String(u.role || '').toLowerCase()];
      if (norm) return norm;
      return UID_TO_ROLE[u.uid] || 'exec';
    } catch(e){ return 'exec'; }
  }

  // 🔗 권한설정 표(mangoi_perm_matrix) ↔ ph118 연결 매핑
  var MATRIX_ROLE_KEY = { exec:'hq_exec', mgr:'hq_mgr', teacher:'hq_teacher', branch:'branch', agency:'agency', parent:'parent', student:'student' };
  var MATRIX_CARD_MAP = {
    // 📊 대시보드/통계·차트 — X 하면 차트류 전부 숨김
    'dashboard':        ['card-daily-charts','card-kpi-dashboard','card-rankings','card-retention-risk','card-retention','card-ai-forecast','card-nps-monthly','card-school-attendance-stats'],
    'today_kpi':        ['card-daily-charts','card-kpi-dashboard'],
    'kpi_dashboard':    ['card-kpi-dashboard','card-daily-charts','card-rankings','card-retention-risk','card-ai-forecast','card-school-attendance-stats'],
    'realtime_class':   ['card-active-rooms'],
    'finance_realtime': ['card-ai-insights'],
    'learning_insights':['card-ai-insights'],
    'marketing_studio': ['card-ai-insights'],
    'ai_insights_hub':  ['card-ai-insights'],
    'students_eval':    ['card-eval-mgmt','card-bulk-eval'],
    'students_list':    ['card-students-mgmt'],
    'students_self':    ['card-students-mgmt'],
    'students_unified': ['card-students-mgmt'],
    'ai_student_analysis':['card-students-mgmt'],
    'enrollment':       ['card-enrollments'],
    'teachers_list':    ['card-teacher-mgmt'],
    'teacher_payroll':  ['card-payroll','card-payroll-auto'],
    'student_payments': ['card-payments-b2c','card-payments-b2b'],
    'corpcard':         ['card-payments-b2b'],
    'financials':       ['card-accounting-mgmt','card-settlement-stats'],
    'refunds':          ['card-payments-b2c'],
    'accounting_reports':['card-settlement-stats','card-accounting-mgmt'],
    'recurring_billing':['card-recurring-billing'],
    'auto_dunning':     ['card-auto-dunning'],
    'points_gift':      ['card-points-mgmt'],
    'voice_coaching':   ['card-voice-stats'],
    'nps_survey':       ['card-nps-monthly'],
    'recordings_view':  ['card-recording-storage'],
    'textbooks':        ['card-textbooks'],
    'community':        ['card-notice-board'],
    'inquiries':        ['card-inquiry-mgmt'],
    'kakao_blast':      ['card-kakao-mgmt'],
    'permissions':      ['card-permissions'],
    'audit_log':        ['card-permissions'],
    'franchise_mgmt':   ['card-franchises','card-centers'],
    'all_schedules':    ['sm-all-schedules']
  };
  function ph118ApplyState(el, val, isCard){
    var H = isCard ? 'ph118-card-hidden' : 'ph118-hidden';
    var R = isCard ? 'ph118-card-readonly' : 'ph118-readonly';
    if (val === '✅') { el.classList.remove(H, R); }
    else if (val === '👁️' || val === '👁') { el.classList.remove(H); el.classList.add(R); }
    else { el.classList.add(H); el.classList.remove(R); }
  }

  // === 권한 매트릭스 적용 ===
  function ph118Apply(){
    var role = getCurrentRole();
    var statOk = 0, statRo = 0, statNo = 0;

    // 1) 사이드바 sub 권한 적용
    document.querySelectorAll('#ph85-sidebar .ph85-sub').forEach(function(sub){
      var cardId = sub.dataset.card;
      if (!cardId) return;
      var perms = PERMS[cardId];
      if (!perms) {
        sub.classList.remove('ph118-hidden', 'ph118-readonly');
        statOk++;
        return;
      }
      var p = perms[role];
      if (p === 'V') {
        sub.classList.remove('ph118-hidden', 'ph118-readonly');
        statOk++;
      } else if (p === 'R') {
        sub.classList.remove('ph118-hidden');
        sub.classList.add('ph118-readonly');
        statRo++;
      } else {
        sub.classList.add('ph118-hidden');
        sub.classList.remove('ph118-readonly');
        statNo++;
      }
    });

    // 2) 본문 카드 권한 적용
    Object.keys(PERMS).forEach(function(cardId){
      var card = document.getElementById(cardId);
      if (!card) return;
      var perms = PERMS[cardId];
      var p = perms[role];
      if (p === 'V') {
        card.classList.remove('ph118-card-hidden', 'ph118-card-readonly');
      } else if (p === 'R') {
        card.classList.remove('ph118-card-hidden');
        card.classList.add('ph118-card-readonly');
      } else {
        card.classList.add('ph118-card-hidden');
        card.classList.remove('ph118-card-readonly');
      }
    });

    // 2.5) 🔗 권한설정 표(mangoi_perm_matrix)를 실제 차단에 적용 — 표에서 바꾸면 반영
    try {
      var savedMx = JSON.parse(localStorage.getItem('mangoi_perm_matrix') || 'null');
      if (savedMx) {
        var mkey = MATRIX_ROLE_KEY[role] || 'hq_exec';
        // (a) 시맨틱 id → 여러 카드 묶음 적용
        Object.keys(MATRIX_CARD_MAP).forEach(function(fid){
          var rowVal = savedMx[fid] && savedMx[fid][mkey];
          if (!rowVal) return;
          MATRIX_CARD_MAP[fid].forEach(function(cardId){
            var card = document.getElementById(cardId);
            if (card) ph118ApplyState(card, rowVal, true);
            document.querySelectorAll('#ph85-sidebar .ph85-sub[data-card="'+cardId+'"]').forEach(function(sub){ ph118ApplyState(sub, rowVal, false); });
          });
        });
        // (b) 🆕 'card-…' id 행 → 해당 카드에 1:1 자동 적용 (표 확장분 전부 반영)
        Object.keys(savedMx).forEach(function(fid){
          if (fid.indexOf('card-') !== 0) return;
          var rowVal = savedMx[fid] && savedMx[fid][mkey];
          if (!rowVal) return;
          var card = document.getElementById(fid);
          if (card) ph118ApplyState(card, rowVal, true);
          document.querySelectorAll('#ph85-sidebar .ph85-sub[data-card="'+fid+'"]').forEach(function(sub){ ph118ApplyState(sub, rowVal, false); });
        });
      }
    } catch(e){}

    // 🔒 안전장치(2026-07-13): 경영진(exec)의 '🔐 권한 설정' 은 무슨 일이 있어도 절대 숨기지 않는다.
    //   과거 사고: 권한표에서 '권한 설정' 자체를 경영진도 ❌로 저장 → 편집기가 사라져 스스로 잠김.
    //   이제 저장된 매트릭스가 어떤 값이든, 경영진에게는 항상 권한설정 카드를 강제로 보이게 한다.
    if (role === 'exec') {
      var _permCard = document.getElementById('card-permissions');
      if (_permCard) _permCard.classList.remove('ph118-card-hidden', 'ph118-card-readonly');
      document.querySelectorAll('#ph85-sidebar .ph85-sub[data-card="card-permissions"]').forEach(function(sub){
        sub.classList.remove('ph118-hidden', 'ph118-readonly');
      });
    }

    // 3) 빈 그룹 hide (모든 sub 가 hide 되면 그룹 자체 hide)
    //    (2026-07-22) 인라인 display:none(예: 캐피타운 정산 역할 게이트)도 숨김으로 계산 +
    //    그룹 헤더 갯수 배지를 '실제 보이는 메뉴 수'로 동기화 ("8개라는데 1개만 보임" 혼란 해소)
    document.querySelectorAll('#ph85-sidebar .ph85-group').forEach(function(g){
      var subs = g.querySelectorAll('.ph85-sub');
      var visible = 0;
      subs.forEach(function(s){
        if (!s.classList.contains('ph118-hidden') && s.style.display !== 'none') visible++;
      });
      if (visible === 0) g.classList.add('ph118-empty');
      else g.classList.remove('ph118-empty');
      var cb = g.querySelector('.ph85-count-badge');
      if (cb && cb.textContent !== String(visible)) cb.textContent = visible;
    });

    // 4) ph116 배너에 권한 통계 추가
    var banner = document.getElementById('ph116-role-banner');
    if (banner && !banner.querySelector('.ph118-perm-stat')) {
      var stat = document.createElement('div');
      stat.className = 'ph118-perm-stat';
      stat.innerHTML =
        '<span class="ok">✅ ' + statOk + '</span>' +
        '<span class="ro">👁 ' + statRo + '</span>' +
        '<span class="no">❌ ' + statNo + '</span>';
      banner.appendChild(stat);
    } else if (banner) {
      var s = banner.querySelector('.ph118-perm-stat');
      s.innerHTML =
        '<span class="ok">✅ ' + statOk + '</span>' +
        '<span class="ro">👁 ' + statRo + '</span>' +
        '<span class="no">❌ ' + statNo + '</span>';
    }

    if (window.__ph118LastRole !== role) {
      console.log('[ph118] 권한 적용 — 역할:', role, '| 허용:', statOk, '읽기전용:', statRo, '차단:', statNo);
      window.__ph118LastRole = role;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph118Apply);
  else ph118Apply();
  (window.__admSettleRun ? window.__admSettleRun(ph118Apply) : setInterval(ph118Apply, 1000));  // ph116 보다 빠르게 (ph116=1.5s)

  console.log('[ph118] 권한 매트릭스 73 메뉴 × 7 역할 초기화 완료');
})();
